/**
 * Perks HUD — the compact "LV n" + XP bar chip.
 *
 * createPerksHud(uiRoot, bus) → { update(dt), set(level, xp, need) }
 *
 * - Bottom-left, directly ABOVE the armor bar (which sits above the health
 *   block): 240 px column, bottom 132 px + the weapon-bar CSS variable, so it
 *   never collides with the health/armor stack or the weapon slot strip.
 * - One row: "LV n" (gold) + "xp/need" (dim, tabular) and a 4 px XP bar under
 *   it. At max level the bar is full and the right label reads MAX/TỐI ĐA.
 * - Event-driven, no per-frame work: listens "xp-changed" {xp, need, level,
 *   totalXp}, pulses on "level-up" {level}, re-renders on
 *   "settings-changed" (language), and shows/hides on "state-changed"
 *   (visible only in "playing"/"paused"; menu/intro/gameover hide it).
 * - Self-contained DOM/CSS; hud.js and style.css are not touched. The two
 *   label keys are registered from this module (EN + VI), so the chip follows
 *   the same language switch as the rest of the HUD.
 *
 * @param {HTMLElement} uiRoot - the #ui element.
 * @param {EventTarget} bus
 */

import { registerBundle, t } from "../core/i18n.js";

const PERKS_HUD_BUNDLE = {
  en: {
    perkHudLevel: "LV {n}",
    perkHudMax: "MAX",
  },
  vi: {
    perkHudLevel: "LV {n}",
    perkHudMax: "TỐI ĐA",
  },
};
registerBundle(PERKS_HUD_BUNDLE);

const PERKS_HUD_CSS = `
.gg-perks-hud {
  position: absolute;
  left: 22px;
  bottom: calc(132px + var(--gg-weapon-bar-bottom, 0px));
  width: 240px;
  z-index: 6;
  display: none;
  pointer-events: none;
  font-family: "Segoe UI", system-ui, sans-serif;
}
.gg-perks-hud.pulse { animation: ggPerksPulse 0.6s ease-out; }
.gg-perks-hud-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.gg-perks-hud-lv {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--gg-gold, #ffd35e);
  text-shadow: 0 0 12px rgba(255, 211, 94, 0.25);
}
.gg-perks-hud-xp {
  font-size: 10px;
  font-weight: 700;
  color: #8fa1b8;
  font-variant-numeric: tabular-nums;
}
.gg-perks-hud-bar {
  height: 4px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 3px;
}
.gg-perks-hud-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #ffb43a, #ffe27a);
  border-radius: 2px;
  transition: width 0.18s ease-out;
}
@keyframes ggPerksPulse {
  0% { transform: scale(1); filter: brightness(1); }
  30% { transform: scale(1.035); filter: brightness(1.5); }
  100% { transform: scale(1); filter: brightness(1); }
}
`;

function make(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

function css(node, styles) {
  for (const key in styles) node.style[key] = styles[key];
  return node;
}

export function createPerksHud(uiRoot, bus) {
  if (!uiRoot || typeof uiRoot.appendChild !== "function") {
    throw new Error("createPerksHud: container (#ui) is required");
  }
  if (!bus || typeof bus.addEventListener !== "function") {
    throw new Error("createPerksHud: bus is required");
  }

  if (typeof document !== "undefined" && !document.getElementById("gg-perks-hud-style")) {
    const style = document.createElement("style");
    style.id = "gg-perks-hud-style";
    style.textContent = PERKS_HUD_CSS;
    if (document.head && typeof document.head.appendChild === "function") {
      document.head.appendChild(style);
    }
  }

  const wrap = css(make("div", "gg-perks-hud", uiRoot), {
    position: "absolute",
    left: "22px",
    bottom: "calc(132px + var(--gg-weapon-bar-bottom, 0px))",
    width: "240px",
    zIndex: "6",
    display: "none",
    pointerEvents: "none",
    fontFamily: '"Segoe UI", system-ui, sans-serif',
  });

  const head = make("div", "gg-perks-hud-head", wrap);
  const lv = make("span", "gg-perks-hud-lv", head);
  const xpText = make("span", "gg-perks-hud-xp", head);
  const bar = make("div", "gg-perks-hud-bar", wrap);
  const fill = make("div", "gg-perks-hud-fill", bar);

  let level = 1;
  let xp = 0;
  let need = 100;
  let lastState = "menu";

  function render() {
    lv.textContent = t("perkHudLevel", { n: level });
    if (need <= 0) {
      xpText.textContent = t("perkHudMax");
      fill.style.width = "100%";
      return;
    }
    const current = Math.max(0, Math.min(need, Math.round(Number(xp) || 0)));
    xpText.textContent = current + "/" + Math.round(need);
    const pct = Math.max(0, Math.min(1, current / need)) * 100;
    fill.style.width = pct.toFixed(1) + "%";
  }

  function syncVisibility() {
    wrap.style.display =
      lastState === "playing" || lastState === "paused" ? "block" : "none";
  }

  /**
   * Direct setter (also used by the bus listener) — the HUD never guesses;
   * the perks system is the single source of truth.
   */
  function set(nextLevel, nextXp, nextNeed) {
    const l = Number(nextLevel);
    if (Number.isFinite(l) && l > 0) level = Math.floor(l);
    const x = Number(nextXp);
    if (Number.isFinite(x) && x >= 0) xp = x;
    const n = Number(nextNeed);
    if (Number.isFinite(n) && n >= 0) need = n;
    render();
    syncVisibility();
  }

  function pulse() {
    if (!wrap.classList) return;
    wrap.classList.remove("pulse");
    // Force a reflow so a second level-up restarts the same animation.
    void wrap.offsetWidth;
    wrap.classList.add("pulse");
  }

  bus.addEventListener("xp-changed", (e) => {
    const d = e && e.detail ? e.detail : {};
    set(d.level, d.xp, d.need);
  });
  bus.addEventListener("level-up", () => pulse());
  bus.addEventListener("settings-changed", () => render());
  bus.addEventListener("state-changed", (e) => {
    const st = e && e.detail ? e.detail.state : null;
    lastState = typeof st === "string" ? st : "menu";
    syncVisibility();
  });

  function update(dt) {
    void dt;
  }

  set(1, 0, 100);

  return { update, set };
}
