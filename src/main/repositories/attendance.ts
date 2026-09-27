import type { Student } from '@shared/types'
import type { AttendanceSaveInput } from '@shared/schemas'
import { all, audit, one, resolveYear, run, transaction } from './base'

export interface LessonAttendanceRow {
  student: Student
  status: string
  note: string | null
}

/**
 * قائمة تلاميذ القسم لحصة معيّنة مع حالتهم الحالية.
 * إن لم تُسجَّل بعد، يكون الجميع "حاضر" افتراضياً لتسريع الإدخال.
 */
export function attendanceForLesson(dailyLessonId: number): LessonAttendanceRow[] {
  const lesson = one<{ class_id: number }>('SELECT class_id FROM daily_lessons WHERE id = ?', [dailyLessonId])
  if (!lesson) throw new Error('الحصة غير موجودة')
  const students = all<Student>(
    `SELECT st.*, c.name AS class_name FROM students st
     LEFT JOIN classes c ON c.id = st.class_id
     WHERE st.class_id = ? AND st.archived = 0
     ORDER BY st.sort_order ASC, st.last_name ASC, st.first_name ASC`,
    [lesson.class_id]
  )
  const existing = all<{ student_id: number; status: string; note: string | null }>(
    'SELECT student_id, status, note FROM attendance WHERE daily_lesson_id = ?',
    [dailyLessonId]
  )
  const map = new Map(existing.map((row) => [row.student_id, row]))
  return students.map((student) => {
    const found = map.get(student.id)
    return { student, status: found?.status ?? 'present', note: found?.note ?? null }
  })
}

export function saveAttendance(input: AttendanceSaveInput): { saved: number } {
  let saved = 0
  transaction(() => {
    for (const entry of input.entries) {
      run(
        `INSERT INTO attendance (academic_year_id, daily_lesson_id, student_id, date, status, note)
         VALUES (@year, @lesson, @student, @date, @status, @note)
         ON CONFLICT(daily_lesson_id, student_id) DO UPDATE SET
           status = excluded.status, note = excluded.note, updated_at = datetime('now', 'localtime')`,
        {
          year: input.academic_year_id,
          lesson: input.daily_lesson_id,
          student: entry.student_id,
          date: input.date,
          status: entry.status,
          note: entry.note ?? null
        }
      )
      saved++
    }
  })
  audit('تسجيل الحضور', 'daily_lessons', input.daily_lesson_id, `${saved} تلميذ`)
  return { saved }
}

export function attendanceSummary(filters: {
  academic_year_id?: number | null
  class_id?: number | null
  from?: string
  to?: string
}): Array<{
  student_id: number
  full_name: string
  class_name: string | null
  present: number
  absent: number
  late: number
  excused: number
}> {
  const yearId = resolveYear(filters.academic_year_id)
  const conditions = ['dl.academic_year_id = @year']
  const params: Record<string, unknown> = { year: yearId }
  if (filters.class_id) {
    conditions.push('dl.class_id = @class_id')
    params.class_id = filters.class_id
  }
  if (filters.from) {
    conditions.push('a.date >= @from')
    params.from = filters.from
  }
  if (filters.to) {
    conditions.push('a.date <= @to')
    params.to = filters.to
  }
  return all(
    `SELECT st.id AS student_id, st.first_name || ' ' || st.last_name AS full_name, c.name AS class_name,
       SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present,
       SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent,
       SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS late,
       SUM(CASE WHEN a.status = 'excused' THEN 1 ELSE 0 END) AS excused
     FROM attendance a
     JOIN students st ON st.id = a.student_id
     JOIN daily_lessons dl ON dl.id = a.daily_lesson_id
     LEFT JOIN classes c ON c.id = dl.class_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY st.id ORDER BY c.name ASC, st.last_name ASC`,
    params
  )
}

export function attendanceForClass(
  classId: number,
  from?: string,
  to?: string
): Array<{ id: number; date: string; start_time: string; status: string; note: string | null; student_id: number; class_name: string | null }> {
  const params: Record<string, unknown> = { class_id: classId }
  let extra = ''
  if (from) {
    extra += ' AND a.date >= @from'
    params.from = from
  }
  if (to) {
    extra += ' AND a.date <= @to'
    params.to = to
  }
  return all(
    `SELECT a.id, a.date, dl.start_time, a.status, a.note, a.student_id, c.name AS class_name
     FROM attendance a
     JOIN daily_lessons dl ON dl.id = a.daily_lesson_id
     LEFT JOIN classes c ON c.id = dl.class_id
     WHERE dl.class_id = @class_id${extra}
     ORDER BY a.date DESC, dl.start_time ASC`,
    params
  )
}

export interface LessonAbsenceTally {
  absent: number
  late: number
  excused: number
  recorded: number
}

/**
 * حصيلة الغياب لكل حصة في استعلام واحد — تُستعمل في وثائق الطباعة
 * (الدفتر اليومي) حتى لا نُنفّذ استعلاماً لكل حصة.
 */
export function lessonAbsenceTallies(lessonIds: number[]): Map<number, LessonAbsenceTally> {
  const map = new Map<number, LessonAbsenceTally>()
  const ids = lessonIds.slice(0, 2000)
  if (ids.length === 0) return map
  const placeholders = ids.map(() => '?').join(',')
  const rows = all<{ daily_lesson_id: number; absent: number; late: number; excused: number; recorded: number }>(
    `SELECT daily_lesson_id,
       SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent,
       SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late,
       SUM(CASE WHEN status = 'excused' THEN 1 ELSE 0 END) AS excused,
       COUNT(*) AS recorded
     FROM attendance WHERE daily_lesson_id IN (${placeholders})
     GROUP BY daily_lesson_id`,
    ids
  )
  for (const row of rows) {
    map.set(row.daily_lesson_id, {
      absent: Number(row.absent ?? 0),
      late: Number(row.late ?? 0),
      excused: Number(row.excused ?? 0),
      recorded: Number(row.recorded ?? 0)
    })
  }
  return map
}

/** هل تم تسجيل حضور هذه الحصة؟ */
export function lessonHasAttendance(dailyLessonId: number): boolean {
  const row = one<{ c: number }>('SELECT COUNT(*) AS c FROM attendance WHERE daily_lesson_id = ?', [dailyLessonId])
  return (row?.c ?? 0) > 0
}
