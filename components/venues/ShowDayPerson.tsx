// components/venues/ShowDayPerson.tsx
// "Name · phone" for a show-day person, with the phone as a tap-to-call link.

import React from 'react';
import { telHref } from '../../lib/showDayContacts';

interface Props {
  name?: string | null;
  phone?: string | null;
}

/** Renders the name and a callable phone; either may be missing. Renders nothing when both are. */
export default function ShowDayPerson({ name, phone }: Props) {
  const href = telHref(phone);
  if (!name && !phone) return null;
  return (
    <span>
      {name}
      {name && phone ? ' · ' : null}
      {phone && (href
        ? <a href={href} style={{ color: 'var(--accent)' }} aria-label={`Call ${name ? `${name} at ` : ''}${phone}`}>{phone}</a>
        : phone)}
    </span>
  );
}
