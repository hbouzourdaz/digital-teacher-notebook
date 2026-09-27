-- 001_initial.sql — المخطط الأولي لقاعدة بيانات دفتر الأستاذ الرقمي
-- كل البيانات محلية (SQLite) ولا يوجد أي اعتماد على الشبكة.

PRAGMA foreign_keys = ON;

/* ------------------------------------------------------------------ */
/* السنوات الدراسية                                                     */
/* ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS academic_years (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  label        TEXT NOT NULL UNIQUE,
  start_date   TEXT NOT NULL,
  end_date     TEXT NOT NULL,
  is_active    INTEGER NOT NULL DEFAULT 0,
  is_archived  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

/* ------------------------------------------------------------------ */
/* الأستاذ والمؤسسة والمادة والمستويات                                  */
/* ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS teachers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name      TEXT NOT NULL,
  subject_label  TEXT,
  phone          TEXT,
  email          TEXT,
  notes          TEXT,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS schools (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  stage         TEXT,
  wilaya        TEXT,
  municipality  TEXT,
  logo_path     TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS subjects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  code        TEXT,
  notes       TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS levels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  order_index INTEGER NOT NULL DEFAULT 0
);

/* ------------------------------------------------------------------ */
/* الأقسام                                                             */
/* ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS classes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id  INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  level_id          INTEGER REFERENCES levels(id) ON DELETE SET NULL,
  stream            TEXT,
  subject_id        INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  notes             TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (academic_year_id, name)
);

/* ------------------------------------------------------------------ */
/* التلاميذ                                                            */
/* ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS students (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id  INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  class_id          INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  number            INTEGER,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  full_name         TEXT GENERATED ALWAYS AS (trim(first_name) || ' ' || trim(last_name)) VIRTUAL,
  gender            TEXT CHECK (gender IN ('male', 'female') OR gender IS NULL),
  birth_date        TEXT,
  guardian_phone    TEXT,
  notes             TEXT,
  archived          INTEGER NOT NULL DEFAULT 0,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS student_transfers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id     INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  from_class_id  INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  to_class_id    INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  date           TEXT NOT NULL,
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

/* ------------------------------------------------------------------ */
/* الجدول الأسبوعي                                                     */
/* ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS weekly_schedule (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id  INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  day_of_week       INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time        TEXT NOT NULL,
  end_time          TEXT NOT NULL,
  class_id          INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id        INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  session_type      TEXT NOT NULL DEFAULT 'درس',
  room              TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

/* ------------------------------------------------------------------ */
/* الدفتر اليومي                                                       */
/* ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS daily_lessons (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id  INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  schedule_id       INTEGER REFERENCES weekly_schedule(id) ON DELETE SET NULL,
  date              TEXT NOT NULL,
  start_time        TEXT NOT NULL,
  end_time          TEXT NOT NULL,
  class_id          INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id        INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  session_type      TEXT NOT NULL DEFAULT 'درس',
  title             TEXT NOT NULL DEFAULT '',
  stages            TEXT NOT NULL DEFAULT '',
  notes             TEXT NOT NULL DEFAULT '',
  annual_plan_id    INTEGER REFERENCES annual_plans(id) ON DELETE SET NULL,
  lesson_bank_id    INTEGER REFERENCES lesson_bank(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'recorded')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

/* ------------------------------------------------------------------ */
/* الحضور                                                              */
/* ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS attendance (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id  INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  daily_lesson_id   INTEGER NOT NULL REFERENCES daily_lessons(id) ON DELETE CASCADE,
  student_id        INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date              TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  note              TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (daily_lesson_id, student_id)
);

/* ------------------------------------------------------------------ */
/* التقييمات                                                           */
/* ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS assessment_categories (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id  INTEGER REFERENCES academic_years(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL,
  max_default       REAL NOT NULL DEFAULT 20,
  weight            REAL NOT NULL DEFAULT 1,
  order_index       INTEGER NOT NULL DEFAULT 0,
  is_active         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (academic_year_id, name)
);

CREATE TABLE IF NOT EXISTS assessments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id  INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  class_id          INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id        INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  category_id       INTEGER REFERENCES assessment_categories(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'homework',
  term              INTEGER NOT NULL CHECK (term BETWEEN 1 AND 3),
  date              TEXT NOT NULL,
  max_score         REAL NOT NULL DEFAULT 20,
  weight            REAL NOT NULL DEFAULT 1,
  daily_lesson_id   INTEGER REFERENCES daily_lessons(id) ON DELETE SET NULL,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS assessment_scores (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id  INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id     INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score          REAL,
  note           TEXT,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (assessment_id, student_id)
);

CREATE TABLE IF NOT EXISTS continuous_assessment (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id  INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  class_id          INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id        INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term              INTEGER NOT NULL CHECK (term BETWEEN 1 AND 3),
  kind              TEXT NOT NULL,
  value             REAL,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (student_id, term, kind)
);

/* ------------------------------------------------------------------ */
/* صيغة المعدل + النتائج المحسوبة                                      */
/* ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS grade_formulas (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id  INTEGER REFERENCES academic_years(id) ON DELETE CASCADE,
  name              TEXT NOT NULL DEFAULT 'صيغة المستخدم',
  components        TEXT NOT NULL,
  rounding          INTEGER NOT NULL DEFAULT 2,
  is_active         INTEGER NOT NULL DEFAULT 1,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS grades (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id  INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  class_id          INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id        INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id        INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  term              INTEGER NOT NULL CHECK (term BETWEEN 1 AND 3),
  continuous        REAL,
  homework          REAL,
  activities        REAL,
  exam              REAL,
  average           REAL,
  absences          INTEGER NOT NULL DEFAULT 0,
  computed_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

/* ------------------------------------------------------------------ */
/* التوزيع السنوي + بنك الدروس                                         */
/* ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS annual_plans (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id  INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  level_id          INTEGER REFERENCES levels(id) ON DELETE SET NULL,
  subject_id        INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  term              INTEGER NOT NULL CHECK (term BETWEEN 1 AND 3),
  domain            TEXT,
  unit              TEXT,
  lesson_title      TEXT NOT NULL,
  sessions_count    INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'not_started'
                    CHECK (status IN ('not_started', 'in_progress', 'done', 'late')),
  expected_date     TEXT,
  completed_date    TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS lesson_bank (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id  INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  level_id          INTEGER REFERENCES levels(id) ON DELETE SET NULL,
  subject_id        INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  domain            TEXT,
  unit              TEXT,
  duration          TEXT,
  objectives        TEXT NOT NULL DEFAULT '',
  stages            TEXT NOT NULL DEFAULT '',
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

/* ------------------------------------------------------------------ */
/* أحداث المؤسسة والتقويم                                              */
/* ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS school_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id  INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,
  term              INTEGER NOT NULL CHECK (term BETWEEN 1 AND 3),
  title             TEXT NOT NULL,
  date              TEXT NOT NULL,
  class_id          INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  subject_id        INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

/* ------------------------------------------------------------------ */
/* الملاحظات والمرفقات                                                 */
/* ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type  TEXT NOT NULL,
  owner_id    INTEGER NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type  TEXT NOT NULL,
  owner_id    INTEGER NOT NULL,
  file_path   TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  extension   TEXT,
  size        INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

/* ------------------------------------------------------------------ */
/* الطباعة والإعدادات والنسخ الاحتياطي والسجل                          */
/* ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS print_settings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  scope        TEXT NOT NULL UNIQUE,
  header_text  TEXT,
  footer_text  TEXT,
  paper        TEXT NOT NULL DEFAULT 'A4',
  orientation  TEXT NOT NULL DEFAULT 'portrait',
  margin_mm    REAL NOT NULL DEFAULT 12,
  font_size    REAL NOT NULL DEFAULT 12,
  font_family  TEXT NOT NULL DEFAULT 'Amiri',
  show_logo    INTEGER NOT NULL DEFAULT 1,
  logo_path    TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path   TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  size        INTEGER NOT NULL DEFAULT 0,
  kind        TEXT NOT NULL DEFAULT 'manual',
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   INTEGER,
  details     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

/* ------------------------------------------------------------------ */
/* الفهارس                                                             */
/* ------------------------------------------------------------------ */
CREATE INDEX IF NOT EXISTS idx_classes_year        ON classes(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_students_year       ON students(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_students_class      ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_name       ON students(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_schedule_year       ON weekly_schedule(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_schedule_slot       ON weekly_schedule(day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_lessons_date        ON daily_lessons(date);
CREATE INDEX IF NOT EXISTS idx_lessons_class       ON daily_lessons(class_id);
CREATE INDEX IF NOT EXISTS idx_lessons_schedule    ON daily_lessons(schedule_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_lesson   ON attendance(daily_lesson_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student  ON attendance(student_id, date);
CREATE INDEX IF NOT EXISTS idx_assessments_class   ON assessments(class_id, term);
CREATE INDEX IF NOT EXISTS idx_scores_assessment   ON assessment_scores(assessment_id);
CREATE INDEX IF NOT EXISTS idx_scores_student      ON assessment_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_continuous_lookup   ON continuous_assessment(class_id, term, kind);
CREATE INDEX IF NOT EXISTS idx_grades_lookup       ON grades(class_id, term);
CREATE INDEX IF NOT EXISTS idx_grades_student      ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_notes_owner         ON notes(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_attachments_owner   ON attachments(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_events_date         ON school_events(date);
CREATE INDEX IF NOT EXISTS idx_plan_year           ON annual_plans(academic_year_id, term);

CREATE UNIQUE INDEX IF NOT EXISTS uq_grades_row
  ON grades(student_id, term, IFNULL(subject_id, 0));

CREATE UNIQUE INDEX IF NOT EXISTS uq_formula_active
  ON grade_formulas(IFNULL(academic_year_id, 0)) WHERE is_active = 1;
