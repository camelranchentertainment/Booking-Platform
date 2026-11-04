import { META_PIXEL_ID, installPixelQueue, isTrackedPath, type PixelWindow } from '../../lib/metaPixel';

describe('isTrackedPath', () => {
  it.each(['/', '/register', '/booking-agents'])('allows the public page %s', (path) => {
    expect(isTrackedPath(path)).toBe(true);
  });

  it.each([
    '/band', '/band/agent', '/bookings', '/venues', '/email', '/financials', '/settings',
    '/member', '/agent', '/admin', '/login', '/join', '/reset-password', '/pricing', '/privacy',
  ])('never tracks %s', (path) => {
    expect(isTrackedPath(path)).toBe(false);
  });
});

describe('installPixelQueue', () => {
  it('turns off automatic collection before initialising', () => {
    const win: PixelWindow = {};
    expect(installPixelQueue(win)).toBe(true);
    expect(win.fbq?.disablePushState).toBe(true);
    expect(win.fbq?.queue).toEqual([
      ['set', 'autoConfig', false, META_PIXEL_ID],
      ['init', META_PIXEL_ID],
    ]);
  });

  it('does not initialise twice', () => {
    const win: PixelWindow = {};
    installPixelQueue(win);
    expect(installPixelQueue(win)).toBe(false);
    expect(win.fbq?.queue).toHaveLength(2);
  });
});
