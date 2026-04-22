import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../lib/types';

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

function GoogleMapsGuide() {
  const [open, setOpen] = useState(false);

  const STEPS = [
    {
      num: '1', title: 'Create or open a Google Cloud project',
      body: 'Go to console.cloud.google.com → select or create a project for Camel Ranch Booking.',
      link: { label: 'console.cloud.google.com →', href: 'https://console.cloud.google.com' },
    },
    {
      num: '2', title: 'Enable the required APIs',
      body: 'In the left menu go to APIs & Services → Library and enable all three of these:',
      bullets: ['Maps JavaScript API', 'Places API', 'Places API (New)'],
    },
    {
      num: '3', title: 'Create an API key',
      body: 'Go to APIs & Services → Credentials → Create Credentials → API Key. Copy the key.',
      note: 'Recommended: restrict the key to your domain (HTTP referrers: camelranchbooking.com/*) so it cannot be abused if exposed.',
    },
    {
      num: '4', title: 'Add the key to your environment',
      body: 'In Vercel: Project → Settings → Environment Variables → add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = your key. Also add it to .env.local for local development. Redeploy after saving.',
    },
  ];

  const row = (label: string, val: string) => (
    <div style={{ display: 'flex', gap: '0.75rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)', minWidth: 100 }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{val}</span>
    </div>
  );

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1rem' }}>🗺</span>
          <span className="card-title">GOOGLE MAPS SETUP</span>
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: '0.72rem', padding: '0.15rem 0.5rem',
            borderRadius: '3px', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', letterSpacing: '0.06em',
          }}>
            {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY !== 'YOUR_GOOGLE_MAPS_API_KEY'
              ? '✓ Configured' : 'Not configured'}
          </span>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            Google Maps enables two features: <strong>venue address autocomplete</strong> (when adding a venue) and
            <strong> venue prospecting</strong> (searching Google Places for live music venues in any city).
          </p>

          <div style={{ background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Env var name
            </div>
            {row('Variable', 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY')}
            {row('Set in', 'Vercel dashboard → Project → Settings → Env Vars')}
            {row('Also', '.env.local for local dev (never commit this file)')}
          </div>

          {STEPS.map(s => (
            <div key={s.num} style={{ display: 'flex', gap: '0.75rem' }}>
              <div style={{
                flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
                background: '#60a5fa22', border: '1px solid rgba(96,165,250,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700, color: '#60a5fa',
              }}>{s.num}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{s.title}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{s.body}</div>
                {s.bullets && (
                  <ul style={{ margin: '0.35rem 0 0 1rem', padding: 0 }}>
                    {s.bullets.map(b => (
                      <li key={b} style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>{b}</li>
                    ))}
                  </ul>
                )}
                {s.note && (
                  <div style={{ marginTop: '0.35rem', fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#fbbf24', background: 'rgba(251,191,36,0.07)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.6rem' }}>
                    ⚠ {s.note}
                  </div>
                )}
                {s.link && (
                  <a href={s.link.href} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '0.3rem', fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#60a5fa' }}>
                    {s.link.label}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const router = useRouter();
  const [profile, setProfile]   = useState<UserProfile | null>(null);
  const [form, setForm]         = useState({ display_name: '', agency_name: '', phone: '', email: '' });
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  // Billing
  const [portalLoading, setPortalLoading] = useState(false);

  // Email integration (superadmin only)
  const [isSuperAdmin, setIsSuperAdmin]   = useState(false);
  const [emailForm, setEmailForm]         = useState({ resend_api_key: '', resend_from_email: '' });
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [emailSaving, setEmailSaving]     = useState(false);
  const [emailSaved, setEmailSaved]       = useState(false);
  const [emailError, setEmailError]       = useState('');
  const [showKey, setShowKey]             = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle();
    if (data) {
      setProfile(data);
      setForm({ display_name: data.display_name || '', agency_name: data.agency_name || '', phone: data.phone || '', email: data.email || '' });
      if (data.role === 'superadmin') {
        setIsSuperAdmin(true);
        loadEmailSettings();
      }
    }
  };

  const loadEmailSettings = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/platform-settings', {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (!res.ok) return;
    const rows: { key: string; configured: boolean; value?: string }[] = await res.json();
    for (const row of rows) {
      if (row.key === 'resend_api_key')    setApiKeyConfigured(row.configured);
      if (row.key === 'resend_from_email') setEmailForm(f => ({ ...f, resend_from_email: row.value || '' }));
    }
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

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    await supabase.from('user_profiles').update({
      display_name: form.display_name,
      agency_name:  form.agency_name || null,
      phone:        form.phone       || null,
    }).eq('id', profile.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const saveEmailSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailSaving(true);
    setEmailError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const saves: Promise<Response>[] = [];
      if (emailForm.resend_api_key) {
        saves.push(fetch('/api/admin/platform-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ key: 'resend_api_key', value: emailForm.resend_api_key }),
        }));
      }
      saves.push(fetch('/api/admin/platform-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ key: 'resend_from_email', value: emailForm.resend_from_email }),
      }));
      await Promise.all(saves);
      if (emailForm.resend_api_key) setApiKeyConfigured(true);
      setEmailForm(f => ({ ...f, resend_api_key: '' }));
      setEmailSaved(true);
      setTimeout(() => setEmailSaved(false), 3000);
    } catch (err: any) {
      setEmailError(err.message);
    } finally {
      setEmailSaving(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const setEmail = (k: keyof typeof emailForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEmailForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <div className="page-sub">Agent profile &amp; preferences</div>
        </div>
      </div>

      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Profile */}
        <form onSubmit={save}>
          <div className="card">
            <div className="card-header"><span className="card-title">PROFILE</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="field">
                <label className="field-label">Your Name</label>
                <input className="input" value={form.display_name} onChange={set('display_name')} placeholder="Your full name" />
              </div>
              <div className="field">
                <label className="field-label">Agency Name</label>
                <input className="input" value={form.agency_name} onChange={set('agency_name')} placeholder="Your agency / booking company" />
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
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
              {saved && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#34d399' }}>✓ Saved</span>}
            </div>
          </div>
        </form>

        {/* Email integration — superadmin only */}
        {isSuperAdmin && (
          <form onSubmit={saveEmailSettings}>
            <div className="card">
              <div className="card-header"><span className="card-title">EMAIL INTEGRATION</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="field">
                  <label className="field-label">Resend API Key</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      className="input"
                      type={showKey ? 'text' : 'password'}
                      value={emailForm.resend_api_key}
                      onChange={setEmail('resend_api_key')}
                      placeholder={apiKeyConfigured ? '••••••••••••  (leave blank to keep current)' : 're_...'}
                      autoComplete="off"
                    />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowKey(v => !v)} style={{ flexShrink: 0 }}>
                      {showKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {apiKeyConfigured && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#34d399' }}>
                      ✓ API key configured
                    </span>
                  )}
                </div>
                <div className="field">
                  <label className="field-label">From Email Address</label>
                  <input
                    className="input"
                    type="email"
                    value={emailForm.resend_from_email}
                    onChange={setEmail('resend_from_email')}
                    placeholder="booking@yourdomain.com"
                  />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    Must be a domain verified in your Resend account
                  </span>
                </div>
                {emailError && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#ef4444' }}>{emailError}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary" disabled={emailSaving}>{emailSaving ? 'Saving...' : 'Save Email Settings'}</button>
                {emailSaved && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#34d399' }}>✓ Saved</span>}
              </div>
            </div>
          </form>
        )}

        {/* Google Maps setup — superadmin only */}
        {isSuperAdmin && <GoogleMapsGuide />}

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
