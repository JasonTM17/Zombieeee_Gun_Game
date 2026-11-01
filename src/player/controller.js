/**
 * First-person player controller: movement, gravity, jump, collision, head
 * bob, camera orientation, footsteps, damage and death.
 *
 * Movement model (all units meters / seconds):
 * - WASD relative to the camera facing, XZ plane ONLY (KeyboardEvent.code keys
 *   "KeyW"/"KeyA"/"KeyS"/"KeyD"). Vertical movement comes only from jumping.
 * - Sprint: hold ShiftLeft/ShiftRight → speed x1.6. Base walk speed is
 *   4.5 m/s (architect default — the spec fixes only the x1.6 sprint factor).
 * - Jump: "Space", only when vertical velocity <= 0 (grounded) → vy = +7 m/s.
 * - Gravity: -20 m/s^2. The floor is y = 0. Obstacles block XZ movement only
 *   (no climbing): test the intended X and Z steps SEPARATELY against
 *   level.isBlocked(x, z, r) with r = 0.4 so the player slides along walls.
 * - position is the FEET position. camera.position = position + (0, 1.7 + bob, 0)
 *   (eyeHeight 1.7 + subtle sin head bob while moving on the ground).
 * - Camera ORIENTATION: this controller reads input.consumeMouseDelta() each
 *   frame and writes camera yaw/pitch (rotation order "YXZ"). Weapon recoil is
 *   applied afterwards by weapons.js — main.js calls player.update() BEFORE
 *   weapons.update(), so the controller must write its own yaw/pitch
 *   unconditionally each frame and let weapons layer the recoil offset on top.
 * - Footsteps: emit "footstep" {} on the bus once per stride (~2.0 m of ground
 *   travel; sprinting passes the rule faster → naturally quicker cadence).
 *   The controller has NO audio reference (signature frozen) — main.js routes
 *   "footstep" → audio.footstep().
 * - ARMOR (survival stat): player.armor 0..maxArmor (starts 0, max 100) and
 *   player.addArmor(n) clamp + emit "armor-changed" {armor, max}. damage(n)
 *   while armor > 0 absorbs min(armor, n × 0.5) — the other half hits HP;
 *   armor updates emit "armor-changed". "player-hurt" keeps its legacy {hp}
 *   payload; exactly-once death semantics are unchanged.
 * - STIM (merchant buff): player.speedBoost = {mul, time} — update() scales
 *   the walk/sprint speed by mul while time > 0 and decrements time by the
 *   simulation dt (a paused run freezes the buff). The Trader writes this
 *   field; reset() restores {mul: 1, time: 0}.
 * - PERKS (per-run level-up system, src/systems/perks.js): player.maxHp is the
 *   HP ceiling (100 base) and player.speedMul a movement multiplier (1 base)
 *   applied on top of walk/sprint/stim. heal(n) restores HP up to maxHp.
 *   At the defaults (maxHp 100, speedMul 1) every existing behavior is
 *   identical — damage/pickup/reset still resolve to the legacy numbers.
 * - damage(n): hp = max(0, hp - n) clamped to maxHp; emits "player-hurt" {hp}
 *   on the bus; when hp reaches 0 (exactly once): alive = false and emits
 *   "player-died".
 * - reset(): hp = maxHp (100 at default), armor = 0 (+ "armor-changed"),
 *   maxArmor = 100, speedMul = 1, alive = true, position
 *   (0, 0, 0), velocity zeroed, yaw/pitch reset to spawn facing. Called by
 *   main.js on fresh runs.
 *   NIGHT 30 P1 (docs/EXPANSION-P1.md §5.6.2.2 — ADDITIVE, optional args; the
 *   legacy zero-argument call behaves exactly as before): reset(spawnYaw,
 *   spawnX, spawnZ) also plants the run spawn — main.js spawns the story at
 *   the safehouse yard (−75, 8) facing the compound gate (east). The yaw is a
 *   private module local, so the spawn facing CANNOT be applied from the
 *   caller side without this hook; camera position/rotation are written here
 *   too so the very first rendered frame (the intro slides behind-state) is
 *   already at the story spawn.
 * - Listens on the bus: "pickup" {kind:"health"} → if alive, hp = min(maxHp, hp + 40).
 *
 * Bus events emitted: "footstep", "player-hurt" {hp}, "armor-changed"
 * {armor, max}, "player-died".
 *
 * @param {import("three").Scene} scene - reserved for future use (viewmodel/
 *   body attachments); the player itself is camera-driven.
 * @param {import("three").PerspectiveCamera} camera - the engine camera (fov 75).
 * @param {import("../core/input.js").Input} input
 * @param {import("../world/level.js").Level} level
 * @param {EventTarget} bus
 * @returns {Player}
 */

/**
 * @typedef {Object} Player
 * @property {import("three").Vector3} position - feet position (meters).
 * @property {import("three").Vector3} velocity - velocity in m/s (y carries gravity).
 * @property {number} hp - 0..maxHp, starts at 100.
 * @property {number} maxHp - HP ceiling (100 base; perks raise it).
 * @property {number} speedMul - additive movement multiplier (1 base; perks
 *   raise it). Applied in update() on top of walk/sprint/stim.
 * @property {number} armor - 0..maxArmor, starts at 0 (additive survival stat).
 * @property {number} maxArmor - armor cap (100).
 * @property {{mul: number, time: number}} speedBoost - additive stim buff:
 *   walk/sprint speed × mul while time > 0; update() decrements time.
 * @property {boolean} alive
 * @property {(dt: number) => void} update - advance one frame, dt in seconds.
 * @property {(n: number) => void} damage - apply n damage (clamps at 0 hp);
 *   50 % of it is absorbed by armor while armor remains.
 * @property {(n: number) => number} heal - restore n HP (clamped to maxHp);
 *   returns the amount actually healed. Dead players cannot be healed.
 * @property {(n: number) => void} addArmor - add n armor (clamped, emits
 *   "armor-changed" {armor, max} when the value changes).
 * @property {(spawnYaw?: number, spawnX?: number, spawnZ?: number) => void} reset
 *   back to spawn state (full hp, alive). The optional args (NIGHT 30 P1) also
 *   set the spawn position + facing; omitted → the legacy (0, 0, 0), −Z facing.
 */

import * as THREE from "three";

// --- tuning -----------------------------------------------------------------
const WALK_SPEED = 4.5;       // m/s (architect default, see header)
const SPRINT_MULT = 1.6;      // spec
const JUMP_SPEED = 7;         // m/s (spec)
const GRAVITY = 20;           // m/s^2 (spec)
const EYE_HEIGHT = 1.7;       // m (spec)
const PLAYER_RADIUS = 0.4;    // m collision circle (spec)
const STEP_DISTANCE = 2.0;    // m of ground travel per footstep event
const MOUSE_SCALE = 0.0022;   // rad per (sensitivity-scaled) mouse pixel
const PITCH_LIMIT = Math.PI / 2 - 0.05;
const GROUND_ACCEL = 18;      // 1/s — exponential approach to target velocity
const BOB_AMPLITUDE = 0.03;   // m at full walk speed
const BOB_ROLL = 0.35;        // lateral sway = fraction of bob amplitude (rad)
const BOB_RAMP = 10;          // 1/s — bob amplitude ease-in/out

export function createPlayer(scene, camera, input, level, bus) {
  // `scene` is reserved by the frozen contract — the player is camera-driven.
  void scene;

  camera.rotation.order = "YXZ"; // yaw → pitch → roll, FPS standard

  const player = {
    position: new THREE.Vector3(0, 0, 0), // FEET position
    velocity: new THREE.Vector3(),
    hp: 100,
    maxHp: 100, // PERKS: HP ceiling (base 100)
    speedMul: 1, // PERKS: movement multiplier on top of walk/sprint/stim
    armor: 0, // additive survival stat (0..maxArmor)
    maxArmor: 100,
    speedBoost: { mul: 1, time: 0 }, // additive stim buff (controller-owned)
    alive: true,
    update,
    damage,
    heal,
    addArmor,
    reset,
  };

  let yaw = 0;          // spawn facing: -Z (three.js camera default)
  let pitch = 0;
  let grounded = true;
  let bobPhase = 0;
  let bobAmp = 0;
  let footDist = 0;

  // Reused event object — "footstep" fires up to a few times per second.
  const footstepEvent = new CustomEvent("footstep");

  const hasCollision =
    level && typeof level.isBlocked === "function"
      ? (x, z) => level.isBlocked(x, z, PLAYER_RADIUS)
      : () => false;

  /** HP ceiling, defensively read (perks may write maxHp). */
  function hpCap() {
    const m = Number(player.maxHp);
    return Number.isFinite(m) && m > 0 ? m : 100;
  }

  function update(dt) {
    if (!Number.isFinite(dt) || dt < 0) dt = 0;

    // --- look: deltas are ALREADY sensitivity-scaled by input.js -----------
    const md = input.consumeMouseDelta();
    yaw -= md.dx * MOUSE_SCALE;
    pitch -= md.dy * MOUSE_SCALE;
    if (pitch > PITCH_LIMIT) pitch = PITCH_LIMIT;
    else if (pitch < -PITCH_LIMIT) pitch = -PITCH_LIMIT;

    // --- horizontal intent, camera-relative, XZ only ------------------------
    const strafe = (input.isDown("KeyD") ? 1 : 0) - (input.isDown("KeyA") ? 1 : 0);
    const ahead = (input.isDown("KeyW") ? 1 : 0) - (input.isDown("KeyS") ? 1 : 0);
    const sprinting = input.isDown("ShiftLeft") || input.isDown("ShiftRight");
    // STIM (additive): the Trader writes {mul, time}; expiry is simulation
    // time so a paused run freezes the buff exactly like the world does.
    let boostMul = 1;
    const boost = player.speedBoost;
    if (boost && boost.time > 0) {
      boost.time -= dt;
      if (boost.time <= 0) {
        boost.time = 0;
        boost.mul = 1;
      } else if (Number.isFinite(boost.mul) && boost.mul > 0) {
        boostMul = boost.mul;
      }
    }
    const speed = WALK_SPEED * (sprinting ? SPRINT_MULT : 1) * boostMul *
      (Number.isFinite(player.speedMul) && player.speedMul > 0 ? player.speedMul : 1);

    // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    let wishX = -sinY * ahead + cosY * strafe;
    let wishZ = -cosY * ahead - sinY * strafe;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 1e-6) {
      wishX = (wishX / wishLen) * speed;
      wishZ = (wishZ / wishLen) * speed;
    } else {
      wishX = 0;
      wishZ = 0;
    }
    const blend = 1 - Math.exp(-dt * GROUND_ACCEL);
    player.velocity.x += (wishX - player.velocity.x) * blend;
    player.velocity.z += (wishZ - player.velocity.z) * blend;

    const prevX = player.position.x;
    const prevZ = player.position.z;

    // --- axis-separated AABB sliding: test X and Z steps independently ------
    const stepX = player.position.x + player.velocity.x * dt;
    if (hasCollision(stepX, player.position.z)) player.velocity.x = 0;
    else player.position.x = stepX;

    const stepZ = player.position.z + player.velocity.z * dt;
    if (hasCollision(player.position.x, stepZ)) player.velocity.z = 0;
    else player.position.z = stepZ;

    // --- jump (grounded, v <= 0) + gravity ----------------------------------
    if (grounded && player.velocity.y <= 0 && input.isDown("Space")) {
      player.velocity.y = JUMP_SPEED;
    }
    player.velocity.y -= GRAVITY * dt;
    player.position.y += player.velocity.y * dt;
    if (player.position.y <= 0) {
      player.position.y = 0;
      player.velocity.y = 0;
      grounded = true;
    } else {
      grounded = false;
    }

    // --- footsteps + head bob from ACTUAL ground travel (post-collision) ----
    const dx = player.position.x - prevX;
    const dz = player.position.z - prevZ;
    const travel = Math.sqrt(dx * dx + dz * dz);
    if (grounded && travel > 1e-4) {
      footDist += travel;
      bobPhase += travel * (Math.PI / STEP_DISTANCE); // one bob cycle per step
      if (footDist >= STEP_DISTANCE) {
        footDist -= STEP_DISTANCE;
        bus.dispatchEvent(footstepEvent);
      }
    }
    const hSpeed = dt > 0 ? travel / dt : 0;
    const targetAmp = grounded
      ? Math.min(1.25, hSpeed / WALK_SPEED) * BOB_AMPLITUDE
      : 0;
    bobAmp += (targetAmp - bobAmp) * Math.min(1, dt * BOB_RAMP);

    // --- write the camera ABSOLUTELY; weapons.js layers recoil on top -------
    camera.position.set(
      player.position.x,
      player.position.y + EYE_HEIGHT + Math.sin(bobPhase) * bobAmp,
      player.position.z
    );
    camera.rotation.set(pitch, yaw, Math.sin(bobPhase * 0.5) * bobAmp * BOB_ROLL);
  }

  /**
   * Add armor (clamped to 0..maxArmor). Emits "armor-changed" only when the
   * value actually changes; non-finite / zero n is ignored.
   * @param {number} n
   */
  function addArmor(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v === 0) return;
    const prev = player.armor;
    player.armor = Math.max(0, Math.min(player.maxArmor, player.armor + v));
    if (player.armor === prev) return;
    bus.dispatchEvent(
      new CustomEvent("armor-changed", {
        detail: { armor: player.armor, max: player.maxArmor },
      })
    );
  }

  function damage(n) {
    const d = Number(n);
    if (!player.alive || !Number.isFinite(d) || d <= 0) return;
    // ARMOR: absorb exactly half of the incoming damage while armor remains
    // (capped by the armor left). The rest hits HP; death semantics below are
    // untouched (hp <= 0 flips alive once, further calls no-op).
    let toHp = d;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, d * 0.5);
      player.armor = Math.max(0, player.armor - absorbed);
      toHp = d - absorbed;
      bus.dispatchEvent(
        new CustomEvent("armor-changed", {
          detail: { armor: player.armor, max: player.maxArmor },
        })
      );
    }
    player.hp = Math.max(0, Math.min(hpCap(), player.hp - toHp));
    bus.dispatchEvent(new CustomEvent("player-hurt", { detail: { hp: player.hp } }));
    if (player.hp <= 0) {
      player.alive = false; // exactly once — further damage() calls no-op
      bus.dispatchEvent(new CustomEvent("player-died"));
    }
  }

  /**
   * PERKS: restore n HP without exceeding maxHp. Returns the amount healed
   * (0 for a dead player / a non-positive or non-finite n). No bus event —
   * the HUD reads hp every frame.
   * @param {number} n
   * @returns {number}
   */
  function heal(n) {
    const v = Number(n);
    if (!player.alive || !Number.isFinite(v) || v <= 0) return 0;
    const cap = hpCap();
    const before = player.hp;
    player.hp = Math.min(cap, player.hp + v);
    return player.hp - before;
  }

  function reset(spawnYaw, spawnX, spawnZ) {
    // NIGHT 30 P1 additive spawn hook — every argument is optional and
    // validated; a legacy reset() call is byte-identical to before.
    const sy = Number.isFinite(Number(spawnYaw)) ? Number(spawnYaw) : 0;
    const sx = Number.isFinite(Number(spawnX)) ? Number(spawnX) : 0;
    const sz = Number.isFinite(Number(spawnZ)) ? Number(spawnZ) : 0;
    player.hp = player.maxHp;
    player.armor = 0;
    player.maxArmor = 100;
    player.speedMul = 1;
    player.speedBoost.mul = 1;
    player.speedBoost.time = 0;
    player.alive = true;
    player.position.set(sx, 0, sz);
    player.velocity.set(0, 0, 0);
    yaw = sy;
    pitch = 0;
    grounded = true;
    bobPhase = 0;
    bobAmp = 0;
    footDist = 0;
    camera.position.set(sx, EYE_HEIGHT, sz);
    camera.rotation.set(0, sy, 0);
    bus.dispatchEvent(
      new CustomEvent("armor-changed", {
        detail: { armor: player.armor, max: player.maxArmor },
      })
    );
  }

  // Health pickup: pickups.js emits "pickup" {kind} — this module has no
  // audio reference, main.js routes the same event to audio.pickup().
  bus.addEventListener("pickup", (e) => {
    const kind = e && e.detail ? e.detail.kind : null;
    if (kind === "health" && player.alive) {
      heal(40);
    }
  });

  return player;
}
