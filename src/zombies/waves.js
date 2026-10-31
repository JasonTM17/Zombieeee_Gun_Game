/**
 * Wave director / zombie spawner.
 *
 * Wave n (1-based): total count = 5 + n*3 zombies, composed as:
 *   - brutes:  from wave 4, count = 1 + floor(n/5) of the total;
 *   - runners: from wave 2, ~25% of the total (Math.round);
 *   - the rest are walkers.
 *
 * Spawn cadence: the FIRST spawn lands within 3 s of the wave starting, then
 * one zombie every 0.8–1.5 s (random) until the wave's count is exhausted.
 * Spawn position: a level.spawnPoints entry at least 15 m from the player
 * (if none qualifies, the farthest one); instantiate
 * `new Zombie(scene, type, position, bus)`.
 *
 * A wave CLEARS when all of its zombies are dead → emit "wave-clear" {n},
 * then a 10 s intermission → emit "wave-start" {n+1} and repeat. Wave 1
 * starts on the FIRST update() call after construction/reset() — the main
 * loop only calls update() while the gamestate is "playing", which is what
 * freezes waves in menus/pause (menu: atmosphere only; paused: render only).
 *
 * Bus events emitted:
 * - "wave-start" {n}       (gamestate sets wave; hud shows banner + sting)
 * - "wave-clear" {n}
 * - "zombie-spawned" {zombie} — main.js pushes the zombie into the SHARED
 *   zombies array that createCombat received. (createWaves cannot take the
 *   array itself — its signature is frozen by spec — and combat is created
 *   BEFORE waves in the bootstrap order, so the bus is the bridge.)
 * - On reset(): every living zombie is disposed immediately and announced
 *   with "zombie-despawned" {zombie} so the shared array stays in sync
 *   (main.js must tolerate duplicates of that event).
 *
 * Internal bookkeeping: once a zombie is dead ("zombie-killed") it no longer
 * counts toward wave-clear; drop it from the internal list when its corpse
 * finishes despawning ("zombie-despawned") or on reset().
 *
 * @param {import("three").Scene} scene
 * @param {import("../world/level.js").Level} level
 * @param {EventTarget} bus
 * @returns {Waves}
 */

/**
 * @typedef {Object} Waves
 * @property {(dt: number, playerPos: import("three").Vector3) => void} update
 *   Advance spawn timers / intermission (dt seconds; playerPos = player feet).
 * @property {() => void} reset
 *   Clear all zombies + timers so a fresh run starts at wave 1 on next update.
 */

export function createWaves(scene, level, bus) {
  throw new Error("TODO: implement");
}
