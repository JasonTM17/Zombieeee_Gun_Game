/**
 * Weapon system: seven weapons (three launch + four expansion), ownership-
 * gated switching, auto-reload, minigun spin-up, recoil, muzzle flash and
 * low-poly viewmodels parented to the camera.
 *
 * Weapon table (spec numbers — DO NOT change):
 *   name    | mode      | interval             | mag | damage           | spread (rad) | reserve  | reload
 *   pistol  | semi-auto | per click            | 12  | 25               | 0.01         | Infinity | 1.2 s
 *   shotgun | pump      | 0.9 s between shots  | 6   | 12 x 8 pellets   | 0.06         | 24       | 2.0 s
 *   rifle   | full-auto | 600 rpm (0.1 s)      | 30  | 18               | 0.02         | 90       | 1.8 s
 *   smg     | full-auto | 850 rpm              | 32  | 11               | 0.035        | 160      | 1.6 s
 *   sniper  | bolt      | 1.4 s between shots  | 5   | 110, headshot x3 | 0.002        | 25       | 2.4 s
 *   minigun | spin-up   | 0.6 s spin, 1100 rpm | 150 | 8                | 0.05         | 300      | 3.6 s
 *   grenade | pump      | 1.1 s between shots  | 4   | explosion (B5)   | 0.01         | 12       | 2.6 s
 *
 * Reload times for the four EXPANSION guns are not fixed by the contract —
 * picked to fit each weapon's size; every other number above is verbatim.
 * Keys: 1/2/3 = launch guns (unchanged), 4/5/6/7 = smg/sniper/minigun/grenade.
 *
 * OWNERSHIP (expansion): pistol/shotgun/rifle are owned from the start; the
 * four new guns start with owned === false and MUST be bought in the shop.
 * The shop (or main.js debug) unlocks one by calling weapons.unlock("smg") —
 * or equivalently by setting list[i].owned = true directly; switching filters
 * on the flag either way. unlock() also hands the fresh gun a full mag plus
 * its startReserve (a stable target for the shop's "ammo" full refill, which
 * reads list[i].startReserve). Digit/wheel switching only cycles among OWNED
 * weapons; switchTo() refuses un-owned targets. reset() (fresh run) restores
 * exactly the three starter weapons — money resets to 0 on a fresh run, so
 * bought guns reset with it (the shop economy stays meaningful).
 *
 * WEAPON UPGRADES (GUN GAME 2.0 feature B — docs/EXPANSION-P4.md §4.1/P4-K6):
 * every weapon instance carries `upgrades {dmg: 0..3, mag: 0..3, rl: 0..3}`
 * (0 = stock). The WEAPONS[] def table above stays IMMUTABLE — the effective
 * values are written onto the RUNTIME entry by the internal applyUpgrades()
 * helper, so combat.js and the HUD keep reading the same fields:
 *   damage  = base × (1 + 0.2 × dmg)          → ×1.0 / 1.2 / 1.4 / 1.6
 *   magSize = floor(base × (1 + 0.25 × mag))  → ×1.0 / 1.25 / 1.5 / 1.75
 *   reload  = base × (1 − 0.12 × rl)          → ×1.0 / 0.88 / 0.76 / 0.64
 * (reload is resolved on demand via effectiveReloadTime() — reload() and the
 * viewmodel reload animation both use it; nothing is stored over the def).
 * Public surfaces added for this feature (all additive, beyond the frozen
 * factory signature, like reset()/unlock()):
 *   getStats(name?) → {name, damage, magSize, reloadTime, upgrades} — ACTIVE
 *     weapon when name is omitted, null for an unknown name (shop UI + the
 *     save snapshot read through this).
 *   setUpgrades(name, patch) → set track levels from the shop / restore path;
 *     every provided track is clamped to an integer 0..3, then effects apply.
 *   applySaveState(entries) → restore {name, owned, reserve, upgrades} from a
 *     save after reset() (save/continue, feature P4-A). Never un-owns a
 *     weapon; reserve null → Infinity (pistol); unknown names are ignored;
 *     restored guns come back mag-full.
 * reset() zeroes the upgrades (fresh run); main.js re-applies the captured
 * levels on NG+/save-restore through setUpgrades()/applySaveState().
 *
 * AUTO-RELOAD (feature A — three cases, exactly per contract):
 * 1. The shot that empties the mag with reserve > 0 arms a ONE-SHOT pending
 *    auto-reload that fires 0.35 s later. It is never re-armed while pending,
 *    and it is cancelled by a weapon switch, by any reload() call, or when it
 *    triggers itself.
 * 2. A trigger pull with mag === 0 and reserve > 0 plays a dry click and
 *    reloads IMMEDIATELY (supersedes the pending timer from case 1).
 * 3. mag === 0 AND reserve === 0 keeps the legacy behavior: silent dry pull,
 *    no auto reload. Pistol reserve is Infinity → always > 0 (Infinity-safe:
 *    only comparisons and Math.min are ever used on it).
 *
 *    The debug fire path (__game.fireWeapon in main.js) does NOT run fire()
 *    — main.js decrements the mag and routes combat/explosives itself — so
 *    main.js arms the same pending reload through the armAutoReloadAfterShot()
 *    extra to stay at feature-A parity with the live trigger.
 *
 * MINIGUN (expansion integration note 4): holding the trigger spins the
 * barrels for 0.6 s before the first round leaves; while spinning below the
 * threshold no shot is emitted. The spin state RESETS when the trigger is
 * released, when a reload starts, and on weapon switch.
 *
 * GRENADE (expansion integration note 3): its "fire" event carries
 * weapon.explosive === true (name "grenade") and must be routed by main.js
 * to explosives.fire(origin, dir) — the projectile NEVER goes through
 * combat.shoot (the def's damage is 0, so even a missed routing is harmless).
 * The launcher itself still consumes a shell, recoils, flashes and kicks
 * exactly like every other gun.
 *
 * Firing flow — fire-rate + ammo + reload gating happen HERE. When a round
 * actually leaves the barrel this module:
 *   1. decrements mag (shotgun: by 1 shell, not per pellet),
 *   2. emits "fire" {weapon: WeaponState} on the bus — main.js routes it to
 *      combat.shoot(weapon), or to explosives.fire() for the grenade,
 *   3. emits "spread" {value: weapon.spread} (radians) for the crosshair,
 *   4. kicks recoil — camera pitch UP then recovered back to the pre-shot aim
 *      over ~0.2 s (magnitudes per weapon, tuned subtle),
 *   5. flashes a warm PointLight parented to the camera (viewmodel muzzle) for
 *      ~40 ms,
 *   6. plays the shot sound (see SOUNDS below).
 *
 * Trigger inputs (read in update()):
 *   pistol / shotgun / sniper / grenade → input.consumeClick()
 *     (shotgun/grenade additionally gated by their pump interval, sniper by
 *     the 1.4 s bolt cycle)
 *   rifle / smg  → input.isDown("Mouse0") gated by the auto interval
 *   minigun      → input.isDown("Mouse0"), 0.6 s spin-up gate, then auto
 *
 * Switching: "Digit1".."Digit7" or input.wheelDir() (cycles OWNED weapons
 * only). Reload: "KeyR" — allowed only if not already reloading,
 * mag < magSize and reserve > 0 (pistol reserve is Infinity → never empty).
 * audio.reloadStart() at the start and audio.reloadEnd() at the end of the
 * reload timer (unchanged legacy calls).
 *
 * SOUNDS: the three launch guns keep audio.gunshot(name) EXACTLY as before.
 * audio.js is frozen (private context + synth helpers, and its gunshot()
 * switch only knows the three launch names), so the four expansion guns, the
 * dry click and the minigun spin-up whir are synthesized by a small LOCAL
 * WebAudio synth in this file (contract B4: "âm thanh synth riêng trong
 * weapons.js"). The synth lazily creates its own AudioContext after the first
 * user gesture (same lifecycle as audio.js), follows "settings-changed"
 * {patch.volume} on the bus, and is seeded from the same localStorage key
 * settings.js persists ("gungame.settings").
 *
 * Recoil composition note: the player controller rewrites camera.rotation each
 * frame from its own yaw/pitch. Because main.js calls player.update() BEFORE
 * weapons.update(), this module applies the DELTA between its current recoil
 * offset and the one it applied last frame on top of camera.rotation — that
 * stays correct regardless of the controller's absolute writes. (explosives.js
 * camera shake composes the same way and is order-independent with this.)
 *
 * Viewmodel: simple low-poly primitives parented to the camera (lower-right),
 * with a small draw animation on switch and a dip/rotate animation while
 * reloading. The minigun's barrel cluster visibly spins with the spin state.
 *
 * Bus events emitted: "fire" {weapon}, "spread" {value}.
 * Bus events consumed: "pickup" {kind:"ammo"} → every weapon gains reserve
 *   (active +magSize, the others +round(0.5*magSize); pistol's Infinity
 *   reserve stays Infinity) — the legacy rule generalized to seven weapons;
 *   "settings-changed" {patch.volume} → local synth master gain.
 *
 * @param {import("three").PerspectiveCamera} camera
 * @param {import("../core/input.js").Input} input
 * @param {import("../core/audio.js").Audio} audio
 * @param {EventTarget} bus
 * @returns {Weapons}
 */

/**
 * Full runtime descriptor of ONE weapon. combat.shoot() consumes
 * damage/pellets/spread/headshotMult from this; main.js routes
 * explosive === true shots to explosives.fire(); HUD/debug consume the
 * getState() subset.
 *
 * @typedef {Object} WeaponState
 * @property {"pistol"|"shotgun"|"rifle"|"smg"|"sniper"|"minigun"|"grenade"} name
 * @property {number} damage - per bullet (or per pellet). Grenade: 0 — its
 *   payload is the explosion (explosives.js), not a hitscan ray.
 * @property {number} pellets - rays per shot: 1 | 8 | 1 | ...
 * @property {number} spread - cone half-angle in radians.
 * @property {number} mag - rounds in the magazine right now.
 * @property {number} magSize - magazine capacity.
 * @property {number} reserve - spare rounds; pistol is Infinity (unlimited).
 * @property {boolean} reloading
 * @property {boolean} owned - false for the four shop guns until unlocked.
 * @property {number} startReserve - the def's full-reserve value (shop "ammo"
 *   refill target); pistol is Infinity.
 * @property {number} headshotMult - headshot damage multiplier combat.js
 *   applies (default 2; sniper 3 — read from the weapon def, feature B6).
 * @property {boolean} explosive - grenade only: route "fire" to
 *   explosives.fire(origin, dir), never to combat.shoot.
 * @property {{dmg: number, mag: number, rl: number}} upgrades - GUN GAME 2.0
 *   (feature B): per-gun upgrade levels, one integer 0..3 per track
 *   ("dmg" = damage, "mag" = magazine size, "rl" = reload speed); 0 = stock.
 *   Effective damage/magSize are mirrored onto this entry by applyUpgrades().
 */

/**
 * @typedef {Object} Weapons
 * @property {WeaponState[]} list - all seven weapons; indices 0..2 pistol,
 *   shotgun, rifle (owned from the start), 3..6 smg, sniper, minigun, grenade
 *   (shop-only until unlocked).
 * @property {number} current - index of the active weapon in list.
 * @property {(dt: number) => void} update
 *   Advance one frame (dt seconds): read trigger/switch/reload inputs, run
 *   timers (incl. the pending auto-reload and the minigun spin), animate
 *   viewmodel + recoil + muzzle light.
 * @property {(i: number) => void} switchTo - switch to list index i; refused
 *   for un-owned weapons (expansion).
 * @property {() => void} reload - start reloading the active weapon if allowed.
 * @property {(name: string) => boolean} unlock
 *   EXPANSION integration surface (beyond the frozen contract, like reset()):
 *   mark the weapon `name` owned and hand it a full mag + startReserve.
 *   Idempotent; returns false for an unknown name. The shop's weapon
 *   purchases and the debug buyWeapon() call this (or set owned directly).
 * @property {() => void} armAutoReloadAfterShot
 *   EXPANSION debug surface (beyond the frozen contract, like reset()/
 *   unlock()): arm the one-shot pending auto-reload exactly as fire() would
 *   after a shot that empties the ACTIVE weapon's mag (feature A case 1) —
 *   no-op unless mag === 0 && reserve > 0. __game.fireWeapon() in main.js
 *   bypasses fire(), so main.js calls this after each debug shot.
 * @property {() => WeaponState} getState
 *   The ACTIVE weapon's state; HUD/debug use at least
 *   {name, mag, magSize, reserve, reloading, spread}.
 * @property {(name?: string) => ({name: string, damage: number, magSize: number, reloadTime: number, upgrades: {dmg: number, mag: number, rl: number}} | null)} getStats
 *   GUN GAME 2.0 (feature B): EFFECTIVE stats of one weapon — the ACTIVE one
 *   when `name` is omitted; null for an unknown name. damage/magSize are the
 *   upgraded runtime values, reloadTime the upgraded duration. The shop UI
 *   and the save snapshot read through this (upgrade levels live in
 *   `upgrades`, integers 0..3).
 * @property {(name: string, patch: {dmg?: number, mag?: number, rl?: number}) => boolean} setUpgrades
 *   GUN GAME 2.0 (feature B): set upgrade levels for weapon `name` (partial
 *   patch — only the provided tracks change); every value is clamped to an
 *   integer 0..3 and the effective damage/magSize are recomputed in place.
 *   False for an unknown name. The shop's "upg:{weapon}:{track}" purchases
 *   and main.js's NG+/save-restore paths call this.
 * @property {(entries: Array<{name: string, owned?: boolean, reserve: number | null, upgrades?: {dmg?: number, mag?: number, rl?: number}}>) => void} applySaveState
 *   GUN GAME 2.0 (feature B / save-restore §3.4): apply a save's weapon
 *   entries AFTER reset() — owned === true owns (never un-owns), reserve
 *   null → Infinity (pistol) / number → clamped to ≥ 0, upgrade levels
 *   clamped to 0..3, and every restored gun comes back mag-full. Entries
 *   with unknown names are ignored.
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
  {
    // EXPANSION B4: auto 850 rpm, mag 32, dmg 11, spread 0.035, reserve 160.
    name: "smg",
    mode: "auto",
    interval: 60 / 850,      // rpm → s/round, exact
    damage: 11,
    pellets: 1,
    spread: 0.035,
    magSize: 32,
    startReserve: 160,
    reloadTime: 1.6,         // not spec-fixed — see table note
    kick: 0.0042,
    yawKick: 0.0022,
    vmKick: 0.022,
    flash: 4.5,
  },
  {
    // EXPANSION B4: bolt-action 1.4 s between shots, dmg 110, HEADSHOT x3 (B6).
    name: "sniper",
    mode: "bolt",
    interval: 1.4,
    damage: 110,
    pellets: 1,
    spread: 0.002,
    magSize: 5,
    startReserve: 25,
    reloadTime: 2.4,         // not spec-fixed — see table note
    headshotMult: 3,         // B6: combat.js reads this from the state
    kick: 0.05,
    yawKick: 0.004,
    vmKick: 0.12,
    flash: 10,
  },
  {
    // EXPANSION B4: 0.6 s spin-up before the first round, then 1100 rpm.
    name: "minigun",
    mode: "spinup",
    spinup: 0.6,
    interval: 60 / 1100,     // rpm → s/round, exact
    damage: 8,
    pellets: 1,
    spread: 0.05,
    magSize: 150,
    startReserve: 300,
    reloadTime: 3.6,         // not spec-fixed — see table note
    kick: 0.0035,
    yawKick: 0.0028,
    vmKick: 0.018,
    flash: 5,
  },
  {
    // EXPANSION B4/B5: pump 1.1 s; the shot is a projectile for explosives.js.
    name: "grenade",
    mode: "pump",
    interval: 1.1,
    damage: 0,               // payload is the 4 m / 90 dmg explosion (B5)
    pellets: 1,
    spread: 0.01,            // cosmetic crosshair only — the projectile is true
    magSize: 4,
    startReserve: 12,
    reloadTime: 2.6,         // not spec-fixed — see table note
    explosive: true,         // main.js routes "fire" → explosives.fire()
    kick: 0.045,
    yawKick: 0.003,
    vmKick: 0.1,
    flash: 7,
  },
];

const STARTER_COUNT = 3;  // pistol/shotgun/rifle — owned from the start
const AUTO_RELOAD_DELAY = 0.35; // spec: auto-reload 0.35 s after the mag empties
const BARREL_SPIN_MAX = 22;     // rad/s at full minigun spin (viewmodel only)

// GUN GAME 2.0 feature B — upgrade formulas (docs/EXPANSION-P4.md P4-K6,
// FROZEN): per-level factors applied to the immutable def values. Levels are
// integers 0..3; 0 = stock (×1.0 on every track).
const UPG_MAX_LEVEL = 3;
const UPG_DMG_PER_LEVEL = 0.2;  // damage   × (1 + 0.2 × lvl)
const UPG_MAG_PER_LEVEL = 0.25; // magSize  × (1 + 0.25 × lvl), floored
const UPG_RL_PER_LEVEL = 0.12;  // reload   × (1 − 0.12 × lvl)

const DRAW_TIME = 0.3;    // s — switch/draw animation; firing blocked while drawing
const RECOIL_TAU = 0.07;  // s — exponential recovery (~94% back at 0.2 s, per header)
const FLASH_TIME = 0.04;  // s — muzzle flash (spec: 40 ms)
const VM_KICK_TAU = 0.055; // s — viewmodel kick-back recovery
const VM_POS = { x: 0.26, y: -0.24, z: -0.5 }; // lower-right of the camera

// --- local synth for the expansion guns (see SOUNDS in the header) -----------
const SETTINGS_KEY = "gungame.settings"; // the key settings.js persists

/**
 * Tiny self-contained WebAudio synth: the four expansion gun shots, the dry
 * click and the minigun spin-up whir. audio.js is frozen (its context/helpers
 * are private and its gunshot() only knows the three launch guns), so this
 * file owns its own synth per contract B4. Mirrors audio.js's lifecycle:
 * context created lazily after the first user gesture, every method a safe
 * no-op before that, master gain follows "settings-changed" {patch.volume}.
 *
 * @param {EventTarget} bus
 */
function createGunSynth(bus) {
  /** @type {AudioContext|null} */
  let ctx = null;
  /** @type {GainNode|null} */
  let master = null;
  /** @type {AudioBuffer|null} */
  let noiseBuf = null;
  // Seed from the persisted settings so the first shot already matches the
  // user's volume; live updates arrive via "settings-changed" below.
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
        ctx = null; // no WebAudio: every method stays a safe no-op
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

  /** Common guard: true only when the context can schedule audio now. */
  function ready() {
    if (!ctx || !master) return false;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx.state === "running" || ctx.state === "suspended";
  }

  /** Noise burst — same shape as audio.js's private helper. */
  function noise(o) {
    if (!ctx || !master || !noiseBuf) return;
    const t0 = ctx.currentTime + (o.when || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = o.rate || 1;
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

  /** Oscillator tone with optional exponential pitch glide. */
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

  // Per-gun voices — each clearly distinct from the three launch guns AND
  // from each other: smg a light fast crack, sniper a heavy boom, minigun a
  // buzzy rattle, grenade launcher a pneumatic thump.
  const shots = {
    smg() {
      noise({ dur: 0.07, type: "bandpass", freq: 2300, q: 0.9, gain: 0.34 });
      noise({ dur: 0.1, type: "lowpass", freq: 600, gain: 0.14, when: 0.004 });
      tone({ type: "sine", f0: 180, f1: 75, dur: 0.06, gain: 0.22 });
    },
    sniper() {
      noise({ dur: 0.28, type: "bandpass", freq: 1500, q: 0.7, gain: 0.5 });
      noise({ dur: 0.5, type: "lowpass", freq: 320, gain: 0.42, when: 0.01 });
      noise({ dur: 0.12, type: "highpass", freq: 6000, gain: 0.1 });
      tone({ type: "sine", f0: 95, f1: 38, dur: 0.3, gain: 0.42 });
    },
    minigun() {
      noise({ dur: 0.06, type: "bandpass", freq: 1900, q: 1.1, gain: 0.3 });
      tone({ type: "square", f0: 130, f1: 65, dur: 0.05, gain: 0.16 });
    },
    grenade() {
      noise({ dur: 0.16, type: "lowpass", freq: 420, gain: 0.45 });
      noise({ dur: 0.25, type: "lowpass", freq: 900, gain: 0.15, when: 0.05 });
      tone({ type: "sine", f0: 105, f1: 48, dur: 0.14, gain: 0.32 });
    },
  };

  function dry() {
    // Empty-mag click (feature A case 2) — audio.js exposes no such method.
    noise({ dur: 0.03, type: "highpass", freq: 2800, gain: 0.22 });
    tone({ type: "square", f0: 1050, f1: 640, dur: 0.035, gain: 0.15 });
  }

  function spin() {
    // Motor whir rising across the 0.6 s spin-up window.
    tone({ type: "sawtooth", f0: 55, f1: 150, dur: 0.55, gain: 0.09, attack: 0.02 });
    noise({ dur: 0.55, type: "bandpass", freq: 700, q: 2, gain: 0.05, attack: 0.03 });
  }

  return {
    shot(name) {
      if (!ready()) return;
      const f = shots[name];
      if (f) f();
    },
    dry() {
      if (ready()) dry();
    },
    spin() {
      if (ready()) spin();
    },
  };
}

const GUN_SYNTH_SHOTS = { smg: true, sniper: true, minigun: true, grenade: true };

export function createWeapons(camera, input, audio, bus) {
  const gunSynth = createGunSynth(bus);

  // Live runtime state, one entry per weapon (typedef WeaponState shape).
  const list = WEAPONS.map((w, i) => ({
    name: w.name,
    damage: w.damage,
    pellets: w.pellets,
    spread: w.spread,
    mag: w.magSize,
    magSize: w.magSize,
    reserve: w.startReserve,
    reloading: false,
    // EXPANSION: the three launch guns start owned; shop guns unlock via
    // unlock() (shop buy) — see header OWNERSHIP.
    owned: i < STARTER_COUNT,
    startReserve: w.startReserve,
    headshotMult: w.headshotMult || 2,
    explosive: w.explosive === true,
    // GUN GAME 2.0 (feature B): every gun starts stock; the shop's
    // "upg:{weapon}:{track}" purchases raise these (0..3 per track) and
    // applyUpgrades() mirrors the effect onto damage/magSize above.
    upgrades: { dmg: 0, mag: 0, rl: 0 },
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
  let autoReloadT = -1;      // >= 0 → seconds until the pending auto-reload fires
  let spinT = 0;             // minigun trigger-held seconds (0..spinup)

  // --- viewmodel: low-poly primitives parented to the camera ------------------
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
    olive: mat(0x49523c),   // expansion: sniper furniture
    steel: mat(0x3d444c),   // expansion: minigun frame
    red: mat(0x7a2323),     // expansion: minigun ammo box
  };

  function box(m, w, h, d, x, y, z, rx = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    return mesh;
  }

  /** Low-segment cylinder aligned along local Z (scope tubes, barrels). */
  function cyl(m, r, len, x, y, z, seg = 8) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
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

  // --- expansion viewmodels (low-poly, each silhouette clearly distinct) ------

  function buildSmg() {
    const g = new THREE.Group();
    g.add(box(mats.body, 0.05, 0.075, 0.3, 0, 0.01, -0.05));        // compact receiver
    g.add(box(mats.dark, 0.024, 0.024, 0.16, 0, 0.02, -0.28));      // short barrel
    g.add(box(mats.accent, 0.035, 0.2, 0.05, 0, -0.13, -0.02, 0.08)); // long mag
    g.add(box(mats.grip, 0.042, 0.1, 0.055, 0, -0.06, 0.09, 0.3));  // grip
    g.add(box(mats.dark, 0.035, 0.07, 0.045, 0, -0.05, -0.18, -0.15)); // front grip
    g.add(box(mats.dark, 0.015, 0.02, 0.14, 0, 0.02, 0.17));        // wire stock
    g.add(box(mats.accent, 0.016, 0.025, 0.02, 0, 0.055, -0.22));   // sight
    return g;
  }

  function buildSniper() {
    const g = new THREE.Group();
    g.add(box(mats.olive, 0.055, 0.075, 0.46, 0, 0, -0.06));        // long body
    g.add(box(mats.dark, 0.024, 0.024, 0.52, 0, 0.015, -0.52));     // long barrel
    g.add(cyl(mats.dark, 0.034, 0.18, 0, 0.078, -0.1));             // scope tube
    g.add(box(mats.steel, 0.014, 0.03, 0.02, 0, 0.045, -0.06));     // scope mount
    g.add(box(mats.steel, 0.014, 0.03, 0.02, 0, 0.045, -0.15));     // scope mount
    g.add(box(mats.olive, 0.05, 0.09, 0.24, 0, -0.02, 0.26, 0.08)); // stock
    g.add(box(mats.grip, 0.045, 0.1, 0.055, 0, -0.08, 0.1, 0.35));  // grip
    g.add(box(mats.steel, 0.05, 0.014, 0.014, 0.045, 0.02, 0.05));  // bolt handle
    return g;
  }

  function buildMinigun() {
    const g = new THREE.Group();
    g.add(box(mats.steel, 0.09, 0.11, 0.3, 0, 0, 0));               // heavy frame
    g.add(box(mats.red, 0.06, 0.08, 0.13, 0.075, -0.05, 0.05));     // ammo box
    g.add(box(mats.grip, 0.04, 0.09, 0.05, 0, -0.1, 0.12, 0.3));    // grip
    g.add(box(mats.dark, 0.035, 0.05, 0.08, -0.06, -0.07, -0.05));  // front handle
    // Rotating barrel cluster: 6 barrels on a ring + a central axle.
    const barrels = new THREE.Group();
    barrels.position.set(0, 0.01, -0.28);
    barrels.add(cyl(mats.dark, 0.013, 0.36, 0, 0, -0.18, 6));       // axle
    for (let b = 0; b < 6; b++) {
      const a = (b / 6) * Math.PI * 2;
      barrels.add(
        cyl(mats.dark, 0.011, 0.36, Math.cos(a) * 0.034, Math.sin(a) * 0.034, -0.18, 6)
      );
    }
    g.add(barrels);
    g.userData.barrels = barrels; // spun by update() with the minigun state
    return g;
  }

  function buildGrenadeLauncher() {
    const g = new THREE.Group();
    g.add(cyl(mats.olive, 0.05, 0.34, 0, 0.01, -0.16));             // fat tube
    g.add(cyl(mats.dark, 0.038, 0.05, 0, 0.01, -0.32));             // muzzle ring
    g.add(cyl(mats.steel, 0.058, 0.09, 0, -0.035, 0.05));           // drum
    g.add(box(mats.olive, 0.045, 0.07, 0.1, 0, -0.03, 0.16));       // breech
    g.add(box(mats.wood, 0.04, 0.045, 0.09, 0, -0.06, -0.18));      // pump grip
    g.add(box(mats.grip, 0.042, 0.1, 0.055, 0, -0.09, 0.12, 0.3));  // grip
    g.add(box(mats.accent, 0.016, 0.025, 0.02, 0, 0.07, -0.1));     // sight
    return g;
  }

  const vmRoot = new THREE.Group();
  vmRoot.position.set(VM_POS.x, VM_POS.y, VM_POS.z);
  camera.add(vmRoot);
  const models = [
    buildPistol(),
    buildShotgun(),
    buildRifle(),
    buildSmg(),
    buildSniper(),
    buildMinigun(),
    buildGrenadeLauncher(),
  ];
  for (let i = 0; i < models.length; i++) {
    models[i].visible = i === current;
    vmRoot.add(models[i]);
  }
  const minigunBarrels = models[5].userData.barrels || null;

  // Warm muzzle flash light living at the viewmodel muzzle (child of the
  // camera hierarchy → moves with the weapon, lights nothing when intensity 0).
  const muzzleLight = new THREE.PointLight(0xffb066, 0, 9, 2);
  muzzleLight.position.set(0.08, 0.08, -0.55);
  vmRoot.add(muzzleLight);

  // --- firing -----------------------------------------------------------------
  // FEATURE A case 1 (shared): a shot that empties the mag with spare ammo
  // arms the ONE-SHOT pending auto-reload 0.35 s out (Infinity-safe: the
  // pistol's reserve is Infinity and only a comparison is ever used on it).
  // Called from fire() after every real trigger shot AND exposed as the
  // armAutoReloadAfterShot() extra for __game.fireWeapon() — that debug path
  // in main.js bypasses fire() and must keep feature-A parity on its own.
  function armAutoReloadAfterShot() {
    const w = list[current];
    if (w.mag === 0 && w.reserve > 0) autoReloadT = AUTO_RELOAD_DELAY;
  }

  // --- weapon upgrades (GUN GAME 2.0 feature B) --------------------------------
  // The WEAPONS[] def table is immutable; effective values are written onto
  // the runtime entry (combat.js / HUD keep reading the same fields). The
  // reload duration is resolved on demand — nothing is stored over the def.

  /** Clamp one upgrade level to an integer 0..3 (bad patch / corrupt save). */
  function clampLevel(v) {
    const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
    return Math.min(UPG_MAX_LEVEL, Math.max(0, n));
  }

  /**
   * Mirror entry i's upgrade levels onto its runtime damage/magSize. Called
   * after every upgrade change (init, reset, unlock, setUpgrades,
   * applySaveState) so combat/HUD read upgraded values with no other changes.
   */
  function applyUpgrades(w, i) {
    const def = WEAPONS[i];
    w.damage = def.damage * (1 + UPG_DMG_PER_LEVEL * w.upgrades.dmg);
    w.magSize = Math.floor(def.magSize * (1 + UPG_MAG_PER_LEVEL * w.upgrades.mag));
  }

  /** Effective reload duration (s) of weapon index i — def × rl discount. */
  function effectiveReloadTime(i) {
    return WEAPONS[i].reloadTime * (1 - UPG_RL_PER_LEVEL * list[i].upgrades.rl);
  }

  function fire() {
    const w = list[current];
    const cfg = WEAPONS[current];
    w.mag -= 1; // shotgun: one shell, not per pellet
    // Round left the barrel — main.js routes this to combat.shoot(weapon),
    // or to explosives.fire(origin, dir) when w.explosive (grenade).
    bus.dispatchEvent(new CustomEvent("fire", { detail: { weapon: w } }));
    bus.dispatchEvent(new CustomEvent("spread", { detail: { value: w.spread } }));
    // Recoil: pitch up + tiny random yaw, recovered exponentially in update().
    recoilPitch += cfg.kick;
    recoilYaw += (Math.random() * 2 - 1) * cfg.yawKick;
    vmKick = cfg.vmKick;
    muzzleLight.intensity = cfg.flash * (0.85 + Math.random() * 0.3);
    flashTimer = FLASH_TIME;
    cooldown = cfg.interval;
    // Expansion guns own their synth (audio.gunshot doesn't know them);
    // the three launch guns keep the legacy call untouched.
    if (GUN_SYNTH_SHOTS[w.name]) gunSynth.shot(w.name);
    else audio.gunshot(w.name);
    // FEATURE A case 1: the shot that emptied the mag arms a one-shot
    // auto-reload 0.35 s out (reserve > 0; Infinity-safe comparison).
    armAutoReloadAfterShot();
  }

  // --- switching / reloading ----------------------------------------------------
  function switchTo(i) {
    if (!Number.isInteger(i) || i < 0 || i >= list.length || i === current) return;
    if (!list[i].owned) return; // expansion: no drawing a gun you don't own
    if (list[current].reloading) {
      // Switching cancels an in-progress reload (standard FPS behavior; the
      // mag is left as it was).
      list[current].reloading = false;
      reloadTimer = 0;
    }
    autoReloadT = -1; // a pending auto-reload dies with the switch (contract)
    spinT = 0;        // minigun spin resets on switch (integration note 4)
    current = i;
    drawT = 0;
    cooldown = DRAW_TIME; // no firing mid-draw
  }

  function reload() {
    const w = list[current];
    autoReloadT = -1; // any real reload supersedes the pending auto-reload
    if (w.reloading || w.mag >= w.magSize || !(w.reserve > 0)) return;
    w.reloading = true;
    reloadTimer = effectiveReloadTime(current); // upgraded reload speed (B)
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

  /** Next owned index stepping `step` (+1/-1) around the full list; -1 if none. */
  function cycleOwned(from, step) {
    const n = list.length;
    for (let k = 1; k <= n; k++) {
      const idx = (((from + step * k) % n) + n) % n;
      if (list[idx].owned) return idx;
    }
    return -1;
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

    // Switching: 1..7 or wheel. Poll every one-shot input every frame so the
    // pending flags never go stale.
    let want = -1;
    if (input.wasPressed("Digit1")) want = 0;
    else if (input.wasPressed("Digit2")) want = 1;
    else if (input.wasPressed("Digit3")) want = 2;
    else if (input.wasPressed("Digit4")) want = 3;
    else if (input.wasPressed("Digit5")) want = 4;
    else if (input.wasPressed("Digit6")) want = 5;
    else if (input.wasPressed("Digit7")) want = 6;
    else {
      const wd = input.wheelDir(); // -1 = scrolled down = next weapon
      if (wd !== 0) want = cycleOwned(current, wd === -1 ? 1 : -1);
    }
    if (want >= 0) switchTo(want);

    // Reload.
    if (input.wasPressed("KeyR")) reload();
    if (list[current].reloading) {
      reloadTimer -= dt;
      if (reloadTimer <= 0) finishReload();
    }

    // FEATURE A case 1: the pending one-shot auto-reload. reload() re-checks
    // every condition (not reloading, mag < magSize, reserve > 0) and clears
    // the pending flag either way — it can never loop.
    if (autoReloadT >= 0) {
      autoReloadT -= dt;
      if (autoReloadT <= 0) reload();
    }

    // Trigger. Always flush the click so it can't leak across frames/weapons.
    const clicked = input.consumeClick();
    const active = list[current];
    const cfg = WEAPONS[current];
    const holding =
      cfg.mode === "auto" || cfg.mode === "spinup"
        ? input.isDown("Mouse0")
        : clicked;
    if (cfg.mode === "spinup") {
      // Minigun: barrels spin 0.6 s before the first round; the spin state
      // resets on release / reload / switch (integration note 4).
      if (!active.reloading && drawT >= 1 && holding) {
        if (spinT === 0) gunSynth.spin(); // one whir per spin-up
        spinT = Math.min(cfg.spinup, spinT + dt);
        if (spinT >= cfg.spinup && cooldown <= 0) {
          if (active.mag > 0) fire();
          // FEATURE A case 2: dry pull with spare ammo → click + reload NOW.
          else if (active.reserve > 0) {
            gunSynth.dry();
            reload();
          }
          // mag 0 AND reserve 0 → legacy silent dry pull (feature A case 3).
        }
      } else {
        spinT = 0;
      }
    } else if (!active.reloading && cooldown <= 0 && holding) {
      if (active.mag > 0) fire();
      // FEATURE A case 2 (dry click + immediate reload), then case 3.
      else if (active.reserve > 0) {
        gunSynth.dry();
        reload();
      }
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

    // Minigun barrel spin follows the spin state (stops when it resets).
    if (minigunBarrels && spinT > 0) {
      minigunBarrels.rotation.z -=
        (spinT / WEAPONS[5].spinup) * BARREL_SPIN_MAX * dt;
    }

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
      // Reload: dip + tilt inward and back over the whole reload duration
      // (the EFFECTIVE duration — upgraded reload speed, feature B).
      const p = 1 - Math.max(0, reloadTimer) / effectiveReloadTime(current);
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
  // game starts with full mags (nothing calls it automatically). EXPANSION:
  // ownership also resets to the three starter guns — a fresh run zeroes the
  // money, so shop-bought guns reset with it (see header OWNERSHIP).
  function reset() {
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      w.upgrades = { dmg: 0, mag: 0, rl: 0 }; // GUN GAME 2.0: back to stock
      applyUpgrades(w, i);                    // effective damage/magSize = base
      w.mag = w.magSize;
      w.reserve = WEAPONS[i].startReserve;
      w.reloading = false;
      w.owned = i < STARTER_COUNT;
    }
    current = 0;
    reloadTimer = 0;
    drawT = 0;
    cooldown = DRAW_TIME;
    recoilPitch = 0;
    recoilYaw = 0;
    lastPitchApplied = 0;
    lastYawApplied = 0;
    autoReloadT = -1;
    spinT = 0;
    if (minigunBarrels) minigunBarrels.rotation.z = 0;
  }

  // EXPANSION — shop integration surface: unlock a weapon by name (idempotent;
  // false for unknown names). The fresh gun arrives full: mag + startReserve,
  // and stock (upgrade levels 0 — GUN GAME 2.0 feature B).
  function unlock(name) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].name !== name) continue;
      if (!list[i].owned) {
        list[i].owned = true;
        list[i].mag = list[i].magSize;
        list[i].reserve = WEAPONS[i].startReserve;
        // Fresh gun = stock (idempotent for an already-owned gun, which keeps
        // its upgrades — only the ownership transition resets these).
        list[i].upgrades = { dmg: 0, mag: 0, rl: 0 };
        applyUpgrades(list[i], i);
      }
      return true;
    }
    return false;
  }

  // GUN GAME 2.0 (feature B) — effective-stats accessor for the shop UI and
  // the save snapshot. No name (or empty) → the ACTIVE weapon; an unknown
  // name → null (never throws). `upgrades` is a copy — callers cannot mutate
  // the runtime levels through it (writes go through setUpgrades()).
  function getStats(name) {
    let idx = -1;
    if (typeof name !== "string" || name === "") {
      idx = current;
    } else {
      for (let i = 0; i < list.length; i++) {
        if (list[i].name === name) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return null;
    }
    const w = list[idx];
    return {
      name: w.name,
      damage: w.damage, // effective (upgraded) value
      magSize: w.magSize, // effective (upgraded) value
      reloadTime: effectiveReloadTime(idx),
      upgrades: { dmg: w.upgrades.dmg, mag: w.upgrades.mag, rl: w.upgrades.rl },
    };
  }

  // GUN GAME 2.0 (feature B) — set upgrade levels from the shop's
  // "upg:{weapon}:{track}" purchase or main.js's NG+/restore paths. Partial
  // patch: only the tracks present on `patch` change; every value is clamped
  // to an integer 0..3; effects are applied immediately (damage/magSize in
  // place, reload resolved on demand). Returns false for an unknown name.
  function setUpgrades(name, patch) {
    if (typeof name !== "string") return false;
    for (let i = 0; i < list.length; i++) {
      if (list[i].name !== name) continue;
      if (patch && typeof patch === "object") {
        if ("dmg" in patch) list[i].upgrades.dmg = clampLevel(patch.dmg);
        if ("mag" in patch) list[i].upgrades.mag = clampLevel(patch.mag);
        if ("rl" in patch) list[i].upgrades.rl = clampLevel(patch.rl);
      }
      applyUpgrades(list[i], i);
      return true;
    }
    return false;
  }

  // GUN GAME 2.0 (feature B, save-restore §3.4) — apply a save's weapon
  // entries, in order, AFTER reset() has brought everything to stock:
  //   owned === true  → owned = true (a save can never UN-own a gun);
  //   reserve         → null maps back to Infinity (pistol, P4-K3), a finite
  //                     number to max(0, round) — anything else is ignored;
  //   upgrades        → clamped to integers 0..3, then effects re-applied;
  //   mag             → magSize (restored guns come back mag-full).
  // Unknown weapon names are skipped. Ownership-only entries (no
  // upgrades/reserve) are also fine.
  function applySaveState(entries) {
    if (!Array.isArray(entries)) return;
    for (let e = 0; e < entries.length; e++) {
      const entry = entries[e];
      if (!entry || typeof entry !== "object" || typeof entry.name !== "string") {
        continue;
      }
      let idx = -1;
      for (let i = 0; i < list.length; i++) {
        if (list[i].name === entry.name) {
          idx = i;
          break;
        }
      }
      if (idx < 0) continue; // unknown weapon name — ignore the entry
      const w = list[idx];
      if (entry.owned === true) w.owned = true; // never un-own
      const r = entry.reserve;
      if (r === null) w.reserve = Infinity;
      else if (typeof r === "number" && Number.isFinite(r)) {
        w.reserve = Math.max(0, Math.round(r));
      }
      if (entry.upgrades && typeof entry.upgrades === "object") {
        w.upgrades = {
          dmg: clampLevel(entry.upgrades.dmg),
          mag: clampLevel(entry.upgrades.mag),
          rl: clampLevel(entry.upgrades.rl),
        };
        applyUpgrades(w, idx);
      }
      w.mag = w.magSize; // restored guns come back mag-full (P4-K6)
    }
  }

  // Ammo pickup: active weapon gets a full mag, the others half a mag each.
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
    reset,   // extra, beyond the contract — see note above
    unlock,  // extra, beyond the contract — shop integration (see header)
    armAutoReloadAfterShot, // extra — debug fire path (see note above fire())
    getState: () => list[current],
    // GUN GAME 2.0 (feature B) — upgrade surfaces (see header WEAPON UPGRADES):
    getStats,
    setUpgrades,
    applySaveState,
  };
}
