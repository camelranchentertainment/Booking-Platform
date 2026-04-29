# Camel Ranch Booking — QA Report
Date: 2026-04-28
Run by: Claude Code QA Skill (/qa)

## OVERALL STATUS
NEEDS ATTENTION — 2 issues fixed automatically; 1 dependency concern requires manual review.

---

## CRITICAL ISSUES (fix immediately)
None remaining after fixes applied in this session.

---

## HIGH PRIORITY ISSUES
None.

---

## MEDIUM PRIORITY ISSUES

### M1 — `pages/api/email/ai-draft.ts` missing auth (FIXED)
The AI email drafting endpoint had no authentication. Any unauthenticated caller could consume the platform's Anthropic API quota and read act/venue/booking data. Fixed by adding Bearer token check matching the pattern used by all other email API routes.

---

## LOW PRIORITY ISSUES

### L1 — `email_logs` typo in venue-confirm.ts (FIXED)
`pages/api/tours/venue-confirm.ts` was inserting into `email_logs` (plural) while the actual table is `email_log` (singular). This caused venue confirmation email sends to silently fail to log. Fixed.

### L2 — `pages/contacts/index.tsx` not linked from any nav
The contacts page exists and is auth-guarded (`requireRole="agent"`) but is not linked from any navigation. Users cannot reach it from the sidebar. **INFO** — likely intentional, but flag for review.

### L3 — Email draft deletes without confirmation
`email/index.tsx` and `band/email.tsx` delete email drafts without a confirmation prompt. Drafts can be generated again so this is low risk, but worth adding a toast-undo or brief confirmation for UX polish.

### L4 — npm audit: high-severity findings in minimatch and Next.js
- `minimatch` 9.0.0–9.0.6: ReDoS (build-time dep only, low runtime risk)
- `next` >=9.3.4: Multiple DoS CVEs flagged — run `npm audit` to verify if v16.1.3 is patched
- Run `npm audit fix` to resolve what can be auto-fixed. Upgrade Next.js if a patched version is available.

---

## FIXED IN THIS SESSION

1. **CRITICAL SECURITY — `ai-draft.ts` auth gap**: Added `Authorization: Bearer` token validation before any database reads or Anthropic API calls.
2. **BUG — `email_logs` typo**: Fixed `venue-confirm.ts` to write to `email_log` (matching the rest of the codebase).

---

## REQUIRES MANUAL ACTION

- Run `npm audit fix` to patch `brace-expansion`, `follow-redirects`, `minimatch`
- Review whether Next.js 16.1.3 has the DoS patches listed in `npm audit`
- Decide whether `/contacts` should be linked from the agent sidebar

---

## CORE WORKFLOW STATUS

- Tour → Confirm Show → Booking record created: **YES**
- Booking appears in calendar: **YES**
- Booking appears in pipeline: **YES**
- Role override protection active: **YES**
- Earned vs Potential correctly split: **YES**

---

## ROUTING STATUS

All 12 agent nav routes, 9 band nav routes, and 3 member nav routes resolve to existing page files. No broken links found.

---

## AUTH GUARD STATUS

Every page requires AppShell with appropriate `requireRole`:
- Agent pages: `requireRole="agent"` ✓
- Band pages: `requireRole="act_admin"` ✓
- Member pages: `requireRole="member"` ✓
- Admin page: manual `role === 'superadmin'` check + redirect ✓
- All `/api/admin/*` routes: `getAuthedSuperadmin()` ✓

---

## MOBILE STATUS

- Sidebar: collapses on mobile with hamburger button ✓
- Stat cards: 2-up grid on mobile (`@media (max-width: 768px)`) ✓
- Fixed widths: only CSS variable `--sidebar-width: 240px` (handled by media query)
- Tables: `min-width: 480px` in globals.css — can scroll horizontally on mobile ✓

---

## BUILD STATUS

TypeScript errors: **0**
Build: **PASS** (pre-flight confirmed clean)
