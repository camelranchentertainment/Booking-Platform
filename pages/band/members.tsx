import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { UserProfile } from '../../lib/types';

export default function BandMembers() {
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [actName, setActName] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('user_profiles').select('act_id').eq('id', user.id).maybeSingle();
      if (!profile?.act_id) return;
      const { data: act } = await supabase.from('acts').select('act_name').eq('id', profile.act_id).maybeSingle();
      if (act) setActName(act.act_name);
      const { data: members } = await supabase.from('user_profiles').select('*').eq('act_id', profile.act_id);
      setMembers(members || []);
    };
    load();
  }, []);

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Members</h1>
          <div className="page-sub">{actName}</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {members.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)' }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{m.display_name || m.email}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{m.email}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: m.role === 'act_admin' ? 'var(--accent)' : 'var(--text-muted)' }}>
                {m.role === 'act_admin' ? 'Admin' : 'Member'}
              </span>
            </div>
          ))}
          {members.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>No members found.</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
