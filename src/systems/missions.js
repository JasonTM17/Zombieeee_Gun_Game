/**
 * ============================================================================
 * MISSIONS — chuỗi 9 nhiệm vụ cốt truyện "ĐÊM THỨ 30 · Phần 1"
 * (docs/EXPANSION-P1.md §5.1; nội dung thoại: docs/STORY.md — nguyên văn).
 * ============================================================================
 * STUB — builder SYSTEMS thay thân `createMissions`, GIỮ nguyên chữ ký +
 * typedef dưới đây.
 *
 * State machine: every mission is locked → active → done. Exactly ONE active
 * mission at a time; completing it auto-activates the next one. `current`
 * is 1-BASED (m1 = 1 … m9 = 9); 0 = not started; 10 = chain finished
 * (free-roam). Mission 9 completion also opens the five remaining steel
 * gates via "gate-open" (docs/EXPANSION-P1.md §5.1.1 table — decision K2/K6).
 *
 * Objectives (one mission has 1–3):
 *   {type: "activate", target: "generator-1"}      — via bus "interact"
 *   {type: "collect",  item: "supply", need: 3}    — via bus "pickup-story"
 *   {type: "quota",    district: "residential"}    — via "zombie-killed"
 *   {type: "reach",    x, z, radius}               — checked in update()
 *   {type: "boss"}                                 — via "zombie-killed"
 *   {type: "survive",  seconds: 60}                — ticked in update()
 *
 * Quota counting (decision K4): a "zombie-killed" {type, headshot, position}
 * counts ONLY when type ∈ {walker, runner, brute} AND
 * city.districtAt(position.x, position.z) === the quota district. Boss kills
 * feed ONLY the "boss" objective (type ∈ {butcher, spitter, screamer,
 * golem}). When the quota need is reached the module fires
 * "quota-done" {districtId} exactly once per district.
 *
 * Interaction (docs/EXPANSION-P1.md §5.1.3): this module CREATES the
 * interactable meshes (3 generators, 3 supply packs, radio tower, 3 medicine
 * boxes, campfire + its PointLight, 4 fuel cans — emissive, fog:false lamp,
 * castShadow = true, merged per material ≤ 2 draw calls; generators/radio
 * base/campfire push one small AABB into level.colliders, collectibles do
 * not) and DISPOSES them in reset(). Flow:
 *   input "interact-press" → nearest ACTIVE POI within 2 m →
 *     emit "interact" {target};
 *     collect POIs also emit "pickup-story" {item, target} and hide their mesh.
 *   player enters/leaves the 3 m hint radius →
 *     emit "interact-near" {target, near: true|false} on STATE CHANGE only.
 * The vault door ("final-door" at (0,0)) is built by level.js (§3.2) — this
 * module only references its coordinates for the reach test.
 *
 * Gates: this module is the ONLY emitter of "gate-open" {from, to} — fired
 * when a mission completes (quota-done AND the collect/activate objectives
 * both finished is implied by mission completion). Mission 6 fires TWO
 * events: {docks, quarantine} AND {docks, safehouse} (decision K2).
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
 * Bus events consumed: "zombie-killed", "interact-press"
 * ("interact"/"pickup-story" are self-emitted; handling them directly is
 * allowed as long as the payloads above stay on the bus verbatim).
 *
 * i18n keys owned by THIS module (register via i18n.registerBundle, flat
 * keys, EN + VI verbatim from docs/EXPANSION-P1.md §7.3–§7.6): mission1..9_
 * title, obj_*, item_*, target_*, mission_progress, mission_complete_toast,
 * quota_counter, quota_done_toast, gate_open_toast, interact_hint.
 *
 * STORY_DIALOGUE (export, §5.1.5): map "m1".."m9" → {start: [{speaker, key}…],
 * done: […]} with speaker ∈ "radio"|"you"|"unknown" and keys/order EXACTLY
 * per docs/EXPANSION-P1.md §7.7 (text lives verbatim in docs/STORY.md §3).
 *
 * reset(): back to mission 1 locked, clears progress, disposes POI meshes,
 * emits "mission-reset". Does NOT emit "mission-start" (main.js activates
 * mission 1 explicitly on story/free-play start).
 *
 * @param {EventTarget} bus - the shared bus (src/systems/gamestate.js).
 * @param {import("../world/city.js").City} city - district lookup + quota
 *   position tests (districtAt).
 * @param {import("./economy.js").Economy} economy - received per contract;
 *   NOT used to add money (main.js pays rewards).
 * @returns {Missions}
 */

/**
 * @typedef {Object} MissionObjective
 * @property {("activate"|"collect"|"quota"|"reach"|"boss"|"survive")} type
 * @property {string} [target] - interact target id ("generator-1",
 *   "campfire", … per docs/EXPANSION-P1.md §5.1.3).
 * @property {string} [item] - collect item id ("supply"|"medicine"|"fuel").
 * @property {string} [district] - quota district id.
 * @property {number} [x] - reach point X.
 * @property {number} [z] - reach point Z.
 * @property {number} [seconds] - survive duration.
 * @property {number} done - current progress.
 * @property {number} need - goal (1 for activate/reach/boss types).
 * @property {boolean} complete - true when done >= need.
 */

/**
 * @typedef {Object} Missions
 * @property {number} current - active mission index (1..9), 0 = none, 10 =
 *   chain complete (free-roam).
 * @property {MissionObjective[]} objectives - live view of the active
 *   mission's objectives (empty when current is 0 or 10).
 * @property {(dt: number, playerPos: {x: number, z: number}) => void} update
 *   Per-frame tick while playing: reach checks + survive timer (survive only
 *   ticks while the player is inside quarantine; leaving pauses it).
 * @property {() => void} reset - fresh chain (m1 locked); disposes POI
 *   meshes; emits "mission-reset"; does NOT emit "mission-start".
 */

export function createMissions(bus, city, economy) {
  throw new Error("TODO: missions.js — build per docs/EXPANSION-P1.md §5.1");
}

/**
 * Dialogue line map for main.js (docs/EXPANSION-P1.md §5.1.5). Filled in by
 * the SYSTEMS builder — keys and order MUST match docs/EXPANSION-P1.md §7.7;
 * the EN/VI text of every key lives verbatim in docs/STORY.md §3.
 *
 * @type {Record<string, {start: Array<{speaker: "radio"|"you"|"unknown",
 *   key: string}>, done: Array<{speaker: "radio"|"you"|"unknown",
 *   key: string}>}>}
 */
export const STORY_DIALOGUE = {};
