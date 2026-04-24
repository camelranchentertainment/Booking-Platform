import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../lib/types';
import PlatformSetup from '../components/settings/PlatformSetup';

const TIER_LABELS: Record<string, string> = {
  agent:      'Booking Agent — $30 / month',
  band_admin: 'Band Admin — $15 / month',
  member:     'Band Member — Free',
};

const STATUS_LABELS: Record<string, string> = {
  active:   'Active',
  trialing: 'Free Trial',
  past_due: 'Past Due',
  cancelled:'Cancelled',
  inactive: 'Inactive',
};

export default function Settings() {
  const router = useRouter();
  const [profile, setProfile]       = useState<UserProfile | null>(null);
  const [form, setForm]             = useState({ display_name: '', agency_name: '', phone: '', email: '', personal_gmail: '' });
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [avatarUrl, setAvatarUrl]   = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError]         = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pwForm, setPwForm]       = useState({ newPassword: '', confirmPassword: '' });
  const [pwSaving, setPwSaving]   = useState(false);
  const [pwSaved, setPwSaved]     = useState(false);
  const [pwError, setPwError]     = useState('');

  const [portalLoading, setPortalLoading] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin]   = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle();
    if (data) {
      setProfile(data);
      setAvatarUrl(data.avatar_url || null);
      setForm({ display_name: data.display_name || '', agency_name: data.agency_name || '', phone: data.phone || '', email: data.email || '', personal_gmail: (data as any).personal_gmail || '' });
      setIsSuperAdmin(data.role === 'superadmin');
    }
  };

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

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setPortalLoading(false);
    }
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    if (!file.type.startsWith('image/')) { setAvatarError('Please choose an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { setAvatarError('Image must be under 5 MB'); return; }
    setAvatarError('');
    setAvatarUploading(true);
    const ext  = file.name.split('.').pop() || 'jpg';
    const path = `${profile.id}.${ext}`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setAvatarError(upErr.message); setAvatarUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = `${publicUrl}?t=${Date.now()}`;
    await supabase.from('user_profiles').update({ avatar_url: url }).eq('id', profile.id);
    setAvatarUrl(url);
    setAvatarUploading(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    await supabase.from('user_profiles').update({
      display_name:   form.display_name,
      agency_name:    form.agency_name    || null,
      phone:          form.phone          || null,
      personal_gmail: form.personal_gmail || null,
    } as any).eq('id', profile.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <AppShell requireRole={['agent', 'act_admin', 'member']}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <div className="page-sub">
            {isSuperAdmin ? 'Platform configuration & profile'
              : profile?.role === 'member' ? 'Account & password'
              : profile?.role === 'act_admin' ? 'Band profile & account'
              : 'Agent profile & preferences'}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Platform Setup — superadmin only */}
        {isSuperAdmin && <PlatformSetup />}

        {/* Profile */}
        <form onSubmit={save}>
          <div className="card">
            <div className="card-header"><span className="card-title">PROFILE</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

              {/* Avatar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                <div
                  onClick={() => !avatarUploading && fileInputRef.current?.click()}
                  style={{
                    width: 80, height: 80, borderRadius: '50%', flexShrink: 0,
                    background: avatarUrl ? 'transparent' : 'var(--bg-overlay)',
                    border: '2px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: avatarUploading ? 'wait' : 'pointer',
                    overflow: 'hidden', position: 'relative',
                    transition: 'border-color 0.15s',
                  }}
                  title="Click to upload avatar"
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  {avatarUrl
                    ? <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--accent)', lineHeight: 1 }}>
                        {(form.display_name || profile?.email || '?')[0].toUpperCase()}
                      </span>
                  }
                  {avatarUploading && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#fff', fontSize: '0.7rem', fontFamily: 'var(--font-body)' }}>Uploading…</span>
                    </div>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={uploadAvatar} style={{ display: 'none' }} />
                <div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.2rem' }}>Profile Photo</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Click your avatar to upload.<br />
                    PNG or JPG · max 5 MB · ideal 200×200 px
                  </div>
                  {avatarError && <div style={{ color: '#f87171', fontSize: '0.75rem', fontFamily: 'var(--font-body)', marginTop: '0.25rem' }}>{avatarError}</div>}
                </div>
              </div>

              <div className="field">
                <label className="field-label">Your Name</label>
                <input className="input" value={form.display_name} onChange={set('display_name')} placeholder="Your full name" />
              </div>
              {profile?.role === 'agent' && (
                <div className="field">
                  <label className="field-label">Agency Name</label>
                  <input className="input" value={form.agency_name} onChange={set('agency_name')} placeholder="Your agency / booking company" />
                </div>
              )}
              <div className="field">
                <label className="field-label">Phone</label>
                <input className="input" type="tel" value={form.phone} onChange={set('phone')} />
              </div>
              <div className="field">
                <label className="field-label">Email</label>
                <input className="input" type="email" value={form.email} disabled style={{ opacity: 0.5 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Email cannot be changed here</span>
              </div>
              <div className="field">
                <label className="field-label">Personal Gmail</label>
                <input className="input" type="email" value={form.personal_gmail} onChange={set('personal_gmail')} placeholder="yourname@gmail.com" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Used for advance & thank-you reminder emails</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
              {saved && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#34d399' }}>✓ Saved</span>}
            </div>
          </div>
        </form>

        {/* Change Password */}
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

        {/* Billing — visible to agents and band_admins */}
        {profile && profile.role !== 'superadmin' && profile.role !== 'member' && (
          <div className="card">
            <div className="card-header"><span className="card-title">BILLING</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.88rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Plan</span>
                <span style={{ color: 'var(--text-secondary)' }}>{TIER_LABELS[profile.subscription_tier || 'agent']}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</span>
                <span style={{
                  color: profile.subscription_status === 'active' ? '#34d399'
                       : profile.subscription_status === 'trialing' ? '#fbbf24'
                       : '#f87171',
                }}>
                  {STATUS_LABELS[profile.subscription_status || 'inactive']}
                  {profile.subscription_status === 'trialing' && profile.trial_ends_at && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                      (expires {new Date(profile.trial_ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                    </span>
                  )}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              {profile.stripe_customer_id ? (
                <button className="btn btn-secondary" onClick={openPortal} disabled={portalLoading}>
                  {portalLoading ? 'Opening...' : 'Manage Billing'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => router.push('/pricing')}>
                  Subscribe
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}
