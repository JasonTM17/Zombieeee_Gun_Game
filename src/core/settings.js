/**
 * Persistent settings, stored as JSON in localStorage under the key
 * "gungame.settings". There are no secrets in this project — only UI/gameplay
 * preferences live here.
 *
 * Defaults:
 *   { sensitivity: 1, volume: 0.8, lang: "en", highScore: 0, difficulty: "normal",
 *     fov: 75, shake: 100, crosshairColor: "white", crosshairSize: 1,
 *     damageNumbers: true, reducedMotion: false }
 *
 * Every read path (load()/get()) must SAFE-MERGE over the defaults:
 * missing or wrong-typed fields fall back to the default, unknown fields are
 * dropped, and values are validated/clamped:
 *   sensitivity: number in 0.5..3.0
 *   volume:      number in 0..1
 *   lang:        "en" | "vi"
 *   highScore:   non-negative integer
 *   difficulty:  "easy" | "normal" | "hard" (GUN GAME 2.0 P4 — P4-K18)
 *   fov:         integer 60..110 (default 75 = the pre-setting camera FOV)
 *   shake:       integer 0..100 (default 100 = the pre-setting shake)
 *   crosshairColor: "cyan" | "green" | "amber" | "white" (default "white",
 *                   whose hex is the pre-setting #e6f1ff tick color)
 *   crosshairSize:  number 0.75..1.5, quantized to the slider's 0.05 step
 *                   (default 1 = the pre-setting crosshair geometry)
 *   damageNumbers:  boolean (default true)
 *   reducedMotion:  boolean (default false)
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
 * @property {"easy"|"normal"|"hard"} difficulty - zombie hp/dmg/spawn-density
 *   preset, default "normal" (GUN GAME 2.0 P4, docs/EXPANSION-P4.md P4-K18).
 * @property {number} fov - camera vertical field of view, 60..110, default 75.
 * @property {number} shake - camera-shake intensity, 0..100, default 100.
 * @property {"cyan"|"green"|"amber"|"white"} crosshairColor - crosshair preset,
 *   default "white".
 * @property {number} crosshairSize - crosshair scale, 0.75..1.5, default 1.
 * @property {boolean} damageNumbers - floating damage numbers, default true.
 * @property {boolean} reducedMotion - disable shake + shorten HUD pulses,
 *   default false.
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

/**
 * Crosshair color presets (user request). The hex values are also consumed by
 * hud.js (paint) and menus.js (swatches) so the two can never drift. "white"
 * is the pre-setting tick color (#e6f1ff) — the default look stays identical.
 * @type {Readonly<Record<"cyan"|"green"|"amber"|"white", string>>}
 */
export const CROSSHAIR_COLORS = Object.freeze({
  cyan: "#7fe3ff",
  green: "#8affa0",
  amber: "#ffc45e",
  white: "#e6f1ff",
});

const DEFAULTS = Object.freeze({
  sensitivity: 1,
  volume: 0.8,
  lang: "en",
  highScore: 0,
  difficulty: "normal", // GUN GAME 2.0 P4 (P4-K18)
  // Accessibility / game feel — every default reproduces the pre-setting look
  // and behavior exactly (75 FOV, full shake, the #e6f1ff crosshair at 1x,
  // damage numbers on, motion enabled).
  fov: 75,
  shake: 100,
  crosshairColor: "white",
  crosshairSize: 1,
  damageNumbers: true,
  reducedMotion: false,
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
    // GUN GAME 2.0 P4 (P4-K18): only the three frozen presets pass; anything
    // else (missing / typo / old save without the field) → default "normal".
    if (o.difficulty === "easy" || o.difficulty === "normal" || o.difficulty === "hard") {
      out.difficulty = o.difficulty;
    }
    // Accessibility / game feel (user request): same safe-merge rules. The
    // ranges mirror the settings-screen sliders; corrupt/unknown values fall
    // back to the defaults above, never to NaN.
    if (typeof o.fov === "number" && Number.isFinite(o.fov)) {
      out.fov = clamp(Math.round(o.fov), 60, 110);
    }
    if (typeof o.shake === "number" && Number.isFinite(o.shake)) {
      out.shake = clamp(Math.round(o.shake), 0, 100);
    }
    if (
      typeof o.crosshairColor === "string" &&
      Object.prototype.hasOwnProperty.call(CROSSHAIR_COLORS, o.crosshairColor)
    ) {
      out.crosshairColor = o.crosshairColor;
    }
    if (typeof o.crosshairSize === "number" && Number.isFinite(o.crosshairSize)) {
      // Quantize to the slider's 0.05 step (17/20 → String "0.85").
      out.crosshairSize = clamp(Math.round(o.crosshairSize * 20) / 20, 0.75, 1.5);
    }
    if (typeof o.damageNumbers === "boolean") {
      out.damageNumbers = o.damageNumbers;
    }
    if (typeof o.reducedMotion === "boolean") {
      out.reducedMotion = o.reducedMotion;
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
