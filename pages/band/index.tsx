import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { getActId } from '../../lib/bookingQueries';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { formatShowDate, localToday, parseLocalDate } from '../../lib/formatDate';
import PageHero from '../../components/layout/PageHero';
import StageScene from '../../components/dashboard/StageScene';
import AgentRequests from '../../components/band/AgentRequests';
import styles from '../../styles/dashboard.module.css';
import { FEATURES } from '../../lib/featureFlags';
import AssistantHistoryList from '../../components/dashboard/AssistantHistoryList';
import type { ConversationDaySummary } from '../../lib/agentConversationDays';
import { STATUS_COLORS } from '../../lib/statusSync';
import { BOOKING_STATUS_LABELS } from '../../lib/types';
import { buildConfirmMessage, describeTourUpdate, describeVenueUpsert, describeContactUpsert, describeWrapup, describeExpenseUpdate, describeOfficeAction, describeDelete } from '../../lib/agentStagingHelpers';

// ── Types ──────────────────────────────────────────────────────────────────────
type Message = { role: 'user' | 'assistant'; content: string };

type TourBooking  = { id: string; status: string };
type TourTile     = { id: string; name: string; start_date: string | null; end_date: string | null; description: string | null; bookings: TourBooking[] };
type VenueSnippet = { id: string; name: string; city: string | null; state: string | null };
type TargetTile   = { id: string; venue: VenueSnippet | null };

// Supabase's untyped TS client types many-to-one embedded resources as arrays,
// but PostgREST returns a single object at runtime. This normaliser handles both.
function normaliseTarget(row: { id: string; venue: VenueSnippet | VenueSnippet[] | null }): TargetTile {
  const v = row.venue;
  if (!v) return { id: row.id, venue: null };
  if (Array.isArray(v)) return { id: row.id, venue: v[0] ?? null };
  return { id: row.id, venue: v };
}

const CLAMP_2_STYLE: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-muted)',
  overflow: 'hidden', display: '-webkit-box',
  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
};

type TourOutreachAction = {
  type: 'tour_outreach';
  tourId: string;
  tourName: string;
  /** 'follow_up' when the card emails venues already pitched (agent outreach to Follow up). */
  stage?: 'target' | 'follow_up';
  venues: { tourVenueId: string; venueId: string; name: string; city?: string; state?: string; email?: string | null; contactName?: string | null }[];
  draft: { subject: string; body: string };
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

// ── Dashboard ─────────────────────────────────────────────────────────────────

/** Booked statuses that belong in "Upcoming shows" (contract onward, not yet played). */
const UPCOMING_STATUSES = ['contract', 'confirmed', 'advancing'];

/** Whole days from today (local) to a YYYY-MM-DD show date. */
function daysUntil(showDate: string, today: string): number {
  const a = parseLocalDate(today);
  const b = parseLocalDate(showDate);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
}

type DashTile = { label: string; sub: string; href: string; accent: string; icon: string };

/** Bottom-of-dashboard shortcut tiles. Socials only appears while that feature is switched on. */
const dashTiles: DashTile[] = [
  ...(FEATURES.socials ? [{ label: 'SOCIALS', sub: 'Social post queue', href: '/social', accent: '#e879f9', icon: '✦' }] : []),
  { label: 'CALENDAR',   sub: 'View all shows',        href: '/calendar',   accent: '#60a5fa', icon: '◷' },
  { label: 'FINANCIALS', sub: 'Track payments & fees', href: '/financials', accent: '#34d399', icon: '$' },
  { label: 'HISTORY',    sub: 'Past shows & notes',    href: '/history',    accent: '#f59e0b', icon: '◎' },
];

export default function BandDashboard() {
  // Data
  const [myAct, setMyAct]             = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [targetsCount, setTargetsCount]   = useState(0);
  const [toursCount, setToursCount]     = useState(0);
  const [upcomingShows, setUpcomingShows] = useState<any[]>([]);
  const [bookedAhead, setBookedAhead]   = useState(0);
  // The browser's local day (set on load), so tonight's show still counts as upcoming after 7 PM Central.
  const [today, setToday]               = useState('');
  const [tours, setTours]               = useState<TourTile[]>([]);
  const [targets, setTargets]           = useState<TargetTile[]>([]);
  const [loading, setLoading]           = useState(true);

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

  // Band setup form (shown when act_id is null)
  const [setupForm, setSetupForm]     = useState({ act_name: '', home_city: '', home_state: '', bio: '' });
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError]   = useState('');

  const threadRef   = useRef<HTMLDivElement>(null);
  const agentInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pendingAction]);

  // Load any previously saved conversation for this user+act before deciding whether
  // to show the fresh greeting — this is what makes the chat survive navigating away
  // and back, instead of resetting every time the component remounts.
  useEffect(() => {
    if (!myAct || !userProfile || conversationLoaded) return;
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
  }, [myAct, userProfile, conversationLoaded]);

  const buildGreeting = () => {
    const hour = new Date().getHours();
    const greetingWord = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const firstName = (userProfile?.display_name || '').split(' ')[0] || myAct?.act_name || 'there';
    return `${greetingWord} ${firstName}! Currently you have ${toursCount} active tour${toursCount !== 1 ? 's' : ''} and ${targetsCount} target${targetsCount !== 1 ? 's' : ''} in the pipeline. What should we work on today?`;
  };

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
    if (myAct && userProfile && conversationLoaded && !greetingSent && !loading) {
      setGreetingSent(true);
      setMessages([{ role: 'assistant' as const, content: buildGreeting() }]);
    }
  }, [myAct, userProfile, loading, greetingSent, conversationLoaded, targetsCount, toursCount]);

  // Focus the agent input once myAct loads (input isn't in the DOM until then)
  useEffect(() => {
    if (myAct) agentInputRef.current?.focus();
  }, [myAct]);

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

  const load = async () => {
    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 5000);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) return;

      const actId = await getActId(supabase, user.id);
      if (!actId) {
        // Still need role so the no-act render shows the right message vs the setup form.
        const { data: noActProfile } = await supabase
          .from('profiles').select('role').eq('id', user.id).maybeSingle();
        setUserProfile(noActProfile || null);
        return;
      }

      const [actRes, profileRes] = await Promise.all([
        supabase.from('acts').select('id, owner_id, act_name, genre, bio, website, instagram, spotify, logo_url, member_count, gcal_calendar_id, is_active, created_at, updated_at, contact_email, contact_phone, home_city, home_state, facebook, username, epk_link, profile_photo_url, calendar_name, sync_enabled, calendar_type, ical_url, last_synced_at, tiktok_url, facebook_url, instagram_url, epk_url, gmail_address, gmail_connected_at, ical_feed_token').eq('id', actId).eq('is_active', true).single(),
        supabase.from('profiles').select('display_name, email, role').eq('id', user.id).single(),
      ]);

      setMyAct(actRes.data || null);
      setUserProfile(profileRes.data || null);

      if (actRes.data) {
        // Accurate counts per spec
        const tourIdsRes = await supabase.from('tours').select('id').eq('act_id', actId).neq('status', 'cancelled');
        const tourIds = (tourIdsRes.data ?? []).map((t: { id: string }) => t.id);

        const today = localToday();
        setToday(today);
        const [tvTargetRes, toursCountRes, toursRes, upcomingRes, targetsRes, aheadRes] = await Promise.all([
          tourIds.length
            ? supabase.from('tour_venues').select('id', { count: 'exact', head: true }).in('tour_id', tourIds).eq('status', 'target')
            : Promise.resolve({ count: 0 }),
          supabase.from('tours').select('id', { count: 'exact', head: true }).eq('act_id', actId).in('status', ['planning', 'active']),
          supabase.from('tours')
            .select('id, name, start_date, end_date, description, bookings(id, status)')
            .eq('act_id', actId)
            .in('status', ['planning', 'active'])
            .order('start_date', { ascending: true, nullsFirst: false })
            .limit(4),
          // Upcoming row shows booked shows only (contract, confirmed, advancing) — pitch/hold/target don't belong here
          supabase.from('bookings')
            .select('id, status, show_date, venue:venues(id, name, city, state)')
            .eq('act_id', actId)
            .in('status', UPCOMING_STATUSES)
            .not('show_date', 'is', null)
            .gte('show_date', today)
            .order('show_date')
            .limit(8),
          tourIds.length
            ? supabase.from('tour_venues')
                .select('id, venue:venues(id, name, city, state)')
                .in('tour_id', tourIds)
                .eq('status', 'target')
                .limit(16)
            : Promise.resolve({ data: [] }),
          supabase.from('bookings').select('id', { count: 'exact', head: true })
            .eq('act_id', actId).in('status', UPCOMING_STATUSES).gte('show_date', today),
        ]);

        setTargetsCount(tvTargetRes.count ?? 0);
        setToursCount(toursCountRes.count ?? 0);
        setTours(toursRes.data ?? []);
        setUpcomingShows(upcomingRes.data ?? []);
        setBookedAhead(aheadRes.count ?? 0);
        const targetRows: Array<{ id: string; venue: VenueSnippet | VenueSnippet[] | null }> = targetsRes.data ?? [];
        setTargets(targetRows.map(normaliseTarget));
      }
    } catch (err) {
      console.error('band dashboard load:', err);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const createAct = async () => {
    if (!setupForm.act_name.trim()) { setSetupError('Act name is required.'); return; }
    setSetupSaving(true);
    setSetupError('');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSetupError('Not signed in.'); setSetupSaving(false); return; }

    const res = await fetch('/api/band/setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        act_name:   setupForm.act_name.trim(),
        home_city:  setupForm.home_city.trim() || undefined,
        home_state: setupForm.home_state.trim() || undefined,
        bio:        setupForm.bio.trim() || undefined,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      setSetupError(json.error?.message || 'Failed to create act.');
      setSetupSaving(false);
      return;
    }

    await load();
  };

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
    if (!pendingAction || sending || !myAct) return;

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
        load();
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
        actId:   myAct.id,
        tourId:  pendingAction.tourId,
      };
    } else if (pendingAction.type === 'city_search') {
      payload = {
        venues:    pendingAction.venues.filter(v => selectedVenueIds.has(v.id)).map(v => ({ venueId: v.id, name: v.name, city: v.city, state: v.state, email: v.email, contactName: null })),
        subject:   draftSubject || `Booking inquiry — ${myAct.act_name}`,
        body:      draftBody || `Hi {contact_name},\n\nWe're reaching out about booking ${myAct.act_name} at {venue_name}.\n\nBest,\nCamel Ranch Booking`,
        actId:     myAct.id,
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
      load();
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

  const userInitials = userProfile?.display_name
    ? userProfile.display_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : userProfile?.email?.[0]?.toUpperCase() || '?';

  const nextShow = upcomingShows[0] ?? null;
  const nextShowDays = nextShow && today ? daysUntil(nextShow.show_date, today) : null;
  const heroLine = loading ? undefined : [
    nextShow && nextShowDays !== null
      ? `Next up: ${nextShow.venue?.name || 'a show'} ${nextShowDays === 0 ? 'tonight' : nextShowDays === 1 ? 'tomorrow' : `in ${nextShowDays} days`}`
      : 'No shows booked yet',
    `${toursCount} active tour${toursCount === 1 ? '' : 's'}`,
    `${targetsCount} target${targetsCount === 1 ? '' : 's'} to pitch`,
  ].join(' · ') + '.';

  const tagline = myAct ? [
    myAct.genre,
    myAct.home_city && myAct.home_state ? `${myAct.home_city}, ${myAct.home_state}` : myAct.home_city || null,
  ].filter(Boolean).join(' · ') : '';

  return (
    <AppShell requireRole="band_admin">
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
        .dash-sr-only           { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
        @media(min-width:768px){
          .dash-agent             { flex-direction:row; height:min(450px, 70vh); overflow:hidden; }
          .dash-agent-mascot      { display:flex; }
          .dash-agent-hdr-avatar,
          .dash-agent-hdr-status  { display:none; }
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

      {/* ── Header: the band's name over an illustrated stage, in the Tours style ── */}
      {myAct && (
        <PageHero
          title={myAct.act_name || 'Dashboard'}
          subtitle={tagline || 'Band dashboard'}
          summary={heroLine}
          scene={<StageScene />}
          actions={
            <div className={styles.heroBadge}>
              {myAct.profile_photo_url
                ? <img src={myAct.profile_photo_url} alt={`${myAct.act_name} photo`} className={styles.heroPhoto} />
                : <span className={styles.heroInitial} aria-hidden="true">{myAct.act_name?.[0] || '?'}</span>}
              <span className={styles.heroUser} title="Signed in">{userInitials}</span>
            </div>
          }
        />
      )}

      {/* ── No act state ─────────────────────────────────────────────────────── */}
      {!loading && !myAct && userProfile?.role !== 'band_admin' && (
        <div className="card" style={{ maxWidth: 480, margin: '4rem auto', padding: '2.5rem 2rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', color: 'var(--accent)', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>NOT YET LINKED</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Ask your band admin to invite you. Once you accept the invitation, the dashboard will unlock.</p>
        </div>
      )}

      {/* ── No act state — inline setup form (band_admin only) ───────────────── */}
      {!loading && !myAct && userProfile?.role === 'band_admin' && (
        <div className="card" style={{ maxWidth: 480, margin: '4rem auto', padding: '2.5rem 2rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', color: 'var(--accent)', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>GET STARTED</div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.75rem', fontSize: 14 }}>Create your band profile to unlock the dashboard.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Act Name <span style={{ color: '#f87171' }}>*</span></label>
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. The Desert Kings"
                value={setupForm.act_name}
                onChange={e => setSetupForm(f => ({ ...f, act_name: e.target.value }))}
                disabled={setupSaving}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Home City</label>
                <input
                  className="input"
                  style={{ width: '100%' }}
                  placeholder="Nashville"
                  value={setupForm.home_city}
                  onChange={e => setSetupForm(f => ({ ...f, home_city: e.target.value }))}
                  disabled={setupSaving}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>State</label>
                <input
                  className="input"
                  style={{ width: '100%' }}
                  placeholder="TN"
                  value={setupForm.home_state}
                  onChange={e => setSetupForm(f => ({ ...f, home_state: e.target.value }))}
                  disabled={setupSaving}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Bio</label>
              <textarea
                className="input"
                style={{ width: '100%', minHeight: 80, resize: 'vertical' }}
                placeholder="A few sentences about your act…"
                value={setupForm.bio}
                onChange={e => setSetupForm(f => ({ ...f, bio: e.target.value }))}
                disabled={setupSaving}
              />
            </div>

            {setupError && <div style={{ fontSize: 13, color: '#f87171' }}>{setupError}</div>}

            <button
              className="btn btn-primary"
              style={{ marginTop: '0.25rem' }}
              onClick={createAct}
              disabled={setupSaving || !setupForm.act_name.trim()}
            >
              {setupSaving ? 'Creating…' : 'Create Band Profile →'}
            </button>
          </div>
        </div>
      )}

      {myAct && (
        <>
          {/* ── At a glance (Tours-style trackers) ──────────────────────────── */}
          <section className="tours-metrics" aria-label="Band at a glance">
            <Link href={nextShow ? '/today' : '/calendar'} className={`tour-metric ${styles.metricLink}`}>
              <span className="tour-metric-label">Next show</span>
              {loading ? <span className={styles.metricSkeleton} /> : nextShow && nextShowDays !== null ? (
                <>
                  <span className="tour-metric-value">
                    {nextShowDays === 0
                      ? <><strong className="tour-metric-hot">Tonight</strong><span>{nextShow.venue?.name || 'Venue TBD'}</span></>
                      : <><strong>{nextShowDays}</strong><span>{nextShowDays === 1 ? 'day' : 'days'} · {nextShow.venue?.name || 'Venue TBD'}</span></>}
                  </span>
                  <span className="tour-metric-note">{formatShowDate(nextShow.show_date, { weekday: 'short', month: 'short', day: 'numeric' })}{nextShow.venue?.city ? ` · ${[nextShow.venue.city, nextShow.venue.state].filter(Boolean).join(', ')}` : ''}</span>
                </>
              ) : <span className="tour-metric-value"><span>Nothing booked yet</span></span>}
            </Link>
            <Link href="/calendar" className={`tour-metric ${styles.metricLink}`}>
              <span className="tour-metric-label">Booked ahead</span>
              <span className="tour-metric-value"><strong>{loading ? '–' : bookedAhead}</strong><span>{bookedAhead === 1 ? 'show' : 'shows'} on the calendar</span></span>
            </Link>
            <Link href="/tours" className={`tour-metric ${styles.metricLink}`}>
              <span className="tour-metric-label">Active tours</span>
              <span className="tour-metric-value"><strong>{loading ? '–' : toursCount}</strong><span>planning or on the road</span></span>
            </Link>
            <Link href="/email?tab=outreach&status=target" className={`tour-metric ${styles.metricLink}`}>
              <span className="tour-metric-label">Targets</span>
              <span className="tour-metric-value"><strong className={targetsCount > 0 ? 'tour-metric-hot' : undefined}>{loading ? '–' : targetsCount}</strong><span>venues to pitch</span></span>
            </Link>
          </section>

          {/* ── Requests from the band's Booking Agent (only when there are any) ── */}
          <AgentRequests onAdded={() => void load()} />

          {/* ── Upcoming Shows ──────────────────────────────────────────────── */}
          <section className={styles.section} aria-labelledby="dash-upcoming">
            <header className={styles.sectionHead}>
              <h2 className={styles.sectionTitle} id="dash-upcoming">Upcoming shows</h2>
              <Link href="/calendar" className={styles.viewAll}>View calendar →</Link>
            </header>
            {loading ? <div className={`tour-skeleton ${styles.skeletonRow}`} /> : upcomingShows.length === 0 ? (
              <div className={styles.empty}>
                <span>No booked shows ahead yet.</span>
                <Link href="/calendar" className="btn btn-secondary btn-sm">+ Add a show</Link>
              </div>
            ) : (
              <ul className={styles.showRail}>
                {upcomingShows.map((show: any) => {
                  const color = STATUS_COLORS[show.status] || '#6b7280';
                  const d = parseLocalDate(show.show_date);
                  return (
                    <li key={show.id}>
                      <Link href={`/bookings/${show.id}`} className={styles.showCard} style={{ borderTopColor: color }}>
                        <span className={styles.showDate}>
                          <strong>{d.getDate()}</strong>
                          <span>{formatShowDate(show.show_date, { month: 'short' })} · {formatShowDate(show.show_date, { weekday: 'short' })}</span>
                        </span>
                        <span className={styles.showName}>{show.venue?.name || 'Venue TBD'}</span>
                        <span className={styles.showWhere}>{[show.venue?.city, show.venue?.state].filter(Boolean).join(', ') || BOOKING_STATUS_LABELS[show.status as keyof typeof BOOKING_STATUS_LABELS]}</span>
                        <span className={styles.showStatus} style={{ color }}>{BOOKING_STATUS_LABELS[show.status as keyof typeof BOOKING_STATUS_LABELS] || show.status}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className={styles.twoUp}>
            {/* ── Tours ─────────────────────────────────────────────────────── */}
            <section className={styles.section} aria-labelledby="dash-tours">
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle} id="dash-tours">Tours</h2>
                <Link href="/tours" className={styles.viewAll}>All tours →</Link>
              </header>
              {loading ? <div className={`tour-skeleton ${styles.skeletonRow}`} /> : tours.length === 0 ? (
                <div className={styles.empty}>
                  <span>No active tours.</span>
                  <Link href="/tours" className="btn btn-secondary btn-sm">+ Plan a tour</Link>
                </div>
              ) : (
                <ul className={styles.tourList}>
                  {tours.map(tour => {
                    const active = tour.bookings.filter(b => b.status !== 'cancelled');
                    const booked = active.filter(b => UPCOMING_STATUSES.includes(b.status) || b.status === 'completed');
                    const pct = active.length ? Math.round((booked.length / active.length) * 100) : 0;
                    const range = ([tour.start_date, tour.end_date] as const)
                      .filter((x): x is string => x !== null)
                      .map(x => formatShowDate(x, { month: 'short', day: 'numeric' }))
                      .join(' – ');
                    return (
                      <li key={tour.id}>
                        <Link href={`/tours/${tour.id}`} className={styles.tourRow}>
                          <span className={styles.tourMain}>
                            <strong>{tour.name}</strong>
                            <span>{range || 'Dates TBD'}</span>
                          </span>
                          <span className={styles.tourFill}>
                            <span>{active.length === 0 ? 'No shows yet' : `${booked.length} of ${active.length} booked`}</span>
                            <span className="tour-meter" aria-hidden="true"><span className="tour-meter-bar" style={{ width: `${pct}%`, display: 'block' }} /></span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* ── Targets ───────────────────────────────────────────────────── */}
            <section className={styles.section} aria-labelledby="dash-targets">
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle} id="dash-targets">Targets</h2>
                <Link href="/email?tab=outreach&status=target" className={styles.viewAll}>Outreach →</Link>
              </header>
              {loading ? <div className={`tour-skeleton ${styles.skeletonRow}`} /> : targets.length === 0 ? (
                <div className={styles.empty}>
                  <span>No targets yet — add venues to a tour to start pitching.</span>
                  <Link href="/venues" className="btn btn-secondary btn-sm">Find venues</Link>
                </div>
              ) : (
                <ul className={styles.targetCloud}>
                  {targets.map(t => (
                    <li key={t.id}>
                      <Link href={t.venue?.id ? `/venues/${t.venue.id}` : '/email?tab=outreach&status=target'} className={styles.targetChip}>
                        <strong>{t.venue?.name ?? 'Venue'}</strong>
                        <span>{[t.venue?.city, t.venue?.state].filter((x): x is string => x != null).join(', ')}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* ── AI Booking Agent — single column on mobile, two columns ≥768px (see .dash-agent CSS) ── */}
          <div className="dash-agent">

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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
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
                chip.href ? (
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
                  placeholder={attachedFile ? 'Add a message or just hit send…' : `Ask about ${myAct?.act_name || 'your pipeline'}, or attach a show list…`}
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

          {/* ── Shortcuts ────────────────────────────────────────────────── */}
          <nav className={styles.tiles} aria-label="Shortcuts">
            {dashTiles.map(tile => (
              <Link key={tile.label} href={tile.href} className={styles.tile} style={{ '--tile-accent': tile.accent } as React.CSSProperties}>
                <span className={styles.tileIcon} aria-hidden="true">{tile.icon}</span>
                <span className={styles.tileLabel}>{tile.label}</span>
                <span className={styles.tileSub}>{tile.sub}</span>
                <span className={styles.tileGo} aria-hidden="true">Open →</span>
              </Link>
            ))}
          </nav>
        </>
      )}
    </AppShell>
  );
}
