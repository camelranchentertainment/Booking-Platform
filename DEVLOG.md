# Dev Log

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
