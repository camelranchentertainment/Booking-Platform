import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
type ActPick = { id: string; act_name: string };
import Link from 'next/link';

export default function ToursPage() {
  const router = useRouter();
  const [tours, setTours]   = useState<any[]>([]);
  const [acts, setActs]     = useState<ActPick[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm]     = useState({ name: '', act_id: '', description: '', start_date: '', end_date: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get all acts this agent manages: directly (agent_id) or via active links
    const [directActsRes, linkedLinksRes] = await Promise.all([
      supabase.from('acts').select('id, act_name').eq('agent_id', user.id).order('act_name'),
      supabase.from('agent_act_links').select('act_id, act:acts(id, act_name)').eq('agent_id', user.id).eq('status', 'active'),
    ]);

    const directActs = directActsRes.data || [];
    const linkedActs = (linkedLinksRes.data || []).map((l: any) => l.act).filter(Boolean);

    const actsMap = new Map<string, ActPick>();
    for (const a of directActs) actsMap.set(a.id, a);
    for (const a of linkedActs) if (!actsMap.has(a.id)) actsMap.set(a.id, a);
    const allActs = Array.from(actsMap.values()).sort((a, b) => a.act_name.localeCompare(b.act_name));
    setActs(allActs);

    // Tours: created by this user OR belonging to any managed act
    const managedIds = allActs.map(a => a.id);
    let toursQuery = supabase.from('tours').select('*, act:acts(act_name)').order('created_at', { ascending: false });
    if (managedIds.length > 0) {
      toursQuery = toursQuery.or(`created_by.eq.${user.id},act_id.in.(${managedIds.join(',')})`);
    } else {
      toursQuery = toursQuery.eq('created_by', user.id);
    }
    const { data: toursData } = await toursQuery;
    setTours(toursData || []);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.act_id) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase.from('tours').insert({
      created_by: user!.id,
      act_id:      form.act_id,
      name:        form.name,
      description: form.description || null,
      start_date:  form.start_date  || null,
      end_date:    form.end_date    || null,
      status:      'planning',
    }).select().single();
    setShowNew(false);
    setForm({ name: '', act_id: '', description: '', start_date: '', end_date: '' });
    await loadAll();
    if (data) router.push(`/tours/${data.id}`);
    setSaving(false);
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const STATUS_BADGE: Record<string, string> = {
    planning: '#818cf8', active: '#34d399', completed: '#9ca3af', cancelled: '#6b7280',
  };

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tours</h1>
          <div className="page-sub">Routing & run management</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Tour</button>
      </div>

      {tours.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>NO TOURS YET</div>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>Plan Your First Tour</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {tours.map((t: any) => (
            <div key={t.id} className="card" style={{ cursor: 'pointer' }} onClick={() => router.push(`/tours/${t.id}`)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>{t.name}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t.act?.act_name}</div>
                </div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: STATUS_BADGE[t.status] || 'var(--text-muted)', padding: '0.2rem 0.5rem', border: `1px solid ${STATUS_BADGE[t.status] || 'var(--border)'}`, borderRadius: 'var(--radius-sm)' }}>
                  {t.status}
                </span>
              </div>
              {(t.start_date || t.end_date) && (
                <div style={{ marginTop: '0.5rem', fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {t.start_date ? new Date(t.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '?'}
                  {' → '}
                  {t.end_date ? new Date(t.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}
                </div>
              )}
              {t.description && <p style={{ marginTop: '0.5rem', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>{t.description}</p>}
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
              <div className="field"><label className="field-label">Tour Name *</label><input className="input" value={form.name} onChange={set('name')} required autoFocus /></div>
              <div className="field">
                <label className="field-label">Band *</label>
                <select className="select" value={form.act_id} onChange={set('act_id')} required>
                  <option value="">Select band...</option>
                  {acts.map(a => <option key={a.id} value={a.id}>{a.act_name}</option>)}
                </select>
              </div>
              <div className="grid-2">
                <div className="field"><label className="field-label">Start Date</label><input className="input" type="date" value={form.start_date} onChange={set('start_date')} /></div>
                <div className="field"><label className="field-label">End Date</label><input className="input" type="date" value={form.end_date} onChange={set('end_date')} /></div>
              </div>
              <div className="field"><label className="field-label">Description</label><textarea className="textarea" value={form.description} onChange={set('description')} /></div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !form.act_id}>{saving ? 'Saving...' : 'Create Tour'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
