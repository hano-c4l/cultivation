# Trạng thái dự án

Cập nhật: 2026-10-19 (2e-A đã lên production). File này **chỉ** nói giai đoạn nào đã xong, đang làm gì, làm tiếp gì. Chi tiết nằm ở: `docs/PLAN.md` (kế hoạch tổng và thay đổi tổng quan), `docs/TECHNICAL.md` (hạ tầng, môi trường, cách chạy, kiểm thử, quy trình, bẫy), `docs/PHASE1.md`, `docs/PHASE2.md` (chi tiết, quyết định, giá trị tạm, tồn đọng từng giai đoạn). Quy trình nhánh/deploy: `CLAUDE.md`.

## Đã xong
- **Giai đoạn 0** (xương sống kỹ thuật) và **giai đoạn 1** (MVP: tài khoản, thế giới, chat, chỉ số/cảnh giới, quái và chiến đấu, kinh tế khung xương). Riêng 1f (đo tải thật 50 client trên Cloudflare) **hoãn theo quyết định của người dùng**.
- **Giai đoạn 2, các phần đã xong (đều đã ở production):** 2g chat nhiều kênh · 2a vật phẩm, túi đồ 8×8, hòm thư, mua tab, cài đặt game chỉnh ở admin · 2b trang bị, độ bền, giới tính, pháp bảo bản mệnh/phi hành · 2c kỹ năng, MP, thanh phím tắt, bí tịch, linh căn 1-5 hệ, thuần thục · hệ thống thể chất · 2d đột phá cảnh giới và hướng tu chủ tu/phụ tu · **2e-A NPC thương nhân trong thành (mua/bán, giới hạn theo ngày, bán nhanh, Truyền Tống Phù)**.

## Đang chạy ở đâu
- **Production** (`main`): D1 đã áp dụng migration `0001`-`0019` (kiểm bằng `wrangler d1 migrations list DB --remote`, 2026-10-19: không còn gì để áp dụng); code gồm cả 2d và 2e-A.
- **Preview** (`preview`): cùng code và D1 như production (đến `0019`).

## Đang làm dở
- **2e** (NPC thương nhân và nhiệm vụ): 2e-A xong và đã ở production. **2e-B (hệ thống nhiệm vụ, chuỗi tân thủ, NPC nhiệm vụ nhận vật phẩm hướng tu, nhiệm vụ đột phá một lần) chưa bắt đầu.**
- Điều tra việc preview thỉnh thoảng bị "reload" lúc để im: chờ người dùng trả lời 3 câu hỏi (không chặn 2e).

## Làm tiếp
1. **2e-B**: nhiệm vụ (migration `0020`): bảng tiến độ, đếm giết quái, nhận thưởng đúng một lần, chuỗi tân thủ, NPC nhiệm vụ cấp vật phẩm hướng tu (nút nhận tạm chỉ còn hiện với admin), nhiệm vụ đột phá một lần. Còn lại của 2d: cấp hướng tu ảnh hưởng chỉ số.
2. **2f** PvP, sát khí, vệ binh (và area-of-interest) → **2i** màn admin thể chất → **2h** bảng xếp hạng và boss.
3. Việc nhỏ tồn đọng (chi tiết ở `docs/PHASE2.md`, mục "Việc nhỏ đang chờ quyết định hoặc chưa làm"): tốc độ pháp bảo phi hành vào di chuyển, biến dị Lôi/Băng/Phong, kỹ năng tông môn và học từ NPC, tiền tệ trong thư, nhận thể chất qua vật phẩm, tung lại số hệ cho nhân vật có sẵn, admin chỉnh màu giao diện và giá/giới hạn của thương nhân, thang đo thật `rows_written` của thương nhân trên Cloudflare, giao diện thương nhân trên điện thoại chưa thử.

## Vấn đề tồn đọng cần để ý
- Đo tải thật trên Cloudflare chưa làm; chỉ nâng Workers Paid khi gặp dấu hiệu ở `docs/TECHNICAL.md` (mục "Giới hạn gói Free").
- Rất nhiều con số cân bằng đang là **giá trị tạm** (rơi đồ, kỹ năng, thuần thục, giá và giới hạn của thương nhân...), được liệt kê ở mục tương ứng trong PHASE1.md/PHASE2.md.
- `tools/refine-smoke.mjs` thỉnh thoảng báo lệch vài EXP giữa pháp bảo bản mệnh và nhân vật; chưa rõ nguyên nhân.
- Chưa có: PvP, area-of-interest, nhiệm vụ, boss, màn admin thể chất, kỹ năng tông môn.
