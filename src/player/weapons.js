/**
 * Weapon system: twelve weapons (three launch + seven shop expansion + two
 * merchant-exclusive), ownership-gated switching, auto-reload, minigun
 * spin-up, recoil, muzzle flash and low-poly viewmodels parented to the
 * camera.
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
 *   magnum  | semi-auto | 0.35 s between shots | 6   | 85, headshot x2.5| 0.012        | 36       | 2.2 s
 *   dmr     | semi-auto | 0.22 s between shots | 10  | 52, headshot x2.5| 0.006        | 70       | 2.0 s
 *   railgun | bolt      | 1.1 s between shots  | 3   | 240, headshot x2 | 0.0          | 12       | 3.0 s
 *   sawnoff | pump      | 0.55 s between shots | 2   | 14 x 10 pellets  | 0.09         | 30       | 1.8 s
 *   crossbow| bolt      | 1.6 s between shots  | 1   | 150, headshot x3 | 0.001        | 24       | 1.7 s
 *
 * Reload times for the four ORIGINAL expansion guns (smg/sniper/minigun/
 * grenade) are not fixed by the contract — picked to fit each weapon's size;
 * magnum/dmr/railgun carry their own spec reload times. The three new fire
 * intervals are also not spec-fixed — chosen to fit each weapon's weight.
 * Every other number above is verbatim.
 * Keys: 1/2/3 = launch guns (unchanged), 4/5/6/7 = smg/sniper/minigun/grenade,
 * 8/9/0 = magnum/dmr/railgun, "-" = sawnoff, "=" = crossbow.
 *
 * OWNERSHIP (expansion): pistol/shotgun/rifle are owned from the start; the
 * seven shop guns start with owned === false and MUST be bought in the shop.
 * The two merchant-exclusive guns (sawnoff/crossbow) are ALSO owned === false
 * at the start but are deliberately absent from the standard B-key shop
 * catalog — the physical merchant unlocks them through the same generic
 * weapons.unlock(name) surface. The shop (or main.js debug) unlocks one by
 * calling weapons.unlock("smg") —
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
 * values are written onto the RUNTIME entry by the internal applyDerivedStats()
 * helper, so combat.js and the HUD keep reading the same fields:
 *   damage  = base × (1 + 0.2 × dmg)          → ×1.0 / 1.2 / 1.4 / 1.6
 *   magSize = floor(base × (1 + 0.25 × mag))  → ×1.0 / 1.25 / 1.5 / 1.75
 *   reload  = base × (1 − 0.12 × rl)          → ×1.0 / 0.88 / 0.76 / 0.64
 * (reload is resolved on demand via effectiveReloadTime() — reload() and the
 * viewmodel reload animation both use it; nothing is stored over the def).
 * Public surfaces added for this feature (all additive, beyond the frozen
 * factory signature, like reset()/unlock()):
 *   getStats(name?) → {name, damage, magSize, reloadTime, upgrades, attachments} — ACTIVE
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
 * TRADER ATTACHMENTS (deeper weapon customization — user request):
 * four per-gun parts bought from the physical Trader (systems/merchant.js)
 * and applied to the ACTIVE weapon. Every runtime entry carries
 * `attachments {scope, extmag, suppressor, laser}` (all false = stock); the
 * WEAPONS[] def table stays IMMUTABLE and the effective values are resolved
 * through helpers, then mirrored onto the runtime fields combat/HUD already
 * read:
 *   spread   = def.spread × scope(0.65) × suppressor(0.8) × laser(0.75),
 *              then × perk spreadMul; the runtime `spread` field carries the
 *              attachment part so the HUD crosshair tightens immediately.
 *   magSize  = ceil(floor(def.magSize × (1 + 0.25 × magLvl)) × 1.5) with
 *              extmag (upgrade first, then +50 %, rounded up); the current
 *              mag grows by exactly the added capacity.
 *   recoil   = cfg.kick × 0.75 (and the yaw jitter by the same factor) with
 *              suppressor; resolved at fire time.
 * Multipliers stack multiplicatively with upgrades and perks (scope +
 * suppressor + laser = ×0.39 spread). Public surfaces:
 *   applyAttachment(id) → true when the ACTIVE weapon gained the part; false
 *     for an unknown id or a duplicate on that weapon.
 *   getAttachmentInfo(name?) → {name, owned:{id:boolean}, prices:{id:number}}
 *     for the Trader UI (ACTIVE weapon when name is omitted, null unknown).
 * reset() clears every attachment (per-run); applySaveState() accepts an
 * optional `attachments` object per entry and restores it.
 *
 * PERK MODIFIERS (roguelite level-up layer — src/systems/perks.js):
 * a second, independent additive multiplier surface layered ON TOP of the
 * upgraded runtime values. The WEAPONS[] def table and the runtime
 * damage/magSize fields stay untouched (shop upgrade math keeps reading the
 * same upgraded base), and every effective value is resolved ON READ:
 *   damage   = runtime damage × damageMul
 *   interval = def interval / fireRateMul          (fire cooldown)
 *   reload   = effectiveReloadTime(i) × reloadMul  (upgraded reload × mul)
 *   spread   = runtime spread × spreadMul          (combat + crosshair)
 *   headshot = runtime headshotMult × headshotMul  (lucky perk, additive key)
 * Public surfaces:
 *   setPerkMods({damageMul, fireRateMul, reloadMul, spreadMul[, headshotMul]})
 *     → partial patch; missing keys keep their current value, non-finite
 *     values are ignored, defaults are 1. Returns the full mods object.
 *   getPerkMods() → a copy of the current mods (save/debug).
 * reset() returns every mod to 1. The "fire" event carries a PREVIEW copy of
 * the active weapon with the effective damage/spread/headshotMult baked in,
 * so combat.js needs no changes while the runtime entry stays upgrade-pure.
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
 * Switching: "Digit1".."Digit9", "Digit0", "Minus" and "Equal" or
 * input.wheelDir() (cycles OWNED weapons only). Reload: "KeyR" — allowed only
 * if not already reloading, mag < magSize and reserve > 0 (pistol reserve is
 * Infinity → never empty).
 * audio.reloadStart() at the start and audio.reloadEnd() at the end of the
 * reload timer (unchanged legacy calls).
 *
 * SOUNDS: the three launch guns keep audio.gunshot(name) EXACTLY as before.
 * audio.js is frozen (private context + synth helpers, and its gunshot()
 * switch only knows the three launch names), so the nine expansion/merchant
 * guns, the dry click and the minigun spin-up whir are synthesized by a small
 * LOCAL WebAudio synth in this file (contract B4: "âm thanh synth riêng trong
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
 * Bus events emitted: "fire" {weapon} (a PREVIEW copy carrying the effective
 *   perk-adjusted damage/spread/headshotMult), "spread" {value},
 *   "weapon-unlocked" {name} (once per ownership transition in unlock()),
 *   "weapon-switched" {name, index} (successful switchTo — the Trader overlay
 *   refreshes its per-gun attachment state).
 * Bus events consumed: "pickup" {kind:"ammo"} → every weapon gains reserve
 *   (active +magSize, the others +round(0.5*magSize); pistol's Infinity
 *   reserve stays Infinity) — the legacy rule generalized to twelve weapons;
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
 * @property {"pistol"|"shotgun"|"rifle"|"smg"|"sniper"|"minigun"|"grenade"|"magnum"|"dmr"|"railgun"|"sawnoff"|"crossbow"} name
 * @property {number} damage - per bullet (or per pellet). Grenade: 0 — its
 *   payload is the explosion (explosives.js), not a hitscan ray.
 * @property {number} pellets - rays per shot: 1 | 8 | 1 | ...
 * @property {number} spread - cone half-angle in radians.
 * @property {number} mag - rounds in the magazine right now.
 * @property {number} magSize - magazine capacity.
 * @property {number} reserve - spare rounds; pistol is Infinity (unlimited).
 * @property {boolean} reloading
 * @property {boolean} owned - false for the seven shop guns and the two
 *   merchant-exclusive guns until unlocked.
 * @property {number} startReserve - the def's full-reserve value (shop "ammo"
 *   refill target); pistol is Infinity.
 * @property {boolean} [merchantOnly] - true for sawnoff/crossbow (never in
 *   the standard B-key shop catalog).
 * @property {number} [price] - merchant-exclusive asking price in dollars
 *   (sawnoff 650 / crossbow 750); undefined for every other weapon.
 * @property {number} headshotMult - headshot damage multiplier combat.js
 *   applies (default 2; sniper 3 — read from the weapon def, feature B6).
 * @property {boolean} explosive - grenade only: route "fire" to
 *   explosives.fire(origin, dir), never to combat.shoot.
 * @property {{dmg: number, mag: number, rl: number}} upgrades - GUN GAME 2.0
 *   (feature B): per-gun upgrade levels, one integer 0..3 per track
 *   ("dmg" = damage, "mag" = magazine size, "rl" = reload speed); 0 = stock.
 *   Effective damage/magSize are mirrored onto this entry by applyDerivedStats().
 * @property {{scope: boolean, extmag: boolean, suppressor: boolean, laser: boolean}} attachments
 *   TRADER ATTACHMENTS: per-gun flags (all false = stock). Effective
 *   spread/magSize are mirrored onto this entry by applyDerivedStats();
 *   recoil is resolved at fire time (see the header).
 */

/**
 * @typedef {Object} Weapons
 * @property {WeaponState[]} list - all twelve weapons; indices 0..2 pistol,
 *   shotgun, rifle (owned from the start), 3..9 smg, sniper, minigun, grenade,
 *   magnum, dmr, railgun (shop-only until unlocked), 10..11 sawnoff, crossbow
 *   (merchant-exclusive until unlocked).
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
 * @property {(name?: string) => ({name: string, damage: number, magSize: number, reloadTime: number, spread: number, headshotMult: number, interval: number, upgrades: {dmg: number, mag: number, rl: number}, attachments: {scope: boolean, extmag: boolean, suppressor: boolean, laser: boolean}} | null)} getStats
 *   GUN GAME 2.0 (feature B): EFFECTIVE stats of one weapon — the ACTIVE one
 *   when `name` is omitted; null for an unknown name. damage/magSize are the
 *   upgraded runtime values; reloadTime the upgraded duration. PERKS adds
 *   spread/headshotMult/interval (all perk-adjusted) without mutating the
 *   runtime entry. The shop UI and the save snapshot read through this
 *   (upgrade levels live in `upgrades`, integers 0..3).
 * @property {(name: string, patch: {dmg?: number, mag?: number, rl?: number}) => boolean} setUpgrades
 *   GUN GAME 2.0 (feature B): set upgrade levels for weapon `name` (partial
 *   patch — only the provided tracks change); every value is clamped to an
 *   integer 0..3 and the effective damage/magSize are recomputed in place.
 *   False for an unknown name. The shop's "upg:{weapon}:{track}" purchases
 *   and main.js's NG+/save-restore paths call this.
 * @property {(entries: Array<{name: string, owned?: boolean, reserve: number | null, upgrades?: {dmg?: number, mag?: number, rl?: number}, attachments?: {scope?: boolean, extmag?: boolean, suppressor?: boolean, laser?: boolean}}>) => void} applySaveState
 *   GUN GAME 2.0 (feature B / save-restore §3.4): apply a save's weapon
 *   entries AFTER reset() — owned === true owns (never un-owns), reserve
 *   null → Infinity (pistol) / number → clamped to ≥ 0, upgrade levels
 *   clamped to 0..3, and every restored gun comes back mag-full. Entries
 *   with unknown names are ignored. TRADER ATTACHMENTS: an optional
 *   `attachments` object restores the four flags (missing/false = not owned).
 * @property {(id: string) => boolean} applyAttachment
 *   TRADER ATTACHMENTS: fit one part ("scope"|"extmag"|"suppressor"|"laser")
 *   to the ACTIVE weapon. False for an unknown id or an already-owned part on
 *   that weapon. extmag grows the current mag by the added capacity.
 * @property {(name?: string) => ({name: string, owned: Record<string, boolean>, prices: Record<string, number>} | null)} getAttachmentInfo
 *   TRADER ATTACHMENTS: the ACTIVE weapon's owned flags + the four prices
 *   (name → null for an unknown weapon). Consumed by ui/merchant.js.
 * @property {(patch: {damageMul?: number, fireRateMul?: number, reloadMul?: number, spreadMul?: number, headshotMul?: number}) => {damageMul: number, fireRateMul: number, reloadMul: number, spreadMul: number, headshotMul: number}} setPerkMods
 *   PERKS: apply the multiplicative perk budget (partial patch, defaults 1).
 *   Effective damage/interval/reload/spread/headshot are resolved on read —
 *   runtime damage/magSize stay upgrade-pure.
 * @property {() => {damageMul: number, fireRateMul: number, reloadMul: number, spreadMul: number, headshotMul: number}} getPerkMods
 *   PERKS: a copy of the current perk multipliers ({…:1} at stock).
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
  {
    // EXPANSION (user request "bổ sung nhiều loại súng"): heavy revolver.
    // Frozen spec: 85 dmg, mag 6, reserve 36, reload 2.2 s, headshot x2.5.
    name: "magnum",
    mode: "semi",            // one shot per click
    interval: 0.35,          // not spec-fixed — heavy revolver cadence
    damage: 85,
    pellets: 1,
    spread: 0.012,
    magSize: 6,
    startReserve: 36,
    reloadTime: 2.2,
    headshotMult: 2.5,
    kick: 0.055,
    yawKick: 0.005,
    vmKick: 0.11,
    flash: 9,
  },
  {
    // EXPANSION: semi-auto marksman rifle — accurate, flat trajectory.
    // Frozen spec: 52 dmg, mag 10, reserve 70, reload 2.0 s, headshot x2.5.
    name: "dmr",
    mode: "semi",
    interval: 0.22,          // not spec-fixed — fast semi-auto tap
    damage: 52,
    pellets: 1,
    spread: 0.006,
    magSize: 10,
    startReserve: 70,
    reloadTime: 2.0,
    headshotMult: 2.5,
    kick: 0.028,
    yawKick: 0.003,
    vmKick: 0.07,
    flash: 7,
  },
  {
    // EXPANSION: bolt-action railgun — pinpoint, huge single-shot damage.
    // Frozen spec: 240 dmg, mag 3, reserve 12, reload 3.0 s, headshot x2.
    name: "railgun",
    mode: "bolt",
    interval: 1.1,           // not spec-fixed — charge/bolt cycle
    damage: 240,
    pellets: 1,
    spread: 0.0,
    magSize: 3,
    startReserve: 12,
    reloadTime: 3.0,
    headshotMult: 2,
    kick: 0.07,
    yawKick: 0,
    vmKick: 0.14,
    flash: 12,
  },
  {
    // MERCHANT-EXCLUSIVE (physical merchant, NOT the standard B-key shop):
    // double-barrel sawn-off shotgun — brutal up close, 2-shell break action.
    // Frozen spec: 0.55 s between shots, 14 x 10 pellets, spread 0.09
    // (very wide), mag 2, reserve 30, reload 1.8 s, headshot x2, price $650.
    name: "sawnoff",
    mode: "pump",
    interval: 0.55,
    damage: 14,
    pellets: 10,
    spread: 0.09,
    magSize: 2,
    startReserve: 30,
    reloadTime: 1.8,
    headshotMult: 2,
    kick: 0.06,
    yawKick: 0.012,
    vmKick: 0.14,
    flash: 12,
    price: 650,
    merchantOnly: true,
  },
  {
    // MERCHANT-EXCLUSIVE (physical merchant): bolt-action crossbow — silent,
    // pinpoint, one bolt per magazine. Frozen spec: 1.6 s between shots,
    // 150 dmg, spread 0.001, mag 1, reserve 24, reload 1.7 s, headshot x3,
    // no muzzle flash, price $750.
    name: "crossbow",
    mode: "bolt",
    interval: 1.6,
    damage: 150,
    pellets: 1,
    spread: 0.001,
    magSize: 1,
    startReserve: 24,
    reloadTime: 1.7,
    headshotMult: 3,
    kick: 0.025,
    yawKick: 0,
    vmKick: 0.06,
    flash: 0,                // no muzzle light — silent weapon
    price: 750,
    merchantOnly: true,
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

// TRADER ATTACHMENTS (user request) — FROZEN ids/prices/effects. The merchant
// catalog imports this table so prices can never drift between the two files.
// Every multiplier stacks multiplicatively on top of the upgraded runtime
// stats and the independent perk surface.
//   scope      −35 % spread (×0.65)
//   extmag     +50 % magazine capacity (upgrade first, then ceil)
//   suppressor −25 % recoil kick, −20 % spread (×0.8)
//   laser      −25 % spread (×0.75) + cosmetic red dot
export const ATTACHMENTS = Object.freeze([
  Object.freeze({ id: "scope", price: 450, spreadMul: 0.65 }),
  Object.freeze({ id: "extmag", price: 400, magMul: 1.5 }),
  Object.freeze({ id: "suppressor", price: 500, spreadMul: 0.8, kickMul: 0.75 }),
  Object.freeze({ id: "laser", price: 350, spreadMul: 0.75 }),
]);

const ATTACHMENT_BY_ID = Object.create(null);
for (let i = 0; i < ATTACHMENTS.length; i++) {
  ATTACHMENT_BY_ID[ATTACHMENTS[i].id] = ATTACHMENTS[i];
}
const EXT_MAG_MULT = 1.5;

// PERKS (src/systems/perks.js): the second, independent multiplier surface.
// Values are plain multipliers resolved on read; 1 = stock. headshotMul is an
// additive fifth key (the "lucky" perk) beyond the four the perk module's
// damage/firerate/reload/steady picks drive.
const PERK_MOD_KEYS = ["damageMul", "fireRateMul", "reloadMul", "spreadMul", "headshotMul"];
const PERK_MUL_MIN = 0.05;
const PERK_MUL_MAX = 20;
const PERK_MODS_DEFAULT = {
  damageMul: 1,
  fireRateMul: 1,
  reloadMul: 1,
  spreadMul: 1,
  headshotMul: 1,
};

const DRAW_TIME = 0.3;    // s — switch/draw animation; firing blocked while drawing
const RECOIL_TAU = 0.07;  // s — exponential recovery (~94% back at 0.2 s, per header)
const FLASH_TIME = 0.04;  // s — muzzle flash (spec: 40 ms)
const VM_KICK_TAU = 0.055; // s — viewmodel kick-back recovery
const VM_POS = { x: 0.26, y: -0.24, z: -0.5 }; // lower-right of the camera

// --- local synth for the expansion guns (see SOUNDS in the header) -----------
const SETTINGS_KEY = "gungame.settings"; // the key settings.js persists

/**
 * Tiny self-contained WebAudio synth: the nine expansion/merchant gun shots,
 * the dry click and the minigun spin-up whir. audio.js is frozen (its
 * context/helpers are private and its gunshot() only knows the three launch
 * guns), so this file owns its own synth per contract B4. Mirrors audio.js's
 * lifecycle: context created lazily after the first user gesture, every
 * method a safe no-op before that, master gain follows
 * "settings-changed" {patch.volume}.
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
    magnum() {
      // Heavy revolver boom: deep body, long low tail, brief metallic crack.
      noise({ dur: 0.3, type: "lowpass", freq: 380, gain: 0.55 });
      noise({ dur: 0.5, type: "lowpass", freq: 170, gain: 0.34, when: 0.01 });
      noise({ dur: 0.08, type: "bandpass", freq: 1700, q: 0.8, gain: 0.2 });
      tone({ type: "sine", f0: 112, f1: 40, dur: 0.34, gain: 0.5 });
    },
    dmr() {
      // Sharp marksman crack: bright snap + tight low thump, no long tail.
      noise({ dur: 0.08, type: "bandpass", freq: 3300, q: 1.2, gain: 0.42 });
      noise({ dur: 0.2, type: "lowpass", freq: 750, gain: 0.2, when: 0.004 });
      noise({ dur: 0.05, type: "highpass", freq: 7000, gain: 0.15 });
      tone({ type: "square", f0: 230, f1: 95, dur: 0.06, gain: 0.17 });
    },
    railgun() {
      // Electric whine rising into the shot, then a zap + deep discharge.
      tone({ type: "sawtooth", f0: 420, f1: 1900, dur: 0.16, gain: 0.13 });
      noise({ dur: 0.22, type: "highpass", freq: 2600, gain: 0.32, when: 0.14 });
      noise({ dur: 0.36, type: "bandpass", freq: 950, q: 0.6, gain: 0.4, when: 0.15 });
      tone({ type: "square", f0: 1500, f1: 280, dur: 0.09, gain: 0.1, when: 0.13 });
      tone({ type: "sine", f0: 92, f1: 38, dur: 0.32, gain: 0.42, when: 0.14 });
    },
    sawnoff() {
      // Merchant double-barrel: huge short boom + the break-action double
      // click as the empty shells are flicked out.
      noise({ dur: 0.34, type: "lowpass", freq: 300, gain: 0.72 });
      noise({ dur: 0.5, type: "lowpass", freq: 120, gain: 0.52, when: 0.006 });
      noise({ dur: 0.09, type: "bandpass", freq: 1500, q: 0.7, gain: 0.34 });
      tone({ type: "sine", f0: 88, f1: 32, dur: 0.38, gain: 0.62 });
      // Double-click: two tight metallic action ticks, slightly apart.
      noise({ dur: 0.024, type: "highpass", freq: 3200, gain: 0.2, when: 0.3 });
      tone({ type: "square", f0: 1250, f1: 720, dur: 0.022, gain: 0.09, when: 0.3 });
      noise({ dur: 0.022, type: "highpass", freq: 2800, gain: 0.16, when: 0.38 });
      tone({ type: "square", f0: 980, f1: 600, dur: 0.02, gain: 0.08, when: 0.38 });
    },
    crossbow() {
      // Taut string release: a short, quiet thwip — no boom, no muzzle crack.
      noise({ dur: 0.05, type: "bandpass", freq: 2700, q: 1.8, gain: 0.12 });
      tone({ type: "triangle", f0: 330, f1: 110, dur: 0.08, gain: 0.14 });
      noise({ dur: 0.13, type: "lowpass", freq: 520, gain: 0.08, when: 0.01 });
      tone({ type: "sine", f0: 190, f1: 85, dur: 0.05, gain: 0.05, when: 0.02 });
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

const GUN_SYNTH_SHOTS = {
  smg: true,
  sniper: true,
  minigun: true,
  grenade: true,
  magnum: true,
  dmr: true,
  railgun: true,
  sawnoff: true,
  crossbow: true,
};

export function createWeapons(camera, input, audio, bus) {
  const gunSynth = createGunSynth(bus);

  /** A fresh stock attachment set (all four parts off). */
  function emptyAttachments() {
    return { scope: false, extmag: false, suppressor: false, laser: false };
  }

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
    // Merchant-exclusive metadata (additive; ignored by combat/HUD). The
    // physical merchant reads these to price its two guns; the standard shop
    // catalog deliberately never lists them.
    merchantOnly: w.merchantOnly === true,
    price: w.price,
    // GUN GAME 2.0 (feature B): every gun starts stock; the shop's
    // "upg:{weapon}:{track}" purchases raise these (0..3 per track) and
    // applyDerivedStats() mirrors the effect onto damage/magSize above.
    upgrades: { dmg: 0, mag: 0, rl: 0 },
    // TRADER ATTACHMENTS: per-gun flags, all off at the start of a run.
    attachments: emptyAttachments(),
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
  // PERKS: independent multipliers resolved on read (never written onto the
  // runtime damage/magSize). reset() restores every key to 1.
  let perkMods = { ...PERK_MODS_DEFAULT };

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
    sand: mat(0x6e6148),    // expansion: dmr furniture
    // expansion: railgun energy accents — strong blue self-glow.
    glow: new THREE.MeshStandardMaterial({
      color: 0x0a2b3a,
      roughness: 0.35,
      metalness: 0.55,
      emissive: 0x2fa8ff,
      emissiveIntensity: 1.6,
    }),
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

  // --- weapon-pack viewmodels (each silhouette clearly distinct) --------------

  /** Chunky double-action revolver: fat frame, exposed cylinder, short barrel. */
  function buildMagnum() {
    const g = new THREE.Group();
    g.add(box(mats.body, 0.062, 0.085, 0.26, 0, 0.01, -0.04));       // heavy frame
    g.add(box(mats.dark, 0.036, 0.045, 0.42, 0, 0.028, -0.3));       // barrel + shroud
    g.add(cyl(mats.steel, 0.052, 0.13, 0, 0.005, -0.12, 10));        // revolver cylinder
    g.add(box(mats.accent, 0.02, 0.014, 0.26, 0, -0.022, -0.3));     // underlug
    g.add(box(mats.grip, 0.052, 0.16, 0.078, 0, -0.085, 0.08, 0.3)); // grip
    g.add(box(mats.steel, 0.022, 0.04, 0.03, 0, 0.055, 0.075));      // hammer
    g.add(box(mats.accent, 0.018, 0.018, 0.03, 0, 0.075, -0.42));    // front sight
    g.add(box(mats.dark, 0.012, 0.012, 0.05, 0, 0.062, 0.04));       // rear sight
    return g;
  }

  /** Long scoped marksman rifle: sand furniture, straight mag, big optic. */
  function buildDmr() {
    const g = new THREE.Group();
    g.add(box(mats.sand, 0.056, 0.086, 0.54, 0, 0, -0.1));           // long receiver
    g.add(box(mats.dark, 0.026, 0.026, 0.62, 0, 0.018, -0.62));      // barrel
    g.add(box(mats.dark, 0.034, 0.034, 0.1, 0, 0.018, -0.96));       // muzzle brake
    g.add(cyl(mats.dark, 0.04, 0.26, 0, 0.09, -0.2, 10));            // scope tube
    g.add(cyl(mats.accent, 0.048, 0.03, 0, 0.09, -0.32, 10));        // objective ring
    g.add(cyl(mats.accent, 0.044, 0.025, 0, 0.09, -0.08, 10));       // ocular ring
    g.add(box(mats.steel, 0.016, 0.045, 0.03, 0, 0.048, -0.12));     // scope mount
    g.add(box(mats.steel, 0.016, 0.045, 0.03, 0, 0.048, -0.27));     // scope mount
    g.add(box(mats.accent, 0.045, 0.15, 0.07, 0, -0.105, -0.08, -0.12)); // straight mag
    g.add(box(mats.sand, 0.052, 0.09, 0.28, 0, -0.02, 0.3, 0.06));   // stock
    g.add(box(mats.steel, 0.03, 0.045, 0.12, 0, 0.06, 0.15));        // cheek rest
    g.add(box(mats.grip, 0.046, 0.11, 0.06, 0, -0.085, 0.13, 0.32)); // grip
    g.add(box(mats.steel, 0.014, 0.02, 0.03, 0.045, 0.02, 0.02));    // bolt handle
    return g;
  }

  /** Futuristic railgun: twin rails, coil rings, glowing blue energy accents. */
  function buildRailgun() {
    const g = new THREE.Group();
    g.add(box(mats.dark, 0.075, 0.1, 0.44, 0, 0, -0.02));            // main housing
    // Twin rails running forward + their blue energy strips.
    g.add(box(mats.steel, 0.02, 0.022, 0.56, -0.042, 0.055, -0.5));
    g.add(box(mats.steel, 0.02, 0.022, 0.56, 0.042, 0.055, -0.5));
    g.add(box(mats.glow, 0.014, 0.012, 0.5, -0.042, 0.03, -0.5));
    g.add(box(mats.glow, 0.014, 0.012, 0.5, 0.042, 0.03, -0.5));
    g.add(box(mats.glow, 0.016, 0.008, 0.4, 0, 0.075, -0.42));       // top charge strip
    // Coil rings around the rails.
    for (let i = 0; i < 4; i++) {
      g.add(cyl(mats.glow, 0.062, 0.018, 0, 0.042, -0.24 - i * 0.1, 12));
    }
    g.add(cyl(mats.steel, 0.036, 0.05, 0, 0.042, -0.82, 10));        // muzzle collar
    // Energy cell + grip + stock.
    g.add(cyl(mats.glow, 0.045, 0.1, 0, -0.04, 0.08, 10));
    g.add(box(mats.steel, 0.066, 0.12, 0.1, 0, -0.1, 0.02));         // cell housing
    g.add(box(mats.grip, 0.046, 0.12, 0.062, 0, -0.1, 0.16, 0.3));   // grip
    g.add(box(mats.dark, 0.058, 0.085, 0.16, 0, -0.005, 0.3));       // stock
    g.add(box(mats.glow, 0.012, 0.05, 0.02, 0, 0.06, -0.16));        // status light
    return g;
  }

  // --- merchant-exclusive viewmodels -----------------------------------------

  /**
   * Sawn-off double-barrel: stubby twin barrels, very wide muzzle face,
   * wooden pistol grip and a tiny break-action receiver. Silhouette reads
   * "hand cannon" next to the long pump shotgun.
   */
  function buildSawnoff() {
    const g = new THREE.Group();
    g.add(box(mats.body, 0.082, 0.092, 0.19, 0, 0, 0.03));            // break-action receiver
    // Twin short barrels side by side (the whole point of the silhouette).
    g.add(cyl(mats.dark, 0.031, 0.3, -0.026, 0.018, -0.24, 10));
    g.add(cyl(mats.dark, 0.031, 0.3, 0.026, 0.018, -0.24, 10));
    g.add(box(mats.steel, 0.118, 0.086, 0.028, 0, 0.018, -0.39));     // wide muzzle face
    g.add(cyl(mats.dark, 0.026, 0.022, -0.026, 0.018, -0.405, 10));   // left bore
    g.add(cyl(mats.dark, 0.026, 0.022, 0.026, 0.018, -0.405, 10));    // right bore
    g.add(box(mats.wood, 0.058, 0.17, 0.078, 0, -0.115, 0.105, 0.3)); // wooden pistol grip
    g.add(box(mats.steel, 0.04, 0.014, 0.08, 0, -0.045, 0.0));        // trigger guard
    g.add(box(mats.accent, 0.014, 0.018, 0.02, 0, 0.052, -0.36));     // front bead sight
    return g;
  }

  /**
   * Crossbow: wide swept horizontal limbs, twin string strands to the rail,
   * long bolt rail, small scope/sight block and a wooden stock. No muzzle
   * device — the def carries flash 0 (fire() never lights the muzzle).
   */
  function buildCrossbow() {
    const g = new THREE.Group();
    g.add(box(mats.wood, 0.052, 0.075, 0.34, 0, -0.005, 0.16));       // wooden stock
    g.add(box(mats.grip, 0.046, 0.105, 0.06, 0, -0.085, 0.13, 0.32)); // pistol grip
    g.add(box(mats.dark, 0.032, 0.024, 0.52, 0, 0.04, -0.22));        // bolt rail
    // Swept horizontal limbs — two angled arms span the full width.
    const limbL = box(mats.steel, 0.2, 0.018, 0.032, -0.1, 0.035, -0.38);
    limbL.rotation.y = 0.12;
    const limbR = box(mats.steel, 0.2, 0.018, 0.032, 0.1, 0.035, -0.38);
    limbR.rotation.y = -0.12;
    g.add(limbL);
    g.add(limbR);
    g.add(box(mats.accent, 0.04, 0.03, 0.045, 0, 0.035, -0.38));      // limb riser
    // String: two thin strands from the limb tips back to the rail center.
    const strL = box(mats.accent, 0.31, 0.006, 0.006, -0.095, 0.035, -0.25);
    strL.rotation.y = -0.9;
    const strR = box(mats.accent, 0.31, 0.006, 0.006, 0.095, 0.035, -0.25);
    strR.rotation.y = 0.9;
    g.add(strL);
    g.add(strR);
    // Scope tube + mounts above the rail; small front sight block.
    g.add(cyl(mats.dark, 0.032, 0.2, 0, 0.105, -0.16, 10));
    g.add(cyl(mats.accent, 0.038, 0.025, 0, 0.105, -0.26, 10));
    g.add(cyl(mats.accent, 0.036, 0.02, 0, 0.105, -0.06, 10));
    g.add(box(mats.steel, 0.014, 0.04, 0.025, 0, 0.068, -0.1));
    g.add(box(mats.steel, 0.014, 0.04, 0.025, 0, 0.068, -0.22));
    g.add(box(mats.dark, 0.01, 0.04, 0.05, 0, 0.058, -0.4));          // bolt clip
    g.scale.setScalar(0.82); // wide horizontal limbs read too close at 1.0
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
    buildMagnum(),
    buildDmr(),
    buildRailgun(),
    buildSawnoff(),
    buildCrossbow(),
  ];
  for (let i = 0; i < models.length; i++) {
    models[i].visible = i === current;
    vmRoot.add(models[i]);
  }
  const minigunBarrels = models[5].userData.barrels || null;

  // --- cosmetic attachment meshes --------------------------------------------
  // One suppressor tube + one laser dot per viewmodel (12 extra low-poly
  // meshes, no lights). Toggled from the owning weapon's flags; the group's
  // own `visible` still follows the active slot, so only the held gun shows.
  // z = barrel tip in the model's local space, len = tube length behind it.
  const MUZZLE_TIPS = [
    { x: 0, y: 0.03, z: -0.22, len: 0.12, r: 0.026 }, // pistol
    { x: 0, y: 0.02, z: -0.75, len: 0.14, r: 0.03 },  // shotgun
    { x: 0, y: 0.015, z: -0.59, len: 0.14, r: 0.028 }, // rifle
    { x: 0, y: 0.02, z: -0.36, len: 0.12, r: 0.024 }, // smg
    { x: 0, y: 0.015, z: -0.78, len: 0.16, r: 0.026 }, // sniper
    { x: 0, y: 0.01, z: -0.46, len: 0.14, r: 0.036 }, // minigun
    { x: 0, y: 0.01, z: -0.33, len: 0.12, r: 0.038 }, // grenade
    { x: 0, y: 0.028, z: -0.51, len: 0.14, r: 0.03 }, // magnum
    { x: 0, y: 0.018, z: -1.01, len: 0.16, r: 0.028 }, // dmr
    { x: 0, y: 0.042, z: -0.845, len: 0.14, r: 0.032 }, // railgun
    { x: 0, y: 0.018, z: -0.405, len: 0.12, r: 0.032 }, // sawnoff
    { x: 0, y: 0.04, z: -0.48, len: 0.12, r: 0.026 }, // crossbow
  ];
  const laserMat = new THREE.MeshBasicMaterial({
    color: 0xff2a2a,
    toneMapped: false,
  });
  const laserGeo = new THREE.SphereGeometry(0.008, 6, 6);
  for (let i = 0; i < models.length; i++) {
    const tip = MUZZLE_TIPS[i];
    if (!tip) continue;
    const suppressorMesh = cyl(
      mats.dark,
      tip.r,
      tip.len,
      tip.x,
      tip.y,
      tip.z - tip.len / 2,
      8
    );
    suppressorMesh.visible = false;
    models[i].add(suppressorMesh);
    const laserDot = new THREE.Mesh(laserGeo, laserMat);
    laserDot.position.set(tip.x + 0.028, tip.y + 0.012, tip.z - 0.006);
    laserDot.visible = false;
    models[i].add(laserDot);
    models[i].userData.suppressorMesh = suppressorMesh;
    models[i].userData.laserDot = laserDot;
  }

  /** Mirror every gun's attachment flags onto its cosmetic meshes. */
  function syncAttachmentModels() {
    for (let i = 0; i < models.length; i++) {
      const a = list[i].attachments || {};
      if (models[i].userData.suppressorMesh) {
        models[i].userData.suppressorMesh.visible = a.suppressor === true;
      }
      if (models[i].userData.laserDot) {
        models[i].userData.laserDot.visible = a.laser === true;
      }
    }
  }
  syncAttachmentModels();

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

  /** Combined attachment spread multiplier (1 when none are fitted). */
  function attachmentSpreadMul(w) {
    const a = w.attachments;
    if (!a) return 1;
    let mul = 1;
    for (let i = 0; i < ATTACHMENTS.length; i++) {
      const part = ATTACHMENTS[i];
      if (part.spreadMul && a[part.id]) mul *= part.spreadMul;
    }
    return mul;
  }

  /** Suppressor recoil multiplier (applied to pitch + yaw kick at fire time). */
  function attachmentKickMul(w) {
    return w.attachments && w.attachments.suppressor
      ? ATTACHMENT_BY_ID.suppressor.kickMul
      : 1;
  }

  /**
   * Mirror entry i's effective damage/magSize/spread onto the runtime entry.
   * The WEAPONS[] def table stays immutable; upgrades apply first, then the
   * attachment multipliers (extmag rounds the upgraded capacity UP, exactly
   * +50 % of the upgraded mag). Called after every upgrade/attachment change
   * (init, reset, unlock, setUpgrades, applyAttachment, applySaveState) so
   * combat/HUD keep reading the same fields with no other changes.
   */
  function applyDerivedStats(w, i) {
    const def = WEAPONS[i];
    w.damage = def.damage * (1 + UPG_DMG_PER_LEVEL * w.upgrades.dmg);
    const upgradedMag = Math.floor(
      def.magSize * (1 + UPG_MAG_PER_LEVEL * w.upgrades.mag)
    );
    w.magSize =
      w.attachments && w.attachments.extmag
        ? Math.ceil(upgradedMag * EXT_MAG_MULT)
        : upgradedMag;
    w.spread = def.spread * attachmentSpreadMul(w);
    // Defensive: a lowered mag upgrade (or a restored save) can never leave
    // the current mag above its capacity.
    if (w.mag > w.magSize) w.mag = w.magSize;
  }

  /** Effective reload duration (s) of weapon index i — def × rl discount. */
  function effectiveReloadTime(i) {
    return WEAPONS[i].reloadTime * (1 - UPG_RL_PER_LEVEL * list[i].upgrades.rl);
  }

  // --- perk modifiers (PERKS) --------------------------------------------------
  // The four spec keys drive damage/fire-rate/reload/spread; headshotMul is
  // the additive fifth key used by the "lucky" perk. All values are clamped
  // sane so a corrupt caller can never zero a stat or divide by zero.

  /** Clamp one multiplier; non-finite input keeps the current value. */
  function clampMul(key, v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return perkMods[key];
    return Math.min(PERK_MUL_MAX, Math.max(PERK_MUL_MIN, n));
  }

  /**
   * PERKS: partial patch of the multiplier surface. Missing keys keep their
   * current value; every present finite value is clamped to [0.05, 20].
   * @param {Partial<typeof PERK_MODS_DEFAULT>} [patch]
   */
  function setPerkMods(patch) {
    if (patch && typeof patch === "object") {
      for (let i = 0; i < PERK_MOD_KEYS.length; i++) {
        const key = PERK_MOD_KEYS[i];
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
          perkMods[key] = clampMul(key, patch[key]);
        }
      }
    }
    return getPerkMods();
  }

  /** PERKS: a copy of the current multipliers (save/debug). */
  function getPerkMods() {
    return {
      damageMul: perkMods.damageMul,
      fireRateMul: perkMods.fireRateMul,
      reloadMul: perkMods.reloadMul,
      spreadMul: perkMods.spreadMul,
      headshotMul: perkMods.headshotMul,
    };
  }

  /** Effective per-shot damage = runtime (upgraded) damage × damageMul. */
  function perkDamage(w) {
    return w.damage * perkMods.damageMul;
  }

  /** Effective spread (radians) = runtime spread × spreadMul. */
  function perkSpread(w) {
    return w.spread * perkMods.spreadMul;
  }

  /** Effective headshot multiplier = runtime × headshotMul (lucky). */
  function perkHeadshot(w) {
    return w.headshotMult * perkMods.headshotMul;
  }

  /** Effective fire interval (s) = def interval / fireRateMul. */
  function perkInterval(i) {
    return WEAPONS[i].interval / perkMods.fireRateMul;
  }

  /** Effective reload duration = upgraded reload × reloadMul. */
  function perkReload(i) {
    return effectiveReloadTime(i) * perkMods.reloadMul;
  }

  /**
   * Preview copy of one weapon handed to combat via the "fire" event: the
   * runtime entry stays upgrade-pure while combat sees perk-adjusted fields.
   */
  function effectiveShotState(w) {
    return {
      ...w,
      damage: perkDamage(w),
      spread: perkSpread(w),
      headshotMult: perkHeadshot(w),
      upgrades: w.upgrades,
    };
  }

  function fire() {
    const w = list[current];
    const cfg = WEAPONS[current];
    w.mag -= 1; // shotgun: one shell, not per pellet
    // Round left the barrel — main.js routes this to combat.shoot(weapon),
    // or to explosives.fire(origin, dir) when w.explosive (grenade). The
    // preview copy carries the perk-adjusted damage/spread/headshot values
    // without mutating the runtime entry (see PERK MODIFIERS in the header).
    const shot = effectiveShotState(w);
    bus.dispatchEvent(new CustomEvent("fire", { detail: { weapon: shot } }));
    bus.dispatchEvent(new CustomEvent("spread", { detail: { value: shot.spread } }));
    // Recoil: pitch up + tiny random yaw, recovered exponentially in update().
    // TRADER ATTACHMENTS: the suppressor scales both the pitch kick and the
    // yaw jitter by ×0.75 (resolved here, never written onto the def).
    const kickMul = attachmentKickMul(w);
    recoilPitch += cfg.kick * kickMul;
    recoilYaw += (Math.random() * 2 - 1) * cfg.yawKick * kickMul;
    vmKick = cfg.vmKick;
    // Crossbow (flash 0) never lights the muzzle — silent, flashless shot.
    if (cfg.flash > 0) {
      // Laser fitting tints the flash red (cosmetic; no new mechanics).
      muzzleLight.color.setHex(
        w.attachments && w.attachments.laser ? 0xff4a3a : 0xffb066
      );
      muzzleLight.intensity = cfg.flash * (0.85 + Math.random() * 0.3);
      flashTimer = FLASH_TIME;
    } else {
      muzzleLight.intensity = 0;
      flashTimer = 0;
    }
    cooldown = perkInterval(current); // fire-rate perks shorten the cycle
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
    // Additive signal for the Trader overlay: the attachment "OWNED" state is
    // per active gun, so the UI refreshes when the held weapon changes.
    bus.dispatchEvent(
      new CustomEvent("weapon-switched", {
        detail: { name: list[current].name, index: current },
      })
    );
  }

  function reload() {
    const w = list[current];
    autoReloadT = -1; // any real reload supersedes the pending auto-reload
    if (w.reloading || w.mag >= w.magSize || !(w.reserve > 0)) return;
    w.reloading = true;
    reloadTimer = perkReload(current); // upgraded reload × perk reload speed
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

    // Switching: 1..9, 0, -, =, or wheel. Poll every one-shot input every
    // frame so the pending flags never go stale.
    let want = -1;
    if (input.wasPressed("Digit1")) want = 0;
    else if (input.wasPressed("Digit2")) want = 1;
    else if (input.wasPressed("Digit3")) want = 2;
    else if (input.wasPressed("Digit4")) want = 3;
    else if (input.wasPressed("Digit5")) want = 4;
    else if (input.wasPressed("Digit6")) want = 5;
    else if (input.wasPressed("Digit7")) want = 6;
    else if (input.wasPressed("Digit8")) want = 7;
    else if (input.wasPressed("Digit9")) want = 8;
    else if (input.wasPressed("Digit0")) want = 9;
    else if (input.wasPressed("Minus")) want = 10;   // sawn-off (merchant)
    else if (input.wasPressed("Equal")) want = 11;   // crossbow (merchant)
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
      // (the EFFECTIVE duration — upgrades × perk reload speed).
      const p = 1 - Math.max(0, reloadTimer) / perkReload(current);
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
      w.attachments = emptyAttachments();      // TRADER: parts are per-run
      applyDerivedStats(w, i);                 // effective damage/magSize/spread
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
    // PERKS: a fresh run starts with the multiplier surface at stock.
    perkMods = { ...PERK_MODS_DEFAULT };
    if (minigunBarrels) minigunBarrels.rotation.z = 0;
    syncAttachmentModels();
  }

  // EXPANSION — shop integration surface: unlock a weapon by name (idempotent;
  // false for unknown names). The fresh gun arrives full: mag + startReserve,
  // and stock (upgrade levels 0 — GUN GAME 2.0 feature B).
  function unlock(name) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].name !== name) continue;
      if (!list[i].owned) {
        list[i].owned = true;
        // Fresh gun = stock upgrades AND no attachments (idempotent for an
        // already-owned gun, which keeps both — only the ownership transition
        // resets these).
        list[i].upgrades = { dmg: 0, mag: 0, rl: 0 };
        list[i].attachments = emptyAttachments();
        applyDerivedStats(list[i], i);
        list[i].mag = list[i].magSize;
        list[i].reserve = WEAPONS[i].startReserve;
        syncAttachmentModels();
        // Additive ownership signal: achievements (arsenal), the HUD bar and
        // the merchant UI can react without polling. Emitted AFTER the flag
        // lands so listeners see the final state.
        bus.dispatchEvent(
          new CustomEvent("weapon-unlocked", { detail: { name: list[i].name } })
        );
      }
      return true;
    }
    return false;
  }

  // GUN GAME 2.0 (feature B) — effective-stats accessor for the shop UI and
  // the save snapshot. No name (or empty) → the ACTIVE weapon; an unknown
  // name → null (never throws). `upgrades`/`attachments` are copies — callers
  // cannot mutate the runtime through them.
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
      damage: perkDamage(w), // effective (upgraded × perk damage)
      magSize: w.magSize, // effective (upgraded, extmag-applied) value
      reloadTime: perkReload(idx), // effective (upgraded × perk reload)
      // PERKS preview fields (additive): combat/HUD/debug can read the exact
      // effective values without touching the runtime entry.
      spread: perkSpread(w),
      headshotMult: perkHeadshot(w),
      interval: perkInterval(idx),
      upgrades: { dmg: w.upgrades.dmg, mag: w.upgrades.mag, rl: w.upgrades.rl },
      attachments: {
        scope: w.attachments.scope === true,
        extmag: w.attachments.extmag === true,
        suppressor: w.attachments.suppressor === true,
        laser: w.attachments.laser === true,
      },
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
      applyDerivedStats(list[i], i);
      return true;
    }
    return false;
  }

  // TRADER ATTACHMENTS — fit one part to the ACTIVE weapon. False for an
  // unknown id or a part already owned by that gun (max 1 of each per weapon).
  // extmag raises magSize by +50 % of the UPGRADED capacity (rounded up) and
  // grows the current mag by exactly the added capacity.
  function applyAttachment(id, name) {
    if (typeof id !== "string") return false;
    const part = ATTACHMENT_BY_ID[id];
    if (!part) return false;
    let idx = current;
    if (typeof name === "string" && name) {
      idx = -1;
      for (let i = 0; i < list.length; i++) {
        if (list[i].name === name) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return false;
    }
    const w = list[idx];
    if (!w || !w.attachments) return false;
    if (w.attachments[id] === true) return false;
    const oldMagSize = w.magSize;
    w.attachments[id] = true;
    applyDerivedStats(w, idx);
    if (id === "extmag") {
      const added = Math.max(0, w.magSize - oldMagSize);
      w.mag = Math.min(w.magSize, w.mag + added);
    }
    syncAttachmentModels();
    return true;
  }

  // TRADER ATTACHMENTS — ownership + prices for the merchant UI. No name (or
  // empty) → the ACTIVE weapon; an unknown name → null (never throws).
  function getAttachmentInfo(name) {
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
    const owned = {};
    const prices = {};
    for (let i = 0; i < ATTACHMENTS.length; i++) {
      const part = ATTACHMENTS[i];
      owned[part.id] = w.attachments[part.id] === true;
      prices[part.id] = part.price;
    }
    return { name: w.name, owned, prices };
  }

  // GUN GAME 2.0 (feature B, save-restore §3.4) — apply a save's weapon
  // entries, in order, AFTER reset() has brought everything to stock:
  //   owned === true  → owned = true (a save can never UN-own a gun);
  //   reserve         → null maps back to Infinity (pistol, P4-K3), a finite
  //                     number to max(0, round) — anything else is ignored;
  //   upgrades        → clamped to integers 0..3, then effects re-applied;
  //   attachments     → TRADER extension (additive, optional): the four
  //                     flags restored; missing/false = not owned;
  //   mag             → magSize (restored guns come back mag-full).
  // Unknown weapon names are skipped. Ownership-only entries (no
  // upgrades/attachments/reserve) are also fine.
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
      let changed = false;
      if (entry.upgrades && typeof entry.upgrades === "object") {
        w.upgrades = {
          dmg: clampLevel(entry.upgrades.dmg),
          mag: clampLevel(entry.upgrades.mag),
          rl: clampLevel(entry.upgrades.rl),
        };
        changed = true;
      }
      if (entry.attachments && typeof entry.attachments === "object") {
        const a = entry.attachments;
        w.attachments = {
          scope: a.scope === true,
          extmag: a.extmag === true,
          suppressor: a.suppressor === true,
          laser: a.laser === true,
        };
        changed = true;
      }
      if (changed) applyDerivedStats(w, idx);
      w.mag = w.magSize; // restored guns come back mag-full (P4-K6)
    }
    syncAttachmentModels();
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
    // TRADER ATTACHMENTS — active-weapon customization (see header):
    applyAttachment,
    getAttachmentInfo,
    // PERKS — independent multiplier surface (see header PERK MODIFIERS):
    setPerkMods,
    getPerkMods,
  };
}
