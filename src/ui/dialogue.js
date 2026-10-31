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
 * showIntro(slides, onDone): the New Game slides — white text on black,
 * fading, ONE slide at a time, world rendering dimmed behind them (the
 * slide backdrop is ~0.85 opaque black; the renderer is not touched). Runs
 * while gamestate is "intro" (docs/EXPANSION-P1.md §5.6.1). Skip = next
 * slide; after the last slide → onDone(). Slides WAIT for input (no
 * auto-advance — the gamestate stays "intro" until the player finishes);
 * each slide shows a language-neutral "E ▸" hint at the bottom. Free-roam
 * mode skips the slides entirely (main.js decides — dialogue only renders
 * what it is given).
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
 * speaker_you, speaker_unknown, intro_s1..intro_s4, story_outro_line1..3.
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

const DIALOGUE_BUNDLE = {
  en: {
    speaker_radio: "RADIO",
    speaker_you: "YOU",
    speaker_unknown: "UNKNOWN",
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

  // Intro slides — full-screen dim backdrop over the rendered world.
  const slide = make("div", "dlg-slide", container);
  css(slide, {
    position: "absolute",
    inset: "0",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.85)",
    zIndex: "30",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity " + FADE_MS + "ms ease",
  });
  const slideText = make("div", "dlg-slide-text", slide);
  css(slideText, {
    maxWidth: "580px",
    padding: "0 24px",
    textAlign: "center",
    fontSize: "17px",
    lineHeight: "1.75",
    color: "#e8edf5",
    textShadow: "0 1px 6px rgba(0, 0, 0, 0.9)",
  });
  const slideHint = make("div", "dlg-slide-hint", slide);
  css(slideHint, {
    position: "absolute",
    bottom: "26px",
    left: "0",
    right: "0",
    textAlign: "center",
    fontSize: "12px",
    letterSpacing: "0.3em",
    color: "rgba(219, 230, 245, 0.4)",
  });
  slideHint.textContent = "E · ▸"; // language-neutral glyphs — no i18n key

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

  function renderSlide(i) {
    idx = i;
    slideText.textContent = itemText(seq[i]);
  }

  function fadeToSlide(i) {
    busy = true;
    slide.style.opacity = "0";
    fadeTimer = setTimeout(() => {
      fadeTimer = 0;
      busy = false;
      if (mode !== "intro") return;
      renderSlide(i);
      slide.style.opacity = "1";
    }, FADE_MS);
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
      slideText.textContent = itemText(seq[idx]);
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
      slide.style.display = "none";
      slide.style.opacity = "0";
      outro.style.display = "none";
      outro.style.opacity = "0";
      outroText.style.opacity = "0";
    },

    /** @type {Dialogue["showIntro"]} */
    showIntro(slides, onDone) {
      const items = Array.isArray(slides) ? slides.slice() : [];
      begin("intro", items, onDone);
      if (!items.length) {
        finish();
        return;
      }
      slide.style.display = "flex";
      renderSlide(0);
      busy = true; // the fade-in window swallows skips (advance() no-ops)
      // Fade in on the next frame so the transition replays from display:none.
      requestAnimationFrame(() => {
        if (mode !== "intro") return;
        slide.style.opacity = "1";
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
