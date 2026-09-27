import { describe, expect, it } from 'vitest'
import {
  clampScore,
  computeAverage,
  describeFormula,
  isValidScore,
  normalizeScore,
  parseFormulaComponents,
  roundTo,
  simpleAverage,
  weightedAverage
} from '@shared/utils/grades'
import { DEFAULT_FORMULA_COMPONENTS, type FormulaComponent } from '@shared/constants'

const components: FormulaComponent[] = [
  { key: 'continuous', label: 'التقويم المستمر', weight: 1, enabled: true },
  { key: 'homework', label: 'الفرض', weight: 1, enabled: true },
  { key: 'activities', label: 'معدل النشاطات', weight: 1, enabled: true },
  { key: 'exam', label: 'الاختبار', weight: 2, enabled: true }
]

describe('computeAverage', () => {
  it('يحسب المتوسط المرجّح على المكوّنات المفعّلة', () => {
    // (10*1 + 12*1 + 14*1 + 16*2) / 5 = 68/5 = 13.6
    const value = computeAverage({ continuous: 10, homework: 12, activities: 14, exam: 16 }, components, 2)
    expect(value).toBe(13.6)
  })

  it('يتجاهل المكوّنات المعطّلة', () => {
    const onlyExam = components.map((item) => ({ ...item, enabled: item.key === 'exam' }))
    expect(computeAverage({ continuous: 1, homework: 1, activities: 1, exam: 18 }, onlyExam, 2)).toBe(18)
  })

  it('يتجاهل القيم الفارغة', () => {
    expect(computeAverage({ continuous: 10, homework: null, activities: null, exam: null }, components, 2)).toBe(10)
  })

  it('يُرجع null عند غياب كل القيم', () => {
    expect(computeAverage({ continuous: null, homework: null, activities: null, exam: null }, components)).toBeNull()
  })

  it('يحترم عدد خانات التدوير', () => {
    expect(computeAverage({ continuous: 10, homework: 11, activities: 11, exam: 12 }, components, 0)).toBe(11)
  })

  it('يرفض الأوزان الصفرية كلياً', () => {
    const zero = components.map((item) => ({ ...item, weight: 0 }))
    expect(computeAverage({ continuous: 10, homework: 10, activities: 10, exam: 10 }, zero)).toBeNull()
  })
})

describe('normalizeScore', () => {
  it('يوحّد السلالم المختلفة إلى سلّم 20', () => {
    expect(normalizeScore(5, 10)).toBe(10)
    expect(normalizeScore(30, 60)).toBe(10)
  })

  it('يحترم السلم الافتراضي عند غياب العلامة القصوى', () => {
    expect(normalizeScore(7, 0)).toBe(7)
  })
})

describe('weightedAverage', () => {
  it('يحسب متوسطاً مرجّحاً بعد توحيد السلّم', () => {
    const value = weightedAverage([
      { value: 10, max: 20, weight: 1 },
      { value: 10, max: 20, weight: 3 }
    ])
    expect(value).toBe(10)
  })

  it('يُرجع null عند غياب القيم', () => {
    expect(weightedAverage([{ value: null, max: 20, weight: 1 }])).toBeNull()
  })
})

describe('simpleAverage', () => {
  it('يتجاهل الفراغات', () => {
    expect(simpleAverage([12, null, 16, undefined])).toBe(14)
  })
})

describe('describeFormula', () => {
  it('يصف الصيغة الحالية بوضوح', () => {
    const text = describeFormula(components, 2)
    expect(text).toContain('التقويم المستمر')
    expect(text).toContain('الاختبار')
    expect(text).toContain('÷ 5')
  })

  it('يصرّح بعدم وجود صيغة عند تعطيل كل المكوّنات', () => {
    expect(describeFormula(components.map((item) => ({ ...item, enabled: false })))).toContain('غير محدّدة')
  })
})

describe('parseFormulaComponents', () => {
  it('يفكّ الصيغة المخزّنة كنص JSON', () => {
    const parsed = parseFormulaComponents(JSON.stringify(DEFAULT_FORMULA_COMPONENTS))
    expect(parsed).toHaveLength(DEFAULT_FORMULA_COMPONENTS.length)
    expect(parsed.map((item) => item.key)).toContain('exam')
  })

  it('يُرجع مصفوفة فارغة عند نص غير صالح', () => {
    expect(parseFormulaComponents('not json').length).toBe(0)
    expect(parseFormulaComponents(null).length).toBe(0)
  })
})

describe('تحقق العلامات', () => {
  it('يرفض العلامة التي تتجاوز الحد الأقصى', () => {
    expect(isValidScore(25, 20)).toBe(false)
    expect(isValidScore(20, 20)).toBe(true)
    expect(isValidScore(0, 20)).toBe(true)
    expect(isValidScore(null, 20)).toBe(true)
  })

  it('يسمح بالتجاوز عند تفعيل الخيار', () => {
    expect(isValidScore(25, 20, true)).toBe(true)
  })

  it('يحدّ القيم السالبة', () => {
    expect(clampScore(-5, 20)).toBe(0)
    expect(clampScore(30, 20)).toBe(20)
  })

  it('roundTo يحافظ على الدقة', () => {
    expect(roundTo(13.645, 2)).toBe(13.65)
  })
})
