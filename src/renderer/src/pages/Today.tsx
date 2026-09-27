import { useState } from 'react'
import { CalendarCheck, CalendarDays, ClipboardList, GraduationCap, NotebookPen, Printer } from 'lucide-react'
import type { TodaySummary } from '@shared/types'
import { formatArabicDate, todayISO, addDays } from '@shared/utils/date'
import { printLink } from '@shared/print'
import { useAsync } from '../hooks/useAsync'
import { useApp } from '../store/app'
import { Badge, Button, EmptyState, ErrorBlock, Input, LoadingBlock, PageHeader } from '../components/ui'
import LessonEditor, { type LessonTarget } from '../components/LessonEditor'
import AttendanceDialog from '../components/AttendanceDialog'

export default function TodayPage(): JSX.Element {
  const navigate = useApp((state) => state.navigate)
  const activeYear = useApp((state) => state.activeYear)
  const [date, setDate] = useState(todayISO())
  const [target, setTarget] = useState<LessonTarget | null>(null)
  const [attendanceFor, setAttendanceFor] = useState<{ lessonId: number; className: string; classId: number } | null>(null)

  const summary = useAsync<TodaySummary>(
    () => window.api.dashboard.today({ date }),
    [date, activeYear?.id],
    {
      date,
      dayOfWeek: 0,
      dayLabel: '',
      slots: [],
      nextSlot: null,
      currentSlot: null,
      stats: {
        classes: 0,
        students: 0,
        today_sessions: 0,
        recorded_lessons: 0,
        assessments: 0,
        absences: 0,
        annual_plan_total: 0,
        annual_plan_done: 0
      }
    }
  )

  const openAttendance = async (scheduleId: number, className: string, classId: number): Promise<void> => {
    try {
      const lesson = await window.api.lessons.ensureForSlot({
        academic_year_id: activeYear?.id ?? 0,
        schedule_id: scheduleId,
        date
      })
      setAttendanceFor({ lessonId: lesson.id, className, classId })
    } catch (error) {
      useApp.getState().toast(error instanceof Error ? error.message : 'تعذر فتح الحضور', 'error')
    }
  }

  const openGradebook = (classId: number): void => {
    navigate(`/gradebook?class=${classId}`)
  }

  return (
    <div>
      <PageHeader
        title="يومي"
        subtitle={`${summary.data.dayLabel} ${formatArabicDate(date)} — ${summary.data.slots.length} حصة`}
        actions={
          <>
            <Input
              type="date"
              className="w-40"
              value={date}
              onChange={(event) => setDate(event.target.value || todayISO())}
            />
            <Button size="sm" onClick={() => setDate(addDays(date, -1))}>
              اليوم السابق
            </Button>
            <Button size="sm" onClick={() => setDate(todayISO())}>
              اليوم
            </Button>
            <Button size="sm" onClick={() => setDate(addDays(date, 1))}>
              اليوم التالي
            </Button>
          </>
        }
      />

      {summary.loading && <LoadingBlock />}
      {summary.error && <ErrorBlock message={summary.error} onRetry={() => void summary.reload()} />}

      {!summary.loading && !summary.error && summary.data.slots.length === 0 && (
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title="لا توجد حصص في هذا اليوم"
          message="أدخل جدولك الأسبوعي أولاً لتظهر حصصك تلقائياً في هذه الصفحة."
          action={
            <Button variant="primary" onClick={() => navigate('/schedule')}>
              إضافة الجدول الأسبوعي
            </Button>
          }
        />
      )}

      {summary.data.slots.length > 0 && (
        <ol className="relative space-y-3 border-r-2 border-brand-100 pr-4 dark:border-slate-700">
          {summary.data.slots.map((slot) => {
            const isCurrent = summary.data.currentSlot?.schedule_id === slot.schedule_id
            const isNext = summary.data.nextSlot?.schedule_id === slot.schedule_id
            return (
              <li key={`${slot.schedule_id}-${slot.start_time}`} className="relative">
                <span
                  className={`absolute -right-[1.42rem] top-4 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 ${
                    slot.recorded ? 'bg-emerald-500' : isCurrent ? 'bg-amber-500' : 'bg-slate-300'
                  }`}
                />
                <div className={`card p-3 ${isCurrent ? 'ring-2 ring-emerald-500/50' : isNext ? 'ring-2 ring-brand-500/40' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-20 rounded-md bg-brand-50 px-2 py-1 text-center text-sm font-bold tabular-nums text-brand-800 dark:bg-slate-800 dark:text-brand-100">
                        {slot.start_time}
                        <span className="block text-[10px] font-normal opacity-80">{slot.end_time}</span>
                      </div>
                      <div>
                        <p className="font-semibold">{slot.class_name}</p>
                        <p className="muted text-xs">
                          {slot.subject_name ?? 'بدون مادة'} — {slot.session_type}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={slot.recorded ? 'success' : 'warning'}>{slot.recorded ? 'مسجّلة' : 'لم تسجل'}</Badge>
                      {slot.attendance_taken && <Badge tone="info">الحضور مُسجّل</Badge>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<NotebookPen className="h-3.5 w-3.5" />}
                      onClick={() => slot.schedule_id && setTarget({ kind: 'slot', scheduleId: slot.schedule_id, date })}
                    >
                      تسجيل الحصة
                    </Button>
                    <Button
                      size="sm"
                      icon={<CalendarCheck className="h-3.5 w-3.5" />}
                      onClick={() =>
                        slot.schedule_id &&
                        slot.class_id &&
                        void openAttendance(slot.schedule_id, slot.class_name, slot.class_id)
                      }
                    >
                      الحضور
                    </Button>
                    <Button size="sm" icon={<ClipboardList className="h-3.5 w-3.5" />} onClick={() => slot.class_id && openGradebook(slot.class_id)}>
                      التنقيط
                    </Button>
                    <Button size="sm" icon={<GraduationCap className="h-3.5 w-3.5" />} onClick={() => slot.class_id && navigate(`/classes/${slot.class_id}`)}>
                      فتح القسم
                    </Button>
                    <Button
                      size="sm"
                      icon={<Printer className="h-3.5 w-3.5" />}
                      onClick={() =>
                        navigate(printLink({ document: 'daily-notebook', classId: slot.class_id, date }))
                      }
                    >
                      طباعة
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <LessonEditor open={target !== null} target={target} onClose={() => setTarget(null)} onSaved={() => void summary.reload()} />
      <AttendanceDialog
        open={attendanceFor !== null}
        lessonId={attendanceFor?.lessonId ?? null}
        className={attendanceFor?.className}
        onClose={() => setAttendanceFor(null)}
        onSaved={() => void summary.reload()}
      />
    </div>
  )
}
