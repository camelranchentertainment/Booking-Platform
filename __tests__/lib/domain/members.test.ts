// __tests__/lib/domain/members.test.ts
import {
  adminSeatsUsed, initialsOf, isInviteEmail, membersHeroLine, payLabel, sentAgo, summarizeMembers,
  type BandAccount, type PendingInvite, type RosterPerson,
} from '../../../lib/domain/members';

const person = (over: Partial<RosterPerson>): RosterPerson => ({
  id: 'p', name: 'Pat', instrument_role: null, default_pay_amount: null, phone: null, email: null,
  linked_user_id: null, is_active: true, ...over,
});

describe('initialsOf', () => {
  it('uses first and last word, or the email', () => {
    expect(initialsOf('Jake Stringer')).toBe('JS');
    expect(initialsOf('Billy Ray Cyrus')).toBe('BC');
    expect(initialsOf('Cher')).toBe('CH');
    expect(initialsOf(null, 'drums@band.com')).toBe('DR');
    expect(initialsOf('', '')).toBe('?');
  });
});

describe('summaries', () => {
  const roster = [
    person({ id: 'a', linked_user_id: 'u1' }),
    person({ id: 'b', email: 'b@x.com' }),
    person({ id: 'c', email: 'c@x.com' }),
    person({ id: 'd' }),
  ];
  const accounts: BandAccount[] = [
    { id: 'u1', display_name: 'A', email: 'a@x.com', role: 'band_admin' },
    { id: 'u2', display_name: null, email: 'm@x.com', role: 'member' },
  ];
  const invites: PendingInvite[] = [
    { id: 'i1', email: 'c@x.com', role: 'member', created_at: '2026-10-20', personnel_id: 'c' },
    { id: 'i2', email: 'z@x.com', role: 'band_admin', created_at: '2026-10-20', personnel_id: null },
  ];

  it('counts logins, people still to invite, admin seats and pending invites', () => {
    expect(summarizeMembers(roster, accounts, invites)).toEqual({ roster: 4, withLogin: 1, needInvite: 1, admins: 2, pending: 2 });
    expect(adminSeatsUsed(accounts, invites)).toBe(2);
  });

  it('writes the hero line', () => {
    expect(membersHeroLine(summarizeMembers(roster, accounts, invites))).toBe('4 on the roster · 1 can log in · 2 invites waiting');
    expect(membersHeroLine(summarizeMembers([], [], []))).toMatch(/No one on the roster/);
  });
});

describe('payLabel / isInviteEmail / sentAgo', () => {
  it('formats pay', () => {
    expect(payLabel(150)).toBe('$150 / show');
    expect(payLabel(1250.5)).toBe('$1,250.50 / show');
    expect(payLabel(null)).toBe('No default pay');
  });
  it('checks invite emails', () => {
    expect(isInviteEmail(' a@b.co ')).toBe(true);
    expect(isInviteEmail('a@b')).toBe(false);
  });
  it('says how long ago an invite went out', () => {
    const now = new Date('2026-10-27T12:00:00Z');
    expect(sentAgo('2026-10-27T08:00:00Z', now)).toBe('sent today');
    expect(sentAgo('2026-10-26T08:00:00Z', now)).toBe('sent yesterday');
    expect(sentAgo('2026-10-20T08:00:00Z', now)).toBe('sent 7 days ago');
  });
});
