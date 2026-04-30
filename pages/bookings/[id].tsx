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

const DEAL_OPTIONS = [
  { value: 'guarantee',  label: 'Guarantee' },
  { value: 'door_split', label: 'Door Split' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'flat_fee',   label: 'Flat Fee' },
  { value: 'other',      label: 'Other' },
];
const DEAL_LABELS: Record<string, string> = Object.fromEntries(DEAL_OPTIONS.map(d => [d.value, d.label]));
const PAY_COLORS: Record<string, string> = { pending: '#f97316', partial: '#fbbf24', received: '#34d399', waived: '#60a5fa' };

function Row({ label, value }: { label: string; value: any }) {
  if (!value && value !== 0 && value !== false) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', textAlign: 'right', fontSize: '0.88rem' }}>{value}</span>
    </div>
  );
}

function fmt(t: string | null | undefined) {
  if (!t) return null;
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export default function BookingDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [booking, setBooking] = useState<any>(null);
  const [acts, setActs]       = useState<ActPick[]>([]);
  const [venues, setVenues]   = useState<VenuePick[]>([]);
  const [tours, setTours]     = useState<TourPick[]>([]);
  const [edit, setEdit]           = useState(false);
  const [form, setForm]           = useState<any>({});
  const [saving, setSaving]       = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  // Show Details modal (Item 2)
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsForm, setDetailsForm]           = useState<any>({});
  const [savingDetails, setSavingDetails]       = useState(false);

  // Financial inline edit (Item 4)
  const [editFinancial, setEditFinancial]         = useState(false);
  const [financialForm, setFinancialForm]         = useState<any>({});
  const [savingFinancial, setSavingFinancial]     = useState(false);

  // Post-Show / Settle modal (Item 5)
  const [showSettle, setShowSettle] = useState(false);
  const [settleForm, setSettleForm] = useState<any>({
    actual_amount_received: '',
    payment_status: 'received',
    post_show_notes: '',
    rebook_flag: 'maybe',
    issue_notes: '',
  });
  const [settling, setSettling]     = useState(false);
  const [settleError, setSettleError] = useState('');

  useEffect(() => { if (id) loadAll(); }, [id]);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [bookingRes, actsRes, venuesRes, toursRes] = await Promise.all([
      supabase.from('bookings').select(`*, act:acts(*), venue:venues(*), tour:tours(id, name), contact:contacts(*)`).eq('id', id).single(),
      supabase.from('acts').select('id, act_name').eq('owner_id', user.id).order('act_name'),
      supabase.from('venues').select('id, name, city, state').order('name'),
      supabase.from('tours').select('id, name, act_id').eq('created_by', user.id).order('name'),
    ]);
    if (bookingRes.data) {
      setBooking(bookingRes.data);
      setForm(bookingRes.data);
      setDetailsForm(bookingRes.data);
      setFinancialForm(bookingRes.data);
      setSettleForm((f: any) => ({ ...f, actual_amount_received: bookingRes.data.agreed_amount ?? bookingRes.data.fee ?? '' }));
    }
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
      act_id:         form.act_id,
      venue_id:       form.venue_id       || null,
      tour_id:        form.tour_id        || null,
      status:         form.status,
      show_date:      form.show_date      || null,
      load_in_time:   form.load_in_time   || null,
      set_time:       form.set_time       || null,
      set_length_min: form.set_length_min ? Number(form.set_length_min) : null,
      fee:            form.fee            ? Number(form.fee) : null,
      deal_type:      form.deal_type      || null,
      agreed_amount:  form.agreed_amount  ? Number(form.agreed_amount) : null,
      deal_notes:     form.deal_notes     || null,
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

  const saveDetails = async () => {
    setSavingDetails(true);
    await supabase.from('bookings').update({
      load_in_time:         detailsForm.load_in_time         || null,
      soundcheck_time:      detailsForm.soundcheck_time      || null,
      set_time:             detailsForm.set_time             || null,
      end_time:             detailsForm.end_time             || null,
      venue_contact_name:   detailsForm.venue_contact_name   || null,
      sound_system:         detailsForm.sound_system         || null,
      meals_provided:       !!detailsForm.meals_provided,
      drinks_provided:      !!detailsForm.drinks_provided,
      hotel_booked:         !!detailsForm.hotel_booked,
      lodging_details:      detailsForm.lodging_details      || null,
      special_requirements: detailsForm.special_requirements || null,
      set_length_min:       detailsForm.set_length_min ? Number(detailsForm.set_length_min) : null,
      details_pending:      false,
    }).eq('id', id);
    await loadAll();
    setShowDetailsModal(false);
    setSavingDetails(false);
  };

  const saveFinancial = async () => {
    setSavingFinancial(true);
    await supabase.from('bookings').update({
      deal_type:              financialForm.deal_type              || null,
      agreed_amount:          financialForm.agreed_amount          ? Number(financialForm.agreed_amount)          : null,
      actual_amount_received: financialForm.actual_amount_received ? Number(financialForm.actual_amount_received) : null,
      payment_status:         financialForm.payment_status         || 'pending',
      date_paid:              financialForm.date_paid              || null,
      expense_notes:          financialForm.expense_notes          || null,
      payout_notes:           financialForm.payout_notes           || null,
    }).eq('id', id);
    await loadAll();
    setEditFinancial(false);
    setSavingFinancial(false);
  };

  const settle = async () => {
    setSettling(true);
    setSettleError('');
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/bookings/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ bookingId: id, ...settleForm }),
    });
    const data = await res.json();
    if (!res.ok) { setSettleError(data.error || 'Failed to settle'); setSettling(false); return; }
    await loadAll();
    setShowSettle(false);
    setSettling(false);
  };

  const deleteBooking = async () => {
    if (!confirm('Delete this booking? This cannot be undone.')) return;
    await supabase.from('bookings').delete().eq('id', id);
    router.push('/bookings');
  };

  const set    = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f: any) => ({ ...f, [k]: e.target.value }));
  const setDet = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setDetailsForm((f: any) => ({ ...f, [k]: e.target.value }));
  const setFin = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setFinancialForm((f: any) => ({ ...f, [k]: e.target.value }));

  if (!booking) return <AppShell requireRole="act_admin"><div style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading...</div></AppShell>;

  const isPast     = booking.show_date && new Date(booking.show_date + 'T23:59:59') < new Date();
  const canSettle  = booking.status === 'confirmed' && isPast;

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            {booking.act?.act_name || '—'}
          </div>
          <h1 className="page-title">{booking.venue?.name || 'No Venue'}</h1>
          {booking.venue?.city && <div className="page-sub">{booking.venue.city}, {booking.venue.state}</div>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`badge badge-${booking.status}`}>{BOOKING_STATUS_LABELS[booking.status as BookingStatus]}</span>
          {canSettle && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowSettle(true)}>✓ Mark as Played</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowEmail(true)}>✉ Email</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setEdit(!edit)}>{edit ? 'Cancel Edit' : 'Edit'}</button>
          <button className="btn btn-ghost btn-sm" style={{ color: '#f87171' }} onClick={deleteBooking}>Delete</button>
        </div>
      </div>

      {/* Details pending banner */}
      {booking.details_pending && !edit && (
        <div style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 'var(--radius)', padding: '0.65rem 1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: '#f97316' }}>
            ⚠ Show logistics not yet entered — soundcheck, meals, lodging, and other day-of details are pending.
          </span>
          <button className="btn btn-ghost btn-sm" style={{ color: '#f97316', borderColor: '#f97316', flexShrink: 0 }} onClick={() => { setDetailsForm(booking); setShowDetailsModal(true); }}>
            Fill In Details →
          </button>
        </div>
      )}

      {/* Status pipeline */}
      <div className="card mb-6">
        <div className="card-header"><span className="card-title">STATUS PIPELINE</span></div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {BOOKING_STATUS_ORDER.map(s => (
            <button key={s} onClick={() => setStatus(s)} className="btn btn-sm"
              style={{
                background:  booking.status === s ? `var(--status-${s})` : 'var(--bg-overlay)',
                color:       booking.status === s ? '#000' : 'var(--text-muted)',
                borderColor: booking.status === s ? `var(--status-${s})` : 'var(--border)',
                fontFamily: 'var(--font-body)', fontSize: '0.78rem', letterSpacing: '0.1em',
              }}>
              {BOOKING_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {edit ? (
        /* ── Edit form ── */
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="card-header"><span className="card-title">EDIT BOOKING</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="grid-2">
              <div className="field"><label className="field-label">Band</label>
                <select className="select" value={form.act_id || ''} onChange={set('act_id')}>
                  {acts.map(a => <option key={a.id} value={a.id}>{a.act_name}</option>)}
                </select></div>
              <div className="field"><label className="field-label">Venue</label>
                <select className="select" value={form.venue_id || ''} onChange={set('venue_id')}>
                  <option value="">No venue</option>
                  {venues.map(v => <option key={v.id} value={v.id}>{v.name} — {v.city}, {v.state}</option>)}
                </select></div>
            </div>
            <div className="grid-2">
              <div className="field"><label className="field-label">Show Date</label>
                <input className="input" type="date" value={form.show_date?.substring(0, 10) || ''} onChange={set('show_date')} /></div>
              <div className="field"><label className="field-label">Status</label>
                <select className="select" value={form.status} onChange={set('status')}>
                  {BOOKING_STATUS_ORDER.map(s => <option key={s} value={s}>{BOOKING_STATUS_LABELS[s]}</option>)}
                </select></div>
            </div>
            <div className="grid-2">
              <div className="field"><label className="field-label">Deal Type</label>
                <select className="select" value={form.deal_type || ''} onChange={set('deal_type')}>
                  <option value="">Select...</option>
                  {DEAL_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select></div>
              <div className="field"><label className="field-label">Agreed Amount ($)</label>
                <input className="input" type="number" min="0" step="0.01" value={form.agreed_amount ?? ''} onChange={set('agreed_amount')} placeholder="0.00" /></div>
            </div>
            <div className="grid-3">
              <div className="field"><label className="field-label">Load-in</label>
                <input className="input" type="time" value={form.load_in_time || ''} onChange={set('load_in_time')} /></div>
              <div className="field"><label className="field-label">Set Time</label>
                <input className="input" type="time" value={form.set_time || ''} onChange={set('set_time')} /></div>
              <div className="field"><label className="field-label">Set Length (min)</label>
                <input className="input" type="number" value={form.set_length_min || ''} onChange={set('set_length_min')} /></div>
            </div>
            <div className="grid-2">
              <div className="field"><label className="field-label">Deposit Amount</label>
                <input className="input" type="number" value={form.deposit_amount || ''} onChange={set('deposit_amount')} /></div>
              <div className="field" style={{ justifyContent: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '1.5rem' }}>
                  <input type="checkbox" checked={form.deposit_paid || false} onChange={e => setForm((f: any) => ({ ...f, deposit_paid: e.target.checked }))} />
                  <span className="field-label" style={{ margin: 0 }}>Deposit Paid</span>
                </label>
              </div>
            </div>
            <div className="field"><label className="field-label">Contract URL</label>
              <input className="input" value={form.contract_url || ''} onChange={set('contract_url')} placeholder="https://..." /></div>
            <div className="field"><label className="field-label">Deal Notes</label>
              <textarea className="textarea" value={form.deal_notes || ''} onChange={set('deal_notes')} /></div>
            <div className="field"><label className="field-label">Internal Notes</label>
              <textarea className="textarea" value={form.internal_notes || ''} onChange={set('internal_notes')} /></div>
            <div className="field"><label className="field-label">Advance Notes (visible to band)</label>
              <textarea className="textarea" value={form.advance_notes || ''} onChange={set('advance_notes')} /></div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setEdit(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      ) : (
        /* ── View mode ── */
        <>
          <div className="grid-2">
            {/* LEFT: Show Details + Logistics */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* SHOW DETAILS */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">SHOW DETAILS</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setDetailsForm(booking); setShowDetailsModal(true); }}>
                    {booking.details_pending ? 'Fill In Details' : 'Edit Logistics'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <Row label="Band"      value={booking.act?.act_name} />
                  <Row label="Venue"     value={booking.venue ? `${booking.venue.name}, ${booking.venue.city} ${booking.venue.state}` : null} />
                  <Row label="Tour"      value={booking.tour?.name} />
                  <Row label="Show Date" value={booking.show_date ? new Date(booking.show_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : null} />
                  <Row label="Load-in"       value={fmt(booking.load_in_time)} />
                  <Row label="Soundcheck"    value={fmt(booking.soundcheck_time)} />
                  <Row label="Set Time"      value={fmt(booking.set_time)} />
                  <Row label="End Time"      value={fmt(booking.end_time)} />
                  <Row label="Set Length"    value={booking.set_length_min ? `${booking.set_length_min} min` : null} />
                  <Row label="Sound System"  value={booking.sound_system === 'house' ? 'House PA' : booking.sound_system === 'self' ? 'Self-Provided' : null} />
                  <Row label="Meals"         value={booking.meals_provided  ? 'Provided'    : null} />
                  <Row label="Drinks"        value={booking.drinks_provided ? 'Provided'    : null} />
                  <Row label="Hotel"         value={booking.hotel_booked    ? 'Booked'      : null} />
                  <Row label="Venue Contact" value={booking.venue_contact_name} />
                  <Row label="Deposit"       value={booking.deposit_amount ? `$${Number(booking.deposit_amount).toLocaleString()} ${booking.deposit_paid ? '(PAID)' : '(UNPAID)'}` : null} />
                </div>
                {booking.lodging_details && (
                  <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Lodging</div>
                    {booking.lodging_details}
                  </div>
                )}
                {booking.special_requirements && (
                  <div style={{ marginTop: '0.5rem', padding: '0.6rem 0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Special Requirements</div>
                    {booking.special_requirements}
                  </div>
                )}
              </div>

              {/* FINANCIAL (Item 4) */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">FINANCIAL</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setFinancialForm(booking); setEditFinancial(!editFinancial); }}>
                    {editFinancial ? 'Cancel' : 'Edit'}
                  </button>
                </div>
                {editFinancial ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div className="grid-2">
                      <div className="field"><label className="field-label">Deal Type</label>
                        <select className="select" value={financialForm.deal_type || ''} onChange={setFin('deal_type')}>
                          <option value="">Select...</option>
                          {DEAL_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </select></div>
                      <div className="field"><label className="field-label">Agreed Amount ($)</label>
                        <input className="input" type="number" min="0" step="0.01" value={financialForm.agreed_amount ?? ''} onChange={setFin('agreed_amount')} /></div>
                    </div>
                    <div className="grid-2">
                      <div className="field"><label className="field-label">Actual Received ($)</label>
                        <input className="input" type="number" min="0" step="0.01" value={financialForm.actual_amount_received ?? ''} onChange={setFin('actual_amount_received')} /></div>
                      <div className="field"><label className="field-label">Payment Status</label>
                        <select className="select" value={financialForm.payment_status || 'pending'} onChange={setFin('payment_status')}>
                          <option value="pending">Pending</option>
                          <option value="partial">Partial</option>
                          <option value="received">Received</option>
                          <option value="waived">Waived</option>
                        </select></div>
                    </div>
                    <div className="field"><label className="field-label">Date Paid</label>
                      <input className="input" type="date" value={financialForm.date_paid?.substring(0, 10) || ''} onChange={setFin('date_paid')} /></div>
                    <div className="field"><label className="field-label">Expense Notes</label>
                      <textarea className="textarea" value={financialForm.expense_notes || ''} onChange={setFin('expense_notes')} /></div>
                    <div className="field"><label className="field-label">Payout Notes</label>
                      <textarea className="textarea" value={financialForm.payout_notes || ''} onChange={setFin('payout_notes')} /></div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditFinancial(false)}>Cancel</button>
                      <button className="btn btn-primary btn-sm" onClick={saveFinancial} disabled={savingFinancial}>{savingFinancial ? 'Saving...' : 'Save'}</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <Row label="Deal Type"    value={booking.deal_type ? DEAL_LABELS[booking.deal_type] || booking.deal_type : null} />
                    <Row label="Agreed"       value={booking.agreed_amount != null ? `$${Number(booking.agreed_amount).toLocaleString()}` : null} />
                    <Row label="Received"     value={booking.actual_amount_received != null ? `$${Number(booking.actual_amount_received).toLocaleString()}` : null} />
                    <Row label="Payment"
                      value={booking.payment_status ? (
                        <span style={{ color: PAY_COLORS[booking.payment_status] || 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.78rem' }}>
                          {booking.payment_status}
                        </span>
                      ) : null} />
                    <Row label="Date Paid"    value={booking.date_paid ? new Date(booking.date_paid + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null} />
                    {booking.expense_notes && (
                      <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Expenses</div>
                        {booking.expense_notes}
                      </div>
                    )}
                    {booking.payout_notes && (
                      <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Payout</div>
                        {booking.payout_notes}
                      </div>
                    )}
                    {!booking.deal_type && !booking.agreed_amount && !booking.payment_status && (
                      <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.82rem', padding: '0.5rem 0' }}>
                        No financial details recorded. Click Edit to add.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Notes */}
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
              {booking.post_show_notes && (
                <div className="card">
                  <div className="card-header"><span className="card-title">POST-SHOW NOTES</span></div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>{booking.post_show_notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* History link */}
          {booking.status === 'completed' && (
            <div style={{ marginTop: '1rem', textAlign: 'right' }}>
              <Link href="/history" style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textDecoration: 'none' }}>
                View in Show History →
              </Link>
            </div>
          )}
        </>
      )}

      {/* ── Show Details Modal (Item 2) ── */}
      {showDetailsModal && (
        <div className="modal-backdrop" onClick={() => setShowDetailsModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowDetailsModal(false)}>✕</button>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--accent)', marginBottom: '1.25rem' }}>
              Show Logistics — {booking.venue?.name}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="grid-2">
                <div className="field"><label className="field-label">Load-in Time</label>
                  <input className="input" type="time" value={detailsForm.load_in_time || ''} onChange={setDet('load_in_time')} /></div>
                <div className="field"><label className="field-label">Soundcheck Time</label>
                  <input className="input" type="time" value={detailsForm.soundcheck_time || ''} onChange={setDet('soundcheck_time')} /></div>
              </div>
              <div className="grid-2">
                <div className="field"><label className="field-label">Set Time (Showtime)</label>
                  <input className="input" type="time" value={detailsForm.set_time || ''} onChange={setDet('set_time')} /></div>
                <div className="field"><label className="field-label">Estimated End Time</label>
                  <input className="input" type="time" value={detailsForm.end_time || ''} onChange={setDet('end_time')} /></div>
              </div>
              <div className="field"><label className="field-label">Set Length (min)</label>
                <input className="input" type="number" value={detailsForm.set_length_min || ''} onChange={setDet('set_length_min')} /></div>
              <div className="field"><label className="field-label">Venue Contact Name</label>
                <input className="input" value={detailsForm.venue_contact_name || ''} onChange={setDet('venue_contact_name')} placeholder="Day-of contact" /></div>
              <div className="field"><label className="field-label">Sound System</label>
                <select className="select" value={detailsForm.sound_system || ''} onChange={setDet('sound_system')}>
                  <option value="">Unknown</option>
                  <option value="house">House PA</option>
                  <option value="self">Self-Provided</option>
                </select></div>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', padding: '0.25rem 0' }}>
                {[
                  ['meals_provided',  'Meals Provided'],
                  ['drinks_provided', 'Drinks Provided'],
                  ['hotel_booked',    'Hotel Booked'],
                ].map(([key, lbl]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.86rem' }}>
                    <input type="checkbox" checked={!!detailsForm[key]} onChange={e => setDetailsForm((f: any) => ({ ...f, [key]: e.target.checked }))} />
                    <span style={{ color: 'var(--text-secondary)' }}>{lbl}</span>
                  </label>
                ))}
              </div>
              <div className="field"><label className="field-label">Lodging Details</label>
                <textarea className="textarea" rows={2} value={detailsForm.lodging_details || ''} onChange={setDet('lodging_details')} placeholder="Hotel name, address, confirmation #..." /></div>
              <div className="field"><label className="field-label">Special Requirements / Notes</label>
                <textarea className="textarea" rows={3} value={detailsForm.special_requirements || ''} onChange={setDet('special_requirements')} placeholder="Backline, rider requests, parking, stage plot..." /></div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={() => setShowDetailsModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveDetails} disabled={savingDetails}>
                  {savingDetails ? 'Saving...' : 'Save Details'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Post-Show / Settle Modal (Item 5) ── */}
      {showSettle && (
        <div className="modal-backdrop" onClick={() => setShowSettle(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSettle(false)}>✕</button>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--accent)', marginBottom: '0.25rem' }}>
              Post-Show Record
            </div>
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
              {booking.venue?.name}{booking.show_date ? ` · ${new Date(booking.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="grid-2">
                <div className="field"><label className="field-label">Actual Pay Received ($)</label>
                  <input className="input" type="number" min="0" step="0.01"
                    value={settleForm.actual_amount_received}
                    onChange={e => setSettleForm((f: any) => ({ ...f, actual_amount_received: e.target.value }))} /></div>
                <div className="field"><label className="field-label">Payment Status</label>
                  <select className="select" value={settleForm.payment_status} onChange={e => setSettleForm((f: any) => ({ ...f, payment_status: e.target.value }))}>
                    <option value="received">Received</option>
                    <option value="partial">Partial</option>
                    <option value="waived">Waived</option>
                    <option value="pending">Pending / Unpaid</option>
                  </select></div>
              </div>
              <div className="field"><label className="field-label">Post-Show Notes</label>
                <textarea className="textarea" rows={3} value={settleForm.post_show_notes} onChange={e => setSettleForm((f: any) => ({ ...f, post_show_notes: e.target.value }))} placeholder="How did it go? Crowd size, sound quality, notable moments..." /></div>
              <div className="field"><label className="field-label">Re-book This Venue?</label>
                <select className="select" value={settleForm.rebook_flag} onChange={e => setSettleForm((f: any) => ({ ...f, rebook_flag: e.target.value }))}>
                  <option value="yes">Yes — definitely</option>
                  <option value="maybe">Maybe</option>
                  <option value="no">No</option>
                </select></div>
              <div className="field"><label className="field-label">Issues to Flag</label>
                <textarea className="textarea" rows={2} value={settleForm.issue_notes} onChange={e => setSettleForm((f: any) => ({ ...f, issue_notes: e.target.value }))} placeholder="Any problems for future reference..." /></div>
              {settleError && <div style={{ color: '#f87171', fontSize: '0.83rem' }}>{settleError}</div>}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={() => setShowSettle(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={settle} disabled={settling}>
                  {settling ? 'Saving...' : 'Mark as Played'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Email Composer ── */}
      {showEmail && booking.act_id && (
        <EmailComposer
          bookingId={booking.id}
          actId={booking.act_id}
          venueId={booking.venue_id || undefined}
          contactId={booking.contact?.id || undefined}
          contactEmail={booking.contact?.email || undefined}
          defaultCategory={booking.email_stage || 'target'}
          onClose={() => setShowEmail(false)}
        />
      )}
    </AppShell>
  );
}
