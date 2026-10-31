# Gun Game — HỢP ĐỒNG KỸ THUẬT "ĐÊM THỨ 30 · PHẦN 2" (docs/EXPANSION-P2.md)

> **Đây là hợp đồng DUY NHẤT cho 3 builder song song + integrator + fixer của
> Phần 2.** Nguồn hợp nhất:
>
> - **SPEC Phần 2** — thông điệp đặc tả (A/B/C), chép **nguyên văn** ở mục
>   3.0 / 4.0 / 5.0;
> - **Code thật sau Phần 1** — mọi tên hàm / event / toạ độ / dòng số dưới
>   đây đã **đối chiếu trực tiếp với source ngày 2026-11-01** (trích
>   `file.js:dòng`). Khi spec mơ hồ, mục 0 chốt quyết; khi spec và code đụng
>   nhau, **GIỮ tính năng cũ thắng**.
>
> Nguyên tắc số 1 của cả phần: **GIỮ 100% TÍNH NĂNG HIỆN CÓ** — city 7 khu +
> 12 cổng, chuỗi 9 nhiệm vụ + interact E, waves theo khu + boss wave, shop 7
> súng, auto-reload, dialogue typewriter, intro/outro, toàn bộ HUD cũ không
> được thay đổi hành vi. Mọi sửa file hiện có là **MỞ RỘNG cộng thêm**
> (additive), đúng pattern `docs/EXPANSION.md` / `docs/EXPANSION-P1.md` đã làm.

---

## MỤC LỤC

0. [Điểm chốt đặc tả — spec mơ hồ đã quyết](#0-điểm-chốt-đặc-tả--spec-m-h--quy-t)
1. [Bất biến — chữ ký frozen + số không được đổi](#1-bất-biến--chữ-ký-frozen--số-không-được-đổi)
2. [Phân công builder](#2-phân-công-builder)
3. [TÍNH NĂNG A — SỰ KIỆN NGẪU NHIÊN (src/systems/events.js MỚI)](#3-tính-năng-a--sự-kiện-ngẫu-nhiên-srcsystemseventsjs-mới)
4. [TÍNH NĂNG B — BẢN ĐỒ M + COMPASS (src/ui/map.js MỚI + hud.js)](#4-tính-năng-b--bản-đồ-m--compass-srcuimapjs-mới--hudjs)
5. [TÍNH NĂNG C — GIỌNG ZOMBIE 3D (audio.js + zombie.js + bosses.js)](#5-tính-năng-c--giọng-zombie-3d-audiojs--zombiejs--bossesjs)
6. [Bảng event bus MỚI (tổng hợp)](#6-bảng-event-bus-mới-tổng-hợp)
7. [Key i18n (EN/VI) + phân bổ đăng ký](#7-key-i18n-envi--phân-bổ-đăng-ký)
8. [Wire & hội quy — integrator (main.js + input.js + debug.js)](#8-wire--hội-quy--integrator-mainjs--inputjs--debugjs)
9. [README.md (fixer, cuối cùng)](#9-readmemd-fixer-cuối-cùng)
10. [Checklist đồng bộ](#10-checklist-đồng-bộ)

---

## 0. Điểm chốt đặc tả — spec mơ hồ đã quyết

Đã rà spec Phần 2 đối chiếu code thật. Các điểm LỆCH / MƠ HỒ chốt như sau:

| # | Vấn đề | Spec Phần 2 | Code thật | QUYẾT |
|---|---|---|---|---|
| P2-K1 | Map đọc "city.list" | B nói "7 khu theo **city.list**" | `City` **không có** `.list` — API thật là `city.districts` (`city.js:117-131`, build tại `city.js:636-658`); `.list` là của zones (`zones.js:112`) | Map + events đọc **`city.districts`**. |
| P2-K2 | Thời lượng event | nhãn "~40 s / ~50 s / ~60 s" nhưng cột mốc cứng khác (supply "tự biến mất sau **90 s**", survivor "bỏ qua **90 s** thì bị giết", bloodmoon "**90 s**") | — | **Số cứng thắng nhãn "~"**: horde = **40 s**; supply = **90 s** (rơi 4 s + chờ đến khi mở hoặc despawn 90 s); survivor = **90 s** (cứu sớm thì end sớm); bloodmoon = **90 s**. `active().timeLeft` = số cứng này. |
| P2-K3 | "số nhiệm vụ đang làm" (horde) | "8 + floor(số nhiệm vụ đang làm / 2) con runner" | `missions.current` ∈ 0..9, 10 = free-roam (`missions.js:141-143`) | n = `missions.current`; **10 → dùng 9**; 0 (chưa bắt đầu) → 0. main truyền qua `hooks.activeMission()`. |
| P2-K4 | Pain voice vs quy tắc cũ | C bắt buộc pain ở takeDamage | `zombie.js:41-43`: takeDamage **KHÔNG** phát/emit tiếng ("1 shotgun = 8 takeDamage") | Giữ Ý quy tắc cũ: pain chỉ là **bus event** `"zombie-voice"` {kind:"pain"} + **throttle ≥ 0.4 s / zombie** + cap 8 giọng gần-nhất phía audio → không bao giờ 8 tiếng/viên đạn. Ghi chú ngay tại `zombie.js` takeDamage khi sửa. |
| P2-K5 | Supply/survivor "1 medkit rơi" | medkit vật lý | `pickups.spawn` **clamp vào PLAY_RECTS** (arena + north + east thôi — `pickups.js:54-84`); rơi ở park/docks/hospital/residential/commercial/safehouse thì medkit **dịch chuyển tới ~100 m** | Loot áp **TRỰC TIẾP**, không dùng pickups.spawn: "medkit" = `bus` `"pickup"` {kind:"health"} (+40 HP cap 100 — controller nghe sẵn, `pickups.js:14-17`); audio.pickup() tự kêu qua route có sẵn (`main.js:259`). Ghi deviation này trong README. |
| P2-K6 | Spawn callback cho events | "gọi qua callback main truyền vào" | chữ ký spec `createEvents(bus, city, audio)` | Thêm **tham số thứ 4 TUỲ CHỌN** `hooks` (mục 3.1) — pattern tham số additive như `createMissions(…, scene, level)` (`missions.js:484`) / `createWaves(…, city)` (`waves.js:152`). Thiếu `hooks.spawnRunner` → event vẫn chạy, `console.warn` 1 lần, không sinh zombie; **integrator PHẢI truyền**. |
| P2-K7 | map.update(player) cần yaw/boss/marker | chữ ký `update(player)` | yaw nằm ở `camera.rotation.y` (`main.js:697`), boss ở `bossRef` (`main.js:240-315`) | Giữ chữ ký spec, thêm **tham số thứ 2 TUỲ CHỌN** `extras` — đúng pattern `hud.update(…, extras)` (hud.js:159, main.js:684-703). Map tự tính khu hiện tại qua `city.districtAt`. |
| P2-K8 | bloodmoon ×2 có chồng multiplier P1? | "spawn density ×2 … trả về bình thường khi hết" | waves đã có multiplier ×2/3 "không chồng" nội bộ P1 (`waves.js:491-507`) | Giữ nguyên luật P1 nội bộ; bloodmoon nhân **thêm ×0.5 lên gap SAU CÙNG** (stack ngoài 1 lớp). Hết bloodmoon → bình thường. `MAX_CONCURRENT 60` (`waves.js:148`) giữ nguyên. |
| P2-K9 | "boss-roar" route cũ | audio nghe event | `main.js:295-297` route `"boss-roar"` → `audio.zombieGrowl()` — comment tự ghi là **placeholder** ("closest existing voice") | Xoá route placeholder đó trong main.js; audio.js (builder C) tự nghe `"zombie-voice"` + `"boss-roar"` và phát **giọng boss thật** theo ma trận mục 5.2. |
| P2-K10 | "khu ĐÃ MỞ" là gì | A + B dùng chung | city không phát bus event nào (`city.js:64-66`); trạng thái cổng sống tại `gateBetween().open` | "Đã mở" = **BFS từ "safehouse" qua cổng open** (`districts[].gates` + `city.gateBetween(a,b).open`) — pattern `main.js:828-846 reachableDistricts` / `waves.js:367-402 spawnReachableFromPlayer`. safehouse luôn tính là mở. Map/events **đọc live 10 Hz / mỗi lần vẽ** — không cần nghe event cổng. |
| P2-K11 | quarantine làm host event? | "chỉ chọn khu ĐÃ MỞ" | quarantine khai báo `spawnPoints: []` (`city.js:655`) — 18 điểm legacy thuộc `level.spawnPoints`, events không có level | quarantine **LOẠI khỏi danh sách host** (không có pool riêng). Player đứng trong quarantine → horde lấy district mở khác (zombie tự đi qua cổng nhờ pathing C3, `zombie.js:29-37`); supply/survivor đặt ở district mở gần nhất có pool. |
| P2-K12 | Horde khi mới có safehouse | "chọn district có mở **khác khu player**" | lúc m1 chỉ safehouse mở, player đứng ở safehouse → không còn district nào khác | **Fallback: dùng chính safehouse** (nếu không, m1 không bao giờ có horde). Từ m2 trở lên luôn chọn district khác theo spec. |
| P2-K13 | Nguồn marker nhiệm vụ cho map + compass | "marker nhiệm vụ (beacon missions)" | beacon là mesh nội bộ của missions (`missions.js:870-886`), hud không có city/missions ref (frozen `createHud`) | **main.js tính** `mission {x,z}|null` một lần/lần gọi và truyền vào extras của cả map lẫn hud (mục 8.4). Quy tắc derive: objective `reach` → `o.x/o.z` (payload `"mission-start"` mang objectives — `missions.js:668-672`); `quota`/`survive` → `center` của district đó qua `city.districts`; `activate`/`collect` → center của district **quota cùng nhiệm vụ**, m1 (chỉ activate) → center safehouse (−75, 8). |
| P2-K14 | Spitter không có tiếng riêng | "spitter khạc ướt" | `_roar` chỉ được gọi với action "windup"/"shriek"/"slam" (`bosses.js:475, 778, 925`) | Additive: `_fireSpit` (`bosses.js:606-638`) thêm `this._roar("spit")` — event cũ, action mới; audio map "spit" → khạc ướt. |
| P2-K15 | events biết state "playing" thế nào | "chỉ chạy khi state playing (pause đóng băng)" | main loop chỉ gọi `update()` khi playing (`main.js:715-727`) — waves đã dựa nguyên tắc này (`waves.js:76-78`) | Scheduler đếm dt **chỉ qua `update()`** → pause/menu/intro tự đóng băng. Không cần nghe "state-changed". `reset()` do main gọi trong `freshRun()` (+ defensive nghe `"ui-play"`/`"ui-restart"`/`"ui-play-free"` như economy `economy.js:139-144`). |
| P2-K16 | Zombie voice payload | "{kind, type, position}" | — | Đúng chữ spec: `{kind, type, position}` với `position` là **Vector3 clone 1 lần/emit** (pattern `zombie.js:504`). Audio chỉ đọc XZ. |

---

## 1. Bất biến — chữ ký frozen + số không được đổi

Đã đối chiếu trực tiếp trong code (2026-11-01). KHÔNG đổi trừ nơi hợp đồng
này ghi rõ "MỞ RỘNG (additive)":

- `createCity(scene, level)` → `{districts, districtAt, gateBetween, setGateOpen}`
  (`city.js:1481`); `districts` theo thứ tự §3.1 P1: safehouse → residential →
  commercial → hospital → park → docks → quarantine; quarantine là **DISPLAY
  bbox** −30..54 × −54..30, `spawnPoints: []`, `center (0,0)` (`city.js:650-658`).
- `createMissions(bus, city, economy, scene, level)` (`missions.js:484`),
  `createWaves(scene, level, bus, zones, city)` (`waves.js:152`),
  `createEconomy(bus)` (`economy.js:80`), `createAudio(settings)`
  (`audio.js:54`), `createInput(canvas, settings)` (`input.js:101`),
  `createHud(container, bus, audio, i18n)` (`hud.js:374`),
  `createMenus` / `createShopUI` / `createDialogue(uiRoot, bus, i18n)`
  (`main.js:224-232`), `createGamestate(bus, settings)` (`gamestate.js:156`)
  — **chữ ký không đổi**, chỉ mở rộng hành vi additive.
- `bus` — một EventTarget duy nhất export từ `gamestate.js:56`. Module mới
  không nhận bus qua tham số thì import trực tiếp (pattern `input.js:73`).
- Số KHÔNG được đổi: `MAX_CONCURRENT 60` (`waves.js:148`), wave tổng `5 + 3n`,
  boss wave mỗi 5, intermission 10 s, MIN_SPAWN_DIST 15 (`waves.js:133-142`);
  bảng thưởng `REWARDS` (`economy.js:68-76`); quotaNeed 20/25/30/25/30
  (`city.js:642`); thưởng nhiệm vụ 300→600 (`missions.js:392-480`); bảng 12
  cổng (`city.js:206-219`); spawn pool từng khu (`city.js:226-251`).
- Thứ tự khởi tạo `main.js` giữ nguyên relative order; events + map chèn theo
  mục 8.
- `style.css` KHÔNG đụng — widget DOM mới tự style inline (pattern
  `hud.js:351-355`); canvas map tự style inline tương tự.
- Mọi event cũ phải tiếp tục phát đúng payload (bảng event ở
  `gamestate.js:10-45` + `missions.js:76-85`) — builder chỉ **thêm listener**,
  không sửa emitter cũ (trừ 3 điểm additive được hợp đồng chỉ định:
  `zombie.js`/`bosses.js` phát `"zombie-voice"`, waves/economy/atmosphere nghe
  `"bloodmoon-active"`, bosses thêm `_roar("spit")`).

---

## 2. Phân công builder

| Vai | File được đụng | Ghi chú |
|---|---|---|
| **Builder A — EVENTS** | `src/systems/events.js` (MỚI), `src/zombies/waves.js` (additive: nghe `"bloodmoon-active"` → gap ×0.5), `src/systems/economy.js` (additive: nghe `"bloodmoon-active"` → thưởng ×2), `src/world/atmosphere.js` (additive: nghe `"bloodmoon-active"` → lerp trời + fog đỏ) | Hợp đồng mục 3; i18n `event_*` mục 7 |
| **Builder B — MAP/UI** | `src/ui/map.js` (MỚI), `src/ui/hud.js` (additive: compass strip + banner/toast event + countdown bloodmoon) | Mục 4; i18n `map_*` + fallback `event_*` mục 7 |
| **Builder C — VOICES** | `src/core/audio.js` (additive: engine giọng + `update3D` + murmur + `audioState()`), `src/zombies/zombie.js` (additive: emit `"zombie-voice"` + idle timer), `src/zombies/bosses.js` (additive: emit giọng boss + `_roar("spit")`) | Mục 5; ma trận giọng 5.2 |
| **Integrator** | `src/main.js`, `src/core/input.js` (KeyM), `src/core/debug.js` (DEBUG_KEYS + `forceEvent`/`audioState`) | Mục 8 |
| **Fixer** | `README.md` | Mục 9, làm CUỐI |

Stub đã chuẩn bị sẵn (đọc kỹ JSDoc trong file — đó là hợp đồng dạng code):
`src/systems/events.js`, `src/ui/map.js` — hiện `throw new Error("TODO…")`,
builder thay thân hàm, **giữ nguyên chữ ký + typedef + JSDoc**.

---

## 3. TÍNH NĂNG A — SỰ KIỆN NGẪU NHIÊN (src/systems/events.js)

### 3.0 SPEC A (nguyên văn yêu cầu)

> createEvents(bus, city, audio) → { update(dt, playerPos), forceEvent(type),
> active() → {type, timeLeft}|null, reset() }.
> - BỘ LẬP LỊCH NGẪU NHIÊN (yêu cầu người chơi: sự kiện NGẪU NHIÊN thật): sau
>   khi vào playing, sự kiện đầu sau 40–80s; giữa các sự kiện nghỉ 45–120s
>   ngẫu nhiên. Pool có trọng số: horde 30 / supply 25 / survivor 25 /
>   bloodmoon 20; KHÔNG lặp cùng loại 2 lần liền; chỉ chạy khi state "playing"
>   (pause thì đóng băng timeLeft); chỉ chọn khu ĐÃ MỞ.
> - "horde" (~40s): còi hụ synth kéo dài 2s + banner "🚨 HORDE ĐANG TỚI" (bus
>   "event-start" {type:"horde"}); spawn 8 + floor(số nhiệm vụ đang làm / 2)
>   con runner TẠI HƯỚNG NGẪU NHIÊN (chọn district có mở khác khu player,
>   spawn tại spawnPoints phía đó — gọi qua callback main truyền vào, KHÔNG
>   đụng waves.js nếu tránh được); dồn dập sinh trong 6s.
> - "supply" (~50s): thùng hàng rơi từ 20m xuống 4s tại điểm NGẪU NHIÊN sạch
>   (không blocked, cách player ≥15m) trong khu đã mở, cột khói đỏ particles +
>   beacon sáng; mở bằng E (dùng cùng cơ chế interact của missions nếu truy
>   cập được, không thì tự xử lý interact riêng) → rơi ra 200–400 tiền
>   (economy.add) + 1 medkit + full ammo của súng hiện tại → "event-end"; thùng
>   tự biến mất sau 90s nếu không ai lấy.
> - "survivor" (~60s): người sống sót low-poly (thân xanh rêu, vẫy tay liên
>   tục) bị 5 zombie vây tại điểm NGẪU NHIÊN trong khu đã mở; player đến gần
>   <2m khi các zombie trong 6m quanh survivor đã chết → cứu thành công: $300
>   + line thoại qua bus "survivor-rescued" (dialogue HUD hiện 1 câu cảm ơn
>   EN/VI ngắn) + 1 medkit rơi; bỏ qua 90s thì zombie giết survivor (ngã, biến
>   mất) → "event-end".
> - "bloodmoon" (90s): bầu trời + fog NGÃ SANG ĐỎ (bus "bloodmoon-active"
>   {active:true} → atmosphere.js nghe và lerp màu); spawn density ×2 và TIỀN
>   ×2 (waves.js + economy.js nghe cùng event để nhân hệ số, trả về bình
>   thường khi hết); nhạc nền/drone dồn dập hơn (audio nghe event); HUD banner
>   đỏ đếm ngược.
> - toasts/banner mọi sự kiện qua bus; các event có thể chồng nhau TRỪ
>   bloodmoon (bloodmoon loại trừ các event khác khi đang active).

### 3.1 API + hooks (P2-K6)

```js
createEvents(bus, city, audio, hooks) → Events
```

```js
/**
 * @typedef {Object} EventHooks - tham số thứ 4 TUỲ CHỌN, main.js truyền.
 * @property {(x: number, z: number) => import("../zombies/zombie.js").Zombie|null}
 *   [spawnRunner] - main tạo 1 runner TẠI (x, z) (jitter + isBlocked như
 *   waves.js:556-566), push vào debugZombies + emit "zombie-spawned"
 *   (main.js:961-974 pattern) và TRẢ VỀ Zombie để events theo dõi .alive.
 *   Không trả về → events coi zombie đã chết ngay (survivor giải vây sớm).
 * @property {(x: number, z: number) => void} [supplyOpened] - main thanh toán
 *   loot thùng hàng (P2-K5): economy.add(200–400) + "pickup"{kind:"health"} +
 *   full ammo súng hiện tại.
 * @property {() => number} [activeMission] - missions.current (P2-K3).
 */
```

Hooks chỉ dùng khi event cần; **KHÔNG đụng waves.js cho việc spawn** (spec);
zombie do hooks sinh dùng đường `debugZombies` → KHÔNG ảnh hưởng wave
accounting (đúng semantics `main.js:956-960`). PlayerPos truyền vào
`update(dt, playerPos)` là `player.position` (Vector3, như waves/missions —
`main.js:719-720`).

### 3.2 Bộ lập lịch

- **Số liệu**: sự kiện đầu sau **40–80 s** kể từ lần `update()` đầu tiên sau
  `reset()` (pattern waves.js:583-586 — main chỉ gọi update khi playing nên
  pause/menu/intro tự đóng băng, P2-K15); sau khi một event **bắt đầu**, lịch
  đặt cooldown **45–120 s** ngẫu nhiên cho lần rót tiếp theo.
- **Pool trọng số**: horde 30 / supply 25 / survivor 25 / bloodmoon 20 —
  random có trọng số; **KHÔNG chọn cùng loại 2 lần liền** (nhớ `lastType`;
  nếu trúng lại → rót lại trong 3 loại còn lại).
- **Chỉ chọn khu ĐÃ MỞ** (P2-K10): BFS từ "safehouse" qua
  `city.districts[].gates` + `city.gateBetween(a,b).open`, chỉ giữ district có
  `spawnPoints.length > 0` (P2-K11 — quarantine tự loại).
- **Điểm NGẪU NHIÊN**: lấy từ `district.spawnPoints` (đã được dev-guard city
  bảo đảm không bị chặn, r = 0.8 — `city.js:1378-1382`), lọc **≥ 15 m** từ
  player; không điểm nào đạt → lấy điểm **xa nhất** (pattern
  `waves.js:510-531`). Không cần `level.isBlocked` trong events.
- **Chồng nhau**: nhiều event thường CÓ THỂ chạy đồng thời (events giữ danh
  sách active); **bloodmoon** chỉ bắt đầu khi **không** có event nào active,
  và khi bloodmoon active thì không event nào khác được bắt đầu (kể cả
  `forceEvent` → trả `false`). Scheduler tới hạn nhưng bị bloodmoon chặn →
  giữ cooldown, thử lại mỗi update cho tới khi trống.
- `active()` → `{type, timeLeft}|null` của event **mới bắt đầu nhất** (spec
  cố định shape đơn; khi chồng nhau đây là event mới nhất).

### 3.3 "horde" — 40 s

1. Bắt đầu: phát **"event-start"** `{type:"horde", timeLeft:40, x, z,
   districtId}` (x/z = spawn point đại diện → compass/map vẽ hướng); còi hụ
   synth kéo dài **2 s** — tạo nội bộ trong events (pattern synth cục bộ
   `city.js:522-601`: noise + osc,gesture-gated AudioContext, tôn trọng
   volume settings, im lặng khi không có WebAudio) HOẶC nhờ audio qua bus —
   **builder A tự chứa** (audio không bắt buộc nghe "event-start" trừ murmur
   horde, mục 5.4). HUD tự hiện banner từ event (mục 4.3).
2. Chọn district host: mở + có pool; **≠ khu player** nếu có lựa chọn khác,
  fallback chính khu player (P2-K12). Số lượng: `8 + floor(n/2)` runner
   (P2-K3).
3. Dồn dập trong **6 s**: chia đều — spawn 1 runner mỗi `6 / count` s (events
   tự đếm trong update, gọi `hooks.spawnRunner(x, z)` từng con, x/z là điểm
   pool đã chọn + jitter nhỏ events-side ±1 m; jitter thật + isBlocked do
   main xử lý trong hook).
4. Kết thúc sau 40 s → **"event-end"** `{type:"horde", reason:"done"}`.

### 3.4 "supply" — 90 s (P2-K2)

1. Chọn điểm: district mở có pool, điểm ≥ 15 m từ player (fallback xa nhất).
2. Thùng rơi từ **y = 20 m xuống 0 trong 4 s** (lerp/ease-in đơn giản); tại
   mặt đất dựng: **beacon sáng** — cột trụ additive (pattern beacon missions
   `missions.js:870-886`: `CylinderGeometry` + `MeshBasicMaterial`
   AdditiveBlending, `fog:false`, `toneMapped:false`) màu đỏ-hổ phách +
   **cột khói đỏ particles** (THREE.Points ~24 hạt bay lên chậm, tự tái sử
   dụng — `particles.js` không có khói, builder tự quản; ngân sách ≤ 1 draw
   call) chạy trong suốt thời gian thùng tồn tại.
3. Thùng **mở bằng E**: events tự xử lý interact riêng (missions `onPress`
   chỉ nhận POI của chính nó — `missions.js:1050-1063` — KHÔNG tái sử dụng
   được):
   - `update()` đóng dấu `lastUpdateAt = performance.now()` (pattern
     `missions.js:353, 1069` — IGNORE E từ menu/pause, cửa sổ 300 ms);
   - nghe **`"interact-press"`** (input.js:170-178 phát mỗi nhấn E);
   - trong bán kính **3 m** → phát `"interact-near"`
     `{target:"item_supply", near:true|false}` **chỉ khi đổi trạng thái**
     (pattern `missions.js:1159-1173`) → HUD chip "E — TƯƠNG TÁC · Gói Tiếp
     Tế" hoạt động không cần sửa HUD (`hud.js:1183-1199` + `storyLabel`
     nhận `item_*` — `hud.js:744-757`);
   - trong bán kính **2 m** khi nhấn E → MỞ: gọi `hooks.supplyOpened(x, z)`
     (P2-K5: main làm `economy.add(200 + round(rand*200))`, phát
     `"pickup"` {kind:"health"} cho +40 HP + âm thanh, và full ammo súng
     hiện tại — mag = magSize + reserve = `startReserve` của
     `weapons.list[weapons.current]`, pistol giữ Infinity — mutate trực tiếp
     như debug `giveAmmo` `main.js:1026-1035`); thùng + beacon + khói biến
     mất → **"event-end"** `{type:"supply", reason:"opened"}`.
4. Không ai mở sau **90 s** từ lúc bắt đầu → thùng tự biến mất (fade/scale về
   0 trong 0.5 s rồi remove) → **"event-end"** `{type:"supply",
   reason:"despawned"}`.
5. Nhiều thùng chồng nhau (event chồng) được phép — E mở thùng GẦN NHẤT
   trong 2 m.

### 3.5 "survivor" — 90 s (P2-K2)

1. Chọn điểm như supply (district mở + pool, ≥ 15 m).
2. Dựng **survivor low-poly**: Group ~5-6 box (thân + đầu + 2 tay + 2 chân,
   thân **xanh rêu** ~0x4f6b35), đứng tại điểm, **vẫy tay liên tục** (1 tay
   xoay sin quanh vai, ~2.5 Hz); ≤ 2 draw call, `castShadow = true`.
3. **5 zombie vây**: gọi `hooks.spawnRunner(...)` 5 lần tại vành ~5-6 m quanh
   survivor (giữ ≥ 12 m khỏi player nếu chọn được điểm); events giữ 5 refs
   (return của hook) và chỉ theo dõi `.alive`.
4. **Cứu**: player < **2 m** VÀ cả 5 zombie còn sống trong bán kính **6 m**
   quanh survivor đã chết (zombie đi ra xa > 6 m không phải thế — chỉ trạng
   thái sống/chết của 5 con được theo dõi là điều kiện: "các zombie trong 6m
   quanh survivor đã chết" = 5 zombie của event chết hết) → thành công:
   - phát **"survivor-rescued"** `{x, z}` — main nghe: `economy.add(300)`,
     dialogue 1 câu cảm ơn (mục 8.5), +40 HP qua `"pickup"` {kind:"health"}
     (P2-K5);
   - survivor chạy animation biết ơn 1 s rồi fade-out 1.5 s (pattern
     `_deathStep` `zombie.js:511-527`) và remove →
     **"event-end"** `{type:"survivor", reason:"rescued"}`.
5. Hết **90 s** không cứu → zombie giết: survivor ngã ~90° quanh trục X +
   chìm + fade trong 1.5 s rồi remove (cùng pattern) →
   **"event-end"** `{type:"survivor", reason:"lost"}`; HUD toast
   `event_survivor_lost`.

### 3.6 "bloodmoon" — 90 s

1. Điều kiện bắt đầu: không event nào active (mục 3.2). Bắt đầu: phát
   **"bloodmoon-active"** `{active:true, duration:90}` (kèm
   **"event-start"** `{type:"bloodmoon", timeLeft:90, x:null, z:null,
   districtId:null}` để banner/compass thống nhất). Kết thúc: cả hai event
   với `{active:false}` / `reason:"done"`.
2. **atmosphere.js** (Builder A, additive — `atmosphere.js` chưa import bus,
   thêm `import { bus } from "../systems/gamestate.js"` như `input.js:73`):
   nghe `"bloodmoon-active"`; khi active lerp `scene.background`
   (SKY `0x05070c` → mục tiêu đỏ máu **0x180507**) và `scene.fog.color`
   (FOG_COLOR `0x0a0e16` → **0x26070a**) trong **~2.5 s** rồi giữ; khi false
   lerp về đúng màu gốc trong ~2.5 s. Lerp thực hiện trong `update(dt)` có
   sẵn (`atmosphere.js:167-204`) bằng hệ số lerp `dt/2.5` — không đổi bất kỳ
   hành vi nào khác; giá trị gốc đọc từ hằng `SKY`/`FOG_COLOR` hiện có
   (`atmosphere.js:38-39`) để không lệch.
3. **waves.js** (additive): thêm flag `bloodmoonActive` nghe
   `"bloodmoon-active"`; `nextGap` (`waves.js:500-507`) nhân gap cuối cùng
   ×**0.5** khi active (P2-K8); `reset()` (`waves.js:623-647`) xoá flag.
   Không đổi logic nào khác (cap 60, multiplier P1 giữ nguyên).
4. **economy.js** (additive): flag `bloodmoonActive`; trong listener
   `"zombie-killed"` (`economy.js:122-128`) amount = `Math.round(base ×
   headshot × (bloodmoon ? 2 : 1))` — làm tròn MỘT lần như hiện tại; flag
   false → nguyên trạng. `reset()` không cần (flag do event quản).
5. **audio** nghe cùng event → murmur ×1.6 (mục 5.4).
6. **HUD** banner đỏ đếm ngược (mục 4.3).

### 3.7 reset() + lifecycle

- `reset()`: xoá mọi event active + scheduler (timer đầu = 40–80 s mới),
  `lastType = null`, remove/dispose toàn bộ mesh/FX (thùng, beacon, khói,
  survivor), nếu bloodmoon đang bật → phát `"bloodmoon-active"`
  `{active:false}` + `"event-end"` `{type:"bloodmoon", reason:"reset"}` TRƯỚC
  khi xoá. Phát thêm `"event-end"` `{type, reason:"reset"}` cho từng event
  còn lại để HUD/audio dọn trạng thái. Idempotent.
- Defensive fresh-run (P2-K15): nghe `"ui-play"`/`"ui-restart"`/
  `"ui-play-free"` → `reset()` (economy pattern `economy.js:139-144`);
  main.js vẫn gọi `events.reset()` trực tiếp trong `freshRun()` (mục 8.3).

### 3.8 Ngân sách hiệu năng

- Không cấp phát object trong per-frame path ngoài Vector3 clone khi EMIT
  (vài lần/giây) — trạng thái active giữ trong mảng pre-alloc kiểu
  `{type, timeLeft, x, z, districtId, ...}` tái sử dụng.
- FX động: khói supply (Points, 1 draw), beacon (1), thùng (1), survivor
  (1-2). Tối đa ~2 event thường + 1 bloodmoon đồng thời → ≤ ~8 draw call
  thêm.
- Canvas/banner/map là DOM 2D, không vào scene.

---

## 4. TÍNH NĂNG B — BẢN ĐỒ M + COMPASS (src/ui/map.js MỚI + hud.js)

### 4.0 SPEC B (nguyên văn yêu cầu)

> createMap(container, bus, city) → { toggle(), show(bool), update(player) }.
> Phím M (input.js) toggle. Overlay full-screen canvas vẽ: 7 khu theo
> city.list với màu trạng thái (khoá đỏ sẫm / mở xanh xám / khu hiện tại
> sáng viền), TÊN khu EN/VI, player = mũi tên theo hướng nhìn, marker nhiệm
> vụ (beacon missions), marker sự kiện (horde hướng/supply/survivor), marker
> boss khi boss sống, lưới toạ độ mờ. CŨng vẽ COMPASS strip mỏng trên cùng
> HUD (hud.js): kim hướng chỉ về nhiệm vụ hiện tại + event đang chạy (khi
> map đóng). Cập nhật 10Hz là đủ.

### 4.1 API map.js

```js
createMap(container, bus, city) → { toggle(), show(visible), update(player, extras?) }
```

- `toggle()`: flip hiển thị; sau khi đổi PHÁT **"map-visibility"**
  `{open: boolean}` trên bus (hud dùng để ẩn compass khi map mở — mục 4.3).
- `show(visible)`: đặt trạng thái tường minh + phát cùng event.
- `update(player, extras?)` — extras tham số TUỲ CHỌN (P2-K7), shape:
  `{boss: {x, z, type}|null, yaw: number, mission: {x, z}|null,
  event: {type, x, z}|null}` — main tính (mục 8.4). Không có extras → map
  vẫn vẽ khu + player (yaw lấy từ `player.rotation?.y` nếu có, không có thì
  mũi tên hướng mặc định lên trên).
- Phím **M**: input.js (integrator, mục 8.6) phát `"map-toggle"`;
  **map.js tự nghe** `"map-toggle"` → `toggle()` (map có bus). Điều kiện phát
  của input: đang `playing` và shop KHÔNG mở — y hệt nhánh KeyB
  (`input.js:163-169`); khi shop mở M im lặng.
- Container là `#ui` (`pointer-events: none` theo `index.html`) — overlay
  canvas **không được bật lại pointer-events** (bản đồ chỉ xem, không click).
  Canvas tự style inline: `position:absolute; inset:0; z-index:50;
  background: rgba(2,4,8,0.82); display:none` mặc định.
- DOM an toàn: tạo 1 lần trong `createMap`, không tạo/gỡ node mỗi toggle.

### 4.2 Nội dung vẽ (canvas 2D, mỗi lần update khi mở — 10 Hz)

- **Phép chiếu**: khung thế giới x −140..140, z −140..140 → ô vuông
  `min(w, h) − 40 px` giữa màn hình; `worldToCanvas(x, z)` tuyến tính (trục
  z vẽ hướng xuống — nhìn từ trên, đúng chiều đọc toạ độ HUD/debug).
- **7 khu** từ `city.districts` (P2-K1): fill `bounds` —
  - khoá: `rgba(96, 22, 22, 0.60)` (đỏ sẫm);
  - mở (BFS P2-K10): `rgba(56, 84, 66, 0.55)` (xanh xám);
  - khu hiện tại (`city.districtAt(player)`) → sáng hơn ~×1.4 + **viền
    2 px** `#ffd35e`;
  - quarantine vẽ theo `bounds` (DISPLAY bbox −30..54 × −54..30,
    `city.js:653`) — thêm chú thích mờ "3 vùng" là TUỲ CHỌN builder.
- **TÊN khu**: `i18n.t("district_" + id)` (city.js đăng ký — `city.js:138-157`;
  EN/VI bảng mục 7.2) — vẽ giữa bounds, font 11-13 px, màu theo trạng thái;
  fallback raw id khi key chưa có (never-throw `i18n.js:197-207`).
- **Lưới toạ độ mờ**: đường mỗi 20 m thế giới, `rgba(255,255,255,0.05)`;
  nhãn trục x/z mỗi 40 m (tuỳ chọn, ≤ 12 nhãn).
- **Player = mũi tên**: tam giác tại (px, pz) xoay theo `extras.yaw`
  (radian, yaw 0 hướng −Z = hướng LÊN trên canvas vì z vẽ xuống), màu trắng
  viền đen.
- **Marker nhiệm vụ** `extras.mission` (P2-K13): hình thoi vàng `#ffd35e`
  nhấp nháy alpha ~1.5 Hz + chấm trụ mờ.
- **Marker sự kiện** `extras.event`: horde = đầu mũi đỏ `#ff4d3d` chỉ từ
  player về (x, z) + chấm; supply = vuông hổ phách `#ffab3d`; survivor =
  chấm xanh lục `#6fe08a` + chữ thập nhỏ; bloodmoon = phủ overlay đỏ nhẹ
  toàn map + text đếm ngược (lấy `timeLeft` từ event-start cache — map nghe
  `"event-start"`/`"event-end"`/`"bloodmoon-active"` để có timeLeft dù
  extras chỉ mang toạ độ).
- **Marker boss** `extras.boss`: chấm đỏ to + vòng, tên boss
  `i18n.t("boss" + Capitalize(type))` (bundle bosses.js:90-107 có sẵn) khi
  vừa đủ chỗ; chỉ khi boss sống (main đã lo qua bossRef — `main.js:689-695`).
- **Cổng**: vẽ khuyết cổng từ `city.districts[].gates` (toạ độ x/z —
  `city.js:667-672`): nét trắng ngắn, **xanh khi `city.gateBetween(a,b).open`
  đỏ khi khoá** — đọc live mỗi lần vẽ (P2-K10).
- Chữ cán mỏng dưới đáy: hint `[M] ĐÓNG BẢN ĐỒ` (`map_toggle_hint`).
- Hiệu năng: mọi path vẽ dùng giá trị cache; KHÔNG tạo string/i18n lookup mỗi
  tick ngoài tên 7 khu (cache theo lang — invalidate khi nghe
  `"settings-changed"` {patch.lang}).

### 4.3 COMPASS strip (hud.js — Builder B, additive)

- Strip mỏng **trên cùng HUD**, dưới killfeed: div tự style inline
  (`hud.js:351-355` pattern): `position:absolute; top:6px; left:50%;
  transform:translateX(-50%); width:min(560px, 72vw); height:16px;` nền
  `rgba(6,10,16,0.55)`, viền mảnh; vẽ bằng 1 `<canvas>` nhỏ bên trong (mượt
  hơn DOM) hoặc 3 node DOM định vị tuyệt đối — builder chọn, free các mũi
  tên khi hết.
- **Chỉ hướng (khi map ĐÓNG)**: mỗi marker được chiếu lên strip theo góc
  phương vị tương đối — dùng đúng basis camera của mũi tên boss
  (`hud.js:1418-1420`):
  `right = dx·cos(yaw) − dz·sin(yaw); fwd = −dx·sin(yaw) − dz·cos(yaw);
  ang = atan2(right, fwd)`; vị trí trên strip = giữa + `ang / 0.8 × halfW`
  (0.8 rad = nửa FOV ngang như `ARROW_CONE` `hud.js:183`); vượt vành → kẹp
  mép + đổi thành mũi tên "ngoài tầm nhìn".
- Marker: **nhiệm vụ** (vàng) từ `extras.mission`; **event đang chạy**
  (đỏ/hổ phách/xanh lục theo loại) từ `extras.event`; vạch giữa = hướng nhìn
  player. Ẩn strip khi: `extras` thiếu yaw, hoặc không có marker nào, hoặc
  **map đang mở** (nghe `"map-visibility"` {open}), hoặc HUD ẩn.
- Nguồn dữ liệu: `extras.yaw` đã có sẵn (`main.js:697` — không đổi);
  `extras.mission` / `extras.event` là CỘT MỚI main thêm vào
  `hudExtrasScratch` (mục 8.4) — HUD **không tự derive** (không có
  city/missions — P2-K13).
- Banner/toast event (cùng Builder B, additive):
  - `"event-start"` → banner lớn giữa màn hình 2.5 s (node riêng, KHÔNG tái
    dùng node banner wave — tránh đè `waveBanner`): text =
    `tr("event_" + type + "_banner")` (mục 7.1);
  - `"event-end"` với reason `opened` → toast `event_supply_opened`
    (+{money}$ — main nhét money vào payload `event-end`
    `{type:"supply", reason:"opened", money}`), reason `rescued` → toast
    `event_survivor_rescued`, reason `lost` → toast `event_survivor_lost`;
  - `"bloodmoon-active"` {active:true} → chip đỏ đếm ngược "TRĂNG MÁU {n}s"
    (giảm bằng dt đo được trong `update()` — `hud.js:1292-1296`), {active:
    false} → ẩn chip + toast `event_bloodmoon_end`;
  - `"state-changed"` gameover/menu + `show(false)` → xoá sạch widget mới
    (pattern `hud.js:1220-1229, 1455-1464`).

---

## 5. TÍNH NĂNG C — GIỌNG ZOMBIE 3D (audio.js + zombie.js + bosses.js)

### 5.0 SPEC C (nguyên văn yêu cầu)

> - Ma trận giọng theo trạng thái × loại — tất cả synth WebAudio, KHÔNG file:
>   idle (lầu bầu thấp, chu kỳ ngẫu nhiên 6–14s), alert (phát hiện player:
>   gầm gừ dồn dập), chase (rít liên tục khi đang đuổi, nhẹ hơn alert), attack
>   (gằn răng + vụt), pain (rên ngắn cao độ tuỳ loại), death (quẫy + tắt dần).
>   Loại: walker trầm chậm / runner khàn sắc cao nhanh / brute như cối xay thịt
>   (thêm distortion) / 4 boss mỗi boss một chất riêng (butcher gầm kim loại,
>   spitter khạc ướt — noise lọc bandpass, screamer gào men cao, golem rền đá
>   trầm).
> - TRỘN 3D (yêu cầu người chơi: "tiếng zombie hay hơn"): audio.update3D(camera,
>   zombies) — volume theo khoảng cách (cắt ở 35m, lerp 3–35m), STEREO PAN theo
>   hướng zombie so với hướng nhìn camera (trái −1 → phải +1); tổng concurrent
>   voice cap 8 (ưu tiên gần nhất).
> - zombie.js: tại các bước chuyển trạng thái + takeDamage + chết → phát
>   "zombie-voice" {kind: "idle"|"alert"|"chase"|"attack"|"pain"|"death",
>   type, position} trên bus + idle moan ngẫu nhiên theo timer khi đang sống;
>   bosses.js: phát cùng event với kind boss (theo type).
> - RÌ RẦM BẦY: audio duy trì 1 lớp murmur nền (noise + osc ngẫu nhiên) whose
>   intensity = f(số zombie gần < 20m) — main truyền zombies array vào
>   update3D; khi "event-start" horde hoặc "bloodmoon-active" → murmur + adsr
>   gấp 1.6.
> - debug API audioState() → { ctxState, activeVoices } để kiểm thử.

### 5.1 Nơi phát — zombie.js (Builder C, additive)

Thêm vào `Zombie` (giữ toàn bộ hành vi cũ):

- State runtime mới trong constructor (`zombie.js:209-221` khu vực):
  `_voiceIdleT = 6 + Math.random()*8`, `_voiceChaseT = 0`,
  `_voicePainCd = 0`, `_voiceAlertArmed = true`.
- Helper `_voiceEmit(kind)`:
  `this.bus.dispatchEvent(new CustomEvent("zombie-voice", {detail:{kind, type: this.type, position: this.position.clone()}}))` (P2-K16).
- Trong `update()` (sau khi tính `dist`/`moved` — `zombie.js:249-328`) gọi
  `_voiceTick(dt, canChase, dist, moved)`:
  - **idle**: còn sống → `_voiceIdleT -= dt`; hết hạn → emit `"idle"` +
    đặt lại 6–14 s. Khi đang chase (dist < 30) thì hoãn idle (không chồng).
  - **alert**: `canChase && dist < 18 && this._hasLineOfSight(ppos.x, ppos.z, level)`
    && `_voiceAlertArmed` → emit `"alert"` + disarm; re-arm khi dist > 30.
  - **chase**: `canChase && dist < 30 && gait > 0.5` → đếm `_voiceChaseT`;
    chu kỳ theo loại walker 2.4 s / runner 1.3 s / brute 3.2 s → emit
    `"chase"`.
  - **attack**: tại khối tấn công `zombie.js:339-343` (ngay sau khi đặt
    `attackAnimT`) emit `"attack"`.
- `takeDamage` (`zombie.js:434-447`): emit `"pain"` khi `flashT` vừa đặt,
  **throttle `_voicePainCd ≥ 0.4 s`** (P2-K4) — kèm comment tham chiếu quy
  tắc cũ `zombie.js:41-43`.
- `_die` (`zombie.js:484-509`): emit `"death"` ngay sau `"zombie-killed"`.
- Chết/dispose → mọi timer ngừng tự nhiên (`update` không chạy khi
  `!alive` — `zombie.js:232-236`).

### 5.2 Nơi phát — bosses.js (Builder C, additive)

- Boss kế thừa toàn bộ cơ chế trên (extend `Zombie` — `bosses.js:200-238`);
  3 boss dùng `Zombie.prototype.update` (butcher/screamer/golem —
  `bosses.js:464, 772, 919`) nhận `_voiceTick` miễn phí. **Spitter** đi đường
  `_act` riêng (`bosses.js:553-603`, không gọi base update) → gọi tường minh
  `this._voiceTick(dt, canAct, dist, moved)` trong `_act` (dist đã có tại
  `bosses.js:563`).
- Chu kỳ boss kéo dài ×1.5 so với brute (idle 9–21 s, chase 4.8 s) — boss
  ít nói, mỗi tiếng phải "đáng tiền".
- **Boss-roar → kind**: `_roar(action)` hiện có (`bosses.js:324-331`) phát
  `"boss-roar"` {type, action}; audio map theo ma trận 5.2 (butcher
  "windup" → gầm kim loại; screamer "shriek" → gào men cao; golem "slam" →
  rền đá; **spitter "spit"** — thêm `this._roar("spit")` đầu `_fireSpit`
  (P2-K14) → khạc ướt).
- Boss death voice tự có qua `_die` kế thừa (`BossZombie._die` gọi
  `super._die` — `bosses.js:298`).

### 5.3 Ma trận giọng đầy đủ (BẮT BUỘC — 7 loại × 6 kind)

Tất cả synth bằng 3 helper nội bộ có sẵn của audio.js — `playNoise`
(`audio.js:111-130`), `playTone` (`audio.js:136-153`), `playWobble`
(`audio.js:159-189`) — **mở rộng chúng để nhận `out` node đích** (mặc định
`master` như cũ — mọi tiếng cũ không đổi) + tham số `pan`/`gainMul` cho lớp
3D; brute/boss thêm WaveShaper (distortion) tạo trong âm lượng chain. KHÔNG
file, KHÔNG thay tiếng cũ (gunshot/zombieGrowl/zombieHit/… giữ nguyên).

| loại \ kind | idle (lầu bầu) | alert (gầm gừ dồn dập) | chase (rít, nhẹ hơn alert) | attack (gằn răng + vụt) | pain (rên ngắn) | death (quẫy + tắt dần) |
|---|---|---|---|---|---|---|
| **walker** trầm chậm | saw 55–75 Hz, LFO 4–6 Hz, cutoff ~220, dur 1.2–1.8 s | 2–3 wobble nhanh f0 80–110 Hz, dur 0.25 s/xen kẽ 90 ms | 1 wobble f0 70–95 Hz dur 0.5 s, gain 0.6× alert | noise highpass 900 Hz 0.08 s + saw 140→70 Hz 0.25 s | saw 180→90 Hz 0.18 s, gain 0.18 | wobble 90→35 Hz 0.9 s + noise lowpass 500→120 Hz, decay exp |
| **runner** khàn, cao, nhanh | saw 95–130 Hz, LFO 9–12 Hz, dur 0.6–0.9 s | 3–4 wobble f0 140–190 Hz, nhịp 70 ms | bandpass 500–900 Hz noise ngắn 0.15 s, chu kỳ 1.3 s | noise bandpass 1400 Hz 0.06 s + saw 240→120 Hz 0.18 s | saw 300→150 Hz 0.14 s, sắc | wobble 150→55 Hz 0.6 s + noise 800→200 Hz |
| **brute** cối xay thịt (+distortion tanh k≈30) | saw 45–60 Hz + sub sine 30 Hz, LFO 2–4 Hz, dur 1.5–2.2 s | wobble 60–85 Hz ×2 + noise lowpass 300 Hz, dur 0.8 s | wobble 50–70 Hz dur 0.9 s chu kỳ 3.2 s | thud: noise lowpass 250 Hz 0.12 s + sine 90→45 Hz 0.3 s, distortion | saw 120→60 Hz 0.25 s, distortion nhẹ | wobble 70→28 Hz 1.2 s + rumble noise 200→60 Hz, distortion |
| **butcher** gầm kim loại | (ít — dùng idle brute chậm hơn) | kim loại: square 110 Hz + bandpass cộng hưởng 1400 Hz Q 8 | saw 65 Hz, cutoff 350 | **"windup"**: gầm kim loại — saw+square 90–130 Hz, ring bandpass 1200–1800 Hz, distortion nặng, dur 1.1 s | square 100→50 Hz 0.3 s kim loại | kim loại rơi: noise bandpass 900 Hz sweep + wobble 80→30 Hz 1.3 s |
| **spitter** khạc ướt | gurggle: noise bandpass 400–700 Hz, LFO tần số lọc 5 Hz, dur 0.8 s | khạc khô ×2: noise bandpass 800 Hz 0.1 s | ố sề nhẹ: noise bandpass 600 Hz 0.2 s chu kỳ 3 s | **"spit"**: khạc ướt — noise bandpass 700→300 Hz Q 3 dur 0.28 s + osc pitch-down 300→120 Hz, "ướt" = LFO 18 Hz lên bandpass freq | sine 380→190 Hz 0.15 s ướt | khạc dài + bọt: noise bandpass 500 Hz dur 0.7 s giảm dần |
| **screamer** gào men cao | nấc cao: saw 300–420 Hz vibrato sâu, dur 0.5 s | gào ngắn 500–700 Hz tăng cao | rít cao 400–550 Hz, vibrato, gain 0.5× | (melee) gào 450 Hz 0.2 s | gào 700→400 Hz 0.2 s | **"shriek"** cũng là death-adjacent: gào 600→900→300 Hz 1.0 s, vibrato sâu, distortion nhẹ |
| **golem** rền đá trầm | rền 30–45 Hz + sub 24 Hz, dur 2–3 s, distortion | đá ma sát: noise lowpass 150 Hz 0.6 s + rền 40 Hz | rền 35 Hz chu kỳ 4.8 s | **"slam"**: rền đá 45→28 Hz 0.8 s + thud noise 120 Hz + distortion nặng | rền 80→40 Hz 0.35 s | sụp đá: noise lowpass 300→60 Hz 1.5 s + rền tắt dần |

Ghi chú chung: pitch drift ±10% ngẫu nhiên mỗi lần phát (tránh máy móc);
mỗi kind có gain gốc riêng ≤ 0.35 (đỉnh sau khi nhân khoảng cách); idempotent
khi ctx chưa sẵn sàng (`ready()` pattern `audio.js:99-103`).

### 5.4 Trộn 3D — `update3D(camera, zombies)` (audio.js)

- **Gọi mỗi frame khi playing** từ main (mục 8.2). `camera.rotation.y`
  (order "YXZ" — `main.js:697`), `camera.position`.
- **Volume theo khoảng cách**: dist XZ zombie↔camera; `> 35 m` → bỏ; ≤ 3 m →
  vol 1; 3→35 m lerp tuyến tính xuống 0.
- **Stereo pan**: `right = dx·cos(yaw) − dz·sin(yaw)`; `pan =
  clamp(right/dist, −1, 1)` (trái −1 → phải +1) — cùng basis đã kiểm chứng
  ở mũi tên boss (`hud.js:1418-1420`). Chain mỗi giọng:
  `source → (distortion?) → voiceGain(vol) → StereoPannerNode(pan) → master`;
  không có `createStereoPanner` (browser cũ) → bỏ node pan (vẫn phát).
- **Cap 8 giọng đồng thời**: audio giữ danh sách giọng sống
  `{endsAt, dist}`; yêu cầu mới khi đã 8 → nếu dist mới < dist của giọng xa
  nhất thì giọng xa nhất bị ngắt (gain set 0 + stop) và giọng mới chiếm chỗ;
  ngược lại bỏ qua. **Boss luôn thắng chỗ** (xóa giọng xa nhất dù dist mới
  lớn hơn — boss tiếng ít, phải nghe thấy).
- **Kết nối bus** (P2-K9): audio.js `import { bus } from
  "../systems/gamestate.js"` (pattern `input.js:73`); nghe:
  - `"zombie-voice"` {kind, type, position} → chọn recipe (bảng 5.2) + dist
    từ `position`;
  - `"boss-roar"` {type, action} → recipe boss tương ứng (vị trí = boss gần
    nhất còn sống trong `zombies` lần `update3D` gần nhất; không có → phát
    không pan, vol 0.5);
  - `"event-start"` {type:"horde"} → murmurBoost 1.6 tới `"event-end"`
    {type:"horde"};
  - `"bloodmoon-active"` {active} → murmurBoost 1.6 khi true.
  main.js XOÁ route cũ `"boss-roar"` → `audio.zombieGrowl()` (`main.js:295-297`,
  P2-K9).
- **Murmur nền**: 1 lớp lặp — noise (noiseBuf có sẵn) qua lowpass ~180 Hz +
  osc sine 50–70 Hz tần số rung ngẫu nhiên (LFO 0.1–0.3 Hz), gain mục tiêu =
  `0.018 × min(1, n/5)` với n = số zombie `< 20 m` tính trong `update3D`
  (mượt bằng `gain.setTargetAtTime`, τ ≈ 0.4 s); nhân thêm
  `murmurBoost` (1 hoặc 1.6). Bắt đầu cùng `startAmbientNodes`
  (`audio.js:290-335`); tạm dừng tự nhiên khi gain mục tiêu ≈ 0.
- **audioState()** → `{ctxState: ctx ? ctx.state : "none", activeVoices:
  <số giọng sống>}` — method mới trên object trả về của `createAudio`
  (additive; mọi method cũ nguyên vị trí).

---

## 6. Bảng event bus MỚI (tổng hợp)

| Event | Payload | Phát bởi | Nghe bởi |
|---|---|---|---|
| `"event-start"` | `{type:"horde"|"supply"|"survivor"|"bloodmoon", timeLeft, x, z, districtId}` (x/z null cho bloodmoon; horde x/z = spawn point đại diện) | events.js | hud (banner/compass), map, audio (murmur horde) |
| `"event-end"` | `{type, reason:"done"|"opened"|"rescued"|"lost"|"despawned"|"reset", money?}` (money khi supply opened) | events.js | hud (toast), map, audio |
| `"bloodmoon-active"` | `{active: boolean, duration: 90}` | events.js | atmosphere (trời đỏ), waves (gap ×0.5), economy (tiền ×2), audio (murmur ×1.6), hud (countdown), map |
| `"survivor-rescued"` | `{x, z}` | events.js | main (economy.add 300 + dialogue cảm ơn + "pickup"{kind:"health"}) |
| `"map-toggle"` | `{}` | input.js (KeyM) | map.js |
| `"map-visibility"` | `{open: boolean}` | map.js | hud (ẩn compass khi map mở) |
| `"zombie-voice"` | `{kind:"idle"|"alert"|"chase"|"attack"|"pain"|"death", type, position: Vector3}` | zombie.js + bosses.js | audio (recipe + 3D mix) |
| `"boss-roar"` (CŨ, action mới `"spit"`) | `{type, action}` | bosses.js | audio (giọng boss) — route cũ main.js:295-297 XOÁ |

Event cũ liên quan đọc thêm: `"interact-press"` (input.js:170-178 — events
dùng cho thùng supply), `"interact-near"` (events phát với
target `"item_supply"`), `"mission-start"`/`"objective-progress"` (main dùng
derive marker — P2-K13), `"state-changed"` (hud dọn widget).

---

## 7. Key i18n (EN/VI) + phân bổ đăng ký

Cú pháp placeholder `{name}` — `i18n.js:197-207`. Flat key, đăng ký qua
`i18n.registerBundle` (merge, later wins — `i18n.js:172-195`).

### 7.1 `event_*` — chủ sở hữu: **events.js** (Builder A đăng ký; Builder B
chép fallback y hệt vào HUD_BUNDLE phụ như P1 đã làm — `hud.js:281-338`)

| key | EN | VI |
|---|---|---|
| `event_horde` | `HORDE` | `BỘ ĐÀN` |
| `event_supply` | `SUPPLY DROP` | `TIẾP TẾ` |
| `event_survivor` | `SURVIVOR` | `NGƯỜI SỐNG SÓT` |
| `event_bloodmoon` | `BLOODMOON` | `TRĂNG MÁU` |
| `event_horde_banner` | `🚨 HORDE INCOMING` | `🚨 HORDE ĐANG TỚI` |
| `event_supply_banner` | `📦 SUPPLY DROP INBOUND` | `📦 TIẾP TẾ ĐANG RƠI` |
| `event_survivor_banner` | `🆘 SURVIVOR SURROUNDED` | `🆘 NGƯỜI SỐNG SÓT BỊ VÂY` |
| `event_bloodmoon_banner` | `🌕 BLOODMOON RISES` | `🌕 TRĂNG MÁU NỔI` |
| `event_bloodmoon_timer` | `BLOODMOON {n}s` | `TRĂNG MÁU {n}s` |
| `event_supply_opened` | `SUPPLY SECURED +{money}$` | `ĐÃ NHẬN TIẾP TẾ +{money}$` |
| `event_survivor_rescued` | `SURVIVOR RESCUED +300$` | `ĐÃ CỨU NGƯỜI SỐNG SÓT +300$` |
| `event_survivor_lost` | `SURVIVOR LOST` | `NGƯỜI SỐNG SÓT ĐÃ NGÃ` |
| `event_bloodmoon_end` | `BLOODMOON ENDED` | `TRĂNG MÁU TAN` |
| `event_survivor_thanks` | `Thank you! I thought I was dead for sure. Take my supplies — I owe you my life.` | `Cảm ơn anh! Tôi tưởng chắc chắn chết rồi. Lấy gói đồ này — tính mạng tôi là của anh nợ.` |

`event_survivor_thanks` KHÔNG nằm trong HUD — main.js đưa vào
`dialogue.show([{speakerKey:"speaker_unknown", text: i18n.t("event_survivor_thanks")}])`
(`speaker_unknown` có sẵn — `dialogue.js:117-119`).

### 7.2 `district_*` — ĐÃ CÓ (city.js sở hữu, `city.js:138-157`) — map KHÔNG
đăng ký lại, chỉ tiêu dùng + fallback raw id (P2-K1/C8):

`district_safehouse` Safehouse / An Toàn Nhà · `district_residential`
Residential / Khu Dân Cư · `district_commercial` Commercial / Phố Thương Mại ·
`district_hospital` Hospital / Bệnh Viện · `district_park` Park / Công Viên ·
`district_docks` Docks / Bến Cảng · `district_quarantine` Quarantine Zone /
Vùng Cách Ly.

### 7.3 `map_*` — chủ sở hữu: **map.js** (Builder B)

| key | EN | VI |
|---|---|---|
| `map_toggle_hint` | `[M] — CLOSE MAP` | `[M] — ĐÓNG BẢN ĐỒ` |
| `map_locked` | `LOCKED` | `KHOÁ` |
| `map_open` | `OPEN` | `MỞ` |
| `map_title` | `DISTRICT MAP` | `BẢN ĐỒ KHU VỰC` |

### 7.4 `item_supply` — ĐÃ CÓ (missions.js `missions.js:184, 219`): dùng làm
target id hiển thị cho interact-near thùng hàng (mục 3.4.3) → HUD chip hiện
"E — TƯƠNG TÁC · Gói Tiếp Tế" không cần key mới.

---

## 8. Wire & hội quy — integrator (main.js + input.js + debug.js)

### 8.1 Khởi tạo (sau `dialogue` — `main.js:232`, trước khối bus wiring)

```js
// NIGHT 30 P2: random events + map M + zombie voices (docs/EXPANSION-P2.md).
const events = createEvents(bus, city, audio, {
  spawnRunner(x, z) { /* main.js:961-974 pattern + trả về Zombie */ },
  supplyOpened(x, z) { /* P2-K5 loot */ },
  activeMission() { return Math.min(Math.max(missions.current, 0), 9); },
});
const map = createMap(uiRoot, bus, city);
```

### 8.2 Main loop (`main.js:715-727`, nhánh `playing`) — thêm

```js
events.update(dt, player.position);      // sau missions.update
audio.update3D(camera, zombies);          // sau updateZombies (đủ 1 lần/frame)
// map 10 Hz: mapTimer += dt; if (mapTimer >= 0.1) { mapTimer = 0;
//   map.update(player, mapExtras()); }  // + gọi ngay trong toggle()
```

### 8.3 freshRun (`main.js:391-429`) — thêm `events.reset();` (cùng khối với
`zones.reset()`; gọi cả trong nhánh `keepStoryProgress` — sự kiện là thế
giới, luôn reset).

### 8.4 hudExtrasScratch + mapExtras (`main.js:684-703`) — mở rộng additive

- `hudExtrasScratch` thêm `mission: {x, z}|null` + `event: {type, x, z}|null`
  (đọc `events.active()` + cache toạ độ event từ chính main nghe
  `"event-start"`/`"event-end"`, hoặc thêm accessor `events.marker()` —
  integrator chọn 1, không đổi `active()` theo spec).
- `mapExtrasScratch` tương tự + `boss` (từ `bossRef` — `main.js:689-695`) +
  `yaw` (camera.rotation.y).
- Derive `mission` theo P2-K13 (main có `missions.getState()` +
  `city.districts`).

### 8.5 Listener mới trong main.js

- `"survivor-rescued"` → `economy.add(300)`;
  `dialogue.show([{speakerKey:"speaker_unknown", text: i18n.t("event_survivor_thanks")}])`
  (đi qua hàng đợi `showDialogue` `main.js:566-587`); phát
  `"pickup"` {kind:"health"} (P2-K5).
- XOÁ route `"boss-roar"` → `audio.zombieGrowl()` (`main.js:295-297` —
  P2-K9).

### 8.6 input.js — phím M (nhánh `else if (e.code === "KeyM")` ngay sau nhánh
KeyE — `input.js:170-178`)

```js
} else if (e.code === "KeyM") {
  // M = bản đồ (NIGHT 30 P2, docs/EXPANSION-P2.md §4). Cùng điều kiện B:
  // chỉ trong run sống, shop mở thì im lặng (overlay sở hữu phím).
  if (!shopOpen && lastKnownState === "playing") {
    bus.dispatchEvent(new CustomEvent("map-toggle"));
  }
}
```

Cập nhật JSDoc đầu file (danh sách code + event) và header `gamestate.js`
bảng event (additive — 8 event mới mục 6).

### 8.7 debug.js + debug API (main.js `debugApi`)

- `debug.js` `DEBUG_KEYS` (`debug.js:76-101`) thêm `"forceEvent"`,
  `"audioState"` (mục comment "doc directs adding the new keys here").
- `debugApi.forceEvent(type)` → `events.forceEvent(String(type))` → trả
  `{ok: boolean}`; `events.forceEvent` bỏ qua cooldown nhưng tôn trọng luật
  bloodmoon (mục 3.2); type sai → `{ok:false, valid:[...]}`.
- `debugApi.audioState()` → `audio.audioState()`.
- `debugApi.getState()` (`main.js:914-953`) thêm:
  `event: events.active()` (`{type, timeLeft}|null`) và
  `bloodmoon: !!(ev && ev.type === "bloodmoon")`.

### 8.8 Buff kiểm thử nhanh (ghi vào README mục debug)

`__game.forceEvent("supply")` → thùng rơi; `__game.forceEvent("bloodmoon")` →
trời đỏ + tiền ×2; `__game.audioState()` → đếm giọng.

---

## 9. README.md (fixer, cuối cùng)

Thêm vào README (cuối, sau mục Cốt truyện / trước Cấu trúc source — giữ mọi
nội dung hiện có):

1. **Mục "Sự kiện ngẫu nhiên"** — bảng 4 sự kiện:

| Sự kiện | Khi nào | Người chơi làm gì |
|---|---|---|
| 🚨 HORDE (40 s) | còi hụ 2 s + banner | 8+runner dồn dập 6 s từ khu khác — đặt lưng vào tường, súng auto |
| 📦 TIẾP TẾ (90 s) | thùng rơi 20 m + khói đỏ + beacon | tới thùng (≥15 m lúc rơi), bấm E trong 2 m → 200–400$ + +40 HP + full đạn súng hiện tại; 90 s tự biến mất |
| 🆘 NGƯỜI SỐNG SÓT (90 s) | banner + marker | hạ 5 zombie vây, tới <2 m → +300$ + medkit + lời cảm ơn; trễ 90 s survivor chết |
| 🌕 TRĂNG MÁU (90 s) | trời + sương đỏ, banner đếm ngược | zombie dày ×2, tiền ×2 — dữ sẵn đạn |

Ghi chú deviation: medkit là hiệu ứng tức thời (+40 HP) thay vì vật rơi vật
lý (giới hạn clamp của pickups — P2-K5).

2. **Mục "Bản đồ M"** — bấm M khi chơi: 7 khu màu (khoá đỏ / mở xanh / khu
   hiện tại viền vàng), tên EN/VI, mũi tên player, marker nhiệm vụ + sự kiện
   + boss, lưới 20 m; compass strip trên HUD chỉ nhiệm vụ + event khi đóng map.

3. **Ghi nhận giọng zombie mới** — 6 trạng thái × 7 loại synth 3D (pan +
   volume theo khoảng cách, cap 8, rì rầm bầy), mục 5.2/5.4 hợp đồng.

4. **Debug API bảng** thêm `forceEvent(type)`, `audioState()`,
   `getState() += {event, bloodmoon}`, phím **M** vào bảng phím.

---

## 10. Checklist đồng bộ

- [ ] `events.js` chỉ đọc `city.districts` / `districtAt` / `gateBetween` —
      KHÔNG `.list`, KHÔNG đụng waves.js cho spawn.
- [ ] Scheduler: 40–80 s đầu / 45–120 s nghỉ / trọng số 30-25-25-20 / không
      lặp / bloodmoon loại trừ.
- [ ] horde: 40 s, 8 + floor(mission/2) runner, 6 s burst, horn 2 s.
- [ ] supply: 90 s, rơi 4 s từ 20 m, E trong 2 m, ≥15 m, despawn 90 s,
      loot 200–400$ + +40 HP + full ammo.
- [ ] survivor: 90 s, 5 zombie, cứu <2 m, +300$ + thoại + +40 HP.
- [ ] bloodmoon: 90 s, trời/fog đỏ lerp 2.5 s, waves gap ×0.5, economy ×2,
      murmur ×1.6, HUD countdown.
- [ ] map: 7 khu từ `city.districts`, 3 trạng thái màu, tên i18n, mũi tên
      player theo yaw, marker nhiệm vụ/sự kiện/boss, lưới 20 m, 10 Hz,
      `"map-visibility"` phát đúng.
- [ ] compass: basis `hud.js:1418-1420`, ẩn khi map mở, extras.mission/event.
- [ ] voices: 6 kind × 7 loại, emit từ zombie.js (idle 6–14 s, alert 18 m
      LOS, chase periodic, attack, pain 0.4 s throttle, death) + bosses
      (voiceTick spitter + `_roar("spit")`).
- [ ] update3D: cắt 35 m, lerp 3–35 m, pan theo yaw, cap 8 ưu tiên gần
      (boss thắng chỗ), murmur f(<20 m) ×1.6.
- [ ] audioState() đúng shape; debug keys đăng ký đủ.
- [ ] i18n: mọi key mục 7 đăng ký EN + VI; không key nào trùng chữ khác.
- [ ] Build pass: `node node_modules/vite/bin/vite.js build`.
- [ ] KHÔNG git commit.
