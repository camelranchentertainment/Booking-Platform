# System Fix Report
Date: 2026-04-29

## Venues IN DB Mismatch

**Root cause:** `pages/api/venues/prospect.ts` used `getServiceClient()` (bypasses RLS) to query venues for the "IN DB" detection check, but applied NO `agent_id` filter. This caused venues owned by ANY other agent in the database to show up as "already in your database" in the Google Discovery results — even though those venues were invisible in the venues list (which correctly respects RLS and only shows venues owned by the current user).

Specifically, The Honky Tonk STL, Old Rock House, and Off Broadway exist in the DB under `agent_id = grueneroadcases@gmail.com` and `agent_id = jake@camelranchbooking.com` — not the current user — causing false "IN DB" badges.

**Fix applied:**
1. `pages/api/venues/prospect.ts` — added `.eq('agent_id', user.id)` to the existing venues query so "IN DB" only marks venues the current agent actually owns.
2. New `pages/api/venues/list.ts` — service-client API route that returns owned venues UNION venues linked to the agent's tours (via `tour_venues` → `tours.created_by`).
3. `pages/venues/index.tsx` `loadVenues()` — now calls `/api/venues/list` instead of querying Supabase directly, so tour-linked venues from other agents are visible.

**Venues now accessible:** All owned venues + any venues linked to the agent's tours.

---

## Booking Query System

**lib/bookingQueries.ts:** Already existed from previous session — confirmed present with all helpers.

**Files using helpers (verified):**
- `pages/dashboard.tsx` ✓ — getAgentActIds + getAgentBookings
- `pages/bookings/index.tsx` ✓ — getAgentActIds + getAgentActs + getAgentBookings
- `pages/calendar.tsx` ✓ — getAgentActIds + getAgentActs
- `pages/today.tsx` ✓ — getAgentActIds
- `pages/history.tsx` ✓ — getAgentActIds + getAgentActs + manual OR query
- `pages/financials.tsx` ✓ — getAgentActIds
- `pages/band/index.tsx` — Updated to use getBandBookings() for main booking query

**Booking counts:** Correct — all pages use act_id union created_by filtering.

---

## Data Integrity

**Bookings with null act_id:** 0 — no fix needed.

**Wire Road Brewing Company booking:** VERIFIED ✓
- ID: 0a29d693-da9d-4931-9bec-daa50a3d5140
- Act: Jake Stringer & Better Than Nothin
- Date: 2026-06-03, Status: confirmed

**Cuzzin's Sports Bar & Grill booking:** VERIFIED ✓
- ID: 94b3c592-f2dc-4752-acea-48aa6cd22e6f
- Act: Jake Stringer & Better Than Nothin
- Date: 2026-06-05, Status: confirmed

---

## Financials Fixes (Review Skill — Bug Detection)

All issues found with confidence ≥ 85:

| Issue | File:Line | Confidence | Fixed |
|---|---|---|---|
| Monthly expenses used `b.expenses` (per-booking column) instead of expenses table | financials.tsx:148 | 95 | YES |
| Detail tab "Paid" used `b.amount_paid` (legacy) instead of `actual_amount_received` | financials.tsx:365 | 95 | YES |
| Tours dropdown had no user filter — showed all users' tours | financials.tsx:70 | 90 | YES |
| `showCount` counted any booking with a show_date including pitches | financials.tsx:138 | 90 | YES |
| CSV export used wrong field names (fee/amount_paid instead of agreed/actual) | financials.tsx:183 | 85 | YES |
| All Bookings rows had no link to booking detail | financials.tsx:353 | 80 | YES |

**Monthly expenses fix:** Expenses are now bucketed from the `expenses` state (fetched from expenses table via `/api/expenses`) by `expense_date` month+year, replacing the per-booking `b.expenses` column which was unreliable/empty.

**showCount fix:** Now `['confirmed', 'advancing', 'completed']` — matches the platform's definition of "booked shows" vs pipeline entries.

---

## Review Skill Findings (Angle 2 — Bug Detection)

Additional bugs found and fixed:
- `pages/api/venues/list.ts` (new): uses service client with explicit user auth check, no data leakage between agents
- All new/modified API routes validated token and return 401 on failure
- TypeScript: `npx tsc --noEmit` — 0 errors

---

## Remaining Issues

- The `supabaseUrl is required` error during `npm run build` in the codespace is a pre-existing env var issue (NEXT_PUBLIC_SUPABASE_URL not set in this dev environment). Vercel production builds are unaffected — env vars are set in Vercel dashboard.
- Venues owned by other agents that are linked to the current agent's tours are now visible in the venues list but are read-only (the current agent cannot edit them). This is expected behavior.
