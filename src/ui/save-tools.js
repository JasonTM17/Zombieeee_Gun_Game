/**
 * ============================================================================
 * SAVE DATA — local export/import modal (no account, no cloud).
 * ============================================================================
 * createSaveToolsUI(uiRoot, bus, saveTools, i18n)
 *   → { open(), close(), isOpen() }
 *
 * A short, informational panel inside #ui:
 *   SAVE DATA
 *   explanation — local JSON backup, no account
 *   [ EXPORT ] [ IMPORT ]
 *   status line (role="status", aria-live="polite")
 *   F5 — export · F9 — import        [ CLOSE ]
 *
 * Wiring
 * - The lead's menu button emits "save-tools-open"; this module opens.
 * - EXPORT calls saveTools.exportAll() (system builds + downloads the bundle).
 * - IMPORT clicks a hidden <input type="file" accept=".json,application/json">;
 *   the chosen file goes straight to saveTools.importFile(file).
 * - Dropping a .json file on the panel does the same import.
 * - "save-imported" / "save-import-error" update the status line; the system
 *   also emits "save-exported" / "save-export-error", so an export started by
 *   F5 shows up while the panel is open.
 * - Live language switch: "settings-changed" {patch.lang} re-renders every
 *   label, the status message and the accessibility names.
 *
 * Deliberately NOT modal for the game: no pause, no pointer-lock calls. It is
 * a menu-level tool; opening it while playing leaves the run running. (The F5
 * and F9 shortcuts work from any state without the panel.)
 *
 * DOM safety: without a document the factory returns a no-op API instead of
 * throwing, so headless boots/tests cannot break.
 */

export const SAVE_TOOLS_UI_BUNDLE = {
  en: {
    saveToolsTitle: "SAVE DATA",
    saveToolsIntro:
      "Back up all local progress to one JSON file, or restore a backup here. No account and no cloud.",
    saveToolsExport: "EXPORT",
    saveToolsImport: "IMPORT",
    saveToolsClose: "CLOSE",
    saveToolsHint: "F5 — export · F9 — import",
    saveStatusKeys: "{n} save section(s) on this device.",
    saveStatusEmpty: "No saved progress on this device yet.",
    saveExported: "Exported {n} section(s) to {file}.",
    saveExportedNoDownload:
      "Bundle ready ({n} sections) — downloads are unavailable here.",
    saveExportFailed: "Export failed. Local storage is unavailable.",
    saveImported: "Imported {n} section(s).",
    saveImportedReload: "Imported {n} section(s). Reloading…",
    saveImportFailed: "Import failed.",
    saveErrNoFile: "No file selected.",
    saveErrFileType: "Choose a .json save file.",
    saveErrRead: "Could not read that file.",
    saveErrSize: "That file is too large.",
    saveErrJson: "That file is not valid JSON.",
    saveErrBundle: "This is not a Gun Game save bundle.",
    saveErrVersion: "Unsupported save bundle version.",
    saveErrCorrupt: "The bundle contains a corrupt save section.",
    saveErrEmpty: "The bundle has no save sections.",
    saveErrStorage: "Local storage is unavailable.",
  },
  vi: {
    saveToolsTitle: "DỮ LIỆU LƯU",
    saveToolsIntro:
      "Sao lưu toàn bộ tiến trình cục bộ ra một tệp JSON, hoặc khôi phục bản sao lưu tại đây. Không tài khoản, không đám mây.",
    saveToolsExport: "XUẤT",
    saveToolsImport: "NHẬP",
    saveToolsClose: "ĐÓNG",
    saveToolsHint: "F5 — xuất · F9 — nhập",
    saveStatusKeys: "{n} mục lưu trên thiết bị này.",
    saveStatusEmpty: "Chưa có tiến trình nào được lưu trên thiết bị này.",
    saveExported: "Đã xuất {n} mục ra {file}.",
    saveExportedNoDownload:
      "Gói đã sẵn sàng ({n} mục) — trình duyệt này không tải xuống được.",
    saveExportFailed: "Xuất thất bại. Bộ nhớ cục bộ không khả dụng.",
    saveImported: "Đã nhập {n} mục.",
    saveImportedReload: "Đã nhập {n} mục. Đang tải lại…",
    saveImportFailed: "Nhập thất bại.",
    saveErrNoFile: "Chưa chọn tệp.",
    saveErrFileType: "Hãy chọn tệp lưu .json.",
    saveErrRead: "Không đọc được tệp đó.",
    saveErrSize: "Tệp quá lớn.",
    saveErrJson: "Tệp không phải JSON hợp lệ.",
    saveErrBundle: "Đây không phải gói lưu của Gun Game.",
    saveErrVersion: "Phiên bản gói lưu không được hỗ trợ.",
    saveErrCorrupt: "Gói lưu chứa mục bị hỏng.",
    saveErrEmpty: "Gói lưu không có mục nào.",
    saveErrStorage: "Bộ nhớ cục bộ không khả dụng.",
  },
};

const ERROR_KEYS = {
  "no-file": "saveErrNoFile",
  "file-type": "saveErrFileType",
  "read-failed": "saveErrRead",
  "too-large": "saveErrSize",
  "bad-json": "saveErrJson",
  "bad-bundle": "saveErrBundle",
  "bad-version": "saveErrVersion",
  "bad-value": "saveErrCorrupt",
  empty: "saveErrEmpty",
  "storage-unavailable": "saveErrStorage",
  "storage-failed": "saveErrStorage",
  "import-failed": "saveImportFailed",
};

const SAVE_TOOLS_CSS = `
.gg-save-tools-overlay {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, rgba(5, 8, 14, 0.55) 0%, rgba(2, 4, 8, 0.88) 100%);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  pointer-events: auto;
  font-family: "Segoe UI", system-ui, sans-serif;
}
.gg-save-tools-overlay.hidden { display: none; }
.gg-save-tools-panel {
  width: min(560px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  background: var(--gg-panel, rgba(9, 13, 21, 0.94));
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 12px;
  padding: 24px 26px 18px;
  color: var(--gg-text, #dbe6f5);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.62), inset 0 0 0 1px rgba(255, 211, 94, 0.05);
}
.gg-save-tools-panel.dragover {
  border-color: var(--gg-gold, #ffd35e);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.62), 0 0 0 2px rgba(255, 211, 94, 0.24);
}
.gg-save-tools-title {
  margin: 0 0 8px;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gg-gold, #ffd35e);
  text-shadow: 0 0 22px rgba(255, 211, 94, 0.22);
}
.gg-save-tools-intro {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-save-tools-actions {
  display: flex;
  gap: 10px;
  margin: 20px 0 14px;
}
.gg-save-tools-btn {
  flex: 1;
  appearance: none;
  -webkit-appearance: none;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid var(--gg-line, #24334d);
  background: var(--gg-chip, rgba(6, 10, 16, 0.55));
  color: var(--gg-text, #dbe6f5);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.gg-save-tools-btn:hover,
.gg-save-tools-btn:focus-visible {
  border-color: var(--gg-gold, #ffd35e);
  color: var(--gg-gold, #ffd35e);
  outline: none;
}
.gg-save-tools-btn.primary {
  border-color: var(--gg-gold, #ffd35e);
  color: var(--gg-gold, #ffd35e);
  box-shadow: inset 0 0 0 1px rgba(255, 211, 94, 0.12);
}
.gg-save-tools-status {
  min-height: 20px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-save-tools-status.ok { color: var(--gg-gold, #ffd35e); }
.gg-save-tools-status.error { color: var(--gg-danger, #ff4d4d); }
.gg-save-tools-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--gg-line, #24334d);
}
.gg-save-tools-hint {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--gg-text-dim, #8fa1b8);
}
.gg-save-tools-close {
  appearance: none;
  -webkit-appearance: none;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 8px 14px;
  border-radius: 7px;
  border: 1px solid var(--gg-line, #24334d);
  background: transparent;
  color: var(--gg-text-dim, #8fa1b8);
  cursor: pointer;
}
.gg-save-tools-close:hover,
.gg-save-tools-close:focus-visible {
  border-color: var(--gg-gold, #ffd35e);
  color: var(--gg-gold, #ffd35e);
  outline: none;
}
`;

// --- small DOM helpers -------------------------------------------------------

function make(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

function fmtInt(n) {
  return String(Math.max(0, Math.round(Number(n) || 0)));
}

let saveToolsUid = 0;

/**
 * @param {HTMLElement} uiRoot - the #ui element.
 * @param {EventTarget} bus
 * @param {{exportAll: Function, importFile: Function, state?: Function}} saveTools
 * @param {{t: Function, registerBundle?: Function}} i18n
 * @returns {{open: () => void, close: () => void, isOpen: () => boolean}}
 */
export function createSaveToolsUI(uiRoot, bus, saveTools, i18n) {
  // Headless: never throw, never touch a missing DOM.
  if (typeof document === "undefined") {
    return { open() {}, close() {}, isOpen() { return false; } };
  }
  if (!uiRoot || typeof uiRoot.appendChild !== "function") {
    throw new Error("createSaveToolsUI: container (#ui) is required");
  }
  if (!bus || typeof bus.addEventListener !== "function") {
    throw new Error("createSaveToolsUI: bus is required");
  }
  if (!saveTools || typeof saveTools.exportAll !== "function" || typeof saveTools.importFile !== "function") {
    throw new Error("createSaveToolsUI: saveTools system is required");
  }
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(SAVE_TOOLS_UI_BUNDLE);
  }

  const tr = (key, params) =>
    i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;

  if (typeof document.getElementById === "function" && !document.getElementById("gg-save-tools-style")) {
    const style = document.createElement("style");
    style.id = "gg-save-tools-style";
    style.textContent = SAVE_TOOLS_CSS;
    if (document.head && typeof document.head.appendChild === "function") {
      document.head.appendChild(style);
    }
  }

  const uid = ++saveToolsUid;
  const titleId = "gg-save-tools-title-" + uid;
  const introId = "gg-save-tools-intro-" + uid;

  // --- DOM ------------------------------------------------------------------
  const overlay = make("div", "gg-save-tools-overlay hidden", uiRoot);
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", titleId);
  overlay.setAttribute("aria-describedby", introId);

  const panel = make("div", "gg-save-tools-panel", overlay);
  panel.tabIndex = -1;

  const title = make("h2", "gg-save-tools-title", panel);
  title.id = titleId;
  const intro = make("p", "gg-save-tools-intro", panel);
  intro.id = introId;

  const actions = make("div", "gg-save-tools-actions", panel);
  const exportBtn = make("button", "gg-save-tools-btn primary", actions);
  exportBtn.type = "button";
  const importBtn = make("button", "gg-save-tools-btn", actions);
  importBtn.type = "button";

  // Hidden picker for the IMPORT button. The system owns its own picker for
  // the F9 shortcut, so both entry points stay independent.
  const fileInput = /** @type {HTMLInputElement} */ (make("input", "gg-save-tools-file", panel));
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.tabIndex = -1;
  fileInput.style.display = "none";
  fileInput.setAttribute("aria-hidden", "true");

  const statusEl = make("p", "gg-save-tools-status", panel);
  statusEl.setAttribute("role", "status");
  statusEl.setAttribute("aria-live", "polite");

  const foot = make("div", "gg-save-tools-foot", panel);
  const hint = make("span", "gg-save-tools-hint", foot);
  const closeBtn = make("button", "gg-save-tools-close", foot);
  closeBtn.type = "button";

  // --- state -----------------------------------------------------------------
  let openFlag = false;
  /** @type {{type: string, keys?: number, filename?: string, downloaded?: boolean,
   *          reloadScheduled?: boolean, code?: string}} */
  let status = { type: "idle" };

  function renderStatus() {
    let text = "";
    let extra = "";
    if (status.type === "exported") {
      text = tr(status.downloaded ? "saveExported" : "saveExportedNoDownload", {
        n: fmtInt(status.keys),
        file: status.filename || "",
      });
      extra = " ok";
    } else if (status.type === "imported") {
      text = tr(status.reloadScheduled ? "saveImportedReload" : "saveImported", {
        n: fmtInt(status.keys),
      });
      extra = " ok";
    } else if (status.type === "export-error") {
      text = tr("saveExportFailed");
      extra = " error";
    } else if (status.type === "import-error") {
      text = tr(ERROR_KEYS[status.code] || "saveImportFailed");
      extra = " error";
    } else {
      let count = 0;
      try {
        const snapshot = typeof saveTools.state === "function" ? saveTools.state() : null;
        count = snapshot && Array.isArray(snapshot.keys) ? snapshot.keys.length : 0;
      } catch {
        count = 0;
      }
      text = count > 0
        ? tr("saveStatusKeys", { n: fmtInt(count) })
        : tr("saveStatusEmpty");
    }
    statusEl.className = "gg-save-tools-status" + extra;
    statusEl.textContent = text;
  }

  function setStatus(next) {
    status = next;
    renderStatus();
  }

  function applyTexts() {
    title.textContent = tr("saveToolsTitle");
    intro.textContent = tr("saveToolsIntro");
    exportBtn.textContent = tr("saveToolsExport");
    importBtn.textContent = tr("saveToolsImport");
    closeBtn.textContent = tr("saveToolsClose");
    hint.textContent = tr("saveToolsHint");
    renderStatus();
  }

  // --- open / close -----------------------------------------------------------
  function focusPanel() {
    try {
      panel.focus({ preventScroll: true });
    } catch {
      try {
        panel.focus();
      } catch {
        /* focus is best-effort */
      }
    }
  }

  function open() {
    if (openFlag) {
      focusPanel();
      return;
    }
    openFlag = true;
    overlay.classList.remove("hidden");
    if (status.type === "idle") renderStatus(); // refresh the section count
    focusPanel();
  }

  function close() {
    if (!openFlag) return;
    openFlag = false;
    overlay.classList.add("hidden");
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

  // --- import flow ------------------------------------------------------------
  function fileNameOk(file) {
    const name = file && typeof file.name === "string" ? file.name : "";
    const type = file && typeof file.type === "string" ? file.type : "";
    if (!name && !type) return true; // some browsers expose neither
    return /\.json$/i.test(name) || type.toLowerCase().indexOf("json") !== -1;
  }

  function handleFile(file) {
    if (!file) {
      setStatus({ type: "import-error", code: "no-file" });
      return;
    }
    if (!fileNameOk(file)) {
      setStatus({ type: "import-error", code: "file-type" });
      return;
    }
    Promise.resolve()
      .then(() => saveTools.importFile(file))
      .then((result) => {
        if (!result || result.ok !== true) {
          setStatus({
            type: "import-error",
            code: result && result.error ? result.error : "import-failed",
          });
          return;
        }
        setStatus({
          type: "imported",
          keys: Array.isArray(result.keys) ? result.keys.length : 0,
          reloadScheduled: result.reloadScheduled === true,
        });
      })
      .catch(() => setStatus({ type: "import-error", code: "import-failed" }));
  }

  // --- buttons ----------------------------------------------------------------
  exportBtn.addEventListener("click", () => {
    let result = null;
    try {
      result = saveTools.exportAll();
    } catch {
      result = { ok: false, error: "storage-unavailable" };
    }
    if (result && result.ok === true) {
      setStatus({
        type: "exported",
        keys: Array.isArray(result.keys) ? result.keys.length : 0,
        filename: result.filename || "",
        downloaded: result.downloaded === true,
      });
    } else {
      setStatus({ type: "export-error", code: result && result.error ? result.error : "storage-unavailable" });
    }
  });

  importBtn.addEventListener("click", () => {
    try {
      fileInput.click();
    } catch {
      setStatus({ type: "import-error", code: "no-file" });
    }
  });

  fileInput.addEventListener("change", () => {
    const files = fileInput.files;
    const file = files && files.length ? files[0] : null;
    try {
      fileInput.value = "";
    } catch {
      /* reset is best-effort */
    }
    if (file) handleFile(file);
  });

  closeBtn.addEventListener("click", close);

  overlay.addEventListener("click", (e) => {
    if (e && e.target === overlay) close();
  });

  // Drag-and-drop a .json backup onto the panel.
  panel.addEventListener("dragover", (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    panel.classList.add("dragover");
  });
  panel.addEventListener("dragleave", () => {
    panel.classList.remove("dragover");
  });
  panel.addEventListener("drop", (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    panel.classList.remove("dragover");
    const dt = e && e.dataTransfer;
    const file = dt && dt.files && dt.files.length ? dt.files[0] : null;
    if (!file) {
      setStatus({ type: "import-error", code: "no-file" });
      return;
    }
    handleFile(file);
  });

  // Escape closes; capture phase so input.js never turns the press into a
  // pause while the panel is up (there is no pause reason to pair anyway).
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
  bus.addEventListener("save-tools-open", () => open());

  bus.addEventListener("save-exported", (e) => {
    const d = e && e.detail ? e.detail : {};
    setStatus({
      type: "exported",
      keys: Array.isArray(d.keys) ? d.keys.length : 0,
      filename: typeof d.filename === "string" ? d.filename : "",
      downloaded: d.downloaded === true,
    });
  });

  bus.addEventListener("save-export-error", (e) => {
    const d = e && e.detail ? e.detail : {};
    setStatus({ type: "export-error", code: d.code || "storage-unavailable" });
  });

  bus.addEventListener("save-imported", (e) => {
    const d = e && e.detail ? e.detail : {};
    setStatus({
      type: "imported",
      keys: Array.isArray(d.keys) ? d.keys.length : 0,
      reloadScheduled: d.reloadScheduled === true,
    });
  });

  bus.addEventListener("save-import-error", (e) => {
    const d = e && e.detail ? e.detail : {};
    setStatus({ type: "import-error", code: d.code || "import-failed" });
  });

  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail && e.detail.patch ? e.detail.patch : null;
    if (patch && patch.lang) applyTexts();
  });

  applyTexts();

  return { open, close, isOpen };
}
