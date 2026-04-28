# /qa — Camel Ranch Booking Platform QA Skill

## Purpose
Full 3-phase quality audit of the Camel Ranch Booking Platform. Read this entire file before starting. Execute every section in order. Fix every issue found. Generate `QA_REPORT.md`. Push to main.

---

## PHASE 1 — FUNCTIONAL AUDIT

### Setup
```bash
npx tsc --noEmit   # Must be 0 errors before starting
```
If TypeScript errors exist, fix them first before proceeding.

### Pages to Audit (all 35+)
For each page, check:
1. **Data loads correctly** — no unbounded queries (add `.limit(500)` on any query without one)
2. **Forms submit correctly** — no invalid enum values, no missing required fields
3. **Auth gates work** — `requireRole` is set appropriately on every `<AppShell>`
4. **No console errors** — look for missing fields, bad joins, undefined access
5. **Links/navigation work** — sidebar links exist for all major pages

**Agent pages:** `/dashboard`, `/today`, `/acts`, `/bookings`, `/tours`, `/venues`, `/calendar`, `/email`, `/social`, `/financials`, `/history`, `/settings`, `/admin`, `/contacts`

**Band pages:** `/band/index`, `/band/members`, `/band/tours`, `/band/calendar`, `/band/email`, `/band/social`, `/band/settings`

**Member pages:** `/member/index`, `/member/calendar`

**Auth pages:** `/login`, `/register`, `/join`, `/reset-password`, `/pricing`

**Booking pages:** `/bookings/new`, `/bookings/[id]`

**Other:** `/acts/new`, `/acts/[id]`, `/tours/[id]`, `/venues/[id]`

### Critical Business Logic Checks

#### Tour Confirmation Flow
- Confirming a show via `venue-confirm.ts` MUST create a record in `bookings` table BEFORE updating `tour_venues.status`
- If `show_date` is not provided, fall back to `tour.start_date`
- `booking_id` must be returned in the response
- Check: any `tour_venues` with `status='confirmed'` that have no matching `bookings` row → backfill manually

#### Financial Logic
- **Earned** = `actual_amount_received` on `status='completed'` bookings ONLY
- **Potential** = `agreed_amount` on `status='confirmed'` future bookings ONLY
- `payment_status` valid values: `pending | partial | received | waived` — NEVER `settled`
- Members NEVER see financial data (guard with `requireRole`)

#### Booking Status Enum
Valid: `pitch | followup | negotiation | hold | contract | confirmed | advancing | completed | cancelled`

#### Payment Status
Valid: `pending | partial | received | waived`
Never use: `settled`

### Common Bugs to Fix
- `payment_status` dropdown has `settled` option → replace with `partial` + `waived`
- Supabase queries without `.limit()` on tables that could grow large
- PostgREST `.or()` filter with raw user input (commas/parens break query) → sanitize first
- `tour_venues` confirmed without corresponding `bookings` row
- Missing nav links in sidebar (e.g. Bookings link missing from agent sidebar)
- Phase 3 logistics fields missing from member views (`soundcheck_time`, `end_time`, `meals_provided`, `drinks_provided`, `hotel_booked`, `sound_system`, `special_requirements`, `venue_contact_name`)

---

## PHASE 2 — DESIGN AUDIT

### Design System Verification
Check `styles/globals.css` for:
- CSS variables defined for all colors, fonts, spacing
- Light theme `[data-theme="light"]` overrides present
- No hardcoded hex colors in component files (should use CSS vars)

### Component Class Consistency
Every page must use only these shared classes:
- `.card`, `.card-header`, `.card-title`
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-sm`
- `.badge`, `.badge-{status}` (9 booking statuses covered)
- `.stat-block`, `.stat-value`, `.stat-label`
- `.page-header`, `.page-title`, `.page-sub`
- `.input`, `.select`, `.textarea`, `.field`, `.field-label`
- `.table-wrap`, `.modal-backdrop`, `.modal`, `.modal-header`, `.modal-title`
- `.kanban-board`, `.kanban-col`

Flag any page using raw `style={{ }}` for structural layout where a shared class could be used instead.

### Sidebar Nav Audit
Verify every role has appropriate nav links:
- **Agent**: Dashboard, Today, Bands, Bookings, Tours, Venues, Calendar, Email, Social, Financials, History, Contacts, Settings, Admin (if superadmin)
- **act_admin**: Dashboard, Shows, Calendar, Email, Social, Members, Tours, Settings
- **member**: Dashboard, Calendar, Settings

---

## PHASE 3 — MOBILE AUDIT

### Responsive Breakpoints Required
Check `styles/globals.css` for these `@media` rules:

**`@media (max-width: 768px)`:**
- `.page-title` → `font-size: 1.8rem`
- `.page-header` → `flex-direction: column; align-items: flex-start`
- `.grid-4` → `grid-template-columns: 1fr 1fr`
- `.kanban-board` → `scroll-snap-type: x mandatory`
- `.kanban-col` → `flex: 0 0 220px; scroll-snap-align: start`
- `table` → `min-width: 480px`
- `.modal-backdrop` → `align-items: flex-end`
- `.modal` → `max-width: 100%; margin: 0`
- `.card` → `background-image: none`

**`@media (max-width: 480px)`:**
- `.grid-4` → `grid-template-columns: 1fr`
- `.main-content` → `padding: 0.75rem; padding-top: 3.5rem`
- `.page-title` → `font-size: 1.5rem`
- `.kanban-col` → `flex: 0 0 200px`

### Calendar Layout
Calendar pages must use `.calendar-layout` class (not inline grid style):
```css
.calendar-layout {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 1.25rem;
  align-items: start;
}
@media (max-width: 900px) {
  .calendar-layout { grid-template-columns: 1fr; }
}
```

---

## OUTPUT

After completing all phases, generate `QA_REPORT.md` in the repo root with:
```markdown
# QA Audit Report
**Date:** [today]
**TypeScript:** ✅ 0 errors / ❌ N errors

## Phase 1 — Functional
| Page | Status | Issues |
...

## Phase 2 — Design
[findings]

## Phase 3 — Mobile
[findings]

## All Fixes Applied
[list of files changed]
```

Then:
```bash
npx tsc --noEmit   # verify 0 errors
git add -A
git commit -m "qa: full platform audit — [summary of fixes]"
git push origin main
```
