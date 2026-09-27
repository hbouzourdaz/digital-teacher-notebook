import { useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  ClipboardList,
  Copy,
  GraduationCap,
  Pencil,
  Plus,
  Printer,
  Trash2,
  Users
} from 'lucide-react'
import type { Assessment, ClassRow, ClassStats, ComputedGrade, DailyLesson, SchoolEvent, Student } from '@shared/types'
import { PLAN_STATUSES, TERM_LABELS } from '@shared/constants'
import { printLink } from '@shared/print'
import { useApp } from '../store/app'
import { useAsync } from '../hooks/useAsync'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  StatCard,
  Tabs,
  Textarea,
  type Column
} from '../components/ui'
import { formatNumber } from '@shared/utils/misc'

interface ClassForm {
  id: number | null
  name: string
  level_id: number | null
  stream: string
  subject_id: number | null
  notes: string
}

export default function ClassesPage({ classId }: { classId: number | null }): JSX.Element {
  return classId ? <ClassDetail classId={classId} /> : <ClassesList />
}

function ClassesList(): JSX.Element {
  const navigate = useApp((state) => state.navigate)
  const levels = useApp((state) => state.levels)
  const subjects = useApp((state) => state.subjects)
  const activeYear = useApp((state) => state.activeYear)
  const run = useApp((state) => state.run)
  const toast = useApp((state) => state.toast)
  const refreshClasses = useApp((state) => state.refreshClasses)

  const classes = useAsync<ClassRow[]>(() => window.api.classes.list({}), [activeYear?.id], [])
  const [form, setForm] = useState<ClassForm | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ClassRow | null>(null)
  const [cloneTarget, setCloneTarget] = useState<ClassRow | null>(null)
  const [cloneName, setCloneName] = useState('')
  const [cloneStudents, setCloneStudents] = useState(false)
  const [saving, setSaving] = useState(false)

  const reload = async (): Promise<void> => {
    await classes.reload()
    await refreshClasses()
  }

  const columns: Array<Column<ClassRow>> = [
    {
      key: 'name',
      header: 'القسم',
      sticky: true,
      width: '11rem',
      render: (row) => (
        <button
          className="font-semibold hover:text-brand-700 dark:hover:text-brand-200"
          onClick={() => navigate(`/classes/${row.id}`)}
        >
          {row.name}
        </button>
      )
    },
    { key: 'level', header: 'المستوى', align: 'center', width: '9rem', render: (row) => row.level_name ?? '—' },
    { key: 'stream', header: 'الشعبة', align: 'center', width: '7rem', render: (row) => row.stream ?? '—' },
    { key: 'subject', header: 'المادة', align: 'center', width: '11rem', render: (row) => row.subject_name ?? '—' },
    {
      key: 'students',
      header: 'التلاميذ',
      align: 'center',
      width: '8rem',
      render: (row) => (
        <span className="tabular-nums">
          {row.students_count ?? 0}
          <span className="muted text-xs"> (ذ {row.boys_count ?? 0} / إ {row.girls_count ?? 0})</span>
        </span>
      )
    },
    {
      key: 'actions',
      header: 'إجراءات',
      align: 'center',
      width: '10rem',
      render: (row) => (
        <span className="flex justify-center gap-1">
          <button className="rounded p-1 hover:bg-[rgb(var(--surface-muted))]" title="تعديل" onClick={() => openForm(row)}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded p-1 hover:bg-[rgb(var(--surface-muted))]"
            title="استنساخ القسم"
            onClick={() => {
              setCloneTarget(row)
              setCloneName(`${row.name} (نسخة)`)
              setCloneStudents(false)
            }}
          >
            <Copy className="h-3.5 w-3.5" />
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

  function openForm(row?: ClassRow): void {
    setForm(
      row
        ? {
            id: row.id,
            name: row.name,
            level_id: row.level_id,
            stream: row.stream ?? '',
            subject_id: row.subject_id,
            notes: row.notes ?? ''
          }
        : { id: null, name: '', level_id: levels[0]?.id ?? null, stream: '', subject_id: subjects[0]?.id ?? null, notes: '' }
    )
  }

  const save = async (): Promise<void> => {
    if (!form) return
    if (!form.name.trim()) {
      toast('اسم القسم مطلوب', 'warning')
      return
    }
    setSaving(true)
    const payload = {
      academic_year_id: activeYear?.id ?? 0,
      name: form.name.trim(),
      level_id: form.level_id,
      stream: form.stream.trim() || null,
      subject_id: form.subject_id,
      notes: form.notes.trim() || null,
      sort_order: 0
    }
    const result = form.id
      ? await run(() => window.api.classes.update({ ...payload, id: form.id as number }), 'تم تعديل القسم')
      : await run(() => window.api.classes.create(payload), 'تمت إضافة القسم')
    setSaving(false)
    if (result) {
      setForm(null)
      await reload()
    }
  }

  const confirmDelete = async (): Promise<void> => {
    const target = deleteTarget
    setDeleteTarget(null)
    if (!target) return
    const impact = await window.api.dialogs.confirm({
      title: 'حذف قسم',
      message: `هل تريد حذف القسم «${target.name}»؟`,
      detail: `هذا القسم مرتبط بـ ${target.students_count ?? 0} تلميذاً وحصص وتقييمات مسجّلة. سيتم حذف البيانات المرتبطة به.`,
      confirmLabel: 'حذف القسم'
    })
    if (!impact) return
    await run(() => window.api.classes.remove({ id: target.id }), 'تم حذف القسم')
    await reload()
  }

  return (
    <div>
      <PageHeader
        title="الأقسام"
        subtitle={`${classes.data.length} قسم في السنة ${activeYear?.label ?? ''}`}
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openForm()}>
            إضافة قسم
          </Button>
        }
      />

      {classes.loading ? (
        <LoadingBlock />
      ) : classes.data.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-6 w-6" />}
          title="لم تتم إضافة أي قسم بعد"
          message="أضف أقسامك المسندة (مثال: 2 متوسط 1) ثم أضف التلاميذ وإدخال الجدول الأسبوعي."
          action={
            <Button variant="primary" onClick={() => openForm()}>
              إضافة قسم
            </Button>
          }
        />
      ) : (
        <DataTable columns={columns} rows={classes.data} rowKey={(row) => row.id} />
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? 'تعديل قسم' : 'إضافة قسم'}
        size="md"
        footer={
          <>
            <Button onClick={() => setForm(null)}>إلغاء</Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              حفظ
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="اسم القسم" required hint="مثال: 2 متوسط 1">
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
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
            <Field label="الشعبة (إن وُجدت)">
              <Input value={form.stream} onChange={(event) => setForm({ ...form, stream: event.target.value })} />
            </Field>
            <Field label="المادة">
              <Select
                value={form.subject_id ?? ''}
                onChange={(event) => setForm({ ...form, subject_id: event.target.value ? Number(event.target.value) : null })}
              >
                <option value="">— بدون مادة —</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ملاحظات" className="md:col-span-2">
              <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={cloneTarget !== null}
        onClose={() => setCloneTarget(null)}
        title={`استنساخ القسم «${cloneTarget?.name ?? ''}»`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setCloneTarget(null)}>إلغاء</Button>
            <Button
              variant="primary"
              onClick={() => {
                const target = cloneTarget
                setCloneTarget(null)
                if (!target) return
                void run(
                  () => window.api.classes.clone({ id: target.id, name: cloneName.trim(), copyStudents: cloneStudents }),
                  'تم استنساخ القسم'
                ).then(() => void reload())
              }}
            >
              استنساخ
            </Button>
          </>
        }
      >
        <Field label="اسم القسم الجديد" required>
          <Input value={cloneName} onChange={(event) => setCloneName(event.target.value)} />
        </Field>
        <div className="mt-3">
          <Checkbox
            checked={cloneStudents}
            onChange={setCloneStudents}
            label="نسخ قائمة التلاميذ أيضاً (يمكن تعديلها بعد ذلك)"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="حذف قسم"
        message={`هل تريد حذف القسم «${deleteTarget?.name ?? ''}»؟`}
        detail="سيتم حذف التلاميذ والحصص والتقييمات المرتبطة به. لا يمكن التراجع عن هذه العملية."
        confirmLabel="حذف"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* تفصيل القسم                                                         */
/* ------------------------------------------------------------------ */
type ClassTab = 'students' | 'lessons' | 'assessments' | 'grades' | 'plan' | 'attendance'

function ClassDetail({ classId }: { classId: number }): JSX.Element {
  const navigate = useApp((state) => state.navigate)
  const activeYear = useApp((state) => state.activeYear)
  const [tab, setTab] = useState<ClassTab>('students')
  const [term, setTerm] = useState(1)

  const report = useAsync(
    () => window.api.classes.report({ class_id: classId, term }),
    [classId, term, activeYear?.id],
    null as null | {
      classRow: ClassRow
      students: Student[]
      stats: ClassStats
      lessons: DailyLesson[]
      assessments: Assessment[]
      events: SchoolEvent[]
      grades: ComputedGrade[]
    }
  )

  const data = report.data

  const studentColumns: Array<Column<Student>> = [
    { key: 'number', header: 'الرقم', align: 'center', width: '5rem', render: (row, index) => row.number ?? index + 1 },
    {
      key: 'name',
      header: 'الاسم الكامل',
      sticky: true,
      render: (row) => (
        <button className="hover:text-brand-700 dark:hover:text-brand-200" onClick={() => navigate(`/students/${row.id}`)}>
          {row.full_name}
        </button>
      )
    },
    { key: 'gender', header: 'الجنس', align: 'center', width: '6rem', render: (row) => (row.gender === 'male' ? 'ذكر' : row.gender === 'female' ? 'أنثى' : '—') },
    { key: 'birth', header: 'تاريخ الميلاد', align: 'center', width: '9rem', render: (row) => row.birth_date ?? '—' },
    { key: 'notes', header: 'ملاحظات', render: (row) => <span className="muted text-xs">{row.notes}</span> }
  ]

  const lessonColumns: Array<Column<DailyLesson>> = [
    { key: 'date', header: 'التاريخ', align: 'center', width: '7rem', render: (row) => row.date },
    { key: 'time', header: 'التوقيت', align: 'center', width: '7rem', render: (row) => `${row.start_time} - ${row.end_time}` },
    { key: 'title', header: 'عنوان الدرس', render: (row) => row.title || 'بدون عنوان' },
    { key: 'status', header: 'الحالة', align: 'center', width: '6rem', render: (row) => (row.status === 'recorded' ? 'مسجّلة' : 'مسودة') }
  ]

  const assessmentColumns: Array<Column<Assessment>> = [
    { key: 'date', header: 'التاريخ', align: 'center', width: '7rem', render: (row) => row.date },
    { key: 'name', header: 'التقييم', render: (row) => row.name },
    { key: 'type', header: 'النوع', align: 'center', width: '7rem', render: (row) => row.type },
    { key: 'term', header: 'الفصل', align: 'center', width: '8rem', render: (row) => TERM_LABELS[row.term] ?? '' },
    { key: 'max', header: 'القصوى', align: 'center', width: '5rem', render: (row) => row.max_score },
    { key: 'count', header: 'العلامات', align: 'center', width: '6rem', render: (row) => row.scores_count ?? 0 }
  ]

  const gradeColumns: Array<Column<ComputedGrade>> = [
    { key: 'number', header: 'الرقم', align: 'center', width: '5rem', render: (row, index) => row.number ?? index + 1 },
    { key: 'name', header: 'الاسم الكامل', sticky: true, render: (row) => row.full_name },
    { key: 'continuous', header: 'التقويم المستمر', align: 'center', render: (row) => formatNumber(row.continuous) },
    { key: 'homework', header: 'الفرض', align: 'center', render: (row) => formatNumber(row.homework) },
    { key: 'activities', header: 'معدل النشاطات', align: 'center', render: (row) => formatNumber(row.activities) },
    { key: 'exam', header: 'الاختبار', align: 'center', render: (row) => formatNumber(row.exam) },
    { key: 'average', header: 'المعدل', align: 'center', render: (row) => <strong>{formatNumber(row.average)}</strong> },
    { key: 'absences', header: 'الغياب', align: 'center', render: (row) => row.absences }
  ]

  const plan = useAsync(
    () => window.api.plan.list({ level_id: data?.classRow.level_id ?? null, term }),
    [data?.classRow.level_id, term],
    [] as Awaited<ReturnType<typeof window.api.plan.list>>
  )

  const attendance = useAsync(
    () => window.api.attendance.summary({ class_id: classId }),
    [classId],
    [] as Awaited<ReturnType<typeof window.api.attendance.summary>>
  )

  const attendanceColumns: Array<Column<(typeof attendance.data)[number]>> = [
    { key: 'name', header: 'الاسم الكامل', sticky: true, render: (row) => row.full_name },
    { key: 'present', header: 'حاضر', align: 'center', render: (row) => row.present },
    { key: 'absent', header: 'غائب', align: 'center', render: (row) => row.absent },
    { key: 'late', header: 'متأخر', align: 'center', render: (row) => row.late },
    { key: 'excused', header: 'معفي', align: 'center', render: (row) => row.excused }
  ]

  const planColumns: Array<Column<(typeof plan.data)[number]>> = [
    { key: 'term', header: 'الفصل', align: 'center', width: '8rem', render: (row) => TERM_LABELS[row.term] ?? '' },
    { key: 'unit', header: 'المقطع', width: '12rem', render: (row) => row.unit ?? '—' },
    { key: 'lesson', header: 'الدرس', render: (row) => row.lesson_title },
    { key: 'sessions', header: 'الحصص', align: 'center', width: '5rem', render: (row) => row.sessions_count },
    {
      key: 'status',
      header: 'الحالة',
      align: 'center',
      width: '8rem',
      render: (row) => PLAN_STATUSES.find((status) => status.value === row.status)?.label ?? row.status
    }
  ]

  if (report.loading && !data) return <LoadingBlock />
  if (!data) {
    return (
      <EmptyState
        icon={<GraduationCap className="h-6 w-6" />}
        title="القسم غير موجود"
        action={
          <Button onClick={() => navigate('/classes')}>
            <ArrowRight className="h-4 w-4" /> عودة إلى الأقسام
          </Button>
        }
      />
    )
  }

  const stats = data.stats

  return (
    <div>
      <PageHeader
        title={data.classRow.name}
        subtitle={`${data.classRow.level_name ?? 'بدون مستوى'} — ${data.students.length} تلميذ — ${
          data.classRow.subject_name ?? 'بدون مادة'
        }`}
        actions={
          <>
            <Button size="sm" icon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate('/classes')}>
              كل الأقسام
            </Button>
            <Button size="sm" icon={<Users className="h-4 w-4" />} onClick={() => navigate('/students')}>
              التلاميذ
            </Button>
            <Button size="sm" icon={<ClipboardList className="h-4 w-4" />} onClick={() => navigate(`/gradebook?class=${classId}`)}>
              دفتر التنقيط
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Printer className="h-4 w-4" />}
              onClick={() => navigate(printLink({ document: 'class-list', classId }))}
            >
              طباعة
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="التلاميذ" value={stats.students_count} icon={<Users className="h-4 w-4" />} />
        <StatCard label="الحصص المسجّلة" value={stats.lessons_count} icon={<CalendarCheck className="h-4 w-4" />} />
        <StatCard label="التقييمات" value={stats.assessments_count} icon={<ClipboardList className="h-4 w-4" />} />
        <StatCard label="الغيابات" value={stats.absences} hint={`${stats.lates} تأخر`} />
        <StatCard label="متوسط القسم" value={formatNumber(stats.average)} hint={`أعلى ${formatNumber(stats.highest)} — أدنى ${formatNumber(stats.lowest)}`} />
        <StatCard label="التوزيع المنجز" value={`${stats.plan_done}/${stats.plan_total}`} icon={<BarChart3 className="h-4 w-4" />} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select className="w-40" value={term} onChange={(event) => setTerm(Number(event.target.value))}>
          {[1, 2, 3].map((value) => (
            <option key={value} value={value}>
              {TERM_LABELS[value]}
            </option>
          ))}
        </Select>
        <Badge tone="info">النقاط والمعدلات محسوبة للفصل المحدَّد</Badge>
      </div>

      <Tabs<ClassTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'students', label: `التلاميذ (${data.students.length})` },
          { value: 'lessons', label: `الحصص (${data.lessons.length})` },
          { value: 'assessments', label: `التقييمات (${data.assessments.length})` },
          { value: 'grades', label: 'المعدلات' },
          { value: 'plan', label: 'التوزيع السنوي' },
          { value: 'attendance', label: 'الحضور' }
        ]}
      />

      {tab === 'students' && <DataTable columns={studentColumns} rows={data.students} rowKey={(row) => row.id} emptyMessage="لا يوجد تلاميذ في هذا القسم." />}
      {tab === 'lessons' && <DataTable columns={lessonColumns} rows={data.lessons} rowKey={(row) => row.id} emptyMessage="لم تُسجَّل أي حصة بعد." />}
      {tab === 'assessments' && (
        <DataTable columns={assessmentColumns} rows={data.assessments} rowKey={(row) => row.id} emptyMessage="لا توجد تقييمات بعد." />
      )}
      {tab === 'grades' && (
        <DataTable
          columns={gradeColumns}
          rows={data.grades}
          rowKey={(row) => row.student_id}
          emptyMessage="لا توجد نقاط محسوبة لهذا الفصل بعد."
        />
      )}
      {tab === 'plan' && <DataTable columns={planColumns} rows={plan.data} rowKey={(row) => row.id} emptyMessage="لا يوجد توزيع سنوي لهذا المستوى." />}
      {tab === 'attendance' && (
        <DataTable
          columns={attendanceColumns}
          rows={attendance.data}
          rowKey={(row) => row.student_id}
          emptyMessage="لم يُسجَّل أي حضور لهذا القسم بعد."
        />
      )}
    </div>
  )
}
