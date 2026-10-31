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
 * EXPANSION (docs/EXPANSION.md C3) — gate pathing: when the straight line to
 * the player is wall-blocked (sampled exactly like _hasLineOfSight) AND the
 * two are in DIFFERENT areas (level.sameArea: arena vs north vs east zone),
 * the zombie heads for a gate waypoint first (level.getGateWaypoints) and
 * only then resumes the direct chase — a cheap 2-step path. The waypoint is
 * picked among the gates reachable in a straight line, nearest to the PLAYER
 * (falling back to the nearest gate overall). Same-area chases keep the old
 * steering + collider-slide untouched; the decision is replanned every
 * GATE_RECHECK seconds per zombie, never per frame.
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
 * The model faces local +Z (eyes / hunch / arm reach point that way); yaw is
 * rotation.y = atan2(dx, dz) toward the player.
 *
 * @param {import("three").Scene} scene - the zombie adds itself to it.
 * @param {"walker"|"runner"|"brute"} type
 * @param {import("three").Vector3} position - spawn position (feet), XZ used.
 * @param {EventTarget} bus
 */

import * as THREE from "three";

// --- spec table — numbers frozen, see file header ----------------------------
const TYPES = {
  walker: { hp: 100, speed: 2.2, dmg: 15, score: 100, scale: 1.0, skin: 0x5d7a45, cloth: 0x39412f, pants: 0x2b2f26 },
  runner: { hp: 60, speed: 5.0, dmg: 10, score: 150, scale: 0.9, skin: 0x8f7d4b, cloth: 0x54302a, pants: 0x352b21 },
  brute: { hp: 400, speed: 1.4, dmg: 35, score: 400, scale: 1.6, skin: 0x4a6a5e, cloth: 0x27352f, pants: 0x1f2925 },
};

const ATTACK_RANGE = 1.6; // spec: attack when within 1.6 m of the player
const HOLD_RANGE = 1.35; // stop closing in; stay inside attack reach
const SEPARATION_DIST = 1.2; // spec: push apart when closer than 1.2 m
const SEPARATION_FORCE = 1.6; // how hard crowded zombies shove each other
const ATTACK_COOLDOWN = 1.0; // spec: one attack per second
const ATTACK_ANIM = 0.45; // arm-swing overlay, shorter than the cooldown
const FLASH_TIME = 0.1; // spec: 100 ms red material flash
const DEATH_TIME = 1.5; // spec: fall + sink + fade over 1.5 s
const BASE_RADIUS = 0.4; // collider radius at scale 1 (scaled per type)
const TORSO_Y = 0.78; // waist pivot height in model space
const GAIT_RATE = 3.4; // walk-phase radians per meter actually travelled
// --- expansion C3: gate pathing (docs/EXPANSION.md) ---------------------------
const GATE_RECHECK = 0.3; // seconds between gate-path replans (cheap, staggered)
const GATE_REACH2 = 0.8 * 0.8; // squared: "at the waypoint" → chase the player again

// Geometries are shared across ALL zombie instances (allocated once per page —
// the contract explicitly allows sharing geometries). Materials are
// per-instance and are the ONLY resources disposed on removal, so a hurt
// flash or death fade never bleeds into another zombie.
let sharedGeo = null;
function geometries() {
  if (!sharedGeo) {
    sharedGeo = {
      torso: new THREE.BoxGeometry(0.5, 0.7, 0.28),
      head: new THREE.BoxGeometry(0.26, 0.32, 0.26),
      eye: new THREE.BoxGeometry(0.05, 0.05, 0.02),
      arm: new THREE.CapsuleGeometry(0.07, 0.46, 3, 8), // 0.6 m overall
      leg: new THREE.CapsuleGeometry(0.09, 0.6, 3, 8), // 0.78 m overall
    };
  }
  return sharedGeo;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Tag a mesh for headshot detection + per-zombie lookup, enable shadows. */
function tagMesh(mesh, zombie, part) {
  mesh.userData.part = part;
  mesh.userData.zombie = zombie;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class Zombie {
  /**
   * @param {import("three").Scene} scene
   * @param {"walker"|"runner"|"brute"} type
   * @param {import("three").Vector3} position
   * @param {EventTarget} bus
   */
  constructor(scene, type, position, bus) {
    const kind = TYPES[type] ? type : "walker"; // unknown type falls back
    const t = TYPES[kind];
    this.type = kind;
    this.hp = t.hp;
    this.alive = true;
    this.speed = t.speed;
    this.dmg = t.dmg;
    this.score = t.score;
    this.scale = t.scale;
    this.bus = bus || new EventTarget();

    // Per-instance materials — the hurt flash and death fade mutate ONLY this
    // zombie's materials. Glowing eyes read in the dark without a light.
    const skin = new THREE.MeshLambertMaterial({ color: t.skin });
    const cloth = new THREE.MeshLambertMaterial({ color: t.cloth });
    const pants = new THREE.MeshLambertMaterial({ color: t.pants });
    const eyes = new THREE.MeshLambertMaterial({ color: 0x050505, emissive: 0xff2a18 });
    this._mats = [skin, cloth, pants, eyes];
    // Emissive to restore after a hurt flash — the eyes keep their glow.
    this._baseEmissive = this._mats.map((m) => m.emissive.getHex());

    const geo = geometries();
    const g = new THREE.Group();
    g.rotation.order = "YXZ"; // yaw first, then the death tilt around local X
    g.scale.setScalar(t.scale);
    const px = position && Number.isFinite(position.x) ? position.x : 0;
    const pz = position && Number.isFinite(position.z) ? position.z : 0;
    g.position.set(px, 0, pz); // feet on the floor
    this.group = g;
    this.position = g.position; // same Vector3 — mirrors the group by reference

    // Legs: pivot at hip height, capsule hangs down so the foot reaches y=0.
    const legLm = tagMesh(new THREE.Mesh(geo.leg, pants), this, "body");
    legLm.position.y = -0.39;
    const legL = new THREE.Group();
    legL.position.set(-0.13, TORSO_Y, 0);
    legL.add(legLm);
    const legRm = tagMesh(new THREE.Mesh(geo.leg, pants), this, "body");
    legRm.position.y = -0.39;
    const legR = new THREE.Group();
    legR.position.set(0.13, TORSO_Y, 0);
    legR.add(legRm);

    // Torso pivot at the waist: hunch lean + step bob rotate this one.
    const torso = tagMesh(new THREE.Mesh(geo.torso, cloth), this, "body");
    torso.position.y = 0.35;
    const head = tagMesh(new THREE.Mesh(geo.head, skin), this, "head");
    head.position.set(0, 0.86, 0.02);
    const eyeL = tagMesh(new THREE.Mesh(geo.eye, eyes), this, "head");
    eyeL.position.set(-0.06, 0.9, 0.155);
    const eyeR = tagMesh(new THREE.Mesh(geo.eye, eyes), this, "head");
    eyeR.position.set(0.06, 0.9, 0.155);

    // Arms: pivot at the shoulders (relative to the torso pivot).
    const armLm = tagMesh(new THREE.Mesh(geo.arm, skin), this, "body");
    armLm.position.y = -0.3;
    const armL = new THREE.Group();
    armL.position.set(-0.33, 0.6, 0);
    armL.add(armLm);
    const armRm = tagMesh(new THREE.Mesh(geo.arm, skin), this, "body");
    armRm.position.y = -0.3;
    const armR = new THREE.Group();
    armR.position.set(0.33, 0.6, 0);
    armR.add(armRm);

    const torsoPivot = new THREE.Group();
    torsoPivot.position.set(0, TORSO_Y, 0);
    torsoPivot.add(torso, head, eyeL, eyeR, armL, armR);

    g.add(legL, legR, torsoPivot);

    this._legL = legL;
    this._legR = legR;
    this._armL = armL;
    this._armR = armR;
    this._torso = torsoPivot;
    this._scene = scene && typeof scene.add === "function" ? scene : null;
    if (this._scene) this._scene.add(g);

    // Runtime state.
    this.walkPhase = 0; // radians; advances with distance travelled
    this.gait = 0; // 0..1 — blends the swing in/out when stopping
    this.flashT = 0; // hurt-flash countdown
    this.attackCd = 0; // seconds until the next attack is allowed
    this.attackAnimT = 0; // arm-swing overlay countdown
    this.deathT = -1; // >= 0 while the death animation runs
    this._torn = false; // teardown guard (dispose is idempotent)
    this._gone = false; // "zombie-despawned" already emitted

    // Gate pathing state (expansion C3): current {x, z} waypoint target or
    // null; _gateT is the replan countdown (0 → plan on the first update).
    this._gateT = 0;
    this._gateTarget = null;
  }

  /**
   * @param {number} dt - seconds
   * @param {import("../player/controller.js").Player} player
   * @param {import("../world/level.js").Level} level
   * @param {Zombie[]} others - other zombies for separation
   * @returns {void}
   */
  update(dt, player, level, others) {
    if (this._gone || !Number.isFinite(dt) || dt <= 0) return;
    if (!this.alive) {
      this._deathStep(dt); // a dead zombie only runs its death animation
      return;
    }

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        for (let i = 0; i < this._mats.length; i++) {
          this._mats[i].emissive.setHex(this._baseEmissive[i]);
        }
      }
    }
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.attackAnimT > 0) this.attackAnimT = Math.max(0, this.attackAnimT - dt);

    const pos = this.position;
    const ppos = player && player.position;
    const canChase = !!(ppos && player.alive !== false); // never hit a dead player
    let dx = 0;
    let dz = 0;
    let dist = Infinity;
    if (canChase) {
      dx = ppos.x - pos.x;
      dz = ppos.z - pos.z;
      dist = Math.sqrt(dx * dx + dz * dz);
    }

    // --- gate pathing (expansion C3): reroute through a fence gate when a ---
    // wall separates this zombie from the player. Replanned every
    // GATE_RECHECK seconds; the cached waypoint drops once reached.
    let gate = null;
    if (canChase && level && typeof level.getGateWaypoints === "function") {
      const t = this._gateTarget;
      if (t) {
        const gdx = t.x - pos.x;
        const gdz = t.z - pos.z;
        if (gdx * gdx + gdz * gdz < GATE_REACH2) this._gateTarget = null; // arrived
      }
      this._gateT -= dt;
      if (this._gateT <= 0) {
        this._gateT = GATE_RECHECK;
        this._gateTarget = this._planGatePath(ppos.x, ppos.z, level);
      }
      gate = this._gateTarget;
    }

    // --- steering: approach the player (or the gate waypoint) + separation --
    let vx = 0;
    let vz = 0;
    const tx = gate ? gate.x - pos.x : dx;
    const tz = gate ? gate.z - pos.z : dz;
    const tl = Math.sqrt(tx * tx + tz * tz);
    if (canChase && (dist > HOLD_RANGE || gate) && tl > 1e-6) {
      const inv = this.speed / tl;
      vx = tx * inv;
      vz = tz * inv;
    }
    if (others && others.length > 0) {
      const minD2 = SEPARATION_DIST * SEPARATION_DIST;
      let sx = 0;
      let sz = 0;
      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        if (!o || o === this || o.alive !== true || !o.position) continue;
        const ox = pos.x - o.position.x;
        const oz = pos.z - o.position.z;
        const d2 = ox * ox + oz * oz;
        if (d2 >= minD2 || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = ((SEPARATION_DIST - d) / SEPARATION_DIST) * SEPARATION_FORCE;
        sx += (ox / d) * push;
        sz += (oz / d) * push;
      }
      if (sx !== 0 || sz !== 0) {
        vx += sx * this.speed;
        vz += sz * this.speed;
      }
    }

    // --- move; test X and Z against the colliders separately (slide) --------
    const r = BASE_RADIUS * this.scale;
    const oldX = pos.x;
    const oldZ = pos.z;
    const stepX = vx * dt;
    const stepZ = vz * dt;
    if (level && typeof level.isBlocked === "function") {
      if (stepX !== 0 && !level.isBlocked(pos.x + stepX, pos.z, r)) pos.x += stepX;
      if (stepZ !== 0 && !level.isBlocked(pos.x, pos.z + stepZ, r)) pos.z += stepZ;
    } else {
      pos.x += stepX;
      pos.z += stepZ;
    }
    const mx = pos.x - oldX;
    const mz = pos.z - oldZ;
    const moved = Math.sqrt(mx * mx + mz * mz);

    // --- face the steering target (player, or the gate while pathing) -------
    if (canChase && tl > 1e-6) {
      const target = Math.atan2(tx, tz); // model faces +Z at yaw 0
      let dYaw = target - this.group.rotation.y;
      dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
      this.group.rotation.y += dYaw * Math.min(1, dt * 8);
    }

    // --- attack ---------------------------------------------------------------
    if (canChase && dist < ATTACK_RANGE && this.attackCd <= 0 && this._hasLineOfSight(ppos.x, ppos.z, level)) {
      this.attackCd = ATTACK_COOLDOWN;
      this.attackAnimT = ATTACK_ANIM;
      if (typeof player.damage === "function") player.damage(this.dmg);
    }

    // --- walk animation driven by the distance actually travelled ------------
    this.gait += ((moved > 1e-4 ? 1 : 0) - this.gait) * Math.min(1, dt * 6);
    this.walkPhase += moved * GAIT_RATE;
    this._animate();
  }

  /**
   * Cheap line-of-sight on the level colliders: sample the XZ segment to the
   * player and look for a blocker in between (covers are ≥ 0.3 m thick, a
   * 0.15 m sample radius catches them at ATTACK_RANGE distances). No level
   * API → optimistic.
   * @param {number} px - player X
   * @param {number} pz - player Z
   * @param {import("../world/level.js").Level} level
   * @returns {boolean} true when nothing blocks the straight line
   */
  _hasLineOfSight(px, pz, level) {
    if (!level || typeof level.isBlocked !== "function") return true;
    const pos = this.position;
    const dx = px - pos.x;
    const dz = pz - pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-6) return true;
    const steps = Math.max(2, Math.ceil(d / 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (level.isBlocked(pos.x + dx * t, pos.z + dz * t, 0.15)) return false;
    }
    return true;
  }

  /**
   * Expansion C3 — decide whether this zombie must path through a gate and,
   * if so, which waypoint to head for first. Returns null when the old
   * straight chase applies. Called at most every GATE_RECHECK per zombie.
   *
   * Order of checks (cheap first):
   * 1. zombie + player in the SAME area (level.sameArea) → old behavior; the
   *    collider slide already handles props between them.
   * 2. straight line to the player clear (sampled like _hasLineOfSight) →
   *    straight chase (this includes walking through a gate gap directly).
   * 3. otherwise pick among the gates reachable in a straight line the one
   *    NEAREST THE PLAYER (contract C3); if none is reachable, the gate
   *    nearest this zombie so the slide still makes progress.
   *
   * @param {number} px - player X
   * @param {number} pz - player Z
   * @param {import("../world/level.js").Level} level
   * @returns {{x: number, z: number} | null} the waypoint target, if any
   */
  _planGatePath(px, pz, level) {
    const pos = this.position;
    if (typeof level.sameArea === "function" && level.sameArea(pos.x, pos.z, px, pz)) {
      return null; // same connected area → original steering (contract C3)
    }
    if (this._hasLineOfSight(px, pz, level)) return null; // nothing between us
    const gates = typeof level.getGateWaypoints === "function" ? level.getGateWaypoints() : null;
    if (!gates || gates.length === 0) return null;
    let best = null;
    let bestPlayerD = Infinity;
    let near = null;
    let nearSelfD = Infinity;
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      const sdx = g.x - pos.x;
      const sdz = g.z - pos.z;
      const sd = sdx * sdx + sdz * sdz;
      if (sd < nearSelfD) {
        nearSelfD = sd;
        near = g;
      }
      if (this._hasLineOfSight(g.x, g.z, level)) {
        const pdx = g.x - px;
        const pdz = g.z - pz;
        const pd = pdx * pdx + pdz * pdz;
        if (pd < bestPlayerD) {
          bestPlayerD = pd;
          best = g;
        }
      }
    }
    return best || near;
  }

  /**
   * @param {number} d - damage amount
   * @param {boolean} headshot - true when the hit landed on the head (x2 already applied by combat)
   * @returns {boolean} true if this damage killed the zombie
   */
  takeDamage(d, headshot) {
    if (!this.alive) return false;
    const n = Number(d);
    if (!Number.isFinite(n) || n <= 0) return false; // weird input: ignore
    this.hp -= n;
    // Hurt flash — per-instance materials; NO sound here (combat.js owns it).
    this.flashT = FLASH_TIME;
    for (let i = 0; i < this._mats.length; i++) this._mats[i].emissive.setHex(0xd02020);
    if (this.hp <= 0) {
      this._die(headshot === true);
      return true;
    }
    return false;
  }

  /**
   * Immediate removal: remove from scene + dispose materials. Does NOT emit
   * "zombie-despawned" — the corpse path emits from _finishDespawn() before
   * tearing down, and waves.reset() announces before calling this, so main.js
   * never gets a duplicate from this method. Safe to call twice.
   * @returns {void}
   */
  dispose() {
    this._teardown();
  }

  // --- internals --------------------------------------------------------------

  /** Pose the limbs: sin swings scaled by gait + attack overlay. */
  _animate() {
    const s = Math.sin(this.walkPhase);
    const swing = 0.55 * this.gait;
    this._legL.rotation.x = s * swing;
    this._legR.rotation.x = -s * swing;
    // Zombie reach: arms out toward +Z (negative X rotation lifts them);
    // the attack raises them overhead then lets them drop back.
    let armBase = -1.25;
    if (this.attackAnimT > 0) {
      const p = 1 - this.attackAnimT / ATTACK_ANIM; // 0 → 1 over the swing
      armBase -= 0.85 * Math.sin(p * Math.PI);
    }
    const armSwing = 0.2 * this.gait;
    this._armL.rotation.x = armBase + s * armSwing;
    this._armR.rotation.x = armBase - s * armSwing;
    // Slight hunch + step bob.
    this._torso.rotation.x = 0.1 + 0.05 * this.gait * Math.sin(this.walkPhase * 2);
    this._torso.position.y = TORSO_Y + 0.03 * this.gait * Math.abs(Math.cos(this.walkPhase));
  }

  /** Death starts here — exactly once, from the killing takeDamage. */
  _die(headshot) {
    this.alive = false;
    this.hp = 0;
    this.deathT = 0;
    this.flashT = 0;
    this.attackAnimT = 0;
    for (let i = 0; i < this._mats.length; i++) {
      const m = this._mats[i];
      m.emissive.setHex(0);
      m.transparent = true; // enable the per-instance fade
      m.opacity = 1;
    }
    // The corpse keeps whatever pose it died in — _animate() no longer runs.
    if (this.bus && typeof this.bus.dispatchEvent === "function") {
      this.bus.dispatchEvent(
        new CustomEvent("zombie-killed", {
          detail: {
            type: this.type,
            score: this.score, // BASE score — gamestate applies the x1.5
            headshot,
            position: this.position.clone(), // pre-sink death spot
          },
        })
      );
    }
  }

  /** Fall ~90° around local X, sink below the floor, fade — over 1.5 s. */
  _deathStep(dt) {
    if (this.deathT < 0) return;
    this.deathT += dt;
    const t = this.deathT;
    // Fall forward during the first 0.55 s (ease-out: hits the ground hard).
    const fall = Math.min(1, t / 0.55);
    this.group.rotation.x = (Math.PI / 2) * (1 - (1 - fall) * (1 - fall));
    // Sink from 0.35 s on (smoothstep).
    const sink = clamp01((t - 0.35) / 1.15);
    this.position.y = -0.55 * (sink * sink * (3 - 2 * sink));
    // Fade out over the last second.
    const fade = clamp01((t - 0.5) / 1.0);
    const op = 1 - fade;
    for (let i = 0; i < this._mats.length; i++) this._mats[i].opacity = op;
    if (t >= DEATH_TIME) this._finishDespawn();
  }

  _finishDespawn() {
    if (this._gone) return;
    this._gone = true;
    this.deathT = -1;
    // Announce BEFORE tearing down so main.js/waves can drop their reference.
    if (this.bus && typeof this.bus.dispatchEvent === "function") {
      this.bus.dispatchEvent(new CustomEvent("zombie-despawned", { detail: { zombie: this } }));
    }
    this._teardown();
  }

  /** Remove from scene + dispose per-instance materials (idempotent). */
  _teardown() {
    if (this._torn) return;
    this._torn = true;
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
    for (let i = 0; i < this._mats.length; i++) this._mats[i].dispose();
    this._mats.length = 0;
    // Shared geometries stay alive on purpose — other instances still use them.
  }
}
