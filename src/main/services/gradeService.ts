import type { ComputedGrade, ContinuousEntry, GradeFormula, Student } from '@shared/types'
import { all, one, transaction } from '../repositories/base'
import { getClass } from '../repositories/classes'
import { getFormulaComponents, upsertGrade } from '../repositories/grades'
import { computeAverage, simpleAverage, weightedAverage, describeFormula } from '@shared/utils/grades'

/**
 * تجميع النقاط في المعدل.
 * المكوّنات مستخرجة من أعمدة دفتر التنقيط المرجعي:
 * الكراس/المشاركة/السلوك/الوظائف → التقويم المستمر، ثم الفرض، معدل النشاطات، الاختبار.
 * الأوزان يحدّدها الأستاذ في الإعدادات — لا توجد صيغة مفروضة.
 */

const CONTINUOUS_PARTS = ['notebook', 'participation', 'behavior', 'homework'] as const

interface SessionBundle {
  formula: GradeFormula
  components: ReturnType<typeof getFormulaComponents>['components']
  students: Student[]
  continuous: ContinuousEntry[]
  assessmentScores: Array<{ assessment_id: number; student_id: number; score: number | null; type: string; max_score: number; weight: number }>
  absences: Map<number, number>
}

function loadBundle(classId: number, term: number): SessionBundle {
  const cls = getClass(classId)
  if (!cls) throw new Error('القسم غير موجود')
  const yearId = cls.academic_year_id
  const { formula, components } = getFormulaComponents(yearId)

  const students = all<Student>(
    `SELECT * FROM students WHERE class_id = ? AND archived = 0
     ORDER BY sort_order ASC, last_name ASC, first_name ASC`,
    [classId]
  )
  const continuous = all<ContinuousEntry>(
    'SELECT * FROM continuous_assessment WHERE class_id = ? AND term = ?',
    [classId, term]
  )
  const assessmentScores = all<{
    assessment_id: number
    student_id: number
    score: number | null
    type: string
    max_score: number
    weight: number
  }>(
    `SELECT s.assessment_id, s.student_id, s.score, a.type, a.max_score, a.weight
     FROM assessment_scores s
     JOIN assessments a ON a.id = s.assessment_id
     WHERE a.class_id = ? AND a.term = ?`,
    [classId, term]
  )
  const absenceRows = all<{ student_id: number; c: number }>(
    `SELECT att.student_id, COUNT(*) AS c
     FROM attendance att JOIN daily_lessons dl ON dl.id = att.daily_lesson_id
     WHERE dl.class_id = ? AND att.status = 'absent'
     GROUP BY att.student_id`,
    [classId]
  )
  return {
    formula,
    components,
    students,
    continuous,
    assessmentScores,
    absences: new Map(absenceRows.map((row) => [row.student_id, row.c]))
  }
}

function componentsForStudent(bundle: SessionBundle, studentId: number): Omit<ComputedGrade, 'student_id' | 'full_name' | 'number' | 'average' | 'absences'> {
  const values = new Map<string, number | null>()
  for (const entry of bundle.continuous) {
    if (entry.student_id !== studentId) continue
    values.set(entry.kind, entry.value)
  }

  const continuous = simpleAverage(CONTINUOUS_PARTS.map((kind) => values.get(kind) ?? null))

  const scoresOfType = (type: string): Array<{ value: number | null; max: number; weight: number }> =>
    bundle.assessmentScores
      .filter((row) => row.student_id === studentId && row.type === type)
      .map((row) => ({ value: row.score, max: row.max_score, weight: row.weight }))

  const homework = weightedAverage(scoresOfType('homework'))
  const exam = weightedAverage(scoresOfType('exam'))

  const activityValues = values.get('activity')
  const activities =
    activityValues !== null && activityValues !== undefined
      ? activityValues
      : weightedAverage([...scoresOfType('activity'), ...scoresOfType('project')])

  return { continuous, homework, activities, exam }
}

/** يحسب المعدلات ويحفظها (لا يكتب فوق أي إدخال يدوي: الحقول محسوبة بالكامل) */
export function computeClassGrades(classId: number, term: number): ComputedGrade[] {
  const bundle = loadBundle(classId, term)
  const cls = getClass(classId)
  const result: ComputedGrade[] = []

  transaction(() => {
    for (const student of bundle.students) {
      const parts = componentsForStudent(bundle, student.id)
      const average = computeAverage(parts, bundle.components, bundle.formula.rounding)
      const absences = bundle.absences.get(student.id) ?? 0
      upsertGrade({
        academic_year_id: cls?.academic_year_id ?? 0,
        class_id: classId,
        student_id: student.id,
        subject_id: cls?.subject_id ?? null,
        term,
        continuous: parts.continuous,
        homework: parts.homework,
        activities: parts.activities,
        exam: parts.exam,
        average,
        absences
      })
      result.push({
        student_id: student.id,
        full_name: student.full_name,
        number: student.number,
        ...parts,
        average,
        absences
      })
    }
  })
  return result
}

export interface GradebookResult {
  rows: ComputedGrade[]
  formula: GradeFormula
  formulaDescription: string
  summary: {
    average: number | null
    highest: number | null
    lowest: number | null
    passing: number
    counted: number
    students: number
  }
}

export function gradebook(classId: number, term: number, passingThreshold = 10): GradebookResult {
  const rows = computeClassGrades(classId, term)
  const bundle = getFormulaComponents(getClass(classId)?.academic_year_id)
  const withAverage = rows.filter((row) => row.average !== null)
  const averages = withAverage.map((row) => row.average as number)
  return {
    rows,
    formula: bundle.formula,
    formulaDescription: describeFormula(bundle.components, bundle.formula.rounding),
    summary: {
      average: averages.length ? Number((averages.reduce((a, b) => a + b, 0) / averages.length).toFixed(2)) : null,
      highest: averages.length ? Math.max(...averages) : null,
      lowest: averages.length ? Math.min(...averages) : null,
      passing: withAverage.filter((row) => (row.average ?? 0) >= passingThreshold).length,
      counted: withAverage.length,
      students: rows.length
    }
  }
}

/** النقاط الخام لتلميذ في فصل — تُستعمل في صفحة التلميذ والطباعة */
export function studentAssessmentScores(studentId: number, term?: number): Array<{
  assessment_id: number
  name: string
  type: string
  term: number
  date: string
  max_score: number
  score: number | null
}> {
  return all(
    `SELECT a.id AS assessment_id, a.name, a.type, a.term, a.date, a.max_score, s.score
     FROM assessments a
     LEFT JOIN assessment_scores s ON s.assessment_id = a.id AND s.student_id = ?
     WHERE 1 = 1${term ? ' AND a.term = ?' : ''}
     ORDER BY a.term ASC, a.date DESC`,
    term ? [studentId, term] : [studentId]
  )
}

export function overallAverage(studentId: number): number | null {
  const row = one<{ avg: number | null }>('SELECT AVG(average) AS avg FROM grades WHERE student_id = ? AND average IS NOT NULL', [
    studentId
  ])
  return row?.avg != null ? Number(row.avg.toFixed(2)) : null
}
