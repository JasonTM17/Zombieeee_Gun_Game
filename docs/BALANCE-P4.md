# Gun Game — CÂN BẰNG GUN GAME 2.0 (P4) — docs/BALANCE-P4.md

> Integrator P4, theo khung docs/EXPANSION-P4.md (nhiệm vụ 5: "giá nâng cấp
> 250/500/1000 hợp chuỗi tiền hiện tại; endless wave scaling không phá cap 60").
> Nguồn số: đọc trực tiếp từ code và từ docs/BALANCE.md (mô hình thu nhập P3
> — cùng các giả định, KHÔNG đo lại). Phương pháp giống BALANCE.md: phân tích
> từ số liệu trong code + kiểm chứng hành vi bằng smoke headless chạy module
> thật (170/170 checks P4 + 73/73 checks hồi quy P1–P3 — xem §5).
> **KHÔNG có buổi chơi thật nào chạy trong môi trường tích hợp** (cần WebGL +
> pointer lock + input người). Kết quả: **không đổi số nào** — bảng nâng cấp
> 250/500/1000 khớp chuỗi tiền hiện có ở mọi mốc; endless giữ nguyên cap 60
> qua đúng đường defer có sẵn.

---

## 1. Chuỗi tiền vs giá nâng cấp (§4 của hợp đồng — P4-K7)

### 1.1 Chi phí nâng cấp

| Khoản | Số (nguồn) |
|---|---|
| 1 track, đủ 3 cấp | 250 + 500 + 1000 = **1750** (`shop.js` UPGRADE_PRICES) |
| 1 súng, đủ 3 track | 1750 × 3 = **5250** |
| Full 7 súng maxed | 5250 × 7 = **36 750** |

So với mua súng (smg 400 / sniper 800 / minigun 1500 / grenade 1200 —
`shop.js` CATALOG): một track full (1750) đắt hơn minigun — nâng cấp là
"money sink" dài hạn, đúng vai: không phá quyền mua súng mới trước.

### 1.2 Đối chiếu mốc thu nhập (mô hình BALANCE.md §1.2 — cùng giả định)

| Mốc | Tiền có được (BALANCE.md) | Mua gì trước | Còn dư cho nâng cấp |
|---|---|---|---|
| Xong m1 | ~2 100 | smg (400) | ~1 700 → pistol dmg×2 (750) + shotgun dmg×1 (250) hoặc 1 track gần full |
| Xong m3 | ~7 400 | + sniper (800), minigun (1500) | ~3 700 → 2 track full (3500) |
| Xong m6 | ~16 900 | full arsenal 3900 + grenade 1200 | ~11 800 → 6 track full, hoặc rải |
| Trước Origin (xong m9) | ~25 000 | arsenal 3900 | ~21 000 → 12 track full (vũ khí chính + dự phòng), dư cho đạn/medkit |

Kịch bản bảo thủ của BALANCE.md (0 headshot, ~60% kill ước lượng) vẫn đạt
mọi mục tiêu mua súng cũ; nâng cấp nằm NGOÀI các mục tiêu frozen đó nên chỉ
cạnh tranh phần dư — phần dư lớn nhất rơi đúng lúc cần (m6+). **Kết luận:
250/500/1000 hợp chuỗi tiền, không sửa.**

- NG+ giữ tiền (P3-K15) → quân "maxed" tích lũy qua các vòng NG+; 36 750
  (full max) là đích đa-vài-ván, không phải mục tiêu 1 ván — chủ ý.
- Không auto-save khi mua nâng cấp (P4-K7): nâng cấp vào save ở lần
  mission-complete/wave-clear kế — mất tiến trình giữa 2 lần lưu chỉ mất số
  nâng cấp mua trong ~1 nhiệm vụ, chấp nhận theo hợp đồng (ghi README).
- Kill money trong Sinh Tồn: không thưởng nhiệm vụ, kill ~70$/con × dãy
  (12 → 28 → 48 con/wave) ≈ 840–3 360$/wave → track đầu tiên trong 1–2 wave,
  nhịp sink tương đương story. Giá không đổi.

## 2. Endless wave scaling vs cap 60 (P4-K8)

Composition endless (`waves.js` composition): `total = 8 + n×4`, runner ≥ 2
(30%), brute `1 + floor((n−3)/5)` từ wave 3.

| Wave | total | Sống đồng thời tối đa |
|---|---|---|
| 1 | 12 | 12 |
| 5 | 28 | 28 (+ boss? chưa — boss từ 8) |
| 8 | 40 | 40 + 1 boss = 41 |
| 13 | 60 | **60 = đúng cap** |
| ≥ 14 | 64+ | **cap 60** — dư defer trong queue, KHÔNG drop |

- `MAX_CONCURRENT = 60` (`waves.js`, bất biến P1) giữ nguyên; `spawnOne` trả
  false khi đầy → queue giữ zombie, thử lại frame kế (defer — nhánh có sẵn,
  P4-K8 "cap spawn theo cap cũ"). Wave ≥ 14 chỉ kéo dài thời gian xuất hiện,
  không tăng số đơn cùng lúc → **ngân sách hiệu năng không đổi** (60
  Zombie.update/frame là trần được P1 chứng nhận).
- Điểm rơi thực tế: tốc độ kill của người chơi (~1 con/2–3 s theo
  BALANCE.md §3) nhỏ hơn tốc độ defer-xả → chiều ngang màn hình không bao giờ
  vượt 60 đơn. Boss (từ wave 8, mỗi wave đúng 1 — P4-K10) nằm trong `tracked`
  → tính vào cap, không vượt.
- Intermission 10 s giữ nguyên → nhịp ~45–75 s/wave đầu, dài dần khi queue
  defer. Chết ở wave 10–15 là kỳ vọng cân bằng của chế độ (best mặc định 0).
- Điểm (P4-K11): walker 10 / runner 15 / brute 40 / boss 200 / headshot ×1.5.
  Kill tiền (economy) chạy SONG SONG điểm (endless riêng) — không can thiệp.

## 3. Độ khó + cộng dồn NG+ (P4-K15)

| Preset | hp | dmg | density (gap ÷) |
|---|---|---|---|
| easy | ×0.75 | ×0.7 | ×0.8 → gap ×1.25 (thưa hơn) |
| normal | ×1 | ×1 | ×1 |
| hard | ×1.35 | ×1.3 | ×1.2 → gap ×0.833 (dày hơn) |

- Walker hp hard = 135 (đã verify smoke: `z.hp === 135`), dmg 19.5;
  easy 75 / 10.5. Density vào `nextGap` NGOÀI single-winner P1 × bloodmoon
  (đúng P2-K8): `finalGap = winner × (bloodmoon ? 0.5 : 1) × (1 / densityMul)`.
- **Cộng dồn NG+** (nhân nhau, FROZEN): walker hard+NG+ = round(round(100×1.35)
  ×1.25) = **169** — rifle (DPS 180) vẫn ~1 phát/giây thân; không đơn nào
  "kitable-thất-bại". Runner NG+ hard speed 5.5 vẫn dưới sprint 7.2.
- **Origin**: công thức hợp đồng `round(3000 × hpMul × (ngPlus ? 1.25 : 1))`
  → hard+NG+ = **5063**. Biên bảo thủ 25–40 dps (BALANCE.md §2.3): phase pool
  1688 máu/phase → 42–68 s/phase < trần 90 s ✓; biên thực 120–200 dps ≈ 8–14 s
  + 2 transition 1.5 s + rise 2.5 s. Ràng buộc "không phase nào quá 90 s" giữ
  được ở cả 2 biên → không đổi số Origin.
- Origin dmg: không có field `dmg` phẳng (bảng dmg theo từng đòn trong phase
  constants) — hệ số dmgMul KHÔNG áp (contract "nếu có" — guarded no-op).
  Nói cách khác: ở Khó, đòn Origin vẫn base 30/35/15 — đã ghi nhận ở đây như
  hành vi chủ ý của hợp đồng, không phải bỏ sót.

## 4. Các thay đổi code của P4 liên quan cân bằng — tổng hợp

| # | File | Thay đổi | Lý do cân bằng |
|---|---|---|---|
| 1 | `src/player/weapons.js` | upgrades 0..3 + applyUpgrades (dmg ×1.2/lvl, mag floor ×1.25/lvl, reload ×0.88/lvl) | Bảng FROZEN P4-K6 — def gốc giữ nguyên số |
| 2 | `src/systems/shop.js` | UPGRADE_PRICES [250,500,1000] + "upg:{w}:{t}" | P4-K7 — khớp chuỗi tiền (§1 trên) |
| 3 | `src/zombies/waves.js` | composition endless + boss ngẫu nhiên wave ≥ 8 + applyDifficulty + density vào gap | P4-K8/K10/K15 — cap 60 không đổi (§2 trên) |
| 4 | `src/main.js` | freshRun re-seed "settings-changed" {difficulty} + ng-plus re-dispatch trước createOrigin + Origin overwrite round(3000×hpMul×ngPlus) | Fix tích hợp: giữ preset qua mỗi reset (số không đổi, chỉ bảo đảm hệ số ĐÚNG được áp); Origin đạt đúng công thức hợp đồng mọi kịch bản |
| 5 | `src/core/settings.js` | difficulty "easy"/"normal"/"hard" (mặc định normal) | P4-K18 — integrator hoàn thiện gap Builder D |

Không đổi: giá shop 6 mục, REWARDS (kể cả origin 2000), quota need,
DISTRICT_RECTS/12 cổng, MAX_CONCURRENT 60, INTERMISSION 10 s, số phase/hp
gốc Origin, headshotMult các súng.

## 5. Đo đạc thực tế — những gì ĐÃ và CHƯA chạy

| Kiểm tra | Cách chạy | Kết quả |
|---|---|---|
| `node --input-type=module --check` × 16 file touched + builder | sweep | 16/16 OK |
| Smoke P4 (module thật, mock localStorage + fake DOM/stubs): save schema + 4 trigger tự động + corruption-guard + restore §3.4 (tiền/súng/upgrades/nhiệm vụ/cổng) + công thức nâng cấp (25→40, ×0.88, floor mag) + shop ids (maxed/no-money/owned/unknown) + endless (composition 12/12…, brute wave 3, bloodmoon wave 5 qua forceEvent, boss wave 8 đúng 1 ngẫu nhiên, điểm 10/15/40/200/×1.5, best + tie rule + profile mirror, endless-over) + profile (kill/head/boss/death/money/playtime, KHÔNG reset xoá) + 12 thành tựu (điều kiện + idempotent + persist) + độ khó (135/75/19.5, NG+ 169, Origin 5063) + DEBUG_KEYS + static wire main.js/menus/hud/input/combat | `node .smoke-p4.mjs` (harness tạm, đã xóa sau chạy) | **170/170 pass** |
| Hồi quy P1–P3: economy REWARDS + headshot ×1.5 + bloodmoon ×2 + origin 2000(×2), chain m1..m10 qua completeObjective + reward 300..600 = 3900 + gate-open, story waves byte-identical (wave 1 = 8 walker, boss cycle butcher→spitter, wave 5 chia đôi), events forceEvent + bloodmoon exclusion, weapons reset/def bất biến/sniper ×3, gamestate score ×1.5 + pause-by-reason + NG+ ×1.25/×1.1, Origin lifecycle (rise/bất tử/transition/P2/P3/kill), debug hook legacy+P4, main.js import bindings | `node .smoke-regression.mjs` (harness tạm, đã xóa sau chạy) | **73/73 pass** |
| **Buổi chơi thật (đo phút/wave, đo DPS hard, cảm nhận gap ×1.25)** | cần WebGL + pointer lock + người chơi | **KHÔNG CHẠY ĐƯỢC** trong môi trường tích hợp — mọi số trên là mô hình từ code + smoke headless. Người chạy build nên: chơi 1 ván Sinh Tồn tới wave ≥ 8 (kiểm boss ngẫu nhiên + bloodmoon wave 5/10), bấm TIẾP TỤC sau khi chết giữa m3+ (so tiền/súng/nhiệm vụ), setDifficulty("hard") rồi `__game.spawnZombie()` (hp 135). Chỉ cần can thiệp số nếu một mốc rớt — các đòn bẩy hợp đồng (UPGRADE_PRICES, hệ số khó) là hằng FROZEN, sửa phải qua hợp đồng mới. |
