/**
 * ============================================================================
 * BOSS RUSH LEADERBOARD — local top-10 board (no server).
 * ============================================================================
 *
 * createLeaderboard(bus) → { top(n?), best(), dailyTop(n?), clear(), state() }
 *
 * - Persisted in localStorage "gungame.bossrush.board.v1" as an array of at
 *   most 10 entries:
 *     { score, time, bossesDown, win, daily, dateKey, at }
 *   Sorted score DESC, then time ASC (faster wins the tie), then `at` ASC.
 * - Listens "bossrush-over" {win, time, bossesDown, score, daily?, dateKey?}
 *   and stores exactly ONE entry per run (the event is emitted once per run by
 *   src/systems/bossrush.js). A daily run carries daily:true + its dateKey.
 * - Emits "leaderboard-updated" {entry, best, rank} after an add and
 *   {entry: null, best, rank: 0} after clear(). `rank` is the 1-based position
 *   of the stored entry (0 when it fell off the top-10 board or no entry), so
 *   the Boss Rush result overlay can show "#3" without a second lookup.
 *   `best` is always the current board leader (or null).
 * - Corrupt / missing / blocked storage never throws: the board degrades to
 *   an empty in-memory array. `at` is Date.now() for every new entry.
 *
 * Bus consumed: "bossrush-over".
 * Bus emitted: "leaderboard-updated".
 *
 * @param {EventTarget} bus - shared bus (src/systems/gamestate.js).
 * @returns {Leaderboard}
 */

/**
 * @typedef {Object} LeaderboardEntry
 * @property {number} score - non-negative integer.
 * @property {number} time - seconds, 2 decimals.
 * @property {number} bossesDown - 0..5.
 * @property {boolean} win
 * @property {boolean} daily
 * @property {string} dateKey - "YYYY-MM-DD" for daily runs, "" otherwise.
 * @property {number} at - Date.now() timestamp of the run.
 */

/**
 * @typedef {Object} Leaderboard
 * @property {(n?: number) => LeaderboardEntry[]} top - best n entries (default 10).
 * @property {() => (LeaderboardEntry|null)} best - board leader or null.
 * @property {(n?: number) => LeaderboardEntry[]} dailyTop - best n daily entries.
 * @property {() => void} clear - wipe the board and persist the empty array.
 * @property {() => {entries: LeaderboardEntry[], best: LeaderboardEntry|null,
 *   count: number, dailyCount: number}} state - fresh snapshot (clones).
 */

export const LEADERBOARD_STORAGE_KEY = "gungame.bossrush.board.v1";
export const LEADERBOARD_MAX = 10;

/** Safe localStorage handle (private mode / SSR / Node harness safe). */
function store() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function finiteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function nonNegInt(v, fallback = 0) {
  const n = finiteNumber(v);
  if (n === null) return fallback;
  return Math.max(0, Math.round(n));
}

function normDateKey(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

/**
 * Coerce one raw record into a valid entry, or null when unsalvageable.
 * A record without a finite score is dropped (a run always scores ≥ 0).
 * @param {unknown} raw
 * @returns {LeaderboardEntry|null}
 */
function sanitizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const score = finiteNumber(o.score);
  if (score === null) return null;
  const time = finiteNumber(o.time);
  const at = finiteNumber(o.at);
  return {
    score: Math.max(0, Math.round(score)),
    time: Math.max(0, Math.round((time === null ? 0 : time) * 100) / 100),
    bossesDown: nonNegInt(o.bossesDown),
    win: o.win === true,
    daily: o.daily === true,
    dateKey: normDateKey(o.dateKey),
    at: at !== null && at > 0 ? Math.round(at) : 0,
  };
}

/** score DESC → time ASC → at ASC (older first). */
export function compareEntries(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (a.time !== b.time) return a.time - b.time;
  return a.at - b.at;
}

function readBoard() {
  try {
    const s = store();
    if (!s || typeof s.getItem !== "function") return [];
    const raw = s.getItem(LEADERBOARD_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out = [];
    for (let i = 0; i < parsed.length; i++) {
      const entry = sanitizeEntry(parsed[i]);
      if (entry) out.push(entry);
    }
    out.sort(compareEntries);
    return out.slice(0, LEADERBOARD_MAX);
  } catch {
    return []; // corrupt JSON / blocked storage → empty, never throw
  }
}

function writeBoard(entries) {
  try {
    const s = store();
    if (!s || typeof s.setItem !== "function") return;
    s.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota / private mode: the board stays in memory for this session.
  }
}

/** Defensive clone so callers can never mutate the stored rows. */
function clone(entry) {
  return entry ? { ...entry } : null;
}

export function createLeaderboard(bus) {
  if (!bus || typeof bus.dispatchEvent !== "function") {
    throw new Error("createLeaderboard: bus is required");
  }

  let entries = readBoard();

  function limitOf(n) {
    const value = Number(n);
    if (!Number.isFinite(value)) return LEADERBOARD_MAX;
    return Math.min(LEADERBOARD_MAX, Math.max(0, Math.floor(value)));
  }

  function top(n) {
    return entries.slice(0, limitOf(n)).map(clone);
  }

  function best() {
    return entries.length > 0 ? clone(entries[0]) : null;
  }

  function dailyTop(n) {
    const out = [];
    const limit = limitOf(n);
    for (let i = 0; i < entries.length && out.length < limit; i++) {
      if (entries[i].daily) out.push(clone(entries[i]));
    }
    return out;
  }

  function state() {
    let dailyCount = 0;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].daily) dailyCount += 1;
    }
    return {
      entries: entries.map(clone),
      best: best(),
      count: entries.length,
      dailyCount,
    };
  }

  /** Store one run result and announce its rank. */
  function addResult(detail) {
    const d = detail && typeof detail === "object" ? detail : {};
    const at = finiteNumber(d.at);
    const entry = sanitizeEntry({
      score: d.score,
      time: d.time,
      bossesDown: d.bossesDown,
      win: d.win,
      daily: d.daily,
      dateKey: d.dateKey,
      at: at !== null && at > 0 ? at : Date.now(),
    });
    if (!entry) return null;

    entries.push(entry);
    entries.sort(compareEntries);
    if (entries.length > LEADERBOARD_MAX) entries.length = LEADERBOARD_MAX;
    writeBoard(entries);

    const rank = entries.indexOf(entry) + 1; // 0 when it fell off the board
    bus.dispatchEvent(
      new CustomEvent("leaderboard-updated", {
        detail: { entry: clone(entry), best: best(), rank },
      })
    );
    return entry;
  }

  function clear() {
    entries = [];
    writeBoard(entries);
    bus.dispatchEvent(
      new CustomEvent("leaderboard-updated", {
        detail: { entry: null, best: null, rank: 0 },
      })
    );
  }

  bus.addEventListener("bossrush-over", (e) => {
    addResult(e && e.detail ? e.detail : null);
  });

  return { top, best, dailyTop, clear, state };
}
