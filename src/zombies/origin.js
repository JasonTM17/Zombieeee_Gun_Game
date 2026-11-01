/**
 * ============================================================================
 * ORIGIN — BOSS CUỐI "NGUỒN GỐC" — "ĐÊM THỨ 30 · Phần 3" (chặng cuối).
 * Hợp đồng: docs/EXPANSION-P3.md §3 (nguyên văn spec §3.0; số frozen §3.2;
 * builder-chosen §3.3 — đánh dấu trong nguồn để review).
 * ============================================================================
 * `Origin extends BossZombie` (src/zombies/bosses.js) — kế thừa toàn bộ
 * plumbing flash/fade/voice/FX (_bodyMat, _fxMat, _addExtra, _moveXZ,
 * _stepGait, _face, _distTo, _tryMelee, _decayCommon, _setGlow, _roar, _die,
 * boss-drops) và MẶT NGOÀI boss chuẩn (docs/EXPANSION.md C4):
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
 *   - dispose(): gỡ mọi world-FX + KHÔNG gỡ listener NG+ (mỗi bus một
 *     listener, sống độc lập instance); nếu ĐANG sống → phát
 *     "origin-alive" {alive:false} (freshRun drain — events mở lại scheduler,
 *     P3-K7). Idempotent.
 *
 * NG+ (P3-K9): nghe "ng-plus" {active} trên bus — đơn MỚI tạo áp hp ×1.25
 * (3000 → 3750) / speed ×1.1 (1.6 → 1.76); walker triệu được cũng ×1.25/×1.1
 * (waves.js làm y hệt cho đơn nó spawn). Chỉ listener ĐẦU TIÊN trên MỖI bus
 * instance được đăng ký (WeakMap — createOrigin có thể được gọi nhiều lần).
 *
 * Số builder chọn (đánh dấu để review): scale 2.6, speed base 1.6, melee 30,
 * charge speed 10 m/s, charge contact 1.9 m, rise depth −4.5 m / 2.5 s,
 * acid fall y 12 / 0.8 s, màu skin/cloth/pants 0x3a1418/0x1d0d12/0x120608,
 * charge trigger 20 m (butcher parity — húc chỉ mở khi player trong tầm).
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
import { Zombie } from "./zombie.js";

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
export const ACID_POOL_MAX = 6; // slot vũng sống đồng thời (spitter parity)

/** NG+ hệ số (P3-K9) — áp cho đơn vị MỚI tạo khi "ng-plus" {active:true}. */
export const NG_HP_MUL = 1.25;
export const NG_SPEED_MUL = 1.1;

// --- số builder chọn (§3.3) ---------------------------------------------------

const ORIGIN_SCALE = 2.6; // lớn nhất game (golem 2.2) — "nguồn gốc" mọi zombie
const ORIGIN_SKIN = 0x3a1418; // đỏ bầm gần đen
const ORIGIN_CLOTH = 0x1d0d12;
const ORIGIN_PANTS = 0x120608;
/** Húc chỉ mở khi player trong tầm này (butcher parity — builder chọn). */
const CHARGE_TRIGGER = 20;

/** def cho BossZombie (id/score/khối lượng cơ thể; hp/speed ghi đè sau super). */
const ORIGIN_DEF = {
  id: "origin",
  hp: ORIGIN_MAX_HP,
  speed: ORIGIN_BASE_SPEED,
  scale: ORIGIN_SCALE,
  meleeDmg: ORIGIN_MELEE_DMG,
  score: ORIGIN_SCORE,
  skin: ORIGIN_SKIN,
  cloth: ORIGIN_CLOTH,
  pants: ORIGIN_PANTS,
};

// --- shared FX geometries (một lần mỗi trang, hệ bosses.js) -------------------
// Materials là per-instance qua _fxMat (dọn theo boss); geometry dùng chung.

let sharedOriginGeo = null;
function originGeometries() {
  if (!sharedOriginGeo) {
    sharedOriginGeo = {
      drop: new THREE.SphereGeometry(0.35, 8, 6), // giọt mưa acid (to hơn spit)
      pool: new THREE.CircleGeometry(1, 24), // vũng acid — scale = bán kính
      ring: new THREE.RingGeometry(0.92, 1.0, 48), // sóng slam/xung kích
    };
  }
  return sharedOriginGeo;
}

// Reused scratch — per-frame path KHÔNG cấp phát (P1 §3.7 / P2 §3.8).
const scratchPos = new THREE.Vector3();
const WHITE = new THREE.Color(0xffffff);

/** @param {number} v */
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// --- NG+ flag (P3-K9) — MỖI bus instance một listener duy nhất ----------------

/** Cờ toàn cục đọc lúc TẠO đơn vị mới (waves.js giữ cờ riêng cho đường nó). */
let ngPlusActive = false;
/** @type {WeakMap<EventTarget, true>} */
const ngBusSeen = new WeakMap();

/** @param {EventTarget} bus */
function ensureNgListener(bus) {
  if (!bus || typeof bus.addEventListener !== "function") return;
  if (ngBusSeen.has(bus)) return;
  ngBusSeen.set(bus, true);
  bus.addEventListener("ng-plus", (e) => {
    const d = e && /** @type {CustomEvent} */ (e).detail ? /** @type {CustomEvent} */ (e).detail : {};
    ngPlusActive = d.active === true;
  });
}

// --- class ---------------------------------------------------------------------

/**
 * Boss cuối. Vòng đời: rising → fight (P1→P2→P3 theo máu) → dead. Bất tử
 * trong rising/transition; chết đi qua đường takeDamage chuẩn của Zombie
 * (super._die) rồi bắn chuỗi event "origin-alive"/"origin-defeated".
 */
class Origin extends BossZombie {
  /**
   * @param {import("three").Scene} scene
   * @param {EventTarget} bus
   * @param {import("../world/city.js").City} city - theo hợp đồng (không dùng
   *   trực tiếp — trận ở (0,0), vault do main mở trước khi tạo).
   */
  constructor(scene, bus, city) {
    void city; // chữ ký frozen — giữ cho hợp đồng, không đọc
    // BossZombie dựng model brute + recolor theo def; wave 1 (hp bị ghi đè
    // ngay dưới đây — Origin KHÔNG nhân ×(1+wave/20), §3.1).
    super(scene, 1, scratchPos.set(0, 0, 0), bus, ORIGIN_DEF);

    // Ghi đè số lượng: hp phẳng 3000 (NG+ 3750), speed 1.6 (NG+ 1.76) — P3-K9
    // nhân TRƯỚC, phase P3 nhân ×1.5 lên _baseSpeed (đúng thứ tự hợp đồng).
    this.maxHp = Math.round(ORIGIN_MAX_HP * (ngPlusActive ? NG_HP_MUL : 1));
    this.hp = this.maxHp;
    /** speed nền của trận này — P3 chỉ là ×speedMul trên giá trị này. */
    this._baseSpeed = ORIGIN_BASE_SPEED * (ngPlusActive ? NG_SPEED_MUL : 1);
    this.speed = this._baseSpeed;

    // Bắt đầu ĐÚNG vị trí trổi dậy — nhóm chìm 4.5 m NGAY từ constructor
    // (không đợi update đầu tiên, kẻo đứng lùn ở (0,0) một frame).
    this.group.position.y = -RISE_DEPTH;

    /** @type {"P1"|"P2"|"P3"} phase hiện tại (surface công khai). */
    this.phase = "P1";
    /** @type {"rising"|"fight"|"transition"|"dead"} vòng đời trong trận. */
    this.state = "rising";

    // Fight bookkeeping.
    this._fightTime = 0; // giây từ khi rise xong (dt-driven — pause-safe)
    this._damageTaken = 0; // tổng dmg toàn trận → "origin-defeated"
    this._announceOff = true; // "origin-alive" false đi ra ĐÚNG MỘT lần
    this._riseT = 0;
    this._riseRoared = false;
    this._transT = 0;

    // Cooldowns — "first" được arm lúc vào phase (§3.2: đòn đầu = first).
    this._slamCd = 0;
    this._summonCd = 0;
    this._acidCd = 0; // armed khi vào P2
    this._chargeCd = 0; // armed khi vào P2
    this._shockCd = 0; // armed khi vào P3

    // Húc: telegraph (>= 0 → đang đứng yên phát sáng) rồi cùa thẳng.
    this._telegraphT = -1;
    /** @type {{dx: number, dz: number, left: number, hit: boolean}|null} */
    this._charge = null;

    // World FX slots (pool — tái dùng qua các lần cast, không cấp phát/frame).
    /** @type {{mesh: THREE.Mesh, mat: THREE.Material, x: number, z: number,
     *          t: number, time: number, radius: number, hit: boolean}|null} */
    this._slam = null;
    /** @type {{mesh: THREE.Mesh, mat: THREE.Material, x: number, z: number,
     *          t: number, time: number, radius: number, hit: boolean}|null} */
    this._shock = null;
    /** @type {{mesh: THREE.Mesh, on: boolean, x: number, z: number}[]} */
    this._drops = [];
    /** @type {{mesh: THREE.Mesh, mat: THREE.Material, t: number, tickT: number}[]} */
    this._pools = [];
    /** @type {{mesh: THREE.Mesh, mat: THREE.Material, t: number, tickT: number}[]} */
    this._poolFree = [];

    // Báo cho events.js đóng băng scheduler NGAY (cả trong 2.5 s rise — §3.5).
    this._emit("origin-alive", { alive: true });
  }

  /** Bus emit helper (mọi listener đều theo hợp đồng §7.1). */
  _emit(name, detail) {
    if (this.bus && typeof this.bus.dispatchEvent === "function") {
      this.bus.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }

  /**
   * Cooldown của đòn TIẾP theo sau khi cast: ×0.7 trong P3 (§3.2). Shockwave
   * là đòn P3 (cd 3.0 đã là giá trị P3) — không nhân nữa.
   * @param {number} base
   * @param {boolean} [mul=true]
   * @returns {number}
   */
  _cd(base, mul = true) {
    return mul && this.phase === "P3" ? base * ORIGIN_PHASES.P3.cooldownMul : base;
  }

  /**
   * Look sau transition/húc: P3 giữ đỏ (_setGlow true) tới chết, còn lại tắt.
   * P3 buộc re-apply (blink cuối để emissive ở base — _setGlow(true) đơn thuần
   * early-return vì _glowing đã true từ transition entry).
   */
  _applyPhaseLook() {
    if (this.phase === "P3") {
      if (this._glowing) this._setGlow(false); // force: không early-return
      this._setGlow(true);
    } else {
      this._setGlow(false);
    }
  }

  // --- per-frame ---------------------------------------------------------------

  /**
   * @override rising/transition là state riêng — fight chạy qua _act, chết
   * qua _deathStep (override riêng cho animation 3 s).
   */
  update(dt, player, level, others) {
    if (this._gone || !Number.isFinite(dt) || dt <= 0) return;
    if (!this.alive) {
      this._deathStep(dt);
      return;
    }
    if (this.state === "rising") {
      this._riseStep(dt);
      return;
    }
    this._fightTime += dt; // fight + transition đều tính vào timeSec (§3.1)
    if (this.state === "transition") {
      this._transitionStep(dt);
      return;
    }
    this._act(dt, player, level, others);
  }

  /** Spawn 2.5 s: −4.5 → 0 ease-out, gầm tại t≈0.5 s, xong vào fight/P1. */
  _riseStep(dt) {
    this._riseT += dt;
    const p = Math.min(1, this._riseT / RISE_TIME);
    const e = 1 - (1 - p) * (1 - p) * (1 - p); // cubic ease-out
    this.group.position.y = -RISE_DEPTH * (1 - e);
    if (!this._riseRoared && this._riseT >= 0.5) {
      this._riseRoared = true;
      this._roar("rise"); // "boss-roar" {type:"origin", action:"rise"} (§7.1)
    }
    if (p >= 1) {
      this.group.position.y = 0;
      this.state = "fight";
      this.phase = "P1";
      this._slamCd = ORIGIN_PHASES.P1.slam.first;
      this._summonCd = ORIGIN_PHASES.P1.summon.first;
    }
  }

  /** Phase transition 1.5 s: bất tử + nhấp nháy TRẮNG ×3 nhịp (§3.2). */
  _transitionStep(dt) {
    this._decayCommon(dt); // decay attackCd/anim; flashT đã bị chặn ở cửa
    this._transT += dt;
    const p = Math.min(1, this._transT / TRANSITION_TIME);
    const k = Math.abs(Math.sin(p * Math.PI * 3)); // 3 nhịp trong 1.5 s
    for (let i = 0; i < this._mats.length; i++) {
      if (i === this._eyeMatIndex) continue; // mắt giữ glow đỏ cam riêng
      this._mats[i].emissive.setHex(this._baseEmissive[i]).lerp(WHITE, k);
    }
    if (p >= 1) {
      this.state = "fight";
      this._applyPhaseLook(); // P3 → đỏ đậm giữ đến chết; còn lại về base
    }
  }

  /** Vào phase mới: đặt phase + bất tử 1.5 s + roar + shake + arm "first". */
  _enterTransition(next) {
    this.phase = next;
    this.state = "transition";
    this._transT = 0;
    this.flashT = 0; // nhấp nháy trắng sở hữu emissive từ đây
    // Hủy telegraph/húc dang dở — boss ĐỨNG YÊN trong transition (§3.2);
    // cùa tiếp sau 1.5 s nhấp nháy là đòn "miễn phí" không có trong spec.
    // (_applyPhaseLook khôi phục glow đúng phase, kể cả húc đang phát sáng.)
    this._telegraphT = -1;
    this._charge = null;
    this._applyPhaseLook();
    this._roar("phase");
    this._emit("origin-shake", { power: 1 }); // main → explosives.shake(1) P3-K8
    if (next === "P2") {
      this._acidCd = ORIGIN_PHASES.P2.acidRain.first;
      this._chargeCd = ORIGIN_PHASES.P2.charge.first;
    } else if (next === "P3") {
      this.speed = this._baseSpeed * ORIGIN_PHASES.P3.speedMul; // ×1.5
      this._shockCd = ORIGIN_PHASES.P3.shockwave.first;
    }
  }

  /**
   * Fight brain: chase cơ bản (base update — steering + melee 30 + voice +
   * animation) + cast các đòn theo phase. Telegraph/húc tách nhánh như
   * butcher (bosses.js:465-488); ring/pool/drops tick MỖI frame fight.
   */
  _act(dt, player, level, others) {
    const canAct = !!(player && player.position && player.alive !== false);
    // Cooldowns đếm liên tục khi trận sống (§3.2 "cd tính từ lần trước") —
    // kể cả trong telegraph/húc, nên nhịp đòn không bị kéo dài khi né.
    if (canAct) {
      this._slamCd -= dt;
      this._summonCd -= dt;
      this._acidCd -= dt;
      this._chargeCd -= dt;
      this._shockCd -= dt;
    }
    if (this._telegraphT >= 0) {
      this._telegraphStep(dt, player);
    } else if (this._charge) {
      this._chargeStep(dt, player, level);
    } else {
      Zombie.prototype.update.call(this, dt, player, level, others);
      if (canAct) this._castAttacks(player, level);
    }
    this._updateRings(dt, player);
    this._updateAcid(dt, player, level);
  }

  /** Các đòn cast tại chỗ — chỉ khi đang chase (không giữa telegraph/húc). */
  _castAttacks(player, level) {
    // P1+ ĐẬP ĐẤT (mọi phase).
    if (this._slamCd <= 0) {
      this._slamCd = this._cd(ORIGIN_PHASES.P1.slam.cd); // P3: 5.0 → 3.5
      this._startSlam();
    }
    // P1+ TRIỆU 4 walker.
    if (this._summonCd <= 0) {
      this._summonCd = this._cd(ORIGIN_PHASES.P1.summon.cd); // P3: 12 → 8.4
      this._summon(level);
    }
    // P2+ MƯA ACID.
    if (this.phase !== "P1" && this._acidCd <= 0) {
      this._acidCd = this._cd(ORIGIN_PHASES.P2.acidRain.cd); // P3: 9 → 6.3
      this._startAcidRain(player, level);
    }
    // P2+ HÚC (telegraph 0.7 s → cùa 12 m).
    if (
      this.phase !== "P1" &&
      this._chargeCd <= 0 &&
      this._distTo(player.position.x, player.position.z) < CHARGE_TRIGGER
    ) {
      this._chargeCd = this._cd(ORIGIN_PHASES.P2.charge.cd); // P3: 8 → 5.6
      this._telegraphT = 0;
      this._setGlow(true); // telegraph phát sáng đỏ (§3.2)
      this._roar("attack");
    }
    // P3 SÓNG XUNG KÍCH.
    if (this.phase === "P3" && this._shockCd <= 0) {
      this._shockCd = this._cd(ORIGIN_PHASES.P3.shockwave.cd, false); // 3.0
      this._startShockwave();
    }
  }

  // --- đập đất / sóng xung kích (hệ golem bosses.js:941-994) -------------------

  _startSlam() {
    this._roar("attack");
    const S = ORIGIN_PHASES.P1.slam;
    this._startRing("_slam", 0xff7733, 0xb03c10, S.radius, S.time);
  }

  _startShockwave() {
    this._roar("attack");
    const S = ORIGIN_PHASES.P3.shockwave;
    this._startRing("_shock", 0xff3b30, 0x8a1408, S.radius, S.time);
  }

  /**
   * NỞ/lai tái dùng một ring slot; slot lưu luôn thông số để _updateRing
   * dùng chung (không cấp phát khi cast lại).
   * @param {"_slam"|"_shock"} slot
   * @param {number} color
   * @param {number} emissive
   * @param {number} radius
   * @param {number} time
   */
  _startRing(slot, color, emissive, radius, time) {
    const geo = originGeometries();
    let r = /** @type {any} */ (this)[slot];
    if (!r) {
      const mat = this._fxMat({
        color,
        emissive,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo.ring, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 1;
      r = /** @type {any} */ (this)[slot] = { mesh, mat, x: 0, z: 0, t: 0, time, radius, hit: false };
    }
    r.t = 0;
    r.hit = false;
    r.time = time;
    r.radius = radius;
    r.x = this.position.x;
    r.z = this.position.z;
    r.mesh.position.set(r.x, 0.2, r.z);
    r.mesh.scale.setScalar(0.4);
    r.mesh.visible = true;
    this._addExtra(r.mesh);
  }

  /**
   * Ring nở; player bị quét ĐÚNG 1 LẦN khi ring chạm (§3.2). `lift` = 0 với
   * sóng xung kích (KHÔNG hất bay), slam = hất bay velocity.y 8.
   */
  _updateRing(r, dt, player, dmg, lift, push) {
    if (!r || !r.mesh || !r.mesh.visible) return;
    r.t += dt;
    const p = Math.min(1, r.t / r.time);
    const radius = 0.4 + (r.radius - 0.4) * p;
    r.mesh.scale.setScalar(radius);
    r.mat.opacity = 0.85 * (1 - p * 0.6);
    if (p >= 1) {
      r.mesh.visible = false;
      this._removeExtra(r.mesh);
      return;
    }
    if (r.hit || !player || !player.position || player.alive === false) return;
    const dx = player.position.x - r.x;
    const dz = player.position.z - r.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1e-6;
    if (d > radius) return;
    r.hit = true; // quét đúng 1 lần
    if (typeof player.damage === "function") player.damage(dmg);
    if (player.velocity) {
      if (lift > 0) player.velocity.y = lift;
      player.velocity.x += (dx / d) * push;
      player.velocity.z += (dz / d) * push;
    }
  }

  _updateRings(dt, player) {
    const S = ORIGIN_PHASES.P1.slam;
    this._updateRing(this._slam, dt, player, S.dmg, S.lift, S.push);
    const W = ORIGIN_PHASES.P3.shockwave;
    this._updateRing(this._shock, dt, player, W.dmg, 0, 0);
  }

  // --- triệu hồi (hệ screamer bosses.js:835-858) --------------------------------

  /** 4 walker quanh mình bán kính 2.5 m; NG+ áp cho đơn mới (P3-K9). */
  _summon(level) {
    if (!this._scene) return;
    const S = ORIGIN_PHASES.P1.summon;
    const canTest = !!(level && typeof level.isBlocked === "function");
    for (let i = 0; i < S.count; i++) {
      // Jitter ring, skip blocked samples; fallback = chỗ đứng của Origin.
      let x = this.position.x;
      let z = this.position.z;
      for (let a = 0; a < 6; a++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = S.ring * (0.5 + Math.random() * 0.5);
        const jx = this.position.x + Math.cos(ang) * rad;
        const jz = this.position.z + Math.sin(ang) * rad;
        if (!canTest || !level.isBlocked(jx, jz, 0.4)) {
          x = jx;
          z = jz;
          break;
        }
      }
      const minion = new Zombie(this._scene, "walker", scratchPos.set(x, 0, z), this.bus);
      if (ngPlusActive) {
        minion.hp = Math.round(minion.hp * NG_HP_MUL);
        minion.speed = minion.speed * NG_SPEED_MUL;
      }
      minion.summoned = true; // waves.js đếm cho wave-clear (hệ screamer)
      this._emit("zombie-spawned", { zombie: minion });
    }
  }

  // --- mưa acid (hệ spitter bosses.js:702-763) -----------------------------------

  /** 5 điểm rơi NGẪU NHIÊN ≤ 15 m quanh player; skip blocked; fallback xa nhất. */
  _startAcidRain(player, level) {
    if (!player || !player.position) return;
    const A = ORIGIN_PHASES.P2.acidRain;
    const geo = originGeometries();
    const canTest = !!(level && typeof level.isBlocked === "function");
    for (let i = 0; i < A.drops; i++) {
      // 6 mẫu jitter mỗi giọt (bán kính √-uniform trong 2..scatter — dày gần
      // tâm); mẫu không blocked đầu tiên thắng, hết sạch → mẫu XA NHẤT
      // (events.js:506-524 fallback pattern).
      let bx = 0;
      let bz = 0;
      let found = false;
      let farR = -1;
      let fx = 0;
      let fz = 0;
      for (let a = 0; a < 6; a++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 2 + (A.scatter - 2) * Math.sqrt(Math.random());
        const jx = player.position.x + Math.cos(ang) * rad;
        const jz = player.position.z + Math.sin(ang) * rad;
        if (!found && (!canTest || !level.isBlocked(jx, jz, 0.4))) {
          bx = jx;
          bz = jz;
          found = true;
          break;
        }
        if (rad > farR) {
          farR = rad;
          fx = jx;
          fz = jz;
        }
      }
      if (!found) {
        bx = fx;
        bz = fz;
      }
      // Pool giọt: tái dùng slot off; pool đầy dĩ nhiên không xảy ra (5 giọt
      // / cast, rơi 0.8 s < cd ngắn nhất 6.3 s) — vẫn chặn mọc vô hạn.
      let drop = null;
      for (let d = 0; d < this._drops.length; d++) {
        if (!this._drops[d].on) {
          drop = this._drops[d];
          break;
        }
      }
      if (!drop) {
        if (this._drops.length >= A.drops) continue;
        const mat = this._fxMat({ color: 0x9adf3a, emissive: 0x3f6e0a });
        drop = { mesh: this._addExtra(new THREE.Mesh(geo.drop, mat)), on: false, x: 0, z: 0 };
        this._drops.push(drop);
      }
      drop.on = true;
      drop.x = bx;
      drop.z = bz;
      drop.mesh.position.set(bx, A.fallY, bz);
      drop.mesh.visible = true;
    }
  }

  /** Giọt rơi thẳng (12 m / 0.8 s) → vũng; vũng tick 3 dmg / 0.5 s trong 4 s. */
  _updateAcid(dt, player, level) {
    void level; // isBlocked đã lọc lúc chọn điểm rơi
    const A = ORIGIN_PHASES.P2.acidRain;
    const fallSpeed = A.fallY / A.fallT; // 15 m/s — thẳng, không phải parabol
    for (let i = 0; i < this._drops.length; i++) {
      const d = this._drops[i];
      if (!d.on) continue;
      d.mesh.position.y -= fallSpeed * dt;
      if (d.mesh.position.y <= 0.08) {
        d.on = false;
        d.mesh.visible = false;
        this._spawnPool(d.x, d.z);
      }
    }
    for (let i = this._pools.length - 1; i >= 0; i--) {
      const p = this._pools[i];
      p.t -= dt;
      if (p.t <= 0) {
        p.mesh.visible = false;
        this._removeExtra(p.mesh);
        this._poolFree.push(p);
        this._pools.splice(i, 1);
        continue;
      }
      if (p.t < 0.5) p.mat.opacity = 0.75 * (p.t / 0.5); // fade đuôi
      p.tickT -= dt;
      if (p.tickT > 0) continue;
      p.tickT += ACID_POOL_TICK;
      if (
        player &&
        player.position &&
        player.alive !== false &&
        typeof player.damage === "function"
      ) {
        const dx = player.position.x - p.mesh.position.x;
        const dz = player.position.z - p.mesh.position.z;
        if (dx * dx + dz * dz < ACID_POOL_RADIUS * ACID_POOL_RADIUS) {
          player.damage(ACID_POOL_DPS * ACID_POOL_TICK); // 3 dmg mỗi 0.5 s
        }
      }
    }
  }

  /** Vũng acid tại (x, z) — recycle slot cũ nhất khi đầy (hệ spitter). */
  _spawnPool(x, z) {
    const geo = originGeometries();
    let pool = this._poolFree.pop();
    if (!pool) {
      if (this._pools.length >= ACID_POOL_MAX) {
        pool = this._pools.shift(); // recycle oldest (phòng hờ hiếm gặp)
        this._removeExtra(pool.mesh);
      } else {
        const mat = this._fxMat({
          color: 0x86c832,
          emissive: 0x2f5c0a,
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo.pool, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 1;
        pool = { mesh, mat, t: 0, tickT: 0 };
      }
      pool.mesh.scale.setScalar(ACID_POOL_RADIUS);
    }
    pool.mesh.position.set(x, 0.06, z); // vừa trên sàn
    pool.mesh.visible = true;
    pool.mat.opacity = 0.75;
    pool.t = ACID_POOL_LIFE;
    pool.tickT = ACID_POOL_TICK / 2; // tick đầu đến nhanh
    this._addExtra(pool.mesh);
    this._pools.push(pool);
  }

  // --- húc (hệ butcher bosses.js:465-545) -----------------------------------------

  /** Telegraph 0.7 s: đứng yên + phát sáng + quay theo player, rồi khóa hướng. */
  _telegraphStep(dt, player) {
    this._decayCommon(dt);
    this._telegraphT += dt;
    let dx = 0;
    let dz = 0;
    if (player && player.position && player.alive !== false) {
      dx = player.position.x - this.position.x;
      dz = player.position.z - this.position.z;
      this._face(dx, dz, dt);
    }
    this._stepGait(0, dt);
    if (this._telegraphT < ORIGIN_PHASES.P2.charge.telegraph) return;
    this._telegraphT = -1;
    this._applyPhaseLook(); // tắt telegraph glow; P3 giữ đỏ
    if (!player || !player.position || player.alive === false) return; // húc vào hư không
    const d = Math.sqrt(dx * dx + dz * dz) || 1e-6;
    const C = ORIGIN_PHASES.P2.charge;
    this._charge = { dx: dx / d, dz: dz / d, left: C.dist, hit: false };
  }

  /** Cùa thẳng: chạm player < 1.9 m → 35 dmg + knockback; hết 12 m/tường → dừng. */
  _chargeStep(dt, player, level) {
    const c = this._charge;
    if (!c) return;
    const C = ORIGIN_PHASES.P2.charge;
    this._decayCommon(dt);
    const moved = this._moveXZ(c.dx * C.speed, c.dz * C.speed, dt, level);
    this._face(c.dx, c.dz, dt);
    this._stepGait(moved, dt);
    c.left -= moved;
    if (
      !c.hit &&
      player &&
      player.position &&
      player.alive !== false &&
      this._distTo(player.position.x, player.position.z) < C.contact
    ) {
      c.hit = true;
      if (typeof player.damage === "function") player.damage(C.dmg);
      if (player.velocity) {
        player.velocity.x += c.dx * C.knock;
        player.velocity.z += c.dz * C.knock;
        player.velocity.y += C.lift;
      }
      this._endCharge();
      return;
    }
    // Tường (hầu như không đi được) hoặc hết 12 m → về chase.
    if (c.left <= 0 || moved < C.speed * dt * 0.2) this._endCharge();
  }

  _endCharge() {
    this._charge = null;
    this._applyPhaseLook();
  }

  // --- damage + chết ---------------------------------------------------------------

  /**
   * @override Bất tử khi rising/transition/dead (§3.1 — trả false KHÔNG giảm).
   * Không có golem-reduce. Đòn thường tích vào damageTaken; rơi qua ngưỡng
   * phase → transition (§3.2 — tính trên hp/maxHp TẠI đòn này).
   */
  takeDamage(d, headshot) {
    if (this.state === "rising" || this.state === "transition") return false;
    if (!this.alive) return false;
    const n = Number(d);
    if (!Number.isFinite(n) || n <= 0) return false;
    this._damageTaken += n;
    const killed = super.takeDamage(n, headshot);
    if (killed) return true; // _die đã chạy đủ chuỗi event (§3.1)
    const ratio = this.hp / this.maxHp;
    if (this.phase === "P1") {
      if (ratio <= ORIGIN_PHASE_P3) this._enterTransition("P3"); // nhảy cóc P2
      else if (ratio <= ORIGIN_PHASE_P2) this._enterTransition("P2");
    } else if (this.phase === "P2") {
      if (ratio <= ORIGIN_PHASE_P3) this._enterTransition("P3");
    }
    return false;
  }

  /**
   * @override Chuỗi event kết liễu ĐÚNG THỨ TỰ (§3.1) — super._die phát
   * "zombie-killed" {type:"origin", score:5000, headshot, position} +
   * "boss-drops" + death voice; rồi "origin-alive" {alive:false};
   * "origin-shake" {power:2}; "origin-defeated" {timeSec, damageTaken}.
   */
  _die(headshot) {
    super._die(headshot);
    this.state = "dead";
    this._glowing = false; // P3 đỏ không sống sót qua fade (mats đã về 0)
    this._announceOff = false;
    this._emit("origin-alive", { alive: false });
    this._emit("origin-shake", { power: 2 });
    this._emit("origin-defeated", {
      timeSec: Math.round(this._fightTime * 10) / 10, // 1 chữ số thập phân
      damageTaken: Math.round(this._damageTaken),
    });
  }

  /**
   * @override KHÔNG dùng fall 1.5 s của zombie thường (§3.1): đứng tại chỗ,
   * nghiêng chậm ~63° + chìm + fade trải đều 3.0 s, xong _finishDespawn
   * (giữ "zombie-despawned" + dọn FX qua BossZombie).
   */
  _deathStep(dt) {
    if (this.deathT < 0) return;
    this.deathT += dt;
    const t = this.deathT;
    // Nghiêng chậm toàn bộ 3 s (ease-out đến ~63° — tường 1.1 rad).
    const tilt = Math.min(1, t / DEATH_ANIM_TIME);
    this.group.rotation.x = 1.1 * (1 - (1 - tilt) * (1 - tilt));
    // Chìm sâu hơn base (scale 2.6 — thân dài ~4.7 m) sau 0.8 s, smoothstep.
    const sink = clamp01((t - 0.8) / (DEATH_ANIM_TIME - 0.8));
    this.position.y = -2.2 * (sink * sink * (3 - 2 * sink));
    // Fade nửa sau.
    const op = 1 - clamp01((t - 1.5) / 1.5);
    for (let i = 0; i < this._mats.length; i++) this._mats[i].opacity = op;
    if (t >= DEATH_ANIM_TIME) this._finishDespawn();
  }

  /**
   * @override Dọn world-FX (rings/pools/drops qua _cleanupExtras) + base
   * teardown; đang sống → "origin-alive" {alive:false} ĐÚNG MỘT LẦN
   * (freshRun drain — events.js mở lại scheduler, P3-K7). Idempotent.
   * Listener NG+ KHÔNG gỡ — nó gắn theo bus, không theo instance.
   */
  dispose() {
    const wasLive = this.alive === true && this._announceOff;
    if (wasLive) {
      this._announceOff = false;
      this._emit("origin-alive", { alive: false });
    }
    this.alive = false;
    super.dispose(); // BossZombie: _cleanupExtras + Zombie._teardown (idempotent)
  }
}

/**
 * Factory boss cuối — chữ ký frozen (docs/EXPANSION-P3.md §3.1).
 *
 * @param {import("three").Scene} scene
 * @param {EventTarget} bus
 * @param {import("../world/city.js").City} city
 * @returns {Origin}
 */
export function createOrigin(scene, bus, city) {
  ensureNgListener(bus); // mỗi bus MỘT listener — gọi nhiều lần vô hại
  return new Origin(scene, bus, city);
}
