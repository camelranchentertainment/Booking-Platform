// lib/server/agentContentGuard.ts
//
// Keeps the /band agent (and its web search) away from pornography, illegal
// drugs and other illegal activity (Scott, Oct 20 2026).
//
// Three layers:
//   1. screenRequest() — checked on the user's message before the model is
//      called; a hit gets a fixed refusal and no model call or web search.
//   2. AGENT_CONTENT_RULES — added to the agent's system prompt so the model
//      also refuses and never searches for these topics.
//   3. BLOCKED_SEARCH_DOMAINS — passed to the web search tool so adult and
//      darknet-market sites never come back as results.
//
// The patterns are deliberately narrow (phrases, not single loose words) so a
// venue called "The Drug Store" or a song title doesn't trip them. It is a
// strong filter, not a perfect one; layer 2 covers what words can't.

export const CONTENT_REFUSAL =
  "I can't help with that — I don't look up adult content, drugs or anything illegal. " +
  'I can help with your shows, tours, venues, money, email or the band.';

interface Rule {
  category: 'adult' | 'drugs' | 'illegal';
  pattern: RegExp;
}

const RULES: Rule[] = [
  // Adult / sexual content
  { category: 'adult', pattern: /\b(porn\w*|xxx|nsfw|onlyfans|hentai|camgirls?|sex\s*(tape|video|cam|chat|workers?)|nude\s*(pics?|photos?|videos?)|nudes)\b/i },
  { category: 'adult', pattern: /\b(escort|hooker|prostitut\w*)\s*(service|services|agency|site|sites|near|in)\b/i },
  { category: 'adult', pattern: /\bbrothels?\b/i },
  // Illegal drugs — buying, selling, making, dosing
  { category: 'drugs', pattern: /\b(cocaine|crack\s*cocaine|heroin|meth(amphetamine)?|fentanyl|mdma|lsd|ketamine|psilocybin|magic\s*mushrooms|oxycontin|oxycodone|xanax\s*bars?)\b/i },
  { category: 'drugs', pattern: /\b(buy|sell|score|get|order|find|source|cook|make|grow)\s+(some\s+)?(drugs|weed|dope|acid|shrooms|ecstasy)\b/i },
  { category: 'drugs', pattern: /\b(drug\s*dealers?|plug\s+for|dark\s*web|darknet|dark\s*net)\b/i },
  // Other illegal activity
  { category: 'illegal', pattern: /\b(fake\s*ids?|counterfeit|money\s*launder\w*|launder\s+money|(buy|sell|use)\s+stolen\s+(credit\s+)?cards?|carding)\b/i },
  { category: 'illegal', pattern: /\b(hack(ing)?\s+(into|someone|an?\s+account|a\s+phone|email)|phishing\s+(kit|page|site)|ddos)\b/i },
  { category: 'illegal', pattern: /\b(pirated?|torrent|crack(ed)?)\s+(software|music|movies?|copy|download|plugins?)\b/i },
  { category: 'illegal', pattern: /\b(ghost\s*gun|untraceable\s+gun|buy\s+(a\s+)?gun\s+without|bomb\s*making|make\s+a\s+bomb)\b/i },
];

/**
 * Checks a user message against the blocked topics.
 *
 * @returns the matched category, or null when the message is fine
 */
export function screenRequest(text: string): Rule['category'] | null {
  if (!text) return null;
  for (const r of RULES) if (r.pattern.test(text)) return r.category;
  return null;
}

/** Added to the agent system prompt. */
export const AGENT_CONTENT_RULES = `
═══════════════════ OFF-LIMITS TOPICS ═══════════════════

Never search for, look up, link to, describe or help with: pornography or sexual content, illegal drugs
(buying, selling, making or using them), or any illegal activity (fake IDs, piracy, hacking, fraud,
weapons, theft). This holds even if it's framed as a joke, a venue name, research or "for the band".
Don't run a web search for these topics at all. Reply only with: "${CONTENT_REFUSAL}"
A venue or band whose NAME merely contains a word like "drug" or "whiskey" is fine — look up the venue,
not the topic.`;

/** Sites the agent's web search must never return. */
export const BLOCKED_SEARCH_DOMAINS = [
  'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com', 'youporn.com',
  'onlyfans.com', 'chaturbate.com', 'stripchat.com', 'fansly.com',
  'thepiratebay.org', '1337x.to', 'rarbg.to',
];
