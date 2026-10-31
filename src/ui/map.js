/**
 * ============================================================================
 * MAP — bản đồ toàn màn hình phím M + hỗ trợ compass "ĐÊM THỨ 30 · Phần 2"
 * (docs/EXPANSION-P2.md §4).
 * ============================================================================
 * STUB — Builder MAP/UI thay thân `createMap`, GIỮ nguyên chữ ký + typedef +
 * JSDoc dưới đây. Hợp đồng đầy đủ: docs/EXPANSION-P2.md mục 0 (K-P2-1/7/10/13),
 * 4.1–4.3, 6, 7.3, checklist mục 10.
 *
 * createMap(container, bus, city) → { toggle(), show(visible), update(player,
 * extras?) }:
 * - Phím M: input.js (integrator) phát "map-toggle" khi playing và shop
 *   không mở (đúng nhánh KeyB — input.js:163-169); MAP TỰ NGHE "map-toggle"
 *   → toggle(). Sau khi đổi trạng thái PHÁT "map-visibility" {open} để hud
 *   ẩn compass khi map mở (§4.3).
 * - Overlay canvas 2D full-screen TỰ STYLE INLINE bên trong `container`
 *   (#ui — pointer-events: none, KHÔNG bật lại; map chỉ xem): nền
 *   rgba(2,4,8,0.82), display:none mặc định, z-index 50.
 * - Vẽ 7 khu từ **city.districts** (KHÔNG có `city.list` — P2-K1): fill theo
 *   bounds; khoá = đỏ sẫm, mở = xanh xám ("đã mở" = BFS từ "safehouse" qua
 *   cổng open trên `city.districts[].gates` + `city.gateBetween(a,b).open`,
 *   đọc LIVE mỗi lần vẽ — P2-K10); khu hiện tại
 *   (`city.districtAt(player)`) sáng + viền vàng; TÊN khu qua
 *   `i18n.t("district_" + id)` (city.js sở hữu key — map KHÔNG đăng ký lại,
 *   fallback raw id); lưới 20 m mờ; player = mũi tên theo `extras.yaw`;
 *   marker nhiệm vụ `extras.mission` (main derive — P2-K13); marker sự kiện
 *   `extras.event` + timeLeft cache từ bus "event-start"/"event-end"/
 *   "bloodmoon-active"; marker boss `extras.boss`; khuyết 12 cổng xanh/đỏ.
 * - update(player, extras?) được main gọi 10 Hz khi playing (+ 1 lần ngay
 *   khi toggle) — extras tham số TUỲ CHỌN (pattern hud.update extras):
 *   {boss: {x, z, type}|null, yaw: number, mission: {x, z}|null,
 *   event: {type, x, z}|null}. Thiếu extras → vẫn vẽ khu + player.
 * - Hiệu năng: cache tên khu theo lang (invalidate khi "settings-changed"
 *   {patch.lang}); không cấp phát trong đường vẽ ngoài những gì canvas bắt
 *   buộc; KHÔNG đụng style.css.
 *
 * i18n keys owned by THIS module (docs/EXPANSION-P2.md §7.3, EN + VI verbatim,
 * đăng ký bằng i18n.registerBundle ở dưới): map_toggle_hint, map_locked,
 * map_open, map_title. Các key tiêu dùng (KHÔNG đăng ký): district_* (city.js
 * — `city.js:138-157`), "boss" + Capitalize(type) (bosses.js:90-107),
 * event_* (events.js §7.1 — hiển thị tên sự kiện trên map).
 *
 * Bus events consumed: "map-toggle", "event-start", "event-end",
 * "bloodmoon-active", "settings-changed" (lang).
 * Bus events emitted: "map-visibility" {open: boolean}.
 *
 * @param {HTMLElement} container - the #ui element (pointer-events: none —
 *   KHÔNG bật lại trên overlay canvas; map không nhận click).
 * @param {EventTarget} bus - the shared bus (src/systems/gamestate.js).
 * @param {import("../world/city.js").City} city - districts/districtAt/
 *   gateBetween để vẽ khu + trạng thái cổng (chỉ ĐỌC, live mỗi lần vẽ).
 * @returns {Map}
 */

/**
 * Dữ liệu bổ sung do main.js tính mỗi lần gọi update (docs/EXPANSION-P2.md
 * §8.4; P2-K7/K13). Mọi field TUỲ CHỌN — thiếu field nào bỏ phần vẽ đó.
 *
 * @typedef {Object} MapExtras
 * @property {{x: number, z: number, type: string}|null} [boss] - boss đang
 *   sống (bossRef của main), null = không có.
 * @property {number} [yaw] - camera yaw radian (camera.rotation.y, "YXZ").
 * @property {{x: number, z: number}|null} [mission] - marker nhiệm vụ hiện
 *   tại (derive P2-K13).
 * @property {{type: string, x: number, z: number}|null} [event] - marker sự
 *   kiện đang chạy (x/z null với bloodmoon).
 */

/**
 * @typedef {Object} Map
 * @property {() => void} toggle - mở/đóng overlay; phát "map-visibility"
 *   {open} sau khi đổi.
 * @property {(visible: boolean) => void} show - đặt trạng thái tường minh
 *   (main gọi khi freshRun/state đổi); phát "map-visibility" {open}.
 * @property {(player: import("../player/controller.js").Player,
 *             extras?: MapExtras) => void} update - vẽ lại (main gọi 10 Hz
 *   khi playing; no-op khi đang ẩn).
 */

import * as i18n from "../core/i18n.js";

// i18n keys owned by THIS module (docs/EXPANSION-P2.md §7.3 — verbatim).
i18n.registerBundle({
  en: {
    map_toggle_hint: "[M] — CLOSE MAP",
    map_locked: "LOCKED",
    map_open: "OPEN",
    map_title: "DISTRICT MAP",
  },
  vi: {
    map_toggle_hint: "[M] — ĐÓNG BẢN ĐỒ",
    map_locked: "KHOÁ",
    map_open: "MỞ",
    map_title: "BẢN ĐỒ KHU VỰC",
  },
});

// =============================================================================
// STUB — Builder MAP/UI thay toàn bộ phần dưới bằng implementation thật,
// giữ nguyên chữ ký createMap(container, bus, city) + JSDoc + typedef.
// Hợp đồng: docs/EXPANSION-P2.md mục 4 (4.1–4.3), 6, 7.3, checklist mục 10.
// =============================================================================

export function createMap(container, bus, city) {
  void container;
  void bus;
  void city;
  throw new Error("TODO(map): implement per docs/EXPANSION-P2.md §4");
}
