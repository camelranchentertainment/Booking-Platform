// components/booker/ShowRow.tsx
// One show as a clickable row: date, band, venue, time, status, fee.

import { SHOW_STATUS_BADGE, SHOW_STATUS_LABEL, type BookerShow, type BookerVenue, type RosterBand } from '../../lib/booker/types';
import { formatShowDate, formatTime } from '../../lib/booker/dates';
import { formatMoney, toAmount } from '../../lib/booker/commission';
import { venueLabel } from '../../lib/booker/workspace';
import { BandDot } from './ui';

interface Props {
  show: BookerShow;
  band: RosterBand | undefined;
  venuesById: ReadonlyMap<string, BookerVenue>;
  onOpen: (show: BookerShow) => void;
  /** Hide the date (when rows are already grouped under a date heading) */
  hideDate?: boolean;
  /** Hide the band (on a single band's page) */
  hideBand?: boolean;
  currentYear: number;
}

export default function ShowRow({ show, band, venuesById, onOpen, hideDate, hideBand, currentYear }: Props) {
  const time = formatTime(show.set_time);
  const fee = toAmount(show.fee);
  const label = `${hideBand ? '' : `${band?.band_name ?? 'Unknown band'}, `}${venueLabel(show, venuesById)}, ${formatShowDate(show.show_date, currentYear)}, ${SHOW_STATUS_LABEL[show.status]}`;
  return (
    <button
      type="button"
      onClick={() => onOpen(show)}
      aria-label={`Open show: ${label}`}
      className="row-link"
      style={{
        display: 'grid',
        gridTemplateColumns: `${hideDate ? '' : '7.5rem '}minmax(0, 1fr) auto`,
        alignItems: 'center',
        gap: '0.75rem',
        width: '100%',
        textAlign: 'left',
        padding: '0.7rem 0.9rem',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        color: 'var(--text)',
        opacity: show.status === 'cancelled' ? 0.6 : 1,
      }}
    >
      {!hideDate && <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{formatShowDate(show.show_date, currentYear)}</span>}
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {!hideBand && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <BandDot color={band?.color ?? null} />
            {band?.band_name ?? 'Unknown band'}
          </span>
        )}
        <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {venueLabel(show, venuesById)}
          {time ? ` · ${time}` : ''}
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', justifyContent: 'flex-end' }}>
        {fee !== null && <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{formatMoney(fee)}</span>}
        <span className={`badge ${SHOW_STATUS_BADGE[show.status]}`}>{SHOW_STATUS_LABEL[show.status]}</span>
      </span>
    </button>
  );
}
