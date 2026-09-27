import { Fragment, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarPlus, Copy, Pencil, Printer, Trash2, ClipboardPaste, Save, Plus } from 'lucide-react'
import type { ScheduleSlot } from '@shared/types'
import { PERIOD_LABELS, SCHOOL_DAYS, SESSION_TYPES, TIME_SLOTS } from '@shared/constants'
import { coveredSlotKeys, slotRowSpan } from '@shared/utils/schedule'
import { printLink } from '@shared/print'
import { cn } from '@shared/utils/misc'
import { useAsync } from '../hooks/useAsync'
import { useApp } from '../store/app'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea } from '../components/ui'

interface FormState {
  id: number | null
  day_of_week: number
  start_time: string
  end_time: string
  class_id: number | null
  subject_id: number | null
  session_type: string
  room: string
  notes: string
}

/*
 * ألوان الأقسام — لوحة ثابتة من 8 ألوان متناسقة تُوزَّع على الأقسام بترتيب
 * ثابت حسب معرّفها، فيبقى لون كل قسم واحداً في كل الجدول وبين الجلسات.
 */
const CLASS_COLOR_PALETTE = [
  { name: 'أزرق', chip: 'bg-sky-500', cell: 'border-sky-300 bg-sky-50 hover:border-sky-400 dark:border-sky-700 dark:bg-sky-900/40', title: 'text-sky-900 dark:text-sky-100', sub: 'text-sky-700/80 dark:text-sky-200/80' },
  { name: 'أخضر', chip: 'bg-emerald-500', cell: 'border-emerald-300 bg-emerald-50 hover:border-emerald-400 dark:border-emerald-700 dark:bg-emerald-900/40', title: 'text-emerald-900 dark:text-emerald-100', sub: 'text-emerald-700/80 dark:text-emerald-200/80' },
  { name: 'بنفسجي', chip: 'bg-violet-500', cell: 'border-violet-300 bg-violet-50 hover:border-violet-400 dark:border-violet-700 dark:bg-violet-900/40', title: 'text-violet-900 dark:text-violet-100', sub: 'text-violet-700/80 dark:text-violet-200/80' },
  { name: 'كهرماني', chip: 'bg-amber-500', cell: 'border-amber-300 bg-amber-50 hover:border-amber-400 dark:border-amber-700 dark:bg-amber-900/40', title: 'text-amber-900 dark:text-amber-100', sub: 'text-amber-700/80 dark:text-amber-200/80' },
  { name: 'وردي', chip: 'bg-rose-500', cell: 'border-rose-300 bg-rose-50 hover:border-rose-400 dark:border-rose-700 dark:bg-rose-900/40', title: 'text-rose-900 dark:text-rose-100', sub: 'text-rose-700/80 dark:text-rose-200/80' },
  { name: 'سماوي', chip: 'bg-cyan-500', cell: 'border-cyan-300 bg-cyan-50 hover:border-cyan-400 dark:border-cyan-700 dark:bg-cyan-900/40', title: 'text-cyan-900 dark:text-cyan-100', sub: 'text-cyan-700/80 dark:text-cyan-200/80' },
  { name: 'ليموني', chip: 'bg-lime-500', cell: 'border-lime-300 bg-lime-50 hover:border-lime-400 dark:border-lime-700 dark:bg-lime-900/40', title: 'text-lime-900 dark:text-lime-100', sub: 'text-lime-700/80 dark:text-lime-200/80' },
  { name: 'برتقالي', chip: 'bg-orange-500', cell: 'border-orange-300 bg-orange-50 hover:border-orange-400 dark:border-orange-700 dark:bg-orange-900/40', title: 'text-orange-900 dark:text-orange-100', sub: 'text-orange-700/80 dark:text-orange-200/80' }
] as const

const emptyForm = (day: number, start: string, end: string): FormState => ({
  id: null,
  day_of_week: day,
  start_time: start,
  end_time: end,
  class_id: null,
  subject_id: null,
  session_type: 'درس',
  room: '',
  notes: ''
})

export default function SchedulePage(): JSX.Element {
  const navigate = useApp((state) => state.navigate)
  const classes = useApp((state) => state.classes)
  const subjects = useApp((state) => state.subjects)
  const activeYear = useApp((state) => state.activeYear)
  const run = useApp((state) => state.run)
  const toast = useApp((state) => state.toast)

  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [clipboard, setClipboard] = useState<ScheduleSlot | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; slot: ScheduleSlot } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ScheduleSlot | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)

  const slots = useAsync<ScheduleSlot[]>(() => window.api.schedule.list({}), [activeYear?.id], [])
  const conflicts = useAsync<Array<{ a: ScheduleSlot; b: ScheduleSlot }>>(
    () => window.api.schedule.conflicts({}),
    [activeYear?.id, slots.data.length],
    []
  )

  useEffect(() => {
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  const byCell = useMemo(() => {
    const map = new Map<string, ScheduleSlot[]>()
    for (const slot of slots.data) {
      const key = `${slot.day_of_week}|${slot.start_time}`
      map.set(key, [...(map.get(key) ?? []), slot])
    }
    return map
  }, [slots.data])

  /* مفاتيح الخانات المغطّاة بحصص ساعتين — لا تُعرض لتفادي تكرار الحصة */
  const coveredCells = useMemo(() => {
    const set = new Set<string>()
    for (const slot of slots.data) {
      for (const key of coveredSlotKeys(slot.day_of_week, slot.start_time, slot.end_time)) set.add(key)
    }
    return set
  }, [slots.data])

  /* لون كل قسم: يُوزَّع بترتيب معرّف القسم حتى يبقى ثابتاً بين الجلسات */
  const classColor = useMemo(() => {
    const map = new Map<number, (typeof CLASS_COLOR_PALETTE)[number]>()
    const ordered = [...classes].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    ordered.forEach((cls, index) => map.set(cls.id, CLASS_COLOR_PALETTE[index % CLASS_COLOR_PALETTE.length]))
    return map
  }, [classes])

  const openCreate = (day: number, start: string, end: string): void => setForm(emptyForm(day, start, end))

  const openEdit = (slot: ScheduleSlot): void =>
    setForm({
      id: slot.id,
      day_of_week: slot.day_of_week,
      start_time: slot.start_time,
      end_time: slot.end_time,
      class_id: slot.class_id,
      subject_id: slot.subject_id,
      session_type: slot.session_type,
      room: slot.room ?? '',
      notes: slot.notes ?? ''
    })

  const submit = async (allowConflict = false): Promise<void> => {
    if (!form) return
    if (!form.class_id) {
      toast('اختر القسم أولاً', 'warning')
      return
    }
    if (form.end_time <= form.start_time) {
      toast('وقت النهاية يجب أن يكون بعد وقت البداية', 'warning')
      return
    }
    setSaving(true)
    try {
      const payload = {
        academic_year_id: activeYear?.id ?? 0,
        day_of_week: form.day_of_week,
        start_time: form.start_time,
        end_time: form.end_time,
        class_id: form.class_id,
        subject_id: form.subject_id,
        session_type: form.session_type,
        room: form.room.trim() || null,
        notes: form.notes.trim() || null,
        allowConflict
      }
      if (form.id) {
        await window.api.schedule.update({ ...payload, id: form.id })
      } else {
        await window.api.schedule.create(payload)
      }
      toast('تم حفظ الحصة في الجدول')
      setForm(null)
      await slots.reload()
      await conflicts.reload()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر حفظ الحصة'
      if (message.includes('تعارض')) {
        const confirmed = await window.api.dialogs.confirm({
          title: 'تعارض في الجدول',
          message,
          detail: 'هل تريد حفظ الحصة على أي حال؟',
          confirmLabel: 'حفظ على أي حال'
        })
        if (confirmed) {
          setSaving(false)
          await submit(true)
          return
        }
      } else {
        toast(message, 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const dropOn = async (day: number, start: string, end: string): Promise<void> => {
    if (!dragId) return
    try {
      await window.api.schedule.move({ id: dragId, day_of_week: day, start_time: start, end_time: end })
      toast('تم نقل الحصة')
      await slots.reload()
      await conflicts.reload()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر نقل الحصة'
      if (message.includes('تعارض')) {
        const confirmed = await window.api.dialogs.confirm({
          title: 'تعارض في الجدول',
          message,
          detail: 'هل تريد نقل الحصة على أي حال؟',
          confirmLabel: 'نقل على أي حال'
        })
        if (confirmed) {
          await run(() => window.api.schedule.move({ id: dragId, day_of_week: day, start_time: start, end_time: end, allowConflict: true }))
          await slots.reload()
          await conflicts.reload()
        }
      } else {
        toast(message, 'error')
      }
    } finally {
      setDragId(null)
    }
  }

  const pasteInto = async (day: number, start: string, end: string): Promise<void> => {
    if (!clipboard) return
    await run(
      () =>
        window.api.schedule.update({
          id: clipboard.id,
          academic_year_id: clipboard.academic_year_id,
          day_of_week: day,
          start_time: start,
          end_time: end,
          class_id: clipboard.class_id,
          subject_id: clipboard.subject_id,
          session_type: clipboard.session_type,
          room: clipboard.room,
          notes: clipboard.notes,
          allowConflict: true
        }),
      'تم لصق الحصة'
    )
    await slots.reload()
    await conflicts.reload()
  }

  if (classes.length === 0) {
    return (
      <div>
        <PageHeader title="الجدول الأسبوعي" subtitle="إدخال جدول الأستاذ مرة واحدة واستعماله في كل الوحدات" />
        <EmptyState
          icon={<CalendarPlus className="h-6 w-6" />}
          title="أضف قسمين على الأقل قبل إدخال الجدول"
          message="الجدول يُبنى من الأقسام المسندة إليك. أضف قسمك الأول ثم عد إلى هذه الصفحة."
          action={
            <Button variant="primary" onClick={() => navigate('/classes')}>
              إضافة قسم
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div onContextMenu={(event) => event.preventDefault()}>
      <PageHeader
        title="الجدول الأسبوعي"
        subtitle="اسحب الحصة لتغيير توقيتها — أو انقر على خانة فارغة لإضافة حصة"
        actions={
          <>
            {clipboard && <Badge tone="info">في الحافظة: {clipboard.class_name ?? ''} {clipboard.start_time}</Badge>}
            <Button size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => navigate(printLink({ document: 'timetable' }))}>
              طباعة الجدول
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => openCreate(0, '08:00', '09:00')}
            >
              إضافة حصة
            </Button>
          </>
        }
      />

      {conflicts.data.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">يوجد تعارض في الجدول ({conflicts.data.length})</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {conflicts.data.slice(0, 4).map((conflict, index) => (
                <li key={index}>
                  {SCHOOL_DAYS.find((day) => day.value === conflict.a.day_of_week)?.label}: {conflict.a.start_time} — «
                  {conflict.a.class_name}» و«{conflict.b.class_name}»
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* دليل الألوان — كل قسم بلونه الثابت */}
      {classes.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="muted text-[11px] font-semibold">دليل الألوان:</span>
          {[...classes]
            .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
            .map((cls) => {
              const color = classColor.get(cls.id) ?? CLASS_COLOR_PALETTE[0]
              return (
                <span key={cls.id} className="flex items-center gap-1.5 text-[11px]">
                  <span className={cn('inline-block h-3 w-3 rounded-full', color.chip)} />
                  {cls.name}
                </span>
              )
            })}
        </div>
      )}

      <div className="table-wrap">
        {/* جدول مضغوط: 9 صفوف + رأس — مصمم ليظهر كاملاً في الشاشة دون تمرير عمودي */}
        <table className="grid schedule-compact text-xs">
          <thead>
            <tr>
              <th className="w-20 text-center">التوقيت</th>
              {SCHOOL_DAYS.map((day) => (
                <th key={day.value} className="min-w-[9rem] text-center">
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map((slot, index) => {
              const previousPeriod = index === 0 ? null : TIME_SLOTS[index - 1].period
              const showPeriodRow = slot.period !== previousPeriod
              return (
                  <Fragment key={`row-${slot.start}`}>
                    {showPeriodRow && (
                      <tr>
                      <td
                        colSpan={6}
                        className="border-y bg-brand-50/70 text-center text-[11px] font-bold text-brand-900 dark:bg-slate-700/50 dark:text-brand-100"
                      >
                        {PERIOD_LABELS[slot.period]}
                      </td>
                    </tr>
                  )}
                  <tr key={`${slot.start}-${slot.end}`}>
                    <td className="bg-[rgb(var(--surface-muted))] text-center font-semibold tabular-nums">
                      {slot.start}
                      <span className="block text-[10px] font-normal opacity-70">{slot.end}</span>
                    </td>
                    {SCHOOL_DAYS.map((day) => {
                      const cellKey = `${day.value}|${slot.start}`
                      if (coveredCells.has(cellKey)) return null /* خانة مغطّاة بحصة تمتد ساعتين */
                      const cellSlots = byCell.get(cellKey) ?? []
                      const rowSpan = cellSlots.length > 0
                        ? Math.max(...cellSlots.map((s) => slotRowSpan(s.end_time, s.start_time)))
                        : 1
                      return (
                        <td
                          key={day.value}
                          rowSpan={rowSpan > 1 ? rowSpan : undefined}
                          className="group align-top"
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => void dropOn(day.value, slot.start, slot.end)}
                        >
                          {cellSlots.map((cellSlot) => {
                            const color = classColor.get(cellSlot.class_id) ?? CLASS_COLOR_PALETTE[0]
                            const twoHours = slotRowSpan(cellSlot.end_time, cellSlot.start_time) > 1
                            return (
                            <div
                              key={cellSlot.id}
                              draggable
                              onDragStart={() => setDragId(cellSlot.id)}
                              onContextMenu={(event) => {
                                event.preventDefault()
                                setMenu({ x: event.clientX, y: event.clientY, slot: cellSlot })
                              }}
                              className={cn(
                                'mb-1 cursor-grab rounded-md border px-2 py-1.5 text-[11px] leading-tight transition',
                                color.cell,
                                dragId === cellSlot.id && 'opacity-50',
                                twoHours && 'h-full min-h-[3.4rem]'
                              )}
                            >
                              <p className={cn('font-bold', color.title)}>{cellSlot.class_name}</p>
                              <p className={cn('opacity-90', color.sub)}>{cellSlot.subject_name ?? cellSlot.session_type}</p>
                              {twoHours && <p className="tabular-nums opacity-70">{cellSlot.start_time} — {cellSlot.end_time}</p>}
                              {cellSlot.room && <p className={cn('opacity-75', color.sub)}>قاعة {cellSlot.room}</p>}
                              <div className="mt-1 hidden gap-1 group-hover:flex">
                                <button
                                  className="rounded bg-white/70 p-0.5 hover:bg-white dark:bg-black/30 dark:hover:bg-black/50"
                                  onClick={() => openEdit(cellSlot)}
                                  title="تعديل"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  className="rounded bg-white/70 p-0.5 hover:bg-white dark:bg-black/30 dark:hover:bg-black/50"
                                  onClick={() => {
                                    setClipboard(cellSlot)
                                    toast('تم نسخ الحصة — اختر خانة والصق', 'info')
                                  }}
                                  title="نسخ"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                <button
                                  className="rounded bg-white/70 p-0.5 hover:bg-white dark:bg-black/30 dark:hover:bg-black/50"
                                  onClick={() => setDeleteTarget(cellSlot)}
                                  title="حذف"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                            )
                          })}
                          <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                            <button
                              className="flex-1 rounded border border-dashed py-1 text-[10px] hover:bg-[rgb(var(--surface-muted))]"
                              onClick={() => openCreate(day.value, slot.start, slot.end)}
                            >
                              + إضافة حصة
                            </button>
                            {clipboard && (
                              <button
                                className="rounded border border-dashed px-1 py-1 text-[10px] hover:bg-[rgb(var(--surface-muted))]"
                                title="لصق الحصة"
                                onClick={() => void pasteInto(day.value, slot.start, slot.end)}
                              >
                                <ClipboardPaste className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {menu && (
        <div
          className="card fixed z-50 w-40 p-1 text-sm shadow-lg"
          style={{ right: `${window.innerWidth - menu.x}px`, top: `${menu.y}px` }}
        >
          <button className="w-full rounded px-2 py-1.5 text-right hover:bg-[rgb(var(--surface-muted))]" onClick={() => { openEdit(menu.slot); setMenu(null) }}>
            تعديل الحصة
          </button>
          <button
            className="w-full rounded px-2 py-1.5 text-right hover:bg-[rgb(var(--surface-muted))]"
            onClick={() => {
              setClipboard({ ...menu.slot, start_time: menu.slot.start_time, end_time: menu.slot.end_time })
              toast('تم نسخ الحصة', 'info')
              setMenu(null)
            }}
          >
            نسخ الحصة
          </button>
          <button
            className="w-full rounded px-2 py-1.5 text-right hover:bg-[rgb(var(--surface-muted))]"
            onClick={() => {
              setForm({
                id: null,
                day_of_week: menu.slot.day_of_week,
                start_time: menu.slot.start_time,
                end_time: menu.slot.end_time,
                class_id: menu.slot.class_id,
                subject_id: menu.slot.subject_id,
                session_type: menu.slot.session_type,
                room: menu.slot.room ?? '',
                notes: menu.slot.notes ?? ''
              })
              setMenu(null)
            }}
          >
            تكرار الحصة
          </button>
          <button
            className="w-full rounded px-2 py-1.5 text-right text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            onClick={() => {
              setDeleteTarget(menu.slot)
              setMenu(null)
            }}
          >
            حذف الحصة
          </button>
        </div>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? 'تعديل حصة' : 'إضافة حصة للجدول'}
        footer={
          <>
            <Button onClick={() => setForm(null)}>إلغاء</Button>
            <Button variant="primary" icon={<Save className="h-4 w-4" />} loading={saving} onClick={() => void submit()}>
              حفظ الحصة
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="اليوم" required>
              <Select value={form.day_of_week} onChange={(event) => setForm({ ...form, day_of_week: Number(event.target.value) })}>
                {SCHOOL_DAYS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="القسم" required>
              <Select value={form.class_id ?? ''} onChange={(event) => setForm({ ...form, class_id: Number(event.target.value) })}>
                <option value="">— اختر القسم —</option>
                {classes.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="وقت البداية" required>
              <Select value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })}>
                {TIME_SLOTS.map((slot) => (
                  <option key={slot.start} value={slot.start}>
                    {slot.start}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="وقت النهاية" required>
              <Select
                value={form.end_time}
                onChange={(event) => setForm({ ...form, end_time: event.target.value })}
              >
                {/* كل توقيتات البداية + نهاية اليوم — يسمح بحصص الساعة أو ساعتين */}
                {[...TIME_SLOTS.map((slot) => slot.start), TIME_SLOTS[TIME_SLOTS.length - 1].end]
                  .filter((time) => time > form.start_time)
                  .map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
              </Select>
            </Field>
            <div className="md:col-span-2 flex flex-wrap gap-1.5">
              {[1, 2].map((hours) => {
                const startTime = form.start_time
                const startIndex = TIME_SLOTS.findIndex((s) => s.start === startTime)
                const endSlot = startIndex >= 0 ? TIME_SLOTS[startIndex + hours] : undefined
                const endTime = endSlot?.start ?? (endSlot === undefined && startIndex >= 0 ? TIME_SLOTS[startIndex + hours - 1].end : null)
                if (!endTime) return null
                const active = form.end_time === endTime
                return (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => setForm({ ...form, end_time: endTime })}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition',
                      active
                        ? 'border-brand-500 bg-brand-50 font-semibold text-brand-800 dark:bg-brand-900/40 dark:text-brand-100'
                        : 'border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-muted))]'
                    )}
                  >
                    {hours === 1 ? 'ساعة واحدة' : 'حصة ساعتين'}
                  </button>
                )
              })}
            </div>
            <Field label="المادة">
              <Select value={form.subject_id ?? ''} onChange={(event) => setForm({ ...form, subject_id: event.target.value ? Number(event.target.value) : null })}>
                <option value="">— بدون مادة —</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="نوع الحصة">
              <Select value={form.session_type} onChange={(event) => setForm({ ...form, session_type: event.target.value })}>
                {SESSION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="القاعة">
              <Input value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} placeholder="مثال: مخبر العلوم" />
            </Field>
            <Field label="ملاحظات" className="md:col-span-2">
              <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="حذف الحصة"
        message={`هل تريد حذف حصة «${deleteTarget?.class_name ?? ''}» يوم ${
          SCHOOL_DAYS.find((day) => day.value === deleteTarget?.day_of_week)?.label ?? ''
        } الساعة ${deleteTarget?.start_time ?? ''}؟`}
        detail="الحصص المسجّلة في الدفتر اليومي لن تُحذف، لكنها لن تكون مرتبطة بالجدول."
        confirmLabel="حذف"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget
          setDeleteTarget(null)
          if (!target) return
          void run(() => window.api.schedule.remove({ id: target.id }), 'تم حذف الحصة').then(async () => {
            await slots.reload()
            await conflicts.reload()
          })
        }}
      />
    </div>
  )
}
