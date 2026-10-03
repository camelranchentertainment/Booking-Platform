import { requireBandAdmin } from '../../lib/server/requireBandAdmin';
import { AppError } from '../../lib/apiError';
import type { NextApiRequest } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';

function mockReq(token?: string): NextApiRequest {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as NextApiRequest;
}

function buildService({
  authFails = false,
  role = 'band_admin',
  actId = 'act-uuid-123' as string | null,
  profileFails = false,
} = {}): SupabaseClient {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue(
        authFails
          ? { data: { user: null }, error: new Error('invalid token') }
          : { data: { user: { id: 'user-id-abc' } }, error: null },
      ),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(
        profileFails
          ? { data: null, error: new Error('not found') }
          : { data: { role, act_id: actId }, error: null },
      ),
    }),
  } as unknown as SupabaseClient;
}

describe('requireBandAdmin', () => {
  it('throws 401 when authorization header is missing', async () => {
    await expect(requireBandAdmin(mockReq(), buildService())).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('throws 401 when getUser returns an error', async () => {
    await expect(
      requireBandAdmin(mockReq('bad-token'), buildService({ authFails: true })),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 403 when caller role is member', async () => {
    await expect(
      requireBandAdmin(mockReq('tok'), buildService({ role: 'member' })),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 403 when band_admin has no act_id', async () => {
    await expect(
      requireBandAdmin(mockReq('tok'), buildService({ role: 'band_admin', actId: null })),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns context for band_admin with an act', async () => {
    const ctx = await requireBandAdmin(mockReq('tok'), buildService());
    expect(ctx).toEqual({ userId: 'user-id-abc', actId: 'act-uuid-123', role: 'band_admin' });
  });

  it('returns context for superadmin with an act', async () => {
    const ctx = await requireBandAdmin(
      mockReq('tok'),
      buildService({ role: 'superadmin', actId: 'act-xyz' }),
    );
    expect(ctx).toEqual({ userId: 'user-id-abc', actId: 'act-xyz', role: 'superadmin' });
  });

  it('throws AppError instances (instanceof check)', async () => {
    await expect(requireBandAdmin(mockReq(), buildService())).rejects.toBeInstanceOf(AppError);
  });
});
