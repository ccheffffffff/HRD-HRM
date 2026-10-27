import { query } from './db';
import { staff, type Actor } from './policy';
/** Roster is the authorization boundary used for all dependent workspace datasets. */
export async function readEmployees(a: Actor) {
  const unrestricted = staff(a);
  const scope = unrestricted
    ? 'TRUE'
    : a.role === 'manager'
      ? '(e.id=$2 OR e.manager_id=$2)'
      : 'e.id=$2';
  return query(
    `SELECT e.*,d.name department,p.name position,m.name manager FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN positions p ON p.id=e.position_id LEFT JOIN employees m ON m.id=e.manager_id WHERE e.company_id=$1 AND ${scope} ORDER BY e.created_at,e.name`,
    unrestricted ? [a.companyId] : [a.companyId, a.employeeId],
  );
}
