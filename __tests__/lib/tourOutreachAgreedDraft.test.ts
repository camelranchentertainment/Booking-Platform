// __tests__/lib/tourOutreachAgreedDraft.test.ts
// The email approved in chat must reach the send panel word for word.
import { MAX_AGREED_BODY, parseAgreedDraft } from '../../lib/domain/tourOutreach';

const AGREED_BODY = `Hey, just wanted to follow up on my email from a couple weeks back. Still looking to fill Jan 7, 8, or 9 in Texas with Jake Stringer & Better Than Nothin'.

5-piece honky tonk/country band, 2-hour show, easy to work with. Asking $800 for the night.

Check them out at www.betterthannothin.com and let me know if any of those dates work.

Thanks,
Scott McCumber
Camel Ranch Booking
scott@camelranchbooking.com`;

describe('parseAgreedDraft', () => {
  it('keeps the agreed body exactly, including price and signature', () => {
    const d = parseAgreedDraft({ subject: 'Re: Live Music Booking Inquiry', body: AGREED_BODY });
    expect(d).toEqual({ subject: 'Re: Live Music Booking Inquiry', body: AGREED_BODY });
  });

  it('strips Subject:/Body: labels the model may copy from the chat', () => {
    const d = parseAgreedDraft({ subject: 'Subject: Re: Hello', body: `**Body:** ${AGREED_BODY}` });
    expect(d).toEqual({ subject: 'Re: Hello', body: AGREED_BODY });
  });

  it('normalises Windows line endings without touching the words', () => {
    expect(parseAgreedDraft({ body: 'Line one\r\nLine two' })?.body).toBe('Line one\nLine two');
  });

  it('allows a missing subject (the server fills one in)', () => {
    expect(parseAgreedDraft({ body: 'Hi there' })).toEqual({ subject: null, body: 'Hi there' });
    expect(parseAgreedDraft({ subject: '   ', body: 'Hi there' })?.subject).toBeNull();
  });

  it('returns null when nothing usable was agreed, so a new draft is written', () => {
    expect(parseAgreedDraft(undefined)).toBeNull();
    expect(parseAgreedDraft('text')).toBeNull();
    expect(parseAgreedDraft({ subject: 'Hi' })).toBeNull();
    expect(parseAgreedDraft({ body: '   ' })).toBeNull();
    expect(parseAgreedDraft({ body: 42 })).toBeNull();
    expect(parseAgreedDraft({ body: 'x'.repeat(MAX_AGREED_BODY + 1) })).toBeNull();
  });
});
