# Gun Game — Hướng dẫn người chơi

Hướng dẫn đầy đủ cho **Gun Game** — FPS sinh tồn zombie viết bằng Three.js + Vite. Từ phím bấm, **12 khẩu súng**, 6 loại zombie, 4 boss, Nguồn Gốc, cốt truyện 10 nhiệm vụ, hồ sơ nhân vật, đến **Thương Lái, bom ném, XP + 12 kỹ năng, hợp đồng, thời tiết có ảnh hưởng gameplay, động vật, người sống sót và barel nổ dây chuyền** — cùng **Boss Rush 5 boss, phụ tùng súng, hai đồng đội Mai & Eli, sét bão, chế độ ảnh, sao lưu JSON, vòng vũ khí 12 ô, bảng xếp hạng local, thử thách hằng ngày và lưu đám mây**.

> Trong game, bấm `H` để mở sổ tay ba tab **ĐIỀU KHIỂN · ZOMBIE · HỒ SƠ**. Hướng dẫn này là bản đầy đủ; phần spoiler được đánh dấu rõ.

## 1. Bắt đầu

Cần **Node.js** `^20.19.0` hoặc `>=22.12.0` (yêu cầu của Vite 8): `npm install` → `npm run dev` → mở `http://localhost:5173`. Bản build: `npm run build` → `npm run preview` (`http://localhost:4173`). Vite bật `host: true`, nên máy khác trong LAN mở được bằng IP của bạn.

| Nút menu | Ý nghĩa |
|---|---|
| **TIẾP TỤC** | Khôi phục save tự động; chỉ hiện khi save hợp lệ |
| **CHƠI** | Cốt truyện: intro điện ảnh 4 slide → nhiệm vụ 1 |
| **CHƠI TỰ DO** | Bỏ intro, vào thẳng thế giới, nhiệm vụ 1 active |
| **SINH TỒN** | Vô tận ở Vùng Cách Ly, không có chuỗi nhiệm vụ |
| **ĐẤU BOSS** | **Boss Rush**: 5 boss liên tiếp ở Vùng Cách Ly (xem mục 16) |
| **THỬ THÁCH NGÀY** | **Daily Challenge**: Boss Rush với modifier cố định theo ngày + thời tiết ép buộc (xem 17.3) |
| **BẢNG XẾP HẠNG** | Top 10 Boss Rush local, tab **TẤT CẢ / HẰNG NGÀY** (xem 17.2) |
| **CÀI ĐẶT** | Độ nhạy, âm lượng, EN/VI, độ khó, **trợ năng** (FOV, rung, tâm ngắm, số sát thương, giảm chuyển động) |
| **HƯỚNG DẪN** | Sổ tay ba tab (như phím `H`) |
| **ĐIỀU KHIỂN** | Mở thẳng tab ĐIỀU KHIỂN của sổ tay |
| **HUẤN LUYỆN** | Chạy lại tutorial 9 bước |
| **HỒ SƠ** | Mở thẳng tab HỒ SƠ (dossier) của sổ tay |
| **THÀNH TỰU** | 12 thành tựu + thống kê trọn đời |
| **DỮ LIỆU LƯU** | Xuất / nhập toàn bộ tiến trình bằng JSON cục bộ (xem 16.3) |
| **LƯU ĐÁM MÂY** | Sao lưu / khôi phục 7 key tiến trình bằng mã 10 ký tự (xem 17.4) — nút rộng full hàng |

Menu chính có **15 nút** (TIẾP TỤC ẩn khi chưa có save) trong **lưới 2 cột**; **CHƠI** (primary) và **LƯU ĐÁM MÂY** (`btn-wide`) trải full cả hai cột. Dưới **520 px** ngang tự về 1 cột. Ở màn hình thấp **≤ 780 px** (720p), panel tự thu gọn padding / cỡ tiêu đề / khoảng cách nút để vừa một màn hình không cuộn.

**Tutorial lần đầu** gồm 9 bước: di chuyển → chạy → bắn → nạp → đổi súng → nhảy → tương tác → cửa hàng → sổ tay. Bước chỉ tiến khi làm đúng và tự nhảy sau **20 s**; hoàn thành hoặc **BỎ QUA** ghi cờ `gungame.tutorial.v1`. Chạy lại bằng nút **HUẤN LUYỆN**.

**HUD:** máu + **giáp** + tiền góc trái; đạn `băng / dự trữ` + tên súng góc phải (pistol hiện `∞`); wave + điểm trên cùng; thanh máu boss ngay dưới; **thanh 12 ô vũ khí** ở đáy (ô đang cầm sáng vàng, ô chưa mua mờ + ổ khoá, ô đang nạp có dấu riêng); **chip thời tiết** góc trái trên (`CLEAR / RAIN / STORM / FOG` + % cường độ, `LOW VIS` khi sương); **chip bom** ngay trên ô đạn (`F NÉM · V ĐỔI`); **dòng LV + thanh XP**; tâm ngắm giãn theo spread; hitmarker trắng/đỏ khi headshot; kill feed 3 dòng; compass strip chỉ hướng; bản đồ `M` 7 khu. Giữ `Q` mở **vòng vũ khí 12 ô**.

**Bảy khu:** An Toàn Nhà (hub, M1) · Khu Dân Cư (quota 20, M2) · Phố Thương Mại (25, M3) · Bệnh Viện (30, M4) · Công Viên (25, M5) · Bến Cảng (30, M6) · Vùng Cách Ly (M7–M10). Quota chỉ đếm **walker / runner / brute** hạ **trong đúng khu**; crawler, bloater, armored và boss không tính.

## 2. Điều khiển

| Phím / thao tác | Hành động |
|---|---|
| `W` `A` `S` `D` | Di chuyển |
| `Shift` trái/phải | Chạy nhanh (×1.6 tốc độ đi bộ) |
| `Space` | Nhảy |
| Chuột | Ngắm — cần pointer lock (bấm vào canvas) |
| Chuột trái | Bắn |
| `R` | Nạp đạn |
| Giữ `Q` | **Vòng vũ khí 12 ô** — hướng chuột / con lăn / phím số để chọn, thả `Q` xác nhận, `Esc` hủy |
| `1` `2` `3` | Pistol · Shotgun · Rifle (miễn phí từ đầu) |
| `4` `5` `6` `7` `8` `9` `0` | SMG · Sniper · Minigun · Grenade · Magnum · DMR · Railgun (chỉ khi đã mua) |
| `-` `=` | Sawn-off · Crossbow (chỉ sau khi mua từ Thương Lái) |
| Con lăn chuột | Luân chuyển trong các súng **đã sở hữu** |
| `F` | Ném / đặt bom đang chọn (frag · molotov · mìn) |
| `V` | Đổi loại bom (bỏ qua loại đã hết) |
| `E` | Tương tác: máy phát, lửa trại, tiếp tế, thuốc, xăng |
| `G` | Thương Lái — đứng trong **4.5 m** ở An Toàn Nhà (game tạm dừng) |
| `T` | Bảng hợp đồng — đứng trong **3.5 m** ở An Toàn Nhà (game tạm dừng) |
| `B` | Cửa hàng — **game tạm dừng** |
| `M` | Bản đồ — chỉ khi đang chơi |
| `H` | Sổ tay — **game không tạm dừng** khi mở giữa trận |
| `Esc` hoặc `P` | Tạm dừng / tiếp tục |
| `F2` | **Chế độ ảnh** — mở/đóng (chỉ khi đang chơi) |
| `F4` | Trong chế độ ảnh: lưu khung hình **PNG** |
| `F5` | **Xuất dữ liệu lưu** ra JSON (mọi trạng thái) |
| `F9` | **Nhập dữ liệu lưu** từ JSON rồi tải lại trang |
| `F3` | Bật/tắt FPS counter |
| Chuột trái hoặc `E` (khi có thoại) | Bỏ qua nhanh dòng thoại |

- **`Q`**: giữ để mở vòng 12 ô khi đang chơi; game **tạm dừng**, pointer lock nhả ra. Hướng chuột chọn theo góc (30°/ô, dead-zone 18 px), con lăn xoay ±1, phím `1`…`9`/`0`/`-`/`=` nhảy thẳng. Thả `Q` xác nhận; `Esc` hủy và trả lại súng cũ. Ô chưa mua hiện ổ khóa + toast **ĐÃ KHÓA**; không mở khi shop / sổ tay / Thương Lái / perk / hợp đồng / panel Boss Rush / ảnh / bản đồ đang mở.
- **`E`**: chip “E — TƯƠNG TÁC” hiện trong **3 m**; bấm `E` trong **2 m** mới kích hoạt/nhặt.
- **`G`**: chip “G — THƯƠNG LƯỢNG” trong **4.5 m**; ngoài tầm thì hiện nhắc “Tìm Thương Lái ở An Toàn Nhà”. `G` / `Esc` đóng.
- **`T`**: chip “T — HỢP ĐỒNG” trong **3.5 m**; `T` / `Esc` đóng. Bảng mở thì game tạm dừng.
- **`F` / `V`**: im lặng khi cửa hàng / sổ tay / Thương Lái / bảng hợp đồng đang mở hoặc khi con trỏ đang trong ô nhập.
- **`H`**: ba tab ĐIỀU KHIỂN / ZOMBIE / HỒ SƠ; `←` `→` `Home` `End` chuyển tab; `H`/`Esc` đóng; cửa hàng mở thì `H` im lặng. Sổ tay chỉ là lớp tra cứu — zombie vẫn tiến khi bạn mở nó.
- **`M`**: bản đồ chỉ xem, không chặn chuột; cửa hàng mở thì `M` im lặng.
- **`F2`**: chỉ mở từ trạng thái **đang chơi** và không mở khi shop / sổ tay / Thương Lái / perk / hợp đồng đang hiện. Mở ảnh → game tạm dừng, HUD ẩn; `Esc` / `F2` / nút **ĐÓNG** để thoát.
- **`F4`**: chỉ có tác dụng khi chế độ ảnh đang mở — lưu PNG `gun-game-photo-<timestamp>.png`.
- **`F5` / `F9`**: hoạt động ở **mọi trạng thái**, kể cả menu; bị bỏ qua khi đang gõ trong ô nhập hoặc giữ Ctrl/Meta/Alt. `F5` xuất, `F9` mở hộp chọn file để nhập.
- Nút menu **ĐẤU BOSS** mở Boss Rush; nút **DỮ LIỆU LƯU** mở bảng xuất/nhập (không cần đang chơi).

## 3. Vũ khí & nâng cấp

| Khe | Súng | Giá | Cơ chế | Sát thương | Băng / dự trữ | Nạp | Headshot | Vai trò |
|---|---|---|---|---|---|---|---|---|
| `1` | Pistol | Khởi đầu · $0 | bán tự động, chặn spam 0.1 s | 25 | 12 / ∞ | 1.2 s | ×2 | Đạn vô hạn; dọn walker lẻ, tiết kiệm đạn đắt |
| `2` | Shotgun | Khởi đầu · $0 | pump 0.9 s | 12 × 8 viên | 6 / 24 | 2.0 s | ×2 | Cận chiến; cứu nguy khi crawler/runner áp sát |
| `3` | Rifle | Khởi đầu · $0 | auto 600 vòng/phút | 18 | 30 / 90 | 1.8 s | ×2 | All-rounder cho phần lớn trận |
| `4` | SMG | Cửa hàng · $400 | auto 850 vòng/phút | 11 | 32 / 160 | 1.6 s | ×2 | Dồn đạn gần–trung, dự trữ rất nhiều |
| `5` | Sniper | Cửa hàng · $800 | bolt 1.4 s | 110 | 5 / 25 | 2.4 s | **×3** | Mở màn boss, headshot elite/armored từ xa |
| `6` | Minigun | Cửa hàng · $1500 | quay nòng 0.6 s rồi auto 1100 vòng/phút | 8 | 150 / 300 | 3.6 s | ×2 | Trụ boss/dọn bầy; quay nòng trước khi ló ra |
| `7` | Grenade | Cửa hàng · $1200 | pump 1.1 s, đạn nổ | 90 tại tâm, giảm tuyến tính về 0 ở 4 m | 4 / 12 | 2.6 s | — | Dọn cụm ở cổng/hành lang; nổ khi chạm zombie, đất, tường hoặc sau 1.2 s |
| `8` | Magnum | Cửa hàng · $950 | bán tự động 0.35 s | 85 | 6 / 36 | 2.2 s | ×2.5 | Súng lục nặng, chính xác; headshot 212.5 |
| `9` | DMR | Cửa hàng · $700 | bán tự động 0.22 s | 52 | 10 / 70 | 2.0 s | ×2.5 | Bắn tỉa nhịp nhanh, spread thấp; headshot 130 |
| `0` | Railgun | Cửa hàng · $1800 | bolt 1.1 s | 240 | 3 / 12 | 3.0 s | ×2 | Một phát xoá brute/elite; headshot 480; spread 0 |
| `-` | Sawn-off | **Thương Lái** · $650 | pump 0.55 s | 14 × 10 viên | 2 / 30 | 1.8 s | ×2 | Hai nòng cưa, spread 0.09 — sát thương cực cao ở cự ly gần |
| `=` | Crossbow | **Thương Lái** · $750 | bolt 1.6 s | 150 | 1 / 24 | 1.7 s | **×3** | Nỏ im lặng, spread 0.001, không nháy nòng; headshot 450 |

ID nội bộ: `pistol` · `shotgun` · `rifle` · `smg` · `sniper` · `minigun` · `grenade` · `magnum` · `dmr` · `railgun` · `sawnoff` · `crossbow`.

- **Đổi súng draw 0.2 s** (trước 0.3 s) — không bắn được trong lúc draw; áp dụng cả khi chọn từ vòng `Q`.
- **Grenade** không gây sát thương lên chính bạn; có thể bắn vào chân zombie đang bám.
- **Minigun** chỉ bắn sau 0.6 s giữ cò; nhả cò, nạp hoặc đổi súng reset trạng thái quay nòng.
- **Pistol** là nguồn đạn vô hạn duy nhất — đừng ngại dùng để dọn rác giữa các đợt.

**Nâng cấp** (mỗi súng đã sở hữu, 3 nhánh × 3 cấp, mua trong `B`):

| Nhánh | Giá 0→1 / 1→2 / 2→3 | Hiệu quả |
|---|---|---|
| Sát thương | $250 / $500 / $1000 | dmg ×(1 + 0.2×cấp) → ×1.2 / ×1.4 / ×1.6 |
| Băng đạn | $250 / $500 / $1000 | mag = floor(gốc ×(1 + 0.25×cấp)) → ×1.25 / ×1.5 / ×1.75 |
| Tốc độ nạp | $250 / $500 / $1000 | thời gian nạp ×(1 − 0.12×cấp) → ×0.88 / ×0.76 / ×0.64 |

Tối đa **$1750**/nhánh. Ví dụ: Pistol sát thương cấp 3 = **40 dmg**; Sniper băng cấp 3 = **8 viên**; Pistol nạp cấp 3 = **~0.77 s**. Nâng cấp áp dụng cho **mọi súng đã sở hữu** — kể cả Sawn-off / Crossbow mua từ Thương Lái. Nâng cấp reset khi chơi lượt mới, nhưng **NG+ / chết-restart trong NG+ / TIẾP TỤC** khôi phục lại.

**Ưu tiên gợi ý:** SMG ($400) sớm → DMR ($700) hoặc Sniper ($800) trước wave 5 → nâng sát thương khẩu dùng nhiều nhất → nâng băng cho Minigun/SMG, nạp cho Sniper/Magnum → Magnum/Grenade → Minigun/Railgun. Một khẩu được nâng thường tốt hơn ba khẩu stock.

**Phụ tùng Thương Lái** (tab **PHỤ TÙNG**, xem bảng đầy đủ ở mục 9): 4 món gắn vào **súng đang cầm**, mỗi súng tối đa **1 bản/món**, kho **2 món/lượt/loại**. Kính ngắm `$450` (−35% spread), băng mở rộng `$400` (+50% băng sau nâng cấp), giảm thanh `$500` (−25% giật, −20% spread), laser `$350` (−25% spread + chấm đỏ). Hiệu ứng **nhân dồn** với nâng cấp và perk; kính + giảm thanh + laser = spread **×0.39**. Phụ tùng lưu trong save và khôi phục khi **TIẾP TỤC**; Sawn-off / Crossbow cũng gắn được.

## 4. Sinh vật

### 4.1 Sáu loại thường

| Loại | HP | Tốc độ | Sát thương | Điểm | Tiền | Xuất hiện | Đặc tính & cách chống |
|---|---:|---:|---:|---:|---:|---|---|
| **Walker** | 100 | 2.2 m/s | 15 | 100 | $50 | Story wave 1+ | Chậm, lì, đi từ mọi hẻm; headshot ×2 rút ngắn nửa thời gian hạ |
| **Runner** | 60 | 5.0 m/s | 10 | 150 | $75 | Story wave 2+ | Lao nước rút; shotgun/SMG ở gần hạ rất nhanh |
| **Brute** | 400 | 1.4 m/s | 35 | 400 | $200 | Story wave 4+ | Bức tường thịt; đạn thân phí đạn — dùng shotgun/sniper hoặc headshot |
| **Crawler** | 45 | 6.2 m/s | 8 | 175 | $60 | Story wave 3+ · Sinh Tồn wave 2+ | Nhanh nhất, bò dưới đường ngắm, tầm đánh **1.4 m**; dùng súng tản/auto, headshot gần như không thể |
| **Bloater** | 260 | 1.15 m/s | 30 | 500 | $300 | Story wave 6+ · Sinh Tồn wave 4+ | Túi độc vỡ khi chết: **25 dmg trong 4 m**, vòng xanh 1.2 s; hạ từ xa |
| **Armored** | 320 | 1.7 m/s | 28 | 450 | $350 | Story wave 9+ · Sinh Tồn wave 6+ | Giáp chặn **35%** sát thương vào thân (×0.65); **headshot xuyên giáp** |

Điểm và tiền là hai đường riêng. Headshot nhân **1.5 điểm** và **+50% tiền**. Chết có **18%** rơi vật phẩm: 70% hộp đạn (+1 băng cho súng đang cầm), 30% blood bag (+40 HP, tối đa 100).

### 4.2 Bốn biến thể tinh anh (Elite)

Zombie **thường** có thể biến thể; **boss, minion triệu hồi và debug spawn thì không**. Dấu hiệu: vòng sáng màu dưới chân + mắt đổi màu.

- **Story từ wave 4**, **Sinh Tồn từ wave 3**.
- Tỉ lệ mỗi con: `min(22%, 6% + wave × 0.4%)`; **wave boss giảm nửa**.
- Tối đa **25% quân số minion của wave** (làm tròn xuống) thành elite; elite không đổi loại gốc (Armored Ironhide vẫn là Armored).

| Biến thể | Màu | Thay đổi | Thưởng |
|---|---|---|---|
| **Frenzied (Cuồng Loạn)** | cam đỏ | Tốc ×1.45 · dmg ×1.15 · HP ×0.9 · cỡ ×1.08 | Tiền ×1.6 · điểm ×1.3 |
| **Ironhide (Da Sắt)** | xanh xám | HP ×2.2 · dmg ×1.1 · tốc ×0.92 · cỡ ×1.12 · **thân −20%** | Tiền ×1.8 · điểm ×1.5 |
| **Toxic (Độc Tố)** | xanh lá | HP ×1.3 · tốc ×1.05 · dmg ×1.1 · **nổ 15 dmg / 2.5 m** | Tiền ×1.5 · điểm ×1.35 |
| **Giant (Khổng Lồ)** | vàng | Cỡ ×1.45 · HP ×1.8 · dmg ×1.35 · tốc ×0.9 | Tiền ×2.0 · điểm ×1.6 |

- **Ironhide + Armored** cộng dồn giảm thân: ×0.65 × 0.8 = **×0.52**; headshot bỏ qua cả hai.
- **Toxic + Bloater** có thể nổ **hai lần** khi chết: 25 dmg / 4 m và 15 dmg / 2.5 m. Đừng đứng gần.
- Tiền elite = `base × eliteMoneyMul × headshot × bloodmoon`, làm tròn một lần; điểm đã nhân `scoreMul` trước khi cộng headshot ×1.5.

### 4.3 Bốn boss thường

| Boss | HP gốc | Tốc độ | Cận chiến | Đòn đặc trưng | Cách né |
|---|---:|---:|---:|---|---|
| **Đồ Tể (The Butcher)** | 1200 | 2.0 | 35 | Mỗi 6 s dồn lực **0.8 s** (đỏ + gầm) rồi lao thẳng **14 m**; chạm 40 dmg + hất lùi | Bước ngang khi nó đỏ lửa; cú lao đã khoá hướng |
| **Kẻ Phun Acid (The Spitter)** | 800 | 2.6 | 15 | Giữ **10–16 m**; mỗi 2.5 s nhổ cầu acid: trúng 18 dmg + vũng bán kính 1 m sống 4 s, 6 dmg/s | Vay ngang khi nó ngửa đầu; không đứng trong vũng xanh; áp sát buộc nó lùi |
| **Kẻ Gào Thét (The Screamer)** | 600 | 3.2 | 10 | Mỗi 8 s gào: vòng 8 m, 10 dmg + đẩy lùi 4 m; triệu hồi **3 zombie** (runner nếu wave ≥ 6) | Giữ **> 8 m** — tường không chặn tiếng gào — và hạ 3 minion trước khi bị vây |
| **Người Đá (The Golem)** | 2000 | 1.2 | 30 | Giảm **25%** mọi sát thương; mỗi 6 s nếu bạn < 6 m thì đập đất: vòng 8 m / 0.6 s, 30 dmg + hất bay | Lùi ra ngoài 8 m khi nó giơ tay; đừng ôm sát |

**Máu boss theo wave:** `HP = gốc × (1 + wave/20)`, rồi nhân độ khó và NG+. Ví dụ: Đồ Tể wave 5 = **1500**; Phun Acid wave 10 = **1200**; Gào Thét wave 15 = **1050**; Người Đá wave 20 = **4000**; Đồ Tể wave 25 = **2700**. Khó + NG+ ở wave 20: Người Đá = 2000 × 2 × 1.35 × 1.25 = **6750 HP**.

- Mỗi wave chia hết 5 là boss wave: minion **giảm nửa**, dồn trong **6 s đầu**; đúng **1 boss** theo chu kỳ Đồ Tể → Phun Acid → Gào Thét → Người Đá.
- Wave chỉ sạch khi **boss + toàn bộ minion + minion boss triệu hồi** đều chết.
- Boss chết rơi **chắc chắn 1 medkit + 1 ammo**; tiền: $1000 / $800 / $700 / $1500.
- **Nhiệm vụ 8** gọi một boss theo chu kỳ của wave hiện tại — không phải lúc nào cũng là Người Đá.
- **Sinh Tồn**: từ wave 8, **mỗi wave** có đúng 1 boss **ngẫu nhiên** trong 4 loại; wave chia hết 5 thay bằng Trăng Máu.

### 4.4 Nguồn Gốc — boss cuối

**3000 HP** (không nhân theo wave), tốc độ nền 1.6 m/s, cận chiến 30 dmg. Trồi lên trong **2.5 s** và **bất tử** lúc trồi; chuyển phase bất tử **1.5 s** + nhấp nháy trắng + rung màn hình.

| Phase | Máu | Đòn |
|---|---|---|
| **P1** | 100–66% (hp > 1980) | **Đập đất** cd 5.0 s (first 3.0): vòng 8 m / 0.6 s, 30 dmg + hất bay. **Triệu hồi** cd 12.0 s (first 6.0): 4 walker quanh mình |
| **P2** | 66–33% (990 < hp ≤ 1980) | Giữ P1. Thêm **Mưa acid** cd 9.0 s (first 4.0): 5 vũng ngẫu nhiên ≤ 15 m, bán kính 1 m, sống 4 s, 6 dmg/s. Thêm **Húc** cd 8.0 s (first 3.0): telegraph 0.7 s rồi lao 12 m tốc 10 m/s, chạm 35 dmg + knockback |
| **P3** | < 33% (hp ≤ 990) | **Nồng tố**: tốc ×1.5 (2.4 m/s), mọi cooldown ×0.7, thân đỏ rực. Thêm **Sóng xung kích** cd 3.0 s (first 1.0): vòng 6 m / 0.4 s, 15 dmg, không hất bay |

Ba mẹo: **né húc ngang** theo telegraph 0.7 s; **đứng ngoài vũng acid** (mép vũng an toàn); **P3 giữ 7–12 m** — ngoài sóng 6 m nhưng không quá xa để bị húc bất ngờ.

Khi Origin sống, scheduler sự kiện **tạm dừng** (event đang chạy vẫn kết thúc tự nhiên); boss wave thường vẫn chạy nhưng Origin ưu tiên trên HUD/bản đồ. Origin chết thưởng **$2000** + 1 medkit + 1 ammo. Chết giữa trận rồi **PLAY AGAIN**: Origin hồi đầy máu và trồi lại; tiền + tiến trình nhiệm vụ giữ theo luật story-keep.

### 4.5 Hai đồng đội — Mai & Eli

Sự kiện 🆘 **lần 1** đưa **Mai** vào, **lần 2** đưa **Eli** vào, **lần 3 trở đi** hồi đầy máu cả hai và nâng **tier 2**. Không bao giờ có đồng đội thứ ba.

| Lần cứu | Đồng đội | Vũ khí | Sát thương | Nhịp bắn | Tầm | Tier 2 (lần 3+) |
|---:|---|---|---:|---:|---:|---|
| 1 | **Mai** | pistol | **25** | **1.1 s** | **20 m** | **35 dmg** / 1.0 s |
| 2 | **Eli** | rifle | **30** | **1.4 s** | **24 m** | **42 dmg** / 1.2 s |

| Chỉ số chung | Giá trị |
|---|---|
| Máu | **120 HP** mỗi người, hồi **+2 HP/s** sau **8 s** không nhận sát thương |
| Bám theo | Mai slot **3.4 m bên phải**, Eli **3.4 m bên trái**; gần hơn **3 m** thì lùi, xa hơn **8 m** thì sprint **7.8 m/s** — vùng hoạt động **3–6 m** |
| Bắn yểm trợ | Mỗi người tự chọn zombie gần **người chơi** nhất trong tầm + line of sight; Eli ưu tiên mục tiêu khác Mai nếu có; không headshot |
| Khi hết máu | quỳ **12 s** rồi tự hồi sinh **50% HP** (60) — không chết vĩnh viễn |
| Sát thương nhận | chỉ **splash nổ** (4 m / 90 dmg giảm tuyến tính); zombie không đánh đồng đội |
| Va chạm | **không collider** — không chặn người chơi, zombie hay đạn |

- Tên **“MAI — ĐỒNG ĐỘI”** / **“ELI — ĐỒNG ĐỘI”** hiện trong **28 m**, mờ tới **40 m**. Model thấp-poly, có đèn/ba lô emissive (không thêm PointLight).
- **Reset mỗi lượt**: run mới không có ai cho tới lần cứu đầu tiên; Boss Rush không có sự kiện cứu nên cả hai không xuất hiện (trừ debug `rescueCompanion()`).

## 5. Cốt truyện 10 nhiệm vụ + màn kết

> **SPOILER** — phần này tiết lộ toàn bộ cốt truyện và kết thúc.

<details>
<summary><b>Bấm để mở tóm tắt cốt truyện</b></summary>

Ngày thứ 30 kể từ khi dịch bùng phát. Thành phố ~260×260 m gồm 7 khu đã chết; đội của bạn chỉ còn một mình bạn. Kênh radio quân đội lặp lời hứa giải cứu mỗi 47 giây. Một giọng chỉ huy giao nhiệm vụ; trong tĩnh radio còn một **giọng thứ hai**, yếu và đứt quãng, phát từ tâm cách ly. Ba giọng thoại: **GIỌNG RADIO** (lạnh, mệnh lệnh), **BẠN** (độc thoại khô), **KHÔNG RÕ** (giọng thứ hai).

| # | Nhiệm vụ | Khu | Mục tiêu | Thưởng | Mở cổng |
|---|---|---|---|---|---:|
| M1 | Sáng Đèn / Lights On | An Toàn Nhà | Bật 3 máy phát | $300 | → Khu Dân Cư |
| M2 | Đường Phố / Dead Blocks | Khu Dân Cư | Quota 20 + 3 gói tiếp tế | $325 | → Phố Thương Mại |
| M3 | Tiếng Radio / The Signal | Phố Thương Mại | Quota 25 + tới đài phát thanh | $350 | → Bệnh Viện |
| M4 | Thuốc Cho Bệnh Nhân / Medicine Run | Bệnh Viện | Quota 30 + 3 hộp thuốc | $400 | → Công Viên |
| M5 | Lửa Trại Cầu Cứu / Signal Fire | Công Viên | Quota 25 + bật lửa trại | $425 | → Bến Cảng |
| M6 | Nhiên Liệu / Fuel Run | Bến Cảng | Quota 30 + 4 can xăng | $450 | → Vùng Cách Ly **và** → An Toàn Nhà |
| M7 | Vào Tâm Dịch / Into the Swarm | Vùng Cách Ly | Trụ 60 giây | $500 | — |
| M8 | Vệ Binh Cách Ly / The Warden | Vùng Cách Ly | Hạ boss | $550 | — |
| M9 | Cánh Cửa Cuối / The Last Door | Vùng Cách Ly | Tới cửa thép trung tâm (0, 0) | $600 | Mở 5 cổng còn lại vào Vùng Cách Ly |
| M10 | Nguồn Gốc / The Origin | Vùng Cách Ly | Hạ Nguồn Gốc | $600 | — |

Điểm nhấn: **M3** — lời hứa “giải cứu đang chờ” lặp đúng 47 giây kể cả tiếng tĩnh, tức là bản ghi âm; Radio né câu hỏi. **M4** — giọng thứ hai xuất hiện, xin thuốc và nói mình kẹt trong tâm cách ly. **M5** — đốt lửa trại để giọng thứ hai “thấy” bạn là người thật. **M9** — cửa vault trượt lên trong 2 s; **M10** kích hoạt ngay, không có outro riêng, Nguồn Gốc trồi dậy.

Sau khi hạ Nguồn Gốc: **2 s slow-zoom** + tiếng trực thăng → **fade trắng 2 s** → màn **“GIẢI CỨU — NGÀY 31”** với 5 hàng thống kê (thời gian chơi · kill · tổng tiền · số lần chết · boss đã hạ) và dòng kết:

> *“Thành phố vẫn thức giấc. Và bạn vẫn ở đây.”*

Ba lựa chọn: **CHƠI TIẾP — THẾ GIỚI MỞ** (roam, sự kiện vẫn nổ, kill vẫn ra tiền) · **NEW GAME+** (giữ tiền + súng + nâng cấp + settings, reset thế giới/nhiệm vụ về M1, zombie mạnh hơn) · **VỀ MENU**.

</details>

## 6. New Game+ & độ khó

**New Game+** giữ **tiền, mọi súng đã mua, mức nâng cấp, settings**; reset thế giới, cổng, vault và chuỗi nhiệm vụ về M1; không có intro slides.

- **Zombie thường**: HP ×1.25, tốc độ ×1.1 (chỉ đơn **mới sinh**).
- **Boss**: `maxHp ×1.25`, HP reset về max; tốc độ ×1.1. **Nguồn Gốc**: 3000 → **3750 HP**, tốc độ 1.6 → **1.76**.
- **Sát thương không tăng theo NG+** — chỉ tăng theo độ khó.
- Chết ở **bất kỳ nhiệm vụ nào** trong run NG+ (kể cả M1) rồi PLAY AGAIN: giữ tiền + súng + nâng cấp + cờ NG+, hồi sinh tại An Toàn Nhà. Cờ NG+ chỉ tắt khi bắt đầu story mới hoặc CHƠI TỰ DO.

**Độ khó** (CÀI ĐẶT, mặc định Thường) chỉ áp cho đơn **mới sinh**:

| Preset | HP | Sát thương | Mật độ spawn |
|---|---|---|---|
| Dễ | ×0.75 | ×0.7 | ×0.8 (gap ×1.25) |
| Thường | ×1 | ×1 | ×1 |
| Khó | ×1.35 | ×1.3 | ×1.2 (gap ×0.83) |

- **Cộng dồn NG+**: HP ×1.25 thêm trên hệ số độ khó (Khó + NG+ ≈ ×1.69 HP); sát thương chỉ theo độ khó; tốc độ ×1.1.
- Mật độ cộng dồn với **Trăng Máu** (gap ×0.5) và **quota khu đã xong** (gap ×2/3 ≈ +50%).
- Đổi độ khó giữa run không hồi máu/đổi đơn đã sống; chỉ tác động lần sinh tiếp theo.

## 7. Hồ sơ 10 nhân vật

Mỗi nhân vật có **hồ sơ công khai** và **hồ sơ ẩn** — tổng cộng **10 nhân vật × 2 = 20 mục**. Mở hồ sơ ẩn thì hồ sơ công khai cũng tự mở. Tiến trình lưu vĩnh viễn, không reset theo lượt chơi.

| Nhân vật | Vai trò | Mở công khai | Mở hồ sơ ẩn |
|---|---|---|---|
| Người Dẫn Đường | Giọng radio | Bắt đầu cốt truyện | Hoàn thành nhiệm vụ 5 |
| Giọng Thì Thầm | Giọng thứ hai | Tới nhiệm vụ 3 | Tới nhiệm vụ 7 |
| Kỹ Thuật Viên Eli | Thợ máy nhà an toàn | Hoàn thành nhiệm vụ 1 | Hoàn thành nhiệm vụ 6 |
| Mai | Người sống sót được cứu | Cứu 1 người sống sót | Cứu tổng cộng 3 người |
| Bác Sĩ Linh | Bác sĩ bệnh viện | Hoàn thành nhiệm vụ 4 | Hoàn thành nhiệm vụ 8 |
| Lão River | Ngư dân bến cảng | Hoàn thành nhiệm vụ 6 | Hoàn thành nhiệm vụ 9 |
| Đội Trưởng Vũ | Đội trưởng cách ly | Hạ bất kỳ boss nào | Hạ cả 4 boss thường |
| Vệ Binh | Vệ binh cách ly | Hoàn thành nhiệm vụ 8 | Tới nhiệm vụ 10 |
| Kane — Đồ Tể | Đồ Tể | Hạ Đồ Tể | Hạ cả 4 boss thường |
| Nguồn Gốc | Người nhiễm đầu tiên | Tới nhiệm vụ 10 | Đánh bại Nguồn Gốc |

> **SPOILER** — phần dưới tiết lộ nội dung hồ sơ ẩn.

<details>
<summary><b>Bấm để đọc các bí mật</b></summary>

- **Người Dẫn Đường** không ở trên trực thăng; ông ở buồng tiếp sóng ngoài thành phố, đã ra lệnh hàn cổng cách ly khi còn người bên trong, và lời hứa 47 giây là giọng ông phát lặp.
- **Giọng Thì Thầm** là ký ức của Nguồn Gốc về việc từng là người, rò rỉ qua vault; mỗi lời cảnh báo là một ký ức đang cố ngăn chính nó.
- **Eli** mở kho nhiên liệu bến cảng ngày thứ 3 để hút dầu; tiếng ồn kéo bầy đầu tiên qua hàng rào và giết những người ngủ cạnh đó. Anh sửa lại thứ mình đã phá từng máy phát một.
- **Mai** là con gái Vệ Binh; vết cắn không bao giờ biến đổi cô. Máu cô là lý do vùng cách ly bị hàn kín — Vệ Binh hàn cổng để giữ cô ở trong, và Người Dẫn Đường để mặc.
- **Bác Sĩ Linh** tạo ra chủng bệnh như một vector ổn định; nó thoát phòng thí nghiệm ngay lần thử đầu. Mẫu trong vault là của cô, và cô đang cố tới đó trước Nguồn Gốc.
- **Lão River** đưa bệnh nhân số 0 vào bờ trong thùng kín trên tàu nghiên cứu gửi tới Bệnh Viện Trung Tâm; ông ký biên nhận mà không hỏi.
- **Đội Trưởng Vũ** ra lệnh hàn kín vùng cách ly khi dân thường còn bên trong. Người Dẫn Đường ra lệnh; Vũ thực hiện và canh cửa từ đó vì mặc cảm.
- **Vệ Binh** để ngỏ khoá trong của vault; ông tin cách duy nhất để kết thúc cách ly là để Mẫu Số 0 ra ngoài. Thẻ khoá của ông vẫn cắm trong ổ.
- **Kane** là đầu bếp, không phải lính. Khi hết thức ăn, ông tình nguyện nhận mũi tiêm đầu tiên sau Mẫu Số 0 với điều kiện bếp vẫn mở; ông giữ con dao phay vì đó là thứ duy nhất ông biết dùng.
- **Nguồn Gốc** dưới cơn cuồng nộ vẫn nhớ một giường bệnh, giọng Bác Sĩ Linh và mưa trên cửa sổ. Nó không muốn lây lan; nó muốn có ai nhớ nó từng là người.

</details>

## 8. Sinh tồn, sự kiện, kinh tế và Sinh Tồn vô tận

### 8.1 Mười ba mẹo sinh tồn

1. **Đạn là tiền tệ thứ hai.** Pistol có đạn dự trữ vô hạn; dùng nó cho walker lẻ, để dành đạn súng đắt cho runner/brute/boss.
2. **Headshot là lãi kép.** ×2 mặc định, sniper ×3, magnum/DMR ×2.5 — hạ nhanh hơn và +50% tiền/điểm.
3. **Nhìn vòng sáng dưới chân.** Frenzied lao rất nhanh; Ironhide rất trâu; Toxic nổ khi chết; Giant to và đấm đau. Chúng trả tiền/điểm cao hơn.
4. **Bloater/Toxic nổ khi chết.** 25 dmg / 4 m và 15 dmg / 2.5 m. Hạ từ xa; đừng đứng sát để nhặt xác.
5. **Boss luôn báo trước.** Đồ Tể đỏ lửa 0.8 s rồi lao — bước ngang. Gào Thét hít hơi — lùi > 8 m. Người Đá giơ tay — rời vòng 8 m. Origin phát sáng đỏ trước cú húc — né ngang.
6. **Không đứng trong acid.** Vũng xanh 6 dmg/s; mép vũng an toàn, nhưng đừng để bị dồn vào góc.
7. **Mua giữa wave, không giữa trận.** `B` mở cửa hàng và tạm dừng game; `G` ghé Thương Lái ở An Toàn Nhà để mua súng độc quyền, bom và giáp. Tranh thủ 10 s nghỉ giữa wave để mua/nâng cấp/nạp đạn.
8. **Nạp trước khi vào wave boss.** Tự nạp chỉ chạy 0.35 s sau khi băng về 0; đổi súng huỷ nó. Chủ động `R` khi còn 1–2 viên.
9. **Giữ lối thoát.** Đặt lưng vào tường/cổng, không đứng giữa ba hướng; hành lang hẹp là nơi shotgun/minigun toả sáng.
10. **Ưu tiên mục tiêu:** Spitter/Screamer (áp lực xa) → Runner/Crawler (áp sát) → Bloater/Toxic (nổ diện rộng) → Brute/Armored (headshot) → boss.
11. **Bom mở màn, không cứu mạng.** Frag 3.6 m / 90 và mìn 4 m / 120 không hại bạn; molotov 2.6 m / 5 s chỉ đốt zombie. Ném vào cổng trước khi bầy tràn.
12. **Chọn kỹ năng theo súng.** Mỗi cấp 1 trong 3 thẻ từ pool 12; cộng dồn không giới hạn — 3 stack Đạn Nặng (+36%) thường hơn rải đều.
13. **Hợp đồng là tiền miễn phí.** Bảng có 3 hợp đồng, tự trả khi xong và xoay sau mỗi 3 đợt; nhận trước wave để tiện đếm.

### 8.2 Sự kiện ngẫu nhiên

Sự kiện đầu nổ sau **40–80 s** chơi; giữa hai sự kiện nghỉ **45–120 s** (chỉ tính thời gian đang chơi). Pool có trọng số: horde 30 / supply 25 / survivor 25 / bloodmoon 20; không lặp cùng loại hai lần liền; chỉ chọn khu đã mở. Bloodmoon loại trừ mọi sự kiện khác.

| Sự kiện | Thời gian | Cách xử lý | Thưởng |
|---|---:|---|---|
| **HORDE** | 40 s | 8 + ⌊nhiệm vụ/2⌋ runner dồn trong 6 s; đặt lưng vào tường, súng auto | Tiền hạ như thường |
| **TIẾP TẾ** | 90 s | Thùng rơi cách bạn ≥ 15 m; tới bấm `E` trong 2 m | 200–400$ + 40 HP + đầy đạn súng đang cầm |
| **NGƯỜI SỐNG SÓT** | 90 s | Hạ 5 zombie vây rồi tới < 2 m | 300$ + medkit (+40 HP) |
| **TRĂNG MÁU** | 90 s | Dữ đạn, thủ sẵn; trời + sương đỏ | Tiền hạ **×2**, spawn dày **×2** (gap ×0.5) |

### 8.3 Kinh tế

- **Nguồn tiền**: hạ zombie (bảng mục 4), boss, thưởng nhiệm vụ ($300–$600), sự kiện, Trăng Máu ×2, headshot +50%, elite ×1.5–×2.0.
- **Cửa hàng `B`**: 7 súng, **Nạp đạn $150** (đầy dự trữ **mọi súng đang sở hữu**, mua lại được), **Medkit $200** (hồi đầy 100 HP, mua lại được). Không mua trùng súng đã sở hữu.
- **Thương Lái `G`**: 2 súng độc quyền (Sawn-off $650 · Crossbow $750), 3 gói bom, Tấm Giáp $300, Medkit $200, nạp đạn toàn phần $150, Mũi Nỏ $60, Thùng Bí Ẩn $250, Thuốc Kích Thích $180, **4 phụ tùng $350–$500** — kho riêng mỗi lượt, DEAL −25% sau mỗi 5 đợt sạch (phụ tùng không vào DEAL).
- **Hợp đồng `T`**: 3 hợp đồng active, thưởng $450–$900 tự trả khi xong; nguồn tiền phụ không tốn đạn.
- **Thứ tự ưu tiên**: SMG → DMR/Sniper → Magnum → nâng sát thương → Grenade → Minigun/Railgun. Ammo $150 thường rẻ hơn mất một wave vì hết đạn; medkit $200 rẻ hơn chết.

### 8.4 Sinh Tồn vô tận

- Vào từ **SINH TỒN**: dịch chuyển vào Vùng Cách Ly, chuỗi nhiệm vụ đóng, wave vô tận bắt đầu; sự kiện vẫn nổ.
- Wave `n`: tổng **8 + n×4** zombie; runner luôn ≥ 2 (~30%); brute từ wave 3; crawler từ wave 2 (15%); bloater từ wave 4; armored từ wave 6; phần còn lại là walker.
- Tối đa **40 zombie sống đồng thời** (dư xếp hàng, không bỏ); nghỉ **10 s** giữa hai wave.
- Mỗi wave chia hết 5: **Trăng Máu chắc chắn** (nếu sự kiện khác đang chiếm chỗ, game thử lại mỗi giây).
- Từ **wave 8**: mỗi wave có đúng **1 boss ngẫu nhiên** trong 4 loại.
- Điểm riêng: walker 10 · runner 15 · brute 40 · boss 200 · headshot ×1.5 (làm tròn một lần).
- Chết → màn **SINH TỒN KẾT THÚC** (wave · điểm · kỷ lục) → về menu. Kỷ lục ưu tiên wave cao nhất, bằng wave thì điểm cao hơn; lưu `gungame.endless.v1`. **Sinh Tồn không tạo save.**

**Thành tựu & thống kê:** menu THÀNH TỰU có 12 ô và khối THỐNG KÊ trọn đời (kill · headshot · chết · boss · tổng tiền · thời gian chơi · kỷ lục Sinh Tồn). Thống kê **không bao giờ bị reset**.

## 9. Thương Lái (phím `G`)

Quầy gỗ cố định ở **An Toàn Nhà**, quanh toạ độ **(−60, 4)** — có đèn lồng, bảng hiệu và hai thùng hàng hai bên. Đây là **cửa hàng thứ hai**, tách hẳn khỏi overlay `B`: hàng độc quyền, kho riêng và DEAL xoay vòng.

**Mở quầy:** đứng trong **4.5 m** → chip `G — THƯƠNG LƯỢNG` hiện ở đáy màn hình; bấm `G` mở overlay và **game tạm dừng**. `G` hoặc `Esc` đóng. Đứng xa hơn thì game nhắc *“Tìm Thương Lái ở An Toàn Nhà”*.

**Bốn tab:** VŨ KHÍ · CHẤT NỔ · TRANG BỊ · **PHỤ TÙNG**. Mỗi thẻ hiện giá hiện tại, `CÒN n/max`, và lý do khoá nếu không mua được: `THIẾU TIỀN`, `HẾT HÀNG`, `ĐÃ SỞ HỮU`, `CẦN NỎ`, `BẠN ĐÃ CHẾT`.

| Mặt hàng | Giá | Stock / lượt | Tác dụng |
|---|---|---:|---|
| **Sawn-off** (Súng Cưa Đôi) | $650 | 1 | Mở khoá súng khe `-` — băng 2 viên, 14 × 10 dmg, pump 0.55 s |
| **Crossbow** (Nỏ Săn) | $750 | 1 | Mở khoá súng khe `=` — 150 dmg, băng 1 viên, headshot ×3, im lặng |
| Gói Lựu Đạn | $180 | 4 | +3 lựu đạn mảnh |
| Gói Molotov | $150 | 3 | +3 bom xăng |
| Gói Mìn | $220 | 2 | +2 mìn cận chiến |
| Tấm Giáp | $300 | 3 | +50 giáp (tối đa 100) |
| Túi Cứu Thương | $200 | 5 | Hồi đầy 100 HP; **không hồi sinh** người đã chết |
| Nạp Đạn Toàn Phần | $150 | 5 | Nạp đầy dự trữ **mọi súng đang sở hữu**, không hạ mức đang có |
| Mũi Nỏ | $60 | 5 | +24 mũi nỏ; chỉ mua được khi **đã có Crossbow** |
| Thùng Bí Ẩn | $250 | 2 | Ngẫu nhiên: $200–400 · +50 giáp · đầy đạn mọi súng · +2 frag |
| Thuốc Kích Thích | $180 | 3 | +35 HP và +10% tốc độ trong 20 s |
| **Kính Ngắm** (`scope`) | $450 | 2 | **−35% spread** (×0.65); 1 món/súng |
| **Băng Mở Rộng** (`extmag`) | $400 | 2 | **+50% băng** sau nâng cấp, làm tròn lên; 1 món/súng |
| **Giảm Thanh** (`suppressor`) | $500 | 2 | **−25% giật**, **−20% spread** (×0.8); 1 món/súng |
| **Laser** (`laser`) | $350 | 2 | **−25% spread** (×0.75) + chấm đỏ; 1 món/súng |

**Phụ tùng — luật gắn:**

- Mua xong gắn ngay vào **súng đang cầm**; tab ghi `FITS: {tên súng}`. Mỗi súng tối đa **1 bản/món** — mua lại cùng món cho cùng súng bị khoá `ĐÃ SỞ HỮU`, nhưng vẫn gắn được cho súng khác.
- Kho **2 món/lượt/loại** dùng chung giữa các súng; **không vào pool DEAL −25%**, giá cố định.
- Hiệu ứng **nhân dồn** với nâng cấp và perk: kính + giảm thanh + laser = spread **×0.39**. Băng mở rộng tính **sau** nâng cấp băng rồi mới +50% và làm tròn lên; băng đang có tăng đúng phần thêm.
- **Lưu / khôi phục**: `gungame.save.v1` ghi `attachments` của từng súng; **TIẾP TỤC** khôi phục đúng, lượt mới xoá sạch. **Sawn-off / Crossbow** gắn được như mọi súng đã sở hữu.

**Kho và DEAL:**

- Stock **tính theo lượt chạy**. Mua hết thì chờ restock; **mỗi 5 đợt sạch** kho đầy lại và **đúng một món** ngẫu nhiên được **DEAL −25%** (giá làm tròn). DEAL giữ đến lần restock kế.
- Lượt mới từ menu (PLAY / PLAY AGAIN), RESTART hoặc QUIT về menu sẽ đổ đầy kho, xoá DEAL và quên súng thương lái đã mua **trong lượt đó** — nhưng nếu bạn TIẾP TỤC từ save thì súng đã mua vẫn còn (xem 15.2). Kho và DEAL **không nằm trong save**.
- Súng thương lái sau khi mua **nâng cấp được** trong cửa hàng `B` như mọi súng đã sở hữu (3 nhánh × 3 cấp).

**Giáp — công thức thật:**

- Giáp tối đa **100**, mỗi lượt bắt đầu ở **0**.
- Khi còn giáp, đòn nhận vào bị hấp thụ **50%**: `hấp thụ = min(giáp, sát thương × 0.5)`. Phần còn lại trừ HP; giáp giảm đúng bằng lượng hấp thụ.
- Ví dụ: còn 30 giáp, nhận 40 dmg → giáp hấp thụ 20 (còn 10), HP mất 20.
- Tấm Giáp +50 và kỹ năng **Giáp Tấm** (+25 giáp hiện tại, +25 giáp tối đa mỗi stack) cộng dồn; giáp không tự hồi.

**Mẹo:** ghé Thương Lái **trước wave boss** để mua Tấm Giáp + đầy đạn; DEAL −25% rơi vào gói bom hoặc Tấm Giáp là lúc đáng mua nhất. Đừng mua Mũi Nỏ trước khi có Crossbow — nút sẽ khoá với lý do `CẦN NỎ`.

## 10. Bom ném (phím `F` / `V`)

`F` ném hoặc đặt loại đang chọn; `V` xoay vòng **frag → molotov → mìn**, tự bỏ qua loại đã hết. Nếu cả túi rỗng, `V` vẫn xoay để HUD hiện loại kế tiếp, còn `F` chỉ kêu “khô” và không tạo vật thể.

| Bom | Cách hoạt động | Bán kính | Sát thương | Ghi chú |
|---|---|---:|---|---|
| **Lựu đạn mảnh** (frag) | Ném theo hướng nhìn, nổ sau **1.4 s** hoặc khi chạm đất | **3.6 m** | **90** tại tâm, giảm tuyến tính về 0 ở mép | Chỉ zombie; **có** kích nổ barel |
| **Molotov** | Vỡ khi chạm đất hoặc trúng thân zombie, để lại vũng lửa | **2.6 m** | **12 dmg/giây** cho mỗi zombie trong vũng | Vũng sống **5 s**; mỗi zombie tối đa 1 tick/giây; không kích nổ barel |
| **Mìn cận chiến** | Đặt trước mặt **0.4 m**, arm sau **1.0 s**, kích khi zombie vào **1.8 m** | **4 m** | **120** tại tâm, giảm tuyến tính về 0 ở mép | Dùng một lần; đèn đỏ nháy chậm khi đang arm, nhanh khi đã arm |

- **Kit đầu lượt: 2 frag · 1 molotov · 0 mìn.** Trần mỗi loại **99**; tối đa **6 vật thể sống đồng thời** mỗi loại, cái thứ 7 tái dùng slot cũ nhất.
- Nguồn thêm: gói của Thương Lái, **Thùng Bí Ẩn** (+2 frag), kỹ năng **Chuyên Nổ** (+2 frag, +1 molotov, +1 mìn mỗi stack).
- **HUD:** chip góc phải dưới, ngay trên ô đạn — glyph, tên loại, số lượng và gợi ý `F NÉM · V ĐỔI`.
- Cả ba loại **không gây sát thương lên bạn**; chúng chỉ quét zombie còn sống. Bom không tính headshot.
- **Tác dụng lên barel:** frag / mìn / đạn phóng lựu kích nổ barel; **molotov thì không** (lửa không làm nổ bình kín).

**Mẹo dùng bom:**

1. **Ném vào cổng/hành lang trước khi bầy tràn vào** — frag 3.6 m đủ phủ một cửa hẹp.
2. **Molotov để chặn đường**, không để giết nhanh: 12 dmg/s trong 5 s = tối đa 60 dmg mỗi zombie đứng đủ lâu.
3. **Mìn đặt sau lưng khi rút lui** — arm 1.0 s, trigger 1.8 m; đặt xong phải bỏ chạy ngay.
4. **Kích barel từ xa bằng frag/mìn** — dây chuyền 4.5 m / 110 dmg quét sạch cả cụm; đứng ngoài bán kính để xem chuỗi nổ (người chơi miễn nhiễm với cả bom lẫn barel).

## 11. XP & kỹ năng (level-up)

XP là **tiến trình riêng của từng lượt**, không lưu vào `localStorage`. Cấp tối đa **20**; mỗi cấp cho **một lượt chọn 1 trong 3 thẻ** rút từ pool **12 kỹ năng**.

### 11.1 Nguồn XP

| Nguồn | XP |
|---|---:|
| Hạ Walker | 5 |
| Hạ Runner | 7 |
| Hạ Crawler | 7 |
| Hạ Brute | 18 |
| Hạ Bloater | 20 |
| Hạ Armored | 22 |
| Hạ **zombie tinh anh** | **×2** XP của loại gốc |
| Hạ boss (Butcher / Spitter / Screamer / Golem / Origin) | 100 |
| Hoàn thành nhiệm vụ | 60 |
| Hoàn thành hợp đồng | 40 |
| Dọn sạch đợt `n` | **15 + n** |

### 11.2 Đường cong cấp

Cần `min(400, 100 + 40 × (cấp − 1))` XP để lên cấp kế:

| Cấp hiện tại | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9+ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| XP cần | 100 | 140 | 180 | 220 | 260 | 300 | 340 | 380 | 400 |

- Cấp 20 là mức cuối: không cần XP nữa, thanh XP hiện **TỐI ĐA**.
- `xp` trên HUD là tiến độ **trong cấp hiện tại**; `totalXp` chỉ dùng nội bộ/debug.

### 11.3 Mười hai kỹ năng

| Kỹ năng | ID | Hiệu ứng mỗi stack | Sàn / ghi chú |
|---|---|---|---|
| **Đạn Nặng** | `damage` | +12% sát thương vũ khí | Cộng dồn tuyến tính |
| **Liên Thanh** | `firerate` | +10% tốc độ bắn | Giảm interval |
| **Thao Tác Nhanh** | `reload` | −12% thời gian nạp | Sàn ×0.2 |
| **Adrenaline** | `speed` | +8% tốc độ di chuyển | Cộng với stim/NG+ |
| **Thân Sắt** | `maxhp` | +20 máu tối đa **và** hồi 20 máu | Máu tối đa tăng theo stack |
| **Hồi Phục** | `regen` | Hồi 1 HP mỗi 3 giây | Mỗi stack +1 HP/tick |
| **Giáp Tấm** | `armor` | +25 giáp ngay **và** +25 giáp tối đa | Giáp tối đa vượt 100 |
| **Nhặt Nhạnh** | `scavenger` | +15% tiền từ hạ gục | Tính trên đúng mức tiền gốc (elite/headshot/Trăng Máu) |
| **Chuyên Nổ** | `blast` | +2 frag, +1 molotov, +1 mìn | Nhận ngay khi chọn |
| **Ngắm Vững** | `steady` | −15% độ tản đạn | Sàn ×0.1 |
| **Khát Máu** | `vampire` | Hồi 2 HP mỗi mạng hạ gục | Hồi trước khi XP được cộng |
| **Bắn Đầu** | `lucky` | +10% sát thương headshot | Cộng vào hệ số headshot |

### 11.4 Overlay chọn kỹ năng

- Lên cấp → overlay mở, **game tạm dừng**, pointer lock nhả ra. Chọn bằng **click** hoặc phím **`1` `2` `3`** (cả numpad).
- **Không có nút đóng**, `Esc` không bỏ qua — bắt buộc chọn một thẻ.
- Lên nhiều cấp cùng lúc: xếp hàng tối đa **3** lượt; chọn xong thẻ này, 3 thẻ mới hiện ra cho đến khi hết hàng đợi rồi game mới chạy tiếp.
- Thẻ hiện `MỚI` nếu chưa từng lấy, hoặc `CỘNG DỒN ×n` nếu đã có stack.
- **HUD:** dòng `LV n` + `xp/need` và thanh XP 4 px; nhấp nháy khi lên cấp.
- **XP / cấp / stack reset sạch mỗi lượt mới** — không có trong save, không mang sang NG+.

## 12. Hợp đồng (phím `T`)

Bảng gỗ cố định ở **An Toàn Nhà**, quanh **(−52, 12)**, cạnh lối vào khu an toàn. Đứng trong **3.5 m** → chip `T — HỢP ĐỒNG`; bấm `T` mở bảng và **game tạm dừng**. `T` / `Esc` đóng.

### 12.1 Luật xoay

- **3 hợp đồng active** cùng lúc, rút từ pool **8 loại**, không trùng id.
- **Xoay sau mỗi 3 đợt sạch**: ô đã hoàn thành được thay bằng hợp đồng mới; ô đang làm **giữ nguyên tiến độ**.
- Nếu **cả 3 ô đều hoàn thành**, lần clear kế tiếp làm mới ngay — không phải chờ đủ 3 đợt.
- Hợp đồng **không hết hạn theo thời gian**; chỉ hoàn thành mới mở slot.
- Thưởng **tự trả** ngay khi đủ điều kiện, kèm toast; không cần bấm nhận.

### 12.2 Tám hợp đồng

| ID | Tên | Yêu cầu | Thưởng | XP trên thẻ |
|---|---|---|---:|---:|
| `crawler_cull` | Dọn Bò Sát | Hạ **8 crawler** | $450 | 90 |
| `brute_force` | Vũ Lực | Hạ **2 brute** | $500 | 110 |
| `headhunter` | Săn Đầu | **12** mạng bằng headshot | $550 | 140 |
| `boss_contract` | Hợp Đồng Boss | Hạ **1 boss** bất kỳ (4 boss thường hoặc Nguồn Gốc) | $900 | 320 |
| `district_sweep` | Quét Khu | Hạ **15 zombie không phải boss** (kể cả tinh anh) khi đang đứng ở Khu Dân Cư / Phố Thương Mại / Bệnh Viện | $600 | 170 |
| `bloodmoon_survivor` | Sống Sót Trăng Máu | Sống qua **một Trăng Máu ≥ 45 s** | $650 | 180 |
| `elite_hunter` | Săn Tinh Nhuệ | Hạ **3 zombie tinh anh** | $700 | 210 |
| `wave_runner` | Chạy Đợt | Tới **đợt 8** (hoặc dọn sạch 8 đợt) | $750 | 260 |

**Chi tiết điều kiện:**

- `district_sweep` chỉ đếm **zombie không phải boss** (gồm cả tinh anh); khu được lấy theo vị trí người chơi **lúc con zombie chết**.
- `bloodmoon_survivor` cần **sống qua cả sự kiện** Trăng Máu và thời lượng ≥ 45 s; Trăng Máu bị reset giữa chừng (về menu/chết) không tính.
- `wave_runner` cộng dồn cả `wave-start` lẫn `wave-clear`; đạt đợt 8 là xong ngay khi wave 8 bắt đầu.
- `elite_hunter` nhận **loại tinh anh** (Frenzied / Ironhide / Toxic / Giant), không nhận boss.
- **XP hợp đồng:** cột `XP trên thẻ` là lượng XP thưởng thật; hệ thống kỹ năng cộng đúng con số đó khi hợp đồng hoàn thành (mặc định 40 XP nếu nguồn gửi không kèm XP).

## 13. Thế giới sống

### 13.1 Cây cối & cảnh vật

Ngoài 24 cây công viên có từ trước, `vegetation.js` trồng thêm **54 cây** (46 sống + 8 chết) khắp 7 khu:

| Khu | Cây mới | Chết |
|---|---:|---:|
| An Toàn Nhà | 7 | 1 |
| Khu Dân Cư | 9 | 1 |
| Phố Thương Mại | 8 | 1 |
| Bệnh Viện | 7 | 1 |
| Công Viên | 8 | 1 |
| Bến Cảng | 8 | 1 |
| Vùng Cách Ly | 7 | 2 |

- Mỗi thân cây có **collider 0.7 × 0.7 m**; tán cây không chắn đạn. Cây trồng theo seed cố định, giữ khoảng cách ≥ 5 m với nhau, ≥ 6 m với spawn, ≥ 3.5 m với cổng, ≥ 4 m với điểm nhiệm vụ (lửa trại 8 m), tránh hồ và đường.
- Toàn bộ cây gộp **2 mesh** (thân + tán) — 2 draw call, không cấp phát mỗi frame.
- Cảnh vật nền: **mặt trăng + quầng sáng**, vòng **46 toà skyline**, **12 cột đèn giả thể tích**, **8 thùng lửa** (tối đa 6 đèn nhấp nháy), gạch đá / bao cát / xe bỏ hoang / rào chắn, **13 vũng kim loại**, **220 đốm đom đóm**.

### 13.2 Thời tiết

Chu kỳ tự động; cảnh mờ dần trong **6–10 s**, còn **gameplay effect** làm mượt **2 s**:

| Chế độ | Thời lượng | Chuyển tiếp | Ảnh hưởng gameplay (full intensity) |
|---|---|---:|---|
| Trời quang (`clear`) | 90–180 s | → mưa | zombie ×1.00 |
| Mưa (`rain`) | 60–120 s | 55% → bão, còn lại → quang | zombie **×0.90** (−10% tốc) |
| Bão (`storm`) | 25–45 s | → quang | zombie **×0.88** (−12% tốc) + sét gần |
| Sương mù (`fog`) | 35–60 s | → quang; xuất hiện mỗi **150–260 s**, chen vào clear/rain, không chen Trăng Máu | zombie **×0.95** (−5% tốc) + tầm nhìn thấp |

- **HUD chip**: góc trái trên (dưới đồng hồ Trăng Máu) — **CLEAR / RAIN / STORM / FOG** (VI: **TRỜI QUANG / MƯA / BÃO / SƯƠNG MÙ**) + **% cường độ** khi khác clear; sương mù thêm **LOW VIS / TẦM NHÌN THẤP**. Clear vẫn hiện nhưng mờ 55%; chip chỉ hiện khi chơi/tạm dừng.
- **Gameplay effect**: `weather-effects.js` áp `weatherSpeedMul` lên **mọi zombie còn sống** (thường, boss, Origin), làm mượt **2 s**; xác chết bị bỏ qua. Spitter giữ khoảng cách và cú lao butcher/Origin dùng tốc cố định nên các đoạn script đó không giảm tốc.
- **Mưa**: 3.200 hạt trong hộp **50 × 30 × 50 m** bám theo người chơi, 1 draw call, cập nhật tại chỗ trong `Float32Array`.
- **Bão**: mưa dày + gió mạnh; flash chân trời mỗi **6–18 s**, flash **0.08–0.25 s**, sấm synth trễ **0.35–1.85 s**.
- **Sét đánh gần (chỉ bão)**: cú đầu sau **7–16 s** từ lúc bão bắt đầu, rồi lặp **7–16 s**; điểm đánh cách người chơi **8–30 m**, bán kính **3.2 m**, **160 dmg** lên zombie **sau 0.1 s** (kịp né). Chỉ zombie bị đánh — người chơi, Mai và Eli miễn nhiễm; mỗi zombie tối đa 1 lần/cú. Bolt + scorch dùng **pool sẵn**; `weatherState().strikes` (tức `state().strikes`) đếm tổng cú gần. Trăng Máu ép trời quang nên **không có sét**.
- **Sương mù**: chỉ `scene.fog.density` lerp lên **0.04** trong ~8 s rồi trả về đúng nền; màu sương/nền trời không đổi.
- **Trăng Máu ép trời quang**: mưa về 0, sương về nền, đồng hồ chu kỳ đóng băng, sét/sấm bị chặn; hết Trăng Máu chu kỳ chạy lại timer mới.
- Tiếng mưa là noise synth WebAudio theo âm lượng Settings.

### 13.3 Động vật hoang dã

Không chiến đấu, không collider, không rơi đồ, không liên quan nhiệm vụ. Bố cục seed cố định:

| Loài | Số lượng | Hành vi | Bỏ chạy khi |
|---|---:|---|---|
| **Quạ** | 12 | Đậu trên tán cây / đèn / mái nhà; cất cánh bay xa rồi ẩn | Người chơi < **12 m** hoặc tiếng súng trong **25 m** |
| **Chuột** | 10 | Chạy – dừng – chạy trong hẻm; chui vào lỗ tối | Người chơi < **6 m** hoặc tiếng súng trong **15 m** |
| **Chó hoang** | 3 | Lang thang – dừng – đi tiếp | Người chơi < **14 m** hoặc tiếng súng trong **28 m** |

- Quạ ẩn **3.4–5.6 s** sau khi cất cánh, hồi sinh sau **20–40 s**; chuột hồi sinh sau **10–25 s**; chó không despawn.
- Tiếng nền: quạ kêu theo cụm mỗi **8–20 s**, chuột kêu hiếm, chó sủa xa mỗi **20–50 s**.

### 13.4 Trại người sống sót

**7 NPC** ở 6 khu ngoài (không có trại trong Vùng Cách Ly). Năm người (Eli, Sơn, Hà, Linh, River) có trại nhỏ gồm lều, vòng lửa, thùng, rào chắn; Mai và Vũ đứng ở điểm canh. Tất cả đi loanh quanh **6–10 m**, **không tấn công, không máu, không thể chết**.

| NPC | Khu | Quà lần đầu (mỗi lượt) |
|---|---|---|
| Eli | An Toàn Nhà | **$120** |
| Mai | An Toàn Nhà | **+15 HP** |
| Sơn | Khu Dân Cư | **+1 băng đạn** súng đang cầm |
| Hà | Phố Thương Mại | **$80** |
| Bác Sĩ Linh | Bệnh Viện | **+15 HP** |
| Đội Trưởng Vũ | Công Viên | **+1 băng đạn** súng đang cầm |
| Lão River | Bến Cảng | **$150** |

- Đến trong **3 m** lần đầu → nhận quà ngay + lời cảm ơn; mỗi NPC tặng **một lần mỗi lượt**. Không cần `E`.
- Zombie trong **10 m** → NPC **cúi người / lùi lại** (fear pose) và hiện câu thoại sợ.
- Tên hiện trong **25 m**, mờ đến **35 m**; hai NPC An Toàn Nhà có **bark radio** khi bạn trong **15 m**.
- Bubble không chặn game, không mở hộp thoại.

### 13.5 Barel nổ dây chuyền

**13 barel đỏ + 5 bình gas** ở An Toàn Nhà, Khu Dân Cư, Phố Thương Mại, Bến Cảng và Vùng Cách Ly:

- Vụ nổ (frag / mìn / grenade launcher) trong **3.5 m** châm ngòi; ngòi **0.08–0.2 s**, càng xa càng trễ.
- **Bắn thẳng** vào barel/bình gas → ngòi **0.12 s**. Đứng trong **2.8 m** bấm `E` để **đá thùng** (ngòi 0.55 s); chip `E — ĐÁ THÙNG · hoặc BẮN để nổ` hiện khi lại gần.
- Barel nổ: **4.5 m**, **110 dmg** tại tâm giảm tuyến tính về 0 ở mép, **chỉ zombie**.
- Mỗi vụ nổ lan sang barel khác trong **4.5 m**, tối đa **8 tầng**; cờ `intact/pending` chặn vòng lặp.
- **Molotov không kích nổ**; frag / mìn / đạn phóng lựu thì có.
- Mỗi lượt mới phục hồi đủ 18 vật nổ + collider; vết cháy tối đa 20, một InstancedMesh.

## 14. Trợ năng & Game feel

Mở **CÀI ĐẶT** ở menu chính hoặc menu tạm dừng. Mọi thay đổi **áp dụng ngay** và **lưu vào `gungame.settings`**:

| Thiết lập | Khoảng / lựa chọn | Mặc định | Tác động |
|---|---|---|---|
| **Tầm nhìn (FOV)** | 60–110, bước 1 | **75** | Đổi FOV camera ngay |
| **Rung màn hình** | 0–100, bước 1 | **100** | Biên độ rung camera khi nổ và các cú sốc của boss |
| **Màu tâm ngắm** | Lục lam · Lục · Hổ phách · Trắng | **Trắng** `#e6f1ff` | Đổi màu tick tâm ngắm |
| **Cỡ tâm ngắm** | 0.75–1.5, bước 0.05 | **1.0** | Phóng to/thu nhỏ tâm ngắm |
| **Số sát thương** | Bật / Tắt | **Bật** | Số bay khi trúng đích (headshot đỏ, thường trắng) |
| **Giảm chuyển động** | Bật / Tắt | **Tắt** | Tắt rung camera + tắt kick tâm ngắm + rút ngắn pulse HUD |

- **Giảm chuyển động** ghi đè **Rung màn hình** về 0 nhưng **không xoá** giá trị đã lưu; tắt lại là rung trở về mức cũ.
- Giá trị sai/thiếu trong `localStorage` được **safe-merge** về mặc định — không NaN, không crash.
- FOV / màu / cỡ tâm ngắm / số sát thương nằm trong **Settings**, nên theo sang NG+ và TIẾP TỤC.
- **Số sát thương** tối đa **30 số** cùng lúc, sống **0.8 s**, bay lên ~40 px rồi mờ; chỉ hiện khi đang chơi.

## 15. Kỹ thuật

### 15.1 Trình duyệt

- **Desktop** với bàn phím + chuột; không có điều khiển cảm ứng.
- **WebGL 2** (Three.js r187), **Pointer Lock**, **WebAudio**, **localStorage**.
- Khuyến nghị Chrome / Edge / Firefox bản mới.
- Node.js `^20.19.0` hoặc `>=22.12.0` nếu chạy dev/build. Chơi local không cần backend hay tài khoản; riêng **Lưu đám mây** cần bản deploy Vercel có `/api/cloud-save`.
- **71 module JS** trong `src/` (ES modules thuần): 7 `core`, 2 `player`, **25** `systems`, **22** `ui`, 10 `world`, 4 `zombies` + `main.js`; thêm **`api/cloud-save.js`**.
- **Build**: `npm run build` xuất `dist/index.html` + 1 CSS + 1 JS đã gộp. Bản mới nhất: HTML **2.16 kB**, CSS **10.98 kB**, JS **1.316,36 kB (~1.32 MB chưa nén / ~367.57 kB gzip)**; hash/tên đổi theo nội dung. Vite cảnh báo chunk **> 500 kB** — cảnh báo kích thước, không phải lỗi build.

### 15.2 Save & TIẾP TỤC

Tự động lưu (`gungame.save.v1`) khi: **xong nhiệm vụ**, **xong wave** (kể cả boss), **chết** (trước Game Over), **thoát về menu**, **bắt đầu story mới**. Nút **TIẾP TỤC** khôi phục tiền, súng sở hữu + đạn dự trữ + nâng cấp + **phụ tùng đã gắn**, nhiệm vụ đang tới, khu/cổng đã mở và điểm; hồi sinh tại **An Toàn Nhà**.

Hạn chế có chủ ý:

- Nhiệm vụ đang làm dở **chơi lại từ đầu** (không giữ objective giữa chừng).
- Wave luôn chạy lại từ **wave 1**; số wave trong save chỉ để hiển thị.
- Sau khi chuỗi nhiệm vụ kết thúc, TIẾP TỤC = **tái đấu Nguồn Gốc**.
- Độ khó lấy theo **Settings hiện tại**, không restore từ save.
- Mua nâng cấp **không tự lưu ngay** — lần autosave kế (xong wave/nhiệm vụ) sẽ gom.
- **Sinh Tồn không tạo save**; save hỏng (JSON/schema sai) tự xoá + cảnh báo console, nút TIẾP TỤC tự ẩn.
- **Boss Rush không ghi save**: trong run và cả khi đã có kết quả, snapshot save trả `null` — save cốt truyện hiện có không bị đè.
- **Sao lưu thủ công** (nút **DỮ LIỆU LƯU**, `F5`/`F9`) xuất **7 key tiến trình** (`settings`, `save.v1`, `endless.v1`, `profile.v1`, `achv.v1`, `codex.v1`, `codex.progress.v1`) thành một file JSON cục bộ; nhập xong tự tải lại trang. **Không gồm** `tutorial`, `bossrush.board`, `bossrush.daily` hay `cloud.code`.
- **Súng Thương Lái đã mua nằm trong save** (ownership + reserve + upgrades) như mọi súng; **kho / DEAL / bộ đếm mua trong lượt không lưu** — TIẾP TỤC đổ đầy kho và xoá DEAL.
- **XP / kỹ năng / hợp đồng / bom / giáp / HP không nằm trong save**: TIẾP TỤC chạy `freshRun` nên XP về 0, cấp 1, hợp đồng reroll, túi bom 2/1/0, giáp 0, HP đầy.

### 15.3 Các key localStorage

| Key | Nội dung |
|---|---|
| `gungame.settings` | Độ nhạy, âm lượng, ngôn ngữ, high score, độ khó, FOV, rung, màu/cỡ tâm ngắm, số sát thương, giảm chuyển động |
| `gungame.save.v1` | Save tự động: tiền, súng + nâng cấp, nhiệm vụ, cổng, điểm, wave |
| `gungame.endless.v1` | Kỷ lục Sinh Tồn `{wave, score}` |
| `gungame.profile.v1` | Thống kê trọn đời (kills, headshots, deaths, playtime, bosses, money, endlessBest) |
| `gungame.achv.v1` | ID các thành tựu đã mở |
| `gungame.codex.v1` | Hồ sơ đã mở `{chars, secrets}` |
| `gungame.codex.progress.v1` | Bộ đếm trigger tích luỹ: số survivor + 4 loại boss đã hạ |
| `gungame.bossrush.board.v1` | Top 10 Boss Rush `{score,time,bossesDown,win,daily,dateKey,at}` |
| `gungame.bossrush.daily.v1` | Kết quả daily `{dateKey,complete,best}` |
| `gungame.cloud.code.v1` | Mã lưu đám mây gần nhất (10 ký tự) |
| `gungame.tutorial.v1` | Cờ `{done:true}` của tutorial lần đầu |

Xoá một key sẽ reset đúng phần đó; **đừng xoá `gungame.profile.v1`** nếu muốn giữ thống kê trọn đời. Bundle **DỮ LIỆU LƯU** và **LƯU ĐÁM MÂY** chỉ chứa **7 key tiến trình** — không gồm `tutorial`, `bossrush.board`, `bossrush.daily`, `cloud.code`.

### 15.4 Debug API

Trong console trình duyệt, `window.__game` mở các hàm kiểm thử: `getState()`, `saveNow()`, `hasSave()`, `endlessState()`, `achievementsState()`, `setDifficulty(d)`, `skipToMission(n)`, `completeObjective()`, `fillQuota()`, `teleportDistrict(id)`, `forceEvent(type)`, `spawnZombie(type)`, `spawnBoss(type)`, `giveMoney(n)`, `spawnOrigin()`, `damageOrigin(n)`, `originState()`, `skipToEnding()`.

Bổ sung cho thương lái / bom / XP / hợp đồng / thế giới:

| Method | Trả về / hành vi |
|---|---|
| `merchantState()` | `{open, money, wave, entries[]}` — giá hiện tại, stock, `deal`, `reason` |
| `openMerchant()` | Mở overlay Thương Lái → `{open}` |
| `throwablesState()` | `{selected, counts:{frag, molotov, mine}}` |
| `weatherState()` | `{mode, intensity, timer, strikes, rainIntensity, fogIntensity, effects:{zombieSpeedMul,playerSpreadMul,visionMul}}` — `mode` = `clear \| rain \| storm \| fog` |
| `setWeather(mode)` | Ép mode thời tiết (debug) → `weatherState()` mới |
| `perksState()` | `{level, xp, need, totalXp, maxLevel, pending, offer[], stacks{}, taken[], mods{}}` |
| `addXp(n)` | Cộng XP (âm/không hợp lệ → 0), xử lý lên cấp → snapshot mới |
| `contractsState()` | `{contracts[], completed, board:{x,z}}` |
| `openContracts()` | Mở bảng hợp đồng → `{open}` |
| `hazardsState()` | `{barrels, canisters, detonated, pending}` |
| `detonateHazard(x, z)` | Kích nổ vật nổ gần nhất quanh `(x, z)` → `hazardsState()` |
| `bossrushState()` | `{active, over, win, index, type, total, hp, maxHp, bossesDown, time, score, difficulty, daily, dateKey, modifierId, weather, scoreMul, waiting, aliveBosses}` |
| `startBossRush()` | Bắt đầu Boss Rush ngay (tương đương nút ĐẤU BOSS) → `bossrushState()` |
| `companionState()` | `{active, hp, maxHp, tier, x, z, shots, allies[]}` — top-level là Mai, `allies[]` gồm Mai và Eli |
| `rescueCompanion()` | Bắn sự kiện cứu: lần 1 Mai, lần 2 Eli, lần 3 tier 2 → `companionState()` |
| `weaponStats()` | `{name, damage, magSize, reloadTime, spread, headshotMult, interval, upgrades, attachments}` của súng đang cầm |
| `photoState()` | `{open}` — chế độ ảnh đang mở hay không |
| `togglePhoto()` | Bật/tắt chế độ ảnh (debug) → `{open}` |
| `saveToolsState()` | `{lastExport, lastImport, keys}` — lần xuất/nhập gần nhất + key đang có |
| `leaderboardState()` | `{entries[], best, count, dailyCount}` — top 10 Boss Rush local |
| `dailyState()` | `{dateKey, complete, best, modifier}` — thử thách hôm nay |
| `cloudSaveState()` | `{code, lastSave, lastLoad, busy}` — mã đám mây + lần đồng bộ |
| `startDailyChallenge()` | Bắt đầu daily hôm nay → `{opts, bossrush}` |
| `weaponWheelState()` | `{open}` — vòng vũ khí đang mở |
| `renderInfo()` | `{calls, triangles, points, lines, pixelRatio, shadows, lights, zombies, drawWidth, drawHeight}` |

> Không có `qualityState()`; dùng `renderInfo()` + event **`quality-changed`** `{pixelRatio, shadows, fps}` để kiểm tra adaptive quality.

```js
__game.getState();            // nhiệm vụ, khu, sự kiện, Origin, NG+
__game.giveMoney(5000);       // thử cửa hàng / Thương Lái
__game.perksState();          // XP, cấp, stack kỹ năng
__game.addXp(1000);           // thử overlay chọn kỹ năng
__game.weatherState();        // chu kỳ thời tiết hiện tại
__game.openContracts();       // mở bảng hợp đồng
__game.detonateHazard(-60, 4);// thử dây chuyền barel
__game.startBossRush();       // chuỗi 5 boss ở Vùng Cách Ly
__game.rescueCompanion();     // lần 1 Mai, lần 2 Eli
__game.togglePhoto();         // bật/tắt chế độ ảnh
__game.saveToolsState();      // lần xuất/nhập gần nhất
__game.leaderboardState();    // top 10 Boss Rush
__game.dailyState();          // modifier + best hôm nay
__game.startDailyChallenge(); // chạy daily ngay
__game.weaponWheelState();    // vòng Q đang mở?
__game.renderInfo();          // draw call / light / pixel ratio
```

Đây là công cụ debug — có thể làm hỏng tiến trình/save; chơi bình thường không cần dùng.

### 15.5 Hiệu năng

Đo trên **Intel UHD Graphics, 1440×900**, cùng một cảnh chiến đấu:

| Chỉ số | Trước | Sau |
|---|---:|---:|
| FPS trung bình | **~45** | **59,79** |
| Draw call | **611** | **318–328** |
| Đèn trong scene | **25** | **15** (12 visible) |
| Zombie trong mảng | — | **46** (trần **40** sống) |

- **Trần 40 zombie sống** (`MAX_CONCURRENT`); spawn dư xếp hàng, không bỏ.
- **Pixel ratio** cap **1.25** desktop, **1.0** cho viewport hẹp + `devicePixelRatio > 1.5`.
- **Shadow map 1024** (trước 2048), frustum 64×64 m bám người chơi; `shadowMap.autoUpdate = false`, refresh **mỗi 30 frame (~2 Hz)** hoặc khi camera đi **4 m**. Zombie/boss/wildlife/NPC **không castShadow**.
- **Zombie LOD**: > **32 m** ẩn tay/chân, > **18 m** ẩn mắt; thân + đầu vẫn giữ.
- **Đèn idle** bị gỡ/ẩn: muzzle/explosion/throwable tách scene; hazard/campfire/vault ẩn; barel **0 đèn**; arena **5 → 3 đèn**. 12 đèn visible: moon + ambient + hemisphere + fill + 3 lamp + 4 đèn khu + weather flash; 3 đèn idle ẩn vẫn nằm trong scene nhưng không compile.
- **Ánh sáng nền**: moon DirectionalLight 1.05 (chỉ shadow caster), ambient 0.95, hemisphere 0.75, fill 0.35; 3 đèn vàng góc arena; sky `0x0a1322`, fog `0x111b2d` density 0.020.
- **Adaptive quality**: 2 cửa sổ 2 s liên tiếp **< 50 FPS** → bước 1 (ratio 1.0 + tắt shadow); tại bước 1 một cửa sổ **< 38 FPS** → bước 2 (0.85); **4 cửa sổ > 57 FPS** → lùi 1 bước. Cooldown 3 s, event `quality-changed` `{pixelRatio, shadows, fps}`.
- Tracer/vỏ đạn/impact/đạn nổ dùng pool cố định, không cấp phát object mỗi frame. Mưa **1 draw call**, cây gộp **2 mesh**, vật nổ gộp theo cụm. `F3` bật FPS counter (EMA ×0.1). Nhạc/SFX synth WebAudio, không tải file; context chỉ tạo sau thao tác người dùng đầu tiên.

### 15.6 Hạn chế đã biết

- **Thời tiết + FOV**: cỡ hạt mưa trên màn hình tính **một lần lúc khởi tạo** theo FOV hiện tại; đổi FOV sau đó chỉ làm hạt mưa trông hơi to/nhỏ — **thuần thị giác**, không ảnh hưởng gameplay.
- **Kho Thương Lái / DEAL không lưu**: kho và DEAL reset ở các mốc PLAY / RESTART / QUIT và không nằm trong save; súng đã mua vẫn còn trong save nên TIẾP TỤC vẫn giữ súng.
- **XP / kỹ năng / hợp đồng / bom / giáp / HP là per-run**: TIẾP TỤC reset sạch (xem 15.2).
- **XP hợp đồng:** thẻ ghi 90–320 XP và hệ thống kỹ năng cộng đúng lượng đó khi hợp đồng hoàn thành.
- **Save lượt chơi**: nhiệm vụ đang làm chơi lại từ đầu, wave chạy lại từ 1, độ khó theo Settings hiện tại, Sinh Tồn không tạo save.
- **Mặc định là local**: tiến trình nằm trong `localStorage`; xoá dữ liệu trang là mất, trừ khi đã xuất file (`F5`) hoặc lưu đám mây.
- **Lưu đám mây là capability (public-ish)**: ai biết **mã 10 ký tự** đều đọc/ghi/xóa được; không tài khoản, không phân quyền, không tự động sao lưu. Giới hạn **200 KB**, không có nhiều bản/version; local dev hiện **“cần bản đã triển khai”**.
- **Boss Rush dùng chỉ số gốc**: HP 1200/800/600/2000/3000, không nhân wave, không NG+; độ khó chỉ nhân HP và `dmg` cận chiến, còn hằng số đòn đặc biệt trong `bosses.js`/`origin.js` giữ nguyên.
- **Chế độ ảnh chỉ lưu PNG cục bộ**: không thư viện ảnh, không upload/chia sẻ; canvas bị chặn tải thì ảnh mất và không có thông báo.
- **Sét vẫn chạy trong Boss Rush**: thời tiết không tắt ở chế độ này nên bão + sét gần có thể xen vào trận boss — đúng hành vi hiện tại, không phải lỗi.
- **Hai đồng đội, không có party**: Mai + Eli; không có lệnh chỉ huy, không có đồng đội thứ ba, và cả hai chỉ nhận sát thương từ splash nổ (zombie không đánh).
- **Daily không khóa cứng 1 lần/ngày**: mỗi ngày có một modifier + một bảng daily, nhưng chạy lại trong ngày chỉ cập nhật best.
- **Bóng đổ tĩnh ~2 Hz**: shadow map chỉ refresh mỗi 30 frame hoặc 4 m; zombie/boss/wildlife/NPC không castShadow nên không có bóng động.
- **Trần 40 zombie sống**: `renderInfo().zombies` có thể > 40 vì đếm cả xác/đơn đang chờ.
- **Bundle lớn**: JS **~1.32 MB chưa nén** (gzip **~367.57 kB**), Vite cảnh báo chunk > 500 kB; chưa code-split vì game tải một lần.



## 16. Bổ sung Phase 4 — Boss Rush, chế độ ảnh & dữ liệu lưu

### 16.1 Boss Rush — nút **ĐẤU BOSS**

Bấm **ĐẤU BOSS** ở menu để chạy một lượt **mới tinh** trong **Vùng Cách Ly 60×60 m**: tiền $0, 3 súng khởi đầu, XP/perk reset, không intro, không nhiệm vụ, không wave thường. Đấu trường được dọn sạch trước boss đầu.

| # | Boss | HP gốc | Điểm xuất hiện (x, z) | Thưởng |
|---:|---|---:|---|---:|
| 1 | **Đồ Tể** (`butcher`) | 1200 | (0, −12) | $1000 |
| 2 | **Kẻ Phun Acid** (`spitter`) | 800 | (12, 0) | $1500 |
| 3 | **Kẻ Gào Thét** (`screamer`) | 600 | (−12, 0) | $2000 |
| 4 | **Người Đá** (`golem`) | 2000 | (0, 12) | $2500 |
| 5 | **Nguồn Gốc** (`origin`) | 3000 | (0, 0) | $3000 |

- **Một boss sống tại một thời điểm.** Boss kế xuất hiện sau **2.5 s** kể từ lúc boss trước gục; đồng hồ chạy bằng `dt` nên pause làm đóng băng khoảng nghỉ. Minion do boss triệu hồi vẫn tồn tại khi chuyển boss.
- **Điểm** = `1000 × số boss đã hạ` + thưởng thời gian `round(max(0, 600 − giây) × 10)`. Thưởng tối đa **6000** ở 0:00, bằng **0** từ 10:00; thắng sạch 5 boss = **5000 + thưởng**, tối đa **11 000**.
- **Độ khó** đọc từ Settings lúc bắt đầu, chỉ nhân **HP** và **`dmg` cận chiến**; không nhân wave, không NG+:

  | Preset | HP | Sát thương |
  |---|---|---|
  | Dễ | ×0.75 | ×0.7 |
  | Thường | ×1 | ×1 |
  | Khó | ×1.35 | ×1.3 |

- **Thắng** (hạ Nguồn Gốc) / **thua** (bạn chết) mở panel **BOSS RUSH HOÀN THÀNH / THẤT BẠI** với `THỜI GIAN` · `BOSS` · `ĐIỂM` · **`BEST`** · **`RANK`** (hạng của lượt vừa rồi, ẩn nếu rơi khỏi top 10) · hàng `DAILY` khi là lượt daily; ba nút **CHƠI LẠI** (RETRY — run mới), **XẾP HẠNG** (mở bảng top 10 mà không đóng panel) / **MENU**. Panel modal, không đóng bằng click nền hay `Esc`.
- **Không đè save cốt truyện**: snapshot save trả `null` trong suốt run và cả sau khi có kết quả, nên TIẾP TỤC vẫn là save story cũ.
- **Perk có thể ngắt nhịp**: XP hạ boss có thể mở overlay chọn kỹ năng ngay sau khi boss gục; game tạm dừng nên khoảng nghỉ 2.5 s cũng đứng yên tới khi chọn xong.
- **Thời tiết vẫn chạy**: mưa / bão / sương mù tiếp tục, nên **bão + sét gần vẫn có thể xảy ra**; event / mission / wave bị tắt.

### 16.2 Chế độ ảnh — `F2` / `F4`

| Phím / thao tác | Hành động |
|---|---|
| `F2` | Mở / đóng — chỉ từ trạng thái **đang chơi**, không mở khi overlay khác đang hiện |
| `W` `A` `S` `D` | Bay theo trục camera (forward theo cả pitch) |
| `Q` / `E` | Hạ / nâng theo trục thế giới |
| `Shift` | Bay nhanh **×3** |
| Kéo **chuột trái** | Xoay nhìn, pitch giới hạn ±85° (không cần pointer lock) |
| `F4` | Lưu khung hình **PNG** |
| `Esc` / `F2` / nút **ĐÓNG** | Thoát |

- Mở ảnh → **game tạm dừng**, HUD + mọi lớp UI ẩn; đóng → khôi phục **đúng vị trí, quaternion, FOV, Euler order** của camera và hiện lại HUD.
- Ảnh tải về `gun-game-photo-<timestamp>.png`; canvas bị chặn tải thì **im lặng**, không crash. Ảnh chỉ ở máy — **không upload/cloud**.
- Đóng không tự khoá lại chuột; click canvas để vào pointer lock. Đổi sang menu / gameover / intro hoặc mở overlay khác sẽ tự đóng.

### 16.3 Dữ liệu lưu — nút **DỮ LIỆU LƯU**, `F5` / `F9`

Không tài khoản: **sao lưu cục bộ = một file JSON**. Mở bằng nút **DỮ LIỆU LƯU** ở menu; panel có **XUẤT** · **NHẬP** · **CLOUD** · **ĐÓNG**, mở khi đang chơi cũng **không tạm dừng game**. Phím tắt `F5` / `F9` hoạt động ở mọi trạng thái. Nút **CLOUD** mở **Lưu đám mây** (mục 17.4) — bản deploy Vercel dùng đúng 7 key này.

| Key trong bundle | Nội dung |
|---|---|
| `gungame.save.v1` | Save lượt chơi: tiền, súng + nâng cấp + **phụ tùng**, nhiệm vụ, cổng, điểm, wave |
| `gungame.profile.v1` | Thống kê trọn đời (kill, headshot, chết, giờ chơi, boss, tiền, kỷ lục) |
| `gungame.achv.v1` | ID thành tựu đã mở |
| `gungame.codex.v1` | Hồ sơ nhân vật `{chars, secrets}` |
| `gungame.codex.progress.v1` | Bộ đếm tích luỹ: số survivor + 4 loại boss đã hạ |
| `gungame.endless.v1` | Kỷ lục Sinh Tồn `{wave, score}` |
| `gungame.settings` | Độ nhạy, âm lượng, ngôn ngữ, high score, độ khó, trợ năng |

- Bundle: `{app:"gun-game", version:1, exportedAt, data:{…}}`; file `gun-game-save-YYYYMMDD-HHmm.json`. Chỉ key **đang có trên máy** được xuất; chuỗi JSON hỏng được giữ nguyên thay vì làm mất.
- **Nhập** kiểm tra `app`, `version`, `data` object phẳng và **whitelist đúng 7 key**; key lạ (kể cả `__proto__`) bị bỏ qua. File hỏng / sai version / quá **5 MB** bị từ chối và **không ghi gì**.
- Nhập thành công ghi đủ mục rồi **tự tải lại trang sau 300 ms**. **`gungame.tutorial.v1` không nằm trong bundle** — cờ tutorial theo từng máy. **Bảng xếp hạng, daily và mã đám mây cũng không nằm trong bundle**; lưu đám mây dùng đúng 7 key tiến trình.

## 17. Bổ sung Phase 5 — Vòng vũ khí, xếp hạng, daily, đám mây & intro

### 17.1 Vòng vũ khí — giữ `Q`

Giữ `Q` khi đang chơi để mở vòng 12 ô; **thả `Q`** xác nhận, **`Esc`** hủy. Vòng mở thì game **tạm dừng** (pause reason `wheel`), pointer lock nhả ra và **không tự khóa lại**.

| Thao tác | Hành vi |
|---|---|
| **Hướng chuột** | Chọn ô gần con trỏ nhất so với tâm màn hình; ô 1 ở đỉnh, chiều kim đồng hồ, **30° mỗi ô**, dead-zone **18 px** |
| **Con lăn** | Xoay **±1 ô**, quấn vòng |
| **Phím số** | `1`…`9`, `0`, `-`, `=` nhảy thẳng (numpad cũng nhận) |
| **Thả `Q`** | Đổi sang ô đang sáng nếu đã sở hữu |
| **`Esc`** | Hủy, trả lại súng trước khi mở |
| **Ô khóa** | Mờ 42% + ổ khóa; xác nhận không đổi súng, hiện toast **ĐÃ KHÓA** 1 s |

- 12 ô đúng thứ tự `pistol · shotgun · rifle · smg · sniper · minigun · grenade · magnum · dmr · railgun · sawnoff · crossbow`; ô đang cầm có viền/gạch vàng, tâm vòng hiện tên + `băng / dự trữ`.
- Không mở khi state không phải `playing` hoặc khi shop / sổ tay / Thương Lái / perk / hợp đồng / Boss Rush / ảnh / bản đồ đang mở.
- EN/VI cập nhật tại chỗ; chỉ vẽ lại khi có input, không ghi DOM mỗi frame.

### 17.2 Bảng xếp hạng Boss Rush

- Key `gungame.bossrush.board.v1`, tối đa **10 entry** `{score, time, bossesDown, win, daily, dateKey, at}`; mỗi lượt ghi đúng một entry.
- **Sắp xếp**: điểm **giảm dần** → thời gian **tăng dần** → `at` tăng dần. Điểm bằng nhau thì lượt nhanh hơn thắng.
- Modal mở từ nút **BẢNG XẾP HẠNG** ở menu hoặc **XẾP HẠNG** trong panel kết quả; header **KỶ LỤC** (`điểm · thời gian`), tab **TẤT CẢ / HẰNG NGÀY**, bảng `# · ĐIỂM · THỜI GIAN · BOSS · NGÀY`, empty state riêng.
- Panel kết quả Boss Rush hiện **BEST** và **RANK** (1-based; ẩn nếu rơi khỏi top 10) + hàng **DAILY** khi là lượt daily.
- Storage hỏng/thiếu → bảng rỗng, không throw; đóng bằng **ĐÓNG**, click nền hoặc `Esc`.

### 17.3 Thử thách hằng ngày

- **Khóa ngày** = ngày local `YYYY-MM-DD`; không có timer nửa đêm, mỗi lần mở panel tự tính lại. Sang ngày mới tự thành `{complete:false, best:null}`.
- **Modifier** = **FNV-1a 32-bit + avalanche murmur % 3** của `dateKey` — deterministic, mọi client cùng ngày ra cùng kết quả.

| ID | Tên EN / VI | Máu boss | Sát thương cận chiến | Điểm | Thời tiết |
|---|---|---:|---:|---:|---|
| `hardcore` | HARDCORE / KHẮC NGHIỆT | **×1.25** | **×1.2** | **×1.25** | — |
| `storm` | STORM / BÃO TỐ | ×1 | ×1 | **×1.15** | ép **bão** |
| `fog` | FOG / SƯƠNG MÙ | **×1.1** | ×1 | **×1.2** | ép **sương mù** |

- `daily.start()` trả `{daily:true, dateKey, modifierId, hpMul, dmgMul, scoreMul, weather}`; `bossrush.start(options)` nhận thêm `difficulty / hpMul / dmgMul / scoreMul / daily / dateKey / modifierId / weather` (giá trị lạ bị sanitize), nhân HP/dmg + **scoreMul toàn bộ điểm**, lead gọi `weather.setMode()` và giữ mode mỗi frame.
- **Best**: điểm cao hơn thắng, bằng điểm thì thời gian nhanh hơn. Panel hiện **ĐIỂM CAO NHẤT**, **THỜI GIAN TỐT NHẤT**, chip **ĐÃ HOÀN THÀNH HÔM NAY** (thua cũng tính đã chạy) và **BẮT ĐẦU**.
- **Một lượt thử thách/ngày**, nhưng **không khóa số lần thử**: chạy lại chỉ cập nhật best. Kết quả daily vào tab **HẰNG NGÀY**.

### 17.4 Lưu đám mây — `/api/cloud-save`

Bản deploy Vercel dùng **Vercel Blob** thật; blob công khai tại `saves/<code>.json`. Không tài khoản — **mã là chìa khóa**.

| Mục | Chi tiết |
|---|---|
| **Mã** | **10 ký tự** sinh bằng `crypto.getRandomValues`, bảng 31 ký tự loại `0/O/1/I/L`, ~**49,5 bit**; lưu ở `gungame.cloud.code.v1`. Ô nhập nhận **6–32** ký tự `A-Z a-z 0-9 _ -` |
| **Methods** | `POST {code,data}` · `GET ?code=…` · `DELETE ?code=…` · `OPTIONS` |
| **Lưu** | `{ok, code, savedAt, size}`, ghi đè được |
| **Tải** | `{ok, code, app, version, savedAt, data}`; ghi 7 key rồi **reload 300 ms** |
| **Xóa** | `{ok, code, deleted:true}`; UI xác nhận hai bước trong 4 s |
| **Giới hạn** | **200 KB** body/blob (413 → `too-large`) |
| **Nội dung** | Đúng 7 key tiến trình: `save.v1`, `profile.v1`, `achv.v1`, `codex.v1`, `codex.progress.v1`, `endless.v1`, `settings`; key lạ bị bỏ |
| **Kiểm tra** | `{app:"gun-game", version:1, data:object}`; sai → lỗi, không ghi gì |

- **Cảnh báo**: ai biết mã đều **đọc/ghi đè/xóa** được. Không lưu dữ liệu cá nhân.
- **Local dev**: Vite không chạy function → UI hiện **“Lưu đám mây cần bản đã triển khai.”** (EN: *Cloud save needs the deployed build.*).
- Mở bằng nút **LƯU ĐÁM MÂY** ở menu hoặc **CLOUD** trong **DỮ LIỆU LƯU**; modal không pause game, không đụng pointer lock; `Esc`/click nền/**ĐÓNG** để thoát.

### 17.5 Intro điện ảnh

- **4 slide** full-screen, không ảnh — CSS thuần: stamp **ĐÊM THỨ 30 / NIGHT 30**, kicker **MỞ ĐẦU / STORY INTRO**, tiêu đề **THÀNH PHỐ IM · NĂM NGƯỜI ĐÃ MẤT · TÍN HIỆU · BẬT ĐIỆN** (EN: *THE CITY IS QUIET · FIVE ARE GONE · THE SIGNAL · LIGHTS ON*).
- Bộ đếm **01 / 04** + **chấm tiến trình**; hoạ tiết **radio** hai bên (vòng pulse + thanh tín hiệu), scanline, sương, vignette, quầng sáng, đường kẻ vàng.
- **`E` / click** sang slide; click bị bỏ qua khi pointer lock hoặc trong **350 ms** đầu; **`Esc` không tác dụng**.
- Nút **BỎ QUA / SKIP INTRO** ở góc dưới phải (ẩn ở slide cuối); nút `stopPropagation` để không double-advance.
- EN/VI đủ key `introChapter`, `introSkip`, `introContinue`, `intro_title_1..4`; có `prefers-reduced-motion`.

## Tài liệu liên quan

[README](../README.md) · [Kịch bản cốt truyện](STORY.md) · [Cân bằng](BALANCE.md) · [Gun Game 2.0](EXPANSION-P4.md) · [Thế giới](WORLD.md)
