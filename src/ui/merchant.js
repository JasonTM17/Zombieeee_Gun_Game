/**
 * The Trader — physical merchant NPC, market stall and TRADE overlay.
 *
 * createMerchantUI(uiRoot, bus, merchant, i18n, camera, player, scene, level)
 *   → { update(dt, playerPos), isOpen() }
 *
 * WHAT THIS MODULE OWNS
 * - A low-poly trader + market stall at the Safehouse, ~15 m east of the story
 *   spawn: hardcoded anchor (−60, 4) validated through level.isBlocked(x, z,
 *   1.2) plus the stall footprints; nearby offsets are tried when blocked.
 *   Draw calls: 1 merged stall, 1 merged trader, 1 emissive lantern mesh, 1
 *   canvas nameplate sprite. NO PointLight, no new shadow map, no per-frame
 *   THREE allocation.
 * - Colliders: the table (1.6 × 0.8 AABB) and two crates (0.8 × 0.8) are
 *   pushed into level.colliders; the trader itself has no collider (like the
 *   survivor NPCs), so the player can walk up to the counter.
 * - Proximity + G key: within 4.5 m of the trader, a bottom-center prompt
 *   "G — THƯƠNG LƯỢNG" appears (above the weapon bar, z-index below every
 *   overlay). Pressing G there opens the trade overlay. Pressing G farther
 *   away shows a 2 s toast "Tìm Thương Lái ở An Toàn Nhà".
 * - The overlay: dark panel like the shop's, header THE TRADER + CASH, four
 *   tabs (WEAPONS / EXPLOSIVES / GEAR / ATTACHMENTS), responsive 2-column
 *   cards with a CSS glyph, localized name + description, price, stock/owned
 *   state, DEAL badge and a BUY button. The ATTACHMENTS tab names the active
 *   weapon it will fit and follows weapon switches while open. Insufficient
 *   cash / stock / requirements show the exact reason and disable the button.
 *   The panel scrolls; max-height never exceeds the viewport.
 * - Open choreography (the reason gamestate pauses): overlay opens ONLY from
 *   "playing", emits "merchant-open" FIRST, then releases pointer lock, then
 *   shows the panel. Close (G / Esc / backdrop / CLOSE) hides the panel, emits
 *   "merchant-closed", and does NOT re-request pointer lock — the player's
 *   next canvas click re-locks through input.js.
 * - All strings come from an OWN i18n bundle (EN + VI, identical key sets).
 *   A live language switch re-renders labels/cards in place.
 *
 * Bus consumed: "state-changed" (gate open to playing, force-close on
 *   menu/gameover/intro), "money-changed", "merchant-purchase",
 *   "weapon-switched", "attachment-bought", "shop-open"/"shop-closed",
 *   "help-open"/"help-closed", "settings-changed".
 * Bus emitted: "merchant-open", "merchant-closed".
 *
 * @param {HTMLElement} uiRoot - the #ui element.
 * @param {EventTarget} bus
 * @param {import("../systems/merchant.js").Merchant} merchant
 * @param {{t: Function, registerBundle: Function, getLang?: Function}} i18n
 * @param {import("three").Camera} camera - reserved for future proximity
 *   effects; the nameplate is a world-space Sprite (always camera-facing).
 * @param {import("../player/controller.js").Player} player
 * @param {import("three").Scene=} scene - omit for a headless/UI-only build.
 * @param {import("../world/level.js").Level=} level - isBlocked + colliders.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const MERCHANT_BUNDLE = {
  en: {
    merchantTitle: "THE TRADER",
    merchantCash: "CASH",
    merchantTabWeapons: "WEAPONS",
    merchantTabExplosives: "EXPLOSIVES",
    merchantTabGear: "GEAR",
    merchantTabAttachments: "ATTACHMENTS",
    merchantAttachFor: "FITS: {weapon}",
    merchantAttachApplied: "FITTED: {name} · {weapon}",
    merchantClose: "CLOSE",
    merchantCloseHint: "G / ESC — close",
    merchantBuy: "BUY",
    merchantOwned: "OWNED",
    merchantSoldOut: "SOLD OUT",
    merchantStock: "STOCK {n}/{max}",
    merchantDeal: "DEAL −25%",
    merchantNoMoney: "NOT ENOUGH CASH",
    merchantNeedCrossbow: "NEEDS CROSSBOW",
    merchantDead: "YOU ARE DEAD",
    merchantPrompt: "G — TRADER",
    merchantNoTrader: "Find the Trader at the Safehouse",
    merchantPurchased: "{name} — purchased",
    merchantEffectMoney: "Mystery crate: +${amount}",
    merchantEffectArmor: "Mystery crate: +{amount} armor",
    merchantEffectAmmo: "Mystery crate: full ammo",
    merchantEffectFrag: "Mystery crate: +{count} frag grenades",
    merchantEffectStim: "+{heal} HP · +10% speed for {time} s",
    merchantItemSawnoff: "Sawn-off",
    merchantDescSawnoff: "Double-barrel. Brutal at contact range.",
    merchantItemCrossbow: "Crossbow",
    merchantDescCrossbow: "Silent. Headshots deal ×3 damage.",
    merchantItemFragPack: "Frag Pack",
    merchantDescFragPack: "+3 frag grenades.",
    merchantItemMolotovPack: "Molotov Pack",
    merchantDescMolotovPack: "+3 molotovs.",
    merchantItemMinePack: "Mine Pack",
    merchantDescMinePack: "+2 proximity mines.",
    merchantItemArmorPlate: "Armor Plate",
    merchantDescArmorPlate: "+50 armor. Armor absorbs half of incoming damage.",
    merchantItemMedkit: "Medkit",
    merchantDescMedkit: "Restore full 100 HP.",
    merchantItemAmmoFull: "Full Ammo",
    merchantDescAmmoFull: "Full reserve for every owned weapon.",
    merchantItemBolts: "Crossbow Bolts",
    merchantDescBolts: "+24 crossbow bolts.",
    merchantItemMysteryCrate: "Mystery Crate",
    merchantDescMysteryCrate: "A random haul: cash, armor, ammo or frags.",
    merchantItemStimShot: "Stim Shot",
    merchantDescStimShot: "+35 HP and +10% speed for 20 s.",
    merchantItemScope: "Scope",
    merchantDescScope: "−35% spread. Tightest groups on any gun.",
    merchantItemExtmag: "Extended Mag",
    merchantDescExtmag: "+50% magazine capacity, rounded up.",
    merchantItemSuppressor: "Suppressor",
    merchantDescSuppressor: "−25% recoil, −20% spread. Longer dark barrel.",
    merchantItemLaser: "Laser Sight",
    merchantDescLaser: "−25% spread. Adds a red dot.",
    merchantWeaponPistol: "Pistol",
    merchantWeaponShotgun: "Shotgun",
    merchantWeaponRifle: "Rifle",
    merchantWeaponSmg: "SMG",
    merchantWeaponSniper: "Sniper",
    merchantWeaponMinigun: "Minigun",
    merchantWeaponGrenade: "Grenade Launcher",
    merchantWeaponMagnum: "Magnum",
    merchantWeaponDmr: "Marksman Rifle",
    merchantWeaponRailgun: "Railgun",
    merchantWeaponSawnoff: "Sawn-off",
    merchantWeaponCrossbow: "Crossbow",
  },
  vi: {
    merchantTitle: "THƯƠNG LÁI",
    merchantCash: "TIỀN",
    merchantTabWeapons: "VŨ KHÍ",
    merchantTabExplosives: "CHẤT NỔ",
    merchantTabGear: "TRANG BỊ",
    merchantTabAttachments: "PHỤ TÙNG",
    merchantAttachFor: "LẮP CHO: {weapon}",
    merchantAttachApplied: "ĐÃ LẮP: {name} · {weapon}",
    merchantClose: "ĐÓNG",
    merchantCloseHint: "G / ESC — đóng",
    merchantBuy: "MUA",
    merchantOwned: "ĐÃ SỞ HỮU",
    merchantSoldOut: "HẾT HÀNG",
    merchantStock: "CÒN {n}/{max}",
    merchantDeal: "GIẢM −25%",
    merchantNoMoney: "THIẾU TIỀN",
    merchantNeedCrossbow: "CẦN NỎ",
    merchantDead: "BẠN ĐÃ CHẾT",
    merchantPrompt: "G — THƯƠNG LƯỢNG",
    merchantNoTrader: "Tìm Thương Lái ở An Toàn Nhà",
    merchantPurchased: "{name} — đã mua",
    merchantEffectMoney: "Thùng bí ẩn: +{amount}$",
    merchantEffectArmor: "Thùng bí ẩn: +{amount} giáp",
    merchantEffectAmmo: "Thùng bí ẩn: đầy đạn",
    merchantEffectFrag: "Thùng bí ẩn: +{count} lựu đạn mảnh",
    merchantEffectStim: "+{heal} máu · +10% tốc độ trong {time} giây",
    merchantItemSawnoff: "Súng Cưa Đôi",
    merchantDescSawnoff: "Hai nòng. Cực mạnh ở cự ly sát.",
    merchantItemCrossbow: "Nỏ Săn",
    merchantDescCrossbow: "Im lặng. Bắn đầu gây ×3 sát thương.",
    merchantItemFragPack: "Gói Lựu Đạn",
    merchantDescFragPack: "+3 lựu đạn mảnh.",
    merchantItemMolotovPack: "Gói Molotov",
    merchantDescMolotovPack: "+3 chai cháy.",
    merchantItemMinePack: "Gói Mìn",
    merchantDescMinePack: "+2 mìn cận chiến.",
    merchantItemArmorPlate: "Tấm Giáp",
    merchantDescArmorPlate: "+50 giáp. Giáp hấp thụ một nửa sát thương nhận vào.",
    merchantItemMedkit: "Túi Cứu Thương",
    merchantDescMedkit: "Hồi đầy 100 máu.",
    merchantItemAmmoFull: "Nạp Đạn Toàn Phần",
    merchantDescAmmoFull: "Nạp đầy dự trữ mọi súng đang sở hữu.",
    merchantItemBolts: "Mũi Nỏ",
    merchantDescBolts: "+24 mũi nỏ.",
    merchantItemMysteryCrate: "Thùng Bí Ẩn",
    merchantDescMysteryCrate: "Hàng ngẫu nhiên: tiền, giáp, đạn hoặc lựu đạn.",
    merchantItemStimShot: "Thuốc Kích Thích",
    merchantDescStimShot: "+35 máu và +10% tốc độ trong 20 giây.",
    merchantItemScope: "Ống Ngắm",
    merchantDescScope: "−35% độ tản. Bắn chụm nhất trên mọi súng.",
    merchantItemExtmag: "Băng Đạn Mở Rộng",
    merchantDescExtmag: "+50% sức chứa băng đạn, làm tròn lên.",
    merchantItemSuppressor: "Giảm Thanh",
    merchantDescSuppressor: "−25% giật, −20% độ tản. Nòng dài màu tối.",
    merchantItemLaser: "Đèn Laser",
    merchantDescLaser: "−25% độ tản. Thêm chấm đỏ.",
    merchantWeaponPistol: "Súng ngắn",
    merchantWeaponShotgun: "Shotgun",
    merchantWeaponRifle: "Súng trường",
    merchantWeaponSmg: "SMG",
    merchantWeaponSniper: "Súng bắn tỉa",
    merchantWeaponMinigun: "Minigun",
    merchantWeaponGrenade: "Súng phóng lựu",
    merchantWeaponMagnum: "Súng Lục Magnum",
    merchantWeaponDmr: "Súng Bắn Tỉa DMR",
    merchantWeaponRailgun: "Súng Điện Từ",
    merchantWeaponSawnoff: "Súng Cưa Đôi",
    merchantWeaponCrossbow: "Nỏ Săn",
  },
};

const ITEM_ICONS = {
  sawnoff: "≡",
  crossbow: "➶",
  frag_pack: "✹",
  molotov_pack: "♨",
  mine_pack: "◎",
  armor_plate: "▣",
  medkit: "✚",
  ammo_full: "▮",
  bolts: "⇉",
  mystery_crate: "▤",
  stim_shot: "⚡",
  scope: "⌖",
  extmag: "▥",
  suppressor: "▬",
  laser: "•",
};

const MERCHANT_CSS = `
.gg-merchant-overlay {
  position: absolute;
  inset: 0;
  z-index: 45;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, rgba(5, 8, 14, 0.55) 0%, rgba(2, 4, 8, 0.88) 100%);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  pointer-events: auto;
  font-family: "Segoe UI", system-ui, sans-serif;
}
.gg-merchant-overlay.hidden { display: none; }
.gg-merchant-panel {
  width: min(780px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: var(--gg-panel, rgba(9, 13, 21, 0.94));
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 12px;
  padding: 22px 24px 16px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.62), inset 0 0 0 1px rgba(255, 198, 120, 0.05);
}
.gg-merchant-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.gg-merchant-title {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #ffe7c2;
  text-shadow: 0 0 22px rgba(255, 198, 120, 0.28);
}
.gg-merchant-head-right { display: flex; align-items: center; gap: 10px; }
.gg-merchant-balance {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 12px;
  background: var(--gg-chip, rgba(6, 10, 16, 0.55));
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 6px;
  white-space: nowrap;
}
.gg-merchant-balance .lbl {
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-merchant-balance .val {
  font-size: 19px;
  font-weight: 800;
  color: var(--gg-gold, #ffd35e);
  font-variant-numeric: tabular-nums;
}
.gg-merchant-close {
  appearance: none;
  padding: 7px 13px;
  font: inherit;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--gg-text, #dbe6f5);
  background: #101a2b;
  border: 1px solid #2b3d5c;
  border-radius: 7px;
  cursor: pointer;
}
.gg-merchant-close:hover { border-color: var(--gg-gold, #ffd35e); }
.gg-merchant-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--gg-line, #24334d);
  margin-bottom: 12px;
}
.gg-merchant-tab {
  appearance: none;
  padding: 8px 14px 7px;
  font: inherit;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--gg-text-dim, #8fa1b8);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
}
.gg-merchant-tab:hover { color: #ffe7c2; }
.gg-merchant-tab.active {
  color: var(--gg-gold, #ffd35e);
  border-bottom-color: var(--gg-gold, #ffd35e);
}
.gg-merchant-attach {
  display: none;
  margin: -2px 0 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #ffc87a;
}
.gg-merchant-scroll {
  overflow-y: auto;
  min-height: 0;
  flex: 1 1 auto;
  padding-right: 4px;
}
.gg-merchant-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 640px) {
  .gg-merchant-grid { grid-template-columns: 1fr; }
}
.gg-merchant-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 11px 12px 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 8px;
  min-width: 0;
}
.gg-merchant-card.owned { border-color: rgba(255, 211, 94, 0.45); }
.gg-merchant-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.gg-merchant-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #3a4b66;
  border-radius: 6px;
  background: #0b1322;
  color: #ffd9a0;
  font-size: 16px;
  line-height: 1;
}
.gg-merchant-name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--gg-text, #dbe6f5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gg-merchant-badge {
  flex-shrink: 0;
  padding: 2px 5px;
  border: 1px solid rgba(255, 211, 94, 0.55);
  border-radius: 4px;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: var(--gg-gold, #ffd35e);
  background: rgba(255, 211, 94, 0.1);
}
.gg-merchant-desc {
  font-size: 11px;
  line-height: 1.4;
  color: var(--gg-text-dim, #8fa1b8);
  min-height: 2.8em;
}
.gg-merchant-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 3px;
}
.gg-merchant-stock {
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #8fa1b8;
  white-space: nowrap;
}
.gg-merchant-stock.out { color: #ff6b5e; }
.gg-merchant-price {
  font-size: 16px;
  font-weight: 800;
  color: var(--gg-gold, #ffd35e);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.gg-merchant-price.poor { color: #ff6b5e; }
.gg-merchant-buy {
  appearance: none;
  min-width: 92px;
  padding: 7px 11px;
  font: inherit;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #fff;
  background: linear-gradient(180deg, #9a6a2c, #6f4718);
  border: 1px solid #c8944a;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.gg-merchant-buy:hover:enabled { background: linear-gradient(180deg, #b98033, #83561d); }
.gg-merchant-buy:disabled {
  opacity: 0.4;
  cursor: default;
  background: #101a2b;
  border-color: #2b3d5c;
}
.gg-merchant-buy.owned {
  opacity: 1;
  color: var(--gg-gold, #ffd35e);
  background: rgba(255, 211, 94, 0.12);
  border-color: rgba(255, 211, 94, 0.55);
}
.gg-merchant-status {
  margin-top: 10px;
  min-height: 16px;
  font-size: 11.5px;
  line-height: 1.4;
  text-align: center;
  color: #ffd9a0;
}
.gg-merchant-hint {
  margin: 4px 0 0;
  text-align: center;
  font-size: 10.5px;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-merchant-prompt, .gg-merchant-toast {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  display: none;
  pointer-events: none;
  padding: 6px 14px;
  border-radius: 6px;
  background: rgba(8, 12, 18, 0.86);
  border: 1px solid rgba(255, 198, 120, 0.6);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
  color: #ffe7c2;
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
}
.gg-merchant-prompt { bottom: calc(96px + var(--gg-weapon-bar-bottom, 0px)); }
.gg-merchant-toast { bottom: calc(132px + var(--gg-weapon-bar-bottom, 0px)); color: #ffd35e; }
`;

// --- small helpers ------------------------------------------------------------

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

function fmtInt(n) {
  return String(Math.max(0, Math.round(Number(n) || 0)));
}

function tintGeo(geo, color) {
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

function pushBox(bucket, sx, sy, sz, x, y, z, hex) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  geo.translate(x, y, z);
  bucket.push(tintGeo(geo, new THREE.Color(hex)));
}

function colliderOf(x, z, sx, sz) {
  return {
    minX: x - sx / 2,
    maxX: x + sx / 2,
    minZ: z - sz / 2,
    maxZ: z + sz / 2,
  };
}

/** Two-line canvas nameplate; returns null without a 2D canvas (headless). */
function makeNameplateTexture() {
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  if (typeof canvas.getContext !== "function") return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, 512, 160);
  ctx.fillStyle = "rgba(8, 12, 18, 0.82)";
  ctx.fillRect(16, 18, 480, 124);
  ctx.strokeStyle = "rgba(255, 198, 120, 0.65)";
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 18, 480, 124);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 40px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = "#ffe7c2";
  ctx.fillText("THƯƠNG LÁI", 256, 62);
  ctx.font = "600 26px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = "#ffc87a";
  ctx.fillText("THE TRADER", 256, 108);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// --- factory ------------------------------------------------------------------

/**
 * @param {HTMLElement} uiRoot
 * @param {EventTarget} bus
 * @param {import("../systems/merchant.js").Merchant} merchant
 * @param {{t: Function, registerBundle: Function}} i18n
 * @param {import("three").Camera} camera
 * @param {import("../player/controller.js").Player} player
 * @param {import("three").Scene=} scene
 * @param {import("../world/level.js").Level=} level
 */
export function createMerchantUI(uiRoot, bus, merchant, i18n, camera, player, scene, level) {
  if (!uiRoot || typeof uiRoot.appendChild !== "function") {
    throw new Error("createMerchantUI: container (#ui) is required");
  }
  if (!bus || typeof bus.addEventListener !== "function") {
    throw new Error("createMerchantUI: bus is required");
  }
  // `camera` is part of the frozen wiring signature; the world nameplate is a
  // Sprite and the prompt is screen-space, so no per-frame camera math is
  // needed here.
  void camera;
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(MERCHANT_BUNDLE);
  }
  const tr = (key, params) =>
    i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;

  if (typeof document !== "undefined" && !document.getElementById("gg-merchant-style")) {
    const style = document.createElement("style");
    style.id = "gg-merchant-style";
    style.textContent = MERCHANT_CSS;
    if (document.head && typeof document.head.appendChild === "function") {
      document.head.appendChild(style);
    }
  }

  const hasScene = !!(scene && typeof scene.add === "function");
  const hasDOM = typeof document !== "undefined";

  // --- anchor + world ---------------------------------------------------------
  const BASE = { x: -60, z: 4 };
  const OFFSETS = [
    [0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [3, 0], [-3, 0], [0, 3],
    [0, -3], [4, 0], [-4, 0], [0, 4], [0, -4], [5, 0], [-5, 0], [5, 3],
    [-5, -3], [3, 5], [-3, -5],
  ];

  function blocked(x, z, r) {
    return !!(
      level &&
      typeof level.isBlocked === "function" &&
      level.isBlocked(x, z, r)
    );
  }

  /**
   * The anchor is free when the 1.2 m trader circle AND the table/crate
   * footprints are clear. Nearby offsets are tried in a fixed order so a
   * blocked hardcoded spot degrades to a deterministic neighbour.
   */
  function findAnchor() {
    for (let i = 0; i < OFFSETS.length; i++) {
      const x = BASE.x + OFFSETS[i][0];
      const z = BASE.z + OFFSETS[i][1];
      if (blocked(x, z, 1.2)) continue;
      if (blocked(x - 1.0, z, 1.0)) continue; // table
      if (blocked(x - 0.7, z + 1.25, 0.7)) continue; // crate A
      if (blocked(x - 0.7, z - 1.25, 0.7)) continue; // crate B
      if (blocked(x + 0.75, z, 0.9)) continue; // trader stand
      return { x, z };
    }
    console.warn(
      "[merchant] no clear anchor near the Safehouse — using (" +
        BASE.x + ", " + BASE.z + ")"
    );
    return { x: BASE.x, z: BASE.z };
  }

  const anchor = findAnchor();
  /** Trader stand (behind the table, 1 m east of the anchor). */
  const traderPos = { x: anchor.x + 0.75, z: anchor.z };

  function pushCollider(x, z, sx, sz) {
    if (!level || !Array.isArray(level.colliders)) return;
    level.colliders.push(colliderOf(x, z, sx, sz));
  }

  // Table (1.6 × 0.8) + two crates (0.8 × 0.8) — the only stall colliders.
  pushCollider(anchor.x - 1.0, anchor.z, 1.6, 0.8);
  pushCollider(anchor.x - 0.7, anchor.z + 1.25, 0.8, 0.8);
  pushCollider(anchor.x - 0.7, anchor.z - 1.25, 0.8, 0.8);

  let traderGroup = null;
  let nameplate = null;
  let nameVisible = false;

  if (hasScene) {
    const stallMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.03,
    });
    const traderMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.02,
    });
    const lanternMat = new THREE.MeshBasicMaterial({
      color: 0xffb867,
      toneMapped: false,
      fog: true,
    });

    // -- stall (ONE merged mesh) ---------------------------------------------
    const stallGeos = [];
    const tx = anchor.x - 1.0;
    // table top + front panel + 4 legs
    pushBox(stallGeos, 1.6, 0.08, 0.8, tx, 0.92, anchor.z, 0x5a432c);
    pushBox(stallGeos, 1.52, 0.46, 0.06, tx, 0.66, anchor.z - 0.37, 0x47341f);
    for (const sx of [-0.72, 0.72]) {
      for (const sz of [-0.32, 0.32]) {
        pushBox(stallGeos, 0.08, 0.9, 0.08, tx + sx, 0.45, anchor.z + sz, 0x37281a);
      }
    }
    // wares on the counter (reads as guns + an ammo box)
    pushBox(stallGeos, 0.52, 0.09, 0.1, tx - 0.25, 1.01, anchor.z + 0.2, 0x23272d);
    pushBox(stallGeos, 0.18, 0.1, 0.12, tx - 0.55, 1.01, anchor.z + 0.05, 0x3a3230);
    pushBox(stallGeos, 0.28, 0.14, 0.18, tx + 0.35, 1.03, anchor.z - 0.16, 0x4d5334);
    // canopy poles
    for (const sx of [-0.92, 0.92]) {
      for (const sz of [-1.08, 1.08]) {
        pushBox(stallGeos, 0.07, 2.3, 0.07, anchor.x + sx, 1.15, anchor.z + sz, 0x3a2f24);
      }
    }
    // tarp canopy + front valance
    pushBox(stallGeos, 2.35, 0.06, 2.35, anchor.x, 2.34, anchor.z, 0x7a3f34);
    pushBox(stallGeos, 2.35, 0.22, 0.05, anchor.x - 0.92, 2.2, anchor.z, 0x6b352b);
    // crates
    for (const dz of [-1.25, 1.25]) {
      const cx = anchor.x - 0.7;
      const cz = anchor.z + dz;
      pushBox(stallGeos, 0.74, 0.74, 0.74, cx, 0.37, cz, 0x6b5232);
      pushBox(stallGeos, 0.8, 0.07, 0.8, cx, 0.74, cz, 0x3a2c1b);
    }
    pushBox(stallGeos, 0.52, 0.52, 0.52, anchor.x - 0.7, 1.04, anchor.z + 1.3, 0x755a38);

    const mergedStall = mergeGeometries(stallGeos, false);
    for (let i = 0; i < stallGeos.length; i++) stallGeos[i].dispose();
    if (mergedStall) {
      const stall = new THREE.Mesh(mergedStall, stallMat);
      stall.name = "merchant-stall";
      stall.castShadow = true;
      stall.receiveShadow = true;
      stall.userData.solid = true;
      scene.add(stall);
    }

    // -- trader (ONE merged body + ONE emissive lantern) ----------------------
    const bodyGeos = [];
    const COAT = 0x4a3b2a;
    const COAT_DARK = 0x36291c;
    const HOOD = 0x2d2419;
    const SKIN = 0xb98b66;
    const PANTS = 0x2c2a25;
    for (const sx of [-0.12, 0.12]) {
      pushBox(bodyGeos, 0.18, 0.82, 0.22, sx, 0.41, 0, PANTS);
      pushBox(bodyGeos, 0.2, 0.12, 0.28, sx, 0.06, -0.03, 0x1f1a14);
    }
    pushBox(bodyGeos, 0.56, 0.5, 0.34, 0, 0.92, 0, COAT);
    pushBox(bodyGeos, 0.6, 0.06, 0.37, 0, 0.69, 0, COAT_DARK);
    pushBox(bodyGeos, 0.48, 0.5, 0.3, 0, 1.32, 0, COAT);
    pushBox(bodyGeos, 0.64, 0.13, 0.36, 0, 1.55, 0, COAT_DARK);
    pushBox(bodyGeos, 0.5, 0.09, 0.33, 0, 0.99, 0, 0x241c13);
    for (const sx of [-0.36, 0.36]) {
      pushBox(bodyGeos, 0.14, 0.5, 0.17, sx, 1.3, 0, COAT);
      pushBox(bodyGeos, 0.11, 0.12, 0.13, sx, 1.03, -0.02, SKIN);
    }
    pushBox(bodyGeos, 0.24, 0.27, 0.23, 0, 1.73, -0.02, SKIN);
    pushBox(bodyGeos, 0.34, 0.32, 0.3, 0, 1.78, 0.05, HOOD);
    pushBox(bodyGeos, 0.3, 0.1, 0.3, 0, 1.93, 0.02, HOOD);
    for (const sx of [-0.16, 0.16]) {
      pushBox(bodyGeos, 0.07, 0.32, 0.3, sx, 1.76, 0.03, HOOD);
    }
    pushBox(bodyGeos, 0.3, 0.08, 0.24, 0, 1.6, -0.11, 0x6b5a3e); // scarf

    const mergedBody = mergeGeometries(bodyGeos, false);
    for (let i = 0; i < bodyGeos.length; i++) bodyGeos[i].dispose();
    traderGroup = new THREE.Group();
    traderGroup.name = "merchant-trader";
    traderGroup.position.set(traderPos.x, 0, traderPos.z);
    traderGroup.rotation.y = Math.PI / 2; // face west, toward the approach
    if (mergedBody) {
      const body = new THREE.Mesh(mergedBody, traderMat);
      body.castShadow = true;
      body.receiveShadow = true;
      traderGroup.add(body);
    }
    const lantern = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.24, 0.16),
      lanternMat
    );
    lantern.name = "merchant-lantern";
    lantern.position.set(0.4, 0.92, -0.2);
    traderGroup.add(lantern);
    scene.add(traderGroup);

    // -- canvas nameplate sprite ---------------------------------------------
    const tex = makeNameplateTexture();
    if (tex) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        fog: false,
      });
      nameplate = new THREE.Sprite(mat);
      nameplate.name = "merchant-nameplate";
      nameplate.renderOrder = 6;
      nameplate.position.set(traderPos.x, 2.62, traderPos.z);
      nameplate.scale.set(3.3, 1.03, 1);
      nameplate.visible = false;
      scene.add(nameplate);
    }
  }

  // --- DOM: proximity prompt + toast ------------------------------------------
  const prompt = css(make("div", "gg-merchant-prompt", uiRoot), {
    display: "none",
  });
  prompt.textContent = tr("merchantPrompt");
  const toast = css(make("div", "gg-merchant-toast", uiRoot), {
    display: "none",
  });
  toast.textContent = tr("merchantNoTrader");

  // --- DOM: overlay -----------------------------------------------------------
  const overlay = make("div", "gg-merchant-overlay hidden", uiRoot);
  if (typeof overlay.setAttribute === "function") {
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
  }
  const panel = make("div", "gg-merchant-panel", overlay);

  const head = make("div", "gg-merchant-head", panel);
  const title = make("h2", "gg-merchant-title", head);
  const headRight = make("div", "gg-merchant-head-right", head);
  const balance = make("div", "gg-merchant-balance", headRight);
  const balanceLbl = make("span", "lbl", balance);
  const balanceVal = make("span", "val", balance);
  balanceVal.textContent = "$0";
  const closeBtn = make("button", "gg-merchant-close", headRight);
  closeBtn.type = "button";

  const tabsBar = make("div", "gg-merchant-tabs", panel);
  const TABS = [
    { id: "weapons", kind: "weapon", labelKey: "merchantTabWeapons" },
    { id: "explosives", kind: "explosive", labelKey: "merchantTabExplosives" },
    { id: "gear", kind: "gear", labelKey: "merchantTabGear" },
    { id: "attachments", kind: "attachment", labelKey: "merchantTabAttachments" },
  ];
  /** @type {Record<string, HTMLElement>} */
  const tabButtons = {};
  for (let i = 0; i < TABS.length; i++) {
    const t = TABS[i];
    const btn = make("button", "gg-merchant-tab", tabsBar);
    btn.type = "button";
    btn.textContent = tr(t.labelKey);
    if (typeof btn.setAttribute === "function") {
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", "false");
    }
    btn.addEventListener("click", () => setTab(t.id));
    tabButtons[t.id] = btn;
  }

  const attachFor = make("div", "gg-merchant-attach", panel);
  const scroll = make("div", "gg-merchant-scroll", panel);
  const grid = make("div", "gg-merchant-grid", scroll);
  const status = make("div", "gg-merchant-status", panel);
  status.textContent = "";
  const hint = make("p", "gg-merchant-hint", panel);

  const catalog = merchant && Array.isArray(merchant.catalog) ? merchant.catalog : [];
  /** @type {Array<{entry: Object, root: HTMLElement, name: HTMLElement, desc: HTMLElement, badge: HTMLElement, stock: HTMLElement, price: HTMLElement, btn: HTMLButtonElement}>} */
  const cards = [];

  /** "frag_pack" → "FragPack", "scope" → "Scope" (bundle key stem). */
  function pascal(s) {
    const parts = String(s).split(/[^A-Za-z0-9]+/).filter(Boolean);
    let out = "";
    for (let i = 0; i < parts.length; i++) {
      out += parts[i].charAt(0).toUpperCase() + parts[i].slice(1);
    }
    return out;
  }

  const WEAPON_NAME_KEYS = {
    pistol: "merchantWeaponPistol",
    shotgun: "merchantWeaponShotgun",
    rifle: "merchantWeaponRifle",
    smg: "merchantWeaponSmg",
    sniper: "merchantWeaponSniper",
    minigun: "merchantWeaponMinigun",
    grenade: "merchantWeaponGrenade",
    magnum: "merchantWeaponMagnum",
    dmr: "merchantWeaponDmr",
    railgun: "merchantWeaponRailgun",
    sawnoff: "merchantWeaponSawnoff",
    crossbow: "merchantWeaponCrossbow",
  };

  /** Localized weapon name (falls back to the raw id). */
  function weaponName(name) {
    const key = WEAPON_NAME_KEYS[name];
    return key ? tr(key) : String(name || "");
  }

  /** Bundle key stem: attachment entries use entry.attachment, not "att:x". */
  function stemOf(entry) {
    return entry && entry.kind === "attachment" && entry.attachment
      ? entry.attachment
      : entry.id;
  }

  function itemKey(entry) {
    return "merchantItem" + pascal(stemOf(entry));
  }

  function descKey(entry) {
    return "merchantDesc" + pascal(stemOf(entry));
  }

  function tabOfKind(kind) {
    if (kind === "weapon") return "weapons";
    if (kind === "explosive") return "explosives";
    if (kind === "attachment") return "attachments";
    return "gear";
  }

  for (let i = 0; i < catalog.length; i++) {
    const entry = catalog[i];
    if (!entry || typeof entry.id !== "string") continue;
    const root = make("div", "gg-merchant-card", grid);
    const top = make("div", "gg-merchant-card-top", root);
    const icon = make("span", "gg-merchant-icon", top);
    icon.textContent = ITEM_ICONS[entry.attachment || entry.id] || "•";
    const name = make("span", "gg-merchant-name", top);
    const badge = make("span", "gg-merchant-badge", top);
    const desc = make("div", "gg-merchant-desc", root);
    const foot = make("div", "gg-merchant-foot", root);
    const stock = make("span", "gg-merchant-stock", foot);
    const price = make("span", "gg-merchant-price", foot);
    const btn = /** @type {HTMLButtonElement} */ (make("button", "gg-merchant-buy", foot));
    btn.type = "button";
    btn.addEventListener("click", () => {
      const result = merchant.buy(entry.id);
      if (result && result.ok) {
        const state = merchant.state();
        const item = state.entries.find((e) => e.id === entry.id);
        lastStatus = {
          entry,
          effect: result.effect,
          name: item ? item.id : entry.id,
        };
      } else {
        lastStatus = { entry, reason: result ? result.reason : "unknown" };
      }
      refresh();
      if (typeof btn.blur === "function") btn.blur();
    });
    const card = { entry, root, name, desc, badge, stock, price, btn };
    cards.push(card);
    // Name/desc text (live language switch re-runs applyTexts).
    name.textContent = tr(itemKey(entry));
    desc.textContent = tr(descKey(entry));
  }

  // --- state ------------------------------------------------------------------
  let openFlag = false;
  let lastState = null;
  let shopOpen = false;
  let helpOpen = false;
  let toastTimer = 0;
  let activeTab = "weapons";
  /** @type {{entry: Object, effect?: Object, reason?: string, name?: string}|null} */
  let lastStatus = null;

  function stateNow() {
    return merchant && typeof merchant.state === "function"
      ? merchant.state()
      : { money: 0, wave: 0, activeWeapon: null, entries: [] };
  }

  /** Attachment target line ("FITS: <active gun>"), visible on its tab only. */
  function refreshAttachFor(st) {
    const state = st || stateNow();
    const name = state.activeWeapon ? weaponName(state.activeWeapon) : "—";
    attachFor.textContent = tr("merchantAttachFor", { weapon: name });
    attachFor.style.display = activeTab === "attachments" ? "block" : "none";
  }

  function setTab(id) {
    activeTab = id;
    for (let i = 0; i < TABS.length; i++) {
      const btn = tabButtons[TABS[i].id];
      const on = TABS[i].id === id;
      btn.classList.toggle("active", on);
      if (typeof btn.setAttribute === "function") {
        btn.setAttribute("aria-selected", on ? "true" : "false");
      }
    }
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const show = tabOfKind(card.entry.kind) === id;
      card.root.style.display = show ? "flex" : "none";
    }
    refreshAttachFor();
  }

  function reasonLabel(reason) {
    if (reason === "no-money") return tr("merchantNoMoney");
    if (reason === "owned") return tr("merchantOwned");
    if (reason === "no-stock") return tr("merchantSoldOut");
    if (reason === "need-crossbow") return tr("merchantNeedCrossbow");
    if (reason === "dead") return tr("merchantDead");
    return tr("merchantBuy");
  }

  function describeStatus() {
    if (!lastStatus) return "";
    const entry = lastStatus.entry;
    if (lastStatus.reason) return reasonLabel(lastStatus.reason);
    const effect = lastStatus.effect || { type: "none" };
    if (entry.id === "mystery_crate") {
      if (effect.type === "money") {
        return tr("merchantEffectMoney", { amount: fmtInt(effect.amount) });
      }
      if (effect.type === "armor") {
        return tr("merchantEffectArmor", { amount: fmtInt(effect.amount) });
      }
      if (effect.type === "ammo") return tr("merchantEffectAmmo");
      if (effect.type === "throwable") {
        return tr("merchantEffectFrag", { count: fmtInt(effect.count) });
      }
    }
    if (entry.id === "stim_shot") {
      return tr("merchantEffectStim", {
        heal: fmtInt(effect.heal),
        time: fmtInt(effect.time),
      });
    }
    if (effect.type === "attachment") {
      return tr("merchantAttachApplied", {
        name: tr(itemKey(entry)),
        weapon: weaponName(effect.weapon),
      });
    }
    return tr("merchantPurchased", {
      name: tr(itemKey(entry)),
    });
  }

  /** Rebuild dynamic labels/affordability from merchant.state(). */
  function refresh() {
    const st = stateNow();
    balanceVal.textContent = "$" + fmtInt(st.money);
    refreshAttachFor(st);
    const byId = Object.create(null);
    for (let i = 0; i < st.entries.length; i++) byId[st.entries[i].id] = st.entries[i];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const e = byId[card.entry.id];
      if (!e) continue;
      card.root.classList.toggle("owned", e.owned === true);
      card.btn.classList.toggle("owned", e.owned === true);
      card.badge.textContent = e.deal
        ? tr("merchantDeal")
        : e.owned
          ? tr("merchantOwned")
          : "";
      card.badge.style.display = card.badge.textContent ? "inline-block" : "none";
      card.stock.textContent = e.owned
        ? tr("merchantOwned")
        : tr("merchantStock", { n: fmtInt(e.stock), max: fmtInt(e.maxStock) });
      card.stock.classList.toggle("out", e.stock <= 0 && !e.owned);
      card.price.textContent = "$" + fmtInt(e.price);
      card.price.classList.toggle("poor", e.reason === "no-money");
      card.btn.disabled = e.reason !== null;
      card.btn.textContent = e.reason ? reasonLabel(e.reason) : tr("merchantBuy");
    }
    status.textContent = describeStatus();
    // The visible tab is preserved across refreshes (only texts change).
  }

  function applyTexts() {
    title.textContent = tr("merchantTitle");
    balanceLbl.textContent = tr("merchantCash");
    closeBtn.textContent = tr("merchantClose");
    prompt.textContent = tr("merchantPrompt");
    toast.textContent = tr("merchantNoTrader");
    hint.textContent = tr("merchantCloseHint");
    for (let i = 0; i < TABS.length; i++) {
      tabButtons[TABS[i].id].textContent = tr(TABS[i].labelKey);
    }
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      card.name.textContent = tr(itemKey(card.entry));
      card.desc.textContent = tr(descKey(card.entry));
    }
    refresh();
  }

  // --- open / close -----------------------------------------------------------
  function hidePrompt() {
    prompt.style.display = "none";
  }

  function open() {
    if (openFlag) return;
    if (lastState !== "playing") return;
    openFlag = true;
    hidePrompt();
    // Release the pointer AFTER "merchant-open": gamestate adds the pause
    // reason synchronously, so the async pointerlockchange "pause-toggle"
    // lands on an already-paused run and cannot strand a "user" reason.
    bus.dispatchEvent(new CustomEvent("merchant-open"));
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
    overlay.classList.remove("hidden");
    refresh();
  }

  function close() {
    if (!openFlag) return;
    openFlag = false;
    overlay.classList.add("hidden");
    hidePrompt();
    const act = typeof document !== "undefined" ? document.activeElement : null;
    if (act && typeof act.blur === "function" && act !== document.body) act.blur();
    bus.dispatchEvent(new CustomEvent("merchant-closed"));
  }

  // --- proximity + frame update ----------------------------------------------
  function distanceToTrader(pos) {
    const p = pos || (player && player.position);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return Infinity;
    const dx = p.x - traderPos.x;
    const dz = p.z - traderPos.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function update(dt, playerPos) {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (toastTimer > 0) {
      toastTimer -= step;
      if (toastTimer <= 0) {
        toastTimer = 0;
        toast.style.display = "none";
      }
    }

    const playing = lastState === "playing";
    const dist = distanceToTrader(playerPos);
    const near = playing && dist <= 4.5;
    const promptOn = near && !openFlag && !shopOpen && !helpOpen;
    prompt.style.display = promptOn ? "block" : "none";

    const nameOn = playing && dist <= 24;
    if (nameplate && nameOn !== nameVisible) {
      nameVisible = nameOn;
      nameplate.visible = nameOn;
    }
  }

  function showNoTraderToast() {
    toast.style.display = "block";
    toastTimer = 2;
  }

  // --- DOM events -------------------------------------------------------------
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e && e.target === overlay) close();
  });
  setTab(activeTab);

  // --- bus --------------------------------------------------------------------
  bus.addEventListener("state-changed", (e) => {
    const st = e && e.detail ? e.detail.state : null;
    if (!st) return;
    lastState = st;
    if (
      openFlag &&
      (st === "menu" || st === "gameover" || st === "intro")
    ) {
      close(); // paired "merchant-closed": no orphan pause reason
    }
    if (st !== "playing") hidePrompt();
    if (st !== "playing" && nameplate && nameVisible) {
      nameVisible = false;
      nameplate.visible = false;
    }
  });

  bus.addEventListener("shop-open", () => {
    shopOpen = true;
    if (openFlag) close();
  });
  bus.addEventListener("shop-closed", () => {
    shopOpen = false;
  });
  bus.addEventListener("help-open", () => {
    helpOpen = true;
    if (openFlag) close();
  });
  bus.addEventListener("help-closed", () => {
    helpOpen = false;
  });

  bus.addEventListener("money-changed", () => {
    if (openFlag) refresh();
  });
  bus.addEventListener("merchant-purchase", () => {
    if (openFlag) refresh();
  });
  // Attachments are per active weapon: refresh the OWNED state when the gun
  // changes (or a part is fitted outside the buy flow) while the overlay is up.
  bus.addEventListener("weapon-switched", () => {
    if (openFlag) refresh();
  });
  bus.addEventListener("attachment-bought", () => {
    if (openFlag) refresh();
  });
  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail ? e.detail.patch : null;
    if (patch && Object.prototype.hasOwnProperty.call(patch, "lang")) {
      applyTexts();
    }
  });

  // G opens/closes; Esc closes (capture phase so input.js never pauses the
  // run on the same press). G farther than 4.5 m → the 2 s "find the trader"
  // toast. Repeats are ignored.
  function onKeyDown(e) {
    if (!e || e.repeat) return;
    if (e.code === "KeyG") {
      if (openFlag) {
        if (typeof e.preventDefault === "function") e.preventDefault();
        close();
        return;
      }
      if (lastState !== "playing" || shopOpen || helpOpen) return;
      const dist = distanceToTrader(player && player.position);
      if (dist <= 4.5) {
        if (typeof e.preventDefault === "function") e.preventDefault();
        open();
      } else {
        showNoTraderToast();
      }
      return;
    }
    if (openFlag && e.code === "Escape") {
      if (typeof e.preventDefault === "function") e.preventDefault();
      if (typeof e.stopImmediatePropagation === "function") {
        e.stopImmediatePropagation();
      }
      if (typeof e.stopPropagation === "function") e.stopPropagation();
      close();
    }
  }
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("keydown", onKeyDown, true);
  }

  applyTexts();
  setTab(activeTab);

  return {
    update,
    isOpen: () => openFlag,
    open,
    close,
  };
}
