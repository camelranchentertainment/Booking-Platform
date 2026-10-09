// __tests__/lib/agentOfficeActions.test.ts
jest.mock('../../lib/platformSettings', () => ({ getSetting: jest.fn().mockResolvedValue(null) }));

import {
  buildEmailArchivePayload, executeEmailArchive, buildEmailDraftPayload, executeEmailDraft,
  buildMemberInvitePayload, buildNotePayload, executeNote, buildSocialDraftPayload, executeSocialDraft,
} from '../../lib/server/agentOfficeActions';
import { escapeHtml, buildInviteEmailHtml, normalizeInviteEmail } from '../../lib/server/memberInvite';
import { describeOfficeAction } from '../../lib/agentStagingHelpers';
import type { SupabaseClient } from '@supabase/supabase-js';

const ACT = 'act-1';
const U = 'user-1';
const E1 = '66666666-6666-4666-8666-666666666666';
const E2 = '77777777-7777-4777-8777-777777777777';
const BK = '88888888-8888-4888-8888-888888888888';

type Rows = Record<string, unknown>;
function svc(tables: Record<string, { list?: unknown[]; one?: Rows | null }>) {
  const log = {
    filters: [] as Array<[string, string, string, unknown]>,
    inserts: [] as Array<[string, Rows]>,
    updates: [] as Array<[string, Rows]>,
    upserts: [] as Array<[string, Rows]>,
  };
  const from = (t: string) => {
    const c: any = {};
    const cfg = tables[t] ?? {};
    c.select = () => c;
    for (const m of ['eq', 'neq', 'ilike', 'in', 'or', 'gte']) c[m] = (col: string, v: unknown) => { log.filters.push([t, m, col, v]); return c; };
    c.order = () => c;
    c.insert = (r: Rows) => { log.inserts.push([t, r]); return c; };
    c.update = (r: Rows) => { log.updates.push([t, r]); return c; };
    c.upsert = (r: Rows) => { log.upserts.push([t, r]); return c; };
    c.limit = () => c;
    c.maybeSingle = () => Promise.resolve({ data: cfg.one ?? null, error: null });
    c.single = () => Promise.resolve({ data: { id: 'new', ...(cfg.one ?? {}) }, error: null });
    c.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: cfg.list ?? [], error: null }).then(f);
    return c;
  };
  return { s: { from } as unknown as SupabaseClient, log };
}

describe('email archive', () => {
  it('only archives received emails in the band\'s inbox', async () => {
    const { s, log } = svc({ email_log: { list: [{ id: E1, from_address: 'a@b.com', subject: 'Hi' }] } });
    const p = await buildEmailArchivePayload(s, ACT, { email_ids: [E1, E1] });
    expect(p).toEqual({ email_ids: [E1], labels: ['a@b.com: Hi'] });
    expect(log.filters).toContainEqual(['email_log', 'eq', 'act_id', ACT]);
    expect(log.filters).toContainEqual(['email_log', 'eq', 'direction', 'received']);
    expect(describeOfficeAction('email_archive', p as never)).toBe('Archive 1 email: a@b.com: Hi');
    await expect(buildEmailArchivePayload(svc({ email_log: { list: [] } }).s, ACT, { email_ids: [E2] })).rejects.toThrow(/aren't in this band/);
    await expect(buildEmailArchivePayload(s, ACT, { email_ids: [] })).rejects.toThrow(/Pick 1/);
  });

  it('executes scoped to the band and received mail', async () => {
    const { s, log } = svc({ email_log: { list: [{ id: E1 }] } });
    await expect(executeEmailArchive(s, ACT, { email_ids: [E1] })).resolves.toEqual({ archived: 1 });
    expect(log.updates[0][1]).toMatchObject({ archived: true });
    expect(log.filters).toContainEqual(['email_log', 'eq', 'act_id', ACT]);
  });
});

describe('email draft', () => {
  it('saves a draft (never sent) for the band, with an owned venue only', async () => {
    const { s, log } = svc({ venues: { one: { id: E1, name: 'Pub' } } });
    const p = await buildEmailDraftPayload(s, ACT, { recipient: 'Booker@Pub.com', subject: 'Re: Nov', body: 'Works for us', venue_id: E1 });
    expect(p).toMatchObject({ recipient: 'booker@pub.com', venue_name: 'Pub' });
    await executeEmailDraft(s, ACT, U, p);
    expect(log.inserts[0][1]).toMatchObject({ act_id: ACT, sent_by: U, is_draft: true, status: 'draft', recipient: 'booker@pub.com' });
    await expect(buildEmailDraftPayload(svc({ venues: { one: null } }).s, ACT, { recipient: 'a@b.com', body: 'x', venue_id: E1 })).rejects.toThrow(/wasn't found/);
    await expect(buildEmailDraftPayload(s, ACT, { recipient: 'nope', body: 'x' })).rejects.toThrow(/doesn't look right/);
  });
});

describe('member invite', () => {
  it('stages a member invite for a new address and a roster person on this band', async () => {
    const { s } = svc({ profiles: { list: [] }, act_invitations: { list: [] }, act_personnel: { one: { id: E1, name: 'Mike' } } });
    const p = await buildMemberInvitePayload(s, ACT, { email: ' Mike@X.com ', personnel_id: E1 });
    expect(p).toEqual({ email: 'mike@x.com', personnel_id: E1, personnel_name: 'Mike' });
    expect(describeOfficeAction('member_invite', p as never)).toMatch(/as a band member \(roster: Mike\) — sends an email/);
  });

  it('refuses existing members, pending invites, bad emails and other bands\' roster', async () => {
    await expect(buildMemberInvitePayload(svc({ profiles: { list: [{ id: 'p' }] }, act_invitations: { list: [] } }).s, ACT, { email: 'a@b.com' })).rejects.toThrow(/already on this band/);
    await expect(buildMemberInvitePayload(svc({ profiles: { list: [] }, act_invitations: { list: [{ id: 'i' }] } }).s, ACT, { email: 'a@b.com' })).rejects.toThrow(/pending invite/);
    await expect(buildMemberInvitePayload(svc({}).s, ACT, { email: 'nope' })).rejects.toThrow(/doesn't look right/);
    await expect(buildMemberInvitePayload(svc({ act_personnel: { one: null } }).s, ACT, { email: 'a@b.com', personnel_id: E1 })).rejects.toThrow(/isn't on this band's roster/);
  });

  it('escapes names in the invite email', () => {
    const html = buildInviteEmailHtml({ inviterName: '<script>x</script>', actName: 'A & "B"', role: 'member', joinUrl: 'https://x/join?token=a"b' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; &quot;B&quot;');
    expect(html).toContain('token=a&quot;b');
    expect(escapeHtml("'")).toBe('&#39;');
    expect(normalizeInviteEmail('  A@B.co ')).toBe('a@b.co');
    expect(normalizeInviteEmail('a@b')).toBe('');
  });
});

describe('notes', () => {
  it('appends to the day\'s note by default, as the approving user', async () => {
    const { s, log } = svc({ daily_notes: { one: { content: 'Load in 5pm' } } });
    const p = await buildNotePayload(s, ACT, U, { content: 'Need new strings' }, '2026-10-09');
    expect(p).toMatchObject({ note_date: '2026-10-09', mode: 'append', visibility: 'admin_only', existing_preview: 'Load in 5pm' });
    await executeNote(s, ACT, U, p);
    expect(log.upserts[0][1]).toMatchObject({ user_id: U, act_id: ACT, content: 'Load in 5pm\n\nNeed new strings', visibility: 'admin_only' });
  });

  it('replaces only when asked, and checks the tour is the band\'s', async () => {
    const { s, log } = svc({ daily_notes: { one: { content: 'old' } } });
    await executeNote(s, ACT, U, { note_date: '2026-10-09', content: 'new', mode: 'replace', visibility: 'all_members' });
    expect(log.upserts[0][1]).toMatchObject({ content: 'new', visibility: 'all_members' });
    await expect(buildNotePayload(svc({ tours: { one: null } }).s, ACT, U, { content: 'x', tour_id: E1 }, '2026-10-09')).rejects.toThrow(/wasn't found/);
    await expect(buildNotePayload(s, ACT, U, { content: 'x', visibility: 'public' }, '2026-10-09')).rejects.toThrow();
  });
});

describe('social drafts', () => {
  const ann = { id: E2, status: 'ready', booking: { show_date: '2026-11-01', venue: { name: 'Wire Road' } } };

  it('saves a draft post (never posted) and moves the card to drafting', async () => {
    const { s, log } = svc({ social_announcements: { one: ann }, social_posts: { one: null } });
    const p = await buildSocialDraftPayload(s, ACT, { booking_id: BK, platform: 'instagram', caption: 'See you at Wire Road!' });
    expect(p).toMatchObject({ announcement_id: E2, venue_name: 'Wire Road', replaces_existing: false });
    expect(describeOfficeAction('social_draft', p as never)).toBe('New instagram draft for Wire Road 2026-11-01 (not posted)');
    await executeSocialDraft(s, ACT, p);
    expect(log.inserts[0]).toEqual(['social_posts', expect.objectContaining({ status: 'draft', delivery: 'manual_kit', act_id: ACT, platform: 'instagram' })]);
    expect(log.updates).toContainEqual(['social_announcements', expect.objectContaining({ status: 'drafting' })]);
    expect(log.filters).toContainEqual(['social_announcements', 'eq', 'act_id', ACT]);
  });

  it('refuses approved/posted posts, dismissed cards, shows without a card, and unknown platforms', async () => {
    await expect(buildSocialDraftPayload(svc({ social_announcements: { one: ann }, social_posts: { one: { id: 'p', status: 'approved' } } }).s, ACT, { booking_id: BK, platform: 'facebook', caption: 'x' })).rejects.toThrow(/already approved/);
    await expect(buildSocialDraftPayload(svc({ social_announcements: { one: { ...ann, status: 'dismissed' } } }).s, ACT, { booking_id: BK, platform: 'facebook', caption: 'x' })).rejects.toThrow(/dismissed/);
    await expect(buildSocialDraftPayload(svc({ social_announcements: { one: null } }).s, ACT, { booking_id: BK, platform: 'facebook', caption: 'x' })).rejects.toThrow(/no social card/);
    await expect(buildSocialDraftPayload(svc({}).s, ACT, { booking_id: BK, platform: 'myspace', caption: 'x' })).rejects.toThrow();
  });
});
