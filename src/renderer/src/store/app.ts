import { create } from 'zustand'
import type { AcademicYear, ClassRow, Level, School, Subject, Teacher } from '@shared/types'
import { SETTING_KEYS, UI_SCALE_VALUES, uiScaleOf, type UiScale } from '@shared/constants'
import { humanizeError } from '@shared/utils/misc'

/**
 * حالة التطبيق — الحد الأدنى الضروري فقط.
 * مصدر الحقيقة للبيانات هو SQLite، وهذه الحالة مجرّد ذاكرة عرض.
 */

export interface Toast {
  id: string
  kind: 'success' | 'error' | 'info' | 'warning'
  message: string
  detail?: string
}

export interface AppState {
  booting: boolean
  ready: boolean
  fatalError: string | null
  settings: Record<string, string>
  years: AcademicYear[]
  activeYear: AcademicYear | null
  teacher: Teacher | null
  school: School | null
  subjects: Subject[]
  levels: Level[]
  classes: ClassRow[]
  theme: 'light' | 'dark'
  /** تكبير الواجهة — يضبط حجم الخط الجذري فيتكيف كل التطبيق (بدون تمرير أو أوضح) */
  uiScale: UiScale
  route: string
  setupCompleted: boolean
  locked: boolean
  toasts: Toast[]

  boot: () => Promise<void>
  reloadMaster: () => Promise<void>
  setTheme: (theme: 'light' | 'dark') => Promise<void>
  setUiScale: (scale: UiScale) => Promise<void>
  navigate: (route: string) => void
  toast: (message: string, kind?: Toast['kind'], detail?: string) => void
  run: <T>(task: () => Promise<T>, successMessage?: string) => Promise<T | null>
  dismissToast: (id: string) => void
  refreshClasses: () => Promise<void>
  setLocked: (locked: boolean) => void
}

function applyTheme(theme: 'light' | 'dark'): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
}

/** تكبير الواجهة: نسبة على 16px الجذر — كل مقاسات Tailwind بالـ rem فتتبعها الواجهة كلها */
function applyUiScale(scale: UiScale): void {
  document.documentElement.style.fontSize = `${16 * uiScaleOf(scale)}px`
}

let toastCounter = 0

export const useApp = create<AppState>((set, get) => ({
  booting: true,
  ready: false,
  fatalError: null,
  settings: {},
  years: [],
  activeYear: null,
  teacher: null,
  school: null,
  subjects: [],
  levels: [],
  classes: [],
  theme: 'light',
  uiScale: 'normal',
  route: '/',
  setupCompleted: false,
  locked: false,
  toasts: [],

  async boot() {
    set({ booting: true, fatalError: null })
    try {
      const info = await window.api.app.info()
      const [settings, years, teacher, school, subjects, levels, setup] = await Promise.all([
        window.api.settings.all(),
        window.api.years.list(),
        window.api.teacher.get(),
        window.api.school.get(),
        window.api.subjects.list(),
        window.api.levels.list(),
        window.api.setup.status()
      ])
      const storedTheme = (settings[SETTING_KEYS.theme] as 'light' | 'dark') || 'light'
      applyTheme(storedTheme)
      const storedScale = UI_SCALE_VALUES.includes(settings[SETTING_KEYS.uiScale] as UiScale)
        ? (settings[SETTING_KEYS.uiScale] as UiScale)
        : 'normal'
      applyUiScale(storedScale)
      const activeYear = years.find((year) => year.is_active === 1) ?? years[0] ?? null
      const pinEnabled = await window.api.pin.status()
      set({
        ready: true,
        booting: false,
        settings,
        years,
        teacher,
        school,
        subjects,
        levels,
        activeYear,
        theme: storedTheme,
        uiScale: storedScale,
        route: setup.completed ? '/' : '/setup',
        setupCompleted: setup.completed,
        locked: pinEnabled.enabled,
        fatalError: info ? null : null
      })
      if (activeYear) await get().refreshClasses()
    } catch (error) {
      set({ booting: false, fatalError: humanizeError(error) })
    }
  },

  async reloadMaster() {
    const [settings, years, teacher, school, subjects, levels] = await Promise.all([
      window.api.settings.all(),
      window.api.years.list(),
      window.api.teacher.get(),
      window.api.school.get(),
      window.api.subjects.list(),
      window.api.levels.list()
    ])
    const activeYear = years.find((year) => year.is_active === 1) ?? years[0] ?? null
    set({ settings, years, teacher, school, subjects, levels, activeYear })
    if (activeYear) await get().refreshClasses()
  },

  async refreshClasses() {
    try {
      const classes = await window.api.classes.list({})
      set({ classes })
    } catch {
      set({ classes: [] })
    }
  },

  async setTheme(theme) {
    applyTheme(theme)
    set({ theme, settings: { ...get().settings, [SETTING_KEYS.theme]: theme } })
    await window.api.settings.set({ key: SETTING_KEYS.theme, value: theme })
  },

  async setUiScale(scale) {
    applyUiScale(scale)
    set({ uiScale: scale, settings: { ...get().settings, [SETTING_KEYS.uiScale]: scale } })
    await window.api.settings.set({ key: SETTING_KEYS.uiScale, value: scale })
  },

  navigate(route) {
    set({ route })
  },

  toast(message, kind = 'success', detail) {
    const id = `toast_${++toastCounter}`
    set({ toasts: [...get().toasts, { id, kind, message, detail }] })
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 3800)
  },

  async run(task, successMessage) {
    try {
      const result = await task()
      if (successMessage) get().toast(successMessage)
      return result
    } catch (error) {
      get().toast(humanizeError(error), 'error')
      return null
    }
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((toast) => toast.id !== id) })
  },

  setLocked(locked) {
    set({ locked })
  }
}))
