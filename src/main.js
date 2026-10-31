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
 *   receives playerPos), waves.update, pickups.update, particles.update,
 *   atmosphere.update, gamestate.update, hud.update; paused → render only.
 *   engine.render() every frame.
 * - window.__game.getState() snapshot per src/core/debug.js.
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
import { createPlayer } from "./player/controller.js";
import { createWeapons } from "./player/weapons.js";
import { createCombat } from "./systems/combat.js";
import { createWaves } from "./zombies/waves.js";
import { Zombie } from "./zombies/zombie.js";
import { createHud } from "./ui/hud.js";
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
const waves = createWaves(scene, level, bus);

// --- 14-16. hud + menus + gamestate ---------------------------------------------
const hud = createHud(uiRoot, bus, audio, i18n);
const menus = createMenus(uiRoot, bus, settings, i18n);
const gamestate = createGamestate(bus, settings);

// --- bus wiring -------------------------------------------------------------------

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
});

// Audio routing for emitters that hold no audio reference (frozen signatures).
bus.addEventListener("footstep", () => audio.footstep());
bus.addEventListener("player-hurt", () => audio.playerHurt());
bus.addEventListener("pickup", () => audio.pickup());

// A round left the barrel → hitscan. Synchronous: the camera transform was
// written by player.update earlier this frame and the recoil delta is applied
// in weapons.update AFTER this dispatch, so the shot goes where the player
// aimed (pre-kick) — intended FPS behavior.
bus.addEventListener("fire", (e) => {
  const w = e && e.detail ? e.detail.weapon : null;
  if (w) combat.shoot(w);
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
      menus.show("pause");
      hud.show(true);
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
    particles.update(dt);
    atmosphere.update(dt);
    gamestate.update(dt);
    hud.update(player, weapons.getState(), gamestate);
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
    combat.shoot(w); // hitscan along the camera basis
    audio.gunshot(w.name); // weapons.fire() is bypassed — keep the sound
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
};

const debug = createDebugHook();
debug.register(debugApi); // LAST step of the bootstrap sequence
