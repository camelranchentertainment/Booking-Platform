// components/booker/ShowOffersDialog.tsx
// Offers and deal memos for one show (build list item 4). Opened from the
// show form; one dialog that moves between four views:
//
//   list    every offer / deal memo for the show, with its status
//   edit    the terms (new from the show + a template, or a draft being edited)
//   send    the covering email; the PDF goes from the agent's Gmail
//   answer  record accepted / declined / withdrawn; accepting can confirm the show
//
// No e-sign. The database guards everything (RLS, column grants, "sent" only
// via the send route); this component only shows state and calls lib/booker.

import { useMemo, useState, type FormEvent } from 'react';
import { useBooker } from './BookerShell';
import { ErrorBanner, Field, Modal, SkeletonRows } from './ui';
import { fieldErrors, OfferAnswerSchema, OfferSendSchema, OfferTermsSchema, type OfferTermsInput } from '../../lib/booker/schemas';
import { listContacts } from '../../lib/booker/data';
import {
  answerOffer,
  archiveOffer,
  confirmShowFromOffer,
  createOffer,
  downloadOfferPdf,
  listOfferTemplates,
  listOffers,
  sendOffer,
  updateOfferTerms,
} from '../../lib/booker/offerData';
import {
  DEAL_TYPE_LABEL,
  OFFER_KIND_LABEL,
  OFFER_STATUS_BADGE,
  OFFER_STATUS_LABEL,
  dealSummary,
  draftFromShow,
  isLapsed,
  offerEmail,
  offerFilename,
  offerLabel,
  type BookerOffer,
  type OfferKind,
  type OfferTerms,
} from '../../lib/booker/offers';
import { DEAL_TYPES, type BookerShow, type BookerVenue, type RosterBand } from '../../lib/booker/types';
import { formatShowDate, todayIso } from '../../lib/booker/dates';
import { useLoad } from '../../lib/booker/useLoad';

interface Props {
  show: BookerShow;
  band: RosterBand | undefined;
  venue: BookerVenue | null;
  onClose: () => void;
  /** Called with the updated show when something changed it (accepting can confirm it) */
  onShowChanged?: (show: BookerShow) => void;
}

type View = { name: 'list' } | { name: 'edit'; offer: BookerOffer | null; kind: OfferKind } | { name: 'send'; offer: BookerOffer } | { name: 'answer'; offer: BookerOffer };

const TERM_KEYS = [
  'kind',
  'template_id',
  'band_name',
  'venue_name',
  'venue_city',
  'venue_state',
  'show_date',
  'load_in_time',
  'door_time',
  'set_time',
  'set_length_min',
  'deal_type',
  'fee',
  'deal_terms',
  'deposit_amount',
  'deposit_due_on',
  'hospitality',
  'terms',
  'buyer_name',
  'buyer_email',
  'expires_on',
] as const;
type TermKey = (typeof TERM_KEYS)[number];

/** Terms → raw string form values (times trimmed to HH:MM). */
function toValues(t: OfferTerms | BookerOffer): Record<TermKey, string> {
  const out = {} as Record<TermKey, string>;
  for (const k of TERM_KEYS) {
    const v = t[k];
    out[k] = v === null || v === undefined ? '' : typeof v === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(v) ? v.slice(0, 5) : String(v);
  }
  return out;
}

export default function ShowOffersDialog({ show, band, venue, onClose, onShowChanged }: Props) {
  const { booker } = useBooker();
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const { data, loading, error, reload } = useLoad(async () => {
    const [offers, templates, contacts] = await Promise.all([listOffers({ showId: show.id }), listOfferTemplates(), listContacts()]);
    return { offers, templates, contacts: contacts.filter(c => show.venue_id && c.venue_id === show.venue_id) };
  }, show.id);
  const [view, setView] = useState<View>({ name: 'list' });
  const [notice, setNotice] = useState('');

  const back = (message = '') => {
    setNotice(message);
    setView({ name: 'list' });
    void reload();
  };

  const title =
    view.name === 'list'
      ? 'Offers & deal memos'
      : view.name === 'edit'
        ? view.offer
          ? `Edit ${offerLabel(view.offer)}`
          : `New ${OFFER_KIND_LABEL[view.kind].toLowerCase()}`
        : view.name === 'send'
          ? `Send ${offerLabel(view.offer)}`
          : `Record the answer · ${offerLabel(view.offer)}`;

  return (
    <Modal title={title} onClose={onClose} wide>
      <p className="text-sm text-muted" style={{ marginTop: 0 }}>
        {band?.band_name ?? 'Band'} at {venue?.name ?? show.venue_name ?? 'venue'} · {formatShowDate(show.show_date, year)}
      </p>
      {error && <ErrorBanner message={error} onRetry={() => void reload()} />}
      {loading && !data ? (
        <SkeletonRows rows={3} />
      ) : !data ? null : view.name === 'list' ? (
        <OfferList
          offers={data.offers}
          today={today}
          year={year}
          notice={notice}
          onNew={kind => {
            setNotice('');
            setView({ name: 'edit', offer: null, kind });
          }}
          onEdit={o => setView({ name: 'edit', offer: o, kind: o.kind })}
          onSend={o => setView({ name: 'send', offer: o })}
          onAnswer={o => setView({ name: 'answer', offer: o })}
          onChanged={back}
          onMemoFrom={o => setView({ name: 'edit', offer: { ...o, kind: 'deal_memo', expires_on: null } as BookerOffer, kind: 'deal_memo' })}
        />
      ) : view.name === 'edit' ? (
        <OfferEditor
          key={view.offer?.id ?? `new-${view.kind}`}
          show={show}
          band={band}
          venue={venue}
          offer={view.offer}
          kind={view.kind}
          templates={data.templates}
          contacts={data.contacts}
          agencyName={booker.agency_name}
          today={today}
          onCancel={() => setView({ name: 'list' })}
          onSaved={(o, next) => {
            setNotice(`${offerLabel(o)} saved.`);
            void reload();
            setView(next === 'send' ? { name: 'send', offer: o } : { name: 'list' });
          }}
        />
      ) : view.name === 'send' ? (
        <SendOffer
          offer={view.offer}
          agencyName={booker.agency_name}
          senderName={booker.contact_name}
          onCancel={() => setView({ name: 'list' })}
          onSent={msg => back(msg)}
        />
      ) : (
        <AnswerOffer
          offer={view.offer}
          show={show}
          onCancel={() => setView({ name: 'list' })}
          onDone={(msg, changedShow) => {
            if (changedShow) onShowChanged?.(changedShow);
            back(msg);
          }}
        />
      )}
    </Modal>
  );
}

// ── List ────────────────────────────────────────────────────────────────────
function OfferList(props: {
  offers: BookerOffer[];
  today: string;
  year: number;
  notice: string;
  onNew: (kind: OfferKind) => void;
  onEdit: (o: BookerOffer) => void;
  onSend: (o: BookerOffer) => void;
  onAnswer: (o: BookerOffer) => void;
  onMemoFrom: (o: BookerOffer) => void;
  onChanged: (message: string) => void;
}) {
  const { offers, today, year, notice } = props;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setError('');
    try {
      await fn();
      props.onChanged(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '0.9rem' }}>
      <div aria-live="polite">
        {notice && (
          <p role="status" className="text-sm" style={{ color: 'var(--green)', margin: 0 }}>
            {notice}
          </p>
        )}
      </div>
      {error && <ErrorBanner message={error} />}
      {offers.length === 0 ? (
        <p className="text-sm text-muted" style={{ margin: 0, lineHeight: 1.6 }}>
          No offers for this show yet. An offer goes to the talent buyer as a PDF from your Gmail; once they say yes, a deal memo records the agreed terms. No signatures needed: the reply is the record.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
          {offers.map(o => {
            const lapsed = isLapsed(o, today);
            return (
              <li key={o.id} className="agent-handoff-row" style={{ alignItems: 'flex-start' }}>
                <span>
                  <strong>{offerLabel(o)}</strong> · {dealSummary(o)}
                  <span className="text-xs text-muted" style={{ display: 'block' }}>
                    {o.status === 'draft'
                      ? `Draft · saved ${formatShowDate(o.updated_at.slice(0, 10), year)}`
                      : o.sent_at
                        ? `Sent to ${o.sent_to} on ${formatShowDate(o.sent_at.slice(0, 10), year)}`
                        : 'Not emailed'}
                    {o.kind === 'offer' && o.expires_on && (o.status === 'sent' || o.status === 'draft') ? ` · stands until ${formatShowDate(o.expires_on, year)}` : ''}
                    {o.response_note ? ` · “${o.response_note}”` : ''}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {lapsed && <span className="badge badge-negotiation">Past stand-by date</span>}
                  <span className={`badge ${OFFER_STATUS_BADGE[o.status]}`}>{OFFER_STATUS_LABEL[o.status]}</span>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void run(`pdf:${o.id}`, () => downloadOfferPdf(o.id, offerFilename(o)), 'PDF downloaded.')}>
                    {busy === `pdf:${o.id}` ? 'Preparing…' : 'PDF'}
                  </button>
                  {o.status === 'draft' && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => props.onEdit(o)}>
                      Edit
                    </button>
                  )}
                  {(o.status === 'draft' || o.status === 'sent') && (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busy !== null} onClick={() => props.onSend(o)}>
                      {o.status === 'sent' ? 'Send again' : 'Send'}
                    </button>
                  )}
                  {(o.status === 'draft' || o.status === 'sent') && (
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => props.onAnswer(o)}>
                      Record answer
                    </button>
                  )}
                  {o.kind === 'offer' && o.status === 'accepted' && (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busy !== null} onClick={() => props.onMemoFrom(o)}>
                      Make deal memo
                    </button>
                  )}
                  {o.status === 'draft' &&
                    (confirmRemove === o.id ? (
                      <>
                        <button type="button" className="btn btn-danger btn-sm" disabled={busy !== null} onClick={() => void run(`rm:${o.id}`, () => archiveOffer(o.id), `${offerLabel(o)} removed.`)}>
                          {busy === `rm:${o.id}` ? 'Removing…' : 'Yes, remove'}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmRemove(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => setConfirmRemove(o.id)}>
                        Remove
                      </button>
                    ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={() => props.onNew('offer')}>
          + New offer
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => props.onNew('deal_memo')}>
          + New deal memo
        </button>
      </div>
    </div>
  );
}

// ── Edit ────────────────────────────────────────────────────────────────────
function OfferEditor(props: {
  show: BookerShow;
  band: RosterBand | undefined;
  venue: BookerVenue | null;
  offer: BookerOffer | null;
  kind: OfferKind;
  templates: { id: string; name: string; terms: string; hospitality: string | null; is_default: boolean }[];
  contacts: { id: string; name: string; email: string | null; title: string | null }[];
  agencyName: string;
  today: string;
  onCancel: () => void;
  onSaved: (o: BookerOffer, next: 'list' | 'send') => void;
}) {
  const { booker } = useBooker();
  const { show, offer, kind, templates, contacts } = props;
  const defaultTemplate = templates.find(t => t.is_default) ?? null;
  const firstContact = contacts.find(c => c.email) ?? contacts[0] ?? null;
  // A "new" editor seeded from an accepted offer (Make deal memo) has terms but no id yet.
  const isExisting = !!offer && !!offer.id && offer.status === 'draft' && offer.kind === kind;

  const draft = useMemo(
    () =>
      offer
        ? toValues({ ...offer, kind })
        : toValues(
            draftFromShow({
              show,
              band: props.band ?? { band_name: 'Band' },
              venue: props.venue,
              contact: firstContact,
              template: defaultTemplate,
              kind,
              agencyName: props.agencyName,
              today: props.today,
            }),
          ),
    // Seeded once per editor instance (the parent keys it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [values, setValues] = useState(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: TermKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValues(prev => ({ ...prev, [k]: v }));
  };

  /** Re-fill terms and hospitality from a template, keeping everything else. */
  const applyTemplate = (id: string) => {
    const tpl = templates.find(t => t.id === id) ?? null;
    const parsed = OfferTermsSchema.safeParse({ ...values, template_id: id || null });
    const base: OfferTerms = parsed.success ? (parsed.data as OfferTerms) : draftFromShow({ show, band: props.band ?? { band_name: 'Band' }, venue: props.venue, contact: null, template: null, kind, agencyName: props.agencyName, today: props.today });
    const filled = draftFromShow({
      show: { ...show, show_date: base.show_date },
      band: { band_name: base.band_name },
      venue: { name: base.venue_name, city: base.venue_city, state: base.venue_state },
      contact: base.buyer_name || base.buyer_email ? { name: base.buyer_name ?? '', email: base.buyer_email } : null,
      template: tpl,
      kind,
      agencyName: props.agencyName,
      today: props.today,
    });
    setValues(prev => ({ ...prev, template_id: id, terms: filled.terms ?? '', hospitality: filled.hospitality ?? '' }));
  };

  const pickContact = (id: string) => {
    const c = contacts.find(x => x.id === id);
    if (c) setValues(prev => ({ ...prev, buyer_name: c.name, buyer_email: c.email ?? '' }));
  };

  const save = async (e: FormEvent<HTMLFormElement>, next: 'list' | 'send') => {
    e.preventDefault();
    if (busy) return;
    setFormError('');
    const parsed = OfferTermsSchema.safeParse({ ...values, kind });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      const form = e.currentTarget;
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const terms: OfferTermsInput = parsed.data;
      const saved = isExisting && offer ? await updateOfferTerms(offer.id, terms) : await createOffer(booker.id, show.id, terms);
      props.onSaved(saved, next);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save. Try again.');
      setBusy(false);
    }
  };

  const [submitter, setSubmitter] = useState<'list' | 'send'>('list');

  return (
    <form onSubmit={e => void save(e, submitter)} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {formError && <ErrorBanner message={formError} />}
      <div className="grid-2">
        <Field label="Standard terms" hint={templates.length === 0 ? 'Add standard terms in Settings to fill this in automatically' : 'Fills the terms and hospitality below'}>
          {p => (
            <select {...p} className="select" value={values.template_id} onChange={e => applyTemplate(e.target.value)}>
              <option value="">None</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>
          )}
        </Field>
        {contacts.length > 0 ? (
          <Field label="Talent buyer" hint="Contacts saved at this venue">
            {p => (
              <select {...p} className="select" value={contacts.find(c => c.name === values.buyer_name)?.id ?? ''} onChange={e => pickContact(e.target.value)}>
                <option value="">Type one below</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.title ? ` — ${c.title}` : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : (
          <div />
        )}
      </div>

      <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.9rem' }}>
        <legend className="eyebrow" style={{ color: 'var(--accent)', marginBottom: '0.5rem' }}>
          The engagement
        </legend>
        <div className="grid-3">
          <Field label="Artist" required error={errors.band_name}>
            {p => <input {...p} className="input" value={values.band_name} onChange={set('band_name')} />}
          </Field>
          <Field label="Venue" required error={errors.venue_name}>
            {p => <input {...p} className="input" value={values.venue_name} onChange={set('venue_name')} />}
          </Field>
          <Field label="Date" required error={errors.show_date}>
            {p => <input {...p} className="input" type="date" value={values.show_date} onChange={set('show_date')} />}
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Town" error={errors.venue_city}>
            {p => <input {...p} className="input" value={values.venue_city} onChange={set('venue_city')} />}
          </Field>
          <Field label="State" error={errors.venue_state}>
            {p => <input {...p} className="input" value={values.venue_state} onChange={set('venue_state')} />}
          </Field>
        </div>
        <div className="grid-4">
          <Field label="Load-in" error={errors.load_in_time}>
            {p => <input {...p} className="input" type="time" value={values.load_in_time} onChange={set('load_in_time')} />}
          </Field>
          <Field label="Doors" error={errors.door_time}>
            {p => <input {...p} className="input" type="time" value={values.door_time} onChange={set('door_time')} />}
          </Field>
          <Field label="Set time" error={errors.set_time}>
            {p => <input {...p} className="input" type="time" value={values.set_time} onChange={set('set_time')} />}
          </Field>
          <Field label="Set length (min)" error={errors.set_length_min}>
            {p => <input {...p} className="input" inputMode="numeric" value={values.set_length_min} onChange={set('set_length_min')} />}
          </Field>
        </div>
      </fieldset>

      <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.9rem' }}>
        <legend className="eyebrow" style={{ color: 'var(--accent)', marginBottom: '0.5rem' }}>
          The deal
        </legend>
        <div className="grid-3">
          <Field label="Deal type" error={errors.deal_type}>
            {p => (
              <select {...p} className="select" value={values.deal_type} onChange={set('deal_type')}>
                <option value="">To be agreed</option>
                {DEAL_TYPES.map(d => (
                  <option key={d} value={d}>
                    {DEAL_TYPE_LABEL[d]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Fee ($)" error={errors.fee}>
            {p => <input {...p} className="input" inputMode="decimal" value={values.fee} onChange={set('fee')} />}
          </Field>
          {kind === 'offer' ? (
            <Field label="Offer stands until" error={errors.expires_on}>
              {p => <input {...p} className="input" type="date" value={values.expires_on} onChange={set('expires_on')} />}
            </Field>
          ) : (
            <div />
          )}
        </div>
        {(values.deal_type === 'door' || values.deal_type === 'percentage' || values.deal_type === 'guarantee_plus' || values.deal_type === 'other' || values.deal_terms) && (
          <Field label="Deal terms in words" hint='e.g. "80% of door after $300 house costs"' error={errors.deal_terms}>
            {p => <input {...p} className="input" maxLength={1000} value={values.deal_terms} onChange={set('deal_terms')} />}
          </Field>
        )}
        <div className="grid-2">
          <Field label="Deposit ($)" error={errors.deposit_amount}>
            {p => <input {...p} className="input" inputMode="decimal" value={values.deposit_amount} onChange={set('deposit_amount')} />}
          </Field>
          <Field label="Deposit due" error={errors.deposit_due_on}>
            {p => <input {...p} className="input" type="date" value={values.deposit_due_on} onChange={set('deposit_due_on')} />}
          </Field>
        </div>
      </fieldset>

      <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.9rem' }}>
        <legend className="eyebrow" style={{ color: 'var(--accent)', marginBottom: '0.5rem' }}>
          Terms and buyer
        </legend>
        <Field label="Hospitality" hint="Meals, drinks, lodging, guest list" error={errors.hospitality}>
          {p => <textarea {...p} className="textarea" maxLength={2000} value={values.hospitality} onChange={set('hospitality')} style={{ minHeight: 60 }} />}
        </Field>
        <Field label="Terms" hint="Printed on the document as written" error={errors.terms}>
          {p => <textarea {...p} className="textarea" maxLength={8000} value={values.terms} onChange={set('terms')} style={{ minHeight: 140 }} />}
        </Field>
        <div className="grid-2">
          <Field label="Talent buyer" error={errors.buyer_name}>
            {p => <input {...p} className="input" value={values.buyer_name} onChange={set('buyer_name')} />}
          </Field>
          <Field label="Buyer email" error={errors.buyer_email}>
            {p => <input {...p} className="input" type="email" value={values.buyer_email} onChange={set('buyer_email')} />}
          </Field>
        </div>
      </fieldset>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
        <button type="button" className="btn btn-ghost" onClick={props.onCancel} disabled={busy}>
          Back
        </button>
        <button type="submit" className="btn btn-secondary" disabled={busy} aria-busy={busy && submitter === 'list'} onClick={() => setSubmitter('list')}>
          {busy && submitter === 'list' ? 'Saving…' : 'Save draft'}
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy && submitter === 'send'} onClick={() => setSubmitter('send')}>
          {busy && submitter === 'send' ? 'Saving…' : 'Save and send'}
        </button>
      </div>
    </form>
  );
}

// ── Send ────────────────────────────────────────────────────────────────────
function SendOffer({ offer, agencyName, senderName, onCancel, onSent }: { offer: BookerOffer; agencyName: string; senderName: string | null; onCancel: () => void; onSent: (message: string) => void }) {
  const preset = offerEmail(offer, agencyName, senderName);
  const [values, setValues] = useState({ to_email: offer.buyer_email ?? '', to_name: offer.buyer_name ?? '', subject: preset.subject, body: preset.body });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValues(prev => ({ ...prev, [k]: v }));
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setFormError('');
    const parsed = OfferSendSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await sendOffer(offer.id, parsed.data);
      onSent(result.warning ?? `${offerLabel(offer)} sent to ${parsed.data.to_email} with the PDF attached. It's in your Gmail Sent folder and your email history.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not send. Try again.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={e => void submit(e)} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {formError && <ErrorBanner message={formError} />}
      <p className="text-sm text-muted" style={{ margin: 0 }}>
        Goes from your connected Gmail with <strong style={{ color: 'var(--text)' }}>{offerFilename(offer)}</strong> attached. Replies come to your inbox.
      </p>
      <div className="grid-2">
        <Field label="To (email)" required error={errors.to_email}>
          {p => <input {...p} className="input" type="email" value={values.to_email} onChange={set('to_email')} />}
        </Field>
        <Field label="Name" error={errors.to_name}>
          {p => <input {...p} className="input" value={values.to_name} onChange={set('to_name')} />}
        </Field>
      </div>
      <Field label="Subject" required error={errors.subject}>
        {p => <input {...p} className="input" maxLength={200} value={values.subject} onChange={set('subject')} />}
      </Field>
      <Field label="Message" required error={errors.body}>
        {p => <textarea {...p} className="textarea" value={values.body} onChange={set('body')} style={{ minHeight: 180 }} />}
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Back
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
          {busy ? 'Sending…' : 'Send with PDF'}
        </button>
      </div>
    </form>
  );
}

// ── Answer ──────────────────────────────────────────────────────────────────
function AnswerOffer({ offer, show, onCancel, onDone }: { offer: BookerOffer; show: BookerShow; onCancel: () => void; onDone: (message: string, changedShow: BookerShow | null) => void }) {
  const [status, setStatus] = useState<'accepted' | 'declined' | 'withdrawn'>('accepted');
  const [note, setNote] = useState('');
  const canConfirm = offer.kind === 'offer' && show.status !== 'confirmed' && show.status !== 'played';
  const [confirmShow, setConfirmShow] = useState(canConfirm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const parsed = OfferAnswerSchema.safeParse({ status, response_note: note });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the note.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await answerOffer(offer.id, parsed.data);
      const confirming = status === 'accepted' && canConfirm && confirmShow;
      const changedShow = confirming ? await confirmShowFromOffer(show.id, offer) : null;
      onDone(
        status === 'accepted'
          ? `${offerLabel(offer)} marked accepted${confirming ? ' and the show is now confirmed' : ''}.${offer.kind === 'offer' ? ' You can make a deal memo from it.' : ''}`
          : status === 'declined'
            ? `${offerLabel(offer)} marked declined.`
            : `${offerLabel(offer)} withdrawn.`,
        changedShow,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={e => void submit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {error && <ErrorBanner message={error} />}
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className="field-label" style={{ marginBottom: '0.5rem' }}>
          What did the buyer say?
        </legend>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {(
            [
              ['accepted', 'Accepted'],
              ['declined', 'Declined'],
              ['withdrawn', 'I’m withdrawing it'],
            ] as const
          ).map(([v, label]) => (
            <label key={v} style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', minHeight: 44, cursor: 'pointer' }}>
              <input type="radio" name="offer-answer" value={v} checked={status === v} onChange={() => setStatus(v)} style={{ width: 18, height: 18 }} />
              <span style={{ color: 'var(--text)', fontWeight: 700 }}>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Note (optional)" hint="e.g. accepted by phone, or why they passed">
        {p => <input {...p} className="input" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} />}
      </Field>
      {status === 'accepted' && canConfirm && (
        <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer', minHeight: 44 }}>
          <input type="checkbox" checked={confirmShow} onChange={e => setConfirmShow(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} />
          <span className="text-sm" style={{ color: 'var(--text)' }}>
            Mark the show confirmed with these terms ({dealSummary(offer)}). Clears the hold.
          </span>
        </label>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Back
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
          {busy ? 'Saving…' : 'Save answer'}
        </button>
      </div>
    </form>
  );
}
