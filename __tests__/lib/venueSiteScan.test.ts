// __tests__/lib/venueSiteScan.test.ts
jest.mock('../../lib/platformSettings', () => ({ getSetting: jest.fn() }));
jest.mock('@mendable/firecrawl-js', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@anthropic-ai/sdk', () => ({ __esModule: true, default: jest.fn() }));

import { assertScannableUrl, mergeExtraction, parseExtraction } from '../../lib/server/venueSiteScan';

describe('parseExtraction', () => {
  it('reads the JSON object and cleans bad values', () => {
    const r = parseExtraction('Here you go: {"booking_email":"Book@Hall.com","general_email":"not-an-email","capacity":"lots","booking_contact_name":"  Pat  ","booking_phone":null,"booking_contact_title":null,"venue_name":null,"notes":""}');
    expect(r).toMatchObject({ booking_email: 'book@hall.com', general_email: null, capacity: null, booking_contact_name: 'Pat', notes: null });
  });

  it('returns null for replies with no JSON', () => {
    expect(parseExtraction('Sorry, nothing found')).toBeNull();
  });
});

describe('mergeExtraction', () => {
  it('fills gaps without replacing found values', () => {
    const base = parseExtraction('{"booking_email":null,"booking_phone":"1"}')!;
    const next = parseExtraction('{"booking_email":"a@b.co","booking_phone":"2"}')!;
    expect(mergeExtraction(base, next)).toMatchObject({ booking_email: 'a@b.co', booking_phone: '1' });
  });
});

describe('assertScannableUrl', () => {
  it('accepts http(s) and rejects everything else', () => {
    expect(assertScannableUrl('https://hall.com').host).toBe('hall.com');
    expect(() => assertScannableUrl('javascript:alert(1)')).toThrow();
    expect(() => assertScannableUrl('file:///etc/passwd')).toThrow();
    expect(() => assertScannableUrl('not a url')).toThrow();
  });
});
