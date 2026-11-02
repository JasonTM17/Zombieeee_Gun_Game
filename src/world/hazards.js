/**
 * ============================================================================
 * HAZARDS — chain-reacting explosive barrels + gas canisters.
 * ============================================================================
 * A self-contained world layer over scenery.js: 13 red explosive barrels and 5
 * gas canisters at tactical spots across the safehouse, residential, commercial,
 * docks and quarantine districts. Every hazard is a small shared-geometry prop
 * with a pulsing orange hazard band, a 0.7 m AABB collider and a blast that can
 * chain into nearby hazards.
 *
 * Placement (deterministic, no runtime RNG for positions):
 *   - candidate tables per district, tried in order, quotas keep the spread
 *     across the city (safehouse 4 / residential 3 / commercial 2 / docks 2 /
 *     quarantine 2 barrels; one canister per district);
 *   - only inside a city district bounds rect (1.2 m margin);
 *   - never on a road corridor from docs/WORLD.md §5, in the park pond, or
 *     within 1.8 m of another hazard;
 *   - ≥ 8 m from every city/level spawn point + the story spawn (−75, 8);
 *   - ≥ 4 m from every city gate / legacy gate waypoint and mission POI
 *     (campfire 8 m, final door 6 m, radio tower 5 m);
 *   - `level.isBlocked(x, z, 0.9)` must be false (buildings, props, roads are
 *     colliders or road rects — see above);
 *   - each accepted hazard pushes its own {minX,maxX,minZ,maxZ} collider into
 *     `level.colliders`; detonation SPLICES that exact object back out, reset
 *     re-pushes it.
 *
 * Detonation:
 *   - listens "explosion" {position} (grenade launcher) and
 *     "throwable-exploded" {position, radius, kind}; a molotov is ignored
 *     (fire does not cook off sealed barrels), frag/mine do trigger.
 *   - a blast center within TRIGGER_RADIUS (3.5 m) of an intact hazard lights
 *     its fuse: 0.08–0.2 s, longer with distance, so simultaneous hits stagger;
 *   - a barrel blast is 4.5 m / 110 damage with linear falloff to 0 at the edge,
 *     applied to live zombies only through `zombie.takeDamage(dmg, false)`.
 *     The player is deliberately outside the damage loop (this module has no
 *     player reference).
 *   - every blast emits "hazard-exploded" {position, radius, damage, chain}
 *     (chain = true when the blast came from another hazard).
 *   - a blast chains to intact hazards within CHAIN_RADIUS (4.5 m), staggered
 *     by distance and capped at MAX_CHAIN_DEPTH (8). State flags (intact +
 *     pending) make loops impossible.
 *   - FX: particle burst + sparks + smoke, one short orange PointLight from a
 *     preallocated single-light pool (hidden until a blast, then toggled back
 *     out of the forward shader), and a flat dark
 *     scorch disc via a single InstancedMesh. No per-frame allocation and no
 *     per-frame raycasts.
 *
 * reset() restores every hazard (visible, intact, collider back), clears fuses,
 * lights and scorch marks. It runs on "ui-play"/"ui-restart"/"ui-quit" as a
 * safety net; main.js also calls it from freshRun().
 *
 * stats() returns a fresh {barrels, canisters, detonated, pending} snapshot.
 * `barrels`/`canisters` are the placed totals; `detonated` counts hazards that
 * have exploded since the last reset; `pending` counts lit fuses.
 *
 * Budget: 55 meshes (13×3 barrels + 5×3 canisters + 1 scorch InstancedMesh),
 * 5 shared materials (2 body colours + trim + hazard band + scorch), 1
 * PointLight (hidden unless a blast is fading, castShadow false), no geometry
 * creation in update, no extra shadow casters beyond the prop bodies.
 *
 * @param {import("three").Scene} scene
 * @param {EventTarget} bus
 * @param {import("./level.js").Level} level
 * @param {import("./city.js").City=} city
 * @param {import("../zombies/zombie.js").Zombie[]} zombies - SHARED live array
 * @param {import("../systems/particles.js").Particles=} particles
 * @returns {{update: (dt: number) => void,
 *   stats: () => {barrels: number, canisters: number, detonated: number, pending: number},
 *   reset: () => void, detonateAt: (x: number, z: number) => number}}
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// --- spec numbers -----------------------------------------------------------
const TRIGGER_RADIUS = 3.5; // m — incoming blast cooks off a barrel inside this
const BLAST_RADIUS = 4.5; // m — hazard blast radius
const BLAST_DAMAGE = 110; // damage at the center, linear to 0 at the edge
const CHAIN_RADIUS = 4.5; // m — blast-to-hazard chain radius
const MAX_CHAIN_DEPTH = 8; // chain generations after the first blast
const FUSE_MIN = 0.08; // s — closest / direct fuse
const FUSE_MAX = 0.2; // s — farthest fuse (staggered chain)

// --- placement rules --------------------------------------------------------
const SEED = 0x4a17c0de;
const BARREL_TARGET = 13;
const CANISTER_TARGET = 5;
const MIN_SPAWN_DIST = 8; // task: hazards ≥ 8 m from every spawn point
const MIN_GATE_DIST = 4; // task: ≥ 4 m from gates
const MIN_PROP_DIST = 1.8; // hazard-to-hazard spacing (allows chain clusters)
const PLACE_RADIUS = 0.9; // level.isBlocked test radius
const BOUNDS_MARGIN = 1.2; // keep props inside a district rect
const ROAD_PAD = 0; // road rects are already the full walkable corridor
const POND = { minX: 40, maxX: 66, minZ: 70, maxZ: 86 };
const POND_PAD = 1.5;
const PLAYER_SPAWN = { x: -75, z: 8 }; // story spawn (safehouse center)
const COLLIDER_BARREL = 0.7;
const COLLIDER_CANISTER = 0.55;

// --- FX ---------------------------------------------------------------------
const FLASH_TIME = 0.22; // s — explosion light fade
const FLASH_INTENSITY = 26;
const FLASH_POOL = 1; // ONE preallocated PointLight; visible only during a blast
const SCORCH_MAX = 20; // one InstancedMesh slot per possible hazard + slack

/**
 * One live hazard record. `band` is the per-hazard facing/scale handle for the
 * shared emissive material; `collider` is the exact object pushed into
 * level.colliders so detonation can splice it back out.
 * @typedef {Object} HazardRec
 * @property {"barrel"|"canister"} kind
 * @property {number} x
 * @property {number} z
 * @property {THREE.Group} group
 * @property {THREE.Mesh} band
 * @property {{minX: number, maxX: number, minZ: number, maxZ: number}} collider
 * @property {boolean} intact
 * @property {boolean} pending
 * @property {number} fuseT
 * @property {number} fuseTotal
 * @property {number} depth
 */

/**
 * Story POIs mirrored from city.js / scenery.js. Radii are the interaction
 * clearing used by the existing world layers; the task floor is 4 m.
 * @type {Array<{x: number, z: number, r: number}>}
 */
const POIS = [
  { x: -89, z: -15, r: 4 }, // generator-1
  { x: -61, z: -15, r: 4 }, // generator-2
  { x: -75, z: 15, r: 4 }, // generator-3
  { x: -120, z: -123, r: 4 }, // supply-1
  { x: -30, z: -100, r: 4 }, // supply-2
  { x: -70, z: -45, r: 4 }, // supply-3
  { x: 55, z: -95, r: 5 }, // radio tower (scenery clearance)
  { x: 59, z: -6, r: 4 }, // medicine-1
  { x: 59, z: 6, r: 4 }, // medicine-2
  { x: 76, z: 4, r: 4 }, // medicine-3
  { x: 10, z: 70, r: 8 }, // campfire
  { x: -120, z: 40, r: 4 }, // fuel-1
  { x: -30, z: 120, r: 4 }, // fuel-2
  { x: -90, z: 90, r: 4 }, // fuel-3
  { x: -45, z: 55, r: 4 }, // fuel-4
  { x: 0, z: 0, r: 6 }, // final door / vault
];

/**
 * Road corridors from docs/WORLD.md §5 — the city intentionally paints no road
 * mesh, so these rects are the only way to keep hazards off the driving lanes.
 * @type {Array<{minX: number, maxX: number, minZ: number, maxZ: number}>}
 */
const ROADS = [
  { minX: -55, maxX: -30, minZ: -4, maxZ: 4 }, // Trục Tây (safehouse gate)
  { minX: -76, maxX: -68, minZ: -66, maxZ: -30 }, // Vành Bắc Tây
  { minX: -130, maxX: -15, minZ: -74, maxZ: -66 }, // Trục Nhà Phố E-W
  { minX: -19, maxX: -11, minZ: -95, maxZ: -66 }, // G2 branch
  { minX: -30, maxX: -15, minZ: -54, maxZ: -30 }, // R-Q strip
  { minX: -15, maxX: 130, minZ: -62, maxZ: -50 }, // Trục Plaza E-W
  { minX: 28, maxX: 32, minZ: -115, maxZ: -75 }, // plaza N-S alley
  { minX: -15, maxX: 30, minZ: -99, maxZ: -91 }, // plaza → G2 branch
  { minX: 54, maxX: 76, minZ: -20, maxZ: 20 }, // hospital forecourt
  { minX: 54, maxX: 130, minZ: -54, maxZ: -46 }, // hospital ring → G3
  { minX: 54, maxX: 130, minZ: 22, maxZ: 30 }, // hospital ring → G4
  { minX: -15, maxX: 130, minZ: 30, maxZ: 38 }, // Lối Công Viên walk
  { minX: -15, maxX: -7, minZ: 60, maxZ: 90 }, // park N-S branch
  { minX: -26, maxX: -20, minZ: 30, maxZ: 68 }, // docks N-S (east)
  { minX: -74, maxX: -68, minZ: 30, maxZ: 68 }, // docks N-S (west)
  { minX: -130, maxX: -15, minZ: 60, maxZ: 68 }, // Trục Cảng E-W
];

/**
 * Barrel candidates, in acceptance order. The safehouse entries include a pair
 * 4 m apart: outside the 3.5 m direct trigger but inside the 4.5 m chain, so a
 * real grenade hit always demonstrates a chain reaction. Every coordinate is
 * an alley mouth, yard edge or plaza rim — never a road center.
 * @type {Array<{x: number, z: number, district: string}>}
 */
const BARREL_SPOTS = [
  // safehouse — compound apron corners + west wall pair
  { x: -50, z: -20, district: "safehouse" },
  { x: -50, z: 20, district: "safehouse" },
  { x: -102, z: -22, district: "safehouse" },
  { x: -98, z: -22, district: "safehouse" },
  { x: -100, z: 22, district: "safehouse" },
  // residential — alleys / back lanes / east edge
  { x: -118, z: -100, district: "residential" },
  { x: -100, z: -46, district: "residential" },
  { x: -46, z: -108, district: "residential" },
  { x: -70, z: -126, district: "residential" },
  { x: -34, z: -55, district: "residential" },
  // commercial — plaza edges (never the central lanes)
  { x: 46, z: -76, district: "commercial" },
  { x: 74, z: -74, district: "commercial" },
  { x: 16, z: -108, district: "commercial" },
  { x: 96, z: -114, district: "commercial" },
  { x: 104, z: -88, district: "commercial" },
  // docks — container yard / crane / south shore edges
  { x: -100, z: 56, district: "docks" },
  { x: -118, z: 72, district: "docks" },
  { x: -64, z: 56, district: "docks" },
  { x: -52, z: 118, district: "docks" },
  { x: -88, z: 118, district: "docks" },
  // quarantine — arena rim + north yard
  { x: 24, z: -24, district: "quarantine" },
  { x: -24, z: 26, district: "quarantine" },
  { x: 24, z: 26, district: "quarantine" },
  { x: -24, z: -24, district: "quarantine" },
  { x: 10, z: -48, district: "quarantine" },
];

/**
 * Gas canister candidates (smaller silhouette, same blast profile).
 * @type {Array<{x: number, z: number, district: string}>}
 */
const CANISTER_SPOTS = [
  // safehouse — compound tool apron
  { x: -58, z: -10, district: "safehouse" },
  { x: -90, z: 26, district: "safehouse" },
  { x: -113, z: 22, district: "safehouse" },
  // residential — row alley
  { x: -124, z: -95, district: "residential" },
  { x: -106, z: -82, district: "residential" },
  { x: -58, z: -82, district: "residential" },
  // commercial — plaza north rim
  { x: 26, z: -114, district: "commercial" },
  { x: 58, z: -106, district: "commercial" },
  { x: 104, z: -108, district: "commercial" },
  // docks — yard / south shore
  { x: -52, z: 118, district: "docks" },
  { x: -88, z: 118, district: "docks" },
  { x: -98, z: 74, district: "docks" },
  // quarantine — north yard + east store
  { x: -10, z: -48, district: "quarantine" },
  { x: 48, z: 10, district: "quarantine" },
  { x: 36, z: -10, district: "quarantine" },
];

/** Per-district barrel quota (sums to BARREL_TARGET). */
const BARREL_QUOTA = {
  safehouse: 4,
  residential: 3,
  commercial: 2,
  docks: 2,
  quarantine: 2,
};

/** One canister per outer district + quarantine. */
const CANISTER_QUOTA = {
  safehouse: 1,
  residential: 1,
  commercial: 1,
  docks: 1,
  quarantine: 1,
};

// --- deterministic toolkit --------------------------------------------------

/**
 * Seeded PRNG (mulberry32) — visual variation only; positions come from the
 * fixed candidate tables, so placement never depends on load order.
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Axis-aligned XZ collider from a center + full extents. */
function colliderOf(x, z, sx, sz) {
  return { minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 };
}

/** True when (x, z) is at least `minDist` from every point in `points`. */
function clearOf(points, x, z, minDist) {
  const m2 = minDist * minDist;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < m2) return false;
  }
  return true;
}

/** True when (x, z) lies inside one of the road rects (optionally padded). */
function inRoads(x, z, pad) {
  for (let i = 0; i < ROADS.length; i++) {
    const r = ROADS[i];
    if (
      x > r.minX - pad && x < r.maxX + pad &&
      z > r.minZ - pad && z < r.maxZ + pad
    ) {
      return true;
    }
  }
  return false;
}

/** Pond + bank. */
function inPond(x, z) {
  return (
    x > POND.minX - POND_PAD && x < POND.maxX + POND_PAD &&
    z > POND.minZ - POND_PAD && z < POND.maxZ + POND_PAD
  );
}

/** Every spawn point: city district pools + legacy level arena/zone points. */
function collectSpawns(city, level) {
  const out = [];
  if (city && Array.isArray(city.districts)) {
    for (const d of city.districts) {
      if (!d || !Array.isArray(d.spawnPoints)) continue;
      for (const p of d.spawnPoints) {
        if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) out.push({ x: p.x, z: p.z });
      }
    }
  }
  if (level && Array.isArray(level.spawnPoints)) {
    for (const p of level.spawnPoints) {
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) out.push({ x: p.x, z: p.z });
    }
  }
  out.push(PLAYER_SPAWN); // story spawn — must never share a yard with a barrel
  return out;
}

/** Every gate gap center: city district records + level gate waypoints. */
function collectGates(city, level) {
  const out = [];
  const seen = new Set();
  const add = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const key = x.toFixed(2) + ":" + z.toFixed(2);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ x, z });
  };
  if (city && Array.isArray(city.districts)) {
    for (const d of city.districts) {
      if (!d || !Array.isArray(d.gates)) continue;
      for (const g of d.gates) if (g) add(g.x, g.z);
    }
  }
  if (level && typeof level.getGateWaypoints === "function") {
    try {
      for (const g of level.getGateWaypoints()) if (g) add(g.x, g.z);
    } catch {
      /* mock level: city gate records above still cover it */
    }
  }
  return out;
}

/** True when (x, z) sits inside any city district bounds (1.2 m margin). */
function insideDistricts(districts, x, z) {
  if (!districts || districts.length === 0) return true; // level.isBlocked guards
  for (let i = 0; i < districts.length; i++) {
    const b = districts[i] && districts[i].bounds;
    if (!b) continue;
    if (
      x >= b.minX + BOUNDS_MARGIN && x <= b.maxX - BOUNDS_MARGIN &&
      z >= b.minZ + BOUNDS_MARGIN && z <= b.maxZ - BOUNDS_MARGIN
    ) {
      return true;
    }
  }
  return false;
}

// --- main builder -----------------------------------------------------------

/**
 * Build the hazard layer. Static meshes are created once; update() only walks
 * the (≤18) hazard records, ticks fuses and fades the one active blast light.
 * @param {import("three").Scene} scene
 * @param {EventTarget} bus
 * @param {import("./level.js").Level} level
 * @param {import("./city.js").City=} city
 * @param {import("../zombies/zombie.js").Zombie[]=} zombies
 * @param {import("../systems/particles.js").Particles=} particles
 */
export function createHazards(scene, bus, level, city, zombies, particles) {
  const rng = makeRng(SEED);
  const districts = city && Array.isArray(city.districts) ? city.districts : [];
  const spawns = collectSpawns(city, level);
  const gates = collectGates(city, level);
  const zombiesList = Array.isArray(zombies) ? zombies : [];
  const colliders =
    level && Array.isArray(level.colliders) ? level.colliders : null;
  const canQueryBlocked = !!(level && typeof level.isBlocked === "function");

  // --- shared geometry / material bank (page lifetime) ----------------------
  const root = new THREE.Group();
  root.name = "hazards";
  // Bullets are hitscan against level/scene props; these barrels are blast-only
  // props by design (combat.js skips a combatFx subtree).
  root.userData.combatFx = true;
  if (scene && typeof scene.add === "function") scene.add(root);

  // Barrel: body 0.9 m tall, two dark rim rings + cap, emissive hazard band.
  const barrelBodyGeo = new THREE.CylinderGeometry(0.33, 0.3, 0.88, 12);
  const barrelTrimGeo = (() => {
    const parts = [];
    for (const y of [0.2, 0.68]) {
      const rim = new THREE.CylinderGeometry(0.355, 0.355, 0.075, 12);
      rim.translate(0, y, 0);
      parts.push(rim);
    }
    const cap = new THREE.CylinderGeometry(0.285, 0.285, 0.04, 12);
    cap.translate(0, 0.9, 0);
    parts.push(cap);
    const merged = mergeGeometries(parts, false);
    if (!merged) {
      const fallback = new THREE.CylinderGeometry(0.355, 0.355, 0.075, 12);
      fallback.translate(0, 0.2, 0);
      for (const g of parts) g.dispose();
      return fallback;
    }
    for (const g of parts) g.dispose();
    return merged;
  })();
  const barrelBandGeo = (() => {
    const stripe = new THREE.CylinderGeometry(0.346, 0.346, 0.13, 12, 1, true);
    const lamp = new THREE.CylinderGeometry(0.085, 0.085, 0.06, 8);
    lamp.translate(0, 0.39, 0); // local: world y 0.89 with mesh.position.y 0.5
    const merged = mergeGeometries([stripe, lamp], false);
    if (!merged) {
      stripe.dispose();
      lamp.dispose();
      return new THREE.CylinderGeometry(0.346, 0.346, 0.13, 12, 1, true);
    }
    stripe.dispose();
    lamp.dispose();
    return merged;
  })();

  // Canister: smaller cylinder + valve stem/handle, same hazard band material.
  const canBodyGeo = new THREE.CylinderGeometry(0.22, 0.245, 0.68, 12);
  const canTrimGeo = (() => {
    const neck = new THREE.CylinderGeometry(0.06, 0.075, 0.12, 8);
    neck.translate(0, 0.74, 0);
    const handle = new THREE.BoxGeometry(0.24, 0.035, 0.04);
    handle.translate(0, 0.81, 0);
    const merged = mergeGeometries([neck, handle], false);
    if (!merged) {
      const fallback = new THREE.CylinderGeometry(0.06, 0.075, 0.12, 8);
      fallback.translate(0, 0.74, 0);
      neck.dispose();
      handle.dispose();
      return fallback;
    }
    neck.dispose();
    handle.dispose();
    return merged;
  })();
  const canBandGeo = (() => {
    const stripe = new THREE.CylinderGeometry(0.232, 0.232, 0.11, 12, 1, true);
    const lamp = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8);
    lamp.translate(0, 0.27, 0); // local: world y 0.71 with mesh.position.y 0.44
    const merged = mergeGeometries([stripe, lamp], false);
    if (!merged) {
      stripe.dispose();
      lamp.dispose();
      return new THREE.CylinderGeometry(0.232, 0.232, 0.11, 12, 1, true);
    }
    stripe.dispose();
    lamp.dispose();
    return merged;
  })();

  const barrelBodyMat = new THREE.MeshStandardMaterial({
    color: 0x9e2517,
    roughness: 0.58,
    metalness: 0.42,
    emissive: 0x2a0602,
    emissiveIntensity: 0.35,
  });
  const canBodyMat = new THREE.MeshStandardMaterial({
    color: 0xb43a18,
    roughness: 0.5,
    metalness: 0.5,
    emissive: 0x2a0702,
    emissiveIntensity: 0.35,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x1b1512,
    roughness: 0.52,
    metalness: 0.68,
  });
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0x2a0d02,
    emissive: 0xff7a14,
    emissiveIntensity: 1.15,
    roughness: 0.36,
    metalness: 0.2,
  });

  // --- scorch decals: ONE InstancedMesh, no per-blast mesh -------------------
  const scorchGeo = new THREE.CircleGeometry(1, 18);
  scorchGeo.rotateX(-Math.PI / 2);
  const scorchMat = new THREE.MeshBasicMaterial({
    color: 0x080604,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const scorchMesh = new THREE.InstancedMesh(scorchGeo, scorchMat, SCORCH_MAX);
  scorchMesh.name = "hazard-scorches";
  scorchMesh.count = 0;
  scorchMesh.frustumCulled = false;
  scorchMesh.castShadow = false;
  scorchMesh.receiveShadow = false;
  scorchMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(scorchMesh);
  const scorchDummy = new THREE.Object3D();
  let scorchCount = 0;

  // --- blast light pool: ONE preallocated, hidden until a blast ---------------
  /** @type {THREE.PointLight[]} */
  const flashLights = [];
  for (let i = 0; i < FLASH_POOL; i++) {
    const light = new THREE.PointLight(0xff8a3a, 0, 9, 2);
    light.name = "hazard-blast-light-" + i;
    light.castShadow = false; // explicit: no new shadow-casting lights
    light.visible = false; // idle light: keep it out of the forward shader
    light.position.set(0, 1, 0);
    root.add(light);
    flashLights.push(light);
  }
  let flashIndex = 0;
  let flashT = 0;
  let activeFlash = /** @type {THREE.PointLight|null} */ (null);

  // --- placement bookkeeping ------------------------------------------------
  /** @type {Array<{x: number, z: number, r: number}>} */
  const placed = [];
  /** @type {HazardRec[]} */
  const hazards = [];
  let barrelTotal = 0;
  let canisterTotal = 0;
  let detonatedCount = 0;
  let pendingCount = 0;
  let time = 0;

  // Scratch objects — the per-frame path allocates nothing.
  const blastPos = new THREE.Vector3();
  const upVec = new THREE.Vector3(0, 1, 0);

  /**
   * Full placement test for one candidate.
   * @param {number} x
   * @param {number} z
   * @returns {boolean}
   */
  function canPlace(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (!insideDistricts(districts, x, z)) return false;
    if (inPond(x, z)) return false;
    if (inRoads(x, z, ROAD_PAD)) return false;
    if (!clearOf(spawns, x, z, MIN_SPAWN_DIST)) return false;
    if (!clearOf(gates, x, z, MIN_GATE_DIST)) return false;
    for (let i = 0; i < POIS.length; i++) {
      const p = POIS[i];
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz < p.r * p.r) return false;
    }
    if (canQueryBlocked && level.isBlocked(x, z, PLACE_RADIUS)) return false;
    if (!clearOf(placed, x, z, MIN_PROP_DIST)) return false;
    return true;
  }

  /** Push the live collider (idempotent). */
  function addCollider(rec) {
    if (!colliders || !rec.collider) return;
    if (colliders.indexOf(rec.collider) === -1) colliders.push(rec.collider);
  }

  /** Splice this hazard's exact collider object out of level.colliders. */
  function removeCollider(rec) {
    if (!colliders || !rec.collider) return;
    const i = colliders.indexOf(rec.collider);
    if (i !== -1) colliders.splice(i, 1);
  }

  /**
   * Build one visible hazard at an already-validated spot.
   * @param {"barrel"|"canister"} kind
   * @param {number} x
   * @param {number} z
   */
  function spawnHazard(kind, x, z) {
    const barrel = kind === "barrel";
    const group = new THREE.Group();
    group.name = barrel ? "hazard-barrel" : "hazard-canister";
    group.userData.hazard = kind;
    group.position.set(x, 0, z);
    group.rotation.y = rng() * Math.PI * 2;

    const body = new THREE.Mesh(
      barrel ? barrelBodyGeo : canBodyGeo,
      barrel ? barrelBodyMat : canBodyMat
    );
    body.position.y = barrel ? 0.44 : 0.34;
    body.castShadow = true;
    body.receiveShadow = true;

    const trim = new THREE.Mesh(barrel ? barrelTrimGeo : canTrimGeo, trimMat);
    trim.castShadow = false;
    trim.receiveShadow = true;

    const band = new THREE.Mesh(
      barrel ? barrelBandGeo : canBandGeo,
      bandMat
    );
    band.position.y = barrel ? 0.5 : 0.44;
    band.castShadow = false;
    band.receiveShadow = false;

    group.add(body, trim, band);
    root.add(group);

    const size = barrel ? COLLIDER_BARREL : COLLIDER_CANISTER;
    const rec = {
      kind,
      x,
      z,
      group,
      band,
      collider: colliderOf(x, z, size, size),
      intact: true,
      pending: false,
      fuseT: 0,
      fuseTotal: 0,
      depth: 0,
    };
    hazards.push(rec);
    placed.push({ x, z, r: barrel ? 0.5 : 0.4 });
    addCollider(rec);
    if (barrel) barrelTotal++;
    else canisterTotal++;
  }

  /**
   * Accept candidates in order under a per-district quota; a second pass fills
   * any shortfall from the remaining candidates so the total stays in range on
   * future layout tweaks.
   * @param {Array<{x: number, z: number, district: string}>} spots
   * @param {"barrel"|"canister"} kind
   * @param {number} target
   * @param {Record<string, number>} quota
   */
  function placeAll(spots, kind, target, quota) {
    const counts = Object.create(null);
    const used = new Set();
    let total = 0;
    for (let i = 0; i < spots.length && total < target; i++) {
      const s = spots[i];
      const cap = quota[s.district] === undefined ? 0 : quota[s.district];
      const n = counts[s.district] || 0;
      if (n >= cap) continue;
      if (!canPlace(s.x, s.z)) continue;
      spawnHazard(kind, s.x, s.z);
      counts[s.district] = n + 1;
      used.add(s);
      total++;
    }
    // Layout-proof fallback: unused candidates may fill the remaining slots
    // (still subject to every placement rule, only the district quota relaxes).
    for (let i = 0; i < spots.length && total < target; i++) {
      const s = spots[i];
      if (used.has(s)) continue;
      if (!canPlace(s.x, s.z)) continue;
      spawnHazard(kind, s.x, s.z);
      used.add(s);
      total++;
    }
  }

  placeAll(BARREL_SPOTS, "barrel", BARREL_TARGET, BARREL_QUOTA);
  placeAll(CANISTER_SPOTS, "canister", CANISTER_TARGET, CANISTER_QUOTA);

  // --- damage / FX ----------------------------------------------------------
  /**
   * Linear-falloff XZ damage to live zombies. Explosion damage is never a
   * headshot; corpses and entries without the method are skipped.
   * @param {number} x
   * @param {number} z
   * @param {number} radius
   * @param {number} maxDamage
   */
  function damageZombies(x, z, radius, maxDamage) {
    const r2 = radius * radius;
    for (let i = 0; i < zombiesList.length; i++) {
      const zb = zombiesList[i];
      if (!zb || zb.alive !== true || !zb.position) continue;
      const dx = zb.position.x - x;
      const dz = zb.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r2) continue;
      const d = Math.sqrt(d2);
      const dmg = maxDamage * (1 - d / radius);
      if (dmg > 0 && typeof zb.takeDamage === "function") {
        zb.takeDamage(dmg, false);
      }
    }
  }

  /** Claim the pool light; zero every other light first (max 1 lit). */
  function flashAt(x, z) {
    const light = flashLights[flashIndex % FLASH_POOL];
    flashIndex = (flashIndex + 1) % FLASH_POOL;
    for (let i = 0; i < flashLights.length; i++) {
      flashLights[i].intensity = 0;
      flashLights[i].visible = false;
    }
    light.position.set(x, 1.15, z);
    light.intensity = FLASH_INTENSITY;
    light.visible = true; // single toggle in; update() toggles it back out
    activeFlash = light;
    flashT = FLASH_TIME;
  }

  /** Particle burst + flash at a blast center. */
  function blastFx(x, z) {
    blastPos.set(x, 0.55, z);
    if (particles) {
      if (typeof particles.spawnMuzzle === "function") {
        particles.spawnMuzzle(blastPos, upVec);
      }
      if (typeof particles.spawnSpark === "function") {
        particles.spawnSpark(blastPos);
        particles.spawnSpark(blastPos);
      }
      if (typeof particles.spawnSmoke === "function") {
        particles.spawnSmoke(blastPos, null, 2);
      }
    }
    flashAt(x, z);
  }

  /** Lay one scorch disc at (x, z); caps at the preallocated instance count. */
  function addScorch(x, z, scale) {
    if (scorchCount >= SCORCH_MAX) return;
    scorchDummy.position.set(x, 0.036, z);
    scorchDummy.rotation.set(0, 0, 0);
    scorchDummy.scale.set(scale, 1, scale);
    scorchDummy.updateMatrix();
    scorchMesh.setMatrixAt(scorchCount, scorchDummy.matrix);
    scorchCount++;
    scorchMesh.count = scorchCount;
    scorchMesh.instanceMatrix.needsUpdate = true;
  }

  // --- detonation / chaining ------------------------------------------------
  /**
   * Arm one hazard's fuse. Returns false when it is already dead or pending
   * (this is the loop guard for chain reactions).
   * @param {HazardRec} rec
   * @param {number} delay
   * @param {number} depth
   * @returns {boolean}
   */
  function scheduleDetonation(rec, delay, depth) {
    if (!rec || !rec.intact || rec.pending) return false;
    rec.pending = true;
    rec.fuseT = delay;
    rec.fuseTotal = delay;
    rec.depth = depth;
    rec.band.scale.setScalar(1);
    pendingCount++;
    return true;
  }

  /**
   * Schedule every intact hazard within `radius` of a blast center, staggered
   * by distance. Shared by bus blasts and chain reactions.
   * @param {number} x
   * @param {number} z
   * @param {number} radius
   * @param {number} depth
   * @returns {number} number of fuses lit
   */
  function triggerAt(x, z, radius, depth) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    const r2 = radius * radius;
    let lit = 0;
    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      if (!h.intact || h.pending) continue;
      const dx = h.x - x;
      const dz = h.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      const t = FUSE_MIN + (FUSE_MAX - FUSE_MIN) * Math.min(1, Math.sqrt(d2) / radius);
      if (scheduleDetonation(h, t, depth)) lit++;
    }
    return lit;
  }

  /**
   * Detonate one hazard: damage, FX, event, chain scheduling.
   * @param {HazardRec} rec
   */
  function detonate(rec) {
    if (!rec || !rec.intact) return;
    rec.intact = false;
    if (rec.pending) {
      rec.pending = false;
      pendingCount--;
    }
    detonatedCount++;
    rec.group.visible = false;
    removeCollider(rec);
    addScorch(rec.x, rec.z, rec.kind === "barrel" ? 1.05 : 0.8);
    damageZombies(rec.x, rec.z, BLAST_RADIUS, BLAST_DAMAGE);
    blastFx(rec.x, rec.z);

    if (bus && typeof bus.dispatchEvent === "function") {
      bus.dispatchEvent(
        new CustomEvent("hazard-exploded", {
          detail: {
            position: new THREE.Vector3(rec.x, 0.6, rec.z),
            radius: BLAST_RADIUS,
            damage: BLAST_DAMAGE,
            chain: rec.depth > 0,
          },
        })
      );
    }

    // Chain one generation deeper, never past MAX_CHAIN_DEPTH.
    if (rec.depth < MAX_CHAIN_DEPTH) {
      triggerAt(rec.x, rec.z, CHAIN_RADIUS, rec.depth + 1);
    }
  }

  // --- bus wiring -----------------------------------------------------------
  /** Grenade launcher blast. */
  function onExplosion(e) {
    const p = e && e.detail ? e.detail.position : null;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
    triggerAt(p.x, p.z, TRIGGER_RADIUS, 0);
  }

  /** Frag / mine blasts; a molotov is a fire pool, never a cook-off. */
  function onThrowableExploded(e) {
    const d = e && e.detail ? e.detail : null;
    if (!d) return;
    if (d.kind === "molotov") return;
    const p = d.position;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
    triggerAt(p.x, p.z, TRIGGER_RADIUS, 0);
  }

  if (bus && typeof bus.addEventListener === "function") {
    bus.addEventListener("explosion", onExplosion);
    bus.addEventListener("throwable-exploded", onThrowableExploded);
    // Fresh-run / menu safety: never inherit a lit fuse or a scorched yard.
    bus.addEventListener("ui-play", reset);
    bus.addEventListener("ui-restart", reset);
    bus.addEventListener("ui-quit", reset);
    // A pause/menu freeze stops update(), so kill the blast flash here instead
    // of leaving a PointLight stuck on behind the overlay.
    bus.addEventListener("state-changed", (e) => {
      const st = e && e.detail ? e.detail.state : null;
      if (st === "playing") return;
      flashT = 0;
      activeFlash = null;
      for (let i = 0; i < flashLights.length; i++) {
        flashLights[i].intensity = 0;
        flashLights[i].visible = false;
      }
    });
  }

  // --- per-frame update -----------------------------------------------------
  /**
   * Tick fuses, animate the pending-band flash and the shared pulse, fade the
   * one active blast light. No allocation, no raycasts.
   * @param {number} dt
   */
  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    time += dt;
    if (time > 10000) time = 0;

    // Intact barrels breathe; a live fuse makes the whole rack pulse faster.
    const pulseSpeed = pendingCount > 0 ? 9 : 2.4;
    const pulseAmp = pendingCount > 0 ? 0.95 : 0.3;
    bandMat.emissiveIntensity =
      1.1 + pulseAmp * (0.5 + 0.5 * Math.sin(time * pulseSpeed));

    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      if (!h.pending) continue;
      h.fuseT -= dt;
      const progress =
        h.fuseTotal > 0 ? 1 - Math.max(0, h.fuseT) / h.fuseTotal : 1;
      // Bright-looking "flash then hide": the band swells during the fuse.
      h.band.scale.setScalar(1 + 0.65 * progress);
      if (h.fuseT <= 0) detonate(h);
    }

    if (flashT > 0) {
      flashT -= dt;
      if (flashT <= 0) {
        flashT = 0;
        if (activeFlash) {
          activeFlash.intensity = 0;
          activeFlash.visible = false; // back out of the forward shader
        }
      } else if (activeFlash) {
        activeFlash.intensity = FLASH_INTENSITY * (flashT / FLASH_TIME);
      }
    }
  }

  // --- reset ----------------------------------------------------------------
  /** Restore every hazard, collider, scorch and light (fresh run). */
  function reset() {
    pendingCount = 0;
    detonatedCount = 0;
    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      h.intact = true;
      h.pending = false;
      h.fuseT = 0;
      h.fuseTotal = 0;
      h.depth = 0;
      h.band.scale.setScalar(1);
      h.group.visible = true;
      addCollider(h);
    }
    scorchCount = 0;
    scorchMesh.count = 0;
    scorchMesh.instanceMatrix.needsUpdate = true;
    flashT = 0;
    activeFlash = null;
    for (let i = 0; i < flashLights.length; i++) {
      flashLights[i].intensity = 0;
      flashLights[i].visible = false;
    }
    time = 0;
  }

  /** Fresh snapshot — callers may mutate it freely. */
  function stats() {
    return {
      barrels: barrelTotal,
      canisters: canisterTotal,
      detonated: detonatedCount,
      pending: pendingCount,
    };
  }

  /**
   * Debug helper: treat (x, z) as a blast center and light every hazard fuse
   * inside TRIGGER_RADIUS. Returns the number of fuses lit.
   * @param {number} x
   * @param {number} z
   * @returns {number}
   */
  function detonateAt(x, z) {
    return triggerAt(x, z, TRIGGER_RADIUS, 0);
  }

  return { update, stats, reset, detonateAt };
}
