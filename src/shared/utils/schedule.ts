import { TIME_SLOTS, TIME_SLOTS as SLOTS } from '@shared/constants'
import { rangesOverlap, timeToMinutes } from './date'

export interface SlotLike {
  id: number
  day_of_week: number
  start_time: string
  end_time: string
}

export interface Conflict {
  a: SlotLike
  b: SlotLike
}

/**
 * كشف تعارض الجدول: حصتان لنفس الأستاذ في نفس اليوم مع تقاطع في الوقت.
 * الأستاذ واحد، لذلك أي تقاطع زمني يُعدّ تعارضاً حتى لو اختلف القسم.
 */
export function findConflicts(slots: SlotLike[]): Conflict[] {
  const conflicts: Conflict[] = []
  const sorted = [...slots].sort((x, y) => x.day_of_week - y.day_of_week || timeToMinutes(x.start_time) - timeToMinutes(y.start_time))
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]
      const b = sorted[j]
      if (a.day_of_week !== b.day_of_week) continue
      if (rangesOverlap(a.start_time, a.end_time, b.start_time, b.end_time)) conflicts.push({ a, b })
    }
  }
  return conflicts
}

/** تعارضات حصة واحدة مع بقية الجدول */
export function conflictsFor(slots: SlotLike[], candidate: SlotLike): SlotLike[] {
  return slots.filter(
    (slot) =>
      slot.id !== candidate.id &&
      slot.day_of_week === candidate.day_of_week &&
      rangesOverlap(candidate.start_time, candidate.end_time, slot.start_time, slot.end_time)
  )
}

/** الخانة الزمنية المطابقة لوقت معيّن، أو null */
export function slotForTime(time: string): (typeof TIME_SLOTS)[number] | null {
  const minutes = timeToMinutes(time)
  return (
    SLOTS.find((slot) => timeToMinutes(slot.start) <= minutes && minutes < timeToMinutes(slot.end)) ?? null
  )
}

/**
 * عدد صفوف الشبكة التي تغطيها حصة (1 = ساعة، 2 = حصة ساعتين…).
 * تُحسب بعدد التوقيتات المرجعية التي يقع بدايتها داخل مدة الحصة.
 */
export function slotRowSpan(endTime: string, startTime: string): number {
  return SLOTS.filter(
    (slot) => timeToMinutes(slot.start) >= timeToMinutes(startTime) && timeToMinutes(slot.start) < timeToMinutes(endTime)
  ).length
}

/** مفاتيح الخانات التي تغطيها حصة (باستثناء خانة البداية) — لتفادي عرض حصتين فوق بعض */
export function coveredSlotKeys(dayOfWeek: number, startTime: string, endTime: string): Set<string> {
  const keys = new Set<string>()
  const span = slotRowSpan(endTime, startTime)
  const index = SLOTS.findIndex((slot) => slot.start === startTime)
  if (index < 0) return keys
  for (let offset = 1; offset < span; offset++) {
    const slot = SLOTS[index + offset]
    if (slot) keys.add(`${dayOfWeek}|${slot.start}`)
  }
  return keys
}

/** الحصة الحالية والقادمة حسب الوقت المحلي */
export function pickCurrentAndNext<T extends { start_time: string; end_time: string }>(
  slots: T[],
  now: string
): { current: T | null; next: T | null } {
  const minutes = timeToMinutes(now)
  const ordered = [...slots].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
  const current =
    ordered.find(
      (slot) => timeToMinutes(slot.start_time) <= minutes && minutes < timeToMinutes(slot.end_time)
    ) ?? null
  const next = ordered.find((slot) => timeToMinutes(slot.start_time) > minutes) ?? null
  return { current, next }
}
