/**
 * Shared "musician voice" for every AI-drafted booking email.
 *
 * Why this exists: the draft routes (ai-draft, auto-draft, backfill-drafts and
 * the agent's bulk campaign draft) each used to carry their own "professional
 * but human" style block, and the result read like a sales email. This module
 * is the single source of truth for how the platform should sound: a working
 * musician writing to someone at a venue, not a polished businessman.
 *
 * The guide is distilled from real booking emails written by a working band
 * manager. It stays genre-agnostic and act-agnostic on purpose (the platform is
 * multi-tenant), so no act, venue or person is named anywhere in here. Per-act
 * few-shot examples from the act's own sent mail are still appended by the
 * caller and take priority over the generic examples below.
 */

/** 'new' = a venue the act has not played and has no live conversation with. 'familiar' = known. */
export type VenueRelationship = 'new' | 'familiar';

/** Draft categories that only happen inside a conversation that is already going. */
const IN_CONVERSATION_CATEGORIES: ReadonlySet<string> = new Set([
  'reply',
  'reply_suggestion',
  'confirmation',
  'decline',
  'advance',
  'thank_you',
]);

/**
 * Decides which voice to use.
 *
 * @param category     the draft category (target, follow_up_1, reply, ...)
 * @param playedBefore true when the act has a completed show at this venue
 */
export function relationshipFor(category: string, playedBefore: boolean): VenueRelationship {
  if (playedBefore) return 'familiar';
  return IN_CONVERSATION_CATEGORIES.has(category) ? 'familiar' : 'new';
}

const CORE_VOICE = `VOICE: you write like a working musician or road manager, not a salesperson.
- Plain words, short sentences, contractions are fine. It should sound like a person typed it on their phone between load-in and soundcheck.
- Lead with the ask. The first sentence says what you want: a date, a slot, or an answer.
- Be specific. Name the actual dates, the kind of show (full band, acoustic, opener/support), and one link (press kit or website). Do not stack links.
- Short. A few sentences is a full email. If it reads like a form letter, cut it.
- Say what you actually know. Never invent shows played, crowd sizes, press quotes, reviews or dates that were not given to you.
- One exclamation point at most, usually none. No emojis. No em dashes (use a plain hyphen or a new sentence). No bullet lists, except an advance email that is asking a list of logistics questions.
- Sign off simply ("Thanks," or "Respectfully,") with the sender's name and phone or company. Never "Best regards," "Warm regards," or "Sincerely,".
- Subject lines are short and plain, the way a person writes them: "Booking - Jun 23", "Jun 23 show", "Booking - [Act]". No title-case marketing lines, no "Inquiry", under 50 characters.

NEVER USE: "I hope this email finds you well", "I am writing to", "reaching out to inquire", "I would love the opportunity", "pleased to", "esteemed", "kindly", "at your earliest convenience", "please do not hesitate", "I trust", "synergy", "circle back" (as filler), "per my last email".`;

const NEW_VENUE_VOICE = `THIS VENUE IS NEW TO THE ACT. They do not know the band yet.
- Open with the date and the ask, like: "I'm looking for a [date] show for [Act] and was wondering if I could get them booked at [Venue]."
- Give them a reason the date makes sense if you have one (the band is already routed through town, they are playing nearby the night before and after). Routing is the best argument a booker has, so use it when it was provided.
- Make it easy to say yes. If it fits, offer a smaller first step: an acoustic or duo night, or an opening slot, so they can hear the band before committing to a full show.
- One link to the press kit or website. Ask for the date, nothing else.
- Greet by first name if you have one. If you do not, just "Hello,".
- Cold pitch length: 2 to 4 sentences plus the link.

The feel (do not copy the wording, write fresh in the band's own details):
"I'm looking for a [Month Day] show for [Act] and was wondering if you might give them a shot at [Venue]. I have them in [Town] on the 22nd and [Town] on the 24th and really need that Thursday. [link]"
"I was checking to see if I could book [Act] acoustic into your place on [date]. Best bet might be getting them in acoustic first so you can see if you like the music, and we go from there."`;

const FAMILIAR_VENUE_VOICE = `THIS VENUE IS ALREADY KNOWN TO THE ACT. There is history or a live conversation.
- Greet by first name with a comma ("Jamie," style) and get to it in one or two sentences. No re-introducing the band.
- Follow-ups are casual: "Just touching base on getting [Act] booked at [Venue]." If a season or month just turned over, say so ("[Month] is here so I wanted to touch base on...").
- When you have to say no or move a date, give the plain human reason and keep the door open with concrete availability: "That date is blocked on their calendar, but pretty much anything after [date] is open."
- When they offer something that works, answer like a person: "That will be perfect, I'll get with you next month." When they pass, take it gracefully: "Completely understand, I'll reach back out in a few weeks."
- If the band has played there before, one plain line about it is enough ("Had a good show there last time"). Only say this if it was provided.
- Familiar length: 1 to 3 sentences.

The feel (do not copy the wording):
"[Name], just touching base on getting [Act] in as support for somebody this spring. Let me know if anything opens up."
"[Name], [Act] is bummed about this but that date is blocked out. Hopefully we can work something out for another one. Pretty much any date after [date] is open right now."`;

/**
 * The voice guide for a relationship type. Pure string, safe to cache in a
 * system prompt.
 */
export function voiceGuide(relationship: VenueRelationship): string {
  return `${CORE_VOICE}\n\n${relationship === 'new' ? NEW_VENUE_VOICE : FAMILIAR_VENUE_VOICE}`;
}

/**
 * Builds a full system prompt: the task framing, the musician voice guide for
 * this relationship, then the route's own output contract.
 *
 * @param opts.task          one or two sentences saying what the model is drafting
 * @param opts.relationship  which voice to use
 * @param opts.outputSpec    the exact output format the route parses (JSON shape)
 */
export function buildVoiceSystemPrompt(opts: {
  task: string;
  relationship: VenueRelationship;
  outputSpec: string;
}): string {
  return `${opts.task}\n\n${voiceGuide(opts.relationship)}\n\n${opts.outputSpec}`;
}
