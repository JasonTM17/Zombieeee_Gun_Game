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
 * - damage(n): hp = max(0, hp - n); emits "player-hurt" {hp} on the bus;
 *   when hp reaches 0 (exactly once): alive = false and emits "player-died".
 * - reset(): hp = 100, alive = true, position (0, 0, 0), velocity zeroed,
 *   yaw/pitch reset to spawn facing. Called by main.js on fresh runs.
 * - Listens on the bus: "pickup" {kind:"health"} → if alive, hp = min(100, hp + 40).
 *
 * Bus events emitted: "footstep", "player-hurt" {hp}, "player-died".
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
 * @property {number} hp - 0..100, starts at 100.
 * @property {boolean} alive
 * @property {(dt: number) => void} update - advance one frame, dt in seconds.
 * @property {(n: number) => void} damage - apply n damage (clamps at 0 hp).
 * @property {() => void} reset - back to spawn state (full hp, alive).
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
    alive: true,
    update,
    damage,
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
    const speed = WALK_SPEED * (sprinting ? SPRINT_MULT : 1);

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

  function damage(n) {
    const d = Number(n);
    if (!player.alive || !Number.isFinite(d) || d <= 0) return;
    player.hp = Math.max(0, player.hp - d);
    bus.dispatchEvent(new CustomEvent("player-hurt", { detail: { hp: player.hp } }));
    if (player.hp <= 0) {
      player.alive = false; // exactly once — further damage() calls no-op
      bus.dispatchEvent(new CustomEvent("player-died"));
    }
  }

  function reset() {
    player.hp = 100;
    player.alive = true;
    player.position.set(0, 0, 0);
    player.velocity.set(0, 0, 0);
    yaw = 0;
    pitch = 0;
    grounded = true;
    bobPhase = 0;
    bobAmp = 0;
    footDist = 0;
    camera.position.set(0, EYE_HEIGHT, 0);
    camera.rotation.set(0, 0, 0);
  }

  // Health pickup: pickups.js emits "pickup" {kind} — this module has no
  // audio reference, main.js routes the same event to audio.pickup().
  bus.addEventListener("pickup", (e) => {
    const kind = e && e.detail ? e.detail.kind : null;
    if (kind === "health" && player.alive) {
      player.hp = Math.min(100, player.hp + 40);
    }
  });

  return player;
}
