// components/booker/OfferTemplatesCard.tsx
// "Standard terms" on the agent's Settings page (build list item 4): reusable
// terms and hospitality that fill new offers and deal memos. One can be the
// default. Placeholders like {{fee}} are filled from the show when an offer is
// drafted. Templates are archived, never deleted.

import { useState, type FormEvent } from 'react';
import { useBooker } from './BookerShell';
import { ErrorBanner, Field, SkeletonRows } from './ui';
import { fieldErrors, OfferTemplateSchema } from '../../lib/booker/schemas';
import { archiveOfferTemplate, createOfferTemplate, listOfferTemplates, updateOfferTemplate } from '../../lib/booker/offerData';
import { TEMPLATE_PLACEHOLDERS, unknownPlaceholders, type OfferTemplate } from '../../lib/booker/offers';
import { useLoad } from '../../lib/booker/useLoad';

/** A neutral starting point the agent edits to their own terms. */
export const SAMPLE_TERMS = `{{band}} will perform at {{venue}}, {{city}} on {{date}}.
Load-in {{load_in}}, doors {{doors}}, set at {{set_time}} for {{set_length}}.

Deal: {{deal}}, {{fee}}. Deposit of {{deposit}} due {{deposit_due}}; balance paid to the artist in cash or check on the night, before the performance.

Venue provides a working PA, sound engineer, stage lighting and a secure load-in.
Cancellation by the venue within 30 days of the show: the deposit is kept by the artist.
Cancellation for severe weather or circumstances beyond either party's control: both parties will work in good faith to reschedule.`;

export const SAMPLE_HOSPITALITY = 'Meals or a buyout for the band and crew, drinks during the show, and four guest list spots.';

type Editing = { template: OfferTemplate | null } | null;

export default function OfferTemplatesCard() {
  const { data, loading, error, reload } = useLoad(listOfferTemplates);
  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState('');

  return (
    <section aria-labelledby="terms-h" className="card" style={{ gridColumn: '1 / -1' }}>
      <div className="flex items-center justify-between mb-3" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <h2 id="terms-h" className="agent-card-title">
          Standard terms
        </h2>
        {!editing && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing({ template: null })}>
            + Add terms
          </button>
        )}
      </div>
      <p className="text-sm text-muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
        Your usual offer terms. They fill in new offers and deal memos, with the band, venue, date and money taken from the show. You can still edit each offer before it goes.
      </p>
      <div aria-live="polite">
        {notice && (
          <p role="status" className="text-sm" style={{ color: 'var(--green)', margin: '0 0 0.75rem' }}>
            {notice}
          </p>
        )}
      </div>
      {error && <ErrorBanner message={error} onRetry={() => void reload()} />}
      {editing ? (
        <TemplateForm
          template={editing.template}
          isFirst={(data?.length ?? 0) === 0}
          onCancel={() => setEditing(null)}
          onSaved={msg => {
            setEditing(null);
            setNotice(msg);
            void reload();
          }}
        />
      ) : loading && !data ? (
        <SkeletonRows rows={2} />
      ) : !data || data.length === 0 ? (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="text-sm" style={{ color: 'var(--text)' }}>
            No standard terms yet.
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing({ template: null })}>
            Start from a sample
          </button>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
          {data.map(t => (
            <TemplateRow
              key={t.id}
              template={t}
              onEdit={() => {
                setNotice('');
                setEditing({ template: t });
              }}
              onRemoved={msg => {
                setNotice(msg);
                void reload();
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function TemplateRow({ template: t, onEdit, onRemoved }: { template: OfferTemplate; onEdit: () => void; onRemoved: (msg: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <li className="agent-handoff-row">
      <span>
        <strong>{t.name}</strong>
        {t.is_default && <span className="badge badge-confirmed" style={{ marginLeft: 8 }}>Default</span>}
        <span className="text-xs text-muted" style={{ display: 'block' }}>
          {t.terms.split('\n')[0].slice(0, 120) || 'No terms text'}
        </span>
        {error && (
          <span role="alert" className="text-xs" style={{ color: 'var(--red)', fontWeight: 700 }}>
            {error}
          </span>
        )}
      </span>
      <span style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit} disabled={busy}>
          Edit
        </button>
        {confirm ? (
          <>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy}
              aria-busy={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await archiveOfferTemplate(t.id);
                  onRemoved(`“${t.name}” removed. Offers already made from it keep their terms.`);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not remove it.');
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Removing…' : 'Yes, remove'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)} disabled={busy}>
              Keep
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(true)}>
            Remove
          </button>
        )}
      </span>
    </li>
  );
}

function TemplateForm({ template, isFirst, onCancel, onSaved }: { template: OfferTemplate | null; isFirst: boolean; onCancel: () => void; onSaved: (msg: string) => void }) {
  const { booker } = useBooker();
  const [values, setValues] = useState({
    name: template?.name ?? (isFirst ? 'Standard offer' : ''),
    terms: template?.terms ?? (isFirst ? SAMPLE_TERMS : ''),
    hospitality: template?.hospitality ?? (isFirst ? SAMPLE_HOSPITALITY : ''),
    is_default: template ? String(template.is_default) : String(isFirst),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const unknown = unknownPlaceholders(`${values.terms}\n${values.hospitality}`);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setFormError('');
    const parsed = OfferTemplateSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const saved = template ? await updateOfferTemplate(template.id, parsed.data) : await createOfferTemplate(booker.id, parsed.data);
      onSaved(`“${saved.name}” saved.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save. Try again.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={e => void submit(e)} noValidate style={{ display: 'grid', gap: '0.9rem' }}>
      {formError && <ErrorBanner message={formError} />}
      <div className="grid-2">
        <Field label="Name" required error={errors.name}>
          {p => <input {...p} className="input" maxLength={80} value={values.name} onChange={e => setValues(v => ({ ...v, name: e.target.value }))} placeholder="e.g. Club guarantee" />}
        </Field>
        <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', cursor: 'pointer', minHeight: 44, alignSelf: 'end' }}>
          <input type="checkbox" checked={values.is_default === 'true'} onChange={e => setValues(v => ({ ...v, is_default: String(e.target.checked) }))} style={{ width: 18, height: 18 }} />
          <span className="text-sm" style={{ color: 'var(--text)' }}>
            Use for new offers by default
          </span>
        </label>
      </div>
      <Field label="Terms" hint="Printed on the offer. Use the placeholders below to fill in details from the show." error={errors.terms}>
        {p => <textarea {...p} className="textarea" maxLength={8000} value={values.terms} onChange={e => setValues(v => ({ ...v, terms: e.target.value }))} style={{ minHeight: 200 }} />}
      </Field>
      <Field label="Hospitality" error={errors.hospitality}>
        {p => <textarea {...p} className="textarea" maxLength={2000} value={values.hospitality} onChange={e => setValues(v => ({ ...v, hospitality: e.target.value }))} style={{ minHeight: 60 }} />}
      </Field>
      {unknown.length > 0 && (
        <p role="status" className="text-sm" style={{ margin: 0, color: 'var(--orange)', fontWeight: 700 }}>
          Not recognised, so it will print as written: {unknown.map(u => `{{${u}}}`).join(', ')}
        </p>
      )}
      <details>
        <summary className="text-sm text-muted" style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
          Placeholders you can use
        </summary>
        <ul className="text-xs text-muted" style={{ columns: '2 16rem', margin: '0.25rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.8 }}>
          {TEMPLATE_PLACEHOLDERS.map(([key, label]) => (
            <li key={key}>
              <code style={{ color: 'var(--text)' }}>{`{{${key}}}`}</code> {label}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted" style={{ margin: '0.25rem 0 0' }}>
          A placeholder with nothing to fill in prints as “TBD”.
        </p>
      </details>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
          {busy ? 'Saving…' : 'Save terms'}
        </button>
      </div>
    </form>
  );
}
