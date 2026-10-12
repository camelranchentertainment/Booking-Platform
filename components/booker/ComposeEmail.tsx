// components/booker/ComposeEmail.tsx
// "Send email" dialog for the Booking Agent workspace. Opened from a venue, a
// contact or a band with the recipient and context filled in. Sends through
// /api/booker/messages/send, which logs the message against the venue, band,
// contact and show so it shows up in each history, with an optional follow-up
// reminder that appears on Home when it comes due.
//
// The submit button is disabled while sending (no double sends) and nothing
// typed is lost when a send fails.

import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useBooker } from './BookerShell';
import { ErrorBanner, Field, Modal } from './ui';
import { sendMessage, type SendResult } from '../../lib/booker/data';
import { MessageSendSchema, fieldErrors } from '../../lib/booker/schemas';
import { defaultFollowup, replyAddress } from '../../lib/booker/emailFormat';
import { formatShowDate, todayIso } from '../../lib/booker/dates';
import { venueLabel } from '../../lib/booker/workspace';
import type { BookerShow, BookerVenue, RosterBand } from '../../lib/booker/types';

export interface Recipient {
  email: string;
  name?: string | null;
  contactId?: string;
  /** e.g. "Sarah Lee — Talent buyer" or "Venue booking inbox" */
  label: string;
}

interface Props {
  recipients: Recipient[];
  bands: RosterBand[];
  /** Shows the email can be about (filtered to the chosen band in the picker). */
  shows?: BookerShow[];
  venuesById?: ReadonlyMap<string, BookerVenue>;
  venueId?: string;
  defaultRecipient?: number;
  defaultBandId?: string;
  defaultShowId?: string;
  defaultSubject?: string;
  onClose: () => void;
  onSent: (result: SendResult) => void;
}

const OTHER = 'other';
const ERROR_STYLE = { fontSize: '0.78rem', color: 'var(--red)', fontWeight: 700 } as const;

export default function ComposeEmail({ recipients, bands, shows = [], venuesById = new Map(), venueId, defaultRecipient = 0, defaultBandId, defaultShowId, defaultSubject = '', onClose, onSent }: Props) {
  const { booker } = useBooker();
  const { user } = useAuth();
  const today = todayIso();
  const year = Number(today.slice(0, 4));

  const [to, setTo] = useState<string>(recipients.length > 0 ? String(Math.min(defaultRecipient, recipients.length - 1)) : OTHER);
  const [otherEmail, setOtherEmail] = useState('');
  const [otherName, setOtherName] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const [rosterId, setRosterId] = useState(defaultBandId ?? '');
  const [showId, setShowId] = useState(defaultShowId ?? '');
  const [followup, setFollowup] = useState(true);
  const [followupOn, setFollowupOn] = useState(defaultFollowup(today));
  const [copyToSelf, setCopyToSelf] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const replyTo = replyAddress(booker.contact_email, user?.email ?? null);
  const activeBands = bands.filter(b => b.status === 'active' || b.id === rosterId);
  const showOptions = useMemo(
    () => shows.filter(s => s.status !== 'cancelled' && (!rosterId || s.roster_id === rosterId) && (!venueId || s.venue_id === venueId)).sort((a, b) => a.show_date.localeCompare(b.show_date)),
    [shows, rosterId, venueId],
  );

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setFormError('');
    const chosen = to === OTHER ? null : recipients[Number(to)];
    const raw = {
      to_email: chosen ? chosen.email : otherEmail,
      to_name: chosen ? (chosen.name ?? '') : otherName,
      subject,
      body,
      roster_id: rosterId,
      venue_id: venueId ?? '',
      contact_id: chosen?.contactId ?? '',
      show_id: showOptions.some(s => s.id === showId) ? showId : '',
      followup_on: followup ? followupOn : '',
      copy_to_self: copyToSelf,
    };
    const parsed = MessageSendSchema.safeParse(raw);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      const first = Object.keys(errs)[0];
      const idByField: Record<string, string> = { to_email: 'ce-other-email', subject: 'ce-subject', body: 'ce-body', followup_on: 'ce-followup' };
      if (first && idByField[first]) document.getElementById(idByField[first])?.focus();
      return;
    }
    if (parsed.data.followup_on && parsed.data.followup_on < today) {
      setErrors({ followup_on: 'Pick a follow-up date today or later' });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await sendMessage(parsed.data);
      onSent(result);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'The email could not be sent.');
      setBusy(false);
    }
  };

  return (
    <Modal title="Send email" onClose={busy ? () => undefined : onClose} wide>
      {formError && <ErrorBanner message={formError} />}
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <Field label="To" required error={to !== OTHER ? errors.to_email : undefined}>
          {p => (
            <select {...p} className="select" value={to} onChange={e => setTo(e.target.value)} disabled={busy}>
              {recipients.map((r, i) => (
                <option key={`${r.email}-${i}`} value={String(i)}>
                  {r.label} — {r.email}
                </option>
              ))}
              <option value={OTHER}>Someone else…</option>
            </select>
          )}
        </Field>
        {to === OTHER && (
          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="ce-other-email">
                Email address <span aria-hidden="true" style={{ color: 'var(--accent)' }}>*</span>
              </label>
              <input
                id="ce-other-email"
                className="input"
                type="email"
                autoComplete="email"
                value={otherEmail}
                onChange={e => setOtherEmail(e.target.value)}
                aria-invalid={errors.to_email ? true : undefined}
                aria-describedby={errors.to_email ? 'ce-other-email-err' : undefined}
                disabled={busy}
              />
              {errors.to_email && (
                <div id="ce-other-email-err" role="alert" style={ERROR_STYLE}>
                  {errors.to_email}
                </div>
              )}
            </div>
            <Field label="Name" error={errors.to_name}>
              {p => <input {...p} className="input" value={otherName} onChange={e => setOtherName(e.target.value)} autoComplete="name" disabled={busy} />}
            </Field>
          </div>
        )}

        {(activeBands.length > 0 || showOptions.length > 0) && (
          <div className="grid-2">
            <Field label="About band" hint="Files this email under the band too">
              {p => (
                <select
                  {...p}
                  className="select"
                  value={rosterId}
                  onChange={e => {
                    setRosterId(e.target.value);
                    setShowId('');
                  }}
                  disabled={busy}
                >
                  <option value="">No specific band</option>
                  {activeBands.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.band_name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="About show">
              {p => (
                <select {...p} className="select" value={showId} onChange={e => setShowId(e.target.value)} disabled={busy || showOptions.length === 0}>
                  <option value="">{showOptions.length === 0 ? 'No shows to link' : 'No specific show'}</option>
                  {showOptions.map(s => (
                    <option key={s.id} value={s.id}>
                      {formatShowDate(s.show_date, year)} · {bands.find(b => b.id === s.roster_id)?.band_name ?? 'Band'} · {venueLabel(s, venuesById)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor="ce-subject">
            Subject <span aria-hidden="true" style={{ color: 'var(--accent)' }}>*</span>
          </label>
          <input
            id="ce-subject"
            className="input"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            maxLength={200}
            aria-invalid={errors.subject ? true : undefined}
            aria-describedby={errors.subject ? 'ce-subject-err' : undefined}
            disabled={busy}
          />
          {errors.subject && (
            <div id="ce-subject-err" role="alert" style={ERROR_STYLE}>
              {errors.subject}
            </div>
          )}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="ce-body">
            Message <span aria-hidden="true" style={{ color: 'var(--accent)' }}>*</span>
          </label>
          <textarea
            id="ce-body"
            className="textarea"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={10}
            maxLength={20000}
            aria-invalid={errors.body ? true : undefined}
            aria-describedby={errors.body ? 'ce-body-err' : undefined}
            disabled={busy}
            style={{ minHeight: 200 }}
          />
          {errors.body && (
            <div id="ce-body-err" role="alert" style={ERROR_STYLE}>
              {errors.body}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text)' }}>
            <input type="checkbox" checked={followup} onChange={e => setFollowup(e.target.checked)} disabled={busy} style={{ width: 18, height: 18 }} />
            Remind me to follow up on
          </label>
          <input
            id="ce-followup"
            className="input"
            type="date"
            value={followupOn}
            min={today}
            onChange={e => setFollowupOn(e.target.value)}
            disabled={busy || !followup}
            aria-label="Follow-up date"
            aria-invalid={errors.followup_on ? true : undefined}
            style={{ width: 'auto' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text)' }}>
            <input type="checkbox" checked={copyToSelf} onChange={e => setCopyToSelf(e.target.checked)} disabled={busy} style={{ width: 18, height: 18 }} />
            Send me a copy
          </label>
        </div>
        {errors.followup_on && (
          <div role="alert" style={ERROR_STYLE}>
            {errors.followup_on}
          </div>
        )}

        <p className="text-xs text-muted" style={{ margin: 0, lineHeight: 1.6 }}>
          Sends as <strong style={{ color: 'var(--text)' }}>{booker.agency_name}</strong> through Camel Ranch Booking.{' '}
          {replyTo ? (
            <>
              Replies go straight to <strong style={{ color: 'var(--text)' }}>{replyTo}</strong>.
            </>
          ) : (
            <>Add your email in Settings so replies reach you.</>
          )}
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !replyTo} aria-busy={busy}>
            {busy ? 'Sending…' : 'Send email'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
