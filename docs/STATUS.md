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
| Movement budget | `shared/src/movement.ts`: server chỉ tin ô xuất phát client khai khi còn ngân sách (cap 3 ô, hồi 1 ô/giây), nên nối chuỗi claim chỉ tăng tối đa khoảng 25% tốc độ. Bấm quá dày thì server dùng vị trí của mình (client thấy bị kéo nhẹ; cần kiểm tra cảm giác với độ trễ thật trên preview) |
| 1d+ Vùng quái | Bản đồ có cảnh giới, 3 cụm × 3 quái (bậc 1, 4, 7) mỗi bản đồ, quái thường/hiếm (2 hạng), tên có bậc và loại, EXP theo nhịp lên cấp, chặn EXP khi săn sai cảnh giới. Boss và rơi đồ chưa làm (xem `docs/PHASE1.md` 1d+). Bảng EXP người chơi đã nhân 10 |
| Di chuyển | Dự đoán phía client, hòa trộn khi server sửa, ping tự trả lời (DO ngủ được), đích đến chính xác, đường đi làm thẳng, **va chạm lưới mịn 4x4 mỗi ô** (vật cản tròn, vát góc, hàng rào mỏng) |

## Còn lại của giai đoạn 1 (xem `docs/PHASE1.md`)
- **1e** Kinh tế khung xương: `item_instances`, `currency_ledger` append-only có idempotency key, `mailbox`, trang admin cộng tiền, rơi Linh Thạch
- **1f** Kiểm thử tải 50 client trên Cloudflare thật (kịch bản local đã có: `tools/load.mjs`), rà giới hạn gói Free; có thể cần Workers Paid

Việc tồn đọng khác:
- Bản đồ vẽ bằng RenderTexture: chỉ mới thử với Canvas, chưa thử WebGL trên thiết bị thật (đặc biệt điện thoại). Có `?renderer=canvas` làm đường lùi.
- Hình ảnh vật cản và nhân vật còn là placeholder (xem mục asset trong `docs/PLAN.md`).
- Tài khoản thử `smoke-*` và `cpu-*@example.test` còn trong D1 preview; production có 2 tài khoản thử do người dùng tự tạo (thông tin đăng nhập do người dùng giữ, không ghi trong repo).
- Quên mật khẩu qua email và cổng thanh toán chưa làm (cần nhà cung cấp, xem `docs/PLAN.md`).

## Môi trường
| | Production | Preview |
|---|---|---|
| Worker | `cultivation` | `cultivation-preview` |
| URL | https://cultivation.hanowl.workers.dev, https://cultivation.hanowl.com | https://cultivation-preview.hanowl.workers.dev |
| D1 | `cultivation-db` | `cultivation-preview-db` |
| Nhánh | `main` | `preview` |

- Durable Object (SQLite): `MapRoom` (mỗi `bản đồ:kênh` một object), `CharacterLock` (theo id nhân vật), `PasswordHasher`.
- Gói Cloudflare: kế hoạch vận hành là **Workers Paid** (`docs/PLAN.md` mục 2a), nhưng **khi develop đang dùng Workers Free**. Nếu gặp kỹ thuật/công nghệ cần bản Paid thì thông báo người dùng để nâng cấp, không tự giả định. Giới hạn Free đã tính: Worker 10 ms CPU mỗi request (vì vậy băm mật khẩu PBKDF2 100k vòng nằm trong DO), DO 100k request và 13.000 GB-s mỗi ngày, D1 100k dòng ghi mỗi ngày. Vượt thì lỗi đến 00:00 UTC. **Tick chiến đấu (1d) làm tăng mức dùng GB-s:** một phòng rừng/hang có người cả ngày tốn khoảng 10.800 GB-s, và hạn mức là chung cả tài khoản (preview và production cộng lại). Vượt hạn mức làm hỏng mọi DO kể cả `PasswordHasher`, tức đăng nhập cũng lỗi đến 00:00 UTC. Test xong nên đóng các tab đang đứng ở rừng/hang. Việc cần làm trước khi có người chơi thật: tạm dừng tick khi không có gì xảy ra (không quái đuổi, không ai có mục tiêu hoặc đang di chuyển) và xử lý phục hồi sau khi DO ngủ.
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
- **Smoke test** (`node tools/smoke.mjs [wss://host]`) tạo tài khoản thật nên **chỉ chạy ở local hoặc preview**, tự từ chối production. Local cần file `.dev.vars` (không commit) chứa `DISABLE_RATE_LIMIT=1`. Trên preview giới hạn đăng ký là 10 lần mỗi 10 phút (cửa sổ cố định), nên chỉ chạy được khoảng một lần mỗi 10 phút.
- **Kiểm tra production** chỉ làm chỉ-đọc: `/api/health`, `/api/me` không cookie và cookie rác phải 401, WebSocket không cookie 401, POST Origin lạ 403, trang có khung đăng nhập và chat.
- **Thỏa thuận với trợ lý:** trợ lý không nhập mật khẩu hay tạo tài khoản trên host từ xa (preview/production); các bước cần đăng nhập thật do người dùng tự thử. Việc đăng ký/đăng nhập tự động chỉ chạy ở local.
- **Thứ tự deploy cho thay đổi có migration:** code mới SELECT các cột `stat_*`, nên phải chạy `db:migrate:preview` (hoặc `db:migrate:remote`) TRƯỚC khi deploy worker, nếu không `/api/me` và WebSocket đều lỗi.
- Danh tính git theo repo: `hano-c4l` / `hano.c4l@gmail.com` (cấu hình local, không đi theo repo).
- Cloud cần: `gh` đã đăng nhập, `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` để dùng wrangler (token do người dùng tạo và giữ trong secrets).

## Bẫy đã gặp
- Heredoc shell (`<<'EOF'`) hay hỏng với nội dung có backtick, `${}` hoặc dấu nháy lẫn lộn; dùng công cụ ghi file hoặc script Python lưu thành file.
- `tools/smoke.mjs` import `shared/src/map.ts` bằng type-stripping của Node: file đó không được dùng cú pháp TypeScript không xóa được (parameter properties, enum) và không được import file khác thiếu đuôi mở rộng.
- Worker Free chỉ 10 ms CPU: không băm mật khẩu hay làm việc nặng trong Worker; để trong DO.
- `workers-types` v5 và wrangler 4: dùng `^5.20261006.1`, nếu không `npm install` báo ERESOLVE.
- Lần gọi đầu tiên sau mỗi lần deploy đôi khi lỗi thoáng qua (health trả 1042 hoặc smoke timeout); chạy lại thì qua. Chưa rõ nguyên nhân.
- WebGL trong khung trình duyệt của app không tạo được framebuffer; client tự chuyển sang Canvas khi gặp lỗi đó.
- Đo độ trễ từ máy phát triển không đại diện: định tuyến của máy này nhảy giữa nhiều edge (CDG, MAD, NRT, SIN) và RTT 330–450 ms.
