/**
 * Night atmosphere for the 60 x 60 m arena:
 * - near-black blue night sky (scene.background);
 * - FogExp2 with a dark color and density ~0.022;
 * - moon: DirectionalLight, pale blue, LOW intensity, castShadow with a
 *   shadow frustum sized to cover the arena;
 * - very weak ambient + hemisphere light (shadows stay readable);
 * - 4–6 warm PointLights placed around the arena that flicker (each with its
 *   own random flicker phase/rate);
 * - stars as a THREE.Points dome above the arena.
 *
 * update(dt) advances the flicker timers (dt in seconds).
 *
 * @param {import("three").Scene} scene
 * @returns {Atmosphere}
 */

/**
 * @typedef {Object} Atmosphere
 * @property {(dt: number) => void} update - advance flicker animation.
 */

export function createAtmosphere(scene) {
  throw new Error("TODO: implement");
}
