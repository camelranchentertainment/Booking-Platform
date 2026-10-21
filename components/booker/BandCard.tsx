// components/booker/BandCard.tsx
// One band on the agent's roster, drawn as a Tours-style card (.tour-card):
// the band name in the display face over its colour stripe, home town, the
// next show, and Booked / Holds / Rate counts. The whole card links to the
// band's page. Counting comes from lib/booker/summary.ts.

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { formatShowDate } from '../../lib/booker/dates';
import type { BandCardData } from '../../lib/booker/summary';
import { venueLabel } from '../../lib/booker/workspace';
import type { BookerVenue } from '../../lib/booker/types';

interface Props {
  card: BandCardData;
  venuesById: ReadonlyMap<string, BookerVenue>;
  currentYear: number;
}

/** Badge text and Tours badge variant for a band's state. */
function badgeFor(card: BandCardData): { text: string; variant: string } {
  if (card.band.status === 'inactive') return { text: 'Inactive', variant: 'muted' };
  if (card.needsRate) return { text: 'Needs rate', variant: 'urgent' };
  if (card.booked > 0) return { text: 'Working', variant: 'live' };
  if (card.holds > 0) return { text: 'Holds out', variant: 'done' };
  return { text: 'Open calendar', variant: 'outline' };
}

export default function BandCard({ card, venuesById, currentYear }: Props) {
  const { band, nextShow } = card;
  const badge = badgeFor(card);
  const home = [band.home_city, band.home_state].filter(Boolean).join(', ');
  // The band's own colour drives the stripe; it is user data, so it is set as a
  // custom property and the stylesheet falls back to the accent when absent.
  const style = band.color ? ({ '--band-color': band.color } as CSSProperties) : undefined;

  return (
    <Link href={`/booker/bands/${band.id}`} className={`tour-card agent-band-card${band.status === 'inactive' ? ' tour-card--past' : ''}`} style={style}>
      <div className="tour-card-head">
        <div className="tour-card-title-block">
          <h3 className="tour-card-name">{band.band_name}</h3>
          <span className="tour-card-dates">
            {home || 'Home town not set'}
            {band.genre && <span className="tour-card-when"> · {band.genre}</span>}
          </span>
        </div>
        <span className={`tour-badge tour-badge--${badge.variant}`}>{badge.text}</span>
      </div>

      <p className="agent-band-next">
        {nextShow ? (
          <>
            <span className="agent-band-next-label">{nextShow.status === 'confirmed' ? 'Next show' : nextShow.status === 'hold' ? 'Next hold' : 'Next offer'}</span>
            {formatShowDate(nextShow.show_date, currentYear)} · {venueLabel(nextShow, venuesById)}
          </>
        ) : (
          <span className="agent-band-next-label">Nothing on the calendar</span>
        )}
      </p>

      <div className="tour-card-foot">
        <dl className="tour-card-counts">
          <div>
            <dt>Booked</dt>
            <dd>{card.booked}</dd>
          </div>
          <div>
            <dt>Holds</dt>
            <dd>{card.holds}</dd>
          </div>
          <div>
            <dt>Rate</dt>
            <dd>{band.commission_pct === null ? '—' : `${band.commission_pct}%`}</dd>
          </div>
        </dl>
        <span className="tour-card-cta" aria-hidden="true">
          Open band →
        </span>
      </div>
    </Link>
  );
}
