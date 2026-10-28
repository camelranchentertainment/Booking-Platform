// __tests__/lib/tourAccess.test.ts
//
// canManageTour decides who may work a tour's targets through the
// service-role /api/tours/venues route. It must match the tour_venues RLS
// write policy: the act owner or a band admin / superadmin of the tour's act.
import type { SupabaseClient } from '@supabase/supabase-js';
import { canManageTour } from '../../lib/server/tourAccess';

type Row = Record<string, unknown> | null;
type Err = { message: string } | null;

function chain(data: Row, error: Err = null) {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = () => c;
  c.maybeSingle = () => Promise.resolve({ data, error });
  return c;
}

function service(opts: { tour: Row; profile: Row; ownedAct?: Row; tourErr?: Err; profileErr?: Err }) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'tours') return chain(opts.tour, opts.tourErr ?? null);
      if (table === 'profiles') return chain(opts.profile, opts.profileErr ?? null);
      if (table === 'acts') return chain(opts.ownedAct ?? null);
      throw new Error(`unexpected table ${table}`);
    }),
  } as unknown as SupabaseClient;
}

const tour = { id: 't-1', act_id: 'act-1' };

describe('canManageTour', () => {
  it('lets any band admin of the tour band in, not just the creator', async () => {
    await expect(canManageTour(service({ tour, profile: { act_id: 'act-1', role: 'band_admin' } }), 't-1', 'u2')).resolves.toBe(true);
  });

  it('lets a superadmin of the tour band in', async () => {
    await expect(canManageTour(service({ tour, profile: { act_id: 'act-1', role: 'superadmin' } }), 't-1', 'u2')).resolves.toBe(true);
  });

  it('refuses a plain member of the band', async () => {
    await expect(canManageTour(service({ tour, profile: { act_id: 'act-1', role: 'member' } }), 't-1', 'u3')).resolves.toBe(false);
  });

  it("refuses an admin (or superadmin) of a different band", async () => {
    await expect(canManageTour(service({ tour, profile: { act_id: 'act-9', role: 'band_admin' } }), 't-1', 'u4')).resolves.toBe(false);
    await expect(canManageTour(service({ tour, profile: { act_id: 'act-9', role: 'superadmin' } }), 't-1', 'u4')).resolves.toBe(false);
  });

  it('lets the act owner in even when their profile is linked elsewhere', async () => {
    const s = service({ tour, profile: { act_id: null, role: 'band_admin' }, ownedAct: { id: 'act-1' } });
    await expect(canManageTour(s, 't-1', 'owner')).resolves.toBe(true);
  });

  it('refuses a missing tour or a tour with no band', async () => {
    await expect(canManageTour(service({ tour: null, profile: { act_id: 'act-1', role: 'band_admin' } }), 't-x', 'u2')).resolves.toBe(false);
    await expect(canManageTour(service({ tour: { id: 't-1', act_id: null }, profile: { act_id: 'act-1', role: 'band_admin' } }), 't-1', 'u2')).resolves.toBe(false);
  });

  it('throws rather than guessing when a lookup fails', async () => {
    await expect(canManageTour(service({ tour: null, profile: null, tourErr: { message: 'boom' } }), 't-1', 'u2')).rejects.toThrow('tour lookup failed');
    await expect(canManageTour(service({ tour, profile: null, profileErr: { message: 'boom' } }), 't-1', 'u2')).rejects.toThrow('profile lookup failed');
  });
});
