# Dev Log

## 2026-10-13 — Venue edits show up in the list without a browser reload

**Branch:** `fix/venue-save-refresh-list` · no migration

- **Bug:** saving a venue (e.g. its email) in the venue drawer updated the database, but the Venues list underneath kept its first-load copy, so the save looked lost until a hard reload (Ctrl+Shift+R).
- **Fix:** `VenueDrawer` gets an `onSaved(venue)` callback, fired after an edit is saved and after a website scan fills in details. `/venues` swaps the saved row into its list at once (`lib/venueList.ts` `mergeSavedVenue`, 5 tests) and then re-syncs from `/api/venues/list`. `/tours/[id]` reloads its targets list. No forced page reload.
- **Also fixed:** the drawer showed "✓ Saved" even when the write failed. It now uses `.update(...).select()`, treats an error *or* zero updated rows (RLS refusal, e.g. a venue owned by another band) as a failure, shows the reason, and stays in edit mode so nothing typed is lost.

## 2026-10-13 — Agent sees tour targets again; "send to targets" works (step 3)

**Branch:** `fix/agent-tour-targets` · no migration

- **Bug 1:** "Send this to the targets on LONE STAR" answered *No venues with "target" status* although the tour has 17. `resolveTourOutreach` embedded `contact:contacts(...)` on `tour_venues`, which has no contact relationship, so PostgREST rejected the query; the error was ignored and read as zero rows.
- **Bug 2:** asked "what venues are in Targets", the agent said *0 targets*. Its context listed only bookings per tour; it used to "see" targets through the fake pitch shows removed in step 1.
- **Fix:** targets load with the venue only; the band's saved contacts load separately (`act_id`-scoped, never `do_not_contact`). Venue email first, contact email as fallback. Query errors are logged and reported, never shown as "none". Tour name matching ignores case/spaces/underscores and no longer silently falls back to the first tour. Agent context now lists each open tour's targets (count by status, venue, pinned night, missing email) and a pipeline summary line.
- **Code:** `lib/domain/tourOutreach.ts` (pure, 20 tests), `pages/api/agent.ts`. Recipient shape for `/band` and `/api/agent-bulk-send` is unchanged; nothing sends without the existing approval click.

## 2026-10-12 — Calendar: one "working on it" tile per open tour night (step 2)

**Branch:** `feat/tour-date-placeholders` · no migration

- **What:** `/calendar` (Band Admins only, via `AppShell requireRole`) shows one dashed tile per tour per open night, e.g. "LONE STAR · 17 targeted", instead of a show per target. Members' `/member/calendar` is untouched.
- **Click a night:** side panel lists that night's targets (venue, city, Targeted / Following up, last contact) with "Open tour →" (outreach/emails live on the tour page). Week view shows the same tiles, linking to the tour.
- **Rules** (`lib/domain/tourPlaceholders.ts`, pure, 13 tests): every night start→end; a target counts on its pinned `booking_date` or on every night when unpinned; only `target`/`follow_up` count; no tile on a night that already has a booked show; skips completed/cancelled tours and past nights; max 62 nights per tour.
- **Data:** tours + open tour_venues read with the user's own client (existing RLS). A failure loading tours never hides shows.

## 2026-10-12 — Email "Save draft" works

**Branch:** `fix/email-drafts-save` · **Migration:** `20261012230000_email_log_allow_draft_status.sql` (+ rollback)

- **Bug:** Save draft failed with `violates check constraint "email_log_status_check"`. `lib/server/draftPayload.ts` writes `status: 'draft'`; the constraint only allowed sent/delivered/bounced/failed and no migration ever added `draft`.
- **Fix:** constraint now also allows `draft`. No code change. All existing values still allowed; anything else still rejected.
- **Verified:** PGlite: reproduced the exact error, then 10/10 (draft saves, other statuses unchanged, junk rejected, re-run safe, rollback works with drafts present).

## 2026-10-12 — Tour targets are not calendar shows (step 1 of tour placeholders)

**Branch:** `fix/tour-targets-not-calendar-shows` · **Migration:** `20261012220000_remove_tour_target_calendar_shows.sql` (data only, + rollback)

- **Bug:** `syncBooking` inserted a `pitch` booking for every tour target, dated on the tour's `end_date`. LONE STAR (Jan 7–9 2027, Jake's band) showed 34 entries on Jan 9 for 17 targets; 17 had lost their venue after venue deletions. Across all bands: 51 such rows.
- **Second bug, same code:** on confirm, `venue-confirm` inserts the real show, then `syncBooking` did `maybeSingle()` on bookings for that tour+venue, found two (pitch + confirmed), got an error/null and inserted a third.
- **Now:** `syncBooking` never inserts. It only moves an existing show to `confirmed` (never pulling advancing/completed back) or `cancelled`; target ↔ follow-up changes don't touch bookings. Shows are created only by the confirm flow.
- **Cleanup:** removes `source='tour'`, `status='pitch'` tour bookings that are not on Google Calendar and have nothing attached (email_log, drafts, posters, social, personnel, expenses). All 51 eligible at authoring. Full rows backed up in `_fix_20261012_tour_target_shows`. The 47 targets (tour_venues) are untouched.
- **Known gap until steps 2–3:** pipeline/dashboard pitch counts drop by the tour targets (they were these fake rows); step 3 reads targets instead. Calendar placeholder per date (admins only; Members see confirmed shows only) is step 2.
- **Verified:** new `__tests__/lib/statusSync.test.ts` (11 cases; all fail on the old code, pass on the new); PGlite test of migration + rollback 9/9.

## 2026-10-12 — Contacts: each band only sees and changes its own (security)

**Branch:** `fix/contacts-rls-tenant-isolation` · **Migration:** `20261012200000_contacts_act_id_and_rls.sql` (+ rollback) · needs `20261012180000` (venues) applied first

- **Bug:** the only contacts policy was `contacts_access FOR ALL USING (auth.uid() IS NOT NULL)`: any signed-in user, Members included, could read, edit and delete every band's venue contacts.
- **Second bug fixed by the same change:** venue page "Add contact", the website scan and the venue spreadsheet import all send `act_id`, but the column didn't exist, so those saves were rejected (400 in the API logs on 2026-10-12) and silently lost. Only the AI agent's path (no `act_id`) worked.
- **Now:** `contacts.act_id` NOT NULL, backfilled from the venue (21 rows, all one band), FK + indexes. Trigger `contacts_set_act_id` (SECURITY DEFINER) fills `act_id` from the venue when omitted and rejects a band that doesn't match the venue's, so no caller (browser, agent, mobile) can attach a contact to another band's venue. Policies mirror venues: read = superadmin or the band; write = superadmin or the band's band_admin.
- **No code changes on purpose:** code deploys on merge, the column arrives when the migration is applied; code that reads `act_id` would break in between. Follow-up: switch `lib/server/actOwnership.ts#ownedContactId` to `act_id` so contacts whose venue was deleted still resolve.
- **Verified locally:** PGlite replica of prod with the venues fix applied, 35 checks (bug reproduced; reads/writes per role; all four insert paths; cross-band attach/move blocked; venue-delete keeps the contact in its band; re-run safe; rollback exact).

## 2026-10-12 — Venues: each band only sees and changes its own (security)

**Branch:** `fix/venues-rls-tenant-isolation` · **Migration:** `20261012180000_venues_rls_tenant_isolation.sql` (+ rollback in `rollback/`)

- **Bug:** `venues_select` allowed any signed-in user (Members included) to read every band's venues; `venues_insert/update/delete` only checked "is a band_admin", not "of this band". Permissive policies are OR'd, so any band admin could edit or delete any band's venues.
- **Policies now:** read = superadmin or anyone in the venue's band; write = superadmin or that band's band_admin. `WITH CHECK` stops a venue moving between bands. New helpers `app_current_act_id()`, `app_current_role()`, `app_is_superadmin()` (SECURITY DEFINER, authenticated only) for this and later policies.
- **Data fix in the same migration:** rows pointing at another band's venue get a copy of that venue in their own band (`source = 'tenant_split'`), originals untouched, everything logged in `_fix_20261012_venue_split_*` for an exact rollback. Production at authoring: 1 booking (Jake's Sept 25 Wire Road Brewing show pointed at John D. Hale Band's venue).
- **Service-role leaks closed in code** (RLS doesn't cover these):
  - `pages/api/agent.ts` city search returned every band's venues and emails → now `act_id`-scoped.
  - `POST /api/tours/venues` linked any venue id to a tour → now requires the venue to belong to the tour's band (`ownedVenueId`). Likely origin of the Wire Road cross-link.
  - `pages/tours/[id].tsx` venue search and "already added" lookups scoped to the tour's band.
- **Verified:** local PGlite replica of the prod schema, 31/31 checks (bug reproduced before; each role's read/write after; re-run is a no-op; rollback restores exactly). New `__tests__/api/tourVenuesOwnership.test.ts`. lint (no new warnings), typecheck, 62 suites / 553 tests, build all pass. Live verification runs after the migration is applied.

## 2026-10-12 — AI Booking Agent card usable on mobile

**Branch:** `fix/agent-card-mobile-layout` · **File:** `pages/band/index.tsx` (layout/CSS only)

- Bug: on phones the card kept its desktop two-column layout. The fixed 220px mascot column left the chat ~130px wide, so the text box collapsed to a sliver (it showed only the "A" of its placeholder) and users had nowhere to type.
- Below 768px the card is now one column: mascot column hidden, small avatar + "Online · ready" in the chat header, card height `min(640px, 80dvh)`.
- Quick chips become one sideways-scrolling row on mobile (44px tap targets); they still wrap on desktop.
- Composer: text box gets the remaining width (`min-width: 0`), 16px font on mobile so iOS doesn't zoom on tap, auto-grows to ~5 lines. Added a visually hidden label and aria-labels on the attach/send buttons.
- Desktop (≥768px) layout unchanged.

## 2026-10-09 — Booking Agent workspace, phases 1–2

**Branches:** `feat/booker-db-foundation` (migration only) → `feat/booker-workspace` (pages, stacked on it)
**Spec:** "Booking Agent Workspace — Spec" (Claude Docs). Code name for the role is **booker**; "agent" already means the AI assistant.

- Separate workspace under `/booker/*` with its own shell (`components/booker/BookerShell.tsx`), same login and database. No existing page, table or policy changed.
- Data: `booker_profiles`, `booker_roster`, `booker_venues`, `booker_contacts`, `booker_shows`, `booker_commission_payments`. RLS = owning agent only; composite FKs stop cross-agent references; no DELETE grant (archive via `deleted_at`).
- Browser reads/writes go straight through RLS (`lib/booker/data.ts`); the only server route is `/api/booker/register` (agent-only sign-up, accepts signup codes).
- Agent-only accounts are a normal `profiles` row (role `band_admin`, no `act_id`) plus a `booker_profiles` row. `pages/login.tsx` sends band-less accounts with an agent profile to `/booker` and honours `?next=/booker…`.
- Existing users open `/booker` and set up the workspace in place.
- Pricing tiers live in `lib/booker/pricing.ts` (1–19 bands $35, 20–49 $45, 50+ sales). Billing not wired yet.
- Commission: earned on played shows (actual amount if entered, else fee); projected on confirmed future shows; totals per calendar year.

**Not built yet (later phases):** linking to band accounts + read-only doorway, proposals, sharing checkboxes, multi-act events, agent Gmail, AI assistant in the workspace, Booking Agent billing, a band-side link into `/booker`.


## 2026-09-18 — Band Admin Dashboard Layout Redesign

**Branch:** feature/band-dashboard-redesign  
**Scope:** `/band/*` pages — layout/IA + typography. No data or feature changes.

### Step 0 — Discovery findings

**Sidebar nav component:** `components/layout/Sidebar.tsx` — the `bandAdminNav` array
(line 30–45) owns the band admin nav order. Sidebar is shared across all roles; the
array is role-selected at render time.

**Band-context bar:** No separate component. The context strip lives inline in
`components/layout/AppShell.tsx` — the `roleBadge` block shows "BAND ADMIN — {actName}"
with the user's display name. No `Switch Band` / `Working on:` control exists; band
context is embedded in the role badge label. The new pill bar was added as a second
strip immediately below the roleBadge strip, also in AppShell.

**Font tokens / type-scale — single source of truth: `styles/globals.css`. No Tailwind.**
Fonts loaded via Google Fonts `@import` (line 1):
- `Bebas Neue` — single weight (display headers via `--font-display`)
- `DM Mono` — weights 400, 500 (mono labels via `--font-mono`)
- `Inter` — weights **300, 400, 500, 600, 700** (body copy via `--font-body`)

Weight 800 was **not loaded** before this pass. Several existing elements already
referenced `fontWeight: 800` on Inter (AI BOOKING AGENT header, stat card labels) —
those were rendering as faux-bold. Weight 800 was added to the Google Fonts URL.

**Styling system:** Pure CSS custom properties in `globals.css` — no Tailwind.
All typography changes were applied to `globals.css` class definitions only.

### Items flagged for Scott

**Nav item placement (four items not in wireframe):** `Today`, `Analytics`, `Media`,
and `Help` weren't in Scott's sketch. Placement: Today under Dashboard, Analytics
next to Financials, Media next to Socials, Help at bottom with Settings. One-line
change to `bandAdminNav` in `Sidebar.tsx` if any placement needs adjustment.

**Pill bar routes — ambiguity between two existing routes for "Targets":**
- Quick chip "Show my targets" → `/tours`
- Stat card "TARGETS" → `/email?tab=outreach&status=target`

Used `/email?tab=outreach&status=target` (more purpose-built for working a target
list). If `/tours` is preferred, one-line change to the href in `AppShell.tsx`.
Used `/bookings?filter=confirmed` for Confirmed (from quick chip).

**Voice/Text toggle:** Wireframe shows this on the agent input. Current input is
text-only. Voice input is real speech-to-text work — not included in this pass.
Flagging as a separate feature request.

**Agent icon (Step 5):** No new SVG in `public/` at time of this work. Left
unimplemented. Once uploaded, it's a one-line `src` change in the agent panel
header in `pages/band/index.tsx`.

### Commits

1. `feat(nav): reorder band admin sidebar nav per wireframe`
2. `feat(dashboard): add Targets/Confirmed/Tours pill bar to band context strip`
3. `feat(typography): bump Inter to weight 800; increase nav + header weights`
4. Agent icon swap — pending SVG upload to `public/`

---

## 2026-06-25

Poster generator photo rendering confirmed fixed end-to-end on 2026-06-25, after the earlier false "already fixed" reports were traced to a misattributed commit (beb8c31 touched media.tsx, not generate.tsx) and the real fix landed in 8de577e.

### Session-drop investigation — interim mitigation

Scott raised the JWT/session expiry setting to 3600s in the Supabase dashboard as an interim mitigation — this reduces how often the refresh cycle runs and may reduce how often the bug is hit, but does not address the underlying gap in contexts/AuthContext.tsx's onAuthStateChange fallthrough behavior. The dedicated fix session noted above is still needed.

### Session-drop fix landed — 2026-06-28

Root cause confirmed: the `onAuthStateChange` fallthrough in `contexts/AuthContext.tsx` was calling `setUser(session?.user ?? null)` unconditionally for every non-`SIGNED_OUT` event. Events like `TOKEN_REFRESHED`, `USER_UPDATED`, `INITIAL_SESSION`, and `PASSWORD_RECOVERY` can fire with `session === null` even when the Supabase session is still valid (false-negative read of session state, not an actual logout). This wiped `user` and `profile` from React state mid-navigation, logging the user out of the UI while Supabase's own session remained intact.

Fix (commit `f534bcb`): removed the unconditional `setUser(null)` write. The handler now only updates state when `session?.user` is present; a null session on any non-`SIGNED_OUT` event is silently ignored. `SIGNED_OUT` continues to clear state via the existing early-return guard. The 3600s JWT expiry mitigation can remain in place — it does no harm — but the underlying fallthrough is now closed.

## 2026-06-24

### pages/band/tours.tsx — orphaned page, kept intentionally

`pages/band/tours.tsx` (`/band/tours`) is unreachable from the live UI. As of this date,
the Sidebar nav points to `/tours` (`pages/tours/index.tsx`) and there are no `router.push`,
`<a href>`, or redirect references to `/band/tours` anywhere in the codebase.

The file was originally created during a nav restructure (`78fabe4`) and was the active tours
page at that time. At some point the Sidebar entry was changed to `/tours`, leaving
`/band/tours` stranded. It has not been deleted because it contains two features not yet in
`pages/tours/index.tsx`: an AI Import modal (`ImportModal`) and a venue-count display per tour.

Decision (Scott, 2026-06-24): leave in place, do not redirect, do not wire back into nav.
Revisit when/if those features are ported to `/tours`. A comment block at the top of the file
marks it as orphaned.
