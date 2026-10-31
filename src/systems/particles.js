/**
 * Particle system: a pre-allocated POOL of ~500 small meshes/sprites that are
 * recycled (never allocate per shot in steady state).
 *
 * Physics per particle: initial velocity + slight gravity, lifetime
 * 0.3–0.8 s, then the particle returns to the pool. Colors: blood = dark red,
 * muzzle = yellow-orange, sparks = pale/bright.
 *
 * Call sites: combat.js spawns blood at each pellet hit (n = 8..14) and a
 * muzzle blast per shot; sparks are available for impact accents (optional
 * use by combat/pickups).
 *
 * dispose(): release the pool and its geometries/materials.
 *
 * @param {import("three").Scene} scene
 * @returns {Particles}
 */

/**
 * @typedef {Object} Particles
 * @property {(position: import("three").Vector3, n?: number) => void} spawnBlood
 *   Burst of n dark-red blood particles at position (callers pass 8–14).
 * @property {(position: import("three").Vector3, dir: import("three").Vector3) => void} spawnMuzzle
 *   Yellow-orange muzzle blast bursting along dir.
 * @property {(position: import("three").Vector3) => void} spawnSpark
 *   A few bright sparks at position.
 * @property {(dt: number) => void} update - integrate velocities + lifetimes.
 * @property {() => void} dispose - release pool resources.
 */

export function createParticles(scene) {
  throw new Error("TODO: implement");
}
