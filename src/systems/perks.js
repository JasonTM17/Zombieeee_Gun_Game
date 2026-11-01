/**
 * Perks — per-run XP, levels and level-up perk choices (roguelite layer).
 *
 * createPerks(bus, player, weapons, economy)
 *   → { update(dt), state(), addXp(n), choose(index), rerollChoices(), reset() }
 *
 * WHAT THIS MODULE OWNS
 * - The per-run XP counter, level curve, a queue of pending perk choices and
 *   the 12-entry perk pool with their stack counts. Nothing is persisted
 *   (per-run only — no localStorage); `reset()` starts a fresh progression.
 * - Application of every perk onto the live systems it can reach: weapons
 *   (the additive `weapons.setPerkMods` surface), the player (maxHp /
 *   speedMul / armor / healing), the economy (scavenger bonus) and throwables
 *   (blast stock through the "throwable-add" bus event).
 *
 * XP SOURCES (each bus event is applied exactly once per emission)
 *   "zombie-killed" {type, elite}   walker 5 / runner 7 / brute 18 /
 *                                   crawler 7 / bloater 20 / armored 22;
 *                                   elite ×2 (any truthy `elite`, string or
 *                                   boolean); bosses 100 (butcher / spitter /
 *                                   screamer / golem / origin).
 *   "mission-complete"              60
 *   "contract-complete"             detail.xp (90–320), fallback 40
 *   "wave-clear" {n}                15 + n
 *
 * LEVEL CURVE (max level 20)
 *   Level 1 starts at 0 XP. To the next level:
 *     need(level) = min(400, 100 + (level - 1) × 40)
 *   i.e. 100, 140, 180, 220, 260, 300, 340, 380, then 400 from level 9 on.
 *   `xp` is progress INSIDE the current level; `totalXp` is lifetime XP.
 *   Level 20 is terminal (need 0, xp stays 0 — the HUD shows MAX).
 *
 * EVENTS
 *   emitted:  "xp-changed" {xp, need, level, totalXp} — every XP/level change
 *             (also on reset); "level-up" {level} — once per level gained;
 *             "perks-choice-open" {level, remaining} — the first time a
 *             choice is pending (main/gamestate pauses the run on it);
 *             "perks-choice-closed" {level} — the queue drained (resume);
 *             "throwable-add" {kind, count} — the blast perk (consumed by
 *             src/systems/throwables.js).
 *   consumed: the XP sources above, "bloodmoon-active" {active} (scavenger
 *             mirrors the economy's ×2 kill-money multiplier), "ui-quit"
 *             (defensive fresh-run reset; main.js also calls reset()).
 *
 * QUEUE / OVERLAY
 *   Each level-up queues one choice (capped at 3). The first pending choice
 *   opens the overlay; `choose(index)` applies the offered card, then either
 *   re-opens the offer for the remaining queue (emitting "perks-choice-open"
 *   again — pause-by-reason is idempotent) or emits "perks-choice-closed".
 *   The module never touches gamestate: main.js maps the open/close events to
 *   gamestate.addPause("perks") / removePause("perks"), exactly like the
 *   shop/merchant overlays.
 *
 * PERK TABLE (all stack multiplicatively/additively as noted; no caps beyond
 * the level ceiling, so a single perk can be taken many times)
 *   damage     +12% weapon damage per stack            (damageMul)
 *   firerate   +10% fire rate per stack                (fireRateMul)
 *   reload     −12% reload time per stack              (reloadMul, floor 0.2)
 *   speed      +8% move speed per stack                (player.speedMul)
 *   maxhp      +20 max HP and heal 20 per stack
 *   regen      heal 1 HP / 3 s per stack               (update)
 *   armor      +25 armor now and +25 max armor per stack
 *   scavenger  +15% kill money per stack (same base the economy pays)
 *   blast      +2 frag, +1 molotov, +1 mine per stack
 *   steady     −15% spread per stack                   (spreadMul, floor 0.1)
 *   vampire    heal 2 HP per kill per stack
 *   lucky      +10% headshot damage per stack          (headshotMul)
 *
 * @param {EventTarget} bus - the shared bus from src/systems/gamestate.js.
 * @param {import("../player/controller.js").Player} player
 * @param {import("../player/weapons.js").Weapons} weapons
 * @param {import("./economy.js").Economy} economy
 */

/**
 * @typedef {Object} PerkDef
 * @property {string} id
 * @property {string} icon - single glyph shown on the card.
 * @property {string} nameKey - i18n key (bundle owned by src/ui/perks.js).
 * @property {string} descKey - i18n key (bundle owned by src/ui/perks.js).
 */

/** The 12-card pool, in a stable display order. */
export const PERKS = [
  { id: "damage", icon: "✦", nameKey: "perkDamage", descKey: "perkDamageDesc" },
  { id: "firerate", icon: "⚡", nameKey: "perkFirerate", descKey: "perkFirerateDesc" },
  { id: "reload", icon: "↻", nameKey: "perkReload", descKey: "perkReloadDesc" },
  { id: "speed", icon: "➤", nameKey: "perkSpeed", descKey: "perkSpeedDesc" },
  { id: "maxhp", icon: "♥", nameKey: "perkMaxhp", descKey: "perkMaxhpDesc" },
  { id: "regen", icon: "✚", nameKey: "perkRegen", descKey: "perkRegenDesc" },
  { id: "armor", icon: "▣", nameKey: "perkArmor", descKey: "perkArmorDesc" },
  { id: "scavenger", icon: "$", nameKey: "perkScavenger", descKey: "perkScavengerDesc" },
  { id: "blast", icon: "✸", nameKey: "perkBlast", descKey: "perkBlastDesc" },
  { id: "steady", icon: "◎", nameKey: "perkSteady", descKey: "perkSteadyDesc" },
  { id: "vampire", icon: "☾", nameKey: "perkVampire", descKey: "perkVampireDesc" },
  { id: "lucky", icon: "✧", nameKey: "perkLucky", descKey: "perkLuckyDesc" },
];

export const PERK_IDS = PERKS.map((p) => p.id);

// --- frozen progression numbers ---------------------------------------------
const MAX_LEVEL = 20;
const MAX_PENDING = 3;
const CHOICES_PER_LEVEL = 1;

const BASE_NEED = 100;
const NEED_PER_LEVEL = 40;
const NEED_CAP = 400;

const XP_BY_TYPE = {
  walker: 5,
  runner: 7,
  brute: 18,
  crawler: 7,
  bloater: 20,
  armored: 22,
};
const BOSS_XP = 100;
const BOSS_TYPES = {
  butcher: true,
  spitter: true,
  screamer: true,
  golem: true,
  origin: true,
};
const XP_MISSION = 60;
const XP_CONTRACT = 40;
const XP_WAVE_BASE = 15; // + wave number

// --- perk magnitudes ---------------------------------------------------------
const DMG_PER_STACK = 0.12;
const FIRERATE_PER_STACK = 0.1;
const RELOAD_PER_STACK = 0.12;
const RELOAD_MUL_FLOOR = 0.2;
const SPEED_PER_STACK = 0.08;
const MAXHP_PER_STACK = 20;
const REGEN_INTERVAL = 3;
const ARMOR_PER_STACK = 25;
const SCAVENGER_PER_STACK = 0.15;
const SPREAD_PER_STACK = 0.15;
const SPREAD_MUL_FLOOR = 0.1;
const VAMPIRE_PER_STACK = 2;
const LUCKY_PER_STACK = 0.1;

// Money rewards — a MIRROR of economy.js's frozen table. Scavenger must pay a
// percentage of the SAME base the economy just paid, including the elite /
// headshot / bloodmoon multipliers (each applied exactly once, like there).
const MONEY_REWARDS = {
  walker: 50,
  runner: 75,
  brute: 200,
  crawler: 60,
  bloater: 300,
  armored: 350,
  butcher: 1000,
  spitter: 800,
  screamer: 700,
  golem: 1500,
  origin: 2000,
};
const HEADSHOT_MONEY_MULT = 1.5;

/** XP requirement of `level` to reach level + 1 (0 at max level). */
export function xpNeed(level) {
  const l = Number(level);
  if (!Number.isFinite(l) || l >= MAX_LEVEL) return 0;
  return Math.min(NEED_CAP, BASE_NEED + (Math.max(1, l) - 1) * NEED_PER_LEVEL);
}

export function createPerks(bus, player, weapons, economy) {
  if (!bus || typeof bus.addEventListener !== "function") {
    throw new Error("createPerks: bus is required");
  }

  // Baseline caps captured once — reset() restores them (a fresh run starts
  // at the controller defaults even if a previous run stacked maxhp/armor).
  const baseMaxHp = positiveNumber(player && player.maxHp, 100);
  const baseMaxArmor = positiveNumber(player && player.maxArmor, 100);

  /** @type {Record<string, number>} */
  const stacks = {};
  for (let i = 0; i < PERK_IDS.length; i++) stacks[PERK_IDS[i]] = 0;

  let level = 1;
  let xp = 0; // progress inside the current level
  let totalXp = 0;
  let pending = 0; // queued level-ups waiting for a card pick (0..3)
  /** @type {string[]} */
  let offer = [];
  /** @type {string[]} */
  const taken = [];
  let regenT = 0;
  let wave = 1;
  let bloodmoonActive = false;
  let overlayOpen = false;

  if (player && !(Number.isFinite(Number(player.speedMul)) && player.speedMul > 0)) {
    player.speedMul = 1;
  }

  // --- helpers -----------------------------------------------------------------

  function positiveNumber(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function emit(type, detail) {
    bus.dispatchEvent(new CustomEvent(type, { detail }));
  }

  function currentNeed() {
    return xpNeed(level);
  }

  function maxHpNow() {
    return positiveNumber(player && player.maxHp, baseMaxHp);
  }

  /**
   * Heal through the controller helper when present (it respects maxHp and
   * dead players); otherwise clamp directly so a test double still works.
   */
  function healPlayer(n) {
    if (!player) return 0;
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return 0;
    if (typeof player.heal === "function") return player.heal(v);
    if (player.alive === false) return 0;
    const before = positiveNumber(player.hp, 0);
    player.hp = Math.min(maxHpNow(), before + v);
    return player.hp - before;
  }

  /** Multiplier budget derived from the current stacks. */
  function modsFromStacks() {
    return {
      damageMul: 1 + DMG_PER_STACK * stacks.damage,
      fireRateMul: 1 + FIRERATE_PER_STACK * stacks.firerate,
      reloadMul: Math.max(RELOAD_MUL_FLOOR, 1 - RELOAD_PER_STACK * stacks.reload),
      spreadMul: Math.max(SPREAD_MUL_FLOOR, 1 - SPREAD_PER_STACK * stacks.steady),
      headshotMul: 1 + LUCKY_PER_STACK * stacks.lucky,
    };
  }

  function syncWeaponMods() {
    if (weapons && typeof weapons.setPerkMods === "function") {
      weapons.setPerkMods(modsFromStacks());
    }
  }

  function currentMods() {
    if (weapons && typeof weapons.getPerkMods === "function") {
      const m = weapons.getPerkMods() || {};
      return {
        damageMul: positiveNumber(m.damageMul, 1),
        fireRateMul: positiveNumber(m.fireRateMul, 1),
        reloadMul: positiveNumber(m.reloadMul, 1),
        spreadMul: positiveNumber(m.spreadMul, 1),
        // Lucky is a perk-layer value even when a lightweight weapons double
        // does not report the additive fifth key.
        headshotMul: 1 + LUCKY_PER_STACK * stacks.lucky,
      };
    }
    return modsFromStacks();
  }

  /** Pick 3 DISTINCT perks from the pool (duplicates across levels are fine). */
  function rollOffer() {
    const pool = PERK_IDS.slice();
    const out = [];
    for (let i = 0; i < 3 && pool.length > 0; i++) {
      const k = Math.min(pool.length - 1, Math.floor(Math.random() * pool.length));
      out.push(pool.splice(k, 1)[0]);
    }
    return out;
  }

  /** XP value of one "zombie-killed" payload. Bosses override elite ×2. */
  function killXp(detail) {
    if (BOSS_TYPES[detail.type]) return BOSS_XP;
    const base = XP_BY_TYPE[detail.type] || 0;
    if (base <= 0) return 0;
    return detail.elite ? base * 2 : base;
  }

  /** The exact money base economy.js pays for this kill (rounded once). */
  function killMoney(detail) {
    const base = MONEY_REWARDS[detail.type];
    if (!base) return 0;
    const eliteMul = positiveNumber(detail.eliteMoneyMul, 1);
    return Math.round(
      base *
        eliteMul *
        (detail.headshot ? HEADSHOT_MONEY_MULT : 1) *
        (bloodmoonActive ? 2 : 1)
    );
  }

  /**
   * Apply one perk card. Effects that can be expressed through the weapons
   * multiplier surface are recomputed from the FULL stack counts; one-shot
   * effects (maxhp heal, armor, throwables) happen here exactly once.
   */
  function applyPerk(id) {
    stacks[id] = (stacks[id] || 0) + 1;
    taken.push(id);
    switch (id) {
      case "damage":
      case "firerate":
      case "reload":
      case "steady":
      case "lucky":
        syncWeaponMods();
        break;
      case "speed":
        if (player) player.speedMul = 1 + SPEED_PER_STACK * stacks.speed;
        break;
      case "maxhp":
        if (player) {
          // Raise the ceiling FIRST so the +20 heal lands in the new headroom.
          player.maxHp = baseMaxHp + MAXHP_PER_STACK * stacks.maxhp;
          healPlayer(MAXHP_PER_STACK);
        }
        break;
      case "regen":
        // Passive — settled in update().
        break;
      case "armor":
        if (player) {
          if (Number.isFinite(Number(player.maxArmor))) {
            player.maxArmor = baseMaxArmor + ARMOR_PER_STACK * stacks.armor;
          }
          if (typeof player.addArmor === "function") {
            player.addArmor(ARMOR_PER_STACK);
          } else {
            const cap = positiveNumber(player.maxArmor, Infinity);
            player.armor = Math.min(cap, positiveNumber(player.armor, 0) + ARMOR_PER_STACK);
          }
        }
        break;
      case "scavenger":
        // Passive — paid per kill in onKill().
        break;
      case "blast":
        emit("throwable-add", { kind: "frag", count: 2 });
        emit("throwable-add", { kind: "molotov", count: 1 });
        emit("throwable-add", { kind: "mine", count: 1 });
        break;
      case "vampire":
        // Passive — healed per kill in onKill().
        break;
      default:
        break;
    }
  }

  // --- public surfaces ---------------------------------------------------------

  /**
   * Add XP, resolve every level crossed, then queue the perk choices.
   * Non-finite / non-positive amounts are ignored.
   * @param {number} amount
   */
  function addXp(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return state();

    totalXp += n;
    xp += n;
    const startLevel = level;
    while (level < MAX_LEVEL) {
      const need = currentNeed();
      if (xp < need) break;
      xp -= need;
      level += 1;
    }
    if (level >= MAX_LEVEL) {
      level = MAX_LEVEL;
      xp = 0; // terminal level: the bar reads MAX
    }

    emit("xp-changed", { xp, need: currentNeed(), level, totalXp });
    for (let l = startLevel + 1; l <= level; l++) {
      emit("level-up", { level: l });
    }

    const gained = level - startLevel;
    if (gained > 0) {
      pending = Math.min(MAX_PENDING, pending + gained * CHOICES_PER_LEVEL);
      if (!overlayOpen && pending > 0) {
        offer = rollOffer();
        overlayOpen = true;
        emit("perks-choice-open", { level, remaining: pending });
      }
    }
    return state();
  }

  /**
   * Choose the offered card at `index` (0..2). No-op (false) when nothing is
   * pending or the index is invalid. Applies the perk and either re-offers
   * for the remaining queue or emits "perks-choice-closed".
   * @param {number} index
   * @returns {boolean}
   */
  function choose(index) {
    if (pending <= 0 || offer.length === 0) return false;
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= offer.length) return false;

    const id = offer[i];
    applyPerk(id);
    pending -= 1;

    if (pending > 0) {
      offer = rollOffer();
      // Re-emit the open event: main's addPause("perks") is idempotent and
      // the overlay re-renders the next three cards without closing.
      emit("perks-choice-open", { level, remaining: pending, reopened: true });
    } else {
      offer = [];
      overlayOpen = false;
      emit("perks-choice-closed", { level });
    }
    return true;
  }

  /**
   * Re-roll the current three cards (free; the per-run API allows it). No-op
   * when no choice is pending. Re-emits "perks-choice-open" so the overlay
   * repaints.
   */
  function rerollChoices() {
    if (pending <= 0) return state();
    offer = rollOffer();
    if (!overlayOpen) overlayOpen = true;
    emit("perks-choice-open", { level, remaining: pending, rerolled: true });
    return state();
  }

  /** Per-frame regen ticks (the run is paused while the overlay is open). */
  function update(dt) {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (step <= 0) return;
    if (stacks.regen <= 0 || !player || player.alive === false) return;
    regenT += step;
    const ticks = Math.floor(regenT / REGEN_INTERVAL);
    if (ticks <= 0) return;
    regenT -= ticks * REGEN_INTERVAL;
    if (positiveNumber(player.hp, 0) >= maxHpNow()) return;
    healPlayer(ticks * stacks.regen);
  }

  /**
   * Fresh-run reset: XP/level/stacks/queue cleared, weapon mods back to 1,
   * player speed/maxHp/maxArmor back to their captured baselines.
   * Emits "xp-changed" (fresh HUD) and, if a choice was open, the close event.
   */
  function reset() {
    const hadChoice = overlayOpen || pending > 0;
    level = 1;
    xp = 0;
    totalXp = 0;
    pending = 0;
    offer = [];
    taken.length = 0;
    regenT = 0;
    wave = 1;
    bloodmoonActive = false;
    overlayOpen = false;
    for (let i = 0; i < PERK_IDS.length; i++) stacks[PERK_IDS[i]] = 0;

    if (weapons && typeof weapons.setPerkMods === "function") {
      weapons.setPerkMods({
        damageMul: 1,
        fireRateMul: 1,
        reloadMul: 1,
        spreadMul: 1,
        headshotMul: 1,
      });
    }

    if (player) {
      player.speedMul = 1;
      player.maxHp = baseMaxHp;
      if (Number.isFinite(Number(player.hp)) && player.hp > baseMaxHp) {
        player.hp = baseMaxHp;
      }
      if (Number.isFinite(Number(player.maxArmor))) {
        player.maxArmor = baseMaxArmor;
        if (Number.isFinite(Number(player.armor)) && player.armor > baseMaxArmor) {
          player.armor = baseMaxArmor;
          emit("armor-changed", { armor: player.armor, max: player.maxArmor });
        }
      }
    }

    if (hadChoice) emit("perks-choice-closed", { level, reason: "reset" });
    emit("xp-changed", { xp: 0, need: currentNeed(), level, totalXp: 0 });
  }

  /** A fresh snapshot (safe to mutate — every object is a copy). */
  function state() {
    const copies = {};
    for (let i = 0; i < PERK_IDS.length; i++) {
      copies[PERK_IDS[i]] = stacks[PERK_IDS[i]];
    }
    return {
      level,
      xp,
      need: currentNeed(),
      totalXp,
      maxLevel: MAX_LEVEL,
      pending,
      offer: offer.slice(),
      stacks: copies,
      taken: taken.slice(),
      mods: currentMods(),
    };
  }

  // --- bus listeners (each XP source applied exactly once) ---------------------

  bus.addEventListener("zombie-killed", (e) => {
    const d = e && e.detail ? e.detail : {};
    // Vampire + scavenger land before the XP (which may open the overlay and
    // pause the run) so the kill is fully settled in one synchronous pass.
    if (stacks.vampire > 0) healPlayer(VAMPIRE_PER_STACK * stacks.vampire);
    if (stacks.scavenger > 0) {
      const base = killMoney(d);
      const bonus = base > 0
        ? Math.round(base * SCAVENGER_PER_STACK * stacks.scavenger)
        : 0;
      if (bonus > 0 && economy && typeof economy.add === "function") {
        economy.add(bonus);
      }
    }
    const gain = killXp(d);
    if (gain > 0) addXp(gain);
  });

  bus.addEventListener("mission-complete", () => addXp(XP_MISSION));
  bus.addEventListener("contract-complete", (e) => {
    // The contract board advertises its own XP reward (90–320); fall back to
    // the flat 40 when a caller sends none.
    const d = e && e.detail ? e.detail : {};
    const xp = Math.round(Number(d.xp));
    addXp(Number.isFinite(xp) && xp > 0 ? xp : XP_CONTRACT);
  });

  bus.addEventListener("wave-start", (e) => {
    const n = Math.round(Number(e && e.detail ? e.detail.n : NaN));
    if (Number.isFinite(n) && n > 0) wave = n;
  });
  bus.addEventListener("wave-clear", (e) => {
    const raw = e && e.detail ? e.detail.n : undefined;
    const n = Math.round(Number(raw));
    const current = Number.isFinite(n) && n > 0 ? n : wave;
    addXp(XP_WAVE_BASE + current);
  });

  // Scavenger mirrors the economy's bloodmoon ×2 kill-money rule.
  bus.addEventListener("bloodmoon-active", (e) => {
    const d = e && e.detail ? e.detail : {};
    bloodmoonActive = d.active === true;
  });

  // Defensive fresh-run safety only — main.js's freshRun() owns the reset.
  bus.addEventListener("ui-quit", () => reset());

  return { update, state, addXp, choose, rerollChoices, reset };
}
