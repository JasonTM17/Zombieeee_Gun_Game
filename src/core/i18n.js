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
 * Extra convenience keys registered by core beyond that list:
 *   reload, ammo, health, gameOver ("GAME OVER"), paused ("PAUSED"),
 *   youDied ("YOU DIED"), howtoTitle, key, action
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

/**
 * Translate a key in the active language.
 * @param {string} key
 * @param {Record<string, string|number>} [params] - "{name}" placeholders replaced by params.
 * @returns {string} the translated string, or the key itself if unknown.
 */

/**
 * Switch the active language (in-memory only; persist via settings.set({lang})).
 * Unknown language codes are ignored (stay on the current one).
 * @param {"en"|"vi"} lang
 * @returns {void}
 */

/**
 * @returns {"en"|"vi"} the active language code.
 */

const LANGS = ["en", "vi"];

/** @type {Record<string, Record<string, string>>} */
const dicts = {
  en: {},
  vi: {},
};

/** @type {"en"|"vi"} */
let lang = "en";

// --- core shared dictionary (menu + HUD strings, EN + VI) -------------------

registerBundle({
  en: {
    play: "Play",
    settings: "Settings",
    howToPlay: "How to Play",
    resume: "Resume",
    restart: "Restart",
    quitToMenu: "Quit to Menu",
    playAgain: "Play Again",
    menu: "Menu",
    score: "Score",
    highScore: "High Score",
    wave: "Wave",
    sensitivity: "Mouse Sensitivity",
    volume: "Volume",
    language: "Language",
    back: "Back",
    waveBanner: "WAVE {n}",
    waveClear: "WAVE {n} CLEARED",
    controls: {
      move: "Move",
      sprint: "Sprint",
      jump: "Jump",
      shoot: "Shoot",
      reload: "Reload",
      switchWeapon: "Switch weapon",
      pause: "Pause",
    },
    // extra convenience keys (see header)
    reload: "Reload",
    ammo: "Ammo",
    health: "Health",
    gameOver: "GAME OVER",
    paused: "PAUSED",
    youDied: "YOU DIED",
    howtoTitle: "How to Play",
    key: "Key",
    action: "Action",
  },
  vi: {
    play: "Chơi",
    settings: "Cài đặt",
    howToPlay: "Hướng dẫn chơi",
    resume: "Tiếp tục",
    restart: "Bắt đầu lại",
    quitToMenu: "Về menu",
    playAgain: "Chơi lại",
    menu: "Menu",
    score: "Điểm",
    highScore: "Kỷ lục",
    wave: "Đợt",
    sensitivity: "Độ nhạy chuột",
    volume: "Âm lượng",
    language: "Ngôn ngữ",
    back: "Quay lại",
    waveBanner: "ĐỢT {n}",
    waveClear: "ĐỢT {n} HOÀN THÀNH",
    controls: {
      move: "Di chuyển",
      sprint: "Chạy nhanh",
      jump: "Nhảy",
      shoot: "Bắn",
      reload: "Nạp đạn",
      switchWeapon: "Đổi súng",
      pause: "Tạm dừng",
    },
    // extra convenience keys (see header)
    reload: "Nạp đạn",
    ammo: "Đạn",
    health: "Máu",
    gameOver: "GAME OVER",
    paused: "TẠM DỪNG",
    youDied: "BẠN ĐÃ CHẾT",
    howtoTitle: "Hướng dẫn chơi",
    key: "Phím",
    action: "Hành động",
  },
});

/**
 * Look up a (possibly dot-path) key in one language dict.
 * @param {Record<string, unknown>} d
 * @param {string} key
 * @returns {string|undefined}
 */
function lookup(d, key) {
  if (!d) return undefined;
  if (Object.prototype.hasOwnProperty.call(d, key)) {
    const v = d[key];
    return typeof v === "string" ? v : undefined;
  }
  // one level of dot-path nesting ("controls.move")
  const dot = key.indexOf(".");
  if (dot > 0) {
    const head = d[key.slice(0, dot)];
    if (head && typeof head === "object") {
      const tail = key.slice(dot + 1);
      const v = /** @type {Record<string, unknown>} */ (head)[tail];
      return typeof v === "string" ? v : undefined;
    }
  }
  return undefined;
}

export function registerBundle(bundle) {
  if (!bundle || typeof bundle !== "object") return;
  for (const lc of LANGS) {
    const part = bundle[lc];
    if (!part || typeof part !== "object") continue;
    const target = dicts[lc];
    for (const [key, value] of Object.entries(part)) {
      if (typeof value === "string") {
        target[key] = value;
      } else if (value && typeof value === "object") {
        // merge one nested level (e.g. controls.*)
        const nested = /** @type {Record<string, unknown>} */ (value);
        const base =
          target[key] && typeof target[key] === "object"
            ? /** @type {Record<string, string>} */ (target[key])
            : {};
        for (const [k2, v2] of Object.entries(nested)) {
          if (typeof v2 === "string") base[k2] = v2;
        }
        target[key] = base;
      }
    }
  }
}

export function t(key, params) {
  let s = lookup(dicts[lang], key);
  if (s === undefined) s = lookup(dicts.en, key); // EN fallback for partial bundles
  if (s === undefined) return key; // never throw on unknown keys
  if (params && typeof params === "object") {
    for (const [name, value] of Object.entries(params)) {
      s = s.split("{" + name + "}").join(String(value));
    }
  }
  return s;
}

export function setLang(next) {
  if (next === "en" || next === "vi") {
    lang = next;
  }
}

export function getLang() {
  return lang;
}
