import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { BookingStatus, BOOKING_STATUS_LABELS, BOOKING_STATUS_ORDER } from '../../lib/types';
import Link from 'next/link';
import EmailComposer from '../../components/email/EmailComposer';

type ActPick   = { id: string; act_name: string };
type VenuePick = { id: string; name: string; city: string; state: string };
type TourPick  = { id: string; name: string; act_id: string };

export default function BookingDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [booking, setBooking] = useState<any>(null);
  const [acts, setActs]     = useState<ActPick[]>([]);
  const [venues, setVenues] = useState<VenuePick[]>([]);
  const [tours, setTours]   = useState<TourPick[]>([]);
  const [edit, setEdit]           = useState(false);
  const [form, setForm]           = useState<any>({});
  const [saving, setSaving]       = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  useEffect(() => { if (id) loadAll(); }, [id]);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [bookingRes, actsRes, venuesRes, toursRes] = await Promise.all([
      supabase.from('bookings').select(`
        *, act:acts(*), venue:venues(*), tour:tours(id, name), contact:contacts(*)
      `).eq('id', id).single(),
      supabase.from('acts').select('id, act_name').eq('agent_id', user.id).order('act_name'),
      supabase.from('venues').select('id, name, city, state').order('name'),
      supabase.from('tours').select('id, name, act_id').eq('created_by', user.id).order('name'),
    ]);
    if (bookingRes.data) { setBooking(bookingRes.data); setForm(bookingRes.data); }
    setActs(actsRes.data || []);
    setVenues(venuesRes.data || []);
    setTours(toursRes.data || []);
  };

  const setStatus = async (newStatus: BookingStatus) => {
    await supabase.from('bookings').update({ status: newStatus }).eq('id', id);
    setBooking((b: any) => ({ ...b, status: newStatus }));
  };

  const saveEdit = async () => {
    setSaving(true);
    await supabase.from('bookings').update({
      act_id:     form.act_id,
      venue_id:   form.venue_id || null,
      tour_id:    form.tour_id  || null,
      status:     form.status,
      show_date:  form.show_date || null,
      load_in_time: form.load_in_time || null,
      set_time:   form.set_time || null,
      set_length_min: form.set_length_min ? Number(form.set_length_min) : null,
      fee:        form.fee ? Number(form.fee) : null,
      deal_notes: form.deal_notes || null,
      internal_notes: form.internal_notes || null,
      advance_notes:  form.advance_notes  || null,
      contract_url:   form.contract_url   || null,
      deposit_paid:   form.deposit_paid,
      deposit_amount: form.deposit_amount ? Number(form.deposit_amount) : null,
    }).eq('id', id);
    await loadAll();
    setEdit(false);
    setSaving(false);
  };

  const deleteBooking = async () => {
    if (!confirm('Delete this booking? This cannot be undone.')) return;
    await supabase.from('bookings').delete().eq('id', id);
    router.push('/bookings');
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f: any) => ({ ...f, [k]: e.target.value }));

  if (!booking) return <AppShell requireRole="agent"><div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>Loading...</div></AppShell>;

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            {booking.act?.act_name || '—'}
          </div>
          <h1 className="page-title">{booking.venue?.name || 'No Venue'}</h1>
          {booking.venue?.city && <div className="page-sub">{booking.venue.city}, {booking.venue.state}</div>}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className={`badge badge-${booking.status}`}>{BOOKING_STATUS_LABELS[booking.status as BookingStatus]}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowEmail(true)}>✉ Email</button>
          <button className="btn btn-secondary" onClick={() => setEdit(!edit)}>Edit</button>
          <button className="btn btn-danger btn-sm" onClick={deleteBooking}>Delete</button>
        </div>
      </div>

      {/* Status pipeline */}
      <div className="card mb-6">
        <div className="card-header"><span className="card-title">STATUS PIPELINE</span></div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {BOOKING_STATUS_ORDER.map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`btn btn-sm`}
              style={{
                background: booking.status === s ? `var(--status-${s})` : 'var(--bg-overlay)',
                color: booking.status === s ? '#000' : 'var(--text-muted)',
                borderColor: booking.status === s ? `var(--status-${s})` : 'var(--border)',
                fontFamily: 'var(--font-body)', fontSize: '0.78rem', letterSpacing: '0.1em',
              }}>
              {BOOKING_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {edit ? (
        <div className="card" style={{ maxWidth: 700 }}>
          <div className="card-header"><span className="card-title">EDIT BOOKING</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="grid-2">
              <div className="field">
                <label className="field-label">Band</label>
                <select className="select" value={form.act_id || ''} onChange={set('act_id')}>
                  {acts.map(a => <option key={a.id} value={a.id}>{a.act_name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Venue</label>
                <select className="select" value={form.venue_id || ''} onChange={set('venue_id')}>
                  <option value="">No venue</option>
                  {venues.map(v => <option key={v.id} value={v.id}>{v.name} — {v.city}, {v.state}</option>)}
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label className="field-label">Show Date</label>
                <input className="input" type="date" value={form.show_date?.substring(0,10) || ''} onChange={set('show_date')} />
              </div>
              <div className="field">
                <label className="field-label">Fee ($)</label>
                <input className="input" type="number" value={form.fee || ''} onChange={set('fee')} />
              </div>
            </div>
            <div className="grid-3">
              <div className="field">
                <label className="field-label">Load-in</label>
                <input className="input" type="time" value={form.load_in_time || ''} onChange={set('load_in_time')} />
              </div>
              <div className="field">
                <label className="field-label">Set Time</label>
                <input className="input" type="time" value={form.set_time || ''} onChange={set('set_time')} />
              </div>
              <div className="field">
                <label className="field-label">Set Length (min)</label>
                <input className="input" type="number" value={form.set_length_min || ''} onChange={set('set_length_min')} />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label className="field-label">Deposit Amount</label>
                <input className="input" type="number" value={form.deposit_amount || ''} onChange={set('deposit_amount')} />
              </div>
              <div className="field" style={{ justifyContent: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '1.5rem' }}>
                  <input type="checkbox" checked={form.deposit_paid || false} onChange={e => setForm((f: any) => ({ ...f, deposit_paid: e.target.checked }))} />
                  <span className="field-label" style={{ margin: 0 }}>Deposit Paid</span>
                </label>
              </div>
            </div>
            <div className="field">
              <label className="field-label">Contract URL</label>
              <input className="input" value={form.contract_url || ''} onChange={set('contract_url')} placeholder="https://..." />
            </div>
            <div className="field">
              <label className="field-label">Deal Notes</label>
              <textarea className="textarea" value={form.deal_notes || ''} onChange={set('deal_notes')} />
            </div>
            <div className="field">
              <label className="field-label">Internal Notes</label>
              <textarea className="textarea" value={form.internal_notes || ''} onChange={set('internal_notes')} />
            </div>
            <div className="field">
              <label className="field-label">Advance Notes (visible to band)</label>
              <textarea className="textarea" value={form.advance_notes || ''} onChange={set('advance_notes')} />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setEdit(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>Save Changes</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid-2">
          <div className="card">
            <div className="card-header"><span className="card-title">SHOW DETAILS</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem' }}>
              {[
                ['Band', booking.act?.act_name],
                ['Venue', booking.venue ? `${booking.venue.name}, ${booking.venue.city} ${booking.venue.state}` : null],
                ['Tour', booking.tour?.name],
                ['Show Date', booking.show_date ? new Date(booking.show_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : null],
                ['Load-in', booking.load_in_time],
                ['Set Time', booking.set_time],
                ['Set Length', booking.set_length_min ? `${booking.set_length_min} min` : null],
                ['Fee', booking.fee ? `$${Number(booking.fee).toLocaleString()}` : null],
                ['Deposit', booking.deposit_amount ? `$${Number(booking.deposit_amount).toLocaleString()} ${booking.deposit_paid ? '(PAID)' : '(UNPAID)'}` : null],
              ].filter(([_, v]) => v).map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                  <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {booking.deal_notes && (
              <div className="card">
                <div className="card-header"><span className="card-title">DEAL NOTES</span></div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>{booking.deal_notes}</p>
              </div>
            )}
            {booking.advance_notes && (
              <div className="card">
                <div className="card-header"><span className="card-title">ADVANCE NOTES</span></div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>{booking.advance_notes}</p>
              </div>
            )}
            {booking.internal_notes && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">INTERNAL NOTES</span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>Agent only</span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>{booking.internal_notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
      {showEmail && booking.act_id && (
        <EmailComposer
          bookingId={booking.id}
          actId={booking.act_id}
          venueId={booking.venue_id || undefined}
          contactId={booking.contact?.id || undefined}
          contactEmail={booking.contact?.email || undefined}
          defaultCategory={booking.email_stage || 'target'}
          agentName={undefined}
          onClose={() => setShowEmail(false)}
        />
      )}
    </AppShell>
  );
}
