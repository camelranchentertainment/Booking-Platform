// components/VenueTownCheck.tsx
// "Check venue towns" — finds venues saved under the wrong town and lets the
// user correct them. Venues added from a Google search used to be saved under
// the town that was searched (Cahoots, Lebanon TN, filed as "Decherd").
//
// Used on the band's Venues page (/api/venues/towns) and the Booking Agent's
// venue book (/api/booker/venues/towns). Nothing changes until the user
// applies; the server re-checks every chosen venue with Google before writing.

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Modal } from './booker/ui';

interface TownFix {
  id: string;
  name: string;
  from: string;
  to: string;
}
interface TownCheck {
  fixes: TownFix[];
  checked: number;
  noPlaceId: number;
  unknown: number;
  truncated: boolean;
}

type Phase =
  | { step: 'checking' }
  | { step: 'review'; check: TownCheck }
  | { step: 'applying'; check: TownCheck }
  | { step: 'done'; applied: number; failed: number }
  | { step: 'error'; message: string };

interface Props {
  /** '/api/venues/towns' or '/api/booker/venues/towns' */
  endpoint: string;
  /** Called after corrections are written so the page can reload its list. */
  onApplied?: () => void;
}

/** Calls the towns endpoint with the user's session; throws with the server's message. */
async function callTowns<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Sign in again.');
  const res = await fetch(endpoint, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error || 'Something went wrong. Try again.');
  return json as T;
}

export default function VenueTownCheck({ endpoint, onApplied }: Props) {
  const [phase, setPhase] = useState<Phase | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const open = async () => {
    setPhase({ step: 'checking' });
    try {
      const check = await callTowns<TownCheck>(endpoint);
      setSelected(new Set(check.fixes.map(f => f.id)));
      setPhase({ step: 'review', check });
    } catch (err) {
      setPhase({ step: 'error', message: err instanceof Error ? err.message : 'Could not check towns.' });
    }
  };

  const apply = async (check: TownCheck) => {
    const ids = check.fixes.filter(f => selected.has(f.id)).map(f => f.id);
    if (ids.length === 0) return;
    setPhase({ step: 'applying', check });
    try {
      const result = await callTowns<{ applied: unknown[]; failed: number }>(endpoint, { method: 'POST', body: JSON.stringify({ ids }) });
      setPhase({ step: 'done', applied: result.applied.length, failed: result.failed });
      onApplied?.();
    } catch (err) {
      setPhase({ step: 'error', message: err instanceof Error ? err.message : 'Could not apply the corrections.' });
    }
  };

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const close = () => setPhase(null);

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => void open()} title="Find venues saved under the wrong town and correct them">
        ⌖ Check venue towns
      </button>
      {phase && (
        <Modal title="Check venue towns" onClose={close} wide>
          <TownCheckBody phase={phase} selected={selected} onToggle={toggle} onApply={c => void apply(c)} onClose={close} />
        </Modal>
      )}
    </>
  );
}

interface BodyProps {
  phase: Phase;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onApply: (check: TownCheck) => void;
  onClose: () => void;
}

function TownCheckBody({ phase, selected, onToggle, onApply, onClose }: BodyProps) {
  if (phase.step === 'checking') {
    return (
      <p role="status" className="text-sm text-muted" aria-live="polite">
        Asking Google where each venue is. This takes a few seconds for a big list…
      </p>
    );
  }
  if (phase.step === 'error') {
    return (
      <>
        <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>
          {phase.message}
        </p>
        <div className="flex gap-2" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </>
    );
  }
  if (phase.step === 'done') {
    return (
      <>
        <p role="status" className="text-sm" aria-live="polite">
          Corrected {phase.applied} venue{phase.applied === 1 ? '' : 's'}.
          {phase.failed > 0 && ` ${phase.failed} could not be saved; run the check again to retry them.`}
        </p>
        <div className="flex gap-2" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </>
    );
  }

  const { check } = phase;
  const busy = phase.step === 'applying';
  const count = check.fixes.filter(f => selected.has(f.id)).length;
  const notes = [
    check.noPlaceId > 0 && `${check.noPlaceId} added by hand (nothing to compare with)`,
    check.unknown > 0 && `${check.unknown} Google couldn't place`,
    check.truncated && 'only the first 400 venues were checked',
  ].filter(Boolean);

  return (
    <>
      <p className="text-sm text-muted" style={{ marginTop: 0 }}>
        Checked {check.checked} venue{check.checked === 1 ? '' : 's'} against Google.
        {check.fixes.length === 0 ? ' Every one is saved under the right town.' : ` ${check.fixes.length} ${check.fixes.length === 1 ? 'is' : 'are'} saved under a different town than Google has. Untick any you want to keep as they are.`}
        {notes.length > 0 && ` (${notes.join('; ')}.)`}
      </p>

      {check.fixes.length > 0 && (
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
          {/* Visually hidden, read by screen readers (no global sr-only class in this codebase). */}
          <legend style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Venues to correct</legend>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem', maxHeight: '22rem', overflowY: 'auto' }}>
            {check.fixes.map(f => (
              <li key={f.id}>
                <label
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.55rem 0.75rem', minHeight: 44,
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', cursor: 'pointer',
                  }}
                >
                  <input type="checkbox" checked={selected.has(f.id)} onChange={() => onToggle(f.id)} style={{ width: 18, height: 18 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, color: 'var(--text)' }}>{f.name}</span>
                    <span className="text-xs text-muted">
                      <s>{f.from}</s> → <span style={{ color: 'var(--text)' }}>{f.to}</span>
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <div className="flex gap-2" style={{ justifyContent: 'flex-end', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
          {check.fixes.length === 0 ? 'Close' : 'Cancel'}
        </button>
        {check.fixes.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={() => onApply(check)} disabled={busy || count === 0} aria-busy={busy}>
            {busy ? 'Correcting…' : `Correct ${count} venue${count === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </>
  );
}
