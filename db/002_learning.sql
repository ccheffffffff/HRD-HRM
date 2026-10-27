ALTER TABLE courses ADD COLUMN IF NOT EXISTS family_id uuid;
UPDATE courses SET family_id=id WHERE family_id IS NULL;
ALTER TABLE courses ALTER COLUMN family_id SET DEFAULT gen_random_uuid();
ALTER TABLE courses ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK(version>0);
CREATE UNIQUE INDEX IF NOT EXISTS course_versions ON courses(company_id,family_id,version);
CREATE TABLE IF NOT EXISTS learning_paths (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),title text NOT NULL,description text NOT NULL DEFAULT '',position_id uuid,auto_assign boolean NOT NULL DEFAULT true,published boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,id),FOREIGN KEY(company_id,position_id) REFERENCES positions(company_id,id)
);
CREATE TABLE IF NOT EXISTS learning_path_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,path_id uuid NOT NULL,course_id uuid NOT NULL,stage text NOT NULL CHECK(stage IN ('day_one','first_week','probation')),due_days integer NOT NULL CHECK(due_days BETWEEN 0 AND 365),sort_order integer NOT NULL DEFAULT 1,UNIQUE(company_id,path_id,course_id),FOREIGN KEY(company_id,path_id) REFERENCES learning_paths(company_id,id),FOREIGN KEY(company_id,course_id) REFERENCES courses(company_id,id)
);
CREATE TABLE IF NOT EXISTS path_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,path_id uuid NOT NULL,employee_id uuid NOT NULL,start_date date NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,path_id,employee_id),FOREIGN KEY(company_id,path_id) REFERENCES learning_paths(company_id,id),FOREIGN KEY(company_id,employee_id) REFERENCES employees(company_id,id)
);
CREATE TABLE IF NOT EXISTS skill_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,course_id uuid NOT NULL,title text NOT NULL,required boolean NOT NULL DEFAULT true,sort_order integer NOT NULL DEFAULT 1,UNIQUE(company_id,id),FOREIGN KEY(company_id,course_id) REFERENCES courses(company_id,id)
);
CREATE TABLE IF NOT EXISTS skill_checks (
 company_id uuid NOT NULL,enrollment_id uuid NOT NULL,item_id uuid NOT NULL,passed boolean NOT NULL,note text NOT NULL,reviewer_id uuid NOT NULL REFERENCES users(id),reviewed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enrollment_id,item_id),FOREIGN KEY(company_id,enrollment_id) REFERENCES enrollments(company_id,id),FOREIGN KEY(company_id,item_id) REFERENCES skill_items(company_id,id)
);
CREATE TABLE IF NOT EXISTS learning_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,course_id uuid NOT NULL,created_by uuid NOT NULL REFERENCES users(id),filename text NOT NULL,content_type text NOT NULL,size_bytes bigint NOT NULL CHECK(size_bytes>0),storage text NOT NULL CHECK(storage IN ('local','blob')),pathname text UNIQUE NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ready','rejected')),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,id),FOREIGN KEY(company_id,course_id) REFERENCES courses(company_id,id)
);
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS asset_id uuid;
ALTER TABLE lessons ADD CONSTRAINT lesson_asset_tenant FOREIGN KEY(company_id,asset_id) REFERENCES learning_assets(company_id,id);
CREATE TABLE IF NOT EXISTS notification_reads (
 company_id uuid NOT NULL REFERENCES companies(id),user_id uuid NOT NULL REFERENCES users(id),notification_key text NOT NULL,read_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(company_id,user_id,notification_key)
);
