/**
 * Zones — the two expansion areas attached to the main arena (EXPANSION
 * feature C1; contract: docs/EXPANSION.md).
 *
 * createZones(scene, level)
 *   → { list, unlockForWave(wave) → string[], bossAnchorFor(wave)
 *       → {zoneId, x, z}, reset() }
 *
 * NOTE on the frozen signature: createZones takes NO bus parameter — this
 * module imports the shared `bus` directly from ../systems/gamestate.js
 * (the same pattern src/core/input.js uses).
 *
 * The map grows by TWO areas joined to the 60×60 main arena through GAPS in
 * the perimeter fence (each gap gets a GLOWING GATE FRAME + ICON — level.js
 * builds the geometry, see feature C2):
 *
 *   id      name        size      side        cover                    unlock
 *   "north" "Sân sau"   ~30×24 m  north       wooden crates + wrecked  after clearing wave 2
 *                                             car
 *   "east"  "Kho"       ~24×30 m  east        shelving + containers    after clearing wave 4
 *
 * Each zone declares:
 * - bounds rect {minX, maxX, minZ, maxZ} (meters),
 * - exactly 1 gateWaypoint — a point INSIDE the gate gap (used by zombie
 *   pathing, feature C3),
 * - 2–3 of its OWN spawnPoints,
 * - a bossAnchor (where the boss of a boss wave spawns — feature C5).
 *
 * On unlock: emit "zone-unlocked" {id, name} on the bus (HUD toast).
 * unlockForWave(wave) is IDEMPOTENT — unlocking an already-open zone is a
 * no-op and must not re-emit the event.
 *
 * Bus events consumed:
 * - "wave-clear" {n} → unlockForWave(n) (main.js may also call it directly —
 *   idempotency makes the double wiring safe; each zone unlocks exactly once
 *   per run). NIGHT 30 P1 story-guard (docs/EXPANSION-P1.md §5.6.4): while a
 *   story run is active ("story-mode" {active: true}), this listener does
 *   NOTHING — north/east are the quarantine interior and must stay sealed
 *   until mission 6 (main.js calls unlockForWave directly there). Direct
 *   unlockForWave calls always work; only the wave-clear automation is gated.
 * - "wave-start" {n: 1} → reset(). A fresh run always starts at wave 1, so
 *   this re-locks both zones without emitting events.
 * - "story-mode" {active} (NIGHT 30 P1 §5.6.4/§6) — main.js arms/disarms the
 *   story guard. {active: false} also arrives on every fresh story BEFORE the
 *   resets, per the contract ordering.
 * Bus events emitted: "zone-unlocked" {id, name}.
 *
 * The numbers below MUST stay in sync with src/world/level.js (wall spans,
 * gate gaps, colliders) — createZones runs a one-time dev guard that warns
 * when a declared point is blocked in the built level.
 *
 * @param {import("three").Scene} scene
 * @param {import("../world/level.js").Level} level
 * @returns {Zones}
 */

/**
 * @typedef {Object} Zone
 * @property {"north"|"east"} id
 * @property {string} name - display name (i18n "zone.north" / "zone.east").
 * @property {string} nameKey - i18n key the name resolves from.
 * @property {number} unlockWave - clearing this wave opens the zone.
 * @property {{minX: number, maxX: number, minZ: number, maxZ: number}} bounds
 * @property {{x: number, z: number}} gateWaypoint - inside the gate gap.
 * @property {{x: number, z: number}[]} spawnPoints - 2–3 zone-owned points.
 * @property {{x: number, z: number}} bossAnchor
 * @property {boolean} unlocked - live flag (main/debug read this).
 */

/**
 * @typedef {Object} Zones
 * @property {Zone[]} list - the two zone descriptors (live unlocked flags).
 * @property {(wave: number) => string[]} unlockForWave
 *   Unlock zones earned by clearing `wave` (north: 2, east: 4). Idempotent;
 *   returns the ids unlocked BY THIS CALL (empty array when nothing new).
 * @property {(wave: number) => {zoneId: string, x: number, z: number}} bossAnchorFor
 *   The boss spawn anchor for a boss wave (wave % 5 === 0) among the zones
 *   open at that time (cycles north/east with the boss order).
 * @property {() => void} reset - lock both zones again (fresh run).
 */

import { bus } from "../systems/gamestate.js";
import * as i18n from "../core/i18n.js";

// i18n strings owned by THIS module (feature C8): zone display names + the
// unlock toast label. Nested under "zone.*" so other modules' keys never
// collide; HUD reads t("zone.north") / t("zone.newArea") etc.
i18n.registerBundle({
  en: {
    zone: { north: "Backyard", east: "Warehouse", newArea: "NEW AREA UNLOCKED" },
  },
  vi: {
    zone: { north: "Sân sau", east: "Kho", newArea: "KHU VỰC MỚI MỞ" },
  },
});

/** Static descriptors — MUST match the geometry in src/world/level.js. */
const ZONE_DEFS = [
  {
    id: /** @type {"north"} */ ("north"),
    nameKey: "zone.north",
    unlockWave: 2,
    bounds: { minX: -15, maxX: 15, minZ: -54, maxZ: -30 },
    gateWaypoint: { x: 0, z: -30 }, // inside the north gate gap x ∈ [-2, 2]
    spawnPoints: [{ x: -11, z: -51 }, { x: 11, z: -51 }, { x: 0, z: -44 }],
    bossAnchor: { x: -5, z: -45 },
  },
  {
    id: /** @type {"east"} */ ("east"),
    nameKey: "zone.east",
    unlockWave: 4,
    bounds: { minX: 30, maxX: 54, minZ: -15, maxZ: 15 },
    gateWaypoint: { x: 30, z: 0 }, // inside the east gate gap z ∈ [-2, 2]
    spawnPoints: [{ x: 34, z: -11 }, { x: 34, z: 11 }, { x: 50, z: 2 }],
    bossAnchor: { x: 42, z: 0 },
  },
];

export function createZones(scene, level) {
  void scene; // kept for the frozen signature (future zone-side decoration)

  /** Live lock state, keyed by zone id. */
  const state = { north: false, east: false };

  /** Public list — live `name` (i18n) + `unlocked` views over `state`. */
  const list = ZONE_DEFS.map((d) => ({
    id: d.id,
    nameKey: d.nameKey,
    unlockWave: d.unlockWave,
    bounds: d.bounds,
    gateWaypoint: d.gateWaypoint,
    spawnPoints: d.spawnPoints,
    bossAnchor: d.bossAnchor,
    get name() {
      return i18n.t(d.nameKey);
    },
    get unlocked() {
      return state[d.id];
    },
  }));

  // One-time dev guard: a declared point must be walkable in the built level
  // (catches level.js / zones.js layout drift). Warns, never throws. Runs
  // BEFORE the locks below are applied — a locked zone is sealed in level.js
  // and would report every declared point as blocked.
  if (level && typeof level.isBlocked === "function") {
    for (const z of list) {
      const pts = [
        ["gateWaypoint", z.gateWaypoint],
        ["bossAnchor", z.bossAnchor],
        ...z.spawnPoints.map((p, i) => /** @type {[string, {x: number, z: number}]} */ (["spawn" + i, p])),
      ];
      for (const [what, p] of pts) {
        if (level.isBlocked(p.x, p.z, 0.8)) {
          console.warn("[zones] " + z.id + " " + what + " (" + p.x + ", " + p.z + ") is blocked — level/zones layout drifted");
        }
      }
    }
  }

  // Feature C1 enforcement: push the initial lock state into the level. A
  // locked zone is SEALED there (isBlocked solid across the whole rect, gate
  // gap included) and its spawn points stay out of the wave pool — without
  // this the player could walk through the open gates before wave 2/4 and
  // waves could spawn minions inside an unopened area. unlockForWave/reset
  // keep the two sides in sync below.
  if (level && typeof level.setZoneLocked === "function") {
    for (const z of ZONE_DEFS) level.setZoneLocked(z.id, true);
  }

  /**
   * Unlock every zone whose wave requirement is met. Idempotent: an already
   * open zone never re-emits "zone-unlocked".
   * @param {number} wave
   * @returns {string[]} ids unlocked BY THIS CALL.
   */
  function unlockForWave(wave) {
    const w = Math.floor(Number(wave));
    if (!Number.isFinite(w)) return [];
    const opened = [];
    for (const z of ZONE_DEFS) {
      if (!state[z.id] && w >= z.unlockWave) {
        state[z.id] = true;
        opened.push(z.id);
        // Unseal the zone in the level (gate passable, spawn points back in
        // the wave pool) — see the setZoneLocked sync at construction.
        if (level && typeof level.setZoneLocked === "function") {
          level.setZoneLocked(z.id, false);
        }
        bus.dispatchEvent(
          new CustomEvent("zone-unlocked", {
            detail: { id: z.id, name: i18n.t(z.nameKey) },
          })
        );
      }
    }
    return opened;
  }

  /**
   * Boss anchor for a boss wave: cycle north/east in step with the boss order
   * (wave 5 → north, 10 → east, 15 → north, …). Falls back to the full list
   * when no zone is open yet (debug runs).
   * @param {number} wave
   * @returns {{zoneId: string, x: number, z: number}}
   */
  function bossAnchorFor(wave) {
    const w = Math.floor(Number(wave));
    const idx = Number.isFinite(w) && w > 0 ? Math.max(0, Math.floor(w / 5) - 1) : 0;
    const open = ZONE_DEFS.filter((z) => state[z.id]);
    const pool = open.length > 0 ? open : ZONE_DEFS;
    const zone = pool[idx % pool.length];
    return { zoneId: zone.id, x: zone.bossAnchor.x, z: zone.bossAnchor.z };
  }

  /** Lock both zones again — fresh run. No events. Re-seals the level too. */
  function reset() {
    for (const z of ZONE_DEFS) {
      state[z.id] = false;
      if (level && typeof level.setZoneLocked === "function") {
        level.setZoneLocked(z.id, true);
      }
    }
  }

  // NIGHT 30 P1 story-guard (§5.6.4): armed by main.js for every story run.
  // While active, clearing a wave must NOT open north/east — they are the
  // quarantine interior, sealed until mission 6 unlocks them directly.
  let storyActive = false;

  bus.addEventListener("story-mode", (e) => {
    const d = e && e.detail ? e.detail : {};
    storyActive = d.active === true;
  });

  // Clearing wave n unlocks what it earned (idempotent — main.js calling
  // unlockForWave directly is equally safe). Skipped entirely in story runs.
  bus.addEventListener("wave-clear", (e) => {
    if (storyActive) return; // §5.6.4: story opens these via mission 6 only
    const n = e && e.detail ? Number(e.detail.n) : NaN;
    if (Number.isFinite(n)) unlockForWave(n);
  });

  // A fresh run always (re)starts at wave 1 → re-lock both zones silently.
  bus.addEventListener("wave-start", (e) => {
    const n = e && e.detail ? Number(e.detail.n) : NaN;
    if (n === 1) reset();
  });

  return { list, unlockForWave, bossAnchorFor, reset };
}
