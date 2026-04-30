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
  const [rerequesting, setRerequesting] = useState('');
  const [loading, setLoading]       = useState(true);
  const [bookingCounts, setBookingCounts] = useState<Record<string, number>>({});

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [myBandsRes, linkedRes, allBandsRes] = await Promise.all([
      // Bands where this user is owner
      supabase.from('acts').select('*').eq('owner_id', user.id).order('act_name'),
      // All agent_act_links for this agent (active, pending, revoked)
      supabase.from('agent_act_links')
        .select('id, status, permissions, act:acts(id, act_name, genre, is_active, owner_id)')
        .eq('agent_id', user.id)
        .in('status', ['active', 'pending', 'revoked']),
      // Bands available to link (have owner, no agent yet)
      supabase.from('acts').select('id, act_name').is('agent_id', null).not('owner_id', 'is', null).order('act_name'),
    ]);

    const myBands   = myBandsRes.data  || [];
    const myLinks   = linkedRes.data   || [];
    const available = allBandsRes.data || [];

    setBands(myBands);
    setLinks(myLinks);
    setAllBands(available);

    // Fetch active booking counts for all managed acts
    const allIds = [
      ...myBands.map((b: any) => b.id),
      ...myLinks.filter((l: any) => l.status === 'active').map((l: any) => l.act?.id).filter(Boolean),
    ];
    if (allIds.length > 0) {
      const { data: counts } = await supabase
        .from('bookings')
        .select('act_id')
        .in('act_id', allIds)
        .in('status', ['pitch', 'followup', 'negotiation', 'hold', 'contract', 'confirmed', 'advancing']);
      const map: Record<string, number> = {};
      for (const row of counts || []) map[row.act_id] = (map[row.act_id] || 0) + 1;
      setBookingCounts(map);
    }

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

  const sendReRequest = async (actId: string) => {
    setRerequesting(actId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/agent-link/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ actId }),
      });
      await loadAll();
    } finally {
      setRerequesting('');
    }
  };

  // Merge: bands I manage directly + bands linked to me
  const linkedBands = links
    .filter(l => l.status === 'active')
    .map(l => ({ ...(l.act as any), _linked: true }));
  const pendingLinks  = links.filter(l => l.status === 'pending');
  const revokedLinks  = links.filter(l => l.status === 'revoked');

  const allMyBands = [
    ...bands.map(b => ({ ...b, _owned: true })),
    ...linkedBands.filter(lb => !bands.find(b => b.id === lb.id)),
  ];

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bands</h1>
          <div className="page-sub">Your roster · {allMyBands.length} {allMyBands.length === 1 ? 'band' : 'bands'}</div>
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

      {/* Revoked access bands */}
      {revokedLinks.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Access Revoked
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {revokedLinks.map((l: any) => (
              <div key={l.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                padding: '0.75rem 1rem',
                background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', opacity: 0.65,
              }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {(l.act as any)?.act_name}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#f87171', border: '1px solid rgba(248,113,113,0.35)', padding: '0.1rem 0.4rem' }}>
                      Access Revoked
                    </span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    View-only · Booking history still accessible
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <Link href={`/acts/${(l.act as any)?.id}`} className="btn btn-ghost btn-sm" style={{ fontSize: '0.76rem' }}>
                    View History
                  </Link>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={rerequesting === (l.act as any)?.id}
                    onClick={() => sendReRequest((l.act as any)?.id)}
                    style={{ fontSize: '0.76rem' }}
                  >
                    {rerequesting === (l.act as any)?.id ? 'Sending…' : 'Re-request Access'}
                  </button>
                </div>
              </div>
            ))}
          </div>
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
              <div className="card" style={{ cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s', position: 'relative', borderLeft: '3px solid var(--accent)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(200,146,26,0.15)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.borderLeftColor = 'var(--accent)'; e.currentTarget.style.boxShadow = 'none'; }}>

                {/* Top row: name + linked badge */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', letterSpacing: '0.04em', color: 'var(--text-primary)', lineHeight: 1.1 }}>
                    {band.act_name}
                  </div>
                  {band._linked && (
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.35)', padding: '0.1rem 0.4rem', flexShrink: 0, marginLeft: '0.5rem' }}>
                      Linked
                    </span>
                  )}
                </div>

                {/* Genre */}
                {band.genre && (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.85rem' }}>
                    {band.genre.replace(/[\s/]+$/, '')}
                  </div>
                )}

                {/* Stats row */}
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
