import { useState } from 'react'
import { KeyRound, Loader2, NotebookPen } from 'lucide-react'
import { Button, Input } from '../components/ui'
import { useApp } from '../store/app'

/**
 * قفل اختياري بالرمز السري.
 * ملاحظة: البيانات في قاعدة SQLite غير مشفّرة، والقفل يحمي الوصول إلى الواجهة فقط.
 */
export default function LockScreen(): JSX.Element {
  const setLocked = useApp((state) => state.setLocked)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    if (pin.length < 4) {
      setError('أدخل رمزاً من 4 إلى 8 أرقام.')
      return
    }
    setBusy(true)
    try {
      const ok = await window.api.pin.verify({ pin })
      if (ok) {
        setLocked(false)
      } else {
        setError('الرمز غير صحيح.')
        setPin('')
      }
    } catch {
      setError('تعذر التحقق من الرمز.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-brand-900 p-6">
      <form
        className="card w-full max-w-sm p-6"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          <div className="rounded-full bg-brand-50 p-3 text-brand-700 dark:bg-slate-800 dark:text-brand-200">
            <NotebookPen className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold">دفتر الأستاذ الرقمي</h1>
          <p className="muted text-sm">أدخل الرمز السري للمتابعة</p>
        </div>
        <label className="label" htmlFor="pin">
          الرمز السري
        </label>
        <Input
          id="pin"
          autoFocus
          type="password"
          inputMode="numeric"
          maxLength={8}
          value={pin}
          onChange={(event) => {
            setPin(event.target.value.replace(/\D/g, ''))
            setError(null)
          }}
          placeholder="••••"
        />
        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <Button type="submit" variant="primary" className="mt-4 w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          فتح الدفتر
        </Button>
      </form>
    </div>
  )
}
