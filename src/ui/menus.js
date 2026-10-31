/**
 * DOM menu screens inside #ui. index.html sets #ui { pointer-events: none },
 * so every interactive panel MUST re-enable pointer-events: auto on itself.
 * ALL text goes through i18n.t(); extra keys (beyond the core set documented
 * in src/core/i18n.js) may be registered via i18n.registerBundle().
 *
 * Screens (show(name) with name in):
 * - "main":     PLAY / SETTINGS / HOW TO PLAY.
 *               PLAY → emit "ui-play". SETTINGS/HOW TO PLAY → internal screen
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
 *               "ui-play" / "ui-quit". The numbers are refreshed by listening
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
 * @param {HTMLElement} container - the #ui element.
 * @param {EventTarget} bus
 * @param {import("../core/settings.js").SettingsStore} settings
 * @param {{t: Function, registerBundle: Function, setLang: Function, getLang: Function}} i18n
 *   The i18n module namespace (see src/core/i18n.js); the language button also
 *   calls i18n.setLang(lang) alongside settings.set({lang}).
 * @returns {Menus}
 */

/**
 * @typedef {Object} Menus
 * @property {("main"|"settings"|"howto"|"pause"|"gameover"|null) => void} show
 *   Show one screen, or hide all menus when null.
 */

export function createMenus(container, bus, settings, i18n) {
  throw new Error("TODO: implement");
}
