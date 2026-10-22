// __tests__/lib/server/offerPdf.test.ts
// The offer PDF: it is a real PDF, long terms flow onto more pages, and
// characters the built-in fonts can't draw never stop it being made.

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { pdfSafe, renderOfferPdf, wrapText } from '../../../lib/server/offerPdf';
import type { BookerOffer } from '../../../lib/booker/offers';

const offer = (over: Partial<BookerOffer> = {}): BookerOffer => ({
  id: 'o1',
  booker_id: 'k',
  show_id: 's1',
  doc_number: 14,
  status: 'draft',
  kind: 'offer',
  template_id: null,
  band_name: 'Jake Stringer & Better Than Nothin’',
  venue_name: 'Cain’s Ballroom',
  venue_city: 'Tulsa',
  venue_state: 'OK',
  show_date: '2026-11-14',
  load_in_time: '17:00:00',
  door_time: '19:00:00',
  set_time: '21:00:00',
  set_length_min: 90,
  deal_type: 'guarantee',
  fee: 1500,
  deal_terms: null,
  deposit_amount: 500,
  deposit_due_on: '2026-11-01',
  hospitality: 'Dinner and drinks 🍺',
  terms: 'Standard terms.',
  buyer_name: 'Sarah Lee',
  buyer_email: 'sarah@cains.com',
  expires_on: '2026-10-28',
  sent_at: null,
  sent_to: null,
  message_id: null,
  responded_at: null,
  response_note: null,
  created_at: '',
  updated_at: '',
  deleted_at: null,
  ...over,
});
const agency = { agencyName: 'Ace Agency', contactName: 'Ann', contactEmail: 'ann@ace.com', contactPhone: null };

describe('pdfSafe', () => {
  it('keeps what Helvetica can draw and replaces the rest', () => {
    expect(pdfSafe('Café “quotes” — €5 · ok')).toBe('Café “quotes” — €5 · ok');
    expect(pdfSafe('Beer 🍺🍺 and 東京')).toBe('Beer ? and ?');
    expect(pdfSafe('a\r\nb\tc')).toBe('a\nb    c');
  });
});

describe('wrapText', () => {
  it('keeps every line within the width and breaks long words', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = wrapText(`Short line\n\n${'word '.repeat(60)}${'x'.repeat(200)}`, font, 10, 200);
    expect(lines[0]).toBe('Short line');
    expect(lines[1]).toBe('');
    for (const l of lines) expect(font.widthOfTextAtSize(l, 10)).toBeLessThanOrEqual(200);
    expect(lines.join('')).toContain('x'.repeat(20));
  });
});

describe('renderOfferPdf', () => {
  it('makes a one-page PDF with the title set', async () => {
    const bytes = await renderOfferPdf(offer(), agency);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe('Offer #14 - Jake Stringer & Better Than Nothin’ at Cain’s Ballroom');
    expect(doc.getAuthor()).toBe('Ace Agency');
  });

  it('flows long terms onto more pages, and draws deal memos with no stand-by date', async () => {
    const bytes = await renderOfferPdf(offer({ kind: 'deal_memo', expires_on: null, terms: 'Clause. '.repeat(1200) }), agency);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()?.startsWith('Deal memo #14')).toBe(true);
  });

  it('copes with an offer that has almost nothing filled in', async () => {
    const bytes = await renderOfferPdf(
      offer({ venue_city: null, venue_state: null, load_in_time: null, door_time: null, set_time: null, set_length_min: null, deal_type: null, fee: null, deposit_amount: null, deposit_due_on: null, hospitality: null, terms: null, buyer_name: null, buyer_email: null, expires_on: null }),
      { agencyName: 'A', contactName: null, contactEmail: null, contactPhone: null },
    );
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
