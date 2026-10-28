// pages/history.tsx
//
// Show History — every show the band has played, in the Tours style: an
// illustrated header, big numbers, a US tile map of where you've played (click
// a state to filter), the best rooms, filters, and a timeline by year.
//
// Open to band admins, members and superadmin. Members never see money: deal
// and pay fields are only requested for admins, so they never reach a member's
// browser, and the CSV leaves them out. Only booked shows (contract →
// completed) dated before today are listed — pitches with a past date are
// venues we looked at, not shows we played. Rules: lib/domain/history.ts.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '../components/layout/AppShell';
import PageHero from '../components/layout/PageHero';
import PosterWallScene from '../components/history/PosterWallScene';
import StateTileMap from '../components/history/StateTileMap';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { formatShowDate, localToday } from '../lib/formatDate';
import { BOOKED_SHOW_STATUSES } from '../lib/types';
import {
  DEAL_LABELS, EMPTY_FILTER, bestRooms, filterHistory, groupByYear, historyCsvRows, historyStats,
  needsSettle, paidAmount, showsByState, toCsv, wouldReturn,
  type HistoryFilter, type HistoryShow,
} from '../lib/domain/history';
import styles from '../styles/history.module.css';

const ADMIN_FIELDS = `id, show_date, status, deal_type, agreed_amount, fee, actual_amount_received, payment_status,
  post_show_notes, rebook_flag, rating, attendance, would_return, venue_feedback, venue:venues(id, name, city, state)`;
const MEMBER_FIELDS = `id, show_date, status, post_show_notes, rebook_flag, rating, attendance, would_return, venue_feedback,
  venue:venues(id, name, city, state)`;

const isAdminRole = (role: string | null | undefined) => role === 'band_admin' || role === 'superadmin';
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function Stars({ value }: { value: number | null | undefined }) {
  const v = Math.round(value ?? 0);
  return (
    <span className={styles.stars} role="img" aria-label={v ? `${value} out of 5 stars` : 'Not rated'}>
      {[1, 2, 3, 4, 5].map(n => <span key={n} className={n <= v ? styles.starOn : undefined} aria-hidden="true">★</span>)}
    </span>
  );
}

function Big({ label, value, unit, note, accent }: { label: string; value: string | number; unit?: string; note?: string; accent?: string }) {
  return (
    <div className={styles.big} style={accent ? ({ '--big-accent': accent } as React.CSSProperties) : undefined}>
      <span className={styles.bigLabel}>{label}</span>
      <span className={styles.bigValue}>{value}{unit && <small>{unit}</small>}</span>
      {note && <span className={styles.bigNote}>{note}</span>}
    </div>
  );
}

export default function HistoryPage() {
  const { profile } = useAuth();
  const actId = profile?.act_id ?? null;
  const admin = isAdminRole(profile?.role);

  const [shows, setShows] = useState<HistoryShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY_FILTER);
  const set = <K extends keyof HistoryFilter>(k: K, v: HistoryFilter[K]) => setFilter(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!actId || !profile) return;
    let cancelled = false;
    void (async () => {
      // Local calendar day: tonight's show stays off History until tomorrow.
      const { data, error: err } = await supabase
        .from('bookings')
        .select(admin ? ADMIN_FIELDS : MEMBER_FIELDS)
        .eq('act_id', actId)
        .in('status', [...BOOKED_SHOW_STATUSES])
        .not('show_date', 'is', null)
        .lt('show_date', localToday())
        .order('show_date', { ascending: false });
      if (cancelled) return;
      if (err) {
        console.error('[history] load failed', err);
        setError('Your show history could not be loaded.');
      } else {
        setShows((data ?? []) as unknown as HistoryShow[]);
        setError(null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [actId, admin, profile, reloadKey]);

  const filtered = useMemo(() => filterHistory(shows, filter), [shows, filter]);
  const stats = useMemo(() => historyStats(filtered), [filtered]);
  const allStats = useMemo(() => historyStats(shows), [shows]);
  // The map and the best rooms use every show so a state filter doesn't empty them.
  const stateCounts = useMemo(() => showsByState(filterHistory(shows, { ...filter, state: '' })), [shows, filter]);
  const rooms = useMemo(() => bestRooms(filtered, 8), [filtered]);
  const years = useMemo(() => [...new Set(shows.map(b => b.show_date.slice(0, 4)))].sort().reverse(), [shows]);
  const states = useMemo(() => [...new Set(shows.map(b => (b.venue?.state ?? '').toUpperCase()).filter(Boolean))].sort(), [shows]);
  const unsettled = admin ? filtered.filter(needsSettle).length : 0;
  const isFiltered = JSON.stringify(filter) !== JSON.stringify(EMPTY_FILTER);

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(historyCsvRows(filtered, admin))], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'show-history.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const summary = loading ? undefined
    : allStats.shows === 0 ? 'Shows land here the day after you play them.'
    : `${plural(allStats.shows, 'show')} at ${plural(allStats.venues, 'venue')} across ${plural(allStats.states, 'state')}${allStats.firstYear ? ` since ${allStats.firstYear}` : ''}.`;

  return (
    <AppShell requireRole={['band_admin', 'member', 'superadmin']}>
      <div className={styles.page}>
        <PageHero
          title="Show History"
          subtitle="Every show you've played"
          summary={summary}
          scene={<PosterWallScene />}
          actions={<button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={loading || filtered.length === 0}>↓ CSV</button>}
        />

        {error && (
          <p role="alert">{error} <button type="button" className="btn btn-secondary" onClick={() => { setLoading(true); setReloadKey(k => k + 1); }}>Try again</button></p>
        )}

        <section className={styles.bigNumbers} aria-label="History at a glance">
          {loading ? Array.from({ length: 5 }, (_, i) => <div key={i} className={`tour-skeleton ${styles.skeleton}`} />) : (
            <>
              <Big label="Shows played" value={stats.shows} note={isFiltered ? 'matching your filters' : 'all time'} />
              <Big label="Venues" value={stats.venues} note="different rooms" accent="#4a90e2" />
              <Big label="States" value={stats.states} note="on the map" accent="#4a90e2" />
              <Big label="Avg rating" value={stats.avgRating ?? '—'} unit={stats.avgRating != null ? '/ 5' : undefined}
                note={stats.rated ? `from ${plural(stats.rated, 'rated show')}` : 'rate shows after you play'} accent="#f2c25a" />
              <Big label="Would return" value={stats.returnPct != null ? `${stats.returnPct}%` : '—'}
                note={stats.answered ? `of ${plural(stats.answered, 'show')} answered` : 'not answered yet'} accent="var(--green)" />
            </>
          )}
        </section>

        {unsettled > 0 && !loading && (
          <div className={styles.notice} role="status">
            <span><strong>{plural(unsettled, 'show', 'shows')} still need settling.</strong> Open each one to mark it played, record the pay and rate the night.</span>
          </div>
        )}

        {!loading && shows.length > 0 && (
          <div className={styles.grid2}>
            <section className={styles.panel} aria-labelledby="hist-map">
              <div className={styles.panelHead}>
                <h2 id="hist-map" className={styles.panelTitle}>Where you&apos;ve played</h2>
                <span className={styles.panelMeta}>{filter.state ? `showing ${filter.state}` : 'tap a state to filter'}</span>
              </div>
              <StateTileMap counts={stateCounts} selected={filter.state} onSelect={s => set('state', s)} />
            </section>

            <section className={styles.panel} aria-labelledby="hist-rooms">
              <div className={styles.panelHead}>
                <h2 id="hist-rooms" className={styles.panelTitle}>Best rooms</h2>
                <span className={styles.panelMeta}>rating + would return</span>
              </div>
              {rooms.length === 0 ? <p className={styles.bigNote}>No shows match.</p> : (
                <ol className={styles.rooms}>
                  {rooms.map((r, i) => (
                    <li key={r.id} className={styles.room}>
                      <span className={styles.roomPos}>{i + 1}</span>
                      <span className={styles.roomText}><strong>{r.name}</strong><span>{r.place || '—'} · {plural(r.shows, 'show')}</span></span>
                      <span className={styles.roomStats}>
                        <Stars value={r.avgRating} />
                        <span>{r.answered ? <><b>{r.returns}/{r.answered}</b> would return</> : 'return not set'}{admin && r.avgPay != null ? <> · avg <b>{money(r.avgPay)}</b></> : null}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}

        {/* Filters */}
        <div className={styles.filters} role="search" aria-label="Filter show history">
          <label className={`${styles.field} ${styles.fieldGrow}`}>Venue or city
            <input type="search" className="input" value={filter.query} onChange={e => set('query', e.target.value)} />
          </label>
          <label className={styles.field}>Year
            <select className="select" value={filter.year} onChange={e => set('year', e.target.value)}>
              <option value="">All years</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className={styles.field}>State
            <select className="select" value={filter.state} onChange={e => set('state', e.target.value)}>
              <option value="">All states</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className={styles.field}>Rating
            <select className="select" value={filter.minRating} onChange={e => set('minRating', Number(e.target.value))}>
              <option value={0}>Any rating</option>
              <option value={4}>4+ stars</option>
              <option value={3}>3+ stars</option>
              <option value={2}>2+ stars</option>
            </select>
          </label>
          <label className={styles.field}>Would return
            <select className="select" value={filter.returns} onChange={e => set('returns', e.target.value as HistoryFilter['returns'])}>
              <option value="">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
        {isFiltered && (
          <p className={styles.filterNote} aria-live="polite">
            {plural(filtered.length, 'show')} match.
            <button type="button" className={styles.linkBtn} onClick={() => setFilter(EMPTY_FILTER)}>Clear filters</button>
          </p>
        )}

        {/* Timeline */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {[1, 2, 3].map(i => <div key={i} className={`tour-skeleton ${styles.skeleton}`} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <h2>{shows.length === 0 ? 'No shows yet' : 'Nothing matches'}</h2>
            <p>{shows.length === 0 ? 'Shows appear here the day after you play them.' : 'Try a different year, state or rating.'}</p>
            {isFiltered && <button type="button" className="btn btn-secondary" onClick={() => setFilter(EMPTY_FILTER)}>Clear filters</button>}
          </div>
        ) : (
          <div className={styles.years}>
            {groupByYear(filtered).map(g => (
              <section key={g.year} className={styles.year} aria-labelledby={`y-${g.year}`}>
                <div className={styles.yearHead}>
                  <h2 id={`y-${g.year}`} className={styles.yearTitle}>{g.year}</h2>
                  <span className={styles.yearMeta}>{plural(g.items.length, 'show')}</span>
                </div>
                <ul className={styles.shows}>
                  {g.items.map(b => {
                    const ret = wouldReturn(b);
                    const settle = needsSettle(b);
                    const paid = admin ? paidAmount(b) : null;
                    const contracted = admin ? Number(b.agreed_amount ?? b.fee) || null : null;
                    const notes = b.post_show_notes || b.venue_feedback;
                    return (
                      <li key={b.id}>
                        <article className={`${styles.show} ${settle ? styles.showFlag : ret ? styles.showGood : ''}`}>
                          <span className={styles.dateBlock} aria-hidden="true">
                            <span className={styles.dateMonth}>{formatShowDate(b.show_date, { month: 'short' })}</span>
                            <span className={styles.dateDay}>{formatShowDate(b.show_date, { day: 'numeric' })}</span>
                            <span className={styles.dateDow}>{formatShowDate(b.show_date, { weekday: 'short' })}</span>
                          </span>
                          <div className={styles.showBody}>
                            <div className={styles.showTop}>
                              {admin
                                ? <Link href={`/bookings/${b.id}`} className={styles.showVenue}>{b.venue?.name || 'Venue'}</Link>
                                : <span className={styles.showVenue}>{b.venue?.name || 'Venue'}</span>}
                              {admin && (paid != null || contracted != null) && (
                                <span className={styles.showPay} title={paid != null ? 'Received' : 'Agreed'}>
                                  {money(paid ?? contracted ?? 0)}{paid == null && <span className={styles.showPlace}> agreed</span>}
                                </span>
                              )}
                            </div>
                            <span className={styles.showPlace}>
                              <span className="sr-only">{formatShowDate(b.show_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · </span>
                              {[b.venue?.city, b.venue?.state].filter(Boolean).join(', ') || '—'}
                              {admin && b.deal_type ? ` · ${DEAL_LABELS[b.deal_type] ?? b.deal_type}` : ''}
                            </span>
                            <div className={styles.showMeta}>
                              <Stars value={b.rating} />
                              {b.attendance ? <span>{b.attendance.toLocaleString('en-US')} in the room</span> : null}
                              {ret !== null && <span className={`${styles.tag} ${ret ? styles.tagYes : styles.tagNo}`}>{ret ? 'Would return' : "Wouldn't return"}</span>}
                              {settle && <span className={`${styles.tag} ${styles.tagWarn}`}>Needs settling</span>}
                            </div>
                            {notes && <p className={styles.notes}>{notes}</p>}
                            {admin && (
                              <div className={styles.showActions}>
                                <Link href={`/bookings/${b.id}`} className={`btn ${settle ? 'btn-primary' : 'btn-secondary'}`}>
                                  {settle ? 'Settle show →' : 'Post-gig notes'}
                                </Link>
                              </div>
                            )}
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
