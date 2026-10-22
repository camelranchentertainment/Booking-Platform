-- Allow 'past_due' as a profile subscription status.
--
-- The Stripe webhook (pages/api/stripe/webhook.ts) writes 'past_due' when a
-- renewal payment fails, and redeem_signup_code() already checks for it, but
-- profiles_subscription_status_check only allowed active / inactive /
-- trialing / cancelled, so the failed-payment update was rejected and the
-- account kept showing 'active'.

alter table public.profiles drop constraint if exists profiles_subscription_status_check;
alter table public.profiles add constraint profiles_subscription_status_check
  check (subscription_status = any (array['active', 'inactive', 'trialing', 'cancelled', 'past_due']));
