import { MONEY_LOCKED_REPLY, isAgentMoneyAction, stripMoneyFields } from '../../lib/server/agentPolicy';

describe('isAgentMoneyAction', () => {
  it('flags every action that changes money', () => {
    for (const t of ['payment_settle', 'expense_insert', 'expense_update', 'expense_archive']) {
      expect(isAgentMoneyAction(t)).toBe(true);
    }
  });

  it('allows non-money actions', () => {
    for (const t of ['booking_upsert', 'venue_and_booking_upsert', 'venue_upsert', 'tour_update', 'personnel_upsert', 'note_upsert']) {
      expect(isAgentMoneyAction(t)).toBe(false);
    }
    expect(isAgentMoneyAction(undefined)).toBe(false);
  });
});

describe('stripMoneyFields', () => {
  it('removes money columns and reports which ones', () => {
    const { payload, removed } = stripMoneyFields({ show_date: '2026-11-06', fee: 800, agreed_amount: 800, default_pay_amount: 150, notes: 'Solo' });
    expect(payload).toEqual({ show_date: '2026-11-06', notes: 'Solo' });
    expect(removed.sort()).toEqual(['agreed_amount', 'default_pay_amount', 'fee']);
  });

  it('leaves a payload without money untouched', () => {
    const input = { name: 'Mike', instrument_role: 'Bass' };
    expect(stripMoneyFields(input)).toEqual({ payload: input, removed: [] });
  });

  it('has a user-facing message that points to where money is entered', () => {
    expect(MONEY_LOCKED_REPLY).toMatch(/Financials page/);
  });
});
