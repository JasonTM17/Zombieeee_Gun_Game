/**
 * ============================================================================
 * ORIGIN — BOSS CUỐI "NGUỒN GỐC" — "ĐÊM THỨ 30 · Phần 3" (chặng cuối).
 * Hợp đồng: docs/EXPANSION-P3.md §3 (nguyên văn spec §3.0; số frozen §3.2;
 * builder-chosen §3.9 — bảng trong header gốc của hợp đồng).
 * ============================================================================
 * STUB — Builder BOSS thay thân `createOrigin`, GIỮ nguyên chữ ký + typedef
 * dưới đây. Cây cài đặt: `Origin extends BossZombie` (src/zombies/bosses.js)
 * để kế thừa toàn bộ plumbing flash/fade/voice/FX (_bodyMat, _fxMat, _addExtra,
 * _moveXZ, _stepGait, _face, _distTo, _tryMelee, _decayCommon, _setGlow, _roar,
 * _die, boss-drops) và MẶT NGOÀI boss chuẩn (docs/EXPANSION.md C4):
 *
 *   alive, hp, maxHp, type ("origin"), score (5000), group, position,
 *   update(dt, player, level, others),
 *   takeDamage(d, headshot) → boolean, dispose()
 *
 * Mỗi mesh `userData.part = "head" | "body"` + `userData.zombie = this`
 * (combat headshot lookup — pattern bosses.js:451-461).
 *
 * LIFECYCLE (timeline chuẩn — P3 §3.9):
 *   main.js nghe "mission-start" {index:10} → city.openVault() +
 *   spawnOriginInternal() → createOrigin(scene, bus, city) tại (0,0):
 *   - state "rising" 2.5 s: group.y −4.5 → 0 (ease-out), BẤT TỬ
 *     (takeDamage → false), gầm "boss-roar" {type:"origin", action:"rise"}
 *     tại t≈0.5 s; phát "origin-alive" {alive:true} NGAY khi tạo (events.js
 *     đóng băng scheduler — P3 §3.5).
 *   - "fight" theo 3 PHASE (P3 §3.2 — số FROZEN):
 *       P1 (100–66%]: đập đất cd 5.0 (first 3.0) — ring 8 m / 0.6 s, 30 dmg
 *         + hất bay (velocity.y 8, đẩy ngang 6; hệ golem bosses.js:969-994);
 *         triệu 4 walker cd 12.0 (first 6.0) — bán kính 2.5 m quanh mình,
 *         `summoned = true` + "zombie-spawned" {zombie} (hệ screamer
 *         bosses.js:835-858).
 *       P2 (66–33%]: + mưa acid cd 9.0 (first 4.0) — 5 vũng rơi NGẪU NHIÊN
 *         ≤ 15 m quanh PLAYER, rơi y 12 → đất 0.8 s → vũng bán kính 1 m,
 *         4 s, 6 dmg/s = 3 dmg / 0.5 s tick (hệ spitter bosses.js:702-763);
 *         + húc cd 8.0 (first 3.0) — telegraph 0.7 s đứng yên + _setGlow(true)
 *         + roar, lao thẳng 12 m tốc 10 m/s, chạm < 1.9 m: 35 dmg +
 *         knockback (x/z +12, y +4); hết 12 m hoặc tường → dừng.
 *       P3 (<33%]: NỒNG TỐ — speed ×1.5 (1.6 → 2.4), MỌI cooldown ×0.7,
 *         thân đỏ (_setGlow giữ đến chết), + sóng xung kích cd 3.0 (first
 *         1.0) — ring 6 m / 0.4 s, 15 dmg, KHÔNG hất bay.
 *   - Chuyển phase (rơi qua 66% / 33%): state "transition" 1.5 s — bất tử +
 *     "boss-roar" {action:"phase"} + nhấp nháy TRẮNG (emissive ×3 nhịp) +
 *     "origin-shake" {power:1}.
 *   - Chết (takeDamage kết liễu, đúng thứ tự, MỘT lần):
 *       1. "zombie-killed" {type:"origin", score:5000, headshot, position}
 *          (+ "boss-drops" kế thừa) qua super._die;
 *       2. "origin-alive" {alive:false};
 *       3. "origin-defeated" {timeSec, damageTaken} — timeSec = giây từ khi
 *          rise xong (1 chữ số thập phân), damageTaken = tổng dmg toàn trận.
 *     Animation chết: nghiêng chậm + chìm + fade 3.0 s (KHÔNG dùng fall 1.5 s
 *     của zombie thường), xong super._finishDespawn(). Nổ lớn do main.js làm
 *     qua "origin-defeated"/"origin-shake" {power:2} — origin.js KHÔNG giữ
 *     ref particles/explosives (chữ ký 3 tham số frozen).
 *   - dispose(): gỡ mọi world-FX + listener bus; nếu ĐANG sống → phát
 *     "origin-alive" {alive:false} (freshRun drain — events mở lại scheduler,
 *     P3-K7). Idempotent.
 *
 * NG+ (P3-K9): nghe "ng-plus" {active} trên bus — đơn MỚI tạo áp hp ×1.25
 * (3000 → 3750) / speed ×1.1 (1.6 → 1.76). Chỉ listener đầu tiên trên MỖI bus
 * instance được đăng ký (WeakMap — createOrigin có thể được gọi nhiều lần).
 *
 * Số builder chọn (đánh dấu để review): scale 2.6, speed base 1.6, melee 30,
 * charge speed 10 m/s, charge contact 1.9 m, rise depth −4.5 m / 2.5 s,
 * acid fall y 12 / 0.8 s, màu skin/cloth/pants 0x3a1418/0x1d0d12/0x120608.
 *
 * Bus events emitted: "zombie-killed", "zombie-voice", "boss-drops",
 * "boss-roar" (kế thừa) + "zombie-spawned" (triệu walker), "origin-alive",
 * "origin-defeated", "origin-shake".
 * Bus events consumed: "ng-plus".
 *
 * @param {import("three").Scene} scene - Origin tự add vào scene.
 * @param {EventTarget} bus - shared bus (src/systems/gamestate.js).
 * @param {import("../world/city.js").City} city - nhận theo hợp đồng (district
 *   lookup dự phòng); trận đấu diễn ra ở quarantine (0,0) — vault đã mở bởi
 *   main.js TRƯỚC khi createOrigin được gọi (docs/EXPANSION-P3.md §3.9).
 * @returns {Origin}
 */

/**
 * @typedef {Object} Origin
 * @property {boolean} alive - false chỉ sau takeDamage kết liễu.
 * @property {number} hp - 3000 lúc spawn (NG+: 3750).
 * @property {number} maxHp - 3000 (KHÔNG nhân ×(1+wave/20) — trận cuối).
 * @property {number} score - 5000 (base — gamestate ×1.5 headshot).
 * @property {"origin"} type - payload bus + economy/hud lookup.
 * @property {"P1"|"P2"|"P3"} phase - phase hiện tại theo máu (§3.2).
 * @property {"rising"|"fight"|"transition"|"dead"} state - vòng đời trong trận.
 * @property {import("three").Group} group - root trong scene.
 * @property {import("three").Vector3} position - mirrors group (feet).
 * @property {(dt: number, player: import("../player/controller.js").Player,
 *   level: import("../world/level.js").Level,
 *   others: import("./zombie.js").Zombie[]) => void} update
 * @property {(d: number, headshot: boolean) => boolean} takeDamage - true khi
 *   đòn này kết liễu; false khi rising/transition/dead (bất tử).
 * @property {() => void} dispose
 */

import * as THREE from "three";
import { BossZombie } from "./bosses.js";

// --- số FROZEN (docs/EXPANSION-P3.md §3.2) — không đổi khi cài đặt -----------

export const ORIGIN_MAX_HP = 3000; // không scale theo wave — trận cuối
export const ORIGIN_SCORE = 5000;
export const ORIGIN_MELEE_DMG = 30;
export const ORIGIN_BASE_SPEED = 1.6; // m/s — P3 ×1.5 = 2.4

/** Ngưỡng phase theo tỉ lệ máu (hp/maxHp): P2 khi ≤ 0.66, P3 khi ≤ 0.33. */
export const ORIGIN_PHASE_P2 = 0.66;
export const ORIGIN_PHASE_P3 = 0.33;

/** Cooldown từng đòn theo phase (giây) — {cd, first}; P3 nhân ×0.7 toàn bộ. */
export const ORIGIN_PHASES = {
  P1: {
    slam: { cd: 5.0, first: 3.0, radius: 8, time: 0.6, dmg: 30, lift: 8, push: 6 },
    summon: { cd: 12.0, first: 6.0, count: 4, ring: 2.5 },
  },
  P2: {
    acidRain: { cd: 9.0, first: 4.0, drops: 5, scatter: 15, fallY: 12, fallT: 0.8 },
    charge: { cd: 8.0, first: 3.0, telegraph: 0.7, dist: 12, speed: 10, dmg: 35, contact: 1.9, knock: 12, lift: 4 },
  },
  P3: {
    shockwave: { cd: 3.0, first: 1.0, radius: 6, time: 0.4, dmg: 15 },
    cooldownMul: 0.7, // mọi cooldown ×0.7
    speedMul: 1.5, // tốc độ ×1.5
  },
};

export const RISE_TIME = 2.5; // s — spawn animation (bất tử trong lúc này)
export const RISE_DEPTH = 4.5; // m dưới đất lúc bắt đầu
export const TRANSITION_TIME = 1.5; // s bất tử giữa các phase
export const DEATH_ANIM_TIME = 3.0; // nghiêng + chìm + fade (thay fall 1.5 s)
export const ACID_POOL_RADIUS = 1.0; // "2 m" theo spec = bán kính 1 m
export const ACID_POOL_LIFE = 4; // s
export const ACID_POOL_DPS = 6; // = 3 dmg mỗi 0.5 s tick
export const ACID_POOL_TICK = 0.5;

/** NG+ hệ số (P3-K9) — áp cho đơn vị MỚI tạo khi "ng-plus" {active:true}. */
export const NG_HP_MUL = 1.25;
export const NG_SPEED_MUL = 1.1;

// Scratch dùng chung — per-frame path KHÔNG cấp phát (P1 §3.7 / P2 §3.8).
const scratchPos = new THREE.Vector3();

/**
 * Factory boss cuối. STUB — ném lỗi TODO khi được gọi (import phải sạch để
 * build pass; thân thật do Builder BOSS cài theo docs/EXPANSION-P3.md §3).
 *
 * @param {import("three").Scene} scene
 * @param {EventTarget} bus
 * @param {import("../world/city.js").City} city
 * @returns {Origin}
 */
export function createOrigin(scene, bus, city) {
  void scratchPos;
  void ORIGIN_MAX_HP;
  void ORIGIN_SCORE;
  void ORIGIN_MELEE_DMG;
  void ORIGIN_BASE_SPEED;
  void ORIGIN_PHASE_P2;
  void ORIGIN_PHASE_P3;
  void ORIGIN_PHASES;
  void RISE_TIME;
  void RISE_DEPTH;
  void TRANSITION_TIME;
  void DEATH_ANIM_TIME;
  void ACID_POOL_RADIUS;
  void ACID_POOL_LIFE;
  void ACID_POOL_DPS;
  void ACID_POOL_TICK;
  void NG_HP_MUL;
  void NG_SPEED_MUL;
  void BossZombie;
  throw new Error(
    "TODO(origin): Builder BOSS cài createOrigin theo docs/EXPANSION-P3.md §3 — " +
      "Origin extends BossZombie, 3 phase (§3.2), rise 2.5 s, dispose phát " +
      '"origin-alive" {alive:false}; chữ ký + typedef giữ nguyên.'
  );
}
