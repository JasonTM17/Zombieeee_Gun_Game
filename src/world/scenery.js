/**
 * ============================================================================
 * SCENERY — atmospheric set dressing for the 7-district night city.
 * ============================================================================
 * One extra layer over level/city/vegetation:
 *   - a large moon disc + additive halo on the same side as the moonlight
 *     (atmosphere.js DirectionalLight at +40, +70, −25) — NO new light;
 *   - a distant skyline ring (radius 150–190 m, outside the ±130 city wall) as
 *     one dark silhouette mesh + one tiny-window mesh, fog:false so it reads as
 *     a horizon instead of disappearing into FogExp2;
 *   - 12 fake volumetric lamp shafts (nested additive cones) under existing
 *     street / district lamps, merged into ONE draw call;
 *   - 8 burning barrels (safehouse / quarantine / docks edges) with merged
 *     bodies and individual additive flame cones — NO dynamic PointLights:
 *     the emissive flame + tone mapping read as fire in the dark, and the
 *     saved shader lights are worth more than the warm pool they added;
 *   - rubble, sandbag walls, abandoned cars and traffic barricades along the
 *     residential / commercial streets and the quarantine rim. Only the big
 *     items (barrel body, sandbag wall, car) push AABB colliders;
 *   - flat metallic puddles on the streets (no colliders);
 *   - ONE 220-point firefly/dust system over the park + streets, animated in
 *     place (positions updated in the existing Float32Array, zero allocation);
 *   - extra warm window quads on residential / commercial facades.
 *
 * Placement rules (every static prop, not only solid ones):
 *   - inside a district bounds rect (city) or the level-derived bounds ring;
 *   - NOT inside existing geometry: `level.isBlocked(x, z, radius)`;
 *   - ≥ 6 m from city.districts[].spawnPoints + level.spawnPoints;
 *   - ≥ 4 m from district gates and story POIs (campfire/final door are wider);
 *   - outside the park pond x 40..66 / z 70..86 (plus a small bank);
 *   - no prop-on-prop overlap (a local placement list).
 *
 * Budget: deterministic mulberry32 seed, shared geometries/materials, repeated
 * geometry merged with mergeGeometries, < 40 extra draw calls, no new shadow
 * casters, no per-frame allocation, no runtime disposal (static dressing).
 *
 * City may be omitted (legacy / headless): the module degrades to the level
 * spawn AABB and a smaller arena-rim ring, and still builds the sky/barrels.
 *
 * @param {import("three").Scene} scene
 * @param {import("./level.js").Level} level
 * @param {import("./city.js").City=} city
 * @returns {{update: (dt: number, playerPos?: {x: number, z: number}) => void,
 *   stats: Record<string, number>}}
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// --- tunables ---------------------------------------------------------------

const SEED = 0x5ce7e11; // fixed seed → every reload dresses the same city
const MIN_SPAWN_DIST = 6; // task: props ≥ 6 m from every spawn point
const MIN_GATE_DIST = 4; // task: props ≥ 4 m from every gate waypoint
const BOUNDS_MARGIN = 1.2; // keep props this far inside a district rect
const POND = { minX: 40, maxX: 66, minZ: 70, maxZ: 86 };
const POND_PAD = 1.5;

const MOON_DIR = { x: 40, y: 70, z: -25 }; // atmosphere.js DirectionalLight
const MOON_DIST = 330; // inside camera.far (500) from every city corner
const MOON_RADIUS = 12;
const HALO_SIZE = 78;

const SKYLINE_RADIUS = 158;
const SKYLINE_COUNT = 46;

const BARREL_COUNT = 8;
// Perf pass: 3 → 0 dynamic point lights. Every barrel keeps its animated
// additive flame cone; the forward shader no longer pays for barrel lights
// (city district lamps + the three arena lamps carry the warm pools).
const BARREL_LIGHT_MAX = 0;
const FIREFLY_COUNT = 220;

/**
 * Story POIs mirrored from city.js (module-private there) + the vault door.
 * Radii protect the interaction ring; the campfire and vault get more room.
 * @type {Array<{x: number, z: number, r: number}>}
 */
const POIS = [
  { x: -89, z: -15, r: 4 }, // generator-1
  { x: -61, z: -15, r: 4 }, // generator-2
  { x: -75, z: 15, r: 4 }, // generator-3
  { x: -120, z: -123, r: 4 }, // supply-1
  { x: -30, z: -100, r: 4 }, // supply-2
  { x: -70, z: -45, r: 4 }, // supply-3
  { x: 55, z: -95, r: 5 }, // radio tower
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
 * The 12 fake light shafts. The first ten sit under real city/atmosphere lamp
 * heads (residential 5.05 m, commercial 6.05 m); the last two use the district
 * PointLight anchors (safehouse 4.5 m, hospital 6 m, docks 13 m). Coordinates
 * match city.js/atmosphere.js — update both if a lamp moves.
 * @type {Array<{x: number, z: number, y: number, warm?: boolean}>}
 */
const SHAFTS = [
  { x: -75, z: 8, y: 4.5 }, // safehouse district light
  { x: -126, z: -66.5, y: 5.05 },
  { x: -106, z: -66.5, y: 5.05 },
  { x: -86, z: -66.5, y: 5.05 },
  { x: -66, z: -66.5, y: 5.05 },
  { x: -46, z: -66.5, y: 5.05 },
  { x: -26, z: -66.5, y: 5.05 },
  { x: 33, z: -73, y: 6.05 },
  { x: 77, z: -73, y: 6.05 },
  { x: 33, z: -114, y: 6.05 },
  { x: 78, z: 0, y: 6, warm: false }, // hospital cold district light
  { x: -85, z: 55, y: 13 }, // docks crane/yard light
];

/** Legacy arena lamps (atmosphere.js) — city-less fallback shafts. */
const SHAFTS_FALLBACK = [
  { x: -17, z: -17, y: 3.2 },
  { x: 17, z: -17, y: 3.2 },
  { x: -17, z: 17, y: 3.2 },
];

/**
 * Barrel candidates at district edges, in priority order. The first eight
 * that pass the placement rules become barrels (no dynamic lights — the
 * additive flame cone is the light source).
 * All are ≥ 6 m from spawns and ≥ 4 m from gates/POIs on the real layout.
 * @type {Array<{x: number, z: number, district: string}>}
 */
const BARREL_SPOTS = [
  { x: -50, z: -17, district: "safehouse" },
  { x: -50, z: 17, district: "safehouse" },
  { x: -97, z: -17, district: "safehouse" },
  { x: -27.5, z: -6, district: "quarantine" },
  { x: 27.5, z: 6, district: "quarantine" },
  { x: -27.5, z: 22, district: "quarantine" },
  { x: -122, z: 60, district: "docks" },
  { x: -122, z: 115, district: "docks" },
  { x: -30, z: 105, district: "docks" },
  { x: -30, z: 45, district: "docks" },
  { x: 24, z: 24, district: "quarantine" },
  { x: -118, z: 70, district: "docks" },
];

/** Arena-rim fallback (no city): still gives 8 edge barrels. */
const BARREL_SPOTS_FALLBACK = [
  { x: -16, z: -16, district: "level" },
  { x: 16, z: -16, district: "level" },
  { x: -16, z: 16, district: "level" },
  { x: 16, z: 16, district: "level" },
  { x: -20, z: 8, district: "level" },
  { x: 20, z: 8, district: "level" },
  { x: -8, z: 20, district: "level" },
  { x: 8, z: -20, district: "level" },
  { x: -26, z: -5, district: "level" },
  { x: 26, z: 5, district: "level" },
];

/**
 * Sandbag walls: residential street curbs, commercial plaza, quarantine rim.
 * @type {Array<{x: number, z: number, w: number}>}
 */
const SANDBAG_SPOTS = [
  { x: -84, z: -76.4, w: 3.0 },
  { x: -56, z: -63.6, w: 3.0 },
  { x: -112, z: -63.8, w: 2.8 },
  { x: 24, z: -103, w: 3.4 },
  { x: 104, z: -104, w: 3.4 },
  { x: 44, z: -78, w: 3.0 },
  { x: -22, z: -27, w: 3.0 },
  { x: 22, z: 27, w: 3.0 },
];

/** Arena-rim fallback sandbag walls. */
const SANDBAG_SPOTS_FALLBACK = [
  { x: -22, z: -27, w: 3.0 },
  { x: 22, z: 27, w: 3.0 },
  { x: -20, z: -20, w: 3.0 },
  { x: 20, z: 20, w: 3.0 },
];

/**
 * Abandoned cars (big colliders), kept off the driving lanes.
 * @type {Array<{x: number, z: number, hue: number}>}
 */
const CAR_SPOTS = [
  { x: -102, z: -76.2, hue: 0.58 },
  { x: -44, z: -76.0, hue: 0.02 },
  { x: 100, z: -100, hue: 0.09 },
  { x: 70, z: -105, hue: 0.35 },
];

/** Arena-rim fallback wrecks (still 4.4 × 2.0 colliders). */
const CAR_SPOTS_FALLBACK = [
  { x: -18, z: -8, hue: 0.58 },
  { x: 18, z: 8, hue: 0.02 },
];

/**
 * Traffic barricades (visual only, no collider).
 * @type {Array<{x: number, z: number}>}
 */
const BARRICADE_SPOTS = [
  { x: -72, z: -63.4 },
  { x: 30, z: -88 },
  { x: 34, z: -58 },
  { x: 24, z: 22 },
];

/** Arena-rim fallback barricades. */
const BARRICADE_SPOTS_FALLBACK = [
  { x: -6, z: 22 },
  { x: 6, z: -22 },
  { x: -22, z: 6 },
  { x: 22, z: -6 },
];

/**
 * Rubble clusters (pure visual, no colliders).
 * @type {Array<{x: number, z: number}>}
 */
const RUBBLE_SPOTS = [
  { x: -112, z: -76.8 },
  { x: -66, z: -63.0 },
  { x: -32, z: -79 },
  { x: -121, z: -60 },
  { x: 20, z: -108 },
  { x: 50, z: -76 },
  { x: 86, z: -110 },
  { x: 112, z: -92 },
  { x: 40, z: -115 },
  { x: -22, z: 23 },
  { x: 23, z: -22 },
  { x: 26, z: 20 },
];

/** Arena-rim fallback rubble. */
const RUBBLE_SPOTS_FALLBACK = [
  { x: -20, z: 4 },
  { x: 20, z: -4 },
  { x: -4, z: 20 },
  { x: 4, z: -20 },
  { x: -6, z: 16 },
  { x: 14, z: -6 },
];

/**
 * Puddles: street/plaza spots, no colliders. `sx`/`sz` are ellipse radii.
 * @type {Array<{x: number, z: number, sx: number, sz: number}>}
 */
const PUDDLE_SPOTS = [
  { x: -118, z: -70, sx: 2.2, sz: 0.9 },
  { x: -102, z: -72, sx: 1.5, sz: 0.7 },
  { x: -80, z: -69, sx: 2.6, sz: 1.1 },
  { x: -58, z: -71, sx: 1.7, sz: 0.8 },
  { x: -34, z: -67, sx: 2.0, sz: 0.6 },
  { x: 20, z: -92, sx: 2.8, sz: 1.2 },
  { x: 52, z: -86, sx: 1.8, sz: 0.9 },
  { x: 86, z: -106, sx: 2.3, sz: 1.0 },
  { x: 112, z: -88, sx: 1.5, sz: 0.7 },
  { x: 40, z: -118, sx: 2.1, sz: 0.9 },
  { x: 68, z: 3, sx: 1.9, sz: 0.7 },
  { x: -20, z: 20, sx: 1.7, sz: 0.8 },
  { x: 22, z: -6, sx: 1.4, sz: 0.6 },
];

/** Arena-rim fallback puddles. */
const PUDDLE_SPOTS_FALLBACK = [
  { x: -18, z: -18, sx: 1.6, sz: 0.8 },
  { x: 15, z: -16, sx: 1.5, sz: 0.7 },
  { x: -18, z: 18, sx: 1.7, sz: 0.8 },
  { x: 18, z: 18, sx: 1.4, sz: 0.7 },
  { x: -10, z: 8, sx: 1.5, sz: 0.6 },
  { x: 10, z: -8, sx: 1.3, sz: 0.6 },
  { x: -8, z: -20, sx: 1.8, sz: 0.7 },
  { x: 20, z: 10, sx: 1.4, sz: 0.6 },
];

/** Extra warm windows on facades, built directly from the city layout. */
const WINDOW_GLOWS = [
  // Residential — long faces (z ±5.06) and a few gable sides (x ±4.04).
  { x: -95.94, y: 3.7, z: -84.0, w: 1.05, h: 0.75, rot: Math.PI / 2, warm: true },
  { x: -88.5, y: 4.3, z: -109.92, w: 1.15, h: 0.7, rot: 0, warm: true },
  { x: -64.5, y: 4.0, z: -60.08, w: 1.0, h: 0.72, rot: Math.PI, warm: true },
  { x: -124.0, y: 3.5, z: -43.08, w: 0.95, h: 0.66, rot: Math.PI, warm: false },
  { x: -44.06, y: 5.0, z: -84.0, w: 1.1, h: 0.74, rot: -Math.PI / 2, warm: true },
  { x: -52.4, y: 3.3, z: -109.92, w: 0.95, h: 0.62, rot: 0, warm: true },
  { x: -73.06, y: 4.6, z: -86.5, w: 0.9, h: 0.68, rot: Math.PI / 2, warm: true },
  // Commercial shop fronts (z −61.97 / −117.97 face the plaza) + sides.
  { x: -3.5, y: 2.35, z: -61.96, w: 1.7, h: 0.95, rot: 0, warm: true },
  { x: 10.5, y: 2.35, z: -61.96, w: 1.7, h: 0.95, rot: 0, warm: false },
  { x: 24.5, y: 2.35, z: -61.96, w: 1.7, h: 0.95, rot: 0, warm: true },
  { x: 40.5, y: 2.35, z: -61.96, w: 1.7, h: 0.95, rot: 0, warm: true },
  { x: 56.5, y: 2.35, z: -61.96, w: 1.7, h: 0.95, rot: 0, warm: false },
  { x: 72.5, y: 2.35, z: -61.96, w: 1.7, h: 0.95, rot: 0, warm: true },
  { x: 8.5, y: 2.4, z: -117.96, w: 1.9, h: 1.0, rot: 0, warm: true },
  { x: 32.5, y: 2.4, z: -117.96, w: 1.9, h: 1.0, rot: 0, warm: true },
  { x: 62.5, y: 2.4, z: -117.96, w: 1.9, h: 1.0, rot: 0, warm: false },
  { x: 92.5, y: 2.4, z: -117.96, w: 1.9, h: 1.0, rot: 0, warm: true },
  { x: 76.06, y: 4.2, z: -66.5, w: 1.2, h: 0.8, rot: Math.PI / 2, warm: true },
];

// --- deterministic toolkit --------------------------------------------------

/**
 * Seeded PRNG (mulberry32) — private stream so city/vegetation changes never
 * reshuffle the set dressing.
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

/** Flat per-vertex color (pattern city.js / vegetation.js tintGeo). */
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

/** Vertical two-color gradient for the fake light shafts. */
function tintGeoVertical(geo, bottom, top, y0, y1) {
  const pos = geo.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const span = Math.max(1e-5, y1 - y0);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / span));
    c.copy(bottom).lerp(top, t);
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
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
 * Soft white radial dot for the halo / fireflies. Returns null in a headless
 * Node harness (no DOM) — the caller then skips the texture, never throws.
 * @param {number} size
 * @returns {THREE.CanvasTexture|null}
 */
function makeSoftDotTexture(size) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.22, "rgba(255,255,255,0.85)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.28)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Every spawn point: 6 district pools + legacy arena/zone points. */
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

/** Every gate gap center: district gate records + level gate waypoints. */
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
      /* legacy/mock level: district gate records above still cover it */
    }
  }
  return out;
}

/**
 * City-less fallback bounds: AABB of level.spawnPoints expanded 4 m, clamped
 * to the ±127 walkable footprint; ±30 arena when there are no spawn points.
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
 * Build the scenery layer. All geometry is static and merged; update() only
 * drives barrel flicker + firefly drift.
 * @param {import("three").Scene} scene
 * @param {import("./level.js").Level} level
 * @param {import("./city.js").City=} city
 */
export function createScenery(scene, level, city) {
  const rng = makeRng(SEED);
  const hasCity = !!(city && Array.isArray(city.districts) && city.districts.length > 0);
  const districts = hasCity ? city.districts : [];
  const spawns = collectSpawns(city, level);
  const gates = collectGates(city, level);
  const bounds = fallbackBounds(level);
  const canQueryBlocked = !!(level && typeof level.isBlocked === "function");
  const colliders = level && Array.isArray(level.colliders) ? level.colliders : null;

  let renderCount = 0;
  let lightCount = 0;
  let colliderCount = 0;

  const stats = {
    moonDiscs: 0,
    skylineBlocks: 0,
    skylineWindows: 0,
    lightShafts: 0,
    barrels: 0,
    barrelFlames: 0,
    barrelLights: 0,
    puddles: 0,
    rubbleClusters: 0,
    rubblePieces: 0,
    sandbagWalls: 0,
    sandbags: 0,
    abandonedCars: 0,
    barricades: 0,
    windowGlows: 0,
    fireflies: 0,
    collidersAdded: 0,
    drawCalls: 0,
    lightsAdded: 0,
  };

  /**
   * Add a renderable and count its draw call. Lights are counted separately.
   * @param {THREE.Object3D} obj
   */
  function addRenderable(obj) {
    scene.add(obj);
    renderCount++;
  }

  /**
   * Merge a geometry bucket into one static mesh.
   * @param {THREE.BufferGeometry[]} geos
   * @param {THREE.Material} mat
   * @param {string} name
   * @param {{cast?: boolean, receive?: boolean, solid?: boolean}} [opts]
   * @returns {THREE.Mesh|null}
   */
  function addMerged(geos, mat, name, opts) {
    if (!geos || geos.length === 0) return null;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) {
      console.warn("[scenery] merge failed for " + name);
      return null;
    }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = name;
    mesh.castShadow = opts && opts.cast === true;
    mesh.receiveShadow = !opts || opts.receive !== false;
    mesh.userData.solid = !!(opts && opts.solid === true);
    addRenderable(mesh);
    return mesh;
  }

  /** Push one scenery collider, counting it for stats. */
  function pushCollider(x, z, sx, sz) {
    if (!colliders) return;
    colliders.push(colliderOf(x, z, sx, sz));
    colliderCount++;
  }

  // --- placement rules -------------------------------------------------------

  /** @type {Array<{x: number, z: number, r: number}>} */
  const placed = [];

  /** Base geometry already accepted by the district bounds test. */
  function insideBounds(x, z, margin) {
    if (hasCity) {
      for (let i = 0; i < districts.length; i++) {
        const d = districts[i];
        const b = d && d.bounds;
        if (!b) continue;
        if (
          x >= b.minX + margin && x <= b.maxX - margin &&
          z >= b.minZ + margin && z <= b.maxZ - margin
        ) {
          return true;
        }
      }
      return false;
    }
    return (
      x >= bounds.minX + margin && x <= bounds.maxX - margin &&
      z >= bounds.minZ + margin && z <= bounds.maxZ - margin
    );
  }

  /** Pond + 1.5 m bank. */
  function inPond(x, z) {
    return (
      x > POND.minX - POND_PAD && x < POND.maxX + POND_PAD &&
      z > POND.minZ - POND_PAD && z < POND.maxZ + POND_PAD
    );
  }

  /**
   * Full static-prop test. `radius` is used for both isBlocked and prop-on-
   * prop spacing. Spawn/gate/POI distances are center-to-center.
   * @param {number} x
   * @param {number} z
   * @param {number} radius
   * @param {{gap?: number, spawn?: number, gate?: number, poiPad?: number,
   *   blocked?: boolean, props?: boolean, margin?: number}} [opts]
   */
  function canPlace(x, z, radius, opts) {
    const o = opts || {};
    if (!insideBounds(x, z, o.margin === undefined ? BOUNDS_MARGIN : o.margin)) return false;
    if (inPond(x, z)) return false;
    if (!clearOf(spawns, x, z, o.spawn === undefined ? MIN_SPAWN_DIST : o.spawn)) return false;
    if (!clearOf(gates, x, z, o.gate === undefined ? MIN_GATE_DIST : o.gate)) return false;
    const poiPad = o.poiPad || 0;
    for (let i = 0; i < POIS.length; i++) {
      const p = POIS[i];
      const dx = x - p.x;
      const dz = z - p.z;
      const r = p.r + poiPad;
      if (dx * dx + dz * dz < r * r) return false;
    }
    if (o.blocked !== false && canQueryBlocked && level.isBlocked(x, z, radius)) return false;
    if (o.props !== false) {
      const gap = o.gap === undefined ? 0.7 : o.gap;
      for (let i = 0; i < placed.length; i++) {
        const p = placed[i];
        const dx = x - p.x;
        const dz = z - p.z;
        const r = radius + p.r + gap;
        if (dx * dx + dz * dz < r * r) return false;
      }
    }
    return true;
  }

  /** Remember an accepted prop so later props do not overlap it. */
  function reserve(x, z, r) {
    placed.push({ x, z, r });
  }

  // ===========================================================================
  // 1. SKY — moon disc + soft halo (NO light)
  // ===========================================================================
  /** @type {THREE.Material|null} */
  let haloMaterial = null;
  {
    const dir = new THREE.Vector3(MOON_DIR.x, MOON_DIR.y, MOON_DIR.z).normalize();
    const pos = dir.multiplyScalar(MOON_DIST);
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(MOON_RADIUS, 40),
      new THREE.MeshBasicMaterial({ color: 0xeef4ff, fog: false, toneMapped: false })
    );
    moon.name = "scenery-moon";
    moon.position.copy(pos);
    moon.lookAt(0, 0, 0);
    addRenderable(moon);
    stats.moonDiscs = 1;

    const haloTexture = makeSoftDotTexture(128);
    if (haloTexture) {
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: haloTexture,
          color: 0x9fbcff,
          transparent: true,
          opacity: 0.6,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
          toneMapped: false,
        })
      );
      halo.name = "scenery-moon-halo";
      halo.position.copy(pos);
      halo.scale.set(HALO_SIZE, HALO_SIZE, 1);
      addRenderable(halo);
      haloMaterial = halo.material;
    }
  }

  // ===========================================================================
  // 2. SKYLINE — dark ring beyond the ±130 wall (fog:false horizon)
  // ===========================================================================
  {
    const silGeos = [];
    const winGeos = [];
    const silMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      fog: false,
      toneMapped: false,
    });
    const winMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      fog: false,
      toneMapped: false,
    });
    const c = new THREE.Color();
    for (let i = 0; i < SKYLINE_COUNT; i++) {
      const angle = (i / SKYLINE_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.06;
      const ringR = SKYLINE_RADIUS + rng() * 30;
      const x = Math.cos(angle) * ringR;
      const z = Math.sin(angle) * ringR;
      const w = 10 + rng() * 15;
      const d = 8 + rng() * 9;
      const h = 12 + rng() * 22 + (rng() < 0.12 ? rng() * 12 : 0);
      // Dark blue-grey blocks: just lighter than the 0x05070c sky so the
      // silhouette separates from it while staying a horizon.
      c.setHSL(0.59, 0.18, 0.075 + rng() * 0.025);
      const box = new THREE.BoxGeometry(w, h, d);
      box.rotateY(rng() * Math.PI);
      box.translate(x, h / 2 - 1.5, z);
      silGeos.push(tintGeo(box, c));
      stats.skylineBlocks++;

      // A few tiny windows on the inward face. Each is a small protruding
      // box so it reads from every angle without a second billboard pass.
      const windows = (rng() * 5) | 0;
      const sideX = Math.cos(angle);
      const sideZ = Math.sin(angle);
      const lateralX = -sideZ;
      const lateralZ = sideX;
      for (let wi = 0; wi < windows; wi++) {
        const lift = 3 + rng() * Math.max(2, h - 6);
        const lateral = (rng() - 0.5) * w * 0.68;
        const wx = x - sideX * (d / 2 + 0.25) + lateralX * lateral;
        const wz = z - sideZ * (d / 2 + 0.25) + lateralZ * lateral;
        const win = new THREE.BoxGeometry(0.9 + rng() * 0.5, 0.55 + rng() * 0.3, 0.22);
        win.rotateY(angle);
        win.translate(wx, lift, wz);
        c.setHSL(0.075 + rng() * 0.03, 0.82, 0.5 + rng() * 0.16);
        winGeos.push(tintGeo(win, c));
        stats.skylineWindows++;
      }
    }
    addMerged(silGeos, silMat, "scenery-skyline", { cast: false, receive: false });
    addMerged(winGeos, winMat, "scenery-skyline-windows", { cast: false, receive: false });
  }

  // ===========================================================================
  // 3. STREET LIGHT SHAFTS — nested additive cones, one merged draw
  // ===========================================================================
  {
    const shaftGeos = [];
    const shafts = hasCity ? SHAFTS : SHAFTS_FALLBACK;
    const warmBottom = new THREE.Color(0x120b04);
    const warmTop = new THREE.Color(0xffb45e);
    const coldBottom = new THREE.Color(0x09121a);
    const coldTop = new THREE.Color(0xa8cfff);
    for (let i = 0; i < shafts.length; i++) {
      const s = shafts[i];
      const cold = s.warm === false;
      // Layer 1: wide, very faint cone. Layer 2: narrow, brighter core.
      const layers = [
        { topR: 0.16, baseR: 2.65, opacity: 0.26 },
        { topR: 0.1, baseR: 1.05, opacity: 0.34 },
      ];
      for (let li = 0; li < layers.length; li++) {
        const L = layers[li];
        const geo = new THREE.CylinderGeometry(L.topR, L.baseR, s.y, 12, 1, true);
        geo.translate(0, s.y / 2, 0);
        geo.translate(s.x, 0, s.z);
        tintGeoVertical(geo, cold ? coldBottom : warmBottom, cold ? coldTop : warmTop, 0, s.y);
        shaftGeos.push(geo);
      }
      stats.lightShafts++;
    }
    const shaftMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    addMerged(shaftGeos, shaftMat, "scenery-light-shafts", {
      cast: false,
      receive: false,
      solid: false,
    });
  }

  // ===========================================================================
  // 4. FIRE BARRELS — 8 bodies, 8 flames, NO PointLights
  // ===========================================================================
  /** @type {Array<{x: number, z: number, light: THREE.PointLight|null,
   *   flame: THREE.Mesh, phase: number, sp1: number, sp2: number,
   *   spin: number, scale: number, base: number}>} */
  const barrels = [];
  {
    const spots = hasCity ? BARREL_SPOTS : BARREL_SPOTS_FALLBACK;
    const chosen = [];
    for (let i = 0; i < spots.length && chosen.length < BARREL_COUNT; i++) {
      const s = spots[i];
      if (!canPlace(s.x, s.z, 0.95, { gap: 0.9 })) continue;
      reserve(s.x, s.z, 0.95);
      pushCollider(s.x, s.z, 0.7, 0.7);
      chosen.push(s);
    }

    // Merged bodies (all barrels = one draw call).
    const bodyGeos = [];
    const rust = new THREE.Color();
    for (let i = 0; i < chosen.length; i++) {
      const b = chosen[i];
      rust.setHSL(0.055 + rng() * 0.02, 0.38, 0.13 + rng() * 0.04);
      const body = new THREE.CylinderGeometry(0.33, 0.3, 0.86, 10);
      body.translate(b.x, 0.43, b.z);
      bodyGeos.push(tintGeo(body, rust));
      const rimTint = new THREE.Color(0x24160f);
      for (const ry of [0.18, 0.7]) {
        const rim = new THREE.CylinderGeometry(0.355, 0.355, 0.075, 10);
        rim.translate(b.x, ry, b.z);
        bodyGeos.push(tintGeo(rim, rimTint));
      }
      const top = new THREE.CylinderGeometry(0.29, 0.29, 0.03, 10);
      top.translate(b.x, 0.865, b.z);
      bodyGeos.push(tintGeo(top, new THREE.Color(0x0a0806)));
    }
    const barrelMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.55,
    });
    addMerged(bodyGeos, barrelMat, "scenery-barrel-bodies", {
      cast: true,
      receive: true,
      solid: true,
    });

    // One additive flame cone per barrel — individually animated.
    const flameGeo = new THREE.ConeGeometry(0.27, 0.92, 7, 1, false);
    flameGeo.translate(0, 0.46, 0);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff7a2a,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: true,
    });
    // No barrel PointLights: every barrel reads through its additive flame
    // cone (and the city district lamps own the warm pools). This keeps the
    // forward shader at 12 visible lights instead of 15.
    for (let i = 0; i < chosen.length; i++) {
      const b = chosen[i];
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.name = "scenery-barrel-flame";
      flame.position.set(b.x, 0.85, b.z);
      const s = 0.86 + rng() * 0.28;
      flame.scale.set(s, s, s);
      addRenderable(flame);
      stats.barrelFlames++;

      const light = null;
      barrels.push({
        x: b.x,
        z: b.z,
        light,
        flame,
        phase: rng() * Math.PI * 2,
        sp1: 7 + rng() * 5,
        sp2: 15 + rng() * 11,
        spin: (rng() - 0.5) * 1.4,
        scale: s,
        base: 7.5,
      });
      stats.barrels++;
    }
    stats.lightsAdded = lightCount;
    stats.barrelLights = lightCount;
  }

  // ===========================================================================
  // 5. DEBRIS & BARRICADES
  // ===========================================================================
  {
    const chunkGeos = [];
    const rockGeos = [];
    const bagGeos = [];
    const carGeos = [];
    const barricadeGeos = [];
    const c = new THREE.Color();

    // --- rubble clusters (pure visual) --------------------------------------
    const rubbleSpots = hasCity ? RUBBLE_SPOTS : RUBBLE_SPOTS_FALLBACK;
    for (let i = 0; i < rubbleSpots.length; i++) {
      const s = rubbleSpots[i];
      if (!canPlace(s.x, s.z, 1.0, { gap: 0.35, blocked: true })) continue;
      reserve(s.x, s.z, 1.0);
      const pieces = 6 + ((rng() * 4) | 0);
      for (let p = 0; p < pieces; p++) {
        const a = rng() * Math.PI * 2;
        const rad = rng() * 1.25;
        const px = s.x + Math.cos(a) * rad;
        const pz = s.z + Math.sin(a) * rad;
        if (rng() < 0.72) {
          const sx = 0.22 + rng() * 0.55;
          const sy = 0.18 + rng() * 0.45;
          const sz = 0.22 + rng() * 0.55;
          const geo = new THREE.BoxGeometry(sx, sy, sz);
          geo.rotateY(rng() * Math.PI);
          geo.rotateZ((rng() - 0.5) * 0.45);
          geo.translate(px, sy * 0.5 + 0.02, pz);
          c.setHSL(0.08 + rng() * 0.02, 0.06, 0.12 + rng() * 0.06);
          chunkGeos.push(tintGeo(geo, c));
        } else {
          const r = 0.16 + rng() * 0.3;
          const geo = new THREE.DodecahedronGeometry(r, 0);
          geo.scale(1 + rng() * 0.7, 0.7 + rng() * 0.5, 1 + rng() * 0.5);
          geo.rotateY(rng() * Math.PI);
          geo.translate(px, r * 0.6, pz);
          c.setHSL(0.07 + rng() * 0.02, 0.05, 0.1 + rng() * 0.05);
          rockGeos.push(tintGeo(geo, c));
        }
        stats.rubblePieces++;
      }
      stats.rubbleClusters++;
    }

    // --- sandbag walls (big items: collider 3.0 × 0.7) ---------------------
    const sandbagSpots = hasCity ? SANDBAG_SPOTS : SANDBAG_SPOTS_FALLBACK;
    for (let i = 0; i < sandbagSpots.length; i++) {
      const s = sandbagSpots[i];
      if (!canPlace(s.x, s.z, 1.75, { gap: 0.8 })) continue;
      reserve(s.x, s.z, 1.75);
      pushCollider(s.x, s.z, s.w, 0.7);
      const rows = 3;
      for (let row = 0; row < rows; row++) {
        const n = 5 - row;
        for (let j = 0; j < n; j++) {
          const bag = new THREE.BoxGeometry(0.62, 0.28, 0.44);
          bag.rotateY((rng() - 0.5) * 0.18);
          bag.translate(
            s.x + (j - (n - 1) / 2) * 0.62 + (row % 2 ? 0.06 : 0),
            0.15 + row * 0.27,
            s.z + (rng() - 0.5) * 0.06
          );
          c.setHSL(0.1 + rng() * 0.02, 0.16 + rng() * 0.08, 0.28 + rng() * 0.08);
          bagGeos.push(tintGeo(bag, c));
          stats.sandbags++;
        }
      }
      stats.sandbagWalls++;
    }

    // --- abandoned cars (big items: collider 4.4 × 2.0) ---------------------
    const carSpots = hasCity ? CAR_SPOTS : CAR_SPOTS_FALLBACK;
    for (let i = 0; i < carSpots.length; i++) {
      const s = carSpots[i];
      if (!canPlace(s.x, s.z, 2.6, { gap: 1.0 })) continue;
      reserve(s.x, s.z, 2.6);
      pushCollider(s.x, s.z, 4.4, 2.0);
      // Body + hood + cabin + wheels, all axis-aligned along X (matches the
      // 4.4 × 2.0 collider city.js uses for its own wrecks).
      c.setHSL(s.hue, 0.36, 0.14 + rng() * 0.05);
      const body = new THREE.BoxGeometry(4.3, 0.85, 1.9);
      body.translate(s.x, 0.66, s.z);
      carGeos.push(tintGeo(body, c));
      const hood = new THREE.BoxGeometry(1.15, 0.28, 1.8);
      hood.rotateZ(-0.08);
      hood.translate(s.x + 1.65, 1.05, s.z);
      carGeos.push(tintGeo(hood, c.clone().offsetHSL(0, 0, -0.02)));
      const cabin = new THREE.BoxGeometry(1.9, 0.62, 1.55);
      cabin.rotateY(0.04);
      cabin.translate(s.x - 0.35, 1.38, s.z);
      carGeos.push(tintGeo(cabin, new THREE.Color(0x0a0d12)));
      const wheelTint = new THREE.Color(0x070809);
      for (const wx of [-1.45, 1.45]) {
        for (const wz of [-0.95, 0.95]) {
          const wheel = new THREE.BoxGeometry(0.62, 0.55, 0.3);
          wheel.translate(s.x + wx, 0.28, s.z + wz);
          carGeos.push(tintGeo(wheel, wheelTint));
        }
      }
      stats.abandonedCars++;
    }

    // --- traffic barricades (visual only) -----------------------------------
    const barricadeSpots = hasCity ? BARRICADE_SPOTS : BARRICADE_SPOTS_FALLBACK;
    for (let i = 0; i < barricadeSpots.length; i++) {
      const s = barricadeSpots[i];
      if (!canPlace(s.x, s.z, 0.9, { gap: 0.4 })) continue;
      reserve(s.x, s.z, 0.9);
      const woodTint = new THREE.Color(0x3a2a18);
      for (const lx of [-1.0, 1.0]) {
        const leg = new THREE.BoxGeometry(0.13, 1.0, 0.16);
        leg.translate(s.x + lx, 0.5, s.z);
        barricadeGeos.push(tintGeo(leg, woodTint));
      }
      for (const ly of [0.55, 0.92]) {
        const plank = new THREE.BoxGeometry(2.45, 0.2, 0.09);
        plank.translate(s.x, ly, s.z);
        // Uneven amber/charcoal blocks read as hazard stripes at night.
        for (let k = -2; k <= 2; k++) {
          const stripe = new THREE.BoxGeometry(0.42, 0.21, 0.1);
          stripe.translate(s.x + k * 0.49, ly, s.z + 0.01);
          c.setHSL(k % 2 === 0 ? 0.08 : 0.0, 0.7, k % 2 === 0 ? 0.42 : 0.11);
          barricadeGeos.push(tintGeo(stripe, c));
        }
        barricadeGeos.push(tintGeo(plank, woodTint));
      }
      stats.barricades++;
    }

    const debrisMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.05,
    });
    const bagMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.98,
      metalness: 0,
    });
    const carMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.6,
      metalness: 0.35,
    });
    const barricadeMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.05,
    });
    addMerged(chunkGeos, debrisMat, "scenery-rubble-chunks", { cast: false, receive: true });
    addMerged(rockGeos, debrisMat, "scenery-rubble-rocks", { cast: false, receive: true });
    addMerged(bagGeos, bagMat, "scenery-sandbags", { cast: true, receive: true, solid: true });
    addMerged(carGeos, carMat, "scenery-wrecked-cars", { cast: true, receive: true, solid: true });
    addMerged(barricadeGeos, barricadeMat, "scenery-barricades", { cast: false, receive: true });
  }

  // ===========================================================================
  // 6. PUDDLES — merged flat metallic discs, no colliders
  // ===========================================================================
  {
    const geos = [];
    const puddleSpots = hasCity ? PUDDLE_SPOTS : PUDDLE_SPOTS_FALLBACK;
    for (let i = 0; i < puddleSpots.length; i++) {
      const s = puddleSpots[i];
      if (!canPlace(s.x, s.z, 0.5, { gap: 0.1, blocked: true, props: false })) continue;
      const geo = new THREE.CircleGeometry(1, 14);
      geo.rotateX(-Math.PI / 2);
      geo.scale(s.sx, 1, s.sz);
      geo.rotateY(rng() * Math.PI);
      geo.translate(s.x, 0.032, s.z);
      geos.push(geo);
      stats.puddles++;
    }
    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x101820,
      roughness: 0.1,
      metalness: 0.88,
      emissive: 0x0a1a22,
      emissiveIntensity: 0.32,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    addMerged(geos, puddleMat, "scenery-puddles", {
      cast: false,
      receive: false,
      solid: false,
    });
  }

  // ===========================================================================
  // 7. FIREFLIES / DUST — one 220-point system, animated in place
  // ===========================================================================
  const fireflyBase = new Float32Array(FIREFLY_COUNT * 3);
  const fireflyPhase = new Float32Array(FIREFLY_COUNT * 2);
  const fireflySpeed = new Float32Array(FIREFLY_COUNT);
  let fireflyPoints = null;
  {
    const pos = new Float32Array(FIREFLY_COUNT * 3);
    const col = new Float32Array(FIREFLY_COUNT * 3);
    const tint = new THREE.Color();
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      let x;
      let z;
      let y;
      if (!hasCity) {
        // Legacy arena: a soft cloud over the 60 × 60 fight space.
        x = -24 + rng() * 48;
        z = -24 + rng() * 48;
        y = 0.6 + rng() * 2.6;
      } else {
        const zone = i < 120 ? 0 : i < 170 ? 1 : 2;
        if (zone === 0) {
          // Park: over the lawns and around the pond.
          x = 2 + rng() * 118;
          z = 34 + rng() * 92;
          y = 0.7 + rng() * 3.2;
        } else if (zone === 1) {
          // Commercial plaza / main street corridor.
          x = 18 + rng() * 100;
          z = -110 + rng() * 36;
          y = 1.0 + rng() * 3.0;
        } else {
          // Residential main street between the townhouse rows.
          x = -126 + rng() * 102;
          z = -78 + rng() * 16;
          y = 1.0 + rng() * 3.0;
        }
      }
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      fireflyBase[i * 3] = x;
      fireflyBase[i * 3 + 1] = y;
      fireflyBase[i * 3 + 2] = z;
      fireflyPhase[i * 2] = rng() * Math.PI * 2;
      fireflyPhase[i * 2 + 1] = rng() * Math.PI * 2;
      fireflySpeed[i] = 0.35 + rng() * 0.9;
      // Mostly pale green; a few warm amber dust motes.
      if (rng() < 0.18) tint.setHSL(0.09, 0.74, 0.62);
      else tint.setHSL(0.26 + rng() * 0.05, 0.5, 0.6 + rng() * 0.18);
      col[i * 3] = tint.r;
      col[i * 3 + 1] = tint.g;
      col[i * 3 + 2] = tint.b;
    }
    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pos, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", posAttr);
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const dot = makeSoftDotTexture(32);
    const mat = new THREE.PointsMaterial({
      size: dot ? 0.22 : 0.14,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      map: dot || null,
      alphaTest: dot ? 0.02 : 0,
      fog: true,
    });
    fireflyPoints = new THREE.Points(geo, mat);
    fireflyPoints.name = "scenery-fireflies";
    fireflyPoints.frustumCulled = false; // drift can leave the baked bounds
    addRenderable(fireflyPoints);
    stats.fireflies = FIREFLY_COUNT;
  }

  // ===========================================================================
  // 8. EXTRA WINDOW GLOW — warm quads on residential / commercial facades
  // ===========================================================================
  if (hasCity) {
    const geos = [];
    const c = new THREE.Color();
    for (let i = 0; i < WINDOW_GLOWS.length; i++) {
      const g = WINDOW_GLOWS[i];
      const geo = new THREE.PlaneGeometry(g.w, g.h);
      geo.rotateY(g.rot);
      geo.translate(g.x, g.y, g.z);
      if (g.warm) c.setHSL(0.075 + rng() * 0.025, 0.78, 0.55 + rng() * 0.15);
      else c.setHSL(0.55 + rng() * 0.04, 0.55, 0.48 + rng() * 0.1);
      geos.push(tintGeo(geo, c));
      stats.windowGlows++;
    }
    const glowMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: true,
    });
    addMerged(geos, glowMat, "scenery-window-glow", {
      cast: false,
      receive: false,
      solid: false,
    });
  }

  // ===========================================================================
  // per-frame
  // ===========================================================================
  let time = 0;
  /** @type {THREE.BufferAttribute|null} */
  const fireflyAttr = fireflyPoints
    ? /** @type {THREE.BufferAttribute} */ (fireflyPoints.geometry.attributes.position)
    : null;

  /**
   * Advance fireplace flicker, flame scale and the firefly drift.
   * `playerPos` is accepted for API symmetry with atmosphere.update and is
   * safe to omit (all animation is world-space).
   * @param {number} dt
   * @param {{x: number, z: number}=} playerPos
   */
  function update(dt, playerPos) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    time += dt;
    if (time > 10000) time = 0;

    // --- barrels -----------------------------------------------------------
    for (let i = 0; i < barrels.length; i++) {
      const b = barrels[i];
      const wobble =
        0.78 +
        0.16 * Math.sin(time * b.sp1 + b.phase) +
        0.06 * Math.sin(time * b.sp2 + b.phase * 1.7);
      if (b.light) b.light.intensity = b.base * wobble;
      b.flame.scale.set(
        b.scale * (0.94 + 0.06 * Math.sin(time * b.sp2 + b.phase)),
        b.scale * (0.72 + 0.44 * wobble),
        b.scale * (0.94 + 0.06 * Math.cos(time * b.sp1 + b.phase))
      );
      b.flame.rotation.y = time * b.spin + b.phase;
    }

    // --- moon halo breathing (very subtle) ---------------------------------
    if (haloMaterial) haloMaterial.opacity = 0.56 + 0.04 * Math.sin(time * 0.35);

    // --- firefly drift (no allocation; one attribute upload) ---------------
    if (fireflyAttr) {
      const arr = /** @type {Float32Array} */ (fireflyAttr.array);
      for (let i = 0; i < FIREFLY_COUNT; i++) {
        const p1 = fireflyPhase[i * 2];
        const p2 = fireflyPhase[i * 2 + 1];
        const sp = fireflySpeed[i];
        arr[i * 3] = fireflyBase[i * 3] + Math.sin(time * sp + p1) * 1.35;
        arr[i * 3 + 1] =
          fireflyBase[i * 3 + 1] + Math.sin(time * sp * 0.7 + p1 * 1.7) * 0.38;
        arr[i * 3 + 2] = fireflyBase[i * 3 + 2] + Math.cos(time * sp * 0.85 + p2) * 1.35;
      }
      fireflyAttr.needsUpdate = true;
    }
  }

  stats.drawCalls = renderCount;
  stats.collidersAdded = colliderCount;
  stats.lightsAdded = lightCount;
  stats.barrelLights = lightCount;

  return { update, stats };
}
