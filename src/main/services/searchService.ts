import type { SearchResult } from '@shared/types'
import { all, resolveYear } from '../repositories/base'

/**
 * البحث الشامل (Ctrl+K) — يبحث في كل وحدات الدفتر داخل السنة الحالية.
 * كل النتائج تحمل مساراً داخلياً لفتح الشاشة المناسبة مباشرة.
 */
export function globalSearch(query: string, academicYearId?: number | null): SearchResult[] {
  const term = query.trim()
  if (term.length < 1) return []
  const yearId = resolveYear(academicYearId)
  const like = `%${term}%`
  const results: SearchResult[] = []

  const students = all<{ id: number; full_name: string; class_name: string | null; number: number | null }>(
    `SELECT st.id, st.first_name || ' ' || st.last_name AS full_name, c.name AS class_name, st.number
     FROM students st LEFT JOIN classes c ON c.id = st.class_id
     WHERE st.academic_year_id = ? AND (st.first_name LIKE ? OR st.last_name LIKE ? OR st.full_name LIKE ?)
     LIMIT 15`,
    [yearId, like, like, like]
  )
  results.push(
    ...students.map((row) => ({
      kind: 'تلميذ',
      label: row.full_name,
      sub: `${row.class_name ?? 'بدون قسم'}${row.number ? ` — رقم ${row.number}` : ''}`,
      id: row.id,
      route: `/students/${row.id}`
    }))
  )

  const classes = all<{ id: number; name: string; level_name: string | null; students_count: number }>(
    `SELECT c.id, c.name, l.name AS level_name,
       (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.archived = 0) AS students_count
     FROM classes c LEFT JOIN levels l ON l.id = c.level_id
     WHERE c.academic_year_id = ? AND c.name LIKE ? LIMIT 10`,
    [yearId, like]
  )
  results.push(
    ...classes.map((row) => ({
      kind: 'قسم',
      label: row.name,
      sub: `${row.level_name ?? ''} — ${row.students_count} تلميذ`,
      id: row.id,
      route: `/classes/${row.id}`
    }))
  )

  const lessons = all<{ id: number; title: string; date: string; class_name: string | null }>(
    `SELECT dl.id, dl.title, dl.date, c.name AS class_name
     FROM daily_lessons dl LEFT JOIN classes c ON c.id = dl.class_id
     WHERE dl.academic_year_id = ? AND (dl.title LIKE ? OR dl.stages LIKE ? OR dl.notes LIKE ?)
     ORDER BY dl.date DESC LIMIT 15`,
    [yearId, like, like, like]
  )
  results.push(
    ...lessons.map((row) => ({
      kind: 'درس',
      label: row.title || 'حصة بدون عنوان',
      sub: `${row.date} — ${row.class_name ?? ''}`,
      id: row.id,
      route: `/notebook?lesson=${row.id}`
    }))
  )

  const assessments = all<{ id: number; name: string; date: string; class_name: string | null; type: string }>(
    `SELECT a.id, a.name, a.date, c.name AS class_name, a.type
     FROM assessments a LEFT JOIN classes c ON c.id = a.class_id
     WHERE a.academic_year_id = ? AND a.name LIKE ? ORDER BY a.date DESC LIMIT 10`,
    [yearId, like]
  )
  results.push(
    ...assessments.map((row) => ({
      kind: 'تقييم',
      label: row.name,
      sub: `${row.date} — ${row.class_name ?? ''}`,
      id: row.id,
      route: `/assessments?assessment=${row.id}`
    }))
  )

  const bank = all<{ id: number; title: string; unit: string | null }>(
    'SELECT id, title, unit FROM lesson_bank WHERE academic_year_id = ? AND (title LIKE ? OR unit LIKE ? OR objectives LIKE ?) LIMIT 10',
    [yearId, like, like, like]
  )
  results.push(
    ...bank.map((row) => ({
      kind: 'بنك الدروس',
      label: row.title,
      sub: row.unit ?? '',
      id: row.id,
      route: '/lesson-bank'
    }))
  )

  const events = all<{ id: number; title: string; date: string }>(
    'SELECT id, title, date FROM school_events WHERE academic_year_id = ? AND title LIKE ? ORDER BY date DESC LIMIT 10',
    [yearId, like]
  )
  results.push(
    ...events.map((row) => ({
      kind: 'حدث',
      label: row.title,
      sub: row.date,
      id: row.id,
      route: '/events'
    }))
  )

  const plan = all<{ id: number; lesson_title: string; unit: string | null; status: string }>(
    'SELECT id, lesson_title, unit, status FROM annual_plans WHERE academic_year_id = ? AND (lesson_title LIKE ? OR unit LIKE ?) LIMIT 10',
    [yearId, like, like]
  )
  results.push(
    ...plan.map((row) => ({
      kind: 'التوزيع السنوي',
      label: row.lesson_title,
      sub: `${row.unit ?? ''} — ${row.status}`,
      id: row.id,
      route: '/annual-plan'
    }))
  )

  return results.slice(0, 60)
}
