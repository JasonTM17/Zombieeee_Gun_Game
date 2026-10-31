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
 *   "zombie-killed" on the bus.
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
 * update(player, weapons, gamestate) — called by the main loop EVERY FRAME
 * while playing:
 *   @param player    - the Player object (read hp, alive, position).
 *   @param weapons   - the object returned by weapons.getState()
 *                      ({name, mag, magSize, reserve, reloading, spread}).
 *   @param gamestate - the Gamestate object (read score, wave, kills).
 *
 * show(bool): show/hide the whole HUD (main.js: true while playing/paused,
 * false in menu/gameover).
 *
 * flashDamage(intensity): strong red screen flash, intensity 0..1 — called
 * internally from update()'s hp-drop detection; exposed so main.js/debug can
 * trigger it directly.
 *
 * Bus events consumed: "zombie-killed", "spread", "hit", "wave-start", "wave-clear",
 * plus "settings-changed" {patch} ONLY to re-translate static labels when the
 * language is switched live (the event is defined in the gamestate event table).
 * Bus-driven sounds: audio.waveBanner() on "wave-start".
 *
 * Implementation notes:
 * - No object allocation in the per-frame path: DOM writes are gated on value
 *   change, crosshair gap is one CSS custom property, decay uses a measured
 *   dt (update() has no dt parameter).
 * - Extra i18n keys registered here (merged, EN + VI): hudReloading,
 *   hudHeadshot, killWalker, killRunner, killBrute, wPistol, wShotgun, wRifle.
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
 *             gamestate: import("../systems/gamestate.js").Gamestate) => void} update
 * @property {(visible: boolean) => void} show
 * @property {(intensity: number) => void} flashDamage - strong red flash, 0..1.
 */

// Crosshair geometry (px): gap = BASE + spread(rad) * PER_RAD + shot kick.
const BASE_GAP = 8;
const GAP_PER_RAD = 620;
const KICK_PER_RAD = 900;
const MAX_GAP = 54;

const KNOWN_WEAPONS = { pistol: "wPistol", shotgun: "wShotgun", rifle: "wRifle" };
const KNOWN_TYPES = { walker: "killWalker", runner: "killRunner", brute: "killBrute" };

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

/** Restart a one-shot CSS animation by toggling a class with a reflow. */
function pulse(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

function fmtInt(n) {
  return String(Math.max(0, Math.round(Number(n) || 0)));
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
    addFeedLine(e && e.detail ? e.detail : {});
  });

  bus.addEventListener("wave-start", (e) => {
    const d = e && e.detail ? e.detail : {};
    banner.classList.remove("clear");
    banner.textContent = tr("waveBanner", { n: Math.round(Number(d.n) || 0) });
    pulse(banner, "show");
    if (audio && typeof audio.waveBanner === "function") audio.waveBanner();
  });

  bus.addEventListener("wave-clear", (e) => {
    const d = e && e.detail ? e.detail : {};
    banner.classList.add("clear");
    banner.textContent = tr("waveClear", { n: Math.round(Number(d.n) || 0) });
    pulse(banner, "show");
  });

  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail && e.detail.patch ? e.detail.patch : null;
    if (patch && patch.lang) applyLang();
  });

  // --- per-frame update ------------------------------------------------------------
  function update(player, weapons, gamestate) {
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
    }
  }

  return { update, show, flashDamage };
}
