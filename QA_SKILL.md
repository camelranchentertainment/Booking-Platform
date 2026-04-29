---
name: gstack-qa
description: Full visual and functional QA audit of a Next.js web platform. Use this skill when asked to run /qa, perform a QA audit, or visually verify the platform works correctly. Systematically checks every page, every route, every interactive element, and every data flow. Reports all issues with severity ratings and fixes what it can automatically.
---

# GStack /qa — Full Platform QA Skill

You are acting as a QA engineer performing a comprehensive quality assurance audit. Your job is to systematically check every aspect of the platform — functionality, visual correctness, data integrity, routing, auth, and mobile responsiveness. Fix every issue you can. Report everything you find.

## How to Run This Skill

When invoked, work through every section below in order. Do not skip sections. Do not ask questions. Fix issues as you find them. Keep a running issue log.

---

## SECTION 1 — PRE-FLIGHT CHECK

Before auditing anything, establish baseline:

```bash
# 1. Confirm clean build
npx tsc --noEmit 2>&1 | head -30

# 2. Confirm no build errors
npm run build 2>&1 | tail -20

# 3. Check git status — nothing should be uncommitted
git status

# 4. Confirm which branch we are on
git branch --show-current
git log --oneline -5

# 5. Check for any obvious runtime errors in key files
grep -r "console.error\|throw new Error" pages/ --include="*.tsx" --include="*.ts" | grep -v node_modules | head -20
```

If build fails — stop and fix TypeScript errors first before proceeding.

---

## SECTION 2 — ROUTING AUDIT

Check every route exists as a real file:

```bash
# List all page files
find pages/ -name "*.tsx" -o -name "*.ts" | grep -v api | grep -v _app | grep -v _document | sort

# Check sidebar nav arrays match real routes
grep -A 3 "href:" components/layout/Sidebar.tsx | grep href | grep -oP '(?<=href: ")[^"]+' | sort
```

For each route in the nav, verify the corresponding page file exists.
Flag any nav links pointing to non-existent pages as **CRITICAL**.
Flag any pages that exist but are not in any nav as **WARNING**.

---

## SECTION 3 — AUTH & ROLE GUARD AUDIT

Every authenticated page must have a role guard:

```bash
# Find pages using AppShell
grep -rl "AppShell" pages/ --include="*.tsx"

# Find pages NOT using AppShell or any auth check
grep -rL "AppShell\|getUser\|useEffect\|redirect" pages/ --include="*.tsx" | grep -v "_app\|_document\|index\|login\|register\|join" | head -20
```

Check each page in /pages:
- Public pages (index, login, register): no auth required ✓
- All other pages: must have AppShell with requireRole OR explicit auth check
- /admin: must only be accessible to superadmin
- /band/* pages: must require act_admin role
- /member/* pages: must require member role

Flag any page missing auth as **CRITICAL SECURITY**.

---

## SECTION 4 — API ROUTE AUDIT

Every API route must have authentication:

```bash
# Check all API routes for auth
for f in $(find pages/api -name "*.ts" | grep -v _app | grep -v stripe/webhook); do
  echo "=== $f ==="
  head -30 "$f" | grep -E "getUser|getAuthedSuperadmin|getAuthedUser|auth\.getUser|session"
done
```

Rules:
- All /api/admin/* must call getAuthedSuperadmin()
- All other protected routes must call getUser() or equivalent
- Public routes (/api/public/*, stripe webhooks): auth optional

Flag any route missing auth as **CRITICAL SECURITY**.

---

## SECTION 5 — DATABASE QUERY AUDIT

Check for common database issues:

```bash
# Find queries without limits (potential performance issue)
grep -rn "\.select(" pages/ lib/ --include="*.ts" --include="*.tsx" | grep -v "\.limit\|\.single\|\.maybeSingle\|count" | grep -v node_modules | head -20

# Find any hardcoded UUIDs (should be in env or from auth)
grep -rn "[0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{12\}" pages/ lib/ --include="*.ts" --include="*.tsx" | grep -v "node_modules\|\.next" | head -10

# Find tables referenced in code
grep -rh "\.from(" pages/ lib/ --include="*.ts" --include="*.tsx" | grep -oP "(?<=from\(['\"])[^'\"]+(?=['\"])" | sort -u
```

Verify critical tables exist in schema/migrations:
- bookings, tours, tour_venues, acts, venues
- user_profiles, agent_act_links, act_invitations
- email_drafts, email_logs, daily_notes, expenses

---

## SECTION 6 — CRITICAL WORKFLOW AUDIT

Test the most important workflow: Venue → Tour → Confirm → Booking → Calendar

### 6A: Tour Confirmation Flow
```bash
# Check venue-confirm.ts creates a booking record
cat pages/api/tours/venue-confirm.ts | grep -A 50 "bookings"
```

Verify the confirm flow:
1. Creates record in `bookings` table ✓
2. Sets status='confirmed', source='tour', details_pending=true ✓
3. Sets confirmed_by=user.id ✓
4. ONLY updates tour_venues.status AFTER booking insert succeeds ✓
5. Returns booking_id in response ✓

If any of these are missing — **FIX IMMEDIATELY** as this is the core workflow.

### 6B: Calendar Population
```bash
# Check calendar queries
grep -A 20 "loadBookings\|load()\|loadAll" pages/calendar.tsx | head -40
```

Verify calendar loads from bookings table with correct date filtering.

### 6C: Bookings Pipeline
```bash
# Check bookings index loadAll
grep -A 30 "loadAll" pages/bookings/index.tsx | head -40
```

Verify pipeline loads bookings created via tour confirmation (not just manually created ones).

---

## SECTION 7 — ROLE OVERRIDE PROTECTION

The most dangerous bug historically — verify it's truly fixed:

```bash
cat pages/api/accept-invite.ts | head -60
```

Verify:
1. Superadmin check is THE FIRST thing that runs after body validation
2. If user is superadmin: ONLY creates agent_act_links, NEVER touches user_profiles
3. If user has existing profile: ONLY updates act_id, never touches role column
4. New users only: full insert with role from invite

If any of these protections are missing — **FIX AS CRITICAL**.

---

## SECTION 8 — FINANCIAL DATA ACCURACY

Check earned vs potential split is correct everywhere:

```bash
# Check dashboard
grep -A 10 "earned\|potential\|Earned\|Potential" pages/dashboard.tsx | head -30

# Check band dashboard  
grep -A 10 "earned\|potential\|Earned\|Potential" pages/band/index.tsx | head -30

# Check financials
grep -A 10 "earned\|potential\|Earned\|Potential" pages/financials.tsx | head -30
```

Verify:
- EARNED = SUM of actual_amount_received WHERE status='completed'
- POTENTIAL = SUM of agreed_amount WHERE status='confirmed' AND show_date > today
- These must NEVER be combined or confused
- Financials Net Income = Earned - Expenses (not Potential - Expenses)

---

## SECTION 9 — UI/UX CONSISTENCY AUDIT

Check for common UI issues:

```bash
# Find delete operations without confirmation
grep -rn "delete\|Delete\|remove\|Remove" pages/ --include="*.tsx" | grep -v "confirm\|modal\|dialog\|window.confirm\|Are you sure" | grep -v "node_modules\|\.next" | head -20

# Find buttons with no visible text or aria labels
grep -rn "<button" pages/ components/ --include="*.tsx" | grep -v "aria-label\|children\|onClick" | head -10

# Check for console.logs left in production
grep -rn "console\.log" pages/ components/ lib/ --include="*.ts" --include="*.tsx" | grep -v "node_modules\|//.*console" | head -20
```

Issues to flag:
- Delete actions without confirmation dialogs: **HIGH**
- console.log statements in production code: **MEDIUM** — remove them
- Empty buttons: **HIGH**

---

## SECTION 10 — MOBILE RESPONSIVENESS CHECK

```bash
# Find fixed pixel widths that could break mobile
grep -rn "width: [0-9]\{3,4\}px\|min-width: [0-9]\{3,4\}px" pages/ components/ styles/ --include="*.tsx" --include="*.ts" --include="*.css" | grep -v node_modules | head -20

# Find elements that might overflow on mobile
grep -rn "overflow: hidden\|overflow:hidden" styles/ pages/ components/ --include="*.css" --include="*.tsx" | grep -v node_modules | head -10

# Check if sidebar has mobile handling
grep -n "hamburger\|mobile\|768\|sm:\|md:" components/layout/Sidebar.tsx | head -20
```

Critical mobile rules:
- No fixed widths > 100vw
- Sidebar collapses on mobile
- Stat card grids go 2x2 on mobile
- All touch targets 44px minimum
- No horizontal overflow

---

## SECTION 11 — DEPENDENCY & SECURITY SCAN

```bash
# Check for known vulnerabilities
npm audit --audit-level=high 2>&1 | head -30

# Check for unused dependencies
cat package.json | grep -E '"dependencies"|"devDependencies"' -A 50 | head -60

# Verify env vars are referenced correctly (not hardcoded)
grep -rn "process\.env\." pages/api/ --include="*.ts" | grep -v "node_modules" | grep -oP "process\.env\.[A-Z_]+" | sort -u
```

---

## SECTION 12 — GENERATE QA REPORT

After completing all sections, generate a report:

```bash
cat > QA_REPORT.md << 'EOF'
# Camel Ranch Booking — QA Report
Date: $(date)
Run by: Claude Code QA Skill (/qa)

## OVERALL STATUS
[PASS / FAIL / NEEDS ATTENTION]

## CRITICAL ISSUES (fix immediately)
[List any auth gaps, broken core workflows, security issues]

## HIGH PRIORITY ISSUES
[List broken features, 404s, data issues]

## MEDIUM PRIORITY ISSUES  
[List UI inconsistencies, missing confirmations, console.logs]

## LOW PRIORITY ISSUES
[List minor styling, missing empty states, etc]

## FIXED IN THIS SESSION
[List everything that was fixed automatically]

## REQUIRES MANUAL ACTION
[List anything needing Supabase SQL, Vercel config, etc]

## CORE WORKFLOW STATUS
- Tour → Confirm Show → Booking record created: [YES/NO]
- Booking appears in calendar: [YES/NO]
- Booking appears in pipeline: [YES/NO]
- Role override protection active: [YES/NO]
- Earned vs Potential correctly split: [YES/NO]

## MOBILE STATUS
[Pass/Fail per key page]

## BUILD STATUS
TypeScript errors: [count]
Build: [PASS/FAIL]
EOF
```

Then commit everything:
```bash
git add -A
git commit -m "QA audit: fixes applied, QA_REPORT.md generated"
git push origin main
git status
echo "QA COMPLETE — check QA_REPORT.md"
```

---

## Issue Severity Guide

| Severity | Definition |
|---|---|
| CRITICAL | Security hole, broken core workflow, data loss risk |
| HIGH | Feature completely broken, wrong data shown |
| MEDIUM | Feature partially broken, UX significantly impaired |
| LOW | Minor visual issue, missing polish |
| INFO | Observation, no action needed |
