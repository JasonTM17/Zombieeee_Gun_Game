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
 * main.js routes them to setVolume(); this module does not subscribe itself
 * for VOLUME.
 *
 * NIGHT 30 P2 (docs/EXPANSION-P2.md §5) — ZOMBIE VOICES: the module NOW
 * subscribes to the shared bus itself (imported from gamestate.js) for the
 * voice layer:
 * - "zombie-voice" {kind, type, position} → synthesized per-type × per-kind
 *   voice (7 types × 6 kinds, all WebAudio — no files), 3D-mixed;
 * - "boss-roar" {type, action} → the boss recipe (windup → metal roar,
 *   spit → wet spit, shriek → high wail, slam → stone groan) — main.js no
 *   longer routes this event (P2-K9);
 * - "event-start"/"event-end" {type:"horde"} and "bloodmoon-active" {active}
 *   → the herd murmur plays ×1.6 while either is active.
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
 * - update3D: called by main.js every frame while playing (after the zombie
 *   update) — remembers the camera + zombie list for the async voice events,
 *   prunes finished voices and drives the herd murmur from the near count.
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
 * @property {(camera: import("three").Camera, zombies: import("../zombies/zombie.js").Zombie[]) => void} update3D
 *   Per-frame 3D voice pass (NIGHT 30 P2 §5.4): remembers the camera + zombie
 *   list for the async "zombie-voice"/"boss-roar" events, prunes finished
 *   voices and drives the herd murmur from the < 20 m zombie count.
 * @property {() => {ctxState: string, activeVoices: number}} audioState
 *   Debug snapshot (NIGHT 30 P2 §5.4): context state + live voice count.
 */

import { bus } from "../systems/gamestate.js"; // shared bus — voice events (NIGHT 30 P2 §5.4)

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// --- NIGHT 30 P2 §5 (docs/EXPANSION-P2.md): zombie voice engine constants ----

const VOICE_CAP = 8; // concurrent voices (contract §5.4 — nearest wins)
const VOICE_NEAR = 3; // full volume closer than this (m)
const VOICE_FAR = 35; // voices are cut beyond this (m; 3→35 linear lerp)
const MURMUR_NEAR = 20; // the murmur counts zombies closer than this (m)
const MURMUR_MAX = 0.018; // murmur level at ≥ 5 near zombies (contract §5.4)
const MURMUR_TAU = 0.4; // murmur smoothing time constant (s)
const VOICE_MURMUR_BOOST = 1.6; // murmur ×1.6 during horde / bloodmoon

/** Base gain per voice kind — the peak stays ≤ 0.35 after the distance
 * multiplier (contract §5.3); recipe sub-sounds carry relative weights. */
const KIND_GAIN = { idle: 0.3, alert: 0.35, chase: 0.22, attack: 0.32, pain: 0.26, death: 0.34 };

/** WaveShaper drive per type (contract §5.3: brute tanh k≈30 "meat grinder";
 * bosses distort too — screamer/spitter only get a light grit). */
const SHAPER_K = { brute: 30, butcher: 30, golem: 30, screamer: 8, spitter: 8 };

/** Regular (non-boss) types — a boss ALWAYS wins a voice slot (contract §5.4). */
const BASE_TYPES = { walker: 1, runner: 1, brute: 1 };

/** Tanh soft-clip curve cache, keyed by drive k (257-step, normalized ±1). */
const voiceCurves = new Map();
function tanhCurve(k) {
  let c = voiceCurves.get(k);
  if (!c) {
    c = new Float32Array(257);
    const norm = Math.tanh(k);
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1;
      c[i] = Math.tanh(x * k) / norm;
    }
    voiceCurves.set(k, c);
  }
  return c;
}

/** ±10 % random pitch drift so repeated calls never sound machine-made. */
const drift = (f) => f * (0.9 + Math.random() * 0.2);

export function createAudio(settings) {
  /** @type {AudioContext|null} */
  let ctx = null;
  /** @type {GainNode|null} */
  let master = null;
  /** @type {AudioBuffer|null} */
  let noiseBuf = null;
  let volume = clamp01(
    settings && typeof settings.get === "function"
      ? Number(settings.get().volume)
      : 0.8
  );
  if (!Number.isFinite(volume)) volume = 0.8;
  let ambientWanted = false;
  /** @type {{sources: AudioScheduledSourceNode[]}|null} */
  let ambient = null;

  // NIGHT 30 P2 §5: voice engine state (engine block below the helpers).
  /** @type {{endsAt: number, dist: number, vg: GainNode, nodes: AudioScheduledSourceNode[]}[]} */
  const voices = [];
  /** @type {import("three").Camera|null} camera seen by the last update3D */
  let camRef = null;
  /** @type {import("../zombies/zombie.js").Zombie[]|null} list from update3D */
  let zombiesRef = null;
  /** Set while a recipe runs: helpers register their sources for cap eviction. */
  let voiceSink = null;
  let hordeMurmur = false; // "event-start" {type:"horde"} → ×1.6 until "event-end"
  let bloodMurmur = false; // "bloodmoon-active" {active:true} → ×1.6
  /** @type {{gain: GainNode}|null} murmur bed (created with the ambient nodes) */
  let murmur = null;
  let murmurTarget = -1; // last level handed to setTargetAtTime (skip no-ops)

  // --- context lifecycle ----------------------------------------------------

  function createContext() {
    if (ctx) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return; // no WebAudio: every method stays a safe no-op
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    // Shared 2 s white-noise buffer — every noise burst is a slice of it.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    if (ambientWanted) startAmbientNodes();
  }

  function onGesture() {
    if (!ctx) createContext();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  }
  // Attached for the lifetime of the page: the first call creates the
  // context ("lazily after the first user gesture"); later calls re-resume
  // a context the browser suspended after a tab switch.
  document.addEventListener("pointerdown", onGesture);
  document.addEventListener("keydown", onGesture);

  /** Common guard for every sound method: true only when audible now. */
  function ready() {
    if (!ctx || !master) return false;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx.state === "running" || ctx.state === "suspended";
  }

  // --- synth helpers --------------------------------------------------------

  /** Insert a tanh WaveShaper after `node`, return the shaper (drive > 0). */
  function throughShaper(node, k) {
    const ws = ctx.createWaveShaper();
    ws.curve = tanhCurve(k);
    ws.oversample = "2x";
    node.connect(ws);
    return ws;
  }

  /** Connect an envelope gain to `dest`, inserting a StereoPanner for `pan`. */
  function routeOut(node, pan, dest) {
    if (
      pan !== null &&
      pan !== undefined &&
      typeof ctx.createStereoPanner === "function"
    ) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = Math.max(-1, Math.min(1, Number(pan)));
      node.connect(pn);
      pn.connect(dest);
      return;
    }
    node.connect(dest);
  }

  /**
   * Noise burst: buffer source -> biquad -> [distortion] -> gain envelope ->
   * [panner] -> out (default master). `t0` is an offset in seconds from now.
   *
   * NIGHT 30 P2 §5.3 additions — ALL optional, every existing call site is
   * unchanged: `out` routes into a caller-built chain (voice mixing),
   * `gainMul` scales the envelope level, `pan` inserts a StereoPanner,
   * `drive` adds a tanh WaveShaper in front of the envelope, `freq1` sweeps
   * the filter frequency over the burst, and `lfoFreq`/`lfoDepth` wobble the
   * filter frequency (wet gurgle textures). Returns the started sources (or
   * null) so the voice cap can hard-stop an evicted voice.
   */
  function playNoise({ dur, type = "lowpass", freq = 1000, freq1 = 0, q = 1, gain = 0.3, attack = 0.002, when = 0, rate = 1, out = null, gainMul = 1, pan = null, drive = 0, lfoFreq = 0, lfoDepth = 0 }) {
    if (!ctx || !master || !noiseBuf) return null;
    const dest = out || master;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = rate;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(Math.max(10, freq), t0);
    if (freq1 && freq1 !== freq) {
      filt.frequency.exponentialRampToValueAtTime(Math.max(10, freq1), t0 + dur);
    }
    filt.Q.value = q;
    if (lfoFreq > 0 && lfoDepth > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = lfoFreq;
      const lfoG = ctx.createGain();
      lfoG.gain.value = lfoDepth;
      lfo.connect(lfoG);
      lfoG.connect(filt.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);
      if (voiceSink) voiceSink.push(lfo);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain * gainMul, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    let tail = filt;
    if (drive > 0) tail = throughShaper(tail, drive);
    tail.connect(g);
    routeOut(g, pan, dest);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
    if (voiceSink) voiceSink.push(src);
    return [src];
  }

  /**
   * Oscillator tone with optional exponential pitch glide f0 -> f1.
   * `t0` is an offset in seconds from now. P2 §5.3 additions: `out`,
   * `gainMul`, `pan`, `drive` (see playNoise). Returns the started sources.
   */
  function playTone({ type = "sine", f0 = 440, f1 = 0, dur = 0.2, gain = 0.2, attack = 0.002, when = 0, out = null, gainMul = 1, pan = null, drive = 0 }) {
    if (!ctx || !master) return null;
    const dest = out || master;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, f0), t0);
    if (f1 && f1 !== f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain * gainMul, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let tail = osc;
    if (drive > 0) tail = throughShaper(tail, drive);
    tail.connect(g);
    routeOut(g, pan, dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    if (voiceSink) voiceSink.push(osc);
    return [osc];
  }

  /**
   * Sustained oscillator with lowpass + LFO on filter frequency (growls,
   * stings). Self-stops after `dur`. P2 §5.3 additions: `out`, `gainMul`,
   * `pan`, `drive`, and `f1` — an explicit pitch-glide target (default keeps
   * the old f0 → f0×0.7 fall). Returns the started sources.
   */
  function playWobble({ type = "sawtooth", f0, f1 = 0, detune = 0, dur, gain = 0.2, lfoFreq = 6, lfoDepth = 20, cutoff = 300, when = 0, out = null, gainMul = 1, pan = null, drive = 0 }) {
    if (!ctx || !master) return null;
    const dest = out || master;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1 > 0 ? f1 : f0 * 0.7), t0 + dur);
    osc.detune.value = detune;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = cutoff;
    filt.Q.value = 4;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = lfoFreq;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = lfoDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(filt.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain * gainMul, t0 + 0.05);
    g.gain.setValueAtTime(gain * gainMul, t0 + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(filt);
    let tail = filt;
    if (drive > 0) tail = throughShaper(tail, drive);
    tail.connect(g);
    routeOut(g, pan, dest);
    osc.start(t0);
    lfo.start(t0);
    osc.stop(t0 + dur + 0.05);
    lfo.stop(t0 + dur + 0.05);
    if (voiceSink) voiceSink.push(osc, lfo);
    return [osc, lfo];
  }

  // --- the voice engine (NIGHT 30 P2 §5.3/§5.4 — 7 types × 6 kinds) ---------
  // Every recipe is (out, gainMul, drive) → seconds until the voice ends.
  // Sub-sound gains are RELATIVE (simultaneous parts sum to ≤ 1); `gainMul`
  // scales the whole recipe to the kind's base level (KIND_GAIN ≤ 0.35).
  // Frequencies drift ±10 % per play via drift(). No files — pure WebAudio.

  const RECIPES = {
    walker: {
      // Low slow moan — saw 55–75 Hz, LFO 4–6 Hz, cutoff ~220, 1.2–1.8 s.
      idle(o, m) {
        const dur = 1.2 + Math.random() * 0.6;
        playWobble({ type: "sawtooth", f0: drift(55 + Math.random() * 20), dur, gain: 1, lfoFreq: 4 + Math.random() * 2, lfoDepth: 25, cutoff: 220, out: o, gainMul: m });
        return dur;
      },
      // 2–3 rapid wobbles 80–110 Hz, 0.25 s each, ~90 ms apart.
      alert(o, m) {
        const n = 2 + (Math.random() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          playWobble({ type: "sawtooth", f0: drift(80 + Math.random() * 30), dur: 0.25, gain: 0.8, lfoFreq: 9 + Math.random() * 3, lfoDepth: 30, cutoff: 280, when: i * 0.14, out: o, gainMul: m });
        }
        return (n - 1) * 0.14 + 0.25;
      },
      // One softer wobble 70–95 Hz (chase sits below alert via KIND_GAIN).
      chase(o, m) {
        playWobble({ type: "sawtooth", f0: drift(70 + Math.random() * 25), dur: 0.5, gain: 1, lfoFreq: 8, lfoDepth: 25, cutoff: 240, out: o, gainMul: m });
        return 0.5;
      },
      // Snap (highpass noise) + a growling saw sweep 140→70.
      attack(o, m) {
        playNoise({ type: "highpass", freq: 900, dur: 0.08, gain: 0.5, out: o, gainMul: m });
        playTone({ type: "sawtooth", f0: drift(140), f1: 70, dur: 0.25, gain: 0.8, out: o, gainMul: m });
        return 0.25;
      },
      pain(o, m) {
        playTone({ type: "sawtooth", f0: drift(180), f1: 90, dur: 0.18, gain: 1, out: o, gainMul: m });
        return 0.18;
      },
      // Thrash + exponential fade: wobble 90→35 + noise sweep 500→120.
      death(o, m) {
        playWobble({ type: "sawtooth", f0: drift(90), f1: 35, dur: 0.9, gain: 1, lfoFreq: 6, lfoDepth: 30, cutoff: 200, out: o, gainMul: m });
        playNoise({ type: "lowpass", freq: 500, freq1: 120, dur: 0.9, gain: 0.6, out: o, gainMul: m });
        return 0.9;
      },
    },
    runner: {
      // Hoarse, higher, fast — saw 95–130 Hz, LFO 9–12 Hz, 0.6–0.9 s.
      idle(o, m) {
        const dur = 0.6 + Math.random() * 0.3;
        playWobble({ type: "sawtooth", f0: drift(95 + Math.random() * 35), dur, gain: 1, lfoFreq: 9 + Math.random() * 3, lfoDepth: 35, cutoff: 420, out: o, gainMul: m });
        return dur;
      },
      // 3–4 staccato wobbles 140–190 Hz on a ~70–90 ms beat.
      alert(o, m) {
        const n = 3 + (Math.random() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          playWobble({ type: "sawtooth", f0: drift(140 + Math.random() * 50), dur: 0.13, gain: 0.8, lfoFreq: 12, lfoDepth: 40, cutoff: 500, when: i * 0.09, out: o, gainMul: m });
        }
        return (n - 1) * 0.09 + 0.13;
      },
      // Short bandpassed hiss 500–900 Hz (the emit cycle carries the rhythm).
      chase(o, m) {
        playNoise({ type: "bandpass", freq: drift(500 + Math.random() * 400), q: 2.5, dur: 0.15, gain: 0.9, out: o, gainMul: m });
        return 0.15;
      },
      attack(o, m) {
        playNoise({ type: "bandpass", freq: 1400, q: 1.5, dur: 0.06, gain: 0.5, out: o, gainMul: m });
        playTone({ type: "sawtooth", f0: drift(240), f1: 120, dur: 0.18, gain: 0.8, out: o, gainMul: m });
        return 0.18;
      },
      // Sharp, high — saw 300→150.
      pain(o, m) {
        playTone({ type: "sawtooth", f0: drift(300), f1: 150, dur: 0.14, gain: 0.9, attack: 0.001, out: o, gainMul: m });
        return 0.14;
      },
      death(o, m) {
        playWobble({ type: "sawtooth", f0: drift(150), f1: 55, dur: 0.6, gain: 1, lfoFreq: 9, lfoDepth: 35, cutoff: 400, out: o, gainMul: m });
        playNoise({ type: "bandpass", freq: 800, freq1: 200, q: 2, dur: 0.6, gain: 0.5, out: o, gainMul: m });
        return 0.6;
      },
    },
    brute: {
      // Meat-grinder idle: saw 45–60 Hz + 30 Hz sub, LFO 2–4 Hz, distorted.
      idle(o, m, d) {
        const dur = 1.5 + Math.random() * 0.7;
        playWobble({ type: "sawtooth", f0: drift(45 + Math.random() * 15), dur, gain: 0.8, lfoFreq: 2 + Math.random() * 2, lfoDepth: 18, cutoff: 200, out: o, gainMul: m, drive: d });
        playTone({ type: "sine", f0: drift(30), dur, gain: 0.5, out: o, gainMul: m, drive: d });
        return dur;
      },
      // Two wobbles 60–85 Hz + a low noise bed, ~0.8 s.
      alert(o, m, d) {
        playWobble({ type: "sawtooth", f0: drift(60 + Math.random() * 25), dur: 0.4, gain: 0.9, lfoFreq: 8, lfoDepth: 25, cutoff: 240, out: o, gainMul: m, drive: d });
        playWobble({ type: "sawtooth", f0: drift(60 + Math.random() * 25), dur: 0.4, gain: 0.9, lfoFreq: 8, lfoDepth: 25, cutoff: 240, when: 0.45, out: o, gainMul: m, drive: d });
        playNoise({ type: "lowpass", freq: 300, dur: 0.8, gain: 0.5, out: o, gainMul: m, drive: d });
        return 0.85;
      },
      chase(o, m, d) {
        playWobble({ type: "sawtooth", f0: drift(50 + Math.random() * 20), dur: 0.9, gain: 1, lfoFreq: 5, lfoDepth: 20, cutoff: 220, out: o, gainMul: m, drive: d });
        return 0.9;
      },
      // Thud: low noise + sine 90→45, through the grinder.
      attack(o, m, d) {
        playNoise({ type: "lowpass", freq: 250, dur: 0.12, gain: 0.9, out: o, gainMul: m, drive: d });
        playTone({ type: "sine", f0: drift(90), f1: 45, dur: 0.3, gain: 0.9, out: o, gainMul: m, drive: d });
        return 0.3;
      },
      pain(o, m, d) {
        playTone({ type: "sawtooth", f0: drift(120), f1: 60, dur: 0.25, gain: 1, out: o, gainMul: m, drive: d });
        return 0.25;
      },
      // Long fall: wobble 70→28 + rumble sweep 200→60, distorted.
      death(o, m, d) {
        playWobble({ type: "sawtooth", f0: drift(70), f1: 28, dur: 1.2, gain: 1, lfoFreq: 4, lfoDepth: 25, cutoff: 160, out: o, gainMul: m, drive: d });
        playNoise({ type: "lowpass", freq: 200, freq1: 60, dur: 1.2, gain: 0.6, out: o, gainMul: m, drive: d });
        return 1.2;
      },
    },
    butcher: {
      // Rare and slower than the brute idle — the butcher saves his voice.
      idle(o, m, d) {
        const dur = 1.8 + Math.random() * 0.7;
        playWobble({ type: "sawtooth", f0: drift(40 + Math.random() * 12), dur, gain: 0.8, lfoFreq: 2, lfoDepth: 15, cutoff: 180, out: o, gainMul: m, drive: d });
        playTone({ type: "sine", f0: drift(26), dur, gain: 0.4, out: o, gainMul: m, drive: d });
        return dur;
      },
      // Metallic: square 110 Hz + a resonant bandpass ring 1400 Hz Q 8.
      alert(o, m, d) {
        playTone({ type: "square", f0: drift(110), dur: 0.5, gain: 0.6, out: o, gainMul: m, drive: d });
        playNoise({ type: "bandpass", freq: 1400, q: 8, dur: 0.5, gain: 0.45, attack: 0.004, out: o, gainMul: m, drive: d });
        return 0.5;
      },
      chase(o, m, d) {
        playWobble({ type: "sawtooth", f0: drift(65), dur: 0.7, gain: 1, lfoFreq: 5, lfoDepth: 20, cutoff: 350, out: o, gainMul: m, drive: d });
        return 0.7;
      },
      // "windup": the metal roar — saw+square 90–130 Hz, ringing bandpass
      // 1200–1800 Hz, heavy distortion, 1.1 s.
      attack(o, m, d) {
        const f = drift(90 + Math.random() * 40);
        playTone({ type: "sawtooth", f0: f, f1: f * 0.6, dur: 1.1, gain: 0.7, out: o, gainMul: m, drive: d });
        playTone({ type: "square", f0: drift(100 + Math.random() * 30), f1: 60, dur: 1.1, gain: 0.45, out: o, gainMul: m, drive: d });
        playNoise({ type: "bandpass", freq: drift(1200 + Math.random() * 600), q: 9, dur: 1.0, gain: 0.5, attack: 0.004, out: o, gainMul: m, drive: d });
        return 1.1;
      },
      pain(o, m, d) {
        playTone({ type: "square", f0: drift(100), f1: 50, dur: 0.3, gain: 0.9, out: o, gainMul: m, drive: d });
        return 0.3;
      },
      // Falling metal: bandpass sweep 900→300 + a long low wobble 80→30.
      death(o, m, d) {
        playNoise({ type: "bandpass", freq: 900, freq1: 300, q: 5, dur: 1.1, gain: 0.6, out: o, gainMul: m, drive: d });
        playWobble({ type: "sawtooth", f0: drift(80), f1: 30, dur: 1.3, gain: 0.9, lfoFreq: 4, lfoDepth: 25, cutoff: 200, out: o, gainMul: m, drive: d });
        return 1.3;
      },
    },
    spitter: {
      // Wet gurgle: bandpassed noise 400–700 Hz with a 5 Hz filter wobble.
      idle(o, m, d) {
        playNoise({ type: "bandpass", freq: drift(400 + Math.random() * 300), q: 4, dur: 0.8, gain: 1, lfoFreq: 5, lfoDepth: 150, out: o, gainMul: m, drive: d });
        return 0.8;
      },
      // Two dry hacks.
      alert(o, m, d) {
        playNoise({ type: "bandpass", freq: 800, q: 3, dur: 0.1, gain: 0.8, out: o, gainMul: m, drive: d });
        playNoise({ type: "bandpass", freq: drift(800), q: 3, dur: 0.1, gain: 0.8, when: 0.14, out: o, gainMul: m, drive: d });
        return 0.24;
      },
      chase(o, m, d) {
        playNoise({ type: "bandpass", freq: drift(600), q: 3, dur: 0.2, gain: 0.7, out: o, gainMul: m, drive: d });
        return 0.2;
      },
      // "spit": WET — bandpass 700→300 Q 3 with an 18 Hz filter quiver plus
      // a pitch-down blip 300→120.
      attack(o, m, d) {
        playNoise({ type: "bandpass", freq: 700, freq1: 300, q: 3, dur: 0.28, gain: 1, lfoFreq: 18, lfoDepth: 200, out: o, gainMul: m, drive: d });
        playTone({ type: "sine", f0: drift(300), f1: 120, dur: 0.28, gain: 0.6, out: o, gainMul: m, drive: d });
        return 0.28;
      },
      pain(o, m, d) {
        playTone({ type: "sine", f0: drift(380), f1: 190, dur: 0.15, gain: 0.9, out: o, gainMul: m, drive: d });
        playNoise({ type: "bandpass", freq: 500, q: 3, dur: 0.08, gain: 0.35, out: o, gainMul: m, drive: d });
        return 0.15;
      },
      // Long spit + froth, fading out.
      death(o, m, d) {
        playNoise({ type: "bandpass", freq: 500, freq1: 200, q: 3, dur: 0.7, gain: 1, out: o, gainMul: m, drive: d });
        playNoise({ type: "bandpass", freq: 600, q: 4, dur: 0.35, gain: 0.4, out: o, gainMul: m, drive: d });
        return 0.7;
      },
    },
    screamer: {
      // High hiccup: saw 300–420 Hz with a deep filter vibrato.
      idle(o, m, d) {
        playWobble({ type: "sawtooth", f0: drift(300 + Math.random() * 120), dur: 0.5, gain: 0.7, lfoFreq: 7, lfoDepth: 300, cutoff: 900, out: o, gainMul: m, drive: d });
        return 0.5;
      },
      // Short RISING wail 500→700.
      alert(o, m, d) {
        playTone({ type: "sawtooth", f0: drift(500), f1: 700, dur: 0.25, gain: 0.8, out: o, gainMul: m, drive: d });
        return 0.25;
      },
      chase(o, m, d) {
        playWobble({ type: "sawtooth", f0: drift(400 + Math.random() * 150), dur: 0.35, gain: 0.55, lfoFreq: 8, lfoDepth: 250, cutoff: 800, out: o, gainMul: m, drive: d });
        return 0.35;
      },
      attack(o, m, d) {
        playTone({ type: "sawtooth", f0: drift(450), f1: 380, dur: 0.2, gain: 0.8, out: o, gainMul: m, drive: d });
        return 0.2;
      },
      pain(o, m, d) {
        playTone({ type: "sawtooth", f0: drift(700), f1: 400, dur: 0.2, gain: 0.8, out: o, gainMul: m, drive: d });
        return 0.2;
      },
      // The signature wail: 600→900→300 over 1 s, deep vibrato, light grit.
      death(o, m, d) {
        playTone({ type: "sawtooth", f0: drift(600), f1: 900, dur: 0.4, gain: 0.8, out: o, gainMul: m, drive: d });
        playTone({ type: "sawtooth", f0: 900, f1: 300, dur: 0.6, gain: 0.8, when: 0.4, out: o, gainMul: m, drive: d });
        playWobble({ type: "sawtooth", f0: drift(650), dur: 1.0, gain: 0.4, lfoFreq: 9, lfoDepth: 350, cutoff: 1200, out: o, gainMul: m, drive: d });
        return 1.0;
      },
      // "shriek" — the special-move roar (boss-roar action), a tighter,
      // rising-then-collapsing version of the death wail.
      shriek(o, m, d) {
        playTone({ type: "sawtooth", f0: drift(500), f1: 750, dur: 0.35, gain: 0.8, out: o, gainMul: m, drive: d });
        playTone({ type: "sawtooth", f0: 750, f1: 300, dur: 0.45, gain: 0.7, when: 0.35, out: o, gainMul: m, drive: d });
        playWobble({ type: "sawtooth", f0: drift(600), dur: 0.8, gain: 0.4, lfoFreq: 10, lfoDepth: 300, cutoff: 1100, out: o, gainMul: m, drive: d });
        return 0.8;
      },
    },
    golem: {
      // Stone groan: 30–45 Hz + a 24 Hz sub, 2–3 s, heavy distortion.
      idle(o, m, d) {
        const dur = 2 + Math.random();
        const f = drift(30 + Math.random() * 15);
        playWobble({ type: "sawtooth", f0: f, f1: f * 0.55, dur, gain: 0.9, lfoFreq: 1.5, lfoDepth: 10, cutoff: 120, out: o, gainMul: m, drive: d });
        playTone({ type: "sine", f0: 24, dur, gain: 0.5, out: o, gainMul: m, drive: d });
        return dur;
      },
      // Grinding stone: low noise + a 40 Hz groan.
      alert(o, m, d) {
        playNoise({ type: "lowpass", freq: 150, dur: 0.6, gain: 0.8, out: o, gainMul: m, drive: d });
        playWobble({ type: "sawtooth", f0: drift(40), dur: 0.6, gain: 0.6, lfoFreq: 2, lfoDepth: 10, cutoff: 130, out: o, gainMul: m, drive: d });
        return 0.6;
      },
      chase(o, m, d) {
        playWobble({ type: "sawtooth", f0: drift(35), dur: 0.8, gain: 1, lfoFreq: 3, lfoDepth: 12, cutoff: 130, out: o, gainMul: m, drive: d });
        return 0.8;
      },
      // "slam": stone groan 45→28 + a 120 Hz thud, heavy distortion.
      attack(o, m, d) {
        playWobble({ type: "sawtooth", f0: drift(45), f1: 28, dur: 0.8, gain: 1, lfoFreq: 2.5, lfoDepth: 14, cutoff: 140, out: o, gainMul: m, drive: d });
        playNoise({ type: "lowpass", freq: 120, dur: 0.25, gain: 0.9, out: o, gainMul: m, drive: d });
        return 0.8;
      },
      pain(o, m, d) {
        playWobble({ type: "sawtooth", f0: drift(80), f1: 40, dur: 0.35, gain: 0.9, lfoFreq: 4, lfoDepth: 15, cutoff: 200, out: o, gainMul: m, drive: d });
        return 0.35;
      },
      // Collapsing rock: noise 300→60 + a groan grinding to a stop.
      death(o, m, d) {
        playNoise({ type: "lowpass", freq: 300, freq1: 60, dur: 1.5, gain: 0.9, out: o, gainMul: m, drive: d });
        playWobble({ type: "sawtooth", f0: drift(40), f1: 22, dur: 1.4, gain: 0.8, lfoFreq: 2, lfoDepth: 12, cutoff: 110, out: o, gainMul: m, drive: d });
        return 1.5;
      },
    },
  };

  /**
   * Hard-stop a voice (cap eviction): drop its gain fast + stop its sources
   * a few ms later so the cut is click-free.
   * @param {{endsAt: number, dist: number, vg: GainNode, nodes: AudioScheduledSourceNode[]}} v
   * @returns {void}
   */
  function killVoice(v) {
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      v.vg.gain.cancelScheduledValues(t);
      v.vg.gain.setTargetAtTime(0.0001, t, 0.01);
    } catch (e) {
      /* node may already be gone */
    }
    for (let i = 0; i < v.nodes.length; i++) {
      try {
        v.nodes[i].stop(t + 0.03);
      } catch (e) {
        /* already stopped */
      }
    }
    v.nodes.length = 0;
  }

  /**
   * Reserve a voice slot: prune expired voices, enforce the cap of 8 (the
   * nearest voice wins; a boss ALWAYS evicts the farthest), and build the
   * per-voice tail of the chain — `…recipes → voiceGain(vol) →
   * [StereoPanner(pan)] → master` (contract §5.4). The optional WaveShaper
   * lives inside the recipes, in front of their envelopes, so distortion
   * feeds voiceGain exactly as drawn.
   * @param {string} type - zombie/boss type (bosses always win a slot)
   * @param {number} dist - XZ distance voice↔camera (m)
   * @param {number|null} pan - stereo pan −1..+1, null = unpanned
   * @param {number} vol - distance volume 0..1
   * @returns {{endsAt: number, dist: number, vg: GainNode, nodes: AudioScheduledSourceNode[]}|null}
   *   the registered voice (recipes connect into `.vg`), or null when dropped
   */
  function beginVoice(type, dist, pan, vol) {
    if (!ctx || !master) return null;
    const now = ctx.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) {
      if (voices[i].endsAt <= now) voices.splice(i, 1);
    }
    const boss = !BASE_TYPES[type];
    if (voices.length >= VOICE_CAP) {
      let far = 0;
      for (let i = 1; i < voices.length; i++) {
        if (voices[i].dist > voices[far].dist) far = i;
      }
      if (boss || dist < voices[far].dist) {
        killVoice(voices[far]);
        voices.splice(far, 1);
      } else {
        return null; // capped out and farther than everything playing
      }
    }
    const vg = ctx.createGain();
    vg.gain.value = vol;
    if (pan !== null && typeof ctx.createStereoPanner === "function") {
      const pn = ctx.createStereoPanner();
      pn.pan.value = Math.max(-1, Math.min(1, pan));
      vg.connect(pn);
      pn.connect(master);
    } else {
      vg.connect(master);
    }
    const v = { endsAt: now + 2.5, dist, vg, nodes: [] };
    voices.push(v);
    return v;
  }

  /**
   * Play one voice through the 3D mix. Called from the bus listeners with a
   * CLONED position (P2-K16) — this reads it synchronously and stores nothing.
   * @param {string} type - zombie/boss type (recipe row)
   * @param {string} kind - "idle"|"alert"|"chase"|"attack"|"pain"|"death"
   * @param {import("three").Vector3|null} position - world spot (XZ used);
   *   null → plays unpanned at `forcedVol`
   * @param {number|null} forcedVol - overrides the distance volume (the
   *   boss-roar fallback uses 0.5)
   * @returns {void}
   */
  function playVoice(type, kind, position, forcedVol) {
    if (!ready() || !camRef) return;
    const row = RECIPES[type];
    const rec = row ? row[kind] : null;
    if (!rec) return;
    let dist = Infinity;
    let pan = null;
    if (position && Number.isFinite(position.x) && Number.isFinite(position.z)) {
      const dx = position.x - camRef.position.x;
      const dz = position.z - camRef.position.z;
      dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > VOICE_FAR) return; // beyond 35 m: cut (contract §5.4)
      if (dist > 1e-4 && camRef.rotation) {
        // Stereo pan vs the camera yaw (same verified basis as the boss
        // arrow in hud.js): right = dx·cos(yaw) − dz·sin(yaw).
        const yaw = camRef.rotation.y || 0;
        const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
        pan = Math.max(-1, Math.min(1, right / dist));
      } else {
        dist = 1e-4; // on top of the listener: dead center, full volume
      }
    }
    const vol =
      forcedVol != null
        ? forcedVol
        : dist <= VOICE_NEAR
          ? 1
          : Math.max(0, 1 - (dist - VOICE_NEAR) / (VOICE_FAR - VOICE_NEAR));
    if (vol <= 0) return;
    const v = beginVoice(type, dist, pan, vol);
    if (!v) return;
    voiceSink = v.nodes;
    let end = 1;
    try {
      const r = rec(v.vg, KIND_GAIN[kind] || 0.28, SHAPER_K[type] || 0);
      if (typeof r === "number" && Number.isFinite(r)) end = r;
    } catch (e) {
      /* a broken recipe must never take the frame down */
    } finally {
      voiceSink = null;
    }
    v.endsAt = ctx.currentTime + end + 0.05;
  }

  /**
   * "boss-roar" {type, action} → recipe kind: windup/spit/slam map onto the
   * boss ATTACK recipes (the matrix defines exactly those sounds there);
   * "shriek" has its own entry. Position = nearest LIVING boss of that type
   * in the last update3D list; with none known it plays unpanned at 0.5.
   * @param {string} type
   * @param {string} action
   * @returns {void}
   */
  function playBossRoar(type, action) {
    if (!camRef) return;
    const kind = action === "shriek" ? "shriek" : "attack";
    let pos = null;
    if (zombiesRef) {
      let bestD = Infinity;
      for (let i = 0; i < zombiesRef.length; i++) {
        const z = zombiesRef[i];
        if (!z || z.alive !== true || z.type !== type || !z.position) continue;
        const dx = z.position.x - camRef.position.x;
        const dz = z.position.z - camRef.position.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          pos = z.position;
        }
      }
    }
    playVoice(type, kind, pos, pos ? null : 0.5);
  }

  /**
   * Per-frame 3D mixing pass (main calls it once per frame while playing,
   * after the zombie update): remembers the camera/list for the async voice
   * events, prunes finished voices and drives the herd-murmur level from the
   * number of zombies within 20 m (×1.6 while horde/bloodmoon is active).
   * Allocates nothing per frame.
   * @param {import("three").Camera} camera
   * @param {import("../zombies/zombie.js").Zombie[]} zombies
   * @returns {void}
   */
  function update3D(camera, zombies) {
    if (camera && camera.position) camRef = camera;
    if (zombies) zombiesRef = zombies;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) {
      if (voices[i].endsAt <= now) voices.splice(i, 1);
    }
    if (!murmur) return;
    let near = 0;
    if (camRef && zombiesRef) {
      const cx = camRef.position.x;
      const cz = camRef.position.z;
      for (let i = 0; i < zombiesRef.length; i++) {
        const z = zombiesRef[i];
        if (!z || z.alive !== true || !z.position) continue;
        const dx = z.position.x - cx;
        const dz = z.position.z - cz;
        if (dx * dx + dz * dz < MURMUR_NEAR * MURMUR_NEAR) near++;
      }
    }
    const boost = hordeMurmur || bloodMurmur ? VOICE_MURMUR_BOOST : 1;
    const target = MURMUR_MAX * Math.min(1, near / 5) * boost;
    if (Math.abs(target - murmurTarget) > 5e-4) {
      murmurTarget = target;
      murmur.gain.gain.setTargetAtTime(target, now, MURMUR_TAU);
    }
  }

  /**
   * Debug/test snapshot (NIGHT 30 P2 §5.4): context state + live voice count.
   * @returns {{ctxState: string, activeVoices: number}}
   */
  function audioState() {
    const now = ctx ? ctx.currentTime : 0;
    let n = 0;
    for (let i = 0; i < voices.length; i++) {
      if (voices[i].endsAt > now) n++;
    }
    return { ctxState: ctx ? ctx.state : "none", activeVoices: n };
  }

  // --- the sounds -----------------------------------------------------------

  function gunshot(kind) {
    if (!ready()) return;
    switch (kind) {
      case "shotgun": // big boom: long low noise + deep thump
        playNoise({ dur: 0.35, type: "lowpass", freq: 900, gain: 0.7, attack: 0.001 });
        playNoise({ dur: 0.5, type: "lowpass", freq: 220, gain: 0.4, attack: 0.004, when: 0.01 });
        playTone({ type: "sine", f0: 110, f1: 45, dur: 0.22, gain: 0.5 });
        break;
      case "rifle": // short sharp snap
        playNoise({ dur: 0.09, type: "bandpass", freq: 2600, q: 0.8, gain: 0.42, attack: 0.001 });
        playNoise({ dur: 0.14, type: "highpass", freq: 5000, gain: 0.12, attack: 0.001 });
        playTone({ type: "sine", f0: 190, f1: 80, dur: 0.07, gain: 0.28 });
        break;
      case "pistol":
      default: // mid crack
        playNoise({ dur: 0.14, type: "bandpass", freq: 1700, q: 0.9, gain: 0.5, attack: 0.001 });
        playNoise({ dur: 0.2, type: "lowpass", freq: 500, gain: 0.22, attack: 0.002, when: 0.005 });
        playTone({ type: "sine", f0: 150, f1: 60, dur: 0.1, gain: 0.35 });
        break;
    }
  }

  function zombieGrowl() {
    if (!ready()) return;
    playWobble({ type: "sawtooth", f0: 72 + Math.random() * 18, dur: 0.9, gain: 0.16, lfoFreq: 7 + Math.random() * 4, lfoDepth: 30, cutoff: 260 });
    playWobble({ type: "sawtooth", f0: 96 + Math.random() * 20, detune: 25, dur: 0.85, gain: 0.09, lfoFreq: 9, lfoDepth: 40, cutoff: 320, when: 0.05 });
  }

  function zombieHit() {
    if (!ready()) return;
    playNoise({ dur: 0.12, type: "lowpass", freq: 420, gain: 0.4, attack: 0.001 });
    playTone({ type: "sine", f0: 210, f1: 70, dur: 0.09, gain: 0.3 });
  }

  function playerHurt() {
    if (!ready()) return;
    playTone({ type: "sawtooth", f0: 330, f1: 120, dur: 0.22, gain: 0.22 });
    playNoise({ dur: 0.18, type: "lowpass", freq: 700, gain: 0.28, attack: 0.002 });
  }

  function click(freq, when, gain) {
    playNoise({ dur: 0.03, type: "highpass", freq: 2400, gain, attack: 0.001, when });
    playTone({ type: "square", f0: freq, f1: freq * 0.6, dur: 0.035, gain: gain * 0.7, when });
  }

  function reloadStart() {
    if (!ready()) return;
    click(950, 0, 0.25); // magazine out
  }

  function reloadEnd() {
    if (!ready()) return;
    click(1250, 0, 0.28); // magazine in
    click(1600, 0.09, 0.22); // chambered
  }

  function footstep() {
    if (!ready()) return;
    playNoise({
      dur: 0.07,
      type: "lowpass",
      freq: 480 + Math.random() * 160,
      gain: 0.1,
      attack: 0.002,
      rate: 0.8 + Math.random() * 0.4,
    });
  }

  function pickup() {
    if (!ready()) return;
    playTone({ type: "sine", f0: 660, dur: 0.08, gain: 0.22 });
    playTone({ type: "sine", f0: 990, dur: 0.12, gain: 0.22, when: 0.08 });
  }

  function hitmarker(headshot) {
    if (!ready()) return;
    if (headshot) {
      playTone({ type: "square", f0: 2700, dur: 0.05, gain: 0.3 });
      playTone({ type: "square", f0: 3600, dur: 0.07, gain: 0.22, when: 0.03 });
    } else {
      playTone({ type: "square", f0: 1900, dur: 0.03, gain: 0.16 });
    }
  }

  function waveBanner() {
    if (!ready()) return;
    // Low dramatic swell: minor-ish saw chord + filter sweep + sub boom.
    const t0 = 0;
    for (const [f, g] of [[110, 0.14], [131, 0.1], [165, 0.1]]) {
      playWobble({ type: "sawtooth", f0: f, dur: 1.3, gain: g, lfoFreq: 3, lfoDepth: 8, cutoff: 420, when: t0 });
    }
    playTone({ type: "sine", f0: 65, f1: 38, dur: 0.7, gain: 0.4, attack: 0.01, when: t0 });
    playNoise({ dur: 1.0, type: "bandpass", freq: 300, q: 0.6, gain: 0.12, attack: 0.25, when: t0 });
  }

  // --- ambient loop ---------------------------------------------------------

  function startAmbientNodes() {
    if (!ctx || !master || !noiseBuf || ambient) return;
    const sources = [];
    // Wind: looped noise -> lowpass whose frequency and level drift slowly.
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuf;
    wind.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 220;
    filt.Q.value = 0.6;
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.09;
    const sweepGain = ctx.createGain();
    sweepGain.gain.value = 90;
    sweep.connect(sweepGain);
    sweepGain.connect(filt.frequency);
    const windGain = ctx.createGain();
    windGain.gain.value = 0.035;
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.06;
    const gustGain = ctx.createGain();
    gustGain.gain.value = 0.02;
    gust.connect(gustGain);
    gustGain.connect(windGain.gain);
    wind.connect(filt);
    filt.connect(windGain);
    windGain.connect(master);
    wind.start();
    sweep.start();
    gust.start();
    sources.push(wind, sweep, gust);
    // Sub drone: two quiet detuned sines far below the action.
    for (const [f, g] of [[48, 0.02], [72.2, 0.011]]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      osc.connect(og);
      og.connect(master);
      osc.start();
      sources.push(osc);
    }
    // Herd murmur (NIGHT 30 P2 §5.4): one looping bed — lowpassed noise plus
    // a slowly wobbling 50–70 Hz sub sine — whose level update3D() drives
    // from the near-zombie count (×1.6 during horde/bloodmoon). Silent
    // (target ≈ 0) until zombies close in; no scheduling needed beyond that.
    const murmurNoise = ctx.createBufferSource();
    murmurNoise.buffer = noiseBuf;
    murmurNoise.loop = true;
    const murmurFilt = ctx.createBiquadFilter();
    murmurFilt.type = "lowpass";
    murmurFilt.frequency.value = 180;
    const murmurSub = ctx.createOscillator();
    murmurSub.type = "sine";
    murmurSub.frequency.value = 60;
    const murmurLfo = ctx.createOscillator();
    murmurLfo.frequency.value = 0.1 + Math.random() * 0.2; // 0.1–0.3 Hz drift
    const murmurLfoGain = ctx.createGain();
    murmurLfoGain.gain.value = 9; // sweeps the sub across 51–69 Hz
    murmurLfo.connect(murmurLfoGain);
    murmurLfoGain.connect(murmurSub.frequency);
    const murmurSubGain = ctx.createGain();
    murmurSubGain.gain.value = 0.5;
    const murmurGain = ctx.createGain();
    murmurGain.gain.value = 0;
    murmurNoise.connect(murmurFilt);
    murmurFilt.connect(murmurGain);
    murmurSub.connect(murmurSubGain);
    murmurSubGain.connect(murmurGain);
    murmurGain.connect(master);
    murmurNoise.start();
    murmurSub.start();
    murmurLfo.start();
    sources.push(murmurNoise, murmurSub, murmurLfo);
    murmur = { gain: murmurGain };
    murmurTarget = 0;
    ambient = { sources };
  }

  function startAmbient() {
    ambientWanted = true;
    if (!ctx) return; // takes effect as soon as the context is created
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    startAmbientNodes();
  }

  function setVolume(v) {
    const n = Number(v);
    volume = Number.isFinite(n) ? clamp01(n) : volume;
    if (master && ctx) {
      master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
    }
  }

  // --- bus wiring (NIGHT 30 P2 §5.4 / P2-K9) ---------------------------------
  // Voices + the murmur boost arrive as bus events; audio no longer relies on
  // main.js routing boss roars (the integrator removes that old route).
  // Payload details are untrusted: every handler de-guards and no-ops.
  if (bus && typeof bus.addEventListener === "function") {
    bus.addEventListener("zombie-voice", (e) => {
      const d = e && e.detail ? e.detail : null;
      if (d && d.kind && d.type) playVoice(d.type, d.kind, d.position || null, null);
    });
    bus.addEventListener("boss-roar", (e) => {
      const d = e && e.detail ? e.detail : null;
      if (d && d.type && d.action) playBossRoar(d.type, d.action);
    });
    bus.addEventListener("event-start", (e) => {
      const d = e && e.detail ? e.detail : null;
      if (d && d.type === "horde") hordeMurmur = true; // murmur ×1.6 until event-end
    });
    bus.addEventListener("event-end", (e) => {
      const d = e && e.detail ? e.detail : null;
      if (d && d.type === "horde") hordeMurmur = false;
    });
    bus.addEventListener("bloodmoon-active", (e) => {
      const d = e && e.detail ? e.detail : null;
      bloodMurmur = !!(d && d.active); // murmur ×1.6 while the moon is red
    });
  }

  return {
    gunshot,
    zombieGrowl,
    zombieHit,
    playerHurt,
    reloadStart,
    reloadEnd,
    footstep,
    pickup,
    hitmarker,
    waveBanner,
    startAmbient,
    setVolume,
    update3D,
    audioState,
  };
}
