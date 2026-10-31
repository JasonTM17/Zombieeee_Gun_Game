/**
 * DOM HUD overlay rendered inside #ui (position absolute; index.html sets
 * #ui { pointer-events: none } — the HUD never re-enables it, it is not
 * clickable). ALL text goes through i18n.t() (extra keys may be registered
 * via i18n.registerBundle; core already provides score/wave/waveBanner/waveClear).
 *
 * Elements (per spec):
 * - Health bar, left corner, drains as hp drops.
 * - Ammo "mag / reserve" + weapon name, right corner (i18n-independent numbers;
 *   weapon name via weapon.name). Reserve shows "∞" for the pistol's Infinity.
 * - Wave + score, top center (i18n keys "wave", "score").
 * - Kill feed: 3 lines max, newest on top, each fading out (~3 s); listens
 *   "zombie-killed" on the bus.
 * - Crosshair: 4 ticks that expand with the current spread — listens
 *   "spread" {value} (radians) on the bus; offset = base + value * scale.
 * - Hitmarker: an X at the center, white — bold red when headshot; listens
 *   "hit" {headshot, killed}. (The sound is played by combat.js directly.)
 * - Damage vignette: persistent red overlay whose opacity follows the MISSING
 *   hp (subtle at full hp); plus a STRONG flash when hp drops — detected in
 *   update() by comparing against the previous frame's hp ("nghe qua
 *   update(hp)"), strength proportional to the damage taken.
 * - Wave banner: big centered "WAVE n" (i18n "waveBanner" with {n}) shown ~2 s
 *   with fade on "wave-start" {n}; this module also plays audio.waveBanner()
 *   there (the HUD owns an audio reference), and may show a "waveClear"
 *   banner on "wave-clear".
 *
 * update(player, weapons, gamestate) — called by the main loop EVERY FRAME
 * while playing:
 *   @param player    - the Player object (read hp, alive, position).
 *   @param weapons   - the object returned by weapons.getState()
 *                      ({name, mag, magSize, reserve, reloading, spread}).
 *   @param gamestate - the Gamestate object (read score, wave, kills).
 *
 * show(bool): show/hide the whole HUD (main.js: true while playing/paused,
 * false in menu/gameover).
 *
 * flashDamage(intensity): strong red screen flash, intensity 0..1 — called
 * internally from update()'s hp-drop detection; exposed so main.js/debug can
 * trigger it directly.
 *
 * Bus events consumed: "zombie-killed", "spread", "hit", "wave-start", "wave-clear".
 * Bus-driven sounds: audio.waveBanner() on "wave-start".
 *
 * @param {HTMLElement} container - the #ui element.
 * @param {EventTarget} bus
 * @param {import("../core/audio.js").Audio} audio
 * @param {{t: Function, registerBundle: Function, setLang: Function, getLang: Function}} i18n
 *   The i18n module namespace (see src/core/i18n.js).
 * @returns {Hud}
 */

/**
 * @typedef {Object} Hud
 * @property {(player: import("../player/controller.js").Player,
 *             weapons: import("../player/weapons.js").WeaponState,
 *             gamestate: import("../systems/gamestate.js").Gamestate) => void} update
 * @property {(visible: boolean) => void} show
 * @property {(intensity: number) => void} flashDamage - strong red flash, 0..1.
 */

export function createHud(container, bus, audio, i18n) {
  throw new Error("TODO: implement");
}
