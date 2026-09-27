import { all, one, resolveYear } from '../repositories/base'
import { ensureDefaultSubject } from '../repositories/org'

/** معرّف المادة الحالية: من أول قسم في السنة أو المادة الافتراضية */
export function getSubjectId(academicYearId?: number): number | null {
  const yearId = resolveYear(academicYearId)
  const fromClass = one<{ subject_id: number | null }>(
    'SELECT subject_id FROM classes WHERE academic_year_id = ? AND subject_id IS NOT NULL LIMIT 1',
    [yearId]
  )
  if (fromClass?.subject_id) return fromClass.subject_id
  const anySubject = all<{ id: number }>('SELECT id FROM subjects WHERE is_active = 1 ORDER BY sort_order LIMIT 1')[0]
  if (anySubject) return anySubject.id
  return ensureDefaultSubject()?.id ?? null
}

/** عدد التلاميذ النشطين في قسم */
export function classStudentCount(classId: number): number {
  return one<{ c: number }>('SELECT COUNT(*) AS c FROM students WHERE class_id = ? AND archived = 0', [classId])?.c ?? 0
}
