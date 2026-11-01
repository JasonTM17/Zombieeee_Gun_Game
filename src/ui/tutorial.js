/**
 * First-run tutorial / onboarding checklist — a compact card inside #ui.
 *
 * createTutorial(uiRoot, bus, i18n) → { start, skip, isActive, stepIndex }
 *
 * The card sits at the LEFT edge, vertically centred (z-index 46: above every
 * HUD widget, below the map 50 / help 60 / shop 40 overlays — which also hide
 * it), and is purely informational: `pointer-events: none` on the panel. Only
 * the small SKIP button re-enables pointer events on itself, so gameplay
 * clicks are never captured by the card.
 *
 * Nine steps, each a keycap chip + an EN/VI instruction. A step advances ONLY
 * when the player actually performs its action:
 *   move      KeyW/KeyA/KeyS/KeyD keydown
 *   sprint    ShiftLeft/ShiftRight keydown
 *   fire      bus "fire" OR left mousedown while pointer-locked
 *   reload    KeyR keydown
 *   switch    Digit1/Digit2/Digit3 keydown
 *   jump      Space keydown
 *   interact  bus "interact-press"
 *   shop      bus "shop-toggle" or "shop-open"
 *   guide     bus "help-open"
 * Every step also auto-advances after 20 s so a stuck player is never blocked.
 * Keyboard/mouse listeners are OBSERVATIONAL: nothing is consumed and
 * preventDefault/stopPropagation are never called.
 *
 * First-run gate: localStorage "gungame.tutorial.v1" = {done:true}. It is read
 * defensively (missing / corrupt / blocked storage → treated as "not done")
 * and written on completion OR skip. The first "state-changed" to "playing"
 * after construction auto-starts the tutorial when the flag is absent; menu,
 * intro, paused and gameover never auto-start it. The flag is cleared only in
 * memory by start(), so a replay never touches storage until it completes.
 *
 * Replay: the main menu's TUTORIAL button dispatches "tutorial-start" on the
 * bus (self-wired here — main.js needs no routing). If the button is pressed
 * in the menu, the card waits hidden until the run reaches "playing".
 *
 * Visibility: hidden whenever the run is not "playing", and while the shop
 * ("shop-open"), the field guide ("help-open") or the map
 * ("map-visibility" {open:true}) is up. Step and completion timers are PAUSED
 * while hidden and resume with their remaining time, so a long pause or a
 * shop visit never eats a tutorial step. On the last step the card switches
 * to "TRAINING COMPLETE" for 3 s, then hides (completion is persisted first).
 *
 * Layout is deliberately left-of-centre and narrow (≈300 px, capped at
 * 50vw - 40px) so it can never cover the crosshair; max-height keeps it clear
 * of the bottom-left health block. No per-frame work: bus events, window
 * keydown, document mousedown and setTimeout only.
 *
 * All visible text goes through i18n.registerBundle (EN + VI). A live language
 * switch re-renders the labels in place. Styles are injected once (id
 * "gg-tutorial-style") and reuse the #ui theme custom properties.
 *
 * @param {HTMLElement} container - the #ui element.
 * @param {EventTarget} bus - the shared event bus.
 * @param {{t: Function, registerBundle: Function}} i18n
 *   The i18n module namespace (see src/core/i18n.js).
 * @returns {{start: () => void, skip: () => void, isActive: () => boolean,
 *            stepIndex: () => number}}
 */

export const TUTORIAL_STORAGE_KEY = "gungame.tutorial.v1";

const STEP_MS = 20000; // auto-advance so a step never blocks the run
const DONE_MS = 3000; // "TRAINING COMPLETE" card lifetime

const TUTORIAL_BUNDLE = {
  en: {
    tutTitle: "TUTORIAL",
    tutStep: "STEP {n}/{total}",
    tutSkip: "SKIP",
    tutDone: "TRAINING COMPLETE",
    tutMove: "Move",
    tutSprint: "Sprint",
    tutFire: "Aim & fire",
    tutReload: "Reload",
    tutSwitch: "Switch weapon",
    tutJump: "Jump",
    tutInteract: "Interact",
    tutShop: "Shop",
    tutGuide: "Field guide",
  },
  vi: {
    tutTitle: "HUẤN LUYỆN",
    tutStep: "BƯỚC {n}/{total}",
    tutSkip: "BỎ QUA",
    tutDone: "HOÀN THÀNH HUẤN LUYỆN",
    tutMove: "Di chuyển",
    tutSprint: "Chạy nhanh",
    tutFire: "Ngắm & bắn",
    tutReload: "Nạp đạn",
    tutSwitch: "Đổi súng",
    tutJump: "Nhảy",
    tutInteract: "Tương tác",
    tutShop: "Cửa hàng",
    tutGuide: "Hướng dẫn",
  },
};

// id → the keyboard triggers it accepts. `codes` is the KeyboardEvent.code
// list; steps with an empty list advance from their bus event instead (fire
// also accepts a pointer-locked left mousedown — handled separately).
const STEPS = [
  { id: "move", keycap: "W A S D", labelKey: "tutMove", codes: ["KeyW", "KeyA", "KeyS", "KeyD"] },
  { id: "sprint", keycap: "Shift", labelKey: "tutSprint", codes: ["ShiftLeft", "ShiftRight"] },
  { id: "fire", keycap: "Mouse L", labelKey: "tutFire", codes: [] },
  { id: "reload", keycap: "R", labelKey: "tutReload", codes: ["KeyR"] },
  { id: "switch", keycap: "1 / 2 / 3", labelKey: "tutSwitch", codes: ["Digit1", "Digit2", "Digit3"] },
  { id: "jump", keycap: "Space", labelKey: "tutJump", codes: ["Space"] },
  { id: "interact", keycap: "E", labelKey: "tutInteract", codes: [] },
  { id: "shop", keycap: "B", labelKey: "tutShop", codes: [] },
  { id: "guide", keycap: "H", labelKey: "tutGuide", codes: [] },
];

const TUTORIAL_CSS = `
.gg-tutorial {
  position: absolute;
  left: 18px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 46; /* above the HUD (≤ 7) and shop (40); below map (50) / help (60) */
  width: min(302px, calc(50vw - 40px));
  max-height: calc(100vh - 210px); /* keep clear of the bottom-left health block */
  padding: 13px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  overflow: hidden;
  background: linear-gradient(
    180deg,
    rgba(11, 17, 28, 0.92) 0%,
    rgba(6, 10, 16, 0.88) 100%
  );
  border: 1px solid rgba(51, 70, 95, 0.85);
  border-left: 3px solid var(--gg-gold, #ffd35e);
  border-radius: 10px;
  box-shadow:
    0 12px 36px rgba(0, 0, 0, 0.55),
    inset 0 0 0 1px rgba(127, 178, 255, 0.05);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  color: var(--gg-text, #dbe6f5);
  font-family: "Segoe UI", system-ui, sans-serif;
  pointer-events: none; /* informational — only the SKIP button takes clicks */
}

.gg-tutorial.hidden {
  display: none;
}

@media (prefers-reduced-motion: no-preference) {
  .gg-tutorial:not(.hidden) {
    animation: gg-tut-in 0.22s ease-out;
  }
}

@keyframes gg-tut-in {
  from {
    opacity: 0;
    transform: translate(-8px, -50%);
  }
  to {
    opacity: 1;
    transform: translate(0, -50%);
  }
}

.gg-tut-head {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.gg-tut-title {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--gg-gold, #ffd35e);
  white-space: nowrap;
}

.gg-tut-step {
  margin-left: auto;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 9.5px;
  letter-spacing: 0.06em;
  color: var(--gg-text-dim, #8fa1b8);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.gg-tut-skip {
  flex: 0 0 auto;
  pointer-events: auto; /* the one interactive child */
  appearance: none;
  padding: 2px 6px;
  font: inherit;
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--gg-text-dim, #8fa1b8);
  background: rgba(16, 26, 43, 0.85);
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}

.gg-tut-skip:hover {
  color: var(--gg-text, #dbe6f5);
  border-color: var(--gg-accent, #7fb2ff);
}

.gg-tut-skip:focus-visible {
  outline: 2px solid var(--gg-accent, #7fb2ff);
  outline-offset: 1px;
}

.gg-tut-track {
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.gg-tut-fill {
  height: 100%;
  width: 0%;
  border-radius: 2px;
  background: linear-gradient(
    90deg,
    var(--gg-accent, #7fb2ff),
    var(--gg-gold, #ffd35e)
  );
  transition: width 0.22s ease-out;
}

.gg-tut-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
  min-height: 0;
}

.gg-tut-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 23px;
  padding: 1px 0;
  opacity: 0.55;
  transition: opacity 0.12s;
}

.gg-tut-row.is-done {
  opacity: 0.38;
}

.gg-tut-row.is-active {
  opacity: 1;
}

.gg-tut-key {
  flex: 0 0 auto;
  min-width: 58px;
  padding: 2px 5px;
  text-align: center;
  background: #0b1322;
  border: 1px solid #33465f;
  border-bottom-width: 2px;
  border-radius: 4px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 9.5px;
  line-height: 1.2;
  color: #cfe0ff;
  white-space: nowrap;
}

.gg-tut-row.is-active .gg-tut-key {
  border-color: var(--gg-gold, #ffd35e);
  color: var(--gg-gold, #ffd35e);
  box-shadow: 0 0 10px rgba(255, 211, 94, 0.16);
}

.gg-tut-row.is-done .gg-tut-key {
  border-color: #24334d;
  color: #6f829b;
}

.gg-tut-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  line-height: 1.25;
  color: var(--gg-text-dim, #8fa1b8);
}

.gg-tut-row.is-active .gg-tut-label {
  font-weight: 600;
  color: var(--gg-text, #dbe6f5);
}

.gg-tut-check {
  margin-left: auto;
  width: 11px;
  text-align: center;
  font-size: 10px;
  color: var(--gg-gold, #ffd35e);
}

.gg-tut-row.is-active .gg-tut-check {
  color: var(--gg-accent, #7fb2ff);
}

.gg-tut-done {
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 0 10px;
  text-align: center;
}

.gg-tutorial.is-complete .gg-tut-done {
  display: flex;
}

.gg-tutorial.is-complete .gg-tut-list,
.gg-tutorial.is-complete .gg-tut-skip {
  display: none;
}

.gg-tutorial.is-complete .gg-tut-step {
  visibility: hidden;
}

.gg-tut-done-mark {
  font-size: 22px;
  line-height: 1;
  color: var(--gg-gold, #ffd35e);
  text-shadow: 0 0 16px rgba(255, 211, 94, 0.45);
}

.gg-tut-done-title {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--gg-gold, #ffd35e);
}

@media (max-width: 760px) {
  .gg-tutorial {
    left: 12px;
    width: min(262px, calc(50vw - 30px));
    padding: 10px 11px 9px;
    gap: 7px;
  }

  .gg-tut-key {
    min-width: 50px;
    font-size: 9px;
  }

  .gg-tut-label {
    font-size: 10.5px;
  }

  .gg-tut-row {
    min-height: 20px;
  }
}

@media (max-height: 560px) {
  .gg-tutorial {
    padding: 9px 11px 8px;
    gap: 6px;
  }

  .gg-tut-row {
    min-height: 18px;
  }

  .gg-tut-key {
    padding: 1px 4px;
    font-size: 8.5px;
  }

  .gg-tut-label {
    font-size: 10px;
  }
}
`;

// --- helpers -------------------------------------------------------------------

function make(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

function now() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function readDone() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    const raw = storage.getItem(TUTORIAL_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return !!(data && data.done === true);
  } catch {
    /* corrupt JSON / privacy mode / storage disabled — treat as first run */
    return false;
  }
}

function persistDone() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    storage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify({ done: true }));
  } catch {
    /* quota / blocked storage — the in-memory session still works */
  }
}

function injectStyles() {
  if (typeof document === "undefined") return;
  try {
    if (document.getElementById("gg-tutorial-style")) return;
    const style = document.createElement("style");
    style.id = "gg-tutorial-style";
    style.textContent = TUTORIAL_CSS;
    const head = document.head || document.body || document.documentElement;
    if (head && typeof head.appendChild === "function") head.appendChild(style);
  } catch {
    /* headless document stub — the card still builds, just unstyled */
  }
}

// --- factory -------------------------------------------------------------------

export function createTutorial(container, bus, i18n) {
  if (!container || typeof container.appendChild !== "function") {
    throw new Error("createTutorial: container (#ui) is required");
  }
  if (!bus || typeof bus.addEventListener !== "function") {
    throw new Error("createTutorial: bus is required");
  }
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(TUTORIAL_BUNDLE);
  }

  const tr = (key, params) =>
    i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;

  injectStyles();

  const total = STEPS.length;

  // --- state -------------------------------------------------------------------
  let active = false;
  let phase = "steps"; // "steps" | "complete"
  let index = 0; // 0-based current step; stays on the last step while complete
  let done = readDone();
  let autoConsumed = false; // the first "playing" after construction is used once
  let lastState = "menu";
  let shopOpen = false;
  let helpOpen = false;
  let mapOpen = false;
  let visibleNow = false;

  // Timers are measured so hiding the card pauses (not fast-forwards) them.
  let stepTimer = 0;
  let stepDeadline = 0;
  let stepRemain = STEP_MS;
  let doneTimer = 0;
  let doneDeadline = 0;
  let doneRemain = DONE_MS;

  // --- DOM ---------------------------------------------------------------------
  const root = make("div", "gg-tutorial hidden", container);
  root.setAttribute("role", "region");
  root.setAttribute("aria-hidden", "true");

  const head = make("div", "gg-tut-head", root);
  const title = make("span", "gg-tut-title", head);
  const stepLabel = make("span", "gg-tut-step", head);
  stepLabel.setAttribute("aria-live", "polite");
  const skipBtn = make("button", "gg-tut-skip", head);
  skipBtn.type = "button";
  skipBtn.tabIndex = -1; // mouse convenience only — never steals keyboard focus
  skipBtn.addEventListener("click", () => skip());

  const track = make("div", "gg-tut-track", root);
  const fill = make("div", "gg-tut-fill", track);

  const list = make("div", "gg-tut-list", root);
  list.setAttribute("role", "list");

  /** @type {{row: HTMLElement, label: HTMLElement, check: HTMLElement}[]} */
  const rows = [];
  for (let i = 0; i < total; i++) {
    const step = STEPS[i];
    const row = make("div", "gg-tut-row", list);
    row.setAttribute("role", "listitem");
    make("span", "gg-tut-key", row).textContent = step.keycap;
    const label = make("span", "gg-tut-label", row);
    label.textContent = tr(step.labelKey);
    const check = make("span", "gg-tut-check", row);
    check.setAttribute("aria-hidden", "true");
    rows.push({ row, label, check });
  }

  const doneBox = make("div", "gg-tut-done", root);
  make("span", "gg-tut-done-mark", doneBox).textContent = "✓";
  const doneTitle = make("span", "gg-tut-done-title", doneBox);

  // --- text / render -------------------------------------------------------------

  function render() {
    const complete = phase === "complete";
    root.classList.toggle("is-complete", complete);

    stepLabel.textContent = complete ? "" : tr("tutStep", { n: index + 1, total });
    const pct = complete ? 100 : Math.round((index / total) * 100);
    fill.style.width = pct + "%";

    for (let i = 0; i < total; i++) {
      const item = rows[i];
      const isDone = complete || i < index;
      const isActive = !complete && i === index;
      item.row.classList.toggle("is-done", isDone);
      item.row.classList.toggle("is-active", isActive);
      item.check.textContent = isDone ? "✓" : isActive ? "▸" : "";
    }
  }

  function applyTexts() {
    title.textContent = tr("tutTitle");
    skipBtn.textContent = tr("tutSkip");
    doneTitle.textContent = tr("tutDone");
    root.setAttribute("aria-label", tr("tutTitle"));
    for (let i = 0; i < total; i++) {
      rows[i].label.textContent = tr(STEPS[i].labelKey);
    }
    render();
  }

  // --- timers --------------------------------------------------------------------

  function stopStepTimer() {
    if (stepTimer) {
      clearTimeout(stepTimer);
      stepTimer = 0;
    }
  }

  function scheduleStep() {
    if (stepTimer || !visibleNow || !active || phase !== "steps") return;
    const delay = Math.max(0, stepRemain);
    stepDeadline = now() + delay;
    stepTimer = setTimeout(() => {
      stepTimer = 0;
      if (!visibleNow || !active || phase !== "steps") return;
      advance();
    }, delay);
  }

  function pauseStep() {
    if (!stepTimer) return;
    clearTimeout(stepTimer);
    stepTimer = 0;
    stepRemain = Math.max(0, stepDeadline - now());
  }

  function stopDoneTimer() {
    if (doneTimer) {
      clearTimeout(doneTimer);
      doneTimer = 0;
    }
  }

  function scheduleDone() {
    if (doneTimer || !visibleNow || !active || phase !== "complete") return;
    const delay = Math.max(0, doneRemain);
    doneDeadline = now() + delay;
    doneTimer = setTimeout(() => {
      doneTimer = 0;
      if (!visibleNow || !active || phase !== "complete") return;
      finish();
    }, delay);
  }

  function pauseDone() {
    if (!doneTimer) return;
    clearTimeout(doneTimer);
    doneTimer = 0;
    doneRemain = Math.max(0, doneDeadline - now());
  }

  function syncTimers() {
    if (!visibleNow) {
      pauseStep();
      pauseDone();
      return;
    }
    if (phase === "steps") scheduleStep();
    else scheduleDone();
  }

  // --- visibility ------------------------------------------------------------------

  function computeVisible() {
    return active && lastState === "playing" && !shopOpen && !helpOpen && !mapOpen;
  }

  function applyVisibility() {
    visibleNow = computeVisible();
    root.classList.toggle("hidden", !visibleNow);
    root.setAttribute("aria-hidden", visibleNow ? "false" : "true");
    syncTimers();
  }

  function refresh() {
    render();
    applyVisibility();
  }

  // --- flow ----------------------------------------------------------------------

  function finish() {
    stopStepTimer();
    stopDoneTimer();
    active = false;
    phase = "steps";
    index = 0;
    stepRemain = STEP_MS;
    doneRemain = DONE_MS;
    render(); // leave the hidden DOM on step 1, ready for the next replay
    applyVisibility();
  }

  function complete() {
    stopStepTimer();
    stopDoneTimer();
    phase = "complete";
    done = true;
    persistDone();
    doneRemain = DONE_MS;
    refresh();
  }

  function advance() {
    if (!active || phase !== "steps") return;
    stopStepTimer();
    if (index >= total - 1) {
      complete();
      return;
    }
    index += 1;
    stepRemain = STEP_MS;
    refresh();
  }

  /** Advance only when `id` is the current step (keeps events order-proof). */
  function hitStep(id, requirePlaying) {
    if (!active || phase !== "steps") return false;
    if (STEPS[index].id !== id) return false;
    if (requirePlaying) {
      if (lastState !== "playing") return false;
      // A reference overlay owns input while it is up — do not advance an
      // invisible tutorial from keys pressed inside it.
      if (helpOpen || mapOpen || shopOpen) return false;
    }
    advance();
    return true;
  }

  function start() {
    stopStepTimer();
    stopDoneTimer();
    active = true;
    phase = "steps";
    index = 0;
    stepRemain = STEP_MS;
    doneRemain = DONE_MS;
    done = false; // replay is allowed; storage is rewritten only on finish/skip
    autoConsumed = true;
    refresh();
  }

  function skip() {
    if (!active) return;
    stopStepTimer();
    stopDoneTimer();
    active = false;
    phase = "steps";
    index = 0;
    stepRemain = STEP_MS;
    doneRemain = DONE_MS;
    done = true;
    persistDone(); // a deliberate skip is still "seen it" — never force it again
    render();
    applyVisibility();
  }

  // --- input observation (never consumes the event) -------------------------------

  function onKeydown(e) {
    if (!e || e.repeat || !visibleNow || !active || phase !== "steps") return;
    const step = STEPS[index];
    if (step.codes.length === 0) return;
    if (step.codes.indexOf(e.code) !== -1) advance();
  }

  function onMouseDown(e) {
    if (!e || e.button !== 0) return;
    if (!visibleNow || !active || phase !== "steps") return;
    if (STEPS[index].id !== "fire") return;
    let locked = false;
    try {
      locked = typeof document !== "undefined" && !!document.pointerLockElement;
    } catch {
      locked = false;
    }
    if (locked) advance();
  }

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("keydown", onKeydown);
  }
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("mousedown", onMouseDown);
  }

  // --- bus wiring -----------------------------------------------------------------

  bus.addEventListener("tutorial-start", start);

  bus.addEventListener("state-changed", (e) => {
    const state = e && e.detail ? e.detail.state : null;
    if (!state) return;
    lastState = state;
    if (state === "menu") {
      // Safety: overlays can never leak across runs (same rule as input.js).
      shopOpen = false;
      helpOpen = false;
      mapOpen = false;
    }
    if (state === "playing" && !autoConsumed) {
      autoConsumed = true;
      if (!done) {
        start();
        return;
      }
    }
    applyVisibility();
  });

  bus.addEventListener("fire", () => {
    hitStep("fire", true);
  });

  bus.addEventListener("interact-press", () => {
    hitStep("interact", true);
  });

  // shop-toggle / shop-open can arrive after gamestate already flipped to
  // "paused" (listener order), so these do not require the playing state.
  bus.addEventListener("shop-toggle", () => {
    hitStep("shop", false);
  });

  bus.addEventListener("shop-open", () => {
    shopOpen = true;
    hitStep("shop", false);
    applyVisibility();
  });

  bus.addEventListener("shop-closed", () => {
    shopOpen = false;
    applyVisibility();
  });

  bus.addEventListener("help-open", () => {
    // Opening the guide IS the last step, so advance BEFORE setting the flag
    // (hitStep ignores triggers while an overlay is up).
    hitStep("guide", true);
    helpOpen = true;
    applyVisibility();
  });

  bus.addEventListener("help-closed", () => {
    helpOpen = false;
    applyVisibility();
  });

  bus.addEventListener("map-visibility", (e) => {
    const open = e && e.detail ? e.detail.open : false;
    mapOpen = open === true;
    applyVisibility();
  });

  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail && e.detail.patch ? e.detail.patch : null;
    if (patch && patch.lang) applyTexts();
  });

  // --- init ------------------------------------------------------------------------

  applyTexts();
  applyVisibility();

  return {
    start,
    skip,
    isActive: () => active,
    stepIndex: () => (active ? index : -1),
  };
}
