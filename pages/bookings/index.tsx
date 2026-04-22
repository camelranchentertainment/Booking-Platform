import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { BookingStatus, BOOKING_STATUS_LABELS, BOOKING_STATUS_ORDER } from '../../lib/types';
type ActPick = { id: string; act_name: string };
import Link from 'next/link';

export default function BookingsPage() {
  const router = useRouter();
  const actFilter = router.query.act as string | undefined;
  const [bookings, setBookings] = useState<any[]>([]);
  const [acts, setActs]         = useState<ActPick[]>([]);
  const [filterAct, setFilterAct] = useState(actFilter || '');
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    loadAll();
  }, [filterAct]);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let q = supabase.from('bookings').select(`
      id, status, show_date, fee, deal_notes, internal_notes, created_at,
      act:acts(id, act_name),
      venue:venues(id, name, city, state),
      tour:tours(id, name)
    `).eq('created_by', user.id).order('created_at', { ascending: false });

    if (filterAct) q = q.eq('act_id', filterAct);

    const [bookingsRes, actsRes] = await Promise.all([
      q,
      supabase.from('acts').select('id, act_name').eq('agent_id', user.id).order('act_name'),
    ]);

    setBookings(bookingsRes.data || []);
    setActs(actsRes.data || []);
    setLoading(false);
  };

  const moveStatus = async (bookingId: string, newStatus: BookingStatus) => {
    await supabase.from('bookings').update({ status: newStatus }).eq('id', bookingId);
    setBookings(bs => bs.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
  };

  const columns = BOOKING_STATUS_ORDER.map(status => ({
    status,
    label: BOOKING_STATUS_LABELS[status],
    bookings: bookings.filter(b => b.status === status),
  }));

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bookings</h1>
          <div className="page-sub">Pipeline · {bookings.length} total</div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select className="select" style={{ width: 200 }} value={filterAct} onChange={e => setFilterAct(e.target.value)}>
            <option value="">All Acts</option>
            {acts.map(a => <option key={a.id} value={a.id}>{a.act_name}</option>)}
          </select>
          <Link href="/bookings/new" className="btn btn-primary">+ New Booking</Link>
        </div>
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
