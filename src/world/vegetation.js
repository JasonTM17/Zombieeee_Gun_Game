/**
 * ============================================================================
 * VEGETATION — deterministic tree cover for the whole city (NIGHT 30 map).
 * ============================================================================
 * The park's existing hand-placed trees (city.js §PARK) stay untouched; this
 * module adds 54 MORE trees spread over all 7 districts so the world reads as
 * a tree-filled city instead of trees only inside the park fence.
 *
 * Contract:
 * - `createVegetation(scene, level, city)` — city is optional. Without it the
 *   plan degrades to a legacy-arena rim + the walkable area derived from `level`
 *   (headless / legacy world still gets trees).
 * - Placement is deterministic (module-local mulberry32 stream, fixed seed):
 *   reloads and debug runs plant the same trees.
 * - Every tree pushes an AABB `{minX,maxX,minZ,maxZ}` into `level.colliders`
 *   (the same format city.js uses): 0.7 × 0.7 m for the trunk. Nothing else
 *   is solid — canopies are overhead, exactly like the park's existing trees.
 * - Geometry is merged into TWO static meshes (trunks+branches, canopy), so the
 *   whole forest costs 2 draw calls. Shared base geometries + one material per
 *   mesh; no per-frame work. Nothing is disposed at runtime.
 * - Trees keep clear of buildings/props. Every spot passes the mandated
 *   `level.isBlocked(x, z, 0.8)` check; the builder actually uses a 1.2 m
 *   clearance so a 0.4 m player has a real lane around a 0.7 m trunk. Spawn
 *   pools are ≥ 6 m away, gate waypoints ≥ 3.5 m, story POIs ≥ 4 m (campfire
 *   8 m), and planted trees keep ≥ 5 m from each other. Band placement keeps
 *   them out of roads / house rows / narrow alleys.
 *
 * Placement bands were derived by reading city.js: safehouse compound aprons,
 * residential green strips between townhouse rows, commercial plaza edges and
 * the boundary-wall verge, hospital yard verges, park perimeter/interleaved
 * rows, docks shore + east boundary corridor, quarantine arena/sub-zone
 * perimeter. All coordinates are XZ meters in the same world space.
 *
 * POIs are mirrored from city.js `POIS` / missions.js (module-private there),
 * so keep this table in sync if the mission layout moves.
 *
 * @param {import("three").Scene} scene
 * @param {import("./level.js").Level} level
 * @param {import("./city.js").City=} city
 * @returns {{count: number, dead: number, trees: Array<{x: number, z: number,
 *   district: string, dead: boolean, scale: number}>, meshes: import("three").Mesh[]}}
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// --- tunables ---------------------------------------------------------------

const SEED = 0x5eed7e33; // fixed seed → same forest every run
const TRUNK_COLLIDER = 0.7; // task: trunk AABB 0.7 × 0.7 m
const MIN_SPAWN_DIST = 6; // task: ≥ 6 m from every spawn point
const MIN_GATE_DIST = 3.5; // task: ≥ 3 m from every gate
const MIN_TREE_GAP = 5; // trunk-to-trunk spacing between planted trees
const BOUNDS_MARGIN = 2; // keep trunks this far inside district bounds
// The task's required `isBlocked(x, z, 0.8)` check leaves a 0.45 m gap once the
// 0.7 m trunk is accounted for. We plant with a slightly larger radius so a
// 0.4 m player always has a real 0.85 m lane around a trunk; every placement
// still satisfies the mandated 0.8 m check.
const CLEARANCE_R = 1.2;

// Keep-clear rect: pond 26×16 at (53, 78) + 3 m bank (city.js §PARK). Trees
// would stand in the water / on the shore path otherwise.
const POND = { minX: 37, maxX: 69, minZ: 67, maxZ: 89 };

/**
 * Story POIs — a private copy of city.js `POIS` (coords identical) plus a
 * radii tuned per prop: generators/cans/medkits need interaction space, the
 * campfire needs its fire ring, the vault door needs the mission-9 approach.
 * @type {Array<{id: string, x: number, z: number, r: number}>}
 */
const POIS = [
  { id: "generator-1", x: -89, z: -15, r: 4 },
  { id: "generator-2", x: -61, z: -15, r: 4 },
  { id: "generator-3", x: -75, z: 15, r: 4 },
  { id: "supply-1", x: -120, z: -123, r: 4 },
  { id: "supply-2", x: -30, z: -100, r: 4 },
  { id: "supply-3", x: -70, z: -45, r: 4 },
  { id: "radio-tower", x: 55, z: -95, r: 5 },
  { id: "medicine-1", x: 59, z: -6, r: 4 },
  { id: "medicine-2", x: 59, z: 6, r: 4 },
  { id: "medicine-3", x: 76, z: 4, r: 4 },
  { id: "campfire", x: 10, z: 70, r: 8 }, // fire ring + interaction radius
  { id: "fuel-1", x: -120, z: 40, r: 4 },
  { id: "fuel-2", x: -30, z: 120, r: 4 },
  { id: "fuel-3", x: -90, z: 90, r: 4 },
  { id: "fuel-4", x: -45, z: 55, r: 4 },
  { id: "final-door", x: 0, z: 0, r: 6 }, // vault disc + approach
];

/**
 * Per-district planting plan. `bands` are open XZ rectangles where trees may
 * stand (trunk center), chosen from the real city.js layout. The generator
 * interleaves bands so one row cannot eat the whole quota, then falls back to
 * a denser pass if a district is tighter than expected.
 *
 * Counts: 54 total (46 live + 8 dead ≈ 15 %). The park's existing tree grid
 * stays as-is, so the park gains 8 more trees on top of it.
 *
 * @type {Array<{id: string, count: number, dead: number,
 *   bands: Array<{minX: number, maxX: number, minZ: number, maxZ: number}>}>}
 */
const DISTRICT_PLANS = [
  {
    id: "safehouse",
    count: 7,
    dead: 1,
    bands: [
      // West apron (outside the compound, around the old car / crates).
      { minX: -127, maxX: -98, minZ: -27, maxZ: -3 },
      // North-west verge above the compound wall.
      { minX: -126, maxX: -100, minZ: 6, maxZ: 27 },
      // North strip behind the sheds / watchtower.
      { minX: -100, maxX: -58, minZ: 23.5, maxZ: 27 },
      // East apron beside the compound gate (visible from the story spawn).
      { minX: -51, maxX: -34, minZ: 6, maxZ: 17 },
    ],
  },
  {
    id: "residential",
    count: 9,
    dead: 1,
    bands: [
      // Green strip between townhouse rows A (z −115) and B (z −85).
      { minX: -126, maxX: -22, minZ: -104, maxZ: -96 },
      // Verge along the south outer wall, below row A.
      { minX: -120, maxX: -45, minZ: -127, maxZ: -123.5 },
      // Sidewalk strip south of row C (houses end at z −50).
      { minX: -126, maxX: -22, minZ: -65, maxZ: -63.5 },
      // Narrow east corridor beside the commercial boundary (x = −15);
      // stops short of the main street (z −74..−66) and row-C houses.
      { minX: -27, maxX: -20, minZ: -90, maxZ: -76 },
    ],
  },
  {
    id: "commercial",
    count: 8,
    dead: 1,
    bands: [
      // Verge along the hospital boundary wall, clear of the shop awnings.
      { minX: -10, maxX: 124, minZ: -58.5, maxZ: -55.5 },
      // Plaza north edge between the shop rows and the crates.
      { minX: 4, maxX: 124, minZ: -112, maxZ: -104 },
      // Plaza south lane (bus at z −80 stays free).
      { minX: 40, maxX: 124, minZ: -90, maxZ: -86 },
    ],
  },
  {
    id: "hospital",
    count: 7,
    dead: 1,
    bands: [
      // East verge between the main block (x ≤ 120) and the outer wall.
      { minX: 124.5, maxX: 128, minZ: -50, maxZ: 27 },
      // South yard verge (ambulance / triage tents stay behind the trunks).
      { minX: 58, maxX: 118, minZ: 22, maxZ: 27 },
      // North yard verge along the commercial boundary.
      { minX: 56, maxX: 118, minZ: -51, maxZ: -48 },
    ],
  },
  {
    id: "park",
    count: 8,
    dead: 1,
    bands: [
      // Interleaved row between the existing grid rows z 40 and z 65.
      { minX: 4, maxX: 124, minZ: 50, maxZ: 56 },
      // Interleaved row between the existing grid rows z 90 and z 115.
      { minX: 4, maxX: 124, minZ: 100, maxZ: 104 },
      // East perimeter walk (inside the ±130 wall).
      { minX: 124, maxX: 127, minZ: 40, maxZ: 124 },
      // South perimeter strip.
      { minX: 20, maxX: 120, minZ: 125, maxZ: 126.5 },
    ],
  },
  {
    id: "docks",
    count: 8,
    dead: 1,
    bands: [
      // North shore, below the safehouse boundary (containers start x −118).
      { minX: -108, maxX: -80, minZ: 36, maxZ: 40 },
      // East corridor along the park boundary (x = −15), away from G5.
      { minX: -23, maxX: -19.5, minZ: 42, maxZ: 112 },
      // Shoreline strip behind the bollards (z = 126).
      { minX: -110, maxX: -38, minZ: 124, maxZ: 125.2 },
      // West wall verge (boat at z 105 is kept clear by isBlocked).
      { minX: -127, maxX: -123, minZ: 60, maxZ: 115 },
    ],
  },
  {
    id: "quarantine",
    count: 7,
    dead: 2,
    bands: [
      // Four arena corners, 2.5 m off both walls.
      { minX: -27, maxX: -24.5, minZ: -27, maxZ: -24.5 },
      { minX: 24.5, maxX: 27, minZ: -27, maxZ: -24.5 },
      { minX: -27, maxX: -24.5, minZ: 24.5, maxZ: 27 },
      { minX: 24.5, maxX: 27, minZ: 24.5, maxZ: 27 },
      // Arena west/east rims between the spawn ring points.
      { minX: -27, maxX: -24.5, minZ: -21, maxZ: 21 },
      { minX: 24.5, maxX: 27, minZ: -21, maxZ: 21 },
      // North sub-zone side strips.
      { minX: -13, maxX: -10, minZ: -52, maxZ: -33 },
      { minX: 10, maxX: 13, minZ: -52, maxZ: -33 },
      // East sub-zone north-west corner (clear of the shelves).
      { minX: 48, maxX: 51, minZ: -13, maxZ: -11.5 },
    ],
  },
];

// --- deterministic toolkit --------------------------------------------------

/**
 * Seeded PRNG (mulberry32) — same generator city.js uses, but with a private
 * stream so city layout changes never reshuffle the forest.
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

/** Fisher–Yates shuffle in place (deterministic with the supplied rng). */
function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

/** Axis-aligned XZ collider from a center + full extents. */
function colliderOf(x, z, sx, sz) {
  return { minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 };
}

/** Flat per-vertex color attribute (pattern city.js tintGeo). */
function tintGeo(geo, color) {
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
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

// --- shared base geometries / materials -------------------------------------
// Clones are transformed per tree and merged once; the bases never enter the
// scene, so they are not uploaded and never need disposal.

const TRUNK_GEO = new THREE.CylinderGeometry(0.26, 0.38, 3.2, 6);
TRUNK_GEO.translate(0, 1.6, 0); // base on the ground plane

const BRANCH_GEO = new THREE.CylinderGeometry(0.055, 0.095, 1, 5);
BRANCH_GEO.translate(0, 0.5, 0); // base at the origin, grows +Y

const CANOPY_GEO = new THREE.IcosahedronGeometry(1, 0); // unit blob, scaled per layer

// City.js uses MeshStandardMaterial + vertexColors + flatShading for its park
// canopy; keep the same look so the new trees blend with the originals.
const TRUNK_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.95,
  metalness: 0,
});
const CANOPY_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.92,
  metalness: 0,
  flatShading: true,
});

// Canopy layers: radius, center height, vertical squash. Three icosahedra give
// the layered low-poly silhouette without any extra draw call.
const CANOPY_LAYERS = [
  { r: 2.0, y: 3.2, sy: 0.82 },
  { r: 1.6, y: 4.15, sy: 0.9 },
  { r: 1.18, y: 4.95, sy: 0.95 },
];

// --- helpers ----------------------------------------------------------------

/**
 * Every spawn point that matters: the 6 outer district pools (city) + the 18
 * legacy quarantine points (level.spawnPoints, includes the 6 zone points).
 * @param {any} city
 * @param {import("./level.js").Level} level
 * @returns {Array<{x: number, z: number}>}
 */
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
  return out;
}

/**
 * Every gate gap center: the 12 city gates (district records) + the 2 legacy
 * internal gates + the 12 registered city waypoints from level.
 * @param {any} city
 * @param {import("./level.js").Level} level
 * @returns {Array<{x: number, z: number}>}
 */
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
      /* legacy/mock level: gate list unavailable — district gates covered above */
    }
  }
  return out;
}

/**
 * Candidate trunk positions for one district: jittered grid per band, shuffled
 * inside each band, then interleaved band-by-band so trees spread out.
 * @param {Array<{minX: number, maxX: number, minZ: number, maxZ: number}>} bands
 * @param {number} step
 * @param {() => number} rng
 * @returns {Array<{x: number, z: number}>}
 */
function buildCandidates(bands, step, rng) {
  const perBand = [];
  for (const b of bands) {
    const list = [];
    // Narrow bands (a 1–2 m shoreline/verge strip) must still produce their
    // centre line — the usual 1.2 m inset would leave no row at all.
    const x0 = b.minX + Math.min(1.2, (b.maxX - b.minX) / 2);
    const x1 = b.maxX - Math.min(0.6, (b.maxX - b.minX) / 2);
    const z0 = b.minZ + Math.min(1.2, (b.maxZ - b.minZ) / 2);
    const z1 = b.maxZ - Math.min(0.6, (b.maxZ - b.minZ) / 2);
    for (let z = z0; z <= z1 + 1e-6; z += step) {
      for (let x = x0; x <= x1 + 1e-6; x += step) {
        list.push({
          x: x + (rng() - 0.5) * 2.4,
          z: z + (rng() - 0.5) * 2.4,
        });
      }
    }
    perBand.push(shuffle(list, rng));
  }
  const out = [];
  let more = true;
  for (let i = 0; more; i++) {
    more = false;
    for (const list of perBand) {
      if (i < list.length) {
        out.push(list[i]);
        more = true;
      }
    }
  }
  return out;
}

/**
 * Fallback planting area when no `city` is supplied: the AABB of the level's
 * own spawn points (arena ring + any currently unlocked zone points), expanded
 * 4 m and clamped to the city footprint. `plantDistrict` adds the legacy arena
 * rim on top so most trees still frame the fight space.
 * @param {import("./level.js").Level} level
 * @returns {{minX: number, maxX: number, minZ: number, maxZ: number}}
 */
function fallbackBounds(level) {
  let minX = -30;
  let maxX = 30;
  let minZ = -30;
  let maxZ = 30;
  if (level && Array.isArray(level.spawnPoints) && level.spawnPoints.length > 0) {
    minX = Infinity;
    maxX = -Infinity;
    minZ = Infinity;
    maxZ = -Infinity;
    for (const p of level.spawnPoints) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    if (!Number.isFinite(minX)) {
      minX = -30;
      maxX = 30;
      minZ = -30;
      maxZ = 30;
    } else {
      minX -= 4;
      maxX += 4;
      minZ -= 4;
      maxZ += 4;
    }
  }
  const LIMIT = 127;
  return {
    minX: Math.max(-LIMIT, minX),
    maxX: Math.min(LIMIT, maxX),
    minZ: Math.max(-LIMIT, minZ),
    maxZ: Math.min(LIMIT, maxZ),
  };
}

// --- main builder -----------------------------------------------------------

/**
 * Plant the extra forest. Two merged meshes, one collider per trunk.
 * @param {import("three").Scene} scene
 * @param {import("./level.js").Level} level
 * @param {import("./city.js").City=} city
 */
export function createVegetation(scene, level, city) {
  const rng = makeRng(SEED);
  const hasCity = !!(city && Array.isArray(city.districts) && city.districts.length > 0);
  const districts = hasCity ? city.districts : [];
  const spawns = collectSpawns(city, level);
  const gates = collectGates(city, level);
  const centers = [];
  if (hasCity) {
    for (const d of districts) {
      if (d && d.center && Number.isFinite(d.center.x) && Number.isFinite(d.center.z)) {
        centers.push({ x: d.center.x, z: d.center.z });
      }
    }
  }

  /** @type {Array<{x: number, z: number, district: string, dead: boolean, scale: number}>} */
  const trees = [];
  /** @type {THREE.BufferGeometry[]} */
  const trunkGeos = [];
  /** @type {THREE.BufferGeometry[]} */
  const canopyGeos = [];

  /**
   * All keep-clear tests for one candidate trunk position.
   * @param {number} x
   * @param {number} z
   * @param {{minX: number, maxX: number, minZ: number, maxZ: number}} bounds
   * @param {Array<{x: number, z: number}>} localSpots - already accepted in
   *   this district (not yet in `trees`, so they need their own gap check).
   * @returns {boolean}
   */
  function isFree(x, z, bounds, localSpots) {
    if (
      x < bounds.minX + BOUNDS_MARGIN || x > bounds.maxX - BOUNDS_MARGIN ||
      z < bounds.minZ + BOUNDS_MARGIN || z > bounds.maxZ - BOUNDS_MARGIN
    ) {
      return false;
    }
    // Pond (park) — trunks must never stand in the water or on its bank.
    if (x > POND.minX && x < POND.maxX && z > POND.minZ && z < POND.maxZ) return false;
    // Spawn pools / gates / story POIs / district drop points.
    if (!clearOf(spawns, x, z, MIN_SPAWN_DIST)) return false;
    if (!clearOf(gates, x, z, MIN_GATE_DIST)) return false;
    for (let i = 0; i < POIS.length; i++) {
      const p = POIS[i];
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz < p.r * p.r) return false;
    }
    if (!clearOf(centers, x, z, 5)) return false;
    // Space trees apart (cross-district too — `trees` is global; `localSpots`
    // covers the batch being built for the current district).
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      const dx = x - t.x;
      const dz = z - t.z;
      if (dx * dx + dz * dz < MIN_TREE_GAP * MIN_TREE_GAP) return false;
    }
    for (let i = 0; i < localSpots.length; i++) {
      const t = localSpots[i];
      const dx = x - t.x;
      const dz = z - t.z;
      if (dx * dx + dz * dz < MIN_TREE_GAP * MIN_TREE_GAP) return false;
    }
    // Existing geometry: buildings, walls, props, benches, parked cars, gate
    // barriers (city.js pushes those before returning). The task floor is
    // 0.8 m; CLEARANCE_R adds room for a 0.4 m player around a 0.7 m trunk.
    if (level && typeof level.isBlocked === "function" && level.isBlocked(x, z, CLEARANCE_R)) return false;
    return true;
  }

  /**
   * Build one live tree (trunk + 3 canopy layers) into the merge buckets.
   * @param {number} x
   * @param {number} z
   * @param {number} scale
   */
  function buildLiveTree(x, z, scale) {
    const trunk = TRUNK_GEO.clone();
    trunk.scale(0.95 * scale, scale, 0.95 * scale);
    trunk.rotateY(rng() * Math.PI * 2);
    trunk.translate(x, 0, z);
    tintGeo(trunk, new THREE.Color().setHSL(0.07 + rng() * 0.012, 0.3, 0.15 + rng() * 0.05));
    trunkGeos.push(trunk);

    const hue = 0.3 + rng() * 0.06;
    const sat = 0.32 + rng() * 0.12;
    for (let i = 0; i < CANOPY_LAYERS.length; i++) {
      const layer = CANOPY_LAYERS[i];
      const blob = CANOPY_GEO.clone();
      blob.scale(layer.r * scale, layer.r * layer.sy * scale, layer.r * scale);
      blob.rotateY(rng() * Math.PI * 2);
      blob.translate(x, layer.y * scale, z);
      tintGeo(
        blob,
        new THREE.Color().setHSL(
          hue + (rng() - 0.5) * 0.02,
          sat,
          0.11 + i * 0.012 + rng() * 0.02
        )
      );
      canopyGeos.push(blob);
    }
  }

  /**
   * Build one dead tree: bare trunk + 3 angled branches, same collider.
   * @param {number} x
   * @param {number} z
   * @param {number} scale
   */
  function buildDeadTree(x, z, scale) {
    const trunk = TRUNK_GEO.clone();
    trunk.scale(0.72 * scale, 1.1 * scale, 0.72 * scale);
    trunk.rotateY(rng() * Math.PI * 2);
    trunk.translate(x, 0, z);
    const bark = new THREE.Color().setHSL(0.08, 0.06, 0.13 + rng() * 0.04);
    tintGeo(trunk, bark);
    trunkGeos.push(trunk);

    const branchCount = 3;
    for (let i = 0; i < branchCount; i++) {
      const branch = BRANCH_GEO.clone();
      const len = 1.25 + rng() * 0.9;
      branch.scale(1.05 + rng() * 0.3, len, 1.05 + rng() * 0.3);
      branch.rotateZ(0.55 + rng() * 0.55); // lean out from the trunk
      branch.rotateY((i / branchCount) * Math.PI * 2 + rng() * 0.6);
      branch.translate(x, (2.1 + i * 0.55) * scale, z);
      tintGeo(branch, new THREE.Color().setHSL(0.08, 0.05, 0.1 + rng() * 0.04));
      trunkGeos.push(branch);
    }
  }

  /**
   * Plant one district up to its quota.
   * @param {string} id
   * @param {{minX: number, maxX: number, minZ: number, maxZ: number}} bounds
   * @param {number} target
   * @param {number} deadCount
   * @param {Array<{minX: number, maxX: number, minZ: number, maxZ: number}>} bands
   * @returns {number} trees actually planted in this district
   */
  function plantDistrict(id, bounds, target, deadCount, bands) {
    /** @type {Array<{x: number, z: number}>} */
    const spots = [];
    // Pass 1: roomy 7 m grid. Pass 2: denser 4 m grid if the district is tight.
    for (const step of [7, 4]) {
      const candidates = buildCandidates(bands, step, rng);
      for (let i = 0; i < candidates.length && spots.length < target; i++) {
        const p = candidates[i];
        if (!isFree(p.x, p.z, bounds, spots)) continue;
        spots.push(p);
      }
      if (spots.length >= target) break;
    }

    // Distribute dead trees evenly through the district's quota.
    const n = spots.length;
    const deadSet = new Set();
    if (n > 0 && deadCount > 0) {
      for (let j = 0; j < deadCount; j++) {
        deadSet.add(Math.min(n - 1, Math.floor(((j + 0.5) / deadCount) * n)));
      }
    }

    for (let i = 0; i < n; i++) {
      const p = spots[i];
      const dead = deadSet.has(i);
      const scale = (dead ? 0.82 : 0.86) + rng() * 0.3;
      if (dead) buildDeadTree(p.x, p.z, scale);
      else buildLiveTree(p.x, p.z, scale);
      trees.push({ x: p.x, z: p.z, district: id, dead, scale });
      // Same collider format/city.js push path: live tree trunks are solid.
      if (level && Array.isArray(level.colliders)) {
        level.colliders.push(colliderOf(p.x, p.z, TRUNK_COLLIDER, TRUNK_COLLIDER));
      }
    }
    return n;
  }

  // --- city-aware planting ---------------------------------------------------
  if (hasCity) {
    for (const plan of DISTRICT_PLANS) {
      let district = null;
      for (let i = 0; i < districts.length; i++) {
        if (districts[i] && districts[i].id === plan.id) {
          district = districts[i];
          break;
        }
      }
      if (!district || !district.bounds) continue;
      plantDistrict(plan.id, district.bounds, plan.count, plan.dead, plan.bands);
    }
  } else {
    // --- headless / city-less fallback --------------------------------------
    // The legacy world is the 60×60 quarantine arena (±30 walls) + its two
    // zones; the spawn AABB stretches to the zones, so the arena rim is added
    // explicitly. The derived perimeter strips still cover whatever walkable
    // area the level exposes beyond that. `isBlocked` rejects the rest.
    const bounds = fallbackBounds(level);
    const bands = [
      // Arena corners + side rims, 2.5 m inside the walls.
      { minX: -27, maxX: -23, minZ: -27, maxZ: -23 },
      { minX: 23, maxX: 27, minZ: -27, maxZ: -23 },
      { minX: -27, maxX: -23, minZ: 23, maxZ: 27 },
      { minX: 23, maxX: 27, minZ: 23, maxZ: 27 },
      { minX: -27, maxX: -23, minZ: -18, maxZ: 18 },
      { minX: 23, maxX: 27, minZ: -18, maxZ: 18 },
      { minX: -18, maxX: 18, minZ: -27, maxZ: -23 },
      { minX: -18, maxX: 18, minZ: 23, maxZ: 27 },
      // Level-derived perimeter (north/east zones in a legacy build).
      { minX: bounds.minX + 2, maxX: bounds.maxX - 2, minZ: bounds.minZ + 2, maxZ: bounds.minZ + 6 },
      { minX: bounds.minX + 2, maxX: bounds.maxX - 2, minZ: bounds.maxZ - 6, maxZ: bounds.maxZ - 2 },
      { minX: bounds.minX + 2, maxX: bounds.minX + 6, minZ: bounds.minZ + 2, maxZ: bounds.maxZ - 2 },
      { minX: bounds.maxX - 6, maxX: bounds.maxX - 2, minZ: bounds.minZ + 2, maxZ: bounds.maxZ - 2 },
    ];
    plantDistrict("level", bounds, 20, 3, bands);
  }

  // --- merge into 2 static meshes -------------------------------------------
  const meshes = [];
  /**
   * @param {THREE.BufferGeometry[]} geos
   * @param {THREE.Material} mat
   * @param {string} name
   */
  function addMerged(geos, mat, name) {
    if (geos.length === 0) return;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose(); // temp clones only — merged owns its data
    if (!merged) {
      console.warn("[vegetation] merge failed for " + name);
      return;
    }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = name;
    mesh.castShadow = true; // engine.js enables the shadow map (moon light)
    mesh.receiveShadow = true;
    mesh.userData.solid = true; // combat.js: trunks/crowns stop bullets
    meshes.push(mesh);
    if (scene && typeof scene.add === "function") scene.add(mesh);
  }
  addMerged(trunkGeos, TRUNK_MAT, "vegetation-trunks");
  addMerged(canopyGeos, CANOPY_MAT, "vegetation-canopy");

  // --- summary log (one line, deterministic) --------------------------------
  const perDistrict = {};
  let deadTotal = 0;
  for (const t of trees) {
    perDistrict[t.district] = (perDistrict[t.district] || 0) + 1;
    if (t.dead) deadTotal++;
  }
  const parts = [];
  for (const plan of DISTRICT_PLANS) {
    if (perDistrict[plan.id]) parts.push(plan.id + " " + perDistrict[plan.id]);
  }
  if (perDistrict.level) parts.push("level " + perDistrict.level);
  console.info(
    "[vegetation] " + trees.length + " trees (" + deadTotal + " dead): " + parts.join(", ")
  );

  return { count: trees.length, dead: deadTotal, trees, meshes };
}
