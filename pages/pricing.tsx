import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

type Plan = 'agent' | 'band_admin';

const PLANS = [
  {
    id:       'member' as const,
    name:     'Band Member',
    price:    'Free',
    period:   '',
    color:    '#34d399',
    features: [
      'View upcoming shows',
      'Band calendar access',
      'Set list & advance notes',
      'Mobile-friendly',
    ],
    cta:    'Join via invite',
    noBtn:  true,
  },
  {
    id:       'band_admin' as Plan,
    name:     'Band Admin',
    price:    '$15',
    period:   '/ month',
    color:    '#a78bfa',
    features: [
      'Band profile management',
      'Member invitations',
      'Show calendar',
      'Advance sheet sharing',
      'Agent collaboration',
    ],
    cta:    'Start Free Trial',
    noBtn:  false,
  },
  {
    id:       'agent' as Plan,
    name:     'Booking Agent',
    price:    '$30',
    period:   '/ month',
    color:    'var(--accent)',
    features: [
      'Unlimited acts & bookings',
      'AI email drafts (Resend)',
      'Tour route optimizer',
      'Venue CRM & contacts',
      'Booking pipeline (kanban)',
      'Everything in Band Admin',
    ],
    cta:      'Start Free Trial',
    noBtn:    false,
    featured: true,
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<Plan | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [trialMessage, setTrialMessage] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthed(!!user);
    });
    if (router.query.trial === 'expired') {
      setTrialMessage('Your 14-day trial has ended. Choose a plan to continue.');
    }
  }, [router.query.trial]);

  const subscribe = async (tier: Plan) => {
    setLoading(tier);
    try {
      if (!isAuthed) {
        router.push(`/login?redirect=/pricing&tier=${tier}`);
        return;
      }
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/stripe/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 1rem' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.75rem' }}>
          Camel Ranch Booking
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', color: 'var(--text-primary)', margin: '0 0 0.75rem' }}>
          Simple, Transparent Pricing
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: 480, margin: '0 auto' }}>
          14-day free trial on paid plans. No credit card required to start.
        </p>
        {trialMessage && (
          <div style={{ marginTop: '1rem', padding: '0.65rem 1.25rem', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '4px', color: '#fbbf24', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
            ⚠ {trialMessage}
          </div>
        )}
      </div>

      {/* Plan cards */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 960, width: '100%' }}>
        {PLANS.map(plan => (
          <div
            key={plan.id}
            style={{
              flex: '1 1 260px', maxWidth: 300,
              background: plan.featured ? 'var(--bg-overlay)' : 'var(--bg-card)',
              border: `1px solid ${plan.featured ? plan.color : 'var(--border)'}`,
              borderRadius: '6px',
              padding: '2rem 1.5rem',
              display: 'flex', flexDirection: 'column',
              boxShadow: plan.featured ? `0 0 32px rgba(196,154,60,0.1)` : 'none',
              position: 'relative',
            }}
          >
            {plan.featured && (
              <div style={{
                position: 'absolute', top: '-1px', left: '50%', transform: 'translateX(-50%)',
                background: 'var(--accent)', color: '#000',
                fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.2em',
                textTransform: 'uppercase', padding: '0.2rem 0.85rem', borderRadius: '0 0 4px 4px',
              }}>
                Most Popular
              </div>
            )}

            {/* Plan name */}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: plan.color, marginBottom: '0.5rem' }}>
              {plan.name}
            </div>

            {/* Price */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '1.5rem' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.6rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {plan.price}
              </span>
              {plan.period && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {plan.period}
                </span>
              )}
            </div>

            {/* Features */}
            <ul style={{ listStyle: 'none', margin: '0 0 2rem', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.55rem', flex: 1 }}>
              {plan.features.map(f => (
                <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <span style={{ color: plan.color, flexShrink: 0, marginTop: '0.1rem' }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>

            {/* CTA */}
            {plan.noBtn ? (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '3px' }}>
                Invite-only — free forever
              </div>
            ) : (
              <button
                className={`btn ${plan.featured ? 'btn-primary' : 'btn-secondary'}`}
                style={{ width: '100%' }}
                disabled={loading === plan.id}
                onClick={() => subscribe(plan.id as Plan)}
              >
                {loading === plan.id ? 'Redirecting...' : plan.cta}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p style={{ marginTop: '2.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: 480 }}>
        Subscriptions managed securely via Stripe. Cancel anytime from your billing settings.
      </p>
    </div>
  );
}
