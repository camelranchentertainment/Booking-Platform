// __tests__/lib/domain/tabularText.test.ts
import { detectDelimiter, parseTable } from '../../../lib/domain/tabularText';

describe('detectDelimiter', () => {
  it.each([
    ['Venue Name\tCity\tState', '\t'],
    ['Venue Name,City,State', ','],
    ['Venue Name;City;State', ';'],
    ['| Venue Name | City |', '|'],
    // A comma inside a quoted header cell doesn't count.
    ['"Name, full";City;State', ';'],
    // Tabs win a tie: a spreadsheet paste can carry commas inside cells.
    ['Venue\tCity, State', '\t'],
  ])('%p → %p', (header, expected) => expect(detectDelimiter(header)).toBe(expected));
});

describe('parseTable', () => {
  it('reads a paste from Excel or Google Sheets (tab-separated)', () => {
    expect(parseTable('Venue Name\tCity\tState\nGruene Hall\tNew Braunfels\tTX\n')).toEqual([
      ['Venue Name', 'City', 'State'],
      ['Gruene Hall', 'New Braunfels', 'TX'],
    ]);
  });

  it('keeps a quoted comma inside one cell', () => {
    expect(parseTable('Venue,Address,City\nGruene Hall,"1281 Gruene Rd, Suite 1",New Braunfels')[1])
      .toEqual(['Gruene Hall', '1281 Gruene Rd, Suite 1', 'New Braunfels']);
  });

  it('reads escaped quotes and a quoted cell that spans lines', () => {
    expect(parseTable('Venue,Notes\n"The ""Pit""","line one\nline two"\n')[1])
      .toEqual(['The "Pit"', 'line one\nline two']);
  });

  it('handles Windows line endings, a byte-order mark and blank lines', () => {
    expect(parseTable('﻿Venue,City\r\n\r\nA,Austin\r\n')).toEqual([['Venue', 'City'], ['A', 'Austin']]);
  });

  it('reads semicolon CSV', () => {
    expect(parseTable('Venue;City\nA;Austin')).toEqual([['Venue', 'City'], ['A', 'Austin']]);
  });

  it('reads a markdown table and drops the separator row', () => {
    expect(parseTable('| Venue | City |\n|---|:---:|\n| A | Austin |')).toEqual([['Venue', 'City'], ['A', 'Austin']]);
  });

  it('returns nothing for blank input', () => {
    expect(parseTable('  \n ')).toEqual([]);
  });
});
