/**
 * ============================================================================
 * DAILY CHALLENGE — Boss Rush with one deterministic modifier per day.
 * ============================================================================
 *
 * createDaily(bus, leaderboard) → { today(), start(), complete(entry), state() }
 *
 * - The daily key is the LOCAL calendar date "YYYY-MM-DD". There is no
 *   midnight timer: every today()/state() call recomputes the key, so a new
 *   day automatically reads as {complete:false, best:null}. The stored record
 *   for an older day is ignored (it is overwritten on the next completion).
 * - The modifier is a pure function of dateKey (FNV-1a 32-bit hash % 3), so
 *   every client sees the same three modifiers in the same order and the same
 *   day always maps to the same one:
 *
 *     id         hpMul  dmgMul  scoreMul  weather
 *     hardcore   1.25   1.2     1.25      null
 *     storm      1      1       1.15      "storm"
 *     fog        1.1    1       1.2       "fog"
 *
 *   "weather" is the mode the LEAD should force through weather.setMode();
 *   this module never holds a weather reference. "scoreMul" is applied by
 *   src/systems/bossrush.js itself (no double multiplier here).
 * - start() returns the exact bossrush.start(options) bag for today:
 *     { daily:true, dateKey, modifierId, hpMul, dmgMul, scoreMul, weather }
 *   It does not start anything (main owns the run choreography).
 * - complete(entry): marks TODAY complete and keeps the better result. Called
 *   automatically for every "bossrush-over" {daily:true} and safe to call
 *   manually. One run per day is not enforced — replaying only improves the
 *   stored best. "complete" means "finished at least one daily run today"
 *   (a defeat counts; the board still stores the score).
 * - Best lookup: the module's own localStorage record
 *   "gungame.bossrush.daily.v1" is authoritative; when it is missing (fresh
 *   profile / cleared storage) the leaderboard's daily entries for today are
 *   used as a fallback. Corrupt storage never throws.
 * - Emits "daily-updated" {state} after complete() so an open Daily modal can
 *   refresh without polling.
 *
 * Bus consumed: "bossrush-over".
 * Bus emitted: "daily-updated".
 *
 * @param {EventTarget} bus - shared bus (src/systems/gamestate.js).
 * @param {import("./leaderboard.js").Leaderboard=} leaderboard - fallback
 *   source for today's best (optional; the module works standalone).
 * @returns {Daily}
 */

/**
 * @typedef {Object} DailyModifier
 * @property {"hardcore"|"storm"|"fog"} id
 * @property {number} hpMul
 * @property {number} dmgMul
 * @property {number} scoreMul
 * @property {"storm"|"fog"|null} weather
 */

/**
 * @typedef {Object} DailyBest
 * @property {number} score
 * @property {number} time
 * @property {number} bossesDown
 * @property {boolean} win
 * @property {number} at
 */

/**
 * @typedef {Object} DailyState
 * @property {string} dateKey - local "YYYY-MM-DD".
 * @property {boolean} complete - at least one daily run finished today.
 * @property {DailyBest|null} best - today's best result.
 * @property {DailyModifier} modifier - today's modifier (fresh clone).
 */

/**
 * @typedef {Object} Daily
 * @property {() => string} today - local "YYYY-MM-DD".
 * @property {() => {daily: true, dateKey: string, modifierId: string,
 *   hpMul: number, dmgMul: number, scoreMul: number, weather: string|null}}
 *   start - bossrush.start(options) bag for today.
 * @property {(entry: object) => DailyState} complete - mark today complete.
 * @property {() => DailyState} state - fresh snapshot (computed on every call).
 */

export const DAILY_STORAGE_KEY = "gungame.bossrush.daily.v1";

/** The three frozen modifiers (order is part of the date hash contract). */
export const DAILY_MODIFIERS = Object.freeze([
  Object.freeze({
    id: "hardcore",
    hpMul: 1.25,
    dmgMul: 1.2,
    scoreMul: 1.25,
    weather: null,
  }),
  Object.freeze({
    id: "storm",
    hpMul: 1,
    dmgMul: 1,
    scoreMul: 1.15,
    weather: "storm",
  }),
  Object.freeze({
    id: "fog",
    hpMul: 1.1,
    dmgMul: 1,
    scoreMul: 1.2,
    weather: "fog",
  }),
]);

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Local calendar date key. An invalid Date falls back to the current day.
 * @param {Date=} date
 * @returns {string} "YYYY-MM-DD"
 */
export function localDateKey(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return (
    String(d.getFullYear()) +
    "-" +
    pad2(d.getMonth() + 1) +
    "-" +
    pad2(d.getDate())
  );
}

/**
 * FNV-1a (32-bit) over the date string plus a murmur-style avalanche, so
 * consecutive dates spread evenly across the three modifiers. Deterministic
 * across platforms.
 * @param {string} dateKey
 * @returns {number} unsigned 32-bit
 */
export function hashDateKey(dateKey) {
  const s = String(dateKey || "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Today's modifier for a date key. Unknown / malformed keys use today's local
 * date, so this function can never return undefined.
 * @param {string} dateKey
 * @returns {DailyModifier}
 */
export function modifierFor(dateKey) {
  const key =
    typeof dateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
      ? dateKey
      : localDateKey();
  return DAILY_MODIFIERS[hashDateKey(key) % DAILY_MODIFIERS.length];
}

function safeStore() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function normKey(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

function finiteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sanitizeBest(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const score = finiteNumber(o.score);
  if (score === null) return null;
  const time = finiteNumber(o.time);
  const at = finiteNumber(o.at);
  return {
    score: Math.max(0, Math.round(score)),
    time: Math.max(0, Math.round((time === null ? 0 : time) * 100) / 100),
    bossesDown: Math.max(0, Math.round(Number(o.bossesDown) || 0)),
    win: o.win === true,
    at: at !== null && at > 0 ? Math.round(at) : 0,
  };
}

function readRecord() {
  try {
    const s = safeStore();
    if (!s || typeof s.getItem !== "function") return null;
    const raw = s.getItem(DAILY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const dateKey = normKey(parsed.dateKey);
    if (!dateKey) return null;
    return {
      dateKey,
      complete: parsed.complete === true,
      best: sanitizeBest(parsed.best),
    };
  } catch {
    return null;
  }
}

function writeRecord(record) {
  try {
    const s = safeStore();
    if (!s || typeof s.setItem !== "function") return;
    s.setItem(DAILY_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Quota / private mode: keep the record in memory for this session.
  }
}

/** True when `a` beats `b`: higher score, then faster time. */
function betterThan(a, b) {
  if (!b) return true;
  if (a.score !== b.score) return a.score > b.score;
  return a.time < b.time;
}

function cloneBest(best) {
  return best ? { ...best } : null;
}

function cloneModifier(modifier) {
  return {
    id: modifier.id,
    hpMul: modifier.hpMul,
    dmgMul: modifier.dmgMul,
    scoreMul: modifier.scoreMul,
    weather: modifier.weather,
  };
}

export function createDaily(bus, leaderboard) {
  if (!bus || typeof bus.dispatchEvent !== "function") {
    throw new Error("createDaily: bus is required");
  }
  const board = leaderboard && typeof leaderboard.dailyTop === "function"
    ? leaderboard
    : null;

  let record = readRecord();

  function today() {
    return localDateKey();
  }

  /** Best daily board entry for `dateKey` (fallback when no local record). */
  function boardBestFor(dateKey) {
    if (!board) return null;
    const list = board.dailyTop(10);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e && e.daily === true && e.dateKey === dateKey) {
        return {
          score: e.score,
          time: e.time,
          bossesDown: e.bossesDown,
          win: e.win === true,
          at: e.at,
        };
      }
    }
    return null;
  }

  function state() {
    const dateKey = today();
    const fresh = record && record.dateKey === dateKey ? record : null;
    const fallback = fresh ? null : boardBestFor(dateKey);
    const best = fresh ? cloneBest(fresh.best) : cloneBest(fallback);
    return {
      dateKey,
      complete: fresh ? fresh.complete === true : !!fallback,
      best,
      modifier: cloneModifier(modifierFor(dateKey)),
    };
  }

  function start() {
    const dateKey = today();
    const modifier = modifierFor(dateKey);
    return {
      daily: true,
      dateKey,
      modifierId: modifier.id,
      hpMul: modifier.hpMul,
      dmgMul: modifier.dmgMul,
      scoreMul: modifier.scoreMul,
      weather: modifier.weather,
    };
  }

  function complete(entry) {
    const todayKey = today();
    const d = entry && typeof entry === "object" ? entry : {};
    const key = normKey(d.dateKey) || todayKey;
    // A run that started before midnight and ends after it belongs to the old
    // day; do not overwrite the fresh day's record with it.
    if (key !== todayKey) return state();

    const candidate = sanitizeBest({
      score: d.score,
      time: d.time,
      bossesDown: d.bossesDown,
      win: d.win,
      at: finiteNumber(d.at) !== null ? d.at : Date.now(),
    });
    if (!candidate) return state();

    const current = record && record.dateKey === todayKey ? record : null;
    const currentBest = current ? current.best : boardBestFor(todayKey);
    const best = betterThan(candidate, currentBest) ? candidate : currentBest;

    record = { dateKey: todayKey, complete: true, best: cloneBest(best) };
    writeRecord(record);
    const next = state();
    bus.dispatchEvent(
      new CustomEvent("daily-updated", { detail: { state: next } })
    );
    return next;
  }

  bus.addEventListener("bossrush-over", (e) => {
    const d = e && e.detail ? e.detail : null;
    if (!d || d.daily !== true) return;
    complete(d);
  });

  return { today, start, complete, state };
}
