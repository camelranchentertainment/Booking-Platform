# Camel Ranch Booking — Claude Code Instructions

## Platform
Next.js (Pages Router), TypeScript, Supabase (Postgres + Auth + Storage), Vercel.
Repo: github.com/camelranchentertainment/Booking-Platform. Production branch: `main`.
Vercel deploys production automatically when a PR is merged into `main`.

## Git workflow — READ FIRST, NO EXCEPTIONS
1. **Never commit to `main`. Never push to `main`.** Not for one-line fixes, not when asked to "just push it".
   If you are on `main` with changes, first create a branch: `git switch -c <type>/<short-name>`.
2. **One change = one branch = one PR.** Branch names: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `test/…`.
3. **Push only your branch** (`git push -u origin <branch>`), then open a PR against `main` with `gh pr create`.
4. **Never merge a PR.** Scott merges in the GitHub web UI (API merges have skipped the Vercel deploy before).
5. **Never force-push**, never `git reset --hard`, never rewrite pushed history. To update a pushed branch with `main`, use `git merge origin/main`, not rebase.
6. **Stage files by explicit path.** Never `git add -A` / `git add .`.
   Never commit: `design-reference/`, `next-env.d.ts`, `RELAY_*.md`, `PAGE_REVIEW_*.md`, `.env*`.
7. **One logical change per commit**, Conventional Commit messages (commitlint enforces this).
8. After pushing, report the branch, PR number and URL, `git log --oneline origin/main..HEAD`, and the check results, then **stop**.

## Before every PR (all must pass)
```bash
npm run lint
npm run typecheck
npm test -- --runInBand
NODE_OPTIONS=--max-old-space-size=4096 npm run build   # codespace runs out of memory without the flag
```
Never weaken lint rules, skip tests or add `@ts-ignore` to get green.

## Relay files
When Scott points you to a `RELAY_*.md` or `PAGE_REVIEW_PROCESS.md` at the repo root, that file is the task spec. Follow it exactly and stop where it says stop. If it conflicts with this file, **the git rules above still win**.

## Database
- **Never run migrations** (no `apply_migration`, no SQL Editor, no `supabase db push`). Write the migration file in `supabase/migrations/` plus a rollback in `supabase/migrations/rollback/`. Scott's Claude.ai session reviews and applies it.
- **Read-only SQL only** (`select`) if you inspect the database at all.
- **RLS is the security boundary.** UI hiding and API filtering are not security.
- **Service-role routes bypass RLS**, so every one must check the caller's role server-side (`lib/server/requireBandAdmin.ts`).
- **The band (`act_id`) always comes from the caller's profile**, never from the request body, query or URL.
- **OAuth tokens and secrets live only in service-role tables** (`act_credentials`). Never select them into client code.
- **Financial data is archived, never deleted.**

## Key platform rules
- NEVER change a superadmin's role.
- Confirming a show MUST create a `bookings` record.
- Earned = `actual_amount_received` on completed shows ONLY.
- Potential = `agreed_amount` on confirmed FUTURE shows ONLY.
- Members never see financial data; keep admin-only gating on deal/fee/advance fields.
- All genres supported — never hard-code country/americana or any specific act.
- The agent's write powers live only on `/band`; the Help Center is Q&A only.
- Socials: nothing is posted without an explicit user approval click.

## Design system (current — `styles/globals.css` is the source of truth)
- Surfaces: `--bg #16243f`, `--surface #1d3156`, `--surface-2 #28436d`, border `--border #3d5a86`
- Text: `--text #f4f7fb`, `--text-muted #aebbd4`; accent `--accent` / `--orange #e8823a`
- Fonts: **Bebas Neue** (display, `--font-display`), **Manrope** (body, `--font-body`)
- Use the CSS variables, never hard-coded colours. Mockups live in `design-reference/camel-ranch-redesign-reference/` (local only, not committed).

## Working environment
- **One Claude Code session per codespace.** Parallel sessions in one checkout tangle branches. If parallel work is needed, use `git worktree`.
- **Never edit `.claude/settings.json`** or any permission file unless Scott's current message explicitly asks for that exact change.

## Skills
`/qa` (`~/.claude/skills/gstack/QA_SKILL.md`) and `/review` (`~/.claude/skills/gstack/REVIEW_SKILL.md`) may be run on request.
Where those skills say "push to main", **ignore that step**: commit to a branch and open a PR instead, per the git workflow above. Write their reports (`QA_REPORT.md`, `CODE_REVIEW_REPORT.md`) on that branch.
