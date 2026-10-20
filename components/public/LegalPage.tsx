// components/public/LegalPage.tsx
//
// Shared layout for public legal pages (/privacy, /delete-account).
// Public: no sign-in, no AppShell. Uses the design tokens from
// styles/globals.css so it follows light/dark theme like the rest of the site.
import Head from 'next/head';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LegalSection } from '../../lib/legalContent';
import { LEGAL_CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE } from '../../lib/legalContent';

interface LegalPageProps {
  title: string;
  description: string;
  /** Canonical path, e.g. "/privacy". */
  path: string;
  intro: ReactNode;
  sections: LegalSection[];
}

/** Renders a legal page: heading, effective date, table of contents and sections. */
export default function LegalPage({ title, description, path, intro, sections }: LegalPageProps) {
  return (
    <>
      <Head>
        <title>{`${title} · Camel Ranch Booking`}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`https://camelranchbooking.com${path}`} />
      </Head>

      <a href="#legal-main" className="legal-skip">Skip to content</a>

      <header className="legal-header">
        <Link href="/" className="legal-brand">Camel Ranch Booking</Link>
      </header>

      <main id="legal-main" className="legal-main">
        <h1 className="legal-title">{title}</h1>
        <p className="legal-date">Effective {LEGAL_EFFECTIVE_DATE}</p>
        <div className="legal-intro">{intro}</div>

        <nav aria-label="On this page" className="legal-toc">
          <ul>
            {sections.map(s => (
              <li key={s.id}><a href={`#${s.id}`}>{s.heading}</a></li>
            ))}
          </ul>
        </nav>

        {sections.map(s => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="legal-section">
            <h2 id={`${s.id}-h`}>{s.heading}</h2>
            {s.paragraphs?.map((p, i) => <p key={i}>{p}</p>)}
            {s.bullets && (
              <ul>{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
            )}
          </section>
        ))}

        <footer className="legal-footer">
          <p>
            Questions? <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
          </p>
          <p>
            <Link href="/privacy">Privacy Policy</Link>
            {' · '}
            <Link href="/delete-account">Delete your account</Link>
            {' · '}
            <Link href="/">Home</Link>
          </p>
        </footer>
      </main>

      <style jsx>{`
        .legal-skip {
          position: absolute; left: -9999px; top: 0;
          background: var(--accent); color: var(--bg); padding: 0.75rem 1rem; z-index: 10;
        }
        .legal-skip:focus { left: 1rem; top: 1rem; }
        .legal-header {
          border-bottom: 1px solid var(--border);
          padding: 1rem;
        }
        .legal-main {
          max-width: 46rem; margin: 0 auto; padding: 2rem 1rem 4rem;
          color: var(--text); font-family: var(--font-body); line-height: 1.65;
        }
        .legal-title {
          font-family: var(--font-display); font-weight: 400;
          font-size: clamp(2.5rem, 7vw, 3.5rem); letter-spacing: 0.02em; line-height: 1;
          margin: 0 0 0.5rem;
        }
        .legal-date { color: var(--text-muted); margin: 0 0 1.5rem; font-size: 0.9rem; }
        .legal-intro { font-size: 1.05rem; margin-bottom: 1.5rem; }
        .legal-toc {
          background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
          padding: 1rem 1.25rem; margin-bottom: 2rem;
        }
        .legal-toc ul { margin: 0; padding-left: 1.1rem; columns: 2 14rem; }
        .legal-section { margin-bottom: 2rem; scroll-margin-top: 1rem; }
        .legal-section h2 {
          font-family: var(--font-display); font-weight: 400; letter-spacing: 0.03em;
          font-size: 1.75rem; margin: 0 0 0.5rem; color: var(--accent);
        }
        .legal-section p { margin: 0 0 0.75rem; }
        .legal-section ul { margin: 0 0 0.75rem; padding-left: 1.25rem; }
        .legal-section li { margin-bottom: 0.4rem; }
        .legal-footer {
          border-top: 1px solid var(--border); padding-top: 1.5rem; margin-top: 2.5rem;
          color: var(--text-muted); font-size: 0.9rem;
        }
      `}</style>
      <style jsx global>{`
        .legal-brand {
          font-family: var(--font-display); font-size: 1.5rem; letter-spacing: 0.04em;
          color: var(--accent); text-decoration: none;
          display: inline-flex; align-items: center; min-height: 44px;
        }
        .legal-main a, .legal-footer a { color: var(--accent); text-underline-offset: 2px; }
        .legal-toc a { display: inline-block; padding: 0.15rem 0; }
        .legal-main a:focus-visible, .legal-brand:focus-visible {
          outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px;
        }
      `}</style>
    </>
  );
}
