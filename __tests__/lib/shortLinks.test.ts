import fs from 'fs';
import path from 'path';
import { SHORT_LINKS, destinationFor, shortLinkRedirects } from '../../lib/shortLinks';
import { isPublicPath } from '../../lib/webAnalytics';

describe('short marketing links', () => {
  it('sends /friends to the homepage with referral tags', () => {
    const friends = SHORT_LINKS.find((l) => l.path === '/friends');
    expect(friends).toBeDefined();
    expect(destinationFor(friends!)).toBe(
      '/?utm_source=referral&utm_medium=word-of-mouth&utm_campaign=friends',
    );
  });

  it('uses temporary redirects so a destination can change later', () => {
    for (const r of shortLinkRedirects()) expect(r.permanent).toBe(false);
  });

  it('has no duplicate short paths', () => {
    const paths = SHORT_LINKS.map((l) => l.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it.each(SHORT_LINKS.map((l) => [l.path, l]))('%s lands on a page analytics is allowed to count', (_p, link) => {
    expect(isPublicPath(link.page)).toBe(true);
  });

  it.each(SHORT_LINKS.map((l) => [l.path]))('%s does not shadow an existing page', (p) => {
    const base = path.join(__dirname, '../../pages', p);
    expect(fs.existsSync(`${base}.tsx`) || fs.existsSync(base)).toBe(false);
  });
});
