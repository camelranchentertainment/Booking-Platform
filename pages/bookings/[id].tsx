// pages/bookings/[id].tsx
//
// Show detail — one show from pitch to paid: where it sits in the pipeline,
// the show-day schedule and people, logistics, the deal and money, who's
// playing and what they're paid, and the notes.
//
// Layout (Phase 3 redesign, Oct 2026 — matches the Tours page):
//   1. Illustrated hero (show night) with venue, band, date and countdown.
//   2. Pipeline chips (tap to move the show), then metric trackers.
//   3. Left: schedule, show-day people, logistics, lineup.
//      Right: deal & money, notes, and the cancel/delete zone.
//
// Pure rules live in lib/domain/showDetail.ts (unit-tested). Status changes,
// edits and settling go through the band-admin-only API routes; logistics,
// money and lineup write under the admin's own session (RLS is the boundary).

import { useState, useEffect, useCallback, useId } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import AppShell from '../../components/layout/AppShell';
import PageHero from '../../components/layout/PageHero';
import ShowNightScene from '../../components/today/ShowNightScene';
import ShowDayContactFields from '../../components/venues/ShowDayContactFields';
import EmailComposer from '../../components/email/EmailComposer';
import { supabase } from '../../lib/supabase';
import { BookingStatus, BOOKING_STATUS_LABELS, BOOKING_STATUS_ORDER } from '../../lib/types';
import { formatShowDate, localToday } from '../../lib/formatDate';
import { bookingColumns, contactsFromBooking } from '../../lib/showDayContacts';
import { DEAL_LABELS, mapsLink } from '../../lib/domain/showDay';
import {
  PAYMENT_LABELS, PAYMENT_STATUSES, canDeleteShow, canMarkPlayed, countdown, dollars, lineupTotal,
  parseMoneyInput, schedule, toPaymentStatus,
} from '../../lib/domain/showDetail';
import { telLink } from '../../lib/domain/venueDetail';
import css from '../../styles/detail.module.css';


type ActPick   = { id: string; act_name: string };
type VenuePick = { id: string; name: string; city: string; state: string };
type TourPick  = { id: string; name: string; act_id: string };

type RosterMember      = { id: string; name: string; instrument_role: string | null; default_pay_amount: number | null };
type LoadedAssignment  = { expenseId: string; personnel_id: string; amount: number; name: string; instrument_role: string | null };
type LoadedRosterEntry = { id: string; personnel_id: string };
type PersonnelFormRow  = { personnel_id: string; name: string; instrument_role: string; pay_amount: string };

const DEAL_OPTIONS = Object.entries(DEAL_LABELS).map(([value, label]) => ({ value, label }));
const TIME_FIELDS: Array<[string, string]> = [
  ['load_in_time', 'Load-in'], ['soundcheck_time', 'Sound check'], ['door_time', 'Doors'],
  ['set_time', 'Set time'], ['end_time', 'Done by'],
];

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '' || children === false) return null;
  return (
    <div className={css.fact}>
      <dt className={css.factLabel}>{label}</dt>
      <dd className={css.factValue}>{children}</dd>
    </div>
  );
}

export default function BookingDetail() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;

  const [booking, setBooking] = useState<any>(null);
  const [missing, setMissing] = useState(false);
  const [acts, setActs]       = useState<ActPick[]>([]);
  const [venues, setVenues]   = useState<VenuePick[]>([]);
  const [tours, setTours]     = useState<TourPick[]>([]);
  const [today]               = useState(() => localToday());
  const [pageError, setPageError] = useState('');

  const [edit, setEdit]         = useState(false);
  const [form, setForm]         = useState<any>({});
  const [saving, setSaving]     = useState(false);
  const [editError, setEditError] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [movingTo, setMovingTo] = useState<string | null>(null);

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsForm, setDetailsForm]           = useState<any>({});
  const [savingDetails, setSavingDetails]       = useState(false);
  const [detailsError, setDetailsError]         = useState('');

  const [editFinancial, setEditFinancial]     = useState(false);
  const [financialForm, setFinancialForm]     = useState<any>({});
  const [savingFinancial, setSavingFinancial] = useState(false);
  const [financialError, setFinancialError]   = useState('');

  const [showSettle, setShowSettle] = useState(false);
  const [settleForm, setSettleForm] = useState({
    actual_amount_received: '', post_show_notes: '', issue_notes: '', rating: 0, attendance: '',
  });
  const [wouldReturn, setWouldReturn] = useState<'yes' | 'maybe' | 'no' | null>(null);
  const [settling, setSettling]       = useState(false);
  const [settleError, setSettleError] = useState('');

  const [roster, setRoster]                         = useState<RosterMember[]>([]);
  const [loadedAssignments, setLoadedAssignments]   = useState<LoadedAssignment[]>([]);
  const [loadedRoster, setLoadedRoster]             = useState<LoadedRosterEntry[]>([]);
  const [showPersonnelModal, setShowPersonnelModal] = useState(false);
  const [personnelForm, setPersonnelForm]           = useState<PersonnelFormRow[]>([]);
  const [savingPersonnel, setSavingPersonnel]       = useState(false);
  const [personnelError, setPersonnelError]         = useState('');

  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving]           = useState(false);

  const loadAll = useCallback(async () => {
    if (!id) return;
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) return;
    const [bookingRes, actsRes, venuesRes] = await Promise.all([
      supabase.from('bookings').select('*, act:acts(*), venue:venues(*), tour:tours(id, name), contact:contacts(*)').eq('id', id).maybeSingle(),
      supabase.from('acts').select('id, act_name').eq('owner_id', user.id).order('act_name'),
      supabase.from('venues').select('id, name, city, state').order('name'),
    ]);
    const b = bookingRes.data;
    if (!b) { setMissing(true); return; }
    setBooking(b);
    setForm(b);
    setDetailsForm(b);
    setFinancialForm(b);
    setSettleForm(f => ({ ...f, actual_amount_received: String(b.agreed_amount ?? b.fee ?? '') }));
    setActs((actsRes.data || []) as ActPick[]);
    setVenues((venuesRes.data || []) as VenuePick[]);

    const actIds = ((actsRes.data || []) as ActPick[]).map(a => a.id);
    const filterIds = actIds.length > 0 ? actIds : b.act_id ? [b.act_id] : [];
    if (filterIds.length > 0) {
      const { data: toursData } = await supabase.from('tours').select('id, name, act_id')
        .in('act_id', filterIds).neq('status', 'cancelled').order('name');
      setTours((toursData || []) as TourPick[]);
    }
    if (b.act_id) {
      const [rosterRes, expensesRes, bpRes] = await Promise.all([
        supabase.from('act_personnel').select('id, name, instrument_role, default_pay_amount')
          .eq('act_id', b.act_id).eq('is_active', true).order('name'),
        supabase.from('expenses').select('id, personnel_id, amount, act_personnel(name, instrument_role)')
          .eq('booking_id', id).not('personnel_id', 'is', null).eq('category', 'band_pay').is('archived_at', null),
        supabase.from('booking_personnel').select('id, personnel_id').eq('booking_id', id),
      ]);
      setRoster((rosterRes.data || []) as RosterMember[]);
      setLoadedRoster((bpRes.data || []) as LoadedRosterEntry[]);
      setLoadedAssignments(((expensesRes.data || []) as any[]).map(e => {
        const p = one(e.act_personnel) as { name?: string; instrument_role?: string | null } | null;
        return { expenseId: e.id, personnel_id: e.personnel_id, amount: Number(e.amount), name: p?.name || '', instrument_role: p?.instrument_role || null };
      }));
    }
  }, [id]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const authHeader = async (): Promise<Record<string, string> | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` } : null;
  };

  const setStatus = async (newStatus: BookingStatus) => {
    if (!id || newStatus === booking?.status || movingTo) return;
    setMovingTo(newStatus);
    setPageError('');
    try {
      const headers = await authHeader();
      if (!headers) return;
      const res = await fetch('/api/bookings/move-status', { method: 'POST', headers, body: JSON.stringify({ bookingId: id, status: newStatus }) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setPageError(`Couldn’t move the show: ${j.error || res.statusText}`);
        return;
      }
      setBooking((b: any) => ({ ...b, status: newStatus }));
    } finally {
      setMovingTo(null);
    }
  };

  const saveEdit = async () => {
    const agreed = parseMoneyInput(String(form.agreed_amount ?? ''));
    const deposit = parseMoneyInput(String(form.deposit_amount ?? ''));
    if (!agreed.ok || !deposit.ok) { setEditError('Amounts must be dollar figures, like 500 or 450.50.'); return; }
    setSaving(true);
    setEditError('');
    try {
      const headers = await authHeader();
      if (!headers) return;
      const updates = {
        act_id:         form.act_id,
        venue_id:       form.venue_id       || null,
        tour_id:        form.tour_id        || null,
        status:         form.status,
        show_date:      form.show_date      || null,
        deal_type:      form.deal_type      || null,
        agreed_amount:  agreed.value,
        deal_notes:     form.deal_notes     || null,
        internal_notes: form.internal_notes || null,
        advance_notes:  form.advance_notes  || null,
        contract_url:   form.contract_url   || null,
        deposit_paid:   !!form.deposit_paid,
        deposit_amount: deposit.value,
      };
      const res = await fetch('/api/bookings/update', { method: 'POST', headers, body: JSON.stringify({ bookingId: id, updates }) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setEditError(`Couldn’t save: ${j.error || res.statusText}`);
        return;
      }
      await loadAll();
      setEdit(false);
    } finally {
      setSaving(false);
    }
  };

  const saveDetails = async () => {
    const len = String(detailsForm.set_length_min ?? '').trim();
    if (len && (!/^\d{1,3}$/.test(len) || Number(len) < 1 || Number(len) > 600)) {
      setDetailsError('Set length is whole minutes, 1–600.');
      return;
    }
    setSavingDetails(true);
    setDetailsError('');
    const { error } = await supabase.from('bookings').update({
      load_in_time:         detailsForm.load_in_time         || null,
      soundcheck_time:      detailsForm.soundcheck_time      || null,
      door_time:            detailsForm.door_time            || null,
      set_time:             detailsForm.set_time             || null,
      end_time:             detailsForm.end_time             || null,
      set_length_min:       len ? Number(len) : null,
      ...bookingColumns(contactsFromBooking(detailsForm)),
      sound_system:         detailsForm.sound_system         || null,
      meals_provided:       !!detailsForm.meals_provided,
      drinks_provided:      !!detailsForm.drinks_provided,
      hotel_booked:         !!detailsForm.hotel_booked,
      lodging_details:      detailsForm.lodging_details      || null,
      special_requirements: detailsForm.special_requirements || null,
      details_pending:      false,
    }).eq('id', id as string);
    if (error) { setDetailsError(`Couldn’t save: ${error.message}`); setSavingDetails(false); return; }
    await loadAll();
    setShowDetailsModal(false);
    setSavingDetails(false);
  };

  const saveFinancial = async () => {
    const agreed = parseMoneyInput(String(financialForm.agreed_amount ?? ''));
    const received = parseMoneyInput(String(financialForm.actual_amount_received ?? ''));
    if (!agreed.ok || !received.ok) { setFinancialError('Amounts must be dollar figures, like 500 or 450.50.'); return; }
    setSavingFinancial(true);
    setFinancialError('');
    const { error } = await supabase.from('bookings').update({
      deal_type:              financialForm.deal_type || null,
      agreed_amount:          agreed.value,
      actual_amount_received: received.value,
      payment_status:         toPaymentStatus(financialForm.payment_status) ?? 'pending',
      date_paid:              financialForm.date_paid     || null,
      expense_notes:          financialForm.expense_notes || null,
      payout_notes:           financialForm.payout_notes  || null,
    }).eq('id', id as string);
    if (error) { setFinancialError(`Couldn’t save: ${error.message}`); setSavingFinancial(false); return; }
    await loadAll();
    setEditFinancial(false);
    setSavingFinancial(false);
  };

  const savePersonnel = async () => {
    for (const p of personnelForm) {
      const v = parseMoneyInput(p.pay_amount);
      if (!v.ok) { setPersonnelError(`Pay for ${p.name} must be a dollar figure.`); return; }
    }
    setSavingPersonnel(true);
    setPersonnelError('');
    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id;

    const loadedMap   = new Map(loadedAssignments.map(a => [a.personnel_id, a]));
    const selectedMap = new Map(personnelForm.map(p => [p.personnel_id, p]));
    const toInsert = personnelForm.filter(p => !loadedMap.has(p.personnel_id));
    const toUpdate = personnelForm.filter(p => {
      const existing = loadedMap.get(p.personnel_id);
      return existing !== undefined && Number(p.pay_amount) !== existing.amount;
    });
    const toDelete   = loadedAssignments.filter(a => !selectedMap.has(a.personnel_id));
    const rosterMap  = new Map(loadedRoster.map(r => [r.personnel_id, r]));
    const toInsertBP = personnelForm.filter(p => !rosterMap.has(p.personnel_id));
    const toDeleteBP = loadedRoster.filter(r => !selectedMap.has(r.personnel_id));

    const errors: string[] = [];
    const phase1 = await Promise.all([
      // Removing someone's pay archives the pay line (financial data is never deleted).
      ...toDelete.map(a => supabase.from('expenses').update({ archived_at: new Date().toISOString() }).eq('id', a.expenseId)),
      ...toUpdate.map(p => supabase.from('expenses').update({ amount: Number(p.pay_amount) || 0 }).eq('id', loadedMap.get(p.personnel_id)!.expenseId)),
    ]);
    phase1.forEach(r => { if (r.error) errors.push(r.error.message); });

    const phase2 = await Promise.all(toInsert.map(p => supabase.from('expenses').insert({
      booking_id: id as string, act_id: booking.act_id, personnel_id: p.personnel_id, category: 'band_pay',
      amount: Number(p.pay_amount) || 0, expense_date: booking.show_date || null, user_id: currentUserId,
    })));
    phase2.forEach(r => { if (r.error) errors.push(r.error.message); });

    const phase3 = await Promise.all([
      ...toDeleteBP.map(r => supabase.from('booking_personnel').delete().eq('id', r.id)),
      ...toInsertBP.map(p => supabase.from('booking_personnel').insert({ booking_id: id as string, personnel_id: p.personnel_id, act_id: booking.act_id })),
    ]);
    phase3.forEach(r => { if (r.error) errors.push(r.error.message); });

    if (errors.length > 0) {
      setPersonnelError(`Save incomplete — ${errors.join('; ')}`);
      setSavingPersonnel(false);
      return;
    }
    await loadAll();
    setShowPersonnelModal(false);
    setSavingPersonnel(false);
  };

  const openLineup = () => {
    setPersonnelForm(loadedAssignments.map(a => ({
      personnel_id: a.personnel_id, name: a.name, instrument_role: a.instrument_role || '', pay_amount: String(a.amount),
    })));
    setPersonnelError('');
    setShowPersonnelModal(true);
  };

  // Band pay is recorded once, on the Lineup (category band_pay). Settling only
  // records what the venue paid and how the night went; it no longer writes a
  // second "member pay" line per roster member, which double-counted pay.
  const settle = async () => {
    const received = parseMoneyInput(settleForm.actual_amount_received);
    if (!received.ok) { setSettleError('Amount received must be a dollar figure.'); return; }
    setSettling(true);
    setSettleError('');
    const headers = await authHeader();
    if (!headers) { setSettling(false); return; }
    const res = await fetch('/api/bookings/settle', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        bookingId: id,
        actual_amount_received: received.value,
        payment_status: received.value !== null ? 'received' : 'pending',
        post_show_notes: settleForm.post_show_notes,
        issue_notes: settleForm.issue_notes,
        rating: settleForm.rating || null,
        attendance: settleForm.attendance,
        would_return: wouldReturn === 'yes' ? true : wouldReturn === 'no' ? false : null,
        rebook_flag: wouldReturn,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setSettleError(data.error || 'Couldn’t record the show. Try again.'); setSettling(false); return; }
    await loadAll();
    setShowSettle(false);
    setSettling(false);
  };

  const removeShow = async (mode: 'delete' | 'cancel') => {
    setRemoving(true);
    setPageError('');
    if (mode === 'cancel') {
      await setStatus('cancelled' as BookingStatus);
      setRemoving(false);
      setConfirmRemove(false);
      return;
    }
    const { error } = await supabase.from('bookings').delete().eq('id', id as string);
    if (error) { setPageError(`Couldn’t delete: ${error.message}`); setRemoving(false); return; }
    router.push('/bookings');
  };

  const set    = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f: any) => ({ ...f, [k]: e.target.value }));
  const setDet = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setDetailsForm((f: any) => ({ ...f, [k]: e.target.value }));
  const setFin = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setFinancialForm((f: any) => ({ ...f, [k]: e.target.value }));

  if (missing) {
    return (
      <AppShell requireRole="band_admin">
        <p className={css.empty}>That show isn’t on your calendar. <Link href="/calendar">Back to the calendar</Link></p>
      </AppShell>
    );
  }
  if (!booking) {
    return (
      <AppShell requireRole="band_admin">
        <div className={`skeleton ${css.skeleton}`} aria-busy="true"><span className="sr-only" role="status">Loading show…</span></div>
      </AppShell>
    );
  }

  const venue = one(booking.venue) as any;
  const act = one(booking.act) as any;
  const tour = one(booking.tour) as any;
  const contact = one(booking.contact) as any;
  const status = booking.status as BookingStatus;
  const longDate = booking.show_date ? formatShowDate(booking.show_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Date TBD';
  const when = countdown(booking.show_date, today);
  const steps = schedule(booking);
  const map = mapsLink(venue);
  const filteredTours = tours.filter(t => t.act_id === (form.act_id || booking.act_id));
  const payTotal = lineupTotal(loadedAssignments);
  const played = canMarkPlayed(status, booking.show_date, today);
  const deletable = canDeleteShow(booking, today);
  const payStatus = toPaymentStatus(booking.payment_status);
  const logistics: Array<[string, string]> = [
    ['Sound', booking.sound_system === 'house' ? 'House PA' : booking.sound_system === 'self' ? 'Bringing our own' : 'TBD'],
    ['Meals', booking.meals_provided ? 'Provided' : 'Not provided'],
    ['Drinks', booking.drinks_provided ? 'Provided' : 'Not provided'],
    ['Hotel', booking.hotel_booked ? 'Booked' : 'Not booked'],
  ];

  return (
    <AppShell requireRole="band_admin">
      <Link href="/calendar" className={css.backLink}>← Calendar</Link>
      <PageHero
        title={venue?.name || 'Show'}
        subtitle={[act?.act_name, [venue?.city, venue?.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Show'}
        summary={`${longDate}${when ? ` · ${when}` : ''} · ${BOOKING_STATUS_LABELS[status] ?? status}`}
        scene={<ShowNightScene />}
        actions={
          <div className={css.heroActions}>
            {played && <button type="button" className="btn btn-primary tours-new-btn" onClick={() => setShowSettle(true)}>✓ Mark as played</button>}
            <button type="button" className="btn btn-secondary tours-new-btn" onClick={() => setShowEmail(true)}>Email</button>
            <button type="button" className="btn btn-secondary tours-new-btn" onClick={() => { setEdit(e => !e); setEditError(''); setForm(booking); }}>
              {edit ? 'Close edit' : 'Edit show'}
            </button>
          </div>
        }
      />

      <div className="tours-body">
        {pageError && <p className={css.error} role="alert">{pageError}</p>}

        <nav className="tours-tabs" aria-label="Move this show">
          {BOOKING_STATUS_ORDER.map(s => (
            <button key={s} type="button" className={`tours-tab ${status === s ? 'tours-tab--on' : ''}`}
              aria-pressed={status === s} disabled={!!movingTo} onClick={() => setStatus(s)}>
              {movingTo === s ? 'Moving…' : BOOKING_STATUS_LABELS[s]}
            </button>
          ))}
        </nav>

        {booking.details_pending && (
          <div className={css.panel} role="status">
            <p className={css.note}>Show-day details aren’t in yet — times, meals, lodging and who to call on the night.</p>
            <div><button type="button" className="btn btn-primary" onClick={() => { setDetailsForm(booking); setDetailsError(''); setShowDetailsModal(true); }}>Fill in details</button></div>
          </div>
        )}

        <section className="tours-metrics" aria-label="This show at a glance">
          <div className="tour-metric">
            <span className="tour-metric-label">Show date</span>
            <span className="tour-metric-value"><strong>{booking.show_date ? formatShowDate(booking.show_date, { month: 'short', day: 'numeric' }) : 'TBD'}</strong></span>
            <span className={`tour-metric-note ${when === 'Tonight' ? 'tour-metric-hot' : ''}`}>{when ?? 'No date yet'}</span>
          </div>
          <div className="tour-metric">
            <span className="tour-metric-label">Agreed pay</span>
            <span className="tour-metric-value"><strong>{dollars(booking.agreed_amount ?? booking.fee) ?? '—'}</strong></span>
            <span className="tour-metric-note">{booking.deal_type ? DEAL_LABELS[booking.deal_type] ?? booking.deal_type : 'Deal not set'}</span>
          </div>
          <div className="tour-metric">
            <span className="tour-metric-label">Received</span>
            <span className="tour-metric-value"><strong className={payStatus === 'pending' && played ? 'tour-metric-hot' : ''}>{dollars(booking.actual_amount_received) ?? '—'}</strong></span>
            <span className="tour-metric-note">{payStatus ? PAYMENT_LABELS[payStatus] : 'Nothing recorded'}</span>
          </div>
          <div className="tour-metric">
            <span className="tour-metric-label">Lineup</span>
            <span className="tour-metric-value"><strong>{loadedAssignments.length}</strong><span>{loadedAssignments.length === 1 ? 'player' : 'players'}</span></span>
            <span className="tour-metric-note">{payTotal ? `${dollars(payTotal)} band pay` : 'No band pay set'}</span>
          </div>
        </section>

        {edit ? (
          <section className={css.panel} aria-labelledby={fid('edit-title')}>
            <div className={css.panelHead}><h2 className={css.panelTitle} id={fid('edit-title')}>Edit show</h2></div>
            <form className={css.form} onSubmit={e => { e.preventDefault(); void saveEdit(); }}>
              <div className={css.formGrid}>
                {acts.length > 1 && (
                  <div className="field">
                    <label className="field-label" htmlFor={fid('act')}>Band</label>
                    <select id={fid('act')} className="select" value={form.act_id || ''} onChange={set('act_id')}>
                      {acts.map(a => <option key={a.id} value={a.id}>{a.act_name}</option>)}
                    </select>
                  </div>
                )}
                <div className="field">
                  <label className="field-label" htmlFor={fid('venue')}>Venue</label>
                  <select id={fid('venue')} className="select" value={form.venue_id || ''} onChange={set('venue_id')}>
                    <option value="">No venue yet</option>
                    {venues.map(v => <option key={v.id} value={v.id}>{v.name} — {v.city}, {v.state}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={fid('tour')}>Tour</label>
                  <select id={fid('tour')} className="select" value={form.tour_id || ''} onChange={set('tour_id')}>
                    <option value="">Not on a tour</option>
                    {filteredTours.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={fid('date')}>Show date</label>
                  <input id={fid('date')} className="input" type="date" value={form.show_date?.substring(0, 10) || ''} onChange={set('show_date')} />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={fid('status')}>Status</label>
                  <select id={fid('status')} className="select" value={form.status} onChange={set('status')}>
                    {BOOKING_STATUS_ORDER.map(s => <option key={s} value={s}>{BOOKING_STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={fid('deal')}>Deal type</label>
                  <select id={fid('deal')} className="select" value={form.deal_type || ''} onChange={set('deal_type')}>
                    <option value="">Not set</option>
                    {DEAL_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={fid('agreed')}>Agreed pay ($)</label>
                  <input id={fid('agreed')} className="input" inputMode="decimal" value={form.agreed_amount ?? ''} onChange={set('agreed_amount')} placeholder="0.00" />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={fid('deposit')}>Deposit ($)</label>
                  <input id={fid('deposit')} className="input" inputMode="decimal" value={form.deposit_amount ?? ''} onChange={set('deposit_amount')} placeholder="0.00" />
                </div>
                <div className="field">
                  <span className="field-label">Deposit</span>
                  <label className="checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minHeight: 44 }}>
                    <input type="checkbox" checked={!!form.deposit_paid} onChange={e => setForm((f: any) => ({ ...f, deposit_paid: e.target.checked }))} />
                    Deposit paid
                  </label>
                </div>
                <div className={`field ${css.full}`}>
                  <label className="field-label" htmlFor={fid('contract')}>Contract link</label>
                  <input id={fid('contract')} className="input" type="url" value={form.contract_url || ''} onChange={set('contract_url')} placeholder="https://…" />
                </div>
                <div className={`field ${css.full}`}>
                  <label className="field-label" htmlFor={fid('dealnotes')}>Deal notes</label>
                  <textarea id={fid('dealnotes')} className="textarea" value={form.deal_notes || ''} onChange={set('deal_notes')} />
                </div>
                <div className={`field ${css.full}`}>
                  <label className="field-label" htmlFor={fid('advance')}>Advance notes (members see these)</label>
                  <textarea id={fid('advance')} className="textarea" value={form.advance_notes || ''} onChange={set('advance_notes')} />
                </div>
                <div className={`field ${css.full}`}>
                  <label className="field-label" htmlFor={fid('internal')}>Internal notes (admins only)</label>
                  <textarea id={fid('internal')} className="textarea" value={form.internal_notes || ''} onChange={set('internal_notes')} />
                </div>
              </div>
              <p className={css.note}>Times, contacts and logistics are edited from the Schedule panel.</p>
              {editError && <p className={css.error} role="alert">{editError}</p>}
              <div className={css.formActions}>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
                <button type="button" className="btn btn-ghost" onClick={() => setEdit(false)}>Cancel</button>
              </div>
            </form>
          </section>
        ) : (
          <div className={css.layout}>
            {/* ── Show day ─────────────────────────────────────── */}
            <div className={css.column}>
              <section className={css.panel} aria-labelledby={fid('sched-title')}>
                <div className={css.panelHead}>
                  <h2 className={css.panelTitle} id={fid('sched-title')}>Schedule</h2>
                  <button type="button" className={`btn btn-secondary ${css.btnSmall}`} onClick={() => { setDetailsForm(booking); setDetailsError(''); setShowDetailsModal(true); }}>
                    Edit show day
                  </button>
                </div>
                <dl className={css.facts}>
                  {steps.map(s => (
                    <div key={s.key} className={css.fact}>
                      <dt className={css.factLabel}>{s.label}</dt>
                      <dd className={css.factValue}>{s.value ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className={css.panel} aria-labelledby={fid('people-title')}>
                <div className={css.panelHead}><h2 className={css.panelTitle} id={fid('people-title')}>Who to call</h2></div>
                <div className={css.people}>
                  {(booking.venue_contact_name || booking.day_of_contact_phone) && (
                    <div className={css.person}>
                      <span className={css.personRole}>Day-of contact</span>
                      <p className={css.personName}>{booking.venue_contact_name || '—'}</p>
                      {booking.day_of_contact_phone && <p className={css.personLine}><a href={telLink(booking.day_of_contact_phone)}>{booking.day_of_contact_phone}</a></p>}
                    </div>
                  )}
                  {(booking.sound_engineer_name || booking.sound_engineer_phone) && (
                    <div className={css.person}>
                      <span className={css.personRole}>Sound engineer</span>
                      <p className={css.personName}>{booking.sound_engineer_name || '—'}</p>
                      {booking.sound_engineer_phone && <p className={css.personLine}><a href={telLink(booking.sound_engineer_phone)}>{booking.sound_engineer_phone}</a></p>}
                    </div>
                  )}
                  {(venue?.booking_contact || venue?.email || venue?.phone) && (
                    <div className={css.person}>
                      <span className={css.personRole}>Venue contact</span>
                      <p className={css.personName}>{venue.booking_contact || '—'}</p>
                      {venue.phone && <p className={css.personLine}><a href={telLink(venue.phone)}>{venue.phone}</a></p>}
                      {venue.email && <p className={css.personLine}><a href={`mailto:${venue.email}`}>{venue.email}</a></p>}
                    </div>
                  )}
                </div>
                {!booking.venue_contact_name && !booking.day_of_contact_phone && !booking.sound_engineer_name && !venue?.booking_contact && (
                  <p className={css.note}>No contacts yet. Add the day-of contact and sound engineer under Edit show day.</p>
                )}
                <dl className={css.facts}>
                  <Fact label="Venue">{venue ? <Link href={`/venues/${venue.id}`}>{venue.name}</Link> : null}</Fact>
                  <Fact label="Address">{venue?.address ? (map ? <a href={map} target="_blank" rel="noopener noreferrer">{venue.address}</a> : venue.address) : null}</Fact>
                  <Fact label="Tour">{tour ? <Link href={`/tours/${tour.id}`}>{tour.name}</Link> : null}</Fact>
                </dl>
              </section>

              <section className={css.panel} aria-labelledby={fid('log-title')}>
                <div className={css.panelHead}><h2 className={css.panelTitle} id={fid('log-title')}>Logistics</h2></div>
                <dl className={css.facts}>
                  {logistics.map(([l, v]) => <Fact key={l} label={l}>{v}</Fact>)}
                  <Fact label="Lodging">{booking.lodging_details}</Fact>
                  <Fact label="Requirements">{booking.special_requirements}</Fact>
                </dl>
              </section>

              <section className={css.panel} aria-labelledby={fid('lineup-title')}>
                <div className={css.panelHead}>
                  <h2 className={css.panelTitle} id={fid('lineup-title')}>Lineup</h2>
                  <button type="button" className={`btn btn-secondary ${css.btnSmall}`} onClick={openLineup}>
                    {loadedAssignments.length ? 'Edit lineup' : 'Add lineup'}
                  </button>
                </div>
                {loadedAssignments.length === 0 ? (
                  <p className={css.note}>Who’s playing this one, and what they’re paid. Band pay is tracked from here.</p>
                ) : (
                  <ul className={css.list}>
                    {loadedAssignments.map(a => (
                      <li key={a.personnel_id} className={css.row}>
                        <div className={css.rowText}>
                          <p className={css.rowMain}>{a.name || 'Unknown'}</p>
                          {a.instrument_role && <p className={css.rowSub}>{a.instrument_role}</p>}
                        </div>
                        <span className={css.amount}>{dollars(a.amount)}</span>
                      </li>
                    ))}
                    <li className={css.row} style={{ background: 'transparent' }}>
                      <span className={css.rowText}><span className={css.panelMeta}>Total band pay</span></span>
                      <span className={css.amount} style={{ color: 'var(--accent)' }}>{dollars(payTotal)}</span>
                    </li>
                  </ul>
                )}
              </section>
            </div>

            {/* ── Deal, money, notes ─────────────────────────────── */}
            <div className={css.column}>
              <section className={css.panel} aria-labelledby={fid('money-title')}>
                <div className={css.panelHead}>
                  <h2 className={css.panelTitle} id={fid('money-title')}>Deal & money</h2>
                  <button type="button" className={`btn btn-secondary ${css.btnSmall}`}
                    onClick={() => { setFinancialForm(booking); setFinancialError(''); setEditFinancial(v => !v); }}>
                    {editFinancial ? 'Cancel' : 'Edit'}
                  </button>
                </div>
                {editFinancial ? (
                  <form className={css.form} onSubmit={e => { e.preventDefault(); void saveFinancial(); }}>
                    <div className={css.formGrid}>
                      <div className="field">
                        <label className="field-label" htmlFor={fid('f-deal')}>Deal type</label>
                        <select id={fid('f-deal')} className="select" value={financialForm.deal_type || ''} onChange={setFin('deal_type')}>
                          <option value="">Not set</option>
                          {DEAL_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label className="field-label" htmlFor={fid('f-agreed')}>Agreed pay ($)</label>
                        <input id={fid('f-agreed')} className="input" inputMode="decimal" value={financialForm.agreed_amount ?? ''} onChange={setFin('agreed_amount')} />
                      </div>
                      <div className="field">
                        <label className="field-label" htmlFor={fid('f-rec')}>Received ($)</label>
                        <input id={fid('f-rec')} className="input" inputMode="decimal" value={financialForm.actual_amount_received ?? ''} onChange={setFin('actual_amount_received')} />
                      </div>
                      <div className="field">
                        <label className="field-label" htmlFor={fid('f-status')}>Payment</label>
                        <select id={fid('f-status')} className="select" value={toPaymentStatus(financialForm.payment_status) ?? 'pending'} onChange={setFin('payment_status')}>
                          {PAYMENT_STATUSES.map(p => <option key={p} value={p}>{PAYMENT_LABELS[p]}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label className="field-label" htmlFor={fid('f-date')}>Date paid</label>
                        <input id={fid('f-date')} className="input" type="date" value={financialForm.date_paid?.substring(0, 10) || ''} onChange={setFin('date_paid')} />
                      </div>
                      <div className={`field ${css.full}`}>
                        <label className="field-label" htmlFor={fid('f-exp')}>Expense notes</label>
                        <textarea id={fid('f-exp')} className="textarea" value={financialForm.expense_notes || ''} onChange={setFin('expense_notes')} />
                      </div>
                      <div className={`field ${css.full}`}>
                        <label className="field-label" htmlFor={fid('f-pay')}>Payout notes</label>
                        <textarea id={fid('f-pay')} className="textarea" value={financialForm.payout_notes || ''} onChange={setFin('payout_notes')} />
                      </div>
                    </div>
                    {financialError && <p className={css.error} role="alert">{financialError}</p>}
                    <div className={css.formActions}>
                      <button type="submit" className="btn btn-primary" disabled={savingFinancial}>{savingFinancial ? 'Saving…' : 'Save'}</button>
                    </div>
                  </form>
                ) : (
                  <dl className={css.facts}>
                    <Fact label="Deal">{booking.deal_type ? DEAL_LABELS[booking.deal_type] ?? booking.deal_type : 'Not set'}</Fact>
                    <Fact label="Agreed">{dollars(booking.agreed_amount ?? booking.fee) ?? '—'}</Fact>
                    <Fact label="Deposit">{booking.deposit_amount ? `${dollars(booking.deposit_amount)} · ${booking.deposit_paid ? 'paid' : 'not paid yet'}` : null}</Fact>
                    <Fact label="Received">{dollars(booking.actual_amount_received)}</Fact>
                    <Fact label="Payment">{payStatus ? PAYMENT_LABELS[payStatus] : null}</Fact>
                    <Fact label="Date paid">{booking.date_paid ? formatShowDate(booking.date_paid, { month: 'short', day: 'numeric', year: 'numeric' }) : null}</Fact>
                    <Fact label="Contract">{booking.contract_url ? <a href={booking.contract_url} target="_blank" rel="noopener noreferrer">Open contract</a> : null}</Fact>
                    <Fact label="Expenses">{booking.expense_notes}</Fact>
                    <Fact label="Payout">{booking.payout_notes}</Fact>
                  </dl>
                )}
              </section>

              {[
                ['Deal notes', booking.deal_notes, null],
                ['Advance notes', booking.advance_notes, 'Members see these'],
                ['Internal notes', booking.internal_notes, 'Admins only'],
                ['After the show', booking.post_show_notes, null],
                ['Issues', booking.issue_notes, null],
              ].filter(([, v]) => v).map(([title, text, meta]) => (
                <section key={String(title)} className={css.panel}>
                  <div className={css.panelHead}>
                    <h2 className={css.panelTitle}>{title}</h2>
                    {meta && <span className={css.panelMeta}>{meta}</span>}
                  </div>
                  <p className={css.factValue}>{text}</p>
                </section>
              ))}

              {status !== 'cancelled' && (
                <section className={css.panel} aria-labelledby={fid('remove-title')}>
                  <div className={css.panelHead}>
                    <h2 className={css.panelTitle} id={fid('remove-title')}>{deletable ? 'Cancel or delete' : 'Cancel show'}</h2>
                  </div>
                  <p className={css.note}>
                    {deletable
                      ? 'Cancelling keeps the show on record. Delete removes it completely — only for shows entered by mistake.'
                      : 'This show has history or money on it, so it can be cancelled but not deleted. Its records are kept.'}
                  </p>
                  {confirmRemove ? (
                    <div className={css.formActions} role="group" aria-label="Confirm">
                      <button type="button" className="btn btn-secondary" disabled={removing} onClick={() => removeShow('cancel')}>Yes, cancel the show</button>
                      {deletable && <button type="button" className="btn btn-ghost" style={{ color: 'var(--red)' }} disabled={removing} onClick={() => removeShow('delete')}>Delete for good</button>}
                      <button type="button" className="btn btn-ghost" disabled={removing} onClick={() => setConfirmRemove(false)}>Keep it</button>
                    </div>
                  ) : (
                    <div><button type="button" className="btn btn-ghost" style={{ color: 'var(--red)' }} onClick={() => setConfirmRemove(true)}>Cancel this show…</button></div>
                  )}
                </section>
              )}
              {status === 'completed' && <Link href="/history" className={css.backLink}>View in show history →</Link>}
            </div>
          </div>
        )}
      </div>

      {/* ── Show day modal ── */}
      {showDetailsModal && (
        <div className="modal-backdrop" onClick={() => !savingDetails && setShowDetailsModal(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby={fid('det-title')} style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" id={fid('det-title')}>Show day — {venue?.name || 'show'}</h3>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Close" onClick={() => setShowDetailsModal(false)}>✕</button>
            </div>
            <form className={css.form} onSubmit={e => { e.preventDefault(); void saveDetails(); }}>
              <div className={css.formGrid}>
                {TIME_FIELDS.map(([k, label]) => (
                  <div className="field" key={k}>
                    <label className="field-label" htmlFor={fid(`d-${k}`)}>{label}</label>
                    <input id={fid(`d-${k}`)} className="input" type="time" value={(detailsForm[k] || '').slice(0, 5)} onChange={setDet(k)} />
                  </div>
                ))}
                <div className="field">
                  <label className="field-label" htmlFor={fid('d-len')}>Set length (min)</label>
                  <input id={fid('d-len')} className="input" inputMode="numeric" value={detailsForm.set_length_min ?? ''} onChange={setDet('set_length_min')} placeholder="90" />
                </div>
              </div>
              <ShowDayContactFields
                idPrefix={fid('d-contacts')}
                value={contactsFromBooking(detailsForm)}
                onChange={next => setDetailsForm((f: any) => ({ ...f, ...bookingColumns(next) }))}
                disabled={savingDetails}
                hint="For this show only. New shows start with the venue's day-of contact and sound engineer."
              />
              <div className="field">
                <label className="field-label" htmlFor={fid('d-sound')}>Sound</label>
                <select id={fid('d-sound')} className="select" value={detailsForm.sound_system || ''} onChange={setDet('sound_system')}>
                  <option value="">Not sure yet</option>
                  <option value="house">House PA</option>
                  <option value="self">Bringing our own</option>
                </select>
              </div>
              <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                <legend className="field-label">Provided</legend>
                {([['meals_provided', 'Meals'], ['drinks_provided', 'Drinks'], ['hotel_booked', 'Hotel booked']] as const).map(([key, lbl]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minHeight: 44 }}>
                    <input type="checkbox" checked={!!detailsForm[key]} onChange={e => setDetailsForm((f: any) => ({ ...f, [key]: e.target.checked }))} />
                    {lbl}
                  </label>
                ))}
              </fieldset>
              <div className="field">
                <label className="field-label" htmlFor={fid('d-lodging')}>Lodging</label>
                <textarea id={fid('d-lodging')} className="textarea" rows={2} value={detailsForm.lodging_details || ''} onChange={setDet('lodging_details')} placeholder="Hotel, address, confirmation #" />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={fid('d-req')}>Requirements / notes</label>
                <textarea id={fid('d-req')} className="textarea" rows={3} value={detailsForm.special_requirements || ''} onChange={setDet('special_requirements')} placeholder="Backline, rider, parking, stage plot" />
              </div>
              {detailsError && <p className={css.error} role="alert">{detailsError}</p>}
              <div className={css.formActions}>
                <button type="submit" className="btn btn-primary" disabled={savingDetails}>{savingDetails ? 'Saving…' : 'Save show day'}</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowDetailsModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Mark as played ── */}
      {showSettle && (
        <div className="modal-backdrop" onClick={() => !settling && setShowSettle(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby={fid('settle-title')} style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" id={fid('settle-title')}>How did {venue?.name || 'the show'} go?</h3>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Close" onClick={() => setShowSettle(false)}>✕</button>
            </div>
            <form className={css.form} onSubmit={e => { e.preventDefault(); void settle(); }}>
              <p className={css.note}>{longDate}. Marks the show played and records the money; you’ll get a reminder to thank the venue.</p>
              <div className={css.formGrid}>
                <div className="field">
                  <label className="field-label" htmlFor={fid('s-rec')}>Venue paid us ($)</label>
                  <input id={fid('s-rec')} className="input" inputMode="decimal" value={settleForm.actual_amount_received}
                    onChange={e => setSettleForm(f => ({ ...f, actual_amount_received: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={fid('s-att')}>Crowd (about)</label>
                  <input id={fid('s-att')} className="input" inputMode="numeric" value={settleForm.attendance}
                    onChange={e => setSettleForm(f => ({ ...f, attendance: e.target.value.replace(/\D/g, '') }))} />
                </div>
              </div>
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="field-label">Rating</legend>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} type="button" aria-label={`${star} star${star === 1 ? '' : 's'}`} aria-pressed={settleForm.rating === star}
                      onClick={() => setSettleForm(f => ({ ...f, rating: f.rating === star ? 0 : star }))}
                      style={{ minWidth: 44, minHeight: 44, background: 'none', border: 0, cursor: 'pointer', fontSize: '1.5rem', color: star <= settleForm.rating ? 'var(--accent)' : 'var(--border)' }}>
                      ★
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="field-label">Book them again?</legend>
                <div className="tours-tabs">
                  {(['yes', 'maybe', 'no'] as const).map(opt => (
                    <button key={opt} type="button" className={`tours-tab ${wouldReturn === opt ? 'tours-tab--on' : ''}`} aria-pressed={wouldReturn === opt}
                      onClick={() => setWouldReturn(w => (w === opt ? null : opt))}>
                      {opt === 'yes' ? 'Yes' : opt === 'no' ? 'No' : 'Maybe'}
                    </button>
                  ))}
                </div>
              </fieldset>
              <p className={css.note}>
                Band pay: {loadedAssignments.length ? `${loadedAssignments.length} on the lineup · ${dollars(payTotal)}` : 'no lineup yet'} —
                {' '}<button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowSettle(false); openLineup(); }}>Edit lineup</button>
              </p>
              <div className="field">
                <label className="field-label" htmlFor={fid('s-notes')}>How it went</label>
                <textarea id={fid('s-notes')} className="textarea" rows={3} value={settleForm.post_show_notes}
                  onChange={e => setSettleForm(f => ({ ...f, post_show_notes: e.target.value }))} placeholder="Crowd, sound, anything to remember" />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={fid('s-issues')}>Issues to flag</label>
                <textarea id={fid('s-issues')} className="textarea" rows={2} value={settleForm.issue_notes}
                  onChange={e => setSettleForm(f => ({ ...f, issue_notes: e.target.value }))} />
              </div>
              {settleError && <p className={css.error} role="alert">{settleError}</p>}
              <div className={css.formActions}>
                <button type="submit" className="btn btn-primary" disabled={settling}>{settling ? 'Saving…' : 'Mark as played'}</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowSettle(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Lineup ── */}
      {showPersonnelModal && (
        <div className="modal-backdrop" onClick={() => !savingPersonnel && setShowPersonnelModal(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby={fid('lineup-modal')} style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" id={fid('lineup-modal')}>Who’s playing</h3>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Close" onClick={() => setShowPersonnelModal(false)}>✕</button>
            </div>
            {roster.length === 0 ? (
              <p className={css.note}>No one on the roster yet. <Link href="/band/members">Add members</Link> first.</p>
            ) : (
              <ul className={css.list}>
                {roster.map(member => {
                  const selected = personnelForm.find(p => p.personnel_id === member.id);
                  const cb = `${fid('lp')}-${member.id}`;
                  return (
                    <li key={member.id} className={css.row}>
                      <input id={cb} type="checkbox" checked={!!selected} style={{ width: 20, height: 20 }}
                        onChange={e => {
                          if (e.target.checked) {
                            const existing = loadedAssignments.find(a => a.personnel_id === member.id);
                            setPersonnelForm(prev => [...prev, {
                              personnel_id: member.id, name: member.name, instrument_role: member.instrument_role || '',
                              pay_amount: existing ? String(existing.amount) : String(member.default_pay_amount ?? ''),
                            }]);
                          } else {
                            setPersonnelForm(prev => prev.filter(p => p.personnel_id !== member.id));
                          }
                        }} />
                      <label htmlFor={cb} className={css.rowText}>
                        <span className={css.rowMain} style={{ display: 'block' }}>{member.name}</span>
                        {member.instrument_role && <span className={css.rowSub} style={{ display: 'block' }}>{member.instrument_role}</span>}
                      </label>
                      {selected && (
                        <>
                          <label className="sr-only" htmlFor={`${cb}-pay`}>Pay for {member.name}</label>
                          <input id={`${cb}-pay`} className="input" inputMode="decimal" style={{ width: 96 }} value={selected.pay_amount}
                            onChange={e => setPersonnelForm(prev => prev.map(p => (p.personnel_id === member.id ? { ...p, pay_amount: e.target.value } : p)))} />
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {personnelError && <p className={css.error} role="alert" style={{ marginTop: '0.75rem' }}>{personnelError}</p>}
            <div className={css.formActions} style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary" onClick={savePersonnel} disabled={savingPersonnel || roster.length === 0}>
                {savingPersonnel ? 'Saving…' : 'Save lineup'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowPersonnelModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showEmail && booking.act_id && (
        <EmailComposer
          bookingId={booking.id}
          actId={booking.act_id}
          venueId={booking.venue_id || undefined}
          contactId={contact?.id || undefined}
          contactEmail={contact?.email || venue?.email || undefined}
          defaultCategory={booking.email_stage || 'target'}
          onClose={() => setShowEmail(false)}
        />
      )}
    </AppShell>
  );
}
