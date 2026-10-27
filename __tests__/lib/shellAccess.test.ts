// The pure access rules shared by AppShell and PopoutShell. The hook itself
// only wires these to router redirects.
jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/accountSide', () => ({ fetchHasAgentWorkspace: jest.fn(), isAgentShape: jest.fn() }));
jest.mock('next/router', () => ({ useRouter: jest.fn() }));

import { daysLeft, needsSubscription } from '../../lib/hooks/useShellAccess';
import type { UserProfile } from '../../lib/types';

const DAY = 86_400_000;
const profile = (p: Partial<UserProfile>) => p as UserProfile;

describe('daysLeft', () => {
  it('is 0 without an end date or after it', () => {
    expect(daysLeft(null)).toBe(0);
    expect(daysLeft(new Date(Date.now() - DAY).toISOString())).toBe(0);
  });
  it('rounds part days up', () => {
    expect(daysLeft(new Date(Date.now() + 2.5 * DAY).toISOString())).toBe(3);
  });
});

describe('needsSubscription', () => {
  it('never blocks superadmins or members', () => {
    expect(needsSubscription(profile({ role: 'superadmin', subscription_status: 'cancelled' }))).toBe(false);
    expect(needsSubscription(profile({ role: 'member', subscription_status: 'cancelled' }))).toBe(false);
  });
  it('lets band admins with no billing record, an active plan, or trial days left in', () => {
    expect(needsSubscription(profile({ role: 'band_admin', subscription_status: null }))).toBe(false);
    expect(needsSubscription(profile({ role: 'band_admin', subscription_status: 'active' }))).toBe(false);
    expect(needsSubscription(profile({ role: 'band_admin', subscription_status: 'trialing', trial_ends_at: new Date(Date.now() + DAY).toISOString() }))).toBe(false);
  });
  it('sends an expired trial or lapsed plan to pricing', () => {
    expect(needsSubscription(profile({ role: 'band_admin', subscription_status: 'trialing', trial_ends_at: new Date(Date.now() - DAY).toISOString() }))).toBe(true);
    expect(needsSubscription(profile({ role: 'band_admin', subscription_status: 'cancelled' }))).toBe(true);
  });
});
