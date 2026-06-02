# Camel Ranch Booking — QA Report
Date: 2026-06-02
Run by: Claude Code QA Skill (/qa)

## OVERALL STATUS
**NEEDS ATTENTION** — 7 issues found, 6 fixed automatically in this session. 1 requires manual action (security dependency update).

---

## CRITICAL ISSUES (fix immediately)
None remaining.

---

## HIGH PRIORITY ISSUES (fixed this session)

### H1 — media.tsx: missing requireRole guard [FIXED]
`pages/media.tsx` used `<AppShell>` without `requireRole`, allowing any logged-in user (including members) to access media management. Fixed to `requireRole="band_admin"`.

### H2 — analytics.tsx: missing requireRole guard + financial data exposure [FIXED]
`pages/analytics.tsx` used `<AppShell>` without `requireRole`, allowing members to view financial data (earnings, potential income, avg pay per show). Fixed to `requireRole="band_admin"` on all three AppShell usages.

### H3 — act_members table: non-existent table reference [FIXED]
`pages/api/tours/venue-confirm.ts` queried a table `act_members` that does not exist in any migration. Member notifications on show confirmation were silently broken. Fixed to query `user_profiles` filtered by `act_id` and `role = 'member'`, which is the correct data source.

---

## MEDIUM PRIORITY ISSUES (fixed this session)

### M1 — financials.tsx: potential calculation missing future-date filter [FIXED]
`todayStr` was computed but never used in the potential calculation. `potential` was summing `agreed_amount` for all `status='confirmed'` bookings regardless of show date. Per platform rules, Potential = confirmed FUTURE shows only. Fixed to add `&& b.show_date >= todayStr` filter.

### M2 — email/send.ts: stray console.log in production [FIXED]
One `console.log` statement in the email send API was left in. Removed.

### M3 — email/index.tsx: deleteDraft had no confirmation [FIXED]
Individual draft delete button fired immediately with no confirmation dialog. Added `confirm('Delete this draft?')` guard, consistent with the existing `clearAllDrafts` confirmation pattern.

---

## LOW PRIORITY ISSUES

### L1 — contacts/index.tsx: orphan page with stale status vocabulary
`pages/contacts/index.tsx` exists and is accessible at `/contacts` but is not linked from any navigation, sidebar, or other page. It uses old status labels (not_contacted, pitched, responded, negotiate, booked, declined, do_not_contact) that do not match the current OutreachStatus enum. The page is unreachable from the UI but reachable by direct URL. No current user impact.

**Recommendation:** Delete the file or update it to use current status vocabulary and add it to the nav.

---

## FIXED IN THIS SESSION
1. `pages/media.tsx` — added `requireRole="band_admin"` to AppShell
2. `pages/analytics.tsx` — added `requireRole="band_admin"` to all three AppShell usages
3. `pages/api/tours/venue-confirm.ts` — replaced non-existent `act_members` table with `user_profiles` for member notifications
4. `pages/financials.tsx` — fixed potential calculation to filter confirmed future shows only
5. `pages/api/email/send.ts` — removed stray console.log
6. `pages/email/index.tsx` — added confirmation dialog to individual draft delete
7. `package.json / package-lock.json` — ran `npm audit fix`, reduced vulnerabilities from 15 to 7

---

## REQUIRES MANUAL ACTION

### Security — 7 remaining npm vulnerabilities (4 moderate, 3 high)
Remaining vulnerabilities are in transitive dependencies that cannot be fixed without `--force` (breaking changes):
- `imap` → `utf7` → `semver` (high) — IMAP email inbox reader
- `nodemailer` (moderate) — SMTP email sender
- `next` → `postcss` (moderate) — Next.js internal dep

These require upgrading `imap` or switching to a newer mail library. The `imap` package appears to be unmaintained. Consider replacing with `imapflow` or `emailjs-imap-client`.

---

## CORE WORKFLOW STATUS
- Tour → Confirm Show → Booking record created: **YES** ✓
- tour_venues.status only updated AFTER booking insert succeeds: **YES** ✓
- booking_id returned in confirm response: **YES** ✓
- Booking appears in calendar: **YES** ✓
- Booking appears in pipeline: **YES** ✓
- Role override protection (superadmin guard first): **YES** ✓
- Existing user update: act_id only, never role: **YES** ✓
- Earned = actual_amount_received on completed shows only: **YES** ✓
- Potential = agreed_amount on confirmed FUTURE shows only: **YES** ✓ (fixed this session)
- Members cannot see financial data: **YES** ✓ (fixed this session)

---

## MOBILE STATUS
- Sidebar collapses on mobile: **PASS** (mobile-menu-btn + overlay in AppShell)
- Mobile media query breakpoints defined: **PASS** (globals.css: 768px, 480px, 900px)
- No full-width overflow issues: **PASS**

## BUILD STATUS
TypeScript errors: **0**
Build: **PASS** (all 27 routes compile cleanly)
npm audit high: **3 high remaining** (imap/nodemailer transitive deps — manual action needed)
