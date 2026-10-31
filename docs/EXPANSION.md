# Gun Game — HỢP ĐỒNG MỞ RỘNG (EXPANSION)

> Tài liệu này là **hợp đồng DUY NHẤT** cho các builder triển khai 3 tính năng
> mở rộng. Nó chép LẠI nguyên văn đặc tả từ kiến trúc sư; mọi con số trong đây
> là bắt buộc, KHÔNG được tắt gọn hay "tối ưu" lại.
>
> **Nguyên tắc số 1: game đang HOẠT ĐỘNG ĐẦY ĐỦ (10 commit). Tuyệt đối GIỮ
> nguyên hành vi cũ đang chạy đúng.** Chỉ thêm/mở rộng đúng những điểm đặc tả
> ghi rõ. Mọi API cũ đều phải tiếp tục hoạt động như trước sau khi mở rộng.
>
> Quy tắc chung:
> - Chỉ dùng `three` (đã có trong dependencies). **KHÔNG thêm package nào.**
> - Dự án Vite + ES modules thuần, `"type": "module"`; giữ đúng phong cách
>   JSDoc hợp đồng đầu mỗi file như các file hiện có.
> - **Không chạy `git commit`** — owner tự commit.

---

## MỤC LỤC

- [Kiến trúc hiện tại (phụ lục xác minh)](#kiến-trúc-hiện-tại-đã-xác-minh)
- [TÍNH NĂNG A — Tự nạp đạn](#tính-năng-a--tự-nạp-đạn-sửa-srcplayerweaponsjs)
- [TÍNH NĂNG B — Tiền + Cửa hàng](#tính-năng-b--tiền--cửa-hàng)
- [TÍNH NĂNG C — Khu vực di chuyển + Boss](#tính-năng-c--khu-vực-di-chuyển--boss)
- [Tích hợp gamestate / main / README](#gamestatejs--mở-rộng)
- [Lưu ý tích hợp đã biết](#lưu-ý-tích-hợp-đã-biết)

---

## TÍNH NĂNG A — TỰ NẠP ĐẠN (sửa `src/player/weapons.js`)

Ngay sau phát bắn làm mag về 0: nếu `reserve > 0` → **tự động gọi reload sau
0.35 s** (một lần, không lặp).

Khi `tryFire` với `mag = 0` và `reserve > 0` → **phát tiếng click khô + tự
reload ngay** thay vì chỉ khô đạn.

Khi `mag = 0` **VÀ** `reserve = 0` → **giữ hành vi cũ** (khô đạn, không tự
nạp).

Trạng thái `reloading` đã có sẵn cho HUD — dùng lại, không thêm trạng thái
mới.

Chi tiết hiện có liên quan (đã xác minh khi đọc code — builder weapons tuân
thủ):

- `weapons.js` hiện chặn bắn khi `!active.reloading && cooldown <= 0` và chỉ
  bắn khi `active.mag > 0` (`src/player/weapons.js:329-332`); reload thủ công
  qua `reload()` (`src/player/weapons.js:269-275`) chỉ chạy khi
  `!reloading && mag < magSize && reserve > 0`.
- `switchTo(i)` hủy reload đang chạy (`src/player/weapons.js:256-267`) —
  auto-reload pending cũng phải bị hủy/không kích hoạt nữa khi đổi súng hoặc
  khi weapon không còn cần nạp.
- Reserve của pistol là `Infinity` — luôn `> 0`, mọi tính toán phải an toàn
  với `Infinity`.

---

## TÍNH NĂNG B — TIỀN + CỬA HÀNG

### B1. `src/systems/economy.js` (MỚI)

```js
createEconomy(bus) → { get() → number, add(n), spend(n) → boolean, reset() }
```

- Nghe `"zombie-killed"` trên bus: cộng thưởng
  **walker 50 / runner 75 / brute 200**, **headshot +50%** (làm tròn số
  nguyên). Thưởng theo **type**, không theo trường `score` (score của zombie
  thường là điểm 100/150/400 — khác tiền).
  Boss (tính năng C) chết cũng phát `"zombie-killed"` → bảng thưởng tiền của
  economy có thêm: **butcher 1000 / spitter 800 / screamer 700 / golem 1500**.
- Mỗi lần thay đổi phát **`"money-changed"` `{money, delta}`** trên bus
  (`money` = số dư mới, `delta` = số âm/dương vừa thay đổi).
- `spend(n)` → `true` khi trừ được (đủ tiền), `false` khi không đủ (KHÔNG trừ).
- `reset()` về 0.

### B2. `src/systems/shop.js` (MỚI)

```js
createShop(bus, economy, weapons, player)
  → { catalog, buy(id) → {ok, reason?}, owned() → string[] }
```

Catalog:

| id        | Giá  | Ý nghĩa |
|-----------|------|---------|
| `smg`     | 400  | Súng mới (xem B4) |
| `sniper`  | 800  | Súng mới (xem B4) |
| `minigun` | 1500 | Súng mới (xem B4) |
| `grenade` | 1200 | Súng mới — bắn đạn nổ (xem B5) |
| `ammo`    | 150  | Nạp **ĐẦY reserve mọi súng sở hữu** (mua lại được nhiều lần) |
| `medkit`  | 200  | Hồi **đầy 100 HP** (mua lại được nhiều lần) |

- **Không mua trùng súng đã sở hữu.**
- Không đủ tiền → `{ok: false, reason: "no-money"}`.
- `pistol` / `shotgun` / `rifle` **miễn phí sở hữu từ đầu** như cũ —
  `owned()` ban đầu trả về 3 súng này.

### B3. `src/ui/shop.js` (MỚI) — overlay cửa hàng

Overlay DOM bên trong `#ui` (nhớ bật lại `pointer-events: auto` cho panel —
`index.html` đang đặt `#ui { pointer-events: none }`):

- Tiêu đề **CỬA HÀNG** + số tiền hiện có.
- Lưới thẻ hàng: tên EN/VI qua `i18n.t`, 1 dòng chỉ số, giá, nút **MUA**.
  Nút **mờ + không bấm được** khi không đủ tiền hoặc đã sở hữu; hiện
  **"ĐÃ SỞ HỮU"** trên thẻ đã sở hữu.
- Mở/đóng khi bus phát **`"shop-toggle"`**; khi mở phát **`"shop-open"`**,
  khi đóng phát **`"shop-closed"`** (gamestate pause theo lý do — xem phần
  gamestate).
- **Esc/B khi shop mở = đóng shop.**

### B4. 4 SÚNG MỚI (mở rộng bảng defs + viewmodel low-poly từ primitive +
âm thanh synth riêng trong `src/player/weapons.js`; phím 4/5/6/7)

| id        | Giá  | Chế độ | Thông số |
|-----------|------|--------|----------|
| `smg`     | 400  | auto 850 vòng/phút | mag 32, dmg 11, spread 0.035 rad, reserve 160 |
| `sniper`  | 800  | bolt-action 1.4 s giữa 2 phát | mag 5, dmg 110, **HEADSHOT ×3** (xem B6), spread 0.002, reserve 25 |
| `minigun` | 1500 | **quay nòng 0.6 s trước khi ra đạn**, auto 1100 vòng/phút | mag 150, dmg 8, spread 0.05, reserve 300 |
| `grenade` | 1200 | pump 1.1 s | mag 4, reserve 12, **bắn đạn nổ** (xem B5) |

- Súng mới **PHẢI MUA qua shop**; pistol/shotgun/rifle miễn phí sở hữu từ đầu
  như cũ.
- **Đổi súng (phím số + con lăn) chỉ luân chuyển trong các súng ĐÃ SỞ HỮU.**

### B5. `src/systems/explosives.js` (MỚI)

```js
createExplosives(scene, camera, zombies, particles, audio, bus)
  → { fire(origin, dir), update(dt), reset() }
```

Đạn grenade:

- Projectile có **trọng lực nhẹ**.
- **Nổ khi chạm zombie / mặt đất, hoặc sau 1.2 s.**
- **Bán kính nổ 4 m, dmg 90 giảm tuyến tính về 0 ở mép vùng** (theo khoảng
  cách từ tâm nổ).
- Hiệu ứng **particles + flash PointLight**.
- **Camera shake nhẹ** (jitter pitch/yaw tắt dần 0.3 s).
- Phát **`"explosion"` `{position}`** trên bus.

### B6. `src/systems/combat.js` MỞ RỘNG (cùng owner với `weapons.js`)

**Headshot multiplier đọc từ weapon def** (mặc định 2; **sniper 3**). Hiện
combat.js dùng hằng số cứng `HEADSHOT_MULT = 2` (`src/systems/combat.js:55`)
— thay bằng lookup từ WeaponState; mọi weapon def cũ không khai báo trường
này giữ hành vi ×2 như cũ.

---

## TÍNH NĂNG C — KHU VỰC DI CHUYỂN + BOSS

### C1. `src/world/zones.js` (MỚI)

```js
createZones(scene, level)
  → { list, unlockForWave(wave) → string[],
      bossAnchorFor(wave) → {zoneId, x, z}, reset() }
```

Bản đồ mở rộng **2 khu** nối arena chính qua **KHOẢNG HỞ trong tường rào**
(mỗi cửa có **khung cổng phát sáng + biểu tượng**):

| id      | Tên       | Kích thước | Vị trí      | Cover                      | Mở sau khi clear |
|---------|-----------|------------|-------------|----------------------------|------------------|
| `north` | "Sân sau" | ~30×24 m   | phía bắc    | thùng gỗ + xe hỏng         | wave 2           |
| `east`  | "Kho"     | ~24×30 m   | phía đông   | kệ hàng + container        | wave 4           |

Mỗi khu có:

- `bounds` rect (`minX, maxX, minZ, maxZ`),
- **1 `gateWaypoint`** (điểm nằm **TRONG** khoảng hở cổng để dẫn đường),
- **2–3 `spawnPoints` riêng**,
- **`bossAnchor`**.

Khi mở: phát **`"zone-unlocked"` `{id, name}`** (HUD toast).
`unlockForWave(wave)` **idempotent**.

> Ghi chú chữ ký: `createZones(scene, level)` không có tham số bus — module
> **import `bus` trực tiếp từ `../systems/gamestate.js`** (đúng pattern
> `src/core/input.js:44` đã dùng).

### C2. `src/world/level.js` MỞ RỘNG

- Thêm **sàn / tường / props của 2 khu + colliders tương ứng + spawnPoints**.
- Tường rào **chừa ĐÚNG 2 cửa** tại vị trí cổng.
- Expose **`getGateWaypoints()` → `[{x, z}]`**.
- **Giữ nguyên API cũ** (`isBlocked`, `spawnPoints`, `colliders`, `dispose`…).
- Lưu ý: `isBlocked` hiện trả `true` cho mọi điểm ngoài ±30 m
  (`src/world/level.js:314`) — mở rộng bound check theo 2 khu mới, nếu không
  zombie/player sẽ không đi qua cổng được.

### C3. `src/zombies/zombie.js` MỞ RỘNG — dẫn đường qua cổng

- Nếu **đoạn thẳng tới player bị chặn** (sample `isBlocked` **như LOS hiện
  có** — `_hasLineOfSight`, `src/zombies/zombie.js:321-334`), zombie **đi về
  `gateWaypoint` gần player nhất trước rồi mới tới player** (2 bước, rẻ).
- **Khi cùng khu thì hành vi cũ nguyên vẹn.**
- Gate waypoints lấy qua `level.getGateWaypoints()` (C2).

### C4. `src/zombies/bosses.js` (MỚI) — 4 class boss

Mỗi boss giữ **CÙNG mặt ngoài với zombie thường**:

> `alive`, `hp`, `group`, `position`, `update(dt, player, level, others)`,
> `takeDamage(d, headshot) → boolean`, `dispose()`, mesh có
> `userData.part` `"head"`/`"body"`, chết phát
> **`"zombie-killed"` `{type, score, headshot, position}`**

extends / compose từ `Zombie` nếu tiện.

| Boss | HP (nhân `1 + wave/20`) | Tốc độ | Đòn đặc trưng |
|------|--------------------------|--------|----------------|
| `butcher` | 1200×(1+wave/20) | 2.0 | Màu đỏ thẫm + dao lớn: **mỗi 6 s dồn lực 0.8 s** (phát sáng đỏ, tiếng gầm) rồi **CHƠI THẲNG 14 m**; chạm player **40 dmg + hất lùi**; cận chiến **35 dmg** |
| `spitter` | 800×(1+wave/20) | 2.6 | **GIỮ khoảng cách 10–16 m** (đi lùi nếu player lại gần); **mỗi 2.5 s nhổ cầu acid** (projectile parabol — **dùng explosives nếu hợp, tự quản nếu không**); trúng **18 dmg + để lại vũng acid 2 m tồn tại 4 s gây 6 dmg/s** |
| `screamer` | 600×(1+wave/20) | 3.2 | **Mỗi 8 s GÀO** — vòng sóng trắng lan từ boss, player trong **8 m bị đẩy lùi 4 m + 10 dmg**; mỗi lần gào **triệu hồi 3 zombie** (walker, hoặc **runner nếu wave ≥ 6**) quanh vị trí mình (**qua cùng cơ chế spawn của waves nếu truy cập được, không thì tự `new Zombie` + phát `"zombie-spawned"`**) |
| `golem` | 2000×(1+wave/20) | 1.2 | **GIẢM 25% sát thương nhận (trong `takeDamage`)**; **mỗi 6 s nếu player < 6 m → ĐẬP ĐẤT** — vòng sóng bán kính lan **8 m trong 0.6 s**, player bị quét **30 dmg + hất bay**; thân đá xám, **scale lớn nhất** |

**Boss chết:**

- Thưởng tiền lớn qua `"zombie-killed"`: **butcher 1000 / spitter 800 /
  screamer 700 / golem 1500** — gamestate/economy nhân theo thưởng này.
- **Rơi CHẮC 1 medkit và 1 ammo** (phát event hoặc gọi `pickups.spawn` nếu
  truy cập được).

### C5. `src/zombies/waves.js` MỞ RỘNG

- `createWaves` nhận **thêm tham số tuỳ chọn `zones`**.
- Wave chia hết cho **5 = BOSS WAVE**:
  - Giảm **NỬA minion** (spawn dồn trong **6 s đầu**).
  - Sinh **1 boss** tại `bossAnchorFor(wave)` của khu đã mở, **chu kỳ
    butcher → spitter → screamer → golem → lặp**.
  - Phát **`"boss-spawned"` `{type, zoneId, hp}`**.
  - **`"wave-clear"` chỉ khi boss và minion đều hết.**

### C6. `src/ui/hud.js` MỞ RỘNG

- **Thanh máu BOSS** giữa màn hình (tên boss EN/VI + thanh đỏ đậm; hiện khi
  có boss sống — nghe **`"boss-spawned"`**, ẩn khi nghe `"zombie-killed"` của
  boss).
- **SỐ TIỀN** góc trên trái cạnh máu: `"TIỀN $xxx"` — nghe **`"money-changed"`**.
- **TOAST "KHU VỰC MỚI MỞ"** khi nghe **`"zone-unlocked"`**.
- **MŨI TÊN chỉ hướng boss** khi boss ngoài vùng nhìn (vòng quanh crosshair
  xoay theo hướng 2D tới boss — **main cung cấp vị trí boss qua update**).
- Gợi ý **"B — CỬA HÀNG"** hiển thị trong thời gian nghỉ giữa các wave.

### C7. `src/core/input.js` MỞ RỘNG

- Phím **B** phát **`"shop-toggle"`** trên bus.
- Phím **4/5/6/7** forward qua cơ chế **`wasPressed` hiện có** cho weapons
  đọc (`wasPressed` đã nhận mọi `KeyboardEvent.code` — `src/core/input.js:226-232`;
  weapons.js phải poll `Digit4`…`Digit7` tương tự `Digit1..3` hiện có,
  `src/player/weapons.js:310-316`).

### C8. i18n

Mỗi module mới **TỰ `registerBundle({en:{...}, vi:{...}})`** phần chữ của
mình **từ file của nó** (shop, boss names, zone names, toast, HUD labels) —
**KHÔNG sửa dict của module khác**.

---

## `gamestate.js` MỞ RỘNG — pause theo LÝ DO

- Pause theo lý do — **tập `reasons` (mảng/Set)**: `"shop" | "user"`.
- **`paused ⇔ reasons khác rỗng`.**
- Thêm **`addPause(reason)` / `removePause(reason)`**.
- **Esc vẫn toggle reason `"user"` như cũ.**
- Nghe **`"shop-open"` → `addPause("shop")`**, **`"shop-closed"` →
  `removePause("shop")`**.
- Fresh run **reset tiền về 0** (nghe event restart hoặc được main gọi
  `economy.reset()`).

---

## `main.js` MỞ RỘNG — wire toàn bộ

Wire: **economy, shop, shop UI, explosives, zones, bosses vào waves, HUD
mới**.

Debug API **BỔ SUNG** vào `window.__game`:

| Method | Ý nghĩa |
|--------|---------|
| `giveMoney(n)` | cộng n tiền |
| `buyWeapon(id)` | mua súng qua shop |
| `toggleShop()` | mở/đóng cửa hàng |
| `buy(id)` | mua item bất kỳ qua shop |
| `spawnBoss(type, inFront)` | sinh boss; `inFront` → sinh **trước camera ~12 m** |
| `damageBoss(n)` | gây n dmg lên **boss đang sống** |
| `teleport(zoneId)` | đặt player vào **tâm khu** |
| `unlockZone(id)` | mở khoá khu |
| `getState()` **BỔ SUNG** | thêm `{money, boss: {type, hp, maxHp} \| null, unlockedZones: string[], ownedWeapons: string[]}` |

> Lưu ý: `src/core/debug.js` có danh sách `DEBUG_KEYS` cứng 8 phương thức
> (`src/core/debug.js:44-53`) — `register(api)` bỏ qua key lạ, nên thêm key
> mới vào `DEBUG_KEYS` (và JSDoc) khi bổ sung API.

---

## `README.md` cập nhật (cuối cùng, do fixer viết)

- Bảng giá shop.
- Bảng 4 boss (đòn đặc trưng + **cách né**).
- Bản đồ 2 khu.
- Auto-reload.
- Phím **B**.

---

## Kiến trúc hiện tại (đã xác minh)

Phần phụ lục này là thông tin tham khảo builder **đã xác minh bằng cách đọc
code** ngày 2026-10-31 — không thay thế đặc tả bên trên.

### Chữ ký factory hiện có (frozen — không đổi trừ nơi đặc tả ghi rõ mở rộng)

| Module | Chữ ký | Trả về |
|--------|--------|--------|
| `src/core/engine.js` | `createEngine(canvas)` | `{scene, camera, update, render}` |
| `src/systems/gamestate.js` | `createGamestate(bus, settings)`; **export `bus`** | gamestate |
| `src/core/input.js` | `createInput(canvas, settings)` (import bus từ gamestate.js) | `{isDown, consumeMouseDelta, consumeClick, wheelDir, wasPressed, lockPointer, isLocked}` |
| `src/world/level.js` | `createLevel(scene)` | `{colliders, isBlocked(x,z,r=0.4), spawnPoints, dispose}` |
| `src/systems/particles.js` | `createParticles(scene)` | `{spawnBlood, spawnMuzzle, spawnSpark, update, dispose}` |
| `src/systems/pickups.js` | `createPickups(scene, bus)` | `{spawn(position, kind), update(dt, playerPos), reset}` |
| `src/player/controller.js` | `createPlayer(scene, camera, input, level, bus)` | `{position (feet), velocity, hp, alive, update, damage, reset}` |
| `src/player/weapons.js` | `createWeapons(camera, input, audio, bus)` | `{list, current, update, switchTo, reload, reset, getState}` |
| `src/systems/combat.js` | `createCombat(camera, scene, zombies, particles, audio, bus)` | `{shoot(weapon)}` |
| `src/zombies/waves.js` | `createWaves(scene, level, bus)` *(+ zones tuỳ chọn theo C5)* | `{update, reset}` |
| `src/zombies/zombie.js` | `class Zombie(scene, type, position, bus)` | instance |
| `src/ui/hud.js` | `createHud(container, bus, audio, i18n)` | `{update, show, flashDamage}` |
| `src/ui/menus.js` | `createMenus(container, bus, settings, i18n)` | `{show}` |
| `src/core/audio.js` | `createAudio(settings)` | các method synth |
| `src/core/debug.js` | `createDebugHook()` | `{register(api)}` → `window.__game` |

### Thứ tự khởi tạo trong `main.js` (frozen)

```
engine → settings → i18n → audio → input → level → atmosphere → particles
→ pickups → player → weapons → combat → waves → hud → menus → gamestate
→ debug.register
```

### Sự kiện bus hiện có (từ bảng event trong `src/systems/gamestate.js`)

| Event | Payload | Phát bởi → Consume bởi |
|-------|---------|------------------------|
| `pause-toggle` | `{}` | input (Esc/P) → gamestate |
| `player-hurt` | `{hp}` | player → main → audio |
| `player-died` | `{}` | player → gamestate |
| `footstep` | `{}` | player → main → audio |
| `fire` | `{weapon}` | weapons → main → combat.shoot |
| `spread` | `{value}` | weapons → hud |
| `hit` | `{headshot, killed}` | combat → hud |
| `zombie-killed` | `{type, score, headshot, position}` | zombie/boss → gamestate (score ×1.5 nếu headshot), pickups (drop roll), hud (kill feed), **economy (tiền — mới)** |
| `zombie-spawned` | `{zombie}` | waves/screamer → main (push shared array) |
| `zombie-despawned` | `{zombie}` | zombie corpse / waves.reset → main (splice) |
| `wave-start` / `wave-clear` | `{n}` | waves → gamestate / hud |
| `pickup` | `{kind: "ammo"\|"health"}` | pickups → player, weapons, main → audio |
| `state-changed` | `{state, score, highScore}` | gamestate → main, menus, input |
| `ui-play` / `ui-resume` / `ui-restart` / `ui-quit` | `{}` | menus → main |
| `settings-changed` | `{patch}` | menus → main (volume), hud (lang) |

### Sự kiện bus MỚI do bản mở rộng thêm

| Event | Payload | Phát bởi → Consume bởi |
|-------|---------|------------------------|
| `money-changed` | `{money, delta}` | economy → hud (tiền) |
| `shop-toggle` | `{}` | input (B) / shop UI (Esc/B) → shop UI toggle |
| `shop-open` / `shop-closed` | `{}` | shop UI → gamestate (`addPause`/`removePause("shop")`), shop UI ẩn/hiện pointer lock |
| `explosion` | `{position}` | explosives → hud/audio nếu cần |
| `zone-unlocked` | `{id, name}` | zones → hud (toast) |
| `boss-spawned` | `{type, zoneId, hp}` | waves → hud (thanh máu boss) |
| `zombie-spawned` | `{zombie}` | (screamer triệu hồi cũng dùng sự kiện này) |

### Số liệu hiện tại cần giữ nguyên

- Zombie thường: walker 100 HP / 2.2 m/s / 15 dmg / score 100; runner 60 HP /
  5.0 / 10 / 150; brute 400 HP / 1.4 / 35 / 400.
- Súng cũ: pistol semi 0.1 s, 25 dmg, mag 12, reserve ∞, reload 1.2 s;
  shotgun pump 0.9 s, 8×12 dmg, mag 6, reserve 24, reload 2.0 s; rifle auto
  600 rpm, 18 dmg, mag 30, reserve 90, reload 1.8 s. Headshot ×2 (default).
- Wave: total `5 + n×3`; brute từ wave 4 (`1 + floor(n/5)`), runner từ wave 2
  (~25%), còn lại walker; spawn đầu 1.0–2.5 s, gap 0.8–1.5 s, nghỉ 10 s;
  spawn point cách player ≥ 15 m.
- Arena: sàn 60×60 m (`HALF = 30`), tường cao 4 m; `isBlocked` circle-vs-AABB.
- Player: đi 4.5 m/s, sprint ×1.6, nhảy 7 m/s, gravity 20, eye 1.7, radius 0.4.

---

## Lưu ý tích hợp đã biết (builder tự xử lý, không phá hành vi cũ)

1. **Esc khi shop mở**: trình duyệt thường nuốt Esc để thoát pointer lock;
   `input.js` sẽ phát `"pause-toggle"` qua `pointerlockchange`
   (`src/core/input.js:174-182`). Khi shop mở, Esc/B phải **đóng shop**
   (phát `"shop-closed"`) chứ KHÔNG toggle pause "user" — builder shop UI +
   input/gamestate phối hợp để không đẻ lại reason `"user"` mồ côi.
2. **Đổi súng qua con lăn** hiện cứng `% 3`
   (`src/player/weapons.js:313-316`) — phải chuyển sang luân chuyển trong
   danh sách súng **đã sở hữu**.
3. **Grenade không đi qua hitscan**: `"fire"` của grenade phải route tới
   `explosives.fire(origin, dir)` (main.js nhận biết qua weapon) — không
   gọi `combat.shoot` cho đạn nổ.
4. **Minigun spin-up 0.6 s**: trạng thái quay nòng phải reset khi thả chuột /
   đổi súng / reload.
5. **`isBlocked` ngoài arena** trả `true` (`src/world/level.js:314`) — mở
   rộng range check cho 2 khu mới; zombie pathing qua cổng (C3) phụ thuộc
   điều này.
6. **Boss trong shared zombies array**: main push/splice qua
   `"zombie-spawned"`/`"zombie-despawned"` như zombie thường để combat
   raycast trúng boss (mesh cần `userData.part` + `userData.zombie`).
