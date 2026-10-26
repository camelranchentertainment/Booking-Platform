// __tests__/api/agentFollowUpOutreach.test.ts
// Regression (Oct 24): "look at my last sent email to TX venues and write the
// overdue follow up" → the agent's bulk outreach only looked at venues in
// Target, so with all 17 LONE STAR venues in Follow up it answered
// '"LONE STAR" has no venues still marked Targeted' on every retry.

jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn();
  class Anthropic {
    messages = { create: mockCreate };
    static RateLimitError = class extends Error {};
    static APIError = class extends Error { error: unknown = null; };
  }
  return { __esModule: true, default: Anthropic, __mockCreate: mockCreate };
});

const TOUR = { id: 'tour-1', name: 'LONE STAR', start_date: '2027-01-07', end_date: '2027-01-09', routing_notes: null };
const venueRow = (i: number, status: string) => ({
  id: `tv-${i}`, tour_id: TOUR.id, status, booking_date: null,
  last_contacted_at: '2026-10-14T18:00:00Z', pitched_at: '2026-10-14T18:00:00Z', updated_at: '2026-10-14T18:00:00Z',
  venue: { id: `v-${i}`, name: `Texas Venue ${i}`, city: 'Austin', state: 'TX', email: `book${i}@example.com` },
});
const mockWorld = { tourVenues: [] as ReturnType<typeof venueRow>[] };
const LAST_EMAIL = { subject: 'Booking - Jan 7-9', body: 'We are routing through Texas Jan 7-9.', sent_at: '2026-10-14T18:00:00Z' };

jest.mock('../../lib/supabase', () => {
  const chain = (table: string) => {
    const filters: Record<string, unknown> = {};
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'neq', 'is', 'gt', 'gte', 'or', 'not', 'order', 'limit', 'ilike', 'update']) c[m] = () => c;
    c.eq = (col: string, v: unknown) => ((filters[col] = v), c);
    c.in = (col: string, v: unknown) => ((filters[`in:${col}`] = v), c);
    const rows = (): unknown => {
      if (table === 'tours') return [TOUR];
      if (table === 'tour_venues') {
        const statuses = filters['in:status'] as string[] | undefined;
        return mockWorld.tourVenues.filter(r => !statuses || statuses.includes(r.status));
      }
      return [];
    };
    c.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(f);
    c.single = () => Promise.resolve({
      data: table === 'profiles' ? { act_id: 'act-1', role: 'band_admin' } : table === 'acts' ? { act_name: 'Jake Stringer' } : null,
      error: null,
    });
    c.maybeSingle = () => Promise.resolve({ data: table === 'email_log' ? LAST_EMAIL : null, error: null });
    return c;
  };
  return { getServiceClient: () => ({ from: jest.fn(chain) }) };
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
  }),
}));
jest.mock('../../lib/platformSettings', () => ({ getSetting: jest.fn().mockResolvedValue('key') }));
jest.mock('../../lib/helpSystemPrompt', () => ({ HELP_SYSTEM_PROMPT: 'help' }));

import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/agent';

const mockCreate = (jest.requireMock('@anthropic-ai/sdk') as { __mockCreate: jest.Mock }).__mockCreate;
const text = (t: string) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });

async function ask(action: Record<string, unknown>) {
  mockCreate
    .mockResolvedValueOnce(text(JSON.stringify({ reply: 'Here is the follow-up.', action })))
    .mockResolvedValueOnce(text('{"subject":"Re: Booking - Jan 7-9","body":"{contact_name}, following up on Jan 7-9 at {venue_name}."}'));
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: 'POST', headers: { authorization: 'Bearer t' }, body: { message: 'write the overdue follow up', history: [] },
  });
  await handler(req, res);
  return res._getJSONData() as { reply: string; action?: { type: string; stage?: string; venues: unknown[]; draft: { subject: string } } };
}

beforeEach(() => {
  mockCreate.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockWorld.tourVenues = Array.from({ length: 17 }, (_, i) => venueRow(i + 1, 'follow_up'));
});

describe('agent tour_outreach — follow-ups', () => {
  it('builds a follow-up card for every overdue Follow up venue, drafted from the last email', async () => {
    const body = await ask({ type: 'tour_outreach', tourName: 'LONE STAR', stage: 'follow_up', overdueOnly: true });
    expect(body.action).toMatchObject({ type: 'tour_outreach', stage: 'follow_up' });
    expect(body.action?.venues).toHaveLength(17);
    expect(body.action?.draft.subject).toBe('Re: Booking - Jan 7-9');

    const draftPrompt = mockCreate.mock.calls[1][0].messages[0].content as string;
    expect(draftPrompt).toContain('Subject: Booking - Jan 7-9');
    expect(draftPrompt).toContain('We are routing through Texas Jan 7-9.');
  });

  it('a first-pitch request on an all-follow-up tour says where the venues are instead of looping', async () => {
    const body = await ask({ type: 'tour_outreach', tourName: 'LONE STAR' });
    expect(body.action).toBeUndefined();
    expect(body.reply).toMatch(/all 17 have been pitched and are in Follow up \(17 overdue\)/);
    expect(body.reply).not.toMatch(/still marked Targeted/);
  });

  // Regression (Oct 26): the user approved a follow-up in chat ($800 ask,
  // signature), then the send card showed a different email written by a second
  // AI call. The agreed text must go out word for word.
  it('sends the email approved in chat word for word instead of writing a new one', async () => {
    const agreed = "Hey, just wanted to follow up on my email from a couple weeks back.\n\nAsking $800 for the night.\n\nThanks,\nScott McCumber\nCamel Ranch Booking";
    const body = await ask({
      type: 'tour_outreach', tourName: 'LONE STAR', stage: 'follow_up',
      draft: { subject: 'Re: Live Music Booking Inquiry', body: agreed },
    });
    expect(body.action?.draft).toEqual({ subject: 'Re: Live Music Booking Inquiry', body: agreed });
    expect((body.action as { draftSource?: string }).draftSource).toBe('agreed');
    expect(body.action?.venues).toHaveLength(17);
    // Only the conversation call ran: no second AI call rewrote the email.
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('falls back to the last-email subject when the agreed draft has none', async () => {
    const body = await ask({ type: 'tour_outreach', tourName: 'LONE STAR', stage: 'follow_up', draft: { body: 'Still have Jan 7-9 open?' } });
    expect(body.action?.draft).toEqual({ subject: 'Re: Booking - Jan 7-9', body: 'Still have Jan 7-9 open?' });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('marks a freshly written draft so the card can warn before sending', async () => {
    const body = await ask({ type: 'tour_outreach', tourName: 'LONE STAR', stage: 'follow_up' });
    expect((body.action as { draftSource?: string }).draftSource).toBe('generated');
  });

  it('gives the model the Outreach section with sent emails', async () => {
    await ask({ type: 'tour_outreach', tourName: 'LONE STAR', stage: 'follow_up' });
    const system = mockCreate.mock.calls[0][0].system as Array<{ text: string }>;
    const context = system.map(b => b.text).join('\n');
    expect(context).toContain('Outreach — the Email page\'s Outreach tab');
    expect(context).toContain('LONE STAR (tour id=tour-1): 17 Follow up');
    expect(context).toMatch(/You CAN see sent emails/);
  });
});
