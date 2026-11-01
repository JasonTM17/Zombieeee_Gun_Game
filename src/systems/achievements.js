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
 *   head_50       — TỔNG headshot-kill trọn đời ≥ 50 ("zombie-killed"
 *                   {headshot:true}; seed trọn đời từ profile — §6.1 FROZEN).
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
 * An toàn runtime (bất biến §1.6 — không bao giờ throw vào gameplay): MỌI
 * handler bus bọc try/catch; các deps đọc qua guard (endless stub còn throw
 * TODO khi Builder C chưa implement — wave_15 đọc false + warn đúng 1 lần,
 * không giết listener chain "wave-start" mà gamestate/waves cũng đang nghe).
 * Bộ đếm headshot là TRỌN ĐỜI (§6.1 FROZEN: "tổng headshot-kill ≥ 50/200") —
 * seed 1 lần từ storage "gungame.profile.v1" vì deps FROZEN {gamestate,
 * endless, weapons} (P4-K23) không chứa profile và 4 file MỚI không được
 * import chéo: profile.js persist MỖI biến đổi (P4-K21) và cả hai nghe cùng
 * "zombie-killed" {headshot:true} 1:1 nên seed + đếm phiên === profile.headshots.
 * Bộ đếm bloodmoon là theo moon (điều kiện blood_slayer tự nó reset mỗi moon).
 * Storage achv vẫn chỉ giữ ids (schema FROZEN §6.1).
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

import * as i18n from "../core/i18n.js";

// i18n keys owned by THIS module (docs/EXPANSION-P4.md §6.2 — verbatim EN+VI).
// Registered at MODULE LEVEL (pattern events.js — registration order agnostic;
// the HUD resolves "achv_{id}" for the gold toast without holding a ref here).
i18n.registerBundle({
  en: {
    achv_first_blood: "First Blood",
    achv_first_blood_desc: "Kill your first zombie.",
    achv_head_50: "Sharpshooter",
    achv_head_50_desc: "Land 50 headshot kills.",
    achv_head_200: "Brain Surgeon",
    achv_head_200_desc: "Land 200 headshot kills.",
    achv_story_half: "Halfway Through",
    achv_story_half_desc: "Complete mission 5.",
    achv_story_done: "Dawn Breaks",
    achv_story_done_desc: "Defeat the Origin and finish the story.",
    achv_ngplus_done: "Again, Harder",
    achv_ngplus_done_desc: "Defeat the Origin in New Game+.",
    achv_rich_5000: "War Chest",
    achv_rich_5000_desc: "Hold $5,000 at once.",
    achv_arsenal: "Full Arsenal",
    achv_arsenal_desc: "Own all 7 weapons.",
    achv_maxed_gun: "Gunsmith",
    achv_maxed_gun_desc: "Max out one upgrade track (level 3).",
    achv_blood_slayer: "Blood Moon Slayer",
    achv_blood_slayer_desc: "Kill 10 zombies during one Bloodmoon.",
    achv_wave_15: "Endurance",
    achv_wave_15_desc: "Reach wave 15 in Endless.",
    achv_endless_5000: "Point Machine",
    achv_endless_5000_desc: "Score 5,000 in one Endless run.",
  },
  vi: {
    achv_first_blood: "Giọt Máu Đầu Tiên",
    achv_first_blood_desc: "Hạ con zombie đầu tiên.",
    achv_head_50: "Xạ Thủ Tỉa",
    achv_head_50_desc: "50 lần kết liễu bằng đòn đầu.",
    achv_head_200: "Bác Sĩ Não",
    achv_head_200_desc: "200 lần kết liễu bằng đòn đầu.",
    achv_story_half: "Qua Nửa Đêm",
    achv_story_half_desc: "Hoàn thành nhiệm vụ 5.",
    achv_story_done: "Bình Minh Lên",
    achv_story_done_desc: "Hạ Nguồn Gốc và kết thúc câu chuyện.",
    achv_ngplus_done: "Lại Lần Nữa, Khó Hơn",
    achv_ngplus_done_desc: "Hạ Nguồn Gốc trong New Game+.",
    achv_rich_5000: "Túi Chiến Trường",
    achv_rich_5000_desc: "Giữ $5,000 cùng lúc.",
    achv_arsenal: "Kho Vũ Khí Đầy Đủ",
    achv_arsenal_desc: "Sở hữu đủ 7 súng.",
    achv_maxed_gun: "Thợ Súng",
    achv_maxed_gun_desc: "Max 1 nhánh nâng cấp (cấp 3).",
    achv_blood_slayer: "Kẻ Sát Trăng Máu",
    achv_blood_slayer_desc: "Hạ 10 zombie trong một Trăng Máu.",
    achv_wave_15: "Sức Bền",
    achv_wave_15_desc: "Đạt đợt 15 trong Sinh Tồn.",
    achv_endless_5000: "Cỗ Máy Điểm",
    achv_endless_5000_desc: "Đạt 5,000 điểm một ván Sinh Tồn.",
  },
});

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

// FROZEN thresholds (§6.1 conditions).
const HEAD_50 = 50;
const HEAD_200 = 200;
const RICH_MONEY = 5000;
const ARSENAL_COUNT = 7;
const MOON_KILLS = 10;
const WAVE_15 = 15;
const ENDLESS_SCORE_5000 = 5000;

export function createAchievements(bus, deps) {
  if (!bus || typeof bus.addEventListener !== "function") {
    throw new Error("createAchievements: bus (EventTarget) is required");
  }
  const D = deps || /** @type {AchievementDeps} */ ({}); // fields guarded at use sites (§1.6)

  // --- storage ("gungame.achv.v1" = {v:1, ids:[]}) ---------------------------
  /** @type {Set<string>} */
  const unlockedSet = new Set(loadIds());

  function loadIds() {
    try {
      const raw = localStorage.getItem(ACHV_KEY);
      if (raw == null) return [];
      const data = JSON.parse(raw);
      if (!data || data.v !== 1 || !Array.isArray(data.ids)) {
        throw new Error("bad achv storage shape");
      }
      // Unknown ids are dropped silently — an older/newer build must not
      // poison the Set (all()/unlockedIds() stay inside ACHV_IDS).
      return data.ids.filter(
        (x) => typeof x === "string" && ACHV_IDS.indexOf(x) >= 0
      );
    } catch (err) {
      console.warn("[achievements] corrupted storage, starting empty", err);
      return [];
    }
  }

  function persist() {
    try {
      localStorage.setItem(
        ACHV_KEY,
        JSON.stringify({ v: 1, ids: Array.from(unlockedSet) })
      );
    } catch {
      // Private mode / quota: achievements stay in-memory (never throws — §1.6).
    }
  }

  // --- unlock core (idempotent — §6.1) -----------------------------------------
  /**
   * @param {string} id
   * @returns {boolean} true khi lần này MỚI mở (false = đã có trước đó).
   */
  function unlock(id) {
    if (unlockedSet.has(id)) return false;
    unlockedSet.add(id);
    persist(); // storage first — a throwing listener must not lose the unlock
    try {
      bus.dispatchEvent(
        new CustomEvent("achievement-unlocked", { detail: { id } })
      );
    } catch (err) {
      console.warn("[achievements] unlock emit failed for", id, err);
    }
    return true;
  }

  // --- guarded dep reads ---------------------------------------------------------
  let warnedEndless = false;
  /** endless.isActive() — false + warn ĐÚNG 1 lần khi dep còn stub/chưa có. */
  function endlessActive() {
    const e = D.endless;
    if (!e || typeof e.isActive !== "function") return false;
    try {
      return e.isActive() === true;
    } catch {
      if (!warnedEndless) {
        warnedEndless = true;
        console.warn("[achievements] endless.isActive() unavailable — wave_15 idle");
      }
      return false;
    }
  }

  /** arsenal poll: đếm owned trên weapons.list (§6.1 — tiền + nâng cấp trigger). */
  function pollArsenal() {
    const list = D.weapons && D.weapons.list;
    if (!Array.isArray(list)) return;
    let owned = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].owned === true) owned++;
    }
    if (owned >= ARSENAL_COUNT) unlock("arsenal");
  }

  /** Bọc mọi handler — một lỗi không được chặn listener kế trong dispatch. */
  const safe = (fn) => (e) => {
    try {
      fn(e && e.detail ? e.detail : {});
    } catch (err) {
      console.warn("[achievements] handler error", err);
    }
  };

  // --- counters -----------------------------------------------------------------
  /**
   * Seed TỔNG headshot-kill trọn đời cho head_50/head_200 (§6.1 FROZEN:
   * "tổng headshot-kill ≥ 50/200" — không phải theo phiên). P4-K23 đóng băng
   * deps {gamestate, endless, weapons} — không thêm param, không import chéo
   * 4 file MỚI — nên đọc trực tiếp key FROZEN "gungame.profile.v1" (§0/§5.3).
   * profile.js persist MỖI lần biến đổi (P4-K21) và cả hai module đếm cùng
   * luồng "zombie-killed" {headshot:true} 1:1, nên seed + số headshot-kill
   * của phiên này luôn khớp profile.headshots. try/catch + sanitize như
   * profile.js intOr — hỏng/thiếu → 0, không bao giờ throw (§1.6).
   * @returns {number}
   */
  function seedLifetimeHeadshots() {
    try {
      const raw = localStorage.getItem("gungame.profile.v1");
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      const n = Math.floor(Number(parsed && parsed.headshots));
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  let headKills = seedLifetimeHeadshots(); // head_50 / head_200 — tổng trọn đời
  let moonActive = false; // blood_slayer arm flag
  let moonKills = 0; // kills trong 1 bloodmoon (reset khi arm/release)

  // --- listeners (9 nguồn tín hiệu — §6.1 bảng) --------------------------------

  // zombie-killed {type, score, headshot, position} → first_blood, head_*,
  // blood_slayer.
  bus.addEventListener(
    "zombie-killed",
    safe((d) => {
      unlock("first_blood");
      if (d.headshot === true) {
        headKills++;
        if (headKills >= HEAD_50) unlock("head_50");
        if (headKills >= HEAD_200) unlock("head_200");
      }
      if (moonActive) {
        moonKills++;
        if (moonKills >= MOON_KILLS) unlock("blood_slayer");
      }
    })
  );

  // mission-complete {index, reward} → story_half (m5), story_done fallback m10.
  bus.addEventListener(
    "mission-complete",
    safe((d) => {
      const index = Math.round(Number(d.index) || 0);
      if (index === 5) unlock("story_half");
      if (index === 10) unlock("story_done"); // fallback — §6.1 idempotent
    })
  );

  // origin-defeated → story_done (+ ngplus_done khi NG+; P3-K3 payload không
  // cần — cờ ngPlus do main giữ trên gamestate).
  bus.addEventListener(
    "origin-defeated",
    safe(() => {
      unlock("story_done");
      if (D.gamestate && D.gamestate.ngPlus === true) unlock("ngplus_done");
    })
  );

  // money-changed {money, delta} → rich_5000 + arsenal poll.
  bus.addEventListener(
    "money-changed",
    safe((d) => {
      const money = Number(d.money);
      if (Number.isFinite(money) && money >= RICH_MONEY) unlock("rich_5000");
      pollArsenal();
    })
  );

  // upgrade-bought {weapon, track, level} → maxed_gun + arsenal poll (§6.1).
  bus.addEventListener(
    "upgrade-bought",
    safe((d) => {
      if (Math.round(Number(d.level) || 0) >= 3) unlock("maxed_gun");
      pollArsenal();
    })
  );

  // bloodmoon-active {active, duration} → arm/reset counter nội bộ.
  bus.addEventListener(
    "bloodmoon-active",
    safe((d) => {
      moonActive = d.active === true;
      moonKills = 0; // arm (true) lẫn release (false) đều reset — §6.1
    })
  );

  // wave-start {n} → wave_15 (chỉ khi endless active — story wave không tính).
  bus.addEventListener(
    "wave-start",
    safe((d) => {
      const n = Math.round(Number(d.n) || 0);
      if (n >= WAVE_15 && endlessActive()) unlock("wave_15");
    })
  );

  // endless-score {wave, score} → endless_5000.
  bus.addEventListener(
    "endless-score",
    safe((d) => {
      const score = Number(d.score);
      if (Number.isFinite(score) && score >= ENDLESS_SCORE_5000) {
        unlock("endless_5000");
      }
    })
  );

  // endless-over {wave, score, bestWave, bestScore} → check cuối endless_5000.
  bus.addEventListener(
    "endless-over",
    safe((d) => {
      const score = Number(d.score);
      if (Number.isFinite(score) && score >= ENDLESS_SCORE_5000) {
        unlock("endless_5000");
      }
    })
  );

  // --- public api -----------------------------------------------------------------

  /** 12 dòng thành tựu theo thứ tự FROZEN §6.1.
   * @returns {AchievementView[]} */
  function all() {
    const out = [];
    for (let i = 0; i < ACHV_IDS.length; i++) {
      const id = ACHV_IDS[i];
      out.push({
        id,
        unlocked: unlockedSet.has(id),
        nameKey: "achv_" + id,
        descKey: "achv_" + id + "_desc",
      });
    }
    return out;
  }

  /** Mảng id đã unlock (debug achievementsState — §7.3). */
  function unlockedIds() {
    return ACHV_IDS.filter((id) => unlockedSet.has(id));
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  function isUnlocked(id) {
    return unlockedSet.has(String(id));
  }

  return { all, unlockedIds, isUnlocked };
}
