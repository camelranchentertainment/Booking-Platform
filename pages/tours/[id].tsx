import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { useLookup } from '../../lib/hooks/useLookup';
import Link from 'next/link';

type RouteStop = {
  booking_id: string;
  venue_name: string;
  city: string;
  state: string;
  show_date?: string | null;
  drive_to_next?: { minutes: number; miles: number } | null;
};

type RouteData = {
  current: RouteStop[];
  current_total_minutes: number;
  optimized: RouteStop[];
  optimized_total_minutes: number;
  savings_minutes: number;
};

function fmtDrive(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function DrivePill({ minutes, miles, warn }: { minutes: number; miles: number; warn?: boolean }) {
  const color = warn ? '#fb923c' : 'var(--text-muted)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.6rem', margin: '0 1rem' }}>
      <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color, letterSpacing: '0.06em' }}>
        ↓ {fmtDrive(minutes)} · {miles} mi
      </span>
    </div>
  );
}

function RouteList({ stops }: { stops: RouteStop[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {stops.map((s, i) => (
        <div key={s.booking_id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.5rem 0.6rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', width: '18px', textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{s.venue_name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {s.city}, {s.state}{s.show_date ? ` · ${fmtDate(s.show_date)}` : ''}
              </div>
            </div>
          </div>
          {s.drive_to_next && (
            <DrivePill minutes={s.drive_to_next.minutes} miles={s.drive_to_next.miles} warn={s.drive_to_next.minutes > 300} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function TourDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { values: statusValues } = useLookup('tour_status');
  const [tour, setTour]         = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [edit, setEdit]         = useState(false);
  const [form, setForm]         = useState<any>({});
  const [saving, setSaving]     = useState(false);
  const [route, setRoute]       = useState<RouteData | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError]     = useState('');
  const [view, setView]         = useState<'current' | 'optimized'>('current');

  useEffect(() => { if (id) loadAll(); }, [id]);

  const loadAll = async () => {
    const [tourRes, bookingsRes] = await Promise.all([
      supabase.from('tours').select('*, act:acts(act_name)').eq('id', id).single(),
      supabase.from('bookings').select(`
        id, status, show_date, fee,
        venue:venues(id, name, city, state, place_id)
      `).eq('tour_id', id).order('show_date', { ascending: true }),
    ]);
    if (tourRes.data) { setTour(tourRes.data); setForm(tourRes.data); }
    setBookings(bookingsRes.data || []);
    setRoute(null);
  };

  const save = async () => {
    setSaving(true);
    await supabase.from('tours').update({
      name:          form.name,
      description:   form.description  || null,
      start_date:    form.start_date   || null,
      end_date:      form.end_date     || null,
      routing_notes: form.routing_notes || null,
      status:        form.status,
    }).eq('id', id);
    await loadAll();
    setEdit(false);
    setSaving(false);
  };

  const analyzeRoute = async () => {
    setRouteLoading(true);
    setRouteError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/tours/route?tour_id=${id}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to analyze route');
      setRoute(data);
      setView('current');
    } catch (e: any) {
      setRouteError(e.message);
    } finally {
      setRouteLoading(false);
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f: any) => ({ ...f, [k]: e.target.value }));

  const statusLabel = (v: string) => statusValues.find(lv => lv.value === v)?.label ?? v;

  if (!tour) return <AppShell requireRole="agent"><div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>Loading...</div></AppShell>;

  const venueBookings = bookings.filter((b: any) => b.venue?.city);
  const canAnalyze = venueBookings.length >= 2;

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
        {/* Tour info / edit */}
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
                  {statusValues.map(lv => <option key={lv.value} value={lv.value}>{lv.label}</option>)}
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

        {/* Shows list */}
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
                    <span className={`badge badge-${b.status}`}>{b.status}</span>
                    {b.fee && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--accent)' }}>${Number(b.fee).toLocaleString()}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Route Optimizer */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="card-title">ROUTE OPTIMIZER</span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={analyzeRoute}
            disabled={routeLoading || !canAnalyze}
            title={!canAnalyze ? 'Need at least 2 shows with venues' : ''}
          >
            {routeLoading ? 'Calculating…' : route ? 'Recalculate' : 'Analyze Route'}
          </button>
        </div>

        {!canAnalyze && (
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            Add at least 2 shows with venues to analyze routing.
          </div>
        )}

        {routeError && (
          <div style={{ color: '#ef4444', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{routeError}</div>
        )}

        {route && (
          <div>
            {/* Summary bar */}
            <div style={{ display: 'flex', gap: '1.5rem', padding: '0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Current Order</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', color: 'var(--text-primary)', marginTop: '0.15rem' }}>{fmtDrive(route.current_total_minutes)} driving</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Optimized Order</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', color: '#34d399', marginTop: '0.15rem' }}>{fmtDrive(route.optimized_total_minutes)} driving</div>
              </div>
              {route.savings_minutes > 0 && (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Potential Savings</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', color: '#fb923c', marginTop: '0.15rem' }}>↓ {fmtDrive(route.savings_minutes)}</div>
                </div>
              )}
              {route.savings_minutes <= 0 && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#34d399', alignSelf: 'flex-end', paddingBottom: '0.1rem' }}>
                  ✓ Already optimal
                </div>
              )}
            </div>

            {/* View toggle */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button className={`btn btn-sm ${view === 'current' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('current')}>Current Order</button>
              <button className={`btn btn-sm ${view === 'optimized' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('optimized')}>Optimized Order</button>
            </div>

            {view === 'current' ? (
              <RouteList stops={route.current} />
            ) : (
              <>
                {route.savings_minutes > 0 && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    Suggested routing if show dates are still flexible. Orange legs = long drives (&gt;5h).
                  </div>
                )}
                <RouteList stops={route.optimized} />
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
