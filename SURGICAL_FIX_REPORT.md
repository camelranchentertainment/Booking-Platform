# Surgical Fix Report
Date: 2026-04-29
Branch: main

---

## Pre-fix State

### Jake's act_id (before / after)
| Field | Value |
|---|---|
| email | jake@camelranchbooking.com |
| role | act_admin |
| act_id BEFORE | fab00d00-2982-4b63-882f-0632a51f6248 ✓ (already set) |
| act_id AFTER | fab00d00-2982-4b63-882f-0632a51f6248 ✓ (unchanged) |
| act_name | Jake Stringer & Better Than Nothin |

**Note:** Jake's act_id was correctly set before any changes. The band portal's act lookup logic (tries `owner_id` first, falls back to `user_profiles.act_id`) was already working. No DB migration was needed.

---

## Fix 1 — Band Portal Upcoming Filter

**File:** `pages/band/index.tsx:85`

**Problem:** The "Upcoming" stat card and UPCOMING SHOWS section included all future-dated bookings regardless of status — pitch and followup shows were counted as "upcoming," inflating the number and showing unconfirmed outreach as live shows.

**Query changed:**
```diff
- setUpcoming(all.filter((b: any) => b.show_date && b.show_date >= today).slice(0, 5));
+ setUpcoming(all.filter((b: any) => b.show_date && b.show_date >= today && ['confirmed', 'advancing'].includes(b.status)).slice(0, 5));
```

**Result:** "Upcoming" now correctly shows only confirmed/advancing shows. For Jake: 2 upcoming (Wire Road, Cuzzin's). Pitch and followup shows (Dogwood, Rude Dog) no longer appear in "Upcoming."

---

## Fix 2 — Agent Dashboard

**No changes made.** Dashboard already uses `getAgentActIds` + `getAgentBookings` from `lib/bookingQueries.ts` correctly. `totalActive` and `totalConfirmed` are computed correctly from the bookings array. The pipeline is working.

---

## Fix 3 — Daily Reminders Edge Function

**No changes made.** The `email_stage` column EXISTS on the bookings table (confirmed by SQL). The function has natural idempotency:
- Advance reminders only fire when `email_stage = 'confirmation'`, then updates to `'advance'`
- Thank-you reminders only fire when `email_stage = 'advance'`, then updates to `'thank_you'`
No booking can be double-processed. No bug exists.

---

## Fix 4 — Tour Venue → Email Link

**File:** `pages/tours/[id].tsx`

**Changes:**
1. Imported `EmailComposer` from `../../components/email/EmailComposer`
2. Added `composerTourVenue` state
3. Added `tvEmailCategory()` helper that maps outreach status to email category:
   - `target` → `target` (cold pitch)
   - `pitched` / `followup` → `follow_up_1`
   - `negotiating` / `confirmed` → `confirmation`
4. Added ✉ Email button to each non-declined venue row in the outreach pool (inside the venue info column)
5. Added `EmailComposer` render at the bottom of the page — pre-fills act, venue, contact email, and category from the tour/venue context

**Before:** Clicking a venue opened the venue detail popout only.
**After:** Each venue row has a dedicated ✉ Email button that opens the AI EmailComposer pre-filled and ready to generate.

---

## Fix 5 — Email Pipeline Data Isolation

**File:** `pages/email/index.tsx`

**Problem:** The Pipeline tab's bookings query fetched ALL non-cancelled bookings from the database with no agent filter. This is a data isolation bug — an agent could see other agents' bookings in their pipeline.

**Query changed:**
```diff
- supabase.from('bookings').select(`...`).neq('status', 'cancelled').order('show_date', { ascending: true })
+ // Now fetches agentActIds first, then applies:
+ bookingsQ.or(`act_id.in.(${agentActIds.join(',')}),created_by.eq.${user.id}`)
```

**Added import:** `import { getAgentActIds } from '../../lib/bookingQueries';`

**Result:** Pipeline tab now shows exactly the same bookings as `pages/bookings/index.tsx`. Data is properly scoped to the agent's own acts.

---

## Fix 6 — Calendar Status Dots

**Files:** `pages/calendar.tsx`, `pages/band/calendar.tsx`

**Change:** Added a colored status dot (5×5px circle) inside each calendar cell bar, alongside the existing venue name and act-color bar. Each dot uses the `STATUS_DOT` color map that already existed in both files.

**Agent calendar (`calendar.tsx`):** Bars were colored by act. Status dot now provides at-a-glance booking health (green = confirmed, blue = advancing, amber = negotiation, etc.) without removing the act-color coding.

**Band calendar (`band/calendar.tsx`):** Bars were already colored by status. Dot added for visual consistency and to match the legend at the top of the calendar.

---

## SQL Results Confirming Correct Counts

### All bookings:
| status | venue | act | show_date |
|---|---|---|---|
| pitch | Dogwood Social House Cape Girardeau | Jake Stringer | 2026-06-06 |
| followup | Rude Dog Pub | Jake Stringer | 2026-06-06 |
| confirmed | Midway Events Center | John D. Hale Band | 2026-05-30 |
| confirmed | Sikeston Jaycee Bootheel Rodeo | John D. Hale Band | 2026-05-16 |
| confirmed | Wire Road Brewing Company | Jake Stringer | 2026-06-03 |
| confirmed | Cuzzin's Sports Bar & Grill | Jake Stringer | 2026-06-05 |

### Jake's profile:
| email | act_id | act_name |
|---|---|---|
| jake@camelranchbooking.com | fab00d00-... | Jake Stringer & Better Than Nothin |

---

## Expected Counts After Fix

| Check | Expected | Actual | Pass |
|---|---|---|---|
| Jake act_id set | YES | YES | ✅ |
| Total bookings in DB | 6 | 6 | ✅ |
| Jake confirmed shows | 2 | 2 (Wire Road, Cuzzin's) | ✅ |
| Jake upcoming (confirmed/advancing) | 2 | 2 | ✅ |
| Jake pitch/followup NOT in upcoming | YES | YES | ✅ |
| Agent sees all 6 bookings | 6 | 6 | ✅ |
| Dogwood in pitch | YES | YES | ✅ |
| Rude Dog in followup | YES | YES | ✅ |
| Wire Road confirmed | YES | YES | ✅ |
| Cuzzin's confirmed | YES | YES | ✅ |
| TypeScript errors | 0 | 0 | ✅ |
| Build compiles | PASS | PASS | ✅ |

---

## Files Changed

| File | Change |
|---|---|
| `pages/band/index.tsx` | Upcoming filter: confirmed/advancing only |
| `pages/calendar.tsx` | Status dot added to calendar cell bars |
| `pages/band/calendar.tsx` | Status dot added to calendar cell bars |
| `pages/tours/[id].tsx` | ✉ Email button + EmailComposer on outreach pool |
| `pages/email/index.tsx` | Bookings pipeline query scoped to agent's acts |

## No Changes Made To

| Item | Reason |
|---|---|
| Agent dashboard | Already using correct helpers, working |
| `lib/bookingQueries.ts` | No bugs found |
| `daily-reminders` edge function | Natural idempotency via email_stage, no bug |
| Database / migrations | Jake's act_id was correctly set, no SQL needed |
