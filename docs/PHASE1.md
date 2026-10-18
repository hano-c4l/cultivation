# Giai đoạn 1: MVP chơi được — chia nhánh

Mỗi mục là một nhánh `features_*` từ `preview` → PR vào `preview` → deploy preview kiểm tra → cuối giai đoạn (hoặc khi một mục tự đứng được) PR `preview` → `main`.

**Trạng thái: giai đoạn 1 đã xong và đang chạy ở production (1f được hoãn).** Giai đoạn 2 xem `docs/PHASE2.md`.

Thứ tự phụ thuộc: 1a → 1b → 1c → 1d → 1e → 1f.

## Trạng thái triển khai các hạng mục giai đoạn 0-1
| Hạng mục | Ghi chú |
|---|---|
| Giai đoạn 0 | Worker + Durable Object + D1, bản đồ isometric, click để di chuyển, nhiều người thấy nhau |
| 1a Tài khoản và nhân vật | Email + mật khẩu, phiên bằng cookie, tạo nhân vật (server tung linh căn), WebSocket xác thực bằng cookie, khóa nhân vật xuyên kênh, lưu vị trí |
| 1b Thế giới và chat | 3 bản đồ (Thanh Vân Thành an toàn, Hắc Mộc Lâm, U Minh Động) nối bằng cổng, chat theo bản đồ có lọc từ và giới hạn tốc độ |
| 1c Chỉ số, cảnh giới, tiềm năng | Bảng 4 cảnh giới × 9 tầng, EXP, chỉ số gốc/dẫn xuất, ngũ hành (`shared/src/progression*.ts`), bảng nhân vật (phím `C`), cộng điểm một lần xác nhận một lần ghi D1. Chưa có nguồn EXP trong game (chờ 1d) |
| Phẩm cấp linh căn | 5 bậc Hạ/Trung/Thượng phẩm, Địa, Thiên (`ROOT_GRADES`), server tung một lần khi tạo nhân vật; cho điểm tiềm năng khởi đầu, thưởng/phạt tu vi và sát thương theo hệ (xem "Linh căn nhiều hệ"). Nhân vật cũ đã được tung lại trong migration 0004 |
| 1d Quái và chiến đấu | 6 loài quái (9 quái mỗi bản đồ, 3 cụm) ở rừng và hang, tick 10 Hz chỉ khi có người, click quái để tự đuổi và đánh, sát thương theo chỉ số và ngũ hành, EXP và lên tầng, chết mất 10% EXP rồi về thành, thanh sinh lực và số sát thương. Chưa có rơi đồ (1e) |
| Tự đánh trả | Đứng im, chưa có mục tiêu mà bị quái đánh thì tự nhắm quái đó và đánh lại; đang đi thì không; đã có mục tiêu thì giữ. PvP sẽ dùng lại quy tắc này (GĐ2) |
| Movement budget | `shared/src/movement.ts`: server chỉ tin ô xuất phát client khai khi còn ngân sách (cap 3 ô, hồi 1 ô/giây), nên nối chuỗi claim chỉ tăng tối đa khoảng 25% tốc độ. Bấm quá dày thì server dùng vị trí của mình (client thấy bị kéo nhẹ; cần kiểm tra cảm giác với độ trễ thật trên preview) |
| 1d+ Vùng quái | Bản đồ có cảnh giới, 3 cụm × 3 quái (bậc 1, 4, 7) mỗi bản đồ, quái thường/hiếm (2 hạng), tên có bậc và loại, EXP theo nhịp lên cấp, chặn EXP khi săn sai cảnh giới. Boss và rơi đồ chưa làm (xem `docs/PHASE1.md` 1d+). Bảng EXP người chơi đã nhân 10 |
| Di chuyển | Dự đoán phía client, hòa trộn khi server sửa, ping tự trả lời (DO ngủ được), đích đến chính xác, đường đi làm thẳng, **va chạm lưới mịn 4x4 mỗi ô** (vật cản tròn, vát góc, hàng rào mỏng) |
| 1e Kinh tế khung xương | Migration `0005_economy.sql`: `currency_ledger` (append-only bằng trigger, khóa idempotency UNIQUE), `currency_balances` (CHECK >= 0), `item_instances`, `mailbox`. `server/src/economy.ts`: `applyCurrencyDelta` (một batch D1, lặp khóa hoặc âm tiền thì cả batch rollback), `claimMail` (khóa `mail:<id>`), `createItem`, `sendMail`. HUD góc phải hiện cả 3 loại tiền (không nằm trong bảng nhân vật). Trang admin `/admin.html`: tìm theo email hoặc đạo hiệu (`GET /api/admin/lookup`), chọn tài khoản rồi nhân vật, xem số dư và 50 dòng sổ cái gần nhất (`GET /api/admin/character`), sau đó mới cộng/trừ (`POST /api/admin/grant` nhận `characterId`). Chưa có: xem số dư qua `/api/me`, giao diện hòm thư/túi đồ. **Chat 5 thẻ (Tất cả/Thế giới/Bản đồ/Truyền âm/Hệ thống) chưa làm, đã ghi ở `docs/PLAN.md` mục 9a cho GĐ2.** Quái rơi Linh Thạch (`rollLinhThachDrop`, ghi sổ cái đồng bộ qua hàng đợi riêng của phòng, không chặn tick; HUD hiện số dư). Admin: `POST /api/admin/grant`, `GET /api/admin/supply`, trang `/admin.html`. Test: `server/src/economy.test.ts` (SQLite thật với migration thật), `tools/economy-smoke.mjs` (chỉ local). **Chưa lên preview/production** |
| 1f Kiểm thử tải thật | **Hoãn** (quyết định người dùng): số đo local đã đạt (tick trung bình khoảng 2,7 ms, tối đa khoảng 35 ms, không tick nào bị bỏ ở 50 client). Chỉ nâng Workers Paid khi gặp dấu hiệu nêu ở mục "Còn lại" |
| Tạm dừng tick khi rảnh | Phòng rừng/hang dừng tick khi không có gì xảy ra, dựng lại sim sau khi Durable Object ngủ (chi tiết ở "Việc tồn đọng") |

## 1a. Tài khoản và nhân vật (`features_accounts`)
- Migration D1 0002: `accounts` (email unique không phân biệt hoa thường, hash, salt, iterations, role `player|admin`), `sessions` (token lưu dạng hash, hết hạn), `characters` (account_id, tên unique, linh căn, map, ô, EXP, cảnh giới/tầng, điểm tiềm năng, chỉ số gốc, `updated_at`). Bảng `characters` placeholder của GĐ0 đang trống nên được tạo lại.
- API (`/api/*`): `register`, `login`, `logout`, `me`, `character` (tạo nhân vật). Giới hạn tần suất đăng nhập/đăng ký theo IP + email.
- Băm mật khẩu PBKDF2-SHA256 100.000 vòng (WebCrypto) **bên trong Durable Object `PasswordHasher`** (không băm trong Worker, vì Worker Free chỉ có 10 ms CPU). Đã chọn phương án này; nếu preview vẫn lỗi 1102 thì nâng Workers Paid. Cookie phiên `HttpOnly; Secure; SameSite=Lax`.
- WebSocket: Worker xác thực cookie lúc upgrade rồi chuyển danh tính cho DO bằng header nội bộ (header từ client bị xóa). **Khóa phiên theo nhân vật xuyên kênh:** một Durable Object `CharacterLock` (khóa theo id nhân vật), người vào sau thắng. Thứ tự bắt buộc: phòng mới xin khóa → `CharacterLock` bảo phòng cũ đá socket và **lưu xong** → chỉ khi đó cấp khóa → phòng mới mới đọc dòng nhân vật từ D1. Nếu không, phòng mới đọc trạng thái cũ và có hai writer (hiện đã có 8 kênh = 8 DO khác nhau).
- **Lưu tối thiểu ngay ở 1a:** lưu khi ngắt kết nối và debounce sau khi di chuyển (vị trí suy ra từ path + startedAt). Không dùng alarm định kỳ để DO vẫn ngủ được; debounce cũng giữ lượng ghi D1 dưới giới hạn Free (100.000 dòng/ngày).
- Client: màn hình đăng ký/đăng nhập/tạo nhân vật (HTML/CSS, tiếng Việt); bỏ guest ẩn danh.
- Kiểm thử: smoke đầy đủ (đăng ký/đăng nhập/di chuyển) **chỉ chạy trên preview và local**, vì sẽ tạo tài khoản thật. Trên production chỉ kiểm tra health và một thao tác chỉ-đọc (hoặc một tài khoản test cố định).
- Nghiệm thu: đăng ký → tạo nhân vật → vào game → thoát/vào lại giữ đúng tên và vị trí; sai mật khẩu bị từ chối; vượt giới hạn tần suất bị chặn; đăng nhập 2 nơi, **kể cả hai kênh khác nhau**, không nhân đôi và không đọc trạng thái cũ.

## 1b. Thế giới và trò chuyện (`features_world-chat`)
- Nhiều bản đồ (thành thị an toàn + 2 bản đồ luyện cấp), portal, chuyển bản đồ theo thứ tự *lưu → giải phóng → vào*.
- Lưu nhân vật theo chu kỳ và khi ngắt kết nối; tải lại đúng trạng thái.
- Chat theo bản đồ (giới hạn tần suất, lọc từ cơ bản, giới hạn độ dài). **Chế độ Thế giới / Truyền âm / Hệ thống và 5 thẻ hiển thị không nằm trong GĐ1**: đã ghi vào `docs/PLAN.md` mục 9a, làm ở GĐ2.
- Nghiệm thu: đi qua portal, vị trí và bản đồ lưu đúng; chat hai người thấy nhau; spam chat bị chặn.

## 1c. Chỉ số, cảnh giới, tiềm năng (`features_progression`)
- `shared/`: bảng cảnh giới Luyện Khí → Trúc Cơ → Kim Đan → Nguyên Anh (9 tầng mỗi cảnh giới), bảng EXP, điểm tiềm năng mỗi tầng, công thức chỉ số dẫn xuất, bảng ngũ hành. Dữ liệu tách file cấu hình.
- UI: bảng nhân vật, cộng điểm tiềm năng.
- Nghiệm thu: test tự động cho công thức và bảng EXP; cộng điểm lưu và tải lại đúng.

## 1d. Quái và chiến đấu realtime (`features_combat`)
- Vòng lặp tick (`setInterval` 10 Hz) chỉ chạy ở bản đồ có quái và chỉ khi có người chơi; thành không tick nên vẫn ngủ được. Phòng trống thì dừng tick và bỏ quái; lần vào đầu tiên spawn lại từ đầu. **Hồi sinh quái chạy trong tick, không dùng alarm** (đã đổi so với bản đầu; alarm chỉ còn lo lưu định kỳ).
- Quái spawn theo bản đồ, click chọn mục tiêu, auto-attack có cooldown, sát thương theo chỉ số và ngũ hành, chết/hồi sinh ở thành, nhận EXP.
- Đã làm: `shared/src/monsters.ts` (6 loài quái, 9 quái mỗi bản đồ chia 3 cụm, xem 1d+), `shared/src/combat.ts` (`computeDamage` thuần với RNG truyền vào, EXP kill, phạt chết), `server/src/combat-sim.ts` (mô phỏng thuần, không đụng socket/D1), nối vào `MapRoom`. Giao thức: client `attack`; server `mon`, `mon_gone`, `hit`, `hp`, `died`, và `welcome` mang `monsters`, `hp`, `maxHp`.
- **EXP/tầng do phòng giữ bản làm việc trong bộ nhớ** (đúng bảng sở hữu trạng thái ở TECHNICAL mục 3): ghi D1 ngay khi lên tầng, còn lại gộp vào lần lưu debounce. Điểm tiềm năng từ lên tầng ghi theo delta tương đối (`potential_points + ?`) để không đè `allocate`. **Mọi đường nhả khóa phải ghi tiến độ trước** (rời phòng, bị đá, portal, chết). HP không lưu: vào lại thì đầy máu.
- Quái: đứng yên đến khi người chơi vào bán kính aggro thì đuổi theo (thẳng nếu thông, A* nếu không, tối đa 2 lần/giây), đánh khi trong tầm, bị kéo quá xa thì bỏ cuộc và về chỗ cũ, hồi đầy máu. Người chơi click quái: server tự đuổi và auto-attack (1 lần/giây). Click mặt đất thì hủy mục tiêu.
- **Tự đánh trả:** người chơi đứng im, chưa có mục tiêu mà bị quái đánh thì tự nhắm quái đó và đánh lại (đang đi thì coi như đang bỏ chạy, không tự đánh; đã có mục tiêu thì giữ nguyên). PvP ở giai đoạn 2 dùng lại đúng quy tắc này khi bị người chơi khác tấn công (`monsterAttack` trong `server/src/combat-sim.ts` là chỗ cần mở rộng).
- Chết: mất 10% EXP của tầng hiện tại (không tụt tầng), về Thanh Vân Thành bằng đúng cơ chế portal. Chưa có độ bền (chưa có trang bị).
- **Tạm dừng tick khi rảnh** (đã làm, nhánh `features_idle-tick`): xem "Ghi chú vận hành và tồn đọng của 1d" bên dưới. Điểm cần nhớ: object ngủ thì mất sim, nên phải dựng lại hồ sơ cho mọi người đang kết nối và khôi phục hạng quái từ storage.
- Chưa có: rơi vật phẩm/Linh Thạch (có chỗ móc `reward` trong `combat-sim.ts` cho 1e), PvP, kỹ năng/MP, area-of-interest (mọi sự kiện gửi cả phòng).
- Nghiệm thu: đánh quái → lên tầng (smoke đã kiểm: đánh chết quái nhận EXP, lưu khi thoát, chết mất EXP về thành); `tools/load.mjs` 50 client trên một phòng chạy local: tick trung bình ~6 ms, 0 tick bị bỏ, độ trễ tick tối đa 376-524 ms giữa các lần chạy (ngưỡng đặt 500 ms nên có lúc sát/vượt). Nghi do A* khi nhiều người cùng đuổi quái (mỗi người tối đa 2 lần/giây) và do băm mật khẩu chạy chung tiến trình khi dev (script đã tạo tài khoản trước khi vào phòng để tách yếu tố này). Số đo local, chưa đại diện cho Cloudflare thật; 1f cần đo lại và tối ưu A* nếu cần (xem mục ghi chú vận hành của giai đoạn này trong file này).

### Ghi chú vận hành và tồn đọng của 1d
- **Tạm dừng tick khi rảnh: ĐÃ LÀM** (`features_idle-tick`). Phòng rừng/hang tự dừng `setInterval` khi `CombatSim.isIdle()` (không quái chết/đuổi/về nhà, không người đi/có mục tiêu/thiếu máu/chết), ghi hết tiến độ rồi mới dừng, nên Durable Object ngủ được. `move`/`attack`/vào phòng đánh thức lại. Nếu runtime đã đuổi object (sim mất): `rebuild` dựng sim mới, cấp hồ sơ cho **mọi** người đang kết nối (đọc D1), khôi phục hạng quái từ `ctx.storage` (khóa `ranks`, tránh tái tung hạng để không nuôi lạm phát Linh Thạch), gửi lại `mon` cho client. Con số 10.800 GB-s mỗi ngày giờ chỉ đúng cho phòng đánh nhau liên tục; phòng đứng yên gần như không tốn. **Cần xác nhận trên preview** bằng `wrangler tail --env preview` (log `tick paused`, `sim rebuilt`) và bảng điều khiển Cloudflare (thời lượng DO giảm). Hạng quái không được lưu nếu object bị đuổi khi đang đánh nhau (crash): khi đó hạng được tung lại. Còn một đường tái tung hạng có sẵn từ trước: đổi kênh (mỗi kênh trống spawn lại quái mới); cần lưu ý khi làm boss và rơi đồ. `GET /api/dev/evict` phải trả 404 ở preview/production.
- **Độ trễ tick đo local** tối đa khoảng 125-524 ms giữa các lần chạy (ngưỡng 500 ms), nghi do A* khi nhiều người cùng đuổi quái; đo lại và tối ưu ở 1f.
- Từ 2d-A đã có đột phá (`docs/PHASE2.md` mục 2d), nên người qua Luyện Khí 9 không còn bị chặn EXP ở mức cao nhất của rừng khi săn ở hang.

## 1d+. Vùng quái, bậc, quái hiếm (`features_monster-zones`)
Mở rộng 1d theo yêu cầu của người dùng. Đã làm trong nhánh này (trừ phần boss, chỉ ghi quyết định).
- **Cảnh giới của bản đồ:** `MapData.realm` (thành = không có, rừng = Luyện Khí, hang = Trúc Cơ). Chỉ là thiết lập cơ bản; sau này có nhiều bản đồ cho mỗi cảnh giới. **Không chặn** ai vào bản đồ nào. Chỉ số quái tính bằng công thức từ (cảnh giới bản đồ, bậc) nhân hệ số loài và hạng (`monsterStats` trong `shared/src/monsters.ts`), không còn số viết tay theo từng quái.
- **Cụm quái cố định** (`CLUSTERS`): mỗi bản đồ 3 cụm × 3 quái ở bậc 1, 4, 7, **số lượng không đổi theo số người** để quái khan hiếm và phải tranh giành. Mở rộng bản đồ thì thêm cụm/quái trong dữ liệu.
- **Tên quái:** "Sói Rừng · Bậc 4", thêm thẻ cho quái hiếm; tên quái thường đổi màu theo chênh lệch với cấp người chơi (xanh dễ, trắng ngang, cam khó, đỏ nguy hiểm). Quái hiếm có màu riêng và to hơn. HUD hiện cảnh giới của bản đồ.
- **Loại quái:** thường, hiếm (hai hạng: `rare1` "Hiếm · Tinh Anh" 8%, HP ×1.8, công ×1.2, EXP ×2.5; `rare2` "Hiếm · Đại Yêu" 2%, HP ×3, công ×1.5, EXP ×5; tên hạng và tỉ lệ là giá trị tạm, chỉnh trong `RANKS`) và boss (chưa làm). Hạng được tung lại mỗi lần quái spawn/hồi sinh. Thưởng của quái hiếm: **người đóng góp cao nhất (70% sát thương + 30% kết liễu) trong số người còn ở phòng nhận toàn bộ**; quái thường vẫn thuộc người kết liễu. Bảng sát thương xóa khi quái về chỗ cũ hồi đầy máu.
- **Nhịp lên cấp:** số quái cùng bậc cần giết để hết một tầng = `30 × 1.13^cấp` (cấp tính phẳng qua các cảnh giới): Luyện Khí 1 → 30, Luyện Khí 5 → 49, Luyện Khí 9 → 80, Trúc Cơ 1 → 90, Trúc Cơ 2 → 102, Kim Đan 1 → 271, Nguyên Anh 1 → 813, Nguyên Anh 9 → 2162 (con số cuối nặng, cần cân lại khi tới đó). EXP quái = EXP cần cho tầng ÷ số quái. Bảng EXP người chơi được nhân 10 (Luyện Khí 1 cần 1000 EXP, quái bậc 1 cho 33) để EXP mỗi quái là số nguyên; không có migration, nhân vật cũ chỉ bị EXP dở dang của tầng hiện tại co lại 10 lần (tầng và điểm giữ nguyên).
- **Săn sai cảnh giới:** quái ở bản đồ cảnh giới cao hơn người chơi thì EXP mỗi lần giết bị chặn ở mức tối đa cùng hạng ở bản đồ đúng cảnh giới của người chơi (`homeExpCap`, tính từ cụm bậc cao nhất của các bản đồ cảnh giới đó), để không ai "lên cấp nhờ được kéo". Quái ở bản đồ thấp hơn: hệ số `LOW_MAP_EXP_MULT` mỗi cảnh giới chênh (đặt 1 = không phạt thêm vì quái thấp đã chậm sẵn; người dùng chưa quy định phần này, chỉnh nếu cần). Lưu ý: trước 2d-A chưa ai qua được Luyện Khí 9 nên mọi lần giết ở hang đều chạm trần này; nay người đã đột phá lên Trúc Cơ thì săn hang như ở bản đồ đúng cảnh giới.

### Boss (quyết định đã chốt, chưa làm; làm sau 1e vì cần vật phẩm và sổ cái)
- Xuất hiện: tỉ lệ ngẫu nhiên khoảng **0,1%** mỗi lần quái hồi sinh, hoặc "bảo hiểm" khi tổng số quái bị giết ở bản đồ đạt ngưỡng cao (đề xuất Luyện Khí 500, Trúc Cơ 1500; người dùng muốn hiếm hơn ví dụ 100/1000). Mỗi bản đồ chỉ có một boss cùng lúc. Boss chỉ biến mất khi bị giết.
- Cấp cao hơn cấp bản đồ một ít (người chơi hợp lực và có kỹ năng vẫn hạ được). Có kỹ năng đặc biệt, làm khi người chơi đã có kỹ năng (GĐ2).
- Thông báo toàn bản đồ khi boss xuất hiện và khi bị giết. Quái hiếm thì không thông báo.
- Chia thưởng: tỉ lệ đóng góp = 70% theo sát thương + 30% kết liễu (ví dụ đánh 20/70 phần máu nhưng kết liễu = 20% + 30% = 50%). **Tiền chia theo tỉ lệ; đồ chia ngẫu nhiên có trọng số theo tỉ lệ (tỉ lệ cao thì dễ ra đồ tốt); người dưới 10% không được chia.**
- **Cần ghi nhớ khi làm:** "chỉ biến mất khi bị giết" mâu thuẫn với việc hiện nay bỏ quái khi phòng trống, nên trạng thái boss và bộ đếm quái bị giết phải lưu bền (DO storage, ghi gộp). **Đã chốt (2026-10-17): chỉ 1 boss cho mỗi bản đồ (cả 8 kênh), quy tắc dưới 10% áp dụng cho cả tiền lẫn đồ.**

### Giá trị tạm của giai đoạn 1
- **Giá trị tạm (người dùng đã đồng ý giữ nguyên, chỉnh khi cân bằng, 2026-10-17):** lượng và xác suất rơi Linh Thạch (`DROP_CHANCE` thường 30%, hiếm 100%; `DROP_BASE`, `DROP_GROWTH`, `DROP_AMOUNT_MULT` trong `shared/src/economy.ts`); tên hạng quái hiếm ("Tinh Anh" 8%, "Đại Yêu" 2%) và các hệ số chỉ số/EXP của chúng (`RANKS`), `LOW_MAP_EXP_MULT = 1` (không phạt thêm khi người mạnh săn bản đồ thấp), nhịp lên cấp `KILLS_BASE`/`KILLS_GROWTH` (Nguyên Anh 9 cần 2162 quái cùng bậc một tầng, nặng).

## 1e. Kinh tế khung xương (`features_economy-core`)
- Migration D1: `item_instances` (ID duy nhất), `currency_ledger` append-only (idempotency key, actor), `mailbox`; số dư là bản tổng hợp cập nhật bằng batch atomic có điều kiện.
- Trang admin cộng tiền thủ công (kiểm tra `role = admin`), rơi Linh Thạch từ quái.
- Nghiệm thu: test idempotency và không âm tiền; admin cộng tiền ghi đúng sổ cái; người không phải admin bị từ chối.
- **Đã làm (nhánh `features_economy-core`):** xem "Lưu ý vận hành kinh tế (1e)" bên dưới. Điểm thiết kế quan trọng: một câu lệnh đổi 0 dòng **không** rollback batch D1, nên lặp khóa và âm tiền được ép thành lỗi (UNIQUE và CHECK) để cả batch rollback; số dư dùng `INSERT OR IGNORE` + `UPDATE` thay vì upsert vì SQLite kiểm CHECK của dòng INSERT (âm) trước khi xử lý xung đột. Người dùng chọn ghi đồng bộ từng lần rơi (phương án A). Khóa idempotency của lần rơi là UUID tạo lúc giết (id quái lặp lại mỗi lần hồi sinh nên không dùng làm khóa).

### Lưu ý vận hành kinh tế (1e)
- **Chi phí ghi D1 của một lần rơi** (ước tính, local không báo `rows_written`): dòng sổ cái (bảng + chỉ mục idempotency + chỉ mục nhân vật = 3) + cập nhật số dư (1) ≈ 4 dòng; `INSERT OR IGNORE` số dư chỉ tốn khi tạo dòng mới. Hạn mức Free là 100k dòng/ngày dùng chung cả tài khoản, tức khoảng 25k lần rơi/ngày trước khi tính lưu vị trí. **Cần đo `meta.rows_written` thật trên preview** (1f). Phương án nếu thiếu: giảm `DROP_CHANCE` hoặc hàng đợi bền trong DO gộp ghi (đổi luật TECHNICAL mục 3, cần người dùng đồng ý).
- Một lần rơi thất bại sau 3 lần thử thì mất (không bao giờ nhân đôi): khóa idempotency tạo một lần cho mỗi lần giết và dùng lại khi thử lại.
- Gán admin (xem thêm `docs/TECHNICAL.md`): `wrangler d1 execute DB --env preview --remote --command "UPDATE accounts SET role='admin' WHERE email='...'"`. Trang `/admin.html` tạo khóa idempotency mới cho mỗi lần hiển thị form.
- **Không bao giờ chèn tay dòng thử vào sổ cái preview/production**: trigger làm chúng vĩnh viễn và phá phép kiểm `SUM(delta) = số dư`. Dùng nhân vật thử.
- Đo chi phí thật: `npx wrangler tail --env preview` rồi giết quái, dòng log `ledger rows_written <reason> <n>` cho số dòng ghi mỗi lần.
- `client/public/admin.html` viết chuỗi tiếng Việt trực tiếp (ngoại lệ chấp nhận được với công cụ quản trị độc lập, trái PLAN mục 7).
- **Triển khai:** chạy `db:migrate:*` (0005) TRƯỚC khi deploy worker, hai bước riêng; thiếu bảng thì mọi lần rơi lỗi âm thầm vào log.
- Test kinh tế dùng `node:sqlite` (Node 22+); file test bị loại khỏi `tsc` của server vì không có kiểu Node.

## 1f. Kiểm thử tải và hoàn thiện (`features_phase1-hardening`)
**Hoãn (2026-10-17, quyết định của người dùng):** không đo tải thật trên Cloudflare lúc này, chỉ nâng Workers Paid khi gặp dấu hiệu nêu ở `docs/TECHNICAL.md` (mục "Giới hạn gói Free"). Giai đoạn 1 coi như xong; phần dưới giữ lại làm danh sách việc khi cần.
- Smoke/E2E cho toàn luồng, giả lập 50 client, kiểm tra tick, rà soát giới hạn Free, cập nhật tài liệu.

## Quyết định đã chốt
0. **Gói Cloudflare:** kế hoạch là Workers Paid, nhưng khi develop dùng Free; gặp việc cần Paid (ví dụ kiểm thử tải 1f, tick loop 1d) thì báo người dùng để nâng cấp (xem `docs/TECHNICAL.md` mục 2a).
1. **PBKDF2 trên gói Free:** 100.000 vòng đo được ~24 ms (Node), vượt 10 ms CPU của Worker Free. Chọn băm trong Durable Object (đã chốt với người dùng), xác nhận lại trên preview; dự phòng là Workers Paid.
2. **Admin:** vai trò `admin` được gán bằng cách nào (mặc định đề xuất: gán thủ công qua lệnh `wrangler d1 execute`, không có đăng ký admin qua giao diện).
3. **Email:** không xác minh email ở GĐ1 (đã ghi nhận ở kế hoạch gốc).
0b. **Gói Free và tick (1d):** người dùng chọn làm trên Free, giảm tối đa: chỉ tick ở bản đồ có quái khi có người, dùng `setInterval` (không alarm mỗi tick), thành không tick. Một phòng có người cả ngày tốn khoảng 10.800 GB-s trên hạn mức 13.000 GB-s/ngày, nên chơi thật nhiều người hoặc kiểm thử tải trên preview ở 1f sẽ cần Workers Paid: khi đó phải báo người dùng.
4. **Tầng 9 (1c):** tiến độ dừng ở tầng 9 của mỗi cảnh giới, EXP bị chặn ở mức đầy và phần dư bị bỏ, cho đến khi có cơ chế đột phá (giai đoạn 2). Người dùng đã chọn phương án này.
5. **Điểm thử (1c):** nhân vật mới có 5 điểm tiềm năng ở Luyện Khí tầng 1 (migration 0003 điền cho nhân vật cũ); thêm `POST /api/dev/grant-exp` chỉ chạy khi `ENABLE_DEV_GRANT=1` trong `.dev.vars`.
6. **Phẩm cấp linh căn:** trục chất lượng (Hạ phẩm 50%, Trung phẩm 30%, Thượng phẩm 13%, Địa 5%, Thiên 2%), thưởng tu vi -10/0/+10/+25/+50% và điểm khởi đầu +0/1/2/4/6. Không cho đổi linh căn ở giai đoạn này (sau này qua vật phẩm hiếm, ghi sổ cái). Trục số hệ (song linh căn, biến dị) làm ở giai đoạn 2. Nhân vật cũ được tung lại trong migration 0004.
7. **Cho 1d:** `grantExp` không tự áp `expBonus`; nơi gọi trong chiến đấu phải nhân vào. `expBonus` gộp Ngộ tính và phẩm cấp linh căn, nên phải gọi `deriveStats(base, realm, stage, row.root_grade)` (tham số phẩm cấp bắt buộc, truyền thiếu sẽ ra lỗi biên dịch). Tốc độ di chuyển vẫn là `BASE_SPEED`; `moveSpeed` trong `deriveStats` chưa được nối vào (đổi tốc độ giữa đường đi sẽ lệch vị trí, nếu nối phải rebase đường đi).
