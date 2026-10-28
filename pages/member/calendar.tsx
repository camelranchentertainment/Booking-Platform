// pages/member/calendar.tsx
//
// Member calendar — the member's own roster spots and RSVPs, in the Tours
// style: an illustrated header, counts of shows to answer / confirmed /
// declined, a month grid with each show coloured by RSVP, the picked day's
// details, and the upcoming list. Each show opens /member/shows/[id], where
// the member answers.
//
// Data: GET /api/member/shows (RLS-scoped to the member's own spots). The
// calendar shows no money.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '../../components/layout/AppShell';
import PageHero from '../../components/layout/PageHero';
import BackstageScene from '../../components/member/BackstageScene';
import { supabase } from '../../lib/supabase';
import { formatShowDate, localToday } from '../../lib/formatDate';
import { monthGrid, rsvpCounts, runOfShow, type Rsvp } from '../../lib/domain/memberShows';
import styles from '../../styles/member.module.css';

type Show = {
  id: string;
  booking_id: string | null;
  status: Rsvp;
  show_date: string | null;
  booking_status: string | null;
  load_in_time: string | null;
  set_time: string | null;
  door_time: string | null;
  soundcheck_time: string | null;
  venue: { name: string | null; address: string | null; city: string | null; state: string | null } | null;
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const RSVP_LABEL: Record<Rsvp, string> = { pending: 'Needs answer', confirmed: "I'm in", declined: "Can't make it" };
const RSVP_CLASS: Record<Rsvp, string> = { pending: styles.rsvpPending, confirmed: styles.rsvpConfirmed, declined: styles.rsvpDeclined };
const rsvpOf = (s: string): Rsvp => (s === 'confirmed' || s === 'declined' ? s : 'pending');

function RsvpBadge({ status }: { status: string }) {
  const r = rsvpOf(status);
  return <span className={`${styles.rsvp} ${RSVP_CLASS[r]}`}>{RSVP_LABEL[r]}</span>;
}

function MiniDate({ date }: { date: string }) {
  return (
    <span className={styles.dateBlock} aria-hidden="true">
      <span className={styles.dateMonth}>{formatShowDate(date, { month: 'short' })}</span>
      <span className={styles.dateDay}>{formatShowDate(date, { day: 'numeric' })}</span>
    </span>
  );
}

export default function MemberCalendar() {
  const today = localToday();
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [current, setCurrent] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/member/shows', { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setFetchError(typeof json.error === 'string' ? json.error : "We couldn't load your shows."); return; }
        // Cancelled shows aren't on anyone's calendar.
        setShows(((json.shows ?? []) as Show[]).filter(s => s.booking_status !== 'cancelled'));
      } catch (e) {
        console.error('[member calendar] load failed', e);
        if (!cancelled) setFetchError("We couldn't load your shows. Check your connection and refresh.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const byDate = useMemo(() => {
    const m: Record<string, Show[]> = {};
    for (const s of shows) {
      const d = s.show_date?.slice(0, 10);
      if (d) (m[d] ??= []).push(s);
    }
    return m;
  }, [shows]);
  const counts = useMemo(() => rsvpCounts(shows, today), [shows, today]);
  const upcoming = useMemo(() => shows.filter(s => s.show_date && s.show_date >= today).sort((a, b) => (a.show_date! < b.show_date! ? -1 : 1)), [shows, today]);
  const cells = monthGrid(current.year, current.month);
  const selectedShows = selected ? byDate[selected] ?? [] : [];

  const prev = () => setCurrent(c => (c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 }));
  const next = () => setCurrent(c => (c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 }));
  const thisMonth = () => { setCurrent({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }); setSelected(null); };

  const summary = loading ? undefined
    : counts.pending ? `${counts.pending} ${counts.pending === 1 ? 'show needs' : 'shows need'} your answer.`
    : upcoming.length ? "You've answered every show. Nice." : 'No shows on your calendar yet.';

  return (
    <AppShell requireRole="member">
      <div className={styles.page}>
        <PageHero title="Calendar" subtitle="Your roster spots & RSVPs" summary={summary} scene={<BackstageScene />} />

        {fetchError && <p className={styles.alert} role="alert">{fetchError}</p>}

        <section className={styles.bigNumbers} aria-label="Your RSVPs">
          <div className={styles.big} style={{ '--big-accent': '#f0b43c' } as React.CSSProperties}>
            <span className={styles.bigLabel}>Needs your answer</span>
            <span className={styles.bigValue}>{loading ? '–' : counts.pending}</span>
            <span className={styles.bigNote}>Open a show to say if you&apos;re in</span>
          </div>
          <div className={styles.big} style={{ '--big-accent': 'var(--green)' } as React.CSSProperties}>
            <span className={styles.bigLabel}>You&apos;re in</span>
            <span className={styles.bigValue}>{loading ? '–' : counts.confirmed}</span>
            <span className={styles.bigNote}>upcoming shows confirmed</span>
          </div>
          <div className={styles.big} style={{ '--big-accent': 'var(--border)' } as React.CSSProperties}>
            <span className={styles.bigLabel}>Can&apos;t make it</span>
            <span className={styles.bigValue}>{loading ? '–' : counts.declined}</span>
            <span className={styles.bigNote}>upcoming shows declined</span>
          </div>
        </section>

        <div className={styles.calLayout}>
          <section className={styles.panel} aria-labelledby="cal-title">
            <div className={styles.calHead}>
              <h2 id="cal-title" className={styles.calTitle} aria-live="polite">{MONTHS[current.month]} {current.year}</h2>
              <div className={styles.calNav}>
                <button type="button" className="btn btn-secondary" onClick={prev} aria-label="Previous month">←</button>
                <button type="button" className="btn btn-secondary" onClick={thisMonth}>Today</button>
                <button type="button" className="btn btn-secondary" onClick={next} aria-label="Next month">→</button>
              </div>
            </div>
            <div className={styles.calGrid}>
              {DAYS.map(d => <div key={d} className={styles.calDow} aria-hidden="true">{d}</div>)}
              {cells.map((c, i) => {
                if (!c.date) return <div key={`b${i}`} className={`${styles.calCell} ${styles.calBlank}`} aria-hidden="true" />;
                const day = byDate[c.date] ?? [];
                const isToday = c.date === today;
                const isSel = c.date === selected;
                const cls = `${styles.calCell} ${isToday ? styles.calToday : ''} ${day.length ? styles.calHas : ''} ${isSel ? styles.calSel : ''}`;
                const inner = (
                  <>
                    <span className={styles.calDay}>{c.day}</span>
                    {day.slice(0, 2).map(s => (
                      <span key={s.id} className={`${styles.calPill} ${RSVP_CLASS[rsvpOf(s.status)]}`}>{s.venue?.name || 'Show'}</span>
                    ))}
                    {day.length > 2 && <span className={styles.calMore}>+{day.length - 2} more</span>}
                  </>
                );
                return day.length ? (
                  <button
                    key={c.date}
                    type="button"
                    className={cls}
                    aria-pressed={isSel}
                    aria-label={`${formatShowDate(c.date, { weekday: 'long', month: 'long', day: 'numeric' })}: ${day.map(s => `${s.venue?.name || 'show'}, ${RSVP_LABEL[rsvpOf(s.status)]}`).join('; ')}`}
                    onClick={() => setSelected(isSel ? null : c.date)}
                  >
                    {inner}
                  </button>
                ) : (
                  <div key={c.date} className={cls} aria-label={isToday ? 'Today' : undefined}>{inner}</div>
                );
              })}
            </div>
            <div className={styles.legend} aria-hidden="true">
              <span className={styles.rsvpPending}><i />Needs answer</span>
              <span className={styles.rsvpConfirmed}><i />I&apos;m in</span>
              <span className={styles.rsvpDeclined}><i />Can&apos;t make it</span>
            </div>
          </section>

          <div className={styles.page} style={{ gap: '1rem' }}>
            {selected && selectedShows.length > 0 && (
              <section className={styles.panel} aria-labelledby="sel-day">
                <h2 id="sel-day" className={styles.sectionTitle} style={{ fontSize: '1.5rem' }}>
                  {formatShowDate(selected, { weekday: 'long', month: 'long', day: 'numeric' })}
                </h2>
                {selectedShows.map(s => (
                  <Link key={s.id} href={`/member/shows/${s.id}`} className={styles.card} style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
                    <span className={styles.cardBody}>
                      <span className={styles.cardTop}><span className={styles.cardVenue}>{s.venue?.name || 'Venue TBA'}</span><RsvpBadge status={s.status} /></span>
                      <span className={styles.cardPlace}>{[s.venue?.address, s.venue?.city, s.venue?.state].filter(Boolean).join(', ') || '—'}</span>
                      {runOfShow(s).length > 0 && (
                        <span className={styles.cardTimes}>{runOfShow(s).map(r => <span key={r.key}>{r.label} <b>{r.time}</b></span>)}</span>
                      )}
                      <span className={styles.cardWhen} style={{ color: 'var(--accent)' }}>Open show →</span>
                    </span>
                  </Link>
                ))}
              </section>
            )}

            <section className={styles.panel} aria-labelledby="up-title">
              <div className={styles.sectionHead}>
                <h2 id="up-title" className={styles.sectionTitle} style={{ fontSize: '1.5rem' }}>Upcoming</h2>
                <span className={styles.sectionMeta}>{upcoming.length}</span>
              </div>
              {loading ? <div className="tour-skeleton" style={{ minHeight: '8rem', borderRadius: 8 }} /> : upcoming.length === 0 ? (
                <p className={styles.muted} style={{ margin: 0 }}>No upcoming shows. When your band admin puts you on a show, it lands here.</p>
              ) : (
                <ul className={styles.list}>
                  {upcoming.slice(0, 10).map(s => {
                    const set = runOfShow(s).find(r => r.key === 'set');
                    return (
                      <li key={s.id}>
                        <Link href={`/member/shows/${s.id}`} className={styles.listRow}
                          aria-label={`${s.venue?.name || 'Venue TBA'}, ${formatShowDate(s.show_date!, { weekday: 'long', month: 'long', day: 'numeric' })}, ${RSVP_LABEL[rsvpOf(s.status)]}`}>
                          <MiniDate date={s.show_date!} />
                          <span className={styles.listText}>
                            <strong>{s.venue?.name || 'Venue TBA'}</strong>
                            <span>{[set ? `Set ${set.time}` : null, s.venue?.city].filter(Boolean).join(' · ') || '—'}</span>
                          </span>
                          <RsvpBadge status={s.status} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
