import type { ComputedGrade, GradeFormula } from '@shared/types'
import type { FormulaInput } from '@shared/schemas'
import { all, audit, one, resolveYear, run } from './base'
import { DEFAULT_FORMULA_COMPONENTS } from '@shared/constants'
import { parseFormulaComponents } from '@shared/utils/grades'

/** صيغة حساب المعدل — افتراضية قابلة للتعديل، والتطبيق لا يدّعي أنها رسمية */
export function getFormula(academicYearId?: number | null): GradeFormula {
  const yearId = resolveYear(academicYearId)
  const existing =
    one<GradeFormula>('SELECT * FROM grade_formulas WHERE academic_year_id = ? ORDER BY id DESC LIMIT 1', [yearId]) ??
    one<GradeFormula>('SELECT * FROM grade_formulas WHERE academic_year_id IS NULL LIMIT 1')
  if (existing) return existing

  run(
    'INSERT INTO grade_formulas (academic_year_id, name, components, rounding, is_active) VALUES (?, ?, ?, ?, 1)',
    [yearId, 'صيغة افتراضية قابلة للتعديل', JSON.stringify(DEFAULT_FORMULA_COMPONENTS), 2]
  )
  return one<GradeFormula>('SELECT * FROM grade_formulas WHERE academic_year_id = ? ORDER BY id DESC LIMIT 1', [
    yearId
  ]) as GradeFormula
}

export function getFormulaComponents(academicYearId?: number | null): {
  formula: GradeFormula
  components: ReturnType<typeof parseFormulaComponents>
} {
  const formula = getFormula(academicYearId)
  const parsed = parseFormulaComponents(formula.components)
  return { formula, components: parsed.length > 0 ? parsed : DEFAULT_FORMULA_COMPONENTS }
}

export function saveFormula(input: FormulaInput & { id?: number }): GradeFormula {
  const yearId = resolveYear(input.academic_year_id)
  const enabled = input.components.filter((c) => c.enabled && c.weight > 0)
  if (enabled.length === 0) throw new Error('يجب تفعيل مكوّن واحد على الأقل لحساب المعدل.')

  const current = getFormula(yearId)
  run(
    `UPDATE grade_formulas SET name = @name, components = @components, rounding = @rounding,
       is_active = 1, updated_at = datetime('now', 'localtime') WHERE id = @id`,
    {
      id: current.id,
      name: input.name,
      components: JSON.stringify(input.components),
      rounding: input.rounding
    }
  )
  audit('تعديل صيغة حساب المعدل', 'grade_formulas', current.id)
  return one<GradeFormula>('SELECT * FROM grade_formulas WHERE id = ?', [current.id]) as GradeFormula
}

export function upsertGrade(row: {
  academic_year_id: number
  class_id: number
  student_id: number
  subject_id: number | null
  term: number
  continuous: number | null
  homework: number | null
  activities: number | null
  exam: number | null
  average: number | null
  absences: number
}): void {
  run(
    `INSERT INTO grades (academic_year_id, class_id, student_id, subject_id, term, continuous, homework, activities, exam, average, absences, computed_at)
     VALUES (@academic_year_id, @class_id, @student_id, @subject_id, @term, @continuous, @homework, @activities, @exam, @average, @absences, datetime('now', 'localtime'))
     ON CONFLICT(student_id, term, IFNULL(subject_id, 0)) DO UPDATE SET
       continuous = excluded.continuous, homework = excluded.homework, activities = excluded.activities,
       exam = excluded.exam, average = excluded.average, absences = excluded.absences,
       class_id = excluded.class_id, computed_at = excluded.computed_at`,
    { ...row, subject_id: row.subject_id ?? null }
  )
}

export function gradesForClass(classId: number, term: number): ComputedGrade[] {
  return all<ComputedGrade>(
    `SELECT g.student_id, st.first_name || ' ' || st.last_name AS full_name, st.number,
       g.continuous, g.homework, g.activities, g.exam, g.average, g.absences
     FROM grades g JOIN students st ON st.id = g.student_id
     WHERE g.class_id = ? AND g.term = ? ORDER BY st.sort_order ASC, st.last_name ASC`,
    [classId, term]
  )
}

export function gradesForStudent(studentId: number, term?: number): ComputedGrade[] {
  return all<ComputedGrade>(
    `SELECT g.student_id, st.first_name || ' ' || st.last_name AS full_name, st.number,
       g.continuous, g.homework, g.activities, g.exam, g.average, g.absences
     FROM grades g JOIN students st ON st.id = g.student_id
     WHERE g.student_id = ?${term ? ' AND g.term = ?' : ''}`,
    term ? [studentId, term] : [studentId]
  )
}
