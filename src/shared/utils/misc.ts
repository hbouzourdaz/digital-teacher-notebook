import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}

/** تطبيع النص العربي: إزالة التشكيل وتوحيد الألف والهاء لتحسين البحث */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text)
}

/** الأرقام تُعرض دائماً بالأرقام اللاتينية الواضحة (أفضل للطباعة والقراءة في الجداول) */
export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const rounded = Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals)
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(decimals)
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 ب'
  const units = ['ب', 'ك.ب', 'م.ب', 'غ.ب']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function parseNumber(input: unknown): number | null {
  if (input === null || input === undefined || input === '') return null
  const value = typeof input === 'number' ? input : Number(String(input).replace(',', '.').trim())
  return Number.isFinite(value) ? value : null
}

/** تحليل CSV بسيط يدعم الفواصل وعلامات التنصيص */
export function parseCSV(text: string, delimiter?: string): string[][] {
  const content = text.replace(/^\uFEFF/, '')
  const firstLine = content.split(/\r?\n/)[0] ?? ''
  const sep =
    delimiter ?? (firstLine.includes('\t') ? '\t' : firstLine.split(';').length > firstLine.split(',').length ? ';' : ',')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === sep) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function escapeCSVCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCSV(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(escapeCSVCell).join(','), ...rows.map((r) => r.map(escapeCSVCell).join(','))]
  return '\uFEFF' + lines.join('\r\n')
}

export function fullName(first: string, last: string): string {
  return `${(first || '').trim()} ${(last || '').trim()}`.trim()
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '؟'
  if (parts.length === 1) return parts[0].slice(0, 2)
  return `${parts[0][0]}${parts[1][0]}`
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 80)
}

/** استخراج رسالة خطأ عربية من أي استثناء دون كشف تفاصيل تقنية */
export function humanizeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (/UNIQUE constraint/i.test(raw)) return 'توجد قيمة مكررة. تحقق من البيانات.'
  if (/FOREIGN KEY constraint/i.test(raw)) return 'لا يمكن تنفيذ العملية لوجود بيانات مرتبطة.'
  if (/NOT NULL constraint/i.test(raw)) return 'هناك حقل مطلوب فارغ.'
  if (/SQLITE/i.test(raw)) return 'تعذر حفظ البيانات. يرجى التحقق من المعلومات.'
  return raw || 'حدث خطأ غير متوقع.'
}

export function uniqueBy<T, K>(items: T[], key: (item: T) => K): T[] {
  const seen = new Set<K>()
  const out: T[] = []
  for (const item of items) {
    const k = key(item)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}
