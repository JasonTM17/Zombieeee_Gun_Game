/**
 * ============================================================================
 * SHARED EVENT BUS — the single cross-module channel of the whole game.
 * ============================================================================
 * Created HERE, in this module (per spec). Import it wherever a factory
 * signature has no bus parameter:
 *
 *   import { bus } from "./systems/gamestate.js";
 *
 * FULL EVENT TABLE (event → payload → emitted by → consumed by):
 *
 * - "pause-toggle"      {}                          input (Esc/P)          → gamestate (playing ⇄ paused)
 * - "player-hurt"       {hp}                        player.damage()        → main.js routes to audio.playerHurt()
 * - "player-died"       {}                          player                 → gamestate (→ "gameover", highScore save)
 * - "footstep"          {}                          player                 → main.js routes to audio.footstep()
 * - "fire"              {weapon: WeaponState}       weapons (round left the barrel) → main.js routes to combat.shoot(weapon)
 * - "spread"            {value: number} (radians)   weapons (per shot)     → hud (crosshair expansion)
 * - "hit"               {headshot, killed}          combat (once per shoot() that landed >= 1 pellet) → hud (hitmarker)
 * - "zombie-killed"     {type, score, headshot, position: Vector3}          zombie (death START; score is the BASE score — gamestate applies the x1.5 headshot multiplier, do NOT pre-multiply) → gamestate (score/kills), pickups (drop roll), hud (kill feed)
 * - "zombie-spawned"    {zombie: Zombie}            waves                  → main.js pushes it into the shared zombies array that createCombat received
 * - "zombie-despawned"  {zombie: Zombie}            zombie (corpse fully removed) and waves.reset() → main.js removes it from the shared array
 * - "wave-start"        {n}                         waves                  → gamestate (wave = n), hud (banner + audio.waveBanner())
 * - "wave-clear"        {n}                         waves                  → hud (optional "cleared" banner)
 * - "pickup"            {kind: "ammo"|"health"}     pickups (collected)    → player (+40 HP cap 100), weapons (+reserve), main.js routes to audio.pickup()
 * - "state-changed"     {state, score, highScore}   gamestate (every transition) → main.js (menus.show / hud.show routing), menus (populate game-over numbers)
 * - "ui-play"           {}                          menus (PLAY / PLAY AGAIN button)   → main.js: gamestate.start()  + input.lockPointer()
 * - "ui-resume"         {}                          menus (RESUME button)              → main.js: gamestate.resume() + input.lockPointer()
 * - "ui-restart"        {}                          menus (RESTART button)             → main.js: gamestate.restart() + input.lockPointer()
 * - "ui-quit"           {}                          menus (QUIT TO MENU / MENU button) → main.js: gamestate.toMenu()
 * - "settings-changed"  {patch}                     menus (sliders / language, saved immediately via settings.set) → main.js: audio.setVolume(patch.volume) when present; language persistence handled by menus itself
 *
 * EXPANSION events (docs/EXPANSION.md) — emitted/consumed by the new modules:
 * - "money-changed"     {money, delta}              economy (every applied balance change) → hud (money chip), shop UI (affordability)
 * - "shop-toggle"       {}                          input (B while playing + shop closed) → shop UI (toggle overlay)
 * - "shop-open" / "shop-closed" {}                  shop UI (open after lock release / on close) → gamestate (addPause/removePause("shop")), input (lock choreography), hud (shop hint)
 * - "explosion"         {position}                  explosives (blast) → additive (the boom is synthesized locally in explosives.js)
 * - "zone-unlocked"     {id, name}                  zones (idempotent unlock) → hud (toast)
 * - "boss-spawned"      {type, zoneId, hp}          waves (boss wave) / main debug spawnBoss → hud (boss bar), main.js (live boss tracking for hud.update extras + debug damageBoss)
 * - "boss-drops"        {position, kinds}           boss death (constructor signature is frozen — no pickups ref) → main.js routes to pickups.spawn(position, kind) per kind
 * - "boss-roar"         {type, action}              boss specials (windup/spit/shriek/slam — action "spit" added NIGHT 30 P2, P2-K14) → audio.js listens itself and plays the real boss voice (P2-K9: the legacy main.js route to zombieGrowl() is REMOVED)
 *
 * NIGHT 30 P2 events (docs/EXPANSION-P2.md §6) — emitted/consumed by the
 * events/map/audio layer:
 * - "event-start"       {type: "horde"|"supply"|"survivor"|"bloodmoon", timeLeft, x, z, districtId} (x/z null for bloodmoon; horde x/z = the representative spawn point) → events.js → hud (event banner + compass marker), map (event cache), audio (horde murmur ×1.6)
 * - "event-end"         {type, reason: "done"|"opened"|"rescued"|"lost"|"despawned"|"reset", money?} (money rides supply "opened") → events.js → hud (toast), map (cache drop), audio (murmur release)
 * - "bloodmoon-active"  {active: boolean, duration: 90} → events.js → atmosphere (sky/fog lerp red), waves (gap ×0.5), economy (reward ×2), audio (murmur ×1.6), hud (red countdown chip), map
 * - "survivor-rescued"  {x, z}                      events.js → main.js (economy.add 300 + thank-you dialogue + "pickup"{kind:"health"})
 * - "map-toggle"        {}                          input (M while playing + shop closed, §8.6) → map.js (toggles its overlay)
 * - "map-visibility"    {open: boolean}             map.js (after every open state change) → hud (hides the compass strip while the map is up)
 * - "zombie-voice"      {kind: "idle"|"alert"|"chase"|"attack"|"pain"|"death", type, position: Vector3 clone} → zombie.js + bosses.js (P2-K16 payload) → audio.js (recipe + 3D mix, cap 8)
 * - "interact-near"     {target: "item_supply", near: boolean} — events.js emits it for the supply crate (existing HUD chip route, missions' shape)
 *
 * NIGHT 30 P3 events (docs/EXPANSION-P3.md §7.1) — consumed by THIS module:
 * - "ending-active"     {active: boolean}           ending.js (chuỗi kết) → addPause/removePause("ending") — P3-K10, same pattern as "outro-active"
 * - Run stats (P3-K11): "money-changed" {delta > 0} → moneyEarned; "player-died"
 *   → deaths; "zombie-killed" {type ∈ butcher|spitter|screamer|golem|origin}
 *   → bossesKilled. Snapshot via gamestate.runStats(); counters reset in
 *   freshRun() (per-run semantics — P3-K11 frozen wording). The NG+ flag
 *   (gamestate.ngPlus) is OWNED by main.js (P3-K9/P3-K15) — no listener here.
 *
 * NOTE on zombie hit sounds: combat.js calls audio.zombieHit() directly
 * (combat owns audio); zombie.takeDamage() does NOT emit a hit-sound event —
 * this avoids 8 stacked sounds for one shotgun blast.
 *
 * GUN GAME 2.0 P4 events (docs/EXPANSION-P4.md §8.1) — emitted/consumed by
 * THIS module:
 * - "save-request"      {reason: "mission-complete"|"wave-clear"|"player-died"|"ui-quit"|"story-start"|"debug"}
 *                        gamestate (the 4 trigger listeners) + main.js
 *                        ("story-start" before beginFreshStory) + debug API
 *                        ("debug") → gamestate's own listener routes it to
 *                        gamestate.saveDeps.saveNow(reason) (main.js assigns
 *                        saveDeps right after createSave; null → no-op).
 *
 * NOTE on user gestures: bus.dispatchEvent is SYNCHRONOUS, so calling
 * input.lockPointer() inside a "ui-*" listener still counts as user
 * activation for the Pointer Lock API.
 */

/**
 * The shared bus. One EventTarget for the entire game — dispatch and listen
 * through this instance only.
 * @type {EventTarget}
 */
export const bus = new EventTarget();

/**
 * Game state machine + score keeping.
 *
 * Behavior:
 * - Listens on the bus:
 *   - "zombie-killed" → score += headshot ? Math.round(e.score * 1.5) : e.score;
 *     kills += 1.
 *   - "wave-start" → wave = e.n.
 *   - "player-died" → state = "gameover"; if score > settings.get().highScore,
 *     persist via settings.set({highScore: score}); then emit "state-changed"
 *     {state: "gameover", score, highScore}.
 *   - "pause-toggle" → if playing then addPause("user"); else if paused WITH
 *     the "user" reason set then removePause("user"). A shop-only pause
 *     (reason "shop" without "user") is deliberately untouched: the shop
 *     overlay owns Esc/B while it is open, so a stray "pause-toggle" (the P
 *     key path) can never lift the shop pause or strand an orphan reason.
 *   - "shop-open" → addPause("shop"); "shop-closed" → removePause("shop")
 *     (EXPANSION: pause by reason).
 * - PAUSE BY REASON (EXPANSION, docs/EXPANSION.md): paused ⇔ the `reasons`
 *   set ("shop" | "user") is non-empty. addPause(reason) records it (from a
 *   live run only) and flips to "paused" + emit on the first reason;
 *   removePause(reason) drops it and flips back to "playing" + emit when the
 *   last reason goes. hasPause(reason) reports membership (main.js uses it to
 *   keep the pause MENU hidden under the shop overlay while the run is still
 *   frozen). Esc/P keeps toggling exactly the "user" reason — legacy behavior
 *   unchanged whenever no shop is involved.
 * - start(): state = "playing", score = 0, kills = 0, wave = 1, reasons
 *   cleared, emit "state-changed". restart(): identical, from any state.
 *   toMenu(): state = "menu", reasons cleared, emit "state-changed".
 *   pause()/resume() are thin wrappers over addPause/removePause("user") —
 *   they only act from the matching situation and emit "state-changed" on the
 *   actual transition, exactly like before. A player death also clears every
 *   reason (the gameover screen has no pause contexts).
 * - NIGHT 30 P1 "intro" state (docs/EXPANSION-P1.md §5.6.1): startStory()
 *   zeroes the run counters exactly like freshRun() but lands in "intro"
 *   (story slides play over the dimmed world; main.js drives dialogue and
 *   calls beginPlay() at the end). beginPlay() flips ONLY "intro" → "playing"
 *   and emits; from any other state it is a no-op, which makes the slides'
 *   onDone callback safe to fire twice. pause-by-reason is untouched: a
 *   "pause-toggle"/"shop-open" while in "intro" records nothing and flips
 *   nothing (addPause only transitions from "playing"), and the intro screen
 *   needs the free cursor — input.js already releases the lock for every
 *   state ≠ "playing".
 * - Fresh-run money reset (EXPANSION): economy.reset() handles it — main.js
 *   calls economy.reset() in its freshRun(), and economy additionally
 *   listens "ui-play"/"ui-restart" itself (this module holds no economy ref;
 *   the createGamestate(bus, settings) signature stays frozen).
 * - update(dt): called by the main loop every frame while playing (dt in
 *   seconds); hook for future per-frame logic — must not throw.
 * - score/wave/kills live on the returned object (HUD reads them every frame
 *   via hud.update(player, weapons, gamestate)).
 *
 * @param {EventTarget} busArg - pass the shared `bus` exported by this module
 *   (main.js does); a standalone EventTarget is fine for isolated tests.
 * @param {import("../core/settings.js").SettingsStore} settings
 * @returns {Gamestate}
 */

/**
 * @typedef {("menu"|"intro"|"playing"|"paused"|"gameover")} GameStateName
 * NIGHT 30 P1 (docs/EXPANSION-P1.md §5.6.1): "intro" — the New Game story
 * slides run while the world renders dimmed behind them; nothing simulates
 * (main.js treats it like "menu": atmosphere + render only). Entering it via
 * startStory(), leaving it via beginPlay(). Every other state is untouched.
 */

/**
 * @typedef {("shop"|"user"|"outro"|"ending")} PauseReason - why the run is frozen. "user" is
 * the legacy Esc/P pause; "shop" is set while the shop overlay is open; "outro"
 * while the full-screen story outro owns the display; "ending" (NIGHT 30 P3,
 * P3-K10) while the boss-defeat ending sequence owns the display.
 */

/**
 * @typedef {Object} Gamestate
 * @property {GameStateName} state - current state.
 * @property {number} score - current run score.
 * @property {number} wave - current wave number (1-based; follows "wave-start").
 * @property {number} kills - zombies killed this run.
 * @property {() => void} start - menu → playing, fresh run.
 * @property {() => void} pause - playing → paused (reason "user").
 * @property {() => void} resume - paused → playing (drops reason "user").
 * @property {() => void} restart - any state → playing, fresh run.
 * @property {() => void} toMenu - any state → menu.
 * @property {(dt: number) => void} update - per-frame tick while playing.
 * @property {(reason: PauseReason) => void} addPause - EXPANSION: record a
 *   pause reason (live runs only); first reason flips playing → paused.
 * @property {(reason: PauseReason) => void} removePause - EXPANSION: drop a
 *   pause reason; the last one flips paused → playing.
 * @property {(reason: PauseReason) => boolean} hasPause - EXPANSION: true
 *   while `reason` is recorded (main.js: hide the pause menu under the shop).
 * @property {() => void} startStory - NIGHT 30 P1 (§5.6.1): fresh-run counters
 *   (like start()) but → state "intro" (story slides; main.js plays them and
 *   calls beginPlay() when the last slide is done/skipped).
 * @property {() => void} beginPlay - NIGHT 30 P1 (§5.6.1): ONLY from "intro"
 *   → state "playing" + emit. A no-op from any other state (guards the
 *   intro-slides onDone double-call).
 * @property {boolean} ngPlus - NIGHT 30 P3 (P3-K9/P3-K15): New Game+ is active
 *   for the current run. OWNED by main.js (beginNGPlus sets it true; the fresh
 *   story / free-roam starts set it false) — this module never flips it and
 *   freshRun() leaves it untouched.
 * @property {() => {timeSec: number, kills: number, moneyEarned: number, deaths: number, bossesKilled: number}} runStats
 *   NIGHT 30 P3 (P3-K11): snapshot for the ending screen. timeSec = seconds
 *   since the last freshRun(); kills mirrors gamestate.kills; moneyEarned =
 *   Σ positive "money-changed" deltas; deaths = "player-died" count;
 *   bossesKilled = "zombie-killed" count with type in the boss set
 *   {butcher, spitter, screamer, golem, origin}. All counters reset in
 *   freshRun() (per-run semantics — P3-K11 frozen wording).
 * @property {{saveNow: (reason: string) => {ok: boolean, ts?: number}} | null} saveDeps
 *   GUN GAME 2.0 P4 (docs/EXPANSION-P4.md §3.2, P4-K1): save wiring assigned
 *   by main.js right after createSave (`gamestate.saveDeps = { saveNow }`).
 *   While null the "save-request" listener is a no-op — autosave silently
 *   disabled. This module NEVER builds the snapshot itself: main.js owns it.
 */

export function createGamestate(busArg, settings) {
  // The shared bus is the default so `createGamestate(settings)` also works in
  // isolated tests; main.js passes it explicitly per the signature.
  const B = busArg || bus;

  const gamestate = {
    state: /** @type {GameStateName} */ ("menu"),
    score: 0,
    wave: 1,
    kills: 0,
    // NIGHT 30 P3 (P3-K9/P3-K15): NG+ flag — main.js owns it, freshRun() never
    // touches it (a keep-story restart must not drop the NG+ rule mid-run).
    ngPlus: false,
    runStats,
    start,
    startStory,
    beginPlay,
    pause,
    resume,
    restart,
    toMenu,
    update,
    addPause,
    removePause,
    hasPause,
  };

  // --- NIGHT 30 P3 run stats (P3-K11) -----------------------------------------
  // The ending screen reads these through runStats(). Counters are closure
  // state (not on the object) so nothing outside can desync them; only
  // freshRun() zeroes them. runStartAt uses performance.now() (P3-K11).
  let moneyEarned = 0;
  let deaths = 0;
  let bossesKilled = 0;
  let runStartAt = performance.now();
  // "zombie-killed" types that count as a BOSS for the ending stat (P3-K11:
  // the four part-2 bosses + the Origin).
  const BOSS_KILL_TYPES = { butcher: 1, spitter: 1, screamer: 1, golem: 1, origin: 1 };

  /**
   * Snapshot of the run stats for the ending screen (P3-K11). Kills mirror
   * gamestate.kills live; the rest are the counters above.
   * @returns {{timeSec: number, kills: number, moneyEarned: number, deaths: number, bossesKilled: number}}
   */
  function runStats() {
    return {
      timeSec: Math.max(0, Math.floor((performance.now() - runStartAt) / 1000)),
      kills: gamestate.kills,
      moneyEarned,
      deaths,
      bossesKilled,
    };
  }

  // --- pause by reason (EXPANSION, docs/EXPANSION.md) --------------------------
  // paused ⇔ this set is non-empty. Esc/P toggles ONLY the "user" reason;
  // the shop overlay drives the "shop" reason through bus events. Legacy
  // behavior (no shop involved) is byte-identical: one reason, same emits.
  /** @type {Set<PauseReason>} */
  const pauseReasons = new Set();

  /**
   * Record `reason` and freeze the run. Only meaningful mid-run: menu and
   * gameover have no pause contexts (the shop UI force-closes there anyway).
   * Re-adding an active reason is a no-op (no duplicate emits).
   * @param {PauseReason} reason
   */
  function addPause(reason) {
    const r = typeof reason === "string" ? reason : "";
    if (!r) return;
    if (gamestate.state === "menu" || gamestate.state === "gameover") return;
    if (pauseReasons.has(r)) return;
    pauseReasons.add(r);
    if (gamestate.state === "playing") {
      gamestate.state = "paused";
      emit();
    }
  }

  /**
   * Drop `reason`; when the LAST reason goes the run resumes (emit). Dropping
   * a reason that is not set is a no-op.
   * @param {PauseReason} reason
   */
  function removePause(reason) {
    const r = typeof reason === "string" ? reason : "";
    if (!pauseReasons.has(r)) return;
    pauseReasons.delete(r);
    if (pauseReasons.size === 0 && gamestate.state === "paused") {
      gamestate.state = "playing";
      emit();
    }
  }

  /**
   * @param {PauseReason} reason
   * @returns {boolean} true while `reason` is recorded.
   */
  function hasPause(reason) {
    return pauseReasons.has(typeof reason === "string" ? reason : "");
  }

  /** Fresh runs / menu / death leave no reasons behind (no emit of its own). */
  function clearPauses() {
    pauseReasons.clear();
  }

  /** Current best score, defensively read (settings is optional in tests). */
  function highScore() {
    if (settings && typeof settings.get === "function") {
      const h = Number(settings.get().highScore);
      if (Number.isFinite(h) && h > 0) return Math.floor(h);
    }
    return 0;
  }

  /** One "state-changed" {state, score, highScore} — menus + main route on it. */
  function emit() {
    B.dispatchEvent(
      new CustomEvent("state-changed", {
        detail: {
          state: gamestate.state,
          score: gamestate.score,
          highScore: highScore(),
        },
      })
    );
  }

  /** Shared body of start()/restart(): zero the run counters, go playing. */
  function freshRun() {
    clearPauses(); // a fresh run starts unfrozen (no shop / user reasons)
    gamestate.state = "playing";
    gamestate.score = 0;
    gamestate.kills = 0;
    gamestate.wave = 1;
    // NIGHT 30 P3 (P3-K11): the ending-screen stats are per-run — zeroed here
    // (the common body of start/startStory/restart). ngPlus is deliberately
    // NOT touched: main.js owns the flag (P3-K9/P3-K15).
    moneyEarned = 0;
    deaths = 0;
    bossesKilled = 0;
    runStartAt = performance.now();
    emit();
  }

  function start() {
    // Fresh run from wherever we are (menu / gameover / even playing — the
    // counters reset either way; main.js resets the world before calling).
    freshRun();
  }

  // NIGHT 30 P1 (§5.6.1): the story entry — same zeroed counters as a fresh
  // run, but the run begins behind the intro slides, not in the fight. main.js
  // resets the world before calling (same contract as start()).
  function startStory() {
    freshRun();
    gamestate.state = "intro";
    emit();
  }

  /** "intro" → "playing" ONLY (idempotent-guarded; slides onDone safe). */
  function beginPlay() {
    if (gamestate.state !== "intro") return;
    gamestate.state = "playing";
    emit();
  }

  function restart() {
    freshRun();
  }

  function pause() {
    addPause("user"); // only acts from "playing" (guard inside addPause)
  }

  function resume() {
    removePause("user"); // only acts while the "user" reason is set
  }

  function toMenu() {
    if (gamestate.state === "menu") return; // no-op transition
    clearPauses();
    gamestate.state = "menu";
    emit();
  }

  /**
   * Per-frame tick while playing. No per-frame logic needs to live here yet —
   * the wave director and HUD consume their own inputs — but the hook stays so
   * future logic does not touch the main loop. Must not throw.
   * @param {number} dt - seconds since the previous frame (already clamped).
   */
  function update(dt) {
    void dt;
  }

  // --- bus reactions ---------------------------------------------------------

  // Kills: score = BASE score from the zombie, x1.5 applied HERE (the zombie
  // emits the base value — do NOT pre-multiply on the emitting side).
  B.addEventListener("zombie-killed", (e) => {
    const d = e && e.detail ? e.detail : {};
    const base = Number(d.score);
    const pts = Number.isFinite(base) && base > 0 ? Math.round(base) : 0;
    gamestate.score += d.headshot ? Math.round(pts * 1.5) : pts;
    gamestate.kills += 1;
  });

  // Wave number follows the wave director.
  B.addEventListener("wave-start", (e) => {
    const n = Math.round(Number(e && e.detail ? e.detail.n : NaN));
    if (Number.isFinite(n) && n > 0) gamestate.wave = n;
  });

  // Death → gameover + persist the high score when beaten (exactly once per
  // run: player.damage() no-ops after death, so "player-died" cannot repeat).
  // Pause reasons die with the run — the gameover screen has no pause contexts.
  B.addEventListener("player-died", () => {
    // The ending sequence owns the screen after the Origin falls — a stray
    // melee landing on the exact victory frame must not flip gameover over it.
    if (hasPause("ending")) return;
    clearPauses();
    gamestate.state = "gameover";
    const best = highScore();
    if (gamestate.score > best && settings && typeof settings.set === "function") {
      settings.set({ highScore: gamestate.score });
    }
    emit();
  });

  // Esc/P: playing ⇄ paused (input.js emits exactly once per press), toggling
  // ONLY the "user" reason. A shop-only pause ("shop" set, "user" not) is
  // untouched: the shop overlay owns Esc/B while open, and a stray toggle
  // (the P key path) must never lift it or strand an orphan reason.
  B.addEventListener("pause-toggle", () => {
    if (gamestate.state === "playing") addPause("user");
    else if (gamestate.state === "paused" && pauseReasons.has("user")) {
      removePause("user");
    }
  });

  // EXPANSION: the shop overlay freezes the run under its own reason. The
  // shop UI releases the pointer lock BEFORE emitting "shop-open", so the
  // async lock-loss "pause-toggle" (input.js) arrives with "shop" already set
  // and input.js swallows it anyway (it tracks the overlay itself).
  B.addEventListener("shop-open", () => addPause("shop"));
  B.addEventListener("shop-closed", () => removePause("shop"));

  // NIGHT 30 P1: the full-screen outro owns the display — the world must not
  // simulate behind it (a player could die in the dark and the gameover panel
  // would sit under the overlay). Freeze under its own reason while it shows.
  B.addEventListener("outro-active", (e) => {
    const active = e && e.detail ? e.detail.active === true : false;
    if (active) addPause("outro");
    else removePause("outro");
  });

  // NIGHT 30 P3 (P3-K10): the ending sequence (slow-zoom approach → white
  // fade → stats panel) owns the display exactly like the outro — freeze
  // under its own reason while it runs. ending.js emits {active:false} in
  // hide(); Esc/P stays a no-op here (pause-toggle only drives "user").
  B.addEventListener("ending-active", (e) => {
    const active = e && e.detail ? e.detail.active === true : false;
    if (active) addPause("ending");
    else removePause("ending");
  });

  // NIGHT 30 P3 (P3-K11): run stats for the ending screen. Independent
  // listeners — the existing score/kill and gameover listeners stay untouched.
  B.addEventListener("money-changed", (e) => {
    const d = e && e.detail ? e.detail : {};
    const delta = Number(d.delta);
    if (Number.isFinite(delta) && delta > 0) moneyEarned += delta;
  });
  B.addEventListener("player-died", () => {
    deaths += 1;
  });
  B.addEventListener("zombie-killed", (e) => {
    const d = e && e.detail ? e.detail : {};
    if (d.type && BOSS_KILL_TYPES[d.type]) bossesKilled += 1;
  });

  // --- GUN GAME 2.0 P4 (docs/EXPANSION-P4.md §3.2): save wiring — Builder A ---
  // ADDITIVE block only: pause-by-reason, run stats, ngPlus and every legacy
  // listener above are untouched.
  //
  // gamestate.saveDeps is assigned by main.js right after createSave
  // (`gamestate.saveDeps = { saveNow: save.saveNow }` — P4-K1/K19); while it
  // is null the "save-request" listener below is a deliberate no-op.
  gamestate.saveDeps = null;

  /** Fire one save request; `reason` names the trigger (P4-K1). */
  function requestSave(reason) {
    B.dispatchEvent(new CustomEvent("save-request", { detail: { reason } }));
  }

  // The 4 autosave triggers. Registration order matters and is already right:
  // createGamestate() runs BEFORE main.js registers its own "ui-quit" listener
  // (main.js wires listeners after the factories), so on "ui-quit" this
  // requestSave fires while the run state still qualifies for a snapshot
  // ("paused"/"gameover" — §3.3), and on "player-died" it fires after the
  // gameover listener above has flipped the state (snapshot still allowed —
  // "lưu trước gameover" per P4-K1; score/kills/mission are unchanged by the
  // flip). main.js's snapshot() returns null at endless / menu states, so
  // wave-clears in Endless and quits from the menu no-op safely.
  B.addEventListener("mission-complete", () => requestSave("mission-complete"));
  B.addEventListener("wave-clear", () => requestSave("wave-clear"));
  B.addEventListener("player-died", () => requestSave("player-died"));
  B.addEventListener("ui-quit", () => requestSave("ui-quit"));

  B.addEventListener("save-request", (e) => {
    const deps = gamestate.saveDeps;
    if (deps && typeof deps.saveNow === "function") {
      const d = e && e.detail ? e.detail : {};
      deps.saveNow(typeof d.reason === "string" && d.reason ? d.reason : "auto");
    }
  });

  return gamestate;
}
