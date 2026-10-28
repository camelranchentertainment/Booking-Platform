// pages/member/index.tsx
//
// Member dashboard — "My Shows": the band's booked shows, in the Tours style.
// The next show gets a feature card with the run of show (load-in → set →
// end), what's provided, the address with a maps link and the day-of
// contacts; the rest of the upcoming shows follow as cards, and past shows
// fold away underneath.
//
// Members never see money: the query asks for no deal, fee or pay fields.
// Bookings are read with the member's session, so RLS limits them to the band.

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import PageHero from '../../components/layout/PageHero';
import BackstageScene from '../../components/member/BackstageScene';
import ShowDayPerson from '../../components/venues/ShowDayPerson';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatShowDate, localToday } from '../../lib/formatDate';
import { mapsUrl, runOfShow, whenLabel } from '../../lib/domain/memberShows';
import styles from '../../styles/member.module.css';

interface MemberBooking {
  id: string;
  status: string;
  show_date: string | null;
  set_time: string | null;
  set_length_min: number | null;
  load_in_time: string | null;
  door_time: string | null;
  soundcheck_time: string | null;
  end_time: string | null;
  meals_provided: boolean | null;
  drinks_provided: boolean | null;
  hotel_booked: boolean | null;
  sound_system: string | null;
  special_requirements: string | null;
  venue_contact_name: string | null;
  day_of_contact_phone: string | null;
  sound_engineer_name: string | null;
  sound_engineer_phone: string | null;
  venue: { name: string | null; city: string | null; state: string | null; address: string | null; phone: string | null } | null;
}

const FIELDS = `id, status, show_date, set_time, set_length_min, load_in_time, door_time,
  soundcheck_time, end_time, meals_provided, drinks_provided, hotel_booked, sound_system,
  special_requirements, venue_contact_name, day_of_contact_phone,
  sound_engineer_name, sound_engineer_phone,
  venue:venues(name, city, state, address, phone)`;

const SOUND_LABEL: Record<string, string> = { house: 'House sound', band: 'Band brings sound', none: 'No sound system' };

function DateBlock({ date, big }: { date: string; big?: boolean }) {
  return (
    <span className={`${styles.dateBlock} ${big ? styles.dateBig : ''}`} aria-hidden="true">
      <span className={styles.dateMonth}>{formatShowDate(date, { month: 'short' })}</span>
      <span className={styles.dateDay}>{formatShowDate(date, { day: 'numeric' })}</span>
      <span className={styles.dateDow}>{formatShowDate(date, { weekday: 'short' })}</span>
    </span>
  );
}

function Provided({ b }: { b: MemberBooking }) {
  const chips = [
    b.meals_provided && <span key="m" className={`${styles.chip} ${styles.chipGood}`}>Meals provided</span>,
    b.drinks_provided && <span key="d" className={`${styles.chip} ${styles.chipGood}`}>Drinks provided</span>,
    b.hotel_booked && <span key="h" className={`${styles.chip} ${styles.chipBlue}`}>Hotel booked</span>,
    b.sound_system && <span key="s" className={styles.chip}>{SOUND_LABEL[b.sound_system] ?? `Sound: ${b.sound_system}`}</span>,
  ].filter(Boolean);
  return chips.length ? <div className={styles.chips}>{chips}</div> : null;
}

/** The next show, with everything needed on the day. */
function NextShow({ b, today }: { b: MemberBooking; today: string }) {
  const steps = runOfShow(b);
  const map = mapsUrl(b.venue);
  const where = [b.venue?.city, b.venue?.state].filter(Boolean).join(', ');
  return (
    <section className={styles.next} aria-labelledby="next-venue">
      <DateBlock date={b.show_date!} big />
      <div className={styles.nextBody}>
        <span className={styles.nextKicker}>Next show · {whenLabel(b.show_date!, today)}</span>
        <h2 id="next-venue" className={styles.nextVenue}>{b.venue?.name || 'Venue TBA'}</h2>
        <span className={styles.nextPlace}>
          <span className={styles.srOnly}>{formatShowDate(b.show_date!, { weekday: 'long', month: 'long', day: 'numeric' })}. </span>
          {b.venue?.address ? `${b.venue.address}, ` : ''}{where}
          {map && <> · <a href={map} target="_blank" rel="noopener noreferrer">Directions</a></>}
        </span>

        {steps.length > 0 ? (
          <ol className={styles.run} aria-label="Run of show">
            {steps.map(s => (
              <li key={s.key} className={`${styles.runStep} ${s.key === 'set' ? styles.runSet : ''}`}>
                <span className={styles.runLabel}>{s.label}</span>
                <span className={styles.runTime}>{s.time}</span>
                {s.note && <span className={styles.runNote}>{s.note}</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.muted} style={{ margin: 0 }}>Times aren&apos;t set yet. Your band admin will add them.</p>
        )}

        <Provided b={b} />

        {(b.venue_contact_name || b.day_of_contact_phone || b.sound_engineer_name || b.sound_engineer_phone || b.venue?.phone) && (
          <div className={styles.contacts}>
            {(b.venue_contact_name || b.day_of_contact_phone) && <span><b>Day-of contact</b><ShowDayPerson name={b.venue_contact_name} phone={b.day_of_contact_phone} /></span>}
            {(b.sound_engineer_name || b.sound_engineer_phone) && <span><b>Sound</b><ShowDayPerson name={b.sound_engineer_name} phone={b.sound_engineer_phone} /></span>}
            {b.venue?.phone && <span><b>Venue</b><ShowDayPerson phone={b.venue.phone} /></span>}
          </div>
        )}
        {b.special_requirements && <p className={styles.note}>{b.special_requirements}</p>}
      </div>
    </section>
  );
}

/** A later show, compact. */
function ShowCard({ b, today }: { b: MemberBooking; today: string }) {
  const steps = runOfShow(b).filter(s => s.key === 'load_in' || s.key === 'set');
  const where = [b.venue?.city, b.venue?.state].filter(Boolean).join(', ');
  return (
    <article className={styles.card} aria-label={`${b.venue?.name || 'Venue TBA'}, ${formatShowDate(b.show_date!, { weekday: 'long', month: 'long', day: 'numeric' })}`}>
      <DateBlock date={b.show_date!} />
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <span className={styles.cardVenue}>{b.venue?.name || 'Venue TBA'}</span>
          <span className={styles.cardWhen}>{whenLabel(b.show_date!, today)}</span>
        </div>
        <span className={styles.cardPlace}>{where || '—'}</span>
        {steps.length > 0 && (
          <span className={styles.cardTimes}>{steps.map(s => <span key={s.key}>{s.label} <b>{s.time}</b></span>)}</span>
        )}
        <Provided b={b} />
        {b.special_requirements && <p className={styles.note}>{b.special_requirements}</p>}
      </div>
    </article>
  );
}

export default function MemberView() {
  const { profile } = useAuth();
  const actId = profile?.act_id ?? null;
  const today = localToday();

  const [shows, setShows] = useState<MemberBooking[]>([]);
  const [actName, setActName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!actId) return;
    let cancelled = false;
    void (async () => {
      const [actRes, bookingsRes] = await Promise.all([
        supabase.from('acts').select('act_name').eq('id', actId).maybeSingle(),
        supabase.from('bookings').select(FIELDS)
          .eq('act_id', actId)
          .in('status', ['confirmed', 'advancing', 'completed'])
          .not('show_date', 'is', null)
          .order('show_date', { ascending: true }),
      ]);
      if (cancelled) return;
      if (actRes.data?.act_name) setActName(actRes.data.act_name);
      if (bookingsRes.error) {
        console.error('[member] shows load failed', bookingsRes.error);
        setError("We couldn't load your shows. Refresh the page to try again.");
      } else {
        setShows((bookingsRes.data ?? []) as unknown as MemberBooking[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [actId]);

  const upcoming = useMemo(() => shows.filter(s => s.show_date! >= today), [shows, today]);
  const past = useMemo(() => shows.filter(s => s.show_date! < today).reverse(), [shows, today]);
  const [next, ...later] = upcoming;
  const thisMonth = upcoming.filter(s => s.show_date!.slice(0, 7) === today.slice(0, 7)).length;

  const summary = loading ? undefined
    : next ? `Next up ${formatShowDate(next.show_date!, { weekday: 'short', month: 'short', day: 'numeric' })} at ${next.venue?.name || 'a venue TBA'} · ${upcoming.length} on the calendar${thisMonth ? `, ${thisMonth} this month` : ''}.`
    : 'No shows on the calendar yet.';

  return (
    <AppShell requireRole="member">
      <div className={styles.page}>
        <PageHero title="My Shows" subtitle={actName || 'Your band'} summary={summary} scene={<BackstageScene />} />

        {error && <p className={styles.alert} role="alert">{error}</p>}

        {loading ? (
          <div className="tour-skeleton" style={{ minHeight: '14rem', borderRadius: 'var(--radius-sm)' }} />
        ) : next ? (
          <NextShow b={next} today={today} />
        ) : !error && (
          <div className={styles.empty}>
            <h2>No upcoming shows</h2>
            <p>When your band books a show, it shows up here with the times, the address and who to call on the day.</p>
          </div>
        )}

        {later.length > 0 && (
          <section aria-labelledby="coming-up" className={styles.page} style={{ gap: '0.75rem' }}>
            <div className={styles.sectionHead}>
              <h2 id="coming-up" className={styles.sectionTitle}>Coming up</h2>
              <span className={styles.sectionMeta}>{later.length} more</span>
            </div>
            <ul className={styles.cards}>
              {later.map(b => <li key={b.id}><ShowCard b={b} today={today} /></li>)}
            </ul>
          </section>
        )}

        {past.length > 0 && (
          <details className={styles.details}>
            <summary>Past shows ({past.length})</summary>
            <ul className={styles.past}>
              {past.map(b => (
                <li key={b.id} className={styles.pastRow}>
                  <span>{b.venue?.name || 'Venue'}{b.venue?.city ? ` · ${b.venue.city}` : ''}</span>
                  <span>{formatShowDate(b.show_date!, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </AppShell>
  );
}
