import { useState, useEffect } from 'react';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../lib/types';

export default function Settings() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm]       = useState({ display_name: '', agency_name: '', phone: '', email: '' });
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle();
      if (data) {
        setProfile(data);
        setForm({ display_name: data.display_name || '', agency_name: data.agency_name || '', phone: data.phone || '', email: data.email || '' });
      }
    };
    load();
  }, []);

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

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <div className="page-sub">Agent profile & preferences</div>
        </div>
      </div>

      <div style={{ maxWidth: 560 }}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">EMAIL INTEGRATION</span></div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <p>Outbound email is sent via <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>Resend</span> using your custom domain.</p>
              <p style={{ marginTop: '0.5rem' }}>Configure your Resend API key and custom domain in your <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>.env.local</code> file:</p>
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', marginTop: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                RESEND_API_KEY=re_...<br />
                RESEND_FROM_EMAIL=booking@mail.camelranchbooking.com
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
            {saved && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#34d399' }}>✓ Saved</span>}
          </div>
        </form>
      </div>
    </AppShell>
  );
}
