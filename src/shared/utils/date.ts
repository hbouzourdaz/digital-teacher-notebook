/**
 * أدوات التاريخ — تعتمد على التوقيت المحلي للنظام ولا تستعمل UTC
 * حتى لا يتغيّر "اليوم" عند تبديل المنطقة الزمنية.
 */

/** 2026-09-26 → كائن تاريخ محلي (بدون تحويل UTC) */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => Number(n))
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0)
}

/** Date → 2026-09-26 بالتوقيت المحلي */
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

/**
 * تحويل قيمة تاريخ قادمة من ملف أو إدخال يدوي إلى 2026-09-26 أو null.
 * يقبل: 2026-09-26، 26/09/2026، 26-09-2026، 26.09.2026، والرقم التسلسلي لإكسل.
 * اليوم يُقدَّم على الشهر (العرف المحلي) عند التباس الشكل.
 */
export function normalizeDateInput(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (iso) {
    const [, y, m, d] = iso
    return buildISO(Number(y), Number(m), Number(d))
  }

  const dayFirst = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (dayFirst) {
    const [, d, m, y] = dayFirst
    const year = y.length <= 2 ? (Number(y) <= 30 ? 2000 + Number(y) : 1900 + Number(y)) : Number(y)
    return buildISO(year, Number(m), Number(d))
  }

  // رقم تسلسلي لإكسل (مثلاً 39578 = 2008-05-10) عندما يُقرأ كرقم لا كتاريخ
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Number(text)
    const epoch = Date.UTC(1899, 11, 30)
    const date = new Date(epoch + Math.round(serial) * 86400000)
    if (!Number.isNaN(date.getTime())) {
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
        date.getUTCDate()
      ).padStart(2, '0')}`
    }
  }

  return null
}

function buildISO(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(year, month - 1, day, 12, 0, 0, 0)
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return toISODate(date)
}

export function currentTimeHHmm(date: Date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** رقم اليوم في الأسبوع: 0=الأحد ... 4=الخميس (يطابق Date.getDay) */
export function dayOfWeek(iso: string): number {
  return parseLocalDate(iso).getDay()
}

export function addDays(iso: string, days: number): string {
  const d = parseLocalDate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function addMonths(iso: string, months: number): string {
  const d = parseLocalDate(iso)
  d.setMonth(d.getMonth() + months)
  return toISODate(d)
}

export function startOfWeek(iso: string): string {
  const day = dayOfWeek(iso)
  return addDays(iso, -day)
}

export function startOfMonth(iso: string): string {
  const d = parseLocalDate(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function endOfMonth(iso: string): string {
  const d = parseLocalDate(iso)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)
  return toISODate(last)
}

export function startOfYear(iso: string): string {
  return `${parseLocalDate(iso).getFullYear()}-01-01`
}

export function endOfYear(iso: string): string {
  return `${parseLocalDate(iso).getFullYear()}-12-31`
}

const AR_MONTHS = [
  'جانفي',
  'فيفري',
  'مارس',
  'أفريل',
  'ماي',
  'جوان',
  'جويلية',
  'أوت',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر'
]

export function arabicMonth(iso: string): string {
  return AR_MONTHS[parseLocalDate(iso).getMonth()]
}

/** 2026-09-26 → "26 سبتمبر 2026" */
export function formatArabicDate(iso: string): string {
  const d = parseLocalDate(iso)
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** 2026-09-26 → "الأحد 26 سبتمبر 2026" */
export function formatArabicDateWithDay(iso: string, dayLabel: string): string {
  return `${dayLabel} ${formatArabicDate(iso)}`
}

const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
export function arabicDayName(iso: string): string {
  return DAY_NAMES[parseLocalDate(iso).getDay()]
}

/** تدقيق صيغة ISO YYYY-MM-DD */
export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = parseLocalDate(value)
  return !Number.isNaN(d.getTime()) && toISODate(d) === value
}

/** تدقيق صيغة HH:mm */
export function isValidTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false
  const [h, m] = value.split(':').map(Number)
  return h >= 0 && h <= 23 && m >= 0 && m <= 59
}

/** "08:00" → 480 دقيقة */
export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd)
}

/** التاريخ الهجري التقريبي غير مطلوب — نعرض فقط التاريخ الميلادي المحلي. */
export function isoNow(): string {
  const d = new Date()
  return `${toISODate(d)}T${currentTimeHHmm(d)}:00`
}
