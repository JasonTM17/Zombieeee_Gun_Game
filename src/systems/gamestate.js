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
  throw new Error("TODO: implement");
}
