// lib/domain/tabularText.ts
//
// Turns pasted or uploaded table text into rows of cells. Handles the formats
// people actually have a venue list in:
//   • copied from Excel or Google Sheets (tab-separated)
//   • CSV, including quoted cells that contain commas, quotes or line breaks
//   • semicolon-separated CSV (European Excel exports)
//   • markdown tables (what AI research prompts produce)
//
// Pure and unit-tested (__tests__/lib/domain/tabularText.test.ts).

export type Delimiter = '\t' | ',' | ';' | '|';

/** A markdown separator row such as `|---|:---:|`. */
const MD_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/**
 * Picks the delimiter from the first non-empty line (the header). Markdown
 * tables win when the line starts with a pipe; otherwise the most frequent of
 * tab, comma and semicolon outside quotes, preferring tab on a tie because a
 * spreadsheet paste can contain commas inside cells.
 */
export function detectDelimiter(text: string): Delimiter {
  const header = text.split(/\r?\n/).find(l => l.trim()) ?? '';
  if (header.trim().startsWith('|')) return '|';
  const counts: Record<'\t' | ',' | ';', number> = { '\t': 0, ',': 0, ';': 0 };
  let quoted = false;
  for (const ch of header) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\t' || ch === ',' || ch === ';')) counts[ch]++;
  }
  if (counts['\t'] > 0 && counts['\t'] >= counts[',']) return '\t';
  if (counts[';'] > counts[',']) return ';';
  return ',';
}

/** Splits one markdown table line into trimmed cells, dropping the outer pipes. */
function splitMarkdownLine(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map(c => c.trim());
}

/**
 * Parses delimited text (RFC 4180 quoting: `"a, b"` is one cell and `""` is a
 * literal quote; a quoted cell may span lines). Empty lines are dropped.
 */
function parseQuoted(text: string, delimiter: Exclude<Delimiter, '|'>): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const endCell = () => { row.push(cell.trim()); cell = ''; };
  const endRow = () => {
    endCell();
    if (row.some(c => c !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      cell = '';
      quoted = true;
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}

/**
 * Parses table text into rows of trimmed cells, header row first. Returns an
 * empty array for blank input.
 */
export function parseTable(text: string): string[][] {
  const body = text.replace(/^﻿/, '');
  if (!body.trim()) return [];
  const delimiter = detectDelimiter(body);
  if (delimiter === '|') {
    return body.split(/\r?\n/)
      .filter(l => l.trim() && !MD_SEPARATOR.test(l))
      .map(splitMarkdownLine);
  }
  return parseQuoted(body, delimiter);
}
