import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase, runMigrations } from '@main/database/connection'
import { one, run } from '@main/repositories/base'
import { savePrintSettings } from '@main/repositories/settings'
import { buildDocument } from '@main/printing/documents'
import { planSheets, usableHeightPx } from '@main/printing/paginate'
import { PRINT_DOCUMENTS, printLink } from '@shared/print'

/**
 * اختبارات وثائق الطباعة: تُبنى من قاعدة بيانات حقيقية (بيانات اختبار فقط)
 * وتتحقق من أن الوثيقة تحمل محتوى الحصص، وأن نطاق إعدادات الطباعة يُطبّق،
 * وأن وثيقة «الدفتر اليومي» تُبنى بالسياق القادم من زرّ الطباعة في التطبيق.
 */

const DAY_ONE = '2026-09-27' // الأحد
const DAY_TWO = '2026-09-28' // الإثنين

let directory = ''

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'notebook-print-db-'))
  const database = openDatabase(join(directory, 'notebook.db'))
  runMigrations(database)
  run(`INSERT INTO academic_years (label, start_date, end_date, is_active) VALUES ('2026 - 2027', '2026-09-01', '2027-06-30', 1)`)
  run(`INSERT INTO levels (name, order_index) VALUES ('الثانية متوسط', 0)`)
  const level = one<{ id: number }>('SELECT id FROM levels LIMIT 1')
  const subject = one<{ id: number }>('SELECT id FROM subjects LIMIT 1')
  run(`INSERT INTO classes (academic_year_id, name, level_id, subject_id, sort_order) VALUES (1, '2 متوسط 1', ?, ?, 0)`, [
    level?.id ?? null,
    subject?.id ?? null
  ])
  run(
    `INSERT INTO students (academic_year_id, class_id, first_name, last_name, number, sort_order)
     VALUES (1, 1, 'أمين', 'بوعلام', 1, 0), (1, 1, 'ياسمين', 'حداد', 2, 1)`
  )
  const lesson = (date: string, title: string, start: string, end: string): void => {
    run(
      `INSERT INTO daily_lessons (academic_year_id, class_id, subject_id, date, start_time, end_time, session_type, title, stages, notes)
       VALUES (1, 1, ?, ?, ?, ?, 'درس', ?, 'وضعية الانطلاق ثم الحصيلة', '')`,
      [subject?.id ?? null, date, start, end, title]
    )
  }
  lesson(DAY_ONE, 'التحولات الكيميائية', '08:00', '09:00')
  lesson(DAY_ONE, 'الذرة والجزيئات', '09:00', '10:00')
  lesson(DAY_TWO, 'أشكال الطاقة', '10:00', '11:00')
  // غياب مسجّل في الحصة الأولى (تلميذ واحد غائب وآخر متأخر)
  const first = one<{ id: number }>(`SELECT id FROM daily_lessons WHERE title = 'التحولات الكيميائية'`)
  run(`INSERT INTO attendance (academic_year_id, daily_lesson_id, student_id, date, status) VALUES (1, ?, 1, ?, 'absent')`, [
    first?.id ?? 0,
    DAY_ONE
  ])
  run(`INSERT INTO attendance (academic_year_id, daily_lesson_id, student_id, date, status) VALUES (1, ?, 2, ?, 'late')`, [
    first?.id ?? 0,
    DAY_ONE
  ])
})

afterAll(() => {
  closeDatabase()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

describe('وثيقة الدفتر اليومي', () => {
  it('تعرض الحصص المسجّلة بترتيب زمني تصاعدي مع عناوين الأيام', () => {
    const doc = buildDocument({
      document: 'daily-notebook',
      options: { includeHeader: true, from: DAY_ONE, to: DAY_TWO }
    })
    expect(doc.title).toBe('الدفتر اليومي')
    expect(doc.orientation).toBe('portrait')
    expect(doc.html).toContain('التحولات الكيميائية')
    expect(doc.html).toContain('أشكال الطاقة')
    expect(doc.html).toContain('وضعية الانطلاق ثم الحصيلة')
    // عنوان اليوم بصيغة عربية مع اسم اليوم (الأحد)
    expect(doc.html).toContain('الأحد')
    expect(doc.html.indexOf('التحولات الكيميائية')).toBeLessThan(doc.html.indexOf('أشكال الطاقة'))
    expect(doc.html).toContain('يوم')
  })

  it('تُقيّد بالمدى الزمني المطلوب', () => {
    const day = buildDocument({ document: 'daily-notebook', options: { includeHeader: true, date: DAY_TWO, from: DAY_TWO, to: DAY_TWO } })
    expect(day.html).toContain('أشكال الطاقة')
    expect(day.html).not.toContain('التحولات الكيميائية')
  })

  it('تُظهر حصيلة الغياب المسجّل للحصة', () => {
    const doc = buildDocument({ document: 'daily-notebook', options: { includeHeader: true, from: DAY_ONE, to: DAY_ONE } })
    expect(doc.html).toContain('الغياب المسجّل')
    expect(doc.html).toContain('>1<') // غياب واحد + تأخر واحد في اليوم
  })

  it('تشرح للمستخدم كيف يُظهر حصصاً عندما لا توجد بيانات في المدى', () => {
    const doc = buildDocument({ document: 'daily-notebook', options: { includeHeader: true, from: '2026-01-01', to: '2026-01-02' } })
    expect(doc.html).toContain('لا توجد حصص مسجّلة')
  })
})

describe('رأس الوثيقة وإعدادات الطباعة', () => {
  it('يحترم خيار «إظهار رأس الوثيقة»', () => {
    const withHeader = buildDocument({ document: 'daily-notebook', options: { includeHeader: true, from: DAY_ONE, to: DAY_ONE } })
    const withoutHeader = buildDocument({ document: 'daily-notebook', options: { includeHeader: false, from: DAY_ONE, to: DAY_ONE } })
    expect(withHeader.html).toContain('class="doc-head"')
    expect(withoutHeader.html).not.toContain('class="doc-head"')
  })

  it('يُطبّق إعدادات النطاق الخاص بالوثيقة قبل النطاق العام', () => {
    savePrintSettings({
      scope: 'default',
      header_text: null,
      footer_text: null,
      paper: 'A4',
      orientation: 'portrait',
      margin_mm: 12,
      font_size: 12,
      font_family: 'Amiri',
      show_logo: 0,
      logo_path: null
    })
    savePrintSettings({
      scope: 'daily-notebook',
      header_text: 'ثانوية الأمير عبد القادر',
      footer_text: 'وثيقة داخلية',
      paper: 'A4',
      orientation: 'portrait',
      margin_mm: 18,
      font_size: 14,
      font_family: 'Traditional Arabic',
      show_logo: 0,
      logo_path: null
    })

    const scoped = buildDocument({ document: 'daily-notebook', options: { includeHeader: true, from: DAY_ONE, to: DAY_ONE } })
    expect(scoped.html).toContain('ثانوية الأمير عبد القادر')
    expect(scoped.html).toContain('padding:18mm')
    expect(scoped.html).toContain('font-size:14px')
    expect(scoped.html).toContain("'Traditional Arabic'")

    // وثيقة أخرى بلا نطاق خاص تبقى على النطاق العام
    const other = buildDocument({ document: 'class-list', options: { includeHeader: true, class_id: 1 } })
    expect(other.html).toContain('padding:12mm')
    expect(other.html).toContain('font-size:12px')
  })
})

describe('التمييز اللوني للنتائج والخطوط المضمّنة', () => {
  it('يُلوّن المعدلات حسب العتبة المطلوبة', () => {
    // تلميذ 1: معدل مرتفع — تلميذ 2: بلا نقاط
    for (const kind of ['notebook', 'participation', 'behavior', 'homework']) {
      run(
        `INSERT INTO continuous_assessment (academic_year_id, class_id, student_id, term, kind, value)
         VALUES (1, 1, 1, 1, ?, 17)`,
        [kind]
      )
    }
    const low = buildDocument({
      document: 'term-results',
      options: { includeHeader: true, class_id: 1, term: 1, passing_threshold: 19 }
    })
    expect(low.html).toContain('pill-bad')
    const high = buildDocument({
      document: 'term-results',
      options: { includeHeader: true, class_id: 1, term: 1, passing_threshold: 5 }
    })
    expect(high.html).toContain('pill-ok')
    expect(high.html).toContain('يبلغ العتبة أو يفوقها')
  })

  it('تُضمّن الخطوط المحلية في الوثيقة (Amiri + Tajawal) بلا شبكة', () => {
    const doc = buildDocument({ document: 'daily-notebook', options: { includeHeader: true, date: DAY_ONE, from: DAY_ONE, to: DAY_ONE } })
    expect(doc.html).toContain("font-family:'Amiri'")
    expect(doc.html).toContain("font-family:'Tajawal'")
    expect(doc.html).toContain("src:url('file:///")
    expect(doc.html).not.toMatch(/https?:\/\//)
  })
})

describe('غلاف الوثيقة وترقيم الأوراق', () => {
  it('كل وثيقة لها غلاف يحمل هويتها ومحتواها', () => {
    for (const document of PRINT_DOCUMENTS) {
      const doc = buildDocument({
        document,
        options: {
          includeHeader: true,
          class_id: 1,
          term: 1,
          student_id: 1,
          from: DAY_ONE,
          to: DAY_TWO,
          date: DAY_ONE
        }
      })
      expect(doc.cover, document).toContain('cover-band')
      expect(doc.cover, document).toContain('cover-card')
      expect(doc.cover, document).toContain('cover-sign')
      expect(doc.cover, document).toContain('تقرير داخلي')
      expect(doc.sheet.coverHtml, document).toBe(doc.cover)
      expect(doc.sheet.coverHtml.length).toBeGreaterThan(400)
    }
  })

  it('يعرض الغلاف عنوان الوثيقة وفترتها ومحتواها', () => {
    const doc = buildDocument({
      document: 'daily-notebook',
      options: { includeHeader: true, class_id: 1, term: 1, date: DAY_ONE, from: DAY_ONE, to: DAY_ONE }
    })
    expect(doc.cover).toContain('الدفتر اليومي')
    expect(doc.cover).toContain('الأحد')
    expect(doc.cover).toContain('محتوى الوثيقة')
    expect(doc.cover).toContain('cover-list')
    expect(doc.cover).toContain('cover-facts')
  })

  it('يوزّع جسم الوثيقة على وحدات قابلة للترقيم كلها معلَّمة للقياس', () => {
    const doc = buildDocument({
      document: 'daily-notebook',
      options: { includeHeader: true, class_id: 1, from: DAY_ONE, to: DAY_TWO }
    })
    expect(doc.sheet.units.length).toBeGreaterThan(3)
    expect(doc.sheet.bodyHtml).toContain('data-unit="0"')
    expect(doc.sheet.page.heightMm).toBe(297)
    expect(doc.sheet.page.footMm).toBeGreaterThan(0)
  })

  it('كل يوم من الدفتر اليومي يبدأ ورقة مستقلة (ويُطبع وحده)', () => {
    const doc = buildDocument({
      document: 'daily-notebook',
      options: { includeHeader: true, class_id: 1, from: DAY_ONE, to: DAY_TWO }
    })
    const dayUnits = doc.sheet.units.filter((unit) => /class="dayhead"/.test(unit.html))
    expect(dayUnits).toHaveLength(2)
    expect(dayUnits[0].breakBefore).toBeUndefined() // اليوم الأول يتبع كتلة الملخص
    expect(dayUnits[1].breakBefore).toBe(true) // واليوم التالي يبدأ ورقة جديدة
    expect(dayUnits[1].label).toContain('الإثنين') // اسم الورقة = تاريخ اليوم العربي

    // بدون قياس ارتفاعات (أصفار) يبقى قطع الأيام هو الفاصل الوحيد
    const plan = planSheets(doc.sheet.units, usableHeightPx(doc.sheet.page), 1)
    expect(plan.pages.length).toBeGreaterThanOrEqual(2)
    const pagesWithDays = plan.pages.filter((page) =>
      page.some((index) => /class="dayhead"/.test(doc.sheet.units[index].html))
    )
    expect(pagesWithDays).toHaveLength(2)
    // لا ورقة تحمل يومين معاً، فيمكن للأستاذ طبع يوم واحد بلا قطع حصة
    for (const page of pagesWithDays) {
      expect(page.filter((index) => /class="dayhead"/.test(doc.sheet.units[index].html))).toHaveLength(1)
    }
  })
})

describe('مسار الطباعة من شاشات التطبيق', () => {
  it('يحمل الوثيقة وسياقها', () => {
    expect(printLink({ document: 'daily-notebook', classId: 3, from: DAY_ONE, to: DAY_TWO })).toBe(
      '/print?document=daily-notebook&class=3&from=2026-09-27&to=2026-09-28'
    )
    expect(printLink({ document: 'gradebook', classId: 3, term: 2 })).toBe('/print?document=gradebook&class=3&term=2')
    expect(printLink({ document: 'timetable' })).toBe('/print?document=timetable')
    expect(printLink({ document: 'gradebook', classId: 1, term: 1, threshold: 12 })).toBe(
      '/print?document=gradebook&class=1&term=1&threshold=12'
    )
    expect(printLink({ document: 'student-report', classId: 1, studentId: 9, term: 1 })).toBe(
      '/print?document=student-report&class=1&term=1&student=9'
    )
  })
})
