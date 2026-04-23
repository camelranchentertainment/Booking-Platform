import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/router';

type PwForm = { newPassword: string; confirmPassword: string };

type BandForm = {
  act_name: string; genre: string; bio: string;
  website: string; instagram: string; spotify: string; member_count: string;
};

type PendingInvite = { id: string; role: string; token: string; act: { act_name: string } | null };

const GENRES = ['Rock','Country','Americana','Folk','Blues','Jazz','Pop','Hip-Hop','R&B','Soul','Metal','Punk','Electronic','Singer-Songwriter','Other'];

export default function BandSettings() {
  const router = useRouter();

  // Act / band profile
  const [act, setAct]       = useState<any>(null);
  const [form, setForm]     = useState<BandForm>({ act_name: '', genre: '', bio: '', website: '', instagram: '', spotify: '', member_count: '1' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [loading, setLoading] = useState(true);

  // Personal info
  const [displayName, setDisplayName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedProfile, setSavedProfile]   = useState(false);

  // Password
  const [pwForm, setPwForm]   = useState<PwForm>({ newPassword: '', confirmPassword: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved]   = useState(false);
  const [pwError, setPwError]   = useState('');

  // Create-new-band flow
  const [createName, setCreateName]   = useState('');
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState('');

  // Pending invites (for users who haven't accepted yet)
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [accepting, setAccepting] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Load personal display_name from profile
    const { data: prof } = await supabase.from('user_profiles').select('display_name, act_id, email').eq('id', user.id).single();
    setDisplayName(prof?.display_name || '');

    // Dual-lookup for act: owner first, then profile act_id
    let { data: acts } = await supabase.from('acts').select('*').eq('owner_id', user.id).eq('is_active', true).limit(1);
    if (!acts?.length && prof?.act_id) {
      const { data: linked } = await supabase.from('acts').select('*').eq('id', prof.act_id).eq('is_active', true).limit(1);
      acts = linked;
    }
    const a = acts?.[0];
    if (a) {
      setAct(a);
      setForm({
        act_name:     a.act_name     || '',
        genre:        a.genre        || '',
        bio:          a.bio          || '',
        website:      a.website      || '',
        instagram:    a.instagram    || '',
        spotify:      a.spotify      || '',
        member_count: String(a.member_count || 1),
      });
    }

    // Check for pending invites (uses auth email as primary lookup)
    const authEmail = user.email || prof?.email || null;
    if (authEmail) {
      const { data: invites } = await supabase
        .from('act_invitations')
        .select('id, role, token, act:act_id(act_name)')
        .eq('email', authEmail)
        .eq('status', 'pending');
      setPendingInvites((invites || []) as PendingInvite[]);
    }

    setLoading(false);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setSavedProfile(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('user_profiles').update({ display_name: displayName.trim() }).eq('id', user.id);
    setSavingProfile(false);
    setSavedProfile(true);
    setTimeout(() => setSavedProfile(false), 3000);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!act) return;
    setSaving(true);
    setSaved(false);
    await supabase.from('acts').update({
      act_name:     form.act_name,
      genre:        form.genre     || null,
      bio:          form.bio       || null,
      website:      form.website   || null,
      instagram:    form.instagram || null,
      spotify:      form.spotify   || null,
      member_count: form.member_count ? Number(form.member_count) : 1,
    }).eq('id', act.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await load();
  };

  const set = (k: keyof BandForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwError('Passwords do not match'); return; }
    if (pwForm.newPassword.length < 8) { setPwError('Password must be at least 8 characters'); return; }
    setPwError('');
    setPwSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password: pwForm.newPassword });
    setPwSaving(false);
    if (err) { setPwError(err.message); return; }
    setPwForm({ newPassword: '', confirmPassword: '' });
    setPwSaved(true);
    setTimeout(() => setPwSaved(false), 3000);
  };

  const createAct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    setCreateError('');
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/acts/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ act_name: createName.trim() }),
    });
    const json = await res.json();
    if (!res.ok) { setCreateError(json.error || 'Failed to create band'); setCreating(false); return; }
    await load();
    setCreating(false);
  };

  const acceptInvite = async (invite: PendingInvite) => {
    setAccepting(invite.id);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAccepting(''); return; }
    const { data: prof } = await supabase.from('user_profiles').select('display_name').eq('id', user.id).single();
    const res = await fetch('/api/accept-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: invite.token, userId: user.id, displayName: prof?.display_name || '' }),
    });
    if (res.ok) {
      await load();
      router.reload();
    }
    setAccepting('');
  };

  if (loading) return <AppShell requireRole="act_admin"><div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>Loading…</div></AppShell>;

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Account & Profile</h1>
          <div className="page-sub">{act ? act.act_name : 'Set up your band profile'}</div>
        </div>
        <button className="btn btn-secondary" onClick={() => router.back()}>← Back</button>
      </div>

      {/* Pending invites banner */}
      {pendingInvites.length > 0 && (
        <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {pendingInvites.map(invite => (
            <div key={invite.id} style={{
              background: 'rgba(167,139,250,0.08)',
              border: '1px solid rgba(167,139,250,0.35)',
              borderRadius: 'var(--radius)',
              padding: '1rem 1.25rem',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
            }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#a78bfa', marginBottom: '0.25rem' }}>
                  Band Invite
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.93rem' }}>
                  {invite.act?.act_name || 'A band'} has invited you as {invite.role === 'act_admin' ? 'Band Admin' : 'Band Member'}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
                  Accept to link this band profile to your account, or decline and create your own below.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!!accepting}
                  onClick={async () => {
                    // Decline: just mark as declined
                    const { data: { session } } = await supabase.auth.getSession();
                    await fetch('/api/act-invitations/decline', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                      body: JSON.stringify({ inviteId: invite.id }),
                    });
                    await load();
                  }}
                  style={{ color: '#f87171', borderColor: '#f87171' }}
                >
                  Decline
                </button>
                <button
                  className="btn btn-sm"
                  disabled={!!accepting}
                  onClick={() => acceptInvite(invite)}
                  style={{ background: '#a78bfa', borderColor: '#a78bfa', color: '#000', fontWeight: 600 }}
                >
                  {accepting === invite.id ? 'Accepting…' : 'Accept'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* ── Personal Info ── */}
        <form onSubmit={saveProfile}>
          <div className="card">
            <div className="card-header"><span className="card-title">PERSONAL INFO</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="field">
                <label className="field-label">Display Name</label>
                <input
                  className="input"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save'}
              </button>
              {savedProfile && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: '#34d399', letterSpacing: '0.06em' }}>✓ Saved</span>}
            </div>
          </div>
        </form>

        {/* ── Band Profile ── */}
        {!act && !pendingInvites.length && (
          <div className="card">
            <div className="card-header"><span className="card-title">BAND PROFILE</span></div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Your account doesn't have a band profile yet. Enter your band name to get started — you can fill in the rest of the details after.
              If your booking agent has set up a profile for you, you'll see an invite notice above once they send it.
            </p>
            <form onSubmit={createAct} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="field">
                <label className="field-label">Band / Act Name *</label>
                <input
                  className="input"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  placeholder="The Band Name"
                  required
                  autoFocus
                />
              </div>
              {createError && (
                <div style={{ color: '#f87171', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>{createError}</div>
              )}
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Creating…' : 'Create Band Profile'}
              </button>
            </form>
          </div>
        )}

        {act && (
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Agent-created notice */}
            {act.agent_id && !act.owner_id && (
              <div style={{
                background: 'rgba(200,146,26,0.07)',
                border: '1px solid rgba(200,146,26,0.25)',
                borderRadius: 'var(--radius)',
                padding: '0.75rem 1rem',
                fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5,
              }}>
                ◈ This profile was set up by your booking agent. You can edit any details below.
              </div>
            )}

            {/* Band Identity */}
            <div className="card">
              <div className="card-header"><span className="card-title">BAND IDENTITY</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="field">
                  <label className="field-label">Band Name *</label>
                  <input className="input" value={form.act_name} onChange={set('act_name')} required />
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label className="field-label">Genre</label>
                    <select className="select" value={form.genre} onChange={set('genre')}>
                      <option value="">— select —</option>
                      {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label">Members</label>
                    <input className="input" type="number" min="1" max="99" value={form.member_count} onChange={set('member_count')} />
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Bio</label>
                  <textarea
                    className="input"
                    value={form.bio}
                    onChange={set('bio')}
                    rows={5}
                    placeholder="Describe your band — this gets used in pitch emails…"
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>

            {/* Online Presence */}
            <div className="card">
              <div className="card-header"><span className="card-title">ONLINE PRESENCE</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="field">
                  <label className="field-label">Website</label>
                  <input className="input" value={form.website} onChange={set('website')} placeholder="https://..." />
                </div>
                <div className="field">
                  <label className="field-label">Spotify</label>
                  <input className="input" value={form.spotify} onChange={set('spotify')} placeholder="https://open.spotify.com/artist/..." />
                </div>
                <div className="field">
                  <label className="field-label">Instagram</label>
                  <input className="input" value={form.instagram} onChange={set('instagram')} placeholder="@bandname or full URL" />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Band Profile'}
              </button>
              {saved && (
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: '#34d399', letterSpacing: '0.06em' }}>
                  ✓ Saved
                </span>
              )}
            </div>
          </form>
        )}

        {/* ── Change Password ── */}
        <form onSubmit={changePassword}>
          <div className="card">
            <div className="card-header"><span className="card-title">CHANGE PASSWORD</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="field">
                <label className="field-label">New Password</label>
                <input
                  className="input" type="password"
                  value={pwForm.newPassword}
                  onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                />
              </div>
              <div className="field">
                <label className="field-label">Confirm New Password</label>
                <input
                  className="input" type="password"
                  value={pwForm.confirmPassword}
                  onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                />
              </div>
              {pwError && <div style={{ color: '#f87171', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>{pwError}</div>}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" disabled={pwSaving}>{pwSaving ? 'Saving...' : 'Update Password'}</button>
              {pwSaved && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#34d399' }}>✓ Password Updated</span>}
            </div>
          </div>
        </form>

      </div>
    </AppShell>
  );
}
