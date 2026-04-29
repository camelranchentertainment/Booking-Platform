# Status Sync Report
Date: 2026-04-29
Branch: main

---

## Problem

`tour_venues.status` and `bookings.status` were maintained by separate code paths with no reverse sync. Moving a booking through the Kanban pipeline (bookings/index.tsx) had no effect on the corresponding tour_venue. Sending an email with category `follow_up_*` wrote `status = 'follow_up'` to tour_venues, violating the check constraint (`followup` is the valid value — no underscore).

---

## Part 1 — DB Sync

Ran UPDATE to reconcile tour_venues from bookings (bookings as source of truth):

| Venue | tv_status (before) | booking_status | tv_status (after) | Result |
|---|---|---|---|---|
| Dogwood Social House | target | pitch | target | ✓ mapped (pitch→target, no change) |
| Rude Dog Pub | target | followup | followup | ✓ fixed |

No orphaned bookings (NULL venue_id or missing venue) found.

---

## Part 2 — `lib/statusSync.ts` (new file)

Single source of truth for all status transitions. Exports:

### Maps
| Export | Purpose |
|---|---|
| `TOUR_VENUE_TO_BOOKING_STATUS` | OutreachStatus → BookingStatus |
| `BOOKING_TO_TOUR_VENUE_STATUS` | BookingStatus → OutreachStatus (partial — no mapping for hold/contract=booking-only concepts) |
| `STATUS_LABELS` | Human-readable labels for all statuses (booking + outreach) |
| `STATUS_COLORS` | Hex color for all statuses (booking + outreach) |

### TOUR_VENUE_TO_BOOKING_STATUS
| tv status | booking status |
|---|---|
| target | pitch |
| pitched | pitch |
| followup | followup |
| negotiating | negotiation |
| confirmed | confirmed |
| declined | cancelled |

### BOOKING_TO_TOUR_VENUE_STATUS
| booking status | tv status |
|---|---|
| pitch | target |
| followup | followup |
| negotiation | negotiating |
| hold | negotiating |
| contract | negotiating |
| confirmed | confirmed |
| advancing | confirmed |
| completed | confirmed |
| cancelled | declined |

### Functions
| Function | Description |
|---|---|
| `syncBooking(sb, tourVenueId, userId)` | Reads current tv status, creates/updates mirrored booking. Safe to call after tv is already updated. |
| `updateVenueStatus(sb, tourVenueId, newStatus, userId, extra?)` | Updates tv.status + syncs booking. Atomic. |
| `updateBookingStatus(sb, bookingId, newStatus)` | Updates booking.status + syncs back to tour_venue if booking has tour_id. |

---

## Part 3 — Updated Status Change Points

### `pages/api/tours/venues.ts`
- **Removed** `syncTourVenueToBooking` import from bookingQueries
- **Added** `syncBooking` import from statusSync
- POST handler: `syncTourVenueToBooking` → `syncBooking`
- PATCH handler: `syncTourVenueToBooking` → `syncBooking`

### `pages/api/tours/venue-confirm.ts`
- **Added** `updateVenueStatus` import from statusSync
- Line 359: `service.from('tour_venues').update({ status: 'confirmed' })` → `updateVenueStatus(service, tour_venue_id, 'confirmed', user.id)`

### `pages/api/email/send.ts`
- **Replaced** `syncTourVenueToBooking` import with `updateVenueStatus` from statusSync
- **Fixed bug:** `tvUpdate.status = 'follow_up'` → `newTvStatus = 'followup'` (removed underscore that violated the tour_venues check constraint)
- Step 2 block now calls `updateVenueStatus(service, tourVenueId, newTvStatus, agentId, tvExtra)`

### `pages/api/bookings/move-status.ts` (new file)
- New API endpoint: `POST /api/bookings/move-status`
- Accepts `{ bookingId, status }`, calls `updateBookingStatus()`
- Now the Kanban drag → booking update → tour_venue sync flows correctly

### `pages/bookings/index.tsx`
- `moveStatus()` now calls `/api/bookings/move-status` instead of direct Supabase update
- Booking status change now propagates back to tour_venues

---

## Part 4 — Dashboard (Agent)
No changes needed. Dashboard uses `getAgentActIds` + `getAgentBookings` from bookingQueries — reads bookings.status which is now kept in sync.

---

## Part 5 — Calendar Date Grid
No changes needed. Date matching was already correct (`show_date.substring(0,10)` vs YYYY-MM-DD string).

---

## Part 6 — STATUS_LABELS / STATUS_COLORS Imports

| File | Change |
|---|---|
| `pages/calendar.tsx` | Removed inline `STATUS_DOT` const; imports `STATUS_COLORS` from statusSync |
| `pages/band/calendar.tsx` | Same |
| `pages/tours/[id].tsx` | Removed local `type OutreachStatus` and `STATUS_LABELS` const; imports both from lib/types and lib/statusSync |
| `pages/email/index.tsx` | No changes needed (uses `EMAIL_STATUS_COLOR` for log statuses only) |
| `pages/bookings/index.tsx` | No changes needed (uses `BOOKING_STATUS_LABELS` from types which remains valid) |

---

## Bug Fixed

**`pages/api/email/send.ts` line 90** — was writing `status = 'follow_up'` to tour_venues, which violates the check constraint:
```
CHECK (status = ANY (ARRAY['target','pitched','followup','negotiating','confirmed','declined']))
```
The correct value is `'followup'` (no underscore). Fixed by routing through `updateVenueStatus` with `newTvStatus = 'followup'`.

---

## Final Verification

### DB sync check:
| Venue | tv_status | booking_status | Sync |
|---|---|---|---|
| Dogwood Social House | target | pitch | ✓ mapped |
| Rude Dog Pub | followup | followup | ✓ same |

### TypeScript: 0 errors
### Files changed: 8
### Files created: 3

---

## Files Changed

| File | Change |
|---|---|
| `lib/statusSync.ts` | NEW — maps, STATUS_LABELS, STATUS_COLORS, syncBooking, updateVenueStatus, updateBookingStatus |
| `pages/api/bookings/move-status.ts` | NEW — API endpoint for booking status moves with tv sync |
| `pages/api/tours/venues.ts` | syncTourVenueToBooking → syncBooking |
| `pages/api/tours/venue-confirm.ts` | Direct tv update → updateVenueStatus |
| `pages/api/email/send.ts` | Direct tv update + syncTourVenueToBooking → updateVenueStatus; fixed follow_up bug |
| `pages/bookings/index.tsx` | moveStatus() → calls /api/bookings/move-status |
| `pages/calendar.tsx` | STATUS_DOT local const → STATUS_COLORS from statusSync |
| `pages/band/calendar.tsx` | STATUS_DOT local const → STATUS_COLORS from statusSync |
| `pages/tours/[id].tsx` | Local OutreachStatus type + STATUS_LABELS → imports from lib |
