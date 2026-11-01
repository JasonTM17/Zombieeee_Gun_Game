/**
 * Explosives — grenade projectiles + explosions (EXPANSION feature B5;
 * contract: docs/EXPANSION.md).
 *
 * createExplosives(scene, camera, zombies, particles, audio, bus)
 *   → { fire(origin, dir), update(dt), reset() }
 *
 * Grenade projectile (spec — DO NOT change the numbers):
 * - Launched by fire(origin, dir): a small projectile with LIGHT GRAVITY
 *   flying along dir (origin/dir in world space; origin ≈ camera muzzle).
 * - Detonates on CONTACT with a zombie or the GROUND, or after 1.2 s
 *   (whichever comes first).
 * - Explosion: RADIUS 4 m; damage 90 falling LINEARLY to 0 at the blast edge
 *   (per zombie: dmg = 90 * (1 - dist/4) clamped ≥ 0, applied via
 *   zombie.takeDamage(dmg, false) — explosion damage is not a headshot).
 * - Effects: particle burst (particles.spawnBlood/spawnSpark or a dedicated
 *   burst), a short-lived flash PointLight at the blast center, and a LIGHT
 *   camera shake (pitch/yaw jitter decaying over 0.3 s, applied as a DELTA on
 *   top of the camera rotation like weapons recoil does).
 * - Emits "explosion" {position} on the bus (position = blast center).
 * - reset(): clear every live projectile + pending effects (fresh run).
 *
 * The grenade WEAPON (weapons.js def, feature B4, id "grenade", pump 1.1 s,
 * mag 4, reserve 12) routes its shot to fire(origin, dir) — main.js wiring;
 * the explosive projectile itself must NOT go through combat.shoot hitscan.
 *
 * Implementation notes (this implementation):
 * - Projectile physics: launch speed 24 m/s along the (normalized) dir with a
 *   0.4 m forward offset so the shell clears the player, gravity 10 m/s²
 *   ("trọng lực nhẹ" — half the player controller's 20). One Mesh + record
 *   per SHOT (never per frame); the geometry/material are shared module-scope
 *   per factory instance and live for the page lifetime (same precedent as
 *   the shared zombie geometries; this module's contract has no dispose()).
 * - Zombie contact: fresh pass over the shared `zombies` array each update
 *   (never cached) — horizontal distance within (0.55·scale + 0.15) m and the
 *   shell below the zombie's head. Ground contact at y ≤ 0.08.
 * - Wall contact (review fix): SOLID LEVEL SURFACES ARE DETONATORS TOO. The
 *   factory signature has no level reference, but level.js flags every static
 *   surface mesh with userData.solid — walls, props, floors, gate frames — so
 *   the projectile's per-frame segment is raycast against those meshes and a
 *   hit snaps the blast to the wall face. Without it a grenade fired into
 *   cover flew THROUGH the prop and detonated up to ~29 m away, making the
 *   1200 $ launcher useless against cover. A backward ray catches shells that
 *   spawned inside geometry (point-blank muzzles) which FrontSide culling
 *   would let tunnel through.
 * - Blast damage basis: XZ distance from the blast center to the zombie's
 *   feet position — the arena is a flat ground plane and grenades land at
 *   ground level, so feet distance is the fair "mép vùng" measure.
 * - Camera shake composes with weapons recoil: both layer their DELTA on top
 *   of camera.rotation, and the player controller rewrites the rotation
 *   absolutely every frame — so the two are order-independent no matter where
 *   main.js calls explosives.update() in the loop.
 * - Sound: audio.js is frozen and exposes NO explosion method, so the boom is
 *   a small dedicated WebAudio synth in this file ("a dedicated synth, not a
 *   gunshot" — see stub contract above). Same lifecycle as the weapons.js
 *   synth: lazy context after the first user gesture, volume seeded from the
 *   persisted "gungame.settings" and following "settings-changed" on the bus.
 *   The `audio` parameter stays unused (void) for that reason.
 * - Accessibility / game feel (user request): the shake machine follows the
 *   persisted "shake" intensity (0..100) and "reducedMotion" (clamp to 0).
 *   Defaults 100/false reproduce the exact pre-setting amplitude.
 *
 * @param {import("three").Scene} scene
 * @param {import("three").PerspectiveCamera} camera - for the blast shake +
 *   world-direction reference.
 * @param {import("../zombies/zombie.js").Zombie[]} zombies - the SHARED live
 *   array (main.js keeps it in sync) — read fresh each update for contacts
 *   and blast damage; never cache its length.
 * @param {import("./particles.js").Particles} particles
 * @param {import("../core/audio.js").Audio} audio - unused (see implementation
 *   notes: audio.js has no explosion method; this module synthizes its own).
 * @param {EventTarget} bus
 * @returns {Explosives}
 */

/**
 * @typedef {Object} Explosives
 * @property {(origin: import("three").Vector3, dir: import("three").Vector3) => void} fire
 *   Launch one grenade from origin along dir (world space).
 * @property {(dt: number) => void} update - advance projectiles (light
 *   gravity), detonations, light fade and camera-shake decay; dt in seconds.
 * @property {() => void} reset - remove all live projectiles / pending
 *   effects (fresh run).
 * @property {(mult?: number) => void} shake - NIGHT 30 P3 (§6.2, P3-K8):
 *   MANUAL camera shake for the Origin phase transitions / death — reuses the
 *   internal blast-shake machinery, `shakeT = SHAKE_TIME × clamp(mult, 0.25, 3)`
 *   (the multiplier scales BOTH the duration and the jitter amplitude through
 *   the same decay curve; the default equals the grenade-blast shake).
 */

import * as THREE from "three";

// --- spec-frozen numbers -----------------------------------------------------
const FUSE = 1.2;        // s — detonate at latest (spec)
const RADIUS = 4;        // m — blast radius (spec)
const MAX_DAMAGE = 90;   // damage at the blast center, linear to 0 at the edge (spec)
const SHAKE_TIME = 0.3;  // s — camera shake decay (spec)

// --- module-local tuning -------------------------------------------------------
const GRAVITY = 10;      // m/s² — light gravity (half the player's 20)
const SPEED = 24;        // m/s launch speed along dir
const LAUNCH_OFFSET = 0.4; // m forward of the origin so the shell clears the player
const GROUND_Y = 0.08;   // m — ground contact threshold
const FLASH_TIME = 0.16; // s — PointLight fade
const FLASH_INT = 26;    // peak flash intensity
const SHAKE_AMP = 0.02;  // rad — peak pitch/yaw jitter ("camera shake nhẹ")
const BODY_HALF_W = 0.55; // zombie body half-width at scale 1 (contact test)
const BODY_TOP = 1.9;    // m — zombie head top at scale 1 (contact test)
const CONTACT_PAD = 0.15; // m of grace around the body test
const SETTINGS_KEY = "gungame.settings"; // the key settings.js persists
const SHAKE_PCT_DEFAULT = 100; // Accessibility setting: 100 = pre-setting feel

/**
 * Accessibility / game feel state from the persisted settings: shake intensity
 * (0..100) and reducedMotion (clamps shake to zero). Missing/corrupt storage
 * returns the exact pre-setting defaults (full shake, motion allowed).
 * @returns {{shake: number, reducedMotion: boolean}}
 */
function readShakeState() {
  let shake = SHAKE_PCT_DEFAULT;
  let reducedMotion = false;
  try {
    if (typeof localStorage !== "undefined") {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (s && typeof s === "object") {
        if (typeof s.shake === "number" && Number.isFinite(s.shake)) {
          shake = Math.min(100, Math.max(0, Math.round(s.shake)));
        }
        reducedMotion = s.reducedMotion === true;
      }
    }
  } catch {
    /* corrupt/absent storage → pre-setting defaults */
  }
  return { shake, reducedMotion };
}

/**
 * Tiny dedicated WebAudio boom (see implementation notes — audio.js exposes
 * no explosion method). Same lifecycle as the weapons.js local synth.
 * @param {EventTarget} bus
 */
function createBoomSynth(bus) {
  /** @type {AudioContext|null} */
  let ctx = null;
  /** @type {GainNode|null} */
  let master = null;
  /** @type {AudioBuffer|null} */
  let noiseBuf = null;
  let volume = 0.8;
  try {
    if (typeof localStorage !== "undefined") {
      const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (v && typeof v.volume === "number" && Number.isFinite(v.volume)) {
        volume = Math.min(1, Math.max(0, v.volume));
      }
    }
  } catch {
    /* corrupt/absent storage → default */
  }

  function onGesture() {
    if (!ctx) {
      try {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = volume;
        master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        ctx = null; // no WebAudio: stays a safe no-op
      }
    }
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  }
  if (typeof document !== "undefined") {
    document.addEventListener("pointerdown", onGesture);
    document.addEventListener("keydown", onGesture);
  }
  bus.addEventListener("settings-changed", (e) => {
    const p = e && e.detail ? e.detail.patch : null;
    if (p && typeof p.volume === "number" && Number.isFinite(p.volume)) {
      volume = Math.min(1, Math.max(0, p.volume));
      if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
    }
  });

  function ready() {
    if (!ctx || !master) return false;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx.state === "running" || ctx.state === "suspended";
  }

  function noise(o) {
    if (!ctx || !master || !noiseBuf) return;
    const t0 = ctx.currentTime + (o.when || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = o.type || "lowpass";
    filt.frequency.value = o.freq;
    filt.Q.value = o.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.gain, t0 + (o.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t0, Math.random() * 0.9);
    src.stop(t0 + o.dur + 0.05);
  }

  function tone(o) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + (o.when || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(Math.max(1, o.f0), t0);
    if (o.f1 && o.f1 !== o.f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.gain, t0 + (o.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  // The boom: deep concussion + bright crack + long rumble tail. Nothing like
  // any gunshot voice.
  function boom() {
    noise({ dur: 0.7, type: "lowpass", freq: 260, gain: 0.75, attack: 0.004 });
    noise({ dur: 0.3, type: "bandpass", freq: 1200, q: 0.7, gain: 0.3 });
    noise({ dur: 0.9, type: "lowpass", freq: 180, gain: 0.25, when: 0.06 });
    tone({ type: "sine", f0: 70, f1: 28, dur: 0.5, gain: 0.5 });
  }

  return {
    boom() {
      if (ready()) boom();
    },
  };
}

export function createExplosives(scene, camera, zombies, particles, audio, bus) {
  void audio; // frozen audio.js has no explosion method — dedicated synth below
  const boomSynth = createBoomSynth(bus);

  // --- shared visuals (per-factory, page lifetime — no dispose in contract) --
  const projGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const projMat = new THREE.MeshStandardMaterial({
    color: 0x37412c,
    roughness: 0.6,
    metalness: 0.2,
    emissive: 0x25360f, // faint glow so the shell reads against the night
    emissiveIntensity: 0.7,
  });
  const flashLight = new THREE.PointLight(0xffa252, 0, 14, 2);
  scene.add(flashLight);

  /** Live projectiles: { mesh, vx, vy, vz, t } — a handful at most. */
  const live = [];
  let flashT = 0;
  let shakeT = 0;
  let shakeX = 0; // shake offset actually layered onto the camera last frame
  let shakeY = 0;

  // Accessibility / game feel (user request): "shake" 0..100 scales the jitter
  // amplitude; reducedMotion clamps it to 0. At the 100/false defaults the
  // update() math below is byte-identical to the pre-setting behavior.
  const shakeState = readShakeState();
  let shakePct = shakeState.shake;
  let reducedMotion = shakeState.reducedMotion;
  let shakeScale = reducedMotion ? 0 : shakePct / 100;

  function syncShakeScale() {
    shakeScale = reducedMotion ? 0 : Math.min(100, Math.max(0, shakePct)) / 100;
    if (shakeScale <= 0) shakeT = 0; // drop a pending shake immediately
  }

  bus.addEventListener("settings-changed", (e) => {
    const p = e && e.detail ? e.detail.patch : null;
    if (!p) return;
    if (typeof p.shake === "number" && Number.isFinite(p.shake)) {
      shakePct = Math.min(100, Math.max(0, Math.round(p.shake)));
    }
    if (typeof p.reducedMotion === "boolean") {
      reducedMotion = p.reducedMotion;
    }
    syncShakeScale();
  });

  const upVec = new THREE.Vector3(0, 1, 0); // fireball burst direction

  /**
   * True when the projectile at world point p overlaps a LIVE zombie's body.
   * Fresh pass over the shared array — never cached.
   * @param {import("three").Vector3} p
   */
  function hitZombie(p) {
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (!z || !z.alive || !z.position) continue;
      const s = z.scale > 0 ? z.scale : 1;
      const dx = p.x - z.position.x;
      const dz = p.z - z.position.z;
      const rr = BODY_HALF_W * s + CONTACT_PAD;
      if (
        dx * dx + dz * dz <= rr * rr &&
        p.y <= BODY_TOP * s + CONTACT_PAD &&
        p.y >= -CONTACT_PAD
      ) {
        return true;
      }
    }
    return false;
  }

  // --- solid level geometry (walls / props / floors / gates) --------------------
  // The frozen signature has no level reference, but level.js marks every
  // static surface mesh with userData.solid — those meshes ARE the walls.
  const raycaster = new THREE.Raycaster();
  const segOrigin = new THREE.Vector3();
  const segDir = new THREE.Vector3();
  let solidCache = null; // rescanned per shot (scene membership is dynamic)

  /** Top-level scene meshes flagged userData.solid. */
  function solidTargets() {
    if (!solidCache) {
      solidCache = [];
      for (let i = 0; i < scene.children.length; i++) {
        const o = scene.children[i];
        if (o.userData && o.userData.solid === true) solidCache.push(o);
      }
    }
    return solidCache;
  }

  /**
   * True when the segment old → dest crosses a solid surface; dest is snapped
   * to the hit point so the blast lands at the wall face, never behind it.
   * @param {number} ox
   * @param {number} oy
   * @param {number} oz
   * @param {import("three").Vector3} dest - mutated on a hit
   */
  function hitSolid(ox, oy, oz, dest) {
    const dx = dest.x - ox;
    const dy = dest.y - oy;
    const dz = dest.z - oz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-9) return false;
    raycaster.near = 0;
    raycaster.far = len;
    raycaster.set(segOrigin.set(ox, oy, oz), segDir.set(dx / len, dy / len, dz / len));
    const hits = raycaster.intersectObjects(solidTargets(), false);
    if (hits.length > 0) {
      dest.copy(hits[0].point);
      return true;
    }
    // Forward ray clean but the segment STARTED inside geometry (point-blank
    // muzzle): FrontSide culling let the exit face pass — ray back toward the
    // origin to catch the missed entry.
    raycaster.set(segOrigin.set(dest.x, dest.y, dest.z), segDir.set(-dx / len, -dy / len, -dz / len));
    const back = raycaster.intersectObjects(solidTargets(), false);
    if (back.length === 0) return false;
    dest.copy(back[0].point);
    return true;
  }

  /**
   * Detonate at `pos`: AoE damage (linear falloff), particle burst, flash
   * light, camera shake, dedicated boom, "explosion" on the bus.
   * @param {import("three").Vector3} pos - blast center (read-only here)
   */
  function explode(pos) {
    // AoE: 90 dmg falling linearly to 0 at the 4 m edge, XZ distance from the
    // blast center. Not a headshot (stub contract: takeDamage(dmg, false)).
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (!z || !z.alive || !z.position) continue;
      const dx = z.position.x - pos.x;
      const dz = z.position.z - pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= RADIUS) continue;
      z.takeDamage(MAX_DAMAGE * (1 - d / RADIUS), false);
    }
    // Fireball + sparks: the particles pool takes a muzzle-voice burst aimed
    // up (orange embers) plus two spark showers. No per-explosion allocation
    // of our own beyond the event payload below.
    if (particles) {
      particles.spawnMuzzle(pos, upVec);
      particles.spawnSpark(pos);
      particles.spawnSpark(pos);
    }
    flashLight.position.set(pos.x, Math.max(0.5, pos.y), pos.z);
    flashLight.intensity = FLASH_INT;
    flashT = FLASH_TIME;
    shakeT = shakeScale > 0 ? SHAKE_TIME : 0; // 0 / reduced motion → no offset
    boomSynth.boom();
    bus.dispatchEvent(
      new CustomEvent("explosion", { detail: { position: pos.clone() } })
    );
  }

  function fire(origin, dir) {
    if (!origin || !dir) return;
    const ox = Number(origin.x);
    const oy = Number(origin.y);
    const oz = Number(origin.z);
    let dx = Number(dir.x);
    let dy = Number(dir.y);
    let dz = Number(dir.z);
    if (
      !Number.isFinite(ox) || !Number.isFinite(oy) || !Number.isFinite(oz) ||
      !Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)
    ) {
      return;
    }
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) {
      dx = 0;
      dy = 0;
      dz = -1; // degenerate dir → shoot down the camera's default forward
    } else {
      dx /= len;
      dy /= len;
      dz /= len;
    }
    // One mesh + record per SHOT (never per frame); shared geo/material.
    const mesh = new THREE.Mesh(projGeo, projMat);
    mesh.position.set(
      ox + dx * LAUNCH_OFFSET,
      Math.max(0.15, oy + dy * LAUNCH_OFFSET),
      oz + dz * LAUNCH_OFFSET
    );
    scene.add(mesh);
    solidCache = null; // rescan the solid meshes for this shot
    live.push({ mesh, vx: dx * SPEED, vy: dy * SPEED, vz: dz * SPEED, t: 0 });
  }

  function update(dt) {
    if (!Number.isFinite(dt) || dt < 0) dt = 0;

    // Projectiles: light gravity, tumble, contact/fuse detonation. Backwards
    // walk + swap-pop so a detonation can never skip an entry.
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      const m = p.mesh;
      let wallHit = false;
      if (dt > 0) {
        const ox = m.position.x;
        const oy = m.position.y;
        const oz = m.position.z;
        p.t += dt;
        p.vy -= GRAVITY * dt;
        m.position.x += p.vx * dt;
        m.position.y += p.vy * dt;
        m.position.z += p.vz * dt;
        m.rotation.x += dt * 9;
        m.rotation.z += dt * 7;
        // Solid level surfaces (walls/props/floors/gates — userData.solid set
        // by level.js) detonate the shell AT the surface; the ray covers the
        // whole per-frame segment so 24 m/s cannot tunnel through a wall.
        wallHit = hitSolid(ox, oy, oz, m.position);
      }
      if (wallHit || p.t >= FUSE || m.position.y <= GROUND_Y || hitZombie(m.position)) {
        explode(m.position);
        scene.remove(m);
        const last = live.pop();
        if (i < live.length) live[i] = last;
      }
    }

    // Flash light fade.
    if (flashT > 0) {
      flashT -= dt;
      if (flashT <= 0) {
        flashT = 0;
        flashLight.intensity = 0;
      } else {
        flashLight.intensity = (flashT / FLASH_TIME) * FLASH_INT;
      }
    }

    // Camera shake — pitch/yaw jitter decaying over 0.3 s, layered as a DELTA
    // on top of camera.rotation exactly like weapons recoil (see header).
    if (camera && shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      const k = shakeT / SHAKE_TIME;
      const amp = SHAKE_AMP * k * k * shakeScale; // ease-out decay × setting
      const nx = (Math.random() * 2 - 1) * amp;
      const ny = (Math.random() * 2 - 1) * amp;
      camera.rotation.x += nx - shakeX;
      camera.rotation.y += ny - shakeY;
      shakeX = nx;
      shakeY = ny;
    } else if (shakeX !== 0 || shakeY !== 0) {
      // Decay finished: ramp the last applied offset back out.
      if (camera) {
        camera.rotation.x -= shakeX;
        camera.rotation.y -= shakeY;
      }
      shakeX = 0;
      shakeY = 0;
    }
  }

  function reset() {
    for (let i = 0; i < live.length; i++) scene.remove(live[i].mesh);
    live.length = 0;
    flashT = 0;
    flashLight.intensity = 0;
    shakeT = 0;
    shakeX = 0;
    shakeY = 0;
  }

  /**
   * NIGHT 30 P3 (§6.2, P3-K8): manual camera shake for the ORIGIN phase
   * transitions ("origin-shake" {power:1}) and death ({power:2}) — main.js
   * routes the event here; this module holds no bus listener of its own.
   * Reuses the internal shake machine: shakeT = SHAKE_TIME × clamp(mult,
   * 0.25, 3); the running decay converts the remaining time into the jitter
   * amplitude, so a bigger multiplier shakes longer AND harder. Calling it
   * while a shake is running just restarts it at the new strength.
   * @param {number} [mult=1] - time+amplitude factor (0.5 light, 2 heavy).
   */
  function shake(mult) {
    // Accessibility: 0 / reduced motion never offsets the camera.
    if (shakeScale <= 0) {
      shakeT = 0;
      return;
    }
    const m = Number(mult);
    const k = Number.isFinite(m) && m > 0 ? m : 1;
    shakeT = SHAKE_TIME * Math.min(3, Math.max(0.25, k));
  }

  return { fire, update, reset, shake };
}
