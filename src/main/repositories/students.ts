import type {
  ComputedGrade,
  ContinuousEntry,
  ImportResult,
  Note,
  Student,
  StudentTransfer
} from '@shared/types'
import type { StudentInput, StudentTransferInput } from '@shared/schemas'
import { all, audit, count, one, resolveYear, run, transaction } from './base'
import { createClass, listClasses } from './classes'
import { fullName, normalizeArabic, toCSV } from '@shared/utils/misc'
import { normalizeDateInput, todayISO } from '@shared/utils/date'

const STUDENT_SELECT = `
  SELECT st.*, c.name AS class_name
  FROM students st
  LEFT JOIN classes c ON c.id = st.class_id
`

export function listStudents(options: {
  academic_year_id?: number | null
  class_id?: number | null
  search?: string
  archived?: boolean
}): Student[] {
  const yearId = resolveYear(options.academic_year_id)
  const conditions = ['st.academic_year_id = @year']
  const params: Record<string, unknown> = { year: yearId }
  if (options.class_id) {
    conditions.push('st.class_id = @class_id')
    params.class_id = options.class_id
  }
  if (!options.archived) conditions.push('st.archived = 0')
  if (options.search && options.search.trim()) {
    conditions.push('(st.first_name LIKE @q OR st.last_name LIKE @q OR st.number LIKE @q)')
    params.q = `%${options.search.trim()}%`
  }
  return all<Student>(
    `${STUDENT_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY c.name ASC, st.sort_order ASC, st.last_name ASC, st.first_name ASC`,
    params
  )
}

export function getStudent(id: number): Student | null {
  return one<Student>(`${STUDENT_SELECT} WHERE st.id = ?`, [id]) ?? null
}

function duplicateOf(input: StudentInput): Student | undefined {
  return one<Student>(
    `SELECT * FROM students
     WHERE academic_year_id = ? AND IFNULL(class_id, 0) = IFNULL(?, 0) AND archived = 0
       AND lower(trim(first_name)) = lower(trim(?)) AND lower(trim(last_name)) = lower(trim(?))`,
    [input.academic_year_id, input.class_id ?? null, input.first_name, input.last_name]
  )
}

export function createStudent(input: StudentInput & { force?: boolean }): Student {
  const existing = duplicateOf(input)
  if (existing && !input.force) {
    throw new Error(`التلميذ «${fullName(input.first_name, input.last_name)}» موجود مسبقاً في هذا القسم.`)
  }
  const sortOrder =
    input.sort_order ||
    count('SELECT COUNT(*) AS c FROM students WHERE class_id IS ?', [input.class_id ?? null]) + 1
  const result = run(
    `INSERT INTO students (academic_year_id, class_id, number, first_name, last_name, gender, birth_date, guardian_phone, notes, archived, sort_order)
     VALUES (@academic_year_id, @class_id, @number, @first_name, @last_name, @gender, @birth_date, @guardian_phone, @notes, @archived, @sort_order)`,
    { ...input, sort_order: sortOrder }
  )
  audit('إضافة تلميذ', 'students', result.lastInsertRowid, fullName(input.first_name, input.last_name))
  return getStudent(result.lastInsertRowid) as Student
}

export function updateStudent(input: StudentInput & { id: number }): Student {
  run(
    `UPDATE students SET class_id = @class_id, number = @number, first_name = @first_name, last_name = @last_name,
       gender = @gender, birth_date = @birth_date, guardian_phone = @guardian_phone, notes = @notes,
       archived = @archived, sort_order = @sort_order WHERE id = @id`,
    input
  )
  audit('تعديل تلميذ', 'students', input.id, fullName(input.first_name, input.last_name))
  return getStudent(input.id) as Student
}

export function removeStudent(id: number): void {
  run('DELETE FROM students WHERE id = ?', [id])
  audit('حذف تلميذ', 'students', id)
}

export function setArchived(id: number, archived: boolean): void {
  run('UPDATE students SET archived = ? WHERE id = ?', [archived ? 1 : 0, id])
  audit(archived ? 'أرشفة تلميذ' : 'إلغاء أرشفة تلميذ', 'students', id)
}

export function reorderStudents(classId: number, orderedIds: number[]): void {
  transaction(() => {
    orderedIds.forEach((studentId, index) => {
      run('UPDATE students SET sort_order = ? WHERE id = ? AND class_id = ?', [index + 1, studentId, classId])
    })
  })
  audit('إعادة ترتيب قائمة قسم', 'classes', classId)
}

export function transferStudent(input: StudentTransferInput): Student {
  const student = getStudent(input.student_id)
  if (!student) throw new Error('التلميذ غير موجود')
  const date = input.date ?? todayISO()
  transaction(() => {
    run('UPDATE students SET class_id = ? WHERE id = ?', [input.to_class_id, input.student_id])
    run(
      'INSERT INTO student_transfers (student_id, from_class_id, to_class_id, date, note) VALUES (?, ?, ?, ?, ?)',
      [input.student_id, student.class_id, input.to_class_id, date, input.note ?? null]
    )
  })
  audit('نقل تلميذ', 'students', input.student_id)
  return getStudent(input.student_id) as Student
}

export function studentTransfers(studentId: number): StudentTransfer[] {
  return all<StudentTransfer>('SELECT * FROM student_transfers WHERE student_id = ? ORDER BY date DESC', [studentId])
}

export interface StudentHistory {
  student: Student
  attendance: Array<{ date: string; start_time: string; status: string; class_name: string | null }>
  absences: number
  lates: number
  excused: number
  scores: Array<{
    assessment_id: number
    name: string
    type: string
    term: number
    date: string
    max_score: number
    score: number | null
  }>
  continuous: ContinuousEntry[]
  grades: ComputedGrade[]
  notes: Note[]
  transfers: StudentTransfer[]
}

export function studentHistory(studentId: number, term?: number): StudentHistory {
  const student = getStudent(studentId)
  if (!student) throw new Error('التلميذ غير موجود')
  const termFilter = term ? ' AND a.term = @term' : ''
  const params: Record<string, unknown> = { student_id: studentId }
  if (term) params.term = term

  const attendance = all<{ date: string; start_time: string; status: string; class_name: string | null }>(
    `SELECT att.date, dl.start_time, att.status, c.name AS class_name
     FROM attendance att
     JOIN daily_lessons dl ON dl.id = att.daily_lesson_id
     LEFT JOIN classes c ON c.id = dl.class_id
     WHERE att.student_id = @student_id ORDER BY att.date DESC, dl.start_time DESC`,
    params
  )
  const tally = one<{ absences: number; lates: number; excused: number }>(
    `SELECT
       SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absences,
       SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS lates,
       SUM(CASE WHEN status = 'excused' THEN 1 ELSE 0 END) AS excused
     FROM attendance WHERE student_id = @student_id`,
    params
  )
  const scores = all<{
    assessment_id: number
    name: string
    type: string
    term: number
    date: string
    max_score: number
    score: number | null
  }>(
    `SELECT a.id AS assessment_id, a.name, a.type, a.term, a.date, a.max_score, s.score
     FROM assessments a
     JOIN assessment_scores s ON s.assessment_id = a.id AND s.student_id = @student_id
     WHERE 1 = 1${termFilter}
     ORDER BY a.date DESC, a.id DESC`,
    params
  )
  const continuous = all<ContinuousEntry>(
    `SELECT * FROM continuous_assessment WHERE student_id = @student_id${term ? ' AND term = @term' : ''}`,
    params
  )
  const grades = all<ComputedGrade>(
    `SELECT g.student_id, st.first_name || ' ' || st.last_name AS full_name, st.number,
       g.continuous, g.homework, g.activities, g.exam, g.average, g.absences
     FROM grades g JOIN students st ON st.id = g.student_id
     WHERE g.student_id = @student_id${term ? ' AND g.term = @term' : ''}`,
    params
  )
  const notes = all<Note>("SELECT * FROM notes WHERE owner_type = 'student' AND owner_id = ? ORDER BY id DESC", [
    studentId
  ])
  return {
    student,
    attendance,
    absences: tally?.absences ?? 0,
    lates: tally?.lates ?? 0,
    excused: tally?.excused ?? 0,
    scores,
    continuous,
    grades,
    notes,
    transfers: studentTransfers(studentId)
  }
}

export interface ImportRow {
  first_name: string
  last_name: string
  number: number | null
  gender: 'male' | 'female' | null
  birth_date?: string | null
  notes?: string | null
  /** اسم القسم/الفوج كما ورد في الملف — يسمح باستيراد عدة أقسام في مرة واحدة */
  class_name?: string | null
}

export interface ImportStudentsOptions {
  /** إنشاء الأقسام غير الموجودة تلقائياً (وإلا تُتخطّى أسطرها مع سبب واضح) */
  createMissingClasses?: boolean
}

/** مفتاح موحّد لاسم القسم: يتجاهل التباعد الزائد والهمزات والتشكيل */
function classNameKey(name: string): string {
  return normalizeArabic(name.replace(/\s+/g, ' ').trim())
}

/** استيراد جماعي (مستهدف أو موزّع على عدة أقسام) مع منع التكرار لكل قسم */
export function importStudents(
  academicYearId: number,
  classId: number | null,
  rows: ImportRow[],
  skipDuplicates: boolean,
  options: ImportStudentsOptions = {}
): ImportResult {
  const createMissingClasses = options.createMissingClasses !== false
  const errors: string[] = []
  const createdClasses: string[] = []
  const byClass = new Map<string, number>()
  let inserted = 0
  let skipped = 0

  const existingClasses = listClasses({ academic_year_id: academicYearId })
  const classesByName = new Map<string, number>()
  const classNameById = new Map<number, string>()
  for (const item of existingClasses) {
    classesByName.set(classNameKey(item.name), item.id)
    classNameById.set(item.id, item.name)
  }

  const existing = new Set<string>()
  const loaded = new Set<number | null>()
  const nextOrder = new Map<number | null, number>()
  const duplicateKey = (target: number | null, first: string, last: string): string =>
    `${target ?? 0}|${normalizeArabic(first)}|${normalizeArabic(last)}`

  /** تحميل أسماء قسم واحد مرة واحدة (بدل استعلام لكل سطر) */
  const ensureLoaded = (target: number | null): void => {
    if (loaded.has(target)) return
    loaded.add(target)
    const rowsInClass = all<{ first_name: string; last_name: string }>(
      'SELECT first_name, last_name FROM students WHERE academic_year_id = ? AND IFNULL(class_id, 0) = IFNULL(?, 0)',
      [academicYearId, target]
    )
    for (const student of rowsInClass) {
      existing.add(duplicateKey(target, student.first_name, student.last_name))
    }
    nextOrder.set(
      target,
      count('SELECT COUNT(*) AS c FROM students WHERE IFNULL(class_id, 0) = IFNULL(?, 0)', [target]) + 1
    )
  }

  transaction(() => {
    rows.forEach((row, index) => {
      const first = row.first_name.trim()
      const last = row.last_name.trim()
      if (!first || !last) {
        errors.push(`السطر ${index + 1}: الاسم أو اللقب فارغ`)
        skipped++
        return
      }

      const rawClassName = (row.class_name ?? '').replace(/\s+/g, ' ').trim()
      let target = classId
      if (rawClassName) {
        const key = classNameKey(rawClassName)
        const found = classesByName.get(key)
        if (found) {
          target = found
        } else if (createMissingClasses) {
          // كل وسائط الاستعلام المسمّاة تُمرّر صراحةً (المستوى/المادة/الملاحظات فارغة)
          const created = createClass({
            academic_year_id: academicYearId,
            name: rawClassName,
            level_id: null,
            stream: null,
            subject_id: null,
            notes: null,
            sort_order: classesByName.size
          })
          classesByName.set(key, created.id)
          classNameById.set(created.id, created.name)
          createdClasses.push(created.name)
          target = created.id
        } else {
          errors.push(`السطر ${index + 1}: القسم «${rawClassName}» غير موجود`)
          skipped++
          return
        }
      }

      ensureLoaded(target)
      const key = duplicateKey(target, first, last)
      if (existing.has(key)) {
        if (skipDuplicates) {
          skipped++
          return
        }
        errors.push(`السطر ${index + 1}: التلميذ «${fullName(first, last)}» مكرر`)
        skipped++
        return
      }
      existing.add(key)

      const order = nextOrder.get(target) ?? 1
      run(
        `INSERT INTO students
           (academic_year_id, class_id, number, first_name, last_name, gender, birth_date, notes, archived, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          academicYearId,
          target,
          row.number ?? order,
          first,
          last,
          row.gender,
          normalizeDateInput(row.birth_date),
          row.notes?.trim() || null,
          order
        ]
      )
      nextOrder.set(target, order + 1)
      inserted++

      const label = rawClassName || (target ? classNameById.get(target) ?? 'بدون قسم' : 'بدون قسم')
      byClass.set(label, (byClass.get(label) ?? 0) + 1)
    })
  })

  audit(
    'استيراد تلاميذ',
    'students',
    classId,
    `تمت إضافة ${inserted}${createdClasses.length > 0 ? ` — أقسام جديدة: ${createdClasses.length}` : ''}`
  )

  return {
    inserted,
    skipped,
    errors,
    createdClasses,
    byClass: [...byClass.entries()]
      .map(([class_name, count]) => ({ class_name, inserted: count }))
      .sort((a, b) => a.class_name.localeCompare(b.class_name, 'ar'))
  }
}

export function studentsToCSV(academicYearId?: number | null, classId?: number | null): { csv: string; count: number } {
  const list = listStudents({ academic_year_id: academicYearId, class_id: classId ?? undefined })
  const csv = toCSV(
    ['الرقم', 'الاسم', 'اللقب', 'الاسم الكامل', 'القسم', 'الجنس', 'تاريخ الميلاد', 'هاتف الولي', 'ملاحظات'],
    list.map((s) => [
      s.number ?? '',
      s.first_name,
      s.last_name,
      s.full_name,
      s.class_name ?? '',
      s.gender === 'male' ? 'ذكر' : s.gender === 'female' ? 'أنثى' : '',
      s.birth_date ?? '',
      s.guardian_phone ?? '',
      s.notes ?? ''
    ])
  )
  return { csv, count: list.length }
}
