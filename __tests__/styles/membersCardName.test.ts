import fs from 'fs';
import path from 'path';

/**
 * Guards the Members roster cards: a long name next to the login badge used
 * to be cut off with an ellipsis ("Jesse "Hoss" Del..."). Names now wrap, and
 * the badge keeps its own width so it never squeezes or wraps itself.
 */
describe('Members card names', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../styles/members.module.css'), 'utf8');
  const rule = (selector: string) => {
    const m = css.match(new RegExp(`^\\${selector}\\s*\\{([^}]*)\\}`, 'm'));
    expect(m).not.toBeNull();
    return m![1];
  };

  it('wraps a long name instead of cutting it off', () => {
    const name = rule('.name');
    expect(name).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(name).not.toMatch(/white-space:\s*nowrap/);
    expect(name).toMatch(/overflow-wrap:\s*break-word/);
  });

  it('keeps the login badge from shrinking or wrapping', () => {
    const badge = rule('.badge');
    expect(badge).toMatch(/flex-shrink:\s*0/);
    expect(badge).toMatch(/white-space:\s*nowrap/);
  });
});
