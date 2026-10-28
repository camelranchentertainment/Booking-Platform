// components/agent/BookingAgentPanel.tsx
//
// The AI booking agent chat: today's conversation, History, file attachments,
// and the approval cards for staged saves and outreach sends.
//
// It renders in two places:
//   - 'docked'  — inside the band dashboard (/band), with a "Pop out" button;
//   - 'popout'  — filling its own browser window (/band/agent) that the user
//                 can drag anywhere while they keep working on the site.
// Both read and write the same saved conversation (/api/agent-conversation),
// and the dashboard hides its copy while the pop-out is open, so a chat moves
// between the two without loss (lib/agent/agentWindow.ts).
//
// The agent's write powers stay on /band: both hosts are /band routes, and the
// server decides what a caller may save (pages/api/agent.ts).

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { formatShowDate, localToday } from '../../lib/formatDate';
import AssistantHistoryList from '../dashboard/AssistantHistoryList';
import type { ConversationDaySummary } from '../../lib/agentConversationDays';
import { buildConfirmMessage, describeTourUpdate, describeVenueUpsert, describeContactUpsert, describeWrapup, describeExpenseUpdate, describeOfficeAction, describeDelete } from '../../lib/agentStagingHelpers';
import { buildAgentGreeting } from '../../lib/agent/agentGreeting';
import { openInMainWindow } from '../../lib/agent/agentWindow';

// ── Types ──────────────────────────────────────────────────────────────────────
type Message = { role: 'user' | 'assistant'; content: string };

type TourOutreachAction = {
  type: 'tour_outreach';
  tourId: string;
  tourName: string;
  /** 'follow_up' when the card emails venues already pitched (agent outreach to Follow up). */
  stage?: 'target' | 'follow_up';
  venues: { tourVenueId: string; venueId: string; name: string; city?: string; state?: string; email?: string | null; contactName?: string | null }[];
  draft: { subject: string; body: string };
  /** 'agreed' = the email approved in chat, word for word; 'generated' = a new draft to review. */
  draftSource?: 'agreed' | 'generated';
};
type CitySearchAction = {
  type: 'city_search';
  city: string;
  state: string;
  dateRange: string;
  venues: { id: string; name: string; city: string; state: string; email?: string | null; venue_type?: string | null; capacity?: number | null }[];
  activeTour: { id: string; name: string } | null;
};
type StageItemsAction = {
  type: 'stage_items';
  staged: Array<{ kind: string; staged_action_id: string; proposal: any; conflicts?: any[] }>;
  errors: string[];
  overflow?: number;
};
type FindVenueAction = {
  type: 'find_venue';
  venues: { id: string; name: string; city?: string; state?: string; email?: string | null; bookings?: { show_date: string }[] }[];
};
type AgentAction = TourOutreachAction | CitySearchAction | StageItemsAction | FindVenueAction;

const QUICK_CHIPS: { label: string; href?: string; prompt?: string }[] = [
  { label: 'Show my targets',       href: '/tours' },
  { label: 'Show confirmed shows',  href: '/bookings?filter=confirmed' },
  { label: 'Draft outreach email',  prompt: 'Help me draft a cold pitch outreach email for my next tour.' },
  { label: 'Help me plan a tour',   prompt: 'Help me plan a tour. What should I think about for routing, timing, and targeting venues?' },
  { label: 'How do I invite a band member?', prompt: 'How do I invite a band member?' },
  { label: 'How do I connect Google Calendar?', prompt: 'How do I connect Google Calendar?' },
  { label: 'How do I set up email?', prompt: 'How do I set up email sending for outreach?' },
];

export interface BookingAgentPanelProps {
  /** The caller's band. Only used for display and the send payload; the server re-checks it. */
  act: { id: string; act_name: string | null };
  /** Signed-in person's display name, for the greeting. */
  displayName: string | null;
  /** Counts for the greeting; null until the host has loaded them (no greeting before then). */
  greetingStats: { toursCount: number; targetsCount: number } | null;
  /** 'docked' inside the dashboard, 'popout' filling its own window. */
  mode: 'docked' | 'popout';
  /** Called after the agent saves or sends something, so the host can refresh its data. */
  onDataChanged: () => void;
  /** Docked only: move the chat into its own window. */
  onPopOut?: () => void;
  /** Pop-out only: close this window and hand the chat back to the dashboard. */
  onDock?: () => void;
}

/** One line describing a staged item on the approval card. */
function summarizeStagedItem(item: { kind: string; proposal: any }): string {
  const p = item.proposal;
  let summary = '';
  if (item.kind === 'show') summary = `Show: ${p.venue_name || 'TBD'} — ${p.show_date}`;
  else if (item.kind === 'travel') summary = `Travel: ${p.show_date}${p.notes ? ` · ${String(p.notes).slice(0, 40)}` : ''}`;
  else if (item.kind === 'tour_notes') { const n = p.new_notes || ''; summary = `Tour notes: ${n.slice(0, 60)}${n.length > 60 ? '…' : ''}`; }
  else if (item.kind === 'expense') summary = `Expense: ${p.category} — $${p.amount} (${p.status})`;
  else if (item.kind === 'venue_and_booking') summary = `New venue + show: ${p.venue_name} (${p.venue_city}, ${p.venue_state}) — ${p.show_date}`;
  else if (item.kind === 'tour_create') summary = `New tour: ${p.name}${p.start_date ? ` (${p.start_date}${p.end_date ? ` – ${p.end_date}` : ''})` : ''}`;
  else if (item.kind === 'calendar_settings_update') summary = `Calendar: ${p.sync_enabled !== undefined ? (p.sync_enabled ? 'sync ON' : 'sync OFF') : ''}${p.calendar_name ? ` · name: ${p.calendar_name}` : ''}`;
  else if (item.kind === 'personnel_upsert') summary = `Roster: ${p.name || '(unnamed)'}${p.instrument_role ? ` — ${p.instrument_role}` : ''}${p.default_pay_amount ? ` · $${p.default_pay_amount}` : ''}`;
  else if (item.kind === 'payment_settle') {
    if (p.agreed_amount != null) {
      summary = `Contracted: ${p.venue_name || ''}${p.show_date ? ` — ${p.show_date}` : ''} · $${p.agreed_amount}`;
    } else {
      summary = `Received: ${p.venue_name || ''}${p.show_date ? ` — ${p.show_date}` : ''}${p.actual_amount_received != null ? ` · $${p.actual_amount_received}` : ''}${p.payment_status ? ` · ${p.payment_status}` : ''}`;
    }
  }
  else if (item.kind === 'email_send') summary = `Email to ${p.recipient}${p.venue_name ? ` (${p.venue_name})` : ''}: ${p.subject}`;
  else if (item.kind === 'tour_update') summary = describeTourUpdate(p);
  else if (item.kind === 'record_delete') summary = `⚠ ${describeDelete(p)}`;
  else if (item.kind === 'venue_upsert') summary = describeVenueUpsert(p);
  else if (item.kind === 'contact_upsert') summary = describeContactUpsert(p);
  else if (item.kind === 'booking_wrapup') summary = describeWrapup(p);
  else if (item.kind === 'expense_update' || item.kind === 'expense_archive') summary = describeExpenseUpdate({ kind: item.kind, ...p });
  else if (['email_archive', 'email_draft', 'member_invite', 'note_upsert', 'social_draft'].includes(item.kind)) summary = describeOfficeAction(item.kind, p);
  else if (item.kind === 'email_template_upsert') summary = `${p.replaces_existing ? 'Replace template' : 'New template'}: ${p.name}${p.subject ? ` · subject: ${p.subject}` : ''}`;
  return summary;
}

export default function BookingAgentPanel({ act, displayName, greetingStats, mode, onDataChanged, onPopOut, onDock }: BookingAgentPanelProps) {
  const isPopout = mode === 'popout';

  // Agent
  const [messages, setMessages]           = useState<Message[]>([]);
  const [agentInput, setAgentInput]       = useState('');
  const [agentLoading, setAgentLoading]   = useState(false);
  const [agentError, setAgentError]       = useState('');
  const [noteSaved, setNoteSaved]         = useState(false);
  const [pendingAction, setPendingAction] = useState<AgentAction | null>(null);
  const [greetingSent, setGreetingSent]   = useState(false);
  const [conversationLoaded, setConversationLoaded] = useState(false);
  // The local day this chat is filed under. Set once on load so a chat that runs
  // past midnight keeps saving to the day it started; the next visit starts fresh.
  const chatDayRef                        = useRef<string>('');
  // History: null = live chat; 'list' = picking a past day; otherwise the day being read.
  const [historyView, setHistoryView]     = useState<null | 'list' | string>(null);
  const [historyDays, setHistoryDays]     = useState<ConversationDaySummary[]>([]);
  const [historyMessages, setHistoryMessages] = useState<Message[]>([]);
  const [historyLoading, setHistoryLoading]   = useState(false);
  const [historyError, setHistoryError]       = useState('');
  const [attachedFile, setAttachedFile]   = useState<{ name: string; content: string } | null>(null);
  const [fileLoading, setFileLoading]     = useState(false);
  const [expandedMsgs, setExpandedMsgs]   = useState<Set<number>>(new Set());
  const fileInputRef                      = useRef<HTMLInputElement>(null);

  // Approval
  const [draftSubject, setDraftSubject]           = useState('');
  const [draftBody, setDraftBody]                 = useState('');
  const [selectedVenueIds, setSelectedVenueIds]   = useState<Set<string>>(new Set());
  const [sending, setSending]                     = useState(false);
  const [sendResult, setSendResult]               = useState<{ sent: number; noEmail: number; errors: number } | null>(null);

  const threadRef   = useRef<HTMLDivElement>(null);
  const agentInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pendingAction]);

  // Load any previously saved conversation for this user+act before deciding whether
  // to show the fresh greeting — this is what makes the chat survive navigating away
  // and back, instead of resetting every time the component remounts.
  useEffect(() => {
    if (conversationLoaded) return;
    (async () => {
      try {
        // Each day starts fresh: only today's chat is restored; earlier days live in History.
        chatDayRef.current = localToday();
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/agent-conversation?day=${encodeURIComponent(chatDayRef.current)}`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.messages) && json.messages.length > 0) {
            setMessages(json.messages);
            setGreetingSent(true); // prevent the greeting effect from overwriting the restored chat
          }
        }
      } catch {
        // Non-fatal — if this fails, the user just gets a fresh greeting instead.
      } finally {
        setConversationLoaded(true);
      }
    })();
  }, [conversationLoaded]);

  const buildGreeting = () => buildAgentGreeting({
    hour: new Date().getHours(),
    displayName,
    actName: act.act_name,
    toursCount: greetingStats?.toursCount ?? 0,
    targetsCount: greetingStats?.targetsCount ?? 0,
  });

  const saveConversationHistory = (msgs: Array<{ role: string; content: string }>) => {
    // Fire-and-forget — a failed save shouldn't interrupt the chat itself.
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await fetch('/api/agent-conversation', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ day: chatDayRef.current || localToday(), messages: msgs }),
        });
      } catch {
        // Non-fatal.
      }
    })();
  };

  /** Opens History and loads the list of past days (today is left out — it's the live chat). */
  const openHistory = async () => {
    setHistoryView('list');
    setHistoryError('');
    setHistoryLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/agent-conversation?view=days', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'History could not be loaded.');
      const today = chatDayRef.current || localToday();
      setHistoryDays((json.days as ConversationDaySummary[] ?? []).filter(d => d.day !== today));
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'History could not be loaded.');
    } finally {
      setHistoryLoading(false);
    }
  };

  /** Loads one past day's chat to read. Past days are read-only. */
  const openHistoryDay = async (day: string) => {
    setHistoryView(day);
    setHistoryMessages([]);
    setExpandedMsgs(new Set());
    setHistoryError('');
    setHistoryLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/agent-conversation?day=${encodeURIComponent(day)}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'That day could not be loaded.');
      setHistoryMessages(Array.isArray(json.messages) ? json.messages : []);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'That day could not be loaded.');
    } finally {
      setHistoryLoading(false);
    }
  };

  /** Leaves History and returns to today's live chat, focusing the input. */
  const closeHistory = () => {
    setHistoryView(null);
    setHistoryMessages([]);
    setHistoryError('');
    setExpandedMsgs(new Set());
    setTimeout(() => agentInputRef.current?.focus(), 0);
  };

  const startNewChat = async () => {
    setMessages([{ role: 'assistant' as const, content: buildGreeting() }]);
    setPendingAction(null);
    setAgentError('');
    setSendResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`/api/agent-conversation?day=${encodeURIComponent(chatDayRef.current || localToday())}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
    } catch {
      // Non-fatal — the next auto-save will overwrite the old saved conversation anyway.
    }
  };

  // Auto-greet once act data is loaded — only if nothing was restored from a saved conversation.
  useEffect(() => {
    if (conversationLoaded && !greetingSent && greetingStats) {
      setGreetingSent(true);
      setMessages([{ role: 'assistant' as const, content: buildGreeting() }]);
    }
  }, [greetingSent, conversationLoaded, greetingStats]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the agent input once the panel is on screen.
  useEffect(() => {
    agentInputRef.current?.focus();
  }, []);

  // Refocus after agentLoading clears — covers post-send, post-error, post-response
  useEffect(() => {
    if (!agentLoading) agentInputRef.current?.focus();
  }, [agentLoading]);

  // Auto-grow the agent text box with its content. CSS max-height on
  // textarea.dash-agent-input caps it (~5 lines) and it scrolls past that.
  // Runs on every value change, so clearing the input after send shrinks it back.
  useEffect(() => {
    const el = agentInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`; // +2 for the 1px top/bottom border (box-sizing: border-box)
  }, [agentInput]);

  const sendMessage = async (msg: string, saveNote = false) => {
    const fullMsg = attachedFile
      ? `${msg.trim() ? msg.trim() + '\n\n' : ''}[File: ${attachedFile.name}]\n${attachedFile.content}`
      : msg.trim();
    if (!fullMsg || agentLoading) return;
    setAttachedFile(null);
    const userMsg: Message = { role: 'user', content: fullMsg };
    const next = [...messages, userMsg];
    setMessages(next);
    setAgentInput('');
    setAgentLoading(true);
    setAgentError('');
    setNoteSaved(false);
    setPendingAction(null);
    setSendResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const history = next.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ message: fullMsg, history, saveNote }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Agent error');

      const updated = [...next, { role: 'assistant' as const, content: json.reply }];
      setMessages(updated);
      saveConversationHistory(updated);

      if (json.action) {
        const action: AgentAction = json.action;
        setPendingAction(action);
        if (action.type === 'tour_outreach') {
          setDraftSubject(action.draft.subject);
          setDraftBody(action.draft.body);
          setSelectedVenueIds(new Set(action.venues.map(v => v.tourVenueId)));
        } else if (action.type === 'city_search') {
          setSelectedVenueIds(new Set(action.venues.map(v => v.id)));
        }
      }

      if (saveNote) setNoteSaved(true);
    } catch (err: any) {
      setAgentError(err.message);
      setMessages(next.slice(0, -1));
    } finally {
      setAgentLoading(false);
    }
  };

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAgentError('');
    setFileLoading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      const MAX_CHARS = 50_000;
      const truncate = (raw: string) =>
        raw.length > MAX_CHARS
          ? raw.slice(0, MAX_CHARS) + `\n\n[File truncated — showing first ${MAX_CHARS.toLocaleString()} characters]`
          : raw;

      if (ext === 'csv' || ext === 'txt') {
        const text = await file.text();
        setAttachedFile({ name: file.name, content: truncate(text) });

      } else if (ext === 'xlsx' || ext === 'xls') {
        const buf = await file.arrayBuffer();
        const wb  = XLSX.read(buf, { type: 'array' });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(ws);
        setAttachedFile({ name: file.name, content: truncate(csv) });

      } else if (ext === 'pdf') {
        if (file.size > 3 * 1024 * 1024) {
          setAgentError('That PDF is over 3 MB. Try a smaller file, or export just the pages you need.');
          return;
        }
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/parse-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ base64, mimeType: 'application/pdf' }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          // The server explains what's wrong (scanned image, too large, password).
          setAgentError(json.error || (res.status === 413 ? 'That PDF is too large. Try one under 3 MB.' : 'Could not read that PDF.'));
          return;
        }
        setAttachedFile({ name: file.name, content: truncate(json.text) });

      } else {
        setAgentError('Unsupported format — use CSV, Excel (.xlsx/.xls), or PDF.');
      }
    } catch (err: any) {
      console.error('Could not read file:', err);
      setAgentError('Could not read file — please try again or use a different format.');
    } finally {
      setFileLoading(false);
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const approveSend = async () => {
    if (!pendingAction || sending) return;

    if (pendingAction.type === 'stage_items') {
      setSending(true);
      setSendResult(null);
      const { data: { session } } = await supabase.auth.getSession();
      try {
        const stagedSnapshot = pendingAction.staged;
        const res = await fetch('/api/help/actions/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ staged_action_ids: stagedSnapshot.map(s => s.staged_action_id) }),
        });
        const json = await res.json();
        // Build truthful history from actual execution results, not model text
        const content = json.results
          ? buildConfirmMessage(stagedSnapshot, json.results)
          : `Saved ${stagedSnapshot.length} item${stagedSnapshot.length !== 1 ? 's' : ''}.`;
        if (!res.ok && !json.results) throw new Error(json.error || 'Save failed');
        const confirmMsg = { role: 'assistant' as const, content };
        setMessages(prev => {
          const updated = [...prev, confirmMsg];
          saveConversationHistory(updated);
          return updated;
        });
        setPendingAction(null);
        onDataChanged();
      } catch (err: any) {
        setAgentError(err.message);
      } finally {
        setSending(false);
      }
      return;
    }

    setSending(true);
    setSendResult(null);
    const { data: { session } } = await supabase.auth.getSession();

    let payload: any;
    if (pendingAction.type === 'tour_outreach') {
      payload = {
        venues:  pendingAction.venues.filter(v => selectedVenueIds.has(v.tourVenueId)),
        subject: draftSubject,
        body:    draftBody,
        actId:   act.id,
        tourId:  pendingAction.tourId,
      };
    } else if (pendingAction.type === 'city_search') {
      payload = {
        venues:    pendingAction.venues.filter(v => selectedVenueIds.has(v.id)).map(v => ({ venueId: v.id, name: v.name, city: v.city, state: v.state, email: v.email, contactName: null })),
        subject:   draftSubject || `Booking inquiry — ${act.act_name}`,
        body:      draftBody || `Hi {contact_name},\n\nWe're reaching out about booking ${act.act_name} at {venue_name}.\n\nBest,\nCamel Ranch Booking`,
        actId:     act.id,
        tourId:    pendingAction.activeTour?.id || null,
        addToTour: !!pendingAction.activeTour,
      };
    } else {
      return;
    }

    try {
      const res = await fetch('/api/agent-bulk-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Send failed');
      setSendResult({ sent: json.sent, noEmail: json.noEmail, errors: json.errors });
      setMessages(prev => [...prev, { role: 'assistant' as const, content: `Sent ${json.sent} email${json.sent !== 1 ? 's' : ''}${json.noEmail ? `, ${json.noEmail} skipped (no email on file)` : ''}${json.errors ? `, ${json.errors} failed` : ''}. Venues have been marked as reached out.` }]);
      setPendingAction(null);
      // Refresh targets count
      onDataChanged();
    } catch (err: any) {
      setAgentError(err.message);
    } finally {
      setSending(false);
    }
  };

  const saveConversation = async () => {
    if (messages.length === 0 || agentLoading) return;
    const { data: { session } } = await supabase.auth.getSession();
    const noteContent = messages.map(m => `${m.role === 'user' ? 'Q' : 'A'}: ${m.content}`).join('\n\n');
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ content: noteContent, note_date: localToday(), visibility: 'admin_only' }),
    });
    if (!res.ok) { setAgentError('Failed to save note — please try again.'); return; }
    setNoteSaved(true);
  };

  // Popping out mid-approval would drop the card (it isn't saved with the chat).
  const popOutBlocked = agentLoading || sending || pendingAction !== null;


  return (
    <>
      <style>{`
        .dash-appr-grid     { display:grid; grid-template-columns:1fr; gap:0.25rem; max-height:160px; overflow-y:auto; }
        .dash-draft-grid    { display:grid; grid-template-columns:1fr; gap:0.5rem; align-items:start; }
        .dash-msg-ai        { max-width:90%; }
        .dash-msg-user      { max-width:88%; }

        /* AI Booking Agent card — mobile-first. Below 768px the card is a single
           column: the 220px mascot column is hidden and a small avatar moves into
           the chat header, so the composer gets the full card width. */
        .dash-agent             { display:flex; flex-direction:column; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); overflow:hidden; margin:1.5rem 0; height:min(640px, 80vh); height:min(640px, 80dvh); }
        .dash-agent-mascot      { display:none; }
        .dash-agent-chat        { flex:1 1 auto; display:flex; flex-direction:column; min-width:0; min-height:0; }
        .dash-agent-hdr-avatar  { width:32px; height:32px; border-radius:50%; border:2px solid var(--accent); object-fit:cover; flex-shrink:0; }
        .dash-agent-hdr-status  { display:flex; align-items:center; gap:5px; font-size:11px; color:var(--text-muted); font-weight:700; }
        .dash-agent-chips       { display:flex; flex-wrap:nowrap; gap:0.4rem; padding:0.6rem 0.75rem 0.15rem; flex-shrink:0; overflow-x:auto; overscroll-behavior-x:contain; scroll-snap-type:x proximity; scrollbar-width:none; }
        .dash-agent-chips::-webkit-scrollbar { display:none; }
        .dash-agent-chip        { flex:0 0 auto; white-space:nowrap; min-height:44px; display:inline-flex; align-items:center; scroll-snap-align:start; }
        .dash-agent-form        { display:flex; align-items:flex-end; gap:0.5rem; padding:0.5rem 0.75rem 0.75rem; }
        textarea.dash-agent-input { flex:1 1 auto; min-width:0; width:auto; font-size:16px; line-height:1.5; resize:none; overflow-y:auto; max-height:8.5rem; }
        .dash-agent-btn         { flex:0 0 auto; min-width:44px; min-height:44px; justify-content:center; }
        .dash-agent-hdr-actions { display:flex; flex-wrap:wrap; gap:0.5rem; }
        .dash-agent--popout     { margin:0; height:100vh; height:100dvh; border:0; border-radius:0; }
        /* The pop-out is a narrow side window: keep the header buttons on one row. */
        .dash-agent--popout .dash-agent-hdr-actions { gap:0.15rem; }
        .dash-agent--popout .dash-agent-hdr-actions .btn { padding-left:0.45rem; padding-right:0.45rem; letter-spacing:0.06em; }
        .dash-agent-popout-btn  { display:none; }
        .dash-sr-only           { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
        @media(min-width:768px){
          .dash-agent             { flex-direction:row; height:min(450px, 70vh); overflow:hidden; }
          .dash-agent-mascot      { display:flex; }
          .dash-agent-hdr-avatar,
          .dash-agent-hdr-status  { display:none; }
          .dash-agent-popout-btn  { display:inline-flex; }
          .dash-agent-chips       { flex-wrap:wrap; overflow-x:visible; padding:0.6rem 1.25rem 0; scroll-snap-type:none; }
          .dash-agent-chip        { min-height:0; }
          .dash-agent-form        { padding:0.5rem 1.25rem 0.75rem; align-items:stretch; }
          .dash-agent-btn         { min-width:0; min-height:0; }
          textarea.dash-agent-input { font-size:14px; }
        }

        @media(min-width:640px){
          .dash-appr-grid     { grid-template-columns:repeat(2,1fr); gap:0.25rem 1.5rem; }
          .dash-draft-grid    { grid-template-columns:1fr 2fr; }
          .dash-msg-ai        { max-width:75%; }
          .dash-msg-user      { max-width:60%; }
        }
      `}</style>

          <div className={isPopout ? 'dash-agent dash-agent--popout' : 'dash-agent'}>

            {/* Left — mascot column (hidden below 768px; a small avatar shows in the header instead) */}
            <div className="dash-agent-mascot" style={{ width: 220, flexShrink: 0, background: 'var(--bg-overlay)', borderRight: '1px solid var(--border)', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 }}>
              <div style={{ width: 120, height: 120, borderRadius: '50%', background: '#0d1420', border: '3px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', flexShrink: 0 }}>
                <img src="/Agent-Camel.jpg" alt="Booking agent mascot" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>Online · ready</span>
              </div>
            </div>

            {/* Right — chat column */}
            <div className="dash-agent-chat">
            {/* Header */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                {/* Mobile-only avatar + status; decorative here because the status text carries the meaning */}
                <img src="/Agent-Camel.jpg" alt="" className="dash-agent-hdr-avatar" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>AI BOOKING AGENT</span>
                  <span className="dash-agent-hdr-status">
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0 }} />
                    Online · ready
                  </span>
                </div>
              </div>
              <div className="dash-agent-hdr-actions">
                {historyView !== null ? (
                  <button type="button" onClick={closeHistory} className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }}>
                    ← Back to today
                  </button>
                ) : (
                  <button type="button" onClick={openHistory} className="btn btn-ghost btn-sm" style={{ color: 'var(--text-muted)' }} disabled={agentLoading || !conversationLoaded}>
                    History
                  </button>
                )}
                {historyView === null && messages.length > 1 && (
                  <button onClick={startNewChat} className="btn btn-ghost btn-sm" style={{ color: 'var(--text-muted)' }} disabled={agentLoading}>
                    + New Chat
                  </button>
                )}
                {historyView === null && messages.length > 1 && (
                  <button onClick={saveConversation} className="btn btn-ghost btn-sm" style={{ color: noteSaved ? '#34d399' : 'var(--text-muted)' }} disabled={agentLoading}>
                    {noteSaved ? '✓ Saved' : '↓ Save Note'}
                  </button>
                )}
                {!isPopout && onPopOut && (
                  <button
                    type="button"
                    onClick={onPopOut}
                    className="btn btn-ghost btn-sm dash-agent-popout-btn"
                    style={{ color: 'var(--text-muted)' }}
                    disabled={popOutBlocked}
                    title={popOutBlocked ? 'Finish or cancel what the agent is working on first' : 'Open the agent in its own window you can move anywhere'}
                  >
                    Pop out ↗
                  </button>
                )}
                {isPopout && onDock && (
                  <button
                    type="button"
                    onClick={onDock}
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--text-muted)' }}
                    disabled={popOutBlocked}
                    title={popOutBlocked ? 'Finish or cancel what the agent is working on first' : 'Close this window and put the agent back on the dashboard'}
                  >
                    ↙ Dock
                  </button>
                )}
              </div>
            </div>

            {/* Thread */}
            <div
              ref={threadRef}
              role="log"
              aria-live="polite"
              aria-label={historyView === null ? 'Agent conversation' : historyView === 'list' ? 'Past assistant chats' : 'Saved assistant chat'}
              tabIndex={0}
              onFocus={e => { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '-2px'; }}
              onBlur={e => { e.currentTarget.style.outline = ''; e.currentTarget.style.outlineOffset = ''; }}
              style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', minHeight: 0 }}
            >
              {historyView === 'list' && (
                <AssistantHistoryList
                  days={historyDays}
                  loading={historyLoading}
                  error={historyError}
                  onOpen={openHistoryDay}
                  onRetry={openHistory}
                />
              )}
              {historyView !== null && historyView !== 'list' && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', alignSelf: 'center', textAlign: 'center' }}>
                  {formatShowDate(historyView, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · saved chat · read only
                </div>
              )}
              {historyView !== null && historyView !== 'list' && historyLoading && (
                <div role="status" style={{ color: 'var(--text-muted)', fontSize: 13, alignSelf: 'center' }}>Loading that day…</div>
              )}
              {historyView !== null && historyView !== 'list' && historyError && (
                <div role="alert" style={{ color: '#f87171', fontSize: 13, alignSelf: 'center', textAlign: 'center' }}>
                  {historyError}{' '}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openHistoryDay(historyView)}>Try again</button>
                </div>
              )}
              {(historyView === 'list' ? [] : historyView !== null ? historyMessages : messages).map((m, i) => {
                const isLong     = m.content.length > 280;
                const isExpanded = expandedMsgs.has(i);
                const toggleExpand = () => setExpandedMsgs(prev => {
                  const next = new Set(prev);
                  next.has(i) ? next.delete(i) : next.add(i);
                  return next;
                });
                return (
                  <div key={i} className={m.role === 'user' ? 'dash-msg-user' : 'dash-msg-ai'}
                    style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <div style={{
                      padding: '0.6rem 0.85rem',
                      background: m.role === 'user' ? 'rgba(224,120,32,0.14)' : 'var(--bg-overlay)',
                      border: `1px solid ${m.role === 'user' ? 'rgba(224,120,32,0.3)' : 'var(--border)'}`,
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                      ...(isLong && !isExpanded ? { maxHeight: '7.5em', overflow: 'hidden' } : {}),
                    }}>
                      {m.content.split(/\*\*(.*?)\*\*/g).map((chunk, ci) =>
                        ci % 2 === 1
                          ? <strong key={ci} style={{ color: 'var(--accent)', fontWeight: 700 }}>{chunk}</strong>
                          : chunk
                      )}
                    </div>
                    {isLong && (
                      <button
                        onClick={toggleExpand}
                        style={{
                          alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 12, color: 'var(--accent)', fontWeight: 700,
                          padding: '0 0.2rem', lineHeight: 1,
                        }}
                        onFocus={e => { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '2px'; }}
                        onBlur={e => { e.currentTarget.style.outline = ''; }}
                      >
                        {isExpanded ? 'Show less ↑' : 'Show more ↓'}
                      </button>
                    )}
                  </div>
                );
              })}
              {historyView === null && agentLoading && <div style={{ color: 'var(--text-muted)', fontSize: 13, fontFamily: 'var(--font-mono)', alignSelf: 'flex-start' }}>thinking…</div>}

              {/* Approval panel */}
              {historyView === null && pendingAction && pendingAction.type === 'stage_items' && (
                <div style={{ background: 'var(--bg-overlay)', border: '1px solid var(--accent)', padding: '0.85rem 1rem', fontSize: 13, display: 'flex', flexDirection: 'column', gap: '0.65rem', alignSelf: 'stretch' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                    {`STAGING ${pendingAction.staged.length} ITEM${pendingAction.staged.length !== 1 ? 'S' : ''}${pendingAction.staged[0]?.proposal?.tour_name ? ` — ${pendingAction.staged[0].proposal.tour_name.toUpperCase()}` : ''}`}
                  </div>

                  {/* Item list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {pendingAction.staged.map((item: any, i: number) => {
                      const p = item.proposal;
                      const summary = summarizeStagedItem(item);
                      const hasConflicts = item.conflicts?.length > 0;
                      const conflictDetail = hasConflicts
                        ? item.conflicts.map((c: any) => `${c.venues?.name || 'another show'} [${c.status}]`).join(', ')
                        : '';
                      return (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ color: 'var(--text-primary)', fontSize: 13 }}>{summary}</span>
                          </div>
                          {(item.kind === 'email_draft' || item.kind === 'note_upsert') && (p.body || p.content) && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 460, whiteSpace: 'pre-wrap' }}>
                              {String(p.body || p.content).slice(0, 200)}{String(p.body || p.content).length > 200 ? '…' : ''}
                            </div>
                          )}
                          {item.kind === 'note_upsert' && p.mode === 'replace' && p.existing_preview && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Replaces: {String(p.existing_preview)}</span>
                          )}
                          {item.kind === 'social_draft' && p.caption && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 460, whiteSpace: 'pre-wrap' }}>
                              {String(p.caption).slice(0, 300)}{String(p.caption).length > 300 ? '…' : ''}
                            </div>
                          )}
                          {item.kind === 'record_delete' && Array.isArray(p.items) && p.items.some((it: any) => Array.isArray(it.shows) && it.shows.length > 0) && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 460 }}>
                              {p.include_shows ? 'Shows deleted with it:' : 'Shows kept on your calendar:'}
                              {p.items.flatMap((it: any) => it.shows ?? []).map((sh: any) => (
                                <div key={sh.id}>• {String(sh.label)}</div>
                              ))}
                            </div>
                          )}
                          {item.kind === 'record_delete' && (
                            <span style={{ fontSize: 11, color: 'var(--orange)' }}>⚠ Deleting can&apos;t be undone. Past shows and money records are never touched.</span>
                          )}
                          {item.kind === 'member_invite' && (
                            <span style={{ fontSize: 11, color: 'var(--orange)' }}>⚠ Confirming emails an invite link to {String(p.email)}.</span>
                          )}
                          {item.kind === 'email_template_upsert' && p.body && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 460, whiteSpace: 'pre-wrap' }}>
                              {String(p.body).slice(0, 200)}{String(p.body).length > 200 ? '…' : ''}
                            </div>
                          )}
                          {item.kind === 'email_template_upsert' && p.replaces_existing && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Confirming overwrites your saved template with this title. Nothing is sent.</span>
                          )}
                          {item.kind === 'email_send' && p.body && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 460, whiteSpace: 'pre-wrap' }}>
                              {String(p.body).slice(0, 150)}{String(p.body).length > 150 ? '…' : ''}
                            </div>
                          )}
                          {item.kind === 'email_send' && (
                            <span style={{ fontSize: 11, color: '#f59e0b' }}>⚠ Confirming sends this email immediately to a real recipient.</span>
                          )}
                          {hasConflicts && (
                            <span style={{ color: '#f59e0b', fontSize: 11 }}>⚠ same date as: {conflictDetail}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {pendingAction.errors.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      {pendingAction.errors.map((e: string, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: '#f87171' }}>Couldn't stage: {e}</div>
                      ))}
                    </div>
                  )}

                  {(pendingAction.overflow ?? 0) > 0 && (
                    <div style={{ fontSize: 12, color: '#f59e0b' }}>
                      +{pendingAction.overflow} more not staged yet — say "continue" to stage the next batch.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={approveSend} disabled={sending || pendingAction.staged.length === 0}>
                      {sending ? 'Saving…' : `Confirm & Save All (${pendingAction.staged.length})`}
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => { setPendingAction(null); setSendResult(null); }} disabled={sending}>Cancel</button>
                  </div>
                </div>
              )}

              {historyView === null && pendingAction && (pendingAction.type === 'tour_outreach' || pendingAction.type === 'city_search') && (
                <div style={{ background: 'var(--bg-overlay)', border: '1px solid var(--accent)', padding: '0.85rem 1rem', fontSize: 13, display: 'flex', flexDirection: 'column', gap: '0.65rem', alignSelf: 'stretch' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                    {pendingAction.type === 'tour_outreach'
                      ? `${pendingAction.stage === 'follow_up' ? 'FOLLOW-UP · ' : ''}${pendingAction.venues.length} VENUES — ${pendingAction.tourName.toUpperCase()}`
                      : `${pendingAction.venues.length} VENUES — ${pendingAction.city.toUpperCase()}, ${pendingAction.state}`}
                  </div>

                  {/* Venue checklist */}
                  <div className="dash-appr-grid">
                    {pendingAction.venues.map((v: any) => {
                      const id = pendingAction.type === 'tour_outreach' ? v.tourVenueId : v.id;
                      const hasEmail = !!v.email;
                      return (
                        <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: hasEmail ? 'pointer' : 'default', opacity: hasEmail ? 1 : 0.4 }}>
                          <input type="checkbox" checked={selectedVenueIds.has(id) && hasEmail} disabled={!hasEmail}
                            onChange={() => setSelectedVenueIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })} />
                          <span style={{ color: 'var(--text-primary)', fontSize: 13 }}>{v.name}</span>
                          {v.city && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{v.city}</span>}
                          {!hasEmail && <span style={{ color: '#f87171', fontSize: 11, marginLeft: 'auto' }}>no email</span>}
                        </label>
                      );
                    })}
                  </div>

                  {/* Email draft editor */}
                  {pendingAction.type === 'tour_outreach' && (
                    <div role="note" style={{ fontSize: 12, fontWeight: 600, color: pendingAction.draftSource === 'agreed' ? 'var(--green)' : '#f59e0b' }}>
                      {pendingAction.draftSource === 'agreed'
                        ? '✓ This is the email you approved in chat. Edit below if needed.'
                        : '⚠ New draft written for this send. Read it before sending.'}
                    </div>
                  )}
                  {pendingAction.type === 'tour_outreach' && (
                    <div className="dash-draft-grid">
                      <input className="input" style={{ fontSize: 13 }} placeholder="Subject" value={draftSubject} onChange={e => setDraftSubject(e.target.value)} />
                      <textarea className="input" style={{ fontSize: 13, minHeight: 80, resize: 'vertical' }} value={draftBody} onChange={e => setDraftBody(e.target.value)} />
                    </div>
                  )}
                  {pendingAction.type === 'tour_outreach' && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{'{venue_name}'} and {'{contact_name}'} are personalized per recipient.</div>
                  )}

                  {sendResult && (
                    <div style={{ fontSize: 13, color: '#34d399', fontWeight: 600 }}>
                      ✓ Sent {sendResult.sent}{sendResult.noEmail ? `, ${sendResult.noEmail} skipped` : ''}{sendResult.errors ? `, ${sendResult.errors} errors` : ''}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={approveSend} disabled={sending || selectedVenueIds.size === 0}>
                      {sending ? 'Sending…' : `Send to ${selectedVenueIds.size} venue${selectedVenueIds.size !== 1 ? 's' : ''}`}
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => { setPendingAction(null); setSendResult(null); }} disabled={sending}>Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {/* Chips, errors and input belong to today's live chat; History is read-only. */}
            {historyView === null && (<>
            {/* Quick chips */}
            <div className="dash-agent-chips" role="group" aria-label="Suggested questions">
              {QUICK_CHIPS.map(chip =>
                chip.href && isPopout ? (
                  // In the pop-out, app pages open in the main window, not this narrow one.
                  <button key={chip.label} type="button" className="dash-agent-chip" onClick={() => openInMainWindow(window, chip.href!)} style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, padding: '0.3rem 0.75rem', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', background: 'rgba(255,255,255,0.08)', cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'rgba(224,120,32,0.15)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.25)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}>
                    {chip.label} ↗
                  </button>
                ) : chip.href ? (
                  <Link key={chip.label} href={chip.href} className="dash-agent-chip" style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, padding: '0.3rem 0.75rem', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', background: 'rgba(255,255,255,0.08)', textDecoration: 'none', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'rgba(224,120,32,0.15)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.25)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}>
                    {chip.label}
                  </Link>
                ) : (
                  <button key={chip.label} type="button" className="dash-agent-chip" onClick={() => sendMessage(chip.prompt!)} disabled={agentLoading} style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, padding: '0.3rem 0.75rem', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', background: 'rgba(255,255,255,0.08)', cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'rgba(224,120,32,0.15)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.25)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}>
                    {chip.label}
                  </button>
                )
              )}
            </div>

            {agentError && <div style={{ margin: '0.4rem 1.25rem 0', fontSize: 13, color: '#f87171' }}>{agentError}</div>}

            {/* Input */}
            <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              {/* Attachment badge */}
              {attachedFile && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.4rem 1.25rem 0',
                }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                    background: 'rgba(196,123,43,0.15)', border: '1px solid rgba(196,123,43,0.4)',
                    borderRadius: 4, padding: '0.2rem 0.55rem',
                    fontSize: 12, color: '#c47b2b', fontFamily: 'var(--font-body)',
                  }}>
                    📎 {attachedFile.name}
                    <button
                      onClick={() => setAttachedFile(null)}
                      style={{ background: 'none', border: 'none', color: '#c47b2b', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}
                      title="Remove attachment"
                    >✕</button>
                  </span>
                </div>
              )}
              <form
                onSubmit={e => { e.preventDefault(); sendMessage(agentInput); }}
                className="dash-agent-form"
              >
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.xlsx,.xls,.pdf"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                {/* Paperclip button */}
                <button
                  type="button"
                  className="dash-agent-btn"
                  title="Attach file (CSV, Excel, PDF)"
                  aria-label="Attach file (CSV, Excel, PDF)"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={agentLoading || fileLoading}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.3)', color: fileLoading ? '#c47b2b' : 'rgba(255,255,255,0.7)',
                    cursor: agentLoading || fileLoading ? 'not-allowed' : 'pointer',
                    fontSize: 16, padding: '0 0.6rem', borderRadius: 4,
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  {fileLoading ? '⏳' : '📎'}
                </button>
                <label htmlFor="dash-agent-input" className="dash-sr-only">Message the booking agent</label>
                {/* Sizing (flex, min-width:0, 16px font on mobile to stop iOS zoom) lives in
                    textarea.dash-agent-input — inline flex/fontSize would override the media query. */}
                <textarea
                  id="dash-agent-input"
                  ref={agentInputRef}
                  className="input dash-agent-input"
                  rows={1}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    color: '#fff',
                    opacity: 1,
                  }}
                  placeholder={attachedFile ? 'Add a message or just hit send…' : `Ask about ${act.act_name || 'your pipeline'}, or attach a show list…`}
                  value={agentInput}
                  onChange={e => setAgentInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      if (!agentLoading && (agentInput.trim() || attachedFile)) sendMessage(agentInput);
                    }
                  }}
                />
                <button
                  type="submit"
                  className="btn dash-agent-btn"
                  aria-label="Send message"
                  style={{
                    background: '#c47b2b',
                    border: 'none',
                    color: '#fff',
                    opacity: 1,
                    cursor: agentLoading ? 'wait' : 'pointer',
                    fontWeight: 700,
                    fontSize: 16,
                  }}
                  disabled={agentLoading || fileLoading}
                >
                  {agentLoading ? '…' : '→'}
                </button>
              </form>
            </div>
            </>)}
            </div>{/* end right column */}
          </div>{/* end agent panel */}
    </>
  );
}
