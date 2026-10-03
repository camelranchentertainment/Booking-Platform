// lib/inboxSync.ts
//
// Automatic Gmail inbox checking for Band Admins.
//
// Why a module-level store instead of React context:
//   Every page renders its own <AppShell>, so a provider inside AppShell would
//   (a) reset on every route change and (b) not be visible to the page component
//   that renders AppShell. A tiny external store read with useSyncExternalStore
//   survives navigation and is readable from anywhere.
//
// Behaviour:
//   - While a Band Admin / Superadmin with an act is logged in, the inbox is
//     checked every INBOX_AUTO_SYNC_INTERVAL_MS (2.5 min) — but only while the
//     tab is visible. Returning to a tab after the interval triggers an immediate check.
//   - Several open tabs share one schedule through localStorage, and the server
//     throttles per act, so tabs never stampede Gmail.
//   - Failures back off (2.5 → 5 → 10 → 15 min cap). "Gmail not connected" and
//     "not allowed" stop the timer until the next full page load.
//   - A fresh access token is read on every run (the old page cached one at load,
//     so the manual button failed with 401 once the token aged out).

import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

export const INBOX_AUTO_SYNC_INTERVAL_MS = 150_000;
export const INBOX_SYNCED_EVENT = 'crb:inbox-synced';

const MAX_BACKOFF_MS = 15 * 60_000;
const REQUEST_TIMEOUT_MS = 30_000;
/** Another tab that checked within this window counts as "we just checked". */
const SHARED_FRESHNESS_SLACK_MS = 5_000;
const SHARED_KEY_PREFIX = 'crb_inbox_last_sync:';
const LOG = '[inbox-sync]';

export type InboxSyncTrigger = 'auto' | 'manual';

export type InboxSyncStatus =
  | 'idle'          // healthy, waiting for next check
  | 'syncing'       // request in flight
  | 'error'         // last attempt failed; will retry with backoff
  | 'not_connected' // act has no Gmail connection; polling stopped
  | 'disabled';     // caller not allowed to sync; polling stopped

export interface InboxSyncState {
  status: InboxSyncStatus;
  /** Epoch ms of the last completed (or throttled) check, from this tab or the server. */
  lastCheckedAt: number | null;
  /** Epoch ms of the next scheduled automatic check, or null when stopped. */
  nextCheckAt: number | null;
  /** New messages imported by the most recent successful sync. */
  lastImported: number;
  /** Messages skipped by the most recent sync because the sender isn't a saved venue/contact. */
  lastUnmatched: number;
  errorMessage: string | null;
  consecutiveFailures: number;
}

/** Shape of a successful /api/email/gmail-sync response (both synced and throttled). */
export interface InboxSyncSuccessBody {
  ok: true;
  status: 'synced' | 'throttled';
  imported: number;
  skipped: number;
  unmatched: number;
  scanned: number;
  last_synced_at: string | null;
}

export interface InboxSyncErrorBody {
  error: { code: InboxSyncErrorCode; message: string };
}

export type InboxSyncErrorCode =
  | 'METHOD_NOT_ALLOWED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NO_ACT'
  | 'GMAIL_NOT_CONNECTED'
  | 'GMAIL_AUTH_FAILED'
  | 'SYNC_FAILED';

export interface InboxSyncedEventDetail {
  imported: number;
  unmatched: number;
  trigger: InboxSyncTrigger;
}

// ─── Store ───────────────────────────────────────────────────────────────────

const INITIAL_STATE: InboxSyncState = {
  status: 'idle',
  lastCheckedAt: null,
  nextCheckAt: null,
  lastImported: 0,
  lastUnmatched: 0,
  errorMessage: null,
  consecutiveFailures: 0,
};

let state: InboxSyncState = INITIAL_STATE;
const listeners = new Set<() => void>();

function setState(patch: Partial<InboxSyncState>): void {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getSnapshot = (): InboxSyncState => state;
const getServerSnapshot = (): InboxSyncState => INITIAL_STATE;

/** React hook: live auto-sync status for UI. */
export function useInboxSync(): InboxSyncState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ─── Engine ──────────────────────────────────────────────────────────────────

let activeActId: string | null = null;
let refCount = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;
let visibilityBound = false;

function sharedKey(actId: string): string {
  return `${SHARED_KEY_PREFIX}${actId}`;
}

/** localStorage can throw (private mode, blocked storage) — never let that break sync. */
function readShared(actId: string): number | null {
  try {
    const raw = window.localStorage.getItem(sharedKey(actId));
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeShared(actId: string, at: number): void {
  try {
    window.localStorage.setItem(sharedKey(actId), String(at));
  } catch {
    /* storage unavailable — server throttle still protects Gmail */
  }
}

function currentIntervalMs(): number {
  const factor = 2 ** Math.min(state.consecutiveFailures, 3);
  return Math.min(INBOX_AUTO_SYNC_INTERVAL_MS * factor, MAX_BACKOFF_MS);
}

function isStopped(): boolean {
  return refCount === 0 || !activeActId || state.status === 'not_connected' || state.status === 'disabled';
}

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function schedule(): void {
  clearTimer();
  if (isStopped() || !activeActId) {
    setState({ nextCheckAt: null });
    return;
  }
  const last = Math.max(state.lastCheckedAt ?? 0, readShared(activeActId) ?? 0);
  const dueAt = last + currentIntervalMs();
  const delay = Math.max(0, dueAt - Date.now());
  setState({ nextCheckAt: Date.now() + delay });
  timer = setTimeout(() => { void tick(); }, delay);
}

async function tick(): Promise<void> {
  timer = null;
  if (isStopped()) return;
  // Hidden tab: do nothing now; the visibilitychange handler resumes on return.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    setState({ nextCheckAt: null });
    return;
  }
  await runSync('auto');
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible' && !inFlight) schedule();
}

function bindVisibility(): void {
  if (visibilityBound || typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', onVisibilityChange);
  visibilityBound = true;
}

function unbindVisibility(): void {
  if (!visibilityBound || typeof document === 'undefined') return;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  visibilityBound = false;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function isSuccessBody(body: unknown): body is InboxSyncSuccessBody {
  return typeof body === 'object' && body !== null && (body as { ok?: unknown }).ok === true;
}

function errorFromBody(body: unknown): { code: string | null; message: string | null } {
  if (typeof body !== 'object' || body === null) return { code: null, message: null };
  const err = (body as { error?: unknown }).error;
  if (typeof err === 'string') return { code: null, message: err };
  if (typeof err === 'object' && err !== null) {
    const e = err as { code?: unknown; message?: unknown };
    return {
      code: typeof e.code === 'string' ? e.code : null,
      message: typeof e.message === 'string' ? e.message : null,
    };
  }
  return { code: null, message: null };
}

function recordFailure(message: string): void {
  setState({
    status: 'error',
    errorMessage: message,
    consecutiveFailures: state.consecutiveFailures + 1,
  });
}

async function performSync(actId: string, trigger: InboxSyncTrigger): Promise<void> {
  // Another tab (or a previous AppShell mount) checked very recently — skip auto runs.
  if (trigger === 'auto') {
    const shared = readShared(actId);
    if (shared && Date.now() - shared < INBOX_AUTO_SYNC_INTERVAL_MS - SHARED_FRESHNESS_SLACK_MS) {
      setState({ lastCheckedAt: Math.max(state.lastCheckedAt ?? 0, shared) });
      return;
    }
  }

  writeShared(actId, Date.now());
  setState({ status: 'syncing', errorMessage: null });

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    // Signed out mid-session; AppShell will redirect. Don't count as a failure.
    setState({ status: 'idle' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch('/api/email/gmail-sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger }),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    console.warn(LOG, 'request failed', { trigger, aborted });
    recordFailure(aborted ? 'Gmail took too long to respond. Will retry.' : 'Network problem reaching the server. Will retry.');
    return;
  } finally {
    clearTimeout(timeout);
  }

  const body = await safeJson(res);

  if (res.ok && isSuccessBody(body)) {
    const serverLast = body.last_synced_at ? Date.parse(body.last_synced_at) : NaN;
    const checkedAt = Number.isFinite(serverLast) ? serverLast : Date.now();
    writeShared(actId, checkedAt);

    if (body.status === 'throttled') {
      // Someone checked moments ago — that counts as a fresh check.
      setState({ status: 'idle', lastCheckedAt: checkedAt, consecutiveFailures: 0 });
      return;
    }

    setState({
      status: 'idle',
      lastCheckedAt: checkedAt,
      lastImported: body.imported,
      lastUnmatched: body.unmatched,
      consecutiveFailures: 0,
      errorMessage: null,
    });
    console.info(LOG, 'synced', { trigger, imported: body.imported, unmatched: body.unmatched, scanned: body.scanned });

    const detail: InboxSyncedEventDetail = { imported: body.imported, unmatched: body.unmatched, trigger };
    window.dispatchEvent(new CustomEvent<InboxSyncedEventDetail>(INBOX_SYNCED_EVENT, { detail }));
    return;
  }

  const { code, message } = errorFromBody(body);
  console.warn(LOG, 'sync rejected', { trigger, status: res.status, code });

  if (code === 'GMAIL_NOT_CONNECTED') {
    setState({ status: 'not_connected', errorMessage: null });
    return;
  }
  if (res.status === 403 || code === 'FORBIDDEN' || code === 'NO_ACT') {
    setState({ status: 'disabled', errorMessage: null });
    return;
  }
  if (code === 'GMAIL_AUTH_FAILED') {
    recordFailure('Gmail sign-in expired. Reconnect Gmail in Settings.');
    return;
  }
  recordFailure(message || 'Inbox check failed. Will retry.');
}

/**
 * Run one sync now. Concurrent calls share the in-flight request.
 * Manual runs skip the shared-tab freshness check (the server still allows
 * a manual check at most every 10 s).
 */
function runSync(trigger: InboxSyncTrigger): Promise<void> {
  if (inFlight) return inFlight;
  const actId = activeActId;
  if (!actId) return Promise.resolve();

  clearTimer();
  inFlight = performSync(actId, trigger)
    .catch(err => {
      console.error(LOG, 'unexpected failure', err);
      recordFailure('Inbox check failed. Will retry.');
    })
    .finally(() => {
      inFlight = null;
      schedule();
    });
  return inFlight;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Begin automatic inbox checks for an act. Call from AppShell's effect;
 * pair every call with stopInboxAutoSync() in the cleanup. Ref-counted, so
 * the unmount/mount pair on route changes doesn't double-schedule.
 */
export function startInboxAutoSync(actId: string): void {
  if (typeof window === 'undefined') return;
  if (activeActId !== actId) {
    // Different act (e.g. superadmin switched) — start clean.
    clearTimer();
    state = { ...INITIAL_STATE };
    listeners.forEach(l => l());
    activeActId = actId;
  }
  refCount += 1;
  bindVisibility();
  if (!inFlight) schedule();
}

export function stopInboxAutoSync(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0) {
    clearTimer();
    unbindVisibility();
    setState({ nextCheckAt: null });
  }
}

/** The "Check Gmail now" button. */
export function syncInboxNow(): Promise<void> {
  return runSync('manual');
}
