// __tests__/lib/domain/emailReply.test.ts
import {
  MAX_QUOTED_LINES,
  composerTextToHtml,
  quotedReplyBody,
  replyAddress,
  replySubject,
} from '../../../lib/domain/emailReply';

describe('replyAddress', () => {
  it('pulls the address out of a named From', () => {
    expect(replyAddress('Maxine Lee <Maxine@WireRoad.beer>')).toBe('maxine@wireroad.beer');
    expect(replyAddress('"Lee, Maxine" <maxine@wireroad.beer>')).toBe('maxine@wireroad.beer');
  });

  it('accepts a bare address', () => {
    expect(replyAddress(' booking@georges.com ')).toBe('booking@georges.com');
  });

  it('returns empty for anything that is not one address', () => {
    expect(replyAddress(null)).toBe('');
    expect(replyAddress('Maxine Lee')).toBe('');
    expect(replyAddress('a@b.com, c@d.com')).toBe('');
    expect(replyAddress('not an email <nope>')).toBe('');
  });
});

describe('replySubject', () => {
  it('adds Re: once', () => {
    expect(replySubject('Booking - El Dolor')).toBe('Re: Booking - El Dolor');
    expect(replySubject('Re: Booking - El Dolor')).toBe('Re: Booking - El Dolor');
    expect(replySubject('RE:Dates')).toBe('RE:Dates');
  });

  it('has a fallback for an empty subject', () => {
    expect(replySubject('  ')).toBe('Re: your email');
  });
});

describe('quotedReplyBody', () => {
  const when = (iso: string) => `[${iso.slice(0, 10)}]`;

  it('leaves room to type, then quotes the original under an attribution line', () => {
    const body = quotedReplyBody({ from: 'Maxine <m@x.com>', sentAt: '2026-10-29T15:00:00Z', body: '<p>Nov 7 works.</p><p>Load in at 5?</p>' }, when);
    expect(body.startsWith('\n\nOn [2026-10-29], Maxine <m@x.com> wrote:\n')).toBe(true);
    expect(body).toContain('> Nov 7 works.');
    expect(body).toContain('> Load in at 5?');
  });

  it('cuts a long original and says so', () => {
    const long = Array.from({ length: MAX_QUOTED_LINES + 10 }, (_, i) => `line ${i}`).join('\n');
    const body = quotedReplyBody({ from: 'a@b.c', sentAt: null, body: long }, when);
    expect(body.match(/^> line/gm)).toHaveLength(MAX_QUOTED_LINES);
    expect(body.endsWith('\n> …')).toBe(true);
  });

  it('copes with an empty original', () => {
    expect(quotedReplyBody({ from: '', sentAt: null, body: null }, when)).toBe('\n\nthey wrote:\n> (no text)');
  });
});

describe('composerTextToHtml', () => {
  it('keeps line breaks', () => {
    expect(composerTextToHtml('Hi Maxine,\n\nNov 7 works.')).toBe('Hi Maxine,<br><br>Nov 7 works.');
  });

  it('sends markup as text, never as live HTML', () => {
    expect(composerTextToHtml('> <img src=x onerror=alert(1)> & "quotes"'))
      .toBe('&gt; &lt;img src=x onerror=alert(1)&gt; &amp; &quot;quotes&quot;');
  });
});
