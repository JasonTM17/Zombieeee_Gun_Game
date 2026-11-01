/**
 * ============================================================================
 * MISSIONS — chuỗi 10 nhiệm vụ cốt truyện "ĐÊM THỨ 30" (P1 §5.1 + P3 §3.7;
 * nội dung thoại: docs/STORY.md + docs/EXPANSION-P3.md §7.3 — nguyên văn).
 * ============================================================================
 * State machine: every mission is locked → active → done. Exactly ONE active
 * mission at a time; completing it auto-activates the next one. `current`
 * is 1-BASED (m1 = 1 … m10 = 10 — P3-K2); 0 = not started; 11 = chain
 * finished (free-roam — was 10 before P3 stretched the chain 9 → 10).
 * Mission 9 completion also opens the five remaining steel gates via
 * "gate-open" (docs/EXPANSION-P1.md §5.1.1 table — decision K2/K6).
 * Mission 10 "Nguồn Gốc" (P3 §3.7): single {type:"boss"} objective targeting
 * the ORIGIN — completes through BOTH "zombie-killed" {type:"origin"} (BOSS_TYPES)
 * AND the "origin-defeated" bus event (P3-K3, both idempotent via setProgress).
 *
 * Objectives (one mission has 1–3):
 *   {type: "activate", target: "target_generator", targets: ["generator-1",
 *           "generator-2", "generator-3"]}   — via bus "interact"; each id
 *           counts exactly once (§5.1.2 "mỗi target đếm 1 lần"), need =
 *           targets.length (m1: 3). `target` is the i18n DISPLAY key
 *           (decision K1 mapping), `targets` holds the real bus target ids.
 *   {type: "collect",  item: "supply", need: 3}    — via bus "pickup-story"
 *   {type: "quota",    district: "residential"}    — via "zombie-killed"
 *   {type: "reach",    target, x, z, radius}       — checked in update()
 *   {type: "boss"}                                 — via "zombie-killed"
 *   {type: "survive",  district: "quarantine", seconds: 60} — ticked in update()
 *
 * Quota counting (decision K4): a "zombie-killed" {type, headshot, position}
 * counts ONLY when type ∈ {walker, runner, brute} AND
 * city.districtAt(position.x, position.z) === the quota district. Boss kills
 * feed ONLY the "boss" objective (type ∈ {butcher, spitter, screamer, golem,
 * origin — P3}). When the quota need is reached the module fires
 * "quota-done" {districtId} exactly once per district.
 *
 * Interaction (docs/EXPANSION-P1.md §5.1.3): this module CREATES the
 * interactable meshes (3 generators, 3 supply packs, radio tower, 3 medicine
 * boxes, campfire + its PointLight, 4 fuel cans — emissive, fog:false lamp,
 * castShadow = true) and DISPOSES them in reset(). Draw calls: collectibles
 * are ONE InstancedMesh per item kind (an instance is hidden by zero-scaling
 * its matrix on pickup — a static merge could not hide single items without
 * rebuilding geometry); interactables merge their static parts per material.
 * POI meshes appear when their mission activates (collect kinds hide again
 * once the mission is done; activated machines stay lit as world state).
 * Generators/radio base/campfire push one small AABB into `level.colliders`
 * (collectibles do not). Flow:
 *   input "interact-press" → nearest ACTIVE POI within 2 m →
 *     emit "interact" {target};
 *     collect POIs also emit "pickup-story" {item, target} and hide their mesh.
 *   player enters/leaves the 3 m hint radius →
 *     emit "interact-near" {target, near: true|false} on STATE CHANGE only.
 * The vault door ("final-door" at (0,0)) is built by level.js (§3.2) — this
 * module only references its coordinates for the reach test.
 *
 * Scene/level access — ADDITIVE optional params (the frozen 3-argument call
 * keeps working): `createMissions(bus, city, economy)` runs HEADLESS (full
 * state machine + bus contract, no world objects). Pass the scene and level
 * after economy to get the POI meshes, the mission beacon and the POI
 * colliders:
 *   createMissions(bus, city, economy, scene, level)
 * A city implementation that exposes `__scene`/`__level` (or `scene`/`level`)
 * is also probed as a fallback. Without a scene the reach/survive/quota
 * logic and every event behave identically — only the visuals are absent.
 *
 * Story beacon ("cột sáng marker nhiệm vụ"): ONE additive glow pillar moved
 * (event-driven, never per-frame allocation) to the first unfinished target
 * of the active mission — a POI position, or the quota/survive district
 * center. Hidden when nothing points anywhere (e.g. the boss objective).
 *
 * Gates: this module is the ONLY emitter of "gate-open" {from, to} — fired
 * when a mission completes (quota-done AND the collect/activate objectives
 * both finished is implied by mission completion). Mission 6 fires TWO
 * events: {docks, quarantine} AND {docks, safehouse} (decision K2); mission
 * 9 fires the five remaining steel gates (decision K6).
 *
 * Money: `economy` is received per the frozen signature but this module
 * MUST NOT call economy.add — main.js pays the reward on "mission-complete"
 * (docs/STORY.md §6, docs/EXPANSION-P1.md §8).
 *
 * Bus events emitted: "mission-start" {index, titleKey, objectives},
 * "objective-progress" {mission, objective, done, need},
 * "mission-complete" {index, reward}, "gate-open" {from, to},
 * "quota-done" {districtId}, "pickup-story" {item, target},
 * "interact" {target}, "interact-near" {target, near},
 * "mission-reset" {} (from reset()).
 * Bus events consumed: "zombie-killed", "interact-press", "origin-defeated"
 * (P3 §3.7 — completes m10's boss objective; the payload is ignored, the
 * kill path through "zombie-killed" {type:"origin"} is the primary one and
 * this listener is the belt-and-braces route from P3-K3).
 * ("interact"/"pickup-story" are self-emitted; handling them directly is
 * allowed as long as the payloads above stay on the bus verbatim). An
 * "interact-press" only lands while the run is live (this module tracks its
 * own update() freshness — presses from menus/pause/intro are ignored).
 *
 * i18n keys owned by THIS module (register via i18n.registerBundle, flat
 * keys, EN + VI verbatim from docs/EXPANSION-P1.md §7.3–§7.6 +
 * docs/EXPANSION-P3.md §7.2–§7.3): mission1..10_title, obj_*, item_*,
 * target_*, mission_progress ({n}/10 — P3), mission_complete_toast,
 * quota_counter, quota_done_toast, gate_open_toast, interact_hint, plus the
 * m10 dialogue line keys (m10_radio_line1/2, m10_you_line1 — dialogue.js
 * owns m1..m9 texts; the m10 lines live here because Builder A does not own
 * dialogue.js, §2 table; the text is §7.3 verbatim).
 * The `district_*` keys belong to city.js and are intentionally NOT
 * registered here (i18n.t falls back to the key itself until city registers
 * them).
 *
 * STORY_DIALOGUE (export, §5.1.5 + P3 §7.3): map "m1".."m10" →
 * {start: [{speaker, key}…], done: […]} with speaker ∈ "radio"|"you"|
 * "unknown" and keys/order EXACTLY per docs/EXPANSION-P1.md §7.7 (m1..m9
 * text lives verbatim in docs/STORY.md §3) + docs/EXPANSION-P3.md §7.3 (m10).
 * m9 and m10 have NO done-lines (m9: reach chạm cửa → m10 cascade chạy ngay;
 * m10: màn kết thay thoại done — P3-K4).
 *
 * reset(): back to mission 1 locked, clears progress, disposes POI meshes,
 * emits "mission-reset". Does NOT emit "mission-start" (main.js activates
 * mission 1 explicitly through begin() on story/free-play start).
 *
 * Additive API used by the integrator/debug (docs/EXPANSION-P1.md §5.6.2 +
 * §5.6.5): begin(), skipToMission(n), completeObjective(), fillQuota(),
 * getState(). None of them are required for the frozen 3-property surface.
 *
 * @param {EventTarget} [busArg] - the shared bus (src/systems/gamestate.js);
 *   falls back to the module-level shared bus when omitted.
 * @param {import("../world/city.js").City} city - district lookup + quota
 *   position tests (districtAt).
 * @param {import("./economy.js").Economy} economy - received per contract;
 *   NOT used to add money (main.js pays rewards).
 * @param {import("three").Scene} [sceneArg] - ADDITIVE: pass the scene to
 *   build the POI meshes + beacon (headless when omitted).
 * @param {import("../world/level.js").Level} [levelArg] - ADDITIVE: pass the
 *   level to push the POI colliders + run the blocked-position dev guard.
 * @returns {Missions}
 */

/**
 * @typedef {Object} MissionObjective
 * @property {("activate"|"collect"|"quota"|"reach"|"boss"|"survive")} type
 * @property {string} [target] - interact target id ("generator-1",
 *   "campfire", … per docs/EXPANSION-P1.md §5.1.3); for "activate" this is
 *   the i18n DISPLAY key ("target_generator") per decision K1.
 * @property {string[]} [targets] - "activate" only: the real target ids,
 *   each counting once.
 * @property {string} [item] - collect item id ("supply"|"medicine"|"fuel").
 * @property {string} [district] - quota / survive district id.
 * @property {number} [x] - reach point X.
 * @property {number} [z] - reach point Z.
 * @property {number} [radius] - reach radius in meters.
 * @property {number} [seconds] - survive duration.
 * @property {number} done - current progress.
 * @property {number} need - goal (1 for activate/reach/boss types).
 * @property {boolean} complete - true when done >= need.
 */

/**
 * @typedef {Object} Missions
 * @property {number} current - active mission index (1..10), 0 = none, 11 =
 *   chain complete (free-roam) — P3-K2: 10 is now mission 10 itself.
 * @property {MissionObjective[]} objectives - live view of the active
 *   mission's objectives (empty when current is 0 or 11).
 * @property {(dt: number, playerPos: {x: number, z: number}) => void} update
 *   Per-frame tick while playing: reach checks + survive timer (survive only
 *   ticks while the player is inside quarantine; leaving pauses it).
 * @property {() => void} reset - fresh chain (m1 locked); disposes POI
 *   meshes; emits "mission-reset"; does NOT emit "mission-start".
 * @property {() => void} begin - ADDITIVE (§5.6.2): activate mission 1 when
 *   the chain has not started (current === 0) and emit "mission-start".
 * @property {(n: number) => boolean} skipToMission - ADDITIVE debug
 *   (§5.6.5): mark m1..m(n-1) done (firing their gate-open + quota-done),
 *   activate mission n + emit "mission-start".
 * @property {() => boolean} completeObjective - ADDITIVE debug (§5.6.5):
 *   force-complete the first unfinished objective of the active mission;
 *   true when something was completed.
 * @property {() => boolean} fillQuota - ADDITIVE debug (§5.6.5): set the
 *   active mission's quota objective to done = need (+ "quota-done");
 *   false when there is no quota objective.
 * @property {() => {mission: number, titleKey: string|null, quotaDone: number,
 *   quotaNeed: number, quotaDistrict: string|null, objectives: MissionObjective[]}}
 *   getState - ADDITIVE debug (§5.6.5): story snapshot for window.__game.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as i18n from "../core/i18n.js";
import { bus as sharedBus } from "./gamestate.js";

// --- i18n (docs/EXPANSION-P1.md §7.3–§7.6, EN + VI verbatim) -----------------

i18n.registerBundle({
  en: {
    mission1_title: "Lights On",
    mission2_title: "Dead Blocks",
    mission3_title: "The Signal",
    mission4_title: "Medicine Run",
    mission5_title: "Signal Fire",
    mission6_title: "Fuel Run",
    mission7_title: "Into the Swarm",
    mission8_title: "The Warden",
    mission9_title: "The Last Door",
    mission10_title: "The Origin", // P3 §7.2 verbatim
    // m10 dialogue lines — text §7.3 verbatim (dialogue.js owns m1..m9; this
    // module registers the m10 set — see the header note).
    m10_radio_line1: "There... that's the thing that started all of this.",
    m10_radio_line2: "Kill it. Save every one of us.",
    m10_you_line1: "One last job. For all of them.",
    item_supply: "Supply Pack",
    item_medicine: "Medicine Box",
    item_fuel: "Fuel Can",
    target_generator: "Generator",
    target_antenna: "Broadcast Antenna",
    target_campfire: "Campfire",
    target_steel_door: "Central Steel Door",
    obj_quota: "Kill zombies in {district}: {n}/{need}",
    obj_collect: "Collect {item}: {n}/{need}",
    obj_activate: "Activate: {target}",
    obj_reach: "Reach the marker",
    obj_boss: "Kill the boss",
    obj_survive: "Survive: {n}/{need} s",
    mission_progress: "MISSION {n}/10", // P3 §7.2: chain 9 → 10
    mission_complete_toast: "MISSION COMPLETE +{money}$",
    quota_counter: "🧟 {n}/{need}",
    quota_done_toast: "DISTRICT CLEARED",
    gate_open_toast: "GATE OPEN — {district}",
    interact_hint: "E — INTERACT",
  },
  vi: {
    mission1_title: "Sáng Đèn",
    mission2_title: "Đường Phố",
    mission3_title: "Tiếng Radio",
    mission4_title: "Thuốc Cho Bệnh Nhân",
    mission5_title: "Lửa Trại Cầu Cứu",
    mission6_title: "Nhiên Liệu",
    mission7_title: "Vào Tâm Dịch",
    mission8_title: "Vệ Binh Cách Ly",
    mission9_title: "Cánh Cửa Cuối",
    mission10_title: "Nguồn Gốc", // P3 §7.2 verbatim
    m10_radio_line1: "Đó... đó là thứ đã bắt đầu tất cả.",
    m10_radio_line2: "Diệt nó. Cứu tất cả chúng tôi.",
    m10_you_line1: "Việc cuối cùng thôi. Vì tất cả bọn họ.",
    item_supply: "Gói Tiếp Tế",
    item_medicine: "Hộp Thuốc",
    item_fuel: "Can Xăng",
    target_generator: "Máy Phát Điện",
    target_antenna: "Đài Phát Sáng",
    target_campfire: "Đống Lửa Trại",
    target_steel_door: "Cửa Thép Trung Tâm",
    obj_quota: "Hạ zombie trong {district}: {n}/{need}",
    obj_collect: "Thu {item}: {n}/{need}",
    obj_activate: "Kích hoạt: {target}",
    obj_reach: "Tới điểm đánh dấu",
    obj_boss: "Hạ boss",
    obj_survive: "Trụ lại: {n}/{need} s",
    mission_progress: "NHIỆM VỤ {n}/10", // P3 §7.2: chain 9 → 10
    mission_complete_toast: "NHIỆM VỤ HOÀN THÀNH +{money}$",
    quota_counter: "🧟 {n}/{need}",
    quota_done_toast: "KHU ĐÃ SẠCH",
    gate_open_toast: "CỔNG MỞ — {district}",
    interact_hint: "E — TƯƠNG TÁC",
  },
});

/**
 * Dialogue line map for main.js (docs/EXPANSION-P1.md §5.1.5). Keys and
 * order MUST match docs/EXPANSION-P1.md §7.7; the EN/VI text of every key
 * lives verbatim in docs/STORY.md §3. m9 has NO done-lines (reach chạm cửa
 * → cắt thẳng sang OUTRO).
 *
 * @type {Record<string, {start: Array<{speaker: "radio"|"you"|"unknown",
 *   key: string}>, done: Array<{speaker: "radio"|"you"|"unknown",
 *   key: string}>}>}
 */
export const STORY_DIALOGUE = {
  m1: {
    start: [
      { speaker: "radio", key: "m1_radio_line1" },
      { speaker: "radio", key: "m1_radio_line2" },
      { speaker: "you", key: "m1_you_line1" },
      { speaker: "radio", key: "m1_radio_line3" },
    ],
    done: [
      { speaker: "radio", key: "m1_done_radio_line1" },
      { speaker: "you", key: "m1_done_you_line1" },
    ],
  },
  m2: {
    start: [
      { speaker: "radio", key: "m2_radio_line1" },
      { speaker: "radio", key: "m2_radio_line2" },
      { speaker: "you", key: "m2_you_line1" },
      { speaker: "radio", key: "m2_radio_line3" },
    ],
    done: [
      { speaker: "radio", key: "m2_done_radio_line1" },
      { speaker: "you", key: "m2_done_you_line1" },
    ],
  },
  m3: {
    start: [
      { speaker: "radio", key: "m3_radio_line1" },
      { speaker: "you", key: "m3_you_line1" },
      { speaker: "radio", key: "m3_radio_line2" },
    ],
    done: [
      { speaker: "you", key: "m3_done_you_line1" },
      { speaker: "radio", key: "m3_done_radio_line1" },
    ],
  },
  m4: {
    start: [
      { speaker: "unknown", key: "m4_unknown_line1" },
      { speaker: "you", key: "m4_you_line1" },
      { speaker: "unknown", key: "m4_unknown_line2" },
    ],
    done: [
      { speaker: "unknown", key: "m4_done_unknown_line1" },
      { speaker: "you", key: "m4_done_you_line1" },
    ],
  },
  m5: {
    start: [
      { speaker: "unknown", key: "m5_unknown_line1" },
      { speaker: "you", key: "m5_you_line1" },
      { speaker: "radio", key: "m5_radio_line1" },
    ],
    done: [
      { speaker: "unknown", key: "m5_done_unknown_line1" },
      { speaker: "you", key: "m5_done_you_line1" },
    ],
  },
  m6: {
    start: [
      { speaker: "radio", key: "m6_radio_line1" },
      { speaker: "you", key: "m6_you_line1" },
      { speaker: "radio", key: "m6_radio_line2" },
    ],
    done: [
      { speaker: "unknown", key: "m6_done_unknown_line1" },
      { speaker: "radio", key: "m6_done_radio_line1" },
    ],
  },
  m7: {
    start: [
      { speaker: "unknown", key: "m7_unknown_line1" },
      { speaker: "radio", key: "m7_radio_line1" },
      { speaker: "you", key: "m7_you_line1" },
      { speaker: "radio", key: "m7_radio_line2" },
    ],
    done: [
      { speaker: "you", key: "m7_done_you_line1" },
      { speaker: "unknown", key: "m7_done_unknown_line1" },
    ],
  },
  m8: {
    start: [
      { speaker: "unknown", key: "m8_unknown_line1" },
      { speaker: "you", key: "m8_you_line1" },
      { speaker: "radio", key: "m8_radio_line1" },
    ],
    done: [{ speaker: "radio", key: "m8_done_radio_line1" }],
  },
  m9: {
    start: [
      { speaker: "radio", key: "m9_radio_line1" },
      { speaker: "unknown", key: "m9_unknown_line1" },
    ],
    done: [],
  },
  // P3 §7.3 verbatim: 3 start lines, NO done lines (màn kết thay thoại done
  // — P3-K4). Keys' EN/VI text lives in THIS module's bundle (§7.3).
  m10: {
    start: [
      { speaker: "radio", key: "m10_radio_line1" },
      { speaker: "radio", key: "m10_radio_line2" },
      { speaker: "you", key: "m10_you_line1" },
    ],
    done: [],
  },
};

// --- static data (docs/WORLD.md §11 POI table; docs/EXPANSION-P1.md §5.1.1) --

/** Zombie types that feed a quota objective (decision K4). */
const QUOTA_TYPES = { walker: true, runner: true, brute: true };
/** Boss types that feed the "boss" objective (decision K4 + P3-K3/1:
 *  "origin" lands m10's objective through the same "zombie-killed" path). */
const BOSS_TYPES = { butcher: true, spitter: true, screamer: true, golem: true, origin: true };

const INTERACT_RADIUS = 2; // §5.1.3: E works within 2 m
const HINT_RADIUS = 3; // §5.1.3: "E — TƯƠNG TÁC" hint at 3 m
const PRESS_STALE_MS = 300; // ignore E while update() is not running (pause/menus)

/** Reach radii (§5.1.3): radio-tower 3 m, final-door 2.5 m. */
const REACH_RADIUS = { "radio-tower": 3, "final-door": 2.5 };

/**
 * Every story POI in the world (docs/WORLD.md §11 — coordinates verbatim).
 * `mission` = the 1-based mission that owns it.
 * @type {Array<{target: string, kind: "activate"|"collect"|"reach",
 *               item?: string, mission: number, district: string,
 *               x: number, z: number}>}
 */
const POIS = [
  { target: "generator-1", kind: "activate", mission: 1, district: "safehouse", x: -89, z: -15 },
  { target: "generator-2", kind: "activate", mission: 1, district: "safehouse", x: -61, z: -15 },
  { target: "generator-3", kind: "activate", mission: 1, district: "safehouse", x: -75, z: 15 },
  { target: "supply-1", kind: "collect", item: "supply", mission: 2, district: "residential", x: -120, z: -123 },
  { target: "supply-2", kind: "collect", item: "supply", mission: 2, district: "residential", x: -30, z: -100 },
  { target: "supply-3", kind: "collect", item: "supply", mission: 2, district: "residential", x: -70, z: -45 },
  { target: "radio-tower", kind: "reach", mission: 3, district: "commercial", x: 55, z: -95 },
  { target: "medicine-1", kind: "collect", item: "medicine", mission: 4, district: "hospital", x: 59, z: -6 },
  { target: "medicine-2", kind: "collect", item: "medicine", mission: 4, district: "hospital", x: 59, z: 6 },
  { target: "medicine-3", kind: "collect", item: "medicine", mission: 4, district: "hospital", x: 76, z: 4 },
  { target: "campfire", kind: "activate", mission: 5, district: "park", x: 10, z: 70 },
  { target: "fuel-1", kind: "collect", item: "fuel", mission: 6, district: "docks", x: -120, z: 40 },
  { target: "fuel-2", kind: "collect", item: "fuel", mission: 6, district: "docks", x: -30, z: 120 },
  { target: "fuel-3", kind: "collect", item: "fuel", mission: 6, district: "docks", x: -90, z: 90 },
  { target: "fuel-4", kind: "collect", item: "fuel", mission: 6, district: "docks", x: -45, z: 55 },
  // final-door: mesh (vault door) is level.js's (§3.2) — reach target only.
  { target: "final-door", kind: "reach", mission: 9, district: "quarantine", x: 0, z: 0 },
];

/**
 * The 9-mission chain (docs/EXPANSION-P1.md §5.1.1 table — rewards and
 * gate-open pairs verbatim; m6 carries BOTH K2 gates, m9 the 5 steel gates).
 * @type {Array<{titleKey: string, district: string, reward: number,
 *               gates: Array<[string, string]>,
 *               objectives: Array<Object>}>}
 */
const MISSION_DEFS = [
  {
    titleKey: "mission1_title",
    district: "safehouse",
    reward: 300,
    gates: [["safehouse", "residential"]],
    objectives: [
      { type: "activate", targetKey: "target_generator", targets: ["generator-1", "generator-2", "generator-3"] },
    ],
  },
  {
    titleKey: "mission2_title",
    district: "residential",
    reward: 325,
    gates: [["residential", "commercial"]],
    objectives: [
      { type: "quota", district: "residential", need: 20 },
      { type: "collect", item: "supply", need: 3 },
    ],
  },
  {
    titleKey: "mission3_title",
    district: "commercial",
    reward: 350,
    gates: [["commercial", "hospital"]],
    objectives: [
      { type: "quota", district: "commercial", need: 25 },
      { type: "reach", target: "radio-tower" },
    ],
  },
  {
    titleKey: "mission4_title",
    district: "hospital",
    reward: 400,
    gates: [["hospital", "park"]],
    objectives: [
      { type: "quota", district: "hospital", need: 30 },
      { type: "collect", item: "medicine", need: 3 },
    ],
  },
  {
    titleKey: "mission5_title",
    district: "park",
    reward: 425,
    gates: [["park", "docks"]],
    objectives: [
      { type: "quota", district: "park", need: 25 },
      { type: "activate", targetKey: "target_campfire", targets: ["campfire"] },
    ],
  },
  {
    titleKey: "mission6_title",
    district: "docks",
    reward: 450,
    gates: [["docks", "quarantine"], ["docks", "safehouse"]], // decision K2
    objectives: [
      { type: "quota", district: "docks", need: 30 },
      { type: "collect", item: "fuel", need: 4 },
    ],
  },
  {
    titleKey: "mission7_title",
    district: "quarantine",
    reward: 500,
    gates: [],
    objectives: [{ type: "survive", district: "quarantine", seconds: 60 }],
  },
  {
    titleKey: "mission8_title",
    district: "quarantine",
    reward: 550,
    gates: [],
    objectives: [{ type: "boss" }],
  },
  {
    titleKey: "mission9_title",
    district: "quarantine",
    reward: 600,
    // decision K6: the five remaining steel gates, all at once
    gates: [
      ["safehouse", "quarantine"],
      ["residential", "quarantine"],
      ["commercial", "quarantine"],
      ["hospital", "quarantine"],
      ["park", "quarantine"],
    ],
    objectives: [{ type: "reach", target: "final-door" }],
  },
  // P3 §3.7 (1): the FINAL mission — the Origin rises from the vault once
  // this activates. main.js hears "mission-start" {index:10} → city.openVault()
  // + spawnOriginInternal(); the boss objective completes via "zombie-killed"
  // {type:"origin"} AND "origin-defeated" (P3-K3, both idempotent).
  {
    titleKey: "mission10_title",
    district: "quarantine",
    reward: 600,
    gates: [],
    objectives: [{ type: "boss" }],
  },
];

// --- factory ------------------------------------------------------------------

export function createMissions(busArg, city, economy, sceneArg, levelArg) {
  void economy; // received per the frozen signature — main.js pays rewards
  const B = busArg || sharedBus;

  // Additive scene/level resolution: explicit params win; a city that exposes
  // its own refs (__scene/__level or scene/level) is tolerated as fallback.
  const scene =
    sceneArg ||
    (city && (city.__scene || city.scene)) ||
    null;
  const level =
    levelArg ||
    (city && (city.__level || city.level)) ||
    null;

  /** Mission states: index 0 → m1 … 9 → m10 (P3-K2). */
  const states = MISSION_DEFS.map(() => ({
    status: /** @type {"locked"|"active"|"done"} */ ("locked"),
    objectives: /** @type {MissionObjective[]} */ ([]),
  }));
  let current = 0; // 1..10 active (P3-K2), 0 = not started, 11 = free-roam

  /** Per-district quota-done guard (§5.1.2 — exactly once per district). */
  const quotaDone = new Set();
  /** Target ids already activated (each counts once). */
  const activated = new Set();
  /** Target ids already collected (mesh hidden). */
  const collected = new Set();
  /** interact-near state per target — emitted on CHANGE only. */
  const near = new Map();

  let lastUpdateAt = -Infinity; // press freshness guard (menus/pause ignored)
  /** Player position snapshot for the press handler (written by update()). */
  let pressX = 0;
  let pressZ = 0;

  // --- world objects (built lazily when a scene is available) ---------------
  let built = false;
  /** @type {THREE.Object3D[]} */
  const objects = [];
  /** @type {THREE.BufferGeometry[]} */
  const geometries = [];
  /** @type {THREE.Material[]} */
  const materials = [];
  /** Collider refs pushed into level.colliders (spliced back on dispose). */
  const collidersAdded = [];
  /** target id → visible pieces (visibility toggled per mission). */
  /** @type {Map<string, THREE.Object3D[]>} */
  const poiPieces = new Map();
  /** Merged generator bodies — scenery from mission 1 onward. */
  let genBodies = null;
  /** Shared scratch for the zero-scale pickup hide (no per-pickup alloc). */
  const scratchMat4 = new THREE.Matrix4();
  /** target id → its InstancedMesh slot index (collect kinds). */
  /** @type {Map<string, {mesh: THREE.InstancedMesh, slot: number}>} */
  const poiSlots = new Map();
  /** generator target id → its glow strip material (activation swap). */
  /** @type {Map<string, THREE.MeshBasicMaterial>} */
  const stripMats = new Map();
  let campfireFlame = null;
  let campfireLight = null;
  let towerTipMat = null;
  let beacon = null;
  let beaconMat = null;
  let fxTime = 0;

  function emit(name, detail) {
    B.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function safeDistrictAt(x, z) {
    if (!city || typeof city.districtAt !== "function") return null;
    try {
      return city.districtAt(x, z);
    } catch {
      return null;
    }
  }

  /** Fresh live view of one objective definition. */
  function liveObjective(def) {
    const o = /** @type {MissionObjective & {targets?: string[], acc?: number}} */ ({
      type: def.type,
      done: 0,
      complete: false,
    });
    if (def.type === "quota") {
      o.district = def.district;
      o.need = def.need;
    } else if (def.type === "collect") {
      o.item = def.item;
      o.need = def.need;
    } else if (def.type === "activate") {
      o.targets = def.targets.slice();
      o.target = def.targetKey; // i18n display key (decision K1)
      o.need = def.targets.length;
    } else if (def.type === "reach") {
      const poi = POIS.find((p) => p.target === def.target);
      o.target = def.target;
      o.x = poi ? poi.x : 0;
      o.z = poi ? poi.z : 0;
      o.radius = REACH_RADIUS[def.target] || 3;
      o.need = 1;
    } else if (def.type === "boss") {
      o.need = 1;
    } else if (def.type === "survive") {
      o.district = def.district;
      o.seconds = def.seconds;
      o.need = def.seconds;
    }
    return o;
  }

  function currentObjectives() {
    return current >= 1 && current <= 10 ? states[current - 1].objectives : [];
  }

  /** One "objective-progress" {mission, objective, done, need} on change. */
  function setProgress(obj, value) {
    const v = Math.max(0, Math.min(obj.need, Math.round(value)));
    if (v === obj.done && obj.complete) return;
    const changed = v !== obj.done;
    obj.done = v;
    if (obj.done >= obj.need) obj.complete = true;
    if (changed || obj.complete) {
      emit("objective-progress", {
        mission: current,
        objective: obj,
        done: obj.done,
        need: obj.need,
      });
    }
    refreshBeacon();
  }

  /** quota-done {districtId} — exactly once per district. */
  function markQuotaDone(districtId) {
    if (!districtId || quotaDone.has(districtId)) return;
    quotaDone.add(districtId);
    emit("quota-done", { districtId });
  }

  /** All objectives of the active mission done → complete + advance. */
  function checkMissionComplete() {
    if (current < 1 || current > 10) return; // P3-K2: chain now 1..10
    const st = states[current - 1];
    for (let i = 0; i < st.objectives.length; i++) {
      if (!st.objectives[i].complete) return;
    }
    const def = MISSION_DEFS[current - 1];
    const index = current;
    st.status = "done";
    emit("mission-complete", { index, reward: def.reward });
    for (let g = 0; g < def.gates.length; g++) {
      emit("gate-open", { from: def.gates[g][0], to: def.gates[g][1] });
    }
    if (index >= MISSION_DEFS.length) {
      current = MISSION_DEFS.length + 1; // 11 = free-roam (P3-K2)
      clearNearHints();
      refreshPoiVisibility();
      refreshBeacon();
    } else {
      activateMission(index + 1);
    }
  }

  /** Clear every near-hint still lit (state change → near:false). */
  function clearNearHints() {
    for (const [target, was] of near) {
      if (was) emit("interact-near", { target, near: false });
    }
    near.clear();
  }

  /** Activate mission `index` (1..10): fresh objectives + "mission-start". */
  function activateMission(index) {
    const def = MISSION_DEFS[index - 1];
    current = index;
    const st = states[index - 1];
    st.status = "active";
    st.objectives = def.objectives.map(liveObjective);
    clearNearHints();
    refreshPoiVisibility();
    refreshBeacon();
    emit("mission-start", {
      index,
      titleKey: def.titleKey,
      objectives: st.objectives,
    });
  }

  // --- world objects ----------------------------------------------------------

  /** Mark a piece list under a target id. */
  function pieces(target, list) {
    poiPieces.set(target, list);
    for (let i = 0; i < list.length; i++) {
      objects.push(list[i]);
      list[i].visible = false; // refreshPoiVisibility() reveals the active ones
    }
  }

  /**
   * Collect-kind items: ONE InstancedMesh per item kind. A collected item is
   * hidden by zero-scaling its instance matrix (a static merge could not
   * hide single items without rebuilding geometry).
   */
  function buildCollectKind(item, geoParams, color, emissive) {
    const list = POIS.filter((p) => p.kind === "collect" && p.item === item);
    if (list.length === 0) return;
    const geo = new THREE.BoxGeometry(geoParams[0], geoParams[1], geoParams[2]);
    geo.translate(0, geoParams[1] / 2, 0); // sit on the ground
    geometries.push(geo);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: 0.85,
      roughness: 0.55,
      metalness: 0.2,
    });
    materials.push(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.Matrix4();
    for (let i = 0; i < list.length; i++) {
      m.makeTranslation(list[i].x, 0, list[i].z);
      mesh.setMatrixAt(i, m);
      poiSlots.set(list[i].target, { mesh, slot: i });
      pieces(list[i].target, [mesh]); // shared piece list (toggled together)
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }

  function addCollider(minX, maxX, minZ, maxZ) {
    if (!level || !level.colliders) return;
    const c = { minX, maxX, minZ, maxZ };
    level.colliders.push(c);
    collidersAdded.push(c);
  }

  /** Build every POI mesh + the beacon (needs a scene; runs once per build). */
  function buildPois() {
    if (built || !scene) return;
    built = true;

    // -- 3 generators (M1): merged dark bodies + per-unit glow strip ---------
    const bodyGeos = [];
    const genMat = new THREE.MeshStandardMaterial({
      color: 0x2b313a,
      roughness: 0.6,
      metalness: 0.55,
    });
    materials.push(genMat);
    for (const p of POIS) {
      if (p.kind !== "activate" || p.target.indexOf("generator") !== 0) continue;
      const body = new THREE.BoxGeometry(1.5, 1.2, 1.0);
      body.translate(p.x, 0.6, p.z);
      bodyGeos.push(body);
      geometries.push(body);
      const stripMat = new THREE.MeshBasicMaterial({
        color: 0x6a5326, // dim amber — "phát sáng nhẹ" while off
        fog: false,
        toneMapped: false,
      });
      materials.push(stripMat);
      stripMats.set(p.target, stripMat);
      const stripGeo = new THREE.BoxGeometry(1.3, 0.16, 0.85);
      stripGeo.translate(p.x, 1.28, p.z);
      geometries.push(stripGeo);
      const strip = new THREE.Mesh(stripGeo, stripMat);
      pieces(p.target, [strip]);
      scene.add(strip);
      addCollider(p.x - 0.8, p.x + 0.8, p.z - 0.55, p.z + 0.55);
    }
    if (bodyGeos.length > 0) {
      const merged = mergeGeometries(bodyGeos, false);
      if (merged) geometries.push(merged); // disposePois() cleans the merge too
      const bodies = new THREE.Mesh(merged || bodyGeos[0], genMat);
      bodies.userData.solid = true; // bullet occlusion (level.js contract)
      bodies.castShadow = true;
      bodies.receiveShadow = true;
      bodies.visible = false; // refreshPoiVisibility() reveals from m1 on
      genBodies = bodies;
      objects.push(bodies);
      scene.add(bodies);
    }

    // -- collectibles (M2/M4/M6): one InstancedMesh per item kind ------------
    buildCollectKind("supply", [0.6, 0.6, 0.6], 0x10333a, 0x35e0ff);
    buildCollectKind("medicine", [0.5, 0.4, 0.5], 0x3a3f45, 0xff8a8a);
    buildCollectKind("fuel", [0.5, 0.7, 0.35], 0x3a1512, 0xff3b30);

    // -- radio tower (M3 reach): mast + blinking tip (landmark, fog:false) ---
    const mastGeo = new THREE.BoxGeometry(0.8, 9, 0.8);
    mastGeo.translate(55, 4.5, -95);
    geometries.push(mastGeo);
    const mastMat = new THREE.MeshStandardMaterial({
      color: 0x232a33,
      roughness: 0.5,
      metalness: 0.7,
    });
    materials.push(mastMat);
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.userData.solid = true;
    mast.castShadow = true;
    pieces("radio-tower", [mast]);
    scene.add(mast);
    addCollider(54.55, 55.45, -95.45, -94.55);
    const tipGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    tipGeo.translate(55, 9.35, -95);
    geometries.push(tipGeo);
    towerTipMat = new THREE.MeshBasicMaterial({
      color: 0xff453a,
      fog: false,
      toneMapped: false,
    });
    materials.push(towerTipMat);
    const tip = new THREE.Mesh(tipGeo, towerTipMat);
    // The tip shares the mast's visibility via the same target id.
    poiPieces.get("radio-tower").push(tip);
    objects.push(tip);
    tip.visible = false;
    scene.add(tip);

    // -- campfire (M5 activate): stone ring + logs + flame + light -----------
    const stoneGeos = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const g = new THREE.BoxGeometry(0.45, 0.35, 0.45);
      g.rotateY(a);
      g.translate(10 + Math.cos(a) * 1.2, 0.18, 70 + Math.sin(a) * 1.2);
      stoneGeos.push(g);
      geometries.push(g);
    }
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x3a3f46,
      roughness: 0.9,
      metalness: 0.05,
    });
    materials.push(stoneMat);
    const stoneMerged = mergeGeometries(stoneGeos, false);
    if (stoneMerged) geometries.push(stoneMerged);
    const stones = new THREE.Mesh(stoneMerged || stoneGeos[0], stoneMat);
    stones.userData.solid = true;
    stones.castShadow = true;
    stones.receiveShadow = true;
    const logGeos = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.BoxGeometry(1.5, 0.4, 0.4);
      g.rotateY((i * Math.PI) / 3);
      g.translate(10, 0.3, 70);
      logGeos.push(g);
      geometries.push(g);
    }
    const logMat = new THREE.MeshStandardMaterial({
      color: 0x2e2118,
      roughness: 0.95,
      metalness: 0,
    });
    materials.push(logMat);
    const logMerged = mergeGeometries(logGeos, false);
    if (logMerged) geometries.push(logMerged);
    const logs = new THREE.Mesh(logMerged || logGeos[0], logMat);
    logs.castShadow = true;
    const flameGeo = new THREE.ConeGeometry(0.5, 1.2, 6);
    flameGeo.translate(10, 1.0, 70);
    geometries.push(flameGeo);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x3a2410, // ember-dark until lit
      fog: false,
      toneMapped: false,
      transparent: true,
      opacity: 0.9,
    });
    materials.push(flameMat);
    campfireFlame = new THREE.Mesh(flameGeo, flameMat);
    campfireLight = new THREE.PointLight(0xff8a3c, 0, 18, 2); // lit on activation
    campfireLight.position.set(10, 1.0, 70);
    pieces("campfire", [stones, logs, campfireFlame]);
    objects.push(campfireLight);
    scene.add(stones, logs, campfireFlame, campfireLight);
    addCollider(10 - 1.2, 10 + 1.2, 70 - 1.2, 70 + 1.2);

    // -- story beacon: ONE additive glow pillar, event-driven position -------
    const beaconGeo = new THREE.CylinderGeometry(0.32, 0.32, 26, 10, 1, true);
    geometries.push(beaconGeo);
    beaconMat = new THREE.MeshBasicMaterial({
      color: 0x54e0ff,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.visible = false;
    beacon.position.y = 13;
    objects.push(beacon);
    scene.add(beacon);

    // Dev-guard (zones.js:139-152 pattern — warn, never throw). final-door is
    // exempt: the vault door built by level.js (§3.2) is INTENTIONALLY solid at
    // (0, 0) — city.js guards it as district membership, not walkability.
    if (level && typeof level.isBlocked === "function") {
      for (const p of POIS) {
        if (p.target === "final-door") continue;
        if (level.isBlocked(p.x, p.z, 0.8)) {
          console.warn(
            "[missions] POI " + p.target + " (" + p.x + ", " + p.z + ") is blocked — world/missions layout drifted"
          );
        }
      }
    }
  }

  /** Dispose every POI mesh + light + beacon (reset() contract §5.1.3). */
  function disposePois() {
    if (!built || !scene) return;
    built = false;
    for (let i = 0; i < objects.length; i++) scene.remove(objects[i]);
    objects.length = 0;
    for (let i = 0; i < geometries.length; i++) geometries[i].dispose();
    geometries.length = 0;
    for (let i = 0; i < materials.length; i++) materials[i].dispose();
    materials.length = 0;
    if (level && level.colliders) {
      for (let i = 0; i < collidersAdded.length; i++) {
        const idx = level.colliders.indexOf(collidersAdded[i]);
        if (idx !== -1) level.colliders.splice(idx, 1);
      }
    }
    collidersAdded.length = 0;
    poiPieces.clear();
    genBodies = null;
    poiSlots.clear();
    stripMats.clear();
    campfireFlame = null;
    campfireLight = null;
    towerTipMat = null;
    beacon = null;
    beaconMat = null;
  }

  /**
   * Visibility policy: a POI's pieces appear when its mission activates
   * (`mission <= current`) and stay as world state afterwards (current = 11
   * keeps machines lit — free-roam after the chain). Collected ITEMS hide
   * individually through their
   * zero-scaled instance matrix — the shared InstancedMesh itself must stay
   * visible while sibling instances remain (a per-target toggle would hide
   * all three packs when one is picked up). Run-scoped on mission
   * transitions — no per-frame work.
   */
  function refreshPoiVisibility() {
    if (!built) return;
    if (genBodies) genBodies.visible = current >= 1;
    for (const p of POIS) {
      const list = poiPieces.get(p.target);
      if (!list) continue;
      const show = p.mission <= current;
      for (let i = 0; i < list.length; i++) list[i].visible = show;
    }
    if (beacon) beacon.visible = beaconTarget() !== null;
  }

  /** Hide one collected instance (zero-scale matrix — combat.js:164 ignores
   *  InstancedMesh in raycasts, so no leftover bullet-occluder either). */
  function hideInstance(target) {
    const slot = poiSlots.get(target);
    if (!slot) return;
    scratchMat4.makeScale(0, 0, 0);
    slot.mesh.setMatrixAt(slot.slot, scratchMat4);
    slot.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Generator glow strip → bright gold; campfire → roaring flame + light. */
  function activateVisual(target) {
    if (target.indexOf("generator") === 0) {
      const mat = stripMats.get(target);
      if (mat) mat.color.setHex(0xffc23d);
    } else if (target === "campfire" && built) {
      if (campfireFlame) campfireFlame.material.color.setHex(0xff9a3c);
      if (campfireLight) campfireLight.intensity = 14;
    }
  }

  // --- story beacon ------------------------------------------------------------

  /** First unfinished position of the active mission (event-driven). */
  function beaconTarget() {
    if (current < 1 || current > 10) return null; // P3-K2: 1..10
    const st = states[current - 1];
    for (let i = 0; i < st.objectives.length; i++) {
      const o = st.objectives[i];
      if (o.complete) continue;
      if (o.type === "reach") return { x: o.x, z: o.z };
      if (o.type === "activate") {
        for (const t of o.targets) {
          if (!activated.has(t)) {
            const poi = POIS.find((p) => p.target === t);
            return poi ? { x: poi.x, z: poi.z } : null;
          }
        }
      }
      if (o.type === "collect") {
        const poi = POIS.find(
          (p) => p.kind === "collect" && p.item === o.item && !collected.has(p.target)
        );
        if (poi) return { x: poi.x, z: poi.z };
      }
      if (o.type === "quota" || o.type === "survive") {
        const d = city && city.districts ? city.districts.find((x) => x.id === o.district) : null;
        if (d && d.center) return { x: d.center.x, z: d.center.z };
        if (o.district === "quarantine") return { x: 0, z: 0 };
        return null;
      }
      // "boss": no fixed point — the boss spawns at the wave anchor.
    }
    return null;
  }

  /** Move the beacon (or hide it). Called on mission/progress changes only. */
  function refreshBeacon() {
    if (!beacon) return;
    const t = beaconTarget();
    if (t) {
      beacon.position.set(t.x, 13, t.z);
      beacon.visible = true;
    } else {
      beacon.visible = false;
    }
  }

  // --- bus handlers ------------------------------------------------------------

  function onZombieKilled(e) {
    if (current < 1 || current > 10) return; // P3-K2: 1..10
    const d = e && e.detail ? e.detail : {};
    const type = d.type;
    if (!type) return;
    const objs = states[current - 1].objectives;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.complete) continue;
      if (o.type === "quota" && QUOTA_TYPES[type]) {
        const pos = d.position;
        const dd = pos ? safeDistrictAt(pos.x, pos.z) : null;
        if (dd !== o.district) continue; // K4: only kills INSIDE the district
        setProgress(o, o.done + 1);
        if (o.complete) markQuotaDone(o.district);
      } else if (o.type === "boss" && BOSS_TYPES[type]) {
        setProgress(o, 1);
      }
    }
    checkMissionComplete();
  }

  /** Nearest interactable (activate/collect, unfinished) POI within `r`. */
  function nearestActivePoi(x, z, r) {
    let best = null;
    let bestD = r * r;
    for (let i = 0; i < POIS.length; i++) {
      const p = POIS[i];
      if (p.mission !== current) continue;
      if (p.kind === "reach") continue;
      if (p.kind === "collect" && collected.has(p.target)) continue;
      if (p.kind === "activate" && activated.has(p.target)) continue;
      const dx = p.x - x;
      const dz = p.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= bestD) {
        bestD = d2;
        best = p;
      }
    }
    return best;
  }

  function onPress() {
    if (current < 1 || current > 10) return; // P3-K2: 1..10
    // Freshness guard: update() drives the game — a press older than the
    // guard window comes from menus/pause/intro where the world is frozen.
    if (performance.now() - lastUpdateAt > PRESS_STALE_MS) return;
    const poi = nearestActivePoi(pressX, pressZ, INTERACT_RADIUS);
    if (!poi) return;
    emit("interact", { target: poi.target });
    if (poi.kind === "collect") {
      collected.add(poi.target);
      hideInstance(poi.target);
      emit("pickup-story", { item: poi.item, target: poi.target });
      const objs = states[current - 1].objectives;
      for (let i = 0; i < objs.length; i++) {
        const o = objs[i];
        if (o.type === "collect" && o.item === poi.item && !o.complete) {
          setProgress(o, o.done + 1);
          break;
        }
      }
      checkMissionComplete();
    } else if (poi.kind === "activate") {
      activated.add(poi.target);
      activateVisual(poi.target);
      const objs = states[current - 1].objectives;
      for (let i = 0; i < objs.length; i++) {
        const o = objs[i];
        if (o.type === "activate" && o.targets.indexOf(poi.target) !== -1 && !o.complete) {
          setProgress(o, o.done + 1);
          break;
        }
      }
      checkMissionComplete();
    }
    refreshPoiVisibility();
  }

  // --- per-frame update ---------------------------------------------------------

  function update(dt, playerPos) {
    lastUpdateAt = performance.now();
    fxTime += Number.isFinite(dt) ? dt : 0;
    const px = playerPos && Number.isFinite(playerPos.x) ? playerPos.x : 0;
    const pz = playerPos && Number.isFinite(playerPos.z) ? playerPos.z : 0;
    pressX = px;
    pressZ = pz;

    // Ambient FX (beacon pulse / tower blink / campfire flicker) — no allocs.
    if (built) {
      if (beacon && beacon.visible && beaconMat) {
        beaconMat.opacity = 0.2 + 0.12 * (0.5 + 0.5 * Math.sin(fxTime * 2.2));
      }
      if (towerTipMat) {
        const k = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(fxTime * 3.4));
        towerTipMat.color.setRGB(1 * k, 0.27 * k, 0.23 * k);
      }
      if (campfireFlame && campfireLight && campfireLight.intensity > 0) {
        const f = 0.85 + 0.15 * Math.sin(fxTime * 9.7) + 0.06 * Math.sin(fxTime * 23.3);
        campfireLight.intensity = 14 * f;
      }
    }

    if (current < 1 || current > 10) return; // P3-K2: 1..10
    const st = states[current - 1];
    const objs = st.objectives;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.complete) continue;
      if (o.type === "reach") {
        const dx = px - o.x;
        const dz = pz - o.z;
        const r = o.radius || 3;
        if (dx * dx + dz * dz <= r * r) {
          setProgress(o, 1);
          checkMissionComplete();
        }
      } else if (o.type === "survive") {
        // Ticks ONLY inside the objective's district; leaving pauses it
        // (no reset — §5.1.2). Without a city the test is impossible: tick
        // unconditionally so debug/headless runs can still complete it.
        const inside = city
          ? safeDistrictAt(px, pz) === o.district
          : true;
        if (inside) {
          o.acc = (o.acc || 0) + dt;
          if (o.acc >= o.done + 1 || o.acc >= o.need) {
            // floor: the HUD counts full seconds (round would complete at 59.5 s)
            setProgress(o, Math.min(o.need, Math.floor(o.acc)));
            if (o.complete) checkMissionComplete();
          }
        }
      }
    }

    // interact-near hints — emit on STATE CHANGE only (§5.1.3).
    for (let i = 0; i < POIS.length; i++) {
      const p = POIS[i];
      if (p.mission !== current || p.kind === "reach") continue;
      if (p.kind === "collect" && collected.has(p.target)) continue;
      if (p.kind === "activate" && activated.has(p.target)) continue;
      const dx = p.x - px;
      const dz = p.z - pz;
      const isNear = dx * dx + dz * dz <= HINT_RADIUS * HINT_RADIUS;
      const was = near.get(p.target) === true;
      if (isNear !== was) {
        near.set(p.target, isNear);
        emit("interact-near", { target: p.target, near: isNear });
      }
    }
  }

  // --- lifecycle ------------------------------------------------------------------

  function begin() {
    if (current !== 0) return; // already started / finished
    buildPois();
    activateMission(1);
  }

  function reset() {
    clearNearHints();
    current = 0;
    for (let i = 0; i < states.length; i++) {
      states[i].status = "locked";
      states[i].objectives = [];
    }
    quotaDone.clear();
    activated.clear();
    collected.clear();
    disposePois();
    emit("mission-reset", {});
  }

  // --- debug / integrator API (§5.6.2 + §5.6.5, additive) ---------------------------

  function skipToMission(n) {
    const target = Math.round(Number(n));
    if (!(target >= 1 && target <= 10)) return false; // P3-K2: skip 10 = m10
    // (skip 10 arms m10; the world spawn of the Origin is main.js's job — it
    // listens "mission-start" {index:10} → city.openVault() + spawn.)
    buildPois();
    for (let i = 1; i < target; i++) {
      const st = states[i - 1];
      st.status = "done";
      st.objectives = MISSION_DEFS[i - 1].objectives.map((def) => {
        const o = liveObjective(def);
        o.done = o.need;
        o.complete = true;
        return o;
      });
      // Synthetic quota-done so waves' density + HUD stay consistent.
      for (const o of st.objectives) {
        if (o.type === "quota") markQuotaDone(o.district);
      }
      const def = MISSION_DEFS[i - 1];
      for (let g = 0; g < def.gates.length; g++) {
        emit("gate-open", { from: def.gates[g][0], to: def.gates[g][1] });
      }
      // Machines of skipped missions keep their lit look (world state).
      for (const o of st.objectives) {
        if (o.type === "activate") {
          for (const t of o.targets) {
            activated.add(t);
            activateVisual(t);
          }
        }
      }
    }
    activateMission(target);
    return true;
  }

  /** Force-complete the first unfinished objective of the active mission. */
  function completeObjective() {
    if (current < 1 || current > 10) return false; // P3-K2: 1..10
    const objs = states[current - 1].objectives;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.complete) continue;
      if (o.type === "quota") {
        setProgress(o, o.need);
        markQuotaDone(o.district);
      } else if (o.type === "collect") {
        for (const p of POIS) {
          if (p.kind === "collect" && p.item === o.item && !collected.has(p.target)) {
            collected.add(p.target);
            hideInstance(p.target);
          }
        }
        setProgress(o, o.need);
      } else if (o.type === "activate") {
        for (const t of o.targets) {
          if (!activated.has(t)) {
            activated.add(t);
            activateVisual(t);
          }
        }
        setProgress(o, o.need);
      } else {
        setProgress(o, o.need); // reach / boss / survive
      }
      refreshPoiVisibility();
      checkMissionComplete();
      return true;
    }
    return false;
  }

  function fillQuota() {
    if (current < 1 || current > 10) return false; // P3-K2: 1..10
    const objs = states[current - 1].objectives;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.type === "quota" && !o.complete) {
        setProgress(o, o.need);
        markQuotaDone(o.district);
        checkMissionComplete();
        return true;
      }
    }
    return false;
  }

  function getState() {
    const objs = currentObjectives();
    let quota = null;
    for (let i = 0; i < objs.length; i++) {
      if (objs[i].type === "quota") {
        quota = objs[i];
        break;
      }
    }
    return {
      mission: current,
      titleKey: current >= 1 && current <= 10 ? MISSION_DEFS[current - 1].titleKey : null,
      quotaDone: quota ? quota.done : 0,
      quotaNeed: quota ? quota.need : 0,
      quotaDistrict: quota ? quota.district : null,
      objectives: objs.map((o) => ({
        type: o.type,
        target: o.target,
        item: o.item,
        district: o.district,
        done: o.done,
        need: o.need,
        complete: o.complete,
      })),
    };
  }

  // --- listeners ---------------------------------------------------------------------

  /**
   * P3 §3.7 (3) / P3-K3 (2): "origin-defeated" → m10's boss objective. The
   * PRIMARY path is "zombie-killed" {type:"origin"} via BOSS_TYPES; this
   * listener is the belt-and-braces route from the spec. setProgress() blocks
   * double-counting through its complete-guard, so firing both is safe. The
   * payload is ignored (§7.1 — a debug-synthetic {debug:true} completes too).
   */
  function onOriginDefeated() {
    if (current < 1 || current > 10) return; // P3-K2: 1..10
    const objs = states[current - 1].objectives;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.type === "boss" && !o.complete) {
        setProgress(o, 1);
        break;
      }
    }
    checkMissionComplete();
  }

  B.addEventListener("zombie-killed", onZombieKilled);
  B.addEventListener("interact-press", onPress);
  B.addEventListener("origin-defeated", onOriginDefeated);

  return {
    get current() {
      return current;
    },
    get objectives() {
      return currentObjectives();
    },
    update,
    reset,
    begin,
    skipToMission,
    completeObjective,
    fillQuota,
    getState,
  };
}
