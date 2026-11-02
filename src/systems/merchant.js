/**
 * The Trader — a physical weapons merchant at the Safehouse.
 *
 * createMerchant(bus, economy, weapons, player)
 *   → { catalog, buy(id), state(), refreshStock(wave) }
 *
 * The merchant is the COUNTERPART of systems/shop.js (the B-key armory
 * overlay): same money rules (every purchase flows through economy.spend()),
 * but a separate catalog (11 original entries + 4 TRADER ATTACHMENTS), per-run
 * stock, and a restock every 5 cleared waves with ONE random "DEAL −25 %" item
 * (attachments never enter the deal pool — their prices are frozen). The two
 * weapon entries are merchant-exclusive: they unlock by name through
 * weapons.list (`owned`), exactly like the shop's B4 guns.
 *
 * CATALOG (FROZEN — ids/prices/stock):
 *   WEAPONS     sawnoff       $650  stock 1  double-barrel, close range
 *               crossbow      $750  stock 1  silent, headshot ×3
 *   EXPLOSIVES  frag_pack     $180  stock 4  +3 frag grenades
 *               molotov_pack  $150  stock 3  +3 molotovs
 *               mine_pack     $220  stock 2  +2 proximity mines
 *   GEAR        armor_plate   $300  stock 3  +50 armor
 *               medkit        $200  stock 5  full heal (never revives)
 *               ammo_full     $150  stock 5  full reserve, every owned gun
 *               bolts          $60  stock 5  +24 crossbow reserve (owned only)
 *               mystery_crate $250  stock 2  random cash/armor/ammo/frags
 *               stim_shot     $180  stock 3  +35 HP + 10 % speed for 20 s
 *   ATTACHMENTS att:scope       $450  stock 2  −35 % spread, max 1/gun
 *               att:extmag      $400  stock 2  +50 % mag, max 1/gun
 *               att:suppressor  $500  stock 2  −25 % recoil, −20 % spread
 *               att:laser       $350  stock 2  −25 % spread + red dot
 *
 * RULES
 * - One shared reason vocabulary: "unknown" | "owned" | "no-stock" |
 *   "need-crossbow" | "dead" | "no-money". state().entries[i].reason carries
 *   the CURRENT reason (null when buyable) so the UI can disable + label the
 *   button without re-deriving the rules.
 * - Stock decrements ONLY after economy.spend() succeeds; an owned weapon is
 *   never charged twice (idempotent unlock).
 * - Attachment purchases use the "att:<id>" id and apply to the ACTIVE
 *   weapon via weapons.applyAttachment(id); ownership is per weapon, so the
 *   card is "owned" only while that gun holds the part. Stock is shared
 *   across weapons (2 per run). Success emits "attachment-bought"
 *   {weapon, attachment}; every success (attachments included) also emits
 *   "merchant-purchase" {id: "att:<id>", kind: "attachment", price}.
 * - Weapon purchase: weapons.unlock(name) when present (full mag + reserve +
 *   stock upgrades), then the runtime entry is forced to owned = true,
 *   mag = magSize, reserve = startReserve. A weapons build without the entry
 *   still records ownership here (state() disables the card) — the runtime
 *   gun itself needs the matching weapons.list entry, the same extension
 *   point the shop's B4 weapons use.
 * - Throwables are NOT simulated here: buying one emits
 *   "throwable-add" {kind: "frag"|"molotov"|"mine", count}. The throwables
 *   system owns the inventory.
 * - Armor plate calls player.addArmor(50) (controller.js owns the arithmetic
 *   and "armor-changed"). Medkit sets hp = 100 only while player.alive —
 *   a dead player is never revived. Stim writes the additive
 *   `player.speedBoost = {mul: 1.1, time: 20}` field the controller's update()
 *   decrements (expiry is simulation time, so a paused run freezes it).
 * - Mystery crate rolls one of: $200–400 cash, +50 armor, full ammo, 2 frags.
 *   The applied effect is returned in buy()'s result AND surfaced by the UI
 *   as a toast (systems hold no DOM/i18n).
 *
 * BUS
 * Consumes: "wave-clear" {n} (restock every 5th clear, internal counter),
 *   "ui-play" | "ui-restart" | "ui-quit" (fresh run → full stock, no deal,
 *   merchant-exclusive ownership forgotten).
 * Emits: "merchant-purchase" {id, kind, price} on every successful purchase,
 *   "throwable-add" {kind, count} for explosive packs + the mystery crate.
 *
 * @param {EventTarget} bus - shared bus from src/systems/gamestate.js.
 * @param {import("./economy.js").Economy} economy
 * @param {import("../player/weapons.js").Weapons} weapons
 * @param {import("../player/controller.js").Player} player
 */

/**
 * @typedef {Object} MerchantEntry
 * @property {string} id
 * @property {"weapon"|"explosive"|"gear"|"attachment"} kind
 * @property {number} price - base price (the DEAL discount is applied on top).
 * @property {number} maxStock - per-run stock cap.
 * @property {string} [attachment] - attachment id ("scope"|"extmag"|…).
 */

/**
 * @typedef {Object} MerchantStateEntry
 * @property {string} id
 * @property {"weapon"|"explosive"|"gear"|"attachment"} kind
 * @property {number} price - the price RIGHT NOW (deal applied).
 * @property {number} basePrice
 * @property {number} stock
 * @property {number} maxStock
 * @property {boolean} deal
 * @property {boolean} owned - weapon already owned / attachment already on
 *   the ACTIVE gun (always false for gear).
 * @property {string|null} weapon - the active weapon an attachment would fit
 *   (null for every other kind).
 * @property {string|null} reason - null when buyable, else a buy() reason.
 */

/**
 * @typedef {Object} MerchantState
 * @property {number} money
 * @property {number} wave - wave number of the last restock (0 = initial).
 * @property {string|null} activeWeapon - current gun name (attachment target).
 * @property {MerchantStateEntry[]} entries
 */

/**
 * @typedef {Object} Merchant
 * @property {ReadonlyArray<MerchantEntry>} catalog
 * @property {(id: string) => {ok: boolean, reason?: string, price?: number,
 *   effect?: {type: string, [key: string]: any}}} buy
 * @property {() => MerchantState} state
 * @property {(wave?: number) => void} refreshStock - full restock + one random
 *   25 % deal. Called by the 5-wave counter and exposed for debug/integration.
 */

import { bus as sharedBus } from "./gamestate.js";
import { ATTACHMENTS } from "../player/weapons.js";

const DEAL_MULT = 0.75;

/** Full-reserve fallbacks for weapons whose runtime entry has no startReserve. */
const START_RESERVE = {
  pistol: Infinity,
  shotgun: 24,
  rifle: 90,
  smg: 160,
  sniper: 25,
  minigun: 300,
  grenade: 12,
  magnum: 36,
  dmr: 70,
  railgun: 12,
  sawnoff: 24,
  crossbow: 36,
};

const FREE_WEAPONS = ["pistol", "shotgun", "rifle"];

/**
 * FROZEN catalog. `tab` is the UI group; `effect` names the application path.
 * @type {ReadonlyArray<MerchantEntry & {effect: string, throwable?: string, count?: number}>}
 */
export const MERCHANT_CATALOG = Object.freeze([
  // --- WEAPONS (merchant-exclusive) -----------------------------------------
  { id: "sawnoff", kind: "weapon", price: 650, maxStock: 1, effect: "weapon" },
  { id: "crossbow", kind: "weapon", price: 750, maxStock: 1, effect: "weapon" },
  // --- EXPLOSIVES -----------------------------------------------------------
  { id: "frag_pack", kind: "explosive", price: 180, maxStock: 4, effect: "throwable", throwable: "frag", count: 3 },
  { id: "molotov_pack", kind: "explosive", price: 150, maxStock: 3, effect: "throwable", throwable: "molotov", count: 3 },
  { id: "mine_pack", kind: "explosive", price: 220, maxStock: 2, effect: "throwable", throwable: "mine", count: 2 },
  // --- GEAR -----------------------------------------------------------------
  { id: "armor_plate", kind: "gear", price: 300, maxStock: 3, effect: "armor" },
  { id: "medkit", kind: "gear", price: 200, maxStock: 5, effect: "heal" },
  { id: "ammo_full", kind: "gear", price: 150, maxStock: 5, effect: "ammo" },
  { id: "bolts", kind: "gear", price: 60, maxStock: 5, effect: "bolts" },
  { id: "mystery_crate", kind: "gear", price: 250, maxStock: 2, effect: "crate" },
  { id: "stim_shot", kind: "gear", price: 180, maxStock: 3, effect: "stim" },
  // --- ATTACHMENTS (TRADER ATTACHMENTS — applied to the ACTIVE weapon) ------
  // Prices come from weapons.js's frozen ATTACHMENTS table (one source of
  // truth). Per-run stock 2 each; never part of the random DEAL pool.
  ...ATTACHMENTS.map((a) => ({
    id: "att:" + a.id,
    kind: "attachment",
    price: a.price,
    maxStock: 2,
    effect: "attachment",
    attachment: a.id,
  })),
]);

/** Deal candidates: the original shop goods only (attachment prices frozen). */
const DEAL_POOL = MERCHANT_CATALOG.filter((e) => e.kind !== "attachment");

/** Small deterministic PRNG so a restock's deal is reproducible per wave. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createMerchant(bus, economy, weapons, player) {
  const B = bus || sharedBus;
  const list = weapons && Array.isArray(weapons.list) ? weapons.list : [];

  /** Runtime stock, keyed by catalog id. */
  const stock = Object.create(null);
  /** Merchant-exclusive weapons bought THIS run. */
  const boughtWeapons = new Set();
  let dealId = null;
  let wave = 0;
  let refreshSeq = 0;
  let clearCounter = 0;

  for (let i = 0; i < MERCHANT_CATALOG.length; i++) {
    stock[MERCHANT_CATALOG[i].id] = MERCHANT_CATALOG[i].maxStock;
  }

  function findEntry(id) {
    for (let i = 0; i < MERCHANT_CATALOG.length; i++) {
      if (MERCHANT_CATALOG[i].id === id) return MERCHANT_CATALOG[i];
    }
    return null;
  }

  function findWeapon(name) {
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].name === name) return list[i];
    }
    return null;
  }

  /** The gun attachments apply to (the always-present ACTIVE weapon). */
  function activeWeapon() {
    if (!weapons) return null;
    const idx = Number(weapons.current);
    if (Number.isInteger(idx) && list[idx]) return list[idx];
    if (typeof weapons.getState === "function") {
      try {
        return weapons.getState();
      } catch {
        return null;
      }
    }
    return null;
  }

  /** Catalog entry → attachment id (entry.attachment, "att:<id>" fallback). */
  function attachmentIdOf(entry) {
    if (entry && typeof entry.attachment === "string") return entry.attachment;
    const id = entry && typeof entry.id === "string" ? entry.id : "";
    return id.indexOf("att:") === 0 ? id.slice(4) : id;
  }

  /** True when the ACTIVE weapon already holds this attachment. */
  function isAttachmentOwned(entry) {
    const w = activeWeapon();
    if (!w || !w.attachments) return false;
    return w.attachments[attachmentIdOf(entry)] === true;
  }

  function isWeaponOwned(name) {
    if (boughtWeapons.has(name)) return true;
    if (FREE_WEAPONS.indexOf(name) !== -1) return true;
    const w = findWeapon(name);
    return !!(w && w.owned === true);
  }

  function money() {
    if (!economy || typeof economy.get !== "function") return 0;
    const m = Number(economy.get());
    return Number.isFinite(m) ? m : 0;
  }

  function priceFor(entry) {
    return dealId === entry.id
      ? Math.round(entry.price * DEAL_MULT)
      : entry.price;
  }

  /** Full reserve for every OWNED weapon (pistol Infinity is preserved). */
  function fullAmmo() {
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      if (!w || !isWeaponOwned(w.name)) continue;
      const max = Number.isFinite(w.maxReserve)
        ? w.maxReserve
        : Number.isFinite(w.startReserve)
          ? w.startReserve
          : START_RESERVE[w.name];
      if (max === undefined || !Number.isFinite(w.reserve)) continue;
      w.reserve = Math.max(w.reserve, max); // never LOWER a stockpiled reserve
    }
  }

  function addArmor(n) {
    if (player && typeof player.addArmor === "function") {
      player.addArmor(n);
      return;
    }
    // Defensive fallback for a controller build without addArmor().
    if (!player) return;
    const max = Number.isFinite(player.maxArmor) ? player.maxArmor : 100;
    player.armor = Math.min(max, Math.max(0, (player.armor || 0) + n));
  }

  function throwable(kind, count) {
    B.dispatchEvent(
      new CustomEvent("throwable-add", { detail: { kind, count } })
    );
  }

  /** Apply one bought entry's effect (called AFTER a successful spend). */
  function applyEffect(entry) {
    if (entry.effect === "attachment") {
      const id = attachmentIdOf(entry);
      let applied = false;
      if (weapons && typeof weapons.applyAttachment === "function") {
        try {
          applied = weapons.applyAttachment(id) === true;
        } catch {
          applied = false;
        }
      }
      const w = activeWeapon();
      if (applied && w) {
        B.dispatchEvent(
          new CustomEvent("attachment-bought", {
            detail: { weapon: w.name, attachment: id },
          })
        );
      }
      return {
        type: "attachment",
        attachment: id,
        weapon: w ? w.name : null,
        applied,
      };
    }

    if (entry.effect === "weapon") {
      boughtWeapons.add(entry.id);
      if (weapons && typeof weapons.unlock === "function") {
        try {
          weapons.unlock(entry.id);
        } catch {
          /* a weapons build without this gun still records ownership here */
        }
      }
      const w = findWeapon(entry.id);
      if (w) {
        w.owned = true;
        if (Number.isFinite(w.magSize)) w.mag = w.magSize;
        if (w.startReserve !== undefined) w.reserve = w.startReserve;
      }
      return { type: "weapon", name: entry.id };
    }

    if (entry.effect === "throwable") {
      throwable(entry.throwable, entry.count);
      return {
        type: "throwable",
        kind: entry.throwable,
        count: entry.count,
      };
    }

    if (entry.effect === "armor") {
      addArmor(50);
      return { type: "armor", amount: 50 };
    }

    if (entry.effect === "heal") {
      if (player && player.alive) player.hp = 100;
      return { type: "heal", amount: 100 };
    }

    if (entry.effect === "ammo") {
      fullAmmo();
      return { type: "ammo" };
    }

    if (entry.effect === "bolts") {
      const w = findWeapon("crossbow");
      if (w && Number.isFinite(w.reserve)) w.reserve += 24;
      return { type: "bolts", amount: 24 };
    }

    if (entry.effect === "stim") {
      if (player && player.alive) {
        player.hp = Math.min(100, player.hp + 35);
        player.speedBoost = { mul: 1.1, time: 20 };
      }
      return { type: "stim", heal: 35, mul: 1.1, time: 20 };
    }

    // Mystery crate: one random haul, applied immediately + reported back.
    if (entry.effect === "crate") {
      const roll = Math.floor(Math.random() * 4);
      if (roll === 0) {
        const amount = 200 + Math.floor(Math.random() * 201); // 200..400
        if (economy && typeof economy.add === "function") economy.add(amount);
        return { type: "money", amount };
      }
      if (roll === 1) {
        addArmor(50);
        return { type: "armor", amount: 50 };
      }
      if (roll === 2) {
        fullAmmo();
        return { type: "ammo" };
      }
      throwable("frag", 2);
      return { type: "throwable", kind: "frag", count: 2 };
    }

    return { type: "none" };
  }

  /** Why the entry cannot be bought right now (null = buyable). */
  function reasonFor(entry) {
    if (entry.kind === "attachment") {
      if (isAttachmentOwned(entry)) return "owned";
    } else if (entry.kind === "weapon" && isWeaponOwned(entry.id)) {
      return "owned";
    }
    if ((stock[entry.id] | 0) <= 0) return "no-stock";
    if (entry.id === "bolts" && !isWeaponOwned("crossbow")) {
      return "need-crossbow";
    }
    if (
      (entry.id === "medkit" || entry.id === "stim_shot") &&
      player &&
      player.alive === false
    ) {
      return "dead";
    }
    if (money() < priceFor(entry)) return "no-money";
    return null;
  }

  /**
   * Buy one catalog id. Order of checks mirrors state().reason: ownership →
   * stock → requirements → death → money. Spend happens BEFORE any effect;
   * stock decrements only after the spend succeeded.
   */
  function buy(id) {
    if (typeof id !== "string") return { ok: false, reason: "unknown" };
    const entry = findEntry(id);
    if (!entry) return { ok: false, reason: "unknown" };

    const reason = reasonFor(entry);
    if (reason) return { ok: false, reason };

    const price = priceFor(entry);
    if (
      !economy ||
      typeof economy.spend !== "function" ||
      !economy.spend(price)
    ) {
      return { ok: false, reason: "no-money" };
    }

    stock[id] = Math.max(0, (stock[id] | 0) - 1);
    const effect = applyEffect(entry);
    // Defensive: applyAttachment can only fail on a race/duplicate. Never
    // charge for a part that was not fitted — restore stock and refund.
    if (entry.kind === "attachment" && (!effect || effect.applied !== true)) {
      stock[id] = Math.min(entry.maxStock, (stock[id] | 0) + 1);
      if (economy && typeof economy.add === "function") economy.add(price);
      return { ok: false, reason: "owned" };
    }
    B.dispatchEvent(
      new CustomEvent("merchant-purchase", {
        detail: { id: entry.id, kind: entry.kind, price },
      })
    );
    return { ok: true, price, effect };
  }

  /** Full restock + ONE random 25 % deal (reproducible per wave + sequence). */
  function refreshStock(nextWave) {
    const n = Number(nextWave);
    wave = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    refreshSeq += 1;
    for (let i = 0; i < MERCHANT_CATALOG.length; i++) {
      const e = MERCHANT_CATALOG[i];
      stock[e.id] = e.maxStock;
    }
    const rng = makeRng(
      (0x9e3779b9 ^ Math.imul(wave | 0, 2654435761) ^ refreshSeq) >>> 0
    );
    const idx = Math.floor(rng() * DEAL_POOL.length);
    dealId = DEAL_POOL[idx] ? DEAL_POOL[idx].id : null;
  }

  /** Fresh run: stock back to full, deal + merchant guns forgotten. */
  function resetRun() {
    for (let i = 0; i < MERCHANT_CATALOG.length; i++) {
      const e = MERCHANT_CATALOG[i];
      stock[e.id] = e.maxStock;
    }
    boughtWeapons.clear();
    dealId = null;
    wave = 0;
    refreshSeq = 0;
    clearCounter = 0;
  }

  /** Fresh {money, wave, activeWeapon, entries} snapshot for the overlay. */
  function state() {
    const cash = money();
    const w = activeWeapon();
    const activeName = w ? w.name : null;
    const entries = [];
    for (let i = 0; i < MERCHANT_CATALOG.length; i++) {
      const e = MERCHANT_CATALOG[i];
      const deal = dealId === e.id;
      const price = deal ? Math.round(e.price * DEAL_MULT) : e.price;
      const owned =
        e.kind === "weapon"
          ? isWeaponOwned(e.id)
          : e.kind === "attachment"
            ? isAttachmentOwned(e)
            : false;
      entries.push({
        id: e.id,
        kind: e.kind,
        price,
        basePrice: e.price,
        stock: stock[e.id] | 0,
        maxStock: e.maxStock,
        deal,
        owned,
        weapon: e.kind === "attachment" ? activeName : null,
        reason: reasonFor(e),
      });
    }
    return { money: cash, wave, activeWeapon: activeName, entries };
  }

  // Restock on every 5th cleared wave (internal counter — the merchant holds
  // no gamestate reference; `{n}` only labels the restock wave).
  B.addEventListener("wave-clear", (e) => {
    clearCounter += 1;
    if (clearCounter % 5 !== 0) return;
    const n = Number(e && e.detail ? e.detail.n : NaN);
    refreshStock(Number.isFinite(n) && n > 0 ? n : clearCounter);
  });

  // Fresh-run entry points (same defensive set as economy.js).
  B.addEventListener("ui-play", resetRun);
  B.addEventListener("ui-restart", resetRun);
  B.addEventListener("ui-quit", resetRun);

  return {
    catalog: MERCHANT_CATALOG,
    buy,
    state,
    refreshStock,
  };
}
