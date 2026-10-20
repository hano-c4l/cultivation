# Tài liệu kỹ thuật (hạ tầng, kiến trúc, cách chạy và kiểm thử)

Phần kỹ thuật dùng chung cho mọi giai đoạn: hạ tầng Cloudflare, gói Free/Paid, kiến trúc, nơi chạy, cách chạy, kiểm thử, quy trình triển khai và các bẫy đã gặp. Kế hoạch tổng nằm ở `docs/PLAN.md`, từng giai đoạn ở `docs/PHASE1.md`, `docs/PHASE2.md`, trạng thái hiện tại ở `docs/STATUS.md`. **Các mục 2, 2a, 3, 5, 6, 8 dưới đây được chuyển từ PLAN.md và giữ nguyên số mục** (các chỗ khác vẫn gọi "mục 2a", "mục 3"... nhưng nay là mục của file này).

## 2. Hình dạng deploy
- **Một Worker duy nhất** phục vụ client (static assets), API HTTP, WebSocket, Durable Objects và D1. Cloudflare đang gộp Pages vào Workers nên **không có deploy Pages riêng**; đáp ứng yêu cầu "Workers and Pages" bằng Workers Static Assets.
- Monorepo (pnpm workspaces), thư mục gốc cần `git init` (hiện chưa là git repo):
  - `client/`: Vite + TypeScript, Phaser 3 (canvas) + lớp UI HTML/CSS phủ lên (inventory, chat, bảng nhiệm vụ).
  - `server/`: Worker, các Durable Object, migration D1.
  - `shared/`: kiểu dữ liệu, schema message (validate bằng zod hoặc tương đương), dữ liệu game (JSON/TS), công thức chỉ số/ngũ hành/cảnh giới, lưới đi được (walkability) dùng chung client/server.
  - `tools/`: script build map/atlas, seed dữ liệu.
  - `docs/`: tài liệu.

## 2a. Gói Cloudflare: Paid là đích, Free khi phát triển
- **Đích vận hành:** Workers Paid (CPU/request cao hơn, nhiều quota Durable Object và D1 hơn).
- **Khi develop:** mặc định chạy trên Workers Free để tiết kiệm; thiết kế code sao cho chạy được trong giới hạn Free (ví dụ băm mật khẩu nằm trong Durable Object vì Worker Free chỉ có 10 ms CPU, ghi D1 theo batch/debounce).
- **Quy tắc báo nâng cấp:** khi gặp việc mà giới hạn Free thực sự chặn (CPU 10 ms, quota request/GB-s của DO, 100k dòng ghi D1/ngày, kiểm thử tải 50 client, tick loop chạy liên tục...), trợ lý **dừng lại và thông báo người dùng** nêu rõ: giới hạn nào, vì sao cần Paid, có phương án né trong Free không. Chỉ nâng cấp khi người dùng đồng ý.
- Không thiết kế lệch kiến trúc chỉ để né Free nếu việc đó làm sai hướng so với bản Paid; khi nghi ngờ, hỏi người dùng.

## 3. Bảng sở hữu trạng thái (quan trọng nhất)
Nguyên tắc: **server là nguồn sự thật**; mỗi nhân vật chỉ có **1 writer** tại một thời điểm.

| Trạng thái | Bản chính nằm ở | Ghi xuống D1 khi nào |
|---|---|---|
| Vị trí, hướng, đường đi | `MapRoom` DO (bộ nhớ) | Khi rời bản đồ / ngắt kết nối / mỗi ~30-60s |
| HP/MP, buff, cooldown, sát khí tức thời | `MapRoom` DO | Khi rời bản đồ / ngắt kết nối / định kỳ (HP/MP không cần lưu chính xác) |
| EXP, cảnh giới, điểm tiềm năng, kỹ năng | `MapRoom` DO (bản làm việc), D1 là bản bền | Mỗi sự kiện quan trọng (lên tầng, học kỹ năng) và định kỳ |
| Túi đồ, trang bị | D1 (bản chính); DO giữ cache khi nhân vật online | Mỗi thay đổi có giá trị (nhặt/dùng/bỏ đồ hiếm), batch theo khoảng thời gian cho đồ rác |
| **3 loại tiền** | **D1 (sổ cái append-only)**; số dư là bản tổng hợp | **Đồng bộ mỗi giao dịch**, không bao giờ chỉ ở bộ nhớ |
| Escrow giao dịch trực tiếp | D1 (bảng `trade_sessions`) + DO điều phối | Atomic: batch D1 với cập nhật có điều kiện |
| Tin đăng chợ, đấu giá | D1 | Đồng bộ |
| Hòm thư (tiền/đồ cho người offline) | D1 (`mailbox`) | Đồng bộ |
| Phiên đăng nhập, khóa phiên | D1 + `CharacterLock` DO (khóa theo id nhân vật) | Khi đăng nhập/đăng xuất |

Quy tắc bổ sung:
- **Session lock**: mỗi nhân vật có 1 khóa phiên; đăng nhập lần 2 sẽ đá phiên cũ (hoặc từ chối) để tránh nhân đôi trạng thái.
- **Chuyển bản đồ**: *lưu → giải phóng khóa bản đồ cũ → vào bản đồ mới*, theo đúng thứ tự này.
- **Không ghi D1 mỗi tick.** Chỉ batch theo khoảng thời gian và khi ngắt kết nối.
- Nếu DO bị evict đột ngột: tối đa mất ~30-60s tiến độ thường, **không bao giờ mất tiền/đồ giá trị** (vì ghi đồng bộ).

## 5. Vòng đời Map DO và netcode
- Mỗi **bản đồ + kênh** là một `MapRoom` DO (SQLite-backed, WebSocket Hibernation API).
- **Tick loop chỉ chạy khi có người chơi** (interval giữ DO không ngủ và tính phí thời lượng). Phòng trống: dừng tick và bỏ trạng thái quái; hồi sinh quái/tài nguyên chạy bằng bộ đếm trong tick (không dùng alarm: alarm tính như request DO và không có quan sát viên khi phòng trống). Bản đồ an toàn không tick.
- **Click-to-move**: client gửi ô đích → server chạy A* trên lưới đi được dùng chung → server phát `đường đi + thời điểm bắt đầu + tốc độ` → client nội suy. Không gửi vị trí mỗi frame.
- Chiến đấu xử lý trên tick server (~10-15Hz); client chỉ dự đoán hiệu ứng.
- **Area-of-interest**: chỉ gửi thực thể trong bán kính nhìn thấy, để 100 người không làm nghẽn client mobile.
- Chống gian lận: kiểm tra tốc độ, khoảng cách kỹ năng, giới hạn tần suất message, mọi tham số từ client đều validate bằng schema.
- Độ trễ cho người chơi Việt Nam: kiểm tra DO `locationHint` (APAC) và đo thực tế ở Giai đoạn 0.
- Tải nhiều người: DO chạy 1 luồng; sẽ có kênh phụ (`map:channel`) và giới hạn dân số mỗi kênh.

## 6. Đặc tả asset (để thay art sau không phải sửa code)
Con số cố định (có thể chỉnh trước khi bắt đầu, sau đó khóa lại):
- **Tile isometric: 64×32 px** (tỉ lệ 2:1). Chiều cao vật thể tính theo bội số 16 px.
- **Nhân vật: khung 96×96 px, 8 hướng, neo (anchor) ở chân** (giữa đáy). 1 đơn vị thế giới = 1 tile.
- Animation: `idle, run, attack, cast, hit, die` (số frame/hướng ghi trong manifest).
- **Thú cưỡi là layer tách riêng** (vẽ dưới/trên nhân vật theo hướng) để ghép được với mọi nhân vật.
- **Asset manifest** (`assets/manifest.json`): ánh xạ ID logic → file/atlas/neo/khung. Thay art chỉ sửa manifest và file ảnh.
- Bản đồ vẽ bằng **Tiled** (isometric) với layer: nền, vật thể, **collision**, spawn, portal, NPC. Script `tools/` build ra JSON + lưới đi được cho server.
- Cách tìm asset: tìm bộ CC0 isometric (OpenGameArt, itch.io, kho Kenney) lọc theo giấy phép, ghi nguồn vào `ASSETS.md`. Nhân vật tu tiên 8 hướng có animation nhiều khả năng sẽ phải dùng **placeholder** (hình khối/sprite tạm cùng kích thước chuẩn).

## 8. Xác thực
- Băm mật khẩu bằng **PBKDF2 (WebCrypto)** với salt riêng, số vòng lặp cao.
- Phiên bằng cookie **HttpOnly, Secure, SameSite**; cookie này cũng xác thực lúc nâng cấp WebSocket.
- Giới hạn tần suất đăng nhập/đăng ký.
- **Quên mật khẩu qua email là phụ thuộc cần bạn cung cấp** (dịch vụ gửi mail) → để giai đoạn sau; trước đó admin đặt lại mật khẩu thủ công.

## Giới hạn gói Free: các dấu hiệu cần nâng Workers Paid
- Đo tải thật 50 client trên Cloudflare (1f) **hoãn theo quyết định của người dùng (2026-10-17)**. **Chỉ nâng Workers Paid khi gặp một trong các dấu hiệu**: có vài chục người online cùng lúc; lỗi quota hoặc 1015/1102/1042 kéo dài, đăng nhập lỗi hàng loạt; bảng điều khiển Cloudflare cho thấy GB-s, request Durable Object hoặc dòng ghi D1 trên khoảng 80% hạn mức ngày (hạn mức chung preview và production). Khi nâng thì báo người dùng trước (`docs/TECHNICAL.md` mục 2a), rồi mới chạy đo tải thật.

## Quy ước làm việc với người dùng
  - Khi người dùng nói **"PR"** nghĩa là: mở PR, merge, rồi deploy chỗ đó (chạy migration D1 **trước**, riêng một bước, nếu có). Nếu không nói "PR", làm xong thì hỏi một câu "mở PR vào preview (merge và deploy preview luôn)?".
  - Quy trình nhánh trong `CLAUDE.md`: `features_xxxx` từ `preview` → PR vào `preview` → deploy preview → (chỉ khi người dùng đồng ý) PR `preview` → `main` → migrate production → deploy production. Không commit thẳng vào `main`/`preview`.
  - Trợ lý **không đăng nhập hay tạo tài khoản trên preview/production**; kiểm tra ở đó chỉ-đọc (`/api/health`, các API cần đăng nhập phải 401, các cổng `dev` phải 404, WebSocket không cookie bị từ chối). Việc cần đăng nhập thật do người dùng tự thử; trợ lý nêu rõ danh sách cần thử.
  - Trước khi báo "xong" và trước khi chốt thiết kế lớn, tham khảo advisor (xem `CLAUDE.md`). Số liệu và rủi ro giới hạn gói Free phải báo cho người dùng (xem `docs/TECHNICAL.md` mục 2a).
  - Báo cáo cuối mỗi việc: nói rõ **đã kiểm gì, chưa kiểm gì**, giá trị tạm đã dùng và việc người dùng cần thử.
  - **Khi người dùng nói "cập nhật docs" hoặc "cập nhật status"**: cập nhật **đúng file, đúng vị trí** theo bản đồ tài liệu ở `CLAUDE.md` (mục "Docs and how to update them"), không dồn mọi thứ vào `docs/STATUS.md`. `PLAN.md`: thay đổi tổng quan so với kế hoạch; `TECHNICAL.md`: hạ tầng, kiến trúc, môi trường, cách chạy và kiểm thử, bẫy; `PHASExx.md` (từng giai đoạn): chi tiết, quyết định, tồn đọng của từng giai đoạn; `STATUS.md`: chỉ giai đoạn nào xong, đang làm, cần làm tiếp (và phần nào của giai đoạn đang làm dở).


## Môi trường và nơi chạy
| | Production | Preview |
|---|---|---|
| Worker | `cultivation` | `cultivation-preview` |
| URL | https://cultivation.hanowl.workers.dev, https://cultivation.hanowl.com | https://cultivation-preview.hanowl.workers.dev |
| D1 | `cultivation-db` | `cultivation-preview-db` |
| Nhánh | `main` | `preview` |

- Durable Object (SQLite): `MapRoom` (mỗi `bản đồ:kênh` một object), `CharacterLock` (theo id nhân vật), `PasswordHasher`.
- Gói Cloudflare: kế hoạch vận hành là **Workers Paid** (`docs/TECHNICAL.md` mục 2a), nhưng **khi develop đang dùng Workers Free**. Nếu gặp kỹ thuật/công nghệ cần bản Paid thì thông báo người dùng để nâng cấp, không tự giả định. Giới hạn Free đã tính: Worker 10 ms CPU mỗi request (vì vậy băm mật khẩu PBKDF2 100k vòng nằm trong DO), DO 100k request và 13.000 GB-s mỗi ngày, D1 100k dòng ghi mỗi ngày. Vượt thì lỗi đến 00:00 UTC. **Tick chiến đấu (1d) làm tăng mức dùng GB-s:** một phòng rừng/hang có người cả ngày tốn khoảng 10.800 GB-s, và hạn mức là chung cả tài khoản (preview và production cộng lại). Vượt hạn mức làm hỏng mọi DO kể cả `PasswordHasher`, tức đăng nhập cũng lỗi đến 00:00 UTC. Test xong nên đóng các tab đang đứng ở rừng/hang. Đã giảm bằng cách tạm dừng tick khi không có gì xảy ra và phục hồi sau khi DO ngủ (xem mục tồn đọng); phòng đánh nhau liên tục vẫn tốn như trên.
- Kênh mặc định là `ch4` (`client/src/config.ts`). Cloudflare đặt DO ngẫu nhiên trong vùng APAC. Đã đo: production ch1 KIX, ch2 SIN, ch3 NRT, ch4 SIN, ch5 KIX, ch6 HKG, ch7 HKG, ch8 SIN. Phải đo lại nếu đổi môi trường. HUD hiện "Máy chủ: XXX"; `/api/whereami` cho biết edge.


### Đang chạy ở đâu
- Mỗi môi trường chạy bản code của nhánh tương ứng (`main` cho production, `preview` cho preview). **Môi trường nào đang có tính năng nào và D1 đã áp dụng migration đến số mấy: xem `docs/STATUS.md`** (mục "Đang chạy ở đâu"), vì thông tin đó thay đổi sau mỗi lần deploy.
- Số version đổi mỗi lần deploy (kể cả deploy chỉ có thay đổi tài liệu); xem `wrangler deployments` hoặc lịch sử PR.
- Production còn hai tài khoản thử do người dùng tự tạo; preview còn nhiều tài khoản thử của smoke script (`smoke-*`, `cpu-*`, `eco-*`, `chat-*`... `@example.test`, không đụng chạm).

## Kiến trúc nhanh (bản hiện tại)
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
- **Giao thức** (đầy đủ và mới nhất: `shared/src/protocol.ts`; túi đồ ở mục 2a, chat ở mục 2g, danh mục thể chất ở mục thể chất): client gửi `move` (x, y, fx, fy, seq), `portal`, `chat` (kèm `channel`), `allocate` (điểm theo chỉ số, một tin một lần ghi), `attack` (id quái); server trả `welcome` (kèm `character`), `stats` (sau mỗi lần cộng điểm hoặc nhận EXP), `mon`/`mon_gone` (quái theo đường đi như người chơi), `hit`, `hp`, `died`; `joined`, `left`, `path`, `ack`, `transfer`, `chat`, `chat_error`, `kicked`; sau này thêm `wallet`, `inv`, `loot`, `mail`, `inv_error`, đột phá (`bt_start`/`bt_cancel`, hướng tu (`path_claim`, `path_choose`, `path_swap`, `path_drop`, `path_claimed`, `path_error`), `bt`, `bt_end`, `bt_error`), thương nhân (`npc_open`, `shop_buy`, `shop_sell`, `shop_sell_many` từ client; `shop`, `shop_ok`, `shop_sold`, `tp`, `tp_end` (niệm phù truyền tống) từ server; nhiệm vụ (`quest_accept`, `quest_turn_in` từ client; `quests`, `quest_active`, `quest_progress`, `quest_done`, `quest_error` từ server); PvP (`pk_mode` từ client; `pk`, `pk_score`, `pk_error` từ server, `hit` có thêm `ret`, `PlayerSnapshot.sn`); lý do lỗi `far`, `sold_out`, `unsellable`, `breaking`) và `hotbar_set`/`hotbar_swap` (kéo thả đổi ô phím tắt) và `welcome` mang `wallet`, `bag`, `mail`, `constitutions`.
- **D1:** migration trong `server/migrations/`: `0001` khởi tạo, `0002` tài khoản/phiên/nhân vật, `0003` sáu cột `stat_*`, `0004` `root_grade`, `0005` kinh tế (sổ cái, số dư, vật phẩm, hòm thư), `0006` túi đồ (`qty`, `bag_tab`, `cell`, `bag_tabs`, `item_grants`, `inv_guard`, hạn thư), `0007` thể chất của nhân vật (cột + tung cho nhân vật có sẵn), `0008` bảng danh mục thể chất + `config_versions`, `0009` giới tính và trang bị (`characters.gender`, `item_instances.equip_slot/durability/max_durability`), `0015` túi 8×8 (đồ ở ô 64-127 vào hòm thư) và `game_settings`, `0014` nhiều hệ linh căn (`characters.roots`), `0013` vitals (`characters.vitals`), `0012` kỹ năng (`character_skills`, `characters.hotbar`), `0011` cột luyện cấp của pháp bảo bản mệnh (`refine_level`, `refine_exp`), `0022` điểm PvP (`characters.sat_khi`, `sat_nhan`, `anh_hung`), `0021` cập nhật nội dung ba nhiệm vụ hướng tu (khác nhau theo hướng), `0020` nhiệm vụ (`quests`: danh mục nhiệm vụ dạng dữ liệu, `character_quests`: tiến độ từng nhân vật), `0019` thương nhân (`shop_purchases`: số đã mua mỗi ngày của món giới hạn), `0018` hướng tu (`character_paths`, `characters.paths`), `0017` đột phá (`characters.bt_started_at`), `0010` gán ngũ hành (và loại vũ khí) ngẫu nhiên cho trang bị cũ bằng cách thêm vào cuối `item_type` (một lần, không đụng id đã có ngũ hành, `eqs.*` hay vật phẩm thường). Bảng chính: `accounts`, `sessions`, `characters` (một nhân vật mỗi tài khoản), `auth_attempts`, `currency_ledger`, `currency_balances`, `item_instances`, `item_grants`, `mailbox`, `constitutions`, `constitution_tiers`, `constitution_effects`, `config_versions`. Durable Object: `MapRoom`, `CharacterLock`, `PasswordHasher`, `ChatHub` (migration `v3` trong `wrangler.jsonc`). Vai trò `admin` gán thủ công bằng `wrangler d1 execute`.

## Quy trình làm việc và triển khai
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

- **Máy mới (laptop):** cần `.dev.vars` (không commit) với `DISABLE_RATE_LIMIT=1` và `ENABLE_DEV_GRANT=1` để chạy các smoke script, `npm install`, `gh` đã đăng nhập, `CLOUDFLARE_API_TOKEN` và `CLOUDFLARE_ACCOUNT_ID` để dùng wrangler, danh tính git `hano-c4l` / `hano.c4l@gmail.com` đặt theo repo, bản Node có `node:sqlite` (các test D1 dùng nó; máy hiện chạy Node 26).
- **Lệnh gán admin trên production** (người dùng đã có): `npx wrangler d1 execute DB --remote --command "UPDATE accounts SET role='admin' WHERE email='...'"`, preview thêm `--env preview`; đăng nhập lại sau khi gán.

## Công cụ kiểm thử (tất cả chạy ở local trừ khi ghi khác)
Cần `wrangler dev` chạy ở cổng 8787 và `.dev.vars` có `DISABLE_RATE_LIMIT=1` và `ENABLE_DEV_GRANT=1`. Các script tự từ chối host không phải localhost, trừ `smoke.mjs` còn chạy được trên preview.
| Lệnh | Kiểm gì |
|---|---|
| `npm run typecheck`, `npm test` | Kiểu và toàn bộ test đơn vị (khoảng 523 test; một số dùng SQLite thật qua `server/src/test-db.ts`, loại khỏi `tsc` vì cần kiểu Node) |
| `node tools/smoke.mjs [ws://localhost:8787]` | Luồng chính: đăng ký, tạo nhân vật, quái, EXP, chết, cổng bản đồ |
| `node tools/economy-smoke.mjs` | Admin: tra cứu, cộng/trừ tiền, idempotency, sổ cái khớp số dư |
| `node tools/chat-smoke.mjs` | Chat Thế giới/Bản đồ/Truyền âm/Hệ thống, giới hạn, socket chat bị thay thế |
| `node tools/idle-smoke.mjs` | Tạm dừng tick, giả lập Durable Object bị đuổi, dựng lại sim |
| `node tools/equipment-smoke.mjs` | Giới tính, mặc/tháo/nhẫn, lưu, sửa đồ và giá, món hỏng tự tháo lúc vào phòng, chết ở hang mất 5% độ bền |
| `node tools/skills-smoke.mjs` | Kỹ năng cơ bản trong welcome, thanh phím tắt (đặt/lưu/từ chối), học bí tịch (cấp, tiêu hao một lần, đã biết), dùng kỹ năng, hồi máu, buff ở rừng |
| `node tools/refine-smoke.mjs` | Mặc pháp bảo bản mệnh và phi hành, giết quái ở rừng: bản mệnh nhận EXP riêng bằng đúng số EXP của nhân vật, lưu lại, EXP nhân vật không đổi |
| `node tools/breakthrough-smoke.mjs` | Đột phá ở thành: chưa đủ điều kiện, tu vi tràn (bị dùng hết khi bắt đầu), thiếu đan/tiền, đi lại và rớt kết nối là thất bại, một lần đủ 62 giây (thành hoặc bại đều kiểm D1) |
| `node tools/paths-smoke.mjs` | Hướng tu: dưới Trúc Cơ bị từ chối, nhận vật phẩm một lần mỗi hướng, chọn chủ tu rồi phụ tu (thiếu Linh Thạch không đổi gì), trùng hướng bị từ chối, lưu và trả lại khi vào lại, đổi chủ tu, bỏ một hướng (xóa kỹ năng, dọn phím tắt, trả khóa vật phẩm), lên cấp hướng tu bằng Ngộ Đạo Đan |
| `node tools/breakthrough-forest-smoke.mjs` | Đột phá ở rừng: quái đánh là thất bại; một lần đủ 60 giây, kiểm bản làm việc của phòng khớp D1 sau khi rời |
| `node tools/path-quests-smoke.mjs` | Nhiệm vụ hướng tu và đột phá: nút nhận vật phẩm tạm bị server chặn với người thường, Đạo Sư riêng từng hướng, cần Trúc Cơ, nộp thiếu thì từ chối, nhận vật phẩm (đan: nộp thảo dược và đan; thuật: Yêu Đan; kiếm: đủ 30 lần giết), chọn hướng rồi bỏ hướng thì nhiệm vụ mở lại và nhận được lần hai, vật phẩm đã nhận bằng nút cũ chặn nhiệm vụ, nhiệm vụ đột phá một lần |
| `node tools/pvp-smoke.mjs` | PvP: công tắc PK, bảo hộ dưới Luyện Khí tầng 5 hai chiều, giết người trắng (+10 sát khí, +100 sát nhân, nạn nhân −50 sát khí và về thành), tự vệ (không cộng sát nhân), giết người cam (anh hùng +20), điểm trong D1, tên màu trong snapshot |
| `node tools/quests-smoke.mjs` | Nhiệm vụ: cả chuỗi tân thủ 6 bước với nhân vật mới (NPC xa thì từ chối, khóa, nhận, nói chuyện với thương nhân, đếm giết quái thật ở rừng và qua một lần đuổi phòng, nộp vật liệu, đạt tầng, trả hai lần không đổi gì, thưởng đúng một lần, sổ cái đủ 6 dòng) |
| `node tools/shop-smoke.mjs` | Thương nhân: xa thì từ chối, đi tới rồi mở cửa hàng và xem số còn lại, mua (thiếu tiền, giới hạn ngày, hết hàng, đồ khác giới tính, trang bị chọn hệ và họ vũ khí có độ bền đầy, bí tịch một quyển mỗi ngày, phù truyền tống), bán (đan đột phá không thu mua, bán một phần, bán quá số, bán nhiều món một lần tất cả hoặc không), phù truyền tống (không dùng ở thành, dùng ở rừng thì về thành, gán phím tắt), lưu qua kết nối lại |
| `node tools/inventory-smoke.mjs` | Túi đồ, hòm thư, hết hạn, sắp xếp, chia, đan trong rừng, đăng nhập hai nơi |
| `node tools/load.mjs ws://localhost:8787 50 30` | 50 client săn quái 30 giây, đo tick |
Các cổng chỉ có ở local (production/preview phải trả 404): `/api/dev/grant-exp`, `/api/dev/tick-stats`, `/api/dev/evict`, `/api/dev/loot`.

## Bẫy đã gặp
- **Cờ admin của socket game (2e-B PR2):** Worker đặt `x-char-admin` khi mở `/ws` (như `/ws/chat`) và phòng lưu vào `PlayerState.admin` ở lúc vào phòng; socket đang mở từ trước lần deploy đó không có cờ (coi như không phải admin), nên admin phải kết nối lại. Mọi chức năng chỉ cho admin phải kiểm cờ này ở server, ẩn nút ở client không đủ.
- **Gieo thêm nhiệm vụ:** thêm nhiệm vụ vào `SEED_QUESTS` thì lần đọc danh mục đầu tiên sau deploy tự thêm vào D1 (không cần migration), nhưng nhiệm vụ đã có không bị ghi đè (xem bẫy bên dưới về danh mục nhiệm vụ).
- **Danh mục nhiệm vụ trong D1 (2e-B):** gieo bằng `INSERT OR IGNORE`, nên sửa `DEFAULT_QUESTS` trong code sau khi đã deploy **không** đến được các dòng D1 có sẵn (preview, production): muốn đổi phải sửa D1 (cột `def` JSON, `enabled`). Mọi lần sửa tay D1 phải **tăng `config_versions` dòng `'quests'`** trong cùng lệnh, nếu không mỗi isolate đang chạy giữ bản cache cũ cho đến khi khởi động lại (cache chỉ nạp lại khi phiên bản đổi). Nạp danh mục hỏng thì isolate đang chạy phục vụ bản tốt cuối cùng, isolate mới không có nhiệm vụ nào (log `quest catalogue is invalid`).
- **`handoff` chạy từ `alarm()`:** sau đó attachment của socket là null; vòng lặp của `alarm()` phải bỏ qua socket đó (`continue`), nếu không nó lưu trạng thái cũ (đã đọc trước) đè lên vị trí mới và còn ghi lại attachment. Đã gặp ở niệm phù truyền tống; áp dụng cho mọi việc chuyển bản đồ khởi động từ alarm. `handoff` cũng không được chờ bên trong `bagTask` (nó đợi hàng đợi túi).
- **Bẫy khi làm việc ở máy Windows (session vừa rồi):** khởi động `wrangler dev` bằng `Start-Process cmd.exe /c "npx wrangler dev --port 8787 > log 2>&1"` (cửa sổ ẩn) và dọn tiến trình sau khi xong (`Get-Process workerd | Stop-Process`, cộng các `node.exe`/`cmd.exe` có `wrangler` trong dòng lệnh); chạy `wrangler dev` bằng `&` trong Git Bash làm treo lệnh, và nhiều bản chạy chồng nhau trên cổng 8787 làm mọi kết nối bị reset. Trong Git Bash, đường dẫn bắt đầu bằng `/api/...` truyền cho `curl -w` bị đổi thành đường dẫn Windows trong phần in ra (chỉ là hiển thị).
- Lỗi 7403 ("account is not valid") của wrangler khi migrate/deploy đôi khi thoáng qua: chạy lại một lần; luôn chạy migration và deploy thành hai lệnh riêng và kiểm kết quả migration trước.
- Trong khung trình duyệt của app, ảnh chụp màn hình đôi khi chậm một nhịp sau thao tác: chụp lại sau 1 giây hoặc đọc DOM bằng JavaScript để chắc chắn.
- Script Python ghi file qua heredoc trong Git Bash đôi khi hỏng khi nội dung có dấu nháy lẫn lộn: ghi script bằng công cụ Write rồi chạy `python script.py`.
- `changes()` hay "đổi 0 dòng" **không** làm batch D1 rollback; mọi điều kiện phải là câu lệnh gây lỗi (UNIQUE/CHECK/NOT NULL, ví dụ bảng `inv_guard`), xem mục túi đồ.
- Khi thêm cột mà truy vấn nhân vật nào cũng chọn (như `bag_tabs`, `constitution`), migration phải chạy trước khi deploy worker, nếu không không ai vào được phòng nào.

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

## Ghi chú kỹ thuật khác
- Bản đồ vẽ bằng RenderTexture: chỉ mới thử với Canvas, chưa thử WebGL trên thiết bị thật (đặc biệt điện thoại). Có `?renderer=canvas` làm đường lùi.
- Hình ảnh vật cản và nhân vật còn là placeholder (xem mục 6 trong `docs/TECHNICAL.md`).
- Tài khoản thử `smoke-*` và `cpu-*@example.test` còn trong D1 preview; production có 2 tài khoản thử do người dùng tự tạo (thông tin đăng nhập do người dùng giữ, không ghi trong repo).
