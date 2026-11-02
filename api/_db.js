/**
 * ============================================================================
 * SHARED DB + AUTH HELPERS — Neon Postgres for account cloud saves.
 * ============================================================================
 * The Neon connection string comes from POSTGRES_URL (Vercel/Neon integration)
 * or DATABASE_URL; the module stays inert when neither is configured so the
 * game + legacy code saves keep working with zero setup.
 *
 * Every handler takes an injectable `db` = { query(text, params) } so the full
 * contract is testable in Node with an in-memory fake — no network needed.
 * The default factory lazily creates @neondatabase/serverless's `neon` SQL
 * tag, which speaks HTTP (no WebSocket, serverless-safe).
 *
 * Passwords: scrypt via node:crypto (N=16384 r=8 p=1, 64 B key, 16 B salt)
 * stored as "scrypt:N:r:p:saltB64:hashB64" — self-describing for future
 * parameter bumps, and timingSafeEqual-compared.
 *
 * Sessions: opaque 256-bit tokens (hex), row per session, 30-day expiry,
 * sliding refresh on use. Tables are created lazily (CREATE TABLE IF NOT
 * EXISTS) once per cold start — no migration tooling needed for 3 tables.
 *
 * Security notes:
 * - All queries are parameterized; user input never interpolates SQL.
 * - Password hashes / tokens are never returned to clients or logged.
 * - The connection string lives only in env vars; nothing is in source.
 */

import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 254;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/** env may also expose NEON_DATABASE_URL on some integrations. */
export function connectionString() {
  const env = typeof process !== "undefined" ? process.env || {} : {};
  return (
    env.POSTGRES_URL ||
    env.DATABASE_URL ||
    env.NEON_DATABASE_URL ||
    ""
  );
}

/** True when a Postgres connection string is configured. */
export function accountsAvailable() {
  return typeof connectionString() === "string" && connectionString().length > 0;
}

let cachedQuery = null;

/**
 * Default db implementation: @neondatabase/serverless `neon` tag over HTTP.
 * Returns null when no connection string is configured — callers must check
 * accountsAvailable() first or handle the null.
 * @returns {Promise<{query: (text: string, params?: any[]) => Promise<any[]>}|null>}
 */
export async function defaultDb() {
  if (!accountsAvailable()) return null;
  if (cachedQuery) return { query: cachedQuery };
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(connectionString());
  cachedQuery = async (text, params) => sql(text, params || []);
  return { query: cachedQuery };
}

let schemaReady = null;

/** One-time schema bootstrap per cold start; safe to call on every request. */
export async function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.query(
        `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          pass_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`
      );
      await db.query(
        `CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          expires_at TIMESTAMPTZ NOT NULL
        )`
      );
      await db.query(
        `CREATE TABLE IF NOT EXISTS saves (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`
      );
      await db.query(
        `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`
      );
    })();
  }
  return schemaReady;
}

/** @param {string} password @returns {string} self-describing scrypt record */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return (
    "scrypt:" +
    [SCRYPT.N, SCRYPT.r, SCRYPT.p].join(":") +
    ":" +
    salt.toString("base64") +
    ":" +
    key.toString("base64")
  );
}

/**
 * Constant-time verify. Unknown / corrupt records fail closed.
 * @param {string} password @param {string} record
 */
export function verifyPassword(password, record) {
  if (typeof record !== "string") return false;
  // "scrypt:N:r:p:saltB64:hashB64" → 6 segments
  const parts = record.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[4], "base64");
    expected = Buffer.from(parts[5], "base64");
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT.keylen) return false;
  const key = scryptSync(password, salt, SCRYPT.keylen, { N, r, p });
  return timingSafeEqual(key, expected);
}

/** Hash a session token for storage — the DB never holds the raw token. */
export function tokenHash(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

/** New opaque session token (returned to the client once, stored hashed). */
export function newSessionToken() {
  return randomBytes(32).toString("hex");
}

/** New user id — "u_" + 16 random bytes hex. */
export function newUserId() {
  return "u_" + randomBytes(16).toString("hex");
}

/**
 * Extract the Bearer token from a request.
 * @param {any} req @returns {string} "" when absent/malformed.
 */
export function bearerToken(req) {
  const headers = req && req.headers ? req.headers : {};
  const raw = headers.authorization || headers.Authorization || "";
  const match = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(String(raw).trim());
  return match ? match[1] : "";
}

/**
 * Resolve a request's Bearer token to a live user row.
 * Deletes expired rows lazily; slides the expiry forward on success.
 * @param {any} req @param {{query: Function}} db
 * @returns {Promise<{id: string, email: string}|null>}
 */
export async function userFromRequest(req, db) {
  const token = bearerToken(req);
  if (!token) return null;
  const hash = tokenHash(token);
  const rows = await db.query(
    `SELECT s.user_id, s.expires_at, u.email
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1`,
    [hash]
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  const expires = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [hash]);
    return null;
  }
  // Sliding refresh: only rewrite when the row is past half-life, so a
  // write lands at most once per ~15 days per session.
  if (expires - Date.now() < SESSION_TTL_MS / 2) {
    await db.query(
      `UPDATE sessions SET expires_at = now() + interval '30 days' WHERE token_hash = $1`,
      [hash]
    );
  }
  return { id: row.user_id, email: row.email };
}
