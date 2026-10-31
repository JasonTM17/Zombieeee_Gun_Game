/**
 * Minimal module-level i18n for EN/VI. Not a factory — these are plain
 * exported functions sharing one internal dictionary store.
 *
 * - Dictionaries are keyed by language code: "en" | "vi".
 * - The core implementation pre-registers the shared menu + HUD strings for
 *   BOTH languages. UI modules may add more keys with registerBundle(); a
 *   bundle is MERGED into the existing dictionaries (per language, per key),
 *   never replacing what is already there. Later registrations win per key.
 * - Placeholder syntax in values: "{name}". Example: value "WAVE {n}" with
 *   t("waveBanner", { n: 3 }) → "WAVE 3". Missing params are left as-is.
 * - t() NEVER throws: an unknown key returns the key itself.
 *
 * Core key set (EN + VI must both exist; menus + HUD shared strings):
 *   play, settings, howToPlay, resume, restart, quitToMenu, playAgain, menu,
 *   score, highScore, wave, sensitivity, volume, language, back,
 *   waveBanner ("WAVE {n}"), waveClear ("WAVE {n} CLEARED"),
 *   controls.move (WASD), controls.sprint (Shift), controls.jump (Space),
 *   controls.shoot (Mouse), controls.reload (R),
 *   controls.switchWeapon (1/2/3 or wheel), controls.pause (Esc/P)
 *
 * setLang() is in-memory only — persistence goes through settings.set({ lang })
 * (main.js applies settings.get().lang on boot; menus.js calls both when the
 * language button is used).
 */

/**
 * Merge a language bundle into the dictionaries.
 * @param {{en: Record<string, string>, vi: Record<string, string>}} bundle
 * @returns {void}
 */
export function registerBundle(bundle) {
  throw new Error("TODO: implement");
}

/**
 * Translate a key in the active language.
 * @param {string} key
 * @param {Record<string, string|number>} [params] - "{name}" placeholders replaced by params.
 * @returns {string} the translated string, or the key itself if unknown.
 */
export function t(key, params) {
  throw new Error("TODO: implement");
}

/**
 * Switch the active language (in-memory only; persist via settings.set({lang})).
 * Unknown language codes are ignored (stay on the current one).
 * @param {"en"|"vi"} lang
 * @returns {void}
 */
export function setLang(lang) {
  throw new Error("TODO: implement");
}

/**
 * @returns {"en"|"vi"} the active language code.
 */
export function getLang() {
  throw new Error("TODO: implement");
}
