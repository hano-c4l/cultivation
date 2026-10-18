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

## Docs and how to update them
- `docs/PLAN.md`: the overall plan: requirements, game rules, the list of phases and sub-phases (names only) with acceptance criteria, and **overview changes** compared with the original plan.
- `docs/TECHNICAL.md`: infrastructure (Cloudflare Free/Paid plan), architecture, environments and where things run, how to run and test, deploy procedure, traps already hit.
- `docs/PHASE1.md`, `docs/PHASE2.md`, `docs/PHASExx.md` (one file per phase, and the same applies to every later phase): details of that phase: decisions, how it was built, temporary values, leftover issues. Put each fact under the section of the matching sub-phase (1a-1f, 2a-2i, ...).
- `docs/STATUS.md`: **only** which phases are done, what is in progress (what is done and what is left in a half-finished phase, leftovers), and what comes next. No technical or feature details here.
- When the user says "cập nhật docs" or "cập nhật status" (update docs / status): put each piece of information in the **right file and the right section** as above (never dump everything into STATUS.md), fix cross references, then summarize STATUS.md again.
- Docs are written in Vietnamese, this file in English.
