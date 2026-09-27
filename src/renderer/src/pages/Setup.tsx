import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  CalendarRange,
  Check,
  GraduationCap,
  Layers,
  NotebookPen,
  Sparkles,
  Upload,
  User,
  Users
} from 'lucide-react'
import type { ClassRow } from '@shared/types'
import { DEFAULT_ACADEMIC_YEAR, DEFAULT_SUBJECT, TIME_SLOTS } from '@shared/constants'
import { useApp } from '../store/app'
import { Badge, Button,  Field,
  Input,
  Select,
  Textarea
} from '../components/ui'

type Mode = 'welcome' | 'wizard' | 'quick' | 'done'

const STEP_LABELS = [
  'بيانات الأستاذ',
  'المؤسسة',
  'المادة',
  'السنة الدراسية',
  'الأقسام',
  'استيراد التلاميذ',
  'الجدول الأسبوعي'
]

export default function SetupPage(): JSX.Element {
  const [mode, setMode] = useState<Mode>('welcome')
  const [step, setStep] = useState(1)
  const reloadMaster = useApp((state) => state.reloadMaster)
  const toast = useApp((state) => state.toast)
  const completeSetup = useApp((state) => state.boot)

  const finish = async (): Promise<void> => {
    await window.api.setup.complete({ completed: true })
    useApp.setState({ setupCompleted: true, route: '/' })
    await completeSetup()
  }

  if (mode === 'welcome') {
    return (
      <div className="flex h-full items-center justify-center bg-brand-900 p-6">
        <div className="card w-full max-w-2xl p-8">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-md bg-brand-50 p-3 text-brand-700 dark:bg-slate-800 dark:text-brand-200">
              <NotebookPen className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold">مرحباً بك في دفتر الأستاذ الرقمي</h1>
              <p className="muted text-sm">دفترك الورقي، لكن أسرع وأذكى — ويعمل بالكامل دون إنترنت.</p>
            </div>
          </div>

          <ul className="muted mb-6 space-y-1.5 text-sm">
            <li>• تُدخل جدولك الأسبوعي مرة واحدة، فتصلك حصص كل يوم جاهزة للتسجيل.</li>
            <li>• تسجّل الحصة والحضور والنقاط في خطوات قليلة، وكلها مترابطة تلقائياً.</li>
            <li>• بياناتك تبقى على هذا الجهاز، مع نسخ احتياطي محلي وطباعة A4 بالخط العربي.</li>
          </ul>

          <div className="flex flex-wrap gap-3">
            <Button variant="primary" icon={<Sparkles className="h-4 w-4" />} onClick={() => setMode('quick')}>
              إعداد سريع (أسرع طريقة للبدء)
            </Button>
            <Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setMode('wizard')}>
              الإعداد خطوة بخطوة
            </Button>
          </div>
          <p className="muted mt-4 text-xs">
            يمكنك تغيير كل شيء لاحقاً من الإعدادات. لا توجد بيانات وهمية في النسخة الموزّعة.
          </p>
        </div>
      </div>
    )
  }

  if (mode === 'quick') {
    return <QuickSetup onDone={() => setMode('done')} onBack={() => setMode('welcome')} />
  }

  if (mode === 'done') {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="card w-full max-w-lg p-8 text-center">
          <div className="mx-auto mb-3 w-fit rounded-full bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/40">
            <Check className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold">كل شيء جاهز</h1>
          <p className="muted mt-2 text-sm">
            يمكنك الآن تسجيل حصصك اليومية. إن لم تُدخل الجدول الأسبوعي بعد، فسيعرض التطبيق تذكيراً في الصفحة الرئيسية.
          </p>
          <Button variant="primary" className="mt-5" onClick={() => void finish()}>
            ابدأ استخدام دفتر الأستاذ
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Wizard
      step={step}
      setStep={setStep}
      onFinish={() => setMode('done')}
      onBack={() => setMode('welcome')}
      onChanged={reloadMaster}
      notify={toast}
    />
  )
}

/* ------------------------------------------------------------------ */
/* الإعداد السريع                                                      */
/* ------------------------------------------------------------------ */
function QuickSetup({ onDone, onBack }: { onDone: () => void; onBack: () => void }): JSX.Element {
  const reloadMaster = useApp((state) => state.reloadMaster)
  const toast = useApp((state) => state.toast)
  const [busy, setBusy] = useState(false)
  const [teacher, setTeacher] = useState({ full_name: '', subject_label: DEFAULT_SUBJECT, phone: '' })
  const [school, setSchool] = useState({ name: '', wilaya: '', municipality: '' })
  const [year, setYear] = useState(() => {
    const current = new Date().getFullYear()
    return { label: DEFAULT_ACADEMIC_YEAR, start_date: `${current}-09-01`, end_date: `${current + 1}-06-30` }
  })
  const [classNames, setClassNames] = useState('2 متوسط 1\n2 متوسط 2')

  const run = async (): Promise<void> => {
    if (!teacher.full_name.trim()) {
      toast('اسم الأستاذ مطلوب', 'warning')
      return
    }
    if (!school.name.trim()) {
      toast('اسم المؤسسة مطلوب', 'warning')
      return
    }
    const names = classNames
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (names.length === 0) {
      toast('أضف قسماً واحداً على الأقل', 'warning')
      return
    }

    setBusy(true)
    try {
      const subject = await window.api.subjects.create({
        name: teacher.subject_label.trim() || DEFAULT_SUBJECT,
        code: null,
        notes: null,
        is_active: 1,
        sort_order: 0
      })
      await window.api.teacher.save({
        full_name: teacher.full_name.trim(),
        subject_label: teacher.subject_label.trim(),
        phone: teacher.phone.trim() || null,
        email: null,
        notes: null
      })
      await window.api.school.save({
        name: school.name.trim(),
        stage: 'التعليم المتوسط',
        wilaya: school.wilaya.trim() || null,
        municipality: school.municipality.trim() || null,
        logo_path: null
      })
      const createdYear = await window.api.years.create(year)
      await window.api.years.activate({ id: createdYear.id })

      for (const [index, name] of names.entries()) {
        await window.api.classes.create({
          academic_year_id: createdYear.id,
          name,
          level_id: null,
          stream: null,
          subject_id: subject.id,
          notes: null,
          sort_order: index
        })
      }

      await window.api.settings.setMany({
        quick_setup_classes: String(names.length),
        setup_mode: 'quick'
      })

      await reloadMaster()
      toast(`تم إنشاء ${names.length} قسم — أضف التلاميذ والجدول من الشاشات المخصّصة`)
      onDone()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'تعذّر إكمال الإعداد السريع', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto p-6">
      <div className="card w-full max-w-3xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-700 dark:text-brand-200" />
            <h1 className="text-lg font-bold">الإعداد السريع</h1>
          </div>
          <Button size="sm" variant="ghost" onClick={onBack}>
            رجوع
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-lg border p-4">
            <div className="section-title">
              <User className="h-4 w-4" /> الأستاذ
            </div>
            <Field label="الاسم واللقب" required>
              <Input value={teacher.full_name} onChange={(event) => setTeacher({ ...teacher, full_name: event.target.value })} />
            </Field>
            <Field label="المادة">
              <Input value={teacher.subject_label} onChange={(event) => setTeacher({ ...teacher, subject_label: event.target.value })} />
            </Field>
            <Field label="الهاتف (اختياري)">
              <Input value={teacher.phone} onChange={(event) => setTeacher({ ...teacher, phone: event.target.value })} />
            </Field>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div className="section-title">
              <Building2 className="h-4 w-4" /> المؤسسة
            </div>
            <Field label="اسم المؤسسة" required>
              <Input value={school.name} onChange={(event) => setSchool({ ...school, name: event.target.value })} placeholder="متوسطة …" />
            </Field>
            <Field label="الولاية">
              <Input value={school.wilaya} onChange={(event) => setSchool({ ...school, wilaya: event.target.value })} />
            </Field>
            <Field label="البلدية">
              <Input value={school.municipality} onChange={(event) => setSchool({ ...school, municipality: event.target.value })} />
            </Field>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div className="section-title">
              <CalendarRange className="h-4 w-4" /> السنة الدراسية
            </div>
            <Field label="العنوان" required>
              <Input value={year.label} onChange={(event) => setYear({ ...year, label: event.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="من">
                <Input type="date" value={year.start_date} onChange={(event) => setYear({ ...year, start_date: event.target.value })} />
              </Field>
              <Field label="إلى">
                <Input type="date" value={year.end_date} onChange={(event) => setYear({ ...year, end_date: event.target.value })} />
              </Field>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div className="section-title">
              <GraduationCap className="h-4 w-4" /> الأقسام المسندة
            </div>
            <Field label="قسم واحد في كل سطر" required>
              <Textarea
                className="min-h-[110px]"
                value={classNames}
                onChange={(event) => setClassNames(event.target.value)}
                placeholder={'2 متوسط 1\n2 متوسط 2\n3 متوسط 1'}
              />
            </Field>
            <p className="muted text-xs leading-relaxed">
              التلاميذ والجدول الأسبوعي يُضافان من شاشاتهما بعد الإعداد: «التلاميذ» (إضافة فردية أو استيراد Excel/CSV) و
              «الجدول الأسبوعي». لا يُدرج التطبيق أي بيانات تجريبية في النسخة الموزّعة.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="muted text-xs">
            سيُنشئ التطبيق: مادة، أستاذاً، مؤسسة، سنة دراسية، والأقسام المذكورة. التلاميذ والجدول تُضاف من الشاشات الخاصة.
          </p>
          <Button variant="primary" loading={busy} icon={<Check className="h-4 w-4" />} onClick={() => void run()}>
            إنشاء الإعداد الأساسي
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* الخطوة بخطوة                                                        */
/* ------------------------------------------------------------------ */
function Wizard({
  step,
  setStep,
  onFinish,
  onBack,
  onChanged,
  notify
}: {
  step: number
  setStep: (step: number) => void
  onFinish: () => void
  onBack: () => void
  onChanged: () => Promise<void>
  notify: (message: string, kind?: 'success' | 'error' | 'info' | 'warning') => void
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const levels = useApp((state) => state.levels)
  const [teacher, setTeacher] = useState({ full_name: '', subject_label: DEFAULT_SUBJECT, phone: '' })
  const [school, setSchool] = useState({ name: '', wilaya: '', municipality: '' })
  const [subjectName, setSubjectName] = useState(DEFAULT_SUBJECT)
  const [year, setYear] = useState(() => {
    const current = new Date().getFullYear()
    return { label: DEFAULT_ACADEMIC_YEAR, start_date: `${current}-09-01`, end_date: `${current + 1}-06-30` }
  })
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [newClass, setNewClass] = useState({ name: '', level_id: null as number | null })
  const [imported, setImported] = useState(0)
  const [slots, setSlots] = useState(0)
  const [slotForm, setSlotForm] = useState({ day_of_week: 0, start_time: '08:00', end_time: '09:00', class_id: null as number | null })

  const submitStep = async (): Promise<void> => {
    setBusy(true)
    try {
      if (step === 1) {
        if (!teacher.full_name.trim()) {
          notify('اسم الأستاذ مطلوب', 'warning')
          return
        }
        await window.api.teacher.save({
          full_name: teacher.full_name.trim(),
          subject_label: teacher.subject_label.trim(),
          phone: teacher.phone.trim() || null,
          email: null,
          notes: null
        })
      } else if (step === 2) {
        if (!school.name.trim()) {
          notify('اسم المؤسسة مطلوب', 'warning')
          return
        }
        await window.api.school.save({
          name: school.name.trim(),
          stage: 'التعليم المتوسط',
          wilaya: school.wilaya.trim() || null,
          municipality: school.municipality.trim() || null,
          logo_path: null
        })
      } else if (step === 3) {
        if (!subjectName.trim()) {
          notify('اسم المادة مطلوب', 'warning')
          return
        }
        await window.api.subjects.create({
          name: subjectName.trim(),
          code: null,
          notes: null,
          is_active: 1,
          sort_order: 0
        })
      } else if (step === 4) {
        const created = await window.api.years.create(year)
        await window.api.years.activate({ id: created.id })
      } else if (step === 5) {
        if (classes.length === 0) {
          notify('أضف قسماً واحداً على الأقل', 'warning')
          return
        }
      }
      await onChanged()
      setStep(step + 1)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'تعذر تنفيذ الخطوة', 'error')
    } finally {
      setBusy(false)
    }
  }

  const addClass = async (): Promise<void> => {
    if (!newClass.name.trim()) return
    setBusy(true)
    try {
      const subjectList = await window.api.subjects.list()
      const activeYear = (await window.api.years.list()).find((row) => row.is_active === 1)
      if (!activeYear) {
        notify('أنشئ السنة الدراسية أولاً', 'warning')
        return
      }
      const created = await window.api.classes.create({
        academic_year_id: activeYear.id,
        name: newClass.name.trim(),
        level_id: newClass.level_id,
        stream: null,
        subject_id: subjectList[0]?.id ?? null,
        notes: null,
        sort_order: classes.length
      })
      setClasses((current) => [...current, created])
      setNewClass({ name: '', level_id: newClass.level_id })
      await onChanged()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'تعذر إضافة القسم', 'error')
    } finally {
      setBusy(false)
    }
  }

  const importStudents = async (): Promise<void> => {
    const path = await window.api.dialogs.pickFile({ title: 'اختيار ملف التلاميذ', filters: ['csv', 'xlsx', 'xls'] })
    if (!path) return
    setBusy(true)
    try {
      const years = await window.api.years.list()
      const activeYear = years.find((row) => row.is_active === 1)
      if (!activeYear) {
        notify('أنشئ السنة الدراسية أولاً', 'warning')
        return
      }
      const parsed = await window.api.students.importFile({
        academic_year_id: activeYear.id,
        class_id: classes[0]?.id ?? null,
        file_path: path,
        skipDuplicates: true
      })
      const find = (candidates: string[]): number =>
        parsed.headers.findIndex((header) => candidates.some((candidate) => header.trim().toLowerCase().includes(candidate)))
      const first = find(['الاسم', 'first', 'prénom', 'prenom'])
      const last = find(['اللقب', 'last', 'nom'])
      const number = find(['الرقم', 'رقم', 'number'])
      const rows = parsed.rows
        .map((row) => ({
          first_name: (row[first] ?? '').trim(),
          last_name: (row[last] ?? '').trim(),
          number: number >= 0 ? Number(String(row[number] ?? '').replace(/[^\d]/g, '')) || null : null,
          gender: null
        }))
        .filter((row) => row.first_name && row.last_name)
      if (rows.length === 0) {
        notify('لم يتم التعرف على أعمدة الاسم واللقب في الملف', 'error')
        return
      }
      const result = await window.api.students.importRows({
        academic_year_id: activeYear.id,
        class_id: classes[0]?.id ?? null,
        skipDuplicates: true,
        createMissingClasses: true,
        rows
      })
      setImported(result.inserted)
      notify(`تم استيراد ${result.inserted} تلميذ`)
      await onChanged()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'تعذر استيراد الملف', 'error')
    } finally {
      setBusy(false)
    }
  }

  const addSlot = async (): Promise<void> => {
    const activeYear = (await window.api.years.list()).find((row) => row.is_active === 1)
    if (!activeYear || !slotForm.class_id) {
      notify('اختر القسم أولاً', 'warning')
      return
    }
    setBusy(true)
    try {
      await window.api.schedule.create({
        academic_year_id: activeYear.id,
        day_of_week: slotForm.day_of_week,
        start_time: slotForm.start_time,
        end_time: slotForm.end_time,
        class_id: slotForm.class_id,
        subject_id: null,
        session_type: 'درس',
        room: null,
        notes: null,
        allowConflict: true
      })
      setSlots((current) => current + 1)
      await onChanged()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'تعذر إضافة الحصة', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto p-6">
      <div className="card w-full max-w-3xl p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-bold">إعداد دفتر الأستاذ — الخطوة {step} من 7</h1>
          <Button size="sm" variant="ghost" onClick={onBack}>
            رجوع للبداية
          </Button>
        </div>

        <div className="mb-5 flex flex-wrap gap-1.5">
          {STEP_LABELS.map((label, index) => (
            <span
              key={label}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                index + 1 === step
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : index + 1 < step
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40'
                    : 'opacity-60'
              }`}
            >
              {index + 1 < step && <Check className="mb-0.5 mr-1 inline h-3 w-3" />}
              {label}
            </span>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <Field label="الاسم واللقب" required>
              <Input autoFocus value={teacher.full_name} onChange={(event) => setTeacher({ ...teacher, full_name: event.target.value })} />
            </Field>
            <Field label="المادة المسندة">
              <Input value={teacher.subject_label} onChange={(event) => setTeacher({ ...teacher, subject_label: event.target.value })} />
            </Field>
            <Field label="الهاتف (اختياري)">
              <Input value={teacher.phone} onChange={(event) => setTeacher({ ...teacher, phone: event.target.value })} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Field label="اسم المؤسسة" required>
              <Input autoFocus value={school.name} onChange={(event) => setSchool({ ...school, name: event.target.value })} placeholder="متوسطة …" />
            </Field>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="الطور">
                <Input value="التعليم المتوسط" disabled />
              </Field>
              <Field label="الولاية">
                <Input value={school.wilaya} onChange={(event) => setSchool({ ...school, wilaya: event.target.value })} />
              </Field>
              <Field label="البلدية">
                <Input value={school.municipality} onChange={(event) => setSchool({ ...school, municipality: event.target.value })} />
              </Field>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <Field label="اسم المادة" required hint="يمكنك إضافة مواد أخرى لاحقاً من الإعدادات.">
              <Input autoFocus value={subjectName} onChange={(event) => setSubjectName(event.target.value)} />
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <Field label="عنوان السنة الدراسية" required>
              <Input value={year.label} onChange={(event) => setYear({ ...year, label: event.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="تاريخ البداية">
                <Input type="date" value={year.start_date} onChange={(event) => setYear({ ...year, start_date: event.target.value })} />
              </Field>
              <Field label="تاريخ النهاية">
                <Input type="date" value={year.end_date} onChange={(event) => setYear({ ...year, end_date: event.target.value })} />
              </Field>
            </div>
            <p className="muted text-xs">كل سنة دراسية لها بياناتها المستقلة، ويمكن أرشفتها والرجوع إليها لاحقاً.</p>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="اسم القسم" className="md:col-span-1">
                <Input
                  value={newClass.name}
                  onChange={(event) => setNewClass({ ...newClass, name: event.target.value })}
                  placeholder="2 متوسط 1"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void addClass()
                  }}
                />
              </Field>
              <Field label="المستوى" className="md:col-span-1">
                <Select
                  value={newClass.level_id ?? ''}
                  onChange={(event) => setNewClass({ ...newClass, level_id: event.target.value ? Number(event.target.value) : null })}
                >
                  <option value="">— بدون مستوى —</option>
                  {levels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end">
                <Button variant="primary" icon={<Layers className="h-4 w-4" />} loading={busy} onClick={() => void addClass()}>
                  إضافة قسم
                </Button>
              </div>
            </div>

            {classes.length === 0 ? (
              <p className="muted rounded-md border border-dashed p-4 text-center text-sm">لم تُضف أي قسم بعد.</p>
            ) : (
              <ul className="space-y-1">
                {classes.map((row) => (
                  <li key={row.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                    <span className="font-medium">{row.name}</span>
                    <Badge tone="success">تمت الإضافة</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 6 && (
          <div className="space-y-3">
            <p className="muted text-sm">
              استورد قائمة تلاميذ القسم الأول من ملف CSV أو XLSX. يتم التعرف تلقائياً على أعمدة الاسم واللقب والرقم. يمكنك
              توزيع التلاميذ على الأقسام لاحقاً من صفحة «التلاميذ».
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" icon={<Upload className="h-4 w-4" />} loading={busy} onClick={() => void importStudents()}>
                اختيار ملف واستيراد
              </Button>
              {imported > 0 && <Badge tone="success">تم استيراد {imported} تلميذ</Badge>}
              <Button variant="ghost" onClick={() => setStep(7)}>
                تخطي هذه الخطوة
              </Button>
            </div>
            {classes[0] && (
              <p className="muted text-xs">القسم المستهدف حالياً: {classes[0].name}</p>
            )}
          </div>
        )}

        {step === 7 && (
          <div className="space-y-3">
            <p className="muted text-sm">
              أدخل حصصك هنا أو أكمل الجدول كاملاً بعد الإعداد من صفحة «الجدول الأسبوعي» (يدعم السحب والإفلات والنسخ).
            </p>
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="اليوم">
                <Select value={slotForm.day_of_week} onChange={(event) => setSlotForm({ ...slotForm, day_of_week: Number(event.target.value) })}>
                  {[
                    { value: 0, label: 'الأحد' },
                    { value: 1, label: 'الإثنين' },
                    { value: 2, label: 'الثلاثاء' },
                    { value: 3, label: 'الأربعاء' },
                    { value: 4, label: 'الخميس' }
                  ].map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="من">
                <Select value={slotForm.start_time} onChange={(event) => setSlotForm({ ...slotForm, start_time: event.target.value })}>
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot.start} value={slot.start}>
                      {slot.start}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="إلى">
                <Select value={slotForm.end_time} onChange={(event) => setSlotForm({ ...slotForm, end_time: event.target.value })}>
                  {/* كل توقيتات البداية + نهاية آخر فترة — يسمح بحصص الساعة أو ساعتين */}
                  {[...TIME_SLOTS.map((slot) => slot.start), TIME_SLOTS[TIME_SLOTS.length - 1].end]
                    .filter((time) => time > slotForm.start_time)
                    .map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="القسم">
                <Select value={slotForm.class_id ?? ''} onChange={(event) => setSlotForm({ ...slotForm, class_id: event.target.value ? Number(event.target.value) : null })}>
                  <option value="">— اختر —</option>
                  {classes.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button icon={<CalendarDays className="h-4 w-4" />} loading={busy} onClick={() => void addSlot()}>
                إضافة حصة
              </Button>
              {slots > 0 && <Badge tone="success">أُضيفت {slots} حصة</Badge>}
              <Button variant="ghost" onClick={() => void onChanged().then(() => notify('يمكنك إكمال الجدول من صفحته', 'info'))}>
                إكمال الجدول لاحقاً
              </Button>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button icon={<ArrowRight className="h-4 w-4" />} onClick={() => setStep(step - 1)}>
                السابق
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step < 7 ? (
              <Button variant="primary" icon={<ArrowLeft className="h-4 w-4" />} loading={busy} onClick={() => void submitStep()}>
                التالي
              </Button>
            ) : (
              <Button variant="primary" icon={<Users className="h-4 w-4" />} onClick={onFinish}>
                إنهاء الإعداد
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
