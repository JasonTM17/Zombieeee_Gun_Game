/**
 * ============================================================================
 * CONTRACT BOARD — physical side-job board at the Safehouse + modal overlay.
 * ============================================================================
 * createContractsUI(uiRoot, bus, contracts, i18n, camera, player, scene, level)
 *   → { update(dt, playerPos), isOpen(), open(), close() }
 *
 * WORLD PROP
 * - Low-poly wooden notice board anchored at (−52, 12) beside the Safehouse
 *   trader. Nearby offsets are tried in a fixed order until
 *   `level.isBlocked(x, z, 1.0)` and both post footprints are clear, so a
 *   blocked hardcoded spot degrades deterministically.
 * - Two 0.3 × 0.3 post colliders only (the board itself is walk-through), set
 *   2.3 m apart so the inner lane is exactly 2 m. The three pinned paper
 *   quads use a warm emissive cream material. One canvas Sprite nameplate
 *   ("BẢNG HỢP ĐỒNG / CONTRACTS"). No PointLight, no new shadow map.
 * - Draw calls: 1 merged wood mesh + 3 paper quads + 1 sprite = 5.
 *
 * INTERACTION
 * - Within 3.5 m a bottom-centre prompt appears ("T — CONTRACTS" EN /
 *   "T — HỢP ĐỒNG" VI). Pressing T opens the board; pressing T farther away
 *   shows a 2 s toast. Auto-repeat is ignored. Only from state "playing" and
 *   never while the shop / help / merchant / perks / map overlays are open
 *   (tracked through their bus open/close events).
 * - Open: emit "contracts-open" FIRST, then release pointer lock. main.js
 *   freezes the run with gamestate.addPause("contracts") on that event.
 * - Close (T / Esc / backdrop / CLOSE): hide + emit "contracts-closed". The
 *   pointer is not re-locked here; the next canvas click restores it.
 *
 * OVERLAY
 * - Header CONTRACT BOARD + CASH; exactly the board's 3 active contracts, each
 *   with title, description, progress bar, "$REWARD", "XP n" and an
 *   IN PROGRESS / COMPLETED status chip. Rewards auto-pay in the system
 *   module, so there is no claim button. All text is EN/VI through the
 *   module's own i18n bundle and re-renders on a live language switch.
 * - The overlay is informational: CLOSE (or T/Esc/backdrop) dismisses it.
 *
 * @param {HTMLElement} uiRoot - the #ui element
 * @param {EventTarget} bus
 * @param {import("../systems/contracts.js").Contracts} contracts
 * @param {{t: Function, registerBundle?: Function}} i18n
 * @param {import("three").Camera} camera - unused (world nameplate is a Sprite)
 * @param {{position: {x: number, z: number}}} player
 * @param {import("three").Scene=} scene - omit for a DOM-only build
 * @param {import("../world/level.js").Level=} level - isBlocked + colliders
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CONTRACTS_BUNDLE } from "../systems/contracts.js";

/** UI strings (the contract titles/descriptions live in systems/contracts.js). */
export const CONTRACTS_UI_BUNDLE = {
  en: {
    contractsTitle: "CONTRACT BOARD",
    contractsCash: "CASH",
    contractsClose: "CLOSE",
    contractsCloseHint: "T / ESC — close",
    contractsPrompt: "T — CONTRACTS",
    contractsNoBoard: "The Contract Board is at the Safehouse",
    contractsInProgress: "IN PROGRESS",
    contractsCompleted: "COMPLETED",
    contractsXp: "XP",
    contractsProgress: "{n}/{need}",
  },
  vi: {
    contractsTitle: "BẢNG HỢP ĐỒNG",
    contractsCash: "TIỀN",
    contractsClose: "ĐÓNG",
    contractsCloseHint: "T / ESC — đóng",
    contractsPrompt: "T — HỢP ĐỒNG",
    contractsNoBoard: "Bảng hợp đồng ở An Toàn Nhà",
    contractsInProgress: "ĐANG LÀM",
    contractsCompleted: "HOÀN THÀNH",
    contractsXp: "XP",
    contractsProgress: "{n}/{need}",
  },
};

const CONTRACTS_CSS = `
.gg-contracts-overlay {
  position: absolute;
  inset: 0;
  z-index: 46;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, rgba(5, 8, 14, 0.55) 0%, rgba(2, 4, 8, 0.88) 100%);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  pointer-events: auto;
  font-family: "Segoe UI", system-ui, sans-serif;
}
.gg-contracts-overlay.hidden { display: none; }
.gg-contracts-panel {
  width: min(660px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: var(--gg-panel, rgba(9, 13, 21, 0.94));
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 12px;
  padding: 22px 24px 16px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.62), inset 0 0 0 1px rgba(255, 198, 120, 0.05);
}
.gg-contracts-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.gg-contracts-title {
  margin: 0;
  font-size: 25px;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: #ffe7c2;
  text-shadow: 0 0 22px rgba(255, 198, 120, 0.28);
}
.gg-contracts-head-right { display: flex; align-items: center; gap: 10px; }
.gg-contracts-balance {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 12px;
  background: var(--gg-chip, rgba(6, 10, 16, 0.55));
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 6px;
  white-space: nowrap;
}
.gg-contracts-balance .lbl {
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-contracts-balance .val {
  font-size: 19px;
  font-weight: 800;
  color: var(--gg-gold, #ffd35e);
  font-variant-numeric: tabular-nums;
}
.gg-contracts-close {
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
.gg-contracts-close:hover { border-color: var(--gg-gold, #ffd35e); }
.gg-contracts-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  overflow-y: auto;
  min-height: 0;
  flex: 1 1 auto;
  padding-right: 4px;
}
.gg-contracts-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 13px 11px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 8px;
}
.gg-contracts-card.complete {
  border-color: rgba(120, 220, 150, 0.46);
  background: rgba(120, 220, 150, 0.05);
}
.gg-contracts-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}
.gg-contracts-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--gg-text, #dbe6f5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gg-contracts-status {
  flex-shrink: 0;
  padding: 2px 7px;
  border: 1px solid rgba(255, 211, 94, 0.5);
  border-radius: 4px;
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--gg-gold, #ffd35e);
  background: rgba(255, 211, 94, 0.1);
}
.gg-contracts-card.complete .gg-contracts-status {
  color: #9ff0b8;
  border-color: rgba(120, 220, 150, 0.55);
  background: rgba(120, 220, 150, 0.1);
}
.gg-contracts-desc {
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-contracts-bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.gg-contracts-fill {
  height: 100%;
  width: 0%;
  border-radius: 3px;
  background: linear-gradient(90deg, #9a6a2c, #ffd35e);
  transition: width 120ms linear;
}
.gg-contracts-card.complete .gg-contracts-fill {
  background: linear-gradient(90deg, #3a8a52, #9ff0b8);
}
.gg-contracts-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}
.gg-contracts-progress { color: var(--gg-text-dim, #8fa1b8); letter-spacing: 0.08em; }
.gg-contracts-reward {
  margin-left: auto;
  font-size: 15px;
  font-weight: 800;
  color: var(--gg-gold, #ffd35e);
  white-space: nowrap;
}
.gg-contracts-xp {
  color: #9fc4ff;
  font-weight: 700;
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.gg-contracts-hint {
  margin: 10px 0 0;
  text-align: center;
  font-size: 10.5px;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-contracts-prompt, .gg-contracts-toast {
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
.gg-contracts-prompt { bottom: calc(96px + var(--gg-weapon-bar-bottom, 0px)); }
.gg-contracts-toast { bottom: calc(132px + var(--gg-weapon-bar-bottom, 0px)); color: #ffd35e; }
`;

// --- small helpers -----------------------------------------------------------

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

/** Two-line bilingual nameplate; null without a 2D canvas (headless). */
function makeBoardTexture() {
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
  ctx.fillStyle = "rgba(8, 12, 18, 0.84)";
  ctx.fillRect(14, 16, 484, 128);
  ctx.strokeStyle = "rgba(255, 198, 120, 0.65)";
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 16, 484, 128);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 38px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = "#ffe7c2";
  ctx.fillText("BẢNG HỢP ĐỒNG", 256, 61);
  ctx.font = "600 27px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = "#ffc87a";
  ctx.fillText("CONTRACTS", 256, 108);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// --- factory -----------------------------------------------------------------

/**
 * @param {HTMLElement} uiRoot
 * @param {EventTarget} bus
 * @param {import("../systems/contracts.js").Contracts} contracts
 * @param {{t: Function, registerBundle?: Function}} i18n
 * @param {import("three").Camera} camera
 * @param {{position: {x: number, z: number}}} player
 * @param {import("three").Scene=} scene
 * @param {import("../world/level.js").Level=} level
 */
export function createContractsUI(uiRoot, bus, contracts, i18n, camera, player, scene, level) {
  if (!uiRoot || typeof uiRoot.appendChild !== "function") {
    throw new Error("createContractsUI: container (#ui) is required");
  }
  if (!bus || typeof bus.addEventListener !== "function") {
    throw new Error("createContractsUI: bus is required");
  }
  if (!contracts || typeof contracts.state !== "function") {
    throw new Error("createContractsUI: contracts system is required");
  }
  void camera; // the world nameplate is a Sprite; the prompt is screen-space
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(CONTRACTS_BUNDLE);
    i18n.registerBundle(CONTRACTS_UI_BUNDLE);
  }
  const tr = (key, params) =>
    i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;

  if (typeof document !== "undefined" && !document.getElementById("gg-contracts-style")) {
    const style = document.createElement("style");
    style.id = "gg-contracts-style";
    style.textContent = CONTRACTS_CSS;
    if (document.head && typeof document.head.appendChild === "function") {
      document.head.appendChild(style);
    }
  }

  const hasScene = !!(scene && typeof scene.add === "function");

  // --- board placement --------------------------------------------------------
  const BASE = { x: -52, z: 12 };
  const OFFSETS = [
    [0, 0],
    [2, 0], [-2, 0], [0, 2], [0, -2],
    [2, 2], [-2, 2], [2, -2], [-2, -2],
    [4, 0], [-4, 0], [0, 4], [0, -4],
    [4, 2], [-4, 2], [4, -2], [-4, -2],
    [6, 0], [-6, 0], [0, 6], [0, -6],
  ];
  const POST_OFFSET = 1.15; // centres 2.3 apart → inner lane 2.0 m
  const PROMPT_RADIUS = 3.5;

  function blocked(x, z, r) {
    return !!(
      level &&
      typeof level.isBlocked === "function" &&
      level.isBlocked(x, z, r)
    );
  }

  /**
   * The board anchor needs a clear 1.0 m centre circle plus both post
   * footprints. Fixed offset order keeps placement deterministic.
   */
  function findAnchor() {
    for (let i = 0; i < OFFSETS.length; i++) {
      const x = BASE.x + OFFSETS[i][0];
      const z = BASE.z + OFFSETS[i][1];
      if (blocked(x, z, 1.0)) continue;
      if (blocked(x, z - POST_OFFSET, 0.28)) continue;
      if (blocked(x, z + POST_OFFSET, 0.28)) continue;
      return { x, z };
    }
    console.warn(
      "[contracts] no clear board anchor near the Safehouse — using (" +
        BASE.x + ", " + BASE.z + ")"
    );
    return { x: BASE.x, z: BASE.z };
  }

  const anchor = findAnchor();
  if (typeof contracts.setBoard === "function") contracts.setBoard(anchor.x, anchor.z);

  function pushCollider(x, z, sx, sz) {
    if (!level || !Array.isArray(level.colliders)) return;
    level.colliders.push(colliderOf(x, z, sx, sz));
  }

  // The two posts are the ONLY colliders. Local x ±1.15 becomes world z ±1.15
  // because the board faces west (rotation.y = -π/2).
  pushCollider(anchor.x, anchor.z - POST_OFFSET, 0.3, 0.3);
  pushCollider(anchor.x, anchor.z + POST_OFFSET, 0.3, 0.3);

  let nameplate = null;
  let nameVisible = false;

  if (hasScene) {
    const woodMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
    });
    const paperMat = new THREE.MeshStandardMaterial({
      color: 0xf4e7c6,
      emissive: 0xffe7b0,
      emissiveIntensity: 0.28,
      roughness: 0.95,
      metalness: 0,
    });

    const group = new THREE.Group();
    group.name = "contracts-board";
    group.position.set(anchor.x, 0, anchor.z);
    group.rotation.y = -Math.PI / 2; // front faces west, toward the spawn

    const wood = [];
    // Two posts (2.6 m) + the board slab + a simple frame and cap.
    pushBox(wood, 0.22, 2.6, 0.22, -POST_OFFSET, 1.3, 0, 0x4a3520);
    pushBox(wood, 0.22, 2.6, 0.22, POST_OFFSET, 1.3, 0, 0x4a3520);
    pushBox(wood, 3.3, 1.7, 0.14, 0, 1.62, 0, 0x6b4f2f);
    pushBox(wood, 3.5, 0.12, 0.2, 0, 2.5, 0.01, 0x3c2b18);
    pushBox(wood, 3.5, 0.12, 0.2, 0, 0.74, 0.01, 0x3c2b18);
    pushBox(wood, 0.12, 1.82, 0.2, -1.66, 1.62, 0.01, 0x3c2b18);
    pushBox(wood, 0.12, 1.82, 0.2, 1.66, 1.62, 0.01, 0x3c2b18);
    pushBox(wood, 3.8, 0.08, 0.62, 0, 2.6, 0.14, 0x352516); // small rain cap
    // Pins above each paper.
    for (const px of [-0.98, 0, 0.98]) {
      pushBox(wood, 0.05, 0.05, 0.04, px, 2.02, 0.1, 0x9a3b2e);
    }

    const merged = mergeGeometries(wood, false);
    for (let i = 0; i < wood.length; i++) wood[i].dispose();
    if (merged) {
      const slab = new THREE.Mesh(merged, woodMat);
      slab.name = "contracts-board-wood";
      slab.castShadow = true;
      slab.receiveShadow = true;
      slab.userData.solid = true;
      group.add(slab);
    }

    // Three pinned paper quads, slightly askew so they read as notices.
    const paperGeo = new THREE.PlaneGeometry(0.62, 0.82);
    const papers = [
      { x: -0.98, y: 1.62, rot: 0.035 },
      { x: 0, y: 1.55, rot: -0.025 },
      { x: 0.98, y: 1.66, rot: 0.05 },
    ];
    for (let i = 0; i < papers.length; i++) {
      const p = papers[i];
      const paper = new THREE.Mesh(paperGeo, paperMat);
      paper.name = "contracts-paper-" + i;
      paper.position.set(p.x, p.y, 0.085);
      paper.rotation.z = p.rot;
      group.add(paper);
    }

    scene.add(group);

    const tex = makeBoardTexture();
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
      nameplate.name = "contracts-nameplate";
      nameplate.renderOrder = 6;
      nameplate.position.set(anchor.x, 3.1, anchor.z);
      nameplate.scale.set(4.0, 1.25, 1);
      nameplate.visible = false;
      scene.add(nameplate);
    }
  }

  // --- DOM: prompt + toast -----------------------------------------------------
  const prompt = css(make("div", "gg-contracts-prompt", uiRoot), {
    display: "none",
  });
  prompt.textContent = tr("contractsPrompt");
  const toast = css(make("div", "gg-contracts-toast", uiRoot), {
    display: "none",
  });
  toast.textContent = tr("contractsNoBoard");

  // --- DOM: overlay -----------------------------------------------------------
  const overlay = make("div", "gg-contracts-overlay hidden", uiRoot);
  if (typeof overlay.setAttribute === "function") {
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
  }
  const panel = make("div", "gg-contracts-panel", overlay);

  const head = make("div", "gg-contracts-head", panel);
  const title = make("h2", "gg-contracts-title", head);
  const headRight = make("div", "gg-contracts-head-right", head);
  const balance = make("div", "gg-contracts-balance", headRight);
  const balanceLbl = make("span", "lbl", balance);
  const balanceVal = make("span", "val", balance);
  balanceVal.textContent = "$0";
  const closeBtn = make("button", "gg-contracts-close", headRight);
  closeBtn.type = "button";

  const list = make("div", "gg-contracts-list", panel);
  const hint = make("p", "gg-contracts-hint", panel);

  /** @type {Array<{root: HTMLElement, name: HTMLElement, status: HTMLElement,
   *   desc: HTMLElement, fill: HTMLElement, bar: HTMLElement,
   *   progress: HTMLElement, reward: HTMLElement, xp: HTMLElement}>} */
  const cards = [];
  for (let i = 0; i < 3; i++) {
    const root = make("div", "gg-contracts-card", list);
    const top = make("div", "gg-contracts-card-top", root);
    const name = make("span", "gg-contracts-name", top);
    const status = make("span", "gg-contracts-status", top);
    const desc = make("div", "gg-contracts-desc", root);
    const bar = make("div", "gg-contracts-bar", root);
    if (typeof bar.setAttribute === "function") {
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-valuemin", "0");
    }
    const fill = make("div", "gg-contracts-fill", bar);
    const foot = make("div", "gg-contracts-foot", root);
    const progress = make("span", "gg-contracts-progress", foot);
    const reward = make("span", "gg-contracts-reward", foot);
    const xp = make("span", "gg-contracts-xp", foot);
    cards.push({ root, name, status, desc, fill, bar, progress, reward, xp });
  }

  // --- state ------------------------------------------------------------------
  let openFlag = false;
  let lastState = "menu";
  let shopOpen = false;
  let helpOpen = false;
  let merchantOpen = false;
  let perksOpen = false;
  let mapOpen = false;
  let toastTimer = 0;
  let cash = 0;

  function overlaysOpen() {
    return shopOpen || helpOpen || merchantOpen || perksOpen || mapOpen;
  }

  function setCard(card, c) {
    if (!c) {
      card.root.style.display = "none";
      return;
    }
    card.root.style.display = "flex";
    card.root.classList.toggle("complete", c.complete === true);
    card.name.textContent = tr(c.titleKey);
    card.desc.textContent = tr(c.descKey);
    card.status.textContent = c.complete
      ? tr("contractsCompleted")
      : tr("contractsInProgress");
    const pct = c.need > 0 ? Math.min(100, (c.done / c.need) * 100) : 0;
    card.fill.style.width = pct.toFixed(1) + "%";
    card.progress.textContent = tr("contractsProgress", {
      n: fmtInt(c.done),
      need: fmtInt(c.need),
    });
    if (typeof card.bar.setAttribute === "function") {
      card.bar.setAttribute("aria-valuenow", String(Math.round(pct)));
      card.bar.setAttribute("aria-valuemax", "100");
    }
    card.reward.textContent = "$" + fmtInt(c.reward);
    card.xp.textContent = tr("contractsXp") + " " + fmtInt(c.xp);
  }

  /** Re-read the board's 3 active contracts; never renders the full pool. */
  function render() {
    const st = contracts.state();
    balanceVal.textContent = "$" + fmtInt(cash);
    const listNow = st && Array.isArray(st.contracts) ? st.contracts : [];
    for (let i = 0; i < cards.length; i++) setCard(cards[i], listNow[i] || null);
  }

  function applyTexts() {
    title.textContent = tr("contractsTitle");
    balanceLbl.textContent = tr("contractsCash");
    closeBtn.textContent = tr("contractsClose");
    prompt.textContent = tr("contractsPrompt");
    toast.textContent = tr("contractsNoBoard");
    hint.textContent = tr("contractsCloseHint");
    if (openFlag) render();
  }

  // --- open / close -----------------------------------------------------------
  function hidePrompt() {
    prompt.style.display = "none";
  }

  function open() {
    if (openFlag) return;
    if (lastState !== "playing") return;
    if (overlaysOpen()) return;
    openFlag = true;
    hidePrompt();
    toastTimer = 0;
    toast.style.display = "none";
    // Announce BEFORE the unlock: main.js adds the "contracts" pause reason
    // synchronously, so the async pointerlockchange pause-toggle lands on a
    // run that is already frozen (the merchant/help pattern).
    bus.dispatchEvent(new CustomEvent("contracts-open"));
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
    render();
  }

  function close() {
    if (!openFlag) return;
    openFlag = false;
    overlay.classList.add("hidden");
    hidePrompt();
    const act = typeof document !== "undefined" ? document.activeElement : null;
    if (act && typeof act.blur === "function" && act !== document.body) act.blur();
    bus.dispatchEvent(new CustomEvent("contracts-closed"));
  }

  // --- proximity + frame update ----------------------------------------------
  function distanceToBoard(pos) {
    const p = pos || (player && player.position);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return Infinity;
    const dx = p.x - anchor.x;
    const dz = p.z - anchor.z;
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

    // Cache the player's district for district_sweep before any kill lands.
    if (typeof contracts.update === "function") contracts.update(step, playerPos);

    const playing = lastState === "playing";
    const dist = distanceToBoard(playerPos);
    const promptOn =
      playing && dist <= PROMPT_RADIUS && !openFlag && !overlaysOpen();
    prompt.style.display = promptOn ? "block" : "none";

    const nameOn = playing && dist <= 24;
    if (nameplate && nameOn !== nameVisible) {
      nameVisible = nameOn;
      nameplate.visible = nameOn;
    }
  }

  function showNoBoardToast() {
    toast.style.display = "block";
    toastTimer = 2;
  }

  // --- DOM events -------------------------------------------------------------
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e && e.target === overlay) close();
  });

  // --- bus --------------------------------------------------------------------
  bus.addEventListener("state-changed", (e) => {
    const st = e && e.detail ? e.detail.state : null;
    if (!st) return;
    lastState = st;
    if (
      openFlag &&
      (st === "menu" || st === "gameover" || st === "intro")
    ) {
      close(); // paired "contracts-closed": no orphan pause reason
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
  bus.addEventListener("merchant-open", () => {
    merchantOpen = true;
    if (openFlag) close();
  });
  bus.addEventListener("merchant-closed", () => {
    merchantOpen = false;
  });
  bus.addEventListener("perks-choice-open", () => {
    perksOpen = true;
    if (openFlag) close();
  });
  bus.addEventListener("perks-choice-closed", () => {
    perksOpen = false;
  });
  // The map does not pause the run, but it is a full-screen overlay above the
  // board; opening contracts underneath it would be invisible.
  bus.addEventListener("map-visibility", (e) => {
    const d = e && e.detail ? e.detail : {};
    mapOpen = d.open === true;
    if (mapOpen && openFlag) close();
  });

  bus.addEventListener("money-changed", (e) => {
    const d = e && e.detail ? e.detail : {};
    const m = Number(d.money);
    if (Number.isFinite(m)) cash = m;
    if (openFlag) render();
  });
  bus.addEventListener("contracts-changed", () => {
    if (openFlag) render();
  });
  bus.addEventListener("contract-progress", () => {
    if (openFlag) render();
  });
  bus.addEventListener("contract-complete", () => {
    if (openFlag) render();
  });
  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail ? e.detail.patch : null;
    if (patch && Object.prototype.hasOwnProperty.call(patch, "lang")) {
      applyTexts();
    }
  });

  // T opens/closes; Esc closes (capture phase so input.js never pauses the run
  // on the same press). T farther than 3.5 m → 2 s "find the board" toast.
  function onKeyDown(e) {
    if (!e || e.repeat) return;
    if (e.code === "KeyT") {
      if (openFlag) {
        if (typeof e.preventDefault === "function") e.preventDefault();
        close();
        return;
      }
      if (lastState !== "playing" || overlaysOpen()) return;
      const dist = distanceToBoard(player && player.position);
      if (dist <= PROMPT_RADIUS) {
        if (typeof e.preventDefault === "function") e.preventDefault();
        open();
      } else {
        showNoBoardToast();
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

  return {
    update,
    isOpen: () => openFlag,
    open,
    close,
  };
}
