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
 * NOTE on zombie hit sounds: combat.js calls audio.zombieHit() directly
 * (combat owns audio); zombie.takeDamage() does NOT emit a hit-sound event —
 * this avoids 8 stacked sounds for one shotgun blast.
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
 *   - "pause-toggle" → if playing then pause(); else if paused then resume().
 * - start(): state = "playing", score = 0, kills = 0, wave = 1, emit
 *   "state-changed". restart(): identical, from any state. toMenu(): state =
 *   "menu", emit "state-changed". pause()/resume() only act from the matching
 *   state and also emit "state-changed".
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
 * @typedef {("menu"|"playing"|"paused"|"gameover")} GameStateName
 */

/**
 * @typedef {Object} Gamestate
 * @property {GameStateName} state - current state.
 * @property {number} score - current run score.
 * @property {number} wave - current wave number (1-based; follows "wave-start").
 * @property {number} kills - zombies killed this run.
 * @property {() => void} start - menu → playing, fresh run.
 * @property {() => void} pause - playing → paused.
 * @property {() => void} resume - paused → playing.
 * @property {() => void} restart - any state → playing, fresh run.
 * @property {() => void} toMenu - any state → menu.
 * @property {(dt: number) => void} update - per-frame tick while playing.
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
    start,
    pause,
    resume,
    restart,
    toMenu,
    update,
  };

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
    gamestate.state = "playing";
    gamestate.score = 0;
    gamestate.kills = 0;
    gamestate.wave = 1;
    emit();
  }

  function start() {
    // Fresh run from wherever we are (menu / gameover / even playing — the
    // counters reset either way; main.js resets the world before calling).
    freshRun();
  }

  function restart() {
    freshRun();
  }

  function pause() {
    if (gamestate.state !== "playing") return; // only acts from "playing"
    gamestate.state = "paused";
    emit();
  }

  function resume() {
    if (gamestate.state !== "paused") return; // only acts from "paused"
    gamestate.state = "playing";
    emit();
  }

  function toMenu() {
    if (gamestate.state === "menu") return; // no-op transition
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
  B.addEventListener("player-died", () => {
    gamestate.state = "gameover";
    const best = highScore();
    if (gamestate.score > best && settings && typeof settings.set === "function") {
      settings.set({ highScore: gamestate.score });
    }
    emit();
  });

  // Esc/P: playing ⇄ paused (input.js emits exactly once per press).
  B.addEventListener("pause-toggle", () => {
    if (gamestate.state === "playing") pause();
    else if (gamestate.state === "paused") resume();
  });

  return gamestate;
}
