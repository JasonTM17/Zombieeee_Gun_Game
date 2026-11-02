/**
 * Radial WEAPON WHEEL — hold Q while playing, steer with the mouse or the
 * number row, release Q to confirm, Esc to cancel.
 *
 * createWeaponWheel(uiRoot, bus, weapons, i18n)
 *   → { update(dt), isOpen(), open(), close() }
 *
 * WHAT THIS MODULE OWNS
 * - One full-screen overlay inside #ui (`gg-ww-overlay`, z-index 47 — above
 *   the shop (40) / merchant (45) / contracts (46), below the map (50),
 *   help/guide (60) and photo mode (70)). It is pointer-events:none; input is
 *   read from window listeners, so the game canvas keeps working underneath.
 * - Twelve absolutely positioned cards around a circle, in the exact
 *   weapons.list / number-key order (1..9,0,-,=). Each card carries its key
 *   badge, a colored CSS glyph, a compact label, a CSS padlock for unowned
 *   guns and a gold ring for the ACTIVE weapon. The centre shows the
 *   highlighted weapon's full name, mag / reserve and the Q/Esc hint. A
 *   conic-gradient divider ring gives the wheel its 12 sectors.
 * - A small "LOCKED" toast (inside #ui, above the weapon bar) flashes when a
 *   locked slot is confirmed; it survives the overlay closing and is ticked
 *   down by update(dt).
 *
 * INPUT / LIFECYCLE (contract)
 * - Hold Q in state "playing", with no blocking overlay, to open. On open the
 *   module emits "weapon-wheel-open" FIRST (main/gamestate adds the "wheel"
 *   pause reason synchronously), THEN releases pointer lock, THEN shows the
 *   overlay. It never pauses/resumes by itself.
 * - Release Q: the highlighted slot is confirmed. Owned → weapons.switchTo().
 *   Unowned → no switch + the LOCKED flash. Esc (capture phase, so input.js
 *   never turns it into a pause) cancels and restores the previous weapon.
 *   Close emits "weapon-wheel-closed" AFTER the switch/restore, so the pause
 *   reason is dropped once the arsenal is already correct.
 * - Pointer lock is NOT re-requested on close (same browser-gesture rule as the
 *   Trader overlay): the player's next canvas click re-locks through input.js.
 * - The unlock itself is asynchronous. If Q is released before the
 *   pointerlockchange event arrives, the actual close waits for it (or a short
 *   timeout), so input.js's lock-loss "pause-toggle" lands while the "wheel"
 *   pause is still active and cannot strand a "user" pause reason.
 * - Blocked while state !== "playing" or while shop / help / merchant / perks /
 *   contracts / Boss Rush / photo mode / the map overlay is open. Tracked from
 *   bus events; if one opens while the wheel is up, the wheel cancels.
 *
 * SELECTION
 * - Mouse position relative to the SCREEN CENTRE picks the sector nearest the
 *   cursor (slot 1 at the top, clockwise; 30° per slot). A dead-zone at the
 *   centre keeps the cursor from flickering between sectors.
 * - Mouse wheel cycles ±1 slot, wrapping.
 * - Digit1..Digit9, Digit0, Minus and Equal jump straight to that slot.
 * - The highlighted card scales/glows; the centre info follows immediately.
 *
 * i18n
 * - Registers WEAPON_WHEEL_BUNDLE (EN + VI, identical key sets) through
 *   i18n.registerBundle. Every visible word, aria label and the hint comes
 *   from i18n.t(); key badges and glyphs are language-neutral. A live
 *   "settings-changed" {lang} re-renders everything in place.
 *
 * PERFORMANCE
 * - Everything is built once at creation. update(dt) only decrements the
 *   toast timer — no DOM writes unless the toast actually expires and no
 *   per-frame allocations. Selection repaints happen only on input events.
 *
 * WIRING (main.js — not edited by this module)
 *   import { createWeaponWheel } from "./ui/weapon-wheel.js";
 *   const weaponWheel = createWeaponWheel(uiRoot, bus, weapons, i18n);
 *   bus.addEventListener("weapon-wheel-open", () => gamestate.addPause("wheel"));
 *   bus.addEventListener("weapon-wheel-closed", () => gamestate.removePause("wheel"));
 *   // in the "playing" branch of frame(), next to hud.update(...):
 *   weaponWheel.update(dt);
 *
 * @param {HTMLElement} uiRoot - the #ui element.
 * @param {EventTarget} bus - the shared game bus (src/systems/gamestate.js).
 * @param {import("../player/weapons.js").Weapons} weapons - live arsenal
 *   (list[12], current, switchTo).
 * @param {{t: Function, registerBundle: Function}} i18n
 * @returns {{update: (dt: number) => void, isOpen: () => boolean,
 *   open: () => boolean, close: () => void}}
 */

export const WEAPON_WHEEL_BUNDLE = {
  en: {
    wwTitle: "WEAPON WHEEL",
    wwHint: "Q — select · Esc — cancel",
    wwLocked: "LOCKED",
    wwActive: "ACTIVE",
    wwAmmo: "{mag} / {reserve}",
    wwEmpty: "—",
    wwInfinity: "∞",
    wwSlotAria: "Weapon slot {n}: {name}",
    wwSlotAriaLocked: "Weapon slot {n}: {name} — locked",
    wwNamePistol: "Pistol",
    wwNameShotgun: "Shotgun",
    wwNameRifle: "Assault Rifle",
    wwNameSmg: "SMG",
    wwNameSniper: "Sniper Rifle",
    wwNameMinigun: "Minigun",
    wwNameGrenade: "Grenade Launcher",
    wwNameMagnum: "Magnum",
    wwNameDmr: "Marksman Rifle",
    wwNameRailgun: "Railgun",
    wwNameSawnoff: "Sawn-off Shotgun",
    wwNameCrossbow: "Crossbow",
    wwShortPistol: "PISTOL",
    wwShortShotgun: "SHOTGUN",
    wwShortRifle: "RIFLE",
    wwShortSmg: "SMG",
    wwShortSniper: "SNIPER",
    wwShortMinigun: "MINIGUN",
    wwShortGrenade: "GRENADE",
    wwShortMagnum: "MAGNUM",
    wwShortDmr: "DMR",
    wwShortRailgun: "RAILGUN",
    wwShortSawnoff: "SAWN-OFF",
    wwShortCrossbow: "CROSSBOW",
  },
  vi: {
    wwTitle: "VÒNG VŨ KHÍ",
    wwHint: "Q — chọn · Esc — hủy",
    wwLocked: "ĐÃ KHÓA",
    wwActive: "ĐANG DÙNG",
    wwAmmo: "{mag} / {reserve}",
    wwEmpty: "—",
    wwInfinity: "∞",
    wwSlotAria: "Ô vũ khí {n}: {name}",
    wwSlotAriaLocked: "Ô vũ khí {n}: {name} — đã khóa",
    wwNamePistol: "Súng ngắn",
    wwNameShotgun: "Súng shotgun",
    wwNameRifle: "Súng trường",
    wwNameSmg: "SMG",
    wwNameSniper: "Súng bắn tỉa",
    wwNameMinigun: "Minigun",
    wwNameGrenade: "Súng phóng lựu",
    wwNameMagnum: "Súng lục Magnum",
    wwNameDmr: "Súng bắn tỉa DMR",
    wwNameRailgun: "Súng điện từ",
    wwNameSawnoff: "Súng cưa đôi",
    wwNameCrossbow: "Nỏ săn",
    wwShortPistol: "NGẮN",
    wwShortShotgun: "SHOTGUN",
    wwShortRifle: "TRƯỜNG",
    wwShortSmg: "SMG",
    wwShortSniper: "TỈA",
    wwShortMinigun: "MINIGUN",
    wwShortGrenade: "LỰU",
    wwShortMagnum: "MAGNUM",
    wwShortDmr: "DMR",
    wwShortRailgun: "RAILGUN",
    wwShortSawnoff: "CƯA",
    wwShortCrossbow: "NỎ",
  },
};

// Fixed slot order — MUST match weapons.list, hud.js WEAPON_KEYS and
// weapons.js's Digit1..0 / Minus / Equal switching.
const KEY_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];

const SLOT_DEFS = [
  { id: "pistol", glyph: "▮", color: "#d9c08a", fullKey: "wwNamePistol", shortKey: "wwShortPistol" },
  { id: "shotgun", glyph: "≡", color: "#c98b5a", fullKey: "wwNameShotgun", shortKey: "wwShortShotgun" },
  { id: "rifle", glyph: "▰", color: "#9fb6d0", fullKey: "wwNameRifle", shortKey: "wwShortRifle" },
  { id: "smg", glyph: "▪", color: "#7fd3c0", fullKey: "wwNameSmg", shortKey: "wwShortSmg" },
  { id: "sniper", glyph: "⌖", color: "#8fd18a", fullKey: "wwNameSniper", shortKey: "wwShortSniper" },
  { id: "minigun", glyph: "✶", color: "#e0a3ff", fullKey: "wwNameMinigun", shortKey: "wwShortMinigun" },
  { id: "grenade", glyph: "◉", color: "#a8c45e", fullKey: "wwNameGrenade", shortKey: "wwShortGrenade" },
  { id: "magnum", glyph: "✦", color: "#ffd35e", fullKey: "wwNameMagnum", shortKey: "wwShortMagnum" },
  { id: "dmr", glyph: "⊹", color: "#7fb2ff", fullKey: "wwNameDmr", shortKey: "wwShortDmr" },
  { id: "railgun", glyph: "ϟ", color: "#5ad4ff", fullKey: "wwNameRailgun", shortKey: "wwShortRailgun" },
  { id: "sawnoff", glyph: "✂", color: "#ff8a5c", fullKey: "wwNameSawnoff", shortKey: "wwShortSawnoff" },
  { id: "crossbow", glyph: "➶", color: "#c9a25a", fullKey: "wwNameCrossbow", shortKey: "wwShortCrossbow" },
];

const SLOT_COUNT = SLOT_DEFS.length; // 12
const SLOT_ARC = 360 / SLOT_COUNT; // 30° per sector
const SLOT_RADIUS = 40; // % of the wheel box
const MOUSE_DEAD_ZONE = 30; // px around screen centre - no accidental flips
const LOCKED_FLASH_TIME = 1.0; // s — "LOCKED" toast lifetime
const UNLOCK_FALLBACK_MS = 350; // pointerlockchange never arrived → force close

// KeyboardEvent.code → slot index (1..9, 0, -, =).
const SLOT_KEY_CODES = Object.create(null);
for (let i = 0; i < 9; i++) SLOT_KEY_CODES["Digit" + (i + 1)] = i;
SLOT_KEY_CODES.Digit0 = 9;
SLOT_KEY_CODES.Minus = 10;
SLOT_KEY_CODES.Equal = 11;
// Numpad equivalents are a convenience only; the numbered row is canonical.
for (let i = 0; i < 9; i++) SLOT_KEY_CODES["Numpad" + (i + 1)] = i;
SLOT_KEY_CODES.Numpad0 = 9;

const WHEEL_CSS = `
.gg-ww-overlay {
  position: absolute;
  inset: 0;
  z-index: 47;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  font-family: "Segoe UI", system-ui, sans-serif;
  color: var(--gg-text, #dbe6f5);
  background:
    radial-gradient(circle at center, rgba(4, 8, 14, 0.6) 0%, rgba(3, 6, 10, 0.84) 48%, rgba(1, 3, 6, 0.94) 100%);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  animation: gg-ww-in 0.12s ease-out;
}
.gg-ww-overlay.hidden { display: none; }
@keyframes gg-ww-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.gg-ww-wheel {
  position: relative;
  width: min(620px, calc(100vmin - 40px));
  aspect-ratio: 1 / 1;
}
.gg-ww-wheel::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    repeating-conic-gradient(
      from -15deg,
      rgba(255, 211, 94, 0.15) 0deg 0.7deg,
      transparent 0.7deg 30deg
    ),
    radial-gradient(circle, transparent 0 36%, rgba(255, 211, 94, 0.035) 36.5% 60%, transparent 60.5%);
  opacity: 0.9;
  pointer-events: none;
}
.gg-ww-wheel::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 38%;
  height: 38%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 1px solid rgba(255, 211, 94, 0.25);
  background: radial-gradient(circle, rgba(8, 12, 19, 0.96) 0 62%, rgba(8, 12, 19, 0.72) 100%);
  box-shadow: inset 0 0 34px rgba(0, 0, 0, 0.75), 0 0 26px rgba(0, 0, 0, 0.55);
  pointer-events: none;
}
.gg-ww-slot {
  position: absolute;
  z-index: 2;
  width: 16%;
  min-width: 0;
  transform: translate(-50%, -50%);
}
.gg-ww-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-height: 54px;
  padding: 6px 4px 5px;
  background: rgba(9, 14, 22, 0.88);
  border: 1px solid rgba(36, 51, 77, 0.95);
  border-radius: 7px;
  color: #8fa1b8;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
  transition:
    transform 0.1s ease-out,
    border-color 0.1s ease-out,
    background 0.1s ease-out,
    box-shadow 0.1s ease-out,
    opacity 0.1s ease-out;
}
.gg-ww-slot.sel .gg-ww-card {
  transform: scale(1.08);
  border-color: var(--gg-gold, #ffd35e);
  background: linear-gradient(180deg, rgba(58, 43, 16, 0.96), rgba(14, 19, 27, 0.96));
  box-shadow:
    0 0 0 1px rgba(255, 211, 94, 0.55),
    0 0 22px rgba(255, 211, 94, 0.24),
    0 6px 18px rgba(0, 0, 0, 0.5);
}
.gg-ww-slot.active .gg-ww-card {
  border-color: rgba(255, 211, 94, 0.78);
  box-shadow: inset 0 0 0 1px rgba(255, 211, 94, 0.35);
}
.gg-ww-slot.active.sel .gg-ww-card {
  box-shadow:
    0 0 0 2px rgba(255, 211, 94, 0.75),
    0 0 26px rgba(255, 211, 94, 0.3),
    0 6px 18px rgba(0, 0, 0, 0.5);
}
.gg-ww-slot.active .gg-ww-card::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 2px;
  width: 14px;
  height: 2px;
  transform: translateX(-50%);
  border-radius: 1px;
  background: var(--gg-gold, #ffd35e);
  opacity: 0.8;
}
.gg-ww-slot.locked .gg-ww-card {
  opacity: 0.42;
  filter: grayscale(0.65);
}
.gg-ww-slot.locked.sel .gg-ww-card {
  opacity: 0.72;
  filter: grayscale(0.3);
}
.gg-ww-key {
  position: absolute;
  top: 3px;
  left: 4px;
  padding: 1px 3px;
  border-radius: 3px;
  background: #0b1322;
  border: 1px solid #33465f;
  color: #cfe0ff;
  font: 800 8px/9px ui-monospace, Consolas, monospace;
}
.gg-ww-glyph {
  font-size: 19px;
  line-height: 1;
  color: var(--wc, #ffd9a0);
  text-shadow: 0 0 10px rgba(255, 211, 94, 0.18);
}
.gg-ww-short {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 8px;
  line-height: 11px;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #c7d4e6;
}
.gg-ww-lock {
  position: absolute;
  top: 4px;
  right: 5px;
  width: 8px;
  height: 10px;
  display: none;
}
.gg-ww-slot.locked .gg-ww-lock { display: block; }
.gg-ww-lock::before {
  content: "";
  position: absolute;
  left: 1px;
  top: 0;
  width: 6px;
  height: 5px;
  box-sizing: border-box;
  border: 1px solid #93a4b9;
  border-bottom: none;
  border-radius: 4px 4px 0 0;
}
.gg-ww-lock::after {
  content: "";
  position: absolute;
  left: 0;
  top: 4px;
  width: 8px;
  height: 6px;
  border-radius: 1px;
  background: #93a4b9;
}
.gg-ww-center {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 3;
  width: 34%;
  max-width: 220px;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  pointer-events: none;
}
.gg-ww-title {
  font-size: 9px;
  line-height: 12px;
  font-weight: 800;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: rgba(255, 211, 94, 0.85);
}
.gg-ww-name {
  margin-top: 5px;
  font-size: clamp(14px, 2.4vmin, 19px);
  line-height: 1.15;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #f2f7ff;
}
.gg-ww-ammo {
  margin-top: 4px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 13px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  color: var(--gg-gold, #ffd35e);
}
.gg-ww-status {
  min-height: 10px;
  margin-top: 3px;
  font-size: 8.5px;
  line-height: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #8fa1b8;
}
.gg-ww-status.is-active { color: var(--gg-gold, #ffd35e); }
.gg-ww-status.is-locked { color: #ff8d7f; }
.gg-ww-hint {
  margin-top: 10px;
  font-size: 9px;
  line-height: 13px;
  letter-spacing: 0.04em;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-ww-toast {
  position: absolute;
  left: 50%;
  bottom: calc(124px + var(--gg-weapon-bar-bottom, 0px));
  z-index: 8;
  padding: 7px 15px;
  border-radius: 6px;
  background: rgba(32, 9, 9, 0.92);
  border: 1px solid rgba(255, 92, 72, 0.75);
  color: #ffb3a8;
  font: 800 10.5px/1 "Segoe UI", system-ui, sans-serif;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transform: translateX(-50%);
  transition: opacity 0.12s ease-out, visibility 0.12s;
  pointer-events: none;
}
.gg-ww-toast.show {
  opacity: 1;
  visibility: visible;
}
@media (max-width: 900px) {
  .gg-ww-wheel { width: min(520px, calc(100vmin - 24px)); }
  .gg-ww-slot { width: 17.5%; }
  .gg-ww-card { min-height: 46px; padding: 5px 3px 4px; }
  .gg-ww-glyph { font-size: 16px; }
  .gg-ww-short { font-size: 7px; line-height: 10px; letter-spacing: 0.06em; }
  .gg-ww-center { width: 38%; }
  .gg-ww-name { font-size: clamp(13px, 2.2vmin, 17px); }
  .gg-ww-hint { font-size: 8.5px; }
  .gg-ww-toast { bottom: calc(112px + var(--gg-weapon-bar-bottom, 0px)); }
}
@media (max-height: 700px) {
  .gg-ww-wheel { width: min(540px, calc(100vmin - 24px)); }
}
@media (prefers-reduced-motion: reduce) {
  .gg-ww-overlay { animation: none; }
  .gg-ww-card { transition: none; }
}
`;

let wheelUid = 0;

function make(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

function fmtInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.max(0, Math.round(n))) : "0";
}

function isOwned(entry) {
  // Real entries always carry a boolean. A missing flag on a present entry
  // is treated as owned so a partially mocked list cannot invent a lock.
  return !!entry && entry.owned !== false;
}

/**
 * @param {HTMLElement} uiRoot
 * @param {EventTarget} bus
 * @param {import("../player/weapons.js").Weapons} weapons
 * @param {{t: Function, registerBundle: Function}} i18n
 */
export function createWeaponWheel(uiRoot, bus, weapons, i18n) {
  if (!uiRoot || typeof uiRoot.appendChild !== "function") {
    throw new Error("createWeaponWheel: container (#ui) is required");
  }
  if (!bus || typeof bus.addEventListener !== "function") {
    throw new Error("createWeaponWheel: bus is required");
  }
  if (!weapons || !Array.isArray(weapons.list)) {
    throw new Error("createWeaponWheel: weapons.list is required");
  }
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(WEAPON_WHEEL_BUNDLE);
  }
  const tr = (key, params) =>
    i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;

  if (
    typeof document !== "undefined" &&
    typeof document.getElementById === "function" &&
    !document.getElementById("gg-ww-style")
  ) {
    const style = document.createElement("style");
    style.id = "gg-ww-style";
    style.textContent = WHEEL_CSS;
    if (document.head && typeof document.head.appendChild === "function") {
      document.head.appendChild(style);
    }
  }

  const uid = ++wheelUid;

  // --- DOM: overlay, 12 slots, centre info ------------------------------------
  const overlay = make("div", "gg-ww-overlay hidden", uiRoot);
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-hidden", "true");

  const wheelEl = make("div", "gg-ww-wheel", overlay);
  wheelEl.setAttribute("role", "listbox");
  wheelEl.setAttribute("aria-orientation", "horizontal");

  /** @type {Array<{slot: HTMLElement, card: HTMLElement, glyph: HTMLElement, short: HTMLElement}>} */
  const slots = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const def = SLOT_DEFS[i];
    const angle = (-90 + SLOT_ARC * i) * (Math.PI / 180);
    const left = 50 + Math.cos(angle) * SLOT_RADIUS;
    const top = 50 + Math.sin(angle) * SLOT_RADIUS;

    const slot = make("div", "gg-ww-slot", wheelEl);
    slot.id = "gg-ww-" + uid + "-slot-" + i;
    slot.style.left = left.toFixed(2) + "%";
    slot.style.top = top.toFixed(2) + "%";
    slot.setAttribute("role", "option");
    slot.setAttribute("aria-selected", "false");

    const card = make("div", "gg-ww-card", slot);
    const key = make("span", "gg-ww-key", card);
    key.textContent = KEY_LABELS[i];
    key.setAttribute("aria-hidden", "true");

    const glyph = make("span", "gg-ww-glyph", card);
    glyph.textContent = def.glyph;
    glyph.style.setProperty("--wc", def.color);
    glyph.setAttribute("aria-hidden", "true");

    const short = make("span", "gg-ww-short", card);

    const lock = make("span", "gg-ww-lock", card);
    lock.setAttribute("aria-hidden", "true");

    slots.push({ slot, card, glyph, short });
  }

  const center = make("div", "gg-ww-center", wheelEl);
  const titleEl = make("div", "gg-ww-title", center);
  const nameEl = make("div", "gg-ww-name", center);
  const ammoEl = make("div", "gg-ww-ammo", center);
  const statusEl = make("div", "gg-ww-status", center);
  const hintEl = make("div", "gg-ww-hint", center);

  // The toast lives OUTSIDE the overlay so the LOCKED flash survives the
  // wheel closing (update(dt) ticks it down once the run is playing again).
  const toast = make("div", "gg-ww-toast", uiRoot);
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");

  // --- state ------------------------------------------------------------------
  let openFlag = false;
  let pendingClose = ""; // "" | "confirm" | "cancel" — waiting for unlock
  let unlockPending = false; // lock released, pointerlockchange not delivered yet
  let closeTimer = 0;
  let toastTimer = 0;
  let lastWheelAt = -Infinity;
  let selected = 0;
  let startIndex = 0;
  let lastState = "menu";
  const blockers = {
    shop: false,
    help: false,
    merchant: false,
    perks: false,
    contracts: false,
    bossrush: false,
    photo: false,
    map: false,
  };

  function blockedNow() {
    return (
      lastState !== "playing" ||
      blockers.shop ||
      blockers.help ||
      blockers.merchant ||
      blockers.perks ||
      blockers.contracts ||
      blockers.bossrush ||
      blockers.photo ||
      blockers.map
    );
  }

  function clampIndex(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(SLOT_COUNT - 1, Math.max(0, Math.round(n)));
  }

  function entryAt(index) {
    return weapons.list[index] || null;
  }

  // --- painting (event-driven only — never from update) -----------------------
  function paintSlots() {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const ref = slots[i];
      const owned = isOwned(entryAt(i));
      ref.slot.classList.toggle("locked", !owned);
      ref.slot.classList.toggle("active", i === weapons.current);
      ref.slot.setAttribute(
        "aria-label",
        tr(owned ? "wwSlotAria" : "wwSlotAriaLocked", {
          n: i + 1,
          name: tr(SLOT_DEFS[i].fullKey),
        })
      );
      ref.slot.setAttribute("aria-disabled", owned ? "false" : "true");
      ref.short.textContent = tr(SLOT_DEFS[i].shortKey);
    }
  }

  function paintInfo() {
    const def = SLOT_DEFS[selected] || SLOT_DEFS[0];
    const entry = entryAt(selected);
    const owned = isOwned(entry);

    nameEl.textContent = tr(def.fullKey);
    if (entry) {
      const reserve =
        entry.reserve === Infinity
          ? tr("wwInfinity")
          : fmtInt(entry.reserve);
      ammoEl.textContent = tr("wwAmmo", { mag: fmtInt(entry.mag), reserve });
    } else {
      ammoEl.textContent = tr("wwEmpty");
    }

    statusEl.classList.remove("is-active", "is-locked");
    if (!owned) {
      statusEl.textContent = tr("wwLocked");
      statusEl.classList.add("is-locked");
    } else if (selected === weapons.current) {
      statusEl.textContent = tr("wwActive");
      statusEl.classList.add("is-active");
    } else {
      statusEl.textContent = "";
    }
    wheelEl.setAttribute("aria-activedescendant", slots[selected].slot.id);
  }

  function paintSelection() {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const on = i === selected;
      slots[i].slot.classList.toggle("sel", on);
      slots[i].slot.setAttribute("aria-selected", on ? "true" : "false");
    }
    paintInfo();
  }

  function selectIndex(next) {
    const idx = ((Math.round(next) % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
    if (idx === selected) return;
    selected = idx;
    paintSelection();
  }

  function applyTexts() {
    const title = tr("wwTitle");
    overlay.setAttribute("aria-label", title);
    wheelEl.setAttribute("aria-label", title);
    titleEl.textContent = title;
    hintEl.textContent = tr("wwHint");
    if (toastTimer > 0) toast.textContent = tr("wwLocked");
    paintSlots();
    paintSelection();
  }

  function showLocked() {
    toast.textContent = tr("wwLocked");
    toast.classList.add("show");
    toastTimer = LOCKED_FLASH_TIME;
  }

  function hideToast() {
    toastTimer = 0;
    toast.classList.remove("show");
  }

  // --- pointer lock -----------------------------------------------------------
  /**
   * Release the lock that was active when the wheel opened. The capture happens
   * BEFORE the "weapon-wheel-open" dispatch because input.js also releases the
   * lock from its "state-changed" handler (state → paused). Whichever call
   * actually clears it, `unlockPending` must stay true until the asynchronous
   * pointerlockchange event has been delivered.
   * @param {boolean} wasLocked
   */
  function releasePointerLock(wasLocked) {
    if (!wasLocked || typeof document === "undefined") return;
    unlockPending = true;
    if (!document.pointerLockElement) return; // input.js already released it
    if (typeof document.exitPointerLock !== "function") return;
    try {
      const p = document.exitPointerLock();
      if (p && typeof p.then === "function") p.catch(() => {});
    } catch {
      /* keep unlockPending: the pending pointerlockchange still closes us */
    }
  }

  function scheduleClose(ms) {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = 0;
    }
    closeTimer = setTimeout(() => {
      closeTimer = 0;
      unlockPending = false;
      if (pendingClose) finishClose();
    }, ms);
  }

  function finishClose() {
    if (!openFlag) return;
    const kind = pendingClose || "cancel";
    const previous = startIndex;
    const target = selected;

    pendingClose = "";
    unlockPending = false;
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = 0;
    }

    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    openFlag = false;

    if (kind === "confirm") {
      const entry = entryAt(target);
      if (!isOwned(entry)) {
        showLocked();
      } else if (target !== previous && typeof weapons.switchTo === "function") {
        weapons.switchTo(target);
      }
    } else {
      const prev = entryAt(previous);
      if (
        weapons.current !== previous &&
        isOwned(prev) &&
        typeof weapons.switchTo === "function"
      ) {
        weapons.switchTo(previous);
      }
    }

    // AFTER the arsenal is correct and the overlay is gone.
    bus.dispatchEvent(new CustomEvent("weapon-wheel-closed"));
  }

  function requestClose(kind) {
    if (!openFlag || pendingClose) return;
    pendingClose = kind === "confirm" ? "confirm" : "cancel";
    if (unlockPending) {
      // The pointer-lock release is still in flight. Closing now would let the
      // lock-loss "pause-toggle" land after the wheel pause was removed and
      // strand a "user" pause. Wait for pointerlockchange (or the fallback).
      scheduleClose(UNLOCK_FALLBACK_MS);
      return;
    }
    finishClose();
  }

  // --- public -----------------------------------------------------------------
  function canOpen() {
    return !openFlag && !blockedNow();
  }

  function open() {
    if (!canOpen()) return false;
    openFlag = true;
    lastWheelAt = -Infinity;
    pendingClose = "";
    unlockPending = false;
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = 0;
    }
    hideToast();
    startIndex = clampIndex(weapons.current);
    selected = startIndex;
    paintSlots();
    paintSelection();

    // Capture the lock state BEFORE the open dispatch: input.js releases the
    // lock synchronously from its "state-changed" {paused} handler.
    const wasLocked =
      typeof document !== "undefined" &&
      !!(document.pointerLockElement && document.exitPointerLock);

    // Contract order: pause reason FIRST (synchronous bus dispatch), then
    // release the pointer, then show the wheel.
    bus.dispatchEvent(new CustomEvent("weapon-wheel-open"));
    releasePointerLock(wasLocked);
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    return true;
  }

  function close() {
    requestClose("cancel");
  }

  function isOpen() {
    return openFlag;
  }

  function update(dt) {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (toastTimer <= 0) return;
    toastTimer -= step;
    if (toastTimer <= 0) {
      toastTimer = 0;
      toast.classList.remove("show");
    }
  }

  // --- input ------------------------------------------------------------------
  function swallow(e, preventDefault) {
    if (preventDefault && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    if (typeof e.stopImmediatePropagation === "function") {
      e.stopImmediatePropagation();
    } else if (typeof e.stopPropagation === "function") {
      e.stopPropagation();
    }
  }

  function onKeyDown(e) {
    if (!e) return;

    if (openFlag) {
      if (e.repeat) {
        swallow(e, false);
        return;
      }
      const code = e.code;
      if (code === "Escape") {
        // Capture phase: input.js never sees this Esc, so it cannot pause /
        // re-lock on top of the wheel.
        swallow(e, true);
        requestClose("cancel");
        return;
      }
      if (code === "KeyQ") {
        // Hold: the release confirms. Swallow repeats and the initial press.
        swallow(e, false);
        return;
      }
      const idx = SLOT_KEY_CODES[code];
      if (idx !== undefined) {
        swallow(e, true);
        selectIndex(idx);
        return;
      }
      // Modal while open: keep WASD/R/B/M/H/E/F/V and F2/F3 etc. away from the
      // game listeners for this press. Browser defaults (F5/F11/F12) are left
      // alone — only propagation is stopped.
      swallow(e, false);
      return;
    }

    if (e.repeat || e.code !== "KeyQ") return;
    if (!canOpen()) return;
    swallow(e, false);
    open();
  }

  function onKeyUp(e) {
    if (!openFlag || !e || e.code !== "KeyQ") return;
    swallow(e, false);
    requestClose("confirm");
  }

  function onMouseMove(e) {
    if (!openFlag || !e) return;
    // Registered on the capture phase: while the wheel owns the screen the
    // event must not reach input.js's document listener (otherwise the paused
    // look accumulator fills up and the camera jumps on resume).
    swallow(e, false);
    // Pointer-lock coordinates are not a real cursor position — wait until the
    // unlock has landed before steering the wheel.
    if (typeof document !== "undefined" && document.pointerLockElement) return;
    const w = typeof window !== "undefined" ? window : null;
    if (!w) return;
    const dx = Number(e.clientX) - w.innerWidth / 2;
    const dy = Number(e.clientY) - w.innerHeight / 2;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (dx * dx + dy * dy < MOUSE_DEAD_ZONE * MOUSE_DEAD_ZONE) return;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    let idx = Math.round((angle + 90) / SLOT_ARC);
    idx = ((idx % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
    selectIndex(idx);
  }

  function onWheel(e) {
    if (!openFlag || !e) return;
    const delta = Number(e.deltaY);
    if (!Number.isFinite(delta) || Math.abs(delta) < 8) return;
    // A high-resolution wheel/trackpad can fire dozens of events per gesture;
    // only one slot step per 120 ms keeps wheel steering deliberate.
    const now = performance.now();
    if (now - lastWheelAt < 120) {
      swallow(e, true);
      return;
    }
    lastWheelAt = now;
    // Capture phase: keep input.js from queueing a weapon switch for resume.
    swallow(e, true);
    selectIndex(selected + (delta > 0 ? 1 : -1));
  }

  function onMouseDown(e) {
    // No primary click during the wheel: with a pointer lock still in flight a
    // mousedown would arm input.js's fire click for the resumed frame.
    if (!openFlag || !e) return;
    swallow(e, true);
  }

  function onBlur() {
    // The Q keyup may never arrive after alt-tab: cancel rather than confirm.
    if (openFlag) requestClose("cancel");
  }

  function onPointerLockChange() {
    if (!unlockPending) return;
    if (typeof document !== "undefined" && document.pointerLockElement) return;
    unlockPending = false;
    if (!pendingClose) return;
    // Run after every other pointerlockchange listener (input.js included) so
    // its lock-loss "pause-toggle" is absorbed by the still-active wheel pause.
    scheduleClose(0);
  }

  function onPointerLockError() {
    if (!unlockPending) return;
    unlockPending = false;
    if (pendingClose) scheduleClose(0);
  }

  // --- overlay blocker tracking (all through bus events) ----------------------
  function trackBlocker(key, openEvent, closeEvent) {
    bus.addEventListener(openEvent, () => {
      blockers[key] = true;
      if (openFlag) requestClose("cancel");
    });
    bus.addEventListener(closeEvent, () => {
      blockers[key] = false;
    });
  }
  trackBlocker("shop", "shop-open", "shop-closed");
  trackBlocker("help", "help-open", "help-closed");
  trackBlocker("merchant", "merchant-open", "merchant-closed");
  trackBlocker("perks", "perks-choice-open", "perks-choice-closed");
  trackBlocker("contracts", "contracts-open", "contracts-closed");
  trackBlocker("bossrush", "bossrush-open", "bossrush-closed");
  trackBlocker("photo", "photo-open", "photo-closed");

  bus.addEventListener("map-visibility", (e) => {
    const openNow = !!(e && e.detail && e.detail.open);
    blockers.map = openNow;
    if (openNow && openFlag) requestClose("cancel");
  });

  bus.addEventListener("state-changed", (e) => {
    const state = e && e.detail ? e.detail.state : null;
    if (typeof state !== "string") return;
    lastState = state;
    if (openFlag && (state === "menu" || state === "gameover" || state === "intro")) {
      requestClose("cancel");
    }
  });

  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail ? e.detail.patch : null;
    if (patch && Object.prototype.hasOwnProperty.call(patch, "lang")) {
      applyTexts();
    }
  });

  // Ownership/active weapon can change outside the wheel (shop buy, debug).
  bus.addEventListener("weapon-unlocked", () => {
    if (openFlag) {
      paintSlots();
      paintInfo();
    }
  });
  bus.addEventListener("weapon-switched", () => {
    if (openFlag) {
      paintSlots();
      paintInfo();
    }
  });

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("blur", onBlur);
  }
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("pointerlockerror", onPointerLockError);
  }

  applyTexts();

  return { update, isOpen, open, close };
}
