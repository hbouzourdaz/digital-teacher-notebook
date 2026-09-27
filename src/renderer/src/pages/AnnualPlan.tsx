import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  FolderTree,
  Layers,
  ListChecks,
  NotebookPen,
  Pencil,
  Plus,
  Printer,
  Table2,
  Trash2
} from 'lucide-react'
import type { AnnualPlanItem } from '@shared/types'
import { PLAN_STATUSES, TERM_LABELS } from '@shared/constants'
import { printLink } from '@shared/print'
import { cn } from '@shared/utils/misc'
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
  StatCard,
  Textarea,
  type Column
} from '../components/ui'

interface PlanForm {
  id: number | null
  level_id: number | null
  term: number
  domain: string
  unit: string
  lesson_title: string
  sessions_count: number
  status: string
  expected_date: string
  completed_date: string
  notes: string
}

const statusTone = (status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' =>
  status === 'done' ? 'success' : status === 'in_progress' ? 'info' : status === 'late' ? 'danger' : 'neutral'

export default function AnnualPlanPage(): JSX.Element {
  const levels = useApp((state) => state.levels)
  const subjects = useApp((state) => state.subjects)
  const activeYear = useApp((state) => state.activeYear)
  const navigate = useApp((state) => state.navigate)
  const run = useApp((state) => state.run)
  const toast = useApp((state) => state.toast)

  const [levelId, setLevelId] = useState<number | null>(null)
  const [term, setTerm] = useState<number | null>(null)
  const [subjectId, setSubjectId] = useState<number | null>(null)
  /* أول مرة تُحمَّل المواد: تُختار المادة الأولى تلقائياً (كل مادة لوحدها) —
     وبعد تدخّل الأستاذ يُحترم اختياره حتى لو رجّع «كل المواد» */
  const subjectTouched = useRef(false)
  useEffect(() => {
    if (!subjectTouched.current && subjects.length > 0 && subjectId === null) {
      setSubjectId(subjects[0].id)
    }
  }, [subjects, subjectId])
  const [view, setView] = useState<'tree' | 'table'>('tree')
  /* الميادين المطوية (مفتاح domain|term) والوحدات المطوية (مفتاح unit|domain|term) */
  const [collapsedDomains, setCollapsedDomains] = useState<Set<string>>(new Set())
  const [collapsedUnits, setCollapsedUnits] = useState<Set<string>>(new Set())
  const [form, setForm] = useState<PlanForm | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AnnualPlanItem | null>(null)

  const items = useAsync<AnnualPlanItem[]>(
    () => window.api.plan.list({ level_id: levelId, term: term ?? undefined, subject_id: subjectId ?? undefined }),
    [levelId, term, subjectId, activeYear?.id],
    []
  )
  const progress = useAsync(
    () => window.api.plan.progress({}),
    [activeYear?.id, items.data.length],
    { total: 0, done: 0, inProgress: 0, late: 0, notStarted: 0 }
  )

  const openForm = (row?: AnnualPlanItem): void =>
    setForm(
      row
        ? {
            id: row.id,
            level_id: row.level_id,
            term: row.term,
            domain: row.domain ?? '',
            unit: row.unit ?? '',
            lesson_title: row.lesson_title,
            sessions_count: row.sessions_count,
            status: row.status,
            expected_date: row.expected_date ?? '',
            completed_date: row.completed_date ?? '',
            notes: row.notes ?? ''
          }
        : {
            id: null,
            level_id: levelId ?? levels[0]?.id ?? null,
            term: term ?? 1,
            domain: '',
            unit: '',
            lesson_title: '',
            sessions_count: 1,
            status: 'not_started',
            expected_date: '',
            completed_date: '',
            notes: ''
          }
    )

  const save = async (): Promise<void> => {
    if (!form) return
    if (!form.lesson_title.trim()) {
      toast('عنوان الدرس مطلوب', 'warning')
      return
    }
    const payload = {
      academic_year_id: activeYear?.id ?? 0,
      level_id: form.level_id,
      subject_id: subjects[0]?.id ?? null,
      term: form.term as 1 | 2 | 3,
      domain: form.domain.trim() || null,
      unit: form.unit.trim() || null,
      lesson_title: form.lesson_title.trim(),
      sessions_count: form.sessions_count,
      status: form.status as 'not_started' | 'in_progress' | 'done' | 'late',
      expected_date: form.expected_date || null,
      completed_date: form.completed_date || null,
      notes: form.notes.trim() || null
    }
    const result = form.id
      ? await run(() => window.api.plan.update({ ...payload, id: form.id as number }), 'تم تعديل بند التوزيع')
      : await run(() => window.api.plan.create(payload), 'تمت إضافة الدرس إلى التوزيع السنوي')
    if (result) {
      setForm(null)
      await items.reload()
      await progress.reload()
    }
  }

  const columns: Array<Column<AnnualPlanItem>> = [
    { key: 'term', header: 'الفصل', align: 'center', width: '8rem', render: (row) => TERM_LABELS[row.term] ?? '' },
    { key: 'level', header: 'المستوى', align: 'center', width: '9rem', render: (row) => row.level_name ?? '—' },
    { key: 'domain', header: 'الميدان', width: '9rem', render: (row) => row.domain ?? '—' },
    { key: 'unit', header: 'المقطع', width: '11rem', render: (row) => row.unit ?? '—' },
    { key: 'title', header: 'الدرس', sticky: true, render: (row) => <span className="font-medium">{row.lesson_title}</span> },
    { key: 'sessions', header: 'الحصص', align: 'center', width: '5rem', render: (row) => row.sessions_count },
    { key: 'expected', header: 'متوقع', align: 'center', width: '8rem', render: (row) => row.expected_date ?? '—' },
    { key: 'completed', header: 'الإنجاز', align: 'center', width: '8rem', render: (row) => row.completed_date ?? '—' },
    {
      key: 'status',
      header: 'الحالة',
      align: 'center',
      width: '9rem',
      render: (row) => <Badge tone={statusTone(row.status)}>{PLAN_STATUSES.find((item) => item.value === row.status)?.label ?? row.status}</Badge>
    },
    {
      key: 'actions',
      header: 'إجراءات',
      align: 'center',
      width: '8rem',
      render: (row) => (
        <span className="flex justify-center gap-1">
          <button className="rounded p-1 hover:bg-[rgb(var(--surface-muted))]" title="تعديل" onClick={() => openForm(row)}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded p-1 hover:bg-[rgb(var(--surface-muted))]"
            title="تحديد كمنجز"
            onClick={() =>
              void run(
                () =>
                  window.api.plan.update({
                    id: row.id,
                    academic_year_id: row.academic_year_id,
                    level_id: row.level_id,
                    subject_id: row.subject_id,
                    term: row.term as 1 | 2 | 3,
                    domain: row.domain,
                    unit: row.unit,
                    lesson_title: row.lesson_title,
                    sessions_count: row.sessions_count,
                    status: 'done',
                    expected_date: row.expected_date,
                    completed_date: new Date().toISOString().slice(0, 10),
                    notes: row.notes
                  }),
                'تم تحديث حالة الدرس'
              ).then(() => {
                void items.reload()
                void progress.reload()
              })
            }
          >
            <BarChart3 className="h-3.5 w-3.5" />
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

  const percent = progress.data.total > 0 ? Math.round((progress.data.done / progress.data.total) * 100) : 0

  /*
   * تنظيم هرمي: المادة → الميدان → الوحدة → الدروس
   * كل مادة لوحدها، وكل ميدان يجمع وحداته، وكل وحدة تجمع دروسها.
   */
  const tree = useMemo(() => {
    interface UnitNode {
      key: string
      unit: string
      items: AnnualPlanItem[]
      done: number
    }
    interface DomainNode {
      key: string
      domain: string
      term: number
      units: UnitNode[]
      items: AnnualPlanItem[] /* دروس بلا وحدة */
      total: number
      done: number
    }
    const domains = new Map<string, DomainNode>()
    for (const item of items.data) {
      const domain = item.domain?.trim() || 'بدون ميدان'
      const key = `${item.term}|${domain}`
      let node = domains.get(key)
      if (!node) {
        node = { key, domain, term: item.term, units: [], items: [], total: 0, done: 0 }
        domains.set(key, node)
      }
      node.total++
      if (item.status === 'done') node.done++
      const unit = item.unit?.trim() || ''
      if (unit) {
        const unitKey = `${key}|${unit}`
        let unitNode = node.units.find((u) => u.key === unitKey)
        if (!unitNode) {
          unitNode = { key: unitKey, unit, items: [], done: 0 }
          node.units.push(unitNode)
        }
        unitNode.items.push(item)
        if (item.status === 'done') unitNode.done++
      } else {
        node.items.push(item)
      }
    }
    /* الفصول بترتيبها ثم الميادين بترتيب ظهورها */
    return [...domains.values()].sort((a, b) => a.term - b.term || a.domain.localeCompare(b.domain, 'ar'))
  }, [items.data])

  const toggleDomain = (key: string): void =>
    setCollapsedDomains((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const toggleUnit = (key: string): void =>
    setCollapsedUnits((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const markDone = (row: AnnualPlanItem): void =>
    void run(
      () =>
        window.api.plan.update({
          id: row.id,
          academic_year_id: row.academic_year_id,
          level_id: row.level_id,
          subject_id: row.subject_id,
          term: row.term as 1 | 2 | 3,
          domain: row.domain,
          unit: row.unit,
          lesson_title: row.lesson_title,
          sessions_count: row.sessions_count,
          status: 'done',
          expected_date: row.expected_date,
          completed_date: new Date().toISOString().slice(0, 10),
          notes: row.notes
        }),
      'تم تحديث حالة الدرس'
    ).then(() => {
      void items.reload()
      void progress.reload()
    })

  const lessonRow = (row: AnnualPlanItem, nested = false): JSX.Element => (
    <div
      key={row.id}
      className={cn(
        'group flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition hover:border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-muted))]/60',
        nested && 'ms-4'
      )}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', row.status === 'done' ? 'bg-emerald-500' : row.status === 'in_progress' ? 'bg-sky-500' : row.status === 'late' ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600')} />
      <span className={cn('min-w-0 flex-1 truncate text-sm', row.status === 'done' && 'text-[rgb(var(--text-muted))]')}>
        {row.lesson_title}
      </span>
      <span className="muted hidden shrink-0 text-[11px] tabular-nums sm:block">{row.sessions_count} ح</span>
      {row.completed_date && <Badge tone="success">{row.completed_date}</Badge>}
      <span className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
        <button className="rounded p-1 hover:bg-[rgb(var(--surface))]]" title="تعديل" onClick={() => openForm(row)}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {row.status !== 'done' && (
          <button className="rounded p-1 hover:bg-[rgb(var(--surface))]" title="تحديد كمنجز" onClick={() => markDone(row)}>
            <ListChecks className="h-3.5 w-3.5" />
          </button>
        )}
        <button className="rounded p-1 hover:bg-[rgb(var(--surface))] hover:text-red-600 dark:hover:text-red-400" title="حذف" onClick={() => setDeleteTarget(row)}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  )

  return (
    <div>
      <PageHeader
        title="التوزيع السنوي"
        subtitle="خطة الدروس لكل مستوى وفصل — تُحدَّث حالتها تلقائياً عند تسجيل الحصة المرتبطة"
        actions={
          <>
            <Button size="sm" icon={<NotebookPen className="h-4 w-4" />} onClick={() => navigate('/notebook')}>
              الدفتر اليومي
            </Button>
            <Button
              size="sm"
              icon={<Printer className="h-4 w-4" />}
              onClick={() => navigate(printLink({ document: 'annual-plan', term }))}
            >
              طباعة
            </Button>
            <Button
              size="sm"
              icon={view === 'tree' ? <Table2 className="h-4 w-4" /> : <FolderTree className="h-4 w-4" />}
              onClick={() => setView(view === 'tree' ? 'table' : 'tree')}
            >
              {view === 'tree' ? 'عرض جدولي' : 'عرض هرمي'}
            </Button>
            <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openForm()}>
              إضافة درس
            </Button>
          </>
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="المجموع" value={progress.data.total} />
        <StatCard label="منجز" value={progress.data.done} />
        <StatCard label="قيد الإنجاز" value={progress.data.inProgress} />
        <StatCard label="متأخر" value={progress.data.late} />
        <StatCard label="نسبة الإنجاز" value={`${percent}%`} />
      </div>

      <div className="card card-pad mb-3 grid gap-3 md:grid-cols-4">
        <Field label="المادة">
          <Select
            value={subjectId ?? ''}
            onChange={(event) => {
              subjectTouched.current = true
              setSubjectId(event.target.value ? Number(event.target.value) : null)
            }}
          >
            <option value="">كل المواد</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </Field>
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
        <Field label="تقدّم السنة">
          <div className="mt-2 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${percent}%` }} />
            </div>
            <span className="muted text-xs tabular-nums">{percent}%</span>
          </div>
        </Field>
      </div>

      {view === 'table' ? (
        <>
          <DataTable columns={columns} rows={items.data} rowKey={(row) => row.id} emptyMessage="لم تُضف أي بند في التوزيع السنوي بعد." />
          {items.data.length === 0 && (
            <div className="mt-4">
              <EmptyState
                icon={<BarChart3 className="h-6 w-6" />}
                title="التوزيع السنوي فارغ"
                message="أضف دروس السنة موزّعة على الفصول والمقاطع، ثم اربط كل حصة مسجّلة بدرس من هذه القائمة لتحديث نسبة الإنجاز."
                action={
                  <Button variant="primary" onClick={() => openForm()}>
                    إضافة أول درس
                  </Button>
                }
              />
            </div>
          )}
        </>
      ) : items.data.length === 0 ? (
        <EmptyState
          icon={<FolderTree className="h-6 w-6" />}
          title="لا توجد دروس لهذه المرشّحات"
          message="اختر المادة والمستوى لعرض التوزيع الهرمي: المادة → الميدان → الوحدة → الدروس."
          action={
            <Button variant="primary" onClick={() => openForm()}>
              إضافة أول درس
            </Button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {tree.map((domain) => {
            const domainCollapsed = collapsedDomains.has(domain.key)
            const domainPercent = domain.total > 0 ? Math.round((domain.done / domain.total) * 100) : 0
            return (
              <section key={domain.key} className="card overflow-hidden">
                {/* رأس الميدان */}
                <button
                  className="flex w-full items-center gap-2.5 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/50 px-3.5 py-2.5 text-right transition hover:bg-[rgb(var(--surface-muted))]"
                  onClick={() => toggleDomain(domain.key)}
                >
                  {domainCollapsed ? <ChevronLeft className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                  <Layers className="h-4 w-4 shrink-0 text-brand-600" />
                  <span className="min-w-0 flex-1 truncate font-bold">{domain.domain}</span>
                  <Badge tone="info">{TERM_LABELS[domain.term] ?? ''}</Badge>
                  <span className="muted hidden shrink-0 text-[11px] tabular-nums sm:block">
                    {domain.done}/{domain.total} منجز
                  </span>
                  <span className="w-14 shrink-0">
                    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--surface))]">
                      <span className="block h-full rounded-full bg-brand-600 transition-all" style={{ width: `${domainPercent}%` }} />
                    </span>
                  </span>
                </button>
                {!domainCollapsed && (
                  <div className="p-2.5">
                    {/* وحدات الميدان */}
                    {domain.units.map((unit) => {
                      const unitCollapsed = collapsedUnits.has(unit.key)
                      const unitPercent = unit.items.length > 0 ? Math.round((unit.done / unit.items.length) * 100) : 0
                      return (
                        <div key={unit.key} className="mb-1.5 last:mb-0">
                          <button
                            className="flex w-full items-center gap-2 rounded-md bg-brand-50/70 px-2.5 py-1.5 text-right transition hover:bg-brand-50 dark:bg-brand-900/25 dark:hover:bg-brand-900/40"
                            onClick={() => toggleUnit(unit.key)}
                          >
                            {unitCollapsed ? <ChevronLeft className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                            <BookOpen className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-900 dark:text-brand-100">{unit.unit}</span>
                            <span className="muted shrink-0 text-[11px] tabular-nums">
                              {unit.done}/{unit.items.length}
                            </span>
                            <span className="w-10 shrink-0">
                              <span className="block h-1.5 w-full overflow-hidden rounded-full bg-white/80 dark:bg-slate-700">
                                <span className="block h-full rounded-full bg-brand-500 transition-all" style={{ width: `${unitPercent}%` }} />
                              </span>
                            </span>
                          </button>
                          {!unitCollapsed && <div className="mt-1">{unit.items.map((row) => lessonRow(row, true))}</div>}
                        </div>
                      )
                    })}
                    {/* دروس بلا وحدة تجمع مباشرة تحت الميدان */}
                    {domain.items.length > 0 && <div className="mt-1">{domain.items.map((row) => lessonRow(row))}</div>}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? 'تعديل بند التوزيع السنوي' : 'إضافة درس إلى التوزيع السنوي'}
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
            <Field label="الفصل">
              <Select value={form.term} onChange={(event) => setForm({ ...form, term: Number(event.target.value) })}>
                {[1, 2, 3].map((value) => (
                  <option key={value} value={value}>
                    {TERM_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="الميدان">
              <Input value={form.domain} onChange={(event) => setForm({ ...form, domain: event.target.value })} placeholder="مثال: المادة وتحولاتها" />
            </Field>
            <Field label="المقطع">
              <Input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
            </Field>
            <Field label="الدرس" required className="md:col-span-2">
              <Input value={form.lesson_title} onChange={(event) => setForm({ ...form, lesson_title: event.target.value })} />
            </Field>
            <Field label="عدد الحصص">
              <Input
                type="number"
                min={0}
                value={form.sessions_count}
                onChange={(event) => setForm({ ...form, sessions_count: Number(event.target.value || 0) })}
              />
            </Field>
            <Field label="الحالة">
              <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                {PLAN_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="التاريخ المتوقع">
              <Input type="date" value={form.expected_date} onChange={(event) => setForm({ ...form, expected_date: event.target.value })} />
            </Field>
            <Field label="تاريخ الإنجاز">
              <Input type="date" value={form.completed_date} onChange={(event) => setForm({ ...form, completed_date: event.target.value })} />
            </Field>
            <Field label="ملاحظات" className="md:col-span-2">
              <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="حذف بند من التوزيع السنوي"
        message={`سيتم حذف «${deleteTarget?.lesson_title ?? ''}».`}
        detail="الحصص المسجّلة في الدفتر اليومي لن تُحذف."
        confirmLabel="حذف"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget
          setDeleteTarget(null)
          if (!target) return
          void run(() => window.api.plan.remove({ id: target.id }), 'تم حذف البند').then(() => {
            void items.reload()
            void progress.reload()
          })
        }}
      />
    </div>
  )
}
