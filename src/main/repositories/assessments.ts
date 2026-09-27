import type { Assessment, AssessmentCategory, AssessmentScore, ContinuousEntry, Student } from '@shared/types'
import type { AssessmentInput, CategoryInput, ContinuousSaveInput, ScoreSaveInput } from '@shared/schemas'
import { all, audit, one, resolveYear, run, transaction } from './base'

/* ---------------------------- التصنيفات ------------------------------- */
export function listCategories(academicYearId?: number | null): AssessmentCategory[] {
  const yearId = resolveYear(academicYearId)
  return all<AssessmentCategory>(
    'SELECT * FROM assessment_categories WHERE IFNULL(academic_year_id, 0) = ? OR academic_year_id IS NULL ORDER BY order_index ASC, id ASC',
    [yearId]
  )
}

export function createCategory(input: CategoryInput): AssessmentCategory {
  const result = run(
    `INSERT INTO assessment_categories (academic_year_id, name, kind, max_default, weight, order_index, is_active)
     VALUES (@academic_year_id, @name, @kind, @max_default, @weight, @order_index, @is_active)`,
    input
  )
  audit('إضافة تصنيف تقييم', 'assessment_categories', result.lastInsertRowid, input.name)
  return one<AssessmentCategory>('SELECT * FROM assessment_categories WHERE id = ?', [result.lastInsertRowid]) as AssessmentCategory
}

export function updateCategory(input: CategoryInput & { id: number }): AssessmentCategory {
  run(
    `UPDATE assessment_categories SET name = @name, kind = @kind, max_default = @max_default, weight = @weight,
       order_index = @order_index, is_active = @is_active WHERE id = @id`,
    input
  )
  return one<AssessmentCategory>('SELECT * FROM assessment_categories WHERE id = ?', [input.id]) as AssessmentCategory
}

export function removeCategory(id: number): void {
  run('DELETE FROM assessment_categories WHERE id = ?', [id])
  audit('حذف تصنيف تقييم', 'assessment_categories', id)
}

/* ---------------------------- التقييمات -------------------------------- */
const ASSESSMENT_SELECT = `
  SELECT a.*, c.name AS class_name, cat.name AS category_name,
    (SELECT COUNT(*) FROM assessment_scores s WHERE s.assessment_id = a.id AND s.score IS NOT NULL) AS scores_count
  FROM assessments a
  LEFT JOIN classes c ON c.id = a.class_id
  LEFT JOIN assessment_categories cat ON cat.id = a.category_id
`

export function listAssessments(filters: {
  academic_year_id?: number | null
  class_id?: number | null
  term?: number
  type?: string
}): Assessment[] {
  const yearId = resolveYear(filters.academic_year_id)
  const conditions = ['a.academic_year_id = @year']
  const params: Record<string, unknown> = { year: yearId }
  if (filters.class_id) {
    conditions.push('a.class_id = @class_id')
    params.class_id = filters.class_id
  }
  if (filters.term) {
    conditions.push('a.term = @term')
    params.term = filters.term
  }
  if (filters.type) {
    conditions.push('a.type = @type')
    params.type = filters.type
  }
  return all<Assessment>(
    `${ASSESSMENT_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY a.date DESC, a.id DESC`,
    params
  )
}

export function getAssessment(id: number): Assessment | null {
  return one<Assessment>(`${ASSESSMENT_SELECT} WHERE a.id = ?`, [id]) ?? null
}

export function createAssessment(input: AssessmentInput): Assessment {
  const result = run(
    `INSERT INTO assessments (academic_year_id, class_id, subject_id, category_id, name, type, term, date, max_score, weight, daily_lesson_id, notes)
     VALUES (@academic_year_id, @class_id, @subject_id, @category_id, @name, @type, @term, @date, @max_score, @weight, @daily_lesson_id, @notes)`,
    input
  )
  audit('إنشاء تقييم', 'assessments', result.lastInsertRowid, input.name)
  return getAssessment(result.lastInsertRowid) as Assessment
}

export function updateAssessment(input: AssessmentInput & { id: number }): Assessment {
  run(
    `UPDATE assessments SET class_id = @class_id, subject_id = @subject_id, category_id = @category_id, name = @name,
       type = @type, term = @term, date = @date, max_score = @max_score, weight = @weight,
       daily_lesson_id = @daily_lesson_id, notes = @notes WHERE id = @id`,
    input
  )
  audit('تعديل تقييم', 'assessments', input.id, input.name)
  return getAssessment(input.id) as Assessment
}

export function removeAssessment(id: number): void {
  run('DELETE FROM assessments WHERE id = ?', [id])
  audit('حذف تقييم', 'assessments', id)
}

/** نسخ تقييم إلى تاريخ/فصل آخر مع نسخ العلامات (Copy Previous Assessment) */
export function copyAssessment(input: {
  from_assessment_id: number
  name: string
  date: string
  term?: number
  overwrite: boolean
}): Assessment {
  const source = getAssessment(input.from_assessment_id)
  if (!source) throw new Error('التقييم المصدر غير موجود')
  const created = transaction(() => {
    const result = run(
      `INSERT INTO assessments (academic_year_id, class_id, subject_id, category_id, name, type, term, date, max_score, weight, daily_lesson_id, notes)
       VALUES (@academic_year_id, @class_id, @subject_id, @category_id, @name, @type, @term, @date, @max_score, @weight, @daily_lesson_id, @notes)`,
      {
        academic_year_id: source.academic_year_id,
        class_id: source.class_id,
        subject_id: source.subject_id,
        category_id: source.category_id,
        name: input.name,
        type: source.type,
        term: input.term ?? source.term,
        date: input.date,
        max_score: source.max_score,
        weight: source.weight,
        daily_lesson_id: null,
        notes: source.notes
      }
    )
    const newId = result.lastInsertRowid
    const scores = all<{ student_id: number; score: number | null; note: string | null }>(
      'SELECT student_id, score, note FROM assessment_scores WHERE assessment_id = ?',
      [source.id]
    )
    for (const score of scores) {
      run(
        `INSERT INTO assessment_scores (assessment_id, student_id, score, note) VALUES (?, ?, ?, ?)
         ON CONFLICT(assessment_id, student_id) DO UPDATE SET score = excluded.score, note = excluded.note`,
        [newId, score.student_id, score.score, score.note]
      )
    }
    return newId
  })
  audit('نسخ تقييم', 'assessments', created, `${source.name} → ${input.name}`)
  return getAssessment(created) as Assessment
}

/* ------------------------------ العلامات ------------------------------- */
export function assessmentScores(
  assessmentId: number
): Array<{ student: Student; score: AssessmentScore | null }> {
  const assessment = getAssessment(assessmentId)
  if (!assessment) throw new Error('التقييم غير موجود')
  const students = all<Student>(
    'SELECT * FROM students WHERE class_id = ? AND archived = 0 ORDER BY sort_order ASC, last_name ASC, first_name ASC',
    [assessment.class_id]
  )
  const scores = all<AssessmentScore>('SELECT * FROM assessment_scores WHERE assessment_id = ?', [assessmentId])
  const map = new Map(scores.map((s) => [s.student_id, s]))
  return students.map((student) => ({ student, score: map.get(student.id) ?? null }))
}

export function saveScores(input: ScoreSaveInput): { saved: number } {
  const assessment = getAssessment(input.assessment_id)
  if (!assessment) throw new Error('التقييم غير موجود')
  const max = input.max_score || assessment.max_score

  for (const entry of input.entries) {
    if (entry.score === null || entry.score === undefined) continue
    if (entry.score < 0) throw new Error('العلامة لا يمكن أن تكون سالبة.')
    if (entry.score > max) {
      throw new Error(`العلامة ${entry.score} تتجاوز العلامة القصوى (${max}). عدّل العلامة القصوى أولاً.`)
    }
  }

  let saved = 0
  transaction(() => {
    for (const entry of input.entries) {
      run(
        `INSERT INTO assessment_scores (assessment_id, student_id, score, note)
         VALUES (@assessment_id, @student_id, @score, @note)
         ON CONFLICT(assessment_id, student_id) DO UPDATE SET
           score = excluded.score, note = excluded.note, updated_at = datetime('now', 'localtime')`,
        {
          assessment_id: input.assessment_id,
          student_id: entry.student_id,
          score: entry.score ?? null,
          note: entry.note ?? null
        }
      )
      saved++
    }
  })
  audit('إدخال علامات تقييم', 'assessments', input.assessment_id, `${saved} علامة`)
  return { saved }
}

/* -------------------------- التقويم المستمر ---------------------------- */
export function listContinuous(classId: number, term: number, academicYearId?: number | null): ContinuousEntry[] {
  const yearId = resolveYear(academicYearId)
  return all<ContinuousEntry>(
    'SELECT * FROM continuous_assessment WHERE class_id = ? AND term = ? AND academic_year_id = ?',
    [classId, term, yearId]
  )
}

export function saveContinuous(input: ContinuousSaveInput): { saved: number } {
  let saved = 0
  transaction(() => {
    for (const entry of input.entries) {
      run(
        `INSERT INTO continuous_assessment (academic_year_id, class_id, student_id, term, kind, value)
         VALUES (@year, @class_id, @student_id, @term, @kind, @value)
         ON CONFLICT(student_id, term, kind) DO UPDATE SET
           value = excluded.value, class_id = excluded.class_id, updated_at = datetime('now', 'localtime')`,
        {
          year: input.academic_year_id,
          class_id: input.class_id,
          student_id: entry.student_id,
          term: input.term,
          kind: input.kind,
          value: entry.value ?? null
        }
      )
      saved++
    }
  })
  return { saved }
}
