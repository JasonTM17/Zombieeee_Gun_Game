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
 *       butcher 1000 / spitter 800 / screamer 700 / golem 1500  (bosses, C4)
 *   Headshot pays +50% (×1.5), rounded to an integer. Unknown types pay 0.
 * - EVERY change emits "money-changed" {money, delta} on the bus:
 *   money = the NEW balance, delta = the signed amount just applied
 *   (negative for spend).
 * - get() → the current balance (number, starts at 0).
 * - add(n) → balance += n (emits "money-changed").
 * - spend(n) → boolean: true when the balance covered n and it was deducted
 *   (emits "money-changed" with a negative delta); false when insufficient —
 *   the balance is left untouched and NO event is emitted.
 * - reset() → balance back to 0. Fresh runs reset money (main.js either calls
 *   economy.reset() or gamestate listens for the restart).
 *
 * Bus events consumed: "zombie-killed" (money rewards).
 * Bus events emitted: "money-changed" {money, delta}.
 *
 * @param {EventTarget} bus - the shared bus exported by src/systems/gamestate.js.
 * @returns {Economy}
 */

/**
 * @typedef {Object} Economy
 * @property {() => number} get - the current money balance (starts at 0).
 * @property {(n: number) => void} add - add n to the balance (emits
 *   "money-changed" {money, delta}).
 * @property {(n: number) => boolean} spend - deduct n when affordable
 *   (true + "money-changed"); otherwise false, balance untouched, no event.
 * @property {() => void} reset - balance back to 0.
 */

export function createEconomy(bus) {
  void bus;
  throw new Error("TODO: implement");
}
