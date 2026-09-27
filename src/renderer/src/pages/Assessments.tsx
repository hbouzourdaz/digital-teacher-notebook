import { useEffect, useState } from 'react'
import { ClipboardList, Copy, FilePlus2, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import type { Assessment, Student } from '@shared/types'
import { ASSESSMENT_TYPES, TERM_LABELS } from '@shared/constants'
import { formatNumber, parseNumber } from '@shared/utils/misc'
import { todayISO } from '@shared/utils/date'
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

interface AssessmentForm {
  id: number | null
  class_id: number | null
  name: string
  type: string
  term: number
  date: string
  max_score: number
  weight: number
  notes: string
}

export default function AssessmentsPage({ initialAssessmentId }: { initialAssessmentId?: number | null }): JSX.Element {
  const classes = useApp((state) => state.classes)
  const activeYear = useApp((state) => state.activeYear)
  const navigate = useApp((state) => state.navigate)
  const run = useApp((state) => state.run)
  const toast = useApp((state) => state.toast)

  const [classId, setClassId] = useState<number | null>(null)
  const [term, setTerm] = useState<number | null>(null)
  const [type, setType] = useState<string>('')
  const [form, setForm] = useState<AssessmentForm | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Assessment | null>(null)
  const [copyTarget, setCopyTarget] = useState<Assessment | null>(null)
  const [copyName, setCopyName] = useState('')
  const [copyDate, setCopyDate] = useState(todayISO())
  const [copyTerm, setCopyTerm] = useState(1)
  const [scoreTarget, setScoreTarget] = useState<Assessment | null>(null)

  const assessments = useAsync<Assessment[]>(
    () => window.api.assessments.list({ class_id: classId, term: term ?? undefined, type: type || undefined }),
    [classId, term, type, activeYear?.id],
    []
  )

  useEffect(() => {
    if (!initialAssessmentId) return
    void window.api.assessments
      .list({})
      .then((rows) => {
        const found = rows.find((row) => row.id === initialAssessmentId)
        if (found) {
          setScoreTarget(found)
          setClassId(found.class_id)
        }
      })
      .catch(() => undefined)
  }, [initialAssessmentId])

  const openForm = (row?: Assessment): void =>
    setForm(
      row
        ? {
            id: row.id,
            class_id: row.class_id,
            name: row.name,
            type: row.type,
            term: row.term,
            date: row.date,
            max_score: row.max_score,
            weight: row.weight,
            notes: row.notes ?? ''
          }
        : {
            id: null,
            class_id: classId ?? classes[0]?.id ?? null,
            name: 'الفرض',
            type: 'homework',
            term: term ?? 1,
            date: todayISO(),
            max_score: 20,
            weight: 1,
            notes: ''
          }
    )

  const save = async (): Promise<void> => {
    if (!form) return
    if (!form.class_id) {
      toast('اختر القسم', 'warning')
      return
    }
    if (!form.name.trim()) {
      toast('اسم التقييم مطلوب', 'warning')
      return
    }
    const payload = {
      academic_year_id: activeYear?.id ?? 0,
      class_id: form.class_id,
      subject_id: classes.find((row) => row.id === form.class_id)?.subject_id ?? null,
      category_id: null,
      name: form.name.trim(),
      type: form.type,
      term: form.term as 1 | 2 | 3,
      date: form.date,
      max_score: form.max_score,
      weight: form.weight,
      daily_lesson_id: null,
      notes: form.notes.trim() || null
    }
    const result = form.id
      ? await run(() => window.api.assessments.update({ ...payload, id: form.id as number }), 'تم تعديل التقييم')
      : await run(() => window.api.assessments.create(payload), 'تم إنشاء التقييم')
    if (result) {
      setForm(null)
      await assessments.reload()
    }
  }

  const columns: Array<Column<Assessment>> = [
    { key: 'date', header: 'التاريخ', align: 'center', width: '7rem', render: (row) => row.date },
    { key: 'name', header: 'التقييم', sticky: true, render: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: 'type',
      header: 'النوع',
      align: 'center',
      width: '7rem',
      render: (row) => ASSESSMENT_TYPES.find((item) => item.value === row.type)?.label ?? row.type
    },
    { key: 'term', header: 'الفصل', align: 'center', width: '8rem', render: (row) => TERM_LABELS[row.term] ?? '' },
    { key: 'class', header: 'القسم', align: 'center', width: '8rem', render: (row) => row.class_name ?? '' },
    { key: 'max', header: 'القصوى', align: 'center', width: '5rem', render: (row) => formatNumber(row.max_score) },
    { key: 'weight', header: 'الوزن', align: 'center', width: '5rem', render: (row) => formatNumber(row.weight) },
    {
      key: 'count',
      header: 'العلامات',
      align: 'center',
      width: '7rem',
      render: (row) => (
        <Badge tone={(row.scores_count ?? 0) > 0 ? 'success' : 'warning'}>{row.scores_count ?? 0}</Badge>
      )
    },
    {
      key: 'actions',
      header: 'إجراءات',
      align: 'center',
      width: '14rem',
      render: (row) => (
        <span className="flex justify-center gap-1">
          <Button size="sm" variant="primary" onClick={() => setScoreTarget(row)}>
            إدخال العلامات
          </Button>
          <button className="rounded p-1 hover:bg-[rgb(var(--surface-muted))]" title="تعديل" onClick={() => openForm(row)}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded p-1 hover:bg-[rgb(var(--surface-muted))]"
            title="نسخ التقييم"
            onClick={() => {
              setCopyTarget(row)
              setCopyName(`${row.name} (نسخة)`)
              setCopyDate(todayISO())
              setCopyTerm(row.term)
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

  return (
    <div>
      <PageHeader
        title="التقييمات"
        subtitle="الفروض والاختبارات — العلامات تُظهر تلقائياً في دفتر التنقيط دون إعادة كتابتها"
        actions={
          <>
            <Button size="sm" icon={<ClipboardList className="h-4 w-4" />} onClick={() => navigate('/gradebook')}>
              دفتر التنقيط
            </Button>
            <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openForm()}>
              تقييم جديد
            </Button>
          </>
        }
      />

      <div className="card card-pad mb-3 grid gap-3 md:grid-cols-3">
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
            {ASSESSMENT_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <DataTable
        columns={columns}
        rows={assessments.data}
        rowKey={(row) => row.id}
        emptyMessage="لا توجد تقييمات. أنشئ «فرضاً» أو «اختباراً» ثم أدخل العلامات."
      />

      {assessments.data.length === 0 && (
        <div className="mt-4">
          <EmptyState
            icon={<FilePlus2 className="h-6 w-6" />}
            title="لم تُنشئ أي تقييم بعد"
            message="أنشئ تقييماً واحداً لكل قسم وفصل، ثم أدخل العلامات بسرعة من شبكة الإدخال."
            action={
              <Button variant="primary" onClick={() => openForm()}>
                تقييم جديد
              </Button>
            }
          />
        </div>
      )}

      {/* إنشاء/تعديل تقييم */}
      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? 'تعديل تقييم' : 'تقييم جديد'}
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
            <Field label="اسم التقييم" required>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field label="النوع">
              <Select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                {ASSESSMENT_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="القسم" required>
              <Select value={form.class_id ?? ''} onChange={(event) => setForm({ ...form, class_id: Number(event.target.value) })}>
                <option value="">— اختر —</option>
                {classes.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
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
            <Field label="التاريخ">
              <Input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
            </Field>
            <Field label="العلامة القصوى" hint="لا تُقبل أي علامة تتجاوز هذه القيمة">
              <Input
                type="number"
                min={1}
                value={form.max_score}
                onChange={(event) => setForm({ ...form, max_score: Number(event.target.value || 0) })}
              />
            </Field>
            <Field label="الوزن في المعدل">
              <Input
                type="number"
                min={0}
                step={0.5}
                value={form.weight}
                onChange={(event) => setForm({ ...form, weight: Number(event.target.value || 0) })}
              />
            </Field>
            <Field label="ملاحظات" className="md:col-span-2">
              <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      {/* نسخ تقييم */}
      <Modal
        open={copyTarget !== null}
        onClose={() => setCopyTarget(null)}
        size="sm"
        title={`نسخ «${copyTarget?.name ?? ''}»`}
        footer={
          <>
            <Button onClick={() => setCopyTarget(null)}>إلغاء</Button>
            <Button
              variant="primary"
              onClick={() => {
                const target = copyTarget
                setCopyTarget(null)
                if (!target) return
                void window.api.assessments
                  .copy({ from_assessment_id: target.id, name: copyName.trim(), date: copyDate, term: copyTerm, overwrite: false })
                  .then(() => {
                    toast('تم نسخ التقييم مع علاماته')
                    void assessments.reload()
                  })
                  .catch((error: unknown) =>
                    toast(error instanceof Error ? error.message : 'تعذر نسخ التقييم', 'error')
                  )
              }}
            >
              نسخ
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="اسم التقييم الجديد" required>
            <Input value={copyName} onChange={(event) => setCopyName(event.target.value)} />
          </Field>
          <Field label="التاريخ">
            <Input type="date" value={copyDate} onChange={(event) => setCopyDate(event.target.value)} />
          </Field>
          <Field label="الفصل">
            <Select value={copyTerm} onChange={(event) => setCopyTerm(Number(event.target.value))}>
              {[1, 2, 3].map((value) => (
                <option key={value} value={value}>
                  {TERM_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="muted mt-2 text-xs">
          تُنسخ أيضاً كل العلامات المسجّلة في التقييم الأصلي. لا تُكتب فوق أي تقييم آخر.
        </p>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="حذف تقييم"
        message={`سيتم حذف «${deleteTarget?.name ?? ''}» وكل علاماته (${deleteTarget?.scores_count ?? 0} علامة).`}
        confirmLabel="حذف"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget
          setDeleteTarget(null)
          if (!target) return
          void run(() => window.api.assessments.remove({ id: target.id }), 'تم حذف التقييم').then(() => void assessments.reload())
        }}
      />

      <ScoreEntryDialog
        assessment={scoreTarget}
        onClose={() => setScoreTarget(null)}
        onSaved={() => void assessments.reload()}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* إدخال العلامات                                                      */
/* ------------------------------------------------------------------ */
function ScoreEntryDialog({
  assessment,
  onClose,
  onSaved
}: {
  assessment: Assessment | null
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const run = useApp((state) => state.run)
  const toast = useApp((state) => state.toast)
  const [rows, setRows] = useState<Array<{ student: Student; score: string }>>([])
  const [loading, setLoading] = useState(false)
  const [maxScore, setMaxScore] = useState(20)

  useEffect(() => {
    if (!assessment) return
    setMaxScore(assessment.max_score)
    setLoading(true)
    window.api.assessments
      .scores({ assessment_id: assessment.id })
      .then((data) => setRows(data.map((item) => ({ student: item.student, score: item.score?.score != null ? String(item.score.score) : '' }))))
      .catch((error: unknown) => toast(error instanceof Error ? error.message : 'تعذر تحميل القائمة', 'error'))
      .finally(() => setLoading(false))
  }, [assessment, toast])

  const setScore = (studentId: number, value: string): void =>
    setRows((current) => current.map((row) => (row.student.id === studentId ? { ...row, score: value } : row)))

  const focusNext = (index: number): void => {
    const element = document.getElementById(`score-${index + 1}`) as HTMLInputElement | null
    element?.focus()
    element?.select()
  }

  const save = async (): Promise<void> => {
    if (!assessment) return
    const entries = rows.map((row) => ({ student_id: row.student.id, score: parseNumber(row.score), note: null }))
    const invalid = entries.find((entry) => entry.score !== null && (entry.score > maxScore || entry.score < 0))
    if (invalid) {
      toast(`العلامة يجب أن تكون بين 0 و ${maxScore}`, 'warning')
      return
    }
    const result = await run(() =>
      window.api.assessments.saveScores({ assessment_id: assessment.id, max_score: maxScore, entries })
    )
    if (result) {
      toast(`تم حفظ ${result.saved} علامة`)
      onSaved()
      onClose()
    }
  }

  return (
    <Modal
      open={assessment !== null}
      onClose={onClose}
      size="lg"
      title={`إدخال العلامات — ${assessment?.name ?? ''} (${assessment?.class_name ?? ''})`}
      footer={
        <>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" icon={<Save className="h-4 w-4" />} onClick={() => void save()}>
            حفظ العلامات
          </Button>
        </>
      }
    >
      <div className="mb-3 grid gap-3 md:grid-cols-3">
        <Field label="العلامة القصوى" hint="عدّلها قبل الحفظ إن كانت مختلفة">
          <Input type="number" min={1} value={maxScore} onChange={(event) => setMaxScore(Number(event.target.value || 0))} />
        </Field>
        <Field label="الفصل">
          <Input value={TERM_LABELS[assessment?.term ?? 1] ?? ''} disabled />
        </Field>
        <Field label="التاريخ">
          <Input value={assessment?.date ?? ''} disabled />
        </Field>
      </div>

      {loading ? (
        <p className="muted py-8 text-center text-sm">جارٍ التحميل…</p>
      ) : (
        <div className="table-wrap">
          <table className="grid text-sm">
            <thead>
              <tr>
                <th className="w-12 text-center">الرقم</th>
                <th>الاسم الكامل</th>
                <th className="w-24 text-center">العلامة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.student.id}>
                  <td className="text-center tabular-nums">{row.student.number ?? index + 1}</td>
                  <td>{row.student.full_name}</td>
                  <td className="p-0.5">
                    <input
                      id={`score-${index}`}
                      className="cell-input"
                      inputMode="decimal"
                      value={row.score}
                      onChange={(event) => setScore(row.student.id, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === 'ArrowDown') {
                          event.preventDefault()
                          focusNext(index)
                        }
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted mt-3 text-xs">Enter أو السهم لأسفل: الانتقال إلى التلميذ التالي. العلامات تظهر تلقائياً في دفتر التنقيط.</p>
    </Modal>
  )
}
