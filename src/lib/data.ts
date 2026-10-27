import { query } from './db';
import { context } from './session';
import { staff } from './policy';
import { readEmployees } from './repository';
export async function loadWorkspace() {
  const actor = await context();
  const a = actor;
  const unrestricted = staff(a);
  const employees = await readEmployees(a);
  const employeeIds = employees.map((e) => e.id);
  const [
    companies,
    departments,
    positions,
    shifts,
    assignments,
    attendance,
    requests,
    courses,
    enrollments,
    lessons,
    questions,
    progress,
    attempts,
    audits,
    integrations,
  ] = await Promise.all([
    query(
      `SELECT c.id,c.name,c.slug,m.role FROM memberships m JOIN companies c ON c.id=m.company_id LEFT JOIN employees e ON e.id=m.employee_id WHERE m.user_id=$1 AND (m.employee_id IS NULL OR e.status!='exited') ORDER BY c.name`,
      [a.userId],
    ),
    query('SELECT * FROM departments WHERE company_id=$1 ORDER BY name', [a.companyId]),
    query('SELECT * FROM positions WHERE company_id=$1 ORDER BY name', [a.companyId]),
    query('SELECT * FROM shifts WHERE company_id=$1 ORDER BY start_time', [a.companyId]),
    query(
      `SELECT a.*,s.name shift_name,s.start_time,s.end_time FROM shift_assignments a JOIN shifts s ON s.id=a.shift_id WHERE a.company_id=$1 AND a.employee_id=ANY($2::uuid[]) AND work_date BETWEEN CURRENT_DATE-7 AND CURRENT_DATE+60 ORDER BY work_date`,
      [a.companyId, employeeIds],
    ),
    query(
      `SELECT * FROM attendance WHERE company_id=$1 AND employee_id=ANY($2::uuid[]) AND work_date>=CURRENT_DATE-60 ORDER BY check_in DESC LIMIT 500`,
      [a.companyId, employeeIds],
    ),
    query(
      'SELECT * FROM requests WHERE company_id=$1 AND employee_id=ANY($2::uuid[]) ORDER BY created_at DESC LIMIT 500',
      [a.companyId, employeeIds],
    ),
    query(
      `SELECT c.*,(SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id) lesson_count FROM courses c WHERE c.company_id=$1 ${unrestricted ? '' : 'AND c.published=true'} ORDER BY c.created_at`,
      [a.companyId],
    ),
    query(
      `SELECT n.*,c.title,c.requires_signoff,c.pass_score,c.published,(SELECT COUNT(*) FROM lesson_progress p WHERE p.enrollment_id=n.id) completed_lessons,(SELECT COUNT(*) FROM lessons l WHERE l.course_id=n.course_id) total_lessons FROM enrollments n JOIN courses c ON c.id=n.course_id WHERE n.company_id=$1 AND n.employee_id=ANY($2::uuid[]) ORDER BY n.created_at`,
      [a.companyId, employeeIds],
    ),
    query(
      `SELECT l.* FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.company_id=$1 ${unrestricted ? '' : `AND c.published=true AND EXISTS(SELECT 1 FROM enrollments en WHERE en.course_id=c.id AND en.company_id=$1 AND en.employee_id=$2)`} ORDER BY sort_order`,
      unrestricted ? [a.companyId] : [a.companyId, a.employeeId],
    ),
    query(
      `SELECT q.id,q.company_id,q.course_id,q.prompt,q.options FROM questions q JOIN courses c ON c.id=q.course_id WHERE q.company_id=$1 ${unrestricted ? '' : `AND c.published=true AND EXISTS(SELECT 1 FROM enrollments en WHERE en.course_id=c.id AND en.company_id=$1 AND en.employee_id=$2)`} ORDER BY q.id`,
      unrestricted ? [a.companyId] : [a.companyId, a.employeeId],
    ),
    query(
      'SELECT p.* FROM lesson_progress p JOIN enrollments en ON en.id=p.enrollment_id WHERE p.company_id=$1 AND en.employee_id=ANY($2::uuid[])',
      [a.companyId, employeeIds],
    ),
    query(
      `SELECT q.id,q.enrollment_id,q.score,q.created_at FROM quiz_attempts q JOIN enrollments en ON en.id=q.enrollment_id WHERE q.company_id=$1 AND en.employee_id=ANY($2::uuid[]) ORDER BY q.created_at DESC LIMIT 200`,
      [a.companyId, employeeIds],
    ),
    a.role === 'admin'
      ? query(
          `SELECT l.*,u.name actor FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_id WHERE l.company_id=$1 ORDER BY l.created_at DESC LIMIT 80`,
          [a.companyId],
        )
      : Promise.resolve([]),
    a.role === 'admin'
      ? query(
          'SELECT company_id,device_key_hash IS NOT NULL AS device_configured,line_recipient FROM integrations WHERE company_id=$1',
          [a.companyId],
        )
      : Promise.resolve([]),
  ]);
  return JSON.parse(
    JSON.stringify({
      actor,
      companies,
      employees,
      departments,
      positions,
      shifts,
      assignments,
      attendance,
      requests,
      courses,
      enrollments,
      lessons,
      questions,
      progress,
      attempts,
      audits,
      integration: integrations[0] ?? {},
      features: {
        google: !!process.env.AUTH_GOOGLE_ID,
        microsoft: !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
        ai: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL),
        line: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
      },
    }),
  );
}
export type WorkspaceData = Awaited<ReturnType<typeof loadWorkspace>>;
