// lib/agent/agentWindow.ts
//
// The booking agent can be popped out of the band dashboard into its own
// browser window (/band/agent), which the user can drag anywhere — another
// monitor, beside the email tab — while they keep working on the site.
//
// The dashboard and the pop-out talk over a BroadcastChannel so that:
//   - only one place runs the live chat at a time (both save today's
//     conversation to the same row, so two live copies would overwrite each
//     other) — the dashboard shows a placeholder while the pop-out is open;
//   - changes the agent saves (new shows, sent outreach) refresh the
//     dashboard's counts;
//   - the dashboard can ask the pop-out to come to the front or dock back.
//
// Everything here is plain functions over injected window/channel objects so
// it can be unit-tested in Node.

/** Route of the pop-out window. Kept under /band: the agent's write powers live only on /band. */
export const AGENT_POPOUT_PATH = '/band/agent';

/** Window name — opening it again reuses the same window instead of stacking new ones. */
export const AGENT_POPOUT_WINDOW_NAME = 'crb-booking-agent';

/** BroadcastChannel name shared by every same-origin tab and the pop-out. */
export const AGENT_CHANNEL_NAME = 'crb-booking-agent';

/** Initial size of the pop-out; the user can resize and move it freely. */
export const AGENT_POPOUT_FEATURES = 'popup=yes,width=460,height=760';

export type AgentWindowMessage =
  /** Sent by the pop-out when it loads, and in reply to a ping. */
  | { type: 'popout-opened' }
  /** Sent by the pop-out as it closes or docks. */
  | { type: 'popout-closed' }
  /** Sent by a dashboard on load to learn whether a pop-out is already open. */
  | { type: 'ping' }
  /** Dashboard → pop-out: come to the front. */
  | { type: 'focus' }
  /** Dashboard → pop-out: close and hand the chat back to the dashboard. */
  | { type: 'dock' }
  /** The agent saved or sent something; pages showing band data should reload. */
  | { type: 'data-changed' };

const MESSAGE_TYPES: ReadonlySet<string> = new Set<AgentWindowMessage['type']>([
  'popout-opened', 'popout-closed', 'ping', 'focus', 'dock', 'data-changed',
]);

/** Narrows an unknown BroadcastChannel payload to an agent window message. */
export function isAgentWindowMessage(value: unknown): value is AgentWindowMessage {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && MESSAGE_TYPES.has(type);
}

/** The slice of BroadcastChannel this module uses. */
export interface AgentChannel {
  postMessage(message: AgentWindowMessage): void;
  close(): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

/**
 * Opens the agent channel, or returns null where BroadcastChannel is missing
 * (very old browsers). Without it the pop-out still works; the dashboard just
 * can't tell it is open, so both may show the chat.
 */
export function openAgentChannel(
  // Injected for tests; null stands for "this browser has no BroadcastChannel".
  Channel: (new (name: string) => AgentChannel) | null =
    typeof BroadcastChannel === 'undefined' ? null : BroadcastChannel,
): AgentChannel | null {
  if (!Channel) return null;
  try {
    return new Channel(AGENT_CHANNEL_NAME);
  } catch (err) {
    console.warn('[agentWindow] BroadcastChannel unavailable', err);
    return null;
  }
}

/** Posts a message, ignoring a channel that has already been closed. */
export function postAgentMessage(channel: AgentChannel | null, message: AgentWindowMessage): void {
  if (!channel) return;
  try {
    channel.postMessage(message);
  } catch (err) {
    // InvalidStateError after close() during unmount — nothing to deliver to.
    console.warn('[agentWindow] postMessage failed', err);
  }
}

/** The slice of `window` needed to open the pop-out. */
export interface PopoutOpener {
  open(url: string, target: string, features: string): Window | null;
}

/**
 * Opens (or re-uses) the pop-out window. Returns null when the browser blocked
 * it, so the caller can tell the user to allow pop-ups.
 */
export function openAgentPopout(win: PopoutOpener): Window | null {
  const popout = win.open(AGENT_POPOUT_PATH, AGENT_POPOUT_WINDOW_NAME, AGENT_POPOUT_FEATURES);
  if (popout) {
    try { popout.focus(); } catch { /* some browsers refuse focus; the window is still open */ }
  }
  return popout;
}

/** The slice of `window` needed to send a link back to the main window. */
export interface LinkWindow {
  opener: { closed: boolean; location: { assign(url: string): void }; focus(): void } | null;
  open(url: string, target: string): unknown;
}

/**
 * Follows a link from inside the pop-out. The pop-out is a narrow side window,
 * so app pages open in the main window (the one that popped it out) when it is
 * still there; otherwise in a new tab. Only same-site paths are accepted.
 *
 * @returns where the link went, for tests and logging.
 */
export function openInMainWindow(win: LinkWindow, href: string): 'opener' | 'new-tab' | 'rejected' {
  // Same-site relative paths only ("/tours", not "//evil.example" or "https://…").
  if (!href.startsWith('/') || href.startsWith('//')) return 'rejected';
  const opener = win.opener;
  if (opener && !opener.closed) {
    try {
      opener.location.assign(href);
      opener.focus();
      return 'opener';
    } catch (err) {
      // The main window navigated off-site (cross-origin) — fall through to a new tab.
      console.warn('[agentWindow] could not use the main window', err);
    }
  }
  win.open(href, '_blank');
  return 'new-tab';
}
