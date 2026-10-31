/**
 * Bootstrap + main loop — the ONLY place that owns cross-module wiring.
 *
 * Creation order (spec, frozen):
 *   engine → settings → i18n → audio → input → level → atmosphere →
 *   particles → pickups → player → weapons → combat → waves (zombie manager)
 *   → hud → menus → gamestate → debug.register
 *
 * Extra wiring owned here (see the full event table in src/systems/gamestate.js):
 * - const zombies = [] — created BEFORE combat, passed to createCombat, and
 *   kept in sync by listening "zombie-spawned" (push) / "zombie-despawned"
 *   (remove) on the bus; waves announces those events because its signature
 *   cannot take the array.
 * - bus "fire" {weapon} → combat.shoot(weapon).
 * - bus "footstep" / "player-hurt" / "pickup" → audio.footstep() /
 *   audio.playerHurt() / audio.pickup() (their emitters hold no audio ref).
 * - bus "ui-play"/"ui-resume"/"ui-restart"/"ui-quit" → gamestate.* +
 *   input.lockPointer() (synchronous dispatch keeps the user gesture).
 * - bus "state-changed" → menus.show(...) + hud.show(...) routing
 *   (menu → "main"/false, playing → null/true, paused → "pause"/true,
 *   gameover → "gameover"/false).
 * - bus "settings-changed" {patch} → audio.setVolume(patch.volume) when present.
 * - settings.load() first, then i18n.setLang(settings.get().lang).
 * - waves.reset() on fresh runs; waves.update(dt, player.position) /
 *   pickups.update(dt, player.position) while playing.
 * - requestAnimationFrame loop: dt = engine.update() (already clamped ≤ 0.05);
 *   per state: menu → atmosphere.update + render only; playing →
 *   player.update, weapons.update, zombie updates (main owns them — waves only
 *   receives playerPos), waves.update, pickups.update, explosives.update,
 *   particles.update, atmosphere.update, gamestate.update, hud.update
 *   (4th HudExtras argument: live boss position/hp + camera yaw); paused →
 *   render only. engine.render() every frame.
 * - window.__game.getState() snapshot per src/core/debug.js.
 *
 * EXPANSION wiring (docs/EXPANSION.md — everything below is additive; the
 * creation order of the pre-existing modules is untouched):
 * - zones = createZones(scene, level) right after the level (it imports the
 *   shared bus itself; it self-wires "wave-clear" → unlock and
 *   "wave-start"{n:1} → reset). Passed as the optional 4th createWaves
 *   argument so boss waves spawn at the zone anchors.
 * - explosives = createExplosives(scene, camera, zombies, particles, audio,
 *   bus) after combat (shares the SAME live zombies array); economy + shop
 *   right after weapons (shop needs weapons.list + player); shop UI after hud
 *   (DOM overlay inside #ui). waves gets `zones`.
 * - bus "fire" {weapon}: weapon.explosive (grenade) → explosives.fire(camera
 *   origin, camera dir); everything else → combat.shoot (legacy route).
 * - bus "boss-drops" {position, kinds} → pickups.spawn per kind (boss death
 *   drops are guaranteed; the boss holds no pickups ref — frozen signatures).
 * - bus "boss-roar" {type, action} → audio.zombieGrowl().
 * - bus "boss-spawned" {type, zoneId, hp} → bossRef = the matching live boss
 *   in the shared array (found by type + maxHp, which only bosses carry).
 *   bossRef feeds the hud.update HudExtras argument, debug damageBoss() and
 *   getState().boss. Cleared on the boss's "zombie-killed" /
 *   "zombie-despawned".
 * - freshRun() additionally resets economy / shop / explosives / zones and
 *   drops bossRef + the run-scoped HUD overlays (boss bar, toast, hint).
 * - applyScreenState: a "paused" state with the pause reason "shop" ONLY
 *   (gamestate.hasPause("user") false) keeps the pause MENU hidden — the shop
 *   overlay must not stack above a pause panel; the world is still frozen.
 */

import * as THREE from "three";
import { createEngine } from "./core/engine.js";
import { createSettings } from "./core/settings.js";
import * as i18n from "./core/i18n.js";
import { createAudio } from "./core/audio.js";
import { createInput } from "./core/input.js";
import { createLevel } from "./world/level.js";
import { createAtmosphere } from "./world/atmosphere.js";
import { createParticles } from "./systems/particles.js";
import { createPickups } from "./systems/pickups.js";
import { createExplosives } from "./systems/explosives.js";
import { createEconomy } from "./systems/economy.js";
import { createShop } from "./systems/shop.js";
import { createPlayer } from "./player/controller.js";
import { createWeapons } from "./player/weapons.js";
import { createCombat } from "./systems/combat.js";
import { createWaves } from "./zombies/waves.js";
import { Zombie } from "./zombies/zombie.js";
import { BOSS_CLASSES } from "./zombies/bosses.js";
import { createZones } from "./world/zones.js";
import { createHud } from "./ui/hud.js";
import { createShopUI } from "./ui/shop.js";
import { createMenus } from "./ui/menus.js";
import { bus, createGamestate } from "./systems/gamestate.js";
import { createDebugHook } from "./core/debug.js";

// --- DOM anchors --------------------------------------------------------------

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
if (!canvas) throw new Error("main: <canvas id=\"game\"> is missing from index.html");
const uiRoot = /** @type {HTMLElement} */ (document.getElementById("ui"));
if (!uiRoot) throw new Error("main: <div id=\"ui\"> is missing from index.html");

// --- 1. engine ---------------------------------------------------------------
// Camera must live in the scene graph for its CHILDREN (weapons viewmodel +
// muzzle light) to render — engine.js does not add it. combat.js carries a
// defensive duplicate of this line; adding it here first is canonical and
// makes combat's guard a no-op.
const engine = createEngine(canvas);
const scene = engine.scene;
const camera = engine.camera;
scene.add(camera);

// --- 2-3. settings + i18n (language applied BEFORE any UI is built) -----------
const settings = createSettings();
settings.load();
i18n.setLang(settings.get().lang);

// --- 4-5. audio + input --------------------------------------------------------
const audio = createAudio(settings); // reads settings volume at creation
audio.startAmbient(); // flags the loop on; nodes start once the context exists
const input = createInput(canvas, settings);

// --- 6-9. world -----------------------------------------------------------------
const level = createLevel(scene);
// EXPANSION C1: the two unlockable areas (north/east). Imports the shared bus
// itself (frozen two-arg signature); self-wires wave-clear → unlock and the
// fresh-run wave-start{n:1} → reset. Created BEFORE waves so the wave
// director can take it as its optional 4th argument.
const zones = createZones(scene, level);
const atmosphere = createAtmosphere(scene);
const particles = createParticles(scene);
const pickups = createPickups(scene, bus);

// --- 10-11. player + weapons -----------------------------------------------------
const player = createPlayer(scene, camera, input, level, bus);
const weapons = createWeapons(camera, input, audio, bus);

// --- 12-13. combat + waves (shared zombie array bridges them) --------------------
const zombies = []; // live + dying zombies; combat raycasts against it
const debugZombies = []; // debug-spawned only — outside the wave director's list
const combat = createCombat(camera, scene, zombies, particles, audio, bus);
// EXPANSION B5: grenade projectiles. Shares the SAME live zombies array with
// combat (contact + blast damage read it fresh every update).
const explosives = createExplosives(scene, camera, zombies, particles, audio, bus);
// EXPANSION B1/B2: money + shop. The shop writes ownership flags onto
// weapons.list entries and heals the player — created after both.
const economy = createEconomy(bus);
const shop = createShop(bus, economy, weapons, player);
// EXPANSION C5: the wave director now takes `zones` so boss waves (every 5th)
// spawn one boss at the zone anchor.
const waves = createWaves(scene, level, bus, zones);

// --- 14-16. hud + menus + gamestate ---------------------------------------------
const hud = createHud(uiRoot, bus, audio, i18n);
// EXPANSION B3: the shop overlay (DOM inside #ui, event-driven). After hud so
// its overlay node sits after the HUD root in the DOM; it owns its z-index.
const shopUI = createShopUI(uiRoot, bus, economy, shop, i18n);
const menus = createMenus(uiRoot, bus, settings, i18n);
const gamestate = createGamestate(bus, settings);

// --- bus wiring -------------------------------------------------------------------

// EXPANSION C4/C6: the live boss (bar drain via hud.update extras, debug
// damageBoss/getState). Waves announces "zombie-spawned" for the boss BEFORE
// "boss-spawned", so the boss is already in the shared array here; maxHp
// exists only on bosses, which makes the lookup unambiguous.
let bossRef = /** @type {import("./zombies/zombie.js").Zombie|null} */ (null);

// Shared zombie array sync. Includes() guards the debug path from ever
// double-pushing; despawn is announced once per zombie but splicing a missing
// entry is a no-op anyway (waves.reset() announces before dispose — tolerated).
bus.addEventListener("zombie-spawned", (e) => {
  const z = e && e.detail ? e.detail.zombie : null;
  if (z && zombies.indexOf(z) === -1) zombies.push(z);
});
bus.addEventListener("zombie-despawned", (e) => {
  const z = e && e.detail ? e.detail.zombie : null;
  const i = zombies.indexOf(z);
  if (i !== -1) zombies.splice(i, 1);
  if (bossRef && z === bossRef) bossRef = null; // freshRun / waves.reset disposal
});

// Audio routing for emitters that hold no audio reference (frozen signatures).
bus.addEventListener("footstep", () => audio.footstep());
bus.addEventListener("player-hurt", () => audio.playerHurt());
bus.addEventListener("pickup", () => audio.pickup());

// A round left the barrel → hitscan — EXCEPT the grenade (EXPANSION B5 +
// integration note 3): its "fire" carries weapon.explosive and must become a
// lobbed projectile, never a combat ray. Synchronous either way: the camera
// transform was written by player.update earlier this frame and the recoil
// delta is applied in weapons.update AFTER this dispatch, so the shot goes
// where the player aimed (pre-kick) — intended FPS behavior.
bus.addEventListener("fire", (e) => {
  const w = e && e.detail ? e.detail.weapon : null;
  if (!w) return;
  if (w.explosive === true) {
    camera.updateMatrixWorld();
    camera.getWorldPosition(tmpPos);
    camera.getWorldDirection(tmpDir);
    explosives.fire(tmpPos, tmpDir);
  } else {
    combat.shoot(w);
  }
});

// EXPANSION C4: boss death drops are GUARANTEED (1 medkit + 1 ammo) but the
// boss constructor cannot reach pickups — this event is the bridge. Unknown
// kinds are ignored; the payload's fallback keeps the contract shape.
bus.addEventListener("boss-drops", (e) => {
  const d = e && e.detail ? e.detail : null;
  if (!d || !d.position) return;
  const kinds =
    Array.isArray(d.kinds) && d.kinds.length > 0
      ? d.kinds
      : ["health", "ammo"];
  for (const kind of kinds) {
    if (kind === "health" || kind === "ammo") pickups.spawn(d.position, kind);
  }
});

// EXPANSION C4: boss voices (butcher windup / screamer shriek / golem slam).
// audio.js is frozen — the closest existing voice is the ambient growl.
bus.addEventListener("boss-roar", () => audio.zombieGrowl());

// EXPANSION C6: track the live boss for the HUD boss bar drain + arrow.
bus.addEventListener("boss-spawned", (e) => {
  const d = e && e.detail ? e.detail : {};
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (z && z.alive && z.type === d.type && Number.isFinite(z.maxHp)) {
      bossRef = z;
      return;
    }
  }
});

// The boss bar (HUD) hides on the same event; main drops its reference here.
bus.addEventListener("zombie-killed", (e) => {
  const d = e && e.detail ? e.detail : {};
  if (bossRef && d.type && d.type === bossRef.type) bossRef = null;
});

// --- state ↔ UI routing -----------------------------------------------------------

/** Which menu screen / HUD visibility belongs to each gamestate. */
function applyScreenState(state) {
  switch (state) {
    case "playing":
      menus.show(null);
      hud.show(true);
      break;
    case "paused":
      // EXPANSION: pause is reason-based. A shop-only pause (the shop overlay
      // is open) keeps the world frozen but shows NO pause menu — the overlay
      // would stack above it and the reasons are the shop UI's business.
      if (gamestate.hasPause("user")) {
        menus.show("pause");
        hud.show(true);
      } else {
        menus.show(null);
        hud.show(true);
      }
      break;
    case "gameover":
      menus.show("gameover");
      hud.show(false);
      break;
    case "menu":
    default:
      menus.show("main");
      hud.show(false);
      break;
  }
}
bus.addEventListener("state-changed", (e) => {
  const st = e && e.detail ? e.detail.state : null;
  if (st) applyScreenState(st);
});

// Menu buttons. Everything below stays inside the click's synchronous dispatch,
// so input.lockPointer() keeps the browser's user activation (Pointer Lock).
function freshRun() {
  waves.reset(); // disposes every zombie + announces "zombie-despawned" per one
  // Debug-spawned zombies are outside the wave director's tracked list —
  // despawn them the same way (announce, then dispose) so the shared array
  // and the scene stay in sync across restarts.
  for (let i = 0; i < debugZombies.length; i++) {
    const z = debugZombies[i];
    if (!z) continue;
    bus.dispatchEvent(new CustomEvent("zombie-despawned", { detail: { zombie: z } }));
    z.dispose();
  }
  debugZombies.length = 0;
  pickups.reset(); // clear dropped items
  player.reset(); // hp 100, alive, position (0,0,0), camera to spawn facing
  weapons.reset(); // full mags/reserves, pistol out (beyond-contract extra)
  // particles: the pool drains itself (lifetime ≤ 0.8 s) — nothing to clear.
  // --- EXPANSION fresh-run resets (beyond-contract extras, idempotent) -----
  economy.reset(); // money to 0 (economy also self-resets on ui-play/restart)
  shop.reset(); // forget bought guns — weapons.reset() just un-owned them
  explosives.reset(); // clear live grenades + pending blast FX/shake
  zones.reset(); // re-lock both areas ("wave-start"{n:1} repeats this no-op)
  bossRef = null;
  // Drop run-scoped HUD overlays (boss bar, toast, hint, kill feed) so a
  // restart mid-boss never resurrects a dead boss bar: the "playing"
  // state-changed below deliberately does NOT clear them (resume() passes
  // through the same state mid-boss), so clear here, before show(true).
  hud.show(false);
}

bus.addEventListener("ui-play", () => {
  freshRun();
  gamestate.start();
  input.lockPointer();
});
bus.addEventListener("ui-resume", () => {
  gamestate.resume();
  input.lockPointer();
});
bus.addEventListener("ui-restart", () => {
  freshRun();
  gamestate.restart();
  input.lockPointer();
});
bus.addEventListener("ui-quit", () => {
  freshRun();
  gamestate.toMenu();
});

// Live volume from the settings screen (menus already persisted it).
bus.addEventListener("settings-changed", (e) => {
  const patch = e && e.detail ? e.detail.patch : null;
  if (patch && Object.prototype.hasOwnProperty.call(patch, "volume")) {
    audio.setVolume(patch.volume);
  }
});

// Initial screen: gamestate boots in "menu" without emitting an event.
applyScreenState(gamestate.state);

// --- zombie per-frame updates (main owns them — see waves.js header) -------------

function updateZombies(dt) {
  // Backwards so a despawn during a zombie's own update (corpse finished
  // fading → synchronous splice) can never skip the next index.
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (!z) {
      zombies.splice(i, 1);
      continue;
    }
    z.update(dt, player, level, zombies);
  }
}

// --- ambient growls (audio.js delegates scheduling to main) -----------------------

let growlTimer = 2.5;

/** XZ distance to the nearest LIVE zombie; Infinity when none. */
function nearestZombieDist() {
  let nearest = Infinity;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z || !z.alive || !z.position) continue;
    const dx = z.position.x - player.position.x;
    const dz = z.position.z - player.position.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < nearest) nearest = d;
  }
  return nearest;
}

function updateGrowls(dt) {
  growlTimer -= dt;
  if (growlTimer > 0) return;
  growlTimer = 2.5 + Math.random() * 4.5; // next growl in 2.5–7 s
  const d = nearestZombieDist();
  if (d < 20 && Math.random() < 0.8) audio.zombieGrowl();
}

// --- hud.update HudExtras (EXPANSION C6, zero per-frame allocation) -----------
// The optional 4th hud.update() argument: the live boss (position/hp for the
// boss bar drain) + camera yaw (the out-of-view boss arrow is a 2D guide).
// Without a live boss the boss field is null — the bar then relies purely on
// its "boss-spawned"/"zombie-killed" events and the arrow stays hidden.
const hudExtrasScratch = { boss: null, yaw: 0 };
const hudBossScratch = { position: null, hp: 0, maxHp: 0, type: "" };

function hudExtras() {
  if (bossRef && bossRef.alive) {
    hudBossScratch.position = bossRef.position;
    hudBossScratch.hp = bossRef.hp;
    hudBossScratch.maxHp = bossRef.maxHp;
    hudBossScratch.type = bossRef.type;
    hudExtrasScratch.boss = hudBossScratch;
  } else {
    hudExtrasScratch.boss = null;
  }
  hudExtrasScratch.yaw = camera.rotation.y; // controller writes yaw (order "YXZ")
  return hudExtrasScratch;
}

// --- main loop ---------------------------------------------------------------------

function frame() {
  requestAnimationFrame(frame);

  let dt = engine.update(); // seconds, already clamped ≤ 0.05 by the engine
  if (!Number.isFinite(dt) || dt < 0) dt = 0;
  else if (dt > 0.05) dt = 0.05; // belt & suspenders against future edits

  const st = gamestate.state;
  if (st === "playing") {
    player.update(dt); // writes camera yaw/pitch/bob absolutely
    if (player.alive) weapons.update(dt); // layers recoil DELTA on top; fires
    updateZombies(dt); // chase/attack (attacks call player.damage → death can flip state here)
    waves.update(dt, player.position);
    pickups.update(dt, player.position);
    explosives.update(dt); // EXPANSION B5: grenade flight/detonation + shake decay
    particles.update(dt);
    atmosphere.update(dt);
    gamestate.update(dt);
    hud.update(player, weapons.getState(), gamestate, hudExtras());
    updateGrowls(dt);
  } else if (st === "gameover") {
    // The world keeps breathing behind the panel: corpses finish their fade,
    // blood drains, lamps flicker. Live zombies stand idle (they never chase a
    // dead player) and no wave logic runs.
    updateZombies(dt);
    particles.update(dt);
    atmosphere.update(dt);
  } else if (st === "menu") {
    atmosphere.update(dt); // zombies deliberately do NOT update in the menu
  }
  // paused: render only.

  engine.render();
}
requestAnimationFrame(frame);

// --- debug API (registered LAST per the bootstrap order) ----------------------------

const ARENA_LIMIT = 29; // playable half-extent minus wall margin
const tmpDir = new THREE.Vector3();
const tmpPos = new THREE.Vector3();
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
// The four expansion guns synthesize their shots inside weapons.js (and the
// grenade's boom belongs to explosives.js) — audio.gunshot() has no voice for
// them, so debug fireWeapon() stays silent instead of faking a pistol crack.
const SYNTH_GUNS = { smg: true, sniper: true, minigun: true, grenade: true };

/**
 * Find a clear default spawn: ~6 m in front of the camera (ground plane),
 * backing off to 3 m if blocked; fall back to the farthest clear spawn point.
 */
function findFrontSpawn() {
  camera.updateMatrixWorld();
  camera.getWorldDirection(tmpDir);
  tmpDir.y = 0;
  if (tmpDir.lengthSq() < 1e-4) tmpDir.set(0, 0, -1); // looking straight up/down
  tmpDir.normalize();
  const px = camera.position.x;
  const pz = camera.position.z;
  for (const d of [6, 5, 4, 3]) {
    const tx = clamp(px + tmpDir.x * d, -ARENA_LIMIT, ARENA_LIMIT);
    const tz = clamp(pz + tmpDir.z * d, -ARENA_LIMIT, ARENA_LIMIT);
    if (!level.isBlocked(tx, tz, 0.5)) return { x: tx, z: tz };
  }
  // All camera-forward candidates blocked → farthest clear level spawn point.
  let best = null;
  let bestD = -1;
  for (const p of level.spawnPoints) {
    if (level.isBlocked(p.x, p.z, 0.5)) continue;
    const dx = p.x - px;
    const dz = p.z - pz;
    const d = dx * dx + dz * dz;
    if (d > bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ? { x: best.x, z: best.z } : { x: 0, z: 0 }; // origin is clear by layout
}

const debugApi = {
  startGame() {
    freshRun();
    gamestate.restart(); // pointer lock silently fails outside a gesture — fine for debug
    return { state: gamestate.state };
  },

  getState() {
    const w = weapons.getState();
    const nd = nearestZombieDist();
    let alive = 0;
    for (let i = 0; i < zombies.length; i++) {
      if (zombies[i] && zombies[i].alive) alive++;
    }
    return {
      state: gamestate.state,
      hp: player.hp,
      score: gamestate.score,
      wave: gamestate.wave,
      zombiesAlive: alive,
      playerPos: {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
      },
      nearestZombieDist: Number.isFinite(nd) ? nd : null,
      weapon: { name: w.name, mag: w.mag, reserve: w.reserve },
      // EXPANSION additions (docs/EXPANSION.md debug table).
      money: economy.get(),
      boss:
        bossRef && bossRef.alive
          ? { type: bossRef.type, hp: bossRef.hp, maxHp: bossRef.maxHp }
          : null,
      unlockedZones: zones.list
        .filter((zn) => zn.unlocked)
        .map((zn) => zn.id),
      ownedWeapons: shop.owned(),
    };
  },

  /**
   * Spawn one debug zombie. Default (no x/z): ~6 m in front of the camera.
   * Debug spawns do NOT affect wave accounting — they enter the shared array
   * via the event and the debugZombies list, which freshRun() drains on every
   * restart so they never leak into the next run.
   */
  spawnZombie(type, x, z) {
    const kind = typeof type === "string" && type ? type : "walker";
    let px = Number(x);
    let pz = Number(z);
    if (!Number.isFinite(px) || !Number.isFinite(pz)) {
      const spot = findFrontSpawn();
      px = spot.x;
      pz = spot.z;
    }
    const zombie = new Zombie(scene, kind, tmpPos.set(px, 0, pz), bus);
    debugZombies.push(zombie);
    bus.dispatchEvent(new CustomEvent("zombie-spawned", { detail: { zombie } }));
    return zombie;
  },

  damagePlayer(n) {
    const v = Number(n);
    player.damage(Number.isFinite(v) && v > 0 ? v : 10); // default 10 per debug.js
    return { hp: player.hp, alive: player.alive };
  },

  /** One shot along the current camera direction; honest about the mag. */
  fireWeapon() {
    const w = weapons.getState();
    if (!w || w.mag <= 0) return { fired: false, ammo: 0 };
    w.mag -= 1;
    // Same routes as the live trigger: grenade → explosives.fire (B5), the
    // rest → combat.shoot hitscan.
    if (w.explosive === true) {
      camera.updateMatrixWorld();
      camera.getWorldPosition(tmpPos);
      camera.getWorldDirection(tmpDir);
      explosives.fire(tmpPos, tmpDir);
    } else {
      combat.shoot(w); // hitscan along the camera basis
    }
    // weapons.fire() is bypassed here — keep the sound for the three launch
    // guns exactly as before. The four expansion guns synthesize inside
    // weapons.js (audio.gunshot has no voice for them — it would fall through
    // to the pistol crack), and the grenade's boom belongs to explosives.js.
    if (!SYNTH_GUNS[w.name]) audio.gunshot(w.name);
    return { fired: true, ammo: w.mag };
  },

  switchWeapon(i) {
    const idx = Number.isInteger(i)
      ? i
      : (weapons.current + 1) % weapons.list.length;
    weapons.switchTo(idx);
    const w = weapons.getState();
    return { current: weapons.current, name: w.name };
  },

  reload() {
    weapons.reload();
    const w = weapons.getState();
    return { name: w.name, reloading: w.reloading, mag: w.mag };
  },

  giveAmmo() {
    const filled = [];
    for (let i = 0; i < weapons.list.length; i++) {
      const w = weapons.list[i];
      if (!Number.isFinite(w.reserve)) continue; // pistol stays Infinity
      w.reserve = w.magSize * 5;
      filled.push({ name: w.name, reserve: w.reserve });
    }
    return { filled };
  },

  // --- EXPANSION debug api (docs/EXPANSION.md "main.js MỞ RỘNG") -----------

  /** Add n money (negative spends down to 0 via economy.add's clamp). */
  giveMoney(n) {
    const v = Number(n);
    economy.add(Number.isFinite(v) ? v : 0);
    return { money: economy.get() };
  },

  /** Buy any catalog id (the 4 guns, "ammo", "medkit") through the shop. */
  buy(id) {
    return shop.buy(String(id == null ? "" : id));
  },

  /** Buy a weapon through the shop (same call as buy — named per the doc). */
  buyWeapon(id) {
    return shop.buy(String(id == null ? "" : id));
  },

  /** Open/close the shop overlay; opening no-ops outside a live run. */
  toggleShop() {
    if (shopUI.isOpen()) shopUI.close(false);
    else shopUI.open();
    return { open: shopUI.isOpen() };
  },

  /**
   * Spawn one boss. Default: the zone anchor for the current wave (cycles
   * north/east with the boss order; falls back to the farthest spawn logic
   * inside zones.bossAnchorFor). inFront → ~12 m before the camera, stepping
   * closer when blocked (isBlocked covers the zones too). Debug bosses are
   * drained by freshRun() like every debug spawn and never affect wave
   * accounting (no `summoned` flag, not in the wave director's list).
   */
  spawnBoss(type, inFront) {
    const Ctor = BOSS_CLASSES[type];
    if (typeof Ctor !== "function") {
      return { error: "unknown-boss-type", valid: Object.keys(BOSS_CLASSES) };
    }
    let x;
    let z;
    let zoneId = "main";
    if (inFront) {
      camera.updateMatrixWorld();
      camera.getWorldDirection(tmpDir);
      tmpDir.y = 0;
      if (tmpDir.lengthSq() < 1e-4) tmpDir.set(0, 0, -1); // looking straight up/down
      tmpDir.normalize();
      let spot = null;
      for (const d of [12, 10, 8, 6, 4]) {
        const tx = camera.position.x + tmpDir.x * d;
        const tz = camera.position.z + tmpDir.z * d;
        if (!level.isBlocked(tx, tz, 0.6)) {
          spot = { x: tx, z: tz };
          break;
        }
      }
      if (!spot) spot = findFrontSpawn();
      x = spot.x;
      z = spot.z;
    } else {
      const anchor = zones.bossAnchorFor(Math.max(1, gamestate.wave));
      zoneId = anchor.zoneId;
      x = anchor.x;
      z = anchor.z;
      if (level.isBlocked(x, z, 0.6)) {
        const p = findFrontSpawn();
        x = p.x;
        z = p.z;
        zoneId = "main";
      }
    }
    const boss = new Ctor(scene, Math.max(1, gamestate.wave), tmpPos.set(x, 0, z), bus);
    debugZombies.push(boss);
    bus.dispatchEvent(new CustomEvent("zombie-spawned", { detail: { zombie: boss } }));
    bus.dispatchEvent(
      new CustomEvent("boss-spawned", { detail: { type: boss.type, zoneId, hp: boss.hp } })
    );
    return { type: boss.type, hp: boss.hp, maxHp: boss.maxHp, zoneId, x, z };
  },

  /** Damage the live boss (default 100); golem applies its −25% inside. */
  damageBoss(n) {
    if (!bossRef || !bossRef.alive) return { error: "no-boss-alive" };
    const v = Number(n);
    const killed = bossRef.takeDamage(Number.isFinite(v) && v > 0 ? v : 100, false);
    return {
      type: bossRef.type,
      hp: bossRef.hp,
      maxHp: bossRef.maxHp,
      killed: killed === true,
    };
  },

  /** Teleport the player to a zone's center ("main" = arena origin). */
  teleport(zoneId) {
    const id = String(zoneId == null ? "" : zoneId);
    let x = 0;
    let z = 0;
    let zone = "main";
    if (id !== "main" && id !== "arena") {
      let target = null;
      for (let i = 0; i < zones.list.length; i++) {
        if (zones.list[i].id === id) {
          target = zones.list[i];
          break;
        }
      }
      if (!target) {
        return {
          error: "unknown-zone",
          valid: ["main"].concat(zones.list.map((zn) => zn.id)),
        };
      }
      zone = target.id;
      x = (target.bounds.minX + target.bounds.maxX) / 2;
      z = (target.bounds.minZ + target.bounds.maxZ) / 2;
    }
    player.velocity.set(0, 0, 0);
    player.position.set(x, 0, z); // camera follows on the next player.update
    return { zone, x, z };
  },

  /** Unlock one expansion zone (idempotent; may also open zones already due). */
  unlockZone(id) {
    const wanted = String(id == null ? "" : id);
    let target = null;
    for (let i = 0; i < zones.list.length; i++) {
      if (zones.list[i].id === wanted) {
        target = zones.list[i];
        break;
      }
    }
    if (!target) {
      return { error: "unknown-zone", valid: zones.list.map((zn) => zn.id) };
    }
    const opened = zones.unlockForWave(target.unlockWave); // idempotent unlock
    return {
      unlocked: zones.list.filter((zn) => zn.unlocked).map((zn) => zn.id),
      openedByThisCall: opened,
    };
  },
};

const debug = createDebugHook();
debug.register(debugApi); // LAST step of the bootstrap sequence
