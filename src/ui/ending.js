/**
 * ============================================================================
 * ENDING — MÀN KẾT "GIẢI CỨU — NGÀY 31" + NEW GAME+ — "ĐÊM THỨ 30 · Phần 3".
 * Hợp đồng: docs/EXPANSION-P3.md §4 (spec nguyên văn §4.0; state machine §4.2;
 * stats §4.3; nút → bus §4.4; key i18n EN/VI nguyên văn §7.4).
 * ============================================================================
 * Nghe "origin-defeated" (bất kể payload, kể cả {debug:true} của
 * skipToEnding) → chuỗi kết:
 *
 *   IDLE → 1. APPROACH (2.0 s): phát "ending-active" {active:true} (gamestate
 *              pause reason "ending" — P3-K10); audio.chopperSynth("start")
 *              (rotor tới dần); camera FOV baseFov → 55 ease (baseFov chụp
 *              từ camera lúc bắt đầu chuỗi — KHÔNG đụng renderer/scene).
 *          2. FADE (2.0 s): overlay trắng opacity 0 → 1 (CSS transition 2 s);
 *              audio.victorySting() ở ĐẦU phase; chopper nền ×0.4
 *              (chopperSynth("duck") — builder choice, §4.6 chỉ freeze
 *              start/stop nhưng §4.2 FADE đòi "nền nhỏ dần"; cùng builder
 *              sở hữu cả hai đầu API nên additive mode không phá hợp đồng).
 *          3. SCREEN (chờ nút): panel — kicker + ending_title + 5 hàng stats
 *              (gamestate.runStats() — P3-K11: timeSec mm:ss / kills / money
 *              earned / deaths / bossesKilled) + ending_line + 3 nút.
 *              Chopper giữ nền nhẹ. Text render qua i18n.t() TẠI lúc vào
 *              SCREEN (§4.2 — không cần rebind khi đổi ngôn ngữ giữa chừng).
 *          4. Mọi nút → PHÁT bus TRƯỚC, rồi hide() (§4.4):
 *              "CHƠI TIẾP — THẾ GIỚI MỞ" → "ui-continue"  (main: lockPointer)
 *              "NEW GAME+"              → "ui-ngplus"     (main: beginNGPlus)
 *              "VỀ MENU"                → "ui-quit"       (đường hiện có)
 *
 *    hide(): chopperSynth("stop") + FOV restore baseFov + phát
 *    "ending-active" {active:false} + gỡ overlay; idempotent; reset cờ
 *    `active` (chuỗi có thể chạy lại ở run sau / NG+).
 *
 * Nút PHÁT TRƯỚC rồi mới hide() (stub contract + thứ tự an toàn đã kiểm: với
 * "ui-quit" main chạy freshRun()+toMenu() trước — clearPauses() của toMenu
 * làm removePause("ending") trong hide() thành no-op, không phát "playing"
 * thoáng qua; với "ui-ngplus" beginNGPlus() gọi ending.hide() nội bộ — hide()
 * ở đây là no-op lặp, idempotent đúng hợp đồng).
 *
 * update(dt): main gọi MỖI FRAME Ở MỌI STATE (ngoài các nhánh state của
 * frame(), trước engine.render()) — chuỗi kết diễn ra DƯỚI pause reason
 * "ending" nên không được treo update vào nhánh "playing". Idle → no-op rẻ.
 *
 * DOM: container là #ui với `pointer-events: none` — overlay trắng KHÔNG bắt
 * sự kiện; panel kết BẬT `pointer-events: auto` trên chính nó (pattern
 * menus.js:1-4). Self-styled inline (style.css ngoài danh sách file được sửa
 * — pattern dialogue.js/hud.js). z-index 40/41 nằm trên mọi tầng style.css
 * (tối đa 5). Con trỏ: "ending-active" → state "paused" → input.js tự nhả
 * pointer lock cho panel (input.js "state-changed" ≠ playing → release).
 *
 * i18n keys owned by THIS module (registerBundle, EN + VI nguyên văn
 * docs/EXPANSION-P3.md §7.4): ending_title, ending_line, ending_btn_continue,
 * ending_btn_ngplus, ending_btn_menu, ending_stat_time, ending_stat_kills,
 * ending_stat_money, ending_stat_deaths, ending_stat_bosses. Kicker "NIGHT 30"
 * là brand text language-neutral (precedent menus.js: "ZOMBIE SURVIVAL FPS").
 *
 * Bus events consumed: "origin-defeated". Bus events emitted:
 * "ending-active" {active}, "ui-continue", "ui-ngplus", "ui-quit".
 *
 * @param {HTMLElement} container - the #ui element (pointer-events: none —
 *   panel phải tự bật pointer-events: auto; overlay trắng thì không).
 * @param {EventTarget} bus - shared bus (src/systems/gamestate.js).
 * @param {import("../systems/gamestate.js").Gamestate} gamestate - nguồn stats
 *   (runStats(), kills) — KHÔNG tự pause; pause đi qua "ending-active".
 * @param {import("../core/audio.js").Audio} audio - chopperSynth/victorySting
 *   (audio.js là synth thuần WebAudio — P3 §4.6).
 * @param {{t: Function, registerBundle: Function, getLang: Function}} i18n -
 *   module namespace src/core/i18n.js.
 * @param {import("three").PerspectiveCamera} camera - slow-zoom FOV base → 55
 *   (restore trong hide(); KHÔNG đụng renderer/scene).
 * @returns {Ending}
 */

/**
 * @typedef {Object} Ending
 * @property {(dt: number) => void} update - main gọi MỖI FRAME, mọi state
 *   (self-guard khi idle; chạy cả khi paused — chuỗi kết dưới pause "ending").
 * @property {() => void} hide - dọn overlay + chopper + FOV + "ending-active"
 *   {active:false}; idempotent; reset cờ started.
 * @property {() => boolean} isActive - true khi chuỗi đang chạy (APPROACH/
 *   FADE/SCREEN) hoặc panel đang mở.
 */

// --- thời gian chuỗi (số FROZEN — docs/EXPANSION-P3.md §4.2) ------------------

export const APPROACH_TIME = 2.0; // s slow-zoom + chopper tới dần
export const FADE_TIME = 2.0; // s fade trắng
export const ZOOM_FOV = 55; // FOV đích (baseFov chụp từ camera lúc bắt đầu)

// White fade-out sau khi rời màn (builder choice — cùng bậc FADE_MS 420 ms
// của dialogue.js; quá gắt nếu cắt trắng→thế giới tức thời). display:none sau.
const WHITE_OUT_MS = 400;

// Kicker trên tiêu đề — brand text, language-neutral (precedent menus.js).
const KICKER_TEXT = "NIGHT 30";

const ENDING_BUNDLE = {
  en: {
    ending_title: "RESCUE — DAY 31",
    ending_line: "The city still wakes. And you are still here.",
    ending_btn_continue: "KEEP PLAYING — OPEN WORLD",
    ending_btn_ngplus: "NEW GAME+",
    ending_btn_menu: "MAIN MENU",
    ending_stat_time: "Time",
    ending_stat_kills: "Kills",
    ending_stat_money: "Money earned",
    ending_stat_deaths: "Deaths",
    ending_stat_bosses: "Bosses down",
  },
  vi: {
    ending_title: "GIẢI CỨU — NGÀY 31",
    ending_line: "Thành phố vẫn thức giấc. Và bạn vẫn ở đây.",
    ending_btn_continue: "CHƠI TIẾP — THẾ GIỚI MỞ",
    ending_btn_ngplus: "NEW GAME+",
    ending_btn_menu: "VỀ MENU",
    ending_stat_time: "Thời gian",
    ending_stat_kills: "Số kill",
    ending_stat_money: "Tổng tiền kiếm được",
    ending_stat_deaths: "Số lần chết",
    ending_stat_bosses: "Boss đã hạ",
  },
};

/** Small inline-style helper (style.css is outside the editable file list). */
function style(node, css) {
  for (const k in css) node.style[k] = css[k];
  return node;
}

function el(tag, css, parent) {
  const node = document.createElement(tag);
  style(node, css);
  if (parent) parent.appendChild(node);
  return node;
}

/**
 * Factory màn kết (docs/EXPANSION-P3.md §4 — chữ ký frozen).
 *
 * @param {HTMLElement} container
 * @param {EventTarget} bus
 * @param {import("../systems/gamestate.js").Gamestate} gamestate
 * @param {import("../core/audio.js").Audio} audio
 * @param {{t: Function, registerBundle: Function, getLang: Function}} i18n
 * @param {import("three").PerspectiveCamera} camera
 * @returns {Ending}
 */
export function createEnding(
  container,
  bus,
  gamestate,
  audio,
  i18n,
  camera,
  getBaseFov
) {
  if (!container || typeof container.appendChild !== "function") {
    throw new Error("createEnding: container (#ui) is required");
  }
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(ENDING_BUNDLE);
  }
  const tr = (key) => (i18n && typeof i18n.t === "function" ? i18n.t(key) : key);
  const B = bus || new EventTarget();
  const emit = (name, detail) =>
    B.dispatchEvent(new CustomEvent(name, { detail }));

  // --- DOM (built once; hidden until the sequence needs it) -------------------
  // White fade overlay — full screen, NO pointer events (contract §4.1).
  const white = el(
    "div",
    {
      position: "fixed",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      background: "#ffffff",
      opacity: "0",
      pointerEvents: "none",
      zIndex: "40",
      transition: "opacity 2s linear",
      display: "none",
    },
    container
  );

  // Stats panel — interactive (pointer-events: auto on ITSELF).
  const panel = el(
    "div",
    {
      position: "fixed",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      display: "none",
      flexDirection: "column",
      alignItems: "center",
      gap: "6px",
      padding: "34px 46px 30px",
      background: "rgba(9, 11, 14, 0.94)",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "10px",
      color: "#e8e6e0",
      pointerEvents: "auto",
      zIndex: "41",
      textAlign: "center",
      maxWidth: "92vw",
      boxSizing: "border-box",
    },
    container
  );

  const kicker = el(
    "div",
    {
      fontSize: "11px",
      letterSpacing: "4px",
      color: "#9aa3ad",
      textTransform: "uppercase",
    },
    panel
  );
  const title = el("h2", {
    margin: "4px 0 14px",
    fontSize: "30px",
    letterSpacing: "2px",
    color: "#ffffff",
    fontWeight: "700",
  }, panel);

  const statsBox = el("div", {
    display: "flex",
    flexDirection: "column",
    width: "330px",
    maxWidth: "80vw",
    marginBottom: "6px",
  }, panel);

  /** @type {{label: HTMLElement, value: HTMLElement, key: string}[]} */
  const statRows = [];
  for (const key of [
    "ending_stat_time",
    "ending_stat_kills",
    "ending_stat_money",
    "ending_stat_deaths",
    "ending_stat_bosses",
  ]) {
    const row = el("div", {
      display: "flex",
      justifyContent: "space-between",
      gap: "34px",
      padding: "5px 2px",
      borderBottom: "1px solid rgba(255,255,255,0.09)",
      fontSize: "14px",
    }, statsBox);
    const label = el("span", { color: "#9aa3ad" }, row);
    const value = el("span", { color: "#ffffff", fontWeight: "700" }, row);
    statRows.push({ label, value, key });
  }

  const line = el("p", {
    margin: "14px 0 16px",
    fontStyle: "italic",
    fontSize: "14px",
    color: "#b9c2cc",
  }, panel);

  const nav = el("div", {
    display: "flex",
    flexDirection: "column",
    gap: "9px",
    width: "100%",
  }, panel);

  /** @type {HTMLButtonElement[]} filled by endButton — fillScreen() re-renders */
  const buttons = [];

  /** One ending button: emits `evt` FIRST, then hide() (§4.4 — see header). */
  function endButton(key, evt, primary) {
    const b = /** @type {HTMLButtonElement} */ (
      el(
        "button",
        {
          padding: "11px 18px",
          fontSize: "13px",
          letterSpacing: "1.5px",
          cursor: "pointer",
          borderRadius: "6px",
          border: "1px solid rgba(255,255,255,0.2)",
          color: primary ? "#14100a" : "#e8e6e0",
          background: primary ? "#e8b64c" : "rgba(255,255,255,0.07)",
          fontWeight: primary ? "700" : "500",
        },
        nav
      )
    );
    b.type = "button";
    b.addEventListener("click", () => {
      emit(evt);
      hide();
    });
    b.dataset.i18n = key;
    buttons.push(b);
    return b;
  }
  endButton("ending_btn_continue", "ui-continue", true);
  endButton("ending_btn_ngplus", "ui-ngplus", false);
  endButton("ending_btn_menu", "ui-quit", false);

  // --- state machine (§4.2) ----------------------------------------------------
  let active = false; // sequence running (APPROACH/FADE/SCREEN) — cờ `started`
  let phase = "idle"; // "approach" | "fade" | "screen"
  let phaseT = 0; // seconds inside the current phase
  let baseFov = 75; // captured from the camera at sequence start (§4.1)
  let whiteTimer = 0; // pending white fade-out timeout (hide() housekeeping)

  /** "origin-defeated" → bắt đầu chuỗi. Payload bị bỏ qua (kể cả debug). */
  function onDefeated() {
    if (active) return; // mỗi "origin-defeated" chỉ bắt đầu 1 lần (§4.2)
    active = true;
    phase = "approach";
    phaseT = 0;
    // ADS (main.js updateAds): camera.fov is ZOOMED when the killing shot is
    // scoped — prefer the settings base FOV via the getter main passes.
    const gf = typeof getBaseFov === "function" ? getBaseFov() : NaN;
    baseFov =
      Number.isFinite(gf) && gf > 0
        ? gf
        : camera && Number.isFinite(camera.fov) && camera.fov > 0
          ? camera.fov
          : 75;
    if (whiteTimer !== 0) {
      clearTimeout(whiteTimer);
      whiteTimer = 0;
    }
    white.style.transition = "opacity 2s linear";
    white.style.display = "block";
    white.style.opacity = "0";
    panel.style.display = "none";
    emit("ending-active", { active: true }); // gamestate: addPause("ending")
    if (audio && typeof audio.chopperSynth === "function") {
      audio.chopperSynth("start"); // rotor tới dần (gain 0 → 0.22 / 2 s)
    }
  }
  B.addEventListener("origin-defeated", onDefeated);

  /** Fill panel text + stats — i18n.t() resolved AT SCREEN ENTRY (§4.2). */
  function fillScreen() {
    kicker.textContent = KICKER_TEXT;
    title.textContent = tr("ending_title");
    line.textContent = tr("ending_line");
    for (const row of statRows) {
      row.label.textContent = tr(row.key);
    }
    for (const b of buttons) b.textContent = tr(b.dataset.i18n || "");
    // Stats (P3-K11 + §4.3): kills mirror gamestate.kills; the rest runStats().
    const st =
      gamestate && typeof gamestate.runStats === "function"
        ? gamestate.runStats()
        : { timeSec: 0, moneyEarned: 0, deaths: 0, bossesKilled: 0 };
    const kills = gamestate ? Number(gamestate.kills) || 0 : 0;
    const secs = Math.max(0, Math.floor(Number(st.timeSec) || 0));
    const mm = String(Math.floor(secs / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    const fmtInt = (n) => String(Math.max(0, Math.round(Number(n) || 0)));
    const values = [
      mm + ":" + ss,
      fmtInt(kills),
      fmtInt(st.moneyEarned) + "$",
      fmtInt(st.deaths),
      fmtInt(st.bossesKilled),
    ];
    for (let i = 0; i < statRows.length && i < values.length; i++) {
      statRows[i].value.textContent = values[i];
    }
  }

  /**
   * Per-frame driver (main calls it in EVERY state). Cheap no-op while idle;
   * during APPROACH/FADE it only assigns camera.fov + flips phase — no
   * allocation in the per-frame path (P3 §1 budget).
   * @param {number} dt - seconds since the previous frame.
   * @returns {void}
   */
  function update(dt) {
    if (!active || phase === "screen") return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    phaseT += dt;
    if (phase === "approach") {
      const t = Math.min(1, phaseT / APPROACH_TIME);
      const e = t * t * (3 - 2 * t); // smoothstep ease
      if (camera && Number.isFinite(camera.fov)) {
        camera.fov = baseFov + (ZOOM_FOV - baseFov) * e;
        if (typeof camera.updateProjectionMatrix === "function") {
          camera.updateProjectionMatrix();
        }
      }
      if (phaseT >= APPROACH_TIME) {
        phase = "fade";
        phaseT = 0;
        // FADE entry (§4.2): victorySting ĐẦU phase + chopper nền ×0.4.
        if (audio && typeof audio.victorySting === "function") {
          audio.victorySting();
        }
        if (audio && typeof audio.chopperSynth === "function") {
          audio.chopperSynth("duck");
        }
        white.style.opacity = "1"; // CSS transition 2s carries the fade
      }
    } else if (phase === "fade") {
      if (phaseT >= FADE_TIME) {
        phase = "screen";
        fillScreen(); // stats + i18n text at SCREEN entry
        panel.style.display = "flex";
      }
    }
  }

  /**
   * Leave the sequence: stop the chopper, restore the FOV, drop both
   * overlays, emit "ending-active" {active:false}. Idempotent — extra calls
   * (main's freshRun / beginNGPlus call hide() themselves) are no-ops.
   * @returns {void}
   */
  function hide() {
    if (!active) return; // idempotent (§4.1)
    active = false;
    phase = "idle";
    phaseT = 0;
    if (audio && typeof audio.chopperSynth === "function") {
      audio.chopperSynth("stop"); // gain → 0 / 0.8 s rồi gỡ node (§4.6)
    }
    if (camera && Number.isFinite(camera.fov)) {
      camera.fov = baseFov; // §4.2: FOV restore
      if (typeof camera.updateProjectionMatrix === "function") {
        camera.updateProjectionMatrix();
      }
    }
    panel.style.display = "none";
    // White: quick reveal-fade out, then fully removed for the next run.
    white.style.transition = "opacity " + WHITE_OUT_MS + "ms linear";
    white.style.opacity = "0";
    if (whiteTimer !== 0) clearTimeout(whiteTimer);
    whiteTimer = setTimeout(() => {
      whiteTimer = 0;
      white.style.display = "none";
      white.style.transition = "opacity 2s linear"; // restore for the next run
    }, WHITE_OUT_MS + 50);
    emit("ending-active", { active: false }); // gamestate: removePause("ending")
  }

  /** True while the sequence runs (APPROACH/FADE/SCREEN) or the panel shows. */
  function isActive() {
    return active;
  }

  return { update, hide, isActive };
}
