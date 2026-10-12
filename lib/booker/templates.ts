// lib/booker/templates.ts
// Starter email templates for the Booking Agent workspace. Written in the same
// plain "working booker" voice as lib/emailVoice.ts: lead with the ask, short,
// no sales language. Genre- and act-agnostic: every specific comes from the
// agent's own data at render time.
//
// Anything the workspace does not know is left as a [bracketed] prompt so the
// agent can see exactly what to fill in before sending.

export type TemplateAudience = 'venue' | 'band';

export interface EmailTemplate {
  key: string;
  label: string;
  /** Who it is written to; the dialog offers the matching set first. */
  audience: TemplateAudience;
  subject: string;
  body: string;
}

/** Values a template can use. All optional; missing ones render as [prompts]. */
export interface TemplateContext {
  band?: string | null;
  /** Show date, already formatted for reading ("Sat, Nov 14") */
  date?: string | null;
  venue?: string | null;
  city?: string | null;
  contactFirst?: string | null;
  setTime?: string | null;
  loadIn?: string | null;
  fee?: string | null;
  agentName?: string | null;
  agency?: string | null;
  agentPhone?: string | null;
}

export const EMAIL_TEMPLATES: readonly EmailTemplate[] = [
  {
    key: 'booking_inquiry',
    label: 'Booking inquiry (new venue)',
    audience: 'venue',
    subject: 'Booking - {band} - {date}',
    body:
      '{greeting}\n\nI\'m looking for a {date} show for {band} and was wondering if I could get them booked at {venue}. [Why the date works, e.g. "They\'re already routed through {city} that weekend."]\n\nHappy to send their press kit and a couple of live videos.\n\n{signoff}',
  },
  {
    key: 'hold_request',
    label: 'Ask for a hold',
    audience: 'venue',
    subject: 'Hold - {date} - {band}',
    body: '{greeting}\n\nCould you put a hold on {date} for {band}? I\'m working out the rest of the routing and should be able to confirm within [a week].\n\n{signoff}',
  },
  {
    key: 'confirm_show',
    label: 'Confirm the show',
    audience: 'venue',
    subject: 'Confirmed - {band} - {date}',
    body:
      '{greeting}\n\nGlad to lock this in. Confirming {band} at {venue} on {date}{fee_line}.\n\nSend over anything you need from us (W-9, stage plot, input list) and I\'ll get it to you.\n\n{signoff}',
  },
  {
    key: 'follow_up',
    label: 'Follow up',
    audience: 'venue',
    subject: 'Re: {band} - {date}',
    body: '{greeting}\n\nJust touching base on getting {band} booked at {venue} on {date}. Let me know if that date still works or if something else is open.\n\n{signoff}',
  },
  {
    key: 'advance',
    label: 'Advance (show details)',
    audience: 'venue',
    subject: 'Advance - {band} - {date}',
    body:
      '{greeting}\n\nAdvancing {band} for {date}. A few things so the night goes smooth:\n\n- Load-in time{load_in_known}\n- Set time and length{set_time_known}\n- Sound: house engineer, or should they bring their own?\n- Parking for the trailer\n- Settlement: who and when\n\n{signoff}',
  },
  {
    key: 'thank_you',
    label: 'Thank you after the show',
    audience: 'venue',
    subject: 'Thanks - {band} - {date}',
    body: '{greeting}\n\nThanks for having {band} on {date}. They had a great time. Would love to get them back in. Let me know what dates you\'re looking at.\n\n{signoff}',
  },
  {
    key: 'band_show_confirmed',
    label: 'Tell the band: show confirmed',
    audience: 'band',
    subject: 'Confirmed: {venue} - {date}',
    body:
      '{greeting}\n\nYou\'re confirmed at {venue}{city_line} on {date}{fee_line}.\n\nSet time: {set_time}\nLoad-in: {load_in}\n\nI\'ll send the full advance once the venue gets back to me.\n\n{signoff}',
  },
  {
    key: 'band_availability',
    label: 'Ask the band for availability',
    audience: 'band',
    subject: 'Availability check - [month]',
    body: '{greeting}\n\nI\'m working on dates for [month]. Can you send me any dates you can\'t play, and let me know if you\'d take an acoustic or opening slot?\n\n{signoff}',
  },
];

export const TEMPLATE_KEYS = EMAIL_TEMPLATES.map(t => t.key) as [string, ...string[]];

export function templateByKey(key: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find(t => t.key === key);
}

/** First word of a name, for greetings. */
export function firstName(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first ? first : null;
}

function present(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Fills a template. Known values are substituted; unknown ones become a
 * visible [prompt] (e.g. "[date]") so nothing half-filled goes out unnoticed.
 */
export function renderTemplate(tpl: Pick<EmailTemplate, 'subject' | 'body'>, ctx: TemplateContext): { subject: string; body: string } {
  const p = (v: string | null | undefined, prompt: string) => (present(v) ? v.trim() : `[${prompt}]`);
  const signer = [ctx.agentName, ctx.agency].filter(present).join('\n');
  const signoff = `Thanks,\n${signer || '[your name]'}${present(ctx.agentPhone) ? `\n${ctx.agentPhone}` : ''}`;
  const values: Record<string, string> = {
    band: p(ctx.band, 'band'),
    date: p(ctx.date, 'date'),
    venue: p(ctx.venue, 'venue'),
    city: p(ctx.city, 'city'),
    set_time: p(ctx.setTime, 'set time'),
    load_in: p(ctx.loadIn, 'load-in time'),
    greeting: present(ctx.contactFirst) ? `${ctx.contactFirst},` : 'Hello,',
    signoff,
    fee_line: present(ctx.fee) ? ` for ${ctx.fee}` : '',
    city_line: present(ctx.city) ? ` in ${ctx.city}` : '',
    set_time_known: present(ctx.setTime) ? ` (I have ${ctx.setTime})` : '',
    load_in_known: present(ctx.loadIn) ? ` (I have ${ctx.loadIn})` : '',
  };
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m));
  return { subject: fill(tpl.subject).slice(0, 200), body: fill(tpl.body) };
}

/** True when the text still has [prompts] the agent should fill in. */
export function hasPlaceholders(text: string): boolean {
  return /\[[^\]\n]{1,40}\]/.test(text);
}
