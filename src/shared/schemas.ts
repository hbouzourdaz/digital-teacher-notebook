import { z } from 'zod'
import { isValidISODate, isValidTime } from './utils/date'
import { PRINT_DOCUMENTS } from './print'

/**
 * مخططات التحقق (Zod) — تُطبَّق على كل مدخلات IPC قبل الوصول إلى قاعدة البيانات.
 * لا يمكن للـ renderer إرسال SQL ولا حقول غير مصرّح بها.
 */

export const isoDate = z.string().refine(isValidISODate, { message: 'تاريخ غير صالح (YYYY-MM-DD)' })
export const timeHHmm = z.string().refine(isValidTime, { message: 'وقت غير صالح (HH:mm)' })
export const id = z.number().int().positive()
export const optionalId = id.nullable().optional()
export const optText = (max = 4000): z.ZodOptional<z.ZodNullable<z.ZodString>> => z.string().max(max).nullish()
export const term = z.union([z.literal(1), z.literal(2), z.literal(3)])
export const score = z.number().min(0).max(1000)
/** تواريخ اختيارية في المرشّحات */
export const optionalDate = isoDate.optional()
export const optionalTerm = term.optional()
export const textRecord = z.record(z.string())
export const limitSchema = z.number().int().min(1).max(2000).optional()

export const academicYearSchema = z.object({
  label: z.string().min(1, 'عنوان السنة الدراسية مطلوب').max(60),
  start_date: isoDate,
  end_date: isoDate
})

export const teacherSchema = z.object({
  full_name: z.string().min(1, 'اسم الأستاذ مطلوب').max(120),
  subject_label: optText(120),
  phone: optText(40),
  email: z.string().max(200).nullish(),
  notes: optText()
})

export const schoolSchema = z.object({
  name: z.string().min(1, 'اسم المؤسسة مطلوب').max(160),
  stage: optText(80),
  wilaya: optText(80),
  municipality: optText(80),
  logo_path: optText(500)
})

export const subjectSchema = z.object({
  name: z.string().min(1, 'اسم المادة مطلوب').max(120),
  code: optText(40),
  notes: optText(),
  sort_order: z.number().int().min(0).default(0),
  is_active: z.union([z.literal(0), z.literal(1)]).default(1)
})

export const levelSchema = z.object({
  name: z.string().min(1).max(80),
  order_index: z.number().int().min(0).default(0)
})

export const classSchema = z.object({
  academic_year_id: id,
  name: z.string().min(1, 'اسم القسم مطلوب').max(80),
  level_id: optionalId,
  stream: optText(80),
  subject_id: optionalId,
  notes: optText(),
  sort_order: z.number().int().min(0).default(0)
})

export const studentSchema = z.object({
  academic_year_id: id,
  class_id: optionalId,
  number: z.number().int().min(0).max(9999).nullable().optional(),
  first_name: z.string().min(1, 'الاسم مطلوب').max(80),
  last_name: z.string().min(1, 'اللقب مطلوب').max(80),
  gender: z.enum(['male', 'female']).nullish(),
  birth_date: isoDate.nullish(),
  guardian_phone: optText(40),
  notes: optText(),
  archived: z.union([z.literal(0), z.literal(1)]).default(0),
  sort_order: z.number().int().min(0).default(0)
})

export const studentReorderSchema = z.object({
  class_id: id,
  orderedIds: z.array(id).min(1)
})

export const studentTransferSchema = z.object({
  student_id: id,
  to_class_id: id,
  note: optText(),
  date: isoDate.optional()
})

export const scheduleSlotSchema = z.object({
  academic_year_id: id,
  day_of_week: z.number().int().min(0).max(6),
  start_time: timeHHmm,
  end_time: timeHHmm,
  class_id: id,
  subject_id: optionalId,
  session_type: z.string().min(1).max(40),
  room: optText(60),
  notes: optText()
})

export const scheduleMoveSchema = z.object({
  id,
  day_of_week: z.number().int().min(0).max(6),
  start_time: timeHHmm,
  end_time: timeHHmm
})

export const lessonSchema = z.object({
  academic_year_id: id,
  schedule_id: optionalId,
  date: isoDate,
  start_time: timeHHmm,
  end_time: timeHHmm,
  class_id: id,
  subject_id: optionalId,
  session_type: z.string().min(1).max(40),
  title: z.string().max(300).default(''),
  stages: z.string().max(20000).default(''),
  notes: z.string().max(8000).default(''),
  annual_plan_id: optionalId,
  lesson_bank_id: optionalId,
  status: z.enum(['draft', 'recorded']).default('draft')
})

export const attendanceSaveSchema = z.object({
  academic_year_id: id,
  daily_lesson_id: id,
  class_id: id,
  date: isoDate,
  entries: z
    .array(
      z.object({
        student_id: id,
        status: z.enum(['present', 'absent', 'late', 'excused']),
        note: optText(300)
      })
    )
    .max(1000)
})

export const categorySchema = z.object({
  academic_year_id: id,
  name: z.string().min(1).max(80),
  kind: z.string().min(1).max(40),
  max_default: score.default(20),
  weight: z.number().min(0).max(100).default(1),
  order_index: z.number().int().min(0).default(0),
  is_active: z.union([z.literal(0), z.literal(1)]).default(1)
})

export const assessmentSchema = z.object({
  academic_year_id: id,
  class_id: id,
  subject_id: optionalId,
  category_id: optionalId,
  name: z.string().min(1, 'اسم التقييم مطلوب').max(160),
  type: z.string().min(1).max(40),
  term,
  date: isoDate,
  max_score: score.default(20),
  weight: z.number().min(0).max(100).default(1),
  daily_lesson_id: optionalId,
  notes: optText()
})

export const assessmentCopySchema = z.object({
  from_assessment_id: id,
  name: z.string().min(1).max(160),
  date: isoDate,
  term: term.optional(),
  overwrite: z.boolean().default(false)
})

export const scoreSaveSchema = z.object({
  assessment_id: id,
  max_score: score,
  entries: z.array(z.object({ student_id: id, score: score.nullable(), note: optText(200) })).max(2000)
})

export const continuousSaveSchema = z.object({
  academic_year_id: id,
  class_id: id,
  term,
  kind: z.string().min(1).max(40),
  entries: z.array(z.object({ student_id: id, value: score.nullable() })).max(2000)
})

export const formulaSchema = z.object({
  academic_year_id: optionalId,
  name: z.string().min(1).max(120).default('صيغة المستخدم'),
  components: z
    .array(
      z.object({
        key: z.enum(['continuous', 'homework', 'activities', 'exam']),
        label: z.string().min(1).max(60),
        weight: z.number().min(0).max(100),
        enabled: z.boolean()
      })
    )
    .min(1),
  rounding: z.number().int().min(0).max(3).default(2)
})

export const planSchema = z.object({
  academic_year_id: id,
  level_id: optionalId,
  subject_id: optionalId,
  term,
  domain: optText(160),
  unit: optText(160),
  lesson_title: z.string().min(1, 'عنوان الدرس مطلوب').max(300),
  sessions_count: z.number().int().min(0).max(200).default(1),
  status: z.enum(['not_started', 'in_progress', 'done', 'late']).default('not_started'),
  expected_date: isoDate.nullish(),
  completed_date: isoDate.nullish(),
  notes: optText()
})

export const lessonBankSchema = z.object({
  academic_year_id: id,
  title: z.string().min(1, 'عنوان الدرس مطلوب').max(300),
  level_id: optionalId,
  subject_id: optionalId,
  domain: optText(160),
  unit: optText(160),
  duration: optText(60),
  objectives: z.string().max(8000).default(''),
  stages: z.string().max(20000).default(''),
  notes: z.string().max(8000).default('')
})

export const eventSchema = z.object({
  academic_year_id: id,
  type: z.enum(['homework', 'exam', 'council', 'activity', 'holiday', 'other']),
  term,
  title: z.string().min(1, 'عنوان الحدث مطلوب').max(200),
  date: isoDate,
  class_id: optionalId,
  subject_id: optionalId,
  notes: optText()
})

export const noteSchema = z.object({
  owner_type: z.enum(['student', 'class', 'lesson', 'lesson_bank', 'assessment', 'year']),
  owner_id: id,
  body: z.string().min(1, 'الملاحظة فارغة').max(8000)
})

export const attachmentSchema = z.object({
  owner_type: z.enum(['student', 'class', 'lesson', 'lesson_bank', 'assessment', 'year']),
  owner_id: id,
  file_path: z.string().min(1).max(1000)
})

export const printSettingsSchema = z.object({
  scope: z.string().min(1).max(60).default('default'),
  header_text: optText(200),
  footer_text: optText(200),
  paper: z.enum(['A4']).default('A4'),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  margin_mm: z.number().min(5).max(40).default(12),
  font_size: z.number().min(8).max(20).default(12),
  font_family: z.string().min(1).max(80).default('Amiri'),
  show_logo: z.union([z.literal(0), z.literal(1)]).default(1),
  logo_path: optText(500)
})

export const printDocumentSchema = z.object({
  document: z.enum(PRINT_DOCUMENTS),
  options: z
    .object({
      academic_year_id: id.optional(),
      class_id: optionalId,
      student_id: optionalId,
      subject_id: optionalId,
      term: term.optional(),
      date: isoDate.optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
      title: z.string().max(160).optional(),
      /** نطاق إعدادات الطباعة (مثل «daily-notebook») — يسبق النطاق العام */
      scope: z.string().min(1).max(60).optional(),
      /** عتبة التمييز اللوني في الوثائق (أخضر/أحمر) */
      passing_threshold: score.optional(),
      /** ورقة غلاف في أول الوثيقة */
      cover: z.boolean().default(true),
      /** ترقيم الصفحات «صفحة X من Y» */
      page_numbers: z.boolean().default(true),
      /** طبع مدى صفحات فقط (بترقيم الوثيقة الكاملة) */
      page_from: z.number().int().min(1).max(9999).nullable().optional(),
      page_to: z.number().int().min(1).max(9999).nullable().optional(),
      includeHeader: z.boolean().default(true)
    })
    .default({ includeHeader: true })
})

export const exportSchema = z.object({
  kind: z.enum(['students', 'classes', 'grades', 'attendance', 'assessments', 'schedule', 'lesson_bank', 'annual_plan']),
  format: z.enum(['csv', 'json']),
  academic_year_id: id.optional(),
  class_id: optionalId
})

export const importSchema = z.object({
  academic_year_id: id,
  /** قسم افتراضي للأسطر التي لا تحمل عمود قسم */
  class_id: optionalId,
  rows: z.array(
    z.object({
      first_name: z.string().min(1).max(80),
      last_name: z.string().min(1).max(80),
      number: z.number().int().min(0).max(9999).nullable(),
      gender: z.enum(['male', 'female']).nullable(),
      birth_date: optText(20),
      notes: optText(400),
      /** اسم القسم/الفوج كما ورد في الملف (للاستيراد متعدد الأقسام) */
      class_name: optText(120)
    })
  ),
  skipDuplicates: z.boolean().default(true),
  /** إنشاء الأقسام غير الموجودة تلقائياً بدل تخطي أسطرها */
  createMissingClasses: z.boolean().default(true)
})

export const backupCreateSchema = z.object({
  kind: z.enum(['manual', 'auto', 'pre-migration', 'pre-import']).default('manual'),
  note: optText(200)
})

export const backupRestoreSchema = z.object({
  file_path: z.string().min(1).max(1000)
})

export const backupSettingsSchema = z.object({
  mode: z.enum(['off', 'daily', 'weekly']),
  folder: z.string().max(1000).nullish()
})

export const appSettingSchema = z.object({
  key: z.string().min(1).max(80),
  value: z.string().max(20000)
})

export const pinSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, 'الرمز يجب أن يكون من 4 إلى 8 أرقام')
})

export const searchSchema = z.object({ query: z.string().min(1).max(120) })

/** يُستقبل معرّف مفرد؛ بعض الشاشات ترسل { id } مباشرة وبعضها رقماً */
export const idOnly = z.object({ id })
export const idArg = z.union([idOnly, id])
export const yearScoped = z.object({ academic_year_id: id.optional(), class_id: optionalId, term: term.optional() })
export const studentHistorySchema = z.object({ student_id: id, term: term.optional() })
export const classStatsSchema = z.object({ class_id: id, term: term.optional(), passing_threshold: z.number().min(0).max(20).default(10) })
export const gradebookSchema = z.object({
  class_id: id,
  term,
  passing_threshold: z.number().min(0).max(20).default(10)
})

export type AcademicYearInput = z.infer<typeof academicYearSchema>
export type TeacherInput = z.infer<typeof teacherSchema>
export type SchoolInput = z.infer<typeof schoolSchema>
export type SubjectInput = z.infer<typeof subjectSchema>
export type LevelInput = z.infer<typeof levelSchema>
export type ClassInput = z.infer<typeof classSchema>
export type StudentInput = z.infer<typeof studentSchema>
export type StudentTransferInput = z.infer<typeof studentTransferSchema>
export type ScheduleSlotInput = z.infer<typeof scheduleSlotSchema>
export type LessonInput = z.infer<typeof lessonSchema>
export type AttendanceSaveInput = z.infer<typeof attendanceSaveSchema>
export type CategoryInput = z.infer<typeof categorySchema>
export type AssessmentInput = z.infer<typeof assessmentSchema>
export type ScoreSaveInput = z.infer<typeof scoreSaveSchema>
export type ContinuousSaveInput = z.infer<typeof continuousSaveSchema>
export type FormulaInput = z.infer<typeof formulaSchema>
export type PlanInput = z.infer<typeof planSchema>
export type LessonBankInput = z.infer<typeof lessonBankSchema>
export type EventInput = z.infer<typeof eventSchema>
export type NoteInput = z.infer<typeof noteSchema>
export type AttachmentInput = z.infer<typeof attachmentSchema>
export type PrintSettingsInput = z.infer<typeof printSettingsSchema>
/**
 * نوع الطلب كما ترسله الواجهة: الخيارات اختيارية (الافتراضي: غلاف + ترقيم +
 * رأس)، والمُحلِّل في العملية الرئيسية يكملها قبل الاستعمال.
 */
export type PrintDocumentInput = z.input<typeof printDocumentSchema>
export type ExportInput = z.infer<typeof exportSchema>
export type ImportInput = z.infer<typeof importSchema>
export type BackupSettingsInput = z.infer<typeof backupSettingsSchema>
