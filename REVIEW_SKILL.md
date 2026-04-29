---
name: gstack-review
description: Deep code review of a Next.js platform before pushing to production. Use this skill when asked to run /review, perform a code review, or check code quality before deploying. Runs 4 parallel analysis angles: spec compliance, bug detection, git history context, and security. Scores every finding 0-100 and only surfaces issues above the threshold (default 80). Fixes what it can. Reports everything.
---

# GStack /review — Deep Code Review Skill

You are acting as a senior engineering team performing a multi-angle code review. You analyze the codebase from 4 different perspectives simultaneously, score every finding by confidence (0-100), and only report issues with confidence ≥ 80. This filters noise and gives a focused list of things that actually matter.

## The 4 Review Angles

1. **Spec Compliance** — Does the code do what it was designed to do? Does the booking confirmation actually create a booking? Does the role guard actually guard?
2. **Bug Detection** — Race conditions, null references, uncaught errors, wrong data types, off-by-one errors, async/await misuse
3. **Git History Context** — What changed recently? Are there patterns of the same bug being fixed repeatedly? Are there partial implementations?
4. **Security Analysis** — Auth gaps, exposed secrets, SQL injection risks, data leakage between users

---

## How to Run This Review

Work through every angle below. Score each finding. Only report findings with confidence ≥ 80. Fix what you can automatically. Report the rest.

---

## ANGLE 1 — SPEC COMPLIANCE REVIEW

Check that every major feature does exactly what it is supposed to do.

### 1A: Core Booking Workflow
```bash
# The spec: confirm show → creates booking → appears in calendar + pipeline
cat pages/api/tours/venue-confirm.ts
```

Verify against spec:
- [ ] handler() inserts into bookings table
- [ ] booking insert includes: act_id, venue_id, tour_id, show_date, status='confirmed', source='tour', confirmed_by, details_pending=true
- [ ] tour_venues update ONLY happens after booking insert succeeds
- [ ] calendar event created or booking_date set for calendar to find
- [ ] confirmation email sent to venue
- [ ] green success toast triggered in UI

Confidence score each gap found. Report ≥ 80.

### 1B: Role System Spec
```bash
cat pages/api/accept-invite.ts
grep -n "superadmin\|role" pages/api/accept-invite.ts | head -30
```

Verify:
- [ ] Superadmin check is FIRST — before all other logic
- [ ] Existing profile: only act_id updated, role column never touched
- [ ] New user: role from invite is used
- [ ] Agent invite: only creates profile if none exists

### 1C: Financial Display Spec
```bash
grep -n "earned\|actual_amount\|agreed_amount\|Potential" pages/dashboard.tsx pages/band/index.tsx pages/financials.tsx 2>/dev/null | head -40
```

Verify:
- [ ] EARNED uses actual_amount_received WHERE status='completed'
- [ ] POTENTIAL uses agreed_amount WHERE status='confirmed' AND future date
- [ ] These are NEVER summed together
- [ ] Net Income = EARNED - expenses (not potential - expenses)

### 1D: Member Data Privacy Spec
```bash
grep -n "isMember\|member\|role" pages/today.tsx | head -30
grep -n "deal_type\|agreed_amount\|payment" pages/today.tsx | head -20
```

Verify:
- [ ] Members cannot see deal_type
- [ ] Members cannot see agreed_amount or payment amounts
- [ ] Members cannot see financial data anywhere
- [ ] Members CAN see: venue, times, hotel Y/N, meals Y/N

### 1E: Daily Notes Visibility Spec
```bash
cat pages/api/notes/index.ts | grep -A 20 "visibility\|buildVisibility"
```

Verify:
- [ ] agent_only: only the author sees it
- [ ] band_admin: author + band admins for same act
- [ ] all_members: author + all members of same act
- [ ] Visibility filter is applied in the API, not just the UI

---

## ANGLE 2 — BUG DETECTION

Look for common classes of bugs in Next.js/React/Supabase applications.

### 2A: Async/Await Issues
```bash
# Find .then() mixed with async/await (inconsistent patterns)
grep -rn "\.then(\|\.catch(" pages/ --include="*.tsx" --include="*.ts" | grep -v node_modules | head -20

# Find unhandled promise rejections
grep -rn "await " pages/ --include="*.tsx" --include="*.ts" | grep -v "try\|catch\|\.catch" | grep -v node_modules | head -10
```

Look for:
- async functions without try/catch around Supabase calls
- Missing error handling on .insert() .update() .delete()
- setLoading(false) not called in error paths (UI stuck in loading)

### 2B: Null/Undefined References
```bash
# Find potential null reference errors
grep -rn "\.id\b\|\.email\b\|\.name\b" pages/ --include="*.tsx" | grep -v "?\." | grep -v "|| \|??\|if (" | grep -v node_modules | head -20
```

Look for:
- Accessing properties on potentially null objects without optional chaining
- Array methods called on values that might be undefined
- user.id accessed before auth check completes

### 2C: React Hook Issues
```bash
# Find useEffect with empty dependency array that uses external state
grep -B 5 "useEffect" pages/ components/ -r --include="*.tsx" | grep -A 3 "useEffect" | head -40

# Find state updates after unmount risk
grep -rn "useState\|setLoading\|setError" pages/ --include="*.tsx" | grep -v "const \[" | head -20
```

Look for:
- useEffect calling async functions without cleanup
- setState called after component might have unmounted
- Missing dependency array (infinite loop risk)
- Stale closure values in useEffect

### 2D: Supabase Query Issues
```bash
# Find queries that don't check for errors
grep -rn "supabase\.from\|getServiceClient" pages/ lib/ --include="*.ts" --include="*.tsx" | head -20

# Find inserts/updates that don't verify success
grep -A 5 "\.insert\|\.update\|\.delete\|\.upsert" pages/api/ -r --include="*.ts" | grep -v "error\|Error" | head -20
```

Look for:
- Supabase queries that ignore the error return value
- Insert/update called but success not verified before continuing
- RLS errors silently returning empty data instead of throwing

### 2E: Type Safety Issues
```bash
npx tsc --noEmit 2>&1 | head -40
```

Every TypeScript error is a potential runtime bug. Fix all of them.

### 2F: State Management Issues
```bash
# Find direct state mutation
grep -rn "push(\|splice(\|\.sort(" pages/ components/ --include="*.tsx" | grep -v "const\|let\|var\|return\|useState" | head -20
```

Look for:
- Direct mutation of React state arrays/objects
- Missing key props on mapped elements
- Key props using array index (causes reconciliation bugs)

---

## ANGLE 3 — GIT HISTORY CONTEXT

Learn from past bugs to predict future ones.

```bash
# Recent commits — what has been changing?
git log --oneline -20

# Files changed most frequently (bug hotspots)
git log --pretty=format: --name-only | sort | uniq -c | sort -rg | head -15

# Find commits with "fix" in message (recurring bug patterns)
git log --oneline --grep="fix\|Fix\|FIX\|bug\|Bug" | head -20

# Check if same files keep getting fixed
git log --oneline --name-only -- pages/api/tours/venue-confirm.ts 2>/dev/null | head -10
git log --oneline --name-only -- pages/api/accept-invite.ts 2>/dev/null | head -10
git log --oneline --name-only -- components/layout/AppShell.tsx 2>/dev/null | head -10
```

Analyze patterns:
- Files fixed more than 3 times = structural problem, not just a bug
- Same error type recurring = missing abstraction or test
- Recent large deletions = potential regression risk

Look for:
- [ ] venue-confirm.ts has been patched multiple times → verify it's fully stable
- [ ] accept-invite.ts has had role override fixes → verify all protections in place
- [ ] AppShell.tsx type errors recurring → verify type definitions complete

---

## ANGLE 4 — SECURITY ANALYSIS

Check for security vulnerabilities specific to this platform.

### 4A: Secret Exposure
```bash
# Check for hardcoded secrets
grep -rn "SUPABASE_SERVICE_ROLE\|sk_live\|sk_test\|rk_live" pages/ components/ --include="*.ts" --include="*.tsx" | grep -v "process\.env" | grep -v node_modules

# Check .env files are gitignored
cat .gitignore | grep -E "\.env|env\."

# Verify no secrets in git history
git log --all --full-history --oneline -- .env .env.local .env.production 2>/dev/null | head -5
```

### 4B: Authorization Bypass Risks
```bash
# Find API routes missing auth entirely
for f in $(find pages/api -name "*.ts" -not -path "*/stripe/webhook*" -not -path "*/public/*" -not -path "*/auth/*"); do
  if ! grep -q "getUser\|getAuthedSuperadmin\|getAuthedUser\|getSession\|auth\.getUser" "$f" 2>/dev/null; then
    echo "POSSIBLE MISSING AUTH: $f"
  fi
done

# Check admin routes all have superadmin guard
for f in $(find pages/api/admin -name "*.ts"); do
  if ! grep -q "getAuthedSuperadmin" "$f" 2>/dev/null; then
    echo "MISSING SUPERADMIN GUARD: $f"
  fi
done
```

### 4C: Data Isolation (Multi-Tenant)
```bash
# Check that queries filter by user_id or act_id (not returning all users' data)
grep -rn "\.select(" pages/api/ --include="*.ts" | grep -v "\.eq(\|\.filter(\|user_id\|act_id\|agent_id" | grep -v "admin\|system" | head -20
```

Look for:
- Queries that could return other users' data
- Missing user_id/act_id filters on sensitive data
- Supabase service client used where anon client should be used

### 4D: Input Validation
```bash
# Find API routes that use request body directly without validation
grep -A 10 "req\.body" pages/api/ -r --include="*.ts" | grep -v "const \|let \|if (\|parse\|trim" | head -20
```

Look for:
- Direct use of req.body values in database queries
- Missing type validation on numeric fields (SQL injection via type coercion)
- Email fields not sanitized before sending

---

## CONFIDENCE SCORING GUIDE

Score each finding before reporting:

| Score | Meaning |
|---|---|
| 95-100 | Confirmed bug — tested and reproduced |
| 85-94 | Very likely bug — strong code evidence |
| 80-84 | Probable issue — warrants investigation |
| 70-79 | Possible issue — low priority (NOT reported) |
| < 70 | Noise — skip entirely |

**Only report findings with confidence ≥ 80.**

---

## GENERATE REVIEW REPORT

```bash
cat > CODE_REVIEW_REPORT.md << 'EOF'
# Camel Ranch Booking — Code Review Report
Date: $(date)
Reviewer: Claude Code Review Skill (/review)
Method: 4-angle analysis with confidence scoring

## EXECUTIVE SUMMARY
[Overall health: GREEN / YELLOW / RED]
[Total findings: X critical, Y high, Z medium]

## CRITICAL FINDINGS (confidence ≥ 90)
[Each finding: Description | File:Line | Confidence | Fixed Y/N]

## HIGH FINDINGS (confidence 80-89)
[Each finding: Description | File:Line | Confidence | Fixed Y/N]

## SPEC COMPLIANCE ISSUES
[Any features not doing what they are supposed to do]

## RECURRING PATTERNS (from git history)
[Files/bugs that keep reappearing — root cause needed]

## SECURITY FINDINGS
[Auth gaps, data isolation issues, secret exposure]

## FIXES APPLIED IN THIS SESSION
[List of everything fixed automatically]

## REQUIRES MANUAL ACTION
[SQL migrations, env var changes, Vercel config]

## VERDICT
[Ship it / Fix these first / Major rework needed]
EOF

git add -A
git commit -m "Code review: fixes applied, CODE_REVIEW_REPORT.md generated"
git push origin main
git status
echo "REVIEW COMPLETE — check CODE_REVIEW_REPORT.md"
```

---

## How to Invoke Each Angle Selectively

If you only want one angle, you can say:
- "Run /review spec" — runs only Angle 1 (spec compliance)
- "Run /review bugs" — runs only Angle 2 (bug detection)
- "Run /review history" — runs only Angle 3 (git history)
- "Run /review security" — runs only Angle 4 (security)
- "Run /review" — runs all 4 angles (default)
