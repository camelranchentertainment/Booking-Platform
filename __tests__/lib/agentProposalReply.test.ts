import {
  describeStagedItems,
  guardProposalReply,
  isStandaloneTourName,
  normaliseBookingStatus,
  validateItems,
} from '../../lib/agentStagingHelpers';

describe('guardProposalReply', () => {
  const summary = 'Ready for your approval — nothing is saved until you click Confirm:\n• 2026-11-06 — Kobi\'s Bar';

  it('keeps a reply that reads as a proposal', () => {
    expect(guardProposalReply('Here is the Nov 6 show at Kobi\'s — confirm to save?', summary))
      .toBe('Here is the Nov 6 show at Kobi\'s — confirm to save?');
  });

  it('replaces a reply that claims the work is already saved', () => {
    // The exact reply that told a user a show was logged when only the venue was staged.
    expect(guardProposalReply('Saved! Kobi\'s Bar added to the venue database and the Nov 6 show logged as a confirmed standalone.', summary))
      .toBe(summary);
  });

  it('falls back to the summary when the model sent no reply', () => {
    expect(guardProposalReply(undefined, summary)).toBe(summary);
    expect(guardProposalReply('   ', summary)).toBe(summary);
    expect(guardProposalReply(42, summary)).toBe(summary);
  });
});

describe('normaliseBookingStatus', () => {
  it('accepts every booking_status value, case-insensitively', () => {
    expect(normaliseBookingStatus('Confirmed')).toBe('confirmed');
    expect(normaliseBookingStatus(' hold ')).toBe('hold');
    expect(normaliseBookingStatus('followup')).toBe('followup');
  });

  it('rejects anything else so the default applies', () => {
    expect(normaliseBookingStatus('booked')).toBeUndefined();
    expect(normaliseBookingStatus(undefined)).toBeUndefined();
    expect(normaliseBookingStatus(1)).toBeUndefined();
  });
});

describe('isStandaloneTourName', () => {
  it('treats a missing or "standalone" tour name as no tour', () => {
    for (const v of [undefined, null, '', '  ', 'standalone', 'Standalone', 'none', 'no tour', 'N/A']) {
      expect(isStandaloneTourName(v)).toBe(true);
    }
  });

  it('treats a real tour name as a tour', () => {
    expect(isStandaloneTourName('November Run')).toBe(false);
    expect(isStandaloneTourName('Standalone Sessions Tour')).toBe(false);
  });
});

describe('describeStagedItems', () => {
  it('lists each staged item and says nothing is saved yet', () => {
    const text = describeStagedItems([
      { kind: 'venue_and_booking', proposal: { show_date: '2026-11-06', venue_name: "Kobi's Bar", status: 'confirmed' } },
    ]);
    expect(text).toContain('nothing is saved until you click Confirm');
    expect(text).toContain("2026-11-06 — Kobi's Bar — + new venue — → confirmed");
  });

  it('says so when nothing was staged', () => {
    expect(describeStagedItems([])).toBe('Nothing was staged.');
  });
});

describe('show items carry new-venue details', () => {
  it('keeps address, zip, phone, email and website through validation', () => {
    const { valid, invalid } = validateItems([{
      kind: 'show', venueName: "Kobi's Bar", venueCity: 'Bonner Springs', venueState: 'KS',
      venueAddress: '113 Oak St', venueZip: '66012', venuePhone: '(913) 745-4242',
      venueEmail: 'booking@example.com', venueWebsite: 'kobis.bar', date: '2026-11-06', status: 'confirmed',
    }]);
    expect(invalid).toHaveLength(0);
    expect(valid[0]).toMatchObject({ venueAddress: '113 Oak St', venueZip: '66012', venueWebsite: 'kobis.bar' });
  });
});
