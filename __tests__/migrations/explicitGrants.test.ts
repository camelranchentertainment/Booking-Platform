// __tests__/migrations/explicitGrants.test.ts
//
// From Oct 30 2026 Supabase stops auto-granting Data API access to new tables
// in "public". A migration that creates a table without granting it leaves the
// table unreachable from supabase-js ("permission denied"). This test fails if
// any migration from that date on creates a public table and never grants it
// to service_role, or to authenticated unless the migration marks the table
// service-role only with a line `-- grants: service_role only <table>`.
import fs from 'fs';
import path from 'path';

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');
/** Migrations at or after this timestamp prefix are checked. */
export const GRANTS_REQUIRED_FROM = '20261030';

/** Public tables created in a migration's SQL. */
export function createdTables(sql: string): string[] {
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  return Array.from(sql.matchAll(re), m => m[1].toLowerCase());
}

/** True when the SQL grants something on `table` to the given role. */
export function grantsTo(sql: string, table: string, role: string): boolean {
  const re = new RegExp(
    `grant\\s+[^;]*?\\son\\s+(?:table\\s+)?[^;]*?\\b(?:public\\.)?${table}\\b[^;]*?\\sto\\s+[^;]*\\b${role}\\b`,
    'i',
  );
  return re.test(sql);
}

function checkedMigrations(): Array<{ file: string; sql: string }> {
  return fs
    .readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql') && f >= GRANTS_REQUIRED_FROM)
    .map(file => ({ file, sql: fs.readFileSync(path.join(MIGRATIONS, file), 'utf8') }));
}

describe('migration grant helpers', () => {
  it('detects created tables with and without schema / if not exists', () => {
    expect(createdTables('create table public.a (id int); CREATE TABLE IF NOT EXISTS b (x int);'))
      .toEqual(['a', 'b']);
  });

  it('detects grants including multi-table grants', () => {
    const sql = 'grant select, insert on public.a, public.b to authenticated;';
    expect(grantsTo(sql, 'a', 'authenticated')).toBe(true);
    expect(grantsTo(sql, 'b', 'authenticated')).toBe(true);
    expect(grantsTo(sql, 'a', 'service_role')).toBe(false);
  });
});

describe(`migrations from ${GRANTS_REQUIRED_FROM} grant every new table`, () => {
  it('grants service_role (and authenticated unless marked service-role only) on each new table', () => {
    const missing: string[] = [];
    for (const { file, sql } of checkedMigrations()) {
      for (const table of createdTables(sql)) {
        const serviceOnly = new RegExp(`--\\s*grants:\\s*service_role only\\s+${table}\\b`, 'i').test(sql);
        const roles = serviceOnly ? ['service_role'] : ['authenticated', 'service_role'];
        for (const role of roles) {
          if (!grantsTo(sql, table, role)) missing.push(`${file}: ${table} → ${role}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
