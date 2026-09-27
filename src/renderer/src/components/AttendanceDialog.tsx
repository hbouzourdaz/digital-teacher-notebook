import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Users } from 'lucide-react'
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@shared/constants'
import type { Student } from '@shared/types'
import { cn, initials } from '@shared/utils/misc'
import { Badge, Button, LoadingBlock, Modal } from './ui'
import { useApp } from '../store/app'

interface Row {
  student: Student
  status: AttendanceStatus
  note: string | null
}

export default function AttendanceDialog({
  open,
  onClose,
  lessonId,
  className,
  onSaved
}: {
  open: boolean
  onClose: () => void
  lessonId: number | null
  className?: string
  onSaved?: () => void
}): JSX.Element | null {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useApp((state) => state.toast)
  const run = useApp((state) => state.run)

  useEffect(() => {
    if (!open || !lessonId) return
    setLoading(true)
    window.api.attendance
      .forLesson({ daily_lesson_id: lessonId })
      .then((data) => {
        setRows(data.map((item) => ({ student: item.student, status: item.status as AttendanceStatus, note: item.note })))
      })
      .catch((error: unknown) => toast(error instanceof Error ? error.message : 'تعذر تحميل قائمة التلاميذ', 'error'))
      .finally(() => setLoading(false))
  }, [open, lessonId, toast])

  const counts = useMemo(() => {
    const tally = { present: 0, absent: 0, late: 0, excused: 0 }
    for (const row of rows) tally[row.status] += 1
    return tally
  }, [rows])

  const setStatus = (studentId: number, status: AttendanceStatus): void => {
    setRows((current) => current.map((row) => (row.student.id === studentId ? { ...row, status } : row)))
  }

  const markAllPresent = (): void => {
    setRows((current) => current.map((row) => ({ ...row, status: 'present' })))
  }

  const save = async (): Promise<void> => {
    if (!lessonId || rows.length === 0) {
      onClose()
      return
    }
    setBusy(true)
    const result = await run(
      () =>
        window.api.attendance.save({
          academic_year_id: rows[0].student.academic_year_id,
          daily_lesson_id: lessonId,
          class_id: rows[0].student.class_id ?? 0,
          date: new Date().toISOString().slice(0, 10),
          entries: rows.map((row) => ({ student_id: row.student.id, status: row.status, note: row.note }))
        }),
      'تم حفظ الحضور'
    )
    setBusy(false)
    if (result) {
      onSaved?.()
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`الحضور — ${className ?? ''}`}
      footer={
        <>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            حفظ الحضور
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="success">حاضر {counts.present}</Badge>
          <Badge tone="danger">غائب {counts.absent}</Badge>
          <Badge tone="warning">متأخر {counts.late}</Badge>
          <Badge tone="info">معفي {counts.excused}</Badge>
        </div>
        <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} onClick={markAllPresent}>
          تحديد الجميع حاضر
        </Button>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm muted">
          لا يوجد تلاميذ في هذا القسم. أضف التلاميذ أولاً من صفحة «التلاميذ».
        </p>
      ) : (
        <div className="table-wrap max-h-[55vh]">
          <table className="grid">
            <thead>
              <tr>
                <th className="w-12 text-center">الرقم</th>
                <th>الاسم الكامل</th>
                <th className="text-center">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.student.id} className={cn(row.status !== 'present' && 'bg-red-50/40 dark:bg-red-950/20')}>
                  <td className="text-center tabular-nums">{row.student.number ?? index + 1}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-800 dark:bg-slate-700 dark:text-brand-100">
                        {initials(row.student.full_name)}
                      </span>
                      {row.student.full_name}
                    </span>
                  </td>
                  <td>
                    <div className="flex justify-center gap-1">
                      {ATTENDANCE_STATUSES.map((status) => (
                        <button
                          key={status.value}
                          className={cn(
                            'h-7 w-7 rounded-md border text-xs font-bold transition',
                            row.status === status.value
                              ? status.value === 'present'
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : status.value === 'absent'
                                  ? 'border-red-600 bg-red-600 text-white'
                                  : status.value === 'late'
                                    ? 'border-amber-600 bg-amber-600 text-white'
                                    : 'border-slate-600 bg-slate-600 text-white'
                              : 'hover:bg-[rgb(var(--surface-muted))]'
                          )}
                          title={status.label}
                          onClick={() => setStatus(row.student.id, status.value)}
                        >
                          {status.short}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted mt-3 flex items-center gap-1.5 text-xs">
        <Users className="h-3.5 w-3.5" /> الافتراضي «حاضر» — غيّر الغائبين فقط لتسريع الإدخال.
      </p>
    </Modal>
  )
}
