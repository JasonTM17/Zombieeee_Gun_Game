/**
 * ============================================================================
 * DIALOGUE — hộp thoại + intro/outro cốt truyện "ĐÊM THỨ 30 · Phần 1"
 * (docs/EXPANSION-P1.md §5.3; text EN/VI: docs/STORY.md — nguyên văn).
 * ============================================================================
 * STUB — builder UI thay thân `createDialogue`, GIỮ nguyên chữ ký + typedef
 * dưới đây.
 *
 * Bottom-screen dialogue box: simple portrait frame (colored per speaker —
 * RADIO steel blue, YOU gray, UNKNOWN static red), speaker name, and text
 * typed out CHARACTER BY CHARACTER at ~30 chars/s. Self-styled inline
 * (style.css is outside the allowed file list — pattern hud.js:240-245).
 * #ui has pointer-events: none and the box must NOT re-enable them: skipping
 * goes through the keyboard/bus and canvas clicks, never the box itself.
 *
 * Skipping: bus "interact-press" (KeyE — input.js emits it per
 * docs/EXPANSION-P1.md §5.2; works while pointer-locked AND unlocked) and a
 * plain click listener on the box node (works during intro/outro while the
 * cursor is free). First skip completes the current line instantly, second
 * skip advances to the next line; after the last line → hide + onDone().
 *
 * showIntro(slides, onDone): the New Game slides — white text on black,
 * fading, ONE slide at a time, world rendering dimmed behind them (the
 * slide backdrop is ~0.85 opaque black; the renderer is not touched). Runs
 * while gamestate is "intro" (docs/EXPANSION-P1.md §5.6.1). Skip = next
 * slide; after the last slide → onDone(). Free-roam mode skips the slides
 * entirely (main.js decides — dialogue only renders what it is given).
 *
 * showOutro(text, onDone): full-screen black-white fade-through; `text` is
 * a string or an array of strings rendered one after another; the story
 * outro line 2 ("story_outro_line2") is rendered as a BANNER (uppercase,
 * large — docs/STORY.md §4) when passed inside the array; the LAST line
 * cannot be skipped; then onDone(). main.js plays it after mission 9.
 *
 * i18n keys owned by THIS module (register via i18n.registerBundle, flat
 * keys, EN + VI verbatim from docs/EXPANSION-P1.md §7.1/§7.7; slide and
 * dialogue TEXT lives verbatim in docs/STORY.md §2–§4): speaker_radio,
 * speaker_you, speaker_unknown, intro_s1..intro_s4, story_outro_line1..3.
 *
 * The module never reads STORY.md and never composes story text itself —
 * main.js maps mission lines through STORY_DIALOGUE (missions.js export) +
 * i18n.t and hands finished strings to show().
 *
 * hide(): remove the box immediately (no onDone).
 *
 * Bus events consumed: "interact-press" (skip/advance). Bus events emitted:
 * none.
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

export function createDialogue(container, bus, i18n) {
  throw new Error("TODO: dialogue.js — build per docs/EXPANSION-P1.md §5.3");
}
