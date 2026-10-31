# Gun Game — ĐÊM THỨ 30 · KỊCH BẢN CỐT TRUYỆN (Phần 1)

> Tài liệu này là **hợp đồng nội dung DUY NHẤT** cho toàn bộ chữ xuất hiện trong
> cốt truyện "Đêm thứ 30": 4 slide intro, 9 nhiệm vụ (m1…m9), outro, tên khu,
> tên người nói, tên vật phẩm và mọi key i18n. Builder **chép nguyên văn** từng
> dòng EN/VI trong đây — KHÔNG viết lại, KHÔNG thêm lời thoại mới mà không có
> trong hợp đồng này.
>
> Tông bắt buộc: **tối, ít chữ, đúng chất zombie — KHÔNG sến.** Không chắc
> chắn thì giữ câu ngắn hơn.

---

## MỤC LỤC

- [0. Quy ước đọc tài liệu](#0-quy-ước-đọc-tài-liệu)
- [1. Bối cảnh & quy tắc giọng văn (canon)](#1-bối-cảnh--quy-tắc-giọng-văn-canon)
- [2. INTRO — 4 slide đầu game (chế độ Cốt Truyện)](#2-intro--4-slide-đầu-game-chế-độ-cốt-truyện)
- [3. 9 nhiệm vụ m1…m9](#3-9-nhiệm-vụ-m1m9)
- [4. OUTRO — cuối nhiệm vụ 9](#4-outro--cuối-nhiệm-vụ-9)
- [5. Chuỗi khoá cổng + quota (bảng tổng hợp)](#5-chuỗi-khoá-cổng--quota-bảng-tổng-hợp)
- [6. Thưởng tiền & balance](#6-thưởng-tiền--balance)
- [7. Key i18n hệ thống + quy ước đặt tên](#7-key-i18n-hệ-thống--quy-ước-đặt-tên)
- [8. Sổ liên tục cho Phần 2 (twist ledger)](#8-sổ-liên-tục-cho-phần-2-twist-ledger)

---

## 0. Quy ước đọc tài liệu

- Mỗi dòng thoại là **một entry** của mảng truyền vào `dialogue.show(lines)`:
  `{ speaker: t("speaker_radio"), text: t("m1_radio_line1") }`. Thứ tự bảng =
  thứ tự phát.
- **Bỏ qua (skip)** bằng click / phím `E` — tới dòng kế; hết dòng thì ẩn hộp
  thoại và chạy callback.
- Dấu `—` và `...` là chủ ý (rè rè sóng, ngắt câu khô) — giữ nguyên.
- Số trong lời thoại luôn là **chữ số** ("20 con", "47 giây") — chất bộ đàm,
  không viết "hai mươi".
- Toàn bộ key là **key phẳng** (không dùng dot-path) vì `i18n.t` ưu tiên
  `hasOwnProperty`; mỗi key **phải có cả EN lẫn VI** trước khi nhúng.
- Placeholder dùng cú pháp `{name}` của `i18n.t` (`src/core/i18n.js`).
- Nguồn hình học: vị trí/kích thước khu thuộc `docs/WORLD.md` + `src/world/city.js`.
  Tài liệu này chỉ ràng buộc **trật tự mở khoá** theo id khu, không ràng buộc
  toạ độ.

## 1. Bối cảnh & quy tắc giọng văn (canon)

- **Ngày thứ 30** kể từ khi dịch bùng phát. Thành phố (~260×260 m, 7 khu) đã
  chết. Đội của người chơi còn lại **một mình họ**.
- Kênh radio quân đội phát lại một lời hứa giải cứu. Trên kênh đó xuất hiện
  thêm một giọng chỉ đạo nhiệm vụ. Bên trong Vùng Cách Ly (chính là thành đấu
  60×60 cũ + north/east) còn một giạng thứ ba — yếu, đứt quãng.
- Thành đấu cũ ở **tâm thành phố** là nơi đội từng dựng trại đầu tiên; giờ bị
  hàn kín thành Tâm Cách Ly — trụ cốt truyện cuối Phần 1.

Ba giọng nói (label hiển thị trong hộp thoại):

| Ngươi nói | Cách nói | Key label |
|---|---|---|
| **Giọng Radio** — giọng quân đội điều phối nhiệm vụ. Lạnh, quy trình, không bao giờ xin lỗi, không giải thích hai lần. | Câu ngắn, mệnh lệnh, toàn chữ số. Gọi người chơi là "ông". | `speaker_radio` |
| **Bạn** — độc thoại nội tâm của người chơi. Khô, hoài nghi, chưa từng quá 12 từ. | Trả đũa một câu, không than vãn. | `speaker_you` |
| **KHÔNG RÕ** — giọng thứ hai, phát từ Tâm Cách Ly. Yếu, đứt quãng, sóng rè. | Câu dở dang với `—` và `...`, gọi người chơi là "anh". | `speaker_unknown` |

Quy tắc viết thêm (kể cả cho Phần 2): không tính từ chỉ cảm xúc, cảm xúc nằm
trong bối cảnh (đèn, khói, tiếng máy); mỗi câu thoại tối đa ~20 từ VI / ~25 từ
EN; không ai thừa nhận sợ hãi.

## 2. INTRO — 4 slide đầu game (chế độ Cốt Truyện)

Chữ trắng trên nền đen, mờ dần, hiện TỪNG SLIDE; thế giới render mờ phía sau.
Mỗi slide 2–3 câu. Phát khi bấm PLAY (chế độ Cốt Truyện), trước khi vào nhiệm
vụ 1. Chế độ **CHƠI TỰ DO bỏ qua 4 slide này**.

| Key | EN | VI |
|---|---|---|
| `intro_s1` | Day 30. The city died last week — what walks its streets now is something else. I still count the days. It's how I remember I'm human. | Ngày thứ 30. Thành phố chết từ tuần trước — thứ đi lại trên phố bây giờ không còn là người. Tôi vẫn đếm ngày. Để còn nhớ mình là người. |
| `intro_s2` | There were six of us. Four went in the first four days. The fifth — last night. | Đội tôi từng có sáu người. Bốn người mất trong bốn ngày đầu. Người thứ năm — tối qua. |
| `intro_s3` | The army channel repeats one sentence, every 47 seconds: "Any survivor, make a signal. Evacuation is waiting." Its green light blinks in the same rhythm — like the heartbeat of something already dead. | Kênh radio quân đội lặp lại đúng một câu, mỗi 47 giây: "Nếu còn người sống, tạo tín hiệu. Giải cứu đang chờ." Đèn xanh nhấp nháy theo đúng nhịp đó — như tim của một thứ đã chết. |
| `intro_s4` | The safehouse still has three generators and one can of fuel. Light all three — power opens the west fence. Everything after that is a job for the gun. | Nhà an toàn còn lại ba máy phát và một can xăng. Bật đủ cả ba — có điện là hàng rào tây mở. Còn lại là việc của súng. |

## 3. 9 nhiệm vụ m1…m9

Mỗi nhiệm vụ: **hội thoại nhận** phát khi bus bắn `mission-start`; **hội thoại
hoàn thành** phát khi bắn `mission-complete` (trước toast tiền). Mục tiêu chỉ
mô tả bằng template ở mục 7 — KHÔNG đọc to.

---

### m1 — "Sáng Đèn" / "Lights On" — khu `safehouse`

**Mục tiêu:** `activate` ×3 (`generator-1`, `generator-2`, `generator-3`).
**Thưởng:** `$300`. **Mở cổng:** safehouse → residential.

Hội thoại nhận (4 dòng):

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m1_radio_line1` | Giọng Radio | Testing this channel... someone actually answered. Strange. Evacuation doesn't take individuals. | Thử sóng đây... có người trả lời thật. Lạ. Giải cứu không nhận cá nhân. |
| `m1_radio_line2` | Giọng Radio | Three generators in that building. Power all of them and I can open the west fence into the residential quarter. | Trong nhà có ba máy phát. Chạy đủ cả ba, tôi mở được hàng rào tây cho ông vào khu dân cư. |
| `m1_you_line1` | Bạn | Since when do generators open gates? | Từ bao giờ máy phát lại mở được cổng? |
| `m1_radio_line3` | Giọng Radio | Since everything else died. | Từ khi mọi thứ khác đều chết. |

Hội thoại hoàn thành (2 dòng):

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m1_done_radio_line1` | Giọng Radio | That's power. West gate is open. Walk or stand there — your call. | Đủ điện rồi. Cổng tây mở. Đi hay đứng đó là quyền của ông. |
| `m1_done_you_line1` | Bạn | Lights on. First thing in this city that works again. | Đèn sáng. Thứ đầu tiên trong thành phố này hoạt động trở lại. |

---

### m2 — "Đường Phố" / "Dead Blocks" — khu `residential`

**Mục tiêu:** `quota residential 20` + `collect supply ×3`.
**Thưởng:** `$325`. **Mở cổng:** residential → commercial.

Hội thoại nhận (4 dòng):

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m2_radio_line1` | Giọng Radio | The residential quarter isn't clean. Put down 20 inside it. Then we talk. | Khu dân cư chưa sạch. Hạ 20 con trong khu đó. Rồi tôi mới nói tiếp. |
| `m2_radio_line2` | Giọng Radio | While you're at it, pick up 3 supply packs from the houses. The living still eat. Even you. | Tiện tay nhặt 3 gói tiếp tế trong các nhà. Người sống vẫn phải ăn. Ông cũng vậy. |
| `m2_you_line1` | Bạn | Are you on the other end of this channel, or just a tape? | Ông là người ở đầu dây bên kia, hay chỉ là một cuốn băng? |
| `m2_radio_line3` | Giọng Radio | 20 first. Then ask. | Hạ 20 con trước. Hỏi sau. |

Hội thoại hoàn thành (2 dòng):

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m2_done_radio_line1` | Giọng Radio | 20. East gate is open — into the commercial street. You work faster than you look. | Đủ 20. Cổng đông mở — sang phố thương mại. Ông làm việc nhanh hơn dáng vẻ của ông. |
| `m2_done_you_line1` | Bạn | Still haven't seen one living face. | Vẫn chưa thấy một gương mặt người sống. |

---

### m3 — "Tiếng Radio" / "The Signal" — khu `commercial`

**Mục tiêu:** `quota commercial 25` + `reach` đài phát sáng trên plaza
(`target_antenna`, toạ độ đọc từ `city`/WORLD.md).
**Thưởng:** `$350`. **Mở cổng:** commercial → hospital.

Hội thoại nhận (3 dòng):

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m3_radio_line1` | Giọng Radio | Commercial street. 25 down inside it. Then get to the glowing antenna on the plaza — I need a reading from there. | Phố thương mại. Hạ 25 con trong khu. Rồi tới đài phát sáng trên plaza — tôi cần một số đo từ chỗ đó. |
| `m3_you_line1` | Bạn | A reading from the tower, or from me? | Số đo từ cái đài, hay từ tôi? |
| `m3_radio_line2` | Giọng Radio | Same thing. Move. | Cái nào cũng vậy. Di chuyển. |

Hội thoại hoàn thành (2 dòng) — **bước ngoặt cốt truyện, Radio né câu hỏi:**

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m3_done_you_line1` | Bạn | "Evacuation is waiting" repeats every 47 seconds. Same pop of static every time. It's a recording. | Câu "giải cứu đang chờ" lặp lại đúng mỗi 47 giây, kể cả tiếng tĩnh. Đây là bản ghi âm. |
| `m3_done_radio_line1` | Giọng Radio | Hospital gate is open. Move. | Cổng bệnh viện mở rồi. Di chuyển. |

---

### m4 — "Thuốc Cho Bệnh Nhân" / "Medicine Run" — khu `hospital`

**Mục tiêu:** `quota hospital 30` + `collect medicine ×3`.
**Thưởng:** `$400`. **Mở cổng:** hospital → park.

Hội thoại nhận (3 dòng) — **giọng thứ hai xuất hiện lần đầu:**

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m4_unknown_line1` | KHÔNG RÕ | —hear me... if anyone is still hearing... don't touch that radio— | —nghe không... nếu còn ai đang nghe... đừng tắt cái radio— |
| `m4_you_line1` | Bạn | A second voice. Not a loop. Someone real. | Giọng thứ hai. Không phải băng ghi âm. Người thật. |
| `m4_unknown_line2` | KHÔNG RÕ | The hospital... bring the medicine boxes... three of them... I'm inside quarantine... | Bệnh viện... mang giùm hộp thuốc... ba hộp... tôi bị kẹt trong tâm cách ly... |

Hội thoại hoàn thành (2 dòng):

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m4_done_unknown_line1` | KHÔNG RÕ | With those meds I can last until the door opens. Don't trust the other voice. It's just a machine. | Có thuốc tôi trụ được tới lúc cửa mở. Đừng tin giọng kia. Nó chỉ là máy móc. |
| `m4_done_you_line1` | Bạn | Machines are what open gates around here. People haven't yet. | Ở thành phố này, máy móc mới mở được cổng. Người thì chưa. |

---

### m5 — "Lửa Trại Cầu Cứu" / "Signal Fire" — khu `park`

**Mục tiêu:** `quota park 25` + `activate` đống lửa trại (`target_campfire`).
**Thưởng:** `$425`. **Mở cổng:** park → docks.

Hội thoại nhận (3 dòng):

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m5_unknown_line1` | KHÔNG RÕ | I hear the radio but I can't see you. Light the campfire in the park. When I see the smoke, I'll know you're real. | Tôi nghe được radio nhưng không nhìn thấy anh. Đốt đống lửa trại trong công viên giúp tôi. Thấy khói là tôi biết anh thật. |
| `m5_you_line1` | Bạn | Everyone in this city will see that smoke. Not just whoever's listening. | Cả thành phố sẽ thấy khói đó. Không riêng gì người đang nghe. |
| `m5_radio_line1` | Giọng Radio | 25 still standing in the park. Light it before the park is clean and you've invited everything to dinner. | Công viên còn 25 con. Bật lửa trước khi khu sạch là ông mời tất cả bọn chúng tới ăn tiệc. |

Hội thoại hoàn thành (2 dòng):

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m5_done_unknown_line1` | KHÔNG RÕ | Smoke. I can see it. Now get to the docks and bring fuel — the door winch runs on it. | Khói rồi. Tôi thấy khói rồi. Giờ ra bến cảng lấy xăng — máy kéo cửa cần nhiên liệu. |
| `m5_done_you_line1` | Bạn | Machines don't need smoke to believe someone is out here. | Máy móc đâu cần khói để tin rằng ngoài kia còn người. |

---

### m6 — "Nhiên Liệu" / "Fuel Run" — khu `docks`

**Mục tiêu:** `quota docks 30` + `collect fuel ×4`.
**Thưởng:** `$450`. **Mở khoá:** cổng thép vào Vùng Cách Ly (tâm bản đồ).

Hội thoại nhận (3 dòng):

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m6_radio_line1` | Giọng Radio | The docks. 30 down, and 4 fuel cans. The winch that drags the central gate runs on real fuel — recordings don't turn cranks. | Bến cảng. Hạ 30 con, nhặt 4 can xăng. Máy kéo cửa trung tâm cần xăng thật — băng ghi âm đâu quay được tay quay. |
| `m6_you_line1` | Bạn | Who recorded the evacuation promise? | Ai đã ghi lại câu "giải cứu đang chờ"? |
| `m6_radio_line2` | Giọng Radio | Someone who no longer needs promises. | Một người không còn cần lời hứa. |

Hội thoại hoàn thành (2 dòng):

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m6_done_unknown_line1` | KHÔNG RÕ | That's enough fuel. The steel gate at the center has power again. Listen... it has gotten loud in here. That winch will wake everything. | Đủ xăng rồi. Cổng thép trung tâm có điện lại rồi. Nghe này... bên trong ồn hẳn lên. Cái máy kéo sẽ đánh thức tất cả. |
| `m6_done_radio_line1` | Giọng Radio | Quarantine gate is open. Go in. | Cổng tâm cách ly mở. Vào đi. |

---

### m7 — "Vào Tâm Dịch" / "Into the Swarm" — khu `quarantine`

**Mục tiêu:** `survive 60` (horde dồn dập trong lúc máy kéo cửa quay).
**Thưởng:** `$500`. **Không mở cổng mới** (đã trong tâm).

Hội thoại nhận (4 dòng):

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m7_unknown_line1` | KHÔNG RÕ | Can you still hear me? I'm hiding in the old concrete yard — where your team first camped, before they welded every gate shut. | Anh còn nghe tôi không? Tôi trốn trong sân bê tông cũ — nơi đội anh từng dựng trại, trước khi họ hàn chặt mọi cánh cổng. |
| `m7_radio_line1` | Giọng Radio | The door only opens from outside. While the winch turns, everything within half a kilometer knows where you stand. Survive 60 seconds. | Cửa chỉ mở được từ phía ngoài. Máy kéo quay thì mọi thứ trong nửa cây số đều biết ông đang đứng đâu. Trụ lại 60 giây. |
| `m7_you_line1` | Bạn | And the one inside? | Còn người ở trong đó thì sao? |
| `m7_radio_line2` | Giọng Radio | Silent since the winch started turning. | Bặt vô âm tín từ lúc máy kéo quay. |

Hội thoại hoàn thành (2 dòng):

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m7_done_you_line1` | Bạn | 60 seconds. Still breathing. | 60 giây. Vẫn còn thở. |
| `m7_done_unknown_line1` | KHÔNG RÕ | —keep moving... but it... it stands at the door... | —anh đi tiếp đi... nhưng có nó... nó đứng canh cửa... |

---

### m8 — "Vệ Binh Cách Ly" / "The Warden" — khu `quarantine`

**Mục tiêu:** `boss` — hạ 1 boss (mọi loại boss đều đúng, thoại không nêu tên
loại; dùng cơ chế `spawnBoss` hiện có).
**Thưởng:** `$550`. **Không mở cổng mới.**

Hội thoại nhận (3 dòng):

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m8_unknown_line1` | KHÔNG RÕ | The thing guarding the door doesn't sleep. It tears apart whoever touches the steel. Put it down. | Thứ canh cửa không ngủ. Nó xé từng kẻ chạm vào cánh thép. Hạ nó đi. |
| `m8_you_line1` | Bạn | Was it a person, in there? | Nó đã từng là người ở trong đó, đúng không? |
| `m8_radio_line1` | Giọng Radio | They were all people once. So were you. | Tất cả bọn chúng đều từng là người. Ông cũng vậy. |

Hội thoại hoàn thành (1 dòng):

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m8_done_radio_line1` | Giọng Radio | You just cut the artery of this city. The door is unlocked. Get to it. | Ông vừa chặn động mạch của thành phố này. Cửa đã mở khoá. Đi tới cửa đi. |

---

### m9 — "Cánh Cửa Cuối" / "The Last Door" — khu `quarantine`

**Mục tiêu:** `reach` cửa thép trung tâm (`target_steel_door`).
**Thưởng:** `$600`. **Sau nhiệm vụ này: outro → chơi tự do.**

Hội thoại nhận (2 dòng):

| Key | Giọng | EN | VI |
|---|---|---|---|
| `m9_radio_line1` | Giọng Radio | The steel door. Quarantine core. Same coordinates as the first promise. | Cánh cửa thép. Tâm cách ly. Đúng tọa độ của lời hứa đầu tiên. |
| `m9_unknown_line1` | KHÔNG RÕ | You made it... but don't open it right away. Listen first— | Anh làm được rồi... nhưng đừng mở vội. Nghe đã— |

Hội thoại hoàn thành: **KHÔNG có** — `reach` chạm cửa thì cắt thẳng sang OUTRO.

## 4. OUTRO — cuối nhiệm vụ 9

Toàn màn hình trắng-đen mờ dần (dùng `dialogue.showOutro`), hiện lần lượt 3
câu, không thể bỏ qua câu cuối. Sau đó quay lại game — **chơi tự do tiếp diễn**
(Phần 2 / WF-3 sẽ thay outro bằng boss cuối + ending thật).

| Key | EN | VI |
|---|---|---|
| `story_outro_line1` | Half a meter of steel. It's warm. | Cánh thép dày nửa mét. Nó ấm. |
| `story_outro_line2` | END OF PART 1 — BEHIND THE STEEL, SOMETHING IS STILL SQUIRMING... | HẾT PHẦN 1 — BÊN TRONG CÁNH THÉP, THỨ GÌ ĐÓ VẪN CÒN NHÓC NHÁCH... |
| `story_outro_line3` | The city stays open. For those who want to stay. | Thành phố vẫn mở. Với những ai muốn ở lại. |

`story_outro_line2` hiển thị dạng banner (chữ hoa, cỡ lớn); line1 và line3 là
chữ thường.

## 5. Chuỗi khoá cổng + quota (bảng tổng hợp)

Quota chỉ đếm zombie hạ **trong đúng khu** (`"zombie-killed"` → `city.districtAt`
của vị trí chết). Safehouse và quarantine **không có quota** — quarantine đi
bằng nhiệm vụ. Khi quota khu đạt → `quota-done`; cổng khu đó mở khi **quota
đạt + nhiệm vụ khu hoàn thành** (`gate-open {from, to}` → `city.setGateOpen`).

| Khu | Quota | Nhiệm vụ gắn | Cổng mở sau nhiệm vụ |
|---|---|---|---|
| `safehouse` (An Toàn Nhà) | — | m1 | safehouse → residential |
| `residential` (Khu Dân Cư) | 20 | m2 | residential → commercial |
| `commercial` (Phố Thương Mại) | 25 | m3 | commercial → hospital |
| `hospital` (Bệnh Viện) | 30 | m4 | hospital → park |
| `park` (Công Viên) | 25 | m5 | park → docks |
| `docks` (Bến Cảng) | 30 | m6 | docks → quarantine (cổng thép tâm) |
| `quarantine` (Vùng Cách Ly) | — | m7, m8, m9 | — (m9 là điểm đến, không phải cổng khu) |

- Cặp cổng vật lý (`from → to`) phải tồn tại trong topology của `src/world/city.js`
  (nguồn thật: `docs/WORLD.md`). Tài liệu này ràng buộc **trật tự mở khoá**;
  nếu WORLD.md nối quarantine từ nhiều phía thì mở **tất cả cổng vào
  quarantine** trong một lần bắn `gate-open {from: "docks", to: "quarantine"}`.
- Tên khu EN/VI ở bảng trên là **giá trị mặc định** của `district_*`; nếu
  WORLD.md đặt tên khác thì sửa 1 chỗ duy nhất tại bảng key mục 7.

## 6. Thưởng tiền & balance

| Nhiệm vụ | Thưởng | Tích luỹ từ thưởng nhiệm vụ |
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

- Chuỗi **tăng dần, nằm đúng khoảng 300–600** (đặc tả Phần 1).
- Mục tiêu balance tổng: người chơi có **~1500–2500$ tới hết nhiệm vụ 4**
  (mua được sniper $800, hoặc gần minigun $1500). Thưởng nhiệm vụ đóng
  $1,375; phần còn lại đến từ thưởng hạ zombie (walker 50 / runner 75 /
  brute 200, headshot +50%; boss 700–1500) **trừ** chi phí shop. Builder
  chỉnh density (+50% sau khi quota khu đạt) để chạm mốc — KHÔNG tăng
  thưởng nhiệm vụ lên nữa.
- `mission-complete` bắn `{index, reward}` với `reward` đúng bảng trên;
  `economy.add(reward)` do main.js gọi, toast dùng `mission_complete_toast`.

## 7. Key i18n hệ thống + quy ước đặt tên

Quy ước: **key phẳng snake_case**; nhóm tiền tố `intro_ / speaker_ / district_ /
item_ / target_ / obj_ / mission{n}_ / m{n}_ / story_ / hud`. Mỗi key có EN + VI
trong **một bundle duy nhất** đăng ký qua `i18n.registerBundle` (gợi ý:
`missions.js` đăng ký nhóm mission, `dialogue.js` đăng ký intro/outro + speaker).
Placeholder: `{n}` `{need}` `{district}` `{item}` `{target}` `{money}` — cú pháp
`{name}` của `i18n.t`.

### 7.1 Nhãn giọng nói

| Key | EN | VI |
|---|---|---|
| `speaker_radio` | RADIO | GIỌNG RADIO |
| `speaker_you` | YOU | BẠN |
| `speaker_unknown` | UNKNOWN | KHÔNG RÕ |

### 7.2 Tên khu (toast "CỔNG MỞ — {district}", HUD, objective)

| Key | EN | VI |
|---|---|---|
| `district_safehouse` | Safehouse | An Toàn Nhà |
| `district_residential` | Residential | Khu Dân Cư |
| `district_commercial` | Commercial | Phố Thương Mại |
| `district_hospital` | Hospital | Bệnh Viện |
| `district_park` | Park | Công Viên |
| `district_docks` | Docks | Bến Cảng |
| `district_quarantine` | Quarantine Zone | Vùng Cách Ly |

### 7.3 Tên vật phẩm & điểm tương tác (collect / activate / reach)

| Key | EN | VI |
|---|---|---|
| `item_supply` | Supply Pack | Gói Tiếp Tế |
| `item_medicine` | Medicine Box | Hộp Thuốc |
| `item_fuel` | Fuel Can | Can Xăng |
| `target_generator` | Generator | Máy Phát Điện |
| `target_antenna` | Broadcast Antenna | Đài Phát Sáng |
| `target_campfire` | Campfire | Đống Lửa Trại |
| `target_steel_door` | Central Steel Door | Cửa Thép Trung Tâm |

### 7.4 Template mục tiêu (HUD tracker)

| Key | EN | VI |
|---|---|---|
| `obj_quota` | Kill zombies in {district}: {n}/{need} | Hạ zombie trong {district}: {n}/{need} |
| `obj_collect` | Collect {item}: {n}/{need} | Thu {item}: {n}/{need} |
| `obj_activate` | Activate: {target} | Kích hoạt: {target} |
| `obj_reach` | Reach the marker | Tới điểm đánh dấu |
| `obj_boss` | Kill the boss | Hạ boss |
| `obj_survive` | Survive: {n}/{need} s | Trụ lại: {n}/{need} s |

### 7.5 HUD / toast / hệ thống

| Key | EN | VI |
|---|---|---|
| `mission_progress` | MISSION {n}/9 | NHIỆM VỤ {n}/9 |
| `mission_complete_toast` | MISSION COMPLETE +{money}$ | NHIỆM VỤ HOÀN THÀNH +{money}$ |
| `quota_counter` | 🧟 {n}/{need} | 🧟 {n}/{need} |
| `quota_done_toast` | DISTRICT CLEARED | KHU ĐÃ SẠCH |
| `gate_open_toast` | GATE OPEN — {district} | CỔNG MỞ — {district} |
| `interact_hint` | E — INTERACT | E — TƯƠNG TÁC |

### 7.6 Danh mục đầy đủ key thoại (checklist cho builder)

- `intro_s1` … `intro_s4` — 4 key.
- `mission1_title` "Lights On" / "Sáng Đèn"; `mission2_title` "Dead Blocks" /
  "Đường Phố"; `mission3_title` "The Signal" / "Tiếng Radio";
  `mission4_title` "Medicine Run" / "Thuốc Cho Bệnh Nhân"; `mission5_title`
  "Signal Fire" / "Lửa Trại Cầu Cứu"; `mission6_title` "Fuel Run" /
  "Nhiên Liệu"; `mission7_title` "Into the Swarm" / "Vào Tâm Dịch";
  `mission8_title` "The Warden" / "Vệ Binh Cách Ly"; `mission9_title`
  "The Last Door" / "Cánh Cửa Cuối".
- Dòng nhận nhiệm vụ: `m{n}_{speaker}_line{i}` với `{speaker}` ∈
  `radio | you | unknown`, đánh số từ 1 theo thứ tự bảng của từng nhiệm vụ —
  m1: `m1_radio_line1..3`, `m1_you_line1`; m2: `m2_radio_line1..3`,
  `m2_you_line1`; m3: `m3_radio_line1..2`, `m3_you_line1`;
  m4: `m4_unknown_line1..2`, `m4_you_line1`; m5: `m5_unknown_line1`,
  `m5_you_line1`, `m5_radio_line1`; m6: `m6_radio_line1..2`, `m6_you_line1`;
  m7: `m7_unknown_line1`, `m7_radio_line1..2`, `m7_you_line1`;
  m8: `m8_unknown_line1`, `m8_you_line1`, `m8_radio_line1`;
  m9: `m9_radio_line1`, `m9_unknown_line1`.
- Dòng hoàn thành: `m{n}_done_{speaker}_line{i}` — m1, m2, m3, m4, m5, m6, m7
  mỗi nhiệm vụ 2 dòng, m8 1 dòng, m9 không có (xem mục 4).
- Outro: `story_outro_line1..3`.

## 8. Sổ liên tục cho Phần 2 (twist ledger)

Những gì Phần 1 **đã khẳng định** — Phần 2 (WF-3: boss cuối + ending thật)
phải tôn trọng:

1. Lời hứa "giải cứu đang chờ" là **bản ghi âm** tái phát mỗi 47 giây từ Tâm
   Cách Ly (m3). Không có đội giải cứu nào xác nhận tồn tại.
2. Giọng điều phối nhiệm vụ (Giọng Radio) **sống thật** ở mức đã chứng minh:
   phản ứng theo câu hỏi của người chơi (m2, m6). KHÔNG RÕ khẳng định nó "chỉ
   là máy" (m4) — mâu thuẫn chưa được giải quyết, cố ý.
3. Giọng thứ hai (KHÔNG RÕ) là người thật, bị kẹt trong Tâm Cách Ly, đến m9
   **vẫn chưa được gặp mặt**, kêu người chơi "đừng mở vội".
4. Bên trong cánh thép có thứ còn nhóc nhách; cánh thép ấm (outro).
5. Bốn boss hiện có (butcher/spitter/screamer/golem) chỉ là "lính"; thứ đứng
   canh cửa trong m8 thoại **không bị nhận danh** — trùng khớp cơ chế
   `spawnBoss` hiện có (loại boss nào cũng đúng lời thoại).
6. Hiện vật lặp lại dùng làm motif: đèn phát điện, sóng 47 giây, khói trại,
   điện mở cổng — Phần 2 nên trả vocabulary này thay vì thêm motif mới.
