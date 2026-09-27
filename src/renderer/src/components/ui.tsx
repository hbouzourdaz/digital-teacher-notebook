import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, Info, Loader2, X } from 'lucide-react'
import { cn } from '@shared/utils/misc'
import { useApp } from '../store/app'

/* ------------------------------- Button -------------------------------- */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  loading?: boolean
  icon?: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'btn',
        variant === 'primary' && 'btn-primary',
        variant === 'secondary' && 'btn-secondary',
        variant === 'ghost' && 'btn-ghost',
        variant === 'danger' && 'btn-danger',
        size === 'sm' && 'btn-sm',
        className
      )}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

/* -------------------------------- Fields ------------------------------- */
export function Field({
  label,
  error,
  hint,
  required,
  children,
  className
}: {
  label?: string
  error?: string | null
  hint?: string
  required?: boolean
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label className="label">
          {label} {required && <span className="text-red-600 dark:text-red-400">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="muted mt-1 text-xs">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref
) {
  return <input ref={ref} className={cn('input', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref
) {
  return <textarea ref={ref} className={cn('input min-h-[80px] resize-y leading-relaxed', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref
) {
  return (
    <select ref={ref} className={cn('input', className)} {...rest}>
      {children}
    </select>
  )
})

export function Checkbox({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  disabled?: boolean
}): JSX.Element {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2 text-sm', disabled && 'opacity-60')}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-400 accent-brand-700"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}

/* -------------------------------- Modal -------------------------------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md'
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}): JSX.Element | null {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null
  const width = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }[size]

  // لا نغلق النافذة بالنقر خارجها: كثير من النوافذ تحمل إدخالاً غير محفوظ
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-12 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn('card w-full shadow-2xl', width)}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between rounded-t-xl border-b bg-[rgb(var(--surface-muted))] px-4 py-3">
          <h2 id={titleId} className="flex items-center gap-2 text-base">
            <span className="inline-block h-4 w-1 rounded-full bg-brand-600" />
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="إغلاق">
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-4 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel = 'تأكيد',
  danger = false,
  onConfirm,
  onCancel
}: {
  open: boolean
  title: string
  message: string
  detail?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}): JSX.Element | null {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onCancel}>إلغاء</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed">{message}</p>
      {detail && <p className="muted mt-3 whitespace-pre-line rounded-md bg-[rgb(var(--surface-muted))] p-3 text-xs">{detail}</p>}
    </Modal>
  )
}

/* ------------------------------ Feedback ------------------------------- */
export function EmptyState({
  title,
  message,
  action,
  icon
}: {
  title: string
  message?: string
  action?: ReactNode
  icon?: ReactNode
}): JSX.Element {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-[rgb(var(--surface))] px-6 py-12 text-center">
      <div className="rounded-full bg-gradient-to-b from-brand-50 to-brand-100 p-3 text-brand-700 shadow-sm dark:from-brand-900/50 dark:to-brand-900/30 dark:text-brand-100">
        {icon ?? <Info className="h-6 w-6" />}
      </div>
      <h3 className="text-base">{title}</h3>
      {message && <p className="muted max-w-md text-sm leading-relaxed">{message}</p>}
      {action}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return <div className={cn('animate-pulse rounded-md bg-slate-300/60 dark:bg-slate-700/60', className)} />
}

export function LoadingBlock({ label = 'جارٍ التحميل…' }: { label?: string }): JSX.Element {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm muted">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  )
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }): JSX.Element {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" /> تعذر إتمام العملية
      </div>
      <p>{message}</p>
      {onRetry && (
        <Button size="sm" className="mt-3" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      )}
    </div>
  )
}

/* -------------------------------- Badge -------------------------------- */
export function Badge({
  children,
  tone = 'neutral'
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}): JSX.Element {
  const tones = {
    neutral: 'border-slate-300 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
    warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
    danger: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200',
    info: 'border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-900/40 dark:text-brand-100'
  }
  return <span className={cn('badge', tones[tone])}>{children}</span>
}

/* ------------------------------ Stat card ------------------------------ */
type StatTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

const STAT_TONES: Record<StatTone, { accent: string; chip: string; value: string }> = {
  neutral: {
    accent: '#94a3b8',
    chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200',
    value: 'text-[rgb(var(--text))]'
  },
  brand: {
    accent: '#2857a1',
    chip: 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100',
    value: 'text-brand-700 dark:text-brand-100'
  },
  success: {
    accent: '#059669',
    chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
    value: 'text-emerald-700 dark:text-emerald-300'
  },
  warning: {
    accent: '#d97706',
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
    value: 'text-amber-700 dark:text-amber-300'
  },
  danger: {
    accent: '#dc2626',
    chip: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200',
    value: 'text-red-700 dark:text-red-300'
  },
  info: {
    accent: '#0e7490',
    chip: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200',
    value: 'text-cyan-700 dark:text-cyan-300'
  }
}

/** لون تلقائي حسب دلالة المؤشر — يمنح الشاشات ألواناً متناسقة بلا ضبط يدوي لكل بطاقة */
function autoTone(label: string): StatTone {
  if (/(غياب|غيابات|تأخر|متأخر|إعفاء|أدنى)/.test(label)) return 'warning'
  if (/(حضور|أعلى|منجز|نجاح)/.test(label)) return 'success'
  if (/(متوسط|معدل|نسبة|توزيع)/.test(label)) return 'brand'
  if (/(تلميذ|تلاميذ|قسم|أقسام|حصص|حصّة|درس|دروس|تقييم|الاختبار|الفرض)/.test(label)) return 'info'
  return 'neutral'
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone
}: {
  label: string
  value: ReactNode
  hint?: string
  icon?: ReactNode
  tone?: StatTone
}): JSX.Element {
  const palette = STAT_TONES[tone ?? autoTone(label)]
  return (
    <div className="stat-card" style={{ ['--stat-accent' as string]: palette.accent }}>
      <div className="min-w-0">
        <p className="muted truncate text-xs font-semibold">{label}</p>
        <p className={cn('stat-value', palette.value)}>{value}</p>
        {hint && <p className="muted truncate text-xs">{hint}</p>}
      </div>
      {icon && <div className={cn('shrink-0 rounded-lg p-2', palette.chip)}>{icon}</div>}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}): JSX.Element {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b pb-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl">
          <span className="inline-block h-5 w-1.5 rounded-full bg-gradient-to-b from-brand-500 to-brand-700" />
          <span className="truncate">{title}</span>
        </h1>
        {subtitle && <p className="muted mt-1 text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* --------------------------------- Tabs -------------------------------- */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange
}: {
  tabs: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}): JSX.Element {
  return (
    <div role="tablist" className="mb-3 flex flex-wrap gap-1 rounded-xl border bg-[rgb(var(--surface))] p-1 shadow-card">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={value === tab.value}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition',
            value === tab.value
              ? 'bg-gradient-to-b from-brand-600 to-brand-700 text-white shadow-sm'
              : 'text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-muted))] hover:text-[rgb(var(--text))]'
          )}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/* -------------------------------- Toasts ------------------------------- */
export function ToastHost(): JSX.Element {
  const toasts = useApp((state) => state.toasts)
  const dismiss = useApp((state) => state.dismissToast)
  const icons = {
    success: <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
    error: <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
    info: <Info className="h-4 w-4 text-brand-600 dark:text-brand-300" />
  }
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[60] flex w-[min(92vw,26rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="card animate-fade-in pointer-events-auto flex items-start gap-2 border-s-4 px-3 py-2 shadow-xl transition"
          style={{
            borderInlineStartColor: { success: '#059669', error: '#dc2626', warning: '#d97706', info: '#2857a1' }[toast.kind]
          }}
        >
          <span className="mt-0.5">{icons[toast.kind]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{toast.message}</p>
            {toast.detail && <p className="muted mt-0.5 text-xs">{toast.detail}</p>}
          </div>
          <button
            className="muted hover:text-red-600 dark:hover:text-red-400"
            onClick={() => dismiss(toast.id)}
            aria-label="إغلاق"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------ Data table ----------------------------- */
export interface Column<T> {
  key: string
  header: ReactNode
  width?: string
  sticky?: boolean
  align?: 'start' | 'center' | 'end'
  render: (row: T, index: number) => ReactNode
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = 'لا توجد بيانات.',
  selectedKey,
  className,
  compact
}: {
  columns: Array<Column<T>>
  rows: T[]
  rowKey: (row: T, index: number) => string | number
  onRowClick?: (row: T) => void
  emptyMessage?: string
  selectedKey?: string | number | null
  className?: string
  compact?: boolean
}): JSX.Element {
  if (rows.length === 0) {            return (
      <div className="rounded-xl border border-dashed bg-[rgb(var(--surface))] px-4 py-8 text-center text-sm muted">
        {emptyMessage}
      </div>
    )
  }
  return (
    <div className={cn('table-wrap', className)}>
      <table className="grid">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={column.width ? { width: column.width, minWidth: column.width } : undefined}
                className={cn(
                  column.align === 'center' && 'text-center',
                  column.align === 'end' && 'text-end',
                  column.sticky && 'sticky right-0 z-20 bg-[rgb(var(--surface-muted))]'
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const key = rowKey(row, index)
            return (
              <tr
                key={key}
                className={cn(selectedKey === key && 'selected', onRowClick && 'cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      compact && 'py-1',
                      column.align === 'center' && 'text-center',
                      column.align === 'end' && 'text-end',
                      // الظل على يسار العمود المثبّت لأنه في RTL يقع على الحافة اليمنى
                      column.sticky &&
                        'sticky right-0 z-10 bg-[rgb(var(--surface))] shadow-[-1px_0_0_rgb(var(--border))]'
                    )}
                  >
                    {column.render(row, index)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* --------------------------- Focus trap helper ------------------------- */
export function useAutofocus<T extends HTMLElement>(active = true): React.RefObject<T> {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (active) ref.current?.focus()
  }, [active])
  return ref as React.RefObject<T>
}
