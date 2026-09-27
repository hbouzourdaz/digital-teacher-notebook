/**
 * ثوابت التطبيق — كل القيم المرجعية المشتركة بين main و renderer.
 * لا شيء هنا يعتمد على الشبكة أو أي خدمة خارجية.
 */

/* ------------------------------------------------------------------ */
/* الأيام — الأسبوع الدراسي في الجزائر: الأحد → الخميس                  */
/* day_of_week يطابق Date.getDay() مباشرة (0 = الأحد)                   */
/* ------------------------------------------------------------------ */
export const SCHOOL_DAYS = [
  { value: 0, label: 'الأحد', short: 'أحد' },
  { value: 1, label: 'الإثنين', short: 'إثن' },
  { value: 2, label: 'الثلاثاء', short: 'ثلا' },
  { value: 3, label: 'الأربعاء', short: 'أرب' },
  { value: 4, label: 'الخميس', short: 'خمي' }
] as const

export const DAY_LABELS: Record<number, string> = Object.fromEntries(
  SCHOOL_DAYS.map((d) => [d.value, d.label])
)

/* ------------------------------------------------------------------ */
/* التوقيت — كما في الدفتر اليومي المرجعي                              */
/* ------------------------------------------------------------------ */
export interface TimeSlot {
  start: string
  end: string
  period: 'morning' | 'afternoon'
}

export const TIME_SLOTS: TimeSlot[] = [
  { start: '08:00', end: '09:00', period: 'morning' },
  { start: '09:00', end: '10:00', period: 'morning' },
  { start: '10:00', end: '11:00', period: 'morning' },
  { start: '11:00', end: '12:00', period: 'morning' },
  { start: '13:00', end: '14:00', period: 'afternoon' },
  { start: '14:00', end: '15:00', period: 'afternoon' },
  { start: '15:00', end: '16:00', period: 'afternoon' },
  { start: '16:00', end: '17:00', period: 'afternoon' }
]

export const PERIOD_LABELS: Record<string, string> = {
  morning: 'الفترة الصباحية',
  afternoon: 'الفترة المسائية'
}

/* ------------------------------------------------------------------ */
/* أنواع الحصص                                                         */
/* ------------------------------------------------------------------ */
export const SESSION_TYPES = [
  'درس',
  'أعمال تطبيقية',
  'نشاط',
  'اختبار',
  'فرض',
  'مراجعة',
  'أخرى'
] as const
export type SessionType = (typeof SESSION_TYPES)[number]

/* ------------------------------------------------------------------ */
/* الفصول الثلاثة                                                      */
/* ------------------------------------------------------------------ */
export const TERMS = [
  { value: 1, label: 'الفصل الأول' },
  { value: 2, label: 'الفصل الثاني' },
  { value: 3, label: 'الفصل الثالث' }
] as const
export const TERM_LABELS: Record<number, string> = {
  1: 'الفصل الأول',
  2: 'الفصل الثاني',
  3: 'الفصل الثالث'
}

/* ------------------------------------------------------------------ */
/* حالات الحضور                                                        */
/* ------------------------------------------------------------------ */
export const ATTENDANCE_STATUSES = [
  { value: 'present', label: 'حاضر', short: 'ح' },
  { value: 'absent', label: 'غائب', short: 'غ' },
  { value: 'late', label: 'متأخر', short: 'ت' },
  { value: 'excused', label: 'معفي', short: 'إ' }
] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]['value']

/* ------------------------------------------------------------------ */
/* حالات التوزيع السنوي                                                */
/* ------------------------------------------------------------------ */
export const PLAN_STATUSES = [
  { value: 'not_started', label: 'لم يبدأ' },
  { value: 'in_progress', label: 'قيد الإنجاز' },
  { value: 'done', label: 'منجز' },
  { value: 'late', label: 'متأخر' }
] as const
export type PlanStatus = (typeof PLAN_STATUSES)[number]['value']

/* ------------------------------------------------------------------ */
/* أنواع أحداث المؤسسة                                                 */
/* ------------------------------------------------------------------ */
export const EVENT_TYPES = [
  { value: 'homework', label: 'فرض' },
  { value: 'exam', label: 'اختبار' },
  { value: 'council', label: 'مجلس قسم' },
  { value: 'activity', label: 'نشاط' },
  { value: 'holiday', label: 'عطلة' },
  { value: 'other', label: 'أخرى' }
] as const
export type EventType = (typeof EVENT_TYPES)[number]['value']

/* ------------------------------------------------------------------ */
/* أنواع التقييم — التقويم المستمر                                     */
/* ------------------------------------------------------------------ */
export const CONTINUOUS_KINDS = [
  { value: 'notebook', label: 'الكراس' },
  { value: 'participation', label: 'المشاركة' },
  { value: 'behavior', label: 'السلوك' },
  { value: 'homework', label: 'الوظائف' },
  { value: 'activity', label: 'الأنشطة' }
] as const

/* ------------------------------------------------------------------ */
/* أنواع التقييمات الرسمية                                             */
/* ------------------------------------------------------------------ */
export const ASSESSMENT_TYPES = [
  { value: 'continuous', label: 'تقويم' },
  { value: 'homework', label: 'فرض' },
  { value: 'exam', label: 'اختبار' },
  { value: 'activity', label: 'نشاط' },
  { value: 'project', label: 'مشروع' },
  { value: 'participation', label: 'مشاركة' },
  { value: 'assignment', label: 'واجب' },
  { value: 'other', label: 'أخرى' }
] as const
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number]['value']

/* ------------------------------------------------------------------ */
/* قالب مراحل سير الحصة — قابل للاستعمال وليس إجبارياً                 */
/* ------------------------------------------------------------------ */
export const LESSON_STAGE_TEMPLATE = [
  'التمهيد',
  'الوضعية الانطلاقية',
  'النشاط',
  'المناقشة',
  'الاستنتاج',
  'التطبيق',
  'التقويم',
  'الواجب المنزلي'
] as const

/* ------------------------------------------------------------------ */
/* المستويات الافتراضية                                                */
/* ------------------------------------------------------------------ */
export const DEFAULT_LEVELS = ['السنة الأولى', 'السنة الثانية', 'السنة الثالثة', 'السنة الرابعة']

export const DEFAULT_SUBJECT = 'العلوم الفيزيائية والتكنولوجيا'

/* ------------------------------------------------------------------ */
/* صيغة حساب المعدل الافتراضية — افتراضية فقط وقابلة للتعديل          */
/* التطبيق لا يدّعي أنها صيغة رسمية.                                   */
/* ------------------------------------------------------------------ */
export interface FormulaComponent {
  key: 'continuous' | 'homework' | 'activities' | 'exam'
  label: string
  weight: number
  enabled: boolean
}

export const DEFAULT_FORMULA_COMPONENTS: FormulaComponent[] = [
  { key: 'continuous', label: 'التقويم المستمر', weight: 1, enabled: true },
  { key: 'homework', label: 'الفرض', weight: 1, enabled: true },
  { key: 'activities', label: 'معدل النشاطات', weight: 1, enabled: true },
  { key: 'exam', label: 'الاختبار', weight: 2, enabled: true }
]

export const FORMULA_COMPONENT_LABELS: Record<string, string> = {
  continuous: 'التقويم المستمر',
  homework: 'الفرض',
  activities: 'معدل النشاطات',
  exam: 'الاختبار'
}

/* ------------------------------------------------------------------ */
/* إعدادات عامة                                                        */
/* ------------------------------------------------------------------ */
export const DEFAULT_ACADEMIC_YEAR = '2026 - 2027'
export const SCORE_MAX_DEFAULT = 20
export const GRADEBOOK_ROWS_HINT = 36

/* ------------------------------------------------------------------ */
/* مفاتيح الإعدادات (app_settings)                                     */
/* ------------------------------------------------------------------ */
export const SETTING_KEYS = {
  teacherId: 'teacher_id',
  schoolId: 'school_id',
  activeYearId: 'active_year_id',
  theme: 'theme',
  uiFont: 'ui_font',
  docFont: 'doc_font',
  notificationsEnabled: 'notifications_enabled',
  notificationsLeadMinutes: 'notifications_lead_minutes',
  backupMode: 'backup_mode',
  backupFolder: 'backup_folder',
  lastBackupAt: 'last_backup_at',
  pinHash: 'pin_hash',
  pinSalt: 'pin_salt',
  initialSetupDone: 'initial_setup_done',
  seedDemoData: 'seed_demo_data',
  reportFilter: 'grade_formula_default',
  importLastFile: 'import_last_file',
  /** تكبير واجهة التطبيق: صغير/عادي/كبير — يجعل كل شيء ظاهراً دون تمرير أو أوضح حسب الشاشة */
  uiScale: 'ui_scale'
} as const

/** قيم تكبير الواجهة المسموحة ونسبة كل قيمة على حجم الخط الجذري */
export const UI_SCALES = [
  { value: 'compact', label: 'مضغوط (الأكثر محتوى دون تمرير)', scale: 0.875 },
  { value: 'normal', label: 'عادي', scale: 1 },
  { value: 'large', label: 'كبير (أوضح للقراءة)', scale: 1.125 }
] as const
export type UiScale = (typeof UI_SCALES)[number]['value']
export const UI_SCALE_VALUES = UI_SCALES.map((item) => item.value) as readonly UiScale[]
export function uiScaleOf(value: string | null | undefined): number {
  return UI_SCALES.find((item) => item.value === value)?.scale ?? 1
}

/**
 * ملف استيراد التلاميذ الافتراضي.
 * يُبحث عنه في مجلد «التنزيلات» عندما لا يكون هناك ملف سابق محفوظ،
 * حتى يفتح معالج الاستيراد جاهزاً دون الحاجة لاختيار الملف في كل مرة.
 */
export const DEFAULT_IMPORT_FILE_NAME = 'أفواجي التربوية.xlsx'

/** امتدادات ملفات التلاميذ المدعومة */
export const IMPORT_FILE_EXTENSIONS = ['csv', 'xlsx', 'xls'] as const
