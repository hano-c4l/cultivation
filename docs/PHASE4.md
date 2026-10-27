# Giai đoạn 4: Đồ họa — kế hoạch chi tiết

Trạng thái (2026-10-27): **4a, 4b, 4c xong; 4d làm được phần lớn (thân nam và nữ có quần áo, lớp vũ khí, vẻ ngoài của người khác); 4e trở đi chưa làm.** Tất cả mới ở **preview**, production chưa có mã đồ họa (chỉ có tài liệu). Không có migration D1 nào trong giai đoạn này. Giai đoạn này được chèn giữa Admin (giai đoạn 3) và Kinh tế/xã hội (nay là giai đoạn 5), xem `docs/PLAN.md` mục 9b và 10. Trạng thái làm đến đâu: `docs/STATUS.md`. Đặc tả asset gốc (tile 64×32, khung nhân vật 96×96, neo ở chân, manifest): `docs/TECHNICAL.md` mục 6.

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
| 4a | Nền: `manifest.json`, bộ nạp atlas theo bản đồ, lớp hiển thị dùng sprite khi có và rơi về vẽ bằng code, `ASSETS.md` (giấy phép từng asset) | **Xong** (preview). Game chạy y như cũ khi manifest rỗng |
| 4b | Pipeline render và đóng gói: script Blender (`tools/render/`), camera isometric cố định, 8 hướng, 6 animation, layer; toon shader, viền mực, bảng màu; đóng gói atlas PNG + JSON (WebP ở 4h) | **Xong** (preview). Nguồn Blender và ảnh thô để ngoài repo, chỉ commit thành phẩm đã xong |
| 4c | **Nhân vật mẫu** đủ 8 hướng × 6 animation, hiển thị trong game, đo FPS và VRAM trên điện thoại thật | **Xong** (preview). Một thân nam dùng chung cho cả hai giới (sau đó thay bằng nam và nữ ở 4d). **Cổng duyệt phong cách:** dừng ở đây để người dùng duyệt trước khi làm tiếp |
| 4d | Layer trang bị (theo họ vũ khí, ô, bộ), pháp bảo, thú cưỡi (layer riêng; chỉ phần hình, cơ chế thú cưỡi vẫn thuộc giai đoạn 5); giày | **Phần lớn xong** (thân nam/nữ, vũ khí; còn màu theo bộ, pháp bảo, thú cưỡi, Ranger). Thân nữ làm sau khi phong cách ở 4c được duyệt; trang bị khóa giới tính nhân đôi khối lượng |
| 4e | Quái và boss theo loài (và hệ, hạng) | |
| 4f | Hiệu ứng kỹ năng, nón/tốc biến/buff/hồi máu, đột phá, truyền tống, hiệu ứng khi trang bị vũ khí | Thay `fx.ts` dần, theo loại trong `fx-kinds.ts` |
| 4g | Icon vật phẩm và kỹ năng, NPC, ô bản đồ, vật cản | AI 2D (ComfyUI...) phù hợp ở đây |
| 4h | Tối ưu và đo hiệu năng: nén texture, giới hạn sprite, gỡ atlas, so sánh với bản vẽ bằng code | Đo bằng `tools/load.mjs` và Chrome Performance trên một điện thoại thật |
| 4i | Admin gán hình khi tạo/sửa vật phẩm, trang bị, kỹ năng (và quái, NPC): chọn bộ sprite có sẵn; tải ảnh tĩnh (icon) lên | Ảnh tải lên lúc game chạy không nằm trong Workers Static Assets (chỉ đổi khi deploy), nên cần R2 hoặc nơi lưu khác; hoặc giới hạn ở chọn từ danh sách ảnh trong bản deploy. Quyết định khi tới 4i, báo người dùng trước nếu cần R2 |

## 4a. Nền (2026-10-26, nhánh `features_gfx-base`)
Chỉ có hạ tầng, **chưa có ảnh thật nào**; game chạy y như cũ khi manifest rỗng (trạng thái commit).

**Quy ước đã khóa** (mọi thứ render từ 4b trở đi phải theo; đổi sau này là render lại tất cả):
- **Khung** 96×96 px, neo ở chân: `anchor` là vị trí chân tính bằng px từ góc trên trái của khung (neo hiện là 48, 84: chừa 12 px dưới chân vì mũi chân hướng về người xem kéo dài xuống). Tối đa một trang atlas 2048 px mỗi cạnh (khoảng 260 frame 96×96 vừa một trang; vẫn dưới trần 4096 của GPU nhỏ).
- **Atlas** là Phaser "JSON hash" + một ảnh webp hoặc png; tên frame `anim_dir_index`, ví dụ `run_3_05` (`frameName`). Animation: `idle, run, attack, cast, hit, die`.
- **8 hướng tính trong không gian ô (mặt đất), không phải pixel màn hình**, vì Blender xoay mô hình từng 45° trên mặt đất và trên màn hình các bước đó không đều (ô (1,0) chỉ nằm 26,6° dưới ngang). Chỉ số 0 là xuống màn hình, đi theo chiều kim đồng hồ: 0 (+1,+1) xuống · 1 (0,+1) xuống-trái · 2 (−1,+1) trái · 3 (−1,0) lên-trái · 4 (−1,−1) lên · 5 (0,−1) lên-phải · 6 (+1,−1) phải · 7 (+1,0) xuống-phải. `directionOf(dx, dy)` ở `shared/src/gfx.ts`; hướng lấy từ đoạn đường hiện tại (`headingAlongPath`), không từ vị trí từng khung hình (độ lệch hiệu chỉnh sẽ làm nhấp nháy); đứng yên thì giữ hướng cuối.
- **Manifest** `client/public/gfx/manifest.json`: `version` (đổi mỗi lần đổi nội dung, dùng làm `?v=` chống cache), `atlases` (id → ảnh và JSON, đường dẫn tương đối), `sprites` (khóa → atlas, khung, neo, `scale`, `anims` có `frames`, `fps`, `loop`), `maps` (id bản đồ hoặc `*` → danh sách atlas; `*` luôn nạp). Kiểm bằng `validateManifest`: từ chối đường dẫn thoát thư mục hoặc có scheme, neo ngoài khung, animation lạ, bản đồ trỏ atlas không có. Manifest hỏng thì cả manifest bị bỏ và game dùng hình vẽ bằng code.
- **Khóa sprite** do **một hàm** quyết định (`GfxKit.spriteKeyFor`): hiện theo quy ước tên `player` (hoặc `player.<biến thể>`), `monster.<loài>`, `guard`. Ánh xạ D1 để Admin sửa sẽ bọc hàm này ở 4i (không sửa nơi gọi).

**Bẫy đã gặp khi làm:** một ảnh thiếu cũng được trả `index.html` mã 200 nên chỉ hỏng lúc giải mã ảnh, và loader không báo `FILE_LOAD_ERROR`; vì vậy sau khi hàng đợi nạp xong, atlas nào đã giao cho loader mà chưa có texture bị coi là lỗi (`sweep`).

**Cách chạy:** `GfxKit` (`client/src/gfx/kit.ts`) tải manifest không chặn cảnh, nạp atlas theo bản đồ (`atlasesForMap`) và gỡ khi rời (hủy sprite → xóa animation → xóa texture); lỗi mạng, JSON hỏng hay thiếu file chỉ ghi cảnh báo `gfx:` và giữ hình vẽ bằng code cho khóa đó trong phiên. `scene.ts`: `Actor` và `MonsterActor` có thêm `view` song song với `body`; `body` vẫn là điểm bám camera, bị ẩn khi có sprite; mục tiêu đang chọn được khoanh một vòng ở chân (hình vuông bị ẩn nên không còn viền); cỡ boss/hạng hiếm nhân vào tỉ lệ sprite; lên pháp bảo nâng sprite 8 px. Mỗi khung hình chỉ tra cứu khi `kit.active` (có atlas đã nạp), nên manifest rỗng không tốn gì.

**Đã kiểm:** 20 test đơn vị (`shared/src/gfx.test.ts`: 8 hướng, ranh giới 22,5°, hướng theo đoạn đường, từng kiểu manifest sai, và **manifest đang commit phải hợp lệ**); `npm run typecheck`; trình duyệt cục bộ với atlas tổng hợp từ `tools/gfx-fixture.mjs` (người chơi, sói ở rừng và vệ binh hiện bằng sprite, mũi tên quay đúng hướng đang đi, một atlas khai báo mà thiếu cả hai file, và một atlas có JSON mà thiếu ảnh, đều rơi về hình cũ, mỗi cái một cảnh báo `gfx:`; **đi town → forest → town → forest trong cùng một phiên:** sói và vệ binh dùng sprite ở rừng, về thành thì vệ binh trở lại hình bầu dục (atlas đã gỡ, không lỗi), vào rừng lần hai atlas được tải lại và sprite hiện lại).
**Chưa kiểm:** WebGL (khung trình duyệt của app chỉ chạy Canvas); điện thoại; thân nữ và `player.<biến thể>`; sprite cho NPC; tải lại atlas khi `version` đổi giữa phiên (cần vào lại game).
**Để sang hạng mục sau:** ánh xạ D1 (4i); nạp trước atlas của bản đồ kế tiếp (4h); đo VRAM (4h).

## 4b. Pipeline render (2026-10-26)
Một lệnh biến một mô hình có xương và animation thành atlas: `node tools/render/run.mjs <config.json> <thư mục ngoài repo>` (cấu hình nêu nguồn, xem 4d; Blender chạy không giao diện; đường dẫn Blender lấy từ biến môi trường `BLENDER_EXE`, mặc định là bí danh của bản Microsoft Store), rồi `node tools/gfx-publish.mjs <thư mục đó>` chép thành phẩm vào `client/public/gfx/` và ghép vào `manifest.json` (đây là nơi **duy nhất** ghi vào thư mục đó). Cấu hình ở `tools/render/sprite-config.json` (bản sao `directions` phải trùng `DIRECTION_VECTORS`: có test).

**Cách dựng:**
- Camera trực giao, nhìn xuống 30°, góc 45°, **1 ô = 1 m** (64/√2 ≈ 45,25 px mỗi mét), chân rơi đúng điểm neo. Mô hình xoay; ánh sáng và camera đứng yên.
- Bóng toon 3 mức (Diffuse → Shader to RGB → Color Ramp hằng số), viền mực bằng "inverted hull" (Solidify lật pháp tuyến, đặt **sau** modifier Armature để bám theo tư thế), 2 màu thay cho hai vật liệu gốc (`palette`), kết xuất Eevee, chế độ màu Standard (AgX làm mất độ tương phản).
- Cỡ người: `figureScale` 0,85 (cao khoảng 1,53 m, khoảng 60 px) để thân nằm của animation chết và tay giơ cao vẫn lọt khung 96×96. **Gốc dựng là người 1,8 m; đổi `figureScale` thì phải render lại tất cả.**
- Triệt tiêu chuyển động gốc (hông giữ nguyên chỗ) và nâng cả thân lên để điểm thấp nhất đứng đúng mặt đất.
- Mỗi lần chạy kiểm bằng **con số** và dừng nếu sai: camera (gốc về (48,84), ô +x ra (+32,+16), ô +y ra (−32,+16)), 8 hướng (mặt mô hình đúng hướng màn hình trong 2°), tư thế thật sự đổi giữa các frame, vật liệu đều có trong bảng màu. Ghi `report.json` (cả danh sách frame chạm mép khung) và `contact.png` (bảng mẫu 2× có ô 64×32 dưới chân).

**Bẫy đã gặp:** bản zip của Blender không chạy được vì Smart App Control chặn `blender_cpu_check.dll` chưa ký (xem `docs/TECHNICAL.md`); bản Microsoft Store chạy được. Importer glTF để đối tượng ở chế độ quaternion nên `rotation_euler` không có tác dụng (phải đặt `rotation_mode = "XYZ"`); độ phân giải phải đặt **trước** khi tính camera (độ lệch `shift_y` và phép chiếu phụ thuộc tỉ lệ khung); mọi action của gói nằm trong NLA và dùng "slot" (Blender 4.4+).

**Ghi chú:** atlas là **PNG** (1,58 MB cho 264 frame); chuyển sang WebP và nén texture để 4h. Tốc độ phát lấy từ chính action (số frame ÷ độ dài ÷ 24 fps).

## 4c. Nhân vật mẫu (2026-10-26) — **người dùng xem trên preview và nhận xét "có vẻ ổn"** (kèm yêu cầu đưa tên lên đầu, đã làm bằng trường `head` của manifest); thân người trơn mô tả dưới đây đã được thay bằng nam và nữ mặc bộ Peasant ở 4d
- **Nguồn:** thân người "Mannequin" và 6 animation của Quaternius Universal Animation Library [Standard] (CC0; ghi ở `ASSETS.md`). `idle` = Idle_Loop (4 frame), `run` = Jog_Fwd_Loop (8), `attack` = Sword_Attack (6), `cast` = Spell_Simple_Shoot (6), `hit` = Hit_Chest (3), `die` = Death01 (6): 33 frame × 8 hướng = 264 frame, atlas 2016×1248. **Đây là thân người trần, chưa có trang phục**: chỉ duyệt góc camera, cỡ người so với ô, viền, bóng và chuyển động; không duyệt quần áo.
- **Trong game:** người chơi (cả mình và người khác, một thân nam chung cho cả hai giới) dùng sprite này ở mọi bản đồ. `idle` và `run` theo di chuyển; `attack` khi đánh thường hoặc dùng kỹ năng cận chiến; `cast` khi dùng kỹ năng khác (trừ tốc biến); `hit` khi bị trúng; `die` khi chết (giữ khung cuối). Một lần chạy bị khóa tới hết (`ONE_SHOT_MS`: attack 500, cast 600, hit 320 ms), không bị idle/run cắt; thời gian này chỉ là hình, **server vẫn quyết định nhịp và thời điểm trúng đòn**.
- **Biết là còn thiếu:** 28 trên 264 frame chạm mép khung (đều ở animation chết, vài frame đánh); quái chết bị gỡ ngay nên **chưa có animation chết cho quái** (cần trì hoãn việc gỡ, làm ở 4e); `die` của người chơi khác chưa có (server chỉ báo `died` cho chính người chết); vệ binh, NPC và quái vẫn là hình cũ.
- **Đã kiểm trong trình duyệt local:** đứng, đi, đánh quái ở rừng, chuyển bản đồ qua cổng; chết ở hang rồi hồi sinh ở thành thì nhân vật đứng dậy và đi được (`welcome` xóa và dựng lại mọi view nên khóa `die` không kẹt).
- **Chưa kiểm:** FPS và VRAM trên điện thoại thật (việc của người dùng), WebGL, từng animation chạy trong game (đã thấy nhân vật đứng, đi và đánh trong trình duyệt local nhưng chưa xem từng animation một).

## 4d. Thân nữ, trang bị, pháp bảo, thú cưỡi (2026-10-26) — **đang làm, chia nhỏ**
**Đã làm (hạ tầng, chưa có ảnh mới):**
- Pipeline render nhận nguồn khác nhau qua cấu hình: `node tools/render/run.mjs <config.json> <thư mục ngoài repo>` (thư mục chứa gói tải về lấy từ `CULTIVATION_ART`, mặc định `D:/Working/cultivation-art`); cấu hình có `source` (mô hình, tệp animation FBX tùy chọn, kiểu tóc tùy chọn), `extends` (kế thừa cấu hình khác), `materials` (màu từng vật liệu, tùy chọn dùng vertex color), `bodyMesh`, `outlineMeshes`, `hipsBone`, `actionPrefix`. Có sẵn `sprite-config-female.json` và `sprite-config-male.json` (Quaternius Universal Base Characters, kèm tóc, animation lấy từ bản Unreal Engine của Universal Animation Library vì cùng tên xương: `root, pelvis, spine_01...`; bản Godot của gói animation dùng tên xương khác `DEF-...` nên **không** áp được lên thân này).
- Server gửi thân nào cho từng người chơi: `PlayerSnapshot.f` (có khi thân nữ; `bodyOf` ở `shared/src/gender.ts`; "male_wears_female" vẫn là thân nam). Client chọn khóa sprite `player.female` hoặc `player.male`, rơi về `player` khi chưa có.

**Thân nam và nữ có quần áo (đã làm):** thân của gói Universal Base Characters [Standard] là thân trần nên **chỉ lấy cái đầu** (cắt các đỉnh không thuộc xương `Head` và `neck_01` bằng `headOnly`), rồi mặc bộ **Peasant** (nam và nữ) của gói Modular Character Outfits - Fantasy [Standard] (CC0; bản Standard chỉ có 4 bộ: Peasant và Ranger, nam và nữ), cộng tóc. Quần áo giữ màu của texture BaseColor, nhân thêm màu `color` của cấu hình (đồ sáng lên bằng hệ số 2,4 vì texture tối), da là một màu phẳng. Bộ này thay hai thân người mẫu cũ: manifest nay có `player.male` và `player.female` (atlas `char_male` và `char_female`, 264 frame mỗi cái), thân người trơn `char_base` đã bị gỡ khỏi manifest (cấu hình `sprite-config.json` vẫn còn làm gốc kế thừa). Tải cả hai atlas ở mọi bản đồ vì nam và nữ có thể cùng đứng một chỗ. Sau khi cắt gọn từng frame (xem lớp vũ khí): `char_female` 960×751 (khoảng 2,9 MB VRAM, PNG 1,0 MB), `char_male` 1024×779 (khoảng 3,2 MB VRAM, PNG 1,1 MB), **cộng lại khoảng 6 MB VRAM và 2,1 MB tải về**; mỗi atlas vũ khí khoảng 1 đến 1,5 MB VRAM (PNG 0,3 đến 0,45 MB), chỉ tải họ đang có trên màn hình. Nén texture (KTX2) và đo thật trên điện thoại để 4h.
- **Còn thiếu của bản này:** chỉ một bộ (Peasant); chưa có bộ Ranger (có nón trùm, giáp vai) vào game; ba màu mỗi bộ chỉ có ở bản Source (bản Standard một màu); màu quần áo hơi tối trên nền cỏ; 22 (nữ) và 28 (nam) frame trên 264 chạm mép khung, đều ở animation chết và vài frame đánh.

**Lớp vũ khí (đã làm):**
- **Cách dựng:** mỗi họ vũ khí và mỗi thân có một atlas riêng (`weapon.<họ>.<nam|nữ>`, ví dụ `weapon.kiem.female`), render với cùng camera và cùng animation của thân, vũ khí gắn vào xương tay (`hand_r`; cung ở `hand_l`) và **thân bị đặt thành "holdout"** (`is_holdout`): khung ảnh chỉ còn phần vũ khí không bị thân che, nên lớp này luôn vẽ **lên trên** thân ở mọi hướng mà vẫn đúng chỗ bị che. Tên frame giống hệt của thân, nên sprite vũ khí **không tự chạy animation mà hiện đúng frame (theo tên) của sprite thân** mỗi khung hình (`GfxView.followFrame`): hai animation riêng sẽ lệch pha ngay khi atlas vũ khí (tải theo nhu cầu) vào muộn hơn thân. Bảng họ → tệp mô hình, xương, chiều dài, vị trí, góc: `tools/render/weapons.json`; lệnh `node tools/render/render-weapons.mjs <thư mục ngoài repo> [--preview] [--family ..] [--body ..]` (`--preview` chỉ render idle và đánh, có thân, để chỉnh chỗ cầm vũ khí).
- **Sáu họ của game** (`WEAPON_TYPES`): `kiem` = Sword, `dao` = Sword_Big, `thuong` = Spear, `riu` = Axe, `cung` = Bow_Wooden (tay trái); `quyen` (quyền) không có lớp vũ khí. Mô hình là Medieval Weapons Pack của Quaternius (CC0), kiểu phương Tây: **chỉ là bản tạm**. Cung chưa được giương (animation đánh là nhát chém của kiếm), thương và rìu cũng vung như kiếm.
- **Atlas được cắt gọn:** mọi frame được cắt về hộp không trong suốt rồi xếp khít (`trimmed`, `sourceSize` vẫn 96×96 nên neo và lớp vẫn khớp). Atlas thân giảm từ 2016×1248 xuống khoảng 960×751 (**khoảng 30% VRAM**); đây là phần lớn của việc giảm VRAM dự kiến ở 4h.
- **Đồng bộ vẻ ngoài giữa người chơi:** `PlayerSnapshot.w` (họ vũ khí đang cầm, bỏ trống nếu không có hoặc vũ khí đã hỏng) và tin `look {id, w}` mỗi khi `applyGear` thấy vũ khí đổi (mặc, tháo, hỏng); `PlayerState.w` giữ giá trị hiện tại. Client giữ `Actor.weapon` và một `GfxView` thứ hai (`wview`) vẽ trên thân. `applyGear` ghi lại `w` bằng bản đọc mới nhất của attachment (như cờ cưỡi), và các nơi gọi nó không ghi đè bằng bản `state` cũ.
- **Tải theo nhu cầu:** atlas vũ khí không nằm trong danh sách bản đồ nào (`gfx-publish --demand`); `GfxKit.spriteKeyFor("weapon", ...)` tải atlas lần đầu có người cần và gỡ khi đổi bản đồ.
- **Đã kiểm:** lớp vũ khí đặt lên thân khớp với ảnh render chung thân và vũ khí (so từng điểm ảnh trên 21 frame của kiếm, thương, rìu: sai khác trung bình dưới 0,001, tối đa 0,12 ở viền khử răng cưa); tải atlas theo nhu cầu, mặc và tháo kiếm trong trình duyệt local (kiếm hiện ở tay, biến mất khi tháo); `node tools/look-smoke.mjs` (người khác nhận `look` khi mặc và tháo, người vào sau thấy kiếm và thân nữ trong welcome).
- **Frame chạm mép khung** (xem `report.json`): kiếm 22/22, dao 28/19, thương 27/23, rìu 22/20, cung 51/43 trên 264 frame (nam/nữ; đa số ở animation chết và đánh; cung nhiều nhất, tới cả `cast`).
- **Chưa kiểm:** animation đánh, trúng và chết khi đang cầm vũ khí (trong game mới thấy đứng và chạy); atlas vũ khí được tải lại sau khi qua cổng bản đồ; vũ khí của người khác trong một trình duyệt thứ hai (chỉ kiểm giao thức); WebGL; FPS và VRAM trên điện thoại.
- **Điểm yếu nhất là cái cung (xem "Còn lại của 4d": chưa có animation cung nào để dùng):** cầm ở tay trái, dùng nhát chém của kiếm, chạm mép khung ở 51 (nam) và 43 (nữ) frame, kể cả `cast`; cần animation riêng (giương cung) trước khi coi là xong.
- **Chưa làm:** ánh xạ "vật phẩm → sprite vũ khí" bằng D1 cho Admin (hiện chỉ theo **họ** vũ khí, qua bảng `weapons.json` và tên khóa sprite; **4i** sẽ cho Admin gán); vũ khí của quái và vệ binh; hai vũ khí cùng lúc, khiên.

**Sửa sau lần thử tay (2026-10-27, nhánh `features_gfx-fixes4d`):**
- **Cầm kiếm ngược:** vũ khí gắn vào xương `hand_r` xoay quanh trục X **+60°** nên mũi vũ khí chỉ về phía khuỷu tay và nhân vật đánh bằng chuôi. Đổi thành **−60°** cho kiếm, dao, thương, rìu (`tools/render/weapons.json`; cung giữ 90°, mô hình đối xứng quanh chỗ cầm). Lưỡi nay vươn ra khỏi nắm tay, chĩa xuống khi đứng và vung lên rồi đâm khi đánh. Vì lưỡi vươn xa hơn, bốn họ bị **ngắn đi khoảng 20%** (giá trị tạm: kiếm 0,7, dao 0,75, thương 0,9, rìu 0,7 m; trước đó 0,9/1/1,15/0,9) để số frame chạm mép khung vẫn ngang trước (22-35 trên 264). Đã render lại tám atlas vũ khí. Đã xem bảng mẫu của kiếm nữ và thương nam; **chưa xem trong game** (animation đánh khi cầm vũ khí chưa ai thấy).
- **Quần áo sáng hơn:** hệ số màu bộ Peasant 2,4 → 3,2 (`sprite-config-female.json`, nam kế thừa); hình học không đổi nên lớp vũ khí vẫn khớp (cùng kích thước atlas). Chưa xem trên nền cỏ trong game.

**Còn lại của 4d (chưa làm, đã cân nhắc 2026-10-27):**
- **Màu/bộ trang phục theo bộ trang bị và bộ Ranger:** nên dùng một nhóm `game_tuning` (bộ → khóa hình, không cần migration) và để `applyGear` tính khóa rồi báo qua snapshot/`look` như `w`. **Đừng dùng tint của Phaser để đổi màu:** tint chỉ chắc chắn chạy ở WebGL, còn khung trình duyệt của app và đường lùi `?renderer=canvas` là Canvas (chưa kiểm phiên bản Phaser đang dùng); nhiều khả năng mỗi biến thể phải là một atlas riêng (khoảng 3 MB VRAM mỗi thân).
- **Pháp bảo phi hành:** hiện vẫn là elip mây dưới chân (`Actor.cloud`); thay bằng sprite chưa làm.
- **Thú cưỡi:** chưa có cơ chế nào (thuộc giai đoạn 5) nên chưa có gì để gắn sprite; hoãn.
- **Giương cung:** gói animation đang dùng (UAL Standard) **không có animation cung** (chỉ có Sword_Attack, Spell_Simple_*, Pistol_*, Punch_*). Cung bị chặn bởi việc phải có animation mới (và kiểm giấy phép); chưa dùng Pistol_Shoot thay thế.

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
| MCP | Không dùng: Blender chạy bằng script qua `tools/render/run.mjs` |

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
