import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Calculator, ClipboardList, Info, Plus, Printer, RefreshCw, Save, Sparkles, Trash2 } from 'lucide-react'
import type { Assessment, AssessmentCategory, ComputedGrade, ContinuousEntry, GradeFormula } from '@shared/types'
import { ASSESSMENT_TYPES, CONTINUOUS_KINDS, TERM_LABELS } from '@shared/constants'
import { describeFormula, parseFormulaComponents } from '@shared/utils/grades'
import { todayISO } from '@shared/utils/date'
import { cn, formatNumber, parseNumber } from '@shared/utils/misc'
import { printLink } from '@shared/print'
import { useApp } from '../store/app'
import { useAsync } from '../hooks/useAsync'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, LoadingBlock, PageHeader, Select, StatCard } from '../components/ui'

interface GradebookData {
  rows: ComputedGrade[]
  formula: GradeFormula
  summary: { average: number | null; highest: number | null; lowest: number | null; passing: number; counted: number; students: number }
}

/** خانة من خانات الدفتر الورقي تُكتب مباشرة وتغذّي صيغة المعدل */
interface SimpleKind {
  /** نوع التقييم أو نوع التقويم المستمر الذي تُحفظ فيه القيمة */
  type: 'homework' | 'exam' | 'activity'
  label: string
  source: 'assessment' | 'continuous'
  /** أنواع التقييمات التي تُحسب منها الخانة عند وجودها */
  fromTypes: string[]
}

/**
 * خانات الدفتر الورقي: «الفرض» و«معدل النشاطات» و«الاختبار».
 * تُكتب مباشرةً من نفس الشاشة:
 *  - بلا تقييمات مفصّلة ⇒ خانة إدخال، ويُنشأ التقييم تلقائياً عند أول كتابة (الفرض/الاختبار)،
 *    أو تُحفظ في «الأنشطة» من التقويم المستمر (معدل النشاطات).
 *  - بتقييم واحد أو أكثر ⇒ تُعرض معدّلاً محسوباً، والإدخال يكون في الأعمدة المفصّلة.
 */
const SIMPLE_KINDS: SimpleKind[] = [
  { type: 'homework', label: 'الفرض', source: 'assessment', fromTypes: ['homework'] },
  { type: 'activity', label: 'معدل النشاطات', source: 'continuous', fromTypes: ['activity', 'project'] },
  { type: 'exam', label: 'الاختبار', source: 'assessment', fromTypes: ['exam'] }
]

/** عمود في الجدول: تقييم مفصّل، أو تقويم مستمر، أو خانة من خانات الدفتر الورقي */
interface EntryColumn {
  key: string
  label: string
  hint: string
  max: number
  mode: 'assessment' | 'continuous' | 'simple'
  type: string
  assessmentId?: number
  editable: boolean
  sourceCount?: number
  simple?: SimpleKind
}

const CONTINUOUS_MAX = 20
const ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر']
/** أنواع التقويم المستمر التي تُدخل كأعمدة مستقلة (الأنشطة تُدخل من خانة «معدل النشاطات») */
const CONTINUOUS_INPUT_KINDS = CONTINUOUS_KINDS.filter((kind) => kind.value !== 'activity')

const cellId = (key: string, studentId: number): string => `gb-${key.replace(/:/g, '-')}-${studentId}`

/** ألوان أعمدة التقييم بحسب نوعها — يفصلها بصرياً عن التقويم المستمر */
function assessmentTone(type: string): string {
  if (type === 'homework') return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
  if (type === 'exam') return 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100'
  if (type === 'activity' || type === 'project') return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100'
  return 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100'
}

export default function GradebookPage({ initialClassId }: { initialClassId: number | null }): JSX.Element {
  const classes = useApp((state) => state.classes)
  const activeYear = useApp((state) => state.activeYear)
  const navigate = useApp((state) => state.navigate)
  const toast = useApp((state) => state.toast)
  const run = useApp((state) => state.run)

  const [classId, setClassId] = useState<number | null>(initialClassId ?? classes[0]?.id ?? null)
  const [term, setTerm] = useState<1 | 2 | 3>(1)
  const [threshold, setThreshold] = useState(10)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Assessment | null>(null)
  const [busy, setBusy] = useState(false)
  /**
   * عرض الدفتر الورقي (الافتراضي): كل خانات الدفتر بارزة وتتّسع بلا تمرير أفقي.
   * و«عرض كل الأعمدة» يُظهر أعمدة التقييم التفصيلية إضافة إليها.
   */
  const [paperView, setPaperView] = useState(true)
  const dirty = useRef<Map<string, Set<number>>>(new Map())

  const gradebook = useAsync<GradebookData | null>(
    () => (classId ? window.api.grades.gradebook({ class_id: classId, term, passing_threshold: threshold }) : Promise.resolve(null)),
    [classId, term, threshold, activeYear?.id],
    null
  )

  const continuous = useAsync<ContinuousEntry[]>(
    () => (classId ? window.api.continuous.list({ class_id: classId, term }) : Promise.resolve([])),
    [classId, term, activeYear?.id],
    []
  )

  /** تقييمات الفصل لهذا القسم: كل تقييم = عمود يُدخل فيه الأستاذ مباشرة */
  const assessments = useAsync<Assessment[]>(
    () => (classId ? window.api.assessments.list({ class_id: classId, term }) : Promise.resolve([])),
    [classId, term, activeYear?.id],
    []
  )

  const categories = useAsync<AssessmentCategory[]>(() => window.api.categories.list({}), [activeYear?.id], [])

  useEffect(() => {
    if (!classId && initialClassId) setClassId(initialClassId)
  }, [initialClassId, classId])

  useEffect(() => {
    if (!classId && classes.length > 0) setClassId(classes[0].id)
  }, [classes, classId])

  /**
   * تحميل دفعة الإدخال: التقويم المستمر + علامات كل تقييم.
   * القيم التي يكتبها الأستاذ ولم تُحفظ بعد تبقى كما هي عند إعادة التحميل،
   * فلا يضيع ما يكتبه إن أضاف عموداً في أثناء الكتابة.
   */
  useEffect(() => {
    if (!classId) {
      setDraft({})
      return
    }
    let cancelled = false
    void (async () => {
      const fresh: Record<string, string> = {}
      for (const entry of continuous.data) {
        if (entry.value === null || entry.value === undefined) continue
        fresh[`k:${entry.kind}:${entry.student_id}`] = String(entry.value)
      }
      const list = assessments.data ?? []
      await Promise.all(
        list.map(async (assessment) => {
          try {
            const rows = await window.api.assessments.scores({ assessment_id: assessment.id })
            for (const row of rows) {
              if (row.score?.score === null || row.score?.score === undefined) continue
              fresh[`a:${assessment.id}:${row.student.id}`] = String(row.score.score)
            }
          } catch {
            /* تقييم أُزيل من شاشة أخرى — نترك عموده فارغاً */
          }
        })
      )
      if (cancelled) return
      setDraft((current) => {
        const merged: Record<string, string> = { ...fresh }
        for (const [key, students] of dirty.current) {
          for (const studentId of students) {
            const value = current[`${key}:${studentId}`]
            if (value !== undefined) merged[`${key}:${studentId}`] = value
          }
        }
        return merged
      })
    })()
    return () => {
      cancelled = true
    }
  }, [classId, term, continuous.data, assessments.data])

  const columns = useMemo<EntryColumn[]>(() => {
    const assessmentColumns: EntryColumn[] = (assessments.data ?? []).map((assessment) => ({
      key: `a:${assessment.id}`,
      label: assessment.name,
      hint: assessment.category_name ?? ASSESSMENT_TYPES.find((type) => type.value === assessment.type)?.label ?? '',
      max: assessment.max_score,
      mode: 'assessment',
      type: assessment.type,
      assessmentId: assessment.id,
      editable: true
    }))
    const continuousColumns: EntryColumn[] = CONTINUOUS_INPUT_KINDS.map((kind) => ({
      key: `k:${kind.value}`,
      label: kind.label,
      hint: 'تقويم مستمر',
      max: CONTINUOUS_MAX,
      mode: 'continuous',
      type: kind.value,
      editable: true
    }))
    const simpleColumns: EntryColumn[] = SIMPLE_KINDS.map((simple) => {
      const list = (assessments.data ?? []).filter((item) => simple.fromTypes.includes(item.type))
      // الأنشطة تُحفظ في التقويم المستمر، فلا يشترط وجود تقييم لها
      const fromAssessments = simple.source === 'assessment'
      const single = fromAssessments && list.length === 1 ? list[0] : undefined
      const key = fromAssessments ? (single ? `a:${single.id}` : `s:${simple.type}`) : `k:${simple.type}`
      return {
        key,
        label: simple.label,
        hint:
          list.length > 1
            ? `محسوب من ${list.length} أعمدة`
            : fromAssessments
              ? 'اكتب العلامة هنا مباشرة'
              : 'تُحفظ في الأنشطة',
        max: single?.max_score ?? CONTINUOUS_MAX,
        mode: 'simple',
        type: simple.type,
        assessmentId: single?.id,
        editable: list.length <= 1,
        sourceCount: list.length,
        simple
      }
    })
    return [...assessmentColumns, ...continuousColumns, ...simpleColumns]
  }, [assessments.data])

  /** ترتيب الأعمدة كما يظهر في الجدول: الأعمدة التفصيلية ثم خانات الدفتر الورقي */
  const detailedColumns = useMemo(() => columns.filter((column) => column.mode !== 'simple'), [columns])
  const simpleColumns = useMemo(() => columns.filter((column) => column.mode === 'simple'), [columns])
  const simpleColumn = (type: SimpleKind['type']): EntryColumn | undefined =>
    simpleColumns.find((column) => column.type === type)
  /**
   * الأعمدة المعروضة الآن: في «عرض الدفتر الورقي» تُخفى أعمدة التقييم التفصيلية
   * فتبقى خانات الدفتر (التقويم المستمر، الفرض، النشاطات، الاختبار، المعدل) كلها بارزة
   * بلا حاجة إلى تمرير أفقي.
   */
  const shownDetailed = useMemo(
    () => (paperView ? detailedColumns.filter((column) => column.mode === 'continuous') : detailedColumns),
    [detailedColumns, paperView]
  )
  /** الأعمدة التي ينتقل بينها الأستاذ بالكيبورد — بنفس ترتيب ظهورها */
  const editableColumns = useMemo(
    () => [...shownDetailed, ...simpleColumns].filter((column) => column.editable),
    [shownDetailed, simpleColumns]
  )

  const formulaDescription = useMemo(() => {
    if (!gradebook.data) return ''
    const components = parseFormulaComponents(gradebook.data.formula.components)
    return describeFormula(components, gradebook.data.formula.rounding)
  }, [gradebook.data])

  const valueOf = (key: string, studentId: number): string => draft[`${key}:${studentId}`] ?? ''

  const setValue = (key: string, studentId: number, value: string): void => {
    setDraft((current) => ({ ...current, [`${key}:${studentId}`]: value }))
    const set = dirty.current.get(key) ?? new Set<number>()
    set.add(studentId)
    dirty.current.set(key, set)
  }

  /** تصنيف افتراضي لنوع التقييم إن وُجد (الكراس/المشاركة…) فلا تبقى خانة التصنيف فارغة */
  const categoryFor = (type: string): number | null =>
    (categories.data ?? []).find((item) => item.kind === type)?.id ?? null

  const saveColumn = useCallback(
    async (key: string): Promise<void> => {
      const pending = dirty.current.get(key)
      const column = columns.find((item) => item.key === key)
      if (!pending || pending.size === 0 || !column || !column.editable || !classId || !activeYear) return
      const entries = [...pending].map((studentId) => ({
        student_id: studentId,
        value: parseNumber(valueOf(key, studentId))
      }))
      const invalid = entries.find((entry) => entry.value !== null && (entry.value < 0 || entry.value > column.max))
      if (invalid) {
        toast(`${column.label}: القيمة يجب أن تكون بين 0 و ${column.max}`, 'warning')
        return
      }
      setSavingKey(key)

      const continuousSave = async (): Promise<void> => {
        const result = await run(() =>
          window.api.continuous.save({
            academic_year_id: activeYear.id,
            class_id: classId as number,
            term,
            kind: column.type,
            entries
          })
        )
        setSavingKey(null)
        if (result) {
          dirty.current.set(key, new Set())
          await gradebook.reload()
        }
      }

      /* «معدل النشاطات»: يُحفظ في التقويم المستمر (نوع النشاطات) */
      if (column.mode === 'continuous' || (column.mode === 'simple' && column.simple?.source === 'continuous')) {
        await continuousSave()
        return
      }

      /* «الفرض»/«الاختبار»: يُنشأ التقييم عند أول كتابة فلا ينتظر الأستاذ أي إعداد */
      let assessmentId = column.assessmentId ?? null
      if (assessmentId === null) {
        const classRow = classes.find((row) => row.id === classId)
        const label = column.simple?.label ?? ASSESSMENT_TYPES.find((item) => item.value === column.type)?.label ?? column.label
        const created = await run(() =>
          window.api.assessments.create({
            academic_year_id: activeYear.id,
            class_id: classId as number,
            subject_id: classRow?.subject_id ?? null,
            category_id: categoryFor(column.type),
            name: label,
            type: column.type,
            term,
            date: todayISO(),
            max_score: column.max,
            weight: 1,
            daily_lesson_id: null,
            notes: null
          })
        )
        if (!created) {
          setSavingKey(null)
          return
        }
        assessmentId = created.id
      }

      const result = await run(() =>
        window.api.assessments.saveScores({
          assessment_id: assessmentId as number,
          max_score: column.max,
          entries: entries.map((entry) => ({ student_id: entry.student_id, score: entry.value, note: null }))
        })
      )
      setSavingKey(null)
      if (result) {
        dirty.current.set(key, new Set())
        if (column.mode === 'simple') {
          toast(`حُفظت علامات «${column.label}» — ويمكنك إضافة أعمدة فرض أو اختبار تفصيلية في أي وقت`)
          await assessments.reload()
        }
        await gradebook.reload()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classId, term, activeYear, classes, columns, draft, run, toast, gradebook, assessments]
  )

  const focusCell = (key: string, studentId: number): void => {
    const element = document.getElementById(cellId(key, studentId)) as HTMLInputElement | null
    element?.focus()
    element?.select()
  }

  const handleKey = (event: ReactKeyboardEvent<HTMLInputElement>, key: string, rowIndex: number, colIndex: number): void => {
    const rows = gradebook.data?.rows ?? []
    const moveTo = (nextColumnIndex: number, nextRowIndex: number): void => {
      const column = editableColumns[nextColumnIndex]
      const row = rows[nextRowIndex]
      if (!column || !row) return
      event.preventDefault()
      void saveColumn(key)
      focusCell(column.key, row.student_id)
    }
    if (event.key === 'Enter' || event.key === 'ArrowDown') moveTo(colIndex, rowIndex + 1)
    else if (event.key === 'ArrowUp') moveTo(colIndex, rowIndex - 1)
    else if (event.key === 'Tab') moveTo(colIndex + (event.shiftKey ? -1 : 1), rowIndex)
    else if (event.key === 'ArrowLeft') moveTo(colIndex + 1, rowIndex)
    else if (event.key === 'ArrowRight') moveTo(colIndex - 1, rowIndex)
  }

  /** إضافة عمود تقييم جديد (فرض/اختبار) ليدخل فيه الأستاذ علاماته مباشرة */
  const addAssessment = async (type: 'homework' | 'exam'): Promise<void> => {
    if (!classId || !activeYear) return
    const label = ASSESSMENT_TYPES.find((item) => item.value === type)?.label ?? 'تقييم'
    const count = (assessments.data ?? []).filter((item) => item.type === type).length
    const name = count === 0 ? label : `${label} ${ORDINALS[count] ?? String(count + 1)}`
    const classRow = classes.find((row) => row.id === classId)
    setBusy(true)
    const created = await run(() =>
      window.api.assessments.create({
        academic_year_id: activeYear.id,
        class_id: classId,
        subject_id: classRow?.subject_id ?? null,
        category_id: categoryFor(type),
        name,
        type,
        term,
        date: todayISO(),
        max_score: 20,
        weight: 1,
        daily_lesson_id: null,
        notes: null
      })
    )
    setBusy(false)
    if (created) {
      // نُظهر الأعمدة التفصيلية فوراً حتى يرى الأستاذ العمود الجديد ويبدأ الكتابة فيه
      setPaperView(false)
      toast(`أُضيف العمود «${name}» — أدخل العلامات مباشرة في الجدول`)
      await assessments.reload()
      await gradebook.reload()
    }
  }

  /** خانة قابلة للإدخال (أو معدّل محسوب إذا كانت الخانة تُجمع من عدة تقييمات) */
  const renderColumnCell = (column: EntryColumn, row: ComputedGrade, rowIndex: number): JSX.Element => {
    const tone =
      column.mode === 'assessment'
        ? 'bg-amber-50/40 dark:bg-amber-950/10'
        : column.mode === 'simple'
          ? 'bg-teal-50/50 dark:bg-teal-950/20'
          : undefined
    if (!column.editable) {
      const computed =
        column.type === 'homework' ? row.homework : column.type === 'exam' ? row.exam : row.activities
      return (
        <td key={column.key} className={cn('text-center tabular-nums', tone)}>
          {formatNumber(computed)}
        </td>
      )
    }
    return (
      <td key={column.key} className={cn('p-0.5', tone)}>
        <input
          id={cellId(column.key, row.student_id)}
          className={cn('cell-input', column.mode === 'simple' && 'font-semibold')}
          inputMode="decimal"
          value={valueOf(column.key, row.student_id)}
          placeholder="—"
          onChange={(event) => setValue(column.key, row.student_id, event.target.value)}
          onBlur={() => void saveColumn(column.key)}
          onKeyDown={(event) => handleKey(event, column.key, rowIndex, editableColumns.findIndex((item) => item.key === column.key))}
        />
      </td>
    )
  }

  const renderSimpleCell = (type: SimpleKind['type'], row: ComputedGrade, rowIndex: number): JSX.Element | null => {
    const column = simpleColumn(type)
    if (!column) return null
    return renderColumnCell(column, row, rowIndex)
  }

  if (classes.length === 0) {
    return (
      <div>
        <PageHeader title="دفتر التنقيط" subtitle="إدخال النقاط وحساب المعدلات وفق الصيغة التي يحدّدها الأستاذ" />
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="لا توجد أقسام"
          message="أضف قسماً وتلاميذه أولاً، ثم افتح دفتر التنقيط لإدخال العلامات."
          action={
            <Button variant="primary" onClick={() => navigate('/classes')}>
              إضافة قسم
            </Button>
          }
        />
      </div>
    )
  }

  const rows = gradebook.data?.rows ?? []
  const summary = gradebook.data?.summary
  const homeworkColumns = columns.filter((column) => column.mode === 'assessment' && column.type === 'homework')
  const examColumns = columns.filter((column) => column.mode === 'assessment' && column.type === 'exam')

  return (
    <div>
      <PageHeader
        title="دفتر التنقيط"
        subtitle={`${classes.find((row) => row.id === classId)?.name ?? ''} — ${TERM_LABELS[term]} — كل الخانات الملوّنة تُكتب مباشرة`}
        actions={
          <>
            <Button size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void gradebook.reload()}>
              إعادة حساب المعدلات
            </Button>
            <Button
              size="sm"
              icon={<Printer className="h-4 w-4" />}
              onClick={() => navigate(printLink({ document: 'gradebook', classId, term, threshold }))}
            >
              طباعة دفتر التنقيط
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Save className="h-4 w-4" />}
              onClick={() => {
                for (const column of editableColumns) void saveColumn(column.key)
              }}
            >
              حفظ الكل
            </Button>
          </>
        }
      />

      <div className="card card-pad mb-3 grid gap-3 md:grid-cols-4">
        <Field label="القسم">
          <Select value={classId ?? ''} onChange={(event) => setClassId(Number(event.target.value))}>
            {classes.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="الفصل">
          <Select value={term} onChange={(event) => setTerm(Number(event.target.value) as 1 | 2 | 3)}>
            {[1, 2, 3].map((value) => (
              <option key={value} value={value}>
                {TERM_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="عتبة النجاح (للتقارير فقط)">
          <Input type="number" min={0} max={20} value={threshold} onChange={(event) => setThreshold(Number(event.target.value || 0))} />
        </Field>
        <Field label="صيغة الحساب">
          <Button className="w-full" size="sm" icon={<Calculator className="h-4 w-4" />} onClick={() => navigate('/settings')}>
            تعديل صيغة المعدل
          </Button>
        </Field>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<Plus className="h-4 w-4" />} loading={busy} onClick={() => void addAssessment('homework')}>
          إضافة عمود فرض
        </Button>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} loading={busy} onClick={() => void addAssessment('exam')}>
          إضافة عمود اختبار
        </Button>
        <Button size="sm" variant="ghost" icon={<Calculator className="h-4 w-4" />} onClick={() => navigate('/assessments')}>
          إدارة التقييمات والعلامات القصوى
        </Button>
        <Button
          size="sm"
          variant={paperView ? 'primary' : 'secondary'}
          onClick={() => setPaperView((value) => !value)}
          title="عرض خانات الدفتر الورقي فقط بلا تمرير أفقي"
        >
          {paperView ? 'عرض كل الأعمدة' : 'عرض الدفتر الورقي'}
        </Button>
        <span className="muted text-xs">
          {homeworkColumns.length} فرض، {examColumns.length} اختبار في {TERM_LABELS[term]}.
        </span>
      </div>

      <div className="mb-3 flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 p-3 text-xs text-brand-900 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>اكتب أي علامة أينما شئت:</strong> خانات <strong>«الفرض»</strong> و<strong>«معدل النشاطات»</strong> و
          <strong>«الاختبار»</strong> تُكتب مباشرة، وإن لم يكن هناك تقييم بعد يُنشأ تلقائياً عند أول كتابة. وإذا أضفت أكثر
          من فرض أو اختبار صارت الخانة معدّلاً محسوباً من الأعمدة المفصّلة. أعمدة الكراس والمشاركة والسلوك والوظائف
          تُدخل كذلك، والباقي يُحسب تلقائياً. <br />
          <strong>صيغة الحساب الحالية:</strong> {formulaDescription} — يحدّدها الأستاذ وليست صيغة رسمية مفروضة.
        </span>
      </div>

      {summary && (
        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="التلاميذ" value={summary.students} />
          <StatCard label="متوسط القسم" value={formatNumber(summary.average)} tone="brand" />
          <StatCard label="أعلى علامة" value={formatNumber(summary.highest)} tone="success" />
          <StatCard label="أدنى علامة" value={formatNumber(summary.lowest)} tone="warning" />
          {/* dir=ltr حتى لا يعكس اتجاه العربية ترتيب الرقمين */}
          <StatCard
            label="عند العتبة"
            value={
              <span dir="ltr" className="inline-block">
                {summary.passing} / {summary.counted}
              </span>
            }
            hint={`العتبة ${threshold}`}
            tone="info"
          />
        </div>
      )}

      {gradebook.loading && rows.length === 0 ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="لا يوجد تلاميذ في هذا القسم"
          message="أضف التلاميذ من صفحة «التلاميذ» ثم عُد إلى دفتر التنقيط."
          action={
            <Button variant="primary" onClick={() => navigate('/students')}>
              إضافة تلاميذ
            </Button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="grid text-xs">
            <thead>
              <tr>
                {/* عرض ثابت لعمود الرقم حتى ينطبق العمودان المثبّتان بلا فراغ */}
                <th style={{ width: '3rem', minWidth: '3rem' }} className="sticky right-0 z-20 text-center">الرقم</th>
                <th className="w-44 sticky right-[3rem] z-20 shadow-[1px_0_0_rgb(var(--border))]">
                  {/* min-width على عنصر داخلي: خلايا الجدول التلقائي لا تحترم min-width وحدها */}
                  <span className="block min-w-[8.5rem]">الاسم واللقب</span>
                </th>
                <th className="w-12 min-w-[3.25rem] text-center">الغيابات</th>
                {shownDetailed.map((column) => (
                  <th
                    key={column.key}
                    className={cn(
                      'w-20 text-center',
                      column.mode === 'assessment' ? assessmentTone(column.type) : 'bg-slate-100/80 dark:bg-slate-800/80'
                    )}
                  >
                    <span className="block whitespace-nowrap">{column.label}</span>
                    <span className="block text-[10px] font-normal opacity-75">/{column.max}</span>
                    {savingKey === column.key && <span className="block text-[10px] opacity-70">… حفظ</span>}
                  </th>
                ))}
                <th className="w-20 min-w-[5rem] text-center bg-slate-200/70 dark:bg-slate-700/70">التقويم المستمر</th>
                {SIMPLE_KINDS.map((simple) => {
                  const column = simpleColumn(simple.type)
                  if (!column) return null
                  return (
                    <th
                      key={`head-${simple.type}`}
                      className={cn(
                        'w-20 text-center',
                        column.editable ? 'bg-teal-100 text-teal-900 dark:bg-teal-900/40 dark:text-teal-100' : 'bg-slate-200/70 dark:bg-slate-700/70'
                      )}
                      title={column.hint}
                    >
                      <span className="block whitespace-nowrap">{column.label}</span>
                      <span className="block text-[10px] font-normal opacity-75">
                        /{column.max}
                        {!column.editable ? ' — محسوب' : ''}
                      </span>
                      {savingKey === column.key && <span className="block text-[10px] opacity-70">… حفظ</span>}
                    </th>
                  )
                })}
                <th className="w-20 text-center bg-brand-100 dark:bg-brand-900/50">المعدل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.student_id}>
                  <td style={{ width: '3rem', minWidth: '3rem' }} className="sticky right-0 z-10 bg-[rgb(var(--surface))] text-center tabular-nums">
                    {row.number ?? rowIndex + 1}
                  </td>
                  <td className="sticky right-[3rem] z-10 bg-[rgb(var(--surface))] font-medium shadow-[1px_0_0_rgb(var(--border))]">
                    <span className="block min-w-[8.5rem] truncate" title={row.full_name}>
                      {row.full_name}
                    </span>
                  </td>
                  <td className="text-center tabular-nums">{row.absences}</td>
                  {shownDetailed.map((column) => renderColumnCell(column, row, rowIndex))}
                  <td className="text-center tabular-nums">{formatNumber(row.continuous)}</td>
                  {SIMPLE_KINDS.map((simple) => renderSimpleCell(simple.type, row, rowIndex))}
                  <td className="text-center bg-brand-50/60 dark:bg-brand-950/20">
                    <span
                      className={cn(
                        'inline-block rounded px-1.5 py-0.5 font-bold tabular-nums',
                        row.average === null
                          ? 'text-[rgb(var(--text-muted))]'
                          : row.average < threshold
                            ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                      )}
                    >
                      {formatNumber(row.average)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs muted">
        <Badge>Tab / الأسهم: التنقل بين الخانات</Badge>
        <Badge>Enter أو السهم لأسفل: السطر التالي</Badge>
        <span>تُحفظ القيم تلقائياً عند مغادرة الخانة، وتُحدَّث المعدلات فوراً.</span>
      </div>

      {simpleColumns.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="muted">خانات الدفتر الورقي:</span>
          {simpleColumns.map((column) => (
            <Badge key={`note-${column.type}`} tone={column.editable ? 'info' : 'neutral'}>
              {column.label}: {column.editable ? column.hint : `محسوب من ${column.sourceCount} أعمدة`}
            </Badge>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="حذف عمود التقييم"
        message={`سيتم حذف «${deleteTarget?.name ?? ''}» وكل علاماته (${deleteTarget?.scores_count ?? 0} علامة).`}
        confirmLabel="حذف"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget
          setDeleteTarget(null)
          if (!target) return
          void run(() => window.api.assessments.remove({ id: target.id }), 'تم حذف عمود التقييم').then(async () => {
            await assessments.reload()
            await gradebook.reload()
          })
        }}
      />

      {assessments.data.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="muted">أعمدة التقييم لهذا الفصل:</span>
          {assessments.data.map((assessment) => (
            <span
              key={assessment.id}
              className={cn('badge gap-2 border-transparent', assessmentTone(assessment.type))}
              title={`${assessment.name} — ${TERM_LABELS[assessment.term] ?? ''} — ${assessment.date}`}
            >
              {assessment.name}
              <button
                className="opacity-70 transition hover:opacity-100"
                title="حذف هذا العمود"
                onClick={() => setDeleteTarget(assessment)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          كل علامة تُدخل مرة واحدة وتظهر في مكانها: التقويم المستمر من (الكراس، المشاركة، السلوك، الوظائف)، ومعدل
          النشاطات من الأنشطة، والفرض والاختبار من التقييمات — ثم يُحسب المعدل بالصيغة التي اخترتها ويُطبع في الوثائق.
        </span>
      </div>
    </div>
  )
}
