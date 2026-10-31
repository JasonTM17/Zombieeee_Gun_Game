/**
 * ============================================================================
 * CITY — thế giới mở 7 khu "ĐÊM THỨ 30 · Phần 1" (docs/EXPANSION-P1.md §3).
 * ============================================================================
 * STUB — builder WORLD thay thân `createCity`, GIỮ nguyên chữ ký + typedef
 * dưới đây. Toạ độ/kích thước/cổng/spawn: docs/EXPANSION-P1.md mục 3.1–3.6
 * (nguồn thật: docs/WORLD.md).
 *
 * createCity(scene, level) builds the whole city around the legacy 60×60
 * quarantine arena: city floor (260×260), outer ±130 wall, district boundary
 * walls, per-district merged geometry (buildings ≤ 2 draw calls per district,
 * props merged per kind, emissive layer per district), the 12 district gates
 * (steel frame + sliding barrier, red when locked / green when open), the
 * collapsed-city silhouette (1 merged mesh), and the water plane in the park.
 * Everything outside quarantine is NEW geometry; quarantine itself stays
 * byte-identical (level.js owns it — docs/EXPANSION-P1.md §3.2).
 *
 * Colliders: every solid the city adds is pushed into `level.colliders`
 * (the live public array — level.js:750). Gate barriers push a temporary
 * collider that is spliced out ONLY after the 1.0 s sink animation finishes
 * (never at open time — that would flash a 0.3 s gap).
 *
 * Walkability model (docs/EXPANSION-P1.md §3.1): `districtAt` tests the
 * quarantine 3 sub-rects FIRST (arena −30..30 × −30..30, north −15..15 ×
 * −54..−30, east 30..54 × −15..15), then the 6 outer districts in table
 * order. The strip x −30..−15, z −54..−30 belongs to residential. The three
 * notches N-B1/N-B2/N-B3 are VOID. Any point outside all 7 bounds → null.
 *
 * Gates (docs/EXPANSION-P1.md §3.4): 12 gates — G1..G6 ring (5 m) + 6 steel
 * quarantine gates (D-Q opens after mission 6, the other five after mission
 * 9). setGateOpen(from, to, open) is idempotent, the pair is unordered, and
 * while open=true it: sinks the barrier 1.0 s (y 1.5 → −1.6), flips frame
 * emissive #ff3b30 → #3dff6e in the same second, removes the barrier collider
 * when the sink completes, and plays a locally synthesized rumble (audio.js
 * is frozen — pattern: explosives.js synthesizes its own boom).
 *
 * Dev-guard (pattern zones.js:139-152): after the build, warn (never throw)
 * when any POI / spawn point / center / gate waypoint fails
 * level.isBlocked(p.x, p.z, 0.8).
 *
 * Disposal: city geometry must be removable — keep a private list like
 * level.js does (objects/geometries/materials/textures) and wire it into
 * level.dispose() cleanup only through the integrator; city.js itself exposes
 * whatever teardown the stub contract requires (see Level.dispose contract).
 *
 * Bus events consumed: none. Bus events emitted: none (gate opening is
 * driven by main.js calling setGateOpen after "gate-open"; city never
 * touches the bus).
 *
 * @param {import("three").Scene} scene
 * @param {import("../world/level.js").Level} level - legacy level; city only
 *   READS its API (isBlocked, colliders array) and PUSHES colliders.
 * @returns {City}
 */

/**
 * One district descriptor. Order in `districts` MUST follow
 * docs/EXPANSION-P1.md §3.1: safehouse, residential, commercial, hospital,
 * park, docks, quarantine.
 *
 * @typedef {Object} District
 * @property {("safehouse"|"residential"|"commercial"|"hospital"|"park"|
 *             "docks"|"quarantine")} id
 * @property {string} nameKey - i18n key ("district_safehouse" …), values
 *   registered by THIS module per docs/EXPANSION-P1.md §7.2.
 * @property {{minX: number, maxX: number, minZ: number, maxZ: number}} bounds
 *   XZ rect in meters. For quarantine this is the DISPLAY bbox
 *   (−30..54 × −54..30); the walkable truth is the 3 sub-rects (§3.1).
 * @property {Array<{to: string, x: number, z: number}>} gates - gates shared
 *   with a directly adjacent district (id of the OTHER side + gap center).
 * @property {Array<{x: number, z: number}>} spawnPoints - per-district wave
 *   spawn pool (§3.6.6). quarantine = [] (its 18 legacy points live on
 *   level.spawnPoints and must NOT be redeclared here).
 * @property {number} quotaNeed - 20/25/30/25/30 for residential/commercial/
 *   hospital/park/docks; 0 for safehouse and quarantine.
 * @property {{x: number, z: number}} center - teleport/debug drop point
 *   (§3.1); safehouse center (−75, 8) doubles as the story spawn.
 */

/**
 * @typedef {Object} City
 * @property {District[]} districts - the 7 district descriptors (live).
 * @property {(x: number, z: number) => ("safehouse"|"residential"|
 *   "commercial"|"hospital"|"park"|"docks"|"quarantine"|null)} districtAt
 *   District holding the point (quarantine tested first via its 3 sub-rects,
 *   §3.1); null for void / outside the city.
 * @property {(fromId: string, toId: string) => {from: string, to: string,
 *   x: number, z: number, axis: "x"|"z", width: number, open: boolean}|null}
 *   gateBetween - the shared gate of two ADJACENT districts (pair matched
 *   unordered); null when they do not touch. `open` is the live state.
 * @property {(fromId: string, toId: string, open: boolean) => boolean}
 *   setGateOpen - open/close one gate per §3.4 mechanics (sink 1.0 s,
 *   emissive swap, collider removed after the sink, synthesized rumble).
 *   Idempotent; pair unordered; returns true only when the state changed.
 */

// i18n keys owned by THIS module (docs/EXPANSION-P1.md §7.2). Register them
// here when the stub becomes the real implementation — values must be copied
// VERBATIM from that table (source: docs/STORY.md §7.2):
//   district_safehouse    Safehouse / An Toàn Nhà
//   district_residential  Residential / Khu Dân Cư
//   district_commercial   Commercial / Phố Thương Mại
//   district_hospital     Hospital / Bệnh Viện
//   district_park         Park / Công Viên
//   district_docks        Docks / Bến Cảng
//   district_quarantine   Quarantine Zone / Vùng Cách Ly

export function createCity(scene, level) {
  throw new Error("TODO: city.js — build per docs/EXPANSION-P1.md §3");
}
