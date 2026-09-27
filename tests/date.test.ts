import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  arabicDayName,
  arabicMonth,
  endOfMonth,
  formatArabicDate,
  isValidISODate,
  isValidTime,
  minutesToTime,
  parseLocalDate,
  startOfMonth,
  startOfWeek,
  timeToMinutes,
  toISODate
} from '@shared/utils/date'

describe('التواريخ المحلية', () => {
  it('يحوّل نص ISO إلى تاريخ محلي ويعود بالنص نفسه (بدون انزياح UTC)', () => {
    const iso = '2026-09-26'
    expect(toISODate(parseLocalDate(iso))).toBe(iso)
  })

  it('يعطي يوم الأسبوع الصحيح: الأحد = 0', () => {
    expect(parseLocalDate('2026-09-27').getDay()).toBe(0)
    expect(arabicDayName('2026-09-27')).toBe('الأحد')
    expect(arabicDayName('2026-09-30')).toBe('الأربعاء')
  })

  it('يضيف الأيام وتُترك الأشهر تلقائياً', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('يضيف الأشهر', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-03-03')
    expect(addMonths('2026-09-15', 3)).toBe('2026-12-15')
  })

  it('يحسب بداية الأسبوع (الأحد) وبداية/نهاية الشهر', () => {
    expect(startOfWeek('2026-09-30')).toBe('2026-09-27')
    expect(startOfMonth('2026-09-30')).toBe('2026-09-01')
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28')
  })

  it('يعرض أسماء الأشهر بالعربية المستعملة في الجزائر', () => {
    expect(arabicMonth('2026-01-05')).toBe('جانفي')
    expect(arabicMonth('2026-09-05')).toBe('سبتمبر')
  })

  it('ينسّق التاريخ بالعربية', () => {
    expect(formatArabicDate('2026-09-26')).toBe('26 سبتمبر 2026')
  })
})

describe('التحقق من الصيغ', () => {
  it('يرفض التواريخ غير الصحيحة', () => {
    expect(isValidISODate('2026-09-26')).toBe(true)
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('26/09/2026')).toBe(false)
    expect(isValidISODate('')).toBe(false)
  })

  it('يرفض الأوقات غير الصحيحة', () => {
    expect(isValidTime('08:00')).toBe(true)
    expect(isValidTime('23:59')).toBe(true)
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('8:00')).toBe(false)
  })
})

describe('أدوات الوقت', () => {
  it('يحوّل الوقت إلى دقائق ويعود', () => {
    expect(timeToMinutes('08:00')).toBe(480)
    expect(timeToMinutes('13:30')).toBe(810)
    expect(minutesToTime(480)).toBe('08:00')
  })
})
