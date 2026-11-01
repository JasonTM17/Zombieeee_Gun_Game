# Gun Game — HỢP ĐỒNG KỸ THUẬT "ĐÊM THỨ 30 · PHẦN 3" (docs/EXPANSION-P3.md)

> Chặng cuối: **BOSS CUỐI "NGUỒN GỐC" + MÀN KẾT + NEW GAME+ + CÂN BẰNG TOÀN CỤC**.
> Tài liệu này là hợp đồng DUY NHẤT cho 2 builder + integrator. Mọi số/chữ ký
> dưới đây là FROZEN trừ khi ghi rõ "builder chọn" (bảng §3.9). Giữ 100% tính
> năng P1 + P2 — mọi thay đổi trong P3 đều ADDITIVE.
> Nguồn số thật trong code đã đối chiếu lúc viết hợp đồng (commit cf0b220):
> `src/systems/missions.js` (chain 9 nhiệm vụ, `current` 0..10),
> `src/zombies/bosses.js` (BossZombie + 4 boss), `src/world/level.js:577-600`
> (vault door Ø 4 m + collider 4×4), `src/world/city.js:1481` (City api),
> `src/systems/events.js` (scheduler §3.2), `src/systems/gamestate.js`
> (pause-by-reason, "outro-active"), `src/systems/economy.js:70-78` (REWARDS),
> `src/zombies/waves.js` (boss wave, `summoned`), `src/core/audio.js`
> (RECIPES 7 loại), `src/main.js` (wire + debugApi).

## MỤC LỤC

- §0 Quy ước + quyết định mơ hồ (P3-K1…P3-K15)
- §1 Bất biến — không được phá
- §2 Phân công builder
- §3 TÍNH NĂNG A — BOSS "NGUỒN GỐC" (src/zombies/origin.js MỚI + 5 file mở rộng)
- §4 TÍNH NĂNG B — MÀN KẾT + NEW GAME+ (src/ui/ending.js MỚI + gamestate/audio)
- §5 TÍNH NĂNG C — CÂN BẰNG TOÀN CỤC (docs/BALANCE.md — integrator)
- §6 TÍNH NĂNG D — WIRE & DEBUG (integrator: main.js + debug API + README)
- §7 Bảng event bus MỚI + key i18n (EN/VI nguyên văn)
- §8 Checklist hội quy (wire) — tích tên người làm

---

## 0. Quy ước + quyết định mơ hồ — đã quyết (P3-K)

| # | Quyết định |
|---|---|
| P3-K1 | `openVault` là method CÔNG KHAI mới trên City (`city.openVault(open?)`). Nhưng mesh + collider cửa thép thuộc **level.js** (`level.js:577-600`, collider `{minX:-2,maxX:2,minZ:-2,maxZ:-2}`) → level.js thêm private hook phi-liệt-kê **`__vaultOpen(open)`** (đúng pattern `__cityRegisterGates`/`__cityGateOpenAt` — P1 §3.5.3). `city.openVault()` ủy quyền + trả `false` khi hook thiếu. |
| P3-K2 | Chain nhiệm vụ kéo dài **9 → 10**. Giá trị `missions.current`: `1..10` = nhiệm vụ đang chạy (10 = m10 "Nguồn Gốc"), **11 = chain xong (free-roam)** — cũ là 10. Mọi guard `current > 9` / `>= 9` / `<= 9` trong missions.js và main.js được rà + nới đúng một bậc. |
| P3-K3 | Objective boss của m10 hoàn thành qua **2 đường cùng lúc**, đều idempotent (không double-count vì `setProgress` chặn khi `complete`): (1) `BOSS_TYPES += origin` trong missions.js — đi qua "zombie-killed" `{type:"origin"}`; (2) missions.js nghe **"origin-defeated"** → `setProgress(bossObj, 1)` (đúng nguyên văn spec; giữ khi (1) bị chặn bởi edge case). |
| P3-K4 | Khối `if (idx === 9) dialogue.showOutro(...)` trong `main.js:749-758` bị **XÓA** (chính chú thích của nó ghi "WF-3 replaces the outro with the real ending"). `STORY_DIALOGUE.m9.done = []` giữ nguyên — m9 xong → cascade m10 chạy ngay, không thoại done. |
| P3-K5 | Trigger duy nhất của trận boss: main.js nghe **"mission-start" `{index:10}`** → gọi `city.openVault()` + `spawnOriginInternal()` (cùng cơ chế `spawnBossInternal` của M8 — `main.js:1170-1215`). Origin TỰ phát **"origin-alive" `{alive:true|false}`** (không phải main). |
| P3-K6 | main.js giữ **`originRef` tách rời `bossRef`**. Boss bar / map marker / `damageBoss` / hudExtras / mapExtras **ưu tiên `originRef` khi còn sống** (origin đè boss wave thường — đúng spec "Origin ưu tiên"). |
| P3-K7 | "Player chết giữa trận → boss hồi đầy máu + rút về vault" hiện thực bằng **dispose + respawn**: mọi đường chết đều qua gameover → `freshRun()` (kể cả story-keep) đã drain `debugZombies` → Origin bị dispose; PLAY AGAIN → `reAnnounceMission()` phát "mission-start" `{index:10}` → P3-K5 spawn Origin MỚI full 3000 hp, rise animation từ vault = "trở về vault". Animation rút lui thấy được bị BỎ (chết → màn gameover che toàn màn hình, animation sẽ vô hình). `originRef = null` khi nghe "player-died". |
| P3-K8 | Rung màn hình: integrator thêm additive **`explosives.shake(mult = 1)`** (set `shakeT = SHAKE_TIME·mult`, tái dùng máy shake nội bộ `explosives.js:434-444`). Death nổ lớn: main nghe "origin-defeated" → `particles.spawnBlood(pos, 40)` + `particles.spawnSpark(pos)` ×3 + `explosives.shake(2)`. Origin không giữ ref particles/explosives (chữ ký 3 tham số frozen). |
| P3-K9 | NG+: cờ **`gamestate.ngPlus`** (boolean, mặc định false) + bus event **"ng-plus" `{active}`**. `waves.js` + `origin.js` nghe event này và áp **hp ×1.25 / speed ×1.1 cho đơn vị MỚI tạo** (đơn đang sống không đổi). Origin hp 3000 → NG+ 3750, speed 1.6 → 1.76. |
| P3-K10 | Pause chuỗi kết: ending.js phát **"ending-active" `{active}`**; gamestate.js nghe → `addPause/removePause("ending")` (pattern "outro-active" `gamestate.js:378-382`). `PauseReason` typedef += `"ending"`. Esc/P trong lúc đó là no-op (addPause chỉ chuyển từ "playing"; pause-toggle không xóa reason lạ). |
| P3-K11 | Stats: gamestate thêm **`runStats()`** → snapshot `{timeSec, kills, moneyEarned, deaths, bossesKilled}`; reset trong `freshRun()`. `kills` mirror `gamestate.kills` (đã đếm "zombie-killed"); `moneyEarned` = Σ delta dương của "money-changed"; `deaths` = đếm "player-died"; `bossesKilled` = đếm "zombie-killed" type ∈ {butcher, spitter, screamer, golem, origin}; `timeSec` từ mốc `performance.now()` đặt trong `freshRun()`. |
| P3-K12 | audio.js bị **CẢ HAI builder** đụng, BLOCK RỜI NHAU: Builder A thêm 1 row `RECIPES.origin` (giữa bảng, không sửa row khác); Builder B thêm 2 method `chopperSynth/victorySting` ở cuối + 2 dòng typedef. Không dòng nào chung — merge trivial. |
| P3-K13 | Nút màn kết phát bus: "CHƠI TIẾP" → **"ui-continue"** (mới), "NEW GAME+" → **"ui-ngplus"** (mới), "VỀ MENU" → **"ui-quit"** (đã có — `main.js:669`). main.js xử lý ui-continue (bỏ pause + lockPointer) và `beginNGPlus()` (§4.5). |
| P3-K14 | Debug `skipToEnding()`: nếu Origin đang sống → `takeDamage(hp+1, false)` (đi qua đường chết THẬT → đủ mọi event); nếu không → tự phát `"origin-defeated"` `{timeSec:0, damageTaken:0, debug:true}`. |
| P3-K15 | NG+ giữ TIỀN + SÚNG + settings: `beginNGPlus()` đi đường story-keep (`freshRun(true)` — economy không reset) rồi **`missions.reset()` tường minh** + mở lại sở hữu súng bằng cách ghi trực tiếp `w.owned = true` trên `weapons.list` (đường chính thức `weapons.js:23`) theo id bắt trước `shop.owned()`. `storyRun = true` để chết-restart giữ tiền. |

---

## 1. Bất biến — không được phá

1. Chữ ký frozen: `createOrigin(scene, bus, city)`, `createEnding(container, bus, gamestate, audio, i18n, camera)`, `createMissions(bus, city, economy, scene, level)`, `createEvents(bus, city, audio, hooks, scene)`, `createCity(scene, level)`, `Zombie(scene, type, position, bus)`, `BossZombie(scene, wave, position, bus, def)`.
2. Mặt ngoài boss (`docs/EXPANSION.md` C4) giữ nguyên cho Origin: `alive, hp, group, position, update(dt, player, level, others), takeDamage(d, headshot) → boolean, dispose()`, mesh `userData.part = "head"|"body"` + `userData.zombie`.
3. Không file nào ngoài danh sách §2 được sửa. Không đụng shop price/id, không đụng `DISTRICT_RECTS`/`AREA_RECTS`, không đổi 12 cổng, không đổi kho quarantine.
4. Ngân sách hiệu năng P1 §3.7 / P2 §3.8 vẫn effective: KHÔNG cấp phát trong per-frame path của Origin/ending (ring/pool/tia acid dùng scratch + pool như spitter/golem — `bosses.js:550-763` là mẫu).
5. Mọi text đi qua i18n (`registerBundle`, EN + VI). Không hardcode chuỗi hiển thị.
6. WebAudio synth thuần — không file âm thanh.

---

## 2. Phân công builder

| Builder | File sở hữu | Nội dung |
|---|---|---|
| **A — BOSS** (origin) | `src/zombies/origin.js` (MỚI), `src/systems/missions.js` (m10), `src/world/level.js` (`__vaultOpen`), `src/world/city.js` (`openVault`), `src/systems/events.js` (nghe "origin-alive"), `src/systems/economy.js` (REWARDS.origin), `src/core/audio.js` (RECIPES.origin) | §3 |
| **B — ENDING** (kết + NG+) | `src/ui/ending.js` (MỚI), `src/systems/gamestate.js` (pause "ending", ngPlus, runStats, "ending-active"), `src/zombies/waves.js` (nghe "ng-plus"), `src/core/audio.js` (chopperSynth/victorySting — block cuối) | §4 |
| **INTEGRATOR** | `src/main.js` (wire + debug API), `src/systems/explosives.js` (`shake(mult)`), `README.md` (mục P3), `docs/BALANCE.md` (C) | §5, §6 |

Hai builder KHÔNG đụng file của nhau, trừ audio.js (P3-K12 — block rời nhau).

---

## 3. TÍNH NĂNG A — BOSS "NGUỒN GỐC"

### 3.0 SPEC A (nguyên văn yêu cầu)

> - MỤC TIÊU CỐT TRUYỆN: nhiệm vụ 9 "Cánh Cửa Cuối" (reach cửa thép trung tâm (0,0)) hoàn thành → CỬA VAULT MỞ (city.js có sẵn vault door — thêm hook openVault(): cửa trượt lên 2s + rumble + ánh sáng đỏ bên trong) → NHIỆM VỤ 10 "Nguồn Gốc" bắt đầu: Origin TRỔ DẬY từ vault (spawn animation 2.5s: đi lên từ dưới đất + gầm + rung màn hình) trong quarantine.
> - createOrigin(scene, bus, city) → instance cùng mặt ngoài boss thường (alive, hp, group, position, update(dt, player, level, others), takeDamage(d, headshot) → boolean, dispose(), userData.part head/body, chết phát "zombie-killed" {type:"origin", score:5000, ...}).
> - hp 3000 (không scale theo wave — trận cuối); 3 PHASE theo máu, chuyển phase: bất tử 1.5s + gầm + nhấp nháy trắng + rung màn hình:
>   - P1 (100–66%): ĐẬP ĐẤT mỗi 5s (vòng sóng 8m, 30 dmg, như golem) + mỗi 12s triệu 4 walker quanh mình.
>   - P2 (66–33%): thêm MƯA ACID mỗi 9s — 5 vũng acid rơi ngẫu nhiên trong 15m quanh player (6 dmg/s, 4s, như spitter) + HÚC mỗi 8s như butcher (35 dmg, 12m, telegraph 0.7s phát sáng).
>   - P3 (<33%): NỒNG TỐ — tốc độ ×1.5, mọi cooldown ×0.7, thân phát sáng đỏ, thêm sóng xung kích liên tục mỗi 3s (vòng 6m, 15 dmg).
> - Trong trận: sự kiện scheduler TẠM DỪNG (events.js nghe "origin-alive" {alive} — không event mới trong trận); boss wave thường vẫn chạy nhưng Origin ưu tiên.
> - Chết: nổ lớn (particles + flash + shake), rơi $2000 (economy qua "zombie-killed" money table — thêm origin 2000), phát "origin-defeated" {timeSec, damageTaken} → MÀN KẾT (phần B). Player chết giữa trận → boss hồi đầy máu + rút về vault (reset fight).
> - missions.js MỞ RỘNG: nhiệm vụ 10 {type:"boss"} nhắm Origin — complete khi nghe "origin-defeated"; dialogue m10 (Giọng Radio: "Đó... đó là thứ đã bắt đầu tất cả. Diệt nó. Cứu tất cả chúng tôi.") EN/VI vào STORY_DIALOGUE + i18n; thưởng nhiệm vụ 600.

### 3.1 origin.js — API (chữ ký frozen)

```js
import { createOrigin } from "./zombies/origin.js";
/** @returns {Origin} */ const origin = createOrigin(scene, bus, city);
```

```js
/**
 * @typedef {Object} Origin
 * @property {boolean} alive
 * @property {number} hp          // 3000 (NG+: 3750 — P3-K9)
 * @property {number} maxHp
 * @property {"P1"|"P2"|"P3"} phase
 * @property {"rising"|"fight"|"transition"|"dead"} state
 * @property {THREE.Group} group
 * @property {THREE.Vector3} position  // mirrors group
 * @property {string} type        // "origin" (payload bus + economy/hud)
 * @property {number} score       // 5000
 * @property {(dt: number, player: Player, level: Level, others: Zombie[]) => void} update
 * @property {(d: number, headshot: boolean) => boolean} takeDamage
 * @property {() => void} dispose
 */
```

- Cài đặt: `Origin extends BossZombie` (`bosses.js:211`) để kế thừa flash/fade/voice/`_bodyMat`/`_fxMat`/`_addExtra`/`_moveXZ`/`_stepGait`/`_face`/`_distTo`/`_tryMelee`/`_decayCommon`/`_setGlow`/`_roar`/`_die`/`boss-drops`. Gọi `super(scene, 1, position, bus, ORIGIN_DEF)` rồi override `maxHp/hp = 3000` (KHÔNG nhân `×(1+wave/20)` — ghi đè sau super vì BossZombie nhân theo wave, `bosses.js:229`).
- `takeDamage`: GIẢM KHÔNG xuyên suốt (không có golem-reduce). Trả `false` khi `state === "rising" | "transition"` (bất tử — spawn 2.5 s và chuyển phase 1.5 s) hoặc đã chết. `state === "dead"`: `false`.
- Vòng đời chết (kế thừa `_die`, override để thêm): thứ tự phát event trong MỘT lần `takeDamage` kết liễu:
  1. `super._die(headshot)` → **"zombie-killed"** `{type:"origin", score:5000, headshot, position}` (+ kế thừa "boss-drops" `{position, kinds:["health","ammo"], boss:"origin"}` — vô hại, main route như boss thường) + "zombie-voice" `{kind:"death"}`;
  2. **"origin-alive"** `{alive:false}`;
  3. **"origin-defeated"** `{timeSec, damageTaken}` — `timeSec` = số giây từ lúc rise xong đến chết (giây, 1 chữ số thập phân), `damageTaken` = tổng dmg toàn trận (biến đếm trong takeDamage).
- Animation chết: KHÔNG dùng fall-and-fade 1.5 s của zombie thường — override `_die`/death-step: đứng tại chỗ, nghiêng chậm + chìm + fade 3.0 s, xong `super._finishDespawn()` (giữ "zombie-despawned"). Nổ lớn do main làm (P3-K8), không phải origin.js.
- `dispose()`: gỡ mọi world-FX (pool/ring/acid) + listener bus + phát "origin-alive" `{alive:false}` **nếu đang sống** (freshRun drain — events phải mở scheduler lại, P3-K7).
- Rise (spawn): `state = "rising"` 2.5 s, `group.position.y` từ **−4.5 → 0** (ease-out), gầm "boss-roar" `{type:"origin", action:"rise"}` ở t≈0.5 s, `group` hiện dần từ dưới sàn. Xong → `state = "fight"`, `phase = "P1"`.

### 3.2 Bảng PHASE (số FROZEN)

| Phase | Máu | Đòn (cd tính từ lần trước, đòn đầu = "first" sau khi vào phase) |
|---|---|---|
| **P1** | 100–66% (hp > 1980) | ĐẬP ĐẤT cd 5.0 s (first 3.0): ring nở 8 m / 0.6 s (hệ số golem `bosses.js:969-994`), player bị quét ĐÚNG 1 LẦN khi ring chạm: 30 dmg + hất bay (`velocity.y = 8`, đẩy ngang 6). TRIỆU cd 12.0 s (first 6.0): 4 walker quanh mình bán kính 2.5 m, `new Zombie(scene,"walker",…,bus)` + `summoned = true` + **"zombie-spawned"** `{zombie}` (đúng hệ screamer `bosses.js:835-858`). |
| **P2** | 66–33% (990 < hp ≤ 1980) | Giữ P1. Thêm MƯA ACID cd 9.0 s (first 4.0 sau khi vào P2): 5 vũng, điểm rơi NGẪU NHIÊN ≤ 15 m quanh **player** (jitter, skip `isBlocked`, fallback điểm xa nhất — pattern `events.js:506-524`); mỗi giọt rơi từ y 12 → đất trong 0.8 s rồi thành vũng: bán kính 1 m ("2 m" theo spec), 4 s, 6 dmg/s = 3 dmg mỗi 0.5 s tick (hệ số spitter `bosses.js:702-763`). Thêm HÚC cd 8.0 s (first 3.0): telegraph 0.7 s đứng yên + phát sáng đỏ (`_setGlow(true)`) + roar, rồi lao THẲNG 12 m (tối đa) tốc 10 m/s, chạm player (< 1.5 m): 35 dmg + knockback `velocity.x/z += dir·12`, `y += 4`; hết 12 m hoặc tường → dừng. |
| **P3** | < 33% (hp ≤ 990) | speed ×1.5 (1.6 → 2.4; NG+ nhân trước rồi ×1.5), MỌI cooldown ×0.7 (đập 3.5 / triệu 8.4 / mưa 6.3 / húc 5.6), thân phát sáng ĐỎ (`_setGlow(true)` đỏ đậm, giữ đến chết), thêm SÓNG XUNG KÍCH cd 3.0 s (first 1.0 sau khi vào P3): ring 6 m / 0.4 s, 15 dmg (KHÔNG hất bay). |

- Ngưỡng phase tính trên `hp/maxHp` tại thời điểm `takeDamage` — rơi qua ngưỡng → `state = "transition"` 1.5 s: bất tử + "boss-roar" `{type:"origin", action:"phase"}` + nhấp nháy TRẮNG (emissive trắng ×3 nhịp trong 1.5 s rồi về base — P3 thì đỏ) + main phát shake (Origin phát **"origin-shake"** `{power:1}` phase / `{power:2}` chết; main nghe → `explosives.shake(power)` — P3-K8).
- Đòn cận chiến thường: melee 30 dmg, tầm 1.6 m, cd 1.0 s (dùng `_tryMelee` — `bosses.js:404-414`).

### 3.3 Số builder chọn (ghi để review — không thuộc spec)

| Hằng | Giá trị | Lý do |
|---|---|---|
| scale | 2.6 | Lớn nhất game (golem 2.2) — "nguồn gốc" của mọi zombie |
| speed base | 1.6 m/s | Chậm hơn golem 1.2? KHÔNG — nhanh hơn chút để P1 không thụ động; P3 ×1.5 = 2.4 |
| melee dmg | 30 | Giữa brute 35 và golem 30 |
| skin/cloth/pants | `0x3a1418 / 0x1d0d12 / 0x120608` | Đỏ bầm gần đen; mắt giữ đỏ cam kế thừa |
| charge speed | 10 m/s | Butcher 11 — Origin to hơn nên chậm hơn chút |
| charge contact | 1.9 m | 0.4·2.6 + 0.4 + slack |
| rise depth | −4.5 m / 2.5 s | Nhìn thấy được từ xa, không xuyên tường (arena 60×60, cửa ở (0,0) cách tường 30 m) |
| acid fall | y 12 → 0, 0.8 s | Đủ cao để thấy quỹ đạo, không vượt trần silhouette |

### 3.4 city.js + level.js — vault mở

- **level.js** (Builder A): private hook phi-liệt-kê **`__vaultOpen(open)`** trên API trả về của `createLevel`:
  - `open === true`: disc vault (`level.js:593`) trượt **lên** `position.y 0 → 8` trong **2.0 s** (ease-in, rAF loop như city gate anim — `city.js:1433-1446`); rumble synth cục bộ (pattern `createGateSound` `city.js:522-601`, pitch thấp hơn ~30%); **PointLight đỏ** `0xff3b30, intensity 0 → 30, distance 25` tại `(0, 1.5, 0)` fade-in trong 2 s rồi GIỮ; khi animation xong: splice collider `{minX:-2,maxX:2,minZ:-2,maxZ:-2}` khỏi `level.colliders` + remove disc khỏi scene (geometry/material vẫn thuộc danh sách dispose của level — KHÔNG dispose ở đây).
  - `open === false` (đường reset): làm ngược tức thời (≤ 0.5 s trượt xuống), push lại collider, tắt light, disc trở lại.
  - Idempotent: gọi `__vaultOpen(true)` hai lần → lần sau no-op.
- **city.js** (Builder A): method CÔNG KHAI mới trên api trả về (`city.js:1481`):

```js
/**
 * Mở/đóng cửa vault (0,0) — ủy quyền level.__vaultOpen (P3-K1).
 * @param {boolean} [open=true]
 * @returns {boolean} true khi trạng thái THẬT SỰ đổi (idempotent)
 */
function openVault(open = true) { /* … */ }
```

  Thêm `openVault` vào typedef `City` như property thứ 5 (additive P3). Không event bus (main tự gọi sau "mission-complete"/trước spawn).

### 3.5 events.js — đóng băng scheduler

- Nghe **"origin-alive"** `{alive}` → cờ `originFight = d.alive === true`.
- `tickScheduler(dt)` (`events.js:1088-1099`): dòng ĐẦU tiên thêm `if (originFight) return;` — **không giảm nextTimer, không start event mới** (đúng chữ "TẠM DỪNG"). Event ĐANG chạy (supply/survivor/horde/bloodmoon) tiếp tục đếm tự nhiên đến "event-end" — chỉ chặn event MỚI.
- `reset()` đặt lại `originFight = false` (fresh-run state).
- Bloodmoon đang chạy lúc mở trận → cứ để nó kết thúc tự nhiên; ×2 tiền của kill origin là hành vi economy hiện có, KHÔNG special-case (ghi nhận ở BALANCE.md).

### 3.6 economy.js — một dòng

`REWARDS` (`economy.js:70-78`) thêm `origin: 2000`. Headshot ×1.5 và bloodmoon ×2 áp như mọi loại (không chặn).

### 3.7 missions.js — nhiệm vụ 10

1. `MISSION_DEFS` thêm:
   `{ titleKey: "mission10_title", district: "quarantine", reward: 600, gates: [], objectives: [{ type: "boss" }] }`.
2. `BOSS_TYPES` (`missions.js:349`) += `origin: true` (P3-K3/1).
3. Nghe **"origin-defeated"** → tìm objective `type === "boss"` chưa complete của nhiệm vụ đang chạy → `setProgress(o, 1)` → `checkMissionComplete()` (P3-K3/2).
4. Ripple giá trị `current` (P3-K2): `checkMissionComplete` đổi `if (index >= 9)` → `if (index >= MISSION_DEFS.length)` (10 nhiệm vụ → `current = 11` = free-roam); mọi guard `1..9` trong `currentObjectives/onZombieKilled/onPress/update/beaconTarget/getState/skipToMission` nới thành `1..10`; `skipToMission` nhận `1..10` (skip 10 = kích hoạt m10; world spawn Origin do main xử lý qua "mission-start").
5. i18n: thêm `mission10_title` (bảng §7.2); sửa `mission_progress` `{n}/9` → `{n}/10` (EN + VI).
6. `STORY_DIALOGUE` thêm `m10` (bảng §7.3 — 3 dòng start, `done: []` như m9).

### 3.8 audio.js — RECIPES.origin (Builder A, block riêng P3-K12)

Thêm row `origin:` vào `RECIPES` (`audio.js:340-598`) — 6 kind + 2 action phụ, đủ chữ ký `(o, m, d)`:
- idle: wobble saw 28–40 Hz + sub 20 Hz sine, 2.5–3.5 s, cutoff 110, drive 30 (grinder của brute).
- alert/chase: groan thấp 35–50 Hz, 0.9–1.2 s.
- attack (dùng cho roar slam/húc/xung kích): thud noise lowpass 120 Hz + wobble 45→28, 0.8 s, drive 30.
- pain: wobble 90→45 Hz 0.35 s.
- death: sập tolong — noise 300→60 1.5 s + wobble 40→22 1.4 s + sub 24 Hz.
- `rise` / `phase` (action riêng, audio.playBossRoar đã route mọi action ≠ "shriek" → kind "attack" — `audio.js:739`: giữ nguyên, recipe attack đủ dùng; KHÔNG sửa playBossRoar).

### 3.9 Trận đấu — timeline chuẩn (kiểm thử theo đây)

```
m9 reach (0,0) → "mission-complete" {index:9} (KHÔNG còn outro — P3-K4)
  → cascade "mission-start" {index:10, titleKey:"mission10_title", objectives:[boss]}
  → main: city.openVault()            // cửa trượt lên 2 s + rumble + đèn đỏ
  → main: spawnOriginInternal()       // createOrigin + debugZombies + "zombie-spawned"
  │                                   //   + "boss-spawned" {type:"origin", zoneId:"quarantine", hp}
  → Origin tự phát "origin-alive" {alive:true}   // events đóng băng scheduler
  → 2.5 s rise (bất tử) → "fight" P1
  → 66% / 33%: transition 1.5 s + "origin-shake" {power:1}
  → chết: "zombie-killed" {type:"origin", score:5000} → "origin-alive" {alive:false}
          → "origin-defeated" {timeSec, damageTaken}
  → main: particles + shake(2)      ;  ending: chuỗi kết (§4)
```

---

## 4. TÍNH NÁNG B — MÀN KẾT + NEW GAME+

### 4.0 SPEC B (nguyên văn yêu cầu)

> - Nghe "origin-defeated" → chuỗi kết: 2s slow-zoom camera + chopper synth tới dần (audio.js: tiếng trực thăng rotor synth + sting chiến thắng) → fade trắng 2s → MÀN KẾT: "GIẢI CỨU — NGÀY 31" + thống kê (thời gian chơi, số kill, tổng tiền kiếm được, số lần chết, boss đã hạ) + dòng kết "Thành phố vẫn thức giấc. Và bạn vẫn ở đây." + 3 nút: "CHƠI TIẾP — THẾ GIỚI MỞ" (tiếp tục roam thế giới hiện tại, mọi nhiệm vụ done, sự kiện vẫn chạy) / "NEW GAME+" (giữ TIỀN + SÚNG ĐÃ SỞ HỮU + settings, reset thế giới/nhiệm vụ/về nhiệm vụ 1, zombie hp+25% tốc độ+10% — cờ ngPlus đọc từ gamestate) / "VỀ MENU".
> - gamestate.js: pause reason "ending" trong suốt chuỗi (dùng cơ chế addPause có sẵn); trạng thái NG+ và stats qua gamestate (stats gom từ bus events: kills nghe "zombie-killed", money kiếm được nghe "money-changed" delta dương, deaths nghe "player-died", thời gian từ startStory).
> - audio.js: chopperSynth(start/stop) + victorySting(); mọi thứ synth WebAudio.
> - menus.js: thêm nút NG+ vào gameover? KHÔNG — chỉ trong màn kết; gameover giữ nguyên.

### 4.1 ending.js — API (chữ ký frozen)

```js
import { createEnding } from "./ui/ending.js";
const ending = createEnding(uiRoot, bus, gamestate, audio, i18n, camera);
```

```js
/**
 * @typedef {Object} Ending
 * @property {(dt: number) => void} update   // main gọi MỖI FRAME, mọi state
 *     (self-guard khi idle — phải chạy cả khi paused vì chuỗi kết diễn ra
 *     dưới pause reason "ending"; đặt LỒI ngoài các nhánh state của frame()).
 * @property {() => void} hide               // dọn overlay + chopper + FOV; idempotent
 * @property {() => boolean} isActive
 */
```

- `container` = `#ui` (`pointer-events: none`) — panel kết BẬT `pointer-events: auto` cho chính nó (pattern `menus.js:1-4`); overlay trắng fade thì KHÔNG bắt sự kiện.
- Không đụng renderer/scene: slow-zoom = **FOV** `camera.fov 75 → 55` trong 2 s (ease), restore 75 trong `hide()`. Chụp `const baseFov = camera.fov` lúc bắt đầu chuỗi.

### 4.2 Chuỗi kết — state machine

| Phase | Thời gian | Việc |
|---|---|---|
| IDLE | — | chờ "origin-defeated". |
| APPROACH | 2.0 s | phát **"ending-active" `{active:true}`** (gamestate pause "ending"); `audio.chopperSynth("start")`; FOV lerp 75→55. |
| FADE | 2.0 s | overlay trắng `opacity 0→1` (div fixed full-screen, `transition: opacity 2s`); `audio.victorySting()` tại ĐẦU phase; chopper nền nhỏ dần (gain ×0.4). |
| SCREEN | chờ nút | panel hiện: kicker + `ending_title` + 5 hàng stats (bảng §4.3) + `ending_line` + 3 nút (bảng §4.4). Chopper giữ nền nhẹ đến khi rời màn. |
| ra khỏi SCREEN (mọi nút) | — | `hide()`: chopperSynth("stop") + FOV 75 + phát **"ending-active" `{active:false}`** + gỡ overlay. |

- Nghe **"origin-defeated"** bất kể nội dung payload (kể cả `{debug:true}` của skipToEnding).
- Mỗi "origin-defeated" chỉ bắt đầu chuỗi 1 lần (cờ `started` — reset trong `hide()`).
- Live language switch giữa chừng: text render qua `i18n.t()` tại lúc vào SCREEN là đủ (không cần rebind).

### 4.3 Stats (nguồn P3-K11 — `gamestate.runStats()`)

| Hàng | Key | Nguồn |
|---|---|---|
| Thời gian chơi | `ending_stat_time` | `runStats().timeSec` — hiển thị `mm:ss` |
| Số kill | `ending_stat_kills` | `gamestate.kills` (mirror) |
| Tổng tiền kiếm được | `ending_stat_money` | `runStats().moneyEarned` (Σ delta dương "money-changed") |
| Số lần chết | `ending_stat_deaths` | `runStats().deaths` (đếm "player-died") |
| Boss đã hạ | `ending_stat_bosses` | `runStats().bossesKilled` (4 boss + origin) |

### 4.4 Ba nút → bus (P3-K13)

| Nút | i18n | Bus event | main.js làm (§6.3) |
|---|---|---|---|
| CHƠI TIẾP — THẾ GIỚI MỞ | `ending_btn_continue` | `"ui-continue"` | `ending.hide()` đã tự chạy qua listener ending-active false; gamestate rơi về "playing" (bỏ pause "ending"); `input.lockPointer()`. Thế giới GIỮ NGUYÊN: m11 = free-roam, sự kiện scheduler đã mở lại ("origin-alive" false), kill tiền bình thường. |
| NEW GAME+ | `ending_btn_ngplus` | `"ui-ngplus"` | `beginNGPlus()` (§4.5). |
| VỀ MENU | `ending_btn_menu` | `"ui-quit"` (ĐÃ CÓ) | đường cũ `main.js:669-672`: `freshRun()` + `gamestate.toMenu()`. |

### 4.5 gamestate.js — additive (Builder B)

1. `PauseReason` typedef += `"ending"`; nghe **"ending-active"** → `addPause/removePause("ending")` (P3-K10).
2. `gamestate.ngPlus = false` (property); KHÔNG tự đổi — main set.
3. **`runStats()`** (P3-K11) + bộ đếm: listener `"money-changed"` `{delta}` → `delta > 0` thì `moneyEarned += delta`; listener `"player-died"` → `deaths += 1` (song song listener hiện có); `"zombie-killed"` → nếu `type ∈ BOSS_SET {butcher, spitter, screamer, golem, origin}` thì `bossesKilled += 1`. `freshRun()` (body chung của start/startStory/restart) đặt `moneyEarned = 0; deaths = 0; bossesKilled = 0; runStartAt = performance.now()`. `timeSec = Math.floor((performance.now() − runStartAt)/1000)`.
4. `freshRun()` KHÔNG đụng `ngPlus` (main quản lý — P3-K9).

### 4.6 audio.js — chopperSynth + victorySting (Builder B, block cuối P3-K12)

```js
/** Rotor trực thăng: bed noise lowpass 240 Hz AM bởi LFO 13 Hz (độ sâu 0.7)
 *  + thump 26 Hz mỗi chu kỳ LFO; gain 0 → 0.22 trong 2 s ("tới dần") rồi giữ.
 *  mode "stop": gain → 0 trong 0.8 s rồi gỡ node. Không ctx → no-op. */
function chopperSynth(mode) {} // mode: "start" | "stop"
/** Sting chiến thắng: chord saw C-G-C (130.8/196/261.6 Hz) swell 0.15→0.28
 *  trong 0.4 s, hold 1.2 s, decay 1.6 s + sub 65 Hz; qua lowpass 900 Hz. */
function victorySting() {}
```

Cả hai vào object trả về (`audio.js:1032-1047`) + 2 dòng typedef `Audio` (`chopperSynth(mode: "start"|"stop") => void`, `victorySting() => void`).

### 4.7 waves.js — NG+ nhân hệ số (Builder B)

Nghe **"ng-plus"** `{active}` → cờ `ngPlus = d.active === true`. Áp cho ĐƠN VỊ MỚI TẠO:
- zombie thường (mọi spawn path kể cả burst/boss-burst): sau `new Zombie(...)`: `z.hp = Math.round(z.hp * 1.25); z.speed = z.speed * 1.1;`
- boss: sau khi tạo: `boss.maxHp = Math.round(boss.maxHp * 1.25); boss.hp = boss.maxHp; boss.speed *= 1.1;`
- `reset()`: `ngPlus = false` (main phát lại "ng-plus" `{active:true}` khi vào run NG+ — §6.3).

---

## 5. TÍNH NĂNG C — CÂN BẰNG TOÀN CỤC (docs/BALANCE.md — integrator)

Integrator ĐỐI CHIẾU bằng gameplay thật (debug API + stopwatch) và viết **docs/BALANCE.md** — khung bắt buộc:

### 5.1 Chuỗi tiền (bảng phải có trước → sau)

| Nguồn | Giá trị hiện tại (đã đọc code) |
|---|---|
| Thưởng nhiệm vụ m1..m10 | 300 / 325 / 350 / 400 / 425 / 450 / 500 / 550 / 600 / **600 (m10 — P3)** (`missions.js:392-480` + §3.7) |
| Kill money | walker 50 / runner 75 / brute 200 / butcher 1000 / spitter 800 / screamer 700 / golem 1500 / **origin 2000 (P3)** (`economy.js:70-78`) |
| Supply event | 200–400 + medkit + full ammo (`main.js:286-300`) |
| Survivor | 300 + medkit (`main.js:380-386`) |
| Boss drop | 1 medkit + 1 ammo (`bosses.js:308-322`) |
| Shop | smg 400 / sniper 800 / minigun 1500 / grenade 1200 / ammo 150 / medkit 200 (`shop.js:90-95`) |

Mục tiêu kiểm chứng: **đến nhiệm vụ 6 đủ mua ≥ 3/4 súng mới; đến Nguồn Gốc đủ full arsenal (3900$) + dư ~500.** Tính tổng lý thuyết: m1–m6 thưởng 2250 + kill quota (20+25+25+30 ≈ 100 kills ∼ trung bình 85$ ≈ 8500) — chênh lệch với thực tế (player không nhặt sạch) → ghi số ĐO thực tế 3 lượt (skipToMission là lưới đo), nếu lệch mục tiêu thì điều chỉnh DUY NHẤT ở: reward nhiệm vụ (bậc +25), hoặc spawn density khu — **KHÔNG đụng giá shop** (spec froze). Mỗi thay đổi: dòng "trước → sau + lý do".

### 5.2 HP/speed vs hỏa lực

Bảng đối chiếu: 3 loại thường (100/60/400 hp; 2.2/5.0/1.4 m/s — `zombie.js:82-86`) × scale wave (×(1+wave/20) chỉ boss — `bosses.js:229`), 4 boss (1200/800/600/2000), Origin 3000, so với DPS 7 súng (đọc `weapons.js`, ghi dmg × rof thực đo). Ràng buộc: **không phase nào của Origin "cấn" quá 90 s** (P1 1980 hp / P2 990 / P3 2010 — đo DPS endgame 25–40/s → mỗi phase 25–80 s; nếu vượt 90 s → điều chỉnh cooldown P3 (×0.7 → ×0.65) hoặc hp Origin (3000 → 2600), ghi trước → sau).

### 5.3 Density + nhịp khu

Quota 20/25/30/25/30 (`missions.js:408-451`) + density ×2/3 (`waves.js:157`) — đo 3–5 phút/khu bằng `skipToMission` + đồng hồ; ghi bảng khu → phút đo → đạt/chưa; chạm thì chỉnh SPAWNS pool (city.js) hoặc gap waves, KHÔNG đụng quota need (P1 froze).

---

## 6. TÍNH NĂNG D — WIRE & DEBUG (integrator)

### 6.1 Khởi tạo

- `import { createOrigin } from "./zombies/origin.js";` + `import { createEnding } from "./ui/ending.js";`
- `const ending = createEnding(uiRoot, bus, gamestate, audio, i18n, camera);` — sau `map` (`main.js:308`), trước khối bus wiring.
- Origin KHÔNG tạo lúc boot — chỉ trong `spawnOriginInternal()`:

```js
let originRef = null; // tách bossRef (P3-K6)
function spawnOriginInternal() {
  if (originRef && originRef.alive) return { error: "origin-alive" };
  city.openVault();
  const origin = createOrigin(scene, bus, city);
  debugZombies.push(origin);
  bus.dispatchEvent(new CustomEvent("zombie-spawned", { detail: { zombie: origin } }));
  bus.dispatchEvent(new CustomEvent("boss-spawned",
    { detail: { type: origin.type, zoneId: "quarantine", hp: origin.hp } }));
  originRef = origin;
  return { type: origin.type, hp: origin.hp, maxHp: origin.maxHp };
}
```

- Listener main MỚI:
  - `"mission-start"`: thêm `if (idx === 10) spawnOriginInternal();` (bên cạnh `idx === 8` — `main.js:734`). XÓA khối `idx === 9 → showOutro` trong "mission-complete" (P3-K4).
  - `"origin-defeated"` → `originRef = null;` + `particles.spawnBlood(pos,40) + spawnSpark ×3 + explosives.shake(2)` (P3-K8).
  - `"origin-shake"` `{power}` → `explosives.shake(power)`.
  - `"player-died"` → `originRef = null` (P3-K7).
  - `"ui-continue"` → `input.lockPointer();` (state tự về "playing" khi ending-active false).
  - `"ui-ngplus"` → `beginNGPlus()`.
- `bossRef`/HUD/map: mọi chỗ đọc `bossRef` (`hudExtras`, `mapExtras`, `damageBoss`, `getState().boss`) **ưu tiên `originRef && originRef.alive ? originRef : bossRef`** — helper `liveBoss()` trả 1 trong 2.
- freshRun: thêm `city.openVault(false);` cạnh `closeAllCityGates()`; `ending.hide();`.
- Main loop: `ending.update(dt);` ngoÀi các nhánh state (sau `engine.update()`, trước `engine.render()`).

### 6.2 explosives.shake (additive 1 method)

```js
/** Camera shake MANUAL cho P3 (origin phase/death) — tái dùng máy shake nội bộ.
 *  @param {number} [mult=1] hệ số thời gian+biên độ (0.5 = nhẹ, 2 = mạnh) */
function shake(mult) { /* shakeT = SHAKE_TIME * clamp(mult,0.25,3); … */ }
```
Vào object trả về + typedef.

### 6.3 beginNGPlus() (P3-K15) — thứ tự CHÍNH XÁC

```js
function beginNGPlus() {
  const owned = shop.owned();              // bắt id TRƯỚC khi reset
  storyMode(false);
  freshRun(true);                          // economy giữ (story-keep đường §5.6.3)
  storyRun = true;                         // chết-restart NG+ vẫn giữ tiền
  shop.reset();                            // trong freshRun(true) — xóa Set nội bộ
  for (const id of owned) {                // mở lại SÚNG đã sở hữu (weapons.js:23)
    const w = weapons.list.find((x) => x.name === id);
    if (w) w.owned = true;
  }
  missions.reset();                        // về nhiệm vụ 1 (freshRun(true) đã skip)
  closeAllCityGates();                     // freshRun(true) đã skip
  gamestate.ngPlus = true;
  bus.dispatchEvent(new CustomEvent("ng-plus", { detail: { active: true } }));
  storyMode(true);
  gamestate.start();                       // → playing (KHÔNG intro slides — P3-K13)
  missions.begin();                        // m1 + "mission-start"
}
```
Settings giữ nguyên tự nhiên (không đụng settings). `beginFreshStory()` và nhánh `ui-play-free` đặt `gamestate.ngPlus = false;` + phát `"ng-plus" {active:false}` (reset quy tắc P3-K9).

### 6.4 Debug API BỔ SUNG (debugApi — `main.js:1223`)

| Hàm | Hành vi + return |
|---|---|
| `spawnOrigin()` | Đảm bảo run sống (`playing|paused` — nếu menu/intro thì `beginFreshStory(); gamestate.beginPlay(); dialogue.hide();`), `missions.skipToMission(10)` (mở đủ cổng + m10 active + "mission-start" 10 → tự spawn qua listener), nếu sau đó `originRef` vẫn null (đã m10 từ trước) → gọi `spawnOriginInternal()` trực tiếp. Return `{ok, hp, maxHp, phase}`. |
| `damageOrigin(n)` | `!originRef || !originRef.alive` → `{error:"no-origin-alive"}`; else `originRef.takeDamage(Number(n)||100, false)` → `{hp, maxHp, phase, killed}`. |
| `originState()` | `originRef` → `{alive, phase, hp, maxHp, state}`; không → `{alive:false}`. |
| `skipToEnding()` | Đảm bảo run sống như trên; nếu `originRef && originRef.alive` → `takeDamage(originRef.hp + 1, false)` (đường chết THẬT); else phát `"origin-defeated"` `{timeSec:0, damageTaken:0, debug:true}` (P3-K14). Return `{state: gamestate.state, ending: ending.isActive()}`. |
| `getState()` | thêm `origin: originRef && originRef.alive ? {alive:true, phase: originRef.phase} : null` và `ngPlus: gamestate.ngPlus === true`. |

### 6.5 README.md (cuối file — fixer/integrator)

Mục **"ĐÊM THỨ 30 — Phần 3: Nguồn Gốc & Kết thúc"**: (1) bảng 3 phase boss (dùng nguyên bảng §3.2) + 3 mẹo đánh (di chuyển ngang khi húc — telegraph 0.7 s; đứng ngoài vũng acid 2 m; P3 giữ khoảng cách ≥ 7 m tránh sóng 6 m); (2) màn kết + New Game+ (3 nút làm gì, NG+ giữ gì/mất gì, hệ số 1.25/1.1); (3) bảng cân bằng tóm tắt (trích BALANCE.md §5.1); (4) cập nhật bảng Debug API: `spawnOrigin(), damageOrigin(n), originState(), skipToEnding()` + ghi chú `getState() += {origin, ngPlus}`.

---

## 7. Bảng event bus MỚI + key i18n

### 7.1 Event bus (emitted by → consumed by)

| Event | Payload | Phát bởi | Nghe bởi |
|---|---|---|---|
| `origin-alive` | `{alive: boolean}` | origin.js (constructor sau rise-bắt-đầu = true; chết/dispose = false) | events.js (đóng băng scheduler) |
| `origin-defeated` | `{timeSec: number, damageTaken: number, debug?: boolean}` | origin.js (sau "origin-alive" false) | ending.js (chuỗi kết), missions.js (m10 objective), main.js (FX + originRef=null) |
| `origin-shake` | `{power: number}` (1 = phase, 2 = chết) | origin.js | main.js → `explosives.shake(power)` |
| `boss-roar` | `{type:"origin", action:"rise"|"phase"|"attack"}` | origin.js (kế thừa `_roar`) | audio.js (đã có — P2) |
| `boss-spawned` | `{type:"origin", zoneId:"quarantine", hp}` | main.js (spawnOriginInternal) | hud (đã có), main (bossRef path) |
| `ng-plus` | `{active: boolean}` | main.js | waves.js, origin.js (hệ số đơn mới) |
| `ending-active` | `{active: boolean}` | ending.js | gamestate.js (pause "ending") |
| `ui-continue` | `{}` | ending.js (nút) | main.js |
| `ui-ngplus` | `{}` | ending.js (nút) | main.js |

### 7.2 Key i18n — missions.js (Builder A, EN + VI NGUYÊN VĂN)

| Key | EN | VI |
|---|---|---|
| `mission10_title` | `The Origin` | `Nguồn Gốc` |
| `mission_progress` | `MISSION {n}/10` *(sửa từ /9)* | `NHIỆM VỤ {n}/10` |

### 7.3 STORY_DIALOGUE.m10 (missions.js — Builder A)

```js
m10: {
  start: [
    { speaker: "radio", key: "m10_radio_line1" },
    { speaker: "radio", key: "m10_radio_line2" },
    { speaker: "you",   key: "m10_you_line1" },
  ],
  done: [], // màn kết thay thoại done (P3-K4)
},
```

| Key | EN | VI |
|---|---|---|
| `m10_radio_line1` | `There... that's the thing that started all of this.` | `Đó... đó là thứ đã bắt đầu tất cả.` |
| `m10_radio_line2` | `Kill it. Save every one of us.` | `Diệt nó. Cứu tất cả chúng tôi.` |
| `m10_you_line1` | `One last job. For all of them.` | `Việc cuối cùng thôi. Vì tất cả bọn họ.` |

### 7.4 Key i18n — ending.js (Builder B, EN + VI NGUYÊN VĂN)

| Key | EN | VI |
|---|---|---|
| `ending_title` | `RESCUE — DAY 31` | `GIẢI CỨU — NGÀY 31` |
| `ending_line` | `The city still wakes. And you are still here.` | `Thành phố vẫn thức giấc. Và bạn vẫn ở đây.` |
| `ending_btn_continue` | `KEEP PLAYING — OPEN WORLD` | `CHƠI TIẾP — THẾ GIỚI MỞ` |
| `ending_btn_ngplus` | `NEW GAME+` | `NEW GAME+` |
| `ending_btn_menu` | `MAIN MENU` | `VỀ MENU` |
| `ending_stat_time` | `Time` | `Thời gian` |
| `ending_stat_kills` | `Kills` | `Số kill` |
| `ending_stat_money` | `Money earned` | `Tổng tiền kiếm được` |
| `ending_stat_deaths` | `Deaths` | `Số lần chết` |
| `ending_stat_bosses` | `Bosses down` | `Boss đã hạ` |

---

## 8. Checklist hội quy — tích tên khi xong

**Builder A**
- [ ] `src/zombies/origin.js` — createOrigin + 3 phase + rise + death + dispose + "origin-alive"/"origin-defeated"/"origin-shake" + NG+ listener
- [ ] `src/world/level.js` — `__vaultOpen(open)` (2 s trượt lên + rumble + đèn đỏ + splice collider + idempotent + đường close)
- [ ] `src/world/city.js` — `openVault(open?)` công khai + typedef
- [ ] `src/systems/missions.js` — m10 def + BOSS_TYPES.origin + "origin-defeated" listener + current 1..10/11 + i18n + STORY_DIALOGUE.m10
- [ ] `src/systems/events.js` — nghe "origin-alive", tickScheduler early-return, reset cờ
- [ ] `src/systems/economy.js` — `REWARDS.origin = 2000`
- [ ] `src/core/audio.js` — `RECIPES.origin` (block riêng, P3-K12)

**Builder B**
- [ ] `src/ui/ending.js` — chuỗi APPROACH/FADE/SCREEN + stats + 3 nút + hide idempotent + i18n
- [ ] `src/systems/gamestate.js` — pause "ending" + `ngPlus` + `runStats()` + đếm money/deaths/bosses + reset trong freshRun
- [ ] `src/core/audio.js` — `chopperSynth("start"|"stop")` + `victorySting()` + typedef (block cuối, P3-K12)
- [ ] `src/zombies/waves.js` — nghe "ng-plus" + ×1.25 hp / ×1.1 speed cho đơn mới + reset cờ

**Integrator**
- [ ] `src/main.js` — ending khởi tạo + `ending.update(dt)` ngoài nhánh state + spawnOriginInternal + listener mission-start 10 / origin-defeated / origin-shake / player-died / ui-continue / ui-ngplus + beginNGPlus + liveBoss() ưu tiên origin + freshRun thêm `city.openVault(false)` + `ending.hide()`
- [ ] `src/systems/explosives.js` — `shake(mult)` additive
- [ ] Debug API: `spawnOrigin / damageOrigin / originState / skipToEnding` + `getState() += {origin, ngPlus}`
- [ ] `docs/BALANCE.md` theo §5 (trước → sau + lý do)
- [ ] `README.md` theo §6.5
- [ ] Kiểm thử: `skipToMission(9)` → reach (0,0) → vault mở + Origin dậy; `damageOrigin` qua 66%/33% thấy transition; chết giữa trận → PLAY AGAIN → Origin full máu dậy lại; `skipToEnding()` → chuỗi kết → 3 nút đều về đúng lộ trình; NG+ → `getState().ngPlus === true` + zombie đầu tiên hp 125.
