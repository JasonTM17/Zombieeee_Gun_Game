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

const clamp01 = (v) => Math.min(1, Math.max(0, v));

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

  /**
   * Noise burst: buffer source -> biquad -> gain envelope -> master.
   * `t0` is an offset in seconds from now.
   */
  function playNoise({ dur, type = "lowpass", freq = 1000, q = 1, gain = 0.3, attack = 0.002, when = 0, rate = 1 }) {
    if (!ctx || !master || !noiseBuf) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = rate;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  /**
   * Oscillator tone with optional exponential pitch glide f0 -> f1.
   * `t0` is an offset in seconds from now.
   */
  function playTone({ type = "sine", f0 = 440, f1 = 0, dur = 0.2, gain = 0.2, attack = 0.002, when = 0 }) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, f0), t0);
    if (f1 && f1 !== f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /**
   * Sustained oscillator with lowpass + LFO on filter frequency (growls,
   * stings). Returns nothing; self-stops after `dur`.
   */
  function playWobble({ type = "sawtooth", f0, detune = 0, dur, gain = 0.2, lfoFreq = 6, lfoDepth = 20, cutoff = 300, when = 0 }) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f0 * 0.7), t0 + dur);
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
    g.gain.linearRampToValueAtTime(gain, t0 + 0.05);
    g.gain.setValueAtTime(gain, t0 + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(filt);
    filt.connect(g);
    g.connect(master);
    osc.start(t0);
    lfo.start(t0);
    osc.stop(t0 + dur + 0.05);
    lfo.stop(t0 + dur + 0.05);
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
  };
}
