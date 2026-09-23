import {
  BATCH_CAP,
  validateItems,
  applyBatchCap,
  normalizeItemKey,
  isDuplicateInRows,
  buildConfirmMessage,
  formatPendingContextSummary,
} from '../../lib/agentStagingHelpers';

// ── validateItems (Zod validation) ───────────────────────────────────────────

describe('validateItems', () => {
  it('accepts valid show items', () => {
    const { valid, invalid } = validateItems([
      { kind: 'show', venueName: 'The Rusty Rail', date: '2026-10-03' },
    ]);
    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(0);
    expect(valid[0].kind).toBe('show');
  });

  it('accepts valid travel, tour_notes, and expense items', () => {
    const { valid, invalid } = validateItems([
      { kind: 'travel', date: '2026-10-04', notes: 'Drive to KC' },
      { kind: 'tour_notes', notes: 'Hitting the midwest' },
      { kind: 'expense', category: 'Fuel', amount: 120, date: '2026-10-01' },
    ]);
    expect(valid).toHaveLength(3);
    expect(invalid).toHaveLength(0);
  });

  it('rejects items with unknown kind', () => {
    const { valid, invalid } = validateItems([
      { kind: 'unknown_thing', date: '2026-10-03' },
    ]);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].index).toBe(0);
    expect(invalid[0].reason).toMatch(/kind/i);
  });

  it('rejects items with amount as a string instead of number', () => {
    const { valid, invalid } = validateItems([
      { kind: 'expense', category: 'Fuel', amount: '120' as any, date: '2026-10-01' },
    ]);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].reason).toMatch(/amount/i);
  });

  it('accepts items with only kind (all others optional)', () => {
    const { valid, invalid } = validateItems([{ kind: 'show' }]);
    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(0);
  });

  it('returns valid and invalid counts for mixed input', () => {
    const { valid, invalid } = validateItems([
      { kind: 'show', date: '2026-10-03' },
      { kind: 'bad_kind' },
      { kind: 'expense', amount: 'nope' as any, date: '2026-10-01' },
      { kind: 'travel', date: '2026-10-05' },
    ]);
    expect(valid).toHaveLength(2);
    expect(invalid).toHaveLength(2);
    expect(invalid[0].index).toBe(1);
    expect(invalid[1].index).toBe(2);
  });

  it('handles empty array', () => {
    const { valid, invalid } = validateItems([]);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(0);
  });
});

// ── applyBatchCap ─────────────────────────────────────────────────────────────

describe('applyBatchCap', () => {
  const makeItems = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      kind: 'show' as const,
      date: `2026-10-0${i + 1}`,
    }));

  it(`caps at ${BATCH_CAP} and reports overflow`, () => {
    const items = makeItems(6);
    const { capped, overflow } = applyBatchCap(items);
    expect(capped).toHaveLength(BATCH_CAP);
    expect(overflow).toBe(2);
    expect(capped[0].date).toBe('2026-10-01');
    expect(capped[3].date).toBe('2026-10-04');
  });

  it('returns all items when at cap', () => {
    const items = makeItems(BATCH_CAP);
    const { capped, overflow } = applyBatchCap(items);
    expect(capped).toHaveLength(BATCH_CAP);
    expect(overflow).toBe(0);
  });

  it('returns all items when below cap', () => {
    const items = makeItems(2);
    const { capped, overflow } = applyBatchCap(items);
    expect(capped).toHaveLength(2);
    expect(overflow).toBe(0);
  });

  it('returns empty with zero overflow for empty input', () => {
    const { capped, overflow } = applyBatchCap([]);
    expect(capped).toHaveLength(0);
    expect(overflow).toBe(0);
  });

  it('respects a custom cap value', () => {
    const items = makeItems(5);
    const { capped, overflow } = applyBatchCap(items, 2);
    expect(capped).toHaveLength(2);
    expect(overflow).toBe(3);
  });
});

// ── isDuplicateInRows (deduplication) ─────────────────────────────────────────

describe('isDuplicateInRows', () => {
  const makePendingRow = (action_type: string, payload: Record<string, unknown>) => ({
    action_type,
    payload,
  });

  it('detects a duplicate in pending rows', () => {
    const pending = [
      makePendingRow('booking_upsert', {
        booking_id: '', venue_id: 'v1', show_date: '2026-10-03',
      }),
    ];
    const result = isDuplicateInRows(pending, [], 'booking_upsert', {
      booking_id: '', venue_id: 'v1', show_date: '2026-10-03',
    });
    expect(result.duplicate).toBe(true);
    expect(result.reason).toBe('pending');
  });

  it('detects a duplicate in recent rows', () => {
    const recent = [
      makePendingRow('booking_upsert', {
        booking_id: '', venue_id: 'v2', show_date: '2026-11-01',
      }),
    ];
    const result = isDuplicateInRows([], recent, 'booking_upsert', {
      booking_id: '', venue_id: 'v2', show_date: '2026-11-01',
    });
    expect(result.duplicate).toBe(true);
    expect(result.reason).toBe('recent');
  });

  it('prefers pending reason when both match', () => {
    const row = makePendingRow('booking_upsert', {
      booking_id: '', venue_id: 'v3', show_date: '2026-12-01',
    });
    const result = isDuplicateInRows([row], [row], 'booking_upsert', {
      booking_id: '', venue_id: 'v3', show_date: '2026-12-01',
    });
    expect(result.reason).toBe('pending');
  });

  it('returns no duplicate when nothing matches', () => {
    const pending = [
      makePendingRow('booking_upsert', {
        booking_id: '', venue_id: 'v1', show_date: '2026-10-03',
      }),
    ];
    const result = isDuplicateInRows(pending, [], 'booking_upsert', {
      booking_id: '', venue_id: 'v1', show_date: '2026-10-04', // different date
    });
    expect(result.duplicate).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('does not match across different action types', () => {
    const pending = [
      makePendingRow('tour_insert', { name: 'fall tour' }),
    ];
    const result = isDuplicateInRows(pending, [], 'booking_upsert', {
      booking_id: '', venue_id: 'v1', show_date: '2026-10-03',
    });
    expect(result.duplicate).toBe(false);
  });

  it('deduplicates tour_insert by normalised name', () => {
    const pending = [makePendingRow('tour_insert', { name: 'Fall Tour 2026' })];
    const result = isDuplicateInRows(pending, [], 'tour_insert', { name: 'fall tour 2026' });
    expect(result.duplicate).toBe(true);
    expect(result.reason).toBe('pending');
  });

  it('returns no duplicate with empty rows', () => {
    const result = isDuplicateInRows([], [], 'booking_upsert', {
      booking_id: '', venue_id: 'v1', show_date: '2026-10-03',
    });
    expect(result.duplicate).toBe(false);
  });
});

// ── buildConfirmMessage (history builder) ──────────────────────────────────────

describe('buildConfirmMessage', () => {
  it('lists all items as saved when all results succeed', () => {
    const staged = [
      { kind: 'show', staged_action_id: 'id1', proposal: { show_date: '2026-10-03', venue_name: 'Bar X', tour_name: 'Fall Run', status: 'confirmed' } },
      { kind: 'travel', staged_action_id: 'id2', proposal: { show_date: '2026-10-04', notes: 'Drive to KC' } },
    ];
    const results = [
      { staged_action_id: 'id1', success: true },
      { staged_action_id: 'id2', success: true },
    ];
    const msg = buildConfirmMessage(staged, results);
    expect(msg).toContain('Saved:');
    expect(msg).toContain('2026-10-03');
    expect(msg).toContain('Bar X');
    expect(msg).toContain('Travel: 2026-10-04');
    expect(msg).not.toContain('Failed:');
  });

  it('lists failed items with plain-English reason', () => {
    const staged = [
      { kind: 'show', staged_action_id: 'id1', proposal: { show_date: '2026-10-03', venue_name: 'Bar X' } },
    ];
    const results = [
      { staged_action_id: 'id1', success: false, error: 'That booking was not found for this band.' },
    ];
    const msg = buildConfirmMessage(staged, results);
    expect(msg).toContain('Failed:');
    expect(msg).toContain('Bar X');
    expect(msg).toContain('not found');
    expect(msg).not.toContain('Saved:');
  });

  it('mixes saved and failed items', () => {
    const staged = [
      { kind: 'show', staged_action_id: 'id1', proposal: { show_date: '2026-10-03', venue_name: 'Bar X' } },
      { kind: 'expense', staged_action_id: 'id2', proposal: { category: 'Fuel', amount: 120 } },
    ];
    const results = [
      { staged_action_id: 'id1', success: true },
      { staged_action_id: 'id2', success: false, error: 'DB error' },
    ];
    const msg = buildConfirmMessage(staged, results);
    expect(msg).toContain('Saved:');
    expect(msg).toContain('Bar X');
    expect(msg).toContain('Failed:');
    expect(msg).toContain('Fuel');
  });

  it('handles missing result entry as failed', () => {
    const staged = [
      { kind: 'show', staged_action_id: 'id1', proposal: { show_date: '2026-10-03', venue_name: 'Bar X' } },
    ];
    const msg = buildConfirmMessage(staged, []); // no result for id1
    expect(msg).toContain('Failed:');
  });

  it('returns fallback string for empty staged list', () => {
    const msg = buildConfirmMessage([], []);
    expect(msg).toBeTruthy();
  });

  it('formats expense items with category and amount', () => {
    const staged = [
      { kind: 'expense', staged_action_id: 'id1', proposal: { category: 'Groceries', amount: 45, tour_name: 'Spring 2026' } },
    ];
    const results = [{ staged_action_id: 'id1', success: true }];
    const msg = buildConfirmMessage(staged, results);
    expect(msg).toContain('Groceries');
    expect(msg).toContain('45');
    expect(msg).toContain('Spring 2026');
  });
});

// ── normalizeItemKey ──────────────────────────────────────────────────────────

describe('normalizeItemKey', () => {
  it('produces the same key for booking_upsert with same fields', () => {
    const a = normalizeItemKey('booking_upsert', { booking_id: '', venue_id: 'v1', show_date: '2026-10-03' });
    const b = normalizeItemKey('booking_upsert', { booking_id: '', venue_id: 'v1', show_date: '2026-10-03' });
    expect(a).toBe(b);
  });

  it('produces different keys for different dates', () => {
    const a = normalizeItemKey('booking_upsert', { booking_id: '', venue_id: 'v1', show_date: '2026-10-03' });
    const b = normalizeItemKey('booking_upsert', { booking_id: '', venue_id: 'v1', show_date: '2026-10-04' });
    expect(a).not.toBe(b);
  });

  it('normalises tour_insert name to lowercase', () => {
    const a = normalizeItemKey('tour_insert', { name: 'Fall Tour' });
    const b = normalizeItemKey('tour_insert', { name: 'fall tour' });
    expect(a).toBe(b);
  });
});

// ── formatPendingContextSummary ───────────────────────────────────────────────

describe('formatPendingContextSummary', () => {
  it('returns null for empty rows', () => {
    expect(formatPendingContextSummary([])).toBeNull();
  });

  it('includes row count and item descriptions', () => {
    const rows = [
      { action_type: 'booking_upsert', payload: { show_date: '2026-10-03', venue_name: 'Bar X', status: 'confirmed' } },
      { action_type: 'tour_insert', payload: { name: 'Fall Tour' } },
    ];
    const summary = formatPendingContextSummary(rows);
    expect(summary).toContain('2 staged item');
    expect(summary).toContain('Bar X');
    expect(summary).toContain('Fall Tour');
  });
});
