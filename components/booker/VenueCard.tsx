// components/booker/VenueCard.tsx
// One venue (or festival, fair, promoter, private event) in the agent's book,
// drawn as a Tours-style card (.tour-card): name in the display face, type
// badge, town, booking email, a matched contact when the search hit one, and
// Contacts / Shows / Upcoming counts. The whole card links to the venue page.
// Counting comes from lib/booker/summary.ts.

import Link from 'next/link';
import { formatShowDate } from '../../lib/booker/dates';
import type { VenueCardData } from '../../lib/booker/summary';
import { VENUE_KIND_LABEL } from '../../lib/booker/types';

interface Props {
  card: VenueCardData;
  currentYear: number;
  /** The current "search your book" text, to show which contact matched */
  search?: string;
}

/** The first contact whose name or email matches the search, if the venue itself didn't. */
function matchedContact(card: VenueCardData, search: string | undefined): string | null {
  const q = search?.trim().toLowerCase();
  if (!q) return null;
  const v = card.venue;
  if ([v.name, v.city, v.state, v.email].some(x => x?.toLowerCase().includes(q))) return null;
  return card.contacts.find(c => c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.title?.toLowerCase().includes(q))?.name ?? null;
}

export default function VenueCard({ card, currentYear, search }: Props) {
  const { venue } = card;
  const town = [venue.city, venue.state].filter(Boolean).join(', ');
  const email = venue.email ?? card.contacts.find(c => c.email)?.email ?? null;
  const hit = matchedContact(card, search);

  return (
    <Link href={`/booker/venues/${venue.id}`} className="tour-card">
      <div className="tour-card-head">
        <div className="tour-card-title-block">
          <h3 className="tour-card-name">{venue.name}</h3>
          <span className="tour-card-dates">
            {town || 'Town not set'}
            {venue.capacity ? <span className="tour-card-when"> · cap {venue.capacity.toLocaleString()}</span> : null}
          </span>
        </div>
        <span className={`tour-badge tour-badge--${venue.kind === 'venue' ? 'outline' : 'done'}`}>{VENUE_KIND_LABEL[venue.kind] ?? 'Venue'}</span>
      </div>

      <p className="agent-band-next">
        <span className="agent-band-next-label">{hit ? 'Matched contact' : card.lastPlayed ? 'Last played' : 'Booking email'}</span>
        {hit ? hit : card.lastPlayed ? `${formatShowDate(card.lastPlayed, currentYear)}${email ? ` · ${email}` : ''}` : (email ?? 'None yet — open it to scan the website')}
      </p>

      <div className="tour-card-foot">
        <dl className="tour-card-counts">
          <div>
            <dt>Contacts</dt>
            <dd>{card.contacts.length}</dd>
          </div>
          <div>
            <dt>Shows</dt>
            <dd>{card.shows}</dd>
          </div>
          <div>
            <dt>Upcoming</dt>
            <dd>{card.upcoming}</dd>
          </div>
        </dl>
        <span className="tour-card-cta" aria-hidden="true">
          Open venue →
        </span>
      </div>
    </Link>
  );
}
