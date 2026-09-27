/**
 * أنواع النطاق (Domain Types) — تطابق جداول قاعدة البيانات.
 * كل التواريخ ISO (YYYY-MM-DD) وكل الأوقات HH:mm.
 */

export interface AcademicYear {
  id: number
  label: string
  start_date: string
  end_date: string
  is_active: number
  is_archived: number
  created_at: string
}

export interface Teacher {
  id: number
  full_name: string
  subject_label: string | null
  phone: string | null
  email: string | null
  notes: string | null
  updated_at: string
}

export interface School {
  id: number
  name: string
  stage: string | null
  wilaya: string | null
  municipality: string | null
  logo_path: string | null
  updated_at: string
}

export interface Subject {
  id: number
  name: string
  code: string | null
  notes: string | null
  is_active: number
  sort_order: number
}

export interface Level {
  id: number
  name: string
  order_index: number
}

export interface ClassRow {
  id: number
  academic_year_id: number
  name: string
  level_id: number | null
  level_name?: string | null
  stream: string | null
  subject_id: number | null
  subject_name?: string | null
  notes: string | null
  sort_order: number
  created_at: string
  students_count?: number
  boys_count?: number
  girls_count?: number
  /** مجموعات إضافية تُحسب للطباعة فقط */
  female_count?: number
  male_count?: number
}

export interface Student {
  id: number
  academic_year_id: number
  class_id: number | null
  class_name?: string | null
  number: number | null
  first_name: string
  last_name: string
  full_name: string
  gender: 'male' | 'female' | null
  birth_date: string | null
  guardian_phone: string | null
  notes: string | null
  archived: number
  sort_order: number
  created_at: string
}

export interface ScheduleSlot {
  id: number
  academic_year_id: number
  day_of_week: number
  start_time: string
  end_time: string
  class_id: number
  class_name?: string | null
  subject_id: number | null
  subject_name?: string | null
  session_type: string
  room: string | null
  notes: string | null
  created_at: string
}

export interface DailyLesson {
  id: number
  academic_year_id: number
  schedule_id: number | null
  date: string
  start_time: string
  end_time: string
  class_id: number
  class_name?: string | null
  subject_id: number | null
  subject_name?: string | null
  session_type: string
  title: string
  stages: string
  notes: string
  annual_plan_id: number | null
  lesson_bank_id: number | null
  status: 'draft' | 'recorded'
  created_at: string
  updated_at: string
}

export interface AttendanceRecord {
  id: number
  academic_year_id: number
  daily_lesson_id: number
  student_id: number
  student_name?: string | null
  date: string
  status: string
  note: string | null
  updated_at: string
}

export interface AssessmentCategory {
  id: number
  academic_year_id: number
  name: string
  kind: string
  max_default: number
  weight: number
  order_index: number
  is_active: number
}

export interface Assessment {
  id: number
  academic_year_id: number
  class_id: number
  class_name?: string | null
  subject_id: number | null
  category_id: number | null
  category_name?: string | null
  name: string
  type: string
  term: number
  date: string
  max_score: number
  weight: number
  daily_lesson_id: number | null
  notes: string | null
  created_at: string
  scores_count?: number
}

export interface AssessmentScore {
  id: number
  assessment_id: number
  student_id: number
  score: number | null
  note: string | null
  updated_at: string
}

export interface ContinuousEntry {
  id: number
  academic_year_id: number
  class_id: number
  student_id: number
  term: number
  kind: string
  value: number | null
  updated_at: string
}

export interface GradeFormula {
  id: number
  academic_year_id: number | null
  name: string
  components: string
  rounding: number
  is_active: number
  updated_at: string
}

export interface ComputedGrade {
  student_id: number
  full_name: string
  number: number | null
  continuous: number | null
  homework: number | null
  activities: number | null
  exam: number | null
  average: number | null
  absences: number
}

export interface AnnualPlanItem {
  id: number
  academic_year_id: number
  level_id: number | null
  level_name?: string | null
  subject_id: number | null
  term: number
  domain: string | null
  unit: string | null
  lesson_title: string
  sessions_count: number
  status: string
  expected_date: string | null
  completed_date: string | null
  notes: string | null
  created_at: string
}

export interface LessonBankItem {
  id: number
  academic_year_id: number
  title: string
  level_id: number | null
  level_name?: string | null
  subject_id: number | null
  domain: string | null
  unit: string | null
  duration: string | null
  objectives: string
  stages: string
  notes: string
  created_at: string
}

export interface SchoolEvent {
  id: number
  academic_year_id: number
  type: string
  term: number
  title: string
  date: string
  class_id: number | null
  class_name?: string | null
  subject_id: number | null
  notes: string | null
  created_at: string
}

export interface Note {
  id: number
  owner_type: string
  owner_id: number
  body: string
  created_at: string
  updated_at: string
}

export interface Attachment {
  id: number
  owner_type: string
  owner_id: number
  file_path: string
  file_name: string
  extension: string | null
  size: number | null
  created_at: string
}

export interface PrintSettings {
  id: number
  scope: string
  header_text: string | null
  footer_text: string | null
  paper: string
  orientation: string
  margin_mm: number
  font_size: number
  font_family: string
  show_logo: number
  logo_path: string | null
  updated_at: string
}

export interface BackupRecord {
  id: number
  file_path: string
  file_name: string
  size: number
  kind: string
  note: string | null
  created_at: string
}

export interface AuditLog {
  id: number
  action: string
  entity: string | null
  entity_id: number | null
  details: string | null
  created_at: string
}

export interface StudentTransfer {
  id: number
  student_id: number
  from_class_id: number | null
  to_class_id: number | null
  date: string
  note: string | null
  created_at: string
}

/* ------------------------------------------------------------------ */
/* DTOs / تجميعات                                                      */
/* ------------------------------------------------------------------ */

export interface TodaySummary {
  date: string
  dayOfWeek: number
  dayLabel: string
  slots: TodaySlot[]
  nextSlot: TodaySlot | null
  currentSlot: TodaySlot | null
  stats: DashboardStats
}

export interface TodaySlot {
  schedule_id: number | null
  start_time: string
  end_time: string
  period: string
  class_id: number | null
  class_name: string
  subject_name: string | null
  session_type: string
  room: string | null
  lesson_id: number | null
  recorded: boolean
  attendance_taken: boolean
}

export interface DashboardStats {
  classes: number
  students: number
  today_sessions: number
  recorded_lessons: number
  assessments: number
  absences: number
  annual_plan_total: number
  annual_plan_done: number
}

export interface ClassStats {
  class_id: number
  students_count: number
  lessons_count: number
  attendance_sessions: number
  absences: number
  lates: number
  assessments_count: number
  average: number | null
  highest: number | null
  lowest: number | null
  passing: number | null
  plan_total: number
  plan_done: number
}

export interface SearchResult {
  kind: string
  label: string
  sub: string
  id: number
  route: string
}

export interface ImportPreviewRow {
  rowNumber: number
  first_name: string
  last_name: string
  full_name: string
  number: number | null
  gender: 'male' | 'female' | null
  birth_date: string | null
  class_name: string | null
  duplicate: boolean
  invalid: boolean
  message: string | null
}

export interface ImportResult {
  inserted: number
  skipped: number
  errors: string[]
  /** أسماء الأقسام التي أنشأها الاستيراد تلقائياً */
  createdClasses: string[]
  /** حصيلة الاستيراد لكل قسم */
  byClass: Array<{ class_name: string; inserted: number }>
}

/** أعمدة الملف المعروفة التي يمكن مطابقتها بحقول التلميذ */
export interface ImportMapping {
  first: number
  last: number
  full: number
  number: number
  gender: number
  birth_date: number
  class_name: number
  notes: number
}

/** نتيجة قراءة ملف تلاميذ (CSV / XLSX) بعد كشف صفّ الترويسة */
export interface ParsedTabularFile {
  headers: string[]
  rows: string[][]
  filePath: string
  /** رقم صفّ الترويسة الحقيقي (قد تسبقه أسطر عنوان) */
  headerRowIndex: number
  sheetName: string | null
  /** مطابقة مقترحة للأعمدة مبنية على الترويسة */
  mapping: ImportMapping
}

export interface TimetableCell {
  day_of_week: number
  start_time: string
  end_time: string
}

export interface ConflictInfo {
  conflicts: Array<{ a: ScheduleSlot; b: ScheduleSlot }>
}

export interface PendingBackupInfo {
  mode: 'off' | 'daily' | 'weekly'
  folder: string | null
  lastBackupAt: string | null
  nextDue: boolean
}

export interface AppPaths {
  userData: string
  database: string
  backups: string
  attachments: string
  logs: string
  resources: string
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  isDev: boolean
  paths: AppPaths
}
