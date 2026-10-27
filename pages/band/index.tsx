import React, { useState, useEffect, useRef } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { getActId } from '../../lib/bookingQueries';
import Link from 'next/link';
import { formatShowDate, localToday, parseLocalDate } from '../../lib/formatDate';
import PageHero from '../../components/layout/PageHero';
import StageScene from '../../components/dashboard/StageScene';
import AgentRequests from '../../components/band/AgentRequests';
import styles from '../../styles/dashboard.module.css';
import { FEATURES } from '../../lib/featureFlags';
import { STATUS_COLORS } from '../../lib/statusSync';
import { BOOKING_STATUS_LABELS } from '../../lib/types';
import BookingAgentPanel from '../../components/agent/BookingAgentPanel';
import { isAgentWindowMessage, openAgentChannel, openAgentPopout, postAgentMessage, type AgentChannel } from '../../lib/agent/agentWindow';

// ── Types ──────────────────────────────────────────────────────────────────────
type TourBooking  = { id: string; status: string };
type TourTile     = { id: string; name: string; start_date: string | null; end_date: string | null; description: string | null; bookings: TourBooking[] };
type VenueSnippet = { id: string; name: string; city: string | null; state: string | null };
type TargetTile   = { id: string; venue: VenueSnippet | null };

// Supabase's untyped TS client types many-to-one embedded resources as arrays,
// but PostgREST returns a single object at runtime. This normaliser handles both.
function normaliseTarget(row: { id: string; venue: VenueSnippet | VenueSnippet[] | null }): TargetTile {
  const v = row.venue;
  if (!v) return { id: row.id, venue: null };
  if (Array.isArray(v)) return { id: row.id, venue: v[0] ?? null };
  return { id: row.id, venue: v };
}

const CLAMP_2_STYLE: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-muted)',
  overflow: 'hidden', display: '-webkit-box',
  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
};


// ── Dashboard ─────────────────────────────────────────────────────────────────

/** Booked statuses that belong in "Upcoming shows" (contract onward, not yet played). */
const UPCOMING_STATUSES = ['contract', 'confirmed', 'advancing'];

/** Whole days from today (local) to a YYYY-MM-DD show date. */
function daysUntil(showDate: string, today: string): number {
  const a = parseLocalDate(today);
  const b = parseLocalDate(showDate);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
}

/** How long to wait after the pop-out closes before showing the chat here (covers a pop-out reload). */
const UNDOCK_DELAY_MS = 600;

type DashTile ={ label: string; sub: string; href: string; accent: string; icon: string };

/** Bottom-of-dashboard shortcut tiles. Socials only appears while that feature is switched on. */
const dashTiles: DashTile[] = [
  ...(FEATURES.socials ? [{ label: 'SOCIALS', sub: 'Social post queue', href: '/social', accent: '#e879f9', icon: '✦' }] : []),
  { label: 'CALENDAR',   sub: 'View all shows',        href: '/calendar',   accent: '#60a5fa', icon: '◷' },
  { label: 'FINANCIALS', sub: 'Track payments & fees', href: '/financials', accent: '#34d399', icon: '$' },
  { label: 'HISTORY',    sub: 'Past shows & notes',    href: '/history',    accent: '#f59e0b', icon: '◎' },
];

export default function BandDashboard() {
  // Data
  const [myAct, setMyAct]             = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [targetsCount, setTargetsCount]   = useState(0);
  const [toursCount, setToursCount]     = useState(0);
  const [upcomingShows, setUpcomingShows] = useState<any[]>([]);
  const [bookedAhead, setBookedAhead]   = useState(0);
  // The browser's local day (set on load), so tonight's show still counts as upcoming after 7 PM Central.
  const [today, setToday]               = useState('');
  const [tours, setTours]               = useState<TourTile[]>([]);
  const [targets, setTargets]           = useState<TargetTile[]>([]);
  const [loading, setLoading]           = useState(true);


  // Band setup form (shown when act_id is null)
  const [setupForm, setSetupForm]     = useState({ act_name: '', home_city: '', home_state: '', bio: '' });
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError]   = useState('');

  // Agent pop-out: while the agent is open in its own window the dashboard shows
  // a placeholder instead of a second live copy of the chat (lib/agent/agentWindow.ts).
  const [agentPoppedOut, setAgentPoppedOut] = useState(false);
  const [popoutBlocked, setPopoutBlocked]   = useState(false);
  const popoutRef  = useRef<Window | null>(null);
  const channelRef = useRef<AgentChannel | null>(null);
  const undockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const channel = openAgentChannel();
    channelRef.current = channel;
    if (!channel) return;
    channel.onmessage = (event: MessageEvent) => {
      const msg: unknown = event.data;
      if (!isAgentWindowMessage(msg)) return;
      if (msg.type === 'popout-opened') {
        if (undockTimer.current) { clearTimeout(undockTimer.current); undockTimer.current = null; }
        setAgentPoppedOut(true);
      } else if (msg.type === 'popout-closed') {
        // A reload of the pop-out sends closed-then-opened; wait a moment so the
        // dashboard chat doesn't flash back in between.
        if (undockTimer.current) clearTimeout(undockTimer.current);
        undockTimer.current = setTimeout(() => {
          undockTimer.current = null;
          popoutRef.current = null;
          setAgentPoppedOut(false);
        }, UNDOCK_DELAY_MS);
      } else if (msg.type === 'data-changed') {
        void load();
      }
    };
    // A pop-out may already be open from before this page loaded.
    postAgentMessage(channel, { type: 'ping' });
    return () => {
      if (undockTimer.current) clearTimeout(undockTimer.current);
      channelRef.current = null;
      channel.close();
    };
  }, []);

  /** Moves the agent into its own window. */
  const popOutAgent = () => {
    setPopoutBlocked(false);
    const win = openAgentPopout(window);
    if (!win) { setPopoutBlocked(true); return; }
    popoutRef.current = win;
    setAgentPoppedOut(true);
  };

  /** Brings the pop-out to the front (the window may be behind others or on another screen). */
  const showAgentWindow = () => {
    const win = popoutRef.current;
    if (win && !win.closed) { win.focus(); return; }
    // Opened before this page loaded, so there's no handle — ask it to focus itself.
    postAgentMessage(channelRef.current, { type: 'focus' });
  };

  /** Closes the pop-out and shows the chat here again. */
  const dockAgent = () => {
    postAgentMessage(channelRef.current, { type: 'dock' });
    const win = popoutRef.current;
    if (win && !win.closed) win.close();
    popoutRef.current = null;
    setAgentPoppedOut(false);
  };


  const load = async () => {
    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 5000);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) return;

      const actId = await getActId(supabase, user.id);
      if (!actId) {
        // Still need role so the no-act render shows the right message vs the setup form.
        const { data: noActProfile } = await supabase
          .from('profiles').select('role').eq('id', user.id).maybeSingle();
        setUserProfile(noActProfile || null);
        return;
      }

      const [actRes, profileRes] = await Promise.all([
        supabase.from('acts').select('id, owner_id, act_name, genre, bio, website, instagram, spotify, logo_url, member_count, gcal_calendar_id, is_active, created_at, updated_at, contact_email, contact_phone, home_city, home_state, facebook, username, epk_link, profile_photo_url, calendar_name, sync_enabled, calendar_type, ical_url, last_synced_at, tiktok_url, facebook_url, instagram_url, epk_url, gmail_address, gmail_connected_at, ical_feed_token').eq('id', actId).eq('is_active', true).single(),
        supabase.from('profiles').select('display_name, email, role').eq('id', user.id).single(),
      ]);

      setMyAct(actRes.data || null);
      setUserProfile(profileRes.data || null);

      if (actRes.data) {
        // Accurate counts per spec
        const tourIdsRes = await supabase.from('tours').select('id').eq('act_id', actId).neq('status', 'cancelled');
        const tourIds = (tourIdsRes.data ?? []).map((t: { id: string }) => t.id);

        const today = localToday();
        setToday(today);
        const [tvTargetRes, toursCountRes, toursRes, upcomingRes, targetsRes, aheadRes] = await Promise.all([
          tourIds.length
            ? supabase.from('tour_venues').select('id', { count: 'exact', head: true }).in('tour_id', tourIds).eq('status', 'target')
            : Promise.resolve({ count: 0 }),
          supabase.from('tours').select('id', { count: 'exact', head: true }).eq('act_id', actId).in('status', ['planning', 'active']),
          supabase.from('tours')
            .select('id, name, start_date, end_date, description, bookings(id, status)')
            .eq('act_id', actId)
            .in('status', ['planning', 'active'])
            .order('start_date', { ascending: true, nullsFirst: false })
            .limit(4),
          // Upcoming row shows booked shows only (contract, confirmed, advancing) — pitch/hold/target don't belong here
          supabase.from('bookings')
            .select('id, status, show_date, venue:venues(id, name, city, state)')
            .eq('act_id', actId)
            .in('status', UPCOMING_STATUSES)
            .not('show_date', 'is', null)
            .gte('show_date', today)
            .order('show_date')
            .limit(8),
          tourIds.length
            ? supabase.from('tour_venues')
                .select('id, venue:venues(id, name, city, state)')
                .in('tour_id', tourIds)
                .eq('status', 'target')
                .limit(16)
            : Promise.resolve({ data: [] }),
          supabase.from('bookings').select('id', { count: 'exact', head: true })
            .eq('act_id', actId).in('status', UPCOMING_STATUSES).gte('show_date', today),
        ]);

        setTargetsCount(tvTargetRes.count ?? 0);
        setToursCount(toursCountRes.count ?? 0);
        setTours(toursRes.data ?? []);
        setUpcomingShows(upcomingRes.data ?? []);
        setBookedAhead(aheadRes.count ?? 0);
        const targetRows: Array<{ id: string; venue: VenueSnippet | VenueSnippet[] | null }> = targetsRes.data ?? [];
        setTargets(targetRows.map(normaliseTarget));
      }
    } catch (err) {
      console.error('band dashboard load:', err);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const createAct = async () => {
    if (!setupForm.act_name.trim()) { setSetupError('Act name is required.'); return; }
    setSetupSaving(true);
    setSetupError('');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSetupError('Not signed in.'); setSetupSaving(false); return; }

    const res = await fetch('/api/band/setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        act_name:   setupForm.act_name.trim(),
        home_city:  setupForm.home_city.trim() || undefined,
        home_state: setupForm.home_state.trim() || undefined,
        bio:        setupForm.bio.trim() || undefined,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      setSetupError(json.error?.message || 'Failed to create act.');
      setSetupSaving(false);
      return;
    }

    await load();
  };

  const userInitials = userProfile?.display_name
    ? userProfile.display_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : userProfile?.email?.[0]?.toUpperCase() || '?';

  const nextShow = upcomingShows[0] ?? null;
  const nextShowDays = nextShow && today ? daysUntil(nextShow.show_date, today) : null;
  const heroLine = loading ? undefined : [
    nextShow && nextShowDays !== null
      ? `Next up: ${nextShow.venue?.name || 'a show'} ${nextShowDays === 0 ? 'tonight' : nextShowDays === 1 ? 'tomorrow' : `in ${nextShowDays} days`}`
      : 'No shows booked yet',
    `${toursCount} active tour${toursCount === 1 ? '' : 's'}`,
    `${targetsCount} target${targetsCount === 1 ? '' : 's'} to pitch`,
  ].join(' · ') + '.';

  const tagline = myAct ? [
    myAct.genre,
    myAct.home_city && myAct.home_state ? `${myAct.home_city}, ${myAct.home_state}` : myAct.home_city || null,
  ].filter(Boolean).join(' · ') : '';

  return (
    <AppShell requireRole="band_admin">

      {/* ── Header: the band's name over an illustrated stage, in the Tours style ── */}
      {myAct && (
        <PageHero
          title={myAct.act_name || 'Dashboard'}
          subtitle={tagline || 'Band dashboard'}
          summary={heroLine}
          scene={<StageScene />}
          actions={
            <div className={styles.heroBadge}>
              {myAct.profile_photo_url
                ? <img src={myAct.profile_photo_url} alt={`${myAct.act_name} photo`} className={styles.heroPhoto} />
                : <span className={styles.heroInitial} aria-hidden="true">{myAct.act_name?.[0] || '?'}</span>}
              <span className={styles.heroUser} title="Signed in">{userInitials}</span>
            </div>
          }
        />
      )}

      {/* ── No act state ─────────────────────────────────────────────────────── */}
      {!loading && !myAct && userProfile?.role !== 'band_admin' && (
        <div className="card" style={{ maxWidth: 480, margin: '4rem auto', padding: '2.5rem 2rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', color: 'var(--accent)', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>NOT YET LINKED</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Ask your band admin to invite you. Once you accept the invitation, the dashboard will unlock.</p>
        </div>
      )}

      {/* ── No act state — inline setup form (band_admin only) ───────────────── */}
      {!loading && !myAct && userProfile?.role === 'band_admin' && (
        <div className="card" style={{ maxWidth: 480, margin: '4rem auto', padding: '2.5rem 2rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', color: 'var(--accent)', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>GET STARTED</div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.75rem', fontSize: 14 }}>Create your band profile to unlock the dashboard.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Act Name <span style={{ color: '#f87171' }}>*</span></label>
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. The Desert Kings"
                value={setupForm.act_name}
                onChange={e => setSetupForm(f => ({ ...f, act_name: e.target.value }))}
                disabled={setupSaving}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Home City</label>
                <input
                  className="input"
                  style={{ width: '100%' }}
                  placeholder="Nashville"
                  value={setupForm.home_city}
                  onChange={e => setSetupForm(f => ({ ...f, home_city: e.target.value }))}
                  disabled={setupSaving}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>State</label>
                <input
                  className="input"
                  style={{ width: '100%' }}
                  placeholder="TN"
                  value={setupForm.home_state}
                  onChange={e => setSetupForm(f => ({ ...f, home_state: e.target.value }))}
                  disabled={setupSaving}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Bio</label>
              <textarea
                className="input"
                style={{ width: '100%', minHeight: 80, resize: 'vertical' }}
                placeholder="A few sentences about your act…"
                value={setupForm.bio}
                onChange={e => setSetupForm(f => ({ ...f, bio: e.target.value }))}
                disabled={setupSaving}
              />
            </div>

            {setupError && <div style={{ fontSize: 13, color: '#f87171' }}>{setupError}</div>}

            <button
              className="btn btn-primary"
              style={{ marginTop: '0.25rem' }}
              onClick={createAct}
              disabled={setupSaving || !setupForm.act_name.trim()}
            >
              {setupSaving ? 'Creating…' : 'Create Band Profile →'}
            </button>
          </div>
        </div>
      )}

      {myAct && (
        <>
          {/* ── At a glance (Tours-style trackers) ──────────────────────────── */}
          <section className="tours-metrics" aria-label="Band at a glance">
            <Link href={nextShow ? '/today' : '/calendar'} className={`tour-metric ${styles.metricLink}`}>
              <span className="tour-metric-label">Next show</span>
              {loading ? <span className={styles.metricSkeleton} /> : nextShow && nextShowDays !== null ? (
                <>
                  <span className="tour-metric-value">
                    {nextShowDays === 0
                      ? <><strong className="tour-metric-hot">Tonight</strong><span>{nextShow.venue?.name || 'Venue TBD'}</span></>
                      : <><strong>{nextShowDays}</strong><span>{nextShowDays === 1 ? 'day' : 'days'} · {nextShow.venue?.name || 'Venue TBD'}</span></>}
                  </span>
                  <span className="tour-metric-note">{formatShowDate(nextShow.show_date, { weekday: 'short', month: 'short', day: 'numeric' })}{nextShow.venue?.city ? ` · ${[nextShow.venue.city, nextShow.venue.state].filter(Boolean).join(', ')}` : ''}</span>
                </>
              ) : <span className="tour-metric-value"><span>Nothing booked yet</span></span>}
            </Link>
            <Link href="/calendar" className={`tour-metric ${styles.metricLink}`}>
              <span className="tour-metric-label">Booked ahead</span>
              <span className="tour-metric-value"><strong>{loading ? '–' : bookedAhead}</strong><span>{bookedAhead === 1 ? 'show' : 'shows'} on the calendar</span></span>
            </Link>
            <Link href="/tours" className={`tour-metric ${styles.metricLink}`}>
              <span className="tour-metric-label">Active tours</span>
              <span className="tour-metric-value"><strong>{loading ? '–' : toursCount}</strong><span>planning or on the road</span></span>
            </Link>
            <Link href="/email?tab=outreach&status=target" className={`tour-metric ${styles.metricLink}`}>
              <span className="tour-metric-label">Targets</span>
              <span className="tour-metric-value"><strong className={targetsCount > 0 ? 'tour-metric-hot' : undefined}>{loading ? '–' : targetsCount}</strong><span>venues to pitch</span></span>
            </Link>
          </section>

          {/* ── Requests from the band's Booking Agent (only when there are any) ── */}
          <AgentRequests onAdded={() => void load()} />

          {/* ── Upcoming Shows ──────────────────────────────────────────────── */}
          <section className={styles.section} aria-labelledby="dash-upcoming">
            <header className={styles.sectionHead}>
              <h2 className={styles.sectionTitle} id="dash-upcoming">Upcoming shows</h2>
              <Link href="/calendar" className={styles.viewAll}>View calendar →</Link>
            </header>
            {loading ? <div className={`tour-skeleton ${styles.skeletonRow}`} /> : upcomingShows.length === 0 ? (
              <div className={styles.empty}>
                <span>No booked shows ahead yet.</span>
                <Link href="/calendar" className="btn btn-secondary btn-sm">+ Add a show</Link>
              </div>
            ) : (
              <ul className={styles.showRail}>
                {upcomingShows.map((show: any) => {
                  const color = STATUS_COLORS[show.status] || '#6b7280';
                  const d = parseLocalDate(show.show_date);
                  return (
                    <li key={show.id}>
                      <Link href={`/bookings/${show.id}`} className={styles.showCard} style={{ borderTopColor: color }}>
                        <span className={styles.showDate}>
                          <strong>{d.getDate()}</strong>
                          <span>{formatShowDate(show.show_date, { month: 'short' })} · {formatShowDate(show.show_date, { weekday: 'short' })}</span>
                        </span>
                        <span className={styles.showName}>{show.venue?.name || 'Venue TBD'}</span>
                        <span className={styles.showWhere}>{[show.venue?.city, show.venue?.state].filter(Boolean).join(', ') || BOOKING_STATUS_LABELS[show.status as keyof typeof BOOKING_STATUS_LABELS]}</span>
                        <span className={styles.showStatus} style={{ color }}>{BOOKING_STATUS_LABELS[show.status as keyof typeof BOOKING_STATUS_LABELS] || show.status}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className={styles.twoUp}>
            {/* ── Tours ─────────────────────────────────────────────────────── */}
            <section className={styles.section} aria-labelledby="dash-tours">
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle} id="dash-tours">Tours</h2>
                <Link href="/tours" className={styles.viewAll}>All tours →</Link>
              </header>
              {loading ? <div className={`tour-skeleton ${styles.skeletonRow}`} /> : tours.length === 0 ? (
                <div className={styles.empty}>
                  <span>No active tours.</span>
                  <Link href="/tours" className="btn btn-secondary btn-sm">+ Plan a tour</Link>
                </div>
              ) : (
                <ul className={styles.tourList}>
                  {tours.map(tour => {
                    const active = tour.bookings.filter(b => b.status !== 'cancelled');
                    const booked = active.filter(b => UPCOMING_STATUSES.includes(b.status) || b.status === 'completed');
                    const pct = active.length ? Math.round((booked.length / active.length) * 100) : 0;
                    const range = ([tour.start_date, tour.end_date] as const)
                      .filter((x): x is string => x !== null)
                      .map(x => formatShowDate(x, { month: 'short', day: 'numeric' }))
                      .join(' – ');
                    return (
                      <li key={tour.id}>
                        <Link href={`/tours/${tour.id}`} className={styles.tourRow}>
                          <span className={styles.tourMain}>
                            <strong>{tour.name}</strong>
                            <span>{range || 'Dates TBD'}</span>
                          </span>
                          <span className={styles.tourFill}>
                            <span>{active.length === 0 ? 'No shows yet' : `${booked.length} of ${active.length} booked`}</span>
                            <span className="tour-meter" aria-hidden="true"><span className="tour-meter-bar" style={{ width: `${pct}%`, display: 'block' }} /></span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* ── Targets ───────────────────────────────────────────────────── */}
            <section className={styles.section} aria-labelledby="dash-targets">
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle} id="dash-targets">Targets</h2>
                <Link href="/email?tab=outreach&status=target" className={styles.viewAll}>Outreach →</Link>
              </header>
              {loading ? <div className={`tour-skeleton ${styles.skeletonRow}`} /> : targets.length === 0 ? (
                <div className={styles.empty}>
                  <span>No targets yet — add venues to a tour to start pitching.</span>
                  <Link href="/venues" className="btn btn-secondary btn-sm">Find venues</Link>
                </div>
              ) : (
                <ul className={styles.targetCloud}>
                  {targets.map(t => (
                    <li key={t.id}>
                      <Link href={t.venue?.id ? `/venues/${t.venue.id}` : '/email?tab=outreach&status=target'} className={styles.targetChip}>
                        <strong>{t.venue?.name ?? 'Venue'}</strong>
                        <span>{[t.venue?.city, t.venue?.state].filter((x): x is string => x != null).join(', ')}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* ── AI Booking Agent — docked here, or a placeholder while it's popped out ── */}
          {agentPoppedOut ? (
            <section className={styles.agentPopped} aria-label="AI booking agent">
              <div>
                <h2 className={styles.agentPoppedTitle}>Booking agent is in its own window</h2>
                <p className={styles.agentPoppedText}>Keep chatting there while you work anywhere on the site. Your conversation carries over when you bring it back.</p>
              </div>
              <div className={styles.agentPoppedActions}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={showAgentWindow}>Show agent window</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={dockAgent}>Bring it back here</button>
              </div>
            </section>
          ) : (
            <>
              {popoutBlocked && (
                <p role="alert" className={styles.agentPopoutBlocked}>
                  Your browser blocked the pop-out window. Allow pop-ups for this site, then press Pop out again.
                </p>
              )}
              <BookingAgentPanel
                act={{ id: myAct.id, act_name: myAct.act_name ?? null }}
                displayName={userProfile?.display_name ?? null}
                greetingStats={loading ? null : { toursCount, targetsCount }}
                mode="docked"
                onDataChanged={() => void load()}
                onPopOut={popOutAgent}
              />
            </>
          )}

          {/* ── Shortcuts ────────────────────────────────────────────────── */}
          <nav className={styles.tiles} aria-label="Shortcuts">
            {dashTiles.map(tile => (
              <Link key={tile.label} href={tile.href} className={styles.tile} style={{ '--tile-accent': tile.accent } as React.CSSProperties}>
                <span className={styles.tileIcon} aria-hidden="true">{tile.icon}</span>
                <span className={styles.tileLabel}>{tile.label}</span>
                <span className={styles.tileSub}>{tile.sub}</span>
                <span className={styles.tileGo} aria-hidden="true">Open →</span>
              </Link>
            ))}
          </nav>
        </>
      )}
    </AppShell>
  );
}
