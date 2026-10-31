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
 * Bus events consumed: "wave-clear" {n} (to drive unlockForWave), or main.js
 * calls unlockForWave directly — either wiring is acceptable, but each zone
 * must unlock exactly once per run.
 * Bus events emitted: "zone-unlocked" {id, name}.
 *
 * @param {import("three").Scene} scene
 * @param {import("../world/level.js").Level} level
 * @returns {Zones}
 */

/**
 * @typedef {Object} Zone
 * @property {"north"|"east"} id
 * @property {string} name - display name ("Sân sau" | "Kho").
 * @property {{minX: number, maxX: number, minZ: number, maxZ: number}} bounds
 * @property {{x: number, z: number}} gateWaypoint - inside the gate gap.
 * @property {{x: number, z: number}[]} spawnPoints - 2–3 zone-owned points.
 * @property {{x: number, z: number}} bossAnchor
 */

/**
 * @typedef {Object} Zones
 * @property {Zone[]} list - the two zone descriptors.
 * @property {(wave: number) => string[]} unlockForWave
 *   Unlock zones earned by clearing `wave` (north: 2, east: 4). Idempotent;
 *   returns the ids unlocked BY THIS CALL (empty array when nothing new).
 * @property {(wave: number) => {zoneId: string, x: number, z: number}} bossAnchorFor
 *   The boss spawn anchor for a boss wave (wave % 5 === 0) among the zones
 *   open at that time.
 * @property {() => void} reset - lock both zones again (fresh run).
 */

export function createZones(scene, level) {
  void scene;
  void level;
  throw new Error("TODO: implement");
}
