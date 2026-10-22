// pages/agent/assistant.tsx
// The agent's AI assistant: ask about bands, shows, venues, follow-ups and
// money. It answers from the agent's own workspace (and the web) and may
// suggest changes — shows, bands, venues, contacts, follow-ups and emails;
// everything except money and deleting (lib/booker/assistantActions.ts).
// Nothing happens until the agent clicks Approve on a suggestion; approvals
// run the normal RLS-scoped workspace calls, the same as doing it by hand
// (lib/booker/assistantApply.ts builds each write).
//
// The conversation lives in this browser tab (sessionStorage), so moving to
// another page and back keeps it; nothing is stored on the server.

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import BookerShell, { useBooker } from '../../components/booker/BookerShell';
import ComposeEmail, { type Recipient } from '../../components/booker/ComposeEmail';
import { ErrorBanner, SkeletonRows } from '../../components/booker/ui';
import RouteMapScene from '../../components/booker/RouteMapScene';
import PageHero from '../../components/layout/PageHero';
import {
  askAssistant,
  createContact,
  createRosterBand,
  createShow,
  createVenue,
  listContacts,
  listRoster,
  listShows,
  listVenues,
  setShowFollowup,
  updateContact,
  updateRosterBand,
  updateShow,
  updateVenue,
  type AssistantTurn,
} from '../../lib/booker/data';
import { STARTER_QUESTIONS, validActions, type AssistantAction } from '../../lib/booker/assistantActions';
import { buildWrite, describeAction, type AssistantWrite } from '../../lib/booker/assistantApply';
import { addDays, todayIso } from '../../lib/booker/dates';
import { byId } from '../../lib/booker/workspace';
import { useLoad } from '../../lib/booker/useLoad';
import { createOffer, listOfferTemplates } from '../../lib/booker/offerData';
import { draftFromShow, offerLabel } from '../../lib/booker/offers';
import { OfferTermsSchema } from '../../lib/booker/schemas';

const STORAGE_KEY = 'crb.booker.assistant.v1';
/** Turns sent with each question; older ones stay on screen only. */
const HISTORY_SENT = 12;

interface ChatEntry extends AssistantTurn {
  id: string;
  actions?: AssistantAction[];
}

type ActionState = { status: 'idle' | 'busy' | 'done' | 'dismissed' | 'error'; message?: string };

function loadStored(): ChatEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ChatEntry[]) : [];
    return Array.isArray(parsed) ? parsed.slice(-60) : [];
  } catch {
    return [];
  }
}

function store(entries: ChatEntry[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-60)));
  } catch {
    // Private mode / storage full: the conversation still works for this page view.
  }
}

/** Hidden visually, still read by screen readers. */
const SR_ONLY = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 } as const;

const newId = () => Math.random().toString(36).slice(2, 10);

function AssistantContent() {
  const { booker } = useBooker();
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const { data, loading, error, reload } = useLoad(async () => {
    const [bands, venues, shows, contacts] = await Promise.all([listRoster(), listVenues(), listShows({ from: addDays(today, -60) }), listContacts()]);
    return { bands, venues, shows, contacts };
  });
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [askError, setAskError] = useState('');
  const [actionState, setActionState] = useState<Record<string, ActionState>>({});
  const [composing, setComposing] = useState<{ key: string; action: Extract<AssistantAction, { type: 'draft_email' }> } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setEntries(loadStored()), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [entries.length, thinking]);

  const lookups = useMemo(() => {
    if (!data) return null;
    return {
      venuesById: byId(data.venues),
      known: {
        bands: new Set(data.bands.map(b => b.id)),
        venues: new Set(data.venues.map(v => v.id)),
        shows: new Set(data.shows.filter(s => s.status !== 'cancelled').map(s => s.id)),
        contacts: new Set(data.contacts.map(c => c.id)),
      },
    };
  }, [data]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || thinking) return;
    setAskError('');
    const userEntry: ChatEntry = { id: newId(), role: 'user', content: q.slice(0, 4000) };
    const next = [...entries, userEntry];
    setEntries(next);
    store(next);
    setInput('');
    setThinking(true);
    try {
      const history = next.slice(-HISTORY_SENT).map(({ role, content }) => ({ role, content }));
      // The first message sent must be the user's.
      while (history.length && history[0].role !== 'user') history.shift();
      const res = await askAssistant(history, today);
      // Re-check every suggestion against what this agent actually has loaded.
      const actions = lookups ? validActions(res.actions, lookups.known, today) : [];
      const withReply = [...next, { id: newId(), role: 'assistant' as const, content: res.reply, actions }];
      setEntries(withReply);
      store(withReply);
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'The assistant could not answer.');
      setInput(q);
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void ask(input);
    }
  };

  const clear = () => {
    setEntries([]);
    setActionState({});
    store([]);
  };

  const setState = (key: string, s: ActionState) => setActionState(prev => ({ ...prev, [key]: s }));

  /** Runs one approved write through the normal workspace calls; returns what to tell the agent. */
  const perform = async (w: Exclude<AssistantWrite, { op: 'composeEmail' }>): Promise<string> => {
    switch (w.op) {
      case 'createShow':
        await createShow(booker.id, w.input);
        return w.input.status === 'hold' ? 'Hold added.' : w.input.status === 'pending' ? 'Offer added.' : 'Show added.';
      case 'updateShow':
        await updateShow(w.id, w.input);
        return w.input.status === 'cancelled' ? 'Show cancelled.' : 'Show updated.';
      case 'setFollowup':
        await setShowFollowup(w.id, w.date);
        return 'Follow-up date set.';
      case 'createBand':
        await createRosterBand(booker.id, w.input);
        return 'Band added — set their commission rate on the Bands page.';
      case 'updateBand':
        await updateRosterBand(w.id, w.input);
        return 'Band updated.';
      case 'createVenue':
        await createVenue(booker.id, w.input);
        return 'Venue added to your book.';
      case 'updateVenue':
        await updateVenue(w.id, w.input);
        return 'Venue updated.';
      case 'createContact':
        await createContact(booker.id, w.input);
        return 'Contact added.';
      case 'updateContact':
        await updateContact(w.id, w.input);
        return 'Contact updated.';
      case 'draftOffer': {
        if (!data) throw new Error('The workspace is still loading.');
        const show = data.shows.find(x => x.id === w.showId);
        if (!show) throw new Error('That show is no longer in your workspace.');
        const templates = await listOfferTemplates();
        const contact = w.contactId ? (data.contacts.find(c => c.id === w.contactId) ?? null) : (data.contacts.find(c => c.venue_id === show.venue_id && c.email) ?? null);
        const terms = draftFromShow({
          show,
          band: data.bands.find(b => b.id === show.roster_id) ?? { band_name: 'Band' },
          venue: data.venues.find(v => v.id === show.venue_id) ?? null,
          contact,
          template: templates.find(t => t.is_default) ?? null,
          kind: w.kind,
          agencyName: booker.agency_name,
          today: todayIso(),
        });
        const parsed = OfferTermsSchema.safeParse(w.expiresOn ? { ...terms, expires_on: w.expiresOn } : terms);
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'The offer could not be drafted.');
        const offer = await createOffer(booker.id, show.id, parsed.data);
        return `${offerLabel(offer)} drafted. Open the show and choose Offers & deal memos to review and send it.`;
      }
    }
  };

  const approve = async (key: string, a: AssistantAction) => {
    if (!data) return;
    setState(key, { status: 'busy' });
    try {
      const built = buildWrite(a, data);
      if (!built.ok) throw new Error(built.message);
      if (built.write.op === 'composeEmail') {
        if (a.type === 'draft_email') setComposing({ key, action: a });
        setState(key, { status: 'idle' });
        return;
      }
      const message = await perform(built.write);
      setState(key, { status: 'done', message });
      await reload();
    } catch (err) {
      setState(key, { status: 'error', message: err instanceof Error ? err.message : 'That did not work.' });
    }
  };

  const recipientsFor = (venueId?: string | null): Recipient[] => {
    if (!data || !venueId) return [];
    const venue = data.venues.find(v => v.id === venueId);
    const contacts = data.contacts.filter(c => c.venue_id === venueId && c.email);
    const list: Recipient[] = contacts.map(c => ({ email: c.email!, name: c.name, contactId: c.id, label: c.title ? `${c.name} — ${c.title}` : c.name }));
    if (venue?.email && !contacts.some(c => c.email?.toLowerCase() === venue.email!.toLowerCase())) list.push({ email: venue.email, name: null, label: `${venue.name} booking inbox` });
    return list;
  };

  if (error) return <ErrorBanner message={error} onRetry={reload} />;

  return (
    <>
      <PageHero
        title="Assistant"
        subtitle="Your booking right hand"
        summary="Ask about your bands, shows, venues and money — or have it line up the work. Nothing changes until you click Approve."
        scene={<RouteMapScene />}
        actions={
          entries.length > 0 ? (
            <button type="button" className="btn btn-secondary tours-new-btn" onClick={clear} disabled={thinking}>
              Start over
            </button>
          ) : undefined
        }
      />
      {loading && !data && <SkeletonRows rows={3} />}

      {/* minmax(0, 1fr): the one column never grows past the card, so a long line can't push the page sideways on a phone. */}
      <section aria-label="Conversation" className="card" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1rem', minHeight: 260 }}>
        {entries.length === 0 && (
          <div>
            <p className="text-sm" style={{ color: 'var(--text)', marginTop: 0, lineHeight: 1.6 }}>
              I can see your bands, shows from the last two months through the next six, your venue book and contacts, recent emails, follow-ups and commission, and I can search the web. I can line up holds, offers and confirmed shows, update or cancel shows, add or fix bands, venues and contacts, set follow-ups and draft emails — nothing changes until you click <strong>Approve</strong>. Money (payments, rates) and deleting stay with you.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {STARTER_QUESTIONS.map(q => (
                <button key={q} type="button" className="btn btn-secondary btn-sm" onClick={() => void ask(q)} disabled={thinking || !data} style={{ textTransform: 'none', letterSpacing: 0, whiteSpace: 'normal', textAlign: 'left', maxWidth: '100%', height: 'auto', minHeight: 44 }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <ol aria-live="polite" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.9rem' }}>
          {entries.map(e => (
            <li key={e.id} style={{ display: 'grid', justifyItems: e.role === 'user' ? 'end' : 'start', gap: '0.5rem' }}>
              <div
                style={{
                  maxWidth: 'min(720px, 100%)',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  lineHeight: 1.55,
                  fontSize: '0.92rem',
                  padding: '0.7rem 0.9rem',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text)',
                  background: e.role === 'user' ? 'rgba(232,130,58,0.16)' : 'var(--surface-2)',
                  border: `1px solid ${e.role === 'user' ? 'rgba(232,130,58,0.4)' : 'var(--border)'}`,
                }}
              >
                <span style={SR_ONLY}>{e.role === 'user' ? 'You: ' : 'Assistant: '}</span>
                {e.content}
              </div>
              {e.actions && e.actions.length > 0 && lookups && data && (
                <div style={{ display: 'grid', gap: '0.5rem', width: 'min(720px, 100%)' }}>
                  {e.actions.map((a, i) => {
                    const key = `${e.id}-${i}`;
                    const st = actionState[key] ?? { status: 'idle' };
                    if (st.status === 'dismissed') return null;
                    const d = describeAction(a, data, year);
                    return (
                      <div key={key} style={{ border: '1px dashed var(--accent)', borderRadius: 'var(--radius-sm)', padding: '0.7rem 0.85rem', background: 'var(--surface)' }}>
                        <div className="eyebrow" style={{ color: 'var(--accent)', fontSize: '0.75rem' }}>
                          Suggestion
                        </div>
                        <div style={{ color: 'var(--text)', fontWeight: 800, overflowWrap: 'anywhere' }}>{d.title}</div>
                        <div className="text-sm text-muted" style={{ whiteSpace: 'pre-wrap', maxHeight: a.type === 'draft_email' ? 160 : undefined, overflowY: 'auto' }}>
                          {d.detail}
                        </div>
                        <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                          Why: {a.reason}
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          {st.status === 'done' ? (
                            <span role="status" className="text-sm" style={{ color: 'var(--green)' }}>
                              ✓ {st.message}{' '}
                              {d.href && (
                                <Link href={d.href} className="text-sm">
                                  View
                                </Link>
                              )}
                            </span>
                          ) : (
                            <>
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => void approve(key, a)} disabled={st.status === 'busy'} aria-busy={st.status === 'busy'}>
                                {st.status === 'busy' ? 'Working…' : d.approveLabel}
                              </button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setState(key, { status: 'dismissed' })} disabled={st.status === 'busy'}>
                                Dismiss
                              </button>
                            </>
                          )}
                          {st.status === 'error' && (
                            <span role="alert" className="text-sm" style={{ color: 'var(--red)' }}>
                              {st.message}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
          {thinking && (
            <li role="status" className="text-sm text-muted">
              Looking through your workspace…
            </li>
          )}
        </ol>
        <div ref={endRef} />
      </section>

      {askError && (
        <div style={{ marginTop: '0.75rem' }}>
          <ErrorBanner message={askError} />
        </div>
      )}

      <form onSubmit={submit} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem', alignItems: 'flex-end', minWidth: 0 }}>
        <label htmlFor="assistant-input" style={SR_ONLY}>
          Ask the assistant
        </label>
        <textarea
          id="assistant-input"
          ref={inputRef}
          className="textarea"
          rows={2}
          maxLength={4000}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="e.g. Which Saturdays in November are open for The Jackwagons?"
          disabled={thinking || !data}
          style={{ flex: 1, minWidth: 0, minHeight: 56, resize: 'vertical' }}
        />
        <button type="submit" className="btn btn-primary" disabled={thinking || !data || !input.trim()} aria-busy={thinking}>
          {thinking ? 'Thinking…' : 'Ask'}
        </button>
      </form>
      <p className="text-xs text-muted" style={{ marginTop: '0.4rem' }}>
        Enter to send, Shift+Enter for a new line. The assistant sees only your own workspace (plus the web when it searches) and can make mistakes, so check each suggestion before you approve it.
      </p>

      {composing && data && (
        <ComposeEmail
          recipients={recipientsFor(composing.action.venue_id)}
          bands={data.bands}
          shows={data.shows}
          venuesById={lookups?.venuesById}
          venueId={composing.action.venue_id ?? undefined}
          defaultBandId={composing.action.roster_id ?? undefined}
          defaultSubject={composing.action.subject}
          defaultBody={composing.action.body}
          onClose={() => setComposing(null)}
          onSent={result => {
            setState(composing.key, { status: 'done', message: result.warning ?? 'Email sent.' });
            setComposing(null);
          }}
        />
      )}
    </>
  );
}

export default function BookerAssistant() {
  return (
    <BookerShell title="Assistant">
      <AssistantContent />
    </BookerShell>
  );
}
