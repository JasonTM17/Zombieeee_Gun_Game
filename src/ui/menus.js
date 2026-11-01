/**
 * DOM menu screens inside #ui. index.html sets #ui { pointer-events: none },
 * so every interactive panel MUST re-enable pointer-events: auto on itself.
 * ALL text goes through i18n.t(); extra keys (beyond the core set documented
 * in src/core/i18n.js) may be registered via i18n.registerBundle().
 *
 * Screens (show(name) with name in):
 * - "main":     TIẾP TỤC (GUN GAME 2.0 P4 §3.5 — visible ONLY while
 *               services?.save?.hasSave(), first button above PLAY) / PLAY /
 *               CHƠI TỰ DO / SETTINGS / HOW TO PLAY.
 *               TIẾP TỤC → emit "ui-continue" (P4-K2: main.js's menu-gated
 *               listener restores the run from "gungame.save.v1").
 *               PLAY → emit "ui-play" — P1 meaning (docs/EXPANSION-P1.md
 *               §5.5): start the STORY (intro slides → mission 1; main.js
 *               wires gamestate.startStory() + dialogue.showIntro()).
 *               CHƠI TỰ DO → emit "ui-play-free" (P1): free-roam start with
 *               NO intro slides — mission 1 activates immediately (main.js).
 *               SETTINGS/HOW TO PLAY → internal screen
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
 *   settingsTip, pausedHint, the P1 key freePlay ("Free Roam" /
 *   "CHƠI TỰ DO" — docs/EXPANSION-P1.md §5.5.2) and the GUN GAME 2.0 P4 key
 *   continueGame ("Continue" / "TIẾP TỤC" — §8.2).
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
 *   clearSave()/a new save refresh it). Later P4 screens read the other
 *   services; a missing bag degrades gracefully, never throws.
 * @returns {Menus}
 */

/**
 * @typedef {Object} Menus
 * @property {("main"|"settings"|"howto"|"pause"|"gameover"|null) => void} show
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

  const tr = (key) => (i18n && typeof i18n.t === "function" ? i18n.t(key) : key);

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
  button("settings", "btn", () => openSettings("main"), mainNav);
  button("howToPlay", "btn", () => openHowto("main"), mainNav);
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

  // --- screen switching + i18n rendering --------------------------------------------
  let settingsReturn = "main";
  let howtoReturn = "main";
  /** @type {Record<string, HTMLElement>} */
  const screens = {
    main: sMain,
    settings: sSet,
    howto: sHow,
    pause: sPause,
    gameover: sOver,
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
    for (const key in screens) {
      screens[key].classList.toggle("visible", key === name);
    }
    if (name === "settings") refreshSettingsUI();
    if (name === "main") refreshContinue(); // §3.5: re-check hasSave each open
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
