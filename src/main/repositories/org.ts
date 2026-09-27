import type { Level, School, Subject, Teacher } from '@shared/types'
import type { LevelInput, SchoolInput, SubjectInput, TeacherInput } from '@shared/schemas'
import { all, audit, one, resolveYear, run } from './base'
import { DEFAULT_LEVELS, DEFAULT_SUBJECT } from '@shared/constants'

/* ------------------------------- الأستاذ ------------------------------- */
export function getTeacher(): Teacher | null {
  return one<Teacher>('SELECT * FROM teachers ORDER BY id ASC LIMIT 1') ?? null
}

export function saveTeacher(input: TeacherInput): Teacher {
  const current = getTeacher()
  if (current) {
    run(
      `UPDATE teachers SET full_name = @full_name, subject_label = @subject_label, phone = @phone,
         email = @email, notes = @notes, updated_at = datetime('now', 'localtime') WHERE id = @id`,
      { ...input, id: current.id }
    )
    audit('تعديل بيانات الأستاذ', 'teachers', current.id)
    return one<Teacher>('SELECT * FROM teachers WHERE id = ?', [current.id]) as Teacher
  }
  const result = run(
    'INSERT INTO teachers (full_name, subject_label, phone, email, notes) VALUES (@full_name, @subject_label, @phone, @email, @notes)',
    input
  )
  audit('إضافة بيانات الأستاذ', 'teachers', result.lastInsertRowid)
  return one<Teacher>('SELECT * FROM teachers WHERE id = ?', [result.lastInsertRowid]) as Teacher
}

/* ------------------------------ المؤسسة -------------------------------- */
export function getSchool(): School | null {
  return one<School>('SELECT * FROM schools ORDER BY id ASC LIMIT 1') ?? null
}

export function saveSchool(input: SchoolInput): School {
  const current = getSchool()
  if (current) {
    run(
      `UPDATE schools SET name = @name, stage = @stage, wilaya = @wilaya, municipality = @municipality,
         logo_path = @logo_path, updated_at = datetime('now', 'localtime') WHERE id = @id`,
      { ...input, id: current.id }
    )
    audit('تعديل بيانات المؤسسة', 'schools', current.id)
    return one<School>('SELECT * FROM schools WHERE id = ?', [current.id]) as School
  }
  const result = run(
    'INSERT INTO schools (name, stage, wilaya, municipality, logo_path) VALUES (@name, @stage, @wilaya, @municipality, @logo_path)',
    input
  )
  audit('إضافة بيانات المؤسسة', 'schools', result.lastInsertRowid)
  return one<School>('SELECT * FROM schools WHERE id = ?', [result.lastInsertRowid]) as School
}

/* ------------------------------- المواد -------------------------------- */
export function listSubjects(): Subject[] {
  return all<Subject>('SELECT * FROM subjects ORDER BY sort_order ASC, name ASC')
}

export function createSubject(input: SubjectInput): Subject {
  const result = run(
    'INSERT INTO subjects (name, code, notes, is_active, sort_order) VALUES (@name, @code, @notes, @is_active, @sort_order)',
    input
  )
  audit('إضافة مادة', 'subjects', result.lastInsertRowid, input.name)
  return one<Subject>('SELECT * FROM subjects WHERE id = ?', [result.lastInsertRowid]) as Subject
}

export function updateSubject(input: SubjectInput & { id: number }): Subject {
  run(
    `UPDATE subjects SET name = @name, code = @code, notes = @notes, is_active = @is_active,
       sort_order = @sort_order WHERE id = @id`,
    input
  )
  audit('تعديل مادة', 'subjects', input.id, input.name)
  return one<Subject>('SELECT * FROM subjects WHERE id = ?', [input.id]) as Subject
}

export function removeSubject(id: number): void {
  run('DELETE FROM subjects WHERE id = ?', [id])
  audit('حذف مادة', 'subjects', id)
}

/** تُنشأ المواد الافتراضية مرة واحدة إن لم توجد أي مادة (الإعداد الأولي فقط) */
export function ensureDefaultSubject(): Subject | null {
  const existing = all<Subject>('SELECT * FROM subjects LIMIT 1')
  if (existing.length > 0) return existing[0]
  return createSubject({
    name: DEFAULT_SUBJECT,
    code: null,
    notes: null,
    is_active: 1,
    sort_order: 0
  })
}

/* ------------------------------ المستويات ------------------------------ */
export function listLevels(): Level[] {
  return all<Level>('SELECT * FROM levels ORDER BY order_index ASC, id ASC')
}

export function createLevel(input: LevelInput): Level {
  const result = run('INSERT INTO levels (name, order_index) VALUES (@name, @order_index)', input)
  audit('إضافة مستوى', 'levels', result.lastInsertRowid, input.name)
  return one<Level>('SELECT * FROM levels WHERE id = ?', [result.lastInsertRowid]) as Level
}

export function updateLevel(input: LevelInput & { id: number }): Level {
  run('UPDATE levels SET name = @name, order_index = @order_index WHERE id = @id', input)
  return one<Level>('SELECT * FROM levels WHERE id = ?', [input.id]) as Level
}

export function removeLevel(id: number): void {
  run('DELETE FROM levels WHERE id = ?', [id])
  audit('حذف مستوى', 'levels', id)
}

export function ensureDefaultLevels(): void {
  if (all<Level>('SELECT id FROM levels LIMIT 1').length > 0) return
  DEFAULT_LEVELS.forEach((name, index) => {
    run('INSERT INTO levels (name, order_index) VALUES (?, ?)', [name, index])
  })
}

/** المستويات المستعملة فعلاً في أقسام السنة الحالية (لقوائم الاختيار) */
export function listYearLevels(academicYearId?: number | null): Level[] {
  const yearId = resolveYear(academicYearId)
  return all<Level>(
    `SELECT DISTINCT l.* FROM levels l JOIN classes c ON c.level_id = l.id
     WHERE c.academic_year_id = ? ORDER BY l.order_index ASC`,
    [yearId]
  )
}
