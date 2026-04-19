import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';

export default function EmailPage() {
  const [log, setLog]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('email_log')
        .select('*, booking:bookings(id), venue:venues(name)')
        .eq('agent_id', user.id)
        .order('sent_at', { ascending: false })
        .limit(50);
      setLog(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const STATUS_COLOR: Record<string, string> = {
    sent: '#fbbf24', delivered: '#34d399', bounced: '#f87171', failed: '#f87171',
  };

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">Email</h1>
          <div className="page-sub">Outreach log · {log.length} sent</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Recipient</th><th>Subject</th><th>Template</th><th>Status</th><th>Sent</th></tr>
            </thead>
            <tbody>
              {log.map(e => (
                <tr key={e.id}>
                  <td style={{ color: 'var(--accent)', fontSize: '0.82rem' }}>{e.recipient || '—'}</td>
                  <td style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{e.subject || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{e.template_id || '—'}</td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: STATUS_COLOR[e.status] || 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {e.status}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {new Date(e.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {log.length === 0 && !loading && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>No emails sent yet.</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
