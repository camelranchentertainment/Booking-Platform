// pages/band/members.tsx
//
// Members — the band's roster (players and crew, with default pay) and the
// logins that go with it (band accounts, invites).
//
// Layout (Phase 3 redesign, Oct 2026 — matches the Tours page):
//   1. Illustrated hero (the band's rig at a desert motel) with a status line
//      and an "Add member" action.
//   2. Metric trackers: roster, who can log in, admin seats, invites waiting.
//   3. Left: roster cards. Right: invite someone, pending invites, accounts.
//
// Counting and labels live in lib/domain/members.ts (unit-tested). Writes are
// unchanged: act_personnel / act_invitations under the admin's own session
// (RLS is the boundary) and /api/members/invite for emails.

import { useState, useEffect, useId } from 'react';
import AppShell from '../../components/layout/AppShell';
import PageHero from '../../components/layout/PageHero';
import BandVanScene from '../../components/members/BandVanScene';
import { supabase } from '../../lib/supabase';
import {
  MAX_BAND_ADMINS, initialsOf, isInviteEmail, membersHeroLine, payLabel, sentAgo, summarizeMembers,
  type BandAccount, type PendingInvite, type RosterPerson as Personnel,
} from '../../lib/domain/members';
import css from '../../styles/members.module.css';

const ROLE_LABELS: Record<string, string> = {
  band_admin: 'Admin',
  superadmin: 'Superadmin',
  member:     'Member',
};

function Avatar({ name, email }: { name?: string | null; email?: string | null }) {
  return <span className={css.avatar} aria-hidden="true">{initialsOf(name, email)}</span>;
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
  const [members, setMembers]         = useState<BandAccount[]>([]);
  const [invites, setInvites]         = useState<PendingInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole]   = useState<'band_admin' | 'member'>('member');
  const [sending, setSending]         = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSent, setInviteSent]   = useState(false);

  const [loaded, setLoaded] = useState(false);
  const [rowError, setRowError] = useState('');

  useEffect(() => { load().finally(() => setLoaded(true)); }, []);

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

    const membersList: BandAccount[] = (membersRes.data || []) as BandAccount[];
    const existingIds = new Set(membersList.map(m => m.id));
    if (ownerId && !existingIds.has(ownerId)) {
      const { data: ownerProf } = await supabase
        .from('profiles').select('id, display_name, email, role, created_at')
        .eq('id', ownerId).maybeSingle();
      if (ownerProf) membersList.push(ownerProf as BandAccount);
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
    if (error) { console.error('Deactivate failed:', error.message); setRowError(`Couldn’t deactivate: ${error.message}`); setDeactivateSaving(false); return; }
    setDeactivateId(null);
    setDeactivateSaving(false);
    await load();
  };

  const handleReactivate = async (id: string) => {
    const { error } = await supabase.from('act_personnel').update({ is_active: true }).eq('id', id);
    if (error) { console.error('Reactivate failed:', error.message); setRowError(`Couldn’t reactivate: ${error.message}`); return; }
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
      setRowError('');
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setRowError(`Couldn’t invite ${person.name}: ${data.error || 'please try again.'}`);
    }
    setInvitingId(null);
  };

  // ── Send invite (existing flow) ────────────────────────────────────────────
  const summary = summarizeMembers(roster, members, invites);
  const adminCount = summary.admins;
  const adminLimitReached = adminCount >= MAX_BAND_ADMINS;

  const sendInvite = async () => {
    if (!inviteEmail.trim() || !actId) return;
    if (!isInviteEmail(inviteEmail)) { setInviteError('Enter a full email address, like name@example.com.'); return; }
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
    const { error } = await supabase.from('act_invitations').update({ status: 'revoked' }).eq('id', inviteId);
    if (error) { setRowError(`Couldn’t revoke the invite: ${error.message}`); return; }
    await load();
  };

  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;

  const personCard = (person: Personnel, inactive = false) => (
    <li
      key={person.id}
      className={`${css.person} ${person.linked_user_id ? css.personLinked : ''} ${inactive ? css.personInactive : ''}`}
    >
      <div className={css.personTop}>
        <Avatar name={person.name} />
        <div className={css.who}>
          <p className={css.name}>{person.name}</p>
          <p className={css.role}>{person.instrument_role || 'No role set'}</p>
        </div>
        <span className={`${css.badge} ${person.linked_user_id ? css.badgeOn : ''}`}>
          {person.linked_user_id ? 'Can log in' : invitedIds.has(person.id) ? 'Invited' : 'No login'}
        </span>
      </div>

      <div className={css.facts}>
        <span className={css.pay}>{payLabel(person.default_pay_amount)}</span>
        {person.phone && <a href={`tel:${person.phone.replace(/[^\d+]/g, '')}`}>{person.phone}</a>}
        {person.email && <a href={`mailto:${person.email}`}>{person.email}</a>}
      </div>

      <div className={css.actions}>
        {inactive ? (
          <button type="button" className={`btn btn-ghost ${css.btnSmall}`} onClick={() => handleReactivate(person.id)}>
            Reactivate
          </button>
        ) : (
          <>
            {!person.linked_user_id && person.email && (
              <button
                type="button"
                className={`btn btn-secondary ${css.btnSmall}`}
                disabled={invitingId === person.id || invitedIds.has(person.id)}
                onClick={() => handleRosterInvite(person)}
              >
                {invitedIds.has(person.id) ? '✓ Invited' : invitingId === person.id ? 'Sending…' : 'Invite to log in'}
              </button>
            )}
            {deactivateId === person.id ? (
              <span className={css.confirm} role="group" aria-label={`Deactivate ${person.name}?`}>
                {withHistory.has(person.id) ? 'Has pay history (kept). Deactivate?' : 'Deactivate?'}
                <button
                  type="button"
                  className={`btn btn-ghost ${css.btnSmall} ${css.danger}`}
                  disabled={deactivateSaving}
                  onClick={() => handleDeactivate(person.id)}
                >
                  {deactivateSaving ? 'Saving…' : 'Yes, deactivate'}
                </button>
                <button type="button" className={`btn btn-ghost ${css.btnSmall}`} onClick={() => setDeactivateId(null)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                className={`btn btn-ghost ${css.btnSmall}`}
                aria-label={`Deactivate ${person.name}`}
                onClick={() => setDeactivateId(person.id)}
              >
                Deactivate
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );

  return (
    <AppShell requireRole="band_admin">
      <PageHero
        title="Members"
        subtitle={actName || 'Your band'}
        summary={loaded ? membersHeroLine(summary) : undefined}
        scene={<BandVanScene />}
        actions={
          <button type="button" className="btn btn-primary tours-new-btn" onClick={() => setShowAddForm(true)}>
            + Add member
          </button>
        }
      />

      <div className="tours-body">
        <section className="tours-metrics" aria-label="Band at a glance">
          <div className="tour-metric">
            <span className="tour-metric-label">On the roster</span>
            <span className="tour-metric-value"><strong>{summary.roster}</strong><span>active</span></span>
            <span className="tour-metric-note">{inactiveRoster.length ? `${inactiveRoster.length} inactive` : 'Players and crew'}</span>
          </div>
          <div className="tour-metric">
            <span className="tour-metric-label">Can log in</span>
            <span className="tour-metric-value"><strong>{summary.withLogin}</strong><span>of {summary.roster}</span></span>
            <div className="tour-meter" aria-hidden="true">
              <div className="tour-meter-bar" style={{ width: `${summary.roster ? Math.round((summary.withLogin / summary.roster) * 100) : 0}%` }} />
            </div>
            <span className={`tour-metric-note ${summary.needInvite ? 'tour-metric-hot' : ''}`}>
              {summary.needInvite ? `${summary.needInvite} ready to invite` : 'Everyone with an email is set'}
            </span>
          </div>
          <div className="tour-metric">
            <span className="tour-metric-label">Admin seats</span>
            <span className="tour-metric-value"><strong className={adminLimitReached ? 'tour-metric-hot' : ''}>{adminCount}</strong><span>of {MAX_BAND_ADMINS}</span></span>
            <span className="tour-metric-note">{adminLimitReached ? 'Full — invite new people as members' : 'Admins can edit everything'}</span>
          </div>
          <div className="tour-metric">
            <span className="tour-metric-label">Invites waiting</span>
            <span className="tour-metric-value"><strong className={summary.pending ? 'tour-metric-hot' : ''}>{summary.pending}</strong></span>
            <span className="tour-metric-note">{summary.pending ? 'Not accepted yet' : 'Nothing outstanding'}</span>
          </div>
        </section>

        {rowError && <p className={css.error} role="alert">{rowError}</p>}

        {!loaded ? (
          <div className={`skeleton ${css.skeleton}`} aria-busy="true"><span className="sr-only" role="status">Loading members…</span></div>
        ) : (
          <div className={css.layout}>
            {/* ── Roster ─────────────────────────────────────────── */}
            <div className={css.column}>
              {showAddForm && (
                <section className={css.panel} aria-labelledby={fid('add-title')}>
                  <div className={css.panelHead}>
                    <h2 className={css.panelTitle} id={fid('add-title')}>Add a member</h2>
                  </div>
                  <form
                    className={css.form}
                    onSubmit={e => { e.preventDefault(); void handleAddSave(); }}
                  >
                    <div className={css.formGrid}>
                      <div className="field">
                        <label className="field-label" htmlFor={fid('name')}>Name *</label>
                        <input id={fid('name')} className="input" required autoFocus value={addForm.name}
                          onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
                      </div>
                      <div className="field">
                        <label className="field-label" htmlFor={fid('role')}>Instrument / role</label>
                        <input id={fid('role')} className="input" value={addForm.instrument_role}
                          onChange={e => setAddForm(f => ({ ...f, instrument_role: e.target.value }))} placeholder="e.g. Drums, Sound tech" />
                      </div>
                      <div className="field">
                        <label className="field-label" htmlFor={fid('pay')}>Default pay per show</label>
                        <div className={css.money}>
                          <span className={css.moneySign} aria-hidden="true">$</span>
                          <input id={fid('pay')} className={`input ${css.moneyInput}`} type="number" min="0" step="0.01" inputMode="decimal"
                            value={addForm.default_pay_amount}
                            onChange={e => setAddForm(f => ({ ...f, default_pay_amount: e.target.value }))} placeholder="0.00" />
                        </div>
                      </div>
                      <div className="field">
                        <label className="field-label" htmlFor={fid('phone')}>Phone</label>
                        <input id={fid('phone')} className="input" type="tel" value={addForm.phone}
                          onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="Optional" />
                      </div>
                      <div className={`field ${css.full}`}>
                        <label className="field-label" htmlFor={fid('email')}>Email (needed to invite them to log in)</label>
                        <input id={fid('email')} className="input" type="email" value={addForm.email}
                          onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="Optional" />
                      </div>
                    </div>
                    {addError && <p className={css.error} role="alert">{addError}</p>}
                    <div className={css.formActions}>
                      <button type="submit" className="btn btn-primary" disabled={addSaving || !addForm.name.trim()}>
                        {addSaving ? 'Saving…' : 'Add member'}
                      </button>
                      <button type="button" className="btn btn-ghost"
                        onClick={() => { setShowAddForm(false); setAddForm(EMPTY_ADD); setAddError(''); }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </section>
              )}

              <section className={css.panel} aria-labelledby={fid('roster-title')}>
                <div className={css.panelHead}>
                  <h2 className={css.panelTitle} id={fid('roster-title')}>Roster</h2>
                  <span className={css.panelMeta}>{roster.length} active</span>
                </div>
                {roster.length === 0 ? (
                  <div className={css.empty}>
                    <p className={css.emptyTitle}>Nobody on the roster</p>
                    <p className={css.emptyText}>Add your players and crew with their default pay. You can invite anyone with an email to log in and see their shows.</p>
                    {!showAddForm && (
                      <button type="button" className="btn btn-primary" onClick={() => setShowAddForm(true)}>+ Add member</button>
                    )}
                  </div>
                ) : (
                  <ul className={css.grid}>{roster.map(p => personCard(p))}</ul>
                )}

                {inactiveRoster.length > 0 && (
                  <>
                    <button type="button" className={css.toggle} aria-expanded={showInactive}
                      onClick={() => setShowInactive(v => !v)}>
                      {showInactive ? '▲ Hide inactive' : `▼ Show inactive (${inactiveRoster.length})`}
                    </button>
                    {showInactive && <ul className={css.grid}>{inactiveRoster.map(p => personCard(p, true))}</ul>}
                  </>
                )}
              </section>
            </div>

            {/* ── Logins ─────────────────────────────────────────── */}
            <div className={css.column}>
              <section className={css.panel} aria-labelledby={fid('invite-title')}>
                <div className={css.panelHead}>
                  <h2 className={css.panelTitle} id={fid('invite-title')}>Invite someone</h2>
                  <span className={`${css.panelMeta} ${adminLimitReached ? css.panelMetaWarn : ''}`}>{adminCount}/{MAX_BAND_ADMINS} admins</span>
                </div>
                <p className={css.note}>Members see their own shows, day sheets and pay. Admins can edit everything.</p>
                <form className={css.form} onSubmit={e => { e.preventDefault(); void sendInvite(); }}>
                  <div className={css.inviteRow}>
                    <div className="field">
                      <label className="field-label" htmlFor={fid('inv-email')}>Email address</label>
                      <input id={fid('inv-email')} type="email" className="input" placeholder="name@example.com"
                        value={inviteEmail} onChange={e => { setInviteEmail(e.target.value); setInviteSent(false); }} />
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor={fid('inv-role')}>Role</label>
                      <select id={fid('inv-role')} className="input" value={inviteRole}
                        onChange={e => setInviteRole(e.target.value as typeof inviteRole)}>
                        <option value="member">Member</option>
                        <option value="band_admin" disabled={adminLimitReached}>Admin{adminLimitReached ? ' (full)' : ''}</option>
                      </select>
                    </div>
                  </div>
                  {inviteError && <p className={css.error} role="alert">{inviteError}</p>}
                  {inviteSent && <p className={css.ok} role="status">✓ Invite sent — they’ll get an email with a join link.</p>}
                  <div className={css.formActions}>
                    <button type="submit" className="btn btn-primary"
                      disabled={sending || !inviteEmail.trim() || (inviteRole === 'band_admin' && adminLimitReached)}>
                      {sending ? 'Sending…' : 'Send invite'}
                    </button>
                  </div>
                </form>
              </section>

              <section className={css.panel} aria-labelledby={fid('pending-title')}>
                <div className={css.panelHead}>
                  <h2 className={css.panelTitle} id={fid('pending-title')}>Waiting to join</h2>
                  <span className={css.panelMeta}>{invites.length}</span>
                </div>
                {invites.length === 0 ? (
                  <p className={css.note}>No invites waiting.</p>
                ) : (
                  <ul className={css.list}>
                    {invites.map(inv => (
                      <li key={inv.id} className={css.row}>
                        <Avatar email={inv.email} />
                        <div className={css.rowText}>
                          <p className={css.rowMain}>{inv.email}</p>
                          <p className={css.rowSub}>{ROLE_LABELS[inv.role] || inv.role} · {sentAgo(inv.created_at)}</p>
                        </div>
                        <button type="button" className={`btn btn-ghost ${css.btnSmall} ${css.danger}`}
                          aria-label={`Revoke invite for ${inv.email}`} onClick={() => revokeInvite(inv.id)}>
                          Revoke
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={css.panel} aria-labelledby={fid('accounts-title')}>
                <div className={css.panelHead}>
                  <h2 className={css.panelTitle} id={fid('accounts-title')}>Logins</h2>
                  <span className={css.panelMeta}>{members.length}</span>
                </div>
                {members.length === 0 ? (
                  <p className={css.note}>Nobody has logged in yet. Send an invite to get started.</p>
                ) : (
                  <ul className={css.list}>
                    {members.map(m => (
                      <li key={m.id} className={css.row}>
                        <Avatar name={m.display_name} email={m.email} />
                        <div className={css.rowText}>
                          <p className={css.rowMain}>{m.display_name || m.email}</p>
                          {m.display_name && <p className={css.rowSub}>{m.email}</p>}
                        </div>
                        <span className={`${css.badge} ${m.role !== 'member' ? css.badgeOn : ''}`}>{ROLE_LABELS[m.role] || m.role}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
