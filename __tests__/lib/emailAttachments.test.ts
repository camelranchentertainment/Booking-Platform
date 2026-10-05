// __tests__/lib/emailAttachments.test.ts
import { isOwnUploadPath, cleanFilename, resolveAttachments } from '../../lib/server/emailAttachments';
import { attachmentListSchema, safeStorageName, formatBytes, MAX_ATTACHMENTS } from '../../lib/emailAttachments';
import { buildMimeMessage, encodeHeaderWord, headerSafe } from '../../lib/gmailSend';
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('../../lib/gmailClient', () => ({ getGmailClient: jest.fn() }));

const ACT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('isOwnUploadPath', () => {
  it('accepts this band\'s email-attachments folder', () => {
    expect(isOwnUploadPath(`${ACT}/email-attachments/abc-rider.pdf`, ACT)).toBe(true);
  });
  it.each([
    [`${OTHER}/email-attachments/x.pdf`, 'another band'],
    [`${ACT}/contracts/x.pdf`, 'another folder'],
    [`${ACT}/email-attachments/../../${OTHER}/x.pdf`, 'traversal'],
    [`${ACT}/email-attachments/sub/x.pdf`, 'nested'],
    [`${ACT}\\email-attachments\\x.pdf`, 'backslashes'],
    ['', 'empty'],
  ])('rejects %s (%s)', path => {
    expect(isOwnUploadPath(path, ACT)).toBe(false);
  });
});

describe('cleanFilename / safeStorageName / formatBytes', () => {
  it('strips header-breaking characters', () => {
    expect(cleanFilename('rider"\r\nBcc: x@y.com.pdf')).toBe('rider Bcc: x@y.com.pdf');
  });
  it('makes storage-safe names', () => {
    expect(safeStorageName('Stage Plot (v2) — final.pdf')).toMatch(/^[\w.-]+$/);
  });
  it('formats sizes', () => {
    expect(formatBytes(1536)).toBe('2 KB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
    expect(formatBytes(0)).toBe('');
  });
});

describe('attachmentListSchema', () => {
  it('rejects more than the max number of files', () => {
    const many = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, i) => ({ source: 'upload', path: `p${i}`, name: `f${i}` }));
    expect(attachmentListSchema.safeParse(many).success).toBe(false);
  });
  it('rejects unknown sources', () => {
    expect(attachmentListSchema.safeParse([{ source: 'url', url: 'http://x' }]).success).toBe(false);
  });
});

function serviceWith(opts: { libraryRow?: Record<string, unknown> | null; bytes?: number; downloadError?: boolean }) {
  const filters: Array<[string, unknown]> = [];
  const chain: any = {
    select: () => chain,
    eq: (col: string, val: unknown) => { filters.push([col, val]); return chain; },
    maybeSingle: () => Promise.resolve({ data: opts.libraryRow ?? null, error: null }),
  };
  const download = jest.fn(() => Promise.resolve(
    opts.downloadError
      ? { data: null, error: { message: 'not found' } }
      : { data: { type: 'application/pdf', arrayBuffer: async () => new Uint8Array(opts.bytes ?? 10).buffer }, error: null },
  ));
  const from = jest.fn(() => ({ download }));
  const service = { from: jest.fn(() => chain), storage: { from } } as unknown as SupabaseClient;
  return { service, filters, storageFrom: from, download };
}

describe('resolveAttachments', () => {
  it('looks library files up scoped to the caller\'s act and routes documents to band-documents', async () => {
    const { service, filters, storageFrom } = serviceWith({
      libraryRow: { storage_path: `${ACT}/docs/rider.pdf`, mime_type: 'application/pdf', document_category: 'technical_rider', act_id: ACT },
    });
    const out = await resolveAttachments(service, ACT, [{ source: 'library', id: '33333333-3333-4333-8333-333333333333', name: 'rider.pdf' }]);
    expect(filters).toContainEqual(['act_id', ACT]);
    expect(storageFrom).toHaveBeenCalledWith('band-documents');
    expect(out[0]).toMatchObject({ filename: 'rider.pdf', contentType: 'application/pdf' });
  });

  it('rejects a library id that belongs to another band', async () => {
    const { service } = serviceWith({ libraryRow: null });
    await expect(resolveAttachments(service, ACT, [{ source: 'library', id: '33333333-3333-4333-8333-333333333333', name: 'x.pdf' }]))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an upload path outside the band\'s folder without downloading it', async () => {
    const { service, download } = serviceWith({});
    await expect(resolveAttachments(service, ACT, [{ source: 'upload', path: `${OTHER}/email-attachments/x.pdf`, name: 'x.pdf' }]))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(download).not.toHaveBeenCalled();
  });

  it('rejects a file over 10 MB', async () => {
    const { service } = serviceWith({ bytes: 10 * 1024 * 1024 + 1 });
    await expect(resolveAttachments(service, ACT, [{ source: 'upload', path: `${ACT}/email-attachments/big.pdf`, name: 'big.pdf' }]))
      .rejects.toThrow(/larger than 10 MB/);
  });

  it('rejects when files add up to more than 15 MB', async () => {
    const { service } = serviceWith({ bytes: 8 * 1024 * 1024 });
    const ref = (n: number) => ({ source: 'upload' as const, path: `${ACT}/email-attachments/f${n}.pdf`, name: `f${n}.pdf` });
    await expect(resolveAttachments(service, ACT, [ref(1), ref(2)])).rejects.toThrow(/more than 15 MB/);
  });

  it('reports a missing file clearly', async () => {
    const { service } = serviceWith({ downloadError: true });
    await expect(resolveAttachments(service, ACT, [{ source: 'upload', path: `${ACT}/email-attachments/gone.pdf`, name: 'gone.pdf' }]))
      .rejects.toThrow(/could not be found/);
  });
});

describe('buildMimeMessage', () => {
  const decodeParts = (msg: string) => msg;

  it('without attachments is a single base64 HTML part', () => {
    const msg = buildMimeMessage({ from: 'band@x.com', to: 'v@y.com', subject: 'Hi', html: '<p>Hello</p>' });
    expect(msg).toContain('Content-Type: text/html; charset=utf-8');
    expect(msg).not.toContain('multipart/mixed');
    expect(msg).toContain(Buffer.from('<p>Hello</p>').toString('base64'));
  });

  it('with attachments is multipart/mixed with one part per file', () => {
    const msg = decodeParts(buildMimeMessage({
      from: 'band@x.com', to: 'v@y.com', subject: 'Rider', html: '<p>See attached</p>', boundary: 'B',
      attachments: [
        { filename: 'rider.pdf', contentType: 'application/pdf', content: Buffer.from('PDFDATA') },
        { filename: 'plot.png', contentType: 'image/png', content: Buffer.from('PNG') },
      ],
    }));
    expect(msg).toContain('Content-Type: multipart/mixed; boundary="B"');
    expect(msg.match(/--B\r\n/g)).toHaveLength(3);
    expect(msg).toContain('Content-Disposition: attachment; filename="rider.pdf"');
    expect(msg).toContain(Buffer.from('PDFDATA').toString('base64'));
    expect(msg.trimEnd().endsWith('--B--')).toBe(true);
  });

  it('cannot be header-injected through the recipient or subject', () => {
    const msg = buildMimeMessage({ from: 'band@x.com', to: 'v@y.com\r\nBcc: spy@z.com', subject: 'Hi\r\nBcc: spy@z.com', html: 'x' });
    expect(msg).not.toMatch(/\r\nBcc:/);
  });

  it('encodes non-ASCII subjects', () => {
    expect(encodeHeaderWord('Café — fall dates')).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
    expect(encodeHeaderWord('Plain subject')).toBe('Plain subject');
    expect(headerSafe('a\r\nb')).toBe('a b');
  });
});
