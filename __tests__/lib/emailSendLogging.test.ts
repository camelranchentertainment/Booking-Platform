// __tests__/lib/emailSendLogging.test.ts
// sendActEmail must never report failure for an email that already went out:
// bad record links are dropped before sending, and a log-insert failure after
// sending is recorded instead of thrown (Oct 27 2026 Dan's SilverLeaf incident).

jest.mock('resend', () => ({ Resend: jest.fn() }));
jest.mock('../../lib/gmailSend', () => ({ sendViaGmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../lib/supabase', () => ({ getServiceClient: jest.fn() }));

import { sendActEmail } from '../../lib/emailSend';
import { getServiceClient } from '../../lib/supabase';
import { sendViaGmail } from '../../lib/gmailSend';

const BOOKING = '9deff02b-188a-4c65-b83e-1ac1feaeb949';
const VENUE = '6dc97e81-5cb0-42fc-8b0d-c1f7f6214e2d';

function setup({ bookingExists, logInsertError }: { bookingExists: boolean; logInsertError?: { code: string; message: string } }) {
  const inserts: Array<{ table: string; row: Record<string, any> }> = [];
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const from = jest.fn((table: string) => {
    let update: Record<string, unknown> | null = null;
    const c: Record<string, any> = {};
    c.select = () => c;
    c.in = () => c;
    c.eq = () => c;
    c.is = () => c;
    c.update = (v: Record<string, unknown>) => ((update = v), c);
    c.insert = (row: Record<string, unknown>) => {
      inserts.push({ table, row });
      const after: Record<string, any> = {
        select: () => after,
        single: () => Promise.resolve(table === 'email_log' && logInsertError
          ? { data: null, error: logInsertError }
          : { data: { id: 'log-1' }, error: null }),
      };
      after.then = (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok);
      return after;
    };
    c.single = () => Promise.resolve({
      data: table === 'acts' ? { act_name: 'Jake Stringer', contact_email: null, gmail_address: 'scott@gmail.com' } : { name: "Dan's SilverLeaf" },
      error: null,
    });
    c.maybeSingle = () => {
      if (table === 'act_credentials') return Promise.resolve({ data: { google_refresh_token: 'tok' }, error: null });
      if (table === 'bookings') return Promise.resolve({ data: bookingExists ? { id: BOOKING } : null, error: null });
      if (table === 'venues') return Promise.resolve({ data: { id: VENUE }, error: null });
      return Promise.resolve({ data: { email: 'jake@camelranchbooking.com' }, error: null });
    };
    c.then = (ok: (v: unknown) => unknown) => {
      if (update) updates.push({ table, values: update });
      return Promise.resolve({ error: null }).then(ok);
    };
    return c;
  });
  (getServiceClient as jest.Mock).mockReturnValue({ from });
  return { inserts, updates };
}

const params = {
  actId: 'act-1', sentBy: 'u-1', recipient: 'Booking@danssilverleaf.com',
  subject: 'Following Up', body: 'Hello', venueId: VENUE, bookingId: BOOKING, category: 'follow_up_1',
};

describe('sendActEmail logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("sends and logs without a booking link when the booking id isn't the band's", async () => {
    const { inserts, updates } = setup({ bookingExists: false });
    await expect(sendActEmail(params)).resolves.toEqual({ email_log_id: 'log-1' });
    expect(sendViaGmail).toHaveBeenCalledTimes(1);
    const log = inserts.find(i => i.table === 'email_log')!.row;
    expect(log.booking_id).toBeNull();
    expect(log.venue_id).toBe(VENUE);
    expect(updates.some(u => u.table === 'bookings')).toBe(false);
  });

  it('keeps a real booking link', async () => {
    const { inserts } = setup({ bookingExists: true });
    await sendActEmail(params);
    expect(inserts.find(i => i.table === 'email_log')!.row.booking_id).toBe(BOOKING);
  });

  it('does not throw when the log insert fails after the email was sent', async () => {
    setup({ bookingExists: true, logInsertError: { code: '23503', message: 'violates foreign key constraint' } });
    await expect(sendActEmail(params)).resolves.toEqual({ email_log_id: null });
    expect(sendViaGmail).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('[emailSend] email SENT but email_log insert failed', expect.objectContaining({ code: '23503' }));
  });
});
