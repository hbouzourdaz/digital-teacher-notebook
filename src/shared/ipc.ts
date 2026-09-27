import type {
  AcademicYear,
  AnnualPlanItem,
  AppInfo,
  Assessment,
  AssessmentCategory,
  AssessmentScore,
  Attachment,
  AuditLog,
  BackupRecord,
  ClassRow,
  ClassStats,
  ComputedGrade,
  ContinuousEntry,
  DailyLesson,
  GradeFormula,
  ImportResult,
  LessonBankItem,
  Level,
  Note,
  ParsedTabularFile,
  PendingBackupInfo,
  PrintSettings,
  ScheduleSlot,
  School,
  SchoolEvent,
  SearchResult,
  Student,
  StudentTransfer,
  Subject,
  Teacher
} from './types'
import type {
  AssessmentInput,
  AttendanceSaveInput,
  BackupSettingsInput,
  CategoryInput,
  ClassInput,
  ContinuousSaveInput,
  FormulaInput,
  ImportInput,
  LessonBankInput,
  LessonInput,
  NoteInput,
  PlanInput,
  PrintDocumentInput,
  PrintSettingsInput,
  ScheduleSlotInput,
  SchoolInput,
  ScoreSaveInput,
  StudentInput,
  StudentTransferInput,
  SubjectInput,
  LevelInput,
  TeacherInput,
  AcademicYearInput,
  EventInput as SchoolEventInput
} from './schemas'
import type { PrintPageInfo, PrintPreviewResult } from './print'

/* ------------------------------------------------------------------ */
/* شجرة القنوات — مصدر واحد للحقيقة لكل قنوات IPC                     */
/* ------------------------------------------------------------------ */
export const IPC = {
  app: {
    info: 'app:info',
    quit: 'app:quit',
    reloadData: 'app:reload-data'
  },
  dialogs: {
    pickFile: 'dialogs:pick-file',
    pickDirectory: 'dialogs:pick-directory',
    saveFile: 'dialogs:save-file',
    confirm: 'dialogs:confirm'
  },
  settings: {
    all: 'settings:all',
    get: 'settings:get',
    set: 'settings:set',
    setMany: 'settings:set-many'
  },
  years: {
    list: 'years:list',
    create: 'years:create',
    update: 'years:update',
    remove: 'years:remove',
    activate: 'years:activate',
    archive: 'years:archive',
    clone: 'years:clone'
  },
  teacher: {
    get: 'teacher:get',
    save: 'teacher:save'
  },
  school: {
    get: 'school:get',
    save: 'school:save'
  },
  setup: {
    status: 'setup:status',
    complete: 'setup:complete'
  },
  subjects: {
    list: 'subjects:list',
    create: 'subjects:create',
    update: 'subjects:update',
    remove: 'subjects:remove'
  },
  levels: {
    list: 'levels:list',
    create: 'levels:create',
    update: 'levels:update',
    remove: 'levels:remove'
  },
  classes: {
    list: 'classes:list',
    create: 'classes:create',
    update: 'classes:update',
    remove: 'classes:remove',
    stats: 'classes:stats',
    clone: 'classes:clone',
    report: 'classes:report'
  },
  students: {
    list: 'students:list',
    create: 'students:create',
    update: 'students:update',
    remove: 'students:remove',
    reorder: 'students:reorder',
    transfer: 'students:transfer',
    history: 'students:history',
    importRows: 'students:import-rows',
    importFile: 'students:import-file',
    defaultImportFile: 'students:default-import-file',
    exportFile: 'students:export-file'
  },
  schedule: {
    list: 'schedule:list',
    create: 'schedule:create',
    update: 'schedule:update',
    remove: 'schedule:remove',
    move: 'schedule:move',
    conflicts: 'schedule:conflicts'
  },
  lessons: {
    list: 'lessons:list',
    get: 'lessons:get',
    create: 'lessons:create',
    update: 'lessons:update',
    remove: 'lessons:remove',
    search: 'lessons:search',
    ensureForSlot: 'lessons:ensure-for-slot',
    byClass: 'lessons:by-class'
  },
  attendance: {
    forLesson: 'attendance:for-lesson',
    save: 'attendance:save',
    summary: 'attendance:summary',
    forClass: 'attendance:for-class'
  },
  categories: {
    list: 'categories:list',
    create: 'categories:create',
    update: 'categories:update',
    remove: 'categories:remove'
  },
  assessments: {
    list: 'assessments:list',
    create: 'assessments:create',
    update: 'assessments:update',
    remove: 'assessments:remove',
    copy: 'assessments:copy',
    scores: 'assessments:scores',
    saveScores: 'assessments:save-scores'
  },
  continuous: {
    list: 'continuous:list',
    save: 'continuous:save'
  },
  formulas: {
    get: 'formulas:get',
    save: 'formulas:save'
  },
  grades: {
    gradebook: 'grades:gradebook',
    compute: 'grades:compute',
    studentDetail: 'grades:student-detail'
  },
  plan: {
    list: 'plan:list',
    create: 'plan:create',
    update: 'plan:update',
    remove: 'plan:remove',
    progress: 'plan:progress'
  },
  bank: {
    list: 'bank:list',
    create: 'bank:create',
    update: 'bank:update',
    remove: 'bank:remove'
  },
  events: {
    list: 'events:list',
    create: 'events:create',
    update: 'events:update',
    remove: 'events:remove',
    calendar: 'events:calendar'
  },
  notes: {
    list: 'notes:list',
    save: 'notes:save',
    remove: 'notes:remove'
  },
  attachments: {
    list: 'attachments:list',
    add: 'attachments:add',
    open: 'attachments:open',
    remove: 'attachments:remove'
  },
  dashboard: {
    today: 'dashboard:today',
    stats: 'dashboard:stats'
  },
  search: {
    global: 'search:global'
  },
  print: {
    preview: 'print:preview',
    pdf: 'print:pdf',
    printer: 'print:printer',
    settings: 'print:settings',
    saveSettings: 'print:save-settings'
  },
  backup: {
    list: 'backup:list',
    create: 'backup:create',
    restore: 'backup:restore',
    remove: 'backup:remove',
    settings: 'backup:settings',
    status: 'backup:status',
    integrity: 'backup:integrity'
  },
  exports: {
    data: 'exports:data'
  },
  pin: {
    set: 'pin:set',
    verify: 'pin:verify',
    clear: 'pin:clear',
    status: 'pin:status'
  },
  audit: {
    list: 'audit:list'
  },
  demo: {
    seed: 'demo:seed'
  },
  logs: {
    open: 'logs:open',
    read: 'logs:read'
  },
  help: {
    open: 'help:open'
  }
} as const

export const IPC_EVENTS = {
  reload: 'event:reload'
} as const

/* ------------------------------------------------------------------ */
/* الواجهة المتاحة للـ renderer — مطابقة تماماً لشجرة القنوات          */
/* ------------------------------------------------------------------ */
export interface NotebookApi {
  app: {
    info(): Promise<AppInfo>
    quit(): Promise<void>
    reloadData(): Promise<boolean>
  }
  dialogs: {
    pickFile(options: { filters?: string[]; title?: string; defaultPath?: string }): Promise<string | null>
    pickDirectory(options?: { title?: string }): Promise<string | null>
    saveFile(options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>
    confirm(options: { title: string; message: string; detail?: string; confirmLabel?: string }): Promise<boolean>
  }
  settings: {
    all(): Promise<Record<string, string>>
    get(key: string): Promise<string | null>
    set(payload: { key: string; value: string }): Promise<boolean>
    setMany(payload: Record<string, string>): Promise<boolean>
  }
  years: {
    list(): Promise<AcademicYear[]>
    create(payload: AcademicYearInput): Promise<AcademicYear>
    update(payload: AcademicYearInput & { id: number }): Promise<AcademicYear>
    remove(payload: { id: number }): Promise<void>
    activate(payload: { id: number }): Promise<AcademicYear>
    archive(payload: { id: number; archived: boolean }): Promise<AcademicYear>
    clone(payload: {
      id: number
      label: string
      start_date: string
      end_date: string
      copy: { classes: boolean; schedule: boolean; bank: boolean; plan: boolean; settings: boolean }
    }): Promise<AcademicYear>
  }
  teacher: {
    get(): Promise<Teacher | null>
    save(payload: TeacherInput): Promise<Teacher>
  }
  school: {
    get(): Promise<School | null>
    save(payload: SchoolInput): Promise<School>
  }
  setup: {
    status(): Promise<{ completed: boolean; steps: Record<string, boolean> }>
    complete(payload: { completed: boolean }): Promise<boolean>
  }
  subjects: {
    list(): Promise<Subject[]>
    create(payload: SubjectInput): Promise<Subject>
    update(payload: SubjectInput & { id: number }): Promise<Subject>
    remove(payload: { id: number }): Promise<void>
  }
  levels: {
    list(): Promise<Level[]>
    create(payload: LevelInput): Promise<Level>
    update(payload: LevelInput & { id: number }): Promise<Level>
    remove(payload: { id: number }): Promise<void>
  }
  classes: {
    list(payload?: { academic_year_id?: number; includeArchived?: boolean }): Promise<ClassRow[]>
    create(payload: ClassInput): Promise<ClassRow>
    update(payload: ClassInput & { id: number }): Promise<ClassRow>
    remove(payload: { id: number }): Promise<void>
    stats(payload: { class_id: number; term?: number; passing_threshold?: number }): Promise<ClassStats>
    clone(payload: { id: number; name: string; copyStudents: boolean }): Promise<ClassRow>
    report(payload: { class_id: number; term?: number }): Promise<{
      classRow: ClassRow
      students: Student[]
      stats: ClassStats
      lessons: DailyLesson[]
      assessments: Assessment[]
      events: SchoolEvent[]
      grades: ComputedGrade[]
    }>
  }
  students: {
    list(payload: { academic_year_id?: number; class_id?: number | null; search?: string; archived?: boolean }): Promise<Student[]>
    create(payload: StudentInput & { force?: boolean }): Promise<Student>
    update(payload: StudentInput & { id: number }): Promise<Student>
    remove(payload: { id: number }): Promise<void>
    reorder(payload: { class_id: number; orderedIds: number[] }): Promise<boolean>
    transfer(payload: StudentTransferInput): Promise<Student>
    history(payload: { student_id: number; term?: number }): Promise<{
      student: Student
      attendance: Array<{ date: string; start_time: string; status: string; class_name: string | null }>
      absences: number
      lates: number
      excused: number
      scores: Array<{ assessment_id: number; name: string; type: string; term: number; date: string; max_score: number; score: number | null }>
      continuous: ContinuousEntry[]
      grades: ComputedGrade[]
      notes: Note[]
      transfers: StudentTransfer[]
    }>
    importRows(payload: ImportInput): Promise<ImportResult>
    importFile(payload: { academic_year_id: number; class_id: number | null; file_path: string; skipDuplicates: boolean }): Promise<ParsedTabularFile>
    /** ملف الاستيراد الافتراضي (آخر ملف مستعمل أو ملف التنزيلات المعتاد) */
    defaultImportFile(): Promise<{ path: string | null; exists: boolean }>
    exportFile(payload: { academic_year_id?: number; class_id?: number | null }): Promise<string | null>
  }
  schedule: {
    list(payload?: { academic_year_id?: number; class_id?: number | null }): Promise<ScheduleSlot[]>
    create(payload: ScheduleSlotInput & { allowConflict?: boolean }): Promise<ScheduleSlot>
    update(payload: ScheduleSlotInput & { id: number; allowConflict?: boolean }): Promise<ScheduleSlot>
    remove(payload: { id: number }): Promise<void>
    move(payload: { id: number; day_of_week: number; start_time: string; end_time: string; allowConflict?: boolean }): Promise<ScheduleSlot>
    conflicts(payload?: { academic_year_id?: number }): Promise<Array<{ a: ScheduleSlot; b: ScheduleSlot }>>
  }
  lessons: {
    list(payload: {
      academic_year_id?: number
      class_id?: number | null
      from?: string
      to?: string
      date?: string
      search?: string
      limit?: number
      offset?: number
    }): Promise<DailyLesson[]>
    get(payload: { id: number }): Promise<DailyLesson | null>
    create(payload: LessonInput): Promise<DailyLesson>
    update(payload: LessonInput & { id: number }): Promise<DailyLesson>
    remove(payload: { id: number }): Promise<void>
    search(payload: { query: string; academic_year_id?: number }): Promise<DailyLesson[]>
    ensureForSlot(payload: {
      academic_year_id: number
      schedule_id: number
      date: string
    }): Promise<DailyLesson>
    byClass(payload: { class_id: number; limit?: number }): Promise<DailyLesson[]>
  }
  attendance: {
    forLesson(payload: { daily_lesson_id: number }): Promise<Array<{ student: Student; status: string; note: string | null }>>
    save(payload: AttendanceSaveInput): Promise<{ saved: number }>
    summary(payload: { academic_year_id?: number; class_id?: number | null; from?: string; to?: string }): Promise<
      Array<{ student_id: number; full_name: string; class_name: string | null; present: number; absent: number; late: number; excused: number }>
    >
    forClass(payload: { class_id: number; from?: string; to?: string }): Promise<
      Array<{ id: number; date: string; start_time: string; status: string; note: string | null; student_id: number; class_name: string | null }>
    >
  }
  categories: {
    list(payload?: { academic_year_id?: number }): Promise<AssessmentCategory[]>
    create(payload: CategoryInput): Promise<AssessmentCategory>
    update(payload: CategoryInput & { id: number }): Promise<AssessmentCategory>
    remove(payload: { id: number }): Promise<void>
  }
  assessments: {
    list(payload: {
      academic_year_id?: number
      class_id?: number | null
      term?: number
      type?: string
    }): Promise<Assessment[]>
    create(payload: AssessmentInput): Promise<Assessment>
    update(payload: AssessmentInput & { id: number }): Promise<Assessment>
    remove(payload: { id: number }): Promise<void>
    copy(payload: { from_assessment_id: number; name: string; date: string; term?: number; overwrite: boolean }): Promise<Assessment>
    scores(payload: { assessment_id: number }): Promise<Array<{ student: Student; score: AssessmentScore | null }>>
    saveScores(payload: ScoreSaveInput): Promise<{ saved: number }>
  }
  continuous: {
    list(payload: { class_id: number; term: number; academic_year_id?: number }): Promise<ContinuousEntry[]>
    save(payload: ContinuousSaveInput): Promise<{ saved: number }>
  }
  formulas: {
    get(payload?: { academic_year_id?: number }): Promise<GradeFormula>
    save(payload: FormulaInput & { id?: number }): Promise<GradeFormula>
  }
  grades: {
    gradebook(payload: { class_id: number; term: number; passing_threshold?: number }): Promise<{
      rows: ComputedGrade[]
      formula: GradeFormula
      summary: { average: number | null; highest: number | null; lowest: number | null; passing: number; counted: number; students: number }
    }>
    compute(payload: { class_id: number; term: number }): Promise<ComputedGrade[]>
    studentDetail(payload: { student_id: number; term?: number }): Promise<{
      grades: ComputedGrade[]
      continuous: ContinuousEntry[]
      scores: Array<{ assessment_id: number; name: string; type: string; term: number; date: string; max_score: number; score: number | null }>
      overall: number | null
    }>
  }
  plan: {
    list(payload: { academic_year_id?: number; level_id?: number | null; subject_id?: number | null; term?: number }): Promise<AnnualPlanItem[]>
    create(payload: PlanInput): Promise<AnnualPlanItem>
    update(payload: PlanInput & { id: number }): Promise<AnnualPlanItem>
    remove(payload: { id: number }): Promise<void>
    progress(payload?: { academic_year_id?: number }): Promise<{ total: number; done: number; inProgress: number; late: number; notStarted: number }>
  }
  bank: {
    list(payload?: { academic_year_id?: number; level_id?: number | null; search?: string }): Promise<LessonBankItem[]>
    create(payload: LessonBankInput): Promise<LessonBankItem>
    update(payload: LessonBankInput & { id: number }): Promise<LessonBankItem>
    remove(payload: { id: number }): Promise<void>
  }
  events: {
    list(payload: { academic_year_id?: number; from?: string; to?: string; term?: number; type?: string }): Promise<SchoolEvent[]>
    create(payload: SchoolEventInput): Promise<SchoolEvent>
    update(payload: SchoolEventInput & { id: number }): Promise<SchoolEvent>
    remove(payload: { id: number }): Promise<void>
    calendar(payload: { from: string; to: string }): Promise<
      Array<{ date: string; kind: string; label: string; sub: string; id: number }>
    >
  }
  notes: {
    list(payload: { owner_type: string; owner_id: number }): Promise<Note[]>
    save(payload: NoteInput & { id?: number }): Promise<Note>
    remove(payload: { id: number }): Promise<void>
  }
  attachments: {
    list(payload: { owner_type: string; owner_id: number }): Promise<Attachment[]>
    add(payload: { owner_type: string; owner_id: number; file_path: string }): Promise<Attachment>
    open(payload: { id: number }): Promise<boolean>
    remove(payload: { id: number }): Promise<void>
  }
  dashboard: {
    today(payload?: { date?: string }): Promise<import('./types').TodaySummary>
    stats(payload?: { academic_year_id?: number }): Promise<import('./types').DashboardStats>
  }
  search: {
    global(payload: { query: string }): Promise<SearchResult[]>
  }
  print: {
    preview(payload: PrintDocumentInput): Promise<PrintPreviewResult>
    pdf(
      payload: PrintDocumentInput & { savePath?: string }
    ): Promise<PrintPageInfo & { saved: boolean; path: string | null; canceled?: boolean }>
    printer(
      payload: PrintDocumentInput & { silent?: boolean }
    ): Promise<PrintPageInfo & { printed: boolean; canceled: boolean; failureReason: string }>
    settings(payload: { scope: string }): Promise<PrintSettings>
    saveSettings(payload: PrintSettingsInput): Promise<PrintSettings>
  }
  backup: {
    list(): Promise<BackupRecord[]>
    create(payload?: { kind?: 'manual' | 'auto' | 'pre-migration' | 'pre-import'; note?: string }): Promise<BackupRecord>
    restore(payload: { file_path: string }): Promise<{ restored: boolean; safetyBackup: string }>
    remove(payload: { id: number }): Promise<void>
    settings(payload: BackupSettingsInput): Promise<PendingBackupInfo>
    status(): Promise<PendingBackupInfo>
    integrity(payload: { file_path: string }): Promise<{ ok: boolean; size: number; tables: number; message: string }>
  }
  exports: {
    data(payload: { kind: string; format: 'csv' | 'json'; academic_year_id?: number; class_id?: number | null }): Promise<{
      saved: boolean
      path: string | null
      count: number
    }>
  }
  pin: {
    set(payload: { pin: string }): Promise<boolean>
    verify(payload: { pin: string }): Promise<boolean>
    clear(): Promise<boolean>
    status(): Promise<{ enabled: boolean }>
  }
  audit: {
    list(payload?: { limit?: number }): Promise<AuditLog[]>
  }
  demo: {
    seed(): Promise<{ seeded: boolean }>
  }
  logs: {
    open(): Promise<boolean>
    read(payload?: { limit?: number }): Promise<string[]>
  }
  help: {
    open(): Promise<boolean>
  }
}

/** Invoker صرف: قناة + بيانات → نتيجة */
export type RawInvoker = (channel: string, payload?: unknown) => Promise<unknown>

/**
 * يبني كائن الـ API المتاح في الـ renderer انطلاقاً من شجرة القنوات.
 * يُستعمل في preload، ويُختبر في unit tests لضمان تطابق الواجهة مع القنوات.
 */
export function createApi(invoke: RawInvoker): NotebookApi {
  const api: Record<string, unknown> = {}
  for (const [namespace, methods] of Object.entries(IPC)) {
    const group: Record<string, (payload?: unknown) => Promise<unknown>> = {}
    for (const [method, channel] of Object.entries(methods as Record<string, string>)) {
      group[method] = (payload?: unknown) => invoke(channel, payload)
    }
    api[namespace] = group
  }
  return api as unknown as NotebookApi
}

/** كل القنوات المسطّحة — تُستعمل في main والاختبارات */
export function allChannels(): string[] {
  return Object.values(IPC).flatMap((group) => Object.values(group as Record<string, string>))
}
