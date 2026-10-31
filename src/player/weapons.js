/**
 * Weapon system: three hitscan weapons, switching, reloading, recoil, muzzle
 * flash and a low-poly viewmodel parented to the camera.
 *
 * Weapon table (spec numbers — DO NOT change):
 *   name    | mode      | interval            | mag | damage          | spread (rad) | reserve  | reload
 *   pistol  | semi-auto | per click           | 12  | 25              | 0.01         | Infinity | 1.2 s
 *   shotgun | pump      | 0.9 s between shots | 6   | 12 x 8 pellets  | 0.06         | 24       | 2.0 s
 *   rifle   | full-auto | 600 rpm (0.1 s)     | 30  | 18              | 0.02         | 90       | 1.8 s
 *
 * Firing flow — fire-rate + ammo + reload gating happen HERE. When a round
 * actually leaves the barrel this module:
 *   1. decrements mag (shotgun: by 1 shell, not per pellet),
 *   2. emits "fire" {weapon: WeaponState} on the bus — main.js routes it to
 *      combat.shoot(weapon), which does the actual hitscan (this module has no
 *      scene/particles access),
 *   3. emits "spread" {value: weapon.spread} (radians) for the crosshair,
 *   4. kicks recoil — camera pitch UP then recovered back to the pre-shot aim
 *      over ~0.2 s (magnitudes per weapon, tuned subtle),
 *   5. flashes a warm PointLight parented to the camera (viewmodel muzzle) for
 *      ~40 ms,
 *   6. plays audio.gunshot(name) directly (this module owns audio).
 *
 * Trigger inputs (read in update()):
 *   pistol  → input.consumeClick()
 *   shotgun → input.consumeClick() gated by the 0.9 s pump interval
 *   rifle   → input.isDown("Mouse0") gated by the 0.1 s auto interval
 *
 * Switching: "Digit1"/"Digit2"/"Digit3" or input.wheelDir() (cycles). Reload:
 * "KeyR" — allowed only if not already reloading, mag < magSize and reserve > 0
 * (pistol reserve is Infinity → never empty). audio.reloadStart() at the start
 * and audio.reloadEnd() at the end of the reload timer.
 *
 * Recoil composition note: the player controller rewrites camera.rotation each
 * frame from its own yaw/pitch. Because main.js calls player.update() BEFORE
 * weapons.update(), this module applies the DELTA between its current recoil
 * offset and the one it applied last frame on top of camera.rotation — that
 * stays correct regardless of the controller's absolute writes.
 *
 * Viewmodel: simple low-poly boxes parented to the camera (lower-right), with
 * a small draw animation on switch and a dip/rotate animation while reloading.
 *
 * Bus events emitted: "fire" {weapon}, "spread" {value}.
 * Bus events consumed: "pickup" {kind:"ammo"} → active weapon
 *   reserve += magSize; the other two += Math.round(0.5 * magSize)
 *   (adding to the pistol's Infinity keeps Infinity).
 *
 * @param {import("three").PerspectiveCamera} camera
 * @param {import("../core/input.js").Input} input
 * @param {import("../core/audio.js").Audio} audio
 * @param {EventTarget} bus
 * @returns {Weapons}
 */

/**
 * Full runtime descriptor of ONE weapon. combat.shoot() consumes
 * damage/pellets/spread from this; HUD/debug consume the getState() subset.
 *
 * @typedef {Object} WeaponState
 * @property {"pistol"|"shotgun"|"rifle"} name
 * @property {number} damage - per bullet (or per pellet): 25 | 12 | 18.
 * @property {number} pellets - rays per shot: 1 | 8 | 1.
 * @property {number} spread - cone half-angle in radians: 0.01 | 0.06 | 0.02.
 * @property {number} mag - rounds in the magazine right now.
 * @property {number} magSize - magazine capacity: 12 | 6 | 30.
 * @property {number} reserve - spare rounds; pistol is Infinity (unlimited).
 * @property {boolean} reloading
 */

/**
 * @typedef {Object} Weapons
 * @property {WeaponState[]} list - the three weapons: index 0 pistol, 1 shotgun, 2 rifle.
 * @property {number} current - index of the active weapon in list.
 * @property {(dt: number) => void} update
 *   Advance one frame (dt seconds): read trigger/switch/reload inputs, run
 *   timers, animate viewmodel + recoil + muzzle light.
 * @property {(i: number) => void} switchTo - switch to list index i (0..2).
 * @property {() => void} reload - start reloading the active weapon if allowed.
 * @property {() => WeaponState} getState
 *   The ACTIVE weapon's state; HUD/debug use at least
 *   {name, mag, magSize, reserve, reloading, spread}.
 */

export function createWeapons(camera, input, audio, bus) {
  throw new Error("TODO: implement");
}
