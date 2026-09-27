import { readFileSync, writeFileSync } from 'node:fs'
import { extname } from 'node:path'
import * as XLSX from 'xlsx'
import { parseCSV } from '@shared/utils/misc'
import type { ImportMapping, ParsedTabularFile } from '@shared/types'

/** كلمات تدلّ على صفّ الترويسة — تُستعمل لتخطّي أسطر العنوان في أعلى الملف */
const HEADER_HINTS = [
  'اسم',
  'لقب',
  'رقم',
  'قسم',
  'فوج',
  'جنس',
  'ميلاد',
  'تاريخ',
  'تسجيل',
  'تعريف',
  'مستوى',
  'first',
  'last',
  'name',
  'nom',
  'prenom',
  'prénom'
]

/** أقصى عدد أسطر نبحث فيها عن الترويسة (بعض الملفات تبدأ بعنوان أو شعار) */
const MAX_HEADER_SCAN = 15

/** توحيد التباعد داخل الخلية: كل الفراغات المتتالية تصبح فراغاً واحداً */
function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeCell(value: unknown): string {
  if (value instanceof Date) return toISODate(value)
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value)
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا'
  return clean(value)
}

function hintScore(row: string[]): number {
  const cells = row.filter((cell) => cell !== '')
  if (cells.length < 2) return 0
  return cells.filter((cell) => {
    const lower = cell.toLowerCase()
    return HEADER_HINTS.some((hint) => lower.includes(hint))
  }).length
}

/** يجد رقم صفّ الترويسة الحقيقي (يتخطّى العنوان والسطور الفارغة والدمج في الأعلى) */
function detectHeaderIndex(matrix: string[][]): number {
  const limit = Math.min(matrix.length, MAX_HEADER_SCAN)
  for (let index = 0; index < limit; index++) {
    if (hintScore(matrix[index]) >= 2) return index
  }
  return 0
}

/** أسطر مكرّرة للترويسة داخل الملف (شائعة في التقارير المطبوعة) */
function isRepeatedHeader(row: string[], header: string[]): boolean {
  let matches = 0
  let filled = 0
  for (let index = 0; index < header.length; index++) {
    const cell = row[index] ?? ''
    if (cell === '') continue
    filled++
    if (cell === header[index]) matches++
  }
  return filled >= 2 && matches === filled
}

/** قراءة ملف تلاميذ من CSV أو XLSX — كل شيء محلي دون أي رفع للشبكة */
export function readTabularFile(filePath: string): ParsedTabularFile {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.xlsx' || ext === '.xls' || ext === '.xlsm') {
    // cellDates: تُرجع تواريخ إكسل كائنات Date حقيقية بدل أرقام تسلسلية
    const workbook = XLSX.readFile(filePath, { cellDates: true })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error('الملف لا يحتوي على أي ورقة.')
    const sheet = workbook.Sheets[sheetName]
    const matrix = XLSX.utils
      .sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' })
      .map((row) => (Array.isArray(row) ? row.map(normalizeCell) : []))
    return buildParsed(matrix, filePath, sheetName)
  }

  const text = readFileSync(filePath, 'utf8')
  const matrix = parseCSV(text).map((row) => row.map(normalizeCell))
  return buildParsed(matrix, filePath, null)
}

function buildParsed(matrix: string[][], filePath: string, sheetName: string | null): ParsedTabularFile {
  const filled = matrix.filter((row) => row.some((cell) => cell !== ''))
  if (filled.length === 0) throw new Error('الملف فارغ.')

  const headerRowIndex = detectHeaderIndex(filled)
  const header = filled[headerRowIndex]
  if (!header || header.every((cell) => cell === '')) throw new Error('تعذّر العثور على صفّ الترويسة في الملف.')

  const width = filled.reduce((max, row) => Math.max(max, row.length), header.length)
  const headers = Array.from({ length: width }, (_, index) => header[index] ?? '')

  const rows = filled
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => cell !== ''))
    .filter((row) => !isRepeatedHeader(row, headers))
    .map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''))

  return {
    headers,
    rows,
    filePath,
    headerRowIndex,
    sheetName,
    mapping: guessColumnMapping(headers)
  }
}

export function writeTextFile(filePath: string, content: string): void {
  writeFileSync(filePath, content, 'utf8')
}

export function writeBinaryFile(filePath: string, data: Buffer): void {
  writeFileSync(filePath, data)
}

/**
 * تخمين مطابقة الأعمدة من ترويسة الملف.
 * الترتيب مهم: الأعمدة الأدقّ تُسجَّل أولاً حتى لا يلتقط عمودٌ عامّ عموداً أهمّ
 * (مثال: «رقم التسجيل» قبل «رقم»، و«الاسم الكامل» قبل «الاسم»).
 */
export function guessColumnMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {
    first: -1,
    last: -1,
    full: -1,
    number: -1,
    gender: -1,
    birth_date: -1,
    class_name: -1,
    notes: -1
  }
  const used = new Set<number>()
  const normalize = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ')

  const take = (
    key: keyof ImportMapping,
    candidates: string[],
    guard?: (header: string) => boolean
  ): void => {
    if (mapping[key] >= 0) return
    for (const candidate of candidates) {
      const index = headers.findIndex((header, position) => {
        if (used.has(position)) return false
        const value = normalize(header)
        if (!value.includes(candidate)) return false
        return guard ? guard(value) : true
      })
      if (index >= 0) {
        mapping[key] = index
        used.add(index)
        return
      }
    }
  }

  take('full', ['الاسم الكامل', 'الاسم واللقب', 'الاسم و اللقب', 'nom complet', 'full'])
  take('first', ['الاسم', 'first', 'prénom', 'prenom'])
  take('last', ['اللقب', 'last', 'nom de famille', 'nom'])
  take(
    'number',
    ['رقم التسجيل', 'الرقم', 'رقم التلميذ', 'رقم الطالب', 'number', 'numéro', 'numero'],
    (header) => !header.includes('تعريف')
  )
  take('gender', ['الجنس', 'sexe', 'gender'])
  take('birth_date', ['الميلاد', 'تاريخ', 'naissance', 'birth'])
  take('class_name', ['الفوج', 'القسم', 'فوج', 'قسم', 'class', 'groupe'])
  take('notes', ['ملاحظ', 'observation', 'notes'])

  return mapping
}
