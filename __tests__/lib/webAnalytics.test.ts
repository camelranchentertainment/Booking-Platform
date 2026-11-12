import {
  installAnalyticsQueue,
  isPublicPath,
  redactEvent,
  type AnalyticsWindow,
} from '../../lib/webAnalytics';

const SITE = 'https://camelranchbooking.com';

describe('isPublicPath', () => {
  it.each(['/', '/register', '/join', '/pricing', '/booking-agents', '/login', '/privacy', '/help', '/pricing/'])(
    'allows the public page %s',
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each([
    '/band', '/band/agent', '/bookings', '/venues', '/email', '/financials', '/settings',
    '/member', '/agent', '/admin', '/today', '/tours/123', '/reset-password', '/delete-account',
  ])('never reports %s', (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});

describe('redactEvent', () => {
  it('drops events from signed-in pages', () => {
    expect(redactEvent({ type: 'pageview', url: `${SITE}/band?x=1` })).toBeNull();
  });

  it('drops events whose URL cannot be parsed', () => {
    expect(redactEvent({ type: 'pageview', url: 'not a url' })).toBeNull();
  });

  it('keeps utm tags and removes every other parameter and the hash', () => {
    const out = redactEvent({
      type: 'pageview',
      url: `${SITE}/join?token=SECRET-CODE&utm_source=facebook&UTM_Campaign=beta&email=a@b.com#top`,
    });
    expect(out).not.toBeNull();
    const url = new URL(out!.url);
    expect(url.pathname).toBe('/join');
    expect(url.searchParams.get('token')).toBeNull();
    expect(url.searchParams.get('email')).toBeNull();
    expect(url.searchParams.get('utm_source')).toBe('facebook');
    expect(url.searchParams.get('UTM_Campaign')).toBe('beta');
    expect(url.hash).toBe('');
  });

  it('passes a plain public page through unchanged apart from normalisation', () => {
    expect(redactEvent({ type: 'pageview', url: `${SITE}/` })).toEqual({ type: 'pageview', url: `${SITE}/` });
  });
});

describe('installAnalyticsQueue', () => {
  it('registers the redaction filter before anything else', () => {
    const win: AnalyticsWindow = {};
    expect(installAnalyticsQueue(win)).toBe(true);
    expect(win.vaq).toEqual([['beforeSend', redactEvent]]);
  });

  it('does not install twice', () => {
    const win: AnalyticsWindow = {};
    installAnalyticsQueue(win);
    expect(installAnalyticsQueue(win)).toBe(false);
    expect(win.vaq).toHaveLength(1);
  });
});
