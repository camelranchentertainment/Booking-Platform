import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';

export default function BandTours() {
  const [tours, setTours] = useState<any[]>([]);
  const [actId, setActId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: acts } = await supabase
      .from('acts').select('id, act_name').eq('owner_id', user.id).eq('is_active', true).limit(1);
    const act = acts?.[0];
    if (!act) { setLoading(false); return; }
    setActId(act.id);

    const { data } = await supabase
      .from('tours')
      .select('id, name, status, start_date, end_date, tour_venues(count)')
      .eq('act_id', act.id)
      .order('start_date', { ascending: false });

    setTours(data || []);
    setLoading(false);
  };

  const statusColor: Record<string, string> = {
    active: '#34d399', planning: '#60a5fa', completed: '#6b7280', cancelled: '#ef4444',
  };

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tours</h1>
          <div className="page-sub">{tours.length} tour{tours.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>Loading...</div>}

      {!loading && !actId && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>No band profile found.</div>
        </div>
      )}

      {!loading && actId && tours.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>No Tours Yet</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Your booking agent will add tours here when they are set up.</div>
        </div>
      )}

      {!loading && tours.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {tours.map((t: any) => (
            <div key={t.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--text-primary)', letterSpacing: '0.04em' }}>{t.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem', fontFamily: 'var(--font-body)' }}>
                  {t.start_date ? new Date(t.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}
                  {t.end_date ? ` – ${new Date(t.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{
                  fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: statusColor[t.status] || 'var(--text-muted)',
                  background: `${statusColor[t.status] || '#6b7280'}18`,
                  border: `1px solid ${statusColor[t.status] || '#6b7280'}40`,
                  padding: '0.2rem 0.6rem', borderRadius: '3px',
                }}>{t.status}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {t.tour_venues?.[0]?.count ?? 0} venue{(t.tour_venues?.[0]?.count ?? 0) !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
