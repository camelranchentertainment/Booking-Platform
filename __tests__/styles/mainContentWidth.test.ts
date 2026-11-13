import fs from 'fs';
import path from 'path';

/**
 * Guards the desktop layout fix: without min-width: 0 on .main-content (a
 * flex item), wide page content such as the Bookings board stretches the
 * page past the window and pushes buttons off-screen.
 */
describe('.main-content width', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../styles/globals.css'), 'utf8');

  it('lets the desktop page shrink to the window width', () => {
    const rule = css.match(/^\.main-content\s*\{([^}]*)\}/m);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/min-width:\s*0\s*;/);
  });
});
