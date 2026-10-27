import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { database, query, closeDatabase } from '../src/lib/db';
import { mutate, ingestAttendance } from '../src/lib/service';
import { grade, csvCell, bangkokDate, ready, type Actor } from '../src/lib/policy';
import { PGlite } from '@electric-sql/pglite';
import { readEmployees } from '../src/lib/repository';
process.env.DATABASE_URL = 'pglite:memory';
let admin: Actor, learner: Actor, manager: Actor, outsider: Actor;
let company: string,
  other: string,
  position: string,
  department: string,
  course: string,
  lesson: string,
  question: string,
  enrollment: string,
  secondLearner: string;
before(async () => {
  const db = database() as PGlite;
  await db.exec(readFileSync('db/001_initial.sql', 'utf8'));
  [company, other] = [randomUUID(), randomUUID()];
  await query(`INSERT INTO companies(id,name,slug) VALUES($1,'A','test-a'),($2,'B','test-b')`, [
    company,
    other,
  ]);
  const users = [];
  for (let i = 0; i < 4; i++) {
    const [u] = await query('INSERT INTO users(email,name) VALUES($1,$2) RETURNING id', [
      `u${i}@test.local`,
      `User ${i}`,
    ]);
    users.push(u.id);
  }
  const [dep] = await query(
    `INSERT INTO departments(company_id,name) VALUES($1,'Operations') RETURNING id`,
    [company],
  );
  department = dep.id;
  const [pos] = await query(
    `INSERT INTO positions(company_id,name) VALUES($1,'Service') RETURNING id`,
    [company],
  );
  position = pos.id;
  const employeeIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const [e] = await query(
      `INSERT INTO employees(company_id,user_id,code,name,email,department_id,position_id,manager_id,start_date,probation_end,annual_leave_days) VALUES($1,$2,$3,$3,$4,$5,$6,$7,CURRENT_DATE,CURRENT_DATE+90,6) RETURNING id`,
      [
        company,
        users[i],
        `EMP${i}`,
        `u${i}@test.local`,
        department,
        position,
        i === 2 ? employeeIds[1] : null,
      ],
    );
    employeeIds.push(e.id);
  }
  admin = {
    companyId: company,
    userId: users[0],
    employeeId: employeeIds[0],
    role: 'admin',
    name: 'Admin',
  };
  manager = {
    companyId: company,
    userId: users[1],
    employeeId: employeeIds[1],
    role: 'manager',
    name: 'Manager',
  };
  learner = {
    companyId: company,
    userId: users[2],
    employeeId: employeeIds[2],
    role: 'employee',
    name: 'Learner',
  };
  outsider = { companyId: other, userId: users[3], employeeId: null, role: 'admin', name: 'Other' };
  for (const a of [admin, manager, learner, outsider])
    await query(
      'INSERT INTO memberships(company_id,user_id,employee_id,role) VALUES($1,$2,$3,$4)',
      [a.companyId, a.userId, a.employeeId, a.role],
    );
});
after(closeDatabase);
test('employees cannot create organizational records', async () => {
  await assert.rejects(mutate(learner, 'department.create', { name: 'forbidden' }), /ไม่มีสิทธิ์/);
  assert.equal((await query(`SELECT * FROM departments WHERE name='forbidden'`)).length, 0);
});
test('roster reads isolate tenants and scope employees/direct reports', async () => {
  const own = await readEmployees(learner);
  assert.equal(own.length, 1);
  assert.equal(own[0].id, learner.employeeId);
  const team = await readEmployees(manager);
  assert.deepEqual(
    new Set(team.map((e) => e.id)),
    new Set([manager.employeeId, learner.employeeId]),
  );
  assert.equal((await readEmployees(outsider)).length, 0);
  assert.equal((await readEmployees(admin)).length, 3);
});
test('create draft, add content, validate publish and auto-enroll', async () => {
  const c = await mutate(admin, 'course.create', {
    title: 'Safety',
    description: 'Read the manual',
    category: 'Safety',
    position_id: position,
    pass_score: 80,
    duration_minutes: 15,
    auto_assign: true,
    requires_signoff: true,
  });
  course = String(c.id);
  await assert.rejects(mutate(admin, 'course.publish', { id: course }), /บทเรียนและข้อสอบ/);
  await mutate(admin, 'lesson.create', {
    course_id: course,
    title: 'Manual',
    type: 'text',
    content: 'Ask your manager when unsure',
  });
  await mutate(admin, 'question.create', {
    course_id: course,
    prompt: 'Who do you ask?',
    options: ['Nobody', 'Manager'],
    correct_index: 1,
    explanation: 'Ask your manager',
  });
  await mutate(admin, 'course.publish', { id: course });
  lesson = (await query('SELECT id FROM lessons WHERE course_id=$1', [course]))[0].id;
  question = (await query('SELECT id FROM questions WHERE course_id=$1', [course]))[0].id;
  const ns = await query('SELECT * FROM enrollments WHERE course_id=$1', [course]);
  assert.equal(ns.length, 3);
  enrollment = ns.find((n) => n.employee_id === learner.employeeId)!.id;
});
test('cross-company mutations and foreign keys reject tenant escape', async () => {
  await assert.rejects(mutate(outsider, 'course.publish', { id: course }), /ไม่พบหลักสูตร/);
  await assert.rejects(
    mutate(outsider, 'lesson.create', {
      course_id: course,
      title: 'evil',
      type: 'text',
      content: 'evil content',
    }),
    /ไม่พบหลักสูตร/,
  );
  await assert.rejects(
    query(
      `INSERT INTO employees(company_id,code,name,email,position_id,start_date,probation_end) VALUES($1,'evil','evil','evil@test.local',$2,CURRENT_DATE,CURRENT_DATE+1)`,
      [other, position],
    ),
    (e: any) => e.code === '23503',
  );
});
test('new employee automatically receives matching published courses', async () => {
  await mutate(admin, 'employee.create', {
    name: 'New learner',
    email: 'new@test.local',
    code: 'NEW',
    phone: '',
    branch: 'HQ',
    department_id: department,
    position_id: position,
    manager_id: manager.employeeId,
    start_date: bangkokDate(),
    probation_end: bangkokDate(new Date(Date.now() + 86400000)),
    password: 'temporary-test-password',
    role: 'employee',
  });
  secondLearner = (await query(`SELECT id FROM employees WHERE code='NEW'`))[0].id;
  assert.equal(
    (
      await query('SELECT id FROM enrollments WHERE employee_id=$1 AND course_id=$2', [
        secondLearner,
        course,
      ])
    ).length,
    1,
  );
});
test('quiz cannot bypass lessons, failed quiz requires revision, passing waits for manager', async () => {
  await assert.rejects(
    mutate(learner, 'quiz.submit', { enrollment_id: enrollment, answers: { [question]: 1 } }),
    /ครบทุกบท/,
  );
  await mutate(learner, 'lesson.complete', { enrollment_id: enrollment, lesson_id: lesson });
  const failed = await mutate(learner, 'quiz.submit', {
    enrollment_id: enrollment,
    answers: { [question]: 0 },
  });
  assert.equal(failed.score, 0);
  assert.equal(failed.passed, false);
  assert.equal(
    (await query('SELECT * FROM lesson_progress WHERE enrollment_id=$1', [enrollment])).length,
    0,
  );
  await mutate(learner, 'lesson.complete', { enrollment_id: enrollment, lesson_id: lesson });
  const passed = await mutate(learner, 'quiz.submit', {
    enrollment_id: enrollment,
    answers: { [question]: 1 },
  });
  assert.equal(passed.score, 100);
  const [n] = await query('SELECT * FROM enrollments WHERE id=$1', [enrollment]);
  assert.equal(ready(n as any, true), false);
  assert.equal(ready(n as any, false), true);
});
test('skills require authorization, no self signoff, and actual test pass', async () => {
  await assert.rejects(
    mutate(learner, 'skill.signoff', { enrollment_id: enrollment, note: 'good work' }),
    /ไม่มีสิทธิ์/,
  );
  await assert.rejects(
    mutate(outsider, 'skill.signoff', { enrollment_id: enrollment, note: 'good work' }),
    /ไม่พบการลงทะเบียน/,
  );
  await mutate(manager, 'skill.signoff', {
    enrollment_id: enrollment,
    note: 'Observed live service and verified checklist',
  });
  const [n] = await query('SELECT * FROM enrollments WHERE id=$1', [enrollment]);
  assert.equal(ready(n as any, true), true);
  assert.equal(n.signed_off_by, manager.userId);
  const [own] = await query('SELECT id FROM enrollments WHERE employee_id=$1', [
    manager.employeeId,
  ]);
  await assert.rejects(
    mutate(manager, 'skill.signoff', { enrollment_id: own.id, note: 'self review' }),
    /ไม่มีสิทธิ์|ตนเอง/,
  );
  const [unpassed] = await query('SELECT id FROM enrollments WHERE employee_id=$1', [
    secondLearner,
  ]);
  await assert.rejects(
    mutate(manager, 'skill.signoff', { enrollment_id: unpassed.id, note: 'reviewed' }),
    /ผ่านแบบทดสอบ/,
  );
});
test('leave cannot approve itself, cannot exceed allowance, and permits authorized review', async () => {
  const day = bangkokDate(new Date(Date.now() + 3 * 86400000));
  await mutate(learner, 'request.create', {
    type: 'leave',
    leave_type: 'annual',
    start_date: day,
    end_date: day,
    hours: 0,
    reason: 'Family appointment',
  });
  const [r] = await query('SELECT * FROM requests WHERE employee_id=$1', [learner.employeeId]);
  await assert.rejects(
    mutate({ ...learner, role: 'admin' }, 'request.review', {
      id: r.id,
      status: 'approved',
      note: '',
    }),
    /ตนเอง/,
  );
  await assert.rejects(
    mutate(outsider, 'request.review', { id: r.id, status: 'approved', note: '' }),
    /ไม่พบคำขอ/,
  );
  await mutate(manager, 'request.review', {
    id: r.id,
    status: 'approved',
    note: 'Coverage arranged',
  });
  assert.equal(
    (await query('SELECT status FROM requests WHERE id=$1', [r.id]))[0].status,
    'approved',
  );
  await assert.rejects(
    mutate(manager, 'request.review', { id: r.id, status: 'rejected', note: '' }),
    /พิจารณาแล้ว/,
  );
  const long = bangkokDate(new Date(Date.now() + 10 * 86400000)),
    end = bangkokDate(new Date(Date.now() + 20 * 86400000));
  await mutate(learner, 'request.create', {
    type: 'leave',
    leave_type: 'annual',
    start_date: long,
    end_date: end,
    hours: 0,
    reason: 'Long holiday',
  });
  const [large] = await query(`SELECT id FROM requests WHERE employee_id=$1 AND status='pending'`, [
    learner.employeeId,
  ]);
  await assert.rejects(
    mutate(manager, 'request.review', { id: large.id, status: 'approved', note: '' }),
    /เกินสิทธิ์/,
  );
});
test('device credentials are tenant scoped and events are idempotent', async () => {
  const r = await mutate(admin, 'integration.rotate', {});
  const event = {
    employee_code: 'EMP2',
    event_id: 'evt-001',
    type: 'in',
    timestamp: new Date().toISOString(),
  };
  await assert.rejects(ingestAttendance(other, String(r.key), event), /Invalid integration key/);
  await assert.rejects(ingestAttendance(company, 'wrong', event), /Invalid integration key/);
  assert.equal((await ingestAttendance(company, String(r.key), event)).duplicate, false);
  assert.equal((await ingestAttendance(company, String(r.key), event)).duplicate, true);
  assert.equal(
    (await query(`SELECT id FROM attendance WHERE employee_id=$1`, [learner.employeeId])).length,
    1,
  );
  const out = {
    ...event,
    event_id: 'evt-002',
    type: 'out',
    timestamp: new Date(Date.now() + 1000).toISOString(),
  };
  await ingestAttendance(company, String(r.key), out);
  assert.ok(
    (await query('SELECT check_out FROM attendance WHERE employee_id=$1', [learner.employeeId]))[0]
      .check_out,
  );
});
test('audit trail captures writes and excludes raw integration secrets', async () => {
  const logs = await query('SELECT * FROM audit_logs WHERE company_id=$1', [company]);
  assert.ok(logs.length > 10);
  assert.ok(logs.some((l) => l.action === 'quiz.submit'));
  assert.ok(logs.some((l) => l.action === 'skill.signoff'));
  const [i] = await query('SELECT device_key_hash FROM integrations WHERE company_id=$1', [
    company,
  ]);
  assert.equal(i.device_key_hash.length, 64);
});
test('grading, CSV protection and Bangkok dates', () => {
  assert.equal(grade([{ id: 'q', correct_index: 2 }], { q: 2 }), 100);
  assert.throws(() => grade([], {}));
  assert.equal(csvCell('=HYPERLINK("evil")'), '"\'=HYPERLINK(""evil"")"');
  assert.equal(bangkokDate(new Date('2026-10-26T18:00:00Z')), '2026-10-27');
});
