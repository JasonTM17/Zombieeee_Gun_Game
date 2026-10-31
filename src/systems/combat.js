/**
 * Hitscan combat. shoot(weapon) fires from the camera center along the camera
 * direction (Raycaster.setFromCamera({x:0, y:0}, camera) basis):
 *
 * - 1 ray normally; for the shotgun cast 8 rays jittered inside a cone of
 *   half-angle weapon.spread radians (weapon.pellets === 8).
 * - Ray targets: every live zombie in `zombies` (the shared array main.js
 *   keeps in sync — each Zombie exposes `.group`, a THREE.Group whose meshes
 *   carry userData.part === "head" | "body"). Cap ray distance (~100 m).
 * - Damage: weapon.damage per pellet; a hit on userData.part === "head"
 *   doubles it (x2).
 * - For each landed pellet: zombie.takeDamage(dmg, headshot) (returns true if
 *   this killed it) and particles.spawnBlood(hitPoint, 8..14).
 * - Per shoot() call that landed at least one pellet (NOT per pellet):
 *   audio.zombieHit() once, audio.hitmarker(headshot) once (headshot = any
 *   headshot pellet landed), and emit "hit" {headshot, killed} on the bus
 *   (killed = any pellet killed its target). HUD shows the hitmarker.
 * - Also per shoot() call: particles.spawnMuzzle(muzzlePos, camDir) — muzzle
 *   world position ≈ camera position + forward * 0.5 (slight right/down
 *   offset acceptable); the light flash itself lives in weapons.js.
 *
 * Dead zombies (zombie.alive === false) must be skipped — their corpses are
 * still in the array until the 1.5 s death animation finishes.
 *
 * @param {import("three").PerspectiveCamera} camera
 * @param {import("three").Scene} scene
 * @param {import("../zombies/zombie.js").Zombie[]} zombies
 *   Shared, live array; main.js maintains it from "zombie-spawned" /
 *   "zombie-despawned" bus events. Read fresh each shot — never cache length.
 * @param {import("./particles.js").Particles} particles
 * @param {import("../core/audio.js").Audio} audio
 * @param {EventTarget} bus
 * @returns {Combat}
 */

/**
 * @typedef {Object} Combat
 * @property {(weapon: import("../player/weapons.js").WeaponState) => void} shoot
 *   Perform one shot with the given active weapon descriptor.
 */

export function createCombat(camera, scene, zombies, particles, audio, bus) {
  throw new Error("TODO: implement");
}
