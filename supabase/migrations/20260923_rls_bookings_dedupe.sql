-- Remove duplicate and unsafe bookings RLS policies.
--
-- Kept, unchanged:
--   "Band admin can manage bookings" (ALL: band_admin/superadmin of the act)
--   "bookings_act_owner"             (ALL: acts.owner_id)
--   "bookings_act_access"            (SELECT: act owner / act member / superadmin)
--
-- Removed:
--   "Band admin can manage their bookings": exact duplicate of "Band admin can manage bookings"
--   "bookings_member_select":               subset of bookings_act_access
--   "Act members can view bookings":        duplicate member access, plus an
--                                           act_id IS NULL clause that would expose
--                                           any unassigned booking to every caller

drop policy if exists "Band admin can manage their bookings" on public.bookings;
drop policy if exists "bookings_member_select"               on public.bookings;
drop policy if exists "Act members can view bookings"        on public.bookings;
