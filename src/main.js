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
 *
 * NIGHT 30 P1 wiring (docs/EXPANSION-P1.md §5.6 — everything below is
 * additive; the pre-existing creation order keeps its relative sequence):
 * - city = createCity(scene, level) right after zones (gates + colliders must
 *   exist before waves/player); missions = createMissions(bus, city, economy,
 *   scene, level) after shop, BEFORE waves (§5.1.3: scene + level are the
 *   additive 4th/5th params that materialize the POI meshes + colliders);
 *   dialogue = createDialogue(uiRoot, bus, i18n) after menus; waves receives
 *   `city` as its new optional 5th argument (district spawn pools, cap 60,
 *   density multipliers).
 * - Player spawn story (§5.6.2.2): every fresh run plants the player at the
 *   safehouse yard (−75, 8) facing east (the compound gate) through the
 *   additive player.reset(yaw, x, z) hook — (0, 0) now only ever happens via
 *   a bare player.reset() (none left in main.js).
 * - Story flow (§5.6.2.3 + §5.6.3): PLAY (from the menu, or PLAY AGAIN at
 *   mission 1) = fresh story → "intro" slides → beginPlay() + missions.begin().
 *   PLAY AGAIN after a death at mission ≥ 2 of a story run keeps the mission
 *   progress AND the money (the "story-keep" window — §5.6.3: they are kept
 *   or wiped together, never split), skips the intro, respawns at the
 *   safehouse and re-announces the live mission for the HUD tracker. PLAY
 *   AGAIN after a free-roam death replays free-roam (no intro). CHƠI TỰ DO =
 *   fresh run + missions.begin() immediately, story-mode left off (legacy
 *   zones behavior).
 * - "gate-open" {from, to} → city.setGateOpen (missions is the only emitter);
 *   "mission-complete" → economy.add(reward), done-dialogue (none for m9 —
 *   the outro plays instead), M6 additionally unlocks north/east via
 *   zones.unlockForWave; "mission-start" → start-dialogue + an M8 boss spawn
 *   through the same mechanics as debug spawnBoss. A fresh story re-seals
 *   every city gate (missions.reset() owns the story side only).
 * - Fresh story arms the zones story-guard ("story-mode" events, §5.6.4) so
 *   wave-clear can no longer open north/east — they are quarantine interior,
 *   sealed until mission 6.
 * - Main loop: missions.update(dt, player.position) after waves.update while
 *   playing; hud.update extras gain `district` (city.districtAt, zero-alloc);
 *   "intro" updates the world exactly like "menu" (atmosphere + render) with
 *   the camera parked at the story spawn.
 * - Debug API additions (§5.6.5): startStory(), skipToMission(n),
 *   completeObjective(), fillQuota(), teleportDistrict(id) (BFS route, opens
 *   each gate on the shortest path, drops at the district center) and
 *   getState() += { story, currentDistrict, unlockedDistricts }.
 *
 * NIGHT 30 P2 wiring (docs/EXPANSION-P2.md §8 — everything below is additive;
 * the pre-existing creation order keeps its relative sequence):
 * - events = createEvents(bus, city, audio, hooks, scene) after dialogue
 *   (§8.1): hooks.spawnRunner builds one runner through the SAME path as
 *   debug spawnZombie (jitter + isBlocked like waves.js:556-566, pushed into
 *   debugZombies + "zombie-spawned" — outside wave accounting) and RETURNS
 *   the Zombie so the survivor ring can watch .alive; hooks.supplyOpened
 *   pays the crate loot DIRECTLY (P2-K5 — no pickups.spawn, which clamps
 *   into the arena rects): economy.add(200–400) + "pickup"{kind:"health"}
 *   (+40 HP) + full ammo for the CURRENT gun, returning the money so the
 *   "event-end" toast can show it; hooks.activeMission clamps
 *   missions.current to 0..9 (P2-K3). `scene` is events.js's additive 5th
 *   param (supply crate / survivor meshes).
 * - map = createMap(uiRoot, bus, city) — the read-only M overlay (listens
 *   "map-toggle" itself; emits "map-visibility").
 * - Main loop (§8.2): audio.update3D(camera, zombies) right after
 *   updateZombies; events.update(dt, player.position) after missions.update;
 *   map.update(player, mapExtras()) on a 10 Hz timer.
 * - freshRun(): events.reset() next to zones.reset() — events are world
 *   state and reset on EVERY fresh run (§8.3, story-keep included);
 *   map.show(false) as belt & suspenders (the map also closes itself on
 *   every state ≠ "playing").
 * - "survivor-rescued" (§8.5) → economy.add(300) + "pickup"{kind:"health"}
 *   + the event_survivor_thanks line through the queued dialogue path.
 * - The legacy "boss-roar" → audio.zombieGrowl() route is REMOVED (P2-K9):
 *   audio.js listens to "boss-roar" itself and plays the real boss voice.
 * - hud.update extras gain `mission` + `event` (P2-K13: main derives the
 *   mission marker — first incomplete objective: reach → o.x/o.z,
 *   quota/survive → district center, activate/collect → the quota
 *   district's center of the same mission, m1 → safehouse center); map
 *   extras add `boss` + `yaw`. Event coordinates come from the
 *   "event-start"/"event-end" payloads (a newest-wins stack matching
 *   events.active()).
 * - Debug API (§8.7): forceEvent(type), audioState(), and getState() +=
 *   { event, bloodmoon }.
 */

import * as THREE from "three";
import { createEngine } from "./core/engine.js";
import { createSettings } from "./core/settings.js";
import * as i18n from "./core/i18n.js";
import { createAudio } from "./core/audio.js";
import { createInput } from "./core/input.js";
import { createLevel } from "./world/level.js";
import { createCity } from "./world/city.js";
import { createAtmosphere } from "./world/atmosphere.js";
import { createParticles } from "./systems/particles.js";
import { createPickups } from "./systems/pickups.js";
import { createExplosives } from "./systems/explosives.js";
import { createEconomy } from "./systems/economy.js";
import { createShop } from "./systems/shop.js";
import { createMissions, STORY_DIALOGUE } from "./systems/missions.js";
import { createEvents } from "./systems/events.js"; // NIGHT 30 P2 §8.1
import { createPlayer } from "./player/controller.js";
import { createWeapons } from "./player/weapons.js";
import { createCombat } from "./systems/combat.js";
import { createWaves } from "./zombies/waves.js";
import { Zombie } from "./zombies/zombie.js";
import { BOSS_CLASSES, bossTypeForWave } from "./zombies/bosses.js";
import { createZones } from "./world/zones.js";
import { createHud } from "./ui/hud.js";
import { createShopUI } from "./ui/shop.js";
import { createMenus } from "./ui/menus.js";
import { createDialogue } from "./ui/dialogue.js";
import { createMap } from "./ui/map.js"; // NIGHT 30 P2 §8.1
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
// NIGHT 30 P1 (§5.6.2.1): the open city builds itself around the legacy
// quarantine arena — pushes its colliders into level, registers the 12 gate
// waypoints + open state into level through the private hooks, and arms the
// dev-guard. Must exist before waves (district spawn pools) and the player.
const city = createCity(scene, level);
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
//
// NIGHT 30 P1 §5.6.3 story-keep CAPTURE — registered BEFORE economy so that,
// during the "ui-play"/"ui-restart" dispatch, the nested "story-keep" event
// reaches economy's hold flag BEFORE its own defensive fresh-run reset runs
// (listener order = registration order). The decision: a PLAY AGAIN from the
// gameover screen of a STORY run that reached mission ≥ 2 keeps the mission
// progress AND the money (§5.6.3 — kept or wiped together, never split);
// everything else resets clean. `missions`/`gamestate` are referenced lazily
// (TDZ-safe: no ui-* event can fire before the bootstrap finishes).
let storyRun = false; // the last run was started as STORY (PLAY), not free-roam
let keepStory = false; // decision for the ui-play currently being dispatched
bus.addEventListener("ui-play", () => {
  keepStory =
    gamestate.state === "gameover" && storyRun && missions.current >= 2;
  bus.dispatchEvent(
    new CustomEvent("story-keep", { detail: { hold: keepStory } })
  );
});
bus.addEventListener("ui-restart", () => {
  // Pause-menu RESTART is a clean reset — always lift the hold (§5.6.3 only
  // redefines the gameover PLAY AGAIN path).
  keepStory = false;
  bus.dispatchEvent(new CustomEvent("story-keep", { detail: { hold: false } }));
});
const economy = createEconomy(bus);
const shop = createShop(bus, economy, weapons, player);
// NIGHT 30 P1 (§5.6.2.1): missions after economy/shop, BEFORE waves. Scene +
// level passed through the additive params (§5.1.3) so the POI meshes, the
// beacon and the POI colliders are real; headless otherwise.
const missions = createMissions(bus, city, economy, scene, level);
// EXPANSION C5: the wave director now takes `zones` so boss waves (every 5th)
// spawn one boss at the zone anchor. NIGHT 30 P1 §4.2: `city` as the new
// optional 5th argument — district spawn pools, 60-alive cap, density
// multipliers (legacy pool when absent, which the debug harness relies on).
const waves = createWaves(scene, level, bus, zones, city);

// --- 14-16. hud + menus + gamestate ---------------------------------------------
const hud = createHud(uiRoot, bus, audio, i18n);
// EXPANSION B3: the shop overlay (DOM inside #ui, event-driven). After hud so
// its overlay node sits after the HUD root in the DOM; it owns its z-index.
const shopUI = createShopUI(uiRoot, bus, economy, shop, i18n);
const menus = createMenus(uiRoot, bus, settings, i18n);
const gamestate = createGamestate(bus, settings);
// NIGHT 30 P1 (§5.6.2.1): dialogue after menus — the bottom dialogue box, the
// intro slides and the outro overlay (self-styled inside #ui).
const dialogue = createDialogue(uiRoot, bus, i18n);

// --- NIGHT 30 P2 (§8.1): random events + the M map ---------------------------
// events gets the main-owned callbacks (P2-K6) + the world scene (events.js
// additive 5th param — supply crate / survivor / smoke FX). spawnEventRunner
// is a hoisted function declaration near the other spawn helpers, so the
// reference below is valid at creation time; the hook bodies only ever RUN
// during gameplay. Missing hooks would degrade to event-without-zombies
// (events.js warns once) — the integrator contract says they MUST be passed.
const events = createEvents(bus, city, audio, {
  // §3.1 typedef: build one runner AT (x, z) and RETURN it so the survivor
  // ring can watch .alive. Debug-path spawn → no wave accounting (§3.1).
  spawnRunner: spawnEventRunner,
  // P2-K5: the loot is APPLIED here, not dropped as physical items (pickups
  // .spawn clamps into the legacy arena rects — a park/docks crate would
  // teleport the loot ~100 m). Returns the money for the "event-end" toast.
  supplyOpened() {
    const money = 200 + Math.round(Math.random() * 200); // §3.4: 200–400
    economy.add(money);
    // +40 HP (cap 100): the controller already listens "pickup" {kind:
    // "health"} and main routes the same event to audio.pickup().
    bus.dispatchEvent(new CustomEvent("pickup", { detail: { kind: "health" } }));
    // Full ammo for the CURRENT gun: mag = magSize, reserve = startReserve
    // (pistol keeps Infinity) — direct mutation like debug giveAmmo (§3.4.3).
    const w = weapons.list[weapons.current];
    if (w) {
      w.mag = w.magSize;
      if (Number.isFinite(w.reserve)) w.reserve = w.startReserve;
    }
    return money;
  },
  // P2-K3: missions.current is 0 (not started) .. 9, 10 = free-roam → clamp.
  activeMission() {
    return Math.min(Math.max(missions.current, 0), 9);
  },
}, scene);
// The read-only M overlay inside #ui (listens "map-toggle" from input.js
// itself and emits "map-visibility"; pointer-events stay off).
const map = createMap(uiRoot, bus, city);

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

// NIGHT 30 P2 (P2-K9): the legacy "boss-roar" → audio.zombieGrowl() route is
// GONE — audio.js subscribes to "boss-roar" itself and plays the real boss
// voice per the §5.2 matrix (windup → metal roar, spit → wet spit, shriek →
// high wail, slam → stone groan).

// NIGHT 30 P2 §8.5: the survivor rescue pays through main (events.js holds
// no economy/dialogue refs): $300, +40 HP as a direct "pickup" (P2-K5 — the
// controller heals, main routes the sound), and ONE thank-you line through
// the queued dialogue path (§5.6.2.3 queue so it never eats a briefing).
bus.addEventListener("survivor-rescued", () => {
  economy.add(300);
  bus.dispatchEvent(new CustomEvent("pickup", { detail: { kind: "health" } }));
  showDialogue([
    { speakerKey: "speaker_unknown", text: i18n.t("event_survivor_thanks") },
  ]);
});

// §8.4: the live event marker for the compass strip + map. events.active()
// is frozen to {type, timeLeft} per spec, so the coordinates come from the
// "event-start" payloads; overlapping events stack (newest last, matching
// active()'s newest-first shape) and every "event-end" (incl. reason
// "reset") pops its type. Same-type restarts self-heal by replacing.
const eventMarkers = /** @type {Array<{type: string, x: number|null, z: number|null}>} */ ([]);
bus.addEventListener("event-start", (e) => {
  const d = e && e.detail ? e.detail : {};
  const type = String(d.type || "");
  if (!type) return;
  for (let i = 0; i < eventMarkers.length; i++) {
    if (eventMarkers[i].type === type) {
      eventMarkers.splice(i, 1);
      break;
    }
  }
  eventMarkers.push({
    type,
    x: Number.isFinite(d.x) ? Number(d.x) : null, // null for bloodmoon
    z: Number.isFinite(d.z) ? Number(d.z) : null,
  });
});
bus.addEventListener("event-end", (e) => {
  const d = e && e.detail ? e.detail : {};
  const type = String(d.type || "");
  for (let i = eventMarkers.length - 1; i >= 0; i--) {
    if (eventMarkers[i].type === type) eventMarkers.splice(i, 1);
  }
});
/** Newest still-active event marker (matches events.active()) or null. */
function activeEventMarker() {
  return eventMarkers.length > 0 ? eventMarkers[eventMarkers.length - 1] : null;
}

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
    case "intro":
      // NIGHT 30 P1 (§5.6.1): the story slides run over the dimmed world — no
      // menus, no HUD; input.js already freed the cursor for slide clicks.
      menus.show(null);
      hud.show(false);
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
//
// NIGHT 30 P1 story spawn (§5.6.2.2, WORLD.md §11): the safehouse yard, camera
// facing EAST — toward the compound gate at x −55. yaw −π/2 faces +X
// (forward = (−sin yaw, −cos yaw)). Applied to EVERY fresh run (story AND
// free-roam: mission 1 needs the generators); the origin is debug-only now.
const STORY_SPAWN_YAW = -Math.PI / 2;
const STORY_SPAWN_X = -75;
const STORY_SPAWN_Z = 8;

/** P1: a fresh world (story OR free) starts with every city gate re-sealed —
 * missions.reset() owns the story bookkeeping but never un-fires gate-open,
 * so main closes them here. Idempotent: already-closed gates are no-ops. */
function closeAllCityGates() {
  for (let i = 0; i < city.districts.length; i++) {
    const d = city.districts[i];
    for (let g = 0; g < d.gates.length; g++) {
      city.setGateOpen(d.id, d.gates[g].to, false);
    }
  }
}

/**
 * Reset the whole world for a new run. `keepStoryProgress` (NIGHT 30 P1
 * §5.6.3) is true ONLY for the death-restart of a story run at mission ≥ 2:
 * the world resets but the mission chain + money stay (economy's hold window
 * is armed by the story-keep capture above), the safehouse spawn re-plants,
 * and — if the run is already past mission 6 — the north/east interiors are
 * re-opened (zones.reset() below re-sealed them).
 */
function freshRun(keepStoryProgress) {
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
  player.reset(STORY_SPAWN_YAW, STORY_SPAWN_X, STORY_SPAWN_Z); // P1 story spawn
  weapons.reset(); // full mags/reserves, pistol out (beyond-contract extra)
  // particles: the pool drains itself (lifetime ≤ 0.8 s) — nothing to clear.
  // --- EXPANSION fresh-run resets (beyond-contract extras, idempotent) -----
  if (!keepStoryProgress) economy.reset(); // §5.6.3: kept when story keeps
  shop.reset(); // forget bought guns — weapons.reset() just un-owned them
  explosives.reset(); // clear live grenades + pending blast FX/shake
  zones.reset(); // re-lock both areas ("wave-start"{n:1} repeats this no-op)
  // NIGHT 30 P2 §8.3: events are WORLD state — reset on EVERY fresh run
  // (story-keep included). events.reset() emits "bloodmoon-active"
  // {active:false} + per-event "event-end" {reason:"reset"} first, so the
  // waves/economy/atmosphere/audio multipliers drop before the next run.
  events.reset();
  map.show(false); // close the M overlay with the run (map also self-closes
  //                   on every state ≠ "playing" — this is belt & suspenders)
  if (keepStoryProgress && missions.current > 6) {
    // Past mission 6 the interiors belong to the run — unseal again (the
    // unlockForWave path is the same one mission 6's completion used).
    zones.unlockForWave(Number.MAX_SAFE_INTEGER);
  }
  bossRef = null;
  if (!keepStoryProgress) {
    closeAllCityGates(); // fresh world: every gate back to red/locked
    missions.reset(); // §5.6.2.5 (skipped when §5.6.3 keeps the progress)
  }
  dialogue.hide(); // drop any mid-flight dialogue from the previous run
  resetDialogueQueue(); // hide() drops the onDone — the queue must forget too
  // Drop run-scoped HUD overlays (boss bar, toast, hint, kill feed) so a
  // restart mid-boss never resurrects a dead boss bar: the "playing"
  // state-changed below deliberately does NOT clear them (resume() passes
  // through the same state mid-boss), so clear here, before show(true).
  hud.show(false);
}

// --- NIGHT 30 P1 story flow (§5.6.2.3, §5.6.4) ---------------------------------

/** Arm/disarm the zones story-guard (§5.6.4). */
function storyMode(active) {
  bus.dispatchEvent(new CustomEvent("story-mode", { detail: { active } }));
}

/** STORY_DIALOGUE m{n} lines → dialogue.show() payloads (§5.1.5 + STORY.md
 * §0: {speakerKey, text}; dialogue resolves the label + portrait tint). */
function dialogueLines(kind, index) {
  const entry = STORY_DIALOGUE["m" + index];
  if (!entry) return [];
  const list = kind === "done" ? entry.done : entry.start;
  const lines = [];
  for (let i = 0; i < list.length; i++) {
    lines.push({
      speakerKey: "speaker_" + list[i].speaker,
      text: i18n.t(list[i].key),
    });
  }
  return lines;
}

/** Full fresh story: world reset (gates re-sealed, zones re-locked, missions
 * reset) → story-mode armed → state "intro" (the state-changed listener below
 * plays the slides and calls missions.begin() after them). */
function beginFreshStory() {
  storyMode(false); // §5.6.4 order: {active:false} → zones.reset → missions.reset → {active:true}
  freshRun(false); // zones.reset() + closeAllCityGates() + missions.reset() inside
  storyRun = true;
  keepStory = false;
  storyMode(true);
  gamestate.startStory(); // → "intro"; intro listener drives slides → beginPlay
}

/** §5.6.3 keep-progress death-restart: the HUD cleared its story widgets on
 * gameover (mission-reset never fired — missions state is intact), so rebuild
 * the tracker/quota chip from the live mission. The re-announced
 * "mission-start" also re-arms waves' m7–m8 horde density after waves.reset().
 * Dialogue is suppressed (the player already heard the mission briefing). */
let suppressStartDialogue = false;
function reAnnounceMission() {
  const s = missions.getState();
  if (!(s.mission >= 1 && s.mission <= 9)) return;
  suppressStartDialogue = true;
  bus.dispatchEvent(
    new CustomEvent("mission-start", {
      detail: {
        index: s.mission,
        titleKey: s.titleKey,
        objectives: missions.objectives, // the LIVE array — HUD stays in sync
      },
    })
  );
}

bus.addEventListener("ui-play", () => {
  if (keepStory) {
    // PLAY AGAIN after a death at mission ≥ 2 of a story run (§5.6.3):
    // world reset, story + money kept, straight back into the fight — the
    // intro is a story-START experience, not a respawn experience.
    freshRun(true);
    storyMode(true); // re-assert (idempotent) after the zones.reset above
    gamestate.start(); // → playing directly
    reAnnounceMission();
  } else if (gamestate.state === "gameover" && !storyRun) {
    // PLAY AGAIN after a FREE-ROAM death (§5.6.3 "từ CHƠI TỰ DO": clean reset
    // like before) — free replay, no intro slides, mission 1 re-activated.
    storyMode(false);
    freshRun(false);
    storyRun = false;
    keepStory = false;
    gamestate.start();
    missions.begin();
  } else {
    // PLAY from the menu — and PLAY AGAIN of a story run that never got past
    // mission 1 (§5.6.3 "chưa hoàn thành gì": clean reset). Story start.
    beginFreshStory();
  }
  input.lockPointer();
});
bus.addEventListener("ui-play-free", () => {
  // NIGHT 30 P1 (§5.5.2 + §5.6.2.3 + §5.6.4): CHƠI TỰ DO — fresh run, NO intro
  // slides, mission 1 active immediately. Story-guard stays ARMED: quarantine
  // interior stays sealed until mission 6 even in free-roam (WORLD.md §12.1).
  storyMode(true);
  freshRun(false);
  storyRun = false;
  keepStory = false;
  gamestate.start(); // → playing directly
  missions.begin(); // m1 active + mission-start (its dialogue shows — contract)
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

// §5.6.2.3: entering "intro" plays the New Game slides; finishing (or
// skipping through) them flips to playing and activates mission 1.
bus.addEventListener("state-changed", (e) => {
  const st = e && e.detail ? e.detail.state : null;
  if (st !== "intro") return;
  dialogue.showIntro(
    ["intro_s1", "intro_s2", "intro_s3", "intro_s4"].map((k) => i18n.t(k)),
    () => {
      gamestate.beginPlay();
      missions.begin(); // m1 active + mission-start → start-dialogue
    }
  );
});

// --- NIGHT 30 P1 mission/gate wiring (§5.6.2.3, §6) -----------------------------

// missions is the ONLY "gate-open" emitter (§4.3) — the world obeys here.
bus.addEventListener("gate-open", (e) => {
  const d = e && e.detail ? e.detail : {};
  city.setGateOpen(d.from, d.to, true);
});

// Dialogue sequencing (integration fix): missions.checkMissionComplete fires
// "mission-complete" AND the next "mission-start" in ONE synchronous cascade —
// showing the briefing immediately would REPLACE the done-lines before the
// player reads them. The queue plays the done sequence out, then the briefing.
let dialogueBusy = false;
let queuedDialogue = null;
function showDialogue(lines) {
  if (!lines || lines.length === 0) return;
  if (dialogueBusy) {
    queuedDialogue = lines;
    return;
  }
  dialogueBusy = true;
  dialogue.show(lines, () => {
    dialogueBusy = false;
    if (queuedDialogue) {
      const next = queuedDialogue;
      queuedDialogue = null;
      showDialogue(next);
    }
  });
}
/** freshRun drops the box through dialogue.hide() (no onDone) — the queue
 * flags must reset with it or every later dialogue would pile up queued. */
function resetDialogueQueue() {
  dialogueBusy = false;
  queuedDialogue = null;
}

// Mission briefings (dialogue) + the M8 warden spawn. The re-announce path
// (§5.6.3) suppresses only the dialogue — waves still re-arms its horde flag.
bus.addEventListener("mission-start", (e) => {
  const d = e && e.detail ? e.detail : {};
  const idx = Math.round(Number(d.index));
  if (!suppressStartDialogue && idx >= 1 && idx <= 9) {
    showDialogue(dialogueLines("start", idx));
  }
  suppressStartDialogue = false;
  if (idx === 8) spawnStoryBoss(); // §5.6.2.3: M8 activation → one boss
});

// Rewards are main's job (§8: missions never touches economy). m1–m8 play
// their done-dialogue; m9 has none (STORY.md §3) — the outro plays instead.
// M6 completion also unseals the quarantine interiors (§5.6.2.3, WORLD.md
// §12.1) through zones.unlockForWave — the story-guard only gates the
// wave-clear automation, never this direct path.
bus.addEventListener("mission-complete", (e) => {
  const d = e && e.detail ? e.detail : {};
  const idx = Math.round(Number(d.index));
  const reward = Math.max(0, Math.round(Number(d.reward) || 0));
  economy.add(reward);
  if (idx === 6) zones.unlockForWave(Number.MAX_SAFE_INTEGER);
  if (idx >= 1 && idx <= 8) showDialogue(dialogueLines("done", idx));
  if (idx === 9) {
    dialogue.showOutro(
      ["story_outro_line1", "story_outro_line2", "story_outro_line3"].map(
        (k) => i18n.t(k)
      ),
      () => {
        /* free-roam continues (WF-3 replaces the outro with the real ending) */
      }
    );
  }
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

// --- hud.update HudExtras (EXPANSION C6 + NIGHT 30 P1, zero per-frame alloc) --
// The optional 4th hud.update() argument: the live boss (position/hp for the
// boss bar drain) + camera yaw (the out-of-view boss arrow is a 2D guide) +
// the player's current district (P1 §5.4.5 — the quota chip "🧟 12/20" only
// shows while the player stands in the quota district). Without a live boss
// the boss field is null; `district` is ALWAYS present (string|null) so the
// HUD's hasOwnProperty gate stays true.
const hudExtrasScratch = {
  boss: null,
  yaw: 0,
  district: null,
  mission: null, // NIGHT 30 P2 §8.4 (P2-K13): {x, z} | null
  event: null, // NIGHT 30 P2 §8.4: {type, x, z} | null (bloodmoon → null: the
  //               strip marker needs finite coords, hud.readExtras skips null)
};
const hudBossScratch = { position: null, hp: 0, maxHp: 0, type: "" };
const hudMissionScratch = { x: 0, z: 0 }; // reused — zero per-frame alloc
const hudEventScratch = { type: "", x: 0, z: 0 };
// mapExtras (§8.4): the map's 10 Hz argument — boss + yaw + mission/event.
const mapExtrasScratch = { boss: null, yaw: 0, mission: null, event: null };
const mapBossScratch = { x: 0, z: 0, type: "" };
let mapTimer = 0; // 10 Hz map repaint accumulator (§4.0/§8.2)

/**
 * NIGHT 30 P2 (P2-K13): the mission marker for the map + compass. Derives
 * from the LIVE objectives array (missions.objectives) — the first
 * INCOMPLETE objective decides, mirroring missions' own beaconTarget():
 * reach → its POI coords (o.x/o.z from the mission-start payload);
 * quota/survive → that district's center via city.districts;
 * activate/collect → the center of the QUOTA district of the same mission
 * (m1 has no quota → the safehouse center −75, 8 = city's record);
 * boss → no fixed point (the live boss marker covers it); all complete →
 * null. Fills hudMissionScratch in place — callers must not mutate it.
 * @returns {{x: number, z: number}|null}
 */
function missionMarker() {
  const objs = missions.objectives;
  if (!Array.isArray(objs) || objs.length === 0) return null;
  let o = null;
  for (let i = 0; i < objs.length; i++) {
    const ob = objs[i];
    if (ob && ob.complete !== true) {
      o = ob;
      break;
    }
  }
  if (!o) return null;
  if (o.type === "reach") {
    if (Number.isFinite(o.x) && Number.isFinite(o.z)) {
      hudMissionScratch.x = o.x;
      hudMissionScratch.z = o.z;
      return hudMissionScratch;
    }
    return null;
  }
  let districtId = null;
  if (o.type === "quota" || o.type === "survive") {
    districtId = typeof o.district === "string" ? o.district : null;
  } else if (o.type === "activate" || o.type === "collect") {
    // The quota district of the SAME mission; m1 (activate only) → safehouse.
    for (let i = 0; i < objs.length; i++) {
      const ob = objs[i];
      if (ob && ob.type === "quota" && typeof ob.district === "string") {
        districtId = ob.district;
        break;
      }
    }
    if (!districtId) districtId = "safehouse";
  } else {
    return null; // "boss": no fixed point
  }
  const d = city.districts.find((x) => x.id === districtId);
  if (d && d.center && Number.isFinite(d.center.x) && Number.isFinite(d.center.z)) {
    hudMissionScratch.x = d.center.x;
    hudMissionScratch.z = d.center.z;
    return hudMissionScratch;
  }
  return null;
}

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
  hudExtrasScratch.district = city.districtAt(
    player.position.x,
    player.position.z
  );
  // NIGHT 30 P2 (§8.4): mission + event markers for the compass strip. The
  // event marker passes finite coords only — bloodmoon carries none and the
  // HUD must not point the strip at the origin.
  hudExtrasScratch.mission = missionMarker();
  const em = activeEventMarker();
  if (em && em.x !== null && em.z !== null) {
    hudEventScratch.type = em.type;
    hudEventScratch.x = em.x;
    hudEventScratch.z = em.z;
    hudExtrasScratch.event = hudEventScratch;
  } else {
    hudExtrasScratch.event = null;
  }
  return hudExtrasScratch;
}

/**
 * NIGHT 30 P2 (§8.4): the 10 Hz map.update() argument — boss (live bossRef),
 * camera yaw, and the same mission/event markers (the map tolerates x/z null
 * for bloodmoon — its own bus cache owns the countdown + red wash).
 * @returns {{boss: {x: number, z: number, type: string}|null, yaw: number,
 *            mission: {x: number, z: number}|null,
 *            event: {type: string, x: number|null, z: number|null}|null}}
 */
function mapExtras() {
  if (bossRef && bossRef.alive) {
    mapBossScratch.x = bossRef.position.x;
    mapBossScratch.z = bossRef.position.z;
    mapBossScratch.type = bossRef.type;
    mapExtrasScratch.boss = mapBossScratch;
  } else {
    mapExtrasScratch.boss = null;
  }
  mapExtrasScratch.yaw = camera.rotation.y;
  mapExtrasScratch.mission = missionMarker();
  mapExtrasScratch.event = activeEventMarker();
  return mapExtrasScratch;
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
    audio.update3D(camera, zombies); // NIGHT 30 P2 §8.2: 3D voice mix + murmur (1×/frame, after the zombie pass)
    waves.update(dt, player.position);
    missions.update(dt, player.position); // NIGHT 30 P1 §5.6.2.4: after waves.update
    events.update(dt, player.position); // NIGHT 30 P2 §8.2: after missions.update (playing-only → pause freezes the scheduler)
    pickups.update(dt, player.position);
    explosives.update(dt); // EXPANSION B5: grenade flight/detonation + shake decay
    particles.update(dt);
    atmosphere.update(dt, player.position); // P1 §5.7: moon shadow follows
    gamestate.update(dt);
    hud.update(player, weapons.getState(), gamestate, hudExtras());
    // NIGHT 30 P2 §8.2: the M overlay repaints at 10 Hz (map.js also paints
    // itself immediately on every open/toggle).
    mapTimer += dt;
    if (mapTimer >= 0.1) {
      mapTimer = 0;
      map.update(player, mapExtras());
    }
    updateGrowls(dt);
  } else if (st === "gameover") {
    // The world keeps breathing behind the panel: corpses finish their fade,
    // blood drains, lamps flicker. Live zombies stand idle (they never chase a
    // dead player) and no wave logic runs.
    updateZombies(dt);
    particles.update(dt);
    atmosphere.update(dt, player.position);
  } else if (st === "menu" || st === "intro") {
    // NIGHT 30 P1 §5.6.2.6: "intro" updates the world exactly like "menu" —
    // atmosphere only (the story slides render over the parked spawn view).
    atmosphere.update(dt, player.position); // zombies deliberately do NOT update
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

// --- NIGHT 30 P1 district-graph helpers (§5.6.5) --------------------------------

/**
 * BFS shortest route between two districts over the gate graph (open state is
 * IGNORED — the debug teleport opens what it walks through). Returns the list
 * of gates to open in order, [] when already there, null when unreachable.
 * @returns {Array<{from: string, to: string}>|null}
 */
function districtRoute(fromId, toId) {
  if (fromId === toId) return [];
  /** @type {Map<string, {via: string, gate: {from: string, to: string}}|null>} */
  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length > 0) {
    const cur = queue.shift();
    const d = city.districts.find((x) => x.id === cur);
    if (!d) continue;
    for (let i = 0; i < d.gates.length; i++) {
      const to = d.gates[i].to;
      if (prev.has(to)) continue;
      prev.set(to, { via: cur, gate: { from: cur, to } });
      if (to === toId) {
        const path = [];
        let step = toId;
        while (step !== fromId) {
          const rec = prev.get(step);
          path.push(rec.gate);
          step = rec.via;
        }
        return path.reverse();
      }
      queue.push(to);
    }
  }
  return null;
}

/** Districts reachable from `startId` through OPEN gates only (BFS). */
function reachableDistricts(startId) {
  const seen = new Set([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const cur = queue.shift();
    const d = city.districts.find((x) => x.id === cur);
    if (!d) continue;
    for (let i = 0; i < d.gates.length; i++) {
      const to = d.gates[i].to;
      if (seen.has(to)) continue;
      const gate = city.gateBetween(cur, to);
      if (gate && gate.open) {
        seen.add(to);
        queue.push(to);
      }
    }
  }
  return Array.from(seen);
}

// --- NIGHT 30 P2 event spawn hook (docs/EXPANSION-P2.md §3.1, P2-K6) ------------

/** Lateral scatter so consecutive horde/survivor spawns don't stack — the
 * waves.js jitter value (JITTER = 0.7, waves.js:149). */
const EVENT_JITTER = 0.7;

/**
 * One runner AT (x, z) for the P2 events (horde burst / survivor ring) —
 * the EXACT spawn path of debug spawnZombie(): jitter + isBlocked retries
 * like waves.js:570-589, pushed into debugZombies (freshRun drains them,
 * wave accounting untouched) and announced through "zombie-spawned" so the
 * shared array, combat and audio.update3D all see it. Returns the Zombie so
 * events.js can watch .alive (null return → events treat it as dead).
 * @param {number} x
 * @param {number} z
 * @returns {import("./zombies/zombie.js").Zombie|null}
 */
function spawnEventRunner(x, z) {
  const bx = Number(x);
  const bz = Number(z);
  if (!Number.isFinite(bx) || !Number.isFinite(bz)) return null;
  // Jitter the point, skipping samples that land inside a collider; if all
  // of them do, fall back to the raw point (clear by events' pool design —
  // waves.js:570-589 pattern).
  let px = bx;
  let pz = bz;
  const canTest = typeof level.isBlocked === "function";
  for (let i = 0; i < 4; i++) {
    const jx = bx + (Math.random() * 2 - 1) * EVENT_JITTER;
    const jz = bz + (Math.random() * 2 - 1) * EVENT_JITTER;
    if (!canTest || !level.isBlocked(jx, jz, 0.4)) {
      px = jx;
      pz = jz;
      break;
    }
  }
  const zombie = new Zombie(scene, "runner", tmpPos.set(px, 0, pz), bus);
  debugZombies.push(zombie);
  bus.dispatchEvent(new CustomEvent("zombie-spawned", { detail: { zombie } }));
  return zombie;
}

/**
 * One boss through the debug mechanics (§5.6.5: "dùng cơ chế spawnBoss hiện
 * có") — shared by the debug spawnBoss() API and the mission-8 activation.
 * Enters the shared array via "zombie-spawned", announced with "boss-spawned",
 * tracked in debugZombies so freshRun() drains it. Wave accounting untouched.
 */
function spawnBossInternal(type, inFront) {
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
}

/** §5.6.2.3: the mission-8 activation spawns ONE warden at the current boss
 * anchor (type follows the wave cycle — any boss satisfies the objective). */
function spawnStoryBoss() {
  return spawnBossInternal(bossTypeForWave(Math.max(1, gamestate.wave)), false);
}

const debugApi = {
  startGame() {
    freshRun();
    gamestate.restart(); // pointer lock silently fails outside a gesture — fine for debug
    return { state: gamestate.state };
  },

  getState() {
    const w = weapons.getState();
    const evSnapshot = events.active(); // NIGHT 30 P2 §8.7 ({type, timeLeft}|null)
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
      // NIGHT 30 P1 additions (docs/EXPANSION-P1.md §5.6.5): the story
      // snapshot (missions.getState() = {mission, titleKey, quotaDone,
      // quotaNeed, quotaDistrict, objectives}), the district the player
      // stands in, and everything reachable from the safehouse through
      // OPEN gates (BFS).
      story: missions.getState(),
      currentDistrict: city.districtAt(player.position.x, player.position.z),
      unlockedDistricts: reachableDistricts("safehouse"),
      // NIGHT 30 P2 additions (docs/EXPANSION-P2.md §8.7): the newest active
      // event ({type, timeLeft}|null) and the bloodmoon flag derived from it.
      event: evSnapshot,
      bloodmoon: !!(evSnapshot && evSnapshot.type === "bloodmoon"),
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
    // FEATURE A case 1 parity: the live trigger arms its one-shot auto-reload
    // inside weapons.fire(); this debug shot bypassed fire(), so arm it here
    // under the same condition (mag just hit 0, reserve > 0 — weapons.js
    // checks, main.js does not duplicate the rule). A mag-emptying debug shot
    // must reload 0.35 s later exactly like a live one.
    weapons.armAutoReloadAfterShot();
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
   * NIGHT 30 P1: the body moved to spawnBossInternal() so the mission-8
   * activation (§5.6.2.3) drives the exact same mechanics.
   */
  spawnBoss(type, inFront) {
    return spawnBossInternal(type, inFront);
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
      // Locked zones are SEALED (feature C1: solid rect incl. the gate until
      // unlockForWave) — a debug teleport would trap the player inside, so
      // open the zone first (idempotent; same path as unlockZone()).
      zones.unlockForWave(target.unlockWave);
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

  // --- NIGHT 30 P1 debug API (docs/EXPANSION-P1.md §5.6.5) ----------------

  /** Fresh story run: world reset → story-mode armed → intro slides (identical
   * to pressing PLAY; pointer lock silently fails outside a gesture — fine). */
  startStory() {
    beginFreshStory();
    return { state: gamestate.state };
  },

  /**
   * Mark m1..m(n−1) done (missions fires their gate-open + synthetic
   * quota-done so the world opens and waves' density matches), then activate
   * mission n + emit "mission-start". Without a live run it first boots a
   * debug story run (intro slides skipped — this is a debug jump, not a show).
   */
  skipToMission(n) {
    const st = gamestate.state;
    if (st !== "playing" && st !== "paused") {
      if (st === "intro") {
        gamestate.beginPlay();
        dialogue.hide(); // debug jump: no slides over the fight
      } else {
        beginFreshStory();
        gamestate.beginPlay();
        dialogue.hide();
      }
    }
    const ok = missions.skipToMission(n);
    return { ok, mission: missions.current, state: gamestate.state };
  },

  /** Force-complete the first unfinished objective of the active mission. */
  completeObjective() {
    const ok = missions.completeObjective();
    return { ok, story: missions.getState() };
  },

  /** Fill the active mission's quota objective (+ quota-done when it lands). */
  fillQuota() {
    const ok = missions.fillQuota();
    return { ok, story: missions.getState() };
  },

  /**
   * Teleport to a district center, opening EVERY gate along the BFS shortest
   * route (debug-only — mission bookkeeping untouched). The quarantine center
   * (0, 0) IS the vault door (solid, §3.2), so blocked centers step out to the
   * nearest clear offset (main.js:696-726 open-before-teleport pattern).
   */
  teleportDistrict(id) {
    const wanted = String(id == null ? "" : id);
    const to = city.districts.find((d) => d.id === wanted);
    if (!to) {
      return {
        error: "unknown-district",
        valid: city.districts.map((d) => d.id),
      };
    }
    const from =
      city.districtAt(player.position.x, player.position.z) || "safehouse";
    const route = districtRoute(from, wanted);
    if (route === null) {
      return { error: "unreachable", from, target: wanted };
    }
    const opened = [];
    for (let i = 0; i < route.length; i++) {
      if (city.setGateOpen(route[i].from, route[i].to, true)) {
        opened.push(route[i].from + "->" + route[i].to);
      }
    }
    let cx = to.center.x;
    let cz = to.center.z;
    if (level.isBlocked(cx, cz, 0.5)) {
      const offs = [
        [0, 4], [0, -4], [4, 0], [-4, 0], [0, 8], [0, -8], [8, 0], [-8, 0],
      ];
      for (const [ox, oz] of offs) {
        if (!level.isBlocked(cx + ox, cz + oz, 0.5)) {
          cx += ox;
          cz += oz;
          break;
        }
      }
    }
    player.velocity.set(0, 0, 0);
    player.position.set(cx, 0, cz); // camera follows on the next player.update
    return { from, target: wanted, opened, x: cx, z: cz };
  },

  // --- NIGHT 30 P2 debug API (docs/EXPANSION-P2.md §8.7) -------------------

  /**
   * Start `type` ("horde"|"supply"|"survivor"|"bloodmoon") right now —
   * events.forceEvent skips the cooldown but still respects the bloodmoon
   * exclusion rules (§3.2): bloodmoon needs an empty board, everything else
   * is blocked while bloodmoon runs. Unknown type → {ok:false, valid:[...]}.
   */
  forceEvent(type) {
    const ok = events.forceEvent(String(type == null ? "" : type));
    return ok
      ? { ok: true, event: events.active() }
      : { ok: false, valid: ["horde", "supply", "survivor", "bloodmoon"] };
  },

  /** Live audio-voice snapshot (§5.4): context state + concurrent voices. */
  audioState() {
    return audio.audioState();
  },
};

const debug = createDebugHook();
debug.register(debugApi); // LAST step of the bootstrap sequence
