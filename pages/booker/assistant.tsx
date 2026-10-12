// pages/booker/assistant.tsx
// The agent's AI assistant: ask about bands, shows, venues, follow-ups and
// money. It answers from the agent's own workspace and may suggest actions
// (add a hold, set a follow-up, draft an email). Nothing happens until the
// agent clicks Approve on a suggestion; approvals run the normal RLS-scoped
// workspace calls, the same as doing it by hand.
//
// The conversation lives in this browser tab (sessionStorage), so moving to
// another page and back keeps it; nothing is stored on the server.

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import BookerShell, { useBooker } from '../../components/booker/BookerShell';
import ComposeEmail, { type Recipient } from '../../components/booker/ComposeEmail';
import { ErrorBanner, PageHeader, SkeletonRows } from '../../components/booker/ui';
import { askAssistant, createShow, listContacts, listRoster, listShows, listVenues, setShowFollowup, type AssistantTurn } from '../../lib/booker/data';
import { STARTER_QUESTIONS, validActions, type AssistantAction } from '../../lib/booker/assistantActions';
import { ShowSchema } from '../../lib/booker/schemas';
import { addDays, formatShowDate, todayIso } from '../../lib/booker/dates';
import { byId, venueLabel } from '../../lib/booker/workspace';
import { useLoad } from '../../lib/booker/useLoad';

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
      bandsById: byId(data.bands),
      venuesById: byId(data.venues),
      showsById: byId(data.shows),
      known: {
        bands: new Set(data.bands.map(b => b.id)),
        venues: new Set(data.venues.map(v => v.id)),
        shows: new Set(data.shows.filter(s => s.status !== 'cancelled').map(s => s.id)),
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

  const approve = async (key: string, a: AssistantAction) => {
    setState(key, { status: 'busy' });
    try {
      if (a.type === 'add_hold') {
        const parsed = ShowSchema.safeParse({
          roster_id: a.roster_id,
          venue_id: a.venue_id ?? '',
          venue_name: a.venue_id ? '' : (a.venue_name ?? ''),
          venue_city: a.venue_id ? '' : (a.venue_city ?? ''),
          show_date: a.show_date,
          status: 'hold',
          deal_notes: '',
          internal_notes: `Added from the assistant: ${a.reason}`.slice(0, 5000),
        });
        if (!parsed.success) throw new Error('That hold is missing something. Add it from the Shows page instead.');
        await createShow(booker.id, parsed.data);
        setState(key, { status: 'done', message: 'Hold added.' });
      } else if (a.type === 'set_followup') {
        await setShowFollowup(a.show_id, a.followup_on);
        setState(key, { status: 'done', message: 'Follow-up date set.' });
      } else {
        setComposing({ key, action: a });
        setState(key, { status: 'idle' });
        return;
      }
      await reload();
    } catch (err) {
      setState(key, { status: 'error', message: err instanceof Error ? err.message : 'That did not work.' });
    }
  };

  const describe = (a: AssistantAction): { title: string; detail: string } => {
    if (!lookups) return { title: '', detail: '' };
    const band = (id?: string | null) => (id ? (lookups.bandsById.get(id)?.band_name ?? 'band') : '');
    if (a.type === 'add_hold') {
      const v = a.venue_id ? lookups.venuesById.get(a.venue_id) : undefined;
      const where = v ? `${v.name}${v.city ? `, ${v.city}` : ''}` : [a.venue_name, a.venue_city].filter(Boolean).join(', ');
      return { title: `Add a hold: ${band(a.roster_id)} at ${where}`, detail: formatShowDate(a.show_date, year) };
    }
    if (a.type === 'set_followup') {
      const s = lookups.showsById.get(a.show_id);
      return {
        title: `Set a follow-up for ${s ? `${band(s.roster_id)} at ${venueLabel(s, lookups.venuesById)}` : 'this show'}`,
        detail: `Follow up ${formatShowDate(a.followup_on, year)}${s ? ` · show ${formatShowDate(s.show_date, year)}` : ''}`,
      };
    }
    const v = a.venue_id ? lookups.venuesById.get(a.venue_id) : undefined;
    return { title: `Draft email${v ? ` to ${v.name}` : ''}: “${a.subject}”`, detail: a.body };
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
      <PageHeader
        title="Assistant"
        sub="Ask about your bands, shows, venues and money"
        actions={
          entries.length > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={clear} disabled={thinking}>
              Start over
            </button>
          ) : undefined
        }
      />
      {loading && !data && <SkeletonRows rows={3} />}

      <section aria-label="Conversation" className="card" style={{ display: 'grid', gap: '1rem', minHeight: 260 }}>
        {entries.length === 0 && (
          <div>
            <p className="text-sm" style={{ color: 'var(--text)', marginTop: 0, lineHeight: 1.6 }}>
              I can see your bands, shows from the last two months through the next six, your venue book, open email follow-ups and commission. I can suggest holds, follow-up dates and emails, and nothing changes until you click <strong>Approve</strong>.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {STARTER_QUESTIONS.map(q => (
                <button key={q} type="button" className="btn btn-secondary btn-sm" onClick={() => void ask(q)} disabled={thinking || !data} style={{ textTransform: 'none', letterSpacing: 0 }}>
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
              {e.actions && e.actions.length > 0 && lookups && (
                <div style={{ display: 'grid', gap: '0.5rem', width: 'min(720px, 100%)' }}>
                  {e.actions.map((a, i) => {
                    const key = `${e.id}-${i}`;
                    const st = actionState[key] ?? { status: 'idle' };
                    if (st.status === 'dismissed') return null;
                    const d = describe(a);
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
                              {a.type !== 'draft_email' && (
                                <Link href={a.type === 'add_hold' ? `/booker/bands/${a.roster_id}` : '/booker/shows'} className="text-sm">
                                  View
                                </Link>
                              )}
                            </span>
                          ) : (
                            <>
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => void approve(key, a)} disabled={st.status === 'busy'} aria-busy={st.status === 'busy'}>
                                {st.status === 'busy' ? 'Working…' : a.type === 'draft_email' ? 'Review & send' : 'Approve'}
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

      <form onSubmit={submit} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem', alignItems: 'flex-end' }}>
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
          style={{ flex: 1, minHeight: 56, resize: 'vertical' }}
        />
        <button type="submit" className="btn btn-primary" disabled={thinking || !data || !input.trim()} aria-busy={thinking}>
          {thinking ? 'Thinking…' : 'Ask'}
        </button>
      </form>
      <p className="text-xs text-muted" style={{ marginTop: '0.4rem' }}>
        Enter to send, Shift+Enter for a new line. The assistant only sees your own workspace and can make mistakes, so check dates before you confirm anything.
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
