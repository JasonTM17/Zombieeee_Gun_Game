/**
 * Night atmosphere for the 60 x 60 m arena:
 * - readable dark-blue night sky (scene.background 0x0a1322);
 * - FogExp2 0x111b2d at density 0.020 — still hides the draw limit, but the
 *   near streets and props stay legible;
 * - moon: DirectionalLight 0xbdd4ff at 1.05, castShadow with a 1024 map and a
 *   64 × 64 frustum that follows the player;
 * - ambient 0.95 + hemisphere 0.75 (ground 0x1a2333) and a weak cool fill
 *   DirectionalLight (0x6f8fbf, 0.35) from the opposite side so shadowed faces
 *   read instead of going black;
 * - 3 warm PointLights placed around the arena that flicker (each with its
 *   own random flicker phase/rate); the forward renderer compiles every
 *   visible light, so the two redundant arena lamps were removed.
 * - stars as a THREE.Points dome above the arena.
 *
 * update(dt) advances the flicker timers (dt in seconds).
 *
 * NIGHT 30 P1 (docs/EXPANSION-P1.md §5.7 — ADDITIVE, Builder WORLD scope that
 * the integrator implements; behavior without the new argument is unchanged):
 * update(dt, playerPos) also DRAGS THE MOON SHADOW FRUSTUM along with the
 * player — `moon.position = player + (40, 70, −25)` and
 * `moon.target = player`, both quantized to 2 m steps so the shadow map does
 * not shimmer as the frustum re-centers (map size / bias untouched). Without
 * the second argument the moon stays parked over the legacy arena, exactly as
 * before. The 64 × 64 frustum keeps covering everything the fog lets you see
 * of the near streets; far silhouettes are deliberately unshadowed.
 *
 * NIGHT 30 P2 (docs/EXPANSION-P2.md §3.6.2 — ADDITIVE, Builder A): listens
 * "bloodmoon-active" {active} on the shared bus and lerps `scene.background`
 * (SKY 0x0a1322 → blood 0x180507) and `scene.fog.color` (FOG_COLOR 0x111b2d
 * → 0x26070a) over ~2.5 s inside the existing update(dt) — factor dt/2.5,
 * then back to the exact base constants when the flag clears. No other
 * behavior changes: lamps, stars, moon and the P1 moon-follow are untouched,
 * and with no bloodmoon ever started the per-frame cost is one comparison.
 *
 * @param {import("three").Scene} scene
 * @returns {Atmosphere}
 */

/**
 * @typedef {Object} Atmosphere
 * @property {(dt: number, playerPos?: {x: number, z: number}) => void} update
 *   advance flicker animation; optional playerPos re-centers the moon shadow
 *   frustum on the player (NIGHT 30 P1 §5.7 — omitted → legacy arena parking).
 */

import * as THREE from "three";
import { bus } from "../systems/gamestate.js";

// Readable dark-blue night: lighter than the old near-black (0x05070c) but
// still clearly nighttime, not daylight.
const SKY = 0x0a1322;
const FOG_COLOR = 0x111b2d;
const FOG_DENSITY = 0.020; // thinned from 0.026 so near streets stay legible

// Moon shadow budget: 1024 map over a 64 × 64 m player-followed frustum.
// Halves the shadow-map resolution and ~40% of the covered area vs the old
// 2048 / 84 m setup while still shadowing everything the fog reveals.
export const MOON_SHADOW_MAP_SIZE = 1024;
export const MOON_SHADOW_FRUSTUM = 64;
export const MOON_INTENSITY = 1.05;

// NIGHT 30 P2 §3.6.2 — bloodmoon targets (contract numbers, verbatim).
const BLOODMOON_SKY = 0x180507;
const BLOODMOON_FOG = 0x26070a;
const BLOODMOON_LERP = 2.5; // seconds for the full tint (either direction)

export function createAtmosphere(scene) {
  // --- sky + fog ---------------------------------------------------------------
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

  // --- moon (the only shadow caster) --------------------------------------------
  const moon = new THREE.DirectionalLight(0xbdd4ff, MOON_INTENSITY);
  moon.position.set(40, 70, -25);
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.set(MOON_SHADOW_MAP_SIZE, MOON_SHADOW_MAP_SIZE);
  // Ortho frustum (64 × 64 m) covers the arena + near streets with margin;
  // update() re-centers it on the player, so the smaller box is enough.
  const half = MOON_SHADOW_FRUSTUM / 2;
  moon.shadow.camera.left = -half;
  moon.shadow.camera.right = half;
  moon.shadow.camera.top = half;
  moon.shadow.camera.bottom = -half;
  moon.shadow.camera.near = 10;
  moon.shadow.camera.far = 180;
  moon.shadow.bias = -0.0002;
  moon.shadow.normalBias = 0.03;
  scene.add(moon);
  scene.add(moon.target);

  // --- readable night fill -------------------------------------------------------
  // Moonlight + ambient + hemisphere keep unlit faces from turning black; a
  // single cool directional from the opposite side adds shape to shadowed
  // sides without a second shadow map (castShadow stays false).
  const ambient = new THREE.AmbientLight(0x223048, 0.95);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0x32456e, 0x1a2333, 0.75);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x6f8fbf, 0.35);
  fill.position.set(-40, 30, 25); // opposite the moon (40, 70, -25)
  fill.target.position.set(0, 0, 0);
  fill.castShadow = false; // budget: the moon stays the only shadow caster
  scene.add(fill);
  scene.add(fill.target);

  // --- warm flickering lamps ------------------------------------------------------
  // Three corner lamps (was five): every visible light is compiled into the
  // forward shader, so the redundant center + fourth-corner lamps are gone.
  // Ambient + hemisphere + moon + the city district lights still cover them.
  const lampPos = [
    [-17, 3.2, -17],
    [17, 3.2, -17],
    [-17, 3.2, 17],
  ];
  /** @type {import("three").PointLight[]} */
  const lamps = [];
  /** @type {{mat: import("three").MeshBasicMaterial, base: import("three").Color}[]} */
  const bulbs = [];
  const flicker = [];
  const bulbGeo = new THREE.SphereGeometry(0.09, 8, 6);

  for (const [x, y, z] of lampPos) {
    // Modest lift (+25%): warm pools read on the darker ground/pavement now
    // that ambient/moonlight are higher. Physical intensity (candela-ish).
    const base = 30 + Math.random() * 7;
    const light = new THREE.PointLight(0xffa95c, base, 24, 2);
    light.position.set(x, y, z);
    scene.add(light);
    lamps.push(light);

    // A tiny visible bulb so the light has a source; fog:false keeps it
    // readable across the arena.
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc98a, fog: false, toneMapped: false });
    const bulb = new THREE.Mesh(bulbGeo, mat);
    bulb.position.set(x, y, z);
    scene.add(bulb);
    bulbs.push({ mat, base: new THREE.Color(0xffc98a) });

    // Per-lamp flicker signature: two sine rates + random phase + deep-dip timer.
    flicker.push({
      base,
      t: Math.random() * 10,
      sp1: 6 + Math.random() * 6,
      sp2: 13 + Math.random() * 9,
      ph1: Math.random() * Math.PI * 2,
      ph2: Math.random() * Math.PI * 2,
      dip: 0, // seconds remaining of a deep flicker dip
    });
  }

  // --- stars (Points dome; fog:false so they survive the FogExp2) ------------------
  const STAR_COUNT = 700;
  const STAR_R = 230;
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starCol = new Float32Array(STAR_COUNT * 3);
  const c = new THREE.Color();
  for (let i = 0; i < STAR_COUNT; i++) {
    // Random direction on the upper hemisphere (min elevation ~2 deg).
    const az = Math.random() * Math.PI * 2;
    const el = 0.035 + Math.random() * (Math.PI / 2 - 0.035);
    const sy = Math.sin(el);
    starPos[i * 3] = Math.cos(az) * Math.cos(el) * STAR_R;
    starPos[i * 3 + 1] = sy * STAR_R;
    starPos[i * 3 + 2] = Math.sin(az) * Math.cos(el) * STAR_R;
    const b = 0.25 + Math.random() * 0.75;
    c.setRGB(b, b, Math.min(1, b * 1.1)); // slight blue tint on brighter stars
    starCol[i * 3] = c.r;
    starCol[i * 3 + 1] = c.g;
    starCol[i * 3 + 2] = c.b;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
  const starMat = new THREE.PointsMaterial({
    size: 1.6,
    sizeAttenuation: false, // constant pixel size — crisp at any distance
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false; // dome wraps the camera; never cull it
  scene.add(stars);

  // --- per-frame -------------------------------------------------------------------
  // NIGHT 30 P2 §3.6.2 — bloodmoon tint state. The flag arrives on the bus
  // ("bloodmoon-active" {active}, emitted by events.js); the actual lerp runs
  // here in update() so it respects the frame clock and freezes with the rest
  // of the world when the loop stops calling us (pause: render only).
  let bloodmoon = false; // target state (bus flag)
  let bloodK = 0; // 0 = night, 1 = full bloodmoon
  const skyBase = new THREE.Color(SKY);
  const fogBase = new THREE.Color(FOG_COLOR);
  const skyBlood = new THREE.Color(BLOODMOON_SKY);
  const fogBlood = new THREE.Color(BLOODMOON_FOG);
  bus.addEventListener("bloodmoon-active", (e) => {
    const d = e && e.detail ? e.detail : {};
    bloodmoon = d.active === true;
  });

  const tmpColor = new THREE.Color();
  // Moon follow scratch (§5.7): quantize the anchor to 2 m so the shadow map
  // does not crawl every frame. Zero allocation.
  const MOON_OFFSET_X = 40;
  const MOON_OFFSET_Y = 70;
  const MOON_OFFSET_Z = -25;
  const MOON_QUANT = 2;
  let moonQX = 0;
  let moonQZ = 0;

  /**
   * Advance lamp flicker (dt seconds) + optional moon-shadow follow (§5.7).
   * Allocation-free.
   * @param {number} dt
   * @param {{x: number, z: number}} [playerPos] - player feet position; the
   *   moon shadow frustum re-centers on it (quantized). Omitted → no follow.
   */
  function update(dt, playerPos) {
    if (!Number.isFinite(dt) || dt <= 0) return;

    // Bloodmoon tint (§3.6.2): move k toward the bus flag's target, then paint
    // sky + fog. When k sits at both endpoints the branch costs nothing and
    // the scene keeps the exact base colors it was built with.
    const bloodTarget = bloodmoon ? 1 : 0;
    if (bloodK !== bloodTarget) {
      bloodK = bloodmoon
        ? Math.min(1, bloodK + dt / BLOODMOON_LERP)
        : Math.max(0, bloodK - dt / BLOODMOON_LERP);
      if (scene.background && /** @type {any} */ (scene.background).isColor) {
        /** @type {THREE.Color} */ (scene.background).copy(skyBase).lerp(skyBlood, bloodK);
      }
      if (scene.fog && scene.fog.color) {
        scene.fog.color.copy(fogBase).lerp(fogBlood, bloodK);
      }
    }

    if (
      playerPos &&
      Number.isFinite(playerPos.x) &&
      Number.isFinite(playerPos.z)
    ) {
      const qx = Math.round(playerPos.x / MOON_QUANT) * MOON_QUANT;
      const qz = Math.round(playerPos.z / MOON_QUANT) * MOON_QUANT;
      if (qx !== moonQX || qz !== moonQZ) {
        moonQX = qx;
        moonQZ = qz;
        moon.position.set(qx + MOON_OFFSET_X, MOON_OFFSET_Y, qz + MOON_OFFSET_Z);
        moon.target.position.set(qx, 0, qz);
      }
    }
    for (let i = 0; i < lamps.length; i++) {
      const f = flicker[i];
      f.t += dt;
      // Decay the deep-dip timer; start one at random (~1 per 8 s per lamp).
      if (f.dip > 0) {
        f.dip = Math.max(0, f.dip - dt);
      } else if (Math.random() < dt * 0.12) {
        f.dip = 0.06 + Math.random() * 0.14;
      }
      // Smooth wobble 0.80..1.00 of base, halved during a dip.
      const wobble =
        0.9 +
        0.07 * Math.sin(f.t * f.sp1 + f.ph1) +
        0.03 * Math.sin(f.t * f.sp2 + f.ph2);
      const k = f.dip > 0 ? 0.35 : 1;
      lamps[i].intensity = f.base * wobble * k;
      // Bulb brightness tracks its light (matches the dip too).
      const b = bulbs[i];
      tmpColor.copy(b.base).multiplyScalar(0.55 + 0.45 * wobble * k);
      b.mat.color.copy(tmpColor);
    }
  }

  return { update };
}
