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
 *   and userData.zombie (combat raycast lookup) — inherited from the base
 *   Zombie constructor: every boss EXTENDS Zombie (composed model, same
 *   geometries, per-instance materials, death animation + corpse fade).
 * - Death (exactly once, from the killing takeDamage) emits "zombie-killed"
 *   {type, score, headshot, position} on the bus — score is the MONEY/REWARD
 *   base for the type (butcher 1000 / spitter 800 / screamer 700 / golem
 *   1500); gamestate applies the ×1.5 headshot score multiplier and economy
 *   pays money per the same table (B1: "thưởng theo type, không theo score").
 * - Boss death ALSO drops GUARANTEED 1 medkit + 1 ammo: emits
 *   **"boss-drops"** {position, kinds: ["health", "ammo"]} on the bus. The
 *   boss holds no pickups reference (constructor signature is frozen), so
 *   main.js must route this event to pickups.spawn(position, "health") +
 *   pickups.spawn(position, "ammo"). It is a NEW event — additive, nothing in
 *   the old game listens to it, so the fallback path is safe.
 * - Boss voice (roar / shriek / slam) similarly emits **"boss-roar"**
 *   {type, action} for main.js to route to audio (e.g. audio.zombieGrowl());
 *   again additive and unlistened by default.
 *
 * THE 4 BOSSES (spec numbers — DO NOT change):
 *
 *   butcher  — hp 1200×(1+wave/20), speed 2.0: every 6 s it WINDS UP for
 *       0.8 s (stands still, glows red, roar) then CHARGES STRAIGHT 14 m at
 *       charge speed; touching the player deals 40 dmg + knockback impulse;
 *       regular melee 35 dmg. Dark-red skin + large cleaver.
 *
 *   spitter  — hp 800×(1+wave/20), speed 2.6: KEEPS DISTANCE 10–16 m (walks
 *       BACKWARD when the player closes in); every 2.5 s spits an ACID ARC —
 *       a self-managed parabolic projectile (explosives.fire is the grenade
 *       hitscan/90-dmg path, NOT suitable for acid, so this module owns its
 *       own pooled projectiles). A hit deals 18 dmg and leaves a 2 m acid
 *       pool (1 m radius) lasting 4 s dealing 6 dmg/s — applied as 3 dmg per
 *       0.5 s tick so "player-hurt" does not spam every frame.
 *
 *   screamer — hp 600×(1+wave/20), speed 3.2: every 8 s it SHRIEKS — a white
 *       shock-wave ring expands 8 m over 0.8 s; a player within 8 m takes
 *       10 dmg and is pushed BACK 4 m (positional, collision-checked, spread
 *       over the ring expansion); each shriek SUMMONS 3 zombies (walkers, or
 *       runners when wave ≥ 6) around the boss — new Zombie + "zombie-spawned"
 *       {zombie} (the waves fallback the contract names; waves.js tracks them
 *       via the instance flag `summoned === true` so a boss wave only clears
 *       when they die too. Debug spawns carry no flag → never affect waves).
 *
 *   golem    — hp 2000×(1+wave/20), speed 1.2, takes 25% LESS damage (the
 *       reduction is applied INSIDE takeDamage): every 6 s, if the player is
 *       within 6 m, it SLAMS the ground — a ring expands to 8 m radius over
 *       0.6 s and the player is SWEPT (damaged once as the ring reaches
 *       them): 30 dmg + knocked UP (hất bay). Gray stone body, scale 2.2 —
 *       the LARGEST of all zombies (brute is 1.6).
 *
 * Builder-chosen numbers where the spec is silent (marked here so review can
 * find them fast): melee dmg spitter 15 / screamer 10 / golem 30 (butcher 35
 * is spec); charge speed 11 m/s; first special-move delays (butcher 3 s,
 * spitter 1.5 s, screamer 3 s, golem 3 s); spit range cap 20 m; scales
 * butcher 1.7 / spitter 1.1 / screamer 1.0 / golem 2.2.
 *
 * hp scale: hp = base × (1 + wave/20), rounded to integer.
 *
 * i18n (C8): this module registers ITS OWN boss-name bundle
 * ("boss.butcher"… "boss.golem", EN + VI) at import time.
 *
 * Constructor (frozen by the committed stub — main.js debug spawnBoss builds
 * bosses through BOSS_CLASSES with exactly these arguments):
 *   new ButcherBoss(scene, wave, position, bus)   — same for the other three.
 *
 * @param {import("three").Scene} scene
 * @param {number} wave - the current wave number (drives the hp multiplier).
 * @param {import("three").Vector3} position - spawn position (feet), XZ used.
 * @param {EventTarget} bus
 */

import * as THREE from "three";
import { Zombie } from "./zombie.js";
import { registerBundle } from "../core/i18n.js";

// --- i18n: boss display names — this file owns its own text (contract C8) ----

registerBundle({
  en: {
    boss: {
      butcher: "The Butcher",
      spitter: "The Spitter",
      screamer: "The Screamer",
      golem: "The Golem",
    },
  },
  vi: {
    boss: {
      butcher: "Đồ Tể",
      spitter: "Phun Acid",
      screamer: "Gào Thét",
      golem: "Người Đá",
    },
  },
});

// --- spec + tuning table (frozen numbers; see file header) -------------------

const BOSS_DEFS = {
  butcher: { id: "butcher", hp: 1200, speed: 2.0, scale: 1.7, meleeDmg: 35, score: 1000, skin: 0x7a1c14, cloth: 0x4d1210, pants: 0x360f0d },
  spitter: { id: "spitter", hp: 800, speed: 2.6, scale: 1.1, meleeDmg: 15, score: 800, skin: 0x8fae3a, cloth: 0x4a5a22, pants: 0x33401a },
  screamer: { id: "screamer", hp: 600, speed: 3.2, scale: 1.0, meleeDmg: 10, score: 700, skin: 0x8a8fa0, cloth: 0x4a4e5c, pants: 0x33363f },
  golem: { id: "golem", hp: 2000, speed: 1.2, scale: 2.2, meleeDmg: 30, score: 1500, skin: 0x777d82, cloth: 0x565b60, pants: 0x3f4347 },
};

// Mirror of the base zombie internals used by the custom movers (zombie.js
// keeps these private, the numbers are part of its documented behavior).
const FLASH_TIME = 0.1; // hurt-flash duration
const GAIT_RATE = 3.4; // walk-phase radians per meter travelled
const BASE_RADIUS = 0.4; // collider radius at scale 1
const ATTACK_RANGE = 1.6; // melee reach
const ATTACK_COOLDOWN = 1.0; // one attack per second
const ATTACK_ANIM = 0.45; // arm-swing overlay

// Butcher charge (spec: windup 0.8 s / 6 s cycle / 14 m / 40 dmg; speed is
// builder-chosen at 11 m/s so the 14 m rush lasts ~1.3 s).
const CHARGE_CD = 6;
const CHARGE_FIRST = 3;
const WINDUP_TIME = 0.8;
const CHARGE_DIST = 14;
const CHARGE_SPEED = 11;
const CHARGE_DMG = 40;
const CHARGE_CONTACT = 1.4; // boss radius (0.4·1.7) + player radius (0.4) + slack
const CHARGE_TRIGGER = 20; // never start a charge at a player this far away
const CHARGE_KNOCK = 12; // horizontal knockback impulse (m/s)
const CHARGE_LIFT = 4; // upward component of the knockback (m/s)

// Spitter (spec: keep 10–16 m, spit every 2.5 s, 18 dmg, pool 4 s @ 6 dmg/s).
const KEEP_MIN = 10;
const KEEP_MAX = 16;
const SPIT_CD = 2.5;
const SPIT_FIRST = 1.5;
const SPIT_RANGE = 20; // builder choice: no point spitting across the arena
const SPIT_SPEED = 9; // horizontal launch speed → flight-time heuristic
const SPIT_GRAVITY = 12; // arc gravity (lighter than the player's 20)
const SPIT_DMG = 18;
const SPIT_HIT_RADIUS = 0.85; // XZ distance that counts as a body hit
const POOL_RADIUS = 1.0; // "vũng acid 2 m" → 2 m across (radius 1 m)
const POOL_LIFE = 4;
const POOL_DPS = 6;
const POOL_TICK = 0.5; // 6 dmg/s as 3 dmg per 0.5 s tick (no per-frame spam)
const POOL_MAX = 6; // concurrent pools per spitter (oldest recycled)
const SHOT_MAX = 4; // pooled acid projectiles per spitter

// Screamer (spec: shriek every 8 s, 8 m ring, push 4 m, 10 dmg, summon 3).
const SHRIEK_CD = 8;
const SHRIEK_FIRST = 3;
const SHRIEK_RADIUS = 8;
const SHRIEK_DMG = 10;
const SHRIEK_RING_TIME = 0.8; // white ring expands 0 → 8 m over this
const PUSH_SPEED = 10; // 4 m over ~0.4 s of positional shove
const SUMMON_COUNT = 3;
const SUMMON_RING = 2.2; // summons scatter within this radius of the boss

// Golem (spec: −25% damage, slam every 6 s when player < 6 m, 8 m ring over
// 0.6 s, 30 dmg + knock up).
const GOLEM_REDUCE = 0.25;
const SLAM_CD = 6;
const SLAM_FIRST = 3;
const SLAM_TRIGGER = 6;
const SLAM_RADIUS = 8;
const SLAM_TIME = 0.6;
const SLAM_DMG = 30;
const SLAM_LIFT = 8; // hất bay: strong upward launch
const SLAM_PUSH = 6; // plus a modest outward shove

// --- shared FX geometries (allocated once per page, like zombie.js) ----------
// Materials are per-instance (hurt flash / death fade mutate them).

let sharedBossGeo = null;
function bossGeometries() {
  if (!sharedBossGeo) {
    sharedBossGeo = {
      blade: new THREE.BoxGeometry(0.16, 1.05, 0.42),
      handle: new THREE.CylinderGeometry(0.05, 0.06, 0.5, 6),
      spit: new THREE.SphereGeometry(0.17, 8, 6),
      pool: new THREE.CircleGeometry(1, 24),
      ring: new THREE.RingGeometry(0.92, 1.0, 48),
    };
  }
  return sharedBossGeo;
}

// Reused scratch vectors — the per-frame paths must not allocate.
const scratchA = new THREE.Vector3();

/** Boss base: shared stats plumbing + the helpers the 4 behaviors reuse. */
export class BossZombie extends Zombie {
  /**
   * @param {import("three").Scene} scene
   * @param {number} wave
   * @param {import("three").Vector3} position
   * @param {EventTarget} bus
   * @param {{id: string, hp: number, speed: number, scale: number,
   *          meleeDmg: number, score: number, skin: number, cloth: number,
   *          pants: number}} def - one BOSS_DEFS entry
   */
  constructor(scene, wave, position, bus, def) {
    // Build the regular brute model first (biggest shared primitives), then
    // override every stat with the boss numbers below.
    super(scene, "brute", position, bus);

    this.type = def.id; // bus payload type ("butcher" | …) — economy pays by it
    const w = Math.max(1, Math.round(Number(wave)) || 1);
    this.wave = w;
    this.maxHp = Math.round(def.hp * (1 + w / 20)); // spec: ×(1 + wave/20)
    this.hp = this.maxHp;
    this.speed = def.speed;
    this.dmg = def.meleeDmg;
    this.score = def.score; // money reward base — gamestate ×1.5 on headshot
    this.scale = def.scale;
    this.group.scale.setScalar(def.scale);

    // Recolor the per-instance materials the base created:
    // _mats = [skin, cloth, pants, eyes] (indices fixed by the base ctor).
    this._mats[0].color.setHex(def.skin);
    this._mats[1].color.setHex(def.cloth);
    this._mats[2].color.setHex(def.pants);
    this._eyeMatIndex = 3; // glow helpers skip the eyes (they have their own)

    this._glowing = false;
    /** @type {THREE.Object3D[]} world FX owned by this boss (rings/pools/shots) */
    this._extras = [];
    /** @type {THREE.Material[]} world-FX materials, disposed on cleanup */
    this._fxMats = [];
  }

  // --- shared plumbing -------------------------------------------------------

  /** New per-instance body material — joins the hurt-flash/death-fade set. */
  _bodyMat(params) {
    const m = new THREE.MeshLambertMaterial(params);
    this._mats.push(m);
    this._baseEmissive.push(m.emissive.getHex());
    return m;
  }

  /** New world-FX material — NOT part of the body flash/fade set. */
  _fxMat(params) {
    const m = new THREE.MeshLambertMaterial(params);
    this._fxMats.push(m);
    return m;
  }

  /** Add a world-FX object to the scene and track it for cleanup. */
  _addExtra(obj) {
    if (this._scene && obj) {
      this._scene.add(obj);
      this._extras.push(obj);
    }
    return obj;
  }

  /** Remove + dispose one world-FX object (mesh; geometry stays shared). */
  _removeExtra(obj) {
    if (!obj) return;
    if (obj.parent) obj.parent.remove(obj);
    const i = this._extras.indexOf(obj);
    if (i !== -1) this._extras.splice(i, 1);
  }

  /** Drop every world-FX object (pools/projectiles/rings). Idempotent. */
  _cleanupExtras() {
    for (let i = this._extras.length - 1; i >= 0; i--) {
      const obj = this._extras[i];
      if (obj && obj.parent) obj.parent.remove(obj);
    }
    this._extras.length = 0;
    for (let i = 0; i < this._fxMats.length; i++) this._fxMats[i].dispose();
    this._fxMats.length = 0;
  }

  /** Corpse cleanup goes through here too — the base calls _finishDespawn. */
  _finishDespawn() {
    this._cleanupExtras();
    super._finishDespawn();
  }

  /** Immediate removal (waves.reset / debug) — also drop world FX. */
  dispose() {
    this._cleanupExtras();
    super.dispose();
  }

  /** Boss death = base death (event + corpse) + GUARANTEED medkit + ammo. */
  _die(headshot) {
    super._die(headshot);
    if (this.bus && typeof this.bus.dispatchEvent === "function") {
      this.bus.dispatchEvent(
        new CustomEvent("boss-drops", {
          detail: {
            position: this.position.clone(), // pre-sink death spot
            kinds: ["health", "ammo"], // CHẮC 1 medkit + 1 ammo (contract C4)
            boss: this.type,
          },
        })
      );
    }
  }

  /** Sustained red glow (butcher windup) — restored by _setGlow(false). */
  _setGlow(on) {
    if (on === this._glowing) return;
    this._glowing = on;
    for (let i = 0; i < this._mats.length; i++) {
      if (i === this._eyeMatIndex) continue; // eyes keep their own glow
      if (on) this._mats[i].emissive.setHex(0xb01414);
      else this._mats[i].emissive.setHex(this._baseEmissive[i]);
    }
  }

  /** Emit the additive "boss-roar" event (main may route it to audio). */
  _roar(action) {
    if (this.bus && typeof this.bus.dispatchEvent === "function") {
      this.bus.dispatchEvent(
        new CustomEvent("boss-roar", { detail: { type: this.type, action } })
      );
    }
  }

  // --- shared per-frame helpers (mirror zombie.js update mechanics) ----------

  /** Flash/attack-timer decay for bosses that bypass the base update. */
  _decayCommon(dt) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0 && !this._glowing) {
        for (let i = 0; i < this._mats.length; i++) {
          this._mats[i].emissive.setHex(this._baseEmissive[i]);
        }
      }
    }
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.attackAnimT > 0) this.attackAnimT = Math.max(0, this.attackAnimT - dt);
  }

  /**
   * Axis-separated collider slide (same rule as zombie.js/player.js).
   * @returns {number} distance actually moved this frame
   */
  _moveXZ(vx, vz, dt, level) {
    const pos = this.position;
    const oldX = pos.x;
    const oldZ = pos.z;
    const stepX = vx * dt;
    const stepZ = vz * dt;
    if (level && typeof level.isBlocked === "function") {
      const r = BASE_RADIUS * this.scale;
      if (stepX !== 0 && !level.isBlocked(pos.x + stepX, pos.z, r)) pos.x += stepX;
      if (stepZ !== 0 && !level.isBlocked(pos.x, pos.z + stepZ, r)) pos.z += stepZ;
    } else {
      pos.x += stepX;
      pos.z += stepZ;
    }
    return Math.sqrt((pos.x - oldX) * (pos.x - oldX) + (pos.z - oldZ) * (pos.z - oldZ));
  }

  /** Walk-cycle bookkeeping + limb animation for the custom movers. */
  _stepGait(moved, dt) {
    this.gait += ((moved > 1e-4 ? 1 : 0) - this.gait) * Math.min(1, dt * 6);
    this.walkPhase += moved * GAIT_RATE;
    this._animate();
  }

  /** Smooth shortest-arc yaw toward a direction (same rate as the base). */
  _face(dx, dz, dt, rate) {
    if (dx === 0 && dz === 0) return;
    const target = Math.atan2(dx, dz); // model faces +Z at yaw 0
    let dYaw = target - this.group.rotation.y;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    this.group.rotation.y += dYaw * Math.min(1, dt * (rate || 8));
  }

  /** XZ distance from the boss to a world point. */
  _distTo(x, z) {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /** Base-class melee: reach + cooldown + LOS, then arm swing + damage. */
  _tryMelee(player, level) {
    if (!player || !player.position || player.alive === false) return false;
    if (this.attackCd > 0) return false;
    if (this._distTo(player.position.x, player.position.z) >= ATTACK_RANGE) return false;
    if (!this._hasLineOfSight(player.position.x, player.position.z, level)) return false;
    this.attackCd = ATTACK_COOLDOWN;
    this.attackAnimT = ATTACK_ANIM;
    if (typeof player.damage === "function") player.damage(this.dmg);
    return true;
  }

  /**
   * Per-boss behavior. The default is the plain base chase; subclasses with
   * custom movement override this (they then handle flash decay themselves).
   * @protected
   */
  _act(dt, player, level, others) {
    Zombie.prototype.update.call(this, dt, player, level, others);
  }

  /** @override — guards + death animation from the base, behavior via _act. */
  update(dt, player, level, others) {
    if (this._gone || !Number.isFinite(dt) || dt <= 0) return;
    if (!this.alive) {
      this._deathStep(dt); // a dead boss only runs its death animation
      return;
    }
    this._act(dt, player, level, others);
  }
}

// --- BUTCHER — windup 0.8 s (glow + roar) then a straight 14 m charge --------

export class ButcherBoss extends BossZombie {
  constructor(scene, wave, position, bus) {
    super(scene, wave, position, bus, BOSS_DEFS.butcher);

    this._chargeCd = CHARGE_FIRST;
    this._windupT = -1; // >= 0 → winding up
    /** @type {{dx: number, dz: number, left: number, hit: boolean}|null} */
    this._charge = null;

    // Large cleaver in the right hand (part of the BODY: flash + fade + hits).
    const geo = bossGeometries();
    const bladeMat = this._bodyMat({ color: 0x9aa3ab });
    const handleMat = this._bodyMat({ color: 0x4a3520 });
    const blade = new THREE.Mesh(geo.blade, bladeMat);
    blade.position.set(0.02, -0.95, 0.22);
    blade.rotation.x = 0.5;
    blade.userData.part = "body";
    blade.userData.zombie = this;
    const handle = new THREE.Mesh(geo.handle, handleMat);
    handle.position.set(0.02, -0.5, 0.05);
    handle.userData.part = "body";
    handle.userData.zombie = this;
    blade.castShadow = handle.castShadow = true;
    if (this._armR) this._armR.add(blade, handle);
  }

  /** @override */
  _act(dt, player, level, others) {
    if (this._windupT >= 0) {
      this._windupStep(dt, player);
      return;
    }
    if (this._charge) {
      this._chargeStep(dt, player, level);
      return;
    }
    // Plain chase via the base update (steering + melee 35 + animation).
    Zombie.prototype.update.call(this, dt, player, level, others);

    if (!player || !player.position || player.alive === false) return;
    this._chargeCd -= dt;
    if (
      this._chargeCd <= 0 &&
      this._distTo(player.position.x, player.position.z) < CHARGE_TRIGGER
    ) {
      this._chargeCd = CHARGE_CD; // spec: every 6 s
      this._windupT = 0;
      this._setGlow(true); // phát sáng đỏ
      this._roar("windup"); // tiếng gầm
    }
  }

  /** Stand still, track the player, glow; then lock the charge direction. */
  _windupStep(dt, player) {
    this._decayCommon(dt);
    this._windupT += dt;
    let dx = 0;
    let dz = 0;
    if (player && player.position && player.alive !== false) {
      dx = player.position.x - this.position.x;
      dz = player.position.z - this.position.z;
      this._face(dx, dz, dt);
    }
    this._stepGait(0, dt);
    if (this._windupT < WINDUP_TIME) return;
    this._windupT = -1;
    this._setGlow(false);
    if (!player || !player.position || player.alive === false) return; // charge at nobody
    const d = Math.sqrt(dx * dx + dz * dz) || 1e-6;
    this._charge = { dx: dx / d, dz: dz / d, left: CHARGE_DIST, hit: false };
  }

  /** Straight rush: 14 m max, stops on wall or player contact (40 + hất lùi). */
  _chargeStep(dt, player, level) {
    const c = this._charge;
    if (!c) return;
    this._decayCommon(dt);
    const moved = this._moveXZ(c.dx * CHARGE_SPEED, c.dz * CHARGE_SPEED, dt, level);
    this._face(c.dx, c.dz, dt);
    this._stepGait(moved, dt);
    c.left -= moved;

    // Contact with the player → one hit per charge, then the rush ends.
    if (
      !c.hit &&
      player &&
      player.position &&
      player.alive !== false &&
      this._distTo(player.position.x, player.position.z) < CHARGE_CONTACT
    ) {
      c.hit = true;
      if (typeof player.damage === "function") player.damage(CHARGE_DMG);
      if (player.velocity) {
        player.velocity.x += c.dx * CHARGE_KNOCK;
        player.velocity.z += c.dz * CHARGE_KNOCK;
        player.velocity.y += CHARGE_LIFT;
      }
      this._endCharge();
      return;
    }
    // Wall (barely moved) or the full 14 m covered → back to the chase.
    if (c.left <= 0 || moved < CHARGE_SPEED * dt * 0.2) this._endCharge();
  }

  _endCharge() {
    this._charge = null;
    this._setGlow(false);
  }
}

// --- SPITTER — keeps 10–16 m, acid arcs, acid pools ---------------------------

export class SpitterBoss extends BossZombie {
  constructor(scene, wave, position, bus) {
    super(scene, wave, position, bus, BOSS_DEFS.spitter);

    this._spitCd = SPIT_FIRST;
    /** @type {{mesh: THREE.Mesh, on: boolean, vx: number, vy: number, vz: number, t: number}[]} */
    this._shots = [];
    /** @type {{mesh: THREE.Mesh, mat: THREE.Material, t: number, tickT: number}[]} */
    this._pools = [];
    /** @type {{mesh: THREE.Mesh, mat: THREE.Material}[]} free pool slots */
    this._poolFree = [];
  }

  /** @override */
  _act(dt, player, level, others) {
    this._decayCommon(dt);
    let vx = 0;
    let vz = 0;
    const canAct = !!(player && player.position && player.alive !== false);
    if (canAct) {
      const dx = player.position.x - this.position.x;
      const dz = player.position.z - this.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz) || 1e-6;
      const ux = dx / dist;
      const uz = dz / dist;
      // Keep the contract band: retreat inside 10 m, close beyond 16 m, hold
      // inside the band (bosses do not take part in minion separation).
      if (dist < KEEP_MIN) {
        vx = -ux * this.speed;
        vz = -uz * this.speed;
      } else if (dist > KEEP_MAX) {
        vx = ux * this.speed;
        vz = uz * this.speed;
      }
      this._tryMelee(player, level);
      this._spitCd -= dt;
      if (this._spitCd <= 0 && dist <= SPIT_RANGE) {
        this._spitCd = SPIT_CD; // spec: every 2.5 s
        this._fireSpit(player, dist);
      }
      this._face(dx, dz, dt);
    }
    const moved = this._moveXZ(vx, vz, dt, level);
    this._stepGait(moved, dt);
    this._updateShots(dt, player);
    this._updatePools(dt, player);
  }

  /** Launch a pooled acid projectile on a parabola that lands on the player. */
  _fireSpit(player, dist) {
    const geo = bossGeometries();
    let shot = null;
    for (let i = 0; i < this._shots.length; i++) {
      if (!this._shots[i].on) {
        shot = this._shots[i];
        break;
      }
    }
    if (!shot) {
      if (this._shots.length >= SHOT_MAX) return; // pool exhausted (never at 1/2.5 s)
      const mat = this._fxMat({ color: 0x9adf3a, emissive: 0x3f6e0a });
      const mesh = this._addExtra(new THREE.Mesh(geo.spit, mat));
      this._shots.push({ mesh, on: false, vx: 0, vy: 0, vz: 0, t: 0 });
      shot = this._shots[this._shots.length - 1];
    }
    // Flight time from distance, then a launch velocity that lands on the
    // player: y0 + vy·T − ½g·T² = 0 → vy = (½g·T² − y0)/T.
    const T = Math.min(1.2, Math.max(0.45, dist / SPIT_SPEED));
    const y0 = 1.35 * this.scale; // chest height in world meters
    const vy = (0.5 * SPIT_GRAVITY * T * T - y0) / T;
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    shot.on = true;
    shot.vx = dx / T;
    shot.vz = dz / T;
    shot.vy = vy;
    shot.t = 0;
    if (shot.mesh) {
      shot.mesh.position.set(this.position.x, y0, this.position.z);
      shot.mesh.visible = true;
    }
  }

  /** Integrate acid projectiles; ground/player contact → pool. */
  _updateShots(dt, player) {
    for (let i = 0; i < this._shots.length; i++) {
      const s = this._shots[i];
      if (!s.on) continue;
      s.t += dt;
      if (s.mesh) {
        s.mesh.position.x += s.vx * dt;
        s.mesh.position.y += s.vy * dt;
        s.mesh.position.z += s.vz * dt;
        s.vy -= SPIT_GRAVITY * dt;
      }
      const px = s.mesh ? s.mesh.position : null;
      if (!px || s.t > 5) {
        this._endShot(s, false);
        continue;
      }
      // Body hit: close in XZ and within the player's vertical span.
      if (
        player &&
        player.position &&
        player.alive !== false &&
        px.y > player.position.y - 0.2 &&
        px.y < player.position.y + 1.9
      ) {
        const dx = player.position.x - px.x;
        const dz = player.position.z - px.z;
        if (dx * dx + dz * dz < SPIT_HIT_RADIUS * SPIT_HIT_RADIUS) {
          if (typeof player.damage === "function") player.damage(SPIT_DMG);
          this._endShot(s, true);
          continue;
        }
      }
      if (px.y <= 0.08) this._endShot(s, true); // ground → pool
    }
  }

  /** Deactivate a shot; `splash` leaves the acid pool behind. */
  _endShot(s, splash) {
    s.on = false;
    if (s.mesh) s.mesh.visible = false;
    if (splash && s.mesh) this._spawnPool(s.mesh.position);
  }

  /** Leave a 2 m acid pool (4 s, 6 dmg/s as 0.5 s ticks); recycle the oldest. */
  _spawnPool(pos) {
    const geo = bossGeometries();
    let pool = this._poolFree.pop();
    if (!pool) {
      if (this._pools.length >= POOL_MAX) {
        pool = this._pools.shift(); // recycle the oldest (rare: 6 pools live 4 s)
        this._removeExtra(pool.mesh);
      } else {
        const mat = this._fxMat({
          color: 0x86c832,
          emissive: 0x2f5c0a,
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo.pool, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 1;
        pool = { mesh, mat, t: 0, tickT: 0 };
      }
      pool.mesh.scale.setScalar(POOL_RADIUS);
    }
    pool.mesh.position.set(pos.x, 0.06, pos.z); // just above the floor
    pool.mesh.visible = true;
    pool.mat.opacity = 0.75;
    pool.t = POOL_LIFE;
    pool.tickT = POOL_TICK / 2; // first tick lands fast, then every 0.5 s
    this._addExtra(pool.mesh);
    this._pools.push(pool);
  }

  /** Pool lifetime + damage ticks (3 dmg per 0.5 s inside the radius). */
  _updatePools(dt, player) {
    for (let i = this._pools.length - 1; i >= 0; i--) {
      const p = this._pools[i];
      p.t -= dt;
      if (p.t <= 0) {
        p.mesh.visible = false;
        this._removeExtra(p.mesh);
        this._poolFree.push(p);
        this._pools.splice(i, 1);
        continue;
      }
      // Fade out over the last 0.5 s.
      if (p.t < 0.5) p.mat.opacity = 0.75 * (p.t / 0.5);
      p.tickT -= dt;
      if (p.tickT > 0) continue;
      p.tickT += POOL_TICK;
      if (
        player &&
        player.position &&
        player.alive !== false &&
        typeof player.damage === "function"
      ) {
        const dx = player.position.x - p.mesh.position.x;
        const dz = player.position.z - p.mesh.position.z;
        if (dx * dx + dz * dz < POOL_RADIUS * POOL_RADIUS) {
          player.damage(POOL_DPS * POOL_TICK); // 6 dmg/s as 0.5 s ticks
        }
      }
    }
  }
}

// --- SCREAMER — 8 s shriek: white ring, push, summon --------------------------

export class ScreamerBoss extends BossZombie {
  constructor(scene, wave, position, bus) {
    super(scene, wave, position, bus, BOSS_DEFS.screamer);

    this._shriekCd = SHRIEK_FIRST;
    /** @type {{mesh: THREE.Mesh, t: number}|null} expanding white ring */
    this._ring = null;
    this._pushLeft = 0; // meters of positional push still owed to the player
    this._pushX = 0;
    this._pushZ = 0;
  }

  /** @override */
  _act(dt, player, level, others) {
    if (player && player.position && player.alive !== false) {
      this._shriekCd -= dt;
      if (this._shriekCd <= 0) {
        this._shriekCd = SHRIEK_CD; // spec: every 8 s
        this._shriek(player, level);
      }
    }
    Zombie.prototype.update.call(this, dt, player, level, others); // chase + melee
    this._updateRing(dt, player, level);
  }

  /** Ring + 10 dmg + 4 m push for players within 8 m, then summon 3 minions. */
  _shriek(player, level) {
    this._roar("shriek");
    const geo = bossGeometries();
    if (!this._ring) {
      const mat = this._fxMat({
        color: 0xffffff,
        emissive: 0xbfc8d4,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo.ring, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 1;
      this._ring = { mesh, t: 0 };
    }
    this._ring.t = 0;
    this._ring.mesh.position.set(this.position.x, 0.25, this.position.z);
    this._ring.mesh.scale.setScalar(0.4);
    this._ring.mesh.visible = true;
    this._addExtra(this._ring.mesh);

    // Players within 8 m take 10 dmg and are pushed back 4 m (positional,
    // collision-checked — spread over the ring expansion in _updateRing).
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1e-6;
    if (dist <= SHRIEK_RADIUS) {
      if (typeof player.damage === "function") player.damage(SHRIEK_DMG);
      this._pushLeft = 4;
      this._pushX = dx / dist;
      this._pushZ = dz / dist;
    } else {
      this._pushLeft = 0;
    }

    this._summon(level);
  }

  /** 3 walkers (runners from wave 6) around the boss, announced on the bus. */
  _summon(level) {
    if (!this._scene) return;
    const type = this.wave >= 6 ? "runner" : "walker"; // spec: runner from wave 6
    const canTest = !!(level && typeof level.isBlocked === "function");
    for (let i = 0; i < SUMMON_COUNT; i++) {
      // Jittered ring spawn, skipping blocked samples; fallback = boss spot.
      let x = this.position.x;
      let z = this.position.z;
      for (let a = 0; a < 6; a++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = SUMMON_RING * (0.5 + Math.random() * 0.5);
        const jx = this.position.x + Math.cos(ang) * rad;
        const jz = this.position.z + Math.sin(ang) * rad;
        if (!canTest || !level.isBlocked(jx, jz, 0.4)) {
          x = jx;
          z = jz;
          break;
        }
      }
      const minion = new Zombie(this._scene, type, scratchA.set(x, 0, z), this.bus);
      minion.summoned = true; // waves.js tracks this flag for wave-clear
      this.bus.dispatchEvent(new CustomEvent("zombie-spawned", { detail: { zombie: minion } }));
    }
  }

  /** Ring grows 0 → 8 m over 0.8 s while it shoves the player outward. */
  _updateRing(dt, player, level) {
    const ring = this._ring;
    if (!ring || !ring.mesh || !ring.mesh.visible) {
      if (this._pushLeft > 0) this._applyPush(dt, player, level); // ring gone, keep the debt
      return;
    }
    ring.t += dt;
    const p = Math.min(1, ring.t / SHRIEK_RING_TIME);
    ring.mesh.scale.setScalar(0.4 + (SHRIEK_RADIUS - 0.4) * p);
    if (p >= 1) {
      ring.mesh.visible = false;
      this._removeExtra(ring.mesh);
    }
    if (this._pushLeft > 0) this._applyPush(dt, player, level);
  }

  /** Positional shove (deterministic 4 m), axis-free, stopped by walls. */
  _applyPush(dt, player, level) {
    if (!player || !player.position || player.alive === false) {
      this._pushLeft = 0;
      return;
    }
    let step = PUSH_SPEED * dt;
    if (step > this._pushLeft) step = this._pushLeft;
    if (step <= 0) return;
    const pos = player.position;
    const canTest = !!(level && typeof level.isBlocked === "function");
    // Try the full step, then per-axis, then give up (player against a wall).
    if (!canTest || !level.isBlocked(pos.x + this._pushX * step, pos.z + this._pushZ * step, 0.4)) {
      pos.x += this._pushX * step;
      pos.z += this._pushZ * step;
      this._pushLeft -= step;
    } else if (!level.isBlocked(pos.x + this._pushX * step, pos.z, 0.4)) {
      pos.x += this._pushX * step;
      this._pushLeft -= step;
    } else if (!level.isBlocked(pos.x, pos.z + this._pushZ * step, 0.4)) {
      pos.z += this._pushZ * step;
      this._pushLeft -= step;
    } else {
      this._pushLeft = 0;
    }
  }
}

// --- GOLEM — −25% damage taken, ground slam sweep -----------------------------

export class GolemBoss extends BossZombie {
  constructor(scene, wave, position, bus) {
    super(scene, wave, position, bus, BOSS_DEFS.golem);
    this._slamCd = SLAM_FIRST;
    /** @type {{mesh: THREE.Mesh, mat: THREE.Material, x: number, z: number, t: number, hit: boolean}|null} */
    this._slam = null;
  }

  /**
   * @override Spec: −25% damage taken, applied INSIDE takeDamage. `d` arrives
   * with the headshot multiplier already applied by combat.js — reduce the
   * total.
   */
  takeDamage(d, headshot) {
    if (!this.alive) return false;
    const n = Number(d);
    if (!Number.isFinite(n) || n <= 0) return false;
    return super.takeDamage(n * (1 - GOLEM_REDUCE), headshot);
  }

  /** @override */
  _act(dt, player, level, others) {
    if (player && player.position && player.alive !== false) {
      this._slamCd -= dt;
      if (this._slamCd <= 0 && this._distTo(player.position.x, player.position.z) < SLAM_TRIGGER) {
        this._slamCd = SLAM_CD; // spec: every 6 s (opportunity window)
        this._startSlam();
      }
    }
    Zombie.prototype.update.call(this, dt, player, level, others); // slow chase
    this._updateSlam(dt, player);
  }

  /** Slam at the boss's current spot: ring sweeps 8 m over 0.6 s. */
  _startSlam() {
    this._roar("slam");
    const geo = bossGeometries();
    if (!this._slam) {
      const mat = this._fxMat({
        color: 0xff7733,
        emissive: 0xb03c10,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo.ring, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 1;
      this._slam = { mesh, mat, x: 0, z: 0, t: 0, hit: false };
    }
    this._slam.t = 0;
    this._slam.hit = false;
    this._slam.x = this.position.x;
    this._slam.z = this.position.z;
    this._slam.mesh.position.set(this.position.x, 0.2, this.position.z);
    this._slam.mesh.scale.setScalar(0.4);
    this._slam.mesh.visible = true;
    this._addExtra(this._slam.mesh);
  }

  /** Sweep: the player is hit once, when the ring reaches their distance. */
  _updateSlam(dt, player) {
    const s = this._slam;
    if (!s || !s.mesh || !s.mesh.visible) return;
    s.t += dt;
    const p = Math.min(1, s.t / SLAM_TIME);
    const radius = 0.4 + (SLAM_RADIUS - 0.4) * p;
    s.mesh.scale.setScalar(radius);
    s.mat.opacity = 0.85 * (1 - p * 0.6);
    if (p >= 1) {
      s.mesh.visible = false;
      this._removeExtra(s.mesh);
      return;
    }
    if (s.hit || !player || !player.position || player.alive === false) return;
    const dx = player.position.x - s.x;
    const dz = player.position.z - s.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1e-6;
    if (d > radius) return;
    s.hit = true; // quét once per slam
    if (typeof player.damage === "function") player.damage(SLAM_DMG);
    if (player.velocity) {
      player.velocity.y = SLAM_LIFT; // hất bay
      player.velocity.x += (dx / d) * SLAM_PUSH;
      player.velocity.z += (dz / d) * SLAM_PUSH;
    }
  }
}

// --- boss spawn cycle (feature C5) --------------------------------------------

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

/**
 * The boss type of a boss wave (deterministic from the wave number — survives
 * reset() without extra state): wave 5 butcher, 10 spitter, 15 screamer,
 * 20 golem, 25 butcher, …
 * @param {number} wave - boss wave (wave % 5 === 0)
 * @returns {"butcher"|"spitter"|"screamer"|"golem"}
 */
export function bossTypeForWave(wave) {
  const idx = (((Math.floor(wave / 5) - 1) % BOSS_CYCLE.length) + BOSS_CYCLE.length) % BOSS_CYCLE.length;
  return BOSS_CYCLE[idx];
}
