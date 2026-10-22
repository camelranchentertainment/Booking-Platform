// __tests__/api/booker/offerSend.test.ts
// The offer send and PDF routes run with the service role, so they must scope
// everything to the caller's agent profile, refuse answered offers, attach the
// PDF, and only mark an offer "sent" once Gmail accepted it.

jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../../lib/server/bookerGmail', () => ({ getBookerGmail: jest.fn(), sendViaBookerGmail: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import type { NextApiRequest, NextApiResponse } from 'next';
import sendHandler from '../../../pages/api/booker/offers/[id]/send';
import pdfHandler from '../../../pages/api/booker/offers/[id]/pdf';
import { getServiceClient } from '../../../lib/supabase';
import { getBookerGmail, sendViaBookerGmail } from '../../../lib/server/bookerGmail';
import { AppError } from '../../../lib/apiError';

const BOOKER = 'bk-1';
const OFFER = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
const SHOW = '5b4c3d2e-2222-4e8a-9c21-7d4e5f6a8b92';
const GMAIL = { booker_id: BOOKER, gmail_address: 'pat@gmail.com' };

type Row = Record<string, unknown>;
const offerRow = (over: Row = {}): Row => ({
  id: OFFER,
  booker_id: BOOKER,
  show_id: SHOW,
  doc_number: 7,
  kind: 'offer',
  status: 'draft',
  band_name: 'The Band',
  venue_name: 'Saxon Pub',
  venue_city: 'Austin',
  venue_state: 'TX',
  show_date: '2026-11-14',
  load_in_time: null,
  door_time: null,
  set_time: '21:00:00',
  set_length_min: null,
  deal_type: 'guarantee',
  fee: 1500,
  deal_terms: null,
  deposit_amount: null,
  deposit_due_on: null,
  hospitality: null,
  terms: 'Terms.',
  buyer_name: 'Sarah',
  buyer_email: 'sarah@venue.com',
  expires_on: '2026-10-28',
  template_id: null,
  deleted_at: null,
  ...over,
});

interface World {
  booker?: Row | null;
  offers?: Row[];
  messageInsertError?: boolean;
}

/** Fake service client: equality filters are applied, so another agent's rows are invisible. */
function setup(world: World = {}) {
  const inserts: Row[] = [];
  const updates: Array<{ table: string; patch: Row; filters: Row }> = [];
  const shows: Row[] = [{ id: SHOW, booker_id: BOOKER, roster_id: 'r1', venue_id: null, deleted_at: null }];
  const roster: Row[] = [{ id: 'r1', booker_id: BOOKER, deleted_at: null }];
  const tables: Record<string, Row[]> = { booker_offers: world.offers ?? [offerRow()], booker_shows: shows, booker_roster: roster };
  const client = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }) },
    from: jest.fn((table: string) => {
      const filters: Row = {};
      let head = false;
      let patch: Row | null = null;
      let inserted: Row | null = null;
      const b: Record<string, unknown> = {};
      b.select = (_c?: string, opts?: { head?: boolean }) => {
        head = Boolean(opts?.head);
        return b;
      };
      b.eq = (col: string, val: unknown) => {
        filters[col] = val;
        return b;
      };
      b.is = () => b;
      b.gte = () => b;
      b.insert = (row: Row) => {
        inserted = row;
        inserts.push({ table, ...row });
        return b;
      };
      b.update = (p: Row) => {
        patch = p;
        return b;
      };
      const find = () => (tables[table] ?? []).find(r => Object.entries(filters).every(([k, v]) => r[k] === v)) ?? null;
      b.maybeSingle = () => {
        if (table === 'booker_profiles' && 'user_id' in filters) return Promise.resolve({ data: world.booker === undefined ? { id: BOOKER } : world.booker, error: null });
        if (table === 'booker_profiles') return Promise.resolve({ data: { agency_name: 'Ace Agency', contact_name: 'Ann', contact_email: 'ann@ace.com', contact_phone: null }, error: null });
        return Promise.resolve({ data: find(), error: null });
      };
      b.single = () => {
        if (patch) {
          updates.push({ table, patch, filters: { ...filters } });
          const row = find();
          return Promise.resolve(row ? { data: { ...row, ...patch }, error: null } : { data: null, error: { code: 'PGRST116' } });
        }
        if (table === 'booker_messages' && world.messageInsertError) return Promise.resolve({ data: null, error: { code: '23514' } });
        return Promise.resolve({ data: { id: 'msg-1', ...inserted }, error: null });
      };
      b.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => Promise.resolve(head ? { count: 0, error: null } : { data: null, error: null }).then(f, r);
      return b;
    }),
  };
  (getServiceClient as jest.Mock).mockReturnValue(client);
  return { inserts, updates };
}

function call(handler: typeof sendHandler, method: string, id: unknown, body: Row = {}) {
  const json = jest.fn();
  const send = jest.fn();
  const status = jest.fn().mockReturnValue({ json, send });
  const setHeader = jest.fn();
  const req = { method, body, query: { id }, headers: { authorization: 'Bearer tok' } } as unknown as NextApiRequest;
  const res = { status, json, setHeader } as unknown as NextApiResponse;
  return { run: () => handler(req, res), status, json, send, setHeader };
}

const email = { to_email: 'sarah@venue.com', to_name: 'Sarah', subject: 'Offer', body: 'Hi Sarah' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (getBookerGmail as jest.Mock).mockResolvedValue(GMAIL);
  (sendViaBookerGmail as jest.Mock).mockResolvedValue({ providerMessageId: 'g-1', fromAddress: 'pat@gmail.com' });
});

describe('POST /api/booker/offers/[id]/send', () => {
  it('rejects a bad id before touching anything', async () => {
    setup();
    const { run, status } = call(sendHandler, 'POST', 'not-a-uuid', email);
    await run();
    expect(status).toHaveBeenCalledWith(400);
    expect(sendViaBookerGmail).not.toHaveBeenCalled();
  });

  it('refuses a caller with no agent workspace', async () => {
    setup({ booker: null });
    const { run, status } = call(sendHandler, 'POST', OFFER, email);
    await run();
    expect(status).toHaveBeenCalledWith(403);
    expect(sendViaBookerGmail).not.toHaveBeenCalled();
  });

  it("can't reach another agent's offer", async () => {
    setup({ offers: [offerRow({ id: OTHER, booker_id: 'someone-else' })] });
    const { run, status } = call(sendHandler, 'POST', OTHER, email);
    await run();
    expect(status).toHaveBeenCalledWith(404);
    expect(sendViaBookerGmail).not.toHaveBeenCalled();
  });

  it('refuses an offer that was already answered', async () => {
    setup({ offers: [offerRow({ status: 'accepted' })] });
    const { run, status, json } = call(sendHandler, 'POST', OFFER, email);
    await run();
    expect(status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0].error).toMatch(/already accepted/);
  });

  it('asks for Gmail when it is not connected', async () => {
    setup();
    (getBookerGmail as jest.Mock).mockResolvedValue(null);
    const { run, status } = call(sendHandler, 'POST', OFFER, email);
    await run();
    expect(status).toHaveBeenCalledWith(409);
  });

  it('sends the PDF from Gmail, logs the email and only then marks the offer sent', async () => {
    const { inserts, updates } = setup();
    const { run, status, json } = call(sendHandler, 'POST', OFFER, email);
    await run();
    expect(status).toHaveBeenCalledWith(200);
    const [, gmail, msg] = (sendViaBookerGmail as jest.Mock).mock.calls[0];
    expect(gmail).toBe(GMAIL);
    expect(msg).toMatchObject({ displayName: 'Ace Agency', to: 'sarah@venue.com', subject: 'Offer' });
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0]).toMatchObject({ filename: 'Offer-7-The-Band-Saxon-Pub-2026-11-14.pdf', contentType: 'application/pdf' });
    expect(msg.attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-');
    expect(inserts).toEqual([expect.objectContaining({ table: 'booker_messages', booker_id: BOOKER, show_id: SHOW, roster_id: 'r1', status: 'sent' })]);
    expect(updates).toEqual([
      { table: 'booker_offers', patch: expect.objectContaining({ status: 'sent', sent_to: 'sarah@venue.com', message_id: 'msg-1' }), filters: { id: OFFER, booker_id: BOOKER } },
    ]);
    expect(json.mock.calls[0][0].offer.status).toBe('sent');
  });

  it('logs a failed send and leaves the offer as it was when Gmail refuses', async () => {
    const { inserts, updates } = setup();
    (sendViaBookerGmail as jest.Mock).mockRejectedValue(new AppError(502, 'Gmail would not send this email.'));
    const { run, status } = call(sendHandler, 'POST', OFFER, email);
    await run();
    expect(status).toHaveBeenCalledWith(502);
    expect(inserts).toEqual([expect.objectContaining({ table: 'booker_messages', status: 'failed' })]);
    expect(updates).toEqual([]);
  });

  it('still marks the offer sent, with a warning, when only the history row fails', async () => {
    const { updates } = setup({ messageInsertError: true });
    const { run, json } = call(sendHandler, 'POST', OFFER, email);
    await run();
    expect(updates[0].patch).toMatchObject({ status: 'sent', message_id: null });
    expect(json.mock.calls[0][0].warning).toMatch(/history/);
  });
});

describe('GET /api/booker/offers/[id]/pdf', () => {
  it("returns the caller's offer as a PDF download, never cached", async () => {
    setup();
    const { run, status, send, setHeader } = call(pdfHandler, 'GET', OFFER);
    await run();
    expect(status).toHaveBeenCalledWith(200);
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="Offer-7-The-Band-Saxon-Pub-2026-11-14.pdf"');
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect((send.mock.calls[0][0] as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it("won't return another agent's offer", async () => {
    setup({ offers: [offerRow({ id: OTHER, booker_id: 'someone-else' })] });
    const { run, status } = call(pdfHandler, 'GET', OTHER);
    await run();
    expect(status).toHaveBeenCalledWith(404);
  });
});
