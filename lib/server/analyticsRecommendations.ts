// lib/server/analyticsRecommendations.ts
//
// Turns a band's analytics report into a short prompt for the model and parses
// its answer. Kept separate from the route so both halves are unit-tested.

import { z } from 'zod';
import type { AnalyticsReport } from './analytics';

export const RecommendationSchema = z.object({
  title: z.string().trim().min(1).max(80),
  insight: z.string().trim().min(1).max(400),
  action: z.string().trim().min(1).max(300),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The compact facts the model sees — numbers only, no contact details or email text. */
export function summarizeForModel(r: AnalyticsReport, actName: string): string {
  const f = r.bookingFinancials;
  const lines = [
    `Band: ${actName || 'this band'} · Year: ${r.year}`,
    `Shows played: ${f.totalCompleted}; booked ahead: ${f.futureConfirmedCount}; earned: $${f.totalEarned}; potential: $${f.totalPotential}; avg per show: $${f.avgPay}`,
    `Would rebook: ${f.wouldReturnPct ?? 'n/a'}%`,
    `Outreach funnel: ${r.funnel.map(s => `${s.label} ${s.count}`).join(' → ')}`,
    `Venues emailed: ${r.emailPerformance.venuesEmailed}; wrote back: ${r.emailPerformance.venuesReplied} (${r.responseRate}%)`,
    `Emails per week (last 12): ${r.emailPerformance.weeks.map(w => w.sent).join(',')}`,
    `Shows by month: ${r.months.map(m => `${MONTHS[m.month]} ${m.played + m.upcoming}`).join(', ')}`,
    `Shows by state: ${r.states.slice(0, 8).map(s => `${s.state} ${s.shows}`).join(', ') || 'none'}`,
    `Pipeline by state (targets, replied): ${r.regionalPerformance.slice(0, 8).map(s => `${s.state} ${s.total}/${s.responded}`).join(', ') || 'none'}`,
    `Tours: ${r.tourStats.slice(0, 6).map(t => `${t.name ?? 'Tour'} [${t.status}] ${t.confirmed}/${t.total} booked`).join('; ') || 'none'}`,
    `Top venues by pay: ${r.topVenues.map(v => `${v.name} (${v.where}) $${v.earned}/${v.shows} shows`).join('; ') || 'none'}`,
  ];
  return lines.join('\n');
}

export const RECOMMENDATION_SYSTEM_PROMPT = [
  'You are a seasoned booking agent advising an independent touring band.',
  'Read their numbers and give 3 or 4 specific, practical recommendations to book more and better-paying shows.',
  'Ground every point in the numbers given; never invent venues, people or figures.',
  'Reply with ONLY a JSON array, no prose: [{"title": "...", "insight": "...", "action": "..."}].',
  'title: under 8 words. insight: one or two sentences on what the numbers show. action: one concrete next step.',
].join(' ');

/**
 * Pulls the recommendations out of the model's reply. Tolerates a code fence or
 * stray text around the array; drops malformed items; keeps at most 4.
 */
export function parseRecommendations(text: string): Recommendation[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: Recommendation[] = [];
  for (const item of raw) {
    const parsed = RecommendationSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
    if (out.length === 4) break;
  }
  return out;
}
