// components/admin/SignupCodesPanel.tsx
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { usesRemaining } from '../../lib/domain/signupCode';

interface Redemption {
  id: string;
  redeemed_at: string;
  trial_ends_at: string;
  profile: { email: string; display_name: string | null } | null;
}

interface CodeRow {
  id: string;
  code: string;
  label: string;
  grant_days: number;
  max_uses: number;
  uses: number;
  is_active: boolean;
  redemptions: Redemption[];
}

type Action =
  | { action: 'create'; code: string; label: string; grantDays: number; maxUses: number }
  | { action: 'set_active'; id: string; isActive: boolean }
  | { action: 'set_max_uses'; id: string; maxUses: number }
  | { action: 'apply_to_account'; code: string; email: string };

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Superadmin view of signup codes: usage, who redeemed, and controls. */
export default function SignupCodesPanel() {
  const [codes, setCodes]     = useState<CodeRow[] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [busy, setBusy]       = useState(false);
  const [notice, setNotice]   = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [newCode, setNewCode] = useState({ code: '', label: '', grantDays: '365', maxUses: '10' });
  const [apply, setApply]     = useState({ code: '', email: '' });

  const call = useCallback(async (method: 'GET' | 'POST', body?: Action) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/signup-codes', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json as { codes: CodeRow[] };
  }, []);

  useEffect(() => {
    call('GET').then(j => setCodes(j.codes)).catch(e => setLoadErr(e instanceof Error ? e.message : 'Could not load codes'));
  }, [call]);

  const run = async (body: Action, success: string, after?: () => void) => {
    setBusy(true);
    setNotice(null);
    try {
      const j = await call('POST', body);
      setCodes(j.codes);
      setNotice({ kind: 'ok', text: success });
      after?.();
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  };

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    void run(
      { action: 'create', code: newCode.code, label: newCode.label, grantDays: Number(newCode.grantDays), maxUses: Number(newCode.maxUses) },
      'Code created.',
      () => setNewCode({ code: '', label: '', grantDays: '365', maxUses: '10' }),
    );
  };

  const onApply = (e: React.FormEvent) => {
    e.preventDefault();
    void run({ action: 'apply_to_account', code: apply.code, email: apply.email }, 'Code applied to that account.', () => setApply(a => ({ code: a.code, email: '' })));
  };

  return (
    <section aria-labelledby="signup-codes-heading" style={{ marginBottom: '2rem' }}>
      <div id="signup-codes-heading" style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#E07820', marginBottom: '0.75rem' }}>
        Signup Codes
      </div>

      {loadErr && <div role="alert" style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{loadErr}</div>}
      {notice && (
        <div role={notice.kind === 'error' ? 'alert' : 'status'} style={{ color: notice.kind === 'error' ? '#f87171' : '#34d399', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          {notice.text}
        </div>
      )}
      {!codes && !loadErr && <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</div>}

      {codes?.map(c => (
        <div key={c.id} className="card" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', letterSpacing: '0.06em' }}>{c.code}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                {c.label} · {c.grant_days} days free · {c.uses} of {c.max_uses} used ({usesRemaining(c.uses, c.max_uses)} left)
                {!c.is_active && ' · inactive'}
              </div>
            </div>
            <button
              type="button" className="btn btn-sm" disabled={busy}
              onClick={() => run({ action: 'set_active', id: c.id, isActive: !c.is_active }, c.is_active ? 'Code turned off.' : 'Code turned on.')}
            >
              {c.is_active ? 'Turn off' : 'Turn on'}
            </button>
          </div>

          {c.redemptions.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Signed up</th><th>Free until</th></tr></thead>
                <tbody>
                  {c.redemptions.map(r => (
                    <tr key={r.id}>
                      <td>{r.profile?.display_name || '—'}</td>
                      <td>{r.profile?.email || '—'}</td>
                      <td>{fmt(r.redeemed_at)}</td>
                      <td>{fmt(r.trial_ends_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <div className="grid-2" style={{ gap: '1rem', alignItems: 'start' }}>
        <form onSubmit={onApply} className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Apply a code to an existing account</div>
          <label className="field-label" htmlFor="apply-code">Code</label>
          <input id="apply-code" className="input" required value={apply.code} onChange={e => setApply(a => ({ ...a, code: e.target.value }))} autoComplete="off" />
          <label className="field-label" htmlFor="apply-email">Account email</label>
          <input id="apply-email" className="input" type="email" required value={apply.email} onChange={e => setApply(a => ({ ...a, email: e.target.value }))} />
          <button className="btn" type="submit" disabled={busy}>Apply code</button>
        </form>

        <form onSubmit={onCreate} className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Create a code</div>
          <label className="field-label" htmlFor="new-code">Code</label>
          <input id="new-code" className="input" required minLength={4} maxLength={40} value={newCode.code} onChange={e => setNewCode(n => ({ ...n, code: e.target.value }))} autoComplete="off" />
          <label className="field-label" htmlFor="new-label">Label (only you see this)</label>
          <input id="new-label" className="input" required maxLength={120} value={newCode.label} onChange={e => setNewCode(n => ({ ...n, label: e.target.value }))} />
          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="new-days">Free days</label>
              <input id="new-days" className="input" type="number" min={1} max={1095} required value={newCode.grantDays} onChange={e => setNewCode(n => ({ ...n, grantDays: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="new-max">Max uses</label>
              <input id="new-max" className="input" type="number" min={1} required value={newCode.maxUses} onChange={e => setNewCode(n => ({ ...n, maxUses: e.target.value }))} />
            </div>
          </div>
          <button className="btn" type="submit" disabled={busy}>Create code</button>
        </form>
      </div>
    </section>
  );
}
