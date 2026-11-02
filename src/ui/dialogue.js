/**
 * ============================================================================
 * DIALOGUE — hộp thoại + intro/outro cốt truyện "ĐÊM THỨ 30 · Phần 1"
 * (docs/EXPANSION-P1.md §5.3; text EN/VI: docs/STORY.md — nguyên văn).
 * ============================================================================
 * Bottom-screen dialogue box: simple portrait frame (colored per speaker —
 * RADIO steel blue, YOU gray, UNKNOWN static red), speaker name, and text
 * typed out CHARACTER BY CHARACTER at ~30 chars/s. Self-styled inline
 * (style.css is outside the allowed file list — pattern hud.js:240-245).
 * #ui has pointer-events: none and the box must NOT re-enable them: skipping
 * goes through the keyboard/bus and canvas clicks, never the box itself.
 *
 * Skipping: bus "interact-press" (KeyE — input.js emits it per
 * docs/EXPANSION-P1.md §5.2; works while pointer-locked AND unlocked) and a
 * plain document "click" listener (works during intro/outro while the cursor
 * is free — with #ui transparent to pointer events the click lands on the
 * canvas and bubbles to document). The click path is IGNORED while the
 * pointer is locked: a locked click is a gunshot (input.js accumulates it)
 * and must never advance a line. A click within CLICK_GUARD_MS of the moment
 * the sequence started is also ignored — that is the very click that opened
 * it (the PLAY button's event bubbles up to document after the synchronous
 * "ui-play" chain has already called showIntro()).
 *
 * Skip protocol (docs/STORY.md §0): first skip completes the current line
 * instantly, second skip advances to the next line; after the last line →
 * hide + onDone().
 *
 * showIntro(slides, onDone): the New Game slides — a cinematic, full-screen
 * night transmission (deep blue-black + low amber glow, drifting fog,
 * scanlines, vignette, gold top rule, concentric radio rings) over the dimmed
 * world. ONE slide at a time, each with a chapter stamp (NIGHT 30), an
 * i18n title (intro_title_1..4), body text and a 01 / 04 counter + progress
 * dots. The intro's visual/animation CSS is injected ONCE as
 * <style id="gg-intro-style"> (style.css is outside this module's surface).
 * Runs while gamestate is "intro" (docs/EXPANSION-P1.md §5.6.1). Advance =
 * E / click (skip protocol); the bottom-right SKIP INTRO button is the only
 * pointer-events:auto descendant and finishes the whole sequence in one
 * click (stopPropagation, so the document click path cannot double-advance).
 * After the last slide → onDone(). Slides WAIT for input (no auto-advance —
 * the gamestate stays "intro" until the player finishes). Escape is
 * deliberately ignored here: the intro has no pause menu and the story must
 * be finished or skipped. Free-roam mode skips the slides entirely (main.js
 * decides — dialogue only renders what it is given).
 *
 * showOutro(text, onDone): full-screen black fade-through; `text` is
 * a string or an array of strings rendered one after another; the story
 * outro line 2 ("story_outro_line2") is detected BY CONTENT (equal to the
 * current i18n string) and rendered as a BANNER (uppercase, large —
 * docs/STORY.md §4). Outro lines auto-advance (the world keeps running
 * behind the overlay): non-final lines after OUTRO_AUTO_MS, the LAST line
 * after OUTRO_LAST_MS — the last line cannot be skipped by input, then
 * onDone(). main.js plays it after mission 9.
 *
 * show(lines, onDone) accepts BOTH documented shapes and is liberal on
 * purpose (the payload for a line is main.js's mapping of STORY_DIALOGUE +
 * i18n.t): {speakerKey, text} and {speakerKey, textKey} (textKey resolved
 * here through i18n.t at render time), {name, text} / {speaker, text}
 * (literal label — docs/STORY.md §0 form), or a plain string. The portrait
 * tint comes from speakerKey, else from matching the literal label against
 * the current-language speaker_* labels, else neutral gray. `name` wins
 * over speakerKey as the visible label (typedef).
 *
 * hide(): remove every dialogue surface immediately (no onDone). Starting a
 * new sequence while one is active replaces it silently (the previous
 * onDone is dropped — same semantics as hide()).
 *
 * i18n keys owned by THIS module (register via i18n.registerBundle, flat
 * keys, EN + VI verbatim from docs/STORY.md §2/§4/§7.1): speaker_radio,
 * speaker_you, speaker_unknown, intro_s1..intro_s4, intro_title_1..4,
 * introKicker, introSkip, introContinue, introChapter, story_outro_line1..3.
 * A live language switch re-renders the current item (key-based text and
 * speaker labels re-resolve; text passed as a finished string cannot).
 *
 * The module never reads STORY.md and never composes story text itself —
 * main.js maps mission lines through STORY_DIALOGUE (missions.js export) +
 * i18n.t and hands finished strings to show().
 *
 * Bus events consumed: "interact-press" (skip/advance), "settings-changed"
 * {patch.lang} (repaint current item). Bus events emitted: none.
 *
 * @param {HTMLElement} container - the #ui element (pointer-events: none —
 *   keep the box non-interactive; see above).
 * @param {EventTarget} bus - the shared bus (src/systems/gamestate.js).
 * @param {{t: Function, registerBundle: Function, setLang: Function,
 *   getLang: Function}} i18n - the i18n module namespace (src/core/i18n.js).
 * @returns {Dialogue}
 */

/**
 * @typedef {Object} DialogueLine
 * @property {string} [speakerKey] - i18n key for the speaker label
 *   ("speaker_radio" | "speaker_you" | "speaker_unknown"); picks the
 *   portrait tint. Optional when `name` is given directly.
 * @property {string} [name] - literal speaker label (overrides speakerKey).
 * @property {string} text - the line to type out (already i18n-resolved).
 */

/**
 * @typedef {Object} Dialogue
 * @property {(lines: Array<DialogueLine>, onDone?: () => void) => void} show
 *   Show the dialogue box and play the lines in order (~30 chars/s typing,
 *   skip protocol above), then hide + onDone().
 * @property {() => void} hide - remove the box immediately (no onDone).
 * @property {(slides: Array<string>, onDone?: () => void) => void} showIntro
 *   New Game intro: one fading text slide at a time, skip = next slide,
 *   onDone after the last one.
 * @property {(text: string | Array<string>, onDone?: () => void) => void}
 *   showOutro - full-screen fade-through outro; array items render in
 *   sequence (a line may render as a banner — docs/STORY.md §4); the last
 *   line is not skippable; onDone after it.
 */

// ~30 chars/s per docs/EXPANSION-P1.md §5.3.
const TYPE_MS = 1000 / 30;
const FADE_MS = 420; // intro/outro fade duration (inline transition)
// Outro auto-advance: the overlay is full-screen while the world keeps
// running, so it must complete on its own (last line cannot be skipped).
const OUTRO_AUTO_MS = 8000;
const OUTRO_LAST_MS = 6500;
// Ignores the document click that opened the sequence (see header).
const CLICK_GUARD_MS = 350;
// Content crossfade between intro slides (the backdrop never blinks).
const INTRO_SWAP_MS = 220;
const INTRO_STYLE_ID = "gg-intro-style";

/**
 * Everything visual about the story intro lives in this one injected sheet —
 * src/style.css is not ours to edit. Classic CSS animations only (fog drift,
 * scanline scroll, ring pulse, signal bars, hint blink): no rAF loop, no
 * per-frame JS, and every layer is hidden by display:none after the intro.
 */
const INTRO_CSS = `
.gg-intro { background: #04060a; overflow: hidden; }

/* --- backdrop: deep blue-black + warm amber glow low on the screen -------- */

.gg-intro__bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(115% 78% at 50% 114%, rgba(255, 166, 66, 0.26) 0%, rgba(255, 122, 30, 0.11) 30%, rgba(255, 122, 30, 0) 58%),
    radial-gradient(72% 56% at 50% 36%, rgba(30, 52, 86, 0.5) 0%, rgba(8, 12, 20, 0) 72%),
    linear-gradient(180deg, rgba(3, 5, 10, 0.98) 0%, rgba(6, 10, 18, 0.95) 46%, rgba(2, 4, 8, 0.99) 100%);
}

.gg-intro__fog,
.gg-intro__fog--far {
  position: absolute;
  inset: -18%;
  pointer-events: none;
  opacity: 0.5;
  filter: blur(20px);
}

.gg-intro__fog {
  background:
    radial-gradient(34% 24% at 24% 64%, rgba(130, 164, 210, 0.12), transparent 70%),
    radial-gradient(38% 22% at 76% 44%, rgba(130, 164, 210, 0.09), transparent 72%),
    radial-gradient(46% 26% at 56% 82%, rgba(255, 168, 72, 0.08), transparent 74%);
  animation: gg-intro-fog 26s ease-in-out infinite alternate;
}

.gg-intro__fog--far {
  background:
    radial-gradient(40% 20% at 66% 70%, rgba(96, 132, 184, 0.08), transparent 72%),
    radial-gradient(30% 18% at 32% 34%, rgba(255, 190, 96, 0.05), transparent 74%);
  animation: gg-intro-fog-far 38s ease-in-out infinite alternate;
}

@keyframes gg-intro-fog {
  from { opacity: 0.38; transform: translate3d(-2%, 1%, 0) scale(1.02); }
  to   { opacity: 0.68; transform: translate3d(2.5%, -2%, 0) scale(1.09); }
}

@keyframes gg-intro-fog-far {
  from { opacity: 0.3; transform: translate3d(2%, -1%, 0) scale(1.06); }
  to   { opacity: 0.55; transform: translate3d(-3%, 2%, 0) scale(1.02); }
}

.gg-intro__scan {
  position: absolute;
  inset: -12% 0;
  pointer-events: none;
  opacity: 0.34;
  background: repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.055) 0px, rgba(255, 255, 255, 0.055) 1px, transparent 1px, transparent 3px);
  animation: gg-intro-scan 6s linear infinite;
}

@keyframes gg-intro-scan {
  from { transform: translate3d(0, 0, 0); }
  to   { transform: translate3d(0, 12px, 0); }
}

.gg-intro__beam {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 26vh;
  pointer-events: none;
  opacity: 0;
  background: linear-gradient(180deg, transparent 0%, rgba(127, 178, 255, 0.05) 55%, transparent 100%);
  animation: gg-intro-beam 16s linear infinite;
}

@keyframes gg-intro-beam {
  0%   { transform: translate3d(0, -30vh, 0); opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { transform: translate3d(0, 130vh, 0); opacity: 0; }
}

/* readable pool behind the text + cinematic edge falloff */
.gg-intro__halo {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(1080px, 120vw);
  aspect-ratio: 1.6;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 1;
  background: radial-gradient(ellipse at center, rgba(3, 6, 12, 0.74) 0%, rgba(3, 6, 12, 0.44) 44%, transparent 72%);
}

.gg-intro__vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
  background:
    radial-gradient(115% 95% at 50% 48%, transparent 40%, rgba(0, 0, 0, 0.5) 76%, rgba(0, 0, 0, 0.84) 100%),
    linear-gradient(90deg, rgba(0, 0, 0, 0.5), transparent 18%, transparent 82%, rgba(0, 0, 0, 0.5));
}

.gg-intro__rule {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  z-index: 6;
  opacity: 0.9;
  background: linear-gradient(90deg, rgba(255, 211, 94, 0), rgba(255, 211, 94, 0.85) 18%, rgba(255, 236, 190, 0.95) 50%, rgba(255, 211, 94, 0.85) 82%, rgba(255, 211, 94, 0));
  box-shadow: 0 0 18px rgba(255, 190, 80, 0.35);
}

/* --- radio transmission motif (CSS only, no images) ----------------------- */

.gg-intro__motif {
  position: absolute;
  top: 50%;
  width: clamp(190px, 21vw, 280px);
  aspect-ratio: 1;
  transform: translateY(-50%);
  pointer-events: none;
  z-index: 2;
  opacity: 0.55;
}

.gg-intro__motif--l { left: clamp(-110px, -3vw, -34px); }
.gg-intro__motif--r { right: clamp(-110px, -3vw, -34px); }

.gg-intro__ring {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(127, 178, 255, 0.16);
  border-radius: 50%;
  opacity: 0.55;
  animation: gg-intro-pulse 7s ease-in-out infinite;
}

.gg-intro__ring:nth-child(2) { inset: 14%; border-color: rgba(127, 178, 255, 0.12); animation-delay: -1.6s; }
.gg-intro__ring:nth-child(3) { inset: 30%; border-color: rgba(255, 211, 94, 0.14); animation-delay: -3.2s; }
.gg-intro__ring:nth-child(4) { inset: 44%; border-color: rgba(255, 211, 94, 0.42); animation-delay: -4.8s; }
.gg-intro__motif--r .gg-intro__ring { animation-direction: reverse; }

.gg-intro__core {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 6px;
  height: 6px;
  margin: -3px 0 0 -3px;
  border-radius: 50%;
  background: var(--gg-gold, #ffd35e);
  box-shadow: 0 0 18px rgba(255, 211, 94, 0.8);
  opacity: 0.8;
}

.gg-intro__bars {
  position: absolute;
  left: 50%;
  bottom: 6%;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 22px;
  opacity: 0.55;
}

.gg-intro__motif--r .gg-intro__bars { bottom: auto; top: 6%; }

.gg-intro__bars i {
  display: block;
  width: 2px;
  height: 100%;
  background: linear-gradient(180deg, rgba(255, 211, 94, 0.9), rgba(127, 178, 255, 0.35));
  transform-origin: bottom;
  animation: gg-intro-bar 2.4s ease-in-out infinite;
}

.gg-intro__bars i:nth-child(1) { height: 32%; animation-delay: -0.1s; }
.gg-intro__bars i:nth-child(2) { height: 58%; animation-delay: -0.5s; }
.gg-intro__bars i:nth-child(3) { height: 86%; animation-delay: -0.9s; }
.gg-intro__bars i:nth-child(4) { height: 44%; animation-delay: -1.3s; }
.gg-intro__bars i:nth-child(5) { height: 72%; animation-delay: -0.35s; }
.gg-intro__bars i:nth-child(6) { height: 100%; animation-delay: -0.75s; }
.gg-intro__bars i:nth-child(7) { height: 38%; animation-delay: -1.15s; }

@keyframes gg-intro-pulse {
  0%, 100% { transform: scale(1); opacity: 0.75; }
  50%      { transform: scale(1.045); opacity: 0.38; }
}

@keyframes gg-intro-bar {
  0%, 100% { transform: scaleY(0.32); opacity: 0.3; }
  50%      { transform: scaleY(1); opacity: 0.9; }
}

/* --- chapter stamp / counter --------------------------------------------- */

.gg-intro__stamp {
  position: absolute;
  top: clamp(22px, 4.4vh, 46px);
  left: clamp(18px, 4vw, 56px);
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 14px;
  border-left: 2px solid rgba(255, 211, 94, 0.6);
  text-align: left;
}

.gg-intro__kicker {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.42em;
  text-transform: uppercase;
  color: rgba(255, 211, 94, 0.7);
}

.gg-intro__live {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--gg-gold, #ffd35e);
  box-shadow: 0 0 10px rgba(255, 211, 94, 0.9);
  animation: gg-intro-live 2.4s ease-in-out infinite;
}

@keyframes gg-intro-live {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.25; }
}

.gg-intro__chapter {
  font-size: clamp(13px, 1.15vw, 16px);
  font-weight: 700;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: #f2f5fb;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
}

.gg-intro__meta {
  position: absolute;
  top: clamp(22px, 4.4vh, 46px);
  right: clamp(18px, 4vw, 56px);
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  text-align: right;
}

.gg-intro__count {
  display: flex;
  align-items: baseline;
  gap: 0.5em;
  font-size: 12px;
  letter-spacing: 0.22em;
  color: rgba(219, 230, 245, 0.55);
  font-variant-numeric: tabular-nums;
}

.gg-intro__count strong {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--gg-gold, #ffd35e);
}

.gg-intro__dots {
  display: flex;
  align-items: center;
  gap: 6px;
}

.gg-intro__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(219, 230, 245, 0.42);
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.4s ease, box-shadow 0.4s ease;
}

.gg-intro__dot.is-active {
  width: 26px;
  background: var(--gg-gold, #ffd35e);
  box-shadow: 0 0 14px rgba(255, 211, 94, 0.5);
}

/* --- slide copy ----------------------------------------------------------- */

.gg-intro__stage {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 11vh clamp(20px, 5vw, 48px) 16vh;
  text-align: center;
}

.gg-intro__mark {
  position: relative;
  width: 54px;
  height: 2px;
  margin-bottom: 26px;
  background: linear-gradient(90deg, transparent, var(--gg-gold, #ffd35e), transparent);
}

.gg-intro__mark::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 5px;
  height: 5px;
  transform: translate(-50%, -50%) rotate(45deg);
  background: var(--gg-gold, #ffd35e);
  box-shadow: 0 0 12px rgba(255, 211, 94, 0.8);
}

.gg-intro__title {
  margin: 0;
  max-width: 920px;
  font-size: clamp(28px, 4.8vw, 62px);
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #ffe9a8;
  text-shadow: 0 4px 26px rgba(0, 0, 0, 0.9), 0 0 34px rgba(255, 180, 60, 0.22);
}

@supports ((-webkit-background-clip: text) or (background-clip: text)) {
  .gg-intro__title {
    background: linear-gradient(180deg, #fffdf6 0%, #ffe9a8 42%, #ffd35e 68%, #e8ab3c 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
  }
}

.gg-intro__body {
  margin: 30px 0 0;
  max-width: 720px;
  font-size: clamp(17px, 1.35vw, 19px);
  line-height: 1.8;
  letter-spacing: 0.01em;
  color: #ffffff;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.92);
}

/* entry / exit: children stagger, the backdrop never blinks */
.gg-intro__mark,
.gg-intro__title,
.gg-intro__body {
  opacity: 0;
  transform: translate3d(0, 18px, 0);
  transition: opacity 0.55s ease, transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
}

.gg-intro.is-ready .gg-intro__mark { opacity: 1; transform: none; transition-delay: 0.04s; }
.gg-intro.is-ready .gg-intro__title { opacity: 1; transform: none; transition-delay: 0.12s; }
.gg-intro.is-ready .gg-intro__body { opacity: 1; transform: none; transition-delay: 0.24s; }

.gg-intro.is-leaving .gg-intro__mark,
.gg-intro.is-leaving .gg-intro__title,
.gg-intro.is-leaving .gg-intro__body {
  opacity: 0;
  transform: translate3d(0, -10px, 0);
  transition-duration: 0.18s, 0.18s;
  transition-delay: 0s;
}

/* --- footer: continue hint + skip ---------------------------------------- */

.gg-intro__hint {
  position: absolute;
  left: 50%;
  bottom: clamp(22px, 4vh, 40px);
  transform: translateX(-50%);
  z-index: 5;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  white-space: nowrap;
  color: rgba(219, 230, 245, 0.78);
  animation: gg-intro-hint 3.4s ease-in-out infinite;
}

.gg-intro__hint::before {
  content: "";
  display: inline-block;
  width: 4px;
  height: 4px;
  margin-right: 10px;
  border-radius: 50%;
  background: var(--gg-gold, #ffd35e);
  vertical-align: middle;
  opacity: 0.75;
}

@keyframes gg-intro-hint {
  0%, 100% { opacity: 0.7; }
  50%      { opacity: 1; }
}

.gg-intro__skip {
  position: absolute;
  right: clamp(18px, 4vw, 56px);
  bottom: clamp(18px, 3.4vh, 34px);
  z-index: 6;
  pointer-events: auto;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 16px;
  border: 1px solid rgba(255, 211, 94, 0.38);
  border-radius: 999px;
  background: rgba(8, 12, 20, 0.62);
  color: rgba(255, 211, 94, 0.86);
  font: 700 10px/1 "Segoe UI", system-ui, sans-serif;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  transition: background-color 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}

.gg-intro__skip::after {
  content: "\\203A";
  font-size: 14px;
  line-height: 1;
  letter-spacing: 0;
  transform: translateY(-1px);
  opacity: 0.8;
}

.gg-intro__skip:hover,
.gg-intro__skip:focus-visible {
  background: var(--gg-gold, #ffd35e);
  border-color: var(--gg-gold, #ffd35e);
  color: #0a0e16;
  box-shadow: 0 0 26px rgba(255, 211, 94, 0.35);
  outline: none;
  transform: translateY(-1px);
}

.gg-intro__skip:active { transform: translateY(0); }

/* --- responsive / reduced motion ----------------------------------------- */

@media (max-width: 780px) {
  .gg-intro__motif { opacity: 0.22; }
  .gg-intro__motif--r { display: none; }
}

@media (max-width: 640px) {
  .gg-intro__chapter { font-size: 12px; letter-spacing: 0.2em; }
  .gg-intro__kicker { font-size: 9px; letter-spacing: 0.3em; }
  .gg-intro__count { font-size: 10px; }
  .gg-intro__count strong { font-size: 14px; }
  .gg-intro__title { letter-spacing: 0.1em; }
  .gg-intro__hint { bottom: 72px; font-size: 9px; letter-spacing: 0.24em; }
  .gg-intro__skip { padding: 9px 13px; font-size: 9px; letter-spacing: 0.2em; }
}

@media (pointer: coarse) {
  .gg-intro__skip { min-height: 44px; padding: 13px 18px; }
}

@media (max-height: 520px) {
  .gg-intro__mark { margin-bottom: 14px; }
  .gg-intro__title { font-size: clamp(22px, 3.6vw, 34px); }
  .gg-intro__body { margin-top: 16px; font-size: 16px; line-height: 1.6; }
  .gg-intro__stage { padding-top: 8vh; padding-bottom: 14vh; }
}

@media (prefers-reduced-motion: reduce) {
  .gg-intro__fog,
  .gg-intro__fog--far,
  .gg-intro__scan,
  .gg-intro__beam,
  .gg-intro__ring,
  .gg-intro__bars i,
  .gg-intro__live,
  .gg-intro__hint {
    animation: none !important;
  }
  .gg-intro__mark,
  .gg-intro__title,
  .gg-intro__body,
  .gg-intro__dot {
    transition: none !important;
  }
  .gg-intro__beam { opacity: 0 !important; }
}
`;

/** Inject the intro stylesheet exactly once per document. */
function ensureIntroStyle() {
  if (typeof document === "undefined" || !document.createElement) return;
  if (document.getElementById && document.getElementById(INTRO_STYLE_ID)) {
    return;
  }
  const target = document.head || document.documentElement;
  if (!target) return;
  const tag = document.createElement("style");
  tag.id = INTRO_STYLE_ID;
  tag.textContent = INTRO_CSS;
  target.appendChild(tag);
}

const DIALOGUE_BUNDLE = {
  en: {
    speaker_radio: "RADIO",
    speaker_you: "YOU",
    speaker_unknown: "UNKNOWN",
    // Intro chrome + per-slide titles (cinematic story intro, dialogue.js).
    introKicker: "STORY INTRO",
    introChapter: "NIGHT 30",
    introSkip: "SKIP INTRO",
    introContinue: "E / CLICK — CONTINUE",
    intro_title_1: "THE CITY IS QUIET",
    intro_title_2: "FIVE ARE GONE",
    intro_title_3: "THE SIGNAL",
    intro_title_4: "LIGHTS ON",
    intro_s1:
      "Day 30. The city died last week — what walks its streets now is something else. I still count the days. It's how I remember I'm human.",
    intro_s2:
      "There were six of us. Four went in the first four days. The fifth — last night.",
    intro_s3:
      'The army channel repeats one sentence, every 47 seconds: "Any survivor, make a signal. Evacuation is waiting." Its green light blinks in the same rhythm — like the heartbeat of something already dead.',
    intro_s4:
      "The safehouse still has three generators and one can of fuel. Light all three — power opens the west fence. Everything after that is a job for the gun.",
    story_outro_line1: "Half a meter of steel. It's warm.",
    story_outro_line2:
      "END OF PART 1 — BEHIND THE STEEL, SOMETHING IS STILL SQUIRMING...",
    story_outro_line3: "The city stays open. For those who want to stay.",
    // Mission dialogue lines — docs/STORY.md §3 verbatim. The §7 bundle table
    // leaves these keys unallocated; §7.7 (this module's section) carries the
    // full key list + order. main.js maps STORY_DIALOGUE through i18n.t.
    m1_radio_line1:
      "Testing this channel... someone actually answered. Strange. Evacuation doesn't take individuals.",
    m1_radio_line2:
      "Three generators in that building. Power all of them and I can open the west fence into the residential quarter.",
    m1_you_line1: "Since when do generators open gates?",
    m1_radio_line3: "Since everything else died.",
    m1_done_radio_line1:
      "That's power. West gate is open. Walk or stand there — your call.",
    m1_done_you_line1:
      "Lights on. First thing in this city that works again.",
    m2_radio_line1:
      "The residential quarter isn't clean. Put down 20 inside it. Then we talk.",
    m2_radio_line2:
      "While you're at it, pick up 3 supply packs from the houses. The living still eat. Even you.",
    m2_you_line1: "Are you on the other end of this channel, or just a tape?",
    m2_radio_line3: "20 first. Then ask.",
    m2_done_radio_line1:
      "20. East gate is open — into the commercial street. You work faster than you look.",
    m2_done_you_line1: "Still haven't seen one living face.",
    m3_radio_line1:
      "Commercial street. 25 down inside it. Then get to the glowing antenna on the plaza — I need a reading from there.",
    m3_you_line1: "A reading from the tower, or from me?",
    m3_radio_line2: "Same thing. Move.",
    m3_done_you_line1:
      '"Evacuation is waiting" repeats every 47 seconds. Same pop of static every time. It\'s a recording.',
    m3_done_radio_line1: "Hospital gate is open. Move.",
    m4_unknown_line1:
      "—hear me... if anyone is still hearing... don't touch that radio—",
    m4_you_line1: "A second voice. Not a loop. Someone real.",
    m4_unknown_line2:
      "The hospital... bring the medicine boxes... three of them... I'm inside quarantine...",
    m4_done_unknown_line1:
      "With those meds I can last until the door opens. Don't trust the other voice. It's just a machine.",
    m4_done_you_line1:
      "Machines are what open gates around here. People haven't yet.",
    m5_unknown_line1:
      "I hear the radio but I can't see you. Light the campfire in the park. When I see the smoke, I'll know you're real.",
    m5_you_line1:
      "Everyone in this city will see that smoke. Not just whoever's listening.",
    m5_radio_line1:
      "25 still standing in the park. Light it before the park is clean and you've invited everything to dinner.",
    m5_done_unknown_line1:
      "Smoke. I can see it. Now get to the docks and bring fuel — the door winch runs on it.",
    m5_done_you_line1:
      "Machines don't need smoke to believe someone is out here.",
    m6_radio_line1:
      "The docks. 30 down, and 4 fuel cans. The winch that drags the central gate runs on real fuel — recordings don't turn cranks.",
    m6_you_line1: "Who recorded the evacuation promise?",
    m6_radio_line2: "Someone who no longer needs promises.",
    m6_done_unknown_line1:
      "That's enough fuel. The steel gate at the center has power again. Listen... it has gotten loud in here. That winch will wake everything.",
    m6_done_radio_line1: "Quarantine gate is open. Go in.",
    m7_unknown_line1:
      "Can you still hear me? I'm hiding in the old concrete yard — where your team first camped, before they welded every gate shut.",
    m7_radio_line1:
      "The door only opens from outside. While the winch turns, everything within half a kilometer knows where you stand. Survive 60 seconds.",
    m7_you_line1: "And the one inside?",
    m7_radio_line2: "Silent since the winch started turning.",
    m7_done_you_line1: "60 seconds. Still breathing.",
    m7_done_unknown_line1:
      "—keep moving... but it... it stands at the door...",
    m8_unknown_line1:
      "The thing guarding the door doesn't sleep. It tears apart whoever touches the steel. Put it down.",
    m8_you_line1: "Was it a person, in there?",
    m8_radio_line1: "They were all people once. So were you.",
    m8_done_radio_line1:
      "You just cut the artery of this city. The door is unlocked. Get to it.",
    m9_radio_line1:
      "The steel door. Quarantine core. Same coordinates as the first promise.",
    m9_unknown_line1:
      "You made it... but don't open it right away. Listen first—",
  },
  vi: {
    speaker_radio: "GIỌNG RADIO",
    speaker_you: "BẠN",
    speaker_unknown: "KHÔNG RÕ",
    // Intro chrome + per-slide titles (cinematic story intro, dialogue.js).
    introKicker: "MỞ ĐẦU",
    introChapter: "ĐÊM THỨ 30",
    introSkip: "BỎ QUA",
    introContinue: "E / CLICK — TIẾP TỤC",
    intro_title_1: "THÀNH PHỐ IM",
    intro_title_2: "NĂM NGƯỜI ĐÃ MẤT",
    intro_title_3: "TÍN HIỆU",
    intro_title_4: "BẬT ĐIỆN",
    intro_s1:
      "Ngày thứ 30. Thành phố chết từ tuần trước — thứ đi lại trên phố bây giờ không còn là người. Tôi vẫn đếm ngày. Để còn nhớ mình là người.",
    intro_s2:
      "Đội tôi từng có sáu người. Bốn người mất trong bốn ngày đầu. Người thứ năm — tối qua.",
    intro_s3:
      'Kênh radio quân đội lặp lại đúng một câu, mỗi 47 giây: "Nếu còn người sống, tạo tín hiệu. Giải cứu đang chờ." Đèn xanh nhấp nháy theo đúng nhịp đó — như tim của một thứ đã chết.',
    intro_s4:
      "Nhà an toàn còn lại ba máy phát và một can xăng. Bật đủ cả ba — có điện là hàng rào tây mở. Còn lại là việc của súng.",
    story_outro_line1: "Cánh thép dày nửa mét. Nó ấm.",
    story_outro_line2:
      "HẾT PHẦN 1 — BÊN TRONG CÁNH THÉP, THỨ GÌ ĐÓ VẪN CÒN NHÓC NHÁCH...",
    story_outro_line3: "Thành phố vẫn mở. Với những ai muốn ở lại.",
    // Mission dialogue lines — docs/STORY.md §3 verbatim (see the EN note).
    m1_radio_line1:
      "Thử sóng đây... có người trả lời thật. Lạ. Giải cứu không nhận cá nhân.",
    m1_radio_line2:
      "Trong nhà có ba máy phát. Chạy đủ cả ba, tôi mở được hàng rào tây cho ông vào khu dân cư.",
    m1_you_line1: "Từ bao giờ máy phát lại mở được cổng?",
    m1_radio_line3: "Từ khi mọi thứ khác đều chết.",
    m1_done_radio_line1:
      "Đủ điện rồi. Cổng tây mở. Đi hay đứng đó là quyền của ông.",
    m1_done_you_line1:
      "Đèn sáng. Thứ đầu tiên trong thành phố này hoạt động trở lại.",
    m2_radio_line1:
      "Khu dân cư chưa sạch. Hạ 20 con trong khu đó. Rồi tôi mới nói tiếp.",
    m2_radio_line2:
      "Tiện tay nhặt 3 gói tiếp tế trong các nhà. Người sống vẫn phải ăn. Ông cũng vậy.",
    m2_you_line1: "Ông là người ở đầu dây bên kia, hay chỉ là một cuốn băng?",
    m2_radio_line3: "Hạ 20 con trước. Hỏi sau.",
    m2_done_radio_line1:
      "Đủ 20. Cổng đông mở — sang phố thương mại. Ông làm việc nhanh hơn dáng vẻ của ông.",
    m2_done_you_line1: "Vẫn chưa thấy một gương mặt người sống.",
    m3_radio_line1:
      "Phố thương mại. Hạ 25 con trong khu. Rồi tới đài phát sáng trên plaza — tôi cần một số đo từ chỗ đó.",
    m3_you_line1: "Số đo từ cái đài, hay từ tôi?",
    m3_radio_line2: "Cái nào cũng vậy. Di chuyển.",
    m3_done_you_line1:
      'Câu "giải cứu đang chờ" lặp lại đúng mỗi 47 giây, kể cả tiếng tĩnh. Đây là bản ghi âm.',
    m3_done_radio_line1: "Cổng bệnh viện mở rồi. Di chuyển.",
    m4_unknown_line1:
      "—nghe không... nếu còn ai đang nghe... đừng tắt cái radio—",
    m4_you_line1: "Giọng thứ hai. Không phải băng ghi âm. Người thật.",
    m4_unknown_line2:
      "Bệnh viện... mang giùm hộp thuốc... ba hộp... tôi bị kẹt trong tâm cách ly...",
    m4_done_unknown_line1:
      "Có thuốc tôi trụ được tới lúc cửa mở. Đừng tin giọng kia. Nó chỉ là máy móc.",
    m4_done_you_line1:
      "Ở thành phố này, máy móc mới mở được cổng. Người thì chưa.",
    m5_unknown_line1:
      "Tôi nghe được radio nhưng không nhìn thấy anh. Đốt đống lửa trại trong công viên giúp tôi. Thấy khói là tôi biết anh thật.",
    m5_you_line1:
      "Cả thành phố sẽ thấy khói đó. Không riêng gì người đang nghe.",
    m5_radio_line1:
      "Công viên còn 25 con. Bật lửa trước khi khu sạch là ông mời tất cả bọn chúng tới ăn tiệc.",
    m5_done_unknown_line1:
      "Khói rồi. Tôi thấy khói rồi. Giờ ra bến cảng lấy xăng — máy kéo cửa cần nhiên liệu.",
    m5_done_you_line1:
      "Máy móc đâu cần khói để tin rằng ngoài kia còn người.",
    m6_radio_line1:
      "Bến cảng. Hạ 30 con, nhặt 4 can xăng. Máy kéo cửa trung tâm cần xăng thật — băng ghi âm đâu quay được tay quay.",
    m6_you_line1: 'Ai đã ghi lại câu "giải cứu đang chờ"?',
    m6_radio_line2: "Một người không còn cần lời hứa.",
    m6_done_unknown_line1:
      "Đủ xăng rồi. Cổng thép trung tâm có điện lại rồi. Nghe này... bên trong ồn hẳn lên. Cái máy kéo sẽ đánh thức tất cả.",
    m6_done_radio_line1: "Cổng tâm cách ly mở. Vào đi.",
    m7_unknown_line1:
      "Anh còn nghe tôi không? Tôi trốn trong sân bê tông cũ — nơi đội anh từng dựng trại, trước khi họ hàn chặt mọi cánh cổng.",
    m7_radio_line1:
      "Cửa chỉ mở được từ phía ngoài. Máy kéo quay thì mọi thứ trong nửa cây số đều biết ông đang đứng đâu. Trụ lại 60 giây.",
    m7_you_line1: "Còn người ở trong đó thì sao?",
    m7_radio_line2: "Bặt vô âm tín từ lúc máy kéo quay.",
    m7_done_you_line1: "60 giây. Vẫn còn thở.",
    m7_done_unknown_line1:
      "—anh đi tiếp đi... nhưng có nó... nó đứng canh cửa...",
    m8_unknown_line1:
      "Thứ canh cửa không ngủ. Nó xé từng kẻ chạm vào cánh thép. Hạ nó đi.",
    m8_you_line1: "Nó đã từng là người ở trong đó, đúng không?",
    m8_radio_line1: "Tất cả bọn chúng đều từng là người. Ông cũng vậy.",
    m8_done_radio_line1:
      "Ông vừa chặn động mạch của thành phố này. Cửa đã mở khoá. Đi tới cửa đi.",
    m9_radio_line1:
      "Cánh cửa thép. Tâm cách ly. Đúng tọa độ của lời hứa đầu tiên.",
    m9_unknown_line1:
      "Anh làm được rồi... nhưng đừng mở vội. Nghe đã—",
  },
};

/** Portrait + name tints per speaker key (docs/EXPANSION-P1.md §5.3):
 * RADIO steel blue, YOU gray, UNKNOWN static red. */
const SPEAKER_TINTS = {
  speaker_radio: { frame: "#4f7fa8", name: "#8fc1e8" },
  speaker_you: { frame: "#6b7280", name: "#c3c9d4" },
  speaker_unknown: { frame: "#a8433a", name: "#ff9a8a" },
};
const NEUTRAL_TINT = SPEAKER_TINTS.speaker_you;

function make(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

/** Inline-style a node — self-styled widgets (style.css is not ours). */
function css(node, styles) {
  for (const k in styles) node.style[k] = styles[k];
  return node;
}

export function createDialogue(container, bus, i18n) {
  if (!container || typeof container.appendChild !== "function") {
    throw new Error("createDialogue: container (#ui) is required");
  }
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(DIALOGUE_BUNDLE);
  }

  const tr = (key, params) =>
    i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;

  // --- DOM (self-styled; pointer-events stay off everywhere) -----------------

  // Bottom dialogue box — the lowest UI strip ("dưới đường của shop-hint").
  const box = make("div", "dlg-box", container);
  css(box, {
    position: "absolute",
    left: "50%",
    bottom: "8px",
    transform: "translateX(-50%)",
    width: "min(720px, 92vw)",
    display: "none",
    alignItems: "flex-end",
    gap: "12px",
    padding: "10px 16px 12px",
    background: "rgba(5, 8, 14, 0.92)",
    border: "1px solid var(--gg-line, #24334d)",
    borderRadius: "8px",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.55)",
    zIndex: "30",
    pointerEvents: "none",
  });
  const portrait = make("div", "dlg-portrait", box);
  css(portrait, {
    width: "46px",
    height: "46px",
    flex: "0 0 46px",
    borderRadius: "6px",
    border: "2px solid",
    background: "rgba(255, 255, 255, 0.05)",
  });
  const mainCol = make("div", "dlg-main", box);
  css(mainCol, { flex: "1 1 auto", minWidth: "0" });
  const nameNode = make("div", "dlg-name", mainCol);
  css(nameNode, {
    fontSize: "11px",
    fontWeight: "800",
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    marginBottom: "4px",
  });
  const textNode = make("div", "dlg-text", mainCol);
  css(textNode, {
    fontSize: "15px",
    lineHeight: "1.45",
    color: "var(--gg-text, #dbe6f5)",
    minHeight: "44px",
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.8)",
    overflowWrap: "break-word",
  });
  const moreNode = make("span", "dlg-more", box);
  css(moreNode, {
    position: "absolute",
    right: "14px",
    bottom: "6px",
    fontSize: "13px",
    color: "var(--gg-gold, #ffd35e)",
    opacity: "0",
  });
  moreNode.textContent = "▸"; // blink while waiting for the skip input

  // Intro — cinematic full-screen story slides. Visuals + ambient animation
  // live in the injected #gg-intro-style sheet; only display/opacity are
  // inline. Everything stays pointer-events:none except the SKIP button.
  ensureIntroStyle();
  const slide = make("div", "dlg-slide gg-intro", container);
  css(slide, {
    position: "absolute",
    inset: "0",
    display: "none",
    overflow: "hidden",
    background: "#04060a",
    zIndex: "30",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity " + FADE_MS + "ms ease",
  });

  // Layered backdrop: gradient + fog + scanlines + light beam.
  make("div", "gg-intro__bg", slide);
  make("div", "gg-intro__fog", slide);
  make("div", "gg-intro__fog--far", slide);
  make("div", "gg-intro__scan", slide);
  make("div", "gg-intro__beam", slide);
  make("div", "gg-intro__halo", slide);

  // Radio transmission motif — concentric rings + signal bars, CSS only.
  function buildMotif(side) {
    const motif = make("div", "gg-intro__motif gg-intro__motif--" + side, slide);
    motif.setAttribute("aria-hidden", "true");
    for (let r = 0; r < 4; r++) make("span", "gg-intro__ring", motif);
    make("span", "gg-intro__core", motif);
    const bars = make("span", "gg-intro__bars", motif);
    for (let b = 0; b < 7; b++) make("i", "", bars);
  }
  buildMotif("l");
  buildMotif("r");

  make("div", "gg-intro__vignette", slide);
  make("div", "gg-intro__rule", slide);

  // Chapter stamp (top left) — "STORY INTRO" + "NIGHT 30".
  const stamp = make("div", "gg-intro__stamp", slide);
  const kickerNode = make("div", "gg-intro__kicker", stamp);
  make("span", "gg-intro__live", kickerNode).setAttribute("aria-hidden", "true");
  const kickerText = make("span", "gg-intro__kicker-text", kickerNode);
  const chapterNode = make("div", "gg-intro__chapter", stamp);

  // Counter + progress dots (top right).
  const meta = make("div", "gg-intro__meta", slide);
  const countNode = make("div", "gg-intro__count", meta);
  const countNow = make("strong", "gg-intro__count-now", countNode);
  const countRest = make("span", "gg-intro__count-rest", countNode);
  const dotsNode = make("div", "gg-intro__dots", meta);
  dotsNode.setAttribute("aria-hidden", "true");

  // Centered copy.
  const stage = make("div", "gg-intro__stage", slide);
  make("div", "gg-intro__mark", stage).setAttribute("aria-hidden", "true");
  const titleNode = make("h2", "gg-intro__title", stage);
  const slideBody = make("p", "gg-intro__body", stage);
  stage.setAttribute("aria-live", "polite");
  stage.setAttribute("aria-atomic", "true");

  // Footer hint + the only interactive element of the overlay.
  const slideHint = make("div", "gg-intro__hint", slide);
  const skipBtn = make("button", "gg-intro__skip", slide);
  skipBtn.type = "button";
  skipBtn.addEventListener("click", (e) => {
    // Must not bubble into the document click handler (would double-advance).
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    if (mode !== "intro") return;
    finish(); // skip every remaining slide — onDone fires once
  });

  // Outro — full-screen black, white text; the middle story line is a banner.
  const outro = make("div", "dlg-outro", container);
  css(outro, {
    position: "absolute",
    inset: "0",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "#000",
    zIndex: "30",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity " + FADE_MS + "ms ease",
  });
  const outroText = make("div", "dlg-outro-text", outro);
  css(outroText, {
    maxWidth: "640px",
    padding: "0 24px",
    textAlign: "center",
    fontSize: "18px",
    lineHeight: "1.8",
    color: "#dbe6f5",
    textShadow: "0 1px 6px rgba(0, 0, 0, 0.9)",
    transition: "opacity " + FADE_MS + "ms ease",
    opacity: "0",
  });

  // --- sequence state ---------------------------------------------------------
  /** @type {""|"lines"|"intro"|"outro"} */
  let mode = "";
  let seq = []; // raw items (strings | line objects | {key} objects)
  let idx = 0;
  let typing = false;
  let typeTimer = 0; // setInterval handle
  let autoTimer = 0; // outro auto-advance timeout
  let fadeTimer = 0; // pending swap after a fade-out
  let busy = false; // mid-fade: skips are dropped
  let doneFired = false;
  /** @type {null | (() => void)} */
  let onDoneCb = null;
  let startedAt = 0;
  let moreAnim = null; // WAAPI blink handle

  // --- helpers ------------------------------------------------------------------

  /** Resolve a slide/line item to its display text (re-resolved per render,
   * so key-based text follows a live language switch). */
  function itemText(raw) {
    if (typeof raw === "string") return raw;
    if (!raw || typeof raw !== "object") return "";
    if (typeof raw.text === "string") return raw.text;
    if (typeof raw.textKey === "string") return tr(raw.textKey);
    if (typeof raw.key === "string") return tr(raw.key);
    return "";
  }

  /** Visible speaker label: `name` wins over speakerKey (typedef). */
  function itemLabel(raw) {
    if (typeof raw === "string") return "";
    if (!raw || typeof raw !== "object") return "";
    if (typeof raw.name === "string" && raw.name) return raw.name;
    if (typeof raw.speakerKey === "string" && raw.speakerKey) {
      const v = tr(raw.speakerKey);
      if (v !== raw.speakerKey) return v;
    }
    if (typeof raw.speaker === "string" && raw.speaker) return raw.speaker;
    return "";
  }

  function itemTint(raw) {
    if (raw && typeof raw === "object") {
      if (
        typeof raw.speakerKey === "string" &&
        SPEAKER_TINTS[raw.speakerKey]
      ) {
        return SPEAKER_TINTS[raw.speakerKey];
      }
      const label = itemLabel(raw);
      for (const key in SPEAKER_TINTS) {
        if (label && label === tr(key)) return SPEAKER_TINTS[key];
      }
    }
    return NEUTRAL_TINT;
  }

  function stopTimers() {
    if (typeTimer) {
      clearInterval(typeTimer);
      typeTimer = 0;
    }
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = 0;
    }
    if (fadeTimer) {
      clearTimeout(fadeTimer);
      fadeTimer = 0;
    }
    typing = false;
    busy = false;
  }

  function showMore(on) {
    if (moreAnim) {
      moreAnim.cancel();
      moreAnim = null;
    }
    if (on && typeof moreNode.animate === "function") {
      moreAnim = moreNode.animate(
        [{ opacity: "1" }, { opacity: "0.1" }],
        { duration: 620, iterations: Infinity, direction: "alternate", easing: "ease-in-out" }
      );
    } else {
      moreNode.style.opacity = on ? "1" : "0";
    }
  }

  /** Typewriter: appends ~1 char per TYPE_MS (time-accumulated so a throttled
   * interval catches up instead of slowing the line down). */
  function startTyping(full) {
    stopTimers();
    typing = true;
    showMore(false);
    textNode.textContent = "";
    let acc = 0;
    let last = performance.now();
    typeTimer = setInterval(() => {
      const now = performance.now();
      acc += (now - last) / TYPE_MS;
      last = now;
      if (acc >= full.length) {
        finishTyping(full);
        return;
      }
      const c = Math.floor(acc);
      if (c > 0) textNode.textContent = full.slice(0, c);
    }, TYPE_MS);
  }

  function finishTyping(full) {
    if (typeTimer) {
      clearInterval(typeTimer);
      typeTimer = 0;
    }
    typing = false;
    textNode.textContent = full;
    showMore(true);
  }

  // --- lines mode ---------------------------------------------------------------

  function renderLine(i) {
    const raw = seq[i];
    const tint = itemTint(raw);
    const label = itemLabel(raw);
    portrait.style.borderColor = tint.frame;
    nameNode.style.color = tint.name;
    nameNode.textContent = label;
    nameNode.style.display = label ? "block" : "none";
    const full = itemText(raw);
    idx = i;
    box.style.display = "flex";
    if (full) startTyping(full);
    else {
      stopTimers();
      textNode.textContent = "";
      showMore(true); // nothing to type — wait for the skip directly
    }
  }

  // --- intro mode -----------------------------------------------------------------

  let introDots = [];
  let introDotsTotal = 0;

  const pad2 = (n) => String(n).padStart(2, "0");

  /** Rebuild dots only when the slide count changes (replays may differ). */
  function renderIntroDots(total, active) {
    if (introDotsTotal !== total) {
      introDotsTotal = total;
      introDots = [];
      dotsNode.textContent = "";
      for (let d = 0; d < total; d++) {
        introDots.push(make("span", "gg-intro__dot", dotsNode));
      }
    }
    for (let d = 0; d < introDots.length; d++) {
      introDots[d].className =
        "gg-intro__dot" + (d === active ? " is-active" : "");
    }
  }

  /** Language-dependent chrome: labels, counter, dots, skip visibility. */
  function renderIntroChrome(i) {
    const total = seq.length;
    kickerText.textContent = tr("introKicker");
    chapterNode.textContent = tr("introChapter");
    slideHint.textContent = tr("introContinue");
    skipBtn.textContent = tr("introSkip");
    skipBtn.setAttribute("aria-label", tr("introSkip"));
    countNow.textContent = pad2(i + 1);
    countRest.textContent = " / " + pad2(total);
    renderIntroDots(total, i);
    // Nothing left to skip on the final slide (finishing = one more advance).
    skipBtn.style.display = i >= total - 1 ? "none" : "inline-flex";
  }

  /** Update copy in place — no DOM rebuild (the overlay is reused). */
  function renderSlide(i) {
    idx = i;
    renderIntroChrome(i);
    const titleKey = "intro_title_" + (i + 1);
    const titleText = tr(titleKey);
    const hasTitle = !!titleText && titleText !== titleKey;
    titleNode.textContent = hasTitle ? titleText : "";
    titleNode.style.display = hasTitle ? "block" : "none";
    slideBody.textContent = itemText(seq[i]);
  }

  /** Switch the entry/exit phase class on the overlay root. The forced reflow
   * commits the hidden base state, so the next class re-runs the staggered CSS
   * transition even when the text changes in the same frame. */
  function setIntroPhase(phase) {
    slide.className = "dlg-slide gg-intro" + (phase ? " " + phase : "");
    void slide.offsetWidth;
  }

  function fadeToSlide(i) {
    busy = true;
    setIntroPhase("is-leaving"); // only the copy leaves — backdrop stays
    fadeTimer = setTimeout(() => {
      fadeTimer = 0;
      if (mode !== "intro") return;
      renderSlide(i);
      setIntroPhase(""); // commit the hidden base state…
      setIntroPhase("is-ready"); // …then transition the new copy in
      busy = false;
    }, INTRO_SWAP_MS);
  }

  // --- outro mode -------------------------------------------------------------------

  /** The banner line is detected BY CONTENT (docs/STORY.md §4: line 2 of the
   * story outro is the banner). */
  function isBanner(i) {
    const t = itemText(seq[i]);
    return !!t && t === tr("story_outro_line2");
  }

  function renderOutroLine(i) {
    idx = i;
    const banner = isBanner(i);
    css(outroText, {
      fontSize: banner ? "30px" : "18px",
      fontWeight: banner ? "800" : "400",
      letterSpacing: banner ? "0.06em" : "0.02em",
      textTransform: banner ? "uppercase" : "none",
      color: banner ? "#ffffff" : "#dbe6f5",
    });
    const full = itemText(seq[i]);
    const isLast = i === seq.length - 1;
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = 0;
    }
    if (banner) {
      stopTimers();
      outroText.textContent = full;
      outroText.style.opacity = "1";
    } else {
      outroText.style.opacity = "1";
      startOutroTyping(full);
    }
    // Auto-advance: outro runs over live gameplay, it must finish on its own.
    autoTimer = setTimeout(
      () => advance(true),
      isLast ? OUTRO_LAST_MS : OUTRO_AUTO_MS
    );
  }

  /** Outro types into outroText (the bottom box is hidden in this mode). */
  function startOutroTyping(full) {
    stopTimers();
    typing = true;
    let acc = 0;
    let last = performance.now();
    typeTimer = setInterval(() => {
      const now = performance.now();
      acc += (now - last) / TYPE_MS;
      last = now;
      if (acc >= full.length) {
        if (typeTimer) {
          clearInterval(typeTimer);
          typeTimer = 0;
        }
        typing = false;
        outroText.textContent = full;
        return;
      }
      const c = Math.floor(acc);
      if (c > 0) outroText.textContent = full.slice(0, c);
    }, TYPE_MS);
  }

  function fadeToOutroLine(i) {
    busy = true;
    if (typeTimer) {
      // Show the full current line before the fade (no mid-word cut).
      clearInterval(typeTimer);
      typeTimer = 0;
      typing = false;
      outroText.textContent = itemText(seq[idx]);
    }
    outroText.style.opacity = "0";
    fadeTimer = setTimeout(() => {
      fadeTimer = 0;
      busy = false;
      if (mode !== "outro") return;
      renderOutroLine(i);
    }, FADE_MS);
  }

  // --- sequence lifecycle ---------------------------------------------------------

  /** The outro owns the whole screen — the world must not simulate behind it.
   * gamestate freezes under the "outro" pause reason while active is true. */
  function setOutroActive(active) {
    if (bus && typeof bus.dispatchEvent === "function") {
      bus.dispatchEvent(new CustomEvent("outro-active", { detail: { active } }));
    }
  }

  function begin(kind, items, onDone) {
    stopTimers();
    showMore(false);
    // Every surface starts hidden — each show* re-reveals its own.
    box.style.display = "none";
    slide.style.display = "none";
    outro.style.display = "none";
    outroText.style.opacity = "0";
    if (mode === "outro") setOutroActive(false); // re-begin mid-outro: unfreeze
    mode = kind;
    seq = items;
    idx = 0;
    doneFired = false;
    onDoneCb = typeof onDone === "function" ? onDone : null;
    startedAt = performance.now();
  }

  function finish() {
    stopTimers();
    showMore(false);
    const wasMode = mode;
    mode = "";
    const cb = doneFired ? null : onDoneCb;
    onDoneCb = null;
    if (wasMode === "intro" || wasMode === "outro") {
      // Fade the full-screen surface out, then remove it from layout.
      const node = wasMode === "intro" ? slide : outro;
      node.style.opacity = "0";
      if (wasMode === "outro") setOutroActive(false); // world resumes
      setTimeout(() => {
        if (mode === "" && node.style.display !== "none") {
          node.style.display = "none";
        }
      }, FADE_MS);
    }
    box.style.display = "none";
    if (wasMode === "intro") {
      // The skip affordance dies with the sequence (restored by showIntro).
      skipBtn.style.display = "none";
      skipBtn.disabled = false;
    }
    if (cb) {
      doneFired = true;
      cb();
    }
  }

  /** @param {boolean} [fromAuto] - true when the outro's own timer fired
   * (the last line is not skippable by input, only by its timer). */
  function advance(fromAuto) {
    if (!mode || busy) return;
    // Outro's last line is NOT skippable (docs/STORY.md §4) — only its own
    // timer advances past it.
    if (!fromAuto && mode === "outro" && idx === seq.length - 1) return;
    if (mode === "outro" && !isBanner(idx) && typing) {
      // First skip: complete the typed line instantly.
      if (typeTimer) clearInterval(typeTimer);
      typeTimer = 0;
      typing = false;
      outroText.textContent = itemText(seq[idx]);
      return;
    }
    if (mode === "lines" && typing) {
      finishTyping(itemText(seq[idx]));
      return;
    }
    if (idx + 1 < seq.length) {
      if (mode === "lines") renderLine(idx + 1);
      else if (mode === "intro") fadeToSlide(idx + 1);
      else fadeToOutroLine(idx + 1);
    } else {
      finish();
    }
  }

  // --- inputs ---------------------------------------------------------------------

  bus.addEventListener("interact-press", () => {
    if (mode && !busy) advance();
  });

  document.addEventListener("click", () => {
    if (!mode || busy) return;
    if (typeof document !== "undefined" && document.pointerLockElement) {
      return; // locked click = gunshot (input.js) — E skips instead
    }
    if (performance.now() - startedAt < CLICK_GUARD_MS) return;
    advance();
  });

  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail && e.detail.patch ? e.detail.patch : null;
    if (!patch || !patch.lang || !mode || busy) return;
    // Repaint the current item with the fresh language (full text, no retype —
    // a live typing timer would fight the repaint, so it is stopped first).
    if (mode === "lines") {
      if (typeTimer) {
        clearInterval(typeTimer);
        typeTimer = 0;
      }
      typing = false;
      const raw = seq[idx];
      const tint = itemTint(raw);
      const label = itemLabel(raw);
      portrait.style.borderColor = tint.frame;
      nameNode.style.color = tint.name;
      nameNode.textContent = label;
      nameNode.style.display = label ? "block" : "none";
      textNode.textContent = itemText(raw);
      showMore(true);
    } else if (mode === "intro") {
      renderSlide(idx);
    } else if (mode === "outro") {
      if (typeTimer) {
        clearInterval(typeTimer);
        typeTimer = 0;
      }
      typing = false;
      outroText.textContent = itemText(seq[idx]);
    }
  });

  // --- public api -----------------------------------------------------------------

  return {
    /** @type {Dialogue["show"]} */
    show(lines, onDone) {
      const items = Array.isArray(lines) ? lines.slice() : [];
      begin("lines", items, onDone);
      if (!items.length) {
        finish();
        return;
      }
      box.style.display = "flex";
      renderLine(0);
    },

    /** @type {Dialogue["hide"]} */
    hide() {
      stopTimers();
      showMore(false);
      mode = "";
      onDoneCb = null;
      box.style.display = "none";
      setIntroPhase(""); // reset entry/exit classes for the next replay
      slide.style.display = "none";
      slide.style.opacity = "0";
      skipBtn.style.display = "none";
      skipBtn.disabled = false;
      outro.style.display = "none";
      outro.style.opacity = "0";
      outroText.style.opacity = "0";
    },

    /** @type {Dialogue["showIntro"]} */
    showIntro(slides, onDone) {
      const items = Array.isArray(slides) ? slides.slice() : [];
      ensureIntroStyle(); // idempotent — never a second style tag
      begin("intro", items, onDone);
      if (!items.length) {
        finish();
        return;
      }
      setIntroPhase(""); // fresh entry state (also clears a stale is-leaving)
      slide.style.display = "flex";
      slide.style.opacity = "0";
      skipBtn.style.display = "none";
      skipBtn.disabled = false;
      renderSlide(0); // updates title/body/counter/dots + re-reveals skip
      busy = true; // the fade-in window swallows skips (advance() no-ops)
      // Fade in on the next frame so the transition replays from display:none.
      requestAnimationFrame(() => {
        if (mode !== "intro") return;
        slide.style.opacity = "1";
        setIntroPhase("is-ready"); // staggered copy entrance
        busy = false;
      });
    },

    /** @type {Dialogue["showOutro"]} */
    showOutro(text, onDone) {
      const items = Array.isArray(text) ? text.slice() : [text];
      begin("outro", items, onDone);
      if (!items.length) {
        finish();
        return;
      }
      outro.style.display = "flex";
      outroText.style.opacity = "0";
      setOutroActive(true); // freeze the world while the outro owns the screen
      busy = true;
      requestAnimationFrame(() => {
        if (mode !== "outro") return;
        outro.style.opacity = "1";
        // Let the backdrop land before the first line renders.
        setTimeout(() => {
          busy = false;
          if (mode === "outro") renderOutroLine(0);
        }, FADE_MS);
      });
    },
  };
}
