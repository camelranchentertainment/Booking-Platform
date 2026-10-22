// components/booker/AgentBillingActions.tsx
//
// Subscribe / Manage billing for a Booking Agent, shown in the Plan card on
// /agent/settings. The server decides the plan and price
// (pages/api/stripe/checkout.ts, lib/server/billing.ts); this only starts the
// Stripe redirect and reports what happened.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

interface BillingState {
  status: string | null;
  trialEndsAt: string | null;
  hasSubscription: boolean;
}

const STATUS_TEXT: Record<string, string> = {
  active: 'Your subscription is active.',
  trialing: 'You are on a free trial.',
  past_due: 'Your last payment failed. Update your card in Manage billing to keep your account active.',
  cancelled: 'Your subscription is cancelled. Subscribe again to keep using the workspace.',
  inactive: 'You do not have an active subscription.',
};

/** Starts Stripe Checkout or the billing portal; returns an error message or null. */
async function openStripe(path: '/api/stripe/checkout' | '/api/stripe/portal'): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return 'Your session expired. Sign in again.';
  const res = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (res.ok && body.url) {
    window.location.href = body.url;
    return null;
  }
  return body.error || 'Billing is unavailable right now. Please try again in a moment.';
}

export default function AgentBillingActions() {
  const router = useRouter();
  const [state, setState] = useState<BillingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data, error: loadErr } = await supabase
        .from('profiles')
        .select('subscription_status, trial_ends_at, stripe_subscription_id')
        .eq('id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (loadErr || !data) {
        console.error('[agent billing] profile load failed', loadErr?.code);
        setError('We couldn’t load your billing status. Refresh to try again.');
        return;
      }
      setState({
        status: data.subscription_status ?? null,
        trialEndsAt: data.trial_ends_at ?? null,
        hasSubscription: Boolean(data.stripe_subscription_id),
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const go = async (path: '/api/stripe/checkout' | '/api/stripe/portal') => {
    if (busy) return;
    setBusy(true);
    setError('');
    const message = await openStripe(path);
    if (message) {
      setError(message);
      setBusy(false);
    }
  };

  const justSubscribed = router.query.subscribed === '1';
  const trialEnd = state?.trialEndsAt
    ? new Date(state.trialEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {justSubscribed && (
        <p role="status" className="text-sm" style={{ color: 'var(--green)', margin: 0 }}>
          Thanks — your subscription is being set up. It can take a minute to show here.
        </p>
      )}
      {state && (
        <p className="text-sm" style={{ color: 'var(--text)', margin: 0 }}>
          {STATUS_TEXT[state.status ?? 'inactive'] ?? STATUS_TEXT.inactive}
          {state.status === 'trialing' && trialEnd ? ` Free until ${trialEnd}.` : ''}
        </p>
      )}
      {error && <p role="alert" className="text-sm" style={{ color: '#f87171', margin: 0 }}>{error}</p>}
      {state && (
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          {state.hasSubscription ? (
            <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} disabled={busy} onClick={() => void go('/api/stripe/portal')}>
              {busy ? 'Opening…' : 'Manage billing'}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" style={{ minHeight: 44 }} disabled={busy} onClick={() => void go('/api/stripe/checkout')}>
              {busy ? 'Opening checkout…' : 'Subscribe — $35/month'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
