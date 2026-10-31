/**
 * Shop UI — the DOM shop overlay inside #ui (EXPANSION feature B3; contract:
 * docs/EXPANSION.md).
 *
 * createShopUI(container, bus, economy, shop, i18n) → { open, close, isOpen }
 *
 * Overlay (index.html sets #ui { pointer-events: none } — the shop panel MUST
 * re-enable pointer-events: auto on itself so buttons are clickable):
 * - Title "CỬA HÀNG" (i18n) + the CURRENT MONEY balance.
 * - A GRID of item cards, one per shop.catalog entry: item name EN/VI via
 *   i18n.t, ONE stat line, the price, and a BUY button.
 *   - Button dimmed + unclickable when the player cannot afford the item or
 *     already owns it (weapons).
 *   - Owned weapon cards show "ĐÃ SỞ HỮU" (i18n) instead of an active button.
 * - Open/close: bus "shop-toggle" toggles the overlay. On OPEN this module
 *   emits "shop-open" on the bus; on CLOSE it emits "shop-closed"
 *   (gamestate pauses by reason "shop" — see gamestate expansion).
 * - Esc/B while the shop is open = CLOSE the shop (emit "shop-closed").
 *   Known integration trap (docs/EXPANSION.md): the browser usually swallows
 *   Esc to exit pointer lock and input.js then emits "pause-toggle" via
 *   pointerlockchange — closing the shop must not leave a stale "user" pause
 *   reason behind. Handled HERE by intercepting Esc/B on a capture-phase
 *   window keydown and stopping propagation, so input.js never sees the key
 *   (no "pause-toggle" from the key path, no double "shop-toggle" from B).
 * - Open is gated to the playing state (the shop is an in-run overlay: money
 *   and pause-by-reason only exist mid-run); closing is always allowed.
 * - All text through i18n.t(); this module registers its OWN
 *   i18n.registerBundle({en:{...}, vi:{...}}) — NEVER another module's dict.
 *   Live language switch ("settings-changed" {patch:{lang}}) re-renders.
 *
 * Styles: this file is self-contained and injects its own scoped stylesheet
 * (id "gg-shop-style") because src/style.css is owned by another builder.
 * The rules reuse the #ui theme custom properties (--gg-*).
 *
 * Pointer-lock choreography (see docs/EXPANSION.md integration notes):
 * - open() releases the lock BEFORE emitting "shop-open" so the cursor is
 *   free for the BUY buttons. The resulting pointerlockchange makes input.js
 *   emit "pause-toggle" asynchronously — gamestate must ignore it while its
 *   "shop" reason is set (that side of the contract lives in gamestate.js).
 * - close() re-requests the lock when closed via the B key (a keyboard
 *   gesture keeps user activation); Escape grants no activation, the attempt
 *   fails silently and input.js's canvas-click recovery path takes over.
 *
 * Implementation notes:
 * - Event-driven only — no per-frame work, no allocations in steady state.
 * - After a click the BUY button is blurred so Space/Enter cannot re-buy.
 *
 * @param {HTMLElement} container - the #ui element.
 * @param {EventTarget} bus
 * @param {import("../systems/economy.js").Economy} economy - balance display +
 *   affordability.
 * @param {import("../systems/shop.js").Shop} shop - catalog, owned(), buy().
 * @param {{t: Function, registerBundle: Function, setLang: Function, getLang: Function}} i18n
 *   The i18n module namespace (see src/core/i18n.js).
 * @returns {ShopUI}
 */

/**
 * @typedef {Object} ShopUI
 * @property {() => void} open - show the overlay and emit "shop-open".
 * @property {(relock?: boolean) => void} close - hide the overlay and emit
 *   "shop-closed"; relock=true also re-requests pointer lock (B-key path).
 * @property {() => boolean} isOpen - true while the overlay is visible.
 */

// --- i18n bundle (owned keys only — merged into the shared dictionaries) ----

const SHOP_BUNDLE = {
  en: {
    shopTitle: "SHOP",
    shopMoney: "Money",
    shopBuy: "BUY",
    shopOwned: "OWNED",
    shopCloseHint: "B / ESC — close the shop",
    shopItemSmg: "SMG",
    shopStatSmg: "Auto 850 RPM · Mag 32 · DMG 11",
    shopItemSniper: "Sniper Rifle",
    shopStatSniper: "Bolt-action 1.4 s · DMG 110 · Headshot ×3",
    shopItemMinigun: "Minigun",
    shopStatMinigun: "Spin-up 0.6 s · Auto 1100 RPM · DMG 8",
    shopItemGrenade: "Grenade Launcher",
    shopStatGrenade: "Pump 1.1 s · Mag 4 · Blast 90 DMG / 4 m",
    shopItemAmmo: "Ammo Refill",
    shopStatAmmo: "Full reserve for every owned weapon",
    shopItemMedkit: "Medkit",
    shopStatMedkit: "Restore full 100 HP",
  },
  vi: {
    shopTitle: "CỬA HÀNG",
    shopMoney: "Tiền",
    shopBuy: "MUA",
    shopOwned: "ĐÃ SỞ HỮU",
    shopCloseHint: "B / ESC — đóng cửa hàng",
    shopItemSmg: "Tiểu liên SMG",
    shopStatSmg: "Tự động 850 vòng/phút · Băng 32 · ST 11",
    shopItemSniper: "Súng bắn tỉa",
    shopStatSniper: "Bolt-action 1.4 s · ST 110 · Vào đầu ×3",
    shopItemMinigun: "Minigun",
    shopStatMinigun: "Quay nòng 0.6 s · Tự động 1100 vòng/phút · ST 8",
    shopItemGrenade: "Súng phóng lựu",
    shopStatGrenade: "Pump 1.1 s · Băng 4 · Nổ ST 90 / 4 m",
    shopItemAmmo: "Nạp đạn",
    shopStatAmmo: "Nạp đầy dự trữ mọi súng đang sở hữu",
    shopItemMedkit: "Túi cứu thương",
    shopStatMedkit: "Hồi đầy 100 máu",
  },
};

// --- scoped stylesheet (injected once; reuses the #ui theme variables) -------

const SHOP_CSS = `
.gg-shop-overlay {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(
    ellipse at center,
    rgba(5, 8, 14, 0.55) 0%,
    rgba(2, 4, 8, 0.86) 100%
  );
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  pointer-events: auto; /* #ui is pointer-events:none — the shop takes clicks */
  font-family: "Segoe UI", system-ui, sans-serif;
}

.gg-shop-overlay.hidden {
  display: none;
}

.gg-shop-panel {
  width: min(720px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  background: var(--gg-panel, rgba(9, 13, 21, 0.92));
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 12px;
  padding: 24px 26px 18px;
  box-shadow:
    0 18px 60px rgba(0, 0, 0, 0.6),
    inset 0 0 0 1px rgba(127, 178, 255, 0.05);
}

.gg-shop-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
}

.gg-shop-title {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #f2f7ff;
  text-shadow: 0 0 22px rgba(127, 178, 255, 0.3);
}

.gg-shop-balance {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 14px;
  background: var(--gg-chip, rgba(6, 10, 16, 0.55));
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 6px;
  white-space: nowrap;
}

.gg-shop-balance .lbl {
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--gg-text-dim, #8fa1b8);
}

.gg-shop-balance .val {
  font-size: 20px;
  font-weight: 800;
  color: var(--gg-gold, #ffd35e);
  font-variant-numeric: tabular-nums;
}

.gg-shop-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 640px) {
  .gg-shop-grid {
    grid-template-columns: 1fr;
  }
}

.gg-shop-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 14px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 8px;
}

.gg-shop-card.owned {
  border-color: rgba(255, 211, 94, 0.45);
  box-shadow: inset 0 0 0 1px rgba(255, 211, 94, 0.12);
}

.gg-shop-name {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gg-text, #dbe6f5);
}

.gg-shop-stat {
  font-size: 12px;
  color: var(--gg-text-dim, #8fa1b8);
  line-height: 1.45;
  min-height: 2.6em;
}

.gg-shop-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
  padding-top: 8px;
  gap: 10px;
}

.gg-shop-price {
  font-size: 18px;
  font-weight: 800;
  color: var(--gg-gold, #ffd35e);
  font-variant-numeric: tabular-nums;
}

.gg-shop-price.poor {
  color: var(--gg-danger, #ff4d4d);
}

.gg-shop-buy {
  appearance: none;
  padding: 9px 16px;
  min-width: 104px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #fff;
  background: linear-gradient(180deg, #3d69b8, #2a4a86);
  border: 1px solid #5f8ede;
  border-radius: 7px;
  cursor: pointer;
  transition:
    background 0.12s,
    box-shadow 0.12s,
    opacity 0.12s,
    transform 0.06s;
}

.gg-shop-buy:hover:enabled {
  background: linear-gradient(180deg, #4a7ad0, #31569b);
  box-shadow: 0 0 14px rgba(127, 178, 255, 0.35);
}

.gg-shop-buy:active:enabled {
  transform: translateY(1px);
}

.gg-shop-buy:focus-visible {
  outline: 2px solid var(--gg-accent, #7fb2ff);
  outline-offset: 2px;
}

.gg-shop-buy:disabled {
  opacity: 0.35;
  cursor: default;
  background: #101a2b;
  border-color: #2b3d5c;
  box-shadow: none;
}

.gg-shop-buy.owned {
  opacity: 1;
  background: rgba(255, 211, 94, 0.12);
  border-color: rgba(255, 211, 94, 0.55);
  color: var(--gg-gold, #ffd35e);
}

.gg-shop-hint {
  margin: 14px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--gg-text-dim, #8fa1b8);
}
`;

// --- helpers -------------------------------------------------------------------

function make(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

function fmtInt(n) {
  return String(Math.max(0, Math.round(Number(n) || 0)));
}

export function createShopUI(container, bus, economy, shop, i18n) {
  if (!container || typeof container.appendChild !== "function") {
    throw new Error("createShopUI: container (#ui) is required");
  }
  if (!bus || typeof bus.addEventListener !== "function") {
    throw new Error("createShopUI: bus is required");
  }
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(SHOP_BUNDLE);
  }

  const tr = (key) => (i18n && typeof i18n.t === "function" ? i18n.t(key) : key);

  // Inject the stylesheet once (id guard — creating two shop UIs must not
  // duplicate rules).
  if (typeof document !== "undefined" && !document.getElementById("gg-shop-style")) {
    const style = document.createElement("style");
    style.id = "gg-shop-style";
    style.textContent = SHOP_CSS;
    document.head.appendChild(style);
  }

  // --- DOM ---------------------------------------------------------------------
  const overlay = make("div", "gg-shop-overlay hidden", container);
  const panel = make("div", "gg-shop-panel", overlay);

  const head = make("div", "gg-shop-head", panel);
  const title = make("h2", "gg-shop-title", head);
  const balance = make("div", "gg-shop-balance", head);
  const balanceLbl = make("span", "lbl", balance);
  const balanceVal = make("span", "val", balance);
  balanceVal.textContent = "$0";

  const grid = make("div", "gg-shop-grid", panel);

  // One card per catalog entry, built once — refresh() only mutates state.
  const catalog = shop && Array.isArray(shop.catalog) ? shop.catalog : [];
  /** @type {{entry: Object, root: HTMLElement, price: HTMLElement, btn: HTMLButtonElement}[]} */
  const cards = [];
  for (const entry of catalog) {
    if (!entry || typeof entry.id !== "string") continue;
    const root = make("div", "gg-shop-card", grid);
    const name = make("div", "gg-shop-name", root);
    const stat = make("div", "gg-shop-stat", root);
    const foot = make("div", "gg-shop-foot", root);
    const price = make("span", "gg-shop-price", foot);
    const btn = /** @type {HTMLButtonElement} */ (make("button", "gg-shop-buy", foot));
    btn.type = "button";
    price.textContent = "$" + fmtInt(entry.price);
    name.textContent = tr("shopItem" + cap(entry.id));
    stat.textContent = tr("shopStat" + cap(entry.id));
    btn.addEventListener("click", () => {
      shop.buy(entry.id);
      refresh(); // ownership / affordability may have changed
      if (typeof btn.blur === "function") btn.blur(); // Space must not re-buy
    });
    cards.push({ entry, root, price, btn });
  }

  const hint = make("p", "gg-shop-hint", panel);

  // Static i18n bindings (initial render + live language switch).
  /** @type {{node: HTMLElement, key: string}[]} */
  const bindings = [
    { node: title, key: "shopTitle" },
    { node: balanceLbl, key: "shopMoney" },
    { node: hint, key: "shopCloseHint" },
  ];
  for (const card of cards) {
    bindings.push({ node: card.root.querySelector(".gg-shop-name"), key: "shopItem" + cap(card.entry.id) });
    bindings.push({ node: card.root.querySelector(".gg-shop-stat"), key: "shopStat" + cap(card.entry.id) });
  }

  function applyTexts() {
    for (const b of bindings) {
      if (b.node) b.node.textContent = tr(b.key);
    }
    refresh(); // button labels (MUA / ĐÃ SỞ HỮU) follow the language too
  }

  // --- state ---------------------------------------------------------------------
  let openFlag = false;
  let lastState = null; // last "state-changed" state; null = boot (menu)
  let canvas = null;

  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function money() {
    return economy && typeof economy.get === "function" ? economy.get() : 0;
  }

  /** Balance text + per-card affordability/ownership. Event-driven only. */
  function refresh() {
    balanceVal.textContent = "$" + fmtInt(money());
    const ownedSet = new Set(
      shop && typeof shop.owned === "function" ? shop.owned() : []
    );
    const cash = money();
    for (const card of cards) {
      const isOwned = card.entry.kind === "weapon" && ownedSet.has(card.entry.id);
      const affordable = cash >= card.entry.price;
      card.root.classList.toggle("owned", isOwned);
      card.btn.classList.toggle("owned", isOwned);
      card.btn.disabled = isOwned || !affordable;
      card.btn.textContent = tr(isOwned ? "shopOwned" : "shopBuy");
      card.price.classList.toggle("poor", !affordable && !isOwned);
    }
  }

  function relockPointer() {
    if (typeof document === "undefined" || document.pointerLockElement) return;
    if (!canvas) canvas = document.getElementById("game");
    try {
      const p = canvas && canvas.requestPointerLock ? canvas.requestPointerLock() : null;
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      /* denial / post-Esc cooldown — input.js's canvas-click path recovers */
    }
  }

  // --- open / close ----------------------------------------------------------------
  function open() {
    if (openFlag) return;
    if (lastState !== "playing") return; // in-run overlay only (see header)
    openFlag = true;
    overlay.classList.remove("hidden");
    // Release the pointer BEFORE "shop-open": the cursor must be free for the
    // BUY buttons, and the lock-loss "pause-toggle" (input.js pointerlockchange)
    // arrives asynchronously AFTER this synchronous dispatch — gamestate sees
    // the "shop" reason already set when it handles it.
    if (document.pointerLockElement && typeof document.exitPointerLock === "function") {
      try {
        document.exitPointerLock();
      } catch {
        /* ignore */
      }
    }
    refresh();
    bus.dispatchEvent(new CustomEvent("shop-open"));
  }

  function close(relock) {
    if (!openFlag) return;
    openFlag = false;
    overlay.classList.add("hidden");
    // Drop focus so Space/Enter cannot re-trigger the last BUY button.
    const act = document.activeElement;
    if (act && typeof act.blur === "function" && act !== document.body) act.blur();
    bus.dispatchEvent(new CustomEvent("shop-closed"));
    if (relock) relockPointer();
  }

  function toggle() {
    if (openFlag) close(false);
    else open();
  }

  // --- bus + key wiring -------------------------------------------------------------
  bus.addEventListener("shop-toggle", toggle);

  // Esc/B while open: intercept BEFORE input.js (capture phase on window beats
  // its bubble-phase keydown) so the key never reaches input.js — no
  // "pause-toggle" from Esc, no duplicate "shop-toggle" from B.
  function onKeyDown(e) {
    if (!openFlag) return;
    if (e.code !== "Escape" && e.code !== "KeyB") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    close(true);
  }
  window.addEventListener("keydown", onKeyDown, true);

  // Track the game state: gate opening on "playing", force-close (with the
  // paired "shop-closed" so the "shop" pause reason never orphans) on
  // menu / gameover.
  bus.addEventListener("state-changed", (e) => {
    const d = e && e.detail ? e.detail : {};
    if (d.state) lastState = d.state;
    if ((lastState === "menu" || lastState === "gameover") && openFlag) {
      close(false);
    }
  });

  // Balance + affordability live-update while the overlay is visible.
  bus.addEventListener("money-changed", () => {
    if (openFlag) refresh();
  });

  // Live language switch (same convention as hud.js / menus.js).
  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail && e.detail.patch ? e.detail.patch : null;
    if (patch && patch.lang) applyTexts();
  });

  applyTexts();

  return {
    open,
    close: (relock) => close(relock),
    isOpen: () => openFlag,
  };
}
