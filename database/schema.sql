-- ═══════════════════════════════════════════════════════════════════════════
--  SMART EDU — Core PostgreSQL schema
--  Source of truth for the initial database structure.
--
--  Applied by `npm run db:migrate` as migration `000_schema.sql`, before any
--  incremental file in `database/migrations/`. Incremental changes to a live
--  database belong in `database/migrations/` — see the README in that folder.
--
--  Requires PostgreSQL 13+ (gen_random_uuid() is in core from 13 onwards).
-- ═══════════════════════════════════════════════════════════════════════════

-- Available in core since PG13; the extension is a no-op safety net for PG12.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────────────────────── ENUM TYPES ─────────────────────────────────

DO $$ BEGIN
  CREATE TYPE user_role         AS ENUM ('admin', 'teacher', 'student', 'parent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE assessment_type   AS ENUM ('internal', 'external', 'quiz', 'assignment', 'midterm', 'final');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE submission_status AS ENUM ('pending', 'submitted', 'late', 'graded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE complaint_status  AS ENUM ('submitted', 'under_review', 'resolved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE leave_status      AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fee_status        AS ENUM ('pending', 'partial', 'paid', 'overdue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status    AS ENUM ('created', 'success', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ptm_status        AS ENUM ('requested', 'confirmed', 'rescheduled', 'cancelled', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notice_priority   AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE weekday           AS ENUM ('monday','tuesday','wednesday','thursday','friday','saturday','sunday');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────── SHARED updated_at TRIGGER ─────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════ IDENTITY & ACCESS ════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(180)  NOT NULL,
  password_hash TEXT          NOT NULL,
  role          user_role     NOT NULL,
  phone         VARCHAR(30),
  avatar_url    TEXT,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_lower_chk CHECK (email = LOWER(email))
);
-- Case-insensitive uniqueness is enforced by storing e-mail lower-cased.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uniq ON users (email);
CREATE INDEX IF NOT EXISTS users_role_idx          ON users (role);
CREATE INDEX IF NOT EXISTS users_is_active_idx     ON users (is_active);
CREATE INDEX IF NOT EXISTS users_name_trgm_idx     ON users (LOWER(name));

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Notification / UI preferences, kept separate from the identity row.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  push_notifications  BOOLEAN NOT NULL DEFAULT TRUE,
  attendance_alerts   BOOLEAN NOT NULL DEFAULT TRUE,
  marks_alerts        BOOLEAN NOT NULL DEFAULT TRUE,
  assignment_alerts   BOOLEAN NOT NULL DEFAULT TRUE,
  notice_alerts       BOOLEAN NOT NULL DEFAULT TRUE,
  theme               VARCHAR(16) NOT NULL DEFAULT 'system',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Refresh tokens are stored hashed; the raw token never touches the database.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_hash_uniq ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx         ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expiry_idx       ON refresh_tokens (expires_at);

CREATE TABLE IF NOT EXISTS password_resets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS password_resets_hash_uniq ON password_resets (token_hash);
CREATE INDEX IF NOT EXISTS password_resets_user_idx         ON password_resets (user_id);

-- ─────────────────────── GRANULAR PERMISSION SYSTEM ───────────────────────

CREATE TABLE IF NOT EXISTS permissions (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(64) NOT NULL UNIQUE,
  label       VARCHAR(120) NOT NULL,
  category    VARCHAR(60)  NOT NULL,
  description TEXT
);

-- Baseline permissions a role carries.
CREATE TABLE IF NOT EXISTS role_permissions (
  role          user_role NOT NULL,
  permission_id INTEGER   NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_id)
);

-- Per-user grant/revoke overriding the role baseline.
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id       UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted       BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, permission_id)
);

-- ═══════════════════════ ORGANISATION & ACADEMIC ══════════════════════════

CREATE TABLE IF NOT EXISTS departments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(120) NOT NULL,
  code       VARCHAR(20)  NOT NULL UNIQUE,
  head_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(80) NOT NULL,
  section          VARCHAR(10) NOT NULL DEFAULT 'A',
  academic_year    VARCHAR(12) NOT NULL,
  department_id    UUID REFERENCES departments(id) ON DELETE SET NULL,
  class_teacher_id UUID REFERENCES users(id)       ON DELETE SET NULL,
  room             VARCHAR(40),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT classes_unique_per_year UNIQUE (name, section, academic_year)
);
CREATE INDEX IF NOT EXISTS classes_department_idx ON classes (department_id);
CREATE INDEX IF NOT EXISTS classes_teacher_idx    ON classes (class_teacher_id);

CREATE TABLE IF NOT EXISTS subjects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120) NOT NULL,
  code          VARCHAR(24)  NOT NULL UNIQUE,
  credits       NUMERIC(3,1) NOT NULL DEFAULT 4 CHECK (credits > 0),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS subjects_department_idx ON subjects (department_id);

-- ───────────────────────────── PROFILES ───────────────────────────────────

CREATE TABLE IF NOT EXISTS student_profiles (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  student_id                VARCHAR(32) NOT NULL UNIQUE,
  class_id                  UUID REFERENCES classes(id) ON DELETE SET NULL,
  roll_number               VARCHAR(20),
  date_of_birth             DATE,
  gender                    VARCHAR(20),
  address                   TEXT,
  guardian_name             VARCHAR(120),
  admission_year            INTEGER,
  -- Master switch: when FALSE no parent sees anything, whatever per-link flags say.
  parent_permission_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT student_roll_unique_per_class UNIQUE (class_id, roll_number)
);
CREATE INDEX IF NOT EXISTS student_profiles_class_idx ON student_profiles (class_id);

DROP TRIGGER IF EXISTS student_profiles_set_updated_at ON student_profiles;
CREATE TRIGGER student_profiles_set_updated_at BEFORE UPDATE ON student_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS parent_profiles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  occupation     VARCHAR(120),
  phone          VARCHAR(30),
  address        TEXT,
  alternate_email VARCHAR(180),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  employee_id   VARCHAR(32) NOT NULL UNIQUE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  designation   VARCHAR(80),
  qualification VARCHAR(160),
  joined_on     DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS teacher_profiles_department_idx ON teacher_profiles (department_id);

CREATE TABLE IF NOT EXISTS admin_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  employee_id VARCHAR(32) NOT NULL UNIQUE,
  designation VARCHAR(80),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────── PARENT ↔ STUDENT LINK + PER-LINK PRIVACY FLAGS ─────────────
-- The student owns these flags. A parent sees a data category only when the
-- student's master switch is on AND the matching flag on their link is TRUE.

CREATE TABLE IF NOT EXISTS parent_student (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship         VARCHAR(40) NOT NULL DEFAULT 'guardian',
  is_primary           BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_attendance  BOOLEAN NOT NULL DEFAULT TRUE,
  can_view_marks       BOOLEAN NOT NULL DEFAULT TRUE,
  can_view_assignments BOOLEAN NOT NULL DEFAULT TRUE,
  can_view_cgpa        BOOLEAN NOT NULL DEFAULT TRUE,
  can_view_reports     BOOLEAN NOT NULL DEFAULT TRUE,
  can_view_fees        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT parent_student_unique UNIQUE (parent_id, student_id),
  CONSTRAINT parent_student_distinct CHECK (parent_id <> student_id)
);
CREATE INDEX IF NOT EXISTS parent_student_parent_idx  ON parent_student (parent_id);
CREATE INDEX IF NOT EXISTS parent_student_student_idx ON parent_student (student_id);

DROP TRIGGER IF EXISTS parent_student_set_updated_at ON parent_student;
CREATE TRIGGER parent_student_set_updated_at BEFORE UPDATE ON parent_student
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────── TEACHING ASSIGNMENTS ─────────────────────────────

CREATE TABLE IF NOT EXISTS teacher_subjects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_id      UUID NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
  academic_year VARCHAR(12) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT teacher_subject_class_unique UNIQUE (teacher_id, subject_id, class_id, academic_year)
);
CREATE INDEX IF NOT EXISTS teacher_subjects_teacher_idx ON teacher_subjects (teacher_id);
CREATE INDEX IF NOT EXISTS teacher_subjects_class_idx   ON teacher_subjects (class_id);
CREATE INDEX IF NOT EXISTS teacher_subjects_subject_idx ON teacher_subjects (subject_id);

CREATE TABLE IF NOT EXISTS enrollments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  class_id      UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  academic_year VARCHAR(12) NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  enrolled_on   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT enrollment_unique UNIQUE (student_id, class_id, academic_year)
);
CREATE INDEX IF NOT EXISTS enrollments_student_idx ON enrollments (student_id);
CREATE INDEX IF NOT EXISTS enrollments_class_idx   ON enrollments (class_id);

-- Which subjects a class studies (drives student subject lists & analytics).
CREATE TABLE IF NOT EXISTS class_subjects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id      UUID NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  academic_year VARCHAR(12) NOT NULL,
  CONSTRAINT class_subject_unique UNIQUE (class_id, subject_id, academic_year)
);
CREATE INDEX IF NOT EXISTS class_subjects_class_idx ON class_subjects (class_id);

-- ═════════════════════════════ ATTENDANCE ═════════════════════════════════

CREATE TABLE IF NOT EXISTS attendance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_id   UUID REFERENCES classes(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES users(id)   ON DELETE SET NULL,
  date       DATE NOT NULL,
  status     attendance_status NOT NULL,
  remarks    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One record per student, per subject, per day (§59).
  CONSTRAINT attendance_unique_per_day UNIQUE (student_id, subject_id, date)
);
CREATE INDEX IF NOT EXISTS attendance_student_idx      ON attendance (student_id);
CREATE INDEX IF NOT EXISTS attendance_date_idx         ON attendance (date);
CREATE INDEX IF NOT EXISTS attendance_subject_idx      ON attendance (subject_id);
CREATE INDEX IF NOT EXISTS attendance_class_date_idx   ON attendance (class_id, date);
CREATE INDEX IF NOT EXISTS attendance_student_date_idx ON attendance (student_id, date DESC);

DROP TRIGGER IF EXISTS attendance_set_updated_at ON attendance;
CREATE TRIGGER attendance_set_updated_at BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════ ASSESSMENTS & MARKS ══════════════════════════════

CREATE TABLE IF NOT EXISTS assessments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(160) NOT NULL,
  subject_id   UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_id     UUID NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
  teacher_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  type         assessment_type NOT NULL DEFAULT 'internal',
  max_marks    NUMERIC(6,2) NOT NULL CHECK (max_marks > 0),
  weightage    NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (weightage >= 0),
  date         DATE NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS assessments_class_idx   ON assessments (class_id);
CREATE INDEX IF NOT EXISTS assessments_subject_idx ON assessments (subject_id);
CREATE INDEX IF NOT EXISTS assessments_date_idx    ON assessments (date);

CREATE TABLE IF NOT EXISTS marks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id  UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  marks_obtained NUMERIC(6,2) CHECK (marks_obtained >= 0),
  is_absent      BOOLEAN NOT NULL DEFAULT FALSE,
  remarks        TEXT,
  graded_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marks_unique_per_assessment UNIQUE (assessment_id, student_id)
);
CREATE INDEX IF NOT EXISTS marks_student_idx    ON marks (student_id);
CREATE INDEX IF NOT EXISTS marks_assessment_idx ON marks (assessment_id);

DROP TRIGGER IF EXISTS marks_set_updated_at ON marks;
CREATE TRIGGER marks_set_updated_at BEFORE UPDATE ON marks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════ ASSIGNMENTS ══════════════════════════════════

CREATE TABLE IF NOT EXISTS assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          VARCHAR(200) NOT NULL,
  description    TEXT,
  instructions   TEXT,
  subject_id     UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id     UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  class_id       UUID NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
  due_date       TIMESTAMPTZ NOT NULL,
  max_marks      NUMERIC(6,2) NOT NULL DEFAULT 100 CHECK (max_marks > 0),
  attachment_url TEXT,
  -- Structured question list, populated only when published from
  -- AI-generated content — see migrations/002_add_assignment_questions.sql.
  questions      JSONB,
  is_published   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS assignments_class_idx    ON assignments (class_id);
CREATE INDEX IF NOT EXISTS assignments_teacher_idx  ON assignments (teacher_id);
CREATE INDEX IF NOT EXISTS assignments_due_date_idx ON assignments (due_date);

DROP TRIGGER IF EXISTS assignments_set_updated_at ON assignments;
CREATE TRIGGER assignments_set_updated_at BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS submissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  submission_url TEXT,
  content        TEXT,
  submitted_at   TIMESTAMPTZ,
  marks          NUMERIC(6,2) CHECK (marks >= 0),
  feedback       TEXT,
  status         submission_status NOT NULL DEFAULT 'pending',
  graded_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  graded_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT submission_unique UNIQUE (assignment_id, student_id)
);
CREATE INDEX IF NOT EXISTS submissions_student_idx    ON submissions (student_id);
CREATE INDEX IF NOT EXISTS submissions_assignment_idx ON submissions (assignment_id);
CREATE INDEX IF NOT EXISTS submissions_status_idx     ON submissions (status);

DROP TRIGGER IF EXISTS submissions_set_updated_at ON submissions;
CREATE TRIGGER submissions_set_updated_at BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═════════════════════════════ TIMETABLE ══════════════════════════════════

CREATE TABLE IF NOT EXISTS timetable (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id      UUID NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id    UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  day           weekday NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  room          VARCHAR(40),
  academic_year VARCHAR(12) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT timetable_time_order CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS timetable_class_idx   ON timetable (class_id, day);
CREATE INDEX IF NOT EXISTS timetable_teacher_idx ON timetable (teacher_id, day);

-- ═══════════════════════ NOTICES & NOTIFICATIONS ══════════════════════════

CREATE TABLE IF NOT EXISTS notices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(200) NOT NULL,
  content     TEXT NOT NULL,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  -- NULL target_role = everyone
  target_role user_role,
  class_id    UUID REFERENCES classes(id) ON DELETE CASCADE,
  priority    notice_priority NOT NULL DEFAULT 'normal',
  category    VARCHAR(40) NOT NULL DEFAULT 'general',
  is_pinned   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notices_target_idx  ON notices (target_role);
CREATE INDEX IF NOT EXISTS notices_class_idx   ON notices (class_id);
CREATE INDEX IF NOT EXISTS notices_created_idx ON notices (created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(200) NOT NULL,
  message    TEXT NOT NULL,
  type       VARCHAR(40) NOT NULL DEFAULT 'general',
  link       TEXT,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx      ON notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS notifications_created_idx   ON notifications (created_at DESC);

-- ══════════════════════ COMPLAINTS & LEAVE ════════════════════════════════

CREATE TABLE IF NOT EXISTS complaints (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL when the complaint is anonymous: identity is never recorded.
  student_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  is_anonymous   BOOLEAN NOT NULL DEFAULT FALSE,
  -- Lets an anonymous author track their own complaint without revealing who they are.
  tracking_code  VARCHAR(16) NOT NULL UNIQUE,
  category       VARCHAR(40) NOT NULL,
  subject        VARCHAR(200) NOT NULL,
  description    TEXT NOT NULL,
  attachment_url TEXT,
  status         complaint_status NOT NULL DEFAULT 'submitted',
  priority       notice_priority NOT NULL DEFAULT 'normal',
  assigned_to    UUID REFERENCES users(id) ON DELETE SET NULL,
  response       TEXT,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS complaints_status_idx  ON complaints (status);
CREATE INDEX IF NOT EXISTS complaints_student_idx ON complaints (student_id);

DROP TRIGGER IF EXISTS complaints_set_updated_at ON complaints;
CREATE TRIGGER complaints_set_updated_at BEFORE UPDATE ON complaints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS leave_applications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  reason         TEXT NOT NULL,
  leave_type     VARCHAR(40) NOT NULL DEFAULT 'personal',
  attachment_url TEXT,
  status         leave_status NOT NULL DEFAULT 'pending',
  reviewed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  review_note    TEXT,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leave_date_order CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS leave_student_idx ON leave_applications (student_id);
CREATE INDEX IF NOT EXISTS leave_status_idx  ON leave_applications (status);

DROP TRIGGER IF EXISTS leave_set_updated_at ON leave_applications;
CREATE TRIGGER leave_set_updated_at BEFORE UPDATE ON leave_applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════════ FEES ═════════════════════════════════════

CREATE TABLE IF NOT EXISTS fee_structures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(160) NOT NULL,
  class_id      UUID REFERENCES classes(id) ON DELETE CASCADE,
  academic_year VARCHAR(12) NOT NULL,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  description   TEXT,
  due_date      DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fee_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fee_structure_id UUID NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
  total_amount     NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  paid_amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status           fee_status NOT NULL DEFAULT 'pending',
  due_date         DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fee_record_unique UNIQUE (student_id, fee_structure_id),
  CONSTRAINT fee_paid_within_total CHECK (paid_amount <= total_amount)
);
CREATE INDEX IF NOT EXISTS fee_records_student_idx ON fee_records (student_id);
CREATE INDEX IF NOT EXISTS fee_records_status_idx  ON fee_records (status);

DROP TRIGGER IF EXISTS fee_records_set_updated_at ON fee_records;
CREATE TRIGGER fee_records_set_updated_at BEFORE UPDATE ON fee_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_record_id UUID NOT NULL REFERENCES fee_records(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method        VARCHAR(40) NOT NULL DEFAULT 'mock',
  status        payment_status NOT NULL DEFAULT 'created',
  provider      VARCHAR(40) NOT NULL DEFAULT 'mock',
  provider_order_id   VARCHAR(120),
  provider_payment_id VARCHAR(120),
  receipt_no    VARCHAR(60),
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payments_student_idx ON payments (student_id);
CREATE INDEX IF NOT EXISTS payments_record_idx  ON payments (fee_record_id);

-- ══════════════════════ PARENT-TEACHER MEETINGS ═══════════════════════════

CREATE TABLE IF NOT EXISTS ptm_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  mode         VARCHAR(20) NOT NULL DEFAULT 'in_person',
  location     VARCHAR(120),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ptm_slot_time_order CHECK (end_time > start_time),
  CONSTRAINT ptm_slot_unique UNIQUE (teacher_id, date, start_time)
);
CREATE INDEX IF NOT EXISTS ptm_slots_teacher_idx ON ptm_slots (teacher_id, date);

CREATE TABLE IF NOT EXISTS ptm_bookings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id      UUID NOT NULL REFERENCES ptm_slots(id) ON DELETE CASCADE,
  parent_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agenda       TEXT,
  status       ptm_status NOT NULL DEFAULT 'requested',
  teacher_note TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- A slot can hold only one live booking; cancelled ones free it up again.
CREATE UNIQUE INDEX IF NOT EXISTS ptm_bookings_active_slot_uniq
  ON ptm_bookings (slot_id) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS ptm_bookings_parent_idx ON ptm_bookings (parent_id);

DROP TRIGGER IF EXISTS ptm_bookings_set_updated_at ON ptm_bookings;
CREATE TRIGGER ptm_bookings_set_updated_at BEFORE UPDATE ON ptm_bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═════════════════════ AI: CONVERSATIONS & RAG ════════════════════════════

CREATE TABLE IF NOT EXISTS ai_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(200) NOT NULL DEFAULT 'New conversation',
  agent      VARCHAR(40)  NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_conversations_user_idx ON ai_conversations (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS ai_conversations_set_updated_at ON ai_conversations;
CREATE TRIGGER ai_conversations_set_updated_at BEFORE UPDATE ON ai_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS ai_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx ON ai_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  source_type   VARCHAR(40) NOT NULL DEFAULT 'note',
  file_url      TEXT,
  subject_id    UUID REFERENCES subjects(id) ON DELETE SET NULL,
  class_id      UUID REFERENCES classes(id)  ON DELETE SET NULL,
  uploaded_by   UUID REFERENCES users(id)    ON DELETE SET NULL,
  visibility    VARCHAR(20) NOT NULL DEFAULT 'class',
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_indexed    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS documents_subject_idx ON documents (subject_id);
CREATE INDEX IF NOT EXISTS documents_class_idx   ON documents (class_id);

-- Chunks + embeddings. `embedding` is a plain numeric array so the schema stays
-- provider-neutral: pgvector, Chroma, Pinecone and FAISS can all be layered on
-- top without a migration (see server/src/ai/ragService.js).
CREATE TABLE IF NOT EXISTS document_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index  INTEGER NOT NULL,
  content      TEXT NOT NULL,
  token_count  INTEGER,
  embedding    DOUBLE PRECISION[],
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_chunk_unique UNIQUE (document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS document_chunks_document_idx ON document_chunks (document_id);
-- Full-text fallback so retrieval works with no vector store configured.
CREATE INDEX IF NOT EXISTS document_chunks_fts_idx
  ON document_chunks USING GIN (to_tsvector('english', content));

-- ══════════════════ GENERATED CONTENT (quizzes / papers) ══════════════════

CREATE TABLE IF NOT EXISTS generated_content (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         VARCHAR(30) NOT NULL,   -- quiz | assignment | question_paper
  title        VARCHAR(200) NOT NULL,
  subject_id   UUID REFERENCES subjects(id) ON DELETE SET NULL,
  class_id     UUID REFERENCES classes(id)  ON DELETE SET NULL,
  topic        VARCHAR(200),
  difficulty   VARCHAR(20),
  payload      JSONB NOT NULL,         -- questions + answer key
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS generated_content_teacher_idx ON generated_content (teacher_id, kind);

DROP TRIGGER IF EXISTS generated_content_set_updated_at ON generated_content;
CREATE TRIGGER generated_content_set_updated_at BEFORE UPDATE ON generated_content
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════ AUDIT & SETTINGS ════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(80) NOT NULL,
  entity     VARCHAR(60),
  entity_id  VARCHAR(64),
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx    ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx  ON audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx  ON audit_logs (entity, entity_id);

CREATE TABLE IF NOT EXISTS settings (
  key         VARCHAR(80) PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(160) NOT NULL,
  class_id      UUID NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  exam_date     DATE NOT NULL,
  start_time    TIME,
  end_time      TIME,
  room          VARCHAR(40),
  max_marks     NUMERIC(6,2) NOT NULL DEFAULT 100,
  syllabus      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS exams_class_date_idx ON exams (class_id, exam_date);

CREATE TABLE IF NOT EXISTS teacher_remarks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  remark     TEXT NOT NULL,
  sentiment  VARCHAR(20) NOT NULL DEFAULT 'neutral',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS teacher_remarks_student_idx ON teacher_remarks (student_id);

-- ═════════════════════════════ VIEWS ══════════════════════════════════════

-- Per student × subject attendance rollup (§9).
CREATE OR REPLACE VIEW v_student_subject_attendance AS
SELECT
  a.student_id,
  a.subject_id,
  s.name AS subject_name,
  s.code AS subject_code,
  COUNT(*)                                                  AS total_classes,
  COUNT(*) FILTER (WHERE a.status = 'present')              AS present_count,
  COUNT(*) FILTER (WHERE a.status = 'absent')               AS absent_count,
  COUNT(*) FILTER (WHERE a.status = 'late')                 AS late_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE a.status IN ('present', 'late')) / NULLIF(COUNT(*), 0),
    2
  )                                                         AS attendance_percentage
FROM attendance a
JOIN subjects s ON s.id = a.subject_id
GROUP BY a.student_id, a.subject_id, s.name, s.code;

-- Overall attendance per student.
CREATE OR REPLACE VIEW v_student_attendance_summary AS
SELECT
  a.student_id,
  COUNT(*)                                     AS total_classes,
  COUNT(*) FILTER (WHERE a.status = 'present') AS present_count,
  COUNT(*) FILTER (WHERE a.status = 'absent')  AS absent_count,
  COUNT(*) FILTER (WHERE a.status = 'late')    AS late_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE a.status IN ('present', 'late')) / NULLIF(COUNT(*), 0),
    2
  )                                            AS attendance_percentage
FROM attendance a
GROUP BY a.student_id;

-- Published marks as percentages, the base for grades / CGPA / trends.
CREATE OR REPLACE VIEW v_student_marks_detail AS
SELECT
  m.id,
  m.student_id,
  m.assessment_id,
  m.marks_obtained,
  m.is_absent,
  m.remarks,
  a.name       AS assessment_name,
  a.type       AS assessment_type,
  a.max_marks,
  a.date       AS assessment_date,
  a.is_published,
  a.class_id,
  s.id         AS subject_id,
  s.name       AS subject_name,
  s.code       AS subject_code,
  s.credits,
  ROUND(100.0 * m.marks_obtained / NULLIF(a.max_marks, 0), 2) AS percentage
FROM marks m
JOIN assessments a ON a.id = m.assessment_id
JOIN subjects   s ON s.id = a.subject_id;

-- Per student × subject academic rollup.
CREATE OR REPLACE VIEW v_student_subject_performance AS
SELECT
  d.student_id,
  d.subject_id,
  d.subject_name,
  d.subject_code,
  d.credits,
  COUNT(*)                  AS assessment_count,
  ROUND(AVG(d.percentage), 2) AS average_percentage,
  MAX(d.percentage)         AS best_percentage,
  MIN(d.percentage)         AS worst_percentage
FROM v_student_marks_detail d
WHERE d.is_published AND NOT d.is_absent AND d.marks_obtained IS NOT NULL
GROUP BY d.student_id, d.subject_id, d.subject_name, d.subject_code, d.credits;
