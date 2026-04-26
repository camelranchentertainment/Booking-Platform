import { useState, useEffect } from 'react';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';
import Link from 'next/link';

const DEAL_LABELS: Record<string, string> = {
  guarantee:  'Guarantee',
  door_split: 'Door Split',
  percentage: 'Percentage',
  flat_fee:   'Flat Fee',
  other:      'Other',
};

function fmt(t: string | null | undefined): string {
  if (!t) return 'TBD';
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

function ShowCard({ booking, role, label, dimPast }: { booking: any; role: string; label: string; dimPast?: boolean }) {
  const isAgent = role === 'agent' || role === 'superadmin';
  const isMember = role === 'member';
  const v = booking.venue;
  const pendingFields: string[] = [];
  if (!booking.soundcheck_time) pendingFields.push('Soundcheck');
  if (!booking.set_time) pendingFields.push('Set Time');
  if (!booking.load_in_time) pendingFields.push('Load-in');

  return (
    <div className="card" style={{ opacity: dimPast ? 0.7 : 1 }}>
      <div className="card-header">
        <span className="card-title" style={{ color: 'var(--accent)' }}>{label}</span>
        {booking.tour && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            {booking.tourPosition ? `Day ${booking.tourPosition.current} of ${booking.tourPosition.total} · ` : ''}{booking.tour.name}
          </span>
        )}
      </div>

      {/* Venue */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--text-primary)', letterSpacing: '0.04em', lineHeight: 1.2 }}>
          {v?.name || 'Venue TBD'}
        </div>
        {v?.city && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
            {v.city}, {v.state}
            {v.address && ` · ${v.address}`}
          </div>
        )}
        {v?.phone && (
          <a href={`tel:${v.phone}`} style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--accent)', display: 'block', marginTop: '0.1rem' }}>
            {v.phone}
          </a>
        )}
      </div>

      {/* Schedule */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
        {[
          ['Load-in',    booking.load_in_time],
          ['Soundcheck', booking.soundcheck_time],
          ['Showtime',   booking.set_time],
          ['End Time',   booking.end_time],
        ].map(([lbl, val]) => (
          <div key={lbl} style={{ background: 'var(--bg-overlay)', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', borderLeft: `2px solid ${val ? 'var(--accent)' : '#f97316'}` }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '0.1rem' }}>{lbl}</div>
            <div style={{ color: val ? 'var(--text-primary)' : '#f97316', fontWeight: 600, fontSize: '0.9rem' }}>{fmt(val)}</div>
          </div>
        ))}
      </div>

      {/* Logistics */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
        {[
          ['Sound', booking.sound_system === 'house' ? 'House PA' : booking.sound_system === 'self' ? 'Self-Provided' : 'TBD'],
          ['Meals', booking.meals_provided ? 'Provided' : 'Not provided'],
          ['Drinks', booking.drinks_provided ? 'Provided' : 'Not provided'],
          ['Hotel', booking.hotel_booked ? 'Booked' : 'Not booked'],
        ].map(([lbl, val]) => (
          <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{lbl}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{val}</span>
          </div>
        ))}
        {booking.lodging_details && (
          <div style={{ padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Lodging</span>
            <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.5 }}>{booking.lodging_details}</div>
          </div>
        )}
        {booking.venue_contact_name && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contact</span>
            <span style={{ color: 'var(--text-secondary)' }}>{booking.venue_contact_name}</span>
          </div>
        )}
        {booking.special_requirements && (
          <div style={{ padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Special Requirements</span>
            <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.5 }}>{booking.special_requirements}</div>
          </div>
        )}
        {booking.advance_notes && !isMember && (
          <div style={{ padding: '0.3rem 0' }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Advance Notes</span>
            <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.5 }}>{booking.advance_notes}</div>
          </div>
        )}
      </div>

      {/* Financial — agent/act_admin only */}
      {!isMember && (booking.deal_type || booking.agreed_amount) && (
        <div style={{ marginTop: '1rem', padding: '0.65rem 0.9rem', background: 'rgba(200,146,26,0.06)', border: '1px solid rgba(200,146,26,0.2)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Deal</div>
          <div style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.9rem' }}>
            {DEAL_LABELS[booking.deal_type] || booking.deal_type || 'TBD'}
            {booking.agreed_amount ? ` · $${Number(booking.agreed_amount).toLocaleString()}` : ''}
          </div>
        </div>
      )}

      {/* Pending flags */}
      {pendingFields.length > 0 && (
        <div style={{ marginTop: '0.75rem', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: '#f97316', fontFamily: 'var(--font-body)' }}>
          ⚠ Unconfirmed: {pendingFields.join(', ')}
          {isAgent && (
            <Link href={`/bookings/${booking.id}`} style={{ marginLeft: '0.5rem', color: 'var(--accent)', textDecoration: 'underline' }}>Fill in →</Link>
          )}
        </div>
      )}
    </div>
  );
}

export default function TodayPage() {
  const [role, setRole]             = useState<string>('');
  const [today, setToday]           = useState<any>(null);
  const [tomorrow, setTomorrow]     = useState<any>(null);
  const [upcoming, setUpcoming]     = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [todayStr, setTodayStr]     = useState('');
  const [tomorrowStr, setTomorrowStr] = useState('');

  useEffect(() => {
    const now   = new Date();
    const tom   = new Date(now); tom.setDate(tom.getDate() + 1);
    const td    = now.toISOString().substring(0, 10);
    const tm    = tom.toISOString().substring(0, 10);
    setTodayStr(td);
    setTomorrowStr(tm);
    load(td, tm);
  }, []);

  const load = async (td: string, tm: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prof } = await supabase.from('user_profiles').select('role, act_id').eq('id', user.id).maybeSingle();
    const userRole = prof?.role || 'member';
    setRole(userRole);

    let actIds: string[] = [];
    if (userRole === 'agent' || userRole === 'superadmin') {
      const { data: agentActs } = await supabase.from('acts').select('id').eq('agent_id', user.id);
      actIds = (agentActs || []).map((a: any) => a.id);
    } else {
      let aid: string | null = null;
      const { data: owned } = await supabase.from('acts').select('id').eq('owner_id', user.id).limit(1);
      if (owned?.length) { aid = owned[0].id; }
      else if (prof?.act_id) { aid = prof.act_id; }
      if (aid) actIds = [aid];
    }

    if (!actIds.length) { setLoading(false); return; }

    const q = supabase.from('bookings').select(`
      id, show_date, load_in_time, soundcheck_time, set_time, end_time,
      set_length_min, sound_system, meals_provided, drinks_provided,
      hotel_booked, lodging_details, venue_contact_name, special_requirements,
      advance_notes, deal_type, agreed_amount, tour_id,
      venue:venues(id, name, city, state, address, phone),
      tour:tours(id, name)
    `).in('act_id', actIds).in('status', ['confirmed', 'advancing']);

    const [todayRes, tomorrowRes, upcomingRes] = await Promise.all([
      q.eq('show_date', td).limit(1),
      q.eq('show_date', tm).limit(1),
      supabase.from('bookings').select(`
        id, show_date, venue:venues(name, city, state)
      `).in('act_id', actIds).in('status', ['confirmed', 'advancing'])
        .gt('show_date', tm).order('show_date').limit(1),
    ]);

    const todayBooking    = todayRes.data?.[0] || null;
    const tomorrowBooking = tomorrowRes.data?.[0] || null;
    const upcomingBooking = upcomingRes.data?.[0] || null;

    // Calculate tour position for today's show
    if (todayBooking?.tour_id) {
      const { data: tourShows } = await supabase.from('bookings')
        .select('id, show_date').eq('tour_id', todayBooking.tour_id)
        .neq('status', 'cancelled').order('show_date');
      const sorted = (tourShows || []).filter((b: any) => b.show_date);
      const pos = sorted.findIndex((b: any) => b.id === todayBooking.id);
      if (pos !== -1) (todayBooking as any).tourPosition = { current: pos + 1, total: sorted.length };
    }

    setToday(todayBooking);
    setTomorrow(tomorrowBooking);
    setUpcoming(upcomingBooking);
    setLoading(false);
  };

  const dateLabel = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <AppShell requireRole={['agent', 'act_admin', 'member']}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Today</h1>
          <div className="page-sub">{todayStr ? dateLabel(todayStr) : ''}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[1,2].map(i => <div key={i} className="skeleton" style={{ height: 280 }} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {today ? (
            <ShowCard booking={today} role={role} label={`TODAY · ${dateLabel(todayStr)}`} />
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>
              No show today.
            </div>
          )}

          {tomorrow ? (
            <ShowCard booking={tomorrow} role={role} label={`TOMORROW · ${dateLabel(tomorrowStr)}`} />
          ) : (
            <div className="card" style={{ padding: '1rem 1.25rem' }}>
              <div className="card-header"><span className="card-title">TOMORROW</span></div>
              {upcoming ? (
                <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>
                  No show tomorrow. Next show:{' '}
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{upcoming.venue?.name}</span>
                  {upcoming.venue?.city && ` · ${upcoming.venue.city}, ${upcoming.venue.state}`}
                  {upcoming.show_date && ` on ${dateLabel(upcoming.show_date)}`}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>
                  No upcoming shows scheduled.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
