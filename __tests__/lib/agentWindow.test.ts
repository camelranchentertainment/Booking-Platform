import {
  AGENT_CHANNEL_NAME,
  AGENT_POPOUT_FEATURES,
  AGENT_POPOUT_PATH,
  AGENT_POPOUT_WINDOW_NAME,
  isAgentWindowMessage,
  openAgentChannel,
  openAgentPopout,
  openInMainWindow,
  postAgentMessage,
  type AgentChannel,
  type LinkWindow,
} from '../../lib/agent/agentWindow';

describe('isAgentWindowMessage', () => {
  it('accepts every known message type', () => {
    for (const type of ['popout-opened', 'popout-closed', 'ping', 'focus', 'dock', 'data-changed']) {
      expect(isAgentWindowMessage({ type })).toBe(true);
    }
  });

  it('rejects anything else on the channel', () => {
    expect(isAgentWindowMessage(null)).toBe(false);
    expect(isAgentWindowMessage('ping')).toBe(false);
    expect(isAgentWindowMessage({})).toBe(false);
    expect(isAgentWindowMessage({ type: 'navigate', href: '/x' })).toBe(false);
    expect(isAgentWindowMessage({ type: 42 })).toBe(false);
  });
});

describe('the pop-out stays a /band route', () => {
  it('opens /band/agent (agent write powers live only on /band)', () => {
    expect(AGENT_POPOUT_PATH.startsWith('/band/')).toBe(true);
  });
});

describe('openAgentChannel / postAgentMessage', () => {
  class FakeChannel implements AgentChannel {
    static names: string[] = [];
    sent: unknown[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor(name: string) { FakeChannel.names.push(name); }
    postMessage(message: unknown) { this.sent.push(message); }
    close() { /* noop */ }
  }

  it('opens the shared channel by name', () => {
    const channel = openAgentChannel(FakeChannel);
    expect(channel).toBeInstanceOf(FakeChannel);
    expect(FakeChannel.names).toContain(AGENT_CHANNEL_NAME);
  });

  it('returns null where BroadcastChannel is missing', () => {
    expect(openAgentChannel(null)).toBeNull();
  });

  it('returns null when the constructor throws', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    class Broken { constructor() { throw new Error('nope'); } }
    expect(openAgentChannel(Broken as unknown as new (name: string) => AgentChannel)).toBeNull();
    warn.mockRestore();
  });

  it('posts, and ignores a missing or closed channel', () => {
    const channel = new FakeChannel('x');
    postAgentMessage(channel, { type: 'ping' });
    expect(channel.sent).toEqual([{ type: 'ping' }]);
    expect(() => postAgentMessage(null, { type: 'ping' })).not.toThrow();

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const closed = { postMessage: () => { throw new Error('InvalidStateError'); }, close() {}, onmessage: null };
    expect(() => postAgentMessage(closed, { type: 'popout-closed' })).not.toThrow();
    warn.mockRestore();
  });
});

describe('openAgentPopout', () => {
  it('opens the named pop-out window and focuses it', () => {
    const focus = jest.fn();
    const open = jest.fn().mockReturnValue({ focus });
    const win = openAgentPopout({ open });
    expect(open).toHaveBeenCalledWith(AGENT_POPOUT_PATH, AGENT_POPOUT_WINDOW_NAME, AGENT_POPOUT_FEATURES);
    expect(focus).toHaveBeenCalled();
    expect(win).not.toBeNull();
  });

  it('returns null when the browser blocks pop-ups', () => {
    expect(openAgentPopout({ open: () => null })).toBeNull();
  });
});

describe('openInMainWindow', () => {
  const makeWin = (opener: LinkWindow['opener']) => ({ opener, open: jest.fn() });

  it('sends app links to the main window and brings it forward', () => {
    const assign = jest.fn();
    const focus = jest.fn();
    const win = makeWin({ closed: false, location: { assign }, focus });
    expect(openInMainWindow(win, '/tours')).toBe('opener');
    expect(assign).toHaveBeenCalledWith('/tours');
    expect(focus).toHaveBeenCalled();
    expect(win.open).not.toHaveBeenCalled();
  });

  it('opens a new tab when the main window was closed', () => {
    const win = makeWin({ closed: true, location: { assign: jest.fn() }, focus: jest.fn() });
    expect(openInMainWindow(win, '/bookings?filter=confirmed')).toBe('new-tab');
    expect(win.open).toHaveBeenCalledWith('/bookings?filter=confirmed', '_blank');
  });

  it('opens a new tab when there is no main window', () => {
    const win = makeWin(null);
    expect(openInMainWindow(win, '/tours')).toBe('new-tab');
  });

  it('falls back to a new tab when the main window is on another site', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const win = makeWin({ closed: false, location: { assign: () => { throw new Error('SecurityError'); } }, focus: jest.fn() });
    expect(openInMainWindow(win, '/tours')).toBe('new-tab');
    warn.mockRestore();
  });

  it('refuses off-site and protocol-relative links', () => {
    const win = makeWin(null);
    expect(openInMainWindow(win, 'https://evil.example')).toBe('rejected');
    expect(openInMainWindow(win, '//evil.example/x')).toBe('rejected');
    expect(openInMainWindow(win, 'javascript:alert(1)')).toBe('rejected');
    expect(win.open).not.toHaveBeenCalled();
  });
});
