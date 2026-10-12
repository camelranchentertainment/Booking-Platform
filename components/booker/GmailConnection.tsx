// components/booker/GmailConnection.tsx
// Settings card: how the agent's email goes out. Connect Gmail to send from
// their own address (and keep copies in Gmail's Sent folder), or use the
// platform sender with replies going to them. Reads the result of Google's
// redirect back (?gmail=connected / ?gmail_error=…) and shows it once.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { disconnectGmail, getGmailStatus, startGmailConnect, type GmailStatus } from '../../lib/booker/data';
import { formatShowDate } from '../../lib/booker/dates';

const ERROR_TEXT: Record<string, string> = {
  denied: 'Gmail was not connected because access was declined on Google’s screen.',
  expired: 'That connection attempt expired. Please try again.',
  session: 'That connection attempt started in a different browser or session. Please try again here.',
  forbidden: 'That Gmail connection did not match your account. Please try again.',
  no_offline_access: 'Google did not grant ongoing access. Remove Camel Ranch Booking from your Google account’s third-party access, then connect again.',
  not_configured: 'Gmail connection is not set up on this site yet.',
};

export default function GmailConnection({ replyTo }: { replyTo: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<'connect' | 'disconnect' | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGmailStatus()
      .then(s => !cancelled && setStatus(s))
      .catch(err => !cancelled && setLoadError(err instanceof Error ? err.message : 'Could not check Gmail.'));
    return () => {
      cancelled = true;
    };
  }, []);

  // Show the outcome of Google's redirect once, then tidy the URL.
  useEffect(() => {
    if (!router.isReady) return;
    const { gmail, gmail_error } = router.query;
    if (gmail !== 'connected' && typeof gmail_error !== 'string') return;
    const next = gmail === 'connected' ? { kind: 'ok' as const, text: 'Gmail connected. Email you send from the workspace now goes out from your Gmail.' } : { kind: 'error' as const, text: ERROR_TEXT[String(gmail_error)] ?? 'Gmail could not be connected. Please try again.' };
    const t = setTimeout(() => setNotice(next), 0);
    void router.replace('/booker/settings', undefined, { shallow: true });
    return () => clearTimeout(t);
  }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setBusy('connect');
    setNotice(null);
    try {
      const { url } = await startGmailConnect();
      window.location.assign(url);
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not start connecting Gmail.' });
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy('disconnect');
    setNotice(null);
    try {
      await disconnectGmail();
      setStatus({ connected: false });
      setConfirmDisconnect(false);
      setNotice({ kind: 'ok', text: 'Gmail disconnected. Email now goes out through Camel Ranch Booking, with replies to you.' });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not disconnect Gmail.' });
    } finally {
      setBusy(null);
    }
  };

  const year = new Date().getFullYear();

  return (
    <section aria-labelledby="mail-h" className="card">
      <h2 id="mail-h" className="eyebrow" style={{ color: 'var(--accent)', fontSize: '1.05rem', margin: '0 0 0.9rem' }}>
        How your email is sent
      </h2>
      <div aria-live="polite">
        {notice && (
          <p role={notice.kind === 'error' ? 'alert' : 'status'} className="text-sm" style={{ color: notice.kind === 'ok' ? 'var(--green)' : 'var(--red)', marginTop: 0 }}>
            {notice.text}
          </p>
        )}
      </div>
      {loadError && (
        <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>
          {loadError}
        </p>
      )}
      {!status && !loadError && <p className="text-sm text-muted">Checking…</p>}

      {status?.connected && (
        <>
          <p className="text-sm" style={{ color: 'var(--text)', marginTop: 0 }}>
            <span className="badge badge-confirmed" style={{ marginRight: 8 }}>
              Gmail connected
            </span>
            Sending from <strong>{status.gmail_address}</strong> since {formatShowDate(status.connected_at.slice(0, 10), year)}.
          </p>
          <p className="text-xs text-muted">Venues see your own address, replies land in your Gmail, and every email is kept in your Sent folder.</p>
          {!confirmDisconnect ? (
            <button type="button" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => setConfirmDisconnect(true)}>
              Disconnect Gmail
            </button>
          ) : (
            <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="text-sm" style={{ color: 'var(--text)' }}>
                Disconnect {status.gmail_address}?
              </span>
              <button type="button" className="btn btn-danger btn-sm" onClick={disconnect} disabled={busy === 'disconnect'} aria-busy={busy === 'disconnect'}>
                {busy === 'disconnect' ? 'Disconnecting…' : 'Yes, disconnect'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDisconnect(false)} disabled={busy === 'disconnect'}>
                Keep it
              </button>
            </span>
          )}
        </>
      )}

      {status && !status.connected && (
        <>
          <p className="text-sm" style={{ color: 'var(--text)', marginTop: 0 }}>
            Email goes out through Camel Ranch Booking under your agency name.{' '}
            {replyTo ? (
              <>
                Replies go to <strong>{replyTo}</strong>.
              </>
            ) : (
              <>Add your email above so replies reach you.</>
            )}
          </p>
          <p className="text-xs text-muted">Use Gmail or Google Workspace? Connect it to send from your own address and keep every email in your Sent folder. Any other email provider works fine as it is.</p>
          <button type="button" className="btn btn-secondary" onClick={connect} disabled={busy === 'connect'} aria-busy={busy === 'connect'}>
            {busy === 'connect' ? 'Opening Google…' : 'Connect Gmail'}
          </button>
        </>
      )}
    </section>
  );
}
