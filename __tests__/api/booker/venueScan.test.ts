// __tests__/api/booker/venueScan.test.ts
// The scan route uses the service role, so it must enforce ownership itself.

jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../../lib/server/venueSiteScan', () => ({ scanVenueSite: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../../pages/api/booker/venues/scan';
import { getServiceClient } from '../../../lib/supabase';
import { scanVenueSite } from '../../../lib/server/venueSiteScan';

const VENUE_ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';

type Row = Record<string, unknown> | null;

/** Minimal PostgREST-like chain; records filters so tests can assert scoping. */
function chain(result: { data: unknown; error: unknown }, filters: Array<[string, unknown]>) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'is', 'update', 'insert', 'limit']) c[m] = () => c;
  c.eq = (col: string, val: unknown) => {
    filters.push([col, val]);
    return c;
  };
  c.maybeSingle = () => Promise.resolve(result);
  c.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => Promise.resolve(result).then(f, r);
  return c;
}

function setup({ booker = { id: 'bk-1' } as Row, venue = null as Row, contacts = [] as unknown[] } = {}) {
  const venueFilters: Array<[string, unknown]> = [];
  const inserts: unknown[] = [];
  const client = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }) },
    from: jest.fn((table: string) => {
      if (table === 'booker_profiles') return chain({ data: booker, error: null }, []);
      if (table === 'booker_venues') return chain({ data: venue, error: null }, venueFilters);
      if (table === 'booker_contacts') {
        const c = chain({ data: contacts, error: null }, []);
        c.insert = (row: unknown) => {
          inserts.push(row);
          return Promise.resolve({ error: null });
        };
        return c;
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
  (getServiceClient as jest.Mock).mockReturnValue(client);
  return { venueFilters, inserts };
}

function call(body: Record<string, unknown> = { venueId: VENUE_ID }) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const req = { method: 'POST', body, headers: { authorization: 'Bearer tok' } } as unknown as NextApiRequest;
  const res = { status, json, setHeader: jest.fn() } as unknown as NextApiResponse;
  return { run: () => handler(req, res), status, json };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /api/booker/venues/scan', () => {
  it('refuses a caller with no agent workspace', async () => {
    setup({ booker: null });
    const { run, status } = call();
    await run();
    expect(status).toHaveBeenCalledWith(403);
    expect(scanVenueSite).not.toHaveBeenCalled();
  });

  it("returns 404 for a venue that isn't the caller's, and scopes the lookup to the caller", async () => {
    const { venueFilters } = setup({ venue: null });
    const { run, status } = call();
    await run();
    expect(status).toHaveBeenCalledWith(404);
    expect(venueFilters).toEqual(expect.arrayContaining([['id', VENUE_ID], ['booker_id', 'bk-1']]));
    expect(scanVenueSite).not.toHaveBeenCalled();
  });

  it('asks for a website first', async () => {
    setup({ venue: { id: VENUE_ID, website: null, email: null, phone: null, capacity: null, notes: null, last_scanned_at: null } });
    const { run, status } = call();
    await run();
    expect(status).toHaveBeenCalledWith(400);
  });

  it('refuses a second scan within a minute', async () => {
    setup({ venue: { id: VENUE_ID, website: 'https://hall.com', email: null, phone: null, capacity: null, notes: null, last_scanned_at: new Date().toISOString() } });
    const { run, status } = call();
    await run();
    expect(status).toHaveBeenCalledWith(429);
    expect(scanVenueSite).not.toHaveBeenCalled();
  });

  it('adds the named booker as a private website contact', async () => {
    const { inserts } = setup({ venue: { id: VENUE_ID, website: 'https://hall.com', email: null, phone: null, capacity: null, notes: null, last_scanned_at: null } });
    (scanVenueSite as jest.Mock).mockResolvedValue({
      pagesScanned: 2,
      extracted: { booking_email: 'book@hall.com', general_email: null, booking_phone: null, booking_contact_name: 'Sarah Lee', booking_contact_title: null, venue_name: null, capacity: null, notes: null },
    });
    const { run, status, json } = call();
    await run();
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0]).toMatchObject({ filled: ['email'], contactAdded: true, pagesScanned: 2 });
    expect(inserts[0]).toMatchObject({ booker_id: 'bk-1', venue_id: VENUE_ID, name: 'Sarah Lee', source: 'website', share_with_bands: false });
  });

  it('rejects a malformed venue id', async () => {
    setup();
    const { run, status } = call({ venueId: 'nope' });
    await run();
    expect(status).toHaveBeenCalledWith(400);
  });
});
