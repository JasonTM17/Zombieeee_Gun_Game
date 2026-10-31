/**
 * Procedural sound engine. EVERY sound is synthesized with WebAudio
 * (noise bursts + filters/oscillators + envelopes). No audio files, no
 * external assets — this is a hard project rule.
 *
 * AudioContext lifecycle:
 * - Created LAZILY after the first user gesture: add a one-time
 *   pointerdown/keydown listener on document internally; before the context
 *   exists every sound method is a safe no-op (must never throw).
 * - setVolume() works any time: it stores the value and applies it as soon as
 *   the context exists.
 * - startAmbient() starts the looping night ambience (synth drone / wind) the
 *   first time it is called after the context exists; if called before, it
 *   takes effect as soon as the context is created.
 *
 * Initial master volume comes from settings.get().volume (0..1).
 * Live volume changes arrive as "settings-changed" { patch } on the bus —
 * main.js routes them to setVolume(); this module does not subscribe itself.
 *
 * Call-site notes (who triggers what — see the event table in gamestate.js):
 * - gunshot / hitmarker / reloadStart / reloadEnd: called directly by
 *   weapons.js / combat.js (they hold an audio reference).
 * - footstep ("footstep" event), playerHurt ("player-hurt" event),
 *   pickup ("pickup" event): emitted by modules that have NO audio reference;
 *   main.js routes those bus events to these methods.
 * - waveBanner: called by hud.js when it handles "wave-start".
 * - zombieGrowl: ambient growl; main.js or the zombie layer may schedule it
 *   randomly (e.g. based on nearest zombie distance) — wiring is up to main.js.
 *
 * @param {import("./settings.js").SettingsStore} settings
 * @returns {Audio}
 */

/**
 * @typedef {Object} Audio
 * @property {(kind: "pistol"|"shotgun"|"rifle") => void} gunshot
 *   Synthesized shot; shotgun bigger/longer than pistol, rifle a shorter snap.
 * @property {() => void} zombieGrowl - low guttural growl (ambient).
 * @property {() => void} zombieHit - fleshy impact when a zombie takes damage.
 * @property {() => void} playerHurt - player pain/impact sound.
 * @property {() => void} reloadStart - magazine-out click at reload start.
 * @property {() => void} reloadEnd - magazine-in / chambered click at reload end.
 * @property {() => void} footstep - soft player step.
 * @property {() => void} pickup - item pickup blip.
 * @property {(headshot: boolean) => void} hitmarker
 *   Short tick; brighter/higher pitch when headshot is true.
 * @property {() => void} waveBanner - dramatic sting for the wave banner.
 * @property {() => void} startAmbient - start the looping night ambience once.
 * @property {(v: number) => void} setVolume - master volume, clamped to 0..1.
 */

export function createAudio(settings) {
  throw new Error("TODO: implement");
}
