// components/venues/AddToTourModal.tsx
//
// "Add to tour" dialog on the Venues page: lists the band's open tours and
// adds the venue to a tour's target pool through /api/tours/venues.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { getVenueSession, authHeader } from './venueSession';
import { useModalKeys } from './useModalKeys';

interface TourPick { id: string; name: string; status: string | null; start_date: string | null }

interface Props {
  venue: { id: string; name: string; city?: string | null; state?: string | null };
  onClose: () => void;
}

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; tours: TourPick[] };

export default function AddToTourModal({ venue, onClose }: Props) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState('');
  const dialogRef = useModalKeys<HTMLDivElement>(onClose);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await getVenueSession();
      if (!s?.actId) { if (!cancelled) setLoad({ kind: 'error' }); return; }
      const { data, error: loadError } = await supabase
        .from('tours')
        .select('id, name, status, start_date')
        .eq('act_id', s.actId)
        .neq('status', 'cancelled')
        .order('start_date', { ascending: false, nullsFirst: true });
      if (cancelled) return;
      if (loadError) { console.error('[venues] tour list failed', loadError); setLoad({ kind: 'error' }); return; }
      setLoad({ kind: 'ready', tours: (data ?? []) as TourPick[] });
    })();
    return () => { cancelled = true; };
  }, []);

  const addTo = async (tourId: string): Promise<void> => {
    setAdding(tourId);
    setError('');
    try {
      const s = await getVenueSession();
      if (!s) { setError('Your session expired. Sign in again.'); return; }
      const res = await fetch('/api/tours/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(s.token) },
        body: JSON.stringify({ tour_id: tourId, venue_id: venue.id }),
      });
      if (!res.ok) {
        console.error('[venues] add to tour failed', res.status);
        if (res.status === 409) {
          // 409 covers "already in this tour's pool" and "tour has no band"; the server says which.
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          if (body?.error === 'Venue already in pool') { setAdded(prev => new Set(prev).add(tourId)); return; }
          setError(body?.error ?? 'Couldn’t add it to the tour.');
          return;
        }
        setError('Couldn’t add it to the tour. Try again.');
        return;
      }
      setAdded(prev => new Set(prev).add(tourId));
    } catch (err) {
      console.error('[venues] add to tour threw', err);
      setError('Couldn’t reach the server. Try again.');
    } finally {
      setAdding(null);
    }
  };

  const where = [venue.city, venue.state].filter(Boolean).join(', ');

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="modal venues-modal venues-modal--narrow" role="dialog" aria-modal="true" aria-labelledby="add-tour-title">
        <div className="modal-header">
          <h3 className="modal-title" id="add-tour-title">Add to a tour</h3>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <p className="venues-copy"><strong>{venue.name}</strong>{where ? ` · ${where}` : ''}</p>

        {load.kind === 'loading' && <p className="venues-hint" role="status">Loading tours…</p>}
        {load.kind === 'error' && <p className="venues-error" role="alert">Tours didn’t load. Close and try again.</p>}
        {load.kind === 'ready' && load.tours.length === 0 && (
          <p className="venues-copy">No open tours yet. <Link href="/tours" className="venues-accent">Plan a tour first →</Link></p>
        )}
        {load.kind === 'ready' && load.tours.length > 0 && (
          <ul className="venues-tour-list">
            {load.tours.map(t => (
              <li key={t.id} className="venues-tour-row">
                <span className="venues-tour-main">
                  <strong>{t.name}</strong>
                  {t.status && <span>{t.status.replace(/_/g, ' ')}</span>}
                </span>
                {added.has(t.id) ? (
                  <span className="tour-badge tour-badge--live" role="status">Added</span>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" disabled={adding !== null} onClick={() => void addTo(t.id)}>
                    {adding === t.id ? 'Adding…' : 'Add to pool'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="venues-error" role="alert">{error}</p>}
        <div className="venues-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
