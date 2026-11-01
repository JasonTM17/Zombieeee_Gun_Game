/**
 * ============================================================================
 * SURVIVORS — friendly NPCs + small camps that make the open city inhabited.
 * ============================================================================
 * Seven named survivors live across the six outer districts (no quarantine
 * camp — quarantine is the story's hostile interior):
 *
 *   safehouse   Eli (mechanic)          Mai (the rescued survivor)
 *   residential Sơn (long-time resident)
 *   commercial  Hà (plaza shopkeeper)
 *   hospital    Dr. Linh
 *   park        Captain Vu (watching the P-Q steel gate from the park side)
 *   docks       Old Man River (fisherman)
 *
 * WHAT THIS MODULE OWNS
 * - Seven low-poly humanoids clearly distinct from zombies: upright posture,
 *   clean blue / olive / tan clothing, a backpack, no glowing eyes, and ONE
 *   emissive lantern mesh per NPC (a MeshBasicMaterial box — NO PointLight,
 *   so the module adds zero lights and zero shadow casters).
 * - A canvas-texture Sprite nameplate per NPC (EN/VI through i18n). Visible
 *   within 25 m, faded 25 → 35 m, hidden beyond.
 * - Speech bubbles as DOM nodes projected through the optional `camera`
 *   parameter. Without a camera the bubbles simply never show — nameplates
 *   (real Sprites) keep working. Text is written to the DOM only when the
 *   chosen line changes (8–14 s rotation, gift thank-you, barks), never per
 *   frame.
 * - Five camps (Eli, Sơn, Hà, Dr. Linh, Old Man River): canvas tent, stone
 *   fire ring + logs + additive flame cone, two crates, and a broken
 *   barricade ring with a ~2 m walk lane facing the road. The tent and the
 *   two crates push AABB colliders into `level.colliders`; the barricade and
 *   the fire ring are visual only. No new light, no new shadow.
 * - AI: idle/wander inside a 6–10 m leash around the camp anchor, slow walk
 *   (0.55 m/s), collider avoidance through `level.isBlocked`, face the player
 *   inside 8 m, and a fear crouch/back-away when a zombie is inside 10 m.
 *   Survivors never attack, have no health, and cannot die.
 * - Proximity interaction without the E key (missions owns E): inside 3 m a
 *   bubble shows a rotating contextual line; the FIRST approach of a run
 *   grants ONE gift per NPC and immediately shows a thank-you line.
 * - Barks for the two safehouse NPCs: radio/ambient lines shown through the
 *   same bubble while the player is within 15 m. They never use the blocking
 *   dialogue box and never pause gameplay.
 *
 * BUS CONTRACT
 * Consumed:
 *   "zombie-spawned"  {zombie}  — maintain a lightweight ref list for fear.
 *   "zombie-despawned"{zombie}  — remove the ref.
 *   "settings-changed"{patch}   — patch.lang → redraw nameplates + re-resolve
 *                                 every cached line (no per-frame i18n work).
 *   "ui-play" | "ui-play-free" | "ui-restart" | "ui-quit" | "ui-endless" |
 *   "mission-reset"            — new run: gifts seen reset, NPCs re-planted,
 *                                 bubbles hidden.
 * Emitted:
 *   "npc-gift" {kind: "money"|"ammo"|"health", amount: number}
 *     money  → $50–150, apply through economy.add(amount)
 *     health → 15, apply as +15 HP capped at 100
 *     ammo   → 1, apply as +1 full magazine of the ACTIVE weapon
 *   The payload deliberately carries NO other fields: the integrator owns
 *   the application. This module never imports economy/weapons/player.
 *
 * PLACEMENT RULES (all checked before an NPC is accepted; the scan is
 * deterministic, so reloads place the same camp):
 *   - inside the district bounds with a 2 m margin;
 *   - `level.isBlocked(x, z, 1.2)` false (camps use 1.7 m at the fire);
 *   - >= 8 m from every zombie spawn (city.districts[].spawnPoints +
 *     level.spawnPoints);
 *   - >= 5 m from every gate (district records + level.getGateWaypoints);
 *   - >= 4 m from every mission POI (generator/antenna/medkit/campfire/fuel/
 *     final-door; the campfire and vault use their wider interaction rings);
 *   - outside the park pond + 1.5 m bank;
 *   - >= 7 m from another survivor anchor;
 *   - camp tents/crates additionally avoid the WORLD.md road rects, so no
 *     camp blocks a road, a gate approach, or a mission route.
 *   - the barricade ring leaves a >2 m gap facing the local +Z side, and the
 *     camp yaw is chosen to point that gap toward the nearest road/approach.
 *
 * PERFORMANCE
 * - Shared geometry/material: one vertex-colour NPC material for every body
 *   and leg mesh, one shared lantern material, one camp material, one flame
 *   geometry + material.
 * - Draw calls: 7 nameplate sprites + 7 bodies + 14 legs + 7 lanterns +
 *   1 merged camp-prop mesh + 5 flames ≈ 41. Camps are merged across all
 *   five sites. No per-frame THREE allocation (scratch Vector3 reused).
 * - No per-frame canvas writes. Nameplate canvases redraw only on language
 *   change. Bubble DOM text updates only on line change.
 * - `update()` is expected to be called ONLY while playing (the integrator's
 *   playing branch); the module keeps no clock of its own.
 *
 * @param {import("three").Scene} scene
 * @param {EventTarget} bus - the shared bus from src/systems/gamestate.js
 * @param {import("./level.js").Level} level - isBlocked + colliders
 * @param {import("./city.js").City} city - districts/bounds/spawns/gates
 * @param {{t: Function, registerBundle?: Function}} i18n - i18n namespace
 * @param {import("three").Camera=} camera - optional; enables speech bubbles
 * @returns {{update: (dt: number, playerPos?: {x: number, z: number}) => void,
 *   stats: () => Record<string, number>, reset: () => void,
 *   survivors: Array<Object>}}
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as i18nModule from "../core/i18n.js";

// --- i18n (EN + VI) ---------------------------------------------------------

const BUNDLE = {
  en: {
    survivor_eli_name: "Eli",
    survivor_eli_line1: "Generators are holding. Barely.",
    survivor_eli_line2: "If the lights flicker, hit the panel once. Not twice.",
    survivor_eli_line3: "I broke this city. I'm fixing what I can.",
    survivor_eli_thanks: "Take {amount}$. Buy something that keeps you breathing.",
    survivor_eli_bark1: "Radio's still dead. Only that 47-second loop.",
    survivor_eli_bark2: "Fuel's low. Everything's low.",
    survivor_mai_name: "Mai",
    survivor_mai_line1: "You're the one the radio keeps talking about.",
    survivor_mai_line2: "I don't go past the fence. Not anymore.",
    survivor_mai_line3: "The quiet ones are worse. Remember that.",
    survivor_mai_thanks: "Bandages. {amount} HP worth. Don't argue.",
    survivor_mai_bark1: "The fence holds. The fence holds.",
    survivor_mai_bark2: "I heard a helicopter once. Once.",
    survivor_son_name: "Sơn",
    survivor_son_line1: "I grew up in this block. Now I count the empty windows.",
    survivor_son_line2: "Twenty houses. Three families left.",
    survivor_son_line3: "If you hear singing, it's me. Or the pipes.",
    survivor_son_thanks: "A full mag. I can't shoot straight anyway.",
    survivor_ha_name: "Hà",
    survivor_ha_line1: "The shop's closed. Everything's closed.",
    survivor_ha_line2: "I still sweep the plaza every morning. Habit.",
    survivor_ha_line3: "Trade you a story for a working flashlight.",
    survivor_ha_thanks: "{amount}$ for the road. Consider it change.",
    survivor_linh_name: "Dr. Linh",
    survivor_linh_line1: "Keep pressure on it. Then keep moving.",
    survivor_linh_line2: "The hospital is not a hospital anymore.",
    survivor_linh_line3: "I need the vault sample. Before it needs me.",
    survivor_linh_thanks: "Take {amount} HP of my supplies. Try not to need more.",
    survivor_vu_name: "Captain Vu",
    survivor_vu_line1: "Gate's watched. Not by me. Not anymore.",
    survivor_vu_line2: "I gave the order. I stayed to count them.",
    survivor_vu_line3: "Don't touch the steel at the center.",
    survivor_vu_thanks: "One magazine. Make it count.",
    survivor_river_name: "Old Man River",
    survivor_river_line1: "Tide's wrong tonight. Everything's wrong tonight.",
    survivor_river_line2: "I brought the first one ashore. Didn't ask.",
    survivor_river_line3: "The boat still floats. That's something.",
    survivor_river_thanks: "Here's {amount}$. The sea owes me more.",
    survivor_fear: "Get down — don't let them see you.",
  },
  vi: {
    survivor_eli_name: "Eli",
    survivor_eli_line1: "Máy phát vẫn chạy. Vừa đủ.",
    survivor_eli_line2: "Nếu đèn nhấp nháy, đập vào bảng một lần. Đừng hai lần.",
    survivor_eli_line3: "Tôi đã phá thành phố này. Tôi đang sửa những gì có thể.",
    survivor_eli_thanks: "Cầm {amount}$. Mua thứ giúp cậu còn thở.",
    survivor_eli_bark1: "Radio vẫn chết. Chỉ còn vòng lặp 47 giây.",
    survivor_eli_bark2: "Xăng cạn. Mọi thứ đều cạn.",
    survivor_mai_name: "Mai",
    survivor_mai_line1: "Cậu là người mà radio nhắc mãi.",
    survivor_mai_line2: "Tôi không ra ngoài hàng rào nữa.",
    survivor_mai_line3: "Những kẻ im lặng còn tệ hơn. Nhớ điều đó.",
    survivor_mai_thanks: "Băng gạc. {amount} HP. Đừng cãi.",
    survivor_mai_bark1: "Hàng rào còn đứng. Hàng rào còn đứng.",
    survivor_mai_bark2: "Tôi từng nghe trực thăng. Một lần.",
    survivor_son_name: "Sơn",
    survivor_son_line1: "Tôi lớn lên ở khu này. Giờ tôi đếm những ô cửa trống.",
    survivor_son_line2: "Hai mươi căn nhà. Còn ba gia đình.",
    survivor_son_line3: "Nếu nghe tiếng hát, là tôi. Hoặc ống nước.",
    survivor_son_thanks: "Một băng đạn đầy. Tôi bắn cũng chẳng trúng.",
    survivor_ha_name: "Hà",
    survivor_ha_line1: "Cửa hàng đóng rồi. Mọi thứ đóng rồi.",
    survivor_ha_line2: "Sáng nào tôi vẫn quét quảng trường. Thói quen.",
    survivor_ha_line3: "Đổi một câu chuyện lấy đèn pin còn chạy.",
    survivor_ha_thanks: "{amount}$ đi đường. Coi như tiền thừa.",
    survivor_linh_name: "Bác Sĩ Linh",
    survivor_linh_line1: "Giữ áp lực lên đó. Rồi tiếp tục đi.",
    survivor_linh_line2: "Bệnh viện không còn là bệnh viện.",
    survivor_linh_line3: "Tôi cần mẫu trong vault. Trước khi nó cần tôi.",
    survivor_linh_thanks: "Lấy {amount} HP tiếp tế của tôi. Cố đừng cần thêm.",
    survivor_vu_name: "Đội Trưởng Vũ",
    survivor_vu_line1: "Cổng có người canh. Không phải tôi. Không còn nữa.",
    survivor_vu_line2: "Tôi ra lệnh. Tôi ở lại đếm họ.",
    survivor_vu_line3: "Đừng chạm vào thép ở trung tâm.",
    survivor_vu_thanks: "Một băng đạn. Dùng cho đáng.",
    survivor_river_name: "Lão River",
    survivor_river_line1: "Thủy triều sai rồi. Đêm nay mọi thứ đều sai.",
    survivor_river_line2: "Tôi chở người đầu tiên vào bờ. Không hỏi.",
    survivor_river_line3: "Con thuyền vẫn nổi. Vậy là được.",
    survivor_river_thanks: "Đây, {amount}$. Biển còn nợ tôi.",
    survivor_fear: "Cúi xuống — đừng để chúng thấy.",
  },
};

i18nModule.registerBundle(BUNDLE);

// --- tunables ---------------------------------------------------------------

const SEED = 0x5a71f00d; // deterministic placement/wander stream
const INTERACT_RADIUS = 3; // proximity bubble + first-approach gift
const INTERACT_EXIT = 3.6; // hysteresis so the bubble does not strobe
const FACE_RADIUS = 8; // turn toward the player
const FEAR_RADIUS = 10; // zombie this close → crouch/back away
const FEAR_EXIT = 12; // hysteresis before standing up
const NAMEPLATE_NEAR = 25; // full opacity inside this distance
const NAMEPLATE_FAR = 35; // fully faded beyond
const BARK_RADIUS = 15; // safehouse ambient lines
const WANDER_SPEED = 0.55; // slow, non-threatening walk
const FEAR_SPEED = 1.15; // backing away, still slower than a walker
const TURN_SPEED = 7; // rad/s
const MIN_SPAWN_DIST = 8;
const MIN_GATE_DIST = 5;
const MIN_NPC_GAP = 7;
const POND = { minX: 40, maxX: 66, minZ: 70, maxZ: 86 };
const POND_PAD = 1.5;
const TAU = Math.PI * 2;

/**
 * Mission POIs (same coords as city.js / missions.js) with the interaction
 * radius each one needs kept clear. Every entry is >= 4 m.
 * @type {Array<{id: string, x: number, z: number, r: number}>}
 */
const POIS = [
  { id: "generator-1", x: -89, z: -15, r: 4 },
  { id: "generator-2", x: -61, z: -15, r: 4 },
  { id: "generator-3", x: -75, z: 15, r: 4 },
  { id: "supply-1", x: -120, z: -123, r: 4 },
  { id: "supply-2", x: -30, z: -100, r: 4 },
  { id: "supply-3", x: -70, z: -45, r: 4 },
  { id: "radio-tower", x: 55, z: -95, r: 5 },
  { id: "medicine-1", x: 59, z: -6, r: 4 },
  { id: "medicine-2", x: 59, z: 6, r: 4 },
  { id: "medicine-3", x: 76, z: 4, r: 4 },
  { id: "campfire", x: 10, z: 70, r: 8 },
  { id: "fuel-1", x: -120, z: 40, r: 4 },
  { id: "fuel-2", x: -30, z: 120, r: 4 },
  { id: "fuel-3", x: -90, z: 90, r: 4 },
  { id: "fuel-4", x: -45, z: 55, r: 4 },
  { id: "final-door", x: 0, z: 0, r: 6 },
];

/**
 * WORLD.md §5 road rects (8 m main / 5 m branch). Camps must not stand on
 * these; 1.2 m is added around each rect before testing.
 * @type {Array<{minX: number, maxX: number, minZ: number, maxZ: number}>}
 */
const ROAD_RECTS = [
  // Trục Tây — safehouse compound gate to S-Q.
  { minX: -55, maxX: -30, minZ: -4, maxZ: 4 },
  // Trục Nhà Phố — E-W main street + N-S branch + nẹp street.
  { minX: -130, maxX: -15, minZ: -74, maxZ: -66 },
  { minX: -19, maxX: -11, minZ: -130, maxZ: -30 },
  { minX: -30, maxX: -15, minZ: -54, maxZ: -30 },
  // Trục Plaza — E-W main, N-S alley, E-W branch to G2.
  { minX: -15, maxX: 130, minZ: -62, maxZ: -50 },
  { minX: 28, maxX: 32, minZ: -115, maxZ: -75 },
  { minX: -15, maxX: 130, minZ: -99, maxZ: -91 },
  // Lối Công Viên — promenade + N-S branch to G5.
  { minX: -15, maxX: 130, minZ: 30, maxZ: 38 },
  { minX: -15, maxX: -7, minZ: 60, maxZ: 90 },
  // Trục Cảng — two N-S spurs + E-W main.
  { minX: -26, maxX: -18, minZ: 30, maxZ: 130 },
  { minX: -76, maxX: -68, minZ: 30, maxZ: 68 },
  { minX: -130, maxX: -15, minZ: 60, maxZ: 68 },
];
const ROAD_PAD = 1.2;

/**
 * One survivor. `region` is the deterministic candidate rect (off-road);
 * `camp` adds the tent/crate/fire/barricade set. `campYaw` is the base yaw
 * whose local +Z is the walk-lane/gap direction.
 *
 * @typedef {Object} SurvivorDef
 * @property {string} id
 * @property {string} nameKey
 * @property {string} district
 * @property {{minX: number, maxX: number, minZ: number, maxZ: number}} region
 * @property {{x: number, z: number}} preferred
 * @property {number} wanderRadius
 * @property {boolean} [camp]
 * @property {number} [campYaw]
 * @property {{kind: "money"|"ammo"|"health", amount: number}} gift
 * @property {string} thanksKey
 * @property {string[]} lines
 * @property {string[]} [barks]
 * @property {{coat: number, pants: number, pack: number, hair: number,
 *   skin: number}} palette
 */

/** @type {SurvivorDef[]} */
const SURVIVOR_DEFS = [
  {
    id: "eli",
    nameKey: "survivor_eli_name",
    district: "safehouse",
    // East apron beside the compound gate — visible on the story spawn walk,
    // clear of the Trục Tây road (z −4..4).
    region: { minX: -52, maxX: -38, minZ: 8, maxZ: 18 },
    preferred: { x: -46, z: 12 },
    wanderRadius: 8,
    camp: true,
    campYaw: Math.PI, // gap faces the road/compound
    gift: { kind: "money", amount: 120 },
    thanksKey: "survivor_eli_thanks",
    lines: ["survivor_eli_line1", "survivor_eli_line2", "survivor_eli_line3"],
    barks: ["survivor_eli_bark1", "survivor_eli_bark2"],
    palette: { coat: 0x35506e, pants: 0x27384d, pack: 0x4d5334, hair: 0x2a211a, skin: 0xb98b66 },
  },
  {
    id: "mai",
    nameKey: "survivor_mai_name",
    district: "safehouse",
    // West apron, outside the compound, away from the crates and car.
    region: { minX: -127, maxX: -112, minZ: 7, maxZ: 20 },
    preferred: { x: -120, z: 12 },
    wanderRadius: 7,
    gift: { kind: "health", amount: 15 },
    thanksKey: "survivor_mai_thanks",
    lines: ["survivor_mai_line1", "survivor_mai_line2", "survivor_mai_line3"],
    barks: ["survivor_mai_bark1", "survivor_mai_bark2"],
    palette: { coat: 0xa9825a, pants: 0x5a4632, pack: 0x6b5a3e, hair: 0x241b16, skin: 0xc0916f },
  },
  {
    id: "son",
    nameKey: "survivor_son_name",
    district: "residential",
    // Green strip between townhouse rows A (z −115) and B (z −85).
    region: { minX: -100, maxX: -80, minZ: -103, maxZ: -96 },
    preferred: { x: -90, z: -100 },
    wanderRadius: 9,
    camp: true,
    campYaw: 0, // gap faces the row-to-row lane / main street
    gift: { kind: "ammo", amount: 1 },
    thanksKey: "survivor_son_thanks",
    lines: ["survivor_son_line1", "survivor_son_line2", "survivor_son_line3"],
    palette: { coat: 0x5a6540, pants: 0x3d452c, pack: 0x4a3f2d, hair: 0x1e1812, skin: 0xa97a58 },
  },
  {
    id: "ha",
    nameKey: "survivor_ha_name",
    district: "commercial",
    // Open plaza between the shop row (z −66) and the E-W branch (z −99..−91).
    region: { minX: 62, maxX: 74, minZ: -84, maxZ: -76 },
    preferred: { x: 68, z: -80 },
    wanderRadius: 8,
    camp: true,
    campYaw: Math.PI, // gap faces the branch road south of the plaza
    gift: { kind: "money", amount: 80 },
    thanksKey: "survivor_ha_thanks",
    lines: ["survivor_ha_line1", "survivor_ha_line2", "survivor_ha_line3"],
    palette: { coat: 0x3f6d84, pants: 0x2b4a5c, pack: 0x6f6242, hair: 0x1b1511, skin: 0xb98b66 },
  },
  {
    id: "linh",
    nameKey: "survivor_linh_name",
    district: "hospital",
    // South yard below the main block, clear of the triage tents and G4.
    region: { minX: 64, maxX: 78, minZ: 20, maxZ: 27 },
    preferred: { x: 70, z: 24 },
    wanderRadius: 6,
    camp: true,
    campYaw: Math.PI / 2, // gap faces the hospital forecourt (west)
    gift: { kind: "health", amount: 15 },
    thanksKey: "survivor_linh_thanks",
    lines: ["survivor_linh_line1", "survivor_linh_line2", "survivor_linh_line3"],
    palette: { coat: 0xc8d4dc, pants: 0x6b7d8c, pack: 0x3f4a55, hair: 0x17120f, skin: 0xc0916f },
  },
  {
    id: "vu",
    nameKey: "survivor_vu_name",
    district: "park",
    // Watch post on the lawn, west of the pond, clear of the pond path and
    // the mission campfire at (10, 70).
    region: { minX: 20, maxX: 32, minZ: 48, maxZ: 58 },
    preferred: { x: 26, z: 54 },
    wanderRadius: 7,
    gift: { kind: "ammo", amount: 1 },
    thanksKey: "survivor_vu_thanks",
    lines: ["survivor_vu_line1", "survivor_vu_line2", "survivor_vu_line3"],
    palette: { coat: 0x4f5a3d, pants: 0x353d29, pack: 0x3a3325, hair: 0x201a14, skin: 0xa97a58 },
  },
  {
    id: "river",
    nameKey: "survivor_river_name",
    district: "docks",
    // Open yard between the E-W dock road (z 60..68) and the container yard.
    region: { minX: -60, maxX: -48, minZ: 72, maxZ: 82 },
    preferred: { x: -54, z: 76 },
    wanderRadius: 9,
    camp: true,
    campYaw: Math.PI, // gap faces the dock road to the north
    gift: { kind: "money", amount: 150 },
    thanksKey: "survivor_river_thanks",
    lines: ["survivor_river_line1", "survivor_river_line2", "survivor_river_line3"],
    palette: { coat: 0x8a7355, pants: 0x4a3f2e, pack: 0x5e4f38, hair: 0x6b6258, skin: 0xb07f5c },
  },
];

// --- deterministic helpers --------------------------------------------------

/**
 * Seeded PRNG (mulberry32) — a private stream so city/vegetation edits never
 * reshuffle the survivors.
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Flat per-vertex colour (city.js/vegetation.js pattern). */
function tintGeo(geo, color) {
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Tinted, translated box for a merge bucket. */
function pushBox(bucket, sx, sy, sz, x, y, z, hex) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  geo.translate(x, y, z);
  bucket.push(tintGeo(geo, new THREE.Color(hex)));
}

/** Axis-aligned XZ collider from a centre + full extents. */
function colliderOf(x, z, sx, sz) {
  return { minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 };
}

/** True when (x,z) is at least `minDist` from every point. */
function clearOf(points, x, z, minDist) {
  const m2 = minDist * minDist;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < m2) return false;
  }
  return true;
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

/** Rotate a local XZ offset by yaw and add the camp anchor. */
function localToWorld(ax, az, yaw, lx, lz) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: ax + lx * c - lz * s, z: az + lx * s + lz * c };
}

/** Road test with the 1.2 m shoulder. */
function onRoad(x, z) {
  for (let i = 0; i < ROAD_RECTS.length; i++) {
    const r = ROAD_RECTS[i];
    if (
      x > r.minX - ROAD_PAD && x < r.maxX + ROAD_PAD &&
      z > r.minZ - ROAD_PAD && z < r.maxZ + ROAD_PAD
    ) {
      return true;
    }
  }
  return false;
}

// --- canvas / DOM helpers ---------------------------------------------------

/** Rounded rect path without relying on ctx.roundRect (older browsers). */
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
 * Nameplate canvas: dark pill + warm border + centered name. Returns null
 * headless (no document) so the module degrades to animation only.
 * @param {string} text
 * @returns {THREE.CanvasTexture|null}
 */
function makeNameTexture(text) {
  if (typeof document === "undefined" || typeof document.createElement !== "function") return null;
  const W = 512;
  const H = 128;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, W, H);
  // Full-width pill: short names would otherwise sit in a tiny island of a
  // 512 px canvas and render far too small as a world sprite.
  const pillW = W - 24;
  const x = (W - pillW) / 2;
  roundRectPath(ctx, x, 26, pillW, 76, 34);
  ctx.fillStyle = "rgba(8, 12, 18, 0.78)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 198, 120, 0.55)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = "600 50px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = "#ffe7c2";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Tiny DOM builder + inline-style helper (hud.js pattern). */
function make(tag, parent) {
  const node = document.createElement(tag);
  if (parent) parent.appendChild(node);
  return node;
}
function css(node, styles) {
  for (const k in styles) node.style[k] = styles[k];
  return node;
}

// --- factory -----------------------------------------------------------------

/**
 * Build the survivors layer.
 * @param {import("three").Scene} scene
 * @param {EventTarget} bus
 * @param {import("./level.js").Level} level
 * @param {import("./city.js").City} city
 * @param {{t: Function, registerBundle?: Function}} i18n
 * @param {import("three").Camera=} camera
 */
export function createSurvivors(scene, bus, level, city, i18n, camera) {
  const I = i18n && typeof i18n.t === "function" ? i18n : i18nModule;
  if (I && typeof I.registerBundle === "function") I.registerBundle(BUNDLE);
  const tr = (key, params) => (I && typeof I.t === "function" ? I.t(key, params) : key);

  const rng = makeRng(SEED);
  const hasDOM = typeof document !== "undefined" && typeof document.createElement === "function";
  const hasBrowser = typeof window !== "undefined";

  const districts = city && Array.isArray(city.districts) ? city.districts : [];
  const spawns = collectSpawns(city, level);
  const gates = collectGates(city, level);

  // Shared materials (one per role).
  const npcMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.02,
  });
  const lanternMat = new THREE.MeshBasicMaterial({
    color: 0xffc87a,
    toneMapped: false,
    fog: true,
  });
  const campMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
    metalness: 0.02,
  });
  const flameGeo = new THREE.ConeGeometry(0.36, 1.0, 7, 1, false);
  flameGeo.translate(0, 0.5, 0);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff8a3c,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  // Shared lantern geometry (one draw per NPC, same geometry/material).
  const lanternGeo = new THREE.BoxGeometry(0.15, 0.2, 0.15);
  lanternGeo.translate(0, 0.02, 0);

  /** @type {THREE.BufferGeometry[]} */
  const campSolidGeos = [];
  /** @type {Array<THREE.Mesh>} */
  const campFlames = [];
  /** @type {Array<{x: number, z: number, phase: number, base: number}>} */
  const campFireData = [];
  const collidersAdded = [];

  /** @type {Array<Object>} live survivor records (also exposed additively) */
  const npcs = [];
  /** @type {Array<{x: number, z: number}>} accepted anchors */
  const anchors = [];
  /** @type {any[]} zombie refs for the fear check (bus-fed, no scene scan) */
  const zombieRefs = [];
  let campsBuilt = 0;
  let giftsGiven = 0;
  let time = 0;
  const tmpV = new THREE.Vector3();

  // --- i18n text caches -------------------------------------------------------

  /** @type {string} */
  let fearText = tr("survivor_fear");

  function resolveNpcText(n) {
    n.nameText = tr(n.def.nameKey);
    n.lineTexts = new Array(n.def.lines.length);
    for (let i = 0; i < n.def.lines.length; i++) n.lineTexts[i] = tr(n.def.lines[i]);
    n.thanksText = tr(n.def.thanksKey, { amount: n.def.gift.amount });
    if (n.def.barks) {
      n.barkTexts = new Array(n.def.barks.length);
      for (let i = 0; i < n.def.barks.length; i++) n.barkTexts[i] = tr(n.def.barks[i]);
    } else {
      n.barkTexts = null;
    }
    n.bubbleText = null; // force the DOM write on the next visible frame
  }

  /** Redraw one nameplate after a language switch. */
  function rebuildNameplate(n) {
    if (!n.sprite) return;
    const map = makeNameTexture(n.nameText);
    if (!map) return;
    const old = n.sprite.material.map;
    n.sprite.material.map = map;
    n.sprite.material.needsUpdate = true;
    if (old) old.dispose();
    const scale = Math.max(2.2, Math.min(3.6, n.nameText.length * 0.17 + 1.1));
    n.sprite.scale.set(scale, 0.62, 1);
  }

  function rebuildAllText() {
    fearText = tr("survivor_fear");
    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i];
      resolveNpcText(n);
      rebuildNameplate(n);
    }
  }

  // --- placement --------------------------------------------------------------

  function findDistrict(id) {
    for (let i = 0; i < districts.length; i++) {
      if (districts[i] && districts[i].id === id) return districts[i];
    }
    return null;
  }

  function insideDistrict(district, x, z, margin) {
    if (!district || !district.bounds) return true; // headless fallback
    const b = district.bounds;
    return (
      x >= b.minX + margin && x <= b.maxX - margin &&
      z >= b.minZ + margin && z <= b.maxZ - margin
    );
  }

  function inPond(x, z) {
    return (
      x > POND.minX - POND_PAD && x < POND.maxX + POND_PAD &&
      z > POND.minZ - POND_PAD && z < POND.maxZ + POND_PAD
    );
  }

  function poiClear(x, z) {
    for (let i = 0; i < POIS.length; i++) {
      const p = POIS[i];
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz < p.r * p.r) return false;
    }
    return true;
  }

  function blocked(x, z, r) {
    return !!(level && typeof level.isBlocked === "function" && level.isBlocked(x, z, r));
  }

  /**
   * Anchor test for one survivor. Camps need more elbow room at the fire.
   * @param {SurvivorDef} def
   * @param {number} x
   * @param {number} z
   * @returns {boolean}
   */
  function validAnchor(def, x, z) {
    if (!insideDistrict(findDistrict(def.district), x, z, 2)) return false;
    if (inPond(x, z)) return false;
    if (onRoad(x, z)) return false;
    if (blocked(x, z, def.camp ? 1.7 : 1.2)) return false;
    if (!clearOf(spawns, x, z, MIN_SPAWN_DIST)) return false;
    if (!clearOf(gates, x, z, MIN_GATE_DIST)) return false;
    if (!poiClear(x, z)) return false;
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      const dx = x - a.x;
      const dz = z - a.z;
      if (dx * dx + dz * dz < MIN_NPC_GAP * MIN_NPC_GAP) return false;
    }
    return true;
  }

  /** Tent / crate footprint (local offsets, matching buildCamp). */
  const CAMP_PIECES = [
    { lx: -3.2, lz: -1.5, r: 1.7 }, // tent (2.6 × 2.2)
    { lx: 2.3, lz: -1.5, r: 0.95 }, // crate 1
    { lx: 3.1, lz: -0.4, r: 0.95 }, // crate 2
  ];

  /**
   * Try the four 90° yaws for one anchor; all tent/crate footprints must be
   * unblocked, off-road, inside the district and outside the pond.
   * @param {SurvivorDef} def
   * @param {number} x
   * @param {number} z
   * @returns {number|null}
   */
  function findCampYaw(def, x, z) {
    const district = findDistrict(def.district);
    for (let k = 0; k < 4; k++) {
      const yaw = (def.campYaw || 0) + (k * Math.PI) / 2;
      let ok = true;
      for (let i = 0; i < CAMP_PIECES.length; i++) {
        const p = CAMP_PIECES[i];
        const w = localToWorld(x, z, yaw, p.lx, p.lz);
        if (inPond(w.x, w.z) || onRoad(w.x, w.z)) { ok = false; break; }
        if (!insideDistrict(district, w.x, w.z, 1.2)) { ok = false; break; }
        if (blocked(w.x, w.z, p.r)) { ok = false; break; }
      }
      if (ok) return yaw;
    }
    return null;
  }

  /**
   * Deterministic candidate grid, sorted by distance to the preferred point.
   * @param {{minX: number, maxX: number, minZ: number, maxZ: number}} region
   * @param {{x: number, z: number}} preferred
   * @returns {Array<{x: number, z: number, d2: number}>}
   */
  function candidateSpots(region, preferred) {
    const out = [];
    const step = 1.5;
    for (let z = region.minZ; z <= region.maxZ + 1e-6; z += step) {
      for (let x = region.minX; x <= region.maxX + 1e-6; x += step) {
        const dx = x - preferred.x;
        const dz = z - preferred.z;
        out.push({ x, z, d2: dx * dx + dz * dz });
      }
    }
    out.sort((a, b) => a.d2 - b.d2);
    return out;
  }

  // --- camp builder -----------------------------------------------------------

  /**
   * Build one camp around a valid anchor: fire ring + logs + tent + 2 crates +
   * broken barricade ring. Pushes the tent/crate AABBs into level.colliders.
   * @param {number} ax
   * @param {number} az
   * @param {number} yaw
   */
  function buildCamp(ax, az, yaw) {
    campsBuilt++;

    // -- fire ring (visual only) ----------------------------------------------
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const sx = 0.42;
      const sy = 0.3;
      const sz = 0.42;
      pushBox(
        campSolidGeos, sx, sy, sz,
        ax + Math.cos(a) * 1.15, 0.16, az + Math.sin(a) * 1.15,
        i % 2 === 0 ? 0x3a3f46 : 0x2e333a
      );
    }
    for (let i = 0; i < 3; i++) {
      const g = new THREE.BoxGeometry(1.3, 0.26, 0.3);
      g.rotateY((i * Math.PI) / 3);
      g.translate(ax, 0.24, az);
      campSolidGeos.push(tintGeo(g, new THREE.Color(0x2e2118)));
    }
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(ax, 0.55, az);
    scene.add(flame);
    campFlames.push(flame);
    campFireData.push({ x: ax, z: az, phase: rng() * TAU, base: 0.85 + rng() * 0.25 });

    // -- tent (2.6 × 2.2 footprint, collider) ---------------------------------
    const tent = localToWorld(ax, az, yaw, -3.2, -1.5);
    {
      const back = new THREE.BoxGeometry(2.6, 2.2, 0.15);
      back.translate(0, 1.1, -1.1);
      back.rotateY(yaw);
      back.translate(tent.x, 0, tent.z);
      campSolidGeos.push(tintGeo(back, new THREE.Color(0x5d5b45)));

      for (const side of [-1, 1]) {
        const slope = new THREE.BoxGeometry(1.61, 0.16, 2.8);
        slope.rotateX(side * 0.62);
        slope.translate(0, 1.55, side * 0.49);
        slope.rotateY(yaw);
        slope.translate(tent.x, 0, tent.z);
        campSolidGeos.push(tintGeo(slope, new THREE.Color(side < 0 ? 0x6d6a4f : 0x626046)));
      }
      // Simple ridge pole + collider footprint (rotated AABB).
      const ridge = new THREE.BoxGeometry(2.8, 0.09, 0.09);
      ridge.rotateY(yaw);
      ridge.translate(tent.x, 2.35, tent.z);
      campSolidGeos.push(tintGeo(ridge, new THREE.Color(0x2a241c)));
      const c = Math.abs(Math.cos(yaw));
      const s = Math.abs(Math.sin(yaw));
      const hx = c * 1.3 + s * 1.1;
      const hz = s * 1.3 + c * 1.1;
      pushCollider(tent.x, tent.z, hx * 2, hz * 2);
    }

    // -- two crates (1.1 cube, collider 1.2) ----------------------------------
    const crates = [
      { lx: 2.3, lz: -1.5, stack: false },
      { lx: 3.1, lz: -0.4, stack: true },
    ];
    for (let i = 0; i < crates.length; i++) {
      const cr = crates[i];
      const p = localToWorld(ax, az, yaw, cr.lx, cr.lz);
      pushBox(campSolidGeos, 1.1, 1.1, 1.1, p.x, 0.55, p.z, i === 0 ? 0x6b5232 : 0x5c472b);
      // Lid band (reads as a crate, not a plain cube).
      pushBox(campSolidGeos, 1.16, 0.1, 1.16, p.x, 1.08, p.z, 0x3a2c1b);
      if (cr.stack) {
        const top = new THREE.BoxGeometry(0.95, 0.95, 0.95);
        top.rotateY(yaw + 0.22);
        top.translate(p.x, 1.75, p.z);
        campSolidGeos.push(tintGeo(top, new THREE.Color(0x755a38)));
      }
      pushCollider(p.x, p.z, 1.2, 1.2);
    }

    // -- broken barricade ring (visual only, >2 m gap facing local +Z) -------
    const SEGMENTS = 18;
    const RADIUS = 5.0;
    for (let i = 0; i < SEGMENTS; i++) {
      const a = (i / SEGMENTS) * TAU; // local angle; +Z is π/2
      let diff = Math.abs(a - Math.PI / 2);
      if (diff > Math.PI) diff = TAU - diff;
      if (diff < 0.25) continue; // walk lane (≈ 3 m at r 5)
      const p = localToWorld(ax, az, yaw, Math.cos(a) * RADIUS, Math.sin(a) * RADIUS);
      if (inPond(p.x, p.z) || onRoad(p.x, p.z) || blocked(p.x, p.z, 0.4)) continue;
      const seg = new THREE.BoxGeometry(0.28, 0.55, 1.45);
      seg.rotateY(yaw + a);
      seg.translate(p.x, 0.28, p.z);
      campSolidGeos.push(tintGeo(seg, new THREE.Color(i % 2 === 0 ? 0x4a3b26 : 0x3c3020)));
      if (i % 3 === 0) {
        pushBox(campSolidGeos, 0.15, 0.94, 0.15, p.x, 0.47, p.z, 0x2e2418);
      }
    }
  }

  /** Push a camp collider + remember it for stats. */
  function pushCollider(x, z, sx, sz) {
    if (!level || !Array.isArray(level.colliders)) return;
    const c = colliderOf(x, z, sx, sz);
    level.colliders.push(c);
    collidersAdded.push(c);
  }

  // --- NPC model --------------------------------------------------------------

  /** Body (torso + head + arms + backpack) with baked palette colours. */
  function buildBodyGeo(p) {
    const geos = [];
    // pelvis / belt
    pushBox(geos, 0.42, 0.16, 0.24, 0, 0.94, 0, p.pants);
    pushBox(geos, 0.47, 0.07, 0.29, 0, 0.99, 0, 0x2a241c);
    // torso + chest panel
    pushBox(geos, 0.46, 0.58, 0.27, 0, 1.25, 0, p.coat);
    pushBox(geos, 0.48, 0.1, 0.285, 0, 1.2, 0, 0x1f1a13);
    pushBox(geos, 0.5, 0.12, 0.3, 0, 1.52, 0, p.coat);
    // neck + head + nose + hair (upright, no glowing eyes)
    pushBox(geos, 0.11, 0.08, 0.11, 0, 1.58, 0, p.skin);
    pushBox(geos, 0.24, 0.26, 0.24, 0, 1.72, 0, p.skin);
    pushBox(geos, 0.05, 0.05, 0.04, 0, 1.7, -0.13, p.skin);
    pushBox(geos, 0.26, 0.08, 0.26, 0, 1.86, 0, p.hair);
    pushBox(geos, 0.26, 0.14, 0.06, 0, 1.78, 0.12, p.hair);
    // arms + hands
    for (const side of [-1, 1]) {
      pushBox(geos, 0.12, 0.52, 0.15, side * 0.29, 1.24, 0, p.coat);
      pushBox(geos, 0.1, 0.12, 0.12, side * 0.29, 0.94, 0, p.skin);
    }
    // backpack + two shoulder straps
    pushBox(geos, 0.34, 0.4, 0.2, 0, 1.26, 0.23, p.pack);
    pushBox(geos, 0.3, 0.09, 0.18, 0, 1.46, 0.24, 0x2b2419);
    for (const side of [-1, 1]) {
      pushBox(geos, 0.06, 0.46, 0.04, side * 0.14, 1.31, -0.15, 0x2b2419);
    }
    const merged = mergeGeometries(geos, false);
    for (let i = 0; i < geos.length; i++) geos[i].dispose();
    if (!merged) {
      const fallback = new THREE.BoxGeometry(0.46, 0.58, 0.27);
      fallback.translate(0, 1.25, 0);
      return fallback;
    }
    return merged;
  }

  /** One leg (thigh + shin + boot), pivot at the hip. */
  function buildLegGeo(p) {
    const geos = [];
    pushBox(geos, 0.17, 0.44, 0.2, 0, -0.22, 0, p.pants);
    pushBox(geos, 0.15, 0.4, 0.18, 0, -0.6, 0, p.pants);
    pushBox(geos, 0.18, 0.12, 0.26, 0, -0.84, -0.03, 0x211b14);
    const merged = mergeGeometries(geos, false);
    for (let i = 0; i < geos.length; i++) geos[i].dispose();
    if (!merged) {
      const fallback = new THREE.BoxGeometry(0.17, 0.8, 0.2);
      fallback.translate(0, -0.5, 0);
      return fallback;
    }
    return merged;
  }

  /**
   * Find a stand spot near the fire/anchor that is not blocked. Camps place
   * the NPC 1.8 m off the fire; loners stand on their anchor.
   * @param {SurvivorDef} def
   * @param {number} ax
   * @param {number} az
   * @param {number} yaw
   * @returns {{x: number, z: number}}
   */
  function findStandSpot(def, ax, az, yaw) {
    if (!def.camp) return { x: ax, z: az };
    // The walk lane is the natural stand spot: local +Z, 2.5 m off the fire.
    // The 1.2 m clearance matches the placement contract for the NPC itself.
    const lane = localToWorld(ax, az, yaw, 0, 2.5);
    if (!blocked(lane.x, lane.z, 1.2) && !onRoad(lane.x, lane.z)) return lane;
    // Otherwise walk a ring around the fire until a clear spot appears.
    for (const radius of [2.1, 2.8, 3.4]) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU + 0.26;
        const p = localToWorld(ax, az, yaw, Math.cos(a) * radius, Math.sin(a) * radius);
        if (!blocked(p.x, p.z, 1.2) && !onRoad(p.x, p.z)) return p;
      }
    }
    // Last resort: the gap lane even if a stray tree overlaps the 0.45 test.
    return lane;
  }

  // --- bubble DOM -------------------------------------------------------------

  /** @type {HTMLElement|null} */
  let bubbleLayer = null;
  if (hasDOM) {
    const host = document.getElementById && document.getElementById("ui")
      ? document.getElementById("ui")
      : document.body;
    if (host && typeof host.appendChild === "function") {
      bubbleLayer = make("div", host);
      css(bubbleLayer, {
        position: "absolute",
        inset: "0",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: "7",
      });
    }
  }

  function buildBubbleNode() {
    if (!bubbleLayer) return null;
    const el = make("div", bubbleLayer);
    css(el, {
      position: "absolute",
      left: "0",
      top: "0",
      display: "none",
      maxWidth: "230px",
      padding: "6px 10px",
      borderRadius: "10px",
      background: "rgba(8, 12, 18, 0.88)",
      border: "1px solid rgba(255, 198, 120, 0.55)",
      boxShadow: "0 2px 10px rgba(0, 0, 0, 0.45)",
      color: "#ffe8c8",
      font: "600 12px/1.35 'Segoe UI', system-ui, sans-serif",
      textAlign: "center",
      whiteSpace: "normal",
      pointerEvents: "none",
      willChange: "transform",
    });
    const text = make("span", el);
    const tri = make("div", el);
    css(tri, {
      position: "absolute",
      left: "50%",
      bottom: "-6px",
      marginLeft: "-5px",
      width: "0",
      height: "0",
      borderLeft: "5px solid transparent",
      borderRight: "5px solid transparent",
      borderTop: "6px solid rgba(255, 198, 120, 0.55)",
    });
    return { el, text };
  }

  // --- building the seven survivors ------------------------------------------

  for (let di = 0; di < SURVIVOR_DEFS.length; di++) {
    const def = SURVIVOR_DEFS[di];
    const candidates = candidateSpots(def.region, def.preferred);
    let spot = null;
    let campYaw = def.campYaw || 0;
    for (let ci = 0; ci < candidates.length; ci++) {
      const c = candidates[ci];
      if (!validAnchor(def, c.x, c.z)) continue;
      if (def.camp) {
        const yaw = findCampYaw(def, c.x, c.z);
        if (yaw === null) continue;
        campYaw = yaw;
      }
      spot = c;
      break;
    }
    if (!spot) {
      // Never crash the world build: fall back to the preferred point and
      // warn the integrator (the dev guard pattern used by city/vegetation).
      spot = { x: def.preferred.x, z: def.preferred.z };
      console.warn(
        "[survivors] no clear spot for " + def.id + " in " + def.district +
        " — using preferred (" + spot.x + ", " + spot.z + ")"
      );
    }
    anchors.push({ x: spot.x, z: spot.z });

    if (def.camp) buildCamp(spot.x, spot.z, campYaw);

    const start = findStandSpot(def, spot.x, spot.z, campYaw);
    const dx = spot.x - start.x;
    const dz = spot.z - start.z;
    const startYaw = Math.abs(dx) + Math.abs(dz) > 1e-4 ? Math.atan2(-dx, -dz) : 0;

    // -- low-poly humanoid ---------------------------------------------------
    const group = new THREE.Group();
    group.position.set(start.x, 0, start.z);
    group.rotation.y = startYaw;
    const pose = new THREE.Group();
    group.add(pose);

    const bodyGeo = buildBodyGeo(def.palette);
    const body = new THREE.Mesh(bodyGeo, npcMat);
    body.castShadow = true;
    body.receiveShadow = true;
    pose.add(body);

    const legGeo = buildLegGeo(def.palette);
    const legL = new THREE.Mesh(legGeo, npcMat);
    legL.position.set(-0.115, 0.9, 0);
    const legR = new THREE.Mesh(legGeo, npcMat);
    legR.position.set(0.115, 0.9, 0);
    legL.castShadow = true;
    legR.castShadow = true;
    pose.add(legL, legR);

    const lantern = new THREE.Mesh(lanternGeo, lanternMat);
    lantern.position.set(0.37, 0.86, -0.02);
    pose.add(lantern);
    scene.add(group);

    // -- nameplate sprite ----------------------------------------------------
    /** @type {THREE.Sprite|null} */
    let sprite = null;
    if (hasDOM) {
      const tex = makeNameTexture(tr(def.nameKey));
      if (tex) {
        const mat = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          toneMapped: false,
          fog: false,
        });
        sprite = new THREE.Sprite(mat);
        sprite.renderOrder = 6;
        sprite.position.set(start.x, 2.32, start.z);
        sprite.visible = false; // first playing frame decides (menu/intro clean)
        const text = tr(def.nameKey);
        const scale = Math.max(2.2, Math.min(3.6, text.length * 0.17 + 1.1));
        sprite.scale.set(scale, 0.62, 1);
        scene.add(sprite);
      }
    }

    const bubble = buildBubbleNode();

    /** @type {any} */
    const n = {
      def,
      district: def.district,
      x: start.x,
      z: start.z,
      anchorX: spot.x,
      anchorZ: spot.z,
      wanderRadius: def.wanderRadius,
      group,
      pose,
      body,
      legL,
      legR,
      lantern,
      sprite,
      bubbleEl: bubble ? bubble.el : null,
      bubbleTextEl: bubble ? bubble.text : null,
      yaw: startYaw,
      targetX: start.x,
      targetZ: start.z,
      moving: false,
      idleTimer: 1 + rng() * 4,
      bobPhase: rng() * TAU,
      poseAmount: 0,
      fear: false,
      fearX: 0,
      fearZ: 0,
      giftGiven: false,
      inRange: false,
      bubbleVisible: false,
      bubbleText: null,
      bubblePX: -1,
      bubblePY: -1,
      lineIndex: 0,
      lineTimer: 8 + rng() * 6,
      thanksTimer: 0,
      barkTimer: 0,
      barkIndex: -1,
      barkCooldown: 8 + rng() * 12,
      nameText: "",
      lineTexts: [],
      thanksText: "",
      barkTexts: null,
      resetX: start.x,
      resetZ: start.z,
      resetYaw: startYaw,
    };
    resolveNpcText(n);
    npcs.push(n);
  }

  // --- merge the camp props into ONE draw call --------------------------------
  let campMesh = null;
  if (campSolidGeos.length > 0) {
    const merged = mergeGeometries(campSolidGeos, false);
    for (let i = 0; i < campSolidGeos.length; i++) campSolidGeos[i].dispose();
    if (merged) {
      campMesh = new THREE.Mesh(merged, campMat);
      campMesh.name = "survivor-camps";
      campMesh.castShadow = true;
      campMesh.receiveShadow = true;
      campMesh.userData.solid = true;
      scene.add(campMesh);
    } else {
      console.warn("[survivors] camp geometry merge failed — camps are visual-less");
    }
  }

  // --- bus wiring -------------------------------------------------------------

  function emit(name, detail) {
    if (!bus || typeof bus.dispatchEvent !== "function") return;
    bus.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function resetRun() {
    giftsGiven = 0;
    zombieRefs.length = 0;
    time = 0;
    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i];
      n.x = n.resetX;
      n.z = n.resetZ;
      n.yaw = n.resetYaw;
      n.targetX = n.resetX;
      n.targetZ = n.resetZ;
      n.moving = false;
      n.idleTimer = 1 + rng() * 4;
      n.poseAmount = 0;
      n.fear = false;
      n.giftGiven = false;
      n.inRange = false;
      n.bubbleVisible = false;
      n.bubbleText = null;
      n.lineIndex = 0;
      n.lineTimer = 8 + rng() * 6;
      n.thanksTimer = 0;
      n.barkTimer = 0;
      n.barkCooldown = 8 + rng() * 12;
      n.group.position.set(n.x, 0, n.z);
      n.group.rotation.y = n.yaw;
      n.pose.scale.set(1, 1, 1);
      n.pose.rotation.x = 0;
      n.pose.position.y = 0;
      if (n.sprite) {
        n.sprite.position.set(n.x, 2.32, n.z);
        n.sprite.visible = false; // first playing frame re-evaluates distance
      }
      if (n.bubbleEl) n.bubbleEl.style.display = "none";
      if (n.bubbleTextEl) n.bubbleTextEl.textContent = "";
      n.bubblePX = -1;
      n.bubblePY = -1;
    }
  }

  if (bus && typeof bus.addEventListener === "function") {
    bus.addEventListener("zombie-spawned", (e) => {
      const z = e && e.detail ? e.detail.zombie : null;
      if (z && zombieRefs.indexOf(z) === -1) zombieRefs.push(z);
    });
    bus.addEventListener("zombie-despawned", (e) => {
      const z = e && e.detail ? e.detail.zombie : null;
      const i = zombieRefs.indexOf(z);
      if (i !== -1) zombieRefs.splice(i, 1);
    });
    bus.addEventListener("settings-changed", (e) => {
      const patch = e && e.detail ? e.detail.patch : null;
      if (patch && Object.prototype.hasOwnProperty.call(patch, "lang")) rebuildAllText();
    });
    const runEvents = [
      "ui-play",
      "ui-play-free",
      "ui-restart",
      "ui-quit",
      "ui-endless",
      "mission-reset",
    ];
    for (let i = 0; i < runEvents.length; i++) bus.addEventListener(runEvents[i], resetRun);
  }

  // --- collection helpers -----------------------------------------------------

  /**
   * Every spawn point: the 6 district pools + level.spawnPoints.
   * @param {any} c
   * @param {any} l
   * @returns {Array<{x: number, z: number}>}
   */
  function collectSpawns(c, l) {
    const out = [];
    if (c && Array.isArray(c.districts)) {
      for (let i = 0; i < c.districts.length; i++) {
        const d = c.districts[i];
        if (!d || !Array.isArray(d.spawnPoints)) continue;
        for (let j = 0; j < d.spawnPoints.length; j++) {
          const p = d.spawnPoints[j];
          if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) out.push({ x: p.x, z: p.z });
        }
      }
    }
    if (l && Array.isArray(l.spawnPoints)) {
      for (let i = 0; i < l.spawnPoints.length; i++) {
        const p = l.spawnPoints[i];
        if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) out.push({ x: p.x, z: p.z });
      }
    }
    return out;
  }

  /**
   * Every gate gap centre: district records + level waypoints (deduped).
   * @param {any} c
   * @param {any} l
   * @returns {Array<{x: number, z: number}>}
   */
  function collectGates(c, l) {
    const out = [];
    const seen = new Set();
    const add = (x, z) => {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const key = x.toFixed(2) + ":" + z.toFixed(2);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ x, z });
    };
    if (c && Array.isArray(c.districts)) {
      for (let i = 0; i < c.districts.length; i++) {
        const d = c.districts[i];
        if (!d || !Array.isArray(d.gates)) continue;
        for (let j = 0; j < d.gates.length; j++) {
          const g = d.gates[j];
          if (g) add(g.x, g.z);
        }
      }
    }
    if (l && typeof l.getGateWaypoints === "function") {
      try {
        const list = l.getGateWaypoints();
        for (let i = 0; i < list.length; i++) if (list[i]) add(list[i].x, list[i].z);
      } catch {
        /* legacy/mock level: district records still cover it */
      }
    }
    return out;
  }

  // --- per-frame --------------------------------------------------------------

  /**
   * True when (x,z) is a legal NPC walk position: inside the district, off
   * the pond, outside static colliders, and not on the camp fire.
   * @param {any} n
   * @param {number} x
   * @param {number} z
   * @returns {boolean}
   */
  function validWalk(n, x, z) {
    if (!insideDistrict(findDistrict(n.def.district), x, z, 0.8)) return false;
    if (inPond(x, z)) return false;
    if (blocked(x, z, 0.42)) return false;
    if (n.def.camp) {
      const dx = x - n.anchorX;
      const dz = z - n.anchorZ;
      if (dx * dx + dz * dz < 1.45 * 1.45) return false; // fire ring
    }
    return true;
  }

  /**
   * Try a move; slide along one axis when the diagonal is blocked.
   * @param {any} n
   * @param {number} dx
   * @param {number} dz
   * @param {number} dist
   * @returns {boolean}
   */
  function tryMove(n, dx, dz, dist) {
    const nx = n.x + dx * dist;
    const nz = n.z + dz * dist;
    if (validWalk(n, nx, nz)) {
      n.x = nx;
      n.z = nz;
      return true;
    }
    if (validWalk(n, nx, n.z)) {
      n.x = nx;
      return true;
    }
    if (validWalk(n, n.x, nz)) {
      n.z = nz;
      return true;
    }
    return false;
  }

  /** Choose a new wander target inside the leash (deterministic rng stream). */
  function pickWander(n) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = rng() * TAU;
      const r = 2 + rng() * (n.wanderRadius - 2);
      const tx = n.anchorX + Math.cos(a) * r;
      const tz = n.anchorZ + Math.sin(a) * r;
      if (!validWalk(n, tx, tz)) continue;
      const dx = tx - n.anchorX;
      const dz = tz - n.anchorZ;
      if (dx * dx + dz * dz > n.wanderRadius * n.wanderRadius) continue;
      n.targetX = tx;
      n.targetZ = tz;
      n.moving = true;
      n.idleTimer = 0;
      return;
    }
    n.idleTimer = 2 + rng() * 4;
    n.moving = false;
  }

  /**
   * Project the bubble above the head through the camera and move the DOM
   * node. Only visible bubbles get a transform write; text is compared by
   * reference (all lines are cached strings).
   * @param {any} n
   * @param {string|null} text
   * @param {number} vw
   * @param {number} vh
   */
  function updateBubble(n, text, vw, vh) {
    if (!n.bubbleEl) return;
    const show = !!text && !!camera && vw > 0 && vh > 0;
    if (!show) {
      if (n.bubbleVisible) {
        n.bubbleEl.style.display = "none";
        n.bubbleVisible = false;
      }
      return;
    }
    tmpV.set(n.x, 2.62, n.z);
    tmpV.project(camera);
    if (tmpV.z > 1 || tmpV.z < -1) {
      if (n.bubbleVisible) {
        n.bubbleEl.style.display = "none";
        n.bubbleVisible = false;
      }
      return;
    }
    const sx = (tmpV.x * 0.5 + 0.5) * vw;
    const sy = (-tmpV.y * 0.5 + 0.5) * vh;
    if (sx < -80 || sx > vw + 80 || sy < -40 || sy > vh + 40) {
      if (n.bubbleVisible) {
        n.bubbleEl.style.display = "none";
        n.bubbleVisible = false;
      }
      return;
    }
    if (!n.bubbleVisible) {
      n.bubbleEl.style.display = "block";
      n.bubbleVisible = true;
    }
    if (text !== n.bubbleText) {
      n.bubbleText = text;
      if (n.bubbleTextEl) n.bubbleTextEl.textContent = text;
    }
    if (Math.abs(sx - n.bubblePX) > 0.5 || Math.abs(sy - n.bubblePY) > 0.5) {
      n.bubblePX = sx;
      n.bubblePY = sy;
      n.bubbleEl.style.transform =
        "translate(-50%, -100%) translate(" + Math.round(sx) + "px," + Math.round(sy) + "px)";
    }
  }

  /**
   * Per-frame tick while playing. Freezes in menus because the integrator
   * only calls it from the playing branch.
   * @param {number} dt
   * @param {{x: number, z: number}=} playerPos
   */
  function update(dt, playerPos) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const step = dt > 0.05 ? 0.05 : dt;
    time += step;
    const hasPlayer = !!(playerPos && Number.isFinite(playerPos.x) && Number.isFinite(playerPos.z));
    const px = hasPlayer ? playerPos.x : 0;
    const pz = hasPlayer ? playerPos.z : 0;
    const vw = hasBrowser && Number.isFinite(window.innerWidth) ? window.innerWidth : 0;
    const vh = hasBrowser && Number.isFinite(window.innerHeight) ? window.innerHeight : 0;

    // One camera matrix update per frame, only when bubbles can be projected.
    if (camera && bubbleLayer && vw > 0) camera.updateMatrixWorld();

    // Shared lantern pulse (one material write — no per-LED light).
    const pulse = 0.9 + 0.1 * Math.sin(time * 2.7);
    lanternMat.color.setRGB(1, 0.74 * pulse, 0.46 * pulse);

    for (let i = 0; i < campFlames.length; i++) {
      const f = campFireData[i];
      const wob = 0.85 + 0.15 * Math.sin(time * 9.3 + f.phase) + 0.06 * Math.sin(time * 21.7 + f.phase);
      const mesh = campFlames[i];
      mesh.scale.set(f.base * (0.94 + 0.06 * Math.sin(time * 17 + f.phase)), f.base * wob, f.base * (0.94 + 0.06 * Math.cos(time * 13 + f.phase)));
      mesh.rotation.y = time * 1.6 + f.phase;
    }

    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i];
      const dpx = px - n.x;
      const dpz = pz - n.z;
      const dPlayer2 = hasPlayer ? dpx * dpx + dpz * dpz : Infinity;
      const playerNear = dPlayer2 <= FACE_RADIUS * FACE_RADIUS;

      // --- fear: nearest live zombie inside the hysteresis window ----------
      let nearest = null;
      let nearestD2 = FEAR_EXIT * FEAR_EXIT;
      for (let j = 0; j < zombieRefs.length; j++) {
        const z = zombieRefs[j];
        if (!z || z.alive === false || !z.position) continue;
        const zx = z.position.x - n.x;
        const zz = z.position.z - n.z;
        const d2 = zx * zx + zz * zz;
        if (d2 < nearestD2) {
          nearestD2 = d2;
          nearest = z;
        }
      }
      const wasFear = n.fear;
      if (nearest) {
        if (!n.fear && nearestD2 <= FEAR_RADIUS * FEAR_RADIUS) n.fear = true;
        if (n.fear) {
          n.fearX = nearest.position.x;
          n.fearZ = nearest.position.z;
        }
      } else {
        n.fear = false;
      }
      if (wasFear && !n.fear) n.idleTimer = Math.max(n.idleTimer, 1.2);

      // --- movement / facing ------------------------------------------------
      let desiredYaw = n.yaw;
      if (n.fear) {
        const zx = n.fearX - n.x;
        const zz = n.fearZ - n.z;
        const len = Math.sqrt(zx * zx + zz * zz);
        if (len > 1e-4) {
          desiredYaw = Math.atan2(-zx, -zz); // face the threat, back away
          // Leash the panicked retreat so a survivor cannot be dragged across
          // the whole district by a passing horde.
          const ox = n.x - n.anchorX;
          const oz = n.z - n.anchorZ;
          if (ox * ox + oz * oz < (n.wanderRadius + 3) * (n.wanderRadius + 3)) {
            tryMove(n, -zx / len, -zz / len, FEAR_SPEED * step);
          }
        }
        n.moving = false;
        n.bobPhase += step * 8;
      } else if (playerNear) {
        // Stop and face the player (the "talk to me" pose).
        if (Math.abs(dpx) + Math.abs(dpz) > 1e-4) desiredYaw = Math.atan2(-dpx, -dpz);
        n.moving = false;
        if (n.idleTimer < 1.2) n.idleTimer = 1.2;
      } else if (n.moving) {
        const tx = n.targetX - n.x;
        const tz = n.targetZ - n.z;
        const len = Math.sqrt(tx * tx + tz * tz);
        if (len < 0.35) {
          n.moving = false;
          n.idleTimer = 2.5 + rng() * 5.5;
        } else {
          desiredYaw = Math.atan2(-tx, -tz);
          if (!tryMove(n, tx / len, tz / len, WANDER_SPEED * step)) {
            n.moving = false;
            n.idleTimer = 1.5 + rng() * 2.5;
          }
          n.bobPhase += step * 7;
        }
      } else {
        n.idleTimer -= step;
        if (n.idleTimer <= 0) pickWander(n);
        n.bobPhase += step * 1.2;
      }
      n.yaw = turnToward(n.yaw, desiredYaw, TURN_SPEED * step);

      // --- pose: walk swing + fear crouch/lean ------------------------------
      const targetPose = n.fear ? 1 : 0;
      n.poseAmount += (targetPose - n.poseAmount) * Math.min(1, step * 8);
      const walking = n.moving && !n.fear;
      const swing = Math.sin(n.bobPhase) * (walking ? 0.55 : n.fear ? 0.06 : 0.015);
      n.legL.rotation.x = swing;
      n.legR.rotation.x = -swing;
      n.pose.position.y = (walking ? Math.abs(Math.sin(n.bobPhase)) * 0.035 : 0) - n.poseAmount * 0.02;
      n.pose.scale.set(1 + n.poseAmount * 0.04, 1 - n.poseAmount * 0.2, 1 + n.poseAmount * 0.04);
      n.pose.rotation.x = -n.poseAmount * 0.16;
      n.group.position.set(n.x, 0, n.z);
      n.group.rotation.y = n.yaw;
      n.lantern.rotation.y = Math.sin(n.bobPhase) * 0.16;

      // --- nameplate --------------------------------------------------------
      if (n.sprite) {
        n.sprite.position.set(n.x, 2.32 + n.pose.position.y, n.z);
        const dist = hasPlayer ? Math.sqrt(dPlayer2) : 0;
        if (dist > NAMEPLATE_FAR) {
          n.sprite.visible = false;
        } else {
          n.sprite.visible = true;
          const op = dist <= NAMEPLATE_NEAR ? 1 : 1 - (dist - NAMEPLATE_NEAR) / (NAMEPLATE_FAR - NAMEPLATE_NEAR);
          if (Math.abs(op - n.sprite.material.opacity) > 0.01) n.sprite.material.opacity = op;
        }
      }

      // --- proximity, gift, barks, bubble -----------------------------------
      if (hasPlayer) {
        if (n.inRange) {
          if (dPlayer2 > INTERACT_EXIT * INTERACT_EXIT) n.inRange = false;
        } else if (dPlayer2 <= INTERACT_RADIUS * INTERACT_RADIUS) {
          n.inRange = true;
        }
      } else {
        n.inRange = false;
      }

      // One-time gift on the first approach of this run.
      if (n.inRange && !n.giftGiven) {
        n.giftGiven = true;
        giftsGiven++;
        n.thanksTimer = 6.5;
        emit("npc-gift", { kind: n.def.gift.kind, amount: n.def.gift.amount });
      }

      if (n.thanksTimer > 0) n.thanksTimer -= step;
      if (n.barkTimer > 0) n.barkTimer -= step;

      // Contextual line rotates every 8–14 s while the player is close.
      if (n.inRange && n.thanksTimer <= 0) {
        n.lineTimer -= step;
        if (n.lineTimer <= 0) {
          n.lineIndex = (n.lineIndex + 1) % n.lineTexts.length;
          n.lineTimer = 8 + rng() * 6;
        }
      }

      // Safehouse barks: ambient lines only while outside the talk ring.
      if (n.barkTexts) {
        n.barkCooldown -= step;
        if (n.barkCooldown <= 0) {
          if (!n.inRange && dPlayer2 <= BARK_RADIUS * BARK_RADIUS) {
            n.barkIndex = (n.barkIndex + 1) % n.barkTexts.length;
            n.barkTimer = 5;
            n.barkCooldown = 18 + rng() * 14;
          } else {
            n.barkCooldown = 2;
          }
        }
      }

      let text = null;
      if (hasPlayer) {
        if (n.thanksTimer > 0 && dPlayer2 <= (INTERACT_EXIT + 3) * (INTERACT_EXIT + 3)) {
          text = n.thanksText;
        } else if (n.inRange) {
          text = n.fear ? fearText : n.lineTexts[n.lineIndex];
        } else if (n.barkTimer > 0 && dPlayer2 <= BARK_RADIUS * BARK_RADIUS) {
          text = n.barkTexts ? n.barkTexts[n.barkIndex] : null;
        }
      }
      updateBubble(n, text, vw, vh);
    }
  }

  // --- public surface ---------------------------------------------------------

  let spriteCount = 0;
  for (let i = 0; i < npcs.length; i++) if (npcs[i].sprite) spriteCount++;
  const drawCalls =
    npcs.length * 4 + // body + 2 legs + lantern
    (campMesh ? 1 : 0) +
    campFlames.length +
    spriteCount;

  /**
   * Snapshot of the module's budget + run state (fresh object; called by the
   * integrator/debug, never per frame).
   * @returns {Record<string, number>}
   */
  function stats() {
    let feared = 0;
    let nameplates = 0;
    let bubbles = 0;
    for (let i = 0; i < npcs.length; i++) {
      if (npcs[i].fear) feared++;
      if (npcs[i].sprite) nameplates++;
      if (npcs[i].bubbleEl) bubbles++;
    }
    return {
      survivors: npcs.length,
      camps: campsBuilt,
      campFlames: campFlames.length,
      nameplates,
      bubbles,
      giftsGiven,
      feared,
      collidersAdded: collidersAdded.length,
      drawCalls,
    };
  }

  // One dev-guard line (warn, never throw) so layout drift is visible.
  if (level && typeof level.isBlocked === "function") {
    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i];
      if (level.isBlocked(n.x, n.z, 0.8)) {
        console.warn("[survivors] " + n.def.id + " starts blocked at (" + n.x + ", " + n.z + ")");
      }
    }
  }

  return { update, stats, reset: resetRun, survivors: npcs };
}
