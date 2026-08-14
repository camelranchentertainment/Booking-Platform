import { useState, useEffect } from 'react';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';
import { getActId } from '../lib/bookingQueries';
import { parseLocalDate, formatShowDate } from '../lib/formatDate';

type Booking = {
  id: string;
  show_date: string | null;
  fee: number | null;
  agreed_amount: number | null;
  actual_amount_received: number | null;
  final_payment_received: number | null;
  payment_status: string | null;
  status: string;
  act: { act_name: string } | null;
  venue: { name: string; city: string; state: string } | null;
};

type Expense = {
  id: string;
  tour_id: string | null;
  booking_id: string | null;
  expense_date: string;
  category: string;
  amount: number;
  notes: string | null;
  personnel_id: string | null;
};

function fmt(n: number) {
  return '$' + Math.round(n).toLocaleString();
}

// Priority fallback: actual_amount_received → final_payment_received → agreed_amount → fee
function bookingIncome(b: Booking): number {
  return Number(b.actual_amount_received ?? b.final_payment_received ?? b.agreed_amount ?? b.fee) || 0;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TAB_LABELS: Record<string, string> = {
  summary:      'Monthly',
  byAct:        'By Act',
  byVenue:      'By Venue',
  detail:       'All Bookings',
  expenses:     'Expenses',
  incexp:       'Income & Expenses',
  taxsummary:   'Tax Summary',
  contractors:  'Contractors',
};

type View = 'summary' | 'byAct' | 'byVenue' | 'detail' | 'expenses' | 'incexp' | 'taxsummary' | 'contractors';
const REPORT_VIEWS: View[] = ['incexp', 'taxsummary', 'contractors'];

function printReport(title: string, htmlContent: string) {
  const w = window.open('', '_blank', 'width=820,height=700');
  if (!w) { alert('Allow pop-ups to print reports.'); return; }
  w.document.write(`<!DOCTYPE html><html><head>
    <title>${title}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#000;padding:2.5rem;font-size:13px}
      h1{font-size:1.3rem;margin-bottom:0.2rem}
      .subtitle{color:#555;font-size:0.8rem;margin-bottom:1.5rem}
      .section{margin-bottom:1.75rem}
      .section-title{font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #000;padding-bottom:0.25rem;margin-bottom:0.6rem}
      table{width:100%;border-collapse:collapse}
      th{text-align:left;padding:0.35rem 0.5rem;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #000}
      th.r,td.r{text-align:right}
      td{padding:0.35rem 0.5rem;border-bottom:1px solid #eee}
      tr.total td{font-weight:700;border-top:2px solid #000;border-bottom:none;padding-top:0.5rem}
      tr.subtotal td{font-weight:600;background:#f9f9f9}
      .flag{color:#92400e;font-size:0.72rem;margin-left:0.4rem}
      .note{font-size:0.72rem;color:#666;margin-top:0.5rem;line-height:1.4}
      @media print{.no-print{display:none}}
    </style>
  </head><body>${htmlContent}
    <script>setTimeout(function(){window.print();},200);<\/script>
  </body></html>`);
  w.document.close();
}

export default function Financials() {
  const currentYear = new Date().getFullYear();
  const [year, setYear]           = useState(currentYear);
  const [bookings, setBookings]   = useState<Booking[]>([]);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState<View>('summary');
  const [session, setSession]     = useState('');

  // Expenses (Expenses tab — respects user filters)
  const [expenses, setExpenses]         = useState<Expense[]>([]);
  const [expLoading, setExpLoading]     = useState(false);
  const [filterTour, setFilterTour]     = useState('');
  const [filterCat, setFilterCat]       = useState('');
  const [filterStart, setFilterStart]   = useState('');
  const [filterEnd, setFilterEnd]       = useState('');

  // All expenses, no user filters — used by report tabs
  const [allExpenses, setAllExpenses]   = useState<Expense[]>([]);

  type TourOption = { id: string; name: string };
  const [tours, setTours]         = useState<TourOption[]>([]);
  const [personnel, setPersonnel] = useState<{id: string; name: string}[]>([]);

  // Date range for report tabs (default = current year)
  const [rangeStart, setRangeStart] = useState(`${currentYear}-01-01`);
  const [rangeEnd, setRangeEnd]     = useState(`${currentYear}-12-31`);

  const [modal, setModal] = useState<{
    open: boolean;
    mode: 'add' | 'edit';
    expense: Partial<Expense> | null;
    saving: boolean;
    error: string;
  }>({ open: false, mode: 'add', expense: null, saving: false, error: '' });

  useEffect(() => { init(); }, []);

  // Sync year selector → date range
  useEffect(() => {
    setRangeStart(`${year}-01-01`);
    setRangeEnd(`${year}-12-31`);
  }, [year]);

  const init = async () => {
    const { data: { session: sess } } = await supabase.auth.getSession();
    const token = sess?.access_token ?? '';
    setSession(token);
    if (!sess?.user) return;
    await loadBookings(sess.user.id);
    if (token) {
      loadExpenses(token);
      loadAllExpenses(token);
    }
    const actId = await getActId(supabase, sess.user.id);
    if (actId) {
      const [toursRes, personnelRes] = await Promise.all([
        supabase.from('tours').select('id, name').eq('act_id', actId).neq('status', 'cancelled').order('name').limit(50),
        supabase.from('act_personnel').select('id, name').eq('act_id', actId).eq('is_active', true).order('name'),
      ]);
      setTours((toursRes.data as TourOption[]) || []);
      setPersonnel((personnelRes.data as {id: string; name: string}[]) || []);
    }
  };

  const loadAllExpenses = async (token: string) => {
    const res = await fetch('/api/expenses', { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    setAllExpenses(json.expenses || []);
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

    const res = await fetch(`/api/expenses?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    setExpenses(json.expenses || []);
    setExpLoading(false);
  };

  const loadBookings = async (userId: string) => {
    setLoading(true);
    try {
      const actId = await getActId(supabase, userId);
      if (!actId) return;
      const { data, error } = await supabase
        .from('bookings')
        .select('id, show_date, fee, agreed_amount, actual_amount_received, final_payment_received, payment_status, status, act:acts(act_name), venue:venues(name, city, state)')
        .eq('act_id', actId)
        .in('status', ['confirmed', 'completed'])
        .order('show_date', { ascending: true, nullsFirst: false });
      if (error) console.error('loadBookings error:', error);
      setBookings((data as any[]) || []);
    } catch (err) {
      console.error('loadBookings:', err);
    } finally {
      setLoading(false);
    }
  };

  const todayStr       = new Date().toISOString().split('T')[0];
  const yearBookings   = bookings.filter(b => !b.show_date || b.show_date.startsWith(String(year)));
  const totalFee       = yearBookings.reduce((s, b) => s + (Number(b.agreed_amount ?? b.fee) || 0), 0);
  const totalPaid      = yearBookings.reduce((s, b) => s + (Number(b.actual_amount_received) || 0), 0);
  const totalExpenses  = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const potential      = yearBookings.filter(b => b.status === 'confirmed' && b.show_date && b.show_date >= todayStr)
    .reduce((s, b) => s + (Number(b.agreed_amount ?? b.fee) || 0), 0);
  const earned         = yearBookings.filter(b => b.status === 'completed' && b.payment_status === 'received')
    .reduce((s, b) => s + (Number(b.actual_amount_received) || 0), 0);
  const outstanding    = yearBookings.filter(b => b.status === 'confirmed' && b.payment_status !== 'received')
    .reduce((s, b) => s + (Number(b.agreed_amount ?? b.fee) || 0), 0);
  const netIncome      = earned - totalExpenses;
  const showCount      = yearBookings.filter(b => ['confirmed', 'completed'].includes(b.status)).length;

  // Monthly breakdown
  const monthly = MONTHS.map((month, idx) => {
    const mbs = yearBookings.filter(b => b.show_date && parseLocalDate(b.show_date).getMonth() === idx);
    const monthExpenses = expenses.filter(e => {
      const d = parseLocalDate(e.expense_date);
      return d.getMonth() === idx && d.getFullYear() === year;
    });
    return {
      month,
      shows:    mbs.length,
      fee:      mbs.reduce((s, b) => s + (Number(b.agreed_amount ?? b.fee) || 0), 0),
      paid:     mbs.reduce((s, b) => s + (Number(b.actual_amount_received) || 0), 0),
      expenses: monthExpenses.reduce((s, e) => s + Number(e.amount), 0),
    };
  });

  // By act
  const actMap: Record<string, { name: string; shows: number; fee: number; paid: number }> = {};
  for (const b of yearBookings) {
    const key = b.act?.act_name || 'Unknown';
    if (!actMap[key]) actMap[key] = { name: key, shows: 0, fee: 0, paid: 0 };
    actMap[key].shows++;
    actMap[key].fee  += Number(b.agreed_amount ?? b.fee) || 0;
    actMap[key].paid += Number(b.actual_amount_received) || 0;
  }
  const byAct = Object.values(actMap).sort((a, b) => b.fee - a.fee);

  // By venue
  const venueMap: Record<string, { name: string; city: string; state: string; shows: number; fee: number; paid: number }> = {};
  for (const b of yearBookings) {
    const key = b.venue?.name || 'Unknown';
    if (!venueMap[key]) venueMap[key] = { name: key, city: b.venue?.city || '', state: b.venue?.state || '', shows: 0, fee: 0, paid: 0 };
    venueMap[key].shows++;
    venueMap[key].fee  += Number(b.agreed_amount ?? b.fee) || 0;
    venueMap[key].paid += Number(b.actual_amount_received) || 0;
  }
  const byVenue = Object.values(venueMap).sort((a, b) => b.fee - a.fee);

  // ── Report tab derived data ───────────────────────────────────────────────────
  const rangeBookings  = bookings.filter(b => b.show_date && b.show_date >= rangeStart && b.show_date <= rangeEnd);
  const rangeExpenses  = allExpenses.filter(e => e.expense_date >= rangeStart && e.expense_date <= rangeEnd);

  const totalRangeIncome = rangeBookings.reduce((s, b) => s + bookingIncome(b), 0);

  const expByCat: Record<string, number> = {};
  for (const e of rangeExpenses) expByCat[e.category] = (expByCat[e.category] || 0) + Number(e.amount);

  const bandPayTotal   = expByCat['band_pay'] || 0;
  const otherExpLines  = Object.entries(expByCat).filter(([c]) => c !== 'band_pay').sort(([a], [b]) => a.localeCompare(b));
  const otherExpTotal  = otherExpLines.reduce((s, [, v]) => s + v, 0);
  const totalRangeExp  = bandPayTotal + otherExpTotal;
  const rangeNet       = totalRangeIncome - totalRangeExp;

  // Payee rollup
  const payeeMap: Record<string, { name: string; total: number }> = {};
  for (const e of rangeExpenses) {
    if (e.category !== 'band_pay') continue;
    const pid  = e.personnel_id ?? '__unknown__';
    const pName = personnel.find(p => p.id === pid)?.name ?? 'Unknown';
    if (!payeeMap[pid]) payeeMap[pid] = { name: pName, total: 0 };
    payeeMap[pid].total += Number(e.amount);
  }
  const payees = Object.values(payeeMap).sort((a, b) => b.total - a.total);

  // ── CSV download (additive) ────────────────────────────────────────────────
  const downloadCSV = () => {
    const sections: string[][] = [];

    // Section 1 — Shows / income
    sections.push(['SECTION: SHOWS & INCOME']);
    sections.push(['Date', 'Act', 'Venue', 'City', 'State', 'Contracted', 'Collected', 'Outstanding', 'Status']);
    for (const b of yearBookings) {
      const contracted = Number(b.agreed_amount ?? b.fee) || 0;
      const collected  = Number(b.actual_amount_received) || 0;
      sections.push([b.show_date || '', b.act?.act_name || '', b.venue?.name || '', b.venue?.city || '', b.venue?.state || '', String(contracted), String(collected), String(contracted - collected), b.status]);
    }

    sections.push([]);

    // Section 2 — Expense line items
    sections.push(['SECTION: EXPENSE LINE ITEMS']);
    sections.push(['Date', 'Category', 'Amount', 'Notes', 'Tour ID', 'Booking ID']);
    const csvExpenses = allExpenses.filter(e => e.expense_date.startsWith(String(year)));
    for (const e of csvExpenses) {
      sections.push([e.expense_date, e.category, String(e.amount), e.notes || '', e.tour_id || '', e.booking_id || '']);
    }

    sections.push([]);

    // Section 3 — Contractor payments (band_pay, current year)
    sections.push(['SECTION: CONTRACTOR PAYMENTS (band_pay)']);
    sections.push(['Name', 'Total Paid', 'Note']);
    const csvBandPay = csvExpenses.filter(e => e.category === 'band_pay');
    const csvPayeeMap: Record<string, { name: string; total: number }> = {};
    for (const e of csvBandPay) {
      const pid   = e.personnel_id ?? '__unknown__';
      const pName = personnel.find(p => p.id === pid)?.name ?? 'Unknown';
      if (!csvPayeeMap[pid]) csvPayeeMap[pid] = { name: pName, total: 0 };
      csvPayeeMap[pid].total += Number(e.amount);
    }
    for (const { name, total } of Object.values(csvPayeeMap).sort((a, b) => b.total - a.total)) {
      sections.push([name, String(total), total >= 600 ? 'At or above $600 — verify 1099-NEC filing requirement' : '']);
    }

    const csv = sections.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `financials-${year}.csv`; a.click();
  };

  const downloadPayeeCSV = () => {
    const rows = [
      ['Name', 'Total Paid', 'Note'],
      ...payees.map(p => [p.name, String(p.total), p.total >= 600 ? 'At or above $600 — verify 1099-NEC filing' : '']),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `contractor-payments-${rangeStart}-${rangeEnd}.csv`; a.click();
  };

  const printTaxSummary = () => {
    const dateLabel = `${rangeStart} – ${rangeEnd}`;
    const otherRows = otherExpLines.map(([cat, total]) =>
      `<tr><td>${cat}</td><td class="r">${fmt(total)}</td></tr>`
    ).join('');
    printReport(`Financial Summary ${dateLabel}`, `
      <h1>Financial Summary</h1>
      <div class="subtitle">${dateLabel} &nbsp;·&nbsp; Prepared for accountant use</div>
      <div class="section">
        <div class="section-title">Income</div>
        <table>
          <thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
          <tbody>
            <tr><td>Total income (${rangeBookings.length} bookings)</td><td class="r">${fmt(totalRangeIncome)}</td></tr>
            <tr class="total"><td>TOTAL INCOME</td><td class="r">${fmt(totalRangeIncome)}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="section">
        <div class="section-title">Business Expenses</div>
        <table>
          <thead><tr><th>Category</th><th class="r">Amount</th></tr></thead>
          <tbody>
            ${otherRows || '<tr><td colspan="2" style="color:#666">No business expenses recorded</td></tr>'}
            <tr class="total"><td>TOTAL BUSINESS EXPENSES</td><td class="r">${fmt(otherExpTotal)}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="section">
        <div class="section-title">Contractor Payments (band_pay)</div>
        <table>
          <thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
          <tbody>
            <tr><td>Payments to independent contractors</td><td class="r">${fmt(bandPayTotal)}</td></tr>
            <tr class="total"><td>TOTAL CONTRACTOR PAYMENTS</td><td class="r">${fmt(bandPayTotal)}</td></tr>
          </tbody>
        </table>
        <div class="note">Contractor payments are paid to independent contractors (not employees) and may require 1099-NEC filing. See Contractor Payments report for per-payee breakdown.</div>
      </div>
      <div class="section">
        <div class="section-title">Summary</div>
        <table>
          <tbody>
            <tr><td>Total Income</td><td class="r">${fmt(totalRangeIncome)}</td></tr>
            <tr><td>Total Business Expenses</td><td class="r">(${fmt(otherExpTotal)})</td></tr>
            <tr><td>Total Contractor Payments</td><td class="r">(${fmt(bandPayTotal)})</td></tr>
            <tr class="total"><td>NET</td><td class="r">${fmt(rangeNet)}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="note" style="margin-top:2rem">This document is a summary for accountant/tax preparer use. It is not a tax form. Verify all figures against source records before filing. State contractor payment thresholds may differ from the federal $600 threshold.</div>
    `);
  };

  const printPayeeReport = () => {
    const dateLabel = `${rangeStart} – ${rangeEnd}`;
    const rows = payees.map(p => `
      <tr>
        <td>${p.name}</td>
        <td class="r">${fmt(p.total)}</td>
        <td>${p.total >= 600 ? '<span class="flag">⚑ At or above $600</span>' : ''}</td>
      </tr>`).join('');
    printReport(`Contractor Payments ${dateLabel}`, `
      <h1>Contractor Payments</h1>
      <div class="subtitle">${dateLabel} &nbsp;·&nbsp; Independent contractors (1099-NEC reference)</div>
      <div class="section">
        <table>
          <thead><tr><th>Name</th><th class="r">Total Paid</th><th>Flag</th></tr></thead>
          <tbody>
            ${rows || '<tr><td colspan="3" style="color:#666">No contractor payments in this range</td></tr>'}
            <tr class="total">
              <td>TOTAL</td>
              <td class="r">${fmt(payees.reduce((s, p) => s + p.total, 0))}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="note">⚑ Persons at or above $600 may require a 1099-NEC for this period. State thresholds may be lower — confirm with your accountant. This report does not collect or display SSN/TIN; provide it to your 1099 filing service separately.</div>
    `);
  };

  const summaryCards = [
    { label: 'Shows Booked',  value: showCount,          color: '#60a5fa',                                sub: `${year} season` },
    { label: 'Potential',     value: fmt(potential),     color: 'var(--accent)',                          sub: 'projected income' },
    { label: 'Earned',        value: fmt(earned),        color: '#34d399',                                sub: 'collected from played shows' },
    { label: 'Outstanding',   value: fmt(outstanding),   color: outstanding > 0 ? '#fbbf24' : '#34d399', sub: 'total contracted minus collected' },
    { label: 'Expenses',      value: fmt(totalExpenses), color: '#f87171',                                sub: 'recorded costs' },
    { label: 'Net Income',    value: fmt(netIncome),     color: netIncome >= 0 ? '#34d399' : '#f87171',  sub: 'earned minus expenses' },
  ];

  const isReportView = REPORT_VIEWS.includes(view);
  const isOldView    = !isReportView && view !== 'expenses';

  return (
    <AppShell requireRole="band_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Financials</h1>
          <div className="page-sub">{yearBookings.length} bookings in {year}</div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <select className="select" style={{ width: 100 }} value={year} onChange={e => setYear(Number(e.target.value))}>
            {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
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
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: '1.25rem', overflowX: 'auto' }}>
        {(Object.keys(TAB_LABELS) as View[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: '0.55rem 1.1rem',
              fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase',
              background: 'transparent', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              color: view === v ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: view === v ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {TAB_LABELS[v]}
          </button>
        ))}
      </div>

      {/* ── Legacy views (Monthly / By Act / By Venue / All Bookings) ── */}
      {loading && isOldView ? (
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>Loading…</div>
      ) : yearBookings.length === 0 && isOldView ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>
          No bookings in {year}.
        </div>
      ) : isOldView ? (
        <>
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

          {view === 'detail' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Date</th><th>Act</th><th>Venue</th><th>Contracted</th><th>Collected</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {yearBookings.map(b => {
                      const collected  = b.actual_amount_received;
                      const contracted = b.agreed_amount ?? b.fee;
                      return (
                        <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/bookings/${b.id}`}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                            {b.show_date ? formatShowDate(b.show_date, { month: 'short', day: 'numeric' }) : '—'}
                          </td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{b.act?.act_name || '—'}</td>
                          <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                            {b.venue?.name || '—'}
                            {b.venue?.city ? <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}> · {b.venue.city}</span> : ''}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent)' }}>{contracted ? fmt(Number(contracted)) : '—'}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: collected ? '#34d399' : 'var(--text-muted)' }}>
                            {collected ? fmt(Number(collected)) : '—'}
                          </td>
                          <td>
                            <span className={`badge badge-${b.status}`} style={{ fontSize: '0.68rem' }}>{b.status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* ── Expenses tab ── */}
      {view === 'expenses' && (
        <>
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
              {['Gas / Mileage','Hotel / Lodging','Band Member Payments','Food / Meals','Equipment','Other','band_pay'].map(c => (
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
                    <tr><th>Date</th><th>Category</th><th>Amount</th><th>Notes</th><th></th></tr>
                  </thead>
                  <tbody>
                    {expenses.map(e => (
                      <tr key={e.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {formatShowDate(e.expense_date, { month: 'short', day: 'numeric', year: 'numeric' })}
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
                              await fetch(`/api/expenses/${e.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session}` } });
                              loadExpenses(session);
                              loadAllExpenses(session);
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

      {/* ── Report tab: shared date range picker ── */}
      {isReportView && (
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Date range</span>
          <input type="date" className="input" style={{ width: 145 }} value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
          <span style={{ color: 'var(--text-muted)' }}>–</span>
          <input type="date" className="input" style={{ width: 145 }} value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
        </div>
      )}

      {/* ── Income & Expenses tab ── */}
      {view === 'incexp' && (
        <>
          {/* Income section */}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Income</div>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.25rem' }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Date</th><th>Venue</th><th>Amount Used</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {rangeBookings.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>No bookings in range</td></tr>
                  ) : rangeBookings.map(b => (
                    <tr key={b.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {b.show_date ? formatShowDate(b.show_date, { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {b.venue?.name || '—'}
                        {b.venue?.city ? <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}> · {b.venue.city}</span> : ''}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#34d399' }}>{fmt(bookingIncome(b))}</td>
                      <td><span className={`badge badge-${b.status}`} style={{ fontSize: '0.68rem' }}>{b.status}</span></td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td colSpan={2} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>TOTAL INCOME</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#34d399' }}>{fmt(totalRangeIncome)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Business expenses section */}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Business Expenses</div>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.25rem' }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Category</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {otherExpLines.length === 0 ? (
                    <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>No business expenses in range</td></tr>
                  ) : otherExpLines.map(([cat, total]) => (
                    <tr key={cat}>
                      <td style={{ fontSize: '0.85rem' }}>{cat}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#f87171' }}>{fmt(total)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>TOTAL BUSINESS EXPENSES</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#f87171' }}>{fmt(otherExpTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Contractor payments section */}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Contractor Payments (band_pay)
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>— separate from business expenses for Schedule C</span>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.25rem' }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Description</th><th>Total</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontSize: '0.85rem' }}>Payments to independent contractors</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#f87171' }}>{fmt(bandPayTotal)}</td>
                  </tr>
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>TOTAL CONTRACTOR PAYMENTS</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#f87171' }}>{fmt(bandPayTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Net summary */}
          <div className="card" style={{ padding: '1rem 1.25rem', borderTop: `3px solid ${rangeNet >= 0 ? '#34d399' : '#f87171'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Net (income − all expenses)</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.65rem', color: rangeNet >= 0 ? '#34d399' : '#f87171' }}>{fmt(rangeNet)}</span>
            </div>
          </div>
        </>
      )}

      {/* ── Tax Summary tab ── */}
      {view === 'taxsummary' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button className="btn btn-secondary" onClick={printTaxSummary}>↓ Print / Save PDF</button>
          </div>

          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '0.25rem' }}>Financial Summary</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              {rangeStart} – {rangeEnd} &nbsp;·&nbsp; Prepared for accountant/tax preparer use
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', paddingBottom: '0.35rem', marginBottom: '0.6rem' }}>Income</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.88rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total income ({rangeBookings.length} bookings)</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#34d399' }}>{fmt(totalRangeIncome)}</span>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', paddingBottom: '0.35rem', marginBottom: '0.6rem' }}>Business Expenses</div>
              {otherExpLines.length === 0 ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>None recorded</div>
              ) : otherExpLines.map(([cat, total]) => (
                <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.88rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{cat}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#f87171' }}>{fmt(total)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.4rem', marginTop: '0.4rem', fontSize: '0.88rem', fontWeight: 600 }}>
                <span>Subtotal</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#f87171' }}>{fmt(otherExpTotal)}</span>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', paddingBottom: '0.35rem', marginBottom: '0.6rem' }}>
                Contractor Payments (band_pay)
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.88rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Payments to independent contractors ({payees.length} payees)</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#f87171' }}>{fmt(bandPayTotal)}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                See Contractors tab for per-payee breakdown. Schedule C treats contractor payments separately from ordinary business expenses.
              </div>
            </div>

            <div style={{ borderTop: '2px solid var(--border)', paddingTop: '0.85rem' }}>
              {[
                { label: 'Total Income',               value: totalRangeIncome, color: '#34d399' },
                { label: 'Total Business Expenses',    value: -otherExpTotal,   color: '#f87171' },
                { label: 'Total Contractor Payments',  value: -bandPayTotal,    color: '#f87171' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.88rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: row.color }}>
                    {row.value < 0 ? `(${fmt(Math.abs(row.value))})` : fmt(row.value)}
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginTop: '0.4rem', fontWeight: 700, fontSize: '0.95rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Net</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: rangeNet >= 0 ? '#34d399' : '#f87171' }}>{fmt(rangeNet)}</span>
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', padding: '0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: 6, fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              This is a summary document for accountant/tax preparer use — not an official tax form. Verify all figures against source records before filing.
            </div>
          </div>
        </>
      )}

      {/* ── Contractors tab ── */}
      {view === 'contractors' && (
        <>
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button className="btn btn-secondary" onClick={downloadPayeeCSV}>↓ CSV</button>
            <button className="btn btn-secondary" onClick={printPayeeReport}>↓ Print / Save PDF</button>
          </div>

          {payees.length === 0 ? (
            <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>
              No contractor payments (band_pay) in this date range.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '0.75rem' }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Name</th><th>Total Paid</th><th>1099-NEC Flag</th></tr>
                  </thead>
                  <tbody>
                    {payees.map(p => (
                      <tr key={p.name}>
                        <td style={{ fontWeight: 600, fontSize: '0.88rem' }}>{p.name}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#34d399' }}>{fmt(p.total)}</td>
                        <td>
                          {p.total >= 600 && (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#fbbf24', fontWeight: 600 }}>
                              ⚑ At or above $600
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>TOTAL</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#34d399' }}>{fmt(payees.reduce((s, p) => s + p.total, 0))}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card" style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
            <strong style={{ color: 'var(--text-secondary)' }}>About this report:</strong>{' '}
            Band members are independent contractors. Persons at or above $600 in a calendar year may require a 1099-NEC filing under federal rules — state thresholds can be lower. Confirm requirements with your accountant.
            This report does not collect SSNs or TINs. Provide the payee list to your 1099 filing service (e.g. Track1099) to collect tax IDs securely on their end.
          </div>
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
                  loadAllExpenses(session);
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
