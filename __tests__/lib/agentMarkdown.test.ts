// __tests__/lib/agentMarkdown.test.ts
import {
  MAX_MARKDOWN_CHARS,
  inlineText,
  parseAgentMarkdown,
  parseInline,
  safeHref,
  trimUrlTail,
  type MdBlock,
  type MdList,
} from '../../lib/agent/agentMarkdown';

const only = (blocks: MdBlock[]): MdBlock => {
  expect(blocks).toHaveLength(1);
  return blocks[0];
};

describe('safeHref', () => {
  it('allows http, https and mailto', () => {
    expect(safeHref('https://wireroad.beer/booking')).toBe('https://wireroad.beer/booking');
    expect(safeHref('http://example.com')).toBe('http://example.com/');
    expect(safeHref('mailto:booking@x.com')).toBe('mailto:booking@x.com');
  });

  it('blocks script, data and relative targets', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref(' JavaScript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHref('vbscript:msgbox(1)')).toBeNull();
    expect(safeHref('/band/settings')).toBeNull();
    expect(safeHref('')).toBeNull();
  });
});

describe('trimUrlTail', () => {
  it('leaves sentence punctuation outside the link', () => {
    expect(trimUrlTail('https://x.com/a.')).toEqual({ url: 'https://x.com/a', tail: '.' });
    expect(trimUrlTail('https://x.com/a),')).toEqual({ url: 'https://x.com/a', tail: '),' });
  });

  it('keeps balanced parentheses that belong to the URL', () => {
    expect(trimUrlTail('https://en.wikipedia.org/wiki/Fly_(band)')).toEqual({
      url: 'https://en.wikipedia.org/wiki/Fly_(band)', tail: '',
    });
  });
});

describe('parseInline', () => {
  it('parses bold, italic and inline code', () => {
    expect(parseInline('Pays **$2,500** and *maybe* `id=abc`')).toEqual([
      { type: 'text', value: 'Pays ' },
      { type: 'strong', children: [{ type: 'text', value: '$2,500' }] },
      { type: 'text', value: ' and ' },
      { type: 'em', children: [{ type: 'text', value: 'maybe' }] },
      { type: 'text', value: ' ' },
      { type: 'code', value: 'id=abc' },
    ]);
  });

  it('never italicises ids with underscores', () => {
    expect(parseInline('use venue_id and booking_id here')).toEqual([
      { type: 'text', value: 'use venue_id and booking_id here' },
    ]);
  });

  it('does not treat spaced asterisks as emphasis', () => {
    expect(inlineText(parseInline('5 * 3 * 2'))).toBe('5 * 3 * 2');
    expect(parseInline('5 * 3 * 2')).toHaveLength(1);
  });

  it('turns markdown links and bare URLs into safe links', () => {
    const nodes = parseInline('See [their site](https://wireroad.beer) or https://wireroad.beer/events.');
    expect(nodes).toEqual([
      { type: 'text', value: 'See ' },
      { type: 'link', href: 'https://wireroad.beer/', children: [{ type: 'text', value: 'their site' }] },
      { type: 'text', value: ' or ' },
      { type: 'link', href: 'https://wireroad.beer/events', children: [{ type: 'text', value: 'https://wireroad.beer/events' }] },
      { type: 'text', value: '.' },
    ]);
  });

  it('shows an unsafe link as plain text instead of linking it', () => {
    expect(parseInline('[click](javascript:alert(1))')).toEqual([
      { type: 'text', value: '[click](javascript:alert(1))' },
    ]);
  });

  it('keeps raw HTML as text (React escapes it on render)', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([
      { type: 'text', value: '<img src=x onerror=alert(1)>' },
    ]);
  });

  it('turns single newlines into line breaks', () => {
    expect(parseInline('Thanks,\nScott')).toEqual([
      { type: 'text', value: 'Thanks,' },
      { type: 'break' },
      { type: 'text', value: 'Scott' },
    ]);
  });

  it('leaves unclosed markers as text', () => {
    expect(inlineText(parseInline('**not closed and `also not'))).toBe('**not closed and `also not');
  });

  it('nests bold inside a link label', () => {
    expect(parseInline('[**Wire Road**](https://wireroad.beer)')).toEqual([
      { type: 'link', href: 'https://wireroad.beer/', children: [{ type: 'strong', children: [{ type: 'text', value: 'Wire Road' }] }] },
    ]);
  });
});

describe('parseAgentMarkdown', () => {
  it('returns nothing for an empty reply', () => {
    expect(parseAgentMarkdown('')).toEqual([]);
  });

  it('keeps a plain sentence as one paragraph', () => {
    expect(parseAgentMarkdown('You have 3 shows next week.')).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: 'You have 3 shows next week.' }] },
    ]);
  });

  it('splits paragraphs on blank lines', () => {
    const blocks = parseAgentMarkdown('First.\n\nSecond.');
    expect(blocks.map(b => b.type)).toEqual(['paragraph', 'paragraph']);
  });

  it('parses headings, capping their size for the chat bubble', () => {
    const blocks = parseAgentMarkdown('# Big\n## Also big\n### Section\n#### Small');
    expect(blocks).toEqual([
      { type: 'heading', level: 1, children: [{ type: 'text', value: 'Big' }] },
      { type: 'heading', level: 1, children: [{ type: 'text', value: 'Also big' }] },
      { type: 'heading', level: 2, children: [{ type: 'text', value: 'Section' }] },
      { type: 'heading', level: 3, children: [{ type: 'text', value: 'Small' }] },
    ]);
  });

  it('parses a bullet list, including the • the sources footer uses', () => {
    const list = only(parseAgentMarkdown('- Wire Road\n* George’s\n• Sources line')) as MdList;
    expect(list.type).toBe('list');
    expect(list.ordered).toBe(false);
    expect(list.items.map(it => inlineText(it.children))).toEqual(['Wire Road', 'George’s', 'Sources line']);
  });

  it('keeps the starting number of an ordered list', () => {
    const list = only(parseAgentMarkdown('3. Third\n4. Fourth')) as MdList;
    expect(list).toMatchObject({ ordered: true, start: 3 });
    expect(list.items).toHaveLength(2);
  });

  it('nests indented items under the item above', () => {
    const list = only(parseAgentMarkdown('1. Fall run\n   - Oct 3 Tulsa\n   - Oct 4 OKC\n2. Spring run')) as MdList;
    expect(list.items).toHaveLength(2);
    expect(list.items[0].sublists).toHaveLength(1);
    expect(list.items[0].sublists[0].items.map(it => inlineText(it.children))).toEqual(['Oct 3 Tulsa', 'Oct 4 OKC']);
    expect(list.items[1].sublists).toHaveLength(0);
  });

  it('starts a new list when bullets switch to numbers at the top level', () => {
    const blocks = parseAgentMarkdown('1. Step one\n- a note');
    expect(blocks).toHaveLength(2);
    expect((blocks[0] as MdList).ordered).toBe(true);
    expect((blocks[1] as MdList).ordered).toBe(false);
  });

  it('keeps a list together across blank lines between items', () => {
    const list = only(parseAgentMarkdown('- One\n\n- Two\n\n- Three')) as MdList;
    expect(list.items).toHaveLength(3);
  });

  it('joins an indented continuation line to its item', () => {
    const list = only(parseAgentMarkdown('- Wire Road, Fayetteville\n  booking@wireroad.beer')) as MdList;
    expect(inlineText(list.items[0].children)).toBe('Wire Road, Fayetteville\nbooking@wireroad.beer');
  });

  it('ends a paragraph where a list starts without a blank line', () => {
    const blocks = parseAgentMarkdown('Here is what is on deck:\n- Tulsa\n- OKC');
    expect(blocks.map(b => b.type)).toEqual(['paragraph', 'list']);
  });

  it('parses a table and pads short rows to the header width', () => {
    const table = only(parseAgentMarkdown('| Date | Venue | Pay |\n|---|:---:|---:|\n| Oct 3 | Wire Road | **$800** |\n| Oct 4 | George’s |'));
    expect(table.type).toBe('table');
    if (table.type !== 'table') return;
    expect(table.align).toEqual([null, 'center', 'right']);
    expect(table.head.map(inlineText)).toEqual(['Date', 'Venue', 'Pay']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1].map(inlineText)).toEqual(['Oct 4', 'George’s', '']);
    expect(table.rows[0][2]).toEqual([{ type: 'strong', children: [{ type: 'text', value: '$800' }] }]);
  });

  it('honours escaped pipes inside table cells', () => {
    const table = only(parseAgentMarkdown('| A | B |\n|---|---|\n| x \\| y | z |'));
    if (table.type !== 'table') throw new Error('expected a table');
    expect(table.rows[0].map(inlineText)).toEqual(['x | y', 'z']);
  });

  it('does not mistake a sentence with a pipe for a table', () => {
    expect(only(parseAgentMarkdown('Tulsa | OKC are both open')).type).toBe('paragraph');
  });

  it('keeps fenced code literal', () => {
    expect(parseAgentMarkdown('```\n**not bold**\n- not a list\n```')).toEqual([
      { type: 'code_block', value: '**not bold**\n- not a list' },
    ]);
  });

  it('survives an unclosed code fence', () => {
    expect(parseAgentMarkdown('```\nhalf a block')).toEqual([{ type: 'code_block', value: 'half a block' }]);
  });

  it('parses horizontal rules, including spaced ones', () => {
    expect(parseAgentMarkdown('---').map(b => b.type)).toEqual(['rule']);
    expect(parseAgentMarkdown('- - -').map(b => b.type)).toEqual(['rule']);
  });

  it('parses block quotes, recursively', () => {
    const quote = only(parseAgentMarkdown('> Maxine wrote:\n> - Oct 3 works'));
    expect(quote.type).toBe('quote');
    if (quote.type !== 'quote') return;
    expect(quote.children.map(b => b.type)).toEqual(['paragraph', 'list']);
  });

  it('handles Windows line endings and tabs', () => {
    const blocks = parseAgentMarkdown('Line one\r\n\r\n- item\r\n\t- nested');
    expect(blocks.map(b => b.type)).toEqual(['paragraph', 'list']);
    expect((blocks[1] as MdList).items[0].sublists).toHaveLength(1);
  });

  it('renders an oversized reply as one plain paragraph', () => {
    const huge = '**x** '.repeat(MAX_MARKDOWN_CHARS);
    expect(parseAgentMarkdown(huge)).toEqual([{ type: 'paragraph', children: [{ type: 'text', value: huge }] }]);
  });

  it('parses a realistic reply with web sources', () => {
    const reply = [
      'Found it — **Wire Road Brewing** books through their site.',
      '',
      '### Details',
      '- Booking: booking@wireroad.beer',
      '- Capacity: **250**',
      '',
      'Sources:',
      '• Wire Road Brewing — https://wireroad.beer/booking',
    ].join('\n');
    expect(parseAgentMarkdown(reply).map(b => b.type)).toEqual(['paragraph', 'heading', 'list', 'paragraph', 'list']);
  });
});
