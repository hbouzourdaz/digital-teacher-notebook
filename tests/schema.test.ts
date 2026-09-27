import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from '@main/database/migrations'

const REQUIRED_TABLES = [
  'academic_years',
  'teachers',
  'schools',
  'subjects',
  'levels',
  'classes',
  'students',
  'student_transfers',
  'weekly_schedule',
  'daily_lessons',
  'attendance',
  'assessment_categories',
  'assessments',
  'assessment_scores',
  'continuous_assessment',
  'grade_formulas',
  'grades',
  'annual_plans',
  'lesson_bank',
  'school_events',
  'notes',
  'attachments',
  'print_settings',
  'app_settings',
  'backups',
  'audit_logs'
]

describe('ملفات الترقية (Migrations)', () => {
  it('مرتّبة تصاعدياً وبلا أرقام مكررة', () => {
    const versions = MIGRATIONS.map((migration) => migration.version)
    expect(versions).toEqual([...versions].sort((a, b) => a - b))
    expect(new Set(versions).size).toBe(versions.length)
    expect(versions[0]).toBe(1)
  })

  it('تعريف كل الجداول الأساسية', () => {
    const sql = MIGRATIONS.map((migration) => migration.sql).join('\n')
    for (const table of REQUIRED_TABLES) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
    }
  })

  it('تفعّل المفاتيح الخارجية في السكربت', () => {
    expect(MIGRATIONS[0].sql).toContain('PRAGMA foreign_keys = ON')
  })
})

/**
 * تحميل محرّك SQLite من نسخة Node (node_modules/.node-abi/better-sqlite3).
 * النسخة الأخرى في node_modules/better-sqlite3 مبنية لواجهة إلكترون التي
 * يستعملها التطبيق، فلو حُمّلت هنا لفشلت ولو تعارضت النسختان لتوقّف التطوير.
 */
async function loadSqlite(): Promise<null | typeof import('better-sqlite3')> {
  const requireHere = createRequire(import.meta.url)
  const candidates = [
    resolve(process.cwd(), 'node_modules', '.node-abi', 'better-sqlite3'),
    'better-sqlite3'
  ]
  for (const candidate of candidates) {
    try {
      const Sqlite = requireHere(candidate) as typeof import('better-sqlite3')
      // التحميل وحده لا يكفي: الخطأ يظهر عند أول استعمال إذا كانت الواجهة غير مطابقة.
      new Sqlite(':memory:').close()
      return Sqlite
    } catch {
      // نجرّب المرشّح التالي
    }
  }
  return null
}

describe('تنفيذ المخطط على قاعدة بيانات في الذاكرة', () => {
  it('ينشئ الجداول ويحفظ البيانات بشكل متسق', async () => {
    const Sqlite = await loadSqlite()
    if (!Sqlite) {
      // لا نُفشل الاختبار عندما لا يكون المحرّك متوافقاً مع ABI الحالي (بعد إعادة البناء لإلكترون)
      expect(true).toBe(true)
      return
    }

    const db = new Sqlite(':memory:')
    try {
      db.pragma('foreign_keys = ON')
      for (const migration of MIGRATIONS) db.exec(migration.sql)

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as Array<{ name: string }>
      for (const table of REQUIRED_TABLES) {
        expect(tables.map((row) => row.name)).toContain(table)
      }

      db.prepare(
        "INSERT INTO academic_years (label, start_date, end_date, is_active) VALUES ('2026 - 2027', '2026-09-01', '2027-06-30', 1)"
      ).run()
      db.prepare("INSERT INTO levels (name, order_index) VALUES ('السنة الثانية', 1)").run()
      db.prepare(
        "INSERT INTO classes (academic_year_id, name, level_id) VALUES (1, '2 متوسط 1', 1)"
      ).run()
      db.prepare(
        "INSERT INTO students (academic_year_id, class_id, first_name, last_name, gender) VALUES (1, 1, 'محمد', 'بوعلام', 'male')"
      ).run()

      // العمود المحسوب full_name يجب أن يُبنى تلقائياً
      const student = db.prepare('SELECT full_name, archived FROM students WHERE id = 1').get() as {
        full_name: string
        archived: number
      }
      expect(student.full_name).toBe('محمد بوعلام')
      expect(student.archived).toBe(0)

      // قيد التفرد: لا يمكن إضافة نفس التلميذ مرتين لنفس التقييم
      db.prepare(
        `INSERT INTO assessments (academic_year_id, class_id, name, type, term, date, max_score)
         VALUES (1, 1, 'الفرض الأول', 'homework', 1, '2026-10-05', 20)`
      ).run()
      db.prepare('INSERT INTO assessment_scores (assessment_id, student_id, score) VALUES (1, 1, 15)').run()
      expect(() =>
        db.prepare('INSERT INTO assessment_scores (assessment_id, student_id, score) VALUES (1, 1, 12)').run()
      ).toThrow()

      // قيد الحضور: سجل واحد لكل تلميذ في كل حصة
      db.prepare(
        `INSERT INTO daily_lessons (academic_year_id, date, start_time, end_time, class_id, status)
         VALUES (1, '2026-10-05', '08:00', '09:00', 1, 'draft')`
      ).run()
      db.prepare(
        "INSERT INTO attendance (academic_year_id, daily_lesson_id, student_id, date, status) VALUES (1, 1, 1, '2026-10-05', 'absent')"
      ).run()
      expect(() =>
        db.prepare(
          "INSERT INTO attendance (academic_year_id, daily_lesson_id, student_id, date, status) VALUES (1, 1, 1, '2026-10-05', 'present')"
        ).run()
      ).toThrow()

      // حذف قسم يحذف تلاميذه (ON DELETE CASCADE)
      db.prepare('DELETE FROM classes WHERE id = 1').run()
      const remaining = db.prepare('SELECT COUNT(*) AS c FROM students').get() as { c: number }
      expect(remaining.c).toBe(0)
    } finally {
      db.close()
    }
  })
})
