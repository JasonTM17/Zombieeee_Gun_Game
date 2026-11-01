/**
 * ============================================================================
 * WILDLIFE — ambient, non-combat fauna for the night city.
 * ============================================================================
 * A pure atmosphere layer: crows on the rooftops/lamps/tree canopies, rats in
 * the alleys, and three stray dogs on the streets. Nothing here damages,
 * collides, blocks, drops loot or touches a quest — the module only owns
 * renderable meshes, small state machines and its own tiny WebAudio synth.
 *
 * Contract:
 *   createWildlife(scene, bus, level, city) -> { update(dt, playerPos), stats() }
 *   - scene / level / city may be missing or partial (legacy arena, headless
 *     harness): placement degrades to the arena perimeter + the level spawn
 *     AABB and nothing ever throws.
 *   - Deterministic layout: one private mulberry32 stream with a fixed seed,
 *     so reloads put the same birds/rats/dogs in the same spots.
 *   - Ground creatures (rats, dogs) only stand on points that pass
 *     level.isBlocked(x, z, 0.5), stay inside a district rectangle, outside
 *     the park pond, >= 6 m from every spawn point and >= 4 m from every gate.
 *     Crows perch on real city props (tree canopies found through the 0.8 x
 *     0.8 park / 0.7 x 0.7 vegetation tree colliders, the residential lamp
 *     heads, the safehouse and shop roofs) or on the arena wall tops when
 *     there is no city.
 *   - update() is allocation-free and frame-rate independent. Every creature
 *     is one small state machine advanced by a single loop over the array;
 *     wings / heads / tails are the only animated sub-meshes and all geometry
 *     and materials are shared and built once.
 *   - No colliders, no userData.solid, no castShadow. Meshes are visual only.
 *
 * Behaviour table
 * ---------------------------------------------------------------------------
 * CROWS (12)  perch -> take off -> fly away -> hidden -> new perch
 *             player < 12 m OR "fire" within 25 m triggers take-off.
 *             Idle head bob + slow head scan; occasional caw (ambient synth).
 *             Flight is a parametric curve (climb + sideways arc + bank);
 *             after 3.4-5.6 s the bird is hidden and respawns after 20-40 s.
 * RATS (10)   scuttle -> pause -> scuttle ... (fast waddle)
 *             player < 6 m OR "fire" within 15 m: dart 2-5 m while scaling to
 *             0 (a small dark drain/hole decal marks the escape) then hidden,
 *             respawns elsewhere after 10-25 s.
 * DOGS (3)    wander -> pause -> wander; flees the player (< 14 m) or gunfire
 *             (< 28 m). Persistent (no despawn), emaciated low-poly body.
 * AMBIENCE    own WebAudio synth, lazy after the first user gesture, volume
 *             follows the persisted "gungame.settings" + "settings-changed".
 *             Caw clusters near perched crows every 8-20 s, rare rat squeaks,
 *             distant dog barks every 20-50 s. Fully silent (never throws)
 *             without WebAudio / DOM.
 *
 * Budget: 12 crows x 4 meshes + 10 rats x 3 (body, tail, hole decal) + 3 dogs
 * x 2 = 84 meshes, one shared MeshStandardMaterial, 8 shared geometries. No
 * per-frame geometry, array or object allocation. Holes/dormant creatures are
 * `visible = false` so the live draw-call count stays lower than 84.
 *
 * Wiring (main.js — this module never edits it):
 *   import { createWildlife } from "./world/wildlife.js";
 *   // after `const scenery = createScenery(scene, level, city);`
 *   const wildlife = createWildlife(scene, bus, level, city);
 *   // in the "playing" branch, after scenery.update(...):
 *   wildlife.update(dt, player.position);
 *   // in the "menu" / "intro" branch, after scenery.update(...):
 *   wildlife.update(dt, player.position);
 *
 * Bus events consumed: "fire" {weapon} (distance-filtered scares), and
 * "settings-changed" {patch.volume}. Bus events emitted: none.
 *
 * @param {import("three").Scene} scene
 * @param {EventTarget} bus
 * @param {import("./level.js").Level} level
 * @param {import("./city.js").City=} city
 * @returns {{update: (dt: number, playerPos?: {x: number, z: number}) => void,
 *   stats: () => Record<string, number>}}
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// --- tunables ---------------------------------------------------------------

const SEED = 0x51de11fe; // fixed seed -> same fauna layout every run

const CROW_COUNT = 12; // task range 10-14
const RAT_COUNT = 10; // task range 8-12
const DOG_COUNT = 3; // task range 2-3

const CROW_PLAYER_FLEE = 12; // m
const CROW_GUN_FLEE = 25; // m
const CROW_CAW_NEAR = 45; // m — caw audibility / nearest-bird pick
const CROW_RESPAWN_MIN = 20; // s
const CROW_RESPAWN_MAX = 40; // s
const CROW_CLIMB_MIN = 5; // m — total altitude gain during take-off
const CROW_CLIMB_MAX = 12;
const CROW_FLY_DIST_MIN = 55; // m — horizontal escape distance ("off-map")
const CROW_FLY_DIST_MAX = 90;
const CROW_PERCH_MIN_Y = 3; // authored perch heights live in 3.3-5.8 m

const RAT_PLAYER_FLEE = 6; // m
const RAT_GUN_FLEE = 15; // m
const RAT_RESPAWN_MIN = 10; // s
const RAT_RESPAWN_MAX = 25; // s

const DOG_PLAYER_FLEE = 14; // m
const DOG_GUN_FLEE = 28; // m

const MIN_SPAWN_DIST = 6; // task: >= 6 m from every spawn point
const MIN_GATE_DIST = 4; // task: >= 4 m from every gate
const GROUND_RADIUS = 0.5; // mandated isBlocked clearance for ground creatures
const EDGE_PAD = 1.5; // keep placement off the district wall line
const POND = { minX: 37, maxX: 69, minZ: 67, maxZ: 89 }; // water + bank

/**
 * scenery.js barrel anchors. Its 0.7 x 0.7 collider is the only other 0.7 m
 * square in the world, so the vegetation-tree scan below skips these spots —
 * a crow must never be authored 3.9 m above a 0.9 m barrel.
 * @type {Array<[number, number]>}
 */
const BARREL_GUARD = [
  [-50, -17], [-50, 17], [-97, -17], [-27.5, -6], [27.5, 6], [-27.5, 22],
  [-122, 60], [-122, 115], [-30, 105], [-30, 45], [24, 24], [-118, 70],
];

/** @param {number} x @param {number} z @returns {boolean} */
function nearBarrel(x, z) {
  for (let i = 0; i < BARREL_GUARD.length; i++) {
    const dx = x - BARREL_GUARD[i][0];
    const dz = z - BARREL_GUARD[i][1];
    if (dx * dx + dz * dz < 4) return true;
  }
  return false;
}

const SETTINGS_KEY = "gungame.settings";
const TAU = Math.PI * 2;

// State ids (plain ints: no per-frame string work).
const CROW_PERCH = 0;
const CROW_FLY = 1;
const CROW_GONE = 2;
const RAT_SCUTTLE = 0;
const RAT_PAUSE = 1;
const RAT_DART = 2;
const RAT_HIDDEN = 3;
const DOG_PAUSE = 0;
const DOG_WALK = 1;
const DOG_FLEE = 2;

const CROW_STATE_NAMES = ["perch", "fly", "gone"];
const RAT_STATE_NAMES = ["scuttle", "pause", "dart", "hidden"];
const DOG_STATE_NAMES = ["pause", "walk", "flee"];

/**
 * Ground movement bands ("alleys / streets / docks"). Broad rectangles are
 * enough: every accepted point still has to pass the district + isBlocked
 * checks, so buildings and props carve themselves out.
 * @type {Array<{minX: number, maxX: number, minZ: number, maxZ: number}>}
 */
const SAFE_YARD = { minX: -127, maxX: -99, minZ: -27, maxZ: 27 };
const SAFE_EAST = { minX: -52, maxX: -33, minZ: -18, maxZ: 26 };
const RES_MAIN = { minX: -127, maxX: -18, minZ: -78, maxZ: -62 };
const RES_ALLEY = { minX: -127, maxX: -18, minZ: -96, maxZ: -82 };
const RES_SOUTH = { minX: -127, maxX: -18, minZ: -128, maxZ: -118 };
const RES_ROW_D = { minX: -127, maxX: -18, minZ: -52, maxZ: -34 };
const COM_PLAZA = { minX: -12, maxX: 126, minZ: -118, maxZ: -100 };
const COM_STREET = { minX: -12, maxX: 126, minZ: -92, maxZ: -60 };
const COM_EDGE = { minX: -12, maxX: 126, minZ: -128, maxZ: -124 };
const HOS_NORTH = { minX: 56, maxX: 128, minZ: -51, maxZ: -18 };
const HOS_SOUTH = { minX: 56, maxX: 128, minZ: 18, maxZ: 28 };
const PARK_LAWN = { minX: -12, maxX: 126, minZ: 33, maxZ: 128 };
const DOCKS_SHORE = { minX: -128, maxX: -18, minZ: 33, maxZ: 128 };
const QUAR_ARENA = { minX: -28, maxX: 28, minZ: -28, maxZ: 28 };
const QUAR_NORTH = { minX: -13, maxX: 13, minZ: -52, maxZ: -32 };
const QUAR_EAST = { minX: 32, maxX: 52, minZ: -13, maxZ: 13 };

const GROUND_BANDS = [
  SAFE_YARD,
  SAFE_EAST,
  RES_MAIN,
  RES_ALLEY,
  RES_SOUTH,
  RES_ROW_D,
  COM_PLAZA,
  COM_STREET,
  COM_EDGE,
  HOS_NORTH,
  HOS_SOUTH,
  PARK_LAWN,
  DOCKS_SHORE,
  QUAR_ARENA,
  QUAR_NORTH,
  QUAR_EAST,
];

// --- shared geometry toolkit ------------------------------------------------

/**
 * Seeded PRNG (mulberry32) — private stream so city/vegetation changes never
 * reshuffle the fauna.
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

/**
 * Flat per-vertex color on a geometry (pattern city.js / vegetation.js).
 * @param {THREE.BufferGeometry} geo
 * @param {THREE.Color} color
 * @returns {THREE.BufferGeometry}
 */
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

/**
 * Tinted translated box appended to a merge bucket.
 * @param {THREE.BufferGeometry[]} bucket
 * @param {number} sx
 * @param {number} sy
 * @param {number} sz
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} h - HSL hue
 * @param {number} s - HSL saturation
 * @param {number} l - HSL lightness
 * @returns {THREE.BufferGeometry}
 */
function pushBox(bucket, sx, sy, sz, x, y, z, h, s, l) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  geo.translate(x, y, z);
  bucket.push(tintGeo(geo, new THREE.Color().setHSL(h, s, l)));
  return geo;
}

/**
 * Merge a build bucket and release the temporary parts.
 * @param {THREE.BufferGeometry[]} parts
 * @returns {THREE.BufferGeometry}
 */
function mergeParts(parts) {
  const merged = mergeGeometries(parts, false);
  for (let i = 0; i < parts.length; i++) parts[i].dispose();
  if (!merged) {
    console.warn("[wildlife] geometry merge failed — using an empty part");
    return new THREE.BufferGeometry();
  }
  return merged;
}

// --- shared species geometry (built once per page) --------------------------

/** Crow body + neck + tail, facing +Z. Wings are separate for flapping. */
const CROW_BODY_GEO = (() => {
  const parts = [];
  pushBox(parts, 0.26, 0.22, 0.46, 0, 0, 0, 0.63, 0.34, 0.045); // body
  pushBox(parts, 0.2, 0.17, 0.18, 0, 0.05, 0.2, 0.63, 0.3, 0.055); // neck
  pushBox(parts, 0.15, 0.045, 0.34, 0, 0.03, -0.36, 0.62, 0.3, 0.035); // tail
  return mergeParts(parts);
})();

/** Crow head + beak (pivots at the neck). */
const CROW_HEAD_GEO = (() => {
  const parts = [];
  pushBox(parts, 0.17, 0.16, 0.18, 0, 0, 0, 0.63, 0.32, 0.055); // head
  pushBox(parts, 0.055, 0.045, 0.16, 0, -0.01, 0.15, 0.08, 0.12, 0.11); // beak
  return mergeParts(parts);
})();

/** One crow wing: pivot at x = 0, feathered plane extends +X. */
const CROW_WING_GEO = (() => {
  const parts = [];
  pushBox(parts, 0.44, 0.03, 0.22, 0.22, 0, 0, 0.63, 0.34, 0.05);
  pushBox(parts, 0.2, 0.025, 0.16, 0.48, 0, 0.01, 0.61, 0.32, 0.07);
  return mergeParts(parts);
})();

/** Rat body + head + ears + four legs, facing +Z. Tail is separate. */
const RAT_BODY_GEO = (() => {
  const parts = [];
  pushBox(parts, 0.15, 0.12, 0.28, 0, 0.1, 0, 0.08, 0.06, 0.26); // torso
  pushBox(parts, 0.11, 0.09, 0.13, 0, 0.115, 0.175, 0.08, 0.06, 0.3); // head
  pushBox(parts, 0.05, 0.04, 0.08, 0, 0.09, 0.26, 0.06, 0.08, 0.2); // snout
  pushBox(parts, 0.04, 0.05, 0.02, -0.05, 0.185, 0.14, 0.03, 0.24, 0.3); // ear L
  pushBox(parts, 0.04, 0.05, 0.02, 0.05, 0.185, 0.14, 0.03, 0.24, 0.3); // ear R
  for (const lx of [-0.058, 0.058]) {
    for (const lz of [-0.085, 0.085]) {
      pushBox(parts, 0.028, 0.08, 0.028, lx, 0.04, lz, 0.07, 0.06, 0.13);
    }
  }
  return mergeParts(parts);
})();

/** Rat tail: pivot at 0, thin and long along -Z. */
const RAT_TAIL_GEO = (() => {
  const parts = [];
  pushBox(parts, 0.022, 0.022, 0.32, 0, 0, -0.16, 0.03, 0.24, 0.25);
  return mergeParts(parts);
})();

/** Emaciated stray-dog body + long legs + ribs, facing +Z. */
const DOG_BODY_GEO = (() => {
  const parts = [];
  pushBox(parts, 0.32, 0.28, 0.76, 0, 0.62, 0, 0.075, 0.2, 0.17); // torso
  pushBox(parts, 0.27, 0.31, 0.26, 0, 0.64, 0.34, 0.075, 0.2, 0.19); // chest
  pushBox(parts, 0.18, 0.2, 0.18, 0, 0.74, 0.48, 0.075, 0.2, 0.155); // neck
  pushBox(parts, 0.22, 0.2, 0.24, 0, 0.86, 0.6, 0.075, 0.18, 0.14); // head
  pushBox(parts, 0.13, 0.115, 0.18, 0, 0.8, 0.77, 0.075, 0.16, 0.12); // snout
  pushBox(parts, 0.05, 0.13, 0.04, -0.085, 1.0, 0.55, 0.075, 0.18, 0.12); // ear L
  pushBox(parts, 0.05, 0.13, 0.04, 0.085, 1.0, 0.55, 0.075, 0.18, 0.12); // ear R
  // Three pale rib bands — the "emaciated" read at a glance.
  for (const ry of [0.55, 0.63, 0.71]) {
    pushBox(parts, 0.335, 0.022, 0.3, 0, ry, 0.02, 0.075, 0.13, 0.26);
  }
  for (const lx of [-0.1, 0.1]) {
    for (const lz of [-0.28, 0.28]) {
      pushBox(parts, 0.065, 0.44, 0.065, lx, 0.22, lz, 0.07, 0.14, 0.115);
    }
  }
  return mergeParts(parts);
})();

/** Dog tail: pivot at 0, thin along -Z. */
const DOG_TAIL_GEO = (() => {
  const parts = [];
  pushBox(parts, 0.05, 0.05, 0.38, 0, 0, -0.19, 0.075, 0.16, 0.15);
  return mergeParts(parts);
})();

/** Shared rat escape-hole decal. */
const HOLE_GEO = (() => {
  const geo = new THREE.CircleGeometry(0.2, 8);
  geo.rotateX(-Math.PI / 2);
  return geo;
})();

const HOLE_MAT = new THREE.MeshBasicMaterial({
  color: 0x04060a,
  transparent: true,
  opacity: 0.82,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

/** One material for every species: vertex colors carry the palette. */
const WILDLIFE_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.9,
  metalness: 0.05,
  flatShading: true,
});

// --- placement + audio helpers ----------------------------------------------

/**
 * Every spawn point: the 6 outer district pools + the legacy arena/zone
 * points. Points that fail the finite test are skipped.
 * @param {any} city
 * @param {any} level
 * @returns {Array<{x: number, z: number}>}
 */
function collectSpawns(city, level) {
  const out = [];
  if (city && Array.isArray(city.districts)) {
    for (let i = 0; i < city.districts.length; i++) {
      const d = city.districts[i];
      if (!d || !Array.isArray(d.spawnPoints)) continue;
      for (let j = 0; j < d.spawnPoints.length; j++) {
        const p = d.spawnPoints[j];
        if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
          out.push({ x: p.x, z: p.z });
        }
      }
    }
  }
  if (level && Array.isArray(level.spawnPoints)) {
    for (let i = 0; i < level.spawnPoints.length; i++) {
      const p = level.spawnPoints[i];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
        out.push({ x: p.x, z: p.z });
      }
    }
  }
  return out;
}

/**
 * Every gate gap center: district records + level waypoints (deduped).
 * @param {any} city
 * @param {any} level
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
    for (let i = 0; i < city.districts.length; i++) {
      const d = city.districts[i];
      if (!d || !Array.isArray(d.gates)) continue;
      for (let j = 0; j < d.gates.length; j++) {
        const g = d.gates[j];
        if (g) add(g.x, g.z);
      }
    }
  }
  if (level && typeof level.getGateWaypoints === "function") {
    try {
      const list = level.getGateWaypoints();
      if (Array.isArray(list)) {
        for (let i = 0; i < list.length; i++) {
          if (list[i]) add(list[i].x, list[i].z);
        }
      }
    } catch (e) {
      /* legacy/mock level: district gates above still cover the placement */
    }
  }
  return out;
}

/** True when (x, z) is at least `minDist` from every point. */
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

/**
 * City-less bounds: the AABB of level.spawnPoints expanded 4 m, clamped to
 * the walkable ±127 footprint; ±30 arena when there are no spawn points.
 * @param {any} level
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
    for (let i = 0; i < level.spawnPoints.length; i++) {
      const p = level.spawnPoints[i];
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

/**
 * Tiny self-contained WebAudio ambience (audio.js is frozen). Lazy context
 * after the first pointer/key gesture, persisted volume, safe no-op without
 * WebAudio or DOM. Every method returns true only when it actually scheduled
 * sound (so the caller can count it).
 * @param {EventTarget} bus
 * @returns {{cawCluster: (vol: number) => boolean,
 *   squeak: (vol: number) => boolean, bark: (vol: number) => boolean}}
 */
function createWildlifeAudio(bus) {
  /** @type {AudioContext|null} */
  let ctx = null;
  /** @type {GainNode|null} */
  let master = null;
  /** @type {AudioBuffer|null} */
  let noiseBuf = null;
  let volume = 0.8;
  try {
    if (typeof localStorage !== "undefined") {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (saved && typeof saved.volume === "number" && Number.isFinite(saved.volume)) {
        volume = Math.min(1, Math.max(0, saved.volume));
      }
    }
  } catch (e) {
    /* corrupt/absent storage -> default volume */
  }

  function createContext() {
    if (ctx) return;
    try {
      const Ctor =
        /** @type {any} */ (typeof window !== "undefined" ? window.AudioContext : undefined) ||
        /** @type {any} */ (typeof window !== "undefined" ? window.webkitAudioContext : undefined);
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 0.5)), ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      ctx = null;
      master = null;
      noiseBuf = null;
    }
  }

  function onGesture() {
    if (!ctx) createContext();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  }
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("pointerdown", onGesture);
    document.addEventListener("keydown", onGesture);
  }
  if (bus && typeof bus.addEventListener === "function") {
    bus.addEventListener("settings-changed", (e) => {
      const patch = e && e.detail ? e.detail.patch : null;
      if (!patch || typeof patch.volume !== "number" || !Number.isFinite(patch.volume)) return;
      volume = Math.min(1, Math.max(0, patch.volume));
      if (ctx && master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.03);
    });
  }

  function ready() {
    if (!ctx || !master) return false;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return true;
  }

  /**
   * Short enveloped oscillator.
   * @param {"sine"|"square"|"sawtooth"|"triangle"} type
   * @param {number} f0
   * @param {number} f1
   * @param {number} dur
   * @param {number} gain
   * @param {number} when - seconds from now
   * @param {number} filterHz - 0 = no filter
   * @param {number} q
   */
  function tone(type, f0, f1, dur, gain, when, filterHz, q) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, f0), t0);
    if (f1 && f1 !== f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let tail = osc;
    if (filterHz > 0) {
      const filt = ctx.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = filterHz;
      filt.Q.value = q || 1;
      osc.connect(filt);
      tail = filt;
    }
    tail.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** One harsh crow "caw": nasal saw + a thin square overtone. */
  function cawNote(when, gain) {
    if (!ctx || !master) return;
    tone("sawtooth", 500 + Math.random() * 120, 300 + Math.random() * 60, 0.17, gain, when, 1150, 1.5);
    tone("square", 760 + Math.random() * 120, 470 + Math.random() * 60, 0.14, gain * 0.32, when, 1800, 1.2);
  }

  return {
    /** 3-4 caws spread over ~2-5 s. */
    cawCluster(vol) {
      if (!ready() || vol <= 0) return false;
      const n = 3 + (Math.random() < 0.35 ? 1 : 0);
      let when = 0;
      for (let i = 0; i < n; i++) {
        cawNote(when, (0.09 + Math.random() * 0.04) * vol);
        when += 0.9 + Math.random() * 0.5; // 3-4 notes -> 2.9-4.4 s cluster
      }
      return true;
    },

    /** Two tiny high chirps — rare, only near a rat. */
    squeak(vol) {
      if (!ready() || vol <= 0) return false;
      tone("sine", 2250, 1750, 0.06, 0.05 * vol, 0, 0, 0);
      tone("sine", 2050, 1550, 0.05, 0.04 * vol, 0.09, 0, 0);
      return true;
    },

    /** A distant two-bark phrase with a soft low thump. */
    bark(vol) {
      if (!ready() || vol <= 0) return false;
      tone("sawtooth", 155, 88, 0.2, 0.11 * vol, 0, 520, 1.1);
      tone("sawtooth", 142, 82, 0.16, 0.08 * vol, 0.33, 460, 1.1);
      if (noiseBuf) {
        const t0 = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const filt = ctx.createBiquadFilter();
        filt.type = "lowpass";
        filt.frequency.value = 260;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.05 * vol, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
        src.connect(filt);
        filt.connect(g);
        g.connect(master);
        src.start(t0);
        src.stop(t0 + 0.16);
      }
      return true;
    },
  };
}

// =============================================================================

/**
 * Build the ambient fauna around the current world.
 * @param {import("three").Scene} scene
 * @param {EventTarget} bus
 * @param {import("./level.js").Level} level
 * @param {import("./city.js").City=} city
 */
export function createWildlife(scene, bus, level, city) {
  const rng = makeRng(SEED);
  const hasCity = !!(city && Array.isArray(city.districts) && city.districts.length > 0);
  const canQueryBlocked = !!(level && typeof level.isBlocked === "function");
  const canQueryDistrict = !!(hasCity && typeof city.districtAt === "function");
  const bounds = fallbackBounds(level);
  const spawns = collectSpawns(city, level);
  const gates = collectGates(city, level);
  const worldMinX = hasCity ? -128 : bounds.minX;
  const worldMaxX = hasCity ? 128 : bounds.maxX;
  const worldMinZ = hasCity ? -128 : bounds.minZ;
  const worldMaxZ = hasCity ? 128 : bounds.maxZ;

  /** Live player cache (the "fire" listener has no position payload). */
  let playerX = 0;
  let playerZ = 0;
  let hasPlayer = false;
  let time = 0;
  let meshCount = 0;

  const statsObj = {
    crows: CROW_COUNT,
    rats: RAT_COUNT,
    dogs: DOG_COUNT,
    perched: CROW_COUNT,
    flying: 0,
    goneCrows: 0,
    scuttling: RAT_COUNT,
    pausingRats: 0,
    dartingRats: 0,
    hiddenRats: 0,
    wanderingDogs: 0,
    fleeingDogs: 0,
    perches: 0,
    meshes: 0,
    drawCalls: 0,
    minPerchY: 0,
    maxPerchY: 0,
    caws: 0,
    squeaks: 0,
    barks: 0,
  };

  // --- shared [scene] add helpers -------------------------------------------

  /**
   * Create one wildlife mesh (shared geometry/material, no shadow casting).
   * @param {THREE.BufferGeometry} geo
   * @returns {THREE.Mesh}
   */
  function makeMesh(geo) {
    const mesh = new THREE.Mesh(geo, WILDLIFE_MAT);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    meshCount++;
    return mesh;
  }

  /** @param {THREE.Object3D} obj */
  function addToScene(obj) {
    if (scene && typeof scene.add === "function") scene.add(obj);
  }

  // --- placement predicates -------------------------------------------------

  /**
   * Inside one district (city) or the derived fallback rect (no city).
   * @param {number} x
   * @param {number} z
   * @returns {boolean}
   */
  function insideDistrict(x, z) {
    if (hasCity) {
      if (canQueryDistrict) return city.districtAt(x, z) !== null;
      for (let i = 0; i < city.districts.length; i++) {
        const b = city.districts[i] && city.districts[i].bounds;
        if (!b) continue;
        if (
          x >= b.minX + EDGE_PAD && x <= b.maxX - EDGE_PAD &&
          z >= b.minZ + EDGE_PAD && z <= b.maxZ - EDGE_PAD
        ) {
          return true;
        }
      }
      return false;
    }
    return (
      x >= bounds.minX + 1 && x <= bounds.maxX - 1 &&
      z >= bounds.minZ + 1 && z <= bounds.maxZ - 1
    );
  }

  /** @param {number} x @param {number} z @returns {boolean} */
  function inPond(x, z) {
    return x > POND.minX && x < POND.maxX && z > POND.minZ && z < POND.maxZ;
  }

  /**
   * Movement-only predicate (no spawn/gate reservation): district bounds,
   * pond bank and the mandated 0.5 m collision circle.
   * @param {number} x
   * @param {number} z
   * @returns {boolean}
   */
  function stepFree(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (!insideDistrict(x, z)) return false;
    if (inPond(x, z)) return false;
    if (canQueryBlocked && level.isBlocked(x, z, GROUND_RADIUS)) return false;
    return true;
  }

  /**
   * Full placement predicate: stepFree + 6 m spawn clearance + 4 m gate
   * clearance + the optional player-distance reservation.
   * @param {number} x
   * @param {number} z
   * @param {number} minPlayerDist
   * @returns {boolean}
   */
  function groundFree(x, z, minPlayerDist) {
    if (!stepFree(x, z)) return false;
    if (!clearOf(spawns, x, z, MIN_SPAWN_DIST)) return false;
    if (!clearOf(gates, x, z, MIN_GATE_DIST)) return false;
    if (hasPlayer && minPlayerDist > 0) {
      const dx = x - playerX;
      const dz = z - playerZ;
      if (dx * dx + dz * dz < minPlayerDist * minPlayerDist) return false;
    }
    return true;
  }

  /**
   * Perch placement rules: in-district, outside the pond, and the spawn/gate
   * keep-clear radii expanded by the anchor's jitter (`spread`) so EVERY
   * jittered bird position still satisfies the >= 6 m / >= 4 m rule.
   * @param {number} x
   * @param {number} z
   * @param {number} spread
   * @returns {boolean}
   */
  function perchAllowed(x, z, spread) {
    if (hasCity) {
      if (!insideDistrict(x, z)) return false;
    } else if (
      // Legacy wall tops sit exactly ON the ±30 boundary — allow that line.
      x < bounds.minX - 1 || x > bounds.maxX + 1 ||
      z < bounds.minZ - 1 || z > bounds.maxZ + 1
    ) {
      return false;
    }
    if (inPond(x, z)) return false;
    if (!clearOf(spawns, x, z, MIN_SPAWN_DIST + spread)) return false;
    if (!clearOf(gates, x, z, MIN_GATE_DIST + spread)) return false;
    return true;
  }

  /** Reused placement scratch — update() never touches it. */
  const spot = { x: 0, z: 0 };

  /**
   * Find one deterministic ground point. `band` pins the search to a band
   * (dogs); null mixes all bands with a 22 % district-wide fallback.
   * @param {number} minPlayerDist
   * @param {{minX: number, maxX: number, minZ: number, maxZ: number}|null} band
   * @param {{x: number, z: number}} out
   * @returns {boolean}
   */
  function findGroundPoint(minPlayerDist, band, out) {
    for (let attempt = 0; attempt < 140; attempt++) {
      let x;
      let z;
      if (band) {
        x = band.minX + rng() * (band.maxX - band.minX);
        z = band.minZ + rng() * (band.maxZ - band.minZ);
      } else if (rng() < 0.78) {
        const b = GROUND_BANDS[(rng() * GROUND_BANDS.length) | 0];
        x = b.minX + rng() * (b.maxX - b.minX);
        z = b.minZ + rng() * (b.maxZ - b.minZ);
      } else if (hasCity) {
        const d = city.districts[(rng() * city.districts.length) | 0];
        const b = d && d.bounds ? d.bounds : null;
        if (!b) continue;
        x = b.minX + 3 + rng() * Math.max(1, b.maxX - b.minX - 6);
        z = b.minZ + 3 + rng() * Math.max(1, b.maxZ - b.minZ - 6);
      } else {
        x = bounds.minX + rng() * (bounds.maxX - bounds.minX);
        z = bounds.minZ + rng() * (bounds.maxZ - bounds.minZ);
      }
      if (groundFree(x, z, minPlayerDist)) {
        out.x = x;
        out.z = z;
        return true;
      }
    }
    // Coarse guaranteed sweep (creation/respawn only — never per frame).
    for (let z = worldMinZ + 3; z <= worldMaxZ - 3; z += 4) {
      for (let x = worldMinX + 3; x <= worldMaxX - 3; x += 4) {
        if (groundFree(x, z, minPlayerDist)) {
          out.x = x;
          out.z = z;
          return true;
        }
      }
    }
    return false;
  }

  // --- crows: perch anchors --------------------------------------------------

  /**
   * @type {Array<{x: number, z: number, y: number, spread: number, kind: string}>}
   */
  const PERCHES = [];

  if (hasCity) {
    // Real trees: city.js pushes an exact 0.8 x 0.8 trunk collider for each of
    // its 24 park trees; vegetation.js pushes 0.7 x 0.7 for its 54 city-wide
    // trees. Both give us actual canopy positions instead of guessed coords.
    // (scenery.js barrels are the only other 0.7 square — BARREL_GUARD skips
    // them so no bird is authored above a barrel.)
    if (level && Array.isArray(level.colliders)) {
      for (let i = 0; i < level.colliders.length; i++) {
        const c = level.colliders[i];
        if (!c) continue;
        const w = c.maxX - c.minX;
        const d = c.maxZ - c.minZ;
        const parkTree = Math.abs(w - 0.8) <= 0.08 && Math.abs(d - 0.8) <= 0.08;
        const vegTree = Math.abs(w - 0.7) <= 0.06 && Math.abs(d - 0.7) <= 0.06;
        if (!parkTree && !vegTree) continue;
        const x = (c.minX + c.maxX) / 2;
        const z = (c.minZ + c.maxZ) / 2;
        if (!insideDistrict(x, z)) continue;
        if (vegTree && nearBarrel(x, z)) continue;
        PERCHES.push(
          parkTree
            ? { x, z, y: 5.8, spread: 1.25, kind: "tree" }
            : { x, z, y: 3.85, spread: 0.85, kind: "tree" }
        );
      }
    }
    // Residential lamp heads (city.js §RESIDENTIAL: pole 5 m, head at 5.05).
    const resLamps = [
      [-126, -66.5], [-106, -66.5], [-86, -66.5], [-66, -66.5],
      [-46, -66.5], [-26, -66.5], [-75.5, -44], [-75.5, -58],
    ];
    for (let i = 0; i < resLamps.length; i++) {
      PERCHES.push({ x: resLamps[i][0], z: resLamps[i][1], y: 5.24, spread: 0.08, kind: "lamp" });
    }
    // Safehouse main roof + the two shed roofs (right next to the story spawn).
    const safeRoofs = [[-70, -5], [-84, -5], [-77, -11]];
    for (let i = 0; i < safeRoofs.length; i++) {
      PERCHES.push({ x: safeRoofs[i][0], z: safeRoofs[i][1], y: 5.48, spread: 1.2, kind: "roof" });
    }
    const shedRoofs = [[-62, 12], [-88, 12]];
    for (let i = 0; i < shedRoofs.length; i++) {
      PERCHES.push({ x: shedRoofs[i][0], z: shedRoofs[i][1], y: 3.34, spread: 1.0, kind: "roof" });
    }
    // Commercial shop roofs (5 m boxes).
    const shopRoofs = [[8, -66], [54, -66], [30, -122]];
    for (let i = 0; i < shopRoofs.length; i++) {
      PERCHES.push({ x: shopRoofs[i][0], z: shopRoofs[i][1], y: 5.08, spread: 1.6, kind: "roof" });
    }
    // Safety net for a city built without colliders: outer-wall top perches.
    if (PERCHES.length < CROW_COUNT + 4) {
      for (const x of [-120, -60, 0, 60, 120]) {
        PERCHES.push({ x, z: -129.5, y: 6.0, spread: 0.05, kind: "wall" });
        PERCHES.push({ x, z: 129.5, y: 6.0, spread: 0.05, kind: "wall" });
      }
      for (const z of [-60, 0, 60]) {
        PERCHES.push({ x: -129.5, z, y: 6.0, spread: 0.05, kind: "wall" });
        PERCHES.push({ x: 129.5, z, y: 6.0, spread: 0.05, kind: "wall" });
      }
    }
  } else {
    // Legacy arena: the 4 m perimeter walls are the natural pigeon/crow line.
    // Extra points keep enough anchors after the spawn/gate keep-clear filter.
    for (const x of [-26, -21, -13, -7, 0, 7, 13, 21, 26]) {
      PERCHES.push({ x, z: -30, y: 4.08, spread: 0.05, kind: "wall" });
      PERCHES.push({ x, z: 30, y: 4.08, spread: 0.05, kind: "wall" });
    }
    for (const z of [-13, -7, 0, 7, 13]) {
      PERCHES.push({ x: -30, z, y: 4.08, spread: 0.05, kind: "wall" });
      PERCHES.push({ x: 30, z, y: 4.08, spread: 0.05, kind: "wall" });
    }
  }

  // Enforce the spawn/gate keep-clear rule for perched birds too (the anchor
  // jitter is included so even the worst offset stays legal).
  let keptPerches = 0;
  for (let i = 0; i < PERCHES.length; i++) {
    const p = PERCHES[i];
    if (perchAllowed(p.x, p.z, p.spread)) PERCHES[keptPerches++] = p;
  }
  PERCHES.length = keptPerches;
  if (PERCHES.length === 0) {
    // Degraded world with no legal prop above ground: one wall-top anchor.
    PERCHES.push({ x: 0, z: 0, y: 4.08, spread: 0.05, kind: "wall" });
  }

  let minPerchY = Infinity;
  let maxPerchY = -Infinity;
  for (let i = 0; i < PERCHES.length; i++) {
    const p = PERCHES[i];
    if (p.y < minPerchY) minPerchY = p.y;
    if (p.y > maxPerchY) maxPerchY = p.y;
  }
  if (!Number.isFinite(minPerchY)) minPerchY = CROW_PERCH_MIN_Y;
  if (!Number.isFinite(maxPerchY)) maxPerchY = CROW_PERCH_MIN_Y;

  // Shuffled anchor order so the first 12 birds spread over the whole city.
  const perchOrder = new Array(PERCHES.length);
  for (let i = 0; i < perchOrder.length; i++) perchOrder[i] = i;
  for (let i = perchOrder.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const tmp = perchOrder[i];
    perchOrder[i] = perchOrder[j];
    perchOrder[j] = tmp;
  }
  let perchCursor = 0;

  // --- audio -----------------------------------------------------------------

  const synth = createWildlifeAudio(bus);
  let cawTimer = 7 + rng() * 9;
  let squeakTimer = 24 + rng() * 26;
  let barkTimer = 20 + rng() * 28;
  let cawGuardUntil = 0;

  /** Distance fade for a world sound. @returns {number} 0..peak */
  function gainAt(x, z, maxDist, peak) {
    const dx = x - playerX;
    const dz = z - playerZ;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= maxDist) return 0;
    return peak * (1 - d / maxDist);
  }

  // --- crow records ----------------------------------------------------------

  /** @type {Array<any>} */
  const crows = [];

  /**
   * Move a crow (back) to its current perch anchor. Reuses the same meshes.
   * @param {any} crow
   */
  function placeCrowAtPerch(crow) {
    let index = -1;
    for (let attempt = 0; attempt < perchOrder.length; attempt++) {
      const candidate = perchOrder[perchCursor % perchOrder.length];
      perchCursor++;
      const p = PERCHES[candidate];
      if (hasPlayer) {
        const dx = p.x - playerX;
        const dz = p.z - playerZ;
        if (dx * dx + dz * dz < 196) continue; // >= 14 m from the player
      }
      index = candidate;
      break;
    }
    if (index < 0) {
      index = perchOrder[perchCursor % perchOrder.length];
      perchCursor++;
    }
    const p = PERCHES[index];
    crow.anchor = index;
    crow.x = p.x + (rng() * 2 - 1) * p.spread;
    crow.z = p.z + (rng() * 2 - 1) * p.spread;
    crow.y = p.y;
    crow.perchY = p.y;
    crow.heading = rng() * TAU;
    crow.state = CROW_PERCH;
    crow.timer = 0;
    crow.flyT = 0;
    crow.flyBlend = 0;
    crow.cawT = 0;
    crow.group.visible = true;
    crow.group.position.set(crow.x, crow.y, crow.z);
    crow.group.rotation.set(0, crow.heading, 0);
    crow.head.position.set(0, 0.15, 0.28);
    crow.head.rotation.set(0, 0, 0);
    crow.wingR.rotation.set(0, -1.15, -0.35);
    crow.wingL.rotation.set(0, Math.PI + 1.15, -0.35);
  }

  for (let i = 0; i < CROW_COUNT; i++) {
    const group = new THREE.Group();
    group.name = "wildlife-crow-" + i;
    const body = makeMesh(CROW_BODY_GEO);
    const head = makeMesh(CROW_HEAD_GEO);
    head.position.set(0, 0.15, 0.28);
    const wingR = new THREE.Group();
    wingR.position.set(0.13, 0.06, 0.02);
    const wingRmesh = makeMesh(CROW_WING_GEO);
    wingR.add(wingRmesh);
    const wingL = new THREE.Group();
    wingL.position.set(-0.13, 0.06, 0.02);
    wingL.rotation.y = Math.PI;
    const wingLmesh = makeMesh(CROW_WING_GEO);
    wingL.add(wingLmesh);
    group.add(body, head, wingL, wingR);
    addToScene(group);
    const crow = {
      group,
      head,
      wingL,
      wingR,
      state: CROW_PERCH,
      timer: 0,
      phase: rng() * TAU,
      cawT: 0,
      flyT: 0,
      flyDur: 4,
      flyBlend: 0,
      anchor: -1,
      x: 0,
      y: 0,
      z: 0,
      perchY: 0,
      heading: 0,
      startX: 0,
      startY: 0,
      startZ: 0,
      dirX: 0,
      dirZ: 1,
      flyDist: 0,
      climb: 0,
      curve: 0,
      bank: 0,
      flapSpeed: 18,
      scale: 0.9 + rng() * 0.2,
    };
    group.scale.setScalar(crow.scale);
    placeCrowAtPerch(crow);
    crows.push(crow);
  }

  /**
   * Start a take-off if the bird is still perched.
   * @param {any} crow
   * @param {boolean} silent
   * @returns {boolean}
   */
  function takeOff(crow, silent) {
    if (crow.state !== CROW_PERCH) return false;
    let dx = crow.x - playerX;
    let dz = crow.z - playerZ;
    let len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-4) {
      const a = rng() * TAU;
      dx = Math.sin(a);
      dz = Math.cos(a);
      len = 1;
    }
    const angle = Math.atan2(dx, dz) + (rng() - 0.5) * 0.7;
    crow.state = CROW_FLY;
    crow.flyT = 0;
    crow.flyDur = 3.4 + rng() * 2.2;
    crow.startX = crow.x;
    crow.startY = crow.y;
    crow.startZ = crow.z;
    crow.dirX = Math.sin(angle);
    crow.dirZ = Math.cos(angle);
    crow.flyDist = CROW_FLY_DIST_MIN + rng() * (CROW_FLY_DIST_MAX - CROW_FLY_DIST_MIN);
    crow.climb = CROW_CLIMB_MIN + rng() * (CROW_CLIMB_MAX - CROW_CLIMB_MIN);
    crow.curve = (rng() * 2 - 1) * 8;
    crow.bank = (rng() * 2 - 1) * 0.5;
    crow.flapSpeed = 15 + rng() * 7;
    crow.heading = angle;
    crow.cawT = 0;
    if (!silent) cawForCrow(crow, 0.85);
    return true;
  }

  /**
   * Caw at a bird (head animation always; audible only when in earshot).
   * @param {any} crow
   * @param {number} peak
   * @returns {boolean}
   */
  function cawForCrow(crow, peak) {
    crow.cawT = 0.45;
    if (time < cawGuardUntil) return false;
    const gain = gainAt(crow.x, crow.z, CROW_CAW_NEAR, peak);
    if (gain <= 0) return false;
    if (synth.cawCluster(gain)) {
      statsObj.caws++;
      cawGuardUntil = time + 1.5;
      return true;
    }
    return false;
  }

  // --- rat records -----------------------------------------------------------

  /** @type {Array<any>} */
  const rats = [];

  /**
   * Pick a new short scuttle target near a rat.
   * @param {any} rat
   */
  function pickRatTarget(rat) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = rng() * TAU;
      const r = 2.5 + rng() * 5;
      const x = rat.x + Math.sin(a) * r;
      const z = rat.z + Math.cos(a) * r;
      if (stepFree(x, z)) {
        rat.tx = x;
        rat.tz = z;
        rat.state = RAT_SCUTTLE;
        rat.timer = 6 + rng() * 4;
        return;
      }
    }
    rat.state = RAT_PAUSE;
    rat.timer = 0.8 + rng() * 1.6;
  }

  /**
   * Dart 2-5 m away from the player, shrinking to 0 on the way.
   * @param {any} rat
   */
  function startRatDart(rat) {
    if (rat.state === RAT_DART || rat.state === RAT_HIDDEN) return;
    let dx = rat.x - playerX;
    let dz = rat.z - playerZ;
    let len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-4) {
      const a = rng() * TAU;
      dx = Math.sin(a);
      dz = Math.cos(a);
      len = 1;
    }
    const angle = Math.atan2(dx, dz) + (rng() - 0.5) * 0.7;
    const dist = 2.2 + rng() * 2.6;
    rat.dartStartX = rat.x;
    rat.dartStartZ = rat.z;
    rat.dartX = rat.x + Math.sin(angle) * dist;
    rat.dartZ = rat.z + Math.cos(angle) * dist;
    rat.dartT = 0;
    rat.dartDur = 0.45 + rng() * 0.3;
    rat.heading = angle;
    rat.state = RAT_DART;
  }

  /**
   * Re-place a hidden rat somewhere else in the city.
   * @param {any} rat
   */
  function respawnRat(rat) {
    let found = findGroundPoint(14, null, spot);
    if (!found) found = findGroundPoint(8, null, spot);
    if (!found) found = findGroundPoint(0, null, spot);
    if (!found) {
      rat.timer = 2;
      return;
    }
    rat.x = spot.x;
    rat.z = spot.z;
    rat.y = 0;
    rat.state = RAT_SCUTTLE;
    rat.timer = 5;
    rat.scale = 0.75 + rng() * 0.15;
    rat.speed = 1.5 + rng() * 0.9;
    rat.group.visible = true;
    rat.group.scale.setScalar(rat.scale);
    rat.group.position.set(rat.x, 0, rat.z);
    rat.hole.visible = false;
    rat.holeT = 0;
    pickRatTarget(rat);
  }

  for (let i = 0; i < RAT_COUNT; i++) {
    const group = new THREE.Group();
    group.name = "wildlife-rat-" + i;
    const body = makeMesh(RAT_BODY_GEO);
    const tail = makeMesh(RAT_TAIL_GEO);
    tail.position.set(0, 0.08, -0.14);
    group.add(body, tail);
    addToScene(group);

    const hole = new THREE.Mesh(HOLE_GEO, HOLE_MAT);
    hole.name = "wildlife-rat-hole-" + i;
    hole.visible = false;
    addToScene(hole);
    meshCount++;

    const rat = {
      group,
      body,
      tail,
      hole,
      state: RAT_SCUTTLE,
      timer: 4,
      phase: rng() * TAU,
      x: 0,
      z: 0,
      y: 0,
      tx: 0,
      tz: 0,
      heading: rng() * TAU,
      speed: 1.5 + rng() * 0.9,
      scale: 0.75 + rng() * 0.15,
      dartStartX: 0,
      dartStartZ: 0,
      dartX: 0,
      dartZ: 0,
      dartT: 0,
      dartDur: 0.6,
      holeT: 0,
    };
    group.scale.setScalar(rat.scale);
    if (findGroundPoint(0, null, spot)) {
      rat.x = spot.x;
      rat.z = spot.z;
      group.position.set(rat.x, 0, rat.z);
      pickRatTarget(rat);
    } else {
      rat.state = RAT_HIDDEN;
      rat.timer = 3;
      rat.group.visible = false;
    }
    rats.push(rat);
  }

  // --- dog records -----------------------------------------------------------

  /** @type {Array<any>} */
  const dogs = [];
  const dogBands = [RES_MAIN, PARK_LAWN, DOCKS_SHORE];

  /**
   * Pick a wandering target for a dog.
   * @param {any} dog
   */
  function pickDogTarget(dog) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = rng() * TAU;
      const r = 3 + rng() * 7;
      const x = dog.x + Math.sin(a) * r;
      const z = dog.z + Math.cos(a) * r;
      if (stepFree(x, z)) {
        dog.tx = x;
        dog.tz = z;
        dog.state = DOG_WALK;
        dog.timer = 5 + rng() * 5;
        return;
      }
    }
    dog.state = DOG_PAUSE;
    dog.timer = 0.8 + rng() * 1.6;
  }

  /**
   * Flee away from the player for a few seconds.
   * @param {any} dog
   */
  function startDogFlee(dog) {
    if (dog.state === DOG_FLEE && dog.timer > 0) return;
    let dx = dog.x - playerX;
    let dz = dog.z - playerZ;
    let len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-4) {
      const a = rng() * TAU;
      dx = Math.sin(a);
      dz = Math.cos(a);
      len = 1;
    }
    let angle = Math.atan2(dx, dz);
    let targetX = dog.x + Math.sin(angle) * 8;
    let targetZ = dog.z + Math.cos(angle) * 8;
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = angle + (attempt % 2 === 0 ? 1 : -1) * Math.ceil(attempt / 2) * 0.45;
      const x = dog.x + Math.sin(a) * 8;
      const z = dog.z + Math.cos(a) * 8;
      if (stepFree(x, z)) {
        angle = a;
        targetX = x;
        targetZ = z;
        break;
      }
    }
    dog.tx = targetX;
    dog.tz = targetZ;
    dog.heading = angle;
    dog.speed = 3.8 + rng() * 0.8;
    dog.state = DOG_FLEE;
    dog.timer = 3.5 + rng() * 3.5;
  }

  for (let i = 0; i < DOG_COUNT; i++) {
    const group = new THREE.Group();
    group.name = "wildlife-dog-" + i;
    const body = makeMesh(DOG_BODY_GEO);
    const tail = makeMesh(DOG_TAIL_GEO);
    tail.position.set(0, 0.74, -0.38);
    group.add(body, tail);
    addToScene(group);

    const dog = {
      group,
      body,
      tail,
      state: DOG_PAUSE,
      timer: 1 + rng() * 2,
      phase: rng() * TAU,
      x: 0,
      z: 0,
      tx: 0,
      tz: 0,
      heading: rng() * TAU,
      speed: 1.15 + rng() * 0.45,
      scale: 0.72 + rng() * 0.12,
    };
    group.scale.setScalar(dog.scale);
    if (findGroundPoint(0, dogBands[i], spot)) {
      dog.x = spot.x;
      dog.z = spot.z;
      group.position.set(dog.x, 0, dog.z);
      pickDogTarget(dog);
    } else {
      dog.group.visible = false;
    }
    dogs.push(dog);
  }

  // --- bus: gunfire scares ---------------------------------------------------

  /**
   * "fire" has no world position (weapons.js payload is {weapon}), so the last
   * player position from update() is the shot origin. Crows within 25 m, rats
   * within 15 m, dogs within 28 m react; everything farther stays calm.
   */
  function onFire() {
    let flockCrow = null;
    let flockDist = Infinity;
    for (let i = 0; i < crows.length; i++) {
      const c = crows[i];
      if (c.state !== CROW_PERCH) continue;
      const dx = c.x - playerX;
      const dz = c.z - playerZ;
      const d2 = dx * dx + dz * dz;
      if (d2 > CROW_GUN_FLEE * CROW_GUN_FLEE) continue;
      if (d2 < flockDist) {
        flockDist = d2;
        flockCrow = c;
      }
      takeOff(c, true);
    }
    for (let i = 0; i < rats.length; i++) {
      const r = rats[i];
      if (r.state === RAT_DART || r.state === RAT_HIDDEN) continue;
      const dx = r.x - playerX;
      const dz = r.z - playerZ;
      if (dx * dx + dz * dz < RAT_GUN_FLEE * RAT_GUN_FLEE) startRatDart(r);
    }
    for (let i = 0; i < dogs.length; i++) {
      const d = dogs[i];
      const dx = d.x - playerX;
      const dz = d.z - playerZ;
      if (dx * dx + dz * dz < DOG_GUN_FLEE * DOG_GUN_FLEE) startDogFlee(d);
    }
    if (flockCrow) cawForCrow(flockCrow, 0.9);
  }

  if (bus && typeof bus.addEventListener === "function") {
    bus.addEventListener("fire", onFire);
  }

  // --- ambient audio scheduler ----------------------------------------------

  /** @returns {boolean} true when a bird was found and cawed */
  function ambientCaw() {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < crows.length; i++) {
      const c = crows[i];
      if (c.state !== CROW_PERCH) continue;
      const dx = c.x - playerX;
      const dz = c.z - playerZ;
      const d2 = dx * dx + dz * dz;
      if (d2 > CROW_CAW_NEAR * CROW_CAW_NEAR) continue;
      if (d2 < bestD) {
        bestD = d2;
        best = c;
      }
    }
    if (best) {
      cawForCrow(best, 0.8);
      return true;
    }
    return false;
  }

  function updateAmbient(dt) {
    cawTimer -= dt;
    if (cawTimer <= 0) {
      cawTimer = 8 + rng() * 12;
      ambientCaw();
    }
    squeakTimer -= dt;
    if (squeakTimer <= 0) {
      squeakTimer = 26 + rng() * 30;
      let best = null;
      let bestD = Infinity;
      for (let i = 0; i < rats.length; i++) {
        const r = rats[i];
        if (r.state === RAT_HIDDEN) continue;
        const dx = r.x - playerX;
        const dz = r.z - playerZ;
        const d2 = dx * dx + dz * dz;
        if (d2 > 196) continue;
        if (d2 < bestD) {
          bestD = d2;
          best = r;
        }
      }
      if (best) {
        const gain = gainAt(best.x, best.z, 14, 1);
        if (gain > 0 && synth.squeak(gain)) statsObj.squeaks++;
      }
    }
    barkTimer -= dt;
    if (barkTimer <= 0) {
      barkTimer = 20 + rng() * 30;
      if (synth.bark(0.8)) statsObj.barks++;
    }
  }

  // --- per-frame updates -----------------------------------------------------

  /**
   * Crows: perch idle / parametric escape flight / hidden respawn timer.
   * @param {number} dt
   */
  function updateCrows(dt) {
    for (let i = 0; i < crows.length; i++) {
      const c = crows[i];
      if (c.cawT > 0) c.cawT -= dt;

      if (c.state === CROW_PERCH) {
        if (hasPlayer) {
          const dx = c.x - playerX;
          const dz = c.z - playerZ;
          if (dx * dx + dz * dz < CROW_PLAYER_FLEE * CROW_PLAYER_FLEE) {
            takeOff(c, false);
          }
        }
      }

      if (c.state === CROW_PERCH) {
        // Idle: breathing bob, slow scanning head, throat-up caw pose.
        const bob = Math.sin(time * 2.1 + c.phase);
        c.group.position.y = c.perchY + bob * 0.005;
        c.head.position.y = 0.15 + bob * 0.018;
        c.head.rotation.x = 0.05 + Math.sin(time * 1.7 + c.phase) * 0.05;
        c.head.rotation.y = Math.sin(time * 0.5 + c.phase * 1.3) * 0.55;
        if (c.cawT > 0) c.head.rotation.x = -0.35;
        const fold = 1 - c.flyBlend;
        c.wingR.rotation.set(0, -1.15 * fold, -0.35 * fold);
        c.wingL.rotation.set(0, Math.PI + 1.15 * fold, -0.35 * fold);
        continue;
      }

      if (c.state === CROW_FLY) {
        const target = 1;
        c.flyBlend += (target - c.flyBlend) * Math.min(1, dt * 7);
        c.flyT += dt;
        const p = c.flyT / c.flyDur;
        if (p >= 1) {
          c.state = CROW_GONE;
          c.group.visible = false;
          c.timer = CROW_RESPAWN_MIN + rng() * (CROW_RESPAWN_MAX - CROW_RESPAWN_MIN);
          continue;
        }
        const eased = 1 - (1 - p) * (1 - p);
        const sw = Math.sin(p * Math.PI);
        const perpX = -c.dirZ;
        const perpZ = c.dirX;
        const x = c.startX + c.dirX * c.flyDist * eased + perpX * c.curve * sw;
        const z = c.startZ + c.dirZ * c.flyDist * eased + perpZ * c.curve * sw;
        const y = c.startY + c.climb * (1 - Math.cos(p * Math.PI * 0.5)) + sw * 0.6;
        c.x = x;
        c.y = y;
        c.z = z;
        c.group.position.set(x, y, z);
        c.group.rotation.set(
          -(0.14 + 0.16 * sw),
          c.heading,
          c.bank * sw * c.flyBlend
        );
        c.head.position.y = 0.15;
        c.head.rotation.set(0.12, 0, 0);
        const flap = Math.sin(time * c.flapSpeed + c.phase) * 0.95;
        const fold = 1 - c.flyBlend;
        c.wingR.rotation.set(0, -1.15 * fold, 0.1 + flap * c.flyBlend);
        c.wingL.rotation.set(0, Math.PI + 1.15 * fold, 0.1 + flap * c.flyBlend);
        continue;
      }

      // CROW_GONE — invisible, counting down to a fresh perch.
      c.timer -= dt;
      if (c.timer <= 0) placeCrowAtPerch(c);
    }
  }

  /**
   * Rats: scuttle/pause on the ground, dart-and-shrink escape, hidden timer.
   * @param {number} dt
   */
  function updateRats(dt) {
    for (let i = 0; i < rats.length; i++) {
      const r = rats[i];
      if (r.state === RAT_HIDDEN) {
        r.timer -= dt;
        if (r.holeT > 0) {
          r.holeT -= dt;
          if (r.holeT <= 0) r.hole.visible = false;
        }
        if (r.timer <= 0) respawnRat(r);
        continue;
      }

      if (hasPlayer && r.state !== RAT_DART) {
        const dx = r.x - playerX;
        const dz = r.z - playerZ;
        if (dx * dx + dz * dz < RAT_PLAYER_FLEE * RAT_PLAYER_FLEE) startRatDart(r);
      }

      if (r.state === RAT_SCUTTLE || r.state === RAT_PAUSE) {
        r.timer -= dt;
        if (r.state === RAT_SCUTTLE) {
          const dx = r.tx - r.x;
          const dz = r.tz - r.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 0.04 || r.timer <= 0) {
            r.state = RAT_PAUSE;
            r.timer = 0.5 + rng() * 1.6;
          } else {
            const len = Math.sqrt(d2);
            const step = r.speed * dt;
            const nx = r.x + (dx / len) * step;
            const nz = r.z + (dz / len) * step;
            if (stepFree(nx, nz)) {
              r.x = nx;
              r.z = nz;
              r.heading = Math.atan2(dx, dz);
            } else {
              pickRatTarget(r);
            }
          }
        } else if (r.timer <= 0) {
          pickRatTarget(r);
        }
        const moving = r.state === RAT_SCUTTLE;
        const wobble = moving
          ? Math.sin(time * 20 + r.phase) * 0.22
          : Math.sin(time * 3 + r.phase) * 0.04;
        const bob = moving ? Math.abs(Math.sin(time * 14 + r.phase)) * 0.018 : 0;
        r.group.position.set(r.x, bob, r.z);
        r.group.rotation.set(0, r.heading, wobble);
        r.tail.rotation.y = Math.sin(time * (moving ? 16 : 4) + r.phase) * 0.55;
        continue;
      }

      if (r.state === RAT_DART) {
        r.dartT += dt;
        let p = r.dartT / r.dartDur;
        if (p > 1) p = 1;
        const nx = r.dartStartX + (r.dartX - r.dartStartX) * p;
        const nz = r.dartStartZ + (r.dartZ - r.dartStartZ) * p;
        if (stepFree(nx, nz)) {
          r.x = nx;
          r.z = nz;
        }
        const scale = Math.max(0.001, 1 - p);
        r.group.position.set(r.x, 0, r.z);
        r.group.rotation.set(0, r.heading, Math.sin(time * 26 + r.phase) * 0.18);
        r.group.scale.setScalar(r.scale * scale);
        r.tail.rotation.y = Math.sin(time * 22 + r.phase) * 0.7;
        if (p >= 1) {
          r.state = RAT_HIDDEN;
          r.group.visible = false;
          r.group.scale.setScalar(r.scale);
          r.timer = RAT_RESPAWN_MIN + rng() * (RAT_RESPAWN_MAX - RAT_RESPAWN_MIN);
          r.hole.position.set(r.x, 0.015, r.z);
          r.hole.visible = true;
          r.holeT = 3;
        }
      }
    }
  }

  /**
   * Dogs: wander/pause; flee when the player or a shot comes close.
   * @param {number} dt
   */
  function updateDogs(dt) {
    for (let i = 0; i < dogs.length; i++) {
      const d = dogs[i];
      if (!d.group.visible) continue;

      if (hasPlayer && d.state !== DOG_FLEE) {
        const dx = d.x - playerX;
        const dz = d.z - playerZ;
        if (dx * dx + dz * dz < DOG_PLAYER_FLEE * DOG_PLAYER_FLEE) startDogFlee(d);
      }

      d.timer -= dt;
      if (d.state === DOG_PAUSE) {
        if (d.timer <= 0) pickDogTarget(d);
      } else if (d.state === DOG_WALK || d.state === DOG_FLEE) {
        const dx = d.tx - d.x;
        const dz = d.tz - d.z;
        const d2 = dx * dx + dz * dz;
        const arrived = d2 < 0.36;
        if (arrived || d.timer <= 0) {
          if (d.state === DOG_FLEE) {
            d.state = DOG_PAUSE;
            d.timer = 0.8 + rng() * 1.2;
          } else {
            d.state = DOG_PAUSE;
            d.timer = 1.2 + rng() * 2.4;
          }
        } else {
          const len = Math.sqrt(d2);
          const step = d.speed * dt;
          const nx = d.x + (dx / len) * step;
          const nz = d.z + (dz / len) * step;
          if (stepFree(nx, nz)) {
            d.x = nx;
            d.z = nz;
            d.heading = Math.atan2(dx, dz);
          } else if (stepFree(nx, d.z)) {
            d.x = nx;
            d.heading = Math.atan2(dx, dz);
          } else if (stepFree(d.x, nz)) {
            d.z = nz;
            d.heading = Math.atan2(dx, dz);
          } else if (d.state === DOG_FLEE) {
            startDogFlee(d);
          } else {
            pickDogTarget(d);
          }
        }
      }

      const running = d.state === DOG_FLEE;
      const walking = d.state === DOG_WALK;
      const gait = running ? 13 : walking ? 7.5 : 2;
      const bob = d.state !== DOG_PAUSE
        ? Math.abs(Math.sin(time * gait + d.phase)) * (running ? 0.04 : 0.025)
        : Math.sin(time * 1.5 + d.phase) * 0.006;
      d.group.position.set(d.x, bob, d.z);
      d.group.rotation.set(0, d.heading, d.state !== DOG_PAUSE
        ? Math.sin(time * gait + d.phase) * 0.035
        : 0);
      d.tail.rotation.y = Math.sin(time * (running ? 13 : 6) + d.phase) * (running ? 0.15 : 0.5);
    }
  }

  /**
   * Advance the fauna. Allocation-free: scalar math, in-place record writes,
   * shared geometry only.
   * @param {number} dt - seconds
   * @param {{x: number, z: number}=} playerPos
   */
  function update(dt, playerPos) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (playerPos) {
      if (Number.isFinite(playerPos.x) && Number.isFinite(playerPos.z)) {
        playerX = playerPos.x;
        playerZ = playerPos.z;
        hasPlayer = true;
      }
    }
    time += dt;
    if (time > 100000) time = 0; // keep trig precision on very long sessions

    updateCrows(dt);
    updateRats(dt);
    updateDogs(dt);
    updateAmbient(dt);
  }

  // --- stats -----------------------------------------------------------------

  /**
   * Live summary. Reuses one object (the HUD/debug may poll it).
   * @returns {Record<string, number>}
   */
  function stats() {
    let perched = 0;
    let flying = 0;
    let gone = 0;
    for (let i = 0; i < crows.length; i++) {
      if (crows[i].state === CROW_PERCH) perched++;
      else if (crows[i].state === CROW_FLY) flying++;
      else gone++;
    }
    let scuttling = 0;
    let pausing = 0;
    let darting = 0;
    let hidden = 0;
    for (let i = 0; i < rats.length; i++) {
      if (rats[i].state === RAT_SCUTTLE) scuttling++;
      else if (rats[i].state === RAT_PAUSE) pausing++;
      else if (rats[i].state === RAT_DART) darting++;
      else hidden++;
    }
    let wandering = 0;
    let fleeing = 0;
    for (let i = 0; i < dogs.length; i++) {
      if (dogs[i].state === DOG_FLEE) fleeing++;
      else if (dogs[i].group.visible) wandering++;
    }
    statsObj.perched = perched;
    statsObj.flying = flying;
    statsObj.goneCrows = gone;
    statsObj.scuttling = scuttling;
    statsObj.pausingRats = pausing;
    statsObj.dartingRats = darting;
    statsObj.hiddenRats = hidden;
    statsObj.wanderingDogs = wandering;
    statsObj.fleeingDogs = fleeing;
    statsObj.perches = PERCHES.length;
    statsObj.meshes = meshCount;
    statsObj.drawCalls = meshCount;
    statsObj.minPerchY = minPerchY;
    statsObj.maxPerchY = maxPerchY;
    return statsObj;
  }

  /**
   * Private harness/debug snapshot (non-enumerable — NOT part of the module
   * contract). Allocation happens only when a test asks for it.
   * @returns {any}
   */
  function debugSnapshot() {
    const out = { crows: [], rats: [], dogs: [], perches: [] };
    for (let i = 0; i < crows.length; i++) {
      const c = crows[i];
      out.crows.push({
        x: c.x, y: c.y, z: c.z,
        perchY: c.perchY,
        anchor: c.anchor,
        state: CROW_STATE_NAMES[c.state],
      });
    }
    for (let i = 0; i < rats.length; i++) {
      const r = rats[i];
      out.rats.push({ x: r.x, z: r.z, state: RAT_STATE_NAMES[r.state] });
    }
    for (let i = 0; i < dogs.length; i++) {
      const d = dogs[i];
      out.dogs.push({ x: d.x, z: d.z, state: DOG_STATE_NAMES[d.state], visible: d.group.visible });
    }
    for (let i = 0; i < PERCHES.length; i++) {
      const p = PERCHES[i];
      out.perches.push({ x: p.x, z: p.z, y: p.y, kind: p.kind });
    }
    return out;
  }

  statsObj.perches = PERCHES.length;
  statsObj.meshes = meshCount;
  statsObj.drawCalls = meshCount;
  statsObj.minPerchY = minPerchY;
  statsObj.maxPerchY = maxPerchY;

  console.info(
    "[wildlife] " + CROW_COUNT + " crows, " + RAT_COUNT + " rats, " +
    DOG_COUNT + " dogs, " + PERCHES.length + " perches, " + meshCount + " meshes"
  );

  const api = { update, stats };
  Object.defineProperty(api, "__debug", {
    value: debugSnapshot,
    enumerable: false,
    writable: false,
  });
  return api;
}
