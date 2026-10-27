'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runAction } from '@/app/actions';
import { stages } from '@/lib/learning-labels';
import { bangkokDate, ready } from '@/lib/policy';
type Row = Record<string, any>;
export default function LearningPaths({ data: d }: { data: Row }) {
  const [busy, start] = useTransition(),
    [message, setMessage] = useState('');
  const router = useRouter();
  const staff = ['admin', 'hr'].includes(d.actor.role);
  const manage = d.actor.role !== 'employee';
  function submit(action: string, e: React.FormEvent<HTMLFormElement>, fixed: Row = {}) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data: Row = { ...fixed };
    for (const [k, v] of f) data[k] = String(v);
    if (action === 'path.create') data.auto_assign = f.has('auto_assign');
    start(async () => {
      const result: any = await runAction(action, data);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }
  const employees = d.employees.filter(
    (e: Row) => e.status !== 'exited' && (staff || e.manager_id === d.actor.employeeId),
  );
  return (
    <>
      <div className="section-note">
        <strong>กำหนดการเรียนตั้งแต่วันแรกจนพร้อมทำงาน</strong>
        <p>กำหนดวันครบเรียนตามวันเริ่มเส้นทาง หลักสูตรที่เคยมอบหมายแล้วจะคงผลสอบและกำหนดเดิม</p>
      </div>
      {message && (
        <div role="status" className="notice">
          {message}
        </div>
      )}
      {staff && (
        <details className="panel phase-form">
          <summary>＋ สร้างเส้นทางการเรียนรู้</summary>
          <form className="data-form" onSubmit={(e) => submit('path.create', e)}>
            <label>
              ชื่อเส้นทาง
              <input name="title" minLength={3} required />
            </label>
            <label>
              รายละเอียด
              <textarea name="description" />
            </label>
            <label>
              ตำแหน่ง
              <select name="position_id">
                <option value="">ทุกตำแหน่ง</option>
                {d.positions.map((p: Row) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input name="auto_assign" type="checkbox" defaultChecked />
              มอบหมายอัตโนมัติเมื่อเริ่มงานหรือเปลี่ยนตำแหน่ง
            </label>
            <button className="btn primary" disabled={busy}>
              สร้างฉบับร่าง
            </button>
          </form>
        </details>
      )}
      {!d.paths.length && (
        <div className="panel empty">
          <strong>ยังไม่มีเส้นทางการเรียนรู้</strong>
          <span>
            เริ่มจากหลักสูตรที่เผยแพร่แล้ว แล้วจัดเข้าช่วงวันแรก / สัปดาห์แรก / ก่อนผ่านทดลองงาน
          </span>
        </div>
      )}
      {d.paths.map((p: Row) => {
        const items = d.pathItems.filter((i: Row) => i.path_id === p.id);
        const own = d.pathAssignments.find(
          (a: Row) => a.path_id === p.id && a.employee_id === d.actor.employeeId,
        );
        return (
          <section className="panel" key={p.id}>
            <div className="panel-head">
              <div>
                <h2>{p.title}</h2>
                <p>{p.description}</p>
              </div>
              <span className={'badge ' + (p.published ? 'mint' : 'orange')}>
                {p.published ? 'เผยแพร่แล้ว' : 'ฉบับร่าง'}
              </span>
            </div>
            <div className="path-stages">
              {Object.entries(stages).map(([key, label]) => (
                <div key={key}>
                  <h3>{label}</h3>
                  {items
                    .filter((i: Row) => i.stage === key)
                    .map((i: Row) => {
                      const n = d.enrollments.find(
                        (n: Row) =>
                          n.course_id === i.course_id && n.employee_id === d.actor.employeeId,
                      );
                      return (
                        <div className="path-step" key={i.id}>
                          <strong>{i.course_title}</strong>
                          <small>
                            ภายใน{' '}
                            {i.due_days === 0 ? 'วันเริ่มต้น' : i.due_days + ' วันหลังเริ่มต้น'}
                          </small>
                          {own && (
                            <span className="badge">
                              {n && ready(n, n.requires_signoff)
                                ? 'ผ่านเกณฑ์แล้ว'
                                : n?.passed_at
                                  ? 'รอตรวจรับทักษะ'
                                  : 'อยู่ระหว่างเรียน'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
            {!p.published && staff && (
              <div className="pad">
                <form
                  className="phase-inline-form"
                  onSubmit={(e) => submit('path.item', e, { path_id: p.id })}
                >
                  <label>
                    หลักสูตร
                    <select name="course_id" required>
                      {d.courses
                        .filter((c: Row) => c.published)
                        .map((c: Row) => (
                          <option key={c.id} value={c.id}>
                            {c.title} · v{c.version}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    ช่วงเวลา
                    <select name="stage">
                      {Object.entries(stages).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    ครบกำหนดหลังเริ่ม (วัน)
                    <input
                      name="due_days"
                      type="number"
                      min={0}
                      max={365}
                      defaultValue={7}
                      required
                    />
                  </label>
                  <button className="btn" disabled={busy}>
                    เพิ่ม / ปรับขั้นตอน
                  </button>
                </form>
                <form onSubmit={(e) => submit('path.publish', e, { id: p.id })}>
                  <button className="btn primary" disabled={busy || !items.length}>
                    เผยแพร่เส้นทาง
                  </button>
                </form>
              </div>
            )}
            {p.published && manage && (
              <details className="phase-form">
                <summary>
                  มอบหมายให้พนักงาน (
                  {d.pathAssignments.filter((a: Row) => a.path_id === p.id).length} คนในความดูแล)
                </summary>
                <form
                  className="phase-inline-form"
                  onSubmit={(e) => submit('path.assign', e, { path_id: p.id })}
                >
                  <label>
                    พนักงาน
                    <select name="employee_id" required>
                      {employees.map((e: Row) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    วันเริ่มเส้นทาง
                    <input name="start_date" type="date" defaultValue={bangkokDate()} required />
                  </label>
                  <button className="btn primary" disabled={busy}>
                    มอบหมาย
                  </button>
                </form>
              </details>
            )}
            {p.published && staff && p.auto_assign && (
              <div className="pad">
                <button
                  className="btn small"
                  disabled={busy}
                  onClick={() =>
                    start(async () => {
                      const r: any = await runAction('path.retire', { id: p.id });
                      setMessage(r.message);
                      if (r.ok) router.refresh();
                    })
                  }
                >
                  หยุดมอบหมายอัตโนมัติ (เก็บประวัติเดิม)
                </button>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
