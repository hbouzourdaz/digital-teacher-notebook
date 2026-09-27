import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Archive,
  ArchiveRestore,
  Bookmark,
  Download,
  FileSpreadsheet,
  Pencil,
  Printer,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users
} from 'lucide-react'
import type { ContinuousEntry, ImportMapping, ImportPreviewRow, Student, StudentTransfer } from '@shared/types'
import { CONTINUOUS_KINDS, TERM_LABELS } from '@shared/constants'
import { normalizeArabic, parseNumber, formatNumber } from '@shared/utils/misc'
import { normalizeDateInput } from '@shared/utils/date'
import { useApp } from '../store/app'
import { useAsync } from '../hooks/useAsync'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  StatCard,
  Tabs,
  Textarea,
  type Column
} from '../components/ui'

interface StudentForm {
  id: number | null
  class_id: number | null
  number: string
  first_name: string
  last_name: string
  gender: '' | 'male' | 'female'
  birth_date: string
  guardian_phone: string
  notes: string
}

export default function StudentsPage({ studentId }: { studentId: number | null }): JSX.Element {
  return studentId ? <StudentDetail studentId={studentId} /> : <StudentsList />
}

/* ------------------------------------------------------------------ */
/* قائمة التلاميذ                                                      */
/* ------------------------------------------------------------------ */
function StudentsList(): JSX.Element {
  const navigate = useApp((state) => state.navigate)
  const classes = useApp((state) => state.classes)
  const activeYear = useApp((state) => state.activeYear)
  const run = useApp((state) => state.run)
  const toast = useApp((state) => state.toast)

  const [classId, setClassId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState<StudentForm | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null)
  const [transferTarget, setTransferTarget] = useState<Student | null>(null)
  const [transferTo, setTransferTo] = useState<number | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const students = useAsync<Student[]>(
    () => window.api.students.list({ class_id: classId, search: search.trim() || undefined, archived: showArchived }),
    [classId, search, showArchived, activeYear?.id],
    []
  )

  const openForm = (row?: Student): void =>
    setForm(
      row
        ? {
            id: row.id,
            class_id: row.class_id,
            number: row.number !== null ? String(row.number) : '',
            first_name: row.first_name,
            last_name: row.last_name,
            gender: row.gender ?? '',
            birth_date: row.birth_date ?? '',
            guardian_phone: row.guardian_phone ?? '',
            notes: row.notes ?? ''
          }
        : {
            id: null,
            class_id: classId ?? classes[0]?.id ?? null,
            number: '',
            first_name: '',
            last_name: '',
            gender: '',
            birth_date: '',
            guardian_phone: '',
            notes: ''
          }
    )

  const save = async (force = false): Promise<void> => {
    if (!form) return
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast('الاسم واللقب مطلوبان', 'warning')
      return
    }
    setSaving(true)
    const payload = {
      academic_year_id: activeYear?.id ?? 0,
      class_id: form.class_id,
      number: parseNumber(form.number),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      gender: form.gender === '' ? null : form.gender,
      birth_date: form.birth_date || null,
      guardian_phone: form.guardian_phone.trim() || null,
      notes: form.notes.trim() || null,
      archived: 0 as const,
      sort_order: 0
    }
    try {
      if (form.id) {
        await window.api.students.update({ ...payload, id: form.id })
        toast('تم تعديل بيانات التلميذ')
      } else {
        await window.api.students.create({ ...payload, force })
        toast('تمت إضافة التلميذ')
      }
      setForm(null)
      await students.reload()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر حفظ التلميذ'
      if (message.includes('موجود مسبقاً')) {
        const confirmed = await window.api.dialogs.confirm({
          title: 'تلميذ مكرر',
          message,
          detail: 'هل تريد إضافته على أي حال؟',
          confirmLabel: 'إضافة على أي حال'
        })
        if (confirmed) {
          await save(true)
          return
        }
      } else {
        toast(message, 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const move = async (row: Student, direction: -1 | 1): Promise<void> => {
    const list = students.data.filter((item) => item.class_id === row.class_id)
    const index = list.findIndex((item) => item.id === row.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= list.length) return
    const reordered = [...list]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    await run(() => window.api.students.reorder({ class_id: row.class_id as number, orderedIds: reordered.map((item) => item.id) }))
    await students.reload()
  }

  const columns: Array<Column<Student>> = [
    {
      key: 'number',
      header: 'الرقم',
      align: 'center',
      width: '5rem',
      render: (row, index) => <span className="tabular-nums">{row.number ?? index + 1}</span>
    },
    {
      key: 'name',
      header: 'الاسم الكامل',
      sticky: true,
      width: '14rem',
      render: (row) => (
        <button
          className="font-medium hover:text-brand-700 dark:hover:text-brand-200"
          onClick={() => navigate(`/students/${row.id}`)}
        >
          {row.full_name}
        </button>
      )
    },
    { key: 'class', header: 'القسم', align: 'center', width: '8rem', render: (row) => row.class_name ?? '—' },
    {
      key: 'gender',
      header: 'الجنس',
      align: 'center',
      width: '6rem',
      render: (row) => (row.gender === 'male' ? 'ذكر' : row.gender === 'female' ? 'أنثى' : '—')
    },
    { key: 'birth', header: 'تاريخ الميلاد', align: 'center', width: '8rem', render: (row) => row.birth_date ?? '—' },
    { key: 'phone', header: 'هاتف الولي', align: 'center', width: '8rem', render: (row) => row.guardian_phone ?? '—' },
    {
      key: 'actions',
      header: 'إجراءات',
      align: 'center',
      width: '12rem',
      render: (row) => (
        <span className="flex justify-center gap-1">
          <button className="rounded p-1 hover:bg-[rgb(var(--surface-muted))]" title="تحريك للأعلى" onClick={() => void move(row, -1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button className="rounded p-1 hover:bg-[rgb(var(--surface-muted))]" title="تحريك للأسفل" onClick={() => void move(row, 1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button className="rounded p-1 hover:bg-[rgb(var(--surface-muted))]" title="تعديل" onClick={() => openForm(row)}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded p-1 hover:bg-[rgb(var(--surface-muted))]"
            title="نقل إلى قسم آخر"
            onClick={() => {
              setTransferTarget(row)
              setTransferTo(classes.find((item) => item.id !== row.class_id)?.id ?? null)
            }}
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded p-1 hover:bg-[rgb(var(--surface-muted))]"
            title={row.archived ? 'إلغاء الأرشفة' : 'أرشفة'}
            onClick={() =>
              void run(
                () => window.api.students.update({ ...toStudentPayload(row), archived: row.archived ? 0 : 1, id: row.id }),
                row.archived ? 'تم إلغاء الأرشفة' : 'تمت أرشفة التلميذ'
              ).then(() => void students.reload())
            }
          >
            {row.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          </button>
          <button
            className="rounded p-1 hover:text-red-600 dark:hover:text-red-400"
            title="حذف"
            onClick={() => setDeleteTarget(row)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      )
    }
  ]

  return (
    <div>
      <PageHeader
        title="التلاميذ"
        subtitle={`${students.data.length} تلميذ${classId ? ` في ${classes.find((item) => item.id === classId)?.name ?? ''}` : ''}`}
        actions={
          <>
            <Button size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
              استيراد Excel/CSV
            </Button>
            <Button
              size="sm"
              icon={<Download className="h-4 w-4" />}
              onClick={() =>
                void run(() => window.api.students.exportFile({ class_id: classId }), 'تم تصدير قائمة التلاميذ')
              }
            >
              تصدير CSV
            </Button>
            <Button size="sm" variant="primary" icon={<UserPlus className="h-4 w-4" />} onClick={() => openForm()}>
              إضافة تلميذ
            </Button>
          </>
        }
      />

      <div className="card card-pad mb-3 grid gap-3 md:grid-cols-4">
        <Field label="القسم">
          <Select value={classId ?? ''} onChange={(event) => setClassId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">كل الأقسام</option>
            {classes.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="بحث" className="md:col-span-2">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 opacity-50" />
            <Input className="pr-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="الاسم أو اللقب أو الرقم…" />
          </div>
        </Field>
        <div className="flex items-end">
          <Checkbox checked={showArchived} onChange={setShowArchived} label="إظهار المؤرشفين" />
        </div>
      </div>

      {students.loading ? (
        <LoadingBlock />
      ) : students.data.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="لا يوجد تلاميذ"
          message="أضف التلاميذ فردياً أو استوردهم من ملف Excel/CSV جاهز. الاستيراد لا يُرسل أي بيانات إلى الإنترنت."
          action={
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => openForm()}>
                إضافة تلميذ
              </Button>
              <Button icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
                استيراد من ملف
              </Button>
            </div>
          }
        />
      ) : (
        <DataTable columns={columns} rows={students.data} rowKey={(row) => row.id} />
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? 'تعديل تلميذ' : 'إضافة تلميذ'}
        footer={
          <>
            <Button onClick={() => setForm(null)}>إلغاء</Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              حفظ
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="الاسم" required>
              <Input value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} />
            </Field>
            <Field label="اللقب" required>
              <Input value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} />
            </Field>
            <Field label="القسم">
              <Select value={form.class_id ?? ''} onChange={(event) => setForm({ ...form, class_id: event.target.value ? Number(event.target.value) : null })}>
                <option value="">— بدون قسم —</option>
                {classes.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="الرقم في القسم">
              <Input value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} inputMode="numeric" />
            </Field>
            <Field label="الجنس">
              <Select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value as StudentForm['gender'] })}>
                <option value="">— غير محدّد —</option>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </Select>
            </Field>
            <Field label="تاريخ الميلاد">
              <Input type="date" value={form.birth_date} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} />
            </Field>
            <Field label="هاتف الولي">
              <Input value={form.guardian_phone} onChange={(event) => setForm({ ...form, guardian_phone: event.target.value })} />
            </Field>
            <Field label="ملاحظات" className="md:col-span-2">
              <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={transferTarget !== null}
        onClose={() => setTransferTarget(null)}
        size="sm"
        title={`نقل التلميذ «${transferTarget?.full_name ?? ''}»`}
        footer={
          <>
            <Button onClick={() => setTransferTarget(null)}>إلغاء</Button>
            <Button
              variant="primary"
              onClick={() => {
                const target = transferTarget
                setTransferTarget(null)
                if (!target || !transferTo) return
                void run(
                  () => window.api.students.transfer({ student_id: target.id, to_class_id: transferTo, note: null }),
                  'تم نقل التلميذ مع حفظ سجل النقل'
                ).then(() => void students.reload())
              }}
            >
              نقل
            </Button>
          </>
        }
      >
        <Field label="إلى القسم" required>
          <Select value={transferTo ?? ''} onChange={(event) => setTransferTo(Number(event.target.value))}>
            <option value="">— اختر —</option>
            {classes
              .filter((row) => row.id !== transferTarget?.class_id)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
          </Select>
        </Field>
        <p className="muted mt-2 text-xs">يُحفظ سجل النقل تلقائياً ولا تُحذف بيانات التلميذ التاريخية.</p>
      </Modal>

      <ImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        defaultClassId={classId ?? classes[0]?.id ?? null}
        classes={classes}
        academicYearId={activeYear?.id ?? 0}
        onDone={() => void students.reload()}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="حذف تلميذ"
        message={`هل تريد حذف «${deleteTarget?.full_name ?? ''}»؟`}
        detail="سيتم حذف كل العلامات وسجلات الحضور المرتبطة به. إن كان التلميذ قد غادر القسم، استعمل الأرشفة بدلاً من الحذف."
        confirmLabel="حذف نهائي"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget
          setDeleteTarget(null)
          if (!target) return
          void run(() => window.api.students.remove({ id: target.id }), 'تم حذف التلميذ').then(() => void students.reload())
        }}
      />
    </div>
  )
}

function toStudentPayload(row: Student): {
  academic_year_id: number
  class_id: number | null
  number: number | null
  first_name: string
  last_name: string
  gender: 'male' | 'female' | null
  birth_date: string | null
  guardian_phone: string | null
  notes: string | null
  archived: number
  sort_order: number
} {
  return {
    academic_year_id: row.academic_year_id,
    class_id: row.class_id,
    number: row.number,
    first_name: row.first_name,
    last_name: row.last_name,
    gender: row.gender,
    birth_date: row.birth_date,
    guardian_phone: row.guardian_phone,
    notes: row.notes,
    archived: row.archived,
    sort_order: row.sort_order
  }
}

/* ------------------------------------------------------------------ */
/* معالج الاستيراد                                                      */
/* ------------------------------------------------------------------ */
function ImportWizard({
  open,
  onClose,
  classes,
  defaultClassId,
  academicYearId,
  onDone
}: {
  open: boolean
  onClose: () => void
  classes: Array<{ id: number; name: string }>
  defaultClassId: number | null
  academicYearId: number
  onDone: () => void
}): JSX.Element {
  const run = useApp((state) => state.run)
  const toast = useApp((state) => state.toast)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [defaultFile, setDefaultFile] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<ImportMapping>(EMPTY_MAPPING)
  const [classId, setClassId] = useState<number | null>(defaultClassId)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [createMissingClasses, setCreateMissingClasses] = useState(true)
  const [backupFirst, setBackupFirst] = useState(true)

  const preview = useMemo<ImportPreviewRow[]>(() => {
    const seen = new Set<string>()
    return rows.map((row, index) => {
      const first =
        mapping.first >= 0 && row[mapping.first]?.trim() ? row[mapping.first].trim() : splitFull(row[mapping.full] ?? '').first
      const last =
        mapping.last >= 0 && row[mapping.last]?.trim() ? row[mapping.last].trim() : splitFull(row[mapping.full] ?? '').last
      const className = mapping.class_name >= 0 ? row[mapping.class_name]?.trim() || null : null
      const key = `${normalizeArabic(className ?? '')}|${normalizeArabic(first)}|${normalizeArabic(last)}`
      const duplicate = seen.has(key)
      seen.add(key)
      const number = mapping.number >= 0 ? (parseNumber(row[mapping.number]) ?? null) : null
      const genderRaw = mapping.gender >= 0 ? (row[mapping.gender] ?? '').trim().toLowerCase() : ''
      const gender = ['ذكر', 'male', 'm', 'ذ'].includes(genderRaw)
        ? ('male' as const)
        : ['أنثى', 'female', 'f', 'ا'].includes(genderRaw)
          ? ('female' as const)
          : null
      const birthDate = mapping.birth_date >= 0 ? normalizeDateInput(row[mapping.birth_date] ?? '') : null
      return {
        rowNumber: index + 1,
        first_name: first,
        last_name: last,
        full_name: `${first} ${last}`.trim(),
        number,
        gender,
        birth_date: birthDate,
        class_name: className,
        duplicate,
        invalid: !first || !last,
        message: !first || !last ? 'الاسم أو اللقب فارغ' : duplicate ? 'مكرر داخل الملف' : null
      }
    })
  }, [rows, mapping])

  const validRows = preview.filter((row) => !row.invalid)
  const duplicateCount = preview.filter((row) => row.duplicate).length
  const groupsInFile = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of validRows) {
      const label = row.class_name ?? 'بدون قسم (القسم الافتراضي)'
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'))
  }, [validRows])

  /** تحميل ملف جاهز: قراءة + مطابقة أعمدة مقترحة + الانتقال لخطوة المطابقة */
  const loadFile = async (path: string): Promise<void> => {
    const parsed = await run(() =>
      window.api.students.importFile({
        academic_year_id: academicYearId,
        class_id: classId,
        file_path: path,
        skipDuplicates
      })
    )
    if (!parsed) return
    setFilePath(parsed.filePath)
    setHeaders(parsed.headers)
    setRows(parsed.rows)
    setMapping(parsed.mapping)
    setStep(2)
  }

  const reset = (): void => {
    setStep(1)
    setFilePath(null)
    setHeaders([])
    setRows([])
    setMapping(EMPTY_MAPPING)
  }

  const pickFile = async (): Promise<void> => {
    const path = await window.api.dialogs.pickFile({
      title: 'اختيار ملف التلاميذ',
      filters: ['csv', 'xlsx', 'xls'],
      defaultPath: filePath ?? defaultFile ?? undefined
    })
    if (!path) return
    await loadFile(path)
  }

  // ملف الاستيراد الافتراضي: يُفتح تلقائياً عند فتح المعالج إن كان موجوداً
  const stepRef = useRef(step)
  const rowsRef = useRef(rows)
  stepRef.current = step
  rowsRef.current = rows
  const loadFileRef = useRef(loadFile)
  loadFileRef.current = loadFile

  useEffect(() => {
    if (!open || academicYearId === 0) return
    let cancelled = false
    void window.api.students.defaultImportFile().then((info) => {
      if (cancelled || !info.path) return
      setDefaultFile(info.path)
      // لا نُعيد التحميل إذا كان الأستاذ قد اختار ملفاً أو وصل لخطوة المطابقة
      if (stepRef.current === 1 && rowsRef.current.length === 0) void loadFileRef.current(info.path)
    })
    return () => {
      cancelled = true
    }
  }, [open, academicYearId])

  const commit = async (): Promise<void> => {
    if (backupFirst) {
      await run(() => window.api.backup.create({ kind: 'pre-import', note: 'نسخة قبل استيراد تلاميذ' }))
    }
    const result = await run(
      () =>
        window.api.students.importRows({
          academic_year_id: academicYearId,
          class_id: classId,
          skipDuplicates,
          createMissingClasses,
          rows: validRows.map((row) => ({
            first_name: row.first_name,
            last_name: row.last_name,
            number: row.number,
            gender: row.gender,
            birth_date: row.birth_date,
            class_name: row.class_name
          }))
        })
    )
    if (!result) return
    toast(`تم استيراد ${result.inserted} تلميذ — تم تخطي ${result.skipped}`, 'success')
    if (result.createdClasses.length > 0) {
      toast(`أقسام جديدة: ${result.createdClasses.join('، ')}`, 'info')
    }
    if (result.errors.length > 0) {
      toast(`ملاحظات على ${result.errors.length} سطر`, 'warning', result.errors.slice(0, 3).join(' • '))
    }
    onDone()
    onClose()
    reset()
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose()
        reset()
      }}
      size="lg"
      title={`استيراد التلاميذ — الخطوة ${step} من 3`}
      footer={
        <>
          <Button
            onClick={() => {
              onClose()
              reset()
            }}
          >
            إلغاء
          </Button>
          {step === 2 && <Button onClick={() => void pickFile()}>اختيار ملف آخر</Button>}
          {step === 2 && (
            <Button variant="primary" onClick={() => setStep(3)} disabled={validRows.length === 0}>
              معاينة ({validRows.length})
            </Button>
          )}
          {step === 3 && <Button onClick={() => setStep(2)}>رجوع إلى المطابقة</Button>}
          {step === 3 && (
            <Button variant="primary" icon={<Upload className="h-4 w-4" />} onClick={() => void commit()}>
              استيراد {validRows.length} تلميذ
            </Button>
          )}
        </>
      }
    >
      {step === 1 && (
        <div className="space-y-4">
          <Field label="القسم الافتراضي (للأسطر التي لا تحمل عمود قسم)">
            <Select value={classId ?? ''} onChange={(event) => setClassId(event.target.value ? Number(event.target.value) : null)}>
              <option value="">— بدون قسم (يمكن توزيعهم لاحقاً) —</option>
              {classes.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="space-y-2">
            <Checkbox
              checked={createMissingClasses}
              onChange={setCreateMissingClasses}
              label="إنشاء الأقسام غير الموجودة تلقائياً من عمود القسم/الفوج"
            />
            <Checkbox checked={skipDuplicates} onChange={setSkipDuplicates} label="تخطي الأسماء المكررة داخل نفس القسم" />
            <Checkbox checked={backupFirst} onChange={setBackupFirst} label="إنشاء نسخة احتياطية قبل الاستيراد (مُوصى به)" />
          </div>
          <div className="rounded-lg border border-dashed p-6 text-center">
            <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 opacity-60" />
            <p className="mb-3 text-sm">
              الملفات المدعومة: CSV، XLSX، XLS — وتبقى محلية على هذا الجهاز. يُفتح الملف الافتراضي تلقائياً عند توفره.
            </p>
            {defaultFile && (
              <p className="mb-3 text-xs text-brand-700 dark:text-brand-200">
                الملف الافتراضي: <span className="font-semibold">{defaultFile}</span>
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" icon={<Upload className="h-4 w-4" />} onClick={() => void pickFile()} disabled={academicYearId === 0}>
                {defaultFile ? 'فتح الملف الافتراضي' : 'اختيار ملف'}
              </Button>
              {defaultFile && (
                <Button variant="ghost" disabled={academicYearId === 0} onClick={() => void loadFile(defaultFile)}>
                  تحميله الآن
                </Button>
              )}
            </div>
            {academicYearId === 0 && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">أضف سنة دراسية أولاً من الإعدادات.</p>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="muted text-xs">الملف: {filePath}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {(
              [
                ['first', 'عمود الاسم'],
                ['last', 'عمود اللقب'],
                ['full', 'أو عمود الاسم الكامل'],
                ['number', 'عمود رقم التسجيل'],
                ['gender', 'عمود الجنس'],
                ['birth_date', 'عمود تاريخ الميلاد'],
                ['class_name', 'عمود القسم / الفوج'],
                ['notes', 'عمود الملاحظات']
              ] as Array<[keyof typeof mapping, string]>
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <Select
                  value={mapping[key]}
                  onChange={(event) => setMapping({ ...mapping, [key]: Number(event.target.value) })}
                >
                  <option value={-1}>— غير مستعمل —</option>
                  {headers.map((header, index) => (
                    <option key={`${header}-${index}`} value={index}>
                      {header || `عمود ${index + 1}`}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          <div className="table-wrap max-h-60">
            <table className="grid text-xs">
              <thead>
                <tr>
                  {headers.map((header, index) => (
                    <th key={`${header}-${index}`}>{header || `عمود ${index + 1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 6).map((row, index) => (
                  <tr key={index}>
                    {headers.map((_, cellIndex) => (
                      <td key={cellIndex}>{row[cellIndex] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted text-xs">عدد الأسطر: {rows.length}</p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="info">صالح: {validRows.length}</Badge>
            {duplicateCount > 0 && <Badge tone="warning">مكرر: {duplicateCount}</Badge>}
            <Badge tone="danger">غير صالح: {preview.length - validRows.length}</Badge>
          </div>
          {groupsInFile.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-xs">
              <span className="muted">التوزيع على الأقسام:</span>
              {groupsInFile.map(([name, total]) => (
                <Badge key={name} tone="neutral">
                  {name}: {total}
                </Badge>
              ))}
            </div>
          )}
          <div className="table-wrap max-h-72">
            <table className="grid text-xs">
              <thead>
                <tr>
                  <th className="w-12 text-center">السطر</th>
                  <th>الاسم</th>
                  <th>اللقب</th>
                  <th className="w-14 text-center">الرقم</th>
                  <th className="w-16 text-center">الجنس</th>
                  <th className="w-28 text-center">تاريخ الميلاد</th>
                  <th>القسم / الفوج</th>
                  <th>ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 300).map((row) => (
                  <tr key={row.rowNumber} className={row.invalid ? 'bg-red-50/60 dark:bg-red-950/20' : row.duplicate ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}>
                    <td className="text-center tabular-nums">{row.rowNumber}</td>
                    <td>{row.first_name}</td>
                    <td>{row.last_name}</td>
                    <td className="text-center">{row.number ?? ''}</td>
                    <td className="text-center">{row.gender === 'male' ? 'ذكر' : row.gender === 'female' ? 'أنثى' : ''}</td>
                    <td className="text-center tabular-nums">{row.birth_date ?? ''}</td>
                    <td>{row.class_name ?? ''}</td>
                    <td className="muted">{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {validRows.length === 0 && (
            <p className="text-sm text-red-600 dark:text-red-400">لا توجد أسطر صالحة للاستيراد. راجع مطابقة الأعمدة.</p>
          )}
        </div>
      )}
    </Modal>
  )
}

function splitFull(value: string): { first: string; last: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '' }
  const last = parts.pop() as string
  return { first: parts.join(' '), last }
}

/** مطابقة فارغة — تُستعمل كقيمة ابتدائية وعند الإلغاء */
const EMPTY_MAPPING: ImportMapping = {
  first: -1,
  last: -1,
  full: -1,
  number: -1,
  gender: -1,
  birth_date: -1,
  class_name: -1,
  notes: -1
}

/* ------------------------------------------------------------------ */
/* صفحة التلميذ                                                        */
/* ------------------------------------------------------------------ */
type StudentTab = 'grades' | 'attendance' | 'scores' | 'continuous' | 'notes' | 'transfers'

function StudentDetail({ studentId }: { studentId: number }): JSX.Element {
  const navigate = useApp((state) => state.navigate)
  const run = useApp((state) => state.run)
  const [tab, setTab] = useState<StudentTab>('grades')
  const [term, setTerm] = useState(1)
  const [noteDraft, setNoteDraft] = useState('')

  const history = useAsync(
    () => window.api.students.history({ student_id: studentId }),
    [studentId],
    null as null | Awaited<ReturnType<typeof window.api.students.history>>
  )
  const detail = useAsync(
    () => window.api.grades.studentDetail({ student_id: studentId, term }),
    [studentId, term],
    null as null | Awaited<ReturnType<typeof window.api.grades.studentDetail>>
  )

  if (history.loading && !history.data) return <LoadingBlock />
  if (!history.data) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6" />}
        title="التلميذ غير موجود"
        action={
          <Button onClick={() => navigate('/students')}>
            <ArrowRight className="h-4 w-4" /> عودة
          </Button>
        }
      />
    )
  }

  const student = history.data.student

  const attendanceColumns: Array<Column<(typeof history.data.attendance)[number]>> = [
    { key: 'date', header: 'التاريخ', align: 'center', width: '8rem', render: (row) => row.date },
    { key: 'time', header: 'التوقيت', align: 'center', width: '7rem', render: (row) => row.start_time },
    { key: 'class', header: 'القسم', align: 'center', render: (row) => row.class_name ?? '—' },
    {
      key: 'status',
      header: 'الحالة',
      align: 'center',
      width: '7rem',
      render: (row) => (
        <Badge tone={row.status === 'absent' ? 'danger' : row.status === 'late' ? 'warning' : row.status === 'excused' ? 'info' : 'success'}>
          {row.status === 'absent' ? 'غائب' : row.status === 'late' ? 'متأخر' : row.status === 'excused' ? 'معفي' : 'حاضر'}
        </Badge>
      )
    }
  ]

  const scoreColumns: Array<Column<(typeof history.data.scores)[number]>> = [
    { key: 'date', header: 'التاريخ', align: 'center', width: '8rem', render: (row) => row.date },
    { key: 'name', header: 'التقييم', render: (row) => row.name },
    { key: 'type', header: 'النوع', align: 'center', width: '7rem', render: (row) => row.type },
    { key: 'term', header: 'الفصل', align: 'center', width: '8rem', render: (row) => TERM_LABELS[row.term] ?? '' },
    { key: 'max', header: 'القصوى', align: 'center', width: '5rem', render: (row) => formatNumber(row.max_score) },
    { key: 'score', header: 'العلامة', align: 'center', width: '6rem', render: (row) => <strong>{formatNumber(row.score)}</strong> }
  ]

  const transferColumns: Array<Column<StudentTransfer>> = [
    { key: 'date', header: 'التاريخ', align: 'center', width: '8rem', render: (row) => row.date },
    { key: 'from', header: 'من قسم', align: 'center', render: (row) => String(row.from_class_id ?? '—') },
    { key: 'to', header: 'إلى قسم', align: 'center', render: (row) => String(row.to_class_id ?? '—') },
    { key: 'note', header: 'ملاحظة', render: (row) => row.note ?? '' }
  ]

  return (
    <div>
      <PageHeader
        title={student.full_name}
        subtitle={`${student.class_name ?? 'بدون قسم'} — ${student.archived ? 'مؤرشف' : 'نشط'}`}
        actions={
          <>
            <Button size="sm" icon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate('/students')}>
              قائمة التلاميذ
            </Button>
            <Button
              size="sm"
              icon={<Printer className="h-4 w-4" />}
              onClick={() => navigate('/reports')}
            >
              تقرير التلميذ
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="الغيابات" value={history.data.absences} />
        <StatCard label="التأخرات" value={history.data.lates} />
        <StatCard label="الإعفاءات" value={history.data.excused} />
        <StatCard
          label="المعدل العام"
          value={formatNumber(
            detail.data?.overall ?? (detail.data && detail.data.grades[0] ? detail.data.grades[0].average : null)
          )}
        />
      </div>

      <div className="card card-pad mb-4 grid gap-3 text-sm md:grid-cols-4">
        <div>
          <p className="muted text-xs">الرقم</p>
          <p className="font-medium tabular-nums">{student.number ?? '—'}</p>
        </div>
        <div>
          <p className="muted text-xs">الجنس</p>
          <p className="font-medium">{student.gender === 'male' ? 'ذكر' : student.gender === 'female' ? 'أنثى' : '—'}</p>
        </div>
        <div>
          <p className="muted text-xs">تاريخ الميلاد</p>
          <p className="font-medium">{student.birth_date ?? '—'}</p>
        </div>
        <div>
          <p className="muted text-xs">هاتف الولي</p>
          <p className="font-medium tabular-nums">{student.guardian_phone ?? '—'}</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select className="w-40" value={term} onChange={(event) => setTerm(Number(event.target.value))}>
          {[1, 2, 3].map((value) => (
            <option key={value} value={value}>
              {TERM_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      <Tabs<StudentTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'grades', label: 'النقاط والمعدلات' },
          { value: 'attendance', label: `الحضور (${history.data.attendance.length})` },
          { value: 'scores', label: `تفصيل التقييمات (${history.data.scores.length})` },
          { value: 'continuous', label: 'التقويم المستمر' },
          { value: 'notes', label: `الملاحظات (${history.data.notes.length})` },
          { value: 'transfers', label: 'سجل النقل' }
        ]}
      />

      {tab === 'grades' && (
        <div className="table-wrap">
          {detail.data && detail.data.grades.length > 0 ? (
            <table className="grid">
              <thead>
                <tr>
                  <th>التقويم المستمر</th>
                  <th className="text-center">الفرض</th>
                  <th className="text-center">معدل النشاطات</th>
                  <th className="text-center">الاختبار</th>
                  <th className="text-center">المعدل</th>
                  <th className="text-center">الغيابات</th>
                </tr>
              </thead>
              <tbody>
                {detail.data.grades.map((row, index) => (
                  <tr key={index}>
                    <td className="text-center">{formatNumber(row.continuous)}</td>
                    <td className="text-center">{formatNumber(row.homework)}</td>
                    <td className="text-center">{formatNumber(row.activities)}</td>
                    <td className="text-center">{formatNumber(row.exam)}</td>
                    <td className="text-center">
                      <strong>{formatNumber(row.average)}</strong>
                    </td>
                    <td className="text-center">{row.absences}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted p-6 text-center text-sm">
              لا توجد نقاط محسوبة لهذا الفصل. افتح «دفتر التنقيط» واختر القسم لحساب المعدلات.
            </p>
          )}
        </div>
      )}

      {tab === 'attendance' && (
        <DataTable columns={attendanceColumns} rows={history.data.attendance} rowKey={(row, index) => `${row.date}-${index}`} emptyMessage="لا يوجد سجل حضور." />
      )}
      {tab === 'scores' && <DataTable columns={scoreColumns} rows={history.data.scores} rowKey={(row) => row.assessment_id} emptyMessage="لا توجد علامات مسجّلة." />}
      {tab === 'continuous' && (
        <ContinuousPanel
          entries={history.data.continuous}
          onSaved={() => {
            void history.reload()
            void detail.reload()
          }}
        />
      )}
      {tab === 'notes' && (
        <div className="card card-pad">
          <div className="mb-3 flex gap-2">
            <Input value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="أضف ملاحظة على التلميذ…" />
            <Button
              onClick={() =>
                void run(() => window.api.notes.save({ owner_type: 'student', owner_id: studentId, body: noteDraft.trim() }), 'تمت إضافة الملاحظة').then(
                  (created) => {
                    if (created) {
                      setNoteDraft('')
                      void history.reload()
                    }
                  }
                )
              }
              disabled={noteDraft.trim().length === 0}
            >
              إضافة
            </Button>
          </div>
          {history.data.notes.length === 0 ? (
            <p className="muted text-sm">لا ملاحظات على هذا التلميذ.</p>
          ) : (
            <ul className="space-y-2">
              {history.data.notes.map((note) => (
                <li key={note.id} className="flex items-start justify-between gap-3 rounded-md border p-2 text-sm">
                  <div>
                    <p className="whitespace-pre-wrap">{note.body}</p>
                    <p className="muted mt-1 text-xs">{note.created_at}</p>
                  </div>
                  <button
                    className="muted hover:text-red-600"
                    onClick={() =>
                      void run(() => window.api.notes.remove({ id: note.id })).then(() => void history.reload())
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {tab === 'transfers' && (
        <DataTable
          columns={transferColumns}
          rows={history.data.transfers}
          rowKey={(row) => row.id}
          emptyMessage="لم يُنقل هذا التلميذ من قسمه."
        />
      )}
    </div>
  )
}

function ContinuousPanel({
  entries,
  onSaved
}: {
  entries: ContinuousEntry[]
  onSaved: () => void
}): JSX.Element {
  const toast = useApp((state) => state.toast)
  const byKind = new Map(entries.map((entry) => [entry.kind, entry]))
  return (
    <div className="card card-pad">
      <div className="section-title">
        <Bookmark className="h-4 w-4" /> قيم التقويم المستمر
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {CONTINUOUS_KINDS.map((kind) => (
          <div key={kind.value} className="rounded-md border p-3 text-center">
            <p className="muted mb-1 text-xs">{kind.label}</p>
            <p className="text-xl font-bold tabular-nums">{formatNumber(byKind.get(kind.value)?.value ?? null)}</p>
          </div>
        ))}
      </div>
      <p className="muted mt-3 text-xs">
        تُدخل قيم التقويم المستمر من صفحة «دفتر التنقيط» لكل قسم وفصل.{' '}
        <button className="underline" onClick={() => onSaved()}>
          تحديث العرض
        </button>
      </p>
      <div className="mt-2">
        <Button size="sm" onClick={() => toast('يمكن تعديل القيم من دفتر التنقيط', 'info')}>
          كيفية التعديل
        </Button>
      </div>
    </div>
  )
}
