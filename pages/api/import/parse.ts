import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import * as XLSX from 'xlsx';
import * as pdfParseModule from 'pdf-parse';
const pdf = (pdfParseModule as any).default ?? pdfParseModule;
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';

export const config = { api: { bodyParser: false } };

const ALLOWED_EXTS = new Set(['csv', 'txt', 'xlsx', 'xls', 'pdf']);

const VENUE_PROMPT = (content: string) => `You are a data extraction assistant. Extract venue information from the following document and return it as JSON.

Document content:
${content}

Return ONLY a JSON object with this exact structure, no other text:
{
  "venues": [
    {
      "name": "venue name (required)",
      "city": "city or null",
      "state": "2-letter state code or null",
      "email": "email address or null",
      "phone": "phone number or null",
      "booking_contact": "contact person name or null",
      "website": "website URL or null",
      "capacity": "number or null",
      "notes": "any other relevant notes or null"
    }
  ],
  "total_found": 0,
  "warnings": []
}

Rules:
- Extract every venue you can find regardless of column names or format
- If a field is not present leave it as null
- Normalize state to 2-letter code (Missouri = MO, Texas = TX etc)
- Remove any duplicate venues
- Do not invent data that is not in the document`;

const SHOW_PROMPT = (content: string) => `You are a data extraction assistant. Extract show/booking information from the following document and return it as JSON.

Document content:
${content}

Return ONLY a JSON object with this exact structure, no other text:
{
  "shows": [
    {
      "show_date": "YYYY-MM-DD format (required)",
      "venue_name": "venue name or null",
      "city": "city or null",
      "state": "2-letter state code or null",
      "fee": "numeric amount only, no $ sign, or null",
      "deal_type": "flat_fee or door_split or percentage or tips or free or null",
      "set_time": "HH:MM format or null",
      "notes": "any other relevant info or null",
      "status": "confirmed or pending or cancelled"
    }
  ],
  "total_found": 0,
  "warnings": []
}

Rules:
- Extract every show you can find regardless of column names or format
- Dates must be in YYYY-MM-DD format
- If date format is ambiguous use MM/DD/YYYY interpretation
- Normalize state to 2-letter code
- Fee should be numeric only — strip $, commas etc
- If status is unclear assume confirmed
- Do not invent data that is not in the document`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await service
    .from('user_profiles')
    .select('act_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.act_id) return res.status(400).json({ error: 'No act linked to your account' });
  if (!['band_admin', 'superadmin'].includes(profile.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const form = formidable({ maxFileSize: 20 * 1024 * 1024 });
  let fields: formidable.Fields;
  let files: formidable.Files;
  try {
    [fields, files] = await form.parse(req);
  } catch (e: any) {
    return res.status(400).json({ error: 'Upload failed: ' + e.message });
  }

  const fileArr = files.file;
  const file = Array.isArray(fileArr) ? fileArr[0] : fileArr;
  const typeVal = fields.type;
  const importType = (Array.isArray(typeVal) ? typeVal[0] : typeVal) as string | undefined;

  if (!file) return res.status(400).json({ error: 'No file provided' });
  if (!importType || !['venues', 'shows'].includes(importType)) {
    return res.status(400).json({ error: 'Invalid import type. Use venues or shows.' });
  }

  const ext = (file.originalFilename ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTS.has(ext)) {
    return res.status(400).json({ error: 'Unsupported file type. Use CSV, Excel (.xlsx/.xls), or PDF.' });
  }

  let rawText = '';
  try {
    if (ext === 'pdf') {
      const buf = fs.readFileSync(file.filepath);
      const pdfData = await pdf(buf);
      rawText = pdfData.text;
    } else if (ext === 'xlsx' || ext === 'xls') {
      const buf = fs.readFileSync(file.filepath);
      const wb = XLSX.read(buf, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rawText = XLSX.utils.sheet_to_csv(ws);
    } else {
      rawText = fs.readFileSync(file.filepath, 'utf-8');
    }
  } catch (e: any) {
    return res.status(400).json({ error: 'Failed to read file: ' + e.message });
  } finally {
    try { fs.unlinkSync(file.filepath); } catch {}
  }

  if (!rawText.trim()) {
    return res.status(400).json({ error: 'File appears to be empty or unreadable' });
  }

  const truncated = rawText.slice(0, 12000);
  const prompt = importType === 'venues' ? VENUE_PROMPT(truncated) : SHOW_PROMPT(truncated);

  const anthropicKey = await getSetting('anthropic_api_key');
  if (!anthropicKey) {
    return res.status(500).json({ error: 'AI not configured — add your Anthropic API key in Settings.' });
  }

  let parsed: any;
  try {
    const client = new Anthropic({ apiKey: anthropicKey });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '{}';
    try {
      parsed = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
    } catch {
      return res.status(500).json({ error: 'AI could not structure the document. Please check the file format.' });
    }
  } catch (e: any) {
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'AI rate limited — try again shortly' });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ error: `AI error: ${e.message}` });
    return res.status(500).json({ error: 'AI parsing failed: ' + e.message });
  }

  // Mark duplicates so the review UI can highlight them
  if (importType === 'venues' && Array.isArray(parsed.venues)) {
    for (const v of parsed.venues) {
      if (!v.name) { v._duplicate = false; continue; }
      const { data: existing } = await service
        .from('venues')
        .select('id')
        .eq('act_id', profile.act_id)
        .ilike('name', v.name.trim())
        .maybeSingle();
      v._duplicate = !!existing;
    }
  }
  if (importType === 'shows' && Array.isArray(parsed.shows)) {
    for (const s of parsed.shows) {
      if (!s.show_date) { s._duplicate = false; continue; }
      const { data: existing } = await service
        .from('bookings')
        .select('id')
        .eq('act_id', profile.act_id)
        .eq('show_date', s.show_date)
        .maybeSingle();
      s._duplicate = !!existing;
    }
  }

  return res.status(200).json({ success: true, type: importType, data: parsed, actId: profile.act_id });
}
