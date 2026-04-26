import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import Link from 'next/link';

const GOLD  = '#C8921A';
const MUTED = 'rgba(200,146,26,0.5)';

const ROLE_COLOR: Record<string, string> = {
  superadmin: '#C8921A',
  agent:      '#60a5fa',
  act_admin:  '#a78bfa',
  member:     '#94a3b8',
};

function StatPill({ label, value, color = GOLD }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '1.1rem', borderTop: `3px solid ${color}` }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color, lineHeight: 1, marginBottom: '0.3rem' }}>{value}</div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading]       = useState(true);
  const [users, setUsers]           = useState<any[]>([]);
  const [analytics, setAnalytics]   = useState<any>(null);
  const [filterRole, setFilterRole] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [editUser, setEditUser]     = useState<any>(null);
  const [editForm, setEditForm]     = useState({ role: '', subscription_status: '', subscription_tier: '' });
  const [saving, setSaving]         = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    const { data: prof } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
    if (prof?.role !== 'superadmin') { router.replace('/dashboard'); return; }
    setAuthorized(true);
    await loadData();
    setLoading(false);
  };

  const loadData = async () => {
    const [usersRes, bookingsRes, venuesRes, actsRes] = await Promise.all([
      supabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('bookings').select('id, status, created_at').order('created_at', { ascending: false }),
      supabase.from('venues').select('id').limit(1),
      supabase.from('acts').select('id').limit(1),
    ]);

    const allUsers    = usersRes.data || [];
    const allBookings = bookingsRes.data || [];

    setUsers(allUsers);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const newSignups    = allUsers.filter(u => u.created_at >= thirtyDaysAgo).length;
    const confirmed30d  = allBookings.filter(b => b.status === 'confirmed' && b.created_at >= thirtyDaysAgo).length;
    const payingUsers   = allUsers.filter(u => u.subscription_status === 'active').length;
    const agentCount    = allUsers.filter(u => u.role === 'agent').length;
    const bandAdmins    = allUsers.filter(u => u.role === 'act_admin').length;
    const members       = allUsers.filter(u => u.role === 'member').length;

    setAnalytics({
      totalUsers:  allUsers.length,
      payingUsers,
      agentCount,
      bandAdmins,
      members,
      newSignups,
      confirmed30d,
    });
  };

  const openEdit = (u: any) => {
    setEditUser(u);
    setEditForm({ role: u.role, subscription_status: u.subscription_status || '', subscription_tier: u.subscription_tier || '' });
  };

  const saveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    await supabase.from('user_profiles').update({
      role:                editForm.role || null,
      subscription_status: editForm.subscription_status || null,
      subscription_tier:   editForm.subscription_tier || null,
    }).eq('id', editUser.id);
    await loadData();
    setSaving(false);
    setEditUser(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('user_profiles').delete().eq('id', deleteTarget.id);
    await loadData();
    setDeleteTarget(null);
  };

  const filteredUsers = users.filter(u => {
    if (filterRole && u.role !== filterRole) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!(u.display_name || '').toLowerCase().includes(q) && !(u.email || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const ENV_CHECKS = [
    ['NEXT_PUBLIC_SUPABASE_URL',    !!process.env.NEXT_PUBLIC_SUPABASE_URL],
    ['RESEND_API_KEY',              'configured (server-side)'],
    ['STRIPE_SECRET_KEY',           'configured (server-side)'],
    ['GOOGLE_MAPS_API_KEY',         'configured (server-side)'],
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-base)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: '0.15em' }}>LOADING...</span>
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Top bar */}
      <div style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <Link href="/dashboard" style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', letterSpacing: '0.1em', color: GOLD, textDecoration: 'none' }}>CAMEL RANCH</Link>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: GOLD, background: `${GOLD}18`, padding: '0.18rem 0.5rem', border: `1px solid ${GOLD}40` }}>SUPERADMIN</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/dashboard" style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none' }}>→ Agent View</Link>
          <button onClick={async () => { await supabase.auth.signOut(); router.replace('/login'); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'var(--text-primary)', letterSpacing: '0.04em', margin: 0 }}>Admin Dashboard</h1>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        {/* Platform analytics */}
        {analytics && (
          <>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD, marginBottom: '0.75rem' }}>Platform Analytics</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '2rem' }}>
              <StatPill label="Total Users"      value={analytics.totalUsers}  color="#60a5fa" />
              <StatPill label="Paying Users"     value={analytics.payingUsers} color="#34d399" />
              <StatPill label="Agents"           value={analytics.agentCount}  color={GOLD} />
              <StatPill label="Band Admins"      value={analytics.bandAdmins}  color="#a78bfa" />
              <StatPill label="Members"          value={analytics.members}     color="#94a3b8" />
              <StatPill label="New (30d)"        value={analytics.newSignups}  color="#f59e0b" />
              <StatPill label="Confirmed (30d)"  value={analytics.confirmed30d} color="#34d399" />
            </div>
          </>
        )}

        {/* System status */}
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD, marginBottom: '0.75rem' }}>System Status</div>
        <div className="card" style={{ padding: '0.85rem 1.25rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {[
              { name: 'Supabase',      ok: true },
              { name: 'Resend Email',  ok: true },
              { name: 'Stripe',        ok: false, note: 'Keys not wired' },
              { name: 'Google Maps',   ok: false, note: 'Key not set' },
            ].map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.ok ? '#34d399' : '#f87171' }} />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{s.name}</span>
                {s.note && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>({s.note})</span>}
              </div>
            ))}
          </div>
        </div>

        {/* User management */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD }}>
            User Management · {filteredUsers.length} of {users.length}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              className="input" placeholder="Search name / email..."
              value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
              style={{ width: 200, fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}
            />
            <select className="select" value={filterRole} onChange={e => setFilterRole(e.target.value)}
              style={{ width: 140, fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}>
              <option value="">All Roles</option>
              <option value="superadmin">Superadmin</option>
              <option value="agent">Agent</option>
              <option value="act_admin">Band Admin</option>
              <option value="member">Member</option>
            </select>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '2rem' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Subscription</th>
                  <th>Tier</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.display_name || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{u.email || '—'}</td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: ROLE_COLOR[u.role] || 'var(--text-muted)' }}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: u.subscription_status === 'active' ? '#34d399' : u.subscription_status === 'trialing' ? '#fbbf24' : 'var(--text-muted)' }}>
                        {u.subscription_status || '—'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{u.subscription_tier || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: '#f87171' }} onClick={() => setDeleteTarget(u)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Subscriptions summary */}
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD, marginBottom: '0.75rem' }}>Subscriptions</div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Tier</th>
                  <th>Trial Ends</th>
                </tr>
              </thead>
              <tbody>
                {users.filter(u => u.subscription_status || u.subscription_tier).map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.display_name || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{u.email || '—'}</td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: u.subscription_status === 'active' ? '#34d399' : u.subscription_status === 'trialing' ? '#fbbf24' : '#f87171' }}>
                        {u.subscription_status || '—'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{u.subscription_tier || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {u.trial_ends_at ? new Date(u.trial_ends_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
                {users.filter(u => u.subscription_status || u.subscription_tier).length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>No subscription records yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit user modal */}
      {editUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '1.5rem', width: '100%', maxWidth: 400 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--text-primary)', letterSpacing: '0.04em', marginBottom: '1.25rem' }}>
              EDIT USER
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              {editUser.display_name} · {editUser.email}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="field">
                <label className="field-label">Role</label>
                <select className="select" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="agent">Agent</option>
                  <option value="act_admin">Band Admin</option>
                  <option value="member">Member</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">Subscription Status</label>
                <select className="select" value={editForm.subscription_status} onChange={e => setEditForm(f => ({ ...f, subscription_status: e.target.value }))}>
                  <option value="">None</option>
                  <option value="trialing">Trialing</option>
                  <option value="active">Active</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="past_due">Past Due</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">Subscription Tier</label>
                <select className="select" value={editForm.subscription_tier} onChange={e => setEditForm(f => ({ ...f, subscription_tier: e.target.value }))}>
                  <option value="">None</option>
                  <option value="agent_t1">Agent T1</option>
                  <option value="agent_t2">Agent T2</option>
                  <option value="band_admin">Band Admin</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.5rem' }}>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button className="btn btn-ghost" onClick={() => setEditUser(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid rgba(239,68,68,0.4)', padding: '1.5rem', width: '100%', maxWidth: 380 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: '#f87171', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>DELETE USER</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{deleteTarget.display_name || deleteTarget.email}</strong>?
              This removes their profile record. Their auth account may still exist.
            </div>
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button className="btn btn-danger" onClick={confirmDelete} style={{ flex: 1 }}>Delete Profile</button>
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
