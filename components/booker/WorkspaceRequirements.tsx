// components/booker/WorkspaceRequirements.tsx
// Home-page disclosure: what the Booking Agent workspace needs and how it
// handles the agent's mail, contacts and AI. Kept plain and always reachable
// so nothing about sending or sharing is a surprise.
//
// While Gmail is not connected the panel is open and leads with that
// requirement (sending is blocked without it). Once connected it collapses to
// a one-line "How this workspace works" the agent can expand any time.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getGmailStatus, type GmailStatus } from '../../lib/booker/data';

const POINTS: Array<{ title: string; text: string }> = [
  {
    title: 'Gmail is required to send email.',
    text: 'Email from the workspace goes out only through your own Gmail or Google Workspace account. Camel Ranch Booking asks Google for permission to compose and send, never to read your inbox. Your Gmail is used only for your agent workspace and is never connected to a band’s account.',
  },
  {
    title: 'You approve everything that goes out.',
    text: 'Templates, AI drafts and assistant suggestions only fill in a draft or a proposal. Nothing is sent, booked or changed until you click to send or approve. Always read an AI draft before sending it.',
  },
  {
    title: 'Your contacts stay yours.',
    text: 'Bands never see your venue contacts unless you tick “Show to my bands” on that contact.',
  },
  {
    title: 'Commission is set per band.',
    text: 'The rate you enter for each band is used to track what you are owed. The band pays you directly; Camel Ranch Booking does not collect or pay commission.',
  },
  {
    title: 'Your workspace is separate from band pages.',
    text: 'What you track here does not change any band’s own Camel Ranch calendar, finances or email.',
  },
];

export default function WorkspaceRequirements() {
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getGmailStatus()
      .then(s => !cancelled && setGmail(s))
      .catch(() => !cancelled && setCheckFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const needsGmail = gmail !== null && !gmail.connected;

  return (
    <section aria-labelledby="ws-req-h" className="card" style={{ marginBottom: '1.5rem', borderColor: needsGmail ? 'var(--accent)' : undefined }}>
      {needsGmail && (
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <p className="text-sm" style={{ color: 'var(--text)', margin: 0, flex: '1 1 280px' }}>
            <strong style={{ color: 'var(--accent)' }}>Action needed:</strong> connect your Gmail before you can send email from the workspace. Everything else works without it.
          </p>
          <Link href="/agent/settings#gmail" className="btn btn-primary btn-sm">
            Connect Gmail
          </Link>
        </div>
      )}
      {checkFailed && (
        <p className="text-xs text-muted" style={{ margin: '0 0 0.75rem' }}>
          Could not check your Gmail connection right now. You can see it in Settings.
        </p>
      )}
      <details open={needsGmail || undefined}>
        <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
          <h2 id="ws-req-h" className="eyebrow" style={{ color: 'var(--accent)', fontSize: '1rem', margin: 0, display: 'inline' }}>
            How this workspace works
          </h2>
        </summary>
        <ul className="text-sm text-muted" style={{ paddingLeft: '1.1rem', lineHeight: 1.7, margin: '0.5rem 0 0' }}>
          {POINTS.map(p => (
            <li key={p.title} style={{ marginBottom: '0.35rem' }}>
              <strong style={{ color: 'var(--text)' }}>{p.title}</strong> {p.text}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
