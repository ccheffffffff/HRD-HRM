import { readFileSync } from 'node:fs';
import { database, closeDatabase } from '../src/lib/db';
import { PGlite } from '@electric-sql/pglite';
const sql = readFileSync('db/001_initial.sql', 'utf8');
const db = database();
if (db instanceof PGlite) await db.exec(sql);
else await db.query(sql);
console.log('Database migration complete');
await closeDatabase();
