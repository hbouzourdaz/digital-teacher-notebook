import { describe, expect, it } from 'vitest'
import {
  conflictsFor,
  coveredSlotKeys,
  findConflicts,
  pickCurrentAndNext,
  slotForTime,
  slotRowSpan,
  type SlotLike
} from '@shared/utils/schedule'

const slot = (id: number, day: number, start: string, end: string): SlotLike => ({
  id,
  day_of_week: day,
  start_time: start,
  end_time: end
})

describe('كشف تعارض الجدول', () => {
  it('يكشف حصتين متقاطعتين في نفس اليوم', () => {
    const conflicts = findConflicts([slot(1, 0, '08:00', '09:00'), slot(2, 0, '08:30', '09:30')])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].a.id).toBe(1)
    expect(conflicts[0].b.id).toBe(2)
  })

  it('لا يعتبر الحصص المتلاصقة تعارضاً', () => {
    expect(findConflicts([slot(1, 0, '08:00', '09:00'), slot(2, 0, '09:00', '10:00')])).toHaveLength(0)
  })

  it('لا يعتبر الأيام المختلفة تعارضاً', () => {
    expect(findConflicts([slot(1, 0, '08:00', '09:00'), slot(2, 2, '08:00', '09:00')])).toHaveLength(0)
  })

  it('يكشف ثلاث حصص متقاطعة كثلاثة أزواج', () => {
    const conflicts = findConflicts([
      slot(1, 1, '08:00', '10:00'),
      slot(2, 1, '08:15', '09:00'),
      slot(3, 1, '08:30', '09:45')
    ])
    expect(conflicts).toHaveLength(3)
  })

  it('يكشف تعارض مرشّح واحد مع بقية الجدول دون احتساب نفسه', () => {
    const slots = [slot(1, 0, '08:00', '09:00'), slot(2, 0, '10:00', '11:00')]
    expect(conflictsFor(slots, slot(1, 0, '08:00', '09:00'))).toHaveLength(0)
    expect(conflictsFor(slots, slot(9, 0, '08:30', '09:30'))).toHaveLength(1)
  })
})

describe('اختيار الخانة الزمنية', () => {
  it('يعيد الخانة المطابقة للوقت', () => {
    expect(slotForTime('08:30')?.start).toBe('08:00')
    expect(slotForTime('14:10')?.start).toBe('14:00')
    expect(slotForTime('12:30')).toBeNull()
  })
})

describe('الحصص الممتدة (ساعتان)', () => {
  it('يحسب امتداد حصة الساعة الواحدة كصف واحد', () => {
    expect(slotRowSpan('09:00', '08:00')).toBe(1)
  })

  it('يحسب امتداد الحصة الممتدة ساعتين كصفّين', () => {
    expect(slotRowSpan('10:00', '08:00')).toBe(2)
    expect(slotRowSpan('15:00', '13:00')).toBe(2)
  })

  it('يحسب امتداد ثلاث ساعات كثلاثة صفوف', () => {
    expect(slotRowSpan('11:00', '08:00')).toBe(3)
  })

  it('يحدد الخانات المغطّاة بحصة ساعتين', () => {
    const covered = coveredSlotKeys(0, '08:00', '10:00')
    expect(covered.has('0|09:00')).toBe(true)
    expect(covered.has('0|08:00')).toBe(false)
    expect(covered.size).toBe(1)
  })

  it('لا يغطي حصة الساعة أي خانة أخرى', () => {
    expect(coveredSlotKeys(1, '08:00', '09:00').size).toBe(0)
  })
})

describe('الحصة الحالية والقادمة', () => {
  const slots = [
    { start_time: '08:00', end_time: '09:00', id: 1 },
    { start_time: '10:00', end_time: '11:00', id: 2 },
    { start_time: '13:00', end_time: '14:00', id: 3 }
  ]

  it('يحدّد الحصة الجارية والقادمة', () => {
    const result = pickCurrentAndNext(slots, '10:20')
    expect(result.current?.id).toBe(2)
    expect(result.next?.id).toBe(3)
  })

  it('يُرجع الحصة الأولى كقادمة قبل بداية اليوم', () => {
    const result = pickCurrentAndNext(slots, '07:00')
    expect(result.current).toBeNull()
    expect(result.next?.id).toBe(1)
  })

  it('يُرجع null بعد نهاية اليوم', () => {
    const result = pickCurrentAndNext(slots, '18:00')
    expect(result.current).toBeNull()
    expect(result.next).toBeNull()
  })
})
