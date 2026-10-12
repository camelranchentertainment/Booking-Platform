// pages/api/parse-file.ts
// POST { base64, mimeType: 'application/pdf' } — returns the PDF's text so the
// AI agent can read an attached file. Signed-in users only.
//
//   200 { text }
//   400 not a PDF / too large / unreadable / password-protected
//   401 not signed in · 405 wrong method · 422 no text layer (scanned image)

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../lib/supabase';
import { AppError, withHandler } from '../../lib/apiError';
import { extractPdfText } from '../../lib/server/pdfText';

// Vercel caps request bodies at 4.5 MB; base64 of a 3 MB PDF fits under it.
export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } };

/** Extracts text from an uploaded PDF for the signed-in user. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    throw new AppError(405, 'Method not allowed');
  }
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw new AppError(401, 'Sign in again to attach files.');
  const { data } = await getServiceClient().auth.getUser(token);
  if (!data.user) throw new AppError(401, 'Sign in again to attach files.');

  const { base64, mimeType } = (req.body ?? {}) as { base64?: unknown; mimeType?: unknown };
  if (typeof base64 !== 'string' || !base64) throw new AppError(400, 'No file was received. Try attaching it again.');
  if (mimeType !== 'application/pdf') throw new AppError(400, 'Only PDF files are read here.');

  const text = await extractPdfText(Buffer.from(base64, 'base64'));
  res.status(200).json({ text });
}

export default withHandler(handler);
