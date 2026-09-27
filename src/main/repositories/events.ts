import type { Attachment, Note, SchoolEvent } from '@shared/types'
import type { EventInput, NoteInput } from '@shared/schemas'
import { all, audit, one, resolveYear, run } from './base'
import { basename, extname } from 'node:path'

/* --------------------------- أحداث المؤسسة ----------------------------- */
const EVENT_SELECT = `
  SELECT e.*, c.name AS class_name
  FROM school_events e
  LEFT JOIN classes c ON c.id = e.class_id
`

export function listEvents(filters: {
  academic_year_id?: number | null
  from?: string
  to?: string
  term?: number
  type?: string
}): SchoolEvent[] {
  const yearId = resolveYear(filters.academic_year_id)
  const conditions = ['e.academic_year_id = @year']
  const params: Record<string, unknown> = { year: yearId }
  if (filters.from) {
    conditions.push('e.date >= @from')
    params.from = filters.from
  }
  if (filters.to) {
    conditions.push('e.date <= @to')
    params.to = filters.to
  }
  if (filters.term) {
    conditions.push('e.term = @term')
    params.term = filters.term
  }
  if (filters.type) {
    conditions.push('e.type = @type')
    params.type = filters.type
  }
  return all<SchoolEvent>(
    `${EVENT_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY e.date ASC, e.id ASC`,
    params
  )
}

export function createEvent(input: EventInput): SchoolEvent {
  const result = run(
    `INSERT INTO school_events (academic_year_id, type, term, title, date, class_id, subject_id, notes)
     VALUES (@academic_year_id, @type, @term, @title, @date, @class_id, @subject_id, @notes)`,
    input
  )
  audit('إضافة حدث', 'school_events', result.lastInsertRowid, input.title)
  return one<SchoolEvent>(`${EVENT_SELECT} WHERE e.id = ?`, [result.lastInsertRowid]) as SchoolEvent
}

export function updateEvent(input: EventInput & { id: number }): SchoolEvent {
  run(
    `UPDATE school_events SET type = @type, term = @term, title = @title, date = @date, class_id = @class_id,
       subject_id = @subject_id, notes = @notes WHERE id = @id`,
    input
  )
  audit('تعديل حدث', 'school_events', input.id, input.title)
  return one<SchoolEvent>(`${EVENT_SELECT} WHERE e.id = ?`, [input.id]) as SchoolEvent
}

export function removeEvent(id: number): void {
  run('DELETE FROM school_events WHERE id = ?', [id])
  audit('حذف حدث', 'school_events', id)
}

/** تقويم موحّد: حصص مسجّلة + تقييمات + أحداث + بنود توزيع متأخرة */
export function calendarEntries(from: string, to: string, academicYearId?: number | null): Array<{
  date: string
  kind: string
  label: string
  sub: string
  id: number
}> {
  const yearId = resolveYear(academicYearId)
  const lessons = all<{ id: number; date: string; title: string; class_name: string | null; session_type: string }>(
    `SELECT dl.id, dl.date, dl.title, c.name AS class_name, dl.session_type
     FROM daily_lessons dl LEFT JOIN classes c ON c.id = dl.class_id
     WHERE dl.academic_year_id = ? AND dl.date BETWEEN ? AND ?`,
    [yearId, from, to]
  )
  const assessments = all<{ id: number; date: string; name: string; class_name: string | null; type: string }>(
    `SELECT a.id, a.date, a.name, c.name AS class_name, a.type
     FROM assessments a LEFT JOIN classes c ON c.id = a.class_id
     WHERE a.academic_year_id = ? AND a.date BETWEEN ? AND ?`,
    [yearId, from, to]
  )
  const events = listEvents({ academic_year_id: yearId, from, to })

  return [
    ...lessons.map((row) => ({
      date: row.date,
      kind: 'lesson',
      label: row.title || 'حصة',
      sub: `${row.class_name ?? ''} — ${row.session_type}`,
      id: row.id
    })),
    ...assessments.map((row) => ({
      date: row.date,
      kind: 'assessment',
      label: row.name,
      sub: `${row.class_name ?? ''} — ${row.type}`,
      id: row.id
    })),
    ...events.map((row) => ({
      date: row.date,
      kind: 'event',
      label: row.title,
      sub: `${row.class_name ?? ''} — ${row.type}`,
      id: row.id
    }))
  ].sort((a, b) => a.date.localeCompare(b.date))
}

/* ------------------------------ الملاحظات ------------------------------ */
export function listNotes(ownerType: string, ownerId: number): Note[] {
  return all<Note>('SELECT * FROM notes WHERE owner_type = ? AND owner_id = ? ORDER BY id DESC', [ownerType, ownerId])
}

export function saveNote(input: NoteInput & { id?: number }): Note {
  if (input.id) {
    run("UPDATE notes SET body = ?, updated_at = datetime('now', 'localtime') WHERE id = ?", [input.body, input.id])
    return one<Note>('SELECT * FROM notes WHERE id = ?', [input.id]) as Note
  }
  const result = run('INSERT INTO notes (owner_type, owner_id, body) VALUES (@owner_type, @owner_id, @body)', input)
  return one<Note>('SELECT * FROM notes WHERE id = ?', [result.lastInsertRowid]) as Note
}

export function removeNote(id: number): void {
  run('DELETE FROM notes WHERE id = ?', [id])
}

/* ------------------------------- المرفقات ------------------------------ */
export function listAttachments(ownerType: string, ownerId: number): Attachment[] {
  return all<Attachment>('SELECT * FROM attachments WHERE owner_type = ? AND owner_id = ? ORDER BY id DESC', [
    ownerType,
    ownerId
  ])
}

export function addAttachment(input: { owner_type: string; owner_id: number; file_path: string; size?: number }): Attachment {
  const fileName = basename(input.file_path)
  const result = run(
    'INSERT INTO attachments (owner_type, owner_id, file_path, file_name, extension, size) VALUES (@owner_type, @owner_id, @file_path, @file_name, @extension, @size)',
    {
      owner_type: input.owner_type,
      owner_id: input.owner_id,
      file_path: input.file_path,
      file_name: fileName,
      extension: extname(fileName).replace('.', '').toLowerCase() || null,
      size: input.size ?? null
    }
  )
  audit('إضافة مرفق', input.owner_type, input.owner_id, fileName)
  return one<Attachment>('SELECT * FROM attachments WHERE id = ?', [result.lastInsertRowid]) as Attachment
}

export function getAttachment(id: number): Attachment | null {
  return one<Attachment>('SELECT * FROM attachments WHERE id = ?', [id]) ?? null
}

export function removeAttachment(id: number): void {
  run('DELETE FROM attachments WHERE id = ?', [id])
}
