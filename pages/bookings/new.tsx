import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { BookingStatus } from '../../lib/types';
type ActPick   = { id: string; act_name: string };
type VenuePick = { id: string; name: string; city: string; state: string };
type TourPick  = { id: string; name: string; act_id: string };

export default function NewBooking() {
  const router = useRouter();
  const [acts, setActs]   = useState<ActPick[]>([]);
  const [venues, setVenues] = useState<VenuePick[]>([]);
  const [tours, setTours] = useState<TourPick[]>([]);
  const [form, setForm]   = useState({
    act_id: '', venue_id: '', tour_id: '', status: 'pitch' as BookingStatus,
    show_date: '', fee: '', deal_notes: '', internal_notes: '',
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [actsRes, venuesRes, toursRes] = await Promise.all([
        supabase.from('acts').select('id, act_name').eq('is_active', true).eq('agent_id', user.id).order('act_name'),
        supabase.from('venues').select('id, name, city, state').order('name'),
        supabase.from('tours').select('id, name, act_id').eq('status', 'active').order('name'),
      ]);
      setActs(actsRes.data || []);
      setVenues(venuesRes.data || []);
      setTours(toursRes.data || []);
      if (router.query.act) setForm(f => ({ ...f, act_id: router.query.act as string }));
    };
    load();
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.act_id) { setError('Please select an act'); return; }
    setError(''); setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error: err } = await supabase.from('bookings').insert({
      created_by: user!.id,
      act_id:     form.act_id,
      venue_id:   form.venue_id || null,
      tour_id:    form.tour_id  || null,
      status:     form.status,
      show_date:  form.show_date || null,
      fee:        form.fee ? Number(form.fee) : null,
      deal_notes: form.deal_notes || null,
      internal_notes: form.internal_notes || null,
      pitched_at: form.status === 'pitch' ? new Date().toISOString() : null,
    }).select().single();

    if (err) { setError(err.message); setSaving(false); return; }

    // Fire auto-draft in background if venue was selected
    if (data?.id && form.venue_id) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        fetch('/api/email/auto-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ bookingId: data.id }),
        });
      });
    }

    router.push(`/bookings/${data.id}`);
  };

  const filteredTours = form.act_id ? tours.filter(t => t.act_id === form.act_id) : tours;

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">New Booking</h1>
          <div className="page-sub">Add to pipeline</div>
        </div>
      </div>

      <div style={{ maxWidth: 640 }}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card">
            <div className="card-header"><span className="card-title">BOOKING INFO</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="grid-2">
                <div className="field">
                  <label className="field-label">Band *</label>
                  <select className="select" value={form.act_id} onChange={set('act_id')} required>
                    <option value="">Select band...</option>
                    {acts.map(a => <option key={a.id} value={a.id}>{a.act_name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Status</label>
                  <select className="select" value={form.status} onChange={set('status')}>
                    <option value="pitch">Pitch</option>
                    <option value="followup">Follow-up</option>
                    <option value="negotiation">Negotiation</option>
                    <option value="hold">Hold</option>
                    <option value="contract">Contract</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="advancing">Advancing</option>
                  </select>
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label className="field-label">Venue</label>
                  <select className="select" value={form.venue_id} onChange={set('venue_id')}>
                    <option value="">No venue yet...</option>
                    {venues.map(v => <option key={v.id} value={v.id}>{v.name} — {v.city}, {v.state}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Tour</label>
                  <select className="select" value={form.tour_id} onChange={set('tour_id')}>
                    <option value="">No tour</option>
                    {filteredTours.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label className="field-label">Show Date</label>
                  <input className="input" type="date" value={form.show_date} onChange={set('show_date')} />
                </div>
                <div className="field">
                  <label className="field-label">Fee ($)</label>
                  <input className="input" type="number" value={form.fee} onChange={set('fee')} placeholder="0.00" />
                </div>
              </div>

              <div className="field">
                <label className="field-label">Deal Notes</label>
                <textarea className="textarea" value={form.deal_notes} onChange={set('deal_notes')} placeholder="Deal structure, splits, guarantees..." />
              </div>

              <div className="field">
                <label className="field-label">Internal Notes</label>
                <textarea className="textarea" value={form.internal_notes} onChange={set('internal_notes')} placeholder="Internal notes (not visible to band)..." />
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
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Create Booking'}</button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
