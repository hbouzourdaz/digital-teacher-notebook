import { useState } from 'react'
import { Archive as ArchiveIcon, ArchiveRestore, KeyRound, Lock, Printer, RefreshCw } from 'lucide-react'
import type { AcademicYear, ClassRow } from '@shared/types'
import { printLink } from '@shared/print'
import { useApp } from '../store/app'
import { useAsync } from '../hooks/useAsync'
import { Badge, Button, DataTable, EmptyState, PageHeader, StatCard, type Column } from '../components/ui'

export default function ArchivePage(): JSX.Element {
  const years = useApp((state) => state.years)
  const activeYear = useApp((state) => state.activeYear)
  const navigate = useApp((state) => state.navigate)
  const run = useApp((state) => state.run)
  const reloadMaster = useApp((state) => state.reloadMaster)

  const [selectedId, setSelectedId] = useState<number | null>(
    years.find((year) => year.is_archived === 1)?.id ?? activeYear?.id ?? years[0]?.id ?? null
  )

  const classes = useAsync<ClassRow[]>(
    () => (selectedId ? window.api.classes.list({ academic_year_id: selectedId }) : Promise.resolve([])),
    [selectedId, years.length],
    []
  )

  const selected = years.find((year) => year.id === selectedId) ?? null
  const readOnly = selected ? selected.is_archived === 1 || selected.is_active === 0 : false
  const totalStudents = classes.data.reduce((sum, row) => sum + (row.students_count ?? 0), 0)

  const columns: Array<Column<ClassRow>> = [
    { key: 'name', header: 'القسم', sticky: true, render: (row) => row.name },
    { key: 'level', header: 'المستوى', align: 'center', width: '10rem', render: (row) => row.level_name ?? '—' },
    { key: 'subject', header: 'المادة', align: 'center', width: '12rem', render: (row) => row.subject_name ?? '—' },
    { key: 'students', header: 'التلاميذ', align: 'center', width: '7rem', render: (row) => row.students_count ?? 0 },
    { key: 'boys', header: 'ذكور', align: 'center', width: '6rem', render: (row) => row.boys_count ?? 0 },
    { key: 'girls', header: 'إناث', align: 'center', width: '6rem', render: (row) => row.girls_count ?? 0 },
    {
      key: 'open',
      header: '',
      align: 'center',
      width: '8rem',
      render: (row) => (
        <Button size="sm" variant="ghost" onClick={() => navigate(`/classes/${row.id}`)}>
          عرض القسم
        </Button>
      )
    }
  ]

  const yearColumns: Array<Column<AcademicYear>> = [
    {
      key: 'label',
      header: 'السنة الدراسية',
      sticky: true,
      render: (row) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{row.label}</span>
          {row.is_active === 1 && <Badge tone="success">الحالية</Badge>}
          {row.is_archived === 1 && <Badge tone="warning">مؤرشفة</Badge>}
        </span>
      )
    },
    { key: 'start', header: 'من', align: 'center', width: '8rem', render: (row) => row.start_date },
    { key: 'end', header: 'إلى', align: 'center', width: '8rem', render: (row) => row.end_date },
    {
      key: 'actions',
      header: 'إجراءات',
      align: 'center',
      width: '22rem',
      render: (row) => (
        <span className="flex flex-wrap justify-center gap-1">
          <Button size="sm" onClick={() => setSelectedId(row.id)}>
            تصفّح
          </Button>
          <Button
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => {
              void run(() => window.api.years.archive({ id: row.id, archived: row.is_archived === 0 }), row.is_archived === 1 ? 'تم إلغاء الأرشفة' : 'تمت الأرشفة (قراءة فقط)').then(
                () => void reloadMaster()
              )
            }}
          >
            {row.is_archived === 1 ? <ArchiveRestore className="h-3.5 w-3.5" /> : <ArchiveIcon className="h-3.5 w-3.5" />}
            {row.is_archived === 1 ? 'إلغاء الأرشفة' : 'أرشفة'}
          </Button>
          {row.is_active === 0 && (
            <Button
              size="sm"
              icon={<KeyRound className="h-3.5 w-3.5" />}
              onClick={() => {
                void window.api.dialogs
                  .confirm({
                    title: 'فتح سنة دراسية للعمل',
                    message: `سيتم تفعيل السنة «${row.label}» لتصبح سنة العمل الحالية.`,
                    detail: 'البيانات محفوظة ولا شيء يُحذف. يمكنك العودة إلى السنة السابقة في أي وقت.',
                    confirmLabel: 'تفعيل'
                  })
                  .then((confirmed) => {
                    if (confirmed) void run(() => window.api.years.activate({ id: row.id }), 'تم تفعيل السنة الدراسية').then(() => void reloadMaster())
                  })
              }}
            >
              تفعيل للعمل
            </Button>
          )}
        </span>
      )
    }
  ]

  return (
    <div>
      <PageHeader
        title="الأرشيف"
        subtitle="فتح سنوات دراسية سابقة، البحث فيها، وطباعة تقاريرها — دون خطر تعديل بيانات قديمة"
        actions={
          <Button size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => navigate(printLink({ document: 'teacher-report' }))}>
            طباعة تقارير السنة
          </Button>
        }
      />

      {years.length === 0 ? (
        <EmptyState
          icon={<ArchiveIcon className="h-6 w-6" />}
          title="لا توجد سنوات دراسية"
          action={
            <Button variant="primary" onClick={() => navigate('/settings')}>
              إضافة سنة دراسية
            </Button>
          }
        />
      ) : (
        <>
          <DataTable columns={yearColumns} rows={years} rowKey={(row) => row.id} className="mb-5" />

          {selected && (
            <>
              {readOnly && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">عرض للقراءة فقط — {selected.label}</p>
                    <p className="text-xs">
                      هذه السنة مؤرشفة أو غير مفعّلة. البيانات معروضة للبحث والطباعة فقط. لتعديلها فعّل السنة من الزر أعلاه.
                    </p>
                  </div>
                </div>
              )}

              <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="السنة" value={selected.label} />
                <StatCard label="الأقسام" value={classes.data.length} />
                <StatCard label="التلاميذ" value={totalStudents} />
                <StatCard
                  label="الحالة"
                  value={selected.is_active === 1 ? 'سنة العمل الحالية' : selected.is_archived === 1 ? 'مؤرشفة' : 'غير مفعّلة'}
                />
              </div>

              <DataTable
                columns={columns}
                rows={classes.data}
                rowKey={(row) => row.id}
                emptyMessage="لا توجد أقسام في هذه السنة."
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
