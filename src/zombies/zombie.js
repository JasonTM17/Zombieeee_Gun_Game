/**
 * Zombie actor — a low-poly humanoid built from BoxGeometry/CapsuleGeometry
 * primitives inside a THREE.Group that the constructor adds to `scene`.
 *
 * Types (spec numbers — DO NOT change):
 *   type    | hp  | speed (m/s) | dmg | score | scale | notes
 *   walker  | 100 | 2.2         | 15  | 100   | 1.0
 *   runner  | 60  | 5.0         | 10  | 150   | 0.9
 *   brute   | 400 | 1.4         | 35  | 400   | 1.6
 *   crawler | 45  | 6.2         | 8   | 175   | 0.55  | low crawl, reach 1.4 m
 *   bloater | 260 | 1.15        | 30  | 500   | 1.35  | death burst 25 dmg / 4 m
 *   armored | 320 | 1.7         | 28  | 450   | 1.25  | −35% BODY damage taken
 * Skin color differs per type. Scale affects the model only — speeds are
 * absolute. The head mesh has userData.part = "head"; torso/arms/legs have
 * userData.part = "body" (combat headshot detection depends on this).
 *
 * NEW TYPES (multi-type expansion — same external surface as walker/runner):
 * - crawler: dedicated crawling silhouette (horizontal torso near the ground,
 *   long arms planted forward, short trailing legs) plus a fast scuttle gait
 *   (walkPhase ×2.2, alternate arm/leg kicks, low bob). Its melee reach is
 *   1.4 m (TYPES.crawler.attackRange) instead of the 1.6 m default.
 * - bloater: wide toxic body with a glowing green sack. On death (inside the
 *   killing takeDamage) it BURSTS: 25 damage to a player within 4 m — it
 *   stores the last player reference in update() so _die can apply that —
 *   emits "bloater-burst" {position, radius, damage} on the bus and grows a
 *   flat green ring FX that fades over 1.2 s. The ring is stepped by the
 *   corpse's _deathStep (corpse lifetime 1.5 s) and its geometry/material are
 *   disposed in _teardown.
 * - armored: dark metal plating on torso/head + a slight red visor.
 *   takeDamage multiplies BODY hits by 0.65 BEFORE the hp subtraction;
 *   headshots take full damage. Death behavior is the base one.
 *
 * ELITE VARIANTS (user request — never bosses): the optional 5th constructor
 * arg `elite` is one of "frenzied" | "ironhide" | "toxic" | "giant" (or
 * undefined/null). It shapes hp/speed/dmg/scale/score in the constructor
 * BEFORE the instance reaches the bus, so waves can spawn it without a second
 * pass. Base TYPES numbers are untouched. Every elite gets a per-instance
 * additive aura ring at the feet (flat, y ≈ 0.06 world) that spins slowly in
 * _animate; the ring geometry + material are disposed in _teardown.
 *   frenzied: speed ×1.45, scale ×1.08, dmg ×1.15, hp ×0.9
 *   ironhide: hp ×2.2, dmg ×1.1, speed ×0.92, scale ×1.12, BODY ×0.8
 *   toxic:    hp ×1.3, speed ×1.05, dmg ×1.1; death burst 15 dmg / 2.5 m
 *   giant:    scale ×1.45, hp ×1.8, dmg ×1.35, speed ×0.9
 * Ironhide stacks with armored (body ×0.65 × 0.8 = ×0.52); headshots bypass
 * BOTH. The toxic burst reuses the bloater burst machinery and emits
 * "elite-burst" {position, radius, damage, kind} (the bloater keeps emitting
 * "bloater-burst"). Death detail also carries elite + eliteMoneyMul /
 * eliteScoreMul; `score` is already elite-shaped (apply headshot afterwards).
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
 * - attack: within the type's reach (1.6 m default, crawler 1.4 m) →
 *   arm-swing animation and player.damage(dmg) once every 1 s (per-zombie
 *   attack timer).
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
 * - armored: body hits are reduced ×0.65 before the hp subtraction; headshots
 *   are not reduced (the multiplier arrives pre-applied from combat.js).
 * - hp -= d; flash red 100 ms.
 * - The HIT SOUND is played by combat.js (audio.zombieHit) — this method must
 *   NOT play or emit a sound event (one shotgun blast = 8 takeDamage calls).
 * - @returns {boolean} true if this damage brought hp to <= 0 (killed it).
 *
 * Death (exactly once, at the takeDamage that returns true):
 * - emits "zombie-killed" {type, score, headshot, position, elite,
 *   eliteMoneyMul, eliteScoreMul} on the bus — score is the BASE score for
 *   the type (walker 100 / runner 150 / brute 400 / crawler 175 / bloater 500
 *   / armored 450) times eliteScoreMul when the unit is elite;
 *   gamestate applies the x1.5 headshot multiplier afterwards, so DO NOT
 *   pre-multiply for headshots. position is a Vector3 clone of the death spot.
 * - bloater deaths additionally emit "bloater-burst" and start the ring FX
 *   (see the new-types note above).
 * - falls over (~90° rotation around local X), sinks and fades over 1.5 s,
 *   then removes itself from the scene, disposes its geometries/materials and
 *   emits "zombie-despawned" {zombie} on the bus (main.js drops it from the
 *   shared array; waves drops it from its internal list).
 *
 * NIGHT 30 P2 (docs/EXPANSION-P2.md §5) — ZOMBIE VOICES (additive): at every
 * state transition + takeDamage + death this zombie emits
 * "zombie-voice" {kind: "idle"|"alert"|"chase"|"attack"|"pain"|"death",
 * type, position: Vector3 clone} on the bus; src/core/audio.js synthesizes
 * the actual 3D-mixed sound (volume + stereo pan, cap 8 — no files). Idle
 * moans run on a random 6–14 s timer while alive; chase calls cycle per type
 * (walker 2.4 / runner 1.3 / brute 3.2 / crawler 1.1 / bloater 3.0 /
 * armored 2.8 s); pain is throttled ≥ 0.4 s per
 * zombie (P2-K4) and skipped on the killing blow (the death voice covers that
 * moment) — the P1 rule above still holds: takeDamage NEVER plays a sound
 * directly. Steering / animation / collision paths are untouched.
 *
 * Instance surface consumed by other modules (waves/combat/main):
 *   type, hp, alive, group (THREE.Group), position (Vector3, mirrors group),
 *   update(dt, player, level, others), takeDamage(d, headshot), dispose().
 *
 * The model faces local +Z (eyes / hunch / arm reach point that way); yaw is
 * rotation.y = atan2(dx, dz) toward the player.
 *
 * @param {import("three").Scene} scene - the zombie adds itself to it.
 * @param {"walker"|"runner"|"brute"|"crawler"|"bloater"|"armored"} type
 * @param {import("three").Vector3} position - spawn position (feet), XZ used.
 * @param {EventTarget} bus
 * @param {"frenzied"|"ironhide"|"toxic"|"giant"|null} [elite] - optional elite
 *   modifier; unknown/non-string values are ignored (boss/origin callers may
 *   pass a def object in this slot — it never becomes an elite).
 */

import * as THREE from "three";

// --- spec table — numbers frozen, see file header ----------------------------
const TYPES = {
  walker: { hp: 100, speed: 2.2, dmg: 15, score: 100, scale: 1.0, skin: 0x5d7a45, cloth: 0x39412f, pants: 0x2b2f26 },
  runner: { hp: 60, speed: 5.0, dmg: 10, score: 150, scale: 0.9, skin: 0x8f7d4b, cloth: 0x54302a, pants: 0x352b21 },
  brute: { hp: 400, speed: 1.4, dmg: 35, score: 400, scale: 1.6, skin: 0x4a6a5e, cloth: 0x27352f, pants: 0x1f2925 },
  // Multi-type expansion — crawler: low/fast (reach 1.4 m); bloater: slow
  // toxic carrier (death burst); armored: plated (−35% body damage).
  crawler: { hp: 45, speed: 6.2, dmg: 8, score: 175, scale: 0.55, attackRange: 1.4, skin: 0x8a7d55, cloth: 0x4d3d2c, pants: 0x322a20 },
  bloater: { hp: 260, speed: 1.15, dmg: 30, score: 500, scale: 1.35, skin: 0x7d9448, cloth: 0x475a26, pants: 0x303c1a },
  armored: { hp: 320, speed: 1.7, dmg: 28, score: 450, scale: 1.25, skin: 0x6b7076, cloth: 0x33383d, pants: 0x24282c },
};

// --- elite variants (user request; never applied to bosses) -------------------
// FROZEN values. `color` drives both the aura ring and the eye emissive tint.
// `moneyMul` / `scoreMul` are reward multipliers (applied exactly once:
// economy pays base × moneyMul, the emitted score is already × scoreMul).
export const ELITE_DEFS = {
  frenzied: {
    nameKey: "eliteFrenzied",
    hpMul: 0.9,
    speedMul: 1.45,
    dmgMul: 1.15,
    scaleMul: 1.08,
    moneyMul: 1.6,
    scoreMul: 1.3,
    color: 0xff5a1e, // orange/red
  },
  ironhide: {
    nameKey: "eliteIronhide",
    hpMul: 2.2,
    speedMul: 0.92,
    dmgMul: 1.1,
    scaleMul: 1.12,
    moneyMul: 1.8,
    scoreMul: 1.5,
    color: 0x9fb6d0, // blue-grey
  },
  toxic: {
    nameKey: "eliteToxic",
    hpMul: 1.3,
    speedMul: 1.05,
    dmgMul: 1.1,
    scaleMul: 1,
    moneyMul: 1.5,
    scoreMul: 1.35,
    color: 0x54e04a, // green
  },
  giant: {
    nameKey: "eliteGiant",
    hpMul: 1.8,
    speedMul: 0.9,
    dmgMul: 1.35,
    scaleMul: 1.45,
    moneyMul: 2,
    scoreMul: 1.6,
    color: 0xffc02e, // gold
  },
};

/** Uniform pool for waves.js (insertion order is stable). */
export const ELITE_KINDS = Object.keys(ELITE_DEFS);

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
// --- multi-type expansion ----------------------------------------------------
const CRAWLER_GAIT_MUL = 2.2; // scuttle: walk-phase advances much faster
const CRAWLER_TORSO_Y = 0.52; // crawl pivot height (torso lies near the ground)
const CRAWLER_ARM_REST = -0.75; // arms propped forward/down, hands near the floor
const CRAWLER_LEG_REST = 1.35; // short legs trail behind the body
const ARMORED_BODY_MULT = 0.65; // −35% damage on BODY hits (headshots full)
const BLOATER_BURST_RADIUS = 4; // m — burst hurts inside this XZ radius
const BLOATER_BURST_DMG = 25; // spec: burst damage
const BLOATER_BURST_TIME = 1.2; // s — green ring expands + fades
const BLOATER_RING_START = 0.5; // ring scale at t=0 (m)
// --- elite variants ----------------------------------------------------------
const IRONHIDE_BODY_MULT = 0.8; // −20% BODY damage; headshots bypass it
const TOXIC_BURST_RADIUS = 2.5; // m — toxic elite death burst
const TOXIC_BURST_DMG = 15;
const ELITE_AURA_INNER = 0.52; // ring radii in model space (scaled by group)
const ELITE_AURA_OUTER = 0.72;
const ELITE_AURA_OPACITY = 0.55;
const ELITE_AURA_SPIN = 0.8; // rad/s — slow, readable rotation
const ELITE_AURA_Y = 0.06; // world-space height above the feet
// --- expansion C3: gate pathing (docs/EXPANSION.md) ---------------------------
const GATE_RECHECK = 0.3; // seconds between gate-path replans (cheap, staggered)
const GATE_REACH2 = 0.8 * 0.8; // squared: "at the waypoint" → chase the player again
// --- NIGHT 30 P2 (docs/EXPANSION-P2.md §5.1): voice pacing --------------------
const VOICE_CHASE_CYCLE = { walker: 2.4, runner: 1.3, brute: 3.2, crawler: 1.1, bloater: 3.0, armored: 2.8 }; // s between chase calls
const VOICE_BOSS_SCALE = 1.5; // bosses talk less: cycles ×1.5 (idle 9–21 s, chase 4.8 s)
const VOICE_ALERT_RANGE = 18; // first-sight growl inside this + line of sight
const VOICE_ALERT_REARM = 30; // the alert growl re-arms beyond this distance
const VOICE_CHASE_RANGE = 30; // chase calls (and idle deferral) use this range
const VOICE_PAIN_CD = 0.4; // pain-voice throttle per zombie (P2-K4)

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
      // --- multi-type expansion (shared like every other geometry) ----------
      crawlerTorso: new THREE.BoxGeometry(0.5, 0.34, 0.9), // horizontal body
      crawlerHead: new THREE.BoxGeometry(0.3, 0.26, 0.34),
      crawlerArm: new THREE.CapsuleGeometry(0.055, 0.5, 3, 8), // long reach
      crawlerLeg: new THREE.CapsuleGeometry(0.06, 0.3, 3, 8), // short/trailing
      bloaterSack: new THREE.SphereGeometry(0.5, 10, 8), // toxic glow belly
      armorPlate: new THREE.BoxGeometry(0.58, 0.54, 0.14),
      armorHelmet: new THREE.BoxGeometry(0.32, 0.24, 0.32),
      armorVisor: new THREE.BoxGeometry(0.2, 0.055, 0.02),
      armorPauldron: new THREE.BoxGeometry(0.22, 0.16, 0.32),
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
   * @param {"walker"|"runner"|"brute"|"crawler"|"bloater"|"armored"} type
   * @param {import("three").Vector3} position
   * @param {EventTarget} bus
   */
  constructor(scene, type, position, bus, elite) {
    const kind = TYPES[type] ? type : "walker"; // unknown type falls back
    const t = TYPES[kind];
    // Optional elite modifier. ONLY strings in ELITE_DEFS qualify — bosses and
    // the Origin pass a def object in this slot (backwards compatible).
    const eliteKind = typeof elite === "string" && ELITE_DEFS[elite] ? elite : null;
    const e = eliteKind ? ELITE_DEFS[eliteKind] : null;
    this.type = kind;
    this.elite = eliteKind;
    this.eliteNameKey = e ? e.nameKey : null;
    this.eliteMoneyMul = e ? e.moneyMul : 1;
    this.eliteScoreMul = e ? e.scoreMul : 1;
    this.hp = e ? Math.round(t.hp * e.hpMul) : t.hp;
    this.alive = true;
    this.speed = e ? t.speed * e.speedMul : t.speed;
    this.dmg = e ? t.dmg * e.dmgMul : t.dmg;
    // `score` is the reward value the death event carries. Elite score is
    // shaped HERE, exactly once; gamestate still applies headshot ×1.5 after.
    this.score = e ? Math.round(t.score * e.scoreMul) : t.score;
    this.scale = e ? t.scale * e.scaleMul : t.scale;
    this.attackRange = t.attackRange || ATTACK_RANGE; // crawler: 1.4 m
    this.bus = bus || new EventTarget();

    // Per-instance materials — the hurt flash and death fade mutate ONLY this
    // zombie's materials. Glowing eyes read in the dark without a light.
    const skin = new THREE.MeshLambertMaterial({ color: t.skin });
    const cloth = new THREE.MeshLambertMaterial({ color: t.cloth });
    const pants = new THREE.MeshLambertMaterial({ color: t.pants });
    const eyes = new THREE.MeshLambertMaterial({ color: 0x050505, emissive: 0xff2a18 });
    if (e) eyes.emissive.setHex(e.color); // elite tint: eyes glow the aura colour
    this._mats = [skin, cloth, pants, eyes];
    // Type-specific extra materials — per-instance like the base four and
    // added BEFORE the emissive snapshot so the hurt flash restores them.
    if (kind === "bloater") {
      // Toxic sack: green glow, visible in the dark without a light.
      this._mats.push(new THREE.MeshLambertMaterial({ color: 0x9fce4a, emissive: 0x3f7a12 }));
    } else if (kind === "armored") {
      this._mats.push(
        new THREE.MeshLambertMaterial({ color: 0x3a4046 }), // dark plating
        new THREE.MeshLambertMaterial({ color: 0x2a0a06, emissive: 0xff2a12 }) // visor
      );
    }
    // Emissive to restore after a hurt flash — the eyes keep their glow.
    this._baseEmissive = this._mats.map((m) => m.emissive.getHex());

    const geo = geometries();
    const g = new THREE.Group();
    g.rotation.order = "YXZ"; // yaw first, then the death tilt around local X
    g.scale.setScalar(this.scale); // type scale × elite scale
    const px = position && Number.isFinite(position.x) ? position.x : 0;
    const pz = position && Number.isFinite(position.z) ? position.z : 0;
    g.position.set(px, 0, pz); // feet on the floor
    this.group = g;
    this.position = g.position; // same Vector3 — mirrors the group by reference

    if (kind === "crawler") {
      this._buildCrawler(geo);
    } else {
      this._buildHumanoid(geo);
      if (kind === "bloater") this._buildBloater(geo);
      else if (kind === "armored") this._buildArmored(geo);
    }
    // Per-instance aura ring (geometry + material owned by this zombie).
    this._aura = null;
    if (e) this._buildAura(e);

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
    // Bloater/toxic burst support: the last player seen by update() (the death
    // can happen between frames, after the reference was stored) + the ring FX
    // list (a toxic bloater can legitimately own two rings at once).
    this._lastPlayer = null;
    /** @type {{mesh: THREE.Mesh, geo: THREE.BufferGeometry, mat: THREE.Material, radius: number, t: number, done: boolean}[]} */
    this._burstFx = [];

    // Gate pathing state (expansion C3): current {x, z} waypoint target or
    // null; _gateT is the replan countdown (0 → plan on the first update).
    this._gateT = 0;
    this._gateTarget = null;

    // Voice emit state (NIGHT 30 P2 §5.1, additive — no behavior change):
    // idle-moan countdown (6–14 s), chase-call cycle, pain throttle and the
    // one-shot alert arming flag. Bosses retune the cycles in _voiceTick.
    this._voiceIdleT = 6 + Math.random() * 8;
    this._voiceChaseT = 0;
    this._voicePainCd = 0;
    this._voiceAlertArmed = true;
  }

  // --- models ----------------------------------------------------------------

  /**
   * The classic humanoid (walker / runner / brute, and the base bosses build
   * on). Kept byte-identical to the pre-expansion constructor so boss models
   * and the hurt/death contract stay untouched.
   * @param {ReturnType<typeof geometries>} geo
   * @returns {void}
   */
  _buildHumanoid(geo) {
    const [skin, cloth, pants, eyes] = this._mats;
    const g = this.group;

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
    this._torsoMesh = torso;
    this._headMesh = head;
  }

  /**
   * Crawler: a dedicated low crawl — horizontal torso close to the ground,
   * head thrust forward, long arms planted ahead, short legs trailing back.
   * It does NOT reuse the humanoid silhouette; only the pivot names match so
   * death/fade/teardown stay identical.
   * @param {ReturnType<typeof geometries>} geo
   * @returns {void}
   */
  _buildCrawler(geo) {
    const [skin, cloth, pants, eyes] = this._mats;
    const g = this.group;

    // Short legs trail behind the hips (they never carry the body upright).
    const legLm = tagMesh(new THREE.Mesh(geo.crawlerLeg, pants), this, "body");
    legLm.position.y = -0.16;
    const legL = new THREE.Group();
    legL.position.set(-0.17, CRAWLER_TORSO_Y - 0.02, -0.4);
    legL.rotation.x = CRAWLER_LEG_REST;
    legL.add(legLm);
    const legRm = tagMesh(new THREE.Mesh(geo.crawlerLeg, pants), this, "body");
    legRm.position.y = -0.16;
    const legR = new THREE.Group();
    legR.position.set(0.17, CRAWLER_TORSO_Y - 0.02, -0.4);
    legR.rotation.x = CRAWLER_LEG_REST;
    legR.add(legRm);

    // Body pivot: the horizontal torso + head + forward-planted arms.
    const torso = tagMesh(new THREE.Mesh(geo.crawlerTorso, cloth), this, "body");
    torso.rotation.x = 0.08; // chest dips toward the ground
    const head = tagMesh(new THREE.Mesh(geo.crawlerHead, skin), this, "head");
    head.position.set(0, 0.06, 0.55); // pushed out in front (+Z = facing)
    const eyeL = tagMesh(new THREE.Mesh(geo.eye, eyes), this, "head");
    eyeL.position.set(-0.08, 0.1, 0.725);
    const eyeR = tagMesh(new THREE.Mesh(geo.eye, eyes), this, "head");
    eyeR.position.set(0.08, 0.1, 0.725);

    const armLm = tagMesh(new THREE.Mesh(geo.crawlerArm, skin), this, "body");
    armLm.position.y = -0.32;
    const armL = new THREE.Group();
    armL.position.set(-0.3, 0.02, 0.32);
    armL.rotation.x = CRAWLER_ARM_REST;
    armL.add(armLm);
    const armRm = tagMesh(new THREE.Mesh(geo.crawlerArm, skin), this, "body");
    armRm.position.y = -0.32;
    const armR = new THREE.Group();
    armR.position.set(0.3, 0.02, 0.32);
    armR.rotation.x = CRAWLER_ARM_REST;
    armR.add(armRm);

    const torsoPivot = new THREE.Group();
    torsoPivot.position.set(0, CRAWLER_TORSO_Y, 0);
    torsoPivot.add(torso, head, eyeL, eyeR, armL, armR);
    g.add(legL, legR, torsoPivot);

    this._legL = legL;
    this._legR = legR;
    this._armL = armL;
    this._armR = armR;
    this._torso = torsoPivot;
    this._torsoMesh = torso;
    this._headMesh = head;
  }

  /**
   * Bloater extras on top of the humanoid: bulging torso/limbs and a glowing
   * toxic sack. All meshes are tagged "body" (the head stays the only
   * headshot target, matching the base contract).
   * @param {ReturnType<typeof geometries>} geo
   * @returns {void}
   */
  _buildBloater(geo) {
    const sackMat = this._mats[4]; // pushed in the constructor
    this._torsoMesh.scale.set(1.75, 1.32, 1.45); // wide, bloated silhouette
    this._headMesh.scale.set(1.08, 1.06, 1.0); // wider head, depth keeps the eyes proud
    if (this._legL.children[0]) this._legL.children[0].scale.set(1.55, 1.05, 1.55);
    if (this._legR.children[0]) this._legR.children[0].scale.set(1.55, 1.05, 1.55);
    if (this._armL.children[0]) this._armL.children[0].scale.set(1.5, 0.9, 1.5);
    if (this._armR.children[0]) this._armR.children[0].scale.set(1.5, 0.9, 1.5);

    const sack = tagMesh(new THREE.Mesh(geo.bloaterSack, sackMat), this, "body");
    sack.position.set(0, 0.3, 0.12); // belly bulge in front of the chest
    sack.scale.set(1.25, 1.05, 1.0);
    const backSack = tagMesh(new THREE.Mesh(geo.bloaterSack, sackMat), this, "body");
    backSack.position.set(0, 0.34, -0.18);
    backSack.scale.set(0.85, 0.8, 0.75);
    this._torso.add(sack, backSack);
  }

  /**
   * Armored extras on top of the humanoid: dark chest plate, helmet, shoulder
   * pads and a slight red visor. Plates are "body", helmet/visor "head".
   * @param {ReturnType<typeof geometries>} geo
   * @returns {void}
   */
  _buildArmored(geo) {
    const metal = this._mats[4]; // pushed in the constructor
    const visorMat = this._mats[5];

    const plate = tagMesh(new THREE.Mesh(geo.armorPlate, metal), this, "body");
    plate.position.set(0, 0.32, 0.18); // over the chest, facing +Z
    const backPlate = tagMesh(new THREE.Mesh(geo.armorPlate, metal), this, "body");
    backPlate.position.set(0, 0.32, -0.18);
    backPlate.rotation.y = Math.PI;
    const pauldronL = tagMesh(new THREE.Mesh(geo.armorPauldron, metal), this, "body");
    pauldronL.position.set(-0.36, 0.62, 0);
    const pauldronR = tagMesh(new THREE.Mesh(geo.armorPauldron, metal), this, "body");
    pauldronR.position.set(0.36, 0.62, 0);
    this._torso.add(plate, backPlate, pauldronL, pauldronR);

    const helmet = tagMesh(new THREE.Mesh(geo.armorHelmet, metal), this, "head");
    helmet.position.set(0, 0.86, 0.02); // encases the base head mesh
    helmet.scale.set(1.15, 1.1, 1.15);
    const visor = tagMesh(new THREE.Mesh(geo.armorVisor, visorMat), this, "head");
    visor.position.set(0, 0.885, 0.215); // sits proud of the helmet front face
    this._torso.add(helmet, visor);
  }

  /**
   * Elite aura: a flat additive ring at the feet. Per-instance geometry and
   * material (the only safe way to dispose it with this zombie); it is NOT in
   * `_mats` because the hurt flash writes `emissive` and Basic materials have
   * no emissive property. Slow spin is applied in _animate.
   * @param {typeof ELITE_DEFS[keyof typeof ELITE_DEFS]} e
   * @returns {void}
   */
  _buildAura(e) {
    const geo = new THREE.RingGeometry(ELITE_AURA_INNER, ELITE_AURA_OUTER, 40);
    const mat = new THREE.MeshBasicMaterial({
      color: e.color,
      transparent: true,
      opacity: ELITE_AURA_OPACITY,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2; // lies flat on the ground
    // The group is scaled by this.scale; divide so the WORLD height stays ~0.06.
    mesh.position.y = ELITE_AURA_Y / this.scale;
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this._aura = { mesh, geo, mat };
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
    // Bloater burst contract: takeDamage/_die receive no player argument, so
    // the last LIVE player seen here is cached for the death burst. A dead or
    // absent player leaves the previous reference alone (the burst re-checks
    // player.alive before damaging).
    if (canChase) this._lastPlayer = player;
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

    // NIGHT 30 P2 §5.1: voice state machine (idle moan / alert / chase calls).
    // Reads only — it never touches the steering or animation state below.
    this._voiceTick(dt, canChase, dist, moved, ppos, level);

    // --- face the steering target (player, or the gate while pathing) -------
    if (canChase && tl > 1e-6) {
      const target = Math.atan2(tx, tz); // model faces +Z at yaw 0
      let dYaw = target - this.group.rotation.y;
      dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
      this.group.rotation.y += dYaw * Math.min(1, dt * 8);
    }

    // --- attack ---------------------------------------------------------------
    if (canChase && dist < this.attackRange && this.attackCd <= 0 && this._hasLineOfSight(ppos.x, ppos.z, level)) {
      this.attackCd = ATTACK_COOLDOWN;
      this.attackAnimT = ATTACK_ANIM;
      this._voiceEmit("attack"); // NIGHT 30 P2 §5.1: voice at the swing
      if (typeof player.damage === "function") player.damage(this.dmg);
    }

    // --- walk animation driven by the distance actually travelled ------------
    this.gait += ((moved > 1e-4 ? 1 : 0) - this.gait) * Math.min(1, dt * 6);
    // Crawler scuttles: the same travel feeds a much faster gait cycle.
    this.walkPhase += moved * (this.type === "crawler" ? GAIT_RATE * CRAWLER_GAIT_MUL : GAIT_RATE);
    this._animate(dt);
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

  // --- NIGHT 30 P2 §5.1: voice emit helpers (additive) ------------------------

  /**
   * Emit one "zombie-voice" event (P2-K16 payload shape). audio.js owns all
   * synthesis + 3D mixing — this only announces WHAT to play and WHERE.
   * @param {"idle"|"alert"|"chase"|"attack"|"pain"|"death"} kind
   * @returns {void}
   */
  _voiceEmit(kind) {
    if (!this.bus || typeof this.bus.dispatchEvent !== "function") return;
    this.bus.dispatchEvent(
      new CustomEvent("zombie-voice", {
        detail: { kind, type: this.type, position: this.position.clone() },
      })
    );
  }

  /** Idle-moan period: 6–14 s; ×1.5 for boss subclasses (9–21 s, P2 §5.2). */
  _voiceIdleSpan() {
    const base = 6 + Math.random() * 8;
    return VOICE_CHASE_CYCLE[this.type] ? base : base * VOICE_BOSS_SCALE;
  }

  /** Chase-call period: walker 2.4 / runner 1.3 / brute 3.2 s; bosses ×1.5. */
  _voiceChaseSpan() {
    const base = VOICE_CHASE_CYCLE[this.type] || VOICE_CHASE_CYCLE.brute;
    return VOICE_CHASE_CYCLE[this.type] ? base : base * VOICE_BOSS_SCALE;
  }

  /**
   * Voice state machine, called from update() once movement is resolved.
   * Purely additive: reads state, throttles, emits bus events — it never
   * writes anything the steering/animation/collision paths consume.
   * @param {number} dt - seconds
   * @param {boolean} canChase - false while the player is dead/absent
   * @param {number} dist - XZ distance to the player (Infinity when !canChase)
   * @param {number} moved - metres moved this frame (part of the §5.1
   *   signature — the spitter call site passes it too; unused today)
   * @param {import("three").Vector3|null} ppos - player position (may be null)
   * @param {import("../world/level.js").Level|null} level - for LOS checks
   * @returns {void}
   */
  _voiceTick(dt, canChase, dist, moved, ppos, level) {
    if (this._voicePainCd > 0) this._voicePainCd -= dt; // takeDamage has no dt

    // idle: a random 6–14 s moan while alive; DEFERRED while chasing close
    // (dist < 30) so idle and chase calls never overlap (contract §5.1).
    this._voiceIdleT -= dt;
    if (this._voiceIdleT <= 0 && (!canChase || dist >= VOICE_CHASE_RANGE)) {
      this._voiceIdleT = this._voiceIdleSpan();
      this._voiceEmit("idle");
    }

    // alert: one growl per approach — close + line of sight; re-arms once the
    // player falls far away again (or is gone).
    if (!canChase || dist > VOICE_ALERT_REARM) {
      this._voiceAlertArmed = true;
    } else if (
      this._voiceAlertArmed &&
      dist < VOICE_ALERT_RANGE &&
      ppos &&
      this._hasLineOfSight(ppos.x, ppos.z, level)
    ) {
      this._voiceAlertArmed = false;
      this._voiceEmit("alert");
    }

    // chase: periodic calls while actively running the player down.
    if (canChase && dist < VOICE_CHASE_RANGE && this.gait > 0.5) {
      this._voiceChaseT += dt;
      if (this._voiceChaseT >= this._voiceChaseSpan()) {
        this._voiceChaseT = 0;
        this._voiceEmit("chase");
      }
    } else {
      this._voiceChaseT = 0;
    }
  }

  /**
   * @param {number} d - damage amount
   * @param {boolean} headshot - true when the hit landed on the head (x2 already applied by combat)
   * @returns {boolean} true if this damage killed the zombie
   */
  takeDamage(d, headshot) {
    if (!this.alive) return false;
    let n = Number(d);
    if (!Number.isFinite(n) || n <= 0) return false; // weird input: ignore
    // Armored plating: body hits lose 35% BEFORE the hp subtraction; a
    // headshot goes through at full damage (the multiplier is already in `d`).
    if (this.type === "armored" && headshot !== true) n *= ARMORED_BODY_MULT;
    // Elite Ironhide: another −20% on BODY hits only. It stacks with armored
    // (×0.65 × 0.8 = ×0.52); headshots bypass BOTH reductions.
    if (this.elite === "ironhide" && headshot !== true) n *= IRONHIDE_BODY_MULT;
    this.hp -= n;
    // Hurt flash — per-instance materials; NO sound here (combat.js owns it).
    this.flashT = FLASH_TIME;
    for (let i = 0; i < this._mats.length; i++) this._mats[i].emissive.setHex(0xd02020);
    // NIGHT 30 P2 (§5.1, P2-K4): the pain voice is a BUS EVENT, not a direct
    // sound — the rule above still holds (combat.js owns hit audio; one
    // shotgun blast = 8 takeDamage calls). Throttled to ≥ 0.4 s per zombie
    // (counted down in _voiceTick) and skipped on the killing blow — the
    // death voice covers that moment, so a kill never stacks two voices.
    if (this.hp > 0 && this._voicePainCd <= 0) {
      this._voicePainCd = VOICE_PAIN_CD;
      this._voiceEmit("pain");
    }
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
  _animate(dt = 0) {
    // Elite aura: slow spin in its own plane (local Z after the flat X tilt).
    if (this._aura) this._aura.mesh.rotation.z += dt * ELITE_AURA_SPIN;
    if (this.type === "crawler") {
      this._animateCrawler();
      return;
    }
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
    // Bloater lumber: a slow side-to-side sway from the same gait phase.
    this._torso.rotation.z = this.type === "bloater" ? 0.07 * s * this.gait : 0;
  }

  /**
   * Crawler scuttle: fast alternating arm/leg kicks, a low body bob and a
   * small lateral sway. Uses the same walkPhase the base update advances
   * (×2.2 rate) — safe for every crawler instance, alive or dying (death
   * stops calling _animate, like every other type).
   * @returns {void}
   */
  _animateCrawler() {
    const s = Math.sin(this.walkPhase);
    const swing = 0.85 * this.gait;
    // Arms stay planted forward and alternate; attack = a deeper forward lunge.
    let armBase = CRAWLER_ARM_REST;
    if (this.attackAnimT > 0) {
      const p = 1 - this.attackAnimT / ATTACK_ANIM;
      armBase -= 0.55 * Math.sin(p * Math.PI); // lunge at the player
    }
    this._armL.rotation.x = armBase + s * swing;
    this._armR.rotation.x = armBase - s * swing;
    // Short legs kick up/down behind the body.
    const legSwing = 0.5 * this.gait;
    this._legL.rotation.x = CRAWLER_LEG_REST - s * legSwing;
    this._legR.rotation.x = CRAWLER_LEG_REST + s * legSwing;
    // Low profile: gentle chest dip + fast bob; the torso never rises.
    this._torso.rotation.x =
      0.12 + 0.08 * this.gait * Math.sin(this.walkPhase * 2) + (armBase - CRAWLER_ARM_REST) * 0.25;
    this._torso.rotation.z = 0.06 * s * this.gait;
    this._torso.position.y = CRAWLER_TORSO_Y + 0.05 * this.gait * Math.abs(Math.cos(this.walkPhase));
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
            // Elite score is already ×eliteScoreMul (applied once in the
            // constructor); gamestate applies the x1.5 headshot AFTER this.
            score: this.score,
            headshot,
            position: this.position.clone(), // pre-sink death spot
            elite: this.elite,
            eliteMoneyMul: this.eliteMoneyMul,
            eliteScoreMul: this.eliteScoreMul,
          },
        })
      );
    }
    this._voiceEmit("death"); // NIGHT 30 P2 §5.1: right after "zombie-killed"
    // Bloater: the toxic sack ruptures on death — damage + bus event + ring.
    // Runs after the kill announcement so listeners see the kill first.
    if (this.type === "bloater") this._burst();
    // Toxic elite: its own smaller burst, same machinery/ring path.
    if (this.elite === "toxic") this._toxicBurst();
  }

  /**
   * Bloater death burst: 25 damage to a player within 4 m (using the last
   * live player reference cached by update()), one "bloater-burst"
   * {position, radius, damage} bus event, and a flat green ring that expands
   * and fades over 1.2 s (stepped by _deathStep, disposed in _teardown).
   * @returns {void}
   */
  _burst() {
    this._applyBurstDamage(BLOATER_BURST_RADIUS, BLOATER_BURST_DMG);
    this._emitBurst("bloater-burst", BLOATER_BURST_RADIUS, BLOATER_BURST_DMG, null);
    this._spawnBurstRing(BLOATER_BURST_RADIUS, 0x8dff5a, 0x2f8a12);
  }

  /**
   * Toxic elite death burst: 15 damage within 2.5 m, "elite-burst"
   * {position, radius, damage, kind} and the same green ring machinery.
   * @returns {void}
   */
  _toxicBurst() {
    this._applyBurstDamage(TOXIC_BURST_RADIUS, TOXIC_BURST_DMG);
    this._emitBurst("elite-burst", TOXIC_BURST_RADIUS, TOXIC_BURST_DMG, "toxic");
    this._spawnBurstRing(TOXIC_BURST_RADIUS, 0x8dff5a, 0x2f8a12);
  }

  /**
   * Shared radial burst damage against the cached live player.
   * @param {number} radius - XZ radius in metres
   * @param {number} damage - applied once when the player is inside
   * @returns {void}
   */
  _applyBurstDamage(radius, damage) {
    const player = this._lastPlayer;
    if (
      !player ||
      !player.position ||
      player.alive === false ||
      typeof player.damage !== "function"
    ) {
      return;
    }
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    if (dx * dx + dz * dz <= radius * radius) player.damage(damage);
  }

  /**
   * Shared burst announcement; `kind` is null for the bloater event (its
   * frozen payload has no kind field).
   * @param {string} name - bus event name
   * @param {number} radius
   * @param {number} damage
   * @param {string|null} kind - elite kind for "elite-burst"
   * @returns {void}
   */
  _emitBurst(name, radius, damage, kind) {
    if (!this.bus || typeof this.bus.dispatchEvent !== "function") return;
    const detail = { position: this.position.clone(), radius, damage };
    if (kind) detail.kind = kind;
    this.bus.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /**
   * Per-instance burst ring (geometry/material disposed in _teardown). Rings
   * are tracked in a list because a toxic bloater can own two at once.
   * @param {number} radius - world radius the ring expands to
   * @param {number} color - surface colour
   * @param {number} emissive - glow colour
   * @returns {void}
   */
  _spawnBurstRing(radius, color, emissive) {
    if (!this._scene) return;
    const ringGeo = new THREE.RingGeometry(0.82, 1.0, 40);
    const ringMat = new THREE.MeshLambertMaterial({
      color,
      emissive,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(ringGeo, ringMat);
    mesh.rotation.x = -Math.PI / 2; // lies flat on the ground
    mesh.position.set(this.position.x, 0.05, this.position.z);
    mesh.scale.setScalar(BLOATER_RING_START);
    mesh.renderOrder = 1;
    this._scene.add(mesh);
    this._burstFx.push({ mesh, geo: ringGeo, mat: ringMat, radius, t: 0, done: false });
  }

  /** Advance every burst ring (~1.2 s expand + fade); safe when empty. */
  _burstStep(dt) {
    const list = this._burstFx;
    for (let i = 0; i < list.length; i++) {
      const fx = list[i];
      if (!fx || fx.done) continue;
      fx.t += dt;
      const p = Math.min(1, fx.t / BLOATER_BURST_TIME);
      fx.mesh.scale.setScalar(BLOATER_RING_START + (fx.radius - BLOATER_RING_START) * p);
      fx.mat.opacity = 0.9 * (1 - p);
      if (p >= 1) {
        fx.done = true;
        fx.mesh.visible = false;
        if (fx.mesh.parent) fx.mesh.parent.remove(fx.mesh);
      }
    }
  }

  /** Fall ~90° around local X, sink below the floor, fade — over 1.5 s. */
  _deathStep(dt) {
    this._burstStep(dt); // burst rings ride the corpse
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
    if (this._aura) {
      // Counter the corpse tilt so the ring stays flat, then fade with it.
      this._aura.mesh.rotation.x = -Math.PI / 2 - this.group.rotation.x;
      this._aura.mat.opacity = ELITE_AURA_OPACITY * op;
    }
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
    this._clearBurstFx();
    this._clearAura();
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
    for (let i = 0; i < this._mats.length; i++) this._mats[i].dispose();
    this._mats.length = 0;
    // Shared geometries stay alive on purpose — other instances still use them.
  }

  /**
   * Elite aura cleanup: remove the mesh from the group and dispose ITS
   * geometry + material (per-instance by design, like the burst rings).
   * Idempotent.
   * @returns {void}
   */
  _clearAura() {
    const aura = this._aura;
    if (!aura) return;
    this._aura = null;
    if (aura.mesh && aura.mesh.parent) aura.mesh.parent.remove(aura.mesh);
    if (aura.geo) aura.geo.dispose();
    if (aura.mat) aura.mat.dispose();
  }

  /**
   * Burst FX cleanup: remove every ring mesh and dispose ITS geometry +
   * material. Per-instance by design, so disposing here cannot affect another
   * zombie. Idempotent.
   * @returns {void}
   */
  _clearBurstFx() {
    const list = this._burstFx;
    if (!list || list.length === 0) return;
    this._burstFx = [];
    for (let i = 0; i < list.length; i++) {
      const fx = list[i];
      if (!fx) continue;
      if (fx.mesh && fx.mesh.parent) fx.mesh.parent.remove(fx.mesh);
      if (fx.geo) fx.geo.dispose();
      if (fx.mat) fx.mat.dispose();
    }
  }
}
