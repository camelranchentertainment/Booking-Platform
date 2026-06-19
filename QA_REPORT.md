# QA Report — 2026-06-19

Run by: Claude Code `/qa`

## Overall Status: ✅ PASS (3 issues fixed)

| Check | Result |
|---|---|
| 1. TypeScript compilation | ✅ PASS |
| 2. No hardcoded user/act IDs or emails | ✅ PASS |
| 3. DB queries scoped to act_id | ✅ PASS |
| 4. Loading states have try/catch/finally | ✅ FIXED |
| 5. No user_profiles references | ✅ FIXED (2 occurrences) |
| 6. No window.alert / window.confirm | ✅ PASS |
| 7. Changed features work as expected | ✅ PASS |
| 8. No regressions in other features | ✅ PASS — 79/79 tests passing |

---

## Findings & Fixes

### [FIXED] Check 5 — `user_profiles` in `pages/api/email/send.ts:90`

**Severity:** Medium
**Issue:** Query used `.from('user_profiles')` — wrong table name. The platform uses `profiles`.
Consequence: email send path would fail to resolve the band admin reply-to email, silently dropping the `Reply-To` header.
**Fix:** Changed to `.from('profiles')`.

---

### [FIXED] Check 5 — `user_profiles` in `components/layout/AppShell.tsx:126`

**Severity:** Medium
**Issue:** `acceptInvite()` queried `user_profiles` to fetch `display_name` before posting to `/api/accept-invite`. Wrong table name returns null, sending an empty `displayName` in the invite acceptance payload.
**Fix:** Changed to `.from('profiles')`.

---

### [FIXED] Check 4 — Missing try/finally in `VenueDrawer.tsx` `load()`

**Severity:** Medium
**Issue:** `setLoading(true)` was called at function entry but `setLoading(false)` was only reached at the bottom of the happy path. Any Supabase network error or uncaught exception would leave the drawer in a permanent loading/spinner state.
**Fix:** Wrapped the entire function body in `try { ... } finally { setLoading(false); }` and removed the manual early-exit `setLoading(false)` inside the `!user` guard.

---

## Check Details

### Check 2 — Hardcoded emails (not a violation)
Platform sender addresses (`bookings@camelranchbooking.com`, `no-reply@camelranchbooking.com`) appear in `pages/api/email/send.ts`, `pages/api/invites/send.ts`, and `pages/index.tsx`. These are legitimate platform domain emails used as Resend sender addresses, not hardcoded user or act data. No action required.

The iCal UID suffix `@camelranchbooking.com` in `lib/ical.ts` is an RFC 5545-required domain component for event UID uniqueness. No action required.

### Check 3 — DB query scoping
All `bookings`, `acts`, and `venues` queries in `pages/api` and `lib` reviewed. API endpoints that list or mutate user-owned records consistently scope by `act_id` derived from the authenticated user's session profile. Public endpoints (`pages/api/public/acts.ts`) intentionally omit act_id scoping by design.

### Check 4 — Loading state audit (19 files)
All files with `setLoading(true)` reviewed:
- `pages/analytics.tsx` — ✅ try/catch/finally
- `pages/band/calendar.tsx` — ✅ try/catch/finally
- `pages/band/index.tsx` — ✅ try/catch/finally (multiple blocks)
- `pages/bookings/index.tsx` — ✅ try/catch/finally
- `pages/financials.tsx` — ✅ try/catch/finally
- `pages/history.tsx` — ✅ try/catch/finally
- `pages/today.tsx` — ✅ try/catch/finally
- `components/VenueDrawer.tsx` — ✅ FIXED (was missing)
- All remaining files — ✅ no bare setLoading without protection

---

## Test Results

```
Test Suites: 7 passed, 7 total
Tests:       79 passed, 79 total
Snapshots:   0 total
```

TypeScript: `tsc --noEmit` — exit 0, no errors.
