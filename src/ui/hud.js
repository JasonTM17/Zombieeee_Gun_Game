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
 * "wave-clear", "settings-changed" (language only), plus the EXPANSION events
 * "money-changed" {money, delta}, "boss-spawned" {type, zoneId, hp},
 * "zone-unlocked" {id, name}, "shop-open" / "shop-closed" {} and
 * "state-changed" {state} (run-end cleanup). Bus-driven sounds:
 * audio.waveBanner() on "wave-start".
 *
 * Implementation notes:
 * - No object allocation in the per-frame path: DOM writes are gated on value
 *   change, crosshair gap is one CSS custom property, decay uses a measured
 *   dt (update() has no dt parameter), the extras parsing fills a shared
 *   scratch object.
 * - Extra i18n keys registered here (merged, EN + VI): hudReloading,
 *   hudHeadshot, killWalker, killRunner, killBrute, wPistol, wShotgun,
 *   wRifle, and the EXPANSION keys hudMoney, hudShopHint, hudZoneToast,
 *   zoneNorth, zoneEast, bossButcher, bossSpitter, bossScreamer, bossGolem,
 *   killButcher, killSpitter, killScreamer, killGolem, wSmg, wSniper,
 *   wMinigun, wGrenade. Only THIS module's dict entries are touched (C8).
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

// Crosshair geometry (px): gap = BASE + spread(rad) * PER_RAD + shot kick.
const BASE_GAP = 8;
const GAP_PER_RAD = 620;
const KICK_PER_RAD = 900;
const MAX_GAP = 54;

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
};
const KNOWN_TYPES = {
  walker: "killWalker",
  runner: "killRunner",
  brute: "killBrute",
  butcher: "killButcher",
  spitter: "killSpitter",
  screamer: "killScreamer",
  golem: "killGolem",
};
const BOSS_TYPES = { butcher: 1, spitter: 1, screamer: 1, golem: 1 };

const HUD_BUNDLE = {
  en: {
    hudReloading: "RELOADING…",
    hudHeadshot: "HEADSHOT",
    killWalker: "Walker down",
    killRunner: "Runner down",
    killBrute: "Brute down",
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
    killButcher: "Butcher down",
    killSpitter: "Spitter down",
    killScreamer: "Screamer down",
    killGolem: "Golem down",
    wSmg: "SMG",
    wSniper: "Sniper",
    wMinigun: "Minigun",
    wGrenade: "Grenade Launcher",
  },
  vi: {
    hudReloading: "ĐANG NẠP ĐẠN…",
    hudHeadshot: "VÀO ĐẦU",
    killWalker: "Hạ gục Walker",
    killRunner: "Hạ gục Runner",
    killBrute: "Hạ gục Brute",
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
    killButcher: "Hạ gục Butcher",
    killSpitter: "Hạ gục Spitter",
    killScreamer: "Hạ gục Screamer",
    killGolem: "Hạ gục Golem",
    wSmg: "SMG",
    wSniper: "Súng bắn tỉa",
    wMinigun: "Minigun",
    wGrenade: "Súng phóng lựu",
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

  const top = make("div", "topinfo", root);
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

  // "B — SHOP" hint chip, bottom center, visible during wave intermission.
  const hintWrap = make("div", "shop-hint-wrap", root);
  css(hintWrap, {
    position: "absolute",
    left: "0",
    right: "0",
    bottom: "0",
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

  function applyLang() {
    const l = i18n && typeof i18n.getLang === "function" ? i18n.getLang() : "en";
    if (l === lang) return;
    lang = l;
    wLabelCache.clear();
    waveLbl.textContent = tr("wave");
    scoreLbl.textContent = tr("score");
    hpLbl.textContent = tr("health");
    reloadNote.textContent = tr("hudReloading");
    if (prevWeapon) wName.textContent = weaponLabel(prevWeapon);
    // EXPANSION labels.
    moneyLbl.textContent = tr("hudMoney");
    hintAction.textContent = tr("hudShopHint");
    if (bossTypeShown) bossName.textContent = bossLabel(bossTypeShown);
  }
  applyLang();

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
    const label = key ? tr(key) : String(d.type || "Zombie");
    const line = make("div", "feed-line" + (d.headshot ? " hs" : ""), null);
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
  function showToast(text) {
    toastToken++;
    const my = toastToken;
    toast.textContent = text;
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

  // --- bus -----------------------------------------------------------------------
  bus.addEventListener("spread", (e) => {
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
    if (st === "gameover" || st === "menu") {
      hideBossBar();
      hideToast();
      hideHint();
      intermission = false;
    }
  });

  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail && e.detail.patch ? e.detail.patch : null;
    if (patch && patch.lang) applyLang();
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

    // Crosshair: ease toward base + weapon spread, plus decaying shot kick.
    kick *= Math.exp(-dt * 9);
    const spread =
      weapons && Number.isFinite(weapons.spread) ? Number(weapons.spread) : 0;
    const target = clamp(
      BASE_GAP + clamp(spread, 0, 0.2) * GAP_PER_RAD + kick,
      BASE_GAP,
      MAX_GAP
    );
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
      wName.textContent = weaponLabel(wname);
      prevWeapon = wname;
    }

    const reloading = !!weapons.reloading;
    if (reloading !== prevReloading) {
      ammoWrap.classList.toggle("reloading", reloading);
      prevReloading = reloading;
    }

    // Top-center wave + score.
    if (gamestate) {
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
      intermission = false;
    }
  }

  return { update, show, flashDamage };
}
