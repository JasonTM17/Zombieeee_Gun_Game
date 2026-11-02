/**
 * ============================================================================
 * COMPANIONS — Mai, the rescued survivor who joins the fight.
 * ============================================================================
 * One friendly fire-support ally. She does NOT exist until the first
 * "survivor-rescued" event of a run (events.js emits {x, z}); she then spawns
 * at the rescue site (or beside the player when the payload has no position)
 * and follows the player for the rest of the run.
 *
 * WHAT THIS MODULE OWNS
 * - A low-poly humanoid clearly distinct from the zombies: upright, warm
 *   orange jacket with teal panels, backpack, beanie, a rifle, and TWO small
 *   emissive meshes (rifle flashlight + hanging lantern). NO PointLight, NO
 *   new shadow light — the glow is emissive mesh only.
 * - ONE canvas-texture Sprite nameplate ("MAI — ALLY" / "MAI — ĐỒNG ĐỘI"
 *   through i18n), visible within 28 m and faded 28 → 40 m.
 * - Follow AI: hold a 3.4 m slot on the player's RIGHT (out of the crosshair).
 *   She approaches radially to the 3.4 m ring, then travels AROUND the player
 *   to that slot instead of cutting through them; when the player closes
 *   inside 3 m she eases back out to the ring rather than crowding. Walk is
 *   4.4 m/s; beyond 8 m she sprints at 7.8 m/s. Movement
 *   slides along level colliders with axis-separated `level.isBlocked` tests,
 *   exactly like the player and zombies. The companion has NO collider and
 *   never blocks the player, zombies, or bullets (its meshes carry no
 *   userData.solid / .zombie / .part, so combat.js passes pellets through).
 * - Combat: every 1.1 s she picks the live zombie nearest the PLAYER among
 *   those within 20 m with a clear sampled line of sight, deals 25 damage
 *   (35 at tier 2) with no headshot, spawns sparks at the muzzle and the
 *   target, and emits "companion-shot" {target, damage}. Targets nearest the
 *   player are preferred; ties keep the earlier zombie. A blocked/no-target
 *   scan retries at 5 Hz instead of every frame.
 * - Health: 120 HP, +2 HP/s after 8 s without damage. Zombie melee never
 *   touches her (zombie.js is untouched and has no ally target). The ONLY
 *   damage intake is explosion splash, using the explosives.js contract
 *   (4 m radius, 90 damage at the center, linear falloff) — this makes the
 *   health/regen/downed loop real without inventing a zombie-target path.
 *   At 0 HP she kneels (no death) for 12 s, then revives at 50% HP (60).
 * - A second "survivor-rescued" in the same run heals her to full and upgrades
 *   her to tier 2 (35 damage, teal chest badge). Further rescues top her up.
 *
 * BUS CONTRACT
 * Consumed:
 *   "survivor-rescued" {x, z} — first: spawn; later: heal + tier 2.
 *   "explosion" {position}    — splash damage (4 m, linear 90 → 0).
 *   "settings-changed" {patch} — patch.lang → redraw the nameplate.
 *   "ui-play" | "ui-play-free" | "ui-restart" | "ui-quit" | "ui-endless" |
 *   "mission-reset"            — defensive fresh-run reset (idempotent with
 *                                the integrator's freshRun reset).
 * Emitted:
 *   "companion-joined" {name: "Mai", tier: 1|2}
 *   "companion-down"   {x, z}
 *   "companion-shot"   {target, damage} — target is the live Zombie; the
 *     event/detail objects are REUSED per shot for zero steady-state garbage,
 *     so listeners must read synchronously (same precedent as "footstep").
 *
 * PERFORMANCE
 * - One model built lazily at the first spawn, then reused by later runs:
 *   1 merged body + 2 legs + 2 arms + 1 merged rifle + torch + lantern +
 *   lantern cap + badge + 1 Sprite ≈ 10 visible draw calls (the badge is
 *   hidden until tier 2). One shared vertex-colour material for body/limbs.
 * - update() allocates nothing: scratch Vector3s, module-level right/right
 *   goal scalars, one pre-built shot event, zero arrays, zero closures.
 * - No per-frame canvas writes. The nameplate redraws only on language change.
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
 *     x: number, z: number, shots: number},
 *   reset: () => void}}
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as i18nModule from "../core/i18n.js";

// --- i18n (EN + VI) ---------------------------------------------------------

const BUNDLE = {
  en: { companion_mai_plate: "MAI — ALLY" },
  vi: { companion_mai_plate: "MAI — ĐỒNG ĐỘI" },
};

i18nModule.registerBundle(BUNDLE);

// --- tunables ---------------------------------------------------------------

const NAME = "Mai";
const MAX_HP = 120;
const REGEN_DELAY = 8; // s without damage before regen starts
const REGEN_RATE = 2; // HP/s
const DOWN_TIME = 12; // s kneeling before the self-revive
const REVIVE_FRACTION = 0.5; // 60 HP
const FOLLOW_NEAR = 3; // idle if already in the slot + player still, inside 3 m
const FOLLOW_FAR = 8; // farther than this → sprint
const FOLLOW_OFFSET = 3.4; // preferred slot, metres to the player's right
const WALK_SPEED = 4.4; // m/s (player walks 4.5)
const SPRINT_SPEED = 7.8; // m/s (beats the player's 7.2 sprint)
const ACCEL = 10; // 1/s speed smoothing
const TURN_RATE = 11; // rad/s facing
const COMPANION_RADIUS = 0.38; // collision circle used for isBlocked tests
const SHOT_RANGE = 20; // m
const SHOT_COOLDOWN = 1.1; // s between shots
const RETRY_COOLDOWN = 0.2; // s between scans when no valid target
const DAMAGE_T1 = 25;
const DAMAGE_T2 = 35;
const LOS_STEP = 0.5; // m between line-of-sight samples
const LOS_RADIUS = 0.15; // sample radius (zombie._hasLineOfSight parity)
const AIM_HOLD = 0.6; // s she keeps facing a fired-at target
const NAMEPLATE_NEAR = 28; // full opacity inside this distance
const NAMEPLATE_FAR = 40; // hidden beyond
const EXPLOSION_RADIUS = 4; // explosives.js spec
const EXPLOSION_DAMAGE = 90; // at the center, linear to 0 at the edge
const TAU = Math.PI * 2;

// Warm jacket palette. Values are flat vertex colours for the shared material.
const C = {
  jacket: 0xd9712a,
  jacketDark: 0xa94f1a,
  teal: 0x2f9188,
  tealDark: 0x1d5f5a,
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
};

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

  // --- run state -------------------------------------------------------------
  let active = false;
  let hp = MAX_HP;
  let tier = 1;
  let shots = 0;
  let rescues = 0;
  let x = 0;
  let z = 0;
  let yaw = 0;
  let speed = 0;
  let gait = 0;
  let walkPhase = 0;
  let lanternPhase = 0;
  let shotCd = 0;
  let sinceDamage = REGEN_DELAY;
  let downed = false;
  let downT = 0;
  let downBlend = 0;
  let aimT = 0;
  let aimX = 0;
  let aimZ = 0;
  let rightX = 1;
  let rightZ = 0;
  let goalX = 0;
  let goalZ = 0;
  let lastPx = 0;
  let lastPz = 0;

  // --- model handles (built lazily, then reused across runs) -----------------
  let built = false;
  let attached = false;
  let group = null;
  let pose = null;
  let legL = null;
  let legR = null;
  let armL = null;
  let armR = null;
  let badge = null;
  let sprite = null;
  let glowMat = null;
  let nameText = tr("companion_mai_plate");

  // --- reusable math ---------------------------------------------------------
  const tmpMuzzle = new THREE.Vector3();
  const tmpHit = new THREE.Vector3();

  // --- reusable shot event (zero steady-state garbage) -----------------------
  const shotDetail = { target: null, damage: 0 };
  const shotEvent =
    typeof CustomEvent === "function"
      ? new CustomEvent("companion-shot", { detail: shotDetail })
      : null;

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

  // --- nameplate -------------------------------------------------------------
  function makeSprite() {
    if (typeof document === "undefined" || typeof document.createElement !== "function") {
      return null;
    }
    const tex = makeNameplateTexture(nameText);
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
    s.name = "companion-nameplate";
    s.renderOrder = 6;
    s.visible = false;
    const scale = Math.max(2.0, Math.min(3.8, nameText.length * 0.15 + 1.0));
    s.scale.set(scale, 0.62, 1);
    return s;
  }

  function rebuildNameplate() {
    if (!sprite) return;
    const tex = makeNameplateTexture(nameText);
    if (!tex) return;
    const old = sprite.material.map;
    sprite.material.map = tex;
    sprite.material.needsUpdate = true;
    if (old) old.dispose();
    const scale = Math.max(2.0, Math.min(3.8, nameText.length * 0.15 + 1.0));
    sprite.scale.set(scale, 0.62, 1);
  }

  // --- model -----------------------------------------------------------------
  function buildModel() {
    if (built) return;
    built = true;

    group = new THREE.Group();
    group.name = "companion-mai";
    pose = new THREE.Group();
    group.add(pose);

    // One vertex-colour material for body + legs + arms.
    const clothMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.03,
    });

    // -- torso / head / backpack (merged into one draw call) -----------------
    const bodyGeos = [];
    pushBox(bodyGeos, 0.44, 0.2, 0.26, 0, 0.9, 0, C.jeans);
    pushBox(bodyGeos, 0.46, 0.07, 0.28, 0, 0.99, 0, C.belt);
    pushBox(bodyGeos, 0.5, 0.6, 0.3, 0, 1.3, 0, C.jacket);
    pushBox(bodyGeos, 0.26, 0.36, 0.02, 0, 1.32, 0.155, C.teal); // chest panel
    pushBox(bodyGeos, 0.5, 0.1, 0.31, 0, 1.58, 0, C.tealDark); // collar band
    pushBox(bodyGeos, 0.09, 0.42, 0.02, -0.18, 1.3, 0.155, C.jacketDark);
    pushBox(bodyGeos, 0.09, 0.42, 0.02, 0.18, 1.3, 0.155, C.jacketDark);
    pushBox(bodyGeos, 0.13, 0.09, 0.13, 0, 1.64, 0, C.skin); // neck
    pushBox(bodyGeos, 0.25, 0.27, 0.25, 0, 1.81, 0, C.skin); // head
    pushBox(bodyGeos, 0.05, 0.05, 0.04, 0, 1.8, 0.135, C.skinDark); // nose
    for (const side of [-1, 1]) {
      pushBox(bodyGeos, 0.045, 0.03, 0.02, side * 0.06, 1.845, 0.13, C.hair); // eye
    }
    pushBox(bodyGeos, 0.26, 0.09, 0.26, 0, 1.96, 0, C.teal); // beanie
    pushBox(bodyGeos, 0.27, 0.04, 0.27, 0, 1.91, 0, C.tealDark); // beanie brim
    pushBox(bodyGeos, 0.26, 0.08, 0.05, 0, 1.81, 0.125, C.hair); // fringe
    for (const side of [-1, 1]) {
      pushBox(bodyGeos, 0.06, 0.58, 0.33, side * 0.3, 1.28, 0, C.jacketDark); // side seam
      pushBox(bodyGeos, 0.16, 0.1, 0.32, side * 0.3, 1.56, 0, C.teal); // shoulder patch
      pushBox(bodyGeos, 0.055, 0.5, 0.045, side * 0.15, 1.32, 0.16, C.strap); // strap
      pushBox(bodyGeos, 0.1, 0.12, 0.08, side * 0.21, 0.96, 0.15, C.packDark); // pouch
    }
    // backpack + top flap + lower pouch
    pushBox(bodyGeos, 0.38, 0.46, 0.22, 0, 1.3, -0.24, C.pack);
    pushBox(bodyGeos, 0.4, 0.1, 0.24, 0, 1.53, -0.24, C.packDark);
    pushBox(bodyGeos, 0.3, 0.14, 0.16, 0, 1.2, -0.37, C.packDark);

    let bodyGeo = mergeBucket(bodyGeos);
    if (!bodyGeo) {
      bodyGeo = tintGeo(new THREE.BoxGeometry(0.5, 0.6, 0.3), C.jacket);
      bodyGeo.translate(0, 1.3, 0);
    }
    const body = new THREE.Mesh(bodyGeo, clothMat);
    body.castShadow = true;
    body.receiveShadow = true;
    pose.add(body);

    // -- legs (shared geometry, two pivots) -----------------------------------
    const legGeos = [];
    pushBox(legGeos, 0.18, 0.4, 0.22, 0, -0.2, 0, C.jeans);
    pushBox(legGeos, 0.16, 0.38, 0.2, 0, -0.58, 0, C.jeansDark);
    pushBox(legGeos, 0.19, 0.13, 0.28, 0, -0.8, 0.03, C.boot);
    pushBox(legGeos, 0.19, 0.05, 0.23, 0, -0.68, 0, C.tealDark); // knee band
    let legGeo = mergeBucket(legGeos);
    if (!legGeo) {
      legGeo = tintGeo(new THREE.BoxGeometry(0.18, 0.8, 0.22), C.jeans);
      legGeo.translate(0, -0.5, 0);
    }
    legL = new THREE.Mesh(legGeo, clothMat);
    legL.position.set(-0.12, 0.9, 0);
    legL.castShadow = true;
    legR = new THREE.Mesh(legGeo, clothMat);
    legR.position.set(0.12, 0.9, 0);
    legR.castShadow = true;
    pose.add(legL, legR);

    // -- arms ----------------------------------------------------------------
    const armGeos = [];
    pushBox(armGeos, 0.14, 0.3, 0.17, 0, -0.15, 0, C.jacket);
    pushBox(armGeos, 0.12, 0.24, 0.15, 0, -0.42, 0, C.jacketDark);
    pushBox(armGeos, 0.1, 0.1, 0.12, 0, -0.58, 0, C.skin);
    pushBox(armGeos, 0.15, 0.06, 0.18, 0, -0.26, 0, C.teal); // armband
    let armGeo = mergeBucket(armGeos);
    if (!armGeo) {
      armGeo = tintGeo(new THREE.BoxGeometry(0.14, 0.6, 0.16), C.jacket);
      armGeo.translate(0, -0.3, 0);
    }
    armL = new THREE.Mesh(armGeo, clothMat);
    armL.position.set(0.34, 1.52, 0);
    armL.castShadow = true;
    armR = new THREE.Mesh(armGeo, clothMat);
    armR.position.set(-0.34, 1.52, 0);
    armR.rotation.x = -0.92; // right hand forward on the rifle
    armR.castShadow = true;
    pose.add(armL, armR);

    // -- rifle (merged, one draw) + emissive flashlight tip -------------------
    const rifleGeos = [];
    pushBox(rifleGeos, 0.08, 0.11, 0.5, 0, 0, 0.1, C.metal);
    pushBox(rifleGeos, 0.06, 0.09, 0.24, 0, -0.02, -0.28, C.metalDark); // stock
    pushBox(rifleGeos, 0.05, 0.14, 0.08, 0, -0.1, -0.05, C.metalDark); // magazine
    pushBox(rifleGeos, 0.035, 0.035, 0.36, 0, 0.02, 0.5, C.metalLight); // barrel
    pushBox(rifleGeos, 0.06, 0.06, 0.06, 0, 0.02, 0.7, C.metalDark); // muzzle
    let rifleGeo = mergeBucket(rifleGeos);
    if (!rifleGeo) {
      rifleGeo = tintGeo(new THREE.BoxGeometry(0.08, 0.1, 0.8), C.metal);
      rifleGeo.translate(0, 0, 0.1);
    }
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.48,
      metalness: 0.62,
      vertexColors: true,
    });
    const rifle = new THREE.Mesh(rifleGeo, metalMat);
    rifle.name = "companion-rifle";
    rifle.position.set(-0.24, 1.29, 0.34);
    rifle.castShadow = true;
    pose.add(rifle);

    glowMat = new THREE.MeshBasicMaterial({
      color: 0xffd28a,
      toneMapped: false,
      fog: true,
    });
    const torch = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.07), glowMat);
    torch.position.set(0, 0.02, 0.75);
    rifle.add(torch);

    // -- hanging lantern (emissive only; NO PointLight) -----------------------
    const lanternGeo = new THREE.BoxGeometry(0.11, 0.15, 0.11);
    const lantern = new THREE.Mesh(lanternGeo, glowMat);
    lantern.position.set(-0.28, 1.1, -0.38);
    pose.add(lantern);
    const lanternCap = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.03, 0.13),
      new THREE.MeshStandardMaterial({ color: 0x2a2119, roughness: 0.9 })
    );
    lanternCap.position.set(-0.28, 1.185, -0.38);
    pose.add(lanternCap);

    // -- tier-2 badge (hidden until the second rescue) ------------------------
    badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.1, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x64f0d6, toneMapped: false })
    );
    badge.position.set(0.18, 1.46, 0.165);
    badge.visible = false;
    pose.add(badge);

    sprite = makeSprite();
  }

  function attach() {
    if (!built) buildModel();
    if (attached) return;
    if (scene && typeof scene.add === "function") {
      scene.add(group);
      if (sprite) scene.add(sprite);
    }
    attached = true;
  }

  function detach() {
    if (!attached) return;
    if (scene && typeof scene.remove === "function") {
      scene.remove(group);
      if (sprite) scene.remove(sprite);
    }
    attached = false;
  }

  // --- run lifecycle ---------------------------------------------------------
  function setTier(n) {
    tier = n >= 2 ? 2 : 1;
    if (badge) badge.visible = tier >= 2;
  }

  function spawnAt(detail) {
    const px = player && player.position ? player.position.x : x;
    const pz = player && player.position ? player.position.z : z;
    updateRight();

    let sx = NaN;
    let sz = NaN;
    if (detail) {
      sx = Number(detail.x);
      sz = Number(detail.z);
    }
    if (!Number.isFinite(sx) || !Number.isFinite(sz)) {
      sx = px + rightX * FOLLOW_OFFSET;
      sz = pz + rightZ * FOLLOW_OFFSET;
    }

    // Never start inside geometry: try the rescue point, then rings around it.
    if (blockedAt(sx, sz, COMPANION_RADIUS)) {
      let found = false;
      for (let ring = 1; ring <= 3 && !found; ring++) {
        const r = ring * 1.2;
        for (let k = 0; k < 8; k++) {
          const a = (k * TAU) / 8;
          const cx = sx + Math.cos(a) * r;
          const cz = sz + Math.sin(a) * r;
          if (!blockedAt(cx, cz, COMPANION_RADIUS)) {
            sx = cx;
            sz = cz;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        sx = px + rightX * FOLLOW_OFFSET;
        sz = pz + rightZ * FOLLOW_OFFSET;
      }
    }

    x = sx;
    z = sz;
    yaw = Math.atan2(px - x, pz - z);
    hp = MAX_HP;
    setTier(rescues >= 2 ? 2 : 1);
    shots = 0;
    speed = 0;
    gait = 0;
    walkPhase = 0;
    shotCd = 0;
    sinceDamage = REGEN_DELAY;
    downed = false;
    downT = 0;
    downBlend = 0;
    aimT = 0;
    aimX = px;
    aimZ = pz;
    lastPx = px;
    lastPz = pz;

    active = true;
    attach();
    if (badge) badge.visible = tier >= 2;
    if (group) {
      group.position.set(x, 0, z);
      group.rotation.y = yaw;
    }
    if (sprite) {
      sprite.position.set(x, 2.42, z);
      sprite.visible = false;
    }
    emit("companion-joined", { name: NAME, tier });
  }

  function reset() {
    rescues = 0;
    active = false;
    hp = MAX_HP;
    tier = 1;
    shots = 0;
    x = 0;
    z = 0;
    yaw = 0;
    speed = 0;
    gait = 0;
    walkPhase = 0;
    shotCd = 0;
    sinceDamage = REGEN_DELAY;
    downed = false;
    downT = 0;
    downBlend = 0;
    aimT = 0;
    aimX = 0;
    aimZ = 0;
    lastPx = 0;
    lastPz = 0;
    shotDetail.target = null;
    shotDetail.damage = 0;
    if (badge) badge.visible = false;
    if (group) {
      group.position.set(0, 0, 0);
      group.rotation.y = 0;
    }
    if (sprite) {
      sprite.visible = false;
      sprite.position.set(0, 2.42, 0);
    }
    detach();
  }

  // --- bus -------------------------------------------------------------------
  function onRescue(e) {
    const detail = e && e.detail ? e.detail : null;
    rescues++;
    if (!active) {
      spawnAt(detail);
      return;
    }
    // Every later rescue patches her up; the second one also upgrades the gun.
    hp = MAX_HP;
    if (downed) {
      downed = false;
      downT = 0;
      downBlend = 0;
    }
    sinceDamage = REGEN_DELAY;
    if (rescues >= 2) setTier(2);
  }

  function hurt(amount) {
    if (!active || downed) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    hp = Math.max(0, hp - n);
    sinceDamage = 0;
    if (hp <= 0) {
      hp = 0;
      downed = true;
      downT = DOWN_TIME;
      aimT = 0;
      shotCd = Math.max(shotCd, 0.5);
      emit("companion-down", { x, z });
    }
  }

  if (bus && typeof bus.addEventListener === "function") {
    bus.addEventListener("survivor-rescued", onRescue);
    bus.addEventListener("explosion", (e) => {
      if (!active || downed) return;
      const p = e && e.detail ? e.detail.position : null;
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
      const dx = p.x - x;
      const dz = p.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= EXPLOSION_RADIUS * EXPLOSION_RADIUS) return;
      hurt(EXPLOSION_DAMAGE * (1 - Math.sqrt(d2) / EXPLOSION_RADIUS));
    });
    bus.addEventListener("settings-changed", (e) => {
      const patch = e && e.detail ? e.detail.patch : null;
      if (patch && Object.prototype.hasOwnProperty.call(patch, "lang")) {
        nameText = tr("companion_mai_plate");
        rebuildNameplate();
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
   * @param {number} tx
   * @param {number} tz
   * @returns {boolean}
   */
  function hasLineOfSight(tx, tz) {
    if (!level || typeof level.isBlocked !== "function") return true;
    const dx = tx - x;
    const dz = tz - z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-6) return true;
    const steps = Math.max(2, Math.ceil(d / LOS_STEP));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (level.isBlocked(x + dx * t, z + dz * t, LOS_RADIUS)) return false;
    }
    return true;
  }

  /**
   * Pick the live zombie nearest the PLAYER among those within SHOT_RANGE of
   * Mai with a clear line of sight. Allocation-free linear scan.
   * @param {number} px
   * @param {number} pz
   * @returns {any|null}
   */
  function findTarget(px, pz) {
    if (!Array.isArray(zombies) || zombies.length === 0) return null;
    let best = null;
    let bestD2 = Infinity;
    const range2 = SHOT_RANGE * SHOT_RANGE;
    for (let i = 0; i < zombies.length; i++) {
      const zb = zombies[i];
      if (!zb || zb.alive === false || !zb.position) continue;
      if (typeof zb.takeDamage !== "function") continue;
      const zx = zb.position.x;
      const zz = zb.position.z;
      if (!Number.isFinite(zx) || !Number.isFinite(zz)) continue;
      const dx = zx - x;
      const dz = zz - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1e-4 || d2 > range2) continue;
      const pdx = zx - px;
      const pdz = zz - pz;
      const pd2 = pdx * pdx + pdz * pdz;
      if (pd2 >= bestD2) continue;
      if (!hasLineOfSight(zx, zz)) continue;
      bestD2 = pd2;
      best = zb;
    }
    return best;
  }

  /**
   * One hitscan shot: sparks at the muzzle + target, 25/35 damage, no
   * headshot, "companion-shot" {target, damage} on the bus.
   * @param {any} target
   */
  function fireAt(target) {
    const tx = target.position.x;
    const tz = target.position.z;
    const ty = Number.isFinite(target.position.y) ? target.position.y : 0;
    let dx = tx - x;
    let dz = tz - z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 1e-6) {
      dx /= d;
      dz /= d;
    } else {
      dx = 0;
      dz = 1;
    }

    // Muzzle roughly at the rifle tip: 0.75 m forward + 0.24 m right.
    tmpMuzzle.set(
      x + dx * 0.75 - dz * 0.24,
      1.32,
      z + dz * 0.75 + dx * 0.24
    );
    tmpHit.set(tx, ty + 1.05, tz);
    if (particles && typeof particles.spawnSpark === "function") {
      particles.spawnSpark(tmpMuzzle);
      particles.spawnSpark(tmpHit);
    }

    const damage = tier >= 2 ? DAMAGE_T2 : DAMAGE_T1;
    target.takeDamage(damage, false);

    if (shotEvent && bus && typeof bus.dispatchEvent === "function") {
      shotDetail.target = target;
      shotDetail.damage = damage;
      bus.dispatchEvent(shotEvent);
    }

    shots++;
    aimT = AIM_HOLD;
    aimX = tx;
    aimZ = tz;
    yaw = Math.atan2(tx - x, tz - z);
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
   * Preferred 3.4 m slot to the player's right; when a wall owns that slot,
   * probe the other seven 45° ring positions. Falls back to standing still.
   * @param {number} px
   * @param {number} pz
   */
  function chooseGoal(px, pz) {
    let gx = px + rightX * FOLLOW_OFFSET;
    let gz = pz + rightZ * FOLLOW_OFFSET;
    if (!blockedAt(gx, gz, COMPANION_RADIUS)) {
      goalX = gx;
      goalZ = gz;
      return;
    }
    const base = Math.atan2(rightZ, rightX);
    for (let k = 1; k < 8; k++) {
      const a = base + (k * TAU) / 8;
      gx = px + Math.cos(a) * FOLLOW_OFFSET;
      gz = pz + Math.sin(a) * FOLLOW_OFFSET;
      if (!blockedAt(gx, gz, COMPANION_RADIUS)) {
        goalX = gx;
        goalZ = gz;
        return;
      }
    }
    goalX = x;
    goalZ = z;
  }

  // --- animation -------------------------------------------------------------
  /**
   * Pose the model from gait (distance driven), downBlend and the lantern
   * pulse. All writes are in place; no allocation.
   * @param {number} step
   * @param {number} moved - metres actually travelled this frame
   * @param {number} px
   * @param {number} pz
   */
  function animate(step, moved, px, pz) {
    const moving = moved > 1e-4;
    gait += ((moving ? 1 : 0) - gait) * Math.min(1, step * 8);
    if (moving) walkPhase += moved * 4.6;
    const s = Math.sin(walkPhase);
    const swing = 0.55 * gait;

    legL.rotation.x = s * swing + downBlend * 1.18;
    legR.rotation.x = -s * swing + downBlend * 0.96;
    armL.rotation.x = -s * 0.38 * gait + downBlend * 0.45;
    armR.rotation.x = -0.92 - s * 0.05 * gait + downBlend * 0.5;

    pose.position.y =
      Math.abs(Math.cos(walkPhase)) * 0.034 * gait - downBlend * 0.44;
    pose.rotation.x = -0.02 * gait + downBlend * 0.34;
    pose.rotation.z = 0.012 * s * gait;

    // Emissive glow pulse — one shared material write, no light object.
    lanternPhase += step * 2.3;
    const pulse = 0.86 + 0.14 * Math.sin(lanternPhase);
    glowMat.color.setRGB(1, 0.78 * pulse, 0.44 * pulse);

    group.position.set(x, 0, z);
    group.rotation.y = yaw;

    if (sprite) {
      sprite.position.set(x, 2.42 + pose.position.y, z);
      const dx = px - x;
      const dz = pz - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > NAMEPLATE_FAR) {
        if (sprite.visible) sprite.visible = false;
      } else {
        if (!sprite.visible) sprite.visible = true;
        const op =
          dist <= NAMEPLATE_NEAR
            ? 1
            : 1 - (dist - NAMEPLATE_NEAR) / (NAMEPLATE_FAR - NAMEPLATE_NEAR);
        if (Math.abs(op - sprite.material.opacity) > 0.01) {
          sprite.material.opacity = op;
        }
      }
    }
  }

  // --- frame update ----------------------------------------------------------
  /**
   * @param {number} dt - seconds (integrator calls this only while playing)
   * @param {{x: number, z: number}=} playerPos - defaults to player.position
   */
  function update(dt, playerPos) {
    if (!active || !Number.isFinite(dt) || dt <= 0) return;
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

    if (shotCd > 0) shotCd -= dt;
    if (aimT > 0) aimT -= dt;

    // --- downed: kneel 12 s, then revive at 50% ------------------------------
    if (downed) {
      downT -= dt;
      downBlend = Math.min(1, downBlend + dt * 5);
      if (downT <= 0) {
        downed = false;
        downT = 0;
        downBlend = 0;
        hp = MAX_HP * REVIVE_FRACTION;
        sinceDamage = 0;
        shotCd = Math.max(shotCd, 0.5);
      }
      animate(dt, 0, px, pz);
      return;
    }
    if (downBlend > 0) downBlend = Math.max(0, downBlend - dt * 5);

    // --- health regen (8 s after the last damage) ---------------------------
    if (sinceDamage < REGEN_DELAY) sinceDamage += dt;
    else if (hp < MAX_HP) hp = Math.min(MAX_HP, hp + REGEN_RATE * dt);

    // --- follow --------------------------------------------------------------
    updateRight();
    chooseGoal(px, pz);
    const gdx = goalX - x;
    const gdz = goalZ - z;
    const gd2 = gdx * gdx + gdz * gdz;
    const pdx = px - x;
    const pdz = pz - z;
    const pd2 = pdx * pdx + pdz * pdz;

    // Ring-follow: beyond 8 m she sprints straight at the 3.4 m ring (fastest
    // catch-up); inside it she travels AROUND the player to the right-hand
    // slot instead of cutting through them. The radial term keeps the
    // distance at 3–6 m; the tangential term does the "get out of the
    // crosshair" slide. Both are allocation-free.
    const pd = Math.sqrt(pd2);
    const outX = pd > 1e-4 ? -pdx / pd : 1; // outward = (x - px, z - pz)
    const outZ = pd > 1e-4 ? -pdz / pd : 0;
    let dirX = 0;
    let dirZ = 0;
    let dirLen = 0;
    let want = 0;

    if (pd2 > FOLLOW_FAR * FOLLOW_FAR) {
      // Sprint catch-up: head straight for the near side of the ring.
      dirX = -outX;
      dirZ = -outZ;
      dirLen = 1;
      want = SPRINT_SPEED;
    } else {
      const currentAng = Math.atan2(-pdz, -pdx); // bearing player → companion
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
      // Literal "closer than 3 m → idle" once she is already in her slot and
      // the player is standing still; a moving player drags the slot along,
      // so the ring logic must keep tracking instead of parking short.
      if (
        pd2 < FOLLOW_NEAR * FOLLOW_NEAR &&
        gd2 < 0.36 &&
        playerMoved2 < 1e-4
      ) {
        want = 0;
      }
    }
    speed += (want - speed) * Math.min(1, dt * ACCEL);
    if (speed < 0.02) speed = 0;

    const oldX = x;
    const oldZ = z;
    if (speed > 0 && dirLen > 1e-4) {
      const gd = Math.sqrt(gd2);
      const stepLen =
        pd2 > FOLLOW_FAR * FOLLOW_FAR
          ? Math.min(speed * dt, Math.max(0, pd - FOLLOW_OFFSET) + 0.05)
          : Math.min(speed * dt, gd + 0.05);
      const stepX = (dirX / dirLen) * stepLen;
      const stepZ = (dirZ / dirLen) * stepLen;
      // Axis-separated sliding, exactly like controller.js / zombie.js.
      if (stepX !== 0 && !blockedAt(x + stepX, z, COMPANION_RADIUS)) x += stepX;
      if (stepZ !== 0 && !blockedAt(x, z + stepZ, COMPANION_RADIUS)) z += stepZ;
    }
    const mx = x - oldX;
    const mz = z - oldZ;
    const moved = Math.sqrt(mx * mx + mz * mz);

    // --- facing: aim > movement > player (inside 8 m) ------------------------
    let faceX = x;
    let faceZ = z;
    let hasFace = false;
    if (aimT > 0) {
      faceX = aimX;
      faceZ = aimZ;
      hasFace = true;
    } else if (moved > 1e-4) {
      faceX = x + mx;
      faceZ = z + mz;
      hasFace = true;
    } else if (pd2 < 64 && pd2 > 1e-6) {
      faceX = px;
      faceZ = pz;
      hasFace = true;
    }
    if (hasFace && Math.abs(faceX - x) + Math.abs(faceZ - z) > 1e-6) {
      const targetYaw = Math.atan2(faceX - x, faceZ - z);
      yaw = turnToward(yaw, targetYaw, TURN_RATE * dt);
    }

    // --- combat: 1.1 s cadence, 5 Hz rescan when nothing is valid -----------
    if (shotCd <= 0) {
      const target = findTarget(px, pz);
      if (target) {
        fireAt(target);
        shotCd = SHOT_COOLDOWN;
      } else {
        shotCd = RETRY_COOLDOWN;
      }
    }

    animate(dt, moved, px, pz);
  }

  // --- public surface --------------------------------------------------------
  /** Fresh snapshot object (debug/HUD); called off the frame loop. */
  function state() {
    return { active, hp, maxHp: MAX_HP, tier, x, z, shots };
  }

  return { update, state, reset };
}
