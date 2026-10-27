import { context } from '@/lib/session';
import { query } from '@/lib/db';
import { staff, AppError, bangkokDate } from '@/lib/policy';
import { accountingCsv } from '@/lib/integrations/adapters';
import { z } from 'zod';
export async function GET(req: Request) {
  const a = await context();
  if (!staff(a)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const kind = url.searchParams.get('type') ?? 'attendance';
  if (!z.enum(['employees', 'attendance', 'ot']).safeParse(kind).success)
    return Response.json({ error: 'Invalid export type' }, { status: 400 });
  const from = url.searchParams.get('from') ?? bangkokDate().slice(0, 7) + '-01';
  const to = url.searchParams.get('to') ?? bangkokDate();
  if (!z.iso.date().safeParse(from).success || !z.iso.date().safeParse(to).success || from > to)
    return Response.json({ error: 'Invalid date range' }, { status: 400 });
  const rows =
    kind === 'employees'
      ? await query(
          'SELECT code,name,email,branch,status FROM employees WHERE company_id=$1 ORDER BY code',
          [a.companyId],
        )
      : kind === 'ot'
        ? await query(
            `SELECT e.code,e.name,r.start_date,r.hours,r.reason FROM requests r JOIN employees e ON e.id=r.employee_id WHERE r.company_id=$1 AND r.type='ot' AND r.status='approved' AND r.start_date BETWEEN $2 AND $3 ORDER BY r.start_date`,
            [a.companyId, from, to],
          )
        : await query(
            'SELECT e.code,e.name,a.work_date,a.check_in,a.check_out,a.source FROM attendance a JOIN employees e ON e.id=a.employee_id WHERE a.company_id=$1 AND a.work_date BETWEEN $2 AND $3 ORDER BY a.work_date',
            [a.companyId, from, to],
          );
  const columns =
    kind === 'employees'
      ? ['code', 'name', 'email', 'branch', 'status']
      : kind === 'ot'
        ? ['code', 'name', 'start_date', 'hours', 'reason']
        : ['code', 'name', 'work_date', 'check_in', 'check_out', 'source'];
  let csv: string;
  try {
    csv = accountingCsv(url.searchParams.get('format') ?? 'generic', kind, columns, rows);
  } catch (e) {
    return Response.json(
      { error: e instanceof AppError ? e.message : 'Export failed' },
      { status: 400 },
    );
  }
  await query(
    `INSERT INTO audit_logs(company_id,actor_id,action,entity_id) VALUES($1,$2,'export.csv',$3)`,
    [a.companyId, a.userId, kind],
  );
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="peopleflow-${kind}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
