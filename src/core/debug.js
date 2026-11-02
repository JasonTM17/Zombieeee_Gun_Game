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
 * NIGHT 30 P1 api (docs/EXPANSION-P1.md §5.6.5) — same pattern, wired by
 * main.js at register() time:
 * - startStory(): fresh story run → intro slides (identical to pressing PLAY).
 * - skipToMission(n): mark m1..m(n−1) done (their gates open), activate
 *   mission n + emit "mission-start".
 * - completeObjective(): force-complete the active mission's first
 *   unfinished objective.
 * - fillQuota(): set the active quota objective to done = need.
 * - teleportDistrict(id): open every gate along the BFS shortest route, then
 *   move the player to that district's center.
 * - getState(): the legacy snapshot PLUS {story, currentDistrict,
 *   unlockedDistricts}.
 *
 * NIGHT 30 P2 api (docs/EXPANSION-P2.md §8.7) — same pattern:
 * - forceEvent(type): start "horde"|"supply"|"survivor"|"bloodmoon" right
 *   now (skips the scheduler cooldown, still respects the bloodmoon
 *   exclusion rules — §3.2).
 * - audioState(): {ctxState, activeVoices} — the 3D voice engine snapshot
 *   (§5.4).
 * - getState(): the legacy snapshot PLUS {event: {type, timeLeft}|null,
 *   bloodmoon: boolean}.
 *
 * NIGHT 30 P3 api (docs/EXPANSION-P3.md §6.4) — same pattern:
 * - spawnOrigin(): jump to mission 10 (opens gates, fires "mission-start"
 *   {index:10} → main opens the vault + spawns), then spawn directly if the
 *   Origin is still missing; {ok, hp, maxHp, phase}.
 * - damageOrigin(n): takeDamage to the live Origin; {hp, maxHp, phase,
 *   killed} or {error:"no-origin-alive"}.
 * - originState(): {alive, phase, hp, maxHp, state} or {alive:false}.
 * - skipToEnding(): kill the living Origin through the REAL death road
 *   (takeDamage(hp+1)) or fire the synthetic "origin-defeated" {debug:true};
 *   {state, ending}.
 * - getState(): the legacy snapshot PLUS {origin, ngPlus}.
 *
 * register(api) replaces the no-op methods with the api's own methods (same
 * names); unknown api keys are ignored. window.__game must exist as soon as
 * createDebugHook() is called (before registration), so console calls never
 * crash in menu state.
 *
 * GUN GAME 2.0 P4 api (docs/EXPANSION-P4.md §7.3) — same pattern:
 * - saveNow(): one autosave with reason "debug" ({ok, ts}).
 * - hasSave(): whether a readable "gungame.save.v1" exists.
 * - endlessState(): {active, wave, score} — a fresh clone of the live
 *   Endless snapshot.
 * - achievementsState(): the unlocked achievement ids.
 * - setDifficulty(d): persist + broadcast the preset ("easy"|"normal"|"hard";
 *   invalid → settings sanitize back to "normal").
 * - getState(): the legacy snapshot PLUS {save: {hasSave}, endless,
 *   difficulty}.
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
 *   teleport?: Function, unlockZone?: Function,
 *   startStory?: Function, skipToMission?: Function,
 *   completeObjective?: Function, fillQuota?: Function,
 *   teleportDistrict?: Function,
 *   forceEvent?: Function, audioState?: Function,
 *   spawnOrigin?: Function, damageOrigin?: Function,
 *   originState?: Function, skipToEnding?: Function,
 *   saveNow?: Function, hasSave?: Function, endlessState?: Function,
 *   achievementsState?: Function, setDifficulty?: Function
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
  // NIGHT 30 P1 (docs/EXPANSION-P1.md §5.6.5) — wired by main.js at
  // register() time; keys absent from this list are still ignored.
  "startStory",
  "skipToMission",
  "completeObjective",
  "fillQuota",
  "teleportDistrict",
  // NIGHT 30 P2 (docs/EXPANSION-P2.md §8.7) — wired by main.js at
  // register() time.
  "forceEvent",
  "audioState",
  // NIGHT 30 P3 (docs/EXPANSION-P3.md §6.4) — wired by main.js at
  // register() time; keys absent from this list are still ignored, so every
  // debug-api function main.js installs must be listed here or window.__game
  // keeps the not-registered stub forever.
  "spawnOrigin",
  "damageOrigin",
  "originState",
  "skipToEnding",
  // GUN GAME 2.0 P4 (docs/EXPANSION-P4.md §7.3) — wired by main.js at
  // register() time; keys absent from this list are still ignored.
  "saveNow",
  "hasSave",
  "endlessState",
  "achievementsState",
  "setDifficulty",
  // WORLD 2.0 — merchant / bombs / weather.
  "merchantState",
  "openMerchant",
  "throwablesState",
  "weatherState",
  "setWeather",
  "perksState",
  "addXp",
  "contractsState",
  "openContracts",
  "hazardsState",
  "detonateHazard",
  "bossrushState",
  "startBossRush",
  "companionState",
  "rescueCompanion",
  "weaponStats",
  "photoState",
  "togglePhoto",
  "saveToolsState",
  "leaderboardState",
  "dailyState",
  "cloudSaveState",
  "startDailyChallenge",
  "weaponWheelState",
  "renderInfo",
  "teleportTo",
  "shootHazard",
  "atmosphereInfo",
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
