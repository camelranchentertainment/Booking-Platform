// lib/server/pdfText.ts
// Extracts plain text from a PDF on the server. Shared by the AI agent's file
// attachment (/api/parse-file) and the import wizard (/api/import/parse).
//
// pdf-parse v2 replaced v1's default-exported function with a PDFParse class.
// Both routes still called the v1 shape (`pdf(buffer)`), so every PDF failed
// with "is not a function". This wrapper uses the v2 API and keeps working if
// a v1 build is ever resolved.

import { AppError } from '../apiError';

/** Largest PDF accepted, in bytes. Vercel caps request bodies at 4.5 MB, and
 *  the agent route sends base64 (about 4/3 the size), so 3 MB is the real limit. */
export const MAX_PDF_BYTES = 3 * 1024 * 1024;

const PDF_MAGIC = Buffer.from('%PDF-');

/** True when the bytes start with the PDF signature (not just a .pdf name). */
export function looksLikePdf(buf: Buffer): boolean {
  return buf.length >= PDF_MAGIC.length && buf.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
}

type V2Module = { PDFParse: new (opts: { data: Uint8Array }) => { getText: () => Promise<{ text?: string }>; destroy?: () => Promise<void> } };
type V1Function = (buf: Buffer) => Promise<{ text?: string }>;

/**
 * Returns the PDF's text, trimmed.
 *
 * @param maxBytes upload limit for the calling route (default 3 MB, the base64 route's real limit)
 *
 * @throws AppError 400 when the file is not a PDF, is too large, is password-protected or unreadable
 * @throws AppError 422 when the PDF has no text layer (e.g. a scanned image)
 */
export async function extractPdfText(buf: Buffer, maxBytes: number = MAX_PDF_BYTES): Promise<string> {
  if (buf.length > maxBytes) throw new AppError(400, `That PDF is over ${Math.floor(maxBytes / (1024 * 1024))} MB. Try a smaller file, or export just the pages you need.`);
  if (!looksLikePdf(buf)) throw new AppError(400, "That file isn't a readable PDF.");

  // pdfjs (inside pdf-parse) touches DOMMatrix at load time; Node has none.
  (globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class DOMMatrix {};

  let text = '';
  try {
    const mod = (await import('pdf-parse')) as unknown as Partial<V2Module> & { default?: V1Function | Partial<V2Module> };
    const Ctor = mod.PDFParse ?? (typeof mod.default === 'object' ? mod.default?.PDFParse : undefined);
    if (Ctor) {
      const parser = new Ctor({ data: new Uint8Array(buf) });
      try {
        text = (await parser.getText()).text ?? '';
      } finally {
        await parser.destroy?.().catch(() => undefined);
      }
    } else if (typeof mod.default === 'function') {
      text = (await mod.default(buf)).text ?? '';
    } else {
      throw new Error('pdf-parse exports neither PDFParse nor a function');
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : 'unknown';
    console.error('[pdfText] could not parse PDF', { name, message: err instanceof Error ? err.message.slice(0, 200) : '' });
    if (name === 'PasswordException') throw new AppError(400, 'That PDF is password-protected. Remove the password and try again.');
    throw new AppError(400, "That PDF couldn't be read. Try saving it again as a PDF, or upload a CSV or Excel file instead.");
  }

  // Page separators pdf-parse v2 adds ("-- 1 of 3 --") carry no content.
  const clean = text.replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gm, '').trim();
  if (!clean) throw new AppError(422, "That PDF has no text to read. It's probably a scanned image. Try a PDF exported from Word, Excel or Google Docs, or upload a CSV.");
  return clean;
}
