# Trạng thái dự án (bàn giao)

Cập nhật: 2026-10-17. Đọc cùng `CLAUDE.md` (quy trình nhánh/deploy), `docs/PLAN.md` (kế hoạch tổng) và `docs/PHASE1.md` (chia nhỏ giai đoạn 1).

## Đã xong
| Hạng mục | Ghi chú |
|---|---|
| Giai đoạn 0 | Worker + Durable Object + D1, bản đồ isometric, click để di chuyển, nhiều người thấy nhau |
| 1a Tài khoản và nhân vật | Email + mật khẩu, phiên bằng cookie, tạo nhân vật (server tung linh căn), WebSocket xác thực bằng cookie, khóa nhân vật xuyên kênh, lưu vị trí |
| 1b Thế giới và chat | 3 bản đồ (Thanh Vân Thành an toàn, Hắc Mộc Lâm, U Minh Động) nối bằng cổng, chat theo bản đồ có lọc từ và giới hạn tốc độ |
| 1c Chỉ số, cảnh giới, tiềm năng | Bảng 4 cảnh giới × 9 tầng, EXP, chỉ số gốc/dẫn xuất, ngũ hành (`shared/src/progression*.ts`), bảng nhân vật (phím `C`), cộng điểm một lần xác nhận một lần ghi D1. Chưa có nguồn EXP trong game (chờ 1d) |
| Phẩm cấp linh căn | 5 bậc Hạ/Trung/Thượng phẩm, Địa, Thiên (`ROOT_GRADES`), server tung một lần khi tạo nhân vật; cho điểm tiềm năng khởi đầu và thưởng/phạt tu vi. Nhân vật cũ đã được tung lại trong migration 0004 |
| 1d Quái và chiến đấu | 6 loài quái (9 quái mỗi bản đồ, 3 cụm) ở rừng và hang, tick 10 Hz chỉ khi có người, click quái để tự đuổi và đánh, sát thương theo chỉ số và ngũ hành, EXP và lên tầng, chết mất 10% EXP rồi về thành, thanh sinh lực và số sát thương. Chưa có rơi đồ (1e) |
| Tự đánh trả | Đứng im, chưa có mục tiêu mà bị quái đánh thì tự nhắm quái đó và đánh lại; đang đi thì không; đã có mục tiêu thì giữ. PvP sẽ dùng lại quy tắc này (GĐ2) |
| Movement budget | `shared/src/movement.ts`: server chỉ tin ô xuất phát client khai khi còn ngân sách (cap 3 ô, hồi 1 ô/giây), nên nối chuỗi claim chỉ tăng tối đa khoảng 25% tốc độ. Bấm quá dày thì server dùng vị trí của mình (client thấy bị kéo nhẹ; cần kiểm tra cảm giác với độ trễ thật trên preview) |
| 1d+ Vùng quái | Bản đồ có cảnh giới, 3 cụm × 3 quái (bậc 1, 4, 7) mỗi bản đồ, quái thường/hiếm (2 hạng), tên có bậc và loại, EXP theo nhịp lên cấp, chặn EXP khi săn sai cảnh giới. Boss và rơi đồ chưa làm (xem `docs/PHASE1.md` 1d+). Bảng EXP người chơi đã nhân 10 |
| Di chuyển | Dự đoán phía client, hòa trộn khi server sửa, ping tự trả lời (DO ngủ được), đích đến chính xác, đường đi làm thẳng, **va chạm lưới mịn 4x4 mỗi ô** (vật cản tròn, vát góc, hàng rào mỏng) |

| 1e Kinh tế khung xương | Migration `0005_economy.sql`: `currency_ledger` (append-only bằng trigger, khóa idempotency UNIQUE), `currency_balances` (CHECK >= 0), `item_instances`, `mailbox`. `server/src/economy.ts`: `applyCurrencyDelta` (một batch D1, lặp khóa hoặc âm tiền thì cả batch rollback), `claimMail` (khóa `mail:<id>`), `createItem`, `sendMail`. HUD góc phải hiện cả 3 loại tiền (không nằm trong bảng nhân vật). Trang admin `/admin.html`: tìm theo email hoặc đạo hiệu (`GET /api/admin/lookup`), chọn tài khoản rồi nhân vật, xem số dư và 50 dòng sổ cái gần nhất (`GET /api/admin/character`), sau đó mới cộng/trừ (`POST /api/admin/grant` nhận `characterId`). Chưa có: xem số dư qua `/api/me`, giao diện hòm thư/túi đồ. **Chat 5 thẻ (Tất cả/Thế giới/Bản đồ/Truyền âm/Hệ thống) chưa làm, đã ghi ở `docs/PLAN.md` mục 9a cho GĐ2.** Quái rơi Linh Thạch (`rollLinhThachDrop`, ghi sổ cái đồng bộ qua hàng đợi riêng của phòng, không chặn tick; HUD hiện số dư). Admin: `POST /api/admin/grant`, `GET /api/admin/supply`, trang `/admin.html`. Test: `server/src/economy.test.ts` (SQLite thật với migration thật), `tools/economy-smoke.mjs` (chỉ local). **Chưa lên preview/production** |

## Đang chạy ở đâu
- **Preview:** tới hết 1e (kinh tế), ví, admin tra cứu và tạm dừng tick khi rảnh (sau khi PR này được merge và deploy).
- **Production:** tới hết 1e và ví/admin (deploy 2026-10-17, version e5610245). **Chưa có** tạm dừng tick khi rảnh.

## Còn lại của giai đoạn 1 (xem `docs/PHASE1.md`)
- **1f** Kiểm thử tải 50 client trên Cloudflare thật (kịch bản local đã có: `tools/load.mjs`), rà giới hạn gói Free; có thể cần Workers Paid

Việc tồn đọng khác:
- **Tạm dừng tick khi rảnh: ĐÃ LÀM** (`features_idle-tick`). Phòng rừng/hang tự dừng `setInterval` khi `CombatSim.isIdle()` (không quái chết/đuổi/về nhà, không người đi/có mục tiêu/thiếu máu/chết), ghi hết tiến độ rồi mới dừng, nên Durable Object ngủ được. `move`/`attack`/vào phòng đánh thức lại. Nếu runtime đã đuổi object (sim mất): `rebuild` dựng sim mới, cấp hồ sơ cho **mọi** người đang kết nối (đọc D1), khôi phục hạng quái từ `ctx.storage` (khóa `ranks`, tránh tái tung hạng để không nuôi lạm phát Linh Thạch), gửi lại `mon` cho client. Con số 10.800 GB-s mỗi ngày giờ chỉ đúng cho phòng đánh nhau liên tục; phòng đứng yên gần như không tốn. **Cần xác nhận trên preview** bằng `wrangler tail --env preview` (log `tick paused`, `sim rebuilt`) và bảng điều khiển Cloudflare (thời lượng DO giảm). Hạng quái không được lưu nếu object bị đuổi khi đang đánh nhau (crash): khi đó hạng được tung lại. Còn một đường tái tung hạng có sẵn từ trước: đổi kênh (mỗi kênh trống spawn lại quái mới); cần lưu ý khi làm boss và rơi đồ. `GET /api/dev/evict` phải trả 404 ở preview/production.
- **Độ trễ tick đo local** tối đa khoảng 125-524 ms giữa các lần chạy (ngưỡng 500 ms), nghi do A* khi nhiều người cùng đuổi quái; đo lại và tối ưu ở 1f.
- **Boss** (chưa làm, sau 1e): quy tắc đã chốt nằm ở `docs/PHASE1.md` mục 1d+. Câu hỏi còn mở: một boss cho mỗi kênh hay cho cả bản đồ qua 8 kênh; quy tắc loại dưới 10% có áp dụng cho tiền không hay chỉ cho đồ.
- **Giá trị tạm cần người dùng xác nhận:** lượng và xác suất rơi Linh Thạch (`DROP_CHANCE` thường 30%, hiếm 100%; `DROP_BASE`, `DROP_GROWTH`, `DROP_AMOUNT_MULT` trong `shared/src/economy.ts`); tên hạng quái hiếm ("Tinh Anh" 8%, "Đại Yêu" 2%) và các hệ số chỉ số/EXP của chúng (`RANKS`), `LOW_MAP_EXP_MULT = 1` (không phạt thêm khi người mạnh săn bản đồ thấp), nhịp lên cấp `KILLS_BASE`/`KILLS_GROWTH` (Nguyên Anh 9 cần 2162 quái cùng bậc một tầng, nặng).
- **Chưa ai qua được Luyện Khí 9** (chưa có đột phá, GĐ2) nên mọi lần giết ở hang đều bị chặn EXP ở mức cao nhất của rừng.
- **Chưa có:** rơi đồ (1e), PvP, kỹ năng, area-of-interest (mọi sự kiện gửi cả phòng), độ bền trang bị.
- Bản đồ vẽ bằng RenderTexture: chỉ mới thử với Canvas, chưa thử WebGL trên thiết bị thật (đặc biệt điện thoại). Có `?renderer=canvas` làm đường lùi.
- Hình ảnh vật cản và nhân vật còn là placeholder (xem mục asset trong `docs/PLAN.md`).
- Tài khoản thử `smoke-*` và `cpu-*@example.test` còn trong D1 preview; production có 2 tài khoản thử do người dùng tự tạo (thông tin đăng nhập do người dùng giữ, không ghi trong repo).
- Quên mật khẩu qua email và cổng thanh toán chưa làm (cần nhà cung cấp, xem `docs/PLAN.md`).

## Kinh tế: lưu ý vận hành
- **Chi phí ghi D1 của một lần rơi** (ước tính, local không báo `rows_written`): dòng sổ cái (bảng + chỉ mục idempotency + chỉ mục nhân vật = 3) + cập nhật số dư (1) ≈ 4 dòng; `INSERT OR IGNORE` số dư chỉ tốn khi tạo dòng mới. Hạn mức Free là 100k dòng/ngày dùng chung cả tài khoản, tức khoảng 25k lần rơi/ngày trước khi tính lưu vị trí. **Cần đo `meta.rows_written` thật trên preview** (1f). Phương án nếu thiếu: giảm `DROP_CHANCE` hoặc hàng đợi bền trong DO gộp ghi (đổi luật PLAN mục 3, cần người dùng đồng ý).
- Một lần rơi thất bại sau 3 lần thử thì mất (không bao giờ nhân đôi): khóa idempotency tạo một lần cho mỗi lần giết và dùng lại khi thử lại.
- Gán admin: `wrangler d1 execute DB --env preview --remote --command "UPDATE accounts SET role='admin' WHERE email='...'"`. Trang `/admin.html` tạo khóa idempotency mới cho mỗi lần hiển thị form.
- **Không bao giờ chèn tay dòng thử vào sổ cái preview/production**: trigger làm chúng vĩnh viễn và phá phép kiểm `SUM(delta) = số dư`. Dùng nhân vật thử.
- Đo chi phí thật: `npx wrangler tail --env preview` rồi giết quái, dòng log `ledger rows_written <reason> <n>` cho số dòng ghi mỗi lần.
- `client/public/admin.html` viết chuỗi tiếng Việt trực tiếp (ngoại lệ chấp nhận được với công cụ quản trị độc lập, trái PLAN mục 7).
- **Triển khai:** chạy `db:migrate:*` (0005) TRƯỚC khi deploy worker, hai bước riêng; thiếu bảng thì mọi lần rơi lỗi âm thầm vào log.
- Test kinh tế dùng `node:sqlite` (Node 22+); file test bị loại khỏi `tsc` của server vì không có kiểu Node.

## Môi trường
| | Production | Preview |
|---|---|---|
| Worker | `cultivation` | `cultivation-preview` |
| URL | https://cultivation.hanowl.workers.dev, https://cultivation.hanowl.com | https://cultivation-preview.hanowl.workers.dev |
| D1 | `cultivation-db` | `cultivation-preview-db` |
| Nhánh | `main` | `preview` |

- Durable Object (SQLite): `MapRoom` (mỗi `bản đồ:kênh` một object), `CharacterLock` (theo id nhân vật), `PasswordHasher`.
- Gói Cloudflare: kế hoạch vận hành là **Workers Paid** (`docs/PLAN.md` mục 2a), nhưng **khi develop đang dùng Workers Free**. Nếu gặp kỹ thuật/công nghệ cần bản Paid thì thông báo người dùng để nâng cấp, không tự giả định. Giới hạn Free đã tính: Worker 10 ms CPU mỗi request (vì vậy băm mật khẩu PBKDF2 100k vòng nằm trong DO), DO 100k request và 13.000 GB-s mỗi ngày, D1 100k dòng ghi mỗi ngày. Vượt thì lỗi đến 00:00 UTC. **Tick chiến đấu (1d) làm tăng mức dùng GB-s:** một phòng rừng/hang có người cả ngày tốn khoảng 10.800 GB-s, và hạn mức là chung cả tài khoản (preview và production cộng lại). Vượt hạn mức làm hỏng mọi DO kể cả `PasswordHasher`, tức đăng nhập cũng lỗi đến 00:00 UTC. Test xong nên đóng các tab đang đứng ở rừng/hang. Đã giảm bằng cách tạm dừng tick khi không có gì xảy ra và phục hồi sau khi DO ngủ (xem mục tồn đọng); phòng đánh nhau liên tục vẫn tốn như trên.
- Kênh mặc định là `ch4` (`client/src/config.ts`). Cloudflare đặt DO ngẫu nhiên trong vùng APAC. Đã đo: production ch1 KIX, ch2 SIN, ch3 NRT, ch4 SIN, ch5 KIX, ch6 HKG, ch7 HKG, ch8 SIN. Phải đo lại nếu đổi môi trường. HUD hiện "Máy chủ: XXX"; `/api/whereami` cho biết edge.

## Kiến trúc nhanh
```
client/  Vite + Phaser 3 (Canvas/WebGL) + lớp HTML cho đăng nhập, chat, HUD
server/  Worker (API + WebSocket) + Durable Object + D1
shared/  Bản đồ, va chạm, tìm đường, giao thức, validation (dùng chung client và server)
tools/   smoke.mjs
```
- **Một Worker** phục vụ asset tĩnh, `/api/*`, `/ws` (cấu hình `wrangler.jsonc`, có khối `env.preview`; môi trường không kế thừa binding nên phải khai báo lại).
- **Server là nguồn sự thật.** Worker xác thực cookie, đặt header `x-char-id`, `x-room` rồi chuyển cho `MapRoom`. Bản đồ do server quyết định theo vị trí đã lưu; client chỉ chọn kênh (`?ch=N`).
- **Vị trí** là tọa độ liên tục (đơn vị ô, tâm ô là `i+0.5`), đường đi là danh sách điểm (`Vec2[]`), lưu D1 với 2 chữ số thập phân. Hàng cũ lưu số nguyên được coi là tâm ô.
- **Khóa nhân vật:** vào phòng mới phải `CharacterLock.claim` trước; phòng cũ lưu rồi đá socket; chỉ sau đó phòng mới mới đọc dòng nhân vật. Giải phóng theo `claimId`, không theo tên phòng.
- **Chuyển bản đồ:** lưu tại bản đồ đích → tách socket → giải phóng khóa → báo `transfer` → client kết nối lại và nhận `welcome` mới.
- **Ping:** chuỗi thuần `ping`/`pong` do runtime tự trả (`setWebSocketAutoResponse`), không đánh thức DO. Trạng thái người chơi nằm trong attachment của socket nên DO ngủ được **ở thành**; ở bản đồ có quái, trạng thái chiến đấu nằm trong bộ nhớ phòng và phòng thức suốt lúc có người (tick 10 Hz).
- **Lưu vị trí và tiến độ:** khi ngắt kết nối và debounce 10 giây bằng alarm sau khi di chuyển hoặc nhận EXP (không có alarm định kỳ). Lên tầng ghi ngay. Mọi đường nhả khóa (rời, bị đá, portal, chết) ghi tiến độ trước; điểm tiềm năng ghi theo delta và được "đặt chỗ" trước khi ghi (`beginFlush`/`endFlush`) để không ghi trùng.
- **Va chạm:** `CELLS_PER_TILE = 4`, bán kính thân `BODY_RADIUS = 0.25`. A* trên lưới điều hướng mịn rồi kéo căng bằng line-of-sight (`findSmoothPath`). Click vào vật cản đi tới điểm đứng được gần nhất.
- **Giao thức:** xem `shared/src/protocol.ts`. Client gửi `move` (x, y, fx, fy, seq), `portal`, `chat`, `allocate` (điểm theo chỉ số, một tin một lần ghi), `attack` (id quái); server trả `welcome` (kèm `character`), `stats` (sau mỗi lần cộng điểm hoặc nhận EXP), `mon`/`mon_gone` (quái theo đường đi như người chơi), `hit`, `hp`, `died`; `joined`, `left`, `path`, `ack`, `transfer`, `chat`, `chat_error`, `kicked`.
- **D1:** migration trong `server/migrations/` (`0001`, `0002`, `0003` thêm 6 cột `stat_*`, `0004` thêm `root_grade`). Bảng `accounts`, `sessions`, `characters` (một nhân vật mỗi tài khoản), `auth_attempts`. Vai trò `admin` gán thủ công bằng `wrangler d1 execute`.

## Quy trình làm việc
- Nhánh và deploy: xem `CLAUDE.md` (`features_*` từ `preview` → PR vào `preview` → deploy preview → PR vào `main` → deploy production). Trước khi deploy chạy `npm run db:migrate:preview` hoặc `npm run db:migrate:remote` nếu có migration mới.
- Lệnh: `npm run typecheck`, `npm test`, `npm run preview` (build + wrangler dev ở :8787), `npm run db:migrate:local`, `npm run deploy:preview`, `npm run deploy`.
- **EXP thử (chỉ local):** `POST /api/dev/grant-exp {exp}` chỉ hoạt động khi `.dev.vars` có `ENABLE_DEV_GRANT=1`, nếu không trả 404 (kiểm tra production/preview phải thấy 404 khi không cookie). Smoke dùng nó để thử lên tầng và tự bỏ qua bước đó nếu 404.
- **Kiểm thử tải (chỉ local):** `node tools/load.mjs [ws://localhost:8787] [50] [30]` cho 50 client vào một phòng rừng, đánh quái 30 giây, rồi đọc số đo tick từ `GET /api/dev/tick-stats?room=forest:7` (cùng cờ `ENABLE_DEV_GRANT=1`, ngoài ra 404). Cần `DISABLE_RATE_LIMIT=1` trong `.dev.vars`. Tự từ chối host không phải localhost.
- **Kiểm thử tạm dừng tick (chỉ local):** `node tools/idle-smoke.mjs` (cần `DISABLE_RATE_LIMIT=1` và `ENABLE_DEV_GRANT=1`): hai client đứng yên, tick phải dừng; `GET /api/dev/evict?room=forest:5` giả lập runtime đuổi object; một cú `attack` phải dựng lại sim cho cả hai người, giữ hạng quái. `wrangler dev` không đuổi object đáng tin cậy nên cần hook này.
- **Smoke test** (`node tools/smoke.mjs [wss://host]`) tạo tài khoản thật nên **chỉ chạy ở local hoặc preview**, tự từ chối production. Local cần file `.dev.vars` (không commit) chứa `DISABLE_RATE_LIMIT=1`. Trên preview giới hạn đăng ký là 10 lần mỗi 10 phút (cửa sổ cố định), nên chỉ chạy được khoảng một lần mỗi 10 phút.
- **Kiểm tra production** chỉ làm chỉ-đọc: `/api/health`, `/api/me` không cookie và cookie rác phải 401, WebSocket không cookie 401, POST Origin lạ 403, trang có khung đăng nhập và chat.
- **Thỏa thuận với trợ lý:** trợ lý không nhập mật khẩu hay tạo tài khoản trên host từ xa (preview/production); các bước cần đăng nhập thật do người dùng tự thử. Việc đăng ký/đăng nhập tự động chỉ chạy ở local.
- **Thứ tự deploy cho thay đổi có migration:** code mới SELECT các cột `stat_*`, nên phải chạy `db:migrate:preview` (hoặc `db:migrate:remote`) TRƯỚC khi deploy worker, nếu không `/api/me` và WebSocket đều lỗi.
- Danh tính git theo repo: `hano-c4l` / `hano.c4l@gmail.com` (cấu hình local, không đi theo repo).
- Cloud cần: `gh` đã đăng nhập, `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` để dùng wrangler (token do người dùng tạo và giữ trong secrets).

## Bẫy đã gặp
- Kênh hợp lệ là 1 đến 8; `?ch=9` trả 400 và WebSocket báo 1006 (dễ nhầm với lỗi mạng).
- Khi thử UI cục bộ, đừng sửa vị trí nhân vật trong D1 lúc trình duyệt còn mở WebSocket: socket cũ đóng lại sẽ ghi đè vị trí. Đóng trang trước (điều hướng sang `/api/health`), sửa D1, rồi mở lại.
- Nhân vật để đứng ở rừng/hang bị quái giết rồi về thành; quên tab ở đó cũng tốn hạn mức (xem mục tick).
- Lệnh nối `npm run db:migrate:* | tail && npm run deploy:*` vẫn chạy deploy khi migration lỗi (lỗi thoáng qua code 7403 từng xảy ra): chạy migration và deploy thành hai bước riêng, kiểm tra kết quả migration trước.
- Heredoc shell (`<<'EOF'`) hay hỏng với nội dung có backtick, `${}` hoặc dấu nháy lẫn lộn; dùng công cụ ghi file hoặc script Python lưu thành file.
- `tools/smoke.mjs` import `shared/src/map.ts` bằng type-stripping của Node: file đó không được dùng cú pháp TypeScript không xóa được (parameter properties, enum) và không được import file khác thiếu đuôi mở rộng.
- Worker Free chỉ 10 ms CPU: không băm mật khẩu hay làm việc nặng trong Worker; để trong DO.
- `workers-types` v5 và wrangler 4: dùng `^5.20261006.1`, nếu không `npm install` báo ERESOLVE.
- Lần gọi đầu tiên sau mỗi lần deploy đôi khi lỗi thoáng qua (health trả 1042 hoặc smoke timeout); chạy lại thì qua. Chưa rõ nguyên nhân.
- WebGL trong khung trình duyệt của app không tạo được framebuffer; client tự chuyển sang Canvas khi gặp lỗi đó.
- Đo độ trễ từ máy phát triển không đại diện: định tuyến của máy này nhảy giữa nhiều edge (CDG, MAD, NRT, SIN) và RTT 330–450 ms.
