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
import PageHero from '../../components/layout/PageHero';
import BackstageScene from '../../components/member/BackstageScene';
import { supabase } from '../../lib/supabase';
import { formatShowDate, localToday } from '../../lib/formatDate';
import { buildPayStatement, payYears, type MemberShowRow } from '../../lib/memberPay';
import styles from '../../styles/member.module.css';

const SHORT = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

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

  const maxMonth = Math.max(1, ...statement.months.map(m => m.played + m.upcoming));
  const monthTotals = Array.from({ length: 12 }, (_, i) => statement.months.find(m => m.month === i) ?? { month: i, played: 0, upcoming: 0, lines: [] });

  return (
    <AppShell requireRole="member">
      <div className={`pay-statement ${styles.page}`}>
        <div className="pay-no-print">
          <PageHero
            title="My Pay"
            subtitle={bandName || 'Your pay by show'}
            summary={loading || error ? undefined : `${money.format(statement.played)} earned in ${year} · ${money.format(statement.upcoming)} coming up.`}
            scene={<BackstageScene />}
            actions={
              <div className={styles.payHead}>
                <label htmlFor="pay-year">Year</label>
                <select id="pay-year" className="select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => window.print()} disabled={loading || !!error}>
                  Print statement
                </button>
              </div>
            }
          />
        </div>

        {/* Shown only on paper */}
        <div className="pay-print-only">
          <h1 style={{ margin: 0, fontSize: '20pt' }}>Pay statement {year}</h1>
          <p style={{ margin: '4pt 0 14pt' }}>
            {[memberName, bandName].filter(Boolean).join(' · ')} — generated {generated}
          </p>
        </div>

        {loading && <div className="tour-skeleton pay-no-print" style={{ minHeight: '8rem', borderRadius: 'var(--radius-sm)' }} role="status" aria-label="Loading your pay" />}
        {error && <p role="alert" className={styles.alert}>{error}</p>}

        {!loading && !error && (
          <>
            <section className={styles.bigNumbers} aria-label={`${year} pay at a glance`}>
              <div className={`${styles.big} pay-total`} style={{ '--big-accent': '#d9752d' } as React.CSSProperties}>
                <span className={styles.bigLabel}>Earned in {year}</span>
                <span className={styles.bigValue}>{money.format(statement.played)}</span>
                <span className={styles.bigNote}>{statement.playedCount} {statement.playedCount === 1 ? 'show' : 'shows'} played</span>
              </div>
              <div className={`${styles.big} pay-total`} style={{ '--big-accent': '#4a90e2' } as React.CSSProperties}>
                <span className={styles.bigLabel}>Coming up</span>
                <span className={styles.bigValue}>{money.format(statement.upcoming)}</span>
                <span className={styles.bigNote}>{statement.upcomingCount} {statement.upcomingCount === 1 ? 'show' : 'shows'} booked</span>
              </div>
              <div className={`${styles.big} pay-total`} style={{ '--big-accent': 'var(--green)' } as React.CSSProperties}>
                <span className={styles.bigLabel}>{year} total</span>
                <span className={styles.bigValue}>{money.format(statement.played + statement.upcoming)}</span>
                <span className={styles.bigNote}>Played + coming up</span>
              </div>
            </section>

            {statement.months.length > 0 && (
              <section className={`${styles.panel} pay-no-print`} aria-labelledby="pay-months">
                <div className={styles.sectionHead}>
                  <h2 id="pay-months" className={styles.sectionTitle} style={{ fontSize: '1.5rem' }}>By month</h2>
                  <div className={styles.payLegend} aria-hidden="true">
                    <span><i style={{ background: '#d9752d' }} />Played</span>
                    <span><i style={{ background: '#4a90e2' }} />Coming up</span>
                  </div>
                </div>
                <div className={styles.months} aria-hidden="true">
                  {monthTotals.map(m => (
                    <div key={m.month} className={styles.monthCol} title={`${MONTHS[m.month]}: ${money.format(m.played)} played, ${money.format(m.upcoming)} coming up`}>
                      {m.upcoming > 0 && <span className={`${styles.monthBar} ${styles.barUpcoming}`} style={{ height: `${(m.upcoming / maxMonth) * 100}%` }} />}
                      {m.played > 0 && <span className={`${styles.monthBar} ${styles.barPlayed}`} style={{ height: `${(m.played / maxMonth) * 100}%`, borderRadius: m.upcoming > 0 ? 0 : undefined }} />}
                      <span className={styles.monthName}>{SHORT[m.month]}</span>
                    </div>
                  ))}
                </div>
                <p className={styles.srOnly}>Monthly totals are listed in the table below.</p>
              </section>
            )}

            {statement.months.length === 0 ? (
              <div className={styles.empty}>
                <h2>No pay in {year} yet</h2>
                <p>When your band admin adds you to a show, it shows up here.</p>
              </div>
            ) : (
              <div className={`${styles.tableWrap} table-wrap`}>
                <table className={styles.table}>
                  <caption className="pay-sr-only">Pay by show for {year}, grouped by month</caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Venue</th>
                      <th scope="col">City</th>
                      <th scope="col">Status</th>
                      <th scope="col" className={styles.num}>Pay</th>
                    </tr>
                  </thead>
                  {statement.months.map((m) => (
                    <tbody key={m.month}>
                      <tr className={`pay-month-row ${styles.monthRow}`}>
                        <th scope="rowgroup" colSpan={5}>{MONTHS[m.month]}</th>
                      </tr>
                      {m.lines.map((line) => (
                        <tr key={line.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatShowDate(line.date, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                          <td>{line.venue}</td>
                          <td>{line.place}</td>
                          <td>{line.kind === 'played' ? 'Played' : line.rsvp === 'pending' ? 'Coming up · not confirmed' : 'Coming up'}</td>
                          <td className={styles.num}>{line.amount === null ? <span className={styles.est}>Not set</span> : <>{money.format(line.amount)}{line.estimated && <span className={styles.est}> est.</span>}</>}</td>
                        </tr>
                      ))}
                      <tr className={`pay-subtotal-row ${styles.subRow}`}>
                        <td colSpan={4} style={{ textAlign: 'right' }}>{MONTHS[m.month]} total</td>
                        <td className={styles.num}>{money.format(m.played + m.upcoming)}</td>
                      </tr>
                    </tbody>
                  ))}
                  <tfoot>
                    <tr className={`pay-subtotal-row ${styles.subRow}`}>
                      <td colSpan={4} style={{ textAlign: 'right' }}>{year} total ({money.format(statement.played)} earned, {money.format(statement.upcoming)} coming up)</td>
                      <td className={styles.num}>{money.format(statement.played + statement.upcoming)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <p className={styles.fineprint}>
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
