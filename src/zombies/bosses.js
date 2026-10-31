/**
 * Boss zombies — 4 boss classes (EXPANSION feature C4; contract:
 * docs/EXPANSION.md).
 *
 * Every boss keeps the SAME EXTERNAL SURFACE as a regular zombie
 * (src/zombies/zombie.js):
 *
 *   alive, hp, group (THREE.Group), position (Vector3, mirrors group),
 *   update(dt, player, level, others),
 *   takeDamage(d, headshot) → boolean   (true when the hit killed it)
 *   dispose()
 *
 * - Meshes carry userData.part === "head" | "body" (combat headshot detection)
 *   and the root meshes carry userData.zombie so combat raycasts hit them.
 * - Death (exactly once, from the killing takeDamage) emits "zombie-killed"
 *   {type, score, headshot, position} on the bus — score is the MONEY/REWARD
 *   base for the type (butcher 1000 / spitter 800 / screamer 700 / golem
 *   1500); gamestate applies the ×1.5 headshot score multiplier and economy
 *   pays money per the same table. position is a Vector3 clone of the death
 *   spot.
 * - Boss death ALSO drops GUARANTEED 1 medkit + 1 ammo (emit events or call
 *   pickups.spawn if accessible — pickups.spawn(position, kind) exists).
 * - Extends from / composes the Zombie base class if convenient.
 * - Death animation + corpse cleanup mirror the regular zombie (fall, sink,
 *   fade, then "zombie-despawned" {zombie}).
 *
 * THE 4 BOSSES (spec — DO NOT change the numbers):
 *
 *   butcher  — hp 1200×(1+wave/20), speed 2.0, dark-red skin + large cleaver:
 *       every 6 s it WINDS UP for 0.8 s (glows red, roar sound) then CHARGES
 *       STRAIGHT 14 m; touching the player deals 40 dmg + knockback; regular
 *       melee 35 dmg.
 *
 *   spitter  — hp 800×(1+wave/20), speed 2.6: KEEPS DISTANCE 10–16 m (walks
 *       BACKWARD when the player closes in); every 2.5 s spits an ACID ARC
 *       (parabolic projectile — reuse explosives.js if it fits, otherwise
 *       manage its own projectile); a hit deals 18 dmg and leaves a 2 m ACID
 *       POOL that lasts 4 s dealing 6 dmg/s.
 *
 *   screamer — hp 600×(1+wave/20), speed 3.2: every 8 s it SHRIEKS — a white
 *       shock-wave ring expands from the boss; a player within 8 m is pushed
 *       BACK 4 m and takes 10 dmg; each shriek SUMMONS 3 zombies (walkers, or
 *       runners when wave ≥ 6) around the boss's own position (through the
 *       waves spawn mechanism if accessible, otherwise new Zombie + emit
 *       "zombie-spawned" {zombie}).
 *
 *   golem    — hp 2000×(1+wave/20), speed 1.2, takes 25% LESS damage (the
 *       reduction is applied INSIDE takeDamage): every 6 s, if the player is
 *       within 6 m, it SLAMS the ground — a wave ring expands to 8 m radius
 *       over 0.6 s; a swept player takes 30 dmg + gets knocked UP; gray stone
 *       body, LARGEST scale of all zombies.
 *
 * hp scale note: hp = base × (1 + wave/20) — wave is the boss wave number
 * passed to the constructor (rounded per builder discretion, integer hp).
 *
 * @param {import("three").Scene} scene
 * @param {number} wave - the current wave number (drives the hp multiplier).
 * @param {import("three").Vector3} position - spawn position (feet), XZ used.
 * @param {EventTarget} bus
 */

/** Butcher boss — spec above. Constructor: new ButcherBoss(scene, wave, position, bus). */
export class ButcherBoss {
  /**
   * @param {import("three").Scene} scene
   * @param {number} wave
   * @param {import("three").Vector3} position
   * @param {EventTarget} bus
   */
  constructor(scene, wave, position, bus) {
    void scene;
    void wave;
    void position;
    void bus;
    throw new Error("TODO: implement");
  }
}

/** Spitter boss — spec above. Constructor: new SpitterBoss(scene, wave, position, bus). */
export class SpitterBoss {
  /**
   * @param {import("three").Scene} scene
   * @param {number} wave
   * @param {import("three").Vector3} position
   * @param {EventTarget} bus
   */
  constructor(scene, wave, position, bus) {
    void scene;
    void wave;
    void position;
    void bus;
    throw new Error("TODO: implement");
  }
}

/** Screamer boss — spec above. Constructor: new ScreamerBoss(scene, wave, position, bus). */
export class ScreamerBoss {
  /**
   * @param {import("three").Scene} scene
   * @param {number} wave
   * @param {import("three").Vector3} position
   * @param {EventTarget} bus
   */
  constructor(scene, wave, position, bus) {
    void scene;
    void wave;
    void position;
    void bus;
    throw new Error("TODO: implement");
  }
}

/** Golem boss — spec above. Constructor: new GolemBoss(scene, wave, position, bus). */
export class GolemBoss {
  /**
   * @param {import("three").Scene} scene
   * @param {number} wave
   * @param {import("three").Vector3} position
   * @param {EventTarget} bus
   */
  constructor(scene, wave, position, bus) {
    void scene;
    void wave;
    void position;
    void bus;
    throw new Error("TODO: implement");
  }
}

/**
 * Boss spawn cycle for boss waves (wave % 5 === 0) — feature C5:
 * butcher → spitter → screamer → golem → repeat.
 * @type {("butcher"|"spitter"|"screamer"|"golem")[]}
 */
export const BOSS_CYCLE = ["butcher", "spitter", "screamer", "golem"];

/**
 * Map a boss type to its class (waves.js / debug spawnBoss use this).
 * @type {Record<"butcher"|"spitter"|"screamer"|"golem",
 *               typeof ButcherBoss | typeof SpitterBoss |
 *               typeof ScreamerBoss | typeof GolemBoss>}
 */
export const BOSS_CLASSES = {
  butcher: ButcherBoss,
  spitter: SpitterBoss,
  screamer: ScreamerBoss,
  golem: GolemBoss,
};
