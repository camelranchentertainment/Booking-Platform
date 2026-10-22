// lib/server/offerPdf.ts
// Server-only: draws an offer or deal memo as a one-or-more page US Letter PDF
// with pdf-lib (pure JavaScript, no browser, runs on Vercel functions).
//
// Built-in Helvetica only, so nothing is fetched and the file stays small.
// Those fonts can only draw the Windows-1252 character set; anything else
// (emoji, other scripts) is replaced so a stray character can never stop the
// document from being made.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { DEAL_TYPE_LABEL, OFFER_KIND_LABEL, longDate, type BookerOffer } from '../booker/offers';
import { formatMoney, toAmount } from '../booker/commission';
import { formatTime } from '../booker/dates';

export interface OfferPdfAgency {
  agencyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

const PAGE = { width: 612, height: 792 }; // US Letter, points
const MARGIN = 54;
const ACCENT = rgb(0.91, 0.51, 0.23); // the platform's --orange #e8823a
const INK = rgb(0.09, 0.14, 0.25);
const MUTED = rgb(0.38, 0.43, 0.52);
const RULE = rgb(0.85, 0.87, 0.9);

// Characters Helvetica (WinAnsi) can draw beyond printable ASCII.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/** Replaces characters the built-in fonts can't draw, and normalises line endings. */
export function pdfSafe(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .split('')
    .map(ch => {
      const c = ch.charCodeAt(0);
      if (ch === '\n' || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch)) return ch;
      return '?';
    })
    .join('')
    .replace(/\?{2,}/g, '?');
}

/** Splits text into lines no wider than `width` at `size`, breaking long words if needed. */
export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of pdfSafe(text).split('\n')) {
    if (para.trim() === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      // A single word wider than the line: break it by characters.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

/** Draws top to bottom, adding pages as needed. */
class Writer {
  page: PDFPage;
  y: number;
  pageCount = 1;

  constructor(
    private readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    private readonly footer: string,
  ) {
    this.page = this.newPage();
    this.y = PAGE.height - MARGIN;
  }

  private newPage(): PDFPage {
    const page = this.doc.addPage([PAGE.width, PAGE.height]);
    page.drawText(pdfSafe(this.footer), { x: MARGIN, y: 30, size: 8, font: this.regular, color: MUTED });
    return page;
  }

  ensure(height: number): void {
    if (this.y - height >= MARGIN + 20) return;
    this.page = this.newPage();
    this.pageCount += 1;
    this.y = PAGE.height - MARGIN;
  }

  text(text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}): void {
    const size = opts.size ?? 10.5;
    const font = opts.bold ? this.bold : this.regular;
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? PAGE.width - MARGIN - x;
    const lineHeight = size * 1.4;
    for (const line of wrapText(text, font, size, width)) {
      this.ensure(lineHeight);
      if (line) this.page.drawText(line, { x, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= lineHeight;
    }
    this.y -= opts.gap ?? 0;
  }

  heading(label: string): void {
    this.ensure(34);
    this.y -= 10;
    this.page.drawText(pdfSafe(label.toUpperCase()), { x: MARGIN, y: this.y - 9, size: 9, font: this.bold, color: ACCENT });
    this.y -= 14;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE.width - MARGIN, y: this.y }, thickness: 0.75, color: RULE });
    this.y -= 8;
  }

  /** Label / value rows in two columns. Rows with no value are skipped. */
  rows(rows: [string, string | null | undefined][]): void {
    const labelWidth = 120;
    for (const [label, value] of rows) {
      if (!value) continue;
      const lines = wrapText(value, this.regular, 10.5, PAGE.width - MARGIN * 2 - labelWidth);
      this.ensure(lines.length * 14.7);
      this.page.drawText(pdfSafe(label), { x: MARGIN, y: this.y - 10, size: 9.5, font: this.bold, color: MUTED });
      for (const line of lines) {
        if (line) this.page.drawText(line, { x: MARGIN + labelWidth, y: this.y - 10.5, size: 10.5, font: this.regular, color: INK });
        this.y -= 14.7;
      }
      this.y -= 2;
    }
  }
}

const money = (v: number | string | null) => {
  const n = toAmount(v);
  return n === null ? null : formatMoney(n);
};

/**
 * Renders the offer to PDF bytes.
 *
 * @param offer  the saved offer (terms are printed exactly as stored)
 * @param agency who it is from, printed in the header and footer
 */
export async function renderOfferPdf(offer: BookerOffer, agency: OfferPdfAgency): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const title = `${OFFER_KIND_LABEL[offer.kind]} #${offer.doc_number}`;
  doc.setTitle(pdfSafe(`${title} - ${offer.band_name} at ${offer.venue_name}`));
  doc.setAuthor(pdfSafe(agency.agencyName));
  doc.setCreator('Camel Ranch Booking');
  doc.setProducer('Camel Ranch Booking');

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const contact = [agency.contactName, agency.contactEmail, agency.contactPhone].filter(Boolean).join(' · ');
  const w = new Writer(doc, regular, bold, `${agency.agencyName}${contact ? ` · ${contact}` : ''} · ${title}`);

  // Header
  w.text(agency.agencyName, { size: 11, bold: true, color: MUTED });
  w.text(title.toUpperCase(), { size: 24, bold: true, color: ACCENT, gap: 2 });
  w.text(`${offer.band_name} at ${offer.venue_name}`, { size: 15, bold: true });
  w.text(longDate(offer.show_date), { size: 12, color: MUTED, gap: 6 });

  w.heading('Engagement');
  w.rows([
    ['Artist', offer.band_name],
    ['Venue', offer.venue_name],
    ['Location', [offer.venue_city, offer.venue_state].filter(Boolean).join(', ')],
    ['Date', longDate(offer.show_date)],
    ['Load-in', formatTime(offer.load_in_time)],
    ['Doors', formatTime(offer.door_time)],
    ['Set time', formatTime(offer.set_time)],
    ['Set length', offer.set_length_min ? `${offer.set_length_min} minutes` : null],
  ]);

  w.heading('Deal');
  w.rows([
    ['Deal type', offer.deal_type ? DEAL_TYPE_LABEL[offer.deal_type] : 'To be agreed'],
    ['Fee', money(offer.fee)],
    ['Terms', offer.deal_terms],
    ['Deposit', money(offer.deposit_amount)],
    ['Deposit due', longDate(offer.deposit_due_on) || null],
    ['Balance', toAmount(offer.deposit_amount) !== null && toAmount(offer.fee) !== null ? money((toAmount(offer.fee) ?? 0) - (toAmount(offer.deposit_amount) ?? 0)) : null],
  ]);

  if (offer.hospitality) {
    w.heading('Hospitality');
    w.text(offer.hospitality);
  }
  if (offer.terms) {
    w.heading('Terms');
    w.text(offer.terms);
  }

  w.heading(offer.kind === 'deal_memo' ? 'Agreed between' : 'Prepared for');
  w.rows([
    ['Talent buyer', [offer.buyer_name, offer.buyer_email].filter(Boolean).join(' · ') || null],
    ['Agent', [agency.contactName, agency.agencyName].filter(Boolean).join(', ')],
    ['Agent contact', [agency.contactEmail, agency.contactPhone].filter(Boolean).join(' · ') || null],
    ['Stands until', offer.kind === 'offer' ? longDate(offer.expires_on) || null : null],
  ]);

  w.ensure(40);
  w.y -= 12;
  w.text(
    offer.kind === 'deal_memo'
      ? 'This memo records the terms agreed. Reply to the email it came with if anything here is not as agreed.'
      : 'To accept, reply to the email this offer came with. No signature is needed; the reply is the record.',
    { size: 9, color: MUTED },
  );

  return doc.save();
}
