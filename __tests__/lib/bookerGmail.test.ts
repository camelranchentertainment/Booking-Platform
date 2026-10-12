// __tests__/lib/bookerGmail.test.ts
// Signed OAuth state for agent Gmail connections: forged, altered, expired or
// band-flow states must never verify.

import { BOOKER_STATE_PREFIX, nonceCookie, signOAuthState, verifyOAuthState } from '../../lib/server/bookerGmail';

const SECRET = 'test-secret';
const payload = { u: 'user-1', b: 'booker-1', n: 'nonce-abc', e: 2_000_000_000_000 };

describe('agent Gmail OAuth state', () => {
  it('round-trips a signed state', () => {
    const s = signOAuthState(payload, SECRET);
    expect(s.startsWith(BOOKER_STATE_PREFIX)).toBe(true);
    expect(verifyOAuthState(s, SECRET, 1_000)).toEqual(payload);
  });
  it('rejects a state signed with another secret', () => {
    expect(verifyOAuthState(signOAuthState(payload, 'other'), SECRET, 1_000)).toBeNull();
  });
  it('rejects an altered payload (e.g. swapping in another agent)', () => {
    const s = signOAuthState(payload, SECRET);
    const [body, sig] = s.slice(3).split('.');
    const tampered = Buffer.from(JSON.stringify({ ...payload, b: 'victim' })).toString('base64url');
    expect(verifyOAuthState(`${BOOKER_STATE_PREFIX}${tampered}.${sig}`, SECRET, 1_000)).toBeNull();
    expect(body).not.toBe(tampered);
  });
  it('rejects an expired state', () => {
    expect(verifyOAuthState(signOAuthState({ ...payload, e: 500 }, SECRET), SECRET, 1_000)).toBeNull();
  });
  it('rejects band-flow and malformed states', () => {
    expect(verifyOAuthState('11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222', SECRET)).toBeNull();
    expect(verifyOAuthState('bk.onlyonepart', SECRET)).toBeNull();
    expect(verifyOAuthState('bk.a.b.c', SECRET)).toBeNull();
  });
  it('nonce cookie is HttpOnly, Lax and scoped to the callback path', () => {
    const c = nonceCookie('abc');
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(c).toMatch(/Path=\/api\/auth\/google/);
    expect(c).toMatch(/Max-Age=600/);
  });
});
