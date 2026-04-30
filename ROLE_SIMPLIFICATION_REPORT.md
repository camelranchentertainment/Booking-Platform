# Role Simplification Complete
Date: 2026-04-30

## New Role Structure
| Role       | Access                      | Route   | Cost    |
|------------|-----------------------------|---------|---------|
| superadmin | Scott only — admin panel    | /admin  | n/a     |
| act_admin  | Full platform — Band Admin  | /band   | $18/mo  |
| member     | Read-only — crew/members    | /member | Free    |

> Superadmin is never created via the registration flow.

---

## Database State
*SQL verification must be run via Supabase Dashboard (env vars not available at build time):*

```sql
SELECT role, COUNT(*) as count
FROM user_profiles
GROUP BY role;
-- Expected: no rows with role = 'agent'

SELECT act_name, owner_id, agent_id FROM acts;
-- Expected: agent_id NULL on all acts

-- superadmin count should = 1
```

Note: `agent_id` column is retained on `venues`, `contacts`, and `email_drafts` tables
as the owner/creator reference — no migration needed. The column functions correctly
for act_admin users (stores their user_id).

---

## Files Changed — Part 5

### Admin Panel (pages/admin.tsx)
- Role badges: superadmin→gold, act_admin→amber "Band Admin", member→gray
- Removed VIEW AS button and doViewAs() function
- Subscription plan display: "band_admin" → "Band Admin — $18/mo"
- Guard redirect: /dashboard → /band
- Top nav: removed broken /dashboard link → /band

### Email Templates (agent references removed)
- `pages/api/tours/venue-confirm.ts` — renamed agentProfile→senderProfile; "Booking Contact" now shows sender name or "[Act] Management"
- `pages/api/email/auto-draft.ts` — system prompt no longer mentions "booking agent"; from line updated
- `pages/api/email/backfill-drafts.ts` — agentFrom→senderFrom; system prompt updated; "[AGENT: add dates]" → "[add dates]"
- `pages/api/email/ai-draft.ts` — "[AGENT: add dates]" → "[add dates]"
- `pages/api/email/send.ts` — agentId variable renamed to userId

### Platform Settings (lib/platformSettings.ts)
- Removed stripe_agent_price_id env var mapping

### AppShell (components/layout/AppShell.tsx)
- Removed impersonating state
- Removed localStorage.getItem('impersonate_user')
- Removed "VIEWING AS" impersonation banner UI

---

## Files Changed — Parts 1–4

### Part 3 — Data query simplification (lib/bookingQueries.ts + 10 pages)
- All agent-centric lookups replaced with getActId() → act_id-based queries
- Removed getAgentActIds, getAgentActs, getAgentBookings from codebase

### Part 4 — Public pages and pricing
- `pages/index.tsx` — new hero, 2-tier pricing, Band Admin first (GOLD)
- `pages/register.tsx` — Band Admin default, feature lists, badge, routes to /band
- `pages/pricing.tsx` — Band Admin first, GOLD color, updated features
- `pages/api/stripe/checkout.ts` — STRIPE_BAND_ADMIN_PRICE_ID env fallback, success_url → /band

---

## Agent References Removed
Before: Multiple files containing "booking agent", "agentProfile", "agentFrom",
        "the booking agent", "[AGENT: ...]", stripe_agent_price_id, VIEW AS logic
After: 0 user-facing agent references

Remaining agent_id occurrences in code are DB column queries (correct, intentional —
the column exists in the schema and is the owner/creator reference).

---

## Routing
| Role       | After Login | After Register |
|------------|-------------|----------------|
| superadmin | /admin      | n/a            |
| act_admin  | /band       | /band          |
| member     | /member     | /join?token=…  |

---

## Registration
2 tiers shown: Band Admin ($18/mo) and Member (invite-only)
Superadmin never created via the public registration flow.
Band Admin selected by default with "Recommended" badge.

---

## Build Status
- TypeScript: **CLEAN** (npx tsc --noEmit — no errors)
- Next.js compile: **PASS** (✓ Compiled successfully)
- SSG data collection: Skipped — Supabase URL not available in build environment
  (pre-existing condition; Vercel deploys correctly with env vars configured)

---

## Manual Actions Still Required
1. **Stripe dashboard** — Update Band Admin product price to $18/mo if not already set
2. **Vercel** — Add `STRIPE_BAND_ADMIN_PRICE_ID` environment variable
3. **Test** — Jake login → should route to /band
4. **Test** — New registration flow (Band Admin default, feature cards, routes to /band)
5. **Test** — Scott (superadmin) login → routes to /admin
6. **Supabase dashboard** — Run SQL verification above to confirm no agent roles remain
