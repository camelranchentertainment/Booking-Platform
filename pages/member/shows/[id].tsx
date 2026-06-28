import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import AppShell from '../../../components/layout/AppShell';
import { supabase } from '../../../lib/supabase';

type Show = {
  id: string;
  booking_id: string | null;
  status: 'pending' | 'confirmed' | 'declined';
  notes: string | null;
  responded_at: string | null;
  show_date: string | null;
  booking_status: string | null;
  load_in_time: string | null;
  set_time: string | null;
  door_time: string | null;
  soundcheck_time: string | null;
  venue: { name: string | null; address: string | null; city: string | null; state: string | null } | null;
  pay: { amount: number; source: 'confirmed' | 'estimated' } | null;
};

const RSVP_COLOR: Record<string, string> = {
  pending:   '#fbbf24',
  confirmed: '#34d399',
  declined:  '#64748b',
};

function fmt(t: string | null | undefined) {
  if (!t) return null;
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function TimeRow({ label, value, accent }: { label: string; value: string | null | undefined; accent?: boolean }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ color: accent ? 'var(--accent)' : 'var(--text-primary)', fontSize: '0.88rem', fontWeight: accent ? 600 : 400 }}>{value}</span>
    </div>
  );
}

export default function MemberShowDetail() {
  const router = useRouter();
  const { id } = router.query;

  const [show, setShow]       = useState<Show | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [rsvpBusy, setRsvpBusy]     = useState(false);
  const [rsvpError, setRsvpError]   = useState('');
  const [rsvpSuccess, setRsvpSuccess] = useState('');

  useEffect(() => {
    if (!id) return;
    load(id as string);
  }, [id]);

  const load = async (bpId: string) => {
    setLoading(true);
    setFetchError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res  = await fetch('/api/member/shows', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) { setFetchError(json.error || 'Failed to load'); return; }
      const found = (json.shows as Show[]).find(s => s.id === bpId);
      if (!found) { setFetchError('Show not found.'); return; }
      setShow(found);
    } catch {
      setFetchError('Failed to load show details.');
    } finally {
      setLoading(false);
    }
  };

  const respond = async (status: 'confirmed' | 'declined') => {
    if (!show) return;
    setRsvpBusy(true);
    setRsvpError('');
    setRsvpSuccess('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res  = await fetch(`/api/member/shows/${show.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body:    JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) { setRsvpError(json.error || 'Update failed'); return; }
      setShow(prev => prev ? { ...prev, status, responded_at: json.show?.responded_at ?? prev.responded_at } : prev);
      setRsvpSuccess(status === 'confirmed' ? "You're confirmed for this show." : "You've declined this show.");
    } catch {
      setRsvpError('Failed to update. Please try again.');
    } finally {
      setRsvpBusy(false);
    }
  };

  if (loading) {
    return (
      <AppShell requireRole="member">
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', padding: '2rem 0' }}>Loading...</div>
      </AppShell>
    );
  }

  if (fetchError || !show) {
    return (
      <AppShell requireRole="member">
        <div style={{ color: '#f87171', fontFamily: 'var(--font-body)', marginBottom: '1rem' }}>
          {fetchError || 'Show not found.'}
        </div>
        <Link href="/member/calendar" style={{ color: 'var(--accent)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
          ← Back to calendar
        </Link>
      </AppShell>
    );
  }

  const showDateFormatted = show.show_date
    ? new Date(show.show_date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    : 'Date TBD';

  const statusColor = RSVP_COLOR[show.status] || '#64748b';

  return (
    <AppShell requireRole="member">
      <div className="page-header">
        <div>
          <Link
            href="/member/calendar"
            style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', textDecoration: 'none' }}
          >
            ← Calendar
          </Link>
          <h1 className="page-title" style={{ marginTop: '0.25rem' }}>{show.venue?.name || 'TBD'}</h1>
          <div className="page-sub">{showDateFormatted}</div>
        </div>
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: statusColor, background: `${statusColor}20`,
          padding: '0.25rem 0.65rem', borderRadius: '4px',
          border: `1px solid ${statusColor}40`, alignSelf: 'flex-start',
        }}>
          {show.status}
        </span>
      </div>

      <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Venue */}
        <div className="card">
          <div className="card-header"><span className="card-title">VENUE</span></div>
          {show.venue?.name ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <div style={{ fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>{show.venue.name}</div>
              {show.venue.address && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{show.venue.address}</div>
              )}
              {show.venue.city && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{show.venue.city}, {show.venue.state}</div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>No venue assigned yet.</div>
          )}
        </div>

        {/* Schedule */}
        {(show.door_time || show.load_in_time || show.soundcheck_time || show.set_time) && (
          <div className="card">
            <div className="card-header"><span className="card-title">SCHEDULE</span></div>
            <TimeRow label="Doors"      value={fmt(show.door_time)} />
            <TimeRow label="Load-in"    value={fmt(show.load_in_time)} />
            <TimeRow label="Soundcheck" value={fmt(show.soundcheck_time)} />
            <TimeRow label="Set Time"   value={fmt(show.set_time)} accent />
          </div>
        )}

        {/* Pay — read-only, source label is mandatory */}
        <div className="card">
          <div className="card-header"><span className="card-title">PAY</span></div>
          {show.pay ? (
            <>
              <div style={{ fontSize: '1.6rem', fontFamily: 'var(--font-display)', color: 'var(--accent)', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                ${show.pay.amount.toLocaleString()}
              </div>
              {show.pay.source === 'confirmed' ? (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: '#34d399' }}>
                  Confirmed per-show amount
                </div>
              ) : (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: '#fbbf24' }}>
                  Standard rate — not yet finalized for this show
                </div>
              )}
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
              No pay information on file yet.
            </div>
          )}
        </div>

        {/* RSVP */}
        <div className="card">
          <div className="card-header"><span className="card-title">YOUR RSVP</span></div>

          {rsvpError && (
            <div style={{ color: '#f87171', fontFamily: 'var(--font-body)', fontSize: '0.83rem', marginBottom: '0.75rem' }}>
              {rsvpError}
            </div>
          )}
          {rsvpSuccess && (
            <div style={{ color: '#34d399', fontFamily: 'var(--font-body)', fontSize: '0.83rem', marginBottom: '0.75rem' }}>
              {rsvpSuccess}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className="btn btn-primary"
              disabled={rsvpBusy || show.status === 'confirmed'}
              onClick={() => respond('confirmed')}
              style={show.status === 'confirmed'
                ? { opacity: 1, background: '#34d39930', borderColor: '#34d399', color: '#34d399' }
                : undefined}
            >
              {show.status === 'confirmed' ? '✓ Confirmed' : rsvpBusy ? '...' : 'Confirm'}
            </button>
            <button
              className="btn btn-secondary"
              disabled={rsvpBusy || show.status === 'declined'}
              onClick={() => respond('declined')}
              style={show.status === 'declined'
                ? { opacity: 0.7, borderColor: '#64748b', color: '#64748b' }
                : undefined}
            >
              {show.status === 'declined' ? 'Declined' : rsvpBusy ? '...' : 'Decline'}
            </button>
          </div>

          {show.responded_at && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.65rem' }}>
              Responded {new Date(show.responded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          )}
        </div>

      </div>
    </AppShell>
  );
}
