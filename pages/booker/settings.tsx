// pages/booker/settings.tsx
// The agent's profile and plan.

import { useState, type FormEvent } from 'react';
import BookerShell, { useBooker } from '../../components/booker/BookerShell';
import { ErrorBanner, Field, PageHeader } from '../../components/booker/ui';
import { listRoster, updateBookerProfile } from '../../lib/booker/data';
import { BookerProfileSchema, fieldErrors } from '../../lib/booker/schemas';
import { AGENT_TIERS, tierForBandCount } from '../../lib/booker/pricing';
import { toFormValues, useLoad } from '../../lib/booker/useLoad';

const PROFILE_KEYS = ['agency_name', 'contact_name', 'contact_email', 'contact_phone', 'default_commission_pct'] as const;

function SettingsContent() {
  const { booker, refreshBooker } = useBooker();
  const [values, setValues] = useState(() => toFormValues(booker, PROFILE_KEYS));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const roster = useLoad(listRoster);
  const activeBands = roster.data?.filter(b => b.status === 'active').length ?? null;
  const tier = activeBands === null ? null : tierForBandCount(activeBands);

  const set = (k: (typeof PROFILE_KEYS)[number]) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);
    setValues(v => ({ ...v, [k]: e.target.value }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const parsed = BookerProfileSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await updateBookerProfile(booker.id, parsed.data);
      await refreshBooker();
      setSaved(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" sub="Your agency" />
      <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
        <section aria-labelledby="profile-h" className="card">
          <h2 id="profile-h" className="eyebrow" style={{ color: 'var(--accent)', fontSize: '1.05rem', margin: '0 0 0.9rem' }}>
            Agency profile
          </h2>
          {formError && <ErrorBanner message={formError} />}
          <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <Field label="Agency name" required error={errors.agency_name}>
              {p => <input {...p} className="input" value={values.agency_name} onChange={set('agency_name')} />}
            </Field>
            <Field label="Your name" error={errors.contact_name}>
              {p => <input {...p} className="input" value={values.contact_name} onChange={set('contact_name')} />}
            </Field>
            <div className="grid-2">
              <Field label="Email" error={errors.contact_email}>
                {p => <input {...p} className="input" type="email" value={values.contact_email} onChange={set('contact_email')} />}
              </Field>
              <Field label="Phone" error={errors.contact_phone}>
                {p => <input {...p} className="input" type="tel" value={values.contact_phone} onChange={set('contact_phone')} />}
              </Field>
            </div>
            <Field label="Default commission %" hint="Pre-filled when you add a new band" error={errors.default_commission_pct}>
              {p => <input {...p} className="input" inputMode="decimal" value={values.default_commission_pct} onChange={set('default_commission_pct')} />}
            </Field>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <span role="status" className="text-sm" style={{ color: 'var(--green)' }}>
                {saved ? 'Saved' : ''}
              </span>
            </div>
          </form>
        </section>

        <section aria-labelledby="plan-h" className="card">
          <h2 id="plan-h" className="eyebrow" style={{ color: 'var(--accent)', fontSize: '1.05rem', margin: '0 0 0.9rem' }}>
            Plan
          </h2>
          <p className="text-sm" style={{ color: 'var(--text)', marginTop: 0 }}>
            {tier && activeBands !== null
              ? `You carry ${activeBands} active band${activeBands === 1 ? '' : 's'}, which is the ${tier.label} tier${tier.monthlyUsd !== null ? ` ($${tier.monthlyUsd}/month)` : ''}.`
              : 'Loading your plan…'}
          </p>
          <ul className="text-sm text-muted" style={{ paddingLeft: '1.1rem', lineHeight: 1.8 }}>
            {AGENT_TIERS.map(t => (
              <li key={t.key}>
                <strong style={{ color: 'var(--text)' }}>{t.label}</strong> — {t.maxBands === null ? `${t.minBands}+ bands` : `up to ${t.maxBands} bands`}:{' '}
                {t.monthlyUsd === null ? 'contact us for pricing' : `$${t.monthlyUsd}/month`}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted" style={{ marginBottom: 0 }}>
            Billing for Booking Agent accounts is not switched on yet. Beta accounts are free during the beta.
          </p>
        </section>
      </div>
    </>
  );
}

export default function BookerSettings() {
  return (
    <BookerShell title="Settings">
      <SettingsContent />
    </BookerShell>
  );
}
