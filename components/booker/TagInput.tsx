// components/booker/TagInput.tsx
// A list of tags typed one at a time. Enter or comma adds the typed tag
// (leaving the field adds it too), each chip has its own remove button, and
// Backspace in an empty field removes the last tag. Suggestions come from a
// native <datalist>, which works with screen readers and on phones.
//
// Tags are cleaned the same way the database requires (lib/booker/tags.ts).

import { useId, useState, type KeyboardEvent } from 'react';
import { MAX_TAGS, normalizeTag } from '../../lib/booker/tags';

interface TagInputProps {
  /** id, aria-invalid and aria-describedby from <Field> */
  inputProps: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string };
  value: readonly string[];
  onChange: (tags: string[]) => void;
  suggestions?: readonly string[];
}

/** Chips plus a text field for adding tags. */
export default function TagInput({ inputProps, value, onChange, suggestions = [] }: TagInputProps) {
  const listId = useId();
  const statusId = useId();
  const [draft, setDraft] = useState('');
  const [announce, setAnnounce] = useState('');
  const full = value.length >= MAX_TAGS;

  const add = (raw: string) => {
    const tag = normalizeTag(raw);
    setDraft('');
    if (!tag) return;
    if (value.includes(tag)) {
      setAnnounce(`“${tag}” is already added`);
      return;
    }
    if (full) {
      setAnnounce(`Up to ${MAX_TAGS} tags`);
      return;
    }
    onChange([...value, tag]);
    setAnnounce(`Added ${tag}`);
  };

  const remove = (tag: string) => {
    onChange(value.filter(t => t !== tag));
    setAnnounce(`Removed ${tag}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      // Enter must not submit the whole form while a tag is being typed.
      if (draft.trim() || e.key === ',') e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      remove(value[value.length - 1]);
    }
  };

  const offered = suggestions.filter(s => !value.includes(s));
  const describedBy = [inputProps['aria-describedby'], statusId].filter(Boolean).join(' ');

  return (
    <div className="tag-input">
      {value.length > 0 && (
        <ul className="tag-chips" aria-label="Tags added">
          {value.map(tag => (
            <li key={tag} className="tag-chip">
              <span>{tag}</span>
              <button type="button" className="tag-chip-remove" onClick={() => remove(tag)} aria-label={`Remove tag ${tag}`}>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        {...inputProps}
        aria-describedby={describedBy}
        className="input"
        value={draft}
        list={offered.length ? listId : undefined}
        onChange={e => {
          // A comma typed or pasted mid-text adds everything before it.
          const v = e.target.value;
          if (v.includes(',')) {
            const parts = v.split(',');
            const last = parts.pop() ?? '';
            parts.forEach(add);
            setDraft(last);
          } else {
            setDraft(v);
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={full ? `Up to ${MAX_TAGS} tags` : 'Type a tag, then Enter'}
        disabled={full && draft === ''}
        autoComplete="off"
        enterKeyHint="done"
      />
      {offered.length > 0 && (
        <datalist id={listId}>
          {offered.map(s => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      <span id={statusId} className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
