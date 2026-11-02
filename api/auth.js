/**
 * ============================================================================
 * AUTH API — account register/login/logout/me backed by Neon Postgres.
 * ============================================================================
 * Same-origin endpoints used by src/systems/auth.js:
 *
 *   POST /api/auth { action:"register", email, password }
 *     → 201 { ok:true, token, user:{email} }         (400/409/413/503)
 *   POST /api/auth { action:"login", email, password }
 *     → 200 { ok:true, token, user:{email} }         (400/401/413/503)
 *   POST /api/auth { action:"logout" } + Bearer token
 *     → 200 { ok:true }                              (401/503)
 *   GET  /api/auth + Bearer token
 *     → 200 { ok:true, user:{id,email} }             (401/503)
 *   OPTIONS → 204
 *
 * Auth model: email + password → scrypt hash (see _db.js). A successful
 * register/login issues a 256-bit session token; the client sends it as
 * `Authorization: Bearer …` to /api/auth (session ops) and /api/cloud-save
 * (account saves). Tokens are stored HASHED server-side and expire after
 * 30 days (sliding refresh on use).
 *
 * Graceful degradation: with no POSTGRES_URL/DATABASE_URL the endpoint
 * answers 503 "accounts-unavailable" and the client UI hides account
 * features — anonymous code saves keep working untouched.
 *
 * Security notes:
 * - Generic "invalid-credentials" for login failures (no user enumeration).
 * - Emails normalized lowercase + trimmed; validated, length-capped.
 * - Rate limit note: serverless functions can't share a memory bucket —
 *   scrypt's ~50 ms cost plus Neon's natural latency is the built-in brake;
 *   front with Vercel WAF rate limiting if abuse ever shows up.
 * - `createAuthHandler({ db })` injects the db for Node-side contract tests.
 */

import {
  accountsAvailable,
  defaultDb,
  ensureSchema,
  hashPassword,
  verifyPassword,
  newSessionToken,
  newUserId,
  tokenHash,
  bearerToken,
  userFromRequest,
  SESSION_TTL_MS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  EMAIL_RE,
} from "./_db.js";

const MAX_BODY_BYTES = 8 * 1024;
const ALLOWED_METHODS = "GET, POST, OPTIONS";

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

async function readBody(req) {
  const headers = req && req.headers ? req.headers : {};
  const declared = Number(headers["content-length"] || headers["Content-Length"]);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
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
            if (size > MAX_BODY_BYTES) {
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
  if (typeof raw !== "string") return { value: raw };
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return { error: "too-large" };
  return { text: raw };
}

function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function validateCredentials(email, password) {
  if (
    !email ||
    email.length > EMAIL_MAX_LENGTH ||
    !EMAIL_RE.test(email)
  ) {
    return "bad-email";
  }
  if (
    typeof password !== "string" ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    return "bad-password";
  }
  return null;
}

/**
 * @param {{ db?: {query: Function}, available?: boolean }} [overrides]
 */
export function createAuthHandler(overrides = {}) {
  const isAvailable = overrides.available !== undefined
    ? overrides.available
    : accountsAvailable;

  async function getDb() {
    if (overrides.db) return overrides.db;
    return defaultDb();
  }

  async function issueSession(db, userId) {
    const token = newSessionToken();
    await db.query(
      `INSERT INTO sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval)`,
      [tokenHash(token), userId, String(SESSION_TTL_MS)]
    );
    return token;
  }

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
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail(res, 400, "bad-body");
    }

    const action = String(parsed.action || "");

    if (action === "logout") {
      const token = bearerToken(req);
      if (!token) return fail(res, 401, "not-authenticated");
      const db = await getDb();
      await ensureSchema(db);
      await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash(token)]);
      return send(res, 200, { ok: true });
    }

    if (action !== "register" && action !== "login") {
      return fail(res, 400, "bad-action");
    }

    const email = normalizeEmail(parsed.email);
    const password = parsed.password;
    const credError = validateCredentials(email, password);
    if (credError) return fail(res, 400, credError);

    const db = await getDb();
    await ensureSchema(db);

    if (action === "register") {
      const id = newUserId();
      const record = hashPassword(password);
      try {
        await db.query(
          `INSERT INTO users (id, email, pass_hash) VALUES ($1, $2, $3)`,
          [id, email, record]
        );
      } catch (err) {
        // Unique-violation → account exists. Keep the message generic.
        if (err && String(err.code) === "23505") {
          return fail(res, 409, "email-in-use");
        }
        throw err;
      }
      const token = await issueSession(db, id);
      return send(res, 201, { ok: true, token, user: { email } });
    }

    // login
    const rows = await db.query(
      `SELECT id, pass_hash FROM users WHERE email = $1`,
      [email]
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !verifyPassword(password, row.pass_hash)) {
      return fail(res, 401, "invalid-credentials");
    }
    const token = await issueSession(db, row.id);
    return send(res, 200, { ok: true, token, user: { email } });
  }

  async function handleGet(req, res) {
    const db = await getDb();
    await ensureSchema(db);
    const user = await userFromRequest(req, db);
    if (!user) return fail(res, 401, "not-authenticated");
    return send(res, 200, { ok: true, user: { id: user.id, email: user.email } });
  }

  /** @param {any} req @param {any} res */
  return async function handler(req, res) {
    if (!res || typeof res.setHeader !== "function") return;
    if (!req) return fail(res, 400, "bad-request");

    if (!isAvailable()) {
      res.setHeader("Allow", ALLOWED_METHODS);
      return fail(res, 503, "accounts-unavailable");
    }

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
    } catch (err) {
      console.error("[auth] unhandled:", err && err.name ? err.name : "error");
      return fail(res, 500, "server-error");
    }

    res.setHeader("Allow", ALLOWED_METHODS);
    return fail(res, 405, "method-not-allowed");
  };
}

export default createAuthHandler();
