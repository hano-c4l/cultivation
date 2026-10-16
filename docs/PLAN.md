# Kế hoạch: Web game tu tiên (MMO nhỏ-vừa, 2.5D isometric)

Trạng thái: **CHỜ DUYỆT** — chưa viết code. Mọi mục "Mặc định" bên dưới đều có thể sửa.

## 1. Yêu cầu đã chốt
| Hạng mục | Quyết định |
|---|---|
| Quy mô | MMO nhỏ-vừa: mỗi bản đồ là 1 phòng realtime, ~50-100 người/bản đồ, nhiều kênh |
| Đồ họa | 2.5D isometric kiểu Võ Lâm Truyền Kỳ; asset CC0 + placeholder, **giữ đúng tỉ lệ để thay bằng art tự tạo/AI sau** |
| Chiến đấu | Realtime, click-to-move, auto-attack + cooldown, thanh phím tắt kỹ năng |
| PvP | Thành thị an toàn; bản đồ thường PvP được; chết mất ít EXP + độ bền; sát khí cao thì rơi đồ và bị NPC vệ binh đánh |
| Tài khoản | Email + mật khẩu; hỗ trợ mobile (cảm ứng) |
| Cảnh giới | Luyện Khí → Trúc Cơ → Kim Đan → Nguyên Anh (mỗi cảnh giới 9 tầng), mở rộng bằng dữ liệu |
| Hướng tu | 1 chủ tu + nhiều phụ tu (phụ tu làm chậm lên cấp). Ban đầu: Kiếm tu, Thuật tu, Đan tu; Thể tu và Trận/Phù tu để sau |
| Tiền tệ | Linh Thạch (giao dịch tự do), Cống Hiến (khóa, từ nhiệm vụ, dùng cho tông môn), Tiên Ngọc (tiền nạp) |
| Nạp tiền | Có sẵn sổ cái, đơn nạp, trang admin cộng tiền thủ công. **Chưa** nối cổng thanh toán |
| Giao dịch | Giao dịch trực tiếp 2 người + chợ đăng bán + đấu giá |
| Hạ tầng | Cloudflare. **Gói áp dụng theo kế hoạch (vận hành thật): Workers Paid.** **Khi phát triển: dùng Workers Free nếu không cần thiết phải nâng.** Nếu một kỹ thuật/công nghệ cần bản Paid thì phải báo người dùng để nâng cấp, không tự giả định (xem mục 2a) |
| Ngôn ngữ | Giao diện game: tiếng Việt. Code (hàm, biến, comment): tiếng Anh |

## 2. Hình dạng deploy
- **Một Worker duy nhất** phục vụ client (static assets), API HTTP, WebSocket, Durable Objects và D1. Cloudflare đang gộp Pages vào Workers nên **không có deploy Pages riêng**; đáp ứng yêu cầu "Workers and Pages" bằng Workers Static Assets.
- Monorepo (pnpm workspaces), thư mục gốc cần `git init` (hiện chưa là git repo):
  - `client/`: Vite + TypeScript, Phaser 3 (canvas) + lớp UI HTML/CSS phủ lên (inventory, chat, bảng nhiệm vụ).
  - `server/`: Worker, các Durable Object, migration D1.
  - `shared/`: kiểu dữ liệu, schema message (validate bằng zod hoặc tương đương), dữ liệu game (JSON/TS), công thức chỉ số/ngũ hành/cảnh giới, lưới đi được (walkability) dùng chung client/server.
  - `tools/`: script build map/atlas, seed dữ liệu.
  - `docs/`: tài liệu.

## 2a. Gói Cloudflare: Paid là đích, Free khi phát triển
- **Đích vận hành:** Workers Paid (CPU/request cao hơn, nhiều quota Durable Object và D1 hơn).
- **Khi develop:** mặc định chạy trên Workers Free để tiết kiệm; thiết kế code sao cho chạy được trong giới hạn Free (ví dụ băm mật khẩu nằm trong Durable Object vì Worker Free chỉ có 10 ms CPU, ghi D1 theo batch/debounce).
- **Quy tắc báo nâng cấp:** khi gặp việc mà giới hạn Free thực sự chặn (CPU 10 ms, quota request/GB-s của DO, 100k dòng ghi D1/ngày, kiểm thử tải 50 client, tick loop chạy liên tục...), trợ lý **dừng lại và thông báo người dùng** nêu rõ: giới hạn nào, vì sao cần Paid, có phương án né trong Free không. Chỉ nâng cấp khi người dùng đồng ý.
- Không thiết kế lệch kiến trúc chỉ để né Free nếu việc đó làm sai hướng so với bản Paid; khi nghi ngờ, hỏi người dùng.

## 3. Bảng sở hữu trạng thái (quan trọng nhất)
Nguyên tắc: **server là nguồn sự thật**; mỗi nhân vật chỉ có **1 writer** tại một thời điểm.

| Trạng thái | Bản chính nằm ở | Ghi xuống D1 khi nào |
|---|---|---|
| Vị trí, hướng, đường đi | `MapRoom` DO (bộ nhớ) | Khi rời bản đồ / ngắt kết nối / mỗi ~30-60s |
| HP/MP, buff, cooldown, sát khí tức thời | `MapRoom` DO | Khi rời bản đồ / ngắt kết nối / định kỳ (HP/MP không cần lưu chính xác) |
| EXP, cảnh giới, điểm tiềm năng, kỹ năng | `MapRoom` DO (bản làm việc), D1 là bản bền | Mỗi sự kiện quan trọng (lên tầng, học kỹ năng) và định kỳ |
| Túi đồ, trang bị | D1 (bản chính); DO giữ cache khi nhân vật online | Mỗi thay đổi có giá trị (nhặt/dùng/bỏ đồ hiếm), batch theo khoảng thời gian cho đồ rác |
| **3 loại tiền** | **D1 (sổ cái append-only)**; số dư là bản tổng hợp | **Đồng bộ mỗi giao dịch**, không bao giờ chỉ ở bộ nhớ |
| Escrow giao dịch trực tiếp | D1 (bảng `trade_sessions`) + DO điều phối | Atomic: batch D1 với cập nhật có điều kiện |
| Tin đăng chợ, đấu giá | D1 | Đồng bộ |
| Hòm thư (tiền/đồ cho người offline) | D1 (`mailbox`) | Đồng bộ |
| Phiên đăng nhập, khóa phiên | D1 + `PlayerSession` DO | Khi đăng nhập/đăng xuất |

Quy tắc bổ sung:
- **Session lock**: mỗi nhân vật có 1 khóa phiên; đăng nhập lần 2 sẽ đá phiên cũ (hoặc từ chối) để tránh nhân đôi trạng thái.
- **Chuyển bản đồ**: *lưu → giải phóng khóa bản đồ cũ → vào bản đồ mới*, theo đúng thứ tự này.
- **Không ghi D1 mỗi tick.** Chỉ batch theo khoảng thời gian và khi ngắt kết nối.
- Nếu DO bị evict đột ngột: tối đa mất ~30-60s tiến độ thường, **không bao giờ mất tiền/đồ giá trị** (vì ghi đồng bộ).

## 4. Toàn vẹn kinh tế (làm từ Giai đoạn 1, dù chợ/giao dịch ra ở GĐ3)
- Mỗi vật phẩm là một **instance có ID duy nhất** (`item_instances`), không dùng số lượng gộp cho trang bị/đồ hiếm.
- **Sổ cái tiền tệ append-only** (`currency_ledger`): `id, character_id, currency, delta, reason, actor, idempotency_key, created_at`. `idempotency_key` unique để chống ghi lặp. Cộng tiền admin, đơn nạp, thưởng nhiệm vụ, thuế chợ đều ghi cùng một bảng.
- Số dư cập nhật bằng **batch D1 atomic với điều kiện** (`UPDATE ... WHERE balance >= ?`), không đọc-rồi-ghi.
- Giao dịch trực tiếp và mua chợ: 1 batch duy nhất chuyển đồ + tiền; kiểm tra chủ sở hữu và trạng thái trong chính câu lệnh.
- Hòm thư để người bán offline vẫn nhận tiền.
- Tiền sink: thuế chợ, phí sửa đồ, đột phá, luyện chế; có dashboard admin theo dõi tổng cung từng loại tiền.

## 5. Vòng đời Map DO và netcode
- Mỗi **bản đồ + kênh** là một `MapRoom` DO (SQLite-backed, WebSocket Hibernation API).
- **Tick loop chỉ chạy khi có người chơi** (interval giữ DO không ngủ và tính phí thời lượng). Phòng trống: dừng tick, dùng **alarm** cho hồi sinh quái/tài nguyên.
- **Click-to-move**: client gửi ô đích → server chạy A* trên lưới đi được dùng chung → server phát `đường đi + thời điểm bắt đầu + tốc độ` → client nội suy. Không gửi vị trí mỗi frame.
- Chiến đấu xử lý trên tick server (~10-15Hz); client chỉ dự đoán hiệu ứng.
- **Area-of-interest**: chỉ gửi thực thể trong bán kính nhìn thấy, để 100 người không làm nghẽn client mobile.
- Chống gian lận: kiểm tra tốc độ, khoảng cách kỹ năng, giới hạn tần suất message, mọi tham số từ client đều validate bằng schema.
- Độ trễ cho người chơi Việt Nam: kiểm tra DO `locationHint` (APAC) và đo thực tế ở Giai đoạn 0.
- Tải nhiều người: DO chạy 1 luồng; sẽ có kênh phụ (`map:channel`) và giới hạn dân số mỗi kênh.

## 6. Đặc tả asset (để thay art sau không phải sửa code)
Con số cố định (có thể chỉnh trước khi bắt đầu, sau đó khóa lại):
- **Tile isometric: 64×32 px** (tỉ lệ 2:1). Chiều cao vật thể tính theo bội số 16 px.
- **Nhân vật: khung 96×96 px, 8 hướng, neo (anchor) ở chân** (giữa đáy). 1 đơn vị thế giới = 1 tile.
- Animation: `idle, run, attack, cast, hit, die` (số frame/hướng ghi trong manifest).
- **Thú cưỡi là layer tách riêng** (vẽ dưới/trên nhân vật theo hướng) để ghép được với mọi nhân vật.
- **Asset manifest** (`assets/manifest.json`): ánh xạ ID logic → file/atlas/neo/khung. Thay art chỉ sửa manifest và file ảnh.
- Bản đồ vẽ bằng **Tiled** (isometric) với layer: nền, vật thể, **collision**, spawn, portal, NPC. Script `tools/` build ra JSON + lưới đi được cho server.
- Cách tìm asset: tìm bộ CC0 isometric (OpenGameArt, itch.io, kho Kenney) lọc theo giấy phép, ghi nguồn vào `ASSETS.md`. Nhân vật tu tiên 8 hướng có animation nhiều khả năng sẽ phải dùng **placeholder** (hình khối/sprite tạm cùng kích thước chuẩn).

## 7. Tiếng Việt
- Font web đủ dấu tiếng Việt cho lớp UI HTML. **Tránh bitmap font của Phaser** trừ khi tự sinh đủ glyph tiếng Việt.
- Mọi chuỗi hiển thị nằm trong `client/src/locales/vi.ts` (và dữ liệu game có trường `name_vi`, `desc_vi`); code không hard-code chuỗi hiển thị.

## 8. Xác thực
- Băm mật khẩu bằng **PBKDF2 (WebCrypto)** với salt riêng, số vòng lặp cao.
- Phiên bằng cookie **HttpOnly, Secure, SameSite**; cookie này cũng xác thực lúc nâng cấp WebSocket.
- Giới hạn tần suất đăng nhập/đăng ký.
- **Quên mật khẩu qua email là phụ thuộc cần bạn cung cấp** (dịch vụ gửi mail) → để giai đoạn sau; trước đó admin đặt lại mật khẩu thủ công.

## 9. Luật chơi mặc định (bạn có thể sửa từng mục)
- **Sát khí**: tăng khi giết người chơi tên trắng/xám; **giết người tên đỏ không tăng sát khí**. Chỉ giảm khi **online** (theo thời gian) hoặc khi bị giết.
- **Bảo hộ tân thủ**: dưới cấp (mặc định Luyện Khí tầng 5) không bị PK ở bản đồ thường.
- **Phân cấp tên**: trắng → vàng → cam → đỏ; xác suất rơi đồ tăng theo cấp; vệ binh NPC tấn công người tên đỏ trong bán kính aggro nhất định.
- **Phụ tu**: hệ số EXP = `1 / (1 + k·n)` với `n` là số nhánh phụ, `k` chỉnh được trong cấu hình; tốn thời gian + tài nguyên cho mỗi nhánh.
- **Điểm tiềm năng**: nhận mỗi tầng; các chỉ số gốc (Căn cốt, Thân pháp, Ngộ tính, Linh lực, Thần thức, Phúc duyên) quy ra chỉ số chiến đấu bằng công thức trong `shared/`.
- **Ngũ hành**: Kim/Mộc/Thủy/Hỏa/Thổ, bảng nhân sát thương (tương khắc ×1.3, bị khắc ×0.75, tương sinh bonus nhỏ); linh căn nhân vật quyết định tư chất.
- Chết: mất ít EXP (không xuống tầng), giảm độ bền; hồi sinh ở thành.
- Đột phá cảnh giới có tỉ lệ thất bại, dùng đan dược tăng tỉ lệ.

## 10. Các giai đoạn và tiêu chí nghiệm thu

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
Túi đồ, trang bị, pháp bảo, kỹ năng/bí pháp, chọn chủ tu/phụ tu, NPC thương nhân, nhiệm vụ (chuỗi), ngũ hành đầy đủ, PvP + sát khí, vệ binh NPC, bảng xếp hạng.
Nghiệm thu: một nhân vật đi trọn chuỗi nhiệm vụ tân thủ; công thức sát thương ngũ hành đúng test; sát khí/rơi đồ/vệ binh theo đúng luật mặc định.

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
