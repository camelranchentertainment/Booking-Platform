// __tests__/lib/pdfText.test.ts
// Regression: pdf-parse v2 exports a PDFParse class, not v1's default
// function, so the old `pdf(buffer)` call failed on every PDF with
// "is not a function". pdfjs needs real ESM workers that Jest cannot load, so
// the library is mocked here; parsing a real PDF was checked under Node.

const mockGetText = jest.fn();
const mockDestroy = jest.fn().mockResolvedValue(undefined);
const mockCtor = jest.fn();
jest.mock('pdf-parse', () => ({
  PDFParse: class {
    constructor(opts: unknown) {
      mockCtor(opts);
    }
    getText = mockGetText;
    destroy = mockDestroy;
  },
}));

import fs from 'fs';
import path from 'path';
import { extractPdfText, looksLikePdf } from '../../lib/server/pdfText';

const pdf = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'text.pdf'));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('extractPdfText', () => {
  it('uses the v2 PDFParse API and cleans up', async () => {
    mockGetText.mockResolvedValue({ text: 'Gruene Hall Oct 24\n\n-- 1 of 1 --\n' });
    await expect(extractPdfText(pdf)).resolves.toBe('Gruene Hall Oct 24');
    expect(mockCtor).toHaveBeenCalledWith({ data: expect.any(Uint8Array) });
    expect(mockDestroy).toHaveBeenCalled();
  });
  it('explains a PDF with no text layer (scanned image)', async () => {
    mockGetText.mockResolvedValue({ text: '\n-- 1 of 2 --\n\n-- 2 of 2 --\n' });
    await expect(extractPdfText(pdf)).rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/scanned image/) });
  });
  it('explains a password-protected PDF', async () => {
    mockGetText.mockRejectedValue(Object.assign(new Error('No password given'), { name: 'PasswordException' }));
    await expect(extractPdfText(pdf)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/password/) });
    expect(mockDestroy).toHaveBeenCalled();
  });
  it('reports any other parse failure plainly', async () => {
    mockGetText.mockRejectedValue(new Error('Invalid PDF structure'));
    await expect(extractPdfText(pdf)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/couldn't be read/) });
  });
  it('rejects a file that is not a PDF, whatever it is named, without parsing', async () => {
    await expect(extractPdfText(Buffer.from('name,date\nGruene Hall,2026-10-24'))).rejects.toMatchObject({ statusCode: 400 });
    expect(mockCtor).not.toHaveBeenCalled();
  });
  it('rejects a file over the limit before parsing', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(3 * 1024 * 1024)]);
    await expect(extractPdfText(big)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/over 3 MB/) });
    await expect(extractPdfText(pdf, 100)).rejects.toMatchObject({ statusCode: 400 });
    expect(mockCtor).not.toHaveBeenCalled();
  });
});

describe('looksLikePdf', () => {
  it('checks the signature, not the name', () => {
    expect(looksLikePdf(pdf)).toBe(true);
    expect(looksLikePdf(Buffer.from('PK\u0003\u0004'))).toBe(false);
    expect(looksLikePdf(Buffer.alloc(0))).toBe(false);
  });
});
