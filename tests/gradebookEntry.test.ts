import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase, runMigrations } from '@main/database/connection'
import { one, run } from '@main/repositories/base'
import {
  createAssessment,
  removeAssessment,
  saveContinuous,
  saveScores
} from '@main/repositories/assessments'
import { getFormulaComponents } from '@main/repositories/grades'
import { gradebook } from '@main/services/gradeService'

/**
 * اختبار إدخال العلامات من دفتر التنقيط:
 * كل علامة يكتبها الأستاذ في خانات الدفتر الورقي (الفرض، معدل النشاطات، الاختبار)
 * يجب أن تصل إلى الأعمدة المحسوبة والمعدل — إدخال واحد يظهر في كل مكان.
 */

const TERM = 1
let directory = ''

const assessmentPayload = (name: string, type: 'homework' | 'exam', max = 20) => ({
  academic_year_id: 1,
  class_id: 1,
  subject_id: 1,
  category_id: null,
  name,
  type,
  term: TERM as 1,
  date: '2026-09-27',
  max_score: max,
  weight: 1,
  daily_lesson_id: null,
  notes: null
})

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'notebook-gradebook-db-'))
  const database = openDatabase(join(directory, 'notebook.db'))
  runMigrations(database)
  run(`INSERT INTO academic_years (label, start_date, end_date, is_active) VALUES ('2026 - 2027', '2026-09-01', '2027-06-30', 1)`)
  run(`INSERT INTO levels (name, order_index) VALUES ('الثانية متوسط', 0)`)
  run(`INSERT INTO subjects (name, code, sort_order, is_active) VALUES ('العلوم الفيزيائية والتكنولوجيا', 'PH', 0, 1)`)
  const subject = one<{ id: number }>('SELECT id FROM subjects LIMIT 1')
  run(`INSERT INTO classes (academic_year_id, name, level_id, subject_id, sort_order) VALUES (1, '2 متوسط 1', 1, ?, 0)`, [
    subject?.id ?? null
  ])
  run(
    `INSERT INTO students (academic_year_id, class_id, first_name, last_name, number, sort_order)
     VALUES (1, 1, 'أمين', 'بوعلام', 1, 0), (1, 1, 'ياسمين', 'حداد', 2, 1)`
  )
})

afterAll(() => {
  closeDatabase()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

const rowOf = (studentId: number) => {
  const data = gradebook(1, TERM)
  const row = data.rows.find((item) => item.student_id === studentId)
  if (!row) throw new Error('التلميذ غير موجود في دفتر التنقيط')
  return row
}

describe('إدخال علامة في خانة «الفرض»', () => {
  it('تُنشأ علامة الفرض وتظهر في العمود المحسوب والمعدل', () => {
    const assessment = createAssessment(assessmentPayload('الفرض', 'homework'))
    saveScores({
      assessment_id: assessment.id,
      max_score: 20,
      entries: [
        { student_id: 1, score: 15, note: null },
        { student_id: 2, score: 9, note: null }
      ]
    })

    expect(rowOf(1).homework).toBe(15)
    expect(rowOf(2).homework).toBe(9)
    // الصيغة الافتراضية: (التقويم المستمر + الفرض + النشاطات + الاختبار×2) ÷ 5
    const components = getFormulaComponents(1).components
    expect(components.length).toBeGreaterThan(0)
    expect(rowOf(1).average).toBe(15)
  })

  it('بإضافة فرض ثانٍ يصبح عمود «الفرض» متوسطاً للأعمدة المفصّلة', () => {
    const second = createAssessment(assessmentPayload('الفرض الثاني', 'homework'))
    saveScores({
      assessment_id: second.id,
      max_score: 20,
      entries: [{ student_id: 1, score: 18, note: null }]
    })
    // (15 + 18) ÷ 2
    expect(rowOf(1).homework).toBe(16.5)
  })

  it('يحفظ علامة بسلّم مختلف بعد توحيدها إلى 20', () => {
    const third = createAssessment(assessmentPayload('فرض من 10', 'homework', 10))
    saveScores({
      assessment_id: third.id,
      max_score: 10,
      entries: [{ student_id: 2, score: 5, note: null }]
    })
    // تلميذ 2: (9 + 10) ÷ 2 = 9.5 — العلامة 5 من 10 تصبح 10 من 20
    expect(rowOf(2).homework).toBe(9.5)
  })
})

describe('إدخال علامة في خانة «معدل النشاطات»', () => {
  it('تُحفظ في التقويم المستمر (نوع النشاطات) وتظهر في العمود المحسوب', () => {
    saveContinuous({
      academic_year_id: 1,
      class_id: 1,
      term: TERM as 1,
      kind: 'activity',
      entries: [
        { student_id: 1, value: 13 },
        { student_id: 2, value: 17 }
      ]
    })
    expect(rowOf(1).activities).toBe(13)
    expect(rowOf(2).activities).toBe(17)
  })
})

describe('إدخال علامة في خانة «الاختبار»', () => {
  it('تُحسب في العمود المحسوب وتُرجَّح بوزنها في المعدل', () => {
    const exam = createAssessment(assessmentPayload('الاختبار', 'exam'))
    saveScores({
      assessment_id: exam.id,
      max_score: 20,
      entries: [
        { student_id: 1, score: 12, note: null },
        { student_id: 2, score: 20, note: null }
      ]
    })
    expect(rowOf(1).exam).toBe(12)
    // تلميذ 1: (الفرض 16.5 + النشاطات 13 + الاختبار 12×2) ÷ 4 = 53.5 ÷ 4 = 13.38
    expect(rowOf(1).average).toBe(13.38)
    // تلميذ 2: (الفرض 9.5 + النشاطات 17 + الاختبار 20×2) ÷ 4 = 66.5 ÷ 4 = 16.63
    expect(rowOf(2).average).toBe(16.63)
  })

  it('حذف عمود التقييم يُفرغ قيمته من المعدل', () => {
    const all = gradebook(1, TERM)
    expect(all.rows[0].exam).toBe(12)
    const examId = one<{ id: number }>(`SELECT id FROM assessments WHERE type = 'exam' LIMIT 1`)?.id ?? 0
    removeAssessment(examId)
    expect(rowOf(1).exam).toBeNull()
    // يبقى الفرض والنشاطات في المعدل
    expect(rowOf(1).average).toBe(14.75)
  })
})

describe('حفظ علامة مباشرة في خانة «الفرض» بلا تقييم مسبق', () => {
  it('يُظهر التقييم تلقائياً بنفس الاسم ثم تُحفظ العلامة فيه', () => {
    const cleared = one<{ c: number }>(`SELECT COUNT(*) AS c FROM assessment_scores`)?.c ?? 0
    expect(cleared).toBeGreaterThan(0)
    // مسار الواجهة نفسه: إنشاء تقييم باسم الخانة ثم حفظ العلامات
    const created = createAssessment(assessmentPayload('الاختبار', 'exam'))
    expect(created.name).toBe('الاختبار')
    saveScores({ assessment_id: created.id, max_score: 20, entries: [{ student_id: 2, score: 14, note: null }] })
    expect(rowOf(2).exam).toBe(14)
  })
})
