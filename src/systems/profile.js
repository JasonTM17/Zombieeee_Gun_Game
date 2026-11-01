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

  /** Bản ghi mặc định (schema FROZEN §5.3 / P4-K21). */
  function defaults() {
    return {
      kills: 0,
      headshots: 0,
      deaths: 0,
      playtimeSec: 0,
      bossesKilled: 0,
      moneyEarned: 0,
      endlessBest: { wave: 0, score: 0 },
    };
  }

  /** console.warn 1 LẦN mỗi loại lỗi (§1.6 — không spam). */
  const warned = {};
  function warnOnce(msg) {
    if (warned[msg]) return;
    warned[msg] = true;
    console.warn(msg);
  }

  /** Số nguyên ≥ 0 từ một giá trị bất kỳ (NaN/chuỗi/âm → fallback). */
  function intOr(v, fallback) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  /**
   * Load + sanitize TỪNG field từ localStorage (try/catch). Hỏng → giá trị
   * mặc định CHO FIELD ĐÓ — KHÔNG xoá key khi chỉ 1 field sai (P4-K21).
   * @returns {ProfileData}
   */
  function load() {
    const d = defaults();
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return d;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        warnOnce("[profile] corrupted profile — defaults applied");
        return d;
      }
      d.kills = intOr(parsed.kills, 0);
      d.headshots = intOr(parsed.headshots, 0);
      d.deaths = intOr(parsed.deaths, 0);
      d.playtimeSec = intOr(parsed.playtimeSec, 0);
      d.bossesKilled = intOr(parsed.bossesKilled, 0);
      d.moneyEarned = intOr(parsed.moneyEarned, 0);
      if (parsed.endlessBest && typeof parsed.endlessBest === "object") {
        d.endlessBest = {
          wave: intOr(parsed.endlessBest.wave, 0),
          score: intOr(parsed.endlessBest.score, 0),
        };
      }
      return d;
    } catch {
      warnOnce("[profile] corrupted profile — defaults applied");
      return d;
    }
  }

  /** Persist (try/catch — quota/private mode im lặng, §1.6). */
  function persist() {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
    } catch {
      warnOnce("[profile] persist failed");
    }
  }

  let data = load();
  // Playtime persist gate (P4-K21 FROZEN): chỉ ghi localStorage khi
  // Math.floor(playtimeSec) ĐỔI — không ghi mỗi frame.
  let lastFloorSec = Math.floor(data.playtimeSec);

  // --- bus listeners (P4-K21) — CỘNG DỒN, persist mỗi lần biến đổi ------------

  B.addEventListener("zombie-killed", (e) => {
    const d = e && e.detail ? e.detail : {};
    data.kills += 1;
    if (d.headshot === true) data.headshots += 1;
    if (typeof d.type === "string" && PROFILE_BOSS_TYPES[d.type]) data.bossesKilled += 1;
    persist();
  });

  B.addEventListener("player-died", () => {
    data.deaths += 1;
    persist();
  });

  B.addEventListener("money-changed", (e) => {
    const d = e && e.detail ? e.detail : {};
    const delta = Number(d.delta);
    if (Number.isFinite(delta) && delta > 0) {
      data.moneyEarned += Math.round(delta);
      persist();
    }
  });

  // KHÔNG listener reset nào — thống kê TRỌN ĐỜI, mọi reset/NG+/ui-quit giữ
  // nguyên profile (spec: "reset KHÔNG xoá profile").

  /**
   * Bản copy nông mới của thống kê (người gọi không được mutate nội bộ).
   * @returns {ProfileData}
   */
  function get() {
    return {
      kills: data.kills,
      headshots: data.headshots,
      deaths: data.deaths,
      playtimeSec: data.playtimeSec,
      bossesKilled: data.bossesKilled,
      moneyEarned: data.moneyEarned,
      endlessBest: { wave: data.endlessBest.wave, score: data.endlessBest.score },
    };
  }

  /**
   * Cộng dồn counter / thay endlessBest khi tốt hơn (P4-K21); persist ngay.
   * @param {{kills?: number, headshots?: number, deaths?: number,
   *   playtimeSec?: number, bossesKilled?: number, moneyEarned?: number,
   *   endlessBest?: {wave: number, score: number}}} patch
   */
  function add(patch) {
    if (!patch || typeof patch !== "object") return;
    const KEYS = ["kills", "headshots", "deaths", "playtimeSec", "bossesKilled", "moneyEarned"];
    for (let i = 0; i < KEYS.length; i++) {
      const k = KEYS[i];
      const v = Number(patch[k]);
      if (Number.isFinite(v)) data[k] += Math.max(0, Math.round(v));
    }
    const eb = patch.endlessBest;
    if (eb && typeof eb === "object" && Number.isFinite(Number(eb.wave)) && Number.isFinite(Number(eb.score))) {
      const cand = { wave: Math.max(0, Math.round(Number(eb.wave))), score: Math.max(0, Math.round(Number(eb.score))) };
      // Cùng quy tắc best của endless (P4-K11): wave cao hơn, hoặc bằng wave
      // && score cao hơn → THAY.
      const b = data.endlessBest;
      if (cand.wave > b.wave || (cand.wave === b.wave && cand.score > b.score)) {
        data.endlessBest = cand;
      }
    }
    persist();
  }

  /**
   * Cộng playtimeSec (main gọi khi "playing"); persist khi floor đổi (P4-K21).
   * @param {number} dt - giây.
   */
  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    data.playtimeSec += dt;
    const f = Math.floor(data.playtimeSec);
    if (f !== lastFloorSec) {
      lastFloorSec = f;
      persist();
    }
  }

  return { get, add, update };
}
