# Nhật ký giấy phép asset

Mỗi ảnh, mô hình, animation hay font được dùng trong game phải có một dòng ở đây **trước khi** được đưa vào `client/public/gfx/` (xem `docs/PHASE4.md`, mục "Điều khoản dùng thương mại"). Asset đang dùng: `favicon.svg`, font của trang và atlas `char_base` (xem các dòng dưới).

| Asset (tệp hoặc nhóm) | Nguồn | Giấy phép | Ngày lấy | Gói dịch vụ lúc tạo (nếu là AI) | Link điều khoản | Cần ghi công? | Tệp chụp điều khoản |
|---|---|---|---|---|---|---|---|
| `client/public/favicon.svg` | Tự làm trong dự án | Thuộc dự án | 2026-10-23 | | | Không | |
| Font Be Vietnam Pro (nạp từ Google Fonts trong `client/index.html`, không đóng gói trong repo) | Google Fonts | SIL Open Font License 1.1 (cần kiểm lại trang của font trước khi chốt) | 2026-10 | | https://fonts.google.com/specimen/Be+Vietnam+Pro | Không | Chưa chụp |
| Quaternius Universal Animation Library [Standard] (thân người "Mannequin" và 6 trong 45 animation; gói gốc để ngoài repo ở `D:\Working\cultivation-art\ual`; **repo chứa ảnh đã render** `client/public/gfx/char_base.png` và `.json`) | [OpenGameArt](https://opengameart.org/node/174563) (`universal_animation_librarystandard.zip`, 14,5 MB; cùng bản ở [itch.io](https://quaternius.itch.io/universal-animation-library)) | CC0 1.0: `License.txt` trong gói ghi "CC0 1.0 Universal (CC0 1.0) Public Domain Dedication"; trang itch.io ghi "free to use in personal, educational and commercial projects" | 2026-10-26 | | https://creativecommons.org/publicdomain/zero/1.0/ | Không (tác giả xin ủng hộ trên Patreon, không bắt buộc) | Chưa chụp |
| Blender 4.5.15 LTS (công cụ render, không phân phối cùng game; dùng bản Microsoft Store do người dùng cài, vì bản zip tải từ blender.org, SHA-256 khớp, bị Smart App Control chặn) | https://download.blender.org/release/Blender4.5/ | GPL (phần mềm; ảnh render ra không bị ràng buộc bởi GPL của Blender) | 2026-10-26 | | https://www.blender.org/about/license/ | Không | Chưa chụp |

Quy ước: nguồn Blender và ảnh thô để ngoài repo; chỉ thành phẩm (atlas webp/png, JSON, `manifest.json`) được commit.
