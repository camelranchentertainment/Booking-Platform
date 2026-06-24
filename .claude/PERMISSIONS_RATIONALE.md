# Permission boundaries — read this before changing .claude/settings.json

This file explains the *reasoning* behind `.claude/settings.json`, not just the
rules. If you're tempted to loosen something below to reduce friction, read
the "why" first — most of these exist because of a specific incident or an
explicit standing instruction from Scott, not as generic caution.

## The governing principle

**Reversible + scoped → automatic. Irreversible or cross-cutting → human in
the loop.** That's the entire design. `acceptEdits` as the default mode means
Claude can read, search, and edit application code freely — those changes
live in git, are reviewable in a diff, and cost nothing to undo before commit.
Everything in `ask` either touches something that's expensive/impossible to
undo (force-push, `rm -rf`, a DB migration) or sits inside a zone that Scott
has explicitly said needs a dedicated, supervised session.

## Why these specific files are gated, not just "API routes in general"

- **`pages/api/accept-invite.ts`** — has a known, *deliberately deferred*
  security issue (`userId` taken from request body without JWT verification).
  This file does not get touched as a drive-by fix inside unrelated work.
  When it's time to fix it, that's its own session, with Scott present,
  start to finish.
- **`pages/api/**` generally** — API routes are where auth, RLS assumptions,
  and multi-tenant `act_id` scoping live. A scoped fix to a UI component
  can't accidentally break tenant isolation. A scoped "fix" to an API route
  can, silently, and you might not notice until cross-tenant data leaks.
  That's the category of bug the IDOR audit found five of — API routes
  get a human reading the diff before it lands.

## Why Supabase mutations are gated but reads are not

Schema inspection, advisors, logs, migration *listing* — all read-only,
all safe to run in a loop while debugging. `apply_migration`, `execute_sql`,
branch operations, and project lifecycle calls (`create_project`,
`pause_project`, `restore_project`) all change live state in a project that
has real production data and real band members relying on it. The
`profiles`/`user_profiles` reconciliation in particular is explicitly
flagged as needing a dedicated session — don't let an unattended run touch
that table split as a side effect of something else.

## Why deploys are gated but build-log reads are not

Checking *why* a deployment failed is diagnostic and harmless — do it as
often as needed. Triggering a new deploy changes what's live for real users.
Same logic as the DB: read freely, mutate deliberately.

## What this config deliberately does NOT attempt

It does not stop a script Claude writes and runs via `Bash` from opening
`.env` directly with its own file I/O — deny rules on `Read`/`Edit` cover
Claude's own file tools, not arbitrary subprocess behavior. If something
feels like it needs that level of isolation, that's a sign the task belongs
in a sandboxed/disposable environment, not a `--dangerously-skip-permissions`
run against this repo.

## If you're about to run something unattended (Auto Mode, a Routine, a long
   `acceptEdits` session you plan to walk away from)

Ask first: does this task stay inside `pages/`, `components/`, `lib/`,
`utils/`, `types/`, `styles/`, or `public/`, touching no API route and no
migration? If yes, this config already lets it move with minimal friction.
If no — if it touches `pages/api/`, a Supabase migration, or anything in the
"Active known issues" list in project memory — it does not belong in an
unattended run, full stop, regardless of how confident the task looks.
