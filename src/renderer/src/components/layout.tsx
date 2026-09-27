import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Archive,
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Clock,
  Database,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Moon,
  NotebookPen,
  PenLine,
  Printer,
  Search,
  Settings as SettingsIcon,
  Sun,
  Users,
  CalendarCheck,
  ListChecks,
  CircleUser
} from 'lucide-react'
import { cn } from '@shared/utils/misc'
import { UI_SCALES, type UiScale } from '@shared/constants'
import { useApp } from '../store/app'
import { Badge, Button, Input, Modal } from './ui'
import type { SearchResult } from '@shared/types'

export interface NavItem {
  path: string
  label: string
  icon: ReactNode
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

/** الوحدات مجمّعة على شكل دورة العمل اليومية للأستاذ */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'المتابعة اليومية',
    items: [
      { path: '/', label: 'الرئيسية', icon: <LayoutDashboard className="h-4 w-4" /> },
      { path: '/today', label: 'يومي', icon: <Clock className="h-4 w-4" /> },
      { path: '/schedule', label: 'الجدول الأسبوعي', icon: <CalendarDays className="h-4 w-4" /> },
      { path: '/notebook', label: 'الدفتر اليومي', icon: <NotebookPen className="h-4 w-4" /> }
    ]
  },
  {
    title: 'الأقسام والتلاميذ',
    items: [
      { path: '/classes', label: 'الأقسام', icon: <GraduationCap className="h-4 w-4" /> },
      { path: '/students', label: 'التلاميذ', icon: <Users className="h-4 w-4" /> },
      { path: '/attendance', label: 'الحضور', icon: <CalendarCheck className="h-4 w-4" /> }
    ]
  },
  {
    title: 'التقويم والتنقيط',
    items: [
      { path: '/gradebook', label: 'دفتر التنقيط', icon: <ClipboardList className="h-4 w-4" /> },
      { path: '/assessments', label: 'التقييمات', icon: <ListChecks className="h-4 w-4" /> }
    ]
  },
  {
    title: 'التخطيط والتقارير',
    items: [
      { path: '/annual-plan', label: 'التوزيع السنوي', icon: <BarChart3 className="h-4 w-4" /> },
      { path: '/lesson-bank', label: 'بنك الدروس', icon: <BookOpen className="h-4 w-4" /> },
      { path: '/events', label: 'الفروض والاختبارات', icon: <FileText className="h-4 w-4" /> },
      { path: '/reports', label: 'التقارير', icon: <PenLine className="h-4 w-4" /> }
    ]
  },
  {
    title: 'النظام',
    items: [
      { path: '/print', label: 'الطباعة', icon: <Printer className="h-4 w-4" /> },
      { path: '/archive', label: 'الأرشيف', icon: <Archive className="h-4 w-4" /> },
      { path: '/backup', label: 'النسخ الاحتياطي', icon: <Database className="h-4 w-4" /> },
      { path: '/settings', label: 'الإعدادات', icon: <SettingsIcon className="h-4 w-4" /> }
    ]
  }
]

/** قائمة مسطّحة بنفس الترتيب — تُستعمل في البحث والتنقل السريع */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)

export function isActivePath(current: string, path: string): boolean {
  if (path === '/') return current === '/'
  return current === path || current.startsWith(`${path}/`)
}

export function Sidebar({ onCommand }: { onCommand: () => void }): JSX.Element {
  const route = useApp((state) => state.route)
  const navigate = useApp((state) => state.navigate)
  const activeYear = useApp((state) => state.activeYear)
  const teacher = useApp((state) => state.teacher)

  return (
    <aside className="sidebar flex h-full w-64 shrink-0 flex-col text-slate-100">
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3.5">
        <div className="rounded-lg bg-gradient-to-br from-brand-400/40 to-brand-700/40 p-2 ring-1 ring-white/15">
          <NotebookPen className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold">دفتر الأستاذ الرقمي</p>
          <p className="truncate text-[11px] text-slate-300">{activeYear?.label ?? 'بدون سنة دراسية'}</p>
        </div>
      </div>

      <div className="px-3 py-2">
        <button
          className="flex w-full items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/15"
          onClick={onCommand}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-right">بحث شامل…</span>
          <kbd className="rounded bg-black/25 px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mt-3">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400/80">{group.title}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.path}>
                  <button
                    className={cn('sidebar-link w-full', isActivePath(route, item.path) ? 'sidebar-link-active' : 'sidebar-link-idle')}
                    onClick={() => navigate(item.path)}
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-4 py-3 text-[11px] text-slate-300">
        <p className="flex items-center gap-1.5">
          <CircleUser className="h-3.5 w-3.5" />
          {teacher?.full_name ?? 'لم تُدخل بيانات الأستاذ'}
        </p>
        <p className="mt-1 opacity-80">يعمل دون إنترنت — البيانات محلية</p>
      </div>
    </aside>
  )
}

export function Topbar({ onCommand }: { onCommand: () => void }): JSX.Element {
  const { theme, setTheme, activeYear, school, years, navigate } = useApp()
  const uiScale = useApp((state) => state.uiScale)
  const setUiScale = useApp((state) => state.setUiScale)
  const [clock, setClock] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const dayLabel = useMemo(() => {
    const names = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
    return names[clock.getDay()]
  }, [clock])

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-[rgb(var(--surface))]/90 px-4 backdrop-blur shadow-[0_1px_0_0_rgb(var(--border))]">
      <div className="flex min-w-0 items-center gap-3">
        <p className="truncate text-sm font-bold">{school?.name ?? 'لم تُدخل بيانات المؤسسة'}</p>
        {activeYear && (
          <button onClick={() => navigate('/settings')} title="السنة الدراسية">
            <Badge tone="info">
              {activeYear.label}
              {activeYear.is_archived ? ' — مؤرشفة (قراءة فقط)' : ''}
            </Badge>
          </button>
        )}
        {years.length === 0 && (
          <Button size="sm" variant="primary" onClick={() => navigate('/settings')}>
            إضافة سنة دراسية
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="muted hidden text-xs md:block">
          {dayLabel}{' '}
          {clock.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </span>
        {/* تكبير سريع للواجهة: كل شيء أكبر وأوضح أو الأكثر محتوى دون تمرير */}
        <div
          className="hidden items-center overflow-hidden rounded-lg border border-[rgb(var(--border-strong))] md:flex"
          title="تكبير الواجهة — كل العناصر تتكيف تلقائياً"
        >
          {UI_SCALES.map((item) => (
            <button
              key={item.value}
              onClick={() => void setUiScale(item.value as UiScale)}
              title={item.label}
              className={cn(
                'px-2.5 py-1.5 text-xs font-bold transition',
                uiScale === item.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-transparent text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-muted))]',
                item.value === 'compact' ? 'text-[11px]' : item.value === 'large' ? 'text-sm' : 'text-xs'
              )}
            >
              {item.value === 'compact' ? 'أصغر' : item.value === 'large' ? 'أكبر' : 'عادي'}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={onCommand} title="بحث شامل (Ctrl+K)">
          <Search className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          title={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
          onClick={() => void setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  )
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useApp((state) => state.navigate)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      return
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const term = query.trim()
    if (term.length === 0) {
      setResults([])
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const found = await window.api.search.global({ query: term })
        if (!cancelled) setResults(found)
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, open])

  const openResult = (result: SearchResult): void => {
    navigate(result.route)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="البحث الشامل" size="md">
      <Input
        autoFocus
        placeholder="ابحث عن تلميذ، قسم، درس، تقييم، حدث…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && results[0]) openResult(results[0])
        }}
      />
      <div className="scroll-y mt-3 max-h-72 space-y-1">
        {loading && <p className="muted p-3 text-sm">جارٍ البحث…</p>}
        {!loading && query.trim() && results.length === 0 && (
          <p className="muted p-3 text-sm">لا توجد نتائج مطابقة.</p>
        )}
        {results.map((result) => (
          <button
            key={`${result.kind}-${result.id}-${result.route}`}
            className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-right hover:bg-[rgb(var(--surface-muted))]"
            onClick={() => openResult(result)}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{result.label}</span>
              <span className="muted block truncate text-xs">{result.sub}</span>
            </span>
            <Badge>{result.kind}</Badge>
          </button>
        ))}
      </div>
    </Modal>
  )
}

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const [commandOpen, setCommandOpen] = useState(false)

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex h-full">
      <Sidebar onCommand={() => setCommandOpen(true)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onCommand={() => setCommandOpen(true)} />
        {/* الصفحة هي منطقة التمرير الوحيدة: لا شريط أفقي على هيكل التطبيق */}
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-behavior-contain p-4 lg:p-6">
          {children}
        </main>
      </div>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  )
}
