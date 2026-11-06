// __tests__/lib/stageEmail.test.ts
// execStageEmail: an agent email may only go to an address saved for the venue,
// and email addresses aren't case sensitive.

const mockDb = {
  venue: null as Record<string, unknown> | null,
  contacts: [] as Array<{ email: string | null; status: string | null }>,
  stagedInserts: [] as Array<Record<string, unknown>>,
  filters: [] as Array<[string, string, unknown]>,
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const c: Record<string, any> = {};
      c.select = () => c;
      c.eq = (col: string, v: unknown) => { mockDb.filters.push([table, col, v]); return c; };
      c.maybeSingle = () => Promise.resolve({ data: mockDb.venue, error: null });
      c.insert = (row: Record<string, unknown>) => { mockDb.stagedInserts.push(row); return c; };
      c.single = () => Promise.resolve({ data: { id: 'staged-1' }, error: null });
      c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: mockDb.contacts, error: null }).then(ok);
      return c;
    },
  }),
}));

import { execStageEmail } from '../../lib/aiAgentTools';

const VENUE = '6dc97e81-5cb0-42fc-8b0d-c1f7f6214e2d';
const send = (recipient: string) => execStageEmail('act-1', 'u-1', { venue_id: VENUE, recipient, subject: 'Hi', body: 'Hello' });

beforeEach(() => {
  mockDb.venue = { id: VENUE, name: "Dan's SilverLeaf", booking_contact: null, email: 'Booking@danssilverleaf.com', secondary_emails: ['Talent@danssilverleaf.com'] };
  mockDb.contacts = [{ email: 'Alexis@venue.com', status: null }, { email: 'gone@venue.com', status: 'do_not_contact' }];
  mockDb.stagedInserts = [];
  mockDb.filters = [];
});

describe('execStageEmail recipient check', () => {
  it('accepts a venue address saved with capitals, as the tool lowercases it', async () => {
    await expect(send('booking@danssilverleaf.com')).resolves.toMatchObject({ action_type: 'email_send' });
    expect(mockDb.stagedInserts).toHaveLength(1);
  });

  it("accepts the venue's other emails and saved contacts, read for this band", async () => {
    await expect(send('talent@danssilverleaf.com')).resolves.toBeTruthy();
    await expect(send('alexis@venue.com')).resolves.toBeTruthy();
    expect(mockDb.filters).toContainEqual(['contacts', 'act_id', 'act-1']);
    expect(mockDb.filters).toContainEqual(['contacts', 'venue_id', VENUE]);
  });

  it('refuses an address not saved, or a do-not-contact one, and stages nothing', async () => {
    await expect(send('stranger@elsewhere.com')).rejects.toThrow(/isn't saved/);
    await expect(send('gone@venue.com')).rejects.toThrow(/isn't saved/);
    expect(mockDb.stagedInserts).toHaveLength(0);
  });

  it('handles a venue with no email saved', async () => {
    mockDb.venue = { id: VENUE, name: 'Bare', booking_contact: null, email: null, secondary_emails: null };
    mockDb.contacts = [];
    await expect(send('a@b.com')).rejects.toThrow(/isn't saved/);
  });
});
