import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, Bookmark, FilePlus2, ListTree, Paperclip, Save, Trash2 } from 'lucide-react'
import type { AnnualPlanItem, Attachment, DailyLesson, LessonBankItem, Note } from '@shared/types'
import { LESSON_STAGE_TEMPLATE, SESSION_TYPES } from '@shared/constants'
import { formatArabicDate, arabicDayName } from '@shared/utils/date'
import { Badge, Button, Field, Input, Modal, Select, Textarea } from './ui'
import { useApp } from '../store/app'

export type LessonTarget =
  | { kind: 'slot'; scheduleId: number; date: string }
  | { kind: 'lesson'; lessonId: number }

interface Props {
  open: boolean
  onClose: () => void
  target: LessonTarget | null
  onSaved?: (lesson: DailyLesson) => void
}

export default function LessonEditor({ open, onClose, target, onSaved }: Props): JSX.Element | null {
  const toast = useApp((state) => state.toast)
  const run = useApp((state) => state.run)
  const classes = useApp((state) => state.classes)
  const activeYear = useApp((state) => state.activeYear)

  const [lesson, setLesson] = useState<DailyLesson | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [stages, setStages] = useState('')
  const [notes, setNotes] = useState('')
  const [sessionType, setSessionType] = useState('درس')
  const [planId, setPlanId] = useState<number | null>(null)
  const [bankId, setBankId] = useState<number | null>(null)
  const [plans, setPlans] = useState<AnnualPlanItem[]>([])
  const [bank, setBank] = useState<LessonBankItem[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [lessonNotes, setLessonNotes] = useState<Note[]>([])
  const [noteDraft, setNoteDraft] = useState('')

  const classRow = useMemo(
    () => classes.find((row) => row.id === lesson?.class_id) ?? null,
    [classes, lesson?.class_id]
  )

  useEffect(() => {
    if (!open || !target) return
    let cancelled = false
    setLoading(true)
    const load = async (): Promise<void> => {
      try {
        const loaded =
          target.kind === 'slot'
            ? await window.api.lessons.ensureForSlot({
                academic_year_id: activeYear?.id ?? 0,
                schedule_id: target.scheduleId,
                date: target.date
              })
            : await window.api.lessons.get({ id: target.lessonId })
        if (cancelled) return
        if (!loaded) {
          toast('الحصة غير موجودة', 'error')
          onClose()
          return
        }
        setLesson(loaded)
        setTitle(loaded.title)
        setStages(loaded.stages)
        setNotes(loaded.notes)
        setSessionType(loaded.session_type)
        setPlanId(loaded.annual_plan_id)
        setBankId(loaded.lesson_bank_id)
        const [attach, noteRows] = await Promise.all([
          window.api.attachments.list({ owner_type: 'lesson', owner_id: loaded.id }),
          window.api.notes.list({ owner_type: 'lesson', owner_id: loaded.id })
        ])
        if (cancelled) return
        setAttachments(attach)
        setLessonNotes(noteRows)
      } catch (error) {
        toast(error instanceof Error ? error.message : 'تعذر تحميل الحصة', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, target, activeYear?.id, toast, onClose])

  useEffect(() => {
    if (!open) return
    const levelId = classRow?.level_id ?? null
    void window.api.plan.list({ level_id: levelId }).then(setPlans).catch(() => setPlans([]))
    void window.api.bank.list({ level_id: levelId }).then(setBank).catch(() => setBank([]))
  }, [open, classRow?.level_id])

  const persist = async (markRecorded: boolean): Promise<DailyLesson | null> => {
    if (!lesson) return null
    setSaving(true)
    const updated = await run(() =>
      window.api.lessons.update({
        id: lesson.id,
        academic_year_id: lesson.academic_year_id,
        schedule_id: lesson.schedule_id,
        date: lesson.date,
        start_time: lesson.start_time,
        end_time: lesson.end_time,
        class_id: lesson.class_id,
        subject_id: lesson.subject_id,
        session_type: sessionType,
        title: title.trim(),
        stages,
        notes,
        annual_plan_id: planId,
        lesson_bank_id: bankId,
        status: markRecorded ? 'recorded' : lesson.status
      })
    )
    setSaving(false)
    if (updated) {
      setLesson(updated)
      onSaved?.(updated)
    }
    return updated
  }

  const saveAndClose = async (markRecorded: boolean): Promise<void> => {
    const updated = await persist(markRecorded)
    if (updated) {
      toast(markRecorded ? 'تم حفظ الحصة وتسجيلها' : 'تم حفظ المسودة')
      onClose()
    }
  }

  const saveAndNext = async (): Promise<void> => {
    const updated = await persist(true)
    if (!updated) return
    toast('تم حفظ الحصة — الانتقال للحصة التالية')
    try {
      const slots = await window.api.schedule.list({})
      const list = await window.api.lessons.list({ date: updated.date, limit: 200 })
      const recordedIds = new Set(list.map((item) => item.schedule_id).filter(Boolean) as number[])
      const next = slots
        .filter((slot) => slot.day_of_week === new Date(`${updated.date}T00:00:00`).getDay())
        .filter((slot) => slot.start_time > updated.start_time && !recordedIds.has(slot.id))
        .sort((a, b) => a.start_time.localeCompare(b.start_time))[0]
      if (!next) {
        toast('لا توجد حصة أخرى غير مسجّلة اليوم', 'info')
        onClose()
        return
      }
      const nextLesson = await window.api.lessons.ensureForSlot({
        academic_year_id: updated.academic_year_id,
        schedule_id: next.id,
        date: updated.date
      })
      setLesson(nextLesson)
      setTitle(nextLesson.title)
      setStages(nextLesson.stages)
      setNotes(nextLesson.notes)
      setSessionType(nextLesson.session_type)
      setPlanId(nextLesson.annual_plan_id)
      setBankId(nextLesson.lesson_bank_id)
      const [attach, noteRows] = await Promise.all([
        window.api.attachments.list({ owner_type: 'lesson', owner_id: nextLesson.id }),
        window.api.notes.list({ owner_type: 'lesson', owner_id: nextLesson.id })
      ])
      setAttachments(attach)
      setLessonNotes(noteRows)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'تعذر الانتقال للحصة التالية', 'error')
    }
  }

  const applyTemplate = (): void => {
    const block = LESSON_STAGE_TEMPLATE.map((stage) => `${stage}:\n`).join('\n')
    setStages((current) => (current.trim().length > 0 ? `${current}\n\n${block}` : block))
  }

  const applyBank = (id: number): void => {
    const item = bank.find((row) => row.id === id)
    if (!item) return
    setTitle(item.title)
    setStages(item.stages)
    setBankId(item.id)
    toast('تم إدراج عنوان الدرس ومراحل سيره من بنك الدروس', 'info')
  }

  const addAttachment = async (): Promise<void> => {
    if (!lesson) return
    const path = await window.api.dialogs.pickFile({
      title: 'اختيار مرفق (PDF / DOCX / PPTX / صورة)',
      filters: ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'png', 'jpg', 'jpeg', 'webp', 'txt']
    })
    if (!path) return
    const created = await run(() => window.api.attachments.add({ owner_type: 'lesson', owner_id: lesson.id, file_path: path }))
    if (created) {
      setAttachments((current) => [created, ...current])
      toast('تم ربط المرفق محلياً')
    }
  }

  const addNote = async (): Promise<void> => {
    if (!lesson || noteDraft.trim().length === 0) return
    const created = await run(() => window.api.notes.save({ owner_type: 'lesson', owner_id: lesson.id, body: noteDraft.trim() }))
    if (created) {
      setLessonNotes((current) => [created, ...current])
      setNoteDraft('')
    }
  }

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={loading || !lesson ? 'تحميل الحصة…' : `تسجيل الحصة — ${lesson.class_name ?? ''}`}
      footer={
        <>
          <Button onClick={onClose}>إغلاق</Button>
          <Button
            icon={<Save className="h-4 w-4" />}
            loading={saving}
            disabled={loading || !lesson}
            onClick={() => void saveAndClose(false)}
          >
            حفظ
          </Button>
          <Button
            variant="primary"
            icon={<Save className="h-4 w-4" />}
            loading={saving}
            disabled={loading || !lesson}
            onClick={() => void saveAndClose(true)}
          >
            حفظ وإغلاق
          </Button>
          <Button
            icon={<ArrowLeft className="h-4 w-4" />}
            loading={saving}
            disabled={loading || !lesson}
            onClick={() => void saveAndNext()}
          >
            حفظ والانتقال للحصة التالية
          </Button>
        </>
      }
    >
      {!lesson ? (
        <p className="muted py-8 text-center text-sm">جارٍ التحميل…</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-[rgb(var(--surface-muted))] p-3 text-sm md:grid-cols-4">
            <div>
              <p className="muted text-xs">التاريخ</p>
              <p className="font-medium">
                {formatArabicDate(lesson.date)} — {arabicDayName(lesson.date)}
              </p>
            </div>
            <div>
              <p className="muted text-xs">التوقيت</p>
              <p className="font-medium tabular-nums">
                {lesson.start_time} - {lesson.end_time}
              </p>
            </div>
            <div>
              <p className="muted text-xs">القسم</p>
              <p className="font-medium">{lesson.class_name ?? '—'}</p>
            </div>
            <div>
              <p className="muted text-xs">المادة</p>
              <p className="font-medium">{lesson.subject_name ?? '—'}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Field label="نوع الحصة" className="md:col-span-1">
              <Select value={sessionType} onChange={(event) => setSessionType(event.target.value)}>
                {SESSION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="الربط بالتوزيع السنوي" className="md:col-span-1">
              <Select value={planId ?? ''} onChange={(event) => setPlanId(event.target.value ? Number(event.target.value) : null)}>
                <option value="">— بدون ربط —</option>
                {plans.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.lesson_title} ({item.unit ?? 'بدون مقطع'})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="اختيار من بنك الدروس" className="md:col-span-1">
              <Select value={bankId ?? ''} onChange={(event) => applyBank(Number(event.target.value))}>
                <option value="">— بدون —</option>
                {bank.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="عنوان الدرس" required>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثال: التحولات الكيميائية" />
          </Field>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="label mb-0">مراحل سير الحصة</label>
              <Button size="sm" variant="ghost" icon={<ListTree className="h-3.5 w-3.5" />} onClick={applyTemplate}>
                إدراج قالب المراحل
              </Button>
            </div>
            <Textarea
              className="min-h-[190px]"
              value={stages}
              onChange={(event) => setStages(event.target.value)}
              placeholder="التمهيد، الوضعية الانطلاقية، النشاط، المناقشة، الاستنتاج، التطبيق، التقويم، الواجب المنزلي…"
            />
          </div>

          <Field label="ملاحظات الحصة">
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="ملاحظات عامة على سير الحصة…" />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <section>
              <div className="section-title">
                <Paperclip className="h-4 w-4" /> المرفقات المحلية
                <Button size="sm" variant="ghost" icon={<FilePlus2 className="h-3.5 w-3.5" />} onClick={() => void addAttachment()}>
                  إضافة
                </Button>
              </div>
              {attachments.length === 0 ? (
                <p className="muted rounded-md border border-dashed p-3 text-xs">
                  لا مرفقات. الملفات تبقى على هذا الجهاز ولا تُرفع إلى أي مكان.
                </p>
              ) : (
                <ul className="space-y-1">
                  {attachments.map((attachment) => (
                    <li key={attachment.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs">
                      <span className="truncate">{attachment.file_name}</span>
                      <span className="flex items-center gap-1">
                        <Badge>{attachment.extension ?? 'ملف'}</Badge>
                        <Button size="sm" variant="ghost" onClick={() => void window.api.attachments.open({ id: attachment.id })}>
                          فتح
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void run(() => window.api.attachments.remove({ id: attachment.id }), 'تم حذف المرفق').then(() =>
                              setAttachments((current) => current.filter((item) => item.id !== attachment.id))
                            )
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="section-title">
                <Bookmark className="h-4 w-4" /> ملاحظات مرتبطة
              </div>
              <div className="mb-2 flex gap-2">
                <Input
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="أضف ملاحظة…"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void addNote()
                  }}
                />
                <Button onClick={() => void addNote()}>إضافة</Button>
              </div>
              {lessonNotes.length === 0 ? (
                <p className="muted rounded-md border border-dashed p-3 text-xs">لا ملاحظات على هذه الحصة.</p>
              ) : (
                <ul className="space-y-1">
                  {lessonNotes.map((note) => (
                    <li key={note.id} className="flex items-start justify-between gap-2 rounded-md border px-2 py-1.5 text-xs">
                      <span className="whitespace-pre-wrap">{note.body}</span>
                      <button
                        className="muted hover:text-red-600 dark:hover:text-red-400"
                        onClick={() =>
                          void run(() => window.api.notes.remove({ id: note.id })).then(() =>
                            setLessonNotes((current) => current.filter((item) => item.id !== note.id))
                          )
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <p className="muted flex items-center gap-1.5 text-xs">
            <BookOpen className="h-3.5 w-3.5" />
            حالة الحصة: {lesson.status === 'recorded' ? 'مسجّلة' : 'مسودة (لم تُسجَّل بعد)'}
          </p>
        </div>
      )}
    </Modal>
  )
}
