import { hash } from 'bcryptjs';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { query, transaction, type DB } from './db';
import { allow, AppError, bangkokDate, canManage, grade, staff, type Actor } from './policy';
import { assignPathsForEmployee, learningMutation } from './learning';
const id = z.uuid();
const name = z.string().trim().min(1).max(200);
const date = z.iso.date();
const safeUrl = z
  .union([
    z
      .url()
      .refine(
        (v) => v.startsWith('https://') || v.startsWith('http://localhost:'),
        'ใช้ URL แบบ HTTPS',
      ),
    z.literal(''),
  ])
  .optional();
async function audit(
  db: DB,
  a: Actor,
  action: string,
  entityId: string,
  details: Record<string, unknown> = {},
) {
  await db.query(
    'INSERT INTO audit_logs(company_id,actor_id,action,entity_id,details) VALUES($1,$2,$3,$4,$5)',
    [a.companyId, a.userId, action, entityId, JSON.stringify(details)],
  );
}
async function employee(db: DB, a: Actor, employeeId: string, manage = false) {
  const e = (
    await db.query('SELECT * FROM employees WHERE company_id=$1 AND id=$2', [
      a.companyId,
      employeeId,
    ])
  ).rows[0];
  if (!e) throw new AppError('ไม่พบพนักงาน', 404);
  if (manage && !canManage(a, { id: e.id, manager_id: e.manager_id }))
    throw new AppError('คุณไม่มีสิทธิ์จัดการพนักงานรายนี้', 403);
  return e;
}
async function enroll(db: DB, companyId: string, employeeId: string, positionId: string | null) {
  await assignPathsForEmployee(db, companyId, employeeId);
  await db.query(
    `INSERT INTO enrollments(company_id,course_id,employee_id) SELECT company_id,id,$2 FROM courses WHERE company_id=$1 AND auto_assign=true AND published=true AND (position_id IS NULL OR position_id=$3) ON CONFLICT(company_id,course_id,employee_id) DO NOTHING`,
    [companyId, employeeId, positionId],
  );
}
async function enrollment(db: DB, a: Actor, enrollmentId: string, manage = false) {
  const n = (
    await db.query(
      `SELECT en.*,c.requires_signoff,c.pass_score,c.published FROM enrollments en JOIN courses c ON c.id=en.course_id AND c.company_id=en.company_id WHERE en.company_id=$1 AND en.id=$2 FOR UPDATE OF en`,
      [a.companyId, enrollmentId],
    )
  ).rows[0];
  if (!n) throw new AppError('ไม่พบการลงทะเบียน', 404);
  if (manage) await employee(db, a, n.employee_id, true);
  else if (n.employee_id !== a.employeeId)
    throw new AppError('เรียนและสอบได้เฉพาะหลักสูตรของตนเอง', 403);
  if (!n.published) throw new AppError('หลักสูตรยังไม่เผยแพร่');
  return n;
}
export async function mutate(
  a: Actor,
  action: string,
  input: unknown,
): Promise<Record<string, unknown>> {
  return transaction(async (db) => {
    const learning = await learningMutation(db, a, action, input);
    if (learning) return learning;
    switch (action) {
      case 'employee.create': {
        allow(a, ['admin', 'hr']);
        const v = z
          .object({
            name,
            email: z.email().transform((s) => s.toLowerCase()),
            code: name,
            phone: z.string().max(30).default(''),
            branch: name,
            department_id: id,
            position_id: id,
            manager_id: z.union([id, z.literal('')]),
            start_date: date,
            probation_end: date,
            password: z.string().min(12).max(100),
            role: z.enum(['admin', 'hr', 'manager', 'employee']).default('employee'),
          })
          .parse(input);
        if (v.probation_end < v.start_date)
          throw new AppError('วันสิ้นสุดทดลองงานต้องไม่ก่อนวันเริ่มงาน');
        if (v.role === 'admin' && a.role !== 'admin')
          throw new AppError('เฉพาะผู้ดูแลระบบที่กำหนดสิทธิ์ผู้ดูแลได้', 403);
        if (v.manager_id) await employee(db, a, v.manager_id);
        // Never reset an existing global user's password through another tenant.
        const existing = (await db.query('SELECT id FROM users WHERE email=$1', [v.email])).rows[0];
        if (existing)
          throw new AppError('อีเมลนี้มีบัญชีแล้ว กรุณาใช้อีเมลใหม่สำหรับการสร้างพนักงาน');
        const u = (
          await db.query(
            'INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',
            [v.email, v.name, await hash(v.password, 12)],
          )
        ).rows[0];
        const e = (
          await db.query(
            `INSERT INTO employees(company_id,user_id,code,name,email,phone,branch,department_id,position_id,manager_id,start_date,probation_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
            [
              a.companyId,
              u.id,
              v.code,
              v.name,
              v.email,
              v.phone,
              v.branch,
              v.department_id,
              v.position_id,
              v.manager_id || null,
              v.start_date,
              v.probation_end,
            ],
          )
        ).rows[0];
        await db.query(
          'INSERT INTO memberships(company_id,user_id,employee_id,role) VALUES($1,$2,$3,$4)',
          [a.companyId, u.id, e.id, v.role],
        );
        await enroll(db, a.companyId, e.id, v.position_id);
        await audit(db, a, action, e.id);
        return { message: 'เพิ่มพนักงานและมอบหมายหลักสูตรอัตโนมัติแล้ว' };
      }
      case 'employee.update': {
        allow(a, ['admin', 'hr']);
        const v = z
          .object({
            id,
            name,
            phone: z.string().max(30),
            branch: name,
            department_id: id,
            position_id: id,
            manager_id: z.union([id, z.literal('')]),
            status: z.enum(['probation', 'active', 'exited']),
          })
          .parse(input);
        const e = await employee(db, a, v.id);
        if (v.id === a.employeeId && v.status === 'exited')
          throw new AppError('ไม่สามารถปิดสถานะการจ้างของตนเองได้');
        if (v.manager_id === v.id) throw new AppError('ไม่สามารถเป็นหัวหน้าของตนเองได้');
        if (v.manager_id) {
          await employee(db, a, v.manager_id);
          const chain = await db.query(
            `WITH RECURSIVE chain AS (SELECT id,manager_id FROM employees WHERE company_id=$1 AND id=$2 UNION SELECT e.id,e.manager_id FROM employees e JOIN chain c ON e.id=c.manager_id WHERE e.company_id=$1) SELECT id FROM chain WHERE id=$3`,
            [a.companyId, v.manager_id, v.id],
          );
          if (chain.rows.length) throw new AppError('สายบังคับบัญชาวนซ้ำ');
        }
        await db.query(
          'UPDATE employees SET name=$3,phone=$4,branch=$5,department_id=$6,position_id=$7,manager_id=$8,status=$9 WHERE company_id=$1 AND id=$2',
          [
            a.companyId,
            v.id,
            v.name,
            v.phone,
            v.branch,
            v.department_id,
            v.position_id,
            v.manager_id || null,
            v.status,
          ],
        );
        if (v.status !== 'exited') await enroll(db, a.companyId, v.id, v.position_id);
        await audit(db, a, action, e.id, { status: v.status });
        return { message: 'บันทึกข้อมูลพนักงานแล้ว' };
      }
      case 'company.create': {
        allow(a, ['admin']);
        const v = z.object({ name, slug: z.string().regex(/^[a-z0-9-]{3,50}$/) }).parse(input);
        const c = (
          await db.query('INSERT INTO companies(name,slug) VALUES($1,$2) RETURNING id', [
            v.name,
            v.slug,
          ])
        ).rows[0];
        await db.query(`INSERT INTO memberships(company_id,user_id,role) VALUES($1,$2,'admin')`, [
          c.id,
          a.userId,
        ]);
        await db.query('INSERT INTO integrations(company_id) VALUES($1)', [c.id]);
        await audit(db, a, action, c.id);
        return { message: 'สร้างบริษัทแล้ว เลือกบริษัทใหม่จากเมนูด้านบน' };
      }
      case 'department.create':
      case 'position.create': {
        allow(a, ['admin', 'hr']);
        const v = z.object({ name, description: z.string().max(3000).default('') }).parse(input);
        const r =
          action === 'department.create'
            ? await db.query(
                'INSERT INTO departments(company_id,name) VALUES($1,$2) RETURNING id',
                [a.companyId, v.name],
              )
            : await db.query(
                'INSERT INTO positions(company_id,name,description) VALUES($1,$2,$3) RETURNING id',
                [a.companyId, v.name, v.description],
              );
        await audit(db, a, action, r.rows[0].id);
        return { message: 'เพิ่มข้อมูลแล้ว' };
      }
      case 'shift.create': {
        allow(a, ['admin', 'hr']);
        const v = z
          .object({
            name,
            start_time: z.string().regex(/^\d{2}:\d{2}$/),
            end_time: z.string().regex(/^\d{2}:\d{2}$/),
          })
          .parse(input);
        if (v.start_time === v.end_time) throw new AppError('เวลาเริ่มและสิ้นสุดต้องต่างกัน');
        const r = await db.query(
          'INSERT INTO shifts(company_id,name,start_time,end_time) VALUES($1,$2,$3,$4) RETURNING id',
          [a.companyId, v.name, v.start_time, v.end_time],
        );
        await audit(db, a, action, r.rows[0].id);
        return { message: 'เพิ่มกะทำงานแล้ว' };
      }
      case 'shift.assign': {
        allow(a, ['admin', 'hr', 'manager']);
        const v = z.object({ employee_id: id, shift_id: id, work_date: date }).parse(input);
        await employee(db, a, v.employee_id, true);
        const r = await db.query(
          'INSERT INTO shift_assignments(company_id,employee_id,shift_id,work_date) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,employee_id,work_date) DO UPDATE SET shift_id=excluded.shift_id RETURNING id',
          [a.companyId, v.employee_id, v.shift_id, v.work_date],
        );
        await audit(db, a, action, r.rows[0].id);
        return { message: 'จัดตารางกะแล้ว' };
      }
      case 'attendance.in':
      case 'attendance.out': {
        if (!a.employeeId) throw new AppError('บัญชีนี้ยังไม่มีข้อมูลพนักงาน');
        if (action === 'attendance.in') {
          const r = await db.query(
            `INSERT INTO attendance(company_id,employee_id,work_date) VALUES($1,$2,$3) ON CONFLICT(company_id,employee_id,work_date) DO NOTHING RETURNING id`,
            [a.companyId, a.employeeId, bangkokDate()],
          );
          if (!r.rows.length) throw new AppError('ลงเวลาเข้าวันนี้แล้ว');
          await audit(db, a, action, r.rows[0].id);
        } else {
          const r = await db.query(
            "UPDATE attendance SET check_out=now() WHERE company_id=$1 AND employee_id=$2 AND check_out IS NULL AND check_in>now()-interval '24 hours' RETURNING id",
            [a.companyId, a.employeeId],
          );
          if (!r.rows.length)
            throw new AppError('ไม่พบเวลาเข้าที่ยังไม่ได้ลงเวลาออกใน 24 ชั่วโมงที่ผ่านมา');
          await audit(db, a, action, r.rows[0].id);
        }
        return { message: 'บันทึกเวลาสำเร็จ' };
      }
      case 'request.create': {
        if (!a.employeeId) throw new AppError('บัญชีนี้ยังไม่มีข้อมูลพนักงาน');
        await db.query('SELECT id FROM employees WHERE company_id=$1 AND id=$2 FOR UPDATE', [
          a.companyId,
          a.employeeId,
        ]);
        const v = z
          .object({
            type: z.enum(['leave', 'ot']),
            leave_type: z.enum(['annual', 'sick', 'personal']),
            start_date: date,
            end_date: date,
            hours: z.coerce.number().min(0).max(24),
            reason: z.string().trim().min(3).max(3000),
          })
          .parse(input);
        if (v.end_date < v.start_date) throw new AppError('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
        if (v.type === 'ot' && (v.hours <= 0 || v.start_date !== v.end_date))
          throw new AppError('OT ต้องระบุชั่วโมงมากกว่า 0 และยื่นแยกแต่ละวัน');
        const overlaps = await db.query(
          `SELECT id FROM requests WHERE company_id=$1 AND employee_id=$2 AND type=$3 AND status!='rejected' AND start_date<=$5 AND end_date>=$4`,
          [a.companyId, a.employeeId, v.type, v.start_date, v.end_date],
        );
        if (overlaps.rows.length) throw new AppError('มีคำขอในช่วงวันที่นี้อยู่แล้ว');
        const r = await db.query(
          'INSERT INTO requests(company_id,employee_id,type,leave_type,start_date,end_date,hours,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
          [
            a.companyId,
            a.employeeId,
            v.type,
            v.leave_type,
            v.start_date,
            v.end_date,
            v.hours,
            v.reason,
          ],
        );
        await audit(db, a, action, r.rows[0].id);
        return { message: 'ส่งคำขอแล้ว' };
      }
      case 'request.review': {
        allow(a, ['admin', 'hr', 'manager']);
        const v = z
          .object({
            id,
            status: z.enum(['approved', 'rejected']),
            note: z.string().max(3000).default(''),
          })
          .parse(input);
        const r = (
          await db.query('SELECT * FROM requests WHERE company_id=$1 AND id=$2 FOR UPDATE', [
            a.companyId,
            v.id,
          ])
        ).rows[0];
        if (!r) throw new AppError('ไม่พบคำขอ', 404);
        if (r.employee_id === a.employeeId)
          throw new AppError('ไม่สามารถอนุมัติคำขอของตนเองได้', 403);
        const e = await employee(db, a, r.employee_id, true);
        if (r.status !== 'pending') throw new AppError('คำขอนี้ได้รับการพิจารณาแล้ว');
        if (v.status === 'approved' && r.type === 'leave' && r.leave_type === 'annual') {
          // Serialize approvals per employee so simultaneous requests cannot overspend leave.
          await db.query('SELECT id FROM employees WHERE company_id=$1 AND id=$2 FOR UPDATE', [
            a.companyId,
            r.employee_id,
          ]);
          const years = (
            await db.query(
              `SELECT generate_series(EXTRACT(YEAR FROM $1::date)::int,EXTRACT(YEAR FROM $2::date)::int) AS year`,
              [r.start_date, r.end_date],
            )
          ).rows;
          for (const y of years) {
            const used = (
              await db.query(
                `SELECT COALESCE(SUM(LEAST(end_date,make_date($3,12,31))-GREATEST(start_date,make_date($3,1,1))+1),0) AS days FROM requests WHERE company_id=$1 AND employee_id=$2 AND type='leave' AND leave_type='annual' AND status='approved' AND start_date<=make_date($3,12,31) AND end_date>=make_date($3,1,1)`,
                [a.companyId, r.employee_id, y.year],
              )
            ).rows[0];
            const requested = (
              await db.query(
                'SELECT LEAST($2::date,make_date($3,12,31))-GREATEST($1::date,make_date($3,1,1))+1 AS days',
                [r.start_date, r.end_date, y.year],
              )
            ).rows[0];
            if (Number(used.days) + Number(requested.days) > Number(e.annual_leave_days))
              throw new AppError('วันลาพักร้อนเกินสิทธิ์ประจำปี (MVP นับวันปฏิทิน)');
          }
        }
        await db.query(
          'UPDATE requests SET status=$3,review_note=$4,reviewer_id=$5,reviewed_at=now() WHERE company_id=$1 AND id=$2',
          [a.companyId, v.id, v.status, v.note, a.userId],
        );
        await audit(db, a, action, v.id, { status: v.status });
        return { message: 'บันทึกผลการพิจารณาแล้ว' };
      }
      case 'course.create': {
        allow(a, ['admin', 'hr']);
        const v = z
          .object({
            title: name,
            description: z.string().min(3).max(5000),
            category: name,
            position_id: z.union([id, z.literal('')]),
            pass_score: z.coerce.number().int().min(1).max(100),
            duration_minutes: z.coerce.number().int().min(1).max(10000),
            auto_assign: z.boolean(),
            requires_signoff: z.boolean(),
          })
          .parse(input);
        const c = (
          await db.query(
            `INSERT INTO courses(company_id,title,description,category,position_id,pass_score,duration_minutes,auto_assign,requires_signoff) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [
              a.companyId,
              v.title,
              v.description,
              v.category,
              v.position_id || null,
              v.pass_score,
              v.duration_minutes,
              v.auto_assign,
              v.requires_signoff,
            ],
          )
        ).rows[0];
        await audit(db, a, action, c.id);
        return { message: 'สร้างหลักสูตรฉบับร่างแล้ว เพิ่มบทเรียนและข้อสอบก่อนเผยแพร่', id: c.id };
      }
      case 'lesson.create': {
        allow(a, ['admin', 'hr']);
        const v = z
          .object({
            course_id: id,
            title: name,
            type: z.enum(['text', 'video', 'document']),
            content: z.string().min(3).max(30000),
            media_url: safeUrl,
            asset_id: z.union([id, z.literal('')]).optional(),
          })
          .parse(input);
        const c = (
          await db.query(
            'SELECT id,published FROM courses WHERE company_id=$1 AND id=$2 FOR UPDATE',
            [a.companyId, v.course_id],
          )
        ).rows[0];
        if (!c) throw new AppError('ไม่พบหลักสูตร', 404);
        if (c.published)
          throw new AppError(
            'หลักสูตรเผยแพร่แล้ว กรุณาสร้างฉบับใหม่เพื่อไม่เปลี่ยนเกณฑ์ของผู้เรียนเดิม',
          );
        if (v.asset_id) {
          const asset = (
            await db.query(
              "SELECT * FROM learning_assets WHERE company_id=$1 AND id=$2 AND course_id=$3 AND state='ready'",
              [a.companyId, v.asset_id, v.course_id],
            )
          ).rows[0];
          if (!asset) throw new AppError('ไม่พบไฟล์ที่อัปโหลดสำเร็จของหลักสูตรนี้');
          if (
            (v.type === 'video' && !asset.content_type.startsWith('video/')) ||
            (v.type === 'document' && asset.content_type !== 'application/pdf') ||
            v.type === 'text'
          )
            throw new AppError('ชนิดไฟล์ไม่ตรงกับบทเรียน');
        }
        if (v.type === 'video' && !v.media_url && !v.asset_id)
          throw new AppError('กรุณาใส่ลิงก์หรืออัปโหลดวิดีโอ');
        await db.query(
          'INSERT INTO lessons(company_id,course_id,title,type,content,media_url,asset_id,sort_order) SELECT $1,$2,$3,$4,$5,$6,$7,COALESCE(MAX(sort_order),0)+1 FROM lessons WHERE company_id=$1 AND course_id=$2',
          [
            a.companyId,
            v.course_id,
            v.title,
            v.type,
            v.content,
            v.asset_id ? null : v.media_url || null,
            v.asset_id || null,
          ],
        );
        await audit(db, a, action, v.course_id);
        return { message: 'เพิ่มบทเรียนแล้ว' };
      }
      case 'question.create': {
        allow(a, ['admin', 'hr']);
        const v = z
          .object({
            course_id: id,
            prompt: name,
            options: z.array(name).min(2).max(6),
            correct_index: z.coerce.number().int().min(0),
            explanation: z.string().max(3000),
          })
          .parse(input);
        if (v.correct_index >= v.options.length)
          throw new AppError('คำตอบที่ถูกต้องไม่อยู่ในตัวเลือก');
        const c = (
          await db.query(
            'SELECT id,published FROM courses WHERE company_id=$1 AND id=$2 FOR UPDATE',
            [a.companyId, v.course_id],
          )
        ).rows[0];
        if (!c) throw new AppError('ไม่พบหลักสูตร', 404);
        if (c.published) throw new AppError('หลักสูตรเผยแพร่แล้ว');
        await db.query(
          'INSERT INTO questions(company_id,course_id,prompt,options,correct_index,explanation) VALUES($1,$2,$3,$4,$5,$6)',
          [
            a.companyId,
            v.course_id,
            v.prompt,
            JSON.stringify(v.options),
            v.correct_index,
            v.explanation,
          ],
        );
        await audit(db, a, action, v.course_id);
        return { message: 'เพิ่มข้อสอบแล้ว' };
      }
      case 'course.publish': {
        allow(a, ['admin', 'hr']);
        const v = z.object({ id }).parse(input);
        const c = (
          await db.query('SELECT * FROM courses WHERE company_id=$1 AND id=$2 FOR UPDATE', [
            a.companyId,
            v.id,
          ])
        ).rows[0];
        if (!c) throw new AppError('ไม่พบหลักสูตร', 404);
        const counts = (
          await db.query(
            'SELECT (SELECT COUNT(*) FROM lessons WHERE company_id=$1 AND course_id=$2) AS lessons,(SELECT COUNT(*) FROM questions WHERE company_id=$1 AND course_id=$2) AS questions',
            [a.companyId, v.id],
          )
        ).rows[0];
        if (!Number(counts.lessons) || !Number(counts.questions))
          throw new AppError('ต้องมีบทเรียนและข้อสอบก่อนเผยแพร่');
        await db.query('UPDATE courses SET published=true WHERE company_id=$1 AND id=$2', [
          a.companyId,
          v.id,
        ]);
        await db.query(
          'UPDATE courses SET auto_assign=false WHERE company_id=$1 AND family_id=$2 AND version<$3',
          [a.companyId, c.family_id, c.version],
        );
        if (c.auto_assign)
          await db.query(
            `INSERT INTO enrollments(company_id,course_id,employee_id) SELECT $1,$2,id FROM employees WHERE company_id=$1 AND status!='exited' AND ($3::uuid IS NULL OR position_id=$3) ON CONFLICT(company_id,course_id,employee_id) DO NOTHING`,
            [a.companyId, v.id, c.position_id],
          );
        await audit(db, a, action, v.id);
        return { message: 'เผยแพร่และมอบหมายหลักสูตรแล้ว' };
      }
      case 'course.assign': {
        allow(a, ['admin', 'hr', 'manager']);
        const v = z.object({ course_id: id, employee_id: id, due_date: date }).parse(input);
        await employee(db, a, v.employee_id, true);
        const c = (
          await db.query(
            'SELECT id FROM courses WHERE company_id=$1 AND id=$2 AND published=true',
            [a.companyId, v.course_id],
          )
        ).rows[0];
        if (!c) throw new AppError('ไม่พบหลักสูตรที่เผยแพร่', 404);
        await db.query(
          'INSERT INTO enrollments(company_id,course_id,employee_id,due_date) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,course_id,employee_id) DO UPDATE SET due_date=excluded.due_date',
          [a.companyId, v.course_id, v.employee_id, v.due_date],
        );
        await audit(db, a, action, v.course_id, { employee_id: v.employee_id });
        return { message: 'มอบหมายหลักสูตรแล้ว' };
      }
      case 'lesson.complete': {
        const v = z.object({ enrollment_id: id, lesson_id: id }).parse(input);
        const n = await enrollment(db, a, v.enrollment_id);
        const l = (
          await db.query('SELECT id FROM lessons WHERE company_id=$1 AND id=$2 AND course_id=$3', [
            a.companyId,
            v.lesson_id,
            n.course_id,
          ])
        ).rows[0];
        if (!l) throw new AppError('บทเรียนไม่อยู่ในหลักสูตรนี้', 404);
        await db.query(
          'INSERT INTO lesson_progress(company_id,enrollment_id,lesson_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [a.companyId, n.id, v.lesson_id],
        );
        await audit(db, a, action, n.id);
        return { message: 'บันทึกบทเรียนที่เรียนจบแล้ว' };
      }
      case 'quiz.submit': {
        const v = z
          .object({
            enrollment_id: id,
            answers: z.record(z.string(), z.number().int().min(0).max(5)),
          })
          .parse(input);
        const n = await enrollment(db, a, v.enrollment_id);
        const missing = await db.query(
          'SELECT id FROM lessons l WHERE l.company_id=$1 AND l.course_id=$2 AND NOT EXISTS(SELECT 1 FROM lesson_progress p WHERE p.company_id=$1 AND p.enrollment_id=$3 AND p.lesson_id=l.id)',
          [a.companyId, n.course_id, n.id],
        );
        if (missing.rows.length) throw new AppError('กรุณาเรียนให้ครบทุกบทก่อนทำแบบทดสอบ');
        const qs = (
          await db.query(
            'SELECT id,correct_index,explanation,prompt FROM questions WHERE company_id=$1 AND course_id=$2 ORDER BY id',
            [a.companyId, n.course_id],
          )
        ).rows as { id: string; correct_index: number; explanation: string; prompt: string }[];
        const score = grade(qs, v.answers);
        const passed = score >= n.pass_score;
        await db.query(
          'INSERT INTO quiz_attempts(company_id,enrollment_id,answers,score) VALUES($1,$2,$3,$4)',
          [a.companyId, n.id, JSON.stringify(v.answers), score],
        );
        await db.query(
          'UPDATE enrollments SET best_score=GREATEST(best_score,$3),passed_at=CASE WHEN $4 THEN COALESCE(passed_at,now()) ELSE passed_at END WHERE company_id=$1 AND id=$2',
          [a.companyId, n.id, score, passed],
        );
        // Failed attempts reset lesson acknowledgement; learners revisit before retaking.
        if (!passed && !n.passed_at)
          await db.query('DELETE FROM lesson_progress WHERE company_id=$1 AND enrollment_id=$2', [
            a.companyId,
            n.id,
          ]);
        await audit(db, a, action, n.id, { score });
        return {
          message: passed ? 'ผ่านแบบทดสอบแล้ว' : 'ยังไม่ผ่าน กรุณาทบทวนบทเรียนแล้วสอบใหม่',
          score,
          passed,
          feedback: qs.map((q) => ({
            prompt: q.prompt,
            correct: v.answers[q.id] === q.correct_index,
            explanation: q.explanation,
          })),
        };
      }
      case 'skill.signoff': {
        allow(a, ['admin', 'hr', 'manager']);
        const v = z
          .object({ enrollment_id: id, note: z.string().trim().min(5).max(3000) })
          .parse(input);
        const n = await enrollment(db, a, v.enrollment_id, true);
        if (n.employee_id === a.employeeId)
          throw new AppError('ไม่สามารถตรวจรับทักษะของตนเองได้', 403);
        if (!n.requires_signoff) throw new AppError('หลักสูตรนี้ไม่ต้องตรวจรับ');
        if (!n.passed_at) throw new AppError('ต้องผ่านแบบทดสอบก่อนตรวจรับทักษะ');
        if (n.signed_off_at) throw new AppError('ตรวจรับแล้ว');
        const missing = (
          await db.query(
            'SELECT i.id FROM skill_items i WHERE i.company_id=$1 AND i.course_id=$2 AND i.required=true AND NOT EXISTS(SELECT 1 FROM skill_checks sc WHERE sc.company_id=$1 AND sc.enrollment_id=$3 AND sc.item_id=i.id AND sc.passed=true)',
            [a.companyId, n.course_id, n.id],
          )
        ).rows;
        if (missing.length)
          throw new AppError('ต้องผ่านเช็กลิสต์ทักษะที่จำเป็นครบทุกข้อก่อนตรวจรับ');
        await db.query(
          'UPDATE enrollments SET signed_off_at=now(),signed_off_by=$3,signoff_note=$4 WHERE company_id=$1 AND id=$2',
          [a.companyId, n.id, a.userId, v.note],
        );
        await audit(db, a, action, n.id);
        return { message: 'ตรวจรับทักษะแล้ว พนักงานพร้อมปฏิบัติงานในหลักสูตรนี้' };
      }
      case 'integration.save': {
        allow(a, ['admin']);
        const v = z
          .object({
            line_recipient: z
              .string()
              .max(100)
              .regex(/^[a-zA-Z0-9]*$/),
          })
          .parse(input);
        await db.query(
          'INSERT INTO integrations(company_id,line_recipient) VALUES($1,$2) ON CONFLICT(company_id) DO UPDATE SET line_recipient=excluded.line_recipient,updated_at=now()',
          [a.companyId, v.line_recipient || null],
        );
        await audit(db, a, action, a.companyId);
        return { message: 'บันทึกการตั้งค่าแล้ว' };
      }
      case 'integration.rotate': {
        allow(a, ['admin']);
        const key = randomBytes(32).toString('hex');
        await db.query(
          'INSERT INTO integrations(company_id,device_key_hash) VALUES($1,$2) ON CONFLICT(company_id) DO UPDATE SET device_key_hash=excluded.device_key_hash,updated_at=now()',
          [a.companyId, createHash('sha256').update(key).digest('hex')],
        );
        await audit(db, a, action, a.companyId);
        return { message: 'สร้าง API key แล้ว เก็บไว้ทันที ระบบจะแสดงเพียงครั้งนี้', key };
      }
      case 'password.change': {
        const v = z
          .object({ current: z.string(), password: z.string().min(12).max(100) })
          .parse(input);
        const { compare } = await import('bcryptjs');
        const u = (await db.query('SELECT password_hash FROM users WHERE id=$1', [a.userId]))
          .rows[0];
        if (!u?.password_hash || !(await compare(v.current, u.password_hash)))
          throw new AppError('รหัสผ่านปัจจุบันไม่ถูกต้อง');
        await db.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
          a.userId,
          await hash(v.password, 12),
        ]);
        await audit(db, a, action, a.userId);
        return { message: 'เปลี่ยนรหัสผ่านแล้ว' };
      }
      default:
        throw new AppError('ไม่พบรายการ', 404);
    }
  });
}
export async function ingestAttendance(companyId: string, key: string, input: unknown) {
  const v = z
    .object({
      employee_code: name,
      event_id: z.string().min(1).max(200),
      type: z.enum(['in', 'out']),
      timestamp: z.iso.datetime({ offset: true }),
    })
    .parse(input);
  const [config] = await query('SELECT device_key_hash FROM integrations WHERE company_id=$1', [
    id.parse(companyId),
  ]);
  const digest = createHash('sha256').update(key).digest();
  if (
    !config?.device_key_hash ||
    !timingSafeEqual(digest, Buffer.from(config.device_key_hash, 'hex'))
  )
    throw new AppError('Invalid integration key', 401);
  const time = new Date(v.timestamp);
  if (time > new Date(Date.now() + 5 * 60000) || time < new Date(Date.now() - 31 * 86400000))
    throw new AppError('Timestamp outside 31-day import window');
  return transaction(async (db) => {
    const e = (
      await db.query(
        `SELECT id FROM employees WHERE company_id=$1 AND code=$2 AND status!='exited' FOR UPDATE`,
        [companyId, v.employee_code],
      )
    ).rows[0];
    if (!e) throw new AppError('Unknown employee', 404);
    const duplicate = (
      await db.query(
        'SELECT id FROM audit_logs WHERE company_id=$1 AND action=$2 AND entity_id=$3',
        [companyId, 'device.' + v.type, v.event_id],
      )
    ).rows[0];
    if (duplicate) return { duplicate: true };
    if (v.type === 'in') {
      const r = await db.query(
        `INSERT INTO attendance(company_id,employee_id,work_date,check_in,source,device_event_id) VALUES($1,$2,$3,$4,'device',$5) ON CONFLICT(company_id,employee_id,work_date) DO NOTHING RETURNING id`,
        [companyId, e.id, bangkokDate(time), time, v.event_id],
      );
      if (!r.rows.length) throw new AppError('Employee already checked in on this date', 409);
    } else {
      const r = await db.query(
        `UPDATE attendance SET check_out=$3 WHERE company_id=$1 AND employee_id=$2 AND check_out IS NULL AND check_in<=$3 AND check_in>=$3::timestamptz-interval '24 hours' RETURNING id`,
        [companyId, e.id, time],
      );
      if (!r.rows.length) throw new AppError('No open check-in', 409);
    }
    await db.query('INSERT INTO audit_logs(company_id,action,entity_id) VALUES($1,$2,$3)', [
      companyId,
      'device.' + v.type,
      v.event_id,
    ]);
    return { duplicate: false };
  });
}
