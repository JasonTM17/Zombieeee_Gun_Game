/**
 * Perk choice overlay — the modal shown on every level-up.
 *
 * createPerksUI(uiRoot, bus, perks, i18n) → { update(dt), isOpen() }
 *
 * BEHAVIOR
 * - Listens "perks-choice-open" (emitted by src/systems/perks.js when a level
 *   queues a choice). The system emits it BEFORE this overlay opens, so
 *   main.js's listener can pause the run synchronously; this module then
 *   releases the pointer lock (same choreography as the shop/merchant
 *   overlays) and shows the three cards.
 * - Modal: a full-screen backdrop swallows every click. There is deliberately
 *   no close button and Esc does NOT skip — the player MUST pick a card.
 *   Digits 1/2/3 (and Numpad1/2/3) or a click choose the matching card.
 * - "perks-choice-closed" hides the overlay (the system emits it when the
 *   pending queue drains — main.js resumes the run there). The UI NEVER
 *   pauses/resumes anything itself.
 * - Live language switch ("settings-changed" {patch.lang}) re-renders the
 *   header and cards; all strings live in the EN + VI bundle below.
 *
 * Every string is owned here (identical key sets for EN and VI); the system
 * module only carries ids/keys. Cards show an icon glyph, the localized name
 * and description, the current stack count ("NEW" / "STACK ×n") and the
 * 1/2/3 keycap.
 *
 * @param {HTMLElement} uiRoot - the #ui element.
 * @param {EventTarget} bus
 * @param {import("../systems/perks.js").Perks} perks
 * @param {{t: Function, registerBundle: Function}} i18n
 */

import { PERKS } from "../systems/perks.js";

export const PERKS_BUNDLE = {
  en: {
    perksTitle: "LEVEL {n} — CHOOSE A PERK",
    perksStack: "STACK ×{n}",
    perksNew: "NEW",
    perkDamage: "Heavy Rounds",
    perkDamageDesc: "+12% weapon damage.",
    perkFirerate: "Rapid Fire",
    perkFirerateDesc: "+10% fire rate.",
    perkReload: "Fast Hands",
    perkReloadDesc: "−12% reload time.",
    perkSpeed: "Adrenaline",
    perkSpeedDesc: "+8% move speed.",
    perkMaxhp: "Iron Body",
    perkMaxhpDesc: "+20 max HP, and heal 20.",
    perkRegen: "Regeneration",
    perkRegenDesc: "Regenerate 1 HP every 3 seconds.",
    perkArmor: "Plated Vest",
    perkArmorDesc: "+25 armor now and +25 max armor.",
    perkScavenger: "Scavenger",
    perkScavengerDesc: "+15% money from kills.",
    perkBlast: "Demolitionist",
    perkBlastDesc: "+2 frag, +1 molotov, +1 mine.",
    perkSteady: "Steady Aim",
    perkSteadyDesc: "−15% weapon spread.",
    perkVampire: "Bloodthirst",
    perkVampireDesc: "Heal 2 HP per kill.",
    perkLucky: "Headhunter",
    perkLuckyDesc: "+10% headshot damage.",
  },
  vi: {
    perksTitle: "CẤP {n} — CHỌN KỸ NĂNG",
    perksStack: "CỘNG DỒN ×{n}",
    perksNew: "MỚI",
    perkDamage: "Đạn Nặng",
    perkDamageDesc: "+12% sát thương vũ khí.",
    perkFirerate: "Liên Thanh",
    perkFirerateDesc: "+10% tốc độ bắn.",
    perkReload: "Thao Tác Nhanh",
    perkReloadDesc: "−12% thời gian nạp đạn.",
    perkSpeed: "Adrenaline",
    perkSpeedDesc: "+8% tốc độ di chuyển.",
    perkMaxhp: "Thân Sắt",
    perkMaxhpDesc: "+20 máu tối đa và hồi 20 máu.",
    perkRegen: "Hồi Phục",
    perkRegenDesc: "Hồi 1 máu mỗi 3 giây.",
    perkArmor: "Giáp Tấm",
    perkArmorDesc: "+25 giáp ngay và +25 giáp tối đa.",
    perkScavenger: "Nhặt Nhạnh",
    perkScavengerDesc: "+15% tiền từ hạ gục.",
    perkBlast: "Chuyên Nổ",
    perkBlastDesc: "+2 lựu đạn mảnh, +1 molotov, +1 mìn.",
    perkSteady: "Ngắm Vững",
    perkSteadyDesc: "−15% độ tản của vũ khí.",
    perkVampire: "Khát Máu",
    perkVampireDesc: "Hồi 2 máu mỗi mạng hạ gục.",
    perkLucky: "Bắn Đầu",
    perkLuckyDesc: "+10% sát thương bắn đầu.",
  },
};

// Perk id → descriptor (icon + i18n keys). Derived from the system's pool so
// the overlay can never drift from the authoritative 12 perks.
const PERK_BY_ID = {};
for (let i = 0; i < PERKS.length; i++) PERK_BY_ID[PERKS[i].id] = PERKS[i];

const PERKS_CSS = `
.gg-perks-overlay {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, rgba(6, 9, 15, 0.62) 0%, rgba(2, 4, 8, 0.93) 100%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  pointer-events: auto;
  font-family: "Segoe UI", system-ui, sans-serif;
}
.gg-perks-overlay.hidden { display: none; }
.gg-perks-panel {
  width: min(920px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 24px 26px 22px;
  background: var(--gg-panel, rgba(9, 13, 21, 0.96));
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 14px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.7), inset 0 0 0 1px rgba(255, 211, 94, 0.06);
}
.gg-perks-title {
  margin: 0 0 18px;
  text-align: center;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #ffe7c2;
  text-shadow: 0 0 24px rgba(255, 211, 94, 0.3);
}
.gg-perks-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
@media (max-width: 720px) {
  .gg-perks-row { grid-template-columns: 1fr; }
}
.gg-perk-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-height: 218px;
  padding: 18px 16px 14px;
  text-align: left;
  appearance: none;
  font: inherit;
  color: var(--gg-text, #dbe6f5);
  background: linear-gradient(165deg, rgba(38, 52, 76, 0.5), rgba(8, 13, 22, 0.92));
  border: 1px solid #2b3d5c;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.12s ease-out, border-color 0.12s ease-out, box-shadow 0.12s ease-out;
}
.gg-perk-card:hover,
.gg-perk-card:focus-visible {
  transform: translateY(-3px);
  border-color: var(--gg-gold, #ffd35e);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45), 0 0 22px rgba(255, 211, 94, 0.16);
  outline: none;
}
.gg-perk-key {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  color: var(--gg-gold, #ffd35e);
  background: rgba(4, 7, 12, 0.8);
  border: 1px solid rgba(255, 211, 94, 0.45);
  border-radius: 5px;
}
.gg-perk-glyph {
  font-size: 34px;
  line-height: 1;
  color: var(--gg-gold, #ffd35e);
  text-shadow: 0 0 18px rgba(255, 211, 94, 0.35);
}
.gg-perk-name {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #fff;
}
.gg-perk-desc {
  flex: 1;
  font-size: 12px;
  line-height: 1.5;
  color: #a9b8cc;
}
.gg-perk-stack {
  align-self: flex-start;
  padding: 2px 7px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--gg-gold, #ffd35e);
  background: rgba(255, 211, 94, 0.1);
  border: 1px solid rgba(255, 211, 94, 0.45);
  border-radius: 4px;
}
.gg-perk-stack.new {
  color: #7fd3ff;
  background: rgba(127, 211, 255, 0.1);
  border-color: rgba(127, 211, 255, 0.42);
}
.gg-perks-overlay:not(.hidden) .gg-perk-card {
  animation: ggPerkCardIn 0.2s ease-out both;
}
.gg-perks-overlay:not(.hidden) .gg-perk-card:nth-child(2) { animation-delay: 0.04s; }
.gg-perks-overlay:not(.hidden) .gg-perk-card:nth-child(3) { animation-delay: 0.08s; }
@keyframes ggPerkCardIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

function make(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

export function createPerksUI(uiRoot, bus, perks, i18n) {
  if (!uiRoot || typeof uiRoot.appendChild !== "function") {
    throw new Error("createPerksUI: container (#ui) is required");
  }
  if (!bus || typeof bus.addEventListener !== "function") {
    throw new Error("createPerksUI: bus is required");
  }
  if (!perks || typeof perks.state !== "function" || typeof perks.choose !== "function") {
    throw new Error("createPerksUI: perks system is required");
  }
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(PERKS_BUNDLE);
  }
  const tr = (key, params) =>
    i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;

  if (typeof document !== "undefined" && !document.getElementById("gg-perks-style")) {
    const style = document.createElement("style");
    style.id = "gg-perks-style";
    style.textContent = PERKS_CSS;
    if (document.head && typeof document.head.appendChild === "function") {
      document.head.appendChild(style);
    }
  }

  let openFlag = false;

  const overlay = make("div", "gg-perks-overlay hidden", uiRoot);
  if (typeof overlay.setAttribute === "function") {
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
  }
  const panel = make("div", "gg-perks-panel", overlay);
  const title = make("h2", "gg-perks-title", panel);
  const row = make("div", "gg-perks-row", panel);

  /** @type {Array<{root: HTMLButtonElement, key: HTMLElement, glyph: HTMLElement, name: HTMLElement, desc: HTMLElement, stack: HTMLElement}>} */
  const cards = [];
  for (let i = 0; i < 3; i++) {
    const root = make("button", "gg-perk-card", row);
    root.type = "button";
    if (typeof root.setAttribute === "function") {
      root.setAttribute("aria-keyshortcuts", String(i + 1));
    }
    const key = make("span", "gg-perk-key", root);
    key.textContent = String(i + 1);
    const glyph = make("span", "gg-perk-glyph", root);
    const name = make("span", "gg-perk-name", root);
    const desc = make("span", "gg-perk-desc", root);
    const stack = make("span", "gg-perk-stack", root);
    root.addEventListener("click", () => chooseAt(i));
    cards.push({ root, key, glyph, name, desc, stack });
  }

  /** Fill the three cards from the current offer. */
  function render() {
    const st = perks.state();
    title.textContent = tr("perksTitle", { n: st.level });
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const id = st.offer[i];
      if (!id) {
        card.root.style.display = "none";
        continue;
      }
      card.root.style.display = "";
      const def = PERK_BY_ID[id];
      if (!def) {
        card.root.style.display = "none";
        continue;
      }
      card.glyph.textContent = def.icon;
      card.name.textContent = tr(def.nameKey);
      card.desc.textContent = tr(def.descKey);
      const n = st.stacks[id] || 0;
      card.stack.textContent = n > 0 ? tr("perksStack", { n }) : tr("perksNew");
      if (card.stack.classList) card.stack.classList.toggle("new", n === 0);
      if (typeof card.root.setAttribute === "function") {
        card.root.setAttribute("aria-label", tr(def.nameKey) + ". " + tr(def.descKey));
      }
    }
  }

  function openOverlay() {
    const st = perks.state();
    if (!st.offer || st.offer.length === 0) return;
    const wasOpen = openFlag;
    openFlag = true;
    render();
    overlay.classList.remove("hidden");
    if (wasOpen) return;
    // The system already emitted "perks-choice-open" (main pauses the run
    // synchronously); releasing the lock mirrors the shop/merchant protocol.
    if (
      typeof document !== "undefined" &&
      document.pointerLockElement &&
      typeof document.exitPointerLock === "function"
    ) {
      try {
        document.exitPointerLock();
      } catch {
        /* ignore */
      }
    }
    const first = cards[0] && cards[0].root;
    if (first && typeof first.focus === "function") {
      try {
        first.focus();
      } catch {
        /* headless/no focus target */
      }
    }
  }

  function closeOverlay() {
    if (!openFlag) return;
    openFlag = false;
    overlay.classList.add("hidden");
    const active =
      typeof document !== "undefined" ? document.activeElement : null;
    if (active && typeof active.blur === "function" && active !== document.body) {
      active.blur();
    }
  }

  function chooseAt(i) {
    if (!openFlag) return;
    perks.choose(i); // events re-render (more pending) or close the overlay
  }

  // Digit/Numpad 1-3 choose; everything else is swallowed while the modal is
  // up so a stray number/space never leaks into the paused world's input
  // buffer. Esc is explicitly NOT a skip — the player must pick a card.
  // Capture on WINDOW: input.js listens in the window bubble phase, so a
  // window-capture handler is guaranteed to see (and stop) the key first.
  function onKeyDown(e) {
    if (!openFlag || !e) return;
    const code = String(e.code || "");
    let idx = -1;
    if (code === "Digit1" || code === "Numpad1") idx = 0;
    else if (code === "Digit2" || code === "Numpad2") idx = 1;
    else if (code === "Digit3" || code === "Numpad3") idx = 2;
    if (idx >= 0) {
      if (typeof e.preventDefault === "function") e.preventDefault();
      if (typeof e.stopPropagation === "function") e.stopPropagation();
      chooseAt(idx);
      return;
    }
    if (typeof e.stopPropagation === "function") e.stopPropagation();
    if (
      (code === "Escape" || code === "Space" || code === "Tab") &&
      typeof e.preventDefault === "function"
    ) {
      e.preventDefault();
    }
  }
  const keyTarget =
    typeof window !== "undefined" && typeof window.addEventListener === "function"
      ? window
      : typeof document !== "undefined" &&
          typeof document.addEventListener === "function"
        ? document
        : null;
  if (keyTarget) keyTarget.addEventListener("keydown", onKeyDown, true);

  bus.addEventListener("perks-choice-open", () => openOverlay());
  bus.addEventListener("perks-choice-closed", () => closeOverlay());
  bus.addEventListener("ui-quit", () => closeOverlay());
  bus.addEventListener("settings-changed", () => {
    if (openFlag) render();
  });
  bus.addEventListener("state-changed", (e) => {
    const st = e && e.detail ? e.detail.state : null;
    if (st === "menu" || st === "gameover" || st === "intro") closeOverlay();
  });

  function update(dt) {
    void dt;
    // Defensive: a reset() that drained the queue outside the close event
    // still hides the modal on the next tick.
    if (openFlag && perks.state().pending <= 0) closeOverlay();
  }

  return {
    update,
    isOpen: () => openFlag,
  };
}
