/**
 * ============================================================================
 * BOSS RUSH LEADERBOARD UI — local top-10 modal.
 * ============================================================================
 *
 * createLeaderboardUI(uiRoot, bus, leaderboard, i18n)
 *   → { open(), close(), isOpen(), refresh() }
 *
 * - Opens on "leaderboard-open" (menu button / Boss Rush result LEADERBOARD
 *   button). Self-styled inside #ui at z-index 70, i.e. ABOVE the Boss Rush
 *   result overlay (60), so it can be opened from the victory/defeat panel and
 *   closed back to it. Pointer-events auto; CLOSE (or the module's close())
 *   is the only way out.
 * - BEST score/time header + ALL / DAILY tabs + a rank/score/time/bosses/date
 *   table (up to 10 rows) + an empty state. The DAILY tab lists only runs
 *   played with daily:true (any date). Rows come from leaderboard.top(10) /
 *   leaderboard.dailyTop(10), so the system module stays the source of truth.
 * - Refreshes live on "leaderboard-updated" and on a language switch
 *   ("settings-changed" {patch.lang}); every string lives in an OWN EN/VI
 *   bundle (lb_*).
 * - Corrupt/absent data is already handled by the system: the modal simply
 *   renders its empty state. No per-frame update is required.
 *
 * Bus consumed: "leaderboard-open", "leaderboard-updated", "settings-changed".
 * Bus emitted: none.
 *
 * @param {HTMLElement} uiRoot - the #ui element.
 * @param {EventTarget} bus
 * @param {import("../systems/leaderboard.js").Leaderboard} leaderboard
 * @param {{t: Function, registerBundle: Function}} i18n
 */

export const LEADERBOARD_BUNDLE = {
  en: {
    lb_kicker: "BOSS RUSH",
    lb_title: "LEADERBOARD",
    lb_best: "BEST",
    lb_tab_all: "ALL",
    lb_tab_daily: "DAILY",
    lb_rank: "#",
    lb_score: "SCORE",
    lb_time: "TIME",
    lb_bosses: "BOSSES",
    lb_date: "DATE",
    lb_empty: "NO RUNS YET",
    lb_empty_daily: "NO DAILY RUNS YET",
    lb_close: "CLOSE",
  },
  vi: {
    lb_kicker: "BOSS RUSH",
    lb_title: "BẢNG XẾP HẠNG",
    lb_best: "KỶ LỤC",
    lb_tab_all: "TẤT CẢ",
    lb_tab_daily: "HẰNG NGÀY",
    lb_rank: "#",
    lb_score: "ĐIỂM",
    lb_time: "THỜI GIAN",
    lb_bosses: "BOSS",
    lb_date: "NGÀY",
    lb_empty: "CHƯA CÓ LƯỢT CHƠI",
    lb_empty_daily: "CHƯA CÓ LƯỢT CHƠI HẰNG NGÀY",
    lb_close: "ĐÓNG",
  },
};

const LEADERBOARD_CSS = `
.gg-lb-overlay {
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
.gg-lb-overlay.hidden { display: none; }
.gg-lb-panel {
  width: min(520px, calc(100vw - 40px));
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  padding: 26px 28px 18px;
  background: var(--gg-panel, rgba(9, 13, 21, 0.94));
  border: 1px solid var(--gg-line, #24334d);
  border-top: 3px solid var(--gg-gold, #ffd35e);
  border-radius: 12px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.66),
    inset 0 0 0 1px rgba(255, 198, 120, 0.04);
}
.gg-lb-kicker {
  margin-bottom: 6px;
  font-size: 10px;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-lb-title {
  margin: 0 0 14px;
  font-size: clamp(22px, 4vw, 30px);
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #ffe7a8;
  text-shadow: 0 0 22px rgba(255, 211, 94, 0.24);
}
.gg-lb-best {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding: 9px 12px;
  margin-bottom: 14px;
  background: var(--gg-chip, rgba(6, 10, 16, 0.55));
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 7px;
}
.gg-lb-best .lbl {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-lb-best .val {
  font-size: 17px;
  font-weight: 800;
  color: var(--gg-gold, #ffd35e);
  font-variant-numeric: tabular-nums;
}
.gg-lb-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--gg-line, #24334d);
  margin-bottom: 10px;
}
.gg-lb-tab {
  appearance: none;
  padding: 7px 14px 6px;
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
.gg-lb-tab:hover { color: #ffe7a8; }
.gg-lb-tab.active {
  color: var(--gg-gold, #ffd35e);
  border-bottom-color: var(--gg-gold, #ffd35e);
}
.gg-lb-scroll {
  overflow-y: auto;
  min-height: 0;
  flex: 1 1 auto;
}
.gg-lb-table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
.gg-lb-table th {
  padding: 5px 6px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-align: right;
  color: var(--gg-text-dim, #8fa1b8);
  border-bottom: 1px solid rgba(127, 178, 255, 0.14);
  white-space: nowrap;
}
.gg-lb-table th:first-child,
.gg-lb-table td:first-child { text-align: left; padding-left: 8px; }
.gg-lb-table td {
  padding: 6px;
  font-size: 12px;
  text-align: right;
  color: var(--gg-text, #dbe6f5);
  border-bottom: 1px solid rgba(127, 178, 255, 0.07);
  white-space: nowrap;
}
.gg-lb-table tbody tr:first-child td {
  color: #ffe7a8;
  font-weight: 800;
}
.gg-lb-table td.rank { color: var(--gg-gold, #ffd35e); font-weight: 800; }
.gg-lb-table td.date-col { color: var(--gg-text-dim, #8fa1b8); font-size: 10.5px; }
.gg-lb-empty {
  padding: 30px 8px;
  text-align: center;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-lb-empty.hidden { display: none; }
.gg-lb-scroll.hidden { display: none; }
.gg-lb-actions {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}
.gg-lb-btn {
  appearance: none;
  min-width: 130px;
  padding: 9px 16px;
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
.gg-lb-btn:hover { border-color: var(--gg-gold, #ffd35e); }
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

/** Entry date: its daily dateKey, else the local date of `at`, else "—". */
function fmtDate(entry) {
  if (entry && entry.dateKey) return entry.dateKey;
  const at = entry ? Number(entry.at) : 0;
  if (Number.isFinite(at) && at > 0) {
    const d = new Date(at);
    if (!Number.isNaN(d.getTime())) {
      return (
        String(d.getFullYear()) +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0")
      );
    }
  }
  return "—";
}

function empty(node) {
  node.textContent = "";
}

export function createLeaderboardUI(uiRoot, bus, leaderboard, i18n) {
  if (!uiRoot || typeof uiRoot.appendChild !== "function") {
    throw new Error("createLeaderboardUI: container (#ui) is required");
  }
  if (!bus || typeof bus.dispatchEvent !== "function") {
    throw new Error("createLeaderboardUI: bus is required");
  }
  if (!leaderboard || typeof leaderboard.top !== "function") {
    throw new Error("createLeaderboardUI: leaderboard is required");
  }
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(LEADERBOARD_BUNDLE);
  }
  const tr = (key, params) =>
    i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;

  if (
    typeof document !== "undefined" &&
    !document.getElementById("gg-leaderboard-style")
  ) {
    const style = document.createElement("style");
    style.id = "gg-leaderboard-style";
    style.textContent = LEADERBOARD_CSS;
    if (document.head && typeof document.head.appendChild === "function") {
      document.head.appendChild(style);
    }
  }

  // --- DOM --------------------------------------------------------------------
  const overlay = make("div", "gg-lb-overlay hidden", uiRoot);
  if (typeof overlay.setAttribute === "function") {
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
  }
  const panel = make("div", "gg-lb-panel", overlay);
  const kicker = make("div", "gg-lb-kicker", panel);
  const title = make("h2", "gg-lb-title", panel);
  title.id = "gg-lb-title";
  if (typeof overlay.setAttribute === "function") {
    overlay.setAttribute("aria-labelledby", title.id);
  }

  const bestRow = make("div", "gg-lb-best", panel);
  const bestLbl = make("span", "lbl", bestRow);
  const bestVal = make("span", "val", bestRow);

  const tabsBar = make("div", "gg-lb-tabs", panel);
  if (typeof tabsBar.setAttribute === "function") {
    tabsBar.setAttribute("role", "tablist");
  }
  const TABS = [
    { id: "all", key: "lb_tab_all" },
    { id: "daily", key: "lb_tab_daily" },
  ];
  /** @type {Record<string, HTMLButtonElement>} */
  const tabButtons = {};
  for (let i = 0; i < TABS.length; i++) {
    const t = TABS[i];
    const btn = /** @type {HTMLButtonElement} */ (make("button", "gg-lb-tab", tabsBar));
    btn.type = "button";
    if (typeof btn.setAttribute === "function") {
      btn.setAttribute("role", "tab");
    }
    btn.addEventListener("click", () => setTab(t.id));
    tabButtons[t.id] = btn;
  }

  const scroll = make("div", "gg-lb-scroll", panel);
  const table = make("table", "gg-lb-table", scroll);
  const thead = make("thead", "", table);
  const headRow = make("tr", "", thead);
  const COLUMNS = [
    { key: "lb_rank", cls: "rank" },
    { key: "lb_score", cls: "score" },
    { key: "lb_time", cls: "time" },
    { key: "lb_bosses", cls: "bosses" },
    { key: "lb_date", cls: "date-col" },
  ];
  const headCells = [];
  for (let i = 0; i < COLUMNS.length; i++) {
    const th = make("th", COLUMNS[i].cls, headRow);
    if (typeof th.setAttribute === "function") th.setAttribute("scope", "col");
    headCells.push(th);
  }
  const tbody = make("tbody", "", table);

  const emptyEl = make("div", "gg-lb-empty hidden", panel);
  const actions = make("div", "gg-lb-actions", panel);
  const closeBtn = /** @type {HTMLButtonElement} */ (make("button", "gg-lb-btn", actions));
  closeBtn.type = "button";

  // --- state ------------------------------------------------------------------
  let openFlag = false;
  let tab = "all";

  function setTab(next) {
    tab = next === "daily" ? "daily" : "all";
    for (let i = 0; i < TABS.length; i++) {
      const id = TABS[i].id;
      const btn = tabButtons[id];
      btn.classList.toggle("active", id === tab);
      if (typeof btn.setAttribute === "function") {
        btn.setAttribute("aria-selected", id === tab ? "true" : "false");
      }
    }
    render();
  }

  function renderRows(rows) {
    empty(tbody);
    for (let i = 0; i < rows.length; i++) {
      const entry = rows[i];
      const tr = make("tr", "", tbody);
      const rank = make("td", "rank", tr);
      rank.textContent = "#" + (i + 1);
      const score = make("td", "score", tr);
      score.textContent = fmtInt(entry.score);
      const time = make("td", "time", tr);
      time.textContent = fmtClock(entry.time);
      const bosses = make("td", "bosses", tr);
      bosses.textContent = fmtInt(entry.bossesDown) + "/5";
      const date = make("td", "date-col", tr);
      date.textContent = fmtDate(entry);
    }
  }

  function render() {
    const snapshot =
      typeof leaderboard.state === "function" ? leaderboard.state() : null;
    const best = snapshot ? snapshot.best : leaderboard.best();
    bestVal.textContent = best
      ? fmtInt(best.score) + " · " + fmtClock(best.time)
      : "—";

    const rows =
      tab === "daily" ? leaderboard.dailyTop(10) : leaderboard.top(10);
    renderRows(rows);
    scroll.classList.toggle("hidden", rows.length === 0);
    emptyEl.classList.toggle("hidden", rows.length > 0);
    emptyEl.textContent = tr(tab === "daily" ? "lb_empty_daily" : "lb_empty");
  }

  function applyTexts() {
    title.textContent = tr("lb_title");
    kicker.textContent = tr("lb_kicker");
    bestLbl.textContent = tr("lb_best");
    closeBtn.textContent = tr("lb_close");
    for (let i = 0; i < TABS.length; i++) {
      tabButtons[TABS[i].id].textContent = tr(TABS[i].key);
    }
    for (let i = 0; i < COLUMNS.length; i++) {
      headCells[i].textContent = tr(COLUMNS[i].key);
    }
    render();
  }

  // --- open / close -----------------------------------------------------------
  function open() {
    if (openFlag) return;
    openFlag = true;
    overlay.classList.remove("hidden");
    render();
    if (typeof closeBtn.focus === "function") {
      try {
        closeBtn.focus({ preventScroll: true });
      } catch {
        closeBtn.focus();
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

  bus.addEventListener("leaderboard-open", () => {
    open();
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
  setTab("all");

  return {
    open,
    close,
    isOpen: () => openFlag,
    refresh: render,
  };
}
