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

const STEPS = [
  {
    num: '1',
    title: 'Create a free Resend account',
    body: 'Go to resend.com and sign up for a free account. The free tier allows up to 3,000 emails/month which is plenty to start.',
    link: { label: 'resend.com →', href: 'https://resend.com/signup' },
  },
  {
    num: '2',
    title: 'Add and verify your sending domain',
    body: 'In the Resend dashboard go to Domains → Add Domain. Enter the domain you want to send from (e.g. youragency.com). Resend will give you DNS records (a few TXT and MX entries) to add at your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.). Verification usually takes under 10 minutes.',
    note: 'No custom domain? Resend lets you send from their onboarding address for testing, but a verified domain is required for production.',
  },
  {
    num: '3',
    title: 'Generate an API key',
    body: 'In the Resend dashboard go to API Keys → Create API Key. Name it something like "Camel Ranch Booking". Set the permission to Sending Access. Copy the key — you only see it once.',
  },
  {
    num: '4',
    title: 'Enter your credentials below',
    body: 'Paste your API key and the email address you want to send from (must match your verified domain, e.g. booking@youragency.com). Save and your email tools will be live.',
  },
];

const FAQS = [
  {
    q: 'What does email integration actually do?',
    a: 'It powers the Email tab — letting you send booking pitches, follow-ups, and advance sheets directly from the platform, from your own domain, tracked in one place.',
  },
  {
    q: 'Does my domain need to match exactly?',
    a: 'Yes — the "From" email address must use a domain you have verified inside your Resend account. You can verify multiple domains.',
  },
  {
    q: 'Is Resend free?',
    a: 'Yes. The free tier includes 3,000 emails per month and 100/day. That covers most independent booking operations. Paid plans scale from there.',
  },
  {
    q: 'What if I don\'t want to set this up?',
    a: 'The platform works without email integration. You simply won\'t be able to send outreach directly from the Email tab. Everything else — bookings, tours, calendar — works normally.',
  },
];

function HelpGuide() {
  const [open, setOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div style={{ marginBottom: '1rem' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          background: 'var(--accent-glow)', border: '1px solid var(--neon-border)',
          borderRadius: 'var(--radius-sm)', padding: '0.65rem 1rem',
          cursor: 'pointer', width: '100%', textAlign: 'left',
          color: 'var(--accent)', fontFamily: 'var(--font-body)',
          fontSize: '0.88rem', fontWeight: 600, transition: 'background 0.15s',
        }}
      >
        <span style={{ fontSize: '1rem' }}>{open ? '▾' : '▸'}</span>
        {open ? 'Hide setup guide' : '? How to set up email integration — step by step'}
      </button>

      {open && (
        <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 var(--radius-sm) var(--radius-sm)', padding: '1.25rem', background: 'var(--bg-raised)' }}>

          {/* Intro */}
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: '1.5rem' }}>
            This platform uses <strong style={{ color: 'var(--text-primary)' }}>Resend</strong> to send emails from your own domain.
            Resend is a free email API service — think of it like connecting your agency's email address so pitches and follow-ups
            go out looking like they came from <em>you</em>, not a generic system address.
          </p>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
            {STEPS.map(s => (
              <div key={s.num} style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
                <div style={{
                  flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--accent)', color: '#1A0800',
                  fontFamily: 'var(--font-display)', fontSize: '1rem', letterSpacing: '0.04em',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: 'var(--neon-glow-sm)',
                }}>
                  {s.num}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.92rem', marginBottom: '0.3rem' }}>
                    {s.title}
                  </div>
                  <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {s.body}
                  </div>
                  {s.note && (
                    <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      ℹ {s.note}
                    </div>
                  )}
                  {s.link && (
                    <a href={s.link.href} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '0.35rem', fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 600 }}>
                      {s.link.label}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* FAQ */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Common Questions
            </div>
            {FAQS.map((faq, i) => (
              <div key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    width: '100%', padding: '0.6rem 0',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
                    fontSize: '0.88rem', fontWeight: 600, textAlign: 'left', gap: '0.75rem',
                  }}
                >
                  {faq.q}
                  <span style={{ color: 'var(--accent)', flexShrink: 0, fontSize: '0.9rem' }}>{openFaq === i ? '−' : '+'}</span>
                </button>
                {openFaq === i && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.65, paddingBottom: '0.75rem' }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
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
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Email cannot be changed here</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
              {saved && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: '#34d399' }}>✓ Saved</span>}
            </div>
          </div>
        </form>

        {/* Email integration — help visible to all agents, config for superadmin */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">EMAIL INTEGRATION</span>
            {apiKeyConfigured && isSuperAdmin && (
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#34d399' }}>✓ Configured</span>
            )}
            {!apiKeyConfigured && isSuperAdmin && (
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Not set up</span>
            )}
          </div>

          <HelpGuide />

          {isSuperAdmin ? (
            <form onSubmit={saveEmailSettings}>
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
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: '#34d399' }}>
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
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Must match a domain verified in your Resend account
                  </span>
                </div>
                {emailError && (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: '#ef4444' }}>{emailError}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary" disabled={emailSaving}>{emailSaving ? 'Saving...' : 'Save Email Settings'}</button>
                {emailSaved && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: '#34d399' }}>✓ Saved</span>}
              </div>
            </form>
          ) : (
            <div style={{ padding: '0.85rem 1rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.25rem' }}>Ready to enable email?</strong>
              Follow the guide above to set up your Resend account, then contact your platform administrator to enter the API key and activate outbound email for your account.
            </div>
          )}
        </div>

        {/* Billing — visible to agents and band_admins */}
        {profile && profile.role !== 'superadmin' && profile.role !== 'member' && (
          <div className="card">
            <div className="card-header"><span className="card-title">BILLING</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.88rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Plan</span>
                <span style={{ color: 'var(--text-secondary)' }}>{TIER_LABELS[profile.subscription_tier || 'agent']}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</span>
                <span style={{
                  color: profile.subscription_status === 'active' ? '#34d399'
                       : profile.subscription_status === 'trialing' ? '#fbbf24'
                       : '#f87171',
                }}>
                  {STATUS_LABELS[profile.subscription_status || 'inactive']}
                  {profile.subscription_status === 'trialing' && profile.trial_ends_at && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
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
