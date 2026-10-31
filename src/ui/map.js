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
// Implementation — Builder MAP/UI (docs/EXPANSION-P2.md §4, checklist §10).
// =============================================================================

// World window + paint budget (§4.2): the square spans ±140 m (city ±130 +
// breathing room), keeping a MARGIN rim on screen.
const WORLD_MIN = -140;
const WORLD_SPAN = 280;
const WORLD_MAX = WORLD_MIN + WORLD_SPAN;
const MARGIN = 40;
const TAU = Math.PI * 2;

// Palette — §4.2 verbatim. The two *_HERE variants are the "current district
// brighter ~×1.4" read of the base colors; gate colors mirror city.js's
// GATE_GREEN / GATE_RED emissives so canvas and world agree.
const COL_LOCKED = "rgba(96, 22, 22, 0.60)";
const COL_OPEN = "rgba(56, 84, 66, 0.55)";
const COL_LOCKED_HERE = "rgba(134, 31, 31, 0.66)";
const COL_OPEN_HERE = "rgba(78, 118, 92, 0.66)";
const COL_CURRENT_EDGE = "#ffd35e";
const COL_GRID = "rgba(255, 255, 255, 0.05)";
const COL_PLAYER = "#f4f7ff";
const COL_MISSION = "#ffd35e";
const COL_HORDE = "#ff4d3d";
const COL_SUPPLY = "#ffab3d";
const COL_SURVIVOR = "#6fe08a";
const COL_BLOOD_WASH = "rgba(170, 24, 24, 0.12)";
const GATE_OPEN_COL = "#3dff6e";
const GATE_LOCKED_COL = "#ff3b30";

// Static paint helpers' data (pre-allocated — nothing per draw).
const AXIS_TICKS = [-120, -40, 40, 120]; // ≤ 12 labels total (§4.2)
const HORDE_DASH = [6, 5];
const NO_DASH = [];

/** "butcher" → "The Butcher" — hud bundle "boss<Cap>" first, then the
 * bosses.js nested bundle ("boss.<type>"), then the raw id (never-throw). */
function bossLabel(type) {
  const t = String(type || "");
  if (!t) return "";
  const k1 = "boss" + t.charAt(0).toUpperCase() + t.slice(1);
  const v1 = i18n.t(k1);
  if (v1 !== k1) return v1;
  const k2 = "boss." + t;
  const v2 = i18n.t(k2);
  return v2 !== k2 ? v2 : t;
}

/** Small filled diamond path around (x, y). */
function diamondPath(g, x, y, r) {
  g.moveTo(x, y - r);
  g.lineTo(x + r, y);
  g.lineTo(x, y + r);
  g.lineTo(x - r, y);
  g.closePath();
}

export function createMap(container, bus, city) {
  if (!container || typeof container.appendChild !== "function") {
    throw new Error("createMap: container (#ui) is required");
  }

  // --- DOM: one canvas, created ONCE, self-styled inline (style.css frozen;
  // #ui keeps pointer-events: none — the map is read-only, never clickable).
  const canvas = document.createElement("canvas");
  const cs = canvas.style;
  cs.position = "absolute";
  cs.inset = "0";
  cs.zIndex = "50";
  cs.background = "rgba(2, 4, 8, 0.82)";
  cs.display = "none";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // District records (static layout; gate `open` state is live on city).
  const EMPTY_DISTRICTS = [];
  const districts =
    city && Array.isArray(city.districts) ? city.districts : EMPTY_DISTRICTS;
  const byId = new Map();
  for (let i = 0; i < districts.length; i++) {
    const d = districts[i];
    if (d && d.id) byId.set(d.id, d);
  }
  const gateBetween =
    city && typeof city.gateBetween === "function"
      ? (a, b) => city.gateBetween(a, b)
      : null;
  const districtAt =
    city && typeof city.districtAt === "function"
      ? (x, z) => city.districtAt(x, z)
      : null;

  // --- state ------------------------------------------------------------------
  let open = false;
  let lastPlayer = null; // last update() args — repaint-on-toggle safety net
  let lastExtras = null;
  let lastStamp = 0; // performance.now() of the previous draw (cache decay)

  // District display names, cached per language (§4.2 — invalidate on lang).
  let nameLang = "";
  const names = new Map();

  // Event marker cache keyed by type (§4.2: map listens "event-start"/
  // "event-end"/"bloodmoon-active" for timeLeft even though extras only
  // carries coordinates). Values are mutated in place.
  /** @type {Map<string, {type: string, x: number|null, z: number|null, timeLeft: number}>} */
  const eventCache = new Map();

  // BFS scratch for the "ĐÃ MỞ" set (P2-K10 — reachable from "safehouse"
  // through open gates; safehouse itself always counts as open).
  const reachable = new Set();
  const bfsQueue = [];

  // --- cache helpers ------------------------------------------------------------

  function refreshNames() {
    const l =
      typeof i18n.getLang === "function" ? i18n.getLang() : "en";
    if (l === nameLang && names.size > 0) return;
    nameLang = l;
    names.clear();
    for (let i = 0; i < districts.length; i++) {
      const d = districts[i];
      if (!d || !d.id) continue;
      const key = d.nameKey || "district_" + d.id;
      const v = i18n.t(key);
      names.set(d.id, v === key ? String(d.id) : v); // fallback raw id (§4.2)
    }
  }

  /** @returns {Set<string>} ids reachable from safehouse via OPEN gates. */
  function computeReachable() {
    reachable.clear();
    bfsQueue.length = 0;
    reachable.add("safehouse"); // P2-K10: safehouse luôn là mở
    bfsQueue.push("safehouse");
    if (!gateBetween) return reachable;
    while (bfsQueue.length > 0) {
      const cur = bfsQueue.pop();
      const d = byId.get(cur);
      if (!d || !d.gates) continue;
      for (let i = 0; i < d.gates.length; i++) {
        const to = d.gates[i] && d.gates[i].to;
        if (!to || reachable.has(to)) continue;
        const g = gateBetween(cur, to);
        if (g && g.open) {
          reachable.add(to);
          bfsQueue.push(to);
        }
      }
    }
    return reachable;
  }

  /** Upsert one event cache entry; NaN x/z/timeLeft keeps the old value. */
  function upsertEvent(type, x, z, timeLeft) {
    let e = eventCache.get(type);
    if (!e) {
      e = { type, x: null, z: null, timeLeft: 0 };
      eventCache.set(type, e);
    }
    if (Number.isFinite(x) && Number.isFinite(z)) {
      e.x = x;
      e.z = z;
    }
    if (Number.isFinite(timeLeft) && timeLeft > 0) e.timeLeft = timeLeft;
    return e;
  }

  // --- paint --------------------------------------------------------------------

  function draw(player, extras) {
    const w = container.clientWidth || 0;
    const h = container.clientHeight || 0;
    if (w < 60 || h < 60) return;
    const dpr = Math.min(
      2,
      (typeof window !== "undefined" && window.devicePixelRatio) || 1
    );
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h); // the CSS background carries the dim backdrop

    // Decay cached event countdowns between draws (only runs while update()
    // runs — pause freezes the map, matching the events scheduler).
    const now = performance.now();
    let dt = lastStamp ? (now - lastStamp) / 1000 : 0;
    lastStamp = now;
    if (dt > 30) dt = 30;
    if (dt > 0) {
      for (const ev of eventCache.values()) {
        if (ev.timeLeft > 0) {
          ev.timeLeft -= dt;
          if (ev.timeLeft < 0) ev.timeLeft = 0;
        }
      }
    }

    refreshNames();
    const openSet = computeReachable();

    // extras (P2-K7 — every field optional). Yaw: extras → player.rotation
    // fallback → default up-arrow.
    let yaw = 0;
    let hasYaw = false;
    if (extras && Number.isFinite(extras.yaw)) {
      yaw = Number(extras.yaw);
      hasYaw = true;
    } else if (
      player &&
      player.rotation &&
      Number.isFinite(player.rotation.y)
    ) {
      yaw = Number(player.rotation.y);
      hasYaw = true;
    }
    const px = player && player.position ? Number(player.position.x) || 0 : 0;
    const pz = player && player.position ? Number(player.position.z) || 0 : 0;
    const here = districtAt ? districtAt(px, pz) : null;

    // Union with extras.event — self-heals a cache entry lost to a missed
    // "event-end" of an earlier same-type event (crates may overlap, §3.4.5).
    if (extras && extras.event && extras.event.type) {
      upsertEvent(
        String(extras.event.type),
        Number(extras.event.x),
        Number(extras.event.z),
        NaN
      );
    }

    // Projection: world ±140 m → centered square min(w,h)−40 px, z drawn
    // downward (top-down read matching the HUD/debug coordinates).
    const side = Math.max(120, Math.min(w, h) - MARGIN);
    const scale = side / WORLD_SPAN;
    const ox = (w - side) / 2;
    const oy = (h - side) / 2;

    // Faint coordinate grid, every 20 m (§4.2).
    ctx.lineWidth = 1;
    ctx.strokeStyle = COL_GRID;
    ctx.beginPath();
    for (let g0 = WORLD_MIN; g0 <= WORLD_MAX; g0 += 20) {
      const gx = ox + (g0 - WORLD_MIN) * scale;
      ctx.moveTo(gx, oy);
      ctx.lineTo(gx, oy + side);
      const gy = oy + (g0 - WORLD_MIN) * scale;
      ctx.moveTo(ox, gy);
      ctx.lineTo(ox + side, gy);
    }
    ctx.stroke();

    // Axis labels every 40 m — 4 per axis, 8 total (≤ 12 per contract).
    ctx.font = "9px ui-monospace, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    for (let li = 0; li < AXIS_TICKS.length; li++) {
      const v = AXIS_TICKS[li];
      ctx.fillText(String(v), ox + (v - WORLD_MIN) * scale, oy + side - 4);
      ctx.fillText(String(v), ox + 12, oy + (v - WORLD_MIN) * scale - 3);
    }

    // District fills + names (§4.2). quarantine draws from its DISPLAY bbox.
    for (let i = 0; i < districts.length; i++) {
      const d = districts[i];
      if (!d || !d.bounds || !d.id) continue;
      const b = d.bounds;
      const x0 = ox + (b.minX - WORLD_MIN) * scale;
      const z0 = oy + (b.minZ - WORLD_MIN) * scale;
      const rw = (b.maxX - b.minX) * scale;
      const rh = (b.maxZ - b.minZ) * scale;
      const isHere = here === d.id;
      const isOpen = openSet.has(d.id);
      ctx.fillStyle = isHere
        ? isOpen
          ? COL_OPEN_HERE
          : COL_LOCKED_HERE
        : isOpen
        ? COL_OPEN
        : COL_LOCKED;
      ctx.fillRect(x0, z0, rw, rh);
      if (isHere) {
        ctx.strokeStyle = COL_CURRENT_EDGE;
        ctx.lineWidth = 2;
        ctx.strokeRect(x0 + 1, z0 + 1, rw - 2, rh - 2);
      }
      const label = names.get(d.id) || String(d.id);
      ctx.font = "600 12px system-ui, sans-serif";
      if (ctx.measureText(label).width > rw - 8) {
        ctx.font = "600 10px system-ui, sans-serif";
      }
      if (ctx.measureText(label).width <= rw - 6) {
        const tx = x0 + rw / 2;
        const tz = z0 + rh / 2;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillText(label, tx + 1, tz + 1);
        ctx.fillStyle = isHere
          ? COL_CURRENT_EDGE
          : isOpen
          ? "rgba(214, 236, 222, 0.88)"
          : "rgba(255, 158, 148, 0.80)";
        ctx.fillText(label, tx, tz);
      }
    }

    // Gates — one draw per unordered pair; colored bed + thin white core
    // ("nét trắng ngắn, xanh khi mở đỏ khi khoá"), read LIVE every draw.
    ctx.lineCap = "round";
    for (let i = 0; i < districts.length; i++) {
      const d = districts[i];
      if (!d || !d.id || !d.gates) continue;
      for (let gi = 0; gi < d.gates.length; gi++) {
        const gt = d.gates[gi];
        if (!gt || !(d.id < gt.to)) continue; // pair dedupe
        const g = gateBetween ? gateBetween(d.id, gt.to) : null;
        const axisX = !(g && g.axis === "z");
        const half = (((g && g.width) || 5) * 0.5 * scale);
        const cx0 = ox + (gt.x - WORLD_MIN) * scale;
        const cy0 = oy + (gt.z - WORLD_MIN) * scale;
        ctx.beginPath();
        if (axisX) {
          ctx.moveTo(cx0 - half, cy0);
          ctx.lineTo(cx0 + half, cy0);
        } else {
          ctx.moveTo(cx0, cy0 - half);
          ctx.lineTo(cx0, cy0 + half);
        }
        ctx.strokeStyle = g && g.open ? GATE_OPEN_COL : GATE_LOCKED_COL;
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.9;
        ctx.stroke();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 1;
        ctx.stroke(); // white core over the same path
      }
    }
    ctx.lineCap = "butt";

    const blink =
      0.45 + 0.55 * (0.5 + 0.5 * Math.sin((now / 1000) * TAU * 1.5));

    // Mission marker — gold diamond, ~1.5 Hz blink, faint pillar dot (§4.2).
    if (extras && extras.mission) {
      const m = extras.mission;
      if (Number.isFinite(m.x) && Number.isFinite(m.z)) {
        const mx0 = ox + (m.x - WORLD_MIN) * scale;
        const mz0 = oy + (m.z - WORLD_MIN) * scale;
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = COL_MISSION;
        ctx.beginPath();
        ctx.arc(mx0, mz0, 12, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = blink;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        diamondPath(ctx, mx0, mz0, 6);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Event markers (from the bus cache — §4.2).
    const horde = eventCache.get("horde");
    if (horde && horde.x !== null && horde.z !== null) {
      const ex0 = ox + (horde.x - WORLD_MIN) * scale;
      const ez0 = oy + (horde.z - WORLD_MIN) * scale;
      const ppx = ox + (px - WORLD_MIN) * scale;
      const ppz = oy + (pz - WORLD_MIN) * scale;
      // Direction line player → horde + red arrowhead + dot.
      ctx.strokeStyle = "rgba(255, 77, 61, 0.40)";
      ctx.lineWidth = 2;
      ctx.setLineDash(HORDE_DASH);
      ctx.beginPath();
      ctx.moveTo(ppx, ppz);
      ctx.lineTo(ex0, ez0);
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
      const ang = Math.atan2(ez0 - ppz, ex0 - ppx);
      ctx.save();
      ctx.translate(ex0, ez0);
      ctx.rotate(ang);
      ctx.fillStyle = COL_HORDE;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-4, 5.5);
      ctx.lineTo(-4, -5.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = COL_HORDE;
      ctx.beginPath();
      ctx.arc(ex0, ez0, 3.5, 0, TAU);
      ctx.fill();
    }
    const supply = eventCache.get("supply");
    if (supply && supply.x !== null && supply.z !== null) {
      const sx0 = ox + (supply.x - WORLD_MIN) * scale;
      const sz0 = oy + (supply.z - WORLD_MIN) * scale;
      ctx.fillStyle = COL_SUPPLY;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(sx0 - 5, sz0 - 5, 10, 10);
      ctx.fill();
      ctx.stroke();
    }
    const survivor = eventCache.get("survivor");
    if (survivor && survivor.x !== null && survivor.z !== null) {
      const vx0 = ox + (survivor.x - WORLD_MIN) * scale;
      const vz0 = oy + (survivor.z - WORLD_MIN) * scale;
      ctx.fillStyle = COL_SURVIVOR;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(vx0, vz0, 5, 0, TAU);
      ctx.fill();
      ctx.stroke();
      // small white cross on top
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(vx0 - 3, vz0);
      ctx.lineTo(vx0 + 3, vz0);
      ctx.moveTo(vx0, vz0 - 3);
      ctx.lineTo(vx0, vz0 + 3);
      ctx.stroke();
    }
    const blood = eventCache.get("bloodmoon");
    if (blood) {
      // Light red wash over the whole map + countdown (timeLeft from the
      // event-start cache, decayed between draws — §4.2).
      ctx.fillStyle = COL_BLOOD_WASH;
      ctx.fillRect(0, 0, w, h);
      const label = i18n.t("event_bloodmoon_timer", {
        n: Math.max(0, Math.ceil(blood.timeLeft)),
      });
      ctx.font = "800 15px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillText(label, w / 2 + 1, oy - 13);
      ctx.fillStyle = "#ff6b5e";
      ctx.fillText(label, w / 2, oy - 14);
    }

    // Boss marker — big red dot + ring + name (only while alive; main owns
    // the bossRef gate, P2-K7).
    const boss = extras && extras.boss;
    if (boss && Number.isFinite(boss.x) && Number.isFinite(boss.z)) {
      const bx0 = ox + (boss.x - WORLD_MIN) * scale;
      const bz0 = oy + (boss.z - WORLD_MIN) * scale;
      ctx.fillStyle = COL_HORDE;
      ctx.strokeStyle = "#2b0705";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bx0, bz0, 7, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 77, 61, 0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx0, bz0, 13, 0, TAU);
      ctx.stroke();
      const bName = bossLabel(boss.type);
      ctx.font = "700 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      if (bName && ctx.measureText(bName).width < w - 24) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillText(bName, bx0 + 1, bz0 - 17);
        ctx.fillStyle = "#ffb4a8";
        ctx.fillText(bName, bx0, bz0 - 18);
      }
    }

    // Player = arrow (yaw 0 = looking −Z = up on canvas, §4.2).
    const ppx = ox + (px - WORLD_MIN) * scale;
    const ppz = oy + (pz - WORLD_MIN) * scale;
    ctx.save();
    ctx.translate(ppx, ppz);
    if (hasYaw) ctx.rotate(-yaw);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = COL_PLAYER;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Frame around the world square.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, side - 1, side - 1);

    // Title (top center) + LOCKED/OPEN legend (top right) + hint (bottom).
    const title = i18n.t("map_title");
    ctx.font = "700 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillText(title, w / 2 + 1, 25);
    ctx.fillStyle = "#e8eefc";
    ctx.fillText(title, w / 2, 24);

    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "left";
    const lblLocked = i18n.t("map_locked");
    const lblOpen = i18n.t("map_open");
    const wLocked = ctx.measureText(lblLocked).width;
    const wOpen = ctx.measureText(lblOpen).width;
    let lx = w - 18 - (wLocked + 8 + 10 + 14 + wOpen + 14 + 10);
    const ly = 17;
    ctx.fillStyle = GATE_LOCKED_COL;
    ctx.fillRect(lx, ly, 10, 10);
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.fillText(lblLocked, lx + 14, ly + 9);
    ctx.fillStyle = GATE_OPEN_COL;
    ctx.fillRect(lx + wLocked + 8 + 14, ly, 10, 10);
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.fillText(lblOpen, lx + wLocked + 8 + 14 + 14, ly + 9);

    const hint = i18n.t("map_toggle_hint");
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.fillText(hint, w / 2, h - 10);
  }

  // --- visibility (§4.1) ---------------------------------------------------------

  function emitVisibility() {
    bus.dispatchEvent(
      new CustomEvent("map-visibility", { detail: { open } })
    );
  }

  function setOpen(v) {
    const next = !!v;
    const changed = next !== open;
    open = next;
    cs.display = open ? "block" : "none";
    if (open && changed) draw(lastPlayer, lastExtras); // paint before the next 10 Hz tick
    emitVisibility();
  }

  function toggle() {
    setOpen(!open);
  }

  function show(visible) {
    setOpen(visible);
  }

  function update(player, extras) {
    lastPlayer = player || null;
    lastExtras = extras || null;
    if (!open) return; // hidden → no-op (§4.1; 10 Hz caller + toggle paint)
    draw(lastPlayer, lastExtras);
  }

  // --- bus (§4.1/§4.2 + defensive lifecycle) --------------------------------------

  // The M key path: input.js emits "map-toggle" while playing and the shop is
  // closed (§8.6) — the map listens for itself, no main.js round-trip.
  bus.addEventListener("map-toggle", toggle);

  bus.addEventListener("event-start", (e) => {
    const d = e && e.detail ? e.detail : {};
    const type = String(d.type || "");
    if (!type) return;
    upsertEvent(type, Number(d.x), Number(d.z), Number(d.timeLeft));
  });

  bus.addEventListener("event-end", (e) => {
    const d = e && e.detail ? e.detail : {};
    eventCache.delete(String(d.type || ""));
  });

  bus.addEventListener("bloodmoon-active", (e) => {
    const d = e && e.detail ? e.detail : {};
    if (d && d.active) {
      upsertEvent("bloodmoon", NaN, NaN, Number(d.duration) > 0 ? Number(d.duration) : 90);
    } else {
      eventCache.delete("bloodmoon");
    }
  });

  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail && e.detail.patch ? e.detail.patch : null;
    if (patch && patch.lang) nameLang = ""; // force refreshNames() next draw
  });

  // Defensive: overlays that stack near the map's z-index. The shop overlay
  // owns the screen while open (M is silent there, §8.6) — close the map.
  bus.addEventListener("shop-open", () => {
    if (open) show(false);
  });

  // No state other than a live run may be covered by the z-50 overlay
  // (menu / intro / paused incl. outro / gameover). Reopening needs a fresh M.
  bus.addEventListener("state-changed", (e) => {
    const st = e && e.detail ? e.detail.state : null;
    if (st !== "playing" && open) show(false);
  });

  return { toggle, show, update };
}
