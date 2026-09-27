import type { DailyLesson, ScheduleSlot } from '@shared/types'
import type { LessonInput } from '@shared/schemas'
import { all, audit, count, one, resolveYear, run } from './base'
import { todayISO } from '@shared/utils/date'

const LESSON_SELECT = `
  SELECT dl.*, c.name AS class_name, s.name AS subject_name
  FROM daily_lessons dl
  LEFT JOIN classes c ON c.id = dl.class_id
  LEFT JOIN subjects s ON s.id = dl.subject_id
`

export function listLessons(options: {
  academic_year_id?: number | null
  class_id?: number | null
  from?: string
  to?: string
  date?: string
  search?: string
  limit?: number
  offset?: number
}): DailyLesson[] {
  const yearId = resolveYear(options.academic_year_id)
  const conditions = ['dl.academic_year_id = @year']
  const params: Record<string, unknown> = { year: yearId }
  if (options.class_id) {
    conditions.push('dl.class_id = @class_id')
    params.class_id = options.class_id
  }
  if (options.date) {
    conditions.push('dl.date = @date')
    params.date = options.date
  }
  if (options.from) {
    conditions.push('dl.date >= @from')
    params.from = options.from
  }
  if (options.to) {
    conditions.push('dl.date <= @to')
    params.to = options.to
  }
  if (options.search && options.search.trim()) {
    conditions.push('(dl.title LIKE @q OR dl.stages LIKE @q OR dl.notes LIKE @q)')
    params.q = `%${options.search.trim()}%`
  }
  const limit = Math.min(Math.max(options.limit ?? 300, 1), 2000)
  const offset = Math.max(options.offset ?? 0, 0)
  params.limit = limit
  params.offset = offset
  return all<DailyLesson>(
    `${LESSON_SELECT} WHERE ${conditions.join(' AND ')}
     ORDER BY dl.date DESC, dl.start_time ASC LIMIT @limit OFFSET @offset`,
    params
  )
}

export function getLesson(id: number): DailyLesson | null {
  return one<DailyLesson>(`${LESSON_SELECT} WHERE dl.id = ?`, [id]) ?? null
}

export function lessonsByClass(classId: number, limit = 100): DailyLesson[] {
  return all<DailyLesson>(
    `${LESSON_SELECT} WHERE dl.class_id = ? ORDER BY dl.date DESC, dl.start_time ASC LIMIT ?`,
    [classId, Math.min(Math.max(limit, 1), 500)]
  )
}

export function searchLessons(query: string, academicYearId?: number | null): DailyLesson[] {
  const yearId = resolveYear(academicYearId)
  return all<DailyLesson>(
    `${LESSON_SELECT} WHERE dl.academic_year_id = @year AND (dl.title LIKE @q OR dl.stages LIKE @q OR dl.notes LIKE @q)
     ORDER BY dl.date DESC LIMIT 200`,
    { year: yearId, q: `%${query.trim()}%` }
  )
}

/** تحديث حالة بند التوزيع السنوي انطلاقاً من الحصص المسجّلة المرتبطة به */
export function syncAnnualPlan(planId: number): void {
  const plan = one<{ sessions_count: number; status: string }>(
    'SELECT sessions_count, status FROM annual_plans WHERE id = ?',
    [planId]
  )
  if (!plan) return
  const recorded = count(
    "SELECT COUNT(*) AS c FROM daily_lessons WHERE annual_plan_id = ? AND status = 'recorded'",
    [planId]
  )
  if (recorded === 0) return
  if (recorded >= Math.max(plan.sessions_count, 1)) {
    run(
      "UPDATE annual_plans SET status = 'done', completed_date = COALESCE(completed_date, ?) WHERE id = ?",
      [todayISO(), planId]
    )
  } else {
    run(
      "UPDATE annual_plans SET status = CASE WHEN status = 'done' THEN status ELSE 'in_progress' END WHERE id = ?",
      [planId]
    )
  }
}

export function createLesson(input: LessonInput): DailyLesson {
  const result = run(
    `INSERT INTO daily_lessons (academic_year_id, schedule_id, date, start_time, end_time, class_id, subject_id,
       session_type, title, stages, notes, annual_plan_id, lesson_bank_id, status)
     VALUES (@academic_year_id, @schedule_id, @date, @start_time, @end_time, @class_id, @subject_id,
       @session_type, @title, @stages, @notes, @annual_plan_id, @lesson_bank_id, @status)`,
    input
  )
  audit('تسجيل حصة في الدفتر اليومي', 'daily_lessons', result.lastInsertRowid, input.title)
  if (input.annual_plan_id) syncAnnualPlan(input.annual_plan_id)
  return getLesson(result.lastInsertRowid) as DailyLesson
}

export function updateLesson(input: LessonInput & { id: number }): DailyLesson {
  run(
    `UPDATE daily_lessons SET date = @date, start_time = @start_time, end_time = @end_time, class_id = @class_id,
       subject_id = @subject_id, session_type = @session_type, title = @title, stages = @stages, notes = @notes,
       annual_plan_id = @annual_plan_id, lesson_bank_id = @lesson_bank_id, status = @status,
       updated_at = datetime('now', 'localtime')
     WHERE id = @id`,
    input
  )
  audit('تعديل حصة في الدفتر اليومي', 'daily_lessons', input.id, input.title)
  if (input.annual_plan_id) syncAnnualPlan(input.annual_plan_id)
  return getLesson(input.id) as DailyLesson
}

export function removeLesson(id: number): void {
  run('DELETE FROM daily_lessons WHERE id = ?', [id])
  audit('حذف حصة من الدفتر اليومي', 'daily_lessons', id)
}

/**
 * يضمن وجود سجل حصة لتاريخ محدّد انطلاقاً من الجدول الأسبوعي.
 * يُستعمل عند فتح الحصة من صفحة «يومي» — لا يُعاد إدخال أي بيانات يدوياً.
 */
export function ensureLessonForSlot(input: {
  academic_year_id: number
  schedule_id: number
  date: string
}): DailyLesson {
  const existing = one<DailyLesson>(
    `${LESSON_SELECT} WHERE dl.schedule_id = ? AND dl.date = ? LIMIT 1`,
    [input.schedule_id, input.date]
  )
  if (existing) return existing

  const slot = one<ScheduleSlot>(
    `SELECT ws.*, c.name AS class_name, s.name AS subject_name FROM weekly_schedule ws
     LEFT JOIN classes c ON c.id = ws.class_id
     LEFT JOIN subjects s ON s.id = ws.subject_id
     WHERE ws.id = ?`,
    [input.schedule_id]
  )
  if (!slot) throw new Error('الحصة غير موجودة في الجدول الأسبوعي')

  return createLesson({
    academic_year_id: input.academic_year_id,
    schedule_id: slot.id,
    date: input.date,
    start_time: slot.start_time,
    end_time: slot.end_time,
    class_id: slot.class_id,
    subject_id: slot.subject_id,
    session_type: slot.session_type,
    title: '',
    stages: '',
    notes: '',
    annual_plan_id: null,
    lesson_bank_id: null,
    status: 'draft'
  })
}

/** الحصة القادمة غير المسجّلة في يوم معيّن (لزر «حفظ والانتقال للحصة التالية») */
export function nextUnrecordedLesson(date: string, afterTime: string, yearId?: number): DailyLesson | null {
  const year = resolveYear(yearId)
  return (
    one<DailyLesson>(
      `${LESSON_SELECT} WHERE dl.academic_year_id = ? AND dl.date = ? AND dl.start_time > ? AND dl.status = 'draft'
       ORDER BY dl.start_time ASC LIMIT 1`,
      [year, date, afterTime]
    ) ?? null
  )
}
