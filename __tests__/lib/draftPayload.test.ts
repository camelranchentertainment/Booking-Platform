import { buildDraftPayload } from '../../lib/server/draftPayload';

describe('buildDraftPayload', () => {
  const now = new Date('2026-10-05T12:00:00.000Z');

  it('never includes sent_at (the column is NOT NULL, so null breaks every draft save)', () => {
    const p = buildDraftPayload({ subject: 'Jun 23' }, 'u1', 'a1', [], now);
    expect('sent_at' in p).toBe(false);
  });

  it('marks the row as a draft and stamps updated_at', () => {
    const p = buildDraftPayload({}, 'u1', 'a1', [], now);
    expect(p).toMatchObject({ is_draft: true, status: 'draft', direction: 'sent', updated_at: '2026-10-05T12:00:00.000Z' });
  });

  it('takes the act and sender from the caller, and turns empty fields into null', () => {
    const p = buildDraftPayload({ subject: '', body: undefined, venueId: 'v1' }, 'u1', 'a1', [], now);
    expect(p).toMatchObject({ sent_by: 'u1', act_id: 'a1', venue_id: 'v1', subject: null, body: null, recipient: null });
  });

  it('passes the validated attachments through untouched', () => {
    const att = [{ name: 'kit.pdf' }];
    expect(buildDraftPayload({}, 'u1', 'a1', att, now).attachments).toBe(att);
  });
});
