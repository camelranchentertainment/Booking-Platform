import fs from 'fs';
import path from 'path';

/**
 * Guards the phone layout of the member Pay table. A five-column table does
 * not fit a phone, and scrolling it sideways hid the Pay column, so on narrow
 * screens each show is stacked into a card. Printing must keep the real table.
 */
describe('member pay table on phones', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../styles/member.module.css'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '../../pages/member/pay.tsx'), 'utf8');

  const phoneBlock = (() => {
    const start = css.indexOf('@media screen and (max-width: 560px) {\n  .tableWrap');
    expect(start).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf('\n}', start));
  })();

  it('stacks each show into a card on screens 560px and narrower', () => {
    expect(phoneBlock).toMatch(/\.table \.lineRow\s*\{[^}]*display:\s*grid/);
    expect(phoneBlock).toMatch(/grid-area:\s*pay/);
    expect(phoneBlock).toMatch(/\.table\s*\{\s*min-width:\s*0;/);
  });

  it('applies to screens only, so the printed statement keeps the table', () => {
    expect(css).not.toMatch(/@media \(max-width: 560px\) \{\s*\.tableWrap/);
  });

  it('keeps table semantics for screen readers once the rows are restyled', () => {
    expect(page).toContain('role="table"');
    expect(page).toMatch(/role="row" className=\{styles\.lineRow\}/);
    expect(page.match(/role="cell"/g)?.length).toBeGreaterThanOrEqual(5);
  });
});
