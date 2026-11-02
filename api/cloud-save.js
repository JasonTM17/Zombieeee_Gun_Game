/**
 * ============================================================================
 * CLOUD SAVE API — Vercel Node serverless function + Vercel Blob.
 * ============================================================================
 * Same-origin endpoints used by src/systems/cloud-save.js:
 *
 *   POST /api/cloud-save   body { code, data }
 *     → 200 { ok:true, code, savedAt, size }
 *   GET  /api/cloud-save?code=ABC123
 *     → 200 { ok:true, code, app, version, savedAt, data }
 *   DELETE /api/cloud-save?code=ABC123
 *     → 200 { ok:true, code, deleted:true }
 *   OPTIONS → 204
 *
 * Codes: /^[A-Za-z0-9_-]{6,32}$/. Payload: JSON object, ≤ 200 KB.
 * Blob path: saves/<code>.json, overwrite allowed, public access.
 * The document stored in the blob is:
 *   { app:"gun-game", version:1, savedAt:"<ISO>", data:{...} }
 *
 * Auth model: there is none. The code IS the capability — anyone who knows it
 * can read or overwrite that save, so the UI warns players not to put personal
 * data in a save. Codes are generated client-side (10 chars, ~49.5 bits).
 *
 * Security notes:
 * - Only whitelisted, bounded inputs are used to build the blob path.
 * - The request body is capped before parsing and again before writing.
 * - Save data is never logged; failures log only the error name.
 * - BLOB_READ_WRITE_TOKEN comes from the environment (linked store); no token
 *   is present in source.
 *
 * `createCloudSaveHandler({ put, list, del, fetch })` exists for tests: it
 * injects the Blob client and fetch so the full contract can run without a
 * token or network. The default export uses the real @vercel/blob functions.
 */

import { put, list, del } from "@vercel/blob";

export const CLOUD_SAVE_APP = "gun-game";
export const CLOUD_SAVE_VERSION = 1;
export const CLOUD_SAVE_MAX_BYTES = 200 * 1024;
export const CLOUD_SAVE_CODE_RE = /^[A-Za-z0-9_-]{6,32}$/;

const BLOB_PREFIX = "saves/";
const ALLOWED_METHODS = "GET, POST, DELETE, OPTIONS";

/** Non-array object. */
function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function codePath(code) {
  return BLOB_PREFIX + code + ".json";
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  if (status === 204) {
    res.end();
    return;
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function fail(res, status, error) {
  send(res, status, { ok: false, error });
}

/** Read `code` from req.query when the platform parsed it, else from req.url. */
function queryCode(req) {
  const direct = req.query && req.query.code;
  if (typeof direct === "string") return direct;
  const url = typeof req.url === "string" ? req.url : "";
  const index = url.indexOf("?");
  if (index === -1) return "";
  try {
    return new URLSearchParams(url.slice(index + 1)).get("code") || "";
  } catch {
    return "";
  }
}

function byteLength(text) {
  return typeof Buffer !== "undefined" ? Buffer.byteLength(text, "utf8") : text.length;
}

/**
 * Read the request body without ever buffering more than the limit.
 * Returns { text } or { value } for an already-parsed platform body, or
 * { error:"too-large" }.
 */
async function readBody(req) {
  const headers = req && req.headers ? req.headers : {};
  const declared = Number(headers["content-length"] || headers["Content-Length"]);
  if (Number.isFinite(declared) && declared > CLOUD_SAVE_MAX_BYTES) {
    return { error: "too-large" };
  }

  let raw = req ? req.body : undefined;
  if (raw === undefined || raw === null) {
    if (req && typeof req.on === "function") {
      try {
        raw = await new Promise((resolve, reject) => {
          const chunks = [];
          let size = 0;
          req.on("data", (chunk) => {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
            size += buf.length;
            if (size > CLOUD_SAVE_MAX_BYTES) {
              reject(Object.assign(new Error("too-large"), { code: "too-large" }));
              return;
            }
            chunks.push(buf);
          });
          req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
          req.on("error", reject);
        });
      } catch (err) {
        if (err && err.code === "too-large") return { error: "too-large" };
        return { error: "bad-body" };
      }
    } else {
      raw = "";
    }
  }

  if (Buffer.isBuffer(raw)) raw = raw.toString("utf8");
  if (typeof raw !== "string") {
    // Vercel may hand over an already-parsed JSON body.
    try {
      if (byteLength(JSON.stringify(raw)) > CLOUD_SAVE_MAX_BYTES) {
        return { error: "too-large" };
      }
    } catch {
      return { error: "bad-body" };
    }
    return { value: raw };
  }
  if (byteLength(raw) > CLOUD_SAVE_MAX_BYTES) return { error: "too-large" };
  return { text: raw };
}

async function findBlob(blob, pathname) {
  const result = await blob.list({ prefix: pathname, limit: 1 });
  const blobs = result && Array.isArray(result.blobs) ? result.blobs : [];
  for (let i = 0; i < blobs.length; i++) {
    const item = blobs[i];
    if (item && item.pathname === pathname && typeof item.url === "string") {
      return item;
    }
  }
  return null;
}

/**
 * Build a handler with injectable dependencies (tests) or the real ones.
 * @param {{
 *   put?: Function, list?: Function, del?: Function, fetch?: Function
 * }} [overrides]
 */
export function createCloudSaveHandler(overrides = {}) {
  const blob = {
    put: overrides.put || put,
    list: overrides.list || list,
    del: overrides.del || del,
  };
  const fetchImpl =
    overrides.fetch || (typeof fetch === "function" ? fetch : null);

  async function handlePost(req, res) {
    const body = await readBody(req);
    if (body.error === "too-large") return fail(res, 413, "too-large");
    if (body.error) return fail(res, 400, "bad-body");

    let parsed;
    if (body.value !== undefined) {
      parsed = body.value;
    } else {
      try {
        parsed = JSON.parse(body.text || "");
      } catch {
        return fail(res, 400, "bad-body");
      }
    }
    if (!isObject(parsed)) return fail(res, 400, "bad-body");

    const code = parsed.code;
    if (typeof code !== "string" || !CLOUD_SAVE_CODE_RE.test(code)) {
      return fail(res, 400, "bad-code");
    }
    if (!isObject(parsed.data)) return fail(res, 400, "bad-body");

    const savedAt = new Date().toISOString();
    const record = {
      app: CLOUD_SAVE_APP,
      version: CLOUD_SAVE_VERSION,
      savedAt,
      data: parsed.data,
    };
    let serialized;
    try {
      serialized = JSON.stringify(record);
    } catch {
      return fail(res, 400, "bad-body");
    }
    const size = byteLength(serialized);
    if (size > CLOUD_SAVE_MAX_BYTES) return fail(res, 413, "too-large");

    try {
      await blob.put(codePath(code), serialized, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        // Public blobs default to a one-month edge cache; a minute bounds
        // staleness if a read races the overwrite (GET also cache-busts).
        cacheControlMaxAge: 60,
      });
    } catch (err) {
      console.error(
        "[cloud-save] put failed:",
        err && err.name ? err.name : "error"
      );
      return fail(res, 500, "server-error");
    }

    return send(res, 200, { ok: true, code, savedAt, size });
  }

  async function handleGet(req, res) {
    const code = queryCode(req);
    if (!CLOUD_SAVE_CODE_RE.test(code)) return fail(res, 400, "bad-code");

    const pathname = codePath(code);
    let found;
    try {
      found = await findBlob(blob, pathname);
    } catch (err) {
      console.error(
        "[cloud-save] list failed:",
        err && err.name ? err.name : "error"
      );
      return fail(res, 500, "server-error");
    }
    if (!found) return fail(res, 404, "not-found");
    if (!fetchImpl) return fail(res, 500, "server-error");

    let response;
    try {
      // The public blob URL is edge-cached; a unique query string makes an
      // overwrite visible immediately instead of after cache expiry.
      const url =
        found.url +
        (found.url.indexOf("?") === -1 ? "?" : "&") +
        "v=" +
        Date.now();
      response = await fetchImpl(url, { cache: "no-store" });
    } catch (err) {
      console.error(
        "[cloud-save] fetch failed:",
        err && err.name ? err.name : "error"
      );
      return fail(res, 502, "blob-read-failed");
    }
    if (!response || response.ok !== true) {
      return fail(res, 502, "blob-read-failed");
    }

    let stored;
    try {
      stored = await response.json();
    } catch {
      return fail(res, 502, "corrupt-save");
    }
    if (
      !isObject(stored) ||
      stored.app !== CLOUD_SAVE_APP ||
      stored.version !== CLOUD_SAVE_VERSION ||
      !isObject(stored.data)
    ) {
      return fail(res, 502, "corrupt-save");
    }

    return send(res, 200, {
      ok: true,
      code,
      app: CLOUD_SAVE_APP,
      version: CLOUD_SAVE_VERSION,
      savedAt: typeof stored.savedAt === "string" ? stored.savedAt : null,
      data: stored.data,
    });
  }

  async function handleDelete(req, res) {
    const code = queryCode(req);
    if (!CLOUD_SAVE_CODE_RE.test(code)) return fail(res, 400, "bad-code");

    const pathname = codePath(code);
    let found;
    try {
      found = await findBlob(blob, pathname);
    } catch (err) {
      console.error(
        "[cloud-save] list failed:",
        err && err.name ? err.name : "error"
      );
      return fail(res, 500, "server-error");
    }
    if (!found) return fail(res, 404, "not-found");

    try {
      await blob.del(found.url);
    } catch (err) {
      console.error(
        "[cloud-save] delete failed:",
        err && err.name ? err.name : "error"
      );
      return fail(res, 500, "server-error");
    }
    return send(res, 200, { ok: true, code, deleted: true });
  }

  /** @param {any} req @param {any} res */
  return async function handler(req, res) {
    if (!res || typeof res.setHeader !== "function") return;
    if (!req) return fail(res, 400, "bad-request");
    const method = String(req.method || "GET").toUpperCase();

    if (method === "OPTIONS") {
      res.setHeader("Allow", ALLOWED_METHODS);
      res.setHeader("Cache-Control", "no-store");
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      if (method === "POST") return await handlePost(req, res);
      if (method === "GET") return await handleGet(req, res);
      if (method === "DELETE") return await handleDelete(req, res);
    } catch (err) {
      console.error(
        "[cloud-save] unhandled:",
        err && err.name ? err.name : "error"
      );
      return fail(res, 500, "server-error");
    }

    res.setHeader("Allow", ALLOWED_METHODS);
    return fail(res, 405, "method-not-allowed");
  };
}

export default createCloudSaveHandler();
