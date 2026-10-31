/**
 * Explosives — grenade projectiles + explosions (EXPANSION feature B5;
 * contract: docs/EXPANSION.md).
 *
 * createExplosives(scene, camera, zombies, particles, audio, bus)
 *   → { fire(origin, dir), update(dt), reset() }
 *
 * Grenade projectile (spec — DO NOT change the numbers):
 * - Launched by fire(origin, dir): a small projectile with LIGHT GRAVITY
 *   flying along dir (origin/dir in world space; origin ≈ camera muzzle).
 * - Detonates on CONTACT with a zombie or the GROUND, or after 1.2 s
 *   (whichever comes first).
 * - Explosion: RADIUS 4 m; damage 90 falling LINEARLY to 0 at the blast edge
 *   (per zombie: dmg = 90 * (1 - dist/4) clamped ≥ 0, applied via
 *   zombie.takeDamage(dmg, false) — explosion damage is not a headshot).
 * - Effects: particle burst (particles.spawnBlood/spawnSpark or a dedicated
 *   burst), a short-lived flash PointLight at the blast center, and a LIGHT
 *   camera shake (pitch/yaw jitter decaying over 0.3 s, applied as a DELTA on
 *   top of the camera rotation like weapons recoil does).
 * - Emits "explosion" {position} on the bus (position = blast center).
 * - reset(): clear every live projectile + pending effects (fresh run).
 *
 * The grenade WEAPON (weapons.js def, feature B4, id "grenade", pump 1.1 s,
 * mag 4, reserve 12) routes its shot to fire(origin, dir) — main.js wiring;
 * the explosive projectile itself must NOT go through combat.shoot hitscan.
 *
 * @param {import("three").Scene} scene
 * @param {import("three").PerspectiveCamera} camera - for the blast shake +
 *   world-direction reference.
 * @param {import("../zombies/zombie.js").Zombie[]} zombies - the SHARED live
 *   array (main.js keeps it in sync) — read fresh each update for contacts
 *   and blast damage; never cache its length.
 * @param {import("./particles.js").Particles} particles
 * @param {import("../core/audio.js").Audio} audio - synthesized explosion
 *   sound (a dedicated synth, not a gunshot).
 * @param {EventTarget} bus
 * @returns {Explosives}
 */

/**
 * @typedef {Object} Explosives
 * @property {(origin: import("three").Vector3, dir: import("three").Vector3) => void} fire
 *   Launch one grenade from origin along dir (world space).
 * @property {(dt: number) => void} update - advance projectiles (light
 *   gravity), detonations, light fade and camera-shake decay; dt in seconds.
 * @property {() => void} reset - remove all live projectiles / pending
 *   effects (fresh run).
 */

export function createExplosives(scene, camera, zombies, particles, audio, bus) {
  void scene;
  void camera;
  void zombies;
  void particles;
  void audio;
  void bus;
  throw new Error("TODO: implement");
}
