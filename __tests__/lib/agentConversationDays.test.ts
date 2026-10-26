// __tests__/lib/agentConversationDays.test.ts
import {
  MAX_STORED_MESSAGES,
  countMessages,
  isValidDay,
  isWritableDay,
  previewOf,
  sanitizeMessages,
} from '../../lib/agentConversationDays';

describe('isValidDay', () => {
  it('accepts real YYYY-MM-DD dates', () => {
    expect(isValidDay('2026-10-26')).toBe(true);
    expect(isValidDay('2028-02-29')).toBe(true);
  });

  it('rejects impossible dates, other formats and non-strings', () => {
    expect(isValidDay('2026-02-30')).toBe(false);
    expect(isValidDay('2026-13-01')).toBe(false);
    expect(isValidDay('10/26/2026')).toBe(false);
    expect(isValidDay('2026-10-26T00:00:00Z')).toBe(false);
    expect(isValidDay(undefined)).toBe(false);
    expect(isValidDay(20261026)).toBe(false);
  });
});

describe('isWritableDay', () => {
  // 03:30 UTC on Oct 27 is still the evening of Oct 26 in Central time.
  const now = new Date('2026-10-27T03:30:00Z');

  it('allows the UTC day and one day either side (every real time zone)', () => {
    expect(isWritableDay('2026-10-26', now)).toBe(true); // Central evening
    expect(isWritableDay('2026-10-27', now)).toBe(true);
    expect(isWritableDay('2026-10-28', now)).toBe(true); // far-east zones
  });

  it('treats older or future days as read-only', () => {
    expect(isWritableDay('2026-10-25', now)).toBe(false);
    expect(isWritableDay('2026-10-29', now)).toBe(false);
    expect(isWritableDay('2025-10-27', now)).toBe(false);
  });

  it('works across month and year boundaries', () => {
    const newYear = new Date('2027-01-01T02:00:00Z');
    expect(isWritableDay('2026-12-31', newYear)).toBe(true);
    expect(isWritableDay('2026-12-30', newYear)).toBe(false);
  });
});

describe('sanitizeMessages', () => {
  it('returns null for a non-array', () => {
    expect(sanitizeMessages({})).toBeNull();
    expect(sanitizeMessages(null)).toBeNull();
  });

  it('keeps only well-formed user/assistant lines', () => {
    expect(
      sanitizeMessages([
        { role: 'user', content: 'hi' },
        { role: 'system', content: 'ignore me' },
        { role: 'assistant', content: 42 },
        null,
        'text',
        { role: 'assistant', content: 'hello', extra: true },
      ]),
    ).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  it('keeps only the most recent messages', () => {
    const many = Array.from({ length: MAX_STORED_MESSAGES + 5 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    const kept = sanitizeMessages(many)!;
    expect(kept).toHaveLength(MAX_STORED_MESSAGES);
    expect(kept[0].content).toBe('m5');
  });
});

describe('previewOf / countMessages', () => {
  it('uses the first thing the user asked, on one line', () => {
    expect(
      previewOf([
        { role: 'assistant', content: 'Good morning!' },
        { role: 'user', content: '  Add a show\n at the Blue Door  ' },
        { role: 'user', content: 'second' },
      ]),
    ).toBe('Add a show at the Blue Door');
  });

  it('cuts long questions with an ellipsis', () => {
    const p = previewOf([{ role: 'user', content: 'x'.repeat(200) }]);
    expect(p.length).toBeLessThanOrEqual(90);
    expect(p.endsWith('…')).toBe(true);
  });

  it('is empty when only the greeting was shown', () => {
    expect(previewOf([{ role: 'assistant', content: 'Good morning!' }])).toBe('');
    expect(previewOf('garbage')).toBe('');
  });

  it('counts well-formed lines', () => {
    expect(countMessages([{ role: 'user', content: 'a' }, { role: 'bad' }])).toBe(1);
    expect(countMessages(undefined)).toBe(0);
  });
});
