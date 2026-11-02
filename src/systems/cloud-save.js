/**
 * ============================================================================
 * CLOUD SAVE — optional cross-device saves through /api/cloud-save.
 * ============================================================================
 * createCloudSave(bus) → { code(), save(code?), load(code), remove(code),
 *                          state(), resetLocal() }
 *
 * There is no account and no auth: the save CODE is the capability. Anyone who
 * knows a code can read or overwrite that cloud save, so the UI warns players
 * not to store personal data. Codes are 10 characters from a 31-symbol
 * alphabet (no 0/O/1/I/L), ~49.5 bits, generated with crypto.getRandomValues
 * and cached in localStorage under "gungame.cloud.code.v1".
 *
 * The transport reuses the local backup contract exactly:
 * - KNOWN_KEYS / collectBundle() come from src/systems/save-tools.js, so cloud
 *   and file backups always carry the same seven whitelisted sections.
 * - A load validates { app:"gun-game", version:1, data:object }, ignores every
 *   non-whitelisted key, snapshots the previous values, writes, and schedules
 *   a reload after 300 ms (same delay as the local import).
 *
 * save(code?)
 *   POST { code, data } → 200 { ok, code, savedAt }
 *   Persists the code, emits "cloud-save-saved" { code, at }.
 *   → { ok:true, code } | { ok:false, error }
 *
 * load(code)
 *   GET ?code=… → writes known sections, emits "cloud-save-loaded"
 *   { code, keys, ignored, reloadScheduled, at }.
 *   → { ok:true, code, keys, ignored, reloadScheduled }
 *   | { ok:false, error }
 *
 * remove(code) — optional DELETE, emits "cloud-save-deleted" { code }.
 * resetLocal() — forget the cached code + timestamps (never touches progress).
 * state() → fresh { code, lastSave, lastLoad, busy }.
 *
 * Errors never throw. Codes used by the UI:
 *   bad-code, storage-unavailable, too-large, unavailable (local Vite dev /
 *   API not deployed), network, bad-response, bad-bundle, bad-version,
 *   bad-data, not-found, server-error, busy, empty.
 *
 * The game is NOT paused and pointer lock is untouched; this is a menu-level
 * tool. Bus events consumed: none (the UI calls in directly and re-renders from
 * the emitted events). Emits: cloud-save-saved, cloud-save-loaded,
 * cloud-save-deleted, cloud-save-error.
 */

import {
  SAVE_TOOLS_APP,
  SAVE_TOOLS_VERSION,
  KNOWN_KEYS,
  collectBundle,
} from "./save-tools.js";

export const CLOUD_SAVE_CODE_KEY = "gungame.cloud.code.v1";
export const CLOUD_SAVE_CODE_RE = /^[A-Za-z0-9_-]{6,32}$/;
export const CLOUD_SAVE_CODE_LENGTH = 10;
export const CLOUD_SAVE_MAX_BYTES = 200 * 1024;

/** Uppercase base32-ish: no 0/O, 1/I/L to survive being read aloud. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RELOAD_DELAY_MS = 300;

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

function byteLength(text) {
  try {
    if (typeof TextEncoder === "function") {
      return new TextEncoder().encode(text).length;
    }
  } catch {
    /* fall through */
  }
  return text.length;
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeCode(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

/**
 * One 10-char code. crypto.getRandomValues with rejection sampling keeps the
 * alphabet uniform (256 is not a multiple of 31); Math.random is only a
 * last-resort fallback for exotic embeds.
 * @returns {string}
 */
function generateCode() {
  let out = "";
  const cryptoObj =
    typeof crypto !== "undefined" && crypto && typeof crypto.getRandomValues === "function"
      ? crypto
      : null;
  if (cryptoObj) {
    try {
      const bytes = new Uint8Array(CLOUD_SAVE_CODE_LENGTH * 2);
      let guard = 0;
      while (out.length < CLOUD_SAVE_CODE_LENGTH && guard < 32) {
        cryptoObj.getRandomValues(bytes);
        for (let i = 0; i < bytes.length && out.length < CLOUD_SAVE_CODE_LENGTH; i++) {
          const b = bytes[i];
          if (b >= 248) continue; // 31 × 8 = 248 → reject the biased tail
          out += CODE_ALPHABET[b % CODE_ALPHABET.length];
        }
        guard++;
      }
    } catch {
      out = "";
    }
  }
  while (out.length < CLOUD_SAVE_CODE_LENGTH) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * @param {EventTarget} [bus]
 */
export function createCloudSave(bus) {
  const B = bus && typeof bus.dispatchEvent === "function" ? bus : null;

  /** @type {string|null} */
  let cachedCode = null;
  /** @type {string|null} */
  let lastSaveAt = null;
  /** @type {string|null} */
  let lastLoadAt = null;
  let busy = false;
  /** @type {any} */
  let reloadTimer = 0;

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
      console.warn("[cloud-save] emit failed for", name, err);
    }
  }

  function errorResult(error, op) {
    emit("cloud-save-error", { op, code: error });
    return { ok: false, error };
  }

  function readStoredCode() {
    const ls = getStorage();
    if (!ls) return null;
    try {
      const raw = ls.getItem(CLOUD_SAVE_CODE_KEY);
      if (typeof raw === "string" && CLOUD_SAVE_CODE_RE.test(raw)) return raw;
    } catch {
      /* blocked storage → treat as no code */
    }
    return null;
  }

  function persistCode(code) {
    cachedCode = code;
    const ls = getStorage();
    if (!ls) return;
    try {
      ls.setItem(CLOUD_SAVE_CODE_KEY, code);
    } catch {
      /* the in-memory cache still keeps the session usable */
    }
  }

  /** Saved code, or a new generated/chached one (persisted immediately). */
  function code() {
    if (cachedCode) return cachedCode;
    const stored = readStoredCode();
    if (stored) {
      cachedCode = stored;
      return stored;
    }
    const generated = generateCode();
    persistCode(generated);
    return generated;
  }

  /** Parse a fetch response as JSON, flagging the Vite dev fallback. */
  async function readJson(response) {
    let type = "";
    try {
      type = response && response.headers && typeof response.headers.get === "function"
        ? String(response.headers.get("content-type") || "")
        : "";
    } catch {
      type = "";
    }
    const isJson = type.toLowerCase().indexOf("application/json") !== -1;
    if (!isJson) {
      const status = response && Number(response.status);
      // Vite dev answers GET with an HTML/JS module and POST with an empty
      // 404. Both mean "the serverless API is not running here".
      if (
        !status ||
        status === 404 ||
        status === 405 ||
        (status >= 200 && status < 300)
      ) {
        return { ok: false, error: "unavailable" };
      }
      return { ok: false, error: "bad-response" };
    }
    try {
      return { ok: true, value: await response.json() };
    } catch {
      return { ok: false, error: "bad-response" };
    }
  }

  function mapHttpError(status, payload, notFoundCode) {
    const serverCode =
      payload && typeof payload.error === "string" ? payload.error : "";
    if (status === 404) return notFoundCode || "unavailable";
    if (status === 413) return "too-large";
    if (status === 400) {
      if (serverCode === "bad-code" || serverCode === "too-large") return serverCode;
      return "bad-data";
    }
    if (status === 502) return "bad-response";
    if (serverCode === "not-found") return "not-found";
    return "server-error";
  }

  // --- save -----------------------------------------------------------------
  async function save(requestedCode) {
    if (busy) return errorResult("busy", "save");
    const target = normalizeCode(
      typeof requestedCode === "string" && requestedCode ? requestedCode : code()
    );
    if (!CLOUD_SAVE_CODE_RE.test(target)) return errorResult("bad-code", "save");

    const collected = collectBundle();
    if (!collected.ok) return errorResult(collected.error, "save");

    let body;
    try {
      body = JSON.stringify({ code: target, data: collected.bundle.data });
    } catch {
      return errorResult("storage-unavailable", "save");
    }
    if (byteLength(body) > CLOUD_SAVE_MAX_BYTES) {
      return errorResult("too-large", "save");
    }

    busy = true;
    try {
      let response;
      try {
        response = await fetch("/api/cloud-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          cache: "no-store",
        });
      } catch {
        return errorResult("unavailable", "save");
      }

      const parsed = await readJson(response);
      if (!parsed.ok) return errorResult(parsed.error, "save");
      const payload = parsed.value;

      if (!response.ok || !payload || payload.ok !== true) {
        return errorResult(mapHttpError(response.status, payload, "unavailable"), "save");
      }

      const at = typeof payload.savedAt === "string" ? payload.savedAt : new Date().toISOString();
      persistCode(target);
      lastSaveAt = at;
      emit("cloud-save-saved", { code: target, at, keys: collected.keys.length });
      return { ok: true, code: target };
    } catch (err) {
      console.warn("[cloud-save] save failed", err);
      return errorResult("server-error", "save");
    } finally {
      busy = false;
    }
  }

  // --- load -----------------------------------------------------------------
  function writeSections(entries) {
    const ls = getStorage();
    if (!ls) return { ok: false, error: "storage-unavailable" };

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
        return { ok: false, error: "storage-unavailable" };
      }
    }
    return { ok: true };
  }

  /** Reload after the loaded state is safely in storage. */
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
          /* navigation blocked — the load itself already succeeded */
        }
      }, RELOAD_DELAY_MS);
      return true;
    } catch {
      return false;
    }
  }

  async function load(requestedCode) {
    if (busy) return errorResult("busy", "load");
    const target = normalizeCode(requestedCode);
    if (!CLOUD_SAVE_CODE_RE.test(target)) return errorResult("bad-code", "load");

    busy = true;
    try {
      let response;
      try {
        response = await fetch(
          "/api/cloud-save?code=" + encodeURIComponent(target),
          { method: "GET", cache: "no-store" }
        );
      } catch {
        return errorResult("unavailable", "load");
      }

      const parsed = await readJson(response);
      if (!parsed.ok) return errorResult(parsed.error, "load");
      const payload = parsed.value;

      if (!response.ok || !payload || payload.ok !== true) {
        return errorResult(mapHttpError(response.status, payload, "not-found"), "load");
      }
      if (payload.app !== SAVE_TOOLS_APP) return errorResult("bad-bundle", "load");
      if (payload.version !== SAVE_TOOLS_VERSION) return errorResult("bad-version", "load");
      if (!isObject(payload.data)) return errorResult("bad-bundle", "load");

      /** @type {Record<string, unknown>} */
      const data = payload.data;
      /** @type {Array<{key: string, text: string}>} */
      const entries = [];
      /** @type {string[]} */
      const ignored = [];
      const keysInData = Object.keys(data);

      for (let i = 0; i < keysInData.length; i++) {
        const key = keysInData[i];
        if (KNOWN_KEYS.indexOf(key) === -1) {
          ignored.push(key); // never written
          continue;
        }
        const value = data[key];
        if (value === null || value === undefined) continue;
        let text;
        if (typeof value === "string") {
          text = value; // raw localStorage text preserved by collectBundle
        } else if (isObject(value)) {
          try {
            text = JSON.stringify(value);
          } catch {
            return errorResult("bad-data", "load");
          }
        } else {
          return errorResult("bad-data", "load");
        }
        entries.push({ key, text });
      }

      if (entries.length === 0) return errorResult("empty", "load");

      const written = writeSections(entries);
      if (!written.ok) return errorResult(written.error, "load");

      const at = new Date().toISOString();
      persistCode(target);
      lastLoadAt = at;
      const reloadScheduled = scheduleReload();
      const keys = entries.map((entry) => entry.key);
      emit("cloud-save-loaded", {
        code: target,
        keys,
        ignored,
        reloadScheduled,
        at,
      });
      return { ok: true, code: target, keys, ignored, reloadScheduled };
    } catch (err) {
      console.warn("[cloud-save] load failed", err);
      return errorResult("server-error", "load");
    } finally {
      busy = false;
    }
  }

  // --- delete (optional) -----------------------------------------------------
  async function remove(requestedCode) {
    if (busy) return errorResult("busy", "delete");
    const target = normalizeCode(requestedCode);
    if (!CLOUD_SAVE_CODE_RE.test(target)) return errorResult("bad-code", "delete");

    busy = true;
    try {
      let response;
      try {
        response = await fetch(
          "/api/cloud-save?code=" + encodeURIComponent(target),
          { method: "DELETE", cache: "no-store" }
        );
      } catch {
        return errorResult("unavailable", "delete");
      }

      const parsed = await readJson(response);
      if (!parsed.ok) return errorResult(parsed.error, "delete");
      const payload = parsed.value;

      if (!response.ok || !payload || payload.ok !== true) {
        return errorResult(mapHttpError(response.status, payload, "not-found"), "delete");
      }
      emit("cloud-save-deleted", { code: target, at: new Date().toISOString() });
      return { ok: true, code: target };
    } catch (err) {
      console.warn("[cloud-save] delete failed", err);
      return errorResult("server-error", "delete");
    } finally {
      busy = false;
    }
  }

  /** Forget the local code + timestamps. Never touches game progress. */
  function resetLocal() {
    cachedCode = null;
    lastSaveAt = null;
    lastLoadAt = null;
    const ls = getStorage();
    if (ls) {
      try {
        if (typeof ls.removeItem === "function") ls.removeItem(CLOUD_SAVE_CODE_KEY);
      } catch {
        /* best-effort */
      }
    }
    return { ok: true };
  }

  function state() {
    return {
      code: code(),
      lastSave: lastSaveAt,
      lastLoad: lastLoadAt,
      busy,
    };
  }

  return { code, save, load, remove, state, resetLocal };
}
