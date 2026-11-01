/**
 * Throwables — the merchant-sold, hand-thrown inventory (frag grenade,
 * molotov cocktail, proximity mine).
 *
 * createThrowables(scene, camera, zombies, particles, bus)
 *   → { update(dt), add(kind, count), cycle(), throwSelected(), state() }
 *
 * Inventory (spec — DO NOT change the numbers):
 * - Starts frag ×2, molotov ×1, mine ×0. `add(kind, count)` adds stock (the
 *   merchant will emit "throwable-add" {kind, count}); unknown kinds are
 *   ignored and every kind is capped at 99. `cycle()` steps frag → molotov →
 *   mine, skipping empty kinds when at least one kind still has stock; with
 *   an entirely empty bag it still advances the selection so the HUD can
 *   show what would be thrown next. `state()` returns a FRESH snapshot:
 *   {selected, counts:{frag, molotov, mine}}.
 * - Every actual count/selection change emits "throwables-state" with a fresh
 *   snapshot on the bus. A throw from an empty selected slot emits
 *   "throwables-empty" {kind} and is otherwise a dry click (no world mesh).
 *
 * Keys (self-listened on window keydown; input.js is not touched):
 * - F = throw / place the selected item, V = cycle selection. Key repeat is
 *   ignored, as are presses while the game is not "playing" (cached from
 *   "state-changed"), while the shop/help/merchant overlay is open
 *   ("shop-open"/"help-open"/"merchant-open" and their close events), or while
 *   a text field has focus. Modifier-key combinations are ignored too.
 *
 * FRAG (spec):
 * - Thrown projectile with light gravity, fuse 1.4 s OR ground contact → blast.
 * - Radius 3.6 m, 90 damage falling LINEARLY to 0 at the edge, zombies only
 *   (the player is never in the damage loop).
 * - FX: particle burst + a short-lived PointLight (camera shake is explicitly
 *   optional and skipped). Emits
 *   "throwable-exploded" {kind:"frag", position, radius, damage}.
 *
 * MOLOTOV (spec):
 * - Thrown; shatters on the ground or a zombie body and creates a fire pool:
 *   radius 2.6 m, 5 s lifetime, 12 damage/second to zombies inside. Each pool
 *   keeps per-zombie tick times so one zombie is hit at most once per second
 *   (no catch-up burst after stepping out and back in).
 * - Visual: orange transparent disc + 3 flickering cones animated in update.
 * - Emits "throwable-exploded" {kind:"molotov", position, radius}.
 *
 * MINE (spec):
 * - Placed at the player's feet, 0.4 m forward (camera XZ is the feet point in
 *   this controller because the camera sits at feet + eye height), arms after
 *   1.0 s, triggers on the first live zombie within 1.8 m, blast radius 4 m,
 *   120 damage with the same linear falloff, one use.
 * - Visual: small dark disc + a red blinking dot, both animated in update.
 * - Emits "throwable-exploded" {kind:"mine", position, radius, damage}.
 *
 * Pooling / lifetime:
 * - Six projectile meshes, six fire-pool groups and six mine groups are
 *   preallocated at factory creation and live for the page lifetime (one
 *   THREE.Group under `scene`, tagged userData.combatFx so combat's bullet
 *   raycast skips the whole subtree). Throwing swaps the preallocated
 *   geometry/material on a projectile mesh — no per-throw geometry creation.
 * - At most 6 active projectiles / fire pools / mines each; a seventh reuses
 *   the oldest slot. FX are hidden again at the end of their lifetime (pool
 *   expiry, detonation, mine use), so the scene child count never grows and
 *   nothing is left visible after the effect ends. Projectiles/pools/mines are
 *   cleared on menu/gameover so a fresh run cannot inherit a live fire pool.
 * - Zombie damage always goes through `zombie.takeDamage(dmg, false)` and only
 *   for `zombie.alive === true`; dead/corpse entries are skipped.
 *
 * HUD / merchant integration:
 * - The companion `src/ui/throwables-hud.js` consumes "throwables-state".
 * - This module listens "throwable-add" {kind, count} → add(kind, count), and
 *   "throwable-add" is the only merchant hook (no merchant file exists yet).
 *
 * @param {import("three").Scene} scene
 * @param {import("three").PerspectiveCamera} camera - throw origin/facing and
 *   the feet point used by the mine placement.
 * @param {import("../zombies/zombie.js").Zombie[]} zombies - the SHARED live
 *   array; read fresh every update (never cache its length).
 * @param {import("./particles.js").Particles} particles
 * @param {EventTarget} bus
 * @returns {Throwables}
 */

/**
 * @typedef {Object} Throwables
 * @property {(dt: number) => void} update - advance projectiles, fire-pool
 *   ticks/flames, mine arming/blinking/triggers and the blast light.
 * @property {(kind: string, count: number) => void} add - add stock; unknown
 *   kind / non-positive / non-finite count is ignored; cap 99 per kind.
 * @property {() => void} cycle - frag → molotov → mine, skipping empty kinds
 *   when possible; always safe with an empty bag.
 * @property {() => boolean} throwSelected - throw/place the selected item.
 *   Returns false for an empty slot, a missing camera, or a dry click.
 * @property {() => {selected: string, counts: {frag: number, molotov: number, mine: number}}} state
 *   A fresh snapshot (mutating it cannot change the inventory).
 */

import * as THREE from "three";

// --- frozen spec numbers ------------------------------------------------------
const KINDS = ["frag", "molotov", "mine"];
const START_COUNTS = { frag: 2, molotov: 1, mine: 0 };
const STOCK_CAP = 99;

const FRAG_FUSE = 1.4;        // s
const FRAG_RADIUS = 3.6;      // m
const FRAG_DAMAGE = 90;       // center damage, linear to 0 at the edge

const MOLOTOV_RADIUS = 2.6;   // m — fire pool radius
const MOLOTOV_LIFE = 5;       // s — pool lifetime
const MOLOTOV_DPS = 12;       // damage per tick (one tick per second per zombie)
const MOLOTOV_TICK = 1;       // s

const MINE_ARM_TIME = 1.0;    // s
const MINE_TRIGGER_RADIUS = 1.8; // m
const MINE_RADIUS = 4;        // m
const MINE_DAMAGE = 120;      // center damage, linear to 0 at the edge
const MINE_FORWARD = 0.4;     // m — placed ahead of the player's feet

// --- module-local tuning ------------------------------------------------------
const THROW_SPEED = 18;      // m/s along the camera forward
const THROW_LIFT = 2.0;      // m/s added upward so the arc reads as a throw
const THROW_OFFSET = 0.45;   // m forward of the camera so the mesh clears the player
const GRAVITY = 10;          // m/s² — same light gravity as the grenade launcher
const GROUND_Y = 0.08;       // m — ground contact threshold
const BODY_HALF_W = 0.55;    // zombie body half-width at scale 1 (molotov contact)
const BODY_TOP = 1.9;        // m — zombie head top at scale 1
const CONTACT_PAD = 0.15;    // m of grace around the body test
const FLASH_TIME = 0.16;     // s — blast light fade
const FLASH_INTENSITY = 22;  // peak intensity of the small blast light
const MAX_PROJECTILES = 6;
const MAX_POOLS = 6;
const MAX_MINES = 6;
const MINE_BLINK_PERIOD = 0.5;    // s — unarmed blink period
const MINE_BLINK_ARMED = 0.28;    // s — faster once armed
const MINE_BLINK_ON = 0.16;       // s — dot on fraction of the period

const UP = new THREE.Vector3(0, 1, 0);

/** @returns {number} random in [lo, hi) */
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

/** True when a DOM text field currently owns keyboard focus (defensive). */
function textInputFocused() {
  if (typeof document === "undefined" || !document.activeElement) return false;
  const el = document.activeElement;
  const tag = el.tagName ? String(el.tagName).toUpperCase() : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable === true) return true;
  return false;
}

export function createThrowables(scene, camera, zombies, particles, bus) {
  // --- inventory -------------------------------------------------------------
  const counts = {
    frag: START_COUNTS.frag,
    molotov: START_COUNTS.molotov,
    mine: START_COUNTS.mine,
  };
  let selected = "frag";

  // --- visual root + preallocated pools --------------------------------------
  const root = new THREE.Group();
  root.name = "throwables";
  // combat.js skips a root flagged userData.combatFx — these meshes are FX and
  // must never be treated as bullet-cover or raycast targets.
  root.userData.combatFx = true;
  if (scene && typeof scene.add === "function") scene.add(root);

  // Shared geometries/materials — created once, page lifetime.
  const fragGeo = new THREE.SphereGeometry(0.1, 10, 8);
  const fragMat = new THREE.MeshStandardMaterial({
    color: 0x37412c,
    roughness: 0.55,
    metalness: 0.25,
    emissive: 0x25360f,
    emissiveIntensity: 0.7,
  });
  const molotovGeo = new THREE.CylinderGeometry(0.05, 0.065, 0.24, 8);
  const molotovMat = new THREE.MeshStandardMaterial({
    color: 0x416e52,
    roughness: 0.28,
    metalness: 0.08,
    emissive: 0xff7a1a,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.94,
  });

  // Six projectile slots (mesh + ballistic record). Geometry/material are
  // swapped on launch — no per-throw allocation.
  /** @type {{mesh: THREE.Mesh, active: boolean, kind: string,
   *   vx: number, vy: number, vz: number, t: number}[]} */
  const projectiles = [];
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    const mesh = new THREE.Mesh(fragGeo, fragMat);
    mesh.name = "throwable-projectile";
    mesh.visible = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    root.add(mesh);
    projectiles.push({
      mesh, active: false, kind: "frag", vx: 0, vy: 0, vz: 0, t: 0,
    });
  }
  let projectileCursor = 0;

  // Six fire-pool groups (disc + 3 flames), created up front and hidden.
  const poolDiscGeo = new THREE.CircleGeometry(1, 28);
  poolDiscGeo.rotateX(-Math.PI / 2); // lie flat in the XZ plane
  const poolDiscMat = new THREE.MeshBasicMaterial({
    color: 0xff5a14,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const flameGeo = new THREE.ConeGeometry(0.16, 0.55, 6);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff9a2a,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  /** @type {{group: THREE.Group, flames: THREE.Mesh[],
   *   active: boolean, age: number, x: number, z: number,
   *   hit: Map<object, number>}[]} */
  const pools = [];
  for (let i = 0; i < MAX_POOLS; i++) {
    const group = new THREE.Group();
    group.name = "throwable-fire-pool";
    group.visible = false;
    const disc = new THREE.Mesh(poolDiscGeo, poolDiscMat);
    disc.scale.set(MOLOTOV_RADIUS, 1, MOLOTOV_RADIUS);
    disc.position.y = 0.02;
    disc.renderOrder = 3;
    group.add(disc);
    const flames = [];
    for (let f = 0; f < 3; f++) {
      const flame = new THREE.Mesh(flameGeo, flameMat);
      const ang = (f / 3) * Math.PI * 2 + 0.4;
      const dist = 0.55 + f * 0.32;
      flame.position.set(Math.cos(ang) * dist, 0.26, Math.sin(ang) * dist);
      flame.renderOrder = 4;
      group.add(flame);
      flames.push(flame);
    }
    root.add(group);
    pools.push({
      group, flames, active: false, age: 0, x: 0, z: 0,
      hit: new Map(),
    });
  }

  // Six mine groups (dark disc + red dot), created up front and hidden.
  const mineDiscGeo = new THREE.CylinderGeometry(0.26, 0.3, 0.05, 12);
  const mineDiscMat = new THREE.MeshStandardMaterial({
    color: 0x1b1f24,
    roughness: 0.7,
    metalness: 0.35,
  });
  const mineDotGeo = new THREE.SphereGeometry(0.045, 8, 6);
  const mineDotMat = new THREE.MeshStandardMaterial({
    color: 0x2a0503,
    roughness: 0.4,
    metalness: 0.1,
    emissive: 0xff2a1a,
    emissiveIntensity: 2.2,
    toneMapped: false,
  });
  /** @type {{group: THREE.Group, dot: THREE.Mesh, active: boolean,
   *   armed: boolean, age: number, x: number, z: number}[]} */
  const mines = [];
  for (let i = 0; i < MAX_MINES; i++) {
    const group = new THREE.Group();
    group.name = "throwable-mine";
    group.visible = false;
    const disc = new THREE.Mesh(mineDiscGeo, mineDiscMat);
    disc.position.y = 0.025;
    group.add(disc);
    const dot = new THREE.Mesh(mineDotGeo, mineDotMat);
    dot.position.y = 0.08;
    group.add(dot);
    root.add(group);
    mines.push({ group, dot, active: false, armed: false, age: 0, x: 0, z: 0 });
  }
  let mineCursor = 0;

  const flashLight = new THREE.PointLight(0xffa252, 0, 14, 2);
  root.add(flashLight);
  let flashT = 0;

  // Scratch vectors — the per-frame path allocates nothing for physics.
  const camWorld = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const blastPos = new THREE.Vector3();

  // --- state helpers ---------------------------------------------------------
  function snapshot() {
    return {
      selected,
      counts: {
        frag: counts.frag,
        molotov: counts.molotov,
        mine: counts.mine,
      },
    };
  }

  function emit(type, detail) {
    if (!bus || typeof bus.dispatchEvent !== "function") return;
    bus.dispatchEvent(new CustomEvent(type, { detail }));
  }

  function emitState() {
    emit("throwables-state", snapshot());
  }

  /**
   * Add stock. Unknown kinds, non-finite counts and non-positive counts are
   * ignored (defensive against a malformed merchant payload). Cap 99.
   * @param {string} kind
   * @param {number} count
   */
  function add(kind, count) {
    if (KINDS.indexOf(kind) === -1) return;
    const n = Math.floor(Number(count));
    if (!Number.isFinite(n) || n <= 0) return;
    const next = Math.min(STOCK_CAP, counts[kind] + n);
    if (next === counts[kind]) return;
    counts[kind] = next;
    emitState();
  }

  /**
   * Step the selection. With stock somewhere, land on the next non-empty kind;
   * with an empty bag, still step through all three so the HUD can show the
   * (empty) selection. Emits only when the selection actually changes.
   */
  function cycle() {
    const start = KINDS.indexOf(selected);
    let next = selected;
    for (let i = 1; i <= KINDS.length; i++) {
      const k = KINDS[(start + i) % KINDS.length];
      if (counts[k] > 0) {
        next = k;
        break;
      }
    }
    if (next === selected && counts[selected] <= 0) {
      // Empty bag: no stocked kind exists — show the next slot regardless.
      next = KINDS[(start + 1) % KINDS.length];
    }
    if (next === selected) return;
    selected = next;
    emitState();
  }

  // --- zombies / FX ----------------------------------------------------------
  /**
   * True when world point p overlaps a LIVE zombie body (molotov impact).
   * Fresh pass every time; corpses are skipped.
   * @param {THREE.Vector3} p
   */
  function hitZombie(p) {
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (!z || z.alive !== true || !z.position) continue;
      const s = z.scale > 0 ? z.scale : 1;
      const dx = p.x - z.position.x;
      const dz = p.z - z.position.z;
      const rr = BODY_HALF_W * s + CONTACT_PAD;
      if (
        dx * dx + dz * dz <= rr * rr &&
        p.y <= BODY_TOP * s + CONTACT_PAD &&
        p.y >= -CONTACT_PAD
      ) {
        return true;
      }
    }
    return false;
  }

  /** Localized particle burst for a blast (particles is optional). */
  function burst(pos, smoke) {
    if (!particles) return;
    if (typeof particles.spawnMuzzle === "function") {
      particles.spawnMuzzle(pos, UP);
    }
    if (typeof particles.spawnSpark === "function") {
      particles.spawnSpark(pos);
      particles.spawnSpark(pos);
    }
    if (smoke && typeof particles.spawnSmoke === "function") {
      particles.spawnSmoke(pos, null, 3);
    }
  }

  /**
   * AoE damage in the XZ plane: maxDamage falling linearly to 0 at radius.
   * Zombies only — no player reference exists in this module by design.
   * @param {number} x @param {number} z
   * @param {number} radius @param {number} maxDamage
   */
  function damageZombies(x, z, radius, maxDamage) {
    const r2 = radius * radius;
    for (let i = 0; i < zombies.length; i++) {
      const zb = zombies[i];
      if (!zb || zb.alive !== true || !zb.position) continue;
      const dx = zb.position.x - x;
      const dz = zb.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r2) continue;
      const d = Math.sqrt(d2);
      const dmg = Math.max(0, maxDamage * (1 - d / radius));
      if (dmg > 0 && typeof zb.takeDamage === "function") {
        zb.takeDamage(dmg, false);
      }
    }
  }

  /** Flash the shared blast light at pos. */
  function flash(pos) {
    flashLight.position.set(pos.x, Math.max(0.5, pos.y), pos.z);
    flashLight.intensity = FLASH_INTENSITY;
    flashT = FLASH_TIME;
  }

  /**
   * Frag blast at (x,y,z): damage, particles, light, bus event.
   * @param {number} x @param {number} y @param {number} z
   */
  function explodeFrag(x, y, z) {
    blastPos.set(x, Math.max(GROUND_Y, y), z);
    damageZombies(x, z, FRAG_RADIUS, FRAG_DAMAGE);
    burst(blastPos, true);
    flash(blastPos);
    emit("throwable-exploded", {
      kind: "frag",
      position: blastPos.clone(),
      radius: FRAG_RADIUS,
      damage: FRAG_DAMAGE,
    });
  }

  /**
   * Create (or recycle) a fire pool at ground position (x,z).
   * @param {number} x @param {number} z
   */
  function createPool(x, z) {
    let pool = null;
    for (let i = 0; i < pools.length; i++) {
      if (!pools[i].active) {
        pool = pools[i];
        break;
      }
    }
    if (!pool) {
      // All six are burning: recycle the oldest (cap is frozen at 6).
      pool = pools[0];
      for (let i = 1; i < pools.length; i++) {
        if (pools[i].age > pool.age) pool = pools[i];
      }
    }
    pool.active = true;
    pool.age = 0;
    pool.x = x;
    pool.z = z;
    pool.hit.clear();
    pool.group.position.set(x, 0, z);
    pool.group.visible = true;
  }

  /** Molotov shatter: pool on the ground + a small spark burst + event. */
  function shatterMolotov(x, z) {
    const pos = new THREE.Vector3(x, 0.05, z);
    createPool(x, z);
    if (particles && typeof particles.spawnSpark === "function") {
      particles.spawnSpark(pos);
    }
    emit("throwable-exploded", {
      kind: "molotov",
      position: pos.clone(),
      radius: MOLOTOV_RADIUS,
    });
  }

  /** Mine blast at (x,z): damage, particles, light, event. */
  function explodeMine(x, z) {
    blastPos.set(x, GROUND_Y, z);
    damageZombies(x, z, MINE_RADIUS, MINE_DAMAGE);
    burst(blastPos, true);
    flash(blastPos);
    emit("throwable-exploded", {
      kind: "mine",
      position: blastPos.clone(),
      radius: MINE_RADIUS,
      damage: MINE_DAMAGE,
    });
  }

  // --- spawning --------------------------------------------------------------
  /** Read the camera world position + forward into the scratch vectors. */
  function readCamera() {
    if (!camera || typeof camera.getWorldPosition !== "function") return false;
    if (typeof camera.updateMatrixWorld === "function") camera.updateMatrixWorld();
    camera.getWorldPosition(camWorld);
    if (typeof camera.getWorldDirection === "function") {
      camera.getWorldDirection(camDir);
    } else {
      camDir.set(0, 0, -1);
    }
    return true;
  }

  /** Claim a projectile slot, recycling the cursor slot if all six are live. */
  function claimProjectile() {
    for (let i = 0; i < projectiles.length; i++) {
      const idx = (projectileCursor + i) % projectiles.length;
      if (!projectiles[idx].active) {
        projectileCursor = (idx + 1) % projectiles.length;
        return projectiles[idx];
      }
    }
    const rec = projectiles[projectileCursor];
    projectileCursor = (projectileCursor + 1) % projectiles.length;
    rec.active = false;
    rec.mesh.visible = false;
    return rec;
  }

  /**
   * Throw a frag/molotov from the camera along its forward. Returns false when
   * the camera is unusable.
   * @param {string} kind
   */
  function throwProjectile(kind) {
    if (!readCamera()) return false;
    const rec = claimProjectile();
    const mesh = rec.mesh;
    mesh.geometry = kind === "frag" ? fragGeo : molotovGeo;
    mesh.material = kind === "frag" ? fragMat : molotovMat;
    mesh.position.copy(camWorld).addScaledVector(camDir, THROW_OFFSET);
    mesh.position.y = Math.max(0.25, mesh.position.y);
    mesh.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
    mesh.visible = true;
    rec.active = true;
    rec.kind = kind;
    rec.t = 0;
    rec.vx = camDir.x * THROW_SPEED;
    rec.vy = camDir.y * THROW_SPEED + THROW_LIFT;
    rec.vz = camDir.z * THROW_SPEED;
    return true;
  }

  /** Place a mine 0.4 m ahead of the camera on the ground plane. */
  function placeMine() {
    if (!readCamera()) return false;
    let fx = camDir.x;
    let fz = camDir.z;
    const len = Math.hypot(fx, fz);
    if (len > 1e-6) {
      fx /= len;
      fz /= len;
    } else {
      fx = 0;
      fz = -1;
    }
    // Six mines max; round-robin reuse (one-use devices).
    let rec = null;
    for (let i = 0; i < mines.length; i++) {
      const idx = (mineCursor + i) % mines.length;
      if (!mines[idx].active) {
        rec = mines[idx];
        mineCursor = (idx + 1) % mines.length;
        break;
      }
    }
    if (!rec) {
      rec = mines[mineCursor];
      mineCursor = (mineCursor + 1) % mines.length;
      rec.active = false;
      rec.group.visible = false;
    }
    rec.active = true;
    rec.armed = false;
    rec.age = 0;
    rec.x = camWorld.x + fx * MINE_FORWARD;
    rec.z = camWorld.z + fz * MINE_FORWARD;
    rec.group.position.set(rec.x, 0.01, rec.z);
    rec.group.visible = true;
    rec.dot.visible = true;
    return true;
  }

  /**
   * Throw/place the selected item. An empty slot is a dry click: no stock
   * change, no world mesh, "throwables-empty" on the bus.
   * @returns {boolean}
   */
  function throwSelected() {
    if (KINDS.indexOf(selected) === -1) selected = "frag";
    if (counts[selected] <= 0) {
      emit("throwables-empty", { kind: selected });
      return false;
    }
    const ok =
      selected === "mine" ? placeMine() : throwProjectile(selected);
    if (!ok) return false;
    counts[selected] -= 1;
    emitState();
    return true;
  }

  // --- per-frame update ------------------------------------------------------
  function updateProjectiles(dt) {
    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      if (!p.active) continue;
      const mesh = p.mesh;
      p.t += dt;
      p.vy -= GRAVITY * dt;
      mesh.position.x += p.vx * dt;
      mesh.position.y += p.vy * dt;
      mesh.position.z += p.vz * dt;
      mesh.rotation.x += dt * 9;
      mesh.rotation.z += dt * 7;

      if (p.kind === "frag") {
        if (p.t >= FRAG_FUSE || mesh.position.y <= GROUND_Y) {
          explodeFrag(mesh.position.x, mesh.position.y, mesh.position.z);
          p.active = false;
          mesh.visible = false;
        }
      } else if (mesh.position.y <= GROUND_Y || hitZombie(mesh.position)) {
        shatterMolotov(mesh.position.x, mesh.position.z);
        p.active = false;
        mesh.visible = false;
      }
    }
  }

  function updateMines(dt) {
    for (let i = 0; i < mines.length; i++) {
      const m = mines[i];
      if (!m.active) continue;
      m.age += dt;
      if (!m.armed && m.age >= MINE_ARM_TIME) m.armed = true;
      // Red dot blink: slower while arming, faster once live.
      const period = m.armed ? MINE_BLINK_ARMED : MINE_BLINK_PERIOD;
      m.dot.visible = (m.age % period) < MINE_BLINK_ON;
      if (!m.armed) continue;
      for (let j = 0; j < zombies.length; j++) {
        const z = zombies[j];
        if (!z || z.alive !== true || !z.position) continue;
        const dx = z.position.x - m.x;
        const dz = z.position.z - m.z;
        if (dx * dx + dz * dz > MINE_TRIGGER_RADIUS * MINE_TRIGGER_RADIUS) {
          continue;
        }
        explodeMine(m.x, m.z);
        m.active = false;
        m.group.visible = false;
        break; // one use
      }
    }
  }

  function updatePools(dt) {
    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i];
      if (!pool.active) continue;
      const prevAge = pool.age;
      pool.age = Math.min(MOLOTOV_LIFE, pool.age + dt);

      for (let j = 0; j < zombies.length; j++) {
        const z = zombies[j];
        if (!z || z.alive !== true || !z.position) continue;
        const dx = z.position.x - pool.x;
        const dz = z.position.z - pool.z;
        if (dx * dx + dz * dz > MOLOTOV_RADIUS * MOLOTOV_RADIUS) continue;
        // Per-zombie tick clock. A zombie that left and came back restarts at
        // the current age (no catch-up burst for the seconds spent outside).
        let next = pool.hit.has(z) ? pool.hit.get(z) + MOLOTOV_TICK : prevAge;
        if (next < prevAge) next = prevAge;
        while (next <= pool.age && next < MOLOTOV_LIFE) {
          if (z.alive !== true) break;
          if (typeof z.takeDamage === "function") z.takeDamage(MOLOTOV_DPS, false);
          pool.hit.set(z, next);
          next += MOLOTOV_TICK;
        }
      }

      // Flame flicker: three independently phased cones.
      for (let f = 0; f < pool.flames.length; f++) {
        const flame = pool.flames[f];
        const t = pool.age * (6 + f * 1.7) + f * 1.9;
        const sy = 0.8 + 0.3 * Math.sin(t);
        flame.scale.set(
          0.82 + 0.2 * Math.sin(t * 0.7),
          sy,
          0.82 + 0.2 * Math.cos(t * 1.1)
        );
        flame.rotation.y += dt * (1.5 + f * 0.4);
      }

      if (pool.age >= MOLOTOV_LIFE) {
        pool.active = false;
        pool.group.visible = false;
        pool.hit.clear();
      }
    }
  }

  function update(dt) {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (step <= 0) return;
    updateProjectiles(step);
    updateMines(step);
    updatePools(step);
    if (flashT > 0) {
      flashT -= step;
      if (flashT <= 0) {
        flashT = 0;
        flashLight.intensity = 0;
      } else {
        flashLight.intensity = (flashT / FLASH_TIME) * FLASH_INTENSITY;
      }
    }
  }

  // --- run-end cleanup -------------------------------------------------------
  /** Hide every live projectile/pool/mine (menu/gameover, fresh-run safety). */
  function clearAll() {
    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      p.active = false;
      p.mesh.visible = false;
    }
    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i];
      pool.active = false;
      pool.age = 0;
      pool.group.visible = false;
      pool.hit.clear();
    }
    for (let i = 0; i < mines.length; i++) {
      const m = mines[i];
      m.active = false;
      m.group.visible = false;
      m.dot.visible = false;
    }
    flashT = 0;
    flashLight.intensity = 0;
  }

  /** Fresh-run reset: clear live FX and restore the starting kit (2 frag / 1 molotov / 0 mine). */
  function reset() {
    clearAll();
    counts.frag = START_COUNTS.frag;
    counts.molotov = START_COUNTS.molotov;
    counts.mine = START_COUNTS.mine;
    selected = "frag";
    emitState();
  }

  // --- input -----------------------------------------------------------------
  let gameState = "menu";
  /** @type {Set<string>} open overlays that own the keyboard */
  const overlays = new Set();

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("keydown", (e) => {
      if (!e || e.repeat === true) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (gameState !== "playing") return;
      if (overlays.size > 0) return;
      if (textInputFocused()) return;
      const code = String(e.code || "");
      const key = String(e.key || "").toLowerCase();
      const isThrow = code === "KeyF" || key === "f";
      const isCycle = code === "KeyV" || key === "v";
      if (!isThrow && !isCycle) return;
      if (isThrow) throwSelected();
      else cycle();
    });
  }

  if (bus && typeof bus.addEventListener === "function") {
    bus.addEventListener("state-changed", (e) => {
      const st = e && e.detail ? e.detail.state : null;
      gameState = typeof st === "string" ? st : "menu";
      if (st === "menu" || st === "gameover") {
        clearAll();
        overlays.clear();
      }
    });

    // Overlay ownership: any open overlay blocks F/V. Close events are
    // idempotent; merchant aliases are accepted defensively.
    bus.addEventListener("shop-open", () => overlays.add("shop"));
    bus.addEventListener("shop-closed", () => overlays.delete("shop"));
    bus.addEventListener("help-open", () => overlays.add("help"));
    bus.addEventListener("help-closed", () => overlays.delete("help"));
    bus.addEventListener("merchant-open", () => overlays.add("merchant"));
    bus.addEventListener("merchant-closed", () => overlays.delete("merchant"));
    bus.addEventListener("merchant-close", () => overlays.delete("merchant"));

    // Merchant integration (the UI will emit this when it exists).
    bus.addEventListener("throwable-add", (e) => {
      const d = e && e.detail ? e.detail : {};
      add(d.kind, d.count);
    });
  }

  return { update, add, cycle, throwSelected, state: snapshot, reset };
}
