// Vercel supplies secrets as environment variables; do not read a checked-out .env.
if (process.env.VERCEL_ENV !== 'production' || process.env.DEPLOY_MIGRATE !== 'true') {
  console.log(
    'Deployment database preparation skipped (production + DEPLOY_MIGRATE=true required).',
  );
} else {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url || !/^postgres(?:ql)?:\/\//.test(url))
    throw new Error('Set a persistent PostgreSQL DATABASE_URL before deploying.');
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)
    throw new Error('Set a random AUTH_SECRET of at least 32 characters.');
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = url;
  await import('./migrate');
  if (process.env.SEED_DEMO === 'true') {
    if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 12)
      throw new Error('Set a strong SEED_PASSWORD before enabling SEED_DEMO.');
    await import('./seed');
  } else console.log('Demo seed disabled; existing company data preserved.');
}
export {};
