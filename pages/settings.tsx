import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../lib/types';
import PlatformSetup from '../components/settings/PlatformSetup';

const TIER_LABELS: Record<string, string> = {
  band_admin: 'Band Admin — $18 / month',
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

  const [portalLoading, setPortalLoading]   = useState(false);
  const [isSuperAdmin, setIsSuperAdmin]     = useState(false);
  const [calSettings, setCalSettings]       = useState<any>(null);
  const [calConnecting, setCalConnecting]   = useState(false);
  const [calMsg, setCalMsg]                 = useState('');

  const [myAct, setMyAct]       = useState<any>(null);
  const [actForm, setActForm]   = useState({
    act_name: '', genre: '', bio: '', website: '',
    instagram: '', facebook: '', spotify: '', contact_email: '',
    contact_phone: '', home_city: '', home_state: '', username: '', epk_link: '',
  });
  const [actSaving, setActSaving] = useState(false);
  const [actSaved, setActSaved]   = useState(false);

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

      const params = new URLSearchParams(window.location.search);
      if (params.get('calendar_connected')) setCalMsg('Google Calendar connected!');
      if (params.get('calendar_error')) setCalMsg(`Connection error: ${params.get('calendar_error')}`);

      if (data.role === 'band_admin' || data.role === 'superadmin') {
        let act: any = null;
        const { data: owned } = await supabase.from('acts').select('*').eq('owner_id', user.id).eq('is_active', true).limit(1).maybeSingle();
        if (owned) {
          act = owned;
        } else if (data.act_id) {
          const { data: linked } = await supabase.from('acts').select('*').eq('id', data.act_id).maybeSingle();
          act = linked;
        }
        if (act) {
          setMyAct(act);
          setActForm({
            act_name:      act.act_name      || '',
            genre:         act.genre         || '',
            bio:           act.bio           || '',
            website:       act.website       || '',
            instagram:     act.instagram     || '',
            facebook:      act.facebook      || '',
            spotify:       act.spotify       || '',
            contact_email: act.contact_email || '',
            contact_phone: act.contact_phone || '',
            home_city:     act.home_city     || '',
            home_state:    act.home_state    || '',
            username:      act.username      || '',
            epk_link:      act.epk_link      || '',
          });
          setCalSettings(act.google_refresh_token ? {
            calendar_type: act.calendar_type || 'google',
            is_active:     act.sync_enabled !== false,
            last_synced_at: act.last_synced_at,
          } : null);
        }
      }
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

  const saveAct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myAct) return;
    setActSaving(true);
    await supabase.from('acts').update({
      act_name:      actForm.act_name      || null,
      genre:         actForm.genre         || null,
      bio:           actForm.bio           || null,
      website:       actForm.website       || null,
      instagram:     actForm.instagram     || null,
      facebook:      actForm.facebook      || null,
      spotify:       actForm.spotify       || null,
      contact_email: actForm.contact_email || null,
      contact_phone: actForm.contact_phone || null,
      home_city:     actForm.home_city     || null,
      home_state:    actForm.home_state    || null,
      username:      actForm.username      || null,
      epk_link:      actForm.epk_link      || null,
    }).eq('id', myAct.id);
    setActSaving(false);
    setActSaved(true);
    setTimeout(() => setActSaved(false), 3000);
  };

  const setAct = (k: keyof typeof actForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setActForm(f => ({ ...f, [k]: e.target.value }));

  const connectGoogleCalendar = async () => {
    setCalConnecting(true);
    const { data: { session } } = await supabase.auth.getSession();
    window.location.href = `/api/auth/google/connect?token=${session?.access_token}`;
  };

  const disconnectGoogleCalendar = async () => {
    if (myAct) {
      await supabase.from('acts').update({
        google_refresh_token: null,
        google_access_token:  null,
        sync_enabled:         false,
      }).eq('id', myAct.id);
    }
    setCalSettings(null);
    setCalMsg('Google Calendar disconnected.');
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const sectionLabelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.14em',
    textTransform: 'uppercase', color: 'var(--text-muted)',
    marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)',
  };

  return (
    <AppShell requireRole={['band_admin', 'superadmin', 'member']}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <div className="page-sub">
            {isSuperAdmin ? 'Platform configuration & profile'
              : profile?.role === 'member' ? 'Account & password'
              : 'Agent profile & preferences'}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

        {/* Platform Setup — superadmin only */}
        {isSuperAdmin && <PlatformSetup />}

        {/* ── ACCOUNT ── */}
        <div>
          <div style={sectionLabelStyle}>Account</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

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
                        overflow: 'hidden', position: 'relative', transition: 'border-color 0.15s',
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
                        Click your avatar to upload.<br />PNG or JPG · max 5 MB · ideal 200×200 px
                      </div>
                      {avatarError && <div style={{ color: '#f87171', fontSize: '0.75rem', fontFamily: 'var(--font-body)', marginTop: '0.25rem' }}>{avatarError}</div>}
                    </div>
                  </div>
                  <div className="field">
                    <label className="field-label">Your Name</label>
                    <input className="input" value={form.display_name} onChange={set('display_name')} placeholder="Your full name" />
                  </div>
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
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>Used for advance &amp; thank-you reminder emails</span>
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
                    <input className="input" type="password" value={pwForm.newPassword}
                      onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                      placeholder="Min. 8 characters" autoComplete="new-password" />
                  </div>
                  <div className="field">
                    <label className="field-label">Confirm New Password</label>
                    <input className="input" type="password" value={pwForm.confirmPassword}
                      onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                      placeholder="Repeat password" autoComplete="new-password" />
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
        </div>

        {/* ── BAND PROFILE ── */}
        {myAct && (
          <div>
            <div style={sectionLabelStyle}>Band Profile</div>
            <form onSubmit={saveAct}>
              <div className="card">
                <div className="card-header"><span className="card-title">ACT DETAILS</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="field">
                      <label className="field-label">Act Name</label>
                      <input className="input" value={actForm.act_name} onChange={setAct('act_name')} placeholder="Your act name" />
                    </div>
                    <div className="field">
                      <label className="field-label">Genre</label>
                      <input className="input" value={actForm.genre} onChange={setAct('genre')} placeholder="e.g. Country, Rock" />
                    </div>
                    <div className="field">
                      <label className="field-label">Home City</label>
                      <input className="input" value={actForm.home_city} onChange={setAct('home_city')} placeholder="Nashville" />
                    </div>
                    <div className="field">
                      <label className="field-label">Home State</label>
                      <input className="input" value={actForm.home_state} onChange={setAct('home_state')} placeholder="TN" maxLength={2} />
                    </div>
                    <div className="field">
                      <label className="field-label">Contact Email</label>
                      <input className="input" type="email" value={actForm.contact_email} onChange={setAct('contact_email')} placeholder="booking@yourband.com" />
                    </div>
                    <div className="field">
                      <label className="field-label">Contact Phone</label>
                      <input className="input" type="tel" value={actForm.contact_phone} onChange={setAct('contact_phone')} />
                    </div>
                  </div>
                  <div className="field">
                    <label className="field-label">Bio</label>
                    <textarea className="input" value={actForm.bio} onChange={setAct('bio')} placeholder="Short act bio for email pitches…" rows={3} style={{ resize: 'vertical', minHeight: 72 }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="field">
                      <label className="field-label">Website</label>
                      <input className="input" value={actForm.website} onChange={setAct('website')} placeholder="https://yourband.com" />
                    </div>
                    <div className="field">
                      <label className="field-label">EPK Link</label>
                      <input className="input" value={actForm.epk_link} onChange={setAct('epk_link')} placeholder="Electronic press kit URL" />
                    </div>
                    <div className="field">
                      <label className="field-label">Instagram</label>
                      <input className="input" value={actForm.instagram} onChange={setAct('instagram')} placeholder="@handle" />
                    </div>
                    <div className="field">
                      <label className="field-label">Facebook</label>
                      <input className="input" value={actForm.facebook} onChange={setAct('facebook')} placeholder="facebook.com/yourpage" />
                    </div>
                    <div className="field">
                      <label className="field-label">Spotify</label>
                      <input className="input" value={actForm.spotify} onChange={setAct('spotify')} placeholder="Spotify artist URL" />
                    </div>
                    <div className="field">
                      <label className="field-label">Username / Slug</label>
                      <input className="input" value={actForm.username} onChange={setAct('username')} placeholder="your-act-slug" />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={actSaving}>{actSaving ? 'Saving...' : 'Save Band Profile'}</button>
                  {actSaved && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#34d399' }}>✓ Saved</span>}
                </div>
              </div>
            </form>
          </div>
        )}

        {/* ── PLAN & BILLING ── */}
        {profile && profile.role !== 'superadmin' && profile.role !== 'member' && (
          <div>
            <div style={sectionLabelStyle}>Plan &amp; Billing</div>
            <div className="card">
              <div className="card-header"><span className="card-title">BILLING</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.88rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Plan</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{TIER_LABELS[profile.subscription_tier || 'band_admin'] || '—'}</span>
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
                  <button className="btn btn-primary" onClick={() => router.push('/pricing')}>Subscribe</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── INTEGRATIONS ── */}
        {(profile?.role === 'band_admin' || profile?.role === 'superadmin') && (
          <div>
            <div style={sectionLabelStyle}>Integrations</div>
            <div className="card">
              <div className="card-header"><span className="card-title">GOOGLE CALENDAR</span></div>
              {calMsg && (
                <div style={{
                  marginBottom: '0.75rem', padding: '0.5rem 0.75rem',
                  background: calMsg.includes('error') ? 'rgba(248,113,113,0.1)' : 'rgba(52,211,153,0.1)',
                  border: `1px solid ${calMsg.includes('error') ? 'rgba(248,113,113,0.3)' : 'rgba(52,211,153,0.3)'}`,
                  borderRadius: 'var(--radius-sm)', fontSize: '0.82rem',
                  color: calMsg.includes('error') ? '#f87171' : '#34d399',
                  fontFamily: 'var(--font-body)',
                }}>
                  {calMsg}
                </div>
              )}
              {calSettings?.calendar_type === 'google' && calSettings?.is_active ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: '#34d399' }}>Connected</span>
                    {calSettings.last_synced_at && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        · synced {new Date(calSettings.last_synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', color: '#f87171' }} onClick={disconnectGoogleCalendar}>
                    Disconnect Google Calendar
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                    Connect Google Calendar to sync your booked shows and see them alongside personal events.
                  </div>
                  <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={connectGoogleCalendar} disabled={calConnecting}>
                    {calConnecting ? 'Redirecting…' : 'Connect Google Calendar'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}
