/**
 * ============================================================================
 * ACHIEVEMENTS — 12 THÀNH TỰU (P4 "GUN GAME 2.0", tính năng D).
 * ============================================================================
 * Hợp đồng duy nhất: docs/EXPANSION-P4.md §6.1-6.2 (spec D nguyên văn + P4-K14).
 *
 * createAchievements(bus, deps) → { all(), unlockedIds(), isUnlocked(id) }
 *
 * deps (P4-K23, bắt buộc): { gamestate, endless, weapons }
 * - gamestate: đọc .ngPlus cho ngplus_done (P3-K9 — main sở hữu cờ).
 * - endless: isActive() cho wave_15 (chỉ đếm wave trong CHẾ ĐỘ vô tận).
 * - weapons: đếm list owned === 7 cho arsenal.
 *
 * Storage "gungame.achv.v1" = {v:1, ids: []} (try/catch; hỏng → {v:1, ids:[]}).
 *
 * 12 điều kiện (nguyên văn §6.1 — bảng có cột "Nguồn tín hiệu"):
 *   first_blood   — "zombie-killed" lần đầu.
 *   head_50       — đếm "zombie-killed" {headshot:true} ≥ 50.
 *   head_200      — như trên, ≥ 200.
 *   story_half    — "mission-complete" {index:5}.
 *   story_done    — "origin-defeated" (fallback "mission-complete" {index:10}).
 *   ngplus_done   — "origin-defeated" && deps.gamestate.ngPlus === true.
 *   rich_5000     — "money-changed" {money ≥ 5000}.
 *   arsenal       — poll weapons.list (owned count === 7) trên "money-changed"
 *                   + "upgrade-bought".
 *   maxed_gun     — "upgrade-bought" {level === 3}.
 *   blood_slayer  — "bloodmoon-active" {active} arm/reset counter nội bộ +
 *                   "zombie-killed" khi active ≥ 10.
 *   wave_15       — "wave-start" {n ≥ 15} && deps.endless.isActive().
 *   endless_5000  — "endless-score" {score ≥ 5000} (+ "endless-over" check cuối).
 *
 * unlock(id): idempotent → push + persist + phát "achievement-unlocked" {id}.
 * Toast vàng "🏆 THÀNH TỰU — {tên}" do HUD vẽ (hud nghe "achievement-unlocked",
 * key achvToast — §8.4); module này KHÔNG đụng DOM.
 *
 * i18n: registerBundle 24 key (achv_{id} + achv_{id}_desc — bảng nguyên văn
 * §6.2) Ở MODULE LEVEL (pattern events.js:150-185 — không phụ thuộc thứ tự
 * tạo). Builder D thêm bundle thật vào đây khi implement.
 *
 * Bus events emitted: "achievement-unlocked" {id}.
 * Bus events consumed: "zombie-killed", "mission-complete", "origin-defeated",
 * "money-changed", "upgrade-bought", "bloodmoon-active", "wave-start",
 * "endless-score", "endless-over".
 *
 * @param {EventTarget} bus - the shared bus (src/systems/gamestate.js).
 * @param {AchievementDeps} deps - { gamestate, endless, weapons } (P4-K23).
 * @returns {AchievementApi}
 */

/**
 * @typedef {Object} AchievementDeps
 * @property {import("./gamestate.js").Gamestate} gamestate - đọc ngPlus.
 * @property {import("./endless.js").Endless} endless - isActive() cho wave_15.
 * @property {import("../player/weapons.js").Weapons} weapons - đếm owned cho
 *   arsenal (7 = list.length).
 */

/**
 * Một thành tựu (shape all()).
 * @typedef {Object} AchievementView
 * @property {string} id
 * @property {boolean} unlocked
 * @property {string} nameKey - "achv_{id}" (i18n §6.2).
 * @property {string} descKey - "achv_{id}_desc".
 */

/**
 * @typedef {Object} AchievementApi
 * @property {() => AchievementView[]} all - 12 dòng theo thứ tự FROZEN §6.1.
 * @property {() => string[]} unlockedIds - mảng id đã unlock (debug
 *   achievementsState trả trực tiếp mảng này).
 * @property {(id: string) => boolean} isUnlocked
 */

// FROZEN contract constants (docs/EXPANSION-P4.md §6.1-6.2).
export const ACHV_KEY = "gungame.achv.v1";
export const ACHV_IDS = [
  "first_blood",
  "head_50",
  "head_200",
  "story_half",
  "story_done",
  "ngplus_done",
  "rich_5000",
  "arsenal",
  "maxed_gun",
  "blood_slayer",
  "wave_15",
  "endless_5000",
];

export function createAchievements(bus, deps) {
  void deps; // P4-K23: { gamestate, endless, weapons } — dùng khi implement

  /**
   * 12 dòng thành tựu theo thứ tự FROZEN §6.1.
   * @returns {AchievementView[]}
   */
  function all() {
    throw new Error("TODO(P4-builder-D): implement all per docs/EXPANSION-P4.md §6.1");
  }

  /** Mảng id đã unlock (debug achievementsState — §7.3). */
  function unlockedIds() {
    throw new Error("TODO(P4-builder-D): implement unlockedIds per docs/EXPANSION-P4.md §6.1");
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  function isUnlocked(id) {
    throw new Error("TODO(P4-builder-D): implement isUnlocked per docs/EXPANSION-P4.md §6.1 (id=" + String(id) + ")");
  }

  return { all, unlockedIds, isUnlocked };
}
