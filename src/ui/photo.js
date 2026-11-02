/**
 * Photo mode — a self-contained free camera + clean-frame PNG capture.
 *
 * createPhotoMode(uiRoot, bus, camera, i18n) → { toggle, isOpen, hide, update }
 *
 * F2 toggles it (self-listened window keydown, auto-repeat ignored). It only
 * opens from the live "playing" state and never while the shop / help /
 * merchant / perks / contracts overlays are up. The bus events "photo-open"
 * and "photo-close" are the menu/debug path: "photo-open" is explicit, so it
 * bypasses the F2 state gate (a menu may intentionally enter photo mode), but
 * it still needs a camera. "photo-close" closes.
 *
 * Pause protocol (main.js owns the wiring — this module holds no gamestate):
 * - open: store the exact camera position / quaternion / FOV / Euler order,
 *   then emit "photo-open" FIRST so the lead can addPause("photo") and freeze
 *   the world, THEN release pointer lock, hide the HUD and show the panel.
 * - close: restore the exact transform + FOV, un-hide the HUD, emit
 *   "photo-closed" (the lead's removePause("photo")).
 * - This module never pauses or resumes anything itself.
 *
 * Free camera (the run is frozen, the camera is not):
 * - WASD moves along the camera's local axes (forward follows pitch), Shift
 *   is 3× faster, Q/E move down/up in world space. There are NO collision
 *   checks — it is a freecam.
 * - Left-button drag rotates yaw/pitch (no Pointer Lock: the cursor must stay
 *   free for the overlay button). Pitch is clamped to ±85°.
 * - Drag-look is applied synchronously in the mousemove handler, so it works
 *   even if the lead forgets update(); WASD needs update(dt) each frame while
 *   open (outside the paused branch, before engine.render()).
 *
 * F4 / capture:
 * - Saves document.getElementById("game").toDataURL("image/png") through a
 *   temporary <a download="gun-game-photo-<timestamp>.png">. The capture is
 *   scheduled on requestAnimationFrame so it runs AFTER the game's own render
 *   callback: the default WebGL drawing buffer is cleared when composited, so
 *   an immediate toDataURL outside the render frame can be blank.
 * - A missing canvas / blocked download / tainted canvas fails silently; photo
 *   mode itself never throws.
 *
 * UX / integration:
 * - The overlay root is pointer-events:none; only the small panel (and its
 *   close button) accepts pointer events, so the rest of the screen still
 *   belongs to the canvas drag.
 * - "#ui.photo-hidden" hides the HUD (and every other direct #ui child) for a
 *   clean frame. The class is removed on close.
 * - Escape is captured on the window CAPTURE phase and stops immediate
 *   propagation, so input.js never turns it into "pause-toggle" while photo
 *   mode is up. F2/F4 are swallowed the same way.
 * - Closing does NOT re-lock the pointer; input.js re-locks on the player's
 *   next canvas click (its normal recovery path).
 * - A state flip to menu / gameover / intro closes photo mode defensively.
 *   Another overlay opening (shop, help, merchant, perks, contracts) closes
 *   it too, so two modes can never fight over the frame.
 *
 * i18n: registers its own EN/VI bundle (PHOTO_BUNDLE) and re-renders every
 * label on "settings-changed" {patch:{lang}}.
 *
 * Performance: update(dt) allocates nothing (scalar freecam math, pre-created
 * Set); only open/close and the language refresh touch the DOM.
 */

export const PHOTO_BUNDLE = {
  en: {
    photoTitle: "PHOTO MODE",
    photoHintFly: "WASD — fly · Q/E — down/up · Shift — fast",
    photoHintLook: "Drag — look",
    photoHintExit: "F2 — exit",
    photoHintSave: "F4 — save PNG",
    photoClose: "Close",
    photoCloseAria: "Exit photo mode",
  },
  vi: {
    photoTitle: "CHẾ ĐỘ ẢNH",
    photoHintFly: "WASD — bay · Q/E — xuống/lên · Shift — nhanh",
    photoHintLook: "Kéo chuột — nhìn",
    photoHintExit: "F2 — thoát",
    photoHintSave: "F4 — lưu PNG",
    photoClose: "Đóng",
    photoCloseAria: "Thoát chế độ ảnh",
  },
};

const STYLE_ID = "gg-photo-style";
const FLY_SPEED = 6; // m/s
const FLY_FAST_MULT = 3; // Shift
const LOOK_SENSITIVITY = 0.0028; // rad per CSS pixel of drag
const PITCH_LIMIT = (85 * Math.PI) / 180;
const MAX_STEP = 0.05; // engine dt is already clamped; belt & suspenders

// Keys that belong to the free camera. Shift is tracked as a modifier.
const MOVE_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "ShiftLeft",
  "ShiftRight",
]);

const PHOTO_CSS = `
.gg-photo-root {
  position: absolute;
  inset: 0;
  z-index: 70; /* above menus (40/41), map (50) and the guide (60) */
  pointer-events: none; /* the canvas underneath keeps the drag */
  color: var(--gg-text, #dbe6f5);
  font-family: "Segoe UI", system-ui, sans-serif;
}

.gg-photo-root.hidden {
  display: none;
}

.gg-photo-panel {
  position: absolute;
  top: 16px;
  left: 16px;
  max-width: min(700px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px 11px;
  background: rgba(6, 10, 16, 0.72);
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  pointer-events: auto; /* ONLY the small panel is interactive */
}

.gg-photo-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.gg-photo-title {
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--gg-gold, #ffd35e);
}

.gg-photo-close {
  appearance: none;
  flex-shrink: 0;
  padding: 4px 10px;
  font: inherit;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gg-text, #dbe6f5);
  background: #101a2b;
  border: 1px solid #2b3d5c;
  border-radius: 6px;
  cursor: pointer;
  pointer-events: auto;
  transition:
    background 0.12s,
    border-color 0.12s,
    box-shadow 0.12s;
}

.gg-photo-close:hover {
  background: #182641;
  border-color: var(--gg-accent, #7fb2ff);
  box-shadow: 0 0 12px rgba(127, 178, 255, 0.3);
}

.gg-photo-close:focus-visible {
  outline: 2px solid var(--gg-accent, #7fb2ff);
  outline-offset: 2px;
}

.gg-photo-hints {
  margin: 0;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  line-height: 1.55;
  letter-spacing: 0.02em;
  color: var(--gg-text-dim, #8fa1b8);
  white-space: normal;
}

/* Clean frame: hide the HUD (and every other direct #ui child) while the
   photo overlay is the only thing on screen. Removing the class restores
   the HUD exactly — no inline styles are touched. */
#ui.photo-hidden .hud-root {
  display: none !important;
}

#ui.photo-hidden > :not(.gg-photo-root) {
  display: none !important;
}
`;

// --- tiny helpers -------------------------------------------------------------

function make(doc, tag, cls, parent) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (parent && typeof parent.appendChild === "function") parent.appendChild(node);
  return node;
}

function stopNow(e) {
  if (!e) return;
  if (typeof e.preventDefault === "function") e.preventDefault();
  if (typeof e.stopImmediatePropagation === "function") {
    e.stopImmediatePropagation();
  } else if (typeof e.stopPropagation === "function") {
    e.stopPropagation();
  }
}

function clampPitch(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return 0;
  if (v > PITCH_LIMIT) return PITCH_LIMIT;
  if (v < -PITCH_LIMIT) return -PITCH_LIMIT;
  return v;
}

function injectStyle(doc) {
  if (typeof doc.getElementById === "function" && doc.getElementById(STYLE_ID)) {
    return;
  }
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = PHOTO_CSS;
  const host = doc.head || doc.body || doc.documentElement;
  if (host && typeof host.appendChild === "function") host.appendChild(style);
}

/**
 * @param {HTMLElement} uiRoot - the #ui element.
 * @param {EventTarget} bus - shared game bus (gamestate.js singleton in main).
 * @param {import("three").PerspectiveCamera} camera - the FPS camera.
 * @param {{t: (key: string) => string, registerBundle?: Function}} i18n
 * @returns {{
 *   toggle: () => void,
 *   isOpen: () => boolean,
 *   hide: () => void,
 *   update: (dt: number) => void
 * }}
 */
export function createPhotoMode(uiRoot, bus, camera, i18n) {
  // Degrade to a harmless no-op rather than break bootstrap. The camera is
  // checked per operation too — a missing camera simply means "cannot open".
  if (!uiRoot || typeof uiRoot.appendChild !== "function") {
    return { toggle() {}, isOpen() { return false; }, hide() {}, update() {} };
  }
  if (!bus || typeof bus.addEventListener !== "function") {
    return { toggle() {}, isOpen() { return false; }, hide() {}, update() {} };
  }
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc || typeof doc.createElement !== "function") {
    return { toggle() {}, isOpen() { return false; }, hide() {}, update() {} };
  }

  const tr = (key) => {
    if (i18n && typeof i18n.t === "function") {
      const value = i18n.t(key);
      if (typeof value === "string" && value !== key) return value;
    }
    return PHOTO_BUNDLE.en[key] || key;
  };

  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(PHOTO_BUNDLE);
  }

  injectStyle(doc);

  // --- DOM --------------------------------------------------------------------
  const root = make(doc, "div", "gg-photo-root hidden", uiRoot);
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", tr("photoTitle"));

  const panel = make(doc, "div", "gg-photo-panel", root);
  const head = make(doc, "div", "gg-photo-head", panel);
  const title = make(doc, "div", "gg-photo-title", head);
  const closeBtn = make(doc, "button", "gg-photo-close", head);
  closeBtn.setAttribute("type", "button");
  const hints = make(doc, "p", "gg-photo-hints", panel);

  function applyTexts() {
    title.textContent = tr("photoTitle");
    hints.textContent = [
      tr("photoHintFly"),
      tr("photoHintLook"),
      tr("photoHintExit"),
      tr("photoHintSave"),
    ].join(" · ");
    closeBtn.textContent = tr("photoClose");
    closeBtn.setAttribute("aria-label", tr("photoCloseAria"));
    root.setAttribute("aria-label", tr("photoTitle"));
  }
  applyTexts();

  // --- state ------------------------------------------------------------------
  let openFlag = false;
  let lastState = "menu"; // tracked via "state-changed"; safe default
  let shopOpen = false;
  let helpOpen = false;
  let merchantOpen = false;
  let perksOpen = false;
  let contractsOpen = false;

  const keys = new Set(); // pre-created; clear() reuses it
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let yaw = 0;
  let pitch = 0;

  // Numbers only (allocated once per open); no live object references.
  let saved = null;

  // --- camera helpers ----------------------------------------------------------
  function hasCamera() {
    const p = camera && camera.position;
    return (
      !!p &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      Number.isFinite(p.z)
    );
  }

  function saveCameraState() {
    const p = camera.position;
    const r = camera.rotation;
    const q = camera.quaternion;
    const hasQuat =
      !!q &&
      Number.isFinite(q.x) &&
      Number.isFinite(q.y) &&
      Number.isFinite(q.z) &&
      Number.isFinite(q.w);
    saved = {
      px: p.x,
      py: p.y,
      pz: p.z,
      fov: Number(camera.fov),
      order: r && typeof r.order === "string" ? r.order : "YXZ",
      hasQuat,
      qx: hasQuat ? q.x : 0,
      qy: hasQuat ? q.y : 0,
      qz: hasQuat ? q.z : 0,
      qw: hasQuat ? q.w : 1,
      rx: r && Number.isFinite(r.x) ? r.x : 0,
      ry: r && Number.isFinite(r.y) ? r.y : 0,
      rz: r && Number.isFinite(r.z) ? r.z : 0,
    };
  }

  function applyLook() {
    if (!hasCamera()) return;
    const r = camera.rotation;
    if (!r || typeof r.set !== "function") return;
    if (r.order !== "YXZ") r.order = "YXZ";
    r.set(pitch, yaw, 0);
  }

  /** Start from the current view direction; the photo camera is roll-free. */
  function readLookFromCamera() {
    let nextYaw = 0;
    let nextPitch = 0;
    const q = camera && camera.quaternion;
    if (
      q &&
      Number.isFinite(q.x) &&
      Number.isFinite(q.y) &&
      Number.isFinite(q.z) &&
      Number.isFinite(q.w)
    ) {
      // Forward = (0, 0, -1) rotated by q. Decomposing the direction (and
      // dropping roll) needs no THREE import and works with any camera-like
      // object that exposes a quaternion.
      const fx = -2 * (q.x * q.z + q.w * q.y);
      const fy = 2 * (q.w * q.x - q.y * q.z);
      const fz = 2 * (q.x * q.x + q.y * q.y) - 1;
      nextPitch = Math.asin(Math.max(-1, Math.min(1, fy)));
      nextYaw = Math.atan2(-fx, -fz);
    } else if (camera && camera.rotation) {
      nextYaw = Number(camera.rotation.y);
      nextPitch = Number(camera.rotation.x);
    }
    yaw = Number.isFinite(nextYaw) ? nextYaw : 0;
    pitch = clampPitch(nextPitch);
    applyLook();
  }

  function restoreCameraState() {
    const s = saved;
    saved = null;
    if (!s || !hasCamera()) return;
    const p = camera.position;
    if (typeof p.set === "function") p.set(s.px, s.py, s.pz);
    else {
      p.x = s.px;
      p.y = s.py;
      p.z = s.pz;
    }
    const r = camera.rotation;
    // Restore the order BEFORE the quaternion: THREE's Euler order setter
    // re-derives the quaternion from the current Euler values, so the exact
    // quaternion must be written last.
    if (r && typeof r.order === "string") r.order = s.order;
    if (
      s.hasQuat &&
      camera.quaternion &&
      typeof camera.quaternion.set === "function"
    ) {
      camera.quaternion.set(s.qx, s.qy, s.qz, s.qw);
    } else if (r && typeof r.set === "function") {
      r.set(s.rx, s.ry, s.rz);
    }
    if (Number.isFinite(s.fov)) {
      if (Number.isFinite(camera.fov) && camera.fov !== s.fov) {
        camera.fov = s.fov;
        if (typeof camera.updateProjectionMatrix === "function") {
          camera.updateProjectionMatrix();
        }
      }
    }
  }

  // --- open / close ------------------------------------------------------------
  function canOpenFromPlay() {
    return (
      lastState === "playing" &&
      !shopOpen &&
      !helpOpen &&
      !merchantOpen &&
      !perksOpen &&
      !contractsOpen
    );
  }

  function setOverlayVisible(visible) {
    if (!root.classList) return;
    if (visible) root.classList.remove("hidden");
    else root.classList.add("hidden");
  }

  function setHudHidden(hidden) {
    if (!uiRoot.classList) return;
    if (hidden) uiRoot.classList.add("photo-hidden");
    else uiRoot.classList.remove("photo-hidden");
  }

  function releasePointerLock() {
    try {
      if (
        doc.pointerLockElement &&
        typeof doc.exitPointerLock === "function"
      ) {
        doc.exitPointerLock();
      }
    } catch {
      /* pointer lock can be unavailable / denied — never break the mode */
    }
  }

  /**
   * @param {boolean} force - true for the explicit bus "photo-open" request
   *   (menu/debug). F2 / toggle() use the strict live-run gate.
   * @returns {boolean} whether photo mode is now open.
   */
  function open(force) {
    if (openFlag) return true;
    if (!force && !canOpenFromPlay()) return false;
    if (!hasCamera()) return false; // safe no-op without a camera

    saveCameraState();
    readLookFromCamera();

    openFlag = true;
    keys.clear();
    dragging = false;

    // Freeze FIRST: the lead's "photo-open" listener adds pause reason "photo".
    bus.dispatchEvent(new CustomEvent("photo-open"));
    releasePointerLock();
    setHudHidden(true);
    setOverlayVisible(true);
    return true;
  }

  function close() {
    if (!openFlag) return;
    openFlag = false;
    keys.clear();
    dragging = false;

    restoreCameraState();
    setHudHidden(false);
    setOverlayVisible(false);
    // The lead's "photo-closed" listener removes pause reason "photo".
    bus.dispatchEvent(new CustomEvent("photo-closed"));
  }

  function toggle() {
    if (openFlag) close();
    else open(false);
  }

  // --- input -------------------------------------------------------------------
  function onKeyDown(e) {
    if (!e) return;
    const code = e.code;

    if (code === "F2") {
      if (e.repeat) return;
      if (openFlag) {
        stopNow(e);
        close();
      } else if (canOpenFromPlay()) {
        stopNow(e);
        open(false);
      }
      return;
    }

    if (!openFlag) return;

    if (code === "Escape") {
      // Capture phase + stopImmediate: input.js (bubble) sees nothing, so
      // this press can never become "pause-toggle".
      stopNow(e);
      close();
      return;
    }

    if (code === "F4") {
      if (e.repeat) return;
      stopNow(e);
      savePng();
      return;
    }

    if (MOVE_CODES.has(code)) keys.add(code);
  }

  function onKeyUp(e) {
    if (e && e.code) keys.delete(e.code);
  }

  function onWindowBlur() {
    keys.clear();
    dragging = false;
  }

  function onMouseDown(e) {
    if (!openFlag || !e || e.button !== 0) return;
    // The panel (including its close button) owns its own clicks.
    if (panel && typeof panel.contains === "function" && e.target) {
      if (panel.contains(e.target)) return;
    }
    dragging = true;
    lastX = Number.isFinite(e.clientX) ? e.clientX : 0;
    lastY = Number.isFinite(e.clientY) ? e.clientY : 0;
    if (typeof e.preventDefault === "function") e.preventDefault();
  }

  function onMouseMove(e) {
    if (!openFlag || !dragging || !e) return;
    const x = Number.isFinite(e.clientX) ? e.clientX : lastX;
    const y = Number.isFinite(e.clientY) ? e.clientY : lastY;
    const dx = x - lastX;
    const dy = y - lastY;
    lastX = x;
    lastY = y;
    if (dx === 0 && dy === 0) return;
    yaw -= dx * LOOK_SENSITIVITY;
    pitch = clampPitch(pitch - dy * LOOK_SENSITIVITY);
    // Applied immediately: drag-look works even without update(dt).
    applyLook();
  }

  function onMouseUp(e) {
    if (!e || e.button === 0) dragging = false;
  }

  function savePng() {
    const canvas =
      typeof doc.getElementById === "function" ? doc.getElementById("game") : null;
    if (!canvas || typeof canvas.toDataURL !== "function") return; // no canvas → no-op

    const capture = () => {
      let url = null;
      try {
        url = canvas.toDataURL("image/png");
      } catch {
        return; // tainted canvas / unsupported format — stay silent
      }
      if (typeof url !== "string" || !url) return;
      try {
        const a = doc.createElement("a");
        a.download = "gun-game-photo-" + Date.now() + ".png";
        a.href = url;
        a.style.display = "none";
        const host = doc.body || doc.documentElement;
        if (host && typeof host.appendChild === "function") host.appendChild(a);
        if (typeof a.click === "function") a.click();
        if (a.parentNode && typeof a.parentNode.removeChild === "function") {
          a.parentNode.removeChild(a);
        } else if (typeof a.remove === "function") {
          a.remove();
        }
      } catch {
        /* download blocked — never break the mode */
      }
    };

    // Let the game's own rAF(frame) run first: its engine.render() leaves the
    // WebGL drawing buffer intact for this callback.
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(capture);
    } else {
      capture();
    }
  }

  function update(dt) {
    if (!openFlag || !hasCamera()) return;
    const d = Number(dt);
    if (!Number.isFinite(d) || d <= 0) return;
    const step = Math.min(d, MAX_STEP);

    const forward = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
    const strafe = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
    const vertical = (keys.has("KeyE") ? 1 : 0) - (keys.has("KeyQ") ? 1 : 0);
    if (forward === 0 && strafe === 0 && vertical === 0) return;

    // Camera local axes for the current yaw/pitch (order YXZ, no roll).
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);

    let mx = forward * (-sinYaw * cosPitch) + strafe * cosYaw;
    let my = forward * sinPitch + vertical;
    let mz = forward * (-cosYaw * cosPitch) + strafe * -sinYaw;

    const len = Math.sqrt(mx * mx + my * my + mz * mz);
    if (len > 1e-9) {
      mx /= len;
      my /= len;
      mz /= len;
    }

    const fast = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const distance = FLY_SPEED * (fast ? FLY_FAST_MULT : 1) * step;
    const p = camera.position;
    p.x += mx * distance;
    p.y += my * distance;
    p.z += mz * distance;
  }

  // --- wiring ------------------------------------------------------------------
  closeBtn.addEventListener("click", (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    close();
  });

  bus.addEventListener("photo-open", () => {
    open(true); // explicit menu/debug request — F2's gate does not apply
  });
  bus.addEventListener("photo-close", () => close());

  bus.addEventListener("state-changed", (e) => {
    const state = e && e.detail ? e.detail.state : null;
    if (typeof state !== "string") return;
    lastState = state;
    if (state === "menu") {
      // No overlay survives a trip to the main menu.
      shopOpen = false;
      helpOpen = false;
      merchantOpen = false;
      perksOpen = false;
      contractsOpen = false;
    }
    // Defensive: a new screen must never inherit the photo camera transform.
    if (openFlag && (state === "menu" || state === "gameover" || state === "intro")) {
      close();
    }
  });

  // Overlay lifecycle: while one is up, F2 must not enter photo mode. If an
  // overlay opens while photo mode is already up, leave photo mode cleanly.
  bus.addEventListener("shop-open", () => {
    shopOpen = true;
    if (openFlag) close();
  });
  bus.addEventListener("shop-closed", () => {
    shopOpen = false;
  });
  bus.addEventListener("help-open", () => {
    helpOpen = true;
    if (openFlag) close();
  });
  bus.addEventListener("help-closed", () => {
    helpOpen = false;
  });
  bus.addEventListener("merchant-open", () => {
    merchantOpen = true;
    if (openFlag) close();
  });
  bus.addEventListener("merchant-closed", () => {
    merchantOpen = false;
  });
  bus.addEventListener("perks-choice-open", () => {
    perksOpen = true;
    if (openFlag) close();
  });
  bus.addEventListener("perks-choice-closed", () => {
    perksOpen = false;
  });
  bus.addEventListener("contracts-open", () => {
    contractsOpen = true;
    if (openFlag) close();
  });
  bus.addEventListener("contracts-closed", () => {
    contractsOpen = false;
  });

  // Live language switch (same convention as hud.js / help.js / merchant.js).
  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail ? e.detail.patch : null;
    if (patch && patch.lang) applyTexts();
  });

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onWindowBlur);
  }
  // A mouseup outside the browser window is never delivered: cancel the drag
  // when the pointer leaves the document so it cannot re-enter "stuck".
  if (typeof doc.addEventListener === "function") {
    doc.addEventListener("mouseleave", onWindowBlur);
  }

  return {
    toggle,
    isOpen() {
      return openFlag;
    },
    hide: close,
    update,
  };
}
