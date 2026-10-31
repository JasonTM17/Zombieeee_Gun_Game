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
 * - Unknown id → {ok:false, reason:"unknown"}.
 * - pistol / shotgun / rifle are owned FOR FREE from the start (unchanged
 *   legacy behavior) — owned() initially returns those three; the four new
 *   weapons MUST be bought through the shop.
 * - buy() deducts through economy.spend() and applies the effect: weapons
 *   entries unlocked for switching / reserve refills / player heal.
 *
 * Ownership convention (the one cross-module coupling this module owns):
 * - The shop is the WRITER of the ownership flag: buying weapon X sets
 *   `owned = true` on the matching entry of `weapons.list` (the expanded
 *   weapons.js gates digit/wheel switching on that flag per B4). The shop
 *   additionally keeps its own Set, so owned() stays correct even while
 *   `weapons.list` does not yet contain the bought weapon.
 * - reset() (EXPANSION integration surface, mirrors weapons.reset() /
 *   economy.reset()): forgets every weapon bought THIS run. main.js calls it
 *   on fresh runs — weapons.reset() un-owns the shop guns and money goes to
 *   0, so the private Set must not keep reporting them owned (the Set is
 *   private: nothing outside this module could clear it).
 * - Full reserve for the "ammo" purchase = the entry's `maxReserve` when the
 *   expanded WeaponState carries one, else this module's spec-table value
 *   (pistol ∞ / shotgun 24 / rifle 90 / smg 160 / sniper 25 / minigun 300 /
 *   grenade 12), else untouched. The pistol's Infinity is preserved.
 * - The "medkit" purchase writes player.hp = 100 directly (the controller
 *   exposes hp as a plain 0..100 property and has no heal method); a dead
 *   player is not resurrected.
 *
 * NOTE: all money flows through economy.spend() — this module NEVER writes
 * the balance itself, and it emits no bus events (the "money-changed" event
 * comes from the economy; shop-open/closed come from the shop UI).
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
 *   reason:"no-money"|"owned"|"unknown"} on failure (reason string per spec/failure kind).
 * @property {() => string[]} owned - ids of owned weapons (always includes
 *   "pistol", "shotgun", "rifle"; plus every weapon bought from the shop).
 * @property {() => void} reset - EXPANSION: forget the weapons bought this
 *   run (fresh run — see the ownership convention in the header).
 */

// Spec start reserves (contract tables B4 + the frozen legacy weapon table) —
// fallback when a WeaponState carries no maxReserve field of its own.
const START_RESERVE = {
  pistol: Infinity,
  shotgun: 24,
  rifle: 90,
  smg: 160,
  sniper: 25,
  minigun: 300,
  grenade: 12,
};

const CATALOG = [
  { id: "smg", price: 400, kind: "weapon" },
  { id: "sniper", price: 800, kind: "weapon" },
  { id: "minigun", price: 1500, kind: "weapon" },
  { id: "grenade", price: 1200, kind: "weapon" },
  { id: "ammo", price: 150, kind: "ammo" },
  { id: "medkit", price: 200, kind: "medkit" },
];

const FREE_WEAPONS = ["pistol", "shotgun", "rifle"];

export function createShop(bus, economy, weapons, player) {
  void bus; // reserved: purchases are API calls; no bus events from the shop
  void player; // only touched inside buyMedkit (guarded)

  // Weapon ids bought through THIS shop (source of truth alongside the
  // `owned` flag mirrored onto weapons.list entries).
  const bought = new Set();

  const list = weapons && Array.isArray(weapons.list) ? weapons.list : [];

  function findEntry(id) {
    for (let i = 0; i < CATALOG.length; i++) {
      if (CATALOG[i].id === id) return CATALOG[i];
    }
    return null;
  }

  function findWeapon(name) {
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      if (w && w.name === name) return w;
    }
    return null;
  }

  function isOwnedName(name) {
    if (FREE_WEAPONS.indexOf(name) !== -1) return true;
    if (bought.has(name)) return true;
    return false;
  }

  function owned() {
    const out = [];
    const push = (name) => {
      if (name && out.indexOf(name) === -1) out.push(name);
    };
    // weapons.list order first (HUD/shop display order matches the armory),
    // then guarantees: the free three, then anything bought while the list
    // did not yet expose that weapon.
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      if (!w || typeof w.name !== "string") continue;
      if (w.owned === true || isOwnedName(w.name)) push(w.name);
    }
    for (let i = 0; i < FREE_WEAPONS.length; i++) push(FREE_WEAPONS[i]);
    bought.forEach(push);
    return out;
  }

  /** "ammo" purchase: full reserve for every OWNED weapon. */
  function refillAmmo() {
    const ownedSet = new Set(owned());
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      if (!w || !ownedSet.has(w.name)) continue;
      const max = Number.isFinite(w.maxReserve)
        ? w.maxReserve
        : START_RESERVE[w.name];
      // Refill tops up — a reserve already above start (stockpiled pickups)
      // must never go DOWN from a purchase.
      if (max !== undefined && Number.isFinite(w.reserve)) {
        w.reserve = Math.max(w.reserve, max); // pistol: stays Infinity
      }
    }
  }

  /** "medkit" purchase: full 100 HP (never resurrects a dead player). */
  function healFull() {
    if (player && player.alive) player.hp = 100;
  }

  function buy(id) {
    const entry = findEntry(id);
    if (!entry) return { ok: false, reason: "unknown" };

    if (entry.kind === "weapon") {
      if (isOwnedName(entry.id)) return { ok: false, reason: "owned" };
      const w = findWeapon(entry.id);
      if (w && w.owned === true) return { ok: false, reason: "owned" };
      if (!economy.spend(entry.price)) return { ok: false, reason: "no-money" };
      bought.add(entry.id);
      if (w) w.owned = true; // weapons.js gates switching on this flag (B4)
      return { ok: true };
    }

    if (!economy.spend(entry.price)) return { ok: false, reason: "no-money" };
    if (entry.kind === "ammo") refillAmmo();
    else if (entry.kind === "medkit") healFull();
    return { ok: true };
  }

  /** EXPANSION fresh-run surface: drop every "bought this run" record so the
   * guns weapons.reset() just un-owned are buyable again (see header). */
  function reset() {
    bought.clear();
  }

  return { catalog: CATALOG, buy, owned, reset };
}
