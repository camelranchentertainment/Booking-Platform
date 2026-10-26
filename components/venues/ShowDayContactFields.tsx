// components/venues/ShowDayContactFields.tsx
// Day-of Contact and Sound Engineer inputs (name + phone each), shared by the
// Add Venue form, the venue page and the show details form so they read the
// same everywhere.

import React from 'react';
import {
  SHOW_DAY_NAME_MAX,
  SHOW_DAY_PHONE_MAX,
  type ShowDayContacts,
} from '../../lib/showDayContacts';

interface Props {
  value: ShowDayContacts;
  onChange: (next: ShowDayContacts) => void;
  /** Keeps label/input ids unique when two forms are on one page. */
  idPrefix: string;
  /** One line under the heading explaining where these values go. */
  hint: string;
  disabled?: boolean;
}

/**
 * Renders a fieldset with Day-of Contact and Sound Engineer, each a name and a
 * phone input with programmatically associated labels.
 */
export default function ShowDayContactFields({ value, onChange, idPrefix, hint, disabled }: Props) {
  const field = (key: keyof ShowDayContacts) =>
    (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value });
  const hintId = `${idPrefix}-showday-hint`;

  const pair = (
    title: string,
    nameKey: 'dayOfName' | 'soundName',
    phoneKey: 'dayOfPhone' | 'soundPhone',
    namePlaceholder: string,
  ) => (
    <div className="grid-2">
      <div className="field">
        <label className="field-label" htmlFor={`${idPrefix}-${nameKey}`}>{title}</label>
        <input
          id={`${idPrefix}-${nameKey}`}
          className="input"
          value={value[nameKey]}
          onChange={field(nameKey)}
          maxLength={SHOW_DAY_NAME_MAX}
          autoComplete="off"
          placeholder={namePlaceholder}
          aria-describedby={hintId}
          disabled={disabled}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`${idPrefix}-${phoneKey}`}>{title} phone</label>
        <input
          id={`${idPrefix}-${phoneKey}`}
          className="input"
          type="tel"
          inputMode="tel"
          value={value[phoneKey]}
          onChange={field(phoneKey)}
          maxLength={SHOW_DAY_PHONE_MAX}
          autoComplete="off"
          disabled={disabled}
        />
      </div>
    </div>
  );

  return (
    <fieldset className="venues-fieldset">
      <legend className="venues-section-title venues-legend">Show Day Contacts</legend>
      <p id={hintId} className="venues-hint">{hint}</p>
      {pair('Day-of contact', 'dayOfName', 'dayOfPhone', 'Who meets you on the night')}
      {pair('Sound engineer', 'soundName', 'soundPhone', 'House sound engineer')}
    </fieldset>
  );
}
