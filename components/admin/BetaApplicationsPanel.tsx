// components/admin/BetaApplicationsPanel.tsx
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { SHOWS_PER_YEAR_OPTIONS } from '../../lib/domain/betaProgram';

interface BetaApplicationRow {
  id: string;
  applicant_name: string;
  email: string;
  act_name: string;
  genre: string;
  home_base: string;
  shows_per_year: string;
  booking_method: string;
  website_url: string | null;
  agent_name: string | null;
  status: 'pending' | 'approved' | 'declined';
  reviewed_at: string | null;
  granted_at: string | null;
  created_at: string;
}

interface ListResponse {
  applications: BetaApplicationRow[];
  approved: number;
  spotsRemaining: number;
  cap: number;
}

type GrantResult =
  | { granted: true; trialEndsAt: string }
  | { granted: false; reason: 'no_account' | 'already_granted' | 'not_eligible' };

const GRANT_MESSAGES: Record<string, string> = {
  no_account:      'Approved. They have no account yet — the free year is applied automatically when they sign up with this email.',
  already_granted: 'The free year was already applied to this account.',
  not_eligible:    'Approved, but the free year was NOT applied: this account is already paying (or is not a band admin). Credit them manually in Stripe.',
};

const showsLabel = (v: string) => SHOWS_PER_YEAR_OPTIONS.find(o => o.value === v)?.label ?? v;

/** Superadmin review queue for founding beta applications. */
export default function BetaApplicationsPanel() {
  const [data, setData]       = useState<ListResponse | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [busyId, setBusyId]   = useState<string | null>(null);
  const [notice, setNotice]   = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const call = useCallback(async (method: 'GET' | 'POST', body?: Record<string, string>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/beta-applications', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await call('GET') as ListResponse);
      setLoadErr('');
    } catch (err) {
      setLoadErr(err instanceof Error ? err.message : 'Could not load applications');
    }
  }, [call]);

  useEffect(() => {
    let cancelled = false;
    call('GET')
      .then(json => { if (!cancelled) setData(json as ListResponse); })
      .catch(err => { if (!cancelled) setLoadErr(err instanceof Error ? err.message : 'Could not load applications'); });
    return () => { cancelled = true; };
  }, [call]);

  const review = async (app: BetaApplicationRow, action: 'approve' | 'decline' | 'grant') => {
    if (action === 'decline' && !window.confirm(`Decline ${app.act_name}?`)) return;
    setBusyId(app.id);
    setNotice(null);
    try {
      const result = await call('POST', { applicationId: app.id, action }) as { grant?: GrantResult };
      if (action === 'decline') {
        setNotice({ kind: 'ok', text: `${app.act_name} declined.` });
      } else if (result.grant?.granted) {
        setNotice({ kind: 'ok', text: `${app.act_name} approved — free year applied through ${new Date(result.grant.trialEndsAt).toLocaleDateString()}.` });
      } else if (result.grant) {
        setNotice({ kind: result.grant.reason === 'not_eligible' ? 'error' : 'ok', text: `${app.act_name}: ${GRANT_MESSAGES[result.grant.reason]}` });
      }
      await load();
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Action failed' });
    } finally {
      setBusyId(null);
    }
  };

  const statusColor = (s: BetaApplicationRow['status']) =>
    s === 'approved' ? '#34d399' : s === 'declined' ? 'var(--text-muted)' : '#fbbf24';

  return (
    <section aria-labelledby="beta-apps-heading" style={{ marginBottom: '2rem' }}>
      <h2 id="beta-apps-heading" style={{
        fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.3em',
        textTransform: 'uppercase', color: 'var(--accent)', margin: '0 0 0.75rem',
      }}>
        Founding Beta {data ? `· ${data.approved} of ${data.cap} approved · ${data.spotsRemaining} left` : ''}
      </h2>

      {notice && (
        <div role={notice.kind === 'error' ? 'alert' : 'status'} className="card" style={{
          padding: '0.75rem 1rem', marginBottom: '0.75rem', fontSize: '0.85rem',
          borderColor: notice.kind === 'error' ? '#f87171' : '#34d399',
        }}>
          {notice.text}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loadErr && <p role="alert" style={{ padding: '1rem 1.25rem', margin: 0, color: '#f87171' }}>{loadErr}</p>}
        {!loadErr && !data && <p role="status" style={{ padding: '1rem 1.25rem', margin: 0, color: 'var(--text-muted)' }}>Loading applications…</p>}
        {data && data.applications.length === 0 && (
          <p style={{ padding: '1rem 1.25rem', margin: 0, color: 'var(--text-muted)' }}>
            No applications yet. They&rsquo;ll appear here as bands apply from the homepage offer.
          </p>
        )}
        {data && data.applications.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Applied</th>
                  <th scope="col">Act</th>
                  <th scope="col">Contact</th>
                  <th scope="col">Genre · Base · Shows/yr</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    {/* Visually hidden but announced by screen readers. */}
                    <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.applications.map(app => {
                  const busy = busyId === app.id;
                  const full = data.spotsRemaining === 0;
                  return (
                    <tr key={app.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(app.created_at).toLocaleDateString()}</td>
                      <td>
                        <button
                          type="button" className="btn btn-ghost btn-sm" aria-expanded={expanded === app.id}
                          onClick={() => setExpanded(expanded === app.id ? null : app.id)}
                          style={{ padding: 0, fontWeight: 700, textAlign: 'left' }}
                        >
                          {app.act_name}
                        </button>
                        {expanded === app.id && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem', maxWidth: '28rem', lineHeight: 1.5 }}>
                            <div><strong>Books today by:</strong> {app.booking_method}</div>
                            {app.website_url && <div><strong>Link:</strong> <a href={app.website_url} target="_blank" rel="noopener noreferrer nofollow">{app.website_url}</a></div>}
                            {app.agent_name && <div><strong>Agent/manager:</strong> {app.agent_name}</div>}
                          </div>
                        )}
                      </td>
                      <td>
                        {app.applicant_name}<br />
                        <a href={`mailto:${app.email}`} style={{ fontSize: '0.8rem' }}>{app.email}</a>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{app.genre} · {app.home_base} · {showsLabel(app.shows_per_year)}</td>
                      <td>
                        <span style={{ color: statusColor(app.status), fontWeight: 700, fontSize: '0.78rem', textTransform: 'capitalize' }}>{app.status}</span>
                        {app.status === 'approved' && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {app.granted_at ? 'Free year applied' : 'Awaiting sign-up'}
                          </div>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {app.status === 'pending' && (
                          <>
                            <button type="button" className="btn btn-primary btn-sm" disabled={busy || full}
                              title={full ? 'All beta spots are filled' : undefined}
                              onClick={() => review(app, 'approve')}>
                              {busy ? 'Working…' : 'Approve'}
                            </button>{' '}
                            <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                              onClick={() => review(app, 'decline')}>
                              Decline
                            </button>
                          </>
                        )}
                        {app.status === 'approved' && !app.granted_at && (
                          <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                            title="Apply the free year now if they have signed up"
                            onClick={() => review(app, 'grant')}>
                            {busy ? 'Working…' : 'Apply free year'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
