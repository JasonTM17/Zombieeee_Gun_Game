/**
 * ============================================================================
 * GROUND DETAIL — instanced ground cover for the whole city.
 * ============================================================================
 * Adds the small-scale dressing the merged tree/canopy passes cannot reach:
 *
 * - ~800 GRASS TUFTS: two crossed quads per clump, one InstancedMesh, per-
 *   instance hue variation (desaturated night greens/browns). Lambert so the
 *   static moon shadow map still shades them.
 * - ~140 WILDFLOWERS: tiny instanced cross-quads with a faint emissive tint —
 *   they read as faint night blooms without touching the light budget.
 * - ~170 RUBBLE SLABS: instanced small boxes (concrete/paper tones) clustered
 *   near walls — the "abandoned city" litter pass.
 * - ~90 FIREFLIES: one THREE.Points cloud with per-point phase; update()
 *   drifts them on sine paths (≈90 sin calls/frame — trivial) so the night
 *   air never sits still.
 *
 * Budget: 4 draw calls total, zero per-frame allocation, nothing is solid.
 * Placement is deterministic (mulberry32 fixed seed): every point samples
 * `level.isBlocked(x, z, 0.3)` — the world rect is walkable-and-clear —
 * plus a clearance from spawn points so cover never grows under the player.
 *
 * @param {import("three").Scene} scene
 * @param {import("./level.js").Level} level
 * @param {import("./city.js").City=} city
 * @returns {{count: number, meshes: THREE.Object3D[],
 *   update: (dt: number, playerPos?: THREE.Vector3) => void}}
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const SEED = 0x9e3779b9;
const WORLD_HALF = 128; // city is 260×260 centered on origin
const GRASS_COUNT = 800;
const FLOWER_COUNT = 140;
const RUBBLE_COUNT = 170;
const FIREFLY_COUNT = 90;
const SPAWN_CLEAR = 2.5;

function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function collectSpawns(level, city) {
  const out = [];
  if (level && Array.isArray(level.spawnPoints)) {
    for (const p of level.spawnPoints) out.push({ x: p.x, z: p.z });
  }
  if (city && Array.isArray(city.districts)) {
    for (const d of city.districts) {
      if (d && d.center) out.push({ x: d.center.x, z: d.center.z });
    }
  }
  return out;
}

export function createGroundDetail(scene, level, city) {
  const rng = makeRng(SEED);
  const spawns = collectSpawns(level, city);
  const blocked =
    level && typeof level.isBlocked === "function"
      ? (x, z, r) => level.isBlocked(x, z, r)
      : () => false;

  function free(x, z) {
    if (blocked(x, z, 0.3)) return false;
    for (let i = 0; i < spawns.length; i++) {
      const dx = x - spawns[i].x;
      const dz = z - spawns[i].z;
      if (dx * dx + dz * dz < SPAWN_CLEAR * SPAWN_CLEAR) return false;
    }
    return true;
  }

  /** Rejection-sample a free ground point; null when the world is full. */
  function sample() {
    for (let i = 0; i < 24; i++) {
      const x = (rng() * 2 - 1) * WORLD_HALF;
      const z = (rng() * 2 - 1) * WORLD_HALF;
      if (free(x, z)) return { x, z };
    }
    return null;
  }

  const meshes = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // --- grass tufts -----------------------------------------------------------
  const bladeA = new THREE.PlaneGeometry(0.42, 0.4);
  bladeA.translate(0, 0.2, 0);
  const bladeB = bladeA.clone();
  bladeB.rotateY(Math.PI / 2);
  const tuftGeo = mergeGeometries([bladeA, bladeB]);
  const tuftMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, GRASS_COUNT);
  tufts.name = "ground-detail-grass";
  let placed = 0;
  for (let i = 0; i < GRASS_COUNT; i++) {
    const p = sample();
    if (!p) break;
    const s = 0.55 + rng() * 0.9;
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.set(s * (0.7 + rng() * 0.6), s, s * (0.7 + rng() * 0.6));
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
    // night palette: moss → dry straw → grey-green
    color.setHSL(0.22 + rng() * 0.09, 0.25 + rng() * 0.2, 0.16 + rng() * 0.12);
    tufts.setColorAt(i, color);
    placed++;
  }
  tufts.count = placed;
  tufts.castShadow = false;
  tufts.receiveShadow = true;
  tufts.frustumCulled = false; // base-geo bounds would cull the whole spread
  scene.add(tufts);
  meshes.push(tufts);

  // --- wildflowers -----------------------------------------------------------
  const petalGeoA = new THREE.PlaneGeometry(0.09, 0.09);
  petalGeoA.translate(0, 0.16, 0);
  const petalGeoB = petalGeoA.clone();
  petalGeoB.rotateY(Math.PI / 2);
  const flowerGeo = mergeGeometries([petalGeoA, petalGeoB]);
  const flowerMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.35,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  });
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, FLOWER_COUNT);
  flowers.name = "ground-detail-flowers";
  const FLOWER_HUES = [0.13, 0.6, 0.85, 0.05, 0.75];
  placed = 0;
  for (let i = 0; i < FLOWER_COUNT; i++) {
    const p = sample();
    if (!p) break;
    const s = 0.7 + rng() * 0.8;
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    color.setHSL(FLOWER_HUES[(rng() * FLOWER_HUES.length) | 0], 0.55, 0.45);
    flowers.setColorAt(i, color);
    placed++;
  }
  flowers.count = placed;
  flowers.castShadow = false;
  flowers.receiveShadow = false;
  flowers.frustumCulled = false;
  scene.add(flowers);
  meshes.push(flowers);

  // --- rubble slabs ----------------------------------------------------------
  const slabGeo = new THREE.BoxGeometry(1, 1, 1);
  const slabMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const rubble = new THREE.InstancedMesh(slabGeo, slabMat, RUBBLE_COUNT);
  rubble.name = "ground-detail-rubble";
  placed = 0;
  for (let i = 0; i < RUBBLE_COUNT; i++) {
    const p = sample();
    if (!p) break;
    dummy.position.set(p.x, 0.015 + rng() * 0.02, p.z);
    dummy.rotation.set(
      (rng() - 0.5) * 0.12,
      rng() * Math.PI,
      (rng() - 0.5) * 0.12
    );
    dummy.scale.set(0.1 + rng() * 0.32, 0.02 + rng() * 0.06, 0.08 + rng() * 0.22);
    dummy.updateMatrix();
    rubble.setMatrixAt(i, dummy.matrix);
    // concrete / paper / brick tones, all muted for the night grade
    const pick = rng();
    if (pick < 0.5) color.setHSL(0.08, 0.04, 0.18 + rng() * 0.12);
    else if (pick < 0.8) color.setHSL(0.1, 0.12, 0.3 + rng() * 0.15);
    else color.setHSL(0.03, 0.25, 0.2 + rng() * 0.1);
    rubble.setColorAt(i, color);
    placed++;
  }
  rubble.count = placed;
  rubble.castShadow = false;
  rubble.receiveShadow = true;
  rubble.frustumCulled = false;
  scene.add(rubble);
  meshes.push(rubble);

  // --- bushes ----------------------------------------------------------------
  // Flattened icosahedra hug walls and tree feet — mid-scale greenery the
  // grass layer cannot carry. One instanced Lambert mesh, night-moss hues.
  const bushGeo = new THREE.IcosahedronGeometry(0.5, 1);
  const bushMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, 140);
  bushes.name = "ground-detail-bushes";
  placed = 0;
  for (let i = 0; i < 140; i++) {
    const p = sample();
    if (!p) break;
    dummy.position.set(p.x, 0.12 + rng() * 0.08, p.z);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.set(0.9 + rng() * 1.6, 0.45 + rng() * 0.5, 0.9 + rng() * 1.6);
    dummy.updateMatrix();
    bushes.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.24 + rng() * 0.07, 0.3 + rng() * 0.2, 0.14 + rng() * 0.1);
    bushes.setColorAt(i, color);
    placed++;
  }
  bushes.count = placed;
  bushes.castShadow = false;
  bushes.receiveShadow = true;
  bushes.frustumCulled = false;
  scene.add(bushes);
  meshes.push(bushes);

  // --- puddles ---------------------------------------------------------------
  // Rain-fed ground mirrors: flat discs with a dark, glossy standard
  // material (high metalness, near-zero roughness) — the lamp glow and
  // lightning grade them naturally. Slightly larger radii read as sheets.
  const puddleGeo = new THREE.CircleGeometry(1, 14);
  puddleGeo.rotateX(-Math.PI / 2);
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x0b1220,
    roughness: 0.08,
    metalness: 0.85,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  const puddles = new THREE.InstancedMesh(puddleGeo, puddleMat, 90);
  puddles.name = "ground-detail-puddles";
  placed = 0;
  for (let i = 0; i < 90; i++) {
    const p = sample();
    if (!p) break;
    dummy.position.set(p.x, 0.012, p.z);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.set(0.5 + rng() * 1.4, 1, 0.35 + rng() * 0.9);
    dummy.updateMatrix();
    puddles.setMatrixAt(i, dummy.matrix);
    placed++;
  }
  puddles.count = placed;
  puddles.castShadow = false;
  puddles.receiveShadow = false;
  puddles.frustumCulled = false;
  puddles.renderOrder = 1;
  scene.add(puddles);
  meshes.push(puddles);

  // --- drifting motes --------------------------------------------------------
  // Ash/leaf motes adrift on the wind — constant slow motion everywhere, so
  // the air itself feels alive. Wrap-around fall keeps the set permanent.
  const MOTE_COUNT = 120;
  const motePositions = new Float32Array(MOTE_COUNT * 3);
  const moteBase = new Float32Array(MOTE_COUNT * 3);
  const motePhase = new Float32Array(MOTE_COUNT * 2);
  let motePlaced = 0;
  for (let i = 0; i < MOTE_COUNT; i++) {
    const p = sample();
    if (!p) break;
    const y = 0.6 + rng() * 4.5;
    moteBase[i * 3] = p.x;
    moteBase[i * 3 + 1] = y;
    moteBase[i * 3 + 2] = p.z;
    motePositions[i * 3] = p.x;
    motePositions[i * 3 + 1] = y;
    motePositions[i * 3 + 2] = p.z;
    motePhase[i * 2] = rng() * Math.PI * 2;
    motePhase[i * 2 + 1] = 0.25 + rng() * 0.6; // fall rate multiplier
    motePlaced++;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
  const moteMat = new THREE.PointsMaterial({
    color: 0x9aa7b8,
    size: 0.05,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.name = "ground-detail-motes";
  motes.frustumCulled = false;
  scene.add(motes);
  meshes.push(motes);
  const moteAttr = moteGeo.getAttribute("position");

  // --- fireflies -------------------------------------------------------------
  const ffPositions = new Float32Array(FIREFLY_COUNT * 3);
  const ffBase = new Float32Array(FIREFLY_COUNT * 3);
  const ffPhase = new Float32Array(FIREFLY_COUNT * 2);
  let ffPlaced = 0;
  for (let i = 0; i < FIREFLY_COUNT; i++) {
    const p = sample();
    if (!p) break;
    const y = 0.5 + rng() * 1.8;
    ffBase[i * 3] = p.x;
    ffBase[i * 3 + 1] = y;
    ffBase[i * 3 + 2] = p.z;
    ffPositions[i * 3] = p.x;
    ffPositions[i * 3 + 1] = y;
    ffPositions[i * 3 + 2] = p.z;
    ffPhase[i * 2] = rng() * Math.PI * 2;
    ffPhase[i * 2 + 1] = 0.5 + rng() * 1.2;
    ffPlaced++;
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute("position", new THREE.BufferAttribute(ffPositions, 3));
  const ffMat = new THREE.PointsMaterial({
    color: 0xb8e06a,
    size: 0.09,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const fireflies = new THREE.Points(ffGeo, ffMat);
  fireflies.name = "ground-detail-fireflies";
  fireflies.frustumCulled = false; // they drift; culling the wrong box pops them
  scene.add(fireflies);
  meshes.push(fireflies);

  let t = 0;
  const posAttr = ffGeo.getAttribute("position");

  /**
   * Drift the fireflies + falling motes; everything else is static.
   * @param {number} dt
   */
  function update(dt) {
    if (!dt) return;
    t += dt;
    if (ffPlaced > 0) {
      for (let i = 0; i < ffPlaced; i++) {
        const ph = ffPhase[i * 2];
        const speed = ffPhase[i * 2 + 1];
        const a = t * speed + ph;
        posAttr.array[i * 3] = ffBase[i * 3] + Math.sin(a) * 0.9;
        posAttr.array[i * 3 + 1] = ffBase[i * 3 + 1] + Math.sin(a * 1.7 + 1.3) * 0.35;
        posAttr.array[i * 3 + 2] = ffBase[i * 3 + 2] + Math.cos(a * 0.8) * 0.9;
      }
      posAttr.needsUpdate = true;
      ffMat.opacity = 0.65 + Math.sin(t * 1.3) * 0.2;
    }
    for (let i = 0; i < motePlaced; i++) {
      const ph = motePhase[i * 2];
      const fall = motePhase[i * 2 + 1];
      const a = t * 0.7 + ph;
      let y = moteBase[i * 3 + 1] - ((t * fall) % 5);
      if (y < 0.1) y += 5;
      moteAttr.array[i * 3] = moteBase[i * 3] + Math.sin(a) * 1.4;
      moteAttr.array[i * 3 + 1] = y;
      moteAttr.array[i * 3 + 2] = moteBase[i * 3 + 2] + Math.cos(a * 0.6) * 1.1;
    }
    if (motePlaced > 0) moteAttr.needsUpdate = true;
  }

  return {
    count:
      tufts.count +
      flowers.count +
      rubble.count +
      bushes.count +
      puddles.count +
      ffPlaced +
      motePlaced,
    meshes,
    update,
  };
}
