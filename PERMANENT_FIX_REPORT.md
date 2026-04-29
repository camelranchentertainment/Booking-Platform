# Permanent Booking System Fix Report

Date: 2026-04-29  
Author: Claude Code (automated fix)

---

## Root Cause

Venues added to a tour's outreach pool (`tour_venues`) were **never mirrored into the `bookings` pipeline**. The `pages/api/tours/venues.ts` POST handler inserted a `tour_venue` row but never created a corresponding `bookings` record. Similarly, the PATCH handler updated outreach status without propagating the change to `bookings`.

This meant:

- All pitch/follow-up stage tour venues existed only in `tour_venues`, invisible to the bookings pipeline, dashboard stats, calendar, and band portal
- `pages/api/email/send.ts` created a booking on cold pitch if `venueId` was passed, but **skipped it when `tourVenueId` was the context** (tour-email flow)
- `pages/tours/[id].tsx` CONFIRMED SHOWS panel listed **all** bookings regardless of status — once pitch-stage bookings were added with `tour_id`, they would pollute the confirmed panel

---

## Database State (before fix)

| Table | Record | Status |
|-------|--------|--------|
| `tour_venues` | Rude Dog Pub | target |
| `tour_venues` | Dogwood Social House Cape Girardeau | target |
| `bookings` | (Rude Dog Pub) | **missing** |
| `bookings` | (Dogwood Social House) | **missing** |

4 existing bookings (Wire Road, Cuzzin's, Midway Events Center, Sikeston Jaycee Rodeo) were already correct — they were created via the confirm-show flow which always wrote to `bookings`.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/bookingQueries.ts` | Added `syncTourVenueToBooking()` — creates or updates the booking record mirroring a tour_venue |
| `pages/api/tours/venues.ts` | POST: calls `syncTourVenueToBooking` after insert; PATCH: calls it after status update |
| `pages/api/email/send.ts` | Calls `syncTourVenueToBooking` after any email-driven `tour_venue` status change |
| `pages/tours/[id].tsx` | CONFIRMED SHOWS panel: filters display to `confirmed/advancing/completed` only |

---

## `syncTourVenueToBooking` — Status Mapping

| tour_venues status | bookings status |
|-------------------|----------------|
| target | pitch |
| pitched | pitch |
| follow_up / followup | followup |
| negotiating | negotiation |
| confirmed | confirmed |
| declined | cancelled |

The function is idempotent — safe to call on every insert/update. If a booking already exists (non-completed, non-cancelled), it updates the status. If no booking exists and the new status isn't cancelled, it inserts one with `source = 'tour'` and `details_pending = true`.

---

## Data Fix Applied

```sql
INSERT INTO bookings (act_id, venue_id, tour_id, status, source, created_by, show_date, details_pending)
SELECT t.act_id, tv.venue_id, tv.tour_id, 'pitch', 'tour', t.created_by, t.end_date, true
FROM tour_venues tv
JOIN tours t ON t.id = tv.tour_id
WHERE tv.id IN (
  '93308d3e-aafe-4e6d-a128-9eb30a73539f',  -- Rude Dog Pub
  'eb1c4a49-c336-4735-8045-1193ee95d60d'   -- Dogwood Social House
)
AND NOT EXISTS (
  SELECT 1 FROM bookings b
  WHERE b.venue_id = tv.venue_id AND b.tour_id = tv.tour_id AND b.act_id = t.act_id
);
```

**Result:** 2 rows inserted — Rude Dog Pub (`7335ae5b`) and Dogwood Social House (`957bc17c`), both status=`pitch`, tour=Midwest 2026.

---

## Booking Count After Fix

| Status | Venues |
|--------|--------|
| pitch | Rude Dog Pub, Dogwood Social House Cape Girardeau |
| confirmed | Wire Road Brewing Company, Cuzzin's Sports Bar & Grill, Midway Events Center, Sikeston Jaycee Bootheel Rodeo |

Total: **6 bookings** in pipeline. Dashboard, bookings list, calendar, and band portal will all display these correctly via `getAgentBookings` / `getBandBookings` (which were already correct).

---

## Where Sync Is Now Called

1. **`POST /api/tours/venues`** — venue added to outreach pool → booking created at `pitch`
2. **`PATCH /api/tours/venues`** — status updated in pool → booking status updated
3. **`POST /api/email/send`** — email sent and tour_venue status changes → booking synced

---

## CONFIRMED SHOWS Panel Fix

**Before:** `bookings.map(...)` — rendered all bookings for the tour regardless of status  
**After:** `bookings.filter(b => ['confirmed','advancing','completed'].includes(b.status)).map(...)` — only shows booked/advancing/completed entries; pitch and follow-up stage entries stay in the outreach pool only

---

## Build Status

- TypeScript: **0 errors**
- Next.js build: **compiled successfully**
- Commit: `c4563ef` pushed to `main`
