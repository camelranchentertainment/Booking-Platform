import { useState, useEffect } from 'react';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';
import { Act, Booking, BOOKING_STATUS_LABELS } from '../lib/types';
import Link from 'next/link';

interface PipelineSummary {
  status: string;
  count: number;
}

export default function Dashboard() {
  const [acts, setActs]             = useState<Act[]>([]);
  const [pipeline, setPipeline]     = useState<PipelineSummary[]>([]);
  const [recent, setRecent]         = useState<Booking[]>([]);
  const [potential, setPotential] = useState(0);
  const [earned, setEarned]       = useState(0);
  const [tours, setTours]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [actsRes, bookingsRes, toursRes] = await Promise.all([
        supabase.from('acts').select('*').eq('agent_id', user.id).eq('is_active', true).order('act_name'),
        supabase.from('bookings').select(`
          id, status, show_date, fee, amount_paid, payment_status, created_at,
          act:acts(act_name),
          venue:venues(name, city, state)
        `).eq('created_by', user.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('tours').select('id, name, status, act:acts(act_name)').eq('created_by', user.id).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(5),
      ]);

      const bookings = (bookingsRes.data || []) as any[];
      setActs(actsRes.data || []);
      setTours(toursRes.data || []);

      // Pipeline counts
      const counts: Record<string, number> = {};
      for (const b of bookings) {
        counts[b.status] = (counts[b.status] || 0) + 1;
      }
      setPipeline(Object.entries(counts).map(([status, count]) => ({ status, count })));
      setRecent(bookings.slice(0, 8));
      const todayStr = new Date().toISOString().split('T')[0];
      const calcPotential = bookings
        .filter((b: any) => b.status === 'confirmed' && b.show_date && b.show_date > todayStr && b.payment_status === 'pending')
        .reduce((s: number, b: any) => s + (Number(b.fee) || 0), 0);
      const calcEarned = bookings
        .filter((b: any) => b.status === 'completed')
        .reduce((s: number, b: any) => s + (Number(b.amount_paid) || 0), 0);
      setPotential(calcPotential);
      setEarned(calcEarned);
      setLoading(false);
    };
    load();
  }, []);

  const totalActive = pipeline.filter(p => !['completed','cancelled'].includes(p.status)).reduce((s, p) => s + p.count, 0);
  const totalConfirmed = pipeline.find(p => p.status === 'confirmed')?.count || 0;

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <div className="page-sub">Overview · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
        <Link href="/bookings/new" className="btn btn-primary">+ New Booking</Link>
      </div>

      {/* Top stats */}
      <div className="grid-4 mb-6">
        <Link href="/acts" className="stat-block" style={{ textDecoration: 'none', cursor: 'pointer', borderTop: '3px solid #60a5fa' }}>
          <div className="stat-value">{acts.length}</div>
          <div className="stat-label">Active Bands</div>
        </Link>
        <Link href="/bookings" className="stat-block" style={{ textDecoration: 'none', cursor: 'pointer', borderTop: '3px solid #f59e0b' }}>
          <div className="stat-value">{totalActive}</div>
          <div className="stat-label">In Pipeline</div>
        </Link>
        <Link href="/calendar" className="stat-block" style={{ textDecoration: 'none', cursor: 'pointer', borderTop: '3px solid #34d399' }}>
          <div className="stat-value">{totalConfirmed}</div>
          <div className="stat-label">Confirmed Shows</div>
        </Link>
        <Link href="/bookings" className="stat-block" style={{ textDecoration: 'none', cursor: 'pointer', borderTop: '3px solid #34d399' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', color: '#34d399', lineHeight: 1 }}>
            {earned > 0 ? `$${earned.toLocaleString()}` : '—'}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Earned</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>collected from played shows</div>
          {potential > 0 && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', margin: '0.5rem 0 0.4rem' }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#C8921A', lineHeight: 1 }}>
                {`$${potential.toLocaleString()}`}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Potential</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>projected income</div>
            </>
          )}
        </Link>
      </div>

      <div className="grid-2">
        {/* Acts */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">YOUR BANDS</span>
            <Link href="/acts" className="btn btn-ghost btn-sm">View All</Link>
          </div>
          {acts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>
              No bands yet.<br />
              <Link href="/acts/new" style={{ color: 'var(--accent)' }}>Add your first band →</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {acts.map(act => (
                <Link key={act.id} href={`/acts/${act.id}`} className="row-link">
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem' }}>{act.act_name}</div>
                    {act.genre && <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', fontFamily: 'var(--font-body)', letterSpacing: '0.06em' }}>{act.genre}</div>}
                  </div>
                  <span style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>→</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Pipeline */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">PIPELINE</span>
            <Link href="/bookings" className="btn btn-ghost btn-sm">View All</Link>
          </div>
          {pipeline.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>
              No bookings yet.<br />
              <Link href="/bookings/new" style={{ color: 'var(--accent)' }}>Start pitching →</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {pipeline.map(({ status, count }) => (
                <div key={status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)' }}>
                  <span className={`badge badge-${status}`}>{BOOKING_STATUS_LABELS[status as keyof typeof BOOKING_STATUS_LABELS] || status}</span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tours */}
      {tours.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">ACTIVE TOURS</span>
            <Link href="/tours" className="btn btn-ghost btn-sm">View All</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {tours.map((t: any) => (
              <Link key={t.id} href={`/tours/${t.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', textDecoration: 'none' }}>
                <div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.88rem' }}>{t.name}</div>
                  <div style={{ color: 'var(--accent)', fontSize: '0.8rem', fontFamily: 'var(--font-body)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{t.act?.act_name}</div>
                </div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: t.status === 'active' ? '#34d399' : 'var(--text-muted)' }}>{t.status}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent bookings */}
      {recent.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="card-header">
            <span className="card-title">RECENT BOOKINGS</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Band</th>
                  <th>Venue</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Fee</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((b: any) => (
                  <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/bookings/${b.id}`}>
                    <td style={{ color: 'var(--accent)', fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>{b.act?.act_name || '—'}</td>
                    <td>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{b.venue?.name || '—'}</div>
                      {b.venue?.city && <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>{b.venue.city}, {b.venue.state}</div>}
                    </td>
                    <td style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
                      {b.show_date ? new Date(b.show_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                    <td><span className={`badge badge-${b.status}`}>{BOOKING_STATUS_LABELS[b.status as keyof typeof BOOKING_STATUS_LABELS] || b.status}</span></td>
                    <td style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--accent)' }}>
                      {b.fee ? `$${Number(b.fee).toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
