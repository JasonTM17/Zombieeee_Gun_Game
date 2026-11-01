/**
 * ============================================================================
 * EVENTS — sự kiện ngẫu nhiên "ĐÊM THỨ 30 · Phần 2" (docs/EXPANSION-P2.md §3).
 * ============================================================================
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
 * NIGHT 30 PART 3 (docs/EXPANSION-P3.md §3.5): nghe "origin-alive" {alive}
 * — Origin còn sống thì scheduler TẠM DỪNG (tickScheduler early-return TRƯỚC
 * khi giảm nextTimer — không event MỚI trong trận boss cuối); event ĐANG chạy
 * (supply/survivor/horde/bloodmoon) tiếp tục đếm tự nhiên đến "event-end".
 * reset() hạ cờ (fresh-run state).
 *
 * LƯU Ý TRIỂN KHAI (bổ sung cho JSDoc stub — mọi mục hợp đồng giữ nguyên):
 * - Còi hụ horde: synth cục bộ gesture-gated (pattern createGateSound
 *   city.js:522-601) — đọc volume từ settings storage và cập nhật theo
 *   "settings-changed" trên bus. `audio` tham số KHÔNG bị đụng tới (audio.js
 *   không expose ctx/volume getter — hợp đồng §3.3 cho builder A tự chứa).
 * - Còi hụ / banner chỉ là phần của "event-start"; HUD tự hiện banner từ
 *   event (hợp đồng §3.3.1).
 * - supply money: hook `supplyOpened` trả về void theo typedef; khi main
 *   TRẢ VỀ số tiền đã add (additive, số finite) thì "event-end" kèm
 *   {money} để HUD feed toast event_supply_opened. Không trả → không kèm.
 * - Điểm chọn cho supply/survivor: player đang ở quarantine (hoặc void) →
 *   district mở GẦN NHẤT có pool (P2-K11); ngược lại → điểm ngẫu nhiên ≥ 15 m
 *   trên TẤT CẢ district mở có pool (§3.4.1 — "điểm NGẪU NHIÊN"); không điểm
 *   nào đạt → điểm xa nhất (pattern waves.js:510-531).
 * - Ring zombie survivor: 5 điểm đều trên vành 5.5 m quanh survivor; điểm ở
 *   phía player được đẩy ra vành 6 m (best-effort "≥ 12 m nếu chọn được" —
 *   §3.5.2).
 * - Cứu/thất bại survivor: "survivor-rescued" / toast bắn NGAY tại thời điểm
 *   cứu/thất bại; animation farewell (1 s cảm ơn hoặc ngã) + fade 1.5 s chạy
 *   tiếp rồi mới remove — "event-end" bắn lúc remove (đúng trình tự §3.5).
 *   Trong farewell event vẫn "active" với timeLeft kẹp ≥ 0.
 * - Ngân sách hiệu năng (§3.8): không cấp phát trong per-frame path — khói
 *   supply cập nhật Float32Array tại chỗ, snapshot `active()` là 1 object
 *   tái sử dụng, mảng eligible dùng scratch chung; vật thể mới chỉ cấp phát
 *   lúc event START (hiếm).
 * - SCENE: chữ ký spec không có scene nhưng thùng hàng/survivor phải vào
 *   world → tham số thứ 5 TUỲ CHỌN `scene` (pattern tham số additive của
 *   P2-K6: createMissions(…, scene, level) / createWaves(…, city)). main.js
 *   truyền scene sau hooks. Thiếu scene → event vẫn chạy logic (E mở theo
 *   khoảng cách, cứu theo khoảng cách) nhưng VÔ HÌNH; console.warn 1 lần.
 *
 * Bus events emitted: "event-start", "event-end", "bloodmoon-active",
 * "survivor-rescued", "interact-near" (target "item_supply").
 * Bus events consumed: "interact-press", "ui-play", "ui-restart",
 * "ui-play-free", "settings-changed" (volume cho còi hụ).
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
 * @param {import("../core/audio.js").Audio} audio - KHÔNG bị đụng tới; còi hụ
 *   horde tự chứa synth riêng tôn trọng volume settings (§3.3, xem trên).
 * @param {EventHooks} [hooks] - ADDITIVE tham số thứ 4 (P2-K6): callback
 *   main.js truyền vào — spawnRunner/supplyOpened/activeMission. Thiếu →
 *   event vẫn chạy (console.warn 1 lần), không sinh zombie / không loot.
 * @param {import("three").Scene} [scene] - ADDITIVE tham số thứ 5: scene
 *   world để events dựng thùng hàng / survivor / FX (xem ghi chú SCENE ở
 *   header). Thiếu → event chạy nhưng không có hình (warn 1 lần).
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
 *   hiện tại (P2-K5). Có thể TRẢ VỀ số tiền đã add (additive) để events kèm
 *   {money} vào "event-end" (toast event_supply_opened).
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

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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

// --- scheduler constants (docs/EXPANSION-P2.md §3.2) ---------------------------
const FIRST_MIN = 40; // first event 40–80 s of PLAYING time after reset
const FIRST_MAX = 80;
const COOLDOWN_MIN = 45; // rest between events 45–120 s
const COOLDOWN_MAX = 120;
/** Weighted pool — horde 30 / supply 25 / survivor 25 / bloodmoon 20 (§3.2). */
const WEIGHTS = [
  { type: "horde", w: 30 },
  { type: "supply", w: 25 },
  { type: "survivor", w: 25 },
  { type: "bloodmoon", w: 20 },
];

// --- per-event constants (P2-K2 hard numbers beat the "~" labels) -------------
const DURATIONS = { horde: 40, supply: 90, survivor: 90, bloodmoon: 90 };
const HORDE_BURST = 6; // runners spread over the first 6 s (§3.3.3)
const MIN_DIST = 15; // event points ≥ 15 m from the player (§3.2)
const PRESS_STALE_MS = 300; // ignore E from menus/pause (missions.js:353)
const SUPPLY_HINT_R = 3; // "E — TƯƠNG TÁC" hint radius (§3.4.3)
const SUPPLY_OPEN_R = 2; // E opens within 2 m (§3.4.3)
const SUPPLY_FALL_H = 20; // crate drops from 20 m (§3.4.2)
const SUPPLY_FALL_T = 4; // over 4 s (§3.4.2)
const SUPPLY_DESPAWN_T = 0.5; // scale-to-zero tail before despawn removal
const RESCUE_R = 2; // rescue requires the player < 2 m (§3.5.4)
const SURV_RING_R = 5.5; // zombie ring 5–6 m around the survivor (§3.5.3)
const SURV_RING_R_FAR = 6; // near-side ring points pushed out here
const SURV_PLAYER_SAFE = 12; // best-effort ring ≥ 12 m from the player
const SURV_FAREWELL_T = 1; // grateful wave before the fade (§3.5.4)
const SURV_FALL_T = 0.4; // ~90° topple when the timer wins (§3.5.5)
const FADE_T = 1.5; // shared fade-out window (zombie.js:511-527 pattern)

// --- visuals (low-poly, per-event; disposed on removal — §3.8 budget) ---------
const CRATE_SIZE = 1.1;
const CRATE_COLOR = 0x8a6b3f;
const CRATE_TRIM_COLOR = 0x5c4626;
const BEACON_COLOR = 0xff6a3c; // red-amber supply beacon (§3.4.2)
const BEACON_H = 24;
const SMOKE_COUNT = 24; // ≤ 1 draw call (§3.4.2)
const SMOKE_COLOR = 0xff3b30;
const SURVIVOR_COLOR = 0x4f6b35; // moss-green body (§3.5.2)
const SURVIVOR_SKIN = 0xc9a17c;

/**
 * Local gesture-gated horde-horn synth (docs/EXPANSION-P2.md §3.3.1 — builder
 * A self-contained; pattern createGateSound city.js:522-601). Two detuned
 * saws swell up and fall away over 2 s + a sub layer; fully silent without
 * WebAudio; volume follows the settings store + live "settings-changed".
 * @returns {{play: () => void, setVolume: (v: number) => void}}
 */
function createHorn() {
  const SETTINGS_KEY = "gungame.settings";
  /** @type {AudioContext|null} */
  let ctx = null;
  /** @type {GainNode|null} */
  let master = null;
  let volume = 0.8;
  try {
    if (typeof localStorage !== "undefined") {
      const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (v && typeof v.volume === "number" && Number.isFinite(v.volume)) {
        volume = Math.min(1, Math.max(0, v.volume));
      }
    }
  } catch {
    /* corrupt/absent storage → default */
  }

  function onGesture() {
    if (!ctx) {
      try {
        const Ctor =
          /** @type {any} */ (typeof window !== "undefined" ? window.AudioContext : undefined) ||
          /** @type {any} */ (typeof window !== "undefined" ? window.webkitAudioContext : undefined);
        if (!Ctor) return;
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = volume * 0.7;
        master.connect(ctx.destination);
      } catch {
        ctx = null; // no WebAudio: stays a safe no-op
      }
    }
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  }
  if (typeof document !== "undefined") {
    document.addEventListener("pointerdown", onGesture);
    document.addEventListener("keydown", onGesture);
  }

  function play() {
    if (!ctx || !master) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    // Shared envelope: swell 0.18 s, hold, release — 2 s total (§3.3.1).
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.3, t0 + 0.18);
    g.gain.setValueAtTime(0.3, t0 + 1.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.0);
    // Lowpass opens with the wail then closes as it falls away.
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(480, t0);
    filt.frequency.linearRampToValueAtTime(1500, t0 + 0.85);
    filt.frequency.linearRampToValueAtTime(220, t0 + 2.0);
    filt.Q.value = 1.6;
    filt.connect(g);
    g.connect(master);
    // Two detuned saws beat against each other while they sweep up + down.
    const base = 84;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const mul = i === 0 ? 1 : 1.013;
      osc.frequency.setValueAtTime(base * mul, t0);
      osc.frequency.linearRampToValueAtTime(136 * mul, t0 + 0.85);
      osc.frequency.linearRampToValueAtTime(62 * mul, t0 + 2.0);
      osc.connect(filt);
      osc.start(t0);
      osc.stop(t0 + 2.05);
    }
    // Sub layer under the wail.
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(base / 2, t0);
    sub.frequency.linearRampToValueAtTime(34, t0 + 2.0);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t0);
    sg.gain.linearRampToValueAtTime(0.16, t0 + 0.2);
    sg.gain.setValueAtTime(0.16, t0 + 1.4);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.0);
    sub.connect(sg);
    sg.connect(master);
    sub.start(t0);
    sub.stop(t0 + 2.05);
  }

  function setVolume(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    volume = Math.min(1, Math.max(0, n));
    if (master) master.gain.value = volume * 0.7;
  }

  return { play, setVolume };
}

/** One event instance. Only created at event START (never per frame — §3.8).
 * @typedef {Object} EventState
 * @property {"horde"|"supply"|"survivor"|"bloodmoon"} type
 * @property {number} duration - hard seconds (P2-K2)
 * @property {number} timeLeft - counts down; clamped ≥ 0 for `active()`
 * @property {number|null} x - representative point (null for bloodmoon)
 * @property {number|null} z
 * @property {string|null} districtId
 * @property {number} fxT - local FX clock (beacon pulse / arm wave)
 * // horde:
 * @property {Array<{x: number, z: number}>} [pool] - host district spawnPoints
 * @property {number} [toSpawn] - runners still queued
 * @property {number} [spawnGap] - seconds between runners (6 / count)
 * @property {number} [spawnTimer]
 * // supply:
 * @property {THREE.Group} [group] - crate + beacon + smoke root
 * @property {THREE.Mesh} [crate]
 * @property {THREE.MeshBasicMaterial} [beaconMat]
 * @property {THREE.Points} [smoke]
 * @property {Float32Array} [smokePos]
 * @property {Float32Array} [smokeSpeed]
 * @property {Float32Array} [smokeAngle]
 * @property {Float32Array} [smokeRadius]
 * @property {Array<import("three").BufferGeometry>} [geos] - disposal list
 * @property {Array<import("three").Material>} [mats] - disposal list
 * @property {number} [fallT]
 * @property {boolean} [landed]
 * @property {boolean} [opening]
 * @property {boolean} [despawning]
 * @property {number} [despawnT]
 * // survivor:
 * @property {THREE.Group} [surv]
 * @property {THREE.Mesh} [arm]
 * @property {Array<import("three").MeshStandardMaterial|import("three").Material>} [surMats]
 * @property {Array<import("../zombies/zombie.js").Zombie|null>} [refs] - 5 ring zombies
 * @property {null|("thanks"|"fall")} [ending] - farewell phase (§3.5)
 * @property {number} [endT] - farewell clock
 * @property {number} [baseY]
 */

export function createEvents(bus, city, audio, hooks, scene) {
  const B = bus || new EventTarget();
  void audio; // §3.3: the horn is self-contained (see header note); audio untouched

  // World scene for supply/survivor visuals (additive 5th param — header note
  // SCENE). Null → events run headless (logic-only) with a one-time warning.
  const sceneRef = /** @type {import("three").Scene|null} */ (scene || null);
  let warnedNoScene = false;
  function warnNoScene() {
    if (warnedNoScene) return;
    warnedNoScene = true;
    console.warn("[events] no scene passed — supply/survivor visuals skipped (integrator: createEvents(bus, city, audio, hooks, scene), docs/EXPANSION-P2.md §3.4.2)");
  }

  const horn = createHorn();
  B.addEventListener("settings-changed", (e) => {
    const d = e && e.detail ? e.detail : {};
    if (d.patch && typeof d.patch.volume === "number") horn.setVolume(d.patch.volume);
  });

  // --- scheduler (§3.2) ---------------------------------------------------------
  /** @type {EventState[]} */
  const activeEvents = [];
  let nextTimer = FIRST_MIN + Math.random() * (FIRST_MAX - FIRST_MIN);
  let lastType = /** @type {string|null} */ (null);
  // NIGHT 30 P3 §3.5: Origin còn sống → scheduler đóng băng (không event mới;
  // event đang chạy vẫn kết tự nhiên). Cờ đặt qua "origin-alive" {alive}.
  let originFight = false;
  let warnedNoSpawnRunner = false;
  let warnedNoSupplyOpened = false;

  // --- player position (drives point selection + E presses) ---------------------
  let px = 0;
  let pz = 0;
  let lastUpdateAt = 0; // freshness guard for E (missions.js:353/1069 pattern)

  // --- scratch (zero per-frame allocation — §3.8) --------------------------------
  const eligibleScratch = /** @type {Array<{x: number, z: number}>} */ ([]);
  // `active()` returns a REUSED snapshot (main reads it per frame; shape frozen).
  const snapshot = /** @type {EventSnapshot} */ ({ type: "horde", timeLeft: 0 });
  let snapshotValid = false;

  function emit(name, detail) {
    B.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function isBloodmoonActive() {
    for (let i = 0; i < activeEvents.length; i++) {
      if (activeEvents[i].type === "bloodmoon") return true;
    }
    return false;
  }

  function refreshSnapshot() {
    const ev = activeEvents[activeEvents.length - 1];
    if (!ev) {
      snapshotValid = false;
      return;
    }
    snapshot.type = ev.type;
    snapshot.timeLeft = Math.max(0, ev.timeLeft);
    snapshotValid = true;
  }

  /** Weighted roll over every type except `lastType` (§3.2 — no 2× in a row). */
  function pickType() {
    let total = 0;
    for (let i = 0; i < WEIGHTS.length; i++) {
      if (WEIGHTS[i].type !== lastType) total += WEIGHTS[i].w;
    }
    let r = Math.random() * total;
    for (let i = 0; i < WEIGHTS.length; i++) {
      const w = WEIGHTS[i];
      if (w.type === lastType) continue;
      r -= w.w;
      if (r < 0) return w.type;
    }
    return "horde"; // unreachable (total > 0) — defensive
  }

  // --- opened districts (P2-K10) --------------------------------------------------
  /** Player's district id, or null without a city / in the void. */
  function playerDistrict() {
    if (!city || typeof city.districtAt !== "function") return null;
    try {
      return city.districtAt(px, pz) || null;
    } catch {
      return null;
    }
  }

  /**
   * Districts reachable from "safehouse" through OPEN gates that have a spawn
   * pool (P2-K10/K11 — quarantine self-excludes via its empty spawnPoints).
   * Live read per call (event starts are rare; no listener needed).
   * @returns {Array<import("../world/city.js").District>}
   */
  function openedHosts() {
    /** @type {Array<import("../world/city.js").District>} */
    const hosts = [];
    if (!city || !Array.isArray(city.districts) || typeof city.gateBetween !== "function") {
      return hosts;
    }
    const byId = /** @type {Map<string, import("../world/city.js").District>} */ (new Map());
    for (let i = 0; i < city.districts.length; i++) {
      const d = city.districts[i];
      if (d && typeof d.id === "string") byId.set(d.id, d);
    }
    if (!byId.has("safehouse")) return hosts;
    const seen = new Set(["safehouse"]);
    const queue = ["safehouse"];
    while (queue.length > 0) {
      const id = /** @type {string} */ (queue.shift());
      const d = byId.get(id);
      if (d && Array.isArray(d.spawnPoints) && d.spawnPoints.length > 0) hosts.push(d);
      if (!d || !Array.isArray(d.gates)) continue;
      for (let i = 0; i < d.gates.length; i++) {
        const to = d.gates[i] && d.gates[i].to;
        if (typeof to !== "string" || seen.has(to) || !byId.has(to)) continue;
        let gate = null;
        try {
          gate = city.gateBetween(id, to); // unordered pair per P1 §3.6.1
        } catch {
          gate = null;
        }
        if (gate && gate.open) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    return hosts;
  }

  /**
   * Random pool point ≥ MIN_DIST from the player into `out` (cleared first);
   * none qualifies → the single farthest point (waves.js:510-531 pattern).
   * @param {Array<{x: number, z: number}>} pool
   * @param {Array<{x: number, z: number}>} out - scratch, reused per call
   * @returns {{x: number, z: number}|null}
   */
  function eligiblePoints(pool, out) {
    out.length = 0;
    if (!pool || pool.length === 0) return null;
    let far = null;
    let farD = -1;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      const dx = p.x - px;
      const dz = p.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= MIN_DIST * MIN_DIST) out.push(p);
      if (d2 > farD) {
        farD = d2;
        far = p;
      }
    }
    if (out.length > 0) return out[(Math.random() * out.length) | 0];
    return far;
  }

  /**
   * Supply/survivor spot: player in quarantine (or void) → the NEAREST opened
   * host with an eligible point (P2-K11); otherwise a random eligible point
   * across ALL opened hosts (§3.4.1 "điểm NGẪU NHIÊN"). Nothing ≥ 15 m
   * anywhere → the nearest host's farthest point (§3.2 fallback).
   */
  function pickSpot() {
    const hosts = openedHosts();
    if (hosts.length === 0) return null;
    const pDist = playerDistrict();
    const quarantineCase = pDist === "quarantine" || pDist === null;
    let nearest = null;
    let nearestD = Infinity;
    for (let i = 0; i < hosts.length; i++) {
      const c = hosts[i].center;
      const dx = c.x - px;
      const dz = c.z - pz;
      const d = dx * dx + dz * dz;
      if (d < nearestD) {
        nearestD = d;
        nearest = hosts[i];
      }
    }
    if (quarantineCase && nearest) {
      // eligiblePoints already falls back to the farthest point of the pool.
      const p = eligiblePoints(nearest.spawnPoints, eligibleScratch);
      return p ? { district: nearest, point: p } : null;
    }
    // Random host order (Fisher–Yates over the tiny host list at event start).
    const order = hosts.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    for (let i = 0; i < order.length; i++) {
      const p = eligiblePoints(order[i].spawnPoints, eligibleScratch);
      if (p) return { district: order[i], point: p };
    }
    return nearest ? { district: nearest, point: eligiblePoints(nearest.spawnPoints, eligibleScratch) } : null;
  }

  // --- event lifecycle -------------------------------------------------------------
  function endEvent(ev, reason, money) {
    const i = activeEvents.indexOf(ev);
    if (i !== -1) activeEvents.splice(i, 1);
    const detail = /** @type {Record<string, unknown>} */ ({ type: ev.type, reason });
    if (typeof money === "number" && Number.isFinite(money)) detail.money = money;
    emit("event-end", detail);
    if (ev.type === "bloodmoon") {
      emit("bloodmoon-active", { active: false, duration: DURATIONS.bloodmoon });
    }
    refreshSnapshot();
  }

  /**
   * Start `type` now. Bloodmoon rules (§3.2): bloodmoon only from an empty
   * board; every other type is blocked while bloodmoon runs. Returns the
   * EventState or null when blocked.
   * @param {string} type
   * @returns {EventState|null}
   */
  function startEvent(type) {
    if (type === "bloodmoon") {
      if (activeEvents.length > 0) return null;
      /** @type {EventState} */
      const ev = { type, duration: DURATIONS.bloodmoon, timeLeft: DURATIONS.bloodmoon, x: null, z: null, districtId: null };
      activeEvents.push(ev);
      emit("event-start", { type, timeLeft: ev.timeLeft, x: null, z: null, districtId: null });
      emit("bloodmoon-active", { active: true, duration: DURATIONS.bloodmoon });
      refreshSnapshot();
      return ev;
    }
    if (isBloodmoonActive()) return null;
    if (type === "horde") return startHorde();
    if (type === "supply") return startSupply();
    if (type === "survivor") return startSurvivor();
    return null;
  }

  // --- visual teardown (§3.7) -------------------------------------------------------
  function disposeEventVisual(ev) {
    if (ev.group) {
      if (sceneRef) sceneRef.remove(ev.group);
      ev.group = undefined;
    }
    if (ev.surv) {
      if (sceneRef) sceneRef.remove(ev.surv);
      ev.surv = undefined;
    }
    if (ev.geos) {
      for (let i = 0; i < ev.geos.length; i++) ev.geos[i].dispose();
      ev.geos = undefined;
    }
    if (ev.mats) {
      for (let i = 0; i < ev.mats.length; i++) ev.mats[i].dispose();
      ev.mats = undefined;
    }
    ev.crate = undefined;
    ev.beaconMat = undefined;
    ev.smoke = undefined;
    ev.smokePos = undefined;
    ev.smokeSpeed = undefined;
    ev.smokeAngle = undefined;
    ev.smokeRadius = undefined;
    ev.arm = undefined;
    ev.surMats = undefined;
  }

  // --- "horde" (§3.3) ---------------------------------------------------------------
  function startHorde() {
    const pDist = playerDistrict();
    const hosts = openedHosts();
    if (hosts.length === 0) return null; // cannot happen (safehouse has a pool)
    const others = [];
    for (let i = 0; i < hosts.length; i++) {
      if (hosts[i].id !== pDist) others.push(hosts[i]);
    }
    // P2-K12: prefer a DIFFERENT opened district; the only host IS the player's
    // district (mission 1) → fall back to it so the horde still happens.
    const host = others.length > 0 ? others[(Math.random() * others.length) | 0] : hosts[0];
    const pool = /** @type {Array<{x: number, z: number}>} */ (host.spawnPoints);
    const anchor = eligiblePoints(pool, eligibleScratch);
    if (!anchor) return null;
    const mission = hooks && typeof hooks.activeMission === "function" ? Number(hooks.activeMission()) : 0;
    const m = Number.isFinite(mission) ? Math.min(Math.max(Math.floor(mission), 0), 9) : 0;
    const count = 8 + Math.floor(m / 2); // §3.3.2 / P2-K3

    /** @type {EventState} */
    const ev = {
      type: "horde",
      duration: DURATIONS.horde,
      timeLeft: DURATIONS.horde,
      x: anchor.x,
      z: anchor.z,
      districtId: host.id,
      pool,
      toSpawn: count,
      spawnGap: HORDE_BURST / count,
      spawnTimer: HORDE_BURST / count, // first runner one gap after the banner
    };
    activeEvents.push(ev);
    emit("event-start", { type: "horde", timeLeft: ev.timeLeft, x: ev.x, z: ev.z, districtId: ev.districtId });
    horn.play(); // 2 s synth wail (§3.3.1)
    refreshSnapshot();
    return ev;
  }

  function spawnHordeRunner(ev) {
    if (!hooks || typeof hooks.spawnRunner !== "function") {
      if (!warnedNoSpawnRunner) {
        warnedNoSpawnRunner = true;
        console.warn("[events] hooks.spawnRunner missing — horde spawns skipped (integrator must pass hooks, docs/EXPANSION-P2.md §3.1)");
      }
      return;
    }
    const p = eligiblePoints(ev.pool, eligibleScratch);
    if (!p) return;
    // Events-side scatter ±1 m; real jitter + isBlocked live in the main hook.
    const jx = p.x + (Math.random() * 2 - 1);
    const jz = p.z + (Math.random() * 2 - 1);
    hooks.spawnRunner(jx, jz); // horde runners are fire-and-forget (§3.3.3)
  }

  function updateHorde(ev, dt) {
    ev.timeLeft -= dt;
    if (ev.toSpawn > 0) {
      ev.spawnTimer -= dt;
      while (ev.spawnTimer <= 0 && ev.toSpawn > 0) {
        spawnHordeRunner(ev);
        ev.toSpawn--;
        ev.spawnTimer += ev.spawnGap;
      }
    }
    if (ev.timeLeft <= 0) endEvent(ev, "done");
  }

  // --- "supply" (§3.4) ----------------------------------------------------------------
  function startSupply() {
    const spot = pickSpot();
    if (!spot || !spot.point) return null;
    if (!sceneRef) warnNoScene();
    const p = spot.point;
    const geos = /** @type {Array<import("three").BufferGeometry>} */ ([]);
    const mats = /** @type {Array<import("three").Material>} */ ([]);
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);

    // Crate: falls 20 m → ground; rests on its half-height.
    const crateGeo = new THREE.BoxGeometry(CRATE_SIZE, CRATE_SIZE, CRATE_SIZE);
    const crateMat = new THREE.MeshLambertMaterial({ color: CRATE_COLOR });
    geos.push(crateGeo);
    mats.push(crateMat);
    const crate = new THREE.Mesh(crateGeo, crateMat);
    crate.castShadow = true;
    crate.position.y = SUPPLY_FALL_H;
    group.add(crate);
    // Dark trim band so the box reads as a crate, not a cube (child of the
    // crate → rides the fall and the despawn scale for free).
    const trimGeo = new THREE.BoxGeometry(CRATE_SIZE + 0.06, 0.16, CRATE_SIZE + 0.06);
    const trimMat = new THREE.MeshLambertMaterial({ color: CRATE_TRIM_COLOR });
    geos.push(trimGeo);
    mats.push(trimMat);
    const trim = new THREE.Mesh(trimGeo, trimMat);
    crate.add(trim);

    // Beacon: additive glow pillar (missions.js:870-886 pattern), red-amber.
    const beaconGeo = new THREE.CylinderGeometry(0.4, 0.4, BEACON_H, 10, 1, true);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: BEACON_COLOR,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    geos.push(beaconGeo);
    mats.push(beaconMat);
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.y = BEACON_H / 2;
    group.add(beacon);

    // Red smoke: 24 self-recycling points, ONE draw call (§3.4.2 / §3.8).
    const smokePos = new Float32Array(SMOKE_COUNT * 3);
    const smokeSpeed = new Float32Array(SMOKE_COUNT);
    const smokeAngle = new Float32Array(SMOKE_COUNT);
    const smokeRadius = new Float32Array(SMOKE_COUNT);
    for (let i = 0; i < SMOKE_COUNT; i++) {
      smokeAngle[i] = Math.random() * Math.PI * 2;
      smokeRadius[i] = 0.15 + Math.random() * 0.45;
      smokeSpeed[i] = 0.5 + Math.random() * 0.7;
      smokePos[i * 3] = Math.cos(smokeAngle[i]) * smokeRadius[i];
      smokePos[i * 3 + 1] = Math.random() * 4;
      smokePos[i * 3 + 2] = Math.sin(smokeAngle[i]) * smokeRadius[i];
    }
    const smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute("position", new THREE.BufferAttribute(smokePos, 3));
    const smokeMat = new THREE.PointsMaterial({
      color: SMOKE_COLOR,
      size: 0.5,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    geos.push(smokeGeo);
    mats.push(smokeMat);
    const smoke = new THREE.Points(smokeGeo, smokeMat);
    smoke.frustumCulled = false;
    group.add(smoke);

    if (sceneRef) sceneRef.add(group);

    /** @type {EventState} */
    const ev = {
      type: "supply",
      duration: DURATIONS.supply,
      timeLeft: DURATIONS.supply,
      x: p.x,
      z: p.z,
      districtId: spot.district.id,
      group,
      crate,
      beaconMat,
      smoke,
      smokePos,
      smokeSpeed,
      smokeAngle,
      smokeRadius,
      geos,
      mats,
      fallT: 0,
      landed: false,
      opening: false,
      despawning: false,
      despawnT: 0,
      fxT: 0,
    };
    activeEvents.push(ev);
    emit("event-start", { type: "supply", timeLeft: ev.timeLeft, x: ev.x, z: ev.z, districtId: ev.districtId });
    refreshSnapshot();
    return ev;
  }

  /** Advance the smoke particles in place (allocation-free). */
  function updateSmoke(ev, dt) {
    for (let i = 0; i < SMOKE_COUNT; i++) {
      let y = ev.smokePos[i * 3 + 1] + ev.smokeSpeed[i] * dt;
      if (y > 4.2) {
        y = 0.15;
        ev.smokeAngle[i] = Math.random() * Math.PI * 2;
        ev.smokeRadius[i] = 0.15 + Math.random() * 0.45;
      }
      ev.smokePos[i * 3 + 1] = y;
      ev.smokePos[i * 3] = Math.cos(ev.smokeAngle[i]) * ev.smokeRadius[i];
      ev.smokePos[i * 3 + 2] = Math.sin(ev.smokeAngle[i]) * ev.smokeRadius[i];
    }
    if (ev.smoke && ev.smoke.geometry) {
      ev.smoke.geometry.getAttribute("position").needsUpdate = true;
    }
  }

  function updateSupply(ev, dt) {
    ev.timeLeft -= dt;
    ev.fxT += dt;
    if (ev.crate) {
      if (!ev.landed) {
        // Ease-in fall from 20 m over 4 s (§3.4.2 — gravity-like).
        ev.fallT += dt;
        const k = Math.min(1, ev.fallT / SUPPLY_FALL_T);
        const y = SUPPLY_FALL_H * (1 - k) * (1 - k) + CRATE_SIZE / 2;
        ev.crate.position.y = y;
        if (k >= 1) {
          ev.landed = true;
          ev.crate.position.y = CRATE_SIZE / 2;
        }
      } else if (ev.timeLeft <= 0 && !ev.opening) {
        // Nobody opened it in 90 s — scale to zero then remove (§3.4.4).
        ev.despawning = true;
        ev.despawnT += dt;
        const k = Math.min(1, ev.despawnT / SUPPLY_DESPAWN_T);
        const s = Math.max(0.001, 1 - k);
        ev.crate.scale.setScalar(s);
        if (ev.beaconMat) ev.beaconMat.opacity = 0.28 * s;
        if (ev.smoke && ev.smoke.material) {
          const m = /** @type {THREE.PointsMaterial} */ (ev.smoke.material);
          m.opacity = 0.5 * s;
        }
        if (k >= 1) {
          disposeEventVisual(ev);
          endEvent(ev, "despawned");
          return;
        }
      }
    }
    if (ev.beaconMat) {
      ev.beaconMat.opacity = 0.2 + 0.12 * (0.5 + 0.5 * Math.sin(ev.fxT * 2.2));
    }
    if (ev.landed && !ev.despawning) updateSmoke(ev, dt);
  }

  /** Single near-state for the logical "item_supply" target (stacked crates
   *  share one HUD chip; E opens the NEAREST within 2 m — §3.4.5). */
  let supplyNear = false;
  function updateSupplyNear() {
    let near = false;
    for (let i = 0; i < activeEvents.length; i++) {
      const ev = activeEvents[i];
      if (ev.type !== "supply" || !ev.landed || ev.opening || ev.despawning) continue;
      const dx = ev.x - px;
      const dz = ev.z - pz;
      if (dx * dx + dz * dz <= SUPPLY_HINT_R * SUPPLY_HINT_R) {
        near = true;
        break;
      }
    }
    if (near !== supplyNear) {
      supplyNear = near;
      emit("interact-near", { target: "item_supply", near });
    }
  }

  function openSupply(ev) {
    if (ev.opening || ev.despawning || !ev.landed) return;
    ev.opening = true;
    let money;
    if (hooks && typeof hooks.supplyOpened === "function") {
      // P2-K5: main applies the loot directly (economy.add + "pickup" health +
      // full current-weapon ammo). A returned finite number feeds the toast.
      const r = /** @type {any} */ (hooks.supplyOpened(ev.x, ev.z));
      if (typeof r === "number" && Number.isFinite(r)) money = Math.round(r);
    } else if (!warnedNoSupplyOpened) {
      warnedNoSupplyOpened = true;
      console.warn("[events] hooks.supplyOpened missing — supply loot skipped (integrator must pass hooks, docs/EXPANSION-P2.md §3.1)");
    }
    disposeEventVisual(ev);
    endEvent(ev, "opened", money);
  }

  // --- "survivor" (§3.5) ---------------------------------------------------------------
  function startSurvivor() {
    const spot = pickSpot();
    if (!spot || !spot.point) return null;
    if (!sceneRef) warnNoScene();
    const p = spot.point;
    const geos = /** @type {Array<import("three").BufferGeometry>} */ ([]);
    const mats = /** @type {Array<import("three").Material>} */ ([]);

    // Low-poly survivor: body + head + 2 legs + static arm merged into ONE
    // geometry (1 draw call) + the waving arm as the second (§3.5.2 ≤ 2 draws).
    const bodyGeo = new THREE.BoxGeometry(0.48, 0.6, 0.26);
    bodyGeo.translate(0, 0.85, 0);
    const headGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    headGeo.translate(0, 1.3, 0);
    const legLGeo = new THREE.BoxGeometry(0.16, 0.55, 0.18);
    legLGeo.translate(-0.12, 0.275, 0);
    const legRGeo = new THREE.BoxGeometry(0.16, 0.55, 0.18);
    legRGeo.translate(0.12, 0.275, 0);
    const armStaticGeo = new THREE.BoxGeometry(0.12, 0.5, 0.14);
    armStaticGeo.translate(0.31, 0.95, 0);
    // Vertex colors fold the skin head into the merged body — one draw for
    // body+head+legs+static arm (§3.5.2 ≤ 2 draws with the waving arm; the
    // old third mesh was a redundant skin cap).
    const tintVerts = (geo, hex) => {
      const c = new THREE.Color(hex);
      const n = geo.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    };
    tintVerts(bodyGeo, SURVIVOR_COLOR);
    tintVerts(headGeo, SURVIVOR_SKIN);
    tintVerts(legLGeo, SURVIVOR_COLOR);
    tintVerts(legRGeo, SURVIVOR_COLOR);
    tintVerts(armStaticGeo, SURVIVOR_COLOR);
    const merged = mergeGeometries([bodyGeo, headGeo, legLGeo, legRGeo, armStaticGeo], false);
    bodyGeo.dispose();
    headGeo.dispose();
    legLGeo.dispose();
    legRGeo.dispose();
    armStaticGeo.dispose();
    if (!merged) return null; // BufferGeometryUtils malformed: skip, no crash
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, transparent: true });
    geos.push(merged);
    mats.push(bodyMat);
    const body = new THREE.Mesh(merged, bodyMat);
    body.castShadow = true;
    // Waving arm: pivot at the shoulder, geometry extends +Y from it.
    const armGeo = new THREE.BoxGeometry(0.12, 0.5, 0.14);
    armGeo.translate(0, 0.25, 0);
    tintVerts(armGeo, SURVIVOR_COLOR);
    geos.push(armGeo);
    const arm = new THREE.Mesh(armGeo, bodyMat);
    arm.position.set(-0.31, 1.18, 0);
    arm.castShadow = true;

    const group = new THREE.Group();
    group.add(body);
    group.add(arm);
    group.position.set(p.x, 0, p.z);
    if (sceneRef) sceneRef.add(group);

    /** @type {EventState} */
    const ev = {
      type: "survivor",
      duration: DURATIONS.survivor,
      timeLeft: DURATIONS.survivor,
      x: p.x,
      z: p.z,
      districtId: spot.district.id,
      surv: group,
      arm,
      geos,
      mats,
      surMats: [bodyMat, headMat],
      refs: /** @type {Array<import("../zombies/zombie.js").Zombie|null>} */ ([]),
      ending: null,
      endT: 0,
      fxT: 0,
    };
    activeEvents.push(ev);
    emit("event-start", { type: "survivor", timeLeft: ev.timeLeft, x: ev.x, z: ev.z, districtId: ev.districtId });
    spawnSurvivorRing(ev);
    refreshSnapshot();
    return ev;
  }

  /** 5 runners on a ring around the survivor (§3.5.3). Near-side points are
   *  pushed to the outer radius — best-effort "≥ 12 m from the player". */
  function spawnSurvivorRing(ev) {
    if (!hooks || typeof hooks.spawnRunner !== "function") {
      if (!warnedNoSpawnRunner) {
        warnedNoSpawnRunner = true;
        console.warn("[events] hooks.spawnRunner missing — survivor besiegers skipped (integrator must pass hooks, docs/EXPANSION-P2.md §3.1)");
      }
      return;
    }
    const phase = Math.random() * Math.PI * 2;
    for (let i = 0; i < 5; i++) {
      const a = phase + (i * Math.PI * 2) / 5;
      let r = SURV_RING_R;
      const zx0 = ev.x + Math.cos(a) * r;
      const zz0 = ev.z + Math.sin(a) * r;
      const dx0 = zx0 - px;
      const dz0 = zz0 - pz;
      if (dx0 * dx0 + dz0 * dz0 < SURV_PLAYER_SAFE * SURV_PLAYER_SAFE) r = SURV_RING_R_FAR;
      const jx = ev.x + Math.cos(a) * r + (Math.random() * 0.6 - 0.3);
      const jz = ev.z + Math.sin(a) * r + (Math.random() * 0.6 - 0.3);
      const z = hooks.spawnRunner(jx, jz);
      ev.refs.push(z || null); // null → counted dead (survivor rescued early, §3.1)
    }
  }

  function updateSurvivor(ev, dt) {
    ev.fxT += dt;
    if (ev.ending) {
      // Farewell: 1 s grateful wave (thanks) or a 0.4 s topple (fall), then a
      // 1.5 s fade + remove → event-end (zombie.js:511-527 pattern, §3.5).
      ev.endT += dt;
      if (ev.ending === "thanks") {
        if (ev.arm) ev.arm.rotation.z = 2.6 + 0.5 * Math.sin(ev.fxT * 31.4); // double-speed wave
        if (ev.surv) ev.surv.position.y = Math.abs(Math.sin(ev.endT * 6.3)) * 0.08;
      } else {
        const k = Math.min(1, ev.endT / SURV_FALL_T);
        if (ev.surv) {
          ev.surv.rotation.x = -(Math.PI / 2) * k; // ~90° topple (§3.5.5)
          ev.surv.position.y = -0.25 * k; // sink into the dirt
        }
      }
      const fadeStart = ev.ending === "thanks" ? SURV_FAREWELL_T : SURV_FALL_T;
      if (ev.endT > fadeStart && ev.surMats) {
        const k = Math.min(1, (ev.endT - fadeStart) / FADE_T);
        for (let i = 0; i < ev.surMats.length; i++) {
          /** @type {THREE.MeshLambertMaterial} */ (ev.surMats[i]).opacity = 1 - k;
        }
      }
      if (ev.endT >= fadeStart + FADE_T) {
        disposeEventVisual(ev);
        endEvent(ev, ev.ending === "thanks" ? "rescued" : "lost");
      }
      return;
    }

    // Live phase: continuous wave (§3.5.2, ~2.5 Hz) + rescue / timeout checks.
    if (ev.arm) ev.arm.rotation.z = 2.6 + 0.45 * Math.sin(ev.fxT * 15.7);
    ev.timeLeft -= dt;

    let anyAlive = false;
    for (let i = 0; i < ev.refs.length; i++) {
      const z = ev.refs[i];
      if (z && z.alive === true) {
        anyAlive = true;
        break;
      }
    }
    if (!anyAlive) {
      const dx = px - ev.x;
      const dz = pz - ev.z;
      if (dx * dx + dz * dz < RESCUE_R * RESCUE_R) {
        // Rescue fires NOW (money + dialogue + medkit via main, §3.5.4/§8.5);
        // the farewell animation runs to removal, which emits "event-end".
        ev.ending = "thanks";
        ev.endT = 0;
        emit("survivor-rescued", { x: ev.x, z: ev.z });
        return;
      }
    }
    if (ev.timeLeft <= 0) {
      // Ignored for 90 s — the besiegers win (§3.5.5).
      ev.ending = "fall";
      ev.endT = 0;
    }
  }

  // --- scheduler tick (§3.2) -----------------------------------------------------------
  function tickScheduler(dt) {
    // NIGHT 30 P3 §3.5: Origin fight → TẠM DỪNG. Early-return TRƯỚC khi giảm
    // nextTimer (timer giữ nguyên) — không event mới; event đang chạy ở
    // update() dưới vẫn đếm thời lượng tự nhiên đến "event-end".
    if (originFight) return;
    nextTimer -= dt;
    if (nextTimer > 0) return;
    // Due, but bloodmoon excludes every other event (§3.2): hold the due timer
    // and retry on every update until the board is clear.
    if (isBloodmoonActive()) return;
    const type = pickType();
    const ev = startEvent(type);
    if (!ev) return; // defensive: retry next frame (cooldown stays due)
    lastType = type;
    nextTimer = COOLDOWN_MIN + Math.random() * (COOLDOWN_MAX - COOLDOWN_MIN);
  }

  // --- public API -----------------------------------------------------------------------
  function update(dt, playerPos) {
    // Freshness stamp FIRST (missions.js:1069 pattern): a stale press means
    // update() was not running (pause/menu/intro) and E must be ignored.
    lastUpdateAt = performance.now();
    if (playerPos && Number.isFinite(playerPos.x) && Number.isFinite(playerPos.z)) {
      px = playerPos.x;
      pz = playerPos.z;
    }
    if (!Number.isFinite(dt) || dt <= 0) return;

    tickScheduler(dt);
    for (let i = activeEvents.length - 1; i >= 0; i--) {
      const ev = activeEvents[i];
      if (i >= activeEvents.length) continue; // endEvent spliced during a nested dispatch
      if (ev.type === "horde") updateHorde(ev, dt);
      else if (ev.type === "supply") updateSupply(ev, dt);
      else if (ev.type === "survivor") updateSurvivor(ev, dt);
      // bloodmoon has no per-frame body — duration drives event-end below.
      else if (ev.type === "bloodmoon") {
        ev.timeLeft -= dt;
        if (ev.timeLeft <= 0) endEvent(ev, "done");
      }
    }
    // Hint chip recompute lives on the frame tail so it also fires when a
    // crate LEFT the board (opened/despawned) — "interact-near" on state
    // change only (missions.js:1159-1173 pattern).
    updateSupplyNear();
    refreshSnapshot();
  }

  function forceEvent(type) {
    const t = typeof type === "string" ? type : "";
    if (t !== "horde" && t !== "supply" && t !== "survivor" && t !== "bloodmoon") return false;
    // Bloodmoon rules still apply (§3.2 / §8.7): bloodmoon needs an empty
    // board, everything else is blocked while bloodmoon runs.
    const ev = startEvent(t);
    if (!ev) return false;
    // §3.2: ANY event start arms the 45–120 s rest — a debug-forced event
    // counts, otherwise a due scheduler would cascade right behind it.
    lastType = t;
    nextTimer = COOLDOWN_MIN + Math.random() * (COOLDOWN_MAX - COOLDOWN_MIN);
    return true;
  }

  function active() {
    return snapshotValid ? snapshot : null;
  }

  function reset() {
    // Snapshot + clear FIRST (waves.reset pattern): endEvent splices while we
    // emit, which would otherwise skip entries.
    const list = activeEvents.slice();
    activeEvents.length = 0;
    // Bloodmoon-off goes out FIRST (§3.7) so waves/economy/atmosphere drop
    // their multipliers before any other cleanup event lands.
    for (let i = 0; i < list.length; i++) {
      const ev = list[i];
      if (ev.type !== "bloodmoon") continue;
      emit("bloodmoon-active", { active: false, duration: DURATIONS.bloodmoon, reason: "reset" });
      emit("event-end", { type: "bloodmoon", reason: "reset" });
    }
    for (let i = 0; i < list.length; i++) {
      const ev = list[i];
      if (ev.type === "bloodmoon") continue; // no visuals, already announced
      emit("event-end", { type: ev.type, reason: "reset" });
    }
    for (let i = 0; i < list.length; i++) disposeEventVisual(list[i]);
    if (supplyNear) {
      supplyNear = false;
      emit("interact-near", { target: "item_supply", near: false }); // clear the HUD chip
    }
    nextTimer = FIRST_MIN + Math.random() * (FIRST_MAX - FIRST_MIN);
    lastType = null;
    originFight = false; // P3 §3.5: fresh-run state — scheduler mở lại
    refreshSnapshot();
  }

  // E opens the NEAREST landed crate within 2 m (§3.4.3/§3.4.5). The
  // freshness guard ignores presses from menus/pause (missions.js:1069).
  B.addEventListener("interact-press", () => {
    if (performance.now() - lastUpdateAt > PRESS_STALE_MS) return;
    let best = null;
    let bestD = SUPPLY_OPEN_R * SUPPLY_OPEN_R;
    for (let i = 0; i < activeEvents.length; i++) {
      const ev = activeEvents[i];
      if (ev.type !== "supply" || !ev.landed || ev.opening || ev.despawning) continue;
      const dx = ev.x - px;
      const dz = ev.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 <= bestD) {
        bestD = d2;
        best = ev;
      }
    }
    if (best) openSupply(best);
  });

  // Defensive fresh-run (§3.7, P2-K15): events are WORLD state — they always
  // reset on a fresh-run entry, story-keep or not (§8.3). main.js's direct
  // events.reset() in freshRun() stays the canonical call; reset is idempotent.
  B.addEventListener("ui-play", reset);
  B.addEventListener("ui-restart", reset);
  B.addEventListener("ui-play-free", reset);

  // NIGHT 30 P3 §3.5: Origin phát "origin-alive" {alive:true|false} khi rise
  // bắt đầu / chết hoặc dispose (origin.js) — scheduler đóng băng đúng lúc,
  // không đụng gì khác (forceEvent là debug API, hành vi giữ nguyên).
  B.addEventListener("origin-alive", (e) => {
    const d = e && /** @type {CustomEvent} */ (e).detail ? /** @type {CustomEvent} */ (e).detail : {};
    originFight = d.alive === true;
  });

  return { update, forceEvent, active, reset };
}
