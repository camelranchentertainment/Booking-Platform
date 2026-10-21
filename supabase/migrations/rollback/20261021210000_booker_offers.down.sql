-- rollback/20261021210000_booker_offers.down.sql
-- Undoes 20261021210000_booker_offers.sql. Offers hold financial terms:
-- export booker_offers first if the history matters.
begin;
drop table if exists public.booker_offers;
drop table if exists public.booker_offer_templates;
drop function if exists public.booker_offers_set_number();
alter table public.booker_messages drop constraint if exists uq_booker_messages_id_booker;
commit;
