// __tests__/api/importParse.test.ts
// /api/import/parse: venue spreadsheets are read by column headers without the
// AI; PDFs and unrecognised sheets go to the (chunked) AI; duplicates are
// flagged against the band's saved venues.

import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = { create: mockCreate };
    static RateLimitError = class extends Error {};
    static APIError = class extends Error { error: unknown = null; };
  }
  return { __esModule: true, default: Anthropic };
});

let mockUpload: { filepath: string; originalFilename: string } | null = null;
let mockType = 'venues';
jest.mock('formidable', () => () => ({
  parse: async () => [{ type: [mockType] }, { file: mockUpload ? [mockUpload] : [] }],
}));

const mockExisting: Array<{ name: string; city: string }> = [];
jest.mock('../../lib/supabase', () => ({
  getServiceClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
    from: (table: string) => {
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.eq = () => c;
      c.single = async () => ({ data: { act_id: 'act-1', role: 'band_admin' }, error: null });
      c.then = (f: (v: unknown) => unknown) =>
        Promise.resolve({ data: table === 'venues' ? mockExisting : [], error: null }).then(f);
      return c;
    },
  }),
}));
jest.mock('../../lib/platformSettings', () => ({ getSetting: async () => 'test-key' }));
jest.mock('../../lib/server/pdfText', () => ({ extractPdfText: async () => 'The Blue Door, Oklahoma City, OK' }));

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/import/parse';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'import-parse-'));

function upload(name: string, content: Buffer | string) {
  const filepath = path.join(tmp, `${Date.now()}-${name}`);
  fs.writeFileSync(filepath, content);
  mockUpload = { filepath, originalFilename: name };
}

async function call() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json, end: jest.fn() });
  const req = { method: 'POST', headers: { authorization: 'Bearer t' } } as unknown as NextApiRequest;
  await handler(req, { status, json } as unknown as NextApiResponse);
  return { code: status.mock.calls[0][0] as number, body: json.mock.calls[0]?.[0] };
}

beforeEach(() => {
  mockCreate.mockReset();
  mockExisting.length = 0;
  mockType = 'venues';
  mockUpload = null;
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('POST /api/import/parse — venues', () => {
  it('reads a CSV by its headers, without the AI, and flags venues the band already has', async () => {
    mockExisting.push({ name: 'Gruene Hall', city: 'New Braunfels' });
    upload('venues.csv', 'Venue,City,State,Booking Email\nGruene Hall,New Braunfels,TX,\n"Cheatham Street","San Marcos",Texas,book@cheatham.com\n');
    const { code, body } = await call();
    expect(code).toBe(200);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(body.data.venues).toEqual([
      expect.objectContaining({ name: 'Gruene Hall', city: 'New Braunfels', state: 'TX', _duplicate: true }),
      expect.objectContaining({ name: 'Cheatham Street', city: 'San Marcos', state: 'TX', email: 'book@cheatham.com', _duplicate: false }),
    ]);
  });

  it('reads every sheet of an Excel workbook', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Venue Name', 'City'], ['A', 'Austin'], ['B', 'Dallas']]), 'Texas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Venue Name', 'City'], ['C', 'Tulsa']]), 'Oklahoma');
    upload('venues.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
    const { code, body } = await call();
    expect(code).toBe(200);
    expect(body.data.venues.map((v: { name: string }) => v.name)).toEqual(['A', 'B', 'C']);
    expect(body.data.warnings).toContain('Read 2 of 2 sheets in this workbook.');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('sends a PDF to the AI and returns what it found', async () => {
    mockCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"venues":[{"name":"The Blue Door","city":"Oklahoma City","state":"Oklahoma"}],"warnings":[]}' }],
    });
    upload('list.pdf', '%PDF-1.4 fake');
    const { code, body } = await call();
    expect(code).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(body.data.venues[0]).toMatchObject({ name: 'The Blue Door', city: 'Oklahoma City', state: 'OK', _duplicate: false });
  });

  it('falls back to the AI when a sheet has no venue-name column', async () => {
    mockCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"venues":[{"name":"Mystery Club","city":"Austin","state":"TX"}]}' }],
    });
    upload('odd.csv', 'Spot,Where\nMystery Club,Austin TX\n');
    const { body } = await call();
    expect(mockCreate).toHaveBeenCalled();
    expect(body.data.venues[0]).toMatchObject({ name: 'Mystery Club' });
  });

  it('answers 422 in plain words when nothing is found', async () => {
    mockCreate.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"venues":[]}' }] });
    upload('empty.csv', 'Notes\nnothing here\n');
    const { code, body } = await call();
    expect(code).toBe(422);
    expect(body.error).toMatch(/No venues found/);
  });

  it('rejects an unsupported file type', async () => {
    upload('venues.docx', 'x');
    const { code } = await call();
    expect(code).toBe(400);
  });
});
