/**
 * ============================================================================
 * AUTH — optional account sessions through /api/auth (Neon Postgres).
 * ============================================================================
 * createAuth(bus) → { user(), register(email, password),
 *                     login(email, password), logout(), refresh(), state(),
 *                     token() }
 *
 * Session: the server returns an opaque Bearer token on register/login; it is
 * cached in localStorage under "gungame.auth.session.v1" together with the
 * account email. refresh() revalidates the token against GET /api/auth on
 * boot so an expired/revoked session is dropped instead of failing every
 * cloud save.
 *
 * Errors never throw. Codes: bad-email, bad-password, invalid-credentials,
 * email-in-use, not-authenticated, unavailable (API not deployed / dev
 * server), accounts-unavailable (no database configured server-side),
 * network, bad-response, server-error, busy.
 *
 * Emits: "auth-changed" {user:{email}|null} on every login/logout/session
 * loss, "auth-error" {op, code} on failures. Bus events consumed: none —
 * cloud-save.js reads token() + user() directly.
 */

export const AUTH_SESSION_KEY = "gungame.auth.session.v1";
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN_LENGTH = 8;

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

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {EventTarget} [bus]
 */
export function createAuth(bus) {
  const B = bus && typeof bus.dispatchEvent === "function" ? bus : null;

  /** @type {{token: string, email: string}|null} */
  let session = null;
  let busy = false;
  /** @type {boolean|null} null = not probed yet */
  let available = null;

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
      console.warn("[auth] emit failed for", name, err);
    }
  }

  function errorResult(error, op) {
    emit("auth-error", { op, code: error });
    return { ok: false, error };
  }

  function readStored() {
    const ls = getStorage();
    if (!ls) return null;
    try {
      const raw = ls.getItem(AUTH_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        isObject(parsed) &&
        typeof parsed.token === "string" &&
        parsed.token.length >= 20 &&
        typeof parsed.email === "string"
      ) {
        return { token: parsed.token, email: parsed.email };
      }
    } catch {
      /* corrupt → drop */
    }
    return null;
  }

  function persist(value) {
    session = value;
    const ls = getStorage();
    if (!ls) return;
    try {
      if (value) {
        ls.setItem(
          AUTH_SESSION_KEY,
          JSON.stringify({ token: value.token, email: value.email })
        );
      } else if (typeof ls.removeItem === "function") {
        ls.removeItem(AUTH_SESSION_KEY);
      }
    } catch {
      /* in-memory session still works for this run */
    }
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
    if (type.toLowerCase().indexOf("application/json") === -1) {
      return { ok: false, error: "unavailable" };
    }
    try {
      return { ok: true, value: await response.json() };
    } catch {
      return { ok: false, error: "bad-response" };
    }
  }

  function mapError(status, payload) {
    const code = payload && typeof payload.error === "string" ? payload.error : "";
    if (status === 503) return "accounts-unavailable";
    if (status === 401) return code === "invalid-credentials" ? code : "not-authenticated";
    if (status === 409) return "email-in-use";
    if (status === 400) {
      return code === "bad-email" || code === "bad-password" ? code : "bad-response";
    }
    if (status === 404 || status === 405) return "unavailable";
    return code || "server-error";
  }

  async function request(method, body) {
    const headers = { "Content-Type": "application/json" };
    if (session && session.token) {
      headers.Authorization = "Bearer " + session.token;
    }
    let response;
    try {
      response = await fetch("/api/auth", {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
    } catch {
      return { error: "network" };
    }
    const parsed = await readJson(response);
    if (!parsed.ok) return { error: parsed.error };
    const payload = parsed.value;
    if (!response.ok || !payload || payload.ok !== true) {
      return { error: mapError(response.status, payload) };
    }
    return { payload };
  }

  function validate(email, password) {
    const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalized || normalized.length > 254 || !EMAIL_RE.test(normalized)) {
      return { error: "bad-email" };
    }
    if (
      typeof password !== "string" ||
      password.length < PASSWORD_MIN_LENGTH ||
      password.length > 128
    ) {
      return { error: "bad-password" };
    }
    return { email: normalized };
  }

  async function credentialCall(action, email, password) {
    if (busy) return errorResult("busy", action);
    const check = validate(email, password);
    if (check.error) return errorResult(check.error, action);
    busy = true;
    try {
      const result = await request("POST", {
        action,
        email: check.email,
        password,
      });
      if (result.error) {
        if (result.error === "accounts-unavailable") available = false;
        else if (result.error !== "unavailable") available = true;
        return errorResult(result.error, action);
      }
      available = true;
      const payload = result.payload;
      if (typeof payload.token !== "string" || !isObject(payload.user)) {
        return errorResult("bad-response", action);
      }
      persist({ token: payload.token, email: payload.user.email });
      emit("auth-changed", { user: user() });
      return { ok: true, user: user() };
    } finally {
      busy = false;
    }
  }

  function register(email, password) {
    return credentialCall("register", email, password);
  }

  function login(email, password) {
    return credentialCall("login", email, password);
  }

  async function logout() {
    if (busy) return errorResult("busy", "logout");
    const hadSession = !!session;
    busy = true;
    try {
      if (session) {
        // Best-effort server-side revocation; the local session drops either
        // way so a network failure never traps the player in a "logged in" UI.
        await request("POST", { action: "logout" });
      }
      persist(null);
      if (hadSession) emit("auth-changed", { user: null });
      return { ok: true };
    } finally {
      busy = false;
    }
  }

  /**
   * Revalidate the cached session (boot path). A 401 drops the session;
   * network/unavailable keeps it so offline play still shows the account.
   */
  async function refresh() {
    if (!session) {
      const stored = readStored();
      if (stored) session = stored;
      else {
        return { ok: true, user: null };
      }
    }
    if (busy) return { ok: false, error: "busy" };
    busy = true;
    try {
      const result = await request("GET");
      if (result.error) {
        if (result.error === "not-authenticated") {
          persist(null);
          emit("auth-changed", { user: null });
          return { ok: true, user: null };
        }
        if (result.error === "accounts-unavailable") available = false;
        else if (result.error !== "unavailable" && result.error !== "network") {
          available = true;
        }
        return { ok: false, error: result.error };
      }
      available = true;
      const payload = result.payload;
      const email = payload && isObject(payload.user) ? payload.user.email : null;
      if (typeof email === "string" && session && email !== session.email) {
        persist({ token: session.token, email });
      }
      emit("auth-changed", { user: user() });
      return { ok: true, user: user() };
    } finally {
      busy = false;
    }
  }

  function user() {
    return session ? { email: session.email } : null;
  }

  function token() {
    return session ? session.token : null;
  }

  function state() {
    return {
      user: user(),
      busy,
      available,
      loggedIn: !!session,
    };
  }

  return { user, token, register, login, logout, refresh, state };
}
