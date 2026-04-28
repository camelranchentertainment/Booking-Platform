import { useState, useEffect } from 'react';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';

type Booking = {
  id: string;
  show_date: string | null;
  fee: number | null;
  agreed_amount: number | null;
  amount_paid: number | null;
  actual_amount_received: number | null;
  payment_status: string | null;
  expenses: number | null;
  status: string;
  act: { act_name: string } | null;
  venue: { name: string; city: string; state: string } | null;
};

function fmt(n: number) {
  return '$' + Math.round(n).toLocaleString();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Financials() {
  const currentYear = new Date().getFullYear();
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

  type TourOption = { id: string; name: string };
  const [tours, setTours] = useState<TourOption[]>([]);

  const [modal, setModal] = useState<{
    open: boolean;
    mode: 'add' | 'edit';
    expense: Partial<Expense> | null;
    saving: boolean;
    error: string;
  }>({ open: false, mode: 'add', expense: null, saving: false, error: '' });

  useEffect(() => { init(); }, [year]);

  const init = async () => {
    const { data: { session: sess } } = await supabase.auth.getSession();
    const token = sess?.access_token ?? '';
    setSession(token);
    await loadBookings();
    if (token) loadExpenses(token);
    const { data: toursData } = await supabase
      .from('tours')
      .select('id, name')
      .order('created_at', { ascending: false })
      .limit(50);
    setTours((toursData as TourOption[]) || []);
  };

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

  const loadBookings = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const startDate = `${year}-01-01`;
    const endDate   = `${year}-12-31`;
    const { data } = await supabase
      .from('bookings')
      .select('id, show_date, fee, agreed_amount, amount_paid, actual_amount_received, payment_status, expenses, status, act:acts(act_name), venue:venues(name, city, state)')
      .gte('show_date', startDate)
      .lte('show_date', endDate)
      .neq('status', 'cancelled')
      .order('show_date', { ascending: true });
    setBookings((data as any[]) || []);
    setLoading(false);
  };

  const todayStr       = new Date().toISOString().split('T')[0];
  const totalFee       = bookings.reduce((s, b) => s + (Number(b.agreed_amount ?? b.fee) || 0), 0);
  const totalPaid      = bookings.reduce((s, b) => s + (Number(b.actual_amount_received ?? b.amount_paid) || 0), 0);
  const totalExpenses  = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const outstanding    = totalFee - totalPaid;
  const potential      = bookings.filter(b => b.status === 'confirmed' && b.show_date && b.show_date > todayStr && b.payment_status === 'pending')
    .reduce((s, b) => s + (Number(b.agreed_amount ?? b.fee) || 0), 0);
  const earned         = bookings.filter(b => b.status === 'completed')
    .reduce((s, b) => s + (Number(b.actual_amount_received ?? b.amount_paid) || 0), 0);
  const netIncome      = earned - totalExpenses;
  const showCount      = bookings.filter(b => b.status === 'completed' || b.show_date).length;

  // Monthly breakdown
  const monthly = MONTHS.map((month, idx) => {
    const mbs = bookings.filter(b => b.show_date && new Date(b.show_date).getMonth() === idx);
    return {
      month,
      shows:    mbs.length,
      fee:      mbs.reduce((s, b) => s + (Number(b.agreed_amount ?? b.fee) || 0), 0),
      paid:     mbs.reduce((s, b) => s + (Number(b.actual_amount_received ?? b.amount_paid) || 0), 0),
      expenses: mbs.reduce((s, b) => s + (b.expenses ? Number(b.expenses) : 0), 0),
    };
  });

  // By act
  const actMap: Record<string, { name: string; shows: number; fee: number; paid: number }> = {};
  for (const b of bookings) {
    const key = b.act?.act_name || 'Unknown';
    if (!actMap[key]) actMap[key] = { name: key, shows: 0, fee: 0, paid: 0 };
    actMap[key].shows++;
    actMap[key].fee  += Number(b.agreed_amount ?? b.fee) || 0;
    actMap[key].paid += Number(b.actual_amount_received ?? b.amount_paid) || 0;
  }
  const byAct = Object.values(actMap).sort((a, b) => b.fee - a.fee);

  // By venue
  const venueMap: Record<string, { name: string; city: string; state: string; shows: number; fee: number; paid: number }> = {};
  for (const b of bookings) {
    const key = b.venue?.name || 'Unknown';
    if (!venueMap[key]) venueMap[key] = { name: key, city: b.venue?.city || '', state: b.venue?.state || '', shows: 0, fee: 0, paid: 0 };
    venueMap[key].shows++;
    venueMap[key].fee  += Number(b.agreed_amount ?? b.fee) || 0;
    venueMap[key].paid += Number(b.actual_amount_received ?? b.amount_paid) || 0;
  }
  const byVenue = Object.values(venueMap).sort((a, b) => b.fee - a.fee);

  const downloadCSV = () => {
    const rows = [
      ['Date', 'Act', 'Venue', 'City', 'State', 'Fee', 'Paid', 'Outstanding', 'Expenses', 'Status'],
      ...bookings.map(b => [
        b.show_date || '',
        b.act?.act_name || '',
        b.venue?.name || '',
        b.venue?.city || '',
        b.venue?.state || '',
        b.fee || 0,
        b.amount_paid || 0,
        ((b.fee || 0) - (b.amount_paid || 0)).toString(),
        b.expenses || 0,
        b.status,
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `financials-${year}.csv`; a.click();
  };

  const summaryCards = [
    { label: 'Shows Booked',  value: showCount,        color: '#60a5fa',                                           sub: `${year} season` },
    { label: 'Potential',     value: fmt(potential),   color: 'var(--accent)',                                     sub: 'projected income' },
    { label: 'Earned',        value: fmt(earned),      color: '#34d399',                                           sub: 'collected from played shows' },
    { label: 'Outstanding',   value: fmt(outstanding), color: outstanding > 0 ? '#fbbf24' : '#34d399',             sub: 'total contracted minus collected' },
    { label: 'Expenses',      value: fmt(totalExpenses), color: '#f87171',                                         sub: 'recorded costs' },
    { label: 'Net Income',    value: fmt(netIncome),   color: netIncome >= 0 ? '#34d399' : '#f87171',              sub: 'earned minus expenses' },
  ];

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">Financials</h1>
          <div className="page-sub">{bookings.length} bookings in {year}</div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <select className="select" style={{ width: 100 }} value={year} onChange={e => setYear(Number(e.target.value))}>
            {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={downloadCSV}>↓ CSV</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {summaryCards.map(c => (
          <div key={c.label} className="card" style={{ padding: '1rem 1.25rem', borderTop: `3px solid ${c.color}` }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.65rem', color: c.color, lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '0.35rem' }}>{c.label}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
        {(['summary', 'byAct', 'byVenue', 'detail', 'expenses'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: '0.55rem 1.1rem',
              fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: view === v ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: view === v ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {v === 'byAct' ? 'By Act' : v === 'byVenue' ? 'By Venue' : v === 'detail' ? 'All Bookings' : v === 'expenses' ? 'Expenses' : 'Monthly'}
          </button>
        ))}
      </div>

      {loading && view !== 'expenses' ? (
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>Loading…</div>
      ) : bookings.length === 0 && view !== 'expenses' ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>
          No bookings with show dates in {year}.
        </div>
      ) : view !== 'expenses' ? (
        <>
          {/* Monthly breakdown */}
          {view === 'summary' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Month</th><th>Shows</th><th>Contracted</th><th>Collected</th><th>Expenses</th><th>Net</th></tr>
                  </thead>
                  <tbody>
                    {monthly.filter(m => m.shows > 0).map(m => (
                      <tr key={m.month}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>{m.month}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{m.shows}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--accent)' }}>{m.fee ? fmt(m.fee) : '—'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#34d399' }}>{m.paid ? fmt(m.paid) : '—'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#f87171' }}>{m.expenses ? fmt(m.expenses) : '—'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: (m.paid - m.expenses) >= 0 ? '#34d399' : '#f87171', fontWeight: 600 }}>
                          {fmt(m.paid - m.expenses)}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>TOTAL</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{showCount}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>{fmt(totalFee)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#34d399' }}>{fmt(totalPaid)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#f87171' }}>{fmt(totalExpenses)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: netIncome >= 0 ? '#34d399' : '#f87171' }}>{fmt(netIncome)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* By Act */}
          {view === 'byAct' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Act</th><th>Shows</th><th>Contracted</th><th>Collected</th><th>Outstanding</th></tr>
                  </thead>
                  <tbody>
                    {byAct.map(a => (
                      <tr key={a.name}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{a.name}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{a.shows}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--accent)' }}>{a.fee ? fmt(a.fee) : '—'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#34d399' }}>{a.paid ? fmt(a.paid) : '—'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: (a.fee - a.paid) > 0 ? '#fbbf24' : 'var(--text-muted)' }}>
                          {(a.fee - a.paid) > 0 ? fmt(a.fee - a.paid) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* By Venue */}
          {view === 'byVenue' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Venue</th><th>Location</th><th>Shows</th><th>Contracted</th><th>Collected</th></tr>
                  </thead>
                  <tbody>
                    {byVenue.map(v => (
                      <tr key={v.name}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{v.name}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{v.city}, {v.state}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{v.shows}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--accent)' }}>{v.fee ? fmt(v.fee) : '—'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#34d399' }}>{v.paid ? fmt(v.paid) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* All bookings detail */}
          {view === 'detail' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Date</th><th>Act</th><th>Venue</th><th>Fee</th><th>Paid</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {bookings.map(b => (
                      <tr key={b.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {b.show_date ? new Date(b.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{b.act?.act_name || '—'}</td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          {b.venue?.name || '—'}
                          {b.venue?.city ? <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}> · {b.venue.city}</span> : ''}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent)' }}>{b.fee ? fmt(Number(b.fee)) : '—'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: b.amount_paid ? '#34d399' : 'var(--text-muted)' }}>
                          {b.amount_paid ? fmt(Number(b.amount_paid)) : '—'}
                        </td>
                        <td>
                          <span className={`badge badge-${b.status}`} style={{ fontSize: '0.68rem' }}>{b.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Expenses tab — rendered outside the bookings conditional so it's always visible */}
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

      {/* Add / Edit Expense Modal */}
      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setModal(m => ({ ...m, open: false }))}>
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '1.75rem', width: 420, maxWidth: '94vw' }}
            onClick={e => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', marginBottom: '1.25rem' }}>
              {modal.mode === 'add' ? 'Add Expense' : 'Edit Expense'}
            </h2>

            <label style={{ display: 'block', marginBottom: '0.85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>DATE</div>
              <input type="date" className="input" style={{ width: '100%' }}
                value={modal.expense?.expense_date || ''}
                onChange={e => setModal(m => ({ ...m, expense: { ...m.expense, expense_date: e.target.value } }))} />
            </label>

            <label style={{ display: 'block', marginBottom: '0.85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>TOUR <span style={{ color: '#f87171' }}>*</span></div>
              <select className="select" style={{ width: '100%' }}
                value={modal.expense?.tour_id || ''}
                onChange={e => setModal(m => ({ ...m, expense: { ...m.expense, tour_id: e.target.value } }))}>
                <option value="">Select a tour…</option>
                {tours.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>

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

            <label style={{ display: 'block', marginBottom: '0.85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>AMOUNT <span style={{ color: '#f87171' }}>*</span></div>
              <input type="number" className="input" style={{ width: '100%' }} placeholder="0.00" min="0" step="0.01"
                value={modal.expense?.amount ?? ''}
                onChange={e => setModal(m => ({ ...m, expense: { ...m.expense, amount: Number(e.target.value) } }))} />
            </label>

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
    </AppShell>
  );
}
