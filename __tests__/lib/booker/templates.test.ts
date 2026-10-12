// __tests__/lib/booker/templates.test.ts
import { EMAIL_TEMPLATES, TEMPLATE_KEYS, firstName, hasPlaceholders, renderTemplate, templateByKey } from '../../../lib/booker/templates';
import { MessageSendSchema } from '../../../lib/booker/schemas';

const full = {
  band: 'The Jackwagons', date: 'Sat, Nov 14', venue: 'Gruene Hall', city: 'New Braunfels', contactFirst: 'Sarah',
  setTime: '9:00 PM', loadIn: '5:00 PM', fee: '$700.00', agentName: 'Pat Booker', agency: 'Lone Star Booking', agentPhone: '(512) 555-0100',
};

describe('EMAIL_TEMPLATES', () => {
  it('has unique keys and both audiences', () => {
    expect(new Set(TEMPLATE_KEYS).size).toBe(EMAIL_TEMPLATES.length);
    expect(EMAIL_TEMPLATES.some(t => t.audience === 'venue')).toBe(true);
    expect(EMAIL_TEMPLATES.some(t => t.audience === 'band')).toBe(true);
  });
  it('never hard-codes an act, venue or genre', () => {
    for (const t of EMAIL_TEMPLATES) expect(`${t.subject} ${t.body}`).not.toMatch(/country|americana|jackwagon|gruene/i);
  });
  it('stays in the plain booking voice', () => {
    for (const t of EMAIL_TEMPLATES) expect(t.body).not.toMatch(/hope this (email )?finds you|I am writing to|Best regards|at your earliest convenience/i);
  });
  it('every template renders with no leftover {fields} and within the subject limit', () => {
    for (const t of EMAIL_TEMPLATES) {
      const r = renderTemplate(t, full);
      expect(`${r.subject}${r.body}`).not.toMatch(/\{\w+\}/);
      expect(r.subject.length).toBeLessThanOrEqual(200);
    }
  });
});

describe('renderTemplate', () => {
  it('fills known values and signs as the agent', () => {
    const r = renderTemplate(templateByKey('confirm_show')!, full);
    expect(r.subject).toBe('Confirmed - The Jackwagons - Sat, Nov 14');
    expect(r.body).toContain('Sarah,');
    expect(r.body).toContain('Gruene Hall on Sat, Nov 14 for $700.00');
    expect(r.body).toMatch(/Thanks,\nPat Booker\nLone Star Booking\n\(512\) 555-0100$/);
  });
  it('leaves visible [prompts] for anything unknown and drops optional phrases', () => {
    const r = renderTemplate(templateByKey('confirm_show')!, { band: 'The Jackwagons' });
    expect(r.subject).toBe('Confirmed - The Jackwagons - [date]');
    expect(r.body).toContain('Hello,');
    expect(r.body).toContain('[venue] on [date].');
    expect(r.body).not.toContain(' for ');
    expect(r.body).toContain('[your name]');
    expect(hasPlaceholders(r.body)).toBe(true);
  });
});

describe('helpers', () => {
  it('firstName', () => {
    expect(firstName('Sarah Lee')).toBe('Sarah');
    expect(firstName('  ')).toBeNull();
    expect(firstName(null)).toBeNull();
  });
  it('hasPlaceholders spots short bracketed prompts only', () => {
    expect(hasPlaceholders('Book [date] please')).toBe(true);
    expect(hasPlaceholders('No brackets here')).toBe(false);
    expect(hasPlaceholders('[' + 'x'.repeat(60) + ']')).toBe(false);
  });
});

describe('MessageSendSchema template fields', () => {
  const base = { to_email: 'a@b.com', subject: 's', body: 'b' };
  it('accepts a known template key, blank means none, ai flag defaults off', () => {
    expect(MessageSendSchema.parse({ ...base, template_key: 'hold_request' })).toMatchObject({ template_key: 'hold_request', ai_assisted: false });
    expect(MessageSendSchema.parse({ ...base, template_key: '' }).template_key).toBeNull();
    expect(MessageSendSchema.parse({ ...base, ai_assisted: true }).ai_assisted).toBe(true);
  });
  it('rejects an unknown template key', () => {
    expect(MessageSendSchema.safeParse({ ...base, template_key: 'made_up' }).success).toBe(false);
  });
});
