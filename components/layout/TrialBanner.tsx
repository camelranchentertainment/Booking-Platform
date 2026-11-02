// components/layout/TrialBanner.tsx
// Full-width notice at the top of the page when a free period is ending.
import Link from 'next/link';
import type { TrialNotice } from '../../lib/trialNotice';

export default function TrialBanner({ notice, href }: { notice: TrialNotice; href: string }) {
  return (
    <div
      role="status"
      style={{
        margin: '-1.75rem -2rem 1.5rem',
        padding: '0.6rem 2rem',
        background: 'var(--surface)',
        borderBottom: `2px solid ${notice.urgent ? 'var(--red)' : 'var(--accent)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem 1rem',
      }}
    >
      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>{notice.message}</span>
      <Link href={href} className="btn btn-primary btn-sm">Subscribe</Link>
    </div>
  );
}
