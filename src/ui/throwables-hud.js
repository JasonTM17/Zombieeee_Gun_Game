/**
 * Throwables HUD — compact bottom-right inventory chip for the merchant
 * throwables (frag grenade / molotov / proximity mine).
 *
 * createThrowablesHud(uiRoot, bus) → { update() }
 *
 * Behaviour (spec):
 * - One compact chip ABOVE the ammo readout (bottom-right), never overlapping
 *   it: selected item's CSS-drawn glyph, its EN/VI name, the remaining count,
 *   and the key hints "F THROW · V SWITCH". The chip is a sibling of the HUD
 *   root inside #ui, so it can exist before createHud(); visibility follows
 *   the game state itself, not the HUD module.
 * - Event-driven only: listens "throwables-state" (every inventory change from
 *   systems/throwables.js) and "settings-changed" (language switch). There is
 *   no per-frame work — update() is a compatibility no-op.
 * - Follows HUD visibility through "state-changed": visible while
 *   playing/paused, hidden in menu/gameover/intro. It starts hidden so the
 *   menu never flashes an inventory chip during boot.
 * - All text is registered here via i18n.registerBundle (EN + VI). The F/V
 *   key caps are literal key labels; the action words beside them are i18n.
 * - The chip is pointer-events:none (#ui stays non-interactive) and carries a
 *   responsive bottom offset: on narrow windows style.css lifts the weapon
 *   bar to bottom:96px and the chip rides above it through the same
 *   --gg-weapon-bar-bottom variable.
 *
 * @param {HTMLElement} uiRoot - the #ui element.
 * @param {EventTarget} bus
 * @returns {{update: () => void}}
 */

import * as i18n from "../core/i18n.js";

const KINDS = ["frag", "molotov", "mine"];

// Frozen starting inventory — mirrors systems/throwables.js. Used only until
// the first "throwables-state" event arrives (the throwables factory does not
// emit on construction; both factories are created during boot).
const DEFAULT_STATE = {
  selected: "frag",
  counts: { frag: 2, molotov: 1, mine: 0 },
};

const KIND_COLORS = {
  frag: "#9fd16a",
  molotov: "#ff9a3c",
  mine: "#ff5a4d",
};

const THROWABLES_BUNDLE = {
  en: {
    throwable_frag: "Frag Grenade",
    throwable_molotov: "Molotov",
    throwable_mine: "Proximity Mine",
    throwable_throw: "THROW",
    throwable_switch: "SWITCH",
  },
  vi: {
    throwable_frag: "Lựu Đạn Mảnh",
    throwable_molotov: "Bom Xăng",
    throwable_mine: "Mìn Cận Chiến",
    throwable_throw: "NÉM",
    throwable_switch: "ĐỔI",
  },
};

/** Tiny DOM builder (module-local, same pattern as hud.js). */
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

/** Small key cap used in the F/V hint row. */
function keyCap(text, parent) {
  const node = make("span", parent);
  css(node, {
    display: "inline-block",
    padding: "1px 5px",
    background: "#0b1322",
    border: "1px solid #33465f",
    borderBottom: "2px solid #33465f",
    borderRadius: "3px",
    fontFamily: "ui-monospace, Consolas, monospace",
    fontSize: "9px",
    lineHeight: "10px",
    color: "#cfe0ff",
  });
  node.textContent = text;
  return node;
}

/** Build one 18 × 18 CSS-drawn item glyph (no image assets). */
function makeIcon(kind) {
  const wrap = make("span", null);
  css(wrap, {
    position: "relative",
    flex: "0 0 18px",
    width: "18px",
    height: "18px",
    display: "none",
  });
  wrap.setAttribute("aria-hidden", "true");

  if (kind === "frag") {
    const body = make("span", wrap);
    css(body, {
      position: "absolute",
      left: "2px",
      top: "3px",
      width: "14px",
      height: "13px",
      borderRadius: "6px",
      background: "radial-gradient(circle at 35% 30%, #6f8f45, #26331b 72%)",
      border: "1px solid #b8e08a",
      boxSizing: "border-box",
    });
    const cap = make("span", wrap);
    css(cap, {
      position: "absolute",
      left: "6px",
      top: "0",
      width: "6px",
      height: "3px",
      borderRadius: "1px",
      background: "#8a9a6a",
    });
    const band = make("span", wrap);
    css(band, {
      position: "absolute",
      left: "2px",
      top: "8px",
      width: "14px",
      height: "1px",
      background: "rgba(10, 16, 8, 0.7)",
    });
  } else if (kind === "molotov") {
    const body = make("span", wrap);
    css(body, {
      position: "absolute",
      left: "5px",
      top: "5px",
      width: "8px",
      height: "11px",
      borderRadius: "2px 2px 3px 3px",
      background: "linear-gradient(180deg, #4c7a5a, #2c4434)",
      border: "1px solid #ff9a5c",
      boxSizing: "border-box",
    });
    const neck = make("span", wrap);
    css(neck, {
      position: "absolute",
      left: "7px",
      top: "1px",
      width: "4px",
      height: "5px",
      background: "#4c7a5a",
      border: "1px solid #ff9a5c",
      boxSizing: "border-box",
    });
    const rag = make("span", wrap);
    css(rag, {
      position: "absolute",
      left: "6px",
      top: "0",
      width: "6px",
      height: "3px",
      borderRadius: "1px",
      background: "#ff8a3c",
      boxShadow: "0 0 4px rgba(255, 138, 60, 0.9)",
    });
  } else {
    const disc = make("span", wrap);
    css(disc, {
      position: "absolute",
      left: "1px",
      top: "5px",
      width: "16px",
      height: "8px",
      borderRadius: "50%",
      background: "linear-gradient(180deg, #3a4048, #1b1f24)",
      border: "1px solid #5a5f68",
      boxSizing: "border-box",
    });
    const dot = make("span", wrap);
    css(dot, {
      position: "absolute",
      left: "7px",
      top: "7px",
      width: "4px",
      height: "4px",
      borderRadius: "50%",
      background: "#ff3a2a",
      boxShadow: "0 0 4px rgba(255, 58, 42, 0.95)",
    });
  }
  return wrap;
}

export function createThrowablesHud(uiRoot, bus) {
  if (!uiRoot || typeof uiRoot.appendChild !== "function") {
    throw new Error("createThrowablesHud: container (#ui) is required");
  }
  if (typeof document === "undefined") {
    // Headless boot (tests/tools): nothing to draw, keep the bus silent.
    return { update() {} };
  }

  i18n.registerBundle(THROWABLES_BUNDLE);
  const tr = (key, params) => i18n.t(key, params);

  // --- DOM -------------------------------------------------------------------
  const root = make("div", uiRoot);
  css(root, {
    position: "absolute",
    right: "22px",
    // Above the ammo readout (bottom:22px, ~71px tall). The extra var rides
    // over style.css's narrow-window weapon-bar lift, so neither the ammo
    // block nor the weapon strip is ever covered.
    bottom: "calc(112px + var(--gg-weapon-bar-bottom, 0px))",
    display: "none",
    flexDirection: "column",
    gap: "4px",
    minWidth: "150px",
    padding: "6px 10px 6px 12px",
    background: "rgba(6, 10, 16, 0.72)",
    border: "1px solid var(--gg-line)",
    borderLeft: "3px solid " + KIND_COLORS.frag,
    borderRadius: "6px",
    color: "var(--gg-text)",
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.85)",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    zIndex: "5",
  });
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");

  const head = make("div", root);
  css(head, {
    display: "flex",
    alignItems: "center",
    gap: "7px",
  });

  const iconWrap = make("span", head);
  css(iconWrap, {
    position: "relative",
    flex: "0 0 18px",
    width: "18px",
    height: "18px",
  });
  const icons = {
    frag: makeIcon("frag"),
    molotov: makeIcon("molotov"),
    mine: makeIcon("mine"),
  };
  for (let i = 0; i < KINDS.length; i++) {
    iconWrap.appendChild(icons[KINDS[i]]);
  }

  const nameEl = make("span", head);
  css(nameEl, {
    flex: "1 1 auto",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--gg-text)",
  });

  const countEl = make("span", head);
  css(countEl, {
    flex: "0 0 auto",
    fontSize: "13px",
    fontWeight: "800",
    color: "var(--gg-gold)",
    fontVariantNumeric: "tabular-nums",
  });

  const hintRow = make("div", root);
  css(hintRow, {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "9px",
    lineHeight: "10px",
    letterSpacing: "0.08em",
    color: "var(--gg-text-dim)",
  });
  keyCap("F", hintRow);
  const throwLbl = make("span", hintRow);
  const sep = make("span", hintRow);
  sep.textContent = "·";
  keyCap("V", hintRow);
  const switchLbl = make("span", hintRow);

  // --- cached state ----------------------------------------------------------
  let selected = DEFAULT_STATE.selected;
  const counts = {
    frag: DEFAULT_STATE.counts.frag,
    molotov: DEFAULT_STATE.counts.molotov,
    mine: DEFAULT_STATE.counts.mine,
  };
  let visible = false;

  function setVisible(on) {
    if (visible === on) return;
    visible = on;
    root.style.display = on ? "flex" : "none";
  }

  function render() {
    const kind = KINDS.indexOf(selected) === -1 ? "frag" : selected;
    const n = Math.max(0, Math.round(Number(counts[kind]) || 0));
    const name = tr("throwable_" + kind);
    const throwWord = tr("throwable_throw");
    const switchWord = tr("throwable_switch");

    nameEl.textContent = name;
    countEl.textContent = "×" + n;
    countEl.style.color = n > 0 ? "var(--gg-gold)" : "#6b7a8c";
    throwLbl.textContent = throwWord;
    switchLbl.textContent = switchWord;
    root.style.borderLeftColor = KIND_COLORS[kind];
    root.style.opacity = n > 0 ? "1" : "0.72";

    for (let i = 0; i < KINDS.length; i++) {
      const k = KINDS[i];
      icons[k].style.display = k === kind ? "block" : "none";
    }
    root.setAttribute(
      "aria-label",
      name + " ×" + n + " — F " + throwWord + " · V " + switchWord
    );
  }

  /** Accept only the shape the throwables factory emits. */
  function applyState(detail) {
    if (!detail || typeof detail !== "object") return;
    if (KINDS.indexOf(detail.selected) !== -1) selected = detail.selected;
    const source = detail.counts && typeof detail.counts === "object"
      ? detail.counts
      : null;
    if (source) {
      for (let i = 0; i < KINDS.length; i++) {
        const k = KINDS[i];
        const value = Math.floor(Number(source[k]));
        counts[k] = Number.isFinite(value)
          ? Math.max(0, Math.min(99, value))
          : 0;
      }
    }
    render();
  }

  render();

  if (bus && typeof bus.addEventListener === "function") {
    bus.addEventListener("throwables-state", (e) => {
      applyState(e && e.detail ? e.detail : null);
    });

    // Language switch: re-resolve the item name + both action words.
    bus.addEventListener("settings-changed", () => {
      render();
    });

    // Follow the HUD contract: playing/paused shows, menu/gameover/intro hides.
    bus.addEventListener("state-changed", (e) => {
      const st = e && e.detail ? e.detail.state : null;
      setVisible(st === "playing" || st === "paused");
    });
  }

  return {
    /** Event-driven widget — update() exists only so callers can wire a frame
     * loop without a presence check. It deliberately does nothing. */
    update() {},
  };
}
