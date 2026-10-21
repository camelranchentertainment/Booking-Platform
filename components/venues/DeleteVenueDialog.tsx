// components/venues/DeleteVenueDialog.tsx
//
// Delete-venue confirmation on the Venues page. Before asking, it counts the
// band's shows at this venue: deleting a venue clears it from those shows
// (bookings.venue_id is ON DELETE SET NULL), so past shows would lose their
// venue name in History. The admin sees that count before confirming.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getVenueSession } from './venueSession';
import { useModalKeys } from './useModalKeys';

interface Props {
  venue: { id: string; name: string };
  onClose: () => void;
  /** Called after the venue is gone so the page can reload its list. */
  onDeleted: () => void;
}

export default function DeleteVenueDialog({ venue, onClose, onDeleted }: Props) {
  const [showCount, setShowCount] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useModalKeys<HTMLDivElement>(deleting ? () => undefined : onClose);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await getVenueSession();
      if (!s?.actId) return;
      const { count, error: countError } = await supabase
        .from('bookings').select('id', { count: 'exact', head: true })
        .eq('act_id', s.actId).eq('venue_id', venue.id);
      if (countError) { console.error('[venues] show count failed', countError); return; }
      if (!cancelled) setShowCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [venue.id]);

  const confirm = async (): Promise<void> => {
    setDeleting(true);
    setError('');
    try {
      const { error: deleteError } = await supabase.from('venues').delete().eq('id', venue.id);
      if (deleteError) {
        console.error('[venues] delete failed', { code: deleteError.code });
        setError('The venue couldn’t be deleted. Try again.');
        return;
      }
      onDeleted();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal venues-modal venues-modal--narrow" role="alertdialog" aria-modal="true"
        aria-labelledby="delete-venue-title" aria-describedby="delete-venue-desc">
        <div className="modal-header">
          <h3 className="modal-title" id="delete-venue-title">Delete venue?</h3>
        </div>
        <div id="delete-venue-desc" className="venues-form">
          <p className="venues-copy">Delete <strong>{venue.name}</strong> from your venues? This can’t be undone.</p>
          {showCount !== null && showCount > 0 && (
            <p className="venues-warning">
              It’s on <strong>{showCount} show{showCount === 1 ? '' : 's'}</strong>. Those shows stay, but they’ll lose their venue
              {' '}(they’ll read “Venue TBD” in your calendar and history). Edit the venue instead if you only need to fix its details.
            </p>
          )}
          {error && <p className="venues-error" role="alert">{error}</p>}
        </div>
        <div className="venues-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={deleting}>Keep it</button>
          <button type="button" className="btn btn-danger" onClick={() => void confirm()} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete venue'}
          </button>
        </div>
      </div>
    </div>
  );
}
