import AppShell from '../../components/layout/AppShell';

export default function BandEmail() {
  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Email</h1>
          <div className="page-sub">Outreach &amp; communications</div>
        </div>
      </div>
      <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--accent)', marginBottom: '0.75rem', letterSpacing: '0.06em' }}>
          Coming Soon
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: 400, margin: '0 auto' }}>
          Email outreach tools for your band will appear here — pitch templates, venue follow-ups, and booking correspondence.
        </div>
      </div>
    </AppShell>
  );
}
