# Gun Game

Game bắn súng góc nhìn thứ nhất (FPS) sinh tồn zombie trong một đấu trường đêm 60×60 m — nay mở rộng thêm **2 khu vực mới, 4 boss, 4 súng mới, tiền + cửa hàng và tự nạp đạn** — viết bằng **Three.js + Vite** (ES modules thuần, không framework). Sống sót qua từng đợt wave ngày càng đông, săn headshot để ghi điểm và phá kỷ lục của chính mình.

![Ảnh chụp màn hình](docs/screenshots/smoke.png)

## Cách chạy

Cần Node.js đã cài sẵn trên máy.

```bash
# 1. Cài phụ thuộc
npm install

# 2. Chạy máy dev (cổng mặc định 5173)
npm run dev
```

Mở **http://localhost:5173** trong trình duyệt (vì cấu hình `host: true`, máy khác trong LAN cũng truy cập được qua IP của bạn).

Hoặc chạy bản build production:

```bash
npm run build     # xuất bản build vào dist/
npm run preview   # phục vụ dist/ tại http://localhost:4173
```

## Điều khiển

| Phím / thao tác | Hành động |
|---|---|
| `W` `A` `S` `D` | Di chuyển |
| `Shift` (trái/phải) | Chạy nhanh (×1.6 tốc độ đi bộ) |
| `Space` | Nhảy |
| Chuột | Ngắm (pointer lock) |
| Chuột trái | Bắn |
| `R` | Nạp đạn |
| `E` | **Tương tác** — kích hoạt máy phát điện / đống lửa trại, nhặt vật phẩm nhiệm vụ (gói tiếp tế, hộp thuốc, can xăng); nhắc **"E — TƯƠNG TÁC"** hiện khi đứng gần điểm tương tác |
| `1` `2` `3` hoặc con lăn chuột | Đổi súng |
| `4` `5` `6` `7` | Đổi sang súng mua trong cửa hàng: `4` SMG · `5` Sniper · `6` Minigun · `7` Grenade Launcher (đổi súng chỉ luân chuyển trong các súng **đã sở hữu**) |
| `B` | Mở / đóng **CỬA HÀNG** (game tạm dừng khi cửa hàng mở; `Esc`/`B` để đóng) |
| `Esc` (hoặc `P`) | Tạm dừng / tiếp tục |

## Tính năng

- **7 loại súng** với cơ chế riêng — 3 súng khởi đầu (pistol 25 dmg / đạn dự trữ vô hạn, shotgun 8×12 dmg mỗi phát, rifle auto 600 phát/phút) và **4 súng mua trong cửa hàng**:

  | Súng | Chế độ | Điểm mạnh |
  |---|---|---|
  | SMG ($400) | auto 850 vòng/phút | mag 32, 11 dmg/viên — dồn đạn liên thanh |
  | Sniper ($800) | bolt, 1.4 s giữa hai phát | 110 dmg, **headshot ×3** |
  | Minigun ($1500) | quay nòng 0.6 s trước phát đầu, auto 1100 vòng/phút | mag 150 — xả không kịp nạp |
  | Grenade Launcher ($1200) | pump 1.1 s | **đạn nổ**: bán kính 4 m, 90 dmg giảm tuyến tính về 0 ở mép vùng; nổ khi chạm zombie / mặt đất / tường–vật che, hoặc sau 1.2 s — bắn vào vật che thì nổ ngay tại đó, không xuyên qua |

  Mọi súng đều có giật, độ tản đạn, thời gian nạp đạn và đèn nháy đầu nòng riêng.
- **Tự nạp đạn**: phát bắn làm băng đạn về 0 mà còn đạn dự trữ → **tự động nạp sau 0.35 s** (một lần; đổi súng sẽ hủy). Kéo cò khi hết băng mà còn dự trữ → **click khô + nạp ngay**. Hết cả băng lẫn dự trữ → chỉ khô đạn như cũ.
- **Tiền + cửa hàng**: hạ zombie được tiền (walker $50, runner $75, brute $200, **headshot +50%**; boss $700–$1500 — bảng dưới). Nhấn `B` mở cửa hàng; tiền reset về 0 mỗi lần chạy mới.
- **3 loại zombie thường**: Walker (100 HP, chậm, 15 sát thương), Runner (60 HP, nhanh, xuất hiện từ wave 2), Brute (400 HP, trâu bò, xuất hiện từ wave 4). Mỗi loại có model, màu da và tốc độ riêng. Chết có 18% rơi vật phẩm — 70% hộp đạn (+1 băng đạn cho súng đang cầm), 30% blood bag (+40 HP, tối đa 100).
- **Khu vực + boss**: hai khu mới mở dần theo wave (bản đồ dưới); **mỗi wave chia hết 5 là BOSS WAVE** — lượng minion giảm nửa (dồn trong 6 s đầu) và một boss xuất hiện ở khu đã mở, luân phiên butcher → spitter → screamer → golem. Wave chỉ tính sạch khi cả boss lẫn minion đều gục.
- **Headshot**: bắn trúng đầu nhân đôi sát thương (sniper ×3) và nhân 1.5 điểm thưởng.
- **High score**: điểm cao nhất được lưu tự động vào `localStorage` (kèm thiết lập chuột, âm lượng, ngôn ngữ).
- **Song ngữ EN/VI**: đổi tiếng Anh / tiếng Việt ngay trong màn Settings (cùng với độ nhạy chuột 0.5–3.0 và âm lượng 0–1).

## Cửa hàng (phím `B`)

| Mặt hàng | Giá | Tác dụng |
|---|---|---|
| SMG (Tiểu liên SMG) | $400 | Súng mới — auto 850 vòng/phút, mag 32 |
| Sniper (Súng bắn tỉa) | $800 | Súng mới — bolt 1.4 s, 110 dmg, headshot ×3 |
| Minigun | $1500 | Súng mới — quay nòng 0.6 s, auto 1100 vòng/phút, mag 150 |
| Grenade Launcher (Súng phóng lựu) | $1200 | Súng mới — pump 1.1 s, bắn đạn nổ (mag 4) |
| Nạp đạn (Ammo Refill) | $150 | Nạp **ĐẦY đạn dự trữ mọi súng đang sở hữu** (mua lại được nhiều lần) |
| Medkit (Túi cứu thương) | $200 | Hồi **đầy 100 HP** (mua lại được nhiều lần) |

Không mua trùng súng đã sở hữu; không đủ tiền thì nút mua mờ đi. Pistol / shotgun / rifle sở hữu miễn phí từ đầu.

## Bảng 4 boss (wave chia hết 5) — đòn đặc trưng + cách né

| Boss (EN / VI) | HP (×1 + wave/20) | Tốc độ | Đòn đặc trưng | Cách né |
|---|---|---|---|---|
| **The Butcher / Đồ Tể** (đỏ thẫm, dao lớn) | 1200 | 2.0 | Mỗi 6 s **dồn lực 0.8 s** (phát sáng đỏ + gầm) rồi **CHƠI THẲNG 14 m**: chạm player **40 dmg + hất lùi**; cận chiến 35 dmg | Khi nó đỏ lửa và gầm, **bước ngang** khỏi đường thẳng — nó chỉ lao thẳng, không rình theo |
| **The Spitter / Phun Acid** | 800 | 2.6 | Giữ khoảng cách **10–16 m** (đi lùi nếu bạn áp sát); mỗi 2.5 s **nhổ cầu acid**: trúng **18 dmg** + vũng acid 2 m tồn tại 4 s gây 6 dmg/s | Vay ngang liên tục khi nó ngửa đầu; **đừng đứng trong vũng xanh**; áp sát buộc nó lùi vào tường |
| **The Screamer / Gào Thét** | 600 | 3.2 | Mỗi 8 s **GÀO**: vòng sóng trắng — player trong **8 m bị đẩy lùi 4 m + 10 dmg**; mỗi lần gào **triệu hồi 3 zombie** (runner nếu wave ≥ 6) | Giữ khoảng cách **> 8 m** hoặc đứng sau thùng/xe khi nó hít hơi; hạ nhanh zombie bị triệu hồi |
| **The Golem / Người Đá** (thân đá, to nhất) | 2000 | 1.2 | **Giảm 25% sát thương nhận**; mỗi 6 s nếu bạn < 6 m → **ĐẬP ĐẤT**: vòng sóng lan 8 m trong 0.6 s, **30 dmg + hất bay** | Thấy nó giơ tay thì **lùi khỏi bán kính 8 m** trước khi vòng chạm tới; đừng ôm sát đánh giáp mặt |

Boss gục **rơi CHẮC 1 medkit + 1 ammo** tại chỗ gục; thưởng tiền: The Butcher $1000 / The Spitter $800 / The Screamer $700 / The Golem $1500.

## Bản đồ 2 khu mở rộng

```
            ┌──────────────────────┐
            │  NORTH · "Sân sau"   │  ~30×24 m — mở sau khi clear WAVE 2
            │  thùng gỗ + xe hỏng  │
            └──────────┬─Gate──────┘
 ┌──────────────────────┴──────────────────────┐
 │               ARENA 60×60 m                 │
 │              (spawn tại tâm)                │
 └──────────────────────┬──────────────────────┘
            ┌───Gate────┴──────────────┐
            │  EAST · "Kho"            │  ~24×30 m — mở sau khi clear WAVE 4
            │  kệ hàng + container     │
            └──────────────────────────┘
```

- Hai khu nối arena chính qua **khoảng hở trong tường rào**, mỗi cửa có **khung cổng phát sáng + biểu tượng**.
- Trước khi mở, cổng **bị chặn kín** — player không đi lọt và wave không sinh minion trong khu; clear đúng wave thì cổng mở kèm toast **"KHU VỰC MỚI MỞ"**.
- Boss wave sinh boss tại **anchor trong khu đã mở** (luân phiên north/east theo thứ tự boss).
- Zombie biết **đi vòng qua cổng** khi tường chắn đường — kể cả từ khu này sang khu kia.

## ĐÊM THỨ 30 — Phần 1: Thế giới mở

Bản mở rộng cốt truyện: thành phố **~260×260 m gồm 7 khu** bao quanh đấu trường cũ (nay là Vùng Cách Ly), chuỗi **9 nhiệm vụ** và hệ thống cổng phong toả mở dần theo tiến trình.

### Bản đồ 7 khu

```
┌───────────────────────────┬───────────────────────────┐
│  RESIDENTIAL (quota 20)   │  COMMERCIAL (quota 25)    │
│  Khu Dân Cư — nhà phố     │  Phố Thương Mại — plaza   │
├───────────────┬───────────┴───────────┬───────────────┤
│  SAFEHOUSE    │ QUARANTINE — Vùng     │  HOSPITAL     │
│  An Toàn Nhà  │ Cách Ly (arena cũ     │  (quota 30)   │
│  (hub, M1)    │ 60×60 · khoá đến M6)  │  Bệnh Viện    │
├───────────────┴───────────┬───────────┴───────────────┤
│  DOCKS (quota 30)         │  PARK (quota 25)          │
│  Bến Cảng — container     │  Công Viên — hồ, lửa trại │
└───────────────────────────┴───────────────────────────┘
```

| Khu (EN / VI) | Quota zombie | Nhiệm vụ chính |
|---|---|---|
| Safehouse · An Toàn Nhà | — (hub) | **M1 — Sáng Đèn / Lights On**: bật 3 máy phát điện |
| Residential · Khu Dân Cư | 20 | **M2 — Đường Phố / Dead Blocks**: quota 20 + 3 gói tiếp tế |
| Commercial · Phố Thương Mại | 25 | **M3 — Tiếng Radio / The Signal**: quota 25 + tới đài phát thanh |
| Hospital · Bệnh Viện | 30 | **M4 — Thuốc Cho Bệnh Nhân / Medicine Run**: quota 30 + 3 hộp thuốc |
| Park · Công Viên | 25 | **M5 — Lửa Trại Cầu Cứu / Signal Fire**: quota 25 + bật đống lửa |
| Docks · Bến Cảng | 30 | **M6 — Nhiên Liệu / Fuel Run**: quota 30 + 4 can xăng |
| Quarantine · Vùng Cách Ly | — (vào bằng nhiệm vụ) | **M7 — Vào Tâm Dịch / Into the Swarm** (trụ 60 s) · **M8 — Vệ Binh Cách Ly / The Warden** (hạ boss) · **M9 — Cánh Cửa Cuối / The Last Door** (tới cửa thép trung tâm) |

Thưởng nhiệm vụ: $300 → $600 tăng dần (m1 $300, m2 $325, m3 $350, m4 $400, m5 $425, m6 $450, m7 $500, m8 $550, m9 $600).

### Cổng phong toả + quota

- 7 khu nối nhau bằng **12 cổng thép** có khung phát sáng: **đỏ = khoá, xanh lục = mở**. Xong nhiệm vụ của khu (quota zombie trong khu **và** mục tiêu phụ) → rào chắn **chìm xuống đất trong 1 s**, khung đổi đỏ → xanh, kèm tiếng rền và toast **"CỔNG MỞ — {tên khu}"**.
- **Quota** chỉ đếm zombie thường (walker / runner / brute) hạ **nội trong khu** đó; bộ đếm **"🧟 12/20"** hiện cạnh Wave khi bạn đứng trong khu có quota. Khu đạt quota thì zombie trong khu sinh **dày hơn ~50%**.
- Zombie (tối đa **60 đồng thời**) sinh ra theo **khu bạn đang đứng**; boss wave mỗi 5 wave vẫn giữ nguyên — boss xuất hiện tại khu bạn đang chiến đấu (không bao giờ bị nhốt sau cổng đóng).
- Cửa đóng lại khi bắt đầu một lượt chạy mới (trừ hồi sinh **giữ tiến trình** sau khi chết từ nhiệm vụ 2 — phần thành quả mở cửa của bạn được giữ lại).

### Phím E — tương tác

Đứng gần điểm nhiệm vụ phát sáng (máy phát điện, gói tiếp tế, hộp thuốc, can xăng, đống lửa trại…) trong **3 m** → chip **"E — TƯƠNG TÁC"** hiện cạnh tâm màn hình kèm tên mục tiêu. Bấm `E` trong **2 m** để kích hoạt / nhặt: máy phát và lửa trại bật sáng vĩnh viễn, vật phẩm nhặt biến mất khỏi thế giới.

### Cốt truyện — 9 nhiệm vụ

- **PLAY** khởi động cốt truyện: 4 slide intro chữ trắng nền đen mờ dần → nhiệm vụ 1. **CHƠI TỰ DO** bỏ qua intro, nhiệm vụ 1 active ngay.
- Thoại hiện **từng ký tự** trong hộp dưới màn hình với 3 giọng: GIỌNG RADIO · BẠN · KHÔNG RÕ (click chuột hoặc `E` để bỏ qua nhanh). Kết thúc M9 là outro 3 dòng — dòng giữa hiện dạng **banner chữ hoa** ("HẾT PHẦN 1 — …") — rồi vào chế độ chơi tự do.
- Chết từ **nhiệm vụ 2 trở lên**: "PLAY AGAIN" **giữ nguyên tiền + tiến trình nhiệm vụ**, hồi sinh tại An Toàn Nhà. Chết ở nhiệm vụ 1 hoặc chơi CHƠI TỰ DO: reset sạch như cũ.

<details>
<summary><b>SPOILER — tóm tắt cốt truyện (bấm để mở)</b></summary>

Bạn là người sống sót cuối của tổ hợp cách ly, liên lạc duy nhất qua một chiếc radio cũ. Giọng dẫn đường giao từng nhiệm vụ: thắp sáng khu an toàn, dọn từng khu phố, tìm thuốc cho bệnh nhân, đốt lửa cầu cứu, chở nhiên liệu — từng bước khép lại vành đai cổng để tiến vào tâm dịch bị niêm kín. Nhưng trong những bản tin sau, một **giọng thứ hai** xen vào sóng — không ai biết nó phát từ đâu, và nó dường như muốn bạn tiến **sâu hơn vào tâm cách ly**…

</details>

### Debug API (`window.__game`)

Bổ sung cho bảng debug sẵn có trên console (các phím cũ như `spawnZombie`, `spawnBoss`, `teleport`, `giveMoney`… giữ nguyên):

| Method | Hành vi |
|---|---|
| `startStory()` | Chạy story mới như bấm PLAY (intro slides) |
| `skipToMission(n)` | Đánh m1..m(n−1) hoàn thành (cổng tương ứng mở), active nhiệm vụ n |
| `completeObjective()` | Force-complete mục tiêu đầu tiên chưa xong của nhiệm vụ hiện tại |
| `fillQuota()` | Lấp đầy quota của nhiệm vụ hiện tại |
| `teleportDistrict(id)` | Mở mọi cổng trên đường BFS ngắn nhất rồi dịch chuyển tới tâm khu (`safehouse`/`residential`/`commercial`/`hospital`/`park`/`docks`/`quarantine`) |
| `getState()` | Snapshot mở rộng: thêm `story` (nhiệm vụ + objectives), `currentDistrict`, `unlockedDistricts` |

## Cấu trúc source

```
src/
├── core/        # Nền tảng: engine.js (renderer/scene/camera), input.js (phím + chuột + pointer lock),
│                # audio.js, settings.js (localStorage), i18n.js (EN/VI), debug.js (window.__game)
├── world/       # Môi trường: level.js (sân 60×60 m + 2 khu, tường, cửa cổng, vật cản + collider XZ),
│                # zones.js (khoá/mở 2 khu), atmosphere.js (trời đêm, sương mù, đèn nhấp nháy)
├── player/      # Người chơi: controller.js (di chuyển/nhảy/va chạm), weapons.js (7 súng, tự nạp đạn, recoil, viewmodel)
├── zombies/     # Kẻ địch: zombie.js (model + AI đuổi/đi qua cổng/tấn công + animation chết),
│                # bosses.js (4 boss), waves.js (điều phối wave + boss wave)
├── systems/     # Gameplay: combat.js (hitscan + tường chặn đạn), particles.js, pickups.js,
│                # explosives.js (đạn nổ), economy.js (tiền), shop.js (cửa hàng),
│                # gamestate.js (state machine, điểm, high score, bus sự kiện chung)
├── ui/          # Giao diện: hud.js (máu/đạn/điểm/tiền/thanh máu boss/kill feed), shop.js (overlay cửa hàng),
│                # menus.js (menu, pause, settings, game over)
└── main.js      # Bootstrap + vòng lặp game + nối dây mọi module qua bus
```
