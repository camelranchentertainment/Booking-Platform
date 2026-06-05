import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import { seedDefaultTemplates } from '../lib/seedDefaultTemplates';

const STEPS = ['Welcome', 'First Venue', 'Email', 'Ready'] as const;

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep]     = useState(0);
  const [actName, setActName] = useState('');
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState('');
  const [actId, setActId]   = useState('');

  const [venue, setVenue] = useState({ name: '', city: '', state: '', email: '' });
  const [venueSaved, setVenueSaved] = useState(false);
  const [venueSaving, setVenueSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      setUserId(user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('act_id, role, onboarding_completed')
        .eq('id', user.id)
        .single();

      if (!profile || profile.role !== 'band_admin') { router.replace('/band'); return; }
      if (profile.onboarding_completed) { router.replace('/band'); return; }

      if (profile.act_id) {
        setActId(profile.act_id);
        const { data: act } = await supabase
          .from('acts')
          .select('act_name')
          .eq('id', profile.act_id)
          .single();
        if (act) setActName(act.act_name || '');
      }
    };
    load();
  }, [router]);

  const saveActName = async () => {
    if (!actId || !actName.trim()) return;
    setSaving(true);
    await supabase.from('acts').update({ act_name: actName.trim() }).eq('id', actId);
    setSaving(false);
    setStep(1);
  };

  const saveVenue = async () => {
    if (!venue.name.trim() || !actId) { setStep(2); return; }
    setVenueSaving(true);
    await supabase.from('venues').insert({
      act_id: actId,
      name:   venue.name.trim(),
      city:   venue.city.trim() || null,
      state:  venue.state.trim() || null,
      email:  venue.email.trim() || null,
      country: 'US',
    });
    setVenueSaved(true);
    setVenueSaving(false);
    setStep(2);
  };

  const finish = async () => {
    if (!userId) return;
    await supabase
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', userId);
    if (actId) {
      await seedDefaultTemplates(supabase, actId);
    }
    router.replace('/band');
  };

  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: '2.5rem 2rem',
    width: '100%',
    maxWidth: 480,
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  };

  const label: React.CSSProperties = {
    fontFamily: 'var(--font-body)',
    fontSize: '0.72rem',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: '0.3rem',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0E1628',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
      flexDirection: 'column',
      gap: '2rem',
    }}>
      {/* Progress */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: i <= step ? '#E8602A' : 'rgba(255,255,255,0.08)',
              border: `2px solid ${i <= step ? '#E8602A' : 'rgba(255,255,255,0.15)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: i <= step ? '#fff' : 'rgba(255,255,255,0.3)',
              fontWeight: 700, transition: 'all 0.2s',
            }}>
              {i < step ? '✓' : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: 32, height: 2, background: i < step ? '#E8602A' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s' }} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0 — Welcome & Act Name */}
      {step === 0 && (
        <div style={card}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: '#F5EDD9', lineHeight: 1, marginBottom: '0.5rem' }}>
              WELCOME TO CAMEL RANCH BOOKING
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
              Let's get your act set up in about 2 minutes.
            </div>
          </div>

          <div>
            <div style={label}>Act name</div>
            <input
              className="input"
              value={actName}
              onChange={e => setActName(e.target.value)}
              placeholder="Your act name"
              onKeyDown={e => e.key === 'Enter' && actName.trim() && saveActName()}
              style={{ fontSize: '16px' }}
            />
          </div>

          <button
            className="btn btn-primary btn-lg"
            onClick={saveActName}
            disabled={!actName.trim() || saving}
            style={{ width: '100%', justifyContent: 'center', fontSize: '16px' }}
          >
            {saving ? 'Saving...' : 'Continue →'}
          </button>
        </div>
      )}

      {/* Step 1 — Add First Venue */}
      {step === 1 && (
        <div style={card}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: '#F5EDD9', lineHeight: 1, marginBottom: '0.5rem' }}>
              ADD A VENUE
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
              Add a venue you've already played or want to target. You can add more later.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <div style={label}>Venue name <span style={{ color: '#E8602A' }}>*</span></div>
              <input className="input" value={venue.name} onChange={e => setVenue(v => ({ ...v, name: e.target.value }))} placeholder="The Fillmore" style={{ fontSize: '16px' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '0.5rem' }}>
              <div>
                <div style={label}>City</div>
                <input className="input" value={venue.city} onChange={e => setVenue(v => ({ ...v, city: e.target.value }))} placeholder="San Francisco" style={{ fontSize: '16px' }} />
              </div>
              <div>
                <div style={label}>State</div>
                <input className="input" value={venue.state} onChange={e => setVenue(v => ({ ...v, state: e.target.value }))} placeholder="CA" maxLength={2} style={{ fontSize: '16px' }} />
              </div>
            </div>
            <div>
              <div style={label}>Booking contact email</div>
              <input className="input" type="email" value={venue.email} onChange={e => setVenue(v => ({ ...v, email: e.target.value }))} placeholder="booking@venue.com" style={{ fontSize: '16px' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-ghost" onClick={() => setStep(2)} style={{ flex: 1, justifyContent: 'center' }}>
              Skip for now
            </button>
            <button
              className="btn btn-primary"
              onClick={saveVenue}
              disabled={venueSaving}
              style={{ flex: 2, justifyContent: 'center' }}
            >
              {venueSaving ? 'Saving...' : 'Save & Continue →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Connect Email */}
      {step === 2 && (
        <div style={card}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: '#F5EDD9', lineHeight: 1, marginBottom: '0.5rem' }}>
              CONNECT YOUR EMAIL
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
              Connect your email account to send booking outreach directly from the platform. Replies go straight to your inbox — not a shared inbox — so venues reach you.
            </div>
          </div>

          <div style={{
            background: 'rgba(232,96,42,0.08)',
            border: '1px solid rgba(232,96,42,0.25)',
            borderRadius: 8,
            padding: '0.85rem 1rem',
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.55,
          }}>
            You'll set up SMTP/IMAP credentials in Settings → Email Account after onboarding.
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-ghost" onClick={() => setStep(3)} style={{ flex: 1, justifyContent: 'center' }}>
              I'll do this later
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setStep(3)}
              style={{ flex: 2, justifyContent: 'center' }}
            >
              Got it →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — You're Ready */}
      {step === 3 && (
        <div style={card}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: '#E8602A', lineHeight: 1, marginBottom: '0.5rem' }}>
              YOU'RE READY
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
              Your act is set up. Here's what to do next:
            </div>
          </div>

          {(actName || venueSaved) && (
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 8,
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem',
              color: 'rgba(255,255,255,0.55)',
            }}>
              {actName && <div style={{ color: '#4CAF50' }}>✓ Act name: {actName}</div>}
              {venueSaved && <div style={{ color: '#4CAF50' }}>✓ First venue added</div>}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <button
              className="btn btn-primary"
              onClick={() => { finish(); router.push('/venues'); }}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Discover Venues
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => { finish(); router.push('/tours'); }}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Create Your First Tour
            </button>
            <button
              className="btn btn-ghost"
              onClick={finish}
              style={{ width: '100%', justifyContent: 'center', opacity: 0.7 }}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
