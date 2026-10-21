# Kế hoạch: Web game tu tiên (MMO nhỏ-vừa, 2.5D isometric)

Trạng thái: **ĐANG THỰC HIỆN** — xem `docs/STATUS.md` (giai đoạn nào xong, đang làm, làm tiếp), `docs/TECHNICAL.md` (hạ tầng, cách chạy, kiểm thử), `docs/PHASE1.md` và `docs/PHASE2.md` (chi tiết từng giai đoạn). Mọi mục "Mặc định" bên dưới đều có thể sửa.

## 1. Yêu cầu đã chốt
| Hạng mục | Quyết định |
|---|---|
| Quy mô | MMO nhỏ-vừa: mỗi bản đồ là 1 phòng realtime, ~50-100 người/bản đồ, nhiều kênh |
| Đồ họa | 2.5D isometric kiểu Võ Lâm Truyền Kỳ; asset CC0 + placeholder, **giữ đúng tỉ lệ để thay bằng art tự tạo/AI sau** |
| Chiến đấu | Realtime, click-to-move, auto-attack + cooldown, thanh phím tắt kỹ năng |
| PvP | Thành thị an toàn; bản đồ thường PvP được; chết mất ít EXP + độ bền; sát khí cao thì rơi đồ và bị NPC vệ binh đánh |
| Tài khoản | Email + mật khẩu; hỗ trợ mobile (cảm ứng) |
| Cảnh giới | Luyện Khí → Trúc Cơ → Kim Đan → Nguyên Anh (mỗi cảnh giới 9 tầng), mở rộng bằng dữ liệu |
| Hướng tu | 1 chủ tu + tối đa 2 phụ tu (mỗi phụ tu làm chậm tu vi nhận được, xem mục 9b). Ban đầu: Kiếm tu, Thuật tu, Đan tu; Thể tu và Trận/Phù tu để sau |
| Tiền tệ | Linh Thạch (giao dịch tự do), Cống Hiến (khóa, từ nhiệm vụ, dùng cho tông môn), Tiên Ngọc (tiền nạp) |
| Nạp tiền | Có sẵn sổ cái, đơn nạp, trang admin cộng tiền thủ công. **Chưa** nối cổng thanh toán |
| Giao dịch | Giao dịch trực tiếp 2 người + chợ đăng bán + đấu giá |
| Hạ tầng | Cloudflare. **Gói áp dụng theo kế hoạch (vận hành thật): Workers Paid.** **Khi phát triển: dùng Workers Free nếu không cần thiết phải nâng.** Nếu một kỹ thuật/công nghệ cần bản Paid thì phải báo người dùng để nâng cấp, không tự giả định (xem mục 2a) |
| Ngôn ngữ | Giao diện game: tiếng Việt. Code (hàm, biến, comment): tiếng Anh |

> **Các mục 2 (hình dạng deploy), 2a (gói Cloudflare Free/Paid), 3 (bảng sở hữu trạng thái), 5 (vòng đời Map DO và netcode), 6 (đặc tả asset) và 8 (xác thực) đã chuyển sang `docs/TECHNICAL.md`, giữ nguyên số mục.**

## 4. Toàn vẹn kinh tế (làm từ Giai đoạn 1, dù chợ/giao dịch ra ở GĐ3)
- Mỗi vật phẩm là một **instance có ID duy nhất** (`item_instances`), không dùng số lượng gộp cho trang bị/đồ hiếm.
- **Sổ cái tiền tệ append-only** (`currency_ledger`): `id, character_id, currency, delta, reason, actor, idempotency_key, created_at`. `idempotency_key` unique để chống ghi lặp. Cộng tiền admin, đơn nạp, thưởng nhiệm vụ, thuế chợ đều ghi cùng một bảng.
- Số dư cập nhật bằng **batch D1 atomic với điều kiện** (`UPDATE ... WHERE balance >= ?`), không đọc-rồi-ghi.
- Giao dịch trực tiếp và mua chợ: 1 batch duy nhất chuyển đồ + tiền; kiểm tra chủ sở hữu và trạng thái trong chính câu lệnh.
- Hòm thư để người bán offline vẫn nhận tiền.
- Tiền sink: thuế chợ, phí sửa đồ, đột phá, luyện chế; có dashboard admin theo dõi tổng cung từng loại tiền.

## 7. Tiếng Việt
- Font web đủ dấu tiếng Việt cho lớp UI HTML. **Tránh bitmap font của Phaser** trừ khi tự sinh đủ glyph tiếng Việt.
- Mọi chuỗi hiển thị nằm trong `client/src/locales/vi.ts` (và dữ liệu game có trường `name_vi`, `desc_vi`); code không hard-code chuỗi hiển thị.

## 9. Luật chơi mặc định (bạn có thể sửa từng mục)
- **Sát khí**: tăng khi giết người chơi tên trắng/xám; **giết người tên đỏ không tăng sát khí**. Chỉ giảm khi **online** (theo thời gian) hoặc khi bị giết.
- **Bảo hộ tân thủ**: dưới cấp (mặc định Luyện Khí tầng 5) không bị PK ở bản đồ thường.
- **Phân cấp tên**: trắng → vàng → cam → đỏ; xác suất rơi đồ tăng theo cấp; vệ binh NPC tấn công người tên đỏ trong bán kính aggro nhất định.
- **Phụ tu**: hệ số EXP = `1 / (1 + k·n)` với `n` là số nhánh phụ, `k` chỉnh được trong cấu hình (hiện 0,25); mỗi phụ tu tốn vật phẩm hướng tu và Linh Thạch (chủ tu chỉ tốn vật phẩm); tối đa 2 phụ tu.
- **Điểm tiềm năng**: nhận mỗi tầng; các chỉ số gốc (Căn cốt, Thân pháp, Ngộ tính, Linh lực, Thần thức, Phúc duyên) quy ra chỉ số chiến đấu bằng công thức trong `shared/`.
- **Ngũ hành**: Kim/Mộc/Thủy/Hỏa/Thổ, bảng nhân sát thương (tương khắc ×1.2, bị khắc ×0.8, không còn bonus tương sinh; đổi từ ×1.3/×0.75/×1.05 theo người dùng 2026-10-18); linh căn nhân vật quyết định tư chất.
- **Phẩm cấp linh căn** (đã chốt, đã làm ở GĐ1): trục chất lượng, server tung một lần khi tạo nhân vật: Hạ phẩm 50%, Trung phẩm 30%, Thượng phẩm 13%, Địa 5%, Thiên 2%; thưởng tu vi -10/0/+10/+25/+50%, điểm tiềm năng khởi đầu +0/1/2/4/6. Số liệu ở `shared/src/progression-data.ts` (`ROOT_GRADES`).
  - **Cập nhật 2026-10-18 (hai trục, xem `docs/PHASE2.md` mục "Ghi chú triển khai (2c): linh căn nhiều hệ"):** phẩm cấp nay thưởng tu vi **-10/+5/+15/+30/+50%** và cộng **sát thương theo hệ của mình 0/+5/+10/+20/+30%** (điểm khởi đầu và tỉ lệ tung giữ nguyên). **Số hệ** (đơn 20%, song 48%, tam 25%, tứ 5%, ngũ 2%) chỉ đổi tốc độ tu vi (+10/0/-15/-30/-40%) và không cộng sát thương (riêng đòn thường nay xét mọi hệ khi tính khắc, xem mục 9b); nhiều hệ thì **chọn hệ** khi gán kỹ năng tấn công vào phím tắt (cập nhật: mỗi cảnh giới mọi người có đúng 2 kỹ năng linh căn, xem `docs/PHASE2.md` mục "Ghi chú triển khai (2c): kỹ năng có cảnh giới, phẩm cấp, thuần thục"; phần thưởng sát thương theo phẩm cấp nay thuộc sức mạnh kỹ năng). Hai thưởng tu vi cộng với nhau (ngũ linh căn Thiên phẩm: -40% + 50% = +10%).
  - **Không cho đổi linh căn ở GĐ1.** Sau này chỉ đổi qua vật phẩm hiếm trong game (ghi sổ cái, không bán trực tiếp bằng tiền nạp), làm ở giai đoạn khác.
  - **Trục số hệ** (đơn/song/tam/tứ/ngũ linh căn, linh căn biến dị Lôi/Băng/Phong) làm ở **GĐ2**, cùng lúc ngũ hành đầy đủ vào chiến đấu; thiết kế bảng sát thương ngũ hành hiện tại phải mở rộng được cho hệ này. **Đã làm ở 2c (số hệ 1-5); biến dị Lôi/Băng/Phong chưa.**
- **Thể chất** (yêu cầu của người dùng, 2026-10-17; dữ liệu đã làm, hiệu ứng làm ở 2c): trục thứ hai bên cạnh linh căn. Đa số nhân vật là **Phàm Thể** (khoảng 93%); số ít sinh ra đã có thể chất đặc biệt (Tiên Thiên Kiếm Thể, Lôi Thể, Thủy Linh Thể, Trọng Đồng, Tiên Cốt, Thánh Thể…, tỉ lệ thấp, tung một lần khi tạo nhân vật). Mỗi thể chất có **thang cấp bậc riêng, dài ngắn khác nhau** (ví dụ Thánh Thể → Đại Thánh Thể → Tiên Thể; Phàm Thể chỉ một cấp) và cấp cao càng hiếm. Mỗi thể chất có buff riêng, giống ngũ hành linh căn: Thủy Linh Thể tăng sát thương và độ thuần thục kỹ năng hệ Thủy, Kiếm Thể tăng cho kỹ năng kiếm… (mỗi cấp cộng thêm một lượng bằng cấp 1). Có thể nhận được thêm qua **vật phẩm đặc biệt** (làm sau, ghi sổ cái/vật phẩm như đổi linh căn: không bán trực tiếp bằng tiền nạp). Danh mục (tên, cấp, tỉ lệ, hiệu ứng theo chỉ số và đối tượng) là **dữ liệu trong D1** để admin chỉnh sau này (`docs/PHASE2.md` mục "Hệ thống thể chất"; bản mặc định/seed ở `shared/src/constitutions.ts`).
- **Đột phá cảnh giới** (đã chốt cho GĐ1, cập nhật ở 2d-A): tiến độ **dừng ở tầng 9** của mỗi cảnh giới; EXP ở mức đầy vẫn tràn thêm một phần (xem mục 9b). Cơ chế đột phá làm ở 2d-A.
- **Vùng quái** (đã chốt, xem `docs/PHASE1.md` mục 1d+): bản đồ có cảnh giới; quái theo cụm cố định theo bậc (1, 4, 7 và nhiều hơn khi mở rộng), tên hiện bậc và loại (thường / hiếm hai hạng / boss); nhịp lên cấp là số quái cùng bậc cần giết tăng theo cấp (Luyện Khí 1 khoảng 30, Luyện Khí 5 khoảng 50, Trúc Cơ 2 khoảng 100); săn ở bản đồ cảnh giới cao hơn không cho nhiều EXP hơn mức tối đa ở bản đồ đúng cảnh giới. Boss: cực hiếm, một con mỗi bản đồ, thưởng chia theo đóng góp (70% sát thương + 30% kết liễu), tiền theo tỉ lệ, đồ ngẫu nhiên có trọng số, dưới 10% không được chia; làm sau 1e.
- **Tự đánh trả** (đã làm cho quái ở GĐ1): đứng im, chưa có mục tiêu mà bị đánh thì tự đánh lại; đang đi thì không. Áp dụng cùng quy tắc cho PvP ở GĐ2.
- Chết: mất 10% EXP của tầng hiện tại (không xuống tầng; đã làm ở GĐ1), giảm độ bền (chờ có trang bị, GĐ2); hồi sinh ở thành.
- Đột phá cảnh giới có tỉ lệ thất bại, dùng đan dược tăng tỉ lệ.

## 9a. Chat nhiều chế độ (yêu cầu của người dùng; ĐÃ LÀM ở 2g)
Khung chat có 5 thẻ hiển thị, mỗi kênh một màu để phân biệt ở thẻ "Tất cả":
| Thẻ | Nội dung | Cách làm |
|---|---|---|
| Tất cả | Gộp mọi loại bên dưới | Chỉ là cách xem phía client. Ô nhập có bộ chọn kênh gửi (Thế giới / Bản đồ / Truyền âm) |
| Thế giới | Mọi người chơi, không phụ thuộc bản đồ hay kênh | Socket chat riêng `/ws/chat` tới `ChatHub` (không RPC chéo phòng, vì mỗi RPC tốn một request và đánh thức phòng ngủ). Cách nhau 5 giây, tối đa 3 tin/phút; lọc từ như cũ. Chưa tốn Linh Thạch |
| Bản đồ | Người chơi cùng bản đồ và cùng kênh (phòng) | Như chat cũ, qua socket game |
| Truyền âm | Chat riêng giữa hai người theo đạo hiệu | Qua `ChatHub`, tra người nhận trong các socket chat đang mở. Offline thì báo lỗi, chưa gửi qua hòm thư. Danh sách chặn: chưa làm |
| Hệ thống | Tử vong, nhặt tiền/đồ, lên tầng, thông báo boss, kết quả giao dịch… | Client tự dựng dòng từ sự kiện sẵn có: **hai loại (người dùng chốt 2026-10-19)**: xanh ngọc (info) cho mọi thông báo còn lại (nhặt tiền/đồ, nhận tu vi, lên tầng, chuyển bản đồ, giao dịch, niệm phù, trang bị, hướng tu, kỹ năng; chỉ ở thẻ Hệ thống, không hiện ở thẻ Tất cả), đỏ (system) cho điều quan trọng (tử vong, đột phá, boss xuất hiện, thông báo admin, và đồ rơi gửi hòm thư vì hết hạn sau 30 phút; chỉ hiện ở thẻ Tất cả và Hệ thống; lỗi từ chối thao tác chỉ hiện ở thẻ đang dùng lúc đó; có nút xóa toàn bộ chat). Tài khoản admin còn gửi được thông báo hệ thống tới toàn bộ người online qua `ChatHub` (kênh gửi "Hệ thống"). Thông báo boss do server sau này cần một đường server riêng |
Giao thức: tin `chat` mang `channel` (`world | map | whisper`), thiếu thì coi là `map`; bản sao truyền âm của người gửi mang `toName`. Mỗi thẻ có đếm tin chưa đọc; lịch sử chỉ giữ ở client. Chi tiết vận hành và giới hạn: `docs/PHASE2.md` mục 2g.

## 9b. Thay đổi tổng quan so với kế hoạch gốc (cập nhật 2026-10-18)
Chi tiết kỹ thuật và giá trị nằm ở `docs/PHASE2.md`; đây chỉ là các điểm khác hoặc bổ sung so với các mục phía trên.
- **Túi đồ:** mỗi tab **8×8** ô (không phải 8×16), mở thêm tab bằng **Linh Thạch** (giá mặc định 1000, chỉnh được ở màn admin qua bảng cài đặt game `game_settings`), tối đa 10 tab. Đồ rơi khi túi đầy vào hòm thư 30 phút.
- **Kỹ năng không còn "mở theo tầng":** mỗi cảnh giới nhân vật được cấp **2 kỹ năng linh căn** (1 tấn công + 1 ngẫu nhiên: tấn công, hồi máu, buff hoặc bị động), tung một lần và lưu. Kỹ năng không gắn hệ: nhân vật nhiều hệ chọn hệ khi gán phím tắt. Có 4 nguồn kỹ năng (cửa sổ 4 tab): linh căn, pháp bảo, tông môn (chưa làm), học được (bí tịch, sau này NPC).
- **Cảnh giới, phẩm cấp, thuần thục:** kỹ năng có cảnh giới và phẩm cấp (kỹ năng linh căn dùng phẩm cấp linh căn), cảnh giới/phẩm cấp cao thì mạnh hơn. Kỹ năng linh căn, tông môn, học được có **cấp thuần thục** nhập môn → tiểu thành → đại thành → viên mãn (→ thần thông cho phẩm cấp cao), tăng bằng cách dùng hoặc bằng vật phẩm Ngộ Đạo Đan. Phần thưởng sát thương theo phẩm cấp linh căn (mục 9) nay nằm trong sức mạnh kỹ năng, chỉ đòn thường còn áp riêng.
- **Pháp bảo có kỹ năng:** pháp bảo thường (mỗi ô một kỹ năng tấn công theo hệ), bản mệnh (kỹ năng đặc biệt mạnh hơn), phi hành (dịch chuyển tức thời, buff né tránh). Sức mạnh theo cảnh giới và bậc của món. Tốc độ di chuyển của pháp bảo phi hành vẫn chưa nối vào gameplay.
- **Đột phá cảnh giới (2d-A):** phải có **Đan Đột Phá** đúng bước (thêm đan thì dễ hơn), tốn Linh Thạch, và phải **đứng yên** một khoảng thời gian (1 phút ở Luyện Khí, lâu hơn ở cảnh giới cao); bị đánh, di chuyển, tấn công hay mất kết nối giữa chừng thì **thất bại** (mất đan, tiền, phần tu vi tràn và 30% tu vi tầng 9). Tu vi đầy ở tầng 9 vẫn tràn thêm tối đa 100%: tràn 50% được +5% tỉ lệ, tăng đều tới +15% khi tràn 100%; phần tràn mất khi bắt đầu đột phá, thất bại thì thanh tu vi còn 70%. Thành công: tầng 1 của cảnh giới mới, điểm tiềm năng theo linh căn và thể chất, 2 kỹ năng linh căn mới. Đan rơi từ quái (càng cao cấp càng hiếm); đan Đột Phá Trúc Cơ còn có từ nhiệm vụ đột phá làm một lần của Trưởng Lão (2e-B, đã làm; thương nhân NPC không bán đan đột phá); đan cao cấp sẽ có thêm từ boss (2h) và chợ. Chi tiết và giá trị tạm: `docs/PHASE2.md` mục 2d.
- **Hệ của quái và đa linh căn (2026-10-18):** mỗi lần quái sinh ra hoặc hồi sinh **tung một hệ ngẫu nhiên** (mỗi lần độc lập, không xoay vòng), hiện ở tên và màu thân quái. Ngũ hành tính **một chiều từ phía người đánh**: so từng hệ của người đánh với từng hệ của người bị đánh, mỗi cặp +1 nếu khắc, −1 nếu bị khắc, 0 nếu còn lại, rồi cộng: tổng dương ×1.2, âm ×0.8, bằng 0 ×1. Kỹ năng có một hệ, đòn thường dùng mọi hệ của người đánh. Chi tiết và ví dụ: `docs/PHASE2.md` mục "Hệ của quái".
- **Hướng tu (2d-B, 2026-10-18):** từ Trúc Cơ nhận vật phẩm hướng tu (qua nhiệm vụ nhập môn của NPC Đạo Sư riêng từng hướng, xem bên dưới) rồi chọn hướng; hướng đầu là **chủ tu**, sau đó tối đa 2 **phụ tu** (tốn thêm Linh Thạch). Chủ tu mạnh hơn phụ tu (phụ tu cho một nửa); mỗi phụ tu làm tu vi nhận được nhân `1 / (1 + 0,25·số phụ tu)`. Mỗi hướng có các cấp (ví dụ Kiếm Tâm, Kiếm Ý, Nhân Kiếm Hợp Nhất; Học Đồ, Đan Sư): khi các kỹ năng của cấp hiện tại đạt thuần thục tối đa thì lên cấp và nhận kỹ năng mới. Có thể đổi chủ tu hoặc bỏ một hướng nhưng tốn Linh Thạch theo cấp hướng tu (bỏ chủ tu tốn gấp đôi). Kiếm tu: công kích và sát thương kỹ năng khi cầm kiếm; Thuật tu: linh lực tối đa và sát thương kỹ năng theo hệ; Đan tu: phòng thủ, hồi máu từ đan và thuần thục từ Ngộ Đạo Đan. Chi tiết và giá trị tạm: `docs/PHASE2.md` mục 2d-B.
- **Thương nhân NPC (2e-A, 2026-10-19):** trong thành có một thương nhân (bấm vào để mở cửa sổ; đi ra xa thì cửa sổ tự đóng). Bán đan hồi máu, Ngộ Đạo Đan, trang bị và pháp bảo cơ bản Luyện Khí (chọn hệ), vài bí tịch (hai quyển cơ bản của Luyện Khí và bí tịch hệ của Trúc Cơ; không giới hạn số lần mua) bằng Linh Thạch, **không bán đan đột phá**; có món không giới hạn, có món giới hạn mỗi ngày (đặt lại 0 giờ giờ Việt Nam). Mua lại đồ của người chơi ở **15% giá trị** (trang bị mòn rẻ hơn), không thu mua đan đột phá, vật phẩm hướng tu, bí tịch hay đồ đang mặc; có bán nhanh nhiều món một lần. **Thêm cơ chế vật phẩm mới: Truyền Tống Phù** (niệm 5 giây rồi về thành đó, bị ngắt nếu di chuyển hoặc bị đánh và khi đó không mất phù; giá 2.000 Linh Thạch cho Thanh Vân Thành, thành cấp cao đắt hơn; mỗi thành thương nhân bán phù của thành đó, không rơi từ quái, giao dịch giữa người chơi để GĐ3). Mọi giá và giới hạn là giá trị tạm. Chi tiết: `docs/PHASE2.md` mục 2e-A.
- **Nhiệm vụ (2e-B, 2026-10-19):** NPC nhiệm vụ riêng (Trưởng Lão) trong thành giao nhiệm vụ theo chuỗi; chuỗi tân thủ 6 bước (gặp Thương nhân, giết quái, nộp vật liệu, đạt tầng 5, hạ quái Tinh Anh, đạt tầng 9). Thưởng Linh Thạch, vật phẩm và EXP (EXP theo luật EXP của quái: vượt thanh thì lên tầng, tầng 9 tràn tối đa 100%, phần dư mất; đột phá cảnh giới vẫn cần đan). **Mọi định nghĩa nhiệm vụ là dữ liệu trong D1** (mục tiêu giết quái, nộp vật phẩm, đạt cảnh giới, nói chuyện; phần thưởng) để màn admin chỉnh và thêm nhiệm vụ sau mà không sửa code. Mỗi hướng tu có **NPC Đạo Sư riêng** giao nhiệm vụ nhập môn **khác nhau theo hướng** (từ Trúc Cơ; kiếm: hạ 30 quái, thuật: nộp Yêu Đan và Linh Thảo, đan: nộp Linh Thảo và Hồi Huyết Đan; nhận vật phẩm hướng tu; bỏ hướng thì làm lại được); Trưởng Lão giao nhiệm vụ đột phá một lần (nộp nguyên liệu nhận Đan Đột Phá Trúc Cơ). Nút nhận vật phẩm hướng tu tạm chỉ còn cho admin (server kiểm). Chi tiết: `docs/PHASE2.md` mục 2e-B.
- **PvP, sát khí, sát nhân, anh hùng (2f, 2026-10-20):** có **công tắc PK** (mặc định tắt mỗi lần vào, chỉ bản đồ ngoài thành); dưới Luyện Khí tầng 5 không bị đánh và cũng không đánh được người. Ba điểm riêng: **sát khí** (+10 mỗi người giết, −50 khi bị người giết, trên 200 thì tăng sát thương 5% đến 15% ở 1000), **sát nhân** (+100 khi giết người trắng/vàng; màu tên trắng 0, vàng 1-200, cam 201-500, đỏ từ 501; giảm 5 mỗi phút online, −50 khi bị giết, −50/−100 khi giết người cam/đỏ), **anh hùng** (chỉ khi sát nhân 0: giết cam +20, đỏ +50; mốc 200 cộng 5% linh lực, mốc 500 cộng 10% linh lực và 5% tỉ lệ rơi đồ; giết trắng/vàng thì về 0). Tên xám chỉ hiện với người bị đánh trong 3 phút. **Rơi đồ (2026-10-21):** người tên vàng/cam/đỏ bị người chơi giết thì có 10%/25%/50% mất một món (cả chồng vật phẩm trong túi hoặc một món đang mặc, trừ pháp bảo bản mệnh) sang hòm thư người giết (không hết hạn); mọi cái chết của tên cam/đỏ hao độ bền nặng hơn (10%/20% thay vì 5%). **Vệ binh** ở mọi cổng (thành, rừng, hang) chỉ đánh người tên cam/đỏ (sát nhân từ 201) và ai đánh nó, mạnh như người mặc đủ đồ cảnh giới cao hơn bản đồ một bậc với HP ×5 và 4 kỹ năng; đánh vệ binh cần bật PK; giết vệ binh không nhận gì và tăng sát khí, sát nhân như giết người tên trắng. Chi tiết: `docs/PHASE2.md` mục 2f.
- **Nhiệm vụ: cửa sổ và hướng tu hai bước (2026-10-20):** nút "Nhiệm vụ" dưới "Túi đồ" mở cửa sổ 2 tab (Đang làm / Đã xong), có Theo dõi (tối đa 3, hiện dưới HP/MP) và Bỏ nhiệm vụ (về như chưa nhận); NPC chỉ liệt kê nhiệm vụ nhận được hoặc đang làm, theo thứ tự đã nhận, và ẩn nhiệm vụ nhập môn của hướng tu nhân vật đã có. Mỗi hướng tu có **2 nhiệm vụ làm lần lượt** (khác nhau theo hướng); chỉ bước 2 phát vật phẩm hướng tu. Mục chỉ admin thấy trong giao diện chính có tiền tố "GM · ". Chi tiết: `docs/PHASE2.md` mục 2e-B PR3.
- **2e hoàn tất (2026-10-20):** nhiệm vụ hằng ngày (mở lại 0 giờ giờ Việt Nam), thưởng Cống Hiến, thông báo khi nhiệm vụ đủ điều kiện trả; chi tiết `docs/PHASE2.md` mục 2e-B PR4.
- **PK ba trạng thái (2026-10-20):** thay công tắc bật/tắt bằng Tắt / PK (chỉ đánh người PK hoặc Đồ sát) / Đồ sát (đánh tất cả); giữ qua đổi bản đồ; người bị đánh luôn đánh lại được trong 3 phút dù đang tắt, và hết "đánh chủ động" ngay khi một bên giết bên kia; nhãn "· PK" nâu/đỏ sau tên. Chi tiết: `docs/PHASE2.md` mục 2f.
- **Sửa luật PvP và NPC (2026-10-21):** (1) bị người khác đánh mà chạy qua cổng sang bản đồ khác (ví dụ vào thành) thì mọi "đánh nhau" với người đó kết thúc ngay (tên xám, quyền đánh trả); chỉ mất kết nối rồi vào lại cùng phòng thì không xóa. (2) **Sát nhân chỉ cộng khi người giết đang có anh hùng = 0:** người có anh hùng trên 0 giết người trắng/vàng (hoặc vệ binh) thì chỉ mất hết anh hùng, không cộng sát nhân. (3) **Người tên cam/đỏ (sát nhân từ 201) bị cấm tương tác với mọi NPC:** cửa sổ nhiệm vụ và cửa sổ thương nhân chỉ hiện "Người chơi sát nhân bị cấm tương tác với NPC.". (4) Đột phá dùng chung thanh tiến độ vàng giữa màn hình với Truyền Tống Phù (đóng mọi cửa sổ, tiêu đề "Đột phá · Trúc Cơ Kỳ").
- **Bảng xếp hạng và boss (2h, 2026-10-21):** nút "Xếp hạng" với 5 thẻ (top 50, không tính admin): Cảnh giới (cảnh giới, tầng, tu vi), Võ lực, Tài phú (chỉ Linh Thạch), Trang bị, Pháp bảo. **Boss mỗi bản đồ** (Hắc Mộc Lâm: Huyết Lang Vương; U Minh Động: U Minh Quỷ Vương): chỉ một con cho cả các kênh của bản đồ đó, xuất hiện ngẫu nhiên khi quái hồi sinh (0,1%) hoặc chắc chắn sau một số lần giết trong phòng (Luyện Khí 500, Trúc Cơ 1500, giá trị tạm), không hồi sinh sau khi bị hạ; mạnh như một nhân vật cao hơn cảnh giới bản đồ một cảnh giới (như Vệ binh, bậc 2, sinh lực ×25; bản đồ Luyện Khí thì boss ngang Trúc Cơ 2), đứng riêng khỏi các cụm quái và dùng 3 kỹ năng (2 đánh, 1 hồi máu); thông báo cho mọi người online (kèm tên bản đồ và kênh). Thưởng chia theo đóng góp (70% sát thương + 30% đòn kết liễu), dưới 10% không được chia, phần bị loại chia lại cho người còn lại; chia cả EXP, Linh Thạch và từng món đồ (mỗi món về một người, ngẫu nhiên theo tỉ lệ). Chỉ người còn trong phòng và còn sống mới được chia. Chi tiết: `docs/PHASE2.md` mục 2h.
- **Quản lý thể chất bằng giao diện admin (2i, 2026-10-21):** trang `/admin-constitutions.html` sửa tên, tỉ lệ tung, cấp và hiệu ứng của mọi thể chất; không xóa được thể chất, không đổi được thể chất mặc định, hai admin lưu cùng lúc không đè nhau. Chi tiết `docs/PHASE2.md` mục 2i.
- **Giao diện:** thanh buff dưới thanh HP/MP (kỹ năng buff và đan hồi dần, kèm thời gian còn lại); cửa sổ trang bị 2 tab (trang bị / pháp bảo).

## 10. Các giai đoạn và tiêu chí nghiệm thu

### Danh sách giai đoạn và hạng mục
Tên các giai đoạn và hạng mục (chi tiết từng hạng mục nằm ở file giai đoạn tương ứng; trạng thái làm đến đâu ở `docs/STATUS.md`).
- **Giai đoạn 0**: Lát cắt rủi ro nhất (xương sống kỹ thuật)
- **Giai đoạn 1**: MVP chơi được (`docs/PHASE1.md`)
  - 1a. Tài khoản và nhân vật
  - 1b. Thế giới và trò chuyện
  - 1c. Chỉ số, cảnh giới, tiềm năng
  - 1d. Quái và chiến đấu realtime (kèm 1d+: Vùng quái, bậc, quái hiếm)
  - 1e. Kinh tế khung xương
  - 1f. Kiểm thử tải và hoàn thiện
- **Giai đoạn 2**: Chiều sâu nhân vật (`docs/PHASE2.md`)
  - 2a. Vật phẩm và túi đồ
  - 2b. Trang bị và độ bền
  - 2c. Kỹ năng, MP và ngũ hành đầy đủ
  - 2d. Chủ tu/phụ tu và đột phá
  - 2e. NPC thương nhân và nhiệm vụ
  - 2f. PvP, sát khí và vệ binh
  - 2g. Chat nhiều chế độ
  - 2h. Bảng xếp hạng và boss
  - 2i. Màn admin quản lý thể chất
- **Giai đoạn 3**: Kinh tế và xã hội (chưa chia hạng mục)
- **Giai đoạn 4**: Hoàn thiện và vận hành (chưa chia hạng mục)

Giai đoạn 3, 4 và các giai đoạn sau sẽ có file `docs/PHASE3.md`, `docs/PHASE4.md`... khi bắt đầu làm.

### Giai đoạn 0: Lát cắt rủi ro nhất (xương sống kỹ thuật)
Làm: `git init`, monorepo, Worker + DO + D1 migration deploy lên Cloudflare, map isometric mẫu, tap/click để di chuyển, **người chơi thứ hai hiển thị**.
Nghiệm thu:
- Deploy thật lên URL Cloudflare, có CI/CD hoặc script deploy 1 lệnh.
- 2 thiết bị (1 mobile, 1 desktop) cùng thấy nhau di chuyển mượt, độ trễ đo được và ghi lại.
- Reconnect sau khi rớt mạng không nhân đôi nhân vật.
- Tiếng Việt có dấu hiển thị đúng trên cả hai thiết bị.

### Giai đoạn 1: MVP chơi được
Đăng ký/đăng nhập, tạo nhân vật (linh căn, tên), nhiều bản đồ + portal, chat, quái + chiến đấu realtime, EXP và cảnh giới Luyện Khí→Nguyên Anh, chỉ số tiềm năng, **sổ cái tiền tệ + item instance + hòm thư (khung xương)**, trang admin cộng tiền thủ công, lưu/đọc nhân vật.
Nghiệm thu:
- Người mới tạo nhân vật, đánh quái, lên tầng, thoát và vào lại giữ đúng trạng thái.
- Đăng nhập 2 nơi không làm nhân đôi.
- Test tự động cho công thức shared và sổ cái (idempotency, không âm tiền).
- 50 client giả lập trên 1 bản đồ giữ tick ổn định.

### Giai đoạn 2: Chiều sâu nhân vật
(Bản nháp chia nhánh: `docs/PHASE2.md`.)
Túi đồ, trang bị, pháp bảo, kỹ năng/bí pháp, chọn chủ tu/phụ tu, NPC thương nhân, nhiệm vụ (chuỗi), ngũ hành đầy đủ, PvP + sát khí, vệ binh NPC, bảng xếp hạng.
**Chat nhiều chế độ** (xem mục 9a). Nghiệm thu: một nhân vật đi trọn chuỗi nhiệm vụ tân thủ; công thức sát thương ngũ hành đúng test; sát khí/rơi đồ/vệ binh theo đúng luật mặc định.

### Giai đoạn 3: Kinh tế và xã hội
Giao dịch trực tiếp, chợ đăng bán + đấu giá, thú cưỡi, nghề phụ (luyện đan, luyện khí), tông môn (Cống Hiến), đơn nạp Tiên Ngọc + trang admin.
Nghiệm thu: giao dịch/mua bán chạy atomic, **test đua (race) không tạo dupe**; đấu giá kết thúc đúng; người bán offline nhận tiền qua hòm thư; tổng cung tiền có dashboard.

### Giai đoạn 4: Hoàn thiện và vận hành
Tối ưu mobile, boss thế giới, bí cảnh, động phủ, thể tu + trận/phù tu, tích hợp cổng thanh toán (sau khi chọn nhà cung cấp), quên mật khẩu qua email, giám sát và log, cân bằng.

## 11. Phụ thuộc bạn cần cung cấp sau
- Cổng thanh toán (khi sẵn sàng nạp thật) và khóa của chính bạn.
- Dịch vụ gửi email (quên mật khẩu).
- Tên miền (nếu muốn dùng thay `*.workers.dev`).
- Art thay thế khi có.

## 12. Rủi ro chính
- Giới hạn 1 luồng/DO → cần giới hạn dân số kênh, đo ở GĐ0.
- Dupe/lạm phát tiền → sổ cái + atomic từ GĐ1, test đua ở GĐ3.
- Asset isometric nhân vật 8 hướng khó kiếm CC0 → dùng placeholder theo đặc tả chuẩn.
- Mobile hiệu năng → area-of-interest, atlas nén, giới hạn số sprite.
