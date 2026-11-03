/**
 * DOM HUD overlay rendered inside #ui (position absolute; index.html sets
 * #ui { pointer-events: none } — the HUD never re-enables it, it is not
 * clickable). ALL text goes through i18n.t() (extra keys may be registered
 * via i18n.registerBundle; core already provides score/wave/waveBanner/waveClear).
 *
 * Elements (per spec):
 * - Health bar, left corner, drains as hp drops.
 * - Ammo "mag / reserve" + weapon name, right corner (i18n-independent numbers;
 *   weapon name via weapon.name). Reserve shows "∞" for the pistol's Infinity.
 * - Wave + score, top center (i18n keys "wave", "score").
 * - Kill feed: 3 lines max, newest on top, each fading out (~3 s); listens
 *   "zombie-killed" on the bus. Boss types feed the same lines.
 * - Weapon slot bar: bottom center, twelve fixed slots in key order (1 pistol
 *   … 9 dmr, 0 railgun, - sawnoff, = crossbow) — digit + CSS-drawn icon + w*
 *   label; gold = active, dimmed +
 *   padlock = un-owned, "mag/reserve" + ammo tint + reload marker on the
 *   active slot (see the WEAPON SLOT BAR note below).
 * - Crosshair: 4 ticks that expand with the current spread — listens
 *   "spread" {value} (radians) on the bus; offset = base + value * scale.
 * - Hitmarker: an X at the center, white — bold red when headshot; listens
 *   "hit" {headshot, killed}. (The sound is played by combat.js directly.)
 * - Damage vignette: persistent red overlay whose opacity follows the MISSING
 *   hp (subtle at full hp); plus a STRONG flash when hp drops — detected in
 *   update() by comparing against the previous frame's hp ("nghe qua
 *   update(hp)"), strength proportional to the damage taken.
 * - Wave banner: big centered "WAVE n" (i18n "waveBanner" with {n}) shown ~2 s
 *   with fade on "wave-start" {n}; this module also plays audio.waveBanner()
 *   there (the HUD owns an audio reference), and may show a "waveClear"
 *   banner on "wave-clear".
 *
 * EXPANSION elements (docs/EXPANSION.md C6 — all self-styled inline because
 * style.css is outside this module's allowed file list):
 * - Money chip "TIỀN $xxx", bottom-left INSIDE the health block (directly
 *   above the hp row — "tiền cạnh máu"); listens "money-changed" {money,
 *   delta} and pulses gold/red on the delta.
 * - Boss bar, top center below the wave/score chips (never over the
 *   crosshair): boss name (i18n) + thick red bar. Shown on "boss-spawned"
 *   {type, zoneId, hp} (hp = spawn hp = max), hidden again on the
 *   "zombie-killed" of a boss type. The bar drains from the live boss hp
 *   passed through update()'s optional 4th argument (see HudExtras); without
 *   it the bar simply stays full until death.
 * - Zone toast "KHU VỰC MỚI MỞ: <zone>" on "zone-unlocked" {id, name}; hides
 *   itself after 3 s (spec).
 * - Shop hint "[B] — CỬA HÀNG" shown during the wave intermission: shown on
 *   "wave-clear" (the intermission starts there — waves.js phase machine),
 *   hidden on "wave-start" and while the shop overlay itself is open
 *   ("shop-open"/"shop-closed").
 * - Boss direction arrow: a small triangle orbiting the crosshair (ring
 *   radius ~34 px, under the crosshair ticks in paint order) that points
 *   toward the boss on the XZ plane while the boss is OUTSIDE the view cone.
 *   Pure 2D guide: needs the boss position + camera yaw via the optional 4th
 *   update() argument; without either it stays hidden. The in/out-of-view
 *   test is a cheap half-angle check against the view direction (pitch
 *   ignored); if main passes an explicit boolean `visible` on the boss data
 *   it is trusted instead.
 *
 * P1 story widgets (docs/EXPANSION-P1.md §5.4 — additive, nothing that
 * already exists changes behavior, the crosshair stays clear):
 * - Mission tracker, top right BELOW the kill feed (killfeed owns
 *   top: 18px; right: 18px — the tracker sits at top: 120px): one gold title
 *   row ("MISSION {n}/9 — {title}") + one row per objective ("obj_*"
 *   templates with live "2/3" progress; the glyph flips ✕→✓ on completion).
 *   Rebuilt on "mission-start" {index, titleKey, objectives}, updated in
 *   place by "objective-progress" {mission, objective, done, need}, flashed
 *   by "mission-complete" {index, reward} (which also shows the
 *   mission_complete_toast toast — main pays the money), cleared by
 *   "mission-reset". Hidden while no mission is active (index 0).
 * - Quota chip "🧟 {n}/{need}" — FIRST chip in the .topinfo row (order:
 *   quota · wave · score). Cached from the quota objective of the current
 *   mission (mission-start / objective-progress); shown only while the
 *   player stands in the quota district — update()'s extras now carry
 *   `district` (main computes city.districtAt every frame). No district
 *   field on extras → the chip keeps its event-driven state. "quota-done"
 *   shows the quota_done_toast toast.
 * - "E — INTERACT" hint chip centered under the crosshair (never over it):
 *   shown/hidden by "interact-near" {target, near} with the target's display
 *   name (the target_* / item_* keys via the K1 id→key mapping of §7.3).
 * - "gate-open" {from, to} → the shared toast shows gate_open_toast with the
 *   destination district's name.
 *
 * P1 i18n keys: this module CONSUMES keys owned by missions.js (the
 * mission_* / obj_* / quota_* / gate_open_toast / interact_hint /
 * mission_complete_toast / item_* / target_* families) and city.js
 * (district_*). It registers an identical-text FALLBACK bundle
 * (verbatim docs/STORY.md §7) so the widgets stay readable even when this
 * module renders before those owners register; i18n merges per key and
 * identical values make registration order irrelevant.
 *
 * P2 widgets (docs/EXPANSION-P2.md §4.3 — additive, every old element keeps
 * its behavior):
 * - Compass strip, very top center (top: 6px, min(560px, 72vw) × 16px, drawn
 *   on one small canvas): projects the current mission (gold diamond) and the
 *   running event (red/amber/green by type) onto the SAME camera basis as the
 *   boss arrow (right/fwd formula below); a center tick is the player's
 *   heading; markers beyond the ±0.8 rad half-FOV clamp to the edge as
 *   outward chevrons. Data comes from update()'s extras (`mission`, `event`,
 *   `yaw` — main derives, P2-K13/K7; the HUD never guesses). Hidden when: no
 *   yaw, no marker, the M map is open ("map-visibility" {open}), or the HUD
 *   is hidden.
 * - Event banner: big centered text on "event-start" (key
 *   "event_"+type+"_banner"), 2.5 s via WAAPI, on its OWN node (never the
 *   wave banner node).
 * - Event toasts on "event-end" (shared toast node): reason "opened" →
 *   event_supply_opened (+{money}$ from the payload), "rescued" →
 *   event_survivor_rescued, "lost" → event_survivor_lost.
 * - Bloodmoon chip: red countdown chip in the top-left corner
 *   ("event_bloodmoon_timer", seconds ticked down by the measured update()
 *   dt), armed by "bloodmoon-active" {active:true}, released by
 *   {active:false} (with the event_bloodmoon_end toast) or by the bloodmoon
 *   "event-end". Frozen while paused (update() is not called — same principle
 *   as the events scheduler).
 * - P2 event_* i18n keys are CONSUMED (owner events.js §7.1); this module
 *   registers an identical-text fallback bundle (HUD_P2_BUNDLE) exactly like
 *   the P1 one above. All P2 widgets clear on run end (gameover/menu) and on
 *   show(false).
 *
 * WEAPON SLOT BAR (additive; user request "các ô vũ khí ở dưới để người chơi
 * biết"): fixed bottom-center strip of the twelve weapon slots in key order
 * (1 pistol, 2 shotgun, 3 rifle, 4 smg, 5 sniper, 6 minigun, 7 grenade,
 * 8 magnum, 9 dmr, 0 railgun, - sawnoff, = crossbow). Each
 * slot shows the digit, a CSS-drawn silhouette (no image assets — see
 * WEAPON_SLOTS) and the existing w* label; the ACTIVE slot is gold-lit and
 * carries the compact "mag/reserve" (∞ for the pistol) plus a 2 px ammo tint
 * and a reload marker; an UN-OWNED shop gun is dimmed/desaturated with a
 * CSS-drawn padlock and NO ammo. weapons.js emits no ownership event (its bus
 * traffic is "fire"/"spread" only), so ownership is polled from
 * extras.weapons (main passes weapons.list through extras); when that field
 * is absent the bar keeps its cached ownership (the starter three after a run
 * end) and still tracks the active slot's ammo from update()'s `weapons`
 * argument. The bar sits above the bottom edge; the intermission shop hint is
 * shifted up 40 px so the two never overlap, and below 1040 px viewport width
 * style.css's `--gg-weapon-bar-bottom` / `--gg-weapon-bar-width` lift the bar
 * + hint clear of the health/ammo corner blocks. Every node is created once
 * and the per-frame writes are gated on change.
 *
 * update(player, weapons, gamestate[, extras]) — called by the main loop
 * EVERY FRAME while playing:
 *   @param player    - the Player object (read hp, alive, position).
 *   @param weapons   - the object returned by weapons.getState()
 *                      ({name, mag, magSize, reserve, reloading, spread}).
 *   @param gamestate - the Gamestate object (read score, wave, kills).
 *   @param extras    - OPTIONAL HudExtras (see the typedef below): the live
 *   boss position/hp and the camera yaw for the boss bar + direction arrow.
 *   Omitting it degrades ONLY the arrow (and the live bar drain) — every
 *   other widget is bus-event driven.
 *
 * show(bool): show/hide the whole HUD (main.js: true while playing/paused,
 * false in menu/gameover). Hiding also clears the transient overlays (feed,
 * boss bar, toast, hint, arrow); boss state is additionally cleared when a
 * run ENDS ("state-changed" → gameover/menu) so a restart never resurrects a
 * dead boss bar — clearing on "playing" was rejected because resume() also
 * passes through that state.
 *
 * flashDamage(intensity): strong red screen flash, intensity 0..1 — called
 * internally from update()'s hp-drop detection; exposed so main.js/debug can
 * trigger it directly.
 *
 * Bus events consumed: "zombie-killed", "spread", "hit", "wave-start",
 * "wave-clear", "settings-changed" (language + accessibility/game-feel
 * patches: crosshairColor, crosshairSize, damageNumbers, reducedMotion), plus
 * the EXPANSION events
 * "money-changed" {money, delta}, "boss-spawned" {type, zoneId, hp},
 * "zone-unlocked" {id, name}, "shop-open" / "shop-closed" {} and
 * "state-changed" {state} (run-end cleanup). Bus-driven sounds:
 * audio.waveBanner() on "wave-start". P1 story events (§6 table):
 * "mission-start", "objective-progress", "mission-complete", "mission-reset",
 * "quota-done", "gate-open", "interact-near". P2 event widgets (§4.3):
 * "event-start" {type,...}, "event-end" {type, reason, money?},
 * "bloodmoon-active" {active, duration}, "map-visibility" {open}. GUN GAME
 * 2.0 P4 (§6.4/§8): "damage-dealt" {pos, amount, headshot} (floating numbers),
 * "fps-toggle" {} (F3 counter), "achievement-unlocked" {id} (gold toast —
 * the achv_* name keys come from achievements.js's module-level bundle),
 * "codex-unlocked" {id, secret, nameKey, text} (gold dossier toast — help.js
 * resolves detail.text; codexToast is the fallback).
 * extras.endless ({active, wave, score} — P4-K12) takes over the WAVE + SCORE
 * chips while Endless is active (integrator gap fill).
 *
 * Implementation notes:
 * - Accessibility / game feel (user request): crosshair color/size ride the
 *   --gg-crosshair-color / --gg-crosshair-scale custom properties, read from
 *   "gungame.settings" at creation and live from "settings-changed" patches
 *   (the HUD gets no settings ref). reducedMotion adds .reduced-motion to the
 *   HUD root and suppresses the shot kick; damageNumbers:false ignores new
 *   "damage-dealt" events and hides every live number immediately.
 * - No object allocation in the per-frame path: DOM writes are gated on value
 *   change, crosshair gap is one CSS custom property, decay uses a measured
 *   dt (update() has no dt parameter), the extras parsing fills a shared
 *   scratch object.
 * - Extra i18n keys registered here (merged, EN + VI): hudReloading,
 *   hudHeadshot, killWalker, killRunner, killBrute, killCrawler, killBloater,
 *   killArmored (+ the crawler/bloater/armored display names), wPistol,
 *   wShotgun, wRifle, weaponSlots, weaponLocked, and the EXPANSION keys
 *   hudMoney, hudShopHint, hudZoneToast, zoneNorth, zoneEast, bossButcher,
 *   bossSpitter, bossScreamer, bossGolem, killButcher, killSpitter,
 *   killScreamer, killGolem, wSmg, wSniper, wMinigun, wGrenade, wMagnum,
 *   wDmr, wRailgun, wSawnoff, wCrossbow. Only THIS
 *   module's dict entries are touched (C8).
 *
 * @param {HTMLElement} container - the #ui element.
 * @param {EventTarget} bus
 * @param {import("../core/audio.js").Audio} audio
 * @param {{t: Function, registerBundle: Function, setLang: Function, getLang: Function}} i18n
 *   The i18n module namespace (see src/core/i18n.js).
 * @returns {Hud}
 */

/**
 * @typedef {Object} Hud
 * @property {(player: import("../player/controller.js").Player,
 *             weapons: import("../player/weapons.js").WeaponState,
 *             gamestate: import("../systems/gamestate.js").Gamestate,
 *             extras?: HudExtras) => void} update
 * @property {(visible: boolean) => void} show
 * @property {(intensity: number) => void} flashDamage - strong red flash, 0..1.
 */

/**
 * Optional 4th update() argument (EXPANSION C6 — "main cung cấp vị trí boss
 * qua update"). Every field is optional; unknown shapes are ignored.
 *
 * @typedef {Object} HudExtras
 * @property {HudBossData|{x:number, z:number}|import("three").Vector3|null} [boss]
 *   The live boss — also accepted under the keys "bossPos"/"bossPosition".
 *   A THREE.Vector3 works directly; an object with a `position` member is
 *   unwrapped. null/absent → no boss this frame (arrow hidden, bar untouched).
 * @property {number} [yaw] - camera yaw, radians (camera.rotation.y, order
 *   "YXZ"). Aliases: "camYaw", or a "camera" object (its .rotation.y is read),
 *   or a "forward" {x, z} view vector. No yaw source → arrow hidden.
 * @property {number} [hp] - legacy shortcut: live boss hp (same as extras.boss.hp).
 * @property {{x: number, z: number}|null} [mission] - P2 (§4.3): current
 *   mission marker (main derives per P2-K13); null/absent → no gold marker.
 * @property {{type: string, x: number, z: number}|null} [event] - P2 (§4.3):
 *   the running event marker; x/z are null for bloodmoon → no strip marker.
 * @property {import("three").Camera} [cam] - GUN GAME 2.0 P4 (P4-K12/K16):
 *   the live camera — floating damage numbers project through it each frame
 *   (Vector3.project). Missing → numbers stay invisible and age out.
 * @property {import("../player/weapons.js").WeaponState[]|{list: import("../player/weapons.js").WeaponState[]}} [weapons]
 *   Weapon slot bar (additive): the live weapons list — main passes
 *   `weapons.list` (an object with a `.list` member is also accepted). Only
 *   `name` + `owned` are read. Missing → the bar keeps its cached ownership
 *   (the starter three after a run end) and still paints the active slot's
 *   ammo from update()'s `weapons` argument.
 */

/**
 * @typedef {Object} HudBossData
 * @property {number} [x] - boss X (when given flat, instead of `position`).
 * @property {number} [z] - boss Z.
 * @property {import("three").Vector3|{x:number, y:number, z:number}} [position]
 * @property {number} [hp] - live hp → drives the boss bar drain.
 * @property {number} [maxHp] - live max hp (defaults to the "boss-spawned" hp).
 * @property {string} [type] - boss id (butcher|spitter|screamer|golem) →
 *   name fallback if the event has not been seen.
 * @property {boolean} [visible] - explicit on-screen flag from main (e.g. a
 *   real frustum test); when given it replaces this module's half-angle guess.
 */

// GUN GAME 2.0 P4 (§6.4): floating damage numbers project world positions to
// the screen through the camera main.js passes as extras.cam (P4-K12) — one
// scratch Vector3, reused every frame (zero allocation, §1.4).
import { Vector3 } from "three";
import { CROSSHAIR_COLORS } from "../core/settings.js";

// Accessibility / game feel (user request): the HUD is built after
// settings.load() in main.js but receives no settings ref, so it reads the
// persisted store directly at creation and follows "settings-changed" patches.
// "white" is the pre-setting #e6f1ff tick color → untouched saves look identical.
const SETTINGS_KEY = "gungame.settings";
const CROSSHAIR_DEFAULT_COLOR = "white";
const CROSSHAIR_SIZE_MIN = 0.75;
const CROSSHAIR_SIZE_MAX = 1.5;

// Crosshair geometry (px): gap = BASE + spread(rad) * PER_RAD + shot kick.
const BASE_GAP = 8;
const GAP_PER_RAD = 620;
const KICK_PER_RAD = 900;
const MAX_GAP = 54;

// GUN GAME 2.0 P4 (§6.4 / P4-K16): floating damage numbers — FROZEN caps.
const DMG_POOL_MAX = 30; // concurrent numbers; excess "damage-dealt" → dropped
const DMG_LIFE = 0.8; // seconds
const DMG_RISE = 40; // px risen over the lifetime
// FPS counter (P4-K17): top edge, right of the compass strip, ABOVE the
// killfeed (which owns top: 18px) — sits at the very top right corner.
const FPS_SMOOTH = 0.1; // lerp(fps, 1/dt, 0.1) — the contract's EMA factor

// Boss arrow: orbit radius around the crosshair and the half-angle of the
// view cone outside which the arrow shows (cheap frustum stand-in — XZ only).
const ARROW_RADIUS = 34;
const ARROW_CONE = 0.8; // rad ≈ 46° (≈ half the horizontal FOV at fov 75)

const KNOWN_WEAPONS = {
  pistol: "wPistol",
  shotgun: "wShotgun",
  rifle: "wRifle",
  smg: "wSmg",
  sniper: "wSniper",
  minigun: "wMinigun",
  grenade: "wGrenade",
  magnum: "wMagnum",
  dmr: "wDmr",
  railgun: "wRailgun",
  sawnoff: "wSawnoff",
  crossbow: "wCrossbow",
};

// Key badge per slot — MUST match weapons.js's switching (Digit1..0, Minus,
// Equal) and the fixed weapons.list order. Index 10/11 are the two
// merchant-exclusive guns.
const WEAPON_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];

// Weapon slot bar (additive): fixed KEY order — index i is the weapon that
// WEAPON_KEYS[i] selects and the weapons.list order (…8, 9, 0, -, =).
// `icon` entries are
// CSS-drawn silhouette parts inside a 34 x 10 px box, no image assets:
// [x, y, w, h, radius, transform?] → one absolutely-positioned div each.
const WEAPON_SLOTS = [
  {
    name: "pistol",
    icon: [
      [0, 2.5, 19, 3.5, 1],
      [18, 3.5, 4, 1.5, 0],
      [3.5, 6, 4.5, 3.5, 0, "skewX(-14deg)"],
    ],
  },
  {
    name: "shotgun",
    icon: [
      [0, 2.5, 6, 4, 1],
      [0, 3, 20, 3, 1],
      [14, 2, 20, 2, 0.5],
      [18, 5.6, 6, 1.8, 0.5],
    ],
  },
  {
    name: "rifle",
    icon: [
      [0, 2.5, 5, 4, 1],
      [0, 3, 17, 3, 1],
      [16, 3.4, 18, 1.5, 0.5],
      [8.5, 5.6, 3.5, 4, 0.5, "skewX(9deg)"],
      [8, 1, 4, 1.5, 0.5],
    ],
  },
  {
    name: "smg",
    icon: [
      [0, 2.4, 3, 1.6, 0.5],
      [3, 3, 16, 3, 1],
      [18, 4, 9, 1.5, 0.5],
      [7, 5.6, 3, 4, 0.5],
      [3, 5.6, 3, 3.5, 0.5],
    ],
  },
  {
    name: "sniper",
    icon: [
      [0, 2.5, 5, 4, 1],
      [0, 3, 23, 2.5, 1],
      [22, 3.5, 12, 1.2, 0.5],
      [7, 0.8, 10, 2, 0.5],
    ],
  },
  {
    name: "minigun",
    icon: [
      [0, 2, 11, 6, 1.5],
      [11, 2, 23, 1.5, 0.5],
      [11, 4.25, 23, 1.5, 0.5],
      [11, 6.5, 23, 1.5, 0.5],
      [1, 6.9, 7, 3, 1],
    ],
  },
  {
    name: "grenade",
    icon: [
      [0, 3, 3, 3, 1],
      [2, 2, 26, 4, 2],
      [27.5, 1, 3.5, 6, 1],
      [6, 5.4, 6, 3.4, 1.7],
      [2, 6, 3, 3.4, 0.5],
    ],
  },
  {
    name: "magnum",
    icon: [
      [0, 2.5, 14, 3.2, 1],
      [11, 1.4, 7, 6, 3],
      [18, 3, 9, 1.8, 0.5],
      [2.5, 5.4, 4, 4.2, 0, "skewX(-14deg)"],
      [8, 0.8, 3, 2, 0],
    ],
  },
  {
    name: "dmr",
    icon: [
      [0, 2.5, 5, 3.5, 1],
      [4, 2.8, 16, 2.6, 1],
      [19, 3.2, 13, 1.2, 0.5],
      [6, 0.5, 9, 2, 1],
      [9, 5.2, 3, 4, 0, "skewX(8deg)"],
      [6, 5, 3, 3, 0.5],
    ],
  },
  {
    name: "railgun",
    icon: [
      [0, 1.5, 4, 2, 0.5],
      [0, 2.5, 12, 4, 1],
      [10, 2, 20, 1.4, 0.5],
      [10, 3.8, 20, 1.4, 0.5],
      [12, 1, 2, 6, 1],
      [17, 1, 2, 6, 1],
      [22, 1, 2, 6, 1],
      [3, 6, 4, 3.5, 0.5],
    ],
  },
  {
    name: "sawnoff",
    icon: [
      [0, 2.4, 7, 4.2, 1], // stubby receiver
      [5, 1.4, 15, 2, 0.5], // upper barrel
      [5, 3.8, 15, 2, 0.5], // lower barrel
      [19, 0.6, 6, 7.6, 1.5], // very wide muzzle face
      [1, 5.6, 4, 4.2, 0, "skewX(-14deg)"], // wooden pistol grip
      [8, 5.8, 3, 3, 0, "skewX(10deg)"], // break lever
    ],
  },
  {
    name: "crossbow",
    icon: [
      [0, 4.2, 6, 2, 0.5], // stock
      [4, 4.1, 27, 1.3, 0.5], // bolt rail
      [9, 0.4, 1.3, 9.2, 0.5], // limb riser
      [9, 0.5, 4, 1.2, 0.5], // upper limb tip
      [9, 8.3, 4, 1.2, 0.5], // lower limb tip
      [13, 1.2, 4, 0.8, 0.5, "rotate(24deg)"], // upper string
      [13, 7.6, 4, 0.8, 0.5, "rotate(-24deg)"], // lower string
      [19, 2.1, 6, 2.1, 0.5], // scope
    ],
  },
];
/** Weapon name → slot index (extras.weapons entries may arrive in any order). */
const WEAPON_INDEX = {};
for (let i = 0; i < WEAPON_SLOTS.length; i++) {
  WEAPON_INDEX[WEAPON_SLOTS[i].name] = i;
}

const KNOWN_TYPES = {
  walker: "killWalker",
  runner: "killRunner",
  brute: "killBrute",
  crawler: "killCrawler",
  bloater: "killBloater",
  armored: "killArmored",
  butcher: "killButcher",
  spitter: "killSpitter",
  screamer: "killScreamer",
  golem: "killGolem",
  origin: "killOrigin", // NIGHT 30 P3: final-boss kill-feed label
};
const BOSS_TYPES = { butcher: 1, spitter: 1, screamer: 1, golem: 1, origin: 1 }; // P3: the bar must hide on the Origin's kill too

// Compact slot labels for the 12-slot bar (the full names live in the title
// tooltip; two-line long names overflow the narrow slots on 1280 px screens).
const WSLOT_SHORT = {
  en: {
    pistol: "PISTOL",
    shotgun: "SHOTGUN",
    rifle: "RIFLE",
    smg: "SMG",
    sniper: "SNIPER",
    minigun: "MINIGUN",
    grenade: "GRENADE",
    magnum: "MAGNUM",
    dmr: "DMR",
    railgun: "RAILGUN",
    sawnoff: "SAWN-OFF",
    crossbow: "XBOW",
  },
  vi: {
    pistol: "SÚNG NGẮN",
    shotgun: "SHOTGUN",
    rifle: "SÚNG TRƯỜNG",
    smg: "SMG",
    sniper: "SNIPER",
    minigun: "MINIGUN",
    grenade: "LỰU ĐẠN",
    magnum: "MAGNUM",
    dmr: "DMR",
    railgun: "RAILGUN",
    sawnoff: "CƯA ĐÔI",
    crossbow: "NỎ",
  },
};
// Elite feed accents (match zombie.js ELITE_DEFS colours).
const ELITE_FEED_COLORS = {
  frenzied: "#ff5a1e",
  ironhide: "#9fb6d0",
  toxic: "#54e04a",
  giant: "#ffc02e",
};

// P2 (§4.3): compass strip marker color per event type (§4.2 palette).
const EVENT_STRIP_COLORS = {
  horde: "#ff4d3d",
  supply: "#ffab3d",
  survivor: "#6fe08a",
  bloodmoon: "#ff4d3d",
};
const STRIP_MISSION_COLOR = "#ffd35e";

// P1 (docs/EXPANSION-P1.md §7.3, decision K1): interact target id / collect
// item id → i18n display key. Numbered ids ("generator-1", "supply-2", …)
// match by prefix; landmarks match exactly.
const TARGET_KEYS = [
  [/^generator/, "target_generator"],
  [/^radio-tower$/, "target_antenna"],
  [/^campfire$/, "target_campfire"],
  [/^final-door$/, "target_steel_door"],
  [/^supply/, "item_supply"],
  [/^medicine/, "item_medicine"],
  [/^fuel/, "item_fuel"],
];

const HUD_BUNDLE = {
  en: {
    hudReloading: "RELOADING…",
    hudHeadshot: "HEADSHOT",
    killWalker: "Walker down",
    killRunner: "Runner down",
    killBrute: "Brute down",
    killCrawler: "Crawler down",
    killBloater: "Bloater down",
    killArmored: "Armored down",
    // Type display names (same ids zombies.js uses; kill-feed uses kill*).
    crawler: "Crawler",
    bloater: "Bloater",
    armored: "Armored",
    wPistol: "Pistol",
    wShotgun: "Shotgun",
    wRifle: "Rifle",
    // --- EXPANSION (this module's own dict entries only) ---
    hudMoney: "CASH",
    hudShopHint: "SHOP",
    hudZoneToast: "NEW AREA UNLOCKED",
    zoneNorth: "Backyard",
    zoneEast: "Warehouse",
    bossButcher: "The Butcher",
    bossSpitter: "The Spitter",
    bossScreamer: "The Screamer",
    bossGolem: "The Golem",
    bossOrigin: "The Origin", // NIGHT 30 P3: final-boss bar name (capKey "boss")
    killButcher: "Butcher down",
    killSpitter: "Spitter down",
    killScreamer: "Screamer down",
    killGolem: "Golem down",
    killOrigin: "Origin down",
    // Elite variants (user request) — kill-feed prefix + badge.
    eliteTag: "ELITE",
    eliteFrenzied: "Frenzied",
    eliteIronhide: "Ironhide",
    eliteToxic: "Toxic",
    eliteGiant: "Giant",
    wSmg: "SMG",
    wSniper: "Sniper",
    wMinigun: "Minigun",
    wGrenade: "Grenade Launcher",
    wMagnum: "Magnum",
    wDmr: "Marksman Rifle",
    wRailgun: "Railgun",
    wSawnoff: "Sawn-off",
    wCrossbow: "Crossbow",
    // Weapon slot bar (additive): aria-label + the locked-slot hint.
    weaponSlots: "WEAPONS",
    weaponLocked: "Locked",
    // GUN GAME 2.0 P4 (§8.4 — verbatim): gold toast on "achievement-unlocked".
    // The achievement names themselves come from the achv_* keys that
    // achievements.js registers at module level.
    achvToast: "🏆 ACHIEVEMENT — {name}",
    // User request: gold toast on "codex-unlocked" (help.js). help.js passes
    // detail.text already localized; this key is the fallback when it is not.
    codexToast: "📖 DOSSIER UNLOCKED — {name}",
  },
  vi: {
    hudReloading: "ĐANG NẠP ĐẠN…",
    hudHeadshot: "VÀO ĐẦU",
    killWalker: "Hạ gục Walker",
    killRunner: "Hạ gục Runner",
    killBrute: "Hạ gục Brute",
    killCrawler: "Hạ gục Crawler",
    killBloater: "Hạ gục Bloater",
    killArmored: "Hạ gục Giáp Sắt",
    // Type display names (same ids zombies.js uses; kill-feed uses kill*).
    crawler: "Bò Lết",
    bloater: "Phình Độc",
    armored: "Giáp Sắt",
    wPistol: "Súng ngắn",
    wShotgun: "Shotgun",
    wRifle: "Súng trường",
    // --- EXPANSION (this module's own dict entries only) ---
    hudMoney: "TIỀN",
    hudShopHint: "CỬA HÀNG",
    hudZoneToast: "KHU VỰC MỚI MỞ",
    zoneNorth: "Sân sau",
    zoneEast: "Kho",
    bossButcher: "Đồ Tể",
    bossSpitter: "Kẻ Phun Độc",
    bossScreamer: "Kẻ Gào Thét",
    bossGolem: "Golem Đá",
    bossOrigin: "Nguồn Gốc", // NIGHT 30 P3: final-boss bar name (capKey "boss")
    killButcher: "Hạ gục Butcher",
    killSpitter: "Hạ gục Spitter",
    killScreamer: "Hạ gục Screamer",
    killGolem: "Hạ gục Golem",
    killOrigin: "Hạ gục Origin",
    // Elite variants (user request) — kill-feed prefix + badge.
    eliteTag: "TINH ANH",
    eliteFrenzied: "Cuồng Loạn",
    eliteIronhide: "Da Sắt",
    eliteToxic: "Độc Tố",
    eliteGiant: "Khổng Lồ",
    wSmg: "SMG",
    wSniper: "Súng bắn tỉa",
    wMinigun: "Minigun",
    wGrenade: "Súng phóng lựu",
    wMagnum: "Súng Lục Magnum",
    wDmr: "Súng Bắn Tỉa DMR",
    wRailgun: "Súng Điện Từ",
    wSawnoff: "Súng Cưa Đôi",
    wCrossbow: "Nỏ Săn",
    // Weapon slot bar (additive): aria-label + the locked-slot hint.
    weaponSlots: "VŨ KHÍ",
    weaponLocked: "Chưa mở khóa",
    // GUN GAME 2.0 P4 (§8.4 — verbatim): gold toast on "achievement-unlocked".
    achvToast: "🏆 THÀNH TỰU — {name}",
    // User request: gold toast on "codex-unlocked" (help.js) — VI fallback.
    codexToast: "📖 MỞ HỒ SƠ — {name}",
  },
};

// P1 story keys — FALLBACK copies, verbatim from docs/STORY.md §7 (same text
// the missions.js / city.js owners register; see the header note). Kept here
// so the tracker/quota/hint/toasts render correctly even if this module draws
// before those owners register their bundles.
const HUD_P1_BUNDLE = {
  en: {
    mission_progress: "MISSION {n}/9",
    obj_quota: "Kill zombies in {district}: {n}/{need}",
    obj_collect: "Collect {item}: {n}/{need}",
    obj_activate: "Activate: {target}",
    obj_reach: "Reach the marker",
    obj_boss: "Kill the boss",
    obj_survive: "Survive: {n}/{need} s",
    quota_counter: "🧟 {n}/{need}",
    quota_done_toast: "DISTRICT CLEARED",
    gate_open_toast: "GATE OPEN — {district}",
    interact_hint: "E — INTERACT",
    mission_complete_toast: "MISSION COMPLETE +{money}$",
    item_supply: "Supply Pack",
    item_medicine: "Medicine Box",
    item_fuel: "Fuel Can",
    target_generator: "Generator",
    target_antenna: "Broadcast Antenna",
    target_campfire: "Campfire",
    target_steel_door: "Central Steel Door",
    district_safehouse: "Safehouse",
    district_residential: "Residential",
    district_commercial: "Commercial",
    district_hospital: "Hospital",
    district_park: "Park",
    district_docks: "Docks",
    district_quarantine: "Quarantine Zone",
  },
  vi: {
    mission_progress: "NHIỆM VỤ {n}/9",
    obj_quota: "Hạ zombie trong {district}: {n}/{need}",
    obj_collect: "Thu {item}: {n}/{need}",
    obj_activate: "Kích hoạt: {target}",
    obj_reach: "Tới điểm đánh dấu",
    obj_boss: "Hạ boss",
    obj_survive: "Trụ lại: {n}/{need} s",
    quota_counter: "🧟 {n}/{need}",
    quota_done_toast: "KHU ĐÃ SẠCH",
    gate_open_toast: "CỔNG MỞ — {district}",
    interact_hint: "E — TƯƠNG TÁC",
    mission_complete_toast: "NHIỆM VỤ HOÀN THÀNH +{money}$",
    item_supply: "Gói Tiếp Tế",
    item_medicine: "Hộp Thuốc",
    item_fuel: "Can Xăng",
    target_generator: "Máy Phát Điện",
    target_antenna: "Đài Phát Sáng",
    target_campfire: "Đống Lửa Trại",
    target_steel_door: "Cửa Thép Trung Tâm",
    district_safehouse: "An Toàn Nhà",
    district_residential: "Khu Dân Cư",
    district_commercial: "Phố Thương Mại",
    district_hospital: "Bệnh Viện",
    district_park: "Công Viên",
    district_docks: "Bến Cảng",
    district_quarantine: "Vùng Cách Ly",
  },
};

// P2 event keys — FALLBACK copies, verbatim from docs/EXPANSION-P2.md §7.1
// (owner: events.js; same rationale as HUD_P1_BUNDLE — see the header note).
// event_survivor_thanks deliberately NOT here: main.js feeds it to dialogue.
const HUD_P2_BUNDLE = {
  en: {
    event_horde: "HORDE",
    event_supply: "SUPPLY DROP",
    event_survivor: "SURVIVOR",
    event_bloodmoon: "BLOODMOON",
    event_horde_banner: "🚨 HORDE INCOMING",
    event_supply_banner: "📦 SUPPLY DROP INBOUND",
    event_survivor_banner: "🆘 SURVIVOR SURROUNDED",
    event_bloodmoon_banner: "🌕 BLOODMOON RISES",
    event_bloodmoon_timer: "BLOODMOON {n}s",
    event_supply_opened: "SUPPLY SECURED +{money}$",
    event_survivor_rescued: "SURVIVOR RESCUED +300$",
    event_survivor_lost: "SURVIVOR LOST",
    event_bloodmoon_end: "BLOODMOON ENDED",
  },
  vi: {
    event_horde: "BỘ ĐÀN",
    event_supply: "TIẾP TẾ",
    event_survivor: "NGƯỜI SỐNG SÓT",
    event_bloodmoon: "TRĂNG MÁU",
    event_horde_banner: "🚨 HORDE ĐANG TỚI",
    event_supply_banner: "📦 TIẾP TẾ ĐANG RƠI",
    event_survivor_banner: "🆘 NGƯỜI SỐNG SÓT BỊ VÂY",
    event_bloodmoon_banner: "🌕 TRĂNG MÁU NỔI",
    event_bloodmoon_timer: "TRĂNG MÁU {n}s",
    event_supply_opened: "ĐÃ NHẬN TIẾP TẾ +{money}$",
    event_survivor_rescued: "ĐÃ CỨU NGƯỜI SỐNG SÓT +300$",
    event_survivor_lost: "NGƯỜI SỐNG SÓT ĐÃ NGÃ",
    event_bloodmoon_end: "TRĂNG MÁU TAN",
  },
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Tiny DOM builder (module-local). */
function make(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

/** Inline-style a node — new HUD widgets carry their own styles (style.css
 * is outside this module's allowed file list). */
function css(node, styles) {
  for (const k in styles) node.style[k] = styles[k];
  return node;
}

/** Restart a one-shot CSS animation by toggling a class with a reflow. */
function pulse(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

function fmtInt(n) {
  return String(Math.max(0, Math.round(Number(n) || 0)));
}

/** "butcher" → "bossButcher" — i18n key for a boss/zone id. */
function capKey(prefix, id) {
  const s = String(id || "");
  return prefix + s.charAt(0).toUpperCase() + s.slice(1);
}

export function createHud(container, bus, audio, i18n) {
  if (!container || typeof container.appendChild !== "function") {
    throw new Error("createHud: container (#ui) is required");
  }
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(HUD_BUNDLE);
    i18n.registerBundle(HUD_P1_BUNDLE); // P1 fallback keys — see header note
    i18n.registerBundle(HUD_P2_BUNDLE); // P2 event_* fallback — §7.1 note
  }

  const tr = (key, params) =>
    i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;

  // --- DOM -------------------------------------------------------------------
  // Order matters: overlays first (behind), widgets after (on top).
  const root = make("div", "hud-root hidden", container);

  const vignette = make("div", "vignette", root);
  make("div", "lowhp", root); // crit pulse layer, driven purely by CSS
  const flash = make("div", "flash", root);

  const banner = make("div", "banner", root);

  // P2 compass strip — very top center, created BEFORE the topinfo chips so
  // they paint over its bottom edge (strip 6..22px vs chips from 18px).
  // Drawn on one small canvas (§4.3); the wrap hides when inactive.
  const compassWrap = make("div", "compass-strip", root);
  css(compassWrap, {
    position: "absolute",
    top: "6px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "min(560px, 72vw)",
    height: "16px",
    background: "rgba(6, 10, 16, 0.55)",
    border: "1px solid rgba(122, 142, 170, 0.35)",
    borderRadius: "4px",
    overflow: "hidden",
    display: "none",
  });
  const compassCanvas = document.createElement("canvas");
  css(compassCanvas, { width: "100%", height: "100%", display: "block" });
  compassWrap.appendChild(compassCanvas);
  const compassCtx = compassCanvas.getContext("2d");

  // ADS deep-zoom scope overlay: dark vignette outside a clear center circle
  // plus hair-thin cross lines — one div, three background layers, zero JS
  // cost beyond display toggling (main passes extras.ads {blend, deep}).
  const scopeOverlay = make("div", "scope-overlay", root);
  css(scopeOverlay, {
    position: "absolute",
    inset: "0",
    display: "none",
    pointerEvents: "none",
    background:
      "linear-gradient(to right, transparent calc(50% - 0.5px), rgba(0,0,0,0.85) calc(50% - 0.5px), rgba(0,0,0,0.85) calc(50% + 0.5px), transparent calc(50% + 0.5px))," +
      "linear-gradient(to bottom, transparent calc(50% - 0.5px), rgba(0,0,0,0.85) calc(50% - 0.5px), rgba(0,0,0,0.85) calc(50% + 0.5px), transparent calc(50% + 0.5px))," +
      "radial-gradient(circle at 50% 50%, transparent 34%, rgba(0,0,0,0.4) 36%, rgba(0,0,0,0.97) 42%)",
    zIndex: "5",
  });
  let scopeShown = false;

  // P2+ mission waypoint: a floating ◆ + distance tag projected onto the
  // objective through extras.cam — pins to the screen edge when the target
  // sits behind the camera, so the player always knows which way to run.
  const mMarker = make("div", "mission-marker", root);
  css(mMarker, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "none",
    pointerEvents: "none",
    color: "#ffd257",
    fontWeight: "800",
    fontSize: "15px",
    textShadow: "0 0 6px rgba(0,0,0,0.9), 0 0 14px rgba(255,210,87,0.45)",
    whiteSpace: "nowrap",
    zIndex: "6",
  });

  // P2 event banner — its OWN node (§4.3: never reuse the wave banner node),
  // animated with WAAPI (style.css is frozen — no new keyframes).
  const eventBanner = make("div", "event-banner", root);
  css(eventBanner, {
    position: "absolute",
    top: "26%",
    left: "0",
    right: "0",
    zIndex: "6", // above .banner (z-index 5) when both fire at once
    textAlign: "center",
    fontSize: "clamp(30px, 5vw, 58px)",
    fontWeight: "800",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#ffd9d0",
    textShadow:
      "0 0 22px rgba(255, 70, 50, 0.85), 0 2px 6px rgba(0, 0, 0, 0.85)",
    opacity: "0",
    pointerEvents: "none",
    display: "none",
  });

  const top = make("div", "topinfo", root);
  // P1 quota chip — FIRST in the row (order: quota · wave · score, §5.4.2).
  const quotaChip = make("div", "chip quota-chip", top);
  css(quotaChip, { display: "none" }); // event/extras driven, hidden by default
  const quotaVal = make("span", "val", quotaChip);
  const waveChip = make("div", "chip", top);
  const waveLbl = make("span", "lbl", waveChip);
  const waveVal = make("span", "val", waveChip);
  const scoreChip = make("div", "chip", top);
  const scoreLbl = make("span", "lbl", scoreChip);
  const scoreVal = make("span", "val", scoreChip);

  const feed = make("div", "killfeed", root);

  // Boss direction arrow — created BEFORE the crosshair so the ticks paint
  // over it when the spread gap reaches the orbit radius.
  const arrow = make("div", "boss-arrow", root);
  css(arrow, {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "0",
    height: "0",
    display: "none",
  });
  const arrowRot = make("div", "boss-arrow-rot", arrow);
  css(arrowRot, { position: "absolute", width: "0", height: "0" });
  const arrowHead = make("div", "boss-arrow-head", arrowRot);
  css(arrowHead, {
    position: "absolute",
    left: "-7px",
    top: String(-(ARROW_RADIUS + 12)) + "px",
    width: "0",
    height: "0",
    borderLeft: "7px solid transparent",
    borderRight: "7px solid transparent",
    borderBottom: "12px solid #ff5a4d",
    filter: "drop-shadow(0 0 3px rgba(0,0,0,0.9))",
  });

  const cross = make("div", "crosshair", root);
  make("div", "tick tick-up", cross);
  make("div", "tick tick-down", cross);
  make("div", "tick tick-left", cross);
  make("div", "tick tick-right", cross);
  make("div", "dot", cross);

  const hitm = make("div", "hitmarker", root);
  make("span", "leg leg1", hitm);
  make("span", "leg leg2", hitm);
  make("span", "leg leg3", hitm);
  make("span", "leg leg4", hitm);

  const hpWrap = make("div", "hp-wrap", root);
  // Money chip — "tiền cạnh máu": first row INSIDE the health block.
  const moneyRow = make("div", "money-row", hpWrap);
  css(moneyRow, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: "7px",
  });
  const moneyLbl = make("span", "money-lbl", moneyRow);
  css(moneyLbl, {
    fontSize: "11px",
    letterSpacing: "0.24em",
    textTransform: "uppercase",
    color: "var(--gg-text-dim)",
  });
  const moneyVal = make("span", "money-val", moneyRow);
  css(moneyVal, {
    fontSize: "18px",
    fontWeight: "800",
    color: "var(--gg-gold)",
    fontVariantNumeric: "tabular-nums",
  });
  moneyVal.textContent = "$0";

  const hpHead = make("div", "hp-head", hpWrap);
  const hpLbl = make("span", "hp-lbl", hpHead);
  const hpNum = make("span", "hp-num", hpHead);
  const hpBar = make("div", "hp-bar", hpWrap);
  const hpFill = make("div", "hp-fill", hpBar);

  const ammoWrap = make("div", "ammo-wrap", root);
  const wName = make("div", "wname", ammoWrap);
  const ammoLine = make("div", "ammo-line", ammoWrap);
  const magEl = make("span", "mag", ammoLine);
  const sepEl = make("span", "sep", ammoLine);
  sepEl.textContent = "/";
  const resEl = make("span", "reserve", ammoLine);
  resEl.textContent = "∞";
  const reloadNote = make("div", "reload-note", ammoWrap);

  // Boss bar — top center, below the wave/score chips, never over the
  // crosshair (screen middle stays clear per spec).
  const bossWrap = make("div", "boss-wrap", root);
  css(bossWrap, {
    position: "absolute",
    top: "64px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "min(440px, 62vw)",
    textAlign: "center",
    display: "none",
  });
  const bossName = make("div", "boss-name", bossWrap);
  css(bossName, {
    fontSize: "13px",
    fontWeight: "700",
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    color: "#ffd9d9",
    textShadow: "0 1px 4px rgba(0,0,0,0.9)",
    marginBottom: "5px",
  });
  const bossBar = make("div", "boss-bar", bossWrap);
  css(bossBar, {
    height: "12px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid #5c2424",
    borderRadius: "6px",
    overflow: "hidden",
  });
  const bossFill = make("div", "boss-fill", bossBar);
  css(bossFill, {
    height: "100%",
    width: "100%",
    background: "linear-gradient(90deg, #b31212, #ff4d3d)",
    borderRadius: "5px",
  });

  // Zone toast — wrapper centers, the inner node animates transform freely.
  const toastWrap = make("div", "toast-wrap", root);
  css(toastWrap, {
    position: "absolute",
    top: "118px",
    left: "0",
    right: "0",
    display: "flex",
    justifyContent: "center",
  });
  const toast = make("div", "toast", toastWrap);
  css(toast, {
    display: "none",
    opacity: "0",
    padding: "8px 18px",
    background: "var(--gg-panel)",
    border: "1px solid var(--gg-gold)",
    borderLeft: "4px solid var(--gg-gold)",
    borderRadius: "6px",
    color: "#ffe9b0",
    fontSize: "14px",
    letterSpacing: "0.08em",
    textShadow: "0 1px 3px rgba(0,0,0,0.8)",
    boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
    whiteSpace: "nowrap",
    transition: "opacity 0.25s ease-out, transform 0.25s ease-out",
  });

  // P2 bloodmoon countdown chip — top-left corner (topinfo is centered, the
  // killfeed top-right: the corner is the only always-free slot, §4.3).
  const bloodChip = make("div", "bloodmoon-chip", root);
  css(bloodChip, {
    position: "absolute",
    top: "18px",
    left: "18px",
    display: "none",
    padding: "5px 12px",
    background: "rgba(64, 8, 8, 0.85)",
    border: "1px solid #b31212",
    borderRadius: "6px",
    color: "#ff9d92",
    fontSize: "12px",
    fontWeight: "800",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    fontVariantNumeric: "tabular-nums",
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.9)",
  });

  // P1 mission tracker — top right, BELOW the kill feed (the killfeed owns
  // top: 18px; right: 18px with 3 self-fading lines). Gold title row + one
  // row per objective; rebuilt on "mission-start", updated in place by
  // "objective-progress".
  const tracker = make("div", "mission-tracker", root);
  css(tracker, {
    position: "absolute",
    top: "120px",
    right: "18px",
    display: "none",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "5px",
    maxWidth: "360px",
    textAlign: "right",
  });
  const trkTitle = make("div", "mission-tracker-title", tracker);
  css(trkTitle, {
    padding: "5px 12px",
    background: "var(--gg-chip)",
    border: "1px solid var(--gg-line)",
    borderRight: "3px solid var(--gg-gold)",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: "800",
    letterSpacing: "0.1em",
    color: "var(--gg-gold)",
    textTransform: "uppercase",
    textShadow: "0 1px 3px rgba(0,0,0,0.8)",
  });

  // "B — SHOP" hint chip, bottom center, visible during wave intermission.
  // Rides 40 px above the weapon slot bar (which owns the bottom edge), so
  // the two never overlap — including the small-window lift below.
  const hintWrap = make("div", "shop-hint-wrap", root);
  css(hintWrap, {
    position: "absolute",
    left: "0",
    right: "0",
    bottom: "calc(40px + var(--gg-weapon-bar-bottom, 0px))",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-end",
  });
  const hint = make("div", "shop-hint", hintWrap);
  css(hint, {
    display: "none",
    alignItems: "center",
    gap: "9px",
    marginBottom: "34px",
    padding: "7px 14px",
    background: "var(--gg-chip)",
    border: "1px solid var(--gg-line)",
    borderRadius: "6px",
    color: "var(--gg-text-dim)",
    fontSize: "12px",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  });
  const hintKey = make("span", "shop-hint-key", hint);
  css(hintKey, {
    display: "inline-block",
    padding: "2px 9px",
    background: "#0b1322",
    border: "1px solid #33465f",
    borderBottom: "2px solid #33465f",
    borderRadius: "4px",
    fontFamily: "ui-monospace, Consolas, monospace",
    fontSize: "12px",
    color: "#cfe0ff",
  });
  hintKey.textContent = "B";
  const hintAction = make("span", "shop-hint-action", hint);

  // --- WEAPON SLOT BAR (additive; see the header note) -------------------------
  // Bottom center, above the bottom edge. Twelve fixed slots in KEY order;
  // all nodes are created once, the per-frame path only rewrites changes.
  // The bar is not interactive (#ui stays pointer-events: none).
  const wbarWrap = make("div", "weapon-bar-wrap", root);
  css(wbarWrap, {
    position: "absolute",
    left: "0",
    right: "0",
    // Small windows lift the strip above the corner blocks (style.css media
    // query supplies the offset; 0 = flush with the bottom edge).
    bottom: "var(--gg-weapon-bar-bottom, 0px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-end",
    pointerEvents: "none",
    zIndex: "4",
  });
  const wbar = make("div", "weapon-bar", wbarWrap);
  css(wbar, {
    display: "flex",
    alignItems: "stretch",
    gap: "4px",
    // 12 × 56 px slots + 11 × 4 px gaps + 8 px padding + 2 px border = 726 px.
    // On narrow windows style.css lifts the strip above the corner blocks and
    // may narrow it (--gg-weapon-bar-width). Above 1040 px the fallback keeps
    // 270 px clear on each side for the health/ammo corner blocks, so the bar
    // stays 726 px at 1280 (well under 760) and shrinks in between; slots
    // tighten via flex.
    width: "var(--gg-weapon-bar-width, min(726px, calc(100vw - 540px)))",
    maxWidth: "calc(100vw - 16px)",
    marginBottom: "10px",
    padding: "4px",
    background: "rgba(6, 10, 16, 0.62)",
    border: "1px solid var(--gg-line)",
    borderRadius: "8px",
    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.45)",
  });

  /**
   * Per-slot DOM + write caches (one object per slot, created once).
   * `tone`: -1 unpainted, 0 owned idle, 1 active, 2 locked.
   * @type {{el: HTMLElement, key: HTMLElement, icon: HTMLElement,
   *   lbl: HTMLElement, ammo: HTMLElement, tint: HTMLElement,
   *   tintFill: HTMLElement, lock: HTMLElement, reload: HTMLElement,
   *   name: string, tone: number, ammoTxt: string, ammoShown: boolean,
   *   tintOn: boolean, pct: number, tintTone: number, reloading: boolean}[]}
   */
  const wbarSlots = [];
  for (let i = 0; i < WEAPON_SLOTS.length; i++) {
    const def = WEAPON_SLOTS[i];
    const el = make("div", "wslot", wbar);
    css(el, {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "1px",
      flex: "1 1 56px",
      minWidth: "0",
      maxWidth: "56px",
      padding: "3px 3px 4px",
      overflow: "hidden",
      background: "rgba(10, 15, 24, 0.72)",
      border: "1px solid rgba(36, 51, 77, 0.9)",
      borderRadius: "5px",
      color: "#8fa1b8", // icon parts paint with currentColor
      transition:
        "background 0.12s ease-out, border-color 0.12s ease-out, box-shadow 0.12s ease-out",
    });

    const top = make("div", "wslot-top", el);
    css(top, {
      display: "flex",
      width: "100%",
      height: "11px",
      alignItems: "center",
    });
    const key = make("span", "wslot-key", top);
    css(key, {
      padding: "1px 3px",
      fontSize: "9px",
      lineHeight: "9px",
      fontWeight: "800",
      fontFamily: "ui-monospace, Consolas, monospace",
      color: "#cfe0ff",
      background: "#0b1322",
      border: "1px solid #33465f",
      borderRadius: "3px",
    });
    key.textContent = WEAPON_KEYS[i] || String(i + 1);

    // Live ammo — ACTIVE slot only ("mag/reserve", ∞ for the pistol).
    const ammo = make("span", "wslot-ammo", el);
    css(ammo, {
      position: "absolute",
      top: "4px",
      right: "5px",
      fontSize: "9px",
      lineHeight: "9px",
      fontFamily: "ui-monospace, Consolas, monospace",
      fontVariantNumeric: "tabular-nums",
      color: "var(--gg-gold)",
      visibility: "hidden",
    });

    // CSS-drawn padlock (shackle + body) — no emoji/image dependency.
    const lock = make("span", "wslot-lock", el);
    css(lock, {
      position: "absolute",
      top: "3px",
      right: "5px",
      width: "8px",
      height: "10px",
      display: "none",
      color: "#5c6b80",
    });
    css(make("span", "wslot-lock-shackle", lock), {
      position: "absolute",
      left: "1px",
      top: "0",
      width: "6px",
      height: "5px",
      border: "1px solid currentColor",
      borderBottom: "none",
      borderRadius: "3px 3px 0 0",
    });
    css(make("span", "wslot-lock-body", lock), {
      position: "absolute",
      left: "0",
      top: "4px",
      width: "8px",
      height: "5px",
      background: "currentColor",
      borderRadius: "1px",
    });

    // CSS-drawn silhouette (see WEAPON_SLOTS) — 34 x 10 px box.
    const icon = make("div", "wslot-icon", el);
    css(icon, {
      position: "relative",
      flexShrink: "0",
      width: "34px",
      height: "10px",
    });
    for (let p = 0; p < def.icon.length; p++) {
      const part = def.icon[p];
      const node = make("span", "wslot-icon-part", icon);
      css(node, {
        position: "absolute",
        left: part[0] + "px",
        top: part[1] + "px",
        width: part[2] + "px",
        height: part[3] + "px",
        borderRadius: (part[4] || 0) + "px",
        background: "currentColor",
      });
      if (part[5]) node.style.transform = part[5];
    }

    const lblRow = make("div", "wslot-lbl-row", el);
    css(lblRow, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "19px", // two lines of 9 px — uniform slot height
    });
    const lbl = make("div", "wslot-lbl", lblRow);
    css(lbl, {
      fontSize: "9px",
      lineHeight: "9px",
      letterSpacing: "0.02em",
      textAlign: "center",
      textTransform: "uppercase",
      color: "var(--gg-text-dim)",
      overflow: "hidden",
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: "2",
      wordBreak: "break-word",
    });

    // Thin ammunition tint at the slot's bottom edge — active slot only.
    const tint = make("div", "wslot-tint", el);
    css(tint, {
      position: "absolute",
      left: "3px",
      right: "3px",
      bottom: "1px",
      height: "2px",
      borderRadius: "1px",
      background: "rgba(255, 255, 255, 0.1)",
      overflow: "hidden",
      display: "none",
    });
    const tintFill = make("div", "wslot-tint-fill", tint);
    css(tintFill, {
      height: "100%",
      width: "0%",
      background: "#7ee89b",
    });

    // Reloading marker — takes the ammo position of the ACTIVE slot (the
    // tint stays visible, so the slot never reads as "no ammo").
    const reload = make("div", "wslot-reload", el);
    css(reload, {
      position: "absolute",
      top: "3px",
      right: "5px",
      padding: "0",
      fontSize: "10px",
      lineHeight: "10px",
      color: "var(--gg-gold)",
      background: "none",
      border: "none",
      display: "none",
    });
    reload.textContent = "↻";

    wbarSlots.push({
      el,
      key,
      icon,
      lbl,
      ammo,
      tint,
      tintFill,
      lock,
      reload,
      name: def.name,
      tone: -1,
      ammoTxt: "",
      ammoShown: false,
      tintOn: false,
      pct: -1,
      tintTone: -1,
      reloading: false,
    });
  }

  // P1 "E — INTERACT" hint — centered just under the crosshair (never over
  // it; §5.4.3). Shown/hidden by "interact-near" {target, near}; carries the
  // target's display name next to the fixed interact_hint text.
  const eHint = make("div", "interact-hint", root);
  css(eHint, {
    position: "absolute",
    left: "50%",
    top: "calc(50% + 74px)",
    transform: "translateX(-50%)",
    display: "none",
    padding: "6px 14px",
    background: "var(--gg-chip)",
    border: "1px solid var(--gg-line)",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--gg-text)",
    whiteSpace: "nowrap",
    textShadow: "0 1px 3px rgba(0,0,0,0.8)",
  });
  const eHintLbl = make("span", "interact-hint-lbl", eHint);
  const eHintTarget = make("span", "interact-hint-target", eHint);
  css(eHintTarget, {
    color: "var(--gg-accent)",
    marginLeft: "8px",
    textTransform: "none",
    fontWeight: "400",
    letterSpacing: "0.06em",
  });

  // --- GUN GAME 2.0 P4 widgets (§6.4 — additive, inline-styled) -----------------

  // FPS counter: ONE text node updated per frame from the measured update()
  // dt; F3 ("fps-toggle") flips it. Top: 6px clears the killfeed (top: 18px).
  const fpsChip = make("div", "fps-chip", root);
  css(fpsChip, {
    position: "absolute",
    top: "6px",
    right: "18px",
    display: "none", // hidden by default (P4-K17)
    padding: "3px 10px",
    background: "rgba(6, 10, 16, 0.6)",
    border: "1px solid var(--gg-line)",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.1em",
    color: "var(--gg-text-dim)",
    fontVariantNumeric: "tabular-nums",
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.8)",
    pointerEvents: "none",
    zIndex: "7",
  });
  const fpsText = document.createTextNode("FPS --");
  fpsChip.appendChild(fpsText);

  // Floating damage numbers: a FIXED pool of 30 divs created once (no
  // allocation in the per-frame/event path, §1.4). combat.js emits
  // "damage-dealt" {pos, amount, headshot} per pellet hit (P4-K16); update()
  // projects each live number through extras.cam. Layer sits on top of the
  // other widgets (created last) but never captures input.
  const dmgLayer = make("div", "dmg-layer", root);
  css(dmgLayer, {
    position: "absolute",
    inset: "0",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "7",
  });
  /** @type {{el: HTMLElement, active: boolean, age: number, x: number,
   *  y: number, z: number, head: boolean, txt: string, px: number, py: number,
   *  shown: boolean, lastOp: number}[]} */
  const dmgPool = [];
  for (let i = 0; i < DMG_POOL_MAX; i++) {
    const el = make("div", "dmg-num", dmgLayer);
    css(el, {
      position: "absolute",
      left: "0",
      top: "0",
      display: "none",
      fontWeight: "700",
      whiteSpace: "nowrap",
      textShadow: "0 1px 3px rgba(0, 0, 0, 0.85)",
      willChange: "transform, opacity",
    });
    dmgPool.push({
      el,
      active: false,
      age: 0,
      x: 0,
      y: 0,
      z: 0,
      head: false,
      txt: "",
      px: -1,
      py: -1,
      shown: false,
      lastOp: 1,
    });
  }

  // --- transient caches (declared first: applyLang() reads prevWeapon) ---------
  let prevHp = -1;
  let prevMag = -1;
  let prevRes = "";
  let prevWeapon = "";
  let prevReloading = null;
  let prevScore = -1;
  let prevWave = -1;
  let lastT = 0;
  let kick = 0; // px, decays exponentially; added on "spread"
  let gapCur = BASE_GAP + 6; // current rendered gap
  let gapWritten = -1;

  // EXPANSION caches.
  let prevMoney = 0; // last rendered balance ($0 is painted at creation)
  let bossTracked = false; // a boss bar is currently up
  let bossTypeShown = ""; // boss id currently named on the bar
  let bossMax = 0; // bar denominator (spawn hp unless extras give maxHp)
  let prevBossFill = -1; // last painted bar width (%)
  let intermission = false; // between "wave-clear" and "wave-start"
  let hintShown = false;
  let toastTimer = 0; // pending auto-hide timeout handle
  let toastToken = 0; // invalidates stale hide timers after a newer toast
  let prevArrowShown = false;
  let prevArrowAngle = NaN;

  // P2 event caches (docs/EXPANSION-P2.md §4.3).
  let mapOpen = false; // the M map owns the top strip while it is up
  let bloodOn = false; // bloodmoon chip armed ("bloodmoon-active" {active:true})
  let bloodLeft = 0; // seconds remaining, ticked by the measured update() dt
  let bloodText = ""; // last painted chip text (DOM writes gated on change)
  let evBannerAnim = null; // running WAAPI animation of the event banner
  let compassShown = false; // strip visibility (display toggles gated)
  let lastCompassPaint = 0; // strip redraw throttle (~10 Hz, per contract)

  // P1 story caches (docs/EXPANSION-P1.md §5.4).
  let trkIndex = 0; // mission index shown in the tracker (0 = hidden)
  let trkTitleKey = ""; // cached title i18n key ("" = no " — title" suffix)
  /** @type {Array<Object>} live objective descriptors (mutated in place) */
  let trkObjs = [];
  /** @type {{row: HTMLElement, glyph: HTMLElement, txt: HTMLElement, obj: Object}[]} */
  const trkRows = [];
  let quota = null; // {done, need, district, complete} | null
  let quotaVisible = false; // event-driven default; extras.district refines it
  let eHintShown = false;

  // GUN GAME 2.0 P4 caches (§6.4).
  let fpsShown = false; // F3 state — hidden until the first toggle
  let fpsVal = 60; // EMA of 1/dt (lerp factor FPS_SMOOTH)
  let prevFpsOut = ""; // last painted "FPS {n}" (DOM writes gated on change)
  /** Scratch Vector3 for number projection — one instance, reused (§1.4). */
  const dmgV = new Vector3();

  // Accessibility / game feel (user request): boot values come from
  // localStorage (see readHudSettings below), then live patches from the
  // settings screen. Defaults reproduce the pre-setting look exactly.
  let crosshairColor = CROSSHAIR_DEFAULT_COLOR;
  let crosshairSize = 1;
  let damageNumbersOn = true;
  let reducedMotionOn = false;

  /** Push the color/size preset onto the crosshair's CSS custom properties. */
  function applyCrosshairSettings() {
    const hex = CROSSHAIR_COLORS[crosshairColor] || CROSSHAIR_COLORS.white;
    cross.style.setProperty("--gg-crosshair-color", hex);
    cross.style.setProperty("--gg-crosshair-scale", String(crosshairSize));
  }

  /** Same 0.05 quantization as settings.js (boot/foreign values included). */
  function normalizeCrosshairSize(v) {
    return Math.round(clamp(v, CROSSHAIR_SIZE_MIN, CROSSHAIR_SIZE_MAX) * 20) / 20;
  }

  /** damageNumbers off → ignore new "damage-dealt" events + hide live ones. */
  function setDamageNumbers(on) {
    damageNumbersOn = on !== false;
    if (!damageNumbersOn) hideDmgNumbers();
  }

  /** reducedMotion → no shot kick; CSS shortens the remaining HUD pulses. */
  function setReducedMotion(on) {
    reducedMotionOn = on === true;
    root.classList.toggle("reduced-motion", reducedMotionOn);
    if (reducedMotionOn) kick = 0;
  }

  /** Boot-safe read of the persisted accessibility settings. */
  function readHudSettings() {
    let raw = null;
    try {
      if (typeof localStorage !== "undefined") {
        raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      }
    } catch {
      raw = null; // corrupt JSON / blocked storage → pre-setting defaults
    }
    if (!raw || typeof raw !== "object") raw = {};
    if (
      typeof raw.crosshairColor === "string" &&
      CROSSHAIR_COLORS[raw.crosshairColor]
    ) {
      crosshairColor = raw.crosshairColor;
    }
    if (typeof raw.crosshairSize === "number" && Number.isFinite(raw.crosshairSize)) {
      crosshairSize = normalizeCrosshairSize(raw.crosshairSize);
    }
    applyCrosshairSettings();
    setDamageNumbers(raw.damageNumbers !== false);
    setReducedMotion(raw.reducedMotion === true);
  }

  // Weapon slot bar caches (additive). Ownership starts at the guaranteed
  // starter set (weapons.js: pistol/shotgun/rifle owned, the shop guns not);
  // extras.weapons corrects it as soon as main passes weapons.list.
  const wbarOwned = WEAPON_SLOTS.map((_, i) => i < 3);
  const wbarScoped = WEAPON_SLOTS.map(() => false); // adsFov>0 or scope fitted
  let wbarActive = 0; // active slot index (0 = pistol at spawn)
  let wbarActiveName = ""; // active weapon name last painted
  let wbarMag = -1; // last painted active mag
  let wbarRes = ""; // last painted reserve text
  let wbarAmmoTxt = ""; // "mag/reserve" — rebuilt only when either changes

  // Mission waypoint widget state (painted each frame while a target exists).
  let mShown = false;
  let prevMText = "";

  // Per-frame scratch for the optional extras argument (zero allocation).
  const bossScratch = {
    has: false,
    hasYaw: false,
    x: 0,
    z: 0,
    hp: NaN,
    maxHp: NaN,
    type: "",
    visible: /** @type {boolean|null} */ (null),
    yaw: 0,
    // P2 (§4.3): mission + event markers for the compass strip.
    hasMission: false,
    mx: 0,
    mz: 0,
    hasEvent: false,
    etype: "",
    ex: 0,
    ez: 0,
  };

  // --- i18n (labels cached; refreshed on live language switch) -----------------
  let lang = "";
  const wLabelCache = new Map();

  function weaponLabel(name) {
    if (wLabelCache.has(name)) return wLabelCache.get(name);
    const key = KNOWN_WEAPONS[name];
    const label = key ? tr(key) : String(name || "");
    wLabelCache.set(name, label);
    return label;
  }

  /** Name label + the ⌖ badge when the cached armory entry can aim. */
  function weaponDisplayLabel(name) {
    const idx = WEAPON_INDEX[name];
    const scoped = idx !== undefined && wbarScoped[idx];
    return weaponLabel(name) + (scoped ? " ⌖" : "");
  }

  // --- weapon slot bar helpers (additive) --------------------------------------

  /**
   * Paint one slot's state: 0 = owned idle, 1 = active (gold glow), 2 = locked
   * (dimmed/desaturated + padlock, no ammo). Gated on the cached tone.
   */
  function paintSlotTone(s, tone) {
    if (s.tone === tone) return;
    s.tone = tone;
    const locked = tone === 2;
    const on = tone === 1;
    s.el.style.opacity = locked ? "0.45" : "1";
    s.el.style.filter = locked ? "grayscale(0.9)" : "none";
    s.el.style.background = on
      ? "rgba(56, 43, 12, 0.9)"
      : "rgba(10, 15, 24, 0.72)";
    s.el.style.borderColor = on
      ? "var(--gg-gold)"
      : locked
        ? "rgba(36, 51, 77, 0.5)"
        : "rgba(36, 51, 77, 0.9)";
    s.el.style.boxShadow = on
      ? "0 0 12px rgba(255, 211, 94, 0.42), inset 0 0 10px rgba(255, 211, 94, 0.16)"
      : "none";
    s.el.style.color = locked ? "#56637a" : on ? "#ffe9b0" : "#8fa1b8";
    s.lbl.style.color = locked
      ? "#5b6a80"
      : on
        ? "#ffe9b0"
        : "var(--gg-text-dim)";
    s.key.style.color = locked ? "#5b6a80" : on ? "#0b1322" : "#cfe0ff";
    s.key.style.background = on ? "var(--gg-gold)" : "#0b1322";
    s.key.style.borderColor = on ? "#ffe9b0" : "#33465f";
    s.lock.style.display = locked ? "block" : "none";
  }

  /**
   * Active-slot ammo: text, 2 px tint width + color. An empty string hides
   * the text (idle/locked slot, or the reload marker's turn); `showTint`
   * keeps the tint up for the active slot even while reloading.
   * `tone`: 0 low (≤20 %), 1 mid (≤50 %), 2 high.
   */
  function paintSlotAmmo(s, txt, pct, tone, showTint) {
    if (s.ammoTxt !== txt) {
      s.ammoTxt = txt;
      s.ammo.textContent = txt;
    }
    const show = txt !== "";
    if (s.ammoShown !== show) {
      s.ammoShown = show;
      s.ammo.style.visibility = show ? "visible" : "hidden";
    }
    const tintOn = show || showTint === true;
    if (s.tintOn !== tintOn) {
      s.tintOn = tintOn;
      s.tint.style.display = tintOn ? "block" : "none";
    }
    if (!tintOn) return;
    if (pct !== s.pct) {
      s.pct = pct;
      s.tintFill.style.width = pct + "%";
    }
    if (tone !== s.tintTone) {
      s.tintTone = tone;
      s.tintFill.style.background =
        tone === 0 ? "#ff6b5e" : tone === 1 ? "#e0a23c" : "#7ee89b";
    }
  }

  /** Reloading marker — ACTIVE slot only. */
  function paintSlotReload(s, on) {
    if (s.reloading === on) return;
    s.reloading = on;
    s.reload.style.display = on ? "block" : "none";
  }

  /** Re-apply the cached ownership (the active slot always wins). */
  function paintBarOwnership() {
    for (let i = 0; i < wbarSlots.length; i++) {
      const s = wbarSlots[i];
      paintSlotTone(s, i === wbarActive ? 1 : wbarOwned[i] ? 0 : 2);
    }
  }

  /** Re-resolve every label/title (first paint + live language switch). */
  function paintBarLabels() {
    const lockedHint = tr("weaponLocked");
    wbar.setAttribute("aria-label", tr("weaponSlots"));
    for (let i = 0; i < wbarSlots.length; i++) {
      const s = wbarSlots[i];
      const label = weaponLabel(s.name);
      const lang = i18n && typeof i18n.getLang === "function" ? i18n.getLang() : "en";
      const short = (WSLOT_SHORT[lang] || WSLOT_SHORT.en)[s.name];
      s.lbl.textContent = short || label;
      s.el.title =
        (WEAPON_KEYS[i] || String(i + 1)) +
        " · " +
        label +
        (wbarOwned[i] ? "" : " — " + lockedHint);
      s.reload.title = tr("hudReloading");
    }
  }

  /**
   * Poll extras.weapons for ownership (weapons.js emits no ownership event:
   * its bus traffic is "fire"/"spread" only). Accepts weapons.list directly
   * or an object carrying it; unknown/absent data is ignored, so the bar
   * degrades to its cached ownership instead of guessing. Zero allocation.
   */
  function readBarWeapons(arg) {
    if (!arg || typeof arg !== "object") return;
    const w = arg.weapons;
    const list = Array.isArray(w)
      ? w
      : w && Array.isArray(w.list)
        ? w.list
        : null;
    if (!list) return;
    let changed = false;
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry || typeof entry !== "object") continue;
      const idx = WEAPON_INDEX[entry.name];
      if (idx === undefined) continue;
      const owned = entry.owned === true;
      if (wbarOwned[idx] !== owned) {
        wbarOwned[idx] = owned;
        changed = true;
      }
      // ADS badge: the armory entry carries adsFov (inherent scope) and the
      // trader scope attachment — the weapon name label shows ⌖ for either.
      const scoped =
        (Number(entry.adsFov) || 0) > 0 ||
        !!(entry.attachments && entry.attachments.scope);
      if (wbarScoped[idx] !== scoped) {
        wbarScoped[idx] = scoped;
        changed = true;
      }
    }
    if (changed) {
      paintBarOwnership();
      paintBarLabels(); // the locked hint in the tooltip changed
      // A scope bought on the ACTIVE gun doesn't change wname — repaint the
      // label so its ⌖ badge appears without a weapon switch.
      if (prevWeapon) wName.textContent = weaponDisplayLabel(prevWeapon);
    }
  }

  /** Run-end reset: starter ownership, pistol highlighted, no ammo paint. */
  function resetWeaponBar() {
    wbarOwned[0] = true;
    wbarOwned[1] = true;
    wbarOwned[2] = true;
    for (let i = 3; i < wbarOwned.length; i++) wbarOwned[i] = false;
    wbarActive = 0;
    wbarActiveName = "";
    wbarMag = -1;
    wbarRes = "";
    wbarAmmoTxt = "";
    for (let i = 0; i < wbarSlots.length; i++) {
      paintSlotAmmo(wbarSlots[i], "", 0, 2, false);
      paintSlotReload(wbarSlots[i], false);
    }
    paintBarOwnership();
    paintBarLabels(); // locked hints in the tooltips follow the reset
  }

  /** Boss display name from its type id; falls back to the raw id. */
  function bossLabel(id) {
    const key = capKey("boss", id);
    const label = tr(key);
    return label === key ? String(id || "") : label;
  }

  /** Zone display name from its id; falls back to the event's payload name. */
  function zoneLabel(id, fallbackName) {
    const key = capKey("zone", id);
    const label = tr(key);
    if (label !== key) return label;
    return String(fallbackName || id || "");
  }

  // --- P1 story widget helpers (docs/EXPANSION-P1.md §5.4) ---------------------

  /** Target/item id → display name (K1 mapping; unknown ids render raw).
   * Both K1 namespaces arrive through this path: interact target ids
   * ("generator-1", "radio-tower", …) AND ready-to-display i18n keys
   * ("target_generator", "item_fuel" — missions.js puts targetKey into the
   * activate objective's `target`). */
  function storyLabel(id) {
    const s = String(id || "");
    if (/^(target|item)_[a-z_]+$/.test(s)) {
      const direct = tr(s);
      if (direct !== s) return direct;
    }
    for (let i = 0; i < TARGET_KEYS.length; i++) {
      if (TARGET_KEYS[i][0].test(s)) {
        const v = tr(TARGET_KEYS[i][1]);
        return v === TARGET_KEYS[i][1] ? s : v;
      }
    }
    return s;
  }

  /** District id → display name ("district_" keys — owned by city.js). */
  function districtLabel(id) {
    const key = "district_" + String(id || "");
    const v = tr(key);
    return v === key ? String(id || "") : v;
  }

  /** Objective descriptor → tracker line via its obj_* template. */
  function objText(o) {
    if (!o || typeof o !== "object") return "";
    const need = Math.max(1, Math.round(Number(o.need) || 1));
    const done = clamp(Math.round(Number(o.done) || 0), 0, need);
    switch (o.type) {
      case "quota":
        return tr("obj_quota", {
          district: districtLabel(o.district),
          n: done,
          need,
        });
      case "collect":
        return tr("obj_collect", { item: storyLabel(o.item), n: done, need });
      case "activate": {
        // missions.js models m1 as ONE activate objective with need = the
        // generator count — surface the live "n/need" so the row is not a
        // flat ✕ until the very end (the template itself has no {n} slot).
        const base = tr("obj_activate", { target: storyLabel(o.target) });
        return need > 1 ? base + " (" + done + "/" + need + ")" : base;
      }
      case "reach":
        return tr("obj_reach");
      case "boss":
        return tr("obj_boss");
      case "survive":
        return tr("obj_survive", { n: done, need });
      default:
        return String(o.type || "");
    }
  }

  function paintRow(r) {
    r.glyph.textContent = r.obj.complete ? "✓" : "✕";
    r.glyph.style.color = r.obj.complete ? "#6fe08a" : "#5c6b80";
    r.txt.textContent = objText(r.obj);
    r.row.style.borderRightColor = r.obj.complete
      ? "var(--gg-gold)"
      : "var(--gg-line)";
    r.row.style.color = r.obj.complete ? "var(--gg-text)" : "";
  }

  /** Rebuild the tracker from the cached snapshot (mission-start + lang). */
  function renderTracker() {
    for (let i = trkRows.length - 1; i >= 0; i--) trkRows[i].row.remove();
    trkRows.length = 0;
    if (!(trkIndex >= 1)) {
      tracker.style.display = "none"; // §5.4.1: hidden while current = 0
      return;
    }
    trkTitle.textContent =
      tr("mission_progress", { n: trkIndex }) +
      (trkTitleKey ? " — " + tr(trkTitleKey) : "");
    for (let i = 0; i < trkObjs.length; i++) {
      const obj = trkObjs[i];
      const row = make("div", "mission-obj", tracker);
      css(row, {
        display: "flex",
        alignItems: "center",
        gap: "7px",
        padding: "4px 12px",
        background: "var(--gg-chip)",
        border: "1px solid var(--gg-line)",
        borderRight: "3px solid var(--gg-line)",
        borderRadius: "4px",
        fontSize: "12px",
        color: "var(--gg-text-dim)",
        textShadow: "0 1px 3px rgba(0,0,0,0.8)",
      });
      const glyph = make("span", "obj-glyph", row);
      css(glyph, { fontWeight: "800", fontSize: "11px" });
      const txt = make("span", "obj-text", row);
      const entry = { row, glyph, txt, obj };
      trkRows.push(entry);
      paintRow(entry);
    }
    tracker.style.display = "flex";
  }

  /** Quota chip text + visibility (quotaVisible gates the display). */
  function paintQuotaChip() {
    if (!quota || !(quota.need > 0) || !quotaVisible) {
      quotaChip.style.display = "none";
      return;
    }
    quotaVal.textContent = tr("quota_counter", {
      n: Math.min(quota.done, quota.need),
      need: quota.need,
    });
    quotaChip.style.display = ""; // back to the .chip CSS default (flex)
  }

  /** Adopt a quota objective descriptor into the chip cache. */
  function cacheQuota(o) {
    if (!o || o.type !== "quota") return;
    quota = {
      done: Math.round(Number(o.done) || 0),
      need: Math.round(Number(o.need) || 0),
      district: String(o.district || ""),
      complete: !!o.complete,
    };
  }

  /** Does objective descriptor `w` point at cached objective `o`? */
  function matchObj(o, w) {
    if (!w || typeof w !== "object") return false;
    if (w.type && o.type !== w.type) return false;
    if (w.target != null && o.target !== w.target) return false;
    if (w.item != null && o.item !== w.item) return false;
    if (w.district != null && o.district !== w.district) return false;
    return true;
  }

  /**
   * "objective-progress" {mission, objective, done, need}. The contract does
   * not pin the shape of `objective`, so the matcher is liberal: a number is
   * the 0-based index into the mission-start objectives, an object is matched
   * by type/target/item/district, a string by type; otherwise the first
   * incomplete row. Wrong-row picks only mislabel a sibling line visually —
   * missions stay authoritative.
   */
  function applyProgress(d) {
    if (!trkRows.length) return;
    const m = Number(d.mission);
    if (Number.isFinite(m) && m > 0 && trkIndex > 0 && m !== trkIndex) return;
    const want = d.objective;
    let entry = null;
    if (typeof want === "number" && Number.isInteger(want)) {
      entry = trkRows[want] || null;
    } else if (want && typeof want === "object") {
      entry =
        trkRows.find((r) => !r.obj.complete && matchObj(r.obj, want)) ||
        trkRows.find((r) => matchObj(r.obj, want)) ||
        null;
    } else if (typeof want === "string") {
      entry =
        trkRows.find((r) => !r.obj.complete && r.obj.type === want) ||
        trkRows.find((r) => r.obj.type === want) ||
        null;
    }
    if (!entry) entry = trkRows.find((r) => !r.obj.complete) || null;
    if (!entry) return;
    const done = Number(d.done);
    const need = Number(d.need);
    if (Number.isFinite(done)) entry.obj.done = done;
    if (Number.isFinite(need) && need > 0) entry.obj.need = need;
    entry.obj.complete = entry.obj.done >= entry.obj.need;
    paintRow(entry);
    if (entry.obj.type === "quota") {
      cacheQuota(entry.obj);
      paintQuotaChip();
    }
  }

  /** Run-scoped cleanup (gameover/menu + show(false)) — §5.4.6. */
  function clearStoryWidgets() {
    trkIndex = 0;
    trkTitleKey = "";
    trkObjs = [];
    renderTracker();
    quota = null;
    quotaVisible = false;
    paintQuotaChip();
    if (eHintShown) {
      eHintShown = false;
      eHint.style.display = "none";
    }
  }

  function applyLang() {
    const l = i18n && typeof i18n.getLang === "function" ? i18n.getLang() : "en";
    if (l === lang) return;
    lang = l;
    wLabelCache.clear();
    waveLbl.textContent = tr("wave");
    scoreLbl.textContent = tr("score");
    hpLbl.textContent = tr("health");
    reloadNote.textContent = tr("hudReloading");
    if (prevWeapon) wName.textContent = weaponDisplayLabel(prevWeapon);
    // EXPANSION labels.
    moneyLbl.textContent = tr("hudMoney");
    hintAction.textContent = tr("hudShopHint");
    if (bossTypeShown) bossName.textContent = bossLabel(bossTypeShown);
    // P1 story widgets re-resolve their templates/labels.
    renderTracker();
    paintQuotaChip();
    if (eHintShown) eHintLbl.textContent = tr("interact_hint");
    paintBarLabels(); // weapon slot bar: labels + tooltips (additive)
  }
  readHudSettings(); // accessibility / game feel boot values
  applyLang();
  paintBarOwnership(); // first paint: starter locks + pistol active

  // --- flash / vignette ---------------------------------------------------------
  function flashDamage(intensity) {
    const v = clamp(Number(intensity) || 0, 0, 1);
    if (v <= 0) return;
    flash.style.setProperty("--flash", v.toFixed(3));
    pulse(flash, "on");
  }

  // --- kill feed ----------------------------------------------------------------
  function addFeedLine(d) {
    const key = KNOWN_TYPES[d.type];
    const baseLabel = key ? tr(key) : String(d.type || "Zombie");
    const elite = ELITE_FEED_COLORS[d.elite] ? d.elite : null;
    const label = elite ? tr("elite" + elite[0].toUpperCase() + elite.slice(1)) + " · " + baseLabel : baseLabel;
    const line = make("div", "feed-line" + (d.headshot ? " hs" : ""), null);
    if (elite) {
      line.style.borderRightColor = ELITE_FEED_COLORS[elite];
      const tag = make("span", "tag", line);
      tag.textContent = tr("eliteTag");
      tag.style.background = ELITE_FEED_COLORS[elite];
    }
    if (d.headshot) {
      make("span", "tag", line).textContent = tr("hudHeadshot");
    }
    line.appendChild(document.createTextNode(label + " +" + fmtInt(d.score)));
    line.addEventListener(
      "animationend",
      () => {
        line.remove();
      },
      { once: true }
    );
    feed.prepend(line); // newest on top
    while (feed.childElementCount > 3) feed.lastElementChild.remove();
  }

  // --- boss bar -------------------------------------------------------------------
  function showBossBar(type, hp) {
    bossTracked = true;
    bossTypeShown = String(type || "");
    const startHp = Number(hp);
    if (Number.isFinite(startHp) && startHp > 0) bossMax = startHp;
    // A fresh boss spawns at full hp — reset the leftover fill width from a
    // previous boss instead of repainting the old value until data arrives.
    prevBossFill = 100;
    bossFill.style.width = "100%";
    bossName.textContent = bossLabel(bossTypeShown);
    bossWrap.style.display = "block";
  }

  function hideBossBar() {
    bossTracked = false;
    bossTypeShown = "";
    bossMax = 0;
    prevBossFill = -1;
    bossWrap.style.display = "none";
    if (prevArrowShown) {
      arrow.style.display = "none";
      prevArrowShown = false;
    }
  }

  // --- zone toast -------------------------------------------------------------------
  /** Show the shared toast. `gold` (GUN GAME 2.0 P4 §6.4) renders the
   * achievement variant — color var(--gg-gold), FROZEN style; every call
   * writes the full style set so normal toasts always reset cleanly. */
  function showToast(text, gold) {
    toastToken++;
    const my = toastToken;
    toast.textContent = text;
    toast.style.color = gold ? "var(--gg-gold)" : "#ffe9b0";
    toast.style.borderColor = gold ? "#ffe9b0" : "var(--gg-gold)";
    toast.style.fontWeight = gold ? "800" : "";
    toast.style.display = "block";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    void toast.offsetWidth; // reflow so the transition replays
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastTimer = 0;
      if (my !== toastToken) return; // a newer toast owns the node now
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-8px)";
      setTimeout(() => {
        if (my === toastToken) toast.style.display = "none";
      }, 280);
    }, 3000); // spec: auto-hide after 3 s
  }

  function hideToast() {
    toastToken++;
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = 0;
    }
    toast.style.display = "none";
  }

  // --- shop hint ---------------------------------------------------------------------
  function showHint() {
    if (!hintShown) {
      hintShown = true;
      hint.style.display = "flex";
    }
  }

  function hideHint() {
    if (hintShown) {
      hintShown = false;
      hint.style.display = "none";
    }
  }

  // --- P2 event widgets (docs/EXPANSION-P2.md §4.3, additive) -------------------

  /** Big centered event banner, 2.5 s, on its own node (never the wave
   * banner). WAAPI because style.css is frozen; a restart cancels the
   * previous animation so overlapping "event-start"s never stack. */
  function showEventBanner(text) {
    eventBanner.textContent = text;
    eventBanner.style.display = "block";
    if (evBannerAnim) {
      evBannerAnim.cancel();
      evBannerAnim = null;
    }
    if (typeof eventBanner.animate === "function") {
      evBannerAnim = eventBanner.animate(
        [
          { opacity: 0, transform: "scale(1.12)" },
          { opacity: 1, transform: "scale(1)", offset: 0.08 },
          { opacity: 1, transform: "scale(1)", offset: 0.78 },
          { opacity: 0, transform: "scale(1.02)" },
        ],
        { duration: 2500, easing: "ease-out" }
      );
      evBannerAnim.addEventListener(
        "finish",
        () => {
          evBannerAnim = null;
          eventBanner.style.display = "none";
        },
        { once: true }
      );
    } else {
      // Ancient browser fallback: static 2.4 s flash, no animation.
      eventBanner.style.opacity = "1";
      setTimeout(() => {
        eventBanner.style.display = "none";
        eventBanner.style.opacity = "0";
      }, 2400);
    }
  }

  function showBloodChip(seconds) {
    bloodOn = true;
    bloodLeft = seconds > 0 ? seconds : 90;
    bloodText = "";
    bloodChip.style.display = "block";
  }

  function hideBloodChip() {
    if (!bloodOn && bloodChip.style.display === "none") return;
    bloodOn = false;
    bloodLeft = 0;
    bloodText = "";
    bloodChip.style.display = "none";
  }

  function hideCompass() {
    if (compassShown) {
      compassShown = false;
      compassWrap.style.display = "none";
    }
  }

  /** Run-scoped cleanup for the P2 widgets — gameover/menu + show(false)
   * (§4.3). NOT on "paused": the bloodmoon chip must survive a pause (the
   * events scheduler freezes, so the countdown simply stops ticking). */
  function clearEventWidgets() {
    hideBloodChip();
    eventBanner.style.display = "none";
    if (evBannerAnim) {
      evBannerAnim.cancel();
      evBannerAnim = null;
    }
    hideCompass();
    if (mShown) {
      mShown = false;
      mMarker.style.display = "none";
    }
    if (scopeShown) {
      scopeShown = false;
      scopeOverlay.style.display = "none";
      cross.style.opacity = "";
    }
    hideDmgNumbers(); // GUN GAME 2.0 P4: no floating numbers survive a run end
    mapOpen = false; // the map closes itself on the same states — stay in sync
  }

  /** One projected marker on the strip (§4.3): the camera basis of the boss
   * arrow (hud boss-arrow right/fwd formula), position = mid + ang/0.8 ×
   * halfW, clamped to the edge as an outward chevron when out of view. */
  function drawStripMarker(g, mid, halfW, dx, dz, yaw, color) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const right = dx * cos - dz * sin;
    const fwd = -dx * sin - dz * cos;
    const ang = Math.atan2(right, fwd);
    let p = ang / ARROW_CONE;
    const off = p > 1 || p < -1;
    if (p > 1) p = 1;
    else if (p < -1) p = -1;
    const x = mid + p * halfW;
    g.fillStyle = color;
    g.strokeStyle = "rgba(0, 0, 0, 0.85)";
    g.lineWidth = 1;
    g.beginPath();
    if (off) {
      const dir = p > 0 ? 1 : -1;
      g.moveTo(x + 4 * dir, 8);
      g.lineTo(x - 2 * dir, 3);
      g.lineTo(x - 2 * dir, 13);
    } else {
      g.moveTo(x, 3.5);
      g.lineTo(x + 4.5, 8);
      g.lineTo(x, 12.5);
      g.lineTo(x - 4.5, 8);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }

  /** Redraw the compass strip — called from update() while visible (§4.3:
   * mission gold + event color, center tick = the player's heading). */
  function drawCompass(player, s) {
    const wpx = compassWrap.clientWidth | 0;
    if (wpx < 60) return;
    if (compassCanvas.width !== wpx) {
      compassCanvas.width = wpx;
      compassCanvas.height = 16;
    }
    const g = compassCtx;
    g.clearRect(0, 0, wpx, 16);
    // Center tick = the player's view direction.
    g.fillStyle = "rgba(207, 216, 234, 0.85)";
    g.fillRect(wpx / 2 - 1, 2, 2, 12);
    if (!player || !player.position) return;
    const px = player.position.x;
    const pz = player.position.z;
    const halfW = wpx / 2 - 7;
    if (s.hasMission) {
      drawStripMarker(g, wpx / 2, halfW, s.mx - px, s.mz - pz, s.yaw, STRIP_MISSION_COLOR);
    }
    if (s.hasEvent) {
      drawStripMarker(
        g,
        wpx / 2,
        halfW,
        s.ex - px,
        s.ez - pz,
        s.yaw,
        EVENT_STRIP_COLORS[s.etype] || "#e8eefc"
      );
    }
  }

  // --- GUN GAME 2.0 P4: floating damage numbers + FPS (§6.4) --------------------

  /** "damage-dealt" {pos, amount, headshot} → acquire a free pool slot.
   * Cap 30 is FROZEN: when every slot is live the new number is DROPPED
   * (P4-K16 "thừa → bỏ"). The div stays display:none until the next update()
   * positions it through extras.cam. */
  function spawnDamageNumber(d) {
    if (!damageNumbersOn) return; // accessibility: setting off → no new numbers
    if (!d || typeof d !== "object") return;
    const p = d.pos;
    const amount = Number(d.amount);
    if (!p || typeof p !== "object") return;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) return;
    let slot = null;
    for (let i = 0; i < dmgPool.length; i++) {
      if (!dmgPool[i].active) {
        slot = dmgPool[i];
        break;
      }
    }
    if (!slot) return; // pool exhausted → drop
    slot.active = true;
    slot.age = 0;
    slot.x = Number(p.x);
    slot.y = Number(p.y);
    slot.z = Number(p.z);
    slot.head = d.headshot === true;
    slot.txt = fmtInt(amount);
    slot.px = -1;
    slot.py = -1;
    slot.shown = false;
    slot.lastOp = 1;
    slot.el.textContent = slot.txt;
    // Headshot: bigger, red, heavier — normal: white (P4-K16).
    slot.el.style.fontSize = slot.head ? "18px" : "14px";
    slot.el.style.fontWeight = slot.head ? "800" : "700";
    slot.el.style.color = slot.head ? "#ff5a4d" : "#f2f7ff";
    slot.el.style.display = "none";
  }

  /** Tick the pool from update()'s measured dt. Only update() calls this, so
   * numbers freeze while paused and die on the next playing frame — the same
   * principle as the bloodmoon chip. `cam` (extras.cam) missing → numbers
   * stay invisible but keep aging (P4-K16 "cam thiếu → bỏ số"). */
  function tickDamageNumbers(dt, cam) {
    // A camera has no project() method of its own — Vector3.project(camera)
    // needs the camera's matrices (main passes the live PerspectiveCamera).
    const usableCam = !!cam && !!cam.matrixWorldInverse && !!cam.projectionMatrix;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < dmgPool.length; i++) {
      const s = dmgPool[i];
      if (!s.active) continue;
      s.age += dt;
      if (s.age >= DMG_LIFE) {
        s.active = false;
        if (s.shown) {
          s.el.style.display = "none";
          s.shown = false;
        }
        continue;
      }
      if (!usableCam) {
        if (s.shown) {
          s.el.style.display = "none";
          s.shown = false;
        }
        continue;
      }
      dmgV.set(s.x, s.y, s.z).project(cam);
      // NDC out of [-1, 1] = behind the camera or beyond the far plane —
      // hide this frame (project() has no separate w test to lean on).
      if (dmgV.z > 1 || dmgV.z < -1) {
        if (s.shown) {
          s.el.style.display = "none";
          s.shown = false;
        }
        continue;
      }
      const t = s.age / DMG_LIFE;
      const ipx = Math.round((dmgV.x * 0.5 + 0.5) * w);
      const ipy = Math.round((-dmgV.y * 0.5 + 0.5) * h - t * DMG_RISE);
      if (!s.shown) {
        s.el.style.display = "block";
        s.shown = true;
      }
      if (ipx !== s.px || ipy !== s.py) {
        s.px = ipx;
        s.py = ipy;
        s.el.style.transform =
          "translate(" + ipx + "px," + ipy + "px) translate(-50%,-50%)";
      }
      // Opacity fades over the lifetime; write gated on a 1/50 step.
      const op = Math.round(clamp(1 - t, 0, 1) * 50) / 50;
      if (op !== s.lastOp) {
        s.lastOp = op;
        s.el.style.opacity = String(op);
      }
    }
  }

  /** Run-scoped wipe (gameover/menu + show(false)) — no leftover numbers. */
  function hideDmgNumbers() {
    for (let i = 0; i < dmgPool.length; i++) {
      const s = dmgPool[i];
      s.active = false;
      if (s.shown) {
        s.el.style.display = "none";
        s.shown = false;
      }
    }
  }

  // --- bus -----------------------------------------------------------------------
  bus.addEventListener("spread", (e) => {
    if (reducedMotionOn) return; // accessibility: no crosshair kick
    const d = e && e.detail ? e.detail : {};
    const v = Number(d.value);
    if (Number.isFinite(v) && v > 0) {
      kick = Math.min(MAX_GAP - BASE_GAP, kick + v * KICK_PER_RAD);
    }
  });

  bus.addEventListener("hit", (e) => {
    const d = e && e.detail ? e.detail : {};
    hitm.classList.toggle("hs", !!d.headshot);
    hitm.classList.toggle("kill", !!d.killed);
    pulse(hitm, "show");
  });

  bus.addEventListener("zombie-killed", (e) => {
    const d = e && e.detail ? e.detail : {};
    addFeedLine(d);
    // Spec: the boss bar hides on the "zombie-killed" of a boss. Regular
    // zombie types (incl. the screamer's summons) never match BOSS_TYPES.
    if (BOSS_TYPES[d.type]) hideBossBar();
  });

  bus.addEventListener("wave-start", (e) => {
    const d = e && e.detail ? e.detail : {};
    banner.classList.remove("clear");
    banner.textContent = tr("waveBanner", { n: Math.round(Number(d.n) || 0) });
    pulse(banner, "show");
    if (audio && typeof audio.waveBanner === "function") audio.waveBanner();
    intermission = false; // the rest is over — drop the shop hint
    hideHint();
  });

  bus.addEventListener("wave-clear", (e) => {
    const d = e && e.detail ? e.detail : {};
    banner.classList.add("clear");
    banner.textContent = tr("waveClear", { n: Math.round(Number(d.n) || 0) });
    pulse(banner, "show");
    intermission = true; // 10 s rest (waves.js) — time to visit the shop
    showHint();
  });

  // EXPANSION: money chip. The pulse color is WAAPI (style.css is frozen).
  bus.addEventListener("money-changed", (e) => {
    const d = e && e.detail ? e.detail : {};
    const m = Number(d.money);
    if (Number.isFinite(m) && m !== prevMoney) {
      prevMoney = m;
      moneyVal.textContent = "$" + fmtInt(m);
    }
    const delta = Number(d.delta);
    if (Number.isFinite(delta) && delta !== 0 && typeof moneyVal.animate === "function") {
      moneyVal.animate(
        [
          { color: delta > 0 ? "#ffe08a" : "#ff8a7a" },
          { color: "#ffd35e" },
        ],
        { duration: 450, easing: "ease-out" }
      );
    }
  });

  bus.addEventListener("boss-spawned", (e) => {
    const d = e && e.detail ? e.detail : {};
    showBossBar(d.type, Number(d.hp));
  });

  bus.addEventListener("zone-unlocked", (e) => {
    const d = e && e.detail ? e.detail : {};
    showToast(tr("hudZoneToast") + ": " + zoneLabel(d.id, d.name));
  });

  // --- P1 story events (docs/EXPANSION-P1.md §6) ------------------------------

  // Tracker rebuild + quota cache from the fresh objective list.
  bus.addEventListener("mission-start", (e) => {
    const d = e && e.detail ? e.detail : {};
    trkIndex = Math.round(Number(d.index) || 0);
    trkTitleKey = typeof d.titleKey === "string" ? d.titleKey : "";
    trkObjs = Array.isArray(d.objectives)
      ? d.objectives.filter((o) => o && typeof o === "object")
      : [];
    renderTracker();
    let q = null;
    for (let i = 0; i < trkObjs.length; i++) {
      if (trkObjs[i] && trkObjs[i].type === "quota") q = trkObjs[i];
    }
    quota = null;
    cacheQuota(q);
    // Event-driven default: visible once a quota exists; extras.district
    // refines this to "only while standing in the quota district".
    quotaVisible = !!(quota && quota.need > 0);
    paintQuotaChip();
  });

  bus.addEventListener("objective-progress", (e) => {
    applyProgress(e && e.detail ? e.detail : {});
  });

  bus.addEventListener("quota-done", () => {
    if (quota) quota.complete = true;
    showToast(tr("quota_done_toast")); // "DISTRICT CLEARED" / "KHU ĐÃ SẠCH"
  });

  // main.js pays the reward; the toast + tracker flash are the HUD's job.
  bus.addEventListener("mission-complete", (e) => {
    const d = e && e.detail ? e.detail : {};
    showToast(
      tr("mission_complete_toast", {
        money: Math.max(0, Math.round(Number(d.reward) || 0)),
      })
    );
    if (tracker.style.display !== "none" && typeof tracker.animate === "function") {
      tracker.animate(
        [{ filter: "brightness(2.1)" }, { filter: "brightness(1)" }],
        { duration: 650, easing: "ease-out" }
      );
    }
  });

  bus.addEventListener("gate-open", (e) => {
    const d = e && e.detail ? e.detail : {};
    showToast(tr("gate_open_toast", { district: districtLabel(d.to) }));
  });

  bus.addEventListener("interact-near", (e) => {
    const d = e && e.detail ? e.detail : {};
    if (d.near) {
      eHintLbl.textContent = tr("interact_hint");
      const raw = String(d.target || "");
      const label = storyLabel(raw);
      eHintTarget.textContent = label && label !== raw ? "· " + label : "";
      eHintTarget.style.display = eHintTarget.textContent ? "inline" : "none";
      if (!eHintShown) {
        eHintShown = true;
        eHint.style.display = "block";
      }
    } else if (eHintShown) {
      eHintShown = false;
      eHint.style.display = "none";
    }
  });

  bus.addEventListener("mission-reset", () => {
    trkIndex = 0;
    trkTitleKey = "";
    trkObjs = [];
    renderTracker();
    quota = null;
    quotaVisible = false;
    paintQuotaChip();
  });

  // The hint would point at a shop that is already on screen.
  bus.addEventListener("shop-open", hideHint);
  bus.addEventListener("shop-closed", () => {
    if (intermission) showHint(); // still resting between waves
  });

  // Run END (gameover / back to menu): drop run-scoped overlays so a restart
  // never resurrects a dead boss bar. Deliberately NOT reset on "playing" —
  // resume() also passes through that state mid-boss.
  bus.addEventListener("state-changed", (e) => {
    const st = e && e.detail ? e.detail.state : null;
    if (st === "paused") {
      // update() doesn't run while paused — the full-screen scope vignette
      // must not freeze over the pause screen. It re-arms on the first
      // playing frame if RMB is still held.
      if (scopeShown) {
        scopeShown = false;
        scopeOverlay.style.display = "none";
      }
      cross.style.opacity = "";
    }
    if (st === "gameover" || st === "menu") {
      hideBossBar();
      hideToast();
      hideHint();
      clearStoryWidgets(); // P1: tracker + quota + hint E are run-scoped
      clearEventWidgets(); // P2: banner + bloodmoon chip + compass (§4.3)
      resetWeaponBar(); // weapon bar: back to the starter ownership
      intermission = false;
    }
  });

  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail && e.detail.patch ? e.detail.patch : null;
    if (!patch) return;
    if (patch.lang) applyLang();
    // Accessibility / game feel (user request): live crosshair + HUD gates.
    if (
      typeof patch.crosshairColor === "string" &&
      CROSSHAIR_COLORS[patch.crosshairColor]
    ) {
      crosshairColor = patch.crosshairColor;
      applyCrosshairSettings();
    }
    if (typeof patch.crosshairSize === "number" && Number.isFinite(patch.crosshairSize)) {
      crosshairSize = normalizeCrosshairSize(patch.crosshairSize);
      applyCrosshairSettings();
    }
    if (typeof patch.damageNumbers === "boolean") setDamageNumbers(patch.damageNumbers);
    if (typeof patch.reducedMotion === "boolean") setReducedMotion(patch.reducedMotion);
  });

  // --- P2 event widgets (docs/EXPANSION-P2.md §4.3) ------------------------------

  bus.addEventListener("event-start", (e) => {
    const d = e && e.detail ? e.detail : {};
    const type = String(d.type || "");
    if (!type) return;
    const key = "event_" + type + "_banner";
    const text = tr(key);
    showEventBanner(text === key ? type.toUpperCase() : text);
    if (type === "bloodmoon") {
      // events emits both "bloodmoon-active" and this; same data, keep in sync.
      showBloodChip(Number(d.timeLeft) > 0 ? Number(d.timeLeft) : 90);
    }
  });

  bus.addEventListener("event-end", (e) => {
    const d = e && e.detail ? e.detail : {};
    if (String(d.type) === "bloodmoon") {
      hideBloodChip(); // the toast rides "bloodmoon-active" {active:false}
    }
    const reason = String(d.reason || "");
    if (reason === "opened") {
      showToast(tr("event_supply_opened", { money: fmtInt(d.money) }));
    } else if (reason === "rescued") {
      showToast(tr("event_survivor_rescued"));
    } else if (reason === "lost") {
      showToast(tr("event_survivor_lost"));
    }
  });

  bus.addEventListener("bloodmoon-active", (e) => {
    const d = e && e.detail ? e.detail : {};
    if (d && d.active) {
      showBloodChip(Number(d.duration) > 0 ? Number(d.duration) : 90);
    } else {
      hideBloodChip();
      // A "reset"-reason off (fresh run while the moon was up) must not leak
      // the "moon wanes" toast into the new run's first seconds.
      if (d.reason !== "reset") showToast(tr("event_bloodmoon_end"));
    }
  });

  // The M map owns the top strip while it is open (§4.3) — hide the compass.
  bus.addEventListener("map-visibility", (e) => {
    const d = e && e.detail ? e.detail : {};
    mapOpen = !!d.open;
  });

  // --- GUN GAME 2.0 P4 widgets (§6.4) ---------------------------------------------

  // F3 (input.js) flips the FPS counter — default hidden, state persists
  // across runs (HUD visibility itself is owned by root's .hidden class).
  bus.addEventListener("fps-toggle", () => {
    fpsShown = !fpsShown;
    fpsChip.style.display = fpsShown ? "block" : "none";
  });

  // One floating number per pellet hit (P4-K16 — combat.js emits; until the
  // integrator wires that emit this listener simply never fires).
  bus.addEventListener("damage-dealt", (e) => {
    spawnDamageNumber(e && e.detail ? e.detail : null);
  });

  // Gold achievement toast (P4-K16/§8.4): name resolves through the achv_*
  // keys achievements.js registers at module level — an unknown id shows the
  // raw key rather than crashing (i18n.t never throws).
  bus.addEventListener("achievement-unlocked", (e) => {
    const d = e && e.detail ? e.detail : {};
    const id = String(d.id || "");
    showToast(tr("achvToast", { name: tr("achv_" + id) }), true);
  });

  // Dossier unlock (user request): help.js resolves the full localized body in
  // detail.text, so the HUD needs no per-character name keys. codexToast stays
  // the fallback for any other emitter (and the one new key this module owns).
  bus.addEventListener("codex-unlocked", (e) => {
    const d = e && e.detail ? e.detail : {};
    const body = typeof d.text === "string" ? d.text : "";
    if (body) {
      showToast(body, true);
      return;
    }
    const name = d.nameKey ? tr(String(d.nameKey)) : "";
    showToast(tr("codexToast", { name }), true);
  });

  // --- extras parsing (per-frame, zero allocation) -----------------------------

  /** Fill bossScratch from the optional 4th update() argument. */
  function readExtras(arg) {
    const s = bossScratch;
    s.has = false;
    s.hasYaw = false;
    s.hp = NaN;
    s.maxHp = NaN;
    s.type = "";
    s.visible = null;
    s.hasMission = false;
    s.hasEvent = false;
    if (!arg || typeof arg !== "object") return s;

    // Yaw: number → alias → camera object (rotation order "YXZ") → forward vec.
    let yaw;
    if (Number.isFinite(arg.yaw)) yaw = Number(arg.yaw);
    else if (Number.isFinite(arg.camYaw)) yaw = Number(arg.camYaw);
    else if (
      arg.camera &&
      arg.camera.rotation &&
      Number.isFinite(arg.camera.rotation.y)
    ) {
      yaw = Number(arg.camera.rotation.y);
    } else if (
      arg.forward &&
      Number.isFinite(arg.forward.x) &&
      Number.isFinite(arg.forward.z)
    ) {
      yaw = Math.atan2(-arg.forward.x, -arg.forward.z);
    }
    if (yaw !== undefined) {
      s.hasYaw = true;
      s.yaw = yaw;
    }

    // Boss: Vector3-like flat {x,z}, {position}, or a live boss object that
    // carries hp/maxHp/type alongside.
    const b = arg.boss || arg.bossPos || arg.bossPosition || null;
    if (b && typeof b === "object") {
      const p = b.position && typeof b.position === "object" ? b.position : b;
      if (Number.isFinite(p.x) && Number.isFinite(p.z)) {
        s.has = true;
        s.x = Number(p.x);
        s.z = Number(p.z);
        if (Number.isFinite(b.hp)) s.hp = Number(b.hp);
        if (Number.isFinite(b.maxHp)) s.maxHp = Number(b.maxHp);
        if (typeof b.type === "string") s.type = b.type;
        if (typeof b.visible === "boolean") s.visible = b.visible;
      }
    }

    // P2 (§4.3): mission + event markers (main derives — P2-K13). A nested
    // `position` is tolerated, same as the boss field.
    const mi = arg.mission;
    if (mi && typeof mi === "object") {
      const mp =
        mi.position && typeof mi.position === "object" ? mi.position : mi;
      if (Number.isFinite(mp.x) && Number.isFinite(mp.z)) {
        s.hasMission = true;
        s.mx = Number(mp.x);
        s.mz = Number(mp.z);
      }
    }
    const ev = arg.event;
    if (ev && typeof ev === "object" && typeof ev.type === "string" && ev.type) {
      const ep =
        ev.position && typeof ev.position === "object" ? ev.position : ev;
      if (Number.isFinite(ep.x) && Number.isFinite(ep.z)) {
        s.hasEvent = true;
        s.etype = ev.type;
        s.ex = Number(ep.x);
        s.ez = Number(ep.z);
      }
    }
    return s;
  }

  // --- per-frame update ------------------------------------------------------------
  function update(player, weapons, gamestate, extras) {
    // Measured dt (update() has no dt param) for the kick decay / gap easing.
    const now = performance.now();
    let dt = lastT ? (now - lastT) / 1000 : 0.016;
    lastT = now;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.05) dt = 0.05;

    applyLang();

    // GUN GAME 2.0 P4 (§6.4): FPS EMA from the measured dt (only painted
    // while shown; update() runs only while playing — pause freezes it, the
    // same principle as the bloodmoon chip).
    if (fpsShown) {
      fpsVal += (1 / dt - fpsVal) * FPS_SMOOTH;
      const out = "FPS " + Math.round(fpsVal);
      if (out !== prevFpsOut) {
        prevFpsOut = out;
        fpsText.nodeValue = out;
      }
    }
    // Floating damage numbers — projected through extras.cam (P4-K12/K16).
    // Placed before the player/weapons early return: these widgets tick on
    // every update() call, independent of the gameplay arguments.
    tickDamageNumbers(dt, extras ? extras.cam : null);

    // ADS state (main.js): blend eases 0→1 while aiming; deep = sniper-class
    // zoom → scope overlay replaces the tick crosshair.
    const adsB = extras && extras.ads ? extras.ads.blend : 0;
    const wantScope = !!(extras && extras.ads && extras.ads.deep && adsB > 0.6);
    if (wantScope !== scopeShown) {
      scopeShown = wantScope;
      scopeOverlay.style.display = wantScope ? "block" : "none";
    }
    cross.style.opacity = wantScope ? "0" : "";

    // Crosshair: ease toward base + weapon spread, plus decaying shot kick.
    // Aiming tightens the gap up to 55% so the reticle reads as steadier.
    kick *= Math.exp(-dt * 9);
    const spread =
      weapons && Number.isFinite(weapons.spread) ? Number(weapons.spread) : 0;
    const target =
      clamp(
        BASE_GAP + clamp(spread, 0, 0.2) * GAP_PER_RAD + kick,
        BASE_GAP,
        MAX_GAP
      ) *
      (1 - adsB * 0.55);
    gapCur += (target - gapCur) * Math.min(1, dt * 20);
    if (Math.abs(gapCur - gapWritten) > 0.25) {
      gapWritten = gapCur;
      cross.style.setProperty("--gap", gapCur.toFixed(2) + "px");
    }

    if (!player || !weapons) return;

    // Health: bar, number, vignette follow; strong flash proportional to damage.
    const hp = clamp(Number(player.hp) || 0, 0, 100);
    if (hp !== prevHp) {
      if (prevHp >= 0 && hp < prevHp) {
        flashDamage(clamp(0.35 + (prevHp - hp) / 45, 0.35, 1));
      }
      hpFill.style.width = hp.toFixed(1) + "%";
      hpNum.textContent = String(Math.round(hp));
      hpFill.classList.toggle("low", hp <= 25);
      hpFill.classList.toggle("warn", hp > 25 && hp <= 55);
      vignette.style.opacity = (((100 - hp) / 100) * 0.55).toFixed(3);
      root.classList.toggle("crit", hp <= 30 && hp > 0);
      prevHp = hp;
    }

    // Ammo: "mag / reserve"; pistol reserve is Infinity → "∞".
    const mag = clamp(Math.round(Number(weapons.mag) || 0), 0, 9999);
    if (mag !== prevMag) {
      magEl.textContent = String(mag);
      prevMag = mag;
    }
    const resText =
      weapons.reserve === Infinity ? "∞" : fmtInt(weapons.reserve);
    if (resText !== prevRes) {
      resEl.textContent = resText;
      prevRes = resText;
    }

    const wname = String(weapons.name || "");
    if (wname !== prevWeapon) {
      wName.textContent = weaponDisplayLabel(wname);
      prevWeapon = wname;
    }

    const reloading = !!weapons.reloading;
    if (reloading !== prevReloading) {
      ammoWrap.classList.toggle("reloading", reloading);
      prevReloading = reloading;
    }

    // --- weapon slot bar (additive; see the header note) -------------------
    // Ownership is polled: weapons.js emits no ownership event (only
    // "fire"/"spread"), so extras.weapons is the source. Absent → the cached
    // ownership stays and the active slot's ammo still tracks update()'s
    // `weapons` argument (graceful degradation, never an invented lock).
    readBarWeapons(extras);
    if (wname !== wbarActiveName) {
      const prev = wbarActive;
      const idx = WEAPON_INDEX[wname];
      wbarActiveName = wname;
      wbarActive = idx === undefined ? -1 : idx;
      if (prev >= 0 && prev !== wbarActive) {
        // Clear the ammo/tint/reload of the slot we just left.
        paintSlotAmmo(wbarSlots[prev], "", 0, 2, false);
        paintSlotReload(wbarSlots[prev], false);
      }
      paintBarOwnership();
      paintBarLabels(); // tooltips follow the active/locked state
    }
    if (wbarActive >= 0) {
      const slot = wbarSlots[wbarActive];
      // "mag/reserve" — one string rebuild only when a number changes.
      if (mag !== wbarMag || resText !== wbarRes) {
        wbarMag = mag;
        wbarRes = resText;
        wbarAmmoTxt = mag + "/" + resText;
      }
      const size = clamp(Math.round(Number(weapons.magSize) || 1), 1, 9999);
      const pct = clamp(Math.round((mag / size) * 100), 0, 100);
      // While reloading the marker takes the ammo text's place; the tint
      // stays (live mag fraction), so the slot still reads as loaded.
      paintSlotAmmo(
        slot,
        reloading ? "" : wbarAmmoTxt,
        pct,
        pct <= 20 ? 0 : pct <= 50 ? 1 : 2,
        true
      );
      paintSlotReload(slot, reloading);
    }

    // Top-center wave + score. GUN GAME 2.0 P4 (P4-K12/§6.4): while Endless
    // is active, extras.endless ({wave, score} from endless.snapshot()) takes
    // over BOTH chips — gamestate.score keeps drifting with the STORY score
    // in this mode and must not show (gamestate.wave happens to track, but
    // the contract routes the endless values through extras).
    const endless = extras && typeof extras === "object" ? extras.endless : null;
    if (endless && typeof endless === "object" && endless.active === true) {
      const eScore = Math.round(Number(endless.score) || 0);
      if (eScore !== prevScore) {
        scoreVal.textContent = fmtInt(eScore);
        prevScore = eScore;
      }
      const eWave = Math.round(Number(endless.wave) || 0);
      if (eWave !== prevWave) {
        waveVal.textContent = fmtInt(eWave);
        prevWave = eWave;
      }
    } else if (gamestate) {
      const score = Math.round(Number(gamestate.score) || 0);
      if (score !== prevScore) {
        scoreVal.textContent = fmtInt(score);
        prevScore = score;
      }
      const wave = Math.round(Number(gamestate.wave) || 0);
      if (wave !== prevWave) {
        waveVal.textContent = fmtInt(wave);
        prevWave = wave;
      }
    }

    // --- P1: quota chip visibility follows the player's district ----------
    // extras.district (main computes city.districtAt(player) every frame,
    // zero-alloc). Absent field → keep the event-driven state (§5.4.5).
    if (
      extras &&
      typeof extras === "object" &&
      Object.prototype.hasOwnProperty.call(extras, "district")
    ) {
      const d = extras.district;
      const want =
        !!quota &&
        quota.need > 0 &&
        typeof d === "string" &&
        d === quota.district;
      if (want !== quotaVisible) {
        quotaVisible = want;
        paintQuotaChip();
      }
    }

    // --- EXPANSION: boss bar drain + direction arrow (optional extras) ---
    const s = readExtras(extras);
    if (s.has) {
      // Event-driven fallback: adopt a live boss passed by main even if no
      // "boss-spawned" reached us yet, so the bar can never stay hidden.
      if (!bossTracked) showBossBar(s.type, NaN);
      if (s.type && s.type !== bossTypeShown) {
        bossTypeShown = s.type;
        bossName.textContent = bossLabel(bossTypeShown);
      }
      if (Number.isFinite(s.maxHp) && s.maxHp > 0) bossMax = s.maxHp;
      if (bossMax > 0 && Number.isFinite(s.hp)) {
        const pct = clamp((s.hp / bossMax) * 100, 0, 100);
        if (Math.abs(pct - prevBossFill) > 0.5) {
          prevBossFill = pct;
          bossFill.style.width = pct.toFixed(1) + "%";
        }
      }
    }

    if (s.has && s.hasYaw) {
      const dx = s.x - player.position.x;
      const dz = s.z - player.position.z;
      const cos = Math.cos(s.yaw);
      const sin = Math.sin(s.yaw);
      // Project onto the camera basis: 0 rad = boss dead ahead (arrow up),
      // +π/2 = boss to the right (CSS rotate is clockwise), ±π = behind.
      const right = dx * cos - dz * sin;
      const fwd = -dx * sin - dz * cos;
      const ang = Math.atan2(right, fwd);
      // Out of view = outside the half-angle cone, unless main overrides
      // with an explicit frustum-tested `visible` flag.
      const shown = s.visible !== null ? s.visible : Math.abs(ang) > ARROW_CONE;
      if (shown) {
        if (!prevArrowShown) {
          arrow.style.display = "block";
          prevArrowShown = true;
          prevArrowAngle = NaN; // force the transform write below
        }
        if (!(Math.abs(ang - prevArrowAngle) < 0.01)) {
          prevArrowAngle = ang;
          arrowRot.style.transform = "rotate(" + ang.toFixed(3) + "rad)";
        }
      } else if (prevArrowShown) {
        arrow.style.display = "none";
        prevArrowShown = false;
      }
    } else if (prevArrowShown) {
      // No boss data (or no yaw source) this frame → the arrow never guesses.
      arrow.style.display = "none";
      prevArrowShown = false;
    }

    // --- P2: bloodmoon countdown chip (ticked by the measured dt, §4.3) ---
    if (bloodOn) {
      bloodLeft -= dt;
      if (bloodLeft <= 0) bloodLeft = 0;
      const txt = tr("event_bloodmoon_timer", { n: Math.ceil(bloodLeft) });
      if (txt !== bloodText) {
        bloodText = txt;
        bloodChip.textContent = txt;
      }
    }

    // --- P2: compass strip (hidden when: no yaw, no marker, map open) -----
    const wantCompass = s.hasYaw && !mapOpen && (s.hasMission || s.hasEvent);
    if (wantCompass) {
      if (!compassShown) {
        compassShown = true;
        compassWrap.style.display = "block";
        lastCompassPaint = now;
        drawCompass(player, s); // paint immediately on (re)show
      } else if (now - lastCompassPaint >= 100) {
        // 10 Hz repaint — a coarse direction guide needs no 60 fps (§4.0).
        lastCompassPaint = now;
        drawCompass(player, s);
      }
    } else {
      hideCompass();
    }

    // --- mission waypoint marker (◆ + distance, pinned to edge when behind) --
    const mCam = extras ? extras.cam : null;
    const mOn =
      s.hasMission &&
      s.hasYaw &&
      !mapOpen &&
      mCam &&
      mCam.projectionMatrix &&
      mCam.matrixWorldInverse;
    if (mOn) {
      const dxm = s.mx - player.position.x;
      const dzm = s.mz - player.position.z;
      const dist = Math.sqrt(dxm * dxm + dzm * dzm);
      const cosY = Math.cos(s.yaw);
      const sinY = Math.sin(s.yaw);
      const rightD = dxm * cosY - dzm * sinY;
      const w = window.innerWidth;
      const h = window.innerHeight;
      let px;
      let py;
      // Always project first (2.4 m float height) — the behind-camera test
      // must read the clip-space z, not yaw: at near-90° pitch a yaw-"front"
      // target can sit behind the camera plane and project() would mirror it.
      dmgV.set(s.mx, 2.4, s.mz).project(mCam);
      if (dmgV.z <= 1 && dmgV.z >= -1) {
        px = clamp((dmgV.x * 0.5 + 0.5) * w, 24, w - 24);
        py = clamp((-dmgV.y * 0.5 + 0.5) * h, 44, h - 44);
      } else {
        // Truly behind: pin to the edge on the target's yaw side.
        px = rightD >= 0 ? w - 30 : 30;
        py = h * 0.45;
      }
      const mPulse = reducedMotionOn ? 1 : 1 + 0.09 * Math.sin(now * 0.006);
      mMarker.style.transform =
        "translate(" + Math.round(px) + "px," + Math.round(py) + "px) translateX(-50%) scale(" + mPulse.toFixed(3) + ")";
      const label = "◆ " + Math.round(dist) + "m";
      if (label !== prevMText) {
        prevMText = label;
        mMarker.textContent = label;
      }
      if (!mShown) {
        mShown = true;
        mMarker.style.display = "block";
      }
    } else if (mShown) {
      mShown = false;
      mMarker.style.display = "none";
    }
  }

  function show(visible) {
    root.classList.toggle("hidden", !visible);
    if (visible) {
      // Re-sync cleanly after restart: first update() must not flash.
      prevHp = -1;
      lastT = 0;
    } else {
      feed.replaceChildren();
      banner.classList.remove("show");
      hitm.classList.remove("show");
      prevReloading = null;
      ammoWrap.classList.remove("reloading");
      // EXPANSION transients: nothing should survive into the menu/gameover
      // screen (run-scoped state is also cleared by the state-changed guard).
      hideBossBar();
      hideToast();
      hideHint();
      clearStoryWidgets(); // P1: tracker + quota + hint E
      clearEventWidgets(); // P2: banner + bloodmoon chip + compass
      resetWeaponBar(); // weapon bar: starter ownership, no ammo paint
      intermission = false;
    }
  }

  return { update, show, flashDamage };
}
