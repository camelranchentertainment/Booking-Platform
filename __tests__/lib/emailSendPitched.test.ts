// __tests__/lib/emailSendPitched.test.ts
// sendActEmail: sends from the band's Gmail when connected, and the first
// email to a tour target marks it pitched without touching its status.

jest.mock('resend', () => {
  const send = jest.fn().mockResolvedValue({ data: { id: 'resend-1' }, error: null });
  return { Resend: jest.fn().mockImplementation(() => ({ emails: { send } })), __send: send };
});
jest.mock('../../lib/gmailSend', () => ({ sendViaGmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../lib/supabase', () => ({ getServiceClient: jest.fn() }));

import { sendActEmail } from '../../lib/emailSend';
import { getServiceClient } from '../../lib/supabase';
import { sendViaGmail } from '../../lib/gmailSend';

type Update = { table: string; values: Record<string, unknown>; filters: Array<[string, string, unknown]> };

function setup({ gmail }: { gmail: boolean }) {
  const updates: Update[] = [];
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const from = jest.fn((table: string) => {
    const filters: Array<[string, string, unknown]> = [];
    let update: Record<string, unknown> | null = null;
    const c: Record<string, any> = {};
    c.select = () => c;
    c.in = () => c;
    c.eq = (col: string, v: unknown) => (filters.push(['eq', col, v]), c);
    c.is = (col: string, v: unknown) => (filters.push(['is', col, v]), c);
    c.update = (v: Record<string, unknown>) => ((update = v), c);
    c.insert = (row: Record<string, unknown>) => {
      inserts.push({ table, row });
      const after: Record<string, any> = { select: () => after, single: () => Promise.resolve({ data: { id: 'log-1' }, error: null }) };
      after.then = (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok);
      return after;
    };
    c.single = () =>
      Promise.resolve({
        data: table === 'acts' ? { act_name: 'Jake Stringer', contact_email: null, gmail_address: gmail ? 'jake@gmail.com' : null } : table === 'tour_venues' ? { tour_id: 't-1', venue: { name: 'Pond' } } : { name: 'Pond' },
        error: null,
      });
    c.maybeSingle = () => Promise.resolve({ data: table === 'act_credentials' ? { google_refresh_token: gmail ? 'tok' : null } : { email: 'jake@camelranchbooking.com' }, error: null });
    c.then = (ok: (v: unknown) => unknown) => {
      if (update) updates.push({ table, values: update, filters });
      return Promise.resolve({ error: null }).then(ok);
    };
    return c;
  });
  (getServiceClient as jest.Mock).mockReturnValue({ from });
  return { updates, inserts };
}

// Real-shaped ids: sendActEmail drops links that aren't UUIDs of the band's records.
const TV = '5b1d7c2e-0000-4000-8000-0000000000a1';
const VENUE = '5b1d7c2e-0000-4000-8000-0000000000b2';
const params = { actId: 'act-1', sentBy: 'u-1', recipient: 'book@pond.com', subject: 'Booking', body: 'Hi', tourVenueId: TV, venueId: VENUE, category: 'target' };

describe('sendActEmail', () => {
  const OLD_ENV = process.env.RESEND_API_KEY;
  beforeAll(() => {
    process.env.RESEND_API_KEY = 'test-key';
  });
  afterAll(() => {
    process.env.RESEND_API_KEY = OLD_ENV;
  });
  beforeEach(() => jest.clearAllMocks());

  it("sends from the band's Gmail when it is connected", async () => {
    setup({ gmail: true });
    await sendActEmail(params);
    // Sixth argument: the received email being answered; none for a new email.
    expect(sendViaGmail).toHaveBeenCalledWith('act-1', 'book@pond.com', 'Booking', expect.any(String), [], undefined);
    expect((jest.requireMock('resend') as { __send: jest.Mock }).__send).not.toHaveBeenCalled();
  });

  it('marks the tour target pitched only if it was not already, and never changes its status', async () => {
    const { updates } = setup({ gmail: false });
    await sendActEmail(params);
    const tv = updates.filter(u => u.table === 'tour_venues');
    const pitched = tv.find(u => 'pitched_at' in u.values);
    expect(pitched?.filters).toEqual(expect.arrayContaining([['eq', 'id', TV], ['is', 'pitched_at', null]]));
    expect(tv.some(u => 'last_contacted_at' in u.values)).toBe(true);
    expect(tv.every(u => !('status' in u.values))).toBe(true);
  });

  it('skips the per-email notification when notify is false', async () => {
    const { inserts } = setup({ gmail: false });
    await sendActEmail({ ...params, notify: false });
    expect(inserts.some(i => i.table === 'notifications')).toBe(false);
    expect(inserts.some(i => i.table === 'email_log')).toBe(true);
  });
});
