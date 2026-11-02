import { trialNotice } from '../../lib/trialNotice';

const NOW = new Date('2026-11-02T12:00:00Z').getTime();
const inDays = (d: number) => new Date(NOW + d * 86_400_000).toISOString();
const admin = (d: number) => ({ role: 'band_admin', subscription_status: 'trialing', trial_ends_at: inDays(d) });

describe('trialNotice', () => {
  it('stays quiet until 30 days out', () => {
    expect(trialNotice(admin(31), 'band', NOW)).toBeNull();
    expect(trialNotice(admin(30), 'band', NOW)?.urgent).toBe(false);
  });
  it('turns urgent in the last 3 days', () => {
    expect(trialNotice(admin(4), 'band', NOW)?.urgent).toBe(false);
    expect(trialNotice(admin(3), 'band', NOW)?.urgent).toBe(true);
    expect(trialNotice(admin(1), 'band', NOW)?.message).toMatch(/tomorrow/);
  });
  it('never shows to members on the band side', () => {
    expect(trialNotice({ ...admin(2), role: 'member' }, 'band', NOW)).toBeNull();
  });
  it('shows to agents, whose profile has no band role', () => {
    expect(trialNotice({ ...admin(2), role: null }, 'agent', NOW)).not.toBeNull();
  });
  it('ignores paying accounts, missing dates and bad dates', () => {
    expect(trialNotice({ ...admin(2), subscription_status: 'active' }, 'band', NOW)).toBeNull();
    expect(trialNotice({ ...admin(2), trial_ends_at: null }, 'band', NOW)).toBeNull();
    expect(trialNotice({ ...admin(2), trial_ends_at: 'nope' }, 'band', NOW)).toBeNull();
    expect(trialNotice(null, 'band', NOW)).toBeNull();
  });
  it('says so once the period has ended', () => {
    expect(trialNotice(admin(-1), 'agent', NOW)?.message).toMatch(/has ended/);
  });
});
