# Giai đoạn 2: Chiều sâu nhân vật — đề xuất chia nhánh (bản nháp)

Trạng thái: **ĐÃ CHỐT THỨ TỰ (2026-10-17): 2g làm trước, rồi 2a → 2b → 2c → 2d → 2e → 2f → 2h.** 2g xong (`features_chat-channels`), 2a xong (`features_inventory`), hệ thống thể chất (dữ liệu và hiển thị) xong (`features_constitution`); **kế tiếp là 2b**. Tất cả đã ở production (2026-10-17). Nguồn: `docs/PLAN.md` mục 10 (GĐ2), mục 9 (luật mặc định), mục 9a (chat nhiều chế độ) và các việc đã hoãn từ GĐ1 (xem `docs/STATUS.md`). Mỗi mục là một nhánh `features_*` theo quy trình trong `CLAUDE.md`. Thứ tự và phạm vi có thể sửa; mục "Câu hỏi cần chốt" cần người dùng quyết trước khi làm mục tương ứng.

Nghiệm thu chung của GĐ2 (từ PLAN): một nhân vật đi trọn chuỗi nhiệm vụ tân thủ; công thức sát thương ngũ hành đúng test; sát khí/rơi đồ/vệ binh theo đúng luật mặc định.

## Thứ tự phụ thuộc
2g (xong) → 2a → 2b → 2c → 2d; 2e cần 2a (thưởng bằng đồ); 2f cần 2c (kỹ năng) và nên sau 2b; 2h cuối.

## 2a. Vật phẩm và túi đồ (`features_inventory`) — ĐÃ LÀM
Chi tiết kiến trúc và vận hành: `docs/STATUS.md` mục "Túi đồ và hòm thư (2a)". Quyết định thêm (2026-10-17): túi đầy thì đồ rơi được **gửi vào hòm thư, phải nhận trong 30 phút nếu không sẽ mất**.
- **Túi đồ (đã chốt):** mỗi tab 8×16 ô, mở rộng bằng cách thêm tab; kích thước tab và số tab nằm trong cấu hình để đổi sau; **chưa có giới hạn trọng lượng** (làm sau).
- Dữ liệu vật phẩm trong `shared/` (`name_vi`, `desc_vi`, loại, phẩm cấp, xếp chồng hay không). `item_instances` (đã có từ 1e) là bản chính; DO giữ cache khi nhân vật online (PLAN mục 3).
- Quái rơi vật phẩm theo bảng rơi có trọng số (chỗ móc `reward` trong `combat-sim.ts` và hàng đợi ghi riêng như Linh Thạch). Nhặt đồ, bỏ đồ, dùng đồ (thuốc hồi HP).
- Giao thức: tin `inventory` (đầy đủ khi vào phòng, delta khi đổi), `use_item`, `drop_item`. Giới hạn ô túi.
- UI túi đồ (phím `I`), thông báo nhặt đồ.
- Nghiệm thu: nhặt/dùng/bỏ đồ lưu và tải lại đúng; không nhân đôi đồ khi đăng nhập hai nơi; test chủ sở hữu.

## 2b. Trang bị và độ bền (`features_equipment`)
- Ô trang bị (vũ khí, giáp, trang sức, pháp bảo…), chỉ số cộng vào `deriveStats`, yêu cầu cảnh giới.
- Độ bền giảm khi chết (luật mặc định), sửa đồ tốn Linh Thạch (tiền sink, ghi sổ cái).
- Nghiệm thu: mặc/tháo đổi đúng chỉ số; chết giảm độ bền; sửa đồ trừ đúng tiền, không âm.

## 2c. Kỹ năng, MP và ngũ hành đầy đủ (`features_skills`)
- MP, thanh phím tắt kỹ năng, hồi chiêu, tầm đánh; kỹ năng theo hướng tu và ngũ hành. **Hiệu ứng buff của thể chất** (xem `docs/PLAN.md` mục 9, `shared/src/constitutions.ts`) cũng được áp dụng ở đây: sát thương và độ thuần thục của kỹ năng theo nguyên tố/vũ khí. **Thanh phím tắt này cũng chứa các ô dùng nhanh vật phẩm tiêu hao** (ví dụ Hồi Huyết Đan, kéo từ túi đồ vào ô; yêu cầu của người dùng, 2026-10-17), nên các ô dùng nhanh được làm ở đây chứ không ở 2a.
- Bảng sát thương ngũ hành đầy đủ (tương khắc ×1.3, bị khắc ×0.75, tương sinh bonus nhỏ) mở rộng được cho **trục số hệ linh căn** (đơn/song/tam/tứ/ngũ, biến dị Lôi/Băng/Phong) đã hẹn ở GĐ2.
- Nghiệm thu: công thức sát thương ngũ hành đúng test (bảng đầy đủ); hồi chiêu và MP được server kiểm.

## 2d. Chủ tu/phụ tu và đột phá (`features_cultivation-paths`)
- Chọn chủ tu (Kiếm tu, Thuật tu, Đan tu) và phụ tu; hệ số EXP `1 / (1 + k·n)` (PLAN mục 9), `k` chỉnh được trong cấu hình.
- **Đột phá cảnh giới**: hiện tiến độ dừng ở tầng 9 và EXP bị chặn. Thêm cơ chế đột phá có tỉ lệ thất bại, đan dược tăng tỉ lệ, tiền sink.
- Nghiệm thu: test công thức hệ số; đột phá thành/bại đúng tỉ lệ (RNG truyền vào), trừ đúng vật phẩm/tiền.

## 2e. NPC thương nhân và nhiệm vụ (`features_npc-quests`)
- NPC trong thành (tile NPC trên bản đồ), cửa hàng mua/bán (giá cố định, ghi sổ cái, atomic).
- Hệ thống nhiệm vụ theo chuỗi: điều kiện (giết quái, nhặt đồ, nói chuyện), phần thưởng (EXP, Linh Thạch, Cống Hiến, đồ), lưu tiến độ.
- Chuỗi nhiệm vụ tân thủ.
- Nghiệm thu: một nhân vật mới đi trọn chuỗi tân thủ; nhận thưởng đúng một lần.

## 2f. PvP, sát khí và vệ binh (`features_pvp`)
- PvP ở bản đồ thường (thành an toàn); bảo hộ tân thủ (mặc định dưới Luyện Khí tầng 5); tự đánh trả dùng lại quy tắc đã có.
- Sát khí và phân cấp tên trắng → vàng → cam → đỏ; xác suất rơi đồ tăng theo cấp; giết tên đỏ không tăng sát khí; sát khí chỉ giảm khi online.
- Vệ binh NPC tấn công tên đỏ trong bán kính aggro.
- Area-of-interest (hiện mọi sự kiện gửi cả phòng) nên làm trước hoặc cùng nhánh này, vì PvP đông người làm tăng băng thông.
- Nghiệm thu: sát khí, rơi đồ và vệ binh theo đúng luật mặc định (test thuần trong `shared/`).

## 2g. Chat nhiều chế độ (`features_chat-channels`) — ĐÃ LÀM
- Kiến trúc thực tế (socket chat riêng tới `ChatHub`, không RPC) và các giới hạn: xem `docs/STATUS.md` mục "Chat nhiều kênh (2g)".
- Theo `docs/PLAN.md` mục 9a: 5 thẻ Tất cả / Thế giới / Bản đồ / Truyền âm / Hệ thống.
- Cần `ChatHub` Durable Object cho chat thế giới (chú ý chi phí request, mục 2a của PLAN); truyền âm cần tra người nhận online; tin hệ thống có mã loại để client dịch.
- Làm sau 2a nếu muốn có sẵn tin "nhặt đồ" cho thẻ Hệ thống, nhưng không bắt buộc.

## 2i. Màn admin quản lý thể chất (`features_admin-constitutions`)
- Dữ liệu đã sẵn (xem `docs/STATUS.md` mục "Thể chất: thiết kế dữ liệu"): màn admin liệt kê thể chất, tên cấp, trọng số tung, bật/tắt, và danh sách hiệu ứng từng cấp (chọn chỉ số, đối tượng nguyên tố/vũ khí/kỹ năng, kiểu cộng, giá trị; có nút "sao chép sang mọi cấp"), kèm xem trước tỉ lệ thực tế và cảnh báo "chưa có tác dụng" theo cờ `applied`.
- API ghi: một batch thay cả danh mục, kiểm `validateCatalog` và `expectedVersion`, tăng `config_versions`.
- Việc nối hiệu ứng vào gameplay làm cùng 2c (kỹ năng) và các chỉ số khác khi có (kinh nghiệm, tốc độ di chuyển cần xử lý đường đi).

## 2h. Bảng xếp hạng và boss (`features_leaderboard-boss`)
- Bảng xếp hạng (cảnh giới/tầng/EXP; đọc từ D1, cache ngắn).
- Boss bản đồ theo quy tắc đã chốt ở `docs/PHASE1.md` mục "Boss" (cần vật phẩm 2a, kỹ năng 2c, và lưu trạng thái boss bền trong DO storage). Lưu ý rủi ro đã ghi trong STATUS: đổi kênh vẫn tung lại hạng quái.

## Quyết định đã chốt (2026-10-17)
1. **Thứ tự:** 2g (chat) lên trước vì độc lập, mỗi kênh một màu để phân biệt ở thẻ "Tất cả"; sau đó 2a → 2b → 2c → 2d → 2e → 2f → 2h.
2. **Boss:** mỗi bản đồ chỉ có đúng 1 boss cùng lúc (cho cả 8 kênh, cần điều phối toàn cục theo bản đồ); quy tắc loại dưới 10% áp dụng cho cả tiền lẫn đồ.
3. **Túi đồ:** tab 8×16 ô, mở rộng bằng cách thêm tab, kích thước đổi được qua cấu hình, chưa tính trọng lượng.
4. **Giá trị tạm của GĐ1** (tên và tỉ lệ quái hiếm, `KILLS_BASE`/`KILLS_GROWTH`, lượng rơi Linh Thạch): giữ nguyên như đã thống nhất, chỉnh khi cân bằng.

## Còn mở
- **Gói Cloudflare:** PvP đông người, `ChatHub` và nhiều bản đồ sẽ tăng mức dùng; khi có số đo thật thì quyết định nâng Workers Paid (dấu hiệu trong `docs/STATUS.md`).
