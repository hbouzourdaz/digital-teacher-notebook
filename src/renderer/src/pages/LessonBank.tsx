import { useState } from 'react'
import { BookOpen, Eye, ListTree, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { LessonBankItem } from '@shared/types'
import { LESSON_STAGE_TEMPLATE } from '@shared/constants'
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
  Textarea,
  type Column
} from '../components/ui'

interface BankForm {
  id: number | null
  title: string
  level_id: number | null
  domain: string
  unit: string
  duration: string
  objectives: string
  stages: string
  notes: string
}

export default function LessonBankPage(): JSX.Element {
  const levels = useApp((state) => state.levels)
  const subjects = useApp((state) => state.subjects)
  const activeYear = useApp((state) => state.activeYear)
  const run = useApp((state) => state.run)
  const toast = useApp((state) => state.toast)

  const [levelId, setLevelId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<BankForm | null>(null)
  const [preview, setPreview] = useState<LessonBankItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LessonBankItem | null>(null)

  const items = useAsync<LessonBankItem[]>(
    () => window.api.bank.list({ level_id: levelId, search: search.trim() || undefined }),
    [levelId, search, activeYear?.id],
    []
  )

  const openForm = (row?: LessonBankItem): void =>
    setForm(
      row
        ? {
            id: row.id,
            title: row.title,
            level_id: row.level_id,
            domain: row.domain ?? '',
            unit: row.unit ?? '',
            duration: row.duration ?? '',
            objectives: row.objectives,
            stages: row.stages,
            notes: row.notes
          }
        : {
            id: null,
            title: '',
            level_id: levelId ?? levels[0]?.id ?? null,
            domain: '',
            unit: '',
            duration: '',
            objectives: '',
            stages: LESSON_STAGE_TEMPLATE.map((stage) => `${stage}:\n`).join('\n'),
            notes: ''
          }
    )

  const save = async (): Promise<void> => {
    if (!form) return
    if (!form.title.trim()) {
      toast('عنوان الدرس مطلوب', 'warning')
      return
    }
    const payload = {
      academic_year_id: activeYear?.id ?? 0,
      title: form.title.trim(),
      level_id: form.level_id,
      subject_id: subjects[0]?.id ?? null,
      domain: form.domain.trim() || null,
      unit: form.unit.trim() || null,
      duration: form.duration.trim() || null,
      objectives: form.objectives,
      stages: form.stages,
      notes: form.notes
    }
    const result = form.id
      ? await run(() => window.api.bank.update({ ...payload, id: form.id as number }), 'تم تعديل الدرس')
      : await run(() => window.api.bank.create(payload), 'تمت إضافة الدرس إلى بنك الدروس')
    if (result) {
      setForm(null)
      await items.reload()
    }
  }

  const columns: Array<Column<LessonBankItem>> = [
    { key: 'title', header: 'عنوان الدرس', sticky: true, render: (row) => <span className="font-medium">{row.title}</span> },
    { key: 'level', header: 'المستوى', align: 'center', width: '9rem', render: (row) => row.level_name ?? '—' },
    { key: 'domain', header: 'الميدان', width: '10rem', render: (row) => row.domain ?? '—' },
    { key: 'unit', header: 'المقطع', width: '11rem', render: (row) => row.unit ?? '—' },
    { key: 'duration', header: 'المدة', align: 'center', width: '7rem', render: (row) => row.duration ?? '—' },
    {
      key: 'stages',
      header: 'المراحل',
      align: 'center',
      width: '7rem',
      render: (row) => <Badge tone={row.stages.trim() ? 'success' : 'neutral'}>{row.stages.trim() ? 'مُعدّة' : 'فارغة'}</Badge>
    },
    {
      key: 'actions',
      header: 'إجراءات',
      align: 'center',
      width: '9rem',
      render: (row) => (
        <span className="flex justify-center gap-1">
          <button className="rounded p-1 hover:bg-[rgb(var(--surface-muted))]" title="معاينة" onClick={() => setPreview(row)}>
            <Eye className="h-3.5 w-3.5" />
          </button>
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
        title="بنك الدروس"
        subtitle="احفظ الدروس مرة واحدة وأدرجها في أي حصة (العنوان + مراحل السير تلقائياً)"
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openForm()}>
            إضافة درس
          </Button>
        }
      />

      <div className="card card-pad mb-3 grid gap-3 md:grid-cols-3">
        <Field label="المستوى">
          <Select value={levelId ?? ''} onChange={(event) => setLevelId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">كل المستويات</option>
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="بحث" className="md:col-span-2">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 opacity-50" />
            <Input className="pr-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="عنوان، هدف، مقطع…" />
          </div>
        </Field>
      </div>

      <DataTable columns={columns} rows={items.data} rowKey={(row) => row.id} emptyMessage="بنك الدروس فارغ." />

      {items.data.length === 0 && (
        <div className="mt-4">
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="لم تُضف أي درس بعد"
            message="بنك الدروس يوفّر عليك إعادة كتابة مراحل سير الحصة في كل مرة: اكتبها مرة واحدة واستدعها من داخل شاشة تسجيل الحصة."
            action={
              <Button variant="primary" onClick={() => openForm()}>
                إضافة أول درس
              </Button>
            }
          />
        </div>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        size="lg"
        title={form?.id ? 'تعديل درس' : 'إضافة درس إلى بنك الدروس'}
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
            <Field label="عنوان الدرس" required className="md:col-span-2">
              <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </Field>
            <Field label="المستوى">
              <Select
                value={form.level_id ?? ''}
                onChange={(event) => setForm({ ...form, level_id: event.target.value ? Number(event.target.value) : null })}
              >
                <option value="">— بدون مستوى —</option>
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="المدة">
              <Input value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} placeholder="مثال: حصتان" />
            </Field>
            <Field label="الميدان">
              <Input value={form.domain} onChange={(event) => setForm({ ...form, domain: event.target.value })} />
            </Field>
            <Field label="المقطع">
              <Input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
            </Field>
            <Field label="الأهداف" className="md:col-span-2">
              <Textarea value={form.objectives} onChange={(event) => setForm({ ...form, objectives: event.target.value })} />
            </Field>
            <div className="md:col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <label className="label mb-0">مراحل سير الحصة</label>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ListTree className="h-3.5 w-3.5" />}
                  onClick={() =>
                    setForm({
                      ...form,
                      stages: LESSON_STAGE_TEMPLATE.map((stage) => `${stage}:\n`).join('\n')
                    })
                  }
                >
                  إدراج القالب
                </Button>
              </div>
              <Textarea className="min-h-[170px]" value={form.stages} onChange={(event) => setForm({ ...form, stages: event.target.value })} />
            </div>
            <Field label="ملاحظات" className="md:col-span-2">
              <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal open={preview !== null} onClose={() => setPreview(null)} size="md" title={preview?.title ?? ''}>
        {preview && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2 rounded-md border p-3 text-xs">
              <div>
                <p className="muted">المستوى</p>
                <p>{preview.level_name ?? '—'}</p>
              </div>
              <div>
                <p className="muted">الميدان</p>
                <p>{preview.domain ?? '—'}</p>
              </div>
              <div>
                <p className="muted">المقطع</p>
                <p>{preview.unit ?? '—'}</p>
              </div>
            </div>
            <div>
              <p className="font-semibold">الأهداف</p>
              <p className="whitespace-pre-wrap">{preview.objectives || '—'}</p>
            </div>
            <div>
              <p className="font-semibold">مراحل سير الحصة</p>
              <p className="whitespace-pre-wrap">{preview.stages || '—'}</p>
            </div>
            {preview.notes && (
              <div>
                <p className="font-semibold">ملاحظات</p>
                <p className="whitespace-pre-wrap">{preview.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="حذف درس من بنك الدروس"
        message={`سيتم حذف «${deleteTarget?.title ?? ''}» من البنك.`}
        detail="الحصص المسجّلة سابقاً لن تتأثر."
        confirmLabel="حذف"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget
          setDeleteTarget(null)
          if (!target) return
          void run(() => window.api.bank.remove({ id: target.id }), 'تم حذف الدرس').then(() => void items.reload())
        }}
      />
    </div>
  )
}
