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
 *
 * NIGHT 30 P3 wiring (docs/EXPANSION-P3.md §6 — everything below is additive;
 * the pre-existing creation order keeps its relative sequence):
 * - ending = createEnding(uiRoot, bus, gamestate, audio, i18n, camera) after
 *   the map (§6.1). Its update(dt) runs EVERY frame OUTSIDE the state branches
 *   (the ending sequence plays under pause reason "ending"), right before
 *   engine.render().
 * - ORIGIN (P3-K5): the trigger is main's "mission-start" listener —
 *   index 10 → city.openVault() + spawnOriginInternal() (the same debug
 *   mechanics as spawnBossInternal: debugZombies + "zombie-spawned" +
 *   "boss-spawned" {type:"origin", zoneId:"quarantine"}). Origin announces
 *   "origin-alive" itself (events.js freezes its scheduler); it also emits
 *   "origin-shake" {power} → explosives.shake(power) (P3-K8).
 * - P3-K6: originRef is tracked SEPARATELY from bossRef; liveBoss() returns
 *   the Origin while it lives and feeds hudExtras/mapExtras/damageBoss/
 *   getState().boss (the Origin outranks a regular boss wave).
 * - "origin-defeated" → originRef = null + the big death FX (spawnBlood 40 +
 *   spark ×3 + shake(2)); "player-died" → originRef = null (P3-K7 — the
 *   PLAY AGAIN re-announce of m10 respawns a full-hp Origin from the vault).
 * - Ending buttons (P3-K13): "ui-continue" → input.lockPointer() (the pause
 *   reason drops through ending.hide()'s "ending-active" {active:false});
 *   "ui-ngplus" → beginNGPlus() (P3-K15: freshRun(true) story-keep road +
 *   explicit missions.reset()/gates/vault close, weapons re-owned by id,
 *   gamestate.ngPlus = true + "ng-plus" {active:true}).
 * - freshRun() additionally closes the vault (fresh worlds), hides the ending
 *   overlay (idempotent) and re-emits "ng-plus" {active: gamestate.ngPlus}
 *   after waves.reset() so a death-restart inside an NG+ run re-arms the
 *   multipliers (waves.reset() clears its local flag — §4.7).
 * - P3-K2 guard widening (9 → 10): the mission-start dialogue window and the
 *   reAnnounceMission window now cover m10; the events.activeMission hook
 *   clamps 0..10 (11 = free-roam). The m9 showOutro block is GONE (P3-K4 —
 *   the real ending replaced it).
 * - Debug API (§6.4): spawnOrigin(), damageOrigin(n), originState(),
 * skipToEnding(); getState() += { origin, ngPlus }.
 *
 * GUN GAME 2.0 P4 wiring (docs/EXPANSION-P4.md §7 — everything below is
 * additive; the pre-existing creation order keeps its relative sequence):
 * - BOOTSTRAP (P4-K19): after `ending` the order is profile → save →
 *   gamestate.saveDeps = { saveNow } → endless → achievements → menus (menus
 *   MOVED down here and gains the 5th `services` argument
 *   { save, profile, achievements }). Nothing between the old menus position
 *   and here reads `menus` at evaluation time (applyScreenState only runs on
 *   events / after the bootstrap), so the move is side-effect free.
 * - BOOT-SEED (P4-K19): one "settings-changed" {patch:{difficulty}} fires
 *   right after waves creation so its difficulty cache starts correct;
 *   main's own cache is seeded directly from settings (the event fires before
 *   main's listener is registered).
 * - DIFFICULTY (P4-K15): main caches {hpMul, dmgMul, densityMul} from
 *   "settings-changed" and shapes its OWN spawn paths — event runners
 *   (spawnEventRunner), debug spawnZombie, the debug/m8 boss
 *   (spawnBossInternal) and the ORIGIN (spawnOriginInternal: the instance
 *   already bakes the NG+ ×1.25 at construction, main multiplies the
 *   difficulty preset on top — same value as 3000 × hpMul × ngPlus).
 * - SAVE (§3.1-3.4): buildSaveSnapshot() feeds createSave; the gamestate 4
 *   triggers ("mission-complete"/"wave-clear"/"player-died"/"ui-quit") reach
 *   it through gamestate.saveDeps. beginFreshStory() calls
 *   save.saveNow("story-start") FIRST (P4-K1 trigger 5). "ui-continue" from
 *   the menu (P4-K2) restores §3.4: money, weapons.applySaveState,
 *   missions.skipToMission / begin, zone + gate unlock, story re-arm,
 *   startStory()+beginPlay() (intro slides dropped by dialogue.hide()).
 * - ENDLESS (§5.4): "ui-endless" → storyMode(false) → ngPlus=false →
 *   freshRun(false) → teleportDistrictInternal("quarantine") → endless.start()
 *   → difficulty re-seed ("settings-changed" — waves.reset() inside
 *   endless.start() cleared the P4-K15 cache) → gamestate.start() →
 *   lockPointer. endless.update(dt) + profile.update(dt)
 *   run in the playing branch; hudExtras gain `endless` + `cam` (P4-K12/K16).
 *   "endless-over" → menus.show("endlessOver") (P4-K13). ui-quit/ui-restart
 *   drop the mode first (endless.stop() — idempotent), and an `endlessRun`
 *   guard keeps the endless gameover frame from autosaving a dead run as a
 *   story save (the §3.3 state gate alone lets "gameover" through).
 * - UPGRADES (P4-K6): NG+ / NG+ death-restart capture owned weapons'
 *   upgrade levels via weapons.getStats() BEFORE the reset and restore them
 *   with weapons.setUpgrades() after the re-own (same road as the owned ids).
 * - COMBAT (§7.2): combat.js emits "damage-dealt" per landed pellet (HUD
 *   floating numbers); DEBUG (§7.3): saveNow/hasSave/endlessState/
 *   achievementsState/setDifficulty + getState() += {save, endless,
 *   difficulty}.
 */

import * as THREE from "three";
import { createEngine } from "./core/engine.js";
import { createSettings } from "./core/settings.js";
import * as i18n from "./core/i18n.js";
import { createAudio } from "./core/audio.js";
import { createMusic } from "./core/music.js";
import { createInput } from "./core/input.js";
import { createLevel } from "./world/level.js";
import { createCity } from "./world/city.js";
import { createVegetation } from "./world/vegetation.js";
import { createScenery } from "./world/scenery.js";
import { createHazards } from "./world/hazards.js";
import { createWeather } from "./world/weather.js";
import { createWildlife } from "./world/wildlife.js";
import { createSurvivors } from "./world/survivors.js";
import { createAtmosphere } from "./world/atmosphere.js";
import { createParticles } from "./systems/particles.js";
import { createPickups } from "./systems/pickups.js";
import { createExplosives } from "./systems/explosives.js";
import { createThrowables } from "./systems/throwables.js";
import { createEconomy } from "./systems/economy.js";
import { createShop } from "./systems/shop.js";
import { createMerchant } from "./systems/merchant.js";
import { createPerks } from "./systems/perks.js";
import { createContracts } from "./systems/contracts.js";
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
import { createMerchantUI } from "./ui/merchant.js";
import { createPerksUI } from "./ui/perks.js";
import { createPerksHud } from "./ui/perks-hud.js";
import { createContractsUI } from "./ui/contracts.js";
import { createArmorHud } from "./ui/armor-hud.js";
import { createThrowablesHud } from "./ui/throwables-hud.js";
import { createMenus } from "./ui/menus.js";
import { createDialogue } from "./ui/dialogue.js";
import { createMap } from "./ui/map.js"; // NIGHT 30 P2 §8.1
import { createHelp } from "./ui/help.js"; // controls reference overlay (H)
import { createTutorial } from "./ui/tutorial.js"; // first-run onboarding
import { createOrigin, ORIGIN_MAX_HP } from "./zombies/origin.js"; // NIGHT 30 P3 §3.1
import { createEnding } from "./ui/ending.js"; // NIGHT 30 P3 §4.1
import { createSave } from "./systems/save.js"; // GUN GAME 2.0 P4 §3.1
import { createEndless } from "./systems/endless.js"; // GUN GAME 2.0 P4 §5.2
import { createProfile } from "./systems/profile.js"; // GUN GAME 2.0 P4 §5.3
import { createAchievements } from "./systems/achievements.js"; // GUN GAME 2.0 P4 §6.1
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
const music = createMusic(bus, settings); // adaptive procedural soundtrack
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
// Vegetation: 54 extra trees (live + dead) spread across all 7 districts,
// with trunk colliders. Static geometry, deterministic seed, no per-frame cost.
const vegetation = createVegetation(scene, level, city);
// Set dressing: moon disc, skyline, lamp shafts, fire barrels, rubble,
// sandbags, puddles, fireflies. Static except a cheap per-frame drift/flicker.
const scenery = createScenery(scene, level, city);
const weather = createWeather(scene, bus, settings, camera);
const wildlife = createWildlife(scene, bus, level, city);
const survivors = createSurvivors(scene, bus, level, city, i18n, camera);
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
// Throwable inventory: frag / molotov / proximity mine (F throw, V cycle).
const throwables = createThrowables(scene, camera, zombies, particles, bus);
// Chain-reacting red barrels / gas canisters across the districts.
const hazards = createHazards(scene, bus, level, city, zombies, particles);
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
    gamestate.state === "gameover" && storyRun &&
    (missions.current >= 2 ||
      // NIGHT 30 P3 (P3-K15): an NG+ run STARTS at mission 1 — a death there
      // must still take the keep road, or PLAY AGAIN falls into
      // beginFreshStory() (ngPlus=false + economy/weapons/shop reset) and
      // wipes the money + guns the player carried into NG+. The plain-story
      // rule (§5.6.3) is untouched: without ngPlus, m1 still resets clean.
      gamestate.ngPlus === true);
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
// Physical arms dealer at the safehouse (G near the stall): exclusive guns,
// explosive packs, armor plates and gear. Per-run stock + rotating deal.
const merchant = createMerchant(bus, economy, weapons, player);
// Per-run XP + level-up perks (damage/fire-rate/reload/speed/HP/regen/...).
const perks = createPerks(bus, player, weapons, economy);
// Safehouse contract board: 3 rotating side contracts, auto-paid rewards.
const contracts = createContracts(bus, economy, player);
// NIGHT 30 P1 (§5.6.2.1): missions after economy/shop, BEFORE waves. Scene +
// level passed through the additive params (§5.1.3) so the POI meshes, the
// beacon and the POI colliders are real; headless otherwise.
const missions = createMissions(bus, city, economy, scene, level);
// EXPANSION C5: the wave director now takes `zones` so boss waves (every 5th)
// spawn one boss at the zone anchor. NIGHT 30 P1 §4.2: `city` as the new
// optional 5th argument — district spawn pools, 60-alive cap, density
// multipliers (legacy pool when absent, which the debug harness relies on).
const waves = createWaves(scene, level, bus, zones, city);
// GUN GAME 2.0 P4 (P4-K19 boot-seed): seed waves' difficulty cache BEFORE the
// first frame — settings loaded above carries the persisted preset. Only
// waves listens "settings-changed" at this point (menus is created later,
// P4-K19; main seeds its own cache directly at declaration).
bus.dispatchEvent(
  new CustomEvent("settings-changed", {
    detail: { patch: { difficulty: settings.get().difficulty } },
  })
);

// --- 14-16. hud + menus + gamestate ---------------------------------------------
const hud = createHud(uiRoot, bus, audio, i18n);
// EXPANSION B3: the shop overlay (DOM inside #ui, event-driven). After hud so
// its overlay node sits after the HUD root in the DOM; it owns its z-index.
const shopUI = createShopUI(uiRoot, bus, economy, shop, i18n);
const throwablesHud = createThrowablesHud(uiRoot, bus);
const merchantUI = createMerchantUI(uiRoot, bus, merchant, i18n, camera, player, scene, level);
const perksUI = createPerksUI(uiRoot, bus, perks, i18n);
const perksHud = createPerksHud(uiRoot, bus);
const contractsUI = createContractsUI(uiRoot, bus, contracts, i18n, camera, player, scene, level);
const armorHud = createArmorHud(uiRoot, bus);
// GUN GAME 2.0 P4 (P4-K19): createMenus MOVED below the P4 modules — it now
// takes the 5th `services` argument { save, profile, achievements }.
const gamestate = createGamestate(bus, settings);
// Modal overlays that freeze the world but show no pause menu (same pattern
// as the shop / merchant): the reason keeps the run paused until it closes.
bus.addEventListener("perks-choice-open", () => gamestate.addPause("perks"));
bus.addEventListener("perks-choice-closed", () => gamestate.removePause("perks"));
bus.addEventListener("contracts-open", () => gamestate.addPause("contracts"));
bus.addEventListener("contracts-closed", () => gamestate.removePause("contracts"));
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
  // P2-K3, widened by P3-K2: missions.current is 0 (not started) .. 10 (m10
  // = the Origin fight), 11 = free-roam → clamp to 10.
  activeMission() {
    return Math.min(Math.max(missions.current, 0), 10);
  },
}, scene);
// The read-only M overlay inside #ui (listens "map-toggle" from input.js
// itself and emits "map-visibility"; pointer-events stay off).
const map = createMap(uiRoot, bus, city);

// --- NIGHT 30 P3 (§6.1): the ending sequence --------------------------------
// Listens "origin-defeated" itself; runs under pause reason "ending" and is
// driven by ending.update(dt) OUTSIDE the state branches of frame(). The
// three panel buttons re-emit "ui-continue" / "ui-ngplus" / "ui-quit" (main
// owns the responses below).
const ending = createEnding(uiRoot, bus, gamestate, audio, i18n, camera);

// --- GUN GAME 2.0 P4 bootstrap (P4-K19, order FROZEN) -------------------------
// profile → save → saveDeps → endless → achievements → menus (moved here with
// the 5th services bag). Every dependency already exists: waves (302),
// gamestate (310), events (322), weapons (250). buildSaveSnapshot is a
// hoisted declaration in the P4 section below — valid at createSave time.
const profile = createProfile(bus);
const save = createSave(bus, { snapshot: buildSaveSnapshot });
gamestate.saveDeps = { saveNow: save.saveNow }; // P4-K1: triggers → saveNow
const endless = createEndless(bus, { waves, events, gamestate, profile });
const achievements = createAchievements(bus, { gamestate, endless, weapons });
const menus = createMenus(uiRoot, bus, settings, i18n, {
  save,
  profile,
  achievements,
});
// Controls reference overlay (H, main/pause menu buttons). Self-wired through
// "help-toggle" / "help-open"; frees the cursor while it is open.
const help = createHelp(uiRoot, bus, i18n);
const tutorial = createTutorial(uiRoot, bus, i18n);

// --- GUN GAME 2.0 P4 section (§3.3/§3.4/§5.4/P4-K13/P4-K15) -------------------

// True from "ui-endless" until the next non-endless run start / quit. The
// §3.3 state gate alone lets the endless GAMEOVER frame through ("gameover"
// is a legal snapshot state, and endless.isActive() is already false by
// then) — a quit from the SINH TỐN KẾT THÚC screen would otherwise write the
// dead endless run as a story continue-save. This flag closes that hole
// (P4-K1's "chặn save ở endless", gameover edge).
let endlessRun = false;

/**
 * §3.3: the FULL SaveData for save.js (normalized again by save.js before the
 * write). Returns null — a saveNow no-op — when Endless is live/just over, or
 * when the state is not a live run ("menu"/"intro": a quit or story-start
 * from there must never overwrite the previous save).
 * @returns {import("./systems/save.js").SaveData|null}
 */
function buildSaveSnapshot() {
  if (endless.isActive() || endlessRun) return null; // P4-K1: no saves in Endless
  const st = gamestate.state;
  if (st !== "playing" && st !== "paused" && st !== "gameover") return null;
  // P4-K22 mission clamp: 1..10 stay; 11 (chain done) → 10 (resume = re-fight
  // the Origin); 0 (never started) → 0 (restore plays from m1).
  let mission = Math.round(Number(missions.current));
  if (!Number.isFinite(mission) || mission < 0) mission = 0;
  if (mission > 10) mission = 10;
  const weaponsSave = [];
  for (let i = 0; i < weapons.list.length; i++) {
    const w = weapons.list[i];
    const u = w.upgrades || { dmg: 0, mag: 0, rl: 0 };
    weaponsSave.push({
      name: w.name,
      owned: w.owned === true,
      // P4-K3: Infinity (pistol) → null; every other reserve a rounded ≥ 0.
      reserve: Number.isFinite(w.reserve)
        ? Math.max(0, Math.round(w.reserve))
        : null,
      upgrades: { dmg: u.dmg | 0, mag: u.mag | 0, rl: u.rl | 0 },
    });
  }
  const objs = Array.isArray(missions.objectives) ? missions.objectives : [];
  const objectives = [];
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    objectives.push({
      type: o.type,
      district: o.district,
      done: o.done,
      need: o.need,
      complete: o.complete,
    });
  }
  const s = settings.get();
  return {
    v: 1, // save.js normalizeSave re-stamps + clamps every field
    storyRun: storyRun === true,
    ngPlus: gamestate.ngPlus === true,
    mission,
    // P4-K5: debug/verification only — restore replays via skipToMission.
    objectivesSnapshot: { state: missions.getState(), objectives },
    money: economy.get(),
    weapons: weaponsSave,
    unlockedDistricts: reachableDistricts("safehouse"),
    currentDistrict: city.districtAt(player.position.x, player.position.z),
    wave: gamestate.wave,
    score: gamestate.score,
    highScore: s.highScore,
    difficulty: s.difficulty,
  };
}

/** §7.3: a FRESH {active, wave, score} clone (endless.snapshot() reuses one
 * scratch object — the debug API and getState() must hand out copies). */
function endlessSnapshotFresh() {
  const s = endless.snapshot();
  return { active: s.active, wave: s.wave, score: s.score };
}

// §5.4 / P4-K14 — start Endless from the SINH TỒN button, order FROZEN:
// story off → ngPlus off → clean world → quarantine teleport → endless.start()
// (sets waves mode) → playing → pointer lock. missions stay reset (tracker
// hidden) and events.update keeps running (the bloodmoon machine needs it).
bus.addEventListener("ui-endless", () => {
  endlessRun = true;
  storyMode(false);
  gamestate.ngPlus = false;
  freshRun(false);
  teleportDistrictInternal("quarantine");
  endless.start();
  // GUN GAME 2.0 P4 (P4-K15): endless.start() → waves.reset() re-clears
  // waves' difficulty cache to normal (waves.js reset — P4-K9) AFTER
  // freshRun's re-emit above already ran, so an Endless run would silently
  // play at normal regardless of the preset. Re-seed here — same event shape
  // as the freshRun re-emit (main.js:866); every "settings-changed" listener
  // re-applies the same persisted value idempotently (waves diff cache,
  // main's mainDiff, menus' active button, audio/siren volumes).
  bus.dispatchEvent(
    new CustomEvent("settings-changed", {
      detail: { patch: { difficulty: settings.get().difficulty } },
    })
  );
  gamestate.start();
  input.lockPointer();
});

// P4-K13: the over screen covers the gameover panel — this listener is
// registered AFTER gamestate's gameover listener (createGamestate ran
// earlier), so the last menus.show() of the "player-died" dispatch wins.
bus.addEventListener("endless-over", () => {
  menus.show("endlessOver");
});

// P4-K15: main's difficulty preset for its OWN spawn paths (event runners,
// debug spawns, the debug/m8 boss, the Origin). Same table as waves.js
// DIFFICULTY_MULTS — frozen §6.4. Seeded directly from settings (the
// boot-seed event fired before this listener existed).
const MAIN_DIFFICULTY = {
  easy: { hpMul: 0.75, dmgMul: 0.7, densityMul: 0.8 },
  normal: { hpMul: 1, dmgMul: 1, densityMul: 1 },
  hard: { hpMul: 1.35, dmgMul: 1.3, densityMul: 1.2 },
};
const MAIN_DIFF_DEFAULT = MAIN_DIFFICULTY.normal;
let mainDiff = MAIN_DIFFICULTY[settings.get().difficulty] || MAIN_DIFF_DEFAULT;

/**
 * Shape one freshly created unit on main's spawn paths — identical rules to
 * waves.js applyDifficulty (P4-K15): regular hp ×hpMul; boss maxHp ×hpMul
 * (hp reset to it); dmg ×dmgMul when numeric; speed untouched. Normal is an
 * exact no-op so the pre-P4 paths stay byte-identical.
 * @param {import("./zombies/zombie.js").Zombie} z
 * @param {boolean} isBoss
 */
function applyDifficultyTo(z, isBoss) {
  if (!z || mainDiff === MAIN_DIFF_DEFAULT) return;
  if (isBoss) {
    z.maxHp = Math.round(z.maxHp * mainDiff.hpMul);
    z.hp = z.maxHp;
  } else {
    z.hp = Math.round(z.hp * mainDiff.hpMul);
  }
  if (typeof z.dmg === "number") z.dmg = z.dmg * mainDiff.dmgMul;
}

// --- bus wiring -------------------------------------------------------------------

// EXPANSION C4/C6: the live boss (bar drain via hud.update extras, debug
// damageBoss/getState). Waves announces "zombie-spawned" for the boss BEFORE
// "boss-spawned", so the boss is already in the shared array here; maxHp
// exists only on bosses, which makes the lookup unambiguous.
let bossRef = /** @type {import("./zombies/zombie.js").Zombie|null} */ (null);

// NIGHT 30 P3 (P3-K6): the ORIGIN is tracked apart from the wave boss. While
// it lives it OUTRANKS bossRef everywhere the live boss is read (HUD bar +
// arrow, map marker, debug damageBoss, getState().boss) — spec: "Origin ưu
// tiên" over the regular boss wave.
let originRef = /** @type {import("./zombies/origin.js").Origin|null} */ (null);

/** The boss the HUD/map/debug should see: the Origin while alive, else the
 *  wave boss. Zero alloc — returns one of the two refs. */
function liveBoss() {
  return originRef && originRef.alive ? originRef : bossRef;
}

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

// Bloater death burst FX (zombie.js owns the damage + the ground ring): a wet
// blood splash, green-tinted sparks and a light shake at the corpse.
bus.addEventListener("bloater-burst", (e) => {
  const d = e && e.detail ? e.detail : {};
  const p = d.position;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
  const at = new THREE.Vector3(p.x, Number.isFinite(p.y) ? p.y + 0.4 : 0.4, p.z);
  particles.spawnBlood(at, 26);
  particles.spawnSpark(at);
  particles.spawnSpark(at);
  explosives.shake(0.55);
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

// Survivor camps (world/survivors.js): a first-approach gift per NPC per run.
// The module carries no economy/weapons refs — main applies the exact effect.
bus.addEventListener("npc-gift", (e) => {
  const d = e && e.detail ? e.detail : {};
  const amount = Math.max(0, Number(d.amount) || 0);
  if (d.kind === "money") {
    economy.add(amount);
  } else if (d.kind === "health") {
    if (player.alive) player.hp = Math.min(100, player.hp + amount);
    audio.pickup();
  } else if (d.kind === "ammo") {
    const w = weapons.list[weapons.current];
    if (w && Number.isFinite(w.reserve)) w.reserve += w.magSize * amount;
    audio.pickup();
  }
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
  // One "event-end" removes ONE marker: every ended instance emits its own
  // (reset included), so a blanket splice would strip the surviving twin's
  // marker when same-type events overlap (§3.4.5).
  for (let i = eventMarkers.length - 1; i >= 0; i--) {
    if (eventMarkers[i].type === type) {
      eventMarkers.splice(i, 1);
      break;
    }
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

// --- NIGHT 30 P3 origin listeners (§6.1) --------------------------------------

// The final boss died → drop the ref + the big death FX main owns (P3-K8:
// Origin holds no particles/explosives refs — its 3-arg signature is frozen).
// The corpse position is still valid here (origin-defeated arrives right
// after "zombie-killed", the 3 s tilt-and-fade plays underneath).
bus.addEventListener("origin-defeated", () => {
  const pos = originRef && originRef.position ? originRef.position : null;
  originRef = null;
  // The horde collapses with its master: despawn every LIVING zombie (the
  // freshRun announce+dispose pattern) so no stray melee can land during the
  // ending sequence. Corpses keep their tilt-and-fade.
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (!z || z.alive !== true) continue;
    bus.dispatchEvent(new CustomEvent("zombie-despawned", { detail: { zombie: z } }));
    z.dispose();
  }
  if (pos) {
    particles.spawnBlood(pos, 40);
    particles.spawnSpark(pos);
    particles.spawnSpark(pos);
    particles.spawnSpark(pos);
  }
  explosives.shake(2); // §6.1 death shake (redundant with origin-shake 2 — same machine)
});

// Origin phase transition / death rumble (§7.1): {power:1} phase, {power:2}
// death → the manual shake added to explosives.js (§6.2).
bus.addEventListener("origin-shake", (e) => {
  const d = e && e.detail ? e.detail : {};
  explosives.shake(Number(d.power) || 1);
});

// P3-K7: death mid-fight drops the ref. The PLAY AGAIN of the story-keep
// window re-announces m10 ("mission-start" {index:10}) which respawns a
// full-hp Origin rising from the vault — the "rút về vault" reset.
bus.addEventListener("player-died", () => {
  originRef = null;
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
  throwables.reset(); // fresh kit (2 frag / 1 molotov / 0 mines) + clear FX
  hazards.reset(); // restore every barrel/canister + colliders
  perks.reset(); // XP/level/perk stacks are per run
  contracts.reset(); // reroll the contract board
  combat.resetFx(); // hide pooled tracers/casings from the previous run
  zones.reset(); // re-lock both areas ("wave-start"{n:1} repeats this no-op)
  // NIGHT 30 P2 §8.3: events are WORLD state — reset on EVERY fresh run
  // (story-keep included). events.reset() emits "bloodmoon-active"
  // {active:false} + per-event "event-end" {reason:"reset"} first, so the
  // waves/economy/atmosphere/audio multipliers drop before the next run.
  events.reset();
  map.show(false); // close the M overlay with the run (map also self-closes
  //                   on every state ≠ "playing" — this is belt & suspenders)
  // NIGHT 30 P3 (§4.7): waves.reset() above cleared its local NG+ flag —
  // re-emit the CURRENT rule so a death-restart inside an NG+ run re-arms
  // the ×1.25/×1.10 multipliers (a fresh story/free start emits {false}:
  // beginFreshStory()/ui-play-free clear gamestate.ngPlus BEFORE freshRun).
  bus.dispatchEvent(
    new CustomEvent("ng-plus", { detail: { active: gamestate.ngPlus === true } })
  );
  // GUN GAME 2.0 P4 (P4-K15): waves.reset() likewise cleared its DIFFICULTY
  // cache back to normal — re-arm it from the persisted settings, mirroring
  // the ng-plus re-emit above. Without this, the preset chosen in the menu
  // would silently revert to normal after the first freshRun. (The boot-seed
  // at waves creation covers only the pre-first-run state, P4-K19.)
  bus.dispatchEvent(
    new CustomEvent("settings-changed", {
      detail: { patch: { difficulty: settings.get().difficulty } },
    })
  );
  if (keepStoryProgress && missions.current > 6) {
    // Past mission 6 the interiors belong to the run — unseal again (the
    // unlockForWave path is the same one mission 6's completion used).
    zones.unlockForWave(Number.MAX_SAFE_INTEGER);
  }
  bossRef = null;
  originRef = null; // NIGHT 30 P3: the Origin never survives a world reset
  if (!keepStoryProgress) {
    closeAllCityGates(); // fresh world: every gate back to red/locked
    city.openVault(false); // NIGHT 30 P3 §6.1: the vault re-seals too
    missions.reset(); // §5.6.2.5 (skipped when §5.6.3 keeps the progress)
  }
  dialogue.hide(); // drop any mid-flight dialogue from the previous run
  resetDialogueQueue(); // hide() drops the onDone — the queue must forget too
  ending.hide(); // NIGHT 30 P3 §6.1: leave the ending sequence if it ran
  //               (idempotent; also emits "ending-active" {active:false} so
  //               the "ending" pause reason cannot leak into the next run)
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

/** Full fresh story: world reset (gates re-sealed, vault re-sealed, zones
 * re-locked, missions reset) → story-mode armed → state "intro" (the
 * state-changed listener below plays the slides and calls missions.begin()
 * after them). NIGHT 30 P3 (§6.3): a fresh STORY start drops the NG+ rule
 * BEFORE freshRun so its "ng-plus" re-emit carries {active:false} (P3-K9). */
function beginFreshStory() {
  // GUN GAME 2.0 P4 (P4-K1): autosave trigger 5 — snapshot the run being
  // replaced BEFORE any reset (no-op from "menu": buildSaveSnapshot returns
  // null outside a live run).
  save.saveNow("story-start");
  endlessRun = false; // a story start is never an endless run
  storyMode(false); // §5.6.4 order: {active:false} → zones.reset → missions.reset → {active:true}
  gamestate.ngPlus = false; // P3-K9: fresh story = base rules
  freshRun(false); // zones.reset() + closeAllCityGates() + openVault(false) + missions.reset() inside
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
  if (!(s.mission >= 1 && s.mission <= 10)) return; // P3-K2: m10 re-fights
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
    // NIGHT 30 P3 (P3-K15): an NG+ death-restart keeps the carried GUNS too —
    // freshRun(true) below un-owns them (weapons.reset()) and forgets the
    // shop Set, so capture the ids BEFORE the reset and re-own AFTER (the
    // same road beginNGPlus() uses; the plain story keep — P1 §5.6.3 — keeps
    // only money + missions and is left untouched).
    const owned = gamestate.ngPlus === true ? shop.owned() : null;
    // GUN GAME 2.0 P4 (P4-K6): NG+ death-restart keeps the UPGRADE LEVELS too
    // — capture via getStats() BEFORE weapons.reset() zeroes them.
    const ownedUpg = [];
    if (owned) {
      for (let i = 0; i < owned.length; i++) {
        const st = weapons.getStats(owned[i]);
        if (st) ownedUpg.push({ name: owned[i], u: st.upgrades });
      }
    }
    endlessRun = false; // any ui-play is a fresh non-endless run
    freshRun(true);
    storyMode(true); // re-assert (idempotent) after the zones.reset above
    if (owned) {
      for (let i = 0; i < owned.length; i++) {
        // Ownership flag lives on the weapon defs (weapons.js:23); the shop
        // Set stays cleared — buy()/owned() also read w.owned (shop.js).
        const w = weapons.list.find((x) => x.name === owned[i]);
        if (w) w.owned = true;
      }
      // P4-K6: restore the captured levels (setUpgrades clamps + applies the
      // effective damage/magSize in one call).
      for (let i = 0; i < ownedUpg.length; i++) {
        weapons.setUpgrades(ownedUpg[i].name, ownedUpg[i].u);
      }
    }
    gamestate.start(); // → playing directly
    reAnnounceMission();
  } else if (gamestate.state === "gameover" && !storyRun) {
    // PLAY AGAIN after a FREE-ROAM death (§5.6.3 "từ CHƠI TỰ DO": clean reset
    // like before) — free replay, no intro slides, mission 1 re-activated.
    storyMode(false);
    endlessRun = false; // any ui-play is a fresh non-endless run
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
  // NIGHT 30 P3 (§6.3): free-roam start drops the NG+ rule BEFORE freshRun so
  // the re-emit inside carries {active:false} (P3-K9).
  storyMode(true);
  gamestate.ngPlus = false;
  endlessRun = false; // any ui-play is a fresh non-endless run
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
  // GUN GAME 2.0 P4: a pause-menu RESTART inside an Endless run must drop the
  // mode too (waves.reset() inside freshRun() flips waves back to "story",
  // but endless would stay active — its score machine and the HUD chips would
  // leak into the restarted run). Idempotent when not active.
  endless.stop();
  endlessRun = false;
  freshRun();
  gamestate.restart();
  input.lockPointer();
});
bus.addEventListener("ui-quit", () => {
  endless.stop(); // GUN GAME 2.0 P4 (P4-K13): FIRST line — idempotent when not active
  endlessRun = false; // (the gamestate autosave trigger already fired before this)
  freshRun();
  gamestate.toMenu();
});

// --- NIGHT 30 P3 ending buttons (§4.4 / §6.3 / P3-K13) ------------------------
// The panel emits BEFORE its own hide(), synchronously inside the click, so
// lockPointer() keeps the user gesture and hide()'s "ending-active" false is
// the flip back to "playing".

bus.addEventListener("ui-continue", () => {
  // KEEP PLAYING — OPEN WORLD: the world stands as it was (m11 = free-roam,
  // the event scheduler re-opened through "origin-alive" {alive:false}, kill
  // money back to normal). Dropping the "ending" pause reason resumes the
  // run; nothing else to reset. Escape hatch if the state somehow lagged:
  // removePause is a no-op when the reason is already gone.
  gamestate.removePause("ending");
  input.lockPointer();
});

// --- GUN GAME 2.0 P4 (P4-K2): TIẾP TỤC — restore path, §3.4 ---------------------
// A SECOND "ui-continue" listener, registered right after the P3 one. The P3
// listener is a harmless no-op from the menu (removePause("ending") when the
// reason is unset). Gate: menu state + a readable save (readSave runs the
// corruption guard, so a broken key early-returns here too).
bus.addEventListener("ui-continue", () => {
  if (gamestate.state !== "menu" || !save.hasSave()) return;
  const data = save.readSave();
  if (!data) return; // corrupted between the two reads (P4-K2 edge)

  // §3.4 — the 10 steps, in order:
  gamestate.ngPlus = data.ngPlus === true; // 2 — BEFORE freshRun (re-emit carries the right price)
  endlessRun = false; // 3 is a non-endless world
  freshRun(false); // 3 — clean world: economy 0, weapons reset, gates closed,
  //                // vault closed, missions reset, zones locked
  economy.add(data.money | 0); // 4
  weapons.applySaveState(data.weapons || []); // 5 (Builder B — §4.3)
  // 6 — mission chain; restore avoids the briefing dialogue (P4-K22): the
  // suppressStartDialogue flag covers BOTH branches (skipToMission's
  // mission-start AND missions.begin()'s m1 briefing — showing a briefing
  // over the menu only for it to be hidden by step 10's hide() would also
  // strand main's dialogue-queue busy flag).
  suppressStartDialogue = true;
  if (data.mission >= 1 && data.mission <= 10) {
    missions.skipToMission(data.mission); // m8 boss / m10 vault+Origin side effects included (P4-K22)
  } else {
    missions.begin(); // mission 0 → play from m1 (P4-K22)
  }
  suppressStartDialogue = false;
  if (data.mission > 6) zones.unlockForWave(Number.MAX_SAFE_INTEGER); // 7 — quarantine interiors
  // 8 — re-open every gate on the BFS route to each saved unlocked district.
  const districts = Array.isArray(data.unlockedDistricts)
    ? data.unlockedDistricts
    : [];
  for (let i = 0; i < districts.length; i++) {
    const id = districts[i];
    if (id === "safehouse") continue;
    const route = districtRoute("safehouse", id);
    if (!route) continue; // unreachable (graph changed) — skip silently
    for (let g = 0; g < route.length; g++) {
      city.setGateOpen(route[g].from, route[g].to, true);
    }
  }
  storyRun = true; // 9 — the restored run is story-shaped (PLAY semantics)
  keepStory = false;
  storyMode(true); // re-arm the zones story-guard after freshRun above
  // 10 — startStory() flips to "intro" (its state-changed emit calls
  // dialogue.showIntro() synchronously) then beginPlay() returns to playing;
  // dialogue.hide() drops the slides + their onDone before missions could be
  // re-begun. resetDialogueQueue() keeps main's queue flags consistent with
  // the hide (same pair as freshRun — a dropped onDone must not strand busy).
  gamestate.startStory();
  gamestate.beginPlay();
  dialogue.hide();
  resetDialogueQueue();
  gamestate.score = data.score | 0;
  gamestate.wave = data.wave | 0; // informational — the director restarts at wave 1 (P4-K4)
  input.lockPointer();
});

/** NEW GAME+ (P3-K15): keep MONEY + OWNED GUNS + settings, reset the world
 * and the mission chain back to m1, arm the ×1.25 hp / ×1.10 speed rule. */
function beginNGPlus() {
  const owned = shop.owned(); // capture the ids BEFORE shop.reset()
  // GUN GAME 2.0 P4 (P4-K6): capture the upgrade levels too — freshRun(true)
  // below runs weapons.reset() which zeroes them.
  const ownedUpg = [];
  for (let i = 0; i < owned.length; i++) {
    const st = weapons.getStats(owned[i]);
    if (st) ownedUpg.push({ name: owned[i], u: st.upgrades });
  }
  storyMode(false);
  endlessRun = false; // NG+ is a story-shaped run, never endless
  freshRun(true); // economy holds (story-keep road, §5.6.3) + ending.hide()
  storyRun = true; // death-restart of NG+ keeps the money
  keepStory = false;
  shop.reset(); // forget the Set; ownership is re-applied right below
  for (let i = 0; i < owned.length; i++) {
    // The official ownership flag lives on the weapon defs (weapons.js:23) —
    // the shop only mirrors it. Match by catalog id ("smg"|"sniper"|…).
    const w = weapons.list.find((x) => x.name === owned[i]);
    if (w) w.owned = true;
  }
  // P4-K6: restore the captured levels (setUpgrades clamps 0..3 + applies
  // the effective damage/magSize).
  for (let i = 0; i < ownedUpg.length; i++) {
    weapons.setUpgrades(ownedUpg[i].name, ownedUpg[i].u);
  }
  missions.reset(); // freshRun(true) skipped it — the chain restarts at m1
  closeAllCityGates(); // freshRun(true) skipped it
  city.openVault(false); // freshRun(true) skipped it — the vault re-seals too
  gamestate.ngPlus = true;
  bus.dispatchEvent(
    new CustomEvent("ng-plus", { detail: { active: true } }) // waves + origin (P3-K9)
  );
  storyMode(true);
  gamestate.start(); // → playing (NO intro slides — P3-K13)
  missions.begin(); // m1 active + "mission-start"
}

bus.addEventListener("ui-ngplus", () => {
  beginNGPlus();
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
  // P3-K2: the dialogue window widened 9 → 10 (m10's radio briefing lives in
  // STORY_DIALOGUE.m10 — §7.3).
  if (!suppressStartDialogue && idx >= 1 && idx <= 10) {
    showDialogue(dialogueLines("start", idx));
  }
  suppressStartDialogue = false;
  if (idx === 8) spawnStoryBoss(); // §5.6.2.3: M8 activation → one boss
  // NIGHT 30 P3 (P3-K5): the ONLY trigger of the final fight — m10 activation
  // opens the vault AND raises the Origin (§3.9 timeline).
  if (idx === 10) spawnOriginInternal();
});

// Rewards are main's job (§8: missions never touches economy). m1–m8 play
// their done-dialogue; m9 has none and plays NO outro anymore (P3-K4: the
// outro block was removed — completing m9 cascades straight into m10, whose
// activation opens the vault and raises the Origin; the real ending owns the
// story close now). M6 completion also unseals the quarantine interiors
// (§5.6.2.3, WORLD.md §12.1) through zones.unlockForWave — the story-guard
// only gates the wave-clear automation, never this direct path.
bus.addEventListener("mission-complete", (e) => {
  const d = e && e.detail ? e.detail : {};
  const idx = Math.round(Number(d.index));
  const reward = Math.max(0, Math.round(Number(d.reward) || 0));
  economy.add(reward);
  if (idx === 6) zones.unlockForWave(Number.MAX_SAFE_INTEGER);
  if (idx >= 1 && idx <= 8) showDialogue(dialogueLines("done", idx));
});

// Live volume from the settings screen (menus already persisted it).
// GUN GAME 2.0 P4 (P4-K15 §7.1.6): the difficulty preset rides the same
// event — main caches it for its own spawn paths (waves.js caches its own).
bus.addEventListener("settings-changed", (e) => {
  const patch = e && e.detail ? e.detail.patch : null;
  if (patch && Object.prototype.hasOwnProperty.call(patch, "volume")) {
    audio.setVolume(patch.volume);
  }
  if (
    patch &&
    (patch.difficulty === "easy" ||
      patch.difficulty === "normal" ||
      patch.difficulty === "hard")
  ) {
    mainDiff = MAIN_DIFFICULTY[patch.difficulty];
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
  endless: null, // GUN GAME 2.0 P4 (P4-K12): {active, wave, score} | null
  cam: null, // GUN GAME 2.0 P4 (P4-K16): the camera for the floating numbers
  weapons: null, // live armory list → HUD weapon-slot ownership/ammo
};
const hudBossScratch = { position: null, hp: 0, maxHp: 0, type: "" };
const hudMissionScratch = { x: 0, z: 0 }; // reused — zero per-frame alloc
const hudEventScratch = { type: "", x: 0, z: 0 };
// mapExtras (§8.4): the map's 10 Hz argument — boss + yaw + mission/event.
const mapExtrasScratch = { boss: null, yaw: 0, mission: null, event: null };
const mapBossScratch = { x: 0, z: 0, type: "" };
const mapEventScratch = { type: "", x: null, z: null, timeLeft: NaN };
let mapTimer = 0; // 10 Hz map repaint accumulator (§4.0/§8.2)
// Adaptive soundtrack scratch (zero allocation per frame — music.update reads it).
const musicState = { state: "menu", hp: 100, wave: 0, boss: null };

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
  // Plain loop, not .find(lambda): missionMarker() runs every frame and the
  // callback would be a fresh allocation each call (no per-frame allocs).
  let d = null;
  for (let i = 0; i < city.districts.length; i++) {
    const cand = city.districts[i];
    if (cand && cand.id === districtId) {
      d = cand;
      break;
    }
  }
  if (d && d.center && Number.isFinite(d.center.x) && Number.isFinite(d.center.z)) {
    hudMissionScratch.x = d.center.x;
    hudMissionScratch.z = d.center.z;
    return hudMissionScratch;
  }
  return null;
}

function hudExtras() {
  const live = liveBoss(); // NIGHT 30 P3 (P3-K6): the Origin outranks bossRef
  if (live && live.alive) {
    hudBossScratch.position = live.position;
    hudBossScratch.hp = live.hp;
    hudBossScratch.maxHp = live.maxHp;
    hudBossScratch.type = live.type;
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
  // GUN GAME 2.0 P4 (P4-K12/K16): the endless chip source + the camera the
  // HUD projects the floating damage numbers through. Both are plain ref
  // assignments (zero-alloc — endless.snapshot() reuses its own scratch).
  hudExtrasScratch.endless = endless.isActive() ? endless.snapshot() : null;
  hudExtrasScratch.cam = camera;
  // HUD weapon-slot bar: the live armory (ownership + per-slot ammo). Refs
  // only — the HUD reads name/owned/mag/reserve/magSize/reloading.
  hudExtrasScratch.weapons = weapons.list;
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
  const live = liveBoss(); // NIGHT 30 P3 (P3-K6): the Origin outranks bossRef
  if (live && live.alive) {
    mapBossScratch.x = live.position.x;
    mapBossScratch.z = live.position.z;
    mapBossScratch.type = live.type;
    mapExtrasScratch.boss = mapBossScratch;
  } else {
    mapExtrasScratch.boss = null;
  }
  mapExtrasScratch.yaw = camera.rotation.y;
  mapExtrasScratch.mission = missionMarker();
  const em = activeEventMarker();
  if (em) {
    // The live snapshot is the authoritative countdown — the map's own cache
    // only interpolates between draws, so a resync every 10 Hz kills drift
    // after the overlay was closed for a while (map decay clamps catch-up).
    const live = events.active(); // {type, timeLeft}|null (§8.7)
    mapEventScratch.type = em.type;
    mapEventScratch.x = em.x;
    mapEventScratch.z = em.z;
    mapEventScratch.timeLeft = live && live.type === em.type ? live.timeLeft : NaN;
    mapExtrasScratch.event = mapEventScratch;
  } else {
    mapExtrasScratch.event = null;
  }
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
    merchantUI.update(dt, player.position); // trader prompt / stall proximity
    contractsUI.update(dt, player.position); // contract-board prompt / proximity
    if (player.alive) weapons.update(dt); // layers recoil DELTA on top; fires
    updateZombies(dt); // chase/attack (attacks call player.damage → death can flip state here)
    audio.update3D(camera, zombies); // NIGHT 30 P2 §8.2: 3D voice mix + murmur (1×/frame, after the zombie pass)
    waves.update(dt, player.position);
    missions.update(dt, player.position); // NIGHT 30 P1 §5.6.2.4: after waves.update
    events.update(dt, player.position); // NIGHT 30 P2 §8.2: after missions.update (playing-only → pause freezes the scheduler)
    pickups.update(dt, player.position);
    explosives.update(dt); // EXPANSION B5: grenade flight/detonation + shake decay
    particles.update(dt);
    combat.update(dt); // tracers fade + brass casings fly
    throwables.update(dt); // bombs in flight / fire pools / armed mines
    hazards.update(dt); // barrel fuses + chain reactions + scorch FX
    perks.update(dt); // regen + queued perk-choice pump
    perksUI.update(dt); // perk choice overlay timers
    atmosphere.update(dt, player.position); // P1 §5.7: moon shadow follows
    scenery.update(dt, player.position); // flames + fireflies drift
    weather.update(dt, player.position); // rain / storm / fog cycle
    wildlife.update(dt, player.position); // crows, rats, stray dogs
    survivors.update(dt, player.position); // friendly camps + speech bubbles
    gamestate.update(dt);
    endless.update(dt); // GUN GAME 2.0 P4 (§5.4): bloodmoon retry machine (playing only → pause freezes it)
    profile.update(dt); // P4-K21: playtimeSec tick (playing only — pause/menu excluded)
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
    combat.update(dt); // let casings finish falling behind the death panel
    atmosphere.update(dt, player.position);
    scenery.update(dt, player.position);
    weather.update(dt, player.position);
    wildlife.update(dt, player.position);
  } else if (st === "menu" || st === "intro") {
    // NIGHT 30 P1 §5.6.2.6: "intro" updates the world exactly like "menu" —
    // atmosphere only (the story slides render over the parked spawn view).
    atmosphere.update(dt, player.position); // zombies deliberately do NOT update
    scenery.update(dt, player.position);
    weather.update(dt, player.position);
    wildlife.update(dt, player.position);
  }
  // paused: render only.

  // Adaptive soundtrack + low-health heartbeat. Runs outside the state
  // branches so menu/pause ducking and the gameover fade keep animating.
  const musicBoss = liveBoss();
  musicState.state = gamestate.state;
  musicState.hp = Number(player.hp) || 0;
  musicState.wave = Math.max(0, Math.round(Number(gamestate.wave) || 0));
  musicState.boss = musicBoss && musicBoss.alive ? musicBoss.type : null;
  music.update(dt, musicState);

  // NIGHT 30 P3 (§6.1): the ending sequence is driven OUTSIDE the state
  // branches — it runs UNDER pause reason "ending" (slow-zoom approach and
  // white fade must animate while the world is frozen) and is a cheap no-op
  // while idle. It may also flip state (the panel buttons' "ending-active"
  // false resumes the run) — that dispatch happens inside the button click,
  // never here; update() only moves the camera FOV and the phase timers.
  ending.update(dt);

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
  applyDifficultyTo(zombie, false); // GUN GAME 2.0 P4 (P4-K15): difficulty shape
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
  applyDifficultyTo(boss, true); // GUN GAME 2.0 P4 (P4-K15): difficulty shape
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

/** NIGHT 30 P3 debug road (§6.4): boot a story run when no live run exists —
 * module-level function (no `this` on the debugApi methods, so destructured
 * calls like `const { spawnOrigin } = __game` stay safe). */
function ensureLiveRunForDebug() {
  const st = gamestate.state;
  if (st === "playing" || st === "paused") return;
  if (st === "intro") {
    gamestate.beginPlay();
    dialogue.hide(); // debug jump: no slides over the fight
  } else {
    beginFreshStory();
    gamestate.beginPlay();
    dialogue.hide();
  }
}

/**
 * NIGHT 30 P3 (§6.1, P3-K5): the final boss. Triggered ONLY by the
 * "mission-start" {index:10} listener (mission 10 activation) and by the
 * debug spawnOrigin()/skipToMission(10) road. The Origin rises from the
 * vault at (0,0): main opens the vault first (2 s slide + rumble + red
 * light), then creates the Origin — its 2.5 s rise plays underneath.
 * Same debug mechanics as spawnBossInternal: debugZombies (freshRun drains
 * it), "zombie-spawned" (shared array → combat), "boss-spawned" (HUD bar).
 * The Origin announces "origin-alive" {alive:true} itself (events.js then
 * freezes its scheduler — §3.5).
 * @returns {{type?: string, hp?: number, maxHp?: number, error?: string}}
 */
function spawnOriginInternal() {
  if (originRef && originRef.alive) return { error: "origin-alive" };
  city.openVault(); // idempotent — a re-fight finds the vault already open
  // GUN GAME 2.0 P4 (P4-K15 §7.1.6): re-announce the CURRENT NG+ rule BEFORE
  // creating the Origin. origin.js registers its "ng-plus" listener inside
  // createOrigin (origin.js:872 — a module flag read at construction), so an
  // Origin's first creation in a session would otherwise MISS every earlier
  // "ng-plus" emit (the flag fix below only reaches Origins #2+; waves' own
  // flag already holds this value — same-value no-op there). The dispatch
  // also arms the instance's NG+ speed ×1.1 whenever the listener exists.
  bus.dispatchEvent(
    new CustomEvent("ng-plus", { detail: { active: gamestate.ngPlus === true } })
  );
  const origin = createOrigin(scene, bus, city);
  // (P4-K15 §7.1.6, continued): the CONTRACT formula, applied deterministically
  // by OVERWRITE — round(3000 × hpMul × (ngPlus ? 1.25 : 1)) — immune to the
  // listener-registration timing above (a missed event leaves the instance at
  // 3000 flat; a caught one bakes ×1.25 in — the overwrite lands on the same
  // contract value either way, never a double apply). The Origin carries no
  // flat `dmg` field (per-move tables live in the phase constants) — the dmg
  // line is a guarded no-op per the contract's "nếu có".
  origin.maxHp = Math.round(
    ORIGIN_MAX_HP * mainDiff.hpMul * (gamestate.ngPlus === true ? 1.25 : 1)
  );
  origin.hp = origin.maxHp;
  if (typeof origin.dmg === "number") origin.dmg *= mainDiff.dmgMul;
  debugZombies.push(origin);
  bus.dispatchEvent(
    new CustomEvent("zombie-spawned", { detail: { zombie: origin } })
  );
  bus.dispatchEvent(
    new CustomEvent("boss-spawned", {
      detail: { type: origin.type, zoneId: "quarantine", hp: origin.hp },
    })
  );
  originRef = origin;
  return { type: origin.type, hp: origin.hp, maxHp: origin.maxHp };
}

/**
 * GUN GAME 2.0 P4 (§5.4): the body of the debug teleportDistrict() — shared
 * with the "ui-endless" start sequence so the SINH TỒN start lands through
 * the EXACT same district-center + blocked-offset logic ("dùng đúng logic
 * offset teleportDistrict('quarantine') hiện có"). The quarantine center
 * (0, 0) is the solid vault door, so the offset fallback steps out to the
 * nearest clear cell. Returns the debug-shaped result; the ui-endless path
 * ignores it. Callers that care about success check the `error` field.
 * @param {string} id
 */
function teleportDistrictInternal(id) {
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
      boss: (() => {
        const b = liveBoss(); // P3-K6: the Origin outranks the wave boss
        return b && b.alive
          ? { type: b.type, hp: b.hp, maxHp: b.maxHp }
          : null;
      })(),
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
      // NIGHT 30 P3 additions (docs/EXPANSION-P3.md §6.4): the final boss
      // snapshot (null while no Origin lives) + the NG+ rule flag.
      origin:
        originRef && originRef.alive
          ? { alive: true, phase: originRef.phase }
          : null,
      ngPlus: gamestate.ngPlus === true,
      // GUN GAME 2.0 P4 additions (docs/EXPANSION-P4.md §7.3): the save
      // presence, the live Endless snapshot (fresh clone) and the difficulty
      // preset.
      save: { hasSave: save.hasSave() },
      endless: endlessSnapshotFresh(),
      difficulty: settings.get().difficulty,
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
    applyDifficultyTo(zombie, false); // GUN GAME 2.0 P4 (P4-K15): difficulty shape
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

  /** Damage the live boss (default 100); golem applies its −25% inside.
   *  NIGHT 30 P3 (P3-K6): the living ORIGIN outranks the wave boss here —
   *  damageBoss() drives it too (damageOrigin() is the named variant). */
  damageBoss(n) {
    const live = liveBoss();
    if (!live || !live.alive) return { error: "no-boss-alive" };
    const v = Number(n);
    const killed = live.takeDamage(Number.isFinite(v) && v > 0 ? v : 100, false);
    return {
      type: live.type,
      hp: live.hp,
      maxHp: live.maxHp,
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
   * GUN GAME 2.0 P4 (§5.4): the body moved to teleportDistrictInternal() so
   * the "ui-endless" start sequence reuses the EXACT same offset logic —
   * this debug wrapper's behavior is unchanged.
   */
  teleportDistrict(id) {
    return teleportDistrictInternal(id);
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

  // --- NIGHT 30 P3 debug API (docs/EXPANSION-P3.md §6.4) -------------------

  /**
   * Spawn the ORIGIN (§6.4): jump to mission 10 (opens every gate along the
   * chain and fires "mission-start" {index:10} → openVault + spawn through
   * the listener). If the Origin still is not alive afterwards (m10 was
   * already active), spawn it directly. The 2.5 s rise plays first — the
   * boss is INVULNERABLE while rising (§3.1).
   */
  spawnOrigin() {
    ensureLiveRunForDebug();
    missions.skipToMission(10); // idempotent re-arm — re-fires mission-start 10
    if (!originRef || !originRef.alive) spawnOriginInternal();
    return {
      ok: !!(originRef && originRef.alive),
      hp: originRef ? originRef.hp : 0,
      maxHp: originRef ? originRef.maxHp : 0,
      phase: originRef ? originRef.phase : null,
    };
  },

  /** Damage the living ORIGIN (default 100); returns false-shaped result
   *  while it is invulnerable (rising/transition — §3.1). */
  damageOrigin(n) {
    if (!originRef || !originRef.alive) return { error: "no-origin-alive" };
    const v = Number(n);
    const killed = originRef.takeDamage(
      Number.isFinite(v) && v > 0 ? v : 100,
      false
    );
    return {
      hp: originRef.hp,
      maxHp: originRef.maxHp,
      phase: originRef.phase,
      killed: killed === true,
    };
  },

  /** ORIGIN snapshot: {alive, phase, hp, maxHp, state} or {alive:false}. */
  originState() {
    if (!originRef) return { alive: false };
    return {
      alive: originRef.alive === true,
      phase: originRef.phase,
      hp: originRef.hp,
      maxHp: originRef.maxHp,
      state: originRef.state,
    };
  },

  /**
   * Jump straight to the ENDING sequence (§6.4, P3-K14): a living ORIGIN
   * dies through the REAL kill road (takeDamage(hp+1) → the full event
   * chain), otherwise the synthetic "origin-defeated" {debug:true} fires
   * (ending.js listens regardless of the payload). A rising/transition
   * Origin is invulnerable, so the debug jump forces its state to "fight"
   * first — the kill events stay genuine.
   */
  skipToEnding() {
    ensureLiveRunForDebug();
    if (originRef && originRef.alive) {
      if (
        originRef.state === "rising" ||
        originRef.state === "transition"
      ) {
        originRef.state = "fight"; // debug override — bypass invulnerability
      }
      originRef.takeDamage(originRef.hp + 1, false);
    } else {
      bus.dispatchEvent(
        new CustomEvent("origin-defeated", {
          detail: { timeSec: 0, damageTaken: 0, debug: true },
        })
      );
    }
    return { state: gamestate.state, ending: ending.isActive() };
  },

  // --- GUN GAME 2.0 P4 debug API (docs/EXPANSION-P4.md §7.3) ----------------

  /** One autosave with reason "debug" — {ok, ts} (no-op outside a live run). */
  saveNow() {
    return save.saveNow("debug");
  },

  /** True while a readable "gungame.save.v1" exists (corruption-guarded). */
  hasSave() {
    return save.hasSave();
  },

  /** Live Endless snapshot {active, wave, score} — a FRESH object (the
   *  endless.snapshot() scratch is shared with the HUD extras). */
  endlessState() {
    return endlessSnapshotFresh();
  },

  /** The unlocked achievement ids (achievements.js storage order). */
  achievementsState() {
    return achievements.unlockedIds();
  },

  /**
   * Persist a difficulty preset + broadcast it (waves.js + main cache the
   * multipliers). An invalid value flows through settings.sanitize → back to
   * "normal" (P4-K18) — the return always reports the STORED value.
   */
  setDifficulty(d) {
    const patch = { difficulty: typeof d === "string" ? d : "" };
    settings.set(patch);
    bus.dispatchEvent(
      new CustomEvent("settings-changed", { detail: { patch } })
    );
    return { difficulty: settings.get().difficulty };
  },

  /** Trader stock / deal / open state + the live catalog snapshot. */
  merchantState() {
    return { open: merchantUI.isOpen(), ...merchant.state() };
  },

  /** Open the trader overlay from anywhere (debug/verification only). */
  openMerchant() {
    merchantUI.open();
    return { open: merchantUI.isOpen() };
  },

  /** Throwable inventory: {selected, counts}. */
  throwablesState() {
    return throwables.state();
  },

  /** Weather cycle snapshot: {mode, intensity, timer}. */
  weatherState() {
    return weather.state();
  },

  /** Force a weather mode: "clear"|"rain"|"storm"|"fog" (debug only). */
  setWeather(mode) {
    if (typeof weather.setMode === "function") weather.setMode(mode);
    return weather.state();
  },

  /** XP / level / perk stacks / pending choices. */
  perksState() {
    return perks.state();
  },

  /** Grant XP (debug/verification): triggers the level-up choice at a bound. */
  addXp(n) {
    perks.addXp(Math.max(0, Number(n) || 0));
    return perks.state();
  },

  /** Contract-board snapshot. */
  contractsState() {
    return contracts.state();
  },

  /** Open the contract board from anywhere (debug/verification only). */
  openContracts() {
    contractsUI.open();
    return { open: contractsUI.isOpen() };
  },

  /** Hazard barrels: counts + detonated. */
  hazardsState() {
    return hazards.stats();
  },

  /** Force-detonate the nearest hazard (debug/verification only). */
  detonateHazard(x, z) {
    if (typeof hazards.detonateAt === "function") {
      hazards.detonateAt(Number(x) || 0, Number(z) || 0);
    }
    return hazards.stats();
  },
};

const debug = createDebugHook();
debug.register(debugApi); // LAST step of the bootstrap sequence
