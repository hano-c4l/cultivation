# Trạng thái dự án

Cập nhật: 2026-10-21 (2e, 2f xong và ở production; 2h xong và ở preview, chờ kiểm tay rồi mới lên production). File này **chỉ** nói giai đoạn nào đã xong, đang làm gì, làm tiếp gì. Chi tiết nằm ở: `docs/PLAN.md` (kế hoạch tổng và thay đổi tổng quan), `docs/TECHNICAL.md` (hạ tầng, môi trường, cách chạy, kiểm thử, quy trình, bẫy), `docs/PHASE1.md`, `docs/PHASE2.md` (chi tiết, quyết định, giá trị tạm, tồn đọng từng giai đoạn). Quy trình nhánh/deploy: `CLAUDE.md`.

## Đã xong
- **Giai đoạn 0** (xương sống kỹ thuật) và **giai đoạn 1** (MVP: tài khoản, thế giới, chat, chỉ số/cảnh giới, quái và chiến đấu, kinh tế khung xương). Riêng 1f (đo tải thật 50 client trên Cloudflare) **hoãn theo quyết định của người dùng**.
- **Giai đoạn 2, các phần đã xong (2a-2g đã ở production):** 2g chat nhiều kênh · 2a vật phẩm, túi đồ 8×8, hòm thư, mua tab, cài đặt game chỉnh ở admin · 2b trang bị, độ bền, giới tính, pháp bảo bản mệnh/phi hành · 2c kỹ năng, MP, thanh phím tắt, bí tịch, linh căn 1-5 hệ, thuần thục · hệ thống thể chất · 2d đột phá cảnh giới và hướng tu chủ tu/phụ tu · **2e NPC thương nhân (mua/bán, giới hạn theo ngày, bán nhanh, Truyền Tống Phù) và nhiệm vụ (NPC Trưởng Lão, chuỗi tân thủ 6 bước, Đạo Sư riêng từng hướng tu, nhiệm vụ đột phá một lần, nhiệm vụ hướng tu hai bước, nhiệm vụ hằng ngày, thưởng Cống Hiến, cửa sổ Nhiệm vụ có theo dõi và bỏ nhiệm vụ; danh mục nhiệm vụ là dữ liệu D1)** · **2f PvP, sát khí và vệ binh (PK ba trạng thái Tắt/PK/Đồ sát, sát khí, sát nhân, anh hùng, tên màu, rơi đồ vào hòm thư người giết, độ bền hao nặng theo màu tên, vệ binh ở mọi cổng kể cả thành)**.

- **2h bảng xếp hạng và boss: đã làm xong và đã ở preview, chưa lên production** (cùng đợt sửa luật PvP: thoát đánh nhau qua cổng, anh hùng chặn sát nhân, sát nhân bị cấm NPC, thanh đột phá). Chưa kiểm tay trên trình duyệt, xem `docs/PHASE2.md` mục 2h.

## Đang chạy ở đâu
- **Production** (`main`): code của 2f, D1 đã áp dụng migration `0001`-`0024`. **Preview**: có thêm 2h và các sửa luật PvP/NPC, D1 đã áp dụng `0001`-`0026`. Khi lên production phải chạy `db:migrate:remote` (0025, 0026) trước khi deploy (kiểm bằng `wrangler d1 migrations list DB --remote`).
- Admin phải kết nối lại sau mỗi lần deploy có thay đổi cờ admin (socket cũ không có cờ) thì các nút "GM · Nhận vật phẩm hướng tu/đột phá" mới dùng được. PK mặc định Tắt khi mở trang (client gửi lại trạng thái đã chọn sau mỗi lần đổi bản đồ).

## Đang làm dở
- **2f PvP: xong.** Ngoài phạm vi, chưa làm: area-of-interest, thông báo "bị PK" cho cả phòng, thời gian chờ khi tắt PK (xem `docs/PHASE2.md` mục 2f). Mọi con số của vệ binh, xác suất rơi và độ bền là giá trị tạm.
- **Điều tra rớt WebSocket khi đang đột phá (2026-10-20):** trên preview, một lần đột phá Trúc Cơ → Kim Đan của Admin bị rớt kết nối giữa chừng và mất đan cùng 30% tu vi; nghi do đường truyền (người dùng dùng Cloudflare One Client, ping khoảng 400 ms). **Luật giữ nguyên; đã thêm log** (`socket close|error|evicted` ở server, `conn report` do client gửi sau khi nối lại) để tái hiện và đọc nguyên nhân. Sau đó mới quyết định giữa "không mất đan và tu vi" hoặc "chờ khoảng 30 giây để nối lại" (chi tiết ở `docs/PHASE2.md`).
- Chưa thử tay: giao diện điện thoại của các cửa sổ mới, giữ trạng thái PK qua cổng bản đồ trong trình duyệt.

## Làm tiếp
1. **2i** màn admin thể chất (area-of-interest của 2f nếu muốn; kỹ năng đặc biệt của boss, xem `docs/PHASE2.md` mục 2h). Còn lại của 2d: cấp hướng tu ảnh hưởng chỉ số. Các màn admin (chỉnh nhiệm vụ, thể chất, giá thương nhân...) **làm sau** theo người dùng. **2e đã xong**; màn admin chỉnh nhiệm vụ làm sau.
2. Việc nhỏ tồn đọng (chi tiết ở `docs/PHASE2.md`, mục "Việc nhỏ đang chờ quyết định hoặc chưa làm"): tốc độ pháp bảo phi hành vào di chuyển, biến dị Lôi/Băng/Phong, kỹ năng tông môn và học từ NPC, tiền tệ trong thư, nhận thể chất qua vật phẩm, tung lại số hệ cho nhân vật có sẵn, admin chỉnh màu giao diện và giá/giới hạn của thương nhân, thang đo thật `rows_written` của thương nhân và nhiệm vụ trên Cloudflare, giao diện thương nhân và nhiệm vụ trên điện thoại chưa thử, đường tính quái hiếm của nhiệm vụ trong phòng mới có unit test.

## Vấn đề tồn đọng cần để ý
- Đo tải thật trên Cloudflare chưa làm; chỉ nâng Workers Paid khi gặp dấu hiệu ở `docs/TECHNICAL.md` (mục "Giới hạn gói Free").
- Rất nhiều con số cân bằng đang là **giá trị tạm** (rơi đồ, kỹ năng, thuần thục, giá và giới hạn của thương nhân...), được liệt kê ở mục tương ứng trong PHASE1.md/PHASE2.md.
- `tools/refine-smoke.mjs` thỉnh thoảng báo lệch vài EXP giữa pháp bảo bản mệnh và nhân vật; chưa rõ nguyên nhân.
- Chưa có: area-of-interest, màn admin thể chất và màn admin nhiệm vụ, kỹ năng tông môn.
