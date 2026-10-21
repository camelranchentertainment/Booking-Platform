// __tests__/lib/accountSide.test.ts
// Each login belongs to one side: band (superadmin / band admin / member) or the
// Booking Agent workspace. These rules decide where a login is sent, so a band
// login is never routed into the agent workspace and vice versa.
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { supabase } from '../../lib/supabase';
import { bandSideHome, fetchHasAgentWorkspace, isAgentShape, safeAgentNext } from '../../lib/accountSide';

const mockFrom = supabase.from as jest.Mock;

function mockLookup(result: { data: unknown; error: unknown } | Error) {
  const maybeSingle = result instanceof Error ? jest.fn().mockRejectedValue(result) : jest.fn().mockResolvedValue(result);
  const chain = { select: jest.fn(), eq: jest.fn(), is: jest.fn(), maybeSingle };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  mockFrom.mockReturnValue(chain);
  return chain;
}

describe('bandSideHome', () => {
  it('sends each band-side role to its own home', () => {
    expect(bandSideHome('superadmin')).toBe('/admin');
    expect(bandSideHome('member')).toBe('/member/calendar');
    expect(bandSideHome('band_admin')).toBe('/band');
  });

  it('never returns an agent workspace path', () => {
    for (const role of ['superadmin', 'member', 'band_admin', null, undefined, 'unexpected']) {
      expect(bandSideHome(role).startsWith('/agent')).toBe(false);
    }
  });
});

describe('isAgentShape', () => {
  it('is false for any account with a band', () => {
    expect(isAgentShape('band_admin', '5a5bbd78-b7e5-47c5-8a9a-d4ca5c454256')).toBe(false);
  });

  it('is false for superadmin and members even without a band', () => {
    expect(isAgentShape('superadmin', null)).toBe(false);
    expect(isAgentShape('member', null)).toBe(false);
  });

  it('is true only for a band-less, non-member, non-superadmin profile', () => {
    expect(isAgentShape('band_admin', null)).toBe(true);
    expect(isAgentShape('band_admin', undefined)).toBe(true);
  });
});

describe('safeAgentNext', () => {
  it('keeps paths inside the agent workspace', () => {
    expect(safeAgentNext('/agent')).toBe('/agent');
    expect(safeAgentNext('/agent/shows')).toBe('/agent/shows');
    expect(safeAgentNext('/agent/bands/abc-123?tab=shows')).toBe('/agent/bands/abc-123?tab=shows');
  });

  it('refuses band pages, other sites and malformed values', () => {
    for (const bad of ['/band', '/admin', '//evil.example/booker', 'https://evil.example/booker', '/bookerevil', '', undefined, ['/agent'], 42]) {
      expect(safeAgentNext(bad)).toBe('/agent');
    }
  });
});

describe('fetchHasAgentWorkspace', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('is true when an active agent profile exists', async () => {
    const chain = mockLookup({ data: { id: 'b1' }, error: null });
    await expect(fetchHasAgentWorkspace('u1')).resolves.toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('booker_profiles');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('is false when there is no agent profile', async () => {
    mockLookup({ data: null, error: null });
    await expect(fetchHasAgentWorkspace('u1')).resolves.toBe(false);
  });

  it('is null (not true) when the lookup errors or throws', async () => {
    mockLookup({ data: null, error: { code: '500' } });
    await expect(fetchHasAgentWorkspace('u1')).resolves.toBeNull();
    mockLookup(new Error('network'));
    await expect(fetchHasAgentWorkspace('u1')).resolves.toBeNull();
  });
});
