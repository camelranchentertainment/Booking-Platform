// __tests__/lib/booker/handoff.test.ts
// Band hand-off: which link describes a band, which shows can be sent, the
// row chips, the sharing summary, and the browser calls (they pass only the
// ids the database needs and turn database errors into readable messages).

const rpc = jest.fn();
const fromSelect = { order: jest.fn(), in: jest.fn() };
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({ select: () => fromSelect }),
  },
}));

import {
  currentLink,
  dealLine,
  handoffChip,
  latestProposalByShow,
  looksLikeEmail,
  sendableShows,
  sharingSummary,
  type LinkStatus,
} from '../../../lib/booker/handoff';
import {
  acceptAgentRequest,
  declineAgentRequest,
  inviteBand,
  listAgentRequests,
  listBandProposals,
  sendShowToBand,
  setBandSharing,
  toHandoffError,
} from '../../../lib/booker/handoffData';

const TODAY = '2026-10-21';
const link = (over: { id: string; roster_id?: string; status: LinkStatus; updated_at?: string }) => ({ roster_id: 'r1', updated_at: '2026-10-01T00:00:00Z', ...over });

describe('currentLink', () => {
  it('prefers the active link, then an open invite, then the latest ended one', () => {
    const links = [
      link({ id: 'old', status: 'revoked', updated_at: '2026-09-01T00:00:00Z' }),
      link({ id: 'newer', status: 'declined', updated_at: '2026-10-10T00:00:00Z' }),
      link({ id: 'inv', status: 'invited' }),
      link({ id: 'act', status: 'active' }),
      link({ id: 'other', roster_id: 'r2', status: 'active' }),
    ];
    expect(currentLink(links, 'r1')).toMatchObject({ id: 'act' });
    expect(currentLink(links.filter(l => l.id !== 'act'), 'r1')).toMatchObject({ id: 'inv' });
    expect(currentLink(links.filter(l => l.id !== 'act' && l.id !== 'inv'), 'r1')).toMatchObject({ id: 'newer' });
    expect(currentLink(links, 'r9')).toBeNull();
  });
});

describe('latestProposalByShow and handoffChip', () => {
  it('keeps the newest proposal per show and labels it', () => {
    const latest = latestProposalByShow([
      { id: 'a', show_id: 's1', created_at: '2026-10-01', status: 'declined' as const },
      { id: 'b', show_id: 's1', created_at: '2026-10-05', status: 'pending' as const },
      { id: 'c', show_id: 's2', created_at: '2026-10-02', status: 'accepted' as const },
    ]);
    expect(latest.get('s1')?.id).toBe('b');
    expect(handoffChip(latest.get('s1'))?.text).toBe('Waiting on band');
    expect(handoffChip(latest.get('s2'))?.text).toBe('On band calendar');
    expect(handoffChip({ status: 'declined' })?.text).toBe('Band declined');
    expect(handoffChip({ status: 'withdrawn' })).toBeNull();
    expect(handoffChip(undefined)).toBeNull();
  });
});

describe('sendableShows', () => {
  const show = (id: string, over: Record<string, unknown> = {}) => ({ id, roster_id: 'r1', status: 'confirmed' as const, show_date: '2026-11-01', deleted_at: null, ...over });
  it('lists confirmed upcoming shows not already with the band, soonest first', () => {
    const shows = [
      show('later', { show_date: '2026-12-01' }),
      show('soon'),
      show('hold', { status: 'hold' }),
      show('past', { show_date: '2026-10-01' }),
      show('gone', { deleted_at: '2026-10-02' }),
      show('other', { roster_id: 'r2' }),
      show('waiting'),
      show('onCal'),
      show('declined'),
      show('withdrawn'),
    ];
    const latest = new Map([
      ['waiting', { status: 'pending' as const }],
      ['onCal', { status: 'accepted' as const }],
      ['declined', { status: 'declined' as const }],
      ['withdrawn', { status: 'withdrawn' as const }],
    ]);
    expect(sendableShows(shows, 'r1', latest, TODAY).map(s => s.id)).toEqual(['soon', 'declined', 'withdrawn', 'later']);
  });
});

describe('sharingSummary, dealLine, looksLikeEmail', () => {
  it('describes what the band sees', () => {
    expect(sharingSummary({ share_times: false, share_deal: false, share_deal_notes: false, share_commission: false })).toBe('date, venue and town');
    expect(sharingSummary({ share_times: true, share_deal: true, share_deal_notes: false, share_commission: true })).toBe('date, venue and town, times, deal and fee and your commission');
  });
  it('formats a shared deal and stays quiet when it was not shared', () => {
    const money = (n: number) => `$${n}`;
    expect(dealLine({ show_date: TODAY, deal_type: 'guarantee', fee: '1000.00' }, money)).toBe('Guarantee · $1000');
    expect(dealLine({ show_date: TODAY, fee: 250 }, money)).toBe('$250');
    expect(dealLine({ show_date: TODAY }, money)).toBeNull();
  });
  it('checks an email shape', () => {
    expect(looksLikeEmail(' jake@band.com ')).toBe(true);
    expect(looksLikeEmail('jake@band')).toBe(false);
    expect(looksLikeEmail('not an email')).toBe(false);
  });
});

describe('browser calls', () => {
  beforeEach(() => {
    rpc.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('calls each database function with only the ids it needs', async () => {
    rpc.mockResolvedValue({ data: 'id-1', error: null });
    await inviteBand('r1', '  jake@band.com ');
    await sendShowToBand('s1');
    await setBandSharing('l1', { share_times: true, share_deal: false, share_deal_notes: false, share_commission: true });
    await acceptAgentRequest('p1');
    await declineAgentRequest('p2', '   ');
    expect(rpc.mock.calls).toEqual([
      ['booker_link_invite', { p_roster_id: 'r1', p_email: 'jake@band.com' }],
      ['booker_proposal_send', { p_show_id: 's1' }],
      ['booker_link_set_sharing', { p_link_id: 'l1', p_times: true, p_deal: false, p_deal_notes: false, p_commission: true }],
      ['booker_proposal_accept', { p_proposal_id: 'p1' }],
      ['booker_proposal_decline', { p_proposal_id: 'p2', p_note: null }],
    ]);
  });

  it('passes through the messages our functions write for people, and hides anything else', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23P01', message: 'Your band already has a show on this date. Resolve it before accepting.' } });
    await expect(acceptAgentRequest('p1')).rejects.toThrow('Your band already has a show on this date.');
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'internal: relation x' } });
    await expect(sendShowToBand('s1')).rejects.toThrow('Could not send the show. Check your connection and try again.');
    expect(toHandoffError({ code: '42501', message: 'permission denied for function booker_my_band_links', details: '', hint: '', name: 'PostgrestError' }, 'x').message).toBe(
      'You do not have access to that. Try signing out and back in.',
    );
  });

  it('returns an empty list when a list function returns nothing', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(listAgentRequests()).resolves.toEqual([]);
  });

  it('does not query proposals for a band with no links', async () => {
    await expect(listBandProposals([])).resolves.toEqual([]);
    expect(fromSelect.order).not.toHaveBeenCalled();
  });
});
