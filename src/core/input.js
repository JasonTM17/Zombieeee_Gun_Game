/**
 * Keyboard + mouse input layer with Pointer Lock.
 *
 * Key identifiers are `KeyboardEvent.code` strings: "KeyW", "KeyA", "KeyS",
 * "KeyD", "ShiftLeft"/"ShiftRight", "Space", "KeyR", "KeyP", "Escape",
 * "Digit1", "Digit2", "Digit3". Mouse buttons are addressable as "Mouse0"
 * (left / fire), "Mouse1" (middle), "Mouse2" (right) for isDown().
 *
 * Bus events emitted (the shared bus lives in src/systems/gamestate.js):
 * - "pause-toggle" — exactly ONCE per Esc or P press. NOTE: the browser
 *   usually consumes Escape to exit pointer lock (the page may not receive
 *   that keydown), so the implementation must also watch pointerlockchange
 *   and emit through that path, deduplicated so one Esc press yields exactly
 *   one event (P always emits via keydown; auto-repeat must not re-emit).
 *
 * Wiring note: `createInput` intentionally takes NO bus parameter (signature
 * frozen by spec) — the shared `bus` singleton is imported below from
 * ../systems/gamestate.js, the module that owns bus creation.
 *
 * Listeners attach to document/window (keyboard, mousemove, mousedown, wheel,
 * pointerlockchange) so they keep working while the canvas is pointer-locked.
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

export function createInput(canvas, settings) {
  throw new Error("TODO: implement");
}
