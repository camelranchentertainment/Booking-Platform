// components/booker/ComposeEmail.tsx
// "Send email" dialog for the Booking Agent workspace. Opened from a venue, a
// contact or a band with the recipient and context filled in. Sends through
// /api/booker/messages/send, which logs the message against the venue, band,
// contact and show so it shows up in each history, with an optional follow-up
// reminder that appears on Home when it comes due.
//
// Start from a template or "Draft with AI": both fill the subject and message
// for the agent to edit; neither sends anything. Filling over something the
// agent already typed asks first. Anything left in [brackets] must be filled
// in before the email can go.
//
// Email always goes out through the agent's own connected Gmail (the same
// model as the band side). Until Gmail is connected, Send stays disabled and
// the dialog points to Settings; the agent can still write and draft.
//
// The submit button is disabled while sending (no double sends) and nothing
// typed is lost when a send fails.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useBooker } from './BookerShell';
import { ErrorBanner, Field, Modal } from './ui';
import { draftMessage, getGmailStatus, sendMessage, type GmailStatus, type SendResult } from '../../lib/booker/data';
import { MessageSendSchema, fieldErrors } from '../../lib/booker/schemas';
import { defaultFollowup } from '../../lib/booker/emailFormat';
import { formatShowDate, formatTime, todayIso } from '../../lib/booker/dates';
import { formatMoney } from '../../lib/booker/commission';
import { EMAIL_TEMPLATES, firstName, hasPlaceholders, renderTemplate, templateByKey, type TemplateAudience } from '../../lib/booker/templates';
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
  /** Pre-filled message, e.g. a draft the assistant proposed */
  defaultBody?: string;
  /** Who this is usually written to; that template set is listed first. */
  audience?: TemplateAudience;
  onClose: () => void;
  onSent: (result: SendResult) => void;
}

const OTHER = 'other';
const ERROR_STYLE = { fontSize: '0.78rem', color: 'var(--red)', fontWeight: 700 } as const;

export default function ComposeEmail({ recipients, bands, shows = [], venuesById = new Map(), venueId, defaultRecipient = 0, defaultBandId, defaultShowId, defaultSubject = '', defaultBody = '', audience = 'venue', onClose, onSent }: Props) {
  const { booker } = useBooker();
  const today = todayIso();
  const year = Number(today.slice(0, 4));

  const [to, setTo] = useState<string>(recipients.length > 0 ? String(Math.min(defaultRecipient, recipients.length - 1)) : OTHER);
  const [otherEmail, setOtherEmail] = useState('');
  const [otherName, setOtherName] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [rosterId, setRosterId] = useState(defaultBandId ?? '');
  const [showId, setShowId] = useState(defaultShowId ?? '');
  const [followup, setFollowup] = useState(true);
  const [followupOn, setFollowupOn] = useState(defaultFollowup(today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [templateKey, setTemplateKey] = useState('');
  const [aiAssisted, setAiAssisted] = useState(defaultBody !== '');
  const [aiInstructions, setAiInstructions] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [assistError, setAssistError] = useState('');
  /** A fill waiting for "Replace what you wrote?" */
  const [pending, setPending] = useState<{ subject: string; body: string; source: 'template' | 'ai'; key: string } | null>(null);
  const [lastFilled, setLastFilled] = useState(defaultBody);
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [gmailCheckFailed, setGmailCheckFailed] = useState(false);

  // Sending needs a connected Gmail; until the check answers, Send stays off.
  useEffect(() => {
    let cancelled = false;
    getGmailStatus()
      .then(s => !cancelled && setGmail(s))
      .catch(() => !cancelled && setGmailCheckFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);
  const gmailReady = gmail?.connected === true;
  const gmailMissing = gmail !== null && !gmail.connected;
  const activeBands = bands.filter(b => b.status === 'active' || b.id === rosterId);
  const showOptions = useMemo(
    () => shows.filter(s => s.status !== 'cancelled' && (!rosterId || s.roster_id === rosterId) && (!venueId || s.venue_id === venueId)).sort((a, b) => a.show_date.localeCompare(b.show_date)),
    [shows, rosterId, venueId],
  );

  const chosenRecipient = to === OTHER ? null : recipients[Number(to)];
  const recipientName = chosenRecipient ? chosenRecipient.name : otherName;

  /** What the templates can fill from the agent's own data. */
  const templateContext = () => {
    const band = bands.find(b => b.id === rosterId);
    const show = showOptions.find(s => s.id === showId);
    const venue = venuesById.get(venueId ?? show?.venue_id ?? '');
    return {
      band: band?.band_name,
      date: show ? formatShowDate(show.show_date, year) : null,
      venue: venue?.name ?? show?.venue_name ?? null,
      city: venue?.city ?? show?.venue_city ?? null,
      contactFirst: audience === 'band' ? firstName(recipientName ?? band?.contact_name) : firstName(recipientName),
      setTime: formatTime(show?.set_time),
      loadIn: formatTime(show?.load_in_time),
      fee: show?.fee !== null && show?.fee !== undefined ? formatMoney(show.fee) : null,
      agentName: booker.contact_name,
      agency: booker.agency_name,
      agentPhone: booker.contact_phone,
    };
  };

  const applyFill = (fill: { subject: string; body: string; source: 'template' | 'ai'; key: string }, confirmed = false) => {
    const typedSomething = body.trim() !== '' && body !== lastFilled;
    if (typedSomething && !confirmed) {
      setPending(fill);
      return;
    }
    setPending(null);
    setSubject(fill.subject);
    setBody(fill.body);
    setLastFilled(fill.body);
    setTemplateKey(fill.source === 'template' ? fill.key : templateKey);
    setAiAssisted(fill.source === 'ai' ? true : aiAssisted);
    setErrors({});
  };

  const fillFromTemplate = (key: string) => {
    const tpl = templateByKey(key);
    if (!tpl) return;
    applyFill({ ...renderTemplate(tpl, templateContext()), source: 'template', key });
  };

  const draftWithAi = async () => {
    setAssistError('');
    setDrafting(true);
    try {
      const { draft } = await draftMessage({
        template_key: templateKey || null,
        instructions: aiInstructions.trim() || null,
        to_name: recipientName ?? null,
        audience,
        roster_id: rosterId || null,
        venue_id: venueId ?? null,
        contact_id: chosenRecipient?.contactId ?? null,
        show_id: showOptions.some(s => s.id === showId) ? showId : null,
      });
      applyFill({ ...draft, source: 'ai', key: templateKey });
    } catch (err) {
      setAssistError(err instanceof Error ? err.message : 'AI drafting failed.');
    } finally {
      setDrafting(false);
    }
  };

  const orderedTemplates = [...EMAIL_TEMPLATES].sort((a, b) => Number(b.audience === audience) - Number(a.audience === audience));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy || !gmailReady) return;
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
      // Gmail keeps the agent's copy in Sent.
      copy_to_self: false,
      template_key: templateKey,
      ai_assisted: aiAssisted,
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
    if (hasPlaceholders(parsed.data.subject) || hasPlaceholders(parsed.data.body)) {
      const where = hasPlaceholders(parsed.data.subject) ? 'subject' : 'body';
      setErrors({ [where]: 'Fill in the [bracketed] parts before sending.' });
      document.getElementById(where === 'subject' ? 'ce-subject' : 'ce-body')?.focus();
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
      {gmailMissing && (
        <div role="status" style={{ border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', padding: '0.75rem 0.9rem', marginBottom: '0.9rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="text-sm" style={{ color: 'var(--text)', flex: '1 1 260px' }}>
            <strong>Connect your Gmail to send.</strong> Email from the workspace goes out from your own Gmail account. You can still write and draft here.
          </span>
          <Link href="/agent/settings#gmail" className="btn btn-secondary btn-sm">
            Go to Settings
          </Link>
        </div>
      )}
      {gmailCheckFailed && <ErrorBanner message="Could not check your Gmail connection. Reload to try again." />}
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

        <section aria-labelledby="ce-assist-h" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', padding: '0.8rem 0.9rem', display: 'grid', gap: '0.65rem' }}>
          <h3 id="ce-assist-h" className="eyebrow" style={{ color: 'var(--accent)', fontSize: '0.9rem', margin: 0 }}>
            Get a head start
          </h3>
          <div style={{ display: 'grid', gap: '0.65rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', alignItems: 'end' }}>
            <div>
              <label className="field-label" htmlFor="ce-template" style={{ display: 'block', marginBottom: 4 }}>
                Start from a template
              </label>
              <select
                id="ce-template"
                className="select"
                value={templateKey}
                onChange={e => {
                  // The key is recorded only once the template is actually applied.
                  if (e.target.value) fillFromTemplate(e.target.value);
                  else setTemplateKey('');
                }}
                disabled={busy || drafting}
              >
                <option value="">Blank email</option>
                <optgroup label={audience === 'band' ? 'To your band' : 'To venues and buyers'}>
                  {orderedTemplates.filter(t => t.audience === audience).map(t => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={audience === 'band' ? 'To venues and buyers' : 'To your band'}>
                  {orderedTemplates.filter(t => t.audience !== audience).map(t => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="ce-ai" style={{ display: 'block', marginBottom: 4 }}>
                Or tell AI what to write <span className="text-muted">(optional)</span>
              </label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  id="ce-ai"
                  className="input"
                  value={aiInstructions}
                  onChange={e => setAiInstructions(e.target.value)}
                  maxLength={1000}
                  placeholder="e.g. ask for a Saturday in November, mention the Austin show"
                  disabled={busy || drafting}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void draftWithAi();
                    }
                  }}
                />
                <button type="button" className="btn btn-secondary" onClick={() => void draftWithAi()} disabled={busy || drafting} aria-busy={drafting} style={{ whiteSpace: 'nowrap' }}>
                  {drafting ? 'Drafting…' : '✨ Draft'}
                </button>
              </div>
            </div>
          </div>
          <div aria-live="polite">
            {drafting && <p className="text-xs text-muted" style={{ margin: 0 }}>Writing a draft from your band, venue and show details…</p>}
            {assistError && (
              <p role="alert" className="text-xs" style={{ color: 'var(--red)', margin: 0 }}>
                {assistError}
              </p>
            )}
            {pending && (
              <div role="alertdialog" aria-label="Replace your message?" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="text-sm" style={{ color: 'var(--text)' }}>
                  Replace what you’ve written with the {pending.source === 'ai' ? 'AI draft' : 'template'}?
                </span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyFill(pending, true)}>
                  Replace
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPending(null)}>
                  Keep mine
                </button>
              </div>
            )}
            {!pending && !drafting && hasPlaceholders(body) && (
              <p className="text-xs" style={{ color: 'var(--accent)', margin: 0 }}>
                Fill in the [bracketed] parts before sending. Always read a draft before it goes out.
              </p>
            )}
          </div>
        </section>

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
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minHeight: 44, cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text)' }}>
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
        </div>
        {errors.followup_on && (
          <div role="alert" style={ERROR_STYLE}>
            {errors.followup_on}
          </div>
        )}

        {gmail?.connected && (
          <p className="text-xs text-muted" style={{ margin: 0, lineHeight: 1.6 }}>
            Sends from your Gmail, <strong style={{ color: 'var(--text)' }}>{gmail.gmail_address}</strong>. Replies come to that inbox and a copy stays in your Sent folder.
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !gmailReady} aria-busy={busy}>
            {busy ? 'Sending…' : 'Send email'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
