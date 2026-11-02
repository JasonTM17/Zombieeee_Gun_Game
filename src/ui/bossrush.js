/**
 * ============================================================================
 * BOSS RUSH UI — top banner + victory / defeat overlay.
 * ============================================================================
 *
 * createBossRushUI(uiRoot, bus, bossrush, i18n)
 *   → { update(dt), isOpen(), hide() }
 *
 * - Top-center thin banner (top: 98px, BELOW the HUD wave/score chips at 18px
 *   and the boss bar at 64px): "BOSS RUSH 1/5 — THE BUTCHER" + elapsed mm:ss +
 *   five progress pips filled for every defeated boss. Pointer-events none, so
 *   it never steals a click or the crosshair.
 * - Victory / defeat overlay: full-screen dim panel above every menu layer
 *   (z-index 60; style.css screens carry no z-index). Title "BOSS RUSH
 *   CLEARED" / "BOSS RUSH FAILED", TIME / BOSSES / SCORE rows, RETRY and MENU.
 *   RETRY dispatches "ui-bossrush"; MENU dispatches "ui-quit". The overlay is
 *   modal (pointer-events auto) and closes ONLY through those buttons — no
 *   backdrop click, no Escape handler.
 * - hide() closes the overlay + banner and emits "bossrush-closed" when the
 *   overlay was open, so the lead's gamestate.removePause("bossrush") runs.
 *   Both buttons emit their ui-* event FIRST, then hide() (same safe order as
 *   ending.js: the synchronous dispatch keeps pointer-lock user activation and
 *   a fresh run has already cleared its pause reasons when "bossrush-closed"
 *   lands).
 * - The overlay is opened by "bossrush-over"; update() also rebuilds it from
 *   bossrush.state() if the event was ever missed. The system emits
 *   "bossrush-open" for the pause itself — this module never touches
 *   gamestate.
 * - All strings live in an OWN EN/VI bundle (bossrush_*). A live language
 *   switch via "settings-changed" {patch.lang} re-renders in place.
 *
 * Bus consumed: "bossrush-over", "settings-changed".
 * Bus emitted: "ui-bossrush", "ui-quit", "bossrush-closed".
 *
 * @param {HTMLElement} uiRoot - the #ui element.
 * @param {EventTarget} bus
 * @param {import("../systems/bossrush.js").BossRush} bossrush
 * @param {{t: Function, registerBundle: Function}} i18n
 * @returns {BossRushUI}
 */

/**
 * @typedef {Object} BossRushUI
 * @property {(dt: number) => void} update - banner refresh / event fallback.
 * @property {() => boolean} isOpen - true while the result overlay is visible.
 * @property {() => void} hide - close overlay + banner, emit "bossrush-closed".
 */

export const BOSS_RUSH_BUNDLE = {
  en: {
    bossrush_kicker: "BOSS RUSH",
    bossrush_banner: "BOSS RUSH {index}/{total} — {name}",
    bossrush_cleared: "BOSS RUSH CLEARED",
    bossrush_failed: "BOSS RUSH FAILED",
    bossrush_time: "TIME",
    bossrush_bosses: "BOSSES",
    bossrush_score: "SCORE",
    bossrush_retry: "RETRY",
    bossrush_menu: "MENU",
    bossrush_boss_butcher: "THE BUTCHER",
    bossrush_boss_spitter: "THE SPITTER",
    bossrush_boss_screamer: "THE SCREAMER",
    bossrush_boss_golem: "THE GOLEM",
    bossrush_boss_origin: "THE ORIGIN",
  },
  vi: {
    bossrush_kicker: "BOSS RUSH",
    bossrush_banner: "BOSS RUSH {index}/{total} — {name}",
    bossrush_cleared: "BOSS RUSH HOÀN THÀNH",
    bossrush_failed: "BOSS RUSH THẤT BẠI",
    bossrush_time: "THỜI GIAN",
    bossrush_bosses: "BOSS",
    bossrush_score: "ĐIỂM",
    bossrush_retry: "CHƠI LẠI",
    bossrush_menu: "MENU",
    bossrush_boss_butcher: "ĐỒ TỂ",
    bossrush_boss_spitter: "KẺ PHUN ĐỘC",
    bossrush_boss_screamer: "KẺ GÀO THÉT",
    bossrush_boss_golem: "GOLEM ĐÁ",
    bossrush_boss_origin: "NGUỒN GỐC",
  },
};

const BOSS_RUSH_CSS = `
.gg-bossrush-banner {
  position: absolute;
  top: 98px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9;
  display: none;
  align-items: center;
  gap: 12px;
  padding: 5px 13px;
  white-space: nowrap;
  pointer-events: none;
  background: rgba(6, 10, 16, 0.78);
  border: 1px solid rgba(255, 77, 77, 0.45);
  border-left: 3px solid var(--gg-danger, #ff4d4d);
  border-radius: 6px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55);
  color: #ffd9d0;
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
  line-height: 1.2;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}
.gg-bossrush-banner.on { display: flex; }
.gg-bossrush-banner-label { color: #ffe7c2; }
.gg-bossrush-banner-time { color: #ff9d92; }
.gg-bossrush-pips { display: flex; align-items: center; gap: 4px; }
.gg-bossrush-pip {
  width: 16px;
  height: 5px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.13);
}
.gg-bossrush-pip.filled {
  border-color: #ff6b5e;
  background: linear-gradient(90deg, #b31212, #ff4d3d);
  box-shadow: 0 0 6px rgba(255, 77, 77, 0.5);
}
.gg-bossrush-pip.current {
  border-color: rgba(255, 211, 94, 0.8);
  box-shadow: 0 0 5px rgba(255, 211, 94, 0.35);
}
.gg-bossrush-overlay {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  pointer-events: auto;
  background: radial-gradient(
    ellipse at center,
    rgba(10, 6, 8, 0.9) 0%,
    rgba(2, 3, 6, 0.98) 100%
  );
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  font-family: "Segoe UI", system-ui, sans-serif;
}
.gg-bossrush-overlay.hidden { display: none; }
.gg-bossrush-panel {
  width: min(460px, calc(100vw - 40px));
  padding: 30px 32px 24px;
  text-align: center;
  background: var(--gg-panel, rgba(9, 13, 21, 0.94));
  border: 1px solid var(--gg-line, #24334d);
  border-top: 3px solid var(--gg-danger, #ff4d4d);
  border-radius: 12px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.66),
    inset 0 0 0 1px rgba(255, 198, 120, 0.04);
}
.gg-bossrush-panel.win { border-top-color: var(--gg-gold, #ffd35e); }
.gg-bossrush-kicker {
  margin-bottom: 8px;
  font-size: 10px;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-bossrush-title {
  margin: 0 0 18px;
  font-size: clamp(24px, 4vw, 32px);
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #ffb3aa;
  text-shadow: 0 0 22px rgba(255, 77, 77, 0.28);
}
.gg-bossrush-panel.win .gg-bossrush-title {
  color: #ffe7a8;
  text-shadow: 0 0 24px rgba(255, 211, 94, 0.3);
}
.gg-bossrush-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 22px;
  padding: 12px 0;
  border-top: 1px solid rgba(127, 178, 255, 0.12);
  border-bottom: 1px solid rgba(127, 178, 255, 0.12);
}
.gg-bossrush-stat {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.gg-bossrush-stat .lbl { color: var(--gg-text-dim, #8fa1b8); }
.gg-bossrush-stat .val {
  color: var(--gg-text, #dbe6f5);
  font-size: 16px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.gg-bossrush-stat.score .val { color: var(--gg-gold, #ffd35e); }
.gg-bossrush-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
}
.gg-bossrush-btn {
  appearance: none;
  min-width: 120px;
  padding: 10px 16px;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--gg-text, #dbe6f5);
  background: #101a2b;
  border: 1px solid #2b3d5c;
  border-radius: 7px;
  cursor: pointer;
}
.gg-bossrush-btn:hover { border-color: var(--gg-gold, #ffd35e); }
.gg-bossrush-btn.primary {
  color: #fff;
  background: linear-gradient(180deg, #9a6a2c, #6f4718);
  border-color: #c8944a;
}
.gg-bossrush-btn.primary:hover {
  background: linear-gradient(180deg, #b98033, #83561d);
}
`;

function make(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

function fmtInt(n) {
  return String(Math.max(0, Math.round(Number(n) || 0)));
}

/** Seconds → "mm:ss". */
function fmtClock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
}

export function createBossRushUI(uiRoot, bus, bossrush, i18n) {
  if (!uiRoot || typeof uiRoot.appendChild !== "function") {
    throw new Error("createBossRushUI: container (#ui) is required");
  }
  if (!bus || typeof bus.dispatchEvent !== "function") {
    throw new Error("createBossRushUI: bus is required");
  }
  if (!bossrush || typeof bossrush.state !== "function") {
    throw new Error("createBossRushUI: bossrush is required");
  }
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(BOSS_RUSH_BUNDLE);
  }

  const tr = (key, params) =>
    i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;

  if (
    typeof document !== "undefined" &&
    !document.getElementById("gg-bossrush-style")
  ) {
    const style = document.createElement("style");
    style.id = "gg-bossrush-style";
    style.textContent = BOSS_RUSH_CSS;
    if (document.head && typeof document.head.appendChild === "function") {
      document.head.appendChild(style);
    }
  }

  const initial = bossrush.state ? bossrush.state() : null;
  const TOTAL = Math.max(1, Math.round(Number(initial && initial.total) || 5));

  // --- banner -----------------------------------------------------------------
  const banner = make("div", "gg-bossrush-banner", uiRoot);
  if (typeof banner.setAttribute === "function") {
    banner.setAttribute("aria-live", "polite");
  }
  const bannerLabel = make("span", "gg-bossrush-banner-label", banner);
  const pipsWrap = make("span", "gg-bossrush-pips", banner);
  const pips = [];
  for (let i = 0; i < TOTAL; i++) {
    pips.push(make("span", "gg-bossrush-pip", pipsWrap));
  }
  const bannerTime = make("span", "gg-bossrush-banner-time", banner);

  // --- result overlay ---------------------------------------------------------
  const overlay = make("div", "gg-bossrush-overlay hidden", uiRoot);
  if (typeof overlay.setAttribute === "function") {
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
  }
  const panel = make("div", "gg-bossrush-panel", overlay);
  const kicker = make("div", "gg-bossrush-kicker", panel);
  const title = make("h2", "gg-bossrush-title", panel);
  title.id = "gg-bossrush-title";
  if (typeof overlay.setAttribute === "function") {
    overlay.setAttribute("aria-labelledby", title.id);
  }

  const statsBox = make("div", "gg-bossrush-stats", panel);
  const timeRow = make("div", "gg-bossrush-stat", statsBox);
  const timeLbl = make("span", "lbl", timeRow);
  const timeVal = make("span", "val", timeRow);
  const bossesRow = make("div", "gg-bossrush-stat", statsBox);
  const bossesLbl = make("span", "lbl", bossesRow);
  const bossesVal = make("span", "val", bossesRow);
  const scoreRow = make("div", "gg-bossrush-stat score", statsBox);
  const scoreLbl = make("span", "lbl", scoreRow);
  const scoreVal = make("span", "val", scoreRow);

  const actions = make("div", "gg-bossrush-actions", panel);
  const retryBtn = make("button", "gg-bossrush-btn primary", actions);
  retryBtn.type = "button";
  const menuBtn = make("button", "gg-bossrush-btn", actions);
  menuBtn.type = "button";

  // --- state ------------------------------------------------------------------
  let overlayOpen = false;
  let bannerOn = false;
  let lastLabel = "";
  let lastTime = "";
  let lastFilled = -1;
  let lastCurrent = -1;
  /** @type {{win: boolean, time: number, bossesDown: number, score: number}|null} */
  let result = null;

  function hideBanner() {
    if (!bannerOn) return;
    bannerOn = false;
    banner.classList.remove("on");
  }

  function updatePips(bossesDown, current) {
    const filled = Math.min(TOTAL, Math.max(0, Math.round(bossesDown)));
    const cur = Math.min(TOTAL - 1, Math.max(0, Math.round(current) - 1));
    if (filled === lastFilled && cur === lastCurrent) return;
    lastFilled = filled;
    lastCurrent = cur;
    for (let i = 0; i < pips.length; i++) {
      pips[i].classList.toggle("filled", i < filled);
      pips[i].classList.toggle("current", i === cur && i >= filled);
    }
  }

  /** Localized boss name; falls back to the raw id if the key is unknown. */
  function bossName(type) {
    const key = "bossrush_boss_" + String(type || "");
    const value = tr(key);
    if (!value || value === key) {
      return String(type || "").replace(/^./, (c) => c.toUpperCase());
    }
    return value;
  }

  function showBanner(st) {
    if (!bannerOn) {
      bannerOn = true;
      banner.classList.add("on");
    }
    const label = tr("bossrush_banner", {
      index: st.index,
      total: st.total,
      name: bossName(st.type),
    });
    if (label !== lastLabel) {
      lastLabel = label;
      bannerLabel.textContent = label;
    }
    const clock = fmtClock(st.time);
    if (clock !== lastTime) {
      lastTime = clock;
      bannerTime.textContent = clock;
    }
    updatePips(st.bossesDown, st.index);
  }

  function normalizeResult(source) {
    const s = source || {};
    return {
      win: s.win === true,
      time: Number.isFinite(Number(s.time)) ? Number(s.time) : 0,
      bossesDown: Math.max(0, Math.round(Number(s.bossesDown) || 0)),
      score: Math.max(0, Math.round(Number(s.score) || 0)),
    };
  }

  function renderResult() {
    if (!result) return;
    const won = result.win;
    panel.classList.toggle("win", won);
    panel.classList.toggle("lose", !won);
    title.textContent = tr(won ? "bossrush_cleared" : "bossrush_failed");
    timeVal.textContent = fmtClock(result.time);
    bossesVal.textContent = fmtInt(result.bossesDown) + "/" + TOTAL;
    scoreVal.textContent = fmtInt(result.score);
  }

  function openOverlay() {
    if (!result) return;
    hideBanner();
    overlayOpen = true;
    overlay.classList.remove("hidden");
    renderResult();
    if (typeof retryBtn.focus === "function") {
      try {
        retryBtn.focus({ preventScroll: true });
      } catch {
        retryBtn.focus();
      }
    }
  }

  function hide() {
    const wasOpen = overlayOpen;
    overlayOpen = false;
    overlay.classList.add("hidden");
    hideBanner();
    result = null;
    const active = typeof document !== "undefined" ? document.activeElement : null;
    if (active && typeof active.blur === "function" && overlay.contains(active)) {
      active.blur();
    }
    if (wasOpen) {
      bus.dispatchEvent(new CustomEvent("bossrush-closed"));
    }
  }

  function applyTexts() {
    kicker.textContent = tr("bossrush_kicker");
    retryBtn.textContent = tr("bossrush_retry");
    menuBtn.textContent = tr("bossrush_menu");
    timeLbl.textContent = tr("bossrush_time");
    bossesLbl.textContent = tr("bossrush_bosses");
    scoreLbl.textContent = tr("bossrush_score");
    lastLabel = "";
    lastTime = "";
    if (result) renderResult();
  }

  // --- buttons ----------------------------------------------------------------
  // Emit FIRST, hide second (ending.js order): the UI event stays inside the
  // click's user activation, and a fresh run has already cleared pauses by the
  // time "bossrush-closed" is dispatched.
  retryBtn.addEventListener("click", () => {
    if (!overlayOpen) return;
    bus.dispatchEvent(new CustomEvent("ui-bossrush"));
    hide();
  });
  menuBtn.addEventListener("click", () => {
    if (!overlayOpen) return;
    bus.dispatchEvent(new CustomEvent("ui-quit"));
    hide();
  });

  // --- bus --------------------------------------------------------------------
  bus.addEventListener("bossrush-over", (e) => {
    const detail = e && e.detail ? e.detail : {};
    result = normalizeResult(detail);
    openOverlay();
  });

  // Menus / pause / gameover: the banner must never float over another screen.
  // The result overlay is kept for its own "paused" (victory) and "gameover"
  // (defeat) states; a return to menu/intro closes it too.
  bus.addEventListener("state-changed", (e) => {
    const st = e && e.detail ? e.detail.state : null;
    if (!st) return;
    if (st !== "playing") hideBanner();
    if ((st === "menu" || st === "intro") && overlayOpen) hide();
  });

  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail ? e.detail.patch : null;
    if (patch && Object.prototype.hasOwnProperty.call(patch, "lang")) {
      applyTexts();
    }
  });

  // --- per-frame --------------------------------------------------------------
  function update(dt) {
    void dt; // the system owns elapsed time; this module only renders it
    const st = bossrush.state();
    if (!st) {
      if (overlayOpen) hide();
      hideBanner();
      return;
    }
    if (st.over) {
      if (!overlayOpen) {
        result = normalizeResult(st);
        openOverlay();
      }
      hideBanner();
      return;
    }
    if (!st.active) {
      if (overlayOpen) hide();
      hideBanner();
      return;
    }
    if (overlayOpen) hide(); // a new run started underneath a stale result
    showBanner(st);
  }

  function isOpen() {
    return overlayOpen;
  }

  applyTexts();
  updatePips(0, 1);

  return { update, isOpen, hide };
}
