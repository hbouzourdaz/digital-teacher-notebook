import { useState } from 'react'
import { BarChart3, FileText, PenLine, Printer, TrendingUp, UserX, Users } from 'lucide-react'
import type { Assessment, ClassRow, ComputedGrade, DailyLesson, Student } from '@shared/types'
import { PLAN_STATUSES, TERM_LABELS } from '@shared/constants'
import { printLink, type DocumentType } from '@shared/print'
import { formatNumber } from '@shared/utils/misc'
import { useApp } from '../store/app'
import { useAsync } from '../hooks/useAsync'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  PageHeader,
  Select,
  StatCard,
  Tabs,
  type Column
} from '../components/ui'

type ReportKind = 'class' | 'student' | 'attendance' | 'progress' | 'year' | 'assessments'

export default function ReportsPage(): JSX.Element {
  const classes = useApp((state) => state.classes)
  const activeYear = useApp((state) => state.activeYear)
  const navigate = useApp((state) => state.navigate)

  const [kind, setKind] = useState<ReportKind>('class')
  const [classId, setClassId] = useState<number | null>(classes[0]?.id ?? null)
  const [term, setTerm] = useState(1)
  const [threshold, setThreshold] = useState(10)

  const report = useAsync<{
    classRow: ClassRow
    students: Student[]
    stats: Awaited<ReturnType<typeof window.api.classes.stats>>
    lessons: DailyLesson[]
    assessments: Assessment[]
    grades: ComputedGrade[]
  } | null>(
    () => (classId ? window.api.classes.report({ class_id: classId, term }) : Promise.resolve(null)),
    [classId, term, activeYear?.id],
    null
  )

  const attendance = useAsync(
    () => window.api.attendance.summary({ class_id: classId }),
    [classId, activeYear?.id],
    [] as Awaited<ReturnType<typeof window.api.attendance.summary>>
  )

  const yearProgress = useAsync(() => window.api.plan.progress({}), [activeYear?.id], {
    total: 0,
    done: 0,
    inProgress: 0,
    late: 0,
    notStarted: 0
  })

  const openPrint = (document: DocumentType, studentId?: number | null): void => {
    navigate(printLink({ document, classId, term, studentId, threshold }))
  }

  const studentColumns: Array<Column<Student>> = [
    { key: 'number', header: 'الرقم', align: 'center', width: '5rem', render: (row, index) => row.number ?? index + 1 },
    { key: 'name', header: 'الاسم الكامل', sticky: true, render: (row) => row.full_name },
    { key: 'class', header: 'القسم', align: 'center', width: '8rem', render: (row) => row.class_name ?? '' },
    {
      key: 'actions',
      header: '',
      align: 'center',
      width: '6rem',
      render: (row) => (
        <Button size="sm" variant="ghost" onClick={() => navigate(`/students/${row.id}`)}>
          ملف التلميذ
        </Button>
      )
    }
  ]

  const gradeColumns: Array<Column<ComputedGrade>> = [
    { key: 'rank', header: 'الرتبة', align: 'center', width: '5rem', render: (_row, index) => index + 1 },
    { key: 'name', header: 'الاسم الكامل', sticky: true, render: (row) => row.full_name },
    { key: 'continuous', header: 'التقويم المستمر', align: 'center', render: (row) => formatNumber(row.continuous) },
    { key: 'homework', header: 'الفرض', align: 'center', render: (row) => formatNumber(row.homework) },
    { key: 'activities', header: 'معدل النشاطات', align: 'center', render: (row) => formatNumber(row.activities) },
    { key: 'exam', header: 'الاختبار', align: 'center', render: (row) => formatNumber(row.exam) },
    {
      key: 'average',
      header: 'المعدل',
      align: 'center',
      width: '6rem',
      render: (row) => <strong>{formatNumber(row.average)}</strong>
    },
    { key: 'absences', header: 'الغياب', align: 'center', width: '5rem', render: (row) => row.absences }
  ]

  const attendanceColumns: Array<Column<(typeof attendance.data)[number]>> = [
    { key: 'name', header: 'الاسم الكامل', sticky: true, render: (row) => row.full_name },
    { key: 'class', header: 'القسم', align: 'center', width: '8rem', render: (row) => row.class_name ?? '' },
    { key: 'present', header: 'حاضر', align: 'center', width: '6rem', render: (row) => row.present },
    { key: 'absent', header: 'غائب', align: 'center', width: '6rem', render: (row) => row.absent },
    { key: 'late', header: 'متأخر', align: 'center', width: '6rem', render: (row) => row.late },
    { key: 'excused', header: 'معفي', align: 'center', width: '6rem', render: (row) => row.excused }
  ]

  const ranked = [...(report.data?.grades ?? [])].sort((a, b) => (b.average ?? -1) - (a.average ?? -1))
  const stats = report.data?.stats
  const passingWithThreshold = ranked.filter((row) => (row.average ?? -1) >= threshold).length

  return (
    <div>
      <PageHeader
        title="مركز التقارير"
        subtitle="تقارير داخلية يعدّها الأستاذ لعمله الشخصي — معاينة، طباعة، وملف PDF"
        actions={
          <Button size="sm" variant="primary" icon={<Printer className="h-4 w-4" />} onClick={() => openPrint('class-report')}>
            معاينة التقرير
          </Button>
        }
      />

      <Tabs<ReportKind>
        value={kind}
        onChange={setKind}
        tabs={[
          { value: 'class', label: 'تقرير القسم' },
          { value: 'student', label: 'تقرير الطالب' },
          { value: 'attendance', label: 'تقرير الغياب' },
          { value: 'assessments', label: 'تقرير التقييمات' },
          { value: 'progress', label: 'تقرير التقدّم' },
          { value: 'year', label: 'تقرير السنة' }
        ]}
      />

      <div className="card card-pad mb-3 grid gap-3 md:grid-cols-4">
        <Field label="القسم">
          <Select value={classId ?? ''} onChange={(event) => setClassId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">— اختر —</option>
            {classes.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="الفصل">
          <Select value={term} onChange={(event) => setTerm(Number(event.target.value))}>
            {[1, 2, 3].map((value) => (
              <option key={value} value={value}>
                {TERM_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="عتبة النجاح (معيارك الخاص)">
          <Select value={threshold} onChange={(event) => setThreshold(Number(event.target.value))}>
            {[8, 9, 10, 11, 12].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="الطباعة">
          <Button
            className="w-full"
            size="sm"
            icon={<FileText className="h-4 w-4" />}
            onClick={() =>
              openPrint(
                kind === 'attendance'
                  ? 'attendance-log'
                  : kind === 'progress'
                    ? 'annual-plan'
                    : kind === 'year'
                      ? 'teacher-report'
                      : kind === 'student'
                        ? 'class-list'
                        : 'class-report'
              )
            }
          >
            طباعة هذا التقرير
          </Button>
        </Field>
      </div>

      {!classId && (kind === 'class' || kind === 'student' || kind === 'assessments') && (
        <EmptyState icon={<Users className="h-6 w-6" />} title="اختر قسماً لعرض التقرير" />
      )}

      {kind === 'class' && report.data && stats && (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="عدد التلاميذ" value={stats.students_count} icon={<Users className="h-4 w-4" />} />
            <StatCard label="متوسط القسم" value={formatNumber(stats.average)} icon={<BarChart3 className="h-4 w-4" />} />
            <StatCard label="أعلى / أدنى" value={`${formatNumber(stats.highest)} / ${formatNumber(stats.lowest)}`} icon={<TrendingUp className="h-4 w-4" />} />
            <StatCard label={`عند العتبة ${threshold}`} value={`${passingWithThreshold} / ${ranked.length}`} />
          </div>
          <DataTable columns={gradeColumns} rows={ranked} rowKey={(row) => row.student_id} emptyMessage="لا توجد نقاط محسوبة لهذا الفصل." />
        </>
      )}

      {kind === 'student' && report.data && (
        <DataTable columns={studentColumns} rows={report.data.students} rowKey={(row) => row.id} emptyMessage="لا يوجد تلاميذ." />
      )}

      {kind === 'attendance' && (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="مجموع الحضور" value={attendance.data.reduce((sum, row) => sum + row.present, 0)} />
            <StatCard label="مجموع الغياب" value={attendance.data.reduce((sum, row) => sum + row.absent, 0)} icon={<UserX className="h-4 w-4" />} />
            <StatCard label="التأخرات" value={attendance.data.reduce((sum, row) => sum + row.late, 0)} />
            <StatCard label="الإعفاءات" value={attendance.data.reduce((sum, row) => sum + row.excused, 0)} />
          </div>
          <DataTable columns={attendanceColumns} rows={attendance.data} rowKey={(row) => row.student_id} emptyMessage="لا سجل حضور." />
        </>
      )}

      {kind === 'assessments' && report.data && (
        <DataTable
          columns={[
            { key: 'date', header: 'التاريخ', align: 'center', width: '8rem', render: (row) => row.date },
            { key: 'name', header: 'التقييم', sticky: true, render: (row) => row.name },
            { key: 'type', header: 'النوع', align: 'center', width: '8rem', render: (row) => row.type },
            { key: 'term', header: 'الفصل', align: 'center', width: '8rem', render: (row) => TERM_LABELS[row.term] ?? '' },
            { key: 'max', header: 'القصوى', align: 'center', width: '6rem', render: (row) => formatNumber(row.max_score) },
            { key: 'count', header: 'العلامات', align: 'center', width: '7rem', render: (row) => row.scores_count ?? 0 }
          ]}
          rows={report.data.assessments}
          rowKey={(row) => row.id}
          emptyMessage="لا توجد تقييمات لهذا الفصل."
        />
      )}

      {kind === 'progress' && (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="المجموع" value={yearProgress.data.total} icon={<PenLine className="h-4 w-4" />} />
            <StatCard label="منجز" value={yearProgress.data.done} />
            <StatCard label="قيد الإنجاز" value={yearProgress.data.inProgress} />
            <StatCard label="متأخر" value={yearProgress.data.late} />
            <StatCard label="لم يبدأ" value={yearProgress.data.notStarted} />
          </div>
          <div className="card card-pad">
            <p className="text-sm font-semibold">نسبة إنجاز التوزيع السنوي</p>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
              <div
                className="h-full rounded-full bg-brand-600"
                style={{
                  width: `${yearProgress.data.total > 0 ? Math.round((yearProgress.data.done / yearProgress.data.total) * 100) : 0}%`
                }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {PLAN_STATUSES.map((status) => (
                <Badge key={status.value}>{status.label}</Badge>
              ))}
            </div>
          </div>
        </>
      )}

      {kind === 'year' && (
        <div className="card card-pad">
          <div className="section-title">ملخّص السنة الدراسية {activeYear?.label ?? ''}</div>
          {classes.length === 0 ? (
            <p className="muted text-sm">لا توجد أقسام في هذه السنة.</p>
          ) : (
            <DataTable
              columns={[
                { key: 'name', header: 'القسم', sticky: true, render: (row) => row.name },
                { key: 'level', header: 'المستوى', align: 'center', render: (row) => row.level_name ?? '' },
                { key: 'students', header: 'التلاميذ', align: 'center', render: (row) => row.students_count ?? 0 },
                { key: 'boys', header: 'ذكور', align: 'center', width: '6rem', render: (row) => row.boys_count ?? 0 },
                { key: 'girls', header: 'إناث', align: 'center', width: '6rem', render: (row) => row.girls_count ?? 0 }
              ]}
              rows={classes}
              rowKey={(row) => row.id}
            />
          )}
          <p className="muted mt-3 text-xs">
            لطباعة تقرير الأستاذ الكامل للسنة، استعمل مركز الطباعة → «تقرير الأستاذ».
          </p>
        </div>
      )}
    </div>
  )
}
