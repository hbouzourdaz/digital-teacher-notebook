import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, NotebookPen, RefreshCw } from 'lucide-react'
import { useApp } from './store/app'
import { parseRoute, type ParsedRoute } from './router'
import { AppShell } from './components/layout'
import { Button, ToastHost } from './components/ui'
import DashboardPage from './pages/Dashboard'
import TodayPage from './pages/Today'
import SchedulePage from './pages/Schedule'
import NotebookPage from './pages/Notebook'
import ClassesPage from './pages/Classes'
import StudentsPage from './pages/Students'
import AttendancePage from './pages/Attendance'
import GradebookPage from './pages/Gradebook'
import AssessmentsPage from './pages/Assessments'
import AnnualPlanPage from './pages/AnnualPlan'
import LessonBankPage from './pages/LessonBank'
import EventsPage from './pages/Events'
import ReportsPage from './pages/Reports'
import PrintCenterPage from './pages/PrintCenter'
import ArchivePage from './pages/Archive'
import BackupPage from './pages/Backup'
import SettingsPage from './pages/Settings'
import SetupPage from './pages/Setup'
import LockScreen from './pages/Lock'

export default function App(): JSX.Element {
  const booting = useApp((state) => state.booting)
  const ready = useApp((state) => state.ready)
  const fatalError = useApp((state) => state.fatalError)
  const setupCompleted = useApp((state) => state.setupCompleted)
  const locked = useApp((state) => state.locked)
  const route = useApp((state) => state.route)
  const boot = useApp((state) => state.boot)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    void boot()
  }, [boot])

  useEffect(() => {
    return window.notebookEvents.onReload(() => {
      void boot()
    })
  }, [boot])

  const parsed = useMemo<ParsedRoute>(() => parseRoute(route), [route])

  if (booting) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div className="rounded-full bg-brand-50 p-4 text-brand-700 dark:bg-slate-800 dark:text-brand-200">
          <NotebookPen className="h-7 w-7" />
        </div>
        <p className="flex items-center gap-2 text-sm muted">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تجهيز دفتر الأستاذ…
        </p>
      </div>
    )
  }

  if (fatalError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="card max-w-lg p-6 text-center">
          <div className="mx-auto mb-3 w-fit rounded-full bg-red-50 p-3 text-red-600 dark:bg-red-950/40">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold">تعذر تشغيل قاعدة البيانات</h1>
          <p className="muted mt-2 text-sm leading-relaxed">{fatalError}</p>
          <p className="muted mt-2 text-xs">
            لم يتم حذف أي بيانات. جرّب استعادة نسخة احتياطية من مجلد النسخ الاحتياطي، ثم أعد تشغيل التطبيق.
          </p>
          <Button
            variant="primary"
            className="mt-4"
            icon={<RefreshCw className="h-4 w-4" />}
            loading={retrying}
            onClick={() => {
              setRetrying(true)
              void boot().finally(() => setRetrying(false))
            }}
          >
            إعادة المحاولة
          </Button>
        </div>
      </div>
    )
  }

  if (!ready) return <div className="h-full" />

  if (!setupCompleted || parsed.path === '/setup') {
    return (
      <>
        <SetupPage />
        <ToastHost />
      </>
    )
  }

  if (locked) {
    return (
      <>
        <LockScreen />
        <ToastHost />
      </>
    )
  }

  return (
    <>
      <AppShell>{renderRoute(parsed)}</AppShell>
      <ToastHost />
    </>
  )
}

function renderRoute(parsed: ParsedRoute): JSX.Element {
  const { path, id, query } = parsed
  if (path === '/today') return <TodayPage />
  if (path === '/schedule') return <SchedulePage />
  if (path === '/notebook') return <NotebookPage initialLessonId={query.lesson ? Number(query.lesson) : null} />
  if (path.startsWith('/classes')) return <ClassesPage classId={id} />
  if (path.startsWith('/students')) return <StudentsPage studentId={id} />
  if (path === '/attendance') return <AttendancePage />
  if (path === '/gradebook') return <GradebookPage initialClassId={query.class ? Number(query.class) : null} />
  if (path === '/assessments') return <AssessmentsPage initialAssessmentId={query.assessment ? Number(query.assessment) : null} />
  if (path === '/annual-plan') return <AnnualPlanPage />
  if (path === '/lesson-bank') return <LessonBankPage />
  if (path === '/events') return <EventsPage />
  if (path === '/reports') return <ReportsPage />
  if (path === '/print') return <PrintCenterPage />
  if (path === '/archive') return <ArchivePage />
  if (path === '/backup') return <BackupPage />
  if (path === '/settings') return <SettingsPage />
  return <DashboardPage />
}
