/**
 * Core engine wrapper around Three.js: renderer + scene + camera + clock.
 *
 * Contract notes (signatures are frozen — other modules depend on them):
 * - `camera` is a PerspectiveCamera with fov 75; aspect is kept in sync on resize.
 *   Accessibility / game feel (user request): the persisted `fov` setting
 *   (60..110, default 75) is applied at creation and live on
 *   "settings-changed" {patch:{fov}} — no main.js wiring needed.
 * - `update()` returns the frame delta time in SECONDS, clamped to at most
 *   0.05 s (protects physics/animation from tab-switch spikes).
 * - `render()` draws one frame: renderer.render(scene, camera).
 * - The renderer enables its shadow map (the moon light in atmosphere.js casts
 *   shadows) and clamps devicePixelRatio to 1.25 on desktop / 1.0 on narrow
 *   high-DPI viewports (see pixelRatioFor).
 * - ACESFilmic tone mapping at exposure 1.18 + sRGB output give the night its
 *   readable dark-blue lift without washing the warm lamps out.
 * - Adaptive quality: frame dt is sampled in 2 s windows; sustained low FPS
 *   lowers the pixel ratio and disables shadows, and sustained recovery steps
 *   back up. Every change emits "quality-changed" {pixelRatio, shadows, fps}
 *   on the shared bus (same self-wiring pattern as the FOV setting).
 * - Static shadows: renderer.shadowMap.autoUpdate is OFF. The shadow map is
 *   refreshed every SHADOW_UPDATE_FRAMES (30 ≈ 0.5 s at 60 FPS) or as soon as
 *   the camera moved SHADOW_MOVE_DISTANCE (4 m), whichever comes first, so the
 *   1024 moon map follows the player without a full shadow pass every frame.
 * - Sizes: the renderer fills the viewport (window.innerWidth/innerHeight or
 *   the canvas client size); <canvas id="game"> is the only canvas in the page.
 *
 * @param {HTMLCanvasElement} canvas - the <canvas id="game"> element from index.html.
 * @returns {Engine}
 */

import * as THREE from "three";
import { bus } from "../systems/gamestate.js";

// Accessibility / game feel (user request): FOV persisted by settings.js under
// the shared localStorage key. Engine creation runs BEFORE settings.load() in
// main.js, so the persisted value is read directly here; later changes arrive
// through the bus (the same self-wiring pattern as atmosphere.js).
export const FOV_DEFAULT = 75;
export const FOV_MIN = 60;
export const FOV_MAX = 110;
const SETTINGS_KEY = "gungame.settings";

// --- render quality ---------------------------------------------------------
// High-DPI laptops are the biggest cost: a 2x backing buffer is 4x the pixels.
// Cap the desktop ratio at 1.25, and at 1.0 for narrow, high-DPI viewports.
export const PIXEL_RATIO_MAX = 1.25;
export const PIXEL_RATIO_HIGH_DPI = 1.0;
export const HIGH_DPI_THRESHOLD = 1.5; // devicePixelRatio above this is "high-DPI"
export const NARROW_VIEWPORT_PX = 1400;
// Adaptive quality steps, best → worst. Step 0 also enables shadows.
export const QUALITY_PIXEL_RATIOS = Object.freeze([PIXEL_RATIO_MAX, 1.0, 0.85]);
// Adaptive guard thresholds (2 s windows; see createQualityGovernor).
export const QUALITY_LIMITS = Object.freeze({
  windowSeconds: 2,
  lowFps: 50, // 2 consecutive windows < 50 → step 1 (ratio 1.0, shadows off)
  criticalFps: 38, // one more window < 38 at step 1 → step 2 (ratio 0.85)
  goodFps: 57, // 4 consecutive windows > 57 → restore one step
  goodWindows: 4,
  cooldownSeconds: 3, // minimum time between quality changes (no oscillation)
  maxFrameSeconds: 0.25, // ignore tab stalls / debugger pauses
});

// --- static shadow cadence ---------------------------------------------------
// Shadow casters in this game are overwhelmingly static (buildings, trees,
// props). Zombies/NPCs/wildlife no longer cast, so the map only needs a
// low-frequency refresh: every 30 frames (~0.5 s) or after 4 m of camera
// travel, whichever happens first. Exported so the Node harness can prove the
// cadence without a WebGL context.
export const SHADOW_UPDATE_FRAMES = 30;
export const SHADOW_MOVE_DISTANCE = 4;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Backing-buffer pixel ratio for a viewport. Pure (headless-testable).
 * @param {number} devicePixelRatio
 * @param {number} viewportWidth - CSS pixels
 * @returns {number}
 */
export function pixelRatioFor(devicePixelRatio, viewportWidth) {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const width = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1920;
  const cap =
    dpr > HIGH_DPI_THRESHOLD && width < NARROW_VIEWPORT_PX
      ? PIXEL_RATIO_HIGH_DPI
      : PIXEL_RATIO_MAX;
  return Math.min(dpr, cap);
}

/**
 * Static-shadow cadence. Pure accounting (no Three/DOM) so the headless
 * harness can prove the refresh rhythm:
 * - `step(x, z)` is called once per rendered frame and returns true when the
 *   shadow map should be refreshed: every SHADOW_UPDATE_FRAMES frames, or
 *   immediately once the camera has travelled SHADOW_MOVE_DISTANCE metres
 *   since the previous refresh.
 * - A moved-camera refresh also resets the frame counter, so a walking player
 *   never gets a redundant refresh on the next 30th frame after one already
 *   happened for movement.
 * - Missing/non-finite coordinates fall back to the frame cadence only.
 *
 * @param {{frameInterval?: number, moveDistance?: number}} [options]
 * @returns {{step: (x: number, z: number) => boolean,
 *   reset: () => void, getFrames: () => number}}
 */
export function createShadowScheduler(options) {
  const frameInterval =
    options && options.frameInterval > 0 ? options.frameInterval : SHADOW_UPDATE_FRAMES;
  const moveDistance =
    options && options.moveDistance > 0 ? options.moveDistance : SHADOW_MOVE_DISTANCE;
  let frames = 0;
  let lastX = NaN;
  let lastZ = NaN;

  function reset() {
    frames = 0;
    lastX = NaN;
    lastZ = NaN;
  }

  function step(x, z) {
    frames++;
    let moved = false;
    if (Number.isFinite(x) && Number.isFinite(z)) {
      if (!Number.isFinite(lastX) || Math.hypot(x - lastX, z - lastZ) > moveDistance) {
        moved = true;
        lastX = x;
        lastZ = z;
      }
    }
    if (moved || frames >= frameInterval) {
      frames = 0;
      return true;
    }
    return false;
  }

  return { step, reset, getFrames: () => frames };
}

/**
 * Adaptive-quality governor. Measures frame dt in 2 s windows and steps
 * pixel ratio / shadows down when the frame rate stays low, then slowly back
 * up when it recovers. Pure accounting (no Three/DOM) so it is testable in
 * Node; `onChange` receives {step, shadows, fps}.
 *
 * Step 0 = base pixel-ratio cap + shadows, 1 = ratio ≤ 1.0 + no shadows,
 * 2 = ratio ≤ 0.85 + no shadows. A 3 s cooldown after every change and
 * counter resets make it non-oscillating. No per-frame allocations.
 * @param {{onChange?: (q: {step: number, shadows: boolean, fps: number}) => void}} [options]
 */
export function createQualityGovernor(options) {
  const onChange = options && typeof options.onChange === "function" ? options.onChange : null;
  const L = QUALITY_LIMITS;
  let step = 0;
  let frames = 0;
  let elapsed = 0;
  let sinceChange = L.cooldownSeconds; // first window may judge immediately
  let lowWindows = 0;
  let goodWindows = 0;
  let fps = 0;

  function commit(next) {
    step = next;
    lowWindows = 0;
    goodWindows = 0;
    sinceChange = 0;
    if (onChange) onChange({ step, shadows: step === 0, fps });
  }

  /** Feed one raw frame delta (seconds). Allocation-free. */
  function sample(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // A tab stall or a debugger pause is not evidence of a slow renderer.
    if (dt > L.maxFrameSeconds) {
      frames = 0;
      elapsed = 0;
      return;
    }
    frames++;
    elapsed += dt;
    sinceChange += dt;
    if (elapsed < L.windowSeconds) return;

    fps = frames / elapsed;
    frames = 0;
    elapsed = 0;

    // Cooldown: drop the window entirely so a change never cascades.
    if (sinceChange < L.cooldownSeconds) {
      lowWindows = 0;
      goodWindows = 0;
      return;
    }

    if (step === 1 && fps < L.criticalFps) {
      commit(2);
    } else if (step === 0 && fps < L.lowFps) {
      lowWindows++;
      goodWindows = 0;
      if (lowWindows >= 2) commit(1);
    } else if (step > 0 && fps > L.goodFps) {
      goodWindows++;
      lowWindows = 0;
      if (goodWindows >= L.goodWindows) commit(step - 1);
    } else {
      lowWindows = 0;
      goodWindows = 0;
    }
  }

  return {
    sample,
    getStep: () => step,
    getFps: () => fps,
    getShadows: () => step === 0,
    getPixelRatio: () => QUALITY_PIXEL_RATIOS[step],
  };
}

/**
 * Coerce any value into a valid camera FOV (integer 60..110). Missing /
 * non-finite input returns the pre-setting default 75.
 * @param {unknown} value
 * @returns {number}
 */
export function sanitizeFov(value) {
  const n = typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return FOV_DEFAULT;
  return clamp(Math.round(n), FOV_MIN, FOV_MAX);
}

/**
 * The persisted FOV from "gungame.settings" (corrupt/blocked storage → 75).
 * @returns {number}
 */
export function readStoredFov() {
  try {
    if (typeof localStorage === "undefined") return FOV_DEFAULT;
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (raw && typeof raw === "object" && typeof raw.fov === "number") {
      return sanitizeFov(raw.fov);
    }
  } catch {
    // corrupt JSON or blocked storage → default, never throw
  }
  return FOV_DEFAULT;
}

/**
 * Apply a FOV value to a camera. A no-op when the value is already current
 * (avoids rebuilding the projection matrix on every unrelated settings change).
 * @param {import("three").PerspectiveCamera} camera
 * @param {unknown} value
 * @returns {number} the sanitized value applied.
 */
export function applyFov(camera, value) {
  const fov = sanitizeFov(value);
  if (camera && camera.fov !== fov) {
    camera.fov = fov;
    if (typeof camera.updateProjectionMatrix === "function") {
      camera.updateProjectionMatrix();
    }
  }
  return fov;
}

/**
 * Apply the stored FOV now, then follow live "settings-changed" patches.
 * Exported for the headless harness (createEngine calls it below).
 * @param {import("three").PerspectiveCamera} camera
 * @param {EventTarget} [targetBus]
 * @returns {import("three").PerspectiveCamera}
 */
export function attachFovSettings(camera, targetBus) {
  applyFov(camera, readStoredFov());
  const b = targetBus || bus;
  if (!b || typeof b.addEventListener !== "function") return camera;
  b.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail ? e.detail.patch : null;
    if (patch && typeof patch.fov === "number" && Number.isFinite(patch.fov)) {
      applyFov(camera, patch.fov);
    }
  });
  return camera;
}

/**
 * @typedef {Object} Engine
 * @property {import("three").WebGLRenderer} renderer - WebGL renderer bound to the canvas.
 * @property {import("three").Scene} scene - root scene graph; every module adds its objects here.
 * @property {import("three").PerspectiveCamera} camera - player camera, fov 75.
 * @property {(cb: (width: number, height: number) => void) => void} onResize
 *   Register a callback invoked on window resize with the new viewport size in
 *   CSS pixels. The engine itself keeps renderer size and camera aspect in
 *   sync; the callback is informational (e.g. HUD re-layout).
 * @property {() => number} update
 *   Advance the engine clock. Returns delta time in seconds since the previous
 *   call, clamped so that dt <= 0.05. The first call returns 0 (or a tiny dt).
 * @property {() => void} render - render the scene with the camera.
 */

export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(pixelRatioFor(window.devicePixelRatio || 1, window.innerWidth));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Static world shadows only need a low-frequency refresh (see the scheduler
  // below): skip the per-frame shadow pass entirely and force the first one.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  // ACES lifts the whole night scene without clipping the warm lamps; the
  // exposure is tuned for the readable dark-blue night in atmosphere.js.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Clear with the same night sky atmosphere.js assigns to scene.background.
  renderer.setClearColor(0x0a1322, 1);

  const scene = new THREE.Scene();
  const shadowScheduler = createShadowScheduler();
  const quality = createQualityGovernor({
    onChange(q) {
      applyQuality(q);
    },
  });

  /**
   * Current backing-buffer ratio: the viewport cap (1.25 / 1.0) limited by
   * the adaptive step ceiling.
   * @returns {number}
   */
  function syncPixelRatio() {
    const cap = pixelRatioFor(window.devicePixelRatio || 1, window.innerWidth);
    const ratio = Math.min(cap, QUALITY_PIXEL_RATIOS[quality.getStep()]);
    renderer.setPixelRatio(ratio);
    return ratio;
  }

  /**
   * Apply one adaptive-quality decision and announce it for HUD/debug.
   * @param {{step: number, shadows: boolean, fps: number}} q
   */
  function applyQuality(q) {
    const ratio = syncPixelRatio();
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.needsUpdate = true;
    // Toggling the shadow map flips a program define: every lit material
    // recompiles on the next render. Queue a parallel precompile so the
    // quality step never lands as one big frame hitch.
    schedulePrecompile();
    bus.dispatchEvent(
      new CustomEvent("quality-changed", {
        detail: { pixelRatio: ratio, shadows: q.shadows, fps: q.fps },
      })
    );
  }

  // --- shader precompile -----------------------------------------------------
  // First-time programs (a boss's new material combos, the Origin's extra
  // light recompiling every lit material, storm visuals, the shadow-toggle
  // above) previously compiled inside the FIRST render that drew them — one
  // multi-hundred-ms frame hitch. A synchronous `renderer.compile()` issues
  // the same links at spawn time instead of inside the first draw that needs
  // them, so the cost lands once per spawn event rather than mid-frame.
  //
  // compileAsync was tried and REMOVED: its checkMaterialsReady() poll calls
  // gl.getProgramParameter(COMPLETION_STATUS_KHR) every 10 ms, which blocks
  // the main thread on ANGLE/D3D11 while a link is in flight — and spawnables
  // keep feeding new pending programs into the wait set, so the poll starved
  // rAF down to ~1 fps indefinitely. Sync compile has no poll loop: links are
  // issued and the driver resolves them on first use.
  //
  // The queue is debounced: "zombie-spawned" fires per unit during wave
  // spawns; one pass covers everything queued in the same tick.
  const PRECOMPILE_DEBOUNCE_MS = 300;
  let precompileQueued = false;
  let lastPrecompile = -Infinity;

  function schedulePrecompile() {
    precompileQueued = true;
  }

  function pumpPrecompile() {
    if (!precompileQueued) return;
    const now = performance.now();
    if (now - lastPrecompile < PRECOMPILE_DEBOUNCE_MS) return;
    precompileQueued = false;
    lastPrecompile = now;
    try {
      renderer.compile(scene, camera);
    } catch (err) {
      console.warn("engine: shader precompile failed", err);
    }
  }

  for (const type of [
    "zombie-spawned",
    "boss-spawned",
    "origin-alive",
    "weather-changed",
    "state-changed",
  ]) {
    bus.addEventListener(type, schedulePrecompile);
  }

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / Math.max(1, window.innerHeight),
    0.1,
    500
  );

  // Accessibility / game feel: persisted FOV at boot + live patches. Aspect is
  // untouched (applySize keeps it in sync below).
  attachFovSettings(camera, bus);

  const resizeCallbacks = [];

  function applySize() {
    const width = window.innerWidth;
    const height = Math.max(1, window.innerHeight);
    renderer.setSize(width, height, true);
    // Crossing the narrow/high-DPI breakpoint changes the base cap.
    syncPixelRatio();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    for (const cb of resizeCallbacks) {
      try {
        cb(width, height);
      } catch (err) {
        console.error("engine onResize callback failed:", err);
      }
    }
  }

  window.addEventListener("resize", applySize);
  applySize();

  // Clock: `last < 0` marks "no previous frame yet" so the first update()
  // returns 0 instead of the whole time since engine creation.
  let last = -1;

  /** @returns {number} delta seconds, clamped to <= 0.05 */
  function update() {
    const now = performance.now();
    if (last < 0) {
      last = now;
      return 0;
    }
    let dt = (now - last) / 1000;
    last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    // Adaptive quality sees the RAW frame time (the returned value is clamped);
    // the governor ignores stall spikes, so no false downgrades on tab switch.
    quality.sample(dt);
    // Static shadow map: refresh every ~30 frames or after 4 m of camera
    // travel. `needsUpdate` is consumed by the next render and auto-cleared.
    if (shadowScheduler.step(camera.position.x, camera.position.z)) {
      renderer.shadowMap.needsUpdate = true;
    }
    return Math.min(dt, 0.05);
  }

  function render() {
    pumpPrecompile();
    renderer.render(scene, camera);
  }

  return {
    renderer,
    scene,
    camera,
    onResize(cb) {
      if (typeof cb === "function") resizeCallbacks.push(cb);
    },
    update,
    render,
    /**
     * Queue a parallel shader precompile for materials that entered the scene
     * since the last pass (spawned bosses, weather visuals). Debounced; the
     * bus events above already cover the common spawn paths.
     */
    precompile: schedulePrecompile,
  };
}
