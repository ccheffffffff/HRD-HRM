'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runAction } from '@/app/actions';
type Row = Record<string, any>;
export default function SkillChecklist({
  enrollment: n,
  items,
  checks,
  onClose,
}: {
  enrollment: Row;
  items: Row[];
  checks: Row[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    router = useRouter();
  const [busy, start] = useTransition(),
    [message, setMessage] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog ref={dialog} className="dialog wide" onCancel={onClose}>
      <div className="dialog-head">
        <h2>ตรวจทักษะจากการทำงานจริง · {n.title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="ปิด">
          ×
        </button>
      </div>
      <form
        className="data-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;
          start(async () => {
            try {
              if (items.length) {
                const result: any = await runAction('skill.review', {
                  enrollment_id: n.id,
                  checks: items.map((i) => ({
                    item_id: i.id,
                    passed: f.get('passed_' + i.id) === 'yes',
                    note: String(f.get('note_' + i.id)),
                  })),
                });
                if (!result.ok) {
                  setMessage(result.message);
                  return;
                }
              }
              if (submitter?.value === 'signoff') {
                const r: any = await runAction('skill.signoff', {
                  enrollment_id: n.id,
                  note: String(f.get('final_note')),
                });
                setMessage(r.message);
                if (r.ok) {
                  router.refresh();
                  onClose();
                }
              } else {
                setMessage('บันทึกผลสังเกตแล้ว ข้อที่ยังไม่ผ่านสามารถกลับมาประเมินซ้ำได้');
                router.refresh();
              }
            } catch {
              setMessage('บันทึกไม่สำเร็จ กรุณาลองใหม่');
            }
          });
        }}
      >
        <p className="muted small">
          ตรวจงานจริงทีละข้อ ก่อนรับรองความพร้อม พนักงานต้องผ่านเกณฑ์ที่จำเป็นทุกข้อ
        </p>
        {items.map((i) => {
          const check = checks.find((c) => c.item_id === i.id);
          return (
            <fieldset className="quiz-question" key={i.id}>
              <legend>
                {i.title} {i.required ? '(จำเป็น)' : '(เพิ่มเติม)'}
              </legend>
              <label>
                ผลสังเกต
                <select name={'passed_' + i.id} defaultValue={check?.passed ? 'yes' : 'no'}>
                  <option value="no">ยังไม่ผ่าน / ต้องฝึกเพิ่ม</option>
                  <option value="yes">ทำได้ตามมาตรฐาน</option>
                </select>
              </label>
              <label>
                หลักฐานหรือสิ่งที่ต้องฝึก
                <textarea
                  name={'note_' + i.id}
                  defaultValue={check?.note ?? ''}
                  minLength={3}
                  required
                />
              </label>
            </fieldset>
          );
        })}
        <label>
          สรุปการตรวจรับ
          <textarea name="final_note" minLength={5} placeholder="ระบุงานที่สังเกตและผลการปฏิบัติ" />
        </label>
        {message && (
          <div role="status" className="notice">
            {message}
          </div>
        )}
        <div className="form-footer">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            ปิด
          </button>
          {items.length > 0 && (
            <button className="btn" value="save" disabled={busy}>
              บันทึกผลสังเกต
            </button>
          )}
          <button className="btn primary" value="signoff" disabled={busy}>
            บันทึกและรับรองพร้อมทำงาน
          </button>
        </div>
      </form>
    </dialog>
  );
}
