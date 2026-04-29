# Camel Ranch Booking — Claude Code Instructions

## Platform
Next.js Pages Router, TypeScript, Supabase PostgreSQL, Vercel
Repo: github.com/camelranchentertainment/Booking-Platform

## Available Skills

### /qa — Full Platform QA Audit
Located at: ~/.claude/skills/gstack/QA_SKILL.md
When asked to run /qa:
1. Read ~/.claude/skills/gstack/QA_SKILL.md
2. Follow every section in order
3. Fix all issues found
4. Generate QA_REPORT.md
5. Push to main

### /review — Deep Code Review
Located at: ~/.claude/skills/gstack/REVIEW_SKILL.md
When asked to run /review:
1. Read ~/.claude/skills/gstack/REVIEW_SKILL.md
2. Run all 4 analysis angles
3. Score every finding (only report ≥ 80 confidence)
4. Fix issues found
5. Generate CODE_REVIEW_REPORT.md
6. Push to main

## Key Platform Rules
- NEVER change a superadmin's role
- Confirming a show MUST create a bookings table record
- Earned = actual_amount_received on completed shows ONLY
- Potential = agreed_amount on confirmed FUTURE shows ONLY
- Members never see financial data
- All genres supported — never assume country/americana
- Production branch: main
- Deploy: Vercel auto-deploys on push to main

## Design System
- Background: #0E0603
- Warm amber: #C8921A
- Display: Bebas Neue
- Body: Nunito
- Dark mode is default

## Database
Supabase project — all migrations must be reviewed
before running. Never auto-run migrations.
