/**
 * Pickup drops (ammo / health).
 *
 * Drops: listens "zombie-killed" on the bus → 18% chance to spawn a pickup at
 * the death position; the kind is 70% "ammo" / 30% "health".
 *
 * Items: small glowing low-poly boxes/canisters (emissive material, no
 * external assets) that rotate and bob above the floor.
 *
 * Magnet + collection (in update(dt, playerPos)):
 * - within 2 m → accelerate toward the player (magnet);
 * - within 1 m → collected: remove the item and emit "pickup" {kind} on the
 *   bus. This module does NOT apply effects itself (no player/weapons/audio
 *   references — signature frozen). Consumers:
 *   - player controller: "pickup" {kind:"health"} → +40 HP (cap 100);
 *   - weapons: "pickup" {kind:"ammo"} → +1 mag reserve to the active weapon,
 *     +50% of a mag to the other two;
 *   - main.js routes the event to audio.pickup().
 *
 * reset(): remove all pickups from the scene (fresh run).
 *
 * Bus events emitted: "pickup" {kind: "ammo"|"health"}.
 * Bus events consumed: "zombie-killed" {type, score, headshot, position}.
 *
 * @param {import("three").Scene} scene
 * @param {EventTarget} bus
 * @returns {Pickups}
 */

/**
 * @typedef {Object} Pickups
 * @property {(position: import("three").Vector3, kind: "ammo"|"health") => void} spawn
 *   Spawn a pickup of the given kind at position (debug can force drops).
 * @property {(dt: number, playerPos: import("three").Vector3) => void} update
 *   Animate items, magnet and collect (dt seconds; playerPos = player feet).
 * @property {() => void} reset - remove all pickups.
 */

import * as THREE from "three";

const DROP_CHANCE = 0.18;
const AMMO_WEIGHT = 0.7; // of drops; the rest are health
const MAGNET_RADIUS = 2;
const COLLECT_RADIUS = 1;
const ARENA_LIMIT = 29; // keep drops inside the playable area
const BASE_Y = 0.55;

export function createPickups(scene, bus) {
  // --- shared geometry + materials (created once, reused for every drop) ------
  const bodyGeo = new THREE.BoxGeometry(0.36, 0.24, 0.26);
  const bandGeo = new THREE.BoxGeometry(0.4, 0.08, 0.3);

  const ammoBodyMat = new THREE.MeshStandardMaterial({ color: 0x4a5138, roughness: 0.7, metalness: 0.1 });
  const healthBodyMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.5, metalness: 0.05 });
  // Emissive bands are shared per kind so the whole pile pulses together.
  const ammoBandMat = new THREE.MeshStandardMaterial({
    color: 0x2a1c08, emissive: 0xffab3d, emissiveIntensity: 1.2, roughness: 0.4,
  });
  const healthBandMat = new THREE.MeshStandardMaterial({
    color: 0x2a0808, emissive: 0xff4444, emissiveIntensity: 1.2, roughness: 0.4,
  });
  const bandMats = { ammo: ammoBandMat, health: healthBandMat };
  const bodyMats = { ammo: ammoBodyMat, health: healthBodyMat };

  /** @type {{group: THREE.Group, kind: "ammo"|"health", phase: number, baseY: number}[]} */
  const items = [];
  /** @type {Record<"ammo"|"health", {group: THREE.Group, kind: "ammo"|"health", phase: number, baseY: number}[]>} */
  const free = { ammo: [], health: [] };
  let time = 0;

  /** Build one pooled item group (two boxes: body + glowing band). */
  function build(kind) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMats[kind]);
    const band = new THREE.Mesh(bandGeo, bandMats[kind]);
    band.position.y = 0.02;
    group.add(body, band);
    return { group, kind, phase: Math.random() * Math.PI * 2, baseY: BASE_Y };
  }

  function acquire(kind) {
    const pool = free[kind];
    const item = pool.length > 0 ? pool.pop() : build(kind);
    item.kind = kind;
    item.phase = Math.random() * Math.PI * 2;
    item.baseY = BASE_Y;
    return item;
  }

  function release(item) {
    scene.remove(item.group);
    free[item.kind].push(item);
  }

  // --- spawning -----------------------------------------------------------------

  /**
   * @param {import("three").Vector3} position - death spot; XZ used, dropped to floor
   * @param {"ammo"|"health"} kind
   */
  function spawn(position, kind) {
    if (!position || (kind !== "ammo" && kind !== "health")) return;
    const item = acquire(kind);
    item.group.position.set(
      Math.min(ARENA_LIMIT, Math.max(-ARENA_LIMIT, position.x)),
      item.baseY,
      Math.min(ARENA_LIMIT, Math.max(-ARENA_LIMIT, position.z))
    );
    item.group.rotation.set(0, Math.random() * Math.PI * 2, 0);
    scene.add(item.group);
    items.push(item);
  }

  // --- drop roll ---------------------------------------------------------------

  /** @param {Event} e */
  function onZombieKilled(e) {
    const detail = /** @type {{position?: import("three").Vector3}|null} */ (e.detail);
    if (!detail || !detail.position) return;
    if (Math.random() >= DROP_CHANCE) return;
    spawn(detail.position, Math.random() < AMMO_WEIGHT ? "ammo" : "health");
  }
  bus.addEventListener("zombie-killed", onZombieKilled);

  // --- per-frame -----------------------------------------------------------------

  /**
   * Rotate + bob + pulse, magnet toward the player, collect.
   * @param {number} dt
   * @param {import("three").Vector3} playerPos - player feet position
   */
  function update(dt, playerPos) {
    const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    time += step;
    // Shared emissive pulse (both kinds breathe together — one write per frame).
    const pulse = 1.15 + 0.45 * Math.sin(time * 3.4);
    ammoBandMat.emissiveIntensity = pulse;
    healthBandMat.emissiveIntensity = pulse;

    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const g = item.group;
      g.rotation.y += 2.4 * step;

      // Magnet + collect (XZ distance to the player's feet).
      let collected = false;
      if (playerPos && Number.isFinite(playerPos.x)) {
        const dx = playerPos.x - g.position.x;
        const dz = playerPos.z - g.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < COLLECT_RADIUS * COLLECT_RADIUS) {
          collected = true;
        } else if (d2 < MAGNET_RADIUS * MAGNET_RADIUS) {
          const d = Math.sqrt(d2) || 1e-6;
          // Pull accelerates as the gap closes (2 m → ~3.5 m/s, 0 m → ~17 m/s).
          const speed = 3.5 + (MAGNET_RADIUS - d) * 9;
          const inv = 1 / d;
          g.position.x += dx * inv * speed * step;
          g.position.z += dz * inv * speed * step;
          // Ease down to collect height while flying in.
          g.position.y += (0.4 - g.position.y) * Math.min(1, 10 * step);
        } else {
          // Idle bob around the drop height.
          g.position.y = item.baseY + Math.sin(time * 2.2 + item.phase) * 0.1;
        }
      } else {
        g.position.y = item.baseY + Math.sin(time * 2.2 + item.phase) * 0.1;
      }

      if (collected) {
        items[i] = items[items.length - 1];
        items.pop();
        release(item);
        bus.dispatchEvent(new CustomEvent("pickup", { detail: { kind: item.kind } }));
      }
    }
  }

  /** Remove all pickups (fresh run); pooled groups stay for reuse. */
  function reset() {
    for (const item of items) release(item);
    items.length = 0;
  }

  return { spawn, update, reset };
}
