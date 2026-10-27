// __tests__/lib/notificationTypes.test.ts
//
// Guards the bug fixed in 20261027040000_notification_types.sql: app code
// wrote notification types the database constraint rejected, so notices were
// silently dropped. These tests keep the TS list, the latest migration's
// constraint and every literal type used in source in agreement.
import fs from 'fs';
import path from 'path';
import {
  NOTIFICATION_COLOR,
  NOTIFICATION_LABEL,
  NOTIFICATION_TYPES,
  isNotificationType,
} from '../../lib/notificationTypes';

const ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');

/** Types allowed by the most recent migration that (re)defines the constraint. */
function latestConstraintTypes(): string[] {
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort();
  for (let i = files.length - 1; i >= 0; i -= 1) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, files[i]), 'utf8');
    const m = sql.match(/add constraint notifications_type_check[\s\S]*?array\[([\s\S]*?)\]/i);
    if (m) return Array.from(m[1].matchAll(/'([a-z_]+)'/g), x => x[1]);
  }
  throw new Error('no migration defines notifications_type_check');
}

/** Every `.ts`/`.tsx` file under the given dirs, skipping tests. */
function sourceFiles(dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  dirs.forEach(d => walk(path.join(ROOT, d)));
  return out;
}

/** Literal `type: '...'` values inside notification inserts / createNotification calls. */
function typesUsedInSource(): Array<{ file: string; type: string }> {
  const found: Array<{ file: string; type: string }> = [];
  for (const file of sourceFiles(['pages', 'lib', 'components'])) {
    const src = fs.readFileSync(file, 'utf8');
    const callRe = /(from\(['"]notifications['"]\)\s*\.insert\(|createNotification\(|notifyActMembers\()/g;
    let call: RegExpExecArray | null;
    while ((call = callRe.exec(src))) {
      // Inspect the argument object right after the call opener.
      const window = src.slice(call.index, call.index + 600);
      const t = window.match(/\btype:\s*['"]([a-z_]+)['"]/);
      if (t) found.push({ file: path.relative(ROOT, file), type: t[1] });
    }
  }
  return found;
}

describe('notification types', () => {
  it('matches the database constraint exactly', () => {
    expect([...latestConstraintTypes()].sort()).toEqual([...NOTIFICATION_TYPES].sort());
  });

  it('covers every literal type the app writes', () => {
    const used = typesUsedInSource();
    expect(used.length).toBeGreaterThan(0);
    const unknown = used.filter(u => !isNotificationType(u.type));
    expect(unknown).toEqual([]);
  });

  it('includes the bulk-outreach summary type that used to be rejected', () => {
    expect(isNotificationType('bulk_send')).toBe(true);
    expect(isNotificationType('not_a_type')).toBe(false);
  });

  it('has a label and colour for every type', () => {
    for (const t of NOTIFICATION_TYPES) {
      expect(NOTIFICATION_LABEL[t]).toBeTruthy();
      expect(NOTIFICATION_COLOR[t]).toBeTruthy();
    }
  });
});
