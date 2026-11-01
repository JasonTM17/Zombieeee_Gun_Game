/**
 * ============================================================================
 * SAVE — LƯU GAME / TIẾP TỤC (P4 "GUN GAME 2.0", tính năng A).
 * ============================================================================
 * Hợp đồng duy nhất: docs/EXPANSION-P4.md §3 (spec A nguyên văn + P4-K1..K5).
 *
 * createSave(bus, deps) → { saveNow(reason), readSave(), clearSave(), hasSave() }
 *
 * - deps (P4-K23): `{ snapshot: () => SaveData|null }` — callback main.js
 *   truyền, dựng snapshot ĐẦY ĐỦ theo bảng §3.3. Trả null → saveNow no-op
 *   (chặn save ở endless / ngoài run sống).
 * - Schema v1, localStorage key "gungame.save.v1":
 *     { v: 1, ts, storyRun, ngPlus, mission, objectivesSnapshot?,
 *       money, weapons: [{name, owned, reserve, upgrades:{dmg,mag,rl}}],
 *       unlockedDistricts, currentDistrict, wave, score, highScore, difficulty }
 * - P4-K3: Infinity serialize thành null (reserve của pistol) — restore ánh
 *   xạ null → Infinity. upgrades.* là số nguyên 0..3.
 * - saveNow(reason): deps.snapshot() → validate/normalize → JSON.stringify
 *   (try/catch) → setItem. Lỗi → console.warn 1 lần, KHÔNG throw. Trả
 *   {ok:true, ts} hoặc {ok:false}.
 * - readSave(): getItem → JSON.parse (try/catch) → kiểm v === 1 + kiểu field
 *   bắt buộc. Sai/hỏng → removeItem + console.warn + trả null
 *   (corruption-guard của spec).
 * - hasSave(): readSave() !== null — nút TIẾP TỤC không bao giờ hiện cho save
 *   hỏng.
 * - save.js KHÔNG tự nghe bus (P4-K1): gamestate.js nghe 4 trigger
 *   ("mission-complete" / "wave-clear" / "player-died" / "ui-quit") → phát
 *   "save-request" {reason} → gamestate gọi gamestate.saveDeps.saveNow(reason)
 *   (main gán saveDeps ngay sau createSave). Trigger "story-start" main gọi
 *   thẳng saveNow trước beginFreshStory; "debug" từ window.__game.saveNow().
 *
 * Bus events emitted: none. Bus events consumed: none.
 *
 * @param {EventTarget} [bus] - the shared bus (src/systems/gamestate.js);
 *   nhận cho đúng chữ ký spec, hiện tại không đăng ký listener nào (P4-K1).
 * @param {SaveDeps} deps - { snapshot } do main.js cung cấp (P4-K23).
 * @returns {SaveApi}
 */

/**
 * @typedef {Object} SaveDeps
 * @property {() => SaveData|null} snapshot - main.js dựng SaveData đầy đủ
 *   (bảng §3.3); trả null khi không được phép save (endless active / state
 *   không phải run sống).
 */

/**
 * Một súng trong save. Reserve `null` = Infinity (pistol — P4-K3).
 * @typedef {Object} SaveWeaponEntry
 * @property {string} name - "pistol"|"shotgun"|"rifle"|"smg"|"sniper"|"minigun"|"grenade".
 * @property {boolean} owned
 * @property {number|null} reserve - số nguyên ≥ 0; null = Infinity.
 * @property {{dmg: number, mag: number, rl: number}} upgrades - mỗi giá trị 0..3.
 */

/**
 * Schema v1 "gungame.save.v1" (P4-K3..K5).
 * @typedef {Object} SaveData
 * @property {1} v - schema version (readSave từ chối mọi giá trị khác).
 * @property {number} ts - Date.now() lúc ghi.
 * @property {boolean} storyRun - run này là STORY (PLAY), không phải free-roam.
 * @property {boolean} ngPlus - cờ New Game+ của run (main sở hữu — P3-K9).
 * @property {number} mission - missions.current clamp P4-K22 (1..10; 11→10;
 *   0→0 — restore mission 0 → missions.begin()).
 * @property {{state: Object, objectives: Array<Object>}} [objectivesSnapshot]
 *   - missions.getState() + bản sao objectives LIVE; chỉ thông tin, restore
 *   KHÔNG phát lại ở v1 (P4-K5).
 * @property {number} money - economy.get().
 * @property {SaveWeaponEntry[]} weapons
 * @property {string[]} unlockedDistricts - reachableDistricts("safehouse").
 * @property {string|null} currentDistrict - chỉ thông tin (P4-K4).
 * @property {number} wave - gamestate.wave lúc lưu (hiển thị; wave director
 *   luôn chạy lại từ 1 sau restore — P4-K4).
 * @property {number} score - gamestate.score.
 * @property {number} highScore - settings.get().highScore.
 * @property {string} difficulty - settings.get().difficulty ("easy"|"normal"|"hard").
 */

/**
 * @typedef {Object} SaveApi
 * @property {(reason: string) => {ok: boolean, ts?: number}} saveNow
 *   Lưu 1 lần với reason ("mission-complete"|"wave-clear"|"player-died"|
 *   "ui-quit"|"story-start"|"debug"). deps.snapshot() null → {ok:false}.
 * @property {() => SaveData|null} readSave - đọc + corruption-guard; hỏng →
 *   xoá key + console.warn + null.
 * @property {() => void} clearSave - removeItem (idempotent).
 * @property {() => boolean} hasSave - readSave() !== null.
 */

// FROZEN contract constants (docs/EXPANSION-P4.md §3).
export const SAVE_KEY = "gungame.save.v1";
export const SCHEMA_VERSION = 1;

export function createSave(bus, deps) {
  void bus; // P4-K1: trigger listeners thuộc gamestate.js — save không nghe bus

  /**
   * Lưu 1 lần (P4-K1: gọi bởi gamestate.saveDeps hoặc main trực tiếp).
   * @param {string} reason
   * @returns {{ok: boolean, ts?: number}}
   */
  function saveNow(reason) {
    throw new Error("TODO(P4-builder-A): implement saveNow per docs/EXPANSION-P4.md §3.1 (reason=" + String(reason) + ")");
  }

  /**
   * Đọc + corruption-guard (P4-K3: null reserve = Infinity; kiểm v === 1).
   * @returns {SaveData|null}
   */
  function readSave() {
    throw new Error("TODO(P4-builder-A): implement readSave per docs/EXPANSION-P4.md §3.1");
  }

  /** Xoá save (idempotent). */
  function clearSave() {
    throw new Error("TODO(P4-builder-A): implement clearSave per docs/EXPANSION-P4.md §3.1");
  }

  /** true khi có save đọc được — nút TIẾP TỤC dựa vào đây (P4-K2). */
  function hasSave() {
    throw new Error("TODO(P4-builder-A): implement hasSave per docs/EXPANSION-P4.md §3.1");
  }

  return { saveNow, readSave, clearSave, hasSave };
}
