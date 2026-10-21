// components/booker/BandAccountPanel.tsx
// The "Band account" part of a roster band's page (build list item 3).
//
//   Not linked  → invite the band's admin by email
//   Invited     → waiting; withdraw the invite
//   Linked      → choose what the band sees, send confirmed shows to the
//                 band's calendar, see what's waiting or was declined, read the
//                 band's own calendar, end the link
//
// The database decides what is allowed and copies only the shared fields; this
// component only shows the state and calls the checked functions.

import { useMemo, useState } from 'react';
import { addDays, formatShowDate, formatTime } from '../../lib/booker/dates';
import {
  currentLink,
  handoffChip,
  latestProposalByShow,
  looksLikeEmail,
  sendableShows,
  sharingSummary,
  type BandLink,
  type BandProposal,
  type ShareSettings,
} from '../../lib/booker/handoff';
import { bandCalendar, cancelBandLink, inviteBand, sendShowToBand, setBandSharing, withdrawShowFromBand } from '../../lib/booker/handoffData';
import { useLoad } from '../../lib/booker/useLoad';
import { venueLabel } from '../../lib/booker/workspace';
import type { BookerShow, BookerVenue, RosterBand } from '../../lib/booker/types';
import { ErrorBanner, SkeletonRows } from './ui';

interface Props {
  band: RosterBand;
  shows: readonly BookerShow[];
  venuesById: ReadonlyMap<string, BookerVenue>;
  links: readonly BandLink[];
  proposals: readonly BandProposal[];
  today: string;
  year: number;
  onChanged: () => void;
}

const SHARE_OPTIONS: { key: keyof ShareSettings; label: string; hint: string }[] = [
  { key: 'share_times', label: 'Times', hint: 'Load-in, doors, set time and length' },
  { key: 'share_deal', label: 'Deal and fee', hint: 'Deal type and the agreed fee' },
  { key: 'share_deal_notes', label: 'Deal notes', hint: 'Your notes on the deal terms' },
  { key: 'share_commission', label: 'Your commission', hint: 'Your rate and the amount on that show' },
];

const READ_IN_DAYS = 90;

const CAL_STATUS: Record<string, string> = {
  negotiation: 'In talks',
  hold: 'Hold',
  contract: 'Contract out',
  confirmed: 'Confirmed',
  advancing: 'Advancing',
  completed: 'Played',
};

export default function BandAccountPanel({ band, shows, venuesById, links, proposals, today, year, onChanged }: Props) {
  const link = currentLink(links, band.id);
  const linked = link?.status === 'active';
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState(band.contact_email ?? '');
  const [emailError, setEmailError] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [sharing, setSharing] = useState<ShareSettings | null>(null);

  const linkProposals = useMemo(() => (link ? proposals.filter(p => p.link_id === link.id) : []), [link, proposals]);
  const latest = useMemo(() => latestProposalByShow(linkProposals), [linkProposals]);
  const toSend = useMemo(() => (linked ? sendableShows(shows, band.id, latest, today) : []), [linked, shows, band.id, latest, today]);
  const waiting = linkProposals.filter(p => p.status === 'pending');

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await fn();
      setNotice(done);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!looksLikeEmail(email)) {
      setEmailError('Enter the email the band admin signs in with.');
      return;
    }
    setEmailError('');
    void run('invite', () => inviteBand(band.id, email), `Invite sent to ${email.trim()}. It appears in their Settings when they sign in.`);
  };

  const shareValues: ShareSettings | null = link
    ? (sharing ?? { share_times: link.share_times, share_deal: link.share_deal, share_deal_notes: link.share_deal_notes, share_commission: link.share_commission })
    : null;
  const sharingDirty =
    !!link && !!sharing && SHARE_OPTIONS.some(o => sharing[o.key] !== link[o.key]);

  return (
    <section aria-labelledby="band-account-h" className="card mb-6" id="band-account">
      <div className="flex items-center justify-between mb-3" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <h2 id="band-account-h" className="agent-card-title">
          Band account
        </h2>
        <span className={`badge ${linked ? 'badge-confirmed' : link?.status === 'invited' ? 'badge-hold' : 'badge-pitch'}`}>
          {linked ? 'Linked' : link?.status === 'invited' ? 'Invite sent' : 'Not linked'}
        </span>
      </div>

      <div aria-live="polite">
        {notice && (
          <p role="status" className="text-sm" style={{ color: 'var(--green)', margin: '0 0 0.75rem' }}>
            {notice}
          </p>
        )}
      </div>
      {error && <ErrorBanner message={error} />}

      {/* ── Not linked: invite ── */}
      {(!link || link.status === 'declined' || link.status === 'revoked') && (
        <>
          <p className="text-sm text-muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
            {link?.status === 'declined'
              ? `${link.invited_email} declined your invite. You can invite again.`
              : link?.status === 'revoked'
                ? 'The link with this band has ended. You keep your own record of their shows. You can invite them again.'
                : `If ${band.band_name} runs on Camel Ranch, link to their account. You can then send confirmed shows straight to their calendar (they approve each one) and see their dates so you don't book over them.`}
          </p>
          <form onSubmit={invite} noValidate style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 16rem', marginBottom: 0 }}>
              <label className="field-label" htmlFor="band-invite-email">
                Band admin&rsquo;s email
              </label>
              <input
                id="band-invite-email"
                className="input"
                type="email"
                autoComplete="off"
                value={email}
                onChange={e => setEmail(e.target.value)}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? 'band-invite-error' : 'band-invite-hint'}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy === 'invite'} aria-busy={busy === 'invite'}>
              {busy === 'invite' ? 'Sending…' : 'Invite to link'}
            </button>
          </form>
          {emailError ? (
            <p id="band-invite-error" role="alert" className="text-sm" style={{ color: 'var(--red)', fontWeight: 700, margin: '0.4rem 0 0' }}>
              {emailError}
            </p>
          ) : (
            <p id="band-invite-hint" className="text-xs text-muted" style={{ margin: '0.4rem 0 0' }}>
              Use the email they sign in to Camel Ranch with. Nothing links until they accept.
            </p>
          )}
        </>
      )}

      {/* ── Invited: waiting ── */}
      {link?.status === 'invited' && (
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <p className="text-sm" style={{ margin: 0, color: 'var(--text)' }}>
            Invite sent to <strong>{link.invited_email}</strong> on {formatShowDate(link.invited_at.slice(0, 10), year)}. It shows in their Settings when they sign in.
          </p>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy === 'cancel'} onClick={() => void run('cancel', () => cancelBandLink(link.id), 'Invite withdrawn.')}>
            {busy === 'cancel' ? 'Withdrawing…' : 'Withdraw invite'}
          </button>
        </div>
      )}

      {/* ── Linked ── */}
      {linked && link && shareValues && (
        <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <p className="text-sm" style={{ margin: 0, color: 'var(--text)' }}>
            Linked to their Camel Ranch account{link.accepted_at ? ` since ${formatShowDate(link.accepted_at.slice(0, 10), year)}` : ''}. Shows you send go onto their calendar when their band admin accepts.
          </p>

          <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <legend className="agent-handoff-label">
              What the band sees on shows you send
            </legend>
            <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))' }}>
              {SHARE_OPTIONS.map(o => (
                <label key={o.key} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer', minHeight: 44 }}>
                  <input
                    type="checkbox"
                    checked={shareValues[o.key]}
                    onChange={e => setSharing({ ...shareValues, [o.key]: e.target.checked })}
                    style={{ marginTop: 3, width: 18, height: 18 }}
                  />
                  <span>
                    <span style={{ display: 'block', fontWeight: 800, fontSize: '0.9rem', color: 'var(--text)' }}>{o.label}</span>
                    <span className="text-xs text-muted">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted" style={{ margin: '0.5rem 0 0' }}>
              They see {sharingSummary(shareValues)}. Venue contacts and your private notes are never shared. Changes apply to shows you send from now on.
            </p>
            {sharingDirty && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy === 'sharing'}
                  aria-busy={busy === 'sharing'}
                  onClick={() =>
                    void run(
                      'sharing',
                      async () => {
                        await setBandSharing(link.id, shareValues);
                        setSharing(null);
                      },
                      'Saved what the band sees.',
                    )
                  }
                >
                  {busy === 'sharing' ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSharing(null)} disabled={busy === 'sharing'}>
                  Undo
                </button>
              </div>
            )}
          </fieldset>

          <div>
            <h3 className="agent-handoff-label">
              Ready to send · {toSend.length}
            </h3>
            {toSend.length === 0 ? (
              <p className="text-sm text-muted" style={{ margin: 0 }}>
                Every confirmed upcoming show is already with the band. New confirmed shows appear here.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
                {toSend.map(s => (
                  <li key={s.id} className="agent-handoff-row">
                    <span>
                      <strong>{formatShowDate(s.show_date, year)}</strong> · {venueLabel(s, venuesById)}
                      {s.set_time ? ` · ${formatTime(s.set_time)}` : ''}
                      {latest.get(s.id)?.status === 'declined' && (
                        <span className="text-xs text-muted">
                          {' '}
                          · band declined{latest.get(s.id)?.decision_note ? `: “${latest.get(s.id)?.decision_note}”` : ''}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy !== null}
                      aria-busy={busy === `send:${s.id}`}
                      onClick={() => void run(`send:${s.id}`, () => sendShowToBand(s.id), `Sent ${formatShowDate(s.show_date, year)} to ${band.band_name}. It goes on their calendar when they accept.`)}
                    >
                      {busy === `send:${s.id}` ? 'Sending…' : 'Send to band'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {waiting.length > 0 && (
            <div>
              <h3 className="agent-handoff-label">
                With the band
              </h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
                {waiting.map(p => {
                  const chip = handoffChip(p);
                  return (
                    <li key={p.id} className="agent-handoff-row">
                      <span>
                        <strong>{formatShowDate(p.payload.show_date, year)}</strong> · {p.payload.venue_name ?? 'Venue'}
                      </span>
                      <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {chip && <span className={`badge ${chip.badge}`}>{chip.text}</span>}
                        {p.status === 'pending' && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy !== null}
                            onClick={() => void run(`withdraw:${p.id}`, () => withdrawShowFromBand(p.id), 'Show taken back.')}
                          >
                            {busy === `withdraw:${p.id}` ? 'Taking back…' : 'Take back'}
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <BandCalendar rosterId={band.id} linkId={link.id} today={today} year={year} />

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.9rem' }}>
            {!confirmEnd ? (
              <button type="button" className="btn btn-ghost btn-sm" style={{ whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setConfirmEnd(true)}>
                End link with {band.band_name}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="text-sm" style={{ color: 'var(--text)' }}>
                  End the link? Shows waiting on the band are taken back. Shows already on their calendar stay there.
                </span>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={busy === 'end'}
                  onClick={() =>
                    void run(
                      'end',
                      async () => {
                        await cancelBandLink(link.id);
                        setConfirmEnd(false);
                      },
                      'Link ended.',
                    )
                  }
                >
                  {busy === 'end' ? 'Ending…' : 'Yes, end it'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmEnd(false)} disabled={busy === 'end'}>
                  Keep
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** The linked band's own calendar for the next 90 days (read-in). */
function BandCalendar({ rosterId, linkId, today, year }: { rosterId: string; linkId: string; today: string; year: number }) {
  const to = addDays(today, READ_IN_DAYS);
  const { data, loading, error, reload } = useLoad(() => bandCalendar(rosterId, today, to), `${linkId}:${today}`);
  return (
    <div>
      <h3 className="agent-handoff-label">
        Their calendar · next {READ_IN_DAYS} days
      </h3>
      {error ? (
        <ErrorBanner message={error} onRetry={reload} />
      ) : loading && !data ? (
        <SkeletonRows rows={2} />
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted" style={{ margin: 0 }}>
          Nothing on their calendar in the next {READ_IN_DAYS} days.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.35rem' }}>
          {data.map((d, i) => (
            <li key={`${d.show_date}-${i}`} className="agent-handoff-row">
              <span>
                <strong>{formatShowDate(d.show_date, year)}</strong> · {d.venue_name ?? 'Venue TBD'}
                {d.venue_city ? `, ${d.venue_city}` : ''}
              </span>
              <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                {d.from_agent && <span className="text-xs text-muted">From you</span>}
                <span className={`badge ${d.status === 'confirmed' || d.status === 'advancing' || d.status === 'completed' ? 'badge-confirmed' : 'badge-hold'}`}>{CAL_STATUS[d.status] ?? d.status}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted" style={{ margin: '0.4rem 0 0' }}>
        Dates, status and venue only. Their money and notes stay private to them.
      </p>
    </div>
  );
}
