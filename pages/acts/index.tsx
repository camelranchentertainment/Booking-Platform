import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';

export default function BandsPage() {
  const [bands, setBands]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [bookingCounts, setBookingCounts] = useState<Record<string, number>>({});

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: myBands } = await supabase.from('acts').select('*').eq('owner_id', user.id).order('act_name');
    const owned = myBands || [];
    setBands(owned);

    if (owned.length > 0) {
      const ids = owned.map((b: any) => b.id);
      const { data: counts } = await supabase
        .from('bookings')
        .select('act_id')
        .in('act_id', ids)
        .in('status', ['pitch', 'followup', 'negotiation', 'hold', 'contract', 'confirmed', 'advancing']);
      const map: Record<string, number> = {};
      for (const row of counts || []) map[row.act_id] = (map[row.act_id] || 0) + 1;
      setBookingCounts(map);
    }

    setLoading(false);
  };

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bands</h1>
          <div className="page-sub">Your roster · {bands.length} {bands.length === 1 ? 'band' : 'bands'}</div>
        </div>
        <Link href="/acts/new" className="btn btn-primary">+ New Band</Link>
      </div>

      {loading ? (
        <div className="grid-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 120 }} />)}
        </div>
      ) : bands.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>NO BANDS YET</div>
          <Link href="/acts/new" className="btn btn-primary">Create a Band Profile</Link>
        </div>
      ) : (
        <div className="grid-3">
          {bands.map(band => (
            <Link key={band.id} href={`/acts/${band.id}`} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s', position: 'relative', borderLeft: '3px solid var(--accent)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(224,120,32,0.15)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.borderLeftColor = 'var(--accent)'; e.currentTarget.style.boxShadow = 'none'; }}>

                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', letterSpacing: '0.04em', color: 'var(--text-primary)', lineHeight: 1.1 }}>
                    {band.act_name}
                  </div>
                </div>

                {band.genre && (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.85rem' }}>
                    {band.genre.replace(/[\s/]+$/, '')}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '1.25rem', fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '0.65rem', marginTop: band.genre ? 0 : '0.85rem' }}>
                  <span style={{ color: band.is_active ? '#10b981' : 'var(--text-muted)' }}>
                    {band.is_active ? '● Active' : '○ Inactive'}
                  </span>
                  {band.member_count > 0 && (
                    <span>{band.member_count} {band.member_count === 1 ? 'member' : 'members'}</span>
                  )}
                  {bookingCounts[band.id] > 0 && (
                    <span style={{ color: 'var(--accent)' }}>
                      {bookingCounts[band.id]} {bookingCounts[band.id] === 1 ? 'booking' : 'bookings'}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
