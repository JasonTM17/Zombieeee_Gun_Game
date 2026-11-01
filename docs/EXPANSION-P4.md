# Gun Game 2.0 — HỢP ĐỒNG KỸ THUẬT P4 (docs/EXPANSION-P4.md)

> Chặng **GUN GAME 2.0**: **LƯU GAME / TIẾP TỤC + NÂNG CẤP SÚNG + SINH TỒN VÔ TẬN +
> THÀNH TỰU / ĐỘ KHÓ / JUICE**.
> Tài liệu này là hợp đồng DUY NHẤT cho 4 builder + integrator. Mọi số/chữ ký
> dưới đây là FROZEN trừ khi ghi rõ "builder chọn". Giữ 100% tính năng
> P1 + P2 + P3 — mọi thay đổi trong P4 đều ADDITIVE.
>
> Nguồn số thật trong code đã đối chiếu lúc viết hợp đồng (commit 3d591a9):
> `src/systems/gamestate.js` (bus + pause-by-reason + `freshRun` 317-331 +
> listener "player-died" 405-416), `src/systems/economy.js:72-81` (REWARDS),
> `src/player/weapons.js` (bảng WEAPONS 175-288, `list` init 472-487,
> `reload()` 707-714, `reset()` 869-888, `unlock()` 892-903),
> `src/zombies/waves.js` (`composition` 255-267, `startWave` 279-291,
> `spawnBoss` 318-382, `nextGap` 547-557, `reset` 674-700, NG+ 188-217),
> `src/systems/events.js` (`forceEvent` 1145-1157, `startEvent` 598-614),
> `src/systems/shop.js` (CATALOG 89-96, `buy` 171-189),
> `src/ui/shop.js` (overlay + SHOP_BUNDLE 68-107, `refresh` 419-434),
> `src/ui/menus.js` (main-nav 142-156, `screens` 292-302),
> `src/ui/hud.js` (topinfo chips 525-535, `update` 1676+, `show` 1859),
> `src/systems/combat.js` (vòng pellet 183-222, `hit.point` 215),
> `src/core/input.js` (key handler 138-192), `src/core/settings.js`
> (DEFAULTS 44-49, `sanitize` 59-77), `src/main.js` (`freshRun` 624-681,
> `beginFreshStory` 711-719, keep-story owned capture 742-780,
> `beginNGPlus` 827-850, "ui-continue" 815-823, hudExtrasScratch 999-1013,
> `teleportDistrict` 1759-1797, debugApi 1457+), `src/core/debug.js`
> (DEBUG_KEYS 100-137), `src/systems/missions.js` (`skipToMission` 1189+,
> return API 1391-1402), `src/world/city.js:1677` (City api).

## MỤC LỤC

- §0 Quy ước + quyết định mơ hồ (P4-K1…P4-K23)
- §1 Bất biến — không được phá
- §2 Phân công builder
- §3 TÍNH NĂNG A — LƯU GAME / TIẾP TỤC (src/systems/save.js MỚI + gamestate)
- §4 TÍNH NĂNG B — NÂNG CẤP SÚNG (weapons.js + shop.js + ui/shop.js)
- §5 TÍNH NĂNG C — SINH TỒN VÔ TẬN (src/systems/endless.js MỚI + waves.js + src/systems/profile.js MỚI)
- §6 TÍNH NĂNG D — THÀNH TỰU + ĐỘ KHÓ + JUICE (achievements.js MỚI + menus + hud + input + settings)
- §7 WIRE & DEBUG (integrator: main.js + combat.js + debug.js + README)
- §8 Bảng event bus MỚI + key i18n (EN/VI nguyên văn)
- §9 Checklist hội quy — tích tên khi xong

---

## 0. Quy ước + quyết định mơ hồ — đã quyết (P4-K)

| # | Quyết định |
|---|---|
| P4-K1 | **Luồng save.** `gamestate.js` nghe 4 trigger trên bus ("mission-complete", "wave-clear", "player-died", "ui-quit") → mỗi lần phát **"save-request" `{reason}`** (reason = tên event trigger). `gamestate.js` ĐỒNG THỜI nghe **"save-request"** `{reason}` → khi `gamestate.saveDeps` đã được main gán thì gọi `gamestate.saveDeps.saveNow(reason)`. `gamestate.saveDeps` là property MỚI (mặc định `null`), main gán `gamestate.saveDeps = { saveNow: save.saveNow }` ngay sau `createSave`. save.js **không** tự nghe bus — main cũng gọi thẳng `save.saveNow("story-start")` trước `beginFreshStory()` (trigger cuối của spec). Listener "player-died" của save chạy SAU listener gameover cũ (registration order) nhưng snapshot không bị ảnh hưởng bởi cú flip gameover (score/kills/missions state không đổi trong lần flip đó) — "lưu trước gameover" thỏa vì dispatch là đồng bộ, save xong trước khi khung hình kế render. |
| P4-K2 | **"ui-continue" được TÁI SỬ DỤNG** cho nút menu TIẾP TỤC (đúng nguyên văn spec — tên event đã tồn tại từ P3 cho nút "CHƠI TIẾP" của màn kết, `main.js:815`). main.js thêm MỘT listener "ui-continue" THÊM (không sửa listener P3), gate `gamestate.state === "menu" && save.hasSave()` → chạy đường restore §3.4. Listener P3 cũ vô hại từ "menu": `removePause("ending")` là no-op khi reason không set. Main đăng ký listener restore NGAY SAU listener P3. Edge hiếm: `hasSave()` true nhưng `readSave()` trả null (hỏng giữa 2 lần đọc) → listener restore early-return; nút bấm vẫn là user gesture nên không có lỗi nào khác. |
| P4-K3 | **Infinity khi serialize.** `JSON.stringify(Infinity)` → `null`. Reserve của pistol phải lưu `null` và restore ánh xạ `null → Infinity`. Mọi giá trị reserve khác là số nguyên ≥ 0. Giá trị `upgrades.*` là số nguyên 0..3. |
| P4-K4 | **Restore recipe** — thứ tự CHÍNH XÁC 10 bước, §3.4. Player luôn hồi sinh tại safehouse (spawn truyện — `freshRun` đã `player.reset(STORY_SPAWN_YAW, STORY_SPAWN_X, STORY_SPAWN_Z)`); `currentDistrict` trong schema chỉ mang tính thông tin (debug/hiển thị), KHÔNG teleport. Wave director luôn chạy lại từ wave 1 sau restore (waves không có API skip — `wave` trong schema là giá trị hiển thị/thông tin; `gamestate.wave` được gán lại sau `start()` và sẽ được "wave-start" {n:1} ghi đè khi director khởi động — chấp nhận, ghi rõ README). |
| P4-K5 | **objectivesSnapshot** (tùy chọn trong schema): lưu `missions.getState()` + bản sao `{type, district, done, need, complete}` của objectives LIVE. Restore **KHÔNG phát lại** nó ở v1 — `missions.skipToMission(mission)` là cơ chế duy nhất ("thoát giữa nhiệm vụ = mất tiến trình hiện tại" — nhiệm vụ đang chạy chơi lại từ đầu). Snapshot phục vụ debug/kiểm chứng. |
| P4-K6 | **Công thức nâng cấp** (FROZEN): `effectiveDamage = base × (1 + 0.2×dmg)` (dmg 0..3 → ×1.0/1.2/1.4/1.6); `effectiveMagSize = floor(base × (1 + 0.25×mag))` (→ ×1.0/1.25/1.5/1.75); `effectiveReloadTime = base × (1 − 0.12×rl)` (→ ×1.0/0.88/0.76/0.64). Bảng def `WEAPONS[]` (weapons.js:175-288) GIỮ NGUYÊN (bất biến); upgrades sống trên entry RUNTIME `list[i].upgrades` + entry được ghi lại giá trị hiệu lực (`damage`/`magSize`) qua helper nội bộ — combat.js và HUD tiếp tục đọc đúng trường cũ, KHÔNG sửa combat cho mục này. `reload()` dùng thời gian hiệu lực (thay dòng `reloadTimer = WEAPONS[current].reloadTime` — weapons.js:712 — bằng helper). `getStats(name?)` accessor MỚI (thiếu name → súng đang cầm): `{name, damage, magSize, reloadTime, upgrades}` cho shop UI/save. `reset()` đưa upgrades về 0; restore/NG+ khôi phục từ snapshot (main chụp `getStats().upgrades` cho từng súng owned TRƯỚC `freshRun` và gán lại SAU — đúng pattern chụp `shop.owned()` của P3-K15 tại main.js:752/828). |
| P4-K7 | **Shop nâng cấp**: id `"upg:{weapon}:{track}"`, weapon ∈ 7 tên súng, track ∈ `"dmg"|"mag"|"rl"`. Giá theo CẤP KẾ TIẾP: `[250, 500, 1000]` (0→1 = 250, 1→2 = 500, 2→3 = 1000; tối đa 1750/nhánh). `buy()` trả `{ok:true}` hoặc `{ok:false, reason}`: `"unknown"` (id sai), `"owned"` (súng CHƯA sở hữu — tái dùng vocabulary hiện có, nghĩa mở rộng "quyền sở hữu chặn giao dịch này"), `"maxed"` (track đã cấp 3), `"no-money"` (economy.spend thất bại). shop.js thêm `upgradeInfo() → Array<{weapon, tracks: Array<{track, level, nextPrice}>}>` (CHỈ súng đang sở hữu, theo thứ tự `weapons.list`) + phát **"upgrade-bought"** `{weapon, track, level}` sau mỗi lần mua thành công. Không auto-save khi mua nâng cấp (lần mission-complete/wave-clear kế sẽ gom). |
| P4-K8 | **Endless composition** (FROZEN, wave n): `total = 8 + n×4`; **runner luôn ≥ 2**: `runners = max(2, round(total×0.3))`; **brute từ wave 3**: `brutes = 1 + floor((n−3)/5)` (wave 3→1, 8→2, 13→3 — tỉ lệ tăng); `walkers = max(0, total − runners − brutes)`. Cap sống đồng thời giữ nguyên MAX_CONCURRENT 60 (defer, không drop — waves.js:163/599). Intermission 10 s giữ nguyên. KHÔNG giảm nửa minion ở endless (luật "chia đôi" chỉ áp story-mode wave %5). |
| P4-K9 | **Endless mode switch trong waves.js** — API additive: `waves.setMode("story"|"endless")`, `waves.getMode()`, `waves.getWave()` (số wave hiện tại, 0 khi chưa bắt đầu). Mặc định "story" — hành vi byte-identical như cũ. `waves.reset()` trả mode về "story" (fresh-run state); `endless.start()` set "endless" sau reset. |
| P4-K10 | **Boss + bloodmoon endless**: wave `n % 5 === 0` → ĐẢM BẢO bloodmoon bằng `events.forceEvent("bloodmoon")` (cùng cơ chế của events — public API §3.2, tôn trọng luật bảng trống); nếu bị chặn (event khác đang chạy — scheduler vẫn chạy ở endless) endless **thử lại mỗi 1 s** trong suốt wave đó cho đến khi thành công. **Boss từ wave 8**: MỖI wave n ≥ 8 có ĐÚNG 1 boss NGẪU NHIÊN (chọn đều trong 4 key `BOSS_CLASSES` — KHÔNG dùng `bossTypeForWave` vòng tuần hoàn), spawn qua đúng cơ chế `spawnBoss` hiện có (zone anchor + fallback, "boss-spawned", nằm trong `tracked` — wave-clear chờ boss). |
| P4-K11 | **Điểm endless** (FROZEN): walker 10 / runner 15 / brute 40 / **boss 200** (mọi type boss) / headshot ×1.5 (áp cho mọi type, làm tròn 1 lần `Math.round`). Endless tự nghe "zombie-killed" khi active. Best lưu `"gungame.endless.v1"` = `{v:1, best:{wave, score}}` (best = wave cao nhất; bằng wave → score cao hơn). `profile.endlessBest` mirror cùng quy tắc qua `profile.add({endlessBest})`. |
| P4-K12 | **HUD endless**: `HudExtras` += `endless: {wave, score}|null` (main đổ từ `endless.snapshot()` khi active) và += `cam` (camera, cho số damage bay — P4-K16). Khi `extras.endless` có mặt, chip WAVE + SCORE hiển thị giá trị endless (gamestate.score/wave KHÔNG bị đụng ở endless — drift do listener "zombie-killed" của gamestate là chấp nhận, không hiển thị đâu cả). |
| P4-K13 | **Endless over**: "player-died" khi endless active → endless ghi best + phát **"endless-over"** `{wave, score, bestWave, bestScore}`; main (listener đăng ký SAU listener gameover của gamestate) gọi `menus.show("endlessOver")` — màn này ĐÈ lên màn gameover (state-changed đã hiện "gameover" trước đó trong cùng dispatch; lệnh show sau cùng thắng). Màn endlessOver: tiêu đề + WAVE ĐẠT ĐƯỢC + ĐIỂM + KỶ LỤC + nút VỀ MENU ("ui-quit"). menus tự nghe "endless-over" để đổ số (pattern số gameover qua "state-changed"). "ui-quit" từ endlessOver: listener hiện có của main (`freshRun()` + `toMenu`) chạy; main THÊM `endless.stop()` ở ĐẦU listener ui-quit (idempotent khi không active). |
| P4-K14 | **Start endless** (nút SINH TỒN → "ui-endless") — thứ tự CHÍNH XÁC §5.4: `storyMode(false)` → `gamestate.ngPlus = false` → `freshRun(false)` → KHÔNG gọi `missions.begin()` (missions vẫn reset, tracker ẩn — "đóng story") → teleport quarantine (dùng đúng logic offset `teleportDistrict("quarantine")` hiện có — tâm (0,0) là cửa vault solid) → `endless.start()` → `gamestate.start()` → `input.lockPointer()`. `events.update` vẫn chạy (bloodmoon cần events sống). |
| P4-K15 | **Độ khó** (FROZEN): `easy/normal/hard` → **hp ×0.75/1/1.35**, **dmg ×0.7/1/1.3**, **spawn density ×0.8/1/1.2**. Lưu `settings.difficulty` (mặc định `"normal"`). KHÔNG module nào nhận ref settings mới — lan truyền qua bus: **"settings-changed"** `{patch:{difficulty}}`; waves.js nghe + cache 3 hệ số; main.js nghe + áp lên ĐƯỜNG SPAWN CỦA MÌNH (runner sự kiện, debug spawn, **Origin** — main nhân `origin.maxHp/hp` và `origin.dmg` nếu có sau khi tạo). Boot-seed: main phát 1 lần "settings-changed" `{patch:{difficulty: settings.get().difficulty}}` ngay sau khi waves được tạo (trước frame đầu) để cache khởi động đúng. Density vào gap như bloodmoon (nhân NGOÀI single-winner P1, đúng P2-K8): `finalGap = p1WinnerGap × (bloodmoon ? 0.5 : 1) × (1 / densityMul)`. **Cộng dồn NG+** (FROZEN): `totalHp = hpMul_độ_khó × (ngPlus ? 1.25 : 1)`; dmg CHỈ theo độ khó (NG+ không cộng dmg); speed giữ luật NG+ ×1.1. Thứ tự áp: applyDifficulty TRƯỚC, applyNgPlus SAU (nhân nhau, thứ tự chỉ để code dễ đọc). Boss + Origin: maxHp = round(base × totalHp), hp = maxHp, dmg ×= dmgMul. |
| P4-K16 | **Floating damage numbers**: combat.js phát **"damage-dealt"** `{pos, amount, headshot}` — MỖI PELLET trúng (không phải mỗi phát): `pos = hit.point.clone()` (Vector3 world), `amount` = dmg thực áp (giá trị `dmg` trước `takeDamage`), `headshot` bool. Đây là điểm emit DUY NHẤT của combat.js (≤ 4 dòng — integrator). HUD nghe event này: tối đa **30** số đồng thời (thừa → bỏ), đời **0.8 s**, bay lên ~40 px, trắng 14 px; headshot đỏ 18 px đậm. Chiếu màn hình bằng `extras.cam` (P4-K12) qua `Vector3.project(camera)` mỗi frame trong `update()`; `cam` thiếu → bỏ số. Số chỉ render khi update() chạy (playing) — đúng phong cách các widget HUD khác. |
| P4-K17 | **FPS counter**: input.js phát **"fps-toggle"** khi F3 (bỏ qua auto-repeat; gate duy nhất `!shopOpen` — giống B/E/M; phát ở mọi state — HUD ẩn ở menu nên vô hại, mặc định ẨN). hud.js: div góc PHẢI TRÊN "FPS {n}", cập nhật trong `update()` từ dt đo được (EMA ×0.9), toggle flip display. |
| P4-K18 | **settings.js**: `DEFAULTS` += `{difficulty: "normal"}`; `sanitize` nhận `"easy"|"normal"|"hard"`, giá trị khác → default. Builder D sở hữu sửa đổi này (schema + 2 dòng typedef). |
| P4-K19 | **Thứ tự bootstrap (integrator)**: sau `ending` tạo theo thứ tự **profile → save → endless → achievements** (mọi dependency đã tồn tại: waves 302, gamestate 310, events 322); `createMenus` **CHUYỂXUỐNG** xuống sau achievements và nhận tham số thứ 5 `services = { save, profile, achievements }` (menus là DOM + listener thuần, không module nào giữ ref menus ngoài main — di chuyển an toàn); gán `gamestate.saveDeps` ngay sau createSave; boot-seed "settings-changed" sau waves. |
| P4-K20 | **Menus**: main-nav thứ tự MỚI: TIẾP TỤC (chỉ hiện khi `services?.save?.hasSave()`, ĐÈ TRÊN nút CHƠI — DOM đầu tiên) → CHƠI → CHƠI TỰ DO → **SINH TỒN** → CÀI ĐẶT → HƯỚNG DẪN → **THÀNH TỰU**. Màn "achievements" MỚI: lưới 12 ô (đạt = sáng + tên + mô tả; chưa = mờ), dòng tiến độ "Đã mở {n}/12", khối **THỐNG KÊ** (profile: kills / headshots / deaths / bossesKilled / moneyEarned / playtime định dạng `H:MM:SS` / endlessBest "wave X · score Y"), BACK. Màn "endlessOver" MỚI (P4-K13). Màn SETTINGS thêm hàng **ĐỘ KHỘ**: 3 nút Dễ/Thường/Khó → `settings.set({difficulty})` + `emitSettings({difficulty})` + trạng thái active. `createMenus(container, bus, settings, i18n, services?)` — services thiếu → TIẾP TỤC ẩn, lưới thành tựu đọc `{}` (toàn ô khóa), không throw. |
| P4-K21 | **profile.js**: nghe "zombie-killed" (kills; headshots khi `headshot === true`; bossesKilled khi type ∈ {butcher, spitter, screamer, golem, origin} — mirror BOSS_KILL_TYPES gamestate.js:224), "player-died" (deaths), "money-changed" `{delta > 0}` (moneyEarned). `update(dt)` cộng playtimeSec — main gọi trong nhánh "playing" (cạnh `gamestate.update`). Persist MỖI lần biến đổi (try/catch, im lặng). **KHÔNG có reset** — thống kê TRỌN ĐỜI, không listener ui-play/ui-restart nào được phép xoá. `get()` trả bản copy nông mới. |
| P4-K22 | **mission trong save**: `missions.current` khi 1..10; **11 (chain xong) lưu 10** (resume sau finale = tái đấu Origin — chấp nhận, ghi README); **0 lưu 0**, restore với mission 0 → `missions.begin()` (chơi từ m1). skipToMission(8/10) khi restore kích hoạt đúng side effect hiện có (m8 spawn boss, m10 mở vault + dậy Origin) — cùng ngữ nghĩa "chết-restart giữ tiến trình" P1 §5.6.3; restore NÉ thoại briefing bằng `suppressStartDialogue = true` (main.js:726) đặt trước, xoá sau. |
| P4-K23 | **4 file MỚI không import lẫn nhau trực tiếp** — mọi quan hệ đi qua `deps` (do main truyền) hoặc bus: save.js nhận `{snapshot}`, endless.js nhận `{waves, events, gamestate, profile}`, achievements.js nhận `{gamestate, endless, weapons}`, profile.js nhận chỉ bus. Stubs P4 đã chốt đúng chữ ký này; builder implement trong file, KHÔNG thêm param. |

---

## 1. Bất biến — không được phá

1. Chữ ký frozen không đổi: `createGamestate(bus, settings)`, `createEconomy(bus)`, `createShop(bus, economy, weapons, player)`, `createShopUI(container, bus, economy, shop, i18n)`, `createWaves(scene, level, bus, zones, city)`, `createEvents(bus, city, audio, hooks, scene)`, `createWeapons(camera, input, audio, bus)`, `createHud(container, bus, audio, i18n)`, `createCity(scene, level)`, `Zombie(scene, type, position, bus)`, `BossZombie(scene, wave, position, bus, def)`. Mọi bề mặt mới là ADDITIVE (param 5 của menus / method mới / property mới).
2. Bảng def `WEAPONS[]` (weapons.js) và `CATALOG` giá 6 mục (shop.js) KHÔNG đổi số. Không đụng REWARDS economy, DISTRICT_RECTS, 12 cổng, kho quarantine, Origins/boss defs.
3. Không file nào ngoài danh sách §2 được sửa. Không đụng audio.js trong P4.
4. Ngân sách hiệu năng vẫn effective: KHÔNG cấp phát trong per-frame path — floating numbers dùng pool DOM có trần 30; FPS counter 1 text node; hudExtras vẫn scratch zero-alloc (`endless`/`cam` là 2 field gán ref).
5. Mọi text đi qua i18n (`registerBundle`, EN + VI nguyên văn §8). Không hardcode chuỗi hiển thị.
6. localStorage đúng key FROZEN: `"gungame.save.v1"`, `"gungame.endless.v1"`, `"gungame.profile.v1"`, `"gungame.achv.v1"` (settings giữ `"gungame.settings"`). Mọi lần đọc/ghi bọc try/catch, hỏng → giá trị mặc định + `console.warn` 1 lần, KHÔNG BAO GIỜ throw ra gameplay.
7. Pause-by-reason: không reason mới trong P4. Save/restore/endless KHÔNG tự addPause/removePause.

---

## 2. Phân công builder

| Builder | File sở hữu | Nội dung |
|---|---|---|
| **A — SAVE** | `src/systems/save.js` (MỚI), `src/systems/gamestate.js` (4 trigger listener + saveDeps + listener "save-request") | §3 |
| **B — UPGRADES** | `src/player/weapons.js` (upgrades + getStats + applySaveState), `src/systems/shop.js` (upg:{w}:{t} + upgradeInfo + "upgrade-bought"), `src/ui/shop.js` (panel nâng cấp) | §4 |
| **C — ENDLESS** | `src/systems/endless.js` (MỚI), `src/systems/profile.js` (MỚI), `src/zombies/waves.js` (mode + composition endless + boss ngẫu nhiên + density difficulty) | §5 |
| **D — META UI** | `src/systems/achievements.js` (MỚI), `src/ui/menus.js` (TOÀN BỘ file: TIẾP TỤC theo §3.5 + SINH TỒN + thành tựu + thống kê + độ khó + endlessOver + services param), `src/ui/hud.js` (số damage bay + FPS + chip endless + toast thành tựu), `src/core/input.js` (F3), `src/core/settings.js` (difficulty) | §6 |
| **INTEGRATOR** | `src/main.js` (wire toàn bộ + restore + snapshot + difficulty vào đường spawn của main + Origin), `src/systems/combat.js` (1 emit "damage-dealt"), `src/core/debug.js` (5 key DEBUG_KEYS), `README.md` (mục GUN GAME 2.0) | §7 |

Ghi chú phân công (khác chữ trivial trong ask, giữ nguyên spec text): `menus.js` được giao **TOÀN BỘ cho Builder D** (bao gồm nút TIẾP TỤC của tính năng A — §3.5 chốt nội dung) để một file chỉ có một builder — không xung đột dòng. Nút SINH TỒN cũng nằm ở D. Hai builder KHÔNG đụng file của nhau.

---

## 3. TÍNH NĂNG A — LƯU GAME / TIẾP TỤC

### 3.0 SPEC A (nguyên văn yêu cầu)

> - createSave(bus, deps) → { saveNow(reason), readSave() → object|null, clearSave(), hasSave() }. Schema v1 localStorage key "gungame.save.v1": {v:1, ts, storyRun, ngPlus, mission, objectivesSnapshot?, money, weapons:[{name, owned, reserve, upgrades:{dmg,mag,rl}}], unlockedDistricts, currentDistrict, wave, score, highScore, difficulty}. Lưu TỰ ĐỘNG khi: "mission-complete", "wave-clear", "player-died" (lưu trước gameover), "ui-quit", trước khi beginningFreshStory. Corruption-guard: try/catch JSON + kiểm v; hỏng → xoá + trả null + console.warn.
> - gamestate.js MỞ RỘNG: expose saveDeps + nghe "save-request" (main sẽ gọi saveNow với snapshot đầy đủ qua callback main truyền — hợp đồng chi tiết); menu "TIẾP TỤC" phát "ui-continue" — main restore: economy tiền, weapons owned/reserve/upgrades, missions.skipToMission(mission), zones/city unlock state, gamestate.startStory(skip intro), NG+ flag.
> - menus.js: nút "TIẾP TỤC" HIỆN khi hasSave() (trên CHƠI), styled cùng hệ.
> - Thoát giữa nhiệm vụ = mất tiến trình hiện nay → hết.

### 3.1 src/systems/save.js (MỚI — Builder A)

`createSave(bus, deps) → SaveApi`

- `deps` (P4-K23): `{ snapshot: () => SaveData|null }` — callback main truyền, dựng snapshot ĐẦY ĐỦ §3.3. `snapshot()` trả `null` → `saveNow` no-op (dùng để chặn save ở endless — main trả null khi `endless.isActive()`, và khi state chưa phải run sống).
- `saveNow(reason)`:
  1. `typeof deps.snapshot !== "function"` → `console.warn("[save] no snapshot deps")` + return `{ok:false}`.
  2. `const data = deps.snapshot(); if (!data) return {ok:false};` — normalize: ép kiểu/validate từng field (mảng weapons chỉ giữ entry `{name, owned, reserve, upgrades{dmg,mag,rl}}` hợp lệ; Infinity → `null` (P4-K3)).
  3. `data.ts = Date.now()`; `JSON.stringify` bọc try/catch; `localStorage.setItem("gungame.save.v1", …)`. Lỗi (quota/private mode) → `console.warn("[save] write failed", reason)` 1 lần, không throw.
  4. Return `{ok:true, ts: data.ts}`.
- `readSave() → SaveData|null`: `localStorage.getItem` → try/catch `JSON.parse`; kiểm **`data && data.v === 1`** + field bắt buộc đúng kiểu (`money` number, `mission` number, `weapons` Array, `difficulty` string) → sai/hỏng → `localStorage.removeItem("gungame.save.v1")` + `console.warn("[save] corrupted save removed")` + trả `null`. Không kiểm `ts`.
- `clearSave()`: `removeItem` bọc try/catch (idempotent).
- `hasSave()`: `readSave() !== null` (đi qua corruption-guard — nút TIẾP TỤC không bao giờ hiện cho save hỏng).
- Bus: save.js KHÔNG tự nghe bus (P4-K1/K23). JSDoc typedef `SaveData`/`SaveWeaponEntry` đầy đủ.

### 3.2 gamestate.js mở rộng (Builder A — ADDITIVE, cuối createGamestate)

- `gamestate.saveDeps = null;` (property mới, gán bởi main).
- 4 listener trigger → `B.dispatchEvent(new CustomEvent("save-request", { detail: { reason } }))` với reason lần lượt `"mission-complete"` / `"wave-clear"` / `"player-died"` / `"ui-quit"`. Listener "player-died" đặt SAU listener gameover hiện có trong cùng khối (thứ tự đăng ký nội file — hành vi snapshot không đổi, P4-K1).
- Listener `"save-request"`: `const deps = gamestate.saveDeps; if (deps && typeof deps.saveNow === "function") deps.saveNow(d.reason || "auto");`
- Không đụng gì khác trong gamestate (không freshRun change, không pause change).

### 3.3 Snapshot của main (integrator — dữ liệu, Builder A không đụng)

`buildSaveSnapshot()` trong main.js trả `SaveData|null`:

| Field | Nguồn |
|---|---|
| `v: 1` | hằng |
| `storyRun` | `storyRun` (main.js:270) |
| `ngPlus` | `gamestate.ngPlus === true` |
| `mission` | `missions.current` clamp theo P4-K22 (1..10 giữ; 11→10; 0→0) |
| `objectivesSnapshot` | `{state: missions.getState(), objectives: missions.objectives.map(o => ({type, district, done, need, complete}))}` (P4-K5) |
| `money` | `economy.get()` |
| `weapons` | `weapons.list.map(w => ({name: w.name, owned: !!w.owned, reserve: Number.isFinite(w.reserve) ? w.reserve : null, upgrades: {dmg, mag, rl} từ w.upgrades}))` |
| `unlockedDistricts` | `reachableDistricts("safehouse")` (main.js:1291) |
| `currentDistrict` | `city.districtAt(player.position.x, player.position.z)` |
| `wave` | `gamestate.wave` |
| `score` | `gamestate.score` |
| `highScore` | `settings.get().highScore` |
| `difficulty` | `settings.get().difficulty` |

Trả `null` khi: `endless.isActive()` (chặn save-request từ "wave-clear" v.v. ở endless — P4-K1) hoặc `gamestate.state` không thuộc {"playing","paused","gameover"} (menu/intro — "ui-quit" từ menu không ghi đè save cũ).

### 3.4 Restore (integrator — "ui-continue" gate menu, P4-K2/K4)

```
1  const data = save.readSave(); if (!data) return;
2  gamestate.ngPlus = data.ngPlus === true;        // TRƯỚC freshRun để re-emit mang đúng giá
3  freshRun(false);                                 // thế giới sạch: economy 0, weapons reset,
                                                   // gates đóng, vault đóng, missions reset, zones khóa
4  economy.add(data.money|0);
5  weapons.applySaveState(data.weapons);            // Builder B — §4.3
6  if (data.mission >= 1 && data.mission <= 10) { suppressStartDialogue = true;
     missions.skipToMission(data.mission); suppressStartDialogue = false; }
   else missions.begin();                           // mission 0 — P4-K22
7  if (data.mission > 6) zones.unlockForWave(Number.MAX_SAFE_INTEGER);
8  for (id of data.unlockedDistricts) if (id !== "safehouse")
     { route = districtRoute("safehouse", id); if (route) for (g of route) city.setGateOpen(g.from, g.to, true); }
9  storyRun = true; keepStory = false; storyMode(true);
10 gamestate.startStory(); gamestate.beginPlay(); dialogue.hide();   // "startStory(skip intro)"
   gamestate.score = data.score|0; gamestate.wave = data.wave|0;
   input.lockPointer();
```

Ghi chú: skipToMission 8/10 kích hoạt side effect hiện có (P4-K22) — boss/Origin spawn trước khi state flip playing, tồn tại từ frame 1 (cùng hình dạng đường debug `skipToMission`). `difficulty` KHÔNG restore (settings là nguồn thật — lưu chỉ để thông tin).

### 3.5 menus.js — nút TIẾP TỤC (Builder D làm theo mục này)

- Main-nav (menus.js:148): chèn `button("continueGame", "btn", () => emitUi("ui-continue"), mainNav)` **TRƯỚC** nút CHƠI (DOM đầu tiên — "trên CHƠI").
- Hiện/ẩn: `btn.classList.toggle("hidden", !services?.save?.hasSave())` — đánh giá lại mỗi lần `show("main")` (showScreen) để sau `clearSave`/save mới nút cập nhật.
- Styled cùng hệ: class `"btn"` (không primary — CHƠI giữ primary). i18n key `continueGame` (§8.2).

---

## 4. TÍNH NĂNG B — NÂNG CẤP SÚNG

### 4.0 SPEC B (nguyên văn yêu cầu)

> - weapons.js: mỗi weapon instance thêm upgrades {dmg:0..3, mag:0..3, rl:0..3} — hiệu lực áp lúc tính: dmg ×(1+0.2×dmg), magSize = floor(base×(1+0.25×mag)), reloadTime ×(1−0.12×rl); combat/weapon đọc qua def accessor (giữ def gốc bất biến, thêm getStats()); serialize qua save. reset() về 0 nhưng NG+/restore khôi phục từ save.
> - shop.js: thêm mục nâng cấp cho TỪNG súng đang sở hữu: 3 track × 3 cấp, giá 250/500/1000; buy("upg:{weapon}:{track}") → {ok, reason:"maxed"|"no-money"}; catalog render động.
> - ui/shop.js: panel nâng cấp trong shop — mỗi súng sở hữu 1 hàng 3 nút track (tên EN/VI, cấp hiện tại ●●○, giá); mua xong cập nhật ngay.

### 4.1 weapons.js (Builder B)

- `list[i].upgrades = {dmg: 0, mag: 0, rl: 0}` (init + sau `reset()`/`unlock()`).
- Helper nội bộ `applyUpgrades(w, i)`: ghi `w.damage = WEAPONS[i].damage × (1 + 0.2×w.upgrades.dmg)`; `w.magSize = Math.floor(WEAPONS[i].magSize × (1 + 0.25×w.upgrades.mag))`; (reload thời gian hiệu lực tính lúc cần — không lưu đè vào def). Gọi sau khi đổi upgrades.
- `reload()` (weapons.js:712): `reloadTimer = WEAPONS[current].reloadTime × (1 − 0.12 × list[current].upgrades.rl)` (helper `effectiveReloadTime(i)`).
- Method MỚI `getStats(name?)` → `{name, damage, magSize, reloadTime, upgrades}` (thiếu/unknown name → súng ACTIVE; unknown → null). Pattern `getState()`.
- Method MỚI `applySaveState(entries)` (P4-K6): mỗi entry `{name, owned, reserve, upgrades}` → tìm theo name; `owned === true` → `owned = true` (không bao giờ un-own); `reserve`: `null → Infinity`, số → `Math.max(0, Math.round(v))`; upgrades: kẹp nguyên 0..3; `applyUpgrades`; `mag = magSize` (súng hồi đầy). Entry lạ bỏ qua. Khôi phục sau `reset()` — gọi trong restore/NG+ (P4-K6).
- `reset()` (weapons.js:869-888) thêm: `w.upgrades = {dmg:0, mag:0, rl:0}` + `applyUpgrades(w, i)`.
- `unlock()` (weapons.js:892-903) thêm: upgrades về 0 + applyUpgrades (súng mới mua chưa nâng cấp — idempotent với súng đã có).
- Typedef `WeaponState` += `upgrades`.

### 4.2 shop.js (Builder B)

- Hằng `UPGRADE_PRICES = [250, 500, 1000]`, `UPG_TRACKS = ["dmg", "mag", "rl"]`.
- `buy("upg:{weapon}:{track}")`: parse id (regex `^upg:([a-z]+):(dmg|mag|rl)$`) → sai → `{ok:false, reason:"unknown"}`; súng không tồn tại/chưa sở hữu → `"owned"`; track đã cấp 3 → `"maxed"`; `economy.spend(nextPrice)` thất bại → `"no-money"`; thành công: `w.upgrades[track] += 1`, weapons tự áp (B tự gọi `applyUpgrades` qua chính weapons.list entry — shop.js đột trực tiếp entry rồi gọi helper: **quyết** — shop.js chỉ đột `w.upgrades[track]`, và weapons.js tự nghe "upgrade-bought"? KHÔNG — vòng event. Chốt: shop.js gọi method MỚI của weapons **`weapons.setUpgrades(name, patch)`** (method thứ 3 B thêm: set level từ shop + applyUpgrades; kẹp 0..3). Thêm vào §4.1: `setUpgrades(name, patch)` public.)
- Sau thành công phát **"upgrade-bought"** `{weapon, track, level}` (P4-K7 — shop.js đến nay không phát event nào; đây là ngoại lệ froze rõ).
- `upgradeInfo()` (P4-K7): mảng theo `weapons.list` order, CHỈ entry `owned === true`: `{weapon: w.name, tracks: UPG_TRACKS.map(t => ({track: t, level: w.upgrades[t], nextPrice: level < 3 ? UPGRADE_PRICES[level] : null}))}`.
- `catalog` giữ nguyên 6 mục (nâng cấp KHÔNG vào CATALOG — UI dựng panel riêng từ upgradeInfo; "catalog render động" của spec = panel ui/shop render động theo owned/level).
- `reset()` giữ nguyên (bought.clear) — upgrades thuộc world reset (weapons.reset).

### 4.3 ui/shop.js (Builder B)

- Panel MỚI dưới grid catalog: tiêu đề `upgTitle` + hint `upgHint` + **mỗi súng owned 1 hàng**: tên súng (key `shopItem{Cap}` đã có) + 3 nút track. Nút: nhãn `{tr(upgTrack*)} ●●○` (đặc theo level, ví dụ cấp 1 → `●○○`) + dòng giá `$250` hoặc `upgMax` khi cấp 3. Disabled khi: maxed, không đủ tiền, hoặc (phòng hờ) súng không owned.
- Click nút → `shop.buy("upg:" + weapon + ":" + track)` → nghe **"upgrade-bought"** để refresh ngay cả khi overlay mở (cộng với `money-changed` hiện có — `refresh()` gọi `rebuildUpgrades()` rebuild panel từ `shop.upgradeInfo()`).
- Panel rebuild khi `open()` (như `refresh()` hiện tại) và khi `settings-changed {patch.lang}` (nhãn track theo ngôn ngữ).
- Style: tái dùng class `.gg-shop-*` hiện có + thêm 1 block CSS vào `SHOP_CSS` (`.gg-shop-upg-row` …) — file tự chứa như cũ.

---

## 5. TÍNH NĂNG C — SINH TỒN VÔ TẬN

### 5.0 SPEC C (nguyên văn yêu cầu)

> - menus "SINH TỒN" phát "ui-endless" → main: đóng story (missions inactive), teleport quarantine, endless.start() → waves chạy CHẾ ĐỘ VÔ TẬN: wave n: count = 8 + n×4 (cap spawn theo cap cũ), mọi loại trộn theo n (runner ≥2, brute từ wave 3, tỉ lệ tăng); MỖI wave 5 đảm bảo biến thể bloodmoon (gọi cùng cơ chế bloodmoon của events nếu truy cập được — hợp đồng chốt cách) + boss ngẫu nhiên từ wave 8; chết → endless over: màn SINH TỒN KẾT THÚC (wave đạt, điểm) → về menu.
> - Điểm riêng: walker 10 / runner 15 / brute 40 / headshot ×1.5 / boss 200 — lưu best {wave, score} localStorage "gungame.endless.v1"; HUD hiện WAVE + SCORE ở mode này (đọc cờ mode từ waves/gamestate).
> - src/systems/profile.js MỚI: thống kê TRỌN ĐỜI localStorage "gungame.profile.v1": {kills, headshots, deaths, playtimeSec, bossesKilled, moneyEarned, endlessBest} — nghe bus events cộng dồn (reset KHÔNG xoá profile); expose get()/add().

### 5.1 waves.js — chế độ endless (Builder C, ADDITIVE)

- State MỚI: `let mode = "story"`. API MỚI `setMode(m)` (`"story"|"endless"`, giá trị khác bỏ qua), `getMode()`, `getWave()` (trả `wave`). `reset()` += `mode = "story"`. Return object += 3 method.
- `composition(n)` nhánh endless (P4-K8): `total = 8 + n*4`; `runners = Math.max(2, Math.round(total*0.3))`; `brutes = n >= 3 ? 1 + Math.floor((n-3)/5) : 0`; `walkers = Math.max(0, total - brutes - runners)`. Nhánh story giữ NGUYÊN văn hiện tại (5 + n×3, boss-wave chia đôi…).
- `startWave` nhánh endless: `bossWave = n % 5 === 0` giữ nguyên vị trí; sau emit "wave-start": endless + `n % 5 === 0` KHÔNG spawn boss tại chỗ (boss là cơ chế riêng wave ≥ 8) — endless boss: `n >= 8` → `spawnBoss` với type NGẪU NHIÊN: helper `randomBossType()` chọn key từ `Object.keys(BOSS_CLASSES)` (thay `bossTypeForWave(n)` CHỈ trong endless; story byte-identical). Cấu trúc gợi ý giữ diff nhỏ: trong `spawnBoss(n, playerPos)` nhận `typeOverride` param optional.
- Density difficulty (P4-K15): cache `{hpMul, dmgMul, densityMul}` mặc định normal; listener "settings-changed" `{patch.difficulty}` cập nhật (mapping bảng §6.4); helper `applyDifficulty(z, isBoss)` (pattern `applyNgPlus` waves.js:207-217): thường `z.hp = round(z.hp × hpMul)` (boss: `z.maxHp = round(z.maxHp × hpMul); z.hp = maxHp`), `if (typeof z.dmg === "number") z.dmg = z.dmg × dmgMul`. Gọi trong `spawnOne` + `spawnBoss` TRƯỚC `applyNgPlus`. `nextGap` (waves.js:547-557): nhân thêm `(1 / densityMul)` ngoài hệ số bloodmoon. `reset()` trả cache về normal (boot-seed của main đặt lại ngay — P4-K19).

### 5.2 src/systems/endless.js (MỚI — Builder C)

`createEndless(bus, deps) → Endless` với `deps = { waves, events, gamestate, profile }` (P4-K23, cả 4 bắt buộc — thiếu throw tại tạo).

- Trạng thái nội bộ: `active`, `score`, `wave`, `killsThisMoon`, `moonRetryT`, `moonWave`.
- `start()`: `active = true; score = 0; wave = 0;` `waves.setMode("endless"); waves.reset();` phát **"endless-start"** `{}`.
- `stop()`: `active = false`; `waves.setMode("story")` (không reset — caller freshRun lo); phát "endless-score" cuối? KHÔNG — im lặng.
- `isActive()` → bool. `snapshot()` → `{active, wave, score}` (REUSED scratch object — zero-alloc cho hudExtras). `best()` → copy `{wave, score}` từ storage.
- `update(dt)`: chỉ chạy khi active; máy retry bloodmoon (P4-K10): nếu `moonWave === waves.getWave()` && wave % 5 === 0 && chưa thành công → `moonRetryT -= dt`; <= 0 → `moonRetryT = 1`; `events.forceEvent("bloodmoon")` === true → `moonWave = -1` (xong). "wave-start" `{n}` (listener bus): `wave = n; score giữ;` nếu `n % 5 === 0` → `moonWave = n; moonRetryT = 0;` (bật máy retry).
- "wave-clear" `{n}`: không điểm (điểm theo kill).
- "zombie-killed" `{type, headshot}`: `base = {walker:10, runner:15, brute:40}[type] ?? (BOSS_TYPES.includes(type) ? 200 : 0)` (boss = mọi type ngoài 3 loại thường, gồm origin — P4-K11); `score += Math.round(base × (headshot ? 1.5 : 1))`; phát **"endless-score"** `{wave, score}`.
- "player-died" khi active: `best = maxWave(best, {wave, score})` (P4-K11 tie rule) → ghi `"gungame.endless.v1"` `{v:1, best}` (try/catch) + `profile.add({endlessBest: best})` + phát **"endless-over"** `{wave, score, bestWave: best.wave, bestScore: best.score}` + `active = false` (stop không đụng waves — ui-quit/freshRun lo).
- i18n không cần ở module này (màn over là việc menus — §8.2 key của D).

### 5.3 src/systems/profile.js (MỚI — Builder C)

`createProfile(bus) → {get, add, update}` (bus optional → shared bus pattern economy.js:86).

- Khởi tạo từ `"gungame.profile.v1"` (try/catch + sanitize từng field: số nguyên ≥ 0; `endlessBest {wave, score}` nguyên ≥ 0): `{kills:0, headshots:0, deaths:0, playtimeSec:0, bossesKilled:0, moneyEarned:0, endlessBest:{wave:0, score:0}}`.
- `add(patch)`: 6 counter số → CỘNG (`Math.max(0, round)`); `endlessBest` object → THAY KHI TỐT HƠN (P4-K21: `wave > best.wave || (wave === best.wave && score > best.score)`). Persist ngay (try/catch). Emit không (profile im lặng trên bus).
- `update(dt)`: `playtimeSec += max(0, dt)` (persist theo tick đếm được — gộp: chỉ persist mỗi khi `floor` thay đổi để tránh ghi localStorage mỗi frame; FROZEN: persist khi `Math.floor(playtimeSec)` thay đổi).
- Listener "zombie-killed"/"player-died"/"money-changed" đúng P4-K21. KHÔNG listener reset nào.
- `get()` → bản copy nông mới (người gọi không được mutate nội bộ).

### 5.4 Start/endless wire (integrator — liệt kê ở đây vì thuộc luồng C)

Listener "ui-endless" trong main (thứ tự P4-K14):

```
storyMode(false); gamestate.ngPlus = false; freshRun(false);
// teleport quarantine: tái dùng đúng logic offset của teleportDistrict("quarantine")
teleportDistrictInternal("quarantine");
endless.start(); gamestate.start(); input.lockPointer();
```

(tách thân `teleportDistrict` thành helper nội bộ `teleportDistrictInternal(id)` dùng chung cho debug API — hành vi debug giữ nguyên). Main loop: `endless.update(dt)` cạnh `gamestate.update(dt)` trong nhánh "playing". `hudExtrasScratch.endless = endless.isActive() ? endless.snapshot() : null; hudExtrasScratch.cam = camera;`.

---

## 6. TÍNH NĂNG D — THÀNH TỰU + ĐỘ KHÓ + JUICE

### 6.0 SPEC D (nguyên văn yêu cầu)

> - src/systems/achievements.js MỚI: 12 thành tựu id + điều kiện nghe bus: first_blood (kill đầu), head_50, head_200 (headshots), story_half (m5), story_done (m10/origin-defeated), ngplus_done (origin-defeated khi ngPlus), rich_5000 (money ≥ 5000), arsenal (own 7 súng), maxed_gun (1 track đạt cấp 3), blood_slayer (10 kill trong 1 bloodmoon), wave_15 (endless wave 15), endless_5000 (score ≥ 5000). Unlock → localStorage "gungame.achv.v1" + toast vàng "🏆 THÀNH TỰU — {tên}" + phát "achievement-unlocked" {id}.
> - menus.js: panel "THÀNH TỰU" (lưới 12 ô: đạt sáng/mờ, tên + mô tả EN/VI) + mục "THỐNG KÊ" (profile) + chọn ĐỘ KHÓ (Dễ/Thường/Khó — settings.difficulty, mặc định Thường).
> - ĐỘ KHÓ (gamestate/waves đọc settings): zombie hp ×0.75/1/1.35, dmg ×0.7/1/1.3, spawn density ×0.8/1/1.2; NG+ cộng thêm ×1.25 hp trên hệ số khó (hợp đồng chốt công thức cộng dồn).
> - hud.js: FLOATING DAMAGE NUMBERS (số dmg bay lên tại điểm trúng, trắng; headshot đỏ to hơn — combat emit "damage-dealt" {pos, amount, headshot}), FPS counter góc phải trên (F3 toggle — input.js, mặc định ẩn).

### 6.1 src/systems/achievements.js (MỚI — Builder D)

`createAchievements(bus, deps) → AchievementApi`, `deps = {gamestate, endless, weapons}` (P4-K23, bắt buộc).

- Storage `"gungame.achv.v1"` = `{v:1, ids: []}` (try/catch; hỏng → `{v:1, ids:[]}`).
- 12 định nghĩa id FROZEN (nguyên văn điều kiện — bảng đầy đủ + i18n §6.2):

| id | Điều kiện chính xác | Nguồn tín hiệu |
|---|---|---|
| `first_blood` | kill đầu tiên | "zombie-killed" lần đầu |
| `head_50` | tổng headshot-kill ≥ 50 | đếm "zombie-killed" `{headshot:true}` |
| `head_200` | tổng headshot-kill ≥ 200 | như trên |
| `story_half` | hoàn thành nhiệm vụ 5 | "mission-complete" `{index:5}` |
| `story_done` | Origin bị hạ | "origin-defeated" (fallback "mission-complete" `{index:10}` — idempotent) |
| `ngplus_done` | Origin bị hạ khi NG+ | "origin-defeated" && `deps.gamestate.ngPlus === true` |
| `rich_5000` | tiền ≥ 5000 | "money-changed" `{money ≥ 5000}` |
| `arsenal` | sở hữu đủ 7 súng | poll `weapons.list` (count `owned === 7`) trên "money-changed" + "upgrade-bought" |
| `maxed_gun` | 1 track đạt cấp 3 | "upgrade-bought" `{level === 3}` |
| `blood_slayer` | 10 kill trong 1 bloodmoon | "bloodmoon-active" `{active}` arm/reset counter nội bộ + "zombie-killed" khi active ≥ 10 |
| `wave_15` | endless đạt wave 15 | "wave-start" `{n ≥ 15}` && `deps.endless.isActive()` |
| `endless_5000` | endless score ≥ 5000 | "endless-score" `{score ≥ 5000}` (+"endless-over" check cuối) |

- `unlock(id)`: idempotent (đã có → no-op); push id + persist + phát **"achievement-unlocked"** `{id}`.
- API: `all() → Array<{id, unlocked, nameKey, descKey}>` (nameKey = `"achv_" + id`, descKey = `"achv_" + id + "_desc"`); `unlockedIds() → string[]`; `isUnlocked(id)`.
- i18n: **registerBundle 24 key Ở MODULE LEVEL** (pattern events.js:150-185 — không phụ thuộc thứ tự tạo).

### 6.2 Key i18n thành tựu (achievements.js — Builder D, EN + VI NGUYÊN VĂN)

| Key | EN | VI |
|---|---|---|
| `achv_first_blood` | `First Blood` | `Giọt Máu Đầu Tiên` |
| `achv_first_blood_desc` | `Kill your first zombie.` | `Hạ con zombie đầu tiên.` |
| `achv_head_50` | `Sharpshooter` | `Xạ Thủ Tỉa` |
| `achv_head_50_desc` | `Land 50 headshot kills.` | `50 lần kết liễu bằng đòn đầu.` |
| `achv_head_200` | `Brain Surgeon` | `Bác Sĩ Não` |
| `achv_head_200_desc` | `Land 200 headshot kills.` | `200 lần kết liễu bằng đòn đầu.` |
| `achv_story_half` | `Halfway Through` | `Qua Nửa Đêm` |
| `achv_story_half_desc` | `Complete mission 5.` | `Hoàn thành nhiệm vụ 5.` |
| `achv_story_done` | `Dawn Breaks` | `Bình Minh Lên` |
| `achv_story_done_desc` | `Defeat the Origin and finish the story.` | `Hạ Nguồn Gốc và kết thúc câu chuyện.` |
| `achv_ngplus_done` | `Again, Harder` | `Lại Lần Nữa, Khó Hơn` |
| `achv_ngplus_done_desc` | `Defeat the Origin in New Game+.` | `Hạ Nguồn Gốc trong New Game+.` |
| `achv_rich_5000` | `War Chest` | `Túi Chiến Trường` |
| `achv_rich_5000_desc` | `Hold $5,000 at once.` | `Giữ $5,000 cùng lúc.` |
| `achv_arsenal` | `Full Arsenal` | `Kho Vũ Khí Đầy Đủ` |
| `achv_arsenal_desc` | `Own all 7 weapons.` | `Sở hữu đủ 7 súng.` |
| `achv_maxed_gun` | `Gunsmith` | `Thợ Súng` |
| `achv_maxed_gun_desc` | `Max out one upgrade track (level 3).` | `Max 1 nhánh nâng cấp (cấp 3).` |
| `achv_blood_slayer` | `Blood Moon Slayer` | `Kẻ Sát Trăng Máu` |
| `achv_blood_slayer_desc` | `Kill 10 zombies during one Bloodmoon.` | `Hạ 10 zombie trong một Trăng Máu.` |
| `achv_wave_15` | `Endurance` | `Sức Bền` |
| `achv_wave_15_desc` | `Reach wave 15 in Endless.` | `Đạt đợt 15 trong Sinh Tồn.` |
| `achv_endless_5000` | `Point Machine` | `Cỗ Máy Điểm` |
| `achv_endless_5000_desc` | `Score 5,000 in one Endless run.` | `Đạt 5,000 điểm một ván Sinh Tồn.` |

### 6.3 menus.js (Builder D — toàn bộ)

- Tham số 5 `services` (P4-K19/K20): `{ save, profile, achievements }` optional.
- Main-nav: THÊM `button("endless", "btn", () => emitUi("ui-endless"), mainNav)` sau CHƠI TỰ DO; THÊM `button("achievements", "btn", () => showScreen("achievements"), mainNav)` sau HOW TO PLAY. TIẾP TỤC theo §3.5.
- Màn `achievements` MỚI (`screens.achievements`): tiêu đề `achievements`; dòng tiến độ `achvProgress` `{n}` = `achievements.all().filter(a => a.unlocked).length`; lưới 12 ô (CSS nội bộ như shop — `style.css` ngoài tầm với): ô = tên (`achv_{id}`) + mô tả (`achv_{id}_desc`), class `unlocked` sáng / mặc định mờ; khối THỐNG KÊ: `statsTitle` + 7 dòng `statsKills`/`statsHeadshots`/`statsDeaths`/`statsBosses`/`statsMoney`/`statsPlaytime` (định dạng `H:MM:SS`)/`statsEndlessBest` (`"wave {w} · score {s}"` qua template `statsEndlessBestVal`); nút BACK về màn trước (pattern `settingsReturn`).
- Màn `endlessOver` MỚI: kicker `endlessOver` (đỏ) + `endlessWaveReached {n}` + `endlessScoreVal {n}` + `endlessBestVal` (`"wave {w} · score {s}"`) + nút `menu` → "ui-quit". Đổ số: listener "endless-over" tự có (P4-K13).
- SETTINGS: hàng 4 `difficulty` — 3 nút `diffEasy`/`diffNormal`/`diffHard`, active = `settings.get().difficulty`; click → `settings.set({difficulty})` + `emitSettings({difficulty})` + refresh active. `refreshSettingsUI` cập nhật hàng này.
- Rebuild lưới thành tựu khi: show màn + nghe "achievement-unlocked" (nếu đang mở).
- `showScreen` mở rộng map `screens` (màn mới thêm vào record).

### 6.4 hud.js + input.js + settings.js (Builder D)

- **hud.js — floating numbers**: nghe "damage-dealt" (P4-K16); pool ≤ 30 div `.dmg-num` (tạo lúc tạo HUD, tái dùng); trong `update()` (chỉ chạy playing) chiếu qua `extras.cam`: `v.copy(pos).project(cam)` → NDC → px (`x = (v.x×0.5+0.5)×w`, `y = (−v.y×0.5+0.5)×h`, đục dần theo tuổi, offset lên theo `t×40px`); trắng 14px / headshot đỏ 18px đậm; `cam` null → ẩn hết. Style inline (pattern boss-arrow hud.js:542-563).
- **hud.js — FPS**: div góc phải trên `top:18px; right:18px` (dưới killfeed — killfeed chiếm 18px đầu; đặt `top: 120px`? KHÔNG — tracker mission chiếm 120px; FPS đặt `top:18px; right: 210px`? Chốt: **góc phải trên NGAY TRÊN mission tracker: `top: 18px; right: 18px` là của killfeed → FPS dùng `top: 6px; right: 18px`** — sát mép trên, không đè killfeed (killfeed bắt đầu 18px). F3 → "fps-toggle" (input) → flip display; update text mỗi frame từ dt đo được: `fps = lerp(fps, 1/dt, 0.1)`, hiển thị `Math.round`. Mặc định ẨN.
- **hud.js — chip endless**: trong `update()`, `extras.endless` có mặt → `waveVal.textContent = fmtInt(extras.endless.wave)`, `scoreVal.textContent = fmtInt(extras.endless.score)` (bỏ qua gamestate). Nghe "achievement-unlocked" → `showToast(tr("achvToast", {name: tr("achv_" + id)}))` + class vàng (CSS inline thêm `.gold` cho toast — FROZEN style: màu `var(--gg-gold)`).
- **input.js**: nhánh `e.code === "F3"` trong keydown (pattern KeyM input.js:183-190): `if (!shopOpen) bus.dispatchEvent(new CustomEvent("fps-toggle"));` (auto-repeat đã bị chặn sớm — `e.repeat` return).
- **settings.js** (P4-K18): DEFAULTS += `difficulty: "normal"`; sanitize: `if (o.difficulty === "easy" || o.difficulty === "normal" || o.difficulty === "hard") out.difficulty = o.difficulty;`; typedef SettingsData += `difficulty`.

---

## 7. WIRE & DEBUG (integrator)

### 7.1 main.js

1. **Bootstrap (P4-K19)**: sau `ending` tạo `profile = createProfile(bus)` → `save = createSave(bus, { snapshot: buildSaveSnapshot })` → `gamestate.saveDeps = { saveNow: save.saveNow }` → `endless = createEndless(bus, { waves, events, gamestate, profile })` → `achievements = createAchievements(bus, { gamestate, endless, weapons })` → **CHUYỂN** `menus = createMenus(uiRoot, bus, settings, i18n, { save, profile, achievements })` xuống đây. Boot-seed: `bus.dispatchEvent(new CustomEvent("settings-changed", { detail: { patch: { difficulty: settings.get().difficulty } } }))` ngay sau dòng tạo waves.
2. **Snapshot + restore** (§3.3/§3.4) + listener "ui-continue" gate menu (P4-K2).
3. **Auto-save trigger cuối**: trong `beginFreshStory()` dòng ĐẦU: `save.saveNow("story-start");` (trước mọi reset — P4-K1).
4. **ui-endless** (§5.4). Main loop: `endless.update(dt)` cạnh `gamestate.update(dt)` (nhánh "playing"); `profile.update(dt)` cạnh đó.
5. **hudExtrasScratch** += `endless: null` + `cam: camera` (P4-K12); `hudExtras()` đổ từ `endless.snapshot()`.
6. **Difficulty đường spawn của main** (P4-K15): listener "settings-changed" {patch.difficulty} → cache nội bộ (boot-seed nạp sẵn); áp trong `spawnEventRunner` (runner sự kiện), `spawnZombie` debug, `spawnBossInternal` (boss debug/m8) — scale hp/dmg ngay sau `new Zombie/Ctor`, trước/sau đều được miễn trước khi frame kế (helper `applyDifficultyTo(z, isBoss)` của main, cùng bảng §6.4); **Origin** trong `spawnOriginInternal`: `origin.maxHp = round(3000 × hpMul × (ngPlus ? 1.25 : 1)); origin.hp = origin.maxHp; if (typeof origin.dmg === "number") origin.dmg *= dmgMul;` (đọc `gamestate.ngPlus` + cache difficulty).
7. **ui-quit** listener hiện có (main.js:805): thêm dòng ĐẦU `endless.stop();` (P4-K13).
8. **ui-restart / beginNGPlus / keep-story**: chụp + khôi phục upgrades (P4-K6): trước `freshRun` chụp `const upg = owned ? owned.map(n => ({name: n, u: weapons.getStats(n).upgrades})) : null` → sau khi re-own `weapons.setUpgrades(n, u)` từng súng. (beginNGPlus main.js:827-850 và nhánh keepStory main.js:742-780.)
9. **endless-over** listener: `menus.show("endlessOver")` (P4-K13).

### 7.2 combat.js — 1 emit (integrator)

Trong vòng pellet (combat.js:205-221), ngay sau dòng `const dmg = headshot ? damage * headMult : damage;` và trước `takeDamage` (hoặc ngay sau — chốt: NGAY TRƯỚC `foundZombie.takeDamage`, cùng block có `hit.point`):

```js
bus.dispatchEvent(new CustomEvent("damage-dealt", {
  detail: { pos: hit.point.clone(), amount: dmg, headshot },
}));
```

(≤ 4 dòng; pellet bị `continue`/`break` trước đó không phát — đúng "mỗi pellet trúng".)

### 7.3 debug.js + debug API (integrator)

- `DEBUG_KEYS` (debug.js:100-137) += `"saveNow"`, `"hasSave"`, `"endlessState"`, `"achievementsState"`, `"setDifficulty"` (không có key này → register BỎ — window.__game giữ stub vĩnh viễn). typedef register() += 5 key.
- debugApi thêm:
  - `saveNow()` → `save.saveNow("debug")` → `{ok, ts?}`.
  - `hasSave()` → `save.hasSave()`.
  - `endlessState()` → `endless.snapshot()` (clone mới — debug API trả object tươi, `{active, wave, score}`).
  - `achievementsState()` → `achievements.unlockedIds()` (mảng id đã unlock).
  - `setDifficulty(d)` → `settings.set({difficulty: d})` + phát "settings-changed" `{patch:{difficulty}}` → `{difficulty: settings.get().difficulty}` (invalid → settings sanitize về normal).
- `getState()` += `save: {hasSave: save.hasSave()}`, `endless: endless.snapshot()`, `difficulty: settings.get().difficulty`.

### 7.4 README.md

Mục "## GUN GAME 2.0 (P4)" sau mục Phần 3: bảng 5 tính năng (Lưu game/Tiếp tục — key auto-save + nút menu; Nâng cấp súng — công thức + giá; Sinh tồn vô tận — composition + điểm + best; Thành tựu 12 + thống kê; Độ khó — bảng hệ số + cộng dồn NG+), điều khiển mới (F3), key localStorage 4 key mới, debug API mới, và ghi chú hạn chế (resume về wave 1 của wave director; resume sau finale = tái đấu Origin; nâng cấp không auto-save).

---

## 8. Bảng event bus MỚI + key i18n còn lại

### 8.1 Event bus MỚI (bổ sung vào bảng gamestate.js)

| Event | Payload | Phát bởi | Nghe bởi |
|---|---|---|---|
| `save-request` | `{reason: "mission-complete"\|"wave-clear"\|"player-died"\|"ui-quit"\|"story-start"\|"debug"}` | gamestate.js (4 trigger) + main.js (story-start) | gamestate.js (→ `saveDeps.saveNow`) |
| `upgrade-bought` | `{weapon, track, level}` | shop.js | ui/shop.js (refresh), achievements.js (maxed_gun/arsenal) |
| `ui-endless` | `{}` | menus.js (SINH TỒN) | main.js |
| `endless-start` | `{}` | endless.js | achievements.js (ngữ cảnh mode) |
| `endless-score` | `{wave, score}` | endless.js | achievements.js (endless_5000) |
| `endless-over` | `{wave, score, bestWave, bestScore}` | endless.js | menus.js (số), main.js (show màn) |
| `achievement-unlocked` | `{id}` | achievements.js | hud.js (toast vàng), menus.js (rebuild) |
| `fps-toggle` | `{}` | input.js (F3) | hud.js |
| `damage-dealt` | `{pos: Vector3, amount, headshot}` | combat.js (mỗi pellet trúng) | hud.js (số bay) |

`settings-changed {patch}` MỞ RỘNG: `patch.difficulty` ("easy"|"normal"|"hard") — nghe thêm: waves.js, main.js. `ui-continue` tái sử dụng (P4-K2).

### 8.2 Key i18n — menus.js (Builder D, EN + VI NGUYÊN VĂN)

| Key | EN | VI |
|---|---|---|
| `continueGame` | `Continue` | `TIẾP TỤC` |
| `endless` | `Endless` | `SINH TỒN` |
| `achievements` | `Achievements` | `THÀNH TỰU` |
| `achvProgress` | `{n}/12 unlocked` | `Đã mở {n}/12` |
| `statsTitle` | `STATISTICS` | `THỐNG KÊ` |
| `statsKills` | `Kills` | `Số kill` |
| `statsHeadshots` | `Headshot kills` | `Kill vào đầu` |
| `statsDeaths` | `Deaths` | `Số lần chết` |
| `statsBosses` | `Bosses down` | `Boss đã hạ` |
| `statsMoney` | `Money earned` | `Tổng tiền kiếm được` |
| `statsPlaytime` | `Playtime` | `Thời gian chơi` |
| `statsEndlessBest` | `Endless best` | `Kỷ lục Sinh Tồn` |
| `difficulty` | `Difficulty` | `ĐỘ KHỘ` |
| `diffEasy` | `Easy` | `Dễ` |
| `diffNormal` | `Normal` | `Thường` |
| `diffHard` | `Hard` | `Khó` |
| `endlessOver` | `ENDLESS OVER` | `SINH TỒN KẾT THÚC` |
| `endlessWaveReached` | `Wave reached: {n}` | `Đợt đạt được: {n}` |
| `endlessScoreLbl` | `Score` | `Điểm` |
| `endlessBestLbl` | `Best` | `Kỷ lục` |

(Đã có sẵn dùng lại: `menu`, `score`, `back`.)

### 8.3 Key i18n — ui/shop.js (Builder B, EN + VI NGUYÊN VĂN)

| Key | EN | VI |
|---|---|---|
| `upgTitle` | `WEAPON UPGRADES` | `NÂNG CẤP SÚNG` |
| `upgHint` | `3 levels per track · applies instantly` | `3 cấp mỗi nhánh · áp dụng ngay` |
| `upgTrackDmg` | `Damage` | `Sát thương` |
| `upgTrackMag` | `Magazine` | `Băng đạn` |
| `upgTrackRl` | `Reload Speed` | `Tốc độ nạp` |
| `upgMax` | `MAX` | `TỐI ĐA` |

### 8.4 Key i18n — hud.js (Builder D, EN + VI NGUYÊN VĂN)

| Key | EN | VI |
|---|---|---|
| `achvToast` | `🏆 ACHIEVEMENT — {name}` | `🏆 THÀNH TỰU — {name}` |

---

## 9. Checklist hội quy — tích tên khi xong

**Builder A**
- [ ] `src/systems/save.js` — createSave + saveNow/readSave/clearSave/hasSave + schema v1 + corruption-guard + Infinity→null
- [ ] `src/systems/gamestate.js` — saveDeps + 4 trigger listener + listener "save-request" (ADDITIVE cuối file)

**Builder B**
- [ ] `src/player/weapons.js` — upgrades init + applyUpgrades + effectiveReloadTime + getStats + setUpgrades + applySaveState + reset/unlock về 0 + typedef
- [ ] `src/systems/shop.js` — buy("upg:{w}:{t}") + upgradeInfo + "upgrade-bought" + UPGRADE_PRICES
- [ ] `src/ui/shop.js` — panel nâng cấp (hàng/súng, ●●○, giá/MAX) + rebuild + CSS block + i18n §8.3

**Builder C**
- [ ] `src/systems/endless.js` — createEndless + start/stop/isActive/update/snapshot/best + wave-start/wave-clear/zombie-killed/player-died + bloodmoon retry + best + endless-over
- [ ] `src/systems/profile.js` — createProfile + get/add/update + 3 listener + persist
- [ ] `src/zombies/waves.js` — mode API + composition endless + random boss wave ≥ 8 + applyDifficulty + nextGap density + reset mode/cache

**Builder D**
- [ ] `src/systems/achievements.js` — 12 điều kiện + storage + unlock + "achievement-unlocked" + i18n 24 key module-level
- [ ] `src/ui/menus.js` — services param + TIẾP TỤC (§3.5) + SINH TỒN + màn achievements + THỐNG KÊ + độ khó + màn endlessOver + i18n §8.2
- [ ] `src/ui/hud.js` — floating damage numbers (pool 30) + FPS counter + chip endless + toast vàng thành tựu + i18n §8.4
- [ ] `src/core/input.js` — F3 → "fps-toggle" (gate !shopOpen)
- [ ] `src/core/settings.js` — difficulty schema + sanitize + typedef

**Integrator**
- [ ] `src/main.js` — bootstrap P4-K19 + boot-seed difficulty + snapshot/restore §3.3-3.4 + ui-continue gate menu + saveNow("story-start") + ui-endless §5.4 + endless.update/profile.update trong loop + hudExtras endless/cam + difficulty đường spawn main + Origin + ui-quit endless.stop() + upgrade capture NG+/keep + endless-over → màn
- [ ] `src/systems/combat.js` — 1 emit "damage-dealt" (§7.2)
- [ ] `src/core/debug.js` — DEBUG_KEYS += 5 + typedef
- [ ] Debug API: saveNow / hasSave / endlessState / achievementsState / setDifficulty + getState += {save, endless, difficulty}
- [ ] `README.md` mục "GUN GAME 2.0" (§7.4)
- [ ] Kiểm thử: `skipToMission(3)` → completeObjective → có "gungame.save.v1" → về menu → TIẾP TỤC hiện → bấm → tiền/súng/nhiệm vụ/khu khớp snapshot; save hỏng (sửa localStorage `"v":2`) → hasSave false + warn; mua pistol dmg cấp 3 (upg ×3) → damage 25→40; endless 10 wave (debug forceEvent + damageBoss) → wave 8 thấy boss ngẫu nhiên, wave 10 thấy bloodmoon; chết endless → màn SINH TỒN KẾT THÚC đúng số; F3 bật/tắt FPS; bắn đầu thấy số đỏ to hơn; setDifficulty("hard") → zombie đầu tiên hp 135.
