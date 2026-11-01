/**
 * ============================================================================
 * SIDE CONTRACTS — rotating jobs pinned to the Safehouse Contract Board.
 * ============================================================================
 * Three active slots, eight possible contracts in the pool. The board itself
 * (world props + overlay) lives in src/ui/contracts.js; this module owns only
 * state, progression, rewards and the bus contract, so it runs headless.
 *
 * POOL (3 slots, no duplicate ids at any time)
 *   crawler_cull        kill 8 crawlers                          $450
 *   brute_force         kill 2 brutes                            $500
 *   headhunter          12 headshot kills                        $550
 *   boss_contract       kill any boss (5 types)                  $900
 *   district_sweep      kill 15 regular zombies while standing in
 *                       Residential / Commercial / Hospital      $600
 *   bloodmoon_survivor  survive one bloodmoon for >= 45 s        $650
 *   elite_hunter        kill 3 elite zombies                     $700
 *   wave_runner         reach wave 8 (or clear eight waves)      $750
 *
 * ROTATION
 * - A fresh run starts with 3 random, non-duplicate contracts.
 * - Every 3rd "wave-clear" the board refreshes: completed slots are replaced,
 *   in-progress slots stay exactly as they are. When all 3 are complete the
 *   NEXT wave-clear refreshes immediately instead of waiting for the 3rd.
 * - "refresh()" forces the same fill-missing-slots routine. Contracts never
 *   expire because of time; only completion frees a slot.
 *
 * BUS (consumed)
 *   "zombie-killed"    {type, headshot, elite}
 *   "bloodmoon-active" {active, reason?}  — a run of >= 45 s completes the
 *                                           bloodmoon contract; reason
 *                                           "reset" never completes it.
 *   "wave-start"       {n}                — wave_runner also counts here.
 *   "wave-clear"       {n}                — progress + every-3rd rotation.
 *   "ui-quit"          {}                 — defensive fresh-run reset.
 *
 * BUS (emitted)
 *   "contract-progress" {id, done, need}  — on every progress change.
 *   "contract-complete" {id, reward, xp}  — once per contract; the reward is
 *                                           paid through economy.add() here.
 *   "contracts-changed" {}                — refresh() / reset() (board rerolled).
 *
 * STATE
 *   state() → {
 *     contracts: [{id, titleKey, descKey, type, need, done, reward, xp,
 *                  complete}],
 *     completed: number,          // total completed this run
 *     board: {x, z}               // actual board anchor (set by the UI)
 *   }
 *
 * The UI samples the player position every frame through the additive
 * update(dt, playerPos) below; the district_sweep contract reads that cache.
 * setBoard(x, z) is additive too: the UI owns placement (it has the level)
 * and mirrors the accepted anchor into state().board.
 *
 * @param {EventTarget} bus - shared bus from src/systems/gamestate.js
 * @param {{add: (n: number) => void, get?: () => number}} economy - rewards
 * @param {{position?: {x: number, y?: number, z: number}}} player
 * @returns {Contracts}
 */

/**
 * @typedef {Object} ContractInstance
 * @property {string} id
 * @property {number} done
 * @property {boolean} complete
 * @property {boolean} paid
 */

/**
 * @typedef {Object} Contracts
 * @property {() => {contracts: Array<{id: string, titleKey: string,
 *   descKey: string, type: string, need: number, done: number,
 *   reward: number, xp: number, complete: boolean}>, completed: number,
 *   board: {x: number, z: number}}} state
 * @property {() => void} refresh - replace completed/empty slots; keep progress.
 * @property {(id: string) => boolean} complete - force-complete one active contract.
 * @property {() => void} reset - fresh run: clear progress, reroll 3.
 * @property {(dt: number, playerPos?: {x: number, z: number}) => void} update
 *   ADDITIVE: caches the player's district for district_sweep.
 * @property {(x: number, z: number) => void} setBoard
 *   ADDITIVE: mirrors the UI's validated board anchor into state().board.
 */

/** Contract definition shape used by the pool + the UI. */
export const CONTRACT_POOL = [
  {
    id: "crawler_cull",
    titleKey: "contract_crawler_cull_title",
    descKey: "contract_crawler_cull_desc",
    type: "kill",
    target: "crawler",
    need: 8,
    reward: 450,
    xp: 90,
  },
  {
    id: "brute_force",
    titleKey: "contract_brute_force_title",
    descKey: "contract_brute_force_desc",
    type: "kill",
    target: "brute",
    need: 2,
    reward: 500,
    xp: 110,
  },
  {
    id: "headhunter",
    titleKey: "contract_headhunter_title",
    descKey: "contract_headhunter_desc",
    type: "headshot",
    target: "headshot",
    need: 12,
    reward: 550,
    xp: 140,
  },
  {
    id: "boss_contract",
    titleKey: "contract_boss_contract_title",
    descKey: "contract_boss_contract_desc",
    type: "boss",
    target: "boss",
    need: 1,
    reward: 900,
    xp: 320,
  },
  {
    id: "district_sweep",
    titleKey: "contract_district_sweep_title",
    descKey: "contract_district_sweep_desc",
    type: "district",
    target: "residential|commercial|hospital",
    need: 15,
    reward: 600,
    xp: 170,
  },
  {
    id: "bloodmoon_survivor",
    titleKey: "contract_bloodmoon_survivor_title",
    descKey: "contract_bloodmoon_survivor_desc",
    type: "bloodmoon",
    target: "bloodmoon",
    need: 1,
    reward: 650,
    xp: 180,
  },
  {
    id: "elite_hunter",
    titleKey: "contract_elite_hunter_title",
    descKey: "contract_elite_hunter_desc",
    type: "elite",
    target: "elite",
    need: 3,
    reward: 700,
    xp: 210,
  },
  {
    id: "wave_runner",
    titleKey: "contract_wave_runner_title",
    descKey: "contract_wave_runner_desc",
    type: "wave",
    target: "8",
    need: 8,
    reward: 750,
    xp: 260,
  },
];

/** EN + VI text for the eight contracts (registered by the UI). */
export const CONTRACTS_BUNDLE = {
  en: {
    contract_crawler_cull_title: "Crawler Cull",
    contract_crawler_cull_desc: "Put down 8 crawlers. They keep coming on their hands.",
    contract_brute_force_title: "Brute Force",
    contract_brute_force_desc: "Break 2 brutes. Bring something heavier than a pistol.",
    contract_headhunter_title: "Headhunter",
    contract_headhunter_desc: "Land 12 headshot kills. One bullet each.",
    contract_boss_contract_title: "Boss Contract",
    contract_boss_contract_desc: "Kill any boss: Butcher, Spitter, Screamer, Golem or Origin.",
    contract_district_sweep_title: "District Sweep",
    contract_district_sweep_desc: "Kill 15 zombies while standing in Residential, Commercial or Hospital.",
    contract_bloodmoon_survivor_title: "Blood Moon Survivor",
    contract_bloodmoon_survivor_desc: "Stay alive through one blood moon for at least 45 seconds.",
    contract_elite_hunter_title: "Elite Hunter",
    contract_elite_hunter_desc: "Kill 3 elite zombies. They hit harder and pay better.",
    contract_wave_runner_title: "Wave Runner",
    contract_wave_runner_desc: "Reach wave 8, or clear eight waves.",
  },
  vi: {
    contract_crawler_cull_title: "Dọn Bò Sát",
    contract_crawler_cull_desc: "Hạ 8 con bò sát. Chúng cứ bò tới bằng hai tay.",
    contract_brute_force_title: "Vũ Lực",
    contract_brute_force_desc: "Hạ 2 con lực sĩ. Mang thứ mạnh hơn súng lục.",
    contract_headhunter_title: "Săn Đầu",
    contract_headhunter_desc: "Bắn hạ 12 con bằng phát bắn vào đầu. Mỗi con một viên.",
    contract_boss_contract_title: "Hợp Đồng Boss",
    contract_boss_contract_desc: "Hạ bất kỳ boss nào: Đồ Tể, Kẻ Phun Acid, Kẻ Gào Thét, Golem hoặc Nguồn Gốc.",
    contract_district_sweep_title: "Quét Khu",
    contract_district_sweep_desc: "Hạ 15 zombie khi đang đứng ở Khu Dân Cư, Phố Thương Mại hoặc Bệnh Viện.",
    contract_bloodmoon_survivor_title: "Sống Sót Trăng Máu",
    contract_bloodmoon_survivor_desc: "Sống sót qua một đêm trăng máu ít nhất 45 giây.",
    contract_elite_hunter_title: "Săn Tinh Nhuệ",
    contract_elite_hunter_desc: "Hạ 3 zombie tinh nhuệ. Chúng đánh mạnh hơn và trả tiền cao hơn.",
    contract_wave_runner_title: "Chạy Đợt",
    contract_wave_runner_desc: "Tới đợt 8, hoặc dọn sạch tám đợt.",
  },
};

// --- constants --------------------------------------------------------------

const SLOT_COUNT = 3;
const ROTATE_EVERY = 3; // refresh on the 3rd, 6th, 9th … wave clear
const BLOODMOON_MIN_SECONDS = 45;
const DEFAULT_BOARD = { x: -52, z: 12 };

/** Boss types accepted by boss_contract (same set as gamestate/endings). */
const BOSS_TYPES = { butcher: true, spitter: true, screamer: true, golem: true, origin: true };

/** Districts counted by district_sweep. */
const SWEEP_DISTRICTS = { residential: true, commercial: true, hospital: true };

/**
 * District rects mirrored from src/world/city.js (quarantine first, then the
 * six outer districts). Only used to cache the player's district for the
 * district_sweep contract — no world access, no imports.
 */
const DISTRICTS = [
  { id: "quarantine", minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
  { id: "quarantine", minX: -15, maxX: 15, minZ: -54, maxZ: -30 },
  { id: "quarantine", minX: 30, maxX: 54, minZ: -15, maxZ: 15 },
  { id: "safehouse", minX: -130, maxX: -30, minZ: -30, maxZ: 30 },
  { id: "residential", minX: -130, maxX: -15, minZ: -130, maxZ: -30 },
  { id: "commercial", minX: -15, maxX: 130, minZ: -130, maxZ: -54 },
  { id: "hospital", minX: 54, maxX: 130, minZ: -54, maxZ: 30 },
  { id: "park", minX: -15, maxX: 130, minZ: 30, maxZ: 130 },
  { id: "docks", minX: -130, maxX: -15, minZ: 30, maxZ: 130 },
];

/**
 * @param {number} x
 * @param {number} z
 * @returns {string|null}
 */
function districtAt(x, z) {
  for (let i = 0; i < DISTRICTS.length; i++) {
    const r = DISTRICTS[i];
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return r.id;
  }
  return null;
}

/**
 * Build the side-contract state machine.
 * @param {EventTarget} bus
 * @param {{add: (n: number) => void, get?: () => number}} economy
 * @param {{position?: {x: number, z: number}}} player
 * @returns {Contracts}
 */
export function createContracts(bus, economy, player) {
  /** @type {Array<{def: object, done: number, complete: boolean, paid: boolean}|null>} */
  const slots = [null, null, null];

  let completedCount = 0;
  let waveClears = 0;
  let lastWave = 0;
  let bloodmoonStartedAt = 0; // ms via Date.now(); 0 = no active moon
  let lastDistrict = null;
  const board = { x: DEFAULT_BOARD.x, z: DEFAULT_BOARD.z };

  function emit(name, detail) {
    if (!bus || typeof bus.dispatchEvent !== "function") return;
    bus.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /**
   * @param {object} def
   * @returns {{def: object, done: number, complete: boolean, paid: boolean}}
   */
  function makeSlot(def) {
    return { def, done: 0, complete: false, paid: false };
  }

  /**
   * Pick a pool entry not in `exclude`.
   * @param {Set<string>} exclude
   * @returns {object|null}
   */
  function pickDef(exclude) {
    const candidates = [];
    for (let i = 0; i < CONTRACT_POOL.length; i++) {
      if (!exclude.has(CONTRACT_POOL[i].id)) candidates.push(CONTRACT_POOL[i]);
    }
    if (candidates.length === 0) return null;
    const i = Math.floor(Math.random() * candidates.length);
    if (i < 0 || i >= candidates.length) return candidates[0];
    return candidates[i];
  }

  /**
   * Fill every empty/completed slot with a fresh, non-duplicate contract.
   * In-progress slots are never touched.
   * @returns {boolean} true when at least one slot changed.
   */
  function fillSlots() {
    let changed = false;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const current = slots[i];
      if (current && !current.complete) continue;
      const exclude = new Set();
      if (current && current.complete) exclude.add(current.def.id); // no instant repeat
      for (let j = 0; j < SLOT_COUNT; j++) {
        if (j === i) continue;
        const other = slots[j];
        if (other) exclude.add(other.def.id);
      }
      const def = pickDef(exclude);
      slots[i] = def ? makeSlot(def) : null;
      if (def) changed = true;
    }
    return changed;
  }

  function allComplete() {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = slots[i];
      if (!s || !s.complete) return false;
    }
    return true;
  }

  /**
   * @param {string} id
   * @returns {{def: object, done: number, complete: boolean, paid: boolean}|null}
   */
  function findSlot(id) {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = slots[i];
      if (s && s.def.id === id) return s;
    }
    return null;
  }

  /** Pay + announce exactly once for a slot. */
  function completeSlot(slot) {
    if (!slot || slot.complete) return;
    const before = slot.done;
    slot.done = slot.def.need;
    slot.complete = true;
    if (!slot.paid) {
      slot.paid = true;
      completedCount += 1;
      if (economy && typeof economy.add === "function") {
        economy.add(slot.def.reward);
      }
      emit("contract-complete", {
        id: slot.def.id,
        reward: slot.def.reward,
        xp: slot.def.xp,
      });
    }
    // bump() already announced the final progress step; only a direct
    // complete(id) needs to report the jump to done = need.
    if (before < slot.def.need) {
      emit("contract-progress", {
        id: slot.def.id,
        done: slot.done,
        need: slot.def.need,
      });
    }
  }

  /**
   * Add progress to one slot, clamped at `need`.
   * @param {{def: object, done: number, complete: boolean, paid: boolean}} slot
   * @param {number} amount
   */
  function bump(slot, amount) {
    if (!slot || slot.complete) return;
    const step = Number(amount);
    if (!Number.isFinite(step) || step <= 0) return;
    const need = slot.def.need;
    if (slot.done >= need) return;
    slot.done = Math.min(need, slot.done + step);
    emit("contract-progress", { id: slot.def.id, done: slot.done, need });
    if (slot.done >= need) completeSlot(slot);
  }

  /** Advance the wave progress of wave_runner (done = highest wave, capped). */
  function noteWave(n) {
    const wave = Number(n);
    if (!Number.isFinite(wave) || wave <= 0) return;
    if (wave > lastWave) lastWave = Math.round(wave);
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = slots[i];
      if (!s || s.complete || s.def.type !== "wave") continue;
      const cap = s.def.need;
      const target = Math.min(cap, Math.max(1, Math.round(wave)));
      if (target > s.done) bump(s, target - s.done);
    }
  }

  /**
   * Refresh replacement slots. Always announces "contracts-changed" because
   * the UI re-reads the board even when every slot is still in progress.
   */
  function refresh() {
    fillSlots();
    emit("contracts-changed");
  }

  /** Fresh run: zero everything and reroll three contracts. */
  function reset() {
    for (let i = 0; i < SLOT_COUNT; i++) slots[i] = null;
    completedCount = 0;
    waveClears = 0;
    lastWave = 0;
    bloodmoonStartedAt = 0;
    lastDistrict = null;
    fillSlots();
    emit("contracts-changed");
  }

  /** Fresh state snapshot; each contract is a new plain object. */
  function state() {
    const contracts = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = slots[i];
      if (!s) continue;
      contracts.push({
        id: s.def.id,
        titleKey: s.def.titleKey,
        descKey: s.def.descKey,
        type: s.def.type,
        need: s.def.need,
        done: s.done,
        reward: s.def.reward,
        xp: s.def.xp,
        complete: s.complete,
      });
    }
    return {
      contracts,
      completed: completedCount,
      board: { x: board.x, z: board.z },
    };
  }

  /** ADDITIVE: the UI's validated anchor (no-op on bad input). */
  function setBoard(x, z) {
    if (Number.isFinite(x) && Number.isFinite(z)) {
      board.x = x;
      board.z = z;
    }
  }

  /**
   * ADDITIVE: sample the player's district once per frame. district_sweep
   * reads this cache when a kill lands.
   * @param {number} dt
   * @param {{x: number, z: number}=} playerPos
   */
  function update(dt, playerPos) {
    void dt;
    const p = playerPos || (player && player.position);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
    lastDistrict = districtAt(p.x, p.z);
  }

  /** Force-complete one active contract (debug / programmatic claims). */
  function complete(id) {
    const slot = findSlot(typeof id === "string" ? id : "");
    if (!slot || slot.complete) return false;
    completeSlot(slot);
    return true;
  }

  // --- bus wiring -------------------------------------------------------------

  if (bus && typeof bus.addEventListener === "function") {
    bus.addEventListener("zombie-killed", (e) => {
      const d = e && e.detail ? e.detail : {};
      const type = typeof d.type === "string" ? d.type : "";
      if (!type) return;
      const boss = BOSS_TYPES[type] === true;
      const regular = !boss;
      const swept = lastDistrict !== null && SWEEP_DISTRICTS[lastDistrict] === true;
      for (let i = 0; i < SLOT_COUNT; i++) {
        const s = slots[i];
        if (!s || s.complete) continue;
        switch (s.def.type) {
          case "kill":
            if (type === s.def.target) bump(s, 1);
            break;
          case "headshot":
            if (d.headshot === true) bump(s, 1);
            break;
          case "boss":
            if (boss) bump(s, 1);
            break;
          case "elite":
            // zombie.js sends the elite KIND string (or null), not a boolean.
            if (d.elite) bump(s, 1);
            break;
          case "district":
            if (regular && swept) bump(s, 1);
            break;
          default:
            break;
        }
      }
    });

    bus.addEventListener("bloodmoon-active", (e) => {
      const d = e && e.detail ? e.detail : {};
      if (d.active === true) {
        if (bloodmoonStartedAt === 0) bloodmoonStartedAt = Date.now();
        return;
      }
      const started = bloodmoonStartedAt;
      bloodmoonStartedAt = 0;
      // A fresh-run reset is not a survived bloodmoon (and must never pay on
      // the way into a new run).
      if (started === 0 || d.reason === "reset") return;
      const elapsed = (Date.now() - started) / 1000;
      if (elapsed < BLOODMOON_MIN_SECONDS) return;
      for (let i = 0; i < SLOT_COUNT; i++) {
        const s = slots[i];
        if (s && !s.complete && s.def.type === "bloodmoon") bump(s, 1);
      }
    });

    bus.addEventListener("wave-start", (e) => {
      const n = e && e.detail ? e.detail.n : NaN;
      noteWave(n);
    });

    bus.addEventListener("wave-clear", (e) => {
      const n = e && e.detail ? e.detail.n : NaN;
      waveClears += 1;
      noteWave(n);
      if (waveClears % ROTATE_EVERY === 0 || allComplete()) refresh();
    });

    bus.addEventListener("ui-quit", () => reset());
  }

  // Fresh slots for the first run (main.js calls reset() in freshRun too —
  // both paths are idempotent).
  fillSlots();

  return { state, refresh, complete, reset, update, setBoard };
}
