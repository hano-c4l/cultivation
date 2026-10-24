# Giai đoạn 3: Hệ thống Admin — kế hoạch chi tiết

Trạng thái: **ĐÃ CHỐT KẾ HOẠCH (2026-10-24); 3a (Nền) đã làm trên nhánh `features_admin-base` (xem "Đã làm ở 3a" bên dưới), các hạng mục khác chưa làm.** Đây là giai đoạn làm lại toàn bộ phần admin: mọi màn hình admin nằm dưới `xxx/admin/yyy`, có kiểm quyền, và quản lý được nội dung game bằng giao diện thay vì sửa code. "Kinh tế và xã hội" (giao dịch, chợ, đấu giá, tông môn, nghề phụ) lùi thành **giai đoạn 4**, "Hoàn thiện và vận hành" thành **giai đoạn 5** (xem `docs/PLAN.md` mục 10). Trạng thái làm đến đâu: `docs/STATUS.md`.

## Nguyên tắc thiết kế (áp dụng cho cả giai đoạn và mọi việc về sau)
**Luôn nghĩ và thiết kế theo hướng mở rộng và tùy chỉnh được bằng chức năng Admin**, để về sau thêm hay đổi nội dung không phải sửa code. Số liệu, danh mục (vật phẩm, kỹ năng, cảnh giới, quái, bản đồ, NPC, nhiệm vụ...) là dữ liệu trong D1, code chỉ chứa công thức và cơ chế. Khi làm một tính năng mới ở giai đoạn nào cũng vậy: đưa số và danh mục vào D1 ngay từ đầu, kèm cách nạp lại (`config_versions`, `loadLiveConfig`). Nguyên tắc này cũng ghi ở `CLAUDE.md`.

## Quyết định đã chốt (2026-10-24)
1. **Phạm vi cơ chế mới:** làm màn hình cho phần **đã có cơ chế trong game**; cơ chế mới mở rộng dần khi tới hạng mục tương ứng. Chưa làm ngay: luyện đan theo công thức, kỹ năng vòng tròn/định hướng/tự bám mục tiêu, điều kiện dùng kỹ năng (ví dụ chỉ khi dưới 25% máu), nhiều loại boss xoay vòng trong một bản đồ, tỉ lệ rơi đồ theo hệ, số vệ binh theo từng cổng.
2. **Đan Sư** là NPC luyện đan **mới** (loại `alchemist`), không phải NPC hướng tu: đan dược chuyển từ Thương nhân sang Đan Sư. Lúc đầu Đan Sư chỉ bán đan có giá (dùng lại luật hàng của thương nhân); đan đặc biệt cần nguyên liệu để chế tạo là công thức mở rộng sau.
3. **Tiên Ngọc:** làm lịch sử trước. Mọi biến động Tiên Ngọc (mua đồ, admin chỉnh tay, sau này là nạp) đều phải ghi lịch sử. Đơn nạp làm ở giai đoạn 4 và cổng thanh toán ở giai đoạn 5; hiện **chưa có bảng đơn nạp**.
4. **Tràn EXP:** thanh tu vi 100% khi đầy, thêm tối đa 100% tràn, tức 200%. Con số này (trần tràn) phải chỉnh được ở màn Cảnh giới.
5. **Xóa hai cách tùy điều kiện:** nếu có nhân vật đang sở hữu (hoặc đang dùng) thì **xóa mềm**: vẫn dùng được nhưng không phát sinh mới (không rơi, không bán ở đâu khác) và **tự gỡ khỏi mọi chỗ liên quan** (hàng của thương nhân, bảng rơi của quái/boss, phần thưởng...); nếu không ai sở hữu thì **xóa cứng** để không để lại dữ liệu rác. "Sở hữu" gồm cả đồ trong túi, đồ đang mặc, đồ trong hòm thư, kỹ năng đã học, nhiệm vụ đang làm, cảnh giới của nhân vật.
6. **Sửa nhân vật:** bấm Sửa thì nếu nhân vật đang online hiện hộp xác nhận "nhân vật đang online, có kick ra không"; Hủy thì chỉ xem, không sửa được; OK thì kick ra. Dù online hay offline, bấm Sửa đều đặt **trạng thái đang xem xét** cho nhân vật; ai đăng nhập vào lúc đó bị chặn với thông báo kiểu "Nhân vật đang được xem xét, vui lòng thử lại sau 30 phút". Lưu xong trả trạng thái về bình thường. **Bổ sung (đã đồng ý):** trạng thái tự hết hạn sau 30 phút và có nút "Hủy sửa", để admin bỏ dở thì người chơi không bị khóa mãi.
7. **Ban tài khoản:** có thời hạn hoặc vĩnh viễn, nhập lý do; người bị ban khi đăng nhập thấy thời hạn và lý do. Ban xóa phiên và kick socket đang mở.
8. **Reset mật khẩu:** admin đặt mật khẩu tạm, hiển thị một lần. Gửi email để sau (cần dịch vụ gửi mail, xem `docs/PLAN.md` mục 11).
9. **Giao diện admin:** một ứng dụng admin riêng **trong cùng repo và cùng Worker** (một đầu vào Vite riêng, tách khỏi client game). Không tách Worker hay repo riêng: admin dùng chung D1, `shared/`, cookie phiên (cùng origin) và `config_versions`; tách ra phải khai báo lại binding, xử lý cookie và CORS khác origin và deploy hai nơi. Muốn thêm một lớp bảo vệ thì có thể bật Cloudflare Access trước `/admin*` sau này (tùy chọn).
10. **Thứ tự:** như mục "Hạng mục" bên dưới.
11. **Làm Nền (3a) trước hết**; mọi màn khác dựa vào nó.
12. **Tài liệu:** kế hoạch này ở file này; `PLAN.md` đánh số lại giai đoạn.

## Hiện trạng (đã kiểm ngày 2026-10-24)
- `accounts` **chưa có** cột ban, và **chưa có** đường admin đặt lại mật khẩu. `characters` chưa có trạng thái "đang xem xét".
- **Chưa có** bảng đơn nạp. `currency_ledger` (append-only) ghi mọi biến động tiền, gồm Tiên Ngọc; cần kiểm mọi đường dùng Tiên Ngọc (ví dụ mua Hộ Cấp Phù) đã ghi sổ cái đủ chưa.
- Thư (`mail_claim`) hiện **chỉ nhận vật phẩm**, chưa nhận tiền.
- `/admin.html` và `/admin-constitutions.html` là **file tĩnh công khai** (ai cũng tải được trang; chỉ API mới kiểm quyền). `wrangler.jsonc` có `not_found_handling: "single-page-application"` và `run_worker_first` chỉ gồm `/api/*`, `/ws`, `/ws/chat`, nên `/admin/xyz` hiện chỉ trả trang game, không qua Worker. Chưa khai báo binding `ASSETS`.
- Các API admin hiện có (`server/src/admin.ts`, kiểm `session.role === "admin"`): tra cứu, nhân vật, cộng/trừ tiền, thêm tab túi, tổng cung, cài đặt game, danh mục thể chất.
- **Đã là dữ liệu D1 (màn hình có thể làm ngay trên dữ liệu có sẵn):** thể chất (`constitutions*`), nhiệm vụ (`quests`), thương nhân (`shop_merchants`, `shop_stock`), vị trí và tên NPC (`npc_spots`), bảng master trang bị (`equipment_master`, `equipment_sets`), bảng Thợ Rèn (`enhance_levels`), số cân bằng (`game_tuning`, mỗi nhóm một dòng JSON), `game_settings`, bộ đếm boss (`boss_kills`).
- **Còn nằm trong code (phải chuyển sang D1 trước khi có màn hình thêm/sửa):**
  - cảnh giới `REALMS` và công thức tiềm năng `deriveStats`;
  - danh mục vật phẩm (`items.ts`; trang bị sinh theo công thức từ id, id lưu vĩnh viễn nên **không đổi dạng**);
  - mẫu kỹ năng và danh sách kỹ năng pháp bảo;
  - danh sách loài quái, tên, hệ và mô tả (số liệu từng loài đã ở `game_tuning.monsters`);
  - bố cục bản đồ, cổng, bãi quái (`CLUSTERS`, `FOREST_GLADES`...), vệ binh, chỗ đứng boss dự phòng (`BOSS_SPOTS`);
  - hệ biến dị (`game_settings`), bảng cấp hướng tu, danh sách loại NPC.

## Phân loại hạng mục
- **A**: màn hình trên dữ liệu đã có trong D1.
- **B**: chuyển nội dung từ code sang D1 (migration, sửa lõi game, máy khách nhận dữ liệu động).
- **C**: cơ chế game mới.

## Hạng mục (thứ tự làm)
Mỗi hạng mục là một nhánh `features_admin-xxx` theo quy trình trong `CLAUDE.md`, kèm test đơn vị và smoke script. Các mục A độc lập (3b-3e) xếp ngay sau Nền để có giá trị sớm; phần còn lại theo thứ tự phụ thuộc.

| | Hạng mục | Loại | Phụ thuộc |
|---|---|---|---|
| 3a | Nền: `/admin/*`, đăng nhập, menu, nhật ký thay đổi, khung list/detail | mới | — |
| 3b | Lịch sử Tiên Ngọc | A (chỉ đọc) | 3a |
| 3c | Chỉ số khác (sát khí, sát nhân, anh hùng, phí truyền tống, vùng nhìn...) | A | 3a |
| 3d | Gửi quà (thư có tiền, vật phẩm, tiêu đề, mô tả) | A + mới | 3a |
| 3e | Quản lý nhiệm vụ | A | 3a |
| 3f | Cảnh giới và chỉ số tiềm năng | B | 3a |
| 3g | Vật phẩm | B | 3f |
| 3h | Kỹ năng | B (+C dần) | 3g |
| 3i | Thiên phú (linh căn, thể chất, hệ biến dị) | A + B | 3f, 3h |
| 3j | Quái và BOSS | B (+C dần) | 3g, 3h |
| 3k | NPC (nhiệm vụ, thương nhân, Đan Sư, thợ rèn, hướng tu, vệ binh) | B (+C) | 3e, 3g, 3h |
| 3l | Bản đồ | B (+C dần) | 3j, 3k |
| 3m | Tài khoản và nhân vật | A + mới | 3g, 3h |

### 3a. Nền
- **Đường dẫn:** thêm `/admin` và `/admin/*` vào `run_worker_first` ở **cả** khối chính và `env.preview` (môi trường không kế thừa cấu hình), thêm binding `ASSETS` để Worker trả file admin sau khi kiểm quyền. Kiểm cú pháp cấu hình với tài liệu Cloudflare trước khi làm.
- **Quyền:** mọi truy cập `/admin/*` (trừ `/admin/login`) phải có phiên đăng nhập và `role = admin`; chưa đăng nhập hoặc không phải admin thì chuyển tới `/admin/login`; đăng nhập xong vào `/admin` (= `/admin/index`), màn chính có menu liên kết tới từng màn. Mọi API `/api/admin/*` kiểm quyền ở server (ẩn nút không đủ).
- **Đăng nhập:** dùng lại `/api/login` (băm mật khẩu vẫn trong `PasswordHasher`); trang login kiểm vai trò.
- **Ứng dụng admin:** đầu vào Vite riêng, một trang đơn có định tuyến (để liên kết sâu hoạt động), menu, khung **list** (tìm kiếm, sắp xếp, phân trang) và **detail** dùng chung.
- **Mẫu bộ soạn thảo (như 2i):** lưu có phiên bản (hai admin không đè nhau), kiểm hợp lệ có lý do, tăng `config_versions`, nạp lại qua `loadLiveConfig`; không có "lưu một phần" cho danh mục lớn.
- **Nhật ký thay đổi (audit log):** bảng mới ghi ai sửa gì, khi nào, giá trị trước và sau; tạo ngay từ đầu để mọi màn sau dùng.
- **Gỡ trang cũ:** `/admin.html` và `/admin-constitutions.html` chuyển hướng sang đường mới (chức năng của chúng chuyển vào các màn tương ứng ở 3c, 3m, 3i).
- **Kiểm thử:** truy cập không phiên và phiên thường bị chuyển hướng hoặc từ chối; admin vào được; smoke script mới.

#### Đã làm ở 3a (2026-10-24)
- **Đường dẫn và quyền:** `wrangler.jsonc` (cả khối chính và `env.preview`) thêm binding `ASSETS` và `run_worker_first` có `/admin`, `/admin/*`, `/admin.html`, `/admin-constitutions.html`. `server/src/admin-page-rules.ts` (thuần, có test) quyết định: admin vào được mọi địa chỉ dưới `/admin` trừ `/admin/login` (admin vào trang login thì về `/admin`); người chưa đăng nhập hoặc người chơi thường được trang login và bị chuyển (302) về `/admin/login` ở mọi địa chỉ khác; hai trang cũ chuyển (302) về `/admin`. `server/src/admin-pages.ts` áp luật rồi trả vỏ ứng dụng (lấy từ `ASSETS`, `Cache-Control: no-store`, `X-Frame-Options: DENY`); chỉ nhận GET/HEAD (POST là 405). `/admin` và `/admin/index` là cùng một trang chính. Các trang `/admin/*` khác chưa làm hiện "chưa làm (hạng mục 3x)".
- **API:** `GET /api/admin/me` (200 admin, 401 chưa đăng nhập, 403 người chơi), `GET /api/admin/audit` (q, sort, dir, page, size; tối đa 100 dòng), `GET /api/admin/audit-entry?id=`. Mọi API admin kiểm quyền ở server (`requireAdminSession`).
- **Ứng dụng admin:** `client/admin/` (đầu vào Vite thứ hai, TypeScript thuần, không thêm thư viện): `index.html` (vỏ), `src/main.ts` (định tuyến theo đường dẫn, bố cục menu trái, đăng xuất), `src/pages.ts` (login, trang chính, nhật ký), `src/menu.ts` (13 mục + nhật ký; mục chưa làm xám đi kèm hạng mục), `src/kit.ts` (khung dùng chung: `listView` có tìm kiếm, sắp xếp, phân trang; `detailShell`; `api`, `h`). Đăng nhập dùng lại `/api/login` rồi kiểm `/api/admin/me`; tài khoản người chơi bị đăng xuất lại ngay và báo "không có quyền Admin". Chuỗi tiếng Việt viết thẳng trong ứng dụng admin (ngoại lệ chấp nhận được như các trang admin cũ). Hiển thị tốt ở điện thoại (menu thu gọn).
- **Nhật ký thay đổi:** migration `0035_admin_audit.sql` (bảng `admin_audit`, chỉ thêm dòng), `server/src/admin-audit.ts` (`recordAudit` không bao giờ ném lỗi, giá trị quá lớn bị thay bằng dấu hiệu cắt; `listAudit`; `getAuditEntry`). Các hành động admin hiện có đã ghi nhật ký: cộng/trừ tiền, thêm tab túi, đổi cài đặt game, lưu danh mục thể chất. Màn `/admin/audit` (list, tìm theo admin, hành động, đối tượng, tóm tắt) và `/admin/audit/<id>` (chi tiết trước/sau) là hai màn đầu tiên dùng khung chung. **Mọi màn sau phải ghi nhật ký qua `recordAudit`.**
- **Đã xóa** `client/public/admin.html` và `client/public/admin-constitutions.html`. **Hệ quả:** tạm thời **chưa có giao diện** cho các việc trước đây làm ở hai trang đó (tra cứu nhân vật, cộng/trừ tiền, thêm tab túi, xem tổng cung, đổi `game_settings`, sửa thể chất); các API `/api/admin/*` tương ứng còn nguyên. Các việc đó quay lại ở 3m (tài khoản, nhân vật), 3d (quà), 3c (cài đặt game), 3b (tổng cung, lịch sử), 3i (thể chất). Trong lúc chờ, muốn chỉnh gấp thì gọi API trực tiếp hoặc sửa D1.
- **Kiểm thử:** `server/src/admin-pages.test.ts` (luật quyền), `server/src/admin-audit.test.ts` (SQLite thật), `node tools/admin-pages-smoke.mjs` (chỉ local; ẩn danh, người chơi, admin, trang cũ, nhật ký). Đã thử trên localhost bằng trình duyệt trong app: đăng nhập, trang chính, danh sách và chi tiết nhật ký.
- **Chưa làm / chú ý:** quên mật khẩu và đặt mật khẩu tạm (3m); chưa thử tay trên preview và production (cần admin thật đăng nhập; trợ lý không đăng nhập ở đó); Cloudflare Access tùy chọn, chưa bật.

### 3b. Lịch sử Tiên Ngọc
Màn xem toàn bộ biến động Tiên Ngọc (đọc `currency_ledger`): lọc theo nhân vật, lý do (mua đồ, admin chỉnh tay, nạp sau này), khoảng thời gian; thống kê theo người; tổng cung. Việc kèm theo: rà mọi đường dùng Tiên Ngọc, bảo đảm đều ghi sổ cái với lý do rõ ràng; admin chỉnh tay Tiên Ngọc cũng phải ghi vào lịch sử. Bảng đơn nạp làm ở giai đoạn 4 (cùng kinh tế), cổng thanh toán ở giai đoạn 5.

### 3c. Chỉ số khác
Các nhóm `game_tuning` lẻ chưa thuộc màn nào: sát khí (điểm cộng khi giết, điểm trừ khi chết, mốc tăng sát thương), sát nhân (màu theo mốc, điểm cộng/trừ, xác suất rơi đồ, độ bền hao), anh hùng, phí Truyền Tống Trận theo khoảng cách (`waygate`), vùng nhìn (`aoi`), cùng `game_settings` (giá mở tab túi, tỉ lệ biến dị...). Dựng màn dạng cây có nhãn tiếng Việt (`TUNING_LABELS_VI`), có nút về mặc định. Lưu ý: đổi một số làm có hiệu lực ngay cho mọi người; quái và boss mới sinh mới dùng số mới.

### 3d. Gửi quà
Thay vì sửa trực tiếp nhân vật, admin gửi tiền (Linh Thạch, Cống Hiến, Tiên Ngọc) và vật phẩm vào **hòm thư** của nhân vật, có tiêu đề và mô tả; tìm tài khoản/nhân vật như màn tài khoản. Cần làm thêm: **thư nhận được tiền** (hiện `mail_claim` chỉ nhận vật phẩm), ghi sổ cái khi nhận, hiển thị tiêu đề và mô tả ở hòm thư của game, và ghi audit log.

### 3e. Quản lý nhiệm vụ
Danh sách và chi tiết trên bảng `quests` (đã là dữ liệu): tên, mô tả, yêu cầu (nộp vật phẩm, hạ quái và số lượng, đạt cảnh giới, nói chuyện), điều kiện được nhận (nhiệm vụ phải xong trước, cấp độ, chỉ số), phần thưởng (Linh Thạch, vật phẩm, EXP, Cống Hiến), người giao (chọn từ NPC), bật/tắt, thêm mới. Danh mục gieo bằng `INSERT OR IGNORE` nên màn này ghi thẳng D1 và tăng `config_versions.quests`. Chọn vật phẩm/quái bằng ô tìm kiếm từ danh mục hiện có (tự cập nhật khi 3g, 3j chuyển danh mục sang D1).

### 3f. Cảnh giới và chỉ số tiềm năng
- **Cảnh giới (B):** chuyển `REALMS` sang D1. Màn list/detail: tên, ký hiệu (LK, TC...), màu, phẩm cấp, EXP cần để lên tầng, tỉ lệ đột phá cơ bản, mức tăng tối đa khi dùng đan đột phá và số đan tối đa tương ứng, mức tăng tối đa khi tràn EXP, **trần tràn EXP (hiện 100%, tức thanh tối đa 200%; chỉnh được)**. Thêm cảnh giới mới (Hóa Thần, Luyện Hư...) không cần sửa code.
- **Chỉ số tiềm năng (B):** đưa hệ số của `deriveStats` vào `game_tuning`: mỗi loại tiềm năng (Căn cốt, Thân pháp, Ngộ tính, Linh lực, Thần thức, Phúc duyên) nhân với hệ số để ra chỉ số thực (ví dụ 1 điểm Phúc duyên = 50 sinh lực), chỉnh được từng hệ số. Công thức giữ ở code; chỉ các hệ số là dữ liệu.
- Máy khách phải nhận cảnh giới qua `welcome` (hiện import từ `shared/`).

### 3g. Vật phẩm
- Chuyển danh mục vật phẩm sang D1. Màn list: thêm, xem chi tiết, xóa (theo quy tắc xóa ở trên), tìm theo loại, tên, hệ; sắp xếp; phân trang.
- Chi tiết theo loại: tên, mô tả, loại, hệ, cảnh giới, phẩm cấp; đan dược (hồi máu, thời gian tác dụng); đan đột phá (tỉ lệ thành công); trang bị (chỉ số cộng thêm, khoảng min-max qua bảng master); bí tịch (kỹ năng dạy); nguyên liệu; giá trị.
- **Trang bị vẫn theo mẫu và bảng master**, không tạo từng id (id `eq.*` lưu vĩnh viễn trong `item_instances.item_type`, không đổi dạng). Màn này gồm cả bảng master trang bị và tên bộ (đã là D1) và bảng Thợ Rèn.
- Xóa vật phẩm: có người sở hữu thì xóa mềm và tự gỡ khỏi hàng của thương nhân, bảng rơi, phần thưởng nhiệm vụ; không ai sở hữu thì xóa cứng.

### 3h. Kỹ năng
Chuyển mẫu kỹ năng sang D1 (hiện sinh từ mẫu theo hệ và cảnh giới; `skillOverrides` đã cho ghi đè số theo mã). Màn list/detail: loại hình sát thương (đánh đơn, nón, vòng tròn...), khoảng cách (gần/xa), sát thương, hệ, hồi chiêu, MP, **hiệu ứng giao diện** (loại hiệu ứng ở `client/src/fx-kinds.ts`). Mở rộng dần: kỹ năng vòng tròn, định hướng/tự bám mục tiêu, điều kiện dùng (cơ chế mới, chỉ khi tới bước này).

### 3i. Thiên phú
Quản lý linh căn (phẩm cấp, số hệ, hệ biến dị Lôi/Băng/Phong) và thể chất (đã có màn riêng ở 2i, nay đưa vào khung chung). Chi tiết: tên hệ/thiên phú, tỉ lệ xuất hiện, **điều kiện xuất hiện** (ví dụ hệ biến dị cần đơn linh căn, Thủy Linh Thể cần linh căn Thủy), chỉ số cộng thêm, % buff, thêm hệ biến dị và thể chất mới. Tỉ lệ rơi đồ theo hệ là cơ chế mới, làm khi tới đây.

### 3j. Quái và BOSS
Chuyển danh sách loài (tên, hệ, mô tả) sang D1 (số liệu đã ở `game_tuning.monsters`). Màn list/detail: tên, loại (thường, boss), chỉ số, kỹ năng (chọn từ danh mục kỹ năng), ràng buộc dùng kỹ năng (ví dụ chỉ khi dưới 25% máu, thay cho kỹ năng nón boss đang viết cứng), EXP, tiền, bảng rơi (vật phẩm từ danh mục, xác suất). Boss mỗi bản đồ lúc này vẫn một loài (khai ở `game_tuning.boss`); nhiều loài xoay vòng là cơ chế mới ở 3l.

### 3k. NPC
Màn list/detail trên `npc_spots` (đã là D1), thêm các loại NPC:
- **Trưởng Lão** (nhiệm vụ): chọn nhiệm vụ nó giao (từ 3e).
- **Thương nhân:** luật hàng (`shop_stock`), thu mua (`shop_merchants`).
- **Đan Sư (loại mới `alchemist`):** tiếp quản đan dược từ Thương nhân; ban đầu bán đan có giá bằng luật hàng của thương nhân; đan đặc biệt cần nguyên liệu là công thức luyện, mở rộng sau. Việc chuyển hàng đan khỏi thương nhân và chỗ đứng của Đan Sư ở từng thành quyết định khi làm.
- **Thợ Rèn:** tỉ lệ, nguyên liệu, chi phí (bảng `enhance_levels`, luật Tinh luyện, giá Hộ Cấp Phù).
- **Hướng tu (Đạo Sư):** nhiệm vụ hướng tu, chi phí đổi/bỏ, kỹ năng các cấp.
- **Vệ binh:** chỉ số, kỹ năng, cảnh giới (nhóm `guard`, `guardSkills`).
- Kiểm chỗ đứng có đi được khi đặt NPC (chưa làm ở 2m), xem trước bản đồ; loại NPC mới ngoài `merchant`, `quest`, `smith`, `waygate` cần thêm code xử lý.

### 3l. Bản đồ
- **Hiện trạng:** bản đồ không có ảnh. Mỗi bản đồ là một hàm trong `shared/src/map.ts` sinh lưới va chạm (mỗi ô chia 4×4 ô mịn, rừng khoảng 360 nghìn ô mịn) bằng hình tròn rải theo hạt giống cố định (cây), hình chữ nhật khoét (đường, khoảng trống trước cổng và bãi quái) và tường viền. Máy khách vẽ nền hai màu ô cờ và vật cản bằng một màu theo đúng lưới. Server và máy khách chạy **cùng hàm** nên ra cùng lưới.
- **Cách làm "thêm bản đồ mới":** lưu bản đồ dưới dạng **công thức khai báo** trong D1 (không lưu ảnh hay từng ô): kích thước và hình chữ nhật chơi, màu nền và màu vật cản, hạt giống kèm số cây và khoảng bán kính, danh sách hình chữ nhật khoét và hình chữ nhật chặn, cổng (vị trí, bản đồ đến, tọa độ đến), điểm sinh, bãi quái (vị trí, loài, bậc), cảnh giới, thành an toàn hay không. Một hàm trong `shared/` dựng lưới từ công thức; server gửi công thức (vài KB) qua `welcome` như đã làm với NPC và `tuning`. Màn admin có **xem trước** bản đồ bằng chính code của game.
- **Việc kèm theo (lõi game):** chuyển sáu bản đồ hiện có thành công thức và phải ra **đúng lưới như cũ** (test so khớp từng ô); thay `MAP_IDS` cố định bằng danh sách động và sửa các chỗ dùng `getMap`, `MAP_SIZE`, `MAP_REALM`; sửa `tools/world.mjs` và các smoke script đang đọc `map.ts` tĩnh.
- **Giới hạn:** không vẽ tay từng ô (chỉ ghép hình khoét và rải cây); vẽ tay hoặc nhập từ Tiled là việc riêng nếu sau này cần.
- **Màn detail:** thêm/xóa NPC (tìm trong danh sách NPC có sẵn), vị trí NPC, vệ binh, thêm/xóa cổng và bản đồ cổng nối tới, cấp (cảnh giới) bản đồ, boss sẽ xuất hiện, bảng rơi theo quái của bản đồ, tỉ lệ xuất hiện boss, số quái cần giết để boss xuất hiện (nhóm `bossSpawn` đã có số). Cơ chế mới (làm khi tới đây): nhiều loại boss xoay vòng mỗi lần một loại, số vệ binh theo từng cổng.

### 3m. Tài khoản và nhân vật
- **List tài khoản:** liệt kê toàn bộ (có thể tìm theo tên tài khoản hoặc nhân vật), sắp xếp, phân trang; ban/bỏ ban, đặt mật khẩu tạm, xem chi tiết.
- **Detail:** ô chọn nhân vật (mặc định nhân vật đầu tiên; thiết kế sẵn cho một tài khoản nhiều nhân vật), hiển thị đủ thông tin nhân vật: chỉ số, trang bị, túi đồ, kỹ năng, tiền, lần đăng nhập cuối...; chức năng xóa nhân vật, thêm/xóa vật phẩm và kỹ năng, sửa chỉ số và tiền.
- **Ban:** cột mới (thời hạn hoặc vĩnh viễn, lý do); đăng nhập báo thời hạn và lý do; xóa phiên và kick socket đang mở.
- **Sửa nhân vật:** theo quyết định 6 (cột trạng thái đang xem xét, chặn đăng nhập kèm thông báo, kick qua `CharacterLock`, tự hết hạn sau 30 phút). **Lý do:** `MapRoom` là người ghi duy nhất của nhân vật đang online; sửa D1 trực tiếp sẽ bị phòng ghi đè.
- Đặt mật khẩu tạm: băm trong `PasswordHasher`, hiển thị một lần, ghi audit log.
- Thêm/sửa tiền phải qua sổ cái (`applyCurrencyDelta`), không sửa số dư trực tiếp.

## Ràng buộc chung
- **Người ghi duy nhất:** sửa dữ liệu nhân vật phải qua cơ chế khóa/kick ở 3m; quà tặng (3d) đi qua hòm thư nên an toàn.
- **Xóa:** theo quyết định 5; mọi lần xóa/tắt phải kiểm "đang được dùng" trong mọi bảng liên quan và ghi audit log.
- **Giới hạn D1:** một batch tối đa 50 truy vấn, một câu lệnh 100 tham số (gói Free); lưu danh mục lớn phải chia nhỏ.
- **Nạp cấu hình:** mọi danh mục mới nạp qua `loadLiveConfig` (xem `docs/TECHNICAL.md` mục "Bẫy đã gặp", các bẫy 2m); mọi lần lưu tăng `config_versions` tương ứng; cache theo phiên bản.
- **Máy khách:** vật phẩm, kỹ năng, cảnh giới, bản đồ hiện import từ `shared/`; khi chuyển sang D1, server gửi qua `welcome` (như `npcs`, `tuning`) và máy khách dùng bản đăng ký (`setX`) như NPC.
- **Smoke script và `tools/world.mjs`** đọc `shared/src/map.ts` tĩnh: sẽ phải sửa khi bản đồ thành dữ liệu.
- **Gói Cloudflare:** admin ít tải, nhưng nạp nhiều danh mục từ D1 ở mỗi isolate làm tăng dòng đọc; giữ cache 30 giây như hiện nay.

## Câu hỏi còn mở (quyết định khi tới hạng mục tương ứng)
- 3k: chỗ đứng của Đan Sư ở từng thành, và cách chuyển hàng đan khỏi Thương nhân (thương nhân hiện bán đan hồi máu và Ngộ Đạo Đan).
- 3b: có cần xuất báo cáo (CSV) không.
- 3l: có cần vẽ tay hay nhập bản đồ từ Tiled không (hiện chỉ làm công thức).
