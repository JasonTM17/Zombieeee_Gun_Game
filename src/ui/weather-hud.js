/**
 * Weather HUD — the small top-left chip under the bloodmoon slot.
 *
 * createWeatherHud(uiRoot, bus, i18n) → { update(dt) }
 *
 * - One compact chip at top: 52px / left: 18px (the P2 bloodmoon countdown
 *   owns 18px): inline glyph icon + EN/VI label (CLEAR / RAIN / STORM / FOG) +
 *   the live intensity percent while rain/storm/fog. FOG additionally shows
 *   its LOW VIS tag; CLEAR stays visible but dimmed (opacity 0.55).
 * - Event-driven: listens "weather-changed" {mode, intensity} and
 *   "weather-effects" {mode, intensity, zombieSpeedMul}; the latter supplies
 *   the finer 1% HUD percent while the former announces mode edges. No
 *   per-frame DOM writes — update(dt) is a compatibility no-op.
 * - Visibility follows the game state through "state-changed": visible in
 *   playing/paused, hidden in menu/gameover/intro (starts hidden so boot never
 *   flashes a weather chip over the menu).
 * - Language switches re-render from i18n on "settings-changed" {patch.lang};
 *   EN + VI keys are registered here (module-local, merged by i18n).
 * - The chip is a sibling of the HUD root inside #ui and is never
 *   interactive (#ui keeps pointer-events: none).
 *
 * @param {HTMLElement} uiRoot - the #ui element.
 * @param {EventTarget} bus
 * @param {{t: Function, registerBundle: Function, getLang?: Function}} i18n
 *   the i18n module namespace (src/core/i18n.js).
 * @returns {{update: (dt?: number) => void}}
 */

const WEATHER_BUNDLE = {
  en: {
    weatherClear: "CLEAR",
    weatherRain: "RAIN",
    weatherStorm: "STORM",
    weatherFog: "FOG",
    weatherLowVis: "LOW VIS",
  },
  vi: {
    weatherClear: "TRỜI QUANG",
    weatherRain: "MƯA",
    weatherStorm: "BÃO",
    weatherFog: "SƯƠNG MÙ",
    weatherLowVis: "TẦM NHÌN THẤP",
  },
};

// Mode presentation: a lone glyph (no image assets) + the i18n label key.
const MODES = {
  clear: { icon: "☀", color: "#9fb8d0", key: "weatherClear" },
  rain: { icon: "☂", color: "#7fb8ff", key: "weatherRain" },
  storm: { icon: "⚡", color: "#ffd35e", key: "weatherStorm" },
  fog: { icon: "≋", color: "#b9c6d8", key: "weatherFog" },
};

/** Tiny DOM builder (module-local, same pattern as hud.js/throwables-hud.js). */
function make(tag, parent) {
  const node = document.createElement(tag);
  if (parent) parent.appendChild(node);
  return node;
}

/** Inline-style a node — new widgets carry their own styles. */
function css(node, styles) {
  for (const k in styles) node.style[k] = styles[k];
  return node;
}

export function createWeatherHud(uiRoot, bus, i18n) {
  if (!uiRoot || typeof uiRoot.appendChild !== "function") {
    throw new Error("createWeatherHud: container (#ui) is required");
  }
  if (typeof document === "undefined") {
    // Headless boot (tests/tools): nothing to draw.
    return { update() {} };
  }

  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(WEATHER_BUNDLE);
  }
  const tr = (key) => {
    if (i18n && typeof i18n.t === "function") {
      const value = i18n.t(key);
      if (typeof value === "string" && value !== key) return value;
    }
    return WEATHER_BUNDLE.en[key] || key;
  };

  // --- DOM -------------------------------------------------------------------
  const root = make("div", uiRoot);
  root.className = "weather-chip";
  css(root, {
    position: "absolute",
    top: "52px", // under the bloodmoon countdown chip (top 18px, ~26px tall)
    left: "18px",
    display: "none",
    alignItems: "center",
    gap: "7px",
    padding: "4px 10px",
    background: "rgba(6, 10, 16, 0.72)",
    border: "1px solid var(--gg-line)",
    borderLeft: "3px solid #9fb8d0",
    borderRadius: "6px",
    color: "var(--gg-text)",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.85)",
    pointerEvents: "none",
    zIndex: "5",
    transition: "opacity 0.2s ease-out, border-color 0.2s ease-out",
    opacity: "0.55", // CLEAR default: visible but dimmed
  });
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");

  const iconEl = make("span", root);
  css(iconEl, {
    flex: "0 0 auto",
    fontSize: "13px",
    lineHeight: "13px",
    color: "#9fb8d0",
  });
  iconEl.setAttribute("aria-hidden", "true");

  const labelEl = make("span", root);
  css(labelEl, {
    flex: "0 0 auto",
    lineHeight: "13px",
    color: "var(--gg-text)",
  });

  const lowVisEl = make("span", root);
  css(lowVisEl, {
    display: "none",
    flex: "0 0 auto",
    fontSize: "9px",
    lineHeight: "13px",
    letterSpacing: "0.1em",
    color: "#b9c6d8",
    opacity: "0.8",
  });

  const pctEl = make("span", root);
  css(pctEl, {
    display: "none",
    flex: "0 0 auto",
    minWidth: "30px",
    textAlign: "right",
    fontSize: "11px",
    lineHeight: "13px",
    fontWeight: "800",
    color: "var(--gg-gold)",
    fontVariantNumeric: "tabular-nums",
  });

  // --- cached state ----------------------------------------------------------
  let mode = "clear";
  let intensity = 0;
  let visible = false;
  let shownMode = ""; // last mode painted
  let shownPct = -1; // last percent painted (-1 = hidden)
  let shownLowVis = false;
  let shownLang = ""; // last language painted (forces a label refresh)

  function lang() {
    return i18n && typeof i18n.getLang === "function" ? i18n.getLang() : "";
  }

  /** Repaint from the cache; every write is gated on a value change. */
  function render(force) {
    const def = MODES[mode] || MODES.clear;
    const low = mode === "fog";
    const pct = mode === "clear" ? -1 : Math.round(intensity * 100);
    const language = lang();
    const label = tr(def.key);

    if (
      force ||
      mode !== shownMode ||
      low !== shownLowVis ||
      language !== shownLang
    ) {
      shownMode = mode;
      shownLowVis = low;
      shownLang = language;
      iconEl.textContent = def.icon;
      iconEl.style.color = def.color;
      labelEl.textContent = label;
      lowVisEl.textContent = low ? "· " + tr("weatherLowVis") : "";
      lowVisEl.style.display = low ? "inline" : "none";
      root.style.borderLeftColor = def.color;
      root.style.opacity = mode === "clear" ? "0.55" : "1";
      root.setAttribute("data-mode", mode);
    }

    if (pct !== shownPct) {
      shownPct = pct;
      pctEl.textContent = pct >= 0 ? pct + "%" : "";
      pctEl.style.display = pct >= 0 ? "inline" : "none";
    }

    root.setAttribute(
      "aria-label",
      label + (low ? " — " + tr("weatherLowVis") : "") + (pct >= 0 ? " " + pct + "%" : "")
    );
  }

  function setVisible(on) {
    if (visible === on) return;
    visible = on;
    root.style.display = on ? "flex" : "none";
    if (on) render(true); // catch up with anything that changed while hidden
  }

  /** Accept "weather-changed" / "weather-effects" payloads (both nullable). */
  function apply(detail) {
    if (!detail || typeof detail !== "object") return;
    if (typeof detail.mode === "string" && MODES[detail.mode]) mode = detail.mode;
    const value = Number(detail.intensity);
    if (Number.isFinite(value)) intensity = Math.max(0, Math.min(1, value));
    if (visible) render(false);
  }

  render(true); // initial CLEAR chip (still hidden)

  if (bus && typeof bus.addEventListener === "function") {
    bus.addEventListener("weather-changed", (e) => {
      apply(e && e.detail ? e.detail : null);
    });
    bus.addEventListener("weather-effects", (e) => {
      apply(e && e.detail ? e.detail : null);
    });
    bus.addEventListener("settings-changed", () => {
      if (visible) render(true); // language switch
    });
    bus.addEventListener("state-changed", (e) => {
      const st = e && e.detail ? e.detail.state : null;
      setVisible(st === "playing" || st === "paused");
    });
  }

  return {
    /** Event-driven widget — update() exists so the main loop can call it
     * unconditionally. It deliberately does no work (zero per-frame writes). */
    update() {},
  };
}
