/**
 * Field guide overlay — the in-game reference sheet inside #ui.
 *
 * createHelp(uiRoot, bus, i18n) → { show, toggle, isOpen, openTab, codexState }
 *
 * Three tabs under the title (real buttons, role="tab", aria-selected, gold
 * underline on the active one; ArrowLeft/Right/Home/End move focus):
 *
 * - CONTROLS — the original binding sheet: MOVEMENT / COMBAT / WORLD / TIPS.
 *   The weapon-switch chip reads "1-9 / 0 / - / =" because the arsenal now has
 *   twelve slots, and a tip points at H for this guide. The merchant rows
 *   cover G (trade at the Trader), F (throw bomb) and V (switch bomb).
 * - ZOMBIES — bestiary, one card per type (6 regular + 5 bosses = 11):
 *   colored CSS portrait/initials, REGULAR/BOSS badge, real HP/SPEED/DAMAGE/
 *   SCORE numbers, spawn wave, a TRAIT line and a COUNTER line. Boss cards
 *   omit SCORE and show the wave-scaling note instead; the Origin shows its
 *   three phases and the final-battle note. Stats mirror src/zombies/zombie.js
 *   and src/zombies/bosses.js / origin.js. A compact ELITE VARIANTS section
 *   (4 mini cards: name, colour dot, stat changes, bonus) closes the tab.
 * - DOSSIER — 10 characters, each with a public file and a hidden file
 *   (secret). Locked entries are dark cards with "???" and a concrete unlock
 *   hint. Unlocked entries show a colored portrait circle with initials, role
 *   and a 2-3 sentence bio. The HIDDEN FILE block is gold when unlocked and
 *   "🔒 HIDDEN FILE" + hint when locked.
 *
 * Codex persistence (meta progression, never reset by a new run):
 *   localStorage key "gungame.codex.v1"
 *   { chars: {id: true}, secrets: {id: true} }
 *   and a counter sidecar "gungame.codex.progress.v1"
 *   { survivors: number, bossKinds: {butcher: true, …} }
 * Both load defensively (missing/corrupt/blocked storage → empty state, no
 * throw). The sidecar is what lets the cumulative triggers (3 survivors, all
 * four boss types) survive a reload; the public codex key keeps its exact
 * frozen shape.
 *
 * Unlock triggers (public / secret):
 *   guide    mission-start 1        / mission-complete 5
 *   whisper  mission-start 3        / mission-start 7
 *   eli      mission-complete 1     / mission-complete 6
 *   mai      first survivor-rescued / 3 survivor-rescued total
 *   linh     mission-complete 4     / mission-complete 8
 *   river    mission-complete 6     / mission-complete 9
 *   vu       any boss zombie-killed / all 4 regular boss types killed
 *   warden   mission-complete 8     / mission-start 10
 *   kane     zombie-killed butcher  / all 4 regular boss types killed
 *   origin   mission-start 10       / origin-defeated
 * Every NEW unlock dispatches "codex-unlocked" {id, secret, nameKey, text};
 * repeats are silent. `text` is the localized toast body for hud.js.
 *
 * Bus events:
 * - consumes "help-toggle" (input.js H key), "help-open" (menus CONTROLS),
 *   "codex-open" (menus DOSSIER), "state-changed" {state},
 *   "settings-changed" {patch:{lang}}, plus the story events above.
 * - emits "help-open" / "help-closed" (input.js pointer-lock coordination)
 *   and "codex-unlocked" (hud toast).
 *
 * Lifecycle / pointer lock (unchanged shared contract with src/core/input.js):
 * - Open: emit "help-open" FIRST, then document.exitPointerLock() so the
 *   cursor is free for the close/tab buttons. input.js tracks the flag and
 *   skips the "pause-toggle" it would normally emit from pointerlockchange —
 *   a reference must NOT pause the game (zombies keep coming).
 * - Close: hide + emit "help-closed". NO requestPointerLock here: input.js
 *   re-locks on the player's next canvas click (or Esc/P resumes normally).
 * - H and Escape close. H is forwarded by input.js as "help-toggle"; Escape
 *   is intercepted here on the CAPTURE phase (like shop.js) so input.js's
 *   Esc/P pause path never sees that press while the sheet is up.
 * - The overlay is modal for CLICKS: it covers #ui with pointer-events auto.
 * - "state-changed" to a DIFFERENT state hides it silently; a same-state
 *   re-emit leaves the sheet open.
 * - Opening from the main/pause menus is a pure overlay (no state change).
 *
 * i18n: registers its OWN bundle (HELP_BUNDLE) via i18n.registerBundle — every
 * visible string except keycap glyphs and the initials goes through i18n.t().
 * A live language switch re-renders static labels and rebuilds both card
 * grids in place. No per-frame work: everything is event-driven.
 *
 * Styles are self-contained (injected once, id "gg-help-style") and reuse the
 * #ui theme custom properties (--gg-*) with fallbacks. No external assets.
 */

export const CODEX_STORAGE_KEY = "gungame.codex.v1";
// Counter sidecar for the cumulative triggers (3 survivors, all four bosses),
// kept OUT of the public codex key so that key stays exactly {chars, secrets}.
export const CODEX_PROGRESS_KEY = "gungame.codex.progress.v1";

const HELP_BUNDLE = {
  en: {
    // --- tabs + shared chrome -------------------------------------------------
    helpTitle: "CONTROLS",
    helpTitleZombies: "BESTIARY",
    helpTitleDossier: "DOSSIER",
    helpTabControls: "CONTROLS",
    helpTabZombies: "ZOMBIES",
    helpTabDossier: "DOSSIER",
    helpTabsAria: "Guide sections",
    helpClose: "Close",
    helpCloseHint: "H / ESC — close",
    // --- controls tab (original content) -------------------------------------
    helpSecMovement: "MOVEMENT",
    helpSecCombat: "COMBAT",
    helpSecWorld: "WORLD",
    helpSecTips: "TIPS",
    helpMove: "Move",
    helpSprint: "Sprint",
    helpJump: "Jump",
    helpAim: "Aim",
    helpFire: "Fire",
    helpReload: "Reload",
    helpSwitch: "Switch weapon",
    helpThrowBomb: "Throw bomb",
    helpSwitchBomb: "Switch bomb",
    helpInteract: "Interact",
    helpShop: "Shop",
    helpTrade: "Trade at the Trader",
    helpContracts: "Contract board",
    helpMap: "Map",
    helpHelp: "Controls / help",
    helpPause: "Pause",
    helpTipHeadshot: "Headshots deal extra damage.",
    helpTipAutoReload: "Auto-reload triggers when a magazine empties.",
    helpTipShop: "Buy and upgrade weapons in the shop with B.",
    helpTipTrader: "The Trader at the Safehouse sells exclusive guns, bombs and armor.",
    helpTipContracts: "Contracts at the Safehouse board pay cash and XP for side objectives.",
    helpTipSurvive: "Survive waves and complete missions.",
    helpTipGuide: "H opens this guide anywhere.",
    // --- bestiary tab ---------------------------------------------------------
    zIntro: "Six types walk the streets. Five guard the dark.",
    zBadgeRegular: "REGULAR",
    zBadgeBoss: "BOSS",
    zStatHp: "HP",
    zStatSpeed: "SPEED",
    zStatDamage: "DAMAGE",
    zStatScore: "SCORE",
    zStatPhases: "PHASES",
    zTraitLabel: "TRAIT",
    zCounterLabel: "COUNTER",
    zScaleBoss: "HP scales with the wave: base × (1 + wave/20).",
    zScaleOrigin: "Final battle — no wave scaling. Phases change at 66% and 33% HP.",
    zName_walker: "Walker",
    zName_runner: "Runner",
    zName_brute: "Brute",
    zName_crawler: "Crawler",
    zName_bloater: "Bloater",
    zName_armored: "Armored",
    zName_butcher: "The Butcher",
    zName_spitter: "The Spitter",
    zName_screamer: "The Screamer",
    zName_golem: "The Golem",
    zName_origin: "The Origin",
    zAppear_walker: "Wave 1+",
    zAppear_runner: "Wave 2+",
    zAppear_brute: "Wave 4+",
    zAppear_crawler: "Wave 3+",
    zAppear_bloater: "Wave 6+",
    zAppear_armored: "Wave 9+ · 6+ Endless",
    zAppear_butcher: "Wave 5 · boss cycle",
    zAppear_spitter: "Wave 10 · boss cycle",
    zAppear_screamer: "Wave 15 · boss cycle",
    zAppear_golem: "Wave 20 · boss cycle",
    zAppear_origin: "Mission 10 · final",
    // --- elite variants (compact section after the 11 cards) ------------------
    zEliteTitle: "ELITE VARIANTS",
    zEliteIntro: "Any regular zombie can mutate. Never a boss; at most a quarter of a wave.",
    eliteTag: "ELITE",
    eliteFrenzied: "Frenzied",
    eliteIronhide: "Ironhide",
    eliteToxic: "Toxic",
    eliteGiant: "Giant",
    zEliteStat_frenzied: "SPD ×1.45 · DMG ×1.15 · HP ×0.9 · SIZE ×1.08",
    zEliteBonus_frenzied: "Money ×1.6 · Score ×1.3",
    zEliteStat_ironhide: "HP ×2.2 · DMG ×1.1 · SPD ×0.92 · SIZE ×1.12 · BODY −20%",
    zEliteBonus_ironhide: "Money ×1.8 · Score ×1.5",
    zEliteStat_toxic: "HP ×1.3 · SPD ×1.05 · DMG ×1.1 · DEATH 15 / 2.5 m",
    zEliteBonus_toxic: "Money ×1.5 · Score ×1.35",
    zEliteStat_giant: "SIZE ×1.45 · HP ×1.8 · DMG ×1.35 · SPD ×0.9",
    zEliteBonus_giant: "Money ×2.0 · Score ×1.6",
    zTrait_walker: "Slow and relentless; it never stops walking and closes in from every alley.",
    zCounter_walker: "Aim for the head — headshots double your damage and cut the kill in half.",
    zTrait_runner: "Sprints in short bursts and reaches you before the rifle settles.",
    zCounter_runner: "Keep your distance; a shotgun or SMG at close range ends it fast.",
    zTrait_brute: "A wall of muscle that shrugs off body shots and keeps coming.",
    zCounter_brute: "Bring a shotgun or sniper; body shots are a waste of ammo.",
    zTrait_crawler: "The fastest thing in the city, crawling under your line of fire.",
    zCounter_crawler: "Use spread or automatic fire; headshots are almost impossible while it scuttles.",
    zTrait_bloater: "A swollen carrier; its sack ruptures on death and douses everything nearby.",
    zCounter_bloater: "Kill it from range — the burst deals 25 damage inside 4 m and leaves a green ring.",
    zTrait_armored: "Riot plating turns aside body shots; only the exposed head is honest.",
    zCounter_armored: "Headshots bypass the armor; body hits lose 35% damage.",
    zTrait_butcher: "Winds up for 0.8 s with a red glow, then charges in a straight line with a cleaver.",
    zCounter_butcher: "Sidestep the charge; it cannot turn once locked and needs a moment to recover.",
    zTrait_spitter: "Keeps 10–16 m and lobs acid arcs that leave a 4 s pool on the ground.",
    zCounter_spitter: "Strafe the arc and close the gap; inside 10 m it backs away while still spitting.",
    zTrait_screamer: "Its shriek knocks you back 4 m and calls 3 more zombies out of the dark.",
    zCounter_screamer: "Stay beyond 8 m — walls do not stop the shriek — and kill the three summons before they box you in.",
    zTrait_golem: "Stone hide absorbs 25% of all damage; its slam sweeps an 8 m ring.",
    zCounter_golem: "Back off as the orange ring expands, then punish the recovery; aim for the head.",
    zTrait_origin: "Three phases: ground slam and summons, then acid rain and a charge, then enrage and shockwaves.",
    zCounter_origin: "In phase 3 keep 7–12 m, watch the 6 m shockwave, and never stand in acid.",
    // --- dossier tab ----------------------------------------------------------
    dossierIntro: "Ten people shaped this outbreak. Their files unlock as you play.",
    codexProgress: "{n}/{total} files · {s}/{total} hidden",
    codexLocked: "LOCKED",
    codexHiddenFile: "HIDDEN FILE",
    codexLockedHint: "Unlock: {hint}",
    codexHintStoryStart: "Start the story",
    codexHintMissionStart: "Reach mission {n}",
    codexHintMissionDone: "Complete mission {n}",
    codexHintSurvivor: "Rescue a survivor",
    codexHintSurvivors: "Rescue {n} survivors",
    codexHintAnyBoss: "Kill any boss",
    codexHintAllBosses: "Kill all four bosses",
    codexHintButcher: "Kill The Butcher",
    codexHintOriginDefeat: "Defeat the Origin",
    codexName_guide: "The Guide",
    codexName_whisper: "The Whisper",
    codexName_eli: "Engineer Eli",
    codexName_mai: "Survivor Mai",
    codexName_linh: "Dr. Linh",
    codexName_river: "Old Man River",
    codexName_vu: "Captain Vu",
    codexName_warden: "The Warden",
    codexName_kane: "Kane the Butcher",
    codexName_origin: "Subject Zero",
    codexRole_guide: "Radio voice",
    codexRole_whisper: "Second voice",
    codexRole_eli: "Safehouse mechanic",
    codexRole_mai: "Rescued survivor",
    codexRole_linh: "Hospital doctor",
    codexRole_river: "Docks fisherman",
    codexRole_vu: "Quarantine captain",
    codexRole_warden: "Quarantine warden",
    codexRole_kane: "The Butcher",
    codexRole_origin: "First infected",
    codexBio_guide: "The voice on the military channel. It assigns every mission in clipped orders and never explains a decision twice. The evacuation promise loops every 47 seconds in its voice.",
    codexBio_whisper: "A second voice under the radio static, weak and broken. It asked for medicine in the hospital, smoke in the park, fuel at the docks — and it has been inside the quarantine core the whole time.",
    codexBio_eli: "The safehouse mechanic. He kept the three generators running, re-wired the west fence and patches your guns between waves. Nothing in the safehouse works unless Eli has already taken it apart once.",
    codexBio_mai: "A survivor pulled out of a supply run in the residential quarter. She does not talk about the bite on her arm, and she knows every back alley between the safehouse and the docks. Eli gave her the empty backpack; she has not put it down since.",
    codexBio_linh: "The last doctor at Central Hospital. She stayed with patients who could not be moved, and left medicine caches where someone might still find them. The hospital lights were on for six days after the evacuation.",
    codexBio_river: "An old fisherman who refused to leave the docks. He reads the tide, keeps the fuel lines clear and calls the infected \"the tide\" because they always come back with it. He trades supplies for news, never for money.",
    codexBio_vu: "Captain of the last quarantine checkpoint. He lost his squad holding the steel gate and still wears the uniform they died in. He does not ask you to salute; he asks you to keep the line.",
    codexBio_warden: "The officer who ran the quarantine zone. His name is on every sealed order and every missing-person list; the thing that guards the steel door still wears his coat. The troopers call it the Warden because nobody remembers his real name.",
    codexBio_kane: "The thing that charges you with a cleaver in the quarantine. Before the outbreak he ran the quarantine kitchen and could feed two hundred people from one pot. The troopers called him Kane the Butcher because of the way he cut meat, not the way he fought.",
    codexBio_origin: "Subject Zero. The first infected in the city, kept alive in the vault under the quarantine core and studied until the power failed. It rose on mission 10 with three phases and one memory: the city it used to live in.",
    codexSecret_guide: "The Guide is not in a rescue chopper. He is in a relay booth outside the city, and he gave the order to weld the quarantine gates with people still inside. The 47-second promise is his voice on a loop — he has not needed a rescue for a long time.",
    codexSecret_whisper: "The Whisper is not a survivor waiting behind the steel. It is the Origin's memory of being human, leaking through the vault one broken sentence at a time. Every warning it gave you was a memory trying to stop itself.",
    codexSecret_eli: "On day 3 Eli opened the docks fuel depot to siphon diesel for the generators. The noise pulled the first horde through the fence and killed the people sleeping beside it. He has been repairing what he broke ever since, one generator at a time.",
    codexSecret_mai: "Mai is the Warden's daughter, and the bite never turned her. Her blood is the reason the quarantine was sealed — half hospital, half laboratory. The Warden welded the gates to keep her in, and the Guide let him.",
    codexSecret_linh: "Dr. Linh engineered the strain. It was a stabilization vector — something to keep the infected alive long enough to study — and it escaped the lab on its first trial. The sample in the vault is hers, and she has been trying to reach it before the Origin does.",
    codexSecret_river: "River brought patient zero ashore. It arrived in a sealed crate on a research boat, addressed to Central Hospital, and he signed the manifest without asking. He has been waiting at the docks ever since for someone to ask him what was in it.",
    codexSecret_vu: "Vu ordered the strike that sealed the quarantine with civilians inside. The Guide gave the order; Vu made it happen and has guarded the door ever since. He is not protecting the city from what is inside — he is protecting the inside from what he did.",
    codexSecret_warden: "The Warden left the vault's inner lock open. He believed the only way to end the quarantine was to let Subject Zero out and let the city finish the argument. His keycard is still in the lock, and the door has been waiting for someone to close it.",
    codexSecret_kane: "Kane was the cook, not a soldier. When the food ran out he volunteered for the first injection after Subject Zero, on the condition the kitchen stayed open. He kept the cleaver because it was the only tool he knew how to use.",
    codexSecret_origin: "Under the rage it remembers a hospital bed, Dr. Linh's voice and rain on a window. It does not want to spread; it wants someone to remember it as a person. The Whisper was the last part of that memory still trying to warn you.",
  },
  vi: {
    // --- tabs + shared chrome -------------------------------------------------
    helpTitle: "ĐIỀU KHIỂN",
    helpTitleZombies: "SỔ SINH VẬT",
    helpTitleDossier: "HỒ SƠ",
    helpTabControls: "ĐIỀU KHIỂN",
    helpTabZombies: "ZOMBIE",
    helpTabDossier: "HỒ SƠ",
    helpTabsAria: "Các mục hướng dẫn",
    helpClose: "Đóng",
    helpCloseHint: "H / ESC — đóng",
    // --- controls tab (original content) -------------------------------------
    helpSecMovement: "DI CHUYỂN",
    helpSecCombat: "CHIẾN ĐẤU",
    helpSecWorld: "THẾ GIỚI",
    helpSecTips: "MẸO",
    helpMove: "Di chuyển",
    helpSprint: "Chạy nhanh",
    helpJump: "Nhảy",
    helpAim: "Ngắm",
    helpFire: "Bắn",
    helpReload: "Nạp đạn",
    helpSwitch: "Đổi súng",
    helpThrowBomb: "Ném bom",
    helpSwitchBomb: "Đổi bom",
    helpInteract: "Tương tác",
    helpShop: "Cửa hàng",
    helpTrade: "Giao dịch với Thương Lái",
    helpContracts: "Bảng hợp đồng",
    helpMap: "Bản đồ",
    helpHelp: "Điều khiển / trợ giúp",
    helpPause: "Tạm dừng",
    helpTipHeadshot: "Bắn vào đầu gây sát thương cao hơn.",
    helpTipAutoReload: "Tự động nạp đạn khi băng đạn hết.",
    helpTipShop: "Mua và nâng cấp súng trong cửa hàng bằng phím B.",
    helpTipTrader: "Thương Lái ở An Toàn Nhà bán súng độc quyền, bom và giáp.",
    helpTipContracts: "Bảng hợp đồng ở An Toàn Nhà trả tiền và XP cho mục tiêu phụ.",
    helpTipSurvive: "Sống sót qua các đợt và hoàn thành nhiệm vụ.",
    helpTipGuide: "Phím H mở hướng dẫn này ở bất kỳ đâu.",
    // --- bestiary tab ---------------------------------------------------------
    zIntro: "Sáu loại đi trên phố. Năm loại canh bóng tối.",
    zBadgeRegular: "THƯỜNG",
    zBadgeBoss: "BOSS",
    zStatHp: "HP",
    zStatSpeed: "TỐC ĐỘ",
    zStatDamage: "SÁT THƯƠNG",
    zStatScore: "ĐIỂM",
    zStatPhases: "GIAI ĐOẠN",
    zTraitLabel: "ĐẶC TÍNH",
    zCounterLabel: "CÁCH CHỐNG",
    zScaleBoss: "Máu tăng theo đợt: gốc × (1 + đợt/20).",
    zScaleOrigin: "Trận cuối — không tăng theo đợt. Đổi giai đoạn ở 66% và 33% máu.",
    zName_walker: "Walker",
    zName_runner: "Runner",
    zName_brute: "Brute",
    zName_crawler: "Crawler",
    zName_bloater: "Bloater",
    zName_armored: "Giáp Sắt",
    zName_butcher: "Đồ Tể",
    zName_spitter: "Kẻ Phun Acid",
    zName_screamer: "Kẻ Gào Thét",
    zName_golem: "Người Đá",
    zName_origin: "Nguồn Gốc",
    zAppear_walker: "Đợt 1+",
    zAppear_runner: "Đợt 2+",
    zAppear_brute: "Đợt 4+",
    zAppear_crawler: "Đợt 3+",
    zAppear_bloater: "Đợt 6+",
    zAppear_armored: "Đợt 9+ · 6+ Sinh Tồn",
    zAppear_butcher: "Đợt 5 · vòng boss",
    zAppear_spitter: "Đợt 10 · vòng boss",
    zAppear_screamer: "Đợt 15 · vòng boss",
    zAppear_golem: "Đợt 20 · vòng boss",
    zAppear_origin: "Nhiệm vụ 10 · cuối",
    // --- elite variants (compact section after the 11 cards) ------------------
    zEliteTitle: "BIẾN THỂ TINH ANH",
    zEliteIntro: "Zombie thường có thể biến thể. Boss thì không; tối đa một phần tư mỗi đợt.",
    eliteTag: "TINH ANH",
    eliteFrenzied: "Cuồng Loạn",
    eliteIronhide: "Da Sắt",
    eliteToxic: "Độc Tố",
    eliteGiant: "Khổng Lồ",
    zEliteStat_frenzied: "TỐC ×1.45 · ST ×1.15 · MÁU ×0.9 · CỠ ×1.08",
    zEliteBonus_frenzied: "Tiền ×1.6 · Điểm ×1.3",
    zEliteStat_ironhide: "MÁU ×2.2 · ST ×1.1 · TỐC ×0.92 · CỠ ×1.12 · THÂN −20%",
    zEliteBonus_ironhide: "Tiền ×1.8 · Điểm ×1.5",
    zEliteStat_toxic: "MÁU ×1.3 · TỐC ×1.05 · ST ×1.1 · CHẾT 15 / 2,5 m",
    zEliteBonus_toxic: "Tiền ×1.5 · Điểm ×1.35",
    zEliteStat_giant: "CỠ ×1.45 · MÁU ×1.8 · ST ×1.35 · TỐC ×0.9",
    zEliteBonus_giant: "Tiền ×2.0 · Điểm ×1.6",
    zTrait_walker: "Chậm nhưng lì; nó không dừng bước và luôn tiến ra từ mọi con hẻm.",
    zCounter_walker: "Nhắm đầu — headshot gấp đôi sát thương và rút ngắn nửa thời gian hạ gục.",
    zTrait_runner: "Lao nước rút từng đợt và tới sát trước khi súng kịp ổn định.",
    zCounter_runner: "Giữ khoảng cách; shotgun hoặc SMG ở cự ly gần hạ nó rất nhanh.",
    zTrait_brute: "Một bức tường thịt, chịu đạn vào thân rồi vẫn bước tới.",
    zCounter_brute: "Dùng shotgun hoặc súng bắn tỉa; bắn vào thân chỉ phí đạn.",
    zTrait_crawler: "Thứ nhanh nhất trong thành phố, bò lết dưới đường ngắm của bạn.",
    zCounter_crawler: "Dùng súng tản hoặc súng tự động; gần như không thể headshot khi nó bò.",
    zTrait_bloater: "Kẻ mang độc phình to; túi độc vỡ khi chết và tạt khắp xung quanh.",
    zCounter_bloater: "Hạ từ xa — vụ nổ gây 25 sát thương trong 4 m và để lại vòng xanh.",
    zTrait_armored: "Giáp chống bạo động chặn đạn vào thân; chỉ cái đầu lộ ra là thật.",
    zCounter_armored: "Headshot xuyên giáp; đạn vào thân mất 35% sát thương.",
    zTrait_butcher: "Lấy đà 0,8 giây với ánh đỏ, rồi lao thẳng một đường với con dao phay.",
    zCounter_butcher: "Né ngang cú lao; nó không thể đổi hướng sau khi khóa và cần thời gian hồi.",
    zTrait_spitter: "Giữ khoảng 10–16 m và phun cung acid để lại vũng 4 giây trên đất.",
    zCounter_spitter: "Né ngang đường phun rồi áp sát; trong 10 m nó vừa lùi vừa vẫn phun.",
    zTrait_screamer: "Tiếng gào đẩy bạn lùi 4 m và gọi thêm 3 zombie từ trong tối.",
    zCounter_screamer: "Đứng ngoài 8 m — tường không chặn được tiếng gào — và hạ ba đứa triệu hồi trước khi bị vây.",
    zTrait_golem: "Da đá hấp thụ 25% mọi sát thương; cú đập quét vòng 8 m.",
    zCounter_golem: "Lùi lại khi vòng cam lan ra, rồi phạt lúc hồi; nhắm vào đầu.",
    zTrait_origin: "Ba giai đoạn: đập đất và triệu hồi, rồi mưa acid và húc, cuối cùng cuồng nộ và sóng xung kích.",
    zCounter_origin: "Ở giai đoạn 3 giữ 7–12 m, canh sóng 6 m và tuyệt đối không đứng trong acid.",
    // --- dossier tab ----------------------------------------------------------
    dossierIntro: "Mười người đã để lại dấu ấn trong thành phố này. Hồ sơ mở dần khi bạn chơi.",
    codexProgress: "Đã mở {n}/{total} hồ sơ · {s}/{total} bí mật",
    codexLocked: "CHƯA MỞ",
    codexHiddenFile: "HỒ SƠ ẨN",
    codexLockedHint: "Mở khoá: {hint}",
    codexHintStoryStart: "Bắt đầu cốt truyện",
    codexHintMissionStart: "Tới nhiệm vụ {n}",
    codexHintMissionDone: "Hoàn thành nhiệm vụ {n}",
    codexHintSurvivor: "Cứu một người sống sót",
    codexHintSurvivors: "Cứu {n} người sống sót",
    codexHintAnyBoss: "Hạ bất kỳ boss nào",
    codexHintAllBosses: "Hạ cả bốn boss",
    codexHintButcher: "Hạ Đồ Tể",
    codexHintOriginDefeat: "Đánh bại Nguồn Gốc",
    codexName_guide: "Người Dẫn Đường",
    codexName_whisper: "Giọng Thì Thầm",
    codexName_eli: "Kỹ Thuật Viên Eli",
    codexName_mai: "Mai",
    codexName_linh: "Bác Sĩ Linh",
    codexName_river: "Lão River",
    codexName_vu: "Đội Trưởng Vũ",
    codexName_warden: "Vệ Binh",
    codexName_kane: "Kane — Đồ Tể",
    codexName_origin: "Nguồn Gốc",
    codexRole_guide: "Giọng radio",
    codexRole_whisper: "Giọng thứ hai",
    codexRole_eli: "Thợ máy nhà an toàn",
    codexRole_mai: "Người sống sót được cứu",
    codexRole_linh: "Bác sĩ bệnh viện",
    codexRole_river: "Ngư dân bến cảng",
    codexRole_vu: "Đội trưởng cách ly",
    codexRole_warden: "Vệ binh cách ly",
    codexRole_kane: "Đồ Tể",
    codexRole_origin: "Người nhiễm đầu tiên",
    codexBio_guide: "Giọng nói trên kênh quân đội. Nó giao từng nhiệm vụ bằng mệnh lệnh ngắn gọn và không bao giờ giải thích một quyết định hai lần. Lời hứa giải cứu lặp lại mỗi 47 giây bằng chính giọng nó.",
    codexBio_whisper: "Giọng thứ hai nằm dưới lớp tĩnh của radio, yếu và đứt quãng. Nó xin thuốc ở bệnh viện, khói ở công viên, xăng ở bến cảng — và suốt thời gian đó nó ở trong tâm cách ly.",
    codexBio_eli: "Thợ máy của nhà an toàn. Anh giữ ba máy phát chạy, đấu lại hàng rào tây và sửa súng cho bạn giữa các đợt. Không thứ gì trong nhà an toàn hoạt động nếu Eli chưa từng tháo nó ra một lần.",
    codexBio_mai: "Một người sống sót được kéo ra từ chuyến tiếp tế ở khu dân cư. Cô không nói về vết cắn trên tay, và thuộc mọi con hẻm giữa nhà an toàn và bến cảng. Eli đưa cô chiếc ba lô trống; từ đó cô không rời nó.",
    codexBio_linh: "Bác sĩ cuối cùng ở Bệnh viện Trung Tâm. Cô ở lại với những bệnh nhân không thể di chuyển và để lại các hộp thuốc ở nơi còn ai đó có thể tìm thấy. Đèn bệnh viện còn sáng sáu ngày sau khi di tản.",
    codexBio_river: "Lão ngư dân già không chịu rời bến cảng. Ông đọc thủy triều, giữ các đường nhiên liệu thông và gọi bọn nhiễm là \"thủy triều\" vì chúng luôn quay lại cùng nó. Ông đổi tiếp tế lấy tin tức, không bao giờ lấy tiền.",
    codexBio_vu: "Đội trưởng chốt cách ly cuối cùng. Ông mất cả đội khi giữ cổng thép và vẫn mặc bộ quân phục họ chết trong đó. Ông không bắt bạn chào; ông chỉ yêu cầu bạn giữ vững tuyến.",
    codexBio_warden: "Sĩ quan điều hành vùng cách ly. Tên ông nằm trên mọi lệnh niêm phong và mọi danh sách người mất tích; thứ canh cửa thép vẫn mặc áo khoác của ông. Lính gọi nó là Vệ Binh vì không ai nhớ tên thật của ông.",
    codexBio_kane: "Thứ lao vào bạn với con dao phay trong vùng cách ly. Trước dịch, ông phụ trách bếp vùng cách ly và có thể nuôi hai trăm người từ một nồi. Lính gọi ông là Kane Đồ Tể vì cách ông chặt thịt, không phải cách ông chiến đấu.",
    codexBio_origin: "Mẫu Số 0. Người nhiễm đầu tiên trong thành phố, được giữ sống trong hầm dưới tâm cách ly và nghiên cứu cho đến khi mất điện. Nó trỗi dậy ở nhiệm vụ 10 với ba giai đoạn và một ký ức: thành phố nó từng sống.",
    codexSecret_guide: "Người Dẫn Đường không ở trên trực thăng cứu hộ. Ông ta ở một buồng tiếp sóng ngoài thành phố, và chính ông ra lệnh hàn các cổng cách ly khi vẫn còn người bên trong. Lời hứa 47 giây là giọng ông ta phát lặp — ông ta đã không cần được cứu từ lâu.",
    codexSecret_whisper: "Giọng Thì Thầm không phải một người sống sót đợi sau cánh thép. Đó là ký ức của Nguồn Gốc về việc từng là người, rò rỉ qua hầm từng câu gãy. Mỗi lời cảnh báo nó dành cho bạn là một ký ức đang cố ngăn chính nó.",
    codexSecret_eli: "Ngày thứ 3, Eli mở kho nhiên liệu bến cảng để hút dầu cho máy phát. Tiếng ồn kéo bầy đầu tiên qua hàng rào và giết những người ngủ cạnh đó. Từ đó đến nay anh sửa lại thứ mình đã phá, từng máy phát một.",
    codexSecret_mai: "Mai là con gái của Vệ Binh, và vết cắn không bao giờ biến đổi cô. Máu của cô là lý do vùng cách ly bị hàn kín — nửa bệnh viện, nửa phòng thí nghiệm. Vệ Binh hàn cổng để giữ cô ở trong, và Người Dẫn Đường để mặc.",
    codexSecret_linh: "Bác Sĩ Linh tạo ra chủng bệnh. Nó là một vector ổn định — thứ giữ người nhiễm sống đủ lâu để nghiên cứu — và nó thoát khỏi phòng thí nghiệm ngay lần thử đầu. Mẫu trong hầm là của cô, và cô đang cố tới đó trước Nguồn Gốc.",
    codexSecret_river: "River đưa bệnh nhân số 0 vào bờ. Nó đến trong một thùng kín trên tàu nghiên cứu, ghi địa chỉ Bệnh viện Trung Tâm, và ông ký biên nhận mà không hỏi. Từ đó ông đợi ở bến cảng để có ai hỏi ông trong thùng có gì.",
    codexSecret_vu: "Vũ ra lệnh cuộc đánh chặn hàn kín vùng cách ly khi dân thường còn bên trong. Người Dẫn Đường ra lệnh; Vũ thực hiện và canh cánh cửa từ đó. Ông không bảo vệ thành phố khỏi thứ bên trong — ông bảo vệ bên trong khỏi thứ ông đã làm.",
    codexSecret_warden: "Vệ Binh để ngỏ khoá trong của hầm. Ông tin cách duy nhất để kết thúc vùng cách ly là để Mẫu Số 0 ra ngoài và để thành phố kết thúc cuộc tranh cãi. Thẻ khóa của ông vẫn cắm trong ổ, và cánh cửa vẫn đợi ai đó đóng nó lại.",
    codexSecret_kane: "Kane là đầu bếp, không phải lính. Khi hết thức ăn, ông tình nguyện nhận mũi tiêm đầu tiên sau Mẫu Số 0, với điều kiện bếp vẫn mở. Ông giữ con dao phay vì đó là thứ duy nhất ông biết dùng.",
    codexSecret_origin: "Dưới cơn cuồng nộ, nó nhớ một giường bệnh, giọng Bác Sĩ Linh và mưa trên cửa sổ. Nó không muốn lây lan; nó muốn có ai nhớ nó từng là người. Giọng Thì Thầm là phần cuối của ký ức đó vẫn cố cảnh báo bạn.",
  },
};

// [section title key, rows] — keycap labels are language-neutral.
const HELP_SECTIONS = [
  {
    titleKey: "helpSecMovement",
    rows: [
      { keys: ["W", "A", "S", "D"], labelKey: "helpMove" },
      { keys: ["Shift"], labelKey: "helpSprint" },
      { keys: ["Space"], labelKey: "helpJump" },
    ],
  },
  {
    titleKey: "helpSecCombat",
    rows: [
      { keys: ["Mouse"], labelKey: "helpAim" },
      { keys: ["Mouse L"], labelKey: "helpFire" },
      { keys: ["F"], labelKey: "helpThrowBomb" },
      { keys: ["V"], labelKey: "helpSwitchBomb" },
      { keys: ["R"], labelKey: "helpReload" },
      { keys: ["1-9 / 0 / - / =", "Wheel"], labelKey: "helpSwitch" },
    ],
  },
  {
    titleKey: "helpSecWorld",
    rows: [
      { keys: ["E"], labelKey: "helpInteract" },
      { keys: ["G"], labelKey: "helpTrade" },
      { keys: ["T"], labelKey: "helpContracts" },
      { keys: ["B"], labelKey: "helpShop" },
      { keys: ["M"], labelKey: "helpMap" },
      { keys: ["H"], labelKey: "helpHelp" },
      { keys: ["Esc", "P"], labelKey: "helpPause" },
    ],
  },
];

const HELP_TIP_KEYS = [
  "helpTipHeadshot",
  "helpTipAutoReload",
  "helpTipShop",
  "helpTipTrader",
  "helpTipContracts",
  "helpTipSurvive",
  "helpTipGuide",
];

const TABS = [
  { id: "controls", labelKey: "helpTabControls", titleKey: "helpTitle" },
  { id: "zombies", labelKey: "helpTabZombies", titleKey: "helpTitleZombies" },
  { id: "dossier", labelKey: "helpTabDossier", titleKey: "helpTitleDossier" },
];

// --- bestiary data (stats mirror src/zombies/zombie.js + bosses.js + origin.js)

const ZOMBIE_DEFS = [
  {
    id: "walker",
    kind: "regular",
    initial: "W",
    color: "#7f9b5a",
    hp: "100",
    speed: "2.2",
    dmg: "15",
    score: "100",
  },
  {
    id: "runner",
    kind: "regular",
    initial: "R",
    color: "#c9a25a",
    hp: "60",
    speed: "5.0",
    dmg: "10",
    score: "150",
  },
  {
    id: "brute",
    kind: "regular",
    initial: "B",
    color: "#6f9a8a",
    hp: "400",
    speed: "1.4",
    dmg: "35",
    score: "400",
  },
  {
    id: "crawler",
    kind: "regular",
    initial: "C",
    color: "#a8915e",
    hp: "45",
    speed: "6.2",
    dmg: "8",
    score: "175",
  },
  {
    id: "bloater",
    kind: "regular",
    initial: "BL",
    color: "#9bc04f",
    hp: "260",
    speed: "1.15",
    dmg: "30",
    score: "500",
  },
  {
    id: "armored",
    kind: "regular",
    initial: "A",
    color: "#8b949e",
    hp: "320",
    speed: "1.7",
    dmg: "28",
    score: "450",
  },
  {
    id: "butcher",
    kind: "boss",
    initial: "BU",
    color: "#b03a2e",
    hp: "1200",
    speed: "2.0",
    dmg: "40",
    scaleNote: "zScaleBoss",
  },
  {
    id: "spitter",
    kind: "boss",
    initial: "SP",
    color: "#8fae3a",
    hp: "800",
    speed: "2.6",
    dmg: "18",
    scaleNote: "zScaleBoss",
  },
  {
    id: "screamer",
    kind: "boss",
    initial: "SC",
    color: "#a5a9bb",
    hp: "600",
    speed: "3.2",
    dmg: "10",
    scaleNote: "zScaleBoss",
  },
  {
    id: "golem",
    kind: "boss",
    initial: "GO",
    color: "#8a9197",
    hp: "2000",
    speed: "1.2",
    dmg: "30",
    scaleNote: "zScaleBoss",
  },
  {
    id: "origin",
    kind: "boss",
    initial: "0",
    color: "#d0342c",
    hp: "3000",
    speed: "1.6 → 2.4",
    dmg: "30",
    phases: "3",
    scaleNote: "zScaleOrigin",
  },
];

// Elite variants (never bosses) — compact cards below the 11 bestiary cards.
// Colors mirror zombie.js ELITE_DEFS.
const ELITE_VARIANTS = [
  { id: "frenzied", color: "#ff5a1e" },
  { id: "ironhide", color: "#9fb6d0" },
  { id: "toxic", color: "#54e04a" },
  { id: "giant", color: "#ffc02e" },
];

// --- dossier data (10 characters; public file + hidden file) -----------------

const CHAR_DEFS = [
  {
    id: "guide",
    initial: "G",
    color: "#7fb2ff",
    publicHint: { key: "codexHintStoryStart" },
    secretHint: { key: "codexHintMissionDone", params: { n: 5 } },
  },
  {
    id: "whisper",
    initial: "W",
    color: "#b58cff",
    publicHint: { key: "codexHintMissionStart", params: { n: 3 } },
    secretHint: { key: "codexHintMissionStart", params: { n: 7 } },
  },
  {
    id: "eli",
    initial: "E",
    color: "#ffb347",
    publicHint: { key: "codexHintMissionDone", params: { n: 1 } },
    secretHint: { key: "codexHintMissionDone", params: { n: 6 } },
  },
  {
    id: "mai",
    initial: "M",
    color: "#6fe08a",
    publicHint: { key: "codexHintSurvivor" },
    secretHint: { key: "codexHintSurvivors", params: { n: 3 } },
  },
  {
    id: "linh",
    initial: "L",
    color: "#66d9d0",
    publicHint: { key: "codexHintMissionDone", params: { n: 4 } },
    secretHint: { key: "codexHintMissionDone", params: { n: 8 } },
  },
  {
    id: "river",
    initial: "R",
    color: "#7fb2a8",
    publicHint: { key: "codexHintMissionDone", params: { n: 6 } },
    secretHint: { key: "codexHintMissionDone", params: { n: 9 } },
  },
  {
    id: "vu",
    initial: "V",
    color: "#cfd8e3",
    publicHint: { key: "codexHintAnyBoss" },
    secretHint: { key: "codexHintAllBosses" },
  },
  {
    id: "warden",
    initial: "W",
    color: "#ff6b5d",
    publicHint: { key: "codexHintMissionDone", params: { n: 8 } },
    secretHint: { key: "codexHintMissionStart", params: { n: 10 } },
  },
  {
    id: "kane",
    initial: "K",
    color: "#ff8a5c",
    publicHint: { key: "codexHintButcher" },
    secretHint: { key: "codexHintAllBosses" },
  },
  {
    id: "origin",
    initial: "0",
    color: "#ff3b30",
    publicHint: { key: "codexHintMissionStart", params: { n: 10 } },
    secretHint: { key: "codexHintOriginDefeat" },
  },
];

const CHAR_MAP = {};
for (const c of CHAR_DEFS) CHAR_MAP[c.id] = c;

const REGULAR_BOSSES = ["butcher", "spitter", "screamer", "golem"];
const BOSS_TYPES = {};
for (const id of REGULAR_BOSSES) BOSS_TYPES[id] = true;
BOSS_TYPES.origin = true;

export const GUIDE_ZOMBIE_IDS = ZOMBIE_DEFS.map((z) => z.id);
export const GUIDE_CHARACTER_IDS = CHAR_DEFS.map((c) => c.id);

// --- scoped stylesheet (injected once; reuses the #ui theme variables) -------

const HELP_CSS = `
.gg-help-overlay {
  position: absolute;
  inset: 0;
  z-index: 60; /* above menus, shop/ending (40/41) and the map (50) */
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(
    ellipse at center,
    rgba(5, 8, 14, 0.62) 0%,
    rgba(2, 4, 8, 0.9) 100%
  );
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  pointer-events: auto; /* #ui is pointer-events:none — the modal takes clicks */
  font-family: "Segoe UI", system-ui, sans-serif;
  color: var(--gg-text, #dbe6f5);
}

.gg-help-overlay.hidden {
  display: none;
}

.gg-help-panel {
  width: min(980px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  background: var(--gg-panel, rgba(9, 13, 21, 0.92));
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 12px;
  padding: 26px 30px 18px;
  box-shadow:
    0 18px 60px rgba(0, 0, 0, 0.6),
    inset 0 0 0 1px rgba(127, 178, 255, 0.05);
}

.gg-help-panel:focus {
  outline: none;
}

.gg-help-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.gg-help-title {
  margin: 0;
  font-size: clamp(22px, 3vw, 30px);
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #f2f7ff;
  text-shadow: 0 0 22px rgba(127, 178, 255, 0.3);
}

.gg-help-close {
  appearance: none;
  flex-shrink: 0;
  padding: 8px 16px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--gg-text, #dbe6f5);
  background: #101a2b;
  border: 1px solid #2b3d5c;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    box-shadow 0.12s,
    transform 0.06s;
}

.gg-help-close:hover {
  background: #182641;
  border-color: var(--gg-accent, #7fb2ff);
  box-shadow: 0 0 14px rgba(127, 178, 255, 0.35);
}

.gg-help-close:active {
  transform: translateY(1px);
}

.gg-help-close:focus-visible {
  outline: 2px solid var(--gg-accent, #7fb2ff);
  outline-offset: 2px;
}

/* --- tabs ------------------------------------------------------------------ */

.gg-guide-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0 0 18px;
  border-bottom: 1px solid var(--gg-line, #24334d);
}

.gg-guide-tab {
  appearance: none;
  padding: 9px 15px 8px;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--gg-text-dim, #8fa1b8);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  transition:
    color 0.12s,
    border-color 0.12s,
    background 0.12s;
}

.gg-guide-tab:hover {
  color: #dbe6f5;
  background: rgba(127, 178, 255, 0.06);
}

.gg-guide-tab[aria-selected="true"] {
  color: var(--gg-gold, #ffd35e);
  border-bottom-color: var(--gg-gold, #ffd35e);
}

.gg-guide-tab:focus-visible {
  outline: 2px solid var(--gg-accent, #7fb2ff);
  outline-offset: 2px;
}

.gg-guide-view[hidden] {
  display: none;
}

/* --- controls tab (original layout) ---------------------------------------- */

.gg-help-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 20px;
  align-items: start;
}

.gg-help-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

@media (max-width: 720px) {
  .gg-help-grid {
    grid-template-columns: 1fr;
  }
}

.gg-help-section {
  padding: 12px 16px 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 10px;
}

.gg-help-sec-title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--gg-gold, #ffd35e);
}

.gg-help-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(36, 51, 77, 0.6);
}

.gg-help-row:last-child {
  border-bottom: none;
}

.gg-help-action {
  font-size: 13px;
  line-height: 1.35;
  color: var(--gg-text, #dbe6f5);
}

.gg-help-keys {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
  flex-shrink: 0;
}

.gg-help-key {
  display: inline-block;
  min-width: 28px;
  padding: 3px 9px;
  text-align: center;
  background: #0b1322;
  border: 1px solid #33465f;
  border-bottom-width: 2px;
  border-radius: 5px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  color: #cfe0ff;
  white-space: nowrap;
}

.gg-help-tips {
  margin: 0 0 8px;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--gg-text-dim, #8fa1b8);
}

.gg-help-tips li::marker {
  color: var(--gg-gold, #ffd35e);
}

/* --- bestiary --------------------------------------------------------------- */

.gg-guide-intro {
  margin: 0 0 14px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--gg-text-dim, #8fa1b8);
}

.gg-beast-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

@media (max-width: 720px) {
  .gg-beast-grid {
    grid-template-columns: 1fr;
  }
}

.gg-beast-card {
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 10px;
  min-width: 0;
}

.gg-beast-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.gg-beast-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #2b3d5c;
  border-radius: 12px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #f2f7ff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
  box-shadow: inset 0 0 14px rgba(0, 0, 0, 0.45);
}

.gg-beast-head {
  min-width: 0;
}

.gg-beast-name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}

.gg-beast-name {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #f2f7ff;
}

.gg-beast-badge {
  padding: 2px 6px;
  border: 1px solid;
  border-radius: 4px;
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.gg-beast-badge.reg {
  color: #9fb7a0;
  border-color: #3e5a44;
  background: rgba(70, 110, 80, 0.16);
}

.gg-beast-badge.boss {
  color: #ffb0a6;
  border-color: #6e2a24;
  background: rgba(140, 36, 28, 0.2);
}

.gg-beast-appear {
  margin-top: 3px;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gg-gold, #ffd35e);
}

.gg-beast-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 8px;
}

.gg-beast-stat {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 3px 7px;
  background: #0b1322;
  border: 1px solid rgba(51, 70, 95, 0.85);
  border-radius: 5px;
  font-size: 10.5px;
  line-height: 1.2;
  white-space: nowrap;
}

.gg-beast-stat-lbl {
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #7f93ad;
}

.gg-beast-stat-val {
  font-family: ui-monospace, Consolas, monospace;
  font-weight: 700;
  color: #dbe6f5;
}

.gg-beast-note {
  margin: 0 0 8px;
  font-size: 11px;
  line-height: 1.45;
  color: #c8b985;
}

.gg-beast-line {
  margin-top: 7px;
}

.gg-beast-line-lbl {
  display: block;
  margin-bottom: 2px;
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: var(--gg-gold, #ffd35e);
}

.gg-beast-line-txt {
  font-size: 12px;
  line-height: 1.5;
  color: #c7d4e6;
}

/* --- elite variants (compact mini cards under the bestiary) ----------------- */

.gg-elite-sec {
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid var(--gg-line, #24334d);
}

.gg-elite-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.16em;
  color: var(--gg-gold, #ffd35e);
}

.gg-elite-sec .gg-guide-intro {
  margin-bottom: 10px;
}

.gg-elite-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 720px) {
  .gg-elite-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.gg-elite-card {
  min-width: 0;
  padding: 9px 11px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--gg-line, #24334d);
  border-left: 3px solid var(--elite, #ffd35e);
  border-radius: 8px;
}

.gg-elite-top {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 6px;
}

.gg-elite-dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--elite, #ffd35e);
  box-shadow: 0 0 8px var(--elite, #ffd35e);
}

.gg-elite-name {
  margin: 0;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #f2f7ff;
}

.gg-elite-stats,
.gg-elite-bonus {
  font-size: 10px;
  line-height: 1.45;
  color: #b9c8dc;
}

.gg-elite-bonus {
  margin-top: 4px;
  color: var(--elite, #ffd35e);
}

/* --- dossier ---------------------------------------------------------------- */

.gg-dossier-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.gg-dossier-head .gg-guide-intro {
  flex: 1 1 280px;
  margin: 0;
}

.gg-dossier-progress {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--gg-gold, #ffd35e);
  white-space: nowrap;
}

.gg-dossier-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

@media (max-width: 720px) {
  .gg-dossier-grid {
    grid-template-columns: 1fr;
  }
}

.gg-char-card {
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--gg-line, #24334d);
  border-radius: 10px;
  min-width: 0;
}

.gg-char-card.is-locked {
  background: rgba(3, 6, 11, 0.62);
  border-color: rgba(36, 51, 77, 0.7);
}

.gg-char-top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.gg-char-portrait {
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #2b3d5c;
  border-radius: 50%;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 15px;
  font-weight: 800;
  color: #f2f7ff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
  box-shadow: inset 0 0 14px rgba(0, 0, 0, 0.45);
}

.gg-char-card.is-locked .gg-char-portrait {
  color: #4f6076;
  background: #080d15;
  border-color: #24334d;
  box-shadow: none;
}

.gg-char-main {
  min-width: 0;
  flex: 1;
}

.gg-char-name {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.03em;
  color: #f2f7ff;
}

.gg-char-card.is-locked .gg-char-name {
  color: #6b7d94;
}

.gg-char-role {
  margin-top: 2px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--gg-accent, #7fb2ff);
}

.gg-char-card.is-locked .gg-char-role {
  color: #56677d;
}

.gg-char-bio {
  margin: 9px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: #c7d4e6;
}

.gg-char-hint {
  margin: 9px 0 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--gg-text-dim, #8fa1b8);
}

.gg-secret {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255, 211, 94, 0.3);
}

.gg-secret-title {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.2em;
  color: var(--gg-gold, #ffd35e);
}

.gg-secret.is-locked .gg-secret-title {
  color: #8b7a45;
}

.gg-secret-text {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #e8d9a6;
}

.gg-secret.is-locked .gg-secret-text {
  color: var(--gg-text-dim, #8fa1b8);
}

/* --- footer ----------------------------------------------------------------- */

.gg-help-foot {
  margin-top: 14px;
  text-align: center;
}

.gg-help-hint {
  margin: 0;
  font-size: 12px;
  color: var(--gg-text-dim, #8fa1b8);
}
`;

// --- helpers -------------------------------------------------------------------

function make(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

let helpUid = 0;

// --- codex persistence (defensive: corrupt or blocked storage never throws) --

function emptyCodex() {
  return {
    chars: {},
    secrets: {},
    progress: { survivors: 0, bossKinds: {} },
  };
}

/** Filter arbitrary JSON into the exact frozen codex shape (unknown ids dropped). */
function normalizeCodex(raw) {
  const out = emptyCodex();
  if (!raw || typeof raw !== "object") return out;
  const chars = raw.chars && typeof raw.chars === "object" ? raw.chars : {};
  const secrets = raw.secrets && typeof raw.secrets === "object" ? raw.secrets : {};
  for (const c of CHAR_DEFS) {
    if (chars[c.id] === true) out.chars[c.id] = true;
    if (secrets[c.id] === true) {
      out.secrets[c.id] = true;
      out.chars[c.id] = true; // a hidden file always implies its public file
    }
  }
  return out;
}

/** Filter the counter sidecar (survivors + the four regular boss kinds). */
function normalizeProgress(raw) {
  const out = { survivors: 0, bossKinds: {} };
  if (!raw || typeof raw !== "object") return out;
  const survivors = Number(raw.survivors);
  out.survivors =
    Number.isFinite(survivors) && survivors > 0
      ? Math.min(9999, Math.floor(survivors))
      : 0;
  const kinds = raw.bossKinds && typeof raw.bossKinds === "object" ? raw.bossKinds : {};
  for (const id of REGULAR_BOSSES) {
    if (kinds[id] === true) out.bossKinds[id] = true;
  }
  return out;
}

function loadCodex() {
  const out = emptyCodex();
  try {
    if (typeof localStorage === "undefined") return out;
    const raw = localStorage.getItem(CODEX_STORAGE_KEY);
    if (raw) {
      const parsed = normalizeCodex(JSON.parse(raw));
      out.chars = parsed.chars;
      out.secrets = parsed.secrets;
    }
  } catch {
    /* corrupt codex JSON / privacy mode / quota — keep the empty state */
  }
  try {
    if (typeof localStorage === "undefined") return out;
    const raw = localStorage.getItem(CODEX_PROGRESS_KEY);
    if (raw) out.progress = normalizeProgress(JSON.parse(raw));
  } catch {
    /* corrupt sidecar — counters restart, unlocked files stay */
  }
  return out;
}

function persistCodex(codex) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      CODEX_STORAGE_KEY,
      JSON.stringify({ chars: codex.chars, secrets: codex.secrets })
    );
  } catch {
    /* storage full/blocked — the in-memory session still works */
  }
  try {
    localStorage.setItem(
      CODEX_PROGRESS_KEY,
      JSON.stringify({
        survivors: codex.progress.survivors,
        bossKinds: codex.progress.bossKinds,
      })
    );
  } catch {
    /* sidecar blocked — unlocks still persist in the main key */
  }
}

export function createHelp(container, bus, i18n) {
  if (!container || typeof container.appendChild !== "function") {
    throw new Error("createHelp: container (#ui) is required");
  }
  if (!bus || typeof bus.addEventListener !== "function") {
    throw new Error("createHelp: bus is required");
  }
  if (i18n && typeof i18n.registerBundle === "function") {
    i18n.registerBundle(HELP_BUNDLE);
  }

  const tr = (key, params) =>
    i18n && typeof i18n.t === "function" ? i18n.t(key, params) : key;

  // Inject the stylesheet once (id guard — a second createHelp must not
  // duplicate the rules; same pattern as shop.js).
  if (
    typeof document !== "undefined" &&
    !document.getElementById("gg-help-style")
  ) {
    const style = document.createElement("style");
    style.id = "gg-help-style";
    style.textContent = HELP_CSS;
    document.head.appendChild(style);
  }

  const codex = loadCodex();

  // --- DOM ---------------------------------------------------------------------
  const overlay = make("div", "gg-help-overlay hidden", container);
  const titleId = "gg-help-title-" + ++helpUid;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", titleId);

  const panel = make("div", "gg-help-panel", overlay);
  panel.tabIndex = -1; // focus target — avoids button focus / Space re-click

  const head = make("div", "gg-help-head", panel);
  const title = make("h2", "gg-help-title", head);
  title.id = titleId;
  const closeBtn = make("button", "gg-help-close", head);
  closeBtn.type = "button";

  const tabBar = make("div", "gg-guide-tabs", panel);
  tabBar.setAttribute("role", "tablist");

  /** @type {{id: string, labelKey: string, titleKey: string, btn: HTMLElement,
   *          view: HTMLElement}[]} */
  const tabEntries = [];
  const tabViews = {};

  // All three panels are siblings after the tab bar; only one is visible.
  for (const tab of TABS) {
    const btn = make("button", "gg-guide-tab", tabBar);
    btn.type = "button";
    btn.id = "gg-guide-tab-" + helpUid + "-" + tab.id;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", "false");
    btn.setAttribute("aria-controls", "gg-guide-view-" + helpUid + "-" + tab.id);
    btn.tabIndex = -1;
    tabEntries.push({ ...tab, btn, view: null });
  }

  // --- CONTROLS view ------------------------------------------------------------
  const viewControls = make("div", "gg-guide-view", panel);
  viewControls.id = "gg-guide-view-" + helpUid + "-controls";
  viewControls.setAttribute("role", "tabpanel");
  viewControls.setAttribute("aria-labelledby", "gg-guide-tab-" + helpUid + "-controls");
  tabViews.controls = viewControls;

  const grid = make("div", "gg-help-grid", viewControls);
  const colLeft = make("div", "gg-help-col", grid);
  const colRight = make("div", "gg-help-col", grid);

  /** @type {{node: HTMLElement, key: string, attr?: string}[]} */
  const bindings = [];
  function bind(node, key) {
    bindings.push({ node, key });
    return node;
  }
  function bindAriaLabel(node, key) {
    bindings.push({ node, key, attr: "aria-label" });
    return node;
  }

  bind(closeBtn, "helpClose");
  bindAriaLabel(tabBar, "helpTabsAria");
  // Tab labels are bound too (live language switch).
  for (let i = 0; i < tabEntries.length; i++) {
    const entry = tabEntries[i];
    bind(entry.btn, entry.labelKey);
    entry.btn.addEventListener("click", () => setTab(entry.id));
  }

  /** One grouped card: gold section title + a label/chips row per binding. */
  function buildSection(section, parent) {
    const sec = make("section", "gg-help-section", parent);
    bind(make("h3", "gg-help-sec-title", sec), section.titleKey);
    for (const row of section.rows) {
      const rowEl = make("div", "gg-help-row", sec);
      bind(make("span", "gg-help-action", rowEl), row.labelKey);
      const keys = make("span", "gg-help-keys", rowEl);
      for (const keycap of row.keys) {
        make("span", "gg-help-key", keys).textContent = keycap;
      }
    }
    return sec;
  }

  // Two stacked cards per column on wide screens (one column on narrow):
  // MOVEMENT + COMBAT | WORLD + TIPS.
  buildSection(HELP_SECTIONS[0], colLeft);
  buildSection(HELP_SECTIONS[1], colLeft);
  buildSection(HELP_SECTIONS[2], colRight);

  const tipsSec = make("section", "gg-help-section", colRight);
  bind(make("h3", "gg-help-sec-title", tipsSec), "helpSecTips");
  const tips = make("ul", "gg-help-tips", tipsSec);
  for (const key of HELP_TIP_KEYS) bind(make("li", "", tips), key);

  // --- ZOMBIES view -------------------------------------------------------------
  const viewZombies = make("div", "gg-guide-view", panel);
  viewZombies.id = "gg-guide-view-" + helpUid + "-zombies";
  viewZombies.setAttribute("role", "tabpanel");
  viewZombies.setAttribute("aria-labelledby", "gg-guide-tab-" + helpUid + "-zombies");
  viewZombies.hidden = true;
  tabViews.zombies = viewZombies;

  const zIntro = make("p", "gg-guide-intro", viewZombies);
  bind(zIntro, "zIntro");
  const beastGrid = make("div", "gg-beast-grid", viewZombies);
  const eliteSec = make("section", "gg-elite-sec", viewZombies);
  bind(make("h3", "gg-elite-title", eliteSec), "zEliteTitle");
  bind(make("p", "gg-guide-intro", eliteSec), "zEliteIntro");
  const eliteGrid = make("div", "gg-elite-grid", eliteSec);

  // --- DOSSIER view -------------------------------------------------------------
  const viewDossier = make("div", "gg-guide-view", panel);
  viewDossier.id = "gg-guide-view-" + helpUid + "-dossier";
  viewDossier.setAttribute("role", "tabpanel");
  viewDossier.setAttribute(
    "aria-labelledby",
    "gg-guide-tab-" + helpUid + "-dossier"
  );
  viewDossier.hidden = true;
  tabViews.dossier = viewDossier;

  const dossierHead = make("div", "gg-dossier-head", viewDossier);
  bind(make("p", "gg-guide-intro", dossierHead), "dossierIntro");
  const dossierProgress = make("span", "gg-dossier-progress", dossierHead);
  dossierProgress.textContent = ""; // filled by renderDossier()
  const dossierGrid = make("div", "gg-dossier-grid", viewDossier);

  for (const entry of tabEntries) {
    entry.view = tabViews[entry.id];
    entry.view.setAttribute("aria-labelledby", entry.btn.id);
  }

  const foot = make("div", "gg-help-foot", panel);
  bind(make("p", "gg-help-hint", foot), "helpCloseHint");

  // --- renderers (event-driven only; never called per frame) --------------------

  function statChip(parent, labelKey, value) {
    const chip = make("span", "gg-beast-stat", parent);
    const lbl = make("span", "gg-beast-stat-lbl", chip);
    lbl.textContent = tr(labelKey);
    const val = make("span", "gg-beast-stat-val", chip);
    val.textContent = value;
    return chip;
  }

  function buildBeastCard(z) {
    const card = make("article", "gg-beast-card", beastGrid);
    const top = make("div", "gg-beast-top", card);
    const icon = make("div", "gg-beast-icon", top);
    icon.textContent = z.initial;
    icon.style.background =
      "radial-gradient(circle at 32% 26%, " + z.color + " 0%, #0b1322 88%)";
    icon.style.borderColor = z.color;

    const headBox = make("div", "gg-beast-head", top);
    const nameRow = make("div", "gg-beast-name-row", headBox);
    const name = make("h3", "gg-beast-name", nameRow);
    name.textContent = tr("zName_" + z.id);
    const badge = make(
      "span",
      "gg-beast-badge " + (z.kind === "boss" ? "boss" : "reg"),
      nameRow
    );
    badge.textContent = tr(z.kind === "boss" ? "zBadgeBoss" : "zBadgeRegular");
    const appear = make("div", "gg-beast-appear", headBox);
    appear.textContent = tr("zAppear_" + z.id);

    const stats = make("div", "gg-beast-stats", card);
    statChip(stats, "zStatHp", z.hp);
    statChip(stats, "zStatSpeed", z.speed);
    statChip(stats, "zStatDamage", z.dmg);
    if (z.kind === "regular") statChip(stats, "zStatScore", z.score);
    if (z.phases) statChip(stats, "zStatPhases", z.phases);

    if (z.scaleNote) {
      const note = make("p", "gg-beast-note", card);
      note.textContent = tr(z.scaleNote);
    }

    const trait = make("div", "gg-beast-line", card);
    const traitLbl = make("span", "gg-beast-line-lbl", trait);
    traitLbl.textContent = tr("zTraitLabel");
    const traitTxt = make("span", "gg-beast-line-txt", trait);
    traitTxt.textContent = tr("zTrait_" + z.id);

    const counter = make("div", "gg-beast-line", card);
    const counterLbl = make("span", "gg-beast-line-lbl", counter);
    counterLbl.textContent = tr("zCounterLabel");
    const counterTxt = make("span", "gg-beast-line-txt", counter);
    counterTxt.textContent = tr("zCounter_" + z.id);
  }

  function buildEliteCard(def) {
    const card = make("article", "gg-elite-card", eliteGrid);
    card.style.setProperty("--elite", def.color);
    const top = make("div", "gg-elite-top", card);
    make("span", "gg-elite-dot", top);
    const name = make("h4", "gg-elite-name", top);
    name.textContent = tr("elite" + def.id[0].toUpperCase() + def.id.slice(1));
    const stats = make("div", "gg-elite-stats", card);
    stats.textContent = tr("zEliteStat_" + def.id);
    const bonus = make("div", "gg-elite-bonus", card);
    bonus.textContent = tr("zEliteBonus_" + def.id);
  }

  function renderBestiary() {
    beastGrid.replaceChildren();
    for (const z of ZOMBIE_DEFS) buildBeastCard(z);
    eliteGrid.replaceChildren();
    for (const e of ELITE_VARIANTS) buildEliteCard(e);
  }

  function hintText(hint) {
    return tr(hint.key, hint.params || {});
  }

  function buildCharCard(c) {
    const unlocked = codex.chars[c.id] === true;
    const secret = codex.secrets[c.id] === true;
    const card = make("article", "gg-char-card" + (unlocked ? "" : " is-locked"), dossierGrid);

    const top = make("div", "gg-char-top", card);
    const portrait = make("div", "gg-char-portrait", top);
    portrait.textContent = unlocked ? c.initial : "?";
    if (unlocked) {
      portrait.style.background =
        "radial-gradient(circle at 34% 28%, " + c.color + " 0%, #0b1322 92%)";
      portrait.style.borderColor = c.color;
    }

    const main = make("div", "gg-char-main", top);
    const name = make("h3", "gg-char-name", main);
    name.textContent = unlocked ? tr("codexName_" + c.id) : "???";
    const role = make("div", "gg-char-role", main);
    role.textContent = unlocked ? tr("codexRole_" + c.id) : tr("codexLocked");

    if (unlocked) {
      const bio = make("p", "gg-char-bio", card);
      bio.textContent = tr("codexBio_" + c.id);
    } else {
      const hint = make("p", "gg-char-hint", card);
      hint.textContent = tr("codexLockedHint", {
        hint: hintText(c.publicHint),
      });
    }

    const secretBox = make("div", "gg-secret" + (secret ? "" : " is-locked"), card);
    const secretTitle = make("div", "gg-secret-title", secretBox);
    secretTitle.textContent = secret
      ? tr("codexHiddenFile")
      : "🔒 " + tr("codexHiddenFile");
    const secretText = make("p", "gg-secret-text", secretBox);
    secretText.textContent = secret
      ? tr("codexSecret_" + c.id)
      : tr("codexLockedHint", { hint: hintText(c.secretHint) });
  }

  function renderDossier() {
    let n = 0;
    let s = 0;
    for (const c of CHAR_DEFS) {
      if (codex.chars[c.id] === true) n++;
      if (codex.secrets[c.id] === true) s++;
    }
    dossierProgress.textContent = tr("codexProgress", {
      n,
      s,
      total: CHAR_DEFS.length,
    });
    dossierGrid.replaceChildren();
    for (const c of CHAR_DEFS) buildCharCard(c);
  }

  // --- unlock engine ------------------------------------------------------------

  function announceUnlock(id, secret) {
    const nameKey = "codexName_" + id;
    const name = tr(nameKey);
    let text = tr("codexToast", { name });
    // Defensive: if this module was created before hud.js registered its
    // bundle, i18n.t("codexToast") returns the key itself — keep the toast
    // readable instead of showing a raw key.
    if (text === "codexToast") text = "📖 " + name;
    bus.dispatchEvent(
      new CustomEvent("codex-unlocked", {
        detail: { id, secret, nameKey, name, text },
      })
    );
  }

  function refreshDossierIfOpen() {
    if (activeTab === "dossier") renderDossier();
  }

  /** Public file. Returns true only for a NEW unlock (no toast spam). */
  function unlockCharacter(id) {
    if (!CHAR_MAP[id] || codex.chars[id] === true) return false;
    codex.chars[id] = true;
    persistCodex(codex);
    announceUnlock(id, false);
    refreshDossierIfOpen();
    return true;
  }

  /** Hidden file — a secret always implies its public file (2-stage contract). */
  function unlockSecret(id) {
    if (!CHAR_MAP[id] || codex.secrets[id] === true) return false;
    if (codex.chars[id] !== true) unlockCharacter(id);
    codex.secrets[id] = true;
    persistCodex(codex);
    announceUnlock(id, true);
    refreshDossierIfOpen();
    return true;
  }

  function allRegularBossesKilled() {
    for (const id of REGULAR_BOSSES) {
      if (codex.progress.bossKinds[id] !== true) return false;
    }
    return true;
  }

  function onMissionStart(index) {
    if (index === 1) unlockCharacter("guide");
    else if (index === 3) unlockCharacter("whisper");
    else if (index === 7) unlockSecret("whisper");
    else if (index === 10) {
      unlockSecret("warden");
      unlockCharacter("origin");
    }
  }

  function onMissionComplete(index) {
    if (index === 1) unlockCharacter("eli");
    else if (index === 4) unlockCharacter("linh");
    else if (index === 5) unlockSecret("guide");
    else if (index === 6) {
      unlockSecret("eli");
      unlockCharacter("river");
    } else if (index === 8) {
      unlockCharacter("warden");
      unlockSecret("linh");
    } else if (index === 9) unlockSecret("river");
  }

  function onSurvivorRescued() {
    codex.progress.survivors = Math.min(9999, codex.progress.survivors + 1);
    persistCodex(codex);
    unlockCharacter("mai");
    if (codex.progress.survivors >= 3) unlockSecret("mai");
  }

  function onZombieKilled(type) {
    if (type === "butcher") unlockCharacter("kane");
    if (BOSS_TYPES[type]) unlockCharacter("vu");
    if (REGULAR_BOSSES.indexOf(type) !== -1) {
      codex.progress.bossKinds[type] = true;
      persistCodex(codex);
    }
    if (allRegularBossesKilled()) {
      unlockSecret("vu");
      unlockSecret("kane");
    }
  }

  // --- tabs ---------------------------------------------------------------------

  let activeTab = "controls";

  function setTab(name) {
    const next = tabViews[name] ? name : "controls";
    activeTab = next;
    for (const entry of tabEntries) {
      const on = entry.id === next;
      entry.btn.setAttribute("aria-selected", on ? "true" : "false");
      entry.btn.tabIndex = on ? 0 : -1;
      entry.btn.classList.toggle("is-active", on);
      entry.view.hidden = !on;
    }
    const def = TABS.find((t) => t.id === next) || TABS[0];
    title.textContent = tr(def.titleKey);
    if (next === "dossier") renderDossier();
    if (next === "zombies") renderBestiary();
    panel.scrollTop = 0;
  }

  // Keyboard support for the tab bar: arrows move focus + selection, Home/End
  // jump to the ends. Real buttons still handle Enter/Space natively.
  tabBar.addEventListener("keydown", (e) => {
    const key = e && e.key;
    if (
      key !== "ArrowLeft" &&
      key !== "ArrowRight" &&
      key !== "Home" &&
      key !== "End"
    ) {
      return;
    }
    e.preventDefault();
    let i = TABS.findIndex((t) => t.id === activeTab);
    if (i < 0) i = 0;
    if (key === "ArrowLeft") i = (i - 1 + TABS.length) % TABS.length;
    else if (key === "ArrowRight") i = (i + 1) % TABS.length;
    else if (key === "Home") i = 0;
    else i = TABS.length - 1;
    const target = tabEntries[i];
    setTab(target.id);
    target.btn.focus();
  });

  // --- open / close ---------------------------------------------------------------
  let openFlag = false;
  let announcingOpen = false; // guards the module's own "help-open" announcement
  let lastState = "menu"; // gamestate boots in "menu" without an event
  let openedState = null; // state the sheet was opened over

  function open(tab) {
    // Already up: a tab request (codex-open / public openTab) switches in place.
    if (openFlag) {
      if (tab) setTab(tab);
      return;
    }
    if (tab) setTab(tab);
    openFlag = true;
    openedState = lastState;
    overlay.classList.remove("hidden");
    // Announce BEFORE the unlock: input.js's pointerlockchange handler must
    // already see helpOpen=true, or the expected lost lock would emit
    // "pause-toggle" and pause the run (a reference never pauses the game).
    // `announcingOpen` stops this module's own help-open listener from
    // re-routing the tab back to CONTROLS.
    announcingOpen = true;
    try {
      bus.dispatchEvent(new CustomEvent("help-open"));
    } finally {
      announcingOpen = false;
    }
    if (
      typeof document !== "undefined" &&
      document.pointerLockElement &&
      typeof document.exitPointerLock === "function"
    ) {
      try {
        document.exitPointerLock(); // free the cursor for the modal
      } catch {
        /* older browsers — the panel still takes clicks */
      }
    }
    try {
      panel.focus({ preventScroll: true });
    } catch {
      panel.focus();
    }
  }

  function close() {
    if (!openFlag) return;
    openFlag = false;
    openedState = null;
    overlay.classList.add("hidden");
    // Drop focus so Space/Enter cannot re-trigger the close button.
    const active = typeof document !== "undefined" ? document.activeElement : null;
    if (active && active !== document.body && typeof active.blur === "function") {
      active.blur();
    }
    // NEVER request pointer lock here: the game keeps its current state and
    // input.js re-locks on the player's next canvas click (see header).
    bus.dispatchEvent(new CustomEvent("help-closed"));
  }

  function toggle() {
    if (openFlag) close();
    else open(activeTab);
  }

  function show(next) {
    if (next) open(activeTab);
    else close();
  }

  function isOpen() {
    return openFlag;
  }

  /** Open a specific tab (also switches tabs while the sheet is already up). */
  function openTab(tab) {
    open(tab);
  }

  /** Fresh arrays, stable dossier order, exactly the public contract shape. */
  function codexState() {
    const chars = [];
    const secrets = [];
    for (const c of CHAR_DEFS) {
      if (codex.chars[c.id] === true) chars.push(c.id);
      if (codex.secrets[c.id] === true) secrets.push(c.id);
    }
    return { chars, secrets, total: CHAR_DEFS.length };
  }

  // --- initial render + i18n ------------------------------------------------------

  function applyTexts() {
    for (const b of bindings) {
      if (b.attr) b.node.setAttribute(b.attr, tr(b.key));
      else b.node.textContent = tr(b.key);
    }
    const def = TABS.find((t) => t.id === activeTab) || TABS[0];
    title.textContent = tr(def.titleKey);
    renderBestiary();
    renderDossier();
  }

  setTab("controls");
  applyTexts();
  setTab("controls"); // title + scroll after applyTexts rebuilt the cards

  // --- wiring ---------------------------------------------------------------------
  // H (forwarded by input.js) toggles the LAST tab; menus' CONTROLS button
  // opens CONTROLS; the new DOSSIER button opens the dossier tab.
  bus.addEventListener("help-toggle", toggle);
  bus.addEventListener("help-open", () => {
    if (announcingOpen) return; // our own open() announcement
    open("controls");
  });
  bus.addEventListener("codex-open", () => open("dossier"));

  closeBtn.addEventListener("click", close);

  // Click on the dim backdrop (never on the panel) dismisses. The overlay
  // covers #ui, so the click is consumed here and never reaches the canvas.
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  // Escape closes while open. CAPTURE phase (window beats input.js's bubble
  // listener — same pattern as shop.js) so input.js never turns this press
  // into "pause-toggle". H is left to input.js so its repeat guard applies.
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener(
      "keydown",
      (e) => {
        if (!openFlag || e.code !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      },
      true
    );
  }

  // A state flip hides the sheet with no side effects (no pause/resume, no
  // pointer-lock call, no menu changes); a same-state re-emit keeps it open.
  bus.addEventListener("state-changed", (e) => {
    const state = e && e.detail ? e.detail.state : null;
    if (!state) return;
    lastState = state;
    if (openFlag && state !== openedState) close();
  });

  // Live language switch (same convention as hud.js / menus.js / shop.js).
  bus.addEventListener("settings-changed", (e) => {
    const patch = e && e.detail && e.detail.patch ? e.detail.patch : null;
    if (patch && patch.lang) {
      applyTexts();
      setTab(activeTab);
    }
  });

  // --- codex triggers -------------------------------------------------------------
  bus.addEventListener("mission-start", (e) => {
    const d = e && e.detail ? e.detail : {};
    const index = Math.round(Number(d.index));
    if (Number.isFinite(index)) onMissionStart(index);
  });

  bus.addEventListener("mission-complete", (e) => {
    const d = e && e.detail ? e.detail : {};
    const index = Math.round(Number(d.index));
    if (Number.isFinite(index)) onMissionComplete(index);
  });

  bus.addEventListener("survivor-rescued", onSurvivorRescued);

  bus.addEventListener("zombie-killed", (e) => {
    const d = e && e.detail ? e.detail : {};
    const type = String(d.type || "");
    if (type) onZombieKilled(type);
  });

  bus.addEventListener("origin-defeated", () => {
    unlockSecret("origin");
  });

  return { show, toggle, isOpen, openTab, codexState };
}
