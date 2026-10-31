/**
 * Core engine wrapper around Three.js: renderer + scene + camera + clock.
 *
 * Contract notes (signatures are frozen — other modules depend on them):
 * - `camera` is a PerspectiveCamera with fov 75; aspect is kept in sync on resize.
 * - `update()` returns the frame delta time in SECONDS, clamped to at most
 *   0.05 s (protects physics/animation from tab-switch spikes).
 * - `render()` draws one frame: renderer.render(scene, camera).
 * - The renderer should enable its shadow map (the moon light in
 *   atmosphere.js casts shadows) and clamp devicePixelRatio (<= 2 recommended).
 * - Sizes: the renderer fills the viewport (window.innerWidth/innerHeight or
 *   the canvas client size); <canvas id="game"> is the only canvas in the page.
 *
 * @param {HTMLCanvasElement} canvas - the <canvas id="game"> element from index.html.
 * @returns {Engine}
 */

/**
 * @typedef {Object} Engine
 * @property {import("three").WebGLRenderer} renderer - WebGL renderer bound to the canvas.
 * @property {import("three").Scene} scene - root scene graph; every module adds its objects here.
 * @property {import("three").PerspectiveCamera} camera - player camera, fov 75.
 * @property {(cb: (width: number, height: number) => void) => void} onResize
 *   Register a callback invoked on window resize with the new viewport size in
 *   CSS pixels. The engine itself keeps renderer size and camera aspect in
 *   sync; the callback is informational (e.g. HUD re-layout).
 * @property {() => number} update
 *   Advance the engine clock. Returns delta time in seconds since the previous
 *   call, clamped so that dt <= 0.05. The first call returns 0 (or a tiny dt).
 * @property {() => void} render - render the scene with the camera.
 */

export function createEngine(canvas) {
  throw new Error("TODO: implement");
}
