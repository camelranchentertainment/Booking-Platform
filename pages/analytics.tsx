// pages/analytics.tsx
//
// Analytics — the band's year at a glance, in the Tours style: an illustrated
// header, big numbers, then charts (shows per month, the outreach funnel, email
// activity, where the shows were, best-paying venues), the money detail, tours,
// and AI recommendations.
//
// Band admins only (AppShell requireRole + the API checks role server-side):
// this page shows money, and members never see money.
// Figures come from GET /api/analytics (lib/server/analytics.ts).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '../components/layout/AppShell';
import PageHero from '../components/layout/PageHero';
import SoundboardScene from '../components/analytics/SoundboardScene';
import { FunnelChart, MonthChart, RankBars, WeeksChart, money } from '../components/analytics/charts';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { AnalyticsReport } from '../lib/server/analytics';
import type { Recommendation } from '../lib/server/analyticsRecommendations';
import styles from '../styles/analytics.module.css';

const DEAL_LABELS: Record<string, string> = {
  guarantee: 'Guarantee',
  door_split: 'Door split',
  percentage: 'Percentage',
  flat_fee: 'Flat fee',
  other: 'Other',
  unspecified: 'Not set',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

/** One big-number card. */
function Big({ label, value, note, accent }: { label: string; value: string | number; note?: React.ReactNode; accent?: string }) {
  return (
    <div className={styles.big} style={accent ? ({ '--big-accent': accent } as React.CSSProperties) : undefined}>
      <span className={styles.bigLabel}>{label}</span>
      <span className={styles.bigValue}>{value}</span>
      {note && <span className={styles.bigNote}>{note}</span>}
    </div>
  );
}

export default function AnalyticsPage() {
  const { profile } = useAuth();
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [data, setData] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actName, setActName] = useState('');

  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError] = useState<string | null>(null);

  const load = useCallback(async (y: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?year=${y}`, { headers: await authHeader() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Analytics could not be loaded.');
      setData(json as AnalyticsReport);
    } catch (e) {
      console.error('[analytics] load failed', e);
      setError(e instanceof Error ? e.message : 'Analytics could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!profile?.act_id) return;
    void load(year);
  }, [profile?.act_id, year, load]);

  useEffect(() => {
    if (!profile?.act_id) return;
    let cancelled = false;
    void supabase.from('acts').select('act_name').eq('id', profile.act_id).maybeSingle()
      .then(({ data: act }) => { if (!cancelled && act?.act_name) setActName(act.act_name); });
    return () => { cancelled = true; };
  }, [profile?.act_id]);

  const getRecommendations = async () => {
    setRecsLoading(true);
    setRecsError(null);
    try {
      const res = await fetch('/api/analytics/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ year }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Recommendations could not be generated.');
      setRecs(Array.isArray(json.recommendations) ? json.recommendations : []);
    } catch (e) {
      console.error('[analytics] recommendations failed', e);
      setRecsError(e instanceof Error ? e.message : 'Recommendations could not be generated.');
    } finally {
      setRecsLoading(false);
    }
  };

  const f = data?.bookingFinancials;
  const funnel = data?.funnel ?? [];
  const pitched = funnel.find(s => s.key === 'pitched')?.count ?? 0;
  const booked = funnel.find(s => s.key === 'booked')?.count ?? 0;
  const now = new Date();
  const currentMonth = year === now.getFullYear() ? now.getMonth() : null;
  const years = f?.availableYears?.length ? f.availableYears : [year];

  const summary = data && f
    ? `${plural(f.totalCompleted, 'show')} played · ${money(f.totalEarned)} earned · ${f.futureConfirmedCount} more on the books.`
    : undefined;

  return (
    <AppShell requireRole="band_admin">
      <PageHero
        title="Analytics"
        subtitle={actName ? `${actName} · ${year}` : `Your year in numbers · ${year}`}
        summary={summary}
        scene={<SoundboardScene />}
        actions={
          <label className={styles.yearPicker}>
            Year
            <select
              className="select"
              value={year}
              onChange={e => { setYear(Number(e.target.value)); setRecs(null); setRecsError(null); }}
              aria-label="Year for the figures"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        }
      />

      <div className={styles.page}>
        {error && (
          <p role="alert" className={styles.error}>
            {error}{' '}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load(year)}>Try again</button>
          </p>
        )}

        {/* ── Big numbers ── */}
        <section className={styles.bigNumbers} aria-label={`${year} at a glance`} aria-busy={loading}>
          {!data ? (
            Array.from({ length: 5 }, (_, i) => <div key={i} className={`tour-skeleton ${styles.skeleton}`} />)
          ) : (
            <>
              <Big label="Shows played" value={f!.totalCompleted} accent="#d9752d" note={<>in {year}</>} />
              <Big label="Earned" value={money(f!.totalEarned)} accent="#34d399"
                note={f!.avgPay > 0 ? <>avg <strong>{money(f!.avgPay)}</strong> a show</> : 'from completed shows'} />
              <Big label="On the books" value={f!.futureConfirmedCount} accent="#4a90e2"
                note={f!.totalPotential > 0 ? <><strong>{money(f!.totalPotential)}</strong> still to come</> : 'confirmed shows ahead'} />
              <Big label="Pipeline" value={funnel[0]?.count ?? 0} accent="#a78bfa"
                note={<><strong>{pitched}</strong> pitched · <strong>{booked}</strong> booked</>} />
              <Big label="Wrote back" value={`${data.responseRate}%`} accent="#f5b041"
                note={<>{data.emailPerformance.venuesReplied} of {plural(data.emailPerformance.venuesEmailed, 'venue')} emailed</>} />
            </>
          )}
        </section>

        {data && (
          <>
            {/* ── Year chart + funnel ── */}
            <div className={styles.grid2}>
              <section className={styles.panel} aria-labelledby="an-year">
                <header className={styles.panelHead}>
                  <h2 className={styles.panelTitle} id="an-year">Your {year}</h2>
                  <span className={styles.panelMeta}>Shows per month</span>
                </header>
                <MonthChart months={data.months} year={year} currentMonth={currentMonth} />
              </section>

              <section className={styles.panel} aria-labelledby="an-funnel">
                <header className={styles.panelHead}>
                  <h2 className={styles.panelTitle} id="an-funnel">Outreach funnel</h2>
                  <span className={styles.panelMeta}><strong>{data.conversionRate}%</strong> booked</span>
                </header>
                {funnel[0]?.count ? (
                  <>
                    <FunnelChart steps={funnel} />
                    <div className={styles.statusChips} aria-label="Targets by outreach status">
                      <span className={styles.chip}><strong>{data.pipeline.target}</strong> to pitch</span>
                      <span className={styles.chip}><strong>{data.pipeline.follow_up}</strong> following up</span>
                      <span className={styles.chip}><strong>{data.pipeline.declined}</strong> declined</span>
                    </div>
                  </>
                ) : (
                  <p className={styles.empty}>No venues in the pipeline yet. Add venues to a tour to start tracking outreach.</p>
                )}
              </section>
            </div>

            {/* ── Email + where you played ── */}
            <div className={styles.grid2even}>
              <section className={styles.panel} aria-labelledby="an-email">
                <header className={styles.panelHead}>
                  <h2 className={styles.panelTitle} id="an-email">Email activity</h2>
                  <span className={styles.panelMeta}>Last 12 weeks</span>
                </header>
                <WeeksChart weeks={data.emailPerformance.weeks} />
                <div className={styles.statLine}>
                  <div className={styles.stat}><strong>{data.emailPerformance.sent}</strong><span>Sent, all time</span></div>
                  <div className={styles.stat}><strong>{data.emailPerformance.received}</strong><span>Replies, all time</span></div>
                  <div className={styles.stat}><strong>{data.emailPerformance.venuesEmailed}</strong><span>Venues reached</span></div>
                </div>
              </section>

              <section className={styles.panel} aria-labelledby="an-states">
                <header className={styles.panelHead}>
                  <h2 className={styles.panelTitle} id="an-states">Where you played</h2>
                  <span className={styles.panelMeta}>Shows by state · {year}</span>
                </header>
                {data.states.length ? (
                  <RankBars
                    unit="shows"
                    items={data.states.slice(0, 8).map(s => ({
                      key: s.state,
                      label: s.state,
                      sub: s.earned > 0 ? `${money(s.earned)} earned` : undefined,
                      value: s.shows,
                      display: plural(s.shows, 'show'),
                    }))}
                  />
                ) : (
                  <p className={styles.empty}>No shows booked in {year} yet.</p>
                )}
              </section>
            </div>

            {/* ── Best venues + money ── */}
            <div className={styles.grid2even}>
              <section className={styles.panel} aria-labelledby="an-venues">
                <header className={styles.panelHead}>
                  <h2 className={styles.panelTitle} id="an-venues">Best-paying rooms</h2>
                  <span className={styles.panelMeta}>Earned · {year}</span>
                </header>
                {data.topVenues.length ? (
                  <RankBars
                    unit="earned"
                    items={data.topVenues.map(v => ({
                      key: v.venueId,
                      label: v.name,
                      sub: [v.where, plural(v.shows, 'show')].filter(Boolean).join(' · '),
                      value: v.earned,
                      display: money(v.earned),
                      href: `/venues/${v.venueId}`,
                    }))}
                  />
                ) : (
                  <p className={styles.empty}>No paid shows recorded in {year} yet. Mark shows paid to see your best rooms here.</p>
                )}
              </section>

              <section className={styles.panel} aria-labelledby="an-money">
                <header className={styles.panelHead}>
                  <h2 className={styles.panelTitle} id="an-money">The money</h2>
                  <span className={styles.panelMeta}>{year}</span>
                </header>
                <dl className={styles.moneyList}>
                  <div className={styles.moneyRow}><dt>Earned (played and paid)</dt><dd>{money(f!.totalEarned)}</dd></div>
                  <div className={styles.moneyRow}><dt>Still to come (confirmed shows ahead)</dt><dd>{money(f!.totalPotential)}</dd></div>
                  <div className={styles.moneyRow}><dt>Average per paid show</dt><dd>{f!.avgPay > 0 ? money(f!.avgPay) : '—'}</dd></div>
                  <div className={styles.moneyRow}><dt>Venues that would rebook</dt><dd>{f!.wouldReturnPct != null ? `${f!.wouldReturnPct}%` : '—'}</dd></div>
                </dl>
                {Object.keys(f!.dealTypeBreakdown).length > 0 && (
                  <div className={styles.statusChips} aria-label="Deal types">
                    {Object.entries(f!.dealTypeBreakdown).sort((a, b) => b[1] - a[1]).map(([type, n]) => (
                      <span key={type} className={styles.chip}><strong>{n}</strong> {DEAL_LABELS[type] ?? type}</span>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* ── Tours ── */}
            <section className={styles.panel} aria-labelledby="an-tours">
              <header className={styles.panelHead}>
                <h2 className={styles.panelTitle} id="an-tours">Tours</h2>
                <span className={styles.panelMeta}>Booked of targets</span>
              </header>
              {data.tourStats.length ? (
                <div className={styles.tours}>
                  {data.tourStats.map(t => {
                    const share = t.total > 0 ? Math.round((t.confirmed / t.total) * 100) : 0;
                    const active = t.status === 'active' || t.status === 'planning';
                    return (
                      <Link key={t.id} href={`/tours/${t.id}`} className={`${styles.tourCard} ${active ? styles.tourActive : ''}`}>
                        <span className={styles.tourTop}>
                          <span className={styles.tourName}>{t.name || 'Untitled tour'}</span>
                          <span className={styles.tourStatus}>{t.status}</span>
                        </span>
                        <span className="tour-meter" aria-hidden="true"><span className="tour-meter-bar" style={{ width: `${share}%`, display: 'block' }} /></span>
                        <span className={styles.tourNums}>
                          <span><strong>{t.confirmed}</strong> booked of {t.total}</span>
                          <span><strong>{t.contacted}</strong> pitched</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.empty}>No tours yet. Create a tour and add venues to track how it books.</p>
              )}
            </section>

            {/* ── AI recommendations ── */}
            <section className={styles.panel} aria-labelledby="an-recs">
              <header className={styles.panelHead}>
                <h2 className={styles.panelTitle} id="an-recs">What to do next</h2>
                <span className={styles.panelMeta}>AI booking advice</span>
              </header>
              {recs === null && (
                <div className={styles.recIntro}>
                  <p>Get three or four recommendations drawn from these numbers: where you&apos;re getting replies, which rooms pay, and which months are thin.</p>
                  <button type="button" className="btn btn-primary" onClick={getRecommendations} disabled={recsLoading}>
                    {recsLoading ? 'Reading your numbers…' : 'Get recommendations'}
                  </button>
                </div>
              )}
              {recsError && <p role="alert" className={styles.error}>{recsError}</p>}
              {recs !== null && recs.length === 0 && (
                <p className={styles.empty}>Not enough to go on yet. Book a few more shows and send more outreach, then try again.</p>
              )}
              {recs !== null && recs.length > 0 && (
                <div className={styles.recs}>
                  {recs.map((r, i) => (
                    <article key={i} className={styles.rec}>
                      <span className={styles.recNum}>0{i + 1}</span>
                      <h3 className={styles.recTitle}>{r.title}</h3>
                      <p className={styles.recInsight}>{r.insight}</p>
                      <p className={styles.recAction}><b>Next</b>{r.action}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
