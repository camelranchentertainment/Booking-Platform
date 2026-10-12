# Dev Log

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
