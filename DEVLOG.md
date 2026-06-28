# Dev Log

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
