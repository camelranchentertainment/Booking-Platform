// lib/server/agentMoneyActions.ts
//
// The agent's money + post-show tools. The agent route is band-admin only
// (isBandAdminRole), so financial data here never reaches members.
//
//   buildMoneyContext   — read: per-show money, year totals, recent expenses
//   booking_wrapup      — attendance / rating / notes after a show
//   expense_update      — edit a logged expense
//   expense_archive     — archive (never delete) an expense
//
// Figures follow the platform rules in lib/domain/booking.ts:
//   Earned    = actual_amount_received on completed shows only
//   Potential = agreed_amount on confirmed future shows only
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { isEarned, isPotential, type BookingSummary } from '../domain/booking';
import { isInYear } from '../analyticsYear';

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const one = (v: unknown, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ── Read ────────────────────────────────────────────────────────────────────

interface MoneyBooking extends BookingSummary {
  id: string;
  deal_type: string | null;
  payment_status: string | null;
  date_paid: string | null;
  entry_type: string | null;
  venue: { name: string | null } | { name: string | null }[] | null;
}
interface ExpenseRow {
  id: string;
  expense_date: string;
  category: string;
  amount: number | string;
  status: string;
  notes: string | null;
  tour: { name: string | null } | { name: string | null }[] | null;
}

const joinedName = (v: { name: string | null } | { name: string | null }[] | null) =>
  (Array.isArray(v) ? v[0]?.name : v?.name) ?? '';

/**
 * Formats the money section of the agent's context. Exported for tests.
 */
export function formatMoneyContext(bookings: MoneyBooking[], expenses: ExpenseRow[], today: string): string {
  const year = Number(today.slice(0, 4));
  const shows = bookings.filter(b => b.entry_type !== 'travel');
  const lines: string[] = ['Money (band admins only — never share with members):'];

  for (const y of [year, year - 1]) {
    const inYear = shows.filter(b => isInYear(b.show_date, y));
    const earned = inYear.filter(isEarned).reduce((s, b) => s + (Number(b.actual_amount_received) || 0), 0);
    const potential = inYear.filter(b => isPotential(b, today)).reduce((s, b) => s + (Number(b.agreed_amount) || 0), 0);
    const ex = expenses.filter(e => isInYear(e.expense_date, y));
    const exConfirmed = ex.filter(e => e.status === 'confirmed').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const exProjected = ex.filter(e => e.status !== 'confirmed').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    lines.push(
      `  ${y}: earned ${money(earned)} (${inYear.filter(isEarned).length} completed shows) · ` +
      `potential ${money(potential)} (confirmed upcoming) · expenses ${money(exConfirmed)} confirmed + ${money(exProjected)} projected`,
    );
  }

  const withMoney = shows.filter(b => b.agreed_amount != null || b.actual_amount_received != null || b.payment_status);
  lines.push(`  Show money (${withMoney.length}):`);
  for (const b of withMoney.slice(0, 80)) {
    const parts = [
      b.agreed_amount != null ? `agreed ${money(Number(b.agreed_amount))}` : null,
      b.actual_amount_received != null ? `received ${money(Number(b.actual_amount_received))}` : null,
      b.payment_status ? `payment ${b.payment_status}` : null,
      b.deal_type ? `deal ${b.deal_type}` : null,
      b.date_paid ? `paid ${b.date_paid}` : null,
    ].filter(Boolean);
    lines.push(`    - id=${b.id} ${b.show_date ?? 'no date'} [${b.status}] ${one(joinedName(b.venue), 80) || 'TBD'}: ${parts.join(', ')}`);
  }

  lines.push(`  Expenses, newest first (${expenses.length} shown; archived ones are excluded):`);
  for (const e of expenses) {
    const tour = one(joinedName(e.tour), 60);
    lines.push(`    - expense_id=${e.id} ${e.expense_date} ${one(e.category, 40)} ${money(Number(e.amount) || 0)} [${e.status}]${tour ? ` tour: ${tour}` : ''}${e.notes ? ` — ${one(e.notes, 80)}` : ''}`);
  }
  return lines.join('\n');
}

/**
 * Loads the band's money picture for the agent. Fails soft.
 *
 * @param service service-role client — act filter is the only scoping
 */
export async function buildMoneyContext(service: SupabaseClient, actId: string, today: string): Promise<string> {
  try {
    const [bRes, eRes] = await Promise.all([
      service.from('bookings')
        .select('id, status, show_date, entry_type, deal_type, agreed_amount, actual_amount_received, payment_status, date_paid, venue:venues(name)')
        .eq('act_id', actId).neq('status', 'cancelled').order('show_date', { ascending: false }).limit(300),
      service.from('expenses')
        .select('id, expense_date, category, amount, status, notes, tour:tours(name)')
        .eq('act_id', actId).is('archived_at', null).order('expense_date', { ascending: false }).limit(60),
    ]);
    if (bRes.error || eRes.error) {
      console.error('[agent] money context load failed:', bRes.error?.message || eRes.error?.message);
      return 'Money: (could not be loaded right now — tell the user to check the Financials page)';
    }
    return formatMoneyContext((bRes.data ?? []) as unknown as MoneyBooking[], (eRes.data ?? []) as unknown as ExpenseRow[], today);
  } catch (err) {
    console.error('[agent] money context load threw:', err instanceof Error ? err.message : err);
    return 'Money: (could not be loaded right now — tell the user to check the Financials page)';
  }
}

// ── Show wrap-up ────────────────────────────────────────────────────────────

export const wrapupSchema = z.object({
  booking_id: z.string().uuid('Pick the show from your list'),
  attendance: z.number().int().min(0).max(1_000_000).optional(),
  rating: z.number().int().min(1, 'Rating is 1–5').max(5, 'Rating is 1–5').optional(),
  would_return: z.boolean().optional(),
  rebook_flag: z.enum(['yes', 'no', 'maybe']).optional(),
  venue_feedback: z.string().trim().max(2000).optional(),
  post_show_notes: z.string().trim().max(5000).optional(),
  mark_completed: z.boolean().optional(),
});
type WrapupArgs = z.infer<typeof wrapupSchema>;
const WRAPUP_FIELDS = ['attendance', 'rating', 'would_return', 'rebook_flag', 'venue_feedback', 'post_show_notes'] as const;

export interface WrapupPayload {
  booking_id: string;
  venue_name: string;
  show_date: string | null;
  fields: Partial<Pick<WrapupArgs, (typeof WRAPUP_FIELDS)[number]>>;
  mark_completed: boolean;
}

/**
 * Validates a post-show wrap-up for one of the band's past shows.
 *
 * @throws Error with a user-facing message
 */
export async function buildWrapupPayload(service: SupabaseClient, actId: string, raw: unknown, today: string): Promise<WrapupPayload> {
  const parsed = wrapupSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'That wrap-up is not valid.');
  const a = parsed.data;

  const { data: b, error } = await service
    .from('bookings')
    .select('id, status, show_date, entry_type, venue:venues(name)')
    .eq('id', a.booking_id).eq('act_id', actId).maybeSingle();
  if (error) throw new Error(`Show lookup failed: ${error.message}`);
  if (!b) throw new Error("That show wasn't found for this band.");
  const show = b as unknown as { status: string; show_date: string | null; entry_type: string | null; venue: MoneyBooking['venue'] };
  if (show.entry_type === 'travel') throw new Error("That's a travel day, not a show.");
  if (show.status === 'cancelled') throw new Error('That show was cancelled.');
  if (!show.show_date || show.show_date > today) throw new Error("That show hasn't happened yet — wrap-ups are for played shows.");

  const fields: WrapupPayload['fields'] = {};
  for (const k of WRAPUP_FIELDS) if (a[k] !== undefined) (fields as Record<string, unknown>)[k] = a[k];
  const markCompleted = a.mark_completed === true && show.status !== 'completed';
  if (Object.keys(fields).length === 0 && !markCompleted) throw new Error('Tell me at least one thing about the show (crowd, rating, notes…).');

  return { booking_id: a.booking_id, venue_name: joinedName(show.venue), show_date: show.show_date, fields, mark_completed: markCompleted };
}

/**
 * Applies an approved wrap-up: booking fields (+ completed status), and the
 * venue's rebook flag / issue notes like the post-gig form does.
 *
 * @throws Error when invalid or the write fails
 */
export async function executeWrapup(service: SupabaseClient, actId: string, payload: unknown) {
  const p = payload as Partial<WrapupPayload> | null;
  const checked = wrapupSchema.safeParse({ booking_id: p?.booking_id, ...(p?.fields ?? {}), mark_completed: p?.mark_completed });
  if (!checked.success) throw new Error('This wrap-up is no longer valid. Ask the assistant again.');
  const a = checked.data;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of WRAPUP_FIELDS) if (a[k] !== undefined) update[k] = a[k];
  if (a.mark_completed) update.status = 'completed';

  const { data: booking, error } = await service
    .from('bookings')
    .update(update)
    .eq('id', a.booking_id)
    .eq('act_id', actId)
    .neq('status', 'cancelled')
    .select('id, venue_id, status, show_date')
    .maybeSingle();
  if (error) throw new Error(`Could not save the wrap-up: ${error.message}`);
  if (!booking) throw new Error("That show wasn't found for this band.");

  const venueId = (booking as { venue_id: string | null }).venue_id;
  if (venueId && (a.rebook_flag !== undefined || a.venue_feedback)) {
    const { error: vErr } = await service
      .from('venues')
      .update({
        ...(a.rebook_flag !== undefined ? { rebook_flag: a.rebook_flag } : {}),
        ...(a.venue_feedback ? { issue_notes: a.venue_feedback } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', venueId)
      .eq('act_id', actId);
    if (vErr) throw new Error(`Show saved, but the venue's rebook note failed: ${vErr.message}`);
  }
  return booking;
}

// ── Expenses ────────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD');
export const expenseUpdateSchema = z.object({
  expense_id: z.string().uuid('Pick the expense from your list'),
  category: z.string().trim().min(1).max(80).optional(),
  amount: z.number().min(0, 'Amount can\'t be negative').max(10_000_000).optional(),
  expense_date: isoDate.optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(['potential', 'confirmed']).optional(),
});
const EXPENSE_FIELDS = ['category', 'amount', 'expense_date', 'notes', 'status'] as const;
type ExpenseField = (typeof EXPENSE_FIELDS)[number];

export interface ExpenseUpdatePayload {
  expense_id: string;
  label: string;
  changes: Partial<Record<ExpenseField, string | number | null>>;
  previous: Partial<Record<ExpenseField, string | number | null>>;
}
export interface ExpenseArchivePayload {
  expense_id: string;
  label: string;
}

async function loadExpense(service: SupabaseClient, actId: string, id: string) {
  const { data, error } = await service
    .from('expenses')
    .select('id, category, amount, expense_date, notes, status')
    .eq('id', id).eq('act_id', actId).is('archived_at', null).maybeSingle();
  if (error) throw new Error(`Expense lookup failed: ${error.message}`);
  if (!data) throw new Error("That expense wasn't found for this band (or it's already archived).");
  return data as Record<ExpenseField, string | number | null> & { id: string };
}

const expenseLabel = (e: { category?: unknown; amount?: unknown; expense_date?: unknown }) =>
  `${one(e.category, 40)} ${money(Number(e.amount) || 0)} on ${e.expense_date ?? '?'}`;

/**
 * Validates an expense edit (changed fields only) on one of the band's
 * active expenses.
 *
 * @throws Error with a user-facing message
 */
export async function buildExpenseUpdatePayload(service: SupabaseClient, actId: string, raw: unknown): Promise<ExpenseUpdatePayload> {
  const parsed = expenseUpdateSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'That expense change is not valid.');
  const current = await loadExpense(service, actId, parsed.data.expense_id);
  const changes: ExpenseUpdatePayload['changes'] = {};
  const previous: ExpenseUpdatePayload['previous'] = {};
  for (const k of EXPENSE_FIELDS) {
    const next = parsed.data[k];
    if (next === undefined) continue;
    const cur = k === 'amount' ? Number(current[k]) : current[k];
    if ((next ?? null) === (cur ?? null)) continue;
    changes[k] = next ?? null;
    previous[k] = cur ?? null;
  }
  if (Object.keys(changes).length === 0) throw new Error('Nothing would change on that expense.');
  return { expense_id: current.id, label: expenseLabel(current), changes, previous };
}

/** @throws Error when invalid or the write fails */
export async function executeExpenseUpdate(service: SupabaseClient, actId: string, payload: unknown) {
  const p = payload as Partial<ExpenseUpdatePayload> | null;
  const checked = expenseUpdateSchema.safeParse({ expense_id: p?.expense_id, ...(p?.changes ?? {}) });
  if (!checked.success) throw new Error('This expense change is no longer valid. Ask the assistant again.');
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EXPENSE_FIELDS) if (checked.data[k] !== undefined) update[k] = checked.data[k];
  const { data, error } = await service
    .from('expenses').update(update)
    .eq('id', checked.data.expense_id).eq('act_id', actId).is('archived_at', null)
    .select('id, category, amount, expense_date, status').maybeSingle();
  if (error) throw new Error(`Could not update the expense: ${error.message}`);
  if (!data) throw new Error("That expense wasn't found for this band (or it's already archived).");
  return data;
}

/**
 * Validates archiving one of the band's active expenses.
 *
 * @throws Error with a user-facing message
 */
export async function buildExpenseArchivePayload(service: SupabaseClient, actId: string, raw: unknown): Promise<ExpenseArchivePayload> {
  const parsed = z.object({ expense_id: z.string().uuid('Pick the expense from your list') }).safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Pick the expense from your list');
  const current = await loadExpense(service, actId, parsed.data.expense_id);
  return { expense_id: current.id, label: expenseLabel(current) };
}

/** Archives (never deletes) an approved expense. @throws Error when the write fails */
export async function executeExpenseArchive(service: SupabaseClient, actId: string, payload: unknown) {
  const id = (payload as Partial<ExpenseArchivePayload> | null)?.expense_id;
  if (!id || !z.string().uuid().safeParse(id).success) throw new Error('This archive request is no longer valid. Ask the assistant again.');
  const now = new Date().toISOString();
  const { data, error } = await service
    .from('expenses').update({ archived_at: now, updated_at: now })
    .eq('id', id).eq('act_id', actId).is('archived_at', null)
    .select('id, archived_at').maybeSingle();
  if (error) throw new Error(`Could not archive the expense: ${error.message}`);
  if (!data) throw new Error("That expense wasn't found for this band (or it's already archived).");
  return data;
}
