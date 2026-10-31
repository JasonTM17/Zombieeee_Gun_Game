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

const STORAGE_KEY = "gungame.settings";

const DEFAULTS = Object.freeze({
  sensitivity: 1,
  volume: 0.8,
  lang: "en",
  highScore: 0,
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Coerce arbitrary parsed JSON into a valid SettingsData: unknown fields
 * dropped, wrong types defaulted, numbers clamped to their ranges.
 * @param {unknown} raw
 * @returns {SettingsData}
 */
function sanitize(raw) {
  const out = { ...DEFAULTS };
  if (raw && typeof raw === "object") {
    const o = /** @type {Record<string, unknown>} */ (raw);
    if (typeof o.sensitivity === "number" && Number.isFinite(o.sensitivity)) {
      out.sensitivity = clamp(o.sensitivity, 0.5, 3.0);
    }
    if (typeof o.volume === "number" && Number.isFinite(o.volume)) {
      out.volume = clamp(o.volume, 0, 1);
    }
    if (o.lang === "en" || o.lang === "vi") {
      out.lang = o.lang;
    }
    if (typeof o.highScore === "number" && Number.isFinite(o.highScore) && o.highScore >= 0) {
      out.highScore = Math.floor(o.highScore);
    }
  }
  return out;
}

function persist(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Private mode / quota / blocked storage: settings stay in-memory only.
  }
}

export function createSettings() {
  let current = { ...DEFAULTS };

  return {
    get() {
      return current;
    },

    set(patch) {
      current = sanitize({ ...current, ...(patch || {}) });
      persist(current);
      return { ...current };
    },

    load() {
      let raw = null;
      try {
        const text = localStorage.getItem(STORAGE_KEY);
        if (text != null) raw = JSON.parse(text);
      } catch {
        raw = null; // corrupt JSON or blocked storage -> defaults
      }
      current = sanitize(raw);
      return { ...current };
    },
  };
}
