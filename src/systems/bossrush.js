/**
 * ============================================================================
 * BOSS RUSH — standalone endgame sequence (quarantine arena).
 * ============================================================================
 *
 * createBossRush(bus, { scene, zombies, player, gamestate, economy, city, camera })
 *   → { start(), stop(), update(dt), isActive(), state() }
 *
 * SEQUENCE (exactly one boss alive at a time):
 *   butcher (0, −12) → spitter (12, 0) → screamer (−12, 0) →
 *   golem (0, 12) → origin (0, 0)
 *
 * The arena is assumed CLEAN: main.js calls freshRun(false) before start().
 * start() is idempotent while active and defensively releases a tracked boss
 * left over from a finished run before spawning boss #1.
 *
 * LIFECYCLE
 * - start(): reset index / timer / stats / score, read the difficulty preset,
 *   spawn boss #1 immediately. Boss hp is the BASE table (no wave scaling):
 *   butcher 1200 / spitter 800 / screamer 600 / golem 2000 / origin 3000.
 * - Boss spawn dispatches the two events main/HUD/combat already understand:
 *     "zombie-spawned" {zombie}
 *     "boss-spawned"   {type, zoneId: "quarantine", hp}
 *   The shared zombies array is filled by main.js's existing listener.
 * - Death is detected from "zombie-killed" {type} (with an alive-poll fallback
 *   in update()). The reward is 1000 + 500 × zero-based boss index, paid once
 *   through economy.add(). Then "bossrush-progress"
 *   {index (1-based), total: 5, type, bossesDown} is emitted and the next boss
 *   spawns after 2.5 s of dt-driven wait (pause-safe; no setTimeout).
 * - Origin dies → victory:
 *     "bossrush-open" {win: true, time, bossesDown, score}  (pause request)
 *     "bossrush-over" {win: true, time, bossesDown, score}
 * - "player-died" → defeat:
 *     "bossrush-over" {win: false, time, bossesDown, score}
 * - stop(): clears the boss refs / timers / stats and disposes the tracked
 *   boss (its "zombie-despawned" is announced so main.js splices it out).
 *   Summoned minions are deliberately left alone — the contract says they
 *   stay; main.js's freshRun() drains them on the next run.
 *
 * SCORE
 *   1000 × bossesDown + time bonus.
 *   time bonus = round(max(0, 600 − elapsed) × 10) → max 6000 at 0:00,
 *   exactly 0 at 10:00. A clean 5-boss win therefore scores 5000 + bonus.
 *   A run option scoreMul multiplies the WHOLE total and is rounded once.
 *
 * DIFFICULTY
 *   The preset is read from localStorage "gungame.settings" at start()
 *   (easy hp ×0.75 / dmg ×0.7, normal ×1/×1, hard hp ×1.35 / dmg ×1.3).
 *   HP is sized from the base table; dmg shapes the boss's numeric melee
 *   `dmg` field exactly like main.js's applyDifficultyTo. Special-move
 *   constants inside bosses.js/origin.js are not reachable (same limitation
 *   as main's own path). No NG+ scaling: Origin's hp/speed are overwritten to
 *   the base values, so a previous NG+ flag cannot leak in.
 *
 * START OPTIONS (backward compatible — start() keeps working with no args)
 *   start(options?) accepts:
 *     difficulty  "easy" | "normal" | "hard" (overrides the localStorage read)
 *     hpMul       extra HP multiplier  (base × difficulty × hpMul)
 *     dmgMul      extra damage multiplier (dmg × difficulty × dmgMul)
 *     scoreMul    final score multiplier (default 1)
 *     daily       true for a Daily Challenge run
 *     dateKey     local "YYYY-MM-DD" (stored / forwarded, no validation of day)
 *     modifierId  daily modifier id ("hardcore" | "storm" | "fog")
 *     weather     "storm" | "fog" | null (metadata only — the LEAD forces it
 *                 through weather.setMode; this module holds no weather ref)
 *   Every option is sanitized: unknown / non-finite values fall back to the
 *   pre-option behavior. The daily/dateKey/modifierId/weather/scoreMul fields
 *   are stored in state() and included in "bossrush-open"/"bossrush-over" so
 *   the leaderboard + result overlay can mark the run as daily.
 *
 * ORIGIN BUS FILTER
 *   The Origin dispatches "origin-defeated" itself. In a story run that event
 *   launches the ending sequence and wipes every living zombie (main.js), so
 *   the Origin is constructed with a small filtering bus: "zombie-killed",
 *   "boss-drops", "boss-roar", "zombie-spawned" (its summons) and
 *   "origin-shake" still reach the real bus, while "origin-alive" and
 *   "origin-defeated" are swallowed. Boss Rush therefore owns the victory and
 *   the story ending never hijacks it. All other bosses use the real bus.
 *
 * Bus events emitted: "zombie-spawned", "boss-spawned", "bossrush-progress",
 *   "bossrush-open", "bossrush-over", "zombie-despawned" (stop).
 * Bus events consumed: "zombie-killed", "player-died".
 * No wave system is created or touched.
 *
 * @param {EventTarget} bus - the shared bus (src/systems/gamestate.js).
 * @param {{
 *   scene: import("three").Scene,
 *   zombies: import("../zombies/zombie.js").Zombie[],
 *   player: import("../player/controller.js").Player,
 *   gamestate: import("./gamestate.js").Gamestate,
 *   economy: import("./economy.js").Economy,
 *   city: import("../world/city.js").City,
 *   camera: import("three").Camera,
 * }} deps
 * @returns {BossRush}
 */

/**
 * @typedef {Object} BossRush
 * @property {(options?: BossRushOptions) => void} start - begin boss #1
 *   (idempotent while active). Options are optional and additive.
 * @property {() => void} stop - clear run state + release the tracked boss.
 * @property {(dt: number) => void} update - dt-driven timer / wait / poll.
 * @property {() => boolean} isActive - true until victory, defeat or stop.
 * @property {() => BossRushState} state - fresh snapshot for UI/debug.
 */

/**
 * @typedef {Object} BossRushOptions
 * @property {"easy"|"normal"|"hard"} [difficulty]
 * @property {number} [hpMul]
 * @property {number} [dmgMul]
 * @property {number} [scoreMul]
 * @property {boolean} [daily]
 * @property {string} [dateKey]
 * @property {string} [modifierId]
 * @property {"storm"|"fog"|string|null} [weather]
 */

/**
 * @typedef {Object} BossRushState
 * @property {boolean} active
 * @property {boolean} over
 * @property {boolean|null} win
 * @property {number} index - 1-based current boss (5 after a win; 0 after stop).
 * @property {string|null} type
 * @property {number} total
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} bossesDown
 * @property {number} time - seconds, 2 decimals.
 * @property {number} score
 * @property {"easy"|"normal"|"hard"} difficulty
 * @property {boolean} daily
 * @property {string} dateKey - daily local date, "" on a normal run.
 * @property {string|null} modifierId
 * @property {"storm"|"fog"|null} weather - mode the lead should force.
 * @property {number} scoreMul
 * @property {boolean} waiting - true during the 2.5 s gap.
 * @property {number} aliveBosses - live boss instances seen in `zombies`.
 */

import { Vector3 } from "three";
import { BOSS_CLASSES } from "../zombies/bosses.js";
import {
  ORIGIN_BASE_SPEED,
  ORIGIN_MAX_HP,
  createOrigin,
} from "../zombies/origin.js";

/** Spawn order — exactly one alive at a time. */
export const BOSS_RUSH_ORDER = [
  "butcher",
  "spitter",
  "screamer",
  "golem",
  "origin",
];
export const BOSS_RUSH_TOTAL = BOSS_RUSH_ORDER.length;

/** Quarantine arena anchors (feet position, XZ). */
export const BOSS_RUSH_SPAWNS = {
  butcher: { x: 0, z: -12 },
  spitter: { x: 12, z: 0 },
  screamer: { x: -12, z: 0 },
  golem: { x: 0, z: 12 },
  origin: { x: 0, z: 0 },
};

/** Base hp — mirrors BOSS_DEFS in bosses.js + ORIGIN_MAX_HP (no wave scale). */
const BASE_HP = {
  butcher: 1200,
  spitter: 800,
  screamer: 600,
  golem: 2000,
  origin: ORIGIN_MAX_HP,
};

export const BOSS_RUSH_NEXT_DELAY = 2.5; // seconds between death and next spawn
export const BOSS_RUSH_REWARD_BASE = 1000;
export const BOSS_RUSH_REWARD_STEP = 500;
export const BOSS_RUSH_SCORE_PER_BOSS = 1000;
export const BOSS_RUSH_TIME_LIMIT = 600; // 10 minutes — bonus hits 0
export const BOSS_RUSH_TIME_BONUS_PER_SEC = 10; // max bonus 6000

const SETTINGS_KEY = "gungame.settings";
const DIFFICULTY = {
  easy: { hpMul: 0.75, dmgMul: 0.7 },
  normal: { hpMul: 1, dmgMul: 1 },
  hard: { hpMul: 1.35, dmgMul: 1.3 },
};
// Weather values a Daily modifier may ask the lead to force. Anything else is
// dropped to null (this module never calls weather.setMode itself).
const WEATHER_MODES = { storm: 1, fog: 1 };

const BOSS_TYPES = {
  butcher: 1,
  spitter: 1,
  screamer: 1,
  golem: 1,
  origin: 1,
};

/** Seconds → 2 decimal places (stable event/state numbers). */
function roundTime(v) {
  return Math.round(Math.max(0, Number(v) || 0) * 100) / 100;
}

/** Positive finite multiplier or the fallback (1). 0 is not meaningful here. */
function mulOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Finite non-negative multiplier (scoreMul may legitimately be 0). */
function scoreMulOr(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

/** Optional string option → trimmed string or "". */
function strOr(v) {
  return typeof v === "string" ? v : "";
}

/**
 * Read the persisted difficulty. Missing / corrupt / unknown → "normal".
 * @returns {"easy"|"normal"|"hard"}
 */
function readDifficulty() {
  try {
    const store = globalThis.localStorage;
    if (!store || typeof store.getItem !== "function") return "normal";
    const raw = store.getItem(SETTINGS_KEY);
    if (!raw) return "normal";
    const parsed = JSON.parse(raw);
    const value = parsed && parsed.difficulty;
    return value === "easy" || value === "hard" ? value : "normal";
  } catch {
    return "normal";
  }
}

export function createBossRush(bus, deps) {
  if (!bus || typeof bus.dispatchEvent !== "function") {
    throw new Error("createBossRush: bus is required");
  }
  const d = deps || {};
  const { scene, zombies, economy, city } = d;
  if (!scene || typeof scene.add !== "function") {
    throw new Error("createBossRush: scene is required");
  }
  // player / gamestate / camera are part of the frozen wiring signature; this
  // module never drives them (main.js owns the player update, pause routing
  // and the camera). Accepted here so the call site stays contract-shaped.
  void d.player;
  void d.gamestate;
  void d.camera;

  const B = bus;
  const sharedZombies = Array.isArray(zombies) ? zombies : null;

  // --- origin filter ---------------------------------------------------------
  // Swallow the story-ending triggers; forward every gameplay event. Origin's
  // own NG+ listener (registered on the bus passed to createOrigin) stays
  // isolated too, which keeps Boss Rush free of NG+ scaling.
  const ORIGIN_SUPPRESSED = { "origin-alive": 1, "origin-defeated": 1 };
  const originTarget = new EventTarget();
  const originBus = {
    // Local listener store: createOrigin registers its "ng-plus" listener here,
    // so a real-bus NG+ broadcast can never flip the Origin's constructor flag.
    addEventListener: (type, fn, opts) =>
      originTarget.addEventListener(type, fn, opts),
    removeEventListener: (type, fn, opts) =>
      originTarget.removeEventListener(type, fn, opts),
    dispatchEvent: (event) => {
      if (event && ORIGIN_SUPPRESSED[event.type]) return true;
      return B.dispatchEvent(event);
    },
  };

  // --- run state -------------------------------------------------------------
  let active = false;
  let over = false;
  /** @type {boolean|null} */
  let win = null;
  let index = 0; // zero-based current boss
  let bossesDown = 0;
  let elapsed = 0;
  let score = 0;
  let pendingT = 0; // > 0 → waiting for the next spawn
  let deathHandled = true; // no live boss → nothing to settle
  /** @type {import("../zombies/zombie.js").Zombie|null} */
  let currentBoss = null;
  /** @type {"easy"|"normal"|"hard"} */
  let difficulty = "normal";
  let diff = DIFFICULTY.normal;
  // Daily Challenge / optional-run metadata (start(options)). Defaults keep a
  // plain start() byte-identical to the pre-option behavior.
  let runHpMul = 1;
  let runDmgMul = 1;
  let runScoreMul = 1;
  let daily = false;
  let dateKey = "";
  /** @type {string|null} */
  let modifierId = null;
  /** @type {"storm"|"fog"|null} */
  let runWeather = null;
  let warnedArena = false;

  function emit(name, detail) {
    B.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /** 1000 × bossesDown + max(0, 600 − t) × 10, then × run scoreMul. */
  function scoreAt(t) {
    const remaining = Math.max(0, BOSS_RUSH_TIME_LIMIT - Math.max(0, t));
    const base =
      bossesDown * BOSS_RUSH_SCORE_PER_BOSS +
      Math.round(remaining * BOSS_RUSH_TIME_BONUS_PER_SEC);
    return Math.round(base * runScoreMul);
  }

  /** Count LIVE bosses in the shared array (debug/state only, no gating). */
  function aliveBossCount() {
    if (!sharedZombies) return currentBoss && currentBoss.alive ? 1 : 0;
    let n = 0;
    for (let i = 0; i < sharedZombies.length; i++) {
      const z = sharedZombies[i];
      if (z && z.alive === true && BOSS_TYPES[z.type]) n += 1;
    }
    return n;
  }

  /** Warn once if a hardcoded anchor is not inside the quarantine district. */
  function checkArena(type) {
    if (warnedArena || !city || typeof city.districtAt !== "function") return;
    const p = BOSS_RUSH_SPAWNS[type];
    const zone = city.districtAt(p.x, p.z);
    if (zone && zone !== "quarantine") {
      warnedArena = true;
      console.warn(
        "[bossrush] arena anchor (" + p.x + ", " + p.z + ") is in " + zone +
          ", expected quarantine"
      );
    }
  }

  /** Base stats + current difficulty preset + optional daily multipliers. */
  function applyDifficulty(boss, type) {
    const hpMul = diff.hpMul * runHpMul;
    const dmgMul = diff.dmgMul * runDmgMul;
    if (type === "origin") {
      boss.maxHp = Math.round(BASE_HP.origin * hpMul);
      boss.hp = boss.maxHp;
      // Origin normalizes its speed through _baseSpeed in P3; both are reset so
      // an earlier NG+ session cannot leak ×1.1 into Boss Rush.
      if (Number.isFinite(boss._baseSpeed)) boss._baseSpeed = ORIGIN_BASE_SPEED;
      boss.speed = ORIGIN_BASE_SPEED;
    } else {
      boss.maxHp = Math.round(BASE_HP[type] * hpMul);
      boss.hp = boss.maxHp;
    }
    if (typeof boss.dmg === "number") boss.dmg *= dmgMul;
    boss.wave = 1; // summons stay at the early-wave composition (walkers)
  }

  /** Spawn the boss at BOSS_RUSH_ORDER[index] and announce it twice. */
  function spawnCurrent() {
    const type = BOSS_RUSH_ORDER[index];
    const p = BOSS_RUSH_SPAWNS[type];
    checkArena(type);

    let boss;
    if (type === "origin") {
      // Origin hardcodes (0, 0); the filtered bus keeps the story ending out.
      boss = createOrigin(scene, originBus, city);
    } else {
      const Ctor = BOSS_CLASSES[type];
      boss = new Ctor(scene, 1, new Vector3(p.x, 0, p.z), B);
    }
    applyDifficulty(boss, type);
    currentBoss = boss;
    deathHandled = false;
    pendingT = 0;

    // Same order as main.js's spawn helpers: the zombie first, then the HUD.
    emit("zombie-spawned", { zombie: boss });
    emit("boss-spawned", {
      type: boss.type,
      zoneId: "quarantine",
      hp: boss.hp,
    });
  }

  /** Settle the current boss death exactly once, pay, then queue the next. */
  function handleBossDown() {
    if (!active || over || deathHandled || !currentBoss) return;
    if (currentBoss.alive !== false) return;
    deathHandled = true;
    bossesDown += 1;
    const type = currentBoss.type;
    const reward =
      BOSS_RUSH_REWARD_BASE + BOSS_RUSH_REWARD_STEP * index; // 1000/1500/…
    if (economy && typeof economy.add === "function") economy.add(reward);
    score = scoreAt(elapsed);
    emit("bossrush-progress", {
      index: index + 1,
      total: BOSS_RUSH_TOTAL,
      type,
      bossesDown,
    });
    if (bossesDown >= BOSS_RUSH_TOTAL) {
      finishRun(true);
      return;
    }
    pendingT = BOSS_RUSH_NEXT_DELAY;
  }

  /** Close the run. Victory also requests the pause (lead wires addPause). */
  function finishRun(didWin) {
    if (over) return;
    over = true;
    active = false;
    pendingT = 0;
    win = didWin === true;
    score = scoreAt(elapsed);
    const detail = {
      win,
      time: roundTime(elapsed),
      bossesDown,
      score,
      daily,
      dateKey,
      modifierId,
      weather: runWeather,
      scoreMul: runScoreMul,
    };
    if (win) emit("bossrush-open", detail);
    emit("bossrush-over", detail);
  }

  /** Announce + dispose the tracked boss (corpse included). Idempotent. */
  function releaseBoss() {
    const boss = currentBoss;
    currentBoss = null;
    deathHandled = true;
    pendingT = 0;
    if (!boss || boss._gone || boss._torn) return;
    boss.alive = false; // teardown is not a kill: no score/reward event
    emit("zombie-despawned", { zombie: boss });
    if (typeof boss.dispose === "function") boss.dispose();
  }

  // --- bus reactions ---------------------------------------------------------
  B.addEventListener("zombie-killed", (e) => {
    if (!active || over || deathHandled || !currentBoss) return;
    const detail = e && e.detail ? e.detail : {};
    if (detail.type !== currentBoss.type) return;
    handleBossDown();
  });

  B.addEventListener("player-died", () => {
    if (!active || over) return;
    finishRun(false);
  });

  // Any path that lands on the main menu ends the mode defensively (the lead's
  // freshRun() also stops it first; this covers a bare gamestate.toMenu()).
  B.addEventListener("state-changed", (e) => {
    const st = e && e.detail ? e.detail.state : null;
    if (st === "menu" && active) stop();
  });

  // --- public API ------------------------------------------------------------
  /**
   * Begin a run. Options are optional and additive (Daily Challenge):
   * difficulty/hpMul/dmgMul/scoreMul/daily/dateKey/modifierId/weather.
   * @param {BossRushOptions=} options
   */
  function start(options) {
    if (active) return; // idempotent while a run is live
    // Defensive: a tracked boss from an ended run must never survive a restart
    // (main.js normally calls freshRun first, but start() is safe on its own).
    releaseBoss();
    const opts = options && typeof options === "object" ? options : {};
    const wanted = opts.difficulty;
    difficulty =
      wanted === "easy" || wanted === "hard" || wanted === "normal"
        ? wanted
        : readDifficulty();
    diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    runHpMul = mulOr(opts.hpMul, 1);
    runDmgMul = mulOr(opts.dmgMul, 1);
    runScoreMul = scoreMulOr(opts.scoreMul);
    daily = opts.daily === true;
    dateKey = strOr(opts.dateKey);
    modifierId =
      typeof opts.modifierId === "string" && opts.modifierId
        ? opts.modifierId
        : null;
    runWeather = WEATHER_MODES[opts.weather] ? opts.weather : null;
    active = true;
    over = false;
    win = null;
    index = 0;
    bossesDown = 0;
    elapsed = 0;
    pendingT = 0;
    deathHandled = true;
    score = scoreAt(0);
    spawnCurrent();
  }

  function stop() {
    active = false;
    over = false;
    win = null;
    index = 0;
    bossesDown = 0;
    elapsed = 0;
    score = 0;
    pendingT = 0;
    deathHandled = true;
    difficulty = "normal";
    diff = DIFFICULTY.normal;
    runHpMul = 1;
    runDmgMul = 1;
    runScoreMul = 1;
    daily = false;
    dateKey = "";
    modifierId = null;
    runWeather = null;
    releaseBoss();
  }

  function update(dt) {
    if (!active) return;
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (step === 0) return;
    elapsed += step;
    score = scoreAt(elapsed);

    // Poll fallback (event missed / hp zeroed directly).
    if (!deathHandled && currentBoss && currentBoss.alive === false) {
      handleBossDown();
      if (!active) return; // final boss settled → victory already emitted
    }

    if (pendingT > 0) {
      pendingT -= step;
      if (pendingT <= 0) {
        pendingT = 0;
        if (currentBoss && currentBoss.alive === true) {
          pendingT = 0.1; // safety: never spawn a second live boss
          return;
        }
        index += 1;
        if (index >= BOSS_RUSH_TOTAL) {
          finishRun(true); // unreachable in normal flow — last death finishes
          return;
        }
        spawnCurrent();
      }
    }
  }

  function isActive() {
    return active;
  }

  function state() {
    return {
      active,
      over,
      win,
      index: currentBoss ? index + 1 : 0,
      type: currentBoss ? currentBoss.type : null,
      total: BOSS_RUSH_TOTAL,
      hp:
        currentBoss && currentBoss.alive
          ? Math.max(0, Math.round(Number(currentBoss.hp) || 0))
          : 0,
      maxHp: currentBoss ? Math.round(Number(currentBoss.maxHp) || 0) : 0,
      bossesDown,
      time: roundTime(elapsed),
      score,
      difficulty,
      daily,
      dateKey,
      modifierId,
      weather: runWeather,
      scoreMul: runScoreMul,
      waiting: pendingT > 0,
      aliveBosses: aliveBossCount(),
    };
  }

  return { start, stop, update, isActive, state };
}
