// __tests__/lib/showConfirmedEmail.test.ts
// Members get this email when a show is confirmed. It used to include the
// band's fee; members never see money, so the template has no fee at all.
import { showConfirmedHtml, showConfirmedSubject } from '../../lib/server/showConfirmedEmail';

const input = {
  memberName: 'Cody',
  actName: 'Jake Stringer & Better Than Nothin’',
  venueName: 'Chrome',
  city: 'Basehor',
  state: 'KS',
  date: 'Friday, December 4, 2026',
};

describe('show confirmed email', () => {
  it('has the show, never money', () => {
    const html = showConfirmedHtml(input);
    expect(html).toContain('Chrome');
    expect(html).toContain('Basehor, KS');
    expect(html).toContain('Friday, December 4, 2026');
    expect(html).not.toMatch(/fee|\$\d/i);
  });

  it('escapes names so they cannot inject markup', () => {
    const html = showConfirmedHtml({ ...input, venueName: '<script>x</script>', memberName: 'A&B' });
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('A&amp;B');
    expect(html).toContain('Jake Stringer &amp; Better');
  });

  it('builds the subject', () => {
    expect(showConfirmedSubject(input)).toBe('New Show Confirmed: Jake Stringer & Better Than Nothin’ @ Chrome');
  });
});
