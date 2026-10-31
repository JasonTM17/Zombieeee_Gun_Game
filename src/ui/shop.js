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
 *   reason behind.
 * - All text through i18n.t(); this module registers its OWN
 *   i18n.registerBundle({en:{...}, vi:{...}}) — NEVER another module's dict.
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
 * @property {() => void} close - hide the overlay and emit "shop-closed".
 * @property {() => boolean} isOpen - true while the overlay is visible.
 */

export function createShopUI(container, bus, economy, shop, i18n) {
  void container;
  void bus;
  void economy;
  void shop;
  void i18n;
  throw new Error("TODO: implement");
}
