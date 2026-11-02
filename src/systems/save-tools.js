/**
 * ============================================================================
 * SAVE TOOLS — LOCAL EXPORT / IMPORT OF ALL PROGRESS.
 * ============================================================================
 * createSaveTools(bus, i18n) → { exportAll(), importFile(file), state() }
 *
 * There is no backend and no account: "cloud save" becomes one JSON bundle the
 * player downloads and keeps. This module never changes a save schema; it only
 * copies the FROZEN localStorage keys owned by the other systems.
 *
 * Bundle (version 1):
 * {
 *   app: "gun-game",
 *   version: 1,
 *   exportedAt: "<ISO date>",
 *   data: {
 *     "gungame.save.v1": {...},
 *     "gungame.profile.v1": {...},
 *     "gungame.achv.v1": {...},
 *     "gungame.codex.v1": {...},
 *     "gungame.codex.progress.v1": {...},
 *     "gungame.endless.v1": {...},
 *     "gungame.settings": {...}
 *   }
 * }
 * Only keys that exist on this device are included. Each value is parsed
 * defensively; an unparseable raw localStorage string is preserved as a string
 * instead of being dropped (import writes strings back verbatim).
 *
 * exportAll()
 * - Builds the bundle and downloads `gun-game-save-YYYYMMDD-HHmm.json` through
 *   a temporary <a download>. Without a DOM/Blob/URL (headless, tests) the
 *   download is a safe no-op and the result still carries the bundle.
 * - Returns { ok, bundle, filename, keys, downloaded } or
 *   { ok:false, error:"storage-unavailable" }.
 * - Emits "save-exported" {keys, filename, downloaded, at} /
 *   "save-export-error" {code, message}.
 *
 * importFile(file)
 * - Reads a File (a raw string body is accepted for tools/tests), validates
 *   app === "gun-game", version === 1 and data as a plain object. ONLY the
 *   seven whitelisted keys are written; every other key — "__proto__",
 *   "__constructor", arbitrary names — is ignored. Known sections are
 *   shape-checked before anything is written, so a corrupt bundle is refused
 *   without touching the current progress.
 * - Success: writes all sections, emits "save-imported"
 *   {keys, ignored, reloadScheduled, at} and reloads the page after 300 ms.
 * - Failure: emits "save-import-error" {code, message} and writes NOTHING.
 * - Returns a Promise resolving to {ok:true, keys, ignored, reloadScheduled}
 *   or {ok:false, error}.
 *
 * Keyboard (window level, no input.js changes)
 * - F5 exports (preventDefault stops the browser reload).
 * - F9 opens a hidden <input type=file> and imports the chosen file.
 * - Both work from every game state; repeats, Ctrl/Meta/Alt and text fields
 *   (INPUT/TEXTAREA/SELECT/contentEditable) are ignored.
 *
 * state() returns a fresh { lastExport, lastImport, keys } — ISO timestamps
 * (or null) and the list of known keys currently present on this device.
 *
 * No pause, no pointer-lock integration: this is a menu-level informational
 * tool. The UI (src/ui/save-tools.js) is purely presentational.
 *
 * Bus events emitted: "save-exported", "save-export-error", "save-imported",
 * "save-import-error". Bus events consumed: none.
 */

/**
 * @typedef {Object} SaveToolsBundle
 * @property {"gun-game"} app
 * @property {1} version
 * @property {string} exportedAt
 * @property {Record<string, unknown>} data
 */

/**
 * @typedef {Object} SaveToolsState
 * @property {string|null} lastExport
 * @property {string|null} lastImport
 * @property {string[]} keys
 */

// FROZEN storage keys (each is owned by the module named beside it).
export const SAVE_TOOLS_APP = "gun-game";
export const SAVE_TOOLS_VERSION = 1;
export const SAVE_TOOLS_KEYS = Object.freeze([
  "gungame.save.v1", // src/systems/save.js
  "gungame.profile.v1", // src/systems/profile.js
  "gungame.achv.v1", // src/systems/achievements.js
  "gungame.codex.v1", // src/ui/help.js
  "gungame.codex.progress.v1", // src/ui/help.js
  "gungame.endless.v1", // src/systems/endless.js
  "gungame.settings", // src/core/settings.js
]);

/**
 * Shared whitelist for every save transport (local file + cloud). Same frozen
 * array as SAVE_TOOLS_KEYS; exported under a neutral name so cloud-save.js can
 * import the contract without knowing about the local-file tool.
 */
export const KNOWN_KEYS = SAVE_TOOLS_KEYS;

const BUNDLE_MAX_BYTES = 5 * 1024 * 1024;
const VALUE_MAX_CHARS = 2 * 1024 * 1024;
const RELOAD_DELAY_MS = 300;

// English fallbacks used when the i18n bundle is not registered (the UI
// registers it as soon as createSaveToolsUI runs; the fallbacks keep F9 errors
// readable even for a system-only integration).
const ERROR_I18N = {
  "no-file": "saveErrNoFile",
  "file-type": "saveErrFileType",
  "read-failed": "saveErrRead",
  "too-large": "saveErrSize",
  "bad-json": "saveErrJson",
  "bad-bundle": "saveErrBundle",
  "bad-version": "saveErrVersion",
  "bad-value": "saveErrCorrupt",
  "empty": "saveErrEmpty",
  "storage-unavailable": "saveErrStorage",
  "storage-failed": "saveErrStorage",
  "import-failed": "saveImportFailed",
};
const ERROR_FALLBACK = {
  "no-file": "No file selected.",
  "file-type": "Choose a .json save file.",
  "read-failed": "Could not read that file.",
  "too-large": "That file is too large.",
  "bad-json": "That file is not valid JSON.",
  "bad-bundle": "This is not a Gun Game save bundle.",
  "bad-version": "Unsupported save bundle version.",
  "bad-value": "The bundle contains a corrupt save section.",
  "empty": "The bundle has no save sections.",
  "storage-unavailable": "Local storage is unavailable.",
  "storage-failed": "Could not write to local storage.",
  "import-failed": "Import failed.",
};

// --- small helpers -----------------------------------------------------------

/** True for a non-array object (JSON objects only). */
function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Two-digit zero padding for the download filename. */
function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

/** `YYYYMMDD-HHmm` in local time (matches the download filename contract). */
function filenameStamp(d) {
  return (
    String(d.getFullYear()) +
    pad2(d.getMonth() + 1) +
    pad2(d.getDate()) +
    "-" +
    pad2(d.getHours()) +
    pad2(d.getMinutes())
  );
}

/** localStorage, or null when blocked/missing (never throws). */
function getStorage() {
  try {
    const ls = typeof localStorage !== "undefined" ? localStorage : null;
    return ls && typeof ls.getItem === "function" && typeof ls.setItem === "function"
      ? ls
      : null;
  } catch {
    return null;
  }
}

/** True for a focused text field (the F5/F9 guard). */
function isTextTarget(el) {
  if (!el) return false;
  try {
    const tag = el.tagName ? String(el.tagName).toUpperCase() : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return el.isContentEditable === true;
  } catch {
    return false;
  }
}

// --- bundle parsing / validation --------------------------------------------

/**
 * Per-key shape guard. Every progress key stores a JSON object; the checks
 * mirror the reader each owner module already applies, so an imported save is
 * never guaranteed-corrupt on the next boot. Unknown extra fields are allowed
 * (the owner sanitizes them).
 * @param {string} key
 * @param {unknown} value
 * @returns {boolean}
 */
function validSection(key, value) {
  if (!isObject(value)) return false;
  const v = /** @type {Record<string, unknown>} */ (value);
  switch (key) {
    case "gungame.save.v1":
      return (
        v.v === 1 &&
        typeof v.money === "number" &&
        typeof v.mission === "number" &&
        Array.isArray(v.weapons) &&
        typeof v.difficulty === "string"
      );
    case "gungame.profile.v1":
      return true; // profile.js sanitizes every field
    case "gungame.achv.v1":
      return (
        v.v === 1 &&
        Array.isArray(v.ids) &&
        v.ids.every((id) => typeof id === "string")
      );
    case "gungame.codex.v1":
      return isObject(v.chars) && isObject(v.secrets);
    case "gungame.codex.progress.v1":
      return (
        isObject(v.bossKinds) &&
        (v.survivors === undefined || typeof v.survivors === "number")
      );
    case "gungame.endless.v1":
      return v.v === 1 && isObject(v.best);
    case "gungame.settings":
      return true; // settings.js safe-merges/clamps every field
    default:
      return false;
  }
}

/**
 * Turn one bundle section into the exact localStorage text. String values are
 * treated as raw localStorage text (an unparseable raw value was preserved on
 * export); if a string does parse, its shape is still checked.
 * @param {string} key
 * @param {unknown} value
 * @returns {{text: string}|{error: string}}
 */
function serializeSection(key, value) {
  if (typeof value === "string") {
    if (value.length > VALUE_MAX_CHARS) return { error: "bad-value" };
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      return { text: value }; // raw legacy/corrupt text — preserved, not trusted
    }
    if (!validSection(key, parsed)) return { error: "bad-value" };
    return { text: value };
  }
  if (!isObject(value) || !validSection(key, value)) {
    return { error: "bad-value" };
  }
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    return { error: "bad-value" };
  }
  if (typeof text !== "string" || text.length > VALUE_MAX_CHARS) {
    return { error: "bad-value" };
  }
  return { text };
}

/**
 * Validate the whole bundle and pre-serialize every section. Nothing is written
 * here, so a rejected bundle can never leave a partial import behind.
 * @param {string} text
 * @returns {{entries: Array<{key: string, text: string}>, ignored: string[]}|{error: string}}
 */
function parseBundle(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "bad-json" };
  }
  if (!isObject(parsed)) return { error: "bad-bundle" };
  const bundle = /** @type {Record<string, unknown>} */ (parsed);
  if (bundle.app !== SAVE_TOOLS_APP) return { error: "bad-bundle" };
  if (bundle.version !== SAVE_TOOLS_VERSION) return { error: "bad-version" };
  if (!isObject(bundle.data)) return { error: "bad-bundle" };

  const data = /** @type {Record<string, unknown>} */ (bundle.data);
  /** @type {Array<{key: string, text: string}>} */
  const entries = [];
  /** @type {string[]} */
  const ignored = [];

  const dataKeys = Object.keys(data);
  for (let i = 0; i < dataKeys.length; i++) {
    const key = dataKeys[i];
    if (SAVE_TOOLS_KEYS.indexOf(key) === -1) {
      ignored.push(key); // malicious/unknown key — never written
      continue;
    }
    const value = data[key];
    if (value === null || value === undefined) continue;
    const serialized = serializeSection(key, value);
    if (serialized.error) return { error: serialized.error };
    entries.push({ key, text: serialized.text });
  }

  if (entries.length === 0) return { error: "empty" };
  return { entries, ignored };
}

/** Read a File/Blob (or a string body) as text. */
function readFileText(file) {
  if (typeof file === "string") return Promise.resolve(file);
  if (file && typeof file.text === "function") {
    return Promise.resolve().then(() => file.text());
  }
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result == null ? "" : reader.result));
        reader.onerror = () => reject(reader.error || new Error("read failed"));
        reader.readAsText(file);
      } catch (err) {
        reject(err);
      }
    });
  }
  return Promise.reject(new Error("no file reader"));
}

/** Blob + temporary <a download> click; false when the environment has no DOM. */
function triggerDownload(text, filename) {
  try {
    if (
      typeof document === "undefined" ||
      typeof Blob === "undefined" ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      return false;
    }
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    if (!a || typeof a.click !== "function") {
      try {
        if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
      return false;
    }
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    if (typeof a.setAttribute === "function") a.setAttribute("download", filename);

    const parent = document.body || document.documentElement;
    if (!parent || typeof parent.appendChild !== "function") {
      try {
        if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
      return false;
    }
    parent.appendChild(a);
    let ok = true;
    try {
      a.click();
    } catch {
      ok = false;
    }
    try {
      if (typeof parent.removeChild === "function") parent.removeChild(a);
      else if (typeof a.remove === "function") a.remove();
    } catch {
      /* element cleanup is best-effort */
    }
    // Revoke later: some browsers abort an immediate revoke before the download
    // starts. Guarded for environments without timers.
    try {
      setTimeout(() => {
        try {
          if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }, 1000);
    } catch {
      try {
        if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }
    return ok;
  } catch {
    return false;
  }
}

// --- bundle collection (shared with cloud-save.js) ---------------------------

/**
 * Copy every known, present key into a version-1 bundle. Values are parsed
 * defensively; unparseable text is preserved as a string (same contract as the
 * local export).
 * @param {Storage} ls
 * @param {Date} now
 * @returns {{bundle: SaveToolsBundle, keys: string[]}}
 */
function buildBundleFromStorage(ls, now) {
  const data = {};
  const keys = [];
  for (let i = 0; i < SAVE_TOOLS_KEYS.length; i++) {
    const key = SAVE_TOOLS_KEYS[i];
    /** @type {string|null} */
    let raw = null;
    try {
      raw = ls.getItem(key);
    } catch {
      raw = null;
    }
    if (raw === null || raw === undefined) continue;
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw; // raw localStorage text — preserved for a faithful backup
    }
    data[key] = value;
    keys.push(key);
  }
  return {
    bundle: /** @type {SaveToolsBundle} */ ({
      app: SAVE_TOOLS_APP,
      version: SAVE_TOOLS_VERSION,
      exportedAt: now.toISOString(),
      data,
    }),
    keys,
  };
}

/**
 * Build the same bundle the local exporter writes, without downloading it.
 * Used by cloud-save.js so both transports share one whitelist and one
 * serialization path.
 * @param {Date} [now]
 * @returns {{ok: true, bundle: SaveToolsBundle, keys: string[]}|{ok: false, error: "storage-unavailable"}}
 */
export function collectBundle(now) {
  const ls = getStorage();
  if (!ls) return { ok: false, error: "storage-unavailable" };
  const when =
    now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const built = buildBundleFromStorage(ls, when);
  return { ok: true, bundle: built.bundle, keys: built.keys };
}

// --- factory -----------------------------------------------------------------

/**
 * @param {EventTarget} [bus] - shared game bus.
 * @param {{t?: Function, registerBundle?: Function}} [i18n] - core i18n module.
 */
export function createSaveTools(bus, i18n) {
  const B = bus && typeof bus.dispatchEvent === "function" ? bus : null;

  /** @type {string|null} */
  let lastExportAt = null;
  /** @type {string|null} */
  let lastImportAt = null;
  /** @type {any} */
  let reloadTimer = 0;
  /** @type {HTMLInputElement|null} */
  let picker = null;

  function translate(key, fallback) {
    try {
      const text =
        i18n && typeof i18n.t === "function" ? i18n.t(key) : key;
      return typeof text === "string" && text && text !== key ? text : fallback;
    } catch {
      return fallback;
    }
  }

  function messageFor(code) {
    return translate(ERROR_I18N[code], ERROR_FALLBACK[code] || "Import failed.");
  }

  function emit(name, detail) {
    if (!B) return;
    try {
      let event;
      if (typeof CustomEvent === "function") {
        event = new CustomEvent(name, { detail });
      } else if (typeof Event === "function") {
        event = new Event(name);
        event.detail = detail;
      } else {
        event = { type: name, detail };
      }
      B.dispatchEvent(event);
    } catch (err) {
      console.warn("[save-tools] emit failed for", name, err);
    }
  }

  /** Known keys with a non-null value right now (fresh array). */
  function presentKeys() {
    const ls = getStorage();
    if (!ls) return [];
    const out = [];
    for (let i = 0; i < SAVE_TOOLS_KEYS.length; i++) {
      const key = SAVE_TOOLS_KEYS[i];
      try {
        if (ls.getItem(key) !== null) out.push(key);
      } catch {
        /* one blocked key must not hide the others */
      }
    }
    return out;
  }

  /** Export every existing section and trigger the browser download. */
  function exportAll() {
    const ls = getStorage();
    if (!ls) {
      const error = "storage-unavailable";
      emit("save-export-error", { code: error, message: messageFor(error) });
      return { ok: false, error };
    }

    const now = new Date();
    const built = buildBundleFromStorage(ls, now);
    let json;
    try {
      json = JSON.stringify(built.bundle, null, 2);
    } catch {
      const error = "storage-failed";
      emit("save-export-error", { code: error, message: messageFor(error) });
      return { ok: false, error };
    }

    const filename = "gun-game-save-" + filenameStamp(now) + ".json";
    const downloaded = triggerDownload(json, filename);
    lastExportAt = built.bundle.exportedAt;
    emit("save-exported", {
      keys: built.keys,
      filename,
      downloaded,
      at: lastExportAt,
    });
    return {
      ok: true,
      bundle: built.bundle,
      filename,
      keys: built.keys,
      downloaded,
    };
  }

  /** Write the validated entries. Called only after the bundle passes checks. */
  function writeEntries(entries) {
    const ls = getStorage();
    if (!ls) return { ok: false, error: "storage-unavailable" };

    // Snapshot the affected keys first so a quota error halfway through can
    // restore the previous mix instead of leaving a half-imported profile.
    /** @type {Array<string|null>} */
    const previous = [];
    for (let i = 0; i < entries.length; i++) {
      try {
        previous.push(ls.getItem(entries[i].key));
      } catch {
        return { ok: false, error: "storage-unavailable" };
      }
    }

    /** @type {number[]} */
    const written = [];
    for (let i = 0; i < entries.length; i++) {
      try {
        ls.setItem(entries[i].key, entries[i].text);
        written.push(i);
      } catch {
        for (let j = written.length - 1; j >= 0; j--) {
          const idx = written[j];
          try {
            if (previous[idx] === null) {
              if (typeof ls.removeItem === "function") {
                ls.removeItem(entries[idx].key);
              }
            } else {
              ls.setItem(entries[idx].key, previous[idx]);
            }
          } catch {
            /* rollback is best-effort after a storage failure */
          }
        }
        return { ok: false, error: "storage-failed" };
      }
    }
    const keys = entries.map((entry) => entry.key);
    return { ok: true, keys };
  }

  /** Read + validate + write one file. Never rejects. */
  async function runImport(file) {
    if (!file) return { ok: false, error: "no-file" };

    if (typeof file !== "string") {
      const size = Number(file.size);
      if (Number.isFinite(size) && size > BUNDLE_MAX_BYTES) {
        return { ok: false, error: "too-large" };
      }
    }

    let text;
    try {
      text = await readFileText(file);
    } catch {
      return { ok: false, error: "read-failed" };
    }
    if (typeof text !== "string") text = String(text == null ? "" : text);
    if (text.length > BUNDLE_MAX_BYTES) return { ok: false, error: "too-large" };

    const parsed = parseBundle(text);
    if (parsed.error) return { ok: false, error: parsed.error };
    const written = writeEntries(parsed.entries);
    if (!written.ok) return written;
    return { ok: true, keys: written.keys, ignored: parsed.ignored };
  }

  /** Reload after the imported state is safely in storage. */
  function scheduleReload() {
    let loc = null;
    try {
      if (typeof location !== "undefined") loc = location;
      else if (typeof window !== "undefined") loc = window.location;
    } catch {
      loc = null;
    }
    if (!loc || typeof loc.reload !== "function") return false;
    try {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        reloadTimer = 0;
        try {
          loc.reload();
        } catch {
          /* navigation blocked — the import itself already succeeded */
        }
      }, RELOAD_DELAY_MS);
      return true;
    } catch {
      return false;
    }
  }

  /** Import a File (or a raw JSON string). Emits success/error events. */
  async function importFile(file) {
    let result;
    try {
      result = await runImport(file);
    } catch (err) {
      console.warn("[save-tools] import failed", err);
      result = { ok: false, error: "import-failed" };
    }

    if (result.ok) {
      lastImportAt = new Date().toISOString();
      const reloadScheduled = scheduleReload();
      emit("save-imported", {
        keys: result.keys,
        ignored: result.ignored || [],
        reloadScheduled,
        at: lastImportAt,
      });
      return {
        ok: true,
        keys: result.keys,
        ignored: result.ignored || [],
        reloadScheduled,
        at: lastImportAt,
      };
    }

    const code = result.error || "import-failed";
    emit("save-import-error", {
      code,
      message: messageFor(code),
      at: new Date().toISOString(),
    });
    return { ok: false, error: code };
  }

  // --- F9 hidden picker ------------------------------------------------------
  function ensurePicker() {
    if (picker) return picker;
    try {
      if (typeof document === "undefined" || typeof document.createElement !== "function") {
        return null;
      }
      const input = /** @type {HTMLInputElement} */ (document.createElement("input"));
      input.type = "file";
      input.accept = ".json,application/json";
      input.style.display = "none";
      input.tabIndex = -1;
      if (typeof input.setAttribute === "function") {
        input.setAttribute("aria-hidden", "true");
      }
      const parent = document.body || document.documentElement;
      if (!parent || typeof parent.appendChild !== "function") return null;
      parent.appendChild(input);
      input.addEventListener("change", () => {
        const files = input.files;
        const file = files && files.length ? files[0] : null;
        try {
          input.value = "";
        } catch {
          /* resetting the picker is best-effort */
        }
        if (file) importFile(file);
      });
      picker = input;
      return input;
    } catch {
      return null;
    }
  }

  /** Open the hidden file picker (also exposed for UI/tests). */
  function openImportPicker() {
    const input = ensurePicker();
    if (!input || typeof input.click !== "function") return false;
    try {
      input.click();
      return true;
    } catch {
      return false;
    }
  }

  // --- F5 / F9 ---------------------------------------------------------------
  function onKeydown(e) {
    if (!e || e.repeat === true) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const code = e.code || e.key;
    if (code !== "F5" && code !== "F9") return;

    let active = null;
    try {
      active = typeof document !== "undefined" ? document.activeElement : null;
    } catch {
      active = null;
    }
    if (isTextTarget(e.target) || isTextTarget(active)) return;

    if (typeof e.preventDefault === "function") e.preventDefault();
    try {
      if (code === "F5") exportAll();
      else openImportPicker();
    } catch (err) {
      console.warn("[save-tools] shortcut failed", code, err);
    }
  }

  const win =
    typeof window !== "undefined" && window && typeof window.addEventListener === "function"
      ? window
      : typeof globalThis !== "undefined" &&
          typeof globalThis.addEventListener === "function"
        ? globalThis
        : null;
  if (win) win.addEventListener("keydown", onKeydown);

  /** Fresh snapshot for UI/debug: timestamps + currently present keys. */
  function state() {
    return {
      lastExport: lastExportAt,
      lastImport: lastImportAt,
      keys: presentKeys(),
    };
  }

  return { exportAll, importFile, state, openImportPicker };
}
