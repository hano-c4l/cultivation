# Trạng thái dự án

Cập nhật: 2026-10-18 (2d-A làm xong ở local). File này **chỉ** nói giai đoạn nào đã xong, đang làm gì, làm tiếp gì. Chi tiết nằm ở: `docs/PLAN.md` (kế hoạch tổng và thay đổi tổng quan), `docs/TECHNICAL.md` (hạ tầng, môi trường, cách chạy, kiểm thử, quy trình, bẫy), `docs/PHASE1.md`, `docs/PHASE2.md` (chi tiết, quyết định, giá trị tạm, tồn đọng từng giai đoạn). Quy trình nhánh/deploy: `CLAUDE.md`.

## Đã xong
- **Giai đoạn 0** (xương sống kỹ thuật) và **giai đoạn 1** (MVP: tài khoản, thế giới, chat, chỉ số/cảnh giới, quái và chiến đấu, kinh tế khung xương). Riêng 1f (đo tải thật 50 client trên Cloudflare) **hoãn theo quyết định của người dùng**.
- **Giai đoạn 2, các phần đã xong:** 2g chat nhiều kênh · 2a vật phẩm, túi đồ 8×8, hòm thư, mua tab, cài đặt game chỉnh ở admin · 2b trang bị, độ bền, giới tính, pháp bảo bản mệnh/phi hành (cửa sổ 2 tab) · 2c kỹ năng (2 kỹ năng linh căn mỗi cảnh giới, cảnh giới/phẩm cấp/thuần thục, 4 tab, kỹ năng pháp bảo, thanh buff, đan hồi dần), MP, thanh phím tắt, bí tịch, linh căn 1-5 hệ, giữ HP/MP/hồi chiêu khi tải lại · hệ thống thể chất (dữ liệu, hiển thị, `skill_damage`).

## Đang chạy ở đâu
- **Production** (`main`): D1 đã áp dụng migration `0001`-`0016` (kiểm bằng `wrangler d1 migrations list DB --remote`, 2026-10-18); chưa có `0017` và `0018`, tức chưa có đột phá và hướng tu.
- **Preview** (`preview`): D1 đến `0018`; code có thêm đột phá (2d-A), hướng tu có cấp, đổi chủ tu và bỏ hướng (2d-B), bố cục HUD mới, hệ của quái và luật ngũ hành mới, phím tắt kéo thả, màu cảnh giới, sắp xếp túi theo cảnh giới. Khi lên production cần chạy `0017` rồi `0018`, mỗi lần một bước riêng, trước khi deploy worker.

## Đang làm dở
- **2d** (đột phá và hướng tu): **cả 2d-A và 2d-B đã ở preview**, chưa lên production. Việc chờ: người dùng thử trên preview rồi quyết định lên production; điều tra việc preview thỉnh thoảng bị "reload" lúc để im (chờ người dùng trả lời 3 câu hỏi để biết nguyên nhân).

## Làm tiếp
1. **2d**: sau khi người dùng thử ổn trên preview thì lên production (migration `0017` và `0018` trước, mỗi lần một bước riêng). Còn lại của 2d: nhận vật phẩm hướng tu qua NPC (2e) và cấp hướng tu ảnh hưởng chỉ số. Admin chỉnh màu giao diện (chỗ lưu `UiTheme`) và kéo thả phím tắt trên màn cảm ứng: chưa làm (người dùng chưa yêu cầu cái sau).
2. **2e** NPC thương nhân và nhiệm vụ → **2f** PvP, sát khí, vệ binh (và area-of-interest) → **2i** màn admin thể chất → **2h** bảng xếp hạng và boss.
3. Việc nhỏ tồn đọng (chi tiết ở `docs/PHASE2.md`, mục "Việc nhỏ đang chờ quyết định hoặc chưa làm"): tốc độ pháp bảo phi hành vào di chuyển, biến dị Lôi/Băng/Phong, kỹ năng tông môn và học từ NPC, tiền tệ trong thư, nhận thể chất qua vật phẩm, tung lại số hệ cho nhân vật có sẵn.

## Vấn đề tồn đọng cần để ý
- Đo tải thật trên Cloudflare chưa làm; chỉ nâng Workers Paid khi gặp dấu hiệu ở `docs/TECHNICAL.md` (mục "Giới hạn gói Free").
- Rất nhiều con số cân bằng đang là **giá trị tạm** (rơi đồ, kỹ năng, thuần thục...), được liệt kê ở mục tương ứng trong PHASE1.md/PHASE2.md.
- `tools/refine-smoke.mjs` thỉnh thoảng báo lệch vài EXP giữa pháp bảo bản mệnh và nhân vật; chưa rõ nguyên nhân.
- Chưa có: PvP, area-of-interest, cửa hàng NPC và nhiệm vụ, boss, màn admin thể chất, kỹ năng tông môn.
