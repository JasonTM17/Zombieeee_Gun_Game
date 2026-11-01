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
  if (!deps || !deps.waves || !deps.events || !deps.gamestate || !deps.profile) {
    throw new Error("[endless] missing deps — createEndless(bus, { waves, events, gamestate, profile }) requires all 4 (P4-K23)");
  }
  const B = bus || new EventTarget();
  const waves = deps.waves;
  const events = deps.events;
  const profile = deps.profile;

  // Boss score set (P4-K11): mọi type BOSS (BOSS_CLASSES + origin) — không
  // phải mọi type lạ. Types ngoài bảng common + set này cho 0 điểm.
  const BOSS_TYPES = Object.keys(BOSS_CLASSES).concat("origin");

  // Trạng thái nội bộ (§5.2, FROZEN danh sách).
  let active = false;
  let score = 0;
  let wave = 0;
  let killsThisMoon = 0; // đếm kill trong bloodmoon đang chạy (mirror blood_slayer — achievements là bên unlock)
  let moonRetryT = 0; // đồng hồ retry bloodmoon (giây)
  let moonWave = -1; // wave đang cần bloodmoon; -1 = không cần / đã thành công
  let moonActive = false; // "bloodmoon-active" đang chạy (để đếm killsThisMoon)

  /** Scratch zero-alloc cho snapshot() (hudExtras mỗi frame — P4-K12). */
  const snapScratch = { active: false, wave: 0, score: 0 };

  function emit(name, detail) {
    B.dispatchEvent(new CustomEvent(name, { detail }));
  }

  // --- storage "gungame.endless.v1" = {v:1, best:{wave, score}} (P4-K11) -----

  /** @returns {{wave: number, score: number}} best đã sanitize (hỏng → 0/0). */
  function readBest() {
    try {
      const raw = localStorage.getItem(ENDLESS_KEY);
      if (!raw) return { wave: 0, score: 0 };
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== 1 || !parsed.best || typeof parsed.best !== "object") {
        warnOnce("[endless] corrupted endless best removed");
        return { wave: 0, score: 0 };
      }
      const w = Math.floor(Number(parsed.best.wave));
      const s = Math.floor(Number(parsed.best.score));
      return {
        wave: Number.isFinite(w) && w > 0 ? w : 0,
        score: Number.isFinite(s) && s > 0 ? s : 0,
      };
    } catch {
      warnOnce("[endless] corrupted endless best removed");
      return { wave: 0, score: 0 };
    }
  }

  /** Ghi best (try/catch — quota/private mode im lặng, §1.6). */
  function writeBest(b) {
    try {
      localStorage.setItem(ENDLESS_KEY, JSON.stringify({ v: 1, best: b }));
    } catch {
      warnOnce("[endless] best write failed");
    }
  }

  /** P4-K11 tie rule: wave cao nhất; bằng wave → score cao hơn. */
  function isBetter(a, b) {
    return a.wave > b.wave || (a.wave === b.wave && a.score > b.score);
  }

  /** console.warn 1 LẦN mỗi loại lỗi (§1.6 — không spam gameplay). */
  const warned = {};
  function warnOnce(msg) {
    if (warned[msg]) return;
    warned[msg] = true;
    console.warn(msg);
  }

  // --- bus listeners (P4-K10/K11/K13) -----------------------------------------

  B.addEventListener("bloodmoon-active", (e) => {
    const d = e && e.detail ? e.detail : {};
    moonActive = d.active === true;
    if (moonActive) killsThisMoon = 0; // moon mới — đếm lại từ 0
  });

  B.addEventListener("wave-start", (e) => {
    if (!active) return; // story waves không đụng endless state
    const n = Math.round(Number(e && e.detail ? e.detail.n : NaN));
    if (!Number.isFinite(n) || n <= 0) return;
    wave = n; // score giữ nguyên (điểm theo kill — P4-K11)
    if (n % 5 === 0) {
      moonWave = n; // bật máy retry bloodmoon cho wave này (P4-K10)
      moonRetryT = 0; // force NGAY ở tick update kế tiếp
    }
  });

  // "wave-clear" {n}: KHÔNG điểm ở wave-clear — điểm chỉ theo kill (§5.2),
  // không cần listener.

  B.addEventListener("zombie-killed", (e) => {
    if (!active) return; // endless tự nghe "zombie-killed" KHI active (P4-K11)
    const d = e && e.detail ? e.detail : {};
    const type = typeof d.type === "string" ? d.type : "";
    const base = Object.prototype.hasOwnProperty.call(ENDLESS_SCORE, type)
      ? ENDLESS_SCORE[type]
      : BOSS_TYPES.indexOf(type) !== -1
        ? ENDLESS_SCORE.boss
        : 0;
    if (moonActive) killsThisMoon += 1;
    score += Math.round(base * (d.headshot === true ? ENDLESS_HEADSHOT_MULT : 1));
    emit("endless-score", { wave, score });
  });

  B.addEventListener("player-died", () => {
    if (!active) return;
    // P4-K13: ghi best + profile mirror + "endless-over" + active = false.
    // KHÔNG đụng waves — ui-quit/freshRun lo (listener main gọi stop() đầu
    // listener "ui-quit").
    const cur = { wave, score };
    const b = readBest();
    const nextBest = isBetter(cur, b) ? cur : b;
    writeBest(nextBest);
    profile.add({ endlessBest: nextBest });
    active = false;
    emit("endless-over", {
      wave: cur.wave,
      score: cur.score,
      bestWave: nextBest.wave,
      bestScore: nextBest.score,
    });
  });

  // --- API ------------------------------------------------------------------

  /** Bật chế độ vô tận (main gọi trong "ui-endless" — P4-K14). */
  function start() {
    active = true;
    score = 0;
    wave = 0;
    killsThisMoon = 0;
    moonRetryT = 0;
    moonWave = -1;
    moonActive = false;
    // §5.2 liệt kê setMode→reset; P4-K9 chốt reset() trả mode về "story" nên
    // setMode("endless") PHẢI chạy lại SAU reset (endless.start() set "endless"
    // sau reset — P4-K9). Lần set trước là no-op an toàn cho cả 2 chữ đọc.
    waves.setMode("endless");
    waves.reset();
    waves.setMode("endless");
    emit("endless-start", {});
  }

  /** Rời chế độ (main gọi đầu listener "ui-quit" — P4-K13). Idempotent, im lặng. */
  function stop() {
    active = false;
    waves.setMode("story"); // KHÔNG reset waves — caller freshRun lo (§5.2)
  }

  /** @returns {boolean} đang chạy endless. */
  function isActive() {
    return active;
  }

  /**
   * Tick máy retry bloodmoon (P4-K10). main gọi khi "playing" — pause tự đóng băng.
   * @param {number} dt - giây.
   */
  function update(dt) {
    if (!active || !Number.isFinite(dt) || dt <= 0) return;
    // Wave %5 chưa có bloodmoon (bị event khác chặn) → thử lại mỗi 1 s trong
    // suốt wave đó; thành công → moonWave = -1 (xong, P4-K10).
    if (moonWave >= 0 && moonWave === waves.getWave() && moonWave % 5 === 0) {
      moonRetryT -= dt;
      if (moonRetryT <= 0) {
        moonRetryT = MOON_RETRY_S;
        let ok = false;
        try {
          ok = events.forceEvent("bloodmoon") === true;
        } catch {
          ok = false; // events hỏng: retry tick kế — KHÔNG throw vào gameplay
        }
        if (ok) moonWave = -1;
      }
    }
  }

  /**
   * Snapshot zero-alloc cho hudExtras (P4-K12).
   * @returns {{active: boolean, wave: number, score: number}}
   */
  function snapshot() {
    snapScratch.active = active;
    snapScratch.wave = wave;
    snapScratch.score = score;
    return snapScratch;
  }

  /** Best hiện tại từ "gungame.endless.v1" (P4-K11). */
  function best() {
    const b = readBest();
    return { wave: b.wave, score: b.score };
  }

  return { start, stop, isActive, update, snapshot, best };
}
