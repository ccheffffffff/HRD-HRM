'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="loading">
      <h1>ยังไม่สามารถโหลดข้อมูลได้</h1>
      <p>ตรวจสอบการเชื่อมต่อฐานข้อมูล แล้วลองอีกครั้ง</p>
      <button className="btn primary" onClick={reset}>
        ลองใหม่
      </button>
    </main>
  );
}
