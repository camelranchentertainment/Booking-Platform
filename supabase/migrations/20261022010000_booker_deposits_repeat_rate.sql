-- 20261022010000_booker_deposits_repeat_rate.sql
-- Build list item 5 (reports & commission extras), database part.
--
--   booker_shows.deposit_amount        deposit the buyer pays ahead of the show
--   booker_shows.deposit_due_on        when it's due
--   booker_shows.deposit_received_on   when it actually came in (null = not yet)
--   booker_roster.repeat_commission_pct  the agent's rate for a band when it
--                                        plays a venue it has played before
--                                        (null = same as the band's usual rate)
--
-- Additive only: nullable columns on the agent's own booker_ tables. RLS on
-- those tables already limits them to the owning agent, and the existing
-- grants cover the new columns. Nothing existing changes meaning: with the
-- new columns empty, every figure is exactly what it was.
--
-- Money is never deleted: these are plain columns on rows that are archived,
-- never removed.
--
-- Apply manually after review. Never auto-run. Rollback:
--   supabase/migrations/rollback/20261022010000_booker_deposits_repeat_rate.down.sql

begin;

alter table public.booker_shows
  add column if not exists deposit_amount      numeric(10,2) check (deposit_amount is null or deposit_amount >= 0),
  add column if not exists deposit_due_on      date,
  add column if not exists deposit_received_on date;

alter table public.booker_shows
  add constraint booker_shows_deposit_due_ck
    check (deposit_due_on is null or deposit_amount is not null),
  add constraint booker_shows_deposit_received_ck
    check (deposit_received_on is null or deposit_amount is not null);

comment on column public.booker_shows.deposit_amount is 'Deposit the buyer pays ahead of the show';
comment on column public.booker_shows.deposit_due_on is 'Date the deposit is due';
comment on column public.booker_shows.deposit_received_on is 'Date the deposit came in; null = not received yet';

alter table public.booker_roster
  add column if not exists repeat_commission_pct numeric(5,2)
    check (repeat_commission_pct is null or repeat_commission_pct between 0 and 100);

comment on column public.booker_roster.repeat_commission_pct is
  'Commission % when the band plays a venue it has played before; null = the band''s usual rate';

-- Deposit lookups for Needs attention: unpaid deposits by agent and due date.
create index if not exists idx_booker_shows_deposits_open
  on public.booker_shows (booker_id, deposit_due_on)
  where deleted_at is null and deposit_amount is not null and deposit_received_on is null;

commit;
