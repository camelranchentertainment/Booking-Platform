import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { Act, ActInvitation, UserProfile, BOOKING_STATUS_LABELS, Booking } from '../../lib/types';
import Link from 'next/link';

export default function BandDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [act, setAct]         = useState<Act | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<ActInvitation[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tab, setTab]         = useState<'overview' | 'members' | 'invites'>('overview');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole]   = useState<'act_admin' | 'member'>('member');
  const [saving, setSaving]   = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [edit, setEdit]       = useState(false);
  const [form, setForm]       = useState<Partial<Act>>({});
  const [linkStatus, setLinkStatus] = useState<'owned' | 'active' | 'revoked' | null>(null);

  useEffect(() => {
    if (!id) return;
    loadAll();
  }, [id]);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const [actRes, membersRes, invitesRes, bookingsRes, linkRes] = await Promise.all([
      supabase.from('acts').select('*').eq('id', id).single(),
      supabase.from('user_profiles').select('*').eq('act_id', id),
      supabase.from('act_invitations').select('*').eq('act_id', id).eq('status', 'pending'),
      supabase.from('bookings').select(`
        id, status, show_date, fee,
        venue:venues(name, city, state)
      `).eq('act_id', id).order('show_date', { ascending: true }).limit(10),
      user ? supabase.from('agent_act_links').select('status').eq('act_id', id).eq('agent_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (actRes.data) {
      setAct(actRes.data);
      setForm(actRes.data);
      // Determine access level for this agent
      if (user && actRes.data.agent_id === user.id) setLinkStatus('owned');
      else if (linkRes.data?.status === 'active') setLinkStatus('active');
      else if (linkRes.data?.status === 'revoked') setLinkStatus('revoked');
      else setLinkStatus(null);
    }
    setMembers(membersRes.data || []);
    setInvites(invitesRes.data || []);
    setBookings((bookingsRes.data || []) as any);
  };

  const saveEdit = async () => {
    if (!act) return;
    setSaving(true);
    await supabase.from('acts').update({
      act_name: form.act_name,
      genre:    form.genre,
      bio:      form.bio,
      website:  form.website,
      instagram: form.instagram,
      spotify:  form.spotify,
    }).eq('id', act.id);
    await loadAll();
    setEdit(false);
    setSaving(false);
  };

  const sendInvite = async () => {
    if (!inviteEmail || !act) return;
    setSaving(true);
    setInviteError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ actId: act.id, email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) { setInviteError(data.error || 'Failed to send invite'); return; }
      setInviteEmail('');
      await loadAll();
    } catch {
      setInviteError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  };

  const revokeInvite = async (inviteId: string) => {
    await supabase.from('act_invitations').update({ status: 'revoked' }).eq('id', inviteId);
    await loadAll();
  };

  if (!act) return <AppShell requireRole="agent"><div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>Loading...</div></AppShell>;

  const isRevoked = linkStatus === 'revoked';

  return (
    <AppShell requireRole="agent">
      <Link href="/acts" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(200,146,26,0.7)', textDecoration: 'none', marginBottom: '0.75rem' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#C8921A')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,146,26,0.7)')}
      >← Back to Bands</Link>
      <div className="page-header">
        <div>
          <h1 className="page-title">{act.act_name}</h1>
          {act.genre && <div className="page-sub">{act.genre}</div>}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {!isRevoked && <button className="btn btn-secondary" onClick={() => { setEdit(true); }}>Edit</button>}
          {!isRevoked && <Link href={`/bookings?act=${act.id}`} className="btn btn-primary">+ Booking</Link>}
        </div>
      </div>

      {/* View-only banner for revoked agents */}
      {isRevoked && (
        <div style={{
          marginBottom: '1.25rem',
          padding: '0.75rem 1.1rem',
          background: 'rgba(248,113,113,0.07)',
          border: '1px solid rgba(248,113,113,0.25)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#f87171', letterSpacing: '0.08em' }}>
            ⊘ VIEW ONLY — This band has revoked your access. Booking history is visible but no changes can be made.
          </span>
          <Link href="/acts" className="btn btn-ghost btn-sm" style={{ fontSize: '0.74rem', flexShrink: 0 }}>
            ← Back to Roster
          </Link>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
        {(['overview', 'members', 'invites'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '0.6rem 1.25rem',
              fontFamily: 'var(--font-body)', fontSize: '0.82rem', letterSpacing: '0.1em', textTransform: 'uppercase',
              border: 'none', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none', color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer', marginBottom: '-1px',
            }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header"><span className="card-title">DETAILS</span></div>
            {edit ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(['act_name', 'genre', 'website', 'instagram', 'spotify'] as const).map(k => (
                  <div key={k} className="field">
                    <label className="field-label">{k.replace('_', ' ')}</label>
                    <input className="input" value={(form[k] as string) || ''} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
                  </div>
                ))}
                <div className="field">
                  <label className="field-label">Bio</label>
                  <textarea className="textarea" value={form.bio || ''} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} rows={4} />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="btn btn-secondary" onClick={() => setEdit(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>Save</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.88rem' }}>
                {act.bio && <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{act.bio}</p>}
                {act.website  && <a href={act.website}  target="_blank" style={{ color: 'var(--accent)' }}>🌐 {act.website}</a>}
                {act.instagram && <span style={{ color: 'var(--text-secondary)' }}>📷 {act.instagram}</span>}
                {act.spotify  && <a href={act.spotify}  target="_blank" style={{ color: 'var(--accent)' }}>🎵 Spotify</a>}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">RECENT BOOKINGS</span>
              <Link href={`/bookings?act=${act.id}`} className="btn btn-ghost btn-sm">View All</Link>
            </div>
            {bookings.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem', padding: '1rem 0' }}>No bookings yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {bookings.map((b: any) => (
                  <Link key={b.id} href={`/bookings/${b.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.6rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', textDecoration: 'none' }}>
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 500 }}>{b.venue?.name || 'TBD'}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>
                        {b.show_date ? new Date(b.show_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </div>
                    </div>
                    <span className={`badge badge-${b.status}`}>{BOOKING_STATUS_LABELS[b.status as keyof typeof BOOKING_STATUS_LABELS]}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'members' && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="card-header"><span className="card-title">MEMBERS ({members.length})</span></div>
          {members.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem', padding: '1rem 0' }}>No members yet. Use the Invites tab to add members.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {members.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)' }}>
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.9rem' }}>{m.display_name || m.email}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>{m.email}</div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: m.role === 'act_admin' ? 'var(--accent)' : 'var(--text-muted)' }}>{m.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'invites' && (
        <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card">
            <div className="card-header"><span className="card-title">INVITE MEMBER</span></div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1 }}>
                <label className="field-label">Email</label>
                <input className="input" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="member@email.com" />
              </div>
              <div className="field">
                <label className="field-label">Role</label>
                <select className="select" value={inviteRole} onChange={e => setInviteRole(e.target.value as any)}>
                  <option value="member">Member</option>
                  <option value="act_admin">Band Admin</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-primary" onClick={sendInvite} disabled={!inviteEmail || saving}>Send Invite</button>
              </div>
            </div>
            {inviteError && <div style={{ marginTop: '0.5rem', color: '#f87171', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>{inviteError}</div>}
          </div>

          {invites.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="card-title">PENDING INVITES</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {invites.map(inv => (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)' }}>
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontSize: '0.88rem' }}>{inv.email}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>
                        {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => revokeInvite(inv.id)} style={{ color: '#ef4444' }}>Revoke</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
