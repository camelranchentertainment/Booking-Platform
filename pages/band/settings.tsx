import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/router';
import { useLookup } from '../../lib/hooks/useLookup';

type BandForm = {
  act_name: string; genre: string; bio: string;
  website: string; instagram: string; spotify: string; member_count: string;
};

export default function BandSettings() {
  const router = useRouter();
  const { values: genres } = useLookup('genre');
  const [act, setAct]       = useState<any>(null);
  const [form, setForm]     = useState<BandForm>({ act_name: '', genre: '', bio: '', website: '', instagram: '', spotify: '', member_count: '1' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: acts } = await supabase.from('acts').select('*').eq('owner_id', user.id).eq('is_active', true).limit(1);
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
    setLoading(false);
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

  if (loading) return <AppShell requireRole="act_admin"><div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>Loading…</div></AppShell>;

  if (!act) return (
    <AppShell requireRole="act_admin">
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>NO BAND PROFILE</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Your account isn't connected to a band yet.</p>
      </div>
    </AppShell>
  );

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Band Settings</h1>
          <div className="page-sub">{act.act_name}</div>
        </div>
        <button className="btn btn-secondary" onClick={() => router.back()}>← Back</button>
      </div>

      <div style={{ maxWidth: 640 }}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Identity */}
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
                    {genres.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
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

          {/* Online presence */}
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
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            {saved && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#34d399', letterSpacing: '0.06em' }}>
                ✓ Saved
              </span>
            )}
          </div>
        </form>
      </div>
    </AppShell>
  );
}
