import type { ScheduleSlot } from '@shared/types'
import type { ScheduleSlotInput } from '@shared/schemas'
import { all, audit, one, resolveYear, run } from './base'
import { findConflicts, conflictsFor, type SlotLike } from '@shared/utils/schedule'

const SLOT_SELECT = `
  SELECT ws.*, c.name AS class_name, s.name AS subject_name
  FROM weekly_schedule ws
  LEFT JOIN classes c ON c.id = ws.class_id
  LEFT JOIN subjects s ON s.id = ws.subject_id
`

export function listSchedule(options: { academic_year_id?: number | null; class_id?: number | null } = {}): ScheduleSlot[] {
  const yearId = resolveYear(options.academic_year_id)
  const params: unknown[] = [yearId]
  let sql = `${SLOT_SELECT} WHERE ws.academic_year_id = ?`
  if (options.class_id) {
    sql += ' AND ws.class_id = ?'
    params.push(options.class_id)
  }
  sql += ' ORDER BY ws.day_of_week ASC, ws.start_time ASC'
  return all<ScheduleSlot>(sql, params)
}

export function getSlot(id: number): ScheduleSlot | null {
  return one<ScheduleSlot>(`${SLOT_SELECT} WHERE ws.id = ?`, [id]) ?? null
}

export function listConflicts(academicYearId?: number | null): Array<{ a: ScheduleSlot; b: ScheduleSlot }> {
  const slots = listSchedule({ academic_year_id: academicYearId })
  const byId = new Map(slots.map((slot) => [slot.id, slot]))
  return findConflicts(slots as SlotLike[]).map((conflict) => ({
    a: byId.get(conflict.a.id) as ScheduleSlot,
    b: byId.get(conflict.b.id) as ScheduleSlot
  }))
}

export function weekConflictsFor(candidate: SlotLike, academicYearId: number, ignoreId?: number): ScheduleSlot[] {
  const slots = listSchedule({ academic_year_id: academicYearId }).filter((slot) => slot.id !== ignoreId)
  const hits = conflictsFor(slots as SlotLike[], candidate)
  return hits.map((hit) => slots.find((slot) => slot.id === hit.id) as ScheduleSlot)
}

export function createSlot(input: ScheduleSlotInput & { allowConflict?: boolean }): ScheduleSlot {
  const candidate: SlotLike = {
    id: 0,
    day_of_week: input.day_of_week,
    start_time: input.start_time,
    end_time: input.end_time
  }
  const conflicts = weekConflictsFor(candidate, input.academic_year_id)
  if (conflicts.length > 0 && !input.allowConflict) {
    throw new Error(`يوجد تعارض في الجدول مع حصة القسم «${conflicts[0].class_name ?? ''}» في نفس التوقيت.`)
  }
  const result = run(
    `INSERT INTO weekly_schedule (academic_year_id, day_of_week, start_time, end_time, class_id, subject_id, session_type, room, notes)
     VALUES (@academic_year_id, @day_of_week, @start_time, @end_time, @class_id, @subject_id, @session_type, @room, @notes)`,
    input
  )
  audit('إضافة حصة للجدول', 'weekly_schedule', result.lastInsertRowid)
  return getSlot(result.lastInsertRowid) as ScheduleSlot
}

export function updateSlot(input: ScheduleSlotInput & { id: number; allowConflict?: boolean }): ScheduleSlot {
  const candidate: SlotLike = {
    id: input.id,
    day_of_week: input.day_of_week,
    start_time: input.start_time,
    end_time: input.end_time
  }
  const conflicts = weekConflictsFor(candidate, input.academic_year_id, input.id)
  if (conflicts.length > 0 && !input.allowConflict) {
    throw new Error(`يوجد تعارض في الجدول مع حصة القسم «${conflicts[0].class_name ?? ''}» في نفس التوقيت.`)
  }
  run(
    `UPDATE weekly_schedule SET day_of_week = @day_of_week, start_time = @start_time, end_time = @end_time,
       class_id = @class_id, subject_id = @subject_id, session_type = @session_type, room = @room, notes = @notes
     WHERE id = @id`,
    input
  )
  audit('تعديل حصة في الجدول', 'weekly_schedule', input.id)
  return getSlot(input.id) as ScheduleSlot
}

export function moveSlot(input: {
  id: number
  day_of_week: number
  start_time: string
  end_time: string
  allowConflict?: boolean
}): ScheduleSlot {
  const current = getSlot(input.id)
  if (!current) throw new Error('الحصة غير موجودة')
  return updateSlot({
    id: input.id,
    academic_year_id: current.academic_year_id,
    day_of_week: input.day_of_week,
    start_time: input.start_time,
    end_time: input.end_time,
    class_id: current.class_id,
    subject_id: current.subject_id,
    session_type: current.session_type,
    room: current.room,
    notes: current.notes,
    allowConflict: input.allowConflict
  })
}

export function removeSlot(id: number): void {
  run('DELETE FROM weekly_schedule WHERE id = ?', [id])
  audit('حذف حصة من الجدول', 'weekly_schedule', id)
}

/** ملخّص التوزيع الأسبوعي للأقسام المسندة (يُستعمل في الطباعة والدفتر) */
export function weeklyByClass(academicYearId: number): Array<{ class_name: string; slots: ScheduleSlot[] }> {
  const slots = listSchedule({ academic_year_id: academicYearId })
  const map = new Map<string, ScheduleSlot[]>()
  for (const slot of slots) {
    const key = slot.class_name ?? 'بدون قسم'
    const list = map.get(key) ?? []
    list.push(slot)
    map.set(key, list)
  }
  return [...map.entries()].map(([class_name, list]) => ({ class_name, slots: list }))
}
