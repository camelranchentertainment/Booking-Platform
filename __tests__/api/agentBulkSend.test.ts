// __tests__/api/agentBulkSend.test.ts
// Regression: the agent's bulk outreach (17 Lone Star pitches) went out
// through Resend directly — not from the band's Gmail — and never counted as
// pitched. Every email must now go through sendActEmail (Gmail when
// connected), logged against the tour target, with the venue taken from the
// database rather than the request.

jest.mock('../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../lib/emailSend', () => ({ sendActEmail: jest.fn().mockResolvedValue({ email_log_id: 'log-1' }) }));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }) },
  }),
}));

import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/agent-bulk-send';
import { getServiceClient } from '../../lib/supabase';
import { sendActEmail } from '../../lib/emailSend';
import { GMAIL_RECONNECT_MESSAGE, GmailReconnectError } from '../../lib/gmailAuthError';

const ACT = '5a5bbd78-b7e5-47c5-8a9a-d4ca5c454256';
const TOUR = '8b2fdd9a-9c98-4833-914b-b4d1af1c710e';
const TV1 = '11111111-1111-4111-8111-111111111111';
const TV2 = '22222222-2222-4222-8222-222222222222';
const V1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const V2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

interface World {
  role?: string;
  tourVenues?: Array<{ id: string; tour_id: string; venue_id: string }>;
  ownedVenueIds?: string[];
  /** tour_venue_id of each email already sent (one entry per email). */
  priorEmails?: string[];
}

function setup(world: World = {}) {
  const { role = 'band_admin', tourVenues = [], ownedVenueIds = [], priorEmails = [] } = world;
  const notifications: unknown[] = [];
  const from = jest.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const c: Record<string, any> = {};
    c.select = () => c;
    c.eq = (col: string, v: unknown) => ((filters[col] = v), c);
    c.in = (col: string, v: unknown) => ((filters[`in:${col}`] = v), c);
    c.or = () => c;
    c.single = () => Promise.resolve({ data: table === 'profiles' ? { act_id: ACT, role } : null, error: null });
    c.maybeSingle = () => Promise.resolve({ data: table === 'tours' && filters.id === TOUR && filters.act_id === ACT ? { id: TOUR } : null, error: null });
    c.then = (ok: (v: unknown) => unknown) => {
      let data: unknown = [];
      if (table === 'tour_venues') data = tourVenues.filter(tv => (filters['in:id'] as string[]).includes(tv.id));
      if (table === 'venues') data = ((filters['in:id'] as string[]) ?? []).filter(id => ownedVenueIds.includes(id) && filters.act_id === ACT).map(id => ({ id }));
      if (table === 'email_log') data = priorEmails.filter(id => (filters['in:tour_venue_id'] as string[]).includes(id)).map(id => ({ tour_venue_id: id }));
      return Promise.resolve({ data, error: null }).then(ok);
    };
    c.insert = (row: unknown) => {
      if (table === 'notifications') notifications.push(row);
      return Promise.resolve({ error: null });
    };
    return c;
  });
  (getServiceClient as jest.Mock).mockReturnValue({ from });
  return { notifications };
}

async function send(body: Record<string, unknown>) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'POST', headers: { authorization: 'Bearer t' }, body });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: JSON.parse(res._getData() || '{}') };
}

const base = { subject: 'Booking - {venue_name}', body: 'Hi {contact_name},\n\nPitching {venue_name}.', actId: ACT, tourId: TOUR };

describe('/api/agent-bulk-send', () => {
  beforeEach(() => jest.clearAllMocks());

  it('logs a follow-up as Follow up 1 or 2 from how many emails the venue already got', async () => {
    setup({
      tourVenues: [{ id: TV1, tour_id: TOUR, venue_id: V1 }, { id: TV2, tour_id: TOUR, venue_id: V2 }],
      priorEmails: [TV1, TV2, TV2],
    });
    const r = await send({
      ...base,
      venues: [
        { tourVenueId: TV1, name: 'Dirty Water Saloon', email: 'book@dirtywater.com' },
        { tourVenueId: TV2, name: 'Rhinestone Saloon', email: 'hello@rhinestone.com' },
      ],
    });
    expect(r.status).toBe(200);
    const categories = (sendActEmail as jest.Mock).mock.calls.map(([args]) => [args.tourVenueId, args.category]);
    expect(categories).toEqual([[TV1, 'follow_up_1'], [TV2, 'follow_up_2']]);
  });

  it('sends each pitch through sendActEmail against the tour target, with the venue from the database', async () => {
    const { notifications } = setup({ tourVenues: [{ id: TV1, tour_id: TOUR, venue_id: V1 }, { id: TV2, tour_id: TOUR, venue_id: V2 }] });
    const r = await send({
      ...base,
      venues: [
        { tourVenueId: TV1, venueId: OTHER, name: 'Dirty Water Saloon', email: 'book@dirtywater.com', contactName: 'Sam' },
        { tourVenueId: TV2, name: 'Rhinestone Saloon', email: 'hello@rhinestone.com' },
      ],
    });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sent: 2, noEmail: 0, errors: 0 });
    expect(sendActEmail).toHaveBeenCalledTimes(2);
    expect((sendActEmail as jest.Mock).mock.calls[0][0]).toMatchObject({
      actId: ACT,
      sentBy: 'u-1',
      recipient: 'book@dirtywater.com',
      subject: 'Booking - Dirty Water Saloon',
      body: 'Hi Sam,\n\nPitching Dirty Water Saloon.',
      venueId: V1, // not the OTHER id the request claimed
      tourVenueId: TV1,
      category: 'target',
      notify: false,
    });
    expect((sendActEmail as jest.Mock).mock.calls[1][0].body).toContain('Hi Booking Manager');
    expect(notifications).toHaveLength(1);
  });

  it('refuses a target that is not on the tour, sending nothing', async () => {
    setup({ tourVenues: [{ id: TV1, tour_id: 'some-other-tour', venue_id: V1 }] });
    const r = await send({ ...base, venues: [{ tourVenueId: TV1, name: 'X', email: 'x@y.com' }] });
    expect(r.status).toBe(403);
    expect(sendActEmail).not.toHaveBeenCalled();
  });

  it("refuses a directly named venue that isn't the band's", async () => {
    setup({ ownedVenueIds: [V1] });
    const r = await send({ ...base, tourId: null, venues: [{ venueId: V1, name: 'Mine', email: 'a@b.com' }, { venueId: OTHER, name: 'Theirs', email: 'c@d.com' }] });
    expect(r.status).toBe(403);
    expect(sendActEmail).not.toHaveBeenCalled();
  });

  it('refuses a body actId that is not the caller’s band', async () => {
    setup();
    const r = await send({ ...base, actId: OTHER, venues: [{ name: 'X', email: 'x@y.com' }] });
    expect(r.status).toBe(403);
  });

  it('skips venues without a usable email and reports per-venue failures', async () => {
    setup({ tourVenues: [{ id: TV1, tour_id: TOUR, venue_id: V1 }, { id: TV2, tour_id: TOUR, venue_id: V2 }] });
    (sendActEmail as jest.Mock).mockRejectedValueOnce(new Error('Gmail token expired'));
    const r = await send({
      ...base,
      venues: [
        { tourVenueId: TV1, name: 'A', email: 'a@a.com' },
        { tourVenueId: TV2, name: 'B', email: 'not-an-email' },
      ],
    });
    expect(r.body).toMatchObject({ sent: 0, noEmail: 1, errors: 1 });
    expect(r.body.results[0]).toMatchObject({ venue: 'A', status: 'error', error: 'Gmail token expired' });
  });

  it('stops and says so when email is not configured at all', async () => {
    setup({ tourVenues: [{ id: TV1, tour_id: TOUR, venue_id: V1 }, { id: TV2, tour_id: TOUR, venue_id: V2 }] });
    (sendActEmail as jest.Mock).mockRejectedValueOnce(new Error('Email not configured. Connect Gmail or add a Resend API key in Settings.'));
    const r = await send({ ...base, venues: [{ tourVenueId: TV1, name: 'A', email: 'a@a.com' }, { tourVenueId: TV2, name: 'B', email: 'b@b.com' }] });
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/not configured/);
    expect(sendActEmail).toHaveBeenCalledTimes(1);
  });

  it('stops after the first send when the Gmail connection has expired (Lone Star, Oct 26)', async () => {
    setup({ tourVenues: [{ id: TV1, tour_id: TOUR, venue_id: V1 }, { id: TV2, tour_id: TOUR, venue_id: V2 }] });
    (sendActEmail as jest.Mock).mockRejectedValueOnce(new GmailReconnectError(new Error('invalid_grant')));
    const r = await send({ ...base, venues: [{ tourVenueId: TV1, name: 'A', email: 'a@a.com' }, { tourVenueId: TV2, name: 'B', email: 'b@b.com' }] });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: GMAIL_RECONNECT_MESSAGE, code: 'GMAIL_RECONNECT' });
    expect(sendActEmail).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty or oversized batch with 400', async () => {
    setup();
    expect((await send({ ...base, venues: [] })).status).toBe(400);
    expect((await send({ ...base, venues: Array.from({ length: 101 }, (_, i) => ({ name: `V${i}`, email: 'a@b.com' })) })).status).toBe(400);
  });
});
