/**
 * Small world-interaction chip for explosive/hazard props.
 *
 * User request: barrels and gas canisters must feel interactive, not like
 * scenery. The hazards module emits "hazard-near" {near, kind} whenever the
 * player enters/leaves a 2.8 m ring, and "hazard-kicked" when E lights a fuse.
 * This chip tells the player both verbs: E to kick, bullets to detonate.
 *
 * createHazardHint(uiRoot, bus, i18n) -> { show(bool) }
 * Event-driven only; no per-frame work.
 */

const HAZARD_HINT_BUNDLE = {
  en: {
    hazardNearBarrel: "KICK BARREL",
    hazardNearCanister: "KICK GAS CANISTER",
    hazardShoot: "or SHOOT to detonate",
    hazardKicked: "FUSE LIT — RUN!",
  },
  vi: {
    hazardNearBarrel: "ĐÁ THÙNG",
    hazardNearCanister: "ĐÁ BÌNH GA",
    hazardShoot: "hoặc BẮN để nổ",
    hazardKicked: "ĐÃ CHÂM NGÒI — CHẠY!",
  },
};

function make(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

export function createHazardHint(container, bus, i18n) {
  if (!container || typeof container.appendChild !== "function") {
    return { show() {} };
  }
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(HAZARD_HINT_BUNDLE);
  }
  const tr = (key) => (i18n && typeof i18n.t === "function" ? i18n.t(key) : key);

  const wrap = make("div", "hazard-hint", container);
  wrap.style.cssText =
    "position:absolute;left:50%;bottom:calc(132px + var(--gg-weapon-bar-bottom,0px));" +
    "transform:translateX(-50%);display:none;align-items:center;gap:8px;" +
    "padding:6px 14px;background:rgba(38,14,8,0.86);" +
    "border:1px solid rgba(255,132,70,0.55);border-radius:6px;" +
    "font:700 11px/1.2 'Segoe UI',system-ui,sans-serif;letter-spacing:0.1em;" +
    "text-transform:uppercase;color:#ffd8b8;white-space:nowrap;" +
    "text-shadow:0 1px 3px rgba(0,0,0,0.9);pointer-events:none;z-index:9;";

  const keycap = make("span", "hazard-hint-key", wrap);
  keycap.textContent = "E";
  keycap.style.cssText =
    "display:inline-block;padding:2px 7px;background:#0b1322;" +
    "border:1px solid #5a3a2a;border-bottom-width:2px;border-radius:4px;" +
    "font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#ffd8b8;";
  const label = make("span", "hazard-hint-label", wrap);
  const sub = make("span", "hazard-hint-sub", wrap);
  sub.style.cssText =
    "color:#b98a6a;font-weight:400;text-transform:none;letter-spacing:0.04em;";

  let kind = null;
  let shown = false;
  let timer = 0;

  function paint() {
    const isCan = kind === "canister";
    label.textContent = tr(isCan ? "hazardNearCanister" : "hazardNearBarrel");
    sub.textContent = "· " + tr("hazardShoot");
  }

  function show(next) {
    if (next === shown) return;
    shown = next;
    wrap.style.display = next ? "flex" : "none";
  }

  bus.addEventListener("hazard-near", (e) => {
    const d = e && e.detail ? e.detail : {};
    if (!d.near) {
      show(false);
      kind = null;
      return;
    }
    kind = d.kind === "canister" ? "canister" : "barrel";
    paint();
    show(true);
  });

  bus.addEventListener("hazard-kicked", () => {
    label.textContent = tr("hazardKicked");
    sub.textContent = "";
    show(true);
    timer = 1.2;
  });

  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail ? e.detail.patch : null;
    if (patch && patch.lang && shown) paint();
  });

  bus.addEventListener("state-changed", (e) => {
    const st = e && e.detail ? e.detail.state : null;
    if (st && st !== "playing") show(false);
  });

  function update(dt) {
    if (timer > 0) {
      timer -= dt;
      if (timer <= 0) show(false);
    }
  }

  return { show, update };
}
