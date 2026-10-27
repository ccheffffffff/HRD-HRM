import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { query } from './db';
import type { Actor } from './policy';
export async function context(): Promise<Actor> {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const cookie = (await cookies()).get('company')?.value;
  const memberships = await query(
    `SELECT m.*,u.name FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN employees e ON e.id=m.employee_id AND e.company_id=m.company_id WHERE m.user_id=$1 AND u.active=true AND (m.employee_id IS NULL OR e.status!='exited') ORDER BY m.company_id`,
    [session.user.id],
  );
  const m = memberships.find((m) => m.company_id === cookie) ?? memberships[0];
  if (!m) redirect('/login?error=NoMembership');
  return {
    userId: m.user_id,
    companyId: m.company_id,
    employeeId: m.employee_id,
    role: m.role,
    name: m.name,
  };
}
