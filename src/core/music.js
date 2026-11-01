/**
 * Adaptive procedural soundtrack — a self-contained WebAudio module.
 * NO audio files: every layer is synthesized (oscillators, noise, filters and
 * envelopes). It is a SEPARATE module from audio.js (the SFX engine) and owns
 * its own AudioContext + music master gain.
 *
 * LAYERS (all levels are deliberately far below the SFX mix — a gunshot is
 * ~0.4 after the audio master, the whole music bed peaks around 0.08):
 *
 * | layer        | when                                             | source budget |
 * |--------------|--------------------------------------------------|---------------|
 * | drone        | always (25 % in menu/pause/intro)                | 2 osc         |
 * | wind         | always (slow filter/gain drift while playing)    | 1 noise loop  |
 * | metal creaks | playing, random every 12–25 s                     | 1 transient   |
 * | sub pulse    | wave ≥ 2, 55–70 BPM (faster on boss)              | 1 osc         |
 * | arp          | wave ≥ 3, A minor / D minor, sparse rests         | 1 osc         |
 * | boss brass   | state.boss truthy, 1.2 s crossfade                 | 3 saw         |
 * | bloodmoon    | state.bloodmoon / "bloodmoon-active"              | drone retune  |
 * |   thump      | bloodmoon AND hp ≥ 35, 50 BPM                     | heart osc     |
 * |   shimmer    | bloodmoon, high sine with slow gain wobble        | 1 osc         |
 * | heartbeat    | hp < 35 (lub-dub, 60–90 BPM, gain 0.12)           | heart osc     |
 *
 * The bloodmoon thump and the low-health heartbeat SHARE one oscillator and
 * are mutually exclusive, so they can never stack at full volume: below 35 hp
 * the heartbeat owns the thump (the bloodmoon adds only drone + shimmer), and
 * at 35 hp or above the slower bloodmoon thump returns.
 *
 * Persistent source budget: 2 drone + 1 wind + 1 pulse + 1 arp + 3 boss saw +
 * 1 shimmer + 1 heart = 10. The rare creak adds one transient (~11 briefly).
 * No per-frame node creation: layers are built once, and everything after that
 * is parameter automation scheduled on the AudioContext clock with a small
 * lookahead (0.25–0.3 s) gated by update(). update() allocates nothing.
 *
 * CONTEXT LIFECYCLE (same contract as audio.js): the AudioContext is created
 * lazily on the first user gesture (document pointerdown/keydown), resumed if
 * the browser suspended it, and every path is a safe no-op when WebAudio or
 * the DOM is missing (headless tests, old browsers). No sound method throws.
 *
 * MIX: master = settings volume × duck. Playing = 100 %, menu/intro/paused =
 * 25 %, gameover = 15 % then a slow fade to 0 (restored on the next run).
 * Volume changes arrive from "settings-changed" {patch.volume}; the module
 * subscribes itself, so no main.js routing is needed for volume.
 *
 * BLOODMOON: the module subscribes to "bloodmoon-active" {active} itself and
 * caches the exact flag. state.bloodmoon is OPTIONAL: if it is a boolean it
 * overrides the cached flag; otherwise the bus cache is used. Recommended
 * wiring therefore omits the field entirely.
 *
 * Main wiring (read-only instruction — this module does not edit main.js):
 *
 *   import { createMusic } from "./core/music.js";
 *   const music = createMusic(bus, settings);     // right after createAudio()
 *
 *   // once, outside the frame loop — a reused scratch object (zero alloc):
 *   const musicState = { state: "menu", hp: 100, wave: 0, boss: null };
 *
 *   // every frame, OUTSIDE the playing/gameover/menu branches so pause ducks:
 *   const live = liveBoss();                      // call once, reuse
 *   musicState.state = gamestate.state;
 *   musicState.hp = player.hp;
 *   musicState.wave = gamestate.wave;
 *   musicState.boss = live ? live.type : null;    // string or object both OK
 *   music.update(dt, musicState);
 *
 * `events.active()` returns a REUSED snapshot ({type, timeLeft} of the newest
 * active event) or null. Because bloodmoon is exclusive (events.js never runs
 * another event beside it), `events.active() && events.active().type ===
 * "bloodmoon"` is also valid — but the module's own "bloodmoon-active" cache
 * is cheaper and exact, so no bloodmoon field is needed.
 */

/** hp strictly below this gets the low-health heartbeat. */
const LOW_HP = 35;
/** Heartbeat layer level (spec: ~0.12). */
const HEART_LEVEL = 0.12;
/** Bloodmoon thump layer level — a touch softer than the hp heartbeat. */
const BLOOD_THUMP_LEVEL = 0.1;
/** Boss layer crossfade (seconds). */
const BOSS_FADE = 1.2;
/** Sparse minor arpeggio patterns (A minor / D minor feel). */
const A_MINOR = [110, 130.81, 164.81, 220, 164.81, 130.81];
const D_MINOR = [146.83, 174.61, 220, 293.66, 220, 174.61];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Duck multiplier per game state. Unknown states duck like a menu. */
function duckFor(mode) {
  if (mode === "playing") return 1;
  if (mode === "gameover") return 0.15;
  return 0.25;
}

/**
 * @typedef {Object} MusicState
 * @property {string} [state] - "playing" | "paused" | "menu" | "intro" | "gameover".
 * @property {number} [hp] - player hp; < 35 arms the heartbeat.
 * @property {number} [wave] - current wave; ≥ 2 adds the pulse, ≥ 3 the arp.
 * @property {string|{type?: string}|null} [boss] - live boss (string or object);
 *   truthy fades the boss brass in, falsy fades it out.
 * @property {boolean} [bloodmoon] - optional override; omit to use the bus.
 */

/**
 * @typedef {Object} Music
 * @property {(dt: number, state?: MusicState) => void} update
 *   Per-frame tick. Cheap, allocation-free, safe with missing state.
 */

/** Empty fallback — never mutated, so no per-frame object is created. */
const IDLE_STATE = Object.freeze({ state: "menu", hp: 100, wave: 0, boss: null, bloodmoon: undefined });

/**
 * Create the adaptive soundtrack.
 * @param {EventTarget|null} bus - shared game bus (settings + bloodmoon).
 * @param {import("./settings.js").SettingsStore|null} settings
 * @returns {Music}
 */
export function createMusic(bus, settings) {
  /** @type {AudioContext|null} */
  let ctx = null;
  /** @type {GainNode|null} */
  let master = null;
  /** @type {Record<string, any>|null} */
  let graph = null;
  /** Creation failed / no WebAudio: stay silent without retrying every frame. */
  let unavailable = false;

  let volume = 0.8;
  let busBloodmoon = false;
  let mode = "menu";
  let bossOn = false;
  let bloodOn = false;
  let wave = 0;
  /** Cached values so target updates run only on change. */
  let lastMode = "";
  let lastBossOn = false;
  let lastBloodOn = false;
  let lastWave = -1;

  // Absolute AudioContext-clock scheduling state (seconds). 0 = unarmed.
  let nextPulse = 0;
  let nextArp = 0;
  let nextHeart = 0;
  let nextCreak = 0;
  let nextWind = 0;
  let nextShimmer = 0;
  let arpStep = 0;
  /** 0 = none, 1 = low-hp lub-dub, 2 = bloodmoon thump. */
  let heartMode = -1;

  // --- settings + bus (volume / bloodmoon) -----------------------------------

  function readVolume() {
    if (!settings || typeof settings.get !== "function") return;
    try {
      const v = Number(settings.get().volume);
      if (Number.isFinite(v)) volume = clamp01(v);
    } catch {
      /* settings must never take the audio down */
    }
  }
  readVolume();

  const B = bus && typeof bus.addEventListener === "function" ? bus : null;
  if (B) {
    B.addEventListener("settings-changed", (e) => {
      const patch = e && e.detail ? e.detail.patch : null;
      if (!patch || !Object.prototype.hasOwnProperty.call(patch, "volume")) return;
      const v = Number(patch.volume);
      if (!Number.isFinite(v)) return;
      volume = clamp01(v);
      // The gameover fade is a one-way entry sequence — do not resurrect it.
      if (ctx && master && mode !== "gameover") applyMaster(0.4);
    });
    B.addEventListener("bloodmoon-active", (e) => {
      busBloodmoon = !!(e && e.detail && e.detail.active === true);
    });
  }

  // --- context lifecycle ------------------------------------------------------

  /** Resolve the platform AudioContext constructor without throwing. */
  function audioCtor() {
    try {
      if (typeof window !== "undefined" && window) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (C) return C;
      }
      const G = typeof globalThis !== "undefined" ? globalThis : null;
      return G ? G.AudioContext || G.webkitAudioContext || null : null;
    } catch {
      return null;
    }
  }

  function resumeCtx() {
    if (!ctx || typeof ctx.resume !== "function") return;
    try {
      const p = ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      /* resume can reject before a gesture — ignore */
    }
  }

  function onGesture() {
    try {
      if (!ctx) createContext();
      if (ctx && ctx.state === "suspended") resumeCtx();
    } catch {
      /* never throw from a DOM listener */
    }
  }

  if (typeof document !== "undefined" && document && typeof document.addEventListener === "function") {
    document.addEventListener("pointerdown", onGesture);
    document.addEventListener("keydown", onGesture);
  }

  function createContext() {
    if (ctx || unavailable) return;
    const Ctor = audioCtor();
    if (typeof Ctor !== "function") {
      unavailable = true; // headless / no WebAudio: every update stays silent
      return;
    }
    try {
      ctx = new Ctor();
      buildGraph();
      // Force the next update to apply the current duck + layers.
      lastMode = "";
      lastWave = -1;
      lastBossOn = false;
      lastBloodOn = false;
      heartMode = -1;
      nextPulse = 0;
      nextArp = 0;
      nextHeart = 0;
      nextCreak = 0;
      nextWind = 0;
      nextShimmer = 0;
    } catch {
      ctx = null;
      master = null;
      graph = null;
      unavailable = true;
    }
  }

  // --- graph (built once) -----------------------------------------------------

  function buildGraph() {
    if (!ctx) return;
    const sr = Number(ctx.sampleRate) > 0 ? Number(ctx.sampleRate) : 48000;
    const now = Number(ctx.currentTime) > 0 ? Number(ctx.currentTime) : 0;

    master = ctx.createGain();
    master.gain.value = volume * 0.25; // menu level until the first update
    master.connect(ctx.destination);

    // 1) Drone: two detuned low oscillators (A1 / E2) through one lowpass.
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 380;
    droneFilter.Q.value = 0.6;
    droneFilter.connect(master);
    const droneA = ctx.createOscillator();
    droneA.type = "triangle";
    droneA.frequency.value = 55;
    droneA.detune.value = -5;
    const droneAGain = ctx.createGain();
    droneAGain.gain.value = 0.05;
    droneA.connect(droneAGain);
    droneAGain.connect(droneFilter);
    const droneB = ctx.createOscillator();
    droneB.type = "sine";
    droneB.frequency.value = 82.41;
    droneB.detune.value = 4;
    const droneBGain = ctx.createGain();
    droneBGain.gain.value = 0.032;
    droneB.connect(droneBGain);
    droneBGain.connect(droneFilter);

    // 2) Wind: one looping noise source, slowly drifting lowpass + gain.
    const noiseBuf = ctx.createBuffer(1, Math.max(1, Math.floor(sr * 2)), sr);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuf;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.5;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.03;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);

    // 3) Wave pulse: one sine, retuned per beat, envelope-scheduled.
    const pulseOsc = ctx.createOscillator();
    pulseOsc.type = "sine";
    pulseOsc.frequency.value = 58;
    const pulseEnv = ctx.createGain();
    pulseEnv.gain.value = 0.0001;
    const pulseFilter = ctx.createBiquadFilter();
    pulseFilter.type = "lowpass";
    pulseFilter.frequency.value = 180;
    pulseFilter.Q.value = 0.7;
    const pulseLayer = ctx.createGain();
    pulseLayer.gain.value = 0;
    pulseOsc.connect(pulseEnv);
    pulseEnv.connect(pulseFilter);
    pulseFilter.connect(pulseLayer);
    pulseLayer.connect(master);

    // 4) Sparse arpeggio: one triangle, retuned per note.
    const arpOsc = ctx.createOscillator();
    arpOsc.type = "triangle";
    arpOsc.frequency.value = 220;
    const arpFilter = ctx.createBiquadFilter();
    arpFilter.type = "lowpass";
    arpFilter.frequency.value = 900;
    arpFilter.Q.value = 0.8;
    const arpEnv = ctx.createGain();
    arpEnv.gain.value = 0.0001;
    const arpLayer = ctx.createGain();
    arpLayer.gain.value = 0;
    arpOsc.connect(arpFilter);
    arpFilter.connect(arpEnv);
    arpEnv.connect(arpLayer);
    arpLayer.connect(master);

    // 5) Boss: three detuned saws (minor-second dissonance) + lowpass.
    const bossFilter = ctx.createBiquadFilter();
    bossFilter.type = "lowpass";
    bossFilter.frequency.value = 420;
    bossFilter.Q.value = 1.1;
    const bossGain = ctx.createGain();
    bossGain.gain.value = 0;
    bossFilter.connect(bossGain);
    bossGain.connect(master);
    const sawA = ctx.createOscillator();
    sawA.type = "sawtooth";
    sawA.frequency.value = 55;
    sawA.detune.value = -7;
    sawA.connect(bossFilter);
    const sawB = ctx.createOscillator();
    sawB.type = "sawtooth";
    sawB.frequency.value = 58.27; // Bb1 against A1 — deliberate beating
    sawB.detune.value = 7;
    sawB.connect(bossFilter);
    const sawC = ctx.createOscillator();
    sawC.type = "sawtooth";
    sawC.frequency.value = 82.41;
    sawC.detune.value = -3;
    sawC.connect(bossFilter);

    // 6) Bloodmoon shimmer: one quiet high sine, gain-wobbled from update().
    const shimmerOsc = ctx.createOscillator();
    shimmerOsc.type = "sine";
    shimmerOsc.frequency.value = 1568;
    shimmerOsc.detune.value = 6;
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0;
    shimmerOsc.connect(shimmerGain);
    shimmerGain.connect(master);

    // 7) Heart: one sine retuned between lub and dub (shared with bloodmoon).
    const heartOsc = ctx.createOscillator();
    heartOsc.type = "sine";
    heartOsc.frequency.value = 56;
    const heartEnv = ctx.createGain();
    heartEnv.gain.value = 0.0001;
    const heartLayer = ctx.createGain();
    heartLayer.gain.value = 0;
    heartOsc.connect(heartEnv);
    heartEnv.connect(heartLayer);
    heartLayer.connect(master);

    // 8) Creak bus: the rare transient oscillator feeds this fixed gain.
    const creakGain = ctx.createGain();
    creakGain.gain.value = 0.016;
    creakGain.connect(master);

    // Start the ten persistent sources once; all later work is automation.
    droneA.start(now);
    droneB.start(now);
    windSrc.start(now);
    pulseOsc.start(now);
    arpOsc.start(now);
    sawA.start(now);
    sawB.start(now);
    sawC.start(now);
    shimmerOsc.start(now);
    heartOsc.start(now);

    graph = {
      droneFilter,
      droneA,
      droneB,
      windFilter,
      windGain,
      pulseOsc,
      pulseEnv,
      pulseFilter,
      pulseLayer,
      arpOsc,
      arpEnv,
      arpLayer,
      bossFilter,
      bossGain,
      shimmerGain,
      heartOsc,
      heartEnv,
      heartLayer,
      creakGain,
    };
  }

  // --- parameter helpers ------------------------------------------------------

  /**
   * Smoothly move a parameter to `target` over `seconds` (linear crossfade).
   * cancelAndHold keeps the current audible value when a fade is interrupted.
   * @param {AudioParam|null} param
   * @param {number} target
   * @param {number} seconds
   */
  function fadeParam(param, target, seconds) {
    if (!param || !ctx) return;
    const now = ctx.currentTime;
    const dur = seconds > 0 ? seconds : 0.01;
    try {
      if (typeof param.cancelAndHoldAtTime === "function") {
        // Hold the audible value at `now`, then ramp from it — no stale
        // param.value read (the getter is the intrinsic value, not automation).
        param.cancelAndHoldAtTime(now);
      } else {
        if (typeof param.cancelScheduledValues === "function") param.cancelScheduledValues(now);
        const from =
          typeof param.value === "number" && Number.isFinite(param.value) ? param.value : target;
        if (typeof param.setValueAtTime === "function") param.setValueAtTime(from, now);
      }
      if (typeof param.linearRampToValueAtTime === "function") {
        param.linearRampToValueAtTime(target, now + dur);
      } else {
        param.value = target;
      }
    } catch {
      try {
        param.value = target;
      } catch {
        /* a dead node must never break the frame */
      }
    }
  }

  function applyMaster(seconds) {
    if (!ctx || !master || mode === "gameover") return;
    fadeParam(master.gain, volume * duckFor(mode), seconds);
  }

  /** Wave layers — pulse from wave 2, arp from wave 3, capped low. */
  function applyWave(w, boss) {
    if (!graph) return;
    const grow = clamp01((w - 2) / 10);
    let pulseLevel = w >= 2 ? 0.035 + 0.045 * grow : 0;
    if (pulseLevel > 0 && boss) pulseLevel *= 1.15;
    if (pulseLevel > 0.095) pulseLevel = 0.095;
    const arpLevel = w >= 3 ? 0.012 + 0.016 * clamp01((w - 3) / 10) : 0;
    fadeParam(graph.pulseLayer.gain, pulseLevel, 0.9);
    fadeParam(graph.arpLayer.gain, Math.min(0.028, arpLevel), 0.9);
  }

  /** Boss brass in/out — the spec's 1.2 s crossfade. */
  function applyBoss(on) {
    if (!graph) return;
    fadeParam(graph.bossGain.gain, on ? 0.052 : 0, BOSS_FADE);
    fadeParam(graph.bossFilter.frequency, on ? 470 : 320, BOSS_FADE);
  }

  /** Bloodmoon: detune/detune the drone down, arm the high shimmer. */
  function applyBlood(on) {
    if (!graph) return;
    fadeParam(graph.droneA.frequency, on ? 41.2 : 55, 1.6);
    fadeParam(graph.droneB.frequency, on ? 61.74 : 82.41, 1.6);
    fadeParam(graph.droneA.detune, on ? -16 : -5, 1.2);
    fadeParam(graph.droneB.detune, on ? 11 : 4, 1.2);
    fadeParam(graph.droneFilter.frequency, on ? 230 : 380, 1.6);
    fadeParam(graph.shimmerGain.gain, on ? 0.006 : 0, 1.4);
    if (on) nextShimmer = 0;
  }

  // --- scheduled voices (automation only — no nodes created per beat) --------

  function schedulePulse(t) {
    const f = graph.pulseOsc.frequency;
    const a = graph.pulseEnv.gain;
    f.setValueAtTime(66, t);
    f.exponentialRampToValueAtTime(46, t + 0.2);
    a.setValueAtTime(0.0001, t);
    a.linearRampToValueAtTime(1, t + 0.012);
    a.exponentialRampToValueAtTime(0.0001, t + 0.22);
  }

  function scheduleArp(t) {
    if (Math.random() < 0.28) return; // sparse: occasional rest
    const notes = (wave & 1) === 0 ? A_MINOR : D_MINOR;
    arpStep = (arpStep + 1) % notes.length;
    graph.arpOsc.frequency.setValueAtTime(notes[arpStep], t);
    const a = graph.arpEnv.gain;
    a.setValueAtTime(0.0001, t);
    a.linearRampToValueAtTime(1, t + 0.015);
    a.exponentialRampToValueAtTime(0.0001, t + 0.42);
  }

  /** Two-thump lub-dub on the shared heart oscillator (freq retuned per hit). */
  function scheduleLubDub(t, lubHz, dubHz) {
    const f = graph.heartOsc.frequency;
    const a = graph.heartEnv.gain;
    f.setValueAtTime(lubHz, t);
    a.setValueAtTime(0.0001, t);
    a.linearRampToValueAtTime(1, t + 0.012);
    a.exponentialRampToValueAtTime(0.0001, t + 0.15);
    f.setValueAtTime(dubHz, t + 0.16);
    a.setValueAtTime(0.0001, t + 0.16);
    a.linearRampToValueAtTime(0.62, t + 0.172);
    a.exponentialRampToValueAtTime(0.0001, t + 0.36);
  }

  /** Single slow bloodmoon thump (used only while hp ≥ 35). */
  function scheduleBloodThump(t) {
    const f = graph.heartOsc.frequency;
    const a = graph.heartEnv.gain;
    f.setValueAtTime(46, t);
    a.setValueAtTime(0.0001, t);
    a.linearRampToValueAtTime(0.85, t + 0.02);
    a.exponentialRampToValueAtTime(0.0001, t + 0.34);
  }

  /** Distant metal creak — one transient oscillator, every 12–25 s. */
  function scheduleCreak(t) {
    if (!ctx || !graph) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const filt = ctx.createBiquadFilter();
      filt.type = "bandpass";
      filt.Q.value = 9;
      const env = ctx.createGain();
      const f0 = 1400 + Math.random() * 900;
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f0 * (0.35 + Math.random() * 0.3), t + 0.9);
      filt.frequency.setValueAtTime(1800 + Math.random() * 1000, t);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.9, t + 0.08);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      osc.connect(filt);
      filt.connect(env);
      env.connect(graph.creakGain);
      osc.start(t);
      osc.stop(t + 1.2);
    } catch {
      /* creaks are optional garnish */
    }
  }

  // --- per-frame update -------------------------------------------------------

  /**
   * Per-frame music tick. Reads the shared state, applies only changed layer
   * targets, then schedules a short lookahead of beats/notes. Allocates nothing.
   * @param {number} dt - seconds since the last frame (unused; audio-clock driven).
   * @param {MusicState} [state]
   * @returns {void}
   */
  function update(dt, state) {
    void dt;
    const st = state || IDLE_STATE;

    const modeNow = typeof st.state === "string" && st.state ? st.state : "menu";
    const hpRaw = Number(st.hp);
    const hp = Number.isFinite(hpRaw) ? hpRaw : 100;
    const waveRaw = Number(st.wave);
    const w = Number.isFinite(waveRaw) && waveRaw > 0 ? waveRaw : 0;
    const bossNow = !!st.boss;
    const bloodNow = typeof st.bloodmoon === "boolean" ? st.bloodmoon : busBloodmoon;

    mode = modeNow;
    wave = w;
    bossOn = bossNow;
    bloodOn = bloodNow;

    if (!ctx || !master || !graph) {
      // No audio yet: keep caches coherent so the first gesture applies them.
      lastMode = modeNow;
      lastWave = w;
      lastBossOn = bossNow;
      lastBloodOn = bloodNow;
      return;
    }

    const now = ctx.currentTime;
    const playing = modeNow === "playing";

    // 1) Master duck (menu/intro/paused 25 %, gameover 15 % then slow fade).
    if (modeNow !== lastMode) {
      lastMode = modeNow;
      if (modeNow === "gameover") {
        const ducked = volume * 0.15;
        fadeParam(master.gain, ducked, 0.6);
        try {
          // Hold the 15 % duck briefly, then fade the whole bed out.
          if (typeof master.gain.setValueAtTime === "function") {
            master.gain.setValueAtTime(ducked, now + 2);
          }
          if (typeof master.gain.linearRampToValueAtTime === "function") {
            master.gain.linearRampToValueAtTime(0, now + 8.6);
          }
        } catch {
          /* fade-out is best-effort */
        }
      } else {
        applyMaster(0.45);
      }
    }

    // 2) Wave-driven layers + boss crossfade.
    if (w !== lastWave) {
      lastWave = w;
      applyWave(w, bossNow);
    }
    if (bossNow !== lastBossOn) {
      lastBossOn = bossNow;
      applyBoss(bossNow);
      applyWave(w, bossNow); // boss also nudges the pulse level
    }

    // 3) Bloodmoon bed changes.
    if (bloodNow !== lastBloodOn) {
      lastBloodOn = bloodNow;
      applyBlood(bloodNow);
    }

    // 4) Heart mode: one of none / low-hp / bloodmoon (never both).
    const lowHp = hp < LOW_HP;
    const desiredHeart = !playing ? 0 : lowHp ? 1 : bloodNow ? 2 : 0;
    if (desiredHeart !== heartMode) {
      heartMode = desiredHeart;
      nextHeart = now + 0.04;
      fadeParam(
        graph.heartLayer.gain,
        desiredHeart === 1 ? HEART_LEVEL : desiredHeart === 2 ? BLOOD_THUMP_LEVEL : 0,
        0.3
      );
    }

    // 5) Rhythmic scheduling — playing + running only (pause freezes the beat).
    if (playing && ctx.state === "running" && volume > 0.001) {
      // Sub pulse: 55–70 BPM, ×1.35 while a boss is alive, capped at 96 BPM.
      if (w >= 2) {
        if (nextPulse === 0 || nextPulse < now - 1) nextPulse = now + 0.05;
        if (nextPulse <= now + 0.3) {
          schedulePulse(nextPulse < now ? now + 0.01 : nextPulse);
          const base = 55 + 15 * clamp01((w - 2) / 10);
          const bpm = Math.min(96, base * (bossOn ? 1.35 : 1));
          nextPulse += 60 / bpm;
        }
      } else {
        nextPulse = 0;
      }

      // Sparse minor arpeggio from wave 3.
      if (w >= 3) {
        if (nextArp === 0 || nextArp < now - 1) nextArp = now + 0.1;
        if (nextArp <= now + 0.3) {
          scheduleArp(nextArp < now ? now + 0.02 : nextArp);
          nextArp += 0.55 + Math.random() * 0.5;
        }
      } else {
        nextArp = 0;
      }

      // Heartbeat / bloodmoon thump (low hp wins — never stacked).
      if (heartMode === 1) {
        if (nextHeart === 0 || nextHeart < now - 1) nextHeart = now + 0.04;
        if (nextHeart <= now + 0.25) {
          const t = nextHeart < now ? now + 0.01 : nextHeart;
          const frac = clamp01(hp / LOW_HP);
          scheduleLubDub(t, 52 + frac * 6, 40 + frac * 4);
          nextHeart += 60 / (60 + (1 - frac) * 30); // 60 BPM @35 hp → 90 @0
        }
      } else if (heartMode === 2) {
        if (nextHeart === 0 || nextHeart < now - 1) nextHeart = now + 0.04;
        if (nextHeart <= now + 0.25) {
          scheduleBloodThump(nextHeart < now ? now + 0.01 : nextHeart);
          nextHeart += 1.2; // 50 BPM
        }
      } else {
        nextHeart = 0;
      }

      // Wind drift (filter + level wander, no LFO source).
      if (nextWind === 0 || nextWind < now - 1) nextWind = now + 4;
      if (nextWind <= now + 0.3) {
        fadeParam(graph.windFilter.frequency, 260 + Math.random() * 360, 4.5);
        fadeParam(graph.windGain.gain, 0.022 + Math.random() * 0.02, 4.5);
        nextWind = now + 5 + Math.random() * 5;
      }

      // Distant metal creak every 12–25 s.
      if (nextCreak === 0 || nextCreak < now - 1) nextCreak = now + 12 + Math.random() * 13;
      if (nextCreak <= now + 0.3) {
        scheduleCreak(nextCreak < now ? now + 0.02 : nextCreak);
        nextCreak = now + 12 + Math.random() * 13;
      }

      // Bloodmoon shimmer wobble (slow target changes, no LFO source).
      if (bloodOn) {
        if (nextShimmer === 0 || nextShimmer < now - 1) nextShimmer = now + 2;
        if (nextShimmer <= now + 0.3) {
          fadeParam(graph.shimmerGain.gain, 0.004 + Math.random() * 0.004, 2.2);
          nextShimmer = now + 2.5 + Math.random() * 2.5;
        }
      } else {
        nextShimmer = 0;
      }
    }
  }

  return { update };
}
