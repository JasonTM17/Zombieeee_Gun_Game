/**
 * Armor HUD — the thin blue survival bar above the health block.
 *
 * createArmorHud(uiRoot, bus) → { set }
 *
 * - Sits bottom-left ABOVE the existing health block (the HUD owns that block
 *   at left 22 / bottom 22): same 240 px column, bottom 100 px.
 * - Label "GIÁP/ARMOR" + numeric value, thin blue bar, tiny inline styles.
 * - Hidden while armor is 0; listens "armor-changed" {armor, max} from
 *   controller.js and updates the fill width/number. No per-frame work: the
 *   controller emits only when armor actually changes (and on reset).
 * - Self-contained DOM/CSS: nothing in hud.js or style.css is touched.
 *
 * @param {HTMLElement} uiRoot - the #ui element.
 * @param {EventTarget} bus
 * @returns {{set: (armor: number, max?: number) => void}}
 */

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

export function createArmorHud(uiRoot, bus) {
  if (!uiRoot || typeof uiRoot.appendChild !== "function") {
    throw new Error("createArmorHud: container (#ui) is required");
  }
  if (!bus || typeof bus.addEventListener !== "function") {
    throw new Error("createArmorHud: bus is required");
  }

  const wrap = css(make("div", "gg-armor-wrap", uiRoot), {
    position: "absolute",
    left: "22px",
    // Just above the health block (22 px bottom + ~70 px tall + 8 px gap).
    // The weapon-bar variable lifts it together with the bar on narrow
    // windows, so the 240 px column never collides with the slot strip.
    bottom: "calc(100px + var(--gg-weapon-bar-bottom, 0px))",
    width: "240px",
    zIndex: "6",
    display: "none", // hidden at 0 armor
    pointerEvents: "none",
    fontFamily: '"Segoe UI", system-ui, sans-serif',
  });

  const head = css(make("div", "gg-armor-head", wrap), {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: "4px",
  });
  const label = css(make("span", "gg-armor-lbl", head), {
    fontSize: "10px",
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    color: "#8fa1b8",
  });
  label.textContent = "GIÁP/ARMOR";
  const value = css(make("span", "gg-armor-num", head), {
    fontSize: "15px",
    fontWeight: "800",
    color: "#9fd4ff",
    fontVariantNumeric: "tabular-nums",
  });
  value.textContent = "0";

  const bar = css(make("div", "gg-armor-bar", wrap), {
    height: "6px",
    background: "rgba(255, 255, 255, 0.07)",
    border: "1px solid var(--gg-line, #24334d)",
    borderRadius: "4px",
    overflow: "hidden",
  });
  const fill = css(make("div", "gg-armor-fill", bar), {
    height: "100%",
    width: "0%",
    background: "linear-gradient(90deg, #2f7fd8, #7fd3ff)",
    borderRadius: "3px",
    transition: "width 0.15s ease-out",
  });

  let armor = 0;
  let max = 100;

  function set(nextArmor, nextMax) {
    const m = Number(nextMax);
    if (Number.isFinite(m) && m > 0) max = m;
    const a = Number(nextArmor);
    armor = Number.isFinite(a) ? Math.max(0, Math.min(max, a)) : 0;
    const pct = Math.round((armor / max) * 100);
    value.textContent = String(Math.round(armor));
    fill.style.width = pct + "%";
    wrap.style.display = armor > 0 ? "block" : "none";
  }

  bus.addEventListener("armor-changed", (e) => {
    const d = e && e.detail ? e.detail : {};
    set(d.armor, d.max);
  });

  // Initial state: armor starts at 0 → hidden. (createPlayer's reset emit may
  // land before this HUD exists; the hidden default keeps that harmless.)
  set(0, 100);

  return { set };
}
