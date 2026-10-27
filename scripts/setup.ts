import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (!existsSync('.env')) {
  const password = randomBytes(15).toString('base64url');
  const env = readFileSync('.env.example', 'utf8')
    .replace(
      'replace-with-a-random-secret-at-least-32-characters',
      randomBytes(48).toString('base64url'),
    )
    .replace('SEED_PASSWORD=', 'SEED_PASSWORD=' + password);
  writeFileSync('.env', env, { mode: 0o600 });
  console.log(
    'Created .env with random AUTH_SECRET and SEED_PASSWORD. View .env locally for demo credentials.',
  );
} else console.log('.env exists; preserved. Run pnpm db:migrate && pnpm db:seed.');
