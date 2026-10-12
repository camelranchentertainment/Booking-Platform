// __tests__/lib/booker/messages.test.ts
import { MessageSendSchema } from '../../../lib/booker/schemas';
import { emailFollowups } from '../../../lib/booker/workspace';
import type { BookerMessage } from '../../../lib/booker/types';

const UUID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';

function msg(over: Partial<BookerMessage>): BookerMessage {
  return {
    id: 'm1', booker_id: 'b1', roster_id: null, venue_id: null, contact_id: null, show_id: null,
    direction: 'outbound', to_email: 'sarah@venue.com', to_name: 'Sarah Lee', copy_to_self: true,
    subject: 'Oct 24 avail?', body: 'Hi', from_address: null, reply_to: null, sent_via: 'platform',
    provider_message_id: null, status: 'sent', error: null, template_key: null, ai_assisted: false,
    sent_at: '2026-10-01T15:00:00Z', followup_on: '2026-10-08', followup_done_at: null,
    created_at: '2026-10-01T15:00:00Z', updated_at: '2026-10-01T15:00:00Z', deleted_at: null,
    ...over,
  };
}

describe('MessageSendSchema', () => {
  const base = { to_email: ' sarah@venue.com ', subject: 'Avail?', body: 'Hi Sarah' };
  it('accepts a minimal message, trims, blanks become null, copy defaults on', () => {
    const r = MessageSendSchema.parse({ ...base, to_name: '', venue_id: '', followup_on: '' });
    expect(r).toMatchObject({ to_email: 'sarah@venue.com', to_name: null, venue_id: null, followup_on: null, copy_to_self: true });
  });
  it('requires a valid address, subject and body', () => {
    expect(MessageSendSchema.safeParse({ ...base, to_email: 'nope' }).success).toBe(false);
    expect(MessageSendSchema.safeParse({ ...base, subject: '  ' }).success).toBe(false);
    expect(MessageSendSchema.safeParse({ ...base, body: '' }).success).toBe(false);
  });
  it('enforces the database limits', () => {
    expect(MessageSendSchema.safeParse({ ...base, subject: 'x'.repeat(201) }).success).toBe(false);
    expect(MessageSendSchema.safeParse({ ...base, body: 'x'.repeat(20001) }).success).toBe(false);
  });
  it('rejects malformed ids and dates', () => {
    expect(MessageSendSchema.safeParse({ ...base, venue_id: 'abc' }).success).toBe(false);
    expect(MessageSendSchema.safeParse({ ...base, followup_on: '2026-13-40' }).success).toBe(false);
    expect(MessageSendSchema.safeParse({ ...base, show_id: UUID, followup_on: '2026-10-20' }).success).toBe(true);
  });
});

describe('emailFollowups', () => {
  const venues = new Map([['v1', { name: 'Gruene Hall' }]]);
  it('lists due and overdue open follow-ups, oldest first, linking to the venue', () => {
    const items = emailFollowups(
      [msg({ id: 'a', followup_on: '2026-10-11', venue_id: 'v1' }), msg({ id: 'b', followup_on: '2026-10-05', roster_id: 'r1' })],
      venues,
      '2026-10-11',
    );
    expect(items.map(i => i.messageId)).toEqual(['b', 'a']);
    expect(items[1]).toMatchObject({ kind: 'email_followup', href: '/booker/venues/v1' });
    expect(items[1].message).toContain('Gruene Hall');
    expect(items[0].href).toBe('/booker/bands/r1');
  });
  it('leaves out future, done, failed, archived and date-less messages', () => {
    const items = emailFollowups(
      [
        msg({ id: 'future', followup_on: '2026-10-12' }),
        msg({ id: 'done', followup_done_at: '2026-10-09T00:00:00Z' }),
        msg({ id: 'failed', status: 'failed' }),
        msg({ id: 'gone', deleted_at: '2026-10-09T00:00:00Z' }),
        msg({ id: 'none', followup_on: null }),
      ],
      venues,
      '2026-10-11',
    );
    expect(items).toEqual([]);
  });
});
