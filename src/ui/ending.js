/**
 * ============================================================================
 * ENDING — MÀN KẾT "GIẢI CỨU — NGÀY 31" + NEW GAME+ — "ĐÊM THỨ 30 · Phần 3".
 * Hợp đồng: docs/EXPANSION-P3.md §4 (spec nguyên văn §4.0; state machine §4.2;
 * stats §4.3; nút → bus §4.4; key i18n EN/VI nguyên văn §7.4).
 * ============================================================================
 * STUB — Builder ENDING thay thân `createEnding`, GIỮ nguyên chữ ký + typedef
 * dưới đây. Self-styled inline (style.css ngoài danh sách file được sửa —
 * pattern dialogue.js/hud.js). `container` là #ui với `pointer-events: none`:
 * panel kết BẬT `pointer-events: auto` trên chính nó; overlay trắng fade
 * KHÔNG bắt sự kiện.
 *
 * CHUỖI KẾT (state machine — P3 §4.2):
 *   IDLE → nghe "origin-defeated" (bất kể payload, kể cả {debug:true} của
 *   skipToEnding; cờ `started` chặn double) →
 *   1. APPROACH (2.0 s): phát "ending-active" {active:true} (gamestate pause
 *      reason "ending" — P3-K10); audio.chopperSynth("start") (tới dần);
 *      camera FOV baseFov → 55 (ease; chụp baseFov = camera.fov lúc bắt đầu).
 *   2. FADE (2.0 s): overlay trắng opacity 0 → 1 (transition 2 s);
 *      audio.victorySting() ở ĐẦU phase; chopper nền ×0.4 gain.
 *   3. SCREEN (chờ nút): panel — kicker + ending_title + 5 hàng stats
 *      (gamestate.runStats() — P3-K11: timeSec mm:ss / kills / moneyEarned /
 *      deaths / bossesKilled) + ending_line + 3 nút. Chopper giữ nền nhẹ.
 *   4. Mọi nút → hide(): chopperSynth("stop") + FOV restore baseFov + phát
 *      "ending-active" {active:false} + gỡ overlay; nút PHÁT bus TRƯỚC khi
 *      dọn hoặc trong cùng click (sync dispatch):
 *        "CHƠI TIẾP — THẾ GIỚI MỞ" → "ui-continue"  (main: lockPointer)
 *        "NEW GAME+"              → "ui-ngplus"     (main: beginNGPlus)
 *        "VỀ MENU"                → "ui-quit"       (đường hiện có main.js:669)
 *
 * update(dt): main gọi MỖI FRAME Ở MỌI STATE (ngoài các nhánh state của
 * frame(), trước engine.render()) — chuỗi kết diễn ra DƯỚI pause reason
 * "ending" nên không được treo update vào nhánh "playing". Idle → no-op rẻ.
 *
 * hide(): idempotent, gỡ mọi DOM + restore FOV + stop chopper + "ending-active"
 * {active:false}; reset cờ `started` (chuỗi có thể chạy lại ở run sau).
 *
 * i18n keys owned by THIS module (registerBundle, EN + VI nguyên văn
 * docs/EXPANSION-P3.md §7.4): ending_title, ending_line, ending_btn_continue,
 * ending_btn_ngplus, ending_btn_menu, ending_stat_time, ending_stat_kills,
 * ending_stat_money, ending_stat_deaths, ending_stat_bosses.
 *
 * Bus events consumed: "origin-defeated". Bus events emitted:
 * "ending-active" {active}, "ui-continue", "ui-ngplus", "ui-quit".
 *
 * @param {HTMLElement} container - the #ui element (pointer-events: none —
 *   panel phải tự bật pointer-events: auto; overlay trắng thì không).
 * @param {EventTarget} bus - shared bus (src/systems/gamestate.js).
 * @param {import("../systems/gamestate.js").Gamestate} gamestate - nguồn stats
 *   (runStats(), kills) — KHÔNG tự pause; pause đi qua "ending-active".
 * @param {import("../core/audio.js").Audio} audio - chopperSynth/victorySting
 *   (audio.js là synth thuần WebAudio — P3 §4.6).
 * @param {{t: Function, registerBundle: Function, getLang: Function}} i18n -
 *   module namespace src/core/i18n.js.
 * @param {import("three").PerspectiveCamera} camera - slow-zoom FOV 75 → 55
 *   (restore trong hide(); KHÔNG đụng renderer/scene).
 * @returns {Ending}
 */

/**
 * @typedef {Object} Ending
 * @property {(dt: number) => void} update - main gọi MỖI FRAME, mọi state
 *   (self-guard khi idle; chạy cả khi paused — chuỗi kết dưới pause "ending").
 * @property {() => void} hide - dọn overlay + chopper + FOV + "ending-active"
 *   {active:false}; idempotent; reset cờ started.
 * @property {() => boolean} isActive - true khi chuỗi đang chạy (APPROACH/
 *   FADE/SCREEN) hoặc panel đang mở.
 */

// --- thời gian chuỗi (số FROZEN — docs/EXPANSION-P3.md §4.2) ------------------

export const APPROACH_TIME = 2.0; // s slow-zoom + chopper tới dần
export const FADE_TIME = 2.0; // s fade trắng
export const ZOOM_FOV = 55; // FOV đích (baseFov chụp từ camera lúc bắt đầu)

/**
 * Factory màn kết. STUB — ném lỗi TODO khi được gọi (import phải sạch để
 * build pass; thân thật do Builder ENDING cài theo docs/EXPANSION-P3.md §4).
 *
 * @param {HTMLElement} container
 * @param {EventTarget} bus
 * @param {import("../systems/gamestate.js").Gamestate} gamestate
 * @param {import("../core/audio.js").Audio} audio
 * @param {{t: Function, registerBundle: Function, getLang: Function}} i18n
 * @param {import("three").PerspectiveCamera} camera
 * @returns {Ending}
 */
export function createEnding(container, bus, gamestate, audio, i18n, camera) {
  void container;
  void bus;
  void gamestate;
  void audio;
  void i18n;
  void camera;
  void APPROACH_TIME;
  void FADE_TIME;
  void ZOOM_FOV;
  throw new Error(
    "TODO(ending): Builder ENDING cài createEnding theo docs/EXPANSION-P3.md §4 — " +
      "nghe \"origin-defeated\" → APPROACH 2 s (chopper + FOV 55) → FADE trắng 2 s " +
      "(victorySting) → panel stats (gamestate.runStats()) + 3 nút " +
      "(ui-continue / ui-ngplus / ui-quit); chữ ký + typedef giữ nguyên."
  );
}
