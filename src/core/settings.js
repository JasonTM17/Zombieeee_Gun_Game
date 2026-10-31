/**
 * Persistent settings, stored as JSON in localStorage under the key
 * "gungame.settings". There are no secrets in this project — only UI/gameplay
 * preferences live here.
 *
 * Defaults:
 *   { sensitivity: 1, volume: 0.8, lang: "en", highScore: 0 }
 *
 * Every read path (load()/get()) must SAFE-MERGE over the defaults:
 * missing or wrong-typed fields fall back to the default, unknown fields are
 * dropped, and values are validated/clamped:
 *   sensitivity: number in 0.5..3.0
 *   volume:      number in 0..1
 *   lang:        "en" | "vi"
 *   highScore:   non-negative integer
 * Corrupt/missing localStorage entries must never throw — return defaults.
 *
 * @returns {SettingsStore}
 */

/**
 * @typedef {Object} SettingsData
 * @property {number} sensitivity - mouse sensitivity multiplier, 0.5..3.0, default 1.
 * @property {number} volume - master audio volume, 0..1, default 0.8.
 * @property {"en"|"vi"} lang - UI language, default "en".
 * @property {number} highScore - best score so far, default 0.
 */

/**
 * @typedef {Object} SettingsStore
 * @property {() => SettingsData} get - current settings object (live values).
 * @property {(patch: Partial<SettingsData>) => SettingsData} set
 *   Merge the patch into the current settings, validate/clamp, persist to
 *   localStorage and return the new settings object. Callers that need to
 *   react (audio volume, i18n language) should also emit/handle
 *   "settings-changed" { patch } on the bus — see menus.js.
 * @property {() => SettingsData} load
 *   Re-read from localStorage, safe-merge with defaults and return the
 *   settings. Called once at bootstrap before anything reads settings.
 */

export function createSettings() {
  throw new Error("TODO: implement");
}
