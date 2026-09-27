import { useCallback, useEffect, useRef, useState } from 'react'
import { humanizeError } from '@shared/utils/misc'

export interface AsyncState<T> {
  data: T
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  setData: (updater: T | ((current: T) => T)) => void
}

/**
 * تحميل بيانات من الـ IPC مع إعادة تحميل يدوية.
 * لا يستدعي الشبكة — كل شيء من قاعدة البيانات المحلية.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[], initial: T, enabled = true): AsyncState<T> {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const result = await loaderRef.current()
      if (mounted.current) {
        setData(result)
        setError(null)
      }
    } catch (err) {
      if (mounted.current) setError(humanizeError(err))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, reload, setData }
}
