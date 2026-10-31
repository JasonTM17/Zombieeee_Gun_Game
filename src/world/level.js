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

export function createLevel(scene) {
  throw new Error("TODO: implement");
}
