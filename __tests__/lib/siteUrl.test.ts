// __tests__/lib/siteUrl.test.ts
// The sitemap and robots.txt must point at the canonical www host. The bare
// domain redirects, and Search Console won't index URLs that redirect.
import { readFileSync } from 'fs';
import { join } from 'path';
import { SITE_ORIGIN } from '../../lib/siteUrl';

const read = (f: string) => readFileSync(join(__dirname, '../../public', f), 'utf8');

describe('canonical site URLs', () => {
  it('every sitemap URL uses the www origin', () => {
    const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) expect(loc.startsWith(`${SITE_ORIGIN}/`)).toBe(true);
  });

  it('robots.txt points at the www sitemap', () => {
    expect(read('robots.txt')).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  });

  it('the share-preview image exists', () => {
    expect(() => readFileSync(join(__dirname, '../../public/images/og-banner.png'))).not.toThrow();
  });
});
