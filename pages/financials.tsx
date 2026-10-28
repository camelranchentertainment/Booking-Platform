// pages/financials.tsx
//
// Financials — the band's money for one year, in the Tours / Analytics style:
// an illustrated header, big numbers, money by month, what's still owed, where
// the money came from and went, then the working views (monthly, by venue, all
// shows, expenses) and the accountant reports (income & expenses, tax summary,
// contractors) with CSV and print.
//
// Band admins only (AppShell requireRole; members never see money). The money
// rules live in lib/domain/financials.ts and match the mobile app:
//   Earned       = actual_amount_received on completed shows marked received
//   On the books = agreed (else fee) on confirmed shows dated today or later
//   Still owed   = played shows not yet marked received
// Expenses come from /api/expenses; "removing" one archives it (financial data
// is archived, never deleted).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from '../components/layout/AppShell';
import PageHero from '../components/layout/PageHero';
import CoinStackScene from '../components/financials/CoinStackScene';
import MoneyMonthChart from '../components/financials/MoneyMonthChart';
import { RankBars, money } from '../components/analytics/charts';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { formatShowDate } from '../lib/formatDate';
import {
  BAND_MEMBER_PAYMENTS, BAND_PAY, EXPENSE_CATEGORIES, NEC_THRESHOLD,
  availableYears, categoryLabel, localToday, rangeReport, sumExpenses, summarizeYear, toCsv,
  type FinancialBooking, type FinancialExpense, type ShowMoney, type ShowMoneyState,
} from '../lib/domain/financials';
import styles from '../styles/financials.module.css';

type View = 'summary' | 'byVenue' | 'detail' | 'expenses' | 'incexp' | 'taxsummary' | 'contractors';

const TABS: Array<{ view: View; label: string }> = [
  { view: 'summary', label: 'Monthly' },
  { view: 'byVenue', label: 'By venue' },
  { view: 'detail', label: 'All shows' },
  { view: 'expenses', label: 'Expenses' },
  { view: 'incexp', label: 'Income & expenses' },
  { view: 'taxsummary', label: 'Tax summary' },
  { view: 'contractors', label: 'Contractors' },
];
const REPORT_VIEWS: View[] = ['incexp', 'taxsummary', 'contractors'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const STATE_LABEL: Record<ShowMoneyState, string> = { paid: 'Paid', owed: 'Owed', upcoming: 'Upcoming', other: 'Other' };
const STATE_CLASS: Record<ShowMoneyState, string> = {
  paid: styles.statePaid, owed: styles.stateOwed, upcoming: styles.stateUpcoming, other: styles.stateOther,
};

type Expense = FinancialExpense & { notes: string | null; tour_id: string | null };
type ExpenseDraft = { id?: string; expense_date: string; tour_id: string; category: string; amount: string; notes: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shortDate = (iso: string) => formatShowDate(iso, { month: 'short', day: 'numeric' });

/** Escapes text for the print window's HTML (venue, category and payee names are user-entered). */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Opens a print-ready report in a new window. `body` must already be escaped. */
function printReport(title: string, body: string) {
  const w = window.open('', '_blank', 'width=820,height=700');
  if (!w) { alert('Allow pop-ups to print reports.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>${esc(title)}</title><style>
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
    .flag{color:#92400e;font-size:0.72rem}
    .note{font-size:0.72rem;color:#666;margin-top:0.5rem;line-height:1.4}
  </style></head><body>${body}<script>setTimeout(function(){window.print();},200);<\/script></body></html>`);
  w.document.close();
}

/** Saves a CSV file in the browser. */
function downloadCsv(filename: string, rows: ReadonlyArray<ReadonlyArray<string | number>>) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One big-number card. */
function Big({ label, value, note, accent, negative }: { label: string; value: string; note?: React.ReactNode; accent: string; negative?: boolean }) {
  return (
    <div className={styles.big} style={{ '--big-accent': accent } as React.CSSProperties}>
      <span className={styles.bigLabel}>{label}</span>
      <span className={`${styles.bigValue} ${negative ? styles.negative : ''}`}>{value}</span>
      {note && <span className={styles.bigNote}>{note}</span>}
    </div>
  );
}

function StatePill({ state }: { state: ShowMoneyState }) {
  return <span className={`${styles.statePill} ${STATE_CLASS[state]}`}>{STATE_LABEL[state]}</span>;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

/** GET /api/expenses with optional filters. */
async function fetchExpenses(params: Record<string, string> = {}): Promise<Expense[]> {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  const res = await fetch(`/api/expenses${qs.toString() ? `?${qs}` : ''}`, { headers: await authHeader() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : `Expenses could not be loaded (${res.status}).`);
  return (json.expenses ?? []) as Expense[];
}

export default function Financials() {
  const { profile } = useAuth();
  const actId = profile?.act_id ?? null;
  const thisYear = new Date().getFullYear();
  const today = localToday();

  const [year, setYear] = useState(thisYear);
  const [view, setView] = useState<View>('summary');
  const [actName, setActName] = useState('');

  const [bookings, setBookings] = useState<FinancialBooking[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tours, setTours] = useState<Array<{ id: string; name: string }>>([]);
  const [personnel, setPersonnel] = useState<Array<{ id: string; name: string }>>([]);

  // Expenses tab filters (server-side, through /api/expenses).
  const [filters, setFilters] = useState({ tour_id: '', category: '', start_date: '', end_date: '' });
  const [listed, setListed] = useState<Expense[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Report date range (follows the year picker).
  const [rangeStart, setRangeStart] = useState(`${thisYear}-01-01`);
  const [rangeEnd, setRangeEnd] = useState(`${thisYear}-12-31`);
  const pickYear = (yr: number) => { setYear(yr); setRangeStart(`${yr}-01-01`); setRangeEnd(`${yr}-12-31`); };

  // ── Loading ────────────────────────────────────────────────────────────────
  const loadAll = useCallback(async (band: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [bookingsRes, expenses, toursRes, peopleRes, actRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, show_date, status, fee, agreed_amount, actual_amount_received, payment_status, venue:venues(name, city, state)')
          .eq('act_id', band)
          .in('status', ['confirmed', 'completed'])
          .order('show_date', { ascending: true, nullsFirst: false }),
        fetchExpenses(),
        supabase.from('tours').select('id, name').eq('act_id', band).neq('status', 'cancelled').order('name').limit(100),
        supabase.from('act_personnel').select('id, name').eq('act_id', band).eq('is_active', true).order('name'),
        supabase.from('acts').select('act_name').eq('id', band).maybeSingle(),
      ]);
      if (bookingsRes.error) throw new Error(bookingsRes.error.message);
      setBookings((bookingsRes.data ?? []) as unknown as FinancialBooking[]);
      setAllExpenses(expenses);
      setTours((toursRes.data ?? []) as Array<{ id: string; name: string }>);
      setPersonnel((peopleRes.data ?? []) as Array<{ id: string; name: string }>);
      setActName((actRes.data as { act_name?: string } | null)?.act_name ?? '');
    } catch (e) {
      console.error('[financials] load failed', e);
      setLoadError(e instanceof Error ? e.message : 'Financials could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (actId) void loadAll(actId); }, [actId, loadAll]);

  const loadListed = useCallback(async (f: typeof filters) => {
    setListLoading(true);
    setListError(null);
    try {
      setListed(await fetchExpenses(f));
    } catch (e) {
      console.error('[financials] expense list failed', e);
      setListError(e instanceof Error ? e.message : 'Expenses could not be loaded.');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { if (actId && view === 'expenses') void loadListed(filters); }, [actId, view, filters, loadListed]);

  const refreshExpenses = useCallback(async () => {
    try {
      setAllExpenses(await fetchExpenses());
    } catch (e) {
      console.error('[financials] expense refresh failed', e);
    }
    if (view === 'expenses') await loadListed(filters);
  }, [view, filters, loadListed]);

  // ── Figures ────────────────────────────────────────────────────────────────
  const y = useMemo(() => summarizeYear(year, bookings, allExpenses, today), [year, bookings, allExpenses, today]);
  const report = useMemo(
    () => rangeReport(rangeStart, rangeEnd, bookings, allExpenses, personnel, today),
    [rangeStart, rangeEnd, bookings, allExpenses, personnel, today],
  );
  const years = useMemo(() => availableYears(bookings, allExpenses, thisYear), [bookings, allExpenses, thisYear]);
  const currentMonth = year === thisYear ? new Date().getMonth() : null;
  const tourName = useCallback((id: string | null | undefined) => tours.find(t => t.id === id)?.name ?? '', [tours]);

  // ── Expense dialog ─────────────────────────────────────────────────────────
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const openExpense = (e?: Expense) => {
    setDraft(e
      ? { id: e.id, expense_date: e.expense_date, tour_id: e.tour_id ?? '', category: e.category, amount: String(e.amount), notes: e.notes ?? '' }
      : { expense_date: today, tour_id: tours[0]?.id ?? '', category: '', amount: '', notes: '' });
    setSaveError('');
    dialogRef.current?.showModal();
  };
  const closeExpense = () => { if (!saving) dialogRef.current?.close(); };

  const saveExpense = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!draft) return;
    const amount = Number(draft.amount);
    if (!draft.expense_date) return setSaveError('Pick the date.');
    if (!draft.tour_id) return setSaveError('Pick the tour this expense belongs to.');
    if (!draft.category) return setSaveError('Pick a category.');
    if (!Number.isFinite(amount) || amount <= 0) return setSaveError('Enter an amount above $0.');
    setSaving(true);
    setSaveError('');
    try {
      const body = { expense_date: draft.expense_date, tour_id: draft.tour_id, category: draft.category, amount, notes: draft.notes.trim() || null };
      const res = await fetch(draft.id ? `/api/expenses/${draft.id}` : '/api/expenses', {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.error === 'string' ? json.error : `Save failed (${res.status}).`);
      }
      dialogRef.current?.close();
      await refreshExpenses();
    } catch (e) {
      console.error('[financials] expense save failed', e);
      setSaveError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const archiveExpense = async (e: Expense) => {
    if (!confirm(`Archive this ${categoryLabel(e.category)} expense of ${money(Number(e.amount))}? It comes off your totals but stays on record.`)) return;
    const res = await fetch(`/api/expenses/${e.id}`, { method: 'DELETE', headers: await authHeader() });
    if (!res.ok) { alert('That expense could not be archived. Try again.'); return; }
    await refreshExpenses();
  };

  // ── Exports ────────────────────────────────────────────────────────────────
  const downloadYearCsv = () => {
    const rows: Array<Array<string | number>> = [
      ['SHOWS & INCOME'],
      ['Date', 'Venue', 'City/State', 'Status', 'Money', 'Contracted', 'Received', 'Still owed'],
      ...y.shows.map(s => [s.date, s.venue, s.place, s.status, STATE_LABEL[s.state], s.contracted ?? '', s.received ?? '', s.owed || '']),
      [],
      ['EXPENSES'],
      ['Date', 'Category', 'Amount', 'Tour', 'Notes'],
      ...allExpenses.filter(e => e.expense_date.startsWith(`${year}-`))
        .map(e => [e.expense_date, categoryLabel(e.category), Number(e.amount), tourName(e.tour_id), e.notes ?? '']),
      [],
      ['CONTRACTOR PAYMENTS (lineup band pay)'],
      ['Name', 'Total paid', 'Note'],
      ...rangeReport(`${year}-01-01`, `${year}-12-31`, bookings, allExpenses, personnel, today).payees
        .map(p => [p.name, p.total, p.needs1099 ? `At or above $${NEC_THRESHOLD} — verify 1099-NEC filing` : '']),
    ];
    downloadCsv(`financials-${year}.csv`, rows);
  };

  const downloadPayeeCsv = () => downloadCsv(`contractor-payments-${rangeStart}-${rangeEnd}.csv`, [
    ['Name', 'Total paid', 'Note'],
    ...report.payees.map(p => [p.name, p.total, p.needs1099 ? `At or above $${NEC_THRESHOLD} — verify 1099-NEC filing` : '']),
  ]);

  const printTaxSummary = () => {
    const range = `${rangeStart} – ${rangeEnd}`;
    const expRows = report.expenseLines.map(([c, t]) => `<tr><td>${esc(categoryLabel(c))}</td><td class="r">${money(t)}</td></tr>`).join('');
    printReport(`Financial Summary ${range}`, `
      <h1>Financial Summary</h1>
      <div class="subtitle">${esc(actName)} · ${range} · Prepared for accountant use</div>
      <div class="section"><div class="section-title">Income received</div><table>
        <thead><tr><th>Description</th><th class="r">Amount</th></tr></thead><tbody>
        <tr><td>Show income received (${report.paidShows.length} shows)</td><td class="r">${money(report.income)}</td></tr>
        <tr class="total"><td>TOTAL INCOME</td><td class="r">${money(report.income)}</td></tr>
      </tbody></table>
      ${report.owed > 0 ? `<div class="note">Not included: ${money(report.owed)} still owed on ${report.owedShows.length} played show(s) in this range.</div>` : ''}
      </div>
      <div class="section"><div class="section-title">Business expenses</div><table>
        <thead><tr><th>Category</th><th class="r">Amount</th></tr></thead><tbody>
        ${expRows || '<tr><td colspan="2" style="color:#666">No business expenses recorded</td></tr>'}
        <tr class="total"><td>TOTAL BUSINESS EXPENSES</td><td class="r">${money(report.businessExpenses)}</td></tr>
      </tbody></table></div>
      <div class="section"><div class="section-title">Contractor payments (band pay from show lineups)</div><table>
        <tbody><tr><td>Payments to independent contractors (${report.payees.length} payees)</td><td class="r">${money(report.contractorPay)}</td></tr>
        <tr class="total"><td>TOTAL CONTRACTOR PAYMENTS</td><td class="r">${money(report.contractorPay)}</td></tr></tbody></table>
        <div class="note">May require 1099-NEC filing. See the Contractor Payments report for each payee.</div></div>
      <div class="section"><div class="section-title">Summary</div><table><tbody>
        <tr><td>Total income</td><td class="r">${money(report.income)}</td></tr>
        <tr><td>Total business expenses</td><td class="r">(${money(report.businessExpenses)})</td></tr>
        <tr><td>Total contractor payments</td><td class="r">(${money(report.contractorPay)})</td></tr>
        <tr class="total"><td>NET</td><td class="r">${money(report.net)}</td></tr>
      </tbody></table></div>
      <div class="note">A summary for your accountant or tax preparer, not a tax form. Verify all figures against source records before filing. State contractor thresholds may differ from the federal $${NEC_THRESHOLD}.</div>`);
  };

  const printPayeeReport = () => {
    const range = `${rangeStart} – ${rangeEnd}`;
    const rows = report.payees.map(p => `<tr><td>${esc(p.name)}</td><td class="r">${money(p.total)}</td><td>${p.needs1099 ? `<span class="flag">⚑ At or above $${NEC_THRESHOLD}</span>` : ''}</td></tr>`).join('');
    printReport(`Contractor Payments ${range}`, `
      <h1>Contractor Payments</h1>
      <div class="subtitle">${esc(actName)} · ${range} · Independent contractors (1099-NEC reference)</div>
      <div class="section"><table>
        <thead><tr><th>Name</th><th class="r">Total paid</th><th>Flag</th></tr></thead><tbody>
        ${rows || '<tr><td colspan="3" style="color:#666">No contractor payments in this range</td></tr>'}
        <tr class="total"><td>TOTAL</td><td class="r">${money(report.contractorPay)}</td><td></td></tr>
      </tbody></table></div>
      <div class="note">⚑ People at or above $${NEC_THRESHOLD} may need a 1099-NEC for this period; state thresholds may be lower. This report holds no SSN/TIN — give the payee list to your 1099 filing service to collect tax IDs.</div>`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const summary = loading
    ? undefined
    : `${plural(y.showCount, 'show')} in ${year} · ${money(y.earned)} earned · ${money(y.potential)} on the books${y.outstanding > 0 ? ` · ${money(y.outstanding)} still owed` : ''}.`;

  const owedPreview = y.owedShows.slice().sort((a, b) => b.owed - a.owed).slice(0, 6);
  const isReport = REPORT_VIEWS.includes(view);

  return (
    <AppShell requireRole="band_admin">
      <div className={styles.page}>
        <PageHero
          title="Financials"
          subtitle={actName ? `${actName} · ${year}` : `The band's money · ${year}`}
          summary={summary}
          scene={<CoinStackScene />}
          actions={
            <div className={styles.heroActions}>
              <label className={styles.yearPicker}>
                Year
                <select className="select" value={year} onChange={e => pickYear(Number(e.target.value))} aria-label="Year for the figures">
                  {years.map(yr => <option key={yr} value={yr}>{yr}</option>)}
                </select>
              </label>
              <button type="button" className="btn btn-secondary" onClick={downloadYearCsv} disabled={loading}>↓ CSV</button>
              <button type="button" className="btn btn-primary" onClick={() => openExpense()} disabled={loading}>+ Add expense</button>
            </div>
          }
        />

        {loadError && (
          <div className={styles.notice} role="alert">
            <span><strong>Couldn&apos;t load your financials.</strong> {loadError}{' '}
              <button type="button" className="btn btn-secondary" onClick={() => actId && loadAll(actId)}>Try again</button>
            </span>
          </div>
        )}

        {/* ── Big numbers ── */}
        <section className={styles.bigNumbers} aria-label={`${year} money at a glance`}>
          {loading ? Array.from({ length: 5 }, (_, i) => <div key={i} className={`tour-skeleton ${styles.skeleton}`} />) : (
            <>
              <Big label="Earned" value={money(y.earned)} accent="var(--chart-earned)" note={`${plural(y.paidCount, 'show')} paid`} />
              <Big label="On the books" value={money(y.potential)} accent="var(--chart-booked)" note={`${plural(y.upcomingCount, 'show')} still to play`} />
              <Big label="Still owed" value={money(y.outstanding)} accent="var(--money-warn)"
                note={y.owedShows.length ? `${plural(y.owedShows.length, 'played show')} not marked paid` : 'Everyone has paid'} />
              <Big label="Expenses" value={money(y.expenses)} accent="var(--chart-expense)" note={`${y.categories.reduce((n, c) => n + c.count, 0)} entries`} />
              <Big label="Net" value={money(y.net)} accent={y.net >= 0 ? 'var(--money-good)' : 'var(--money-bad)'} negative={y.net < 0} note="earned minus expenses" />
            </>
          )}
        </section>

        {!loading && y.paidMissingAmount.length > 0 && (
          <div className={styles.notice} role="status">
            <span>
              <strong>{plural(y.paidMissingAmount.length, 'show is', 'shows are')} marked paid with no amount recorded</strong>, so they add $0 to Earned:{' '}
              {y.paidMissingAmount.map((s, i) => (
                <span key={s.id}>{i > 0 && ', '}<Link href={`/bookings/${s.id}`}>{s.venue} ({shortDate(s.date)})</Link></span>
              ))}. Open each show and enter what you were paid.
            </span>
          </div>
        )}

        {/* ── Chart + still owed ── */}
        <div className={styles.grid2}>
          <section className={styles.panel} aria-labelledby="fin-months">
            <div className={styles.panelHead}>
              <h2 id="fin-months" className={styles.panelTitle}>Money by month</h2>
              <span className={styles.panelMeta}>{year}</span>
            </div>
            {loading ? <div className={`tour-skeleton ${styles.skeleton}`} /> : <MoneyMonthChart months={y.months} year={year} currentMonth={currentMonth} />}
          </section>

          <section className={styles.panel} aria-labelledby="fin-owed">
            <div className={styles.panelHead}>
              <h2 id="fin-owed" className={styles.panelTitle}>Still owed</h2>
              <span className={styles.panelMeta}>{money(y.outstanding)}</span>
            </div>
            {loading ? <div className={`tour-skeleton ${styles.skeleton}`} /> : owedPreview.length === 0 ? (
              <p className={styles.allClear}>Every show you&apos;ve played in {year} is marked paid.</p>
            ) : (
              <>
                <ul className={styles.owedList}>
                  {owedPreview.map(s => (
                    <li key={s.id}>
                      <Link href={`/bookings/${s.id}`} className={styles.owedRow} aria-label={`${s.venue}, ${shortDate(s.date)}: ${money(s.owed)} owed. Open the show to mark it paid.`}>
                        <span className={styles.owedDate}>{shortDate(s.date)}</span>
                        <span className={styles.owedText}><strong>{s.venue}</strong><span>{s.place || '—'}{s.status === 'confirmed' ? ' · not marked played' : ''}</span></span>
                        <span className={styles.owedAmount}>{s.contracted == null ? 'No fee set' : money(s.owed)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {y.owedShows.length > owedPreview.length && (
                  <p className={styles.owedMore}>
                    And {plural(y.owedShows.length - owedPreview.length, 'more show')}.{' '}
                    <button type="button" className="btn btn-secondary" onClick={() => setView('detail')}>See all shows</button>
                  </p>
                )}
                <p className={styles.owedMore}>Open a show to record the payment.</p>
              </>
            )}
          </section>
        </div>

        {/* ── Where it came from / went ── */}
        <div className={styles.grid2even}>
          <section className={styles.panel} aria-labelledby="fin-venues">
            <div className={styles.panelHead}>
              <h2 id="fin-venues" className={styles.panelTitle}>Best-paying venues</h2>
              <span className={styles.panelMeta}>earned in {year}</span>
            </div>
            {loading ? <div className={`tour-skeleton ${styles.skeleton}`} /> : y.venues.some(v => v.earned > 0) ? (
              <RankBars unit="earned" items={y.venues.filter(v => v.earned > 0).slice(0, 6).map(v => ({
                key: v.key, label: v.name, sub: `${v.place}${v.place ? ' · ' : ''}${plural(v.shows, 'show')}`, value: v.earned, display: money(v.earned),
              }))} />
            ) : <p className={styles.empty}>No paid shows in {year} yet.</p>}
          </section>

          <section className={styles.panel} aria-labelledby="fin-cats">
            <div className={styles.panelHead}>
              <h2 id="fin-cats" className={styles.panelTitle}>Where it went</h2>
              <span className={styles.panelMeta}>expenses in {year}</span>
            </div>
            {loading ? <div className={`tour-skeleton ${styles.skeleton}`} /> : y.categories.length ? (
              <RankBars unit="spent" color="var(--chart-expense)" items={y.categories.map(c => ({
                key: c.category, label: categoryLabel(c.category), sub: plural(c.count, 'entry', 'entries'), value: c.total, display: money(c.total),
              }))} />
            ) : (
              <p className={styles.empty}>No expenses recorded for {year}. <button type="button" className="btn btn-secondary" onClick={() => openExpense()}>+ Add expense</button></p>
            )}
          </section>
        </div>

        {/* ── Working views & reports ── */}
        <section className={styles.panel} aria-labelledby="fin-detail">
          <h2 id="fin-detail" className="sr-only">Details and reports</h2>
          <div className="tours-tabs" role="group" aria-label="Financial views">
            {TABS.map(t => (
              <button key={t.view} type="button" className={`tours-tab${view === t.view ? ' tours-tab--on' : ''}`} aria-pressed={view === t.view} onClick={() => setView(t.view)}>
                {t.label}
              </button>
            ))}
          </div>

          {isReport && (
            <div className={styles.toolbar}>
              <label className={styles.field}>From<input type="date" className="input" value={rangeStart} max={rangeEnd} onChange={e => setRangeStart(e.target.value)} /></label>
              <span className={styles.rangeDash} aria-hidden="true">–</span>
              <label className={styles.field}>To<input type="date" className="input" value={rangeEnd} min={rangeStart} onChange={e => setRangeEnd(e.target.value)} /></label>
              <div className={styles.toolbarEnd}>
                {view === 'taxsummary' && <button type="button" className="btn btn-secondary" onClick={printTaxSummary}>↓ Print / save PDF</button>}
                {view === 'contractors' && <>
                  <button type="button" className="btn btn-secondary" onClick={downloadPayeeCsv}>↓ CSV</button>
                  <button type="button" className="btn btn-secondary" onClick={printPayeeReport}>↓ Print / save PDF</button>
                </>}
              </div>
            </div>
          )}

          {loading && <div className={`tour-skeleton ${styles.skeleton}`} />}

          {/* Monthly */}
          {!loading && view === 'summary' && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Month</th><th className={styles.num}>Shows</th><th className={styles.num}>Earned</th><th className={styles.num}>On the books</th><th className={styles.num}>Still owed</th><th className={styles.num}>Expenses</th><th className={styles.num}>Net</th></tr></thead>
                <tbody>
                  {y.months.filter(m => m.shows || m.expenses).map(m => (
                    <tr key={m.month}>
                      <td><strong>{MONTHS[m.month]}</strong></td>
                      <td className={styles.num}>{m.shows || <span className={styles.dim}>—</span>}</td>
                      <td className={styles.num}>{m.earned ? money(m.earned) : <span className={styles.dim}>—</span>}</td>
                      <td className={styles.num}>{m.booked ? money(m.booked) : <span className={styles.dim}>—</span>}</td>
                      <td className={`${styles.num} ${m.owed ? styles.warn : ''}`}>{m.owed ? money(m.owed) : <span className={styles.dim}>—</span>}</td>
                      <td className={styles.num}>{m.expenses ? money(m.expenses) : <span className={styles.dim}>—</span>}</td>
                      <td className={`${styles.num} ${m.net < 0 ? styles.bad : ''}`}>{money(m.net)}</td>
                    </tr>
                  ))}
                  {!y.months.some(m => m.shows || m.expenses) && <tr><td colSpan={7} className={styles.dim}>Nothing in {year} yet.</td></tr>}
                </tbody>
                <tfoot><tr>
                  <td>Total</td><td className={styles.num}>{y.showCount}</td><td className={styles.num}>{money(y.earned)}</td><td className={styles.num}>{money(y.potential)}</td>
                  <td className={styles.num}>{money(y.outstanding)}</td><td className={styles.num}>{money(y.expenses)}</td><td className={`${styles.num} ${y.net < 0 ? styles.bad : ''}`}>{money(y.net)}</td>
                </tr></tfoot>
              </table>
            </div>
          )}

          {/* By venue */}
          {!loading && view === 'byVenue' && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Venue</th><th className={styles.num}>Shows</th><th className={styles.num}>Contracted</th><th className={styles.num}>Earned</th><th className={styles.num}>Still owed</th></tr></thead>
                <tbody>
                  {y.venues.map(v => (
                    <tr key={v.key}>
                      <td><strong>{v.name}</strong>{v.place && <span className={styles.sub}>{v.place}</span>}</td>
                      <td className={styles.num}>{v.shows}</td>
                      <td className={styles.num}>{v.contracted ? money(v.contracted) : <span className={styles.dim}>—</span>}</td>
                      <td className={styles.num}>{v.earned ? money(v.earned) : <span className={styles.dim}>—</span>}</td>
                      <td className={`${styles.num} ${v.owed ? styles.warn : ''}`}>{v.owed ? money(v.owed) : <span className={styles.dim}>—</span>}</td>
                    </tr>
                  ))}
                  {y.venues.length === 0 && <tr><td colSpan={5} className={styles.dim}>No shows in {year}.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* All shows */}
          {!loading && view === 'detail' && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Date</th><th>Venue</th><th>Money</th><th className={styles.num}>Contracted</th><th className={styles.num}>Received</th><th className={styles.num}>Still owed</th></tr></thead>
                <tbody>
                  {y.shows.map((s: ShowMoney) => (
                    <tr key={s.id}>
                      <td className={styles.date}>{shortDate(s.date)}</td>
                      <td><Link href={`/bookings/${s.id}`}>{s.venue}</Link>{s.place && <span className={styles.sub}>{s.place}</span>}</td>
                      <td><StatePill state={s.state} /></td>
                      <td className={styles.num}>{s.contracted != null ? money(s.contracted) : <span className={styles.dim}>—</span>}</td>
                      <td className={styles.num}>{s.received != null ? money(s.received) : <span className={styles.dim}>—</span>}</td>
                      <td className={`${styles.num} ${s.owed ? styles.warn : ''}`}>{s.owed ? money(s.owed) : <span className={styles.dim}>—</span>}</td>
                    </tr>
                  ))}
                  {y.shows.length === 0 && <tr><td colSpan={6} className={styles.dim}>No confirmed or completed shows in {year}.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Expenses */}
          {!loading && view === 'expenses' && (
            <>
              <div className={styles.toolbar}>
                <label className={styles.field}>Tour
                  <select className="select" value={filters.tour_id} onChange={e => setFilters(f => ({ ...f, tour_id: e.target.value }))}>
                    <option value="">All tours</option>
                    {tours.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className={styles.field}>Category
                  <select className="select" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
                    <option value="">All categories</option>
                    {[...EXPENSE_CATEGORIES, BAND_PAY].map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                  </select>
                </label>
                <label className={styles.field}>From<input type="date" className="input" value={filters.start_date} onChange={e => setFilters(f => ({ ...f, start_date: e.target.value }))} /></label>
                <label className={styles.field}>To<input type="date" className="input" value={filters.end_date} onChange={e => setFilters(f => ({ ...f, end_date: e.target.value }))} /></label>
                <div className={styles.toolbarEnd}>
                  <button type="button" className="btn btn-primary" onClick={() => openExpense()}>+ Add expense</button>
                </div>
              </div>

              {listed.length > 0 && (
                <div className={styles.chips} aria-label="Totals by category">
                  {Object.entries(listed.reduce<Record<string, number>>((m, e) => ({ ...m, [e.category]: (m[e.category] ?? 0) + (Number(e.amount) || 0) }), {}))
                    .sort(([, a], [, b]) => b - a)
                    .map(([c, t]) => <span key={c} className={styles.chip}>{categoryLabel(c)} <strong>{money(t)}</strong></span>)}
                </div>
              )}

              {listError ? <p className={styles.error} role="alert">{listError}</p> : listLoading ? <div className={`tour-skeleton ${styles.skeleton}`} /> : listed.length === 0 ? (
                <p className={styles.empty}>No expenses match. Use <strong>+ Add expense</strong> to record one.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>Date</th><th>Category</th><th>Tour</th><th>Notes</th><th className={styles.num}>Amount</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>
                      {listed.map(e => (
                        <tr key={e.id}>
                          <td className={styles.date}>{formatShowDate(e.expense_date, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                          <td>{categoryLabel(e.category)}</td>
                          <td className={styles.dim}>{tourName(e.tour_id) || '—'}</td>
                          <td className={styles.dim}>{e.notes || '—'}</td>
                          <td className={styles.num}>{money(Number(e.amount))}</td>
                          <td>
                            <div className={styles.rowActions}>
                              <button type="button" className="btn btn-secondary" onClick={() => openExpense(e)} aria-label={`Edit ${categoryLabel(e.category)} expense on ${e.expense_date}`}>Edit</button>
                              <button type="button" className="btn btn-secondary" onClick={() => archiveExpense(e)} aria-label={`Archive ${categoryLabel(e.category)} expense on ${e.expense_date}`}>Archive</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td colSpan={4}>Total</td><td className={styles.num}>{money(sumExpenses(listed))}</td><td /></tr></tfoot>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Income & expenses */}
          {!loading && view === 'incexp' && (
            <>
              <p className={styles.sectionLabel}>Income received <span>— money paid to the band for shows in this range</span></p>
              <div className={styles.tableWrap} style={{ marginBottom: 0 }}>
                <table className={styles.table}>
                  <thead><tr><th>Date</th><th>Venue</th><th className={styles.num}>Received</th></tr></thead>
                  <tbody>
                    {report.paidShows.map(s => (
                      <tr key={s.id}>
                        <td className={styles.date}>{shortDate(s.date)}</td>
                        <td><Link href={`/bookings/${s.id}`}>{s.venue}</Link>{s.place && <span className={styles.sub}>{s.place}</span>}</td>
                        <td className={styles.num}>{s.received != null ? money(s.received) : <span className={styles.warn}>No amount</span>}</td>
                      </tr>
                    ))}
                    {report.paidShows.length === 0 && <tr><td colSpan={3} className={styles.dim}>No paid shows in this range.</td></tr>}
                  </tbody>
                  <tfoot><tr><td colSpan={2}>Total income</td><td className={styles.num}>{money(report.income)}</td></tr></tfoot>
                </table>
              </div>
              {report.owed > 0 && (
                <p className={styles.fineprint}><strong>Not counted as income:</strong> {money(report.owed)} still owed on {plural(report.owedShows.length, 'played show')} in this range. It counts once the show is marked paid.</p>
              )}

              <p className={styles.sectionLabel}>Business expenses</p>
              <div className={styles.tableWrap} style={{ marginBottom: 0 }}>
                <table className={styles.table}>
                  <thead><tr><th>Category</th><th className={styles.num}>Total</th></tr></thead>
                  <tbody>
                    {report.expenseLines.map(([c, t]) => <tr key={c}><td>{categoryLabel(c)}</td><td className={styles.num}>{money(t)}</td></tr>)}
                    {report.expenseLines.length === 0 && <tr><td colSpan={2} className={styles.dim}>No business expenses in this range.</td></tr>}
                  </tbody>
                  <tfoot><tr><td>Total business expenses</td><td className={styles.num}>{money(report.businessExpenses)}</td></tr></tfoot>
                </table>
              </div>

              <p className={styles.sectionLabel}>Contractor payments <span>— band pay from show lineups, kept apart from business expenses for Schedule C</span></p>
              <div className={styles.tableWrap} style={{ marginBottom: 0 }}>
                <table className={styles.table}>
                  <tbody><tr><td>Payments to independent contractors ({plural(report.payees.length, 'payee')})</td><td className={styles.num}>{money(report.contractorPay)}</td></tr></tbody>
                </table>
              </div>
              {report.unassignedBandPay > 0 && (
                <p className={styles.fineprint}><strong>{money(report.unassignedBandPay)}</strong> was entered as &ldquo;{BAND_MEMBER_PAYMENTS}&rdquo; without a named band member, so it&apos;s counted as a business expense and not on anyone&apos;s 1099 total. Pay band members from each show&apos;s Lineup to track them by name.</p>
              )}

              <div className={styles.netBar} style={{ '--net-accent': report.net >= 0 ? 'var(--money-good)' : 'var(--money-bad)' } as React.CSSProperties}>
                <span>Net (income − all expenses)</span>
                <strong className={report.net < 0 ? styles.bad : ''}>{money(report.net)}</strong>
              </div>
            </>
          )}

          {/* Tax summary */}
          {!loading && view === 'taxsummary' && (
            <div className={styles.sheet}>
              <p className={styles.dim} style={{ margin: 0 }}>{rangeStart} – {rangeEnd} · prepared for your accountant or tax preparer</p>
              <div className={styles.sheetBlock}>
                <h3>Income received</h3>
                <div className={styles.line}><span>Show income received ({plural(report.paidShows.length, 'show')})</span><span>{money(report.income)}</span></div>
                {report.owed > 0 && <div className={styles.line}><span>Not included: still owed on {plural(report.owedShows.length, 'show')}</span><span className={styles.dim}>{money(report.owed)}</span></div>}
              </div>
              <div className={styles.sheetBlock}>
                <h3>Business expenses</h3>
                {report.expenseLines.length === 0 ? <div className={styles.line}><span>None recorded</span><span>{money(0)}</span></div>
                  : report.expenseLines.map(([c, t]) => <div key={c} className={styles.line}><span>{categoryLabel(c)}</span><span>{money(t)}</span></div>)}
                <div className={`${styles.line} ${styles.lineTotal}`}><span>Subtotal</span><span>{money(report.businessExpenses)}</span></div>
              </div>
              <div className={styles.sheetBlock}>
                <h3>Contractor payments</h3>
                <div className={styles.line}><span>Band pay to independent contractors ({plural(report.payees.length, 'payee')})</span><span>{money(report.contractorPay)}</span></div>
              </div>
              <div className={styles.sheetBlock}>
                <h3>Summary</h3>
                <div className={styles.line}><span>Total income</span><span>{money(report.income)}</span></div>
                <div className={styles.line}><span>Total business expenses</span><span>({money(report.businessExpenses)})</span></div>
                <div className={styles.line}><span>Total contractor payments</span><span>({money(report.contractorPay)})</span></div>
              </div>
              <div className={styles.netBar} style={{ '--net-accent': report.net >= 0 ? 'var(--money-good)' : 'var(--money-bad)' } as React.CSSProperties}>
                <span>Net</span><strong className={report.net < 0 ? styles.bad : ''}>{money(report.net)}</strong>
              </div>
              <p className={styles.fineprint}>A summary for your accountant, not a tax form. Verify every figure against your records before filing.</p>
            </div>
          )}

          {/* Contractors */}
          {!loading && view === 'contractors' && (
            <>
              {report.payees.length === 0 ? (
                <p className={styles.empty}>No band pay recorded on show lineups in this date range.</p>
              ) : (
                <div className={styles.tableWrap} style={{ marginBottom: 0 }}>
                  <table className={styles.table}>
                    <thead><tr><th>Name</th><th className={styles.num}>Total paid</th><th>1099-NEC</th></tr></thead>
                    <tbody>
                      {report.payees.map(p => (
                        <tr key={p.key}>
                          <td><strong>{p.name}</strong></td>
                          <td className={styles.num}>{money(p.total)}</td>
                          <td>{p.needs1099 ? <span className={styles.warn}>⚑ At or above ${NEC_THRESHOLD}</span> : <span className={styles.dim}>Below ${NEC_THRESHOLD}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td>Total</td><td className={styles.num}>{money(report.contractorPay)}</td><td /></tr></tfoot>
                  </table>
                </div>
              )}
              {report.unassignedBandPay > 0 && (
                <p className={styles.fineprint}><strong>{money(report.unassignedBandPay)}</strong> in &ldquo;{BAND_MEMBER_PAYMENTS}&rdquo; has no band member named, so it isn&apos;t in these totals.</p>
              )}
              <p className={styles.fineprint}>
                <strong>About this report:</strong> band members are paid as independent contractors. Anyone at or above ${NEC_THRESHOLD} in a calendar year may need a 1099-NEC (state thresholds can be lower); confirm with your accountant. No SSNs or TINs are stored here. Give this list to your 1099 filing service to collect tax IDs.
              </p>
            </>
          )}
        </section>
      </div>

      {/* ── Add / edit expense ── */}
      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="fin-exp-title" onCancel={e => { if (saving) e.preventDefault(); }}>
        {draft && (
          <form className={styles.dialogBody} onSubmit={saveExpense} noValidate>
            <h2 id="fin-exp-title" className={styles.dialogTitle}>{draft.id ? 'Edit expense' : 'Add expense'}</h2>
            <label><span>Date <span className={styles.req} aria-hidden="true">*</span></span>
              <input type="date" className="input" required value={draft.expense_date} onChange={e => setDraft(d => d && { ...d, expense_date: e.target.value })} />
            </label>
            <label><span>Tour <span className={styles.req} aria-hidden="true">*</span></span>
              <select className="select" required value={draft.tour_id} onChange={e => setDraft(d => d && { ...d, tour_id: e.target.value })}>
                <option value="">Select a tour…</option>
                {tours.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            {tours.length === 0 && <p className={styles.dialogHint}>Expenses belong to a tour. <Link href="/tours">Create a tour</Link> first.</p>}
            <label><span>Category <span className={styles.req} aria-hidden="true">*</span></span>
              <select className="select" required value={draft.category} onChange={e => setDraft(d => d && { ...d, category: e.target.value })}>
                <option value="">Select a category…</option>
                {(EXPENSE_CATEGORIES as readonly string[]).concat((EXPENSE_CATEGORIES as readonly string[]).includes(draft.category) || !draft.category ? [] : [draft.category])
                  .map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
              </select>
            </label>
            {draft.category === BAND_MEMBER_PAYMENTS && (
              <p className={styles.dialogHint}>To count toward a band member&apos;s 1099 total, pay them from the show&apos;s Lineup instead.</p>
            )}
            <label><span>Amount <span className={styles.req} aria-hidden="true">*</span></span>
              <input type="number" inputMode="decimal" className="input" required min="0.01" step="0.01" value={draft.amount} onChange={e => setDraft(d => d && { ...d, amount: e.target.value })} />
            </label>
            <label><span>Notes</span>
              <input type="text" className="input" maxLength={500} value={draft.notes} onChange={e => setDraft(d => d && { ...d, notes: e.target.value })} />
            </label>
            {saveError && <p className={styles.dialogError} role="alert">{saveError}</p>}
            <div className={styles.dialogActions}>
              <button type="button" className="btn btn-secondary" onClick={closeExpense} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : draft.id ? 'Save changes' : 'Add expense'}</button>
            </div>
          </form>
        )}
      </dialog>
    </AppShell>
  );
}
