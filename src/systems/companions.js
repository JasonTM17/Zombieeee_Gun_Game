/**
 * ============================================================================
 * COMPANIONS — Mai and Eli, the rescued survivors who join the fight.
 * ============================================================================
 * Up to TWO friendly fire-support allies. Nobody exists until the first
 * "survivor-rescued" event of a run (events.js emits {x, z}): Mai spawns at
 * the rescue site (or beside the player when the payload has no position) and
 * follows the player for the rest of the run. The SECOND rescue brings Eli in
 * as a tier-1 ally; the THIRD and later rescues upgrade both allies to tier 2
 * and heal them. There is never a third ally.
 *
 * WHAT THIS MODULE OWNS
 * - Two low-poly humanoids clearly distinct from the zombies and from each
 *   other: upright silhouettes, no glowing eyes, no PointLight, no new shadow
 *   light. Mai keeps her warm orange jacket + teal panels, beanie, backpack,
 *   hanging lantern and compact pistol. Eli wears a blue jacket with amber
 *   panels, a cap, a larger olive backpack with a bedroll, a shoulder lamp and
 *   a long scoped rifle. Both carry one emissive weapon light; all glow is
 *   emissive MeshBasicMaterial only.
 * - ONE canvas-texture Sprite nameplate per ally ("MAI — ALLY" /
 *   "MAI — ĐỒNG ĐỘI", "ELI — ALLY" / "ELI — ĐỒNG ĐỘI" through i18n), visible
 *   within 28 m and faded 28 → 40 m.
 * - Follow AI: Mai holds a 3.4 m slot on the player's RIGHT, Eli the 3.4 m slot
 *   on the LEFT. Each approaches radially to the 3.4 m ring, then travels
 *   AROUND the player to its own slot instead of cutting through them; when
 *   the player closes inside 3 m an ally eases back out to the ring. A short
 *   ally–ally separation term keeps the two from overlapping, and movement
 *   slides along level colliders with axis-separated `level.isBlocked` tests,
 *   exactly like the player and zombies. Allies have NO collider and never
 *   block the player, zombies, or bullets (their meshes carry no
 *   userData.solid / .zombie / .part, so combat.js passes pellets through).
 *   Walk is 4.4 m/s; beyond 8 m an ally sprints at 7.8 m/s.
 * - Combat, per ally and fully independent:
 *     Mai: pistol, 25 dmg / 1.1 s, 20 m  → tier 2: 35 dmg / 1.0 s.
 *     Eli: rifle,  30 dmg / 1.4 s, 24 m  → tier 2: 42 dmg / 1.2 s.
 *   Each picks the live zombie nearest the PLAYER among those within its own
 *   range with a clear sampled line of sight, deals damage with no headshot,
 *   spawns sparks at the muzzle and the target, and emits "companion-shot"
 *   {target, damage}. Eli prefers a different target than Mai when another
 *   valid zombie is available. A blocked/no-target scan retries at 5 Hz.
 * - Health per ally: 120 HP, +2 HP/s after 8 s without damage. Zombie melee
 *   never touches allies (zombie.js is untouched and has no ally target). The
 *   ONLY damage intake is explosion splash, using the explosives.js contract
 *   (4 m radius, 90 damage at the center, linear falloff). At 0 HP the ally
 *   kneels (no death) for 12 s, then self-revives at 50% HP (60). HP, down
 *   timer, regen and revive are all per ally.
 * - Tier badges: one small chest badge per ally, hidden until tier 2.
 *
 * BUS CONTRACT
 * Consumed:
 *   "survivor-rescued" {x, z} — 1st: Mai; 2nd: Eli; 3rd+: heal both + tier 2.
 *   "explosion" {position}    — splash damage (4 m, linear 90 → 0), per ally.
 *   "settings-changed" {patch} — patch.lang → redraw both nameplates.
 *   "ui-play" | "ui-play-free" | "ui-restart" | "ui-quit" | "ui-endless" |
 *   "mission-reset"            — defensive fresh-run reset (idempotent with
 *                                the integrator's freshRun reset).
 * Emitted:
 *   "companion-joined" {name, tier} — once per ally when it spawns.
 *   "companion-down"   {name, x, z} — per ally when it reaches 0 HP.
 *   "companion-shot"   {target, damage} — target is the live Zombie; each
 *     ally owns ONE event/detail pair that is REUSED per shot for zero
 *     steady-state garbage, so listeners must read synchronously (same
 *     precedent as "footstep").
 *
 * PERFORMANCE
 * - Two models built lazily on their first spawn, then reused by later runs:
 *   each is 1 merged body + 2 legs + 2 arms + 1 merged weapon + torch + one
 *   extra emissive mesh + badge + 1 Sprite ≈ 11 visible draw calls. One shared
 *   vertex-colour material per ally for body/limbs.
 * - update() allocates nothing: scratch Vector3s, module-level right heading,
 *   two pre-built shot events, zero arrays, zero closures. Only the rare
 *   join/down/shot events allocate (events, not frame state).
 * - No per-frame canvas writes. Nameplates redraw only on language change.
 * - update() is called ONLY from the integrator's playing branch; the module
 *   has no clock of its own, so pause/menu freeze it naturally.
 *
 * WIRING (main.js — NOT edited by this task)
 *   import { createCompanion } from "./systems/companions.js";
 *   const companion = createCompanion(
 *     scene, bus, level, zombies, particles, player, camera
 *   );
 *   // playing branch, after survivors.update(dt, player.position):
 *   companion.update(dt, player.position);
 *   // freshRun(), next to the other world resets:
 *   companion.reset();
 *
 * @param {import("three").Scene} scene
 * @param {EventTarget} bus - shared bus from src/systems/gamestate.js
 * @param {import("../world/level.js").Level} level - isBlocked
 * @param {import("../zombies/zombie.js").Zombie[]} zombies - live shared array
 * @param {import("./particles.js").Particles} particles
 * @param {import("../player/controller.js").Player} player
 * @param {import("three").Camera=} camera - optional; drives the right-offset
 *   heading. Without it the player's velocity (or world +X) is the fallback.
 * @returns {{update: (dt: number, playerPos?: {x: number, z: number}) => void,
 *   state: () => {active: boolean, hp: number, maxHp: number, tier: number,
 *     x: number, z: number, shots: number,
 *     allies: Array<{name: string, hp: number, maxHp: number, tier: number,
 *       x: number, z: number, shots: number}>},
 *   reset: () => void}}
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as i18nModule from "../core/i18n.js";

// --- i18n (EN + VI) ---------------------------------------------------------

const BUNDLE = {
  en: {
    companion_mai_plate: "MAI — ALLY",
    companion_eli_plate: "ELI — ALLY",
  },
  vi: {
    companion_mai_plate: "MAI — ĐỒNG ĐỘI",
    companion_eli_plate: "ELI — ĐỒNG ĐỘI",
  },
};

i18nModule.registerBundle(BUNDLE);

// --- tunables ---------------------------------------------------------------

const MAX_HP = 120;
const REGEN_DELAY = 8; // s without damage before regen starts
const REGEN_RATE = 2; // HP/s
const DOWN_TIME = 12; // s kneeling before the self-revive
const REVIVE_FRACTION = 0.5; // 60 HP
const FOLLOW_NEAR = 3; // idle if already in the slot + player still, inside 3 m
const FOLLOW_FAR = 8; // farther than this → sprint
const FOLLOW_OFFSET = 3.4; // preferred slot, metres to the player's side
const WALK_SPEED = 4.4; // m/s (player walks 4.5)
const SPRINT_SPEED = 7.8; // m/s (beats the player's 7.2 sprint)
const ACCEL = 10; // 1/s speed smoothing
const TURN_RATE = 11; // rad/s facing
const COMPANION_RADIUS = 0.38; // collision circle used for isBlocked tests
const ALLY_GAP = 1.4; // minimum ally–ally distance before separation kicks in
const ALLY_GAP_FORCE = 1.15; // separation steering weight
const SPAWN_GAP = 1.3; // never spawn this close to the other ally
const RETRY_COOLDOWN = 0.2; // s between scans when no valid target
const LOS_STEP = 0.5; // m between line-of-sight samples
const LOS_RADIUS = 0.15; // sample radius (zombie._hasLineOfSight parity)
const AIM_HOLD = 0.6; // s an ally keeps facing a fired-at target
const NAMEPLATE_NEAR = 28; // full opacity inside this distance
const NAMEPLATE_FAR = 40; // hidden beyond
const EXPLOSION_RADIUS = 4; // explosives.js spec
const EXPLOSION_DAMAGE = 90; // at the center, linear to 0 at the edge
const TAU = Math.PI * 2;

// --- palettes ---------------------------------------------------------------

// Warm jacket palette for Mai. Values are flat vertex colours.
const MAI_PALETTE = {
  jacket: 0xd9712a,
  jacketDark: 0xa94f1a,
  accent: 0x2f9188,
  accentDark: 0x1d5f5a,
  jeans: 0x2c3a44,
  jeansDark: 0x222d35,
  boot: 0x1b1815,
  skin: 0xc08a63,
  skinDark: 0xa9754f,
  hair: 0x1f1712,
  pack: 0x4b5a3d,
  packDark: 0x303a27,
  belt: 0x2a2119,
  strap: 0x3a2f22,
  metal: 0x252a2e,
  metalDark: 0x171b1e,
  metalLight: 0x3a4045,
  stock: 0x5a3a20,
  cap: 0x2f9188,
  capDark: 0x1d5f5a,
};

// Cool jacket palette for Eli. Blue + amber, olive pack, dark cap.
const ELI_PALETTE = {
  jacket: 0x35506e,
  jacketDark: 0x24384f,
  accent: 0xc98a3c,
  accentDark: 0x8a5f2c,
  jeans: 0x2b3037,
  jeansDark: 0x20242a,
  boot: 0x15181b,
  skin: 0xb98b66,
  skinDark: 0x9d7454,
  hair: 0x2a211a,
  pack: 0x4d5334,
  packDark: 0x333a22,
  belt: 0x241f18,
  strap: 0x3a2f22,
  metal: 0x252a2e,
  metalDark: 0x171b1e,
  metalLight: 0x3a4045,
  stock: 0x5a3a20,
  cap: 0x2e3a48,
  capDark: 0x1e2731,
};

/**
 * Ally definitions. `side` is the follow-slot sign on the player-right axis
 * (Mai +1 = right, Eli −1 = left). Weapon numbers are per tier.
 * @type {Array<{id: string, name: string, plateKey: string, side: number,
 *   range: number, cooldown1: number, cooldown2: number, damage1: number,
 *   damage2: number, weapon: "pistol"|"rifle", muzzleForward: number,
 *   muzzleRight: number, glow: [number, number, number], badgeColor: number,
 *   palette: Object}>}
 */
const ALLY_DEFS = [
  {
    id: "mai",
    name: "Mai",
    plateKey: "companion_mai_plate",
    side: 1,
    range: 20,
    cooldown1: 1.1,
    cooldown2: 1.0,
    damage1: 25,
    damage2: 35,
    weapon: "pistol",
    muzzleForward: 0.74,
    muzzleRight: 0.22,
    glow: [1, 0.78, 0.44],
    badgeColor: 0x64f0d6,
    palette: MAI_PALETTE,
  },
  {
    id: "eli",
    name: "Eli",
    plateKey: "companion_eli_plate",
    side: -1,
    range: 24,
    cooldown1: 1.4,
    cooldown2: 1.2,
    damage1: 30,
    damage2: 42,
    weapon: "rifle",
    muzzleForward: 1.1,
    muzzleRight: 0.24,
    glow: [0.62, 0.84, 1],
    badgeColor: 0xffc35a,
    palette: ELI_PALETTE,
  },
];

// --- build-time helpers ------------------------------------------------------

/** Flat per-vertex colour (city.js / survivors.js pattern). */
function tintGeo(geo, hex) {
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  const colour = new THREE.Color(hex);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = colour.r;
    arr[i * 3 + 1] = colour.g;
    arr[i * 3 + 2] = colour.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Tinted, translated box for a merge bucket. */
function pushBox(bucket, sx, sy, sz, x, y, z, hex) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  geo.translate(x, y, z);
  bucket.push(tintGeo(geo, hex));
}

/** Merge a bucket and dispose the sources (survivors.js pattern). */
function mergeBucket(geos) {
  const merged = mergeGeometries(geos, false);
  for (let i = 0; i < geos.length; i++) geos[i].dispose();
  return merged;
}

/** Rounded rect path without ctx.roundRect (older browsers). */
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
  ctx.lineTo(x + rr, y + h);
  ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + rr);
  ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

/**
 * Nameplate canvas: dark pill, teal border, centred name. Returns null
 * headless (no document) so the module degrades to animation only.
 * @param {string} text
 * @returns {THREE.CanvasTexture|null}
 */
function makeNameplateTexture(text) {
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    return null;
  }
  const W = 512;
  const H = 128;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, W, H);
  const pillW = W - 24;
  const x = (W - pillW) / 2;
  roundRectPath(ctx, x, 24, pillW, 80, 36);
  ctx.fillStyle = "rgba(7, 14, 16, 0.80)";
  ctx.fill();
  ctx.strokeStyle = "rgba(90, 232, 208, 0.70)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = "600 46px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = "#dcfff8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Shortest-path angle step (no allocation). */
function turnToward(current, target, maxDelta) {
  let d = (target - current + Math.PI) % TAU;
  if (d < 0) d += TAU;
  d -= Math.PI;
  if (d > maxDelta) d = maxDelta;
  else if (d < -maxDelta) d = -maxDelta;
  return current + d;
}

// --- factory -----------------------------------------------------------------

/**
 * @param {import("three").Scene} scene
 * @param {EventTarget} bus
 * @param {import("../world/level.js").Level} level
 * @param {import("../zombies/zombie.js").Zombie[]} zombies
 * @param {import("./particles.js").Particles} particles
 * @param {import("../player/controller.js").Player} player
 * @param {import("three").Camera=} camera
 */
export function createCompanion(scene, bus, level, zombies, particles, player, camera) {
  const tr = (key) => {
    try {
      return i18nModule.t(key);
    } catch {
      return key;
    }
  };

  /** @param {typeof ALLY_DEFS[number]} def */
  function makeAlly(def) {
    const shotDetail = { target: null, damage: 0 };
    return {
      def,
      nameText: tr(def.plateKey),
      // run state (per ally)
      active: false,
      hp: MAX_HP,
      tier: 1,
      shots: 0,
      x: 0,
      z: 0,
      yaw: 0,
      speed: 0,
      gait: 0,
      walkPhase: 0,
      lanternPhase: 0,
      shotCd: 0,
      sinceDamage: REGEN_DELAY,
      downed: false,
      downT: 0,
      downBlend: 0,
      aimT: 0,
      aimX: 0,
      aimZ: 0,
      target: null,
      // model handles (built lazily, then reused across runs)
      built: false,
      attached: false,
      group: null,
      pose: null,
      legL: null,
      legR: null,
      armL: null,
      armR: null,
      badge: null,
      sprite: null,
      glowMat: null,
      // reusable shot event (zero steady-state garbage per ally)
      shotDetail,
      shotEvent:
        typeof CustomEvent === "function"
          ? new CustomEvent("companion-shot", { detail: shotDetail })
          : null,
    };
  }

  // Two fixed records — never added to or replaced, so update() is allocation-free.
  const allies = [makeAlly(ALLY_DEFS[0]), makeAlly(ALLY_DEFS[1])];

  // --- run state -------------------------------------------------------------
  let rescues = 0;
  let rightX = 1;
  let rightZ = 0;
  let goalX = 0;
  let goalZ = 0;
  let lastPx = 0;
  let lastPz = 0;

  // --- reusable math ---------------------------------------------------------
  const tmpMuzzle = new THREE.Vector3();
  const tmpHit = new THREE.Vector3();

  function otherAlly(a) {
    return a === allies[0] ? allies[1] : allies[0];
  }

  function emit(name, detail) {
    if (!bus || typeof bus.dispatchEvent !== "function") return;
    if (typeof CustomEvent !== "function") return;
    bus.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function blockedAt(px, pz, r) {
    return !!(
      level &&
      typeof level.isBlocked === "function" &&
      level.isBlocked(px, pz, r)
    );
  }

  /** True when a spawn/goal spot is clear of geometry AND the other ally. */
  function spotFree(a, gx, gz) {
    if (blockedAt(gx, gz, COMPANION_RADIUS)) return false;
    const o = otherAlly(a);
    if (!o.active) return true;
    const dx = gx - o.x;
    const dz = gz - o.z;
    return dx * dx + dz * dz >= SPAWN_GAP * SPAWN_GAP;
  }

  // --- nameplates ------------------------------------------------------------
  /** @param {ReturnType<typeof makeAlly>} a */
  function makeSprite(a) {
    if (typeof document === "undefined" || typeof document.createElement !== "function") {
      return null;
    }
    const tex = makeNameplateTexture(a.nameText);
    if (!tex) return null;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      fog: false,
    });
    const s = new THREE.Sprite(mat);
    s.name = "companion-nameplate-" + a.def.id;
    s.renderOrder = 6;
    s.visible = false;
    const scale = Math.max(2.0, Math.min(3.8, a.nameText.length * 0.15 + 1.0));
    s.scale.set(scale, 0.62, 1);
    return s;
  }

  /** @param {ReturnType<typeof makeAlly>} a */
  function rebuildNameplate(a) {
    if (!a.sprite) return;
    const tex = makeNameplateTexture(a.nameText);
    if (!tex) return;
    const old = a.sprite.material.map;
    a.sprite.material.map = tex;
    a.sprite.material.needsUpdate = true;
    if (old) old.dispose();
    const scale = Math.max(2.0, Math.min(3.8, a.nameText.length * 0.15 + 1.0));
    a.sprite.scale.set(scale, 0.62, 1);
  }

  // --- model -----------------------------------------------------------------
  /** @param {ReturnType<typeof makeAlly>} a */
  function buildModel(a) {
    if (a.built) return;
    a.built = true;
    const def = a.def;
    const p = def.palette;
    const rifle = def.weapon === "rifle";

    const group = new THREE.Group();
    group.name = "companion-" + def.id;
    const pose = new THREE.Group();
    group.add(pose);
    a.group = group;
    a.pose = pose;

    // One vertex-colour material for body + legs + arms.
    const clothMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.03,
    });

    // -- torso / head / backpack (merged into one draw call) -----------------
    const bodyGeos = [];
    pushBox(bodyGeos, 0.44, 0.2, 0.26, 0, 0.9, 0, p.jeans);
    pushBox(bodyGeos, 0.46, 0.07, 0.28, 0, 0.99, 0, p.belt);
    pushBox(bodyGeos, 0.5, 0.6, 0.3, 0, 1.3, 0, p.jacket);
    pushBox(bodyGeos, 0.26, 0.36, 0.02, 0, 1.32, 0.155, p.accent); // chest panel
    pushBox(bodyGeos, 0.5, 0.1, 0.31, 0, 1.58, 0, p.accentDark); // collar band
    pushBox(bodyGeos, 0.09, 0.42, 0.02, -0.18, 1.3, 0.155, p.jacketDark);
    pushBox(bodyGeos, 0.09, 0.42, 0.02, 0.18, 1.3, 0.155, p.jacketDark);
    pushBox(bodyGeos, 0.13, 0.09, 0.13, 0, 1.64, 0, p.skin); // neck
    pushBox(bodyGeos, 0.25, 0.27, 0.25, 0, 1.81, 0, p.skin); // head
    pushBox(bodyGeos, 0.05, 0.05, 0.04, 0, 1.8, 0.135, p.skinDark); // nose
    for (const side of [-1, 1]) {
      pushBox(bodyGeos, 0.045, 0.03, 0.02, side * 0.06, 1.845, 0.13, p.hair); // eye
      pushBox(bodyGeos, 0.06, 0.58, 0.33, side * 0.3, 1.28, 0, p.jacketDark); // side seam
      pushBox(bodyGeos, 0.16, 0.1, 0.32, side * 0.3, 1.56, 0, p.accent); // shoulder patch
      pushBox(bodyGeos, 0.055, 0.5, 0.045, side * 0.15, 1.32, 0.16, p.strap); // strap
      pushBox(bodyGeos, 0.1, 0.12, 0.08, side * 0.21, 0.96, 0.15, p.packDark); // pouch
    }

    if (rifle) {
      // Eli: flat cap + beard + chest rig + oversized pack with a bedroll.
      pushBox(bodyGeos, 0.27, 0.09, 0.27, 0, 1.96, 0, p.cap);
      pushBox(bodyGeos, 0.29, 0.035, 0.14, 0, 1.915, 0.12, p.capDark);
      pushBox(bodyGeos, 0.2, 0.08, 0.04, 0, 1.72, 0.13, p.hair); // beard
      pushBox(bodyGeos, 0.3, 0.07, 0.08, 0, 1.17, 0.16, p.strap); // chest rig
      pushBox(bodyGeos, 0.09, 0.11, 0.07, -0.12, 1.17, 0.19, p.packDark);
      pushBox(bodyGeos, 0.09, 0.11, 0.07, 0.12, 1.17, 0.19, p.packDark);
      pushBox(bodyGeos, 0.42, 0.5, 0.26, 0, 1.3, -0.26, p.pack);
      pushBox(bodyGeos, 0.44, 0.1, 0.28, 0, 1.55, -0.26, p.packDark);
      pushBox(bodyGeos, 0.52, 0.13, 0.16, 0, 1.63, -0.26, p.packDark); // bedroll
    } else {
      // Mai: beanie + fringe + her original backpack.
      pushBox(bodyGeos, 0.26, 0.09, 0.26, 0, 1.96, 0, p.cap);
      pushBox(bodyGeos, 0.27, 0.04, 0.27, 0, 1.91, 0, p.capDark);
      pushBox(bodyGeos, 0.26, 0.08, 0.05, 0, 1.81, 0.125, p.hair); // fringe
      pushBox(bodyGeos, 0.38, 0.46, 0.22, 0, 1.3, -0.24, p.pack);
      pushBox(bodyGeos, 0.4, 0.1, 0.24, 0, 1.53, -0.24, p.packDark);
      pushBox(bodyGeos, 0.3, 0.14, 0.16, 0, 1.2, -0.37, p.packDark);
    }

    let bodyGeo = mergeBucket(bodyGeos);
    if (!bodyGeo) {
      bodyGeo = tintGeo(new THREE.BoxGeometry(0.5, 0.6, 0.3), p.jacket);
      bodyGeo.translate(0, 1.3, 0);
    }
    const body = new THREE.Mesh(bodyGeo, clothMat);
    body.castShadow = false; // companion: small NPC, no shadow-map draw
    body.receiveShadow = true;
    pose.add(body);

    // -- legs (shared geometry, two pivots) -----------------------------------
    const legGeos = [];
    pushBox(legGeos, 0.18, 0.4, 0.22, 0, -0.2, 0, p.jeans);
    pushBox(legGeos, 0.16, 0.38, 0.2, 0, -0.58, 0, p.jeansDark);
    pushBox(legGeos, 0.19, 0.13, 0.28, 0, -0.8, 0.03, p.boot);
    pushBox(legGeos, 0.19, 0.05, 0.23, 0, -0.68, 0, p.accentDark); // knee band
    let legGeo = mergeBucket(legGeos);
    if (!legGeo) {
      legGeo = tintGeo(new THREE.BoxGeometry(0.18, 0.8, 0.22), p.jeans);
      legGeo.translate(0, -0.5, 0);
    }
    a.legL = new THREE.Mesh(legGeo, clothMat);
    a.legL.position.set(-0.12, 0.9, 0);
    a.legL.castShadow = false;
    a.legR = new THREE.Mesh(legGeo, clothMat);
    a.legR.position.set(0.12, 0.9, 0);
    a.legR.castShadow = false;
    pose.add(a.legL, a.legR);

    // -- arms ----------------------------------------------------------------
    const armGeos = [];
    pushBox(armGeos, 0.14, 0.3, 0.17, 0, -0.15, 0, p.jacket);
    pushBox(armGeos, 0.12, 0.24, 0.15, 0, -0.42, 0, p.jacketDark);
    pushBox(armGeos, 0.1, 0.1, 0.12, 0, -0.58, 0, p.skin);
    pushBox(armGeos, 0.15, 0.06, 0.18, 0, -0.26, 0, p.accent); // armband
    let armGeo = mergeBucket(armGeos);
    if (!armGeo) {
      armGeo = tintGeo(new THREE.BoxGeometry(0.14, 0.6, 0.16), p.jacket);
      armGeo.translate(0, -0.3, 0);
    }
    a.armL = new THREE.Mesh(armGeo, clothMat);
    a.armL.position.set(0.34, 1.52, 0);
    a.armL.castShadow = false;
    a.armR = new THREE.Mesh(armGeo, clothMat);
    a.armR.position.set(-0.34, 1.52, 0);
    a.armR.rotation.x = rifle ? -1.05 : -0.92;
    a.armR.castShadow = false;
    pose.add(a.armL, a.armR);

    // -- weapon (merged, one draw) + emissive torch --------------------------
    const weaponGeos = [];
    if (rifle) {
      pushBox(weaponGeos, 0.08, 0.11, 0.62, 0, 0, 0.14, p.metal); // receiver
      pushBox(weaponGeos, 0.07, 0.1, 0.3, 0, 0, -0.38, p.stock); // wooden stock
      pushBox(weaponGeos, 0.05, 0.13, 0.08, 0, -0.1, -0.02, p.metalDark); // magazine
      pushBox(weaponGeos, 0.04, 0.04, 0.5, 0, 0.01, 0.66, p.metalLight); // barrel
      pushBox(weaponGeos, 0.055, 0.055, 0.07, 0, 0.01, 0.93, p.metalDark); // muzzle
      pushBox(weaponGeos, 0.055, 0.05, 0.2, 0, 0.095, 0.18, p.metalDark); // scope
      pushBox(weaponGeos, 0.03, 0.05, 0.12, 0, 0.06, 0.14, p.metal); // scope mount
      pushBox(weaponGeos, 0.05, 0.08, 0.14, 0, -0.06, -0.16, p.stock); // foregrip
    } else {
      pushBox(weaponGeos, 0.07, 0.1, 0.26, 0, 0, 0.08, p.metal); // slide
      pushBox(weaponGeos, 0.06, 0.07, 0.12, 0, -0.01, 0.26, p.metalDark); // muzzle block
      pushBox(weaponGeos, 0.055, 0.13, 0.08, 0, -0.1, -0.02, p.metalDark); // grip
      pushBox(weaponGeos, 0.045, 0.04, 0.07, 0, 0.04, -0.01, p.metalLight); // sight
    }
    let weaponGeo = mergeBucket(weaponGeos);
    if (!weaponGeo) {
      weaponGeo = tintGeo(
        new THREE.BoxGeometry(0.08, 0.1, rifle ? 1.0 : 0.5),
        p.metal
      );
    }
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.48,
      metalness: 0.62,
      vertexColors: true,
    });
    const weaponMesh = new THREE.Mesh(weaponGeo, metalMat);
    weaponMesh.name = "companion-" + def.id + "-" + def.weapon;
    weaponMesh.position.set(-0.24, 1.29, rifle ? 0.34 : 0.42);
    weaponMesh.castShadow = false; // small prop: never in the shadow pass
    pose.add(weaponMesh);

    a.glowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(def.glow[0], def.glow[1], def.glow[2]),
      toneMapped: false,
      fog: true,
    });
    const torch = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.07), a.glowMat);
    torch.position.set(0, rifle ? -0.04 : 0.02, rifle ? 0.8 : 0.34);
    weaponMesh.add(torch);

    if (rifle) {
      // Shoulder work-lamp: emissive mesh only (NO PointLight).
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.06), a.glowMat);
      lamp.position.set(-0.3, 1.62, 0.12);
      pose.add(lamp);
      const bracket = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.05, 0.11),
        new THREE.MeshStandardMaterial({ color: 0x242a2f, roughness: 0.75, metalness: 0.3 })
      );
      bracket.position.set(-0.3, 1.66, 0.11);
      pose.add(bracket);
    } else {
      // Mai's hanging lantern (emissive only; NO PointLight).
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.11), a.glowMat);
      lantern.position.set(-0.28, 1.1, -0.38);
      pose.add(lantern);
      const lanternCap = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.03, 0.13),
        new THREE.MeshStandardMaterial({ color: p.belt, roughness: 0.9 })
      );
      lanternCap.position.set(-0.28, 1.185, -0.38);
      pose.add(lanternCap);
    }

    // -- tier-2 badge (hidden until the third rescue) ------------------------
    a.badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.1, 0.02),
      new THREE.MeshBasicMaterial({ color: def.badgeColor, toneMapped: false })
    );
    a.badge.position.set(0.18, 1.46, 0.165);
    a.badge.visible = false;
    pose.add(a.badge);

    a.sprite = makeSprite(a);
  }

  /** @param {ReturnType<typeof makeAlly>} a */
  function attach(a) {
    if (!a.built) buildModel(a);
    if (a.attached) return;
    if (scene && typeof scene.add === "function") {
      if (a.group) scene.add(a.group);
      if (a.sprite) scene.add(a.sprite);
    }
    a.attached = true;
  }

  /** @param {ReturnType<typeof makeAlly>} a */
  function detach(a) {
    if (!a.attached) return;
    if (scene && typeof scene.remove === "function") {
      if (a.group) scene.remove(a.group);
      if (a.sprite) scene.remove(a.sprite);
    }
    a.attached = false;
  }

  // --- run lifecycle ---------------------------------------------------------
  /** @param {ReturnType<typeof makeAlly>} a @param {number} n */
  function setTier(a, n) {
    a.tier = n >= 2 ? 2 : 1;
    if (a.badge) a.badge.visible = a.tier >= 2;
  }

  /** Top up an active ally and cancel a downed state. */
  function healAlly(a) {
    if (!a.active) return;
    a.hp = MAX_HP;
    a.sinceDamage = REGEN_DELAY;
    if (a.downed) {
      a.downed = false;
      a.downT = 0;
      a.downBlend = 0;
      a.shotCd = Math.max(a.shotCd, 0.5);
    }
  }

  /** @param {ReturnType<typeof makeAlly>} a */
  function resetAlly(a) {
    a.active = false;
    a.hp = MAX_HP;
    a.tier = 1;
    a.shots = 0;
    a.x = 0;
    a.z = 0;
    a.yaw = 0;
    a.speed = 0;
    a.gait = 0;
    a.walkPhase = 0;
    a.shotCd = 0;
    a.sinceDamage = REGEN_DELAY;
    a.downed = false;
    a.downT = 0;
    a.downBlend = 0;
    a.aimT = 0;
    a.aimX = 0;
    a.aimZ = 0;
    a.target = null;
    a.shotDetail.target = null;
    a.shotDetail.damage = 0;
    if (a.badge) a.badge.visible = false;
    if (a.group) {
      a.group.position.set(0, 0, 0);
      a.group.rotation.y = 0;
    }
    if (a.sprite) {
      a.sprite.visible = false;
      a.sprite.position.set(0, 2.42, 0);
    }
    detach(a);
  }

  /** @param {ReturnType<typeof makeAlly>} a @param {{x: number, z: number}|null} detail */
  function spawnAt(a, detail) {
    const px = player && player.position ? player.position.x : a.x;
    const pz = player && player.position ? player.position.z : a.z;
    updateRight();

    let sx = NaN;
    let sz = NaN;
    if (detail) {
      sx = Number(detail.x);
      sz = Number(detail.z);
    }
    if (!Number.isFinite(sx) || !Number.isFinite(sz)) {
      sx = px + rightX * FOLLOW_OFFSET * a.def.side;
      sz = pz + rightZ * FOLLOW_OFFSET * a.def.side;
    }

    // Never start inside geometry or on top of the other ally: try the rescue
    // point, then rings around it, then the ally's own follow slot.
    if (!spotFree(a, sx, sz)) {
      let found = false;
      for (let ring = 1; ring <= 3 && !found; ring++) {
        const r = ring * 1.2;
        for (let k = 0; k < 8; k++) {
          const ang = (k * TAU) / 8;
          const cx = sx + Math.cos(ang) * r;
          const cz = sz + Math.sin(ang) * r;
          if (spotFree(a, cx, cz)) {
            sx = cx;
            sz = cz;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        sx = px + rightX * FOLLOW_OFFSET * a.def.side;
        sz = pz + rightZ * FOLLOW_OFFSET * a.def.side;
      }
    }

    a.x = sx;
    a.z = sz;
    a.yaw = Math.atan2(px - a.x, pz - a.z);
    a.hp = MAX_HP;
    setTier(a, 1);
    a.shots = 0;
    a.speed = 0;
    a.gait = 0;
    a.walkPhase = 0;
    a.lanternPhase = 0;
    a.shotCd = 0;
    a.sinceDamage = REGEN_DELAY;
    a.downed = false;
    a.downT = 0;
    a.downBlend = 0;
    a.aimT = 0;
    a.aimX = px;
    a.aimZ = pz;
    a.target = null;
    lastPx = px;
    lastPz = pz;

    a.active = true;
    attach(a);
    if (a.badge) a.badge.visible = a.tier >= 2;
    if (a.group) {
      a.group.position.set(a.x, 0, a.z);
      a.group.rotation.y = a.yaw;
    }
    if (a.sprite) {
      a.sprite.position.set(a.x, 2.42, a.z);
      a.sprite.visible = false;
    }
    emit("companion-joined", { name: a.def.name, tier: a.tier });
  }

  function reset() {
    rescues = 0;
    rightX = 1;
    rightZ = 0;
    goalX = 0;
    goalZ = 0;
    lastPx = 0;
    lastPz = 0;
    for (let i = 0; i < allies.length; i++) resetAlly(allies[i]);
  }

  // --- bus -------------------------------------------------------------------
  function onRescue(e) {
    const detail = e && e.detail ? e.detail : null;
    rescues++;
    // First rescue: Mai. Second: Eli joins at tier 1. Third+: both tier 2 and
    // both healed (never a third ally).
    if (!allies[0].active) {
      spawnAt(allies[0], detail);
      return;
    }
    if (!allies[1].active) {
      spawnAt(allies[1], detail);
      healAlly(allies[0]);
      return;
    }
    healAlly(allies[0]);
    healAlly(allies[1]);
    if (rescues >= 3) {
      setTier(allies[0], 2);
      setTier(allies[1], 2);
    }
  }

  /** @param {ReturnType<typeof makeAlly>} a @param {number} amount */
  function hurt(a, amount) {
    if (!a.active || a.downed) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    a.hp = Math.max(0, a.hp - n);
    a.sinceDamage = 0;
    if (a.hp <= 0) {
      a.hp = 0;
      a.downed = true;
      a.downT = DOWN_TIME;
      a.aimT = 0;
      a.target = null;
      a.shotCd = Math.max(a.shotCd, 0.5);
      emit("companion-down", { name: a.def.name, x: a.x, z: a.z });
    }
  }

  if (bus && typeof bus.addEventListener === "function") {
    bus.addEventListener("survivor-rescued", onRescue);
    bus.addEventListener("explosion", (e) => {
      const p = e && e.detail ? e.detail.position : null;
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
      for (let i = 0; i < allies.length; i++) {
        const a = allies[i];
        if (!a.active || a.downed) continue;
        const dx = p.x - a.x;
        const dz = p.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= EXPLOSION_RADIUS * EXPLOSION_RADIUS) continue;
        hurt(a, EXPLOSION_DAMAGE * (1 - Math.sqrt(d2) / EXPLOSION_RADIUS));
      }
    });
    bus.addEventListener("settings-changed", (e) => {
      const patch = e && e.detail ? e.detail.patch : null;
      if (patch && Object.prototype.hasOwnProperty.call(patch, "lang")) {
        for (let i = 0; i < allies.length; i++) {
          const a = allies[i];
          a.nameText = tr(a.def.plateKey);
          rebuildNameplate(a);
        }
      }
    });
    // Defensive fresh-run clears. The integrator ALSO calls reset() inside
    // freshRun(); reset() is idempotent so the double call is harmless.
    const runEvents = [
      "ui-play",
      "ui-play-free",
      "ui-restart",
      "ui-quit",
      "ui-endless",
      "mission-reset",
    ];
    for (let i = 0; i < runEvents.length; i++) {
      bus.addEventListener(runEvents[i], reset);
    }
  }

  // --- targeting -------------------------------------------------------------
  /**
   * Sampled XZ line of sight, identical to zombie._hasLineOfSight: steps of
   * 0.5 m, radius 0.15 m, endpoints excluded. No level API → optimistic.
   * @param {ReturnType<typeof makeAlly>} a
   * @param {number} tx
   * @param {number} tz
   * @returns {boolean}
   */
  function hasLineOfSight(a, tx, tz) {
    if (!level || typeof level.isBlocked !== "function") return true;
    const dx = tx - a.x;
    const dz = tz - a.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-6) return true;
    const steps = Math.max(2, Math.ceil(d / LOS_STEP));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (level.isBlocked(a.x + dx * t, a.z + dz * t, LOS_RADIUS)) return false;
    }
    return true;
  }

  /**
   * Pick the live zombie nearest the PLAYER among those within THIS ally's
   * range with a clear line of sight. `avoid` is the other ally's current
   * target: when it is also the nearest, the nearest OTHER valid zombie wins
   * (Eli prefers a different target than Mai). Allocation-free linear scan.
   * @param {ReturnType<typeof makeAlly>} a
   * @param {number} px
   * @param {number} pz
   * @param {any|null} avoid
   * @returns {any|null}
   */
  function findTarget(a, px, pz, avoid) {
    if (!Array.isArray(zombies) || zombies.length === 0) return null;
    let best = null;
    let bestD2 = Infinity;
    let alt = null;
    let altD2 = Infinity;
    const range2 = a.def.range * a.def.range;
    for (let i = 0; i < zombies.length; i++) {
      const zb = zombies[i];
      if (!zb || zb.alive === false || !zb.position) continue;
      if (typeof zb.takeDamage !== "function") continue;
      const zx = zb.position.x;
      const zz = zb.position.z;
      if (!Number.isFinite(zx) || !Number.isFinite(zz)) continue;
      const dx = zx - a.x;
      const dz = zz - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1e-4 || d2 > range2) continue;
      if (!hasLineOfSight(a, zx, zz)) continue;
      const pdx = zx - px;
      const pdz = zz - pz;
      const pd2 = pdx * pdx + pdz * pdz;
      if (pd2 < bestD2) {
        bestD2 = pd2;
        best = zb;
      }
      if (zb !== avoid && pd2 < altD2) {
        altD2 = pd2;
        alt = zb;
      }
    }
    if (avoid && best === avoid && alt) return alt;
    return best;
  }

  /**
   * One hitscan shot: sparks at the muzzle + target, tier damage, no headshot,
   * "companion-shot" {target, damage} on the bus.
   * @param {ReturnType<typeof makeAlly>} a
   * @param {any} target
   */
  function fireAt(a, target) {
    const tx = target.position.x;
    const tz = target.position.z;
    const ty = Number.isFinite(target.position.y) ? target.position.y : 0;
    let dx = tx - a.x;
    let dz = tz - a.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 1e-6) {
      dx /= d;
      dz /= d;
    } else {
      dx = 0;
      dz = 1;
    }

    const def = a.def;
    tmpMuzzle.set(
      a.x + dx * def.muzzleForward - dz * def.muzzleRight,
      1.32,
      a.z + dz * def.muzzleForward + dx * def.muzzleRight
    );
    tmpHit.set(tx, ty + 1.05, tz);
    if (particles && typeof particles.spawnSpark === "function") {
      particles.spawnSpark(tmpMuzzle);
      particles.spawnSpark(tmpHit);
    }

    const damage = a.tier >= 2 ? def.damage2 : def.damage1;
    target.takeDamage(damage, false);

    if (a.shotEvent && bus && typeof bus.dispatchEvent === "function") {
      a.shotDetail.target = target;
      a.shotDetail.damage = damage;
      bus.dispatchEvent(a.shotEvent);
    }

    a.target = target;
    a.shots++;
    a.aimT = AIM_HOLD;
    a.aimX = tx;
    a.aimZ = tz;
    a.yaw = Math.atan2(tx - a.x, tz - a.z);
  }

  // --- movement --------------------------------------------------------------
  /** Update the player-right heading: camera yaw → velocity → world +X. */
  function updateRight() {
    if (camera && camera.rotation && Number.isFinite(camera.rotation.y)) {
      rightX = Math.cos(camera.rotation.y);
      rightZ = -Math.sin(camera.rotation.y);
      return;
    }
    const v = player && player.velocity;
    if (v && Number.isFinite(v.x) && Number.isFinite(v.z)) {
      const l = Math.sqrt(v.x * v.x + v.z * v.z);
      if (l > 1e-3) {
        rightX = -v.z / l;
        rightZ = v.x / l;
        return;
      }
    }
    rightX = 1;
    rightZ = 0;
  }

  /**
   * Preferred 3.4 m slot on this ally's side; when a wall (or the other ally)
   * owns that slot, probe the other seven 45° ring positions. Falls back to
   * standing still.
   * @param {ReturnType<typeof makeAlly>} a
   * @param {number} px
   * @param {number} pz
   */
  function chooseGoal(a, px, pz) {
    const side = a.def.side;
    const baseX = rightX * side;
    const baseZ = rightZ * side;
    let gx = px + baseX * FOLLOW_OFFSET;
    let gz = pz + baseZ * FOLLOW_OFFSET;
    if (spotFree(a, gx, gz)) {
      goalX = gx;
      goalZ = gz;
      return;
    }
    const base = Math.atan2(baseZ, baseX);
    for (let k = 1; k < 8; k++) {
      const ang = base + (k * TAU) / 8;
      gx = px + Math.cos(ang) * FOLLOW_OFFSET;
      gz = pz + Math.sin(ang) * FOLLOW_OFFSET;
      if (spotFree(a, gx, gz)) {
        goalX = gx;
        goalZ = gz;
        return;
      }
    }
    goalX = a.x;
    goalZ = a.z;
  }

  // --- animation -------------------------------------------------------------
  /**
   * Pose one model from gait (distance driven), downBlend and the lamp pulse.
   * All writes are in place; no allocation.
   * @param {ReturnType<typeof makeAlly>} a
   * @param {number} step
   * @param {number} moved - metres actually travelled this frame
   * @param {number} px
   * @param {number} pz
   */
  function animate(a, step, moved, px, pz) {
    const moving = moved > 1e-4;
    a.gait += ((moving ? 1 : 0) - a.gait) * Math.min(1, step * 8);
    if (moving) a.walkPhase += moved * 4.6;
    const s = Math.sin(a.walkPhase);
    const swing = 0.55 * a.gait;
    const rifle = a.def.weapon === "rifle";

    a.legL.rotation.x = s * swing + a.downBlend * 1.18;
    a.legR.rotation.x = -s * swing + a.downBlend * 0.96;
    a.armL.rotation.x =
      (rifle ? -0.72 : 0) - s * (rifle ? 0.28 : 0.38) * a.gait + a.downBlend * 0.45;
    a.armR.rotation.x =
      (rifle ? -1.05 : -0.92) - s * 0.05 * a.gait + a.downBlend * 0.5;

    a.pose.position.y =
      Math.abs(Math.cos(a.walkPhase)) * 0.034 * a.gait - a.downBlend * 0.44;
    a.pose.rotation.x = -0.02 * a.gait + a.downBlend * 0.34;
    a.pose.rotation.z = 0.012 * s * a.gait;

    // Emissive glow pulse — one shared material write, no light object.
    a.lanternPhase += step * 2.3;
    const pulse = 0.86 + 0.14 * Math.sin(a.lanternPhase);
    const g = a.def.glow;
    a.glowMat.color.setRGB(g[0], g[1] * pulse, g[2] * pulse);

    a.group.position.set(a.x, 0, a.z);
    a.group.rotation.y = a.yaw;

    if (a.sprite) {
      a.sprite.position.set(a.x, 2.42 + a.pose.position.y, a.z);
      const dx = px - a.x;
      const dz = pz - a.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > NAMEPLATE_FAR) {
        if (a.sprite.visible) a.sprite.visible = false;
      } else {
        if (!a.sprite.visible) a.sprite.visible = true;
        const op =
          dist <= NAMEPLATE_NEAR
            ? 1
            : 1 - (dist - NAMEPLATE_NEAR) / (NAMEPLATE_FAR - NAMEPLATE_NEAR);
        if (Math.abs(op - a.sprite.material.opacity) > 0.01) {
          a.sprite.material.opacity = op;
        }
      }
    }
  }

  // --- per-ally frame update -------------------------------------------------
  /**
   * @param {ReturnType<typeof makeAlly>} a
   * @param {number} dt
   * @param {number} px
   * @param {number} pz
   * @param {number} playerMoved2
   */
  function updateAlly(a, dt, px, pz, playerMoved2) {
    if (a.shotCd > 0) a.shotCd -= dt;
    if (a.aimT > 0) a.aimT -= dt;

    // --- downed: kneel 12 s, then revive at 50% ------------------------------
    if (a.downed) {
      a.downT -= dt;
      a.downBlend = Math.min(1, a.downBlend + dt * 5);
      if (a.downT <= 0) {
        a.downed = false;
        a.downT = 0;
        a.downBlend = 0;
        a.hp = MAX_HP * REVIVE_FRACTION;
        a.sinceDamage = 0;
        a.shotCd = Math.max(a.shotCd, 0.5);
      }
      animate(a, dt, 0, px, pz);
      return;
    }
    if (a.downBlend > 0) a.downBlend = Math.max(0, a.downBlend - dt * 5);

    // --- health regen (8 s after the last damage) ---------------------------
    if (a.sinceDamage < REGEN_DELAY) a.sinceDamage += dt;
    else if (a.hp < MAX_HP) a.hp = Math.min(MAX_HP, a.hp + REGEN_RATE * dt);

    // --- follow --------------------------------------------------------------
    chooseGoal(a, px, pz);
    const gdx = goalX - a.x;
    const gdz = goalZ - a.z;
    const gd2 = gdx * gdx + gdz * gdz;
    const pdx = px - a.x;
    const pdz = pz - a.z;
    const pd2 = pdx * pdx + pdz * pdz;

    // Ring-follow: beyond 8 m the ally sprints straight at the 3.4 m ring;
    // inside it the ally travels AROUND the player to its own side slot
    // instead of cutting through them. The radial term keeps the distance at
    // 3–6 m; the tangential term does the "get out of the crosshair" slide.
    const pd = Math.sqrt(pd2);
    const outX = pd > 1e-4 ? -pdx / pd : 1; // outward = (x - px, z - pz)
    const outZ = pd > 1e-4 ? -pdz / pd : 0;
    let dirX = 0;
    let dirZ = 0;
    let dirLen = 0;
    let want = 0;

    if (pd2 > FOLLOW_FAR * FOLLOW_FAR) {
      dirX = -outX;
      dirZ = -outZ;
      dirLen = 1;
      want = SPRINT_SPEED;
    } else {
      const currentAng = Math.atan2(-pdz, -pdx); // bearing player → ally
      const targetAng = Math.atan2(goalZ - pz, goalX - px);
      let dAng = targetAng - currentAng;
      dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
      const radialErr = FOLLOW_OFFSET - pd;
      const radialW = Math.max(-1, Math.min(1, radialErr * 0.9));
      const tangW = Math.max(-1, Math.min(1, dAng * 1.6));
      dirX = -outZ * tangW + outX * radialW;
      dirZ = outX * tangW + outZ * radialW;
      dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ);
      if (dirLen > 1e-4 && gd2 > 0.09) {
        const settled = Math.abs(dAng) < 0.06 && Math.abs(radialErr) < 0.3;
        if (!settled) want = WALK_SPEED;
      }
      // Literal "closer than 3 m → idle" once the ally is already in its slot
      // and the player is standing still; a moving player drags the slot along,
      // so the ring logic must keep tracking instead of parking short.
      if (
        pd2 < FOLLOW_NEAR * FOLLOW_NEAR &&
        gd2 < 0.36 &&
        playerMoved2 < 1e-4
      ) {
        want = 0;
      }
    }

    // --- ally–ally separation (never overlap / never stack) -----------------
    let sepDist = 0;
    const other = otherAlly(a);
    if (other.active) {
      const sx = a.x - other.x;
      const sz = a.z - other.z;
      const sd2 = sx * sx + sz * sz;
      if (sd2 < ALLY_GAP * ALLY_GAP && sd2 > 1e-6) {
        sepDist = Math.sqrt(sd2);
        const push = (ALLY_GAP - sepDist) / ALLY_GAP;
        dirX += (sx / sepDist) * push * ALLY_GAP_FORCE;
        dirZ += (sz / sepDist) * push * ALLY_GAP_FORCE;
        dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ);
        if (want < WALK_SPEED) want = WALK_SPEED;
      }
    }

    a.speed += (want - a.speed) * Math.min(1, dt * ACCEL);
    if (a.speed < 0.02) a.speed = 0;

    const oldX = a.x;
    const oldZ = a.z;
    if (a.speed > 0 && dirLen > 1e-4) {
      const gd = Math.sqrt(gd2);
      let stepLimit =
        pd2 > FOLLOW_FAR * FOLLOW_FAR
          ? Math.max(0, pd - FOLLOW_OFFSET) + 0.05
          : gd + 0.05;
      if (sepDist > 0) {
        stepLimit = Math.max(stepLimit, ALLY_GAP - sepDist + 0.05);
      }
      const stepLen = Math.min(a.speed * dt, stepLimit);
      const stepX = (dirX / dirLen) * stepLen;
      const stepZ = (dirZ / dirLen) * stepLen;
      // Axis-separated sliding, exactly like controller.js / zombie.js.
      if (stepX !== 0 && !blockedAt(a.x + stepX, a.z, COMPANION_RADIUS)) a.x += stepX;
      if (stepZ !== 0 && !blockedAt(a.x, a.z + stepZ, COMPANION_RADIUS)) a.z += stepZ;
    }
    const mx = a.x - oldX;
    const mz = a.z - oldZ;
    const moved = Math.sqrt(mx * mx + mz * mz);

    // --- facing: aim > movement > player (inside 8 m) ------------------------
    let faceX = a.x;
    let faceZ = a.z;
    let hasFace = false;
    if (a.aimT > 0) {
      faceX = a.aimX;
      faceZ = a.aimZ;
      hasFace = true;
    } else if (moved > 1e-4) {
      faceX = a.x + mx;
      faceZ = a.z + mz;
      hasFace = true;
    } else if (pd2 < 64 && pd2 > 1e-6) {
      faceX = px;
      faceZ = pz;
      hasFace = true;
    }
    if (hasFace && Math.abs(faceX - a.x) + Math.abs(faceZ - a.z) > 1e-6) {
      const targetYaw = Math.atan2(faceX - a.x, faceZ - a.z);
      a.yaw = turnToward(a.yaw, targetYaw, TURN_RATE * dt);
    }

    // --- combat: own cadence, 5 Hz rescan when nothing is valid -------------
    if (a.shotCd <= 0) {
      let avoid = null;
      if (a === allies[1] && allies[0].active && !allies[0].downed) {
        const t = allies[0].target;
        if (t && t.alive !== false) avoid = t;
      }
      const target = findTarget(a, px, pz, avoid);
      if (target) {
        fireAt(a, target);
        a.shotCd = a.tier >= 2 ? a.def.cooldown2 : a.def.cooldown1;
      } else {
        a.target = null;
        a.shotCd = RETRY_COOLDOWN;
      }
    }

    animate(a, dt, moved, px, pz);
  }

  // --- frame update ----------------------------------------------------------
  /**
   * @param {number} dt - seconds (integrator calls this only while playing)
   * @param {{x: number, z: number}=} playerPos - defaults to player.position
   */
  function update(dt, playerPos) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (!allies[0].active && !allies[1].active) return;
    const p =
      playerPos && Number.isFinite(playerPos.x) && Number.isFinite(playerPos.z)
        ? playerPos
        : player && player.position;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
    const px = p.x;
    const pz = p.z;
    const pdxPrev = px - lastPx;
    const pdzPrev = pz - lastPz;
    const playerMoved2 = pdxPrev * pdxPrev + pdzPrev * pdzPrev;
    lastPx = px;
    lastPz = pz;

    updateRight();
    for (let i = 0; i < allies.length; i++) {
      const a = allies[i];
      if (a.active) updateAlly(a, dt, px, pz, playerMoved2);
    }
  }

  // --- public surface --------------------------------------------------------
  /** Fresh snapshot object (debug/HUD); called off the frame loop. */
  function state() {
    const list = [];
    for (let i = 0; i < allies.length; i++) {
      const a = allies[i];
      if (!a.active) continue;
      list.push({
        name: a.def.name,
        hp: a.hp,
        maxHp: MAX_HP,
        tier: a.tier,
        x: a.x,
        z: a.z,
        shots: a.shots,
      });
    }
    // Top-level fields stay Mai's for debug/readme compatibility.
    const p = allies[0];
    return {
      active: p.active,
      hp: p.hp,
      maxHp: MAX_HP,
      tier: p.tier,
      x: p.x,
      z: p.z,
      shots: p.shots,
      allies: list,
    };
  }

  return { update, state, reset };
}
