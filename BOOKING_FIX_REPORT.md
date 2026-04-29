# Booking Query System Fix
Date: 2026-04-29

## Root Cause

Two separate bugs combined to make bookings invisible:

### Bug 1 — Missing RLS Policy (Database)
There was no Row-Level Security policy allowing agents to access bookings via `acts.agent_id`. The existing policies only covered:
- `created_by = auth.uid()` — bookings the agent created directly
- `act_id IN (acts WHERE owner_id = auth.uid())` — bookings for acts the agent owns
- `agent_act_links` — linked agents
- `user_profiles.act_id` — band members

**Missing**: `act_id IN (acts WHERE agent_id = auth.uid())`

This meant Scott (agent) could not see the John D. Hale Band bookings that the band admin created, even though Scott is the primary agent (`acts.agent_id = Scott`).

### Bug 2 — Wrong Query Filters (Code)
Six pages used `created_by = user.id` to find bookings instead of filtering by the agent's acts. Tour-confirmed bookings and band-admin-created bookings were invisible on the agent dashboard, history, financials, calendar, and today pages.

## Files Changed

| File | Change |
|---|---|
| `lib/bookingQueries.ts` | NEW — shared booking query helper library |
| `pages/dashboard.tsx` | Replace `created_by` filter with `getAgentBookings` + `getAgentActIds` |
| `pages/bookings/index.tsx` | Replace manual act/booking queries with helper functions |
| `pages/calendar.tsx` | Replace manual act/booking queries with helper functions |
| `pages/history.tsx` | Replace `created_by` filter with act-based query + `getAgentActs` |
| `pages/today.tsx` | Replace `acts.agent_id` lookup with `getAgentActIds` (includes linked acts) |
| `pages/financials.tsx` | Add act-based filter to booking query (was unfiltered, relied on broken RLS) |
| `pages/tours/[id].tsx` | Fix CONFIRMED SHOWS count to only count confirmed/advancing/completed status |

## New Helper Functions (lib/bookingQueries.ts)

| Function | Purpose |
|---|---|
| `getAgentActIds(sb, userId)` | Returns all act IDs for agent: direct (`acts.agent_id`) + linked (`agent_act_links`) |
| `getAgentActs(sb, userId)` | Returns full act records for display in dropdowns/lists |
| `getAgentBookings(sb, userId, opts?)` | Fetches bookings for all agent acts + created_by, with optional filters |
| `getBandBookings(sb, actId, opts?)` | Fetches bookings for a specific act (band/member portal) |
| `getBookingCounts(sb, userId, actIds)` | Aggregated dashboard stats: pipeline, confirmed, earned, potential |

## Database Fix Applied

```sql
CREATE POLICY "bookings_primary_agent" ON bookings
  FOR ALL
  USING (
    act_id IN (SELECT id FROM acts WHERE agent_id = auth.uid())
  );
```

## Data Verification

All 4 bookings in the database have correct `act_id` set. No backfill required.

| Booking | Act | Agent owns via | Created by |
|---|---|---|---|
| Wire Road Brewing Co | Jake Stringer | acts.agent_id ✓ | Scott (agent) |
| Cuzzin's Sports Bar | Jake Stringer | acts.agent_id ✓ | Scott (agent) |
| Midway Events Center | John D. Hale Band | acts.agent_id ✓ | Band admin |
| Sikeston Jaycee Rodeo | John D. Hale Band | acts.agent_id ✓ | Band admin |

## Verification Counts (as agent Scott)

After fix, agent dashboard now shows:
- **Active Bands**: 2 (Jake Stringer + John D. Hale Band)
- **In Pipeline**: 4 bookings total (was showing 2 — missed the band-admin-created ones)
- **Confirmed Shows**: 4 (was showing 2)
- **Calendar**: all 4 bookings on correct dates
- **Pipeline page**: all 4 bookings across both acts
- **History**: all completed bookings across both acts
- **Financials**: all bookings in date range across both acts

## Tour Detail Fix

`pages/tours/[id].tsx` CONFIRMED SHOWS count previously showed ALL booking statuses (including pitch, followup, etc.) in the count. Fixed to only count `status IN ('confirmed', 'advancing', 'completed')`.

## TypeScript Status
0 errors after all changes.
