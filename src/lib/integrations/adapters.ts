import { z } from 'zod';
import { AppError, csvCell } from '../policy';

/** Internal event contract. Add a new adapter here without changing HRM workflows. */
export const attendanceEvent = z.object({
  employee_code: z.string().min(1).max(200),
  event_id: z.string().min(1).max(200),
  type: z.enum(['in', 'out']),
  timestamp: z.iso.datetime({ offset: true }),
});
export type AttendanceEvent = z.infer<typeof attendanceEvent>;
export interface AttendanceAdapter {
  id: string;
  parse(payload: unknown): AttendanceEvent;
}
const sampleScan = z.object({
  badge: z.string(),
  serial: z.string(),
  occurred_at: z.iso.datetime({ offset: true }),
  direction: z.enum(['entry', 'exit']),
});
export const attendanceAdapters: Readonly<Record<string, AttendanceAdapter>> = {
  generic: { id: 'generic', parse: (payload) => attendanceEvent.parse(payload) },
  // DemoScan is an invented example protocol, not a claim of vendor compatibility.
  'demoscan-v1': {
    id: 'demoscan-v1',
    parse(payload) {
      const e = sampleScan.parse(payload);
      return attendanceEvent.parse({
        employee_code: e.badge,
        event_id: e.serial,
        type: e.direction === 'entry' ? 'in' : 'out',
        timestamp: e.occurred_at,
      });
    },
  },
};
export function normalizeAttendance(format: string, payload: unknown) {
  if (!Object.hasOwn(attendanceAdapters, format)) throw new AppError('Unknown device format', 400);
  const adapter = attendanceAdapters[format];
  if (!adapter) throw new AppError('Unknown device format', 400);
  return adapter.parse(payload);
}

export interface ExportColumn {
  key: string;
  label: string;
}
export interface AccountingAdapter {
  id: string;
  columns(kind: string, keys: string[]): ExportColumn[];
}
export const accountingAdapters: Readonly<Record<string, AccountingAdapter>> = {
  generic: { id: 'generic', columns: (_kind, keys) => keys.map((key) => ({ key, label: key })) },
  // Example CSV schema for a future accounting importer; no payroll journal is fabricated.
  'demoledger-v1': {
    id: 'demoledger-v1',
    columns: (_kind, keys) => {
      const mapping: Record<string, string> = {
        code: 'employee_number',
        name: 'employee_name',
        start_date: 'transaction_date',
        hours: 'approved_ot_hours',
        work_date: 'work_day',
        check_in: 'clock_in_at',
        check_out: 'clock_out_at',
        source: 'entry_source',
        email: 'work_email',
        branch: 'cost_center',
        status: 'employment_status',
        reason: 'description',
      };
      return keys.map((key) => ({ key, label: mapping[key] ?? key }));
    },
  },
};
export function accountingCsv(
  format: string,
  kind: string,
  keys: string[],
  rows: Record<string, unknown>[],
) {
  if (!Object.hasOwn(accountingAdapters, format)) throw new AppError('Unknown accounting format');
  const adapter = accountingAdapters[format];
  if (!adapter) throw new AppError('Unknown accounting format');
  const cols = adapter.columns(kind, keys);
  const cell = (value: unknown) => csvCell(value instanceof Date ? value.toISOString() : value);
  return (
    '\uFEFF' +
    [
      cols.map((c) => cell(c.label)).join(','),
      ...rows.map((row) => cols.map((c) => cell(row[c.key])).join(',')),
    ].join('\r\n')
  );
}
