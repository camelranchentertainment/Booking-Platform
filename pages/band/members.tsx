import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';

type Personnel = {
  id: string;
  name: string;
  instrument_role: string | null;
  default_pay_amount: number | null;
  phone: string | null;
  email: string | null;
  linked_user_id: string | null;
  is_active: boolean;
};

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  created_at: string;
  personnel_id: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  band_admin: 'Admin',
  member:     'Member',
};

const ROLE_COLOR: Record<string, string> = {
  band_admin: 'var(--accent)',
  member:     'var(--text-muted)',
};

function Initials({ name, email }: { name?: string | null; email?: string | null }) {
  const src = name || email || '?';
  const letters = src.split(/[\s@]/)[0].slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: 36, height: 36, flexShrink: 0,
      background: 'rgba(224,120,32,0.12)',
      border: '1px solid rgba(224,120,32,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: 'var(--accent)',
      letterSpacing: '0.05em',
    }}>
      {letters}
    </div>
  );
}

const EMPTY_ADD = { name: '', instrument_role: '', default_pay_amount: '', phone: '', email: '' };

export default function BandMembers() {
  const [actId, setActId]     = useState<string | null>(null);
  const [actName, setActName] = useState('');

  // Roster
  const [roster, setRoster]               = useState<Personnel[]>([]);
  const [inactiveRoster, setInactiveRoster] = useState<Personnel[]>([]);
  const [withHistory, setWithHistory]     = useState<Set<string>>(new Set());
  const [showInactive, setShowInactive]   = useState(false);

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm]         = useState(EMPTY_ADD);
  const [addSaving, setAddSaving]     = useState(false);
  const [addError, setAddError]       = useState('');

  // Deactivate confirm
  const [deactivateId, setDeactivateId]       = useState<string | null>(null);
  const [deactivateSaving, setDeactivateSaving] = useState(false);

  // Roster invite
  const [invitingId, setInvitingId]   = useState<string | null>(null);
  const [invitedIds, setInvitedIds]   = useState<Set<string>>(new Set());

  // Band accounts + invite form (existing)
  const [members, setMembers]         = useState<any[]>([]);
  const [invites, setInvites]         = useState<PendingInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole]   = useState<'band_admin' | 'member'>('member');
  const [sending, setSending]         = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSent, setInviteSent]   = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) return;

    let foundActId: string | null = null;
    let ownerId: string | null = null;

    const { data: ownedActs } = await supabase
      .from('acts').select('id, act_name, owner_id')
      .eq('owner_id', user.id).eq('is_active', true).limit(1);
    if (ownedActs?.length) {
      foundActId = ownedActs[0].id;
      ownerId    = ownedActs[0].owner_id || null;
      setActName(ownedActs[0].act_name);
    } else {
      const { data: prof } = await supabase
        .from('profiles').select('act_id').eq('id', user.id).maybeSingle();
      if (prof?.act_id) {
        const { data: linkedAct } = await supabase
          .from('acts').select('id, act_name, owner_id').eq('id', prof.act_id).maybeSingle();
        if (linkedAct) {
          foundActId = linkedAct.id;
          ownerId    = (linkedAct as any).owner_id || null;
          setActName(linkedAct.act_name);
        }
      }
    }
    if (!foundActId) return;
    setActId(foundActId);

    const [activeRes, inactiveRes, membersRes, invitesRes] = await Promise.all([
      supabase.from('act_personnel')
        .select('id, name, instrument_role, default_pay_amount, phone, email, linked_user_id, is_active')
        .eq('act_id', foundActId).eq('is_active', true).order('name'),
      supabase.from('act_personnel')
        .select('id, name, instrument_role, default_pay_amount, phone, email, linked_user_id, is_active')
        .eq('act_id', foundActId).eq('is_active', false).order('name'),
      supabase.from('profiles')
        .select('id, display_name, email, role, created_at').eq('act_id', foundActId),
      supabase.from('act_invitations')
        .select('id, email, role, created_at, personnel_id').eq('act_id', foundActId).eq('status', 'pending'),
    ]);

    const activeList = (activeRes.data || []) as Personnel[];
    const inactiveList = (inactiveRes.data || []) as Personnel[];
    setRoster(activeList);
    setInactiveRoster(inactiveList);

    // Single query for expense history across all active roster ids
    if (activeList.length > 0) {
      const ids = activeList.map(r => r.id);
      const { data: expRows } = await supabase
        .from('expenses').select('personnel_id').in('personnel_id', ids);
      setWithHistory(new Set(
        (expRows || []).map(r => r.personnel_id).filter(Boolean) as string[]
      ));
    } else {
      setWithHistory(new Set());
    }

    const membersList: any[] = membersRes.data || [];
    const existingIds = new Set(membersList.map((m: any) => m.id));
    if (ownerId && !existingIds.has(ownerId)) {
      const { data: ownerProf } = await supabase
        .from('profiles').select('id, display_name, email, role, created_at')
        .eq('id', ownerId).maybeSingle();
      if (ownerProf) membersList.push(ownerProf as any);
    }
    setMembers(membersList);
    setInvites((invitesRes.data || []) as PendingInvite[]);
    setInvitedIds(new Set(
      ((invitesRes.data || []) as PendingInvite[])
        .map(i => i.personnel_id)
        .filter(Boolean) as string[]
    ));
  };

  // ── Add roster member ──────────────────────────────────────────────────────
  const handleAddSave = async () => {
    if (!addForm.name.trim() || !actId) return;
    setAddSaving(true);
    setAddError('');
    const { error } = await supabase.from('act_personnel').insert({
      act_id:            actId,
      name:              addForm.name.trim(),
      instrument_role:   addForm.instrument_role.trim() || null,
      default_pay_amount: addForm.default_pay_amount ? Number(addForm.default_pay_amount) : null,
      phone:             addForm.phone.trim() || null,
      email:             addForm.email.trim().toLowerCase() || null,
    });
    if (error) { setAddError(error.message); setAddSaving(false); return; }
    setAddForm(EMPTY_ADD);
    setShowAddForm(false);
    await load();
    setAddSaving(false);
  };

  // ── Deactivate / Reactivate ────────────────────────────────────────────────
  const handleDeactivate = async (id: string) => {
    setDeactivateSaving(true);
    const { error } = await supabase.from('act_personnel').update({ is_active: false }).eq('id', id);
    if (error) { console.error('Deactivate failed:', error.message); setDeactivateSaving(false); return; }
    setDeactivateId(null);
    setDeactivateSaving(false);
    await load();
  };

  const handleReactivate = async (id: string) => {
    const { error } = await supabase.from('act_personnel').update({ is_active: true }).eq('id', id);
    if (error) { console.error('Reactivate failed:', error.message); return; }
    await load();
  };

  // ── Invite from roster row ─────────────────────────────────────────────────
  const handleRosterInvite = async (person: Personnel) => {
    if (!person.email || !actId) return;
    setInvitingId(person.id);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/members/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ actId, email: person.email, role: 'member', personnel_id: person.id }),
    });
    if (res.ok) {
      setInvitedIds(prev => new Set([...prev, person.id]));
      await load();
    }
    setInvitingId(null);
  };

  // ── Send invite (existing flow) ────────────────────────────────────────────
  const adminCount = members.filter(m => m.role === 'band_admin').length +
    invites.filter(i => i.role === 'band_admin').length;
  const adminLimitReached = adminCount >= 2;

  const sendInvite = async () => {
    if (!inviteEmail.trim() || !actId) return;
    if (inviteRole === 'band_admin' && adminLimitReached) {
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
    <AppShell requireRole="band_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Band Members</h1>
          <div className="page-sub">{actName}{roster.length > 0 ? ` · ${roster.length} on roster` : ''}</div>
        </div>
      </div>

      {/* ── BAND ROSTER ──────────────────────────────────────────────────────── */}
      <div className="card mb-6" style={{ maxWidth: 640 }}>
        <div className="card-header">
          <span className="card-title">BAND ROSTER</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {roster.length} active
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {roster.map(person => (
            <div key={person.id} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.55rem 0.75rem',
              background: 'var(--bg-overlay)', border: '1px solid var(--border)',
              borderLeft: `3px solid ${person.linked_user_id ? 'var(--accent)' : 'var(--border)'}`,
            }}>
              <Initials name={person.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {person.name}
                </div>
                {person.instrument_role && (
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                    {person.instrument_role}
                  </div>
                )}
              </div>

              {/* linked / no account badge */}
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.63rem', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0,
                color: person.linked_user_id ? 'var(--accent)' : 'var(--text-muted)',
                background: person.linked_user_id ? 'rgba(200,146,26,0.1)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${person.linked_user_id ? 'rgba(200,146,26,0.3)' : 'rgba(255,255,255,0.1)'}`,
                padding: '0.15rem 0.45rem',
              }}>
                {person.linked_user_id ? 'linked' : 'no account'}
              </span>

              {/* invite button — only when no linked account and email is known */}
              {!person.linked_user_id && person.email && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '0.72rem', flexShrink: 0 }}
                  disabled={invitingId === person.id || invitedIds.has(person.id)}
                  onClick={() => handleRosterInvite(person)}
                >
                  {invitedIds.has(person.id) ? '✓ Invited' : invitingId === person.id ? 'Sending…' : 'Invite to log in'}
                </button>
              )}

              {/* deactivate with inline confirm */}
              {deactivateId === person.id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                    {withHistory.has(person.id) ? 'Has expense history — deactivate?' : 'Deactivate?'}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: '#f87171', fontSize: '0.72rem' }}
                    disabled={deactivateSaving}
                    onClick={() => handleDeactivate(person.id)}
                  >
                    {deactivateSaving ? '…' : 'Yes'}
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => setDeactivateId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--text-muted)', fontSize: '0.72rem', flexShrink: 0 }}
                  onClick={() => setDeactivateId(person.id)}
                >
                  Deactivate
                </button>
              )}
            </div>
          ))}

          {roster.length === 0 && (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
              No active roster members — add one below.
            </div>
          )}
        </div>

        {/* ── Inactive members toggle ─────────────────────────────────────── */}
        {inactiveRoster.length > 0 && (
          <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
              onClick={() => setShowInactive(v => !v)}
            >
              {showInactive ? '▲ Hide inactive' : `▼ Show inactive (${inactiveRoster.length})`}
            </button>
            {showInactive && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                {inactiveRoster.map(person => (
                  <div key={person.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.5rem 0.75rem', opacity: 0.6,
                    background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                  }}>
                    <Initials name={person.name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {person.name}
                      </div>
                      {person.instrument_role && (
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                          {person.instrument_role}
                        </div>
                      )}
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '0.72rem', flexShrink: 0 }}
                      onClick={() => handleReactivate(person.id)}
                    >
                      Reactivate
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Add band member form ────────────────────────────────────────── */}
        <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
          {!showAddForm ? (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.8rem' }} onClick={() => setShowAddForm(true)}>
              + Add Band Member
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <div className="field">
                  <label className="field-label">Name *</label>
                  <input
                    className="input"
                    value={addForm.name}
                    onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Full name"
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label className="field-label">Instrument / Role</label>
                  <input
                    className="input"
                    value={addForm.instrument_role}
                    onChange={e => setAddForm(f => ({ ...f, instrument_role: e.target.value }))}
                    placeholder="e.g. Drums"
                  />
                </div>
                <div className="field">
                  <label className="field-label">Default Pay</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.85rem', pointerEvents: 'none' }}>$</span>
                    <input
                      className="input"
                      style={{ paddingLeft: '1.5rem' }}
                      type="number" min="0" step="0.01"
                      value={addForm.default_pay_amount}
                      onChange={e => setAddForm(f => ({ ...f, default_pay_amount: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Phone</label>
                  <input
                    className="input"
                    value={addForm.phone}
                    onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label className="field-label">
                    Email
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.35rem' }}>(needed to invite them to log in)</span>
                  </label>
                  <input
                    className="input"
                    type="email"
                    value={addForm.email}
                    onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
              </div>
              {addError && <div style={{ color: '#f87171', fontSize: '0.83rem' }}>{addError}</div>}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-primary"
                  disabled={addSaving || !addForm.name.trim()}
                  onClick={handleAddSave}
                >
                  {addSaving ? 'Saving…' : 'Add Member'}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => { setShowAddForm(false); setAddForm(EMPTY_ADD); setAddError(''); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── BAND ACCOUNTS ────────────────────────────────────────────────────── */}
      <div className="card mb-6" style={{ maxWidth: 640 }}>
        <div className="card-header">
          <span className="card-title">BAND ACCOUNTS</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{members.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {members.map(m => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.55rem 0.75rem',
              background: 'var(--bg-overlay)', border: '1px solid var(--border)',
              borderLeft: `3px solid ${ROLE_COLOR[m.role] || 'var(--border)'}`,
            }}>
              <Initials name={m.display_name} email={m.email} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.display_name || m.email}
                </div>
                {m.display_name && (
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                    {m.email}
                  </div>
                )}
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

      {/* ── SEND INVITE ──────────────────────────────────────────────────────── */}
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
                type="email" className="input" placeholder="email@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendInvite()}
              />
            </div>
            <div className="field">
              <label className="field-label">Role</label>
              <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value as typeof inviteRole)}>
                <option value="member">Member</option>
                <option value="band_admin" disabled={adminLimitReached}>
                  Admin{adminLimitReached ? ' (limit)' : ''}
                </option>
              </select>
            </div>
          </div>
          {inviteRole === 'band_admin' && adminLimitReached && (
            <div style={{ color: '#f87171', fontSize: '0.82rem' }}>
              Maximum of 2 admins per band. Revoke a pending invite or remove a current admin first.
            </div>
          )}
          {inviteError && <div style={{ color: '#f87171', fontSize: '0.83rem' }}>{inviteError}</div>}
          {inviteSent && (
            <div style={{ color: '#34d399', fontSize: '0.83rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              ✓ Invite sent — they&apos;ll receive an email with a join link.
            </div>
          )}
          <div>
            <button
              className="btn btn-primary"
              onClick={sendInvite}
              disabled={sending || !inviteEmail.trim() || (inviteRole === 'band_admin' && adminLimitReached)}
            >
              {sending ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </div>
      </div>

      {/* ── PENDING INVITES ───────────────────────────────────────────────────── */}
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="card-header">
          <span className="card-title">PENDING INVITES</span>
          {invites.length > 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--accent)', background: 'rgba(224,120,32,0.1)', border: '1px solid rgba(224,120,32,0.25)', padding: '0.15rem 0.5rem' }}>
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
              <div key={inv.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.55rem 0.75rem',
                background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                borderLeft: `3px solid ${ROLE_COLOR[inv.role] || 'var(--border)'}`,
              }}>
                <Initials email={inv.email} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {inv.email}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: ROLE_COLOR[inv.role] || 'var(--text-muted)', marginTop: '0.1rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {ROLE_LABELS[inv.role] || inv.role} · Awaiting response
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: '#f87171', flexShrink: 0 }}
                  onClick={() => revokeInvite(inv.id)}
                >
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
