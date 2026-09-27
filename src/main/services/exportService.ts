import { attendanceSummary, attendanceForClass } from '../repositories/attendance'
import { listAssessments, listContinuous } from '../repositories/assessments'
import { listClasses } from '../repositories/classes'
import { listEvents } from '../repositories/events'
import { listPlan } from '../repositories/plan'
import { listSchedule } from '../repositories/schedule'
import { listStudents, studentsToCSV } from '../repositories/students'
import { resolveYear } from '../repositories/base'
import { toCSV } from '@shared/utils/misc'
import { TERM_LABELS } from '@shared/constants'

export type ExportKind =
  | 'students'
  | 'classes'
  | 'grades'
  | 'attendance'
  | 'assessments'
  | 'schedule'
  | 'lesson_bank'
  | 'annual_plan'

export interface ExportPayload {
  content: string
  fileName: string
  count: number
}

/**
 * تصدير JSON — يقبل مصفوفة صفوف أو كائناً مركّباً (مثل { summary, detail }).
 * عدد السجلات يُحسب تلقائياً حين تكون القيمة مصفوفة.
 */
function jsonExport(data: unknown): string {
  return JSON.stringify(
    { generatedAt: new Date().toISOString(), count: Array.isArray(data) ? data.length : null, data },
    null,
    2
  )
}

export function buildExport(
  kind: ExportKind,
  format: 'csv' | 'json',
  options: { academic_year_id?: number | null; class_id?: number | null } = {}
): ExportPayload {
  const yearId = resolveYear(options.academic_year_id)

  switch (kind) {
    case 'students': {
      const csv = studentsToCSV(yearId, options.class_id ?? null)
      return {
        content: format === 'csv' ? csv.csv : jsonExport(listStudents({ academic_year_id: yearId, class_id: options.class_id ?? undefined })),
        fileName: `طلاب_${yearId}`,
        count: csv.count
      }
    }
    case 'classes': {
      const rows = listClasses({ academic_year_id: yearId })
      if (format === 'csv') {
        return {
          content: toCSV(
            ['القسم', 'المستوى', 'الشعبة', 'المادة', 'عدد التلاميذ', 'ذكور', 'إناث', 'ملاحظات'],
            rows.map((row) => [
              row.name,
              row.level_name ?? '',
              row.stream ?? '',
              row.subject_name ?? '',
              row.students_count ?? 0,
              row.boys_count ?? 0,
              row.girls_count ?? 0,
              row.notes ?? ''
            ])
          ),
          fileName: 'الأقسام',
          count: rows.length
        }
      }
      return { content: jsonExport(rows), fileName: 'الأقسام', count: rows.length }
    }
    case 'schedule': {
      const rows = listSchedule({ academic_year_id: yearId })
      if (format === 'csv') {
        return {
          content: toCSV(
            ['اليوم', 'من', 'إلى', 'القسم', 'المادة', 'نوع الحصة', 'القاعة', 'ملاحظات'],
            rows.map((row) => [
              row.day_of_week,
              row.start_time,
              row.end_time,
              row.class_name ?? '',
              row.subject_name ?? '',
              row.session_type,
              row.room ?? '',
              row.notes ?? ''
            ])
          ),
          fileName: 'الجدول_الأسبوعي',
          count: rows.length
        }
      }
      return { content: jsonExport(rows), fileName: 'الجدول_الأسبوعي', count: rows.length }
    }
    case 'attendance': {
      const rows = attendanceSummary({ academic_year_id: yearId, class_id: options.class_id ?? null })
      if (format === 'csv') {
        return {
          content: toCSV(
            ['الاسم الكامل', 'القسم', 'حاضر', 'غائب', 'متأخر', 'معفي'],
            rows.map((row) => [row.full_name, row.class_name ?? '', row.present, row.absent, row.late, row.excused])
          ),
          fileName: 'سجل_الغياب',
          count: rows.length
        }
      }
      const detail = options.class_id ? attendanceForClass(options.class_id) : []
      return { content: jsonExport({ summary: rows, detail }), fileName: 'سجل_الغياب', count: rows.length }
    }
    case 'assessments': {
      const rows = listAssessments({ academic_year_id: yearId, class_id: options.class_id ?? null })
      if (format === 'csv') {
        return {
          content: toCSV(
            ['الاسم', 'النوع', 'الفصل', 'التاريخ', 'القسم', 'العلامة القصوى', 'الوزن', 'عدد العلامات'],
            rows.map((row) => [
              row.name,
              row.type,
              TERM_LABELS[row.term] ?? row.term,
              row.date,
              row.class_name ?? '',
              row.max_score,
              row.weight,
              row.scores_count ?? 0
            ])
          ),
          fileName: 'التقييمات',
          count: rows.length
        }
      }
      return { content: jsonExport(rows), fileName: 'التقييمات', count: rows.length }
    }
    case 'annual_plan': {
      const rows = listPlan({ academic_year_id: yearId })
      if (format === 'csv') {
        return {
          content: toCSV(
            ['الفصل', 'المستوى', 'الميدان', 'المقطع', 'الدرس', 'عدد الحصص', 'الحالة', 'التاريخ المتوقع', 'تاريخ الإنجاز'],
            rows.map((row) => [
              TERM_LABELS[row.term] ?? row.term,
              row.level_name ?? '',
              row.domain ?? '',
              row.unit ?? '',
              row.lesson_title,
              row.sessions_count,
              row.status,
              row.expected_date ?? '',
              row.completed_date ?? ''
            ])
          ),
          fileName: 'التوزيع_السنوي',
          count: rows.length
        }
      }
      return { content: jsonExport(rows), fileName: 'التوزيع_السنوي', count: rows.length }
    }
    case 'lesson_bank': {
      const rows = listPlan({ academic_year_id: yearId })
      const events = listEvents({ academic_year_id: yearId })
      const classes = listClasses({ academic_year_id: yearId })
      const payload = { classes, plan: rows, events }
      return {
        content: format === 'csv' ? toCSV(['القسم', 'المستوى', 'عدد التلاميذ'], classes.map((c) => [c.name, c.level_name ?? '', c.students_count ?? 0])) : jsonExport(payload),
        fileName: 'بيانات_عامة',
        count: classes.length
      }
    }
    case 'grades': {
      const classes = listClasses({ academic_year_id: yearId })
      const collect: unknown[] = []
      for (const cls of classes) {
        for (const term of [1, 2, 3]) {
          const entries = listContinuous(cls.id, term, yearId)
          if (entries.length === 0) continue
          collect.push(
            ...entries.map((entry) => ({
              class_name: cls.name,
              term,
              student_id: entry.student_id,
              kind: entry.kind,
              value: entry.value
            }))
          )
        }
      }
      if (format === 'csv') {
        return {
          content: toCSV(
            ['القسم', 'الفصل', 'معرّف التلميذ', 'المكوّن', 'القيمة'],
            collect.map((row) => {
              const typed = row as { class_name: string; term: number; student_id: number; kind: string; value: number | null }
              return [typed.class_name, typed.term, typed.student_id, typed.kind, typed.value ?? '']
            })
          ),
          fileName: 'النقاط',
          count: collect.length
        }
      }
      return { content: jsonExport(collect), fileName: 'النقاط', count: collect.length }
    }
    default:
      return { content: '{}', fileName: 'بيانات', count: 0 }
  }
}
