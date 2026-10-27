'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { ArrowRight, GraduationCap, ShieldCheck, Sprout, Users, Eye, EyeOff } from 'lucide-react';
export default function Login({ google, microsoft }: { google: boolean; microsoft: boolean }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  return (
    <main className="login-layout">
      <section className="login-story">
        <a className="brand" href="/">
          <span className="brand-mark">
            p<span />
          </span>
          peopleflow<span className="brand-dot">.</span>
        </a>
        <span className="eyebrow">PEOPLE FIRST. GROW TOGETHER.</span>
        <h1>
          ดูแลคนให้ดี
          <br />
          ให้ทีมเติบโต
          <br />
          <em>ไปด้วยกัน</em>
        </h1>
        <p>
          เชื่อมทุกเรื่องของคน ตั้งแต่วันแรกของการทำงาน
          <br />
          จนถึงวันที่พร้อมเติบโตไปอีกขั้น
        </p>
        <div className="login-features">
          <span>
            <Users size={20} /> งานบุคคลในที่เดียว
          </span>
          <span>
            <GraduationCap size={20} /> เรียนรู้ได้ด้วยตัวเอง
          </span>
          <span>
            <Sprout size={20} /> พร้อมทำงานอย่างมั่นใจ
          </span>
        </div>
        <div className="login-orbit">
          <div className="orbit-ring" />
          <div className="orbit-ring second" />
          <div className="orbit-center">
            <Sprout size={72} strokeWidth={1.1} />
          </div>
          <span className="floating-card">
            <ShieldCheck size={18} /> พื้นที่ปลอดภัยสำหรับทุกทีม
          </span>
        </div>
        <small>HRM + LEARNING PLATFORM</small>
      </section>
      <section className="login-form-wrap">
        <div className="login-form">
          <span className="mini-logo">ยินดีต้อนรับสู่ PeopleFlow</span>
          <h2>เริ่มต้นวันทำงานที่ดี</h2>
          <p className="muted">เข้าสู่ระบบเพื่อดูแลทีมและการเรียนรู้ของคุณ</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const f = new FormData(e.currentTarget);
              try {
                const result = await signIn('credentials', {
                  email: f.get('email'),
                  password: f.get('password'),
                  redirect: false,
                });
                if (result?.error)
                  setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกพักชั่วคราว กรุณาลองใหม่');
                else window.location.href = '/dashboard';
              } catch {
                setError('ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบการเชื่อมต่อ');
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              อีเมล
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
                required
              />
            </label>
            <label>
              รหัสผ่าน
              <div className="password-input">
                <input
                  name="password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  aria-label="แสดงหรือซ่อนรหัสผ่าน"
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error && (
              <div role="alert" className="notice error">
                {error}
              </div>
            )}
            <button className="btn primary full" disabled={busy}>
              {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
              <ArrowRight size={17} />
            </button>
          </form>
          {(google || microsoft) && (
            <>
              <div className="divider">หรือเข้าผ่านบัญชีองค์กร</div>
              {google && (
                <button
                  className="btn full"
                  onClick={() => signIn('google', { redirectTo: '/dashboard' })}
                >
                  Google
                </button>
              )}
              {microsoft && (
                <button
                  className="btn full"
                  onClick={() => signIn('microsoft-entra-id', { redirectTo: '/dashboard' })}
                >
                  Microsoft
                </button>
              )}
            </>
          )}
          <div className="login-note">
            <ShieldCheck size={17} />
            <span>
              ข้อมูลแต่ละบริษัทแยกจากกัน
              <br />
              เข้าถึงได้ตามสิทธิ์ที่ได้รับเท่านั้น
            </span>
          </div>
          <p className="small muted">
            บัญชีตัวอย่าง: admin@bloom.demo
            <br />
            รหัสผ่านอยู่ใน SEED_PASSWORD ของไฟล์ .env
          </p>
        </div>
        <footer>© {new Date().getFullYear()} PeopleFlow · ทุกการเติบโต เริ่มต้นจากคน</footer>
      </section>
    </main>
  );
}
