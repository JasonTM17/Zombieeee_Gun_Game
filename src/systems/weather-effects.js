/**
 * ============================================================================
 * WEATHER EFFECTS — makes the weather cycle mechanically meaningful.
 * ============================================================================
 * createWeatherEffects(bus, weather, zombies, player) owns the gameplay layer
 * between src/world/weather.js and the live zombie list:
 *
 *   mode    target (full intensity)      mechanic
 *   clear   1.00                          everything normal
 *   rain    0.90                          live zombies move 10% slower
 *   storm   0.88                          live zombies move 12% slower
 *   fog     0.95                          live zombies move 5% slower
 *
 * Targets are read from weather.state()'s additive `effects.zombieSpeedMul`
 * (weather.js computes them), so the two modules cannot drift. Every LIVE
 * zombie (regular types, bosses, the Origin) receives the same smoothly
 * interpolated `weatherSpeedMul`; zombie.js multiplies its steering speed by
 * that field. Dead/corpse units are skipped — they never move again.
 *
 * Smoothing: a 2 s exponential approach (k = min(1, dt / 2)) toward the target,
 * so entering/leaving rain never snaps zombie speed. At dt ≤ 0.05 the result
 * is frame-rate independent enough for gameplay (the exact same rule as the
 * weather layer's own wind ramps).
 *
 * Bus: consumes the weather object directly (no weather events needed for the
 * targets); emits "weather-effects" {mode, intensity, zombieSpeedMul} only on
 * a visible change (mode, 1% intensity or 1% speed multiplier). At 60 fps a
 * steady sky emits nothing.
 *
 * Allocation: update() writes only numbers into one preallocated `scratch`
 * state (weather.readState fills it in place) and into the zombie field. No
 * arrays, closures or event objects are created per frame; a CustomEvent is
 * created only on an emitted change. state() returns a fresh debug snapshot.
 *
 * Wiring (lead / main.js — this module edits nothing else):
 *   import { createWeatherEffects } from "./systems/weather-effects.js";
 *   const weatherEffects = createWeatherEffects(bus, weather, zombies, player);
 *   // playing: weatherEffects.update(dt);
 *
 * Boss coverage note (bosses.js/origin.js are outside this module's scope):
 * the base Zombie.update is shared by regular zombies, the butcher/screamer/
 * golem chase and the Origin chase, so those move at the scaled speed. The
 * spitter's scripted keep-distance rows and the butcher/Origin charge dashes
 * use fixed m/s constants inside their own classes and keep those speeds.
 * All of them still receive the field (the state reports zombiesAffected).
 *
 * @param {EventTarget} bus - shared bus (src/systems/gamestate.js).
 * @param {{state: () => Object, readState?: (out?: Object) => Object}} weather
 *   the object returned by createWeather().
 * @param {Array<{alive?: boolean, weatherSpeedMul?: number}>} zombies
 *   the SHARED live array main.js mutates in place; read fresh every update.
 * @param {import("../player/controller.js").Player} player - reserved for
 *   future weather rules; accepted to keep the integration signature stable.
 * @returns {{update: (dt: number) => void, state: () => {
 *   mode: string, intensity: number, zombieSpeedMul: number,
 *   targetZombieSpeedMul: number, zombiesAffected: number,
 *   playerSpreadMul: number, visionMul: number}}}
 */

const LERP_SECONDS = 2; // smooth-in/out time constant (s)
const EMIT_STEP = 0.01; // emit weather-effects on 1% intensity / speed change
const SNAP_EPSILON = 1e-4; // land exactly on the target instead of chasing 0
const FALLBACK_RAIN_SLOW = 0.1;
const FALLBACK_STORM_SLOW = 0.12;
const FALLBACK_FOG_SLOW = 0.05;

/** @param {number} v @param {number} lo @param {number} hi */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Target formula used only when a legacy weather object omits effects. */
function fallbackSpeed(mode, intensity) {
  if (mode === "rain") return 1 - FALLBACK_RAIN_SLOW * intensity;
  if (mode === "storm") return 1 - FALLBACK_STORM_SLOW * intensity;
  if (mode === "fog") return 1 - FALLBACK_FOG_SLOW * intensity;
  return 1;
}

/**
 * @param {EventTarget} bus
 * @param {{state: () => Object, readState?: (out?: Object) => Object}} weather
 * @param {Array<{alive?: boolean, weatherSpeedMul?: number}>} zombies
 * @param {import("../player/controller.js").Player} player
 */
export function createWeatherEffects(bus, weather, zombies, player) {
  void player; // reserved: weather currently slows zombies only (no player rule)
  const B = bus && typeof bus.addEventListener === "function" ? bus : null;
  const W =
    weather && typeof weather.state === "function" ? weather : null;
  const list = Array.isArray(zombies) ? zombies : [];

  // Reused weather-state buffer (weather.readState fills it in place).
  const scratch = {
    mode: "clear",
    intensity: 0,
    timer: 0,
    strikes: 0,
    rainIntensity: 0,
    fogIntensity: 0,
    effects: { zombieSpeedMul: 1, playerSpreadMul: 1, visionMul: 1 },
  };

  let mode = "clear";
  let intensity = 0;
  let currentMul = 1; // smoothed, applied to every live zombie this frame
  let targetMul = 1; // instantaneous weather target
  let visionMul = 1;
  let affected = 0;

  // Event edge caches (null mode → one initial event so a late-created HUD syncs).
  let lastEmitMode = null;
  let lastEmitIntensity = -1;
  let lastEmitMul = -1;

  /** Read the live weather state without allocating when possible. */
  function readWeather() {
    if (!W) return null;
    return typeof W.readState === "function" ? W.readState(scratch) : W.state();
  }

  /**
   * Advance smoothing, apply the multiplier to every live zombie and emit one
   * "weather-effects" edge when the visible values changed. Allocation-free.
   * @param {number} dt seconds
   */
  function update(dt) {
    if (!W || !Number.isFinite(dt) || dt <= 0) return;

    const s = readWeather();
    if (!s) return;

    mode = typeof s.mode === "string" ? s.mode : "clear";
    const rawIntensity = Number(s.intensity);
    intensity = Number.isFinite(rawIntensity) ? clamp(rawIntensity, 0, 1) : 0;

    // Prefer weather.js's authoritative target; fall back to the same formula
    // for an older weather object without `effects`.
    let target = s.effects ? Number(s.effects.zombieSpeedMul) : NaN;
    if (!Number.isFinite(target)) target = fallbackSpeed(mode, intensity);
    targetMul = clamp(target, 0.5, 1.2);

    const v = s.effects ? Number(s.effects.visionMul) : NaN;
    visionMul = Number.isFinite(v) ? clamp(v, 0, 1) : 1;

    // Smooth 2 s approach, then land exactly on the target (no tiny residue).
    const k = Math.min(1, dt / LERP_SECONDS);
    currentMul += (targetMul - currentMul) * k;
    if (Math.abs(targetMul - currentMul) < SNAP_EPSILON) currentMul = targetMul;

    // Apply to every LIVE unit — regular zombies, bosses and the Origin all
    // inherit weatherSpeedMul from the Zombie constructor (default 1).
    let live = 0;
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      if (!z || z.alive !== true) continue;
      z.weatherSpeedMul = currentMul;
      live++;
    }
    affected = live;

    // Emit only real changes; a steady sky produces zero events/frames.
    if (
      mode !== lastEmitMode ||
      Math.abs(intensity - lastEmitIntensity) >= EMIT_STEP ||
      Math.abs(currentMul - lastEmitMul) >= EMIT_STEP
    ) {
      lastEmitMode = mode;
      lastEmitIntensity = intensity;
      lastEmitMul = currentMul;
      if (B) {
        B.dispatchEvent(
          new CustomEvent("weather-effects", {
            detail: {
              mode,
              intensity,
              zombieSpeedMul: currentMul,
            },
          })
        );
      }
    }
  }

  /**
   * Fresh debug/HUD snapshot (callers may mutate it — it is not live state).
   * @returns {{mode: string, intensity: number, zombieSpeedMul: number,
   *   targetZombieSpeedMul: number, zombiesAffected: number,
   *   playerSpreadMul: number, visionMul: number}}
   */
  function state() {
    return {
      mode,
      intensity,
      zombieSpeedMul: currentMul,
      targetZombieSpeedMul: targetMul,
      zombiesAffected: affected,
      playerSpreadMul: 1, // weapons.js is untouched: no spread mechanic
      visionMul,
    };
  }

  return { update, state };
}
