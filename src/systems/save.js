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
 * @property {string} name - "pistol"|"shotgun"|"rifle"|"smg"|"sniper"|"minigun"|"grenade"|"magnum"|"dmr"|"railgun"|"sawnoff"|"crossbow".
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

// --- normalization helpers -----------------------------------------------------
// Every stored value passes through these so the JSON on disk always satisfies
// readSave()'s validation and the P4-K3/P4-K22 rules, whatever the snapshot
// callback produced. Allocations here are fine: saveNow runs on discrete bus
// triggers (mission-complete / wave-clear / player-died / ui-quit /
// story-start / debug), never per frame.

/**
 * Non-negative integer (≥ floor). Non-finite / negative → `fallback`.
 * @param {unknown} v
 * @param {number} fallback
 * @returns {number}
 */
function toInt(v, fallback) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= fallback ? n : fallback;
}

/**
 * Upgrade level, clamped to 0..3 (P4-K3). NaN/negative → 0.
 * @param {unknown} v
 * @returns {number}
 */
function toLevel(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 3 ? 3 : n;
}

/**
 * Reserve rounds (P4-K3): `null` (the Infinity marker) passes through; any
 * non-finite value (Infinity itself, NaN) → `null`; otherwise a rounded
 * integer ≥ 0.
 * @param {unknown} v
 * @returns {number|null}
 */
function toReserve(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null; // Infinity → null (P4-K3)
  return Math.max(0, Math.round(n));
}

/**
 * One weapon entry, kept only when it has a usable name.
 * @param {unknown} raw
 * @returns {SaveWeaponEntry|null}
 */
function toWeaponEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = /** @type {{name?: unknown}} */ (raw).name;
  if (typeof name !== "string" || !name) return null;
  const rawUpg = /** @type {{upgrades?: unknown}} */ (raw).upgrades;
  const u = rawUpg && typeof rawUpg === "object" ? /** @type {Record<string, unknown>} */ (rawUpg) : {};
  return {
    name,
    owned: /** @type {{owned?: unknown}} */ (raw).owned === true,
    reserve: toReserve(/** @type {{reserve?: unknown}} */ (raw).reserve),
    upgrades: { dmg: toLevel(u.dmg), mag: toLevel(u.mag), rl: toLevel(u.rl) },
  };
}

/**
 * Rebuild a clean SaveData out of the snapshot main.js produced. Fields the
 * snapshot did not fill fall back to their schema defaults; `objectivesSnapshot`
 * is optional and passed through as-is (debug-only, P4-K5).
 * @param {unknown} raw
 * @returns {SaveData}
 */
function normalizeSave(raw) {
  const src = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const weaponsSrc = Array.isArray(src.weapons) ? src.weapons : [];
  /** @type {SaveWeaponEntry[]} */
  const weapons = [];
  for (let i = 0; i < weaponsSrc.length; i++) {
    const entry = toWeaponEntry(weaponsSrc[i]);
    if (entry) weapons.push(entry);
  }
  /** @type {SaveData} */
  const out = {
    v: SCHEMA_VERSION,
    ts: 0, // stamped by saveNow() right after normalization
    storyRun: src.storyRun === true,
    ngPlus: src.ngPlus === true,
    mission: Math.min(10, toInt(src.mission, 0)), // P4-K22: 1..10, 11→10, 0→0
    money: toInt(src.money, 0),
    weapons,
    unlockedDistricts: Array.isArray(src.unlockedDistricts)
      ? src.unlockedDistricts.filter((id) => typeof id === "string")
      : [],
    currentDistrict: typeof src.currentDistrict === "string" ? src.currentDistrict : null,
    wave: toInt(src.wave, 0),
    score: toInt(src.score, 0),
    highScore: toInt(src.highScore, 0),
    difficulty:
      typeof src.difficulty === "string" && src.difficulty ? src.difficulty : "normal",
  };
  if (src.objectivesSnapshot && typeof src.objectivesSnapshot === "object") {
    out.objectivesSnapshot = /** @type {SaveData["objectivesSnapshot"]} */ (src.objectivesSnapshot);
  }
  return out;
}

export function createSave(bus, deps) {
  void bus; // P4-K1: trigger listeners thuộc gamestate.js — save không nghe bus

  /**
   * Lưu 1 lần (P4-K1: gọi bởi gamestate.saveDeps hoặc main trực tiếp).
   * @param {string} reason
   * @returns {{ok: boolean, ts?: number}}
   */
  function saveNow(reason) {
    if (!deps || typeof deps.snapshot !== "function") {
      console.warn("[save] no snapshot deps");
      return { ok: false };
    }
    /** @type {SaveData|null} */
    let raw = null;
    try {
      raw = deps.snapshot();
    } catch (err) {
      console.warn("[save] snapshot threw for reason", reason, err);
      return { ok: false };
    }
    if (!raw) return { ok: false }; // endless active / state không phải run sống

    const data = normalizeSave(raw);
    data.ts = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (err) {
      // Quota exceeded / private mode / serialization failure — the run goes
      // on unsaved; never throw into gameplay (contract §1.6).
      console.warn("[save] write failed", reason, err);
      return { ok: false };
    }
    return { ok: true, ts: data.ts };
  }

  /**
   * Đọc + corruption-guard (P4-K3: null reserve = Infinity; kiểm v === 1).
   * @returns {SaveData|null}
   */
  function readSave() {
    /** @type {string|null} */
    let text = null;
    try {
      text = localStorage.getItem(SAVE_KEY);
    } catch (err) {
      console.warn("[save] read failed (storage unavailable)", err);
      return null;
    }
    if (text === null) return null; // no save yet — normal, not corrupted

    /** @type {unknown} */
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (_err) {
      data = null; // broken JSON → the guard below removes the key
    }

    // Schema guard: version + the required fields with the exact types the
    // restore path relies on (docs/EXPANSION-P4.md §3.1). `ts` is NOT checked.
    const d = data && typeof data === "object" ? /** @type {Record<string, unknown>} */ (data) : null;
    const valid =
      !!d &&
      d.v === SCHEMA_VERSION &&
      typeof d.money === "number" &&
      typeof d.mission === "number" &&
      Array.isArray(d.weapons) &&
      typeof d.difficulty === "string";
    if (!valid) {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch (_err) {
        /* removal is best-effort; the key stays unreadable either way */
      }
      console.warn("[save] corrupted save removed");
      return null;
    }
    return /** @type {SaveData} */ (d);
  }

  /** Xoá save (idempotent). */
  function clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (err) {
      console.warn("[save] clear failed", err);
    }
  }

  /** true khi có save đọc được — nút TIẾP TỤC dựa vào đây (P4-K2). */
  function hasSave() {
    return readSave() !== null;
  }

  return { saveNow, readSave, clearSave, hasSave };
}
