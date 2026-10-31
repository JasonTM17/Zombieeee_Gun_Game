/**
 * Night atmosphere for the 60 x 60 m arena:
 * - near-black blue night sky (scene.background);
 * - FogExp2 with a dark color (density 0.026 — NIGHT 30 P1 §5.7: thickened
 *   from 0.022 so the far city melts into fog before the draw limit);
 * - moon: DirectionalLight, pale blue, LOW intensity, castShadow with a
 *   shadow frustum sized to cover the arena;
 * - very weak ambient + hemisphere light (shadows stay readable);
 * - 4–6 warm PointLights placed around the arena that flicker (each with its
 *   own random flicker phase/rate);
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
 * before. The 84 × 84 frustum keeps covering everything the fog lets you see
 * of the near streets; far silhouettes are deliberately unshadowed.
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

const SKY = 0x05070c;
const FOG_COLOR = 0x0a0e16;
const FOG_DENSITY = 0.026; // §3.7/§5.7: 0.022 → 0.026 (hides the draw limit)

export function createAtmosphere(scene) {
  // --- sky + fog ---------------------------------------------------------------
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

  // --- moon (the only shadow caster) --------------------------------------------
  const moon = new THREE.DirectionalLight(0xbdd4ff, 0.6);
  moon.position.set(40, 70, -25);
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  // Ortho frustum covers the whole 60 x 60 arena with margin.
  moon.shadow.camera.left = -42;
  moon.shadow.camera.right = 42;
  moon.shadow.camera.top = 42;
  moon.shadow.camera.bottom = -42;
  moon.shadow.camera.near = 10;
  moon.shadow.camera.far = 180;
  moon.shadow.bias = -0.0002;
  moon.shadow.normalBias = 0.03;
  scene.add(moon);
  scene.add(moon.target);

  // --- very weak fill ------------------------------------------------------------
  const ambient = new THREE.AmbientLight(0x223048, 0.55);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0x32456e, 0x0c0f16, 0.4);
  scene.add(hemi);

  // --- warm flickering lamps ------------------------------------------------------
  const lampPos = [
    [-17, 3.2, -17],
    [17, 3.2, -17],
    [-17, 3.2, 17],
    [17, 3.2, 17],
    [0, 3.8, 6],
  ];
  /** @type {import("three").PointLight[]} */
  const lamps = [];
  /** @type {{mat: import("three").MeshBasicMaterial, base: import("three").Color}[]} */
  const bulbs = [];
  const flicker = [];
  const bulbGeo = new THREE.SphereGeometry(0.09, 8, 6);

  for (const [x, y, z] of lampPos) {
    const base = 24 + Math.random() * 6; // physical intensity (candela-ish)
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
