import { useState } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';

export default function NewBand() {
  const router = useRouter();
  const [form, setForm] = useState({ act_name: '', genre: '', bio: '', website: '', instagram: '', spotify: '' });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Not authenticated'); setSaving(false); return; }

    const { data, error: err } = await supabase.from('acts').insert({
      agent_id: user.id,
      act_name: form.act_name,
      genre:    form.genre || null,
      bio:      form.bio   || null,
      website:  form.website  || null,
      instagram: form.instagram || null,
      spotify:  form.spotify || null,
    }).select().single();

    if (err) { setError(err.message); setSaving(false); return; }
    router.push(`/acts/${data.id}`);
  };

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">New Band</h1>
          <div className="page-sub">Add to your roster</div>
        </div>
      </div>

      <div style={{ maxWidth: 600 }}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card">
            <div className="card-header"><span className="card-title">BAND INFO</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="field">
                <label className="field-label">Band Name *</label>
                <input className="input" value={form.act_name} onChange={set('act_name')} placeholder="The Band Name" required autoFocus />
              </div>
              <div className="field">
                <label className="field-label">Genre</label>
                <input className="input" value={form.genre} onChange={set('genre')} placeholder="Country, Rock, Americana..." />
              </div>
              <div className="field">
                <label className="field-label">Bio</label>
                <textarea className="textarea" value={form.bio} onChange={set('bio')} placeholder="Short artist bio for pitching to venues..." rows={4} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">LINKS</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="field">
                <label className="field-label">Website</label>
                <input className="input" value={form.website} onChange={set('website')} placeholder="https://..." />
              </div>
              <div className="field">
                <label className="field-label">Instagram</label>
                <input className="input" value={form.instagram} onChange={set('instagram')} placeholder="@handle" />
              </div>
              <div className="field">
                <label className="field-label">Spotify</label>
                <input className="input" value={form.spotify} onChange={set('spotify')} placeholder="Spotify artist URL" />
              </div>
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.75rem', color: '#f87171', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" onClick={() => router.back()} className="btn btn-secondary">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Create Band'}</button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
