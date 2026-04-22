import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';

export default function BandsPage() {
  const [bands, setBands]       = useState<any[]>([]);
  const [links, setLinks]       = useState<any[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [allBands, setAllBands] = useState<any[]>([]);  // for linking existing bands
  const [linkActId, setLinkActId]   = useState('');
  const [linkMessage, setLinkMessage] = useState('');
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError]   = useState('');
  const [loading, setLoading]   = useState(true);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [myBandsRes, linkedRes, allBandsRes] = await Promise.all([
      // Bands where this user is agent
      supabase.from('acts').select('*').eq('agent_id', user.id).order('act_name'),
      // Active agent_act_links for this agent
      supabase.from('agent_act_links')
        .select('id, status, permissions, act:acts(id, act_name, genre, is_active, owner_id)')
        .eq('agent_id', user.id)
        .in('status', ['active', 'pending']),
      // Bands available to link (have owner, no agent yet)
      supabase.from('acts').select('id, act_name').is('agent_id', null).not('owner_id', 'is', null).order('act_name'),
    ]);

    setBands(myBandsRes.data || []);
    setLinks(linkedRes.data || []);
    setAllBands(allBandsRes.data || []);
    setLoading(false);
  };

  const sendLinkRequest = async () => {
    if (!linkActId) return;
    setLinkSaving(true);
    setLinkError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/agent-link/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ actId: linkActId, message: linkMessage || undefined }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setLinkError(d.error || 'Failed to send link request');
        return;
      }
      setShowLinkModal(false);
      setLinkActId('');
      setLinkMessage('');
      await loadAll();
    } catch {
      setLinkError('Network error — please try again');
    } finally {
      setLinkSaving(false);
    }
  };

  // Merge: bands I manage directly + bands linked to me
  const linkedBands = links
    .filter(l => l.status === 'active')
    .map(l => ({ ...(l.act as any), _linked: true }));
  const pendingLinks = links.filter(l => l.status === 'pending');

  const allMyBands = [
    ...bands.map(b => ({ ...b, _owned: true })),
    ...linkedBands.filter(lb => !bands.find(b => b.id === lb.id)),
  ];

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bands</h1>
          <div className="page-sub">Your roster · {allMyBands.length} bands</div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={() => setShowLinkModal(true)}>Link Existing Band</button>
          <Link href="/acts/new" className="btn btn-primary">+ New Band</Link>
        </div>
      </div>

      {/* Pending link requests */}
      {pendingLinks.length > 0 && (
        <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {pendingLinks.map((l: any) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--accent)' }}>
                ⟳ Pending: {(l.act as any)?.act_name} — waiting for band to accept your link request
              </div>
            </div>
          ))}
        </div>
      )}

      {allMyBands.length === 0 && !loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>NO BANDS YET</div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/acts/new" className="btn btn-primary">Create a Band Profile</Link>
            <button className="btn btn-secondary" onClick={() => setShowLinkModal(true)}>Link an Existing Band</button>
          </div>
        </div>
      ) : (
        <div className="grid-3">
          {allMyBands.map(band => (
            <Link key={band.id} href={`/acts/${band.id}`} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ cursor: 'pointer', transition: 'border-color 0.15s', position: 'relative' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                {band._linked && (
                  <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', fontFamily: 'var(--font-body)', fontSize: '0.76rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.4)', borderRadius: 'var(--radius-sm)', padding: '0.15rem 0.4rem' }}>
                    Linked
                  </div>
                )}
                <div style={{ marginBottom: '0.75rem', paddingRight: band._linked ? '4rem' : '0' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', letterSpacing: '0.04em', color: 'var(--text-primary)' }}>{band.act_name}</div>
                  {band.genre && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '0.2rem' }}>{band.genre}</div>}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {band.member_count > 0 && <span>{band.member_count} member{band.member_count !== 1 ? 's' : ''}</span>}
                  <span style={{ color: band.is_active ? '#10b981' : 'var(--text-muted)' }}>
                    {band.is_active ? '● Active' : '○ Inactive'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Link Existing Band Modal */}
      {showLinkModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Link Existing Band</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowLinkModal(false)}>✕</button>
            </div>
            <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Send a link request to a band that&apos;s already registered. They&apos;ll get a notification and choose to accept or decline.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="field">
                <label className="field-label">Select Band</label>
                <select className="select" value={linkActId} onChange={e => setLinkActId(e.target.value)}>
                  <option value="">Choose a band...</option>
                  {allBands.map(b => <option key={b.id} value={b.id}>{b.act_name}</option>)}
                </select>
                {allBands.length === 0 && (
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    No unlinked bands found. Bands must register first.
                  </span>
                )}
              </div>
              <div className="field">
                <label className="field-label">Message (optional)</label>
                <textarea className="textarea" value={linkMessage} onChange={e => setLinkMessage(e.target.value)} placeholder="Introduce yourself — why you want to work together..." rows={3} />
              </div>
              {linkError && (
                <div style={{ color: '#f87171', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>{linkError}</div>
              )}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => { setShowLinkModal(false); setLinkError(''); }}>Cancel</button>
                <button className="btn btn-primary" onClick={sendLinkRequest} disabled={!linkActId || linkSaving}>
                  {linkSaving ? 'Sending...' : 'Send Link Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
