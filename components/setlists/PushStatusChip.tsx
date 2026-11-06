// components/setlists/PushStatusChip.tsx
//
// Small status label for a set list: Draft / Pushed v3 · Nov 6 / Changes not pushed.
// The words carry the meaning; colour only reinforces it.

import { pushStatus, type SetListRow } from '../../lib/domain/setLists';

const shortWhen = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Status chip for one set list. */
export default function PushStatusChip({ row }: { row: Pick<SetListRow, 'published_at' | 'published_version' | 'updated_at'> }) {
  const status = pushStatus(row);
  if (status.kind === 'draft') {
    return <span className="sl-chip sl-chip--draft">Draft · not pushed</span>;
  }
  if (status.kind === 'changed') {
    return (
      <span className="sl-chip sl-chip--changed" title={`Members have version ${status.version} from ${shortWhen(status.at)}`}>
        Changes not pushed
      </span>
    );
  }
  return <span className="sl-chip sl-chip--pushed">Pushed v{status.version} · {shortWhen(status.at)}</span>;
}
