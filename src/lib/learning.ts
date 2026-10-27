import { z } from 'zod';
import type { DB } from './db';
import { allow, AppError, canManage, ready, staff, type Actor } from './policy';
const id = z.uuid(),
  title = z.string().trim().min(3).max(200);
async function log(db: DB, a: Actor, action: string, entity: string) {
  await db.query(
    'INSERT INTO audit_logs(company_id,actor_id,action,entity_id) VALUES($1,$2,$3,$4)',
    [a.companyId, a.userId, action, entity],
  );
}
async function draft(db: DB, a: Actor, table: 'courses' | 'learning_paths', value: string) {
  allow(a, ['admin', 'hr']);
  const row = (
    await db.query(`SELECT * FROM ${table} WHERE company_id=$1 AND id=$2 FOR UPDATE`, [
      a.companyId,
      value,
    ])
  ).rows[0];
  if (!row) throw new AppError('ไม่พบข้อมูล', 404);
  if (row.published) throw new AppError('เผยแพร่แล้ว กรุณาสร้างเวอร์ชันใหม่');
  return row;
}
export async function assignPath(
  db: DB,
  companyId: string,
  pathId: string,
  employeeId: string,
  startDate: string,
) {
  const [p, e] = await Promise.all([
    db.query('SELECT * FROM learning_paths WHERE company_id=$1 AND id=$2 AND published=true', [
      companyId,
      pathId,
    ]),
    db.query(
      `SELECT id FROM employees WHERE company_id=$1 AND id=$2 AND status!='exited' FOR UPDATE`,
      [companyId, employeeId],
    ),
  ]);
  if (!p.rows.length || !e.rows.length)
    throw new AppError('ไม่พบเส้นทางที่เผยแพร่หรือพนักงานที่ยังปฏิบัติงาน', 404);
  await db.query(
    'INSERT INTO path_assignments(company_id,path_id,employee_id,start_date) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
    [companyId, pathId, employeeId, startDate],
  );
  // Preserve existing scores, signoffs and deadlines when the same course is already assigned.
  await db.query(
    `INSERT INTO enrollments(company_id,course_id,employee_id,due_date) SELECT i.company_id,i.course_id,$3,$4::date+i.due_days FROM learning_path_items i WHERE i.company_id=$1 AND i.path_id=$2 ON CONFLICT(company_id,course_id,employee_id) DO NOTHING`,
    [companyId, pathId, employeeId, startDate],
  );
}
export async function assignPathsForEmployee(db: DB, companyId: string, employeeId: string) {
  const e = (
    await db.query('SELECT * FROM employees WHERE company_id=$1 AND id=$2', [companyId, employeeId])
  ).rows[0];
  if (!e || e.status === 'exited') return;
  const paths = (
    await db.query(
      'SELECT id FROM learning_paths WHERE company_id=$1 AND published=true AND auto_assign=true AND (position_id IS NULL OR position_id=$2)',
      [companyId, e.position_id],
    )
  ).rows;
  for (const p of paths) await assignPath(db, companyId, p.id, employeeId, e.start_date);
}
export async function learningMutation(
  db: DB,
  a: Actor,
  action: string,
  input: unknown,
): Promise<Record<string, unknown> | null> {
  switch (action) {
    case 'lesson.update': {
      const v = z.object({ id, title, content: z.string().min(3).max(30000) }).parse(input);
      const lesson = (
        await db.query('SELECT course_id FROM lessons WHERE company_id=$1 AND id=$2', [
          a.companyId,
          v.id,
        ])
      ).rows[0];
      if (!lesson) throw new AppError('ไม่พบบทเรียน', 404);
      await draft(db, a, 'courses', lesson.course_id);
      await db.query('UPDATE lessons SET title=$3,content=$4 WHERE company_id=$1 AND id=$2', [
        a.companyId,
        v.id,
        v.title,
        v.content,
      ]);
      await log(db, a, action, v.id);
      return { message: 'แก้ไขบทเรียนฉบับร่างแล้ว' };
    }
    case 'question.delete': {
      const v = z.object({ id }).parse(input);
      const question = (
        await db.query('SELECT course_id FROM questions WHERE company_id=$1 AND id=$2', [
          a.companyId,
          v.id,
        ])
      ).rows[0];
      if (!question) throw new AppError('ไม่พบข้อสอบ', 404);
      await draft(db, a, 'courses', question.course_id);
      await db.query('DELETE FROM questions WHERE company_id=$1 AND id=$2', [a.companyId, v.id]);
      await log(db, a, action, v.id);
      return { message: 'นำข้อสอบออกจากฉบับร่างแล้ว' };
    }
    case 'skill.item.delete': {
      const v = z.object({ id }).parse(input);
      const item = (
        await db.query('SELECT course_id FROM skill_items WHERE company_id=$1 AND id=$2', [
          a.companyId,
          v.id,
        ])
      ).rows[0];
      if (!item) throw new AppError('ไม่พบเกณฑ์', 404);
      await draft(db, a, 'courses', item.course_id);
      await db.query('DELETE FROM skill_items WHERE company_id=$1 AND id=$2', [a.companyId, v.id]);
      await log(db, a, action, v.id);
      return { message: 'นำเกณฑ์ออกจากฉบับร่างแล้ว' };
    }
    case 'path.retire': {
      allow(a, ['admin', 'hr']);
      const v = z.object({ id }).parse(input);
      const updated = (
        await db.query(
          'UPDATE learning_paths SET auto_assign=false WHERE company_id=$1 AND id=$2 RETURNING id',
          [a.companyId, v.id],
        )
      ).rows;
      if (!updated.length) throw new AppError('ไม่พบเส้นทาง', 404);
      await log(db, a, action, v.id);
      return { message: 'หยุดมอบหมายเส้นทางนี้อัตโนมัติแล้ว ประวัติเดิมยังอยู่' };
    }
    case 'path.create': {
      allow(a, ['admin', 'hr']);
      const v = z
        .object({
          title,
          description: z.string().max(5000),
          position_id: z.union([id, z.literal('')]),
          auto_assign: z.boolean(),
        })
        .parse(input);
      const p = (
        await db.query(
          'INSERT INTO learning_paths(company_id,title,description,position_id,auto_assign) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [a.companyId, v.title, v.description, v.position_id || null, v.auto_assign],
        )
      ).rows[0];
      await log(db, a, action, p.id);
      return { message: 'สร้างเส้นทางฉบับร่างแล้ว', id: p.id };
    }
    case 'path.item': {
      const v = z
        .object({
          path_id: id,
          course_id: id,
          stage: z.enum(['day_one', 'first_week', 'probation']),
          due_days: z.coerce.number().int().min(0).max(365),
        })
        .parse(input);
      await draft(db, a, 'learning_paths', v.path_id);
      const c = (
        await db.query('SELECT id FROM courses WHERE company_id=$1 AND id=$2 AND published=true', [
          a.companyId,
          v.course_id,
        ])
      ).rows[0];
      if (!c) throw new AppError('เลือกหลักสูตรที่เผยแพร่ในบริษัทนี้', 404);
      await db.query(
        'INSERT INTO learning_path_items(company_id,path_id,course_id,stage,due_days,sort_order) SELECT $1,$2,$3,$4,$5,COALESCE(MAX(sort_order),0)+1 FROM learning_path_items WHERE company_id=$1 AND path_id=$2 ON CONFLICT(company_id,path_id,course_id) DO UPDATE SET stage=excluded.stage,due_days=excluded.due_days',
        [a.companyId, v.path_id, v.course_id, v.stage, v.due_days],
      );
      await log(db, a, action, v.path_id);
      return { message: 'บันทึกขั้นตอนในเส้นทางแล้ว' };
    }
    case 'path.publish': {
      const v = z.object({ id }).parse(input);
      const p = await draft(db, a, 'learning_paths', v.id);
      const count = (
        await db.query(
          'SELECT COUNT(*) FROM learning_path_items WHERE company_id=$1 AND path_id=$2',
          [a.companyId, v.id],
        )
      ).rows[0];
      if (!Number(count.count)) throw new AppError('เพิ่มหลักสูตรอย่างน้อย 1 รายการก่อนเผยแพร่');
      await db.query('UPDATE learning_paths SET published=true WHERE company_id=$1 AND id=$2', [
        a.companyId,
        v.id,
      ]);
      if (p.auto_assign) {
        const es = (
          await db.query(
            `SELECT id,start_date FROM employees WHERE company_id=$1 AND status!='exited' AND ($2::uuid IS NULL OR position_id=$2)`,
            [a.companyId, p.position_id],
          )
        ).rows;
        for (const e of es) await assignPath(db, a.companyId, v.id, e.id, e.start_date);
      }
      await log(db, a, action, v.id);
      return { message: 'เผยแพร่และมอบหมายเส้นทางแล้ว' };
    }
    case 'path.assign': {
      allow(a, ['admin', 'hr', 'manager']);
      const v = z.object({ path_id: id, employee_id: id, start_date: z.iso.date() }).parse(input);
      const e = (
        await db.query('SELECT id,manager_id FROM employees WHERE company_id=$1 AND id=$2', [
          a.companyId,
          v.employee_id,
        ])
      ).rows[0];
      if (!e || !canManage(a, { id: e.id, manager_id: e.manager_id }))
        throw new AppError('ไม่มีสิทธิ์มอบหมายให้พนักงานนี้', 403);
      await assignPath(db, a.companyId, v.path_id, v.employee_id, v.start_date);
      await log(db, a, action, v.path_id);
      return { message: 'มอบหมายเส้นทางแล้ว ผลสอบเดิมยังคงอยู่' };
    }
    case 'skill.item': {
      const v = z.object({ course_id: id, title, required: z.boolean() }).parse(input);
      await draft(db, a, 'courses', v.course_id);
      await db.query(
        'INSERT INTO skill_items(company_id,course_id,title,required,sort_order) SELECT $1,$2,$3,$4,COALESCE(MAX(sort_order),0)+1 FROM skill_items WHERE company_id=$1 AND course_id=$2',
        [a.companyId, v.course_id, v.title, v.required],
      );
      await log(db, a, action, v.course_id);
      return { message: 'เพิ่มเกณฑ์ตรวจทักษะแล้ว' };
    }
    case 'skill.review': {
      allow(a, ['admin', 'hr', 'manager']);
      const v = z
        .object({
          enrollment_id: id,
          checks: z
            .array(
              z.object({
                item_id: id,
                passed: z.boolean(),
                note: z.string().trim().min(3).max(2000),
              }),
            )
            .min(1)
            .max(100),
        })
        .parse(input);
      const n = (
        await db.query(
          `SELECT en.*,e.manager_id FROM enrollments en JOIN employees e ON e.id=en.employee_id AND e.company_id=en.company_id WHERE en.company_id=$1 AND en.id=$2 FOR UPDATE OF en`,
          [a.companyId, v.enrollment_id],
        )
      ).rows[0];
      if (
        !n ||
        !canManage(a, { id: n.employee_id, manager_id: n.manager_id }) ||
        n.employee_id === a.employeeId
      )
        throw new AppError('ไม่มีสิทธิ์ตรวจรับทักษะนี้', 403);
      if (!n.passed_at) throw new AppError('ต้องผ่านแบบทดสอบก่อนตรวจทักษะ');
      if (n.signed_off_at) throw new AppError('ตรวจรับแล้ว ไม่สามารถเปลี่ยนหลักฐานเดิมได้');
      for (const check of v.checks) {
        const item = (
          await db.query(
            'SELECT id FROM skill_items WHERE company_id=$1 AND course_id=$2 AND id=$3',
            [a.companyId, n.course_id, check.item_id],
          )
        ).rows[0];
        if (!item) throw new AppError('เกณฑ์ไม่อยู่ในหลักสูตรนี้');
        await db.query(
          'INSERT INTO skill_checks(company_id,enrollment_id,item_id,passed,note,reviewer_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(enrollment_id,item_id) DO UPDATE SET passed=excluded.passed,note=excluded.note,reviewer_id=excluded.reviewer_id,reviewed_at=now()',
          [a.companyId, n.id, check.item_id, check.passed, check.note, a.userId],
        );
      }
      await log(db, a, action, n.id);
      return { message: 'บันทึกการสังเกตทักษะแล้ว' };
    }
    case 'course.clone': {
      allow(a, ['admin', 'hr']);
      const v = z.object({ id }).parse(input);
      const c = (
        await db.query('SELECT * FROM courses WHERE company_id=$1 AND id=$2 FOR UPDATE', [
          a.companyId,
          v.id,
        ])
      ).rows[0];
      if (!c) throw new AppError('ไม่พบหลักสูตร', 404);
      await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [a.companyId]);
      const version =
        Number(
          (
            await db.query(
              'SELECT MAX(version) AS version FROM courses WHERE company_id=$1 AND family_id=$2',
              [a.companyId, c.family_id],
            )
          ).rows[0].version,
        ) + 1;
      const n = (
        await db.query(
          `INSERT INTO courses(company_id,title,description,category,position_id,pass_score,auto_assign,requires_signoff,duration_minutes,family_id,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [
            a.companyId,
            c.title,
            c.description,
            c.category,
            c.position_id,
            c.pass_score,
            c.auto_assign,
            c.requires_signoff,
            c.duration_minutes,
            c.family_id,
            version,
          ],
        )
      ).rows[0];
      await db.query(
        'INSERT INTO lessons(company_id,course_id,title,type,content,media_url,sort_order,asset_id) SELECT company_id,$3,title,type,content,media_url,sort_order,asset_id FROM lessons WHERE company_id=$1 AND course_id=$2',
        [a.companyId, c.id, n.id],
      );
      await db.query(
        'INSERT INTO questions(company_id,course_id,prompt,options,correct_index,explanation) SELECT company_id,$3,prompt,options,correct_index,explanation FROM questions WHERE company_id=$1 AND course_id=$2',
        [a.companyId, c.id, n.id],
      );
      await db.query(
        'INSERT INTO skill_items(company_id,course_id,title,required,sort_order) SELECT company_id,$3,title,required,sort_order FROM skill_items WHERE company_id=$1 AND course_id=$2',
        [a.companyId, c.id, n.id],
      );
      await log(db, a, action, n.id);
      return {
        message: 'สร้างฉบับร่างเวอร์ชัน ' + version + ' แล้ว ประวัติเดิมไม่เปลี่ยน',
        id: n.id,
      };
    }
    case 'notification.read': {
      const v = z.object({ key: z.string().min(1).max(160) }).parse(input);
      await db.query(
        'INSERT INTO notification_reads(company_id,user_id,notification_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [a.companyId, a.userId, v.key],
      );
      return { message: 'อ่านการแจ้งเตือนแล้ว' };
    }
    default:
      return null;
  }
}
export function learningAlerts(
  a: Actor,
  employees: Record<string, any>[],
  enrollments: Record<string, any>[],
  reads: Record<string, any>[],
  today: string,
  attempts: Record<string, any>[] = [],
) {
  const alerts: {
    key: string;
    title: string;
    detail: string;
    href: string;
    read: boolean;
    tone: string;
  }[] = [];
  const soon = new Date(today + 'T00:00:00Z');
  soon.setUTCDate(soon.getUTCDate() + 3);
  const cutoff = soon.toISOString().slice(0, 10);
  for (const n of enrollments) {
    if (!n.published || ready(n, n.requires_signoff)) continue;
    const e = employees.find((e) => e.id === n.employee_id);
    if (!e || e.status === 'exited') continue;
    const due = String(n.due_date).slice(0, 10);
    let kind = '',
      message = '',
      tone = 'blue';
    if (n.passed_at && n.requires_signoff) {
      kind = 'review';
      message =
        n.employee_id === a.employeeId
          ? 'ผ่านข้อสอบ รอหัวหน้าตรวจทักษะ'
          : 'รอตรวจรับทักษะจากงานจริง';
      tone = 'orange';
    } else if (
      attempts.some((t) => t.enrollment_id === n.id) &&
      Number(attempts.find((t) => t.enrollment_id === n.id)?.score) < Number(n.pass_score)
    ) {
      kind = 'retake';
      message = 'ยังไม่ผ่านข้อสอบ · ทบทวนแล้วสอบใหม่';
      tone = 'orange';
    } else if (due < today) {
      kind = 'overdue';
      message = 'เรียนเกินกำหนด ' + due;
      tone = 'orange';
    } else if (due <= cutoff) {
      kind = 'due';
      message = 'ใกล้ครบกำหนด ' + due;
    }
    if (!kind) continue;
    const key =
      kind +
      ':' +
      n.id +
      ':' +
      due +
      (kind === 'retake' ? ':' + attempts.find((t) => t.enrollment_id === n.id)?.id : '');
    alerts.push({
      key,
      title: n.title,
      detail: e.name + ' · ' + message,
      href: kind === 'review' ? '/readiness' : '/learning',
      tone,
      read: reads.some((r) => r.notification_key === key),
    });
  }
  return alerts.sort((x, y) => Number(x.read) - Number(y.read));
}
