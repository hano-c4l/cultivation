# Trạng thái dự án

Cập nhật: 2026-10-20 (2e hoàn tất và 2f PR1 PvP đã lên production, cùng các sửa lỗi giao diện nhiệm vụ/PK). File này **chỉ** nói giai đoạn nào đã xong, đang làm gì, làm tiếp gì. Chi tiết nằm ở: `docs/PLAN.md` (kế hoạch tổng và thay đổi tổng quan), `docs/TECHNICAL.md` (hạ tầng, môi trường, cách chạy, kiểm thử, quy trình, bẫy), `docs/PHASE1.md`, `docs/PHASE2.md` (chi tiết, quyết định, giá trị tạm, tồn đọng từng giai đoạn). Quy trình nhánh/deploy: `CLAUDE.md`.

## Đã xong
- **Giai đoạn 0** (xương sống kỹ thuật) và **giai đoạn 1** (MVP: tài khoản, thế giới, chat, chỉ số/cảnh giới, quái và chiến đấu, kinh tế khung xương). Riêng 1f (đo tải thật 50 client trên Cloudflare) **hoãn theo quyết định của người dùng**.
- **Giai đoạn 2, các phần đã xong (đều đã ở production):** 2g chat nhiều kênh · 2a vật phẩm, túi đồ 8×8, hòm thư, mua tab, cài đặt game chỉnh ở admin · 2b trang bị, độ bền, giới tính, pháp bảo bản mệnh/phi hành · 2c kỹ năng, MP, thanh phím tắt, bí tịch, linh căn 1-5 hệ, thuần thục · hệ thống thể chất · 2d đột phá cảnh giới và hướng tu chủ tu/phụ tu · **2e NPC thương nhân (mua/bán, giới hạn theo ngày, bán nhanh, Truyền Tống Phù) và nhiệm vụ (NPC Trưởng Lão, chuỗi tân thủ 6 bước, Đạo Sư riêng từng hướng tu, nhiệm vụ đột phá một lần, nhiệm vụ hướng tu hai bước, nhiệm vụ hằng ngày, thưởng Cống Hiến, cửa sổ Nhiệm vụ có theo dõi và bỏ nhiệm vụ; danh mục nhiệm vụ là dữ liệu D1)** · **2f PR1 PvP (PK ba trạng thái Tắt/PK/Đồ sát, sát khí, sát nhân, anh hùng, tên màu)**.

## Đang chạy ở đâu
- **Production** (`main`) và **Preview** (`preview`): cùng code; D1 đã áp dụng migration `0001`-`0024` (kiểm bằng `wrangler d1 migrations list DB --remote`).
- Admin phải kết nối lại sau mỗi lần deploy có thay đổi cờ admin (socket cũ không có cờ) thì các nút "GM · Nhận vật phẩm hướng tu/đột phá" mới dùng được. PK mặc định Tắt khi mở trang (client gửi lại trạng thái đã chọn sau mỗi lần đổi bản đồ).

## Đang làm dở
- **2f PvP, sát khí và vệ binh:** PR1 (công tắc PK, đánh người, bảo hộ tân thủ, ba loại điểm sát khí/sát nhân/anh hùng, tên màu; migration `0022`) xong và đã ở production. **PR2 (rơi đồ vào hòm thư người giết, độ bền giảm mạnh theo màu, vệ binh ở cửa rừng và hang) chưa bắt đầu**; chờ người dùng xác nhận vài mặc định của PR1 (xem `docs/PHASE2.md` mục 2f).
- **Điều tra rớt WebSocket khi đang đột phá (2026-10-20):** trên preview, một lần đột phá Trúc Cơ → Kim Đan của Admin bị rớt kết nối giữa chừng và mất đan cùng 30% tu vi; nghi do đường truyền (người dùng dùng Cloudflare One Client, ping khoảng 400 ms). **Luật giữ nguyên; đã thêm log** (`socket close|error|evicted` ở server, `conn report` do client gửi sau khi nối lại) để tái hiện và đọc nguyên nhân. Sau đó mới quyết định giữa "không mất đan và tu vi" hoặc "chờ khoảng 30 giây để nối lại" (chi tiết ở `docs/PHASE2.md`).
- Chưa thử tay: giao diện điện thoại của các cửa sổ mới, giữ trạng thái PK qua cổng bản đồ trong trình duyệt.

## Làm tiếp
1. **2f PR2** (rơi đồ, vệ binh, và area-of-interest nếu muốn) → **2i** màn admin thể chất → **2h** bảng xếp hạng và boss. Còn lại của 2d: cấp hướng tu ảnh hưởng chỉ số. Các màn admin (chỉnh nhiệm vụ, thể chất, giá thương nhân...) **làm sau** theo người dùng. **2e đã xong**; màn admin chỉnh nhiệm vụ làm sau.
2. Việc nhỏ tồn đọng (chi tiết ở `docs/PHASE2.md`, mục "Việc nhỏ đang chờ quyết định hoặc chưa làm"): tốc độ pháp bảo phi hành vào di chuyển, biến dị Lôi/Băng/Phong, kỹ năng tông môn và học từ NPC, tiền tệ trong thư, nhận thể chất qua vật phẩm, tung lại số hệ cho nhân vật có sẵn, admin chỉnh màu giao diện và giá/giới hạn của thương nhân, thang đo thật `rows_written` của thương nhân và nhiệm vụ trên Cloudflare, giao diện thương nhân và nhiệm vụ trên điện thoại chưa thử, đường tính quái hiếm của nhiệm vụ trong phòng mới có unit test.

## Vấn đề tồn đọng cần để ý
- Đo tải thật trên Cloudflare chưa làm; chỉ nâng Workers Paid khi gặp dấu hiệu ở `docs/TECHNICAL.md` (mục "Giới hạn gói Free").
- Rất nhiều con số cân bằng đang là **giá trị tạm** (rơi đồ, kỹ năng, thuần thục, giá và giới hạn của thương nhân...), được liệt kê ở mục tương ứng trong PHASE1.md/PHASE2.md.
- `tools/refine-smoke.mjs` thỉnh thoảng báo lệch vài EXP giữa pháp bảo bản mệnh và nhân vật; chưa rõ nguyên nhân.
- Chưa có: rơi đồ khi bị giết, vệ binh, area-of-interest, boss, màn admin thể chất và màn admin nhiệm vụ, kỹ năng tông môn.
