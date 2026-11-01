/**
 * Economy — player money (EXPANSION feature B; contract: docs/EXPANSION.md).
 *
 * createEconomy(bus) → { get() → number, add(n), spend(n) → boolean, reset() }
 *
 * Behavior (spec — DO NOT change the numbers):
 * - Listens "zombie-killed" {type, score, headshot, position} on the bus and
 *   pays a MONEY reward per TYPE (NOT per the score field — a zombie's score
 *   is its point value; money values differ):
 *       walker 50 / runner 75 / brute 200
 *       crawler 60 / bloater 300 / armored 350        (multi-type expansion)
 *       butcher 1000 / spitter 800 / screamer 700 / golem 1500  (bosses, C4)
 *   Headshot pays +50% (×1.5), rounded to an integer. Unknown types pay 0.
 *   Elite variants (user request) add detail.eliteMoneyMul (×1.6 frenzied /
 *   ×1.8 ironhide / ×1.5 toxic / ×2 giant), applied exactly once here; the
 *   zombie's `score` is a separate, already elite-shaped track.
 * - EVERY change emits "money-changed" {money, delta} on the bus:
 *   money = the NEW balance, delta = the signed amount just applied
 *   (negative for spend). A no-op (delta 0) emits nothing.
 * - get() → the current balance (number, starts at 0, always an integer ≥ 0).
 * - add(n) → balance += n (emits "money-changed"); non-finite n is ignored,
 *   the balance is rounded to an integer and clamped at 0.
 * - spend(n) → boolean: true when the balance covered n and it was deducted
 *   (emits "money-changed" with a negative delta); false when insufficient —
 *   the balance is left untouched and NO event is emitted. Non-finite / n ≤ 0
 *   → false.
 * - reset() → balance back to 0 (emits once when the balance was non-zero).
 *
 * Fresh-run reset: main.js calls economy.reset() on fresh runs; this module
 * ALSO listens "ui-play" / "ui-restart" (menu PLAY / PLAY AGAIN / RESTART —
 * the only fresh-run entry points on the bus) as a defensive duplicate.
 * reset() is idempotent, so double-resetting is harmless. It deliberately does
 * NOT listen "state-changed": resume of a kill-less run also reports
 * state "playing" with score 0 and must not wipe the balance.
 *
 * NIGHT 30 P1 story-keep (docs/EXPANSION-P1.md §5.6.3 — ADDITIVE behavior,
 * frozen signature untouched): while the bus event "story-keep" {hold: true}
 * is set, the defensive "ui-play"/"ui-restart" reset is SKIPPED — main.js
 * restarts a death at mission ≥ 2 by keeping BOTH the mission progress and
 * the money (they are kept or wiped together, never split). main.js decides
 * per click and dispatches "story-keep" {hold} BEFORE economy's own listener
 * runs on the same "ui-play" dispatch (nested dispatch, registration order);
 * {hold: false} restores the legacy always-reset behavior. The DIRECT
 * economy.reset() calls from main.js's freshRun() are not affected by the
 * flag — main.js gates those itself.
 *
 * The balance is intentionally kept as an integer (rewards are integers,
 * the +50% headshot rounds once) so HUD/shop display never shows fractions.
 *
 * Bus events consumed: "zombie-killed" (money rewards), "ui-play"/"ui-restart"
 * (defensive fresh-run reset), "bloodmoon-active" (NIGHT 30 P2 §3.6.4 — while
 * systems/events.js holds the flag true, kill money pays ×2; the rounding
 * stays a single Math.round over base × headshot × bloodmoon).
 * Bus events emitted: "money-changed" {money, delta}.
 *
 * @param {EventTarget} bus - the shared bus exported by src/systems/gamestate.js
 *   (falls back to the module-level shared bus when omitted, like gamestate).
 * @returns {Economy}
 */

/**
 * @typedef {Object} Economy
 * @property {() => number} get - the current money balance (integer ≥ 0).
 * @property {(n: number) => void} add - add n to the balance (emits
 *   "money-changed" {money, delta} when the balance actually changes).
 * @property {(n: number) => boolean} spend - deduct n when affordable
 *   (true + "money-changed"); otherwise false, balance untouched, no event.
 * @property {() => void} reset - balance back to 0.
 */

import { bus as sharedBus } from "./gamestate.js";

// Money reward per kill TYPE (spec — walker/runner/brute + the four bosses).
// NIGHT 30 P3 §3.6 (additive row): origin pays 2000 (the final-boss drop —
// headshot ×1.5 and bloodmoon ×2 ride on it like every other type).
const REWARDS = {
  walker: 50,
  runner: 75,
  brute: 200,
  // Multi-type expansion (new regular types — vị trí sau 3 type gốc).
  crawler: 60,
  bloater: 300,
  armored: 350,
  butcher: 1000,
  spitter: 800,
  screamer: 700,
  golem: 1500,
  origin: 2000,
};

const HEADSHOT_MULT = 1.5; // +50% for a headshot kill, rounded once below

export function createEconomy(bus) {
  const B = bus || sharedBus;

  let money = 0;

  /** One "money-changed" {money, delta} for an applied (non-zero) delta. */
  function emit(delta) {
    if (delta === 0) return; // no change → no event
    B.dispatchEvent(
      new CustomEvent("money-changed", { detail: { money, delta } })
    );
  }

  function get() {
    return money;
  }

  function add(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v === 0) return;
    const prev = money;
    money = Math.max(0, Math.round(prev + v));
    emit(money - prev);
  }

  function spend(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return false;
    if (money < v) return false; // insufficient — untouched, no event
    money = Math.round(money - v);
    emit(-Math.round(v));
    return true;
  }

  function reset() {
    if (money === 0) return; // idempotent (main may also call reset())
    const prev = money;
    money = 0;
    emit(-prev);
  }

  // Kills pay money by TYPE (score is the point value — deliberately unused).
  // NIGHT 30 P2 §3.6.4 (ADDITIVE): while "bloodmoon-active" {active: true}
  // runs, every kill pays ×2. The reward table above is untouched — the
  // multiplier rides on the amount and the rounding stays ONE Math.round
  // (base × headshot × bloodmoon), exactly as the contract prescribes.
  // The flag is managed by events.js ("bloodmoon-active" {active: false} on
  // end/reset) — economy.reset() deliberately does not touch it.
  let bloodmoonActive = false;
  B.addEventListener("bloodmoon-active", (e) => {
    const d = e && e.detail ? e.detail : {};
    bloodmoonActive = d.active === true;
  });
  B.addEventListener("zombie-killed", (e) => {
    const d = e && e.detail ? e.detail : {};
    const base = REWARDS[d.type];
    if (!base) return; // unknown type pays 0
    // Elite money rides on the base reward exactly once (the zombie sends
    // eliteMoneyMul in the same detail; its `score` is a separate track).
    const eliteMul = Number(d.eliteMoneyMul);
    const mul = Number.isFinite(eliteMul) && eliteMul > 0 ? eliteMul : 1;
    const amount = Math.round(
      base * mul * (d.headshot ? HEADSHOT_MULT : 1) * (bloodmoonActive ? 2 : 1)
    );
    add(amount);
  });

  // Defensive fresh-run reset (main.js's economy.reset() stays the canonical
  // call — both paths are idempotent). "ui-play" covers PLAY and PLAY AGAIN.
  // NIGHT 30 P1 §5.6.3: skipped while a "story-keep" {hold: true} window is
  // open (death-restart at mission ≥ 2 keeps money + missions together).
  let storyKeep = false;
  B.addEventListener("story-keep", (e) => {
    const d = e && e.detail ? e.detail : {};
    storyKeep = d.hold === true;
  });
  const freshRun = () => {
    if (storyKeep) return;
    reset();
  };
  B.addEventListener("ui-play", freshRun);
  B.addEventListener("ui-restart", freshRun);

  return { get, add, spend, reset };
}
