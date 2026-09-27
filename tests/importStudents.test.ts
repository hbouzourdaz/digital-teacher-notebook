import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase, runMigrations } from '@main/database/connection'
import { listClasses } from '@main/repositories/classes'
import { importStudents, listStudents } from '@main/repositories/students'
import { one, run } from '@main/repositories/base'

/** لا نُفشل المجموعة عندما لا تكون نسخة الاختبارات من محرّك SQLite متوفرة */
function sqliteAvailable(): boolean {
  try {
    const requireHere = createRequire(import.meta.url)
    const localCopy = resolve(process.cwd(), 'node_modules', '.node-abi', 'better-sqlite3')
    const Database = requireHere(existsSync(localCopy) ? localCopy : 'better-sqlite3')
    new Database(':memory:').close()
    return true
  } catch {
    return false
  }
}

let directory = ''

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'notebook-import-db-'))
  const database = openDatabase(join(directory, 'notebook.db'))
  runMigrations(database)
  run(
    `INSERT INTO academic_years (label, start_date, end_date, is_active)
     VALUES ('2026 - 2027', '2026-09-01', '2027-06-30', 1)`
  )
})

afterAll(() => {
  closeDatabase()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

const rows = [
  {
    first_name: 'فؤاد',
    last_name: 'بن سالم',
    number: 47,
    gender: 'male' as const,
    birth_date: '2008-05-10',
    class_name: 'رابعة  متوسط     1'
  },
  {
    first_name: 'ياسمين',
    last_name: 'بوعلام',
    number: 192,
    gender: 'female' as const,
    birth_date: '21/01/2009',
    class_name: 'ثانية متوسط 2'
  },
  // مكرر داخل نفس القسم
  {
    first_name: 'فؤاد',
    last_name: 'بن سالم',
    number: 48,
    gender: 'male' as const,
    birth_date: null,
    class_name: 'رابعة متوسط 1'
  },
  // نفس الاسم لكن في قسم آخر — مقبول
  {
    first_name: 'فؤاد',
    last_name: 'بن سالم',
    number: 5,
    gender: 'male' as const,
    birth_date: null,
    class_name: 'رابعة متوسط 2'
  },
  // سطر غير صالح
  {
    first_name: '',
    last_name: 'بدون اسم',
    number: null,
    gender: null,
    birth_date: null,
    class_name: 'رابعة متوسط 1'
  }
]

describe.skipIf(!sqliteAvailable())('استيراد التلاميذ إلى قاعدة البيانات', () => {
  it('يوزّع التلاميذ على الأقسام وينشئ الأقسام الناقصة', () => {
    const result = importStudents(1, null, rows, true, { createMissingClasses: true })

    expect(result.inserted).toBe(3)
    expect(result.skipped).toBe(2)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('الاسم أو اللقب فارغ')
    expect(result.createdClasses.sort()).toEqual(['ثانية متوسط 2', 'رابعة متوسط 1', 'رابعة متوسط 2'].sort())
    expect(result.byClass).toEqual([
      { class_name: 'ثانية متوسط 2', inserted: 1 },
      { class_name: 'رابعة متوسط 1', inserted: 1 },
      { class_name: 'رابعة متوسط 2', inserted: 1 }
    ])
  })

  it('يوحّد تباعد أسماء الأقسام ولا يُنشئ قسماً مكرراً', () => {
    const classes = listClasses({ academic_year_id: 1 })
    expect(classes.map((row) => row.name).sort()).toEqual(
      ['ثانية متوسط 2', 'رابعة متوسط 1', 'رابعة متوسط 2'].sort()
    )
  })

  it('يحفظ تاريخ الميلاد بصيغة ISO والرقم لكل تلميذ في قسمه', () => {
    const students = listStudents({ academic_year_id: 1 })
    expect(students).toHaveLength(3)

    const فؤاد = students.find((student) => student.class_name === 'رابعة متوسط 1')
    expect(فؤاد?.birth_date).toBe('2008-05-10')
    expect(فؤاد?.number).toBe(47)

    const ياسمين = students.find((student) => student.class_name === 'ثانية متوسط 2')
    expect(ياسمين?.birth_date).toBe('2009-01-21')
    expect(ياسمين?.gender).toBe('female')
  })

  it('لا يعيد إضافة نفس التلميذ عند تكرار الاستيراد', () => {
    const result = importStudents(1, null, rows, true, { createMissingClasses: true })
    expect(result.inserted).toBe(0)
    expect(result.skipped).toBe(5)
    expect(result.createdClasses).toEqual([])
    expect(listStudents({ academic_year_id: 1 })).toHaveLength(3)
  })

  it('يتخطّى أسطر الأقسام غير الموجودة عند تعطيل الإنشاء التلقائي', () => {
    const result = importStudents(
      1,
      null,
      [
        {
          first_name: 'أمينة',
          last_name: 'زيتوني',
          number: null,
          gender: 'female' as const,
          birth_date: null,
          class_name: 'قسم غير موجود'
        }
      ],
      true,
      { createMissingClasses: false }
    )
    expect(result.inserted).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.errors[0]).toContain('قسم غير موجود')
  })

  it('يسجّل العملية والأقسام الجديدة في سجل العمليات', () => {
    const entry = one<{ action: string; details: string }>(
      "SELECT action, details FROM audit_logs WHERE action = 'استيراد تلاميذ' ORDER BY id ASC LIMIT 1"
    )
    expect(entry?.action).toBe('استيراد تلاميذ')
    expect(entry?.details).toContain('تمت إضافة 3')
    expect(entry?.details).toContain('أقسام جديدة: 3')
    expect(one<{ c: number }>("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'إضافة قسم'")?.c).toBe(3)
  })
})
