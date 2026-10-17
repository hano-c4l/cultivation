# Giai đoạn 1: MVP chơi được — chia nhánh

Mỗi mục là một nhánh `features_*` từ `preview` → PR vào `preview` → deploy preview kiểm tra → cuối giai đoạn (hoặc khi một mục tự đứng được) PR `preview` → `main`.

Thứ tự phụ thuộc: 1a → 1b → 1c → 1d → 1e → 1f.

## 1a. Tài khoản và nhân vật (`features_accounts`)
- Migration D1 0002: `accounts` (email unique không phân biệt hoa thường, hash, salt, iterations, role `player|admin`), `sessions` (token lưu dạng hash, hết hạn), `characters` (account_id, tên unique, linh căn, map, ô, EXP, cảnh giới/tầng, điểm tiềm năng, chỉ số gốc, `updated_at`). Bảng `characters` placeholder của GĐ0 đang trống nên được tạo lại.
- API (`/api/*`): `register`, `login`, `logout`, `me`, `character` (tạo nhân vật). Giới hạn tần suất đăng nhập/đăng ký theo IP + email.
- Băm mật khẩu PBKDF2-SHA256 100.000 vòng (WebCrypto) **bên trong Durable Object `PasswordHasher`** (không băm trong Worker, vì Worker Free chỉ có 10 ms CPU). Đã chọn phương án này; nếu preview vẫn lỗi 1102 thì nâng Workers Paid. Cookie phiên `HttpOnly; Secure; SameSite=Lax`.
- WebSocket: Worker xác thực cookie lúc upgrade rồi chuyển danh tính cho DO bằng header nội bộ (header từ client bị xóa). **Khóa phiên theo nhân vật xuyên kênh:** một Durable Object `CharacterLock` (khóa theo id nhân vật), người vào sau thắng. Thứ tự bắt buộc: phòng mới xin khóa → `CharacterLock` bảo phòng cũ đá socket và **lưu xong** → chỉ khi đó cấp khóa → phòng mới mới đọc dòng nhân vật từ D1. Nếu không, phòng mới đọc trạng thái cũ và có hai writer (hiện đã có 8 kênh = 8 DO khác nhau).
- **Lưu tối thiểu ngay ở 1a:** lưu khi ngắt kết nối và debounce sau khi di chuyển (vị trí suy ra từ path + startedAt). Không dùng alarm định kỳ để DO vẫn ngủ được; debounce cũng giữ lượng ghi D1 dưới giới hạn Free (100.000 dòng/ngày).
- Client: màn hình đăng ký/đăng nhập/tạo nhân vật (HTML/CSS, tiếng Việt); bỏ guest ẩn danh.
- Kiểm thử: smoke đầy đủ (đăng ký/đăng nhập/di chuyển) **chỉ chạy trên preview và local**, vì sẽ tạo tài khoản thật. Trên production chỉ kiểm tra health và một thao tác chỉ-đọc (hoặc một tài khoản test cố định).
- Nghiệm thu: đăng ký → tạo nhân vật → vào game → thoát/vào lại giữ đúng tên và vị trí; sai mật khẩu bị từ chối; vượt giới hạn tần suất bị chặn; đăng nhập 2 nơi, **kể cả hai kênh khác nhau**, không nhân đôi và không đọc trạng thái cũ.

## 1b. Thế giới và trò chuyện (`features_world-chat`)
- Nhiều bản đồ (thành thị an toàn + 2 bản đồ luyện cấp), portal, chuyển bản đồ theo thứ tự *lưu → giải phóng → vào*.
- Lưu nhân vật theo chu kỳ và khi ngắt kết nối; tải lại đúng trạng thái.
- Chat theo bản đồ (giới hạn tần suất, lọc từ cơ bản, giới hạn độ dài).
- Nghiệm thu: đi qua portal, vị trí và bản đồ lưu đúng; chat hai người thấy nhau; spam chat bị chặn.

## 1c. Chỉ số, cảnh giới, tiềm năng (`features_progression`)
- `shared/`: bảng cảnh giới Luyện Khí → Trúc Cơ → Kim Đan → Nguyên Anh (9 tầng mỗi cảnh giới), bảng EXP, điểm tiềm năng mỗi tầng, công thức chỉ số dẫn xuất, bảng ngũ hành. Dữ liệu tách file cấu hình.
- UI: bảng nhân vật, cộng điểm tiềm năng.
- Nghiệm thu: test tự động cho công thức và bảng EXP; cộng điểm lưu và tải lại đúng.

## 1d. Quái và chiến đấu realtime (`features_combat`)
- Vòng lặp tick chỉ chạy khi có người chơi (dừng khi phòng trống, alarm cho hồi sinh).
- Quái spawn theo bản đồ, click chọn mục tiêu, auto-attack có cooldown, sát thương theo chỉ số và ngũ hành, chết/hồi sinh ở thành, nhận EXP.
- Nghiệm thu: đánh quái → lên tầng; 50 client giả lập trên một bản đồ giữ tick ổn định.

## 1e. Kinh tế khung xương (`features_economy-core`)
- Migration D1: `item_instances` (ID duy nhất), `currency_ledger` append-only (idempotency key, actor), `mailbox`; số dư là bản tổng hợp cập nhật bằng batch atomic có điều kiện.
- Trang admin cộng tiền thủ công (kiểm tra `role = admin`), rơi Linh Thạch từ quái.
- Nghiệm thu: test idempotency và không âm tiền; admin cộng tiền ghi đúng sổ cái; người không phải admin bị từ chối.

## 1f. Kiểm thử tải và hoàn thiện (`features_phase1-hardening`)
- Smoke/E2E cho toàn luồng, giả lập 50 client, kiểm tra tick, rà soát giới hạn Free, cập nhật tài liệu.

## Quyết định đã chốt
0. **Gói Cloudflare:** kế hoạch là Workers Paid, nhưng khi develop dùng Free; gặp việc cần Paid (ví dụ kiểm thử tải 1f, tick loop 1d) thì báo người dùng để nâng cấp (xem `docs/PLAN.md` mục 2a).
1. **PBKDF2 trên gói Free:** 100.000 vòng đo được ~24 ms (Node), vượt 10 ms CPU của Worker Free. Chọn băm trong Durable Object (đã chốt với người dùng), xác nhận lại trên preview; dự phòng là Workers Paid.
2. **Admin:** vai trò `admin` được gán bằng cách nào (mặc định đề xuất: gán thủ công qua lệnh `wrangler d1 execute`, không có đăng ký admin qua giao diện).
3. **Email:** không xác minh email ở GĐ1 (đã ghi nhận ở kế hoạch gốc).
4. **Tầng 9 (1c):** tiến độ dừng ở tầng 9 của mỗi cảnh giới, EXP bị chặn ở mức đầy và phần dư bị bỏ, cho đến khi có cơ chế đột phá (giai đoạn 2). Người dùng đã chọn phương án này.
5. **Điểm thử (1c):** nhân vật mới có 5 điểm tiềm năng ở Luyện Khí tầng 1 (migration 0003 điền cho nhân vật cũ); thêm `POST /api/dev/grant-exp` chỉ chạy khi `ENABLE_DEV_GRANT=1` trong `.dev.vars`.
6. **Cho 1d:** `grantExp` không tự áp `expBonus` (chỉ số dẫn xuất Ngộ tính); nơi gọi trong chiến đấu phải nhân vào. Tốc độ di chuyển vẫn là `BASE_SPEED`; `moveSpeed` trong `deriveStats` chưa được nối vào (đổi tốc độ giữa đường đi sẽ lệch vị trí, nếu nối phải rebase đường đi).
