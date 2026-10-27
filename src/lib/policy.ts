export type Role = 'admin' | 'hr' | 'manager' | 'employee';
export interface Actor {
  userId: string;
  companyId: string;
  employeeId: string | null;
  role: Role;
  name: string;
}
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function allow(actor: Actor, roles: Role[]) {
  if (!roles.includes(actor.role)) throw new AppError('คุณไม่มีสิทธิ์ทำรายการนี้', 403);
}
export function staff(actor: Actor) {
  return actor.role === 'admin' || actor.role === 'hr';
}
export function canManage(actor: Actor, employee: { id: string; manager_id: string | null }) {
  return (
    staff(actor) ||
    (actor.role === 'manager' &&
      employee.manager_id === actor.employeeId &&
      employee.id !== actor.employeeId)
  );
}
export function grade(
  questions: { id: string; correct_index: number }[],
  answers: Record<string, number>,
) {
  if (!questions.length) throw new AppError('หลักสูตรยังไม่มีแบบทดสอบ');
  if (questions.some((q) => answers[q.id] === undefined)) throw new AppError('กรุณาตอบทุกข้อ');
  return Math.round(
    (questions.filter((q) => answers[q.id] === q.correct_index).length / questions.length) * 100,
  );
}
export function ready(
  enrollment: { passed_at?: unknown; signed_off_at?: unknown },
  requiresSignoff: boolean,
) {
  return Boolean(enrollment.passed_at && (!requiresSignoff || enrollment.signed_off_at));
}
export function csvCell(value: unknown) {
  const s = String(value ?? '');
  return '"' + (/^[\s]*[=+\-@]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
}
export function bangkokDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
