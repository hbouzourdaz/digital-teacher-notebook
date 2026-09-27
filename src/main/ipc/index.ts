import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { z, ZodError, type ZodTypeAny } from 'zod'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { IPC, IPC_EVENTS } from '@shared/ipc'
import {
  academicYearSchema,
  assessmentCopySchema,
  assessmentSchema,
  attendanceSaveSchema,
  backupCreateSchema,
  backupRestoreSchema,
  backupSettingsSchema,
  categorySchema,
  classSchema,
  continuousSaveSchema,
  eventSchema,
  formulaSchema,
  id as zId,
  importSchema,
  isoDate,
  lessonBankSchema,
  lessonSchema,
  levelSchema,
  limitSchema,
  noteSchema,
  optionalDate,
  optionalId,
  optionalTerm,
  planSchema,
  printDocumentSchema,
  printSettingsSchema,
  scheduleMoveSchema,
  scheduleSlotSchema,
  schoolSchema,
  scoreSaveSchema,
  searchSchema,
  studentReorderSchema,
  studentSchema,
  studentTransferSchema,
  subjectSchema,
  teacherSchema,
  term as zTerm,
  textRecord
} from '@shared/schemas'
import type { PrintDocumentInput } from '@shared/schemas'
import { humanizeError } from '@shared/utils/misc'
import { audit, count, one, resolveYear } from '../repositories/base'
import * as years from '../repositories/years'
import * as org from '../repositories/org'
import * as settings from '../repositories/settings'
import * as classes from '../repositories/classes'
import * as students from '../repositories/students'
import * as schedule from '../repositories/schedule'
import * as lessons from '../repositories/lessons'
import * as attendance from '../repositories/attendance'
import * as assessments from '../repositories/assessments'
import * as grades from '../repositories/grades'
import * as plan from '../repositories/plan'
import * as events from '../repositories/events'
import * as auditRepo from '../repositories/audit'
import * as backup from '../backup/service'
import * as dashboard from '../services/dashboardService'
import * as search from '../services/searchService'
import * as exportService from '../services/exportService'
import { buildDocument } from '../printing/documents'
import { buildSheets, type PaginateRequest } from '../printing/render'
import { htmlToPdf, htmlToPrinter } from '../printing/pdf'
import { getPaths } from '../filesystem/paths'
import { readTabularFile, writeTextFile } from '../filesystem/studentFiles'
import { getLogFile, log, readLogs } from '../logger'
import { DEFAULT_IMPORT_FILE_NAME, SETTING_KEYS } from '@shared/constants'
import { gradebook, computeClassGrades, studentAssessmentScores, overallAverage } from '../services/gradeService'
import { seedDemoData } from '../services/demoSeed'

const registered = new Set<string>()

/**
 * ملف استيراد التلاميذ الافتراضي: آخر ملف استعمله الأستاذ، وإلا الملف
 * المتعارف عليه في مجلد «التنزيلات» — حتى يفتح المعالج جاهزاً.
 */
function resolveDefaultImportFile(): string | null {
  const saved = settings.getSetting(SETTING_KEYS.importLastFile)
  if (saved && existsSync(saved)) return saved
  const candidate = join(app.getPath('downloads'), DEFAULT_IMPORT_FILE_NAME)
  return existsSync(candidate) ? candidate : null
}

/** كل قناة تُسجَّل مرة واحدة مع تحقق Zod ورسائل خطأ عربية */
function handle<S extends ZodTypeAny, R>(
  channel: string,
  schema: S | null,
  handler: (payload: S extends ZodTypeAny ? z.infer<S> : undefined) => R | Promise<R>
): void {
  if (registered.has(channel)) throw new Error(`القناة مسجّلة مسبقاً: ${channel}`)
  registered.add(channel)
  ipcMain.handle(channel, async (_event, raw: unknown) => {
    try {
      const payload = schema ? (schema.parse(raw) as never) : (undefined as never)
      return await handler(payload)
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.issues[0]?.message ?? 'بيانات غير صالحة.'
        log('WARN', `تحقق IPC فشل في ${channel}`, error.issues)
        throw new Error(message)
      }
      log('ERROR', `فشل تنفيذ ${channel}`, error instanceof Error ? error.stack ?? error.message : String(error))
      throw new Error(humanizeError(error))
    }
  })
}

export function registeredChannels(): string[] {
  return [...registered]
}

const withId = <T extends z.ZodObject<z.ZodRawShape>>(schema: T): z.ZodObject<z.ZodRawShape> =>
  schema.extend({ id: zId }) as unknown as z.ZodObject<z.ZodRawShape>

const yearFilter = z.object({ academic_year_id: optionalId })

/**
 * إعدادات تركيب الأوراق المرقّمة — مصدرها خيارات الوثيقة نفسها، فما تراه في
 * المعاينة هو ما يخرج من الطابعة أو ملف PDF حرفياً.
 */
function sheetRequest(payload: PrintDocumentInput): PaginateRequest {
  const options = payload.options
  return {
    cover: options?.cover !== false,
    pageNumbers: options?.page_numbers !== false,
    pageFrom: options?.page_from ?? null,
    pageTo: options?.page_to ?? null,
    showFullHeader: options?.includeHeader !== false
  }
}
const classFilter = z.object({ class_id: optionalId })
const dateRange = z.object({ from: optionalDate, to: optionalDate })

export function registerIpc(): void {
  registered.clear()

  /* ------------------------------- التطبيق ------------------------------ */
  handle(IPC.app.info, null, () => {
    const paths = getPaths()
    return {
      name: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      isDev: !app.isPackaged,
      paths
    }
  })
  handle(IPC.app.quit, null, () => {
    setTimeout(() => app.quit(), 120)
  })
  handle(IPC.app.reloadData, null, () => {
    for (const win of BrowserWindow.getAllWindows()) win.reload()
    return true
  })

  /* ------------------------------- الحوارات ----------------------------- */
  handle(
    IPC.dialogs.pickFile,
    z
      .object({
        filters: z.array(z.string()).optional(),
        title: z.string().max(200).optional(),
        defaultPath: z.string().max(1000).optional()
      })
      .default({}),
    async (payload) => {
      const filters = payload?.filters?.length
        ? [{ name: 'ملفات مدعومة', extensions: payload.filters.map((f) => f.replace(/^\./, '')) }]
        : [{ name: 'كل الملفات', extensions: ['*'] }]
      const result = await dialog.showOpenDialog({
        title: payload?.title ?? 'اختيار ملف',
        properties: ['openFile'],
        defaultPath: payload?.defaultPath,
        filters
      })
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
    }
  )
  handle(IPC.dialogs.pickDirectory, z.object({ title: z.string().max(200).optional() }).default({}), async (payload) => {
    const result = await dialog.showOpenDialog({
      title: payload?.title ?? 'اختيار مجلد',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })
  handle(
    IPC.dialogs.saveFile,
    z
      .object({
        defaultPath: z.string().max(1000).optional(),
        filters: z.array(z.object({ name: z.string(), extensions: z.array(z.string()) })).optional()
      })
      .default({}),
    async (payload) => {
      const result = await dialog.showSaveDialog({
        defaultPath: payload?.defaultPath,
        filters: payload?.filters ?? [{ name: 'كل الملفات', extensions: ['*'] }]
      })
      return result.canceled || !result.filePath ? null : result.filePath
    }
  )
  handle(
    IPC.dialogs.confirm,
    z.object({
      title: z.string().max(200),
      message: z.string().max(2000),
      detail: z.string().max(4000).optional(),
      confirmLabel: z.string().max(60).optional()
    }),
    async (payload) => {
      const result = await dialog.showMessageBox({
        type: 'warning',
        buttons: [payload.confirmLabel ?? 'تأكيد', 'إلغاء'],
        defaultId: 1,
        cancelId: 1,
        title: payload.title,
        message: payload.message,
        detail: payload.detail
      })
      return result.response === 0
    }
  )

  /* ------------------------------ الإعدادات ----------------------------- */
  handle(IPC.settings.all, null, () => settings.allSettings())
  handle(IPC.settings.get, z.object({ key: z.string().min(1).max(80) }), (payload) => settings.getSetting(payload.key))
  handle(IPC.settings.set, z.object({ key: z.string().min(1).max(80), value: z.string().max(20000) }), (payload) => {
    settings.setSetting(payload.key, payload.value)
    return true
  })
  handle(IPC.settings.setMany, textRecord, (payload) => {
    settings.setManySettings(payload)
    return true
  })

  /* ---------------------------- السنوات الدراسية ------------------------ */
  handle(IPC.years.list, null, () => years.listYears())
  handle(IPC.years.create, academicYearSchema, (payload) => years.createYear(payload))
  handle(IPC.years.update, withId(academicYearSchema), (payload) => years.updateYear(payload as never))
  handle(IPC.years.remove, z.object({ id: zId }), (payload) => years.removeYear(payload.id))
  handle(IPC.years.activate, z.object({ id: zId }), (payload) => years.activateYear(payload.id))
  handle(IPC.years.archive, z.object({ id: zId, archived: z.boolean() }), (payload) =>
    years.archiveYear(payload.id, payload.archived)
  )
  handle(
    IPC.years.clone,
    z.object({
      id: zId,
      label: z.string().min(1).max(60),
      start_date: isoDate,
      end_date: isoDate,
      copy: z.object({
        classes: z.boolean(),
        schedule: z.boolean(),
        bank: z.boolean(),
        plan: z.boolean(),
        settings: z.boolean()
      })
    }),
    (payload) => years.cloneYear(payload.id, payload)
  )

  /* ----------------------- الأستاذ والمؤسسة والمواد --------------------- */
  handle(IPC.teacher.get, null, () => org.getTeacher())
  handle(IPC.teacher.save, teacherSchema, (payload) => org.saveTeacher(payload))
  handle(IPC.school.get, null, () => org.getSchool())
  handle(IPC.school.save, schoolSchema, (payload) => org.saveSchool(payload))
  handle(IPC.subjects.list, null, () => org.listSubjects())
  handle(IPC.subjects.create, subjectSchema, (payload) => org.createSubject(payload))
  handle(IPC.subjects.update, withId(subjectSchema), (payload) => org.updateSubject(payload as never))
  handle(IPC.subjects.remove, z.object({ id: zId }), (payload) => org.removeSubject(payload.id))
  handle(IPC.levels.list, null, () => org.listLevels())
  handle(IPC.levels.create, levelSchema, (payload) => org.createLevel(payload))
  handle(IPC.levels.update, withId(levelSchema), (payload) => org.updateLevel(payload as never))
  handle(IPC.levels.remove, z.object({ id: zId }), (payload) => org.removeLevel(payload.id))

  /* ---------------------------- الإعداد الأولي -------------------------- */
  handle(IPC.setup.status, null, () => {
    const yearId = count('SELECT COUNT(*) AS c FROM academic_years') > 0 ? resolveYear() : 0
    const steps = {
      teacher: org.getTeacher() !== null,
      school: org.getSchool() !== null,
      year: yearId > 0,
      subject: org.listSubjects().length > 0,
      classes: yearId > 0 && count('SELECT COUNT(*) AS c FROM classes WHERE academic_year_id = ?', [yearId]) > 0,
      students: yearId > 0 && count('SELECT COUNT(*) AS c FROM students WHERE academic_year_id = ?', [yearId]) > 0,
      schedule: yearId > 0 && count('SELECT COUNT(*) AS c FROM weekly_schedule WHERE academic_year_id = ?', [yearId]) > 0
    }
    return {
      completed: settings.getSetting(SETTING_KEYS.initialSetupDone) === '1',
      steps,
      hasData: count('SELECT COUNT(*) AS c FROM academic_years') > 0
    }
  })
  handle(IPC.setup.complete, z.object({ completed: z.boolean() }), (payload) => {
    settings.setSetting(SETTING_KEYS.initialSetupDone, payload.completed ? '1' : '0')
    return true
  })

  /* ------------------------------- الأقسام ------------------------------ */
  handle(IPC.classes.list, yearFilter.default({}), (payload) => classes.listClasses(payload ?? {}))
  handle(IPC.classes.create, classSchema, (payload) => classes.createClass(payload))
  handle(IPC.classes.update, withId(classSchema), (payload) => classes.updateClass(payload as never))
  handle(IPC.classes.remove, z.object({ id: zId }), (payload) => classes.removeClass(payload.id))
  handle(
    IPC.classes.stats,
    z.object({ class_id: zId, term: optionalTerm, passing_threshold: z.number().min(0).max(20).default(10) }),
    (payload) => classes.classStats(payload.class_id, payload.term, payload.passing_threshold)
  )
  handle(
    IPC.classes.clone,
    z.object({ id: zId, name: z.string().min(1).max(80), copyStudents: z.boolean() }),
    (payload) => classes.cloneClass(payload.id, payload.name, payload.copyStudents)
  )
  handle(IPC.classes.report, z.object({ class_id: zId, term: optionalTerm }), (payload) => {
    const classRow = classes.getClass(payload.class_id)
    const term = payload.term ?? 1
    return {
      classRow,
      students: students.listStudents({ academic_year_id: classRow?.academic_year_id, class_id: payload.class_id }),
      stats: classes.classStats(payload.class_id, payload.term),
      lessons: lessons.lessonsByClass(payload.class_id, 200),
      assessments: assessments.listAssessments({
        academic_year_id: classRow?.academic_year_id,
        class_id: payload.class_id,
        term: payload.term
      }),
      events: events.listEvents({ academic_year_id: classRow?.academic_year_id, term }),
      grades: computeClassGrades(payload.class_id, term)
    }
  })

  /* ------------------------------ التلاميذ ------------------------------ */
  handle(
    IPC.students.list,
    z
      .object({
        academic_year_id: optionalId,
        class_id: optionalId,
        search: z.string().max(120).optional(),
        archived: z.boolean().optional()
      })
      .default({}),
    (payload) => students.listStudents(payload ?? {})
  )
  handle(IPC.students.create, studentSchema.extend({ force: z.boolean().optional() }), (payload) =>
    students.createStudent(payload as never)
  )
  handle(IPC.students.update, withId(studentSchema), (payload) => students.updateStudent(payload as never))
  handle(IPC.students.remove, z.object({ id: zId }), (payload) => students.removeStudent(payload.id))
  handle(IPC.students.reorder, studentReorderSchema, (payload) =>
    students.reorderStudents(payload.class_id, payload.orderedIds)
  )
  handle(IPC.students.transfer, studentTransferSchema, (payload) => students.transferStudent(payload))
  handle(IPC.students.history, z.object({ student_id: zId, term: optionalTerm }), (payload) =>
    students.studentHistory(payload.student_id, payload.term)
  )
  handle(IPC.students.importRows, importSchema, (payload) =>
    students.importStudents(payload.academic_year_id, payload.class_id ?? null, payload.rows, payload.skipDuplicates, {
      createMissingClasses: payload.createMissingClasses
    })
  )
  handle(IPC.students.defaultImportFile, null, () => {
    const path = resolveDefaultImportFile()
    return { path, exists: path !== null }
  })
  handle(
    IPC.students.importFile,
    z.object({
      academic_year_id: zId,
      class_id: optionalId,
      file_path: z.string().min(1).max(1000),
      skipDuplicates: z.boolean()
    }),
    (payload) => {
      if (!existsSync(payload.file_path)) throw new Error('الملف المحدَّد غير موجود.')
      const parsed = readTabularFile(payload.file_path)
      settings.setSetting(SETTING_KEYS.importLastFile, payload.file_path)
      return parsed
    }
  )
  handle(IPC.students.exportFile, yearFilter.merge(classFilter).default({}), async (payload) => {
    const result = await dialog.showSaveDialog({
      title: 'تصدير قائمة التلاميذ',
      defaultPath: 'قائمة_التلاميذ.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return null
    const csv = students.studentsToCSV(payload?.academic_year_id, payload?.class_id ?? null)
    writeTextFile(result.filePath, csv.csv)
    audit('تصدير قائمة تلاميذ', 'students', null, result.filePath)
    return result.filePath
  })

  /* ---------------------------- الجدول الأسبوعي ------------------------- */
  handle(IPC.schedule.list, yearFilter.merge(classFilter).default({}), (payload) => schedule.listSchedule(payload ?? {}))
  handle(IPC.schedule.create, scheduleSlotSchema.extend({ allowConflict: z.boolean().optional() }), (payload) =>
    schedule.createSlot(payload as never)
  )
  handle(
    IPC.schedule.update,
    scheduleSlotSchema.extend({ id: zId, allowConflict: z.boolean().optional() }),
    (payload) => schedule.updateSlot(payload as never)
  )
  handle(IPC.schedule.remove, z.object({ id: zId }), (payload) => schedule.removeSlot(payload.id))
  handle(IPC.schedule.move, scheduleMoveSchema.extend({ allowConflict: z.boolean().optional() }), (payload) =>
    schedule.moveSlot(payload)
  )
  handle(IPC.schedule.conflicts, yearFilter.default({}), (payload) => schedule.listConflicts(payload?.academic_year_id))

  /* ---------------------------- الدفتر اليومي --------------------------- */
  handle(
    IPC.lessons.list,
    z
      .object({
        academic_year_id: optionalId,
        class_id: optionalId,
        from: optionalDate,
        to: optionalDate,
        date: optionalDate,
        search: z.string().max(200).optional(),
        limit: limitSchema,
        offset: z.number().int().min(0).optional()
      })
      .default({}),
    (payload) => lessons.listLessons(payload ?? {})
  )
  handle(IPC.lessons.get, z.object({ id: zId }), (payload) => lessons.getLesson(payload.id))
  handle(IPC.lessons.create, lessonSchema, (payload) => lessons.createLesson(payload))
  handle(IPC.lessons.update, withId(lessonSchema), (payload) => lessons.updateLesson(payload as never))
  handle(IPC.lessons.remove, z.object({ id: zId }), (payload) => lessons.removeLesson(payload.id))
  handle(IPC.lessons.search, z.object({ query: z.string().min(1).max(200), academic_year_id: optionalId }), (payload) =>
    lessons.searchLessons(payload.query, payload.academic_year_id)
  )
  handle(
    IPC.lessons.ensureForSlot,
    z.object({ academic_year_id: zId, schedule_id: zId, date: isoDate }),
    (payload) => lessons.ensureLessonForSlot(payload)
  )
  handle(IPC.lessons.byClass, z.object({ class_id: zId, limit: limitSchema }), (payload) =>
    lessons.lessonsByClass(payload.class_id, payload.limit ?? 100)
  )

  /* -------------------------------- الحضور ------------------------------ */
  handle(IPC.attendance.forLesson, z.object({ daily_lesson_id: zId }), (payload) =>
    attendance.attendanceForLesson(payload.daily_lesson_id)
  )
  handle(IPC.attendance.save, attendanceSaveSchema, (payload) => attendance.saveAttendance(payload))
  handle(IPC.attendance.summary, yearFilter.merge(classFilter).merge(dateRange).default({}), (payload) =>
    attendance.attendanceSummary(payload ?? {})
  )
  handle(IPC.attendance.forClass, z.object({ class_id: zId }).merge(dateRange), (payload) =>
    attendance.attendanceForClass(payload.class_id, payload.from, payload.to)
  )

  /* ------------------------------ التقييمات ----------------------------- */
  handle(IPC.categories.list, yearFilter.default({}), (payload) => assessments.listCategories(payload?.academic_year_id))
  handle(IPC.categories.create, categorySchema, (payload) => assessments.createCategory(payload))
  handle(IPC.categories.update, withId(categorySchema), (payload) => assessments.updateCategory(payload as never))
  handle(IPC.categories.remove, z.object({ id: zId }), (payload) => assessments.removeCategory(payload.id))
  handle(
    IPC.assessments.list,
    z
      .object({
        academic_year_id: optionalId,
        class_id: optionalId,
        term: optionalTerm,
        type: z.string().max(40).optional()
      })
      .default({}),
    (payload) => assessments.listAssessments(payload ?? {})
  )
  handle(IPC.assessments.create, assessmentSchema, (payload) => assessments.createAssessment(payload))
  handle(IPC.assessments.update, withId(assessmentSchema), (payload) => assessments.updateAssessment(payload as never))
  handle(IPC.assessments.remove, z.object({ id: zId }), (payload) => assessments.removeAssessment(payload.id))
  handle(IPC.assessments.copy, assessmentCopySchema, (payload) => assessments.copyAssessment(payload))
  handle(IPC.assessments.scores, z.object({ assessment_id: zId }), (payload) =>
    assessments.assessmentScores(payload.assessment_id)
  )
  handle(IPC.assessments.saveScores, scoreSaveSchema, (payload) => assessments.saveScores(payload))
  handle(
    IPC.continuous.list,
    z.object({ class_id: zId, term: zTerm, academic_year_id: optionalId }),
    (payload) => assessments.listContinuous(payload.class_id, payload.term, payload.academic_year_id)
  )
  handle(IPC.continuous.save, continuousSaveSchema, (payload) => assessments.saveContinuous(payload))

  /* ------------------------- صيغة المعدل والنقاط ------------------------ */
  handle(IPC.formulas.get, yearFilter.default({}), (payload) => grades.getFormula(payload?.academic_year_id))
  handle(IPC.formulas.save, formulaSchema.extend({ id: zId.optional() }), (payload) => grades.saveFormula(payload as never))
  handle(
    IPC.grades.gradebook,
    z.object({ class_id: zId, term: zTerm, passing_threshold: z.number().min(0).max(20).default(10) }),
    (payload) => gradebook(payload.class_id, payload.term, payload.passing_threshold)
  )
  handle(IPC.grades.compute, z.object({ class_id: zId, term: zTerm }), (payload) =>
    computeClassGrades(payload.class_id, payload.term)
  )
  handle(IPC.grades.studentDetail, z.object({ student_id: zId, term: optionalTerm }), (payload) => ({
    grades: grades.gradesForStudent(payload.student_id, payload.term),
    continuous: students.studentHistory(payload.student_id, payload.term).continuous,
    scores: studentAssessmentScores(payload.student_id, payload.term),
    overall: overallAverage(payload.student_id)
  }))

  /* ---------------------------- التوزيع السنوي -------------------------- */
  handle(
    IPC.plan.list,
    z.object({ academic_year_id: optionalId, level_id: optionalId, subject_id: optionalId, term: optionalTerm }).default({}),
    (payload) => plan.listPlan(payload ?? {})
  )
  handle(IPC.plan.create, planSchema, (payload) => plan.createPlanItem(payload))
  handle(IPC.plan.update, withId(planSchema), (payload) => plan.updatePlanItem(payload as never))
  handle(IPC.plan.remove, z.object({ id: zId }), (payload) => plan.removePlanItem(payload.id))
  handle(IPC.plan.progress, yearFilter.default({}), (payload) => plan.planProgress(payload?.academic_year_id))

  /* ----------------------------- بنك الدروس ----------------------------- */
  handle(
    IPC.bank.list,
    z
      .object({ academic_year_id: optionalId, level_id: optionalId, search: z.string().max(200).optional() })
      .default({}),
    (payload) => plan.listBank(payload ?? {})
  )
  handle(IPC.bank.create, lessonBankSchema, (payload) => plan.createBankItem(payload))
  handle(IPC.bank.update, withId(lessonBankSchema), (payload) => plan.updateBankItem(payload as never))
  handle(IPC.bank.remove, z.object({ id: zId }), (payload) => plan.removeBankItem(payload.id))

  /* ------------------------- الأحداث والتقويم --------------------------- */
  handle(
    IPC.events.list,
    z
      .object({ academic_year_id: optionalId, from: optionalDate, to: optionalDate, term: optionalTerm, type: z.string().max(40).optional() })
      .default({}),
    (payload) => events.listEvents(payload ?? {})
  )
  handle(IPC.events.create, eventSchema, (payload) => events.createEvent(payload))
  handle(IPC.events.update, withId(eventSchema), (payload) => events.updateEvent(payload as never))
  handle(IPC.events.remove, z.object({ id: zId }), (payload) => events.removeEvent(payload.id))
  handle(IPC.events.calendar, z.object({ from: isoDate, to: isoDate, academic_year_id: optionalId }), (payload) =>
    events.calendarEntries(payload.from, payload.to, payload.academic_year_id)
  )

  /* ------------------------ الملاحظات والمرفقات ------------------------- */
  handle(IPC.notes.list, z.object({ owner_type: z.string().min(1).max(40), owner_id: zId }), (payload) =>
    events.listNotes(payload.owner_type, payload.owner_id)
  )
  handle(IPC.notes.save, noteSchema.extend({ id: zId.optional() }), (payload) => events.saveNote(payload as never))
  handle(IPC.notes.remove, z.object({ id: zId }), (payload) => events.removeNote(payload.id))
  handle(
    IPC.attachments.list,
    z.object({ owner_type: z.string().min(1).max(40), owner_id: zId }),
    (payload) => events.listAttachments(payload.owner_type, payload.owner_id)
  )
  handle(
    IPC.attachments.add,
    z.object({ owner_type: z.string().min(1).max(40), owner_id: zId, file_path: z.string().min(1).max(1000) }),
    (payload) => {
      if (!existsSync(payload.file_path)) throw new Error('الملف المحدَّد غير موجود على القرص.')
      const size = statSync(payload.file_path).size
      return events.addAttachment({ ...payload, size })
    }
  )
  handle(IPC.attachments.open, z.object({ id: zId }), async (payload) => {
    const attachment = events.getAttachment(payload.id)
    if (!attachment) throw new Error('المرفق غير موجود.')
    if (!existsSync(attachment.file_path)) throw new Error('ملف المرفق لم يعد موجوداً في مكانه الأصلي.')
    const error = await shell.openPath(attachment.file_path)
    if (error) throw new Error(`تعذر فتح الملف: ${error}`)
    return true
  })
  handle(IPC.attachments.remove, z.object({ id: zId }), (payload) => events.removeAttachment(payload.id))

  /* ---------------------- لوحة التحكم والبحث الشامل --------------------- */
  handle(IPC.dashboard.today, z.object({ date: optionalDate }).default({}), (payload) =>
    dashboard.todaySummary(payload?.date)
  )
  handle(IPC.dashboard.stats, yearFilter.default({}), (payload) => dashboard.dashboardStats(payload?.academic_year_id))
  handle(IPC.search.global, searchSchema, (payload) => search.globalSearch(payload.query))

  /* -------------------------------- الطباعة ----------------------------- */
  handle(IPC.print.settings, z.object({ scope: z.string().min(1).max(60) }), (payload) =>
    settings.getPrintSettings(payload.scope)
  )
  handle(IPC.print.saveSettings, printSettingsSchema, (payload) => settings.savePrintSettings(payload))
  /** معاينة مطابقة تماماً لما سيُطبع: أوراق A4 مرقّمة مع قائمة الصفحات */
  handle(IPC.print.preview, printDocumentSchema, async (payload) => {
    const doc = buildDocument(payload)
    const sheets = await buildSheets(doc, sheetRequest(payload))
    return {
      html: sheets.html,
      title: doc.title,
      orientation: doc.orientation,
      totalPages: sheets.totalPages,
      printedPages: sheets.printedPages,
      pageLabels: sheets.pageLabels,
      warnings: sheets.warnings
    }
  })
  handle(
    IPC.print.printer,
    printDocumentSchema.extend({ silent: z.boolean().optional() }),
    async (payload) => {
      const doc = buildDocument(payload)
      const sheets = await buildSheets(doc, sheetRequest(payload))
      const result = await htmlToPrinter(sheets.html, {
        orientation: doc.orientation,
        silent: payload.silent,
        title: doc.title
      })
      if (result.printed) {
        audit('طباعة وثيقة', 'print', null, `${doc.title} — ${sheets.printedPages.length} صفحة`)
      }
      return { ...result, totalPages: sheets.totalPages, printedPages: sheets.printedPages }
    }
  )
  handle(
    IPC.print.pdf,
    printDocumentSchema.extend({ savePath: z.string().max(1000).optional() }),
    async (payload) => {
      const doc = buildDocument(payload)
      const sheets = await buildSheets(doc, sheetRequest(payload))
      let target = payload.savePath
      if (!target) {
        const result = await dialog.showSaveDialog({
          title: 'حفظ الوثيقة كملف PDF',
          defaultPath: `${doc.title}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        })
        if (result.canceled || !result.filePath) return { saved: false, path: null, canceled: true }
        target = result.filePath
      }
      const written = await htmlToPdf(sheets.html, { orientation: doc.orientation, savePath: target })
      audit('تصدير وثيقة PDF', 'print', null, written.path)
      return { saved: true, path: written.path, totalPages: sheets.totalPages, printedPages: sheets.printedPages }
    }
  )

  /* ----------------------------- النسخ الاحتياطي ------------------------- */
  handle(IPC.backup.list, null, () => backup.listBackups())
  handle(IPC.backup.create, backupCreateSchema.default({}), (payload) => backup.createBackup(payload?.kind, payload?.note ?? undefined))
  handle(IPC.backup.restore, backupRestoreSchema, (payload) => backup.restoreBackup(payload.file_path))
  handle(IPC.backup.remove, z.object({ id: zId }), (payload) => backup.removeBackup(payload.id))
  handle(IPC.backup.settings, backupSettingsSchema, (payload) => backup.saveBackupSettings(payload))
  handle(IPC.backup.status, null, () => backup.getBackupSettings())
  handle(IPC.backup.integrity, z.object({ file_path: z.string().min(1).max(1000) }), (payload) =>
    import('../database/connection').then((module) => module.inspectDatabase(payload.file_path))
  )

  /* -------------------------------- التصدير ----------------------------- */
  handle(IPC.exports.data, z.object({
    kind: z.enum(['students', 'classes', 'grades', 'attendance', 'assessments', 'schedule', 'lesson_bank', 'annual_plan']),
    format: z.enum(['csv', 'json']),
    academic_year_id: optionalId,
    class_id: optionalId
  }), async (payload) => {
    const built = exportService.buildExport(payload.kind, payload.format, payload)
    const extension = payload.format === 'csv' ? 'csv' : 'json'
    const result = await dialog.showSaveDialog({
      title: 'تصدير البيانات',
      defaultPath: `${built.fileName}.${extension}`,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
    })
    if (result.canceled || !result.filePath) return { saved: false, path: null, count: built.count }
    writeTextFile(result.filePath, built.content)
    audit('تصدير بيانات', payload.kind, null, result.filePath)
    return { saved: true, path: result.filePath, count: built.count }
  })

  /* -------------------------------- PIN --------------------------------- */
  handle(IPC.pin.set, z.object({ pin: z.string().regex(/^\d{4,8}$/) }), async (payload) => {
    const { randomBytes, scryptSync } = await import('node:crypto')
    const salt = randomBytes(16).toString('hex')
    const hash = scryptSync(payload.pin, salt, 64).toString('hex')
    settings.setSetting(SETTING_KEYS.pinSalt, salt)
    settings.setSetting(SETTING_KEYS.pinHash, hash)
    audit('تفعيل قفل الرمز السري')
    return true
  })
  handle(IPC.pin.verify, z.object({ pin: z.string().min(4).max(8) }), async (payload) => {
    const { scryptSync, timingSafeEqual } = await import('node:crypto')
    const salt = settings.getSetting(SETTING_KEYS.pinSalt)
    const hash = settings.getSetting(SETTING_KEYS.pinHash)
    if (!salt || !hash) return true
    const candidate = scryptSync(payload.pin, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  })
  handle(IPC.pin.clear, null, () => {
    settings.setSetting(SETTING_KEYS.pinSalt, '')
    settings.setSetting(SETTING_KEYS.pinHash, '')
    audit('إلغاء قفل الرمز السري')
    return true
  })
  handle(IPC.pin.status, null, () => ({ enabled: Boolean(settings.getSetting(SETTING_KEYS.pinHash)) }))

  /* ------------------------------- السجل -------------------------------- */
  handle(IPC.audit.list, z.object({ limit: z.number().int().min(1).max(2000).optional() }).default({}), (payload) =>
    auditRepo.listAudit(payload?.limit ?? 200)
  )

  /* -------------------------- بيانات تجريبية (تطوير) ------------------- */
  handle(IPC.demo.seed, null, () => {
    if (app.isPackaged) throw new Error('البيانات التجريبية غير متاحة في النسخة الموزّعة.')
    return seedDemoData()
  })

  /* ------------------------------ ملف السجل ----------------------------- */
  handle(IPC.logs.open, null, async () => {
    const file = getLogFile()
    if (!file || !existsSync(file)) return false
    await shell.openPath(file)
    return true
  })
  handle(IPC.logs.read, z.object({ limit: z.number().int().min(1).max(2000).optional() }).default({}), (payload) =>
    readLogs(payload?.limit ?? 300)
  )

  /* ------------------- دليل الاستعمال (صفحة HTML محلية) ------------------ */
  handle(IPC.help.open, null, async () => {
    const docPath = join(getPaths().resources, 'docs', 'دليل-الاستخدام.html')
    if (!existsSync(docPath)) {
      dialog.showErrorBox('دليل الاستخدام', `لم يتم العثور على ملف الدليل:\n${docPath}`)
      return false
    }
    await shell.openPath(docPath)
    return true
  })
}

/** يخبر الواجهة بإعادة تحميل البيانات (تُستعمل بعد الاستعادة) */
export function broadcastReload(): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC_EVENTS.reload)
}

/** إحصاء سريع يُستعمل في التشخيص */
export function dbProbe(): { ok: boolean; tables: number } {
  try {
    const row = one<{ c: number }>("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    return { ok: true, tables: row?.c ?? 0 }
  } catch {
    return { ok: false, tables: 0 }
  }
}
