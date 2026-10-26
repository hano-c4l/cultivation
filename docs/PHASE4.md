# Giai đoạn 4: Đồ họa — kế hoạch chi tiết

Trạng thái (2026-10-26): **mới có kế hoạch, chưa làm gì.** Giai đoạn này được chèn giữa Admin (giai đoạn 3) và Kinh tế/xã hội (nay là giai đoạn 5), xem `docs/PLAN.md` mục 9b và 10. Trạng thái làm đến đâu: `docs/STATUS.md`. Đặc tả asset gốc (tile 64×32, khung nhân vật 96×96, neo ở chân, manifest): `docs/TECHNICAL.md` mục 6.

## Mục tiêu và phạm vi
Thay placeholder bằng đồ họa 2D kiểu Võ Lâm Truyền Kỳ: nhân vật nhiều hướng có animation, trang bị/pháp bảo/thú cưỡi hiện trên người, quái và boss, hiệu ứng kỹ năng và các hiệu ứng khác (vũ khí, đột phá, truyền tống), icon. Server không đổi luật chơi; giai đoạn này chỉ thay lớp hiển thị và dữ liệu ánh xạ hình.

## Hiện trạng (đã kiểm 2026-10-26)
- Không có file ảnh nào ngoài `client/public/favicon.svg`; mọi thứ vẽ bằng code (Phaser Graphics).
- Hiệu ứng kỹ năng nằm ở `client/src/fx.ts` (309 dòng), vẽ bằng `scene.add.graphics()` và tween, giới hạn số hiệu ứng chạy đồng thời ở `shot()`; loại hiệu ứng ở `client/src/fx-kinds.ts`.
- Nhân vật, quái, vật cản và ô bản đồ do `client/src/scene.ts` vẽ.
- Game có hai giới tính và một số trang bị khóa theo giới tính; trang bị chia theo họ vũ khí, ô và bộ (tên bộ theo cảnh giới và bậc); có pháp bảo thường/bản mệnh/phi hành (cưỡi, phím M), giày, và quái theo loài (`game_tuning.species`).

## Quyết định đã chốt (2026-10-26)
1. **Phong cách:** kiểu Võ Lâm Truyền Kỳ (2D vẽ tay, tỉ lệ nhân vật theo mục 6 của `TECHNICAL.md`).
2. **Cách sản xuất:** mô hình 3D → render sprite 2D bằng Blender (chạy bằng script), 8 hướng × 6 animation (`idle, run, attack, cast, hit, die`) × từng layer. Toon shader, viền mực và bảng màu cố định để ảnh gần với 2D vẽ tay. **3D render là cách làm, không phải phong cách.**
3. **Nguồn ban đầu:** kit CC0 và AI làm nhanh. Bản đầu chỉ là **bản tạm**, chưa giống Võ Lâm Truyền Kỳ; thay mô hình sau và render lại, không sửa code game.
4. **Không dùng AI sinh ảnh 2D** cho animation 8 hướng (khó nhất quán giữa hướng và frame, và khó ghép vũ khí). AI 2D (ComfyUI...) chỉ dùng cho icon, ảnh minh họa, ô bản đồ, nền.
5. **Hiệu ứng kỹ năng:** particle của Phaser cộng vài texture nhỏ blend cộng (additive); hiệu ứng lớn dùng spritesheet từ pack CC0. Không render 3D cho hiệu ứng.
6. **Rơi về vẽ bằng code:** thiếu ảnh (hoặc manifest rỗng) thì client vẽ như hiện tại. Nhờ đó các giai đoạn sau không chờ art.
7. **Giới tính (người dùng chốt 2026-10-26):** nhân vật có nam và nữ, nhưng **tạm thời dùng một thân nam làm mẫu chung cho cả hai** để duyệt phong cách ở 4c; thân nữ làm sau khi phong cách được duyệt (ở 4d hoặc sau).
8. **Nguồn Blender và ảnh thô để ngoài repo (người dùng chốt 2026-10-26):** repo chỉ chứa thành phẩm đã xong (atlas đã đóng gói, `manifest.json`, `ASSETS.md`, script trong `tools/render/`). Không dùng Git LFS.
9. **Gán hình khi tạo/sửa vật phẩm, trang bị, kỹ năng ở Admin làm ở cuối giai đoạn 4 (hạng mục 4i), người dùng chốt 2026-10-26.** Sprite có animation (nhân vật, quái 8 hướng) do pipeline tạo, Admin chỉ chọn bộ có sẵn; chỉ ảnh tĩnh (icon) mới tải lên được.

## Nguyên tắc thiết kế (áp dụng Design principle của `CLAUDE.md` cho đồ họa)
- **Hai tầng dữ liệu:**
  - `manifest.json` là **tài sản tĩnh** đi cùng bản deploy: tên atlas, frame, neo, số frame mỗi animation.
  - **Ánh xạ "cái gì dùng sprite nào" là dữ liệu D1** để Admin sửa sau: loài quái → bộ sprite (đặt trong `game_tuning.species`), họ trang bị/bộ → layer (đặt cạnh định nghĩa vật phẩm), loại hiệu ứng → texture/particle (cạnh `skillOverrides`), NPC → sprite (cạnh `npc_spots`), thú cưỡi/pháp bảo → sprite. Tải lại qua `config_versions` và `loadLiveConfig`, như các nhóm khác. Mục tiêu: thêm một loài quái hay đổi hình một món đồ là thêm ảnh và sửa dữ liệu, **không sửa code**.
  - Gán hình ở màn Admin làm ở 4i (cuối giai đoạn); trước đó sửa dữ liệu D1 trực tiếp.
- **Server là nguồn sự thật về thời gian.** Animation đánh/niệm chỉ ở client và phải **co giãn theo nhịp và thời gian trúng đòn do server quyết định**. Số frame trong manifest không được ảnh hưởng gameplay.
- **Ngân sách bộ nhớ GPU, không chỉ dung lượng tải.** WebP chỉ giảm dung lượng tải; khi lên GPU, một layer 96×96 với khoảng 260 frame ≈ 9-10 MB chưa nén, rồi nhân với số layer, bộ trang bị và loài quái. Vì vậy: nạp atlas **theo bản đồ** và gỡ khi chuyển bản đồ; đặt trần kích thước một atlas an toàn cho điện thoại; cân nhắc nén texture (KTX2) ở 4h; gộp (bake) layer thành một sprite nếu quá nhiều sprite chồng nhau.
- **Neo ở chân, thứ tự 8 hướng, kích thước khung và quy ước đặt tên** khóa một lần ở 4a, ghi vào đây; mọi thứ render sau tuân theo.

## Hạng mục
Mỗi hạng mục là một nhánh `features_gfx-xxx` theo quy trình trong `CLAUDE.md`, kèm test đơn vị.

| | Hạng mục | Ghi chú |
|---|---|---|
| 4a | Nền: `manifest.json`, bộ nạp atlas theo bản đồ, lớp hiển thị dùng sprite khi có và rơi về vẽ bằng code, `ASSETS.md` (giấy phép từng asset) | Game chạy y như cũ khi manifest rỗng |
| 4b | Pipeline render và đóng gói: script Blender (`tools/render/`), camera isometric cố định, 8 hướng, 6 animation, layer; toon shader, viền mực, bảng màu; đóng gói atlas webp + JSON | Nguồn Blender và ảnh thô để ngoài repo, chỉ commit thành phẩm đã xong |
| 4c | **Nhân vật mẫu** đủ 8 hướng × 6 animation, hiển thị trong game, đo FPS và VRAM trên điện thoại thật | Một thân nam dùng chung cho cả hai giới. **Cổng duyệt phong cách:** dừng ở đây để người dùng duyệt trước khi làm tiếp |
| 4d | Layer trang bị (theo họ vũ khí, ô, bộ), pháp bảo, thú cưỡi (layer riêng; chỉ phần hình, cơ chế thú cưỡi vẫn thuộc giai đoạn 5); giày | Thân nữ làm sau khi phong cách ở 4c được duyệt; trang bị khóa giới tính nhân đôi khối lượng |
| 4e | Quái và boss theo loài (và hệ, hạng) | |
| 4f | Hiệu ứng kỹ năng, nón/tốc biến/buff/hồi máu, đột phá, truyền tống, hiệu ứng khi trang bị vũ khí | Thay `fx.ts` dần, theo loại trong `fx-kinds.ts` |
| 4g | Icon vật phẩm và kỹ năng, NPC, ô bản đồ, vật cản | AI 2D (ComfyUI...) phù hợp ở đây |
| 4h | Tối ưu và đo hiệu năng: nén texture, giới hạn sprite, gỡ atlas, so sánh với bản vẽ bằng code | Đo bằng `tools/load.mjs` và Chrome Performance trên một điện thoại thật |
| 4i | Admin gán hình khi tạo/sửa vật phẩm, trang bị, kỹ năng (và quái, NPC): chọn bộ sprite có sẵn; tải ảnh tĩnh (icon) lên | Ảnh tải lên lúc game chạy không nằm trong Workers Static Assets (chỉ đổi khi deploy), nên cần R2 hoặc nơi lưu khác; hoặc giới hạn ở chọn từ danh sách ảnh trong bản deploy. Quyết định khi tới 4i, báo người dùng trước nếu cần R2 |

## Nghiệm thu (bản chi tiết của `docs/PLAN.md` mục 10)
- Nhân vật mẫu đủ 8 hướng và 6 animation hiển thị đúng trong game, **không lệch neo giữa các hướng**, và được người dùng duyệt phong cách.
- Game chạy y như hiện nay khi manifest rỗng hoặc thiếu ảnh.
- Mỗi ảnh được dùng có dòng giấy phép trong `ASSETS.md` (gồm điều khoản của dịch vụ AI 3D/2D nếu dùng).
- Atlas tải theo bản đồ và gỡ khi rời; số liệu VRAM và FPS đo trên một điện thoại thật.
- Thời gian đòn đánh vẫn do server quyết định.
- Thêm hoặc đổi sprite cho loài quái, vật phẩm, hiệu ứng bằng dữ liệu D1 và ảnh, không sửa code.

## Công cụ đề xuất (chưa kiểm chứng bằng cách chạy thử)
| Việc | Công cụ |
|---|---|
| Dựng và render sprite | Blender (script `bpy`, không giao diện) |
| Animation | Mixamo hoặc pack animation CC0 (cần rig tương thích) |
| Mô hình 3D | Kit CC0 (Kenney, Quaternius...) hoặc AI image-to-3D (Meshy, Tripo, Rodin); chất lượng AI không đều, phải chỉnh tay và rig lại |
| Icon, ô bản đồ, nền | ComfyUI (Stable Diffusion + LoRA + ControlNet), Scenario hoặc Layer.ai |
| Hiệu ứng | Particle của Phaser, pack hiệu ứng CC0 (OpenGameArt, itch) |
| Đóng gói | free-tex-packer hoặc TexturePacker, `sharp`, `ffmpeg` |
| Chỉnh tay | Aseprite hoặc Krita |
| MCP | Cộng đồng có MCP cho Blender và ComfyUI; chưa xác nhận bản nào dùng được ở đây, cần tìm trong registry khi bắt đầu 4b |

Vai trò của trợ lý: viết pipeline (script Blender, gọi ComfyUI, đóng gói, bộ nạp manifest) và xem lại ảnh render để bắt lỗi (lệch neo, lệch hướng); không tự sinh ảnh.

## Câu hỏi còn mở
1. **Giới hạn lưu trữ/phục vụ ảnh.** Atlas đi cùng bản deploy dưới dạng Workers Static Assets. Số file (20.000) và dung lượng mỗi file (25 MiB) ở gói Free đã tra cứu (mục "Giới hạn đã xác nhận" bên dưới); **tổng dung lượng assets thì tài liệu không nêu**, cần thử deploy một lô lớn ở preview trước khi cam kết. Nếu cần R2 hoặc nâng Paid thì **báo người dùng trước** (`docs/TECHNICAL.md` mục 2a).
2. **Admin tải ảnh ở 4i:** ảnh tải lên lúc chạy cần nơi lưu (R2 hoặc tương đương), phụ thuộc câu 1. Nếu không dùng R2 thì chỉ chọn từ danh sách ảnh trong bản deploy.
3. **Điều khoản dùng thương mại** của dịch vụ AI 3D/2D chọn dùng khác nhau theo dịch vụ: đọc bản hiện hành trước khi dùng cho bản chạy thật, theo danh sách ở mục "Điều khoản dùng thương mại" bên dưới.

(Đã chốt, không còn mở: giới tính ở 4c, nơi để nguồn Blender, thời điểm làm phần Admin gán hình; xem "Quyết định đã chốt" 7-9.)

## Điều khoản dùng thương mại (danh sách cần kiểm với từng dịch vụ; chưa đọc điều khoản của dịch vụ nào)
1. **Gói lúc tạo ảnh:** quyền thương mại thường chỉ có ở gói trả tiền và tính theo gói tại thời điểm tạo; ảnh gói miễn phí có thể thuộc dịch vụ hoặc chỉ dùng phi thương mại.
2. **Sở hữu kết quả:** được sở hữu hay chỉ được cấp giấy phép; giấy phép có thu hồi được không.
3. **Ghi công (attribution)** có bắt buộc không.
4. **Nhúng vào game thì được, bán lại như gói asset thì thường cấm.** Game có bán Tiên Ngọc nên là thương mại ngay từ đầu; xem ngưỡng doanh thu của giấy phép.
5. **Bản quyền của sản phẩm do AI sinh:** ở một số nước tác phẩm hoàn toàn do AI không được bảo hộ nên khó ngăn người khác sao chép; hỏi chuyên gia pháp lý nếu cần chắc.
6. **Bồi thường (indemnity)** khi bị kiện vi phạm bản quyền: hầu hết dịch vụ nhỏ không có.
7. **Dữ liệu vào và ra** có bị dùng để huấn luyện hoặc đưa lên thư viện công khai không (gói miễn phí thường công khai).
8. **Giấy phép mô hình mã nguồn mở** (checkpoint, LoRA khi tự chạy ComfyUI): mỗi cái một giấy phép, có loại cấm thương mại hoặc giới hạn theo doanh thu.
9. **Không dùng tên hoặc tài sản của game có bản quyền:** không gọi tên "Võ Lâm Truyền Kỳ" hay họa sĩ cụ thể trong prompt, không dùng ảnh của game đó làm ảnh tham chiếu hoặc dữ liệu huấn luyện; mô tả phong cách bằng đặc điểm (màu, nét, tỉ lệ).
10. **Kit "CC0" phải đúng là CC0** (nhiều pack là CC-BY hoặc giấy phép riêng); Mixamo theo điều khoản của Adobe (cần kiểm: dùng trong game được, phát hành lại animation riêng lẻ thì cấm).
11. **Điều khoản thay đổi hoặc dịch vụ ngừng:** giữ file nguồn và bản chụp điều khoản đúng ngày dùng.

`ASSETS.md` mỗi dòng nên có: nguồn, giấy phép, ngày, gói dịch vụ lúc tạo, đường dẫn điều khoản, có cần ghi công không, tệp chụp điều khoản.

## Giới hạn đã xác nhận
Tra cứu ngày 2026-10-26 bằng agent `docs` (đọc tài liệu Cloudflare, không phải trí nhớ); cần kiểm lại khi bắt đầu 4a vì Cloudflare đổi số liệu:
- **Workers Static Assets** (https://developers.cloudflare.com/workers/platform/limits/#static-assets): số file mỗi phiên bản **20.000 (Free), 100.000 (Paid)**; dung lượng mỗi file **25 MiB** cả hai gói. Mức 100.000 file cần Wrangler 4.34.0 trở lên. **Tổng dung lượng assets: tài liệu không nêu con số** (không có nghĩa là không giới hạn); trang billing nói lưu assets không tốn thêm phí.
- **R2** (https://developers.cloudflare.com/r2/pricing/): miễn phí hằng tháng 10 GB lưu trữ (Standard), 1 triệu thao tác Class A, 10 triệu Class B, egress miễn phí. **Chưa xác nhận được** R2 có cần phương thức thanh toán không (tài liệu chỉ nói phải "complete the checkout flow" để thêm gói R2; nguồn không chính thức mâu thuẫn). Nếu cần R2 thì hỏi người dùng trước.
- **Tính nhanh:** vài chục atlas webp vài trăm KB đến vài MB mỗi cái nằm xa dưới 20.000 file và 25 MiB mỗi file. Rủi ro lớn hơn là tổng dung lượng không rõ và tốc độ deploy, không phải số file; đóng gói thành ít atlas lớn, đừng để từng frame là một file.
