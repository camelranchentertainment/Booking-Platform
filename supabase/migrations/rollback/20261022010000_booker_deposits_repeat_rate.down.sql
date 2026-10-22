-- rollback/20261022010000_booker_deposits_repeat_rate.down.sql
-- Undoes 20261022010000_booker_deposits_repeat_rate.sql. Deposit amounts and
-- dates entered since are lost: export booker_shows' deposit columns first if
-- they matter.
begin;
drop index if exists public.idx_booker_shows_deposits_open;
alter table public.booker_roster drop column if exists repeat_commission_pct;
alter table public.booker_shows
  drop constraint if exists booker_shows_deposit_received_ck,
  drop constraint if exists booker_shows_deposit_due_ck,
  drop column if exists deposit_received_on,
  drop column if exists deposit_due_on,
  drop column if exists deposit_amount;
commit;
