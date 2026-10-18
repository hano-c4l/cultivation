# Trạng thái dự án

Cập nhật: 2026-10-18 (2d-A làm xong ở local). File này **chỉ** nói giai đoạn nào đã xong, đang làm gì, làm tiếp gì. Chi tiết nằm ở: `docs/PLAN.md` (kế hoạch tổng và thay đổi tổng quan), `docs/TECHNICAL.md` (hạ tầng, môi trường, cách chạy, kiểm thử, quy trình, bẫy), `docs/PHASE1.md`, `docs/PHASE2.md` (chi tiết, quyết định, giá trị tạm, tồn đọng từng giai đoạn). Quy trình nhánh/deploy: `CLAUDE.md`.

## Đã xong
- **Giai đoạn 0** (xương sống kỹ thuật) và **giai đoạn 1** (MVP: tài khoản, thế giới, chat, chỉ số/cảnh giới, quái và chiến đấu, kinh tế khung xương). Riêng 1f (đo tải thật 50 client trên Cloudflare) **hoãn theo quyết định của người dùng**.
- **Giai đoạn 2, các phần đã xong:** 2g chat nhiều kênh · 2a vật phẩm, túi đồ 8×8, hòm thư, mua tab, cài đặt game chỉnh ở admin · 2b trang bị, độ bền, giới tính, pháp bảo bản mệnh/phi hành (cửa sổ 2 tab) · 2c kỹ năng (2 kỹ năng linh căn mỗi cảnh giới, cảnh giới/phẩm cấp/thuần thục, 4 tab, kỹ năng pháp bảo, thanh buff, đan hồi dần), MP, thanh phím tắt, bí tịch, linh căn 1-5 hệ, giữ HP/MP/hồi chiêu khi tải lại · hệ thống thể chất (dữ liệu, hiển thị, `skill_damage`).

## Đang chạy ở đâu
- **Production** (`main`): có đến hết 2b/2c bản đầu và migration `0001`-`0014` (ngày 2026-10-18).
- **Preview** (`preview`): có thêm túi 8×8, mua tab, thanh buff, kỹ năng pháp bảo, kỹ năng cảnh giới/phẩm cấp/thuần thục, cửa sổ trang bị 2 tab; migration đến `0016`. **Chưa lên production**; khi lên cần chạy migration `0015`, bước dọn ô túi (xem PHASE2.md, mục 2a), rồi `0016`, mỗi lần một bước riêng trước khi deploy worker.

## Đang làm dở
- **2d** (nhánh `features_cultivation-paths`): **2d-A đột phá cảnh giới đã làm xong ở local** (chưa commit, chưa lên preview/production); **2d-B chủ tu/phụ tu chờ người dùng quyết định** (câu hỏi ở `docs/PHASE2.md` mục 2d).
- Các thay đổi trước đó vẫn chờ người dùng thử trên preview trước khi lên production.

## Làm tiếp
1. **2d-A**: mở PR vào preview, thử, rồi lên production (migration `0017` trước). **2d-B** chủ tu/phụ tu sau khi người dùng chốt thiết kế.
2. **2e** NPC thương nhân và nhiệm vụ → **2f** PvP, sát khí, vệ binh (và area-of-interest) → **2i** màn admin thể chất → **2h** bảng xếp hạng và boss.
3. Việc nhỏ tồn đọng (chi tiết ở `docs/PHASE2.md`, mục "Việc nhỏ đang chờ quyết định hoặc chưa làm"): tốc độ pháp bảo phi hành vào di chuyển, biến dị Lôi/Băng/Phong, kỹ năng tông môn và học từ NPC, tiền tệ trong thư, nhận thể chất qua vật phẩm, tung lại số hệ cho nhân vật có sẵn.

## Vấn đề tồn đọng cần để ý
- Đo tải thật trên Cloudflare chưa làm; chỉ nâng Workers Paid khi gặp dấu hiệu ở `docs/TECHNICAL.md` (mục "Giới hạn gói Free").
- Rất nhiều con số cân bằng đang là **giá trị tạm** (rơi đồ, kỹ năng, thuần thục...), được liệt kê ở mục tương ứng trong PHASE1.md/PHASE2.md.
- `tools/refine-smoke.mjs` thỉnh thoảng báo lệch vài EXP giữa pháp bảo bản mệnh và nhân vật; chưa rõ nguyên nhân.
- Chưa có: PvP, area-of-interest, cửa hàng NPC và nhiệm vụ, boss, màn admin thể chất, kỹ năng tông môn.
