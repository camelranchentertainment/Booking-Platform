// __tests__/lib/booker/emailFormat.test.ts
import { bodyToHtml, defaultFollowup, escapeHtml, fromHeader, replyAddress, safeDisplayName } from '../../../lib/booker/emailFormat';

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
  });
});

describe('bodyToHtml', () => {
  it('turns blank lines into paragraphs and newlines into <br>', () => {
    const html = bodyToHtml('Hi Sarah,\n\nAre you open\nOct 24?\n\nThanks');
    expect(html.match(/<p /g)).toHaveLength(3);
    expect(html).toContain('Are you open<br>Oct 24?');
  });
  it('never passes through HTML the agent typed', () => {
    const html = bodyToHtml('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
  it('normalises Windows line endings', () => {
    expect(bodyToHtml('a\r\n\r\nb').match(/<p /g)).toHaveLength(2);
  });
});

describe('safeDisplayName / fromHeader', () => {
  it('strips characters that could break or inject headers', () => {
    expect(safeDisplayName('Lone "Star" <Booking>,\r\nBcc: x@y.com')).toBe('Lone Star Booking Bcc: x@y.com');
    expect(fromHeader('Bad\nName', 'booking@camelranchbooking.com')).toBe('Bad Name <booking@camelranchbooking.com>');
  });
  it('falls back when nothing usable is left', () => {
    expect(safeDisplayName('  <>  ')).toBe('Booking Agent');
    expect(safeDisplayName(null)).toBe('Booking Agent');
  });
  it('caps length', () => {
    expect(safeDisplayName('x'.repeat(200))).toHaveLength(80);
  });
});

describe('replyAddress', () => {
  it('prefers the workspace contact email, then the sign-in email', () => {
    expect(replyAddress('agent@agency.com', 'login@hotmail.com')).toBe('agent@agency.com');
    expect(replyAddress('  ', 'login@hotmail.com')).toBe('login@hotmail.com');
    expect(replyAddress(null, null)).toBeNull();
  });
});

describe('defaultFollowup', () => {
  it('is a week out', () => {
    expect(defaultFollowup('2026-10-11')).toBe('2026-10-18');
    expect(defaultFollowup('2026-12-28')).toBe('2027-01-04');
  });
});
