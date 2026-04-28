# /review — Camel Ranch Booking Platform Deep Code Review Skill

## Purpose
Four-angle deep code review of the Camel Ranch Booking Platform. Read this entire file before starting. Run all 4 angles. Score every finding — only report findings with ≥ 80 confidence. Fix issues found. Generate `CODE_REVIEW_REPORT.md`. Push to main.

---

## Confidence Scoring
Every finding gets a 0–100 confidence score:
- **100** — Definite bug, wrong value, or security hole with direct evidence
- **90–99** — Almost certain issue, clear code path to the problem
- **80–89** — Very likely issue, strong evidence but minor ambiguity
- **< 80** — Do NOT report. Not worth fixing without more certainty.

Only report and fix findings ≥ 80 confidence.

---

## ANGLE 1 — Security & Auth (weight: critical)

### What to check
1. **RLS bypass** — Any query using the service client (`getServiceClient()`) that should be checking user ownership. Service client bypasses RLS — every use must have manual auth validation.
2. **Auth token validation** — Every API route must validate the Bearer token via `service.auth.getUser(token)` before performing any action.
3. **Role enforcement** — `<AppShell requireRole="...">` must be set on every page. Members must never see agent or financial data.
4. **Superadmin guard** — The superadmin role must NEVER be changed by a normal user or API call.
5. **Input injection** — Any user input passed to Supabase `.or()`, `.filter()`, or raw SQL must be sanitized. Commas and parentheses in PostgREST `.or()` filters will break queries or could be exploited.
6. **Environment secrets** — API keys must come from `process.env` or `getSetting()`, never hardcoded.
7. **HTTP method guards** — Every API route must check `req.method` and return 405 for unsupported methods.

### Red flags
- `getServiceClient()` used without checking user identity first
- API routes that read `req.body` without auth check
- `.or()` filter with raw `${userInput}` interpolation
- Any page missing `requireRole` on AppShell

---

## ANGLE 2 — Data Integrity & Business Logic (weight: high)

### What to check
1. **Tour confirmation atomicity** — `tour_venues.status = 'confirmed'` must ONLY be set AFTER a `bookings` row is successfully inserted. If booking insert fails, venue must not be marked confirmed.
2. **Financial calculations**
   - Earned = `actual_amount_received` on `status='completed'` bookings ONLY
   - Potential = `agreed_amount` on `status='confirmed'` future bookings ONLY
   - Never mix these up
3. **Enum correctness**
   - `payment_status`: only `pending | partial | received | waived` — never `settled`
   - `booking_status`: only `pitch | followup | negotiation | hold | contract | confirmed | advancing | completed | cancelled`
4. **Orphaned records** — Check for `tour_venues` with `status='confirmed'` that have no corresponding `bookings` row.
5. **Cascading deletes** — When a booking is deleted, check social_queue, email_logs, expenses rows that reference it.
6. **Unbounded queries** — Any `supabase.from(...).select(...)` without `.limit()` on a table that could grow large.

### Queries to run against the DB
```sql
-- Orphaned confirmed tour_venues
SELECT tv.id, v.name, t.name as tour
FROM tour_venues tv
JOIN venues v ON v.id = tv.venue_id
JOIN tours t ON t.id = tv.tour_id
WHERE tv.status = 'confirmed'
  AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.venue_id = tv.venue_id AND b.tour_id = tv.tour_id AND b.status = 'confirmed');

-- Invalid payment_status values
SELECT id, payment_status FROM bookings WHERE payment_status NOT IN ('pending','partial','received','waived') AND payment_status IS NOT NULL;
```

---

## ANGLE 3 — Performance & Scalability (weight: medium)

### What to check
1. **N+1 queries** — Any loop that makes a Supabase call per iteration (e.g., `for (const item of items) { await supabase... }`). Batch these with `.in()`.
2. **Missing limits** — `supabase.from('venues').select('*')` without `.limit()` — add `.limit(500)`.
3. **Missing limits on users/bookings/tour_venues** — same issue.
4. **Waterfall fetches** — Sequential `await` calls that could run in parallel with `Promise.all()`.
5. **Large file sizes** — Any page component over 800 lines is a candidate for splitting.
6. **Unnecessary re-fetches** — `loadAll()` called multiple times in quick succession without debouncing.
7. **useCallback/useMemo** — Supabase query functions inside `useEffect` that recreate on every render.

### Specific known hotspots
- `tours/[id].tsx` (~1275 lines) — candidate for splitting
- `email/index.tsx` (~1032 lines) — candidate for splitting
- `venues/index.tsx` — bulk email enrichment loop hits scrape API per venue sequentially

---

## ANGLE 4 — Code Quality & Maintainability (weight: low)

### What to check
1. **TypeScript `any` overuse** — Every `as any` cast should be reviewed. Can it be typed properly?
2. **Duplicate logic** — Same query or computation in multiple pages/components. Should be extracted to a hook or utility.
3. **Error handling gaps** — API routes that don't handle errors from Supabase operations (missing `if (error) return res.status(500)`).
4. **Dead code** — Imports, state variables, or functions that are never used.
5. **Magic strings** — Status values hardcoded in UI instead of using shared constants from `lib/types.ts`.
6. **Missing loading states** — Forms/buttons that can be double-submitted because `disabled` is not set during async operations.
7. **Missing error display** — User actions that fail silently with no error message shown.

---

## OUTPUT

After completing all 4 angles, generate `CODE_REVIEW_REPORT.md`:

```markdown
# Code Review Report
**Date:** [today]
**TypeScript:** ✅ 0 errors
**Total findings:** N (X critical, Y high, Z medium, W low)
**Fixed:** N findings

## Findings

### [CRITICAL/HIGH/MEDIUM/LOW] — [Title]
**File:** `path/to/file.ts:line`
**Confidence:** 95
**Issue:** [description]
**Fix:** [what was changed]

...
```

Only include findings with confidence ≥ 80.

Then:
```bash
npx tsc --noEmit
git add -A
git commit -m "review: [summary of fixes from code review]"
git push origin main
```
