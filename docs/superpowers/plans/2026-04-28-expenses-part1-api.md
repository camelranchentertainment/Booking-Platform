# Expense Tracking — Part 1: API Routes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `/api/expenses` REST endpoints (list/create/update/delete) backed by the `expenses` Supabase table.

**Architecture:** Two Next.js API route files following the exact same pattern as `pages/api/notes/index.ts` — Bearer token auth via `getServiceClient()`, role+act_id resolved from `user_profiles`. No RLS bypass needed beyond what the service client already provides; we enforce ownership in the handler.

**Tech Stack:** Next.js API routes, Supabase service client, TypeScript

**Prerequisite:** The `expenses` migration from Section 8.2 of the PRD must be run in Supabase before these routes will work.

---

### Task 1: Create `pages/api/expenses/index.ts` (GET list + POST create)

**Files:**
- Create: `pages/api/expenses/index.ts`

- [ ] **Step 1: Create the file with auth helper and types**

```typescript
// pages/api/expenses/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export type Expense = {
  id: string;
  user_id: string;
  act_id: string | null;
  tour_id: string | null;
  booking_id: string | null;
  expense_date: string;
  category: string;
  amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const EXPENSE_CATEGORIES = [
  'Gas / Mileage',
  'Hotel / Lodging',
  'Band Member Payments',
  'Food / Meals',
  'Equipment',
  'Other',
] as const;

async function getAuthedUser(req: NextApiRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const svc = getServiceClient();
  const { data: { user } } = await svc.auth.getUser(token);
  return user ?? null;
}
```

- [ ] **Step 2: Add the GET handler (list expenses)**

```typescript
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const svc = getServiceClient();

  // Resolve act_id for this user
  const { data: profile } = await svc
    .from('user_profiles')
    .select('role, act_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return res.status(401).json({ error: 'Profile not found' });

  let userActId: string | null = profile.act_id;
  if (!userActId && (profile.role === 'act_admin' || profile.role === 'superadmin')) {
    const { data: owned } = await svc
      .from('acts')
      .select('id')
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    userActId = owned?.id ?? null;
  }

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { tour_id, start_date, end_date, category } = req.query;

    let query = svc
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('expense_date', { ascending: false });

    if (tour_id)   query = query.eq('tour_id', tour_id as string);
    if (category)  query = query.eq('category', category as string);
    if (start_date) query = query.gte('expense_date', start_date as string);
    if (end_date)   query = query.lte('expense_date', end_date as string);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ expenses: data || [] });
  }
```

- [ ] **Step 3: Add the POST handler (create expense)**

```typescript
  // ── POST ─────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { tour_id, booking_id, expense_date, category, amount, notes } = req.body as {
      tour_id: string;
      booking_id?: string | null;
      expense_date: string;
      category: string;
      amount: number;
      notes?: string | null;
    };

    if (!tour_id)      return res.status(400).json({ error: 'tour_id required' });
    if (!expense_date) return res.status(400).json({ error: 'expense_date required' });
    if (!category)     return res.status(400).json({ error: 'category required' });
    if (!amount || isNaN(Number(amount))) return res.status(400).json({ error: 'amount required' });

    const { data, error } = await svc
      .from('expenses')
      .insert({
        user_id:      user.id,
        act_id:       userActId,
        tour_id,
        booking_id:   booking_id ?? null,
        expense_date,
        category,
        amount:       Number(amount),
        notes:        notes ?? null,
        updated_at:   new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ expense: data });
  }

  return res.status(405).end();
}
```

- [ ] **Step 4: Verify GET returns empty array before table exists**

```bash
# Get a session token from the browser devtools (Application > Local Storage > supabase token)
# Or use this one-liner from the Next.js dev server console:
curl -s http://localhost:3000/api/expenses \
  -H "Authorization: Bearer YOUR_TOKEN" | python3 -m json.tool
```

Expected: `{"expenses":[]}` or a Supabase error about the table not existing (both confirm the route is wired up).

- [ ] **Step 5: Commit**

```bash
git add pages/api/expenses/index.ts
git commit -m "feat: add GET/POST /api/expenses endpoint"
```

---

### Task 2: Create `pages/api/expenses/[id].ts` (PUT update + DELETE)

**Files:**
- Create: `pages/api/expenses/[id].ts`

- [ ] **Step 1: Create the file**

```typescript
// pages/api/expenses/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

async function getAuthedUser(req: NextApiRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const svc = getServiceClient();
  const { data: { user } } = await svc.auth.getUser(token);
  return user ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id required' });

  const svc = getServiceClient();

  // Confirm ownership before any mutation
  const { data: existing } = await svc
    .from('expenses')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing.user_id !== user.id) return res.status(403).json({ error: 'Forbidden' });
```

- [ ] **Step 2: Add PUT handler (update expense)**

```typescript
  // ── PUT ──────────────────────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const { tour_id, booking_id, expense_date, category, amount, notes } = req.body as {
      tour_id?: string;
      booking_id?: string | null;
      expense_date?: string;
      category?: string;
      amount?: number;
      notes?: string | null;
    };

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (tour_id !== undefined)      updates.tour_id      = tour_id;
    if (booking_id !== undefined)   updates.booking_id   = booking_id;
    if (expense_date !== undefined) updates.expense_date = expense_date;
    if (category !== undefined)     updates.category     = category;
    if (amount !== undefined)       updates.amount       = Number(amount);
    if (notes !== undefined)        updates.notes        = notes;

    const { data, error } = await svc
      .from('expenses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ expense: data });
  }
```

- [ ] **Step 3: Add DELETE handler**

```typescript
  // ── DELETE ───────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { error } = await svc.from('expenses').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).end();
}
```

- [ ] **Step 4: Verify the route compiles**

```bash
# In the dev server terminal — no TypeScript errors should appear
npm run build 2>&1 | grep -i "error\|expenses"
```

Expected: No errors mentioning `expenses/[id].ts`.

- [ ] **Step 5: Commit**

```bash
git add pages/api/expenses/[id].ts
git commit -m "feat: add PUT/DELETE /api/expenses/[id] endpoint"
```

---

### Task 3: Database migration reminder + smoke test

This task confirms the API works end-to-end after the Supabase migration is run.

- [ ] **Step 1: Run the migration in Supabase SQL Editor**

Paste this into the Supabase SQL Editor (Dashboard → SQL Editor → New query):

```sql
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  act_id uuid REFERENCES acts(id) ON DELETE SET NULL,
  tour_id uuid REFERENCES tours(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  expense_date date NOT NULL,
  category text NOT NULL,
  amount numeric NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Users can read their own expenses
CREATE POLICY "expenses_select" ON expenses FOR SELECT USING (auth.uid() = user_id);
-- Users can insert their own expenses
CREATE POLICY "expenses_insert" ON expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Users can update their own expenses
CREATE POLICY "expenses_update" ON expenses FOR UPDATE USING (auth.uid() = user_id);
-- Users can delete their own expenses
CREATE POLICY "expenses_delete" ON expenses FOR DELETE USING (auth.uid() = user_id);
```

- [ ] **Step 2: Smoke test POST (create)**

```bash
curl -s -X POST http://localhost:3000/api/expenses \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tour_id": "YOUR_TOUR_ID",
    "expense_date": "2026-04-28",
    "category": "Gas / Mileage",
    "amount": 45.00,
    "notes": "Drive to Nashville"
  }' | python3 -m json.tool
```

Expected: `{"expense": {"id": "...", "category": "Gas / Mileage", "amount": 45, ...}}`

- [ ] **Step 3: Smoke test GET (list)**

```bash
curl -s "http://localhost:3000/api/expenses?tour_id=YOUR_TOUR_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" | python3 -m json.tool
```

Expected: `{"expenses": [{"id": "...", "category": "Gas / Mileage", ...}]}`

- [ ] **Step 4: Smoke test DELETE**

```bash
curl -s -X DELETE http://localhost:3000/api/expenses/EXPENSE_ID \
  -H "Authorization: Bearer YOUR_TOKEN" -v 2>&1 | grep "< HTTP"
```

Expected: `< HTTP/1.1 204 No Content`

- [ ] **Step 5: Commit**

```bash
git add database/expenses.sql  # if you saved the migration SQL locally
git commit -m "feat: expenses table migration + API smoke tested"
```

---

**Part 1 complete.** Proceed to `2026-04-28-expenses-part2-financials-tab.md` for the Expenses tab in `/financials`.
