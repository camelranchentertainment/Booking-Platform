-- rollback/20261021190000_booker_band_links.down.sql
-- Undoes 20261021190000_booker_band_links.sql.
--
-- Bookings and venues that bands already accepted from their agent stay on
-- the band's calendar: they are ordinary band rows and are not touched here.
-- Links and proposals themselves are dropped, so export them first if the
-- history matters.

begin;

drop function if exists public.booker_proposal_decline(uuid, text);
drop function if exists public.booker_proposal_accept(uuid);
drop function if exists public.booker_my_band_proposals();
drop function if exists public.booker_link_revoke(uuid);
drop function if exists public.booker_link_respond(uuid, boolean);
drop function if exists public.booker_my_band_links();
drop function if exists public.booker_proposal_withdraw(uuid);
drop function if exists public.booker_proposal_send(uuid);
drop function if exists public.booker_band_calendar(uuid, date, date);
drop function if exists public.booker_link_set_sharing(uuid, boolean, boolean, boolean, boolean);
drop function if exists public.booker_link_cancel(uuid);
drop function if exists public.booker_link_invite(uuid, text);
drop function if exists public.booker_notify(uuid, uuid, text, text, text);
drop function if exists public.booker_caller_email();
drop function if exists public.booker_caller_band_act();

drop table if exists public.booker_proposals;
drop table if exists public.booker_links;

commit;
