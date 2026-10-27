CREATE TABLE IF NOT EXISTS companies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, name text NOT NULL, password_hash text, active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS departments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), name text NOT NULL, UNIQUE(company_id,id), UNIQUE(company_id,name)
);
CREATE TABLE IF NOT EXISTS positions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), name text NOT NULL, description text NOT NULL DEFAULT '', UNIQUE(company_id,id), UNIQUE(company_id,name)
);
CREATE TABLE IF NOT EXISTS employees (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), user_id uuid REFERENCES users(id), code text NOT NULL, name text NOT NULL, email text NOT NULL,
 department_id uuid, position_id uuid, manager_id uuid, branch text NOT NULL DEFAULT 'สำนักงานใหญ่', start_date date NOT NULL, probation_end date NOT NULL,
 status text NOT NULL DEFAULT 'probation' CHECK(status IN ('probation','active','exited')), phone text NOT NULL DEFAULT '', annual_leave_days numeric NOT NULL DEFAULT 6 CHECK(annual_leave_days>=0), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,id), UNIQUE(company_id,code), UNIQUE(company_id,email), UNIQUE(company_id,user_id),
 FOREIGN KEY(company_id,department_id) REFERENCES departments(company_id,id), FOREIGN KEY(company_id,position_id) REFERENCES positions(company_id,id), FOREIGN KEY(company_id,manager_id) REFERENCES employees(company_id,id), CHECK(probation_end>=start_date)
);
CREATE TABLE IF NOT EXISTS memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), user_id uuid NOT NULL REFERENCES users(id), employee_id uuid,
 role text NOT NULL CHECK(role IN ('admin','hr','manager','employee')), UNIQUE(company_id,user_id), FOREIGN KEY(company_id,employee_id) REFERENCES employees(company_id,id)
);
CREATE TABLE IF NOT EXISTS shifts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), name text NOT NULL, start_time time NOT NULL, end_time time NOT NULL, UNIQUE(company_id,id)
);
CREATE TABLE IF NOT EXISTS shift_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, employee_id uuid NOT NULL, shift_id uuid NOT NULL, work_date date NOT NULL,
 FOREIGN KEY(company_id,employee_id) REFERENCES employees(company_id,id), FOREIGN KEY(company_id,shift_id) REFERENCES shifts(company_id,id), UNIQUE(company_id,employee_id,work_date)
);
CREATE TABLE IF NOT EXISTS attendance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, employee_id uuid NOT NULL, work_date date NOT NULL, check_in timestamptz NOT NULL DEFAULT now(), check_out timestamptz, source text NOT NULL DEFAULT 'web', device_event_id text,
 FOREIGN KEY(company_id,employee_id) REFERENCES employees(company_id,id), UNIQUE(company_id,employee_id,work_date), UNIQUE(company_id,device_event_id), CHECK(check_out IS NULL OR check_out>=check_in)
);
CREATE TABLE IF NOT EXISTS requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, employee_id uuid NOT NULL, type text NOT NULL CHECK(type IN ('leave','ot')), leave_type text NOT NULL DEFAULT 'annual' CHECK(leave_type IN ('annual','sick','personal')), start_date date NOT NULL, end_date date NOT NULL,
 hours numeric NOT NULL DEFAULT 0 CHECK(hours>=0 AND hours<=24), reason text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), reviewer_id uuid REFERENCES users(id), review_note text, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,employee_id) REFERENCES employees(company_id,id), CHECK(end_date>=start_date)
);
CREATE TABLE IF NOT EXISTS courses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), title text NOT NULL, description text NOT NULL, category text NOT NULL DEFAULT 'เริ่มงานใหม่', position_id uuid, pass_score integer NOT NULL DEFAULT 80 CHECK(pass_score BETWEEN 1 AND 100), auto_assign boolean NOT NULL DEFAULT true, requires_signoff boolean NOT NULL DEFAULT true, published boolean NOT NULL DEFAULT false, duration_minutes integer NOT NULL DEFAULT 30 CHECK(duration_minutes>0), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,id), FOREIGN KEY(company_id,position_id) REFERENCES positions(company_id,id)
);
CREATE TABLE IF NOT EXISTS lessons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, course_id uuid NOT NULL, title text NOT NULL, type text NOT NULL CHECK(type IN ('text','video','document')), content text NOT NULL, media_url text, sort_order integer NOT NULL DEFAULT 1,
 UNIQUE(company_id,id), FOREIGN KEY(company_id,course_id) REFERENCES courses(company_id,id)
);
CREATE TABLE IF NOT EXISTS questions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, course_id uuid NOT NULL, prompt text NOT NULL, options jsonb NOT NULL, correct_index integer NOT NULL CHECK(correct_index>=0), explanation text NOT NULL DEFAULT '', FOREIGN KEY(company_id,course_id) REFERENCES courses(company_id,id)
);
CREATE TABLE IF NOT EXISTS enrollments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, course_id uuid NOT NULL, employee_id uuid NOT NULL, due_date date NOT NULL DEFAULT CURRENT_DATE+7,
 best_score integer NOT NULL DEFAULT 0 CHECK(best_score BETWEEN 0 AND 100), passed_at timestamptz, signed_off_at timestamptz, signed_off_by uuid REFERENCES users(id), signoff_note text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,id), UNIQUE(company_id,course_id,employee_id), FOREIGN KEY(company_id,course_id) REFERENCES courses(company_id,id), FOREIGN KEY(company_id,employee_id) REFERENCES employees(company_id,id)
);
CREATE TABLE IF NOT EXISTS lesson_progress (
 company_id uuid NOT NULL, enrollment_id uuid NOT NULL, lesson_id uuid NOT NULL, completed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(enrollment_id,lesson_id), FOREIGN KEY(company_id,enrollment_id) REFERENCES enrollments(company_id,id), FOREIGN KEY(company_id,lesson_id) REFERENCES lessons(company_id,id)
);
CREATE TABLE IF NOT EXISTS quiz_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, enrollment_id uuid NOT NULL, answers jsonb NOT NULL, score integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(company_id,enrollment_id) REFERENCES enrollments(company_id,id)
);
CREATE TABLE IF NOT EXISTS integrations (
 company_id uuid PRIMARY KEY REFERENCES companies(id), device_key_hash text, line_recipient text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), actor_id uuid REFERENCES users(id), action text NOT NULL, entity_id text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_throttles (
 key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS employees_tenant ON employees(company_id,status);
CREATE INDEX IF NOT EXISTS enrollment_tenant ON enrollments(company_id,employee_id);
CREATE INDEX IF NOT EXISTS requests_tenant ON requests(company_id,status);
CREATE INDEX IF NOT EXISTS audits_tenant ON audit_logs(company_id,created_at);
