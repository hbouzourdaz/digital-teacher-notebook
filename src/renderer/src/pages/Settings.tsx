import { useEffect, useState } from 'react'
import {
  BookOpen,
  Building2,
  CalendarRange,
  Calculator,
  Copy,
  Database,
  GraduationCap,
  KeyRound,
  Layers,
  ListOrdered,
  Palette,
  Plus,
  Printer,
  Save,
  School,
  ShieldCheck,
  Trash2,
  Wrench
} from 'lucide-react'
import type { AcademicYear, GradeFormula, Level, School as SchoolRow, Subject, Teacher } from '@shared/types'
import {
  DEFAULT_ACADEMIC_YEAR,
  FORMULA_COMPONENT_LABELS,
  SETTING_KEYS,
  UI_SCALES,
  type UiScale
} from '@shared/constants'
import { describeFormula, parseFormulaComponents, type FormulaComponent } from '@shared/utils/grades'
import { useApp } from '../store/app'
import { useAsync } from '../hooks/useAsync'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatCard,
  Tabs,
  Textarea,
  type Column
} from '../components/ui'

type SettingsTab =
  | 'general'
  | 'teacher'
  | 'school'
  | 'subjects'
  | 'levels'
  | 'years'
  | 'formula'
  | 'printing'
  | 'security'
  | 'advanced'

export default function SettingsPage(): JSX.Element {
  const [tab, setTab] = useState<SettingsTab>('general')

  return (
    <div>
      <PageHeader title="الإعدادات" subtitle="بيانات الأستاذ والمؤسسة، السنة الدراسية، صيغة النقاط، الطباعة والنسخ الاحتياطي" />
      <Tabs<SettingsTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'general', label: 'عام' },
          { value: 'teacher', label: 'الأستاذ' },
          { value: 'school', label: 'المؤسسة' },
          { value: 'years', label: 'السنوات الدراسية' },
          { value: 'subjects', label: 'المواد' },
          { value: 'levels', label: 'المستويات' },
          { value: 'formula', label: 'صيغة النقاط' },
          { value: 'printing', label: 'الطباعة' },
          { value: 'security', label: 'الأمان' },
          { value: 'advanced', label: 'متقدم' }
        ]}
      />

      {tab === 'general' && <GeneralSettings />}
      {tab === 'teacher' && <TeacherSettings />}
      {tab === 'school' && <SchoolSettings />}
      {tab === 'years' && <YearsSettings />}
      {tab === 'subjects' && <SubjectsSettings />}
      {tab === 'levels' && <LevelsSettings />}
      {tab === 'formula' && <FormulaSettings />}
      {tab === 'printing' && <PrintingSettings />}
      {tab === 'security' && <SecuritySettings />}
      {tab === 'advanced' && <AdvancedSettings />}
    </div>
  )
}

/* ------------------------------- عام ---------------------------------- */
function GeneralSettings(): JSX.Element {
  const theme = useApp((state) => state.theme)
  const setTheme = useApp((state) => state.setTheme)
  const uiScale = useApp((state) => state.uiScale)
  const setUiScale = useApp((state) => state.setUiScale)
  const settings = useApp((state) => state.settings)
  const run = useApp((state) => state.run)
  const reloadMaster = useApp((state) => state.reloadMaster)
  const [notifications, setNotifications] = useState(settings[SETTING_KEYS.notificationsEnabled] !== '0')
  const [lead, setLead] = useState(Number(settings[SETTING_KEYS.notificationsLeadMinutes] ?? 15))

  return (
    <div className="card card-pad max-w-2xl space-y-4">
      <Field label="مظهر الواجهة">
        <div className="flex gap-2">
          <Button variant={theme === 'light' ? 'primary' : 'secondary'} onClick={() => void setTheme('light')}>
            نهاري
          </Button>
          <Button variant={theme === 'dark' ? 'primary' : 'secondary'} onClick={() => void setTheme('dark')}>
            ليلي
          </Button>
        </div>
      </Field>

      <Field
        label="كثافة العرض"
        hint="اختر «مضغوط» لعرض أقصى محتوى دون شريط تمرير، أو «كبير» لأوضح قراءة — يعمل فوراً على كل الشاشات"
      >
        <div className="flex flex-wrap gap-2">
          {UI_SCALES.map((item) => (
            <Button
              key={item.value}
              variant={uiScale === item.value ? 'primary' : 'secondary'}
              onClick={() => void setUiScale(item.value as UiScale)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </Field>

      <Field label="الدليل والمساعدة" hint="شرح كامل للتطبيق من الصفر: التثبيت، الإعداد، التنقيط، الطباعة، والأسئلة المتكررة">
        <Button icon={<BookOpen className="h-4 w-4" />} onClick={() => void run(() => window.api.help.open(), 'تم فتح دليل الاستخدام')}>
          فتح دليل الاستخدام الكامل
        </Button>
      </Field>

      <div className="rounded-md border p-3">
        <Checkbox
          checked={notifications}
          onChange={(value) => {
            setNotifications(value)
            void run(() => window.api.settings.set({ key: SETTING_KEYS.notificationsEnabled, value: value ? '1' : '0' })).then(
              () => void reloadMaster()
            )
          }}
          label="تنبيه محلي قبل الحصة القادمة (داخل التطبيق فقط، دون أي إشعار نظام)"
        />
        <div className="mt-3">
          <Field label="قبل الحصة بـ (دقائق)">
            <Select
              value={lead}
              onChange={(event) => {
                const value = Number(event.target.value)
                setLead(value)
                void run(() =>
                  window.api.settings.set({ key: SETTING_KEYS.notificationsLeadMinutes, value: String(value) })
                ).then(() => void reloadMaster())
              }}
            >
              {[5, 10, 15, 20, 30].map((value) => (
                <option key={value} value={value}>
                  {value} دقيقة
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <p className="muted text-xs leading-relaxed">
        واجهة التطبيق عربية بالكامل من اليمين إلى اليسار. الخطوط محلية: خط الواجهة Tajawal (إن وُجد) وخط الوثائق Amiri،
        وفي حال غيابها يستعمل النظام خطوطاً عربية بديلة. لا يوجد أي اتصال بالإنترنت في أي وظيفة من وظائف التطبيق.
      </p>
    </div>
  )
}

/* ------------------------------ الأستاذ -------------------------------- */
function TeacherSettings(): JSX.Element {
  const teacher = useApp((state) => state.teacher)
  const run = useApp((state) => state.run)
  const reloadMaster = useApp((state) => state.reloadMaster)
  const [form, setForm] = useState<Teacher | null>(teacher)

  useEffect(() => setForm(teacher), [teacher])

  return (
    <div className="card card-pad max-w-2xl space-y-3">
      <Field label="الاسم واللقب" required>
        <Input value={form?.full_name ?? ''} onChange={(event) => setForm((current) => ({ ...(current as Teacher), full_name: event.target.value }))} />
      </Field>
      <Field label="المادة المسندة">
        <Input
          value={form?.subject_label ?? ''}
          onChange={(event) => setForm((current) => ({ ...(current as Teacher), subject_label: event.target.value }))}
          placeholder="مثال: العلوم الفيزيائية والتكنولوجيا"
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="الهاتف">
          <Input value={form?.phone ?? ''} onChange={(event) => setForm((current) => ({ ...(current as Teacher), phone: event.target.value }))} />
        </Field>
        <Field label="البريد الإلكتروني">
          <Input value={form?.email ?? ''} onChange={(event) => setForm((current) => ({ ...(current as Teacher), email: event.target.value }))} />
        </Field>
      </div>
      <Field label="ملاحظات">
        <Textarea value={form?.notes ?? ''} onChange={(event) => setForm((current) => ({ ...(current as Teacher), notes: event.target.value }))} />
      </Field>
      <Button
        variant="primary"
        icon={<Save className="h-4 w-4" />}
        onClick={() => {
          if (!form || !form.full_name.trim()) {
            run(async () => {
              throw new Error('اسم الأستاذ مطلوب')
            })
            return
          }
          void run(
            () =>
              window.api.teacher.save({
                full_name: form.full_name.trim(),
                subject_label: form.subject_label,
                phone: form.phone,
                email: form.email,
                notes: form.notes
              }),
            'تم حفظ بيانات الأستاذ'
          ).then(() => void reloadMaster())
        }}
      >
        حفظ بيانات الأستاذ
      </Button>
    </div>
  )
}

/* ------------------------------ المؤسسة -------------------------------- */
function SchoolSettings(): JSX.Element {
  const school = useApp((state) => state.school)
  const run = useApp((state) => state.run)
  const reloadMaster = useApp((state) => state.reloadMaster)
  const [form, setForm] = useState(school)

  useEffect(() => setForm(school), [school])

  /** تحديث جزئي آمن — يحافظ على نوع School حتى عند غياب السجل بعد. */
  const patch = (changes: Partial<SchoolRow>): void =>
    setForm((current) => ({ ...(current ?? ({} as SchoolRow)), ...changes }))

  return (
    <div className="card card-pad max-w-2xl space-y-3">
      <Field label="اسم المؤسسة" required>
        <Input value={form?.name ?? ''} onChange={(event) => patch({ name: event.target.value })} placeholder="متوسطة …" />
      </Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="الطور">
          <Input value={form?.stage ?? ''} onChange={(event) => patch({ stage: event.target.value })} placeholder="التعليم المتوسط" />
        </Field>
        <Field label="الولاية">
          <Input value={form?.wilaya ?? ''} onChange={(event) => patch({ wilaya: event.target.value })} />
        </Field>
        <Field label="البلدية">
          <Input value={form?.municipality ?? ''} onChange={(event) => patch({ municipality: event.target.value })} />
        </Field>
      </div>
      <Field label="شعار المؤسسة (اختياري)" hint="PNG / JPG / SVG — يُحفظ المسار المحلي فقط ويظهر في رأس الوثائق.">
        <div className="flex gap-2">
          <Input value={form?.logo_path ?? ''} onChange={(event) => patch({ logo_path: event.target.value })} />
          <Button
            icon={<School className="h-4 w-4" />}
            onClick={() =>
              void window.api.dialogs.pickFile({ title: 'اختيار شعار المؤسسة', filters: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }).then((path) => {
                if (path) patch({ logo_path: path })
              })
            }
          >
            اختيار
          </Button>
        </div>
      </Field>
      <Button
        variant="primary"
        icon={<Save className="h-4 w-4" />}
        onClick={() => {
          if (!form || !form.name.trim()) {
            void run(async () => {
              throw new Error('اسم المؤسسة مطلوب')
            })
            return
          }
          void run(
            () =>
              window.api.school.save({
                name: form.name.trim(),
                stage: form.stage,
                wilaya: form.wilaya,
                municipality: form.municipality,
                logo_path: form.logo_path
              }),
            'تم حفظ بيانات المؤسسة'
          ).then(() => void reloadMaster())
        }}
      >
        حفظ بيانات المؤسسة
      </Button>
    </div>
  )
}

/* -------------------------- السنوات الدراسية --------------------------- */
function YearsSettings(): JSX.Element {
  const years = useApp((state) => state.years)
  const activeYear = useApp((state) => state.activeYear)
  const run = useApp((state) => state.run)
  const reloadMaster = useApp((state) => state.reloadMaster)

  const [createOpen, setCreateOpen] = useState(false)
  const [cloneTarget, setCloneTarget] = useState<AcademicYear | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AcademicYear | null>(null)
  const [form, setForm] = useState({ label: DEFAULT_ACADEMIC_YEAR, start_date: '', end_date: '' })
  const [cloneForm, setCloneForm] = useState({ label: '', start_date: '', end_date: '', classes: true, schedule: true, bank: true, plan: true })

  const columns: Array<Column<AcademicYear>> = [
    {
      key: 'label',
      header: 'السنة',
      sticky: true,
      render: (row) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{row.label}</span>
          {row.is_active === 1 && <Badge tone="success">الحالية</Badge>}
          {row.is_archived === 1 && <Badge tone="warning">مؤرشفة</Badge>}
        </span>
      )
    },
    { key: 'start', header: 'من', align: 'center', width: '8rem', render: (row) => row.start_date },
    { key: 'end', header: 'إلى', align: 'center', width: '8rem', render: (row) => row.end_date },
    {
      key: 'actions',
      header: 'إجراءات',
      align: 'center',
      width: '20rem',
      render: (row) => (
        <span className="flex flex-wrap justify-center gap-1">
          {row.is_active === 0 && (
            <Button size="sm" onClick={() => void run(() => window.api.years.activate({ id: row.id }), 'تم تفعيل السنة').then(() => void reloadMaster())}>
              تفعيل
            </Button>
          )}
          <Button
            size="sm"
            icon={<Copy className="h-3.5 w-3.5" />}
            onClick={() => {
              setCloneTarget(row)
              setCloneForm({
                label: `${Number(row.label.slice(0, 4)) + 1} - ${Number(row.label.slice(0, 4)) + 2}`,
                start_date: row.start_date,
                end_date: row.end_date,
                classes: true,
                schedule: true,
                bank: true,
                plan: true
              })
            }}
          >
            نسخ بياناتها
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void run(() => window.api.years.archive({ id: row.id, archived: row.is_archived === 0 })).then(() => void reloadMaster())
            }
          >
            {row.is_archived === 1 ? 'إلغاء الأرشفة' : 'أرشفة'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(row)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </span>
      )
    }
  ]

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <CalendarRange className="h-4 w-4" />
          السنة الحالية: <strong>{activeYear?.label ?? 'لا توجد'}</strong>
        </div>
        <Button
          variant="primary"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => {
            const year = new Date().getFullYear()
            setForm({ label: `${year} - ${year + 1}`, start_date: `${year}-09-01`, end_date: `${year + 1}-06-30` })
            setCreateOpen(true)
          }}
        >
          إضافة سنة دراسية
        </Button>
      </div>

      <DataTable columns={columns} rows={years} rowKey={(row) => row.id} emptyMessage="لا توجد سنوات دراسية." />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        size="sm"
        title="إضافة سنة دراسية"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>إلغاء</Button>
            <Button
              variant="primary"
              onClick={() => {
                setCreateOpen(false)
                void run(() => window.api.years.create(form), 'تم إنشاء السنة الدراسية').then(() => void reloadMaster())
              }}
            >
              إنشاء
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="العنوان" required>
            <Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="تاريخ البداية">
              <Input type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
            </Field>
            <Field label="تاريخ النهاية">
              <Input type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
            </Field>
          </div>
          <p className="muted text-xs">تُنشأ السنة فارغة مع تصنيفات التقييم وصيغة معدل افتراضية قابلة للتعديل.</p>
        </div>
      </Modal>

      <Modal
        open={cloneTarget !== null}
        onClose={() => setCloneTarget(null)}
        size="sm"
        title={`نسخ بيانات «${cloneTarget?.label ?? ''}» إلى سنة جديدة`}
        footer={
          <>
            <Button onClick={() => setCloneTarget(null)}>إلغاء</Button>
            <Button
              variant="primary"
              onClick={() => {
                const source = cloneTarget
                setCloneTarget(null)
                if (!source) return
                void run(
                  () =>
                    window.api.years.clone({
                      id: source.id,
                      label: cloneForm.label,
                      start_date: cloneForm.start_date,
                      end_date: cloneForm.end_date,
                      copy: { classes: cloneForm.classes, schedule: cloneForm.schedule, bank: cloneForm.bank, plan: cloneForm.plan, settings: true }
                    }),
                  'تم إنشاء السنة الجديدة مع البيانات المختارة'
                ).then(() => void reloadMaster())
              }}
            >
              إنشاء السنة الجديدة
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="عنوان السنة الجديدة" required>
            <Input value={cloneForm.label} onChange={(event) => setCloneForm({ ...cloneForm, label: event.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="من">
              <Input type="date" value={cloneForm.start_date} onChange={(event) => setCloneForm({ ...cloneForm, start_date: event.target.value })} />
            </Field>
            <Field label="إلى">
              <Input type="date" value={cloneForm.end_date} onChange={(event) => setCloneForm({ ...cloneForm, end_date: event.target.value })} />
            </Field>
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <Checkbox checked={cloneForm.classes} onChange={(value) => setCloneForm({ ...cloneForm, classes: value })} label="نسخ الأقسام (بدون التلاميذ)" />
            <Checkbox checked={cloneForm.schedule} onChange={(value) => setCloneForm({ ...cloneForm, schedule: value })} label="نسخ الجدول الأسبوعي" />
            <Checkbox checked={cloneForm.bank} onChange={(value) => setCloneForm({ ...cloneForm, bank: value })} label="نسخ بنك الدروس" />
            <Checkbox checked={cloneForm.plan} onChange={(value) => setCloneForm({ ...cloneForm, plan: value })} label="نسخ التوزيع السنوي (بدون تواريخ الإنجاز)" />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="حذف سنة دراسية"
        message={`سيتم حذف السنة «${deleteTarget?.label ?? ''}» مع كل أقسامها وتلاميذها وحصصها وتقييماتها.`}
        detail="لا يمكن التراجع. إن أردت الاحتفاظ بها للبحث والطباعة استعمل «أرشفة» بدلاً من الحذف."
        confirmLabel="حذف نهائي"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget
          setDeleteTarget(null)
          if (!target) return
          void run(() => window.api.years.remove({ id: target.id }), 'تم حذف السنة الدراسية').then(() => void reloadMaster())
        }}
      />
    </div>
  )
}

/* ------------------------------- المواد -------------------------------- */
function SubjectsSettings(): JSX.Element {
  const subjects = useApp((state) => state.subjects)
  const run = useApp((state) => state.run)
  const reloadMaster = useApp((state) => state.reloadMaster)
  const [form, setForm] = useState<{ id: number | null; name: string; code: string } | null>(null)

  const columns: Array<Column<Subject>> = [
    { key: 'name', header: 'المادة', sticky: true, render: (row) => <span className="font-medium">{row.name}</span> },
    { key: 'code', header: 'الرمز', align: 'center', width: '8rem', render: (row) => row.code ?? '—' },
    {
      key: 'active',
      header: 'الحالة',
      align: 'center',
      width: '7rem',
      render: (row) => <Badge tone={row.is_active === 1 ? 'success' : 'neutral'}>{row.is_active === 1 ? 'مفعّلة' : 'معطّلة'}</Badge>
    },
    {
      key: 'actions',
      header: 'إجراءات',
      align: 'center',
      width: '10rem',
      render: (row) => (
        <span className="flex justify-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setForm({ id: row.id, name: row.name, code: row.code ?? '' })}>
            تعديل
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void run(
                () =>
                  window.api.subjects.update({
                    id: row.id,
                    name: row.name,
                    code: row.code,
                    notes: row.notes,
                    is_active: row.is_active === 1 ? 0 : 1,
                    sort_order: row.sort_order
                  }),
                row.is_active === 1 ? 'تم تعطيل المادة' : 'تم تفعيل المادة'
              ).then(() => void reloadMaster())
            }
          >
            {row.is_active === 1 ? 'تعطيل' : 'تفعيل'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void run(() => window.api.subjects.remove({ id: row.id }), 'تم حذف المادة').then(() => void reloadMaster())}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </span>
      )
    }
  ]

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="muted text-sm">المادة ليست ثابتة في التطبيق — أضف كل المواد التي تدرّسها.</p>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ id: null, name: '', code: '' })}>
          إضافة مادة
        </Button>
      </div>
      <DataTable columns={columns} rows={subjects} rowKey={(row) => row.id} emptyMessage="لا توجد مواد." />

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        size="sm"
        title={form?.id ? 'تعديل مادة' : 'إضافة مادة'}
        footer={
          <>
            <Button onClick={() => setForm(null)}>إلغاء</Button>
            <Button
              variant="primary"
              onClick={() => {
                const target = form
                setForm(null)
                if (!target || !target.name.trim()) return
                void run(
                  () =>
                    target.id
                      ? window.api.subjects.update({ id: target.id, name: target.name.trim(), code: target.code || null, notes: null, is_active: 1, sort_order: 0 })
                      : window.api.subjects.create({ name: target.name.trim(), code: target.code || null, notes: null, is_active: 1, sort_order: 0 }),
                  'تم حفظ المادة'
                ).then(() => void reloadMaster())
              }}
            >
              حفظ
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="اسم المادة" required>
            <Input value={form?.name ?? ''} onChange={(event) => setForm((state) => ({ ...(state as { id: number | null; name: string; code: string }), name: event.target.value }))} />
          </Field>
          <Field label="الرمز (اختياري)">
            <Input value={form?.code ?? ''} onChange={(event) => setForm((current) => ({ ...(current as { id: number | null; name: string; code: string }), code: event.target.value }))} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

/* ----------------------------- المستويات ------------------------------- */
function LevelsSettings(): JSX.Element {
  const levels = useApp((state) => state.levels)
  const run = useApp((state) => state.run)
  const reloadMaster = useApp((state) => state.reloadMaster)
  const [form, setForm] = useState<{ id: number | null; name: string; order_index: number } | null>(null)

  const columns: Array<Column<Level>> = [
    { key: 'name', header: 'المستوى', sticky: true, render: (row) => <span className="flex items-center gap-2"><Layers className="h-3.5 w-3.5" />{row.name}</span> },
    { key: 'order', header: 'الترتيب', align: 'center', width: '7rem', render: (row) => row.order_index },
    {
      key: 'actions',
      header: 'إجراءات',
      align: 'center',
      width: '14rem',
      render: (row) => (
        <span className="flex justify-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setForm({ id: row.id, name: row.name, order_index: row.order_index })}>
            تعديل
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void run(() => window.api.levels.remove({ id: row.id }), 'تم حذف المستوى').then(() => void reloadMaster())}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </span>
      )
    }
  ]

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="muted text-sm">المستويات قابلة للتخصيص (السنة الأولى … الرابعة أو غيرها).</p>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ id: null, name: '', order_index: levels.length })}>
          إضافة مستوى
        </Button>
      </div>
      <DataTable columns={columns} rows={levels} rowKey={(row) => row.id} emptyMessage="لا توجد مستويات." />

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        size="sm"
        title={form?.id ? 'تعديل مستوى' : 'إضافة مستوى'}
        footer={
          <>
            <Button onClick={() => setForm(null)}>إلغاء</Button>
            <Button
              variant="primary"
              onClick={() => {
                const target = form
                setForm(null)
                if (!target || !target.name.trim()) return
                void run(
                  () =>
                    target.id
                      ? window.api.levels.update({ id: target.id, name: target.name.trim(), order_index: target.order_index })
                      : window.api.levels.create({ name: target.name.trim(), order_index: target.order_index }),
                  'تم حفظ المستوى'
                ).then(() => void reloadMaster())
              }}
            >
              حفظ
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="اسم المستوى" required>
            <Input value={form?.name ?? ''} onChange={(event) => setForm((current) => ({ ...(current as { id: number | null; name: string; order_index: number }), name: event.target.value }))} />
          </Field>
          <Field label="الترتيب">
            <Input
              type="number"
              min={0}
              value={form?.order_index ?? 0}
              onChange={(event) => setForm((current) => ({ ...(current as { id: number | null; name: string; order_index: number }), order_index: Number(event.target.value || 0) }))}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

/* --------------------------- صيغة النقاط ------------------------------- */
function FormulaSettings(): JSX.Element {
  const run = useApp((state) => state.run)
  const toast = useApp((state) => state.toast)
  const activeYear = useApp((state) => state.activeYear)
  const [components, setComponents] = useState<FormulaComponent[]>([])
  const [rounding, setRounding] = useState(2)
  const [name, setName] = useState('صيغة المستخدم')

  const formula = useAsync<GradeFormula>(
    () => window.api.formulas.get({}),
    [activeYear?.id],
    { id: 0, academic_year_id: null, name: '', components: '[]', rounding: 2, is_active: 1, updated_at: '' }
  )

  useEffect(() => {
    if (!formula.data.id) return
    const parsed = parseFormulaComponents(formula.data.components)
    if (parsed.length > 0) setComponents(parsed)
    setRounding(formula.data.rounding)
    setName(formula.data.name)
  }, [formula.data])

  const update = (key: string, patch: Partial<FormulaComponent>): void =>
    setComponents((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)))

  const enabledTotal = components.filter((item) => item.enabled && item.weight > 0).reduce((sum, item) => sum + item.weight, 0)

  return (
    <div className="max-w-3xl space-y-4">
      <div className="card card-pad">
        <div className="section-title">
          <Calculator className="h-4 w-4" /> مكوّنات المعدل وأوزانها
        </div>
        <p className="muted mb-3 text-xs leading-relaxed">
          أعمدة دفتر التنقيط المرجعي: الكراس، المشاركة، السلوك، الوظائف (تُجمع في «التقويم المستمر»)، ثم الفرض، معدل
          النشاطات، الاختبار، والمعدل. التطبيق لا يفرض أي صيغة رسمية: الأوزان هنا هي التي يحدّدها الأستاذ.
        </p>
        <div className="space-y-2">
          {components.map((item) => (
            <div key={item.key} className="flex flex-wrap items-center gap-3 rounded-md border p-2">
              <Checkbox checked={item.enabled} onChange={(value) => update(item.key, { enabled: value })} label={FORMULA_COMPONENT_LABELS[item.key] ?? item.label} />
              <div className="flex items-center gap-2">
                <span className="muted text-xs">الوزن</span>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  className="w-24"
                  value={item.weight}
                  onChange={(event) => update(item.key, { weight: Number(event.target.value || 0) })}
                />
                <span className="muted text-xs">
                  {enabledTotal > 0 ? `${Math.round((item.weight / enabledTotal) * 100)}%` : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-pad space-y-3">
        <Field label="اسم الصيغة">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="عدد خانات التدوير">
          <Select value={rounding} onChange={(event) => setRounding(Number(event.target.value))}>
            {[0, 1, 2, 3].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
        <div className="rounded-md border bg-[rgb(var(--surface-muted))] p-3 text-sm">
          <p className="font-semibold">صيغة الحساب الحالية</p>
          <p className="mt-1 leading-relaxed">{describeFormula(components, rounding)}</p>
        </div>
        <Button
          variant="primary"
          icon={<Save className="h-4 w-4" />}
          onClick={() => {
            if (components.filter((item) => item.enabled && item.weight > 0).length === 0) {
              toast('فعّل مكوّناً واحداً على الأقل', 'warning')
              return
            }
            void run(
              () =>
                window.api.formulas.save({
                  name: name.trim() || 'صيغة المستخدم',
                  components,
                  rounding,
                  academic_year_id: activeYear?.id ?? null
                }),
              'تم حفظ صيغة حساب المعدل'
            ).then(() => {
              void formula.reload()
            })
          }}
        >
          حفظ الصيغة
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------ الطباعة -------------------------------- */

/** تقييد قيمة رقمية داخل مدى مسموح (يُستعمل في إعدادات الطباعة) */
function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(Math.max(value, min), max)
}

function PrintingSettings(): JSX.Element {
  const run = useApp((state) => state.run)
  const toast = useApp((state) => state.toast)
  const [scope, setScope] = useState('default')
  const [form, setForm] = useState({
    header_text: '',
    footer_text: '',
    margin_mm: 12,
    font_size: 12,
    font_family: 'Amiri',
    orientation: 'portrait' as 'portrait' | 'landscape',
    show_logo: 1 as 0 | 1,
    logo_path: ''
  })

  const current = useAsync(
    () => window.api.print.settings({ scope }),
    [scope],
    null as Awaited<ReturnType<typeof window.api.print.settings>> | null
  )

  useEffect(() => {
    const row = current.data
    if (!row) return
    setForm({
      header_text: row.header_text ?? '',
      footer_text: row.footer_text ?? '',
      margin_mm: row.margin_mm,
      font_size: row.font_size,
      font_family: row.font_family,
      orientation: row.orientation === 'landscape' ? 'landscape' : 'portrait',
      show_logo: row.show_logo === 1 ? 1 : 0,
      logo_path: row.logo_path ?? ''
    })
  }, [current.data])

  return (
    <div className="card card-pad max-w-2xl space-y-3">
      <Field
        label="نطاق الإعدادات"
        hint="اختر وثيقة لتُطبَّق إعداداتها عليها وحدها (تُستعمل تلقائياً عند طبعها)، ويبقى «كل الوثائق» مرجعاً لما لا نطاق خاص له."
      >
        <Select value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="default">كل الوثائق (افتراضي)</option>
          <option value="gradebook">دفتر التنقيط</option>
          <option value="daily-notebook">الدفتر اليومي</option>
          <option value="timetable">الجدول الأسبوعي</option>
        </Select>
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="نص رأس الصفحة (اختياري)" hint="إن تُرك فارغاً يُستعمل رأس تلقائي بالمؤسسة والأستاذ والسنة.">
          <Input value={form.header_text} onChange={(event) => setForm({ ...form, header_text: event.target.value })} />
        </Field>
        <Field label="نص تذييل الصفحة">
          <Input value={form.footer_text} onChange={(event) => setForm({ ...form, footer_text: event.target.value })} />
        </Field>
        {/* القيم تُقيَّد داخل المسموح فوراً حتى لا يفشل الحفظ بسبب رقم خارج المدى */}
        <Field label="الهامش (مم)" hint="من 5 إلى 40 مم">
          <Input
            type="number"
            min={5}
            max={40}
            value={form.margin_mm}
            onChange={(event) => setForm({ ...form, margin_mm: clamp(Number(event.target.value || 12), 5, 40) })}
          />
        </Field>
        <Field label="حجم الخط" hint="من 8 إلى 20 نقطة">
          <Input
            type="number"
            min={8}
            max={20}
            value={form.font_size}
            onChange={(event) => setForm({ ...form, font_size: clamp(Number(event.target.value || 12), 8, 20) })}
          />
        </Field>
        <Field label="خط الوثائق">
          <Select value={form.font_family} onChange={(event) => setForm({ ...form, font_family: event.target.value })}>
            <option value="Amiri">Amiri (نسخي — الأنسب للوثائق)</option>
            <option value="Tajawal">Tajawal (حديث واضح)</option>
            <option value="Traditional Arabic">Traditional Arabic</option>
            <option value="Times New Roman">Times New Roman</option>
          </Select>
        </Field>
        <Field label="الاتجاه الافتراضي">
          <Select value={form.orientation} onChange={(event) => setForm({ ...form, orientation: event.target.value as 'portrait' | 'landscape' })}>
            <option value="portrait">عمودي</option>
            <option value="landscape">أفقي</option>
          </Select>
        </Field>
      </div>
      <Field label="مسار شعار المؤسسة (اختياري لهذا النطاق)">
        <div className="flex gap-2">
          <Input value={form.logo_path} onChange={(event) => setForm({ ...form, logo_path: event.target.value })} />
          <Button
            icon={<School className="h-4 w-4" />}
            onClick={() =>
              void window.api.dialogs.pickFile({ title: 'اختيار شعار', filters: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }).then((path) => {
                if (path) setForm((current) => ({ ...current, logo_path: path }))
              })
            }
          >
            اختيار
          </Button>
        </div>
      </Field>
      <Checkbox checked={form.show_logo === 1} onChange={(value) => setForm({ ...form, show_logo: value ? 1 : 0 })} label="إظهار شعار المؤسسة في رأس الوثائق" />
      <Button
        variant="primary"
        icon={<Printer className="h-4 w-4" />}
        onClick={() => {
          void run(
            () =>
              window.api.print.saveSettings({
                scope,
                header_text: form.header_text.trim() || null,
                footer_text: form.footer_text.trim() || null,
                paper: 'A4',
                orientation: form.orientation,
                margin_mm: form.margin_mm,
                font_size: form.font_size,
                font_family: form.font_family,
                show_logo: form.show_logo,
                logo_path: form.logo_path.trim() || null
              }),
            'تم حفظ إعدادات الطباعة'
          ).then((saved) => {
            if (saved) {
              toast('ستُطبَّق هذه الإعدادات على نطاق: ' + scope, 'info')
              void current.reload()
            }
          })
        }}
      >
        حفظ إعدادات الطباعة
      </Button>
      <p className="muted text-xs leading-relaxed">
        إعدادات الرأس والتذييل والهوامش تُطبَّق على وثائق مركز الطباعة. الوثائق تُبنى بمقاس A4 مع محاولة كسر الصفحات
        الأسلم (تكرار رأس الجدول في كل صفحة) حتى لا تُقطع جداول التلاميذ.
      </p>
    </div>
  )
}

/* ------------------------------- الأمان -------------------------------- */
function SecuritySettings(): JSX.Element {
  const run = useApp((state) => state.run)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')

  const status = useAsync(() => window.api.pin.status(), [], { enabled: false })
  useEffect(() => setEnabled(status.data.enabled), [status.data.enabled])

  return (
    <div className="card card-pad max-w-2xl space-y-3">
      <div className="section-title">
        <ShieldCheck className="h-4 w-4" /> قفل اختياري بالرمز السري
      </div>
      <p className="muted text-xs leading-relaxed">
        القفل يمنع فتح الواجهة دون إدخال الرمز. تنبيه صريح: قاعدة بيانات SQLite المستعملة هنا <strong>غير مشفّرة</strong>؛
        القفل يحمي الوصول عبر التطبيق ولا يحمي الملف من قراءة مباشرة على القرص.
      </p>
      {enabled ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success">القفل مُفعّل</Badge>
          <Button
            icon={<KeyRound className="h-4 w-4" />}
            onClick={() => {
              void run(() => window.api.pin.clear(), 'تم إلغاء قفل الرمز السري').then(() => void status.reload())
            }}
          >
            إلغاء القفل
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="الرمز السري (4 إلى 8 أرقام)">
            <Input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              maxLength={8}
            />
          </Field>
          <Field label="تأكيد الرمز">
            <Input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, ''))}
              maxLength={8}
            />
          </Field>
          <Button
            variant="primary"
            icon={<KeyRound className="h-4 w-4" />}
            onClick={() => {
              if (pin.length < 4 || pin !== confirmPin) {
                void window.api.dialogs.confirm({
                  title: 'رمز غير صالح',
                  message: 'الرمز يجب أن يكون من 4 إلى 8 أرقام وأن يتطابق مع التأكيد.',
                  detail: 'لم يتم تفعيل القفل. أعد المحاولة.',
                  confirmLabel: 'حسناً'
                })
                return
              }
              void run(() => window.api.pin.set({ pin }), 'تم تفعيل قفل الرمز السري').then(() => {
                setPin('')
                setConfirmPin('')
                void status.reload()
              })
            }}
          >
            تفعيل القفل
          </Button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------ متقدم ---------------------------------- */
function AdvancedSettings(): JSX.Element {
  const run = useApp((state) => state.run)
  const paths = useAsync(() => window.api.app.info(), [], null as Awaited<ReturnType<typeof window.api.app.info>> | null)
  const logs = useAsync(() => window.api.logs.read({ limit: 100 }), [], [] as string[])
  const [isDev, setIsDev] = useState(false)

  useEffect(() => {
    if (paths.data) setIsDev(paths.data.isDev)
  }, [paths.data])

  return (
    <div className="max-w-3xl space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="الإصدار" value={paths.data?.version ?? '—'} />
        <StatCard label="Electron" value={paths.data?.electron ?? '—'} />
        <StatCard label="قاعدة البيانات" value={paths.data ? 'محلية' : '—'} />
        <StatCard label="وضع التطوير" value={isDev ? 'نعم' : 'لا'} />
      </div>

      <div className="card card-pad space-y-2">
        <div className="section-title">
          <Database className="h-4 w-4" /> مسارات التخزين المحلية
        </div>
        <ul className="space-y-1 text-xs" dir="ltr">
          <li>userData: {paths.data?.paths.userData ?? '—'}</li>
          <li>database: {paths.data?.paths.database ?? '—'}</li>
          <li>backups: {paths.data?.paths.backups ?? '—'}</li>
          <li>attachments: {paths.data?.paths.attachments ?? '—'}</li>
          <li>logs: {paths.data?.paths.logs ?? '—'}</li>
        </ul>
        <p className="muted text-xs">
          كل هذه الملفات خارج مجلد التثبيت، لذلك لا تُحذف عند تحديث التطبيق. إنشاء نسخة احتياطية أمر موصى به قبل أي تحديث.
        </p>
      </div>

      <div className="card card-pad">
        <div className="section-title">
          <ListOrdered className="h-4 w-4" /> آخر العمليات (سجل محلي)
        </div>
        <AuditList />
      </div>

      {isDev && (
        <div className="card card-pad">
          <div className="section-title">
            <Wrench className="h-4 w-4" /> أدوات التطوير
          </div>
          <p className="muted mb-2 text-xs">متاحة في وضع التطوير فقط ولا تظهر في النسخة الموزّعة.</p>
          <Button
            onClick={() =>
              void run(async () => {
                const result = await window.api.demo.seed()
                if (!result.seeded) {
                  throw new Error('البيانات التجريبية تُنشأ مرة واحدة على قاعدة فارغة — عندك بيانات بالفعل.')
                }
                return result
              }, 'تم إنشاء بيانات تجريبية (سنة دراسية + 3 أقسام + تلاميذ + جدول + تقييمات)').then(() =>
                void window.api.app.reloadData()
              )
            }
          >
            إنشاء بيانات تجريبية
          </Button>
        </div>
      )}

      <div className="card card-pad">
        <div className="section-title">
          <Palette className="h-4 w-4" /> سجل التشغيل (محلي)
        </div>
        <pre className="max-h-60 overflow-auto rounded-md bg-slate-900 p-3 text-[11px] text-slate-100" dir="ltr">
          {logs.data.length > 0 ? logs.data.join('\n') : 'لا رسائل.'}
        </pre>
      </div>

      <div className="card card-pad">
        <div className="section-title">
          <GraduationCap className="h-4 w-4" /> حول التطبيق
        </div>
        <p className="text-sm leading-relaxed">
          «دفتر الأستاذ الرقمي» تطبيق سطح مكتب شخصي للأستاذ في التعليم المتوسط. يجمع الجدول الأسبوعي، الدفتر اليومي،
          دفتر التنقيط، الحضور، التقييمات، التوزيع السنوي، بنك الدروس، التقارير والطباعة في نظام واحد مترابط يعمل كاملاً
          دون إنترنت، مع تخزين محلي في SQLite ونسخ احتياطي محلي.
        </p>
        <p className="muted mt-2 flex items-center gap-2 text-xs">
          <Building2 className="h-3.5 w-3.5" /> لا توجد أي اتصالات شبكية أو Telemetry أو تتبّع في هذا التطبيق.
        </p>
      </div>
    </div>
  )
}

function AuditList(): JSX.Element {
  const audit = useAsync(() => window.api.audit.list({ limit: 60 }), [], [] as Awaited<ReturnType<typeof window.api.audit.list>>)
  const columns: Array<Column<(typeof audit.data)[number]>> = [
    { key: 'created', header: 'التاريخ', align: 'center', width: '11rem', render: (row) => row.created_at },
    { key: 'action', header: 'العملية', sticky: true, render: (row) => row.action },
    { key: 'entity', header: 'الجهة', align: 'center', width: '10rem', render: (row) => row.entity ?? '—' },
    { key: 'details', header: 'تفاصيل', render: (row) => <span className="muted text-xs">{row.details}</span> }
  ]
  return <DataTable columns={columns} rows={audit.data} rowKey={(row) => row.id} emptyMessage="لا عمليات مسجّلة." className="max-h-72" />
}

