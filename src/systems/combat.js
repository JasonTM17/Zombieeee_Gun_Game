/**
 * Hitscan combat. shoot(weapon) fires from the camera center along the camera
 * direction (Raycaster.setFromCamera({x:0, y:0}, camera) basis):
 *
 * - 1 ray normally; for the shotgun cast 8 rays jittered inside a cone of
 *   half-angle weapon.spread radians (weapon.pellets === 8).
 * - Ray scope: the whole `scene` (roots = scene.children minus the particles
 *   InstancedMesh) so level geometry occludes — bullets stop at walls,
 *   pillars, crates and the floor. Damage targets: every live zombie in
 *   `zombies` (the shared array main.js keeps in sync — each Zombie exposes
 *   `.group`, a THREE.Group whose meshes carry userData.part === "head" |
 *   "body" and userData.zombie). Cap ray distance (~100 m).
 * - Occlusion: intersections arrive sorted closest-first and the ray walks
 *   them until it resolves. A mesh marked userData.solid (level.js tags
 *   floor/walls/obstacles) stops the pellet — no damage, no sound, no
 *   hitmarker, no blood. The pellet PASSES THROUGH: the camera subtree
 *   (weapons viewmodel), corpses (userData.zombie with alive === false,
 *   still fading for 1.5 s), and unmarked objects (bulbs, pickups —
 *   decorations, not cover).
 * - Damage: weapon.damage per pellet; a hit on userData.part === "head"
 *   multiplies it by the weapon's headshot multiplier — read from the
 *   WeaponState def (.headshotMult, expansion feature B6): default x2 for
 *   every def that does not declare the field (all three launch guns keep
 *   their legacy x2), sniper x3.
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

import * as THREE from "three";

const MAX_DISTANCE = 100;   // ray cap (spec: ~100 m)
const HEADSHOT_MULT = 2;    // default headshot multiplier (feature B6); weapon
                            // defs override via .headshotMult — sniper is 3

export function createCombat(camera, scene, zombies, particles, audio, bus) {
  // The weapons viewmodel + muzzle flash light are CHILDREN of the camera, and
  // three.js only renders camera children when the camera itself is in the
  // scene graph — engine.js does not add it. Do it here (createCombat runs
  // once during bootstrap, before any gameplay frame; a no-op if main.js
  // already added the camera).
  if (!camera.parent && scene) scene.add(camera);

  const raycaster = new THREE.Raycaster();
  raycaster.far = MAX_DISTANCE;
  const CENTER = new THREE.Vector2(0, 0); // screen center → setFromCamera basis

  // Reused buffers — no per-shot steady-state allocation beyond event objects.
  const targets = [];        // live zombie root groups (this shot); the
                             // classification fallback for an untagged group
  const targetZombies = [];  // parallel: targets[i] ↔ targetZombies[i]
  const hitBuf = [];         // intersectObjects output (cleared per pellet)
  const raycastRoots = [];   // scene.children minus the particles mesh (per shot)
  const camDir = new THREE.Vector3();
  const rightB = new THREE.Vector3();
  const upB = new THREE.Vector3();
  const pelletDir = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const muzzlePos = new THREE.Vector3();

  // Walk up from a hit mesh to its root and decide what the pellet met, in
  // one pass. Verdicts:
  //   0 — pass through: the camera subtree (weapons viewmodel), a corpse
  //       (userData.zombie with alive === false), or anything unmarked
  //       (bulbs, pickups, particles — decorations, not cover). The ray
  //       continues to the next surface.
  //   1 — live zombie hit: foundZombie/foundPart are set (first userData.part
  //       seen on the way — head/body tagging lives on the meshes). Sources:
  //       userData.zombie on the meshes, or targets membership as the
  //       fallback for an untagged group.
  //   2 — solid level geometry (userData.solid, tagged by level.js on
  //       floor/walls/obstacles): the pellet stops, nothing else happens.
  let foundZombie = null;
  let foundPart = null;
  function classify(obj) {
    foundZombie = null;
    foundPart = null;
    let o = obj;
    while (o) {
      if (o === camera) return 0; // never shoot the viewmodel off your own gun
      const ud = o.userData;
      if (ud) {
        if (foundPart === null && ud.part) {
          foundPart = ud.part;
        }
        if (ud.zombie) {
          foundZombie = ud.zombie;
          return ud.zombie.alive ? 1 : 0; // corpse: fade on, pellet through
        }
        if (ud.solid) return 2;
      }
      const idx = targets.indexOf(o);
      if (idx !== -1) {
        foundZombie = targetZombies[idx];
        return 1;
      }
      o = o.parent;
    }
    return 0;
  }

  function shoot(weapon) {
    if (!weapon) return;
    // Explosive weapons (grenade) never hit-scan: their "fire" must be routed
    // by main.js to explosives.fire(origin, dir) — expansion integration
    // note 3. This guard keeps a missed routing harmless under the legacy
    // "every fire → combat.shoot" wiring (no ray, no blood, no sound).
    if (weapon.explosive === true) return;
    const damage = Math.max(0, Number(weapon.damage) || 0);
    const pellets = Math.max(1, Math.floor(Number(weapon.pellets) || 1));
    const spread = Math.max(0, Number(weapon.spread) || 0);
    // Headshot multiplier from the weapon def (feature B6): falls back to the
    // legacy x2 for any WeaponState without the field.
    const hm = Number(weapon.headshotMult);
    const headMult = Number.isFinite(hm) && hm > 0 ? hm : HEADSHOT_MULT;

    // Fresh target list every shot — never cache length or liveness.
    targets.length = 0;
    targetZombies.length = 0;
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (z && z.alive && z.group) {
        targets.push(z.group);
        targetZombies.push(z);
      }
    }

    // Raycast roots for this shot: scene.children minus the particles
    // InstancedMesh — its pool instances sit right in front of the muzzle,
    // and testing them per pellet is wasted work (they are pass-through
    // anyway; classify() never marks them solid). The camera stays in the
    // list: its viewmodel subtree is filtered per hit by classify() instead.
    raycastRoots.length = 0;
    let roots;
    if (scene) {
      const children = scene.children;
      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        if (!c.isInstancedMesh) raycastRoots.push(c);
      }
      roots = raycastRoots;
    } else {
      roots = targets; // degenerate bootstrap (no scene): zombies only
    }

    // The controller/weapons wrote camera transform this frame; make the
    // world matrices current before casting.
    camera.updateMatrixWorld();
    raycaster.setFromCamera(CENTER, camera);
    camDir.copy(raycaster.ray.direction);
    rightB.set(1, 0, 0).applyQuaternion(camera.quaternion);
    upB.set(0, 1, 0).applyQuaternion(camera.quaternion);

    let landed = false;
    let anyHead = false;
    let anyKilled = false;

    for (let p = 0; p < pellets; p++) {
      if (pellets > 1) {
        // Shotgun: uniform jitter inside a cone of half-angle `spread`
        // (sqrt for uniform disc distribution, tan to project onto the plane).
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.tan(spread) * Math.sqrt(Math.random());
        pelletDir
          .copy(camDir)
          .addScaledVector(rightB, Math.cos(ang) * rad)
          .addScaledVector(upB, Math.sin(ang) * rad)
          .normalize();
      } else {
        pelletDir.copy(camDir);
      }
      raycaster.ray.direction.copy(pelletDir);

      // Intersections come back sorted closest-first (Raycaster.ascSort);
      // walk them in order until the pellet resolves — a live zombie takes
      // the damage, a solid surface eats it, everything else is passed
      // through. An exhausted list means the pellet left the arena.
      hitBuf.length = 0;
      raycaster.intersectObjects(roots, true, hitBuf);
      for (let h = 0; h < hitBuf.length; h++) {
        const hit = hitBuf[h];
        const verdict = classify(hit.object);
        if (verdict === 0) continue; // viewmodel / corpse / decoration — through
        if (verdict === 2) break;    // level cover: the pellet stops, silent
        if (!foundZombie.alive) continue; // died from an earlier pellet this shot
        const headshot = foundPart === "head";
        const dmg = headshot ? damage * headMult : damage;
        const killed = foundZombie.takeDamage(dmg, headshot) === true;
        if (particles) {
          particles.spawnBlood(hit.point, 8 + Math.floor(Math.random() * 7)); // 8..14
        }
        landed = true;
        if (headshot) anyHead = true;
        if (killed) anyKilled = true;
        break; // the pellet is spent on this zombie
      }
    }

    // One hit feedback per shoot() call that landed something — never per
    // pellet (one shotgun blast = one hitmarker, one flesh sound).
    if (landed) {
      if (audio) {
        audio.zombieHit();
        audio.hitmarker(anyHead);
      }
      bus.dispatchEvent(
        new CustomEvent("hit", { detail: { headshot: anyHead, killed: anyKilled } })
      );
    }

    // Muzzle blast particles per shot (the light flash lives in weapons.js).
    camera.getWorldPosition(camPos);
    muzzlePos
      .copy(camPos)
      .addScaledVector(camDir, 0.5)
      .addScaledVector(rightB, 0.1)
      .addScaledVector(upB, -0.07);
    if (particles) particles.spawnMuzzle(muzzlePos, camDir);
  }

  return { shoot };
}
