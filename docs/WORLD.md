# Gun Game — ĐÊM THỨ 30 · PHẦN 1 — BẢN THIẾT KẾ THẾ GIỚI (docs/WORLD.md)

> Tài liệu này là **bản vẽ thế giới duy nhất** cho Phần 1: builder của
> `src/world/city.js` (mới), `level.js` (mở rộng), `missions.js`, `waves.js`
> (mở rộng) và integrator code TRỰC TIẾP theo các số liệu dưới đây.
> Cốt truyện / dialogue / thưởng nhiệm vụ nằm ở `docs/STORY.md` — tài liệu này
> chỉ cố định **toạ độ, kích thước, cổng, spawn, quota và ngân sách hiệu năng**.
>
> **Nguyên tắc:** giữ 100% tính năng hiện có. Toàn bộ số trong phần
> "QUARANTINE — giữ nguyên" là số ĐÃ ĐỌC TRỰC TIẾP trong code ngày 2026-10-31
> (mỗi bảng ghi rõ nguồn `file:line`). Không dùng lại số từ trí nhớ.

---

## MỤC LỤC

1. [Quy ước hệ toạ độ](#1-quy-ước-hệ-toạ-độ)
2. [Tổng quan bản đồ + sơ đồ](#2-tổng-quan-bản-đ--sơ-đ)
3. [7 KHU — bảng bounds chính thức](#3-7-khu--bng-bounds-chnh-thc)
4. [QUARANTINE — giữ nguyên từng mét](#4-quarantine--giu-nguyn-tng-mt)
5. [Đường phố](#5-ng-ph)
6. [CỔNG — bảng 12 cổng + cơ chế khoá/mở](#6-cng--bng-12-cng--c-ch-khom)
7. [PROPS từng khu + nhóm merge](#7-props-tng-khu--nhm-merge)
8. [SPAWN POINTS từng khu](#8-spawn-points-tng-khu)
9. [QUOTA + spawn density](#9-quota--spawn-density)
10. [NGÂN SÁCH HIỆU NĂNG](#10-ngn-sch-hiu-nng)
11. [POI nhiệm vụ + điểm tương tác](#11-poi-nhim-v--im-tng-tac)
12. [Tích hợp + xung đột cần xử lý](#12-tich-hp--xung-t-cn-x-l)
13. [Checklist đồng bộ số](#13-checklist-ng-b-s)

---

## 1. Quy ước hệ toạ độ

- Đơn vị: **mét**, trùng hệ XZ của `level.js` (colliders AABB, Y chỉ để render).
- **−Z = BẮC, +Z = NAM, +X = ĐÔNG, −X = TÂY** — khớp code hiện có: cổng bắc
  nằm tại `z = −30` và khu "Sân sau" ở `z ∈ [−54, −30]` (`src/world/level.js:74,
  80`); cổng đông tại `x = 30` (`level.js:81`).
- Mọi khối props **axis-aligned** (không xoay Y ngoài trừ "stack" trang trí như
  thùng gỗ hiện tại `level.js:325`) — collider XZ phải khớp khối vẽ 1:1 như
  `colliderOf()` (`level.js:271-273`).
- Kích thước collider người/zombie: r = 0.4 m (`level.js:701`); lối đi hẹp nhất
  giữa 2 khối props **≥ 3 m** (zombie brute 1.4 m/s cần rẽ, tránh đáy chữ L —
  quy tắc đã ghi trong `level.js:135-138`).

---

## 2. Tổng quan bản đồ + sơ đồ

Thành phố **260 × 260 m**, tâm (0,0), tường ngoài rào kín ở ±130. Quarantine
(chính là arena 60×60 + 2 khu north/east cũ) ở **trung tâm**, 6 khu còn lại
bao quanh theo hoa thị 6 cạnh. Sơ đồ (bắc = trên, không theo tỷ lệ):

```
                      BẮC  z = −130
   ┌──────────────────────┬─────────────────────────────┐
   │  RESIDENTIAL         G2         COMMERCIAL          │
   │  Khu Dân Cư          │          Phố Thương Mại     │
   │  quota 20            │          quota 25           │
   │            ▯R-Q      │      ▯C-Q                   │
   │     ▯G1              │                ▯G3          │
   │ ┌───────────┐ ┌──────┴───────────────┐ ┌──────────┐ │
   │ │ SAFEHOUSE ═╡ S-Q  QUARANTINE  ╞══ E-Q │ HOSPITAL │ │
   │ │  (hub)     │Q│  "Sân sau"──G──"Kho" │Q│          │ │
 ──┼─┤ máy phát×3 │Q│  ARENA 60×60 [vault] │Q│ quota 30 │█┼── ĐÔNG x=+130
   │ └───────────┘Q└──────────────────────┘ └──────────┘ │
   │     ▯G6       ▯D-Q          ▯P-Q        ▯G4         │
   │  DOCKS               │              PARK            │
   │  Bến Cảng           G5          Công Viên           │
   │  quota 30            │          quota 25           │
   └──────────────────────┴─────────────────────────────┘
                      NAM  z = +130     (▯ = cổng, ═/║ = tường thép quarantine)
```

- Vành đai 6 cổng G1→G2→G3→G4→G5→G6 nối vòng tròn quanh trung tâm — đúng thứ
  tự chuỗi nhiệm vụ 1→6 (`docs/STORY.md`).
- 6 cổng thép nói vào quarantine (S-Q, R-Q, C-Q, H-Q, P-Q, D-Q): **khoá đỏ từ
  đầu game**; nhiệm vụ 6 mở **D-Q** (cổng thép chính từ docks); 5 cổng còn lại
  chỉ mở sau nhiệm vụ 9 (chơi tự do).
- 2 cổng nội bộ quarantine (0,−30) và (30,0) **giữ nguyên 100%** — chúng nối
  arena ↔ "Sân sau"/"Kho", đều nằm trong quarantine, không phải cổng khu.

---

## 3. 7 KHU — bảng bounds chính thức

Đây là số liệu `districts[]` cho `createCity(scene, level)` — builder copy
nguyên bảng vào `city.js`. Bounds là hình chữ nhật XZ khép kín; **mọi điểm
ngoài 7 bounds = void (isBlocked = true)** — đúng hành vi `!inBounds` hiện có
(`level.js:688-690, 703`).

| # | id | Tên EN / VI (`nameKey` mới) | bounds minX | maxX | minZ | maxZ | Kích thước | Quota | Vai trò |
|---|----|-----------------------------|-------------|------|------|------|------------|-------|---------|
| 1 | `safehouse` | Safehouse / An Toàn Nhà | −130 | −30 | −30 | 30 | 100×60 | — | Hub, hồi sinh, máy phát |
| 2 | `residential` | Residential / Khu Dân Cư | −130 | −15 | −130 | −30 | 115×100 | 20 | Nhà phố 2 tầng |
| 3 | `commercial` | Commercial / Phố Thương Mại | −15 | 130 | −130 | −54 | 145×76 | 25 | Plaza + cửa hiệu |
| 4 | `hospital` | Hospital / Bệnh Viện | 54 | 130 | −54 | 30 | 76×84 | 30 | Toà kính vỡ + lều dã chiến |
| 5 | `park` | Park / Công Viên | −15 | 130 | 30 | 130 | 145×100 | 25 | Cây + hồ + lửa trại |
| 6 | `docks` | Docks / Bến Cảng | −130 | −15 | 30 | 130 | 115×100 | 30 | Container + cần cẩu |
| 7 | `quarantine` | Quarantine / Vùng Cách Ly | −30 | 54 | −54 | 30 (bbox) | 84×84 | — | Khu cuối, khoá đến M6 |

Ghi chú bắt buộc:

- **Bounds 7 khu phủ đè nhau đúng 0 m² diện tích** (đã kiểm tra từng cặp:
  chỉ chạm nhau trên đường biên). `districtAt(x, z)` kiểm tra quarantine
  **trước tiên** nhưng dùng **3 rect con** (mục 4), không dùng bbox — rồi mới
  lướt 6 rect còn lại theo thứ tự bảng. Kết quả: mọi điểm walkable trả về đúng
  1 khu; void trả `null`.
- `safehouse` bounds 100×60 nhưng **compound nhà kiên cố chỉ 40×40** tại
  `x −95..−55, z −20..20` (đúng "~40×40" trong SPEC); phần còn lại là sân bê
  tông + đường + bãi đỗ.
- `quarantine.bounds` (dữ liệu HUD/debug) = bbox `−30..54, −54..30`; trung tâm
  hiển thị (`center`) = **(0, 0)** — tâm arena. 6 khu còn lại `center`:
  safehouse (−75, 8) · residential (−72, −80) · commercial (57, −92) ·
  hospital (92, −12) · park (57, 80) · docks (−72, 80). `teleportDistrict(id)`
  rơi player vào đúng `center`, sau khi mở hết cổng cần thiết (cùng cơ chế
  mở-khoá-trước-khi-teleport của `main.js:696-717` hiện tại).
- 4 vùng "notch" nằm trong bbox quarantine nhưng **ngoài** 3 rect legacy là
  VOID (đất sụp, khoá chết, không đi được): N-B1 `x 15..30, z −54..−30`;
  N-B2 `x 30..54, z −54..−15`; N-B3 `x 30..54, z 15..30`. Riêng ô
  `x −30..−15, z −54..−30` (giữa tường tây arena và tường side bắc của
  "Sân sau") **thuộc residential** — là phố nẹp tường quarantine, có cổng R-Q
  (mục 6). 3 notch VOID chỉ cần **silhouette nhà sụp** (mục 7), không collider.

---

## 4. QUARANTINE — giữ nguyên từng mét

Số dưới đây là **số thật trong code**, builder KHÔNG được đổi:

| Thứ | Giá trị | Nguồn |
|---|---|---|
| Arena 60×60 | `HALF = 30`, tường cao 4, dày 0.5 | `src/world/level.js:62-64` |
| Rect arena | `−30..30 × −30..30` | `level.js:73` |
| Rect north "Sân sau" | `−15..15 × −54..−30` (~30×24) | `level.js:74` |
| Rect east "Kho" | `30..54 × −15..15` (~24×30) | `level.js:75` |
| 2 cổng nội bộ | waypoint (0, −30) và (30, 0), gap ±2 m (4 m) | `level.js:69, 79-82` |
| Wall spans arena + 2 khu | 12 span (đúng danh sách) | `level.js:158-176` |
| Props legacy | 15 obstacle + 11 zone props | `level.js:102-148` |
| Spawn legacy | 12 ring R=26 + 6 zone | `level.js:588-601, 85-92` |
| Boss anchor | north (−5, −45) · east (42, 0) | `src/world/zones.js:99, 108` |

Ngoài ra quarantine thêm đúng **1 prop mới**: **CỬA THÉP CUỐI (vault door)**
tại **(0, 0)** — đĩa thép tròn Ø 4 m, dày 0.6, nửa chìm (đỉnh y = 0.3), vật
liệu emissive lạnh `#4fd8ff`, `userData.solid = true`, collider
`−2..2 × −2..2`. Đây là target `reach` của nhiệm vụ 9 ("Cánh Cửa Cuối") và là
mốc WF-3 thay bằng boss cuối + ending. Vị trí (0,0) trống trong layout legacy
(obstacle gần nhất ở (−8, −6), `level.js:104`) — không xô đồ gì.

Cấm: đổi `HALF`, gap cổng nội bộ, vị trí obstacle legacy, 18 spawn legacy,
2 boss anchor — waves/boss/zombie pathing đang sống trên những số này.

---

## 5. Đường phố

Mọi đường rộng **8 m (trục chính) / 5 m (nhánh)**, nằm trong bounds khu
(yield `districtAt` đúng), hình thành bởi **khe giữa các khối props** — không
vẽ mesh đường riêng (sàn city dùng 1 plane lớn, mục 10). Bảng dưới là đường
BẮT BUỘC phải thông (zombie + player đi được, đã tính khoảng lệch r=0.4):

| Đường | Nối | Tuyến chính |
|---|---|---|
| Trục Tây | S-Q (−30,0) ↔ compound safehouse | `z −4..4`, `x −55..−30`; qua cổng compound `x=−55, z −2..2` vào sân (−75, 8) |
| Vành Bắc Tây | G1 (−72,−30) ↔ nội khu residential | trục N-S `x −76..−68`, `z −30..−66`, gặp trục nhà phố E-W `z −74..−66` |
| Trục Nhà Phố | E-W residential | `z −74..−66`, `x −130..−15`; nhánh N-S `x −19..−11` lên G2 (−15,−95); phố nẹp `x −30..−15, z −54..−30` sang R-Q (−15,−42) |
| Trục Plaza | C-Q (0,−54) ↔ plaza ↔ G2/G3 | E-W chính `z −62..−50` hết `x −15..130` (C-Q mở vào đây; G3 (85,−54) đối diện qua tường ranh); hẻm N-S `x 28..32` xuyên hàng hiệu lên plaza (30..80 × −115..−75); nhánh E-W `z −99..−91` từ plaza sang G2 (−15,−95) |
| Tiền Sảnh | H-Q (54,0) ↔ sảnh bệnh viện | sân `x 54..76, z −20..20`; vòng E-W `z −54..−46` lên G3 (85,−54) và `z 22..30` xuống G4 (85,30) |
| Lối Công Viên | P-Q (0,30) ↔ G4 ↔ G5 | đường dạo `z 30..38` hết `x −15..130`; nhánh N-S `x −15..−7, z 60..90` ra G5 (−15,75); vòng quanh hồ |
| Trục Cảng | D-Q (−22,30) ↔ G6 ↔ G5 ↔ bãi container | N-S `x −26..−18` và `x −76..−68` từ `z 30` xuống E-W chính `z 60..68` hết `x −130..−15` |

Quy tắc: **mọi cổng mở ra đúng 1 đường trong bảng** (không bao giờ mở ra sát
tường props); zombie spawn point (mục 8) đều nằm trên/kề đường ≤ 3 m.

---

## 6. CỔNG — bảng 12 cổng + cơ chế khoá/mở

Mỗi cổng = **khung thép (posts + lintel) + rào chắn trượt**. Khung all-gates
merge thành 1 mesh; rào chắn từng cổng là mesh riêng (phải chìm xuống đất độc
lập). Pattern khung/lintel/icon + collider posts y hệt cổng hiện có
(`level.js:524-583`) — tái dùng, đổi màu emissive: **đỏ `#ff3b30` khi khoá,
xanh lục `#3dff6e` khi mở** (icon texture dùng lại `makeGateIconTexture`,
`level.js:239-268`).

| Cổng | from → to | Vị trí (x, z) | Gap theo trục | Rộng | Loại | Mở khi |
|---|---|---|---|---|---|---|
| G1 | safehouse ↔ residential | (−72, −30) | X (tường E-W) | 5 m | khung sắt | M1 xong → `gate-open {safehouse, residential}` |
| G2 | residential ↔ commercial | (−15, −95) | Z (tường N-S) | 5 m | khung sắt | M2 xong |
| G3 | commercial ↔ hospital | (85, −54) | X | 5 m | khung sắt | M3 xong |
| G4 | hospital ↔ park | (85, 30) | X | 5 m | khung sắt | M4 xong |
| G5 | park ↔ docks | (−15, 75) | Z | 5 m | khung sắt | M5 xong |
| G6 | docks ↔ safehouse | (−72, 30) | X | 5 m | khung sắt | M6 xong (cùng D-Q — khép vành đai) |
| D-Q | docks → quarantine | (−22, 30) | X | 5 m | **THÉP** (cổng chính trung tâm) | M6 xong → `gate-open {docks, quarantine}` |
| S-Q | safehouse → quarantine | (−30, 0) | Z | 4 m | thép hàn kín | M9 xong (chơi tự do) |
| R-Q | residential → quarantine | (−15, −42) | Z | 4 m | thép hàn kín | M9 xong |
| C-Q | commercial → quarantine | (0, −54) | X | 4 m | thép hàn kín | M9 xong |
| H-Q | hospital → quarantine | (54, 0) | Z | 4 m | thép hàn kín | M9 xong |
| P-Q | park → quarantine | (0, 30) | X | 5 m | thép hàn kín | M9 xong |

Cắt tường — các span hiện tại phải tách đôi quanh gap, đúng kỹ thuật
2-segment đã dùng cho cổng bắc/đông (`level.js:163-167`):

| Tường bị cắt | Span hiện tại | Gap mới |
|---|---|---|
| Nam arena (D-Q + P-Q) | `level.js:160` `x −30.25..30.25, z 29.75..30.25` | tách thành 3 đoạn quanh `x −24.5..−19.5` và `x −2.5..2.5` |
| Tây arena (S-Q) | `level.js:161` `x −30.25..−29.75, z −30..30` | tách quanh `z −2..2` |
| Side bắc north (R-Q) | `level.js:169` `x −15.25..−14.75, z −54.25..−30` | tách quanh `z −44..−40` |
| Back north (C-Q) | `level.js:171` `x −15..15, z −54.25..−53.75` | tách quanh `x −2..2` |
| Back east (H-Q) | `level.js:175` `x 53.75..54.25, z −15..15` | tách quanh `z −2..2` |

Tường ranh giới mới (giữa các khu, không tồn tại trong code): tường bê tông
cao 4.5 m, dày 0.5, dọc 6 biên shared của bảng mục 3, chừa đúng gap cổng
tương ứng; dọc tường ngoài ±130 cao 6 m, dày 1. Tất cả merge thành **2 mesh**
(outer wall 1 + boundary walls 1) với `tintGeometry` như `level.js:299-309`.

Cơ chế mở (`setGateOpen(from, to, open)` — hợp đồng city.js):

1. Rào chắn (box 5×3×0.4 chắn đúng gap) **chìm xuống đất trong 1.0 s** (tween
   y từ 1.5 → −1.6), phát âm thanh trầm + toast `"CỔNG MỞ — {tên khu}"` (HUD
   nghe `gate-open` {from, to}).
2. Khung + icon đổi emissive đỏ → xanh trong cùng 1 s.
3. Collider rào chắn bị **gỡ khỏi `level.colliders`** đúng lúc chìm xong
   (không phải lúc bắt đầu — tránh lộ khe 0.3 s).
4. `getGateWaypoints()` trả **12 waypoint** = tâm 12 gap (bảng trên), thay cho
   mảng 2 điểm cố định (`level.js:79-82`) — zombie.js route qua điểm gần nhất
   (cơ chế C3 hiện có). Waypoint của cổng đang khoá vẫn trả về nhưng
   `sameArea` mở rộng (mục 12) khiến zombie không đi xuyên tường được.

---

## 7. PROPS từng khu + nhóm merge

Quy tắc chung (khớp pattern hiện có `level.js:492-514`): mỗi khu **tối đa 2-3
draw call cho toàn nhà cửa** — mọi box cùng material `vertexColors` merge về
1 mesh bằng `mergeGeometries`; lớp **emissive** (bảng hiệu, cửa sổ sáng, đèn)
merge riêng thành mesh 2. Props nhỏ gom theo kind (crate/car/container/bench/
tree-trunk/tree-canopy) — mỗi kind 1 mesh/1 khu. **Nhà cửa + cây KHÔNG
castShadow**; props ≤ 3 m (crate, container, xe, rào) castShadow = true như
obstacle hiện tại (`level.js:509`). Mọi mesh solid đều `userData.solid = true`
(bullet occlusion, hợp đồng `level.js:6-11`).

### safehouse (hub — ấm nhất map, ít props nhất)

| Khối | Số × kích thước (m) | Vị trí (tâm) | Merge vào |
|---|---|---|---|
| Tường compound cao 3, dày 0.4 | vòng 40×40, chừa gate đông `z −2..2` | vòng `x −95..−55, z −20..20` | **nhà-1** |
| Nhà chính kiên cố | 1 × 30×5×14 | (−77, −5) | **nhà-1** |
| Mai che + kệ dụng cụ | 2 × 8×3×5 | (−62, 12), (−88, 12) | **nhà-1** |
| Tháp canh | 1 × 3×7×3 + nóc | (−92, 16) | **nhà-1** |
| Lều y tế | 1 × 6×2.5×4 | (−60, 14) — chừa (−75,15) | props-1 (vải) |
| Thùng gỗ / xe cũ | crate ×4, car ×1 | sân tây (−120, ±20) | props-2 (tái dùng `pushCrateGeo`/`pushCarGeo` `level.js:319-344`) |
| **3 máy phát** (M1) | 1.5×1.2×1 mỗi chiếc, emissive vàng | (−89, −15), (−61, −15), (−75, 15) | **interact-1** (mesh riêng, emissive, `fog:false` cho đèn nhỏ) |
| Đèn PointLight ấm | 1 × distance 22 | (−75, 4.5, 8) | light (không mesh) |

### residential (nhà phố 2 tầng dãy thẳng + hẻm + xe bỏ hoang)

| Khối | Số × kích thước | Vị trí | Merge vào |
|---|---|---|---|
| Nhà phố 2 tầng (thân + mái tôn) | 20 × 8×6.5×10 | dãy A z=−115, B z=−85: tâm x −124,−112,−100,−88,−76,−64,−52,−40; dãy C z=−55: tâm x −124,−112,−100,−88,−64,−52,−40 (**bỏ ô x=−76** — chừa lối G1); dãy D z=−38: tâm x −124,−108,−92,−52,−36 (**bỏ ô x=−20** — chừa phố nẹp R-Q); hẻm 4 m giữa các nhà liền kề | **nhà-1** (thân) + **nhà-2** (mái, cùng material vertexColors vẫn merge chung nhà-1 nếu muốn — mục tiêu ≤ 2 mesh) |
| Cửa sổ phát sáng yếu | dải emissive 1.2×0.8 mỗi nhà ~4 cái | mặt tiền z hướng phố | **emissive-1** |
| Xe hơi bỏ hoang | 5 × 4.4×1.6×2.0 (`pushCarGeo`) | dọc `z=−70±3`, x −120,−96,−60,−36,−24 | props-1 |
| Dumpster hẻm | 6 × 2×1.2×1.2 | trong hẻm giữa các dãy | props-1 |
| Cột đèn đường (thân + chao) | 8 × 0.25×5 | dọc trục nhà phố mỗi 20 m | emissive-1 (bóng đèn) + props-2 (cột) |
| **3 gói nhu yếu phẩm** (M2) | 0.6×0.6×0.6 emissive cyan | (−120, −123), (−30, −100), (−70, −45) | interact-1 |

### commercial (plaza + cửa hiệu + xe bus lật + biển hiệu)

| Khối | Số × kích thước | Vị trí | Merge vào |
|---|---|---|---|
| Cửa hiệu 1 tầng (mặt tiền + bạt) | 10 × 12×5×8 | hàng z=−66 (footprint z −70..−62; tâm x −6, 8, 22, 38, 54, 70) + hàng z=−122 (tâm x 6, 30, 60, 90) | **nhà-1** |
| **Biển hiệu neon** | 10 × tấm 4×1.2 emissive (hue hồng/cyan/vàng xen kẽ) | mặt tiền hàng hiệu, cao 4 | **emissive-1** (`fog:false` để xuyên sương) |
| Xe bus lật | 1 × 11×2.8×2.5, nghiêng — vẽ 2 box lệch, collider giữ AABB 11×2.5 | (90, −80) | props-1 |
| Đài phát thanh phát sáng (M3 reach) | tháp lưới 0.8×9×0.8 + đầu emissive đỏ nhấp nháy | (55, −95) giữa plaza | **interact-1** (đầu emissive `fog:false`) |
| Kệ hàng ngoài trời / thùng | crate ×8 | quanh plaza | props-2 |
| Cột đèn plaza | 4 × 0.25×6 | 4 góc plaza | props-2 |
| Đèn PointLight hồng nhạt | 1 × distance 20 | (55, 5, −95) | light |

### hospital (toà kính vỡ + xe cứu thương + lều dã chiến)

| Khối | Số × kích thước | Vị trí | Merge vào |
|---|---|---|---|
| Toà bệnh viện (khối chính + khối thang máy) | 1 × 40×18×28 + 1 × 8×22×8 | (100, 0) và (96, −18) | **nhà-1** |
| Dải cửa kính vỡ emissive xanh nhạt | ~24 dải 1.5×2 | mặt tây + nam toà | **emissive-1** |
| Lều dã chiến | 3 × 5×2.5×5 | (63, −10), (63, 10), (72, 0) | props-1 |
| Xe cứu thương (car kind, sơn trắng-thêm-tint) | 2 × 5.5×2.4×2.4 | (70, −22), (78, 18) | props-2 |
| Cột treo mountain + rào tạm | crate + block ×6 | forecourt | props-2 |
| **3 hộp thuốc** (M4) | 0.5×0.4×0.5 emissive trắng-đỏ | (59, −6), (59, 6), (76, 4) — trước cửa 3 lều | interact-1 |
| Đèn PointLight xanh bệnh viện | 1 × distance 24 | (78, 6, 0) | light |

### park (cây low-poly + hồ + ghế đá + lửa trại)

| Khối | Số × kích thước | Vị trí | Merge vào |
|---|---|---|---|
| Hồ nước | 1 × 26×16, mặt nước plane y=−0.12 (đi lội được, KHÔNG collider) | `x 40..66, z 70..86` | **water-1** (material trong, roughness thấp) |
| Cây low-poly (thân trụ + tán nón/icosahedron) | 24 × thân 0.8×3, tán r≈2.2 | scatter lưới 25 m jitter ±8, né hồ/đường/bonfire 8 m | **thân → props-1, tán → canopy-1** (tán KHÔNG castShadow) |
| Ghế đá | 6 × 2×0.5×0.6 | vòng quanh hồ + dạo đạo | props-2 |
| Đống lửa trại (M5 activate) | vòng đá r 1.2 + củi hộp 1.5×0.5×0.5 ×3, lửa emissive cam | (10, 70) | **interact-1** + PointLight cam distance 18 |
| Đường dạo gravel | plane decal 3 m rộng, y=0.01 | theo bảng mục 5 | decal-1 (không collider) |

### docks (container xếp chồng + cần cẩu tĩnh + tàu cá đậu)

| Khối | Số × kích thước | Vị trí | Merge vào |
|---|---|---|---|
| Container (tái dùng `pushContainerGeo` `level.js:361-365`, hue xen kẽ) | 14 × 6×2.6×2.4 (5 chiếc chồng lớp 2 — tầng trên chỉ visual) | bãi A: hàng z=46 và z=52, tâm x −118, −111, −104 (6 chiếc, 1 chồng); bãi B: hàng z=98 và z=110, tâm x −58, −51, −44, −37 (8 chiếc, 4 chồng) | props-1 |
| Cần cẩu tĩnh (2 chân + dầm 20 m + cabin) | 1 × chân 2×12×2 tại (−95, 55)/(−75, 55), dầm y=12 | (−85, 55) | **nhà-1** (collider chỉ 2 chân) |
| Tàu cá đậu (thân + cabin + cột) | 1 × 10×3×3.5 | (−120, 105), mạn áp bến | props-2 |
| Cầu cảng (sàn gỗ + cọc) | 2 × 14×0.3×4, y=0.8 (đi được, collider mỏng) | (−114, 96), (−114, 112) | props-2 |
| Cột buộc + rào biển hiệu | crate/block ×8 | dọc bờ nam | props-2 |
| **4 can xăng** (M6) | 0.5×0.7×0.35 emissive đỏ | (−120, 40), (−30, 120), (−90, 90), (−45, 55) | interact-1 |
| Đèn PointLight amber cần cẩu | 1 × distance 22 | (−85, 13, 55) | light |

### quarantine + void silhouettes

- Quarantine giữ nguyên toàn bộ props legacy (`level.js:102-148`) + vault door
  (mục 4). Không thêm gì khác.
- **Silhouette nhà sụp** phủ 3 notch VOID (mục 3) + mọi dải đất ngoài 7 bounds
  nhưng trong tầm nhìn (dải giữa ranh khu và tường ±130): khối hộp tối
  8-15 m cao, merge **toàn thành phố thành 1 mesh duy nhất** `cityfill-1`,
  `userData.solid = true`, KHÔNG collider (đã blocked bởi `!inBounds`),
  KHÔNG castShadow. Đây là phông trời thành phố — làm rẻ, làm tối.

---

## 8. SPAWN POINTS từng khu

Mỗi khu 4-6 điểm, tất cả nằm trên/đường kề (≤3 m) bảng mục 5, cách collider
≥ 1 m (level.js có sẵn cơ chế nudge, `level.js:614-628` — nhưng builder đặt
đúng ngay từ đầu). `city.spawnPoints[districtId]` là mảng riêng; `waves.js`
mở rộng chỉ rút từ **khu player đang đứng** (mục 12). Quarantine tái dùng
18 điểm legacy.

| Khu | Spawn points (x, z) |
|---|---|
| safehouse | (−125, −25) · (−125, 25) · (−42, −25) · (−42, 25) · (−115, 0) |
| residential | (−125, −125) · (−35, −125) · (−125, −70) · (−70, −72) · (−25, −40) · (−45, −40) |
| commercial | (−8, −125) · (125, −125) · (12, −57) · (60, −57) · (125, −60) · (90, −100) |
| hospital | (58, −48) · (125, −48) · (58, 24) · (125, 24) · (90, −45) · (100, 25) |
| park | (−10, 35) · (60, 35) · (125, 35) · (125, 125) · (−10, 125) · (30, 105) |
| docks | (−125, 35) · (−25, 35) · (−125, 125) · (−25, 125) · (−70, 80) · (−40, 60) |
| quarantine | 18 điểm legacy nguyên vị trí — 12 ring R=26 (`level.js:588-601`) + 6 zone (`level.js:85-92`) |

Quy tắc chọn tại runtime giữ nguyên `waves.js:241-262`: điểm cách player
≥ 15 m mới hợp lệ; jitter ±0.7 m (`waves.js:94`); không điểm hợp lệ → điểm
XA NHẤT. Với map lớn: nếu khu player có < 2 điểm đạt ≥ 15 m (player đứng sát
mép), mở rộng pool sang **khu kề đã mở** (danh sách kề = cột from→to bảng 6)
trước khi buộc dùng điểm xa nhất.

---

## 9. QUOTA + spawn density

`quotaNeed` theo SPEC — chỉ đếm zombie hạ **trong khu đó** (`zombie-killed`
+ `districtAt` của `detail.position`; boss chết trong khu cũng tính vào quota
khu đó nếu có field type boss → bỏ qua, quota chỉ nhận walker/runner/brute):

| Khu | quotaNeed | Kỳ vọng hoàn thành | density khi chơi |
|---|---|---|---|
| safehouse | — (hub) | — | ×0.5 (mỗi spawn lẻ hoán sang khu kề đã mở) |
| residential | 20 | waves 1-3 (tổng 8+11+14 = 33 con) | ×1.0 |
| commercial | 25 | waves 3-5 | ×1.0 |
| hospital | 30 | waves 5-7 (wave 5 boss dồn 6 s) | ×1.0 |
| park | 25 | waves 7-9 | ×1.0 |
| docks | 30 | waves 9-11 | ×1.0 |
| quarantine | — (đi bằng nhiệm vụ) | M7 survive 60 s + M8 boss | ×1.5 trong M7-M8 (horde dồn dập), về ×1.0 sau M9 |

Suy luận density (số liệu gốc `waves.js:86-98, 136-148`):

- Gap spawn nền 0.8-1.5 s ≈ 40-75 zombie/phút lý thuyết; thực tế bóp bởi tổng
  wave `5 + 3n` và thời gian bắn sạch. Áp lực kill trung bình người chơi cần:
  **≈ 6-8 con/phút ở waves 1-3, 10-14 con/phút từ wave 8+**.
- **Sau khi quota khu xong** (event `quota-done`): density khu đó **+50%** =
  gap spawn ×⅔ → **0.55-1.0 s**. Chỉ áp dụng khi player đứng trong khu đã
  quota-done (áp lực cuối trước khi mở cổng ra).
- **Cap zombie đồng thời = 60** (pool tái sử dụng). `spawnOne` kiểm tra số
  alive trước khi sinh: đủ 60 → giữ nguyên queue, thử frame sau (không drop
  zombie — wave accounting vẫn đúng vì `tracked` chỉ nhận khi spawn thành
  công). Wave 20 tổng 65 con > 60 → xác nhận cap là giới hạn thực.
- Quan hệ quota ↔ cổng: `quota-done {districtId}` chỉ là **điều kiện cần**;
  cổng ra mở khi missions phát `gate-open` (quota xong **VÀ** mục tiêu phụ
  collect/activate xong — bảng mục 6). HUD đếm `"🧟 12/20"` hiện khi player
  đang đứng trong khu có quota.

---

## 10. NGÂN SÁCH HIỆU NĂNG

### Draw calls — mục tiêu

| Nhóm | Số draw call | Ghi chú |
|---|---|---|
| Sàn city | 1 | Plane 260×260 AsphaltTexture repeat 130 (mẫu `makeFloorTexture` `level.js:185-232`), y = −0.02, receiveShadow |
| Sàn legacy quarantine | 3 | 3 plane hiện có giữ nguyên (`level.js:395-412`) — phủ đè sàn city |
| Tường ngoài ±130 | 1 | merge |
| Tường ranh 6 khu + tường compound | 1 | merge |
| Nhà cửa 5 khu (safehouse/residential/commercial/hospital/docks) | ≤ 2/khu = ≤ 10 | merge vertexColors; nhà/cây KHÔNG castShadow |
| Props theo kind | ≤ 3/khu = ≤ 15 | crate/car/container/bench/trunk/boat… mỗi kind 1 mesh |
| Emissive lớp (biển hiệu, cửa sổ, đèn đường) | ≤ 1/khu = ≤ 5 | merge, `fog:false` cho landmark |
| Interactables (máy phát, radio, lửa, can, thuốc, gói) | ≤ 2 | merge theo material; đèn nhỏ fog:false |
| Silhouette cityfill | 1 | merge toàn map |
| Khung 12 cổng | 1 | merge all |
| Rào chắn 12 cổng | 12 | mesh riêng (animation chìm độc lập) — mỗi cái 1 box + 1 viền emissive nếu tách material thì 24; khuyến nghị viền dùng cùng material khung, giữ 12 |
| Water hồ | 1 | |
| **TỔNG STATIC** | **≈ 50-55** | hiện trạng arena ~20 (`level.js` toàn file) — tăng ~35 là chấp nhận được |
| Zombie đồng thời | ≤ 60 × ~9 mesh ≈ 540 | thành phần zés `zombie.js:100-194` (2 chân + thân + đầu + 2 mắt + 2 tay, mỗi mesh 1 draw) — **thành phần lớn nhất frame**; cap 60 chặn trần |
| Viewmodel + particles + pickups | ~15-25 | như hiện tại |

Frame worst case ≈ **600-620 draw call** khi đứng giữa map với 60 zombie +
shadow pass. Mục tiêu 60 FPS trên GPU tích hợp: đạt vì mọi static là low-poly
+ frustum culling (fog giấu phần xa — mục dưới). Nếu thiếu dư địa: lever đầu
tiên là gộp material zombie / InstancedMesh (WF-3, KHÔNG làm trong P1).

### Fog + camera

- **FogExp2 density 0.022 → 0.026** (`atmosphere.js:27`): ở 0.026, độ mờ
  ~91% tại 60 m, ~96% tại 70 m → nhà xa nhất trong tầm nhìn mờ hẳn trước
  khi tới hạn vẽ. Giữ `camera.far = 500` (`engine.js:49-54`) — sao trời cần
  (`atmosphere.js:103-134`, `fog:false` sẵn).
- Mọi landmark emissive (`fog:false`): đầu tháp radio, đống lửa, can xăng,
  hộp thuốc, gói nhu yếu phẩm, viền rào chắn cổng — người chơi tìm được
  mục tiêu xuyên sương (đèn bulb arena đã dùng pattern này, `atmosphere.js:82`).

### Shadow

- Moon vẫn là nguồn bóng DUY NHẤT (2048², `atmosphere.js:35-48`). Frustum
  84×84 hiện cố định quanh arena — **chuyển theo player**: mỗi frame set
  `moon.position = player + (40, 70, −25)` normalized và `moon.target =
  player` (làm tròn 2 m để shadow không rung). Không đổi mapSize/bias.
- **castShadow = true CHỈ cho**: zombie + boss (như cũ `zombie.js:116`),
  props ≤ 3 m (crate/container/xe/lều/thùng — như obstacle hiện tại
  `level.js:509`), rào chắn cổng, vault door.
- **castShadow = false bắt buộc**: mọi nhà cửa, tường ranh + tường ngoài
  (khối lớn gây acne + tốn shadow pass), thân + tán cây, silhouette
  cityfill, mặt nước. Tất cả vẫn `receiveShadow = true`.

### PointLights

Trần **10 PointLight**: 5 đèn arena legacy (`atmosphere.js:59-65`) + 1/khu
mới (bảng mục 7: safehouse, commercial, hospital, park bonfire, docks).
Không thêm đèn nào khác — đèn đường residential/plaza chỉ là mesh emissive.

---

## 11. POI nhiệm vụ + điểm tương tác

Toạ độ cho `missions.js` tạo mesh interact + đo `reach`; dialogue/thưởng ở
`docs/STORY.md`. Tương tác: phím E trong bán kính **2 m** → bus
`"interact"` `{target}`; HUD nhắc `"E — TƯƠNG TÁC"` khi trong 3 m (input.js
phát `"interact-press"`).

| Nhiệm vụ | Target id | Khu | Toạ độ (x, z) | Loại mục tiêu |
|---|---|---|---|---|
| M1 Sáng Đèn | `generator-1` | safehouse | (−89, −15) | activate |
| M1 | `generator-2` | safehouse | (−61, −15) | activate |
| M1 | `generator-3` | safehouse | (−75, 15) | activate |
| M2 Đường Phố | `supply-1` | residential | (−120, −123) | collect ×3 |
| M2 | `supply-2` | residential | (−30, −100) | collect |
| M2 | `supply-3` | residential | (−70, −45) | collect |
| M3 Tiếng Radio | `radio-tower` | commercial | (55, −95) | reach (bán kính 3 m) |
| M4 Thuốc | `medicine-1` | hospital | (59, −6) | collect ×3 |
| M4 | `medicine-2` | hospital | (59, 6) | collect |
| M4 | `medicine-3` | hospital | (76, 4) | collect |
| M5 Lửa Trại | `campfire` | park | (10, 70) | activate |
| M6 Nhiên Liệu | `fuel-1` | docks | (−120, 40) | collect ×4 |
| M6 | `fuel-2` | docks | (−30, 120) | collect |
| M6 | `fuel-3` | docks | (−90, 90) | collect |
| M6 | `fuel-4` | docks | (−45, 55) | collect |
| M9 Cánh Cửa Cuối | `final-door` | quarantine | (0, 0) | reach (bán kính 2.5 m) |

Điểm hồi sinh / spawn player khi vào story: **(−75, 8)** — sân compound
safehouse, hướng nhìn về đông (cổng compound). Spawn (0,0) arena cũ chỉ còn
cho luồng debug/không-story.

---

## 12. Tích hợp + xung đột cần xử lý

1. **XUNG ĐỘT zones.js (bắt buộc xử lý):** `zones.js:170-191` tự mở
   north/east khi clear wave 2/4 — nhưng north/east giờ là nội thất
   quarantine, phải khoá đến nhiệm vụ 6. Builder integrator chọn 1 cách:
   (a) Khi story active, `unlockForWave` trở thành no-op (vẫn giữ
   `bossAnchorFor` + `reset()` cho waves) — khuyến nghị; hoặc (b) dịch
   `unlockWave` lên ∞ trong `ZONE_DEFS`. Toast `"zone-unlocked"` giữ nguyên
   cho luồng không-story; story dùng `gate-open` riêng.
2. **`sameArea()` mở rộng** (`level.js:723-726`): hiện chỉ đúng trong 3 rect.
   Mới: true khi 2 điểm cùng 1 district (7 bounds mục 3, quarantine tính theo
   3 rect con) **hoặc** 2 điểm nối được qua ≥ 1 cổng ĐANG MỞ. Zombie giữ
   steering cũ trong cùng khu; sang khu khác → đi waypoint cổng chung
   (`getGateWaypoints()` 12 điểm, mục 6).
3. **`isBlocked` mở rộng tự nhiên**: bỏ check `!inBounds` 3-rect, thay bằng
   7-bounds (quarantine theo 3 rect) — mọi điểm ngoài = blocked (hành vi
   void như cũ `level.js:703`). Khoá quarantine = 12 rào chắn cổng + tường
   ranh (collider), KHÔNG cần cơ chế seal cả rect như
   `setZoneLocked` cũ — nhưng GIỮ nguyên API `setZoneLocked` cho 2 khu
   north/east để không phá caller hiện có (`zones.js:161, 181, 213`).
4. **Waves spawn theo khu** (SPEC B): `pickSpawnPoint` rút từ
   `city.spawnPoints[districtAt(player)]` trước, pool legacy làm fallback;
   giữ nguyên boss-wave mỗi 5 wave, intermission 10 s, MIN_SPAWN_DIST 15 m,
   composition `5 + 3n` (`waves.js:86-148`) — không phá gì.
5. **Respawn story**: nghe `player-died` → game over như cũ. Ở menu restart
   khi story đã tới nhiệm vụ ≥ 2, spawn lại tại safehouse (−75, 8) và giữ
   tiến trình nhiệm vụ/quota của run TRƯỚC là quyết định của
   gamestate/menus (ngoài phạm vi world) — world chỉ bảo đảm
   `city.center("safehouse") = (−75, 8)` hợp lệ làm điểm spawn.
6. **Colliders tăng ~4×**: giữ `isBlocked` O(n) circle-vs-AABB như hiện tại
   (`level.js:708-711`) vẫn ok (~250 collider × vài trăm query/frame);
   nếu profiler đỏ, chuyển spatial hash theo khu — quyết định của builder
   level, không đổi API.

---

## 13. Checklist đồng bộ số

Những số này xuất hiện ở ≥ 2 chỗ (code + doc) — đổi 1 chỗ phải đổi cả mảng:

- [ ] 3 rect quarantine = `AREA_RECTS` (`level.js:72-76`) = bounds mục 4.
- [ ] 12 gate waypoint = tâm gap bảng mục 6 = `getGateWaypoints()`.
- [ ] `districts[]` mục 3 = `city.js` = bảng quota mục 9 = HUD tracker.
- [ ] Spawn points mục 8 = `city.spawnPoints` — mỗi điểm phải pass
      `isBlocked(p.x, p.z, 0.8)` sau khi build (dev-guard pattern của
      `zones.js:139-152` — city.js chạy guard tương tự cho mọi điểm
      mục 6/8/11).
- [ ] POI mục 11 = vị trí mesh interact missions.js = dialogue STORY.md.
- [ ] Fog 0.026 (atmosphere) ↔ ngân sách nhìn 70 m ↔ silhouette cityfill
      phủ đến 90 m.
- [ ] Cap zombie 60 (waves) = pool 60 (main.js shared array).

— HẾT PHẦN THẾ GIỚI · docs/WORLD.md · Phần 1 "ĐÊM THỨ 30" —
