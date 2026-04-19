import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { Act } from '../../lib/types';
import Link from 'next/link';

export default function ActsPage() {
  const [acts, setActs] = useState<Act[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActs();
  }, []);

  const loadActs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('acts').select('*').eq('agent_id', user.id).order('act_name');
    setActs(data || []);
    setLoading(false);
  };

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">Acts</h1>
          <div className="page-sub">Manage your roster</div>
        </div>
        <Link href="/acts/new" className="btn btn-primary">+ New Act</Link>
      </div>

      {acts.length === 0 && !loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>NO ACTS YET</div>
          <Link href="/acts/new" className="btn btn-primary">Create Your First Act</Link>
        </div>
      ) : (
        <div className="grid-3">
          {acts.map(act => (
            <Link key={act.id} href={`/acts/${act.id}`} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', letterSpacing: '0.04em', color: 'var(--text-primary)' }}>{act.act_name}</div>
                    {act.genre && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '0.2rem' }}>{act.genre}</div>}
                  </div>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: act.is_active ? '#10b981' : '#6b7280', marginTop: '0.35rem', flexShrink: 0 }} />
                </div>
                {act.bio && (
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{act.bio}</p>
                )}
                <div style={{ display: 'flex', gap: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  {act.member_count > 0 && <span>{act.member_count} member{act.member_count !== 1 ? 's' : ''}</span>}
                  {act.gcal_calendar_id && <span style={{ color: 'var(--accent)' }}>◷ Cal synced</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
