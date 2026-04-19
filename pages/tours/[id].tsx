import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { BOOKING_STATUS_LABELS } from '../../lib/types';
import Link from 'next/link';

export default function TourDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [tour, setTour]       = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [edit, setEdit]       = useState(false);
  const [form, setForm]       = useState<any>({});
  const [saving, setSaving]   = useState(false);

  useEffect(() => { if (id) loadAll(); }, [id]);

  const loadAll = async () => {
    const [tourRes, bookingsRes] = await Promise.all([
      supabase.from('tours').select('*, act:acts(act_name)').eq('id', id).single(),
      supabase.from('bookings').select(`
        id, status, show_date, fee,
        venue:venues(name, city, state)
      `).eq('tour_id', id).order('show_date', { ascending: true }),
    ]);
    if (tourRes.data) { setTour(tourRes.data); setForm(tourRes.data); }
    setBookings(bookingsRes.data || []);
  };

  const save = async () => {
    setSaving(true);
    await supabase.from('tours').update({
      name:         form.name,
      description:  form.description || null,
      start_date:   form.start_date  || null,
      end_date:     form.end_date    || null,
      routing_notes: form.routing_notes || null,
      status:       form.status,
    }).eq('id', id);
    await loadAll();
    setEdit(false);
    setSaving(false);
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f: any) => ({ ...f, [k]: e.target.value }));

  if (!tour) return <AppShell requireRole="agent"><div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>Loading...</div></AppShell>;

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{tour.act?.act_name}</div>
          <h1 className="page-title">{tour.name}</h1>
          {(tour.start_date || tour.end_date) && (
            <div className="page-sub">
              {tour.start_date ? new Date(tour.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '?'}
              {' — '}
              {tour.end_date ? new Date(tour.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={() => setEdit(!edit)}>Edit</button>
          <Link href={`/bookings/new?tour=${tour.id}&act=${tour.act_id}`} className="btn btn-primary">+ Add Show</Link>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          {edit ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="field"><label className="field-label">Tour Name</label><input className="input" value={form.name || ''} onChange={set('name')} /></div>
              <div className="grid-2">
                <div className="field"><label className="field-label">Start Date</label><input className="input" type="date" value={form.start_date?.substring(0,10) || ''} onChange={set('start_date')} /></div>
                <div className="field"><label className="field-label">End Date</label><input className="input" type="date" value={form.end_date?.substring(0,10) || ''} onChange={set('end_date')} /></div>
              </div>
              <div className="field">
                <label className="field-label">Status</label>
                <select className="select" value={form.status || 'planning'} onChange={set('status')}>
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="field"><label className="field-label">Description</label><textarea className="textarea" value={form.description || ''} onChange={set('description')} /></div>
              <div className="field"><label className="field-label">Routing Notes</label><textarea className="textarea" value={form.routing_notes || ''} onChange={set('routing_notes')} placeholder="Drive times, lodging notes, routing logic..." /></div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setEdit(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={save} disabled={saving}>Save</button>
              </div>
            </div>
          ) : (
            <>
              <div className="card-header"><span className="card-title">TOUR INFO</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.88rem' }}>
                {tour.description && <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '0.5rem' }}>{tour.description}</p>}
                {tour.routing_notes && (
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>Routing Notes</div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{tour.routing_notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">SHOWS ({bookings.length})</span>
          </div>
          {bookings.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
              No shows yet. <Link href={`/bookings/new?tour=${tour.id}&act=${tour.act_id}`} style={{ color: 'var(--accent)' }}>Add first show →</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {bookings.map((b: any) => (
                <Link key={b.id} href={`/bookings/${b.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.6rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', textDecoration: 'none' }}>
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 500 }}>{b.venue?.name || 'TBD'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
                      {b.show_date ? new Date(b.show_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      {b.venue?.city ? ` · ${b.venue.city}, ${b.venue.state}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                    <span className={`badge badge-${b.status}`}>{BOOKING_STATUS_LABELS[b.status as keyof typeof BOOKING_STATUS_LABELS]}</span>
                    {b.fee && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--accent)' }}>${Number(b.fee).toLocaleString()}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
