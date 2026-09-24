import { z } from 'zod';

export const BATCH_CAP = 4;

// ── Zod schema for stage_items items sent by the model ──────────────────────
// All fields except `kind` are optional — the server enforces requirements
// per-kind after schema validation passes.
export const StageItemSchema = z.object({
  kind: z.enum(['show', 'travel', 'tour_notes', 'expense']),
  booking_id:      z.string().optional(),
  venueName:       z.string().optional(),
  venueCity:       z.string().optional(),
  venueState:      z.string().optional(),
  date:            z.string().optional(),
  setTime:         z.string().optional(),
  loadInTime:      z.string().optional(),
  soundcheckTime:  z.string().optional(),
  endTime:         z.string().optional(),
  category:        z.string().optional(),
  amount:          z.number().optional(),
  status:          z.string().optional(),
  notes:           z.string().optional(),
});

export type StageItem = z.infer<typeof StageItemSchema>;

export function validateItems(rawItems: unknown[]): {
  valid: StageItem[];
  invalid: Array<{ index: number; raw: unknown; reason: string }>;
} {
  const valid: StageItem[] = [];
  const invalid: Array<{ index: number; raw: unknown; reason: string }> = [];
  for (let i = 0; i < rawItems.length; i++) {
    const result = StageItemSchema.safeParse(rawItems[i]);
    if (result.success) {
      valid.push(result.data);
    } else {
      const issues = result.error.issues ?? [];
      const reason = issues.length > 0
        ? issues.map((e) => `${(e.path as (string | number)[]).join('.') || 'root'}: ${e.message}`).join('; ')
        : result.error.message.slice(0, 200);
      invalid.push({ index: i, raw: rawItems[i], reason });
    }
  }
  return { valid, invalid };
}

export function applyBatchCap(
  items: StageItem[],
  cap = BATCH_CAP,
): { capped: StageItem[]; overflow: number } {
  if (items.length <= cap) return { capped: items, overflow: 0 };
  return { capped: items.slice(0, cap), overflow: items.length - cap };
}

// ── Deduplication ────────────────────────────────────────────────────────────

export function normalizeItemKey(
  action_type: string,
  payload: Record<string, unknown>,
): string {
  switch (action_type) {
    case 'booking_upsert':
      return `booking_upsert:${payload.booking_id ?? ''}:${payload.venue_id ?? ''}:${payload.show_date ?? ''}`;
    case 'tour_insert':
      return `tour_insert:${String(payload.name ?? '').toLowerCase().trim()}`;
    case 'venue_and_booking_upsert':
      return `venue_and_booking:${String(payload.venue_name ?? '').toLowerCase().trim()}:${payload.show_date ?? ''}`;
    case 'tour_notes_update':
      return `tour_notes:${payload.tour_id ?? ''}`;
    case 'expense_insert':
      return `expense:${payload.tour_id ?? ''}:${String(payload.category ?? '').toLowerCase()}:${payload.amount ?? ''}:${payload.expense_date ?? ''}`;
    case 'payment_settle':
      return `payment:${payload.booking_id ?? ''}`;
    case 'email_send':
      return `email:${String(payload.recipient ?? '').toLowerCase()}:${String(payload.subject ?? '').slice(0, 60).toLowerCase()}`;
    default:
      return `${action_type}:${JSON.stringify(payload).slice(0, 100)}`;
  }
}

export function isDuplicateInRows(
  pendingRows: Array<{ action_type: string; payload: Record<string, unknown> }>,
  recentRows: Array<{ action_type: string; payload: Record<string, unknown> }>,
  action_type: string,
  payloadPreview: Record<string, unknown>,
): { duplicate: boolean; reason: 'pending' | 'recent' | null } {
  const candidate = normalizeItemKey(action_type, payloadPreview);
  for (const row of pendingRows) {
    if (normalizeItemKey(row.action_type, row.payload) === candidate) {
      return { duplicate: true, reason: 'pending' };
    }
  }
  for (const row of recentRows) {
    if (normalizeItemKey(row.action_type, row.payload) === candidate) {
      return { duplicate: true, reason: 'recent' };
    }
  }
  return { duplicate: false, reason: null };
}

// ── Truthful history builder ─────────────────────────────────────────────────

export function buildConfirmMessage(
  staged: Array<{ kind: string; staged_action_id: string; proposal: Record<string, unknown> }>,
  results: Array<{ staged_action_id: string; success: boolean; error?: string }>,
): string {
  const resultMap = new Map(results.map(r => [r.staged_action_id, r]));
  const saved: string[] = [];
  const failed: string[] = [];

  for (const item of staged) {
    const result = resultMap.get(item.staged_action_id);
    const label = formatItemLabel(item);
    if (!result || !result.success) {
      failed.push(`• ${label} — ${simplifyError(result?.error)}`);
    } else {
      saved.push(`• ${label}`);
    }
  }

  const parts: string[] = [];
  if (saved.length > 0) parts.push(`Saved:\n${saved.join('\n')}`);
  if (failed.length > 0) parts.push(`Failed:\n${failed.join('\n')}`);
  return parts.join('\n') || 'No items were processed.';
}

function formatItemLabel(item: { kind: string; proposal: Record<string, unknown> }): string {
  const p = item.proposal ?? {};
  switch (item.kind) {
    case 'show':
    case 'venue_and_booking': {
      const parts = [
        p.show_date as string | undefined,
        (p.venue_name as string | undefined) ?? 'TBD',
        p.tour_name ? `(${p.tour_name})` : null,
        p.status ? `→ ${p.status}` : null,
        p.notes ? String(p.notes).slice(0, 40) : null,
      ].filter(Boolean);
      return parts.join(' — ');
    }
    case 'travel': {
      const parts = [
        `Travel: ${(p.show_date as string | undefined) ?? 'no date'}`,
        p.notes ? String(p.notes).slice(0, 40) : null,
      ].filter(Boolean);
      return parts.join(' · ');
    }
    case 'tour_notes':
      return `Tour notes (${(p.tour_name as string | undefined) ?? 'tour'}) updated`;
    case 'expense':
      return `Expense: ${p.category} $${p.amount}${p.tour_name ? ` (${p.tour_name})` : ''}`;
    case 'tour_create':
      return `New tour: ${p.name}`;
    case 'payment_settle': {
      const parts = [
        p.venue_name as string | undefined,
        p.show_date as string | undefined,
        (p.agreed_amount as number | undefined) != null
          ? `→ $${p.agreed_amount} contracted`
          : (p.actual_amount_received as number | undefined) != null
            ? `→ $${p.actual_amount_received} received`
            : null,
      ].filter(Boolean);
      return parts.join(' · ');
    }
    case 'email_send':
      return `Email → ${p.recipient}: ${p.subject}`;
    default:
      return String(item.kind);
  }
}

function simplifyError(error?: string): string {
  if (!error) return 'save failed';
  if (error.includes('expired')) return 'proposal expired — ask the assistant to try again';
  return error.slice(0, 100);
}

// ── Pending context summary for model awareness ──────────────────────────────

export function formatPendingContextSummary(
  rows: Array<{ action_type: string; payload: Record<string, unknown> }>,
): string | null {
  if (!rows.length) return null;
  const lines = rows.map(r => {
    const p = r.payload ?? {};
    switch (r.action_type) {
      case 'booking_upsert':
        return `  • Show/travel: ${(p.show_date as string | undefined) ?? 'no date'} at ${(p.venue_name as string | undefined) ?? 'TBD'}${p.status ? ` [${p.status}]` : ''}`;
      case 'venue_and_booking_upsert':
        return `  • New venue + show: ${p.venue_name} (${p.venue_city}, ${p.venue_state}) — ${p.show_date}`;
      case 'tour_insert':
        return `  • New tour: "${p.name}"`;
      case 'tour_notes_update':
        return `  • Tour notes update for "${p.tour_name}"`;
      case 'expense_insert':
        return `  • Expense: ${p.category} $${p.amount}`;
      case 'payment_settle':
        return `  • Payment update for ${(p.venue_name as string | undefined) ?? ''} ${(p.show_date as string | undefined) ?? ''}`.trimEnd();
      case 'email_send':
        return `  • Email to ${p.recipient}: "${p.subject}"`;
      default:
        return `  • ${r.action_type}`;
    }
  });
  return `Awaiting confirmation (${rows.length} staged item${rows.length !== 1 ? 's' : ''} — still pending):\n${lines.join('\n')}`;
}
