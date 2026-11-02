/**
 * Static arena + the two EXPANSION zones: the 60 x 60 m main arena (4 m
 * perimeter walls, 10–15 scattered obstacles) plus the north zone "Sân sau"
 * (~30×24 m) and east zone "Kho" (~24×30 m) joined through TWO GATES — gaps
 * left in the perimeter fence at (0, -30) and (30, 0). Every gate gets a
 * glowing frame + icon (feature C1 visuals, built here per the contract).
 *
 * Every solid surface (floor, walls, obstacle meshes, gate posts) also carries
 * userData.solid = true — combat.js bullet occlusion stops pellets on marked
 * meshes. level.js is the single place that declares what is cover: a new
 * obstacle added here must go through the same path to block shots.
 *
 * Colliders are axis-aligned XZ rectangles (the game simulates XZ only):
 *   {minX, maxX, minZ, maxZ} in meters, covering walls + all obstacles.
 *
 * isBlocked(x, z, r): true if a circle of radius r (DEFAULT 0.4 m) centered
 * at (x, z) intersects any collider — standard circle-vs-AABB test (clamp the
 * circle center to the box, compare distances). Positions outside the walkable
 * bounds are blocked too (void).
 *
 * NIGHT 30 PART 1 (docs/EXPANSION-P1.md §3.5) extends the walkable world to
 * the full 260×260 m city: the union of AREA_RECTS (quarantine, via its 3
 * frozen sub-rects) and DISTRICT_RECTS (the 6 outer districts, same table as
 * city.js — contract checklist §10). Everything outside both is void, the 3
 * notches inside the quarantine bbox included. Five legacy wall spans are cut
 * for the new district gates (south ×3 segments, west ×2, north-zone west
 * side ×2, north-zone back ×2, east-zone back ×2) and the mission-9 VAULT
 * DOOR (Ø 4 m steel disc, top y 0.3, collider −2..2 × −2..2) is built at the
 * arena origin. Quarantine's own numbers stay byte-identical (§3.2).
 *
 * EXPANSION (docs/EXPANSION.md C2/C3) added API:
 * - getGateWaypoints() → [{x, z}] — frozen waypoints INSIDE the gate gaps;
 *   zombie.js routes through the nearest one when a wall blocks its path.
 *   NIGHT 30: 14 waypoints — the 2 legacy internal quarantine gates + the 12
 *   district gates that city.js registers through the private hooks below
 *   (contract decision K7).
 * - sameArea(x1, z1, x2, z2) → boolean — true when both points sit in the
 *   same connected rectangle (main arena, north zone or east zone — quarantine
 *   keeps its 3-way granularity so the internal gate pathing survives,
 *   decision K7) OR in districts connected through ≥ 1 OPEN city gate
 *   (transitive union-find, rebuilt lazily on gate state changes). zombie.js
 *   keeps its ORIGINAL steering whenever this is true.
 *
 * spawnPoints: the 12 arena ring points (legacy layout, untouched) followed
 * by the zone spawn points (3 per zone) of the UNLOCKED zones only — a locked
 * zone (feature C1, setZoneLocked) is sealed by isBlocked and stays out of
 * the wave-spawn pool until zones.js opens it. The 6 outer districts keep
 * their spawn pools in city.js (§3.6.6), NOT here.
 *
 * dispose(): remove everything from the scene and dispose geometries,
 * materials and the CanvasTextures (called on restart/teardown if needed).
 *
 * @param {import("three").Scene} scene
 * @returns {Level}
 */

/**
 * @typedef {Object} Level
 * @property {Array<{minX: number, maxX: number, minZ: number, maxZ: number}>} colliders
 *   XZ AABBs (meters) of walls + obstacles.
 * @property {(x: number, z: number, r?: number) => boolean} isBlocked
 *   true if the circle (x, z, r = 0.4) intersects any collider.
 * @property {import("three").Vector3[]} spawnPoints - 12 arena ring points + 6 zone points.
 * @property {() => Array<{x: number, z: number}>} getGateWaypoints
 *   EXPANSION C2/C3 + NIGHT 30 (K7): 14 gate waypoints INSIDE the gaps — the
 *   2 legacy internal quarantine gates + the 12 city district gates registered
 *   by city.js (locked gates included; sameArea gates the pathing).
 * @property {(x1: number, z1: number, x2: number, z2: number) => boolean} sameArea
 *   EXPANSION C3 + NIGHT 30: true when both points are in the same walkable
 *   rectangle OR in districts connected through an open city gate.
 * @property {(id: "north"|"east", locked: boolean) => boolean} setZoneLocked
 *   EXPANSION C1: seal (locked = true) or open (false) one expansion zone —
 *   the sealed rect is solid to isBlocked (gate gap included) and its spawn
 *   points leave level.spawnPoints. zones.js drives this; returns true when
 *   the state changed.
 * @property {() => void} dispose - remove + dispose all level resources.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const HALF = 30; // arena half-size -> 60 x 60 m
const WALL_H = 4;
const WALL_T = 0.5;

// --- expansion zones (docs/EXPANSION.md C1/C2) --------------------------------
// These numbers MUST stay in sync with the descriptors in src/world/zones.js
// (bounds, gate waypoints, spawn points, boss anchors).
const GATE_HALF = 2; // half-width of each gate opening -> a 4 m gap

/** Connected walkable rectangles: index 0 = arena, 1 = north, 2 = east. */
const AREA_RECTS = [
  { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF }, // main arena
  { minX: -15, maxX: 15, minZ: -54, maxZ: -30 }, // north zone "Sân sau"
  { minX: 30, maxX: 54, minZ: -15, maxZ: 15 }, // east zone "Kho"
];

/** Frozen gate waypoints — one INSIDE each gap (zombie pathing targets). */
const GATE_WAYPOINTS = [
  { x: 0, z: -HALF }, // north gate, in the arena north wall
  { x: HALF, z: 0 }, // east gate, in the arena east wall
];

/** Zone spawn points, appended AFTER the 12 arena ring points. */
const ZONE_SPAWNS = [
  { x: -11, z: -51 },
  { x: 11, z: -51 },
  { x: 0, z: -44 }, // north
  { x: 34, z: -11 },
  { x: 34, z: 11 },
  { x: 50, z: 2 }, // east
];

/**
 * Hand-placed, deterministic layout (same arena every run). Everything is
 * axis-aligned so the visual boxes match their XZ colliders exactly, and all
 * of it keeps clear of the spawn ring (|26| on the axes, see spawnPoints)
 * and the player spawn at the origin.
 * @type {Array<{kind: "crate"|"block"|"pillar", x: number, z: number,
 *               sx?: number, sy?: number, sz?: number, stack?: boolean}>}
 */
const OBSTACLES = [
  // Wooden crates (1.2 m cubes); the first one gets a stacked second crate.
  { kind: "crate", x: -8, z: -6, sx: 1.2, sy: 1.2, sz: 1.2, stack: true },
  { kind: "crate", x: 7, z: 9, sx: 1.2, sy: 1.2, sz: 1.2 },
  { kind: "crate", x: 12, z: -12, sx: 1.2, sy: 1.2, sz: 1.2 },
  { kind: "crate", x: -14, z: 10, sx: 1.2, sy: 1.2, sz: 1.2 },
  { kind: "crate", x: 3, z: -17, sx: 1.2, sy: 1.2, sz: 1.2 },
  { kind: "crate", x: -4, z: 18, sx: 1.2, sy: 1.2, sz: 1.2 },
  { kind: "crate", x: 18, z: 14, sx: 1.2, sy: 1.2, sz: 1.2 },
  { kind: "crate", x: -22, z: -22, sx: 1.2, sy: 1.2, sz: 1.2 },
  // Concrete blocks (long, low cover).
  { kind: "block", x: 16, z: 4, sx: 2.6, sy: 1.1, sz: 1.2 },
  { kind: "block", x: -18, z: -14, sx: 1.2, sy: 1.1, sz: 2.6 },
  { kind: "block", x: 0, z: 10, sx: 2.6, sy: 1.1, sz: 1.2 },
  { kind: "block", x: -12, z: -20, sx: 2.6, sy: 1.1, sz: 1.2 },
  // Pillars (octagonal cylinders, 4 m tall).
  { kind: "pillar", x: 10, z: 16, sx: 1.2, sy: 4, sz: 1.2 },
  { kind: "pillar", x: -16, z: -4, sx: 1.2, sy: 4, sz: 1.2 },
  { kind: "pillar", x: 18, z: -18, sx: 1.2, sy: 4, sz: 1.2 },
];

/**
 * Expansion zone cover (docs/EXPANSION.md C1): north = wooden crates + one
 * wrecked car; east = shelving + containers. Same rules as OBSTACLES —
 * axis-aligned, every prop pushes a collider, merged per kind to keep the
 * draw-call count low. The layout keeps the gate approaches, the zone spawn
 * points and the boss anchors (src/world/zones.js) clear.
 * @type {Array<{kind: "crate"|"car"|"shelf"|"container", x: number, z: number,
 *               sx?: number, sz?: number, hue?: number, stack?: boolean}>}
 */
const ZONE_PROPS = [
  // North zone "Sân sau". Props are kept apart (no concave pockets narrower
  // than a brute): the collider slide handles convex props but an L-shaped
  // trap could pin a straight-chasing zombie.
  { kind: "car", x: -6, z: -40 },
  { kind: "crate", x: 6, z: -36, stack: true },
  { kind: "crate", x: 10.5, z: -37 },
  { kind: "crate", x: -11, z: -46 },
  { kind: "crate", x: 10, z: -48.5, stack: true },
  { kind: "crate", x: 3, z: -50 },
  // East zone "Kho".
  { kind: "container", x: 42, z: -8, sx: 6, sz: 2.4, hue: 0.05 },
  { kind: "container", x: 48, z: 6, sx: 2.4, sz: 6, hue: 0.58 },
  { kind: "shelf", x: 36, z: 4 },
  { kind: "shelf", x: 36, z: -5 },
  { kind: "shelf", x: 50, z: -3 },
];

/**
 * Every wall box as an XZ span: the OLD 4-box fence (south + west solid,
 * north + east) with the two GATE GAPS cut out (north wall split at
 * x ∈ [-2, 2], east wall split at z ∈ [-2, 2]) plus the 6 zone perimeter
 * boxes. Box ends overlap or bury into their neighbour so no coplanar faces
 * z-fight (same trick the original corners used).
 *
 * NIGHT 30 PART 1 (docs/EXPANSION-P1.md §3.4): five of the legacy spans are
 * additionally CUT for the new district gates — the arena south wall into
 * three segments (D-Q gap x −24.5..−19.5, P-Q gap x −2.5..2.5), the arena
 * west wall into two (S-Q gap z −2..2), the north-zone west side wall into
 * two (R-Q gap z −44..−40), the north-zone back wall into two (C-Q gap
 * x −2..2) and the east-zone back wall into two (H-Q gap z −2..2). Geometry
 * and colliders both derive from these spans (see the wall builder below).
 * @type {Array<{x1: number, x2: number, z1: number, z2: number}>}
 */
const WALL_SPANS = [
  // Main arena fence.
  // South wall (z = +30) — THREE segments: D-Q gap x ∈ [-24.5, -19.5] (5 m),
  // P-Q gap x ∈ [-2.5, 2.5] (5 m).
  { x1: -HALF - WALL_T / 2, x2: -24.5, z1: HALF - WALL_T / 2, z2: HALF + WALL_T / 2 },
  { x1: -19.5, x2: -2.5, z1: HALF - WALL_T / 2, z2: HALF + WALL_T / 2 },
  { x1: 2.5, x2: HALF + WALL_T / 2, z1: HALF - WALL_T / 2, z2: HALF + WALL_T / 2 },
  // West wall (x = -30) — TWO segments around the S-Q gate gap z ∈ [-2, 2].
  { x1: -HALF - WALL_T / 2, x2: -HALF + WALL_T / 2, z1: -HALF, z2: -2 },
  { x1: -HALF - WALL_T / 2, x2: -HALF + WALL_T / 2, z1: 2, z2: HALF },
  // North wall — TWO segments around the north gate gap x ∈ [-GATE_HALF, GATE_HALF].
  { x1: -HALF - WALL_T / 2, x2: -GATE_HALF, z1: -HALF - WALL_T / 2, z2: -HALF + WALL_T / 2 },
  { x1: GATE_HALF, x2: HALF + WALL_T / 2, z1: -HALF - WALL_T / 2, z2: -HALF + WALL_T / 2 },
  // East wall — TWO segments around the east gate gap z ∈ [-GATE_HALF, GATE_HALF].
  { x1: HALF - WALL_T / 2, x2: HALF + WALL_T / 2, z1: -HALF, z2: -GATE_HALF },
  { x1: HALF - WALL_T / 2, x2: HALF + WALL_T / 2, z1: GATE_HALF, z2: HALF },
  // North zone: side walls (south ends buried in the arena north wall) + back.
  // West side — TWO segments around the R-Q gate gap z ∈ [-44, -40].
  { x1: -15 - WALL_T / 2, x2: -15 + WALL_T / 2, z1: -54 - WALL_T / 2, z2: -44 },
  { x1: -15 - WALL_T / 2, x2: -15 + WALL_T / 2, z1: -40, z2: -HALF },
  { x1: 15 - WALL_T / 2, x2: 15 + WALL_T / 2, z1: -54 - WALL_T / 2, z2: -HALF },
  // North zone back wall — TWO segments around the C-Q gate gap x ∈ [-2, 2].
  { x1: -15, x2: -2, z1: -54 - WALL_T / 2, z2: -54 + WALL_T / 2 },
  { x1: 2, x2: 15, z1: -54 - WALL_T / 2, z2: -54 + WALL_T / 2 },
  // East zone: north + south walls (west ends buried in the arena east wall).
  { x1: HALF, x2: 54 + WALL_T / 2, z1: -15 - WALL_T / 2, z2: -15 + WALL_T / 2 },
  { x1: HALF, x2: 54 + WALL_T / 2, z1: 15 - WALL_T / 2, z2: 15 + WALL_T / 2 },
  // East zone back wall — TWO segments around the H-Q gate gap z ∈ [-2, 2].
  { x1: 54 - WALL_T / 2, x2: 54 + WALL_T / 2, z1: -15, z2: -2 },
  { x1: 54 - WALL_T / 2, x2: 54 + WALL_T / 2, z1: 2, z2: 15 },
];

/**
 * NIGHT 30 PART 1 (docs/EXPANSION-P1.md §3.1/§3.5.2): the six OUTER district
 * rects — MUST stay in sync with OUTER_RECTS in src/world/city.js and the
 * §3.1 table (contract checklist §10). isBlocked treats the union of these
 * plus AREA_RECTS (quarantine, via its 3 sub-rects) as the walkable city;
 * everything else is void. The R-Q strip x −30..−15, z −54..−30 falls inside
 * the residential rect, exactly as §3.1 rule 3 requires. The three VOID
 * notches (N-B1 x 15..30 z −54..−30, N-B2 x 30..54 z −54..−15, N-B3
 * x 30..54 z 15..30) sit inside the quarantine bbox but OUTSIDE all rects
 * below → blocked, per §3.1 rule 4.
 * @type {Array<{id: string, minX: number, maxX: number, minZ: number, maxZ: number}>}
 */
const DISTRICT_RECTS = [
  { id: "safehouse", minX: -130, maxX: -30, minZ: -30, maxZ: 30 },
  { id: "residential", minX: -130, maxX: -15, minZ: -130, maxZ: -30 },
  { id: "commercial", minX: -15, maxX: 130, minZ: -130, maxZ: -54 },
  { id: "hospital", minX: 54, maxX: 130, minZ: -54, maxZ: 30 },
  { id: "park", minX: -15, maxX: 130, minZ: 30, maxZ: 130 },
  { id: "docks", minX: -130, maxX: -15, minZ: 30, maxZ: 130 },
];

/**
 * Procedural dark grid texture: one 2 m tile per canvas, faint blue-gray
 * grid lines + grunge speckles. No external assets.
 * @param {number} repeatX - texture repeats across X (2 m per repeat).
 * @param {number} repeatY - texture repeats across Z (2 m per repeat).
 * @returns {THREE.CanvasTexture}
 */
function makeFloorTexture(repeatX = HALF, repeatY = HALF) {
  const SIZE = 128;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");

  // Base: very dark blue-gray concrete.
  ctx.fillStyle = "#12161c";
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Subtle vignette per tile so large floors do not look flat.
  const grad = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 8, SIZE / 2, SIZE / 2, SIZE * 0.72);
  grad.addColorStop(0, "rgba(58, 70, 92, 0.10)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0.22)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Grunge speckles.
  for (let i = 0; i < 46; i++) {
    const dark = Math.random() < 0.7;
    ctx.fillStyle = dark ? "rgba(0, 0, 0, 0.20)" : "rgba(160, 180, 210, 0.05)";
    const r = 1 + Math.random() * 2.5;
    ctx.beginPath();
    ctx.arc(Math.random() * SIZE, Math.random() * SIZE, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Grid lines on the tile border (2 m cell).
  ctx.strokeStyle = "#2b3549";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, SIZE, SIZE);
  // Faint inner detail: a bolt dot in each corner.
  ctx.fillStyle = "#1d2532";
  for (const [cx, cy] of [[10, 10], [SIZE - 10, 10], [10, SIZE - 10], [SIZE - 10, SIZE - 10]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY); // 2 m cells
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Glowing gate icon: a ring + inward double chevron, symmetric so it reads
 * the same from both sides of the gate. Transparent background.
 * @returns {THREE.CanvasTexture}
 */
function makeGateIconTexture() {
  const S = 128;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = "rgba(150, 235, 255, 0.95)";
  ctx.shadowColor = "rgba(90, 220, 255, 0.9)";
  ctx.shadowBlur = 12;
  // Ring.
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 44, 0, Math.PI * 2);
  ctx.stroke();
  // Inward double chevron (><), symmetric.
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

/** Axis-aligned XZ collider from a center + full extents. */
function colliderOf(x, z, sx, sz) {
  return { minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 };
}

/**
 * Circle-vs-AABB (XZ): clamp the circle center to the box, compare distances.
 * Shared by isBlocked for real colliders AND for the sealed locked-zone rects.
 * @param {number} x
 * @param {number} z
 * @param {number} r2 - squared circle radius
 * @param {{minX: number, maxX: number, minZ: number, maxZ: number}} c
 * @returns {boolean}
 */
function circleHitsRect(x, z, r2, c) {
  const cx = x < c.minX ? c.minX : x > c.maxX ? c.maxX : x;
  const cz = z < c.minZ ? c.minZ : z > c.maxZ ? c.maxZ : z;
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r2;
}

/**
 * Fill a geometry's (missing) color attribute with one flat tint so boxes of
 * different shades can share one vertex-colored merged mesh.
 * @param {THREE.BufferGeometry} geo
 * @param {THREE.Color} color
 * @returns {THREE.BufferGeometry} the same geometry, for chaining
 */
function tintGeometry(geo, color) {
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
 * One wooden crate — the SAME look as the arena crates (zone copy; the arena
 * loop keeps its own inline code so legacy output is byte-identical).
 * @param {THREE.BufferGeometry[]} geos - merged-bucket target.
 * @param {number} x
 * @param {number} z
 * @param {boolean=} stack - add a rotated second crate on top (visual only).
 */
function pushCrateGeo(geos, x, z, stack) {
  const geo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  geo.translate(x, 0.6, z);
  geos.push(tintGeometry(geo, new THREE.Color().setHSL(0.075, 0.32, 0.2 + Math.random() * 0.07)));
  if (stack) {
    const top = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    top.rotateY(0.22); // visual only — the collider is the base crate
    top.translate(x + 0.07, 1.82, z - 0.05);
    geos.push(tintGeometry(top, new THREE.Color().setHSL(0.07, 0.3, 0.24 + Math.random() * 0.05)));
  }
}

/** Wrecked car: body + cabin + 4 wheel stubs (visual), collider 4.4 × 2.0. */
function pushCarGeo(geos, x, z) {
  const body = new THREE.BoxGeometry(4.4, 1.0, 2.0);
  body.translate(x, 0.7, z);
  geos.push(tintGeometry(body, new THREE.Color().setHSL(0.02, 0.42, 0.2 + Math.random() * 0.04)));
  const cabin = new THREE.BoxGeometry(2.0, 0.8, 1.7);
  cabin.translate(x - 0.4, 1.55, z);
  geos.push(tintGeometry(cabin, new THREE.Color().setHSL(0.55, 0.18, 0.1)));
  for (const [wx, wz] of [[-1.5, -0.95], [1.5, -0.95], [-1.5, 0.95], [1.5, 0.95]]) {
    const wheel = new THREE.BoxGeometry(0.7, 0.6, 0.3);
    wheel.translate(x + wx, 0.3, z + wz);
    geos.push(tintGeometry(wheel, new THREE.Color().setHSL(0, 0, 0.05)));
  }
}

/** Shelving unit (run along Z): 2 side panels + 3 boards, collider 0.7 × 3. */
function pushShelfGeo(geos, x, z) {
  for (const px of [x - 0.29, x + 0.29]) {
    const panel = new THREE.BoxGeometry(0.12, 2.4, 3.0);
    panel.translate(px, 1.2, z);
    geos.push(tintGeometry(panel, new THREE.Color().setHSL(0.58, 0.12, 0.15 + Math.random() * 0.04)));
  }
  for (const py of [0.5, 1.3, 2.1]) {
    const board = new THREE.BoxGeometry(0.46, 0.08, 3.0);
    board.translate(x, py, z);
    geos.push(tintGeometry(board, new THREE.Color().setHSL(0.58, 0.08, 0.22)));
  }
}

/** Shipping container box, tinted per hue, collider = full footprint. */
function pushContainerGeo(geos, x, z, sx, sz, hue) {
  const box = new THREE.BoxGeometry(sx, 2.6, sz);
  box.translate(x, 1.3, z);
  geos.push(tintGeometry(box, new THREE.Color().setHSL(hue, 0.45, 0.22 + Math.random() * 0.05)));
}

export function createLevel(scene) {
  /** @type {THREE.Object3D[]} */
  const objects = [];
  /** @type {THREE.BufferGeometry[]} */
  const geometries = [];
  /** @type {THREE.Material[]} */
  const materials = [];
  /** @type {THREE.Texture[]} */
  const textures = [];

  /** @type {Level["colliders"]} */
  const colliders = [];

  // --- floor ----------------------------------------------------------------
  const floorTex = makeFloorTexture();
  textures.push(floorTex);
  const floorGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2);
  floorGeo.rotateX(-Math.PI / 2);
  geometries.push(floorGeo);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95, metalness: 0.05 });
  materials.push(floorMat);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  floor.userData.solid = true; // combat.js: the floor stops bullets
  objects.push(floor);
  scene.add(floor);

  // --- zone floors (expansion C1/C2): same concrete look, own repeat ----------
  for (let i = 1; i < AREA_RECTS.length; i++) {
    const r = AREA_RECTS[i];
    const w = r.maxX - r.minX;
    const d = r.maxZ - r.minZ;
    const tex = makeFloorTexture(w / 2, d / 2);
    textures.push(tex);
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    geo.translate((r.minX + r.maxX) / 2, 0, (r.minZ + r.maxZ) / 2);
    geometries.push(geo);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0.05 });
    materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.userData.solid = true;
    objects.push(mesh);
    scene.add(mesh);
  }

  // --- perimeter + zone walls (all boxes merged into 1 mesh) ------------------
  // The fence leaves EXACTLY the two gate gaps (GATE_WAYPOINTS mark them).
  const wallGeos = [];
  for (const s of WALL_SPANS) {
    const w = s.x2 - s.x1;
    const d = s.z2 - s.z1;
    const geo = new THREE.BoxGeometry(w, WALL_H, d);
    geo.translate((s.x1 + s.x2) / 2, WALL_H / 2, (s.z1 + s.z2) / 2);
    const tint = new THREE.Color().setHSL(0.6, 0.14, 0.16 + Math.random() * 0.03);
    wallGeos.push(tintGeometry(geo, tint));
    // Collider mirrors the visual volume exactly.
    colliders.push({ minX: s.x1, maxX: s.x2, minZ: s.z1, maxZ: s.z2 });
  }
  const wallGeo = mergeGeometries(wallGeos, false);
  for (const g of wallGeos) g.dispose(); // merged copies the data
  geometries.push(wallGeo);
  const wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 });
  materials.push(wallMat);
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.castShadow = true;
  walls.receiveShadow = true;
  walls.userData.solid = true; // combat.js: walls stop bullets
  objects.push(walls);
  scene.add(walls);

  // --- obstacles (merged per kind: 3 draw calls for 15 obstacles) -------------
  const crateGeos = [];
  const blockGeos = [];
  const pillarGeos = [];

  for (const o of OBSTACLES) {
    colliders.push(colliderOf(o.x, o.z, o.sx, o.sz));
    if (o.kind === "crate") {
      const geo = new THREE.BoxGeometry(o.sx, o.sy, o.sz);
      geo.translate(o.x, o.sy / 2, o.z);
      const tint = new THREE.Color().setHSL(0.075, 0.32, 0.2 + Math.random() * 0.07);
      crateGeos.push(tintGeometry(geo, tint));
      if (o.stack) {
        const top = new THREE.BoxGeometry(o.sx, o.sy, o.sz);
        top.rotateY(0.22); // visual only — the collider is the base crate
        top.translate(o.x + 0.07, o.sy * 1.5 + 0.02, o.z - 0.05);
        crateGeos.push(tintGeometry(top, new THREE.Color().setHSL(0.07, 0.3, 0.24 + Math.random() * 0.05)));
      }
    } else if (o.kind === "block") {
      const geo = new THREE.BoxGeometry(o.sx, o.sy, o.sz);
      geo.translate(o.x, o.sy / 2, o.z);
      const tint = new THREE.Color().setHSL(0.58, 0.06, 0.24 + Math.random() * 0.05);
      blockGeos.push(tintGeometry(geo, tint));
    } else {
      // Octagonal pillar: cylinder radius = sx/2 so the AABB collider hugs it.
      const geo = new THREE.CylinderGeometry(o.sx / 2, o.sx / 2 + 0.08, o.sy, 8);
      geo.translate(o.x, o.sy / 2, o.z);
      const tint = new THREE.Color().setHSL(0.6, 0.08, 0.18 + Math.random() * 0.04);
      pillarGeos.push(tintGeometry(geo, tint));
    }
  }

  // --- zone props (expansion C1): crates / car / shelves / containers ---------
  const carGeos = [];
  const shelfGeos = [];
  const containerGeos = [];

  for (const o of ZONE_PROPS) {
    if (o.kind === "crate") {
      colliders.push(colliderOf(o.x, o.z, 1.2, 1.2));
      pushCrateGeo(crateGeos, o.x, o.z, o.stack);
    } else if (o.kind === "car") {
      colliders.push(colliderOf(o.x, o.z, 4.4, 2.0));
      pushCarGeo(carGeos, o.x, o.z);
    } else if (o.kind === "shelf") {
      colliders.push(colliderOf(o.x, o.z, 0.7, 3.0));
      pushShelfGeo(shelfGeos, o.x, o.z);
    } else {
      colliders.push(colliderOf(o.x, o.z, o.sx, o.sz));
      pushContainerGeo(containerGeos, o.x, o.z, o.sx, o.sz, o.hue);
    }
  }

  const obstacleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.04 });
  materials.push(obstacleMat);
  /** @type {[THREE.BufferGeometry[], string]} */
  const groups = [
    [crateGeos, "crates"],
    [blockGeos, "blocks"],
    [pillarGeos, "pillars"],
    [carGeos, "cars"],
    [shelfGeos, "shelves"],
    [containerGeos, "containers"],
  ];
  for (const [geos] of groups) {
    if (geos.length === 0) continue;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    geometries.push(merged);
    const mesh = new THREE.Mesh(merged, obstacleMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.solid = true; // combat.js: crates/blocks/pillars stop bullets
    objects.push(mesh);
    scene.add(mesh);
  }

  // --- vault door (NIGHT 30 PART 1, docs/EXPANSION-P1.md §3.2): the final ---
  // steel disc of mission 9, built HERE because (0,0) is quarantine territory.
  // Ø 4 m disc, 0.6 thick, half-buried (top edge at y = 0.3), cold emissive.
  // The position is clear in the legacy layout (nearest obstacle (−8,−6)).
  {
    const vaultGeo = new THREE.CylinderGeometry(2, 2, 0.6, 24);
    vaultGeo.translate(0, 0, 0); // centered on y=0 → spans −0.3..+0.3 (half-buried)
    geometries.push(vaultGeo);
    const vaultMat = new THREE.MeshStandardMaterial({
      color: 0x0d2430,
      emissive: 0x4fd8ff,
      emissiveIntensity: 0.9,
      roughness: 0.4,
      metalness: 0.7,
    });
    materials.push(vaultMat);
    const vault = new THREE.Mesh(vaultGeo, vaultMat);
    vault.castShadow = true; // §3.7: the vault door is an explicit shadow caster
    vault.receiveShadow = true;
    vault.userData.solid = true; // combat.js: steel stops bullets
    objects.push(vault);
    scene.add(vault);
    colliders.push({ minX: -2, maxX: 2, minZ: -2, maxZ: 2 }); // §3.2 collider
  }

  // --- gate frames (expansion C1/C2): glowing portal + icon over each gap -----
  // Posts + lintel merge into ONE mesh per gate. Posts get colliders (they sit
  // flush with the wall ends); the lintel is overhead so it gets NO collider —
  // colliders are 2D XZ boxes and one across the gap would seal the passage.
  const gateIconTex = makeGateIconTexture();
  textures.push(gateIconTex);
  const GATE_GLOW = [0x2fd6ff, 0xffa428]; // north cyan, east amber

  for (let i = 0; i < GATE_WAYPOINTS.length; i++) {
    const gate = GATE_WAYPOINTS[i];
    const alongX = i === 0; // north gate opens along X, east gate along Z
    const postW = alongX ? 0.5 : 0.6;
    const postD = alongX ? 0.6 : 0.5;
    const postH = WALL_H + 0.4;
    const geos = [];
    for (const side of [-1, 1]) {
      const px = gate.x + (alongX ? side * (GATE_HALF + postW / 2) : 0);
      const pz = gate.z + (alongX ? 0 : side * (GATE_HALF + postD / 2));
      const post = new THREE.BoxGeometry(postW, postH, postD);
      post.translate(px, postH / 2, pz);
      geos.push(post);
      colliders.push({ minX: px - postW / 2, maxX: px + postW / 2, minZ: pz - postD / 2, maxZ: pz + postD / 2 });
    }
    const linW = alongX ? GATE_HALF * 2 + postW * 2 + 0.4 : 0.7;
    const linD = alongX ? 0.7 : GATE_HALF * 2 + postD * 2 + 0.4;
    const lintel = new THREE.BoxGeometry(linW, 1.1, linD);
    lintel.translate(gate.x, 3.65, gate.z);
    geos.push(lintel);
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    geometries.push(merged);
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x11161f,
      emissive: GATE_GLOW[i],
      emissiveIntensity: 1.3,
      roughness: 0.5,
      metalness: 0.2,
    });
    materials.push(glowMat);
    const gateMesh = new THREE.Mesh(merged, glowMat);
    gateMesh.castShadow = true;
    gateMesh.userData.solid = true; // posts/lintel stop bullets (3D raycast)
    objects.push(gateMesh);
    scene.add(gateMesh);

    // Icon quad on both lintel faces (visible from the arena AND the zone).
    const iconMat = new THREE.MeshBasicMaterial({
      map: gateIconTex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    materials.push(iconMat);
    for (const side of [-1, 1]) {
      const off = (alongX ? linD : linW) / 2 + 0.02;
      const plane = new THREE.PlaneGeometry(0.9, 0.9);
      if (alongX) {
        plane.translate(gate.x, 3.65, gate.z + side * off);
      } else {
        plane.rotateY(Math.PI / 2); // face along X instead of Z
        plane.translate(gate.x + side * off, 3.65, gate.z);
      }
      geometries.push(plane);
      const icon = new THREE.Mesh(plane, iconMat);
      objects.push(icon);
      scene.add(icon);
    }
  }

  // --- spawn points (12 arena ring + the UNLOCKED zones' points) ---------------
  const R = 26; // ring radius, 4 m inside the playable wall face
  const ARENA_SPAWN_COUNT = 12;
  const spawnPoints = [
    new THREE.Vector3(R, 0, 0),
    new THREE.Vector3(-R, 0, 0),
    new THREE.Vector3(0, 0, R),
    new THREE.Vector3(0, 0, -R),
    new THREE.Vector3(R, 0, 13),
    new THREE.Vector3(R, 0, -13),
    new THREE.Vector3(-R, 0, 13),
    new THREE.Vector3(-R, 0, -13),
    new THREE.Vector3(13, 0, R),
    new THREE.Vector3(13, 0, -R),
    new THREE.Vector3(-13, 0, R),
    new THREE.Vector3(-13, 0, -R),
  ];
  // Zone points exist in full here and are MIRRORED into spawnPoints by
  // refreshZoneSpawns() — a locked zone's points must never feed wave
  // spawning (waves.js reads level.spawnPoints fresh on every spawn). The
  // Vector3 objects are shared, so the safety-nudge below keeps affecting
  // them even while they are out of the pool.
  const zoneSpawnVecs = ZONE_SPAWNS.map((p, i) => ({
    vec: new THREE.Vector3(p.x, 0, p.z),
    zone: i < 3 ? "north" : "east", // ZONE_SPAWNS order: 3 north, then 3 east
  }));
  for (const zs of zoneSpawnVecs) spawnPoints.push(zs.vec);
  // Safety net: nudge any spawn point that ended up inside a collider toward
  // the area interior (no-op with the layout above, but layout-proof).
  for (const sp of spawnPoints) {
    let tries = 0;
    while (tries++ < 32) {
      const x = sp.x, z = sp.z;
      let blocked = !inBounds(x, z); // arena OR either zone
      if (!blocked) {
        for (const c of colliders) {
          if (circleHitsRect(x, z, 0.8 * 0.8, c)) { blocked = true; break; }
        }
      }
      if (!blocked) break;
      sp.x *= 0.97;
      sp.z *= 0.97;
    }
  }

  // --- queries ---------------------------------------------------------------

  // Zone lock state (feature C1 — "Mở sau khi clear wave 2/4"): a LOCKED zone
  // is sealed — isBlocked() treats its whole rect (gate gap included) as solid
  // so neither the player nor a zombie can slip through the open gate, and its
  // spawn points stay out of the wave pool. zones.js syncs this (locks both at
  // creation, opens on unlockForWave, re-locks on reset); main.js teleport
  // opens a zone before dropping the player in. Starts open here so the
  // zones.js dev-guard check runs against the real walkable geometry — the
  // locks are applied right after that guard, before any wave can spawn.
  /** @type {Record<"north"|"east", boolean>} */
  const zoneLocks = { north: false, east: false };
  const ZONE_RECT_OF = { north: AREA_RECTS[1], east: AREA_RECTS[2] };

  /**
   * EXPANSION C1: seal/open one zone. Sealing also rebuilds the zone section
   * of spawnPoints. Unknown ids are ignored.
   * @param {"north"|"east"} id
   * @param {boolean} locked
   * @returns {boolean} true when the state actually changed
   */
  function setZoneLocked(id, locked) {
    if (id !== "north" && id !== "east") return false;
    const next = locked !== false;
    if (zoneLocks[id] === next) return false;
    zoneLocks[id] = next;
    refreshZoneSpawns();
    return true;
  }

  /** Mirror the unlocked zones' spawn points into the wave-spawn pool. */
  function refreshZoneSpawns() {
    spawnPoints.length = ARENA_SPAWN_COUNT;
    for (let i = 0; i < zoneSpawnVecs.length; i++) {
      if (!zoneLocks[zoneSpawnVecs[i].zone]) spawnPoints.push(zoneSpawnVecs[i].vec);
    }
  }

  /**
   * Which walkable rectangle holds the point: 0 = main arena, 1 = north zone,
   * 2 = east zone, -1 = none (void). Allocation-free, called per sample.
   * @param {number} x
   * @param {number} z
   * @returns {number}
   */
  function areaOf(x, z) {
    for (let i = 0; i < AREA_RECTS.length; i++) {
      const r = AREA_RECTS[i];
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return i;
    }
    return -1;
  }

  /**
   * NIGHT 30 PART 1 (§3.5.2): node id for the 9-way connectivity graph used by
   * sameArea — 0/1/2 = the quarantine sub-rects (AREA_RECTS, legacy granularity
   * preserved), 3..8 = the outer districts (DISTRICT_RECTS, §3.1 table order),
   * -1 = void. Quarantine is tested FIRST so the R-Q strip x −30..−15,
   * z −54..−30 resolves to residential (§3.1 rule 3) and the 3 void notches
   * inside the quarantine bbox stay void (rule 4).
   * @param {number} x
   * @param {number} z
   * @returns {number}
   */
  function areaNodeAt(x, z) {
    const a = areaOf(x, z);
    if (a !== -1) return a;
    for (let i = 0; i < DISTRICT_RECTS.length; i++) {
      const r = DISTRICT_RECTS[i];
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return i + 3;
    }
    return -1;
  }

  /**
   * @param {number} x
   * @param {number} z
   * @returns {boolean} true when the point is inside ANY of the 7 district
   *   bounds (quarantine via its 3 sub-rects) — i.e. not void.
   */
  function inBounds(x, z) {
    return areaNodeAt(x, z) !== -1;
  }

  // --- collider spatial hash ---------------------------------------------------
  // isBlocked used to scan the whole collider list per call — with the city's
  // props that meant ~300 AABB tests × ~100 calls/frame (40 zombies steering +
  // LOS + the player). A 16 m uniform grid over the colliders turns a query
  // into 1–4 cells of a few entries each. The grid rebuilds lazily whenever
  // the public `colliders` array has grown since the last call (builders and
  // zone seals append to it; dispose() empties it, which also retriggers).
  const COLLIDER_CELL = 16;
  /** @type {Map<number, number[]> | null} cellKey -> collider indices */
  let colliderGrid = null;
  let colliderGridLen = -1;

  function rebuildColliderGrid() {
    colliderGrid = new Map();
    colliderGridLen = colliders.length;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const x0 = Math.floor(c.minX / COLLIDER_CELL);
      const x1 = Math.floor(c.maxX / COLLIDER_CELL);
      const z0 = Math.floor(c.minZ / COLLIDER_CELL);
      const z1 = Math.floor(c.maxZ / COLLIDER_CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const k = cx * 4096 + cz;
          let cell = colliderGrid.get(k);
          if (!cell) colliderGrid.set(k, (cell = []));
          cell.push(i);
        }
      }
    }
  }

  /**
   * Circle-vs-AABB: clamp the circle center to the box, compare distances.
   * A LOCKED zone's rect counts as solid too (feature C1): the whole area —
   * gate gap included — is untouchable until setZoneLocked(id, false).
   * @param {number} x
   * @param {number} z
   * @param {number=} r
   * @returns {boolean}
   */
  function isBlocked(x, z, r = 0.4) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return true; // NaN-safe
    if (!inBounds(x, z)) return true; // void — outside all 7 district bounds
    const r2 = r * r;
    for (const id in zoneLocks) {
      if (zoneLocks[id] && circleHitsRect(x, z, r2, ZONE_RECT_OF[id])) return true;
    }
    if (colliderGridLen !== colliders.length) rebuildColliderGrid();
    const x0 = Math.floor((x - r) / COLLIDER_CELL);
    const x1 = Math.floor((x + r) / COLLIDER_CELL);
    const z0 = Math.floor((z - r) / COLLIDER_CELL);
    const z1 = Math.floor((z + r) / COLLIDER_CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const cell = colliderGrid.get(cx * 4096 + cz);
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          if (circleHitsRect(x, z, r2, colliders[cell[i]])) return true;
        }
      }
    }
    return false;
  }

  // --- city gate registration (NIGHT 30 PART 1, §3.5.3-3.5.4) -------------------
  // city.js registers its 12 district gates + flips their live open state
  // through the PRIVATE hooks below (non-enumerable on the returned API — NOT
  // part of the frozen Level contract). sameArea then reports two points as
  // "same area" when they sit in districts connected through OPEN gates, and
  // getGateWaypoints() returns the 12 city gap centers + the 2 legacy internal
  // ones (14 total — contract decision K7).

  /**
   * Registered city gates: {x, z, axis, width, a, b, open} where a/b are the
   * area-node ids on each side of the gap (sampled ±1.6 m across the wall).
   * @type {Array<{x: number, z: number, axis: string, width: number,
   *               a: number, b: number, open: boolean}>}
   */
  const cityGates = [];
  /** @type {Array<number>|null} union-find parent table over nodes 0..8 */
  let cityComponents = null;
  let cityComponentsDirty = true;
  /** Waypoints returned by getGateWaypoints(): 2 legacy + 12 registered. */
  const gateWaypoints = [GATE_WAYPOINTS[0], GATE_WAYPOINTS[1]];

  /**
   * PRIVATE (city.js only): register the district gates. Recomputes nothing —
   * components rebuild lazily on the next sameArea query.
   * @param {Array<{x: number, z: number, axis: string, width: number,
   *                open?: boolean}>} list
   */
  function cityRegisterGates(list) {
    if (!Array.isArray(list)) return;
    for (const g of list) {
      if (!g || !Number.isFinite(g.x) || !Number.isFinite(g.z)) continue;
      const off = 1.6; // past the 0.5 m wall band + 0.6 m post depth
      const a = g.axis === "x" ? areaNodeAt(g.x, g.z - off) : areaNodeAt(g.x - off, g.z);
      const b = g.axis === "x" ? areaNodeAt(g.x, g.z + off) : areaNodeAt(g.x + off, g.z);
      cityGates.push({ x: g.x, z: g.z, axis: g.axis, width: g.width, a, b, open: g.open === true });
      gateWaypoints.push({ x: g.x, z: g.z });
    }
    cityComponentsDirty = true;
  }

  /**
   * PRIVATE (city.js only): flip one registered gate's open state (called when
   * the barrier sink/raise finishes — passability matches the collider, not
   * the command). Unknown gaps are ignored.
   * @param {number} x
   * @param {number} z
   * @param {boolean} open
   * @returns {boolean} true when a gate was found and the state changed
   */
  function cityGateOpenAt(x, z, open) {
    for (let i = 0; i < cityGates.length; i++) {
      const g = cityGates[i];
      if (g.x === x && g.z === z) {
        const next = open === true;
        if (g.open === next) return false;
        g.open = next;
        cityComponentsDirty = true;
        return true;
      }
    }
    return false;
  }

  /**
   * Rebuild the union-find over the 9 area nodes using the OPEN city gates as
   * edges. Runs at most once between gate-state changes.
   */
  function rebuildCityComponents() {
    const comp = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const find = (i) => {
      while (comp[i] !== i) {
        comp[i] = comp[comp[i]];
        i = comp[i];
      }
      return i;
    };
    for (const g of cityGates) {
      if (g.open && g.a >= 0 && g.b >= 0) {
        const ra = find(g.a);
        const rb = find(g.b);
        if (ra !== rb) comp[ra] = rb;
      }
    }
    for (let i = 0; i < 9; i++) comp[i] = find(i);
    cityComponents = comp;
    cityComponentsDirty = false;
  }

  /**
   * EXPANSION C3 helper, extended (§3.5.4): true when both points sit in the
   * SAME area — legacy granularity for quarantine (arena / north / east stay
   * three separate nodes so the internal gate waypoints keep working, decision
   * K7) — OR in districts connected through ≥ 1 OPEN city gate (transitive;
   * recomputed lazily only when a gate state flips).
   * @param {number} x1
   * @param {number} z1
   * @param {number} x2
   * @param {number} z2
   * @returns {boolean}
   */
  function sameArea(x1, z1, x2, z2) {
    const a = areaNodeAt(x1, z1);
    if (a === -1) return false;
    const b = areaNodeAt(x2, z2);
    if (a === b) return true;
    if (b === -1 || cityGates.length === 0) return false;
    if (cityComponentsDirty) rebuildCityComponents();
    return cityComponents[a] === cityComponents[b];
  }

  /**
   * EXPANSION C2 + NIGHT 30 (K7): the frozen gate waypoints (INSIDE the gaps)
   * — the 2 legacy internal quarantine gates first, then the 12 city district
   * gates registered by city.js. zombie.js paths through the nearest reachable
   * one when a wall blocks the chase. Waypoints of LOCKED gates stay in the
   * list; the extended sameArea keeps zombies from pathing through them.
   * @returns {Array<{x: number, z: number}>} the shared array — do not mutate.
   */
  function getGateWaypoints() {
    return gateWaypoints;
  }

  function dispose() {
    for (const obj of objects) scene.remove(obj);
    objects.length = 0;
    for (const g of geometries) g.dispose();
    geometries.length = 0;
    for (const m of materials) m.dispose();
    materials.length = 0;
    for (const t of textures) t.dispose();
    textures.length = 0;
    colliders.length = 0;
    spawnPoints.length = 0;
  }

  // Public API — the frozen shape from the original contract. The two city.js
  // registration hooks (§3.5.3-3.5.4) ride along as NON-ENUMERABLE private
  // members so the documented Level contract is unchanged.
  const api = { colliders, isBlocked, spawnPoints, getGateWaypoints, sameArea, setZoneLocked, dispose };
  Object.defineProperty(api, "__cityRegisterGates", { value: cityRegisterGates, enumerable: false, writable: false });
  Object.defineProperty(api, "__cityGateOpenAt", { value: cityGateOpenAt, enumerable: false, writable: false });
  return api;
}
