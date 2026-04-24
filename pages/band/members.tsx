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

const ROLE_LABELS: Record<string, string> = {
  act_admin: 'Admin',
  member:    'Member',
  agent:     'Booking Agent',
};

const ROLE_COLOR: Record<string, string> = {
  act_admin: 'var(--accent)',
  agent:     '#a78bfa',
  member:    'var(--text-muted)',
};

function Initials({ name, email }: { name?: string | null; email?: string | null }) {
  const src = name || email || '?';
  const letters = src.split(/[\s@]/)[0].slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: 36, height: 36, flexShrink: 0,
      background: 'rgba(200,146,26,0.12)',
      border: '1px solid rgba(200,146,26,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: 'var(--accent)',
      letterSpacing: '0.05em',
    }}>
      {letters}
    </div>
  );
}

export default function BandMembers() {
  const [actId, setActId]       = useState<string | null>(null);
  const [actName, setActName]   = useState('');
  const [members, setMembers]   = useState<UserProfile[]>([]);
  const [invites, setInvites]   = useState<PendingInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole]   = useState<'act_admin' | 'member' | 'agent'>('member');
  const [sending, setSending]   = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSent, setInviteSent]   = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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

  const adminCount =
    members.filter(m => m.role === 'act_admin').length +
    invites.filter(i => i.role === 'act_admin').length;
  const adminLimitReached = adminCount >= 2;

  const sendInvite = async () => {
    if (!inviteEmail.trim() || !actId) return;
    if (inviteRole === 'act_admin' && adminLimitReached) {
      setInviteError('Maximum of 2 admins allowed per band.');
      return;
    }
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
          <div className="page-sub">{actName}{members.length > 0 ? ` · ${members.length} member${members.length !== 1 ? 's' : ''}` : ''}</div>
        </div>
      </div>

      {/* Current members */}
      <div className="card mb-6" style={{ maxWidth: 640 }}>
        <div className="card-header">
          <span className="card-title">CURRENT MEMBERS</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{members.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {members.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 0.75rem', background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderLeft: `3px solid ${ROLE_COLOR[m.role] || 'var(--border)'}`, transition: 'border-color 0.15s' }}>
              <Initials name={m.display_name} email={m.email} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.display_name || m.email}</div>
                {m.display_name && <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{m.email}</div>}
              </div>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.66rem', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                color: ROLE_COLOR[m.role] || 'var(--text-muted)',
                background: `${ROLE_COLOR[m.role] || 'var(--border)'}18`,
                border: `1px solid ${ROLE_COLOR[m.role] || 'var(--border)'}40`,
                padding: '0.18rem 0.55rem', flexShrink: 0,
              }}>
                {ROLE_LABELS[m.role] || m.role}
              </span>
            </div>
          ))}
          {members.length === 0 && (
            <div style={{ textAlign: 'center', padding: '1.75rem', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
              No members yet. Send an invite below to get started.
            </div>
          )}
        </div>
      </div>

      {/* Send invite */}
      <div className="card mb-6" style={{ maxWidth: 640 }}>
        <div className="card-header">
          <span className="card-title">SEND INVITE</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: adminLimitReached ? '#f87171' : 'var(--text-muted)', letterSpacing: '0.08em' }}>
            {adminCount}/2 admins
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '0.75rem' }}>
            <div className="field">
              <label className="field-label">Email address</label>
              <input
                type="email"
                className="input"
                placeholder="email@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendInvite()}
              />
            </div>
            <div className="field">
              <label className="field-label">Role</label>
              <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value as typeof inviteRole)}>
                <option value="member">Member</option>
                <option value="act_admin" disabled={adminLimitReached}>
                  Admin{adminLimitReached ? ' (limit)' : ''}
                </option>
                <option value="agent">Booking Agent</option>
              </select>
            </div>
          </div>

          {inviteRole === 'agent' && (
            <div style={{ background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.25)', padding: '0.65rem 0.9rem', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              ♟ Inviting as Booking Agent gives them full access to manage bookings and tours for {actName || 'your band'}.
            </div>
          )}
          {inviteRole === 'act_admin' && adminLimitReached && (
            <div style={{ color: '#f87171', fontSize: '0.82rem' }}>
              Maximum of 2 admins per band. Revoke a pending invite or remove a current admin first.
            </div>
          )}

          {inviteError && <div style={{ color: '#f87171', fontSize: '0.83rem' }}>{inviteError}</div>}
          {inviteSent && (
            <div style={{ color: '#34d399', fontSize: '0.83rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              ✓ Invite sent — they'll receive an email with a join link.
            </div>
          )}

          <div>
            <button
              className="btn btn-primary"
              onClick={sendInvite}
              disabled={sending || !inviteEmail.trim() || (inviteRole === 'act_admin' && adminLimitReached)}
            >
              {sending ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </div>
      </div>

      {/* Pending invites — always visible */}
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="card-header">
          <span className="card-title">PENDING INVITES</span>
          {invites.length > 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--accent)', background: 'rgba(200,146,26,0.1)', border: '1px solid rgba(200,146,26,0.25)', padding: '0.15rem 0.5rem' }}>
              {invites.length}
            </span>
          )}
        </div>
        {invites.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
            No pending invites.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {invites.map(inv => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 0.75rem', background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderLeft: `3px solid ${ROLE_COLOR[inv.role] || 'var(--border)'}` }}>
                <Initials email={inv.email} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.email}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: ROLE_COLOR[inv.role] || 'var(--text-muted)', marginTop: '0.1rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {ROLE_LABELS[inv.role] || inv.role} · Awaiting response
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: '#f87171', flexShrink: 0 }}
                  onClick={() => revokeInvite(inv.id)}>
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
