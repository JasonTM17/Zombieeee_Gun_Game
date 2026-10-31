# Gun Game — HỢP ĐỒNG KỸ THUẬT "ĐÊM THỨ 30 · PHẦN 1" (docs/EXPANSION-P1.md)

> **Đây là hợp đồng DUY NHẤT cho 3 builder song song + integrator + fixer của
> Phần 1.** Nguồn hợp nhất:
>
> - **SPEC** — thông điệp đặc tả Phần 1 (đặc tả A/B/C, chép nguyên trạng ở
>   mục 3/4/5);
> - **docs/WORLD.md** — bản vẽ thế giới: mọi **toạ độ, kích thước, cổng, spawn,
>   quota, ngân sách hiệu năng** lấy từ đây (nguồn thật đã đối chiếu code
>   ngày 2026-10-31);
> - **docs/STORY.md** — hợp đồng nội dung: mọi **chữ EN/VI, key i18n, thưởng**
>   lấy từ đây, chép **nguyên văn**, không viết lại.
>
> Quy tắc phân xử: **toạ độ/khung → WORLD.md thắng**; **nội dung chữ/i18n →
> STORY.md thắng**. Các mâu thuẫn giữa hai tài liệu đã được xử lý ở mục 0.
>
> Nguyên tắc số 1 của cả phần: **GIỮ 100% TÍNH NĂNG HIỆN CÓ** — shop, boss,
> auto-reload, wave, HUD cũ không được thay đổi hành vi. Mọi sửa file hiện có
> là MỞ RỘNG cộng thêm (additive), đúng pattern docs/EXPANSION.md đã làm.

---

## MỤC LỤC

0. [Mâu thuẫn hai tài liệu — đã quyết](#0-mâu-thuẫn-hai-tài-liệu--đã-quyết)
1. [Bất biến — chữ ký frozen + số không được đổi](#1-bất-biến--chữ-ký-frozen--số-không-được-đổi)
2. [Phân công builder](#2-phân-công-builder)
3. [TÍNH NĂNG A — THẾ GIỚI MỞ (level.js + city.js)](#3-tính-năng-a--th-gi-m--leveljs--cityjs)
4. [TÍNH NĂNG B — QUOTA + waves.js MỞ RỘNG](#4-tính-năng-b--quota--wavesjs-m-r-ng)
5. [TÍNH NĂNG C — CỐT TRUYỆN 9 NHIỆM VỤ](#5-tính-năng-c--cốt-truyện-9-nhiệm-vụ)
6. [Bảng event bus MỚI (tổng hợp)](#6-bảng-event-bus-m-i-tổng-hợp)
7. [Key i18n (nguồn STORY.md) + phân bổ đăng ký](#7-key-i18n-nguồn-storymd--phân-bổ-đăng-ký)
8. [Balance](#8-balance)
9. [README.md (fixer, cuối cùng)](#9-readmemd-fixer-cuối-cùng)
10. [Checklist đồng bộ số + dev-guard](#10-checklist-đồng-bộ-số--dev-guard)

---

## 0. Mâu thuẫn hai tài liệu — đã quyết

Rà toàn bộ docs/WORLD.md + docs/STORY.md, tìm thấy 6 điểm lệch. Mục tiêu
trong A ("quarantine", toạ độ (0,0)), số quota từng khu, chuỗi nhiệm vụ 1→9,
thưởng 300–600 và bảng 12 cổng **khớp nhau giữa hai tài liệu** — không phải
mâu thuẫn. Những điểm LỆCH được quyết như sau:

| # | Vấn đề | WORLD.md | STORY.md | QUYẾT |
|---|---|---|---|---|
| K1 | Tên điểm tương tác M3/M5/M9 | target id `radio-tower` / `campfire` / `final-door` (mục 11) | gọi là `target_antenna` / `target_campfire` / `target_steel_door` | **Không phải mâu thuẫn — hai namespace.** Target id (bus `"interact"` {target}, payload objective) theo **WORLD.md mục 11**; `target_*` là **key i18n hiển thị** theo STORY.md §7.3. Bảng ánh xạ: `radio-tower`↔`target_antenna`, `campfire`↔`target_campfire`, `final-door`↔`target_steel_door`, `generator-*`↔`target_generator`. |
| K2 | Mở cổng nào sau M6 | **G6 (docks↔safehouse) + D-Q (docks→quarantine) cùng mở** ("M6 xong (cùng D-Q — khép vành đai)", bảng mục 6) | chỉ nêu "docks → quarantine (cổng thép tâm)" | **WORLD.md thắng**: M6 hoàn thành bắn HAI `gate-open`: `{from:"docks", to:"quarantine"}` VÀ `{from:"docks", to:"safehouse"}`. |
| K3 | Thoại M1 "power opens the west fence" | G1 nằm tại (−72, −30) — **cạnh BẮC** của safehouse (ranh z = −30) | thoại ghi "west fence" | Chữ thoại là tài sản STORY.md (chép nguyên văn, KHÔNG sửa); hình học là tài sản WORLD.md (G1 ở (−72,−30)). Builder không "sửa thoại cho khớp hình học" hay ngược lại. |
| K4 | Quota có tính boss chết trong khu không | Không — "quota chỉ nhận walker/runner/brute" (mục 9) | không đề cập | **WORLD.md thắng**: `"zombie-killed"` chỉ cộng quota khi `detail.type ∈ {walker, runner, brute}`. Boss kill chỉ phục vụ objective `boss` (M8). |
| K5 | Tường compound safehouse merge vào nhóm nào | mục 7: "nhà-1" | mục 6/§10 ngân sách: "Tường ranh 6 khu + tường compound: 1 mesh" | Gộp theo **mục 10** (cùng 1 material vertexColors → tổng draw call KHÔNG đổi). Builder chọn 1 nhóm, giữ đúng trần ngân sách mục 3.7. |
| K6 | STORY §5 chú thích "nếu WORLD nối quarantine nhiều phía thì mở tất cả trong một lần" | D-Q mở ở M6; S-Q/R-Q/C-Q/H-Q/P-Q mở ở **M9** | cho phép gộp | **WORLD.md thắng**: M6 chỉ mở D-Q (+G6, K2); 5 cổng thép còn lại mở đồng loạt khi M9 hoàn thành (5 event `gate-open`). |
| K7 | Số waypoint `getGateWaypoints()` (mâu thuẫn NỘI BỘ WORLD.md) | §6.4: "trả **12 waypoint** = tâm 12 gap bảng mục 6, thay cho mảng 2 điểm" | §2 + §4: "2 cổng nội bộ (0,−30) và (30,0) **giữ nguyên 100%**" | **14 waypoint** (12 gap bảng + 2 nội bộ). Lý do: mảng bị "thay" chính là 2 waypoint nội bộ (`level.js:79-82`); xoá chúng thì zombie mất route arena ↔ north/east (cơ chế C3, cùng nguyên tắc "giữ nguyên 100%"). |

Không có mâu thuẫn toạ độ thuần nào khác: bounds 7 khu, 12 cổng, POI mục 11,
spawn mục 8 và chuỗi nhiệm vụ khớp từng số.

---

## 1. Bất biến — chữ ký frozen + số không được đổi

Đã đối chiếu trực tiếp trong code (ngày 2026-10-31). Không đổi trừ nơi hợp
đồng này ghi rõ "MỞ RỘNG":

- `createLevel(scene)` → `{colliders, isBlocked, spawnPoints, getGateWaypoints,
  sameArea, setZoneLocked, dispose}` (`src/world/level.js:750`) — API GIỮ
  NGUYÊN, mở rộng theo mục 3.5.
- `createZones(scene, level)` → `{list, unlockForWave, bossAnchorFor, reset}`
  (`src/world/zones.js:112, 232`) — chỉ thêm story-guard (mục 5.6.4), chữ ký
  không đổi.
- `createWaves(scene, level, bus, zones)` (`src/zombies/waves.js:100`) — thêm
  tham số TUỲ CHỌN thứ 5 `city` (mục 4.3); 4 tham số cũ nguyên vị trí.
- `createEconomy(bus)` (`src/systems/economy.js:69`); `createGamestate(bus,
  settings)` (`src/systems/gamestate.js:135`); `createInput(canvas, settings)`
  (`src/core/input.js:95`); `createHud(container, bus, audio, i18n)`
  (`src/ui/hud.js:264`); `createMenus(container, bus, settings, i18n)`
  (`src/ui/menus.js:97`) — không đổi chữ ký, chỉ mở rộng hành vi.
- `bus` — một EventTarget duy nhất export từ `src/systems/gamestate.js:56`;
  module mới không nhận bus qua tham số thì import trực tiếp (pattern
  `zones.js:75`, `input.js:67`).
- Số quarantine KHÔNG được đổi (nguồn từng số trong bảng mục 3.2 — là số đọc
  trực tiếp từ `level.js`/`zones.js`): HALF 30, WALL_H 4, WALL_T 0.5, 3 rect
  `AREA_RECTS` (`level.js:72-76`), 2 cổng nội bộ gap ±2 m
  (`level.js:69, 79-82`), 15 obstacle + 11 zone props (`level.js:102-148`),
  18 spawn legacy (`level.js:85-92, 588-601`), 2 boss anchor north (−5,−45) /
  east (42,0) (`zones.js:99, 108`).
- Wave: tổng `5 + 3n` (`waves.js:139`), boss wave mỗi 5 (`waves.js:163`),
  intermission 10 s (`waves.js:92`), MIN_SPAWN_DIST 15 (`waves.js:93`),
  jitter 0.7 (`waves.js:94`) — giữ nguyên.
- Thứ tự khởi tạo `main.js` giữ nguyên relative order; các module mới chèn
  theo mục 5.6.
- Thưởng/đòn/zombie/boss/shop/HUD cũ: KHÔNG sửa hành vi.

---

## 2. Phân công builder

| Vai | File được đụng | Ghi chú |
|---|---|---|
| **Builder WORLD** | `src/world/level.js` (mở rộng), `src/world/city.js` (MỚI), `src/world/atmosphere.js` (mở rộng: fog + shadow follow) | Toạ độ mục 3 |
| **Builder SYSTEMS** | `src/systems/missions.js` (MỚI), `src/zombies/waves.js` (mở rộng), `src/core/input.js` (mở rộng phím E), `src/systems/gamestate.js` (mở rộng state "intro") | Hợp đồng mục 4 + 5.1–5.2 + 5.6.1 |
| **Builder UI** | `src/ui/dialogue.js` (MỚI), `src/ui/hud.js` (mở rộng), `src/ui/menus.js` (mở rộng) | Mục 5.3–5.5; style.css KHÔNG đụng — widget tự style inline như hud.js hiện tại (`hud.js:240-245`) |
| **Integrator** | `src/main.js`, `src/systems/gamestate.js` (nếu SYSTEMS không nhận) | Mục 5.6; wire toàn bộ event mới |
| **Fixer** | `README.md` | Mục 9, làm CUỐI |

Stub đã chuẩn bị sẵn (đọc kỹ JSDoc trong file — đó là hợp đồng dạng code):
`src/world/city.js`, `src/systems/missions.js`, `src/ui/dialogue.js` — hiện
`throw new Error("TODO")`, builder thay thân hàm, **giữ nguyên chữ ký + typedef**.

---

## 3. TÍNH NĂNG A — THẾ GIỚI MỞ (level.js + city.js)

### 3.0 SPEC A (nguyên văn yêu cầu)

> Thành phố ~260×260 m, tâm (0,0). 7 KHU với id + tên EN/VI + vị trí khớp
> docs/WORLD.md (bảng mục 3.1 dưới). QUAN TRỌNG: level.js giữ API cũ
> (isBlocked, spawnPoints, colliders, getGateWaypoints) nhưng mở rộng thành
> toàn thành phố; geometry nhà cửa PHẢI merge (BufferGeometryUtils.
> mergeGeometries hoặc cộng tay) — mỗi khu tối đa 2-3 draw call cho toàn nhà
> cửa; buildings KHÔNG castShadow; fog dày hơn chút để giấu giới hạn vẽ; tổng
> zombies đồng thời cap ~60 (pool tái sử dụng).
>
> CỔNG PHONG TOẢ giữa các khu liền kề: khung cổng thép + rào chắn phát sáng đỏ
> khi khoá, xanh khi mở; mỗi cổng 4-5 m rộng; zombie VÀ người chơi chỉ đi lọt
> qua cổng (tường bao liền mạch chặn mọi lối khác); khi mở: rào chắn chìm xuống
> đất 1 s + âm thanh + toast.
>
> `src/world/city.js` (MỚI): `createCity(scene, level)` → `{districts,
> districtAt(x,z), gateBetween(fromId,toId), setGateOpen(fromId,toId,open)}`
> — sinh geometry + đăng ký colliders vào level; lộ dữ liệu cho missions/HUD.

### 3.1 Bảng 7 khu — `districts[]` của city.js (nguồn WORLD.md mục 3)

Bounds là hình chữ nhật XZ khép kín; **mọi điểm ngoài 7 bounds = void
(isBlocked = true)** — đúng hành vi `!inBounds` hiện có (`level.js:688-690,
703`). Toàn bộ số dưới đây đã đối chiếu với code hiện có.

| id | nameKey | minX | maxX | minZ | maxZ | Kích thước | quotaNeed | center (x, z) | Vai trò |
|---|---|---|---|---|---|---|---|---|---|
| `safehouse` | `district_safehouse` | −130 | −30 | −30 | 30 | 100×60 | — | (−75, 8) | Hub, máy phát, hồi sinh |
| `residential` | `district_residential` | −130 | −15 | −130 | −30 | 115×100 | 20 | (−72, −80) | Nhà phố 2 tầng |
| `commercial` | `district_commercial` | −15 | 130 | −130 | −54 | 145×76 | 25 | (57, −92) | Plaza + cửa hiệu |
| `hospital` | `district_hospital` | 54 | 130 | −54 | 30 | 76×84 | 30 | (92, −12) | Toà kính vỡ + lều |
| `park` | `district_park` | −15 | 130 | 30 | 130 | 145×100 | 25 | (57, 80) | Cây + hồ + lửa trại |
| `docks` | `district_docks` | −130 | −15 | 30 | 130 | 115×100 | 30 | (−72, 80) | Container + cần cẩu |
| `quarantine` | `district_quarantine` | −30 | 54 (bbox) | −54 | 30 (bbox) | 84×84 | — | (0, 0) | Khu cuối, khoá đến M6 |

Quy tắc `districtAt(x, z)`:
1. Kiểm tra quarantine **trước tiên** bằng **3 rect con** (KHÔNG dùng bbox —
   bbox chỉ là dữ liệu hiển thị HUD/debug): arena `−30..30 × −30..30`,
   north `−15..15 × −54..−30`, east `30..54 × −15..15` (nguồn `level.js:72-76`).
2. Rồi lướt 6 khu còn lại theo thứ tự bảng trên.
3. Dải `x −30..−15, z −54..−30` (giữa tường tây arena và tường side bắc của
   "Sân sau") **thuộc residential** (phố nẹp, có cổng R-Q).
4. 3 notch NỘI bbox quarantine nhưng NGOÀI 3 rect là **VOID** (đất sụp, chỉ vẽ
   silhouette, không collider): N-B1 `x 15..30, z −54..−30`; N-B2
   `x 30..54, z −54..−15`; N-B3 `x 30..54, z 15..30`.
5. Điểm ngoài tất cả → `null`.

Cặp bounds chỉ chạm nhau trên đường biên (0 m² diện tích giao nhau — đã kiểm
tra từng cặp; cặp residential∩quarantine-bbox giao dải R-Q đã nêu ở quy tắc 3
và được xử lý bởi quy tắc 1).

### 3.2 QUARANTINE — giữ nguyên từng mét (nguồn WORLD.md mục 4, số đọc từ code)

| Thứ | Giá trị | Nguồn đã xác minh |
|---|---|---|
| Arena 60×60 | `HALF = 30`, tường cao 4, dày 0.5 | `level.js:62-64` |
| Rect arena | `−30..30 × −30..30` | `level.js:73` |
| Rect north "Sân sau" | `−15..15 × −54..−30` | `level.js:74` |
| Rect east "Kho" | `30..54 × −15..15` | `level.js:75` |
| 2 cổng nội bộ | waypoint (0, −30) và (30, 0), gap ±2 m | `level.js:69, 79-82` |
| Wall spans | 12 span hiện tại | `level.js:158-176` |
| Props legacy | 15 obstacle + 11 zone props | `level.js:102-148` |
| Spawn legacy | 12 ring R=26 + 6 zone | `level.js:588-601, 85-92` |
| Boss anchor | north (−5, −45) · east (42, 0) | `zones.js:99, 108` |

Thêm ĐÚNG 1 prop mới trong quarantine: **CỬA THÉP CUỐI (vault door)** tại
**(0, 0)** — đĩa thép tròn Ø 4 m, dày 0.6, nửa chìm (đỉnh y = 0.3), material
emissive lạnh `#4fd8ff`, `userData.solid = true`, collider `−2..2 × −2..2`.
Vị trí trống trong layout legacy (obstacle gần nhất (−8, −6), `level.js:104`).
Đây là target `reach` của M9 (mục 5.1.3). **Builder WORLD builds nó trong
level.js** (nằm trong lãnh thổ quarantine); missions.js chỉ tham chiếu toạ độ.

CẤM: đổi `HALF`, gap cổng nội bộ, obstacle legacy, 18 spawn legacy, 2 boss
anchor — waves/boss/zombie pathing đang sống trên các số này.

### 3.3 Đường phố (nguồn WORLD.md mục 5 — BẮT BUỘC thông)

Đường 8 m (trục chính) / 5 m (nhánh), hình thành bởi KHE giữa khối props —
không vẽ mesh đường riêng. Mỗi cổng mở ra đúng 1 đường trong bảng; mọi spawn
point (mục 3.6.6) nằm trên/kề đường ≤ 3 m; lối hẹp nhất giữa 2 props ≥ 3 m.

| Đường | Nối | Tuyến chính |
|---|---|---|
| Trục Tây | S-Q (−30,0) ↔ compound safehouse | `z −4..4`, `x −55..−30`; qua cổng compound `x=−55, z −2..2` vào sân (−75, 8) |
| Vành Bắc Tây | G1 (−72,−30) ↔ nội khu residential | trục N-S `x −76..−68`, `z −30..−66`, gặp trục nhà phố E-W `z −74..−66` |
| Trục Nhà Phố | E-W residential | `z −74..−66`, `x −130..−15`; nhánh N-S `x −19..−11` lên G2 (−15,−95); phố nẹp `x −30..−15, z −54..−30` sang R-Q (−15,−42) |
| Trục Plaza | C-Q (0,−54) ↔ plaza ↔ G2/G3 | E-W chính `z −62..−50` hết `x −15..130`; hẻm N-S `x 28..32` xuyên hàng hiệu lên plaza `30..80 × −115..−75`; nhánh E-W `z −99..−91` từ plaza sang G2 (−15,−95) |
| Tiền Sảnh | H-Q (54,0) ↔ sảnh bệnh viện | sân `x 54..76, z −20..20`; vòng E-W `z −54..−46` lên G3 (85,−54) và `z 22..30` xuống G4 (85,30) |
| Lối Công Viên | P-Q (0,30) ↔ G4 ↔ G5 | đường dạo `z 30..38` hết `x −15..130`; nhánh N-S `x −15..−7, z 60..90` ra G5 (−15,75); vòng quanh hồ |
| Trục Cảng | D-Q (−22,30) ↔ G6 ↔ G5 ↔ bãi container | N-S `x −26..−18` và `x −76..−68` từ `z 30` xuống E-W chính `z 60..68` hết `x −130..−15` |

### 3.4 12 cổng + tường cắt (nguồn WORLD.md mục 6)

Mỗi cổng = khung thép (2 post + lintel) + rào chắn trượt. Pattern khung/icon
+ collider post y hệt cổng hiện có (`level.js:524-583`), tái dùng
`makeGateIconTexture` (`level.js:239-268`). Emissive: **đỏ `#ff3b30` khi khoá,
xanh lục `#3dff6e` khi mở**. Khung all-gates merge thành **1 mesh**; rào chắn
từng cổng là **mesh riêng** (chìm độc lập); viền rào dùng cùng material khung
(→ 12 draw call, xem ngân sách 3.7).

| Cổng | from → to | Vị trí (x, z) | Gap theo trục | Rộng | Loại | Mở khi |
|---|---|---|---|---|---|---|
| G1 | safehouse ↔ residential | (−72, −30) | X (tường E-W) | 5 m | khung sắt | M1 xong → `gate-open {safehouse, residential}` |
| G2 | residential ↔ commercial | (−15, −95) | Z (tường N-S) | 5 m | khung sắt | M2 xong |
| G3 | commercial ↔ hospital | (85, −54) | X | 5 m | khung sắt | M3 xong |
| G4 | hospital ↔ park | (85, 30) | X | 5 m | khung sắt | M4 xong |
| G5 | park ↔ docks | (−15, 75) | Z | 5 m | khung sắt | M5 xong |
| G6 | docks ↔ safehouse | (−72, 30) | X | 5 m | khung sắt | M6 xong (cùng D-Q — khép vành đai; quyết K2) |
| D-Q | docks → quarantine | (−22, 30) | X | 5 m | **THÉP** (cổng chính trung tâm) | M6 xong |
| S-Q | safehouse → quarantine | (−30, 0) | Z | 4 m | thép hàn kín | M9 xong (chơi tự do) |
| R-Q | residential → quarantine | (−15, −42) | Z | 4 m | thép hàn kín | M9 xong |
| C-Q | commercial → quarantine | (0, −54) | X | 4 m | thép hàn kín | M9 xong |
| H-Q | hospital → quarantine | (54, 0) | Z | 4 m | thép hàn kín | M9 xong |
| P-Q | park → quarantine | (0, 30) | X | 5 m | thép hàn kín | M9 xong |

**Tường bị cắt quanh gap** (các span hiện tại tách đôi/ba — kỹ thuật
2-segment đã có ở `level.js:163-167`):

| Tường | Span hiện tại | Cắt quanh |
|---|---|---|
| Nam arena (D-Q + P-Q) | `level.js:160` `x −30.25..30.25, z 29.75..30.25` | 3 đoạn, gaps `x −24.5..−19.5` và `x −2.5..2.5` |
| Tây arena (S-Q) | `level.js:161` `x −30.25..−29.75, z −30..30` | gap `z −2..2` |
| Side bắc north (R-Q) | `level.js:169` `x −15.25..−14.75, z −54.25..−30` | gap `z −44..−40` |
| Back north (C-Q) | `level.js:171` `x −15..15, z −54.25..−53.75` | gap `x −2..2` |
| Back east (H-Q) | `level.js:175` `x 53.75..54.25, z −15..15` | gap `z −2..2` |

**Tường ranh giới mới** (không tồn tại trong code): tường bê tông cao 4.5 m,
dày 0.5 dọc 6 biên dùng chung của bảng mục 3.1, chừa đúng gap cổng; tường
ngoài ±130 cao 6 m, dày 1. Merge: outer wall 1 mesh + (boundary + compound)
1 mesh với `tintGeometry` như `level.js:299-309`.

**Cơ chế mở** `setGateOpen(from, to, true)`:
1. Rào chắn (box ~5×3×0.4 chắn đúng gap) **chìm xuống đất trong 1.0 s** (tween
   y từ 1.5 → −1.6).
2. Khung + icon đổi emissive đỏ → xanh trong cùng 1 s.
3. Collider rào chắn bị **gỡ khỏi `level.colliders` đúng lúc chìm xong** (không
   phải lúc bắt đầu — tránh lộ khe 0.3 s).
4. Âm thanh trầm: audio.js frozen (`audio.js:352-364` không có method cổng) —
   **city.js tự synthesise** một rumble WebAudio ngắn (pattern explosives.js
   tự synth boom, `explosives.js:105-131`). Toast do HUD bắn khi nghe
   `gate-open` (mục 5.4).
5. `setGateOpen` idempotent (mở cổng đang mở / khoá cổng đang khoá = no-op,
   trả false); cặp (from, to) so khớp KHÔNG thứ tự (G6 ghi "docks ↔
   safehouse" — gọi `setGateOpen("safehouse","docks",true)` vẫn khớp).
6. `getGateWaypoints()` — thay mảng 2 điểm cố định (`level.js:79-82`) bằng
   **14 waypoint**: tâm 12 gap bảng trên (6 G + 6 cổng thép) **cộng** 2
   waypoint nội bộ quarantine hiện có (0, −30) và (30, 0). Lý do phải giữ 2
   điểm nội bộ: cổng nội bộ "giữ nguyên 100%" (mục 3.2) và zombie route qua
   waypoint cổng khi `sameArea` sai (cơ chế C3 hiện có) — thiếu 2 điểm đó thì
   zombie không đi được arena ↔ north/east. Waypoint cổng đang khoá vẫn trả
   về — `sameArea` mở rộng (mục 3.5.4) chặn zombie đi xuyên tường.

### 3.5 level.js MỞ RỘNG (Builder WORLD)

Giữ nguyên export + mọi chữ ký (`level.js:750`). Các sửa:

1. **WALL_SPANS**: cắt 5 span theo bảng mục 3.4 (đồng thời sửa cả geometry
   lẫn collider vì cả hai sinh từ cùng span, `level.js:417-426`).
2. **Bounds 7 khu**: bỏ check `!inBounds` 3-rect trong `isBlocked`
   (`level.js:703`), thay bằng test 7 bounds — quarantine theo 3 rect con
   (`AREA_RECTS` giữ nguyên là nguồn), 6 khu ngoài là bảng hằng số mới
   `DISTRICT_RECTS` chép từ mục 3.1. Điểm ngoài tất cả → blocked (void như cũ).
   Dải R-Q `x −30..−15, z −54..−30` phải trả về residential (không void) —
   level.js và city.js dùng CÙNG một bảng (checklist mục 10).
3. **`getGateWaypoints()`** → mảng 14 điểm (12 cổng khu mục 3.4 + 2 cổng nội
   bộ hiện có). Có thể để city.js đăng ký waypoint bổ sung qua hàm nội bộ —
   quyết định builder WORLD, miễn API + kết quả đúng.
4. **`sameArea(x1,z1,x2,z2)` mở rộng** (`level.js:723-726`): true khi 2 điểm
   cùng 1 district (quarantine tính theo 3 rect) **hoặc** nối được qua ≥ 1
   cổng ĐANG MỞ. level.js cần biết trạng thái cổng → nhận từ city.js qua
   hàm đăng ký nội bộ (ví dụ `__setGateOpenState(list)` — private, không thêm
   vào export chính) hoặc level giữ callback do city truyền vào khi build.
   Zombie giữ steering cũ trong cùng khu; khác khu → đi waypoint cổng chung.
5. **`setZoneLocked("north"|"east", locked)` GIỮ NGUYÊN** — caller hiện có
   `zones.js:161, 181, 213` không được phá.
6. **spawnPoints hiện tại (12 ring + 6 zone)** giữ nguyên — là pool
   quarantine; pool 6 khu mới do city.js quản lý riêng (mục 3.6.6).
7. **Vault door (0,0)** dựng ở đây (mục 3.2), castShadow = true.
8. Colliders tăng ~4×: giữ isBlocked O(n) circle-vs-AABB như hiện tại
   (`level.js:708-711`) — ~250 collider × vài trăm query/frame vẫn ok; nếu
   profiler đỏ, spatial hash theo khu là quyết định của builder, KHÔNG đổi API.

### 3.6 city.js (MỚI) — Builder WORLD

Stub: `src/world/city.js` (đã có, đang `throw new Error("TODO")` — giữ JSDoc
+ typedef khi thay thân).

#### 3.6.1 API (đúng từng chữ)

```js
createCity(scene, level) => {
  districts: [{                       // 7 phần tử, thứ tự bảng mục 3.1
    id: string,                       // "safehouse" | ... | "quarantine"
    nameKey: string,                  // "district_safehouse" | ...
    bounds: {minX, maxX, minZ, maxZ}, // quarantine = bbox (hiển thị)
    gates: [{to, x, z}],              // cổng nối trực tiếp; to = id khu kia
    spawnPoints: [{x, z}],            // mục 3.6.6 (quarantine → mảng rỗng:
                                      //  pool legacy nằm ở level.spawnPoints)
    quotaNeed: number,                // 0 với safehouse/quarantine
    center: {x, z},                   // mục 3.1; teleportDistrict rơi vào đây
  }],
  districtAt(x, z) => id | null,      // quy tắc 3.1
  gateBetween(fromId, toId) =>        // cặp KHÔNG thứ tự; null nếu không kề
    {from, to, x, z, axis, width, open} | null,   // open = trạng thái live
  setGateOpen(fromId, toId, open) => boolean,     // cơ chế mục 3.4; idempotent
}
```

`city.js` import `mergeGeometries` từ
`three/addons/utils/BufferGeometryUtils.js` (đã dùng ở `level.js:60`).

#### 3.6.2 Chuyển giao colliders + trạng thái vào level

- Mọi collider city tạo → `level.colliders.push(...)` (mảng public,
  `level.js:750, 377`). Rào chắn cổng: collider tạm, gỡ (splice theo tham
  chiếu) khi chìm xong.
- Đăng ký 12 waypoint + trạng thái mở vào level cho `sameArea`/
  `getGateWaypoints` (cơ chế mục 3.5.3–3.5.4).
- Dev-guard (pattern `zones.js:139-152`, warn KHÔNG throw): sau khi build xong,
  kiểm tra mọi điểm POI (mục 5.1.3), spawn (mục 3.6.6), center, waypoint cổng
  qua `level.isBlocked(p.x, p.z, 0.8)` — vi phạm thì `console.warn("[city] ...")`.

#### 3.6.3 Sàn + silhouette

- Sàn city: 1 plane 260×260, y = −0.02, receiveShadow, texture asphalt từ
  `makeFloorTexture` pattern (`level.js:185-232`) repeat 130×130. 3 plane sàn
  legacy quarantine (`level.js:395-412`) GIỮ NGUYÊN, phủ đè lên trên.
- **Silhouette nhà sụp `cityfill-1`**: phủ 3 notch VOID + dải đất ngoài 7
  bounds nhưng trong tầm nhìn (~90 m) — khối hộp tối 8-15 m cao, merge toàn
  thành phố thành **1 mesh**, `userData.solid = true`, KHÔNG collider (đã
  blocked bởi bounds), KHÔNG castShadow, receiveShadow = true.

#### 3.6.4 PROPS từng khu + nhóm merge (nguồn WORLD.md mục 7)

Quy tắc chung: merge mọi box cùng material `vertexColors` về 1 mesh/khu
(≤ 2 mesh nhà cửa/khu); lớp emissive (biển hiệu, cửa sổ sáng, đèn) merge riêng
1 mesh/khu; props nhỏ gom theo kind — mỗi kind 1 mesh/khu. **Nhà cửa + tán cây
KHÔNG castShadow**; props ≤ 3 m (crate, container, xe, rào) castShadow = true
như obstacle hiện tại (`level.js:509`). Mọi mesh solid đều
`userData.solid = true` (bullet occlusion, hợp đồng `level.js:6-11`). Helper
tái dùng được: `pushCrateGeo`/`pushCarGeo` (`level.js:319-344`),
`pushContainerGeo` (`level.js:361-365`) — copy pattern, không import vòng.

**safehouse** (hub — ấm nhất, ít props nhất):

| Khối | Số × kích thước (m) | Vị trí (tâm) | Merge vào |
|---|---|---|---|
| Tường compound cao 3, dày 0.4 | vòng 40×40, chừa gate đông `z −2..2` | vòng `x −95..−55, z −20..20` | boundary-walls (quyết K5) |
| Nhà chính kiên cố | 1 × 30×5×14 | (−77, −5) | nhà-1 |
| Mai che + kệ dụng cụ | 2 × 8×3×5 | (−62, 12), (−88, 12) | nhà-1 |
| Tháp canh | 1 × 3×7×3 + nóc | (−92, 16) | nhà-1 |
| Lều y tế | 1 × 6×2.5×4 | (−60, 14) — chừa (−75,15) | props-1 (vải) |
| Thùng gỗ / xe cũ | crate ×4, car ×1 | sân tây (−120, ±20) | props-2 |
| 3 máy phát (M1) | 1.5×1.2×1, emissive vàng | (−89, −15), (−61, −15), (−75, 15) | **missions.js dựng** (mục 5.1.3) |
| Đèn PointLight ấm | 1 × distance 22 | (−75, 4.5, 8) | light |

**residential** (nhà phố 2 tầng dãy thẳng + hẻm + xe bỏ hoang):

| Khối | Số × kích thước | Vị trí | Merge vào |
|---|---|---|---|
| Nhà phố 2 tầng (thân + mái tôn) | 20 × 8×6.5×10 | dãy A z=−115, B z=−85: tâm x −124,−112,−100,−88,−76,−64,−52,−40; dãy C z=−55: tâm x −124,−112,−100,−88,−64,−52,−40 (**bỏ ô x=−76** — chừa lối G1); dãy D z=−38: tâm x −124,−108,−92,−52,−36 (**bỏ ô x=−20** — chừa phố nẹp R-Q); hẻm 4 m giữa nhà liền kề | nhà-1 (thân + mái cùng material vẫn merge chung nếu muốn — mục tiêu ≤ 2 mesh) |
| Cửa sổ sáng yếu | dải emissive 1.2×0.8, ~4 cái/nhà | mặt tiền hướng phố | emissive-1 |
| Xe hơi bỏ hoang | 5 × 4.4×1.6×2.0 (`pushCarGeo`) | dọc `z=−70±3`, x −120,−96,−60,−36,−24 | props-1 |
| Dumpster hẻm | 6 × 2×1.2×1.2 | trong hẻm giữa các dãy | props-1 |
| Cột đèn đường (thân + chao) | 8 × 0.25×5 | dọc trục nhà phố mỗi 20 m | cột → props-2, bóng → emissive-1 |
| 3 gói nhu yếu phẩm (M2) | 0.6³ emissive cyan | (−120, −123), (−30, −100), (−70, −45) | **missions.js dựng** |

**commercial** (plaza + cửa hiệu + xe bus lật + biển hiệu):

| Khối | Số × kích thước | Vị trí | Merge vào |
|---|---|---|---|
| Cửa hiệu 1 tầng (mặt tiền + bạt) | 10 × 12×5×8 | hàng z=−66 (footprint z −70..−62; tâm x −6, 8, 22, 38, 54, 70) + hàng z=−122 (tâm x 6, 30, 60, 90) | nhà-1 |
| Biển hiệu neon | 10 × tấm 4×1.2 emissive (hue hồng/cyan/vàng xen kẽ) | mặt tiền hàng hiệu, cao 4 | emissive-1 (`fog:false`) |
| Xe bus lật | 1 × 11×2.8×2.5 — vẽ 2 box lệch, collider AABB 11×2.5 | (90, −80) | props-1 |
| Đài phát thanh (M3 reach) | tháp lưới 0.8×9×0.8 + đầu emissive đỏ nhấp nháy | (55, −95) giữa plaza | **missions.js dựng** (đầu emissive `fog:false`) |
| Kệ hàng / thùng ngoài trời | crate ×8 | quanh plaza | props-2 |
| Cột đèn plaza | 4 × 0.25×6 | 4 góc plaza | props-2 |
| Đèn PointLight hồng nhạt | 1 × distance 20 | (55, 5, −95) | light |

**hospital** (toà kính vỡ + xe cứu thương + lều dã chiến):

| Khối | Số × kích thước | Vị trí | Merge vào |
|---|---|---|---|
| Toà bệnh viện (khối chính + thang máy) | 1 × 40×18×28 + 1 × 8×22×8 | (100, 0) và (96, −18) | nhà-1 |
| Dải cửa kính vỡ emissive xanh nhạt | ~24 dải 1.5×2 | mặt tây + nam toà | emissive-1 |
| Lều dã chiến | 3 × 5×2.5×5 | (63, −10), (63, 10), (72, 0) | props-1 |
| Xe cứu thương (car kind + tint trắng) | 2 × 5.5×2.4×2.4 | (70, −22), (78, 18) | props-2 |
| Cột treo mountain + rào tạm | crate + block ×6 | forecourt | props-2 |
| 3 hộp thuốc (M4) | 0.5×0.4×0.5 emissive trắng-đỏ | (59, −6), (59, 6), (76, 4) — trước 3 lều | **missions.js dựng** |
| Đèn PointLight xanh bệnh viện | 1 × distance 24 | (78, 6, 0) | light |

**park** (cây low-poly + hồ + ghế đá + lửa trại):

| Khối | Số × kích thước | Vị trí | Merge vào |
|---|---|---|---|
| Hồ nước | 1 × 26×16, mặt nước plane y=−0.12 (đi lội được, KHÔNG collider) | `x 40..66, z 70..86` | water-1 (material trong, roughness thấp) |
| Cây low-poly (thân trụ + tán nón/icosahedron) | 24 × thân 0.8×3, tán r≈2.2 | scatter lưới 25 m jitter ±8, né hồ/đường/bonfire 8 m | thân → props-1, tán → canopy-1 (tán KHÔNG castShadow) |
| Ghế đá | 6 × 2×0.5×0.6 | vòng quanh hồ + đường dạo | props-2 |
| Đống lửa trại (M5) | vòng đá r 1.2 + củi 1.5×0.5×0.5 ×3, lửa emissive cam | (10, 70) | **missions.js dựng** + PointLight cam distance 18 |
| Đường dạo gravel | plane decal 3 m rộng, y=0.01 | theo bảng mục 3.3 | decal-1 (không collider) |

**docks** (container xếp chồng + cần cẩu tĩnh + tàu cá đậu):

| Khối | Số × kích thước | Vị trí | Merge vào |
|---|---|---|---|
| Container (`pushContainerGeo`, hue xen kẽ) | 14 × 6×2.6×2.4 (5 chiếc chồng lớp 2 — tầng trên chỉ visual) | bãi A: hàng z=46 và z=52, tâm x −118, −111, −104 (6 chiếc, 1 chồng); bãi B: hàng z=98 và z=110, tâm x −58, −51, −44, −37 (8 chiếc, 4 chồng) | props-1 |
| Cần cẩu tĩnh (2 chân + dầm 20 m + cabin) | chân 2×12×2 tại (−95, 55)/(−75, 55), dầm y=12 | (−85, 55) | nhà-1 (collider CHỈ 2 chân) |
| Tàu cá đậu (thân + cabin + cột) | 1 × 10×3×3.5 | (−120, 105), mạn áp bến | props-2 |
| Cầu cảng (sàn gỗ + cọc) | 2 × 14×0.3×4, y=0.8 (đi được, collider mỏng) | (−114, 96), (−114, 112) | props-2 |
| Cột buộc + rào | crate/block ×8 | dọc bờ nam | props-2 |
| 4 can xăng (M6) | 0.5×0.7×0.35 emissive đỏ | (−120, 40), (−30, 120), (−90, 90), (−45, 55) | **missions.js dựng** |
| Đèn PointLight amber cần cẩu | 1 × distance 22 | (−85, 13, 55) | light |

**quarantine + void**: giữ nguyên props legacy + vault door (mục 3.2), không
thêm gì khác. Silhouette mục 3.6.3.

#### 3.6.5 Khung 12 cổng

Dựng theo bảng mục 3.4: khung merge 1 mesh (posts có collider, lintel không —
`level.js:516-543`), rào chắn 12 mesh riêng + 12 collider tạm. Icon texture
dùng lại pattern `makeGateIconTexture` (`level.js:239-268`).

#### 3.6.6 Spawn points từng khu (nguồn WORLD.md mục 8)

Mỗi khu 4-6 điểm, nằm trên/kề đường ≤ 3 m, cách collider ≥ 1 m. Điểm phải
pass `isBlocked(p.x, p.z, 0.8)` sau build (dev-guard mục 3.6.2).

| Khu | Spawn points (x, z) |
|---|---|
| safehouse | (−125, −25) · (−125, 25) · (−42, −25) · (−42, 25) · (−115, 0) |
| residential | (−125, −125) · (−35, −125) · (−125, −70) · (−70, −72) · (−25, −40) · (−45, −40) |
| commercial | (−8, −125) · (125, −125) · (12, −57) · (60, −57) · (125, −60) · (90, −100) |
| hospital | (58, −48) · (125, −48) · (58, 24) · (125, 24) · (90, −45) · (100, 25) |
| park | (−10, 35) · (60, 35) · (125, 35) · (125, 125) · (−10, 125) · (30, 105) |
| docks | (−125, 35) · (−25, 35) · (−125, 125) · (−25, 125) · (−70, 80) · (−40, 60) |
| quarantine | 18 điểm legacy nguyên vị trí (`level.js:588-601, 85-92`) — KHÔNG khai báo lại trong city |

### 3.7 Ngân sách hiệu năng (nguồn WORLD.md mục 10)

| Nhóm | Draw call |
|---|---|
| Sàn city | 1 |
| Sàn legacy quarantine | 3 (giữ nguyên) |
| Tường ngoài ±130 | 1 |
| Tường ranh 6 khu + compound | 1 |
| Nhà cửa 5 khu | ≤ 2/khu = ≤ 10 (merge vertexColors; KHÔNG castShadow) |
| Props theo kind | ≤ 3/khu = ≤ 15 |
| Emissive lớp | ≤ 1/khu = ≤ 5 (`fog:false` cho landmark) |
| Interactables (missions dựng) | ≤ 2 |
| Silhouette cityfill | 1 |
| Khung 12 cổng | 1 |
| Rào chắn | 12 (mesh riêng — animation độc lập; viền cùng material khung) |
| Water hồ | 1 |
| **TỔNG STATIC** | **≈ 50-55** (hiện trạng arena ~20 — tăng ~35 chấp nhận được) |
| Zombie đồng thời | ≤ 60 × ~9 mesh ≈ 540 — cap 60 chặn trần (mục 4.2) |
| Viewmodel + particles + pickups | ~15-25 |

- **Fog**: `FOG_DENSITY 0.022 → 0.026` (`atmosphere.js:27`) — độ mờ ~91% tại
  60 m, ~96% tại 70 m → nhà xa mờ hẳn trước khi tới hạn vẽ. Giữ `camera.far =
  500` (`engine.js:49-54` — sao trời cần, `atmosphere.js:103-134` fog:false sẵn).
- **Landmark emissive `fog:false`**: đầu tháp radio, đống lửa, can xăng, hộp
  thuốc, gói nhu yếu phẩm, viền rào chắn cổng (pattern bulb arena
  `atmosphere.js:82`).
- **Shadow**: moon là nguồn bóng DUY NHẤT (2048², `atmosphere.js:35-48`);
  frustum 84×84 hiện cố định quanh arena → **chuyển theo player**: mỗi frame
  `moon.position = player + (40, 70, −25)` (làm tròn 2 m để shadow không rung)
  và `moon.target = player`. Không đổi mapSize/bias. castShadow = true CHỈ:
  zombie + boss (`zombie.js:116`), props ≤ 3 m (`level.js:509`), rào chắn,
  vault door. castShadow = false BẮT BUỘC: nhà cửa, tường ranh + tường ngoài,
  thân + tán cây, silhouette, mặt nước. Tất cả vẫn receiveShadow = true.
- **PointLights trần 10**: 5 đèn arena legacy (`atmosphere.js:59-65`) + 5 đèn
  mới (bảng props: safehouse, commercial, hospital, park bonfire, docks).
  Đèn đường residential/plaza chỉ là mesh emissive.

---

## 4. TÍNH NĂNG B — QUOTA + waves.js MỞ RỘNG

### 4.0 SPEC B (nguyên văn yêu cầu)

> - quotaNeed mỗi khu: residential 20, commercial 25, hospital 30, park 25,
>   docks 30 (safehouse/quarantine không quota — quarantine đi bằng nhiệm vụ).
> - Chỉ đếm zombie hạ TRONG khu đang nói tới (zombie-killed event +
>   districtAt của vị trí chết). HUD hiện "🧟 12/20" cạnh Wave khi đang ở khu
>   có quota.
> - Khi quota khu đạt: phát "quota-done" {districtId}; spawn density trong khu
>   +50% (áp lực cuối); cổng ra mở khi quota-done VÀ nhiệm vụ khu đó hoàn thành
>   (missions quyết định, phát "gate-open" {from,to}).
> - waves.js MỞ RỘNG: spawn theo KHU người chơi đang đứng (dùng spawnPoints
>   của khu đó qua city), giữ nguyên boss-wave mỗi 5 wave + intermission + mọi
>   hành vi cũ; KHÔNG phá boss wave của bản mở rộng.

### 4.1 Bảng quota + density (nguồn WORLD.md mục 9)

| Khu | quotaNeed | density khi chơi |
|---|---|---|
| safehouse | — (hub) | ×0.5 (mỗi spawn lẻ hoán sang khu kề đã mở) |
| residential | 20 | ×1.0 |
| commercial | 25 | ×1.0 |
| hospital | 30 | ×1.0 |
| park | 25 | ×1.0 |
| docks | 30 | ×1.0 |
| quarantine | — (đi bằng nhiệm vụ) | ×1.5 trong M7-M8 (horde dồn dập), về ×1.0 sau M9 |

### 4.2 waves.js MỞ RỘNG (Builder SYSTEMS)

1. **Cap đồng thời 60**: `spawnOne` (`waves.js:264-286`) đếm zombie alive
   trước khi sinh (trong `tracked` — wave zombies + summoned); đủ 60 → giữ
   nguyên queue, thử frame sau (KHÔNG drop zombie — wave accounting vẫn đúng
   vì `tracked` chỉ nhận khi spawn thành công). Hằng mới
   `MAX_CONCURRENT = 60`. (True pooling/InstancedMesh là WF-3 — KHÔNG làm.)
2. **Spawn theo khu**: pool = `city.districts` → district của player qua
   `city.districtAt(playerPos.x, playerPos.z)` → `district.spawnPoints`;
   quy tắc chọn giữ nguyên `waves.js:241-262` (≥ 15 m, jitter ±0.7, không có
   điểm hợp lệ → điểm XA NHẤT). Nếu khu player có < 2 điểm đạt ≥ 15 m → mở
   rộng pool sang **khu kề đã mở** (adjacency từ `districts[].gates` +
   `gateBetween(...).open`) trước khi buộc dùng điểm xa nhất. Fallback: `city`
   không truyền / `districtAt` = null → pool legacy `level.spawnPoints`
   (hành vi hiện tại, byte-identical).
3. **Density multipliers** (áp vào spawn gap sau khi tính gap hiện có):
   - quota-done khu D rồi + player đứng trong D → gap × ⅔ (≈ +50% density,
     gap 0.8-1.5 s → 0.55-1.0 s). Nghe `"quota-done"` {districtId}.
   - safehouse: mỗi spawn LẺ hoán sang khu kề ĐÃ MỞ (chọn trong pool kề).
   - M7-M8 đang active + player trong quarantine → gap × ⅔ (×1.5 density).
     Nghe `"mission-start"`/`"mission-complete"` {index} để biết M7/M8
     (index 7, 8 — đánh số 1-based, mục 5.1.1).
   - Các multiplier KHÔNG cộng dồn: lấy multiplier ĐƠN cao nhất áp dụng.
4. **Giữ nguyên 100%**: composition `5 + 3n`, boss wave mỗi 5 + burst 6 s +
   `spawnBoss` theo `zones.bossAnchorFor`, intermission 10 s, wave-clear khi
   boss + mọi minion chết, các event phát ra, `reset()`.
5. Chữ ký: `createWaves(scene, level, bus, zones, city)` — `city` tuỳ chọn
   (undefined → hành vi cũ).

### 4.3 quota-done ↔ cổng

`quota-done {districtId}` chỉ là ĐIỀU KIỆN CẦN; cổng ra mở khi missions phát
`gate-open` (quota xong **VÀ** mục tiêu phụ collect/activate xong — bảng
mục 5.1.2). Missions là nơi duy nhất bắn `gate-open`; main.js nghe và gọi
`city.setGateOpen` (mục 5.6.2).

---

## 5. TÍNH NĂNG C — CỐT TRUYỆN 9 NHIỆM VỤ

### 5.0 SPEC C (nguyên văn yêu cầu, rút gọn đúng chữ)

> - `src/systems/missions.js` (MỚI): `createMissions(bus, city, economy)` →
>   `{ current, objectives, update(dt, player), reset() }`. State machine:
>   locked → active → done; mỗi nhiệm vụ 1-3 mục tiêu: `{type:"activate",
>   target:...}` | `{type:"collect", item, need}` | `{type:"quota",
>   district}` | `{type:"reach", district, x, z}` | `{type:"boss"}` |
>   `{type:"survive", seconds}`. Nghe "zombie-killed" (quota + boss),
>   "interact" (activate), "pickup-story" (collect). Phát "mission-start"
>   {index, titleKey, objectives}, "objective-progress" {mission, objective,
>   done, need}, "mission-complete" {index, reward}, "gate-open" {from, to}.
> - Hệ thống tương tác: phím E gần điểm tương tác (mesh nhỏ phát sáng nhẹ do
>   missions tự tạo): bấm E trong 2 m → bus "interact" {target}; HUD nhắc
>   "E — TƯƠNG TÁC" khi đứng gần.
> - Chuỗi nhiệm vụ: (1) Safehouse "Sáng Đèn" — bật 3 máy phát → residential;
>   (2) Residential "Đường Phố" — quota 20 + 3 gói nhu yếu phẩm → commercial;
>   (3) Commercial "Tiếng Radio" — quota 25 + reach đài → hospital;
>   (4) Hospital "Thuốc Cho Bệnh Nhân" — quota 30 + 3 hộp thuốc → park;
>   (5) Park "Lửa Trại Cầu Cứu" — quota 25 + activate đống lửa → docks;
>   (6) Docks "Nhiên Liệu" — quota 30 + 4 can xăng → quarantine;
>   (7) Quarantine "Vào Tâm Dịch" — survive 60 s horde dồn dập;
>   (8) Quarantine "Vệ Binh Cách Ly" — hạ 1 boss (cơ chế spawnBoss hiện có);
>   (9) Quarantine "Cánh Cửa Cuối" — reach cửa thép trung tâm → màn
>   "HẾT PHẦN 1 — ..." + chơi tự do (WF-3 thay bằng boss cuối + ending).
> - `src/ui/dialogue.js` (MỚI): `createDialogue(container, bus, i18n)` →
>   `{show(lines, onDone), hide(), showIntro(slides, onDone), showOutro(text,
>   onDone)}`. Hộp thoại dưới màn hình: chân dung đơn giản (khung màu), tên
>   người nói, chữ hiện TỪNG KÝ TỪ (~30 ký tự/s, click/E skip); intro slides
>   New Game 3-4 slide chữ đen trắng mờ dần; outro cho nhiệm vụ 9.
> - hud.js MỞ RỘNG: tracker nhiệm vụ góc phải trên; bộ đếm quota "🧟 12/20"
>   cạnh Wave; nhắc "E — TƯƠNG TÁC"; toast "CỔNG MỞ — {tên khu}" khi
>   gate-open; nghe các event mission/quota trên bus.
> - menus.js MỞ RỘNG: nút PLAY khởi động cốt truyện (intro slides → nhiệm vụ
>   1); thêm nút "CHƠI TỰ DO" (không intro, nhiệm vụ 1 active luôn).
> - input.js MỞ RỘNG: phím E phát "interact-press" trên bus.
> - gamestate.js + main.js (integrator): state "intro" (slides chạy, thế giới
>   render mờ phía sau) → playing; nghe mission/gate events mở khoá cổng qua
>   city.setGateOpen; debug API BỔ SUNG: startStory(), skipToMission(n),
>   completeObjective(), fillQuota(), teleportDistrict(id), getState() +=
>   { story: {mission, titleKey, quotaDone, quotaNeed, objectives},
>   currentDistrict, unlockedDistricts }.

### 5.1 missions.js (MỚI) — Builder SYSTEMS

Stub: `src/systems/missions.js` (đang `throw new Error("TODO")`).

#### 5.1.1 API + state machine

```js
createMissions(bus, city, economy) => {
  current: number,          // index nhiệm vụ hiện tại, 1..9; 0 = chưa start;
                            // 10 = hoàn thành cả chuỗi (free-roam)
  objectives: [ {type, target?, item?, need?, district?, seconds?,
                 done, need, complete} ],  // view live của nhiệm vụ hiện tại
  update(dt, playerPos) => void,  // main gọi mỗi frame while playing
  reset() => void,                // về m1 locked; KHÔNG tự bắn mission-start
}
```

- State từng nhiệm vụ: `locked → active → done`. Nhiệm vụ `active` duy nhất
  một cái tại mỗi thời điểm; hoàn thành → auto-activate nhiệm vụ kế (trừ sau
  M9 → `current = 10`, free-roam).
- **Index là 1-based** (m1 = 1 … m9 = 9) — dùng nhất quán trong mọi event
  payload + debug API.
- Mỗi objective mang `done` (số hiện tại) + `need` (mục tiêu) + `complete`.
- `economy` được truyền theo chữ ký hợp đồng nhưng **missions KHÔNG tự cộng
  tiền** — thưởng do main.js gọi `economy.add(reward)` (STORY.md §6 quyết).
- Thưởng + mở cổng từng nhiệm vụ (nguồn STORY.md §3/§5 + quyết K2):

| index | id | titleKey | Khu | Objectives | Thưởng | gate-open bắn khi done |
|---|---|---|---|---|---|---|
| 1 | m1 | `mission1_title` | safehouse | activate ×3: `generator-1/2/3` | 300 | `{safehouse, residential}` (G1) |
| 2 | m2 | `mission2_title` | residential | quota `residential` 20 + collect `supply` ×3 | 325 | `{residential, commercial}` (G2) |
| 3 | m3 | `mission3_title` | commercial | quota `commercial` 25 + reach `radio-tower` (r 3 m) | 350 | `{commercial, hospital}` (G3) |
| 4 | m4 | `mission4_title` | hospital | quota `hospital` 30 + collect `medicine` ×3 | 400 | `{hospital, park}` (G4) |
| 5 | m5 | `mission5_title` | park | quota `park` 25 + activate `campfire` | 425 | `{park, docks}` (G5) |
| 6 | m6 | `mission6_title` | docks | quota `docks` 30 + collect `fuel` ×4 | 450 | `{docks, quarantine}` (D-Q) **VÀ** `{docks, safehouse}` (G6 — quyết K2) |
| 7 | m7 | `mission7_title` | quarantine | survive 60 s | 500 | — |
| 8 | m8 | `mission8_title` | quarantine | boss (hạ 1 boss, mọi loại) | 550 | — |
| 9 | m9 | `mission9_title` | quarantine | reach `final-door` (r 2.5 m) | 600 | 5 cổng thép còn lại: `{safehouse,quarantine}`, `{residential,quarantine}`, `{commercial,quarantine}`, `{hospital,quarantine}`, `{park,quarantine}` |

- Sau `mission-complete` của M9: main.js chạy outro (mục 5.6.2) rồi game tiếp
  tục (free-roam, `current = 10`).

#### 5.1.2 Hành vi từng loại objective

- **`quota`**: nghe `"zombie-killed"` {type, headshot, position} → chỉ đếm khi
  `type ∈ {walker, runner, brute}` (quyết K4) VÀ `city.districtAt(position.x,
  position.z) === district`. Đạt `need` → objective complete; nếu là quota
  của khu hiện tại → bắn `"quota-done"` {districtId} (một lần duy nhất/khu).
- **`collect`**: nghe `"pickup-story"` {item, target} → `done += 1` khi
  `item` khớp. (Ai bắn `pickup-story`? Chính missions — mục 5.1.4.)
- **`activate`**: nghe `"interact"` {target} → đánh dấu target đó done (mỗi
  target đếm 1 lần). `need` = số target (m1: 3).
- **`reach`**: check trong `update(dt, playerPos)`: khoảng cách XZ từ player
  đến điểm ≤ bán kính (radio-tower 3 m, final-door 2.5 m — mục 5.1.3).
- **`boss`**: nghe `"zombie-killed"` {type} → complete khi
  `type ∈ {butcher, spitter, screamer, golem}` (đúng 1 lần).
- **`survive`**: đếm 60 s trong `update` — CHỈ khi player đang trong
  quarantine (`city.districtAt(playerPos) === "quarantine"`); rời khu thì
  tạm dừng (không reset). Đạt 60 → complete.
- Missions hoàn thành khi TẤT CẢ objectives complete → bắn
  `"mission-complete"` {index, reward} → activate nhiệm vụ kế + bắn
  `"mission-start"` {index, titleKey, objectives} (objectives = mảng descriptor
  rảnh cùng tiến độ 0) + bắn các `"gate-open"` của nhiệm vụ đó.

#### 5.1.3 Hệ thống tương tác + POI (nguồn WORLD.md mục 11)

- missions.js TỰ TẠO mesh interact (nhỏ, emissive nhẹ, đèn nhỏ `fog:false`;
  castShadow = true vì ≤ 3 m): 3 máy phát, 3 gói supply, tháp radio (9 m —
  castShadow chỉ thân nếu muốn, đầu nhấp nháy đỏ), 3 hộp thuốc, đống lửa
  (+ PointLight cam distance 18 — trong trần 10 PointLights mục 3.7), 4 can
  xăng. Material emissive merge theo loại → ≤ 2 draw call (mục 3.7).
  Collider: máy phát / tháp radio (chân) / đống lửa push 1 AABB nhỏ vào
  `level.colliders`; đồ collect (supply/medicine/fuel) KHÔNG collider.
  Dispose toàn bộ trong `reset()`.
- Bảng POI (target id — quyết K1; i18n hiển thị ở mục 7):

| Nhiệm vụ | Target id | Khu | Toạ độ (x, z) | Loại |
|---|---|---|---|---|
| M1 | `generator-1` | safehouse | (−89, −15) | activate |
| M1 | `generator-2` | safehouse | (−61, −15) | activate |
| M1 | `generator-3` | safehouse | (−75, 15) | activate |
| M2 | `supply-1` | residential | (−120, −123) | collect (`supply`) |
| M2 | `supply-2` | residential | (−30, −100) | collect |
| M2 | `supply-3` | residential | (−70, −45) | collect |
| M3 | `radio-tower` | commercial | (55, −95) | reach (r 3 m) |
| M4 | `medicine-1` | hospital | (59, −6) | collect (`medicine`) |
| M4 | `medicine-2` | hospital | (59, 6) | collect |
| M4 | `medicine-3` | hospital | (76, 4) | collect |
| M5 | `campfire` | park | (10, 70) | activate |
| M6 | `fuel-1` | docks | (−120, 40) | collect (`fuel`) |
| M6 | `fuel-2` | docks | (−30, 120) | collect |
| M6 | `fuel-3` | docks | (−90, 90) | collect |
| M6 | `fuel-4` | docks | (−45, 55) | collect |
| M9 | `final-door` | quarantine | (0, 0) | reach (r 2.5 m) — mesh vault door do level.js dựng (mục 3.2), missions chỉ tham chiếu toạ độ |

- **E-press flow**: input bắn `"interact-press"` (mục 5.2) → missions tìm
  POI active gần nhất: trong **2 m** → bắn `"interact"` {target}; với POI
  `collect`: đồng thời bắn `"pickup-story"` {item, target}, ẩn mesh (collected).
  Với POI `activate`: mesh giữ nguyên (máy phát bật — đổi emissive sang vàng
  sáng hơn; đống lửa bắt đầu cháy sáng).
- **Hint 3 m**: player vào/ra bán kính **3 m** quanh POI active → bắn
  `"interact-near"` {target, near: true|false} (bắn khi TRẠNG THÁI ĐỔI, không
  spam mỗi frame). HUD nghe để hiện/ẩn "E — TƯƠNG TÁC" (mục 5.4).

#### 5.1.4 Event bus của missions (tổng hợp ở mục 6)

Bắn: `mission-start`, `objective-progress` (mỗi thay đổi tiến độ),
`mission-complete`, `gate-open`, `quota-done`, `pickup-story`, `interact`,
`interact-near`, `mission-reset` (từ `reset()` — HUD xoá tracker).
Nghe: `zombie-killed`, `interact-press`, (`interact` do chính nó bắn rồi tự
nghe — nếu thấy gọn thì xử lý trực tiếp không qua bus, miễn giữ đúng payload
`"interact"` {target} cho hợp đồng).

#### 5.1.5 Dữ liệu thoại cho integrator

missions.js export thêm const **`STORY_DIALOGUE`**: map `m1..m9` →
`{start: [{speaker: "radio"|"you"|"unknown", key: "m1_radio_line1"}, ...],
done: [...]}` — trật tự + bộ key ĐÚNG theo STORY.md §3 (danh sách đủ ở mục
7.4); main.js map qua `t(speaker_radio)` + `t(key)` khi gọi
`dialogue.show(lines)`.

### 5.2 input.js MỞ RỘNG (Builder SYSTEMS)

- Phím **KeyE** (keydown, `e.repeat` bỏ qua như các phím khác
  `input.js:134`): bắn `"interact-press"` trên shared bus. KHÔNG điều kiện
  state (dialogue + missions tự quyết có nghe hay không) — nhưng KHÔNG bắn
  khi shop overlay đang mở (cùng rule KeyB `input.js:157-164`: E giữ nguyên
  hành vi vô hại trong shop).
- KHÔNG thêm gì khác. Chữ ký createInput không đổi.

### 5.3 dialogue.js (MỚI) — Builder UI

Stub: `src/ui/dialogue.js` (đang `throw new Error("TODO")`).

```js
createDialogue(container, bus, i18n) => {
  show(lines, onDone),        // lines: [{speakerKey, textKey} | {name, text}]
  hide(),                     // gỡ hộp thoại ngay (không onDone)
  showIntro(slides, onDone),  // slides: [string | {key}] — 4 slide intro
  showOutro(text, onDone),    // text: string | string[] — 3 dòng outro
}
```

- **Hộp thoại** dính đáy màn hình (bottom, dưới đường của shop-hint): khung
  chân dung đơn giản (ô vuông màu theo người nói — RADIO xanh thép, YOU xám,
  UNKNOWN đỏ rè), tên người nói (`i18n.t("speaker_*")`), chữ hiện TỪNG KÝ TỪ
  ~30 ký tự/s. Self-style inline (style.css ngoài danh sách file được đụng —
  pattern `hud.js:240-245`). `#ui` có `pointer-events: none` — hộp thoại
  KHÔNG tương tác chuột trực tiếp (skip qua click trên canvas / phím E, xem
  dưới) nên KHÔNG bật pointer-events.
- **Skip**: click chuột (nghe `"consumeClick"`? KHÔNG — input chỉ tổng hợp
  click khi pointer-locked) — dialogue nghe **bus `"interact-press"`** (E,
  hoạt động cả khi pointer locked lẫn không) **và** click trên chính node
  dialogue (dùng được ở intro/outro khi chuột tự do). Skip = hiện ngay đủ
  dòng hiện tại; lần skip kế = dòng kế; hết dòng → hide + `onDone()`.
- **showIntro(slides, onDone)**: chữ trắng nền đen, mờ dần (fade), hiện
  TỪNG SLIDE; skip = slide kế; hết slides → onDone. Chạy khi gamestate
  "intro" (mục 5.6.1) — thế giới render mờ phía sau (slide nền đen opacity
  ~0.85 là đủ, không cần can thiệp renderer).
- **showOutro(text, onDone)**: toàn màn trắng-đen mờ dần, lần lượt từng dòng;
  dòng giữa (`story_outro_line2`) render dạng BANNER (chữ hoa cỡ lớn —
  STORY.md §4); dòng cuối KHÔNG bỏ qua được; xong → onDone.
- Nhãn giọng nói + intro + outro keys do dialogue.js tự
  `i18n.registerBundle` (mục 7); dialogue KHÔNG tự đọc STORY — main.js truyền
  lines đã map i18n.

### 5.4 hud.js MỞ RỘNG (Builder UI)

Additive, giữ mọi widget + event cũ:

1. **Tracker nhiệm vụ — góc phải trên, DƯỚI kill feed** (kill feed đang chiếm
   `top: 18px; right: 18px` — `style.css:196-200`; tracker đặt `top ≈ 120px,
   right: 18px`): tên nhiệm vụ (`mission_progress` "MISSION {n}/9" +
   `mission{n}_title`) + từng objective một dòng (`obj_*` template, tiến độ
   "2/3", tick ✕→✓ khi complete). Nghe `mission-start` (vẽ lại),
   `objective-progress` (cập nhật dòng), `mission-complete` (flash +
   chuẩn bị nhiệm vụ kế), `mission-reset` (xoá). Ẩn khi `current = 0`.
2. **Bộ đếm quota "🧟 12/20" — cạnh Wave**: chip mới trong hàng `.topinfo`
   (cùng class `.chip`), đặt TRƯỚC chip Wave (thứ tự: quota · wave · score).
   Giá trị từ `objective-progress` của objective `quota` (cache {done, need,
   district}); HIỆN chỉ khi `extras.district === district` của quota active —
   main truyền qua extras mới (dưới). `quota-done` → dùng text
   `quota_done_toast` "DISTRICT CLEARED" trong toast (mục 3 dưới).
3. **Nhắc "E — TƯƠNG TÁC"**: nghe `"interact-near"` {target, near} → hiện/ẩn
   chip cạnh crosshair-dưới (pattern shop-hint `hud.js:442-480`), text
   `interact_hint`; kèm tên target (`target_*` / `item_*`).
4. **Toast "CỔNG MỞ — {tên khu}"**: nghe `"gate-open"` {from, to} →
   `showToast(tr("gate_open_toast", {district: tr("district_" + to)}))` —
   dùng lại toast node hiện có (`hud.js:414-449`, auto-hide 3 s).
5. **extras mở rộng**: `hud.update(player, weapons, gamestate, extras)` —
   extras thêm field `district: string|null` (main tính
   `city.districtAt(player.position)` mỗi frame — zero-alloc pattern
   `hud.js:380-395`). Không field → tracker/quota giữ nguyên trạng thái event.
6. `show(false)` + `state-changed` gameover/menu: xoá tracker + quota + hint E
   (run-scoped, như boss bar `hud.js:748-756`).

### 5.5 menus.js MỞ RỘNG (Builder UI)

1. Nút **PLAY** hiện có (`menus.js:136`) GIỮ event `"ui-play"` — nghĩa MỚI:
   khởi động cốt truyện (intro slides → nhiệm vụ 1). main.js quyết định.
2. Thêm nút **"CHƠI TỰ DO"** ngay dưới PLAY: bắn event MỚI `"ui-play-free"`.
   Label i18n: key `freePlay` ("Free Roam" / "CHƠI TỰ DO") đăng ký trong
   MENU_BUNDLE của menus.js.
3. Gameover "PLAY AGAIN" giữ `"ui-play"` — hành vi restart-story (mục 5.6.3).

### 5.6 gamestate.js + main.js — Integrator

#### 5.6.1 gamestate.js: state "intro"

- Thêm tên state `"intro"` vào `GameStateName`. Luồng:
  - `startStory()`: fresh-run counters (như `freshRun()` `gamestate.js:232-239`)
    → state `"intro"`, emit `"state-changed"`.
  - `beginPlay()`: chỉ từ `"intro"` → state `"playing"`, emit. (wave 1 của
    waves tự start ở update() đầu tiên — `waves.js:297-300` — không cần gì thêm).
  - `start()` giữ nguyên (→ "playing" trực tiếp — dùng cho luồng free).
- `applyScreenState`/main loop: "intro" xử lý như "menu" về cập nhật thế giới
  (atmosphere + render ONLY — `main.js:426-428`), menus.show(null),
  hud.show(false). input.js đã tự mở khoá con trỏ cho state ≠ "playing"
  (`input.js:224-229`) — intro được cursor để click slide.
- **Giữ nguyên** pause-by-reason, "player-died", score logic.

#### 5.6.2 main.js: wiring mới (additive)

1. **Tạo module** (giữ bootstrap order cũ, chèn đúng chỗ):
   `city = createCity(scene, level)` NGAY SAU `createZones` (trước atmosphere
   — fog cần city silhouette? Không — thứ tự chỉ cần trước waves/player);
   `missions = createMissions(bus, city, economy)` sau economy/shop, trước
   waves; `dialogue = createDialogue(uiRoot, bus, i18n)` sau menus;
   `createWaves(scene, level, bus, zones, city)` (tham số 5 mới).
2. **Player spawn story**: sau `player.reset()` trong `freshRun()` →
   `player.position.set(−75, 0, 8)`, yaw hướng đông (cổng compound) —
   WORLD.md mục 11: "hướng nhìn về đông". Áp cho CẢ story lẫn free-play
   (M1 cần máy phát); (0, 0) chỉ còn cho luồng debug.
3. **Bus mới wiring**:
   - `"ui-play"` → `freshRun(); gamestate.startStory(); input.lockPointer();`
     rồi (state-changed "intro") → `dialogue.showIntro([t("intro_s1")…
     t("intro_s4")], () => gamestate.beginPlay())`.
   - `"ui-play-free"` → `freshRun(); gamestate.start(); missions.begin();`
     (activate m1 + bắn mission-start) `; input.lockPointer();`
   - `"mission-start"` → `dialogue.show(mapStartLines(e.detail.index))` —
     lines từ `STORY_DIALOGUE` (mục 5.1.5); index 1 KHÔNG show khi vừa
     ui-play-free? KHÔNG — free play vẫn hiện thoại m1 (nhiệm vụ 1 active
     "cho ai muốn nhảy nhanh" — chỉ bỏ intro slides).
   - `"mission-complete"` → `dialogue.show(mapDoneLines(index))` (M9: bỏ —
     đi thẳng outro) + `economy.add(e.detail.reward)` + toast HUD tự hiện
     theo event. Sau M9 complete → `dialogue.showOutro([t("story_outro_line1"),
     t("story_outro_line2"), t("story_outro_line3")], () => { /* free-roam */ })`.
   - `"gate-open"` {from, to} → `city.setGateOpen(from, to, true)`.
   - `"mission-reset"` → không wire gì ở main (HUD tự nghe, mục 5.4.1).
   - M8 activation (`"mission-start"` {index: 8}) → spawn 1 boss qua cơ chế
     debug hiện có (`main.js:635-680` pattern — `new Ctor(scene, wave, pos,
     bus)` tại `zones.bossAnchorFor(wave)` + 2 event announce) — đúng "dùng
     cơ chế spawnBoss hiện có".
   - M6 complete (index 6) → `zones.unlockForWave(Number.MAX_SAFE_INTEGER)`
     (mở north/east — nội thất quarantine, quyết WORLD.md §12.1).
4. **Main loop while playing**: thêm `missions.update(dt, player.position)`
   (sau waves.update); hud.update extras thêm `district:
   city.districtAt(player.position.x, player.position.z)`.
5. **freshRun() thêm**: `missions.reset()` (story restart: XEM 5.6.3 —
   KHÔNG reset khi giữ tiến trình).
6. **world updates trong state "intro"**: như "menu" (chỉ atmosphere).

#### 5.6.3 Chết + restart trong story (WORLD.md §12.5 — ĐÃ QUYẾT)

- `player-died` → gameover như cũ.
- Restart từ gameover khi story đã tới **nhiệm vụ ≥ 2**: spawn lại tại
  safehouse (−75, 8) **và GIỮ tiến trình nhiệm vụ/quota của run trước**
  (missions.reset() KHÔNG gọi). Để balance nhất quán (STORY §6 tính luỹ tiến)
  money cũng GIỮ (bỏ `economy.reset()` khỏi nhánh này — economy tự reset khi
  nghe "ui-play" (`economy.js:121-123`): integrator phải chặn đường đó —
  đơn giản nhất: economy giữ nguyên, chấp nhận double-reset vô hại, và
  **re-add** số tiền? KHÔNG — cách sạch: economy thêm cờ `hold` qua event
  `"story-keep"` — integrator quyết, điều khoản BẮT BUỘC là: tiền + nhiệm vụ
  cùng giữ hoặc cùng reset (KHÔNG tách lẻ).
- Restart khi đang nhiệm vụ 1 (chưa hoàn thành gì) hoặc từ CHƠI TỰ DO:
  reset sạch như cũ (missions.reset + economy.reset).

#### 5.6.4 zones.js story-guard (Builder SYSTEMS)

- zones.js nghe `"story-mode"` {active} trên bus (main bắn `active: true` ngay
  sau missions khởi động luồng story bất kỳ; `active: false` trước
  `missions.reset()` của fresh story). Khi active: listener `"wave-clear"`
  KHÔNG gọi `unlockForWave` (tự mở north/east sau wave 2/4 là SAI trong story
  — north/east là nội thất quarantine, khoá đến M6 — WORLD.md §12.1);
  `bossAnchorFor` + `reset()` giữ nguyên. Toast `"zone-unlocked"` chỉ còn cho
  luồng không-story (debug).
- Fresh story: main bắn `"story-mode" {active:false}` → `zones.reset()`
  (re-lock) → missions.reset() → bắn `{active:true}`. Đúng thứ tự.

#### 5.6.5 Debug API BỔ SUNG (main.js)

| Method | Hành vi |
|---|---|
| `startStory()` | freshRun + startStory + intro slides (giống bấm PLAY) |
| `skipToMission(n)` | đánh m1..m(n−1) done (missions nội bộ; bắn gate-open tương ứng để thế giới mở — toast chấp nhận trong debug), activate mn + bắn `mission-start` |
| `completeObjective()` | force-complete objective đầu tiên chưa xong của nhiệm vụ hiện tại (quota → done=need + events; activate/reach/boss/survive → complete ngay) |
| `fillQuota()` | quota objective hiện tại done=need + bắn objective-progress (+quota-done nếu đạt) |
| `teleportDistrict(id)` | BFS qua đồ thị cổng từ district hiện tại → mở TỪNG cổng trên đường đi ngắn nhất (`city.setGateOpen`) rồi `player.position.set(center)` (cơ chế mở-trước-khi-teleport như `main.js:696-726`) |
| `getState()` | += `story: {mission, titleKey, quotaDone, quotaNeed, objectives}` + `currentDistrict` + `unlockedDistricts` (district reachable từ safehouse qua cổng ĐANG MỞ — BFS) |

### 5.7 atmosphere.js MỞ RỘNG (Builder WORLD)

- `FOG_DENSITY = 0.026` (từ 0.022 — `atmosphere.js:27`).
- Moon shadow frustum theo player (mục 3.7): `createAtmosphere` nhận thêm
  tham số tuỳ chọn `playerRef` (hoặc main set mỗi frame qua hàm trả về —
  builder chọn, miễn main-loop gọi được và zero-alloc).

---

## 6. Bảng event bus MỚI (tổng hợp)

| Event | Payload | Bắn bởi | Nghe bởi |
|---|---|---|---|
| `interact-press` | {} | input (KeyE) | missions, dialogue |
| `interact` | {target} | missions (E trong 2 m) | missions nội bộ |
| `interact-near` | {target, near} | missions (vào/ra 3 m) | hud |
| `pickup-story` | {item, target} | missions (collect) | missions nội bộ (quota/collect) |
| `mission-start` | {index, titleKey, objectives} | missions | main (dialogue + M8 boss spawn), hud (tracker), waves (M7-M8 density) |
| `objective-progress` | {mission, objective, done, need} | missions | hud (tracker + quota) |
| `mission-complete` | {index, reward} | missions | main (dialogue, economy.add, outro sau M9, zones.unlockForWave sau M6), hud |
| `mission-reset` | {} | missions.reset() | hud |
| `quota-done` | {districtId} | missions | waves (density), hud (toast "DISTRICT CLEARED") |
| `gate-open` | {from, to} | missions | main (city.setGateOpen), hud (toast "CỔNG MỞ — {district}") |
| `story-mode` | {active} | main | zones (story-guard) |
| `ui-play-free` | {} | menus (CHƠI TỰ DO) | main |

Event cũ KHÔNG đổi payload: `zombie-killed` {type, score, headshot, position:
Vector3} (`zombie.js:495-504`), `wave-start/clear`, `money-changed`,
`boss-spawned`, `zone-unlocked`, `state-changed`...

---

## 7. Key i18n (nguồn STORY.md) + phân bổ đăng ký

Quy ước (STORY.md §0/§7): **key phẳng** (không dot-path — `i18n.t` ưu tiên
`hasOwnProperty`, `i18n.js:153-170`); mỗi key CÓ CẢ EN + VI; placeholder
`{name}` (cú pháp `i18n.t`, `i18n.js:197-207`). Module tự đăng ký nhóm của
mình qua `i18n.registerBundle` (pattern `zones.js:81-88`, `menus.js:58-71`,
`hud.js:171-228`).

**Phân bổ**: `city.js` → `district_*` · `missions.js` → `mission{n}_title`,
`obj_*`, `item_*`, `target_*`, `mission_progress`, `mission_complete_toast`,
`quota_counter`, `quota_done_toast`, `gate_open_toast`, `interact_hint` ·
`dialogue.js` → `speaker_*`, `intro_s1..4`, `story_outro_line1..3` ·
`menus.js` → `freePlay`.

### 7.1 Nhãn giọng nói (dialogue.js)

| Key | EN | VI |
|---|---|---|
| `speaker_radio` | RADIO | GIỌNG RADIO |
| `speaker_you` | YOU | BẠN |
| `speaker_unknown` | UNKNOWN | KHÔNG RÕ |

### 7.2 Tên khu (city.js) — toast "CỔNG MỞ — {district}", HUD, objective

| Key | EN | VI |
|---|---|---|
| `district_safehouse` | Safehouse | An Toàn Nhà |
| `district_residential` | Residential | Khu Dân Cư |
| `district_commercial` | Commercial | Phố Thương Mại |
| `district_hospital` | Hospital | Bệnh Viện |
| `district_park` | Park | Công Viên |
| `district_docks` | Docks | Bến Cảng |
| `district_quarantine` | Quarantine Zone | Vùng Cách Ly |

### 7.3 Vật phẩm & điểm tương tác (missions.js)

| Key | EN | VI |
|---|---|---|
| `item_supply` | Supply Pack | Gói Tiếp Tế |
| `item_medicine` | Medicine Box | Hộp Thuốc |
| `item_fuel` | Fuel Can | Can Xăng |
| `target_generator` | Generator | Máy Phát Điện |
| `target_antenna` | Broadcast Antenna | Đài Phát Sáng |
| `target_campfire` | Campfire | Đống Lửa Trại |
| `target_steel_door` | Central Steel Door | Cửa Thép Trung Tâm |

Ánh xạ target id ↔ key hiển thị (quyết K1): `generator-*`→`target_generator`,
`radio-tower`→`target_antenna`, `campfire`→`target_campfire`,
`final-door`→`target_steel_door`; `supply-*`→`item_supply`,
`medicine-*`→`item_medicine`, `fuel-*`→`item_fuel`.

### 7.4 Template mục tiêu (HUD tracker — missions.js)

| Key | EN | VI |
|---|---|---|
| `obj_quota` | Kill zombies in {district}: {n}/{need} | Hạ zombie trong {district}: {n}/{need} |
| `obj_collect` | Collect {item}: {n}/{need} | Thu {item}: {n}/{need} |
| `obj_activate` | Activate: {target} | Kích hoạt: {target} |
| `obj_reach` | Reach the marker | Tới điểm đánh dấu |
| `obj_boss` | Kill the boss | Hạ boss |
| `obj_survive` | Survive: {n}/{need} s | Trụ lại: {n}/{need} s |

### 7.5 HUD / toast / hệ thống (missions.js)

| Key | EN | VI |
|---|---|---|
| `mission_progress` | MISSION {n}/9 | NHIỆM VỤ {n}/9 |
| `mission_complete_toast` | MISSION COMPLETE +{money}$ | NHIỆM VỤ HOÀN THÀNH +{money}$ |
| `quota_counter` | 🧟 {n}/{need} | 🧟 {n}/{need} |
| `quota_done_toast` | DISTRICT CLEARED | KHU ĐÃ SẠCH |
| `gate_open_toast` | GATE OPEN — {district} | CỔNG MỞ — {district} |
| `interact_hint` | E — INTERACT | E — TƯƠNG TÁC |

### 7.6 Tựa nhiệm vụ (missions.js)

| Key | EN | VI |
|---|---|---|
| `mission1_title` | Lights On | Sáng Đèn |
| `mission2_title` | Dead Blocks | Đường Phố |
| `mission3_title` | The Signal | Tiếng Radio |
| `mission4_title` | Medicine Run | Thuốc Cho Bệnh Nhân |
| `mission5_title` | Signal Fire | Lửa Trại Cầu Cứu |
| `mission6_title` | Fuel Run | Nhiên Liệu |
| `mission7_title` | Into the Swarm | Vào Tâm Dịch |
| `mission8_title` | The Warden | Vệ Binh Cách Ly |
| `mission9_title` | The Last Door | Cánh Cửa Cuối |

### 7.7 Intro + outro (dialogue.js)

- `intro_s1` … `intro_s4` — 4 slide; `story_outro_line1..3` — outro
  (`story_outro_line2` dạng banner). **Text EN/VI: chép NGUYÊN VĂN từ
  docs/STORY.md §2 và §4** (bảng từng dòng ở đó là nguồn duy nhất — không
  sao lại ở đây để tránh lệch chữ).
- Thoại nhận/hoàn thành nhiệm vụ: `m{n}_{speaker}_line{i}` với `{speaker}` ∈
  `radio|you|unknown`, đánh số theo thứ tự bảng từng nhiệm vụ; hoàn thành:
  `m{n}_done_{speaker}_line{i}` (m1–m7: 2 dòng; m8: 1 dòng; m9: KHÔNG có —
  reach cửa → cắt thẳng OUTRO). **Danh sách key đủ + trật tự** (STORY.md §3):

| Nhiệm vụ | Keys nhận (thứ tự) | Keys hoàn thành (thứ tự) |
|---|---|---|
| m1 | `m1_radio_line1`, `m1_radio_line2`, `m1_you_line1`, `m1_radio_line3` | `m1_done_radio_line1`, `m1_done_you_line1` |
| m2 | `m2_radio_line1`, `m2_radio_line2`, `m2_you_line1`, `m2_radio_line3` | `m2_done_radio_line1`, `m2_done_you_line1` |
| m3 | `m3_radio_line1`, `m3_you_line1`, `m3_radio_line2` | `m3_done_you_line1`, `m3_done_radio_line1` |
| m4 | `m4_unknown_line1`, `m4_you_line1`, `m4_unknown_line2` | `m4_done_unknown_line1`, `m4_done_you_line1` |
| m5 | `m5_unknown_line1`, `m5_you_line1`, `m5_radio_line1` | `m5_done_unknown_line1`, `m5_done_you_line1` |
| m6 | `m6_radio_line1`, `m6_you_line1`, `m6_radio_line2` | `m6_done_unknown_line1`, `m6_done_radio_line1` |
| m7 | `m7_unknown_line1`, `m7_radio_line1`, `m7_you_line1`, `m7_radio_line2` | `m7_done_you_line1`, `m7_done_unknown_line1` |
| m8 | `m8_unknown_line1`, `m8_you_line1`, `m8_radio_line1` | `m8_done_radio_line1` |
| m9 | `m9_radio_line1`, `m9_unknown_line1` | — (outro) |

  Text từng dòng: chép nguyên văn từ docs/STORY.md §3 (bảng mỗi nhiệm vụ).
  STT speaker trong payload `STORY_DIALOGUE` (mục 5.1.5) dùng chuỗi
  `radio|you|unknown` → map key `speaker_*`.

---

## 8. Balance

(Nguồn STORY.md §6 — con số KHÔNG đổi.)

| Nhiệm vụ | Thưởng | Tích luỹ |
|---|---|---|
| m1 | $300 | $300 |
| m2 | $325 | $625 |
| m3 | $350 | $975 |
| m4 | $400 | $1,375 |
| m5 | $425 | $1,800 |
| m6 | $450 | $2,250 |
| m7 | $500 | $2,750 |
| m8 | $550 | $3,300 |
| m9 | $600 | $3,900 |

- Mục tiêu: người chơi có **~1500-2500$ tới hết nhiệm vụ 4** (sniper $800 /
  gần minigun $1500). Thưởng nhiệm vụ đóng $1,375; còn lại từ kill reward
  (walker 50 / runner 75 / brute 200, headshot +50%; boss 700-1500 —
  `economy.js:57-65`) trừ chi phí shop. **Builder chỉnh density (+50% sau
  quota) để chạm mốc — KHÔNG tăng thưởng nhiệm vụ.**
- `mission-complete` {index, reward} với `reward` ĐÚNG bảng; `economy.add`
  do main.js gọi; toast dùng `mission_complete_toast`.

---

## 9. README.md (fixer, cuối cùng)

Thêm mục **"ĐÊM THỨ 30 — Phần 1"** ở cuối README:

1. Bản đồ 7 khu — bảng: khu | quota | nhiệm vụ (tên EN/VI, dùng bảng mục 3.1
   + 5.1.1 của hợp đồng này).
2. Cơ chế cổng + quota (2-3 câu: cổng đỏ→xanh, rào chìm 1 s, quota đếm kill
   trong khu, cổng mở khi quota + nhiệm vụ xong).
3. Phím E (tương tác máy phát/nhặt vật phẩm; nhắc "E — TƯƠNG TÁC").
4. Cốt truyện tóm tắt — **SPOILER gấp lại** (`<details><summary>`): 1 đoạn
   ngắn không leak twist (radio + giọng thứ hai + tâm cách ly).
5. Debug API mới (bảng mục 5.6.5) cho footer debug sẵn có của README.

KHÔNG xoá/sửa mục hiện có của README.

---

## 10. Checklist đồng bộ số + dev-guard

Những số xuất hiện ≥ 2 chỗ — đổi 1 chỗ phải đổi cả mảng:

- [ ] 3 rect quarantine = `AREA_RECTS` (`level.js:72-76`) = bounds mục 3.1 =
      `districtAt` quarantine = `sameArea`.
- [ ] 14 gate waypoint (12 khu + 2 nội bộ) = tâm gap bảng mục 3.4 =
      `getGateWaypoints()`.
- [ ] `districts[]` mục 3.1 = `city.js` = bảng quota mục 4.1 = HUD tracker =
      `DISTRICT_RECTS` trong level.js.
- [ ] Spawn points mục 3.6.6 = `city.spawnPoints` — mọi điểm phải pass
      `isBlocked(p.x, p.z, 0.8)` sau build (dev-guard pattern
      `zones.js:139-152` — city.js chạy guard cho mọi điểm mục 3.4/3.6.6/
      5.1.3, warn không throw).
- [ ] POI mục 5.1.3 = vị trí mesh interact missions.js = toạ độ WORLD.md
      mục 11 = STORY.md (không ràng buộc toạ độ).
- [ ] Fog 0.026 (atmosphere) ↔ ngân sách nhìn 70 m ↔ silhouette cityfill
      phủ đến 90 m.
- [ ] Cap zombie 60 (waves) = pool 60 (main.js shared array trần).
- [ ] Thưởng mục 8 = STORY.md §6 = payload `mission-complete`.
- [ ] Key i18n mục 7 = STORY.md §2/§3/§4/§7 (text nguyên văn).

— HẾT HỢP ĐỒNG · docs/EXPANSION-P1.md · Phần 1 "ĐÊM THỨ 30" —
