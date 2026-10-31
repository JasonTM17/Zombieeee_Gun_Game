/**
 * ============================================================================
 * EVENTS — sự kiện ngẫu nhiên "ĐÊM THỨ 30 · Phần 2" (docs/EXPANSION-P2.md §3).
 * ============================================================================
 * STUB — Builder EVENTS thay thân `createEvents`, GIỮ nguyên chữ ký + typedef
 * + JSDoc dưới đây. Hợp đồng đầy đủ: docs/EXPANSION-P2.md mục 0 (K-P2-1…16),
 * 3.1–3.8, 6 (event bus), 7.1 (key i18n — đăng ký ở dưới, giữ nguyên chữ).
 *
 * createEvents(bus, city, audio, hooks) → Events:
 * - Bộ lập lịch ngẫu nhiên: event đầu sau 40–80 s kể từ lần update() đầu tiên
 *   sau reset(); giữa các event nghỉ 45–120 s. Pool trọng số horde 30 /
 *   supply 25 / survivor 25 / bloodmoon 20; không lặp cùng loại 2 lần liền;
 *   chỉ đếm dt qua update() (main chỉ gọi khi "playing" → pause đóng băng —
 *   P2-K15); "khu đã mở" = BFS từ "safehouse" qua cổng open trên
 *   `city.districts` + `city.gateBetween(a,b).open` (P2-K10; KHÔNG có
 *   `city.list` — P2-K1). quarantine không làm host (spawnPoints rỗng,
 *   P2-K11). Event thường có thể chồng nhau; bloodmoon loại trừ mọi event
 *   khác khi đang active.
 * - "horde" (40 s): còi hụ synth 2 s (tự chứa — pattern city.js:522-601) +
 *   banner qua bus; 8 + floor(activeMission()/2) runner trong 6 s, chọn
 *   district mở ≠ khu player (fallback chính khu player — P2-K12), spawn tại
 *   district.spawnPoints qua hooks.spawnRunner (KHÔNG đụng waves.js).
 * - "supply" (90 s): thùng rơi 20 m → 0 trong 4 s tại điểm pool ≥ 15 m từ
 *   player; beacon additive + khói đỏ; mở bằng E (events tự nghe
 *   "interact-press" + freshness guard 300 ms — pattern missions.js:353/1069;
 *   "interact-near" {target:"item_supply"} đổi-trạng-thái-mới) →
 *   hooks.supplyOpened(x, z) + "event-end" {reason:"opened"}; despawn sau
 *   90 s → {reason:"despawned"}. Loot áp trực tiếp, KHÔNG pickups.spawn
 *   (clamp PLAY_RECTS — P2-K5).
 * - "survivor" (90 s): survivor low-poly xanh rêu vẫy tay + 5 zombie (hooks.
 *   spawnRunner, giữ refs để đọc .alive); player < 2 m && 5 zombie đã chết →
 *   "survivor-rescued" {x, z} + "event-end" {reason:"rescued"}; quá 90 s →
 *   survivor ngã + fade + {reason:"lost"}.
 * - "bloodmoon" (90 s): "bloodmoon-active" {active:true|false, duration:90}
 *   — atmosphere lerp trời/fog đỏ, waves gap ×0.5, economy tiền ×2, audio
 *   murmur ×1.6, hud countdown đỏ (mỗi listener do builder tương ứng sở hữu,
 *   mục 3.6).
 * - Mọi event phát "event-start" {type, timeLeft, x, z, districtId} và
 *   "event-end" {type, reason, money?} (bảng mục 6 hợp đồng).
 * - reset(): dọn mọi event + FX + scheduler (mục 3.7); nghe defensive
 *   "ui-play"/"ui-restart"/"ui-play-free" → reset() (economy.js:139-144
 *   pattern); main.js vẫn gọi trực tiếp trong freshRun().
 *
 * Bus events emitted: "event-start", "event-end", "bloodmoon-active",
 * "survivor-rescued", "interact-near" (target "item_supply").
 * Bus events consumed: "interact-press", "ui-play", "ui-restart",
 * "ui-play-free".
 *
 * i18n keys owned by THIS module (docs/EXPANSION-P2.md §7.1 — EN + VI verbatim,
 * đăng ký bằng i18n.registerBundle ở dưới): event_horde, event_supply,
 * event_survivor, event_bloodmoon, event_horde_banner, event_supply_banner,
 * event_survivor_banner, event_bloodmoon_banner, event_bloodmoon_timer,
 * event_supply_opened, event_survivor_rescued, event_survivor_lost,
 * event_bloodmoon_end, event_survivor_thanks.
 *
 * @param {EventTarget} bus - the shared bus (src/systems/gamestate.js);
 *   events.js nhận bus qua tham số (khác input.js — signature có bus).
 * @param {import("../world/city.js").City} city - districts/districtAt/
 *   gateBetween để chọn khu đã mở + điểm spawn (chỉ ĐỌC).
 * @param {import("../core/audio.js").Audio} audio - tham chiếu cho còi hụ
 *   horde tôn trọng volume settings; audio không bị thay đổi bởi module này.
 * @param {EventHooks} [hooks] - ADDITIVE tham số thứ 4 (P2-K6): callback
 *   main.js truyền vào — spawnRunner/supplyOpened/activeMission. Thiếu →
 *   event vẫn chạy (console.warn 1 lần), không sinh zombie / không loot.
 * @returns {Events}
 */

/**
 * Callback do main.js truyền (docs/EXPANSION-P2.md §3.1, P2-K6).
 *
 * @typedef {Object} EventHooks
 * @property {(x: number, z: number) => import("../zombies/zombie.js").Zombie|null}
 *   [spawnRunner] - main tạo 1 runner TẠI (x, z): jitter + isBlocked như
 *   waves.js:556-566, push vào debugZombies, emit "zombie-spawned"
 *   (pattern main.js:961-974) và TRẢ VỀ Zombie để events đọc .alive.
 * @property {(x: number, z: number) => void} [supplyOpened] - main thanh toán
 *   loot: economy.add(200–400) + "pickup"{kind:"health"} + full ammo súng
 *   hiện tại (P2-K5).
 * @property {() => number} [activeMission] - missions.current, clamp 0..9
 *   (free-roam 10 → 9) — P2-K3.
 */

/**
 * Trạng thái event đang chạy (shape `active()` cố định theo spec — chỉ event
 * MỚI BẮT ĐẦU NHẤT khi có chồng nhau).
 *
 * @typedef {Object} EventSnapshot
 * @property {"horde"|"supply"|"survivor"|"bloodmoon"} type
 * @property {number} timeLeft - giây còn lại (số cứng: horde 40, supply 90,
 *   survivor 90, bloodmoon 90 — P2-K2).
 */

/**
 * @typedef {Object} Events
 * @property {(dt: number, playerPos: import("three").Vector3) => void} update
 *   Advance scheduler + mọi event active (dt giây; playerPos = player feet).
 *   Chỉ được gọi khi state "playing" → pause tự đóng băng (P2-K15).
 * @property {(type: string) => boolean} forceEvent - debug: bắt đầu `type`
 *   ngay (bỏ qua cooldown, tôn trọng luật bloodmoon — sai type/false khi bị
 *   chặn → false).
 * @property {() => EventSnapshot|null} active - snapshot event mới nhất đang
 *   chạy, null khi không có gì.
 * @property {() => void} reset - dọn mọi event + FX + scheduler (mục 3.7);
 *   idempotent; phát "bloodmoon-active" {active:false} + "event-end"
 *   {reason:"reset"} cho các event đang chạy trước khi xoá.
 */

import * as i18n from "../core/i18n.js";

// i18n keys owned by THIS module (docs/EXPANSION-P2.md §7.1 — verbatim).
i18n.registerBundle({
  en: {
    event_horde: "HORDE",
    event_supply: "SUPPLY DROP",
    event_survivor: "SURVIVOR",
    event_bloodmoon: "BLOODMOON",
    event_horde_banner: "🚨 HORDE INCOMING",
    event_supply_banner: "📦 SUPPLY DROP INBOUND",
    event_survivor_banner: "🆘 SURVIVOR SURROUNDED",
    event_bloodmoon_banner: "🌕 BLOODMOON RISES",
    event_bloodmoon_timer: "BLOODMOON {n}s",
    event_supply_opened: "SUPPLY SECURED +{money}$",
    event_survivor_rescued: "SURVIVOR RESCUED +300$",
    event_survivor_lost: "SURVIVOR LOST",
    event_bloodmoon_end: "BLOODMOON ENDED",
    event_survivor_thanks:
      "Thank you! I thought I was dead for sure. Take my supplies — I owe you my life.",
  },
  vi: {
    event_horde: "BỘ ĐÀN",
    event_supply: "TIẾP TẾ",
    event_survivor: "NGƯỜI SỐNG SÓT",
    event_bloodmoon: "TRĂNG MÁU",
    event_horde_banner: "🚨 HORDE ĐANG TỚI",
    event_supply_banner: "📦 TIẾP TẾ ĐANG RƠI",
    event_survivor_banner: "🆘 NGƯỜI SỐNG SÓT BỊ VÂY",
    event_bloodmoon_banner: "🌕 TRĂNG MÁU NỔI",
    event_bloodmoon_timer: "TRĂNG MÁU {n}s",
    event_supply_opened: "ĐÃ NHẬN TIẾP TẾ +{money}$",
    event_survivor_rescued: "ĐÃ CỨU NGƯỜI SỐNG SÓT +300$",
    event_survivor_lost: "NGƯỜI SỐNG SÓT ĐÃ NGÃ",
    event_bloodmoon_end: "TRĂNG MÁU TAN",
    event_survivor_thanks:
      "Cảm ơn anh! Tôi tưởng chắc chắn chết rồi. Lấy gói đồ này — tính mạng tôi là của anh nợ.",
  },
});

// =============================================================================
// STUB — Builder EVENTS thay toàn bộ phần dưới bằng implementation thật,
// giữ nguyên chữ ký createEvents(bus, city, audio, hooks) + JSDoc + typedef.
// Hợp đồng: docs/EXPANSION-P2.md mục 3 (3.1–3.8), 6, 7.1, checklist mục 10.
// =============================================================================

export function createEvents(bus, city, audio, hooks) {
  void bus;
  void city;
  void audio;
  void hooks;
  throw new Error("TODO(events): implement per docs/EXPANSION-P2.md §3");
}
