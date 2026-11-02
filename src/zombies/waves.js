/**
 * Wave director / zombie spawner.
 *
 * Wave n (1-based): total count = 5 + n*3 zombies, composed as:
 *   - brutes:   from wave 4, count = 1 + floor(n/5) of the total;
 *   - runners:  from wave 2, ~25% of the total (Math.round);
 *   - crawlers: from wave 3, max(1, round(total × 0.15));
 *   - bloaters: from wave 6, 1 + floor((n − 6) / 6);
 *   - armored:  from wave 9, 1 + floor((n − 9) / 8);
 *   - walkers:  the rest = max(0, total − brutes − runners − crawlers −
 *     bloaters − armored).
 * The new types are carved OUT OF THE WALKERS — every existing count is
 * unchanged, only the walker remainder shrinks.
 *
 * BOSS WAVES (EXPANSION feature C5; wave % 5 === 0):
 *   - minion count is HALVED (Math.ceil of half the regular total), with the
 *     same brute/runner rules applied to the reduced total;
 *   - the minions BURST into the first 6 s of the wave (spawn gaps computed
 *     from the remaining window, not the 0.8–1.5 s cadence);
 *   - exactly ONE boss spawns immediately at wave start, from the cycle
 *     butcher → spitter → screamer → golem → repeat (deterministic from the
 *     wave number: wave 5 butcher, 10 spitter, 15 screamer, 20 golem, 25
 *     butcher…), at `zones.bossAnchorFor(wave)` when the optional `zones`
 *     argument is present (payload {zoneId, x, z}); without zones — or when
 *     the anchor is missing/blocked — the boss uses the level spawn point
 *     FARTHEST from the player. P1 (§4.2): with a city, a blocked OR sealed
 *     candidate (anchor or legacy point behind closed steel gates —
 *     unreachable from the player's district) is rejected; the boss then
 *     spawns from the player's district pool so boss waves stay clearable.
 *     It is announced twice:
 *       "zombie-spawned" {zombie}  (main.js pushes it into the shared array —
 *                                   combat raycasts hit it like any zombie)
 *       "boss-spawned"   {type, zoneId, hp}  (HUD boss bar)
 *   - "wave-clear" {n} fires only when the boss AND every minion are dead.
 *     That includes the minions the screamer boss summons: their Zombie
 *     instances carry `summoned === true` and are tracked here through the
 *     "zombie-spawned" event (waves' own spawns are pushed into `tracked`
 *     BEFORE they emit the event, so the indexOf guard never double-tracks;
 *     main.js debug spawns carry no flag and never affect wave accounting —
 *     see the "Debug spawns do NOT affect wave accounting" note in main.js).
 *
 * Spawn cadence (regular waves): the FIRST spawn lands within 3 s of the wave
 * starting, then one zombie every 0.8–1.5 s (random) until the wave's count
 * is exhausted. Spawn position: a pool entry at least 15 m from the player
 * (if none qualifies, the farthest one); instantiate
 * `new Zombie(scene, type, position, bus, eliteKindOrNull)` (elite rules
 * below).
 *
 * SPAWN POOL (P1 "ĐÊM THỨ 30", docs/EXPANSION-P1.md §4.2): with the optional
 * 5th `city` argument the pool comes from the DISTRICT the player stands in
 * (`city.districtAt(playerPos)` → `district.spawnPoints`), so zombies pour
 * out of the streets around the player instead of the legacy quarantine ring.
 * Rules:
 * - safehouse (the ×0.5-density hub): every single spawn is SWAPPED to an
 *   adjacent district whose shared gate is OPEN (adjacency =
 *   `district.gates` + `city.gateBetween(...).open`); with no open gate yet
 *   the safehouse's own points are used so mission 1 still has pressure.
 * - quarantine declares NO points of its own (they live on
 *   `level.spawnPoints`) → the legacy pool applies there, byte-identical.
 * - if the player's district has fewer than 2 eligible (≥ 15 m) points, the
 *   pool expands with the adjacent OPEN districts' points before the
 *   farthest-point fallback kicks in.
 * - fallback (no city passed / districtAt = null / empty district pool): the
 *   legacy `level.spawnPoints` pool — the pre-P1 behavior, unchanged.
 *
 * CONCURRENCY CAP (§4.2.1): MAX_CONCURRENT = 40 LIVE zombies across the wave
 * director's `tracked` list (wave minions + bosses + screamer summons; debug
 * spawns are not tracked). When the cap is reached the spawn is DEFERRED —
 * the queue keeps its zombie and the attempt retries next frame (never
 * dropped, so wave accounting stays exact).
 *
 * DENSITY MULTIPLIERS (§4.2.3) apply to the recurring spawn gap (not the
 * wave's first-spawn timer, keeping wave-start timing intact). They never
 * stack — the single applicable one wins (both are ×2/3 ≈ +50% density):
 * - a district whose "quota-done" {districtId} arrived (missions fires it
 *   once, when its quota objective completes) while the player stands in it;
 * - missions 7–8 active (horde: "mission-start" {index:7|8} until
 *   "mission-complete" {index:7|8}) while the player stands in quarantine.
 *
 * A wave CLEARS when all of its zombies are dead → emit "wave-clear" {n},
 * then a 10 s intermission → emit "wave-start" {n+1} and repeat. Wave 1
 * starts on the FIRST update() call after construction/reset() — the main
 * loop only calls update() while the gamestate is "playing", which is what
 * freezes waves in menus/pause (menu: atmosphere only; paused: render only).
 *
 * Bus events emitted:
 * - "wave-start" {n}       (gamestate sets wave; hud shows banner + sting)
 * - "wave-clear" {n}
 * - "boss-spawned" {type, zoneId, hp}   (boss waves only — HUD boss bar)
 * - "zombie-spawned" {zombie} — main.js pushes the zombie into the SHARED
 *   zombies array that createCombat received. (createWaves cannot take the
 *   array itself — its signature is frozen by spec — and combat is created
 *   BEFORE waves in the bootstrap order, so the bus is the bridge.) The boss
 *   and the screamer's summoned minions reach main.js through the same event.
 * - On reset(): every living zombie is disposed immediately and announced
 *   with "zombie-despawned" {zombie} so the shared array stays in sync
 *   (main.js must tolerate duplicates of that event).
 *
 * Bus events consumed (P1 additions — docs/EXPANSION-P1.md §4.2/§6):
 * - "quota-done" {districtId} — missions marks a district cleared → that
 *   district's spawn density ×2/3 while the player stands in it.
 * - "mission-start" {index} / "mission-complete" {index} — index 7|8 toggles
 *   the quarantine horde density (×2/3) for missions 7–8.
 * ("zombie-despawned"/"zombie-spawned" were already consumed above.)
 *
 * NIGHT 30 P2 (docs/EXPANSION-P2.md §3.6.3 — ADDITIVE): the new event
 * "bloodmoon-active" {active} (emitted by systems/events.js) multiplies the
 * FINAL recurring spawn gap ×0.5 (≈ ×2 density) while active — stacked OUTSIDE
 * the single-winner P1 multiplier (P2-K8), so a quota-done district AND a
 * bloodmoon CAN combine; the 0.05 s boss-burst floor still holds after the
 * product. reset() clears the flag. Every other behavior (cap 50, wave
 * composition, intermission, boss cadence) is untouched.
 *
 * NIGHT 30 P3 (docs/EXPANSION-P3.md §4.7 — ADDITIVE): "ng-plus" {active}
 * (emitted by main.js) arms the New Game+ rule for NEWLY created units —
 * regular zombies hp ×1.25 / speed ×1.1, bosses maxHp ×1.25 (hp reset to it)
 * / speed ×1.1. Units already alive are untouched. reset() clears the flag;
 * main.js re-emits the current flag value on every fresh run so a death-
 * restart inside an NG+ run re-arms it (P3-K9).
 *
 * GUN GAME 2.0 P4 (docs/EXPANSION-P4.md §5.1 / P4-K8..K10 / K15 — ADDITIVE):
 * - MODE (P4-K9): `setMode("story"|"endless")` / `getMode()` / `getWave()`.
 *   Default "story" — byte-identical behavior. reset() returns the mode to
 *   "story" (fresh-run state); endless.start() sets "endless" AFTER reset.
 *   Endless composition (P4-K8, wave n — the "halve minions on wave %5" rule
 *   does NOT apply): total = 8 + n×4; runners = max(2, round(total×0.3));
 *   brutes from wave 3 = 1 + floor((n−3)/5); crawlers from wave 2 =
 *   max(1, round(total×0.15)); bloaters from wave 4 = 1 + floor((n−4)/6);
 *   armored from wave 6 = 1 + floor((n−6)/8); walkers = the rest.
 * - Endless boss waves (P4-K10): the wave-%5 flag still flips (burst cadence
 *   and full-size composition), but NO story-cycle boss spawns there — the
 *   bloodmoon variant for wave %5 lives in systems/endless.js
 *   (events.forceEvent retry). From wave ≥ 8 EVERY wave spawns EXACTLY ONE
 *   boss with a RANDOM type drawn uniformly from Object.keys(BOSS_CLASSES)
 *   (bossTypeForWave's deterministic cycle is story-only), through the SAME
 *   spawnBoss mechanism (zone anchor + fallbacks, "boss-spawned", tracked —
 *   wave-clear waits for it).
 * - DIFFICULTY (P4-K15): "settings-changed" {patch.difficulty} caches
 *   {hpMul, dmgMul, densityMul} — easy 0.75/0.7/0.8, normal 1/1/1,
 *   hard 1.35/1.3/1.2. applyDifficulty() runs in spawnOne + spawnBoss
 *   BEFORE applyNgPlus (regular hp ×hpMul; boss maxHp ×hpMul then hp = maxHp;
 *   dmg ×dmgMul when numeric; speed untouched). nextGap divides by
 *   densityMul on top of the P1 winner × P2 bloodmoon factors (final gap =
 *   winner × (bloodmoon ? 0.5 : 1) × (1 / densityMul); the 0.05 s boss-burst
 *   floor still holds after the product). reset() returns the cache to
 *   normal (main's boot-seed re-arms it — P4-K19); NG+ hp stacking happens
 *   in applyNgPlus which multiplies on top of the difficulty-shaped hp.
 *
 * Internal bookkeeping: once a zombie is dead ("zombie-killed") it no longer
 * counts toward wave-clear; drop it from the internal list when its corpse
 * finishes despawning ("zombie-despawned") or on reset().
 *
 * ELITE VARIANTS (user request — ADDITIVE): a regular spawn may turn elite
 * (frenzied / ironhide / toxic / giant, uniform). Story from wave 4, endless
 * from wave 3; chance = min(0.22, 0.06 + n × 0.004), ×0.5 on boss waves.
 * At most 25% of a wave's minions (floor) turn elite; bosses, screamer
 * summons and debug spawns never do. The kind is passed as Zombie's optional
 * 5th constructor arg, so the shaped stats are ready before "zombie-spawned".
 * Difficulty / NG+ multipliers still apply on top of the elite shape.
 *
 * NOTE: this module only advances spawn timers / intermission and checks the
 * alive flags — per-frame zombie.update() calls are driven by main.js over
 * the shared array (waves only receives playerPos, not the player object).
 *
 * @param {import("three").Scene} scene
 * @param {import("../world/level.js").Level} level
 * @param {EventTarget} bus
 * @param {import("../world/zones.js").Zones} [zones] - optional (C5); when
 *   present, boss waves read `zones.bossAnchorFor(wave)` for the spawn anchor
 *   and report its zoneId in "boss-spawned".
 * @param {import("../world/city.js").City} [city] - optional (P1 §4.2); when
 *   present, spawns come from the player's district pool via districtAt() +
 *   districts[].spawnPoints (safehouse swap + adjacent-open expansion +
 *   MAX_CONCURRENT 40 + density multipliers). Omitted → the legacy
 *   level.spawnPoints pool with identical behavior.
 * @returns {Waves}
 */

/**
 * @typedef {Object} Waves
 * @property {(dt: number, playerPos: import("three").Vector3) => void} update
 *   Advance spawn timers / intermission (dt seconds; playerPos = player feet).
 * @property {() => void} reset
 *   Clear all zombies + timers so a fresh run starts at wave 1 on next update.
 * @property {(m: "story"|"endless") => void} setMode
 *   P4-K9: select the composition/spawn rule set. Unknown values are ignored.
 *   "story" (default) is byte-identical to the pre-P4 director.
 * @property {() => "story"|"endless"} getMode
 *   Current mode ("story" after construction and after reset()).
 * @property {() => number} getWave
 *   Current wave number (0 = none started yet).
 */

import * as THREE from "three";
import { Zombie, ELITE_KINDS } from "./zombie.js";
import { BOSS_CLASSES, bossTypeForWave } from "./bosses.js";

const FIRST_SPAWN_MIN = 1.0; // spec: first spawn ≤ 3 s after wave-start
// Integration: spec ceiling is 3 s; 2.5 s leaves margin for frame quantization
// (dt clamp 0.05 s) so the wave-1 first spawn ALWAYS lands inside 3 s.
const FIRST_SPAWN_MAX = 2.5;
const GAP_MIN = 0.8; // spec: one zombie every 0.8–1.5 s
const GAP_MAX = 1.5;
const INTERMISSION = 10; // spec: 10 s rest between waves
const MIN_SPAWN_DIST = 15; // spec: spawn ≥ 15 m from the player
const JITTER = 0.7; // lateral scatter so consecutive spawns don't stack
const BOSS_BURST_WINDOW = 6; // spec: boss-wave minions spawn within the first 6 s
const BOSS_FIRST_MIN = 0.3; // boss waves open the gates quickly (builder choice)
const BOSS_FIRST_MAX = 0.8;
const BOSS_FALLBACK_ZONE = "main"; // zoneId reported when zones is absent

// --- P1 "ĐÊM THỨ 30" (docs/EXPANSION-P1.md §4.2) -------------------------------
// Perf pass: 60 → 50 → 40 live zombies. 40 keeps the street dense but trims
// per-frame steering/separation (O(n²)), draw calls and shader skinning on
// integrated GPUs. Exported for the headless perf harness.
export const MAX_CONCURRENT = 40; // live-zombie cap (tracked) — defer, never drop
const QUOTA_DENSITY = 2 / 3; // ×2/3 gap ≈ +50% spawn density
const MIN_ELIGIBLE_POOL = 2; // < 2 eligible points → expand to adjacent opens

// --- P4 "GUN GAME 2.0" (docs/EXPANSION-P4.md §5.1 / P4-K10 / K15) --------------
// Difficulty multipliers (P4-K15, FROZEN): hp ×, dmg ×, spawn density ×
// (density rides the gap as 1 / densityMul — see nextGap).
const DIFFICULTY_MULTS = {
  easy: { hpMul: 0.75, dmgMul: 0.7, densityMul: 0.8 },
  normal: { hpMul: 1, dmgMul: 1, densityMul: 1 },
  hard: { hpMul: 1.35, dmgMul: 1.3, densityMul: 1.2 },
};
// Uniform random-pool keys for the endless boss (P4-K10 — "chọn đều trong 4
// key BOSS_CLASSES"; bossTypeForWave's deterministic cycle stays story-only).
const BOSS_KEYS = Object.keys(BOSS_CLASSES);

// --- ELITE VARIANTS (user request — additive) --------------------------------
// Regular zombies only, never bosses/summons/debug spawns. Story starts at
// wave 4, endless at wave 3; chance = min(0.22, 0.06 + n × 0.004), halved on
// boss waves. A wave can never turn more than 25% of its minions elite.
const ELITE_MIN_WAVE_STORY = 4;
const ELITE_MIN_WAVE_ENDLESS = 3;
const ELITE_CHANCE_BASE = 0.06;
const ELITE_CHANCE_PER_WAVE = 0.004;
const ELITE_CHANCE_MAX = 0.22;
const ELITE_BOSS_WAVE_MUL = 0.5;
const ELITE_WAVE_RATIO = 0.25;
const ELITE_ELIGIBLE = {
  walker: 1,
  runner: 1,
  brute: 1,
  crawler: 1,
  bloater: 1,
  armored: 1,
};

export function createWaves(scene, level, bus, zones, city) {
  const B = bus || new EventTarget();
  let wave = 0; // current wave number (0 = none started yet)
  let phase = "idle"; // idle → spawning → combat → intermission → …
  let queue = []; // types left to spawn for the current wave
  let spawnTimer = 0;
  let interTimer = 0;
  let spawnedThisWave = 0;
  let waveTime = 0; // seconds since wave-start (drives the boss-wave burst)
  let bossWave = false; // current wave is a boss wave (wave % 5 === 0)
  // Elite bookkeeping (per wave): how many turned elite so far + the 25% cap
  // computed from the wave's minion queue in startWave().
  let elitesThisWave = 0;
  let eliteCap = 0;
  /** @type {import("./zombie.js").Zombie[]} everything spawned this wave (alive or corpse) */
  const tracked = [];

  // P1 density bookkeeping (§4.2.3): districts missions marked quota-done +
  // the m7–m8 horde flag. Both feed the ×2/3 gap multiplier (never stacked).
  const quotaDoneDistricts = new Set();
  let hordeActive = false;
  // NIGHT 30 P2 §3.6.3: bloodmoon halves the FINAL gap (stacked outside the
  // P1 multiplier — P2-K8). Flag arrives on the bus from systems/events.js.
  let bloodmoonActive = false;
  // NIGHT 30 P3 §4.7 (P3-K9): New Game+ multipliers for NEWLY created units —
  // hp ×1.25 / speed ×1.1 (main.js emits "ng-plus" {active}; reset() clears
  // and main re-emits on every fresh run — see main.js freshRun).
  let ngPlus = false;
  const NG_HP_MUL = 1.25;
  const NG_SPEED_MUL = 1.1;
  // P4-K9: "story" (default) keeps every pre-P4 path byte-identical; "endless"
  // switches composition (P4-K8) + random-boss waves ≥ 8 (P4-K10).
  let mode = "story";
  // P4-K15: cached difficulty multipliers — "settings-changed" {patch.difficulty}
  // updates; reset() returns to normal (main's boot-seed re-arms, P4-K19).
  let diff = DIFFICULTY_MULTS.normal;
  /** Reused spawn-pool buffer (§4.2.2) — zero allocation per spawn attempt. */
  const poolScratch = [];

  B.addEventListener("bloodmoon-active", (e) => {
    const d = e && e.detail ? e.detail : {};
    bloodmoonActive = d.active === true;
  });

  B.addEventListener("ng-plus", (e) => {
    const d = e && e.detail ? e.detail : {};
    ngPlus = d.active === true;
  });

  B.addEventListener("settings-changed", (e) => {
    const d = e && e.detail ? e.detail : {};
    const next = d.patch ? d.patch.difficulty : undefined;
    if (next === "easy" || next === "normal" || next === "hard") diff = DIFFICULTY_MULTS[next];
  });

  /** §4.7: apply the NG+ rule to one freshly created unit (no-op otherwise). */
  function applyNgPlus(z, isBoss) {
    if (!ngPlus || !z) return;
    if (isBoss) {
      z.maxHp = Math.round(z.maxHp * NG_HP_MUL);
      z.hp = z.maxHp;
      z.speed = z.speed * NG_SPEED_MUL;
    } else {
      z.hp = Math.round(z.hp * NG_HP_MUL);
      z.speed = z.speed * NG_SPEED_MUL;
    }
  }

  /**
   * P4-K15: apply the difficulty rule to one freshly created unit — regular
   * hp ×hpMul, boss maxHp ×hpMul (hp reset to it), dmg ×dmgMul when numeric,
   * speed untouched. Normal difficulty is an exact no-op so the pre-P4
   * spawn path stays byte-identical. Runs BEFORE applyNgPlus (NG+ hp stacks
   * on top of the difficulty-shaped hp — P4-K15 "nhân nhau").
   */
  function applyDifficulty(z, isBoss) {
    if (!z || diff === DIFFICULTY_MULTS.normal) return;
    if (isBoss) {
      z.maxHp = Math.round(z.maxHp * diff.hpMul);
      z.hp = z.maxHp;
    } else {
      z.hp = Math.round(z.hp * diff.hpMul);
    }
    if (typeof z.dmg === "number") z.dmg = z.dmg * diff.dmgMul;
  }

  B.addEventListener("quota-done", (e) => {
    const id = e && e.detail ? e.detail.districtId : null;
    if (typeof id === "string" && id) quotaDoneDistricts.add(id);
  });
  B.addEventListener("mission-start", (e) => {
    const idx = e && e.detail ? Number(e.detail.index) : NaN;
    if (idx === 7 || idx === 8) hordeActive = true;
  });
  B.addEventListener("mission-complete", (e) => {
    const idx = e && e.detail ? Number(e.detail.index) : NaN;
    if (idx === 7 || idx === 8) hordeActive = false;
  });

  // Corpses announce themselves when fully despawned — drop them here so only
  // live zombies count toward the wave-clear check.
  B.addEventListener("zombie-despawned", (e) => {
    const z = e && e.detail ? e.detail.zombie : null;
    const i = tracked.indexOf(z);
    if (i !== -1) tracked.splice(i, 1);
  });

  // Screamer-summoned minions join the wave through the same event (they set
  // `summoned === true`). Our own spawns are in `tracked` before they emit, so
  // the indexOf guard makes this a no-op for them; debug spawns carry no flag.
  B.addEventListener("zombie-spawned", (e) => {
    const z = e && e.detail ? e.detail.zombie : null;
    if (!z || z.summoned !== true || tracked.indexOf(z) !== -1) return;
    tracked.push(z);
  });

  function emit(name, detail) {
    B.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /** Wave n composition per spec, shuffled so types interleave. Story boss
   *  waves halve the minion count (spec C5) and keep the brute/runner rules.
   *  Endless (P4-K8, FROZEN) uses its own full-size formula — the "halve on
   *  wave %5" law does NOT apply in endless mode. Crawler/bloater/armored are
   *  carved out of the walker remainder for both modes (new-type expansion). */
  function composition(n) {
    let total;
    let brutes;
    let runners;
    let crawlers;
    let bloaters;
    let armored;
    if (mode === "endless") {
      // P4-K8: total = 8 + n×4; runner LUÔN ≥ 2 (30%); brute từ wave 3,
      // tỉ lệ tăng (wave 3→1, 8→2, 13→3); không chia đôi ở wave %5.
      // Multi-type: crawler từ wave 2 (15%), bloater từ wave 4 (+1 mỗi 6),
      // armored từ wave 6 (+1 mỗi 8) — lấy từ phần walker.
      total = 8 + n * 4;
      runners = Math.max(2, Math.round(total * 0.3));
      brutes = n >= 3 ? 1 + Math.floor((n - 3) / 5) : 0;
      crawlers = n >= 2 ? Math.max(1, Math.round(total * 0.15)) : 0;
      bloaters = n >= 4 ? 1 + Math.floor((n - 4) / 6) : 0;
      armored = n >= 6 ? 1 + Math.floor((n - 6) / 8) : 0;
    } else {
      total = bossWave
        ? Math.ceil((5 + n * 3) / 2) // giảm NỬA minion (ceil keeps ≥ half)
        : 5 + n * 3;
      brutes = n >= 4 ? 1 + Math.floor(n / 5) : 0;
      runners = n >= 2 ? Math.round(total * 0.25) : 0;
      crawlers = n >= 3 ? Math.max(1, Math.round(total * 0.15)) : 0;
      bloaters = n >= 6 ? 1 + Math.floor((n - 6) / 6) : 0;
      armored = n >= 9 ? 1 + Math.floor((n - 9) / 8) : 0;
    }
    const walkers = Math.max(0, total - brutes - runners - crawlers - bloaters - armored);
    const list = [];
    for (let i = 0; i < brutes; i++) list.push("brute");
    for (let i = 0; i < runners; i++) list.push("runner");
    for (let i = 0; i < crawlers; i++) list.push("crawler");
    for (let i = 0; i < bloaters; i++) list.push("bloater");
    for (let i = 0; i < armored; i++) list.push("armored");
    for (let i = 0; i < walkers; i++) list.push("walker");
    return shuffle(list);
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /**
   * Elite roll for one regular spawn. Returns null when the wave/type is
   * ineligible, the per-wave 25% cap is reached, or the roll misses.
   * `type` is checked against the regular set — bosses never reach spawnOne,
   * but the guard keeps that law explicit. Debug spawns and screamer summons
   * construct their own Zombie without this path, so they stay non-elite.
   * @param {string} type
   * @returns {string|null} elite kind
   */
  function rollElite(type) {
    if (!ELITE_ELIGIBLE[type]) return null;
    const minWave = mode === "endless" ? ELITE_MIN_WAVE_ENDLESS : ELITE_MIN_WAVE_STORY;
    if (wave < minWave || elitesThisWave >= eliteCap) return null;
    let chance = Math.min(ELITE_CHANCE_MAX, ELITE_CHANCE_BASE + wave * ELITE_CHANCE_PER_WAVE);
    if (bossWave) chance *= ELITE_BOSS_WAVE_MUL; // boss waves: elite minions are rarer
    if (Math.random() >= chance) return null;
    const kind = ELITE_KINDS[(Math.random() * ELITE_KINDS.length) | 0];
    if (!kind) return null;
    elitesThisWave++;
    return kind;
  }

  /** P4-K10: uniform random boss type from Object.keys(BOSS_CLASSES)
   *  (endless waves ≥ 8 only — the story cycle stays deterministic). */
  function randomBossType() {
    return BOSS_KEYS[(Math.random() * BOSS_KEYS.length) | 0];
  }

  function startWave(n, playerPos) {
    wave = n;
    waveTime = 0;
    bossWave = n % 5 === 0; // spec: every 5th wave is a boss wave (flag kept in endless — P4-K10)
    queue = composition(n);
    spawnedThisWave = 0;
    elitesThisWave = 0;
    // 25% cap over the regular minions of THIS wave (boss excluded — a boss
    // is never elite). floor keeps the count at or below the ratio.
    eliteCap = Math.floor(queue.length * ELITE_WAVE_RATIO);
    spawnTimer = bossWave
      ? BOSS_FIRST_MIN + Math.random() * (BOSS_FIRST_MAX - BOSS_FIRST_MIN)
      : FIRST_SPAWN_MIN + Math.random() * (FIRST_SPAWN_MAX - FIRST_SPAWN_MIN);
    phase = "spawning";
    emit("wave-start", { n });
    if (mode === "endless") {
      // P4-K10: endless KHÔNG spawn boss story-cycle tại wave %5 — biến thể
      // wave %5 là bloodmoon (systems/endless.js forceEvent retry). Từ wave
      // ≥ 8 MỖI wave có ĐÚNG 1 boss NGẪU NHIÊN qua đúng cơ chế spawnBoss
      // (zone anchor + fallback, "boss-spawned", nằm trong tracked).
      if (n >= 8) spawnBoss(n, playerPos, randomBossType());
    } else if (bossWave) {
      spawnBoss(n, playerPos);
    }
  }

  /**
   * Level spawn point FARTHEST from the player (boss fallback anchor; also
   * the degenerate no-anchor path). First point when playerPos is unusable.
   */
  function farthestSpawnPoint(playerPos) {
    const pts = level && level.spawnPoints;
    if (!pts || pts.length === 0) return null;
    const px = playerPos && Number.isFinite(playerPos.x) ? playerPos.x : 0;
    const pz = playerPos && Number.isFinite(playerPos.z) ? playerPos.z : 0;
    let far = pts[0];
    let farD = -1;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const dx = p.x - px;
      const dz = p.z - pz;
      const d = dx * dx + dz * dz;
      if (d > farD) {
        farD = d;
        far = p;
      }
    }
    return far;
  }

  /** One boss (C5) at the zone anchor — or the farthest spawn point.
   *  P4-K10: `typeOverride` (endless waves ≥ 8) picks a RANDOM type instead
   *  of the deterministic story cycle; story callers pass nothing and stay
   *  byte-identical. An invalid override falls back to the story cycle. */
  function spawnBoss(n, playerPos, typeOverride) {
    const type =
      typeof typeOverride === "string" && typeof BOSS_CLASSES[typeOverride] === "function"
        ? typeOverride
        : bossTypeForWave(n); // butcher → spitter → screamer → golem
    const Ctor = BOSS_CLASSES[type];
    if (typeof Ctor !== "function") return; // bosses.js malformed: minions carry the wave

    let zoneId = BOSS_FALLBACK_ZONE;
    let x = null;
    let z = null;
    if (zones && typeof zones.bossAnchorFor === "function") {
      let anchor = null;
      try {
        anchor = zones.bossAnchorFor(n); // {zoneId, x, z} per contract C1
      } catch (err) {
        anchor = null; // stub/failed zones: fall through to the spawn-point fallback
      }
      if (anchor) {
        if (typeof anchor.zoneId === "string" && anchor.zoneId) zoneId = anchor.zoneId;
        if (Number.isFinite(anchor.x) && Number.isFinite(anchor.z)) {
          x = anchor.x;
          z = anchor.z;
        }
      }
    }
    // Blocked anchor (level not extended / bad data) → farthest spawn point.
    if (x !== null && level && typeof level.isBlocked === "function" && level.isBlocked(x, z, 0.5)) {
      x = null;
    }
    // P1 (docs/EXPANSION-P1.md §4.0 spawn-theo-khu + §4.2 "KHÔNG phá boss
    // wave"): a boss sealed behind CLOSED steel gates can neither reach the
    // player nor be shot through the solid barrier (userData.solid) — the
    // wave would never clear. Story runs before mission 6 hit exactly that:
    // both zone anchors AND the whole legacy ring pool sit inside the sealed
    // quarantine while the player fights in the outer districts. With a city,
    // keep a candidate only when its district connects to the player's
    // district through OPEN gates; otherwise fall through to the player's
    // district pool (§4.2.2). No city → the pre-P1 path stays byte-identical.
    if (x !== null && !spawnReachableFromPlayer(x, z, playerPos)) {
      x = null;
      zoneId = BOSS_FALLBACK_ZONE; // anchor rejected — do not report its zone
    }
    if (x === null) {
      const p = farthestSpawnPoint(playerPos);
      if (p && spawnReachableFromPlayer(p.x, p.z, playerPos)) {
        x = p.x;
        z = p.z;
      }
    }
    if (x === null) {
      // Stranded-anchor fallback: the minion pool around the player (§4.2.2).
      resolveSpawnPool(playerPos, poolScratch);
      const p = pickSpawnPoint(playerPos, poolScratch);
      if (p) {
        x = p.x;
        z = p.z;
      }
    }
    if (x === null) return; // no spawn points either: boss-less boss wave (degenerate)

    const boss = new Ctor(scene, n, new THREE.Vector3(x, 0, z), B);
    applyDifficulty(boss, true); // P4-K15: difficulty shape — TRƯỚC applyNgPlus
    applyNgPlus(boss, true); // §4.7: NG+ hp ×1.25 / speed ×1.1 (boss shape)
    spawnedThisWave++;
    tracked.push(boss); // the clear check covers the boss via its alive flag
    emit("zombie-spawned", { zombie: boss }); // main.js → shared array → combat
    emit("boss-spawned", { type, zoneId, hp: boss.hp }); // HUD boss bar
  }

  // --- P1 spawn-pool resolution (docs/EXPANSION-P1.md §4.2.2) ------------------
  // Reused scratch arrays (zero per-call allocation; pickSpawnPoint runs at
  // spawn cadence, not per frame).

  /** The player's district id, or null without a city / in the void. */
  function playerDistrictOf(playerPos) {
    if (!city || typeof city.districtAt !== "function") return null;
    const px = playerPos && Number.isFinite(playerPos.x) ? playerPos.x : 0;
    const pz = playerPos && Number.isFinite(playerPos.z) ? playerPos.z : 0;
    try {
      return city.districtAt(px, pz) || null;
    } catch {
      return null; // malformed city: legacy pool
    }
  }

  function districtById(id) {
    if (!city || !Array.isArray(city.districts)) return null;
    for (let i = 0; i < city.districts.length; i++) {
      if (city.districts[i] && city.districts[i].id === id) return city.districts[i];
    }
    return null;
  }

  /**
   * P1 §4.2: true when the point's district connects to the PLAYER's district
   * through OPEN gates (BFS over districts[].gates + gateBetween().open).
   * Always true without a city or without a known player district (void /
   * legacy runs) so the pre-P1 path stays byte-identical; false only when a
   * city exists and the point provably sits behind sealed steel.
   */
  function spawnReachableFromPlayer(x, z, playerPos) {
    if (!city || typeof city.districtAt !== "function") return true;
    const from = playerDistrictOf(playerPos);
    if (!from) return true;
    let to = null;
    try {
      to = city.districtAt(x, z) || null;
    } catch {
      return true; // malformed city: keep the legacy tolerance
    }
    if (!to) return false; // void — unreachable by construction (§3.1 rule 5)
    if (to === from) return true;
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length > 0) {
      const cur = queue.shift();
      const d = districtById(cur);
      if (!d || !Array.isArray(d.gates) || typeof city.gateBetween !== "function") continue;
      for (let i = 0; i < d.gates.length; i++) {
        const nextId = d.gates[i] && d.gates[i].to;
        if (typeof nextId !== "string" || seen.has(nextId)) continue;
        let gate = null;
        try {
          gate = city.gateBetween(cur, nextId); // unordered pair per §3.6.1
        } catch {
          gate = null;
        }
        if (gate && gate.open) {
          if (nextId === to) return true;
          seen.add(nextId);
          queue.push(nextId);
        }
      }
    }
    return false;
  }

  /**
   * Districts sharing an OPEN gate with `id` (adjacency from districts[].gates).
   * A neighbor with no declared points (quarantine — its pool lives on
   * level.spawnPoints per §3.6.6) contributes the legacy pool instead, so a
   * swap/expansion through an open steel gate still has somewhere to spawn.
   */
  function adjacentOpenDistricts(id) {
    const out = [];
    const d = districtById(id);
    if (!d || !Array.isArray(d.gates) || typeof city.gateBetween !== "function") return out;
    const legacy = level && level.spawnPoints;
    for (let i = 0; i < d.gates.length; i++) {
      const to = d.gates[i] && d.gates[i].to;
      if (typeof to !== "string" || !to) continue;
      let gate = null;
      try {
        gate = city.gateBetween(id, to); // pair unordered per contract §3.6.1
      } catch {
        gate = null;
      }
      if (gate && gate.open) {
        const nd = districtById(to);
        if (!nd) continue;
        const pts = Array.isArray(nd.spawnPoints) ? nd.spawnPoints : [];
        if (pts.length > 0) out.push({ spawnPoints: pts });
        else if (legacy && legacy.length > 0) out.push({ spawnPoints: legacy });
      }
    }
    return out;
  }

  /**
   * Resolve the spawn pool for the player's position into `pool` (cleared
   * first; entries are the pool's own point objects — never copied):
   * - player's district points (safehouse → swapped to adjacent OPEN pools,
   *   §4.1 ×0.5 via the swap);
   * - < 2 own points otherwise → expand with adjacent OPEN districts;
   * - no city / void district / empty district pool (quarantine) → legacy
   *   level.spawnPoints (pre-P1 behavior, byte-identical).
   */
  function resolveSpawnPool(playerPos, pool) {
    pool.length = 0;
    const legacy = level && level.spawnPoints;
    const dId = playerDistrictOf(playerPos);
    if (!dId) {
      if (legacy) for (let i = 0; i < legacy.length; i++) pool.push(legacy[i]);
      return;
    }
    const d = districtById(dId);
    const own = d && Array.isArray(d.spawnPoints) ? d.spawnPoints : null;
    if (!own || own.length === 0) {
      // quarantine (empty per contract §3.6.6) or bad data → legacy pool.
      if (legacy) for (let i = 0; i < legacy.length; i++) pool.push(legacy[i]);
      return;
    }
    if (dId === "safehouse") {
      // Hub (§4.1 ×0.5): every single spawn swaps to an adjacent OPEN pool.
      const adj = adjacentOpenDistricts(dId);
      if (adj.length > 0) {
        for (let i = 0; i < adj.length; i++) {
          const pts = adj[i].spawnPoints;
          for (let j = 0; j < pts.length; j++) pool.push(pts[j]);
        }
        return;
      }
      // No open gate yet (mission 1) — own points keep the pressure on.
      for (let i = 0; i < own.length; i++) pool.push(own[i]);
      return;
    }
    let eligible = 0;
    const px = playerPos && Number.isFinite(playerPos.x) ? playerPos.x : 0;
    const pz = playerPos && Number.isFinite(playerPos.z) ? playerPos.z : 0;
    for (let i = 0; i < own.length; i++) {
      const dx = own[i].x - px;
      const dz = own[i].z - pz;
      if (dx * dx + dz * dz >= MIN_SPAWN_DIST * MIN_SPAWN_DIST) eligible++;
    }
    for (let i = 0; i < own.length; i++) pool.push(own[i]);
    if (eligible < MIN_ELIGIBLE_POOL) {
      const adj = adjacentOpenDistricts(dId);
      for (let i = 0; i < adj.length; i++) {
        const pts = adj[i].spawnPoints;
        for (let j = 0; j < pts.length; j++) pool.push(pts[j]);
      }
    }
  }

  /** Single applicable density multiplier (§4.2.3 — never stacked). */
  function densityMultiplier(playerPos) {
    const d = playerDistrictOf(playerPos);
    if (hordeActive && d === "quarantine") return QUOTA_DENSITY;
    if (d && quotaDoneDistricts.has(d)) return QUOTA_DENSITY;
    return 1;
  }

  /** Next recurring spawn gap (boss burst included), density applied. */
  function nextGap(playerPos) {
    // P1 §4.2.3 picks ONE winner (never stacked); the P2 bloodmoon factor
    // multiplies the FINAL gap on top of it (contract §3.6.3 / P2-K8); P4-K15
    // difficulty density divides on top of both (final gap = winner ×
    // (bloodmoon ? 0.5 : 1) × (1 / densityMul)). Normal difficulty → ×1.
    const mult = densityMultiplier(playerPos) * (bloodmoonActive ? 0.5 : 1) * (1 / diff.densityMul);
    if (bossWave) {
      // The 0.05 s floor must hold AFTER the multiplier, not before.
      return Math.max(0.05, ((BOSS_BURST_WINDOW - waveTime) / Math.max(1, queue.length)) * mult);
    }
    return (GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN)) * mult;
  }

  /** A spawn point ≥ 15 m from the player; if none qualifies, the farthest. */
  function pickSpawnPoint(playerPos, pool) {
    const pts = pool && pool.length > 0 ? pool : level && level.spawnPoints;
    if (!pts || pts.length === 0) return null;
    const px = playerPos && Number.isFinite(playerPos.x) ? playerPos.x : 0;
    const pz = playerPos && Number.isFinite(playerPos.z) ? playerPos.z : 0;
    let far = null;
    let farD = -1;
    const eligible = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const dx = p.x - px;
      const dz = p.z - pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= MIN_SPAWN_DIST) eligible.push(p);
      if (d > farD) {
        farD = d;
        far = p;
      }
    }
    if (eligible.length === 0) return far;
    return eligible[(Math.random() * eligible.length) | 0];
  }

  /** LIVE zombies in the wave director's tracked list (cap check §4.2.1). */
  function aliveCount() {
    let n = 0;
    for (let i = 0; i < tracked.length; i++) {
      if (tracked[i].alive) n++;
    }
    return n;
  }

  /**
   * Spawn one zombie from the wave queue. Returns false when deferred —
   * cap reached or no usable point — the queue keeps its zombie and the
   * caller retries next frame (never dropped: wave accounting stays exact
   * because `tracked` only receives successfully spawned zombies).
   */
  function spawnOne(playerPos, pool) {
    if (aliveCount() >= MAX_CONCURRENT) return false; // §4.2.1: defer, keep queue
    const base = pickSpawnPoint(playerPos, pool);
    if (!base) return false; // no spawn points: keep the queue, retry next frame
    const type = queue.pop();
    // Jitter the point, skipping samples that land inside a collider; if all
    // of them do, fall back to the raw spawn point (clear by level design).
    let x = base.x;
    let z = base.z;
    const canTest = !!(level && typeof level.isBlocked === "function");
    for (let i = 0; i < 4; i++) {
      const jx = base.x + (Math.random() * 2 - 1) * JITTER;
      const jz = base.z + (Math.random() * 2 - 1) * JITTER;
      if (!canTest || !level.isBlocked(jx, jz, 0.4)) {
        x = jx;
        z = jz;
        break;
      }
    }
    const zombie = new Zombie(scene, type, new THREE.Vector3(x, 0, z), B, rollElite(type));
    applyDifficulty(zombie, false); // P4-K15: difficulty shape — TRƯỚC applyNgPlus
    applyNgPlus(zombie, false); // §4.7: NG+ hp ×1.25 / speed ×1.1 (regular)
    spawnedThisWave++;
    tracked.push(zombie);
    emit("zombie-spawned", { zombie });
    return true;
  }

  function allDead() {
    for (let i = 0; i < tracked.length; i++) {
      if (tracked[i].alive) return false;
    }
    return true;
  }

  function update(dt, playerPos) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (phase === "idle") {
      // Wave 1 starts on the first update() after construction/reset().
      startWave(1, playerPos);
    }
    if (phase === "spawning") {
      waveTime += dt;
      spawnTimer -= dt;
      if (spawnTimer <= 0 && queue.length > 0) {
        // P1 §4.2.2: the pool follows the player's district (legacy pool when
        // no city). Resolved per attempt — pool entries are shared refs.
        resolveSpawnPool(playerPos, poolScratch);
        if (spawnOne(playerPos, poolScratch)) {
          if (queue.length > 0) {
            // Boss waves squeeze every minion into the first 6 s: the gap is
            // whatever remains of the window, split over the remaining queue.
            // P1 §4.2.3: the ×2/3 density multiplier rides on this gap.
            spawnTimer = nextGap(playerPos);
          }
        } else {
          // Deferred (cap reached or no usable point): retry next frame —
          // the queue was NOT popped, wave accounting stays exact.
          spawnTimer = 0;
        }
      }
      if (queue.length === 0) phase = "combat"; // all out — wait for the kills
    } else if (phase === "combat") {
      // Dead zombies no longer count toward clear (alive flag is the truth).
      // On boss waves the boss sits in `tracked` too, so wave-clear waits for
      // it (plus any screamer-summoned minions) as the contract requires.
      if (spawnedThisWave > 0 && allDead()) {
        emit("wave-clear", { n: wave });
        phase = "intermission";
        interTimer = INTERMISSION;
      }
    } else if (phase === "intermission") {
      interTimer -= dt;
      if (interTimer <= 0) startWave(wave + 1, playerPos);
    }
  }

  function reset() {
    // Snapshot + clear FIRST: our own "zombie-despawned" listener splices
    // `tracked` while the emits below run, which would otherwise skip every
    // other zombie in the loop.
    const list = tracked.slice();
    tracked.length = 0;
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      // Announce BEFORE dispose so main.js drops it from the shared array;
      // dispose() itself never re-emits (main.js tolerates duplicates anyway).
      // Boss dispose() also removes its world FX (pools/projectiles/rings).
      emit("zombie-despawned", { zombie: z });
      z.dispose();
    }
    queue = [];
    wave = 0;
    spawnedThisWave = 0;
    elitesThisWave = 0;
    eliteCap = 0;
    spawnTimer = 0;
    interTimer = 0;
    waveTime = 0;
    bossWave = false;
    quotaDoneDistricts.clear(); // P1: fresh run, no density bonuses
    hordeActive = false;
    bloodmoonActive = false; // P2 §3.6.3: fresh run, no bloodmoon gap bonus
    ngPlus = false; // P3 §4.7: main re-emits "ng-plus" per run (NG+ re-arms it)
    mode = "story"; // P4-K9: fresh-run state (endless.start() sets it back AFTER reset)
    diff = DIFFICULTY_MULTS.normal; // P4-K15: main's boot-seed re-arms it (P4-K19)
    phase = "idle"; // next update() starts wave 1 again
  }

  // P4-K9 (additive): mode switch + wave read. setMode only affects FUTURE
  // composition/spawn decisions — live waves finish under the old rules.
  function setMode(m) {
    if (m === "story" || m === "endless") mode = m;
  }

  function getMode() {
    return mode;
  }

  function getWave() {
    return wave;
  }

  return { update, reset, setMode, getMode, getWave };
}
