# Expense Tracking — Part 2: Financials Expenses Tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Expenses tab to `/financials` that lists all expenses with filters, an add/edit/delete modal, and updates the Net Income summary card to use real expense data from the `expenses` table instead of the per-booking `bookings.expenses` field.

**Architecture:** All changes are in `pages/financials.tsx`. Add session state (access token), expenses state + loader, inline modal for add/edit, and a new `'expenses'` tab. The summary card `totalExpenses` is recalculated from the fetched expenses array.

**Tech Stack:** React, Next.js, Supabase client (session token), existing inline-style card/table/modal patterns from the file.

**Prerequisite:** Part 1 API routes must be deployed and the `expenses` table migration must be run.

---

### Task 1: Add session token + expenses state to `financials.tsx`

**Files:**
- Modify: `pages/financials.tsx`

- [ ] **Step 1: Add session and expenses state variables**

Find the block starting at line 25 (`const [year, setYear] = ...`) and replace it with:

```typescript
  const [year, setYear]           = useState(currentYear);
  const [bookings, setBookings]   = useState<Booking[]>([]);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState<'summary' | 'byAct' | 'byVenue' | 'detail' | 'expenses'>('summary');
  const [session, setSession]     = useState('');

  // Expenses state
  type Expense = {
    id: string;
    tour_id: string | null;
    booking_id: string | null;
    expense_date: string;
    category: string;
    amount: number;
    notes: string | null;
  };
  const [expenses, setExpenses]         = useState<Expense[]>([]);
  const [expLoading, setExpLoading]     = useState(false);
  const [filterTour, setFilterTour]     = useState('');
  const [filterCat, setFilterCat]       = useState('');
  const [filterStart, setFilterStart]   = useState('');
  const [filterEnd, setFilterEnd]       = useState('');

  // Modal state
  const [modal, setModal] = useState<{
    open: boolean;
    mode: 'add' | 'edit';
    expense: Partial<Expense> | null;
    saving: boolean;
    error: string;
  }>({ open: false, mode: 'add', expense: null, saving: false, error: '' });
```

- [ ] **Step 2: Fetch session token in the existing `useEffect` + `loadBookings`**

Find `useEffect(() => { loadBookings(); }, [year]);` and replace with:

```typescript
  useEffect(() => { init(); }, [year]);

  const init = async () => {
    const { data: { session: sess } } = await supabase.auth.getSession();
    const token = sess?.access_token ?? '';
    setSession(token);
    await loadBookings();
    if (token) loadExpenses(token);
  };
```

- [ ] **Step 3: Add `loadExpenses` function**

Add this function after `loadBookings`:

```typescript
  const loadExpenses = async (token: string, overrides?: {
    tour?: string; cat?: string; start?: string; end?: string;
  }) => {
    setExpLoading(true);
    const tour  = overrides?.tour  ?? filterTour;
    const cat   = overrides?.cat   ?? filterCat;
    const start = overrides?.start ?? filterStart;
    const end   = overrides?.end   ?? filterEnd;

    const params = new URLSearchParams();
    if (tour)  params.set('tour_id',    tour);
    if (cat)   params.set('category',   cat);
    if (start) params.set('start_date', start);
    if (end)   params.set('end_date',   end);

    const res = await fetch(`/api/expenses?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setExpenses(json.expenses || []);
    setExpLoading(false);
  };
```

- [ ] **Step 4: Update `totalExpenses` and `netIncome` to use real expense data**

Find these two lines:

```typescript
  const totalExpenses  = bookings.reduce((s, b) => s + (b.expenses ? Number(b.expenses) : 0), 0);
```

and

```typescript
  const netIncome      = earned - totalExpenses;
```

Replace both with:

```typescript
  const totalExpenses  = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const netIncome      = earned - totalExpenses;
```

- [ ] **Step 5: Commit**

```bash
git add pages/financials.tsx
git commit -m "feat: add expenses state + session token to financials"
```

---

### Task 2: Add Expenses tab button to the tab bar

**Files:**
- Modify: `pages/financials.tsx`

- [ ] **Step 1: Add 'expenses' to the tab bar**

Find this line:

```typescript
        {(['summary', 'byAct', 'byVenue', 'detail'] as const).map(v => (
```

Replace with:

```typescript
        {(['summary', 'byAct', 'byVenue', 'detail', 'expenses'] as const).map(v => (
```

- [ ] **Step 2: Update the tab label renderer**

Find this line inside the tab button:

```typescript
            {v === 'byAct' ? 'By Act' : v === 'byVenue' ? 'By Venue' : v === 'detail' ? 'All Bookings' : 'Monthly'}
```

Replace with:

```typescript
            {v === 'byAct' ? 'By Act' : v === 'byVenue' ? 'By Venue' : v === 'detail' ? 'All Bookings' : v === 'expenses' ? 'Expenses' : 'Monthly'}
```

- [ ] **Step 3: Commit**

```bash
git add pages/financials.tsx
git commit -m "feat: add Expenses tab button to financials tab bar"
```

---

### Task 3: Add the Expenses tab content (filter bar + table)

**Files:**
- Modify: `pages/financials.tsx`

- [ ] **Step 1: Fetch tours for the filter dropdown**

Add tours state near the other state variables:

```typescript
  type TourOption = { id: string; name: string };
  const [tours, setTours] = useState<TourOption[]>([]);
```

Add a tours loader to `init()`, after `loadExpenses`:

```typescript
    // load tours for filter dropdown
    const { data: toursData } = await supabase
      .from('tours')
      .select('id, name')
      .order('created_at', { ascending: false })
      .limit(50);
    setTours((toursData as TourOption[]) || []);
```

- [ ] **Step 2: Add the Expenses tab panel after the `detail` tab block**

Find the closing of the `detail` view block (it ends with `)}` after the All Bookings table). Add this immediately after:

```tsx
          {/* Expenses tab */}
          {view === 'expenses' && (
            <>
              {/* Filter bar */}
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
                <select className="select" style={{ width: 180 }}
                  value={filterTour}
                  onChange={e => { setFilterTour(e.target.value); loadExpenses(session, { tour: e.target.value }); }}>
                  <option value="">All Tours</option>
                  {tours.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select className="select" style={{ width: 170 }}
                  value={filterCat}
                  onChange={e => { setFilterCat(e.target.value); loadExpenses(session, { cat: e.target.value }); }}>
                  <option value="">All Categories</option>
                  {['Gas / Mileage','Hotel / Lodging','Band Member Payments','Food / Meals','Equipment','Other'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input type="date" className="input" style={{ width: 145 }}
                  value={filterStart}
                  onChange={e => { setFilterStart(e.target.value); loadExpenses(session, { start: e.target.value }); }} />
                <input type="date" className="input" style={{ width: 145 }}
                  value={filterEnd}
                  onChange={e => { setFilterEnd(e.target.value); loadExpenses(session, { end: e.target.value }); }} />
                <button className="btn btn-primary" style={{ marginLeft: 'auto' }}
                  onClick={() => setModal({ open: true, mode: 'add', expense: { expense_date: new Date().toISOString().split('T')[0] }, saving: false, error: '' })}>
                  + Add Expense
                </button>
              </div>

              {/* Summary by category */}
              {expenses.length > 0 && (() => {
                const byCat: Record<string, number> = {};
                for (const e of expenses) byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount);
                return (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    {Object.entries(byCat).map(([cat, total]) => (
                      <div key={cat} className="card" style={{ padding: '0.5rem 0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{cat}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#f87171', fontWeight: 600 }}>{fmt(total)}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Expense table */}
              {expLoading ? (
                <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>Loading…</div>
              ) : expenses.length === 0 ? (
                <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>
                  No expenses recorded yet. Use <strong>+ Add Expense</strong> to add one.
                </div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Category</th>
                          <th>Amount</th>
                          <th>Notes</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map(e => (
                          <tr key={e.id}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                              {new Date(e.expense_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                            <td style={{ fontSize: '0.85rem' }}>{e.category}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#f87171', fontWeight: 600 }}>
                              {fmt(Number(e.amount))}
                            </td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {e.notes || '—'}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <button className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', marginRight: '0.3rem' }}
                                onClick={() => setModal({ open: true, mode: 'edit', expense: e, saving: false, error: '' })}>
                                Edit
                              </button>
                              <button className="btn btn-danger" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                                onClick={async () => {
                                  if (!confirm('Delete this expense?')) return;
                                  await fetch(`/api/expenses/${e.id}`, {
                                    method: 'DELETE',
                                    headers: { Authorization: `Bearer ${session}` },
                                  });
                                  loadExpenses(session);
                                }}>
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                        <tr style={{ borderTop: '2px solid var(--border)' }}>
                          <td colSpan={2} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>TOTAL</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#f87171' }}>{fmt(totalExpenses)}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
```

- [ ] **Step 3: Commit**

```bash
git add pages/financials.tsx
git commit -m "feat: add expenses tab content with filter bar and table"
```

---

### Task 4: Add Add/Edit expense modal

**Files:**
- Modify: `pages/financials.tsx`

- [ ] **Step 1: Add the modal JSX before the closing `</AppShell>` tag**

Add this block immediately before `</AppShell>`:

```tsx
      {/* Add / Edit Expense Modal */}
      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setModal(m => ({ ...m, open: false }))}>
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '1.75rem', width: 420, maxWidth: '94vw' }}
            onClick={e => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', marginBottom: '1.25rem' }}>
              {modal.mode === 'add' ? 'Add Expense' : 'Edit Expense'}
            </h2>

            {/* Date */}
            <label style={{ display: 'block', marginBottom: '0.85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>DATE</div>
              <input type="date" className="input" style={{ width: '100%' }}
                value={modal.expense?.expense_date || ''}
                onChange={e => setModal(m => ({ ...m, expense: { ...m.expense, expense_date: e.target.value } }))} />
            </label>

            {/* Tour */}
            <label style={{ display: 'block', marginBottom: '0.85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>TOUR <span style={{ color: '#f87171' }}>*</span></div>
              <select className="select" style={{ width: '100%' }}
                value={modal.expense?.tour_id || ''}
                onChange={e => setModal(m => ({ ...m, expense: { ...m.expense, tour_id: e.target.value } }))}>
                <option value="">Select a tour…</option>
                {tours.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>

            {/* Category */}
            <label style={{ display: 'block', marginBottom: '0.85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>CATEGORY <span style={{ color: '#f87171' }}>*</span></div>
              <select className="select" style={{ width: '100%' }}
                value={modal.expense?.category || ''}
                onChange={e => setModal(m => ({ ...m, expense: { ...m.expense, category: e.target.value } }))}>
                <option value="">Select a category…</option>
                {['Gas / Mileage','Hotel / Lodging','Band Member Payments','Food / Meals','Equipment','Other'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>

            {/* Amount */}
            <label style={{ display: 'block', marginBottom: '0.85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>AMOUNT <span style={{ color: '#f87171' }}>*</span></div>
              <input type="number" className="input" style={{ width: '100%' }} placeholder="0.00" min="0" step="0.01"
                value={modal.expense?.amount ?? ''}
                onChange={e => setModal(m => ({ ...m, expense: { ...m.expense, amount: Number(e.target.value) } }))} />
            </label>

            {/* Notes */}
            <label style={{ display: 'block', marginBottom: '1.25rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>NOTES</div>
              <input type="text" className="input" style={{ width: '100%' }} placeholder="Optional note"
                value={modal.expense?.notes || ''}
                onChange={e => setModal(m => ({ ...m, expense: { ...m.expense, notes: e.target.value } }))} />
            </label>

            {modal.error && (
              <div style={{ color: '#f87171', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{modal.error}</div>
            )}

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setModal(m => ({ ...m, open: false }))}>Cancel</button>
              <button className="btn btn-primary" disabled={modal.saving}
                onClick={async () => {
                  const exp = modal.expense;
                  if (!exp?.tour_id)      return setModal(m => ({ ...m, error: 'Tour is required' }));
                  if (!exp?.category)     return setModal(m => ({ ...m, error: 'Category is required' }));
                  if (!exp?.amount)       return setModal(m => ({ ...m, error: 'Amount is required' }));
                  if (!exp?.expense_date) return setModal(m => ({ ...m, error: 'Date is required' }));

                  setModal(m => ({ ...m, saving: true, error: '' }));
                  const method = modal.mode === 'add' ? 'POST' : 'PUT';
                  const url    = modal.mode === 'add' ? '/api/expenses' : `/api/expenses/${exp.id}`;
                  const res    = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session}` },
                    body: JSON.stringify(exp),
                  });
                  if (!res.ok) {
                    const err = await res.json();
                    return setModal(m => ({ ...m, saving: false, error: err.error || 'Save failed' }));
                  }
                  setModal(m => ({ ...m, open: false, saving: false }));
                  loadExpenses(session);
                }}>
                {modal.saving ? 'Saving…' : modal.mode === 'add' ? 'Add Expense' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 2: Verify the page compiles**

```bash
npm run build 2>&1 | grep -i "error\|financials"
```

Expected: No TypeScript errors on `financials.tsx`.

- [ ] **Step 3: Manual smoke test in browser**

1. Navigate to `/financials`
2. Click the **Expenses** tab — should show "No expenses recorded yet"
3. Click **+ Add Expense**, fill in date/tour/category/amount, click **Add Expense**
4. Row appears in table, total updates
5. Click **Edit** on the row, change amount, click **Save Changes** — row updates
6. Click **Delete** on the row, confirm — row disappears
7. Check **Monthly** tab — Net Income card now reflects real expenses

- [ ] **Step 4: Commit**

```bash
git add pages/financials.tsx
git commit -m "feat: add/edit/delete expense modal in financials expenses tab"
```

---

**Part 2 complete.** Proceed to `2026-04-28-expenses-part3-tour-card.md` for the tour detail expense summary card.
