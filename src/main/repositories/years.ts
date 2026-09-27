import type { AcademicYear } from '@shared/types'
import type { AcademicYearInput } from '@shared/schemas'
import { all, audit, count, one, run, transaction } from './base'
import { DEFAULT_FORMULA_COMPONENTS, CONTINUOUS_KINDS, SETTING_KEYS } from '@shared/constants'
import { ensureDefaultLevels } from './org'
import { setSetting } from './settings'

export function listYears(): AcademicYear[] {
  return all<AcademicYear>('SELECT * FROM academic_years ORDER BY label DESC')
}

export function getYear(id: number): AcademicYear | null {
  return one<AcademicYear>('SELECT * FROM academic_years WHERE id = ?', [id]) ?? null
}

/** يُنشئ الإعدادات الافتراضية لسنة دراسية جديدة (تصنيفات + صيغة معدل) */
function seedYearDefaults(yearId: number): void {
  const hasFormula = count('SELECT COUNT(*) AS c FROM grade_formulas WHERE academic_year_id = ?', [yearId])
  if (hasFormula === 0) {
    run(
      'INSERT INTO grade_formulas (academic_year_id, name, components, rounding, is_active) VALUES (?, ?, ?, ?, 1)',
      [yearId, 'صيغة افتراضية قابلة للتعديل', JSON.stringify(DEFAULT_FORMULA_COMPONENTS), 2]
    )
  }
  CONTINUOUS_KINDS.forEach((kind, index) => {
    run(
      `INSERT OR IGNORE INTO assessment_categories (academic_year_id, name, kind, max_default, weight, order_index, is_active)
       VALUES (?, ?, ?, 20, 1, ?, 1)`,
      [yearId, kind.label, kind.value, index]
    )
  })
}

export function createYear(input: AcademicYearInput): AcademicYear {
  ensureDefaultLevels()
  const created = transaction(() => {
    const result = run(
      'INSERT INTO academic_years (label, start_date, end_date, is_active, is_archived) VALUES (@label, @start_date, @end_date, 0, 0)',
      input
    )
    seedYearDefaults(result.lastInsertRowid)
    return result.lastInsertRowid
  })
  audit('إنشاء سنة دراسية', 'academic_years', created, input.label)
  const total = count('SELECT COUNT(*) AS c FROM academic_years')
  if (total === 1) activateYear(created)
  return getYear(created) as AcademicYear
}

export function updateYear(input: AcademicYearInput & { id: number }): AcademicYear {
  run('UPDATE academic_years SET label = @label, start_date = @start_date, end_date = @end_date WHERE id = @id', input)
  audit('تعديل سنة دراسية', 'academic_years', input.id, input.label)
  return getYear(input.id) as AcademicYear
}

export function removeYear(id: number): void {
  const total = count('SELECT COUNT(*) AS c FROM academic_years')
  if (total <= 1) throw new Error('لا يمكن حذف السنة الدراسية الوحيدة.')
  const wasActive = (getYear(id)?.is_active ?? 0) === 1
  run('DELETE FROM academic_years WHERE id = ?', [id])
  audit('حذف سنة دراسية', 'academic_years', id)
  if (wasActive) {
    const next = one<{ id: number }>('SELECT id FROM academic_years ORDER BY label DESC LIMIT 1')
    if (next) activateYear(next.id)
  }
}

export function activateYear(id: number): AcademicYear {
  transaction(() => {
    run('UPDATE academic_years SET is_active = 0')
    run('UPDATE academic_years SET is_active = 1, is_archived = 0 WHERE id = ?', [id])
    setSetting(SETTING_KEYS.activeYearId, String(id))
  })
  audit('تفعيل سنة دراسية', 'academic_years', id)
  return getYear(id) as AcademicYear
}

export function archiveYear(id: number, archived: boolean): AcademicYear {
  run('UPDATE academic_years SET is_archived = ? WHERE id = ?', [archived ? 1 : 0, id])
  audit(archived ? 'أرشفة سنة دراسية' : 'إلغاء أرشفة سنة', 'academic_years', id)
  return getYear(id) as AcademicYear
}

export interface CloneOptions {
  copy: { classes: boolean; schedule: boolean; bank: boolean; plan: boolean; settings: boolean }
}

/** نسخ بيانات سنة دراسية إلى سنة جديدة (أقسام، جدول، بنك دروس، توزيع سنوي) */
export function cloneYear(id: number, input: { label: string; start_date: string; end_date: string } & CloneOptions): AcademicYear {
  const source = getYear(id)
  if (!source) throw new Error('السنة المصدر غير موجودة')
  const created = transaction(() => {
    const result = run(
      'INSERT INTO academic_years (label, start_date, end_date, is_active, is_archived) VALUES (?, ?, ?, 0, 0)',
      [input.label, input.start_date, input.end_date]
    )
    const newId = result.lastInsertRowid
    seedYearDefaults(newId)

    const classMap = new Map<number, number>()
    if (input.copy.classes) {
      const classes = all<{ id: number; name: string; level_id: number | null; stream: string | null; subject_id: number | null; notes: string | null; sort_order: number }>(
        'SELECT * FROM classes WHERE academic_year_id = ?',
        [id]
      )
      for (const cls of classes) {
        const inserted = run(
          'INSERT INTO classes (academic_year_id, name, level_id, stream, subject_id, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [newId, cls.name, cls.level_id, cls.stream, cls.subject_id, cls.notes, cls.sort_order]
        )
        classMap.set(cls.id, inserted.lastInsertRowid)
      }
    }

    if (input.copy.schedule) {
      const slots = all<{
        day_of_week: number
        start_time: string
        end_time: string
        class_id: number
        subject_id: number | null
        session_type: string
        room: string | null
        notes: string | null
      }>('SELECT * FROM weekly_schedule WHERE academic_year_id = ?', [id])
      for (const slot of slots) {
        const mapped = classMap.get(slot.class_id)
        if (!mapped) continue
        run(
          `INSERT INTO weekly_schedule (academic_year_id, day_of_week, start_time, end_time, class_id, subject_id, session_type, room, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [newId, slot.day_of_week, slot.start_time, slot.end_time, mapped, slot.subject_id, slot.session_type, slot.room, slot.notes]
        )
      }
    }

    if (input.copy.bank) {
      const items = all<{
        title: string
        level_id: number | null
        subject_id: number | null
        domain: string | null
        unit: string | null
        duration: string | null
        objectives: string
        stages: string
        notes: string
      }>('SELECT * FROM lesson_bank WHERE academic_year_id = ?', [id])
      for (const item of items) {
        run(
          `INSERT INTO lesson_bank (academic_year_id, title, level_id, subject_id, domain, unit, duration, objectives, stages, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [newId, item.title, item.level_id, item.subject_id, item.domain, item.unit, item.duration, item.objectives, item.stages, item.notes]
        )
      }
    }

    if (input.copy.plan) {
      const items = all<{
        level_id: number | null
        subject_id: number | null
        term: number
        domain: string | null
        unit: string | null
        lesson_title: string
        sessions_count: number
        notes: string | null
      }>('SELECT * FROM annual_plans WHERE academic_year_id = ?', [id])
      for (const item of items) {
        run(
          `INSERT INTO annual_plans (academic_year_id, level_id, subject_id, term, domain, unit, lesson_title, sessions_count, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'not_started', ?)`,
          [newId, item.level_id, item.subject_id, item.term, item.domain, item.unit, item.lesson_title, item.sessions_count, item.notes]
        )
      }
    }

    return newId
  })

  audit('نسخ سنة دراسية', 'academic_years', created, input.label)
  return getYear(created) as AcademicYear
}

/** ملخّص ما سيتأثر بحذف سنة (يُعرض في تأكيد الحذف) */
export function yearImpact(id: number): Record<string, number> {
  return {
    classes: count('SELECT COUNT(*) AS c FROM classes WHERE academic_year_id = ?', [id]),
    students: count('SELECT COUNT(*) AS c FROM students WHERE academic_year_id = ?', [id]),
    schedule: count('SELECT COUNT(*) AS c FROM weekly_schedule WHERE academic_year_id = ?', [id]),
    lessons: count('SELECT COUNT(*) AS c FROM daily_lessons WHERE academic_year_id = ?', [id]),
    assessments: count('SELECT COUNT(*) AS c FROM assessments WHERE academic_year_id = ?', [id])
  }
}
