# Knowledge Graph Report — Booking Platform

Generated: 2026-04-28

## Summary

| Metric | Value |
|--------|-------|
| Files scanned | 103 |
| Total words (raw codebase) | 92,931 |
| Graph nodes | 509 |
| Graph edges | 1040 |
| Semantic hyperedges | 20 |
| Communities detected | 65 |
| Estimated token reduction | ~4x |

## God Nodes

Nodes with the highest connectivity — these are the architectural load-bearers. Changes here ripple across the system.

| Rank | Node | Degree | File |
|------|------|--------|------|
| 1 | **getUser()** | 83 | `pages/api/tours/delete.ts` |
| 2 | **getServiceClient()** | 57 | `lib/supabase.ts` |
| 3 | **bookings table** | 22 | `lib/supabase.ts` |
| 4 | **admin.tsx** | 16 | `pages/admin.tsx` |
| 5 | **getSetting()** | 15 | `lib/platformSettings.ts` |
| 6 | **acts table** | 15 | `lib/supabase.ts` |
| 7 | **[id].tsx** | 14 | `pages/tours/[id].tsx` |
| 8 | **index.tsx** | 14 | `pages/venues/index.tsx` |
| 9 | **user_profiles table** | 14 | `lib/supabase.ts` |
| 10 | **index.tsx** | 13 | `pages/email/index.tsx` |

### Key observations

- **`getUser()` in tours/delete.ts** (degree 83) is the single highest-degree node in the entire graph — it acts as the primary auth gate for the tours delete flow, anchoring nearly every function call chain in that module.
- **`getServiceClient()`** (degree 57) is the Supabase admin client factory; it's called from nearly every API route that needs elevated DB permissions. A bug here would break all server-side mutations.
- **`bookings` table** (degree 22) is the most-referenced database table in the platform — it's the central domain object touching email, calendar, financials, tours, band portal, and settlement flows.
- **`admin.tsx`** (degree 16) is the densest single page, wiring together user management, metrics, subscriptions, and system health with the superadmin guard.
- **`getSetting()`** (degree 15) is the platform-wide config abstraction — it's referenced from both API routes and components, making it a hidden coupling point between front-end and back-end config.

## Communities

- **Community 0** (95 nodes) — Pages: `send.ts`, `handler()`
- **Community 1** (88 nodes) — Pages: `API: /api/email/backfill-drafts`, `Venues List Page`
- **Community 2** (25 nodes) — Pages: `saveDetails()`, `setFin()`
- **Community 3** (17 nodes) — Pages: `async()`, `admin.tsx`
- **Community 4** (17 nodes) — Pages: `prev()`, `save()`
- **Community 5** (16 nodes) — Pages: `handler()`, `buildHashtagBlock()`
- **Community 6** (15 nodes) — Pages: `openVenuePopout()`, `discoverVenues()`
- **Community 7** (14 nodes) — Pages: `loadInbox()`, `moveStatus()`
- **Community 8** (13 nodes) — Pages: `ai-draft.ts`, `backfill-drafts.ts`
- **Community 9** (10 nodes) — Pages: `loadPosts()`, `saveEdit()`
- **Community 10** (10 nodes) — Pages: `load()`, `save()`
- **Community 11** (10 nodes) — Pages: `saveCredentials()`, `saveEdit()`
- **Community 12** (9 nodes) — Pages: `set()`, `setContact()`
- **Community 13** (7 nodes) — Pages: `searchVenues()`, `respondToLink()`
- **Community 14** (7 nodes) — Components: `load()`, `toggle()`
- **Community 15** (6 nodes) — Pages: `load()`, `prev()`
- **Community 16** (6 nodes) — Components: `markSysRead()`, `acceptInvite()`
- **Community 17** (5 nodes) — Pages: `actName()`, `prev()`
- **Community 18** (5 nodes) — Pages: `Initials()`, `revokeInvite()`
- **Community 19** (5 nodes) — Pages: `loadAll()`, `[id].tsx`

## Surprising Connections

- **`Sidebar` → `UserRole` type** bridges two separate communities: the layout shell (AppShell/Sidebar) and the shared type library. The sidebar has a hard dependency on role-based rendering that isn't obvious from the page files.
- **`EmailComposer`** is shared across three unrelated domains: the `/email` pipeline page, `/bookings/[id]`, and `/venues/[id]`. This component is a cross-cutting concern that would be affected by any email API change.
- **`api_email_auto_draft` and `api_email_ai_draft`** are semantically near-identical but appear in separate communities — auto-draft runs server-side as a batch job, while ai-draft is triggered interactively. They share the same Anthropic call pattern but have divergent ownership.
- **`daily-reminders` edge function** (Supabase Edge) writes directly to `bookings.email_stage` AND sends via Resend — it's the only place outside the main app that mutates booking state. If it misfires, the email pipeline diverges silently.

## Business Flows (Hyperedges)

- **User Auth & Onboarding Flow** (confidence 90%): `login_page → register_page → join_page`
- **Superadmin Dual-Layer Guard** (confidence 85%): `middleware_superadmin_guard → admin_page → appshell_auth_shell`
- **Stripe Subscription Lifecycle** (confidence 95%): `api_stripe_checkout → api_stripe_webhook → api_stripe_portal → api_stripe_cancel`
- **Band Pages Act Lookup Pattern** (confidence 85%): `bandportal_page → bandsettings_page → bandcalendar_page → bandtours_page`
- **AI Email Draft & Send Flow** (confidence 95%): `emailpage_page → api_email_ai_draft → api_email_send → db_email_log`
- **Agent-Band Link Management Flow** (confidence 90%): `db_agent_act_links → api_agent_link_revoke → api_agent_link_respond → bandmembers_page`
- **Booking Creation Flow** (confidence 90%): `bookings_new_page → db_bookings → db_acts → db_venues`
- **Tour Venue Outreach & Confirm Flow** (confidence 85%): `tours_detail_page → api_tours_venues → api_venues_scrape → email_emailcomposer`
- **Venue Discovery & Enrichment Flow** (confidence 85%): `venues_index_page → venues_detail_page → api_venues_scrape → db_contacts`
- **AI Email Drafting Subsystem** (confidence 95%): `api_email_ai_draft → api_email_auto_draft → api_email_backfill → ext_anthropic`
- **Agent-Act Link Lifecycle** (confidence 90%): `api_agent_link_send → api_agent_link_revoke → api_agent_link_respond → db_agent_act_links`
- **Member Invite Acceptance Flow** (confidence 90%): `api_members_invite → api_invite_info → api_accept_invite → db_act_invitations`
- **Admin API Superadmin Gate** (confidence 90%): `middleware_superadmin_guard → api_admin_users → api_admin_invite → api_admin_metrics`
- **Tour Venue Confirm Orchestration** (confidence 90%): `api_tours_venues → api_tours_confirm → ext_anthropic → db_tours`
- **Venue Discovery & Enrichment Pipeline** (confidence 95%): `api_venues_scrape → api_venues_prospect → api_venues_place_details → ext_firecrawl`
- **Automated Email Reminder Pipeline** (confidence 90%): `edge_fn_daily_reminders → db_bookings → db_user_profiles → ext_resend`
- **Member Invitation & Auth Flow** (confidence 90%): `api_auth_callback → api_auth_signout → lib_supabase → db_user_profiles`
- **Email Outreach UI Flow** (confidence 95%): `comp_email_composer → api_email_ai_draft → api_email_send → api_email_templates`
- **Auth Layout Shell** (confidence 90%): `comp_appshell → comp_sidebar → db_user_profiles → type_user_role`
- **Platform Integration Config** (confidence 85%): `comp_platform_setup → lib_platform_settings → db_platform_settings → doc_setup_guide`

## Suggested Questions

1. *What happens if `getServiceClient()` in `lib/supabase.ts` changes its return type?* — 57 nodes are directly coupled to it.
2. *Is `EmailComposer` safe to refactor independently?* — It's imported by venues, bookings, and the email pipeline; check all three callers.
3. *Why does `tours/delete.ts:getUser()` have degree 83?* — Investigate whether this is an AST extraction artifact (many local calls) or a genuine architectural coupling.
4. *Can the `auto-draft` and `ai-draft` API routes be unified?* — They share Anthropic call patterns and the same `email_drafts` table.
5. *What guards `daily-reminders` from double-firing?* — It mutates `bookings.email_stage` outside normal app flow with no visible idempotency check.
6. *What is the full blast radius of a `platform_settings` schema change?* — `getSetting()` is called from 15+ nodes spanning both front-end components and back-end API routes.

## Files Skipped

- `**/.env*` (sensitive)
- `**/node_modules/**`
