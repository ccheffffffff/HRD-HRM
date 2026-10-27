import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { database } from './db';
import { PGlite } from '@electric-sql/pglite';
export async function applyMigrations() {
  const db = database();
  const files = readdirSync('db')
    .filter((n) => /^\d+_.+\.sql$/.test(n))
    .sort();
  async function run(
    q: (sql: string, params?: any[]) => Promise<any>,
    exec: (sql: string) => Promise<any>,
  ) {
    await q('SELECT pg_advisory_xact_lock(72942026)');
    await exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const file of files) {
      const sql = readFileSync('db/' + file, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const applied = (await q('SELECT checksum FROM schema_migrations WHERE name=$1', [file]))
        .rows[0];
      if (applied) {
        if (applied.checksum !== checksum)
          throw new Error('Applied migration has changed: ' + file);
        continue;
      }
      await exec(sql);
      await q('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [file, checksum]);
    }
  }
  if (db instanceof PGlite)
    await db.transaction((tx) =>
      run(
        (s, p) => tx.query(s, p),
        (s) => tx.exec(s),
      ),
    );
  else {
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      await run(
        (s, p) => c.query(s, p),
        (s) => c.query(s),
      );
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
}
