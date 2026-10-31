/**
 * Pickup drops (ammo / health).
 *
 * Drops: listens "zombie-killed" on the bus → 18% chance to spawn a pickup at
 * the death position; the kind is 70% "ammo" / 30% "health".
 *
 * Items: small glowing low-poly boxes/canisters (emissive material, no
 * external assets) that rotate and bob above the floor.
 *
 * Magnet + collection (in update(dt, playerPos)):
 * - within 2 m → accelerate toward the player (magnet);
 * - within 1 m → collected: remove the item and emit "pickup" {kind} on the
 *   bus. This module does NOT apply effects itself (no player/weapons/audio
 *   references — signature frozen). Consumers:
 *   - player controller: "pickup" {kind:"health"} → +40 HP (cap 100);
 *   - weapons: "pickup" {kind:"ammo"} → +1 mag reserve to the active weapon,
 *     +50% of a mag to the other two;
 *   - main.js routes the event to audio.pickup().
 *
 * reset(): remove all pickups from the scene (fresh run).
 *
 * Bus events emitted: "pickup" {kind: "ammo"|"health"}.
 * Bus events consumed: "zombie-killed" {type, score, headshot, position}.
 *
 * @param {import("three").Scene} scene
 * @param {EventTarget} bus
 * @returns {Pickups}
 */

/**
 * @typedef {Object} Pickups
 * @property {(position: import("three").Vector3, kind: "ammo"|"health") => void} spawn
 *   Spawn a pickup of the given kind at position (debug can force drops).
 * @property {(dt: number, playerPos: import("three").Vector3) => void} update
 *   Animate items, magnet and collect (dt seconds; playerPos = player feet).
 * @property {() => void} reset - remove all pickups.
 */

export function createPickups(scene, bus) {
  throw new Error("TODO: implement");
}
