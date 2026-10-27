import { closeDatabase } from '../src/lib/db';
import { applyMigrations } from '../src/lib/migrations';
await applyMigrations();
console.log('Database migration complete');
await closeDatabase();
