import { useState } from 'react'
import { CalendarDays, FileText, Pencil, Plus, Printer, Trash2 } from 'lucide-react'
import type { SchoolEvent } from '@shared/types'
import { EVENT_TYPES, TERM_LABELS } from '@shared/constants'
import { addMonths, formatArabicDate, startOfMonth, endOfMonth, todayISO } from '@shared/utils/date'
import { printLink } from '@shared/print'
import { useApp } from '../store/app'
import { useAsync } from '../hooks/useAsync'
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
  Tabs,
  Textarea,
  type Column
} from '../components/ui'

interface EventForm {
  id: number | null
  type: string
  term: number
  title: string
  date: string
  class_id: number | null
  notes: string
}

export default function EventsPage(): JSX.Element {
  const classes = useApp((state) => state.classes)
  const activeYear = useApp((state) => state.activeYear)
  const navigate = useApp((state) => state.navigate)
  const run = useApp((state) => state.run)
  const toast = useApp((state) => state.toast)

  const [term, setTerm] = useState<number | null>(null)
  const [type, setType] = useState('')
  const [form, setForm] = useState<EventForm | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SchoolEvent | null>(null)
  const [tab, setTab] = useState<'list' | 'calendar'>('list')
  const [month, setMonth] = useState(startOfMonth(todayISO()))

  const events = useAsync<SchoolEvent[]>(
    () => window.api.events.list({ term: term ?? undefined, type: type || undefined }),
    [term, type, activeYear?.id],
    []
  )

  const calendar = useAsync(
    () => window.api.events.calendar({ from: month, to: endOfMonth(month) }),
    [month, activeYear?.id],
    [] as Awaited<ReturnType<typeof window.api.events.calendar>>
  )

  const openForm = (row?: SchoolEvent): void =>
    setForm(
      row
        ? {
            id: row.id,
            type: row.type,
            term: row.term,
            title: row.title,
            date: row.date,
            class_id: row.class_id,
            notes: row.notes ?? ''
          }
        : {
            id: null,
            type: 'homework',
            term: term ?? 1,
            title: '',
            date: todayISO(),
            class_id: classes[0]?.id ?? null,
            notes: ''
          }
    )

  const save = async (): Promise<void> => {
    if (!form) return
    if (!form.title.trim()) {
      toast('عنوان الحدث مطلوب', 'warning')
      return
    }
    const payload = {
      academic_year_id: activeYear?.id ?? 0,
      type: form.type as 'homework' | 'exam' | 'council' | 'activity' | 'holiday' | 'other',
      term: form.term as 1 | 2 | 3,
      title: form.title.trim(),
      date: form.date,
      class_id: form.class_id,
      subject_id: null,
      notes: form.notes.trim() || null
    }
    const result = form.id
      ? await run(() => window.api.events.update({ ...payload, id: form.id as number }), 'تم تعديل الحدث')
      : await run(() => window.api.events.create(payload), 'تم إضافة الحدث')
    if (result) {
      setForm(null)
      await events.reload()
      await calendar.reload()
    }
  }

  const columns: Array<Column<SchoolEvent>> = [
    { key: 'date', header: 'التاريخ', align: 'center', width: '8rem', render: (row) => row.date },
    { key: 'term', header: 'الفصل', align: 'center', width: '8rem', render: (row) => TERM_LABELS[row.term] ?? '' },
    {
      key: 'type',
      header: 'النوع',
      align: 'center',
      width: '8rem',
      render: (row) => EVENT_TYPES.find((item) => item.value === row.type)?.label ?? row.type
    },
    { key: 'title', header: 'العنوان', sticky: true, render: (row) => <span className="font-medium">{row.title}</span> },
    { key: 'class', header: 'القسم', align: 'center', width: '8rem', render: (row) => row.class_name ?? '—' },
    { key: 'notes', header: 'ملاحظات', render: (row) => <span className="muted text-xs">{row.notes}</span> },
    {
      key: 'actions',
      header: 'إجراءات',
      align: 'center',
      width: '7rem',
      render: (row) => (
        <span className="flex justify-center gap-1">
          <button className="rounded p-1 hover:bg-[rgb(var(--surface-muted))]" title="تعديل" onClick={() => openForm(row)}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded p-1 hover:text-red-600 dark:hover:text-red-400"
            title="حذف"
            onClick={() => setDeleteTarget(row)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      )
    }
  ]

  return (
    <div>
      <PageHeader
        title="الفروض والاختبارات ومجالس الأقسام"
        subtitle="كل أحداث السنة في مكان واحد — تظهر أيضاً في التقويم"
        actions={
          <>
            <Button
              size="sm"
              icon={<Printer className="h-4 w-4" />}
              onClick={() => navigate(printLink({ document: 'events', term }))}
            >
              طباعة
            </Button>
            <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openForm()}>
              حدث جديد
            </Button>
          </>
        }
      />

      <Tabs<'list' | 'calendar'>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'list', label: `القائمة (${events.data.length})` },
          { value: 'calendar', label: 'التقويم الشهري' }
        ]}
      />

      {tab === 'list' && (
        <>
          <div className="card card-pad mb-3 grid gap-3 md:grid-cols-3">
            <Field label="الفصل">
              <Select value={term ?? ''} onChange={(event) => setTerm(event.target.value ? Number(event.target.value) : null)}>
                <option value="">كل الفصول</option>
                {[1, 2, 3].map((value) => (
                  <option key={value} value={value}>
                    {TERM_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="النوع">
              <Select value={type} onChange={(event) => setType(event.target.value)}>
                <option value="">كل الأنواع</option>
                {EVENT_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <DataTable columns={columns} rows={events.data} rowKey={(row) => row.id} emptyMessage="لا توجد أحداث مسجّلة." />

          {events.data.length === 0 && (
            <div className="mt-4">
              <EmptyState
                icon={<FileText className="h-6 w-6" />}
                title="لا أحداث بعد"
                message="سجّل تواريخ الفروض والاختبارات ومجالس الأقسام لتبقى أمامك طوال السنة."
                action={
                  <Button variant="primary" onClick={() => openForm()}>
                    إضافة حدث
                  </Button>
                }
              />
            </div>
          )}
        </>
      )}

      {tab === 'calendar' && (
        <div>
          <div className="card card-pad mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setMonth(addMonths(month, -1))}>
                الشهر السابق
              </Button>
              <Badge tone="info">{formatArabicDate(month)}</Badge>
              <Button size="sm" onClick={() => setMonth(addMonths(month, 1))}>
                الشهر التالي
              </Button>
            </div>
            <span className="muted text-xs">
              <CalendarDays className="mb-0.5 inline h-3.5 w-3.5" /> {calendar.data.length} عنصر (حصص، تقييمات، أحداث)
            </span>
          </div>

          {calendar.data.length === 0 ? (
            <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="لا عناصر في هذا الشهر" />
          ) : (
            <ul className="space-y-2">
              {calendar.data.map((item, index) => (
                <li key={`${item.kind}-${item.id}-${index}`} className="card flex items-center justify-between gap-3 p-3">
                  <div className="flex items-center gap-3">
                    <span className="w-24 rounded-md bg-brand-50 px-2 py-1 text-center text-xs font-semibold tabular-nums text-brand-800 dark:bg-slate-800 dark:text-brand-100">
                      {item.date}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="muted text-xs">{item.sub}</p>
                    </div>
                  </div>
                  <Badge tone={item.kind === 'assessment' ? 'warning' : item.kind === 'event' ? 'info' : 'neutral'}>
                    {item.kind === 'lesson' ? 'حصة' : item.kind === 'assessment' ? 'تقييم' : 'حدث'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? 'تعديل حدث' : 'حدث جديد'}
        footer={
          <>
            <Button onClick={() => setForm(null)}>إلغاء</Button>
            <Button variant="primary" onClick={() => void save()}>
              حفظ
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="النوع">
              <Select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                {EVENT_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="الفصل">
              <Select value={form.term} onChange={(event) => setForm({ ...form, term: Number(event.target.value) })}>
                {[1, 2, 3].map((value) => (
                  <option key={value} value={value}>
                    {TERM_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="العنوان" required className="md:col-span-2">
              <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="مثال: الفرض الأول — 2 متوسط 1" />
            </Field>
            <Field label="التاريخ">
              <Input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
            </Field>
            <Field label="القسم">
              <Select
                value={form.class_id ?? ''}
                onChange={(event) => setForm({ ...form, class_id: event.target.value ? Number(event.target.value) : null })}
              >
                <option value="">— بدون قسم —</option>
                {classes.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ملاحظات / مخرجات" className="md:col-span-2">
              <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="حذف حدث"
        message={`سيتم حذف «${deleteTarget?.title ?? ''}».`}
        confirmLabel="حذف"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget
          setDeleteTarget(null)
          if (!target) return
          void run(() => window.api.events.remove({ id: target.id }), 'تم حذف الحدث').then(() => {
            void events.reload()
            void calendar.reload()
          })
        }}
      />
    </div>
  )
}
