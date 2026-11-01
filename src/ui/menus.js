/**
 * DOM menu screens inside #ui. index.html sets #ui { pointer-events: none },
 * so every interactive panel MUST re-enable pointer-events: auto on itself.
 * ALL text goes through i18n.t(); extra keys (beyond the core set documented
 * in src/core/i18n.js) may be registered via i18n.registerBundle().
 *
 * Screens (show(name) with name in):
 * - "main":     TIẾP TỤC (GUN GAME 2.0 P4 §3.5 — visible ONLY while
 *               services?.save?.hasSave(), first button above PLAY) / PLAY /
 *               CHƠI TỰ DO / SINH TỒN / SETTINGS / HOW TO PLAY / THÀNH TỰU.
 *               TIẾP TỤC → emit "ui-continue" (P4-K2: main.js's menu-gated
 *               listener restores the run from "gungame.save.v1").
 *               PLAY → emit "ui-play" — P1 meaning (docs/EXPANSION-P1.md
 *               §5.5): start the STORY (intro slides → mission 1; main.js
 *               wires gamestate.startStory() + dialogue.showIntro()).
 *               CHƠI TỰ DO → emit "ui-play-free" (P1): free-roam start with
 *               NO intro slides — mission 1 activates immediately (main.js).
 *               SINH TỒN → emit "ui-endless" (GUN GAME 2.0 P4 §8.1 — integrator
 *               gap fill: main.js runs the P4-K14 start sequence).
 *               SETTINGS/HOW TO PLAY/THÀNH TỰU → internal screen
 *               switches (remember which screen BACK returns to).
 * - "settings": slider sensitivity 0.5–3.0, slider volume 0–100 (displayed %,
 *               stored as 0..1), language button EN⇄VI. Every change is saved
 *               IMMEDIATELY via settings.set({...}) AND emits
 *               "settings-changed" {patch} on the bus (main.js applies volume
 *               to audio live). Initialized from settings.get() when shown.
 *               BACK → previous screen.
 * - "howto":    key table: WASD, Shift, Space, Mouse, R, 1/2/3, Esc
 *               (i18n "controls.*" keys). BACK → previous screen.
 * - "pause":    RESUME / RESTART / SETTINGS / QUIT TO MENU →
 *               "ui-resume" / "ui-restart" / settings screen / "ui-quit".
 * - "gameover": SCORE + HIGH SCORE + PLAY AGAIN / MENU →
 *               "ui-play" / "ui-quit". PLAY AGAIN keeps "ui-play" — P1: it
 *               restarts the story (main.js keeps mission/money progress when
 *               the run reached mission ≥ 2, per docs/EXPANSION-P1.md §5.6.3).
 *               The numbers are refreshed by listening
 *               "state-changed" {state:"gameover", score, highScore} on the bus.
 * - "achievements": GUN GAME 2.0 P4 (§6.3) — 12-cell grid (unlocked = gold +
 *   bright, locked = dim; name/description via the "achv_{id}" keys that
 *   achievements.js registers at module level), a progress line
 *   ("achvProgress" {n}) and a THỐNG KÊ block fed by services.profile.get()
 *   (kills / headshots / deaths / bosses / money earned / playtime "H:MM:SS" /
 *   endless best "wave {w} · score {s}"). Rebuilt on every show of the screen,
 *   on "achievement-unlocked" (while open) and on a language change (while
 *   open). BACK returns to the screen it was opened from.
 * - "settings" gains a DIFFICULTY row (§6.3): three buttons Easy/Normal/Hard →
 *   settings.set({difficulty}) + "settings-changed" {patch:{difficulty}} on
 *   the bus; the active value re-renders from settings.get().difficulty on
 *   every show (fallback "normal" while settings.js has no difficulty field).
 * - "endlessOver": GUN GAME 2.0 P4 (§6.3/P4-K13 — integrator gap fill, shown
 *   by main.js on "endless-over" so it covers the gameover screen): kicker
 *   SINH TỐN KẾT THÚC + WAVE ĐẠT ĐƯỢC + ĐIỂM + KỶ LỤC + one VỀ MENU button →
 *   "ui-quit" (main drops the endless mode first).
 *
 * show(null) hides everything.
 *
 * Buttons are NOT handled here beyond emitting bus events — main.js routes
 * them to gamestate (start/resume/restart/toMenu) and input.lockPointer().
 * (bus dispatchEvent is synchronous, so lockPointer() inside main's listener
 * keeps the browser's user-activation for pointer lock.)
 *
 * main.js drives which screen is visible via show(name) on "state-changed"
 * (recommended: menu → "main", playing → null, paused → "pause",
 * gameover → "gameover").
 *
 * Implementation notes:
 * - Extra i18n keys registered here (merged, EN + VI): tagline, startHint,
 *   settingsTip, pausedHint, and the P1 key freePlay ("Free Roam" /
 *   "CHƠI TỰ DO" — docs/EXPANSION-P1.md §5.5.2).
 * - The language button calls i18n.setLang(next) AND settings.set({lang})
 *   (persistence), re-emits "settings-changed" {patch:{lang}} and re-renders
 *   every bound label so the switch is live on all screens.
 *
 * @param {HTMLElement} container - the #ui element.
 * @param {EventTarget} bus
 * @param {import("../core/settings.js").SettingsStore} settings
 * @param {{t: Function, registerBundle: Function, setLang: Function, getLang: Function}} i18n
 *   The i18n module namespace (see src/core/i18n.js); the language button also
 *   calls i18n.setLang(lang) alongside settings.set({lang}).
 * @param {{save?: {hasSave: () => boolean}, profile?: Object, achievements?: Object} | null} [services]
 *   GUN GAME 2.0 P4 (§3.5, P4-K20): optional services bag main.js passes
 *   (`{ save, profile, achievements }`). `save.hasSave()` drives the TIẾP TỤC
 *   button's visibility (re-evaluated every time the main screen is shown, so
 *   clearSave()/a new save refresh it). The achievements screen reads
 *   `achievements.all()` and `profile.get()` (P4-K20 — a missing service
 *   degrades to a fully-locked grid and zeroed stats, never throws).
 * @returns {Menus}
 */

// GUN GAME 2.0 P4 (§6.3): the FROZEN 12-id list for the achievements grid —
// only the ids are imported (no factory call); a missing services bag renders
// them all locked instead of an empty grid. Labels resolve through i18n
// because achievements.js registers its bundle at module level (P4-K20).
import { ACHV_IDS } from "../systems/achievements.js";

/**
 * @typedef {Object} Menus
 * @property {("main"|"settings"|"howto"|"pause"|"gameover"|"achievements"|null) => void} show
 *   Show one screen, or hide all menus when null.
 */

const MENU_BUNDLE = {
  en: {
    tagline: "Lock. Load. Survive the night.",
    startHint: "Click PLAY to capture the mouse — ESC pauses.",
    settingsTip: "Changes are saved instantly.",
    pausedHint: "Take a breath — the horde is still out there.",
    // P1 (docs/EXPANSION-P1.md §5.5.2): the free-roam start button.
    freePlay: "Free Roam",
    // GUN GAME 2.0 P4 (§8.2): the TIẾP TỤC button (visible while a save exists).
    continueGame: "Continue",
    // GUN GAME 2.0 P4 (§8.2 — integrator gap fill): the SINH TỒN nav button +
    // the endlessOver screen (§6.3/P4-K13). Verbatim EN column.
    endless: "Endless",
    endlessOver: "ENDLESS OVER",
    endlessWaveReached: "Wave reached: {n}",
    endlessScoreLbl: "Score",
    endlessBestLbl: "Best",
    // GUN GAME 2.0 P4 (§8.2 — Builder D): achievements screen + statistics +
    // difficulty row. Verbatim EN column of the contract table.
    achievements: "Achievements",
    achvProgress: "{n}/12 unlocked",
    statsTitle: "STATISTICS",
    statsKills: "Kills",
    statsHeadshots: "Headshot kills",
    statsDeaths: "Deaths",
    statsBosses: "Bosses down",
    statsMoney: "Money earned",
    statsPlaytime: "Playtime",
    statsEndlessBest: "Endless best",
    // Template for the endless-best value (§6.3: "wave {w} · score {s}").
    statsEndlessBestVal: "wave {w} · score {s}",
    difficulty: "Difficulty",
    diffEasy: "Easy",
    diffNormal: "Normal",
    diffHard: "Hard",
  },
  vi: {
    tagline: "Gắn đạn. Ngắm bắn. Sống sót qua đêm.",
    startHint: "Nhấn CHƠI để khóa chuột vào màn hình — ESC để tạm dừng.",
    settingsTip: "Mọi thay đổi được lưu ngay lập tức.",
    pausedHint: "Hít một hơi thật sâu — bầy zombie vẫn chờ ngoài kia.",
    // P1 (docs/EXPANSION-P1.md §5.5.2): the free-roam start button.
    freePlay: "CHƠI TỰ DO",
    // GUN GAME 2.0 P4 (§8.2): the TIẾP TỤC button (visible while a save exists).
    continueGame: "TIẾP TỤC",
    // GUN GAME 2.0 P4 (§8.2 — integrator gap fill): verbatim VI column.
    endless: "SINH TỒN",
    endlessOver: "SINH TỐN KẾT THÚC",
    endlessWaveReached: "Đợt đạt được: {n}",
    endlessScoreLbl: "Điểm",
    endlessBestLbl: "Kỷ lục",
    // GUN GAME 2.0 P4 (§8.2 — Builder D): verbatim VI column of the contract
    // table. statsEndlessBestVal is the §6.3 value template (EN keeps the
    // contract's literal "wave {w} · score {s}" shape; VI translates it).
    achievements: "THÀNH TỰU",
    achvProgress: "Đã mở {n}/12",
    statsTitle: "THỐNG KÊ",
    statsKills: "Số kill",
    statsHeadshots: "Kill vào đầu",
    statsDeaths: "Số lần chết",
    statsBosses: "Boss đã hạ",
    statsMoney: "Tổng tiền kiếm được",
    statsPlaytime: "Thời gian chơi",
    statsEndlessBest: "Kỷ lục Sinh Tồn",
    statsEndlessBestVal: "đợt {w} · điểm {s}",
    difficulty: "ĐỘ KHỘ",
    diffEasy: "Dễ",
    diffNormal: "Thường",
    diffHard: "Khó",
  },
};

// [keyLabel, i18n action key] — key labels are language-neutral.
const HOWTO_ROWS = [
  ["W A S D", "controls.move"],
  ["Shift", "controls.sprint"],
  ["Space", "controls.jump"],
  ["Mouse L", "controls.shoot"],
  ["R", "controls.reload"],
  ["1 / 2 / 3 · Wheel", "controls.switchWeapon"],
  ["Esc / P", "controls.pause"],
];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function make(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

function fmtInt(n) {
  return String(Math.max(0, Math.round(Number(n) || 0)));
}

export function createMenus(container, bus, settings, i18n, services) {
  if (!container || typeof container.appendChild !== "function") {
    throw new Error("createMenus: container (#ui) is required");
  }
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(MENU_BUNDLE);
  }

  // GUN GAME 2.0 P4: params forwarded — i18n.t(key, params) interpolates
  // {name} tokens (achvProgress {n}, statsEndlessBestVal {w}/{s},
  // endlessWaveReached {n}). The old 1-arg wrapper silently dropped them and
  // rendered the raw templates.
  const tr = (key, params) =>
    i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;

  const root = make("div", "menu-root", container);
  const emitUi = (name) => bus.dispatchEvent(new CustomEvent(name));
  const emitSettings = (patch) =>
    bus.dispatchEvent(new CustomEvent("settings-changed", { detail: { patch } }));

  // Every element whose text comes from i18n is bound here; applyTexts()
  // re-renders them all (initial render + live language switch).
  /** @type {{node: HTMLElement, key: string}[]} */
  const bindings = [];
  function bind(node, key) {
    bindings.push({ node, key });
    return node;
  }

  function button(labelKey, cls, onClick, parent) {
    const b = make("button", cls || "btn", parent);
    b.type = "button";
    bind(b, labelKey);
    b.addEventListener("click", onClick);
    return b;
  }

  // --- MAIN ------------------------------------------------------------------
  const sMain = make("section", "screen screen-main", root);
  const pMain = make("div", "panel main-panel", sMain);
  make("div", "kicker", pMain).textContent = "ZOMBIE SURVIVAL FPS";
  make("h1", "game-title", pMain).textContent = "GUN GAME";
  bind(make("p", "tagline", pMain), "tagline");
  const mainNav = make("div", "nav", pMain);
  // GUN GAME 2.0 P4 (§3.5): TIẾP TỤC — FIRST node of the nav (above CHƠI),
  // plain "btn" class (CHƠI keeps primary). Emits "ui-continue" (P4-K2: from
  // the menu main.js's restore listener runs; the P3 ending listener of the
  // same name is a harmless no-op there — removePause("ending") no-ops).
  // Visibility is driven by services.save.hasSave() — see refreshContinue().
  const continueBtn = button("continueGame", "btn", () => emitUi("ui-continue"), mainNav);
  button("play", "btn btn-primary", () => emitUi("ui-play"), mainNav);
  // P1 "CHƠI TỰ DO" right below PLAY (docs/EXPANSION-P1.md §5.5.2): free-roam
  // start — no intro slides, mission 1 active immediately (main.js wires it).
  button("freePlay", "btn", () => emitUi("ui-play-free"), mainNav);
  // GUN GAME 2.0 P4 (§6.3 — integrator gap fill): SINH TỒN, contract order
  // TIẾP TỤC → CHƠI → CHƠI TỰ DO → SINH TỒN → CÀI ĐẶT → HƯỚNG DẪN → THÀNH TỰU.
  // Emits "ui-endless" (§8.1) — main.js starts the endless mode (P4-K14).
  button("endless", "btn", () => emitUi("ui-endless"), mainNav);
  button("settings", "btn", () => openSettings("main"), mainNav);
  button("howToPlay", "btn", () => openHowto("main"), mainNav);
  // GUN GAME 2.0 P4 (§6.3): THÀNH TỰU — LAST entry of the nav (contract order:
  // TIẾP TỤC → CHƠI → CHƠI TỰ DO → SINH TỒN → CÀI ĐẶT → HƯỚNG DẪN → THÀNH TỰU).
  // Opens the internal achievements screen; BACK returns to the origin.
  button("achievements", "btn", () => openAchievements("main"), mainNav);
  bind(make("p", "hint", pMain), "startHint");

  // --- SETTINGS ----------------------------------------------------------------
  const sSet = make("section", "screen screen-settings", root);
  const pSet = make("div", "panel", sSet);
  bind(make("h2", "screen-title", pSet), "settings");
  const grid = make("div", "settings-grid", pSet);

  const rowSens = make("div", "setting-row", grid);
  bind(make("label", "setting-label", rowSens), "sensitivity");
  const sens = make("input", "setting-input", rowSens);
  sens.type = "range";
  sens.min = "0.5";
  sens.max = "3";
  sens.step = "0.05";
  const sensVal = make("span", "setting-value", rowSens);

  const rowVol = make("div", "setting-row", grid);
  bind(make("label", "setting-label", rowVol), "volume");
  const vol = make("input", "setting-input", rowVol);
  vol.type = "range";
  vol.min = "0";
  vol.max = "100";
  vol.step = "1";
  const volVal = make("span", "setting-value", rowVol);

  const rowLang = make("div", "setting-row", grid);
  bind(make("label", "setting-label", rowLang), "language");
  const langBtn = make("button", "btn btn-small lang-btn", rowLang);
  langBtn.type = "button";
  make("span", "setting-value", rowLang); // spacer keeps the grid aligned

  // GUN GAME 2.0 P4 (§6.3): DIFFICULTY row — Dễ / Thường / Khó. Persisted via
  // settings.set({difficulty}) and broadcast as "settings-changed"
  // {patch:{difficulty}} (waves.js + main.js cache the multipliers — P4-K15;
  // no module receives a settings ref). The active value re-renders in
  // refreshDiffUI(); note settings.js currently has no "difficulty" field, so
  // reads fall back to "normal" (P4-K18 ownership is tracked in issues).
  const rowDiff = make("div", "setting-row", grid);
  bind(make("label", "setting-label", rowDiff), "difficulty");
  const diffRow = make("div", "diff-row", rowDiff);
  diffRow.style.display = "flex";
  diffRow.style.gap = "8px";
  const DIFFS = /** @type {const} */ (["easy", "normal", "hard"]);
  const diffBtns = {
    easy: diffButton("diffEasy"),
    normal: diffButton("diffNormal"),
    hard: diffButton("diffHard"),
  };
  make("span", "setting-value", rowDiff); // spacer keeps the grid aligned

  /** Small builder so the three buttons stay identical (menus has no helper
   * for a non-nav button — same shape as langBtn above). */
  function diffButton(labelKey) {
    const b = make("button", "btn btn-small", diffRow);
    b.type = "button";
    bind(b, labelKey);
    b.addEventListener("click", () => setDifficulty(labelKey === "diffEasy" ? "easy" : labelKey === "diffNormal" ? "normal" : "hard"));
    return b;
  }

  /** One difficulty button click: persist + broadcast + re-render (§6.3). */
  function setDifficulty(value) {
    if (settings && typeof settings.set === "function") {
      settings.set({ difficulty: value });
    }
    emitSettings({ difficulty: value });
    refreshDiffUI();
  }

  /** Active state of the three difficulty buttons (inline styles — style.css
   * is outside every builder's file list). */
  function refreshDiffUI() {
    const s =
      settings && typeof settings.get === "function" ? settings.get() : null;
    const cur = (s && s.difficulty) || "normal"; // P4-K18 default
    for (const key of DIFFS) {
      const b = diffBtns[key];
      const active = key === cur;
      b.style.borderColor = active ? "var(--gg-gold)" : "#2b3d5c";
      b.style.color = active ? "var(--gg-gold)" : "";
      b.style.boxShadow = active ? "0 0 12px rgba(255, 211, 94, 0.25)" : "";
    }
  }

  bind(make("p", "settings-tip", pSet), "settingsTip");
  button("back", "btn", () => showScreen(settingsReturn), pSet);

  sens.addEventListener("input", () => {
    const v = clamp(parseFloat(sens.value) || 1, 0.5, 3);
    sensVal.textContent = v.toFixed(2) + "×";
    if (settings) settings.set({ sensitivity: v });
    emitSettings({ sensitivity: v });
  });

  vol.addEventListener("input", () => {
    const p = clamp(Math.round(Number(vol.value) || 0), 0, 100);
    volVal.textContent = p + "%";
    if (settings) settings.set({ volume: p / 100 });
    emitSettings({ volume: p / 100 });
  });

  langBtn.addEventListener("click", () => {
    const next = i18n && i18n.getLang && i18n.getLang() === "vi" ? "en" : "vi";
    if (i18n && typeof i18n.setLang === "function") i18n.setLang(next);
    if (settings) settings.set({ lang: next });
    emitSettings({ lang: next });
    applyTexts();
    refreshLangButton();
  });

  function refreshLangButton() {
    const cur = i18n && i18n.getLang ? i18n.getLang() : "en";
    const other = cur === "vi" ? "en" : "vi";
    langBtn.textContent = cur.toUpperCase() + "  ⇄  " + other.toUpperCase();
  }

  function refreshSettingsUI() {
    const s =
      settings && typeof settings.get === "function"
        ? settings.get()
        : { sensitivity: 1, volume: 0.8 };
    const sv = clamp(Number(s.sensitivity) || 1, 0.5, 3);
    sens.value = String(sv);
    sensVal.textContent = sv.toFixed(2) + "×";
    const vp = clamp(Math.round((Number(s.volume) || 0) * 100), 0, 100);
    vol.value = String(vp);
    volVal.textContent = vp + "%";
    refreshLangButton();
    refreshDiffUI(); // GUN GAME 2.0 P4 (§6.3): difficulty row follows settings
  }

  // --- HOW TO PLAY ---------------------------------------------------------------
  const sHow = make("section", "screen screen-howto", root);
  const pHow = make("div", "panel", sHow);
  bind(make("h2", "screen-title", pHow), "howtoTitle");
  const table = make("table", "keytable", pHow);
  const headRow = make("tr", "", make("thead", "", table));
  bind(make("th", "", headRow), "key");
  bind(make("th", "", headRow), "action");
  const tbody = make("tbody", "", table);
  for (const [keyLabel, actionKey] of HOWTO_ROWS) {
    const row = make("tr", "", tbody);
    const keyCell = make("td", "", row);
    make("span", "kbd", keyCell).textContent = keyLabel;
    bind(make("td", "action-cell", row), actionKey);
  }
  button("back", "btn", () => showScreen(howtoReturn), pHow);

  // --- PAUSE -------------------------------------------------------------------
  const sPause = make("section", "screen screen-pause", root);
  const pPause = make("div", "panel", sPause);
  bind(make("h2", "screen-title", pPause), "paused");
  bind(make("p", "hint", pPause), "pausedHint");
  const pauseNav = make("div", "nav", pPause);
  button("resume", "btn btn-primary", () => emitUi("ui-resume"), pauseNav);
  button("restart", "btn", () => emitUi("ui-restart"), pauseNav);
  button("settings", "btn", () => openSettings("pause"), pauseNav);
  button("quitToMenu", "btn", () => emitUi("ui-quit"), pauseNav);

  // --- GAME OVER -----------------------------------------------------------------
  const sOver = make("section", "screen screen-gameover", root);
  const pOver = make("div", "panel over-panel", sOver);
  bind(make("div", "kicker danger", pOver), "gameOver");
  bind(make("h2", "screen-title died-title", pOver), "youDied");
  const stats = make("div", "stats", pOver);
  const statScore = make("div", "stat-row", stats);
  bind(make("span", "stat-label", statScore), "score");
  const scoreOut = make("span", "stat-value", statScore);
  scoreOut.textContent = "0";
  const statHigh = make("div", "stat-row high", stats);
  bind(make("span", "stat-label", statHigh), "highScore");
  const highOut = make("span", "stat-value", statHigh);
  highOut.textContent = "0";
  const overNav = make("div", "nav", pOver);
  button("playAgain", "btn btn-primary", () => emitUi("ui-play"), overNav);
  button("menu", "btn", () => emitUi("ui-quit"), overNav);

  // Game-over numbers arrive via "state-changed" (see event table).
  bus.addEventListener("state-changed", (e) => {
    const d = e && e.detail ? e.detail : {};
    if (d.state === "gameover") {
      const storedHigh =
        settings && typeof settings.get === "function"
          ? Number(settings.get().highScore) || 0
          : 0;
      scoreOut.textContent = fmtInt(d.score);
      highOut.textContent = fmtInt(Math.max(Number(d.highScore) || 0, storedHigh));
    }
  });

  // --- ACHIEVEMENTS (GUN GAME 2.0 P4 §6.3 — Builder D) -----------------------------
  const sAchv = make("section", "screen screen-achievements", root);
  const pAchv = make("div", "panel achv-panel", sAchv);
  bind(make("h2", "screen-title", pAchv), "achievements");

  // Progress line — value text carries the {n} param, so it is set by
  // refreshAchievements() (NOT via bind, which writes raw keys).
  const achvProgress = make("p", "achv-progress", pAchv);
  achvProgress.style.cssText =
    "text-align:center;font-size:12px;letter-spacing:0.14em;" +
    "text-transform:uppercase;color:var(--gg-text-dim);margin:0 0 14px;";

  // 12-cell grid (inline styles — style.css is outside every builder's list).
  const achvGrid = make("div", "achv-grid", pAchv);
  achvGrid.style.cssText =
    "display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));" +
    "gap:10px;margin:0 0 18px;";

  // THỐNG KÊ block — reuses the gameover .stats/.stat-row classes for an
  // identical look; values are set by refreshAchievements().
  const statsBox = make("div", "achv-stats", pAchv);
  const statsTitle = bind(make("div", "achv-stats-title", statsBox), "statsTitle");
  statsTitle.style.cssText =
    "font-size:12px;font-weight:800;letter-spacing:0.22em;text-transform:" +
    "uppercase;color:var(--gg-gold);margin:4px 0 8px;";
  const achvStats = make("div", "stats", statsBox);
  /** [holder key, i18n label key] — values render in refreshAchievements(). */
  const STAT_ROWS = [
    ["kills", "statsKills"],
    ["headshots", "statsHeadshots"],
    ["deaths", "statsDeaths"],
    ["bosses", "statsBosses"],
    ["money", "statsMoney"],
    ["playtime", "statsPlaytime"],
    ["endlessBest", "statsEndlessBest"],
  ];
  const statOuts = {};
  for (const [slot, labelKey] of STAT_ROWS) {
    const row = make("div", "stat-row", achvStats);
    bind(make("span", "stat-label", row), labelKey);
    const val = make("span", "stat-value", row);
    val.textContent = "0";
    statOuts[slot] = val;
  }

  button("back", "btn", () => showScreen(achvReturn), pAchv);

  /** "H:MM:SS" — hours unpadded, minutes/seconds zero-padded (§6.3). */
  function fmtPlaytime(totalSec) {
    const s = Math.max(0, Math.floor(Number(totalSec) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h + ":" + String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  }

  /** One grid cell: name + description, bright/gold when unlocked, dim when
   * locked (§6.3). Rebuilt wholesale — cells are not bound to applyTexts. */
  function buildAchvCell(a) {
    const cell = make("div", "achv-cell", achvGrid);
    const on = a.unlocked === true;
    cell.style.cssText =
      "padding:10px 12px;border-radius:8px;background:var(--gg-chip);" +
      "border:1px solid " +
      (on ? "var(--gg-gold)" : "var(--gg-line)") +
      ";opacity:" + (on ? "1" : "0.55") + ";" +
      (on ? "box-shadow:0 0 12px rgba(255,211,94,0.18);" : "");
    const name = make("div", "achv-name", cell);
    name.style.cssText =
      "font-size:12px;font-weight:800;letter-spacing:0.08em;margin-bottom:4px;" +
      "color:" + (on ? "var(--gg-gold)" : "var(--gg-text-dim)") + ";";
    name.textContent = (on ? "✓ " : "") + tr(a.nameKey);
    const desc = make("div", "achv-desc", cell);
    desc.style.cssText =
      "font-size:11px;line-height:1.45;color:var(--gg-text-dim);";
    desc.textContent = tr(a.descKey);
  }

  /** Re-render progress + grid + stats from services. Missing services → a
   * fully-locked grid and zeroed stats, never a throw (P4-K20). */
  function refreshAchievements() {
    let list = null;
    const achv = services && services.achievements;
    if (achv && typeof achv.all === "function") {
      try {
        list = achv.all();
      } catch (err) {
        console.warn("[menus] achievements.all() failed", err);
        list = null;
      }
    }
    if (!Array.isArray(list) || list.length === 0) {
      // Degrade (P4-K20): no services → all 12 cells locked. The ids come
      // from the FROZEN contract list, so the labels still resolve via the
      // module-level i18n bundle achievements.js registers.
      list = ACHV_IDS.map((id) => ({
        id,
        unlocked: false,
        nameKey: "achv_" + id,
        descKey: "achv_" + id + "_desc",
      }));
    }
    let n = 0;
    for (let i = 0; i < list.length; i++) if (list[i].unlocked) n++;
    achvProgress.textContent = tr("achvProgress", { n });
    achvGrid.replaceChildren();
    for (let i = 0; i < list.length; i++) buildAchvCell(list[i]);

    // THỐNG KÊ (profile — P4-K21 get() returns a fresh shallow copy).
    const profile = services && services.profile;
    let p = null;
    if (profile && typeof profile.get === "function") {
      try {
        p = profile.get();
      } catch (err) {
        console.warn("[menus] profile.get() failed", err);
        p = null;
      }
    }
    const num = (v) => Math.max(0, Math.round(Number(v) || 0));
    statOuts.kills.textContent = fmtInt(p && p.kills);
    statOuts.headshots.textContent = fmtInt(p && p.headshots);
    statOuts.deaths.textContent = fmtInt(p && p.deaths);
    statOuts.bosses.textContent = fmtInt(p && p.bossesKilled);
    statOuts.money.textContent = "$" + fmtInt(p && p.moneyEarned);
    statOuts.playtime.textContent = fmtPlaytime(p && p.playtimeSec);
    const best = p && p.endlessBest ? p.endlessBest : null;
    statOuts.endlessBest.textContent = tr("statsEndlessBestVal", {
      w: num(best && best.wave),
      s: num(best && best.score),
    });
  }

  function openAchievements(from) {
    achvReturn = from;
    showScreen("achievements");
  }

  // --- ENDLESS OVER (GUN GAME 2.0 P4 §6.3/P4-K13 — integrator gap fill) ------
  // Shown by main.js on "endless-over" — it lands in the SAME "player-died"
  // dispatch AFTER the gameover screen (the last menus.show() call wins), so
  // it covers the gameover panel with the endless numbers.
  const sEndlessOver = make("section", "screen screen-endless-over", root);
  const pEndlessOver = make("div", "panel over-panel", sEndlessOver);
  bind(make("div", "kicker danger", pEndlessOver), "endlessOver");
  const eoStats = make("div", "stats", pEndlessOver);
  // The wave label carries the {n} param (§8.2) — NOT bound (bind writes the
  // raw template); refreshEndlessOver() renders "Wave reached: 12" from the
  // last "endless-over" payload (kept so a language flip re-renders).
  const eoWaveRow = make("div", "stat-row high", eoStats);
  const eoWaveLbl = make("span", "stat-label", eoWaveRow);
  const eoWaveOut = make("span", "stat-value", eoWaveRow);
  eoWaveOut.textContent = "0";
  const eoScoreRow = make("div", "stat-row", eoStats);
  bind(make("span", "stat-label", eoScoreRow), "endlessScoreLbl");
  const eoScoreOut = make("span", "stat-value", eoScoreRow);
  eoScoreOut.textContent = "0";
  const eoBestRow = make("div", "stat-row", eoStats);
  bind(make("span", "stat-label", eoBestRow), "endlessBestLbl");
  const eoBestOut = make("span", "stat-value", eoBestRow);
  eoBestOut.textContent = "0";
  const eoNav = make("div", "nav", pEndlessOver);
  // §6.3: the only button — VỀ MENU ("menu" key) → "ui-quit" (main drops the
  // endless mode first: endless.stop() heads its ui-quit listener, P4-K13).
  button("menu", "btn", () => emitUi("ui-quit"), eoNav);

  /** Last "endless-over" payload (0s until the first death in Endless). */
  const eoLast = { wave: 0, score: 0, bestWave: 0, bestScore: 0 };
  function refreshEndlessOver() {
    const num = (v) => Math.max(0, Math.round(Number(v) || 0));
    eoWaveLbl.textContent = tr("endlessWaveReached", { n: num(eoLast.wave) });
    eoWaveOut.textContent = fmtInt(num(eoLast.wave));
    eoScoreOut.textContent = fmtInt(num(eoLast.score));
    eoBestOut.textContent = tr("statsEndlessBestVal", {
      w: num(eoLast.bestWave),
      s: num(eoLast.bestScore),
    });
  }

  // The numbers arrive via "endless-over" {wave, score, bestWave, bestScore}
  // (§8.1) — payloads from endless.js at death; formatted with fmtInt.
  bus.addEventListener("endless-over", (e) => {
    const d = e && e.detail ? e.detail : {};
    eoLast.wave = Number(d.wave) || 0;
    eoLast.score = Number(d.score) || 0;
    eoLast.bestWave = Number(d.bestWave) || 0;
    eoLast.bestScore = Number(d.bestScore) || 0;
    refreshEndlessOver();
  });

  // Achievement unlock while the screen is open → re-render immediately.
  bus.addEventListener("achievement-unlocked", () => {
    if (curScreen === "achievements") refreshAchievements();
  });

  // Language switch (from any screen) while achievements is open → the grid
  // cells and stat values are not bound to applyTexts, rebuild them.
  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail && e.detail.patch ? e.detail.patch : null;
    if (patch && patch.lang && curScreen === "achievements") {
      refreshAchievements();
    }
    if (patch && patch.lang && curScreen === "endlessOver") {
      refreshEndlessOver();
    }
  });

  // --- screen switching + i18n rendering --------------------------------------------
  let settingsReturn = "main";
  let howtoReturn = "main";
  let achvReturn = "main"; // GUN GAME 2.0 P4: BACK target of the achievements screen
  let curScreen = null; // last showScreen() name — gates the rebuild listeners
  /** @type {Record<string, HTMLElement>} */
  const screens = {
    main: sMain,
    settings: sSet,
    howto: sHow,
    pause: sPause,
    gameover: sOver,
    achievements: sAchv, // GUN GAME 2.0 P4 (§6.3)
    endlessOver: sEndlessOver, // GUN GAME 2.0 P4 (§6.3/P4-K13)
  };

  function openSettings(from) {
    settingsReturn = from;
    showScreen("settings");
  }
  function openHowto(from) {
    howtoReturn = from;
    showScreen("howto");
  }

  // GUN GAME 2.0 P4 (§3.5): the TIẾP TỤC button exists only while a readable
  // save is present. services.save.hasSave() runs through the corruption guard
  // (a broken key reads as "no save"), so the button can never lead into a
  // dead restore. Re-evaluated on every show("main") — one localStorage read
  // per menu open, never per frame — so clearSave()/a fresh autosave refresh
  // it the next time the menu opens. style.css has no global ".hidden" rule
  // (only ".hud-root.hidden"), so the inline display toggle does the real
  // hiding; the class rides along for a future stylesheet rule.
  function refreshContinue() {
    const save = services && services.save;
    const has = !!(save && typeof save.hasSave === "function" && save.hasSave());
    continueBtn.classList.toggle("hidden", !has);
    continueBtn.style.display = has ? "" : "none";
  }

  function showScreen(name) {
    curScreen = name || null;
    for (const key in screens) {
      screens[key].classList.toggle("visible", key === name);
    }
    if (name === "settings") refreshSettingsUI();
    if (name === "main") refreshContinue(); // §3.5: re-check hasSave each open
    if (name === "achievements") refreshAchievements(); // §6.3: rebuild on show
    if (name === "endlessOver") refreshEndlessOver(); // §6.3: re-render on show
  }

  function applyTexts() {
    for (const b of bindings) b.node.textContent = tr(b.key);
    // Accessibility labels for the sliders (attribute, not textContent).
    sens.setAttribute("aria-label", tr("sensitivity"));
    vol.setAttribute("aria-label", tr("volume"));
  }

  applyTexts();
  refreshLangButton();
  refreshContinue(); // initial TIẾP TỤC state (hidden when no save / no services)

  return { show: showScreen };
}
