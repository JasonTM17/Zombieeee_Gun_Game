/**
 * Debug console hook.
 *
 * Creates window.__game whose 8 methods are NO-OPS returning
 * { error: "not-registered" } until register(api) is called. main.js calls
 * register(api) LAST in the bootstrap sequence with the real wiring:
 *
 * - startGame(): start a fresh run (gamestate.restart(); pointer lock will
 *   silently fail outside a user gesture — acceptable for a debug call).
 * - getState(): a snapshot object
 *       { state, hp, score, wave, zombiesAlive,
 *         playerPos: {x, y, z}, nearestZombieDist,
 *         weapon: { name, mag, reserve } }
 *   computed by main.js from the player / gamestate / shared zombie array /
 *   weapons.getState().
 * - spawnZombie(type?): instantiate one Zombie (default "walker") at a free
 *   spot and push it into the shared zombies array; debug spawns do NOT
 *   affect wave accounting.
 * - damagePlayer(n?): player.damage(n), default 10.
 * - fireWeapon(): fire the current weapon once (routes to combat.shoot with
 *   the active weapon object, bypassing mag/fire-rate gating is acceptable).
 * - switchWeapon(i?): weapons.switchTo(i), default the next index.
 * - reload(): weapons.reload() for the current weapon.
 * - giveAmmo(): refill reserves by mutating weapons.list entries (e.g.
 *   reserve = magSize * 5 per weapon; pistol stays Infinity).
 *
 * register(api) replaces the no-op methods with the api's own methods (same
 * names); unknown api keys are ignored. window.__game must exist as soon as
 * createDebugHook() is called (before registration), so console calls never
 * crash in menu state.
 *
 * @returns {DebugHook}
 */

/**
 * @typedef {Object} DebugHook
 * @property {(api: {
 *   startGame?: Function, getState?: Function, spawnZombie?: Function,
 *   damagePlayer?: Function, fireWeapon?: Function, switchWeapon?: Function,
 *   reload?: Function, giveAmmo?: Function
 * }) => void} register - install the real api onto window.__game.
 */

export function createDebugHook() {
  throw new Error("TODO: implement");
}
