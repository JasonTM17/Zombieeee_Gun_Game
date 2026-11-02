/**
 * ============================================================================
 * LIGHTNING — close-strike damage for STORM weather.
 * ============================================================================
 * weather.js emits "lightning-strike" {x, z, radius: 3.2, damage: 160, time}
 * when a real bolt lands 8–30 m from the player. This system turns that event
 * into gameplay without touching the player:
 *
 *   - the strike is copied into a fixed queue at event time (no object
 *     creation, no per-frame allocation);
 *   - 0.1 s later the bolt "hits": every LIVE zombie within the radius loses
 *     `damage` through `zombie.takeDamage(damage, false)` — never a headshot;
 *   - each zombie is damaged at most once per strike (a per-slot ref array
 *     dedupes, so a duplicated array entry cannot take two hits);
 *   - a bright spark burst + impact sparks fire at the strike point and at
 *     every zombie hit for readability;
 *   - the player is never referenced, so there is NO friendly fire.
 *
 * The delay is deliberate: the bolt appears first, damage lands a beat later.
 * If more than QUEUE_MAX strikes arrive inside one delay window the oldest
 * pending slot is reused (the scene cannot produce that many in 0.1 s).
 *
 * Wiring (lead / main.js — this module edits nothing else):
 *   import { createLightning } from "./systems/lightning.js";
 *   const lightning = createLightning(bus, zombies, particles); // after zombies
 *   // playing: lightning.update(dt);
 *
 * @param {EventTarget} bus - shared bus (src/systems/gamestate.js)
 * @param {Array<{alive: boolean, position: {x: number, y: number,
 *   z: number}, takeDamage: (d: number, headshot: boolean) => boolean}>} zombies
 *   SHARED live array (main.js mutates it in place; read fresh per strike)
 * @param {import("./particles.js").Particles|null} particles
 * @returns {{update: (dt: number) => void}}
 */

const IMPACT_DELAY = 0.1; // s — the bolt is visible before damage lands
const STRIKE_RADIUS = 3.2; // m — fallback when the event omits a radius
const STRIKE_DAMAGE = 160; // fallback when the event omits damage
const QUEUE_MAX = 4; // pending strikes (0.1 s window — 1 is already generous)
const HIT_MAX = 64; // zombies deduped per strike (far more than a 3.2 m disc holds)

export function createLightning(bus, zombies, particles) {
  const B = bus && typeof bus.addEventListener === "function" ? bus : null;
  const list = Array.isArray(zombies) ? zombies : [];
  const P = particles || null;

  // Fixed queue: every field and every dedupe array is allocated exactly once.
  /** @type {Array<{active: boolean, t: number, x: number, z: number,
   *   radius: number, damage: number, hitCount: number,
   *   hits: Array<object|null>}>} */
  const queue = new Array(QUEUE_MAX);
  for (let i = 0; i < QUEUE_MAX; i++) {
    queue[i] = {
      active: false,
      t: 0,
      x: 0,
      z: 0,
      radius: STRIKE_RADIUS,
      damage: STRIKE_DAMAGE,
      hitCount: 0,
      hits: new Array(HIT_MAX).fill(null),
    };
  }
  let overwrite = 0; // round-robin slot when the queue is somehow full
  const fxPos = { x: 0, y: 0, z: 0 }; // reused for every particle call

  /**
   * Spark burst + impact sparks at one world point. Reuses `fxPos`; the
   * particle pool copies the values immediately, so no objects are retained.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  function burstAt(x, y, z) {
    if (!P) return;
    fxPos.x = x;
    fxPos.y = y;
    fxPos.z = z;
    if (typeof P.spawnSpark === "function") P.spawnSpark(fxPos);
    if (typeof P.spawnImpact === "function") P.spawnImpact(fxPos);
  }

  /**
   * Resolve one queued strike: FX at the strike point, then damage + FX for
   * every unique live zombie inside the radius. Runs 0.1 s after the event.
   * @param {typeof queue[number]} q
   */
  function impact(q) {
    burstAt(q.x, 0.45, q.z);
    q.hitCount = 0;
    const r2 = q.radius * q.radius;
    for (let i = 0; i < list.length; i++) {
      const zb = list[i];
      if (!zb || zb.alive !== true || !zb.position) continue;
      const dx = zb.position.x - q.x;
      const dz = zb.position.z - q.z;
      if (dx * dx + dz * dz > r2) continue;

      // Per-strike dedupe: the same reference can never take two hits.
      let seen = false;
      for (let h = 0; h < q.hitCount; h++) {
        if (q.hits[h] === zb) {
          seen = true;
          break;
        }
      }
      if (seen) continue;
      if (q.hitCount < HIT_MAX) q.hits[q.hitCount++] = zb;

      const zy = Number.isFinite(zb.position.y) ? zb.position.y : 0;
      burstAt(zb.position.x, zy + 1.0, zb.position.z);
      if (typeof zb.takeDamage === "function") {
        zb.takeDamage(q.damage, false); // never a headshot, never the player
      }
    }
    // Release dedupe refs immediately: corpses must not stay retained between
    // strikes just because a queue slot still points at them.
    for (let h = 0; h < q.hitCount; h++) q.hits[h] = null;
    q.hitCount = 0;
  }

  /**
   * Copy one strike event into the fixed queue. No allocations: only numeric
   * fields and the preallocated dedupe counter are written.
   * @param {Event} e
   */
  function onStrike(e) {
    const d = e && e.detail ? e.detail : null;
    if (!d) return;
    const x = Number(d.x);
    const z = Number(d.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const rRaw = Number(d.radius);
    const dmgRaw = Number(d.damage);
    const radius = Number.isFinite(rRaw) && rRaw > 0 ? rRaw : STRIKE_RADIUS;
    const damage = Number.isFinite(dmgRaw) && dmgRaw > 0 ? dmgRaw : STRIKE_DAMAGE;

    let slot = -1;
    for (let i = 0; i < QUEUE_MAX; i++) {
      if (!queue[i].active) {
        slot = i;
        break;
      }
    }
    if (slot < 0) {
      slot = overwrite;
      overwrite = (overwrite + 1) % QUEUE_MAX;
    }
    const q = queue[slot];
    q.active = true;
    q.t = IMPACT_DELAY;
    q.x = x;
    q.z = z;
    q.radius = radius;
    q.damage = damage;
    q.hitCount = 0;
  }

  if (B) B.addEventListener("lightning-strike", onStrike);

  /**
   * Advance pending strikes and land any whose 0.1 s delay elapsed.
   * @param {number} dt seconds
   */
  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (let i = 0; i < QUEUE_MAX; i++) {
      const q = queue[i];
      if (!q.active) continue;
      q.t -= dt;
      if (q.t > 0) continue;
      impact(q);
      q.active = false; // after impact: a synchronous kill event may re-enter
      q.t = 0;
    }
  }

  return { update };
}
