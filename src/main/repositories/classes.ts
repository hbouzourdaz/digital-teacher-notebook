import type { ClassRow, ClassStats, GradeFormula } from '@shared/types'
import type { ClassInput } from '@shared/schemas'
import { all, audit, count, one, resolveYear, run, transaction } from './base'

const CLASS_SELECT = `
  SELECT c.*, l.name AS level_name, s.name AS subject_name,
    (SELECT COUNT(*) FROM students st WHERE st.class_id = c.id AND st.archived = 0) AS students_count,
    (SELECT COUNT(*) FROM students st WHERE st.class_id = c.id AND st.archived = 0 AND st.gender = 'male') AS boys_count,
    (SELECT COUNT(*) FROM students st WHERE st.class_id = c.id AND st.archived = 0 AND st.gender = 'female') AS girls_count,
    (SELECT COUNT(*) FROM students st WHERE st.class_id = c.id AND st.archived = 0 AND st.gender = 'female') AS female_count,
    (SELECT COUNT(*) FROM students st WHERE st.class_id = c.id AND st.archived = 0 AND (st.gender IS NULL OR st.gender = 'male')) AS male_count
  FROM classes c
  LEFT JOIN levels l ON l.id = c.level_id
  LEFT JOIN subjects s ON s.id = c.subject_id
`

export function listClasses(options: { academic_year_id?: number | null } = {}): ClassRow[] {
  const yearId = resolveYear(options.academic_year_id)
  return all<ClassRow>(`${CLASS_SELECT} WHERE c.academic_year_id = ? ORDER BY c.sort_order ASC, c.name ASC`, [yearId])
}

export function getClass(id: number): ClassRow | null {
  return one<ClassRow>(`${CLASS_SELECT} WHERE c.id = ?`, [id]) ?? null
}

export function createClass(input: ClassInput): ClassRow {
  const result = run(
    `INSERT INTO classes (academic_year_id, name, level_id, stream, subject_id, notes, sort_order)
     VALUES (@academic_year_id, @name, @level_id, @stream, @subject_id, @notes, @sort_order)`,
    input
  )
  audit('إضافة قسم', 'classes', result.lastInsertRowid, input.name)
  return getClass(result.lastInsertRowid) as ClassRow
}

export function updateClass(input: ClassInput & { id: number }): ClassRow {
  run(
    `UPDATE classes SET name = @name, level_id = @level_id, stream = @stream, subject_id = @subject_id,
       notes = @notes, sort_order = @sort_order WHERE id = @id`,
    input
  )
  audit('تعديل قسم', 'classes', input.id, input.name)
  return getClass(input.id) as ClassRow
}

export function removeClass(id: number): void {
  run('DELETE FROM classes WHERE id = ?', [id])
  audit('حذف قسم', 'classes', id)
}

export function classImpact(id: number): Record<string, number> {
  return {
    students: count('SELECT COUNT(*) AS c FROM students WHERE class_id = ?', [id]),
    schedule: count('SELECT COUNT(*) AS c FROM weekly_schedule WHERE class_id = ?', [id]),
    lessons: count('SELECT COUNT(*) AS c FROM daily_lessons WHERE class_id = ?', [id]),
    assessments: count('SELECT COUNT(*) AS c FROM assessments WHERE class_id = ?', [id])
  }
}

/** نسخ قسم (مع أو بدون قائمة التلاميذ) */
export function cloneClass(id: number, name: string, copyStudents: boolean): ClassRow {
  const source = getClass(id)
  if (!source) throw new Error('القسم غير موجود')
  const newId = transaction(() => {
    const result = run(
      `INSERT INTO classes (academic_year_id, name, level_id, stream, subject_id, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        source.academic_year_id,
        name,
        source.level_id,
        source.stream,
        source.subject_id,
        source.notes,
        source.sort_order + 1
      ]
    )
    const created = result.lastInsertRowid
    if (copyStudents) {
      const students = all<{
        number: number | null
        first_name: string
        last_name: string
        gender: string | null
        birth_date: string | null
        guardian_phone: string | null
        notes: string | null
        sort_order: number
      }>('SELECT * FROM students WHERE class_id = ? AND archived = 0 ORDER BY sort_order ASC, id ASC', [id])
      for (const student of students) {
        run(
          `INSERT INTO students (academic_year_id, class_id, number, first_name, last_name, gender, birth_date, guardian_phone, notes, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            source.academic_year_id,
            created,
            student.number,
            student.first_name,
            student.last_name,
            student.gender,
            student.birth_date,
            student.guardian_phone,
            student.notes,
            student.sort_order
          ]
        )
      }
    }
    return created
  })
  audit('نسخ قسم', 'classes', newId, `${source.name} → ${name}`)
  return getClass(newId) as ClassRow
}

export function getActiveFormula(academicYearId: number): GradeFormula | null {
  return (
    one<GradeFormula>('SELECT * FROM grade_formulas WHERE academic_year_id = ? AND is_active = 1 LIMIT 1', [
      academicYearId
    ]) ??
    one<GradeFormula>('SELECT * FROM grade_formulas WHERE academic_year_id IS NULL AND is_active = 1 LIMIT 1') ??
    null
  )
}

export function classStats(classId: number, term?: number, passingThreshold = 10): ClassStats {
  const cls = getClass(classId)
  const yearId = cls?.academic_year_id ?? resolveYear()
  const termFilter = term ? ' AND term = @term' : ''
  const params: Record<string, unknown> = { class_id: classId, threshold: passingThreshold }
  if (term) params.term = term

  const grades = one<{ avg: number | null; max: number | null; min: number | null; n: number }>(
    `SELECT AVG(average) AS avg, MAX(average) AS max, MIN(average) AS min, COUNT(average) AS n
     FROM grades WHERE class_id = @class_id AND average IS NOT NULL${termFilter}`,
    params
  )
  const passing = one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM grades WHERE class_id = @class_id AND average IS NOT NULL AND average >= @threshold${termFilter}`,
    params
  )

  const planTotals = cls?.level_id
    ? one<{ total: number; done: number }>(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
         FROM annual_plans WHERE academic_year_id = ? AND (level_id = ? OR level_id IS NULL)`,
        [yearId, cls.level_id]
      )
    : { total: 0, done: 0 }

  const attendanceCounts = one<{ absences: number; lates: number; sessions: number }>(
    `SELECT
       SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absences,
       SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS lates,
       COUNT(DISTINCT a.daily_lesson_id) AS sessions
     FROM attendance a
     JOIN daily_lessons dl ON dl.id = a.daily_lesson_id
     WHERE dl.class_id = ?`,
    [classId]
  )

  return {
    class_id: classId,
    students_count: cls?.students_count ?? 0,
    lessons_count: count('SELECT COUNT(*) AS c FROM daily_lessons WHERE class_id = ?', [classId]),
    attendance_sessions: attendanceCounts?.sessions ?? 0,
    absences: attendanceCounts?.absences ?? 0,
    lates: attendanceCounts?.lates ?? 0,
    assessments_count: count('SELECT COUNT(*) AS c FROM assessments WHERE class_id = ?', [classId]),
    average: grades?.avg != null ? Number(grades.avg.toFixed(2)) : null,
    highest: grades?.max != null ? Number(grades.max.toFixed(2)) : null,
    lowest: grades?.min != null ? Number(grades.min.toFixed(2)) : null,
    passing: passing?.c ?? 0,
    plan_total: planTotals?.total ?? 0,
    plan_done: planTotals?.done ?? 0
  }
}
