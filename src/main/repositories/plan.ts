import type { AnnualPlanItem, LessonBankItem } from '@shared/types'
import type { LessonBankInput, PlanInput } from '@shared/schemas'
import { all, audit, count, one, resolveYear, run } from './base'

/* --------------------------- التوزيع السنوي ---------------------------- */
const PLAN_SELECT = `
  SELECT ap.*, l.name AS level_name
  FROM annual_plans ap
  LEFT JOIN levels l ON l.id = ap.level_id
`

export function listPlan(filters: {
  academic_year_id?: number | null
  level_id?: number | null
  subject_id?: number | null
  term?: number
}): AnnualPlanItem[] {
  const yearId = resolveYear(filters.academic_year_id)
  const conditions = ['ap.academic_year_id = @year']
  const params: Record<string, unknown> = { year: yearId }
  if (filters.level_id) {
    conditions.push('ap.level_id = @level_id')
    params.level_id = filters.level_id
  }
  if (filters.subject_id) {
    conditions.push('ap.subject_id = @subject')
    params.subject = filters.subject_id
  }
  if (filters.term) {
    conditions.push('ap.term = @term')
    params.term = filters.term
  }
  return all<AnnualPlanItem>(
    `${PLAN_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY ap.term ASC, ap.id ASC`,
    params
  )
}

export function getPlanItem(id: number): AnnualPlanItem | null {
  return one<AnnualPlanItem>(`${PLAN_SELECT} WHERE ap.id = ?`, [id]) ?? null
}

export function createPlanItem(input: PlanInput): AnnualPlanItem {
  const result = run(
    `INSERT INTO annual_plans (academic_year_id, level_id, subject_id, term, domain, unit, lesson_title, sessions_count, status, expected_date, completed_date, notes)
     VALUES (@academic_year_id, @level_id, @subject_id, @term, @domain, @unit, @lesson_title, @sessions_count, @status, @expected_date, @completed_date, @notes)`,
    input
  )
  audit('إضافة بند للتوزيع السنوي', 'annual_plans', result.lastInsertRowid, input.lesson_title)
  return getPlanItem(result.lastInsertRowid) as AnnualPlanItem
}

export function updatePlanItem(input: PlanInput & { id: number }): AnnualPlanItem {
  run(
    `UPDATE annual_plans SET level_id = @level_id, subject_id = @subject_id, term = @term, domain = @domain,
       unit = @unit, lesson_title = @lesson_title, sessions_count = @sessions_count, status = @status,
       expected_date = @expected_date, completed_date = @completed_date, notes = @notes WHERE id = @id`,
    input
  )
  audit('تعديل بند في التوزيع السنوي', 'annual_plans', input.id, input.lesson_title)
  return getPlanItem(input.id) as AnnualPlanItem
}

export function removePlanItem(id: number): void {
  run('DELETE FROM annual_plans WHERE id = ?', [id])
  audit('حذف بند من التوزيع السنوي', 'annual_plans', id)
}

export function planProgress(academicYearId?: number | null): {
  total: number
  done: number
  inProgress: number
  late: number
  notStarted: number
} {
  const yearId = resolveYear(academicYearId)
  const row = one<{ total: number; done: number; inProgress: number; late: number; notStarted: number }>(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
       SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS inProgress,
       SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late,
       SUM(CASE WHEN status = 'not_started' THEN 1 ELSE 0 END) AS notStarted
     FROM annual_plans WHERE academic_year_id = ?`,
    [yearId]
  )
  return {
    total: row?.total ?? 0,
    done: row?.done ?? 0,
    inProgress: row?.inProgress ?? 0,
    late: row?.late ?? 0,
    notStarted: row?.notStarted ?? 0
  }
}

/** بنود التوزيع المطابقة لمستوى قسم معيّن — تُستعمل عند ربط الحصة بدرس */
export function planForLevel(levelId: number | null, term?: number, academicYearId?: number): AnnualPlanItem[] {
  const yearId = resolveYear(academicYearId)
  if (!levelId) return []
  return all<AnnualPlanItem>(
    `${PLAN_SELECT} WHERE ap.academic_year_id = ? AND ap.level_id = ?${term ? ' AND ap.term = ?' : ''}
     ORDER BY ap.term ASC, ap.id ASC`,
    term ? [yearId, levelId, term] : [yearId, levelId]
  )
}

/* ---------------------------- بنك الدروس ------------------------------- */
const BANK_SELECT = `
  SELECT lb.*, l.name AS level_name
  FROM lesson_bank lb
  LEFT JOIN levels l ON l.id = lb.level_id
`

export function listBank(filters: { academic_year_id?: number | null; level_id?: number | null; search?: string } = {}): LessonBankItem[] {
  const yearId = resolveYear(filters.academic_year_id)
  const conditions = ['lb.academic_year_id = @year']
  const params: Record<string, unknown> = { year: yearId }
  if (filters.level_id) {
    conditions.push('lb.level_id = @level_id')
    params.level_id = filters.level_id
  }
  if (filters.search && filters.search.trim()) {
    conditions.push('(lb.title LIKE @q OR lb.objectives LIKE @q OR lb.stages LIKE @q OR lb.unit LIKE @q)')
    params.q = `%${filters.search.trim()}%`
  }
  return all<LessonBankItem>(
    `${BANK_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY lb.title ASC`,
    params
  )
}

export function getBankItem(id: number): LessonBankItem | null {
  return one<LessonBankItem>(`${BANK_SELECT} WHERE lb.id = ?`, [id]) ?? null
}

export function createBankItem(input: LessonBankInput): LessonBankItem {
  const result = run(
    `INSERT INTO lesson_bank (academic_year_id, title, level_id, subject_id, domain, unit, duration, objectives, stages, notes)
     VALUES (@academic_year_id, @title, @level_id, @subject_id, @domain, @unit, @duration, @objectives, @stages, @notes)`,
    input
  )
  audit('إضافة درس إلى بنك الدروس', 'lesson_bank', result.lastInsertRowid, input.title)
  return getBankItem(result.lastInsertRowid) as LessonBankItem
}

export function updateBankItem(input: LessonBankInput & { id: number }): LessonBankItem {
  run(
    `UPDATE lesson_bank SET title = @title, level_id = @level_id, subject_id = @subject_id, domain = @domain,
       unit = @unit, duration = @duration, objectives = @objectives, stages = @stages, notes = @notes WHERE id = @id`,
    input
  )
  audit('تعديل درس في بنك الدروس', 'lesson_bank', input.id, input.title)
  return getBankItem(input.id) as LessonBankItem
}

export function removeBankItem(id: number): void {
  run('DELETE FROM lesson_bank WHERE id = ?', [id])
  audit('حذف درس من بنك الدروس', 'lesson_bank', id)
}

export function bankCount(academicYearId?: number | null): number {
  return count('SELECT COUNT(*) AS c FROM lesson_bank WHERE academic_year_id = ?', [resolveYear(academicYearId)])
}
