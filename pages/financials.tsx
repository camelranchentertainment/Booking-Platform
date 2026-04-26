import { useState, useEffect } from 'react';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';

type Booking = {
  id: string;
  show_date: string | null;
  fee: number | null;
  amount_paid: number | null;
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
  const [year, setYear]       = useState(currentYear);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState<'summary' | 'byAct' | 'byVenue' | 'detail'>('summary');

  useEffect(() => { loadBookings(); }, [year]);

  const loadBookings = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const startDate = `${year}-01-01`;
    const endDate   = `${year}-12-31`;
    const { data } = await supabase
      .from('bookings')
      .select('id, show_date, fee, amount_paid, payment_status, expenses, status, act:acts(act_name), venue:venues(name, city, state)')
      .gte('show_date', startDate)
      .lte('show_date', endDate)
      .neq('status', 'cancelled')
      .order('show_date', { ascending: true });
    setBookings((data as any[]) || []);
    setLoading(false);
  };

  const totalFee       = bookings.reduce((s, b) => s + (b.fee ? Number(b.fee) : 0), 0);
  const totalPaid      = bookings.reduce((s, b) => s + (b.amount_paid ? Number(b.amount_paid) : 0), 0);
  const totalExpenses  = bookings.reduce((s, b) => s + (b.expenses ? Number(b.expenses) : 0), 0);
  const outstanding    = totalFee - totalPaid;
  const netIncome      = totalPaid - totalExpenses;
  const showCount      = bookings.filter(b => b.status === 'completed' || b.show_date).length;

  // Monthly breakdown
  const monthly = MONTHS.map((month, idx) => {
    const mbs = bookings.filter(b => b.show_date && new Date(b.show_date).getMonth() === idx);
    return {
      month,
      shows:    mbs.length,
      fee:      mbs.reduce((s, b) => s + (b.fee ? Number(b.fee) : 0), 0),
      paid:     mbs.reduce((s, b) => s + (b.amount_paid ? Number(b.amount_paid) : 0), 0),
      expenses: mbs.reduce((s, b) => s + (b.expenses ? Number(b.expenses) : 0), 0),
    };
  });

  // By act
  const actMap: Record<string, { name: string; shows: number; fee: number; paid: number }> = {};
  for (const b of bookings) {
    const key = b.act?.act_name || 'Unknown';
    if (!actMap[key]) actMap[key] = { name: key, shows: 0, fee: 0, paid: 0 };
    actMap[key].shows++;
    actMap[key].fee  += b.fee ? Number(b.fee) : 0;
    actMap[key].paid += b.amount_paid ? Number(b.amount_paid) : 0;
  }
  const byAct = Object.values(actMap).sort((a, b) => b.fee - a.fee);

  // By venue
  const venueMap: Record<string, { name: string; city: string; state: string; shows: number; fee: number; paid: number }> = {};
  for (const b of bookings) {
    const key = b.venue?.name || 'Unknown';
    if (!venueMap[key]) venueMap[key] = { name: key, city: b.venue?.city || '', state: b.venue?.state || '', shows: 0, fee: 0, paid: 0 };
    venueMap[key].shows++;
    venueMap[key].fee  += b.fee ? Number(b.fee) : 0;
    venueMap[key].paid += b.amount_paid ? Number(b.amount_paid) : 0;
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
    { label: 'Shows Booked', value: showCount, color: '#60a5fa' },
    { label: 'Total Contracted', value: fmt(totalFee), color: 'var(--accent)' },
    { label: 'Collected', value: fmt(totalPaid), color: '#34d399' },
    { label: 'Outstanding', value: fmt(outstanding), color: outstanding > 0 ? '#fbbf24' : '#34d399' },
    { label: 'Expenses', value: fmt(totalExpenses), color: '#f87171' },
    { label: 'Net Income', value: fmt(netIncome), color: netIncome >= 0 ? '#34d399' : '#f87171' },
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
          </div>
        ))}
      </div>

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
        {(['summary', 'byAct', 'byVenue', 'detail'] as const).map(v => (
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
            {v === 'byAct' ? 'By Act' : v === 'byVenue' ? 'By Venue' : v === 'detail' ? 'All Bookings' : 'Monthly'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>Loading…</div>
      ) : bookings.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>
          No bookings with show dates in {year}.
        </div>
      ) : (
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
      )}
    </AppShell>
  );
}
