/**
 * Bootstrap (STUB — implement later).
 *
 * Creation order (spec, frozen):
 *   engine → settings → i18n → audio → input → level → atmosphere →
 *   particles → pickups → player → weapons → combat → waves (zombie manager)
 *   → hud → menus → gamestate → debug.register
 *
 * Extra wiring owned here (see the full event table in src/systems/gamestate.js):
 * - const zombies = [] — created BEFORE combat, passed to createCombat, and
 *   kept in sync by listening "zombie-spawned" (push) / "zombie-despawned"
 *   (remove) on the bus; waves announces those events because its signature
 *   cannot take the array.
 * - bus "fire" {weapon} → combat.shoot(weapon).
 * - bus "footstep" / "player-hurt" / "pickup" → audio.footstep() /
 *   audio.playerHurt() / audio.pickup() (their emitters hold no audio ref).
 * - bus "ui-play"/"ui-resume"/"ui-restart"/"ui-quit" → gamestate.* +
 *   input.lockPointer() (synchronous dispatch keeps the user gesture).
 * - bus "state-changed" → menus.show(...) + hud.show(...) routing
 *   (menu → "main"/false, playing → null/true, paused → "pause"/true,
 *   gameover → "gameover"/false).
 * - bus "settings-changed" {patch} → audio.setVolume(patch.volume) when present.
 * - settings.load() first, then i18n.setLang(settings.get().lang).
 * - waves.reset() on fresh runs; waves.update(dt, player.position) /
 *   pickups.update(dt, player.position) while playing.
 * - requestAnimationFrame loop: dt = engine.update() (already clamped ≤ 0.05);
 *   per state: menu → atmosphere.update + render only; playing →
 *   player.update, weapons.update, waves.update, pickups.update,
 *   particles.update, atmosphere.update, gamestate.update, hud.update;
 *   paused → render only. engine.render() every frame.
 * - window.__game.getState() snapshot per src/core/debug.js.
 */
console.log("stub: main");
