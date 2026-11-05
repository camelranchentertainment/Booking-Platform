import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

/** Sends one request to the agent-access route as the signed-in user. */
async function callAccess(init?: RequestInit): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Your session ended. Sign in again.');
  const res = await fetch('/api/gmail/agent-access', {
    ...init,
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
  });
  const body = await res.json().catch(() => null) as { enabled?: boolean; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(body?.error?.message ?? 'That didn\'t save. Try again.');
  return body?.enabled === true;
}

/**
 * Settings switch that lets the booking agent search the connected Gmail.
 * Off by default, and off whenever the setting can't be loaded.
 */
export default function AgentGmailAccessToggle({ gmailAddress }: { gmailAddress: string }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    callAccess()
      .then(value => { if (active) setEnabled(value); })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'Could not load this setting.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  const change = async (next: boolean) => {
    setBusy(true);
    setError('');
    try {
      setEnabled(await callAccess({ method: 'PUT', body: JSON.stringify({ enabled: next }) }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'That didn\'t save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minHeight: 44, fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-primary)', cursor: busy ? 'default' : 'pointer' }}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={e => void change(e.target.checked)}
          aria-describedby="agent-gmail-help"
        />
        Let the booking agent search this Gmail
      </label>
      <p id="agent-gmail-help" style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        When you ask, the agent can read matching emails in {gmailAddress}, including sent mail. Those emails go to Anthropic, our AI provider, to answer you, and its replies stay in your agent history. It can&apos;t send or change anything from this switch, and security and banking emails are withheld. Off by default.
      </p>
      {error && <p role="alert" style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#f87171' }}>{error}</p>}
    </div>
  );
}
