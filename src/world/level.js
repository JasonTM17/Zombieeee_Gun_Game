/**
 * Static arena: 60 x 60 m floor, 4 m perimeter walls, and 10–15 scattered
 * obstacles (wooden crates, concrete blocks, pillars) — EVERY obstacle is a
 * collider. The floor uses a procedural dark grid texture (CanvasTexture —
 * no external assets). Use merged geometry or otherwise keep the draw-call
 * count low. Floor/walls receive shadows; obstacles cast + receive.
 *
 * Colliders are axis-aligned XZ rectangles (the game simulates XZ only):
 *   {minX, maxX, minZ, maxZ} in meters, covering walls + all obstacles.
 *
 * isBlocked(x, z, r): true if a circle of radius r (DEFAULT 0.4 m) centered
 * at (x, z) intersects any collider — standard circle-vs-AABB test (clamp the
 * circle center to the box, compare distances). Positions outside the arena
 * bounds are blocked too (the walls' colliders already ensure this).
 *
 * spawnPoints: >= 8 Vector3 positions near the arena edges (y = 0) used by
 * the wave director; spread around all four sides.
 *
 * dispose(): remove everything from the scene and dispose geometries,
 * materials and the CanvasTexture (called on restart/teardown if needed).
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
 * @property {import("three").Vector3[]} spawnPoints - >= 8 points near the edges.
 * @property {() => void} dispose - remove + dispose all level resources.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const HALF = 30; // arena half-size -> 60 x 60 m
const WALL_H = 4;
const WALL_T = 0.5;

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
 * Procedural dark grid texture: one 2 m tile per canvas, faint blue-gray
 * grid lines + grunge speckles. No external assets.
 * @returns {THREE.CanvasTexture}
 */
function makeFloorTexture() {
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

  // Grid lines on the tile border (2 m cell with repeat = 30).
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
  tex.repeat.set(HALF, HALF); // 2 m cells over 60 m
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Axis-aligned XZ collider from a center + full extents. */
function colliderOf(x, z, sx, sz) {
  return { minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 };
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
  objects.push(floor);
  scene.add(floor);

  // --- perimeter walls (4 boxes merged into 1 mesh) ---------------------------
  // N/S boxes span the full width incl. corners; E/W boxes are 2*HALF long so
  // their end faces stay buried inside the N/S boxes (no coplanar z-fighting).
  const wallGeos = [];
  const wallSpecs = [
    { w: HALF * 2 + WALL_T * 2, d: WALL_T, x: 0, z: -HALF },
    { w: HALF * 2 + WALL_T * 2, d: WALL_T, x: 0, z: HALF },
    { w: WALL_T, d: HALF * 2, x: -HALF, z: 0 },
    { w: WALL_T, d: HALF * 2, x: HALF, z: 0 },
  ];
  for (const w of wallSpecs) {
    const geo = new THREE.BoxGeometry(w.w, WALL_H, w.d);
    geo.translate(w.x, WALL_H / 2, w.z);
    const tint = new THREE.Color().setHSL(0.6, 0.14, 0.16 + Math.random() * 0.03);
    wallGeos.push(tintGeometry(geo, tint));
    // Collider mirrors the visual volume exactly.
    colliders.push({
      minX: w.x - w.w / 2,
      maxX: w.x + w.w / 2,
      minZ: w.z - w.d / 2,
      maxZ: w.z + w.d / 2,
    });
  }
  const wallGeo = mergeGeometries(wallGeos, false);
  for (const g of wallGeos) g.dispose(); // merged copies the data
  geometries.push(wallGeo);
  const wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 });
  materials.push(wallMat);
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.castShadow = true;
  walls.receiveShadow = true;
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

  const obstacleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.04 });
  materials.push(obstacleMat);
  /** @type {[THREE.BufferGeometry[], string]} */
  const groups = [[crateGeos, "crates"], [blockGeos, "blocks"], [pillarGeos, "pillars"]];
  for (const [geos] of groups) {
    if (geos.length === 0) continue;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    geometries.push(merged);
    const mesh = new THREE.Mesh(merged, obstacleMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    objects.push(mesh);
    scene.add(mesh);
  }

  // --- spawn points (12, spread over all four sides, near the edges) ---------
  const R = 26; // ring radius, 4 m inside the playable wall face
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
  // Safety net: nudge any spawn point that ended up inside a collider toward
  // the arena center (no-op with the layout above, but layout-proof).
  for (const sp of spawnPoints) {
    let tries = 0;
    while (tries++ < 32) {
      const x = sp.x, z = sp.z;
      let blocked = Math.abs(x) > HALF || Math.abs(z) > HALF;
      if (!blocked) {
        for (const c of colliders) {
          const cx = Math.min(Math.max(x, c.minX), c.maxX);
          const cz = Math.min(Math.max(z, c.minZ), c.maxZ);
          const dx = x - cx, dz = z - cz;
          if (dx * dx + dz * dz < 0.8 * 0.8) { blocked = true; break; }
        }
      }
      if (!blocked) break;
      sp.x *= 0.97;
      sp.z *= 0.97;
    }
  }

  // --- queries ---------------------------------------------------------------

  /**
   * Circle-vs-AABB: clamp the circle center to the box, compare distances.
   * @param {number} x
   * @param {number} z
   * @param {number=} r
   * @returns {boolean}
   */
  function isBlocked(x, z, r = 0.4) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return true; // NaN-safe
    if (x < -HALF || x > HALF || z < -HALF || z > HALF) return true; // outside
    const r2 = r * r;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const cx = x < c.minX ? c.minX : x > c.maxX ? c.maxX : x;
      const cz = z < c.minZ ? c.minZ : z > c.maxZ ? c.maxZ : z;
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
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

  return { colliders, isBlocked, spawnPoints, dispose };
}
