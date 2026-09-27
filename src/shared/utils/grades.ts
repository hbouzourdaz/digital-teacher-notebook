import type { FormulaComponent } from '@shared/constants'

export type { FormulaComponent }

/**
 * حسابات التنقيط — منطق خالص قابل للاختبار.
 * لا يدّعي التطبيق وجود صيغة رسمية: الأوزان يحدّدها الأستاذ في الإعدادات.
 */

export interface FormulaInputs {
  continuous: number | null
  homework: number | null
  activities: number | null
  exam: number | null
}

export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

/**
 * المعدل = مجموع (القيمة × الوزن) ÷ مجموع الأوزان المفعّلة.
 * يُحسب فقط على المكوّنات المفعّلة والتي لها قيمة.
 * يُرجع null إذا لم تتوفر أي قيمة صالحة.
 */
export function computeAverage(
  inputs: FormulaInputs,
  components: FormulaComponent[],
  rounding = 2
): number | null {
  let weighted = 0
  let weights = 0
  for (const c of components) {
    if (!c.enabled || c.weight <= 0) continue
    const value = inputs[c.key]
    if (value === null || value === undefined || Number.isNaN(value)) continue
    weighted += value * c.weight
    weights += c.weight
  }
  if (weights === 0) return null
  return roundTo(weighted / weights, rounding)
}

/** متوسط بسيط لقائمة قيم متجاهلاً الفراغات */
export function simpleAverage(values: Array<number | null | undefined>, rounding = 2): number | null {
  const valid = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v))
  if (valid.length === 0) return null
  return roundTo(valid.reduce((a, b) => a + b, 0) / valid.length, rounding)
}

/** متوسط معدّل النشاطات (الكراس، المشاركة، السلوك، الوظائف، الأنشطة) */
export function activitiesAverage(values: Array<number | null | undefined>, _max = 20): number | null {
  return simpleAverage(values)
}

export function isValidScore(score: number | null, max: number, allowOver = false): boolean {
  if (score === null || score === undefined) return true
  if (Number.isNaN(score)) return false
  if (score < 0) return false
  return allowOver ? true : score <= max
}

/** وصف مقروء للصيغة الحالية — يُعرض للمستخدم في الإعدادات والطباعة */
export function describeFormula(components: FormulaComponent[], rounding = 2): string {
  const active = components.filter((c) => c.enabled && c.weight > 0)
  if (active.length === 0) return 'غير محدّدة — لم يتم تفعيل أي مكوّن.'
  const total = active.reduce((sum, c) => sum + c.weight, 0)
  const parts = active.map((c) => {
    const pct = Math.round((c.weight / total) * 100)
    return `${c.label} × ${c.weight} (${pct}%)`
  })
  return `المعدل = (${parts.join(' + ')}) ÷ ${total} — يُدوَّر إلى ${rounding} خانة.`
}

export function parseFormulaComponents(json: string | null | undefined): FormulaComponent[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed as FormulaComponent[]
  } catch {
    return []
  }
}

/**
 * تحويل علامة من سلّمها الخاص إلى سلّم موحّد (افتراضياً 20).
 * ضروري لأن الفرض والاختبار قد يختلفان في العلامة القصوى.
 */
export function normalizeScore(score: number, max: number, scale = 20): number {
  if (!max || max <= 0) return score
  return roundTo((score / max) * scale, 4)
}

/** متوسط مرجّح لمجموعة علامات (بعد توحيد السلّم) */
export function weightedAverage(items: Array<{ value: number | null; max: number; weight: number }>): number | null {
  let total = 0
  let weights = 0
  for (const item of items) {
    if (item.value === null || item.value === undefined) continue
    const weight = item.weight > 0 ? item.weight : 1
    total += normalizeScore(item.value, item.max) * weight
    weights += weight
  }
  if (weights === 0) return null
  return roundTo(total / weights, 2)
}

export function clampScore(value: number, max: number): number {
  if (value < 0) return 0
  if (value > max) return max
  return value
}
