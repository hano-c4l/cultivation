# Giai đoạn 5: Kinh tế và xã hội — kế hoạch chi tiết

Bản thiết kế mở đầu giai đoạn (2026-10-30). Chưa có dòng code nào. Mục "Điều cần xác nhận" phải đóng trước khi viết migration.

## Quyết định đã chốt (2026-10-30)
- **Tiền được phép giao dịch và đăng chợ: Linh Thạch và Tiên Ngọc** (đổi ngày 2026-10-31 theo yêu cầu: lúc đầu chỉ Linh Thạch). Cống Hiến bị khóa. Một tin chợ tính giá bằng **một** loại tiền và người mua, người đấu giá, phí gửi bán, tiền hoàn và tiền thu đều bằng loại đó; một giao dịch trực tiếp mang được **cả hai** loại tiền và đồ cùng lúc.
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
- **5b. Giao dịch trực tiếp 2 người** (đã code, chưa deploy; migration `0060`; xem mục "5b" bên dưới)
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

## Đợt chỉnh sau lần thử đầu (2026-10-30, nhánh `features_market-polish`)
- **Chữ:** "Bán đứt" thành "Mua ngay", "Của tôi" thành "Đang Gửi" (tab, loại tin, nhãn Admin).
- **Giá đặt sẵn:** ô đặt giá của tin đấu giá tự điền giá cao nhất cộng `bidSuggestPct` (mặc định 10%, không thấp hơn bước giá tối thiểu `bidStepPct`, không quá `maxPrice`); chưa ai đặt thì là giá khởi điểm. Người chơi sửa tay được, số đã gõ được giữ khi danh sách làm mới cho tới khi có người đặt giá cao hơn. Trường mới của nhóm `market`, tùy chọn (dòng đã lưu từ trước coi là 10).
- **Rút tin đấu giá:** từ giờ mở đấu giá (06:00) trở đi tin đấu giá **không rút lại được**; tin đăng ban đêm (21:00-06:00) rút được cho tới giờ mở. Không ai đặt giá tới giờ chốt thì đồ tự về thư. **Người bán đặt giá được vào tin của chính mình** (mua lại, hoặc kích giá); thắng thì nhận lại đồ, tiền thu thuế như bán cho người khác.
- **Nhận nhanh:** tin `mail_claim_all` (nút "Nhận nhanh" ở Hòm thư), server nhận lần lượt tối đa 100 thư, thư không vừa túi thì ở lại và báo "túi đầy" một lần; danh sách thư cuộn riêng (cao tối đa 240 px).
- **Cập nhật tức thời:** server báo `market_changed` cho mọi người online (qua `ChatHub.marketChanged`) sau mỗi lần đăng, mua, đặt giá, gỡ, quảng bá và chốt; cửa sổ đang mở hỏi lại bằng `market_list` (đọc, tối đa khoảng một lần mỗi giây, không qua hàng đợi túi). Đổi tab cũng hỏi lại, và cứ 15 giây hỏi một lần dự phòng. Biểu mẫu Đăng bán không bị vẽ lại khi danh sách đổi (không mất chữ đang gõ).

## 5b. Giao dịch trực tiếp 2 người — thiết kế (2026-10-31)
- **Điều kiện:** cả hai ở **cùng một phòng** thành an toàn (cùng bản đồ, cùng kênh), cách nhau tối đa `trade.range` ô (mặc định 8), không ai đang đột phá/truyền tống/bị Admin xem xét, không ai tên cam/đỏ (như NPC). Chỉ Linh Thạch (không Tiên Ngọc, Cống Hiến).
- **Luồng:** bấm vào người kia ở thành (ở bản đồ thường, bấm vào người chơi vẫn là tấn công) → hộp "Mời giao dịch" → bên kia chấp nhận (hết hạn sau `trade.inviteSec`, mặc định 30 giây) → cả hai thấy cùng một cửa sổ: ô của mình và ô của đối phương (tối đa `trade.maxItems` món, mặc định 6, nguyên chồng; muốn đưa một phần thì chia chồng trước) và số Linh Thạch. **Khóa** → khi cả hai đã khóa thì cả hai bấm **Đồng ý** → thực hiện. **Mọi thay đổi ở một bên (đổi đồ, đổi tiền) bỏ khóa và đồng ý của cả hai.** Một bên hủy, đi xa, rời phòng, mất kết nối, bị đánh, chết hoặc đổi bản đồ thì cả cuộc hủy.
- **Không ký quỹ (escrow):** đồ và tiền vẫn ở chủ cũ đến lúc cuối; phiên giao dịch nằm trong **`ctx.storage` của phòng** (không phải bộ nhớ: phòng thành ngủ giữa hai tin nhắn mà socket vẫn mở; mỗi thay đổi đồ/tiền là một lần ghi storage nên bị giới hạn nhịp 400 ms mỗi người, và một phiên cũ hơn 10 phút bị bỏ). Mọi lệnh giao dịch của một phòng chạy **nối đuôi nhau** (`tradeTask`) nên hai tin đến cùng lúc không ghi đè nhau. Lời mời chỉ ở bộ nhớ (mất thì coi như hết hạn). Bước cuối là **một batch D1**: guard từng món còn đúng ô và số lượng của chủ cũ, đổi chủ và đặt vào ô trống của người nhận (chọn trong các ô **chưa bị chiếm trước giao dịch**, nên không cần đỗ tạm), tiền chuyển ròng hai chiều (mỗi chiều một nhóm `currencyStatements`, `CHECK balance >= 0` làm cả batch rollback nếu thiếu), guard hai nhân vật (không bị xóa/xem xét), một dòng `trade_log`. Ít nhất `2 × maxItems` câu lệnh ghi đồ cộng tiền: dưới trần 50 của D1 Free khi `maxItems` ≤ 6.
- **Người nhận thiếu ô trống:** từ chối ngay khi bấm Khóa (báo bên nào thiếu).
- **Cho phép giao dịch giữa hai nhân vật cùng tài khoản.** Không thuế, không phí (nếu cần sau này: thêm `feePct` vào nhóm `trade`).
- **Admin:** nhóm `trade` (`maxItems`, `range`, `inviteSec`, `maxLinh`) ở màn Admin NPC → "Con số"; nhật ký `trade_log` (người, món, tiền) dùng để điều tra.

### Đã làm ở 5b (2026-10-31, nhánh `features_trade-direct`)
- **Mã:** `shared/src/trade.ts` (nhóm tuning `trade`: `maxItems` 6, `range` 8, `inviteSec` 30, `maxLinh`, `offerGapMs`; loại tin), `server/src/trade.ts` (`planTrade` thuần: nhận hai túi và hai lời đề nghị, trả câu lệnh và thay đổi cho bộ nhớ đệm túi; các hàm đổi phiên), `server/src/map-room.ts` (`handleTrade`, `runTrade`), `client/src/trade-ui.ts`, migration `0060` (`trade_log`).
- **Phiên bản (`rev`) gắn với đề nghị:** đổi đồ hoặc tiền của một bên thì tăng `rev`, mở khóa và hủy đồng ý của cả hai; khóa và đồng ý phải mang đúng `rev` đã thấy (chống đổi món sát lúc bấm đồng ý). Khóa và đồng ý không đổi `rev` nên hai người khóa cùng lúc đều được.
- **Thực hiện đúng một lần:** cờ `tradeRunning` đặt trước `await` đầu tiên (đề nghị bị từ chối khi đang chạy); batch chạy trên hàng đợi túi của cả hai (theo thứ tự id để không kẹt vòng); mỗi món có guard "còn trong túi (có ô, không đang mặc), đúng chủ, đúng số lượng" (đồ đang ký gửi ở Vạn Bảo Lâu không có ô nên **không bán đi được**: nếu được thì tin chợ kẹt mãi); ô đích chọn trong các ô **trống từ trước giao dịch** nên không cần đỗ tạm; Linh Thạch chuyển theo hiệu số hai bên (bên nào hiệu số 0 không ghi); ghi `trade_log`.
- **Hủy mọi đường rời phòng:** móc ở `playerGone` (rời, bị đá, qua cổng, truyền tống). Ở bản đồ thường không giao dịch (chỉ thành an toàn).
- **Giới hạn đã biết:** hai túi đầy hoàn toàn không đổi một-một được (ô đích phải trống từ trước); chỉ nguyên chồng (chia chồng trước nếu cần một phần); tối đa 6 món mỗi bên là giới hạn 50 câu lệnh của D1 (mỗi món hai câu), không phải chọn thiết kế; không thuế hay phí. Không có màn Admin xem `trade_log` (chỉ bảng, truy vấn tay); nhóm `trade` chỉnh ở Admin NPC, tab "Con số".
- **Đã kiểm:** 11 test đơn vị (`server/src/trade.test.ts`: đổi đồ và tiền, cho tiền, thiếu tiền rollback, món rời túi như đưa lên chợ, chồng đổi số lượng, món không còn, áp dụng hai lần, túi đầy nêu bên nào, 50 câu lệnh ở mức tối đa, phiên bản), `tools/trade-smoke.mjs` hai người chơi thật (mời, trả lời, đề nghị, khóa sai phiên bản, đổi đề nghị mở khóa, cả hai đồng ý cùng lúc chỉ một lần, hủy). **Chưa thấy bằng mắt** cửa sổ giao dịch và hộp mời; chưa thử đi xa giữa chừng, rời phòng giữa chừng, trên điện thoại.

## Đợt chỉnh 2026-10-31 (nhánh `features_trade-direct`, migration `0061`)
- **Tiên Ngọc ở chợ:** `market_listings.currency` (`linh_thach`/`tien_ngoc`), `market_sales.currency`; tin nhắn `market_post` mang `currency`. Phí gửi bán là cùng tỉ lệ (`listFeePct`) nhưng tối thiểu và giá tối đa riêng cho Tiên Ngọc (`minListFeeTienNgoc` 1, `maxPriceTienNgoc` 10 000 000, tùy chọn: dòng đã lưu từ trước coi như mặc định). Tiền bán và tiền hoàn đi bằng thư quà với khóa `tien_ngoc`. Phí quảng bá vẫn bằng Linh Thạch. Tiên Ngọc luôn ghi lịch sử chi tiết (`tien_ngoc_ledger`) nên mọi lần đặt giá, mua và hoàn đều có dòng riêng.
- **Tiên Ngọc ở giao dịch trực tiếp:** đề nghị mỗi bên có `linh` và `tienNgoc` (`trade.maxTienNgoc`, tùy chọn); mỗi loại tiền chuyển theo hiệu số của hai bên; `trade_log.tn_a/tn_b`. Số câu lệnh tối đa vẫn dưới 50 (tiền hai loại, hai người).
- **Truyền Tống Trận:** vòng tròn rộng gấp đôi (bán kính 2,6 ô); bấm vào đâu trong vòng thì nhân vật đi vào chính giữa rồi cửa sổ tự mở khi tới nơi (đi nơi khác thì hủy). Bốn cột đá quanh trận (cũ) bỏ đi vì nằm trong vòng.
- **Vị trí NPC (cả ba thành, `TOWN_NPC_AT` trong `shared/src/map.ts`):** trận ở giữa; Thương nhân, Trưởng Lão, Thợ Rèn, Đan Sư, Vạn Bảo Lâu đứng quanh trận cách khoảng 8 ô và cách nhau; Võ Sư và ba Đạo Sư hướng tu rải ở các góc quảng trường (không còn tụm một chỗ). Migration `0061` dời các dòng `npc_spots` chưa ai sửa. Bản đồ thành do Admin đã sửa (ghim công thức) giữ lưới va chạm cũ.
- **Thợ Rèn bán pháp bảo bản mệnh và phi hành:** luật bộ trang bị có thêm `kinds` (`bonded`, `flight`, `charm`); mỗi Thợ Rèn có luật `artifact_<low|high|top>` cho cảnh giới của thành, bậc 1-2, phẩm 1 (migration `0061` thêm vào cửa hàng đã lưu). Màn Admin NPC có ô "loại" cho luật này.
- **Đồ họa thành và bản đồ mới:** nguyên nhân gốc là bảng `mapArt` đã lưu không có mục cho Thành 3, Hóa Thần, Luyện Hư nên bị vẽ phẳng; nay bản đồ của game không có mục thì vẽ theo mặc định trong code (`mapArtOf`). Khối chặn lớn của thành vẽ thành **nhà** (mái ngói đỏ, tường vữa, cửa và cửa sổ) và **ao** (khối tròn), tường viền ngoài giữ như cũ; khai báo bằng trường `big: "house"` của từng bản đồ trong `mapArt` (Admin chọn được sau). Cột đá nhỏ dưới chân NPC không vẽ nữa. Nhóm vật cản nhỏ của thành đầu thêm ngọc, bớt cây.
- **Chưa làm / ghi chú:** hang động và bản đồ chiến đấu vẫn vẽ khối lớn như cũ (đá, vách). Không vẽ nhà có cửa mở thật (cửa chỉ là hình). Cả chợ lẫn giao dịch chưa có màn Admin xem lịch sử.
- **Đã kiểm thêm (cuối đợt):** test cửa hàng (`server/src/merchants.test.ts`: mỗi Thợ Rèn có luật pháp bảo, có đủ id bản mệnh và phi hành, luật sai loại bị từ chối, luật migration `0061` hợp lệ và trùng luật trong code), test migration `mapArt` (`map-art-migration.test.ts`), giao dịch xấu nhất (6+6 món, hai loại tiền, ghi hết lịch sử) vẫn dưới 50 câu lệnh, smoke chợ và giao dịch (có chân Tiên Ngọc ở giao dịch), `waygate-smoke`; cửa sổ trình duyệt local thấy nhà, ao, vòng trận to và nhân vật bước vào giữa. `tools/shop-smoke.mjs` đã cũ từ trước đợt này (đứng cạnh Đan Sư mua trang bị, sách) nên báo FAIL ở các bước trang bị và sách: cần viết lại. Chưa thử: Tiên Ngọc ở chợ qua smoke (chỉ test đơn vị), bản đồ Hóa Thần và Luyện Hư bằng mắt (cùng đường vẽ với thành 3 và các bản đồ cũ), cách nhân vật leo lên thang Truyền Tống Trận trên điện thoại.
- **Dò dữ liệu đã lưu:** không đọc được D1 từ xa trong phiên này nên `0061` ghi đè có điều kiện: mục `mapArt` của thành 3, Hóa Thần, Luyện Hư được ghi lại khi thiếu hoặc là `plain` (màn "Hình ảnh" có thể đã ghi `plain` vào đó).
