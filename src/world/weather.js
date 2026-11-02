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
 *     after a short distance delay. Every 7–16 s a CLOSE strike also lands
 *     8–30 m from the player: a pre-built jagged cross-ribbon bolt drops from
 *     y = 40 to the ground (0.18–0.3 s, bright blue-white additive), with a
 *     ground flash ring and a fading scorch disc. The strike emits
 *     "lightning-strike" {x, z, radius: 3.2, damage: 160, time} for the
 *     lightning damage system — see src/systems/lightning.js;
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
 * Bus emitted: "lightning-strike" {x, z, radius: 3.2, damage: 160,
 *   time: seconds since the current storm started}. Only emitted while a
 *   storm is running (never clear / rain / fog / bloodmoon).
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
 *   timer: number, strikes: number}} state - fresh snapshot for debug/HUD.
 *   `timer` is seconds until the current regime would change on its own
 *   (frozen in bloodmoon); `strikes` is the cumulative close-strike count.
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

// --- close lightning strikes (damage gameplay) ------------------------------
const STRIKE_MIN = 7; // s between close strikes
const STRIKE_MAX = 16;
const STRIKE_DIST_MIN = 8; // m from the player: well beyond the 4 m floor
const STRIKE_DIST_MAX = 30;
const STRIKE_RADIUS = 3.2; // m — damage radius announced on the bus
const STRIKE_DAMAGE = 160;
const STRIKE_BOLT_MIN = 0.18; // s — visible bolt lifetime
const STRIKE_BOLT_MAX = 0.3;
const STRIKE_FLASH_PEAK_MIN = 3.4;
const STRIKE_FLASH_PEAK_MAX = 5.2;
const STRIKE_THUNDER_MIN = 0.04; // a near strike cracks almost immediately
const STRIKE_THUNDER_MAX = 0.28;
const STRIKE_BOLT_WIDTH = 0.18; // half-width of the core ribbon at the ground
const STRIKE_GLOW_SCALE = 2.4; // the wider outer ribbon fake-glow
const SCORCH_FADE = 5; // s — ground scorch slowly fades
const SCORCH_OPACITY = 0.55;

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
 * Append one two-triangle ribbon segment between `a` and `b`. `axis` selects
 * the width direction (0 = X, 1 = Z) so two crossed ribbons read as a solid
 * bolt from any camera angle. Widths are per-endpoint so the channel tapers.
 * Build-time helper only — never called from update().
 * @param {number[]} positions
 * @param {number[]} indices
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 * @param {number} axis
 * @param {number} wa
 * @param {number} wb
 */
function pushRibbon(positions, indices, a, b, axis, wa, wb) {
  const base = positions.length / 3;
  if (axis === 0) {
    positions.push(
      a.x - wa, a.y, a.z, a.x + wa, a.y, a.z,
      b.x - wb, b.y, b.z, b.x + wb, b.y, b.z
    );
  } else {
    positions.push(
      a.x, a.y, a.z - wa, a.x, a.y, a.z + wa,
      b.x, b.y, b.z - wb, b.x, b.y, b.z + wb
    );
  }
  indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
}

/**
 * Build the ONE pooled close-strike bolt geometry: a jagged vertical spine
 * from y = 0 to y = 40 plus three descending branches, each rendered as two
 * crossed ribbons. Called once per weather layer; every strike reuses it.
 * @returns {import("three").BufferGeometry}
 */
function buildStrikeBoltGeometry() {
  const positions = [];
  const indices = [];
  const SPINE_SEGMENTS = 18;
  const HEIGHT = 40;
  const spine = [];
  for (let i = 0; i <= SPINE_SEGMENTS; i++) {
    const t = i / SPINE_SEGMENTS;
    const reach = Math.sin(t * Math.PI); // pinned to (0, 0) / (0, 40)
    spine.push({
      x: (Math.random() * 2 - 1) * 1.5 * reach,
      y: t * HEIGHT,
      z: (Math.random() * 2 - 1) * 1.5 * reach,
    });
  }
  for (let i = 0; i < SPINE_SEGMENTS; i++) {
    const a = spine[i];
    const b = spine[i + 1];
    const ta = i / SPINE_SEGMENTS;
    const tb = (i + 1) / SPINE_SEGMENTS;
    const wa = STRIKE_BOLT_WIDTH * (1 - 0.55 * ta);
    const wb = STRIKE_BOLT_WIDTH * (1 - 0.55 * tb);
    pushRibbon(positions, indices, a, b, 0, wa, wb);
    pushRibbon(positions, indices, a, b, 1, wa, wb);
  }
  // Forks: short descending ribbons that break the silhouette.
  const forkRoots = [0.58, 0.42, 0.72];
  for (let f = 0; f < forkRoots.length; f++) {
    const si = Math.max(1, Math.min(SPINE_SEGMENTS - 2, Math.round(forkRoots[f] * SPINE_SEGMENTS)));
    const root = spine[si];
    const dir = Math.random() < 0.5 ? -1 : 1;
    const points = [{ x: root.x, y: root.y, z: root.z }];
    let px = root.x;
    let py = root.y;
    let pz = root.z;
    const FORK_SEGMENTS = 5;
    for (let k = 1; k <= FORK_SEGMENTS; k++) {
      px += dir * (0.35 + Math.random() * 0.8) + (Math.random() * 2 - 1) * 0.2;
      py -= 1.1 + Math.random() * 1.1;
      pz += (Math.random() * 2 - 1) * 0.7;
      points.push({ x: px, y: py, z: pz });
    }
    for (let k = 0; k < FORK_SEGMENTS; k++) {
      const wa = 0.07 * (1 - 0.6 * (k / FORK_SEGMENTS));
      const wb = 0.07 * (1 - 0.6 * ((k + 1) / FORK_SEGMENTS));
      pushRibbon(positions, indices, points[k], points[k + 1], 0, wa, wb);
      pushRibbon(positions, indices, points[k], points[k + 1], 1, wa, wb);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
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
  // Strike anchor: only a real playerPos (or the arena-center default) moves
  // it. The camera fallback below still anchors rain, but a missing playerPos
  // must not turn into a strike 100 m from the arena.
  let strikeAnchorX = 0;
  let strikeAnchorZ = 0;
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

  // --- close strike: ONE pooled bolt group (no per-strike geometry) ---------
  // A jagged cross-ribbon channel from y=0..40 plus a soft wider glow shell.
  // The core and glow share the same geometry; only their materials differ.
  const strikeGeo = buildStrikeBoltGeometry();
  const strikeCoreMat = new THREE.MeshBasicMaterial({
    color: 0xf2f9ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const strikeCore = new THREE.Mesh(strikeGeo, strikeCoreMat);
  strikeCore.name = "weather-strike-bolt";
  strikeCore.frustumCulled = false;
  strikeCore.renderOrder = 6;

  const strikeGlowMat = new THREE.MeshBasicMaterial({
    color: 0x7fb8ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const strikeGlow = new THREE.Mesh(strikeGeo, strikeGlowMat);
  strikeGlow.name = "weather-strike-glow";
  strikeGlow.scale.set(STRIKE_GLOW_SCALE, 1, STRIKE_GLOW_SCALE);
  strikeGlow.frustumCulled = false;
  strikeGlow.renderOrder = 5;

  // Ground flash ring — expands over the bolt's short life.
  const strikeRingMat = new THREE.MeshBasicMaterial({
    color: 0xbfe2ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const strikeRing = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 32), strikeRingMat);
  strikeRing.name = "weather-strike-ring";
  strikeRing.rotation.x = -Math.PI / 2;
  strikeRing.position.y = 0.07;
  strikeRing.frustumCulled = false;
  strikeRing.renderOrder = 6;

  const strikeGroup = new THREE.Group();
  strikeGroup.name = "weather-lightning-strike";
  strikeGroup.visible = false;
  strikeGroup.add(strikeCore, strikeGlow, strikeRing);
  if (sceneRef) sceneRef.add(strikeGroup);

  // Scorch decal: lives in world space (stays put when the next strike lands).
  const scorchMat = new THREE.MeshBasicMaterial({
    color: 0x120f0b,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const strikeScorch = new THREE.Mesh(new THREE.CircleGeometry(1.9, 28), scorchMat);
  strikeScorch.name = "weather-strike-scorch";
  strikeScorch.rotation.x = -Math.PI / 2;
  strikeScorch.position.y = 0.045;
  strikeScorch.visible = false;
  strikeScorch.renderOrder = 1;
  if (sceneRef) sceneRef.add(strikeScorch);

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

  // --- close strike state ---------------------------------------------------
  let strikeTimer = rand(STRIKE_MIN, STRIKE_MAX);
  let stormElapsed = 0; // s since the current storm regime started
  let strikes = 0; // cumulative close strikes (state().strikes)
  let strikeT = 0; // remaining bolt visibility
  let strikeDuration = 0;
  let strikeAge = 0;
  let scorchT = 0; // remaining scorch fade time

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
      strikeTimer = rand(STRIKE_MIN, STRIKE_MAX); // first close strike 7–16 s in
      stormElapsed = 0;
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

  /**
   * Land a real close strike: reposition/reuse the pooled bolt group, start
   * the near flash + thunder, refresh the scorch and emit the gameplay event.
   * Only called from the storm branch of update(). Allocation-free apart from
   * the one event dispatch (required by the bus contract).
   */
  function triggerLightningStrike() {
    strikes++;
    strikeTimer = rand(STRIKE_MIN, STRIKE_MAX);
    // A close strike replaces this flash slot, so restart the distant timer
    // too — normal horizon flashes keep their old rhythm between strikes.
    lightningTimer = rand(LIGHTNING_MIN, LIGHTNING_MAX);

    flashDuration = rand(STRIKE_BOLT_MIN, STRIKE_BOLT_MAX);
    flashT = flashDuration;
    flashPeak = rand(STRIKE_FLASH_PEAK_MIN, STRIKE_FLASH_PEAK_MAX);
    thunderDelay = rand(STRIKE_THUNDER_MIN, STRIKE_THUNDER_MAX);

    // 8–30 m from the current player anchor (floor 4 m is covered by the min).
    const angle = Math.random() * Math.PI * 2;
    const dist = rand(STRIKE_DIST_MIN, STRIKE_DIST_MAX);
    const x = strikeAnchorX + Math.cos(angle) * dist;
    const z = strikeAnchorZ + Math.sin(angle) * dist;

    // The close bolt owns the flash; hide the distant horizon plane.
    bolt.visible = false;
    boltMat.opacity = 0;

    strikeGroup.position.set(x, 0, z);
    strikeGroup.rotation.y = Math.random() * Math.PI * 2;
    strikeGroup.visible = true;
    strikeDuration = rand(STRIKE_BOLT_MIN, STRIKE_BOLT_MAX);
    strikeT = strikeDuration;
    strikeAge = 0;
    strikeCoreMat.opacity = 1;
    strikeGlowMat.opacity = 0.5;
    strikeRing.visible = true;
    strikeRing.scale.setScalar(0.75);
    strikeRingMat.opacity = 0.9;

    strikeScorch.position.set(x, 0.045, z);
    strikeScorch.visible = true;
    scorchT = SCORCH_FADE;
    scorchMat.opacity = SCORCH_OPACITY;

    if (B) {
      B.dispatchEvent(
        new CustomEvent("lightning-strike", {
          detail: {
            x,
            z,
            radius: STRIKE_RADIUS,
            damage: STRIKE_DAMAGE,
            time: stormElapsed,
          },
        })
      );
    }
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

      // Kill any in-flight close bolt: the red sky owns all lightning.
      strikeT = 0;
      strikeAge = 0;
      strikeGroup.visible = false;
      strikeRing.visible = false;
      strikeCoreMat.opacity = 0;
      strikeGlowMat.opacity = 0;
      strikeRingMat.opacity = 0;
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
   * @returns {{mode: "clear"|"rain"|"storm"|"fog", intensity: number,
   *   timer: number, strikes: number}}
   */
  function state() {
    return { mode, intensity, timer: Math.max(0, modeTimer), strikes };
  }

  /**
   * Advance weather. Allocation-free.
   * @param {number} dt seconds
   * @param {{x: number, z: number}} [playerPos] player feet position; when
   *   omitted the strike anchor stays at the arena center (0, 0)
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
      strikeAnchorX = playerPos.x;
      strikeAnchorZ = playerPos.z;
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
      stormElapsed += dt;
      strikeTimer -= dt;
      if (strikeTimer <= 0) {
        triggerLightningStrike(); // close, damaging bolt — replaces a flash
      } else {
        lightningTimer -= dt;
        if (lightningTimer <= 0) triggerLightning();
      }
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
    // Close-strike visual envelope: flickering additive core + glow + ring.
    if (strikeT > 0) {
      strikeT -= dt;
      if (strikeT <= 0) {
        strikeT = 0;
        strikeDuration = 0;
        strikeGroup.visible = false;
        strikeRing.visible = false;
        strikeCoreMat.opacity = 0;
        strikeGlowMat.opacity = 0;
        strikeRingMat.opacity = 0;
      } else {
        strikeAge += dt;
        const k = strikeT / strikeDuration;
        const flicker = 0.82 + 0.18 * Math.sin(strikeAge * 95);
        const env = k * flicker;
        strikeCoreMat.opacity = env;
        strikeGlowMat.opacity = env * 0.45;
        const rp = 1 - k; // 0 → 1 over the bolt's life
        strikeRing.scale.setScalar(0.75 + (STRIKE_RADIUS - 0.75) * rp);
        strikeRingMat.opacity = (1 - rp) * 0.9;
      }
    }
    // Scorch outlives the bolt: fade over SCORCH_FADE seconds.
    if (scorchT > 0) {
      scorchT -= dt;
      if (scorchT <= 0) {
        scorchT = 0;
        strikeScorch.visible = false;
        scorchMat.opacity = 0;
      } else {
        scorchMat.opacity = SCORCH_OPACITY * (scorchT / SCORCH_FADE);
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
