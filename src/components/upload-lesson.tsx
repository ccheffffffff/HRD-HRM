'use client';
import { upload } from '@vercel/blob/client';
import { useEffect, useRef, useState } from 'react';
import { runAction } from '@/app/actions';
export default function UploadLesson({
  courseId,
  onClose,
  onSaved,
}: {
  courseId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  async function json(url: string, data: unknown) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error ?? 'ไม่สามารถอัปโหลดได้');
    return body;
  }
  return (
    <dialog
      ref={dialog}
      className="dialog"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <div className="dialog-head">
        <h2>อัปโหลดไฟล์บทเรียน</h2>
        <button className="icon-btn" disabled={busy} onClick={onClose} aria-label="ปิด">
          ×
        </button>
      </div>
      <form
        className="data-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            file = f.get('file') as File;
          setBusy(true);
          setMessage('กำลังเตรียมไฟล์…');
          try {
            const asset = await json('/api/files/reserve', {
              course_id: courseId,
              filename: file.name,
              content_type: file.type,
              size_bytes: file.size,
            });
            if (asset.storage === 'blob') {
              await upload(asset.pathname, file, {
                access: 'private',
                handleUploadUrl: '/api/files/token',
                clientPayload: asset.id,
                multipart: true,
                onUploadProgress: (p) =>
                  setMessage('กำลังอัปโหลด ' + Math.round(p.percentage) + '%'),
              });
              setMessage('กำลังตรวจสอบไฟล์…');
              await json('/api/files/complete', { asset_id: asset.id });
            } else {
              const data = new FormData();
              data.set('asset_id', asset.id);
              data.set('file', file);
              const r = await fetch('/api/files/local', { method: 'POST', body: data });
              if (!r.ok) throw new Error((await r.json()).error);
            }
            const r: any = await runAction('lesson.create', {
              course_id: courseId,
              title: String(f.get('title')),
              content: String(f.get('content')),
              type: file.type.startsWith('video/') ? 'video' : 'document',
              asset_id: asset.id,
            });
            if (!r.ok) throw new Error(r.message);
            onSaved();
            onClose();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'อัปโหลดไม่สำเร็จ');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          ชื่อบทเรียน
          <input name="title" required maxLength={200} />
        </label>
        <label>
          เนื้อหาหรือคำอธิบาย
          <textarea name="content" minLength={3} required />
        </label>
        <label>
          ไฟล์ PDF / MP4 / WebM
          <input name="file" type="file" accept="application/pdf,video/mp4,video/webm" required />
        </label>
        <small className="muted">
          สูงสุด 100 MB ต่อไฟล์ ไฟล์เปิดได้เฉพาะผู้มีสิทธิ์ของบริษัทและผู้เรียนที่ได้รับมอบหมาย
          เนื้อหาในไฟล์ยังไม่ถูกดึงเข้าผู้ช่วยคู่มืออัตโนมัติ
        </small>
        {message && (
          <div role="status" className="notice">
            {message}
          </div>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? 'กำลังอัปโหลด…' : 'อัปโหลดและเพิ่มบทเรียน'}
        </button>
      </form>
    </dialog>
  );
}
