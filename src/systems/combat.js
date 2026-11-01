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
 * - GUN GAME 2.0 P4 (P4-K16): each landed pellet also emits
 *   "damage-dealt" {pos: Vector3, amount, headshot} on the bus (pos = the ray
 *   hit point clone, amount = the dmg actually applied) — the HUD's floating
 *   damage numbers. This is combat.js's only additional emit; the per-CALL
 *   "hit" event above is unchanged.
 * - Per shoot() call that landed at least one pellet (NOT per pellet):
 *   audio.zombieHit() once, audio.hitmarker(headshot) once (headshot = any
 *   headshot pellet landed), and emit "hit" {headshot, killed} on the bus
 *   (killed = any pellet killed its target). HUD shows the hitmarker.
 * - Also per shoot() call: particles.spawnMuzzle(muzzlePos, camDir) — muzzle
 *   world position ≈ camera position + forward * 0.5 (slight right/down
 *   offset acceptable); the light flash itself lives in weapons.js.
 *
 * WEAPON-FEEL FX (purely cosmetic, zero gameplay/stat effect):
 * - TRACERS: one pooled LineSegments segment per pellet (capped at 8/shot)
 *   from the muzzle to the resolved hit point, or camPos + dir * MAX_DISTANCE
 *   when the pellet leaves the arena. Warm yellow; sniper pale white-blue;
 *   railgun electric cyan-blue. Lifetime 0.05–0.09 s, additive, faded to black
 *   (invisible under additive blending) by update(dt).
 * - SHELL CASINGS: exactly ONE pooled brass box per shoot() call (shotgun
 *   pellets share it), ejected right + up + back with gravity, 1.2 s life,
 *   floor-clamped at y = 0.02. Grenade launcher never reaches shoot().
 * - IMPACT: a solid hit (verdict 2) calls particles.spawnImpact(point, -dir)
 *   (3 sparks + 2 dust motes); zombie hits keep the existing blood only.
 * - MUZZLE SMOKE: particles.spawnSmoke(muzzlePos, camDir, 3) per shot.
 * - Pools own their geometry/material for the page lifetime (same precedent
 *   as particles.js); no dispose contract. update(dt) advances/fades both
 *   pools and resetFx() hides every live tracer/casing (fresh-run hook). The
 *   FX live under one scene group flagged userData.combatFx and are excluded
 *   from the bullet raycast roots below.
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
 * @property {(dt: number) => void} update
 *   Advance the cosmetic pools (tracer fade/expiry, casing flight/floor
 *   clamp). Call once per frame next to particles.update(dt).
 * @property {() => void} resetFx
 *   Hide every live tracer + casing (fresh-run hook; particles are left to
 *   their own short lifetimes).
 */

import * as THREE from "three";

const MAX_DISTANCE = 100;   // ray cap (spec: ~100 m)
const HEADSHOT_MULT = 2;    // default headshot multiplier (feature B6); weapon
                            // defs override via .headshotMult — sniper is 3

// --- pooled weapon-feel FX tuning ---------------------------------------------
const TRACER_POOL = 32;          // segments; 8-pellet shotgun + rapid fire headroom
const TRACER_MAX_PER_SHOT = 8;   // one per pellet, hard cap per shoot() call
const TRACER_LIFE = 0.06;        // s — default warm tracer
const TRACER_LIFE_SNIPER = 0.08; // s
const TRACER_LIFE_RAIL = 0.09;   // s
const SHELL_POOL = 24;           // brass casings; one per trigger pull
const SHELL_LIFE = 1.2;          // s
const SHELL_GRAVITY = 9.8;       // m/s²
const SHELL_FLOOR_Y = 0.02;      // m — clamp so casings never sink
const SHELL_SIZE = { w: 0.02, h: 0.02, d: 0.05 };

// Additive line colours (per-vertex color attributes fade toward black).
const TRACER_WARM = { r: 1.0, g: 0.78, b: 0.34 };
const TRACER_SNIPER = { r: 0.82, g: 0.92, b: 1.0 };
const TRACER_RAIL = { r: 0.3, g: 0.82, b: 1.0 };

/** Uniform random in [lo, hi). */
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

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
  const raycastRoots = [];   // scene.children minus particles + combat FX (per shot)
  const camDir = new THREE.Vector3();
  const rightB = new THREE.Vector3();
  const upB = new THREE.Vector3();
  const pelletDir = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const muzzlePos = new THREE.Vector3();
  const tracerEnd = new THREE.Vector3();
  const impactNormal = new THREE.Vector3();

  // --- pooled cosmetic FX: tracers + shell casings ---------------------------
  // One scene-level group holds both pools. Tagged userData.combatFx so the
  // per-shot raycast root scan below can skip the whole subtree (the shells
  // and tracer segments are never cover and must not eat raycast time).
  const fxRoot = new THREE.Group();
  fxRoot.userData.combatFx = true;
  if (scene && typeof scene.add === "function") scene.add(fxRoot);

  // Tracers: ONE LineSegments with TRACER_POOL*2 vertices, per-vertex colors.
  // Inactive slots are zero-length black segments (invisible, no allocation).
  const tracerPositions = new Float32Array(TRACER_POOL * 6);
  const tracerColors = new Float32Array(TRACER_POOL * 6);
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPosAttr = new THREE.BufferAttribute(tracerPositions, 3);
  const tracerColAttr = new THREE.BufferAttribute(tracerColors, 3);
  tracerPosAttr.setUsage(THREE.DynamicDrawUsage);
  tracerColAttr.setUsage(THREE.DynamicDrawUsage);
  tracerGeo.setAttribute("position", tracerPosAttr);
  tracerGeo.setAttribute("color", tracerColAttr);
  const tracerMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const tracerMesh = new THREE.LineSegments(tracerGeo, tracerMat);
  tracerMesh.frustumCulled = false; // endpoints move every frame
  tracerMesh.renderOrder = 10;      // over the world, under the HUD (DOM)
  tracerMesh.userData.combatFx = true;
  fxRoot.add(tracerMesh);

  /** @type {Array<{active: boolean, life: number, maxLife: number,
   *   sx:number, sy:number, sz:number, ex:number, ey:number, ez:number,
   *   r:number, g:number, b:number}>} */
  const tracers = new Array(TRACER_POOL);
  for (let i = 0; i < TRACER_POOL; i++) {
    tracers[i] = {
      active: false, life: 0, maxLife: 1,
      sx: 0, sy: 0, sz: 0, ex: 0, ey: 0, ez: 0,
      r: 1, g: 1, b: 1,
    };
  }
  let tracerCursor = 0; // round-robin: a full pool recycles the oldest segment

  /** Write one pooled segment + its additive color (alpha baked into RGB). */
  function writeTracer(i, sx, sy, sz, ex, ey, ez, r, g, b, alpha) {
    const p = i * 6;
    tracerPositions[p] = sx;
    tracerPositions[p + 1] = sy;
    tracerPositions[p + 2] = sz;
    tracerPositions[p + 3] = ex;
    tracerPositions[p + 4] = ey;
    tracerPositions[p + 5] = ez;
    tracerColors[p] = r * alpha;
    tracerColors[p + 1] = g * alpha;
    tracerColors[p + 2] = b * alpha;
    tracerColors[p + 3] = r * alpha;
    tracerColors[p + 4] = g * alpha;
    tracerColors[p + 5] = b * alpha;
    tracerPosAttr.needsUpdate = true;
    tracerColAttr.needsUpdate = true;
  }

  /**
   * Claim the next tracer slot (never allocates) and draw muzzle → end.
   * @param {number} ex @param {number} ey @param {number} ez
   * @param {number} life
   * @param {{r:number, g:number, b:number}} color
   */
  function spawnTracer(ex, ey, ez, life, color) {
    const i = tracerCursor;
    tracerCursor = (tracerCursor + 1) % TRACER_POOL;
    const tr = tracers[i];
    tr.active = true;
    tr.life = life;
    tr.maxLife = life;
    tr.sx = muzzlePos.x;
    tr.sy = muzzlePos.y;
    tr.sz = muzzlePos.z;
    tr.ex = ex;
    tr.ey = ey;
    tr.ez = ez;
    tr.r = color.r;
    tr.g = color.g;
    tr.b = color.b;
    writeTracer(i, tr.sx, tr.sy, tr.sz, ex, ey, ez, tr.r, tr.g, tr.b, 1);
  }

  // Shell casings: fixed pool of brass boxes, one per shoot() call.
  const shellGeo = new THREE.BoxGeometry(SHELL_SIZE.w, SHELL_SIZE.h, SHELL_SIZE.d);
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xb98c3d,          // brass
    roughness: 0.35,
    metalness: 0.75,
    emissive: 0x3a2a08,       // faint glint so it reads against the night
    emissiveIntensity: 0.55,
  });
  /** @type {Array<{mesh: THREE.Mesh, active: boolean, life: number,
   *   vx:number, vy:number, vz:number, spinX:number, spinY:number,
   *   spinZ:number}>} */
  const shells = new Array(SHELL_POOL);
  for (let i = 0; i < SHELL_POOL; i++) {
    const mesh = new THREE.Mesh(shellGeo, shellMat);
    mesh.visible = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    fxRoot.add(mesh);
    shells[i] = {
      mesh, active: false, life: 0,
      vx: 0, vy: 0, vz: 0, spinX: 0, spinY: 0, spinZ: 0,
    };
  }
  let shellCursor = 0;

  /**
   * Eject exactly one casing from the camera's lower-right. Called once per
   * shoot() call (so a shotgun's 8 pellets still drop one shell). Basis
   * vectors (rightB/upB/camDir/camPos) are already current.
   */
  function spawnCasing() {
    const rec = shells[shellCursor];
    shellCursor = (shellCursor + 1) % SHELL_POOL;
    const mesh = rec.mesh;
    mesh.position
      .copy(camPos)
      .addScaledVector(rightB, 0.26)
      .addScaledVector(upB, -0.2)
      .addScaledVector(camDir, 0.35);
    mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    mesh.visible = true;
    rec.active = true;
    rec.life = SHELL_LIFE;
    // right + up + a little backward, from the ejection port.
    const side = rand(1.7, 2.7);
    const lift = rand(1.3, 2.2);
    const back = rand(0.25, 0.9);
    rec.vx = rightB.x * side + upB.x * lift - camDir.x * back;
    rec.vy = rightB.y * side + upB.y * lift - camDir.y * back;
    rec.vz = rightB.z * side + upB.z * lift - camDir.z * back;
    rec.spinX = rand(-9, 9);
    rec.spinY = rand(-6, 6);
    rec.spinZ = rand(-7, 7);
  }

  function updateTracers(dt) {
    for (let i = 0; i < TRACER_POOL; i++) {
      const tr = tracers[i];
      if (!tr.active) continue;
      tr.life -= dt;
      if (tr.life <= 0) {
        tr.active = false;
        tr.life = 0;
        writeTracer(i, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0);
        continue;
      }
      const a = tr.life / tr.maxLife;
      // Additive: color → black is a clean fade (no material-wide opacity).
      writeTracer(
        i,
        tr.sx, tr.sy, tr.sz,
        tr.ex, tr.ey, tr.ez,
        tr.r, tr.g, tr.b,
        a * a
      );
    }
  }

  function updateShells(dt) {
    for (let i = 0; i < SHELL_POOL; i++) {
      const rec = shells[i];
      if (!rec.active) continue;
      rec.life -= dt;
      if (rec.life <= 0) {
        rec.active = false;
        rec.life = 0;
        rec.mesh.visible = false;
        continue;
      }
      rec.vy -= SHELL_GRAVITY * dt;
      const mesh = rec.mesh;
      mesh.position.x += rec.vx * dt;
      mesh.position.y += rec.vy * dt;
      mesh.position.z += rec.vz * dt;
      if (mesh.position.y <= SHELL_FLOOR_Y) {
        // No colliders: settle on the arena floor instead of sinking.
        mesh.position.y = SHELL_FLOOR_Y;
        if (rec.vy < 0) rec.vy = 0;
        rec.vx *= 0.82;
        rec.vz *= 0.82;
        rec.spinX *= 0.9;
        rec.spinY *= 0.9;
        rec.spinZ *= 0.9;
      }
      mesh.rotation.x += rec.spinX * dt;
      mesh.rotation.y += rec.spinY * dt;
      mesh.rotation.z += rec.spinZ * dt;
    }
  }

  /** Fresh-run hook: hide every live tracer/casing immediately. */
  function resetFx() {
    for (let i = 0; i < TRACER_POOL; i++) {
      const tr = tracers[i];
      tr.active = false;
      tr.life = 0;
      writeTracer(i, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0);
    }
    for (let i = 0; i < SHELL_POOL; i++) {
      const rec = shells[i];
      rec.active = false;
      rec.life = 0;
      rec.mesh.visible = false;
    }
    tracerCursor = 0;
    shellCursor = 0;
  }

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
    // InstancedMesh and the combat FX group — their pool instances sit right
    // in front of the muzzle, and testing them per pellet is wasted work
    // (they are pass-through anyway; classify() never marks them solid). The
    // camera stays in the list: its viewmodel subtree is filtered per hit by
    // classify() instead.
    raycastRoots.length = 0;
    let roots;
    if (scene) {
      const children = scene.children;
      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        if (c.isInstancedMesh) continue;
        if (c.userData && c.userData.combatFx) continue;
        raycastRoots.push(c);
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
    camera.getWorldPosition(camPos);
    // Shared muzzle origin: slightly right/down of the camera, ahead of the
    // near plane (the viewmodel barrel sits lower-right).
    muzzlePos
      .copy(camPos)
      .addScaledVector(camDir, 0.5)
      .addScaledVector(rightB, 0.1)
      .addScaledVector(upB, -0.07);

    // Per-weapon tracer voice: warm yellow is the default; sniper and railgun
    // get their colder signature streaks.
    const wname = weapon.name;
    let tracerLife = TRACER_LIFE;
    let tracerColor = TRACER_WARM;
    if (wname === "sniper") {
      tracerLife = TRACER_LIFE_SNIPER;
      tracerColor = TRACER_SNIPER;
    } else if (wname === "railgun") {
      tracerLife = TRACER_LIFE_RAIL;
      tracerColor = TRACER_RAIL;
    }
    let tracerCount = 0;

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
      let resolvedEnd = false;
      for (let h = 0; h < hitBuf.length; h++) {
        const hit = hitBuf[h];
        const verdict = classify(hit.object);
        if (verdict === 0) continue; // viewmodel / corpse / decoration — through
        if (verdict === 2) {
          // Level cover: the pellet stops silently. Weapon feel: sparks +
          // dust on the surface, and the tracer ends on the wall face.
          tracerEnd.copy(hit.point);
          resolvedEnd = true;
          if (particles && particles.spawnImpact) {
            impactNormal.copy(pelletDir).multiplyScalar(-1);
            particles.spawnImpact(hit.point, impactNormal);
          } else if (particles && particles.spawnSpark) {
            // Older/stub particle implementations still get visible sparks.
            particles.spawnSpark(hit.point);
          }
          break;
        }
        if (!foundZombie.alive) continue; // died from an earlier pellet this shot
        const headshot = foundPart === "head";
        const dmg = headshot ? damage * headMult : damage;
        // GUN GAME 2.0 P4 (§7.2, P4-K16): one emit PER LANDED PELLET — the
        // HUD's floating damage numbers. `dmg` is the value actually applied
        // (headshot multiplier already in); pos clones the ray hit point
        // (the hitBuf entry is reused internally by three.js). The single
        // emit point of combat.js — hitscan/headshotMult logic untouched.
        bus.dispatchEvent(
          new CustomEvent("damage-dealt", {
            detail: { pos: hit.point.clone(), amount: dmg, headshot },
          })
        );
        const killed = foundZombie.takeDamage(dmg, headshot) === true;
        if (particles) {
          particles.spawnBlood(hit.point, 8 + Math.floor(Math.random() * 7)); // 8..14
        }
        tracerEnd.copy(hit.point); // bullet stops in flesh — end the streak here
        resolvedEnd = true;
        landed = true;
        if (headshot) anyHead = true;
        if (killed) anyKilled = true;
        break; // the pellet is spent on this zombie
      }
      // No zombie or solid met: the streak runs out to the ray cap.
      if (!resolvedEnd) {
        tracerEnd.copy(camPos).addScaledVector(pelletDir, MAX_DISTANCE);
      }
      // One tracer per pellet, hard-capped per trigger pull (shotgun = 8).
      if (tracerCount < TRACER_MAX_PER_SHOT) {
        spawnTracer(tracerEnd.x, tracerEnd.y, tracerEnd.z, tracerLife, tracerColor);
        tracerCount++;
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
    // A separate, much smaller grey smoke puff rides on top of the blast.
    if (particles) {
      particles.spawnMuzzle(muzzlePos, camDir);
      if (particles.spawnSmoke) particles.spawnSmoke(muzzlePos, camDir, 3);
    }
    // Exactly one brass casing per trigger pull — never per pellet. Grenade
    // launcher never reaches here (explosive guard above); explosives.js owns
    // its projectile.
    spawnCasing();
  }

  /** @param {number} dt */
  function update(dt) {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (step <= 0) return;
    updateTracers(step);
    updateShells(step);
  }

  return { shoot, update, resetFx };
}
