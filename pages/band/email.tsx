import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import EmailComposer from '../../components/email/EmailComposer';

const STATUS_COLOR: Record<string, string> = {
  sent: '#fbbf24', delivered: '#34d399', bounced: '#f87171', failed: '#f87171',
};

export default function BandEmail() {
  const [myAct, setMyAct]           = useState<any>(null);
  const [log, setLog]               = useState<any[]>([]);
  const [drafts, setDrafts]         = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState('');
  const [draftComposer, setDraftComposer] = useState<any>(null);
  const [tab, setTab]               = useState<'drafts' | 'sent'>('drafts');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Find act — owner first, then profile linkage
    let act: any = null;
    const { data: owned } = await supabase.from('acts').select('*').eq('owner_id', user.id).eq('is_active', true).limit(1);
    if (owned?.length) {
      act = owned[0];
    } else {
      const { data: prof } = await supabase.from('user_profiles').select('act_id').eq('id', user.id).maybeSingle();
      if (prof?.act_id) {
        const { data: linked } = await supabase.from('acts').select('*').eq('id', prof.act_id).maybeSingle();
        act = linked || null;
      }
    }
    setMyAct(act);
    if (!act) { setLoading(false); return; }

    const [logRes, bookingIdsRes] = await Promise.all([
      supabase.from('email_log')
        .select('*, venue:venues(name)')
        .eq('act_id', act.id)
        .order('sent_at', { ascending: false })
        .limit(100),
      supabase.from('bookings').select('id').eq('act_id', act.id),
    ]);

    const bookingIds = (bookingIdsRes.data || []).map((b: any) => b.id);

    // Fetch drafts — booking-based (by act's booking IDs) and tour_venue-based
    // For tour_venue drafts: query by agent_id = user.id directly, avoiding RLS on tours table
    const [bookingDraftsRes, tourVenueDraftsRes] = await Promise.all([
      bookingIds.length > 0
        ? supabase.from('email_drafts')
            .select(`id, category, subject, body, created_at,
              booking:bookings(id, act_id, venue_id, show_date,
                venue:venues(name, city, state, email),
                contact:contacts(id, first_name, last_name, email))`)
            .in('booking_id', bookingIds)
            .eq('category', 'target')
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase.from('email_drafts')
        .select(`id, category, subject, body, created_at, tour_venue_id,
          tourVenue:tour_venues(id, tour_id, venue_id,
            venue:venues(name, city, state, email))`)
        .eq('agent_id', user.id)
        .not('tour_venue_id', 'is', null)
        .eq('category', 'target')
        .order('created_at', { ascending: false }),
    ]);

    // Fetch contacts for tour venue drafts separately (tour_venues has no contacts FK)
    const tvDrafts = (tourVenueDraftsRes.data || []) as any[];
    const venueIdsForContacts = [...new Set(tvDrafts.map((d: any) => d.tourVenue?.venue_id).filter(Boolean))];
    let contactsByVenueId: Record<string, any> = {};
    if (venueIdsForContacts.length > 0) {
      const { data: tvContacts } = await supabase.from('contacts')
        .select('id, first_name, last_name, email, venue_id')
        .in('venue_id', venueIdsForContacts);
      for (const c of tvContacts || []) {
        if (!contactsByVenueId[c.venue_id]) contactsByVenueId[c.venue_id] = c;
      }
    }

    setLog(logRes.data || []);
    const allDrafts = [
      ...(bookingDraftsRes.data || []).map((d: any) => ({ ...d, _type: 'booking' })),
      ...tvDrafts.map((d: any) => ({
        ...d,
        _type: 'tour_venue',
        tourVenue: d.tourVenue ? { ...d.tourVenue, contact: contactsByVenueId[d.tourVenue.venue_id] || null } : null,
      })),
    ];
    setDrafts(allDrafts);
    setLoading(false);
  };

  const generateDrafts = async () => {
    setBackfilling(true);
    setBackfillMsg('');
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/email/backfill-drafts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      setBackfillMsg(`Error: ${data.error || 'Unknown error'}`);
    } else if (data.errors?.length) {
      setBackfillMsg(`Created ${data.created}, errors: ${data.errors[0]}`);
    } else if (data.created === 0) {
      setBackfillMsg(data.message || 'All up to date.');
    } else {
      setBackfillMsg(`Generated ${data.created} draft${data.created > 1 ? 's' : ''}.`);
    }
    await loadAll();
    setBackfilling(false);
  };

  const deleteDraft = async (id: string) => {
    setDeletingId(id);
    await supabase.from('email_drafts').delete().eq('id', id);
    setDrafts(prev => prev.filter(d => d.id !== id));
    setDeletingId(null);
  };

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Email</h1>
          <div className="page-sub">
            {myAct ? `${myAct.act_name} · ${drafts.length} draft${drafts.length !== 1 ? 's' : ''} · ${log.length} sent` : 'Band correspondence'}
          </div>
        </div>
        {myAct && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {backfillMsg && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{backfillMsg}</span>}
            <button className="btn btn-secondary" onClick={generateDrafts} disabled={backfilling}>
              {backfilling ? '⟳ Generating…' : '⟳ Generate Drafts'}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 76 }} />)}
        </div>
      ) : !myAct ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-muted)' }}>
          No active band found for this account.
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
            {([['drafts', `Pending Drafts (${drafts.length})`], ['sent', `Sent (${log.length})`]] as const).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  padding: '0.55rem 1.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
                  letterSpacing: '0.12em', textTransform: 'uppercase', background: 'transparent',
                  border: 'none', cursor: 'pointer', marginBottom: '-1px',
                  color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
                  borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                }}>
                {label}
                {t === 'drafts' && drafts.length > 0 && (
                  <span style={{ marginLeft: '0.35rem', background: 'var(--accent)', color: '#000', borderRadius: '999px', fontSize: '0.62rem', fontWeight: 700, padding: '1px 5px' }}>{drafts.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Pending Drafts tab */}
          {tab === 'drafts' && (
            drafts.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem', marginBottom: '1rem' }}>
                  No drafts yet. Click "Generate Drafts" to create cold pitch emails for your tour venues.
                </div>
                <button className="btn btn-primary" onClick={generateDrafts} disabled={backfilling}>
                  {backfilling ? '⟳ Generating…' : '⟳ Generate Drafts'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {drafts.map(d => {
                  const venue = d._type === 'tour_venue'
                    ? (d as any).tourVenue?.venue
                    : (d as any).booking?.venue;
                  const showDate = d._type === 'booking' ? (d as any).booking?.show_date : null;
                  return (
                    <div key={d.id} className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.15rem' }}>
                          {venue?.name || '—'}
                          {venue?.city && (
                            <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.5rem', fontSize: '0.82rem' }}>
                              {venue.city}, {venue.state}
                            </span>
                          )}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-body)' }}>
                          {d.subject || '(no subject)'}
                        </div>
                        {showDate && (
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                            {new Date(showDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        <button
                          className="btn btn-primary"
                          onClick={() => setDraftComposer(d)}
                          style={{ fontSize: '0.82rem' }}
                        >
                          Review & Send
                        </button>
                        <button
                          onClick={() => deleteDraft(d.id)}
                          disabled={deletingId === d.id}
                          style={{ fontSize: '0.82rem', padding: '0.35rem 0.65rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-muted)', cursor: 'pointer', opacity: deletingId === d.id ? 0.5 : 1 }}
                          title="Delete draft"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* Sent tab */}
          {tab === 'sent' && (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Recipient</th><th>Subject</th><th>Venue</th><th>Status</th><th>Sent</th></tr>
                  </thead>
                  <tbody>
                    {log.map(e => (
                      <tr key={e.id}>
                        <td style={{ color: 'var(--accent)', fontSize: '0.82rem' }}>{e.recipient || '—'}</td>
                        <td style={{ color: 'var(--text-primary)', fontSize: '0.85rem', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.subject || '—'}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{e.venue?.name || '—'}</td>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: STATUS_COLOR[e.status] || 'var(--text-muted)' }}>
                            {e.status}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(e.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {log.length === 0 && (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>
                    No emails sent yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {draftComposer && (() => {
        const isTourVenue = draftComposer._type === 'tour_venue';
        const tv = isTourVenue ? draftComposer.tourVenue : null;
        const bk = isTourVenue ? null : draftComposer.booking;
        const venue  = tv?.venue  || bk?.venue;
        const contact = tv?.contact || bk?.contact;
        return (
          <EmailComposer
            bookingId={bk?.id}
            tourVenueId={tv?.id}
            actId={myAct?.id}
            venueId={tv?.venue_id || bk?.venue_id}
            contactId={contact?.id}
            contactEmail={contact?.email || venue?.email || ''}
            defaultCategory={draftComposer.category || 'target'}
            initialSubject={draftComposer.subject || ''}
            initialBody={draftComposer.body || ''}
            draftId={draftComposer.id}
            onClose={() => {
              setDraftComposer(null);
              loadAll();
            }}
          />
        );
      })()}
    </AppShell>
  );
}
