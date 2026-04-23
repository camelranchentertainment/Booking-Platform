import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { UserProfile } from '../../lib/types';

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  invited_at: string;
}

export default function BandMembers() {
  const [actId, setActId]       = useState<string | null>(null);
  const [actName, setActName]   = useState('');
  const [members, setMembers]   = useState<UserProfile[]>([]);
  const [invites, setInvites]   = useState<PendingInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole]   = useState<'act_admin' | 'member'>('member');
  const [sending, setSending]   = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSent, setInviteSent]   = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Find act — direct ownership first, then profile linkage
    let foundActId: string | null = null;
    const { data: ownedActs } = await supabase.from('acts').select('id, act_name').eq('owner_id', user.id).eq('is_active', true).limit(1);
    if (ownedActs?.length) {
      foundActId = ownedActs[0].id;
      setActName(ownedActs[0].act_name);
    } else {
      const { data: prof } = await supabase.from('user_profiles').select('act_id').eq('id', user.id).maybeSingle();
      if (prof?.act_id) {
        const { data: linkedAct } = await supabase.from('acts').select('id, act_name').eq('id', prof.act_id).maybeSingle();
        if (linkedAct) { foundActId = linkedAct.id; setActName(linkedAct.act_name); }
      }
    }
    if (!foundActId) return;
    setActId(foundActId);

    const [membersRes, invitesRes] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('act_id', foundActId),
      supabase.from('act_invitations').select('id, email, role, invited_at').eq('act_id', foundActId).eq('status', 'pending'),
    ]);
    setMembers(membersRes.data || []);
    setInvites((invitesRes.data || []) as PendingInvite[]);
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim() || !actId) return;
    setSending(true);
    setInviteError('');
    setInviteSent(false);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/members/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ actId, email: inviteEmail.trim(), role: inviteRole }),
    });
    const data = await res.json();
    if (!res.ok) { setInviteError(data.error || 'Failed to send invite'); setSending(false); return; }
    setInviteEmail('');
    setInviteSent(true);
    await load();
    setSending(false);
  };

  const revokeInvite = async (inviteId: string) => {
    await supabase.from('act_invitations').update({ status: 'revoked' }).eq('id', inviteId);
    await load();
  };

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Band Members</h1>
          <div className="page-sub">{actName}</div>
        </div>
      </div>

      {/* Current members */}
      <div className="card mb-6" style={{ maxWidth: 600 }}>
        <div className="card-header"><span className="card-title">CURRENT MEMBERS</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {members.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)' }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.9rem' }}>{m.display_name || m.email}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{m.email}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: m.role === 'act_admin' ? 'var(--accent)' : 'var(--text-muted)' }}>
                {m.role === 'act_admin' ? 'Admin' : 'Member'}
              </span>
            </div>
          ))}
          {members.length === 0 && (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>No members yet.</div>
          )}
        </div>
      </div>

      {/* Invite a member */}
      <div className="card mb-6" style={{ maxWidth: 600 }}>
        <div className="card-header"><span className="card-title">INVITE A MEMBER</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Email address</label>
              <input
                type="email"
                className="input"
                placeholder="bandmate@email.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendInvite()}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Role</label>
              <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value as 'act_admin' | 'member')}>
                <option value="member">Member</option>
                <option value="act_admin">Admin</option>
              </select>
            </div>
          </div>
          {inviteError && <div style={{ color: '#f87171', fontSize: '0.83rem' }}>{inviteError}</div>}
          {inviteSent && <div style={{ color: '#34d399', fontSize: '0.83rem' }}>Invite sent — they'll see it when they log in.</div>}
          <div>
            <button className="btn btn-primary" onClick={sendInvite} disabled={sending || !inviteEmail.trim()} style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#000' }}>
              {sending ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </div>
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="card-header"><span className="card-title">PENDING INVITES ({invites.length})</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {invites.map(inv => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{inv.email}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.1rem', textTransform: 'uppercase' }}>{inv.role}</div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: '#f87171', fontSize: '0.78rem' }}
                  onClick={() => revokeInvite(inv.id)}>
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
