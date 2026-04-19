import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

export default function Landing() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle().then(({ data }) => {
          const role = data?.role || 'agent';
          if (role === 'agent') router.replace('/dashboard');
          else if (role === 'act_admin') router.replace('/band');
          else router.replace('/member');
        });
      } else {
        setChecking(false);
      }
    });
  }, []);

  if (checking) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 2.5rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', letterSpacing: '0.1em', color: 'var(--accent)' }}>
          CAMEL RANCH <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', letterSpacing: '0.15em' }}>BOOKING</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Link href="/login" className="btn btn-secondary">Sign In</Link>
          <Link href="/register" className="btn btn-primary">Get Started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '5rem 2rem 3rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '1rem' }}>
          Professional Booking Management
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(3rem, 8vw, 6rem)', letterSpacing: '0.04em', lineHeight: 1, marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
          BOOK SMARTER.<br />
          <span style={{ color: 'var(--accent)' }}>TOUR HARDER.</span>
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '1.1rem', color: 'var(--text-secondary)', maxWidth: 520, lineHeight: 1.6, marginBottom: '2.5rem' }}>
          A full-stack booking platform for agents, acts, and band members. Manage your entire pipeline from first pitch to final advance — all in one place.
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/register" className="btn btn-primary btn-lg">Create Free Account</Link>
          <Link href="/login" className="btn btn-secondary btn-lg">Sign In</Link>
        </div>
      </section>

      {/* Tier cards */}
      <section style={{ padding: '4rem 2rem', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '2.5rem' }}>
          Three tiers. One platform.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>

          {/* Agent */}
          <div style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--accent)' }}>Tier 1</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', letterSpacing: '0.04em' }}>BOOKING AGENT</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Manage your full roster of acts. Run the booking pipeline, pitch venues, track tours, manage contacts, and handle the entire business side of touring.
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {['Multi-act dashboard','9-stage booking pipeline','Tour routing & management','Venue + contact database','Email outreach via Resend','Invite your acts & members'].map(f => (
                <li key={f} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ color: 'var(--accent)' }}>◈</span> {f}
                </li>
              ))}
            </ul>
            <Link href="/register?role=agent" className="btn btn-primary" style={{ marginTop: 'auto', justifyContent: 'center' }}>
              Register as Agent
            </Link>
          </div>

          {/* Act Admin */}
          <div style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a78bfa' }}>Tier 2</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', letterSpacing: '0.04em' }}>ACT ADMIN</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              The band leader or manager. See your full show schedule, confirmed bookings, tour details, and advance info. Manage your band roster.
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {['Full show schedule','Booking status & details','Advance sheets','Tour calendar','Band member management','Venue & load-in info'].map(f => (
                <li key={f} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ color: '#a78bfa' }}>◈</span> {f}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 'auto', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', fontSize: '0.8rem', color: '#a78bfa', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              Invited by your booking agent
            </div>
            <Link href="/register?role=act_admin" className="btn btn-secondary" style={{ justifyContent: 'center', borderColor: '#a78bfa', color: '#a78bfa' }}>
              Join with Invite Code
            </Link>
          </div>

          {/* Member */}
          <div style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#34d399' }}>Tier 3</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', letterSpacing: '0.04em' }}>BAND MEMBER</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Individual band member access. See your confirmed upcoming shows, venue details, set times, load-in info, and advance sheets — nothing more, nothing less.
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {['Upcoming confirmed shows','Set times & load-in','Venue address & phone','Advance notes','Tour calendar','Read-only access'].map(f => (
                <li key={f} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ color: '#34d399' }}>◈</span> {f}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 'auto', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', fontSize: '0.8rem', color: '#34d399', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              Invited by your booking agent
            </div>
            <Link href="/register?role=member" className="btn btn-secondary" style={{ justifyContent: 'center', borderColor: '#34d399', color: '#34d399' }}>
              Join with Invite Code
            </Link>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '1.5rem 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.12em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          © {new Date().getFullYear()} Camel Ranch Entertainment
        </div>
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          <Link href="/login" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Sign In</Link>
          <Link href="/register" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>Get Started</Link>
        </div>
      </footer>

    </div>
  );
}
