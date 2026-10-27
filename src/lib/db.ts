import { Pool, type PoolClient } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
type Row = Record<string, any>;
const globalDb = globalThis as unknown as {
  pool?: Pool;
  lite?: PGlite;
  liteReady?: Promise<void>;
  queue?: Promise<unknown>;
};
export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required. Run pnpm run setup.');
  if (url.startsWith('pglite:')) {
    if (url !== 'pglite:memory')
      mkdirSync(path.dirname(path.resolve(url.slice(7))), { recursive: true });
    globalDb.lite ??= new PGlite(
      url === 'pglite:memory' ? 'memory://' : path.resolve(url.slice(7)),
    );
    globalDb.liteReady ??= globalDb.lite.waitReady.then(async () => {
      await globalDb.lite!.exec("SET TIME ZONE 'Asia/Bangkok'");
    });
    return globalDb.lite;
  }
  globalDb.pool ??= new Pool({
    connectionString: url,
    max: 10,
    options: '-c timezone=Asia/Bangkok',
  });
  return globalDb.pool;
}
export interface DB {
  query<T extends Row = Row>(
    text: string,
    values?: any[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}
// PGlite has one connection: serialize transactions and standalone queries to avoid interleaving.
async function serial<T>(fn: () => Promise<T>): Promise<T> {
  const prior = globalDb.queue ?? Promise.resolve();
  let unlock!: () => void;
  globalDb.queue = new Promise<void>((r) => {
    unlock = r;
  });
  await prior.catch(() => {});
  try {
    return await fn();
  } finally {
    unlock();
  }
}
export async function query<T extends Row = Row>(text: string, values: any[] = []): Promise<T[]> {
  const db = database();
  if (db instanceof PGlite)
    return serial(async () => {
      await globalDb.liteReady;
      return (await db.query<T>(text, values)).rows;
    });
  return (await db.query<T>(text, values)).rows;
}
export async function transaction<T>(fn: (db: DB) => Promise<T>): Promise<T> {
  const db = database();
  if (db instanceof PGlite)
    return serial(async () => {
      await globalDb.liteReady;
      return db.transaction(async (tx) => fn(tx as DB));
    });
  const client: PoolClient = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
export async function closeDatabase() {
  if (globalDb.pool) {
    await globalDb.pool.end();
    delete globalDb.pool;
  }
  if (globalDb.lite) {
    await globalDb.lite.close();
    delete globalDb.lite;
    delete globalDb.liteReady;
  }
}
