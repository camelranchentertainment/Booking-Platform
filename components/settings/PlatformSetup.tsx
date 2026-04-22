import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';

type SettingRow = { key: string; configured: boolean; value?: string };

const SECTION_KEYS: Record<string, string[]> = {
  anthropic: ['anthropic_api_key'],
  firecrawl: ['firecrawl_api_key'],
  resend:    ['resend_api_key', 'resend_from_email', 'resend_webhook_secret'],
  stripe:    ['stripe_secret_key', 'stripe_webhook_secret', 'stripe_agent_price_id', 'stripe_band_price_id'],
  maps:      ['google_maps_api_key'],
};

function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.15rem 0.55rem',
      background: configured ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.10)',
      color: configured ? '#34d399' : '#fbbf24',
      letterSpacing: '0.06em',
    }}>
      {configured ? '✓ CONFIGURED' : '○ NOT SET'}
    </span>
  );
}

function Step({ num, title, body, link, code, note }: {
  num: string; title: string; body: string;
  link?: { label: string; href: string };
  code?: string;
  note?: string;
}) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem' }}>
      <div style={{
        flexShrink: 0, width: 22, height: 22,
        background: 'rgba(200,146,26,0.12)', border: '1px solid rgba(200,146,26,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--accent)',
      }}>{num}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.15rem' }}>{title}</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{body}</div>
        {link && <a href={link.href} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--accent)', textDecoration: 'none' }}>{link.label} ↗</a>}
        {code && <div style={{ marginTop: '0.3rem', fontFamily: 'var(--font-mono)', fontSize: '0.76rem', background: 'var(--bg-base)', border: '1px solid var(--border)', padding: '0.3rem 0.6rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{code}</div>}
        {note && <div style={{ marginTop: '0.3rem', fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: '#fbbf24', background: 'rgba(251,191,36,0.07)', padding: '0.3rem 0.6rem' }}>⚠ {note}</div>}
      </div>
    </div>
  );
}

export default function PlatformSetup() {
  const [settings, setSettings] = useState<Record<string, SettingRow>>({});
  const [forms, setForms]       = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving]     = useState('');
  const [saved, setSaved]       = useState('');
  const [open, setOpen]         = useState<Record<string, boolean>>({});
  const [baseUrl, setBaseUrl]   = useState('');

  useEffect(() => {
    setBaseUrl(window.location.origin);
    load();
  }, []);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/admin/platform-settings', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return;
    const rows: SettingRow[] = await res.json();
    const map: Record<string, SettingRow> = {};
    const f: Record<string, Record<string, string>> = {};
    for (const row of rows) {
      map[row.key] = row;
      // Pre-fill non-secret values into form
      for (const [sec, keys] of Object.entries(SECTION_KEYS)) {
        if (keys.includes(row.key) && row.value) {
          if (!f[sec]) f[sec] = {};
          f[sec][row.key] = row.value;
        }
      }
    }
    setSettings(map);
    setForms(f);
  };

  const save = async (section: string) => {
    setSaving(section);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(''); return; }
    const keys = SECTION_KEYS[section];
    const vals = forms[section] || {};
    await Promise.all(
      keys
        .filter(k => vals[k] !== undefined && vals[k] !== '')
        .map(k =>
          fetch('/api/admin/platform-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ key: k, value: vals[k] }),
          })
        )
    );
    setSaving('');
    setSaved(section);
    setTimeout(() => setSaved(''), 3000);
    await load();
  };

  const setField = (section: string, key: string, val: string) =>
    setForms(f => ({ ...f, [section]: { ...(f[section] || {}), [key]: val } }));

  const isConfigured = (section: string) =>
    SECTION_KEYS[section].some(k => settings[k]?.configured);

  const toggle = (section: string) =>
    setOpen(o => ({ ...o, [section]: !o[section] }));

  const field = (section: string, key: string, label: string, opts: {
    placeholder?: string; secret?: boolean; hint?: string; readonly?: string;
  } = {}) => (
    <div className="field" key={key}>
      <label className="field-label">{label}</label>
      {opts.readonly ? (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.78rem', background: 'var(--bg-base)',
          border: '1px solid var(--border)', padding: '0.5rem 0.75rem',
          color: 'var(--accent)', wordBreak: 'break-all',
        }}>{opts.readonly}</div>
      ) : (
        <input
          className="input"
          type={opts.secret ? 'password' : 'text'}
          placeholder={settings[key]?.configured ? '••••••  (leave blank to keep current)' : (opts.placeholder || '')}
          value={forms[section]?.[key] || ''}
          onChange={e => setField(section, key, e.target.value)}
          autoComplete="off"
        />
      )}
      {settings[key]?.configured && !opts.readonly && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#34d399' }}>✓ Configured</span>
      )}
      {opts.hint && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{opts.hint}</span>}
    </div>
  );

  const cardHeader = (id: string, icon: string, title: string) => (
    <button
      type="button"
      onClick={() => toggle(id)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '1.1rem' }}>{icon}</span>
        <span className="card-title">{title}</span>
        <StatusBadge configured={isConfigured(id)} />
      </div>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{open[id] ? '▲' : '▼'}</span>
    </button>
  );

  const saveRow = (section: string) => (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1.25rem' }}>
      <button className="btn btn-primary" onClick={() => save(section)} disabled={saving === section}>
        {saving === section ? 'Saving…' : 'Save'}
      </button>
      {saved === section && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#34d399' }}>✓ Saved</span>}
    </div>
  );

  const divider = <div style={{ height: 1, background: 'var(--border)', margin: '1rem 0' }} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* ── SECTION HEADER ── */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', paddingBottom: '0.25rem', borderBottom: '1px solid var(--border)' }}>
        Platform Setup
      </div>

      {/* ─────────────────────────────────────────────────
          AI ENGINE — Anthropic
      ───────────────────────────────────────────────── */}
      <div className="card">
        {cardHeader('anthropic', '✦', 'AI ENGINE — ANTHROPIC')}
        {open['anthropic'] && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Powers AI email drafts (cold pitches, follow-ups, replies) and venue website contact extraction.
            </p>
            {divider}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Step num="1" title="Create an Anthropic account"
                body="Sign up for an account at Anthropic's developer console."
                link={{ label: 'console.anthropic.com', href: 'https://console.anthropic.com' }} />
              <Step num="2" title="Generate an API key"
                body="In the console, go to Settings → API Keys → Create Key. Give it a name like 'Camel Ranch Booking'." />
              <Step num="3" title="Copy the key"
                body="The key starts with sk-ant-. Copy it immediately — it won't be shown again." />
              <Step num="4" title="Add billing"
                body="Go to Settings → Billing and add a payment method. New accounts get $5 free credit. Usage is low — typically under $5/month for this platform."
                link={{ label: 'console.anthropic.com/settings/billing', href: 'https://console.anthropic.com/settings/billing' }} />
            </div>
            {divider}
            {field('anthropic', 'anthropic_api_key', 'Anthropic API Key', { placeholder: 'sk-ant-...', secret: true })}
            {saveRow('anthropic')}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────
          VENUE SCRAPING — Firecrawl
      ───────────────────────────────────────────────── */}
      <div className="card">
        {cardHeader('firecrawl', '🕷', 'VENUE SCRAPING — FIRECRAWL')}
        {open['firecrawl'] && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Scrapes venue websites to automatically extract booking contacts, phone numbers, and email addresses.
            </p>
            {divider}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Step num="1" title="Create a Firecrawl account"
                body="Sign up at firecrawl.dev. The free tier includes 500 scrape credits/month, which is plenty for venue research."
                link={{ label: 'firecrawl.dev', href: 'https://firecrawl.dev' }} />
              <Step num="2" title="Get your API key"
                body="After signing in, go to your Dashboard and click API Keys. Copy your key — it starts with fc-." />
              <Step num="3" title="Paste it below"
                body="Enter the key and click Save. The Venue Scraper button in your Venues page will become active." />
            </div>
            {divider}
            {field('firecrawl', 'firecrawl_api_key', 'Firecrawl API Key', { placeholder: 'fc-...', secret: true })}
            {saveRow('firecrawl')}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────
          EMAIL DELIVERY — Resend
      ───────────────────────────────────────────────── */}
      <div className="card">
        {cardHeader('resend', '✉', 'EMAIL DELIVERY — RESEND')}
        {open['resend'] && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Sends booking pitch emails to venues and tracks delivery, bounces, and opens.
            </p>
            {divider}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Step num="1" title="Create a Resend account"
                body="Sign up at resend.com. The free plan includes 3,000 emails/month and 100/day."
                link={{ label: 'resend.com/signup', href: 'https://resend.com/signup' }} />
              <Step num="2" title="Add and verify your sending domain"
                body="In Resend: Domains → Add Domain. Enter your domain (e.g. camelranchbooking.com), then add the DNS records it shows you in your domain registrar (Cloudflare, GoDaddy, etc.). Wait for verification — usually a few minutes."
                link={{ label: 'resend.com/domains', href: 'https://resend.com/domains' }} />
              <Step num="3" title="Create an API key"
                body="Go to API Keys → Create API Key. Give it Full Access. Copy the key — it starts with re_."
                link={{ label: 'resend.com/api-keys', href: 'https://resend.com/api-keys' }} />
              <Step num="4" title="Set up the delivery webhook"
                body="Go to Webhooks → Add Endpoint. Paste your webhook URL below, select these events: email.delivered, email.bounced, email.opened, email.complained. Then copy the Signing Secret."
                link={{ label: 'resend.com/webhooks', href: 'https://resend.com/webhooks' }} />
            </div>
            {divider}
            {field('resend', 'resend_api_key', 'Resend API Key', { placeholder: 're_...', secret: true })}
            {field('resend', 'resend_from_email', 'From Email Address', {
              placeholder: 'booking@yourdomain.com',
              hint: 'Must use a domain you verified in Resend',
            })}
            {field('resend', 'resend_webhook_secret', 'Webhook Signing Secret', {
              placeholder: 'whsec_...',
              secret: true,
              hint: 'From Resend → Webhooks → your endpoint → Signing Secret',
            })}
            {field('resend', '_webhook_url', 'Your Webhook URL (paste into Resend)', {
              readonly: baseUrl ? `${baseUrl}/api/email/webhook` : 'Loading…',
            })}
            {saveRow('resend')}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────
          PAYMENTS — Stripe
      ───────────────────────────────────────────────── */}
      <div className="card">
        {cardHeader('stripe', '💳', 'PAYMENTS — STRIPE')}
        {open['stripe'] && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Handles subscription billing for agent and band accounts. Provides a hosted checkout page and customer billing portal.
            </p>
            {divider}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Step num="1" title="Create a Stripe account"
                body="Sign up at stripe.com. You can test everything in Test Mode before going live."
                link={{ label: 'dashboard.stripe.com/register', href: 'https://dashboard.stripe.com/register' }} />
              <Step num="2" title="Get your Secret Key"
                body="In the Stripe Dashboard: Developers → API Keys. Copy the Secret key (starts with sk_live_ or sk_test_ for testing). Never use the Publishable key here."
                link={{ label: 'dashboard.stripe.com/apikeys', href: 'https://dashboard.stripe.com/apikeys' }} />
              <Step num="3" title="Create two subscription products"
                body="Go to Product Catalog → Add Product. Create one for agents (e.g. 'Agent Plan') and one for bands (e.g. 'Band Plan'). Set a monthly recurring price for each. Copy the Price ID (starts with price_) for both."
                link={{ label: 'dashboard.stripe.com/products', href: 'https://dashboard.stripe.com/products' }} />
              <Step num="4" title="Add a webhook endpoint"
                body="Go to Developers → Webhooks → Add Endpoint. Paste your webhook URL below. Select these events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed. Copy the Signing Secret (starts with whsec_)."
                link={{ label: 'dashboard.stripe.com/webhooks', href: 'https://dashboard.stripe.com/webhooks' }} />
            </div>
            {divider}
            {field('stripe', 'stripe_secret_key', 'Stripe Secret Key', { placeholder: 'sk_live_... or sk_test_...', secret: true })}
            {field('stripe', 'stripe_webhook_secret', 'Webhook Signing Secret', { placeholder: 'whsec_...', secret: true })}
            {field('stripe', 'stripe_agent_price_id', 'Agent Plan Price ID', {
              placeholder: 'price_...',
              hint: 'Monthly recurring price for agent subscriptions',
            })}
            {field('stripe', 'stripe_band_price_id', 'Band Plan Price ID', {
              placeholder: 'price_...',
              hint: 'Monthly recurring price for band subscriptions',
            })}
            {field('stripe', '_webhook_url', 'Your Webhook URL (paste into Stripe)', {
              readonly: baseUrl ? `${baseUrl}/api/stripe/webhook` : 'Loading…',
            })}
            {saveRow('stripe')}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────
          MAPS — Google Maps
      ───────────────────────────────────────────────── */}
      <div className="card">
        {cardHeader('maps', '🗺', 'VENUE MAP — GOOGLE MAPS')}
        {open['maps'] && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Powers the interactive venue map on the Venues page. Displays pins for each venue and enables address prospecting by city/radius.
            </p>
            {divider}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Step num="1" title="Open Google Cloud Console"
                body="Go to console.cloud.google.com, create a project (or select an existing one), and enable billing."
                link={{ label: 'console.cloud.google.com', href: 'https://console.cloud.google.com' }} />
              <Step num="2" title="Enable required APIs"
                body="Search for and enable these three APIs: Maps JavaScript API, Places API, Geocoding API."
                link={{ label: 'console.cloud.google.com/apis/library', href: 'https://console.cloud.google.com/apis/library' }} />
              <Step num="3" title="Create an API key"
                body="Go to APIs & Services → Credentials → Create Credentials → API Key. Copy the key."
                link={{ label: 'console.cloud.google.com/apis/credentials', href: 'https://console.cloud.google.com/apis/credentials' }} />
              <Step num="4" title="Restrict the key (recommended)"
                body="Click on the key → Application restrictions: HTTP referrers. Add your domain (e.g. yourdomain.com/*) and your Vercel preview URLs. Under API restrictions, limit to the three APIs above."
                note="Never leave a Maps key unrestricted — it will accumulate unauthorized charges." />
            </div>
            {divider}
            {field('maps', 'google_maps_api_key', 'Google Maps API Key', {
              placeholder: 'AIza...',
              hint: 'Restrict this key to your domain in the Google Cloud Console',
            })}
            {saveRow('maps')}
          </div>
        )}
      </div>

    </div>
  );
}
