import { useState } from 'react'
import { CalendarCheck, CalendarDays, Download, Printer, Users } from 'lucide-react'
import type { DailyLesson } from '@shared/types'
import { addDays, formatArabicDate, todayISO } from '@shared/utils/date'
import { printLink } from '@shared/print'
import { useApp } from '../store/app'
import { useAsync } from '../hooks/useAsync'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  StatCard,
  Tabs,
  type Column
} from '../components/ui'
import AttendanceDialog from '../components/AttendanceDialog'

type AttendanceTab = 'summary' | 'log'

export default function AttendancePage(): JSX.Element {
  const classes = useApp((state) => state.classes)
  const activeYear = useApp((state) => state.activeYear)
  const navigate = useApp((state) => state.navigate)
  const run = useApp((state) => state.run)

  const [tab, setTab] = useState<AttendanceTab>('summary')
  const [classId, setClassId] = useState<number | null>(null)
  const [from, setFrom] = useState(addDays(todayISO(), -30))
  const [to, setTo] = useState(todayISO())
  const [date, setDate] = useState(todayISO())
  const [attendanceFor, setAttendanceFor] = useState<{ lessonId: number; className: string } | null>(null)

  const summary = useAsync(
    () => window.api.attendance.summary({ class_id: classId, from, to }),
    [classId, from, to, activeYear?.id],
    [] as Awaited<ReturnType<typeof window.api.attendance.summary>>
  )

  const lessons = useAsync<DailyLesson[]>(
    () => window.api.lessons.list({ date, class_id: classId, limit: 200 }),
    [date, classId, activeYear?.id],
    []
  )

  const log = useAsync(
    () => (classId ? window.api.attendance.forClass({ class_id: classId, from, to }) : Promise.resolve([])),
    [classId, from, to],
    [] as Awaited<ReturnType<typeof window.api.attendance.forClass>>
  )

  const totals = summary.data.reduce(
    (accumulator, row) => ({
      present: accumulator.present + row.present,
      absent: accumulator.absent + row.absent,
      late: accumulator.late + row.late,
      excused: accumulator.excused + row.excused
    }),
    { present: 0, absent: 0, late: 0, excused: 0 }
  )

  const summaryColumns: Array<Column<(typeof summary.data)[number]>> = [
    { key: 'name', header: 'الاسم الكامل', sticky: true, render: (row) => row.full_name },
    { key: 'class', header: 'القسم', align: 'center', width: '8rem', render: (row) => row.class_name ?? '—' },
    { key: 'present', header: 'حاضر', align: 'center', width: '6rem', render: (row) => row.present },
    { key: 'absent', header: 'غائب', align: 'center', width: '6rem', render: (row) => (
      <span className={row.absent > 0 ? 'font-bold text-red-600 dark:text-red-400' : ''}>{row.absent}</span>
    ) },
    { key: 'late', header: 'متأخر', align: 'center', width: '6rem', render: (row) => row.late },
    { key: 'excused', header: 'معفي', align: 'center', width: '6rem', render: (row) => row.excused }
  ]

  const logColumns: Array<Column<(typeof log.data)[number]>> = [
    { key: 'date', header: 'التاريخ', align: 'center', width: '8rem', render: (row) => row.date },
    { key: 'time', header: 'التوقيت', align: 'center', width: '7rem', render: (row) => row.start_time },
    { key: 'student', header: 'معرّف التلميذ', align: 'center', width: '7rem', render: (row) => row.student_id },
    {
      key: 'status',
      header: 'الحالة',
      align: 'center',
      width: '7rem',
      render: (row) => (
        <Badge tone={row.status === 'absent' ? 'danger' : row.status === 'late' ? 'warning' : row.status === 'excused' ? 'info' : 'success'}>
          {row.status === 'absent' ? 'غائب' : row.status === 'late' ? 'متأخر' : row.status === 'excused' ? 'معفي' : 'حاضر'}
        </Badge>
      )
    },
    { key: 'note', header: 'ملاحظة', render: (row) => row.note ?? '' }
  ]

  return (
    <div>
      <PageHeader
        title="الحضور والغياب"
        subtitle="تسجيل سريع: الجميع حاضر افتراضياً — غيّر الغائبين فقط"
        actions={
          <>
            <Button
              size="sm"
              icon={<Download className="h-4 w-4" />}
              onClick={() => void run(() => window.api.exports.data({ kind: 'attendance', format: 'csv', class_id: classId }), 'تم تصدير سجل الغياب')}
            >
              تصدير CSV
            </Button>
            <Button
              size="sm"
              icon={<Printer className="h-4 w-4" />}
              onClick={() => navigate(printLink({ document: 'attendance-log', classId, from, to }))}
            >
              طباعة سجل الغياب
            </Button>
          </>
        }
      />

      <div className="card card-pad mb-3 grid gap-3 md:grid-cols-4">
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
        <Field label="من">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="إلى">
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
        <Field label="تاريخ الحصص">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="مجموع الحضور" value={totals.present} />
        <StatCard label="مجموع الغياب" value={totals.absent} />
        <StatCard label="مجموع التأخر" value={totals.late} />
        <StatCard label="الإعفاءات" value={totals.excused} />
      </div>

      <Tabs<AttendanceTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'summary', label: 'ملخّص التلاميذ' },
          { value: 'log', label: 'سجل الغياب التفصيلي' }
        ]}
      />

      {tab === 'summary' && (
        <DataTable columns={summaryColumns} rows={summary.data} rowKey={(row) => row.student_id} emptyMessage="لا يوجد سجل حضور في هذه الفترة." />
      )}

      {tab === 'log' && (
        <>
          {!classId && <p className="muted mb-2 text-sm">اختر قسماً لعرض السجل التفصيلي.</p>}
          <DataTable columns={logColumns} rows={log.data} rowKey={(row) => row.id} emptyMessage="لا يوجد سجل." />
        </>
      )}

      <section className="mt-6">
        <div className="section-title">
          <CalendarCheck className="h-4 w-4" /> حصص {formatArabicDate(date)}
        </div>
        {lessons.data.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-6 w-6" />}
            title="لا توجد حصص مسجّلة في هذا التاريخ"
            message="افتح القسم من صفحة «يومي» ثم سجّل الحصة لتتمكن من تسجيل الحضور."
            action={
              <Button variant="primary" onClick={() => navigate('/today')}>
                فتح حصص اليوم
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {lessons.data.map((lesson) => (
              <li key={lesson.id} className="card flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-3">
                  <span className="w-24 rounded-md bg-brand-50 px-2 py-1 text-center text-sm font-semibold tabular-nums text-brand-800 dark:bg-slate-800 dark:text-brand-100">
                    {lesson.start_time}
                    <span className="block text-[10px] font-normal opacity-80">إلى {lesson.end_time}</span>
                  </span>
                  <div>
                    <p className="font-semibold">{lesson.class_name ?? ''}</p>
                    <p className="muted text-xs">{lesson.title || 'بدون عنوان'}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Users className="h-3.5 w-3.5" />}
                  onClick={() => setAttendanceFor({ lessonId: lesson.id, className: lesson.class_name ?? '' })}
                >
                  تسجيل الحضور
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AttendanceDialog
        open={attendanceFor !== null}
        lessonId={attendanceFor?.lessonId ?? null}
        className={attendanceFor?.className}
        onClose={() => setAttendanceFor(null)}
        onSaved={() => {
          void summary.reload()
          void log.reload()
        }}
      />
    </div>
  )
}
