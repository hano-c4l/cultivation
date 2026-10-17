# Giai đoạn 2: Chiều sâu nhân vật — đề xuất chia nhánh (bản nháp)

Trạng thái: **ĐỀ XUẤT, chưa bắt đầu.** Nguồn: `docs/PLAN.md` mục 10 (GĐ2), mục 9 (luật mặc định), mục 9a (chat nhiều chế độ) và các việc đã hoãn từ GĐ1 (xem `docs/STATUS.md`). Mỗi mục là một nhánh `features_*` theo quy trình trong `CLAUDE.md`. Thứ tự và phạm vi có thể sửa; mục "Câu hỏi cần chốt" cần người dùng quyết trước khi làm mục tương ứng.

Nghiệm thu chung của GĐ2 (từ PLAN): một nhân vật đi trọn chuỗi nhiệm vụ tân thủ; công thức sát thương ngũ hành đúng test; sát khí/rơi đồ/vệ binh theo đúng luật mặc định.

## Thứ tự phụ thuộc
2a → 2b → 2c → 2d; 2e cần 2a (thưởng bằng đồ); 2f cần 2c (kỹ năng) và nên sau 2b; 2g độc lập, làm được bất cứ lúc nào; 2h cuối.

## 2a. Vật phẩm và túi đồ (`features_inventory`)
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
- MP, thanh phím tắt kỹ năng, hồi chiêu, tầm đánh; kỹ năng theo hướng tu và ngũ hành.
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

## 2g. Chat nhiều chế độ (`features_chat-channels`)
- Theo `docs/PLAN.md` mục 9a: 5 thẻ Tất cả / Thế giới / Bản đồ / Truyền âm / Hệ thống.
- Cần `ChatHub` Durable Object cho chat thế giới (chú ý chi phí request, mục 2a của PLAN); truyền âm cần tra người nhận online; tin hệ thống có mã loại để client dịch.
- Làm sau 2a nếu muốn có sẵn tin "nhặt đồ" cho thẻ Hệ thống, nhưng không bắt buộc.

## 2h. Bảng xếp hạng và boss (`features_leaderboard-boss`)
- Bảng xếp hạng (cảnh giới/tầng/EXP; đọc từ D1, cache ngắn).
- Boss bản đồ theo quy tắc đã chốt ở `docs/PHASE1.md` mục "Boss" (cần vật phẩm 2a, kỹ năng 2c, và lưu trạng thái boss bền trong DO storage). Lưu ý rủi ro đã ghi trong STATUS: đổi kênh vẫn tung lại hạng quái.

## Câu hỏi cần chốt trước khi bắt đầu
1. **Thứ tự**: làm đúng 2a → 2b → 2c → 2d → 2e → 2f như trên, hay đưa mục nào lên sớm (ví dụ PvP hoặc chat)?
2. **Boss**: ở 2h hay đưa lên sớm hơn? Một boss cho mỗi kênh hay cho cả bản đồ qua 8 kênh? Quy tắc loại dưới 10% có áp dụng cho tiền không?
3. **Túi đồ**: số ô ban đầu và có giới hạn trọng lượng không?
4. **Giá trị tạm đang chờ xác nhận** từ GĐ1 (xem `docs/STATUS.md`): tên và tỉ lệ quái hiếm, `KILLS_BASE`/`KILLS_GROWTH`, lượng rơi Linh Thạch.
5. **Gói Cloudflare**: PvP đông người, `ChatHub` và nhiều bản đồ sẽ tăng mức dùng; khi có số đo thật thì quyết định nâng Workers Paid (xem dấu hiệu trong `docs/STATUS.md`).
