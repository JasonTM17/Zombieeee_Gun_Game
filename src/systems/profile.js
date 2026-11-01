/**
 * ============================================================================
 * PROFILE — THỐNG KÊ TRỌN ĐỜI (P4 "GUN GAME 2.0", tính năng C).
 * ============================================================================
 * Hợp đồng duy nhất: docs/EXPANSION-P4.md §5.3 (spec C nguyên văn + P4-K21).
 *
 * createProfile(bus) → { get(), add(patch), update(dt) }
 *
 * - localStorage "gungame.profile.v1", schema FROZEN:
 *     { kills, headshots, deaths, playtimeSec, bossesKilled, moneyEarned,
 *       endlessBest: {wave, score} }
 *   Khởi tạo/sanitize: số nguyên ≥ 0 (try/catch — hỏng → mặc định, KHÔNG
 *   xoá key nếu chỉ 1 field sai).
 * - Nghe bus CỘNG DỒN (P4-K21):
 *   - "zombie-killed" → kills += 1; headshots += (headshot === true);
 *     bossesKilled += (type ∈ {butcher, spitter, screamer, golem, origin} —
 *     mirror BOSS_KILL_TYPES gamestate.js:224).
 *   - "player-died" → deaths += 1.
 *   - "money-changed" {delta > 0} → moneyEarned += delta.
 * - update(dt): playtimeSec += max(0, dt) — main gọi trong nhánh "playing"
 *   (cạnh gamestate.update); pause/menu KHÔNG tính. Persist khi
 *   Math.floor(playtimeSec) ĐỔI (không ghi localStorage mỗi frame).
 * - add(patch): 6 counter số → CỘNG (Math.max(0, round)); endlessBest object
 *   → THAY KHI TỐT HƠN (wave > best.wave, hoặc bằng wave && score > best.score
 *   — cùng quy tắc best của endless, P4-K11). Persist NGAY sau mỗi add.
 * - KHÔNG có reset — thống kê TRỌN ĐỜI; KHÔNG listener ui-play/ui-restart/
 *   ui-quit nào được xoá dữ liệu (spec: "reset KHÔNG xoá profile").
 * - get() trả BẢN COPY nông mới — người gọi không được mutate nội bộ.
 * - Profile im lặng trên bus (không emit).
 *
 * Bus events consumed: "zombie-killed", "player-died", "money-changed".
 * Bus events emitted: none.
 *
 * @param {EventTarget} [bus] - the shared bus (src/systems/gamestate.js);
 *   omit → dùng module-level shared bus (pattern economy.js:86).
 * @returns {ProfileApi}
 */

/**
 * @typedef {Object} ProfileData
 * @property {number} kills - tổng zombie đã hạ.
 * @property {number} headshots - tổng kill vào đầu.
 * @property {number} deaths - tổng lần chết.
 * @property {number} playtimeSec - tổng giây chơi (state "playing").
 * @property {number} bossesKilled - tổng boss đã hạ (5 type — P4-K21).
 * @property {number} moneyEarned - Σ delta dương "money-changed".
 * @property {{wave: number, score: number}} endlessBest - kỷ lục sinh tồn.
 */

/**
 * @typedef {Object} ProfileApi
 * @property {() => ProfileData} get - bản copy nông mới (P4-K21).
 * @property {(patch: {kills?: number, headshots?: number, deaths?: number,
 *   playtimeSec?: number, bossesKilled?: number, moneyEarned?: number,
 *   endlessBest?: {wave: number, score: number}}) => void} add
 *   Cộng dồn counter / thay best khi tốt hơn; persist ngay.
 * @property {(dt: number) => void} update - cộng playtimeSec; main gọi khi
 *   "playing" (additive — ngoài get/add của spec, chốt P4-K21).
 */

import { bus as sharedBus } from "./gamestate.js";

// FROZEN contract constants (docs/EXPANSION-P4.md §5.3).
export const PROFILE_KEY = "gungame.profile.v1";
export const PROFILE_BOSS_TYPES = { butcher: 1, spitter: 1, screamer: 1, golem: 1, origin: 1 };

export function createProfile(bus) {
  const B = bus || sharedBus;
  void B; // Builder C: 3 listener "zombie-killed"/"player-died"/"money-changed"

  /**
   * Bản copy nông mới của thống kê (người gọi không được mutate nội bộ).
   * @returns {ProfileData}
   */
  function get() {
    throw new Error("TODO(P4-builder-C): implement get per docs/EXPANSION-P4.md §5.3");
  }

  /**
   * Cộng dồn counter / thay endlessBest khi tốt hơn (P4-K21); persist ngay.
   * @param {{kills?: number, headshots?: number, deaths?: number,
   *   playtimeSec?: number, bossesKilled?: number, moneyEarned?: number,
   *   endlessBest?: {wave: number, score: number}}} patch
   */
  function add(patch) {
    throw new Error("TODO(P4-builder-C): implement add per docs/EXPANSION-P4.md §5.3 (patch=" + String(patch && Object.keys(patch)) + ")");
  }

  /**
   * Cộng playtimeSec (main gọi khi "playing"); persist khi floor đổi (P4-K21).
   * @param {number} dt - giây.
   */
  function update(dt) {
    throw new Error("TODO(P4-builder-C): implement update per docs/EXPANSION-P4.md §5.3 (dt=" + String(dt) + ")");
  }

  return { get, add, update };
}
