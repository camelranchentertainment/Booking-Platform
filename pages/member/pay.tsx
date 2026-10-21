// pages/member/pay.tsx
//
// Band member pay: pick a year, see pay per show grouped by month (played vs
// upcoming), and print a clean statement for your records.
//
// Data comes from GET /api/member/shows, which is RLS-scoped to the member's
// own roster spots and resolves pay server-side (the band admin's set amount,
// else the member's usual rate as an estimate). Members never see the band's
// fee or anyone else's pay.
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { formatShowDate, localToday } from '../../lib/formatDate';
import { buildPayStatement, payYears, type MemberShowRow, type PayLine } from '../../lib/memberPay';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Pay cell text: "$225.00", "$150.00 est." or "Not set". */
function payText(line: PayLine): string {
  if (line.amount === null) return 'Not set';
  return `${money.format(line.amount)}${line.estimated ? ' est.' : ''}`;
}

export default function MemberPay() {
  const [rows, setRows] = useState<MemberShowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [memberName, setMemberName] = useState('');
  const [bandName, setBandName] = useState('');
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const [res, profileRes] = await Promise.all([
          fetch('/api/member/shows', { headers: { Authorization: `Bearer ${session.access_token}` } }),
          supabase.from('profiles').select('display_name, act_id').eq('id', session.user.id).maybeSingle(),
        ]);
        const json = (await res.json()) as { shows?: MemberShowRow[]; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError("We couldn't load your pay. Refresh the page to try again.");
          console.error('member pay load failed', res.status, json.error);
          return;
        }
        setRows(json.shows ?? []);

        const profile = profileRes.data;
        setMemberName(profile?.display_name ?? session.user.email ?? '');
        if (profile?.act_id) {
          const { data: act } = await supabase.from('acts').select('act_name').eq('id', profile.act_id).maybeSingle();
          if (!cancelled && act?.act_name) setBandName(act.act_name);
        }
      } catch (err) {
        console.error('member pay load failed', err);
        if (!cancelled) setError("We couldn't load your pay. Check your connection and refresh the page.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  // Printing from this page (button or Ctrl/Cmd+P) prints only the statement.
  useEffect(() => {
    document.body.classList.add('print-pay-statement');
    return () => document.body.classList.remove('print-pay-statement');
  }, []);

  const years = useMemo(() => payYears(rows, currentYear), [rows, currentYear]);
  const statement = useMemo(() => buildPayStatement(rows, year, localToday()), [rows, year]);
  const generated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <AppShell requireRole="member">
      <div className="pay-statement">
        <div className="page-header pay-no-print">
          <div>
            <h1 className="page-title">My Pay</h1>
            <div className="page-sub">{bandName || 'Your pay by show'}</div>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label htmlFor="pay-year" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>Year</label>
            <select
              id="pay-year"
              className="select"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ minWidth: 110, minHeight: 44 }}
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: 44 }}
              onClick={() => window.print()}
              disabled={loading || !!error}
            >
              Print statement
            </button>
          </div>
        </div>

        {/* Shown only on paper */}
        <div className="pay-print-only">
          <h1 style={{ margin: 0, fontSize: '20pt' }}>Pay statement {year}</h1>
          <p style={{ margin: '4pt 0 14pt' }}>
            {[memberName, bandName].filter(Boolean).join(' · ')} — generated {generated}
          </p>
        </div>

        {loading && <p role="status" style={{ color: 'var(--text-muted)' }}>Loading your pay…</p>}
        {error && <p role="alert" style={{ color: '#f87171', fontWeight: 700 }}>{error}</p>}

        {!loading && !error && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="card pay-total">
                <div className="stat-value">{money.format(statement.played)}</div>
                <div className="stat-label">Earned in {year}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  {statement.playedCount} {statement.playedCount === 1 ? 'show' : 'shows'} played
                </div>
              </div>
              <div className="card pay-total">
                <div className="stat-value">{money.format(statement.upcoming)}</div>
                <div className="stat-label">Upcoming</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  {statement.upcomingCount} {statement.upcomingCount === 1 ? 'show' : 'shows'} booked
                </div>
              </div>
              <div className="card pay-total">
                <div className="stat-value">{money.format(statement.played + statement.upcoming)}</div>
                <div className="stat-label">{year} total</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>Played + upcoming</div>
              </div>
            </div>

            {statement.months.length === 0 ? (
              <div className="card table-empty">
                No shows with pay in {year}. When your band admin adds you to a show, it shows up here.
              </div>
            ) : (
              <div className="card table-wrap" style={{ padding: 0 }}>
                <table>
                  <caption className="pay-sr-only">Pay by show for {year}, grouped by month</caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Venue</th>
                      <th scope="col">City</th>
                      <th scope="col">Status</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Pay</th>
                    </tr>
                  </thead>
                  {statement.months.map((m) => (
                    <tbody key={m.month}>
                      <tr className="pay-month-row">
                        <th scope="rowgroup" colSpan={5} style={{ paddingTop: '1rem' }}>{MONTHS[m.month]}</th>
                      </tr>
                      {m.lines.map((line) => (
                        <tr key={line.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatShowDate(line.date, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                          <td>{line.venue}</td>
                          <td>{line.place}</td>
                          <td>{line.kind === 'played' ? 'Played' : line.rsvp === 'pending' ? 'Upcoming · not confirmed' : 'Upcoming'}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{payText(line)}</td>
                        </tr>
                      ))}
                      <tr className="pay-subtotal-row">
                        <td colSpan={4} style={{ textAlign: 'right' }}>{MONTHS[m.month]} total</td>
                        <td style={{ textAlign: 'right' }}>{money.format(m.played + m.upcoming)}</td>
                      </tr>
                    </tbody>
                  ))}
                  <tfoot>
                    <tr className="pay-subtotal-row">
                      <td colSpan={4} style={{ textAlign: 'right' }}>{year} total ({money.format(statement.played)} earned, {money.format(statement.upcoming)} upcoming)</td>
                      <td style={{ textAlign: 'right' }}>{money.format(statement.played + statement.upcoming)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem', lineHeight: 1.6 }}>
              {statement.estimatedCount > 0 && <>“est.” means your band admin hasn’t set pay for that show yet, so your usual rate is shown. </>}
              {statement.unpricedCount > 0 && <>“Not set” shows aren’t counted in the totals. </>}
              This statement is for your records and isn’t a tax document.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
