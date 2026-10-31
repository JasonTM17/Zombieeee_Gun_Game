/**
 * Shop — buy weapons / ammo / medkits with money (EXPANSION feature B;
 * contract: docs/EXPANSION.md).
 *
 * createShop(bus, economy, weapons, player)
 *   → { catalog, buy(id) → {ok, reason?}, owned() → string[] }
 *
 * Catalog (spec — DO NOT change the ids or prices):
 *   id        price  effect
 *   "smg"      400   own the SMG weapon (weapons.js def — feature B4)
 *   "sniper"   800   own the sniper weapon (headshot ×3)
 *   "minigun" 1500   own the minigun (spin-up 0.6 s)
 *   "grenade" 1200   own the grenade launcher (explosive projectiles — B5)
 *   "ammo"     150   refill the FULL reserve of every OWNED weapon
 *                    (repeatable purchase)
 *   "medkit"   200   heal the player to FULL 100 HP (repeatable purchase)
 *
 * Rules:
 * - A weapon already owned CANNOT be bought again → {ok:false, reason:"owned"}.
 * - Not enough money → {ok:false, reason:"no-money"} (economy.spend fails).
 * - pistol / shotgun / rifle are owned FOR FREE from the start (unchanged
 *   legacy behavior) — owned() initially returns those three; the four new
 *   weapons MUST be bought through the shop.
 * - buy() deducts through economy.spend() and applies the effect: weapons
 *   entries unlocked for switching / reserve refills / player heal.
 *
 * @param {EventTarget} bus - the shared bus exported by src/systems/gamestate.js.
 * @param {import("./economy.js").Economy} economy
 * @param {import("../player/weapons.js").Weapons} weapons
 * @param {import("../player/controller.js").Player} player
 * @returns {Shop}
 */

/**
 * @typedef {Object} ShopEntry
 * @property {string} id - catalog id ("smg"|"sniper"|"minigun"|"grenade"|"ammo"|"medkit").
 * @property {number} price - cost in money (400|800|1500|1200|150|200).
 * @property {"weapon"|"ammo"|"medkit"} kind - effect kind.
 */

/**
 * @typedef {Object} Shop
 * @property {ShopEntry[]} catalog - the purchasable entries (see header table).
 * @property {(id: string) => {ok: boolean, reason?: string}} buy
 *   Purchase one catalog id: {ok:true} on success; {ok:false,
 *   reason:"no-money"|"owned"} on failure (reason string per spec/failure kind).
 * @property {() => string[]} owned - ids of owned weapons (always includes
 *   "pistol", "shotgun", "rifle"; plus every weapon bought from the shop).
 */

export function createShop(bus, economy, weapons, player) {
  void bus;
  void economy;
  void weapons;
  void player;
  throw new Error("TODO: implement");
}
