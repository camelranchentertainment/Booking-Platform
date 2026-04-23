import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';

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

    // Dual-lookup: owner_id first, then user_profiles.act_id fallback
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
      .eq('act_id', act.id)
      .order('start_date', { ascending: false });

    setTours(data || []);
    setLoading(false);
  };

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actId) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase.from('tours').insert({
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

  const STATUS_COLOR: Record<string, string> = {
    active: '#34d399', planning: '#818cf8', completed: '#6b7280', cancelled: '#ef4444',
  };

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tours</h1>
          <div className="page-sub">{tours.length} tour{tours.length !== 1 ? 's' : ''}</div>
        </div>
        {actId && (
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Tour</button>
        )}
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>Loading...</div>}

      {!loading && !actId && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Set up your band profile first before creating tours.</div>
        </div>
      )}

      {!loading && actId && tours.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>No Tours Yet</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Plan a run of shows under a single tour to keep everything organized.</div>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>Plan Your First Tour</button>
        </div>
      )}

      {!loading && tours.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {tours.map((t: any) => (
            <div key={t.id} className="card" style={{ cursor: 'pointer' }} onClick={() => router.push(`/tours/${t.id}`)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>{t.name}</div>
                  {(t.start_date || t.end_date) && (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      {t.start_date ? new Date(t.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '?'}
                      {' → '}
                      {t.end_date ? new Date(t.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{
                    fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                    color: STATUS_COLOR[t.status] || 'var(--text-muted)',
                    background: `${STATUS_COLOR[t.status] || '#6b7280'}18`,
                    border: `1px solid ${STATUS_COLOR[t.status] || '#6b7280'}40`,
                    padding: '0.2rem 0.6rem', borderRadius: '3px',
                  }}>{t.status}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {t.tour_venues?.[0]?.count ?? 0} venue{(t.tour_venues?.[0]?.count ?? 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              {t.description && (
                <p style={{ marginTop: '0.5rem', fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">New Tour</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}>✕</button>
            </div>
            <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="field">
                <label className="field-label">Tour Name *</label>
                <input className="input" value={form.name} onChange={set('name')} placeholder="Fall 2026 Run" required autoFocus />
              </div>
              <div className="grid-2">
                <div className="field">
                  <label className="field-label">Start Date</label>
                  <input className="input" type="date" value={form.start_date} onChange={set('start_date')} />
                </div>
                <div className="field">
                  <label className="field-label">End Date</label>
                  <input className="input" type="date" value={form.end_date} onChange={set('end_date')} />
                </div>
              </div>
              <div className="field">
                <label className="field-label">Description</label>
                <textarea className="input" value={form.description} onChange={set('description')} rows={3} placeholder="Optional notes about this tour..." style={{ resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Tour'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
