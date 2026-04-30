import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { getActId, getBandBookings } from '../../lib/bookingQueries';
import { BookingStatus, BOOKING_STATUS_LABELS, BOOKING_STATUS_ORDER } from '../../lib/types';
import Link from 'next/link';

export default function BookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const actId = await getActId(supabase, user.id);
    if (!actId) { setLoading(false); return; }
    const data = await getBandBookings(supabase, actId);
    setBookings(data);
    setLoading(false);
  };

  const moveStatus = async (bookingId: string, newStatus: BookingStatus) => {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/bookings/move-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ bookingId, status: newStatus }),
    });
    setBookings(bs => bs.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
  };

  const columns = BOOKING_STATUS_ORDER.map(status => ({
    status,
    label: BOOKING_STATUS_LABELS[status],
    bookings: bookings.filter(b => b.status === status),
  }));

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bookings</h1>
          <div className="page-sub">Pipeline · {bookings.length} total</div>
        </div>
        <Link href="/bookings/new" className="btn btn-primary">+ New Booking</Link>
      </div>

      <div className="kanban-board">
        {columns.map(col => (
          <div key={col.status} className="kanban-col">
            <div className="kanban-col-header">
              <span className={`kanban-col-title badge-${col.status}`} style={{ color: `var(--status-${col.status})` }}>{col.label.toUpperCase()}</span>
              <span className="kanban-col-count">{col.bookings.length}</span>
            </div>
            <div className="kanban-cards">
              {col.bookings.map(b => (
                <div key={b.id} className="kanban-card" onClick={() => router.push(`/bookings/${b.id}`)}>
                  <div className="kanban-card-act">{b.act?.act_name || '—'}</div>
                  <div className="kanban-card-venue">{b.venue?.name || 'No venue'}</div>
                  <div className="kanban-card-meta">
                    {b.venue?.city ? `${b.venue.city}, ${b.venue.state}` : ''}
                    {b.show_date ? ` · ${new Date(b.show_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                    {b.fee ? ` · $${Number(b.fee).toLocaleString()}` : ''}
                  </div>
                </div>
              ))}
              {col.bookings.length === 0 && (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>—</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
