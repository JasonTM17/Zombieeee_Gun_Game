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

import * as THREE from "three";

const MAX_DISTANCE = 100;   // ray cap (spec: ~100 m)
const HEADSHOT_MULT = 2;    // userData.part === "head" → damage x2

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
  const targets = [];        // live zombie root groups (this shot)
  const targetZombies = [];  // parallel: targets[i] ↔ targetZombies[i]
  const hitBuf = [];         // intersectObjects output (cleared per pellet)
  const camDir = new THREE.Vector3();
  const rightB = new THREE.Vector3();
  const upB = new THREE.Vector3();
  const pelletDir = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const muzzlePos = new THREE.Vector3();

  // Walk up from a hit mesh to its zombie root group; record the first
  // userData.part seen on the way (head/body tagging lives on the meshes).
  let foundZombie = null;
  let foundPart = null;
  function resolveTarget(obj) {
    foundZombie = null;
    foundPart = null;
    let o = obj;
    while (o) {
      if (foundPart === null && o.userData && o.userData.part) {
        foundPart = o.userData.part;
      }
      const idx = targets.indexOf(o);
      if (idx !== -1) {
        foundZombie = targetZombies[idx];
        return true;
      }
      o = o.parent;
    }
    return false;
  }

  function shoot(weapon) {
    if (!weapon) return;
    const damage = Math.max(0, Number(weapon.damage) || 0);
    const pellets = Math.max(1, Math.floor(Number(weapon.pellets) || 1));
    const spread = Math.max(0, Number(weapon.spread) || 0);

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

      hitBuf.length = 0;
      raycaster.intersectObjects(targets, true, hitBuf);
      if (hitBuf.length === 0) continue;
      const hit = hitBuf[0]; // closest intersection takes the pellet
      if (!resolveTarget(hit.object)) continue;
      if (!foundZombie.alive) continue; // died from an earlier pellet this shot

      const headshot = foundPart === "head";
      const dmg = headshot ? damage * HEADSHOT_MULT : damage;
      const killed = foundZombie.takeDamage(dmg, headshot) === true;
      if (particles) {
        particles.spawnBlood(hit.point, 8 + Math.floor(Math.random() * 7)); // 8..14
      }
      landed = true;
      if (headshot) anyHead = true;
      if (killed) anyKilled = true;
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
