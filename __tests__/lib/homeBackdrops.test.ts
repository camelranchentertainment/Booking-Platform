// __tests__/lib/homeBackdrops.test.ts
import {
  HOME_BACKDROPS, BACKDROP_WIDTHS, backdropUrl, backdropSrcSet,
} from '../../lib/homeBackdrops';

describe('backdropUrl', () => {
  it('builds a sized, auto-format Unsplash CDN URL', () => {
    const url = new URL(backdropUrl('photo-1566699270403-3f7e3f340664', 960));
    expect(url.origin).toBe('https://images.unsplash.com');
    expect(url.pathname).toBe('/photo-1566699270403-3f7e3f340664');
    expect(url.searchParams.get('w')).toBe('960');
    expect(url.searchParams.get('auto')).toBe('format');
    expect(url.searchParams.get('fit')).toBe('crop');
  });

  it('rejects malformed ids so a typo cannot ship a broken or foreign URL', () => {
    expect(() => backdropUrl('not-a-photo', 640)).toThrow('Invalid Unsplash photo id');
    expect(() => backdropUrl('photo-123-abc/../evil', 640)).toThrow('Invalid Unsplash photo id');
  });

  it('rejects non-positive or fractional widths', () => {
    expect(() => backdropUrl('photo-1566699270403-3f7e3f340664', 0)).toThrow('Invalid backdrop width');
    expect(() => backdropUrl('photo-1566699270403-3f7e3f340664', 12.5)).toThrow('Invalid backdrop width');
  });
});

describe('backdropSrcSet', () => {
  it('lists one candidate per width with a matching descriptor', () => {
    const parts = backdropSrcSet('photo-1566699270403-3f7e3f340664').split(', ');
    expect(parts).toHaveLength(BACKDROP_WIDTHS.length);
    parts.forEach((part, i) => {
      const [url, descriptor] = part.split(' ');
      expect(descriptor).toBe(`${BACKDROP_WIDTHS[i]}w`);
      expect(new URL(url).searchParams.get('w')).toBe(String(BACKDROP_WIDTHS[i]));
    });
  });
});

describe('HOME_BACKDROPS', () => {
  const entries = Object.entries(HOME_BACKDROPS);

  it.each(entries)('%s has a valid id, credit and focus point', (_key, photo) => {
    expect(() => backdropUrl(photo.id, 640)).not.toThrow();
    expect(photo.photographer.trim()).not.toBe('');
    expect(photo.sourceUrl).toMatch(/^https:\/\/unsplash\.com\/photos\//);
    expect(photo.focus).toMatch(/^\d{1,3}% \d{1,3}%$/);
  });

  it('uses a different photo in every section', () => {
    const ids = entries.map(([, p]) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
