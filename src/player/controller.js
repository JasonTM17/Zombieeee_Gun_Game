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

export function createPlayer(scene, camera, input, level, bus) {
  throw new Error("TODO: implement");
}
