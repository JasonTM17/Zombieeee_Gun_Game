/**
 * ============================================================================
 * WEATHER — a living sky over the open city.
 * ============================================================================
 * createWeather(scene, bus, settings, camera) adds ONE self-contained weather
 * layer on top of atmosphere.js/scenery.js:
 *
 *   - a slow random cycle: clear → rain → (storm | clear) → clear, with
 *     independent fog banks. All value changes (rain opacity, wind, fog
 *     density) ramp over 6–10 s so the sky never snaps;
 *   - rain: ONE THREE.Points object (3200 drops) in a 50 × 30 × 50 m box that
 *     follows the player horizontally. Drops are updated in place in the
 *     existing Float32Array (zero per-frame allocation) and drawn as thin
 *     additive streaks by a small custom shader — exactly one draw call;
 *   - storm: stronger rain + wind, one pooled lightning bolt plane on the
 *     horizon and one HemisphereLight that flashes for 0.08–0.25 s and then
 *     returns to intensity 0. Thunder is synthesized procedurally (WebAudio)
 *     after a short distance delay;
 *   - fog: only `scene.fog.density` is animated (base → ~0.04 over ~8 s and
 *     back to the EXACT base value). Fog COLOR, scene.background and every
 *     atmosphere.js bloodmoon tint stay untouched;
 *   - rain hiss: looped procedural noise → lowpass → gain, volume follows
 *     settings.get().volume and live "settings-changed" events. The
 *     AudioContext is created lazily after the first user gesture and every
 *     audio path is a silent no-op when WebAudio is unavailable (headless).
 *
 * Cycle contract (all timers advance only while update() is called; the lead
 * calls it while playing, so pause/menu/gameover freeze the cycle naturally):
 *
 *   mode    duration            next
 *   clear   90–180 s            rain
 *   rain    60–120 s            55% storm, else clear
 *   storm   25–45 s             clear
 *   fog     35–60 s             clear (fog banks fire every 150–260 s from
 *                               start / previous fog, interrupting clear or
 *                               rain, never bloodmoon)
 *
 * Bloodmoon ("bloodmoon-active" {active}) forces clear: rain target drops to
 * 0 with the normal 6–10 s fade, fog density walks back to base, all cycle
 * timers freeze, and new lightning/thunder is suppressed. When the bloodmoon
 * ends the clear cycle resumes with fresh timers. The module never writes
 * scene.background or scene.fog.color — atmosphere.js P2 owns those.
 *
 * No per-frame allocation: update() only mutates numbers and the rain
 * Float32Array. Geometry, materials, uniforms and the two helper meshes are
 * built once here. Extra render cost: 1 rain draw call (+1 pooled bolt plane
 * only while a flash is visible) and 1 extra light.
 *
 * Bus consumed: "bloodmoon-active" {active}, "settings-changed" {patch.volume}.
 * Bus emitted: none.
 *
 * @param {import("three").Scene} scene
 * @param {EventTarget} bus - shared bus (src/systems/gamestate.js).
 * @param {{get: () => {volume?: number}}} settings - settings store; only
 *   volume is read (defensive if absent).
 * @param {import("three").PerspectiveCamera} camera - used for the rain streak
 *   slant and as the anchor fallback when playerPos is omitted.
 * @returns {Weather}
 */

/**
 * @typedef {Object} Weather
 * @property {(dt: number, playerPos?: {x: number, z: number}) => void} update
 *   Advance the cycle, intensity, fog density, rain drift, lightning and
 *   audio. dt is seconds; playerPos re-centers the rain box.
 * @property {() => {mode: "clear"|"rain"|"storm"|"fog", intensity: number,
 *   timer: number}} state - fresh snapshot for debug/HUD. `timer` is seconds
 *   until the current regime would change on its own (frozen in bloodmoon).
 * @property {(mode: string) => boolean} setMode - force a transition to
 *   "clear" | "rain" | "storm" | "fog"; unknown values are ignored. Returns
 *   true when accepted, false for an unknown mode (or a non-clear force while
 *   a bloodmoon is active).
 */

import * as THREE from "three";

// --- cycle tunables ---------------------------------------------------------
const CLEAR_MIN = 90;
const CLEAR_MAX = 180;
const RAIN_MIN = 60;
const RAIN_MAX = 120;
const STORM_MIN = 25;
const STORM_MAX = 45;
const FOG_DURATION_MIN = 35; // fog bank holds this long (spec: only the
const FOG_DURATION_MAX = 60; // 150–260 s interval is fixed)
const FOG_INTERVAL_MIN = 150;
const FOG_INTERVAL_MAX = 260;
const STORM_CHANCE = 0.55; // rain → storm; otherwise rain → clear
const TRANSITION_MIN = 6; // seconds for a full 0..1 value ramp
const TRANSITION_MAX = 10;

// --- rain -------------------------------------------------------------------
const RAIN_COUNT = 3200; // 2500–3500, hard cap 3500
const RAIN_BOX_XZ = 50; // 50 × 30 × 50 m around the player
const RAIN_BOX_H = 30;
const RAIN_FALL = 26; // m/s
const RAIN_SIZE = 0.42; // world-space streak length at the reference distance
const RAIN_OPACITY = 0.55;

// --- fog --------------------------------------------------------------------
const FOG_DENSE = 0.04; // denser target; never touches fog.color
const FOG_LERP_SECONDS = 8;

// --- lightning --------------------------------------------------------------
const LIGHTNING_MIN = 6;
const LIGHTNING_MAX = 18;
const FLASH_MIN = 0.08;
const FLASH_MAX = 0.25;
const FLASH_PEAK_MIN = 2.2;
const FLASH_PEAK_MAX = 4.0;
const BOLT_DIST_MIN = 145;
const BOLT_DIST_MAX = 185;
const THUNDER_DELAY_MIN = 0.35; // flash → thunder, reads as distance
const THUNDER_DELAY_MAX = 1.85;

// --- helpers ----------------------------------------------------------------
/** @returns {number} uniform random in [min, max) */
function rand(min, max) {
  return min + Math.random() * (max - min);
}

/** @returns {number} clamped value */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Local, gesture-gated WebAudio layer: a looped noise rain bed + one-shot
 * thunder. Every entry point is a safe no-op without an AudioContext, and the
 * context is only created from a real user gesture. Volume follows the
 * settings store and live "settings-changed" patches.
 *
 * @param {EventTarget|null} bus
 * @param {() => number} readVolume - returns the current master volume 0..1.
 * @returns {{setRain: (level: number) => void, thunder: () => void}}
 */
function createWeatherAudio(bus, readVolume) {
  /** @type {AudioContext|null} */
  let ctx = null;
  /** @type {GainNode|null} */
  let master = null;
  /** @type {GainNode|null} */
  let rainGain = null;
  /** @type {AudioBuffer|null} */
  let noiseBuf = null;
  let volume = 0.8;
  let lastRain = -1;

  try {
    volume = clamp(Number(readVolume()), 0, 1);
    if (!Number.isFinite(volume)) volume = 0.8;
  } catch {
    volume = 0.8;
  }

  function applyVolume() {
    if (master) master.gain.value = volume;
  }

  if (bus && typeof bus.addEventListener === "function") {
    bus.addEventListener("settings-changed", (e) => {
      const d = e && e.detail ? e.detail : {};
      const patch = d.patch;
      if (patch && typeof patch.volume === "number" && Number.isFinite(patch.volume)) {
        volume = clamp(patch.volume, 0, 1);
        applyVolume();
      }
    });
  }

  /** Build the context + the looping rain bed. Only runs after a gesture. */
  function ensure() {
    if (ctx) return;
    try {
      const win = typeof window !== "undefined" ? window : null;
      const Ctor = win
        ? /** @type {any} */ (win.AudioContext || win.webkitAudioContext)
        : undefined;
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);

      // 3 s noise loop — long enough that the rain bed never sounds periodic.
      noiseBuf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 3)), ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1250;
      filter.Q.value = 0.4;
      rainGain = ctx.createGain();
      rainGain.gain.value = 0;
      src.connect(filter);
      filter.connect(rainGain);
      rainGain.connect(master);
      src.start();
    } catch {
      // No WebAudio / blocked context: stay a silent no-op.
      ctx = null;
      master = null;
      rainGain = null;
      noiseBuf = null;
    }
  }

  function onGesture() {
    ensure();
    if (ctx && ctx.state === "suspended" && typeof ctx.resume === "function") {
      try {
        const p = ctx.resume();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {
        /* blocked resume: stay silent */
      }
    }
  }

  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("pointerdown", onGesture);
    document.addEventListener("keydown", onGesture);
  }

  /** Rain-bed level 0..1 (already includes the storm boost from update()). */
  function setRain(level) {
    if (!rainGain) return;
    const v = Number.isFinite(level) ? clamp(level, 0, 1) : 0;
    if (Math.abs(v - lastRain) < 0.003) return;
    lastRain = v;
    rainGain.gain.value = v;
  }

  /** One procedural thunder clap: noise rumble + a sub thump. */
  function thunder() {
    if (!ctx || !master || !noiseBuf) return;
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      try {
        const p = ctx.resume();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {
        /* ignore */
      }
    }
    try {
      const t0 = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.setValueAtTime(240 + Math.random() * 140, t0);
      filt.frequency.exponentialRampToValueAtTime(64, t0 + 1.7);
      filt.Q.value = 1.1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.55 + Math.random() * 0.25, t0 + 0.045);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.35);
      src.connect(filt);
      filt.connect(g);
      g.connect(master);
      src.start(t0, Math.random() * 1.5);
      src.stop(t0 + 2.4);

      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.setValueAtTime(52, t0);
      sub.frequency.exponentialRampToValueAtTime(27, t0 + 1.3);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t0);
      sg.gain.linearRampToValueAtTime(0.22, t0 + 0.06);
      sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5);
      sub.connect(sg);
      sg.connect(master);
      sub.start(t0);
      sub.stop(t0 + 1.55);
    } catch {
      // A synth failure must never break the frame loop.
    }
  }

  return { setRain, thunder };
}

/**
 * Build the weather layer.
 * @param {import("three").Scene} scene
 * @param {EventTarget} bus
 * @param {{get: () => {volume?: number}}} settings
 * @param {import("three").PerspectiveCamera} camera
 * @returns {Weather}
 */
export function createWeather(scene, bus, settings, camera) {
  const sceneRef = scene || null;
  const camRef = camera || null;
  const B = bus && typeof bus.addEventListener === "function" ? bus : null;

  // --- player anchor (world XZ) ---------------------------------------------
  let px = 0;
  let pz = 0;
  if (camRef && camRef.position) {
    if (Number.isFinite(camRef.position.x)) px = camRef.position.x;
    if (Number.isFinite(camRef.position.z)) pz = camRef.position.z;
  }

  // --- fog base (captured BEFORE we ever animate the density) ----------------
  const hasFog = !!(
    sceneRef &&
    sceneRef.fog &&
    Number.isFinite(sceneRef.fog.density)
  );
  const fogBase = hasFog ? sceneRef.fog.density : 0.026;
  const fogDense = Math.max(FOG_DENSE, fogBase + 0.01); // always denser
  const fogStep = Math.abs(fogDense - fogBase) / FOG_LERP_SECONDS;

  // --- rain ----------------------------------------------------------------
  const rainPositions = new Float32Array(RAIN_COUNT * 3);
  for (let i = 0; i < RAIN_COUNT; i++) {
    rainPositions[i * 3] = px + rand(-RAIN_BOX_XZ / 2, RAIN_BOX_XZ / 2);
    rainPositions[i * 3 + 1] = rand(0, RAIN_BOX_H);
    rainPositions[i * 3 + 2] = pz + rand(-RAIN_BOX_XZ / 2, RAIN_BOX_XZ / 2);
  }
  const rainGeo = new THREE.BufferGeometry();
  const rainAttr = new THREE.BufferAttribute(rainPositions, 3);
  rainAttr.setUsage(THREE.DynamicDrawUsage);
  rainGeo.setAttribute("position", rainAttr);

  // Screen-space scale: converts the world streak length to raster pixels.
  const fov = camRef && Number.isFinite(camRef.fov) ? camRef.fov : 75;
  const viewH =
    typeof window !== "undefined" && Number.isFinite(window.innerHeight)
      ? window.innerHeight
      : 800;
  const dpr =
    typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio)
      ? Math.min(window.devicePixelRatio, 2)
      : 1;
  const screenScale =
    (viewH * dpr) / (2 * Math.tan((fov * Math.PI) / 360));

  const rainMat = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: RAIN_SIZE },
      uScale: { value: screenScale },
      uOpacity: { value: 0 },
      uSlant: { value: 0 },
      uColor: { value: new THREE.Color(0x9fb8e0) },
    },
    vertexShader: `
      uniform float uSize;
      uniform float uScale;
      varying float vFade;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float dist = max(0.5, -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp(uSize * uScale / dist, 1.5, 64.0);
        vFade = clamp(1.35 - dist / 45.0, 0.35, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform float uSlant;
      uniform vec3 uColor;
      varying float vFade;
      void main() {
        vec2 pc = gl_PointCoord - vec2(0.5);
        float x = pc.x + pc.y * uSlant;
        float core = 1.0 - smoothstep(0.0, 0.075, abs(x));
        float ends = 1.0 - smoothstep(0.30, 0.5, abs(pc.y));
        float a = core * ends * uOpacity * vFade;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  });
  const rain = new THREE.Points(rainGeo, rainMat);
  rain.name = "weather-rain";
  rain.frustumCulled = false; // the box wraps around the moving player
  rain.visible = false;
  rain.renderOrder = 2;
  if (sceneRef) sceneRef.add(rain);

  // --- lightning: one pooled bolt + one flash light -------------------------
  const boltGeo = new THREE.PlaneGeometry(9, 60);
  boltGeo.translate(0, 30, 0); // pivot at the ground, plane grows upward
  const boltMat = new THREE.MeshBasicMaterial({
    color: 0xdce8ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const bolt = new THREE.Mesh(boltGeo, boltMat);
  bolt.name = "weather-lightning-bolt";
  bolt.visible = false;
  bolt.frustumCulled = false;
  if (sceneRef) sceneRef.add(bolt);

  // HemisphereLight is full-scene (no shadows, no direction artifacts) and
  // starts at exactly 0 so the atmosphere's existing light rig is untouched.
  const flashLight = new THREE.HemisphereLight(0xc8d8ff, 0x0b1018, 0);
  flashLight.name = "weather-lightning-flash";
  flashLight.castShadow = false;
  if (sceneRef) sceneRef.add(flashLight);

  // --- audio ----------------------------------------------------------------
  const audio = createWeatherAudio(B, () => {
    const s = settings && typeof settings.get === "function" ? settings.get() : null;
    return s && Number.isFinite(s.volume) ? s.volume : 0.8;
  });

  // --- cycle state ----------------------------------------------------------
  /** @type {"clear"|"rain"|"storm"|"fog"} */
  let mode = "clear";
  let modeTimer = rand(CLEAR_MIN, CLEAR_MAX);
  let fogTimer = rand(FOG_INTERVAL_MIN, FOG_INTERVAL_MAX);
  let transitionTime = rand(TRANSITION_MIN, TRANSITION_MAX);
  let rainTarget = 0;
  let intensity = 0; // current rain amount 0..1 (ramps toward rainTarget)
  let windAngle = rand(0, Math.PI * 2);
  let windSpeed = 1.2;
  let bloodmoon = false;

  // --- storm state ----------------------------------------------------------
  let lightningTimer = rand(LIGHTNING_MIN, LIGHTNING_MAX);
  let flashT = 0;
  let flashDuration = 0;
  let flashPeak = 0;
  let thunderDelay = -1; // < 0 = nothing pending

  /**
   * Enter `next` NOW. Values (rain/wind/fog) glide for 6–10 s; the mode timer
   * starts immediately, so a full rain regime lasts its scheduled duration.
   * @param {"clear"|"rain"|"storm"|"fog"} next
   */
  function applyMode(next) {
    mode = next;
    transitionTime = rand(TRANSITION_MIN, TRANSITION_MAX);

    if (next === "clear") {
      rainTarget = 0;
      modeTimer = rand(CLEAR_MIN, CLEAR_MAX);
    } else if (next === "rain") {
      rainTarget = rand(0.62, 0.85);
      modeTimer = rand(RAIN_MIN, RAIN_MAX);
    } else if (next === "storm") {
      rainTarget = 1;
      modeTimer = rand(STORM_MIN, STORM_MAX);
      lightningTimer = rand(LIGHTNING_MIN, LIGHTNING_MAX);
    } else {
      rainTarget = 0;
      modeTimer = rand(FOG_DURATION_MIN, FOG_DURATION_MAX);
      // The next fog bank is measured from THIS one (150–260 s cadence).
      fogTimer = rand(FOG_INTERVAL_MIN, FOG_INTERVAL_MAX);
    }
  }

  /** Schedule the next regime when the current one expires. */
  function advanceCycle(dt) {
    if (bloodmoon) return; // frozen: force-clear owns the world

    // Fog banks are independent of the rain cycle: every 150–260 s they roll
    // in and interrupt whatever (non-bloodmoon) sky is running.
    fogTimer -= dt;
    if (fogTimer <= 0 && mode !== "fog") {
      applyMode("fog");
      return;
    }

    modeTimer -= dt;
    if (modeTimer > 0) return;

    if (mode === "clear") applyMode("rain");
    else if (mode === "rain") {
      applyMode(Math.random() < STORM_CHANCE ? "storm" : "clear");
    } else {
      applyMode("clear"); // storm and fog both hand back to clear
    }
  }

  /** Fire one flash + arm the delayed thunder. Uses only pooled resources. */
  function triggerLightning() {
    lightningTimer = rand(LIGHTNING_MIN, LIGHTNING_MAX);
    flashDuration = rand(FLASH_MIN, FLASH_MAX);
    flashT = flashDuration;
    flashPeak = rand(FLASH_PEAK_MIN, FLASH_PEAK_MAX);
    thunderDelay = rand(THUNDER_DELAY_MIN, THUNDER_DELAY_MAX);

    const a = Math.random() * Math.PI * 2;
    const dist = rand(BOLT_DIST_MIN, BOLT_DIST_MAX);
    bolt.position.set(px + Math.cos(a) * dist, 0, pz + Math.sin(a) * dist);
    bolt.lookAt(px, 20, pz);
    bolt.visible = true;
    boltMat.opacity = 0.85;
    flashLight.intensity = flashPeak;
  }

  // --- bloodmoon ------------------------------------------------------------
  if (B) {
    B.addEventListener("bloodmoon-active", (e) => {
      const d = e && e.detail ? e.detail : {};
      const active = d.active === true;
      if (active === bloodmoon) return;
      bloodmoon = active;
      thunderDelay = -1; // no thunder under the red sky

      // Force the clear regime. Rain fades with the normal transition and the
      // fog density walks back to base; colors stay owned by atmosphere.js.
      mode = "clear";
      rainTarget = 0;
      transitionTime = rand(TRANSITION_MIN, TRANSITION_MAX);
      modeTimer = rand(CLEAR_MIN, CLEAR_MAX);
      fogTimer = rand(FOG_INTERVAL_MIN, FOG_INTERVAL_MAX);
    });
  }

  // --- public API -----------------------------------------------------------

  /**
   * Force a mode (debug / scripted weather). Unknown strings are ignored.
   * During a bloodmoon only "clear" is accepted — the red sky owns the world.
   * @param {string} next
   * @returns {boolean} true when the request was accepted
   */
  function setMode(next) {
    if (next !== "clear" && next !== "rain" && next !== "storm" && next !== "fog") {
      return false;
    }
    if (bloodmoon && next !== "clear") return false;
    applyMode(next);
    return true;
  }

  /**
   * Fresh debug snapshot (callers may mutate it — not the live state).
   * @returns {{mode: "clear"|"rain"|"storm"|"fog", intensity: number, timer: number}}
   */
  function state() {
    return { mode, intensity, timer: Math.max(0, modeTimer) };
  }

  /**
   * Advance weather. Allocation-free.
   * @param {number} dt seconds
   * @param {{x: number, z: number}} [playerPos] player feet position
   */
  function update(dt, playerPos) {
    if (!Number.isFinite(dt) || dt <= 0) return;

    if (
      playerPos &&
      Number.isFinite(playerPos.x) &&
      Number.isFinite(playerPos.z)
    ) {
      px = playerPos.x;
      pz = playerPos.z;
    } else if (camRef && camRef.position) {
      if (Number.isFinite(camRef.position.x)) px = camRef.position.x;
      if (Number.isFinite(camRef.position.z)) pz = camRef.position.z;
    }

    // 1. regime scheduler
    advanceCycle(dt);

    // 2. rain opacity ramp (linear over the current transition window)
    const step = dt / Math.max(0.001, transitionTime);
    if (intensity < rainTarget) {
      intensity = Math.min(rainTarget, intensity + step);
    } else if (intensity > rainTarget) {
      intensity = Math.max(rainTarget, intensity - step);
    }

    // 3. fog density — DENSITY ONLY; never touch color/background.
    if (hasFog) {
      const fogTarget = mode === "fog" && !bloodmoon ? fogDense : fogBase;
      const density = sceneRef.fog.density;
      if (density < fogTarget) {
        sceneRef.fog.density = Math.min(fogTarget, density + fogStep * dt);
      } else if (density > fogTarget) {
        sceneRef.fog.density = Math.max(fogTarget, density - fogStep * dt);
      }
    }

    // 4. wind (stronger in a storm; slowly rotating direction)
    const windTarget = mode === "storm" ? 8 : mode === "rain" ? 3.2 : 1.2;
    windSpeed += (windTarget - windSpeed) * Math.min(1, dt / 2);
    windAngle += dt * 0.02;
    if (windAngle > Math.PI * 2) windAngle -= Math.PI * 2;
    const windX = Math.cos(windAngle) * windSpeed;
    const windZ = Math.sin(windAngle) * windSpeed;

    // 5. lightning scheduling + flash envelope
    if (mode === "storm" && !bloodmoon) {
      lightningTimer -= dt;
      if (lightningTimer <= 0) triggerLightning();
    }
    if (flashT > 0) {
      flashT -= dt;
      if (flashT <= 0) {
        flashT = 0;
        flashDuration = 0;
        flashLight.intensity = 0; // exact restore of the pre-flash state
        bolt.visible = false;
        boltMat.opacity = 0;
      } else {
        const k = flashT / flashDuration;
        const env = k * k; // bright attack, quick decay inside 0.08–0.25 s
        flashLight.intensity = flashPeak * env;
        boltMat.opacity = 0.85 * env;
      }
    }
    if (thunderDelay >= 0) {
      thunderDelay -= dt;
      if (thunderDelay <= 0) {
        thunderDelay = -1;
        audio.thunder();
      }
    }

    // 6. rain drift (in place, zero allocation)
    rain.visible = intensity > 0.002;
    if (rain.visible) {
      const half = RAIN_BOX_XZ / 2;
      const box = RAIN_BOX_XZ;
      const dx = windX * dt;
      const dz = windZ * dt;
      const fall = RAIN_FALL * dt;
      const arr = rainPositions;
      for (let i = 0; i < RAIN_COUNT; i++) {
        const i3 = i * 3;
        let x = arr[i3] + dx;
        let y = arr[i3 + 1] - fall;
        let z = arr[i3 + 2] + dz;
        if (y < 0) y += RAIN_BOX_H;
        // Toroidal wrap around the player keeps the box centered without
        // teleporting drops that are already inside it.
        let rx = (x - px) % box;
        if (rx > half) rx -= box;
        else if (rx < -half) rx += box;
        x = px + rx;
        let rz = (z - pz) % box;
        if (rz > half) rz -= box;
        else if (rz < -half) rz += box;
        z = pz + rz;
        arr[i3] = x;
        arr[i3 + 1] = y;
        arr[i3 + 2] = z;
      }
      rainAttr.needsUpdate = true;
    }

    // 7. rain shader uniforms (opacity + screen-space wind slant)
    rainMat.uniforms.uOpacity.value =
      RAIN_OPACITY * intensity * (mode === "storm" ? 1.15 : 1);
    let slant = 0;
    if (camRef && camRef.matrixWorld) {
      const e = camRef.matrixWorld.elements;
      // Project the drop velocity (wind, -fall) onto the camera right/up axes.
      const sx = windX * e[0] - RAIN_FALL * e[1] + windZ * e[2];
      const sy = windX * e[4] - RAIN_FALL * e[5] + windZ * e[6];
      slant = sx / Math.max(0.5, -sy);
      if (slant > 0.55) slant = 0.55;
      else if (slant < -0.55) slant = -0.55;
    }
    rainMat.uniforms.uSlant.value = slant;

    // 8. rain hiss level (storm is a little louder; silent when dry)
    audio.setRain(intensity * (mode === "storm" ? 0.22 : 0.15));
  }

  return { update, state, setMode };
}
