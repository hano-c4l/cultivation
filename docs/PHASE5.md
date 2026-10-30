# Giai đoạn 5: Kinh tế và xã hội — kế hoạch chi tiết

Bản thiết kế mở đầu giai đoạn (2026-10-30). Chưa có dòng code nào. Mục "Điều cần xác nhận" phải đóng trước khi viết migration.

## Quyết định đã chốt (2026-10-30)
- **Tiền được phép giao dịch và đăng chợ: chỉ Linh Thạch.** Tiên Ngọc là tiền nạp (không bán lại giữa người chơi), Cống Hiến bị khóa.
- **Giao dịch trực tiếp 2 người: chỉ trong thành an toàn** (hai người ở cùng phòng, gần nhau).
- **Làm Chợ trước** (5a), rồi giao dịch trực tiếp (5b). **Chợ gồm cả bán đứt và đấu giá** (đấu giá nhập vào 5a, không còn hạng mục 5c riêng). Bảng giao dịch riêng dựng ngay ở 5a, vì `docs/PLAN.md` mục 4 yêu cầu: Linh Thạch nhỏ không còn lịch sử từng dòng.
- **Thuế chợ 10%, phí đăng bán 2%** (giá trị tạm). Mọi con số nằm ở `game_tuning` (nhóm mới `market`) để Admin chỉnh sau.
- **Mọi vật phẩm đều bán được** (người dùng chọn "tất cả"), trừ món đã `disabled` và đồ đang mặc (phải tháo ra mới đăng được). Cột `tradable` để Admin tắt từng món **chưa làm** (xem "Còn lại của 5a").
- **Chợ là một NPC tên "Vạn Bảo Lâu"** (mỗi thành chính một NPC, cùng khuôn thương nhân). Người chơi gửi đồ vào kèm giá muốn bán; người khác phải đến NPC mới xem được toàn bộ tin của người khác và mua.
- **Tin đăng thuộc về từng thành:** món A gửi ở Vạn Bảo Lâu thành X chỉ thấy và mua được ở thành X, không thấy ở thành Y.
- **Hai loại tin:**
  - **Bán đứt:** giá cố định, ai mua trước được.
  - **Đấu giá:** người đặt giá phải **trả trước** số tiền đặt. Có người đặt cao hơn thì tiền của người bị vượt **hoàn lại bằng thư**. **Mỗi ngày một lượt**: lượt mở lúc **6 giờ sáng**, chốt lúc **9 giờ tối** (giờ máy chủ, hiểu là giờ Việt Nam như các mốc đặt lại hằng ngày khác). Lúc chốt, người đặt cao nhất nhận vật phẩm qua thư, người bán nhận tiền (trừ thuế) qua thư. Từ 21:00 đến 06:00 hôm sau không đặt giá được; lượt kế tiếp mở lại lúc 06:00.
- **Đồ rao bán chỉ nằm ở Vạn Bảo Lâu.** Vạn Bảo Lâu còn có chức năng **đăng tin rao bán trong thành** (quảng bá) với phí cao, và **chỉ cho vật phẩm phẩm cấp cao**, để hạn chế spam trong thành.
- Đồ xếp chồng: đăng chọn số lượng, người mua mua nguyên tin.
- Nhân vật bị xóa mềm còn tin đang bán: gỡ tin và trả đồ qua thư.

## Hạng mục
- **5a. Vạn Bảo Lâu: bán đứt, đấu giá, tin rao trong thành** (đã code, chưa deploy; migration `0059`)
- **5b. Giao dịch trực tiếp 2 người** (escrow `trade_sessions`)
- **5c. Tông môn** (Cống Hiến, kỹ năng tông môn)
- **5d. Thú cưỡi** (layer sprite riêng, chờ 4d)
- **5e. Nghề phụ** (luyện khí; luyện đan đã có ở 3k)
- **5f. Dashboard tổng cung tiền và đơn nạp Tiên Ngọc**

5b–5f chưa thiết kế chi tiết; mỗi hạng mục là một thiết kế riêng. (Đánh số 5c–5g của bản nháp trước đã dời lên một bậc vì đấu giá nhập vào 5a.)

## Điều đã kiểm trong code (2026-10-30)
- `item_instances` đã có `qty`, `bag_tab`, `cell`, khóa duy nhất `(owner, bag_tab, cell)`; đồ không ở túi có `bag_tab`/`cell` NULL (đồ đính kèm thư, đồ đang mặc có `equip_slot`).
- `mailbox` đã có `currency`/`amount`/`item_id`/`expires_at` (`CHECK` tiền và số lượng đi cùng nhau) nên **tiền bán, tiền hoàn đấu giá và đồ mua gửi bằng thư** là đủ. Đồ mua về người mua qua thư không hết hạn thay vì chui thẳng vào túi, vì ô trống của túi chỉ biết ở phòng đang giữ người đó.
- `opStatements` (`server/src/inventory.ts`) đã có phép `give`: xóa dòng của chủ cũ, tạo dòng mới (**id mới**) cho người nhận và một thư không hết hạn; có guard `inv_guard` làm cả batch rollback khi trạng thái đổi. Chợ dùng cùng mẫu.
- Mọi ghi túi từ phòng đi qua `bagTask` (hàng đợi theo nhân vật). Người bán/mua online biết có thư mới bằng `mail_new` trên `/ws/chat` rồi `mail_refresh`, đúng mẫu quà của 3d.
- `makeDb` (`server/src/test-db.ts`) chạy `batch` trong transaction và `ROLLBACK` khi có lệnh lỗi, nên **test đua** làm được: áp dụng cùng một batch hai lần, lần hai phải ném lỗi ở guard và không đổi gì (D1 chạy batch lần lượt).
- Giới hạn batch D1 Free là 50 câu lệnh. Một lần mua bán đứt dự kiến khoảng 15 câu; một lần đặt giá đấu giá (trừ tiền, hoàn thư người bị vượt, cập nhật tin, ghi bản ghi) khoảng 10.

## 5a. Vạn Bảo Lâu — thiết kế nháp
- **NPC `van_bao_lau`** ở mỗi thành chính (dữ liệu `npc_spots`, Admin dời/tắt được như NPC khác). Cửa sổ có các tab: Bán đứt, Đấu giá, Đăng bán, Tin của tôi.
- **Bảng `market_listings`**: `id`, `town` (bản đồ thành), `kind` (`fixed`/`auction`), `seller_character_id`, `item_id` (UNIQUE khi còn mở), `qty`, `price` (bán đứt) hoặc `start_price`/`min_step` (đấu giá), `top_bid`, `top_bidder_id`, `fee_paid`, `promoted` (đã trả phí quảng bá), `status` (`active`/`sold`/`cancelled`/`expired`), `created_at`, `ends_at`, `closed_at`. Mọi truy vấn danh sách lọc theo `town`.
- **Bảng `market_sales`**: nhật ký mọi lần chốt (người bán, người mua, món, số lượng, giá, thuế, thành, loại tin) để điều tra tranh chấp.
- **Đăng bán:** một batch: guard đồ đang ở túi và đúng số lượng, tháo khỏi ô (`bag_tab`/`cell` NULL), thu phí đăng (`applyCurrencyDelta`, lý do mới, nhóm "Giao dịch"), chèn tin. Đồ vẫn mang tên chủ cũ nhưng `UNIQUE(item_id)` trên tin mở chặn đăng hai lần.
- **Mua bán đứt:** một batch: guard tin còn `active`, đúng thành, trừ Linh Thạch người mua, chuyển đồ (mẫu `give`), thư tiền cho người bán (giá trừ thuế), thuế vào bảng tổng (sink), tin `sold`, chèn `market_sales`. Mua lần hai cùng tin: guard ném lỗi, rollback.
- **Đặt giá đấu giá:** một batch: guard tin còn mở và `top_bid` đúng như lúc đọc (chống hai người đặt cùng lúc), giá mới ≥ `top_bid` + bước tối thiểu, trừ tiền người đặt (trả trước), thư hoàn tiền cho người bị vượt, cập nhật `top_bid`/`top_bidder_id`. Người bán không đặt giá vào tin của chính mình.
- **Chốt đấu giá lúc 21:00:** xử lý **lười** (khi có người mở Vạn Bảo Lâu hoặc khi chủ tin/người đặt cao nhất đăng nhập, chạy các tin quá `ends_at`) cộng một lần quét thưa; không dùng alarm Durable Object (alarm tính như request, mục 2a của `docs/TECHNICAL.md`). Việc chốt idempotent nhờ guard `status = 'active'`. Không có người đặt: trả đồ người bán qua thư. Có người đặt: đồ cho người thắng, tiền (trừ thuế) cho người bán, đều qua thư.
- **Tin rao quảng bá trong thành:** phí cao, chỉ nhận món đủ phẩm cấp (ngưỡng và phí ở `game_tuning`); phát một thông báo trong thành về tin đó. **Người gửi hiển thị là NPC Vạn Bảo Lâu** (không phải tên người chơi), có màu/nhãn riêng để khác tin chat thường. Giới hạn nhịp để không spam.
- **Gỡ tin:** người bán gỡ tin bán đứt bất kỳ lúc nào (đồ về qua thư, không hoàn phí); tin đấu giá đã có người đặt thì không gỡ được.
- **Quyền:** không dùng khi nhân vật đang bị Admin xem xét (`reviewGuard` trong cùng batch), tài khoản bị khóa, nhân vật bị xóa mềm, tên cam/đỏ (đã cấm với NPC). Hai nhân vật của một tài khoản mua bán nhau: cho phép, ghi trong `market_sales`.
- **Admin:** màn Chợ (xem và gỡ tin, chỉnh nhóm `market`, bật/tắt `tradable` từng vật phẩm).

## Đã xác nhận (2026-10-30)
- Chốt đấu giá 21:00 mỗi ngày, lượt mới mở 06:00 hôm sau; "người nhận tiền" là người bán; tin quảng bá là thông báo trong thành do NPC gửi.

## Điều tôi vẫn đang giả định (sai thì sửa, ảnh hưởng schema)
1. **Múi giờ:** "giờ máy chủ" hiểu là **giờ Việt Nam (UTC+7)**, cùng mốc 0 giờ đặt lại hằng ngày của game; mốc 06:00/21:00 là hai số trong nhóm `market` của `game_tuning`.
2. **Tin đấu giá đăng ngoài giờ** (21:00 đến 06:00) được nhận nhưng chỉ bắt đầu nhận giá lúc 06:00; tin đăng trong ngày chốt vào 21:00 cùng ngày (kể cả khi đăng lúc 20:59).
3. **Tin đấu giá không có người đặt** lúc chốt: đồ trả người bán qua thư, không bán lại tự động.

## Tồn đọng / ghi chú
- Mọi con số trong tài liệu này là giá trị tạm.
- Cần rà mọi chỗ liệt kê đồ theo `owner_character_id` (xếp hạng, Admin sửa nhân vật, xóa nhân vật, giá trị bán lại) để tin đang rao không bị đếm hay xóa nhầm.
- Vì mọi vật phẩm đều bán được, đồ như pháp bảo bản mệnh (đã luyện cấp), vật phẩm hướng tu và đan đột phá từ nhiệm vụ cũng đổi chủ được; nếu sau này lạm dụng thì Admin tắt `tradable` từng món.

## Đã làm ở 5a (2026-10-30, nhánh `features_phase5-market`, chưa commit)
- **Mã:** `shared/src/market.ts` (nhóm tuning `market`, thuế, phí, mốc giờ đấu giá), `server/src/market.ts` (đăng, mua, đặt giá, gỡ, quảng bá, chốt, đóng tin khi xóa nhân vật), `client/src/market-ui.ts` (cửa sổ 4 tab), tin `market_*` ở `protocol.ts`, NPC `market`/`market2`/`market3` (loại `market`, đứng cạnh Võ Sư), migration `0059` (`market_listings`, `market_sales`, hình NPC). Mua bán, đặt giá và chốt đều là **một batch D1 có guard** nên người mua thứ hai hoặc đọc cũ làm cả batch rollback, tiền cũng không bị trừ.
- **Giao hàng bằng thư, nhưng tiền đi bằng thư quà:** cột `mailbox.currency/amount` không bao giờ hiện trong game (`mailViews` chỉ lấy thư có đồ hoặc quà), nên tiền bán và tiền hoàn đi bằng cột `gift` (id `market:<uuid>`, có dấu `:` để vào đường nhận quà), kèm trường mới `reason` (`market:sale`, `market:refund`) để tiền vào nhóm "Giao dịch" chứ không vào nhóm Admin. Đồ đi bằng `item_id` của thư như đồ rơi.
- **Không có khóa ngoại ở `market_listings.item_id`:** tin đã đóng giữ id của dòng đồ bị xóa về sau (gộp vào chồng, dùng hết, bán cho thương nhân); khóa ngoại sẽ cấm các việc đó (đã gặp ở test, advisor cảnh báo trước).
- **Chốt đấu giá lười:** khi có người mở Vạn Bảo Lâu (mọi thành) và khi bất kỳ nhân vật nào vào phòng (`settleDue`, chỉ mục `idx_market_due`), không dùng alarm. Mỗi tin một batch có guard `status='active' AND ends_at<=now`. Chi phí: một SELECT mỗi lần vào phòng.
- **`test-db.ts` nay xếp hàng các batch** như D1 (trước đó hai batch gọi cùng lúc chen vào nhau và lỗi "transaction within a transaction"), để test đua chạy được.
- **Kiểm đã làm:** 24 test đơn vị (`server/src/market.test.ts`: đăng nguyên chồng và tách chồng, phí, giới hạn, mua, đua hai người mua, đua hai lần đặt giá, đặt giá và hoàn tiền, cửa sổ giờ, chốt, không ai đặt, hết hạn, gỡ, xóa nhân vật, quảng bá, nhận thư quà và thư đồ trong game, đồ qua chợ vẫn dùng hết/gộp chồng được), `tools/market-smoke.mjs` chạy thật trên `wrangler dev` (ba nhân vật, mua đồng thời), và cửa sổ trình duyệt local (mở, đăng một tin bán đứt, tab "Của tôi").
- **Rà soát chỗ đếm đồ theo chủ:** xếp hạng chỉ đếm đồ đang mặc; Admin sửa nhân vật, xử lý hàng loạt, rơi đồ PK và thương nhân chỉ đi qua `loadBag` (đồ có ô hoặc đang mặc) nên **không đụng đồ đang rao**; màn Vật phẩm của Admin đếm cả đồ đang rao (đúng, vì chúng vẫn tồn tại) nên xóa cứng vật phẩm còn tin rao bị chặn. Xóa nhân vật (người chơi và Admin) đóng mọi tin của nhân vật, hoàn tiền người đặt giá cao nhất.

## Còn lại của 5a
- **Đã làm (2026-10-30, theo yêu cầu thiết kế để Admin chỉnh):** nhóm `market` chỉnh được ở màn Admin NPC, tab "Con số" (phí gửi bán, phí tối thiểu, thuế khi bán thành công, thời hạn tin bán đứt, số tin tối đa, giá tối đa, bước giá, giờ mở, giờ chốt, múi giờ, phí/phẩm cấp/thời gian chờ của tin quảng bá). Phí gửi bán thu mỗi lần đăng (cả bán đứt và đấu giá); tin bán đứt hết hạn tự trả đồ về thư người bán, đấu giá tới giờ chốt.
- **Chưa làm:** cột `tradable` (Admin tắt từng món) và lỗi `untradable` chưa dùng; **màn Admin xem và gỡ từng tin** của chợ.
- **Lệch so với yêu cầu:** tin quảng bá do NPC gửi nhưng **chỉ tới người chơi cùng kênh (cùng phòng) của thành đó**, không phải mọi kênh của thành, vì ChatHub không biết người chơi ở bản đồ nào. Muốn cả thành cần ChatHub theo dõi bản đồ, hoặc gọi RPC tới tám phòng.
- **Chưa thử đầu cuối:** nhánh đặt giá khi lượt đấu giá đang mở (smoke chạy ngoài giờ 06:00-21:00 nên chỉ thấy nhánh "đóng"; nhánh mở chỉ do test đơn vị kiểm), tin quảng bá thật (cần món phẩm cấp từ 3), thông báo thư mới cho người chơi online qua ChatHub, giao diện điện thoại, giờ chốt thật lúc 21:00 (đồng hồ giờ Việt Nam).
- Người chơi tên cam/đỏ mở Vạn Bảo Lâu nhận lỗi `murderer`; cửa sổ hiện thông báo.
