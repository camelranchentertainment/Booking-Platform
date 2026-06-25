# Dev Log

## 2026-06-25

Poster generator photo rendering confirmed fixed end-to-end on 2026-06-25, after the earlier false "already fixed" reports were traced to a misattributed commit (beb8c31 touched media.tsx, not generate.tsx) and the real fix landed in 8de577e.

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
