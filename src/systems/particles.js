/**
 * Particle system: a pre-allocated POOL of ~500 small meshes/sprites that are
 * recycled (never allocate per shot in steady state).
 *
 * Physics per particle: initial velocity + slight gravity, lifetime
 * 0.3–0.8 s, then the particle returns to the pool. Colors: blood = dark red,
 * muzzle = yellow-orange, sparks = pale/bright.
 *
 * Call sites: combat.js spawns blood at each pellet hit (n = 8..14) and a
 * muzzle blast per shot; sparks are available for impact accents (optional
 * use by combat/pickups).
 *
 * dispose(): release the pool and its geometries/materials.
 *
 * Implementation: ONE InstancedMesh of 480 tiny boxes (1 draw call, frustum
 * culling off). Active particles are compacted to indices [0, count) with
 * swap-remove; mesh.count hides the rest. Per-particle state lives in a
 * pre-allocated array — spawn/update write no new objects. If the pool is
 * full, the oldest slot is stolen so bursts never disappear.
 *
 * @param {import("three").Scene} scene
 * @returns {Particles}
 */

/**
 * @typedef {Object} Particles
 * @property {(position: import("three").Vector3, n?: number) => void} spawnBlood
 *   Burst of n dark-red blood particles at position (callers pass 8–14).
 * @property {(position: import("three").Vector3, dir: import("three").Vector3) => void} spawnMuzzle
 *   Yellow-orange muzzle blast bursting along dir.
 * @property {(position: import("three").Vector3) => void} spawnSpark
 *   A few bright sparks at position.
 * @property {(dt: number) => void} update - integrate velocities + lifetimes.
 * @property {() => void} dispose - release pool resources.
 */

import * as THREE from "three";

const POOL_SIZE = 480;
const GRAVITY_DEFAULT = 12;

export function createParticles(scene) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false }); // pops in the dark
  const mesh = new THREE.InstancedMesh(geo, mat, POOL_SIZE);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; // instances move; bounding sphere is not tracked
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.count = 0;
  const tmpColor = new THREE.Color();
  const dummy = new THREE.Object3D();
  // Allocate the instanceColor buffer up front (white placeholders) and
  // zero-scale every instance matrix once: a slot that has not had its matrix
  // written yet can never flash as a full-size box, whatever the call order.
  const white = new THREE.Color(1, 1, 1);
  dummy.scale.set(0, 0, 0);
  dummy.updateMatrix();
  for (let i = 0; i < POOL_SIZE; i++) {
    mesh.setColorAt(i, white);
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  /**
   * Pre-allocated per-slot state. A slot is "active" while index < count.
   * @type {Array<{px:number,py:number,pz:number,vx:number,vy:number,vz:number,
   *   life:number,maxLife:number,size:number,rx:number,ry:number,rz:number,
   *   spin:number,grav:number,r:number,g:number,b:number}>}
   */
  const slots = new Array(POOL_SIZE);
  for (let i = 0; i < POOL_SIZE; i++) {
    slots[i] = {
      px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0,
      life: 0, maxLife: 1, size: 0.05,
      rx: 0, ry: 0, rz: 0, spin: 0, grav: GRAVITY_DEFAULT,
      r: 1, g: 1, b: 1,
    };
  }
  let count = 0;
  let colorsDirty = false;
  let disposed = false;

  /**
   * Claim a slot: the next free one, or steal slot 0 (oldest) when full.
   * @returns {number} slot index
   */
  function claim() {
    if (count < POOL_SIZE) return count++;
    // Pool full: steal slot 0 (its occupant stays active at the end — its
    // color must move with it; slot 0's color is rewritten by fill() anyway).
    const oldFirst = slots[0];
    slots[0] = slots[count - 1];
    slots[count - 1] = oldFirst;
    mesh.setColorAt(count - 1, tmpColor.setRGB(oldFirst.r, oldFirst.g, oldFirst.b));
    colorsDirty = true;
    return 0;
  }

  /** @returns {number} random in [lo, hi) */
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  /**
   * Common spawn: fill the claimed slot from explicit channels.
   * @param {number} i slot index
   * @param {number} px @param {number} py @param {number} pz
   * @param {number} vx @param {number} vy @param {number} vz
   * @param {number} life @param {number} size @param {number} grav
   * @param {THREE.Color} color
   */
  function fill(i, px, py, pz, vx, vy, vz, life, size, grav, color) {
    const s = slots[i];
    s.px = px; s.py = py; s.pz = pz;
    s.vx = vx; s.vy = vy; s.vz = vz;
    s.life = life; s.maxLife = life;
    s.size = size;
    s.rx = Math.random() * Math.PI;
    s.ry = Math.random() * Math.PI;
    s.rz = Math.random() * Math.PI;
    s.spin = rand(-7, 7);
    s.grav = grav;
    s.r = color.r; s.g = color.g; s.b = color.b;
    mesh.setColorAt(i, color);
    colorsDirty = true;
  }

  // Palettes (varied per particle at spawn).
  const bloodColor = new THREE.Color();
  const muzzleColor = new THREE.Color();
  const sparkColor = new THREE.Color();
  function pickBlood() { bloodColor.setHSL(0.99, 0.75, 0.16 + Math.random() * 0.09); return bloodColor; }
  function pickMuzzle() { muzzleColor.setHSL(0.09 + Math.random() * 0.05, 0.95, 0.55 + Math.random() * 0.15); return muzzleColor; }
  function pickSpark() { sparkColor.setHSL(0.12 + Math.random() * 0.03, 0.55, 0.82); return sparkColor; }

  /**
   * @param {import("three").Vector3} position
   * @param {number=} n - default 10, callers pass 8..14
   */
  function spawnBlood(position, n) {
    if (disposed || !position) return;
    let total = Math.floor(Number(n));
    if (!Number.isFinite(total)) total = 10; // undefined/NaN -> default burst
    total = Math.min(40, Math.max(1, total));
    for (let k = 0; k < total; k++) {
      const i = claim();
      fill(
        i,
        position.x + rand(-0.08, 0.08),
        Math.max(0.05, position.y + rand(-0.08, 0.08)),
        position.z + rand(-0.08, 0.08),
        rand(-2.6, 2.6),
        rand(0.4, 3.4), // biased upward — blood sprays then falls
        rand(-2.6, 2.6),
        rand(0.35, 0.8),
        rand(0.045, 0.1),
        GRAVITY_DEFAULT,
        pickBlood()
      );
    }
  }

  /**
   * @param {import("three").Vector3} position - muzzle world position
   * @param {import("three").Vector3} dir - camera forward (normalized)
   */
  function spawnMuzzle(position, dir) {
    if (disposed || !position || !dir) return;
    const total = 14;
    for (let k = 0; k < total; k++) {
      const i = claim();
      const speed = rand(3, 8);
      // Burst along dir with a widening cone of sideways jitter.
      fill(
        i,
        position.x,
        position.y,
        position.z,
        dir.x * speed + rand(-1.8, 1.8),
        dir.y * speed + rand(-1.2, 1.6),
        dir.z * speed + rand(-1.8, 1.8),
        rand(0.3, 0.5),
        rand(0.05, 0.11),
        5, // lighter than blood: embers hang a moment
        pickMuzzle()
      );
    }
  }

  /** @param {import("three").Vector3} position */
  function spawnSpark(position) {
    if (disposed || !position) return;
    const total = 5;
    for (let k = 0; k < total; k++) {
      const i = claim();
      fill(
        i,
        position.x,
        position.y,
        position.z,
        rand(-5, 5),
        rand(0.5, 5.5),
        rand(-5, 5),
        rand(0.3, 0.55),
        rand(0.028, 0.05),
        16, // snappy drop
        pickSpark()
      );
    }
  }

  /**
   * Integrate active particles, swap-remove the dead, then push matrices.
   * @param {number} dt
   */
  function update(dt) {
    if (disposed || count === 0) return;
    const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    for (let i = 0; i < count; i++) {
      const s = slots[i];
      s.life -= step;
      if (s.life <= 0) {
        // Swap-remove: move the last active slot here, recheck this index.
        const last = slots[count - 1];
        slots[count - 1] = s;
        slots[i] = last;
        mesh.setColorAt(i, tmpColor.setRGB(last.r, last.g, last.b));
        colorsDirty = true;
        count--;
        i--;
        continue;
      }
      s.vy -= s.grav * step;
      s.px += s.vx * step;
      s.py += s.vy * step;
      s.pz += s.vz * step;
      if (s.py < 0.03) {
        // Floor hit: settle, kill most of the velocity (cheap bounce).
        s.py = 0.03;
        s.vy = Math.abs(s.vy) > 1.5 ? -s.vy * 0.3 : 0;
        s.vx *= 0.72;
        s.vz *= 0.72;
      }
    }

    // One matrix pass over the survivors.
    for (let i = 0; i < count; i++) {
      const s = slots[i];
      const age = s.life / s.maxLife; // 0..1, shrink as it dies
      dummy.position.set(s.px, s.py, s.pz);
      dummy.rotation.set(s.rx + s.spin * (s.maxLife - s.life), s.ry, s.rz);
      const sc = s.size * (0.35 + 0.65 * age);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (colorsDirty) {
      mesh.instanceColor.needsUpdate = true;
      colorsDirty = false;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    count = 0;
    scene.remove(mesh);
    mesh.dispose(); // releases instance buffers
    geo.dispose();
    mat.dispose();
  }

  return { spawnBlood, spawnMuzzle, spawnSpark, update, dispose };
}
