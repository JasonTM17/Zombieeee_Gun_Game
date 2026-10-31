/**
 * Keyboard + mouse input layer with Pointer Lock.
 *
 * Key identifiers are `KeyboardEvent.code` strings: "KeyW", "KeyA", "KeyS",
 * "KeyD", "ShiftLeft"/"ShiftRight", "Space", "KeyR", "KeyP", "Escape",
 * "KeyB", "KeyE", "Digit1"…"Digit7". Mouse buttons are addressable as "Mouse0"
 * (left / fire), "Mouse1" (middle), "Mouse2" (right) for isDown().
 * Digit4…Digit7 need NO extra plumbing (EXPANSION C7): wasPressed() already
 * forwards EVERY KeyboardEvent.code one-shot, so weapons.js polls Digit4..7
 * exactly like the existing Digit1..3.
 *
 * Bus events emitted (the shared bus lives in src/systems/gamestate.js):
 * - "pause-toggle" — exactly ONCE per Esc or P press. NOTE: the browser
 *   usually consumes Escape to exit pointer lock (the page may not receive
 *   that keydown), so the implementation must also watch pointerlockchange
 *   and emit through that path, deduplicated so one Esc press yields exactly
 *   one event (P always emits via keydown; auto-repeat must not re-emit).
 * - "shop-toggle" — per keydown of B (auto-repeat ignored) while a run is
 *   live (state "playing") and the shop is NOT already open.
 * - "interact-press" — per keydown of E (auto-repeat ignored), P1
 *   (docs/EXPANSION-P1.md §5.2). Deliberately NO gamestate condition: the
 *   intro/outro screens rely on E to skip while the pointer is unlocked, and
 *   missions/dialogue each decide whether to listen. The ONE exception is
 *   the shop overlay — while it is open E stays inert (the same rule as B:
 *   the shop UI owns both keys, input.js stays silent).
 *
 * Shop coordination (EXPANSION C7 + integration note 1 in docs/EXPANSION.md):
 * - This module tracks the overlay via bus "shop-open" / "shop-closed"
 *   (emitted by the shop UI per its own spec).
 * - While the shop is open the pointer lock is EXPECTED to be released (the
 *   overlay needs the cursor), so the pointerlockchange path must NOT emit
 *   "pause-toggle" — that would strand an orphan "user" pause reason. Esc and
 *   B likewise do not pause / re-lock: the shop UI owns BOTH keys while it is
 *   open ("Esc/B khi shop mở = đóng shop") and this module stays silent, so
 *   one keypress can never toggle the overlay twice.
 * - B is only forwarded from a live run ("playing"): the main menu and the
 *   game-over screen have no shop, and from the pause menu the shop overlay
 *   would stack on top of the pause panel.
 * - On "shop-closed" while the run is playing, the pointer is re-locked
 *   inside the same synchronous bus dispatch (= the same user gesture — the
 *   same pattern as the Esc/P resume path), so closing the shop hands the
 *   cursor straight back to the game instead of leaving it unlocked until
 *   the next canvas click.
 *
 * Wiring note: `createInput` intentionally takes NO bus parameter (signature
 * frozen by spec) — the shared `bus` singleton is imported below from
 * ../systems/gamestate.js, the module that owns bus creation.
 *
 * Listeners attach to document/window (keyboard, mousemove, mousedown, wheel,
 * pointerlockchange) so they keep working while the canvas is pointer-locked.
 *
 * Pointer-lock UX owned here (so menu buttons stay clickable no matter how
 * main.js wires state changes):
 * - While pointer-locked: mouse deltas / left click / wheel are accumulated
 *   for the game; while unlocked they are ignored (no camera jump on resume,
 *   no accidental fire when clicking menu buttons).
 * - P/Esc pause the game by emitting "pause-toggle"; on the P path the lock
 *   is also released so the pause menu gets its cursor back (the resulting
 *   pointerlockchange is swallowed by the same dedupe window). Pressing P/Esc
 *   again from the pause menu resumes AND re-locks the pointer within the
 *   same keypress gesture.
 * - On "state-changed" with state !== "playing" the lock is released (menu /
 *   paused / gameover all need a visible cursor).
 * - A click on the canvas while playing-but-unlocked re-requests the lock
 *   (recovers from a rejected re-lock during the browser's post-Esc cooldown).
 *
 * @param {HTMLCanvasElement} canvas - game canvas; pointer lock is requested on it.
 * @param {import("./settings.js").SettingsStore} settings
 *   Mouse deltas are scaled by settings.get().sensitivity at consume time.
 * @returns {Input}
 */

import { bus } from "../systems/gamestate.js"; // shared bus — see wiring note above

/**
 * @typedef {Object} Input
 * @property {(code: string) => boolean} isDown
 *   true while the key or mouse button code is currently held.
 * @property {() => {dx: number, dy: number}} consumeMouseDelta
 *   Returns accumulated mouse movement since the last call, ALREADY scaled by
 *   sensitivity (dx = movementX * s, dy = movementY * s), then resets the
 *   accumulator to {dx: 0, dy: 0}.
 * @property {() => boolean} consumeClick
 *   true once per left-button mousedown, then false until the next mousedown.
 * @property {() => (-1|0|1)} wheelDir
 *   Wheel direction of the most recent wheel event: -1 (scrolled down / towards
 *   user), 1 (scrolled up / away), 0 if none pending. Auto-reset: each value is
 *   returned once, then it reads 0 until the next wheel event.
 * @property {(code: string) => boolean} wasPressed
 *   true exactly once per physical keydown (event.repeat ignored) — reads false
 *   on subsequent polls until the key is pressed again.
 * @property {() => void} lockPointer
 *   Request pointer lock on the canvas. Must be called from a user gesture
 *   (main.js calls it inside bus listeners for ui-play / ui-resume; bus
 *   dispatchEvent is synchronous, so the gesture context is preserved).
 * @property {() => boolean} isLocked - true while pointer lock is active on the canvas.
 */

const PAUSE_DEDUPE_MS = 300;

export function createInput(canvas, settings) {
  /** @type {Set<string>} codes currently held (keyboard + "Mouse0..2") */
  const down = new Set();
  /** @type {Set<string>} one-shot keydown flags, consumed by wasPressed() */
  const pressed = new Set();

  let accX = 0;
  let accY = 0;
  let clickPending = false;
  let wheel = 0;
  let lastPauseEmit = -Infinity;
  let lastKnownState = "menu";
  let shopOpen = false; // tracked via bus "shop-open"/"shop-closed" — see header

  const isLockedNow = () =>
    typeof document !== "undefined" && document.pointerLockElement === canvas;

  // --- "pause-toggle" emission, deduplicated across all trigger paths ------
  function emitPauseOnce() {
    const now = performance.now();
    if (now - lastPauseEmit < PAUSE_DEDUPE_MS) return;
    lastPauseEmit = now;
    bus.dispatchEvent(new CustomEvent("pause-toggle"));
  }

  function releasePointerLock() {
    if (isLockedNow() && typeof document.exitPointerLock === "function") {
      document.exitPointerLock();
    }
  }

  // --- keyboard -------------------------------------------------------------
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && isLockedNow()) {
      // A menu button left focused would otherwise re-"click" on Space while
      // playing (jump key). Unlocked (menus), Space keeps its default so
      // keyboard activation of buttons still works.
      e.preventDefault();
    }
    if (e.repeat) return; // auto-repeat: no one-shot, no pause re-emit
    down.add(e.code);
    pressed.add(e.code);
    if (e.code === "Escape") {
      // While the shop overlay is open, Esc belongs to the shop UI (close the
      // shop) — no pause emission and no re-lock from here.
      if (!shopOpen) {
        // Usually swallowed by the browser when it exits pointer lock, but if
        // it IS delivered (unlocked menu), emit here; the pointerlockchange
        // path below dedupes against it. Esc from the pause menu resumes, so
        // re-grab the lock with this same keypress gesture.
        const wasState = lastKnownState;
        emitPauseOnce();
        if (wasState === "paused") lockPointer();
      }
    } else if (e.code === "KeyP") {
      // P while playing -> pause: free the cursor for the pause menu.
      // P while paused -> resume: re-grab the lock with the same gesture
      // (the button-driven resume path is main.js's ui-resume wiring).
      const wasState = lastKnownState;
      emitPauseOnce(); // synchronously flips lastKnownState via state-changed
      if (wasState === "playing") releasePointerLock();
      else if (wasState === "paused") lockPointer();
    } else if (e.code === "KeyB") {
      // B = shop toggle (EXPANSION C7). Only from a live run and only when
      // the shop is closed — while it is open the shop UI handles B itself
      // (see the shop-coordination notes in the header).
      if (!shopOpen && lastKnownState === "playing") {
        bus.dispatchEvent(new CustomEvent("shop-toggle"));
      }
    } else if (e.code === "KeyE") {
      // E = interact (P1, docs/EXPANSION-P1.md §5.2): missions resolve the
      // nearest POI from this press; dialogue reuses it to skip lines and
      // slides. No state condition (see the header) — only the shop keeps
      // the key, exactly like B above.
      if (!shopOpen) {
        bus.dispatchEvent(new CustomEvent("interact-press"));
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    down.delete(e.code);
  });

  // Alt-tab / window switch: no keyup arrives — drop everything held.
  window.addEventListener("blur", () => {
    down.clear();
    pressed.clear();
    clickPending = false;
    wheel = 0;
    accX = 0;
    accY = 0;
  });

  // --- mouse ----------------------------------------------------------------
  document.addEventListener("mousemove", (e) => {
    if (!isLockedNow()) return;
    accX += e.movementX || 0;
    accY += e.movementY || 0;
  });

  document.addEventListener("mousedown", (e) => {
    if (!isLockedNow()) return; // unlocked clicks belong to the menus
    const code = "Mouse" + e.button;
    down.add(code);
    if (e.button === 0) clickPending = true;
  });

  document.addEventListener("mouseup", (e) => {
    down.delete("Mouse" + e.button);
  });

  window.addEventListener(
    "wheel",
    (e) => {
      if (!isLockedNow() || e.deltaY === 0) return;
      wheel = e.deltaY > 0 ? -1 : 1;
    },
    { passive: true }
  );

  // --- pointer lock lifecycle ------------------------------------------------
  document.addEventListener("pointerlockchange", () => {
    const locked = isLockedNow();
    if (!locked) {
      // The shop releasing the lock is EXPECTED (its overlay needs the
      // cursor) — treating it as a pause would strand an orphan "user"
      // pause reason (docs/EXPANSION.md integration note 1).
      if (shopOpen) return;
      // Lock lost: an Esc press the page never saw, or our own release on
      // pause/state change. Emit exactly once — the dedupe window absorbs
      // the case where the Esc keydown was also delivered.
      emitPauseOnce();
    }
  });

  // Menus need a cursor whenever we are not playing.
  bus.addEventListener("state-changed", (e) => {
    const detail = e && e.detail ? e.detail : {};
    lastKnownState = detail.state || lastKnownState;
    if (lastKnownState === "menu") shopOpen = false; // safety: no shop outside a run
    if (lastKnownState !== "playing") releasePointerLock();
  });

  // Shop overlay lifecycle (see the header for the full protocol). The
  // "shop-closed" re-lock runs inside the same synchronous bus dispatch as
  // the shop UI's keydown handler → same user gesture → valid Pointer Lock
  // request (double-request with any main.js wiring is harmless — the
  // rejection is swallowed below).
  bus.addEventListener("shop-open", () => {
    shopOpen = true;
  });
  bus.addEventListener("shop-closed", () => {
    shopOpen = false;
    if (lastKnownState === "playing") lockPointer();
  });

  // Recovery path: playing but lock was refused (e.g. re-lock cooldown right
  // after Esc) — a click on the canvas is a fresh user gesture.
  canvas.addEventListener("click", () => {
    if (shopOpen) return; // clicks belong to the shop overlay buttons
    if (lastKnownState === "playing" && !isLockedNow()) lockPointer();
  });

  // --- public api -------------------------------------------------------------
  function isDown(code) {
    return down.has(code);
  }

  function consumeMouseDelta() {
    const s =
      settings && typeof settings.get === "function"
        ? settings.get().sensitivity
        : 1;
    const sens = Number.isFinite(s) && s > 0 ? s : 1;
    const out = { dx: accX * sens, dy: accY * sens };
    accX = 0;
    accY = 0;
    return out;
  }

  function consumeClick() {
    const v = clickPending;
    clickPending = false;
    return v;
  }

  function wheelDir() {
    const v = wheel;
    wheel = 0;
    return v;
  }

  function wasPressed(code) {
    if (pressed.has(code)) {
      pressed.delete(code);
      return true;
    }
    return false;
  }

  function lockPointer() {
    try {
      // Drop focus from a menu button so Space/Enter can't re-trigger it
      // (a re-dispatched "ui-play" mid-game would restart the run).
      const active = typeof document !== "undefined" ? document.activeElement : null;
      if (active && typeof active.blur === "function" && active !== document.body) {
        active.blur();
      }
      const p = canvas.requestPointerLock();
      // Newer browsers return a Promise — swallow the post-Esc-cooldown
      // rejection (the canvas click path above is the recovery route).
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      /* older browsers throw synchronously on denial — ignore */
    }
  }

  function isLocked() {
    return isLockedNow();
  }

  return {
    isDown,
    consumeMouseDelta,
    consumeClick,
    wheelDir,
    wasPressed,
    lockPointer,
    isLocked,
  };
}
