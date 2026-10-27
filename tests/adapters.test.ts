import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAttendance, accountingCsv } from '../src/lib/integrations/adapters';
import { sameOrigin } from '../src/lib/api';
test('sample device maps into the same validated event contract', () => {
  const stamp = '2026-10-27T09:00:00+07:00';
  assert.deepEqual(
    normalizeAttendance('demoscan-v1', {
      badge: 'EMP-001',
      serial: 'device-abc',
      occurred_at: stamp,
      direction: 'entry',
    }),
    { employee_code: 'EMP-001', event_id: 'device-abc', timestamp: stamp, type: 'in' },
  );
  assert.throws(() => normalizeAttendance('unknown', {}));
  assert.throws(() => normalizeAttendance('toString', {}));
  assert.throws(() => normalizeAttendance('generic', { employee_code: 'bad' }));
});
test('accounting schemas change without changing normalized source rows', () => {
  const rows = [{ code: 'EMP-001', hours: 2 }];
  assert.match(accountingCsv('generic', 'ot', ['code', 'hours'], rows), /"code","hours"/);
  assert.match(
    accountingCsv('demoledger-v1', 'ot', ['code', 'hours'], rows),
    /"employee_number","approved_ot_hours"/,
  );
  assert.equal(rows[0].code, 'EMP-001');
  assert.throws(() => accountingCsv('unknown', 'ot', [], []));
});
test('upload CSRF honors the actual proxy host and rejects foreign origins', () => {
  assert.doesNotThrow(() =>
    sameOrigin(
      new Request('http://localhost:3000/api/files/reserve', {
        headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    sameOrigin(
      new Request('http://internal/api/files/reserve', {
        headers: {
          'x-forwarded-host': 'hrd-hrm.vercel.app',
          'x-forwarded-proto': 'https',
          origin: 'https://hrd-hrm.vercel.app',
        },
      }),
    ),
  );
  assert.throws(() =>
    sameOrigin(
      new Request('https://hrd-hrm.vercel.app/api/files/reserve', {
        headers: { host: 'hrd-hrm.vercel.app', origin: 'https://attacker.example' },
      }),
    ),
  );
  assert.throws(() =>
    sameOrigin(
      new Request('https://hrd-hrm.vercel.app/api/files/reserve', {
        headers: { host: 'hrd-hrm.vercel.app' },
      }),
    ),
  );
});
