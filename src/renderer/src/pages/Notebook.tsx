import { useEffect, useMemo, useState } from 'react'
import { BookOpen, FilePlus2, NotebookPen, Printer, Search, Trash2 } from 'lucide-react'
import type { DailyLesson, ScheduleSlot } from '@shared/types'
import { PERIOD_LABELS, SCHOOL_DAYS, TERM_LABELS } from '@shared/constants'
import { addDays, todayISO } from '@shared/utils/date'
import { printLink } from '@shared/print'
import { useAsync } from '../hooks/useAsync'
import { useApp } from '../store/app'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
  type Column
} from '../components/ui'
import LessonEditor, { type LessonTarget } from '../components/LessonEditor'
import { cn } from '@shared/utils/misc'

export default function NotebookPage({ initialLessonId }: { initialLessonId?: number | null }): JSX.Element {
  const navigate = useApp((state) => state.navigate)
  const classes = useApp((state) => state.classes)
  const subjects = useApp((state) => state.subjects)
  const activeYear = useApp((state) => state.activeYear)
  const run = useApp((state) => state.run)
  const toast = useApp((state) => state.toast)

  const [from, setFrom] = useState(addDays(todayISO(), -30))
  const [to, setTo] = useState(todayISO())
  const [classId, setClassId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [target, setTarget] = useState<LessonTarget | null>(
    initialLessonId ? { kind: 'lesson', lessonId: initialLessonId } : null
  )
  const [deleteTarget, setDeleteTarget] = useState<DailyLesson | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manual, setManual] = useState({
    date: todayISO(),
    class_id: null as number | null,
    subject_id: null as number | null,
    start_time: '08:00',
    end_time: '09:00',
    title: '',
    stages: '',
    notes: ''
  })
  const [showStructure, setShowStructure] = useState(true)

  const lessons = useAsync<DailyLesson[]>(
    () => window.api.lessons.list({ from, to, class_id: classId, search: search.trim() || undefined, limit: 800 }),
    [from, to, classId, search, activeYear?.id],
    []
  )
  const timetable = useAsync<ScheduleSlot[]>(() => window.api.schedule.list({}), [activeYear?.id], [])

  useEffect(() => {
    if (initialLessonId) setTarget({ kind: 'lesson', lessonId: initialLessonId })
  }, [initialLessonId])

  const columns: Array<Column<DailyLesson>> = useMemo(
    () => [
      { key: 'date', header: 'التاريخ', width: '7rem', align: 'center', render: (row) => row.date },
      { key: 'time', header: 'التوقيت', width: '7rem', align: 'center', render: (row) => `${row.start_time} - ${row.end_time}` },
      { key: 'class', header: 'القسم', width: '8rem', align: 'center', render: (row) => row.class_name ?? '—' },
      { key: 'subject', header: 'المادة', width: '9rem', align: 'center', render: (row) => row.subject_name ?? '—' },
      {
        key: 'title',
        header: 'عنوان الدرس ومراحل سيره',
        render: (row) => (
          <div className="max-w-md">
            <p className="font-medium">{row.title || 'بدون عنوان'}</p>
            {row.stages && <p className="muted line-clamp-2 whitespace-pre-wrap text-xs">{row.stages}</p>}
          </div>
        )
      },
      { key: 'notes', header: 'ملاحظات', width: '10rem', render: (row) => <span className="muted text-xs">{row.notes}</span> },
      {
        key: 'status',
        header: 'الحالة',
        width: '6rem',
        align: 'center',
        render: (row) => <Badge tone={row.status === 'recorded' ? 'success' : 'warning'}>{row.status === 'recorded' ? 'مسجّلة' : 'مسودة'}</Badge>
      },
      {
        key: 'actions',
        header: '',
        width: '5rem',
        align: 'center',
        render: (row) => (
          <button
            className="muted p-1 hover:text-red-600 dark:hover:text-red-400"
            title="حذف الحصة"
            onClick={(event) => {
              event.stopPropagation()
              setDeleteTarget(row)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )
      }
    ],
    []
  )

  const groupedByClass = useMemo(() => {
    const map = new Map<string, ScheduleSlot[]>()
    for (const slot of timetable.data) {
      const key = slot.class_name ?? 'بدون قسم'
      map.set(key, [...(map.get(key) ?? []), slot])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'))
  }, [timetable.data])

  const saveManual = async (): Promise<void> => {
    if (!manual.class_id) {
      toast('اختر القسم', 'warning')
      return
    }
    const created = await run(
      () =>
        window.api.lessons.create({
          academic_year_id: activeYear?.id ?? 0,
          schedule_id: null,
          date: manual.date,
          start_time: manual.start_time,
          end_time: manual.end_time,
          class_id: manual.class_id as number,
          subject_id: manual.subject_id,
          session_type: 'درس',
          title: manual.title,
          stages: manual.stages,
          notes: manual.notes,
          annual_plan_id: null,
          lesson_bank_id: null,
          status: 'recorded'
        }),
      'تمت إضافة الحصة إلى الدفتر'
    )
    if (!created) return
    setManualOpen(false)
    setManual({ ...manual, title: '', stages: '', notes: '' })
    await lessons.reload()
  }

  return (
    <div>
      <PageHeader
        title="الدفتر اليومي"
        subtitle={`${lessons.data.length} حصة مسجّلة — من ${from} إلى ${to}`}
        actions={
          <>
            <Button
              size="sm"
              icon={<Printer className="h-4 w-4" />}
              onClick={() => navigate(printLink({ document: 'daily-notebook', classId, from, to }))}
            >
              طباعة
            </Button>
            <Button size="sm" variant="primary" icon={<FilePlus2 className="h-4 w-4" />} onClick={() => setManualOpen(true)}>
              إضافة حصة يدوياً
            </Button>
          </>
        }
      />

      <div className="card card-pad mb-3 grid gap-3 md:grid-cols-5">
        <Field label="من تاريخ">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="إلى تاريخ">
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
        <Field label="القسم">
          <Select value={classId ?? ''} onChange={(event) => setClassId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">كل الأقسام</option>
            {classes.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="بحث في الدروس" className="md:col-span-2">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 opacity-50" />
            <Input
              className="pr-9"
              placeholder="مثال: التحولات الكيميائية"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </Field>
      </div>

      <div className="mb-3">
        <Button size="sm" variant="ghost" icon={<BookOpen className="h-4 w-4" />} onClick={() => setShowStructure((value) => !value)}>
          {showStructure ? 'إخفاء بنية الدفتر' : 'عرض بنية الدفتر (الأقسام والتوزيع الأسبوعي)'}
        </Button>
      </div>

      {showStructure && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <section className="card card-pad">
            <div className="section-title">
              <NotebookPen className="h-4 w-4" /> الأقسام المسندة
            </div>
            {groupedByClass.length === 0 ? (
              <p className="muted text-xs">لم يتم إدخال الجدول الأسبوعي بعد.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {groupedByClass.map(([className, slots]) => (
                  <li key={className} className="flex items-center justify-between rounded-md border px-2 py-1.5">
                    <span className="font-medium">{className}</span>
                    <span className="muted text-xs">
                      {slots.length} حصة أسبوعياً —{' '}
                      {[...new Set(slots.map((slot) => SCHOOL_DAYS.find((day) => day.value === slot.day_of_week)?.label))]
                        .filter(Boolean)
                        .join('، ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card card-pad">
            <div className="section-title">التوزيع الأسبوعي</div>
            <div className="space-y-2 text-xs">
              {(['morning', 'afternoon'] as const).map((period) => (
                <div key={period}>
                  <p className="mb-1 font-semibold">{PERIOD_LABELS[period]}</p>
                  <div className="grid grid-cols-5 gap-1">
                    {SCHOOL_DAYS.map((day) => {
                      const count = timetable.data.filter(
                        (slot) =>
                          slot.day_of_week === day.value &&
                          (period === 'morning' ? slot.start_time < '12:00' : slot.start_time >= '12:00')
                      ).length
                      return (
                        <div
                          key={day.value}
                          className={cn(
                            'rounded border px-1 py-1.5 text-center',
                            count > 0 ? 'bg-brand-50 dark:bg-brand-900/30' : 'opacity-60'
                          )}
                        >
                          <p className="font-semibold">{day.short}</p>
                          <p className="tabular-nums">{count}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={lessons.data}
        rowKey={(row) => row.id}
        onRowClick={(row) => setTarget({ kind: 'lesson', lessonId: row.id })}
        emptyMessage="لا توجد حصص مسجّلة في هذه الفترة. افتح صفحة «يومي» وسجّل حصة من جدولك."
      />

      {lessons.data.length === 0 && (
        <div className="mt-4">
          <EmptyState
            icon={<NotebookPen className="h-6 w-6" />}
            title="الدفتر اليومي فارغ"
            message="كل حصة تسجّلها من صفحة «يومي» تُدرج هنا تلقائياً مع التاريخ والتوقيت والقسم."
            action={
              <Button variant="primary" onClick={() => navigate('/today')}>
                فتح حصص اليوم
              </Button>
            }
          />
        </div>
      )}

      <LessonEditor open={target !== null} target={target} onClose={() => setTarget(null)} onSaved={() => void lessons.reload()} />

      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="إضافة حصة يدوياً إلى الدفتر اليومي"
        footer={
          <>
            <Button onClick={() => setManualOpen(false)}>إلغاء</Button>
            <Button variant="primary" onClick={() => void saveManual()}>
              إضافة الحصة
            </Button>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="التاريخ" required>
            <Input type="date" value={manual.date} onChange={(event) => setManual({ ...manual, date: event.target.value })} />
          </Field>
          <Field label="القسم" required>
            <Select
              value={manual.class_id ?? ''}
              onChange={(event) => setManual({ ...manual, class_id: Number(event.target.value) })}
            >
              <option value="">— اختر —</option>
              {classes.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المادة">
            <Select
              value={manual.subject_id ?? ''}
              onChange={(event) => setManual({ ...manual, subject_id: event.target.value ? Number(event.target.value) : null })}
            >
              <option value="">— بدون مادة —</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="من">
              <Input type="time" value={manual.start_time} onChange={(event) => setManual({ ...manual, start_time: event.target.value })} />
            </Field>
            <Field label="إلى">
              <Input type="time" value={manual.end_time} onChange={(event) => setManual({ ...manual, end_time: event.target.value })} />
            </Field>
          </div>
          <Field label="عنوان الدرس" className="md:col-span-2">
            <Input value={manual.title} onChange={(event) => setManual({ ...manual, title: event.target.value })} />
          </Field>
          <Field label="مراحل سير الحصة" className="md:col-span-2">
            <Textarea value={manual.stages} onChange={(event) => setManual({ ...manual, stages: event.target.value })} />
          </Field>
          <Field label="ملاحظات" className="md:col-span-2">
            <Textarea value={manual.notes} onChange={(event) => setManual({ ...manual, notes: event.target.value })} />
          </Field>
        </div>
        <p className="muted mt-3 text-xs">
          الفصل الحالي في الإعدادات: {TERM_LABELS[1]} / {TERM_LABELS[2]} / {TERM_LABELS[3]}
        </p>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="حذف حصة من الدفتر اليومي"
        message={`سيتم حذف درس «${deleteTarget?.title || 'بدون عنوان'}» بتاريخ ${deleteTarget?.date ?? ''} مع سجل الحضور والعلامات المرتبطة به.`}
        confirmLabel="حذف"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget
          setDeleteTarget(null)
          if (!target) return
          void run(() => window.api.lessons.remove({ id: target.id }), 'تم حذف الحصة').then(() => void lessons.reload())
        }}
      />
    </div>
  )
}
