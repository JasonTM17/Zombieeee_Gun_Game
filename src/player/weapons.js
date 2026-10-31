/**
 * Weapon system: three hitscan weapons, switching, reloading, recoil, muzzle
 * flash and a low-poly viewmodel parented to the camera.
 *
 * Weapon table (spec numbers — DO NOT change):
 *   name    | mode      | interval            | mag | damage          | spread (rad) | reserve  | reload
 *   pistol  | semi-auto | per click           | 12  | 25              | 0.01         | Infinity | 1.2 s
 *   shotgun | pump      | 0.9 s between shots | 6   | 12 x 8 pellets  | 0.06         | 24       | 2.0 s
 *   rifle   | full-auto | 600 rpm (0.1 s)     | 30  | 18              | 0.02         | 90       | 1.8 s
 *
 * Firing flow — fire-rate + ammo + reload gating happen HERE. When a round
 * actually leaves the barrel this module:
 *   1. decrements mag (shotgun: by 1 shell, not per pellet),
 *   2. emits "fire" {weapon: WeaponState} on the bus — main.js routes it to
 *      combat.shoot(weapon), which does the actual hitscan (this module has no
 *      scene/particles access),
 *   3. emits "spread" {value: weapon.spread} (radians) for the crosshair,
 *   4. kicks recoil — camera pitch UP then recovered back to the pre-shot aim
 *      over ~0.2 s (magnitudes per weapon, tuned subtle),
 *   5. flashes a warm PointLight parented to the camera (viewmodel muzzle) for
 *      ~40 ms,
 *   6. plays audio.gunshot(name) directly (this module owns audio).
 *
 * Trigger inputs (read in update()):
 *   pistol  → input.consumeClick()
 *   shotgun → input.consumeClick() gated by the 0.9 s pump interval
 *   rifle   → input.isDown("Mouse0") gated by the 0.1 s auto interval
 *
 * Switching: "Digit1"/"Digit2"/"Digit3" or input.wheelDir() (cycles). Reload:
 * "KeyR" — allowed only if not already reloading, mag < magSize and reserve > 0
 * (pistol reserve is Infinity → never empty). audio.reloadStart() at the start
 * and audio.reloadEnd() at the end of the reload timer.
 *
 * Recoil composition note: the player controller rewrites camera.rotation each
 * frame from its own yaw/pitch. Because main.js calls player.update() BEFORE
 * weapons.update(), this module applies the DELTA between its current recoil
 * offset and the one it applied last frame on top of camera.rotation — that
 * stays correct regardless of the controller's absolute writes.
 *
 * Viewmodel: simple low-poly boxes parented to the camera (lower-right), with
 * a small draw animation on switch and a dip/rotate animation while reloading.
 *
 * Bus events emitted: "fire" {weapon}, "spread" {value}.
 * Bus events consumed: "pickup" {kind:"ammo"} → active weapon
 *   reserve += magSize; the other two += Math.round(0.5 * magSize)
 *   (adding to the pistol's Infinity keeps Infinity).
 *
 * @param {import("three").PerspectiveCamera} camera
 * @param {import("../core/input.js").Input} input
 * @param {import("../core/audio.js").Audio} audio
 * @param {EventTarget} bus
 * @returns {Weapons}
 */

/**
 * Full runtime descriptor of ONE weapon. combat.shoot() consumes
 * damage/pellets/spread from this; HUD/debug consume the getState() subset.
 *
 * @typedef {Object} WeaponState
 * @property {"pistol"|"shotgun"|"rifle"} name
 * @property {number} damage - per bullet (or per pellet): 25 | 12 | 18.
 * @property {number} pellets - rays per shot: 1 | 8 | 1.
 * @property {number} spread - cone half-angle in radians: 0.01 | 0.06 | 0.02.
 * @property {number} mag - rounds in the magazine right now.
 * @property {number} magSize - magazine capacity: 12 | 6 | 30.
 * @property {number} reserve - spare rounds; pistol is Infinity (unlimited).
 * @property {boolean} reloading
 */

/**
 * @typedef {Object} Weapons
 * @property {WeaponState[]} list - the three weapons: index 0 pistol, 1 shotgun, 2 rifle.
 * @property {number} current - index of the active weapon in list.
 * @property {(dt: number) => void} update
 *   Advance one frame (dt seconds): read trigger/switch/reload inputs, run
 *   timers, animate viewmodel + recoil + muzzle light.
 * @property {(i: number) => void} switchTo - switch to list index i (0..2).
 * @property {() => void} reload - start reloading the active weapon if allowed.
 * @property {() => WeaponState} getState
 *   The ACTIVE weapon's state; HUD/debug use at least
 *   {name, mag, magSize, reserve, reloading, spread}.
 */

import * as THREE from "three";

// --- weapon table (spec numbers — DO NOT change) ----------------------------
const WEAPONS = [
  {
    name: "pistol",
    mode: "semi",            // one shot per click; 0.1 s floor against macro spam
    interval: 0.1,
    damage: 25,
    pellets: 1,
    spread: 0.01,
    magSize: 12,
    startReserve: Infinity,  // unlimited
    reloadTime: 1.2,
    kick: 0.011,             // recoil pitch per shot (rad)
    yawKick: 0.0015,         // random yaw jitter amplitude (rad)
    vmKick: 0.045,           // viewmodel kick-back (m)
    flash: 5,                // muzzle PointLight intensity
  },
  {
    name: "shotgun",
    mode: "pump",            // 0.9 s between shots (spec)
    interval: 0.9,
    damage: 12,
    pellets: 8,
    spread: 0.06,
    magSize: 6,
    startReserve: 24,
    reloadTime: 2.0,
    kick: 0.034,
    yawKick: 0.007,
    vmKick: 0.1,
    flash: 9,
  },
  {
    name: "rifle",
    mode: "auto",            // 600 rpm → 0.1 s (spec)
    interval: 0.1,
    damage: 18,
    pellets: 1,
    spread: 0.02,
    magSize: 30,
    startReserve: 90,
    reloadTime: 1.8,
    kick: 0.0075,
    yawKick: 0.002,
    vmKick: 0.03,
    flash: 6,
  },
];

const DRAW_TIME = 0.3;    // s — switch/draw animation; firing blocked while drawing
const RECOIL_TAU = 0.07;  // s — exponential recovery (~94% back at 0.2 s, per header)
const FLASH_TIME = 0.04;  // s — muzzle flash (spec: 40 ms)
const VM_KICK_TAU = 0.055; // s — viewmodel kick-back recovery
const VM_POS = { x: 0.26, y: -0.24, z: -0.5 }; // lower-right of the camera

export function createWeapons(camera, input, audio, bus) {
  // Live runtime state, one entry per weapon (typedef WeaponState shape).
  const list = WEAPONS.map((w) => ({
    name: w.name,
    damage: w.damage,
    pellets: w.pellets,
    spread: w.spread,
    mag: w.magSize,
    magSize: w.magSize,
    reserve: w.startReserve,
    reloading: false,
  }));

  let current = 0;
  let cooldown = DRAW_TIME;  // initial draw keeps the gun down at spawn
  let reloadTimer = 0;
  let drawT = 1;             // 0..1 draw animation progress
  let recoilPitch = 0;
  let recoilYaw = 0;
  let lastPitchApplied = 0;  // recoil actually layered onto the camera last frame
  let lastYawApplied = 0;
  let flashTimer = 0;
  let vmKick = 0;
  let time = 0;

  // --- viewmodel: low-poly boxes parented to the camera ----------------------
  const mat = (color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.75,
      metalness: 0.25,
      emissive: color,      // slight self-glow so the gun reads against the night
      emissiveIntensity: 0.22,
    });
  const mats = {
    body: mat(0x23272d),
    dark: mat(0x15181c),
    grip: mat(0x3a3230),
    accent: mat(0x4a5561),
    wood: mat(0x5c4632),
  };

  function box(m, w, h, d, x, y, z, rx = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    return mesh;
  }

  function buildPistol() {
    const g = new THREE.Group();
    g.add(box(mats.body, 0.055, 0.085, 0.24, 0, 0.02, -0.02));      // slide/body
    g.add(box(mats.dark, 0.03, 0.035, 0.1, 0, 0.03, -0.17));        // barrel tip
    g.add(box(mats.grip, 0.048, 0.13, 0.07, 0, -0.07, 0.06, 0.25)); // grip
    g.add(box(mats.accent, 0.02, 0.015, 0.03, 0, 0.068, -0.12));    // front sight
    return g;
  }

  function buildShotgun() {
    const g = new THREE.Group();
    g.add(box(mats.body, 0.06, 0.08, 0.42, 0, 0, -0.1));            // receiver
    g.add(box(mats.dark, 0.032, 0.032, 0.5, 0, 0.02, -0.5));        // barrel
    g.add(box(mats.dark, 0.028, 0.028, 0.44, 0, -0.03, -0.48));     // tube
    g.add(box(mats.wood, 0.05, 0.05, 0.16, 0, -0.045, -0.42));      // pump
    g.add(box(mats.wood, 0.055, 0.09, 0.22, 0, -0.03, 0.22, 0.12)); // stock
    g.add(box(mats.grip, 0.045, 0.1, 0.06, 0, -0.08, 0.05, 0.35));  // grip
    return g;
  }

  function buildRifle() {
    const g = new THREE.Group();
    g.add(box(mats.body, 0.06, 0.09, 0.4, 0, 0, -0.05));            // receiver
    g.add(box(mats.dark, 0.028, 0.028, 0.34, 0, 0.015, -0.42));     // barrel
    g.add(box(mats.accent, 0.05, 0.16, 0.07, 0, -0.11, -0.02, -0.18)); // magazine
    g.add(box(mats.dark, 0.05, 0.05, 0.16, 0, -0.005, -0.3));       // handguard
    g.add(box(mats.dark, 0.055, 0.08, 0.2, 0, -0.01, 0.24));        // stock
    g.add(box(mats.grip, 0.045, 0.1, 0.06, 0, -0.09, 0.1, 0.3));    // grip
    g.add(box(mats.accent, 0.018, 0.03, 0.02, 0, 0.062, -0.2));     // sight
    return g;
  }

  const vmRoot = new THREE.Group();
  vmRoot.position.set(VM_POS.x, VM_POS.y, VM_POS.z);
  camera.add(vmRoot);
  const models = [buildPistol(), buildShotgun(), buildRifle()];
  for (let i = 0; i < models.length; i++) {
    models[i].visible = i === current;
    vmRoot.add(models[i]);
  }

  // Warm muzzle flash light living at the viewmodel muzzle (child of the
  // camera hierarchy → moves with the weapon, lights nothing when intensity 0).
  const muzzleLight = new THREE.PointLight(0xffb066, 0, 9, 2);
  muzzleLight.position.set(0.08, 0.08, -0.55);
  vmRoot.add(muzzleLight);

  // --- firing -----------------------------------------------------------------
  function fire() {
    const w = list[current];
    const cfg = WEAPONS[current];
    w.mag -= 1; // shotgun: one shell, not per pellet
    // Round left the barrel — main.js routes this to combat.shoot(weapon).
    bus.dispatchEvent(new CustomEvent("fire", { detail: { weapon: w } }));
    bus.dispatchEvent(new CustomEvent("spread", { detail: { value: w.spread } }));
    // Recoil: pitch up + tiny random yaw, recovered exponentially in update().
    recoilPitch += cfg.kick;
    recoilYaw += (Math.random() * 2 - 1) * cfg.yawKick;
    vmKick = cfg.vmKick;
    muzzleLight.intensity = cfg.flash * (0.85 + Math.random() * 0.3);
    flashTimer = FLASH_TIME;
    cooldown = cfg.interval;
    audio.gunshot(w.name);
  }

  // --- switching / reloading ----------------------------------------------------
  function switchTo(i) {
    if (!Number.isInteger(i) || i < 0 || i >= list.length || i === current) return;
    if (list[current].reloading) {
      // Switching cancels an in-progress reload (standard FPS behavior; the
      // mag is left as it was).
      list[current].reloading = false;
      reloadTimer = 0;
    }
    current = i;
    drawT = 0;
    cooldown = DRAW_TIME; // no firing mid-draw
  }

  function reload() {
    const w = list[current];
    if (w.reloading || w.mag >= w.magSize || !(w.reserve > 0)) return;
    w.reloading = true;
    reloadTimer = WEAPONS[current].reloadTime;
    audio.reloadStart();
  }

  function finishReload() {
    const w = list[current];
    w.reloading = false;
    reloadTimer = 0;
    const take = Math.min(w.magSize - w.mag, w.reserve);
    w.mag += take;
    if (Number.isFinite(w.reserve)) w.reserve -= take; // pistol stays Infinity
    audio.reloadEnd();
  }

  // --- per-frame ----------------------------------------------------------------
  function update(dt) {
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    time += dt;

    if (dt > 0) {
      if (cooldown > 0) cooldown = Math.max(0, cooldown - dt);
      if (flashTimer > 0) {
        flashTimer -= dt;
        if (flashTimer <= 0) {
          flashTimer = 0;
          muzzleLight.intensity = 0;
        }
      }
      const decay = Math.exp(-dt / RECOIL_TAU);
      recoilPitch *= decay;
      recoilYaw *= decay;
      vmKick *= Math.exp(-dt / VM_KICK_TAU);
    }

    // Switching: 1/2/3 or wheel. Poll every one-shot input every frame so the
    // pending flags never go stale.
    let want = -1;
    if (input.wasPressed("Digit1")) want = 0;
    else if (input.wasPressed("Digit2")) want = 1;
    else if (input.wasPressed("Digit3")) want = 2;
    else {
      const wd = input.wheelDir(); // -1 = scrolled down = next weapon
      if (wd !== 0) want = (current + (wd === -1 ? 1 : 2)) % 3;
    }
    if (want >= 0) switchTo(want);

    // Reload.
    if (input.wasPressed("KeyR")) reload();
    if (list[current].reloading) {
      reloadTimer -= dt;
      if (reloadTimer <= 0) finishReload();
    }

    // Trigger. Always flush the click so it can't leak across frames/weapons.
    const clicked = input.consumeClick();
    const active = list[current];
    if (!active.reloading && cooldown <= 0) {
      const cfg = WEAPONS[current];
      const wantsFire = cfg.mode === "auto" ? input.isDown("Mouse0") : clicked;
      if (wantsFire && active.mag > 0) fire();
    }

    // Recoil composition: the controller rewrote camera.rotation absolutely
    // this frame; layer only the DELTA since what we applied last frame.
    camera.rotation.x += recoilPitch - lastPitchApplied;
    camera.rotation.y += recoilYaw - lastYawApplied;
    lastPitchApplied = recoilPitch;
    lastYawApplied = recoilYaw;

    // --- viewmodel animation ----------------------------------------------------
    if (drawT < 1) drawT = Math.min(1, drawT + dt / DRAW_TIME);
    for (let i = 0; i < models.length; i++) models[i].visible = i === current;

    let dipY = 0;
    let rotX = 0;
    let rotZ = 0;
    if (drawT < 1) {
      // Draw: rise from below with an ease-out.
      const e = 1 - Math.pow(1 - drawT, 3);
      dipY -= (1 - e) * 0.3;
      rotX -= (1 - e) * 0.6;
    }
    if (list[current].reloading) {
      // Reload: dip + tilt inward and back over the whole reload duration.
      const p = 1 - Math.max(0, reloadTimer) / WEAPONS[current].reloadTime;
      const s = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI);
      dipY -= s * 0.17;
      rotX += s * 0.55;
      rotZ += s * 0.35;
    }
    // Idle breathing sway + recoil kick-back toward the camera.
    vmRoot.position.set(
      VM_POS.x + Math.cos(time * 1.1) * 0.0025,
      VM_POS.y + Math.sin(time * 1.7) * 0.0035 + dipY,
      VM_POS.z + vmKick
    );
    vmRoot.rotation.set(rotX + vmKick * 0.9, 0, rotZ);
  }

  // Beyond the frozen contract — main.js MAY call this on fresh runs so a new
  // game starts with full mags (nothing calls it automatically).
  function reset() {
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      w.mag = w.magSize;
      w.reserve = WEAPONS[i].startReserve;
      w.reloading = false;
    }
    current = 0;
    reloadTimer = 0;
    drawT = 0;
    cooldown = DRAW_TIME;
    recoilPitch = 0;
    recoilYaw = 0;
    lastPitchApplied = 0;
    lastYawApplied = 0;
  }

  // Ammo pickup: active weapon gets a full mag, the other two half a mag each.
  // Pistol's Infinity reserve is left untouched (Infinity + n = Infinity).
  bus.addEventListener("pickup", (e) => {
    const kind = e && e.detail ? e.detail.kind : null;
    if (kind !== "ammo") return;
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      if (!Number.isFinite(w.reserve)) continue;
      w.reserve += i === current ? w.magSize : Math.round(w.magSize * 0.5);
    }
  });

  return {
    list,
    get current() {
      return current;
    },
    update,
    switchTo,
    reload,
    reset, // extra, beyond the contract — see note above
    getState: () => list[current],
  };
}
