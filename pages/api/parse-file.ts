import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../lib/supabase';
import * as pdfParseModule from 'pdf-parse';
const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;

// Increase body size limit for file uploads
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) return res.status(400).json({ error: 'base64 and mimeType required' });

  try {
    const buffer = Buffer.from(base64, 'base64');
    const parsed = await pdfParse(buffer);
    const text = parsed.text?.trim() || '';
    return res.status(200).json({ text });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to parse PDF' });
  }
}
