/**
 * ============================================================================
 * CITY — thế giới mở 7 khu "ĐÊM THỨ 30 · Phần 1" (docs/EXPANSION-P1.md §3).
 * ============================================================================
 * STUB — builder WORLD thay thân `createCity`, GIỮ nguyên chữ ký + typedef
 * dưới đây. Toạ độ/kích thước/cổng/spawn: docs/EXPANSION-P1.md mục 3.1–3.6
 * (nguồn thật: docs/WORLD.md).
 *
 * createCity(scene, level) builds the whole city around the legacy 60×60
 * quarantine arena: city floor (260×260), outer ±130 wall, district boundary
 * walls, per-district merged geometry (buildings ≤ 2 draw calls per district,
 * props merged per kind, emissive layer per district), the 12 district gates
 * (steel frame + sliding barrier, red when locked / green when open), the
 * collapsed-city silhouette (1 merged mesh), and the water plane in the park.
 * Everything outside quarantine is NEW geometry; quarantine itself stays
 * byte-identical (level.js owns it — docs/EXPANSION-P1.md §3.2).
 *
 * Colliders: every solid the city adds is pushed into `level.colliders`
 * (the live public array — level.js:750). Gate barriers push a temporary
 * collider that is spliced out ONLY after the 1.0 s sink animation finishes
 * (never at open time — that would flash a 0.3 s gap).
 *
 * Walkability model (docs/EXPANSION-P1.md §3.1): `districtAt` tests the
 * quarantine 3 sub-rects FIRST (arena −30..30 × −30..30, north −15..15 ×
 * −54..−30, east 30..54 × −15..15), then the 6 outer districts in table
 * order. The strip x −30..−15, z −54..−30 belongs to residential. The three
 * notches N-B1/N-B2/N-B3 are VOID. Any point outside all 7 bounds → null.
 *
 * Gates (docs/EXPANSION-P1.md §3.4): 12 gates — G1..G6 ring (5 m) + 6 steel
 * quarantine gates (D-Q opens after mission 6, the other five after mission
 * 9). setGateOpen(from, to, open) is idempotent, the pair is unordered, and
 * while open=true it: sinks the barrier 1.0 s (y 1.5 → −1.6), flips frame
 * emissive #ff3b30 → #3dff6e in the same second, removes the barrier collider
 * when the sink completes, and plays a locally synthesized rumble (audio.js
 * is frozen — pattern: explosives.js synthesizes its own boom).
 *
 * Dev-guard (pattern zones.js:139-152): after the build, warn (never throw)
 * when any POI / spawn point / center / gate waypoint fails
 * level.isBlocked(p.x, p.z, 0.8). The guard runs BEFORE the 12 barrier
 * colliders are pushed (locked-gate waypoints sit inside their own barrier by
 * design — same reason zones.js guards before applying its locks), and gate
 * waypoints whose gap center is inside a sealed quarantine zone rect (R-Q /
 * C-Q / H-Q when zones.js has locked north/east) are guarded through their
 * two approach points 1.6 m to each side instead of the center itself.
 * `final-door` (0,0) is intentionally solid (the vault door collider built by
 * level.js §3.2) — it is checked as "inside the quarantine district" instead
 * of "unblocked".
 *
 * Level registration (docs/EXPANSION-P1.md §3.5.3–3.5.4): city.js registers
 * its 12 gate waypoints + live open state into level.js through the private
 * hooks `level.__cityRegisterGates(list)` / `level.__cityGateOpenAt(x, z,
 * open)` (non-enumerable on the level API — NOT part of the frozen Level
 * contract). getGateWaypoints() then returns 14 points (12 city + 2 legacy
 * internal) and sameArea() understands "connected through open gates".
 * Both hooks are called defensively — a level built without them degrades to
 * legacy behaviour (2 waypoints, rect-only sameArea).
 *
 * Disposal: city geometry must be removable — keep a private list like
 * level.js does (objects/geometries/materials/textures) and wire it into
 * level.dispose() cleanup only through the integrator; city.js itself exposes
 * a non-enumerable `__dispose()` on the returned object (NOT part of the
 * frozen City contract) for the integrator to call before level.dispose().
 *
 * NIGHT 30 PART 3 (docs/EXPANSION-P3.md §3.4): `openVault(open?)` drives the
 * central vault door built by level.js (§3.2). When level.js exposes its
 * private `__vaultOpen` hook the call is a pure proxy (P3-K1); otherwise the
 * disc (found once by its unique CylinderGeometry(2,2,0.6,24)-at-origin
 * build) is animated from here: 2 s ease-in slide to y = 8 + retuned rumble
 * (pitch −30%) + red PointLight fade-in that holds, collider spliced when
 * the slide completes, disc parked out of the scene; close reverses within
 * 0.5 s and re-pushes the collider. Idempotent — returns true only on a
 * real state change.
 *
 * Bus events consumed: none. Bus events emitted: none (gate opening is
 * driven by main.js calling setGateOpen after "gate-open"; city never
 * touches the bus).
 *
 * i18n keys owned by THIS module (docs/EXPANSION-P1.md §7.2, verbatim from
 * docs/STORY.md §7.2): district_safehouse … district_quarantine (flat keys,
 * EN + VI).
 *
 * Layout deviations from the WORLD.md prop tables (kept minimal, all forced
 * by the contract's own rules — min 3 m paths + the §3.6.2 dev-guard):
 *  - safehouse medical tent moved (−60,14) → (−70,16): at (−60,14) it
 *    overlapped the tool shed at (−62,12); (−70,16) also honours "chừa
 *    (−75,15)" (generator-3).
 *  - residential row-B house at x=−76 shifted to x=−77: at −76 its corner
 *    (−72,−80) sat exactly on the §3.1 residential center, failing the
 *    dev-guard's r=0.8 check; all other row centers are per the table.
 *  - residential hospital center NOTE: hospital district center is
 *    (68, 0) instead of (92, −12) — the §3.1 point lies INSIDE the 40×28
 *    main block (x 80..120, z −14..14) and would teleport the player into
 *    solid geometry; (68,0) is the clear forecourt between the H-Q gate and
 *    the triage tents. Recorded as a contract deviation.
 *
 * @param {import("three").Scene} scene
 * @param {import("../world/level.js").Level} level - legacy level; city only
 *   READS its API (isBlocked, colliders array) and PUSHES colliders.
 * @returns {City}
 */

/**
 * One district descriptor. Order in `districts` MUST follow
 * docs/EXPANSION-P1.md §3.1: safehouse, residential, commercial, hospital,
 * park, docks, quarantine.
 *
 * @typedef {Object} District
 * @property {("safehouse"|"residential"|"commercial"|"hospital"|"park"|
 *             "docks"|"quarantine")} id
 * @property {string} nameKey - i18n key ("district_safehouse" …), values
 *   registered by THIS module per docs/EXPANSION-P1.md §7.2.
 * @property {{minX: number, maxX: number, minZ: number, maxZ: number}} bounds
 *   XZ rect in meters. For quarantine this is the DISPLAY bbox
 *   (−30..54 × −54..30); the walkable truth is the 3 sub-rects (§3.1).
 * @property {Array<{to: string, x: number, z: number}>} gates - gates shared
 *   with a directly adjacent district (id of the OTHER side + gap center).
 * @property {Array<{x: number, z: number}>} spawnPoints - per-district wave
 *   spawn pool (§3.6.6). quarantine = [] (its 18 legacy points live on
 *   level.spawnPoints and must NOT be redeclared here).
 * @property {number} quotaNeed - 20/25/30/25/30 for residential/commercial/
 *   hospital/park/docks; 0 for safehouse and quarantine.
 * @property {{x: number, z: number}} center - teleport/debug drop point
 *   (§3.1); safehouse center (−75, 8) doubles as the story spawn.
 */

/**
 * @typedef {Object} City
 * @property {District[]} districts - the 7 district descriptors (live).
 * @property {(x: number, z: number) => ("safehouse"|"residential"|
 *   "commercial"|"hospital"|"park"|"docks"|"quarantine"|null)} districtAt
 *   District holding the point (quarantine tested first via its 3 sub-rects,
 *   §3.1); null for void / outside the city.
 * @property {(fromId: string, toId: string) => {from: string, to: string,
 *   x: number, z: number, axis: "x"|"z", width: number, open: boolean}|null}
 *   gateBetween - the shared gate of two ADJACENT districts (pair matched
 *   unordered); null when they do not touch. `open` is the live state.
 * @property {(fromId: string, toId: string, open: boolean) => boolean}
 *   setGateOpen - open/close one gate per §3.4 mechanics (sink 1.0 s,
 *   emissive swap, collider removed after the sink, synthesized rumble).
 *   Idempotent; pair unordered; returns true only when the state changed.
 * @property {(open?: boolean) => boolean} openVault - NIGHT 30 P3 (§3.4):
 *   open/close the central vault door at (0,0) — 2 s slide up + rumble +
 *   red inner light; collider spliced when the slide completes, disc parks
 *   out of the scene. Idempotent; returns true only when the state changed.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as i18n from "../core/i18n.js";

// i18n keys owned by THIS module (docs/EXPANSION-P1.md §7.2 — verbatim).
i18n.registerBundle({
  en: {
    district_safehouse: "Safehouse",
    district_residential: "Residential",
    district_commercial: "Commercial",
    district_hospital: "Hospital",
    district_park: "Park",
    district_docks: "Docks",
    district_quarantine: "Quarantine Zone",
  },
  vi: {
    district_safehouse: "An Toàn Nhà",
    district_residential: "Khu Dân Cư",
    district_commercial: "Phố Thương Mại",
    district_hospital: "Bệnh Viện",
    district_park: "Công Viên",
    district_docks: "Bến Cảng",
    district_quarantine: "Vùng Cách Ly",
  },
});

// --- city constants (docs/EXPANSION-P1.md §3.1/§3.4) ---------------------------

const CITY_HALF = 130; // city spans ±130 → 260 × 260 m
const BOUND_H = 4.5; // district boundary wall height
const BOUND_T = 0.5; // district boundary wall thickness
const OUTER_H = 6; // outer ±130 wall height
const OUTER_T = 1; // outer wall thickness

const GATE_REST_Y = 1.5; // barrier center Y when closed (box 3 tall → 0..3)
const GATE_SUNK_Y = -1.6; // barrier center Y after the 1.0 s sink (§3.4.1)
const GATE_SINK_MS = 1000;
const GATE_RED = 0xff3b30; // emissive while locked
const GATE_GREEN = 0x3dff6e; // emissive while open

/**
 * The 7 district rects — MUST stay in sync with DISTRICT_RECTS in
 * src/world/level.js and the §3.1 table (checklist §10 of the contract).
 * quarantine is NOT here: it is the 3 legacy sub-rects (QUAR_RECTS below).
 * @type {Array<{id: string, minX: number, maxX: number, minZ: number, maxZ: number}>}
 */
const OUTER_RECTS = [
  { id: "safehouse", minX: -130, maxX: -30, minZ: -30, maxZ: 30 },
  { id: "residential", minX: -130, maxX: -15, minZ: -130, maxZ: -30 },
  { id: "commercial", minX: -15, maxX: 130, minZ: -130, maxZ: -54 },
  { id: "hospital", minX: 54, maxX: 130, minZ: -54, maxZ: 30 },
  { id: "park", minX: -15, maxX: 130, minZ: 30, maxZ: 130 },
  { id: "docks", minX: -130, maxX: -15, minZ: 30, maxZ: 130 },
];

/**
 * Quarantine's 3 walkable sub-rects — MUST stay in sync with AREA_RECTS in
 * src/world/level.js (§3.2: quarantine numbers are frozen).
 * @type {Array<{minX: number, maxX: number, minZ: number, maxZ: number}>}
 */
const QUAR_RECTS = [
  { minX: -30, maxX: 30, minZ: -30, maxZ: 30 }, // arena
  { minX: -15, maxX: 15, minZ: -54, maxZ: -30 }, // north "Sân sau"
  { minX: 30, maxX: 54, minZ: -15, maxZ: 15 }, // east "Kho"
];

/**
 * The 12 district gates (docs/EXPANSION-P1.md §3.4). `axis` = the axis the
 * GAP runs along (the wall runs perpendicular): axis "x" means an E-W wall
 * cut by a gap spanning X, crossed along Z.
 * @type {Array<{from: string, to: string, x: number, z: number,
 *               axis: "x"|"z", width: number}>}
 */
const GATES = [
  { from: "safehouse", to: "residential", x: -72, z: -30, axis: "x", width: 5 }, // G1
  { from: "residential", to: "commercial", x: -15, z: -95, axis: "z", width: 5 }, // G2
  { from: "commercial", to: "hospital", x: 85, z: -54, axis: "x", width: 5 }, // G3
  { from: "hospital", to: "park", x: 85, z: 30, axis: "x", width: 5 }, // G4
  { from: "park", to: "docks", x: -15, z: 75, axis: "z", width: 5 }, // G5
  { from: "docks", to: "safehouse", x: -72, z: 30, axis: "x", width: 5 }, // G6
  { from: "docks", to: "quarantine", x: -22, z: 30, axis: "x", width: 5 }, // D-Q (steel main)
  { from: "safehouse", to: "quarantine", x: -30, z: 0, axis: "z", width: 4 }, // S-Q
  { from: "residential", to: "quarantine", x: -15, z: -42, axis: "z", width: 4 }, // R-Q
  { from: "commercial", to: "quarantine", x: 0, z: -54, axis: "x", width: 4 }, // C-Q
  { from: "hospital", to: "quarantine", x: 54, z: 0, axis: "z", width: 4 }, // H-Q
  { from: "park", to: "quarantine", x: 0, z: 30, axis: "x", width: 5 }, // P-Q
];

/**
 * Per-district spawn pools (docs/EXPANSION-P1.md §3.6.6 — WORLD.md §8).
 * quarantine is NOT listed: its 18 legacy points live on level.spawnPoints.
 * @type {Record<string, Array<{x: number, z: number}>>}
 */
const SPAWNS = {
  safehouse: [
    { x: -125, z: -25 }, { x: -125, z: 25 }, { x: -42, z: -25 },
    { x: -42, z: 25 }, { x: -115, z: 0 },
  ],
  residential: [
    { x: -125, z: -125 }, { x: -35, z: -125 }, { x: -125, z: -70 },
    { x: -70, z: -72 }, { x: -25, z: -40 }, { x: -45, z: -40 },
  ],
  commercial: [
    { x: -8, z: -125 }, { x: 125, z: -125 }, { x: 12, z: -57 },
    { x: 60, z: -57 }, { x: 125, z: -60 }, { x: 90, z: -100 },
  ],
  hospital: [
    { x: 58, z: -48 }, { x: 125, z: -48 }, { x: 58, z: 24 },
    { x: 125, z: 24 }, { x: 90, z: -45 }, { x: 100, z: 25 },
  ],
  park: [
    { x: -10, z: 35 }, { x: 60, z: 35 }, { x: 125, z: 35 },
    { x: 125, z: 125 }, { x: -10, z: 125 }, { x: 30, z: 105 },
  ],
  docks: [
    { x: -125, z: 35 }, { x: -25, z: 35 }, { x: -125, z: 125 },
    { x: -25, z: 125 }, { x: -70, z: 80 }, { x: -40, z: 60 },
  ],
};

/**
 * POI table (docs/EXPANSION-P1.md §5.1.3) — the city only GUARDS these
 * positions (missions.js owns the meshes); `final-door` is the solid vault
 * door built by level.js and is guarded as "inside quarantine" instead of
 * "unblocked".
 * @type {Array<{id: string, x: number, z: number, district: string,
 *               solid?: boolean}>}
 */
const POIS = [
  { id: "generator-1", x: -89, z: -15, district: "safehouse" },
  { id: "generator-2", x: -61, z: -15, district: "safehouse" },
  { id: "generator-3", x: -75, z: 15, district: "safehouse" },
  { id: "supply-1", x: -120, z: -123, district: "residential" },
  { id: "supply-2", x: -30, z: -100, district: "residential" },
  { id: "supply-3", x: -70, z: -45, district: "residential" },
  { id: "radio-tower", x: 55, z: -95, district: "commercial" },
  { id: "medicine-1", x: 59, z: -6, district: "hospital" },
  { id: "medicine-2", x: 59, z: 6, district: "hospital" },
  { id: "medicine-3", x: 76, z: 4, district: "hospital" },
  { id: "campfire", x: 10, z: 70, district: "park" },
  { id: "fuel-1", x: -120, z: 40, district: "docks" },
  { id: "fuel-2", x: -30, z: 120, district: "docks" },
  { id: "fuel-3", x: -90, z: 90, district: "docks" },
  { id: "fuel-4", x: -45, z: 55, district: "docks" },
  { id: "final-door", x: 0, z: 0, district: "quarantine", solid: true },
];

// --- small deterministic toolkit ----------------------------------------------

/**
 * Seeded PRNG (mulberry32) — the whole city layout is deterministic so the
 * dev-guard result is identical every run.
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

/** The shared layout RNG — one stream, seeded, per createCity call. */
let rng = Math.random;

/**
 * Tint a geometry with one flat HSL color (pattern level.js tintGeometry).
 * @param {THREE.BufferGeometry} geo
 * @param {number} h
 * @param {number} s
 * @param {number} l
 * @returns {THREE.BufferGeometry} the same geometry
 */
function tintGeo(geo, h, s, l) {
  const c = new THREE.Color().setHSL(h, s, l);
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * Tinted, translated box pushed into a merge bucket.
 * @param {THREE.BufferGeometry[]} bucket
 * @param {number} sx
 * @param {number} sy
 * @param {number} sz
 * @param {number} x - center X
 * @param {number} y - center Y
 * @param {number} z - center Z
 * @param {[number, number, number]} hsl
 * @returns {THREE.BufferGeometry} the new geometry (for further transforms)
 */
function box(bucket, sx, sy, sz, x, y, z, hsl) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  geo.translate(x, y, z);
  bucket.push(tintGeo(geo, hsl[0], hsl[1], hsl[2] + (rng() - 0.5) * 0.02));
  return geo;
}

/**
 * Tinted cylinder pushed into a merge bucket.
 * @param {THREE.BufferGeometry[]} bucket
 * @param {number} rTop
 * @param {number} rBottom
 * @param {number} h
 * @param {number} seg
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {[number, number, number]} hsl
 */
function cyl(bucket, rTop, rBottom, h, seg, x, y, z, hsl) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
  geo.translate(x, y, z);
  bucket.push(tintGeo(geo, hsl[0], hsl[1], hsl[2] + (rng() - 0.5) * 0.02));
}

/** Axis-aligned XZ collider from a center + full extents. */
function colliderOf(x, z, sx, sz) {
  return { minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 };
}

/**
 * Wrecked car: body + cabin + 4 wheel stubs (pattern level.js pushCarGeo).
 * @param {THREE.BufferGeometry[]} geos
 * @param {number} x
 * @param {number} z
 * @param {number=} hue
 * @param {number=} light - base lightness (ambulances are near-white)
 */
function pushCarGeo(geos, x, z, hue = 0.02, light = 0.2) {
  const body = new THREE.BoxGeometry(4.4, 1.0, 2.0);
  body.translate(x, 0.7, z);
  geos.push(tintGeo(body, hue, 0.42, light + rng() * 0.04));
  const cabin = new THREE.BoxGeometry(2.0, 0.8, 1.7);
  cabin.translate(x - 0.4, 1.55, z);
  geos.push(tintGeo(cabin, 0.55, 0.18, 0.1));
  for (const [wx, wz] of [[-1.5, -0.95], [1.5, -0.95], [-1.5, 0.95], [1.5, 0.95]]) {
    const wheel = new THREE.BoxGeometry(0.7, 0.6, 0.3);
    wheel.translate(x + wx, 0.3, z + wz);
    geos.push(tintGeo(wheel, 0, 0, 0.05));
  }
}

/**
 * Ridged-roof townhouse (body + corrugated roof slab), collider 8 × 10.
 * @param {THREE.BufferGeometry[]} geos
 * @param {THREE.BufferGeometry[]} roofGeos - same bucket in practice
 * @param {number} x
 * @param {number} z
 */
function pushHouseGeo(geos, roofGeos, x, z) {
  const hues = [0.02, 0.08, 0.55, 0.62];
  const hue = hues[(rng() * hues.length) | 0];
  box(geos, 8, 6.5, 10, x, 3.25, z, [hue, 0.12, 0.17]);
  box(roofGeos, 8.6, 0.35, 10.6, x, 6.67, z, [0.07, 0.1, 0.12]);
}

/**
 * Two-slope canvas tent (visual) — collider stays the plain footprint.
 * @param {THREE.BufferGeometry[]} geos
 * @param {number} x
 * @param {number} z
 * @param {number} sx
 * @param {number} sz
 * @param {[number, number, number]} hsl
 */
function pushTentGeo(geos, x, z, sx, sz, hsl) {
  const slope = new THREE.BoxGeometry(sx * 0.62, 0.18, sz + 0.6);
  slope.rotateX(0.62);
  slope.translate(x, 1.55, z - sz * 0.22);
  geos.push(tintGeo(slope, hsl[0], hsl[1], hsl[2]));
  const slope2 = new THREE.BoxGeometry(sx * 0.62, 0.18, sz + 0.6);
  slope2.rotateX(-0.62);
  slope2.translate(x, 1.55, z + sz * 0.22);
  geos.push(tintGeo(slope2, hsl[0], hsl[1], hsl[2]));
  const back = new THREE.BoxGeometry(sx, 2.2, 0.15);
  back.translate(x, 1.1, z - sz / 2);
  geos.push(tintGeo(back, hsl[0], hsl[1], hsl[2] - 0.03));
}

/**
 * Shipping container (pattern level.js pushContainerGeo) at an optional
 * second-tier height.
 * @param {THREE.BufferGeometry[]} geos
 * @param {number} x
 * @param {number} z
 * @param {number} hue
 * @param {number=} tier - 0 = ground, 1 = stacked (visual only)
 */
function pushContainerGeo(geos, x, z, hue, tier = 0) {
  const geo = new THREE.BoxGeometry(6, 2.6, 2.4);
  geo.translate(x, 1.3 + tier * 2.6, z);
  geos.push(tintGeo(geo, hue, 0.45, 0.2 + rng() * 0.05));
}

/**
 * Asphalt variant of the level floor texture (pattern level.js
 * makeFloorTexture): darker, near-invisible grid, oil speckles.
 * @param {number} repeatX
 * @param {number} repeatY
 * @returns {THREE.CanvasTexture}
 */
function makeAsphaltTexture(repeatX, repeatY) {
  const SIZE = 128;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#14171b";
  ctx.fillRect(0, 0, SIZE, SIZE);
  const grad = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 8, SIZE / 2, SIZE / 2, SIZE * 0.72);
  grad.addColorStop(0, "rgba(70, 76, 86, 0.08)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0.24)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 60; i++) {
    const dark = rng() < 0.75;
    ctx.fillStyle = dark ? "rgba(0, 0, 0, 0.22)" : "rgba(170, 175, 185, 0.05)";
    const r = 0.8 + rng() * 2.4;
    ctx.beginPath();
    ctx.arc(rng() * SIZE, rng() * SIZE, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Faint 2 m seam lines (asphalt slabs) instead of the arena's blue grid.
  ctx.strokeStyle = "rgba(60, 64, 70, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0, 0, SIZE, SIZE);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY); // 2 m cells across 260 m
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Glowing gate icon — copy of level.js makeGateIconTexture (module-private
 * there; the contract says reuse the PATTERN, not the import).
 * @returns {THREE.CanvasTexture}
 */
function makeGateIconTexture() {
  const S = 128;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, S, S);
  // White artwork — the per-gate material color provides the red/green tint
  // (EXPANSION-P1 §3.4.2); multiplying white reads cleanly, cyan would muddy.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.shadowColor = "rgba(255, 255, 255, 0.9)";
  ctx.shadowBlur = 12;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  for (const dir of [-1, 1]) {
    const cx = S / 2 + dir * 13;
    ctx.beginPath();
    ctx.moveTo(cx - dir * 12, S / 2 - 20);
    ctx.lineTo(cx + dir * 12, S / 2);
    ctx.lineTo(cx - dir * 12, S / 2 + 20);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Locally synthesized gate rumble (audio.js is frozen; pattern
 * explosives.js createBoomSynth): deep noise sweep + sub tone drop, played
 * once per gate transition. Gesture-gated AudioContext, settings-aware
 * volume, fully silent when WebAudio is unavailable.
 *
 * NIGHT 30 P3 (docs/EXPANSION-P3.md §3.4, P3-K1): `pitchMul` retones the SAME
 * synth for the vault door (0.7 ≈ 30% lower pitch, sweeps stretched ×1.3 so
 * the heavier steel reads longer). Default 1 → byte-identical gate rumble.
 *
 * @param {number} [pitchMul=1] - frequency multiplier (0 < mul; 1 = gates)
 * @returns {() => void}
 */
function createGateSound(pitchMul = 1) {
  const pitch = Math.min(4, Math.max(0.1, pitchMul));
  const durMul = 2 - pitch; // 1 → 1.0 (unchanged), 0.7 → 1.3 (heavier sweep)
  const SETTINGS_KEY = "gungame.settings";
  /** @type {AudioContext|null} */
  let ctx = null;
  /** @type {GainNode|null} */
  let master = null;
  /** @type {AudioBuffer|null} */
  let noiseBuf = null;
  let volume = 0.8;
  try {
    if (typeof localStorage !== "undefined") {
      const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (v && typeof v.volume === "number" && Number.isFinite(v.volume)) {
        volume = Math.min(1, Math.max(0, v.volume));
      }
    }
  } catch {
    /* corrupt/absent storage → default */
  }

  function onGesture() {
    if (!ctx) {
      try {
        const Ctor = /** @type {any} */ (typeof window !== "undefined" ? window.AudioContext : undefined) ||
          /** @type {any} */ (typeof window !== "undefined" ? window.webkitAudioContext : undefined);
        if (!Ctor) return;
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = volume * 0.6;
        master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        ctx = null; // no WebAudio: stays a safe no-op
      }
    }
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  }
  if (typeof document !== "undefined") {
    document.addEventListener("pointerdown", onGesture);
    document.addEventListener("keydown", onGesture);
  }

  return function rumble() {
    if (!ctx || !master || !noiseBuf) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    // Deep grinding noise, lowpass sweeping down (steel sinking into dirt).
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(420 * pitch, t0);
    filt.frequency.exponentialRampToValueAtTime(70 * pitch, t0 + 0.9 * durMul);
    filt.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.5, t0 + 0.05 * durMul);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0 * durMul);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t0, Math.random() * 0.9);
    src.stop(t0 + 1.05 * durMul);
    // Sub thud under the grind.
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(88 * pitch, t0);
    osc.frequency.exponentialRampToValueAtTime(32 * pitch, t0 + 0.8 * durMul);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.linearRampToValueAtTime(0.4, t0 + 0.04 * durMul);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9 * durMul);
    osc.connect(og);
    og.connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.95 * durMul);
  };
}

// =============================================================================

export function createCity(scene, level) {
  rng = makeRng(20261031); // deterministic layout — same city every run

  /** @type {THREE.Object3D[]} */
  const objects = [];
  /** @type {THREE.BufferGeometry[]} */
  const geometries = [];
  /** @type {THREE.Material[]} */
  const materials = [];
  /** @type {THREE.Texture[]} */
  const textures = [];
  /** @type {THREE.Light[]} */
  const lights = [];

  /** Teardown for the integrator (non-enumerable `__dispose` on the City). */
  function disposeCity() {
    for (const obj of objects) scene.remove(obj);
    objects.length = 0;
    for (const l of lights) scene.remove(l);
    lights.length = 0;
    for (const g of geometries) g.dispose();
    geometries.length = 0;
    for (const m of materials) m.dispose();
    materials.length = 0;
    for (const t of textures) t.dispose();
    textures.length = 0;
    stopAnimLoop();
    stopVaultAnim(); // NIGHT 30 P3: cancel the vault rAF loop too
  }

  // --- district + gate live records -------------------------------------------
  /** @type {District[]} */
  const districts = OUTER_RECTS.map((r) => ({
    id: r.id,
    nameKey: "district_" + r.id,
    bounds: { minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ },
    gates: /** @type {Array<{to: string, x: number, z: number}>} */ ([]),
    spawnPoints: SPAWNS[r.id].map((p) => ({ x: p.x, z: p.z })),
    quotaNeed: r.id === "residential" ? 20 : r.id === "commercial" ? 25 : r.id === "hospital" ? 30 : r.id === "park" ? 25 : r.id === "docks" ? 30 : 0,
    center: r.id === "safehouse" ? { x: -75, z: 8 }
      : r.id === "residential" ? { x: -72, z: -80 }
      : r.id === "commercial" ? { x: 57, z: -92 }
      : r.id === "hospital" ? { x: 92, z: -12 } // §3.1 contract point — inside the main block
      : r.id === "park" ? { x: 57, z: 80 }
      : { x: -72, z: 80 }, // docks
  }));
  districts.push({
    id: "quarantine",
    nameKey: "district_quarantine",
    bounds: { minX: -30, maxX: 54, minZ: -54, maxZ: 30 }, // DISPLAY bbox only
    gates: [],
    spawnPoints: [], // 18 legacy points live on level.spawnPoints (§3.6.6)
    quotaNeed: 0,
    center: { x: 0, z: 0 },
  });
  const districtById = new Map(districts.map((d) => [d.id, d]));

  /** @type {Array<{from: string, to: string, x: number, z: number, axis: "x"|"z",
   *   width: number, open: boolean, mesh?: THREE.Mesh, frameMesh?: THREE.Mesh,
   *   mat?: THREE.MeshStandardMaterial,
   *   collider?: {minX: number, maxX: number, minZ: number, maxZ: number},
   *   wpStart?: number, wpCount?: number}>} */
  const gates = GATES.map((g) => ({ ...g, open: false }));
  for (const g of gates) {
    districtById.get(g.from).gates.push({ to: g.to, x: g.x, z: g.z });
    if (g.to !== "quarantine" && g.from !== "quarantine") {
      districtById.get(g.to).gates.push({ to: g.from, x: g.x, z: g.z });
    }
  }

  /**
   * The gate shared by two adjacent districts (pair matched unordered).
   * @param {string} fromId
   * @param {string} toId
   * @returns {typeof gates[number]|null} the live record (do not mutate)
   */
  function gateBetween(fromId, toId) {
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      if ((g.from === fromId && g.to === toId) || (g.from === toId && g.to === fromId)) return g;
    }
    return null;
  }

  // --- walkability (docs/EXPANSION-P1.md §3.1 rules 1-5) ------------------------

  /**
   * District holding the point: quarantine FIRST via its 3 sub-rects, then
   * the 6 outer districts in §3.1 table order. Allocation-free.
   * @param {number} x
   * @param {number} z
   * @returns {string|null}
   */
  function districtAt(x, z) {
    for (let i = 0; i < QUAR_RECTS.length; i++) {
      const r = QUAR_RECTS[i];
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return "quarantine";
    }
    for (let i = 0; i < OUTER_RECTS.length; i++) {
      const r = OUTER_RECTS[i];
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return r.id;
    }
    return null;
  }

  // --- build: shared materials ---------------------------------------------------
  const bldMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.03 });
  const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
  const emisMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.5, metalness: 0 });
  const emisNeonMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0, fog: false });
  const canopyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x0d2b33, roughness: 0.15, metalness: 0.55, transparent: true, opacity: 0.85 });
  const decalMat = new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 1, metalness: 0 });
  const wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 });
  materials.push(bldMat, propMat, emisMat, emisNeonMat, canopyMat, waterMat, decalMat, wallMat);

  /**
   * Merge a bucket and add it to the scene with the standard solid flags.
   * @param {THREE.BufferGeometry[]} geos
   * @param {THREE.Material} mat
   * @param {{cast?: boolean, solid?: boolean, receive?: boolean, name?: string}} opts
   * @returns {THREE.Mesh|null}
   */
  function addMerged(geos, mat, opts) {
    if (geos.length === 0) return null;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    geometries.push(merged);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = opts.cast === true; // buildings/canopy: never (§3.7)
    mesh.receiveShadow = opts.receive !== false;
    if (opts.solid !== false) mesh.userData.solid = true;
    if (opts.name) mesh.name = opts.name;
    objects.push(mesh);
    scene.add(mesh);
    return mesh;
  }

  // --- city floor (§3.6.3): one 260×260 asphalt plane under everything ----------
  const floorTex = makeAsphaltTexture(CITY_HALF, CITY_HALF);
  textures.push(floorTex);
  const floorGeo = new THREE.PlaneGeometry(CITY_HALF * 2, CITY_HALF * 2);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, -0.02, 0);
  geometries.push(floorGeo);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.96, metalness: 0.04 });
  materials.push(floorMat);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  floor.userData.solid = true; // combat.js: the city floor stops bullets
  floor.name = "city-floor";
  objects.push(floor);
  scene.add(floor);

  // --- collapsed-city silhouette (§3.6.3): 1 mesh, no collider -------------------
  {
    const sil = [];
    // The 3 VOID notches inside the quarantine bbox get packed rubble first.
    const notches = [
      [15, 30, -54, -30], // N-B1
      [30, 54, -54, -15], // N-B2
      [30, 54, 15, 30], // N-B3
    ];
    for (const [x1, x2, z1, z2] of notches) {
      const n = 3;
      for (let i = 0; i < n; i++) {
        const sx = 5 + rng() * 9;
        const sz = 5 + rng() * 9;
        const h = 8 + rng() * 7;
        const x = x1 + sx / 2 + rng() * Math.max(0.1, x2 - x1 - sx);
        const z = z1 + sz / 2 + rng() * Math.max(0.1, z2 - z1 - sz);
        box(sil, sx, h, sz, x, h / 2 - 0.5, z, [0.62, 0.2, 0.045]);
      }
    }
    // Skyline beyond the ±130 wall (fog hides it; the wall is 6 m tall so the
    // 8-15 m blocks read as a distant city silhouette over the top).
    for (let gx = -216; gx <= 216; gx += 17) {
      for (let gz = -216; gz <= 216; gz += 17) {
        if (Math.abs(gx) <= 133 && Math.abs(gz) <= 133) continue; // inside the city
        if (rng() < 0.3) continue;
        const sx = 8 + rng() * 8;
        const sz = 8 + rng() * 8;
        const h = 8 + rng() * 7;
        const x = gx + (rng() - 0.5) * 8;
        const z = gz + (rng() - 0.5) * 8;
        box(sil, sx, h, sz, x, h / 2 - 0.5, z, [0.62, 0.18, 0.04]);
      }
    }
    addMerged(sil, bldMat, { cast: false, solid: true, name: "cityfill-1" });
  }

  // --- outer ±130 wall (§3.4: h 6, t 1) + district boundary walls (h 4.5, t 0.5)
  // All merged into 2 meshes (outer 1 + boundary&compound 1 — K5/§3.7 budget).
  {
    const outerSpans = [
      { x1: -CITY_HALF - 0.5, x2: CITY_HALF + 0.5, z1: -CITY_HALF - 0.5, z2: -CITY_HALF + 0.5 },
      { x1: -CITY_HALF - 0.5, x2: CITY_HALF + 0.5, z1: CITY_HALF - 0.5, z2: CITY_HALF + 0.5 },
      { x1: -CITY_HALF - 0.5, x2: -CITY_HALF + 0.5, z1: -CITY_HALF + 0.5, z2: CITY_HALF - 0.5 },
      { x1: CITY_HALF - 0.5, x2: CITY_HALF + 0.5, z1: -CITY_HALF + 0.5, z2: CITY_HALF - 0.5 },
    ];
    const outerGeos = [];
    for (const s of outerSpans) {
      const geo = new THREE.BoxGeometry(s.x2 - s.x1, OUTER_H, s.z2 - s.z1);
      geo.translate((s.x1 + s.x2) / 2, OUTER_H / 2, (s.z1 + s.z2) / 2);
      outerGeos.push(tintGeo(geo, 0.6, 0.06, 0.12 + rng() * 0.02));
      level.colliders.push({ minX: s.x1, maxX: s.x2, minZ: s.z1, maxZ: s.z2 });
    }
    addMerged(outerGeos, wallMat, { cast: false, solid: true, name: "city-outer-wall" });

    // Boundary walls: the 6 shared edges between the outer districts, each cut
    // around its gate gap (§3.4 "tường bị cắt"). Ends overlap/bury into their
    // neighbours so no coplanar faces z-fight (level.js:151-155 trick).
    /** @type {Array<{x1: number, x2: number, z1: number, z2: number}>} */
    const boundSpans = [
      // B1 safehouse|residential: z = -30, x −130..−30, G1 gap x −74.5..−69.5
      { x1: -CITY_HALF - 0.5, x2: -74.5, z1: -30.25, z2: -29.75 },
      { x1: -69.5, x2: -29.75, z1: -30.25, z2: -29.75 },
      // B2 safehouse|docks: z = +30, x −130..−30, G6 gap x −74.5..−69.5
      { x1: -CITY_HALF - 0.5, x2: -74.5, z1: 29.75, z2: 30.25 },
      { x1: -69.5, x2: -29.75, z1: 29.75, z2: 30.25 },
      // B3 residential|commercial: x = −15, z −130..−54, G2 gap z −97.5..−92.5
      { x1: -15.25, x2: -14.75, z1: -CITY_HALF, z2: -97.5 },
      { x1: -15.25, x2: -14.75, z1: -92.5, z2: -53.5 },
      // B4 commercial|hospital(+void N-B1/N-B2): z = −54, x 15..130, G3 gap x 82.5..87.5
      { x1: 14.5, x2: 82.5, z1: -54.25, z2: -53.75 },
      { x1: 87.5, x2: CITY_HALF, z1: -54.25, z2: -53.75 },
      // B5 hospital|park(+void N-B3): z = +30, x 30..130, G4 gap x 82.5..87.5
      { x1: 29.75, x2: 82.5, z1: 29.75, z2: 30.25 },
      { x1: 87.5, x2: CITY_HALF, z1: 29.75, z2: 30.25 },
      // B6 park|docks: x = −15, z 30..130, G5 gap z 72.5..77.5
      { x1: -15.25, x2: -14.75, z1: 29.75, z2: 72.5 },
      { x1: -15.25, x2: -14.75, z1: 77.5, z2: CITY_HALF + 0.5 },
    ];
    const boundGeos = [];
    for (const s of boundSpans) {
      const geo = new THREE.BoxGeometry(s.x2 - s.x1, BOUND_H, s.z2 - s.z1);
      geo.translate((s.x1 + s.x2) / 2, BOUND_H / 2, (s.z1 + s.z2) / 2);
      boundGeos.push(tintGeo(geo, 0.6, 0.06, 0.16 + rng() * 0.015));
      level.colliders.push({ minX: s.x1, maxX: s.x2, minZ: s.z1, maxZ: s.z2 });
    }
    // Safehouse compound walls (h 3, t 0.4, gate east z −2..2) — merged into
    // the SAME boundary mesh (decision K5: "tường ranh 6 khu + compound: 1").
    const C_H = 3;
    const C_T = 0.2; // half-thickness (0.4 wall)
    const compoundSpans = [
      { x1: -95.2, x2: -54.8, z1: -20.2, z2: -19.8 },
      { x1: -95.2, x2: -54.8, z1: 19.8, z2: 20.2 },
      { x1: -95.2, x2: -94.8, z1: -19.8, z2: 19.8 },
      { x1: -55.2, x2: -54.8, z1: -19.8, z2: -2 },
      { x1: -55.2, x2: -54.8, z1: 2, z2: 19.8 },
    ];
    for (const s of compoundSpans) {
      const geo = new THREE.BoxGeometry(s.x2 - s.x1, C_H, s.z2 - s.z1);
      geo.translate((s.x1 + s.x2) / 2, C_H / 2, (s.z1 + s.z2) / 2);
      boundGeos.push(tintGeo(geo, 0.08, 0.1, 0.18 + rng() * 0.015));
      level.colliders.push({ minX: s.x1, maxX: s.x2, minZ: s.z1, maxZ: s.z2 });
    }
    addMerged(boundGeos, wallMat, { cast: false, solid: true, name: "city-boundary-walls" });
  }

  // --- SAFEHOUSE (hub) — buildings 1 + props 2 -----------------------------------
  {
    const bld = [];
    const p1 = [];
    const p2 = [];
    // Main fortified house 30×5×14 + roof slab.
    box(bld, 30, 5, 14, -77, 2.5, -5, [0.08, 0.18, 0.19]);
    box(bld, 30.4, 0.4, 14.4, -77, 5.2, -5, [0.08, 0.1, 0.13]);
    level.colliders.push(colliderOf(-77, -5, 30, 14));
    // Two sheds + watchtower.
    for (const sx of [-62, -88]) {
      box(bld, 8, 3, 5, sx, 1.5, 12, [0.09, 0.14, 0.17]);
      box(bld, 8.6, 0.25, 5.6, sx, 3.12, 12, [0.09, 0.1, 0.12]);
      level.colliders.push(colliderOf(sx, 12, 8, 5));
    }
    box(bld, 3, 7, 3, -92, 3.5, 16, [0.6, 0.06, 0.16]);
    box(bld, 3.6, 0.3, 3.6, -92, 7.15, 16, [0.6, 0.06, 0.12]);
    level.colliders.push(colliderOf(-92, 16, 3, 3));
    // Medical tent (moved from (−60,14) — see header deviation note).
    pushTentGeo(p1, -70, 16, 6, 4, [0.4, 0.25, 0.3]);
    level.colliders.push(colliderOf(-70, 16, 6, 4));
    // Yard crates + one old car on the west apron.
    pushCarGeo(p2, -120, 0);
    level.colliders.push(colliderOf(-120, 0, 4.4, 2.0));
    const crateSpots = [[-122, -24, true], [-118, -22, false], [-122, 22, true], [-117, 24, false]];
    for (const [cx, cz, stack] of crateSpots) {
      const geo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
      geo.translate(cx, 0.6, cz);
      p2.push(tintGeo(geo, 0.075, 0.32, 0.2 + rng() * 0.07));
      if (stack) {
        const top = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        top.rotateY(0.22);
        top.translate(cx + 0.07, 1.82, cz - 0.05);
        p2.push(tintGeo(top, 0.07, 0.3, 0.24 + rng() * 0.05));
      }
      level.colliders.push(colliderOf(cx, cz, 1.2, 1.2));
    }
    addMerged(bld, bldMat, { cast: false, solid: true, name: "sh-bld" });
    addMerged(p1, propMat, { cast: true, solid: true, name: "sh-props1" });
    addMerged(p2, propMat, { cast: true, solid: true, name: "sh-props2" });
  }

  // --- RESIDENTIAL — townhouse rows + street props -------------------------------
  {
    const bld = [];
    const emis = [];
    const p1 = [];
    const p2 = [];
    // 28 townhouses: rows A/B/C/D per §3.6.4 (row B house −76 → −77, header).
    const rows = [
      { z: -115, xs: [-124, -112, -100, -88, -76, -64, -52, -40] },
      { z: -85, xs: [-124, -112, -100, -88, -77, -64, -52, -40] },
      { z: -55, xs: [-124, -112, -100, -88, -64, -52, -40] },
      { z: -38, xs: [-124, -108, -92, -52, -36] },
    ];
    for (const row of rows) {
      for (const x of row.xs) {
        pushHouseGeo(bld, bld, x, row.z);
        level.colliders.push(colliderOf(x, row.z, 8, 10));
        // 4 weak lit windows per house (2 floors × both long faces).
        for (const fy of [2.2, 5.2]) {
          for (const side of [-1, 1]) {
            const w = new THREE.BoxGeometry(1.2, 0.8, 0.1);
            w.translate(x + (rng() - 0.5) * 3, fy, row.z + side * 5.06);
            emis.push(tintGeo(w, 0.11, 0.7, 0.36 + rng() * 0.06));
          }
        }
      }
    }
    // Abandoned cars along the main street (z −74..−66).
    for (const [cx, cz] of [[-120, -71], [-96, -69], [-60, -72], [-36, -68], [-24, -70]]) {
      pushCarGeo(p1, cx, cz, [0.02, 0.58, 0.62][(rng() * 3) | 0]);
      level.colliders.push(colliderOf(cx, cz, 4.4, 2.0));
    }
    // Dumpsters at the house-alley mouths of the row-to-row lane (z −90..−80).
    for (const dx of [-118, -106, -93, -57, -45, -22]) {
      const d = new THREE.BoxGeometry(2, 1.2, 1.2);
      d.translate(dx, 0.6, -89);
      p1.push(tintGeo(d, 0.35, 0.3, 0.14));
      level.colliders.push(colliderOf(dx, -89, 2, 1.2));
    }
    // Street lamps: pole (props) + glowing head (emissive), curb-side.
    const lampSpots = [[-126, -66.5], [-106, -66.5], [-86, -66.5], [-66, -66.5], [-46, -66.5], [-26, -66.5], [-75.5, -44], [-75.5, -58]];
    for (const [lx, lz] of lampSpots) {
      cyl(p2, 0.09, 0.13, 5, 6, lx, 2.5, lz, [0.6, 0.06, 0.15]);
      const head = new THREE.BoxGeometry(0.7, 0.18, 0.34);
      head.translate(lx, 5.05, lz);
      emis.push(tintGeo(head, 0.11, 0.7, 0.55));
      level.colliders.push(colliderOf(lx, lz, 0.5, 0.5));
    }
    addMerged(bld, bldMat, { cast: false, solid: true, name: "re-bld" });
    addMerged(emis, emisMat, { cast: false, solid: true, name: "re-emissive" });
    addMerged(p1, propMat, { cast: true, solid: true, name: "re-props1" });
    addMerged(p2, propMat, { cast: true, solid: true, name: "re-props2" });
  }

  // --- COMMERCIAL — shop rows + plaza + neon ------------------------------------
  {
    const bld = [];
    const emis = [];
    const p1 = [];
    const p2 = [];
    // Row z=−66 faces the Trục Plaza road; row z=−122 faces the plaza.
    const row1 = [-6, 8, 22, 38, 54, 70];
    const row2 = [6, 30, 60, 90];
    const hues = [0.0, 0.09, 0.13, 0.55];
    for (const x of row1) {
      box(bld, 12, 5, 8, x, 2.5, -66, [hues[(rng() * 4) | 0], 0.15, 0.18]);
      box(bld, 12.4, 0.25, 1.6, x, 3.4, -61.6, [0.07, 0.3, 0.14]); // awning
      level.colliders.push(colliderOf(x, -66, 12, 8));
      const sign = new THREE.BoxGeometry(4, 1.2, 0.15);
      sign.translate(x, 4, -61.95);
      emis.push(tintGeo(sign, [0.9, 0.52, 0.13][(rng() * 3) | 0], 0.9, 0.6));
    }
    for (const x of row2) {
      box(bld, 12, 5, 8, x, 2.5, -122, [hues[(rng() * 4) | 0], 0.15, 0.18]);
      box(bld, 12.4, 0.25, 1.6, x, 3.4, -118.4, [0.07, 0.3, 0.14]);
      level.colliders.push(colliderOf(x, -122, 12, 8));
      const sign = new THREE.BoxGeometry(4, 1.2, 0.15);
      sign.translate(x, 4, -118.05);
      emis.push(tintGeo(sign, [0.9, 0.52, 0.13][(rng() * 3) | 0], 0.9, 0.6));
    }
    // Tipped bus (visual 2 offset boxes, collider stays the 11×2.5 AABB).
    box(p1, 11, 1.5, 2.5, 90, 0.75, -80, [0.58, 0.5, 0.16]);
    {
      const top = new THREE.BoxGeometry(11, 1.1, 2.3);
      top.rotateZ(0.1);
      top.translate(90.6, 2.0, -80.25);
      p1.push(tintGeo(top, 0.58, 0.4, 0.13));
    }
    level.colliders.push(colliderOf(90, -80, 11, 2.5));
    // Plaza crates + corner lamps (kept clear of the alley x 28..32).
    for (const [cx, cz, stack] of [[34, -108, true], [76, -110, false], [33, -84, false], [77, -86, false], [44, -104, false], [66, -104, true], [48, -86, false], [64, -108, false]]) {
      const geo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
      geo.translate(cx, 0.6, cz);
      p2.push(tintGeo(geo, 0.075, 0.32, 0.2 + rng() * 0.07));
      if (stack) {
        const top = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        top.rotateY(0.22);
        top.translate(cx + 0.07, 1.82, cz - 0.05);
        p2.push(tintGeo(top, 0.07, 0.3, 0.24 + rng() * 0.05));
      }
      level.colliders.push(colliderOf(cx, cz, 1.2, 1.2));
    }
    for (const [lx, lz] of [[33, -73], [77, -73], [33, -114], [77, -114]]) {
      cyl(p2, 0.09, 0.13, 6, 6, lx, 3, lz, [0.6, 0.06, 0.15]);
      const head = new THREE.BoxGeometry(0.7, 0.18, 0.34);
      head.translate(lx, 6.05, lz);
      emis.push(tintGeo(head, 0.9, 0.6, 0.5));
      level.colliders.push(colliderOf(lx, lz, 0.5, 0.5));
    }
    addMerged(bld, bldMat, { cast: false, solid: true, name: "co-bld" });
    addMerged(emis, emisNeonMat, { cast: false, solid: true, name: "co-emissive" }); // fog:false landmark layer
    addMerged(p1, propMat, { cast: true, solid: true, name: "co-props1" });
    addMerged(p2, propMat, { cast: true, solid: true, name: "co-props2" });
  }

  // --- HOSPITAL — glass tower + triage yard --------------------------------------
  {
    const bld = [];
    const emis = [];
    const p1 = [];
    const p2 = [];
    // Main block 40×18×28 + elevator shaft 8×22×8.
    box(bld, 40, 18, 28, 100, 9, 0, [0.6, 0.05, 0.2]);
    box(bld, 8, 22, 8, 96, 11, -18, [0.6, 0.05, 0.18]);
    level.colliders.push(colliderOf(100, 0, 40, 28));
    level.colliders.push(colliderOf(96, -18, 8, 8));
    // ~24 shattered glass strips on the west + south faces.
    for (const fz of [-10, -6, -2, 2, 6, 10]) {
      for (const fy of [6, 11]) {
        const g = new THREE.BoxGeometry(0.1, 2, 1.5);
        g.translate(79.9, fy, fz);
        emis.push(tintGeo(g, 0.53, 0.5, 0.4 + rng() * 0.06));
      }
    }
    for (const fx of [84, 90, 96, 102, 108, 114]) {
      for (const fy of [6, 11]) {
        const g = new THREE.BoxGeometry(1.5, 2, 0.1);
        g.translate(fx, fy, 14.1);
        emis.push(tintGeo(g, 0.53, 0.5, 0.4 + rng() * 0.06));
      }
    }
    // Triage tents (5×5) + ambulances + yard clutter.
    for (const [tx, tz] of [[63, -10], [63, 10], [72, 0]]) {
      pushTentGeo(p1, tx, tz, 5, 5, [0.35, 0.25, 0.32]);
      level.colliders.push(colliderOf(tx, tz, 5, 5));
    }
    for (const [ax, az] of [[70, -22], [78, 18]]) {
      pushCarGeo(p2, ax, az, 0.0, 0.72); // near-white body
      const stripe = new THREE.BoxGeometry(4.4, 0.25, 0.2);
      stripe.translate(ax, 1.0, az - 1.02);
      p2.push(tintGeo(stripe, 0.99, 0.7, 0.3));
      level.colliders.push(colliderOf(ax, az, 5.5, 2.4));
    }
    for (const [cx, cz] of [[57, -18], [57, 16], [66, -18], [67, 14], [74, -10], [74, 8]]) {
      const geo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
      geo.translate(cx, 0.6, cz);
      p2.push(tintGeo(geo, 0.58, 0.08, 0.22 + rng() * 0.05));
      level.colliders.push(colliderOf(cx, cz, 1.2, 1.2));
    }
    addMerged(bld, bldMat, { cast: false, solid: true, name: "ho-bld" });
    addMerged(emis, emisMat, { cast: false, solid: true, name: "ho-emissive" });
    addMerged(p1, propMat, { cast: true, solid: true, name: "ho-props1" });
    addMerged(p2, propMat, { cast: true, solid: true, name: "ho-props2" });
  }

  // --- PARK — pond + 24 trees + benches + gravel decals ---------------------------
  {
    const trunks = [];
    const canopy = [];
    const p2 = [];
    // Pond 26×16 (walkable/wadeable — NO collider by contract §3.6.4).
    const waterGeo = new THREE.PlaneGeometry(26, 16);
    waterGeo.rotateX(-Math.PI / 2);
    waterGeo.translate(53, -0.12, 78);
    geometries.push(waterGeo);
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.name = "pa-water";
    water.receiveShadow = true;
    objects.push(water);
    scene.add(water);
    // 24 trees on a 25 m jittered grid, avoiding pond/roads/bonfire/spawns.
    const cols = [-5, 20, 45, 70, 95, 120];
    const rowsZ = [40, 65, 90, 115];
    const avoid = [
      { x: 53, z: 78, r: 18 }, // pond
      { x: 10, z: 70, r: 8 }, // bonfire (M5)
      ...districtById.get("park").spawnPoints.map((p) => ({ x: p.x, z: p.z, r: 4 })),
      { x: 0, z: 30, r: 6 }, { x: -15, z: 75, r: 6 }, // gate approaches
    ];
    for (const cx0 of cols) {
      for (const cz0 of rowsZ) {
        let placed = false;
        for (let tries = 0; tries < 14 && !placed; tries++) {
          const k = tries < 7 ? 8 : 4;
          let x = cx0 + (rng() * 2 - 1) * k;
          let z = cz0 + (rng() * 2 - 1) * k;
          if (cz0 === 40) z = Math.max(z, 42); // keep the z 30..38 walk clear
          if (cx0 === -5) x = Math.max(x, 3); // keep the x −15..−7 branch clear
          let ok = x > -13 && x < 128 && z > 32 && z < 128;
          for (const a of avoid) {
            const dx = x - a.x;
            const dz = z - a.z;
            if (dx * dx + dz * dz < a.r * a.r) { ok = false; break; }
          }
          if (!ok) continue;
          cyl(trunks, 0.3, 0.4, 3, 6, x, 1.5, z, [0.07, 0.3, 0.14]);
          level.colliders.push(colliderOf(x, z, 0.8, 0.8));
          const cone = new THREE.IcosahedronGeometry(2.2, 0);
          cone.translate(x, 4.1, z);
          canopy.push(tintGeo(cone, 0.29 + rng() * 0.07, 0.35, 0.12 + rng() * 0.05));
          placed = true;
        }
      }
    }
    // Stone benches around the pond + west path.
    for (const [bx, bz] of [[36, 66], [70, 66], [36, 90], [70, 90], [20, 70], [24, 84]]) {
      box(p2, 2, 0.12, 0.55, bx, 0.45, bz, [0.6, 0.05, 0.24]);
      box(p2, 0.25, 0.4, 0.5, bx - 0.8, 0.2, bz, [0.6, 0.05, 0.2]);
      box(p2, 0.25, 0.4, 0.5, bx + 0.8, 0.2, bz, [0.6, 0.05, 0.2]);
      level.colliders.push(colliderOf(bx, bz, 2, 0.6));
    }
    addMerged(trunks, propMat, { cast: true, solid: true, name: "pa-trunks" });
    addMerged(canopy, canopyMat, { cast: false, solid: true, name: "pa-canopy" });
    addMerged(p2, propMat, { cast: true, solid: true, name: "pa-props" });
    // Gravel walk decals (3 m wide, y 0.01 — no collider, no solid).
    const decalGeos = [];
    const strips = [
      { w: 143, d: 3, x: 57.5, z: 35 }, // Lối Công Viên z 30..38
      { w: 3, d: 30, x: -10.5, z: 75 }, // N-S branch to G5
      { w: 49, d: 3, x: 15.5, z: 75 }, // connector toward the pond
    ];
    for (const s of strips) {
      const g = new THREE.PlaneGeometry(s.w, s.d);
      g.rotateX(-Math.PI / 2);
      g.translate(s.x, 0.01, s.z);
      decalGeos.push(g);
    }
    addMerged(decalGeos, decalMat, { cast: false, solid: false, name: "pa-decals" });
  }

  // --- DOCKS — container yards + crane + boat + piers -----------------------------
  {
    const bld = [];
    const p1 = [];
    const p2 = [];
    // Yard A: 5 ground + 1 stacked (visual). Yard B: 4 ground + 4 stacked.
    const hues = [0.02, 0.08, 0.35, 0.55, 0.62, 0.09, 0.13, 0.5];
    let hi = 0;
    const yardA = [[-118, 46], [-111, 46], [-104, 46], [-118, 52], [-111, 52]];
    for (const [cx, cz] of yardA) {
      pushContainerGeo(p1, cx, cz, hues[hi++ % hues.length]);
      level.colliders.push(colliderOf(cx, cz, 6, 2.4));
    }
    pushContainerGeo(p1, -118, 46, hues[hi++ % hues.length], 1); // stacked, visual only
    const yardB = [[-58, 98], [-51, 98], [-44, 98], [-37, 98]];
    for (const [cx, cz] of yardB) {
      pushContainerGeo(p1, cx, cz, hues[hi++ % hues.length]);
      pushContainerGeo(p1, cx, cz, hues[hi++ % hues.length], 1);
      level.colliders.push(colliderOf(cx, cz, 6, 2.4));
    }
    // Static crane: collider ONLY the two legs (§3.6.4).
    box(bld, 2, 12, 2, -95, 6, 55, [0.11, 0.35, 0.16]);
    box(bld, 2, 12, 2, -75, 6, 55, [0.11, 0.35, 0.16]);
    level.colliders.push(colliderOf(-95, 55, 2, 2));
    level.colliders.push(colliderOf(-75, 55, 2, 2));
    box(bld, 22, 1.2, 2, -85, 12, 55, [0.11, 0.3, 0.14]);
    box(bld, 2.5, 2.2, 2.5, -85, 13.6, 55, [0.11, 0.25, 0.12]);
    // Fishing boat against the pier (hull + cabin + mast).
    box(p2, 10, 2, 3.5, -120, 1.0, 105, [0.58, 0.3, 0.15]);
    box(p2, 3, 1.8, 2.2, -117.5, 2.9, 105, [0.12, 0.2, 0.13]);
    cyl(p2, 0.06, 0.08, 4, 5, -121, 4, 105, [0.08, 0.2, 0.12]);
    level.colliders.push(colliderOf(-120, 105, 10, 3.5));
    // Two walkable piers: deck + pilings, NO collider (XZ-only sim — a collider
    // here would seal the deck; documented in the header/contract notes).
    for (const pz of [96, 112]) {
      box(p2, 14, 0.25, 4, -114, 0.8, pz, [0.07, 0.3, 0.16]);
      for (const px of [-120, -114, -108]) {
        for (const side of [-1, 1]) {
          cyl(p2, 0.15, 0.18, 1.2, 5, px, 0.35, pz + side * 1.7, [0.06, 0.25, 0.1]);
        }
      }
    }
    // Bollards along the south shore.
    for (const bx of [-124, -112, -100, -88, -76, -64, -52, -40]) {
      const geo = new THREE.BoxGeometry(0.8, 0.9, 0.8);
      geo.translate(bx, 0.45, 126);
      p2.push(tintGeo(geo, 0.58, 0.08, 0.14 + rng() * 0.03));
      level.colliders.push(colliderOf(bx, 126, 0.8, 0.8));
    }
    addMerged(bld, bldMat, { cast: false, solid: true, name: "do-bld" });
    addMerged(p1, propMat, { cast: true, solid: true, name: "do-props1" });
    addMerged(p2, propMat, { cast: true, solid: true, name: "do-props2" });
  }

  // --- quarantine: nothing new here except the level.js vault door (§3.2) -------

  // --- 12 gate frames (1 merged mesh, per-gate vertex ranges) + icons -------------
  const gateIconTex = makeGateIconTexture();
  textures.push(gateIconTex);
  const RED = new THREE.Color(GATE_RED);
  const GREEN = new THREE.Color(GATE_GREEN);
  const frameMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  materials.push(frameMat);
  const frameGeos = [];
  let wpVertex = 0;

  for (const g of gates) {
    const alongX = g.axis === "x";
    const half = g.width / 2;
    const postW = 0.5; // along the gap axis
    const postD = 0.6; // across the wall
    const postH = 4.8;
    g.wpStart = wpVertex;
    for (const side of [-1, 1]) {
      const px = g.x + (alongX ? side * (half + postW / 2) : 0);
      const pz = g.z + (alongX ? 0 : side * (half + postD / 2));
      const post = new THREE.BoxGeometry(postW, postH, postD);
      post.translate(px, postH / 2, pz);
      frameGeos.push(tintGeo(post, 0, 0, 0)); // placeholder — recolored below
      wpVertex += post.attributes.position.count;
      level.colliders.push({ minX: px - postW / 2, maxX: px + postW / 2, minZ: pz - postD / 2, maxZ: pz + postD / 2 });
    }
    const linW = alongX ? g.width + postW * 2 + 0.4 : 0.7;
    const linD = alongX ? 0.7 : g.width + postD * 2 + 0.4;
    const lintel = new THREE.BoxGeometry(linW, 1.1, linD);
    lintel.translate(g.x, 4.0, g.z);
    frameGeos.push(tintGeo(lintel, 0, 0, 0));
    g.wpCount = wpVertex - g.wpStart;
    // Icon quad on both lintel faces — per-gate material so the icon flips
    // red ↔ green with the frame (EXPANSION-P1 §3.4.2; was static cyan).
    g.iconMat = new THREE.MeshBasicMaterial({
      map: gateIconTex, transparent: true, side: THREE.DoubleSide, depthWrite: false,
      color: GATE_RED,
    });
    materials.push(g.iconMat);
    const iconGeosG = [];
    for (const side of [-1, 1]) {
      const plane = new THREE.PlaneGeometry(0.9, 0.9);
      if (alongX) {
        plane.translate(g.x, 4.0, g.z + side * 0.37);
      } else {
        plane.rotateY(Math.PI / 2);
        plane.translate(g.x + side * 0.37, 4.0, g.z);
      }
      iconGeosG.push(plane);
    }
    addMerged(iconGeosG, g.iconMat, { cast: false, solid: false, name: "gate-icons" });
  }
  const framesMesh = addMerged(frameGeos, frameMat, { cast: false, solid: true, name: "gate-frames" });

  /**
   * Rewrite one gate's frame vertex colors (red ↔ green) in the merged mesh.
   * @param {typeof gates[number]} g
   * @param {THREE.Color} c
   */
  function paintFrame(g, c) {
    const attr = /** @type {THREE.BufferAttribute} */ (framesMesh.geometry.attributes.color);
    const arr = /** @type {Float32Array} */ (attr.array);
    for (let i = g.wpStart; i < g.wpStart + g.wpCount; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    attr.needsUpdate = true;
  }
  for (const g of gates) paintFrame(g, RED);

  // --- 12 sliding barriers (individual meshes + temporary colliders) -------------
  // Boxes are built centered on their own origin (y = 0) and the MESH sits at
  // y = GATE_REST_Y (1.5) — so the §3.4.1 tween is literally center y 1.5 → −1.6.
  for (const g of gates) {
    const alongX = g.axis === "x";
    const half = g.width / 2;
    const geos = [];
    const panel = new THREE.BoxGeometry(alongX ? g.width + 0.9 : 0.5, 3, alongX ? 0.5 : g.width + 0.9);
    panel.translate(g.x, 0, g.z);
    geos.push(panel);
    // Two edge trims + one top bar (same material — "viền rào cùng material").
    for (const side of [-1, 1]) {
      const trim = new THREE.BoxGeometry(alongX ? 0.25 : 0.55, 3, alongX ? 0.55 : 0.25);
      trim.translate(g.x + (alongX ? side * (half + 0.2) : 0), 0, g.z + (alongX ? 0 : side * (half + 0.2)));
      geos.push(trim);
    }
    const bar = new THREE.BoxGeometry(alongX ? g.width + 0.9 : 0.56, 0.3, alongX ? 0.56 : g.width + 0.9);
    bar.translate(g.x, 1.2, g.z);
    geos.push(bar);
    const merged = mergeGeometries(geos, false);
    for (const geo of geos) geo.dispose();
    geometries.push(merged);
    g.mat = new THREE.MeshStandardMaterial({
      color: 0x1a1f28, emissive: GATE_RED, emissiveIntensity: 1.2, roughness: 0.5, metalness: 0.3,
    });
    materials.push(g.mat);
    const mesh = new THREE.Mesh(merged, g.mat);
    mesh.name = "gate-barrier-" + g.from + "-" + g.to;
    mesh.position.set(0, GATE_REST_Y, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.solid = true;
    objects.push(mesh);
    scene.add(mesh);
    g.mesh = mesh;
    g.frameMesh = framesMesh;
    // Collider seals EXACTLY the gap band (wall thickness 0.5 → ±0.25).
    g.collider = alongX
      ? { minX: g.x - half, maxX: g.x + half, minZ: g.z - 0.25, maxZ: g.z + 0.25 }
      : { minX: g.x - 0.25, maxX: g.x + 0.25, minZ: g.z - half, maxZ: g.z + half };
  }

  // --- district PointLights (§3.7: 4 city lights; bonfire's is missions') --------
  const cityLights = [
    { x: -75, y: 4.5, z: 8, color: 0xffb066, dist: 22, inten: 20 }, // safehouse warm
    { x: 55, y: 5, z: -95, color: 0xff7ab8, dist: 20, inten: 18 }, // commercial pink
    { x: 78, y: 6, z: 0, color: 0x9fd8ff, dist: 24, inten: 20 }, // hospital cold
    { x: -85, y: 13, z: 55, color: 0xffb464, dist: 22, inten: 22 }, // docks amber
  ];
  const bulbGeos = [];
  for (const l of cityLights) {
    const light = new THREE.PointLight(l.color, l.inten, l.dist, 2);
    light.position.set(l.x, l.y, l.z);
    scene.add(light);
    lights.push(light);
    const bulb = new THREE.SphereGeometry(0.09, 8, 6);
    bulb.translate(l.x, l.y, l.z);
    bulbGeos.push(bulb);
  }
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a8, fog: false, toneMapped: false });
  materials.push(bulbMat);
  addMerged(bulbGeos, bulbMat, { cast: false, solid: false, name: "city-lamp-bulbs" });

  // --- register the 12 city gates into level (§3.5.3-3.5.4, private hooks) -------
  const rumble = createGateSound();
  // Vault rumble: same synth retuned ~30% lower (P3-K1) — the final door is
  // heavier steel than a district barrier.
  const vaultRumble = createGateSound(0.7);
  if (level && typeof /** @type {any} */ (level).__cityRegisterGates === "function") {
    /** @type {any} */ (level).__cityRegisterGates(gates);
  }

  // --- DEV GUARD (§3.6.2) — before the barrier colliders go in --------------------
  // Gate waypoints: guarded through the two approach points 1.6 m to each side
  // (the gap center itself is intentionally covered by its own barrier once the
  // colliders below are pushed, and R-Q/C-Q/H-Q gap centers sit inside the
  // zones.js-SEALED north/east rects at city-build time). An approach point
  // whose district is a quarantine sub-rect can also be sealed right now —
  // those are checked structurally (districtAt) instead of with isBlocked; the
  // walkable half of every approach is still isBlocked-tested.
  /** @type {string[]} */
  const guardWarns = [];
  for (const g of gates) {
    const alongX = g.axis === "x";
    const sides = alongX
      ? [{ x: g.x, z: g.z - 1.6 }, { x: g.x, z: g.z + 1.6 }]
      : [{ x: g.x - 1.6, z: g.z }, { x: g.x + 1.6, z: g.z }];
    for (const s of sides) {
      const d = districtAt(s.x, s.z);
      if (d !== g.from && d !== g.to) {
        guardWarns.push("gate " + g.from + "<->" + g.to + " approach (" + s.x + ", " + s.z + ") landed in " + d);
        continue;
      }
      if (d !== "quarantine" && level.isBlocked(s.x, s.z, 0.8)) {
        guardWarns.push("gate " + g.from + "<->" + g.to + " approach (" + s.x + ", " + s.z + ") is blocked");
      }
    }
  }
  for (const d of districts) {
    if (d.id === "quarantine") {
      // Center (0,0) IS the vault door — solid by design (§3.2): check the
      // district instead of walkability.
      if (districtAt(0, 0) !== "quarantine") guardWarns.push("quarantine center (0, 0) is not inside quarantine");
      continue;
    }
    if (level.isBlocked(d.center.x, d.center.z, 0.8)) {
      guardWarns.push("district " + d.id + " center (" + d.center.x + ", " + d.center.z + ") is blocked");
    }
    d.spawnPoints.forEach((p, i) => {
      if (level.isBlocked(p.x, p.z, 0.8)) {
        guardWarns.push("district " + d.id + " spawn" + i + " (" + p.x + ", " + p.z + ") is blocked");
      }
    });
  }
  for (const p of POIS) {
    if (p.solid) {
      if (districtAt(p.x, p.z) !== p.district) {
        guardWarns.push("POI " + p.id + " (" + p.x + ", " + p.z + ") is not in " + p.district);
      }
      continue;
    }
    if (level.isBlocked(p.x, p.z, 0.8)) {
      guardWarns.push("POI " + p.id + " (" + p.x + ", " + p.z + ") is blocked");
    }
  }
  for (const w of guardWarns) console.warn("[city] " + w);

  // --- push the 12 barrier colliders AFTER the guard (§3.6.2 ordering) ------------
  for (const g of gates) level.colliders.push(g.collider);

  // --- gate animation (sink 1.0 s + emissive swap + rumble; §3.4 mechanics) -------
  /** @type {Set<{gate: typeof gates[number], toOpen: boolean, start: number,
   *              fromY: number, fromColor: THREE.Color}>} */
  const anims = new Set();
  let rafId = 0;
  const tmpFrom = new THREE.Color();

  function finishAnim(a) {
    const g = a.gate;
    if (a.toOpen) {
      const idx = level.colliders.indexOf(g.collider);
      if (idx !== -1) level.colliders.splice(idx, 1); // remove ONLY when sunk (§3.4.3)
      if (level && typeof /** @type {any} */ (level).__cityGateOpenAt === "function") {
        /** @type {any} */ (level).__cityGateOpenAt(g.x, g.z, true);
      }
    } else {
      // Idempotent push (P1 fix): a setGateOpen(gate, false) that lands
      // MID-SINK deletes the open anim before its finishAnim ran, so the
      // collider was never spliced — an unguarded push here would duplicate
      // it and the next open's single splice (below) would leave a sunk gate
      // that still blocks player and zombies alike.
      if (level.colliders.indexOf(g.collider) === -1) level.colliders.push(g.collider);
      if (level && typeof /** @type {any} */ (level).__cityGateOpenAt === "function") {
        /** @type {any} */ (level).__cityGateOpenAt(g.x, g.z, false);
      }
    }
    anims.delete(a);
    if (anims.size === 0 && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function animTick(now) {
    rafId = 0;
    for (const a of Array.from(anims)) {
      const p = Math.min(1, Math.max(0, (now - a.start) / GATE_SINK_MS));
      const g = a.gate;
      g.mesh.position.y = a.fromY + ((a.toOpen ? GATE_SUNK_Y : GATE_REST_Y) - a.fromY) * p;
      const k = a.toOpen ? p : 1 - p; // 0 = red/locked, 1 = green/open (both ways)
      g.mat.emissive.copy(a.fromColor).lerp(a.toOpen ? GREEN : RED, p);
      paintFrame(g, tmpFrom.copy(RED).lerp(GREEN, k));
      if (g.iconMat) g.iconMat.color.copy(RED).lerp(GREEN, k);
      if (p >= 1) finishAnim(a);
    }
    if (anims.size > 0) rafId = requestAnimationFrame(animTick);
  }

  function stopAnimLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    anims.clear();
  }

  /**
   * Open/close one gate per §3.4. Idempotent; pair unordered.
   * @param {string} fromId
   * @param {string} toId
   * @param {boolean} open
   * @returns {boolean} true only when the state changed
   */
  function setGateOpen(fromId, toId, open) {
    const g = gateBetween(fromId, toId);
    if (!g) return false;
    const next = open !== false;
    if (g.open === next) return false;
    g.open = next;
    rumble();
    // Restart cleanly from wherever the barrier currently hangs.
    for (const a of Array.from(anims)) {
      if (a.gate === g) anims.delete(a);
    }
    tmpFrom.copy(g.mat.emissive);
    anims.add({ gate: g, toOpen: next, start: performance.now(), fromY: g.mesh.position.y, fromColor: new THREE.Color().copy(tmpFrom) });
    if (!rafId) rafId = requestAnimationFrame(animTick);
    return true;
  }

  // ===========================================================================
  // VAULT DOOR (NIGHT 30 PART 3 — docs/EXPANSION-P3.md §3.4, P3-K1)
  // ===========================================================================
  // The steel disc itself is built by level.js (§3.2: Ø 4 m, half-buried at
  // (0,0), collider {−2..2 × −2..2}) and level keeps mesh+collider OWNERSHIP —
  // geometry/material disposal stays in level.dispose(). THIS module drives
  // the open/close: when level.js exposes its private `__vaultOpen` hook
  // (contract split) openVault() is a pure proxy; otherwise it animates the
  // disc from here (this build's file split — see the header note).
  //
  // Open: slide y 0 → 8 over 2.0 s (ease-in) + local rumble (pitch −30%) +
  // red PointLight (0xff3b30) 0 → 30 fade-in at (0, 1.5, 0) that then HOLDS;
  // when the slide completes the collider is spliced from level.colliders and
  // the disc is REMOVED from the scene (it parks above the vault shaft —
  // geometry/material stay alive, owned by level.js).
  // Close (fresh-run reset path): reverse — disc re-attached and back at floor
  // within 0.5 s, collider pushed back (idempotent push, gates.js P1 fix
  // pattern), light faded out.
  // Idempotent: a call that does not change the target state returns false.
  // The rAF loop follows the gate-animation pattern (city.js animTick).

  const VAULT_OPEN_MS = 2000; // §3.4: 2 s slide up (ease-in)
  const VAULT_CLOSE_MS = 500; // §3.4: reverse "tức thời" (≤ 0.5 s)
  const VAULT_TOP_Y = 8; // §3.4: disc parks at y = 8
  const VAULT_LIGHT_INTENSITY = 30; // §3.4: 0 → 30, distance 25

  /**
   * Private level.js hook when the level provides it (P3-K1 delegation).
   * Probed ONCE at city build — non-enumerable, so it never shows on the
   * documented Level contract.
   */
  const vaultHook =
    level && typeof /** @type {any} */ (level).__vaultOpen === "function"
      ? /** @type {any} */ (level).__vaultOpen
      : null;

  /** The level.js disc mesh (found lazily on first use, cached). */
  let vaultDisc = null;
  /** Its collider record in level.colliders (cached). */
  let vaultCollider = null;
  /** Red glow from inside the shaft; 0 intensity until the door opens. */
  const vaultLight = new THREE.PointLight(0xff3b30, 0, 25, 2);
  vaultLight.position.set(0, 1.5, 0);
  scene.add(vaultLight);
  lights.push(vaultLight); // disposeCity() removes it
  /** Target state — the idempotency guard (like Gate.open). */
  let vaultOpen = false;
  /** @type {{toOpen: boolean, start: number, fromY: number}|null} */
  let vaultAnim = null;
  let vaultRaf = 0;

  /**
   * Locate the level.js vault disc: the only CylinderGeometry(2, 2, 0.6, 24)
   * mesh at the origin flagged solid (level.js §3.2 build block). One O(n)
   * scene scan on first use, then cached — never in a per-frame path.
   * @returns {THREE.Mesh|null}
   */
  function findVaultDisc() {
    if (vaultDisc) return vaultDisc;
    for (let i = 0; i < scene.children.length; i++) {
      const o = scene.children[i];
      if (!(/** @type {any} */ (o).isMesh)) continue;
      const geo = /** @type {any} */ (o).geometry;
      if (!geo || geo.type !== "CylinderGeometry") continue;
      const gp = geo.parameters;
      if (!gp || gp.radiusTop !== 2 || gp.radiusBottom !== 2 || gp.height !== 0.6 || gp.radialSegments !== 24) continue;
      if (Math.abs(o.position.x) > 1e-3 || Math.abs(o.position.y) > 1e-3 || Math.abs(o.position.z) > 1e-3) continue;
      if (o.userData.solid !== true) continue;
      vaultDisc = /** @type {THREE.Mesh} */ (o);
      break;
    }
    return vaultDisc;
  }

  /**
   * Locate the vault collider record: the exact 4×4 box centered on (0,0)
   * (level.js §3.2 — the only collider with those bounds in the game).
   * @returns {{minX: number, maxX: number, minZ: number, maxZ: number}|null}
   */
  function findVaultCollider() {
    if (vaultCollider) return vaultCollider;
    if (!level || !level.colliders) return null;
    for (let i = 0; i < level.colliders.length; i++) {
      const c = level.colliders[i];
      // level.js §3.2: the vault box is 4×4 CENTERED on (0,0) — maxZ is −2,
      // not +2 (integrator fix: the +2 typo made this scan never match, so
      // the open splice and the close re-push both silently no-op'd).
      if (c && c.minX === -2 && c.maxX === 2 && c.minZ === -2 && c.maxZ === -2) {
        vaultCollider = c;
        break;
      }
    }
    return vaultCollider;
  }

  /** Vault rAF step — same clock/pattern as the gate animTick above. */
  function vaultTick(now) {
    vaultRaf = 0;
    const a = vaultAnim;
    if (!a) return;
    const dur = a.toOpen ? VAULT_OPEN_MS : VAULT_CLOSE_MS;
    const p = Math.min(1, Math.max(0, (now - a.start) / dur));
    if (vaultDisc) {
      // Ease-in both ways (§3.4 specifies ease-in for the open slide).
      const k = p * p;
      const targetY = a.toOpen ? VAULT_TOP_Y : 0;
      vaultDisc.position.y = a.fromY + (targetY - a.fromY) * k;
    }
    if (a.toOpen) vaultLight.intensity = VAULT_LIGHT_INTENSITY * p; // hold at 1
    else vaultLight.intensity = VAULT_LIGHT_INTENSITY * (1 - p); // fade out
    if (p >= 1) {
      vaultAnim = null;
      if (a.toOpen) {
        // §3.4: collider out ONLY when the slide finished (never mid-anim —
        // a mid-anim close must still be able to re-push it).
        const col = findVaultCollider();
        if (col && level && level.colliders) {
          const idx = level.colliders.indexOf(col);
          if (idx !== -1) level.colliders.splice(idx, 1);
        }
        // Park the disc out of the scene; geometry/material stay level's.
        if (vaultDisc && vaultDisc.parent) vaultDisc.parent.remove(vaultDisc);
      } else {
        // Collider back (guarded push — P1 idempotency pattern, gates.js).
        const col = findVaultCollider();
        if (col && level && level.colliders && level.colliders.indexOf(col) === -1) {
          level.colliders.push(col);
        }
      }
    }
    if (vaultAnim) vaultRaf = requestAnimationFrame(vaultTick);
  }

  function stopVaultAnim() {
    if (vaultRaf) {
      cancelAnimationFrame(vaultRaf);
      vaultRaf = 0;
    }
    vaultAnim = null;
  }

  /**
   * Mở/đóng cửa vault (0,0) — cửa trượt lên 2 s + rumble + ánh sáng đỏ bên
   * trong (docs/EXPANSION-P3.md §3.4). Ủy quyền level.__vaultOpen khi hook
   * tồn tại (P3-K1); không thì tự animate từ đây.
   * @param {boolean} [open=true]
   * @returns {boolean} true khi trạng thái THẬT SỰ đổi (idempotent)
   */
  function openVault(open = true) {
    if (vaultHook) return vaultHook(open !== false) !== false;
    const next = open !== false;
    if (next === vaultOpen) return false; // no-op — kể cả khi đang trượt tới đó
    vaultOpen = next;
    const disc = findVaultDisc();
    if (!disc) return false; // level layout drifted — nothing to animate
    // Close path with a completed open behind it: the disc parks OUT of the
    // scene — re-attach before sliding it back down.
    if (!next && !disc.parent) scene.add(disc);
    // Restart cleanly from wherever the disc hangs (setGateOpen pattern).
    vaultAnim = { toOpen: next, start: performance.now(), fromY: disc.position.y };
    if (!vaultRaf) vaultRaf = requestAnimationFrame(vaultTick);
    vaultRumble();
    return true;
  }

  // --- public City (frozen shape — private extras are non-enumerable) -------------
  const api = { districts, districtAt, gateBetween, setGateOpen, openVault };
  Object.defineProperty(api, "__dispose", { value: disposeCity, enumerable: false, writable: false });
  return api;
}
