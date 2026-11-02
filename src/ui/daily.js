/**
 * ============================================================================
 * DAILY CHALLENGE UI — today's modifier + START / CLOSE modal.
 * ============================================================================
 *
 * createDailyUI(uiRoot, bus, daily, i18n)
 *   → { open(), close(), isOpen(), refresh() }
 *
 * - Opens on "daily-open" (menu button). Self-styled inside #ui at z-index 70
 *   (same layer as the leaderboard; above the Boss Rush result overlay).
 * - Shows today's local date, the deterministic modifier name + effect line,
 *   today's best score/time and a COMPLETED TODAY chip. The date is recomputed
 *   on every open/render, so crossing midnight needs no timer: the panel simply
 *   shows the new day and {best:null, complete:false}.
 * - START emits "ui-daily-start" {dateKey, modifierId} and closes. The LEAD
 *   owns the run choreography and should pass daily.start() (which includes
 *   hpMul/dmgMul/scoreMul/weather) to bossrush.start(). This UI never touches
 *   gamestate/weather/bossrush.
 * - Refreshes live on "daily-updated" / "leaderboard-updated" while open and
 *   re-renders on a language switch ("settings-changed" {patch.lang}). All
 *   strings live in an OWN EN/VI bundle (daily_*); modifier names/descriptions
 *   are looked up as daily_mod_<id>_name / daily_mod_<id>_desc.
 *
 * Bus consumed: "daily-open", "daily-updated", "leaderboard-updated",
 *   "settings-changed".
 * Bus emitted: "ui-daily-start" {dateKey, modifierId}.
 *
 * @param {HTMLElement} uiRoot - the #ui element.
 * @param {EventTarget} bus
 * @param {import("../systems/daily.js").Daily} daily
 * @param {{t: Function, registerBundle: Function}} i18n
 */

export const DAILY_BUNDLE = {
  en: {
    daily_kicker: "BOSS RUSH",
    daily_title: "DAILY CHALLENGE",
    daily_best_score: "BEST SCORE",
    daily_best_time: "BEST TIME",
    daily_start: "START",
    daily_close: "CLOSE",
    daily_complete: "COMPLETED TODAY",
    daily_mod_hardcore_name: "HARDCORE",
    daily_mod_hardcore_desc: "Boss HP +25% · damage +20% · score +25%",
    daily_mod_storm_name: "STORM",
    daily_mod_storm_desc: "Storm all run, lightning strikes · score +15%",
    daily_mod_fog_name: "FOG",
    daily_mod_fog_desc: "Dense fog · boss HP +10% · score +20%",
  },
  vi: {
    daily_kicker: "BOSS RUSH",
    daily_title: "THỬ THÁCH HẰNG NGÀY",
    daily_best_score: "ĐIỂM CAO NHẤT",
    daily_best_time: "THỜI GIAN TỐT NHẤT",
    daily_start: "BẮT ĐẦU",
    daily_close: "ĐÓNG",
    daily_complete: "ĐÃ HOÀN THÀNH HÔM NAY",
    daily_mod_hardcore_name: "KHẮC NGHIỆT",
    daily_mod_hardcore_desc: "Máu boss +25% · sát thương +20% · điểm +25%",
    daily_mod_storm_name: "BÃO TỐ",
    daily_mod_storm_desc: "Bão suốt trận, sét đánh · điểm +15%",
    daily_mod_fog_name: "SƯƠNG MÙ",
    daily_mod_fog_desc: "Sương dày · máu boss +10% · điểm +20%",
  },
};

const DAILY_CSS = `
.gg-daily-overlay {
  position: absolute;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  pointer-events: auto;
  background: radial-gradient(
    ellipse at center,
    rgba(8, 6, 10, 0.9) 0%,
    rgba(2, 3, 6, 0.98) 100%
  );
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  font-family: "Segoe UI", system-ui, sans-serif;
}
.gg-daily-overlay.hidden { display: none; }
.gg-daily-panel {
  width: min(440px, calc(100vw - 40px));
  padding: 26px 28px 20px;
  text-align: center;
  background: var(--gg-panel, rgba(9, 13, 21, 0.94));
  border: 1px solid var(--gg-line, #24334d);
  border-top: 3px solid var(--gg-accent, #7fb2ff);
  border-radius: 12px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.66),
    inset 0 0 0 1px rgba(255, 198, 120, 0.04);
}
.gg-daily-kicker {
  margin-bottom: 6px;
  font-size: 10px;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-daily-title {
  margin: 0 0 6px;
  font-size: clamp(22px, 4vw, 30px);
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #dce9ff;
  text-shadow: 0 0 22px rgba(127, 178, 255, 0.24);
}
.gg-daily-date {
  margin-bottom: 14px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--gg-text-dim, #8fa1b8);
  font-variant-numeric: tabular-nums;
}
.gg-daily-mod {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 13px 14px;
  margin-bottom: 14px;
  text-align: left;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--gg-line, #24334d);
  border-left: 3px solid var(--gg-gold, #ffd35e);
  border-radius: 8px;
}
.gg-daily-mod-name {
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gg-gold, #ffd35e);
}
.gg-daily-mod-desc {
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-daily-done {
  display: inline-block;
  align-self: flex-start;
  margin-top: 2px;
  padding: 2px 7px;
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8affa0;
  background: rgba(138, 255, 160, 0.1);
  border: 1px solid rgba(138, 255, 160, 0.45);
  border-radius: 4px;
}
.gg-daily-done.hidden { display: none; }
.gg-daily-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
  padding: 12px 0;
  border-top: 1px solid rgba(127, 178, 255, 0.12);
  border-bottom: 1px solid rgba(127, 178, 255, 0.12);
}
.gg-daily-stat {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.gg-daily-stat .lbl { color: var(--gg-text-dim, #8fa1b8); }
.gg-daily-stat .val {
  color: var(--gg-text, #dbe6f5);
  font-size: 16px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.gg-daily-stat.score .val { color: var(--gg-gold, #ffd35e); }
.gg-daily-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
}
.gg-daily-btn {
  appearance: none;
  min-width: 120px;
  padding: 10px 16px;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--gg-text, #dbe6f5);
  background: #101a2b;
  border: 1px solid #2b3d5c;
  border-radius: 7px;
  cursor: pointer;
}
.gg-daily-btn:hover { border-color: var(--gg-gold, #ffd35e); }
.gg-daily-btn.primary {
  color: #fff;
  background: linear-gradient(180deg, #2f6aa8, #1d4674);
  border-color: #4d86c4;
}
.gg-daily-btn.primary:hover {
  background: linear-gradient(180deg, #3b7dbf, #255585);
}
`;

function make(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

function fmtInt(n) {
  return String(Math.max(0, Math.round(Number(n) || 0)));
}

/** Seconds → "mm:ss". */
function fmtClock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
}

export function createDailyUI(uiRoot, bus, daily, i18n) {
  if (!uiRoot || typeof uiRoot.appendChild !== "function") {
    throw new Error("createDailyUI: container (#ui) is required");
  }
  if (!bus || typeof bus.dispatchEvent !== "function") {
    throw new Error("createDailyUI: bus is required");
  }
  if (!daily || typeof daily.state !== "function") {
    throw new Error("createDailyUI: daily is required");
  }
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(DAILY_BUNDLE);
  }
  const tr = (key, params) =>
    i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;

  if (
    typeof document !== "undefined" &&
    !document.getElementById("gg-daily-style")
  ) {
    const style = document.createElement("style");
    style.id = "gg-daily-style";
    style.textContent = DAILY_CSS;
    if (document.head && typeof document.head.appendChild === "function") {
      document.head.appendChild(style);
    }
  }

  // --- DOM --------------------------------------------------------------------
  const overlay = make("div", "gg-daily-overlay hidden", uiRoot);
  if (typeof overlay.setAttribute === "function") {
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
  }
  const panel = make("div", "gg-daily-panel", overlay);
  const kicker = make("div", "gg-daily-kicker", panel);
  const title = make("h2", "gg-daily-title", panel);
  title.id = "gg-daily-title";
  if (typeof overlay.setAttribute === "function") {
    overlay.setAttribute("aria-labelledby", title.id);
  }
  const dateVal = make("div", "gg-daily-date", panel);

  const modBox = make("div", "gg-daily-mod", panel);
  const modName = make("div", "gg-daily-mod-name", modBox);
  const modDesc = make("div", "gg-daily-mod-desc", modBox);
  const doneBadge = make("span", "gg-daily-done hidden", modBox);

  const statsBox = make("div", "gg-daily-stats", panel);
  const scoreRow = make("div", "gg-daily-stat score", statsBox);
  const scoreLbl = make("span", "lbl", scoreRow);
  const scoreVal = make("span", "val", scoreRow);
  const timeRow = make("div", "gg-daily-stat", statsBox);
  const timeLbl = make("span", "lbl", timeRow);
  const timeVal = make("span", "val", timeRow);

  const actions = make("div", "gg-daily-actions", panel);
  const startBtn = /** @type {HTMLButtonElement} */ (make("button", "gg-daily-btn primary", actions));
  startBtn.type = "button";
  const closeBtn = /** @type {HTMLButtonElement} */ (make("button", "gg-daily-btn", actions));
  closeBtn.type = "button";

  // --- state ------------------------------------------------------------------
  let openFlag = false;
  let lastModifierId = "";

  function snapshot() {
    const st = daily.state();
    if (!st || typeof st !== "object") {
      return {
        dateKey: "",
        complete: false,
        best: null,
        modifier: { id: "", hpMul: 1, dmgMul: 1, scoreMul: 1, weather: null },
      };
    }
    return st;
  }

  function render() {
    const st = snapshot();
    const mod = st.modifier || { id: "" };
    const id = typeof mod.id === "string" ? mod.id : "";
    lastModifierId = id;

    dateVal.textContent = st.dateKey || "—";
    modName.textContent = id ? tr("daily_mod_" + id + "_name") : "—";
    modDesc.textContent = id ? tr("daily_mod_" + id + "_desc") : "";
    doneBadge.classList.toggle("hidden", st.complete !== true);
    doneBadge.textContent = tr("daily_complete");

    const best = st.best;
    scoreVal.textContent = best ? fmtInt(best.score) : "—";
    timeVal.textContent = best ? fmtClock(best.time) : "—";
  }

  function applyTexts() {
    title.textContent = tr("daily_title");
    kicker.textContent = tr("daily_kicker");
    scoreLbl.textContent = tr("daily_best_score");
    timeLbl.textContent = tr("daily_best_time");
    startBtn.textContent = tr("daily_start");
    closeBtn.textContent = tr("daily_close");
    doneBadge.textContent = tr("daily_complete");
    render();
  }

  // --- open / close -----------------------------------------------------------
  function open() {
    if (openFlag) return;
    openFlag = true;
    overlay.classList.remove("hidden");
    render(); // recomputes today's key: midnight reset without a timer
    if (typeof startBtn.focus === "function") {
      try {
        startBtn.focus({ preventScroll: true });
      } catch {
        startBtn.focus();
      }
    }
  }

  function close() {
    if (!openFlag) return;
    openFlag = false;
    overlay.classList.add("hidden");
    const active = typeof document !== "undefined" ? document.activeElement : null;
    if (active && typeof active.blur === "function" && overlay.contains(active)) {
      active.blur();
    }
  }

  // --- events -----------------------------------------------------------------
  startBtn.addEventListener("click", () => {
    if (!openFlag) return;
    const st = snapshot();
    const modifierId =
      st.modifier && typeof st.modifier.id === "string" ? st.modifier.id : "";
    // Emit FIRST, close second: main's synchronous handler keeps the click's
    // user activation for input.lockPointer().
    bus.dispatchEvent(
      new CustomEvent("ui-daily-start", {
        detail: { dateKey: st.dateKey, modifierId },
      })
    );
    close();
  });
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e && e.target === overlay) close();
  });
  // Escape closes in capture phase so input.js never pauses the run.
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener(
      "keydown",
      (e) => {
        if (!openFlag || !e) return;
        if (e.code === "Escape" || e.key === "Escape") {
          e.preventDefault();
          if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
          close();
        }
      },
      true
    );
  }

  bus.addEventListener("daily-open", () => {
    open();
  });
  bus.addEventListener("daily-updated", () => {
    if (openFlag) render();
  });
  bus.addEventListener("leaderboard-updated", () => {
    if (openFlag) render();
  });
  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail ? e.detail.patch : null;
    if (patch && Object.prototype.hasOwnProperty.call(patch, "lang")) {
      applyTexts();
    }
  });

  applyTexts();

  return {
    open,
    close,
    isOpen: () => openFlag,
    refresh: render,
    modifierId: () => lastModifierId,
  };
}
