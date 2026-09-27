import type { DashboardStats, TodaySlot, TodaySummary } from '@shared/types'
import { DAY_LABELS, PERIOD_LABELS, TIME_SLOTS } from '@shared/constants'
import { all, count, one, resolveYear } from '../repositories/base'
import { dayOfWeek, currentTimeHHmm, todayISO } from '@shared/utils/date'
import { pickCurrentAndNext } from '@shared/utils/schedule'

/** إحصاءات لوحة التحكم — تُحسب من قاعدة البيانات المحلية فقط */
export function dashboardStats(academicYearId?: number | null): DashboardStats {
  const yearId = resolveYear(academicYearId)
  const plan = one<{ total: number; done: number }>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
     FROM annual_plans WHERE academic_year_id = ?`,
    [yearId]
  )
  const absences = one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM attendance a JOIN daily_lessons dl ON dl.id = a.daily_lesson_id
     WHERE dl.academic_year_id = ? AND a.status = 'absent'`,
    [yearId]
  )
  return {
    classes: count('SELECT COUNT(*) AS c FROM classes WHERE academic_year_id = ?', [yearId]),
    students: count('SELECT COUNT(*) AS c FROM students WHERE academic_year_id = ? AND archived = 0', [yearId]),
    today_sessions: 0,
    recorded_lessons: count("SELECT COUNT(*) AS c FROM daily_lessons WHERE academic_year_id = ? AND status = 'recorded'", [yearId]),
    assessments: count('SELECT COUNT(*) AS c FROM assessments WHERE academic_year_id = ?', [yearId]),
    absences: absences?.c ?? 0,
    annual_plan_total: plan?.total ?? 0,
    annual_plan_done: plan?.done ?? 0
  }
}

function periodOf(time: string): string {
  const slot = TIME_SLOTS.find((s) => s.start === time)
  return PERIOD_LABELS[slot?.period ?? 'morning']
}

/** حصص اليوم مبنية على الجدول الأسبوعي + الحصص المسجّلة فعلاً */
export function todaySummary(date?: string, academicYearId?: number | null): TodaySummary {
  const yearId = resolveYear(academicYearId)
  const theDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO()
  const dow = dayOfWeek(theDate)

  const slots = all<{
    id: number
    start_time: string
    end_time: string
    class_id: number
    class_name: string | null
    subject_name: string | null
    session_type: string
    room: string | null
  }>(
    `SELECT ws.id, ws.start_time, ws.end_time, ws.class_id, c.name AS class_name, s.name AS subject_name,
       ws.session_type, ws.room
     FROM weekly_schedule ws
     LEFT JOIN classes c ON c.id = ws.class_id
     LEFT JOIN subjects s ON s.id = ws.subject_id
     WHERE ws.academic_year_id = ? AND ws.day_of_week = ?
     ORDER BY ws.start_time ASC`,
    [yearId, dow]
  )

  const lessons = all<{
    id: number
    schedule_id: number | null
    start_time: string
    class_id: number
    status: string
    title: string
  }>('SELECT id, schedule_id, start_time, class_id, status, title FROM daily_lessons WHERE academic_year_id = ? AND date = ?', [
    yearId,
    theDate
  ])

  const attendanceTaken = new Set(
    all<{ daily_lesson_id: number }>(
      `SELECT DISTINCT a.daily_lesson_id FROM attendance a
       JOIN daily_lessons dl ON dl.id = a.daily_lesson_id
       WHERE dl.academic_year_id = ? AND dl.date = ?`,
      [yearId, theDate]
    ).map((row) => row.daily_lesson_id)
  )

  const todaySlots: TodaySlot[] = slots.map((slot) => {
    const lesson =
      lessons.find((l) => l.schedule_id === slot.id) ??
      lessons.find((l) => !l.schedule_id && l.start_time === slot.start_time && l.class_id === slot.class_id)
    return {
      schedule_id: slot.id,
      start_time: slot.start_time,
      end_time: slot.end_time,
      period: periodOf(slot.start_time),
      class_id: slot.class_id,
      class_name: slot.class_name ?? '',
      subject_name: slot.subject_name,
      session_type: slot.session_type,
      room: slot.room,
      lesson_id: lesson?.id ?? null,
      recorded: lesson?.status === 'recorded',
      attendance_taken: lesson ? attendanceTaken.has(lesson.id) : false
    }
  })

  const now = currentTimeHHmm()
  const { current, next } = pickCurrentAndNext(todaySlots, dow === dayOfWeek(todayISO()) ? now : '00:00')

  const stats = dashboardStats(yearId)
  stats.today_sessions = todaySlots.length

  return {
    date: theDate,
    dayOfWeek: dow,
    dayLabel: DAY_LABELS[dow] ?? '',
    slots: todaySlots,
    nextSlot: next,
    currentSlot: current,
    stats
  }
}
