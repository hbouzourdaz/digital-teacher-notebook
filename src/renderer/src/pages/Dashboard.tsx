import { useMemo, useState } from 'react'
import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  ArrowLeft,
  UserX,
  Users
} from 'lucide-react'
import type { TodaySummary } from '@shared/types'
import { PERIOD_LABELS } from '@shared/constants'
import { arabicDayName, formatArabicDate, todayISO } from '@shared/utils/date'
import { useAsync } from '../hooks/useAsync'
import { useApp } from '../store/app'
import { Badge, Button, EmptyState, ErrorBlock, LoadingBlock, PageHeader, StatCard } from '../components/ui'
import LessonEditor, { type LessonTarget } from '../components/LessonEditor'
import AttendanceDialog from '../components/AttendanceDialog'

export default function DashboardPage(): JSX.Element {
  const navigate = useApp((state) => state.navigate)
  const teacher = useApp((state) => state.teacher)
  const school = useApp((state) => state.school)
  const activeYear = useApp((state) => state.activeYear)
  const [target, setTarget] = useState<LessonTarget | null>(null)
  const [attendanceFor, setAttendanceFor] = useState<{ lessonId: number; className: string } | null>(null)

  const today = todayISO()
  const summary = useAsync<TodaySummary>(
    () => window.api.dashboard.today({ date: today }),
    [today, activeYear?.id],
    {
      date: today,
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

  const grouped = useMemo(() => {
    const morning = summary.data.slots.filter((slot) => slot.period === 'morning')
    const afternoon = summary.data.slots.filter((slot) => slot.period === 'afternoon')
    return [
      { key: 'morning', slots: morning },
      { key: 'afternoon', slots: afternoon }
    ].filter((group) => group.slots.length > 0)
  }, [summary.data.slots])

  const stats = summary.data.stats
  const greeting = new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير'

  return (
    <div>
      <PageHeader
        title={`${greeting}${teacher?.full_name ? ` أستاذ ${teacher.full_name}` : ''}`}
        subtitle={`${arabicDayName(today)} ${formatArabicDate(today)} — ${activeYear?.label ?? 'بدون سنة دراسية'} — ${
          school?.name ?? 'بدون مؤسسة'
        }`}
        actions={
          <>
            <Button icon={<CalendarDays className="h-4 w-4" />} onClick={() => navigate('/schedule')}>
              الجدول الأسبوعي
            </Button>
            <Button variant="primary" icon={<CalendarClock className="h-4 w-4" />} onClick={() => navigate('/today')}>
              صفحة يومي
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="الأقسام" value={stats.classes} icon={<GraduationCap className="h-4 w-4" />} />
        <StatCard label="التلاميذ" value={stats.students} icon={<Users className="h-4 w-4" />} />
        <StatCard label="حصص اليوم" value={stats.today_sessions} icon={<CalendarClock className="h-4 w-4" />} />
        <StatCard label="الدروس المسجّلة" value={stats.recorded_lessons} icon={<BookOpen className="h-4 w-4" />} />
        <StatCard label="التقييمات" value={stats.assessments} icon={<ClipboardList className="h-4 w-4" />} />
        <StatCard label="الغيابات" value={stats.absences} icon={<UserX className="h-4 w-4" />} />
      </div>

      {summary.loading && <LoadingBlock />}
      {summary.error && <ErrorBlock message={summary.error} onRetry={() => void summary.reload()} />}

      {!summary.loading && !summary.error && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="section-title">
              <CalendarClock className="h-4 w-4" /> حصص اليوم
            </div>
            {summary.data.slots.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="h-6 w-6" />}
                title="لا توجد حصص مبرمجة اليوم"
                message="أدخل جدولك الأسبوعي أولاً لتفعيل الحصص الذكية، وستظهر حصص كل يوم تلقائياً في هذه الصفحة."
                action={
                  <Button variant="primary" onClick={() => navigate('/schedule')}>
                    إضافة الجدول الأسبوعي
                  </Button>
                }
              />
            ) : (
              <div className="space-y-4">
                {grouped.map((group) => (
                  <div key={group.key}>
                    <p className="muted mb-2 text-xs font-semibold">{PERIOD_LABELS[group.key]}</p>
                    <ul className="space-y-2">
                      {group.slots.map((slot) => {
                        const isNext = summary.data.nextSlot?.schedule_id === slot.schedule_id
                        const isCurrent = summary.data.currentSlot?.schedule_id === slot.schedule_id
                        return (
                          <li
                            key={`${slot.schedule_id}-${slot.start_time}`}
                            className={`card flex flex-wrap items-center justify-between gap-3 p-3 ${
                              isCurrent ? 'ring-2 ring-emerald-500/60' : isNext ? 'ring-2 ring-brand-500/50' : ''
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="w-24 shrink-0 rounded-md bg-brand-50 px-2 py-1 text-center text-sm font-semibold tabular-nums text-brand-800 dark:bg-slate-800 dark:text-brand-100">
                                {slot.start_time}
                                <span className="block text-[10px] font-normal opacity-80">إلى {slot.end_time}</span>
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-semibold">{slot.class_name}</p>
                                <p className="muted truncate text-xs">
                                  {slot.subject_name ?? 'بدون مادة'} — {slot.session_type}
                                  {slot.room ? ` — قاعة ${slot.room}` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {isCurrent && <Badge tone="success">الآن</Badge>}
                              {isNext && <Badge tone="info">القادمة</Badge>}
                              <Badge tone={slot.recorded ? 'success' : 'warning'}>{slot.recorded ? 'مسجّلة' : 'لم تسجل'}</Badge>
                              <Button
                                variant="primary"
                                size="sm"
                                icon={<ArrowLeft className="h-3.5 w-3.5" />}
                                onClick={() =>
                                  slot.schedule_id && setTarget({ kind: 'slot', scheduleId: slot.schedule_id, date: today })
                                }
                              >
                                فتح الحصة
                              </Button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="card card-pad">
              <div className="section-title">الحصة القادمة</div>
              {summary.data.nextSlot ? (
                <div>
                  <p className="text-lg font-bold tabular-nums">
                    {summary.data.nextSlot.start_time} - {summary.data.nextSlot.end_time}
                  </p>
                  <p className="font-semibold">{summary.data.nextSlot.class_name}</p>
                  <p className="muted text-sm">{summary.data.nextSlot.subject_name ?? ''}</p>
                  <Button
                    className="mt-3 w-full"
                    variant="primary"
                    onClick={() =>
                      summary.data.nextSlot?.schedule_id &&
                      setTarget({ kind: 'slot', scheduleId: summary.data.nextSlot.schedule_id, date: today })
                    }
                  >
                    فتح الحصة
                  </Button>
                </div>
              ) : (
                <p className="muted text-sm">لا توجد حصة قادمة اليوم.</p>
              )}
            </div>

            <div className="card card-pad">
              <div className="section-title">التوزيع السنوي</div>
              <p className="stat-value">
                {stats.annual_plan_done}
                <span className="muted text-sm font-normal"> / {stats.annual_plan_total}</span>
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all"
                  style={{
                    width: `${stats.annual_plan_total > 0 ? Math.round((stats.annual_plan_done / stats.annual_plan_total) * 100) : 0}%`
                  }}
                />
              </div>
              <Button className="mt-3 w-full" size="sm" onClick={() => navigate('/annual-plan')}>
                فتح التوزيع السنوي
              </Button>
            </div>

            <div className="card card-pad">
              <div className="section-title">وصول سريع</div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" onClick={() => navigate('/gradebook')}>
                  دفتر التنقيط
                </Button>
                <Button size="sm" onClick={() => navigate('/attendance')}>
                  الحضور والغياب
                </Button>
                <Button size="sm" onClick={() => navigate('/assessments')}>
                  التقييمات
                </Button>
                <Button size="sm" onClick={() => navigate('/print')}>
                  مركز الطباعة
                </Button>
              </div>
            </div>
          </section>
        </div>
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
