/**
 * Zombie actor — a low-poly humanoid built from BoxGeometry/CapsuleGeometry
 * primitives inside a THREE.Group that the constructor adds to `scene`.
 *
 * Types (spec numbers — DO NOT change):
 *   type   | hp  | speed (m/s) | dmg | score | scale
 *   walker | 100 | 2.2         | 15  | 100   | 1.0
 *   runner | 60  | 5.0         | 10  | 150   | 0.9
 *   brute  | 400 | 1.4         | 35  | 400   | 1.6
 * Skin color differs per type. Scale affects the model only — speeds are
 * absolute. The head mesh has userData.part = "head"; torso/arms/legs have
 * userData.part = "body" (combat headshot detection depends on this).
 *
 * Walk animation: arms/legs swing with sin() driven by travel phase; slight
 * body lean. Attack: arm swing animation. Damage flash: material color
 * flashes red for 100 ms — clone materials per instance so only this zombie
 * flashes, and dispose geometries/materials on removal (no shared-material
 * leaks; sharing geometries is fine).
 *
 * update(dt, player, level, others):
 * - steering: move toward the player on XZ at type speed + SEPARATION from
 *   `others` (push apart when closer than 1.2 m) + avoid level colliders
 *   (slide along AABBs; test X/Z steps separately against
 *   level.isBlocked(x, z, r) like the player does, r ≈ 0.4 * scale).
 * - attack: within 1.6 m of the player → arm-swing animation and
 *   player.damage(dmg) once every 1 s (per-zombie attack timer).
 * - a dead zombie only runs its death animation and ignores everything else.
 *
 * takeDamage(d, headshot):
 * - hp -= d; flash red 100 ms.
 * - The HIT SOUND is played by combat.js (audio.zombieHit) — this method must
 *   NOT play or emit a sound event (one shotgun blast = 8 takeDamage calls).
 * - @returns {boolean} true if this damage brought hp to <= 0 (killed it).
 *
 * Death (exactly once, at the takeDamage that returns true):
 * - emits "zombie-killed" {type, score, headshot, position} on the bus —
 *   score is the BASE score for the type (walker 100 / runner 150 / brute 400);
 *   gamestate applies the x1.5 headshot multiplier, so DO NOT pre-multiply.
 *   position is a Vector3 clone of the death spot.
 * - falls over (~90° rotation around local X), sinks and fades over 1.5 s,
 *   then removes itself from the scene, disposes its geometries/materials and
 *   emits "zombie-despawned" {zombie} on the bus (main.js drops it from the
 *   shared array; waves drops it from its internal list).
 *
 * Instance surface consumed by other modules (waves/combat/main):
 *   type, hp, alive, group (THREE.Group), position (Vector3, mirrors group),
 *   update(dt, player, level, others), takeDamage(d, headshot), dispose().
 *
 * @param {import("three").Scene} scene - the zombie adds itself to it.
 * @param {"walker"|"runner"|"brute"} type
 * @param {import("three").Vector3} position - spawn position (feet), XZ used.
 * @param {EventTarget} bus
 */

export class Zombie {
  /**
   * @param {import("three").Scene} scene
   * @param {"walker"|"runner"|"brute"} type
   * @param {import("three").Vector3} position
   * @param {EventTarget} bus
   */
  constructor(scene, type, position, bus) {
    throw new Error("TODO: implement");
  }

  /**
   * @param {number} dt - seconds
   * @param {import("../player/controller.js").Player} player
   * @param {import("../world/level.js").Level} level
   * @param {Zombie[]} others - other zombies for separation
   * @returns {void}
   */
  update(dt, player, level, others) {
    throw new Error("TODO: implement");
  }

  /**
   * @param {number} d - damage amount
   * @param {boolean} headshot - true when the hit landed on the head (x2 already applied by combat)
   * @returns {boolean} true if this damage killed the zombie
   */
  takeDamage(d, headshot) {
    throw new Error("TODO: implement");
  }

  /**
   * Immediate removal: remove from scene + dispose geometries/materials.
   * Also used by waves.reset(). Does not re-emit "zombie-despawned" if the
   * caller (waves.reset) already announced it — document-safe either way:
   * main.js must tolerate duplicate "zombie-despawned" for the same zombie.
   * @returns {void}
   */
  dispose() {
    throw new Error("TODO: implement");
  }
}
