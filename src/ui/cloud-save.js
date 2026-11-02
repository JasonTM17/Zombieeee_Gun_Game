/**
 * ============================================================================
 * CLOUD SAVE UI — code-based cloud backup modal (no account).
 * ============================================================================
 * createCloudSaveUI(uiRoot, bus, cloudSave, i18n)
 *   → { open(), close(), isOpen() }
 *
 * Layout:
 *   CLOUD SAVE
 *   intro — one cloud copy, no account, the code is the key
 *   LOCAL BACKUP  [ OPEN LOCAL BACKUP ]  (closes this modal, emits
 *                 "save-tools-open" so the existing file tool opens)
 *   CLOUD         [ code input ] [ COPY ]
 *                 [ SAVE TO CLOUD ] [ LOAD FROM CLOUD ]
 *                 [ DELETE CLOUD SAVE ]  (two-step inline confirm)
 *                 status line (role="status", aria-live="polite")
 *                 warning — anyone with the code can read/write the save
 *   [ CLOSE ]
 *
 * Wiring
 * - Opens on bus "cloud-save-open" (the lead wires a menu button) and on the
 *   additive CLOUD button inside the SAVE DATA panel.
 * - The code input is pre-filled with cloudSave.code() on every open; SAVE and
 *   LOAD use the value currently in the input.
 * - "cloud-save-saved" / "cloud-save-loaded" / "cloud-save-deleted" /
 *   "cloud-save-error" update the status line, including calls made outside the
 *   modal (debug console, future shortcuts).
 * - Live language switch: "settings-changed" {patch.lang}.
 *
 * Deliberately NOT modal for the game: no pause, no pointer-lock calls. It is
 * a menu-level overlay above the SAVE DATA panel (z-index 70 vs 60), with
 * pointer-events on. Escape closes in the capture phase so input.js never
 * turns it into a pause.
 *
 * DOM safety: without a document the factory returns a no-op API; missing
 * uiRoot/bus/cloudSave throws the same way save-tools does.
 */

export const CLOUD_SAVE_UI_BUNDLE = {
  en: {
    cloudSaveTitle: "CLOUD SAVE",
    cloudSaveIntro:
      "Keep one cloud copy of your progress. Sign in to bind it to your account.",
    cloudAccountTitle: "ACCOUNT",
    cloudEmailLabel: "EMAIL",
    cloudPasswordLabel: "PASSWORD (8+ CHARS)",
    cloudLoginBtn: "SIGN IN",
    cloudRegisterBtn: "CREATE ACCOUNT",
    cloudLogoutBtn: "SIGN OUT",
    cloudSignedIn: "Signed in as {email}.",
    cloudCodeOptional: "LEGACY CODE (OPTIONAL)",
    cloudLocalTitle: "LOCAL BACKUP",
    cloudLocalText: "Export or import a JSON file on this device.",
    cloudLocalOpen: "OPEN LOCAL BACKUP",
    cloudCloudTitle: "CLOUD",
    cloudCodeLabel: "SAVE CODE",
    cloudCopy: "COPY",
    cloudCopied: "Code copied.",
    cloudCopyFailed: "Could not copy — select the code and copy it manually.",
    cloudSaveBtn: "SAVE TO CLOUD",
    cloudLoadBtn: "LOAD FROM CLOUD",
    cloudDeleteBtn: "DELETE CLOUD SAVE",
    cloudDeleteConfirm: "CONFIRM DELETE",
    cloudClose: "CLOSE",
    cloudWarning:
      "Anyone with the code can read, overwrite or delete this save. Do not store personal data.",
    cloudStatusReady: "Ready.",
    cloudStatusSaving: "Saving…",
    cloudStatusLoading: "Loading…",
    cloudStatusDeleting: "Deleting…",
    cloudStatusSaved: "Saved to cloud.",
    cloudStatusLoaded: "Loaded {n} section(s).",
    cloudStatusLoadedReload: "Loaded {n} section(s). Reloading…",
    cloudStatusDeleted: "Cloud save deleted.",
    cloudErrInvalidCode: "Code must be 6–32 letters, numbers, - or _.",
    cloudErrUnavailable: "Cloud save needs the deployed build.",
    cloudErrNotFound: "No cloud save found for this code.",
    cloudErrTooLarge: "Save is too large for the cloud (200 KB max).",
    cloudErrStorage: "Local storage is unavailable.",
    cloudErrBadBundle: "That cloud save is not a Gun Game save.",
    cloudErrBadVersion: "Unsupported cloud save version.",
    cloudErrBadData: "That cloud save is corrupt.",
    cloudErrEmpty: "That cloud save has no progress.",
    cloudErrServer: "Cloud server error. Try again.",
    cloudErrBusy: "Please wait…",
    cloudErrGeneric: "Cloud save failed.",
    cloudErrBadEmail: "Enter a valid email.",
    cloudErrBadPassword: "Password needs 8+ characters.",
    cloudErrInvalidCredentials: "Wrong email or password.",
    cloudErrEmailInUse: "That email already has an account.",
    cloudErrNotAuthenticated: "Session expired — sign in again.",
    cloudErrAccountsUnavailable: "Accounts are not set up on this deployment.",
  },
  vi: {
    cloudSaveTitle: "LƯU ĐÁM MÂY",
    cloudSaveIntro:
      "Giữ một bản tiến trình trên đám mây. Đăng nhập để gắn với tài khoản của bạn.",
    cloudAccountTitle: "TÀI KHOẢN",
    cloudEmailLabel: "EMAIL",
    cloudPasswordLabel: "MẬT KHẨU (8+ KÝ TỰ)",
    cloudLoginBtn: "ĐĂNG NHẬP",
    cloudRegisterBtn: "TẠO TÀI KHOẢN",
    cloudLogoutBtn: "ĐĂNG XUẤT",
    cloudSignedIn: "Đã đăng nhập: {email}.",
    cloudCodeOptional: "MÃ CŨ (TÙY CHỌN)",
    cloudLocalTitle: "SAO LƯU CỤC BỘ",
    cloudLocalText: "Xuất hoặc nhập tệp JSON trên thiết bị này.",
    cloudLocalOpen: "MỞ SAO LƯU CỤC BỘ",
    cloudCloudTitle: "ĐÁM MÂY",
    cloudCodeLabel: "MÃ LƯU",
    cloudCopy: "SAO CHÉP",
    cloudCopied: "Đã sao chép mã.",
    cloudCopyFailed: "Không sao chép được — hãy chọn mã và sao chép thủ công.",
    cloudSaveBtn: "LƯU LÊN ĐÁM MÂY",
    cloudLoadBtn: "TẢI TỪ ĐÁM MÂY",
    cloudDeleteBtn: "XÓA BẢN LƯU ĐÁM MÂY",
    cloudDeleteConfirm: "XÁC NHẬN XÓA",
    cloudClose: "ĐÓNG",
    cloudWarning:
      "Ai biết mã đều có thể đọc, ghi đè hoặc xóa bản lưu này. Không lưu dữ liệu cá nhân.",
    cloudStatusReady: "Sẵn sàng.",
    cloudStatusSaving: "Đang lưu…",
    cloudStatusLoading: "Đang tải…",
    cloudStatusDeleting: "Đang xóa…",
    cloudStatusSaved: "Đã lưu lên đám mây.",
    cloudStatusLoaded: "Đã tải {n} mục.",
    cloudStatusLoadedReload: "Đã tải {n} mục. Đang tải lại…",
    cloudStatusDeleted: "Đã xóa bản lưu đám mây.",
    cloudErrInvalidCode: "Mã phải có 6–32 chữ cái, số, - hoặc _.",
    cloudErrUnavailable: "Lưu đám mây cần bản đã triển khai.",
    cloudErrNotFound: "Không tìm thấy bản lưu với mã này.",
    cloudErrTooLarge: "Bản lưu quá lớn cho đám mây (tối đa 200 KB).",
    cloudErrStorage: "Bộ nhớ cục bộ không khả dụng.",
    cloudErrBadBundle: "Bản lưu đám mây không phải của Gun Game.",
    cloudErrBadVersion: "Phiên bản bản lưu đám mây không được hỗ trợ.",
    cloudErrBadData: "Bản lưu đám mây bị hỏng.",
    cloudErrEmpty: "Bản lưu đám mây không có tiến trình.",
    cloudErrServer: "Máy chủ đám mây lỗi. Hãy thử lại.",
    cloudErrBusy: "Vui lòng chờ…",
    cloudErrGeneric: "Lưu đám mây thất bại.",
    cloudErrBadEmail: "Email không hợp lệ.",
    cloudErrBadPassword: "Mật khẩu cần ít nhất 8 ký tự.",
    cloudErrInvalidCredentials: "Sai email hoặc mật khẩu.",
    cloudErrEmailInUse: "Email này đã có tài khoản.",
    cloudErrNotAuthenticated: "Phiên đã hết hạn — đăng nhập lại.",
    cloudErrAccountsUnavailable: "Bản triển khai này chưa cấu hình tài khoản.",
  },
};

const ERROR_KEYS = {
  "bad-code": "cloudErrInvalidCode",
  "storage-unavailable": "cloudErrStorage",
  "too-large": "cloudErrTooLarge",
  unavailable: "cloudErrUnavailable",
  network: "cloudErrUnavailable",
  "bad-response": "cloudErrBadData",
  "bad-bundle": "cloudErrBadBundle",
  "bad-version": "cloudErrBadVersion",
  "bad-data": "cloudErrBadData",
  "not-found": "cloudErrNotFound",
  empty: "cloudErrEmpty",
  "server-error": "cloudErrServer",
  busy: "cloudErrBusy",
  "bad-email": "cloudErrBadEmail",
  "bad-password": "cloudErrBadPassword",
  "invalid-credentials": "cloudErrInvalidCredentials",
  "email-in-use": "cloudErrEmailInUse",
  "not-authenticated": "cloudErrNotAuthenticated",
  "accounts-unavailable": "cloudErrAccountsUnavailable",
};

const CLOUD_SAVE_CSS = `
.gg-cloud-save-overlay {
  position: absolute;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, rgba(5, 8, 14, 0.55) 0%, rgba(2, 4, 8, 0.9) 100%);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  pointer-events: auto;
  font-family: "Segoe UI", system-ui, sans-serif;
}
.gg-cloud-save-overlay.hidden { display: none; }
.gg-cloud-save-panel {
  width: min(560px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  background: var(--gg-panel, rgba(9, 13, 21, 0.96));
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 12px;
  padding: 24px 26px 18px;
  color: var(--gg-text, #dbe6f5);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.68), inset 0 0 0 1px rgba(255, 211, 94, 0.05);
}
.gg-cloud-save-title {
  margin: 0 0 8px;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gg-gold, #ffd35e);
  text-shadow: 0 0 22px rgba(255, 211, 94, 0.22);
}
.gg-cloud-save-intro {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-cloud-save-section {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--gg-line, #24334d);
}
.gg-cloud-save-label {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--gg-gold, #ffd35e);
}
.gg-cloud-save-text {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-cloud-save-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.gg-cloud-save-row + .gg-cloud-save-row { margin-top: 8px; }
.gg-cloud-save-input {
  flex: 1;
  min-width: 0;
  appearance: none;
  -webkit-appearance: none;
  font-family: ui-monospace, "Cascadia Mono", "Consolas", monospace;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.16em;
  padding: 11px 12px;
  border-radius: 8px;
  border: 1px solid var(--gg-line, #24334d);
  background: rgba(3, 6, 11, 0.72);
  color: var(--gg-text, #dbe6f5);
}
.gg-cloud-save-input:focus {
  outline: none;
  border-color: var(--gg-gold, #ffd35e);
  box-shadow: 0 0 0 2px rgba(255, 211, 94, 0.18);
}
.gg-cloud-save-btn {
  flex: 1;
  appearance: none;
  -webkit-appearance: none;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 11px 14px;
  min-height: 42px;
  border-radius: 8px;
  border: 1px solid var(--gg-line, #24334d);
  background: var(--gg-chip, rgba(6, 10, 16, 0.55));
  color: var(--gg-text, #dbe6f5);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.gg-cloud-save-btn:hover:not(:disabled),
.gg-cloud-save-btn:focus-visible:not(:disabled) {
  border-color: var(--gg-gold, #ffd35e);
  color: var(--gg-gold, #ffd35e);
  outline: none;
}
.gg-cloud-save-btn.primary {
  border-color: var(--gg-gold, #ffd35e);
  color: var(--gg-gold, #ffd35e);
  box-shadow: inset 0 0 0 1px rgba(255, 211, 94, 0.12);
}
.gg-cloud-save-btn.quiet {
  flex: 0 0 auto;
  padding-left: 16px;
  padding-right: 16px;
}
.gg-cloud-save-btn.danger {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--gg-text-dim, #8fa1b8);
  background: transparent;
}
.gg-cloud-save-btn.danger:hover:not(:disabled),
.gg-cloud-save-btn.danger:focus-visible:not(:disabled),
.gg-cloud-save-btn.danger.confirming {
  border-color: var(--gg-danger, #ff4d4d);
  color: var(--gg-danger, #ff4d4d);
}
.gg-cloud-save-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.gg-cloud-save-status {
  min-height: 20px;
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-cloud-save-status.ok { color: var(--gg-gold, #ffd35e); }
.gg-cloud-save-status.error { color: var(--gg-danger, #ff4d4d); }
.gg-cloud-save-warning {
  margin: 10px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-cloud-save-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--gg-line, #24334d);
}
.gg-cloud-save-close {
  appearance: none;
  -webkit-appearance: none;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 9px 16px;
  min-height: 38px;
  border-radius: 7px;
  border: 1px solid var(--gg-line, #24334d);
  background: transparent;
  color: var(--gg-text-dim, #8fa1b8);
  cursor: pointer;
}
.gg-cloud-save-close:hover,
.gg-cloud-save-close:focus-visible {
  border-color: var(--gg-gold, #ffd35e);
  color: var(--gg-gold, #ffd35e);
  outline: none;
}
`;

function make(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

let cloudSaveUid = 0;

/**
 * @param {HTMLElement} uiRoot - the #ui element.
 * @param {EventTarget} bus
 * @param {{code: Function, save: Function, load: Function,
 *          remove?: Function, state?: Function}} cloudSave
 * @param {{t: Function, registerBundle?: Function}} i18n
 * @param {{user?: Function, login?: Function, register?: Function,
 *          logout?: Function}} [auth] - optional account session system.
 * @returns {{open: () => void, close: () => void, isOpen: () => boolean}}
 */
export function createCloudSaveUI(uiRoot, bus, cloudSave, i18n, auth) {
  if (typeof document === "undefined") {
    return { open() {}, close() {}, isOpen() { return false; } };
  }
  if (!uiRoot || typeof uiRoot.appendChild !== "function") {
    throw new Error("createCloudSaveUI: container (#ui) is required");
  }
  if (!bus || typeof bus.addEventListener !== "function") {
    throw new Error("createCloudSaveUI: bus is required");
  }
  if (
    !cloudSave ||
    typeof cloudSave.code !== "function" ||
    typeof cloudSave.save !== "function" ||
    typeof cloudSave.load !== "function"
  ) {
    throw new Error("createCloudSaveUI: cloudSave system is required");
  }
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(CLOUD_SAVE_UI_BUNDLE);
  }

  const tr = (key, params) =>
    i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;

  if (
    typeof document.getElementById === "function" &&
    !document.getElementById("gg-cloud-save-style")
  ) {
    const style = document.createElement("style");
    style.id = "gg-cloud-save-style";
    style.textContent = CLOUD_SAVE_CSS;
    if (document.head && typeof document.head.appendChild === "function") {
      document.head.appendChild(style);
    }
  }

  const uid = ++cloudSaveUid;
  const titleId = "gg-cloud-save-title-" + uid;
  const introId = "gg-cloud-save-intro-" + uid;

  // --- DOM ------------------------------------------------------------------
  const overlay = make("div", "gg-cloud-save-overlay hidden", uiRoot);
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", titleId);
  overlay.setAttribute("aria-describedby", introId);

  const panel = make("div", "gg-cloud-save-panel", overlay);
  panel.tabIndex = -1;

  const title = make("h2", "gg-cloud-save-title", panel);
  title.id = titleId;
  const intro = make("p", "gg-cloud-save-intro", panel);
  intro.id = introId;

  // LOCAL BACKUP
  const localSection = make("section", "gg-cloud-save-section", panel);
  const localTitle = make("h3", "gg-cloud-save-label", localSection);
  const localText = make("p", "gg-cloud-save-text", localSection);
  const localBtn = make("button", "gg-cloud-save-btn", localSection);
  localBtn.type = "button";

  // CLOUD
  const cloudSection = make("section", "gg-cloud-save-section", panel);
  const cloudTitle = make("h3", "gg-cloud-save-label", cloudSection);

  // ACCOUNT — login/logout row; the cloud save binds to the account when a
  // session is live. Hidden entirely when no auth system was injected.
  const hasAuth = !!(
    auth &&
    typeof auth.login === "function" &&
    typeof auth.logout === "function"
  );
  const accountTitle = hasAuth
    ? make("h3", "gg-cloud-save-label", cloudSection)
    : null;
  const accountForm = hasAuth
    ? make("div", "", cloudSection)
    : null;
  const emailLabel = accountForm ? make("label", "gg-cloud-save-text", accountForm) : null;
  const emailId = "gg-cloud-save-email-" + uid;
  if (emailLabel) emailLabel.setAttribute("for", emailId);
  const emailInput = accountForm
    ? /** @type {HTMLInputElement} */ (make("input", "gg-cloud-save-input", accountForm))
    : null;
  if (emailInput) {
    emailInput.id = emailId;
    emailInput.type = "email";
    emailInput.autocomplete = "email";
    emailInput.spellcheck = false;
  }
  const passwordLabel = accountForm ? make("label", "gg-cloud-save-text", accountForm) : null;
  const passwordId = "gg-cloud-save-password-" + uid;
  if (passwordLabel) passwordLabel.setAttribute("for", passwordId);
  const passwordInput = accountForm
    ? /** @type {HTMLInputElement} */ (make("input", "gg-cloud-save-input", accountForm))
    : null;
  if (passwordInput) {
    passwordInput.id = passwordId;
    passwordInput.type = "password";
    passwordInput.autocomplete = "current-password";
  }
  const accountRow = accountForm ? make("div", "gg-cloud-save-row", accountForm) : null;
  const loginBtn = accountRow
    ? make("button", "gg-cloud-save-btn primary", accountRow)
    : null;
  if (loginBtn) loginBtn.type = "button";
  const registerBtn = accountRow
    ? make("button", "gg-cloud-save-btn", accountRow)
    : null;
  if (registerBtn) registerBtn.type = "button";
  const accountInfo = hasAuth
    ? make("div", "gg-cloud-save-row hidden", cloudSection)
    : null;
  const signedInText = accountInfo ? make("p", "gg-cloud-save-text", accountInfo) : null;
  const logoutBtn = accountInfo
    ? make("button", "gg-cloud-save-btn quiet", accountInfo)
    : null;
  if (logoutBtn) logoutBtn.type = "button";

  const codeLabel = make("label", "gg-cloud-save-text", cloudSection);
  const inputId = "gg-cloud-save-code-" + uid;
  codeLabel.setAttribute("for", inputId);

  const codeRow = make("div", "gg-cloud-save-row", cloudSection);
  const codeInput = /** @type {HTMLInputElement} */ (make("input", "gg-cloud-save-input", codeRow));
  codeInput.id = inputId;
  codeInput.type = "text";
  codeInput.maxLength = 32;
  codeInput.autocomplete = "off";
  codeInput.spellcheck = false;
  codeInput.setAttribute("autocapitalize", "off");
  codeInput.setAttribute("autocorrect", "off");

  const copyBtn = make("button", "gg-cloud-save-btn quiet", codeRow);
  copyBtn.type = "button";

  const actionRow = make("div", "gg-cloud-save-row", cloudSection);
  const saveBtn = make("button", "gg-cloud-save-btn primary", actionRow);
  saveBtn.type = "button";
  const loadBtn = make("button", "gg-cloud-save-btn", actionRow);
  loadBtn.type = "button";

  const deleteRow = make("div", "gg-cloud-save-row", cloudSection);
  const deleteBtn = make("button", "gg-cloud-save-btn danger", deleteRow);
  deleteBtn.type = "button";

  const statusEl = make("p", "gg-cloud-save-status", cloudSection);
  statusEl.setAttribute("role", "status");
  statusEl.setAttribute("aria-live", "polite");

  const warning = make("p", "gg-cloud-save-warning", cloudSection);

  const foot = make("div", "gg-cloud-save-foot", panel);
  const closeBtn = make("button", "gg-cloud-save-close", foot);
  closeBtn.type = "button";

  // --- state -----------------------------------------------------------------
  let openFlag = false;
  let pending = false;
  let deleteConfirm = false;
  /** @type {any} */
  let deleteTimer = 0;
  /** @type {{type: string, code?: string, n?: number, reloadScheduled?: boolean}} */
  let status = { type: "idle" };

  function emit(name, detail) {
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
      bus.dispatchEvent(event);
    } catch {
      /* a missing listener must not break the modal */
    }
  }

  function errorText(code) {
    return tr(ERROR_KEYS[code] || "cloudErrGeneric");
  }

  function renderStatus() {
    let text = "";
    let tone = "";
    if (status.type === "saving") text = tr("cloudStatusSaving");
    else if (status.type === "loading") text = tr("cloudStatusLoading");
    else if (status.type === "deleting") text = tr("cloudStatusDeleting");
    else if (status.type === "saved") {
      text = tr("cloudStatusSaved");
      tone = " ok";
    } else if (status.type === "loaded") {
      text = tr(status.reloadScheduled ? "cloudStatusLoadedReload" : "cloudStatusLoaded", {
        n: Math.max(0, Math.round(Number(status.n) || 0)),
      });
      tone = " ok";
    } else if (status.type === "deleted") {
      text = tr("cloudStatusDeleted");
      tone = " ok";
    } else if (status.type === "copied") {
      text = tr("cloudCopied");
      tone = " ok";
    } else if (status.type === "copy-failed") {
      text = tr("cloudCopyFailed");
      tone = " error";
    } else if (status.type === "error") {
      text = errorText(status.code || "server-error");
      tone = " error";
    } else {
      text = tr("cloudStatusReady");
    }
    statusEl.className = "gg-cloud-save-status" + tone;
    statusEl.textContent = text;
  }

  function setStatus(next) {
    status = next;
    renderStatus();
  }

  /** True while an account session is live. */
  function loggedIn() {
    return !!(hasAuth && auth.user && auth.user());
  }

  /**
   * Swap the account block between the credential form and the signed-in
   * strip, and relabel the code field (legacy/optional once signed in).
   */
  function renderAccount() {
    if (!hasAuth) return;
    const user = loggedIn() ? auth.user() : null;
    if (accountForm) accountForm.classList.toggle("hidden", !!user);
    if (accountInfo) accountInfo.classList.toggle("hidden", !user);
    if (signedInText) {
      signedInText.textContent = user
        ? tr("cloudSignedIn", { email: user.email })
        : "";
    }
    codeLabel.textContent = tr(user ? "cloudCodeOptional" : "cloudCodeLabel");
    codeInput.setAttribute(
      "aria-label",
      tr(user ? "cloudCodeOptional" : "cloudCodeLabel")
    );
    // The "code is the capability" warning only applies to anonymous code
    // saves; account saves are private by definition.
    warning.classList.toggle("hidden", !!user);
  }

  function applyTexts() {
    title.textContent = tr("cloudSaveTitle");
    intro.textContent = tr("cloudSaveIntro");
    localTitle.textContent = tr("cloudLocalTitle");
    localText.textContent = tr("cloudLocalText");
    localBtn.textContent = tr("cloudLocalOpen");
    cloudTitle.textContent = tr("cloudCloudTitle");
    if (accountTitle) accountTitle.textContent = tr("cloudAccountTitle");
    if (emailLabel) emailLabel.textContent = tr("cloudEmailLabel");
    if (passwordLabel) passwordLabel.textContent = tr("cloudPasswordLabel");
    if (loginBtn) loginBtn.textContent = tr("cloudLoginBtn");
    if (registerBtn) registerBtn.textContent = tr("cloudRegisterBtn");
    if (logoutBtn) logoutBtn.textContent = tr("cloudLogoutBtn");
    copyBtn.textContent = tr("cloudCopy");
    saveBtn.textContent = tr("cloudSaveBtn");
    loadBtn.textContent = tr("cloudLoadBtn");
    deleteBtn.textContent = tr(deleteConfirm ? "cloudDeleteConfirm" : "cloudDeleteBtn");
    closeBtn.textContent = tr("cloudClose");
    warning.textContent = tr("cloudWarning");
    renderAccount();
    renderStatus();
  }

  function setPending(next) {
    pending = next;
    overlay.setAttribute("aria-busy", next ? "true" : "false");
    saveBtn.disabled = next;
    loadBtn.disabled = next;
    deleteBtn.disabled = next;
    copyBtn.disabled = next;
    if (loginBtn) loginBtn.disabled = next;
    if (registerBtn) registerBtn.disabled = next;
    if (logoutBtn) logoutBtn.disabled = next;
    if (emailInput) emailInput.disabled = next;
    if (passwordInput) passwordInput.disabled = next;
  }

  function resetDeleteConfirm() {
    deleteConfirm = false;
    deleteBtn.classList.remove("confirming");
    deleteBtn.textContent = tr("cloudDeleteBtn");
    if (deleteTimer) {
      try {
        clearTimeout(deleteTimer);
      } catch {
        /* ignore */
      }
      deleteTimer = 0;
    }
  }

  // --- open / close -----------------------------------------------------------
  function focusInput() {
    try {
      codeInput.focus({ preventScroll: true });
      codeInput.select();
    } catch {
      try {
        codeInput.focus();
      } catch {
        /* focus is best-effort */
      }
    }
  }

  function open() {
    if (openFlag) {
      focusInput();
      return;
    }
    openFlag = true;
    overlay.classList.remove("hidden");
    try {
      const current = cloudSave.code();
      if (typeof current === "string" && current) codeInput.value = current;
    } catch {
      /* keep whatever the player typed last */
    }
    resetDeleteConfirm();
    if (status.type === "error" || status.type === "idle") setStatus({ type: "idle" });
    focusInput();
  }

  function close() {
    if (!openFlag) return;
    openFlag = false;
    overlay.classList.add("hidden");
    resetDeleteConfirm();
    try {
      const active = document.activeElement;
      if (active && active !== document.body && typeof active.blur === "function") {
        active.blur();
      }
    } catch {
      /* ignore */
    }
  }

  function isOpen() {
    return openFlag;
  }

  // --- actions ----------------------------------------------------------------
  async function readCodeInput() {
    return String(codeInput.value || "").trim();
  }

  function applyResult(result, op) {
    if (result && result.ok === true) {
      if (op === "save") setStatus({ type: "saved" });
      else if (op === "delete") setStatus({ type: "deleted" });
      else {
        setStatus({
          type: "loaded",
          n: Array.isArray(result.keys) ? result.keys.length : 0,
          reloadScheduled: result.reloadScheduled === true,
        });
      }
      return;
    }
    setStatus({ type: "error", code: result && result.error ? result.error : "server-error" });
  }

  async function runSave() {
    if (pending) return;
    const requested = await readCodeInput();
    setPending(true);
    setStatus({ type: "saving" });
    let result;
    try {
      result = await cloudSave.save(requested);
    } catch {
      result = { ok: false, error: "server-error" };
    }
    setPending(false);
    applyResult(result, "save");
  }

  async function runAuth(action) {
    if (pending || !hasAuth) return;
    const email = emailInput ? String(emailInput.value || "") : "";
    const password = passwordInput ? String(passwordInput.value || "") : "";
    setPending(true);
    setStatus({ type: "loading" });
    let result;
    try {
      result = await auth[action](email, password);
    } catch {
      result = { ok: false, error: "server-error" };
    }
    setPending(false);
    if (result && result.ok === true) {
      if (passwordInput) passwordInput.value = "";
      setStatus({ type: "idle" });
      renderAccount();
      return;
    }
    setStatus({ type: "error", code: result && result.error ? result.error : "server-error" });
  }

  async function runLogout() {
    if (pending || !hasAuth) return;
    setPending(true);
    try {
      await auth.logout();
    } catch {
      /* local state already dropped by the system */
    }
    setPending(false);
    renderAccount();
    setStatus({ type: "idle" });
  }

  async function runLoad() {
    if (pending) return;
    const requested = await readCodeInput();
    if (!requested && !loggedIn()) {
      setStatus({ type: "error", code: "bad-code" });
      focusInput();
      return;
    }
    setPending(true);
    setStatus({ type: "loading" });
    let result;
    try {
      result = await cloudSave.load(requested);
    } catch {
      result = { ok: false, error: "server-error" };
    }
    setPending(false);
    applyResult(result, "load");
  }

  async function runDelete() {
    if (pending) return;
    const requested = await readCodeInput();
    if (!requested && !loggedIn()) {
      setStatus({ type: "error", code: "bad-code" });
      focusInput();
      return;
    }
    setPending(true);
    setStatus({ type: "deleting" });
    let result;
    try {
      result = typeof cloudSave.remove === "function"
        ? await cloudSave.remove(requested)
        : { ok: false, error: "server-error" };
    } catch {
      result = { ok: false, error: "server-error" };
    }
    setPending(false);
    resetDeleteConfirm();
    applyResult(result, "delete");
  }

  async function copyCode() {
    const value = await readCodeInput();
    if (!value) {
      focusInput();
      return;
    }
    let copied = false;
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(value);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      try {
        codeInput.focus();
        codeInput.select();
        copied = !!(document.execCommand && document.execCommand("copy"));
      } catch {
        copied = false;
      }
    }
    setStatus({ type: copied ? "copied" : "copy-failed" });
  }

  // --- listeners --------------------------------------------------------------
  saveBtn.addEventListener("click", runSave);
  if (loginBtn) loginBtn.addEventListener("click", () => runAuth("login"));
  if (registerBtn) registerBtn.addEventListener("click", () => runAuth("register"));
  if (logoutBtn) logoutBtn.addEventListener("click", runLogout);
  if (passwordInput) {
    passwordInput.addEventListener("keydown", (e) => {
      if (!e || e.key !== "Enter") return;
      if (typeof e.preventDefault === "function") e.preventDefault();
      runAuth("login");
    });
  }
  loadBtn.addEventListener("click", runLoad);
  copyBtn.addEventListener("click", copyCode);

  deleteBtn.addEventListener("click", () => {
    if (pending) return;
    if (!deleteConfirm) {
      deleteConfirm = true;
      deleteBtn.classList.add("confirming");
      deleteBtn.textContent = tr("cloudDeleteConfirm");
      if (deleteTimer) clearTimeout(deleteTimer);
      deleteTimer = setTimeout(() => {
        deleteTimer = 0;
        deleteConfirm = false;
        deleteBtn.classList.remove("confirming");
        deleteBtn.textContent = tr("cloudDeleteBtn");
      }, 4000);
      return;
    }
    runDelete();
  });

  localBtn.addEventListener("click", () => {
    close();
    emit("save-tools-open");
  });

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e && e.target === overlay) close();
  });

  codeInput.addEventListener("input", resetDeleteConfirm);
  codeInput.addEventListener("keydown", (e) => {
    if (!e || e.key !== "Enter") return;
    if (typeof e.preventDefault === "function") e.preventDefault();
    if (deleteConfirm) runDelete();
    else runSave();
  });

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener(
      "keydown",
      (e) => {
        if (!openFlag || !e) return;
        if (e.code !== "Escape" && e.key !== "Escape") return;
        if (typeof e.preventDefault === "function") e.preventDefault();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        close();
      },
      true
    );
  }

  // --- bus --------------------------------------------------------------------
  bus.addEventListener("cloud-save-open", () => open());

  bus.addEventListener("cloud-save-saved", () => {
    setStatus({ type: "saved" });
  });

  bus.addEventListener("cloud-save-loaded", (e) => {
    const d = e && e.detail ? e.detail : {};
    setStatus({
      type: "loaded",
      n: Array.isArray(d.keys) ? d.keys.length : 0,
      reloadScheduled: d.reloadScheduled === true,
    });
  });

  bus.addEventListener("cloud-save-deleted", () => {
    setStatus({ type: "deleted" });
  });

  bus.addEventListener("cloud-save-error", (e) => {
    const d = e && e.detail ? e.detail : {};
    setStatus({ type: "error", code: d.code || "server-error" });
  });

  bus.addEventListener("auth-changed", () => {
    renderAccount();
    if (!openFlag) return;
    setStatus({ type: "idle" });
  });

  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail && e.detail.patch ? e.detail.patch : null;
    if (patch && patch.lang) applyTexts();
  });

  applyTexts();

  return { open, close, isOpen };
}
