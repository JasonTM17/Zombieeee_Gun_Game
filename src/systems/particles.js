/**
 * Particle system: a pre-allocated POOL of ~500 small meshes/sprites that are
 * recycled (never allocate per shot in steady state).
 *
 * Physics per particle: initial velocity + slight gravity, lifetime
 * 0.3–0.8 s, then the particle returns to the pool. Colors: blood = dark red,
 * muzzle = yellow-orange, sparks = pale/bright.
 *
 * Call sites: combat.js spawns blood at each pellet hit (n = 8..14), a muzzle
 * blast + a tiny grey smoke puff per shot, and sparks/dust at every solid
 * surface a bullet hits. sparks are also available for other accents (pickups,
 * explosions).
 *
 * Additive (contract-safe) helpers for weapon feel:
 *   spawnSmoke(position, dir?, n?) — 2–3 tiny grey smoke particles.
 *   spawnImpact(position, normal?) — 3 bright sparks + 2 dust motes, biased
 *     along the surface normal (fallback: up).
 * Both reuse the same fixed pool and follow the same zero-steady-state-alloc
 * rule as the original spawners.
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
 * @property {(position: import("three").Vector3, dir?: import("three").Vector3, n?: number) => void} spawnSmoke
 *   Tiny grey smoke puff at position, drifting along dir (default 3).
 * @property {(position: import("three").Vector3, normal?: import("three").Vector3) => void} spawnImpact
 *   Small bright spark burst + dust motes at an impact point, biased along the
 *   surface normal (bullet hits a wall/prop — never flesh).
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
  const smokeColor = new THREE.Color();
  const dustColor = new THREE.Color();
  function pickBlood() { bloodColor.setHSL(0.99, 0.75, 0.16 + Math.random() * 0.09); return bloodColor; }
  function pickMuzzle() { muzzleColor.setHSL(0.09 + Math.random() * 0.05, 0.95, 0.55 + Math.random() * 0.15); return muzzleColor; }
  function pickSpark() { sparkColor.setHSL(0.12 + Math.random() * 0.03, 0.55, 0.82); return sparkColor; }
  function pickSmoke() {
    const v = 0.3 + Math.random() * 0.14; // muted grey, never brighter than a spark
    smokeColor.setRGB(v, v * 1.02, v * 0.96);
    return smokeColor;
  }
  function pickDust() {
    const v = 0.26 + Math.random() * 0.12;
    dustColor.setRGB(v, v * 0.92, v * 0.8);
    return dustColor;
  }

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
   * Tiny, subtle grey smoke puff at the muzzle (much lighter than the 14-
   * particle yellow-orange muzzle blast). Default 3 particles.
   * @param {import("three").Vector3} position - muzzle world position
   * @param {import("three").Vector3=} dir - shot direction (optional)
   * @param {number=} n - particle count, default 3, clamped 1..6
   */
  function spawnSmoke(position, dir, n) {
    if (disposed || !position) return;
    let total = Math.floor(Number(n));
    if (!Number.isFinite(total)) total = 3;
    total = Math.min(6, Math.max(1, total));
    const dx = dir && Number.isFinite(dir.x) ? dir.x : 0;
    const dy = dir && Number.isFinite(dir.y) ? dir.y : 0;
    const dz = dir && Number.isFinite(dir.z) ? dir.z : 0;
    for (let k = 0; k < total; k++) {
      const i = claim();
      const speed = rand(0.5, 1.4);
      fill(
        i,
        position.x + rand(-0.035, 0.035),
        position.y + rand(-0.03, 0.03),
        position.z + rand(-0.035, 0.035),
        dx * speed + rand(-0.35, 0.35),
        dy * speed + rand(0.15, 0.55),
        dz * speed + rand(-0.35, 0.35),
        rand(0.25, 0.45),
        rand(0.032, 0.07),
        -1.1, // negative gravity: smoke drifts up as it fades
        pickSmoke()
      );
    }
  }

  /**
   * Bullet impact on level geometry: 3 bright sparks + 2 dust motes. Sparks
   * spray back along the surface normal; dust stays close and drifts up.
   * Small by design (5 particles per hit) — called once per pellet that meets
   * a solid surface.
   * @param {import("three").Vector3} position - world hit point
   * @param {import("three").Vector3=} normal - surface normal (fallback: up)
   */
  function spawnImpact(position, normal) {
    if (disposed || !position) return;
    let nx = normal && Number.isFinite(normal.x) ? normal.x : 0;
    let ny = normal && Number.isFinite(normal.y) ? normal.y : 1;
    let nz = normal && Number.isFinite(normal.z) ? normal.z : 0;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nl > 1e-6) {
      nx /= nl;
      ny /= nl;
      nz /= nl;
    } else {
      nx = 0;
      ny = 1;
      nz = 0;
    }
    // 3 bright sparks — fast, short-lived, snapped back off the surface.
    for (let k = 0; k < 3; k++) {
      const i = claim();
      const speed = rand(2.2, 5.2);
      fill(
        i,
        position.x + rand(-0.015, 0.015),
        position.y + rand(-0.015, 0.015),
        position.z + rand(-0.015, 0.015),
        nx * speed + rand(-2.1, 2.1),
        ny * speed + rand(-1.4, 2.3),
        nz * speed + rand(-2.1, 2.1),
        rand(0.18, 0.36),
        rand(0.018, 0.034),
        18,
        pickSpark()
      );
    }
    // 2 dust motes — tiny, slow, linger a beat longer than the sparks.
    for (let k = 0; k < 2; k++) {
      const i = claim();
      const push = rand(0.25, 0.8);
      fill(
        i,
        position.x + nx * rand(0.01, 0.05) + rand(-0.02, 0.02),
        position.y + ny * rand(0.01, 0.05) + rand(-0.02, 0.02),
        position.z + nz * rand(0.01, 0.05) + rand(-0.02, 0.02),
        nx * push + rand(-0.45, 0.45),
        ny * push + rand(0.1, 0.55),
        nz * push + rand(-0.45, 0.45),
        rand(0.32, 0.55),
        rand(0.045, 0.085),
        -0.45,
        pickDust()
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

  return { spawnBlood, spawnMuzzle, spawnSpark, spawnSmoke, spawnImpact, update, dispose };
}
