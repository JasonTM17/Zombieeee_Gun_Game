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

import * as THREE from "three";

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
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Keep the night scene dark: renderer clears with the near-black sky color.
  renderer.setClearColor(0x05070c, 1);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / Math.max(1, window.innerHeight),
    0.1,
    500
  );

  const resizeCallbacks = [];

  function applySize() {
    const width = window.innerWidth;
    const height = Math.max(1, window.innerHeight);
    renderer.setSize(width, height, true);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    for (const cb of resizeCallbacks) {
      try {
        cb(width, height);
      } catch (err) {
        console.error("engine onResize callback failed:", err);
      }
    }
  }

  window.addEventListener("resize", applySize);
  applySize();

  // Clock: `last < 0` marks "no previous frame yet" so the first update()
  // returns 0 instead of the whole time since engine creation.
  let last = -1;

  /** @returns {number} delta seconds, clamped to <= 0.05 */
  function update() {
    const now = performance.now();
    if (last < 0) {
      last = now;
      return 0;
    }
    let dt = (now - last) / 1000;
    last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    return Math.min(dt, 0.05);
  }

  function render() {
    renderer.render(scene, camera);
  }

  return {
    renderer,
    scene,
    camera,
    onResize(cb) {
      if (typeof cb === "function") resizeCallbacks.push(cb);
    },
    update,
    render,
  };
}
