import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { guessColumnMapping, readTabularFile } from '@main/filesystem/studentFiles'
import { normalizeDateInput } from '@shared/utils/date'

/**
 * ملف اختبار يُبنى برمجياً بنفس بنية ملفات كشوف التلاميذ الحقيقية:
 * سطر عنوان في الأعلى، ثم الترويسة، ثم التلاميذ — مع تواريخ إكسل حقيقية
 * وأسماء أفواج فيها تباعد غير منتظم. لا يحتوي أي معطيات حقيقية.
 */
const HEADERS = [
  'رقم التعريف',
  'اللقب',
  'الاسم',
  'الجنس',
  'تاريخ الميلاد',
  'الفوج التربوي',
  'رقم التسجيل'
]

let directory = ''
let workbookPath = ''

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'notebook-import-'))
  workbookPath = join(directory, 'أفواجي التربوية.xlsx')
  const sheet = XLSX.utils.aoa_to_sheet([
    ['أفواجي التربوية'],
    HEADERS,
    [1100819090010800, 'بن سالم', 'فؤاد', 'ذكر', new Date(2008, 4, 9), 'رابعة  متوسط     1', 47],
    [1100819090026300, 'بوعلام', 'ياسمين', 'أنثى', new Date(2009, 0, 21), 'ثانية  متوسط   2', 192],
    // ترويسة مكرّرة داخل الملف — يجب تخطّيها
    HEADERS,
    [1100919090005900, 'خدي', 'عيسى', 'ذكر', new Date(2008, 11, 3), 'رابعة متوسط 1', 12]
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
  XLSX.writeFile(workbook, workbookPath)
})

afterAll(() => {
  if (directory) rmSync(directory, { recursive: true, force: true })
})

describe('قراءة ملف التلاميذ', () => {
  it('يتخطّى سطر العنوان ويكتشف صفّ الترويسة الحقيقي', () => {
    const parsed = readTabularFile(workbookPath)
    expect(parsed.headerRowIndex).toBe(1)
    expect(parsed.headers).toEqual(HEADERS)
    expect(parsed.sheetName).toBe('Sheet1')
  })

  it('يحوّل تواريخ إكسل إلى صيغة ISO ويوحّد التباعد في أسماء الأفواج', () => {
    const parsed = readTabularFile(workbookPath)
    expect(parsed.rows).toHaveLength(3)
    expect(parsed.rows[0][4]).toBe('2008-05-09')
    expect(parsed.rows[0][5]).toBe('رابعة متوسط 1')
    expect(parsed.rows[1][5]).toBe('ثانية متوسط 2')
    expect(parsed.rows[1][3]).toBe('أنثى')
  })

  it('يتجاهل صفوف الترويسة المكرّرة داخل الملف', () => {
    const parsed = readTabularFile(workbookPath)
    expect(parsed.rows.map((row) => row[2])).toEqual(['فؤاد', 'ياسمين', 'عيسى'])
  })

  it('يطابق الأعمدة تلقائياً: اللقب/الاسم/الجنس/الميلاد/الفوج/رقم التسجيل', () => {
    const parsed = readTabularFile(workbookPath)
    expect(parsed.mapping).toEqual({
      first: 2,
      last: 1,
      full: -1,
      number: 6,
      gender: 3,
      birth_date: 4,
      class_name: 5,
      notes: -1
    })
  })
})

describe('تخمين مطابقة الأعمدة', () => {
  it('لا يخلط بين «رقم التعريف» و«رقم التسجيل»', () => {
    const mapping = guessColumnMapping(['رقم التعريف', 'الاسم', 'اللقب', 'رقم التسجيل'])
    expect(mapping.number).toBe(3)
  })

  it('يفضّل «الاسم الكامل» ثم يعود إلى الاسم واللقب', () => {
    expect(guessColumnMapping(['الاسم الكامل']).full).toBe(0)
    const mapping = guessColumnMapping(['الاسم الكامل', 'اللقب'])
    expect(mapping.full).toBe(0)
    expect(mapping.last).toBe(1)
    expect(mapping.first).toBe(-1)
  })

  it('يعترف بالترويسات الإنجليزية والفرنسية', () => {
    const mapping = guessColumnMapping(['Nom', 'Prenom', 'Sexe', 'Date de naissance', 'Groupe'])
    expect(mapping.last).toBe(0)
    expect(mapping.first).toBe(1)
    expect(mapping.gender).toBe(2)
    expect(mapping.birth_date).toBe(3)
    expect(mapping.class_name).toBe(4)
  })
})

describe('توحيد تواريخ الميلاد', () => {
  it('يقبل صيغاً متعددة', () => {
    expect(normalizeDateInput('2008-05-09')).toBe('2008-05-09')
    expect(normalizeDateInput('9/5/2008')).toBe('2008-05-09')
    expect(normalizeDateInput('09-05-2008')).toBe('2008-05-09')
    expect(normalizeDateInput('09.05.2008')).toBe('2008-05-09')
    expect(normalizeDateInput('2026/9/6')).toBe('2026-09-06')
    expect(normalizeDateInput('9/5/08')).toBe('2008-05-09')
  })

  it('يفسّر الرقم التسلسلي لإكسل', () => {
    expect(normalizeDateInput('39578')).toBe('2008-05-10')
    expect(normalizeDateInput('44927')).toBe('2023-01-01')
  })

  it('يرفض القيم غير الصالحة أو الفارغة', () => {
    expect(normalizeDateInput('31/02/2026')).toBeNull()
    expect(normalizeDateInput('غير معروف')).toBeNull()
    expect(normalizeDateInput('')).toBeNull()
    expect(normalizeDateInput(null)).toBeNull()
    expect(normalizeDateInput(undefined)).toBeNull()
  })
})
