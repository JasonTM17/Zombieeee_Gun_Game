# Gun Game — CÂN BẰNG TOÀN CỤC — "ĐÊM THỨ 30 · Phần 3" (docs/BALANCE.md)

> Integrator P3, theo khung bắt buộc docs/EXPANSION-P3.md §5. Nguồn số: đọc trực
> tiếp từ code (commit gốc + các file P3) — mọi bảng dưới đây ghi "file:line"
> nơi số đó sống. Mục tiêu kiểm chứng của hợp đồng:
> 1. **Đến nhiệm vụ 6**: đủ mua ≥ 3/4 súng mới (smg 400 / sniper 800 / minigun
>    1500 / grenade 1200 — `shop.js:90-93`).
> 2. **Đến Nguồn Gốc**: đủ full arsenal (3900$) + dư ~500.
> 3. **Không phase nào của Origin "cấn" quá 90 s.**
> 4. **Nhịp 3–5 phút/khu** cho quota 20/25/30/25/30.
>
> Phương pháp: phân tích từ số liệu trong code (khung §5.1 cho phép tính tổng
> lý thuyết) + kiểm chứng hành vi bằng smoke headless chạy module thật
> (86/86 checks P3 + 23/23 checks hồi quy P1/P2 — xem "Đo đạc thực tế" ở cuối).
> **KHÔNG có buổi chơi thật nào được chạy trong môi trường tích hợp** (cần
> WebGL + pointer lock + input người) — mọi con số "ước lượng" dưới đây là mô
> hình, không phải đo FPS/đo giờ chơi. Các điều chỉnh chỉ dùng 2 đòn bẩy hợp
> đồng (reward nhiệm vụ bậc +25, spawn density) khi THIẾU — kết quả cuối: không
> thiếu ở bất kỳ mốc nào → **không thay đổi số nào**, mỗi bảng ghi rõ vì sao.

---

## 1. Chuỗi tiền (§5.1)

### 1.1 Bảng nguồn tiền (trước → sau)

| Nguồn | Giá trị (file) | Trước → sau | Lý do |
|---|---|---|---|
| Thưởng nhiệm vụ m1..m9 | 300/325/350/400/425/450/500/550/600 (`missions.js` MISSION_DEFS) | **không đổi** | Mục tiêu 1 & 2 đạt dư (bảng 1.3) — đòn bẩy hợp đồng chỉ sửa khi thiếu |
| Thưởng nhiệm vụ m10 | spec §3.7 = **600** (`missions.js` m10 def) | **không đổi** (đã đúng từ Builder A) | Frozen §3.7 |
| Kill money | walker 50 / runner 75 / brute 200 / butcher 1000 / spitter 800 / screamer 700 / golem 1500 (`economy.js:70-78`) | **không đổi** | Frozen P1/P2 |
| Kill money ORIGIN | **thiếu** (`REWARDS` không có `origin` → trả 0) | **absent → 2000** (`economy.js` — integrator bổ sung row theo §3.6) | Spec §3.0/§3.6: "rơi $2000"; headshot ×1.5 + bloodmoon ×2 áp như mọi loại. Đây là row ADDITIVE duy nhất, không đụng số cũ |
| Supply event | 200–400 + medkit + full ammo (`main.js` hooks.supplyOpened) | **không đổi** | Frozen P2 |
| Survivor | 300 + medkit (`main.js` survivor-rescued) | **không đổi** | Frozen P2 |
| Boss drop | 1 medkit + 1 ammo/boss (`bosses.js`; Origin kế thừa qua `boss-drops`) | **không đổi** | Vô hại với Origin — main route như boss thường (§3.1) |
| Shop | smg 400 / sniper 800 / minigun 1500 / grenade 1200 / ammo 150 / medkit 200 (`shop.js:89-95`) | **không đổi** | Hợp đồng §5.1 froze giá shop — không đụng |

### 1.2 Mô hình thu nhập (ƯỚC LƯỢNG — không phải đo giờ chơi)

Hệ số: giá trị kill trung bình theo composition wave (`waves.js` composition:
walker ~72% / runner 25% từ wave 2 / brute ~4% từ wave 4) =
0.72·50 + 0.24·75 + 0.04·200 ≈ **62$** cơ sở; giả định 30% headshot (×1.5) →
≈ **71–75$**/kill (hợp đồng §5.1 tự dùng "~85$" — cùng bậc). Số kill mỗi nhiệm
vụ ước lượng từ quota + lối đi (danh sách POI `missions.js`) — m1 ~25, m2 ~30,
m3 ~35, m4 ~40, m5 ~35, m6 ~40, m7 ~30, m8 ~35 (+boss), m9 ~15.

| Mốc | Thưởng lũy kế | Kill lũy kế (ước lượng) | Tổng tiền có được | Súng mới mua được |
|---|---|---|---|---|
| Xong m1 | 300 | ~1 800 | **~2 100** | smg (400) + đạn |
| Xong m2 | 625 | ~3 900 | ~4 500 | + sniper → 2/4 |
| Xong m3 | 975 | ~6 400 | **~7 400** | **+ minigun → 3/4 ✓ (trước m6)** |
| Xong m6 | 2 250 | ~14 600 | **~16 900** | **full arsenal 3900 + grenade ✓ dư rất nhiều** |
| Trước Origin (xong m9) | 3 900 | ~21 100 | **~25 000** | full 3900 + **dư ~21 000 ≫ 500 ✓** |

### 1.3 Kết luận chuỗi tiền

- **Mục tiêu 1 (≥3 súng mới đến m6)**: đạt từ m3 trong mô hình; kể cả kịch bản
  bảo thủ (0 headshot, chỉ ~60% kill ước lượng, bỏ sự kiện) ≈ 62·0.6·(số kill)
  + thưởng → xong m3 ≈ 4 300$ — vẫn đủ 3 súng (2700$) trước m6. **Không cần sửa
  reward/density.**
- **Mục tiêu 2 (full arsenal + dư ~500 đến Origin)**: đạt với biên rất rộng.
  Vượt mục tiêu là chủ ý của hệ hiện hành: phần dư là "van xả áp" cho đạn
  (150$) + medkit (200$) trong trận Origin dài và **NG+ giữ tiền** (P3-K15 —
  bắt đầu NG+ với tiền cũ để mua đạn ngay). Đòn bẩy hợp đồng chỉ định nghĩa
  hướng sửa khi THIẾU nên không giảm thưởng.
- Bloodmoon ×2 tiền kill (`economy.js`) + trận Origin trùng bloodmoon đang chạy
  = 4000$/kill origin — hành vi economy hiện có, KHÔNG special-case (đúng ghi
  nhận §3.5 của hợp đồng).

---

## 2. HP/speed zombie + boss + Origin vs hỏa lực 7 súng (§5.2)

### 2.1 DPS lý thuyết 7 súng (`weapons.js` — dmg × pellets / interval)

| Súng | Đòn | Chu kỳ | DPS thân (tất cả pellet trúng) | Ghi chú |
|---|---|---|---|---|
| pistol | 25 | semi (sàn 0.1 s) | 250 trần lý thuyết; thực bấm ~50–75 | vô hạn đạn dự phòng |
| shotgun | 12×8 = 96 | 0.9 s | **107** | 1 phát thường đủ walker |
| rifle | 18 | 0.1 s | **180** | auto chính từ đầu |
| smg | 11 | 0.0706 s (850 rpm) | **156** | 400$ |
| sniper | 110 | 1.4 s | 79 thân / **236 headshot** (×3, B6) | 800$ |
| minigun | 8 | 0.0545 s (1100 rpm) | **147** | 1500$, spin-up 0.6 s |
| grenade | 90 AoE | 1.1 s | **82** (4 m falloff) | 1200$ |

DPS THỰC THỤ endgame (minigun+rifle xen kẽ, tính reload/né/đỡ): hợp đồng
§5.2 cho khung **25–40/s bảo thủ**; mô hình uptime 40–60% cho **~120–200/s**.
Mọi tính dưới đây dùng CẢ HAI biên.

### 2.2 Bảng HP/speed (file nguồn ghi từng dòng)

| Đơn vị | HP | Speed (m/s) | Nguồn | TG hạ bởi rifle (thân) |
|---|---|---|---|---|
| walker | 100 | 2.2 | `zombie.js:83` | 6 viên ≈ 0.6 s |
| runner | 60 | 5.0 | `zombie.js:84` | 4 viên ≈ 0.4 s |
| brute | 400 | 1.4 | `zombie.js:85` | 23 viên ≈ 2.3 s |
| butcher | 1200 ×(1+wave/20) | 2.0 | `bosses.js:123` | wave 10: 1785 hp ≈ 10 s |
| spitter | 800 ×(1+wave/20) | 2.6 | `bosses.js:124` | wave 10: 1190 hp ≈ 6.6 s |
| screamer | 600 ×(1+wave/20) | 3.2 | `bosses.js:125` | wave 15: 1050 hp ≈ 5.8 s |
| golem | 2000 ×(1+wave/20) | 1.2 | `bosses.js:126` | wave 20: 4000 hp ≈ 22 s |
| **Origin** | **3000 phẳng** (không scale) | 1.6 → P3 2.4 | `origin.js` ORIGIN_MAX_HP/ORIGIN_BASE_SPEED | toàn trận ≈ 3000/180 ≈ 17 s (lý thuyết); 75–120 s theo biên bảo thủ 25–40/s |
| NG+ (P3-K9) | ×1.25 mọi đơn MỚI | ×1.1 | `waves.js` applyNgPlus + `origin.js` | walker 125 / brute 500 / Origin 3750 |

So tốc độ: player đi 4.5 / chạy 7.2 m/s (`controller.js:66`). Mọi zombie trừ
runner (5.0) đều chậm hơn player đi bộ; NG+ runner 5.5 vẫn chậm hơn sprint —
mọi thứ đều "kitable", không đơn nào bế tắc. **Không đổi.**

### 2.3 Ràng buộc "không phase nào quá 90 s" — Origin

Phase pools theo ngưỡng `origin.js` (P2 ≤ 66%, P3 ≤ 33%):

| Phase | Pool máu phải bắn | TG @25 dps (bảo thủ nhất) | TG @40 dps | TG @120–200 dps (thực endgame) |
|---|---|---|---|---|
| P1 (3000→1980) | 1020 | **41 s** | 26 s | 5–8 s |
| P2 (1980→990) | 990 | **40 s** | 25 s | 5–8 s |
| P3 (990→0) | 990 | **40 s** | 25 s | 5–8 s |

→ **Ràng buộc đạt ở cả biên bảo thủ nhất (41 s < 90 s) ở mọi phase** → giữ
hp 3000 và cooldown ×0.7 nguyên bản; phương án dự phòng của hợp đồng
(3000 → 2600 / ×0.7 → ×0.65) **không cần**. Ở biên thực (endgame đã full
arsenal) toàn trận ~25–40 s cộng 2 lần chuyển phase 1.5 s + rise 2.5 s —
ngắn nhưng đúng vai "trận kết dưới áp lực": 4 walker/12 s triệu hồi (P3:
8.4 s) + boss wave thường vẫn chạy + cap 60 (`waves.js`) giữ màn hình đông.

Kết luận §5.2: **không thay đổi số nào.**

---

## 3. Density từng khu + nhịp khu (§5.3)

Số liệu sống trong code: quota need 20/25/30/25/30 (`missions.js` MISSION_DEFS
m2..m6 — frozen P1, không đụng); spawn pool mỗi khu `city.js` SPAWNS:
safehouse **5 điểm** (×0.5 qua swap — §4.1), residential/commercial/hospital/
park/docks **6 điểm** mỗi khu, quarantine dùng 18 điểm legacy
(`level.spawnPoints`); gap spawn 0.8–1.5 s (`waves.js` GAP_MIN/MAX), cap 60,
intermission 10 s; hai hệ số giảm gap ×2/3 (quota-done khu đó; m7–m8 horde)
+ bloodmoon ×0.5 (P2-K8).

Ước lượng nhịp mỗi khu (đi bộ qua khu 115–145 m @4.5–7.2 m/s ≈ 20–35 s,
kill rate thực tế ~1 con/2–3 s giao tranh, wave cycle ~45–75 s):

| Khu (nhiệm vụ) | Quota | Pool | Ước lượng thời gian khu | Đạt 3–5 phút? |
|---|---|---|---|---|
| residential (m2) | 20 (+3 supply) | 6 | ~3–4 phút | ✓ |
| commercial (m3) | 25 (+reach) | 6 | ~3.5–4.5 phút | ✓ |
| hospital (m4) | 30 (+3 med) | 6 | ~4–5 phút | ✓ |
| park (m5) | 25 (+campfire) | 6 | ~3.5–4.5 phút | ✓ |
| docks (m6) | 30 (+4 fuel) | 6 | ~4–5 phút | ✓ |

Sau quota, gap ×2/3 làm khu "sạch" nhanh hơn (đúng ý thiết kế — grind sau
quota không kéo chân). **Không đổi quota, không đổi SPAWNS, không đổi gap.**

---

## 4. Các thay đổi số/code của P3 — tổng hợp (mọi thay đổi đều có lý do)

| # | File | Trước → sau | Lý do |
|---|---|---|---|
| 1 | `src/systems/economy.js` | REWARDS: **không có `origin` → `origin: 2000`** | Spec §3.6 bắt buộc; thiếu → kill Origin trả 0$, phá mục tiêu chuỗi tiền |
| 2 | `src/core/audio.js` | RECIPES: **thiếu `origin` → đủ 6 kind** + SHAPER_K `origin: 30` | Spec §3.8; thiếu → Origin câm lặng hoàn toàn (playVoice bỏ qua row lạ) |
| 3 | `src/zombies/waves.js` | **thiếu listener "ng-plus" → có** (hp ×1.25 / speed ×1.1 cho đơn MỚI; boss maxHp ×1.25; reset xóa cờ) | Spec §4.7/P3-K9; thiếu → NG+ mất đúng ý nghĩa "khó hơn" |
| 4 | `src/world/city.js:1591` | findVaultCollider: `c.maxZ === 2` → **`c.maxZ === -2`** (typo Builder A) | Collider vault là hộp 4×4 TRUNG TÂM (0,0) — level.js §3.2 ghi maxZ −2; sai số khiến splice/re-push câm lặng: cửa mở hình ảnh nhưng lỗ vẫn chắn đạn/chân |
| 5 | `src/ui/hud.js` | KNOWN_TYPES + BOSS_TYPES += `origin`; i18n +`bossOrigin`/`killOrigin` (EN/VI) | Boss bar Origin không tự ẩn khi chết (thanh chết treo cả trong free-roam) + label rơi về key thô — vi phạm luật i18n §1.5 |
| 6 | `src/systems/explosives.js` | **thêm `shake(mult)`** (clamp 0.25..3, tái dùng máy shake nội bộ) | §6.2/P3-K8 — rung phase/chết của Origin |
| 7 | `src/main.js` | wire P3 + guards 9→10 (P3-K2) + xóa outro m9 (P3-K4) + beginNGPlus (P3-K15) + liveBoss ưu tiên Origin (P3-K6) + freshRun: đóng vault/`ending.hide()`/re-emit "ng-plus" + debug API 4 hàm | §6 |
| 8 | Guards P3-K2 | `activeMission` clamp 0..9 → **0..10**; mission-start dialogue 1..9 → **1..10**; reAnnounceMission ≤9 → **≤10** | Chain 9→10; nếu không nới: chết ở m10 mất thoại briefing + không hồi sinh Origin full máu (P3-K7 hỏng) |

Không có bất kỳ thay đổi nào vào: giá shop, bảng REWARDS cũ, quota need,
DISTRICT_RECTS/AREA_RECTS, 12 cổng, kho spawn quarantine, số phase/số Origin.

## 5. Đo đạc thực tế — những gì ĐÃ và CHƯA chạy

| Kiểm tra | Cách chạy | Kết quả |
|---|---|---|
| node --check 12 file (mọi file touched + file builder P3) | `node --check <file>` ×12 | 12/12 OK |
| Smoke hành vi P3 (module thật, fake scene/DOM): economy origin 2000, runStats, pause "ending", m10 2 đường complete + idempotent, cascade m9→m10, NG+ ×1.25/×1.1 (thường + boss), Origin lifecycle (rise/bất tử/phase/kill/death-event order/dispose), events đóng băng 120 s, openVault idempotent + splice collider, ending state machine + FOV + hide, shake(2)/shake(10) | `node .smoke-p3.mjs` (harness tạm, đã xóa sau chạy) | **86/86 pass** |
| Hồi quy P1/P2 (chain m1..m9 đầy đủ qua interact/quota/survive/boss, gates K2/K6, reward 3900, economy spend, events forceEvent + bloodmoon exclusion, waves spawn + stats Zombie gốc) | `node .smoke-dbg.mjs` (harness tạm, đã xóa sau chạy) | **23/23 pass** |
| Import bindings của main.js (33 named imports) | script phân tích tĩnh | 33/33 resolve |
| **Buổi chơi thật (đo phút/khu, đo DPS trong trận)** | cần WebGL + pointer lock + người chơi | **KHÔNG CHẠY ĐƯỢC** trong môi trường tích hợp — mọi con số "ước lượng" ở trên là mô hình từ số code, không phải đo. Người chạy build nên đo 3 lượt qua `__game.skipToMission()` + đồng hồ theo §5.1 và chỉ cần can thiệp khi một mốc rớt dưới mục tiêu |
