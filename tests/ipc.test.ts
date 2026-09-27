import { describe, expect, it, vi } from 'vitest'
import { IPC, allChannels, createApi } from '@shared/ipc'

describe('شجرة قنوات IPC', () => {
  const channels = allChannels()

  it('كل قناة تحمل الصيغة namespace:action', () => {
    for (const channel of channels) {
      expect(channel).toMatch(/^[a-z]+:[a-z-]+$/i)
    }
  })

  it('لا توجد قنوات مكررة', () => {
    expect(new Set(channels).size).toBe(channels.length)
  })

  it('تحتوي كل الوحدات المطلوبة', () => {
    for (const namespace of [
      'students',
      'classes',
      'schedule',
      'lessons',
      'attendance',
      'assessments',
      'continuous',
      'formulas',
      'grades',
      'plan',
      'bank',
      'events',
      'notes',
      'attachments',
      'dashboard',
      'print',
      'backup',
      'exports',
      'pin',
      'audit'
    ]) {
      expect(Object.keys(IPC)).toContain(namespace)
    }
  })
})

describe('بناء واجهة الـ renderer', () => {
  it('يبني دالة لكل قناة ويستدعي القناة الصحيحة', async () => {
    const invoke = vi.fn(async () => 'ok')
    const api = createApi(invoke)

    const namespaces = Object.keys(IPC)
    expect(Object.keys(api).sort()).toEqual([...namespaces].sort())

    for (const [namespace, methods] of Object.entries(IPC)) {
      const group = (api as unknown as Record<string, Record<string, (payload?: unknown) => Promise<unknown>>>)[namespace]
      expect(Object.keys(group).sort()).toEqual(Object.keys(methods as Record<string, string>).sort())
    }

    await api.students.list({ class_id: 1 })
    expect(invoke).toHaveBeenCalledWith('students:list', { class_id: 1 })

    await api.app.info()
    expect(invoke).toHaveBeenCalledWith('app:info', undefined)
  })

  it('يمرّر نتيجة الاستدعاء كما هي', async () => {
    const api = createApi(async () => ({ id: 7 }))
    await expect(api.years.list()).resolves.toEqual({ id: 7 })
  })
})
