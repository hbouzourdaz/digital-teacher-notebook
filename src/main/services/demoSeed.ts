import { SETTING_KEYS } from '@shared/constants'
import { addDays, todayISO } from '@shared/utils/date'
import { all, count } from '../repositories/base'
import { createYear, activateYear, listYears } from '../repositories/years'
import { createClass } from '../repositories/classes'
import { importStudents } from '../repositories/students'
import { createSlot } from '../repositories/schedule'
import { createPlanItem } from '../repositories/plan'
import { createCategory, createAssessment, listCategories, saveScores } from '../repositories/assessments'
import { setSetting } from '../repositories/settings'
import { getSubjectId } from './sharedHelpers'

const FIRST_NAMES = ['محمد', 'أمين', 'ياسمين', 'سارة', 'عبد الرحمان', 'نسرين', 'إسلام', 'هبة', 'أيوب', 'ريم', 'زكرياء', 'شيماء']
const LAST_NAMES = ['بوعلام', 'حداد', 'مرابط', 'زيتوني', 'بلقاسم', 'عماري', 'سعداوي', 'بن يوسف', 'شريف', 'لعمارة']

/**
 * بيانات تجريبية — تعمل فقط في وضع التطوير ولمرة واحدة.
 * لا تُدخل أي بيانات تجريبية في النسخة الموزّعة (production).
 */
export function seedDemoData(): { seeded: boolean } {
  if (count('SELECT COUNT(*) AS c FROM academic_years') > 0) {
    return { seeded: false }
  }

  /*
   * السنة أولاً: `getSubjectId` يحلّ السنة النشطة، فطلبه قبل إنشائها يوقف
   * التوليد بخطأ «لا توجد سنة دراسية»، ويكون مثله مثل demoAvailable().
   */
  const year = createYear({
    label: '2026 - 2027',
    start_date: `${new Date().getFullYear()}-09-01`,
    end_date: `${new Date().getFullYear() + 1}-06-30`
  })
  activateYear(year.id)
  const subjectId = getSubjectId(year.id)

  const definitions = [
    { name: '2 متوسط 1', levelIndex: 1 },
    { name: '2 متوسط 2', levelIndex: 1 },
    { name: '3 متوسط 1', levelIndex: 2 }
  ]
  const levels = all<{ id: number }>('SELECT id FROM levels ORDER BY order_index ASC')

  const classIds: number[] = []
  definitions.forEach((definition, index) => {
    const created = createClass({
      academic_year_id: year.id,
      name: definition.name,
      level_id: levels[definition.levelIndex]?.id ?? null,
      stream: null,
      subject_id: subjectId,
      notes: null,
      sort_order: index
    })
    classIds.push(created.id)
    importStudents(
      year.id,
      created.id,
      Array.from({ length: 12 }, (_, i) => ({
        first_name: FIRST_NAMES[(i + index) % FIRST_NAMES.length],
        last_name: LAST_NAMES[(i * 3 + index) % LAST_NAMES.length],
        number: i + 1,
        gender: i % 2 === 0 ? ('male' as const) : ('female' as const)
      })),
      true
    )
  })

  const morning = [
    { start: '08:00', end: '09:00' },
    { start: '09:00', end: '10:00' },
    { start: '10:00', end: '11:00' }
  ]
  classIds.forEach((classId, index) => {
    for (let day = 0; day < 4; day++) {
      if ((day + index) % 3 === 0) continue
      const slot = morning[(day + index) % morning.length]
      createSlot({
        academic_year_id: year.id,
        day_of_week: day,
        start_time: slot.start,
        end_time: slot.end,
        class_id: classId,
        subject_id: subjectId,
        session_type: 'درس',
        room: null,
        notes: null
      })
    }
  })

  const levelId = levels[1]?.id ?? null
  ;[
    { term: 1 as const, unit: 'المادة وتحولاتها', title: 'التحولات الكيميائية' },
    { term: 1 as const, unit: 'المادة وتحولاتها', title: 'الذرة والجزيئات' },
    { term: 2 as const, unit: 'الطاقة', title: 'أشكال الطاقة' },
    { term: 2 as const, unit: 'الطاقة', title: 'الطاقة الكهربائية' },
    { term: 3 as const, unit: 'الظواهر الميكانيكية', title: 'الحركة والسكون' }
  ].forEach((item, index) => {
    createPlanItem({
      academic_year_id: year.id,
      level_id: levelId,
      subject_id: subjectId,
      term: item.term,
      domain: 'علوم فيزيائية',
      unit: item.unit,
      lesson_title: item.title,
      sessions_count: 2,
      status: 'not_started',
      expected_date: addDays(todayISO(), index * 7),
      completed_date: null,
      notes: null
    })
  })

  let categories = listCategories(year.id)
  if (categories.length === 0) {
    createCategory({
      academic_year_id: year.id,
      name: 'الفرض',
      kind: 'written',
      max_default: 20,
      weight: 1,
      order_index: 0,
      is_active: 1
    })
    categories = listCategories(year.id)
  }

  for (const classId of classIds.slice(0, 2)) {
    const assessment = createAssessment({
      academic_year_id: year.id,
      class_id: classId,
      subject_id: subjectId,
      category_id: categories[0]?.id ?? null,
      name: 'الفرض الأول',
      type: 'homework',
      term: 2,
      date: todayISO(),
      max_score: 20,
      weight: 1,
      daily_lesson_id: null,
      notes: null
    })
    const students = all<{ id: number }>('SELECT id FROM students WHERE class_id = ? ORDER BY sort_order', [classId])
    saveScores({
      assessment_id: assessment.id,
      max_score: 20,
      entries: students.map((student, index) => ({ student_id: student.id, score: 8 + ((index * 3) % 12), note: null }))
    })
  }

  setSetting(SETTING_KEYS.seedDemoData, '1')
  return { seeded: true }
}

export function demoAvailable(): boolean {
  return listYears().length === 0
}
