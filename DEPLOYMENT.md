# Camel Ranch Booking — Deployment Guide

## Vercel Environment Variables

Set all of the following in Vercel → Project Settings → Environment Variables.

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_BAND_ADMIN_PRICE_ID=
STRIPE_WEBHOOK_SECRET=

# Resend (transactional email)
RESEND_API_KEY=

# Google Calendar OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://camelranchbooking.com/api/auth/google/callback

# Anthropic (AI recommendations)
ANTHROPIC_API_KEY=

# App
NEXT_PUBLIC_BASE_URL=https://camelranchbooking.com

# Email encryption (32-byte hex key for IMAP password storage)
EMAIL_ENCRYPT_KEY=

# Follow-up cron secret (also set in Supabase Edge Function env)
CRON_SECRET=
```

---

## Supabase Configuration

### Auth
1. Go to Authentication → URL Configuration
2. Add to Site URL: `https://camelranchbooking.com`
3. Add to Redirect URLs: `https://camelranchbooking.com/**` and `http://localhost:3000/**`
4. Enable Email provider under Authentication → Providers

### Storage
1. Go to Storage → New Bucket
2. Name: `media-library` — set Public: **ON**
3. Name: `avatars` — set Public: **ON** (if not already created)

### Database Migrations
Run migrations in order in the Supabase SQL Editor:
1. `supabase/migrations/20260527_phase1_auth_multitenant.sql`
2. `supabase/migrations/20260527_phase2_calendar_pipeline.sql`
3. `supabase/migrations/20260527_phase4_media_library.sql`
4. `supabase/migrations/20260527_phase5_polish_launch.sql`
5. `supabase/migrations/20260527_phase6_financials_history_followup.sql`

---

## Stripe Configuration

1. **Webhook endpoint**: Register `https://camelranchbooking.com/api/stripe/webhook` in Stripe Dashboard → Developers → Webhooks
   - Events to listen for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`
2. **Customer Portal**: Enable in Stripe Dashboard → Settings → Billing → Customer Portal
3. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`

---

## Google OAuth (Calendar)

1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add Authorized redirect URI: `https://camelranchbooking.com/api/auth/google/callback`
4. Enable Google Calendar API in APIs & Services → Library
5. Copy Client ID and Secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

---

## Platform Settings (after first deploy)

Log in as superadmin and go to Admin → Platform Settings to set:
- `resend_api_key` — your Resend API key
- `resend_from_email` — sending address (must be a verified domain in Resend)
- `stripe_secret_key` — same as `STRIPE_SECRET_KEY` env var (or use env var only)
- `anthropic_api_key` — your Anthropic API key

---

## Supabase Edge Functions

### process-followups (daily follow-up automation)

1. Deploy the function:
   ```bash
   supabase functions deploy process-followups
   ```
2. Set environment secrets in Supabase Dashboard → Edge Functions → process-followups → Secrets:
   - `CRON_SECRET` — a random string, also set as Vercel env var
3. Register the cron schedule in Supabase Dashboard → Edge Functions → Schedules:
   - Function: `process-followups`
   - Schedule: `0 14 * * *` (14:00 UTC = 8am CT)
   - Authorization header: `Bearer <CRON_SECRET>`

---

## Post-Launch Checklist

- [ ] All 4 SQL migrations applied in Supabase
- [ ] `media-library` storage bucket created (public)
- [ ] `avatars` storage bucket created (public)
- [ ] Stripe webhook registered and signing secret saved
- [ ] Stripe Customer Portal enabled
- [ ] Google OAuth credentials configured with redirect URI
- [ ] Resend API key and from-email configured in Platform Settings
- [ ] Anthropic API key configured in Platform Settings
- [ ] Superadmin account created and tested
- [ ] Band Admin registration and onboarding flow tested
- [ ] Invite flow end-to-end tested

---

## Deferred Post-Launch

- Social platform OAuth (Instagram, Facebook, TikTok auto-posting)
- Route-level code splitting optimization
- Contract / PDF generation for booking confirmations
- Bulk email warm-up / deliverability tooling
