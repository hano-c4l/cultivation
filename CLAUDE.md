## Advisor (Opus 5.5)
Consult the advisor at these three points:
- Before finalizing a plan.
- When the same error occurs a second time.
- Before reporting that work is done.

## Subagents
- Use `search` for repo maps, `grep` for call sites, and `docs` for API documentation. All three are read-only Haiku agents.

## Git, branch and deploy workflow
- Repo: https://github.com/hano-c4l/cultivation.git (remote `origin`).
- `main`: production. Deploying the production worker (`cultivation`, D1 `cultivation-db`) happens only from `main`.
- `preview`: staging. Deploying the preview worker (`cultivation-preview`, D1 `cultivation-preview-db`, `npm run deploy:preview`) happens only from `preview`.
- Every change follows this flow:
  1. Create a branch `features_xxxx` (short descriptive name) from `preview` and make the changes there.
  2. When done, open a PR `features_xxxx` → `preview`, merge it, then deploy preview (run `npm run db:migrate:preview` first if there are new migrations).
  3. Only if the preview deploy is verified OK, open a PR `preview` → `main`, merge it, then deploy production (run `npm run db:migrate:remote` first if there are new migrations).
- Never commit directly to `main` or `preview`, and never skip the preview stage.
- Commit, push, PR, merge and deploy are outward-facing: do each only when the user asks or has approved that step in the current session.

## Tài liệu (docs) và quy tắc cập nhật
- `docs/PLAN.md`: kế hoạch tổng, yêu cầu, luật chơi, các giai đoạn, và **thay đổi tổng quan** so với kế hoạch.
- `docs/TECHNICAL.md`: hạ tầng Cloudflare (gói Free/Paid), kiến trúc, môi trường, nơi chạy và cách chạy, kiểm thử, quy trình triển khai, bẫy đã gặp.
- `docs/PHASE1.md`, `docs/PHASE2.md`: chi tiết từng giai đoạn: quyết định, cách làm, giá trị tạm, vấn đề tồn đọng (đặt trong mục của đúng hạng mục 1a-1f, 2a-2i).
- `docs/STATUS.md`: **chỉ** giai đoạn nào xong, đang làm gì (phần nào xong, phần nào làm tiếp, tồn đọng), làm tiếp gì. Không để chi tiết kỹ thuật hay chi tiết tính năng ở đây.
- Khi người dùng nói "cập nhật docs" hoặc "cập nhật status": đưa từng thông tin vào **đúng file, đúng mục** như trên (không dồn vào STATUS.md), sửa lại các chỗ tham chiếu chéo, rồi tóm tắt lại STATUS.md.

