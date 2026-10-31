/**
 * Wave director / zombie spawner.
 *
 * Wave n (1-based): total count = 5 + n*3 zombies, composed as:
 *   - brutes:  from wave 4, count = 1 + floor(n/5) of the total;
 *   - runners: from wave 2, ~25% of the total (Math.round);
 *   - the rest are walkers.
 *
 * Spawn cadence: the FIRST spawn lands within 3 s of the wave starting, then
 * one zombie every 0.8–1.5 s (random) until the wave's count is exhausted.
 * Spawn position: a level.spawnPoints entry at least 15 m from the player
 * (if none qualifies, the farthest one); instantiate
 * `new Zombie(scene, type, position, bus)`.
 *
 * A wave CLEARS when all of its zombies are dead → emit "wave-clear" {n},
 * then a 10 s intermission → emit "wave-start" {n+1} and repeat. Wave 1
 * starts on the FIRST update() call after construction/reset() — the main
 * loop only calls update() while the gamestate is "playing", which is what
 * freezes waves in menus/pause (menu: atmosphere only; paused: render only).
 *
 * Bus events emitted:
 * - "wave-start" {n}       (gamestate sets wave; hud shows banner + sting)
 * - "wave-clear" {n}
 * - "zombie-spawned" {zombie} — main.js pushes the zombie into the SHARED
 *   zombies array that createCombat received. (createWaves cannot take the
 *   array itself — its signature is frozen by spec — and combat is created
 *   BEFORE waves in the bootstrap order, so the bus is the bridge.)
 * - On reset(): every living zombie is disposed immediately and announced
 *   with "zombie-despawned" {zombie} so the shared array stays in sync
 *   (main.js must tolerate duplicates of that event).
 *
 * Internal bookkeeping: once a zombie is dead ("zombie-killed") it no longer
 * counts toward wave-clear; drop it from the internal list when its corpse
 * finishes despawning ("zombie-despawned") or on reset().
 *
 * NOTE: this module only advances spawn timers / intermission and checks the
 * alive flags — per-frame zombie.update() calls are driven by main.js over
 * the shared array (waves only receives playerPos, not the player object).
 *
 * @param {import("three").Scene} scene
 * @param {import("../world/level.js").Level} level
 * @param {EventTarget} bus
 * @returns {Waves}
 */

/**
 * @typedef {Object} Waves
 * @property {(dt: number, playerPos: import("three").Vector3) => void} update
 *   Advance spawn timers / intermission (dt seconds; playerPos = player feet).
 * @property {() => void} reset
 *   Clear all zombies + timers so a fresh run starts at wave 1 on next update.
 */

import * as THREE from "three";
import { Zombie } from "./zombie.js";

const FIRST_SPAWN_MIN = 1.0; // spec: first spawn ≤ 3 s after wave-start
// Integration: spec ceiling is 3 s; 2.5 s leaves margin for frame quantization
// (dt clamp 0.05 s) so the wave-1 first spawn ALWAYS lands inside 3 s.
const FIRST_SPAWN_MAX = 2.5;
const GAP_MIN = 0.8; // spec: one zombie every 0.8–1.5 s
const GAP_MAX = 1.5;
const INTERMISSION = 10; // spec: 10 s rest between waves
const MIN_SPAWN_DIST = 15; // spec: spawn ≥ 15 m from the player
const JITTER = 0.7; // lateral scatter so consecutive spawns don't stack

export function createWaves(scene, level, bus) {
  const B = bus || new EventTarget();
  let wave = 0; // current wave number (0 = none started yet)
  let phase = "idle"; // idle → spawning → combat → intermission → …
  let queue = []; // types left to spawn for the current wave
  let spawnTimer = 0;
  let interTimer = 0;
  let spawnedThisWave = 0;
  /** @type {import("./zombie.js").Zombie[]} everything spawned this wave (alive or corpse) */
  const tracked = [];

  // Corpses announce themselves when fully despawned — drop them here so only
  // live zombies count toward the wave-clear check.
  B.addEventListener("zombie-despawned", (e) => {
    const z = e && e.detail ? e.detail.zombie : null;
    const i = tracked.indexOf(z);
    if (i !== -1) tracked.splice(i, 1);
  });

  function emit(name, detail) {
    B.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /** Wave n composition per spec, shuffled so types interleave. */
  function composition(n) {
    const total = 5 + n * 3;
    const brutes = n >= 4 ? 1 + Math.floor(n / 5) : 0;
    const runners = n >= 2 ? Math.round(total * 0.25) : 0;
    const walkers = Math.max(0, total - brutes - runners);
    const list = [];
    for (let i = 0; i < brutes; i++) list.push("brute");
    for (let i = 0; i < runners; i++) list.push("runner");
    for (let i = 0; i < walkers; i++) list.push("walker");
    return shuffle(list);
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function startWave(n) {
    wave = n;
    queue = composition(n);
    spawnedThisWave = 0;
    spawnTimer = FIRST_SPAWN_MIN + Math.random() * (FIRST_SPAWN_MAX - FIRST_SPAWN_MIN);
    phase = "spawning";
    emit("wave-start", { n });
  }

  /** A spawn point ≥ 15 m from the player; if none qualifies, the farthest. */
  function pickSpawnPoint(playerPos) {
    const pts = level && level.spawnPoints;
    if (!pts || pts.length === 0) return null;
    const px = playerPos && Number.isFinite(playerPos.x) ? playerPos.x : 0;
    const pz = playerPos && Number.isFinite(playerPos.z) ? playerPos.z : 0;
    let far = null;
    let farD = -1;
    const eligible = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const dx = p.x - px;
      const dz = p.z - pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= MIN_SPAWN_DIST) eligible.push(p);
      if (d > farD) {
        farD = d;
        far = p;
      }
    }
    if (eligible.length === 0) return far;
    return eligible[(Math.random() * eligible.length) | 0];
  }

  function spawnOne(playerPos) {
    const base = pickSpawnPoint(playerPos);
    if (!base) return; // no spawn points: keep the queue, retry next frame
    const type = queue.pop();
    // Jitter the point, skipping samples that land inside a collider; if all
    // of them do, fall back to the raw spawn point (clear by level design).
    let x = base.x;
    let z = base.z;
    const canTest = !!(level && typeof level.isBlocked === "function");
    for (let i = 0; i < 4; i++) {
      const jx = base.x + (Math.random() * 2 - 1) * JITTER;
      const jz = base.z + (Math.random() * 2 - 1) * JITTER;
      if (!canTest || !level.isBlocked(jx, jz, 0.4)) {
        x = jx;
        z = jz;
        break;
      }
    }
    const zombie = new Zombie(scene, type, new THREE.Vector3(x, 0, z), B);
    spawnedThisWave++;
    tracked.push(zombie);
    emit("zombie-spawned", { zombie });
  }

  function allDead() {
    for (let i = 0; i < tracked.length; i++) {
      if (tracked[i].alive) return false;
    }
    return true;
  }

  function update(dt, playerPos) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (phase === "idle") {
      // Wave 1 starts on the first update() after construction/reset().
      startWave(1);
    }
    if (phase === "spawning") {
      spawnTimer -= dt;
      if (spawnTimer <= 0 && queue.length > 0) {
        spawnOne(playerPos);
        if (queue.length > 0) {
          spawnTimer = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
        }
      }
      if (queue.length === 0) phase = "combat"; // all out — wait for the kills
    } else if (phase === "combat") {
      // Dead zombies no longer count toward clear (alive flag is the truth).
      if (spawnedThisWave > 0 && allDead()) {
        emit("wave-clear", { n: wave });
        phase = "intermission";
        interTimer = INTERMISSION;
      }
    } else if (phase === "intermission") {
      interTimer -= dt;
      if (interTimer <= 0) startWave(wave + 1);
    }
  }

  function reset() {
    // Snapshot + clear FIRST: our own "zombie-despawned" listener splices
    // `tracked` while the emits below run, which would otherwise skip every
    // other zombie in the loop.
    const list = tracked.slice();
    tracked.length = 0;
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      // Announce BEFORE dispose so main.js drops it from the shared array;
      // dispose() itself never re-emits (main.js tolerates duplicates anyway).
      emit("zombie-despawned", { zombie: z });
      z.dispose();
    }
    queue = [];
    wave = 0;
    spawnedThisWave = 0;
    spawnTimer = 0;
    interTimer = 0;
    phase = "idle"; // next update() starts wave 1 again
  }

  return { update, reset };
}
