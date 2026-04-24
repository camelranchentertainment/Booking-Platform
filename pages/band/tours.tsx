import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';

const STATUS_COLOR: Record<string, string> = {
  active:    '#34d399',
  planning:  '#818cf8',
  completed: '#6b7280',
  cancelled: '#ef4444',
};

export default function BandTours() {
  const router = useRouter();
  const [tours, setTours]     = useState<any[]>([]);
  const [actId, setActId]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState({ name: '', description: '', start_date: '', end_date: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let { data: acts } = await supabase.from('acts').select('id').eq('owner_id', user.id).eq('is_active', true).limit(1);
    if (!acts?.length) {
      const { data: prof } = await supabase.from('user_profiles').select('act_id').eq('id', user.id).single();
      if (prof?.act_id) {
        const { data: linked } = await supabase.from('acts').select('id').eq('id', prof.act_id).eq('is_active', true).limit(1);
        acts = linked;
      }
    }
    const act = acts?.[0];
    if (!act) { setLoading(false); return; }
    setActId(act.id);

    const { data } = await supabase
      .from('tours')
      .select('id, name, status, start_date, end_date, description, tour_venues(count)')
      .or(`act_id.eq.${act.id},created_by.eq.${user.id}`)
      .order('start_date', { ascending: false });

    setTours(data || []);
    setLoading(false);
  };

  const field = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actId) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('tours').insert({
      created_by:  user!.id,
      act_id:      actId,
      name:        form.name,
      description: form.description || null,
      start_date:  form.start_date  || null,
      end_date:    form.end_date    || null,
      status:      'planning',
    }).select().single();
    setShowNew(false);
    setForm({ name: '', description: '', start_date: '', end_date: '' });
    await load();
    setSaving(false);
  };

  // Derived counts
  const active   = tours.filter(t => t.status === 'active').length;
  const planning = tours.filter(t => t.status === 'planning').length;

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tours</h1>
          <div className="page-sub">
            {tours.length} total{active > 0 ? ` · ${active} active` : ''}{planning > 0 ? ` · ${planning} planning` : ''}
          </div>
        </div>
        {actId && (
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Tour</button>
        )}
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}
        </div>
      )}

      {!loading && !actId && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>NO BAND YET</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>Set up your band profile before creating tours.</div>
        </div>
      )}

      {!loading && actId && tours.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3.5rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>⟴</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--text-muted)', marginBottom: '0.75rem', letterSpacing: '0.06em' }}>NO TOURS YET</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1.75rem', lineHeight: 1.7, maxWidth: 340, margin: '0 auto 1.75rem' }}>
            Group a run of shows under a single tour to track dates, venues, and the full picture in one place.
          </div>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>Plan Your First Tour</button>
        </div>
      )}

      {!loading && tours.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {tours.map((t: any) => {
            const color       = STATUS_COLOR[t.status] || 'var(--text-muted)';
            const venueCount  = t.tour_venues?.[0]?.count ?? 0;
            return (
              <div
                key={t.id}
                className="card"
                onClick={() => router.push(`/tours/${t.id}`)}
                style={{ cursor: 'pointer', borderLeft: `3px solid ${color}`, paddingLeft: '1.1rem' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', letterSpacing: '0.04em', color: 'var(--text-primary)', marginBottom: '0.15rem' }}>{t.name}</div>
                    {(t.start_date || t.end_date) && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.1rem' }}>
                        {t.start_date ? new Date(t.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '?'}
                        {' → '}
                        {t.end_date ? new Date(t.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}
                      </div>
                    )}
                    {t.description && (
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '0.35rem' }}>{t.description}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem', flexShrink: 0 }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.1em',
                      color: color,
                      background: `${color}18`,
                      border: `1px solid ${color}40`,
                      padding: '0.2rem 0.6rem',
                    }}>{t.status}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {venueCount} venue{venueCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew && (
        <div className="modal-backdrop" onClick={() => setShowNew(false)}>
          <div className="modal" style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">New Tour</h3>
              <button className="modal-close" onClick={() => setShowNew(false)}>✕</button>
            </div>
            <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="field">
                <label className="field-label">Tour Name *</label>
                <input className="input" value={form.name} onChange={field('name')} placeholder="Fall 2026 Run" required autoFocus />
              </div>
              <div className="grid-2">
                <div className="field">
                  <label className="field-label">Start Date</label>
                  <input className="input" type="date" value={form.start_date} onChange={field('start_date')} />
                </div>
                <div className="field">
                  <label className="field-label">End Date</label>
                  <input className="input" type="date" value={form.end_date} onChange={field('end_date')} />
                </div>
              </div>
              <div className="field">
                <label className="field-label">Description</label>
                <textarea className="input" value={form.description} onChange={field('description')} rows={3} placeholder="Optional notes about this tour…" style={{ resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !form.name.trim()}>
                  {saving ? 'Creating…' : 'Create Tour'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
