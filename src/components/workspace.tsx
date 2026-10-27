'use client';
import { useState, useTransition, useRef, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import LearningPaths from './learning-paths';
import SkillChecklist from './skill-checklist';
import UploadLesson from './upload-lesson';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Network,
  UserRoundPlus,
  Clock3,
  CalendarDays,
  ClipboardCheck,
  BookOpen,
  GraduationCap,
  MessageSquareText,
  Settings,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  Bell,
  Check,
  CheckCircle2,
  LogOut,
  Menu,
  X,
  Play,
  FileText,
  Video,
  Sparkles,
  ShieldCheck,
  Download,
  Send,
  Leaf,
  Target,
  MoreHorizontal,
  AlertCircle,
  Plug,
  KeyRound,
  Building2,
  ExternalLink,
  CheckCheck,
  Timer,
  ClipboardList,
} from 'lucide-react';
import { runAction, switchCompany, logout, askManual, sendLine } from '@/app/actions';
import { bangkokDate, ready } from '@/lib/policy';
type Row = Record<string, any>;
type Data = Record<string, any>;
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  value?: any;
  required?: boolean;
  hint?: string;
  min?: string;
  max?: string;
};
const nav = [
  ['dashboard', 'ภาพรวม', LayoutDashboard],
  ['employees', 'ข้อมูลพนักงาน', Users],
  ['organization', 'โครงสร้างองค์กร', Network],
  ['onboarding', 'พนักงานใหม่', UserRoundPlus],
  ['attendance', 'ลงเวลาทำงาน', Clock3],
  ['shifts', 'ตารางกะ', CalendarDays],
  ['requests', 'ลา / OT และการอนุมัติ', ClipboardCheck],
  ['learning', 'ศูนย์การเรียนรู้', BookOpen],
  ['readiness', 'ความพร้อมของทีม', GraduationCap],
  ['paths', 'เส้นทางการเรียน', Network],
  ['notifications', 'แจ้งเตือนการเรียน', Bell],
  ['assistant', 'ผู้ช่วยคู่มือ', MessageSquareText],
  ['settings', 'ตั้งค่าและการเชื่อมต่อ', Settings],
] as const;
const roleNames: Row = {
  admin: 'ผู้ดูแลระบบ',
  hr: 'ฝ่ายบุคคล',
  manager: 'หัวหน้างาน',
  employee: 'พนักงาน',
};
const labels: Row = {
  probation: 'ทดลองงาน',
  active: 'พนักงานประจำ',
  exited: 'พ้นสภาพ',
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
  leave: 'ลา',
  ot: 'ล่วงเวลา',
  annual: 'พักร้อน',
  sick: 'ลาป่วย',
  personal: 'ลากิจ',
};
const fmt = (s: any) =>
  s
    ? new Date(s).toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
        timeZone: 'Asia/Bangkok',
      })
    : '—';
const time = (s: any) =>
  s
    ? new Date(s).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bangkok',
      })
    : '—';
function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={'badge ' + tone}>{children}</span>;
}
function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return <span className={'avatar av-' + (index % 5)}>{name?.slice(0, 1)}</span>;
}
function Empty({ text = 'ยังไม่มีข้อมูล', children }: { text?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Leaf size={30} />
      <strong>{text}</strong>
      <span>เมื่อมีข้อมูล รายการจะแสดงที่นี่</span>
      {children}
    </div>
  );
}
function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={'panel ' + className}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Progress({ value }: { value: number }) {
  return (
    <div className="progress">
      <span style={{ width: Math.max(0, Math.min(100, value)) + '%' }} />
    </div>
  );
}
export default function Workspace({ data: d, section }: { data: Data; section: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);
  const [modal, setModal] = useState<{
    title: string;
    action: string;
    fields: Field[];
    initial?: Row;
  } | null>(null);
  const [course, setCourse] = useState<Row | null>(null);
  const [reviewEnrollment, setReviewEnrollment] = useState<Row | null>(null);
  const [uploadCourse, setUploadCourse] = useState<string | null>(null);
  const [tab, setTab] = useState('all');
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [quizResult, setQuizResult] = useState<Row | null>(null);
  const [chat, setChat] = useState<
    { question: string; answer: string; sources: Row[]; mode: string }[]
  >([]);
  const [thinking, setThinking] = useState(false);
  const [exportFrom, setExportFrom] = useState(bangkokDate().slice(0, 7) + '-01');
  const [exportTo, setExportTo] = useState(bangkokDate());
  const [exportFormat, setExportFormat] = useState('generic');
  const a = d.actor;
  const isStaff = ['admin', 'hr'].includes(a.role);
  const manage = a.role !== 'employee';
  const me = d.employees.find((e: Row) => e.id === a.employeeId);
  const company = d.companies.find((c: Row) => c.id === a.companyId);
  const today = bangkokDate();
  const dayAttendance = d.attendance.filter((r: Row) => r.work_date.slice(0, 10) === today);
  const pendingRequests = d.requests.filter((r: Row) => r.status === 'pending');
  const activeEmployees = d.employees.filter((e: Row) => e.status !== 'exited');
  const en = d.enrollments.filter(
    (e: Row) => activeEmployees.some((p: Row) => p.id === e.employee_id) && e.published,
  );
  const finished = en.filter((n: Row) => ready(n, n.requires_signoff));
  const rate = en.length ? Math.round((finished.length / en.length) * 100) : 0;
  const employeeName = (id: string) => d.employees.find((e: Row) => e.id === id)?.name ?? '—';
  const canReview = (id: string) =>
    id !== a.employeeId &&
    (isStaff || d.employees.some((e: Row) => e.id === id && e.manager_id === a.employeeId));
  const opts = (rows: Row[]) => rows.map((r) => ({ value: r.id, label: r.name ?? r.title }));
  const flash = (result: any) => {
    setToast({ message: result.message ?? 'บันทึกแล้ว', ok: result.ok !== false });
  };
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    setSearch('');
    setTab('all');
  }, [section]);
  async function act(action: string, input: Row, close = true) {
    start(async () => {
      try {
        const r: any = await runAction(action, input);
        flash(r);
        if (r.ok) {
          if (close) setModal(null);
          if (action === 'course.clone' && r.id) setCourse({ id: r.id });
          if (r.key) window.prompt('API key แสดงครั้งเดียว กรุณาคัดลอกเก็บไว้', r.key);
          router.refresh();
        }
        if (action === 'quiz.submit' && r.ok) setQuizResult(r);
      } catch {
        flash({ ok: false, message: 'ไม่สามารถทำรายการได้ กรุณาลองใหม่' });
      }
    });
  }
  function form(title: string, action: string, fields: Field[], initial: Row = {}) {
    setModal({ title, action, fields, initial });
  }
  function addEmployee() {
    form('เพิ่มพนักงานใหม่', 'employee.create', [
      { key: 'name', label: 'ชื่อ–นามสกุล' },
      { key: 'email', label: 'อีเมลสำหรับเข้าสู่ระบบ', type: 'email' },
      { key: 'code', label: 'รหัสพนักงาน' },
      { key: 'phone', label: 'เบอร์โทรศัพท์', required: false },
      { key: 'branch', label: 'สาขา', value: 'สำนักงานใหญ่' },
      { key: 'department_id', label: 'แผนก', type: 'select', options: opts(d.departments) },
      { key: 'position_id', label: 'ตำแหน่ง', type: 'select', options: opts(d.positions) },
      {
        key: 'manager_id',
        label: 'หัวหน้างาน',
        type: 'select',
        options: [{ value: '', label: 'ไม่ระบุ' }, ...opts(activeEmployees)],
      },
      { key: 'start_date', label: 'วันเริ่มงาน', type: 'date', value: today },
      {
        key: 'probation_end',
        label: 'สิ้นสุดทดลองงาน',
        type: 'date',
        value: bangkokDate(new Date(Date.now() + 90 * 86400000)),
      },
      {
        key: 'role',
        label: 'สิทธิ์การใช้งาน',
        type: 'select',
        options: Object.entries(roleNames)
          .filter(([k]) => a.role === 'admin' || k !== 'admin')
          .map(([value, label]) => ({ value, label: String(label) })),
        value: 'employee',
      },
      {
        key: 'password',
        label: 'รหัสผ่านเริ่มต้น (อย่างน้อย 12 ตัวอักษร)',
        type: 'password',
        hint: 'แจ้งพนักงานผ่านช่องทางที่ปลอดภัย และให้เปลี่ยนรหัสผ่านเมื่อเริ่มใช้งาน',
      },
    ]);
  }
  function editEmployee(e: Row) {
    form(
      'แก้ไขข้อมูลพนักงาน',
      'employee.update',
      [
        { key: 'name', label: 'ชื่อ–นามสกุล' },
        { key: 'phone', label: 'เบอร์โทรศัพท์', required: false },
        { key: 'branch', label: 'สาขา' },
        { key: 'department_id', label: 'แผนก', type: 'select', options: opts(d.departments) },
        { key: 'position_id', label: 'ตำแหน่ง', type: 'select', options: opts(d.positions) },
        {
          key: 'manager_id',
          label: 'หัวหน้างาน',
          type: 'select',
          options: [
            { value: '', label: 'ไม่ระบุ' },
            ...opts(activeEmployees.filter((p: Row) => p.id !== e.id)),
          ],
        },
        {
          key: 'status',
          label: 'สถานะการจ้าง',
          type: 'select',
          options: ['probation', 'active', 'exited'].map((value) => ({
            value,
            label: labels[value],
          })),
        },
      ],
      { ...e, manager_id: e.manager_id ?? '' },
    );
  }
  function addCourse() {
    form('สร้างหลักสูตรใหม่', 'course.create', [
      { key: 'title', label: 'ชื่อหลักสูตร' },
      { key: 'description', label: 'รายละเอียดและเป้าหมาย', type: 'textarea' },
      { key: 'category', label: 'หมวดหมู่', value: 'เริ่มงานใหม่' },
      {
        key: 'position_id',
        label: 'สำหรับตำแหน่ง',
        type: 'select',
        options: [{ value: '', label: 'ทุกตำแหน่ง' }, ...opts(d.positions)],
      },
      {
        key: 'pass_score',
        label: 'คะแนนผ่าน (%)',
        type: 'number',
        value: 80,
        min: '1',
        max: '100',
      },
      {
        key: 'duration_minutes',
        label: 'ระยะเวลาเรียน (นาที)',
        type: 'number',
        value: 30,
        min: '1',
      },
      {
        key: 'auto_assign',
        label: 'มอบหมายอัตโนมัติเมื่อเริ่มงานหรือเปลี่ยนตำแหน่ง',
        type: 'checkbox',
        value: true,
      },
      {
        key: 'requires_signoff',
        label: 'ให้หัวหน้าตรวจรับทักษะจากการทำงานจริง',
        type: 'checkbox',
        value: true,
      },
    ]);
  }
  function addLesson(c: Row) {
    form(
      'เพิ่มบทเรียน',
      'lesson.create',
      [
        { key: 'title', label: 'ชื่อบทเรียน' },
        {
          key: 'type',
          label: 'รูปแบบ',
          type: 'select',
          options: [
            { value: 'text', label: 'ข้อความ' },
            { value: 'video', label: 'วิดีโอ' },
            { value: 'document', label: 'เอกสาร' },
          ],
        },
        {
          key: 'content',
          label: 'เนื้อหา / คำอธิบายประกอบ',
          type: 'textarea',
          hint: 'ใช้เป็นแหล่งข้อมูลสำหรับผู้ช่วยคู่มือด้วย',
        },
        { key: 'media_url', label: 'URL วิดีโอหรือเอกสาร (HTTPS)', type: 'url', required: false },
      ],
      { course_id: c.id },
    );
  }
  function addQuestion(c: Row) {
    form(
      'เพิ่มข้อสอบ',
      'question.create',
      [
        { key: 'prompt', label: 'คำถาม' },
        { key: 'option0', label: 'ตัวเลือก 1' },
        { key: 'option1', label: 'ตัวเลือก 2' },
        { key: 'option2', label: 'ตัวเลือก 3' },
        {
          key: 'correct_index',
          label: 'คำตอบที่ถูกต้อง',
          type: 'select',
          options: [
            { value: '0', label: 'ตัวเลือก 1' },
            { value: '1', label: 'ตัวเลือก 2' },
            { value: '2', label: 'ตัวเลือก 3' },
          ],
        },
        { key: 'explanation', label: 'คำอธิบายเพื่อทบทวน', type: 'textarea' },
      ],
      { course_id: c.id },
    );
  }
  function assignCourse(c?: Row) {
    form('มอบหมายหลักสูตร', 'course.assign', [
      {
        key: 'course_id',
        label: 'หลักสูตร',
        type: 'select',
        options: opts(d.courses.filter((x: Row) => x.published)),
        value: c?.id,
      },
      {
        key: 'employee_id',
        label: 'พนักงาน',
        type: 'select',
        options: opts(activeEmployees.filter((e: Row) => isStaff || e.manager_id === a.employeeId)),
      },
      {
        key: 'due_date',
        label: 'กำหนดเรียนให้เสร็จ',
        type: 'date',
        value: bangkokDate(new Date(Date.now() + 7 * 86400000)),
      },
    ]);
  }
  const filteredEmployees = d.employees.filter(
    (e: Row) =>
      (e.name + e.code + e.department + e.position).toLowerCase().includes(search.toLowerCase()) &&
      (tab === 'all' || e.status === tab),
  );
  const filteredCourses = d.courses.filter(
    (c: Row) =>
      (c.title + c.category).includes(search) &&
      (tab === 'all' ||
        (tab === 'mine' &&
          d.enrollments.some((n: Row) => n.course_id === c.id && n.employee_id === a.employeeId)) ||
        (tab === 'draft' && !c.published)),
  );
  const myEnrollments = d.enrollments.filter((n: Row) => n.employee_id === a.employeeId);
  const selectedCourse = course ? d.courses.find((c: Row) => c.id === course.id) : null;
  const selectedEnrollment = selectedCourse
    ? myEnrollments.find((n: Row) => n.course_id === selectedCourse.id)
    : null;
  const selectedLessons = selectedCourse
    ? d.lessons.filter((l: Row) => l.course_id === selectedCourse.id)
    : [];
  const selectedQuestions = selectedCourse
    ? d.questions.filter((q: Row) => q.course_id === selectedCourse.id)
    : [];
  const completedIds = new Set(
    d.progress
      .filter((p: Row) => p.enrollment_id === selectedEnrollment?.id)
      .map((p: Row) => p.lesson_id),
  );
  const pageNames: Row = {
    paths: 'เส้นทางการเรียนรู้',
    notifications: 'แจ้งเตือนการเรียน',
    dashboard: 'ภาพรวมการทำงาน',
    employees: 'ข้อมูลพนักงาน',
    organization: 'โครงสร้างองค์กร',
    onboarding: 'ต้อนรับพนักงานใหม่',
    attendance: 'ลงเวลาทำงาน',
    shifts: 'ตารางกะทำงาน',
    requests: 'ลา / OT และการอนุมัติ',
    learning: 'ศูนย์การเรียนรู้',
    readiness: 'ความพร้อมของทีม',
    assistant: 'ผู้ช่วยคู่มือ',
    settings: 'ตั้งค่าและการเชื่อมต่อ',
  };
  return (
    <div className="app-shell">
      <aside className={'sidebar ' + (menu ? 'open' : '')}>
        <Link href="/dashboard" className="brand">
          <span className="brand-mark">
            p<span />
          </span>
          peopleflow<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <div className="company-switch">
          <Building2 size={19} />
          <select
            aria-label="เลือกบริษัท"
            value={a.companyId}
            disabled={pending}
            onChange={(e) =>
              start(async () => {
                await switchCompany(e.target.value);
                router.refresh();
              })
            }
          >
            {d.companies.map((c: Row) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>
        <nav>
          {nav.map(([key, title, Icon], i) => (
            <div key={key}>
              {key === 'learning' && <div className="nav-label">พัฒนาทีมของคุณ</div>}
              {key === 'settings' && <div className="nav-separator" />}
              <Link
                onClick={() => setMenu(false)}
                href={'/' + key}
                className={'nav-item ' + (section === key ? 'selected' : '')}
              >
                <Icon size={19} strokeWidth={1.7} />
                <span>{title}</span>
                {key === 'requests' && pendingRequests.length > 0 && (
                  <b>{pendingRequests.length}</b>
                )}
                {key === 'learning' && <span className="new-tag">NEW</span>}
              </Link>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="growth-note">
            <div>
              <Leaf size={18} /> เติบโตไปด้วยกัน
            </div>
            <p>
              การเรียนรู้เล็ก ๆ ในทุกวัน
              <br />
              สร้างทีมที่แข็งแรงขึ้น
            </p>
            <Link href="/learning">
              เริ่มเรียนรู้ <ArrowUpRight size={15} />
            </Link>
          </div>
          <button
            className="user-block"
            onClick={() =>
              form('เปลี่ยนรหัสผ่าน', 'password.change', [
                { key: 'current', label: 'รหัสผ่านปัจจุบัน', type: 'password' },
                {
                  key: 'password',
                  label: 'รหัสผ่านใหม่ (อย่างน้อย 12 ตัวอักษร)',
                  type: 'password',
                },
              ])
            }
          >
            <Avatar name={a.name} />
            <span>
              <strong>{a.name}</strong>
              <small>{roleNames[a.role]}</small>
            </span>
            <Settings size={16} />
          </button>
          <button className="logout" onClick={() => logout()}>
            <LogOut size={15} /> ออกจากระบบ
          </button>
        </div>
      </aside>
      {menu && (
        <button className="sidebar-shade" aria-label="ปิดเมนู" onClick={() => setMenu(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label="เปิดเมนู"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={21} />
            </button>
            <span>พื้นที่ทำงาน</span>
            <ChevronRight size={14} />
            <strong>{pageNames[section]}</strong>
          </div>
          <div className="topbar-right">
            <span className="today">
              {new Date().toLocaleDateString('th-TH', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone: 'Asia/Bangkok',
              })}
            </span>
            <Link
              href="/notifications"
              className="notification"
              aria-label={`แจ้งเตือนการเรียน ${d.alerts.filter((a: Row) => !a.read).length} รายการ`}
            >
              <Bell size={19} />
              {d.alerts.some((a: Row) => !a.read) && <i />}
            </Link>
            <span className="topbar-divider" />
            <Avatar name={a.name} />
          </div>
        </header>
        <main className="workspace-main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {section === 'learning'
                  ? 'LEARNING & DEVELOPMENT'
                  : section === 'dashboard'
                    ? 'YOUR PEOPLE, YOUR PROGRESS'
                    : 'PEOPLEFLOW WORKSPACE'}
              </div>
              <h1>
                {pageNames[section]}
                {section === 'dashboard' && <span className="wave">☀</span>}
              </h1>
              <p>
                {
                  (
                    {
                      paths: 'จัดเส้นทางให้พนักงานใหม่เรียนรู้ได้ทีละขั้น',
                      notifications: 'ติดตามกำหนดเรียนและงานตรวจรับทักษะ',
                      dashboard: `สวัสดี ${a.name.split(' ')[0]} ดูแลคนและการเติบโตของทีมในพื้นที่เดียว`,
                      employees: 'ข้อมูลที่เป็นระเบียบ เพื่อดูแลทุกคนได้ดียิ่งขึ้น',
                      organization: 'เชื่อมคน ตำแหน่ง และทีมให้ทำงานไปในทิศทางเดียวกัน',
                      onboarding: 'ให้วันแรกเป็นจุดเริ่มต้นของความมั่นใจ',
                      attendance: 'บันทึกเวลาง่าย ๆ พร้อมดูประวัติการทำงาน',
                      shifts: 'วางแผนเวลาของทีมให้พร้อมสำหรับทุกวัน',
                      requests: 'จัดการคำขอและติดตามผลได้ในที่เดียว',
                      learning: 'เปลี่ยนการสอนงานซ้ำ ๆ ให้เป็นการเรียนรู้ที่เติบโตได้ด้วยตัวเอง',
                      readiness: 'มองเห็นทุกก้าว ตั้งแต่เริ่มเรียนจนพร้อมปฏิบัติงาน',
                      assistant: 'ค้นหาคำตอบจากคู่มือและบทเรียนที่คุณได้รับมอบหมาย',
                      settings: 'จัดการพื้นที่ทำงานและเชื่อมต่อเครื่องมือของคุณ',
                    } as Row
                  )[section]
                }
              </p>
            </div>
            <div className="heading-actions">
              {section === 'employees' && isStaff && (
                <button className="btn primary" onClick={addEmployee}>
                  <Plus size={17} /> เพิ่มพนักงาน
                </button>
              )}
              {section === 'learning' && isStaff && (
                <button className="btn primary" onClick={addCourse}>
                  <Plus size={17} /> สร้างหลักสูตร
                </button>
              )}
              {section === 'requests' && a.employeeId && (
                <button
                  className="btn primary"
                  onClick={() =>
                    form('ยื่นคำขอ', 'request.create', [
                      {
                        key: 'type',
                        label: 'ประเภทคำขอ',
                        type: 'select',
                        options: [
                          { value: 'leave', label: 'ลา' },
                          { value: 'ot', label: 'ล่วงเวลา (OT)' },
                        ],
                      },
                      {
                        key: 'leave_type',
                        label: 'ประเภทการลา',
                        type: 'select',
                        options: ['annual', 'sick', 'personal'].map((value) => ({
                          value,
                          label: labels[value],
                        })),
                      },
                      { key: 'start_date', label: 'วันที่เริ่ม', type: 'date', value: today },
                      { key: 'end_date', label: 'วันที่สิ้นสุด', type: 'date', value: today },
                      {
                        key: 'hours',
                        label: 'จำนวนชั่วโมง (เฉพาะ OT)',
                        type: 'number',
                        value: 0,
                        min: '0',
                        max: '24',
                      },
                      { key: 'reason', label: 'เหตุผล', type: 'textarea' },
                    ])
                  }
                >
                  <Plus size={17} /> ยื่นคำขอ
                </button>
              )}
            </div>
          </div>
          {section === 'paths' && <LearningPaths data={d} />}
          {section === 'notifications' && (
            <Panel
              title="รายการที่ต้องติดตาม"
              subtitle="แจ้งเตือนในแอปตามกำหนดเรียนและผลสอบ ไม่ส่งข้อความออกนอกระบบ"
            >
              <div className="request-list">
                {d.alerts.length ? (
                  d.alerts.map((alert: Row) => (
                    <div className="request-row" key={alert.key}>
                      <Bell size={19} />
                      <div className="request-info">
                        <strong>
                          {alert.title}
                          <Badge tone={alert.read ? 'neutral' : alert.tone}>
                            {alert.read ? 'อ่านแล้ว' : 'ยังไม่อ่าน'}
                          </Badge>
                        </strong>
                        <p>{alert.detail}</p>
                        <Link className="text-link" href={alert.href}>
                          ดูรายการ
                        </Link>
                      </div>
                      {!alert.read && (
                        <button
                          className="btn small"
                          disabled={pending}
                          onClick={() => act('notification.read', { key: alert.key })}
                        >
                          อ่านแล้ว
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <Empty text="ไม่มีรายการที่ต้องติดตาม" />
                )}
              </div>
            </Panel>
          )}
          {section === 'dashboard' && (
            <>
              <div className="stats-grid">
                <Stat
                  icon={<Users size={22} />}
                  title={manage ? 'พนักงานในความดูแล' : 'สถานะการทำงาน'}
                  value={manage ? activeEmployees.length : (labels[me?.status] ?? '—')}
                  foot={
                    manage ? `${d.departments.length} แผนกในบริษัท` : 'ยินดีที่ได้เติบโตไปด้วยกัน'
                  }
                  color="teal"
                />
                <Stat
                  icon={<UserRoundPlus size={22} />}
                  title="อยู่ระหว่างทดลองงาน"
                  value={activeEmployees.filter((e: Row) => e.status === 'probation').length}
                  foot="พร้อมดูแลทุกก้าวของพนักงานใหม่"
                  color="blue"
                />
                <Stat
                  icon={<ClipboardCheck size={22} />}
                  title="คำขอรออนุมัติ"
                  value={pendingRequests.length}
                  foot="คำขอลาและล่วงเวลา"
                  color="orange"
                />
                <Stat
                  icon={<GraduationCap size={22} />}
                  title="ผ่านการพัฒนาทักษะ"
                  value={rate + '%'}
                  foot={`${finished.length} จาก ${en.length} การมอบหมาย`}
                  color="purple"
                />
              </div>
              <div className="dashboard-grid">
                <div className="dashboard-left">
                  <section className="welcome-banner">
                    <div>
                      <Badge tone="mint">LEARN. PRACTICE. GROW.</Badge>
                      <h2>
                        ทีมพร้อมขึ้น
                        <br />
                        เมื่อทุกคนได้เรียนรู้
                      </h2>
                      <p>
                        ให้พนักงานใหม่เริ่มงานได้อย่างมั่นใจ
                        <br />
                        ด้วยเส้นทางการเรียนรู้ที่ชัดเจน
                      </p>
                      <Link href="/learning" className="btn primary">
                        ไปที่ศูนย์การเรียนรู้ <ArrowRight size={16} />
                      </Link>
                    </div>
                    <div className="banner-art" aria-hidden="true">
                      <div className="art-circle" />
                      <div className="art-book">
                        <BookOpen size={64} strokeWidth={1.25} />
                        <span>GROW EVERY DAY</span>
                      </div>
                      <span className="art-star">✦</span>
                      <span className="art-check">
                        <Check size={22} />
                      </span>
                      <span className="art-leaf">
                        <Leaf size={35} />
                      </span>
                      <i className="art-line" />
                    </div>
                  </section>
                  <Panel
                    title="การเรียนรู้ของทีม"
                    subtitle="ติดตามความคืบหน้าและให้ความช่วยเหลือได้ตรงจุด"
                    action={
                      <Link className="text-link" href="/readiness">
                        ดูทั้งหมด <ArrowUpRight size={14} />
                      </Link>
                    }
                  >
                    <div className="learning-summary">
                      <div
                        className="donut"
                        style={{ '--progress': rate + '%' } as React.CSSProperties}
                      >
                        <div>
                          <strong>{rate}%</strong>
                          <small>พร้อมปฏิบัติงาน</small>
                        </div>
                      </div>
                      <div className="summary-legend">
                        <Legend
                          color="var(--teal)"
                          title="พร้อมปฏิบัติงาน"
                          value={finished.length}
                        />
                        <Legend
                          color="#a6d9ce"
                          title="ผ่านข้อสอบ รอตรวจทักษะ"
                          value={
                            en.filter((n: Row) => n.passed_at && !ready(n, n.requires_signoff))
                              .length
                          }
                        />
                        <Legend
                          color="#e9efee"
                          title="อยู่ระหว่างเรียนรู้"
                          value={en.filter((n: Row) => !n.passed_at).length}
                        />
                      </div>
                    </div>
                    <div className="mini-course-list">
                      {d.courses
                        .filter((c: Row) => c.published)
                        .slice(0, 3)
                        .map((c: Row, i: number) => {
                          const assigned = en.filter((n: Row) => n.course_id === c.id);
                          const done = assigned.filter((n: Row) => ready(n, c.requires_signoff));
                          return (
                            <div key={c.id}>
                              <span className={'course-mini-icon tint-' + i}>
                                <BookOpen size={18} />
                              </span>
                              <div>
                                <strong>{c.title}</strong>
                                <small>
                                  {done.length}/{assigned.length} คนเรียนและตรวจรับครบแล้ว
                                </small>
                              </div>
                              <span>
                                {assigned.length
                                  ? Math.round((done.length / assigned.length) * 100)
                                  : 0}
                                %
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </Panel>
                </div>
                <div className="dashboard-right">
                  <Panel title="สิ่งที่ต้องดูแลวันนี้" action={<span className="tiny-dot" />}>
                    <div className="todo-list">
                      <Link href="/requests">
                        <span className="todo-icon orange">
                          <ClipboardCheck size={19} />
                        </span>
                        <div>
                          <strong>คำขอรอการพิจารณา</strong>
                          <small>ลาและล่วงเวลาของทีม</small>
                        </div>
                        <b>{pendingRequests.length}</b>
                        <ChevronRight size={15} />
                      </Link>
                      <Link href="/readiness">
                        <span className="todo-icon purple">
                          <ShieldCheck size={19} />
                        </span>
                        <div>
                          <strong>รอตรวจรับทักษะ</strong>
                          <small>ผ่านข้อสอบ พร้อมฝึกปฏิบัติ</small>
                        </div>
                        <b>
                          {
                            en.filter(
                              (n: Row) => n.passed_at && n.requires_signoff && !n.signed_off_at,
                            ).length
                          }
                        </b>
                        <ChevronRight size={15} />
                      </Link>
                      <Link href="/onboarding">
                        <span className="todo-icon blue">
                          <UserRoundPlus size={19} />
                        </span>
                        <div>
                          <strong>ดูแลพนักงานทดลองงาน</strong>
                          <small>ติดตามการเริ่มงานและเรียนรู้</small>
                        </div>
                        <b>{activeEmployees.filter((e: Row) => e.status === 'probation').length}</b>
                        <ChevronRight size={15} />
                      </Link>
                    </div>
                  </Panel>
                  <Panel
                    title="สมาชิกใหม่ของทีม"
                    action={
                      <Link className="text-link" href="/onboarding">
                        ดูทั้งหมด <ArrowUpRight size={14} />
                      </Link>
                    }
                  >
                    {activeEmployees.filter((e: Row) => e.status === 'probation').length ? (
                      <div className="new-people">
                        {activeEmployees
                          .filter((e: Row) => e.status === 'probation')
                          .slice(0, 3)
                          .map((e: Row, i: number) => (
                            <div key={e.id}>
                              <Avatar name={e.name} index={i + 1} />
                              <div>
                                <strong>{e.name}</strong>
                                <small>{e.position}</small>
                              </div>
                              <Badge tone="blue">เริ่ม {fmt(e.start_date)}</Badge>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <Empty text="ยังไม่มีพนักงานใหม่" />
                    )}
                  </Panel>
                  <div className="tip-card">
                    <span>
                      <Sparkles size={19} /> เคล็ดลับสำหรับทีมที่เติบโต
                    </span>
                    <p>
                      มอบหมายหลักสูตรตามตำแหน่งตั้งแต่วันแรก ช่วยให้พนักงานเริ่มต้นได้ด้วยตัวเอง
                    </p>
                    <Link href="/learning">
                      จัดเส้นทางการเรียนรู้ <ArrowRight size={15} />
                    </Link>
                  </div>
                </div>
              </div>
            </>
          )}
          {section === 'employees' && (
            <Panel
              title={`พนักงานทั้งหมด (${d.employees.length})`}
              action={
                <div className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="ค้นหาพนักงาน"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ค้นหาชื่อ รหัส หรือตำแหน่ง"
                  />
                </div>
              }
            >
              <Tabs
                value={tab}
                onChange={setTab}
                items={[
                  ['all', 'ทั้งหมด'],
                  ['active', 'พนักงานประจำ'],
                  ['probation', 'ทดลองงาน'],
                  ['exited', 'พ้นสภาพ'],
                ]}
              />
              {filteredEmployees.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>พนักงาน</th>
                        <th>ตำแหน่ง / แผนก</th>
                        <th>สาขา</th>
                        <th>วันเริ่มงาน</th>
                        <th>สถานะ</th>
                        {isStaff && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.map((e: Row, i: number) => (
                        <tr key={e.id}>
                          <td>
                            <div className="person-cell">
                              <Avatar name={e.name} index={i} />
                              <div>
                                <strong>{e.name}</strong>
                                <small>
                                  {e.code} · {e.email}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <strong>{e.position ?? '—'}</strong>
                            <small>{e.department ?? '—'}</small>
                          </td>
                          <td>{e.branch}</td>
                          <td>{fmt(e.start_date)}</td>
                          <td>
                            <Badge
                              tone={
                                e.status === 'active'
                                  ? 'mint'
                                  : e.status === 'probation'
                                    ? 'blue'
                                    : 'neutral'
                              }
                            >
                              {labels[e.status]}
                            </Badge>
                          </td>
                          {isStaff && (
                            <td>
                              <button className="text-link" onClick={() => editEmployee(e)}>
                                แก้ไข
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty text="ไม่พบพนักงาน" />
              )}
              <div className="panel-foot">
                แสดง {filteredEmployees.length} คน · ข้อมูลตามสิทธิ์การเข้าถึงของคุณ
              </div>
            </Panel>
          )}
          {section === 'organization' && (
            <>
              <div className="two-columns">
                <Panel
                  title="แผนก"
                  subtitle="หน่วยงานภายในองค์กร"
                  action={
                    isStaff && (
                      <button
                        className="btn small"
                        onClick={() =>
                          form('เพิ่มแผนก', 'department.create', [
                            { key: 'name', label: 'ชื่อแผนก' },
                          ])
                        }
                      >
                        <Plus size={15} /> เพิ่มแผนก
                      </button>
                    )
                  }
                >
                  {d.departments.length ? (
                    d.departments.map((dep: Row) => (
                      <div className="org-row" key={dep.id}>
                        <span className="todo-icon teal">
                          <Network size={20} />
                        </span>
                        <div>
                          <strong>{dep.name}</strong>
                          <small>
                            {
                              d.employees.filter(
                                (e: Row) => e.department_id === dep.id && e.status !== 'exited',
                              ).length
                            }{' '}
                            คนในขอบเขตที่คุณดูแล
                          </small>
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty />
                  )}
                </Panel>
                <Panel
                  title="ตำแหน่งงาน"
                  subtitle="กำหนดหน้าที่และเชื่อมเส้นทางการเรียนรู้"
                  action={
                    isStaff && (
                      <button
                        className="btn small"
                        onClick={() =>
                          form('เพิ่มตำแหน่งงาน', 'position.create', [
                            { key: 'name', label: 'ชื่อตำแหน่ง' },
                            { key: 'description', label: 'หน้าที่ความรับผิดชอบ', type: 'textarea' },
                          ])
                        }
                      >
                        <Plus size={15} /> เพิ่มตำแหน่ง
                      </button>
                    )
                  }
                >
                  {d.positions.length ? (
                    d.positions.map((p: Row) => (
                      <div className="org-row" key={p.id}>
                        <span className="todo-icon blue">
                          <Users size={20} />
                        </span>
                        <div>
                          <strong>{p.name}</strong>
                          <small>{p.description || 'ยังไม่มีรายละเอียด'}</small>
                        </div>
                        <Badge>
                          {d.courses.filter((c: Row) => c.position_id === p.id).length} หลักสูตร
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <Empty />
                  )}
                </Panel>
              </div>
              <Panel title="สายบังคับบัญชา" subtitle="แสดงหัวหน้างานของพนักงานในขอบเขตสิทธิ์ของคุณ">
                <div className="org-grid">
                  {activeEmployees.map((e: Row, i: number) => (
                    <div className="org-person" key={e.id}>
                      <Avatar name={e.name} index={i} />
                      <strong>{e.name}</strong>
                      <span>{e.position}</span>
                      <small>หัวหน้า: {e.manager ?? 'ไม่ระบุ'}</small>
                    </div>
                  ))}
                </div>
                {!activeEmployees.length && <Empty />}
              </Panel>
            </>
          )}
          {section === 'onboarding' && (
            <>
              <div className="section-note">
                <UserRoundPlus size={23} />
                <div>
                  <strong>เริ่มงานอย่างมั่นใจ โดยไม่ต้องเริ่มสอนใหม่ทุกครั้ง</strong>
                  <p>
                    ระบบมอบหมายหลักสูตรที่เผยแพร่ตามตำแหน่งงานอัตโนมัติ เมื่อ HR เพิ่มพนักงานใหม่
                  </p>
                </div>
                {isStaff && (
                  <button className="btn primary" onClick={addEmployee}>
                    <Plus size={16} /> เพิ่มพนักงาน
                  </button>
                )}
              </div>
              <div className="onboard-grid">
                {activeEmployees
                  .filter((e: Row) => e.status === 'probation')
                  .map((e: Row, i: number) => {
                    const ns = en.filter((n: Row) => n.employee_id === e.id);
                    const completed = ns.filter((n: Row) => ready(n, n.requires_signoff));
                    return (
                      <div className="panel onboarding-card" key={e.id}>
                        <div className="onboard-top">
                          <Avatar name={e.name} index={i + 1} />
                          <Badge tone="blue">ทดลองงาน</Badge>
                        </div>
                        <h2>{e.name}</h2>
                        <p>
                          {e.position} · {e.department}
                        </p>
                        <div className="onboard-dates">
                          <span>
                            เริ่มงาน <b>{fmt(e.start_date)}</b>
                          </span>
                          <span>
                            ครบทดลองงาน <b>{fmt(e.probation_end)}</b>
                          </span>
                        </div>
                        <div className="progress-title">
                          <span>เส้นทางการเรียนรู้</span>
                          <strong>
                            {completed.length}/{ns.length}
                          </strong>
                        </div>
                        <Progress value={ns.length ? (completed.length / ns.length) * 100 : 0} />
                        <div className="onboard-checks">
                          <span>
                            <CheckCircle2 size={16} /> สร้างข้อมูลพนักงานแล้ว
                          </span>
                          <span className={ns.length ? '' : 'muted'}>
                            <CheckCircle2 size={16} />{' '}
                            {ns.length ? 'มอบหมายหลักสูตรแล้ว' : 'ยังไม่มีหลักสูตรที่ได้รับมอบหมาย'}
                          </span>
                          <span
                            className={ns.length && completed.length === ns.length ? '' : 'muted'}
                          >
                            <CheckCircle2 size={16} />{' '}
                            {ns.length && completed.length === ns.length
                              ? 'ผ่านทักษะครบแล้ว'
                              : 'ติดตามการเรียนและตรวจรับทักษะ'}
                          </span>
                        </div>
                        {isStaff && (
                          <button className="btn full" onClick={() => editEmployee(e)}>
                            ประเมินสถานะทดลองงาน <ArrowRight size={15} />
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
              {!activeEmployees.some((e: Row) => e.status === 'probation') && (
                <Panel title="พนักงานทดลองงาน">
                  <Empty text="ยังไม่มีพนักงานทดลองงาน" />
                </Panel>
              )}
            </>
          )}
          {section === 'attendance' && (
            <>
              <div className="clock-card">
                <div>
                  <span className="eyebrow">YOUR WORKDAY</span>
                  <h2>วันนี้ พร้อมเริ่มต้นสิ่งดี ๆ</h2>
                  <p>ลงเวลาโดยใช้เวลาของระบบ · เขตเวลาเอเชีย/กรุงเทพฯ</p>
                </div>
                <div className="clock-actions">
                  <div>
                    <small>
                      เข้า{' '}
                      {time(
                        dayAttendance.find((r: Row) => r.employee_id === a.employeeId)?.check_in,
                      )}
                    </small>
                    <small>
                      ออก{' '}
                      {time(
                        dayAttendance.find((r: Row) => r.employee_id === a.employeeId)?.check_out,
                      )}
                    </small>
                  </div>
                  <button
                    className="btn primary"
                    disabled={pending || !a.employeeId}
                    onClick={() => act('attendance.in', {})}
                  >
                    <Clock3 size={17} /> ลงเวลาเข้า
                  </button>
                  <button
                    className="btn"
                    disabled={pending || !a.employeeId}
                    onClick={() => act('attendance.out', {})}
                  >
                    ลงเวลาออก <ArrowUpRight size={17} />
                  </button>
                </div>
              </div>
              <Panel
                title="ประวัติการลงเวลา"
                subtitle="แสดงข้อมูลย้อนหลัง 60 วัน สูงสุด 500 รายการ"
              >
                {d.attendance.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>พนักงาน</th>
                          <th>วันที่</th>
                          <th>เวลาเข้า</th>
                          <th>เวลาออก</th>
                          <th>ช่องทาง</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.attendance.map((r: Row) => (
                          <tr key={r.id}>
                            <td>{employeeName(r.employee_id)}</td>
                            <td>{fmt(r.work_date)}</td>
                            <td>{time(r.check_in)}</td>
                            <td>{time(r.check_out)}</td>
                            <td>
                              <Badge>{r.source === 'web' ? 'เว็บ' : 'เครื่องลงเวลา'}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty text="ยังไม่มีประวัติลงเวลา" />
                )}
              </Panel>
            </>
          )}
          {section === 'shifts' && (
            <>
              <div className="shift-types">
                {d.shifts.map((s: Row) => (
                  <div className="shift-type" key={s.id}>
                    <Clock3 size={21} />
                    <strong>{s.name}</strong>
                    <span>
                      {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                      {s.end_time < s.start_time ? ' (+1 วัน)' : ''}
                    </span>
                  </div>
                ))}
                {isStaff && (
                  <button
                    className="btn dashed"
                    onClick={() =>
                      form('เพิ่มกะทำงาน', 'shift.create', [
                        { key: 'name', label: 'ชื่อกะ' },
                        { key: 'start_time', label: 'เริ่มงาน', type: 'time', value: '09:00' },
                        { key: 'end_time', label: 'เลิกงาน', type: 'time', value: '18:00' },
                      ])
                    }
                  >
                    <Plus size={17} /> เพิ่มกะ
                  </button>
                )}
              </div>
              <Panel
                title="ตารางปฏิบัติงาน"
                subtitle="ย้อนหลัง 7 วัน และล่วงหน้า 60 วัน"
                action={
                  manage && (
                    <button
                      className="btn primary small"
                      onClick={() =>
                        form('จัดตารางกะ', 'shift.assign', [
                          {
                            key: 'employee_id',
                            label: 'พนักงาน',
                            type: 'select',
                            options: opts(
                              activeEmployees.filter(
                                (e: Row) => isStaff || e.manager_id === a.employeeId,
                              ),
                            ),
                          },
                          {
                            key: 'shift_id',
                            label: 'กะทำงาน',
                            type: 'select',
                            options: opts(d.shifts),
                          },
                          { key: 'work_date', label: 'วันที่ทำงาน', type: 'date', value: today },
                        ])
                      }
                    >
                      <Plus size={16} /> จัดตารางกะ
                    </button>
                  )
                }
              >
                {d.assignments.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>วันที่</th>
                          <th>พนักงาน</th>
                          <th>กะทำงาน</th>
                          <th>เวลา</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.assignments.map((s: Row) => (
                          <tr key={s.id}>
                            <td>{fmt(s.work_date)}</td>
                            <td>{employeeName(s.employee_id)}</td>
                            <td>
                              <Badge tone="mint">{s.shift_name}</Badge>
                            </td>
                            <td>
                              {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty text="ยังไม่มีตารางกะ" />
                )}
              </Panel>
            </>
          )}
          {section === 'requests' && (
            <Panel
              title={`คำขอทั้งหมด (${d.requests.length})`}
              subtitle="การอนุมัติ 1 ขั้น · ผู้ขอไม่สามารถอนุมัติคำขอของตนเองได้"
            >
              <Tabs
                value={tab}
                onChange={setTab}
                items={[
                  ['all', 'ทั้งหมด'],
                  ['pending', 'รออนุมัติ'],
                  ['approved', 'อนุมัติแล้ว'],
                  ['rejected', 'ไม่อนุมัติ'],
                ]}
              />
              <div className="small muted inline-note">
                วันลาพักร้อนนับตามวันปฏิทินและตรวจสิทธิ์รายปี ·
                ประเภทป่วย/กิจใช้การพิจารณาโดยผู้อนุมัติ
              </div>
              {d.requests.filter((r: Row) => tab === 'all' || r.status === tab).length ? (
                <div className="request-list">
                  {d.requests
                    .filter((r: Row) => tab === 'all' || r.status === tab)
                    .map((r: Row) => (
                      <div className="request-row" key={r.id}>
                        <span className={'todo-icon ' + (r.type === 'leave' ? 'blue' : 'orange')}>
                          {r.type === 'leave' ? <CalendarDays size={20} /> : <Timer size={20} />}
                        </span>
                        <div className="request-info">
                          <strong>
                            {employeeName(r.employee_id)}{' '}
                            <Badge
                              tone={
                                r.status === 'approved'
                                  ? 'mint'
                                  : r.status === 'pending'
                                    ? 'orange'
                                    : 'neutral'
                              }
                            >
                              {labels[r.status]}
                            </Badge>
                          </strong>
                          <p>
                            {labels[r.type]}{' '}
                            {r.type === 'leave' ? labels[r.leave_type] : r.hours + ' ชั่วโมง'} ·{' '}
                            {fmt(r.start_date)} — {fmt(r.end_date)}
                          </p>
                          <small>{r.reason}</small>
                          {r.review_note && <small>บันทึกผู้พิจารณา: {r.review_note}</small>}
                        </div>
                        {r.status === 'pending' && canReview(r.employee_id) && (
                          <div className="request-buttons">
                            <button
                              className="btn small"
                              disabled={pending}
                              onClick={() =>
                                form(
                                  'ไม่อนุมัติคำขอ',
                                  'request.review',
                                  [{ key: 'note', label: 'เหตุผล', type: 'textarea' }],
                                  { id: r.id, status: 'rejected' },
                                )
                              }
                            >
                              ไม่อนุมัติ
                            </button>
                            <button
                              className="btn primary small"
                              disabled={pending}
                              onClick={() =>
                                form(
                                  'อนุมัติคำขอ',
                                  'request.review',
                                  [
                                    {
                                      key: 'note',
                                      label: 'บันทึกผู้อนุมัติ',
                                      type: 'textarea',
                                      required: false,
                                    },
                                  ],
                                  { id: r.id, status: 'approved' },
                                )
                              }
                            >
                              <Check size={15} /> อนุมัติ
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                <Empty text="ไม่มีคำขอในหมวดนี้" />
              )}
            </Panel>
          )}
          {section === 'learning' && (
            <>
              <section className="learning-hero">
                <div>
                  <Badge tone="mint">
                    <Sparkles size={12} /> YOUR TEAM'S NEXT CHAPTER
                  </Badge>
                  <h2>เรียนรู้วันนี้ พร้อมทำงานพรุ่งนี้</h2>
                  <p>
                    หลักสูตรที่ใช่ สำหรับทุกก้าวของการทำงาน
                    <br />
                    เรียนด้วยตัวเอง ทบทวนได้ และเห็นความพร้อมจริง
                  </p>
                  <div className="hero-meta">
                    <span>
                      <BookOpen size={16} />
                      {d.courses.filter((c: Row) => c.published).length} หลักสูตรพร้อมเรียน
                    </span>
                    <span>
                      <ShieldCheck size={16} />
                      ตรวจรับทักษะโดยหัวหน้างาน
                    </span>
                  </div>
                </div>
                <div className="learning-art" aria-hidden="true">
                  <div className="learning-disc" />
                  <GraduationCap size={105} strokeWidth={1.2} />
                  <span className="art-star">✦</span>
                  <span className="learning-chip">
                    <CheckCheck size={17} /> ทีละก้าว เติบโตได้ทุกวัน
                  </span>
                </div>
              </section>
              <div className="learning-toolbar">
                <Tabs
                  value={tab}
                  onChange={setTab}
                  items={[
                    ['all', 'หลักสูตรทั้งหมด'],
                    ['mine', 'การเรียนรู้ของฉัน'],
                    ...(isStaff ? [['draft', 'ฉบับร่าง']] : []),
                  ]}
                />
                <div className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="ค้นหาหลักสูตร"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ค้นหาหลักสูตร…"
                  />
                </div>
              </div>
              <div className="course-grid">
                {filteredCourses.map((c: Row, i: number) => {
                  const n = myEnrollments.find((x: Row) => x.course_id === c.id);
                  const percent = n?.total_lessons
                    ? Math.round((n.completed_lessons / n.total_lessons) * 100)
                    : 0;
                  return (
                    <article className="course-card" key={c.id}>
                      <button
                        className={'course-cover cover-' + (i % 4)}
                        onClick={() => {
                          setCourse(c);
                          setAnswers({});
                          setQuizResult(null);
                        }}
                        aria-label={'ดูหลักสูตร ' + c.title}
                      >
                        <span className="cover-caption">
                          {
                            [
                              'START WITH CONFIDENCE',
                              'MAKE EVERY MOMENT MATTER',
                              'LEARN. PRACTICE. GROW.',
                              'YOUR NEXT CHAPTER',
                            ][i % 4]
                          }
                        </span>
                        <div className="cover-art">
                          {i % 3 === 0 ? (
                            <Leaf size={76} strokeWidth={1} />
                          ) : i % 3 === 1 ? (
                            <MessageSquareText size={70} strokeWidth={1} />
                          ) : (
                            <ShieldCheck size={76} strokeWidth={1} />
                          )}
                        </div>
                        <span className="cover-number">0{i + 1}</span>
                        <span className="cover-tag">{c.published ? 'พร้อมเรียน' : 'ฉบับร่าง'}</span>
                      </button>
                      <div className="course-body">
                        <div className="course-category">
                          {c.category}
                          <span>
                            {c.position_id
                              ? d.positions.find((p: Row) => p.id === c.position_id)?.name
                              : 'ทุกตำแหน่ง'}
                          </span>
                        </div>
                        <h2>{c.title}</h2>
                        <p>{c.description}</p>
                        <div className="course-meta">
                          <span>
                            <BookOpen size={14} />
                            {c.lesson_count} บทเรียน
                          </span>
                          <span>
                            <Clock3 size={14} />
                            {c.duration_minutes} นาที
                          </span>
                          <span>ผ่าน {c.pass_score}%</span>
                        </div>
                        {n && (
                          <div className="course-progress">
                            <div>
                              <span>
                                {ready(n, c.requires_signoff)
                                  ? 'พร้อมปฏิบัติงาน'
                                  : n.passed_at
                                    ? 'ผ่านข้อสอบ · รอตรวจรับทักษะ'
                                    : 'ความคืบหน้าบทเรียน'}
                              </span>
                              <strong>{percent}%</strong>
                            </div>
                            <Progress value={percent} />
                          </div>
                        )}
                        <div className="course-footer">
                          <span>
                            {c.auto_assign ? (
                              <>
                                <span className="tiny-dot" /> มอบหมายอัตโนมัติ
                              </>
                            ) : (
                              'มอบหมายโดยผู้ดูแล'
                            )}
                          </span>
                          <button
                            className="text-link"
                            onClick={() => {
                              setCourse(c);
                              setAnswers({});
                              setQuizResult(null);
                            }}
                          >
                            {n ? 'เข้าเรียน' : 'ดูหลักสูตร'} <ArrowRight size={15} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!filteredCourses.length && (
                <Panel title="หลักสูตร">
                  <Empty text="ยังไม่มีหลักสูตรในหมวดนี้" />
                </Panel>
              )}
            </>
          )}
          {section === 'readiness' && (
            <>
              <div className="stats-grid three">
                <Stat
                  title="การมอบหมายทั้งหมด"
                  value={en.length}
                  foot="หลักสูตรของพนักงานที่ยังปฏิบัติงาน"
                  icon={<BookOpen size={22} />}
                  color="blue"
                />
                <Stat
                  title="รอตรวจรับทักษะ"
                  value={
                    en.filter((n: Row) => n.passed_at && n.requires_signoff && !n.signed_off_at)
                      .length
                  }
                  foot="ผ่านแบบทดสอบแล้ว"
                  icon={<ClipboardCheck size={22} />}
                  color="orange"
                />
                <Stat
                  title="พร้อมปฏิบัติงาน"
                  value={finished.length}
                  foot="ผ่านเกณฑ์ของหลักสูตรครบแล้ว"
                  icon={<ShieldCheck size={22} />}
                  color="teal"
                />
              </div>
              <Panel
                title="ติดตามการเรียนรู้และทักษะ"
                subtitle="พนักงานพร้อมเมื่อผ่านทุกหลักสูตรที่ได้รับมอบหมาย"
                action={
                  manage && (
                    <button className="btn primary small" onClick={() => assignCourse()}>
                      <Plus size={16} /> มอบหมายหลักสูตร
                    </button>
                  )
                }
              >
                {en.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>พนักงาน / หลักสูตร</th>
                          <th>บทเรียน</th>
                          <th>คะแนนสูงสุด</th>
                          <th>สถานะ</th>
                          <th>กำหนดเสร็จ</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {en.map((n: Row) => (
                          <tr key={n.id}>
                            <td>
                              <strong>{employeeName(n.employee_id)}</strong>
                              <small>{n.title}</small>
                            </td>
                            <td>
                              <span>
                                {n.completed_lessons}/{n.total_lessons} บท
                              </span>
                              <Progress
                                value={
                                  n.total_lessons
                                    ? (n.completed_lessons / n.total_lessons) * 100
                                    : 0
                                }
                              />
                            </td>
                            <td>
                              {n.best_score}% <small>เกณฑ์ {n.pass_score}%</small>
                            </td>
                            <td>
                              <Badge
                                tone={
                                  ready(n, n.requires_signoff)
                                    ? 'mint'
                                    : n.passed_at
                                      ? 'orange'
                                      : 'blue'
                                }
                              >
                                {ready(n, n.requires_signoff)
                                  ? 'พร้อมปฏิบัติงาน'
                                  : n.passed_at
                                    ? 'รอตรวจทักษะ'
                                    : 'กำลังเรียน'}
                              </Badge>
                              {n.signoff_note && <small>{n.signoff_note}</small>}
                            </td>
                            <td>
                              {fmt(n.due_date)}
                              {!ready(n, n.requires_signoff) && n.due_date.slice(0, 10) < today && (
                                <small className="danger-text">เกินกำหนด</small>
                              )}
                            </td>
                            <td>
                              {n.passed_at &&
                                n.requires_signoff &&
                                !n.signed_off_at &&
                                canReview(n.employee_id) && (
                                  <button
                                    className="btn small"
                                    onClick={() => setReviewEnrollment(n)}
                                  >
                                    <CheckCircle2 size={15} /> ตรวจรับทักษะ
                                  </button>
                                )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty text="ยังไม่มีการมอบหมายหลักสูตร" />
                )}
              </Panel>
            </>
          )}
          {section === 'assistant' && (
            <div className="assistant-layout">
              <section className="panel assistant-panel">
                <div className="assistant-intro">
                  <span className="ai-icon">
                    <Sparkles size={26} />
                  </span>
                  <h2>ถามเรื่องงานได้ที่นี่</h2>
                  <p>
                    ค้นหาคำตอบจากคู่มือที่คุณมีสิทธิ์อ่าน
                    <br />
                    พร้อมแหล่งอ้างอิงเพื่อกลับไปทบทวน
                  </p>
                  <Badge tone={d.features.ai ? 'mint' : 'neutral'}>
                    {d.features.ai ? 'AI พร้อมใช้งาน' : 'โหมดค้นหาคู่มือ · ยังไม่ได้เปิด AI'}
                  </Badge>
                  <div className="suggestions">
                    {['ลา', 'ลงเวลา', 'ลูกค้า'].map((q) => (
                      <button
                        key={q}
                        onClick={() => {
                          const field =
                            document.querySelector<HTMLInputElement>('#manual-question');
                          if (field) {
                            field.value = q;
                            field.focus();
                          }
                        }}
                      >
                        {q}
                        <ArrowUpRight size={13} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="chat-history" aria-live="polite">
                  {chat.map((m, i) => (
                    <div className="chat-pair" key={i}>
                      <div className="chat-question">{m.question}</div>
                      <div className="chat-answer">
                        <Sparkles size={17} />
                        <div>
                          <small>{m.mode === 'ai' ? 'ผู้ช่วย AI' : 'ผลค้นหาจากคู่มือ'}</small>
                          <p>{m.answer}</p>
                          {m.sources.map((s: Row) => (
                            <span className="source-chip" key={s.id}>
                              <FileText size={13} />
                              {s.course} · {s.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  {thinking && <div className="muted">กำลังค้นหาข้อมูล…</div>}
                </div>
                <form
                  className="chat-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = e.currentTarget;
                    const q = String(new FormData(f).get('question'));
                    setThinking(true);
                    try {
                      const r = await askManual(q);
                      setChat([...chat, { question: q, ...r }]);
                      f.reset();
                    } catch {
                      flash({ ok: false, message: 'ไม่สามารถค้นหาได้ กรุณาลองใหม่' });
                    } finally {
                      setThinking(false);
                    }
                  }}
                >
                  <input
                    id="manual-question"
                    name="question"
                    placeholder="ถามเกี่ยวกับขั้นตอนการทำงาน…"
                    minLength={2}
                    maxLength={1000}
                    required
                  />
                  <button className="btn primary" disabled={thinking} aria-label="ส่งคำถาม">
                    <Send size={18} />
                  </button>
                </form>
              </section>
              <aside className="assistant-aside">
                <Panel title="แหล่งข้อมูลของคุณ">
                  <p className="body-copy">
                    ผู้ช่วยอ่านเฉพาะเนื้อหาบทเรียนที่เผยแพร่และคุณได้รับมอบหมาย
                    โดยไม่ใช้ข้อมูลส่วนตัวของพนักงานหรือเฉลยข้อสอบ
                  </p>
                  <div className="assistant-source-list">
                    {myEnrollments
                      .filter((n: Row) => n.published)
                      .map((n: Row) => (
                        <span key={n.id}>
                          <BookOpen size={16} />
                          {n.title}
                        </span>
                      ))}
                  </div>
                </Panel>
                <div className="tip-card">
                  <span>
                    <AlertCircle size={18} /> ใช้คู่มือประกอบการตัดสินใจ
                  </span>
                  <p>
                    หากไม่พบคำตอบ หรือคำถามเกี่ยวกับเหตุฉุกเฉินและนโยบายที่ยังไม่ชัดเจน
                    ให้สอบถามหัวหน้างาน
                  </p>
                </div>
              </aside>
            </div>
          )}
          {section === 'settings' && (
            <>
              <div className="two-columns">
                <Panel title="พื้นที่ทำงาน" subtitle="ข้อมูลบริษัทและบัญชีของคุณ">
                  <div className="settings-company">
                    <Building2 size={30} />
                    <div>
                      <strong>{company?.name}</strong>
                      <small>
                        {company?.slug} · {roleNames[a.role]}
                      </small>
                    </div>
                  </div>
                  <div className="settings-actions">
                    <button
                      className="btn"
                      onClick={() =>
                        form('เปลี่ยนรหัสผ่าน', 'password.change', [
                          { key: 'current', label: 'รหัสผ่านปัจจุบัน', type: 'password' },
                          {
                            key: 'password',
                            label: 'รหัสผ่านใหม่ (อย่างน้อย 12 ตัวอักษร)',
                            type: 'password',
                          },
                        ])
                      }
                    >
                      <KeyRound size={16} /> เปลี่ยนรหัสผ่าน
                    </button>
                    {a.role === 'admin' && (
                      <button
                        className="btn"
                        onClick={() =>
                          form('สร้างบริษัทใหม่', 'company.create', [
                            { key: 'name', label: 'ชื่อบริษัท' },
                            {
                              key: 'slug',
                              label: 'รหัสบริษัท (a-z, 0-9, ขีดกลาง)',
                              hint: '3–50 ตัวอักษร',
                            },
                          ])
                        }
                      >
                        <Plus size={16} /> สร้างบริษัท
                      </button>
                    )}
                  </div>
                  <p className="small muted pad">
                    แต่ละบริษัทมีข้อมูลและสิทธิ์แยกจากกัน ผู้สร้างบริษัทจะเป็นผู้ดูแลของบริษัทใหม่
                  </p>
                </Panel>
                <Panel title="เข้าสู่ระบบผ่านองค์กร" subtitle="Google และ Microsoft">
                  <Integration
                    name="Google Login"
                    active={d.features.google}
                    detail="ใช้บัญชีที่ HR สร้างไว้แล้ว"
                  />
                  <Integration
                    name="Microsoft Entra ID"
                    active={d.features.microsoft}
                    detail="กำหนด tenant issuer และ callback URL ใน .env"
                  />
                  <p className="small muted pad">
                    ต้องตั้งค่า OAuth application และทดสอบด้วยบัญชีจริงก่อนเปิดใช้
                  </p>
                </Panel>
              </div>
              {a.role === 'admin' && (
                <div className="two-columns">
                  <Panel title="เครื่องสแกนลงเวลา" subtitle="รับข้อมูลจากตัวกลางผ่าน REST API">
                    <Integration
                      name="Attendance API"
                      active={!!d.integration.device_configured}
                      detail="API key แยกตามบริษัท รองรับการส่งซ้ำโดยไม่บันทึกซ้ำ"
                    />
                    <div className="pad">
                      <code>POST /api/integrations/attendance</code>
                      <p className="small muted">
                        Company ID: <code>{a.companyId}</code>
                      </p>
                      <p className="small muted">
                        ต้องมีโปรแกรมตัวกลางส่งข้อมูลจากเครื่องสแกนตามรูปแบบที่ระบุในเอกสาร
                      </p>
                      <button
                        className="btn"
                        disabled={pending}
                        onClick={() => form('สร้าง / เปลี่ยน API key', 'integration.rotate', [])}
                      >
                        <KeyRound size={16} /> สร้าง / เปลี่ยน API key
                      </button>
                      <small className="block muted">
                        การเปลี่ยน key จะทำให้ key เดิมใช้ไม่ได้ทันที
                      </small>
                    </div>
                  </Panel>
                  <Panel title="แจ้งเตือนผ่าน LINE" subtitle="LINE Messaging API">
                    <Integration
                      name="LINE Messaging"
                      active={d.features.line && !!d.integration.line_recipient}
                      detail="ส่งสรุปจำนวนคำขอรออนุมัติ โดยผู้ดูแลกดส่ง"
                    />
                    <div className="pad">
                      <div className="settings-actions">
                        <button
                          className="btn"
                          onClick={() =>
                            form(
                              'ตั้งค่า LINE',
                              'integration.save',
                              [
                                {
                                  key: 'line_recipient',
                                  label: 'Recipient user / group ID',
                                  required: false,
                                },
                              ],
                              { line_recipient: d.integration.line_recipient ?? '' },
                            )
                          }
                        >
                          ตั้งค่าผู้รับ
                        </button>
                        <button
                          className="btn primary"
                          disabled={pending}
                          onClick={() => start(async () => flash(await sendLine()))}
                        >
                          <Send size={16} /> ส่งสรุปคำขอ
                        </button>
                      </div>
                      <p className="small muted">
                        ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน .env และให้ผู้รับเพิ่มเพื่อนกับบอทก่อน
                      </p>
                    </div>
                  </Panel>
                </div>
              )}
              {isStaff && (
                <Panel
                  title="ส่งออกข้อมูลสำหรับระบบบัญชี"
                  subtitle="ไฟล์ CSV มาตรฐาน · ยังไม่ใช่การเชื่อม API ของโปรแกรมบัญชีเฉพาะราย"
                >
                  <div className="export-row">
                    <label>
                      รูปแบบตัวเชื่อม
                      <select
                        value={exportFormat}
                        onChange={(e) => setExportFormat(e.target.value)}
                      >
                        <option value="generic">CSV มาตรฐาน</option>
                        <option value="demoledger-v1">DemoLedger v1 (สมมติ)</option>
                      </select>
                    </label>
                    <label>
                      ตั้งแต่
                      <input
                        type="date"
                        value={exportFrom}
                        onChange={(e) => setExportFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      ถึง
                      <input
                        type="date"
                        value={exportTo}
                        onChange={(e) => setExportTo(e.target.value)}
                      />
                    </label>
                    {[
                      ['attendance', 'เวลาทำงาน'],
                      ['ot', 'OT ที่อนุมัติ'],
                      ['employees', 'พนักงาน'],
                    ].map(([kind, title]) => (
                      <a
                        key={kind}
                        className="btn"
                        href={`/api/export?type=${kind}&from=${exportFrom}&to=${exportTo}&format=${exportFormat}`}
                      >
                        <Download size={16} />
                        {title}
                      </a>
                    ))}
                  </div>
                </Panel>
              )}
              {a.role === 'admin' && (
                <Panel title="ประวัติการทำรายการ" subtitle="80 รายการล่าสุดของบริษัท">
                  {d.audits.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>เวลา</th>
                            <th>ผู้ทำรายการ</th>
                            <th>รายการ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.audits.map((l: Row) => (
                            <tr key={l.id}>
                              <td>
                                {fmt(l.created_at)} {time(l.created_at)}
                              </td>
                              <td>{l.actor ?? 'เครื่องลงเวลา'}</td>
                              <td>
                                <code>{l.action}</code>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty text="ยังไม่มีประวัติรายการ" />
                  )}
                </Panel>
              )}
            </>
          )}
          <footer className="workspace-footer">
            <span>
              peopleflow<span className="brand-dot">.</span> <span>ดูแลคน ให้เติบโตไปด้วยกัน</span>
            </span>
            <small>HRM + LEARNING · MVP</small>
          </footer>
        </main>
      </div>
      {toast && (
        <div className={'toast ' + (toast.ok ? 'success' : 'error')} role="status">
          {toast.ok ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span>{toast.message}</span>
          <button aria-label="ปิดข้อความ" onClick={() => setToast(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <Dialog title={modal.title} onClose={() => !pending && setModal(null)}>
          <form
            className="data-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const input: Row = { ...modal.initial };
              for (const field of modal.fields)
                input[field.key] =
                  field.type === 'checkbox' ? f.has(field.key) : String(f.get(field.key) ?? '');
              if (modal.action === 'question.create') {
                input.options = [input.option0, input.option1, input.option2];
                delete input.option0;
                delete input.option1;
                delete input.option2;
              }
              act(modal.action, input);
            }}
          >
            {modal.action === 'integration.rotate' && (
              <p>สร้าง key ใหม่สำหรับเครื่องลงเวลาของบริษัทนี้ key เดิมจะใช้ไม่ได้ทันที</p>
            )}
            {modal.fields.map((f) => (
              <label className={f.type === 'checkbox' ? 'checkbox-label' : ''} key={f.key}>
                {f.type === 'checkbox' ? (
                  <>
                    <input
                      type="checkbox"
                      name={f.key}
                      defaultChecked={modal.initial?.[f.key] ?? f.value}
                    />
                    {f.label}
                  </>
                ) : (
                  <>
                    {f.label}
                    {f.type === 'textarea' ? (
                      <textarea
                        name={f.key}
                        rows={4}
                        required={f.required !== false}
                        defaultValue={modal.initial?.[f.key] ?? f.value}
                      />
                    ) : f.type === 'select' ? (
                      <select
                        name={f.key}
                        required={f.required !== false}
                        defaultValue={modal.initial?.[f.key] ?? f.value ?? f.options?.[0]?.value}
                      >
                        {f.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        name={f.key}
                        type={f.type ?? 'text'}
                        required={f.required !== false}
                        min={f.min}
                        max={f.max}
                        defaultValue={modal.initial?.[f.key] ?? f.value}
                      />
                    )}
                  </>
                )}
                {f.hint && <small>{f.hint}</small>}
              </label>
            ))}
            <div className="form-footer">
              <button
                type="button"
                className="btn"
                disabled={pending}
                onClick={() => setModal(null)}
              >
                ยกเลิก
              </button>
              <button className="btn primary" disabled={pending}>
                {pending ? 'กำลังบันทึก…' : 'ยืนยันและบันทึก'}
                <Check size={16} />
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {reviewEnrollment && (
        <SkillChecklist
          enrollment={reviewEnrollment}
          items={d.skillItems.filter((i: Row) => i.course_id === reviewEnrollment.course_id)}
          checks={d.skillChecks.filter((c: Row) => c.enrollment_id === reviewEnrollment.id)}
          onClose={() => setReviewEnrollment(null)}
        />
      )}
      {uploadCourse && (
        <UploadLesson
          courseId={uploadCourse}
          onClose={() => setUploadCourse(null)}
          onSaved={() => {
            router.refresh();
            flash({ ok: true, message: 'เพิ่มไฟล์บทเรียนแล้ว' });
          }}
        />
      )}
      {selectedCourse && !modal && !uploadCourse && (
        <Dialog wide title={selectedCourse.title} onClose={() => setCourse(null)}>
          <div className="course-detail">
            <div className="detail-overview">
              <Badge tone="mint">
                {selectedCourse.category} · v{selectedCourse.version}
              </Badge>
              {isStaff && selectedCourse.published && (
                <button
                  className="btn small"
                  disabled={pending}
                  onClick={() => act('course.clone', { id: selectedCourse.id }, false)}
                >
                  สร้างเวอร์ชันใหม่
                </button>
              )}
              <p>{selectedCourse.description}</p>
              <div className="course-meta">
                <span>
                  <Clock3 size={15} />
                  {selectedCourse.duration_minutes} นาที
                </span>
                <span>
                  <Target size={15} />
                  ผ่าน {selectedCourse.pass_score}%
                </span>
                <span>
                  {selectedCourse.requires_signoff ? 'ต้องตรวจรับทักษะจริง' : 'ไม่ต้องตรวจรับทักษะ'}
                </span>
              </div>
              {isStaff && !selectedCourse.published && (
                <div className="settings-actions">
                  <button
                    className="btn small"
                    disabled={!d.features.uploads}
                    onClick={() => setUploadCourse(selectedCourse.id)}
                  >
                    อัปโหลด PDF / วิดีโอ
                  </button>
                  <button
                    className="btn small"
                    onClick={() =>
                      form(
                        'เพิ่มเกณฑ์ตรวจทักษะ',
                        'skill.item',
                        [
                          { key: 'title', label: 'ทักษะที่ต้องสังเกต' },
                          {
                            key: 'required',
                            label: 'ต้องผ่านข้อนี้ก่อนรับรอง',
                            type: 'checkbox',
                            value: true,
                          },
                        ],
                        { course_id: selectedCourse.id },
                      )
                    }
                  >
                    เพิ่มเช็กลิสต์ทักษะ
                  </button>
                  <button className="btn small" onClick={() => addLesson(selectedCourse)}>
                    <Plus size={15} /> เพิ่มบทเรียน
                  </button>
                  <button className="btn small" onClick={() => addQuestion(selectedCourse)}>
                    <Plus size={15} /> เพิ่มข้อสอบ
                  </button>
                  <button
                    disabled={pending}
                    className="btn primary small"
                    onClick={() => act('course.publish', { id: selectedCourse.id }, false)}
                  >
                    เผยแพร่หลักสูตร
                  </button>
                </div>
              )}
              {manage && selectedCourse.published && (
                <button className="btn small" onClick={() => assignCourse(selectedCourse)}>
                  มอบหมายให้พนักงาน <ArrowRight size={15} />
                </button>
              )}
            </div>
            {!selectedEnrollment && !isStaff && (
              <div className="notice">คุณยังไม่ได้รับมอบหมายหลักสูตรนี้ กรุณาติดต่อหัวหน้างาน</div>
            )}
            {!selectedCourse.published && !d.features.uploads && (
              <div className="notice">การอัปโหลดไฟล์ออนไลน์ยังต้องเชื่อมพื้นที่จัดเก็บ private</div>
            )}
            {d.skillItems.some((i: Row) => i.course_id === selectedCourse.id) && (
              <div className="notice">
                <strong>เกณฑ์ตรวจทักษะจริง</strong>
                {d.skillItems
                  .filter((i: Row) => i.course_id === selectedCourse.id)
                  .map((i: Row) => (
                    <p key={i.id}>
                      □ {i.title} {i.required ? '(จำเป็น)' : ''}
                      {isStaff && !selectedCourse.published && (
                        <button
                          className="text-link"
                          disabled={pending}
                          onClick={() => act('skill.item.delete', { id: i.id }, false)}
                        >
                          {' '}
                          นำเกณฑ์ออก
                        </button>
                      )}
                    </p>
                  ))}
              </div>
            )}
            <h3>บทเรียน ({selectedLessons.length})</h3>
            {selectedLessons.map((l: Row, i: number) => (
              <details
                className="lesson-block"
                key={l.id}
                open={selectedLessons.length === 1 || undefined}
              >
                <summary>
                  <span className="lesson-number">{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    {l.title}
                    <small>
                      {l.type === 'video' ? 'วิดีโอ' : l.type === 'document' ? 'เอกสาร' : 'บทเรียน'}
                    </small>
                  </span>
                  {completedIds.has(l.id) ? (
                    <CheckCircle2 className="teal-text" size={21} />
                  ) : (
                    <ChevronDown size={18} />
                  )}
                </summary>
                <div className="lesson-content">
                  {isStaff && !selectedCourse.published && (
                    <button
                      className="btn small"
                      onClick={() =>
                        form(
                          'แก้ไขบทเรียนฉบับร่าง',
                          'lesson.update',
                          [
                            { key: 'title', label: 'ชื่อบทเรียน' },
                            { key: 'content', label: 'เนื้อหา', type: 'textarea' },
                          ],
                          { id: l.id, title: l.title, content: l.content },
                        )
                      }
                    >
                      แก้ไขเนื้อหา
                    </button>
                  )}
                  {l.asset_id &&
                    (l.type === 'video' ? (
                      <video controls preload="metadata" src={'/api/files/' + l.asset_id} />
                    ) : (
                      <a
                        className="btn"
                        target="_blank"
                        rel="noopener noreferrer"
                        href={'/api/files/' + l.asset_id}
                      >
                        เปิดเอกสาร PDF
                      </a>
                    ))}
                  {l.type === 'video' &&
                    l.media_url &&
                    (/\.(mp4|webm|ogg)(\?|$)/i.test(l.media_url) ? (
                      <video controls preload="metadata" src={l.media_url} />
                    ) : (
                      <a
                        className="btn"
                        href={l.media_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Video size={16} /> เปิดวิดีโอ <ExternalLink size={14} />
                      </a>
                    ))}
                  <p>{l.content}</p>
                  {l.type === 'document' && l.media_url && (
                    <a href={l.media_url} target="_blank" rel="noopener noreferrer" className="btn">
                      <FileText size={16} /> เปิดเอกสาร <ExternalLink size={14} />
                    </a>
                  )}
                  {selectedEnrollment && (
                    <button
                      disabled={pending || completedIds.has(l.id)}
                      className="btn small primary"
                      onClick={() =>
                        act(
                          'lesson.complete',
                          { enrollment_id: selectedEnrollment.id, lesson_id: l.id },
                          false,
                        )
                      }
                    >
                      <Check size={15} />
                      {completedIds.has(l.id) ? 'เรียนบทนี้แล้ว' : 'ยืนยันว่าเรียนบทนี้จบแล้ว'}
                    </button>
                  )}
                </div>
              </details>
            ))}
            {!selectedLessons.length && (
              <div className="notice">ยังไม่มีบทเรียน เพิ่มเนื้อหาก่อนเผยแพร่</div>
            )}
            <h3>แบบทดสอบ ({selectedQuestions.length} ข้อ)</h3>
            {isStaff &&
              !selectedCourse.published &&
              selectedQuestions.map((q: Row) => (
                <div className="notice" key={q.id}>
                  <strong>{q.prompt}</strong>
                  <p>{q.options.join(' / ')}</p>
                  <button
                    className="text-link"
                    disabled={pending}
                    onClick={() => act('question.delete', { id: q.id }, false)}
                  >
                    นำข้อสอบออกจากฉบับร่าง
                  </button>
                </div>
              ))}
            {selectedEnrollment ? (
              <>
                <div className="notice">
                  เรียนให้ครบทุกบทก่อนทำข้อสอบ หากไม่ผ่านให้กลับไปทบทวนบทเรียนและสอบใหม่ได้ ·
                  คะแนนสูงสุด {selectedEnrollment.best_score}%
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    act('quiz.submit', { enrollment_id: selectedEnrollment.id, answers }, false);
                  }}
                >
                  {selectedQuestions.map((q: Row, i: number) => (
                    <fieldset className="quiz-question" key={q.id}>
                      <legend>
                        {i + 1}. {q.prompt}
                      </legend>
                      {q.options.map((o: string, j: number) => (
                        <label key={j}>
                          <input
                            type="radio"
                            name={q.id}
                            required
                            value={j}
                            checked={answers[q.id] === j}
                            onChange={() => setAnswers({ ...answers, [q.id]: j })}
                          />
                          {o}
                        </label>
                      ))}
                    </fieldset>
                  ))}
                  {selectedQuestions.length > 0 && (
                    <button
                      className="btn primary"
                      disabled={pending || completedIds.size < selectedLessons.length}
                    >
                      ส่งแบบทดสอบ <ArrowRight size={15} />
                    </button>
                  )}
                </form>
                {quizResult && (
                  <div className={'notice ' + (quizResult.passed ? 'success' : 'error')}>
                    <strong>
                      คะแนน {quizResult.score}% · {quizResult.message}
                    </strong>
                    {quizResult.feedback?.map((f: Row, i: number) => (
                      <p key={i}>
                        {f.correct ? '✓' : '↻'} {f.prompt}
                        <br />
                        <small>{f.explanation}</small>
                      </p>
                    ))}
                  </div>
                )}
                {selectedEnrollment.passed_at && (
                  <div className="notice success">
                    <ShieldCheck size={17} />{' '}
                    {ready(selectedEnrollment, selectedCourse.requires_signoff)
                      ? 'ผ่านเกณฑ์ครบ พร้อมปฏิบัติงานในหลักสูตรนี้'
                      : 'ผ่านข้อสอบแล้ว ขั้นถัดไป: ให้หัวหน้าตรวจรับทักษะจากการปฏิบัติงานจริง'}
                  </div>
                )}
              </>
            ) : (
              <div className="notice">
                {isStaff
                  ? 'เพิ่มข้อสอบในฉบับร่างได้จากปุ่มด้านบน ระบบจะไม่ส่งเฉลยไปยังผู้เรียน'
                  : 'เมื่อได้รับมอบหมาย คุณจะเข้าเรียนและทำแบบทดสอบได้'}
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
function Stat({
  title,
  value,
  foot,
  icon,
  color,
}: {
  title: string;
  value: ReactNode;
  foot: string;
  icon: ReactNode;
  color: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        <span className={'stat-icon ' + color}>{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{foot}</small>
    </div>
  );
}
function Legend({ color, title, value }: { color: string; title: string; value: number }) {
  return (
    <div>
      <i style={{ background: color }} />
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Tabs({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  items: string[][];
}) {
  return (
    <div className="tabs">
      {items.map(([key, label]) => (
        <button className={value === key ? 'active' : ''} onClick={() => onChange(key)} key={key}>
          {label}
        </button>
      ))}
    </div>
  );
}
function Integration({ name, active, detail }: { name: string; active: boolean; detail: string }) {
  return (
    <div className="integration-row">
      <span className={'todo-icon ' + (active ? 'teal' : 'neutral')}>
        <Plug size={19} />
      </span>
      <div>
        <strong>{name}</strong>
        <small>{detail}</small>
      </div>
      <Badge tone={active ? 'mint' : 'neutral'}>{active ? 'ตั้งค่าแล้ว' : 'ยังไม่ตั้งค่า'}</Badge>
    </div>
  );
}
function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={'dialog ' + (wide ? 'wide' : '')}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="icon-btn" aria-label="ปิดหน้าต่าง" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
