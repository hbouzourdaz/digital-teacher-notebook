import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatNumber,
  fullName,
  humanizeError,
  initials,
  normalizeArabic,
  parseCSV,
  parseNumber,
  safeFileName,
  toCSV,
  uniqueBy
} from '@shared/utils/misc'

describe('تطبيع النص العربي', () => {
  it('يجعل البحث متسامحاً مع الهمزات والتشكيل', () => {
    expect(normalizeArabic('أحمد')).toBe(normalizeArabic('احمد'))
    expect(normalizeArabic('فاطمة')).toBe(normalizeArabic('فاطمه'))
    expect(normalizeArabic('مُحَمَّد')).toBe('محمد')
    expect(normalizeArabic('  علي  حسن ')).toBe('علي حسن')
  })
})

describe('تحليل CSV', () => {
  it('يفصل الأعمدة بفواصل عادية', () => {
    const rows = parseCSV('الاسم,اللقب\nمحمد,بوعلام')
    expect(rows).toEqual([
      ['الاسم', 'اللقب'],
      ['محمد', 'بوعلام']
    ])
  })

  it('يستعمل الفاصلة المنقوطة عندما تكون هي السائدة', () => {
    const rows = parseCSV('الاسم;اللقب\nمحمد;بوعلام')
    expect(rows[1]).toEqual(['محمد', 'بوعلام'])
  })

  it('يدعم علامات التنصيص والخلايا متعددة الأسطر', () => {
    const rows = parseCSV('a,b\n"سطر\nآخر","قيمة,بفاصلة"')
    expect(rows[1][0]).toBe('سطر\nآخر')
    expect(rows[1][1]).toBe('قيمة,بفاصلة')
  })

  it('يتجاهل الأسطر الفارغة', () => {
    expect(parseCSV('a,b\n\n,\n1,2').length).toBe(2)
  })

  it('يصدّر CSV مع BOM لضمان ظهور العربية في Excel', () => {
    const csv = toCSV(['الاسم', 'اللقب'], [['محمد', 'بوعلام']])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('محمد')
  })

  it('يُهرّب الفواصل وعلامات التنصيص عند التصدير', () => {
    const csv = toCSV(['a'], [['قيمة,بفاصلة']])
    expect(csv).toContain('"قيمة,بفاصلة"')
  })
})

describe('أدوات الأرقام والنصوص', () => {
  it('يحوّل الأرقام المكتوبة بالفاصلة العشرية', () => {
    expect(parseNumber('12,5')).toBe(12.5)
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber(7)).toBe(7)
  })

  it('ينسّق الأرقام للعرض', () => {
    expect(formatNumber(13.6)).toBe('13.60')
    expect(formatNumber(13)).toBe('13')
    expect(formatNumber(null)).toBe('—')
  })

  it('ينسّق الأحجام', () => {
    expect(formatBytes(0)).toBe('0 ب')
    expect(formatBytes(2048)).toContain('ك.ب')
  })

  it('يبني الاسم الكامل ويستخرج الأحرف الأولى', () => {
    expect(fullName('محمد', 'بوعلام')).toBe('محمد بوعلام')
    expect(initials('محمد بوعلام')).toBe('مب')
    expect(initials('')).toBe('؟')
  })

  it('يجعل أسماء الملفات آمنة', () => {
    expect(safeFileName('قائمة/التلاميذ: 2م1')).not.toContain('/')
    expect(safeFileName('قائمة/التلاميذ: 2م1')).not.toContain(':')
  })

  it('يحوّل أخطاء قاعدة البيانات إلى رسائل عربية مفهومة', () => {
    expect(humanizeError(new Error('UNIQUE constraint failed: students.id'))).toContain('مكررة')
    expect(humanizeError(new Error('SQLITE_ERROR: near "x"'))).toContain('تعذر حفظ البيانات')
    expect(humanizeError(new Error('رسالة عادية'))).toBe('رسالة عادية')
  })

  it('يزيل التكرار حسب مفتاح', () => {
    const unique = uniqueBy([{ id: 1 }, { id: 1 }, { id: 2 }], (item) => item.id)
    expect(unique).toHaveLength(2)
  })
})
