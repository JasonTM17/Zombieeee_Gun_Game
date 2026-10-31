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
 * EXPANSION api (docs/EXPANSION.md "main.js MỞ RỘNG" — the doc directs adding
 * the new keys here because register() ignores unknown ones):
 * - giveMoney(n): economy.add(n).
 * - buyWeapon(id) / buy(id): shop.buy(id) — a weapon or ammo/medkit item.
 * - toggleShop(): open/close the shop overlay (no-ops outside a live run).
 * - spawnBoss(type, inFront?): one boss; inFront → ~12 m before the camera,
 *   otherwise the zone anchor. Outside wave accounting (debug spawn).
 * - damageBoss(n): n damage to the live boss.
 * - teleport(zoneId): player to a zone's center ("main" = arena origin).
 * - unlockZone(id): open that expansion zone (idempotent).
 * - getState(): the legacy snapshot PLUS {money, boss, unlockedZones,
 *   ownedWeapons}.
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
 *   reload?: Function, giveAmmo?: Function,
 *   giveMoney?: Function, buyWeapon?: Function, toggleShop?: Function,
 *   buy?: Function, spawnBoss?: Function, damageBoss?: Function,
 *   teleport?: Function, unlockZone?: Function
 * }) => void} register - install the real api onto window.__game.
 */

const DEBUG_KEYS = [
  "startGame",
  "getState",
  "spawnZombie",
  "damagePlayer",
  "fireWeapon",
  "switchWeapon",
  "reload",
  "giveAmmo",
  // EXPANSION (docs/EXPANSION.md) — wired by main.js at register() time.
  "giveMoney",
  "buyWeapon",
  "toggleShop",
  "buy",
  "spawnBoss",
  "damageBoss",
  "teleport",
  "unlockZone",
];

export function createDebugHook() {
  /** @type {Record<string, Function>} */
  const methods = {};
  for (const key of DEBUG_KEYS) {
    methods[key] = () => ({ error: "not-registered" });
  }

  const hook = {
    /**
     * Install the real api. Later registrations win; unknown keys are
     * ignored; already-registered methods are only replaced by functions.
     * @param {Record<string, Function>} [api]
     */
    register(api) {
      if (!api || typeof api !== "object") return;
      for (const key of DEBUG_KEYS) {
        if (typeof api[key] === "function") {
          methods[key] = api[key];
        }
      }
    },
  };

  // Exposed immediately (before register) as the SAME object that register
  // mutates, so console calls never crash and upgrades apply in place.
  if (typeof window !== "undefined") {
    window.__game = methods;
  }

  return hook;
}
