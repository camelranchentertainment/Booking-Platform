# Expense Tracking — Part 3: Tour Detail Expense Card

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expense summary card to the tour detail page (`pages/tours/[id].tsx`) showing total expenses for that tour, a category breakdown, and a "+ Add Expense" button that opens an inline modal.

**Architecture:** All changes are in `pages/tours/[id].tsx`. Add expenses state, load expenses for the tour's ID on mount (alongside the existing bookings/pool load), render a summary card after the Confirmed Shows card, and add an inline add-expense modal following the same pattern used elsewhere in the file.

**Tech Stack:** React, Next.js, Supabase client, existing inline-style patterns from `pages/tours/[id].tsx`.

**Prerequisite:** Parts 1 and 2 must be complete. The `expenses` table migration must be run.

---

### Task 1: Add expenses state and loader to tour detail page

**Files:**
- Modify: `pages/tours/[id].tsx`

- [ ] **Step 1: Add expense state variables alongside existing state**

Find the state block around line 61 (after `const [tour, setTour] = useState...`). Add these after the existing state declarations:

```typescript
  // Expense state
  type TourExpense = {
    id: string;
    expense_date: string;
    category: string;
    amount: number;
    notes: string | null;
    tour_id: string | null;
    booking_id: string | null;
  };
  const [tourExpenses, setTourExpenses]     = useState<TourExpense[]>([]);
  const [expModal, setExpModal] = useState<{
    open: boolean;
    mode: 'add' | 'edit';
    expense: Partial<TourExpense> | null;
    saving: boolean;
    error: string;
  }>({ open: false, mode: 'add', expense: null, saving: false, error: '' });
```

- [ ] **Step 2: Add `loadTourExpenses` function**

Find the existing `loadData` function (or the first `useEffect` that loads the tour). Add `loadTourExpenses` near it:

```typescript
  const loadTourExpenses = async (tourId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`/api/expenses?tour_id=${tourId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json();
    setTourExpenses(json.expenses || []);
  };
```

- [ ] **Step 3: Call `loadTourExpenses` after the tour is loaded**

Find where `setTour(tourData)` (or equivalent) is called after the initial data fetch. Add the call immediately after:

```typescript
    if (tourData?.id) {
      loadTourExpenses(tourData.id);
    }
```

Note: The tour ID is also available as `router.query.id` — if `tourData.id` is not immediately accessible, use:

```typescript
    if (id && typeof id === 'string') {
      loadTourExpenses(id);
    }
```

- [ ] **Step 4: Commit**

```bash
git add pages/tours/[id].tsx
git commit -m "feat: load tour expenses in tour detail page"
```

---

### Task 2: Add expense summary card to tour detail page

**Files:**
- Modify: `pages/tours/[id].tsx`

- [ ] **Step 1: Add a `fmt` helper if one doesn't exist**

Check if `fmt` is already defined in this file:

```bash
grep -n "^function fmt\|^const fmt" pages/tours/\[id\].tsx
```

If not found, add it near the top of the component function (after state declarations):

```typescript
  const fmtMoney = (n: number) => '$' + Math.round(n).toLocaleString();
```

- [ ] **Step 2: Render the expense summary card after the Confirmed Shows card**

Find the closing `</div>` of the Confirmed Shows card block (the line `</div>` that immediately precedes `{/* Outreach Pool */}`). Insert this block between the two:

```tsx
        {/* Tour Expenses */}
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="card-title">
              EXPENSES
              {tourExpenses.length > 0 && (
                <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.4rem' }}>
                  · {fmtMoney(tourExpenses.reduce((s, e) => s + Number(e.amount), 0))} total
                </span>
              )}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setExpModal({
                open: true,
                mode: 'add',
                expense: {
                  expense_date: new Date().toISOString().split('T')[0],
                  tour_id: tour?.id ?? null,
                },
                saving: false,
                error: '',
              })}>
              + Add Expense
            </button>
          </div>

          {tourExpenses.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>
              No expenses recorded for this tour yet.
            </div>
          ) : (
            <>
              {/* Category summary pills */}
              {(() => {
                const byCat: Record<string, number> = {};
                for (const e of tourExpenses) byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount);
                return (
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                    {Object.entries(byCat).map(([cat, total]) => (
                      <div key={cat} style={{ background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', padding: '0.25rem 0.6rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{cat}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#f87171', fontWeight: 600 }}>{fmtMoney(total)}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Expense rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {tourExpenses.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0.6rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)' }}>
                    <div>
                      <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: 500 }}>{e.category}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                        {new Date(e.expense_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {e.notes ? ` · ${e.notes}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#f87171', fontWeight: 600 }}>
                        {fmtMoney(Number(e.amount))}
                      </span>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem' }}
                        onClick={() => setExpModal({ open: true, mode: 'edit', expense: e, saving: false, error: '' })}>
                        Edit
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem' }}
                        onClick={async () => {
                          if (!confirm('Delete this expense?')) return;
                          const { data: { session } } = await supabase.auth.getSession();
                          await fetch(`/api/expenses/${e.id}`, {
                            method: 'DELETE',
                            headers: { Authorization: `Bearer ${session!.access_token}` },
                          });
                          if (tour?.id) loadTourExpenses(tour.id);
                        }}>
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
```

- [ ] **Step 3: Commit**

```bash
git add pages/tours/[id].tsx
git commit -m "feat: add expense summary card to tour detail page"
```

---

### Task 3: Add expense add/edit modal to tour detail page

**Files:**
- Modify: `pages/tours/[id].tsx`

- [ ] **Step 1: Add the modal before the closing `</AppShell>` tag**

Find the last `</AppShell>` in the file. Insert this block immediately before it:

```tsx
      {/* Expense Add/Edit Modal */}
      {expModal.open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setExpModal(m => ({ ...m, open: false }))}>
          <div
            style={{ background: 'var(--surface)', borderRadius: 12, padding: '1.75rem', width: 400, maxWidth: '94vw' }}
            onClick={e => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '1.25rem' }}>
              {expModal.mode === 'add' ? 'Add Expense' : 'Edit Expense'}
            </h2>

            <label style={{ display: 'block', marginBottom: '0.8rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>DATE</div>
              <input type="date" className="input" style={{ width: '100%' }}
                value={expModal.expense?.expense_date || ''}
                onChange={e => setExpModal(m => ({ ...m, expense: { ...m.expense, expense_date: e.target.value } }))} />
            </label>

            <label style={{ display: 'block', marginBottom: '0.8rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>CATEGORY <span style={{ color: '#f87171' }}>*</span></div>
              <select className="select" style={{ width: '100%' }}
                value={expModal.expense?.category || ''}
                onChange={e => setExpModal(m => ({ ...m, expense: { ...m.expense, category: e.target.value } }))}>
                <option value="">Select…</option>
                {['Gas / Mileage','Hotel / Lodging','Band Member Payments','Food / Meals','Equipment','Other'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'block', marginBottom: '0.8rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>AMOUNT <span style={{ color: '#f87171' }}>*</span></div>
              <input type="number" className="input" style={{ width: '100%' }} placeholder="0.00" min="0" step="0.01"
                value={expModal.expense?.amount ?? ''}
                onChange={e => setExpModal(m => ({ ...m, expense: { ...m.expense, amount: Number(e.target.value) } }))} />
            </label>

            <label style={{ display: 'block', marginBottom: '1.25rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>NOTES</div>
              <input type="text" className="input" style={{ width: '100%' }} placeholder="Optional"
                value={expModal.expense?.notes || ''}
                onChange={e => setExpModal(m => ({ ...m, expense: { ...m.expense, notes: e.target.value } }))} />
            </label>

            {expModal.error && (
              <div style={{ color: '#f87171', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', marginBottom: '0.75rem' }}>{expModal.error}</div>
            )}

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setExpModal(m => ({ ...m, open: false }))}>Cancel</button>
              <button className="btn btn-primary" disabled={expModal.saving}
                onClick={async () => {
                  const exp = expModal.expense;
                  if (!exp?.category)     return setExpModal(m => ({ ...m, error: 'Category is required' }));
                  if (!exp?.amount)       return setExpModal(m => ({ ...m, error: 'Amount is required' }));
                  if (!exp?.expense_date) return setExpModal(m => ({ ...m, error: 'Date is required' }));

                  setExpModal(m => ({ ...m, saving: true, error: '' }));
                  const { data: { session } } = await supabase.auth.getSession();
                  const method = expModal.mode === 'add' ? 'POST' : 'PUT';
                  const url    = expModal.mode === 'add' ? '/api/expenses' : `/api/expenses/${exp.id}`;

                  const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session!.access_token}` },
                    body: JSON.stringify({ ...exp, tour_id: exp.tour_id ?? tour?.id }),
                  });

                  if (!res.ok) {
                    const err = await res.json();
                    return setExpModal(m => ({ ...m, saving: false, error: err.error || 'Save failed' }));
                  }
                  setExpModal(m => ({ ...m, open: false, saving: false }));
                  if (tour?.id) loadTourExpenses(tour.id);
                }}>
                {expModal.saving ? 'Saving…' : expModal.mode === 'add' ? 'Add Expense' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 2: Verify the page compiles**

```bash
npm run build 2>&1 | grep -i "error\|tours/\[id\]"
```

Expected: No TypeScript errors on `tours/[id].tsx`.

- [ ] **Step 3: Manual smoke test**

1. Navigate to any tour detail page
2. Scroll past Confirmed Shows — **Expenses** card appears with "+ Add Expense" button
3. Click **+ Add Expense**, fill in date/category/amount, click **Add Expense** — row appears, total updates in card title
4. Click **Edit** on a row — modal pre-fills, save changes
5. Click **✕** on a row — confirm delete, row disappears
6. Navigate to `/financials` → Expenses tab — the same expense appears there too (shared table)

- [ ] **Step 4: Final commit**

```bash
git add pages/tours/[id].tsx
git commit -m "feat: add expense card and modal to tour detail page"
```

---

### Expense Tracking — Complete ✓

All three parts together implement the full expense tracking feature:

| Part | File(s) | What it does |
|---|---|---|
| Part 1 | `pages/api/expenses/index.ts`, `pages/api/expenses/[id].ts` | REST API: list, create, update, delete |
| Part 2 | `pages/financials.tsx` | Expenses tab with filters, table, modal; Net Income from real data |
| Part 3 | `pages/tours/[id].tsx` | Per-tour expense card with add/edit/delete |

**Next from the rebuild plan:** Run a GStack `/qa` audit of the live site, then do the live booking run for Better Than Nothin'.
