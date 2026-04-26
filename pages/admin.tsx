import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import Link from 'next/link';

const GOLD  = '#C8921A';
const ROLE_COLOR: Record<string, string> = {
  superadmin: '#C8921A',
  agent:      '#60a5fa',
  act_admin:  '#a78bfa',
  member:     '#94a3b8',
};
const TIER_PRICE: Record<string, number> = {
  agent_t1:   49,
  agent_t2:   99,
  band_admin: 19,
};

type AdminUser = {
  id: string;
  role: string;
  display_name: string | null;
  email: string | null;
  agency_name: string | null;
  act_id: string | null;
  subscription_status: string | null;
  subscription_tier: string | null;
  trial_ends_at: string | null;
  created_at: string;
  admin_notes: string | null;
  // enriched
  actName: string | null;
  resolvedActId: string | null;
  agentName: string | null;
  bandsUsed: number;
};

type Act = { id: string; act_name: string; owner_id: string | null; agent_id: string | null };
type AgentProfile = { id: string; display_name: string | null; email: string | null; agency_name: string | null };
type Booking30d = {
  id: string; show_date: string; deal_type: string | null; agreed_amount: number | null; fee: number | null;
  actName: string; bandAdminName: string; bandAdminEmail: string; venueName: string; venueCity: string;
  agentName: string;
};

function dot(ok: boolean) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: ok ? '#34d399' : '#f87171', flexShrink: 0,
      boxShadow: ok ? '0 0 6px #34d399' : '0 0 6px #f87171',
    }} />
  );
}

function ModalWrap({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD, marginBottom: '0.75rem' }}>
      {children}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading]       = useState(true);

  // Data
  const [users, setUsers]         = useState<AdminUser[]>([]);
  const [acts, setActs]           = useState<Act[]>([]);
  const [agents, setAgents]       = useState<AgentProfile[]>([]);
  const [bookings30d, setBookings30d] = useState<Booking30d[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, number>>({});
  const [sysStatus, setSysStatus] = useState<Record<string, any> | null>(null);

  // Filters
  const [activeFilter, setActiveFilter] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');

  // Action state
  const [fixRoleTarget, setFixRoleTarget]   = useState<AdminUser | null>(null);
  const [fixRoleValue, setFixRoleValue]     = useState('');
  const [fixBandTarget, setFixBandTarget]   = useState<AdminUser | null>(null);
  const [fixBandActId, setFixBandActId]     = useState('');
  const [fixAgentTarget, setFixAgentTarget] = useState<AdminUser | null>(null);
  const [fixAgentId, setFixAgentId]         = useState('');
  const [deleteTarget, setDeleteTarget]     = useState<AdminUser | null>(null);
  const [cancelTarget, setCancelTarget]     = useState<AdminUser | null>(null);
  const [refundTarget, setRefundTarget]     = useState<AdminUser | null>(null);
  const [refundNote, setRefundNote]         = useState('');
  const [upgradeTarget, setUpgradeTarget]   = useState<AdminUser | null>(null);
  const [upgradeTier, setUpgradeTier]       = useState('');
  const [resetResult, setResetResult]       = useState<string | null>(null);
  const [saving, setSaving]                 = useState('');

  useEffect(() => { init(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    const { data: prof } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
    if (prof?.role !== 'superadmin') { router.replace('/dashboard'); return; }
    setAuthorized(true);
    await loadData();
    await loadSysStatus();
    setLoading(false);
  };

  const callAdmin = useCallback(async (path: string, body?: Record<string, unknown>, method = 'POST') => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  }, []);

  const loadData = async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [profilesRes, actsRes, bookingsRes] = await Promise.all([
      supabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('acts').select('id, act_name, owner_id, agent_id').eq('is_active', true),
      supabase.from('bookings').select(`
        id, show_date, deal_type, agreed_amount, fee,
        act:acts(act_name, owner_id),
        venue:venues(name, city, state),
        created_by
      `).eq('status', 'confirmed').gte('created_at', thirtyDaysAgo).order('show_date', { ascending: true }),
    ]);

    const rawUsers  = (profilesRes.data || []) as any[];
    const rawActs   = (actsRes.data || []) as Act[];
    const rawBk     = (bookingsRes.data || []) as any[];

    setActs(rawActs);

    // Build lookup maps
    const actByOwnerId: Record<string, Act>    = {};
    const actByActId:   Record<string, Act>    = {};
    const agentById:    Record<string, string> = {};

    for (const a of rawActs) {
      actByActId[a.id] = a;
      if (a.owner_id) actByOwnerId[a.owner_id] = a;
    }
    for (const u of rawUsers) {
      if (u.role === 'agent') agentById[u.id] = u.display_name || u.email || u.id;
    }

    const agentProfiles = rawUsers.filter((u: any) => u.role === 'agent').map((u: any) => ({
      id: u.id,
      display_name: u.display_name,
      email: u.email,
      agency_name: u.agency_name,
    }));
    setAgents(agentProfiles);

    // Enrich users
    const enriched: AdminUser[] = rawUsers.map((u: any) => {
      const ownedAct  = actByOwnerId[u.id];
      const linkedAct = u.act_id ? actByActId[u.act_id] : null;
      const act       = ownedAct || linkedAct || null;
      const agentId   = act?.agent_id;
      const bandsUsed = u.role === 'agent' ? rawActs.filter((a: Act) => a.agent_id === u.id).length : 0;
      return {
        ...u,
        actName:       act?.act_name || null,
        resolvedActId: act?.id       || null,
        agentName:     agentId ? (agentById[agentId] || null) : null,
        bandsUsed,
      } as AdminUser;
    });

    setUsers(enriched);

    // Bookings 30d — enrich with band admin + agent names
    const userById: Record<string, any> = {};
    for (const u of rawUsers) userById[u.id] = u;

    const bk30: Booking30d[] = rawBk.map((b: any) => {
      const act       = b.act as any;
      const ownerId   = act?.owner_id;
      const owner     = ownerId ? userById[ownerId] : null;
      const creator   = b.created_by ? userById[b.created_by] : null;
      const venue     = b.venue as any;
      return {
        id:             b.id,
        show_date:      b.show_date,
        deal_type:      b.deal_type,
        agreed_amount:  b.agreed_amount,
        fee:            b.fee,
        actName:        act?.act_name || '—',
        bandAdminName:  owner?.display_name || '—',
        bandAdminEmail: owner?.email        || '—',
        venueName:      venue?.name || '—',
        venueCity:      venue ? `${venue.city || ''}${venue.state ? ', ' + venue.state : ''}` : '',
        agentName:      creator?.display_name || creator?.email || '—',
      };
    });
    setBookings30d(bk30);

    // Analytics
    const paying    = enriched.filter(u => u.subscription_status === 'active').length;
    const agentCnt  = enriched.filter(u => u.role === 'agent').length;
    const bandAdm   = enriched.filter(u => u.role === 'act_admin').length;
    const members   = enriched.filter(u => u.role === 'member').length;
    const new30d    = enriched.filter(u => u.created_at >= thirtyDaysAgo).length;
    setAnalytics({
      totalUsers: enriched.length,
      payingUsers: paying,
      agentCount: agentCnt,
      bandAdmins: bandAdm,
      members,
      new30d,
      confirmed30d: bk30.length,
    });
  };

  const loadSysStatus = async () => {
    try {
      const data = await callAdmin('system-status', undefined, 'GET');
      setSysStatus(data);
    } catch {
      setSysStatus({ supabase: true });
    }
  };

  // ── Filtered users ──────────────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    let list = users;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      list = list.filter(u =>
        (u.display_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.actName || '').toLowerCase().includes(q),
      );
    }
    switch (activeFilter) {
      case 'paying':    return list.filter(u => u.subscription_status === 'active');
      case 'agents':    return list.filter(u => u.role === 'agent');
      case 'bandAdmins':return list.filter(u => u.role === 'act_admin');
      case 'members':   return list.filter(u => u.role === 'member');
      case 'new30d':    return list.filter(u => u.created_at >= thirtyDaysAgo);
      default:          return list;
    }
  }, [users, activeFilter, filterSearch]);

  // ── Subscription users (for Section 3) ─────────────────────────────────────
  const subUsers = useMemo(() =>
    users.filter(u => u.subscription_status || u.subscription_tier),
  [users]);

  const totalMRR = useMemo(() =>
    subUsers.filter(u => u.subscription_status === 'active')
      .reduce((s, u) => s + (TIER_PRICE[u.subscription_tier || ''] || 0), 0),
  [subUsers]);
  const trialsActive   = subUsers.filter(u => u.subscription_status === 'trialing').length;
  const expiringSoon   = subUsers.filter(u => {
    if (u.subscription_status !== 'trialing' || !u.trial_ends_at) return false;
    const days = Math.ceil((new Date(u.trial_ends_at).getTime() - Date.now()) / 86_400_000);
    return days >= 0 && days <= 7;
  }).length;
  const cancelled = subUsers.filter(u => u.subscription_status === 'cancelled').length;

  // ── Actions ─────────────────────────────────────────────────────────────────
  const doFixRole = async () => {
    if (!fixRoleTarget || !fixRoleValue) return;
    setSaving('fixRole');
    await callAdmin('fix-role', { userId: fixRoleTarget.id, newRole: fixRoleValue });
    await loadData();
    setSaving('');
    setFixRoleTarget(null);
  };

  const doResetPassword = async (u: AdminUser) => {
    if (!u.email) return;
    setSaving('reset-' + u.id);
    const result = await callAdmin('reset-password', { email: u.email });
    setSaving('');
    setResetResult(result.link || 'Password reset email generated. Check Supabase logs.');
  };

  const doFixBand = async () => {
    if (!fixBandTarget) return;
    setSaving('fixBand');
    await callAdmin('fix-band-link', { userId: fixBandTarget.id, actId: fixBandActId || null });
    await loadData();
    setSaving('');
    setFixBandTarget(null);
  };

  const doFixAgent = async () => {
    if (!fixAgentTarget?.resolvedActId) return;
    setSaving('fixAgent');
    await callAdmin('fix-agent-link', { actId: fixAgentTarget.resolvedActId, agentId: fixAgentId || null });
    await loadData();
    setSaving('');
    setFixAgentTarget(null);
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setSaving('delete');
    await callAdmin('delete-user', { userId: deleteTarget.id }, 'DELETE');
    await loadData();
    setSaving('');
    setDeleteTarget(null);
  };

  const doCancel = async () => {
    if (!cancelTarget) return;
    setSaving('cancel');
    await callAdmin('update-subscription', { userId: cancelTarget.id, action: 'cancel' });
    await loadData();
    setSaving('');
    setCancelTarget(null);
  };

  const doRefund = async () => {
    if (!refundTarget || !refundNote.trim()) return;
    setSaving('refund');
    await callAdmin('update-subscription', { userId: refundTarget.id, action: 'refund', note: refundNote });
    await loadData();
    setSaving('');
    setRefundTarget(null);
    setRefundNote('');
  };

  const doUpgrade = async () => {
    if (!upgradeTarget || !upgradeTier) return;
    setSaving('upgrade');
    await callAdmin('update-subscription', { userId: upgradeTarget.id, action: 'upgrade', tier: upgradeTier });
    await loadData();
    setSaving('');
    setUpgradeTarget(null);
  };

  const doExtendTrial = async (u: AdminUser) => {
    setSaving('extend-' + u.id);
    await callAdmin('extend-trial', { userId: u.id, days: 14 });
    await loadData();
    setSaving('');
  };

  const doViewAs = (u: AdminUser) => {
    localStorage.setItem('impersonate_user', JSON.stringify({ id: u.id, name: u.display_name || u.email, role: u.role }));
    const dest = u.role === 'act_admin' ? '/band' : u.role === 'member' ? '/member' : '/dashboard';
    router.push(dest);
  };

  // ── Subscription row highlight ──────────────────────────────────────────────
  const subRowStyle = (u: AdminUser): React.CSSProperties => {
    if (u.subscription_status === 'cancelled') return { opacity: 0.55 };
    if (u.subscription_status !== 'trialing' || !u.trial_ends_at) return {};
    const days = Math.ceil((new Date(u.trial_ends_at).getTime() - Date.now()) / 86_400_000);
    if (days < 0)  return { background: 'rgba(248,113,113,0.18)' };
    if (days <= 7) return { background: 'rgba(251,191,36,0.15)' };
    return {};
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-base)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: '0.15em' }}>LOADING...</span>
      </div>
    );
  }
  if (!authorized) return null;

  const statCards = [
    { key: 'all',         label: 'Total Users',        value: analytics.totalUsers,   color: '#60a5fa' },
    { key: 'paying',      label: 'Paying Users',        value: analytics.payingUsers,  color: '#34d399' },
    { key: 'agents',      label: 'Agents',              value: analytics.agentCount,   color: GOLD },
    { key: 'bandAdmins',  label: 'Band Admins',         value: analytics.bandAdmins,   color: '#a78bfa' },
    { key: 'members',     label: 'Members',             value: analytics.members,      color: '#94a3b8' },
    { key: 'new30d',      label: 'New (30d)',           value: analytics.new30d,       color: '#f59e0b' },
    { key: 'confirmed30d',label: 'Confirmed Shows (30d)',value: analytics.confirmed30d, color: '#34d399' },
  ];

  const isBusy = (key: string) => saving === key;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Top bar */}
      <div style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <Link href="/dashboard" style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', letterSpacing: '0.1em', color: GOLD, textDecoration: 'none' }}>CAMEL RANCH</Link>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: GOLD, background: `${GOLD}18`, padding: '0.18rem 0.5rem', border: `1px solid ${GOLD}40` }}>SUPERADMIN</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Link href="/dashboard" style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none' }}>→ Agent View</Link>
          <button onClick={async () => { await supabase.auth.signOut(); router.replace('/login'); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'var(--text-primary)', letterSpacing: '0.04em', margin: 0 }}>Admin Dashboard</h1>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        {/* ── SECTION 1: Analytics Stat Cards ──────────────────────────────── */}
        <SectionLabel>Platform Analytics</SectionLabel>
        {activeFilter !== 'all' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Filtering: <strong style={{ color: 'var(--text-primary)' }}>{statCards.find(c => c.key === activeFilter)?.label}</strong>
            </span>
            <button
              onClick={() => setActiveFilter('all')}
              className="btn btn-sm btn-ghost"
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.65rem' }}
            >
              Show All
            </button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '0.65rem', marginBottom: '2rem' }}>
          {statCards.map(card => (
            <button
              key={card.key}
              onClick={() => setActiveFilter(card.key)}
              style={{
                background: 'var(--bg-panel)',
                border: `1px solid ${activeFilter === card.key ? card.color : 'var(--border)'}`,
                borderTop: `3px solid ${card.color}`,
                padding: '1rem',
                textAlign: 'left',
                cursor: 'pointer',
                boxShadow: activeFilter === card.key ? `0 0 12px ${card.color}30` : 'none',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: card.color, lineHeight: 1, marginBottom: '0.25rem' }}>
                {card.value ?? '—'}
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {card.label}
              </div>
            </button>
          ))}
        </div>

        {/* ── Confirmed Shows Panel (shown when that filter is active) ─────── */}
        {activeFilter === 'confirmed30d' && (
          <div style={{ marginBottom: '2rem' }}>
            <SectionLabel>Confirmed Shows — Last 30 Days ({bookings30d.length})</SectionLabel>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Band</th>
                      <th>Band Admin</th>
                      <th>Email</th>
                      <th>Venue</th>
                      <th>Show Date</th>
                      <th>Deal Type</th>
                      <th>Amount</th>
                      <th>Confirmed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings30d.length === 0 ? (
                      <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>No confirmed shows in the last 30 days.</td></tr>
                    ) : bookings30d.map(b => (
                      <tr key={b.id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{b.actName}</td>
                        <td>{b.bandAdminName}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{b.bandAdminEmail}</td>
                        <td>{b.venueName}{b.venueCity ? ` · ${b.venueCity}` : ''}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                          {b.show_date ? new Date(b.show_date + 'T00:00:00').toLocaleDateString() : '—'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{b.deal_type || '—'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#34d399' }}>
                          {b.agreed_amount != null ? `$${Number(b.agreed_amount).toLocaleString()}` : b.fee != null ? `$${Number(b.fee).toLocaleString()}` : '—'}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{b.agentName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── SECTION 2: User Management ──────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <SectionLabel>User Management · {filteredUsers.length}{activeFilter !== 'all' ? ` of ${users.length}` : ''}</SectionLabel>
          <input
            className="input" placeholder="Search name / email / band..."
            value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
            style={{ width: 220, fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}
          />
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '2rem' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Band / Act</th>
                  <th>Agent</th>
                  <th>Plan</th>
                  <th>Trial Ends</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>No users match this filter.</td></tr>
                )}
                {filteredUsers.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{u.display_name || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email || '—'}</td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: ROLE_COLOR[u.role] || 'var(--text-muted)' }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{u.actName || '—'}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{u.agentName || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{u.subscription_tier || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', whiteSpace: 'nowrap', color: (() => {
                      if (!u.trial_ends_at) return 'var(--text-muted)';
                      const d = Math.ceil((new Date(u.trial_ends_at).getTime() - Date.now()) / 86_400_000);
                      return d < 0 ? '#f87171' : d <= 7 ? '#fbbf24' : 'var(--text-muted)';
                    })() }}>
                      {u.trial_ends_at ? new Date(u.trial_ends_at).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: u.subscription_status === 'active' ? '#34d399' : u.subscription_status === 'trialing' ? '#fbbf24' : 'var(--text-muted)' }}>
                        {u.subscription_status || '—'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {/* Fix Role */}
                        {u.role !== 'superadmin' && (
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem' }}
                            onClick={() => { setFixRoleTarget(u); setFixRoleValue(u.role); }}>
                            Fix Role
                          </button>
                        )}
                        {/* Reset Password */}
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem' }}
                          disabled={saving === 'reset-' + u.id}
                          onClick={() => doResetPassword(u)}>
                          {saving === 'reset-' + u.id ? '…' : 'Reset Pwd'}
                        </button>
                        {/* Fix Band Link */}
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem' }}
                          onClick={() => { setFixBandTarget(u); setFixBandActId(u.resolvedActId || ''); }}>
                          Fix Band
                        </button>
                        {/* Fix Agent Link */}
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem' }}
                          onClick={() => { setFixAgentTarget(u); setFixAgentId(u.resolvedActId ? (acts.find(a => a.id === u.resolvedActId)?.agent_id || '') : ''); }}>
                          Fix Agent
                        </button>
                        {/* View As — superadmin only; don't show for superadmin targets */}
                        {u.role !== 'superadmin' && (
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem', color: '#a78bfa' }}
                            onClick={() => doViewAs(u)}>
                            View As
                          </button>
                        )}
                        {/* Delete */}
                        {u.role !== 'superadmin' && (
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem', color: '#f87171' }}
                            onClick={() => setDeleteTarget(u)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── SECTION 3: Subscription Management ──────────────────────────── */}
        <SectionLabel>Subscription Management</SectionLabel>

        {/* Summary bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.65rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'Total MRR (est.)', value: `$${totalMRR.toLocaleString()}`, color: '#34d399' },
            { label: 'Trials Active',     value: trialsActive,                    color: '#fbbf24' },
            { label: 'Expiring Soon',     value: expiringSoon,                    color: '#f97316' },
            { label: 'Cancelled',         value: cancelled,                       color: '#f87171' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderTop: `3px solid ${s.color}`, padding: '0.85rem' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: s.color, lineHeight: 1, marginBottom: '0.2rem' }}>{s.value}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.67rem', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '2rem' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Plan</th>
                  <th>Bands Used</th>
                  <th>Trial Ends</th>
                  <th>Billing Date</th>
                  <th>Est. MRR</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subUsers.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>No subscription records yet.</td></tr>
                )}
                {subUsers.map(u => {
                  const days = u.trial_ends_at
                    ? Math.ceil((new Date(u.trial_ends_at).getTime() - Date.now()) / 86_400_000)
                    : null;
                  return (
                    <tr key={u.id} style={subRowStyle(u)}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.display_name || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{u.subscription_tier || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', textAlign: 'center' }}>{u.bandsUsed || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', whiteSpace: 'nowrap',
                        color: days != null ? (days < 0 ? '#f87171' : days <= 7 ? '#fbbf24' : 'var(--text-muted)') : 'var(--text-muted)' }}>
                        {u.trial_ends_at ? new Date(u.trial_ends_at).toLocaleDateString() : '—'}
                        {days != null && days >= 0 ? ` (${days}d)` : ''}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>—</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#34d399' }}>
                        {u.subscription_status === 'active' && u.subscription_tier
                          ? `$${TIER_PRICE[u.subscription_tier] || 0}`
                          : '—'}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                          color: u.subscription_status === 'active' ? '#34d399' : u.subscription_status === 'trialing' ? '#fbbf24' : u.subscription_status === 'cancelled' ? '#94a3b8' : '#f87171' }}>
                          {u.subscription_status || '—'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.65rem' }}
                            onClick={() => { setUpgradeTarget(u); setUpgradeTier(u.subscription_tier || ''); }}>
                            Upgrade
                          </button>
                          {u.subscription_status !== 'cancelled' && (
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.65rem', color: '#f87171' }}
                              onClick={() => setCancelTarget(u)}>
                              Cancel
                            </button>
                          )}
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.65rem', color: '#fbbf24' }}
                            onClick={() => { setRefundTarget(u); setRefundNote(''); }}>
                            Refund
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.65rem', color: '#60a5fa' }}
                            disabled={saving === 'extend-' + u.id}
                            onClick={() => doExtendTrial(u)}>
                            {saving === 'extend-' + u.id ? '…' : '+14d'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── SECTION 4: System Status ─────────────────────────────────────── */}
        <SectionLabel>System Status</SectionLabel>
        <div className="card" style={{ padding: '1rem 1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
            {sysStatus ? [
              { name: 'Supabase',              ok: !!sysStatus.supabase },
              { name: 'Stripe',                ok: !!sysStatus.stripe },
              { name: 'Resend Email',          ok: !!sysStatus.resend },
              { name: 'Google Maps API',       ok: !!sysStatus.googleMaps },
              { name: 'Google Calendar OAuth', ok: !!sysStatus.googleCalendar },
            ].map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {dot(s.ok)}
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{s.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: s.ok ? '#34d399' : '#f87171' }}>
                  {s.ok ? 'OK' : 'NOT SET'}
                </span>
              </div>
            )) : (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading…</span>
            )}
          </div>
          {sysStatus?.gitHash && (
            <div style={{ marginTop: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Last deploy: <span style={{ color: 'var(--text-secondary)' }}>{sysStatus.gitHash.slice(0, 8)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {/* Fix Role */}
      {fixRoleTarget && (
        <ModalWrap onClose={() => setFixRoleTarget(null)}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '1.5rem', width: '100%', maxWidth: 360 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--text-primary)', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>FIX ROLE</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              {fixRoleTarget.display_name || fixRoleTarget.email}
            </div>
            <select className="select" value={fixRoleValue} onChange={e => setFixRoleValue(e.target.value)} style={{ width: '100%', marginBottom: '1rem' }}>
              <option value="agent">Agent</option>
              <option value="act_admin">Band Admin</option>
              <option value="member">Member</option>
            </select>
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={isBusy('fixRole')} onClick={doFixRole}>
                {isBusy('fixRole') ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-ghost" onClick={() => setFixRoleTarget(null)}>Cancel</button>
            </div>
          </div>
        </ModalWrap>
      )}

      {/* Fix Band Link */}
      {fixBandTarget && (
        <ModalWrap onClose={() => setFixBandTarget(null)}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '1.5rem', width: '100%', maxWidth: 400 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--text-primary)', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>FIX BAND LINK</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Linking {fixBandTarget.display_name || fixBandTarget.email} to an act
            </div>
            <select className="select" value={fixBandActId} onChange={e => setFixBandActId(e.target.value)} style={{ width: '100%', marginBottom: '1rem' }}>
              <option value="">— None —</option>
              {acts.map(a => (
                <option key={a.id} value={a.id}>{a.act_name}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={isBusy('fixBand')} onClick={doFixBand}>
                {isBusy('fixBand') ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-ghost" onClick={() => setFixBandTarget(null)}>Cancel</button>
            </div>
          </div>
        </ModalWrap>
      )}

      {/* Fix Agent Link */}
      {fixAgentTarget && (
        <ModalWrap onClose={() => setFixAgentTarget(null)}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '1.5rem', width: '100%', maxWidth: 400 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--text-primary)', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>FIX AGENT LINK</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Assigning agent to <strong style={{ color: 'var(--text-primary)' }}>{fixAgentTarget.actName || 'this user\'s act'}</strong>
            </div>
            {!fixAgentTarget.resolvedActId && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#f87171', marginBottom: '0.75rem' }}>
                No act linked to this user yet. Use Fix Band first.
              </div>
            )}
            <select className="select" value={fixAgentId} onChange={e => setFixAgentId(e.target.value)} style={{ width: '100%', marginBottom: '1rem' }} disabled={!fixAgentTarget.resolvedActId}>
              <option value="">— None —</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.display_name || a.email}{a.agency_name ? ` (${a.agency_name})` : ''}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={isBusy('fixAgent') || !fixAgentTarget.resolvedActId} onClick={doFixAgent}>
                {isBusy('fixAgent') ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-ghost" onClick={() => setFixAgentTarget(null)}>Cancel</button>
            </div>
          </div>
        </ModalWrap>
      )}

      {/* Reset Password Result */}
      {resetResult && (
        <ModalWrap onClose={() => setResetResult(null)}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '1.5rem', width: '100%', maxWidth: 520 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#34d399', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>RESET LINK GENERATED</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              Copy and send this link to the user:
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-primary)',
              background: 'var(--bg-base)', border: '1px solid var(--border)', padding: '0.75rem',
              wordBreak: 'break-all', marginBottom: '1rem', lineHeight: 1.5,
            }}>
              {resetResult}
            </div>
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { navigator.clipboard?.writeText(resetResult); }}>
                Copy Link
              </button>
              <button className="btn btn-ghost" onClick={() => setResetResult(null)}>Close</button>
            </div>
          </div>
        </ModalWrap>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <ModalWrap onClose={() => setDeleteTarget(null)}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid rgba(239,68,68,0.4)', padding: '1.5rem', width: '100%', maxWidth: 380 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#f87171', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>DELETE USER</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Delete <strong style={{ color: 'var(--text-primary)' }}>{deleteTarget.display_name || deleteTarget.email}</strong>? This removes their auth account and profile. This action cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button className="btn btn-danger" style={{ flex: 1 }} disabled={isBusy('delete')} onClick={doDelete}>
                {isBusy('delete') ? 'Deleting…' : 'Delete'}
              </button>
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
            </div>
          </div>
        </ModalWrap>
      )}

      {/* Cancel Subscription Confirm */}
      {cancelTarget && (
        <ModalWrap onClose={() => setCancelTarget(null)}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid rgba(239,68,68,0.4)', padding: '1.5rem', width: '100%', maxWidth: 380 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#f87171', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>CANCEL SUBSCRIPTION</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Cancel subscription for <strong style={{ color: 'var(--text-primary)' }}>{cancelTarget.display_name || cancelTarget.email}</strong>? Their status will be set to cancelled.
            </div>
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button className="btn btn-danger" style={{ flex: 1 }} disabled={isBusy('cancel')} onClick={doCancel}>
                {isBusy('cancel') ? 'Cancelling…' : 'Cancel Subscription'}
              </button>
              <button className="btn btn-ghost" onClick={() => setCancelTarget(null)}>Keep Active</button>
            </div>
          </div>
        </ModalWrap>
      )}

      {/* Refund Note */}
      {refundTarget && (
        <ModalWrap onClose={() => setRefundTarget(null)}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '1.5rem', width: '100%', maxWidth: 400 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#fbbf24', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>RECORD REFUND</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              {refundTarget.display_name || refundTarget.email}
            </div>
            <textarea
              className="textarea"
              placeholder="Describe the refund (amount, reason, date processed…)"
              value={refundNote}
              onChange={e => setRefundNote(e.target.value)}
              style={{ width: '100%', marginBottom: '1rem', minHeight: 80 }}
            />
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={isBusy('refund') || !refundNote.trim()} onClick={doRefund}>
                {isBusy('refund') ? 'Saving…' : 'Save Refund Note'}
              </button>
              <button className="btn btn-ghost" onClick={() => setRefundTarget(null)}>Cancel</button>
            </div>
          </div>
        </ModalWrap>
      )}

      {/* Upgrade Plan */}
      {upgradeTarget && (
        <ModalWrap onClose={() => setUpgradeTarget(null)}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '1.5rem', width: '100%', maxWidth: 360 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--text-primary)', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>UPGRADE PLAN</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              {upgradeTarget.display_name || upgradeTarget.email}
            </div>
            <select className="select" value={upgradeTier} onChange={e => setUpgradeTier(e.target.value)} style={{ width: '100%', marginBottom: '1rem' }}>
              <option value="">— Select tier —</option>
              <option value="agent_t1">Agent T1 ($49/mo)</option>
              <option value="agent_t2">Agent T2 ($99/mo)</option>
              <option value="band_admin">Band Admin ($19/mo)</option>
            </select>
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={isBusy('upgrade') || !upgradeTier} onClick={doUpgrade}>
                {isBusy('upgrade') ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-ghost" onClick={() => setUpgradeTarget(null)}>Cancel</button>
            </div>
          </div>
        </ModalWrap>
      )}
    </div>
  );
}
