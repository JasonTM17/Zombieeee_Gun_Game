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
 * WEAPON UPGRADES (GUN GAME 2.0 feature B — docs/EXPANSION-P4.md §4.2/P4-K7):
 * every OWNED weapon carries three upgrade tracks — "dmg" (damage), "mag"
 * (magazine), "rl" (reload speed) — 3 levels each, priced by the NEXT level
 * [250, 500, 1000] (max 1750 per track). Purchase id: "upg:{weapon}:{track}"
 * (weapon = one of the 7 armory names, track = "dmg"|"mag"|"rl"). Failure
 * reasons reuse the shop's vocabulary:
 *   "unknown"   — the id is not a valid upgrade id (nor a catalog id),
 *   "owned"     — the weapon does not exist in the armory OR is not owned
 *                 (ownership blocks this transaction — expanded meaning),
 *   "maxed"     — that track is already at level 3,
 *   "no-money"  — economy.spend() failed.
 * A successful buy raises the level through weapons.setUpgrades() (which
 * re-applies the effective damage/magSize in place) and emits
 * "upgrade-bought" {weapon, track, level} (level = the NEW level) on the bus —
 * THE one bus event this module emits (P4-K7; the shop was event-silent until
 * P4). No auto-save on upgrade purchases (the next mission-complete /
 * wave-clear save sweeps them up).
 * upgradeInfo() → Array<{weapon, tracks: Array<{track, level, nextPrice}>}>
 * for the shop UI's upgrade panel — OWNED weapons only, in weapons.list
 * order; nextPrice is null once the track is maxed. The 6-entry CATALOG
 * above is unchanged — upgrades are NOT catalog entries; the UI renders the
 * panel dynamically from upgradeInfo().
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
 * the balance itself. Bus events: none from the legacy catalog; the P4
 * upgrade path emits "upgrade-bought" {weapon, track, level} on success (see
 * the WEAPON UPGRADES section). "money-changed" comes from the economy;
 * shop-open/closed come from the shop UI.
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
 * One upgrade track of one owned weapon (GUN GAME 2.0 — shop UI panel data).
 * @typedef {Object} UpgradeTrack
 * @property {"dmg"|"mag"|"rl"} track - the upgrade track.
 * @property {number} level - current level, integer 0..3.
 * @property {number|null} nextPrice - cost of level → level+1 (250|500|1000),
 *   null once the track is at level 3.
 */

/**
 * Per-weapon upgrade state (GUN GAME 2.0 — owned weapons only).
 * @typedef {Object} UpgradeInfo
 * @property {string} weapon - weapon name ("pistol".."grenade").
 * @property {UpgradeTrack[]} tracks - one entry per track, UPG_TRACKS order.
 */

/**
 * @typedef {Object} Shop
 * @property {ShopEntry[]} catalog - the purchasable entries (see header table).
 * @property {(id: string) => {ok: boolean, reason?: string}} buy
 *   Purchase one catalog id or one upgrade id "upg:{weapon}:{track}":
 *   {ok:true} on success; {ok:false, reason:"no-money"|"owned"|"unknown"|
 *   "maxed"} on failure (see header for the per-reason semantics).
 * @property {() => string[]} owned - ids of owned weapons (always includes
 *   "pistol", "shotgun", "rifle"; plus every weapon bought from the shop).
 * @property {() => UpgradeInfo[]} upgradeInfo - GUN GAME 2.0: upgrade state
 *   for the shop UI panel — OWNED weapons only, weapons.list order.
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

// GUN GAME 2.0 (feature B / P4-K7): per-weapon upgrade tracks. Prices are by
// the NEXT level (0→1 = 250, 1→2 = 500, 2→3 = 1000; max 1750 per track).
const UPGRADE_PRICES = [250, 500, 1000];
const UPG_TRACKS = ["dmg", "mag", "rl"];
const UPG_ID_RE = /^upg:([a-z]+):(dmg|mag|rl)$/;

export function createShop(bus, economy, weapons, player) {
  // bus is USED from P4 on: successful "upg:*" purchases emit
  // "upgrade-bought" {weapon, track, level} (P4-K7 — the frozen exception to
  // this module's event silence).
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

  /**
   * "upg:{weapon}:{track}" (GUN GAME 2.0 feature B / P4-K7): one level on one
   * track of one OWNED weapon. Order of checks — id shape → existence +
   * ownership → maxed → money — mirrors the legacy buy() and never applies a
   * level without a successful spend. On success the level goes through
   * weapons.setUpgrades() (effective damage/magSize recomputed in place) and
   * "upgrade-bought" {weapon, track, level} fires with the NEW level.
   */
  function buyUpgrade(weapon, track) {
    const w = findWeapon(weapon);
    if (!w || (w.owned !== true && !isOwnedName(weapon))) {
      // Unknown weapon name, or not owned yet — ownership blocks the deal.
      return { ok: false, reason: "owned" };
    }
    const u = w.upgrades && typeof w.upgrades === "object" ? w.upgrades : {};
    const level = typeof u[track] === "number" && Number.isFinite(u[track])
      ? Math.floor(u[track])
      : 0;
    if (level >= UPGRADE_PRICES.length) return { ok: false, reason: "maxed" };
    if (!economy.spend(UPGRADE_PRICES[level])) {
      return { ok: false, reason: "no-money" };
    }
    if (weapons && typeof weapons.setUpgrades === "function") {
      weapons.setUpgrades(weapon, { [track]: level + 1 });
    } else {
      // Defensive fallback for a weapons build without setUpgrades(): write
      // the level onto the entry directly (same shape applyUpgrades uses).
      if (!w.upgrades || typeof w.upgrades !== "object") w.upgrades = { dmg: 0, mag: 0, rl: 0 };
      w.upgrades[track] = level + 1;
    }
    bus.dispatchEvent(
      new CustomEvent("upgrade-bought", {
        detail: { weapon, track, level: level + 1 },
      })
    );
    return { ok: true };
  }

  /**
   * GUN GAME 2.0 (P4-K7): per-weapon upgrade state for the shop UI panel —
   * OWNED weapons only, in weapons.list order, one track entry per
   * "dmg"/"mag"/"rl" with the current level and the next level's price
   * (null when maxed). A fresh object every call (the UI rebuilds from it).
   */
  function upgradeInfo() {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      if (!w || typeof w.name !== "string") continue;
      if (w.owned !== true && !isOwnedName(w.name)) continue;
      const u = w.upgrades && typeof w.upgrades === "object" ? w.upgrades : {};
      out.push({
        weapon: w.name,
        tracks: UPG_TRACKS.map((track) => {
          const level =
            typeof u[track] === "number" && Number.isFinite(u[track])
              ? Math.max(0, Math.floor(u[track]))
              : 0;
          return {
            track,
            level,
            nextPrice:
              level < UPGRADE_PRICES.length ? UPGRADE_PRICES[level] : null,
          };
        }),
      });
    }
    return out;
  }

  function buy(id) {
    if (typeof id !== "string") return { ok: false, reason: "unknown" };
    // GUN GAME 2.0: upgrade ids route through their own path (they are not
    // catalog entries — see header).
    const upg = UPG_ID_RE.exec(id);
    if (upg) return buyUpgrade(upg[1], upg[2]);

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

  return { catalog: CATALOG, buy, owned, upgradeInfo, reset };
}
