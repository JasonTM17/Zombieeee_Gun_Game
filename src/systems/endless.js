/**
 * ============================================================================
 * ENDLESS — CHẾ ĐỘ SINH TỒN VÔ TẬN (P4 "GUN GAME 2.0", tính năng C).
 * ============================================================================
 * Hợp đồng duy nhất: docs/EXPANSION-P4.md §5 (spec C nguyên văn + P4-K8..K14).
 *
 * createEndless(bus, deps) → { start(), stop(), isActive(), update(dt),
 *                              snapshot(), best() }
 *
 * deps (P4-K23, cả 4 BẮT BUỘC — thiếu → throw ngay lúc tạo):
 * - waves   (src/zombies/waves.js) — setMode("endless") + reset() lúc start;
 *   waves chạy composition endless (wave n: total 8 + n×4, runner ≥ 2, brute
 *   từ wave 3, boss NGẪU NHIÊN từ wave 8, cap sống 60 giữ nguyên).
 * - events  (src/systems/events.js) — forceEvent("bloodmoon") cho biến thể
 *   wave % 5 === 0; bị chặn → thử lại mỗi 1 s trong suốt wave đó (P4-K10).
 * - gamestate (src/systems/gamestate.js) — dự phòng đọc wave/state (không
 *   ghi đè score của gamestate — điểm endless là ĐIỂM RIÊNG, P4-K11/K12).
 * - profile (src/systems/profile.js) — mirror best qua profile.add
 *   ({endlessBest}) khi run kết thúc.
 *
 * Điểm (P4-K11, FROZEN): walker 10 / runner 15 / brute 40 / boss 200 (mọi
 * type boss) / headshot ×1.5 (round 1 lần). Best lưu localStorage
 * "gungame.endless.v1" = {v:1, best:{wave, score}} — best = wave cao nhất,
 * bằng wave → score cao hơn.
 *
 * Kết thúc (P4-K13): "player-died" khi active → ghi best + profile.add +
 * phát "endless-over" {wave, score, bestWave, bestScore} + active = false.
 * Main nghe → menus.show("endlessOver"); ui-quit → main gọi stop() trước
 * freshRun.
 *
 * Bus events emitted: "endless-start" {}, "endless-score" {wave, score},
 * "endless-over" {wave, score, bestWave, bestScore}.
 * Bus events consumed: "wave-start" {n}, "wave-clear" {n}, "zombie-killed"
 * {type, headshot}, "player-died".
 *
 * @param {EventTarget} bus - the shared bus (src/systems/gamestate.js).
 * @param {EndlessDeps} deps - { waves, events, gamestate, profile } (P4-K23).
 * @returns {Endless}
 */

/**
 * @typedef {Object} EndlessDeps
 * @property {import("../zombies/waves.js").Waves & {
 *   setMode: (m: "story"|"endless") => void,
 *   getMode: () => "story"|"endless",
 *   getWave: () => number,
 * }} waves - wave director với API mode additive (P4-K9, Builder C).
 * @property {import("./events.js").Events} events - scheduler sự kiện
 *   (forceEvent("bloodmoon") — P4-K10).
 * @property {import("./gamestate.js").Gamestate} gamestate
 * @property {import("./profile.js").ProfileApi} profile
 */

/**
 * @typedef {Object} Endless
 * @property {() => void} start - active = true, score/wave = 0,
 *   waves.setMode("endless") + waves.reset(), phát "endless-start".
 * @property {() => void} stop - active = false + waves.setMode("story")
 *   (KHÔNG reset waves — caller freshRun lo). Idempotent.
 * @property {() => boolean} isActive
 * @property {(dt: number) => void} update - máy retry bloodmoon 1 s
 *   (P4-K10); main gọi trong nhánh "playing" cạnh gamestate.update.
 * @property {() => {active: boolean, wave: number, score: number}} snapshot
 *   - REUSED scratch object (zero-alloc cho hudExtras — P4-K12); clone khi
 *   cần giữ lại (debug endlessState trả object tươi).
 * @property {() => {wave: number, score: number}} best - copy từ storage.
 */

import { BOSS_CLASSES } from "../zombies/bosses.js";

// FROZEN contract constants (docs/EXPANSION-P4.md §5 / P4-K10 / P4-K11).
export const ENDLESS_KEY = "gungame.endless.v1";
export const ENDLESS_SCORE = { walker: 10, runner: 15, brute: 40, boss: 200 };
export const ENDLESS_HEADSHOT_MULT = 1.5;
export const MOON_RETRY_S = 1; // thử lại bloodmoon mỗi 1 s trong wave %5

export function createEndless(bus, deps) {
  void BOSS_CLASSES; // Builder C: random boss type = key đều trong BOSS_CLASSES
  void deps; // P4-K23: { waves, events, gamestate, profile } — dùng khi implement

  /** Bật chế độ vô tận (main gọi trong "ui-endless" — P4-K14). */
  function start() {
    throw new Error("TODO(P4-builder-C): implement start per docs/EXPANSION-P4.md §5.2");
  }

  /** Rời chế độ (main gọi đầu listener "ui-quit" — P4-K13). */
  function stop() {
    throw new Error("TODO(P4-builder-C): implement stop per docs/EXPANSION-P4.md §5.2");
  }

  /** @returns {boolean} đang chạy endless. */
  function isActive() {
    throw new Error("TODO(P4-builder-C): implement isActive per docs/EXPANSION-P4.md §5.2");
  }

  /**
   * Tick máy retry bloodmoon (P4-K10). main gọi khi "playing" — pause tự đóng băng.
   * @param {number} dt - giây.
   */
  function update(dt) {
    throw new Error("TODO(P4-builder-C): implement update per docs/EXPANSION-P4.md §5.2 (dt=" + String(dt) + ")");
  }

  /**
   * Snapshot zero-alloc cho hudExtras (P4-K12).
   * @returns {{active: boolean, wave: number, score: number}}
   */
  function snapshot() {
    throw new Error("TODO(P4-builder-C): implement snapshot per docs/EXPANSION-P4.md §5.2");
  }

  /** Best hiện tại từ "gungame.endless.v1" (P4-K11). */
  function best() {
    throw new Error("TODO(P4-builder-C): implement best per docs/EXPANSION-P4.md §5.2");
  }

  return { start, stop, isActive, update, snapshot, best };
}
