import { useState } from 'react'
import { AlertTriangle, BookOpen, Database, FileText, FolderOpen, HardDriveDownload, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import type { BackupRecord } from '@shared/types'
import { formatBytes } from '@shared/utils/misc'
import { useApp } from '../store/app'
import { useAsync } from '../hooks/useAsync'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  LoadingBlock,
  PageHeader,
  Select,
  StatCard,
  Tabs,
  type Column,
  DataTable
} from '../components/ui'

export default function BackupPage(): JSX.Element {
  const run = useApp((state) => state.run)
  const toast = useApp((state) => state.toast)

  const [tab, setTab] = useState<'list' | 'settings' | 'logs'>('list')
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BackupRecord | null>(null)
  const [logs, setLogs] = useState<string[] | null>(null)
  const [mode, setMode] = useState<'off' | 'daily' | 'weekly'>('off')
  const [folder, setFolder] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const backups = useAsync<BackupRecord[]>(() => window.api.backup.list(), [], [])
  const status = useAsync(
    async () => {
      const info = await window.api.backup.status()
      setMode(info.mode)
      setFolder(info.folder ?? '')
      return info
    },
    [],
    { mode: 'off' as const, folder: null as string | null, lastBackupAt: null as string | null, nextDue: false }
  )

  const createBackup = async (): Promise<void> => {
    setBusy(true)
    const created = await run(() => window.api.backup.create({ kind: 'manual', note: 'نسخة يدوية' }), 'تم إنشاء النسخة الاحتياطية')
    setBusy(false)
    if (created) {
      await backups.reload()
      await status.reload()
    }
  }

  const checkIntegrity = async (row: BackupRecord): Promise<void> => {
    const result = await run(() => window.api.backup.integrity({ file_path: row.file_path }))
    if (result) {
      toast(result.ok ? `النسخة سليمة — ${result.tables} جدول` : `مشكلة في النسخة: ${result.message}`, result.ok ? 'success' : 'error')
    }
  }

  const columns: Array<Column<BackupRecord>> = [
    { key: 'file', header: 'الملف', sticky: true, render: (row) => <span className="font-medium">{row.file_name}</span> },
    { key: 'date', header: 'التاريخ', align: 'center', width: '11rem', render: (row) => row.created_at },
    { key: 'size', header: 'الحجم', align: 'center', width: '7rem', render: (row) => formatBytes(row.size) },
    {
      key: 'kind',
      header: 'النوع',
      align: 'center',
      width: '9rem',
      render: (row) => (
        <Badge tone={row.kind === 'auto' ? 'info' : row.kind === 'pre-migration' ? 'warning' : 'neutral'}>
          {row.kind === 'auto'
            ? 'تلقائية'
            : row.kind === 'pre-migration'
              ? 'قبل الترقية'
              : row.kind === 'pre-import'
                ? 'قبل استيراد'
                : 'يدوية'}
        </Badge>
      )
    },
    { key: 'note', header: 'ملاحظة', render: (row) => <span className="muted text-xs">{row.note}</span> },
    {
      key: 'actions',
      header: 'إجراءات',
      align: 'center',
      width: '16rem',
      render: (row) => (
        <span className="flex flex-wrap justify-center gap-1">
          <Button size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setRestoreTarget(row)}>
            استعادة
          </Button>
          <Button size="sm" variant="ghost" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => void checkIntegrity(row)}>
            فحص السلامة
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(row)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </span>
      )
    }
  ]

  const totalSize = backups.data.reduce((sum, row) => sum + row.size, 0)
  const latest = backups.data[0]

  return (
    <div>
      <PageHeader
        title="النسخ الاحتياطي والاستعادة"
        subtitle="كل النسخ تُحفظ محلياً على هذا الجهاز — لا تُرسل إلى أي خدمة خارجية"
        actions={
          <>
            <Button
              size="sm"
              icon={<BookOpen className="h-4 w-4" />}
              onClick={() => void run(() => window.api.help.open(), 'تم فتح دليل الاستخدام')}
            >
              دليل الاستخدام
            </Button>
            <Button
              size="sm"
              icon={<FolderOpen className="h-4 w-4" />}
              onClick={() => void run(() => window.api.logs.open(), 'تم فتح ملف السجل')}
            >
              فتح سجل التشغيل
            </Button>
            <Button size="sm" variant="primary" icon={<HardDriveDownload className="h-4 w-4" />} loading={busy} onClick={() => void createBackup()}>
              إنشاء نسخة الآن
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="عدد النسخ" value={backups.data.length} icon={<Database className="h-4 w-4" />} />
        <StatCard label="الحجم الكلي" value={formatBytes(totalSize)} />
        <StatCard label="آخر نسخة" value={latest?.created_at ?? '—'} />
        <StatCard
          label="النسخ التلقائي"
          value={mode === 'off' ? 'معطّل' : mode === 'daily' ? 'يومي' : 'أسبوعي'}
          hint={status.data.nextDue ? 'مستحقة الآن' : 'غير مستحقة'}
        />
      </div>

      <Tabs<'list' | 'settings' | 'logs'>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'list', label: 'النسخ المتوفرة' },
          { value: 'settings', label: 'إعدادات النسخ' },
          { value: 'logs', label: 'سجل التشغيل' }
        ]}
      />

      {tab === 'list' &&
        (backups.loading ? (
          <LoadingBlock />
        ) : backups.data.length === 0 ? (
          <EmptyState
            icon={<Database className="h-6 w-6" />}
            title="لا توجد نسخة احتياطية بعد"
            message="أنشئ نسخة أولى الآن، ثم فعّل النسخ التلقائي من تبويب الإعدادات للاطمئنان على بياناتك."
            action={
              <Button variant="primary" onClick={() => void createBackup()}>
                إنشاء نسخة احتياطية
              </Button>
            }
          />
        ) : (
          <DataTable columns={columns} rows={backups.data} rowKey={(row) => row.id} />
        ))}

      {tab === 'settings' && (
        <div className="card card-pad max-w-2xl space-y-3">
          <Field label="نمط النسخ التلقائي" hint="تُنشأ نسخة واحدة عند بدء التشغيل إذا كانت مستحقة.">
            <Select value={mode} onChange={(event) => setMode(event.target.value as 'off' | 'daily' | 'weekly')}>
              <option value="off">معطّل</option>
              <option value="daily">يومي</option>
              <option value="weekly">أسبوعي</option>
            </Select>
          </Field>
          <Field label="مجلد النسخ" hint="اتركه فارغاً لاستعمال المجلد الافتراضي داخل بيانات التطبيق.">
            <div className="flex gap-2">
              <input className="input" value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="المجلد الافتراضي" />
              <Button
                icon={<FolderOpen className="h-4 w-4" />}
                onClick={() =>
                  void window.api.dialogs.pickDirectory({ title: 'اختيار مجلد النسخ الاحتياطي' }).then((path) => {
                    if (path) setFolder(path)
                  })
                }
              >
                اختيار
              </Button>
            </div>
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={() =>
                void run(
                  () => window.api.backup.settings({ mode, folder: folder.trim() || null }),
                  'تم حفظ إعدادات النسخ الاحتياطي'
                ).then(() => void status.reload())
              }
            >
              حفظ الإعدادات
            </Button>
            <Button
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() =>
                void run(() => window.api.backup.create({ kind: 'auto', note: 'نسخة تلقائية عند الطلب' }), 'تم إنشاء نسخة تلقائية').then(
                  () => void backups.reload()
                )
              }
            >
              إنشاء نسخة تلقائية الآن
            </Button>
          </div>
          <p className="muted text-xs leading-relaxed">
            الاحتفاظ: تُحفظ آخر 30 نسخة تلقائية ويُحذف الأقدم تلقائياً. النسخ اليدوية لا تُحذف إلا بقرار منك. قبل أي ترقية
            لقاعدة البيانات يُنشئ التطبيق نسخة احتياطية من تلقاء نفسه.
          </p>
        </div>
      )}

      {tab === 'logs' && (
        <div className="card card-pad">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">آخر رسائل سجل التشغيل (محلي فقط)</span>
            <Button
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() =>
                void run(() => window.api.logs.read({ limit: 300 })).then((rows) => setLogs(rows ?? []))
              }
            >
              تحميل
            </Button>
          </div>
          {logs === null ? (
            <p className="muted text-sm">اضغط «تحميل» لعرض السجل.</p>
          ) : logs.length === 0 ? (
            <p className="muted text-sm">لا رسائل بعد.</p>
          ) : (
            <pre className="max-h-[50vh] overflow-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100" dir="ltr">
              {logs.join('\n')}
            </pre>
          )}
        </div>
      )}

      <ConfirmDialog
        open={restoreTarget !== null}
        danger
        title="استعادة نسخة احتياطية"
        message={`سيتم استبدال قاعدة البيانات الحالية بنسخة ${restoreTarget?.created_at ?? ''}.`}
        detail="يُنشئ التطبيق نسخة أمان من الوضع الحالي قبل الاستبدال، ثم يعيد تحميل البيانات. لن تُحذف أي نسخة."
        confirmLabel="استعادة"
        onCancel={() => setRestoreTarget(null)}
        onConfirm={() => {
          const target = restoreTarget
          setRestoreTarget(null)
          if (!target) return
          void run(() => window.api.backup.restore({ file_path: target.file_path }), 'تمت الاستعادة — سيُعاد تحميل البيانات').then(
            (result) => {
              if (result) {
                void window.api.app.reloadData()
                void backups.reload()
              }
            }
          )
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="حذف نسخة احتياطية"
        message={`سيتم حذف الملف «${deleteTarget?.file_name ?? ''}» من القرص.`}
        confirmLabel="حذف الملف"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget
          setDeleteTarget(null)
          if (!target) return
          void run(() => window.api.backup.remove({ id: target.id }), 'تم حذف النسخة').then(() => void backups.reload())
        }}
      />

      <p className="muted mt-4 flex items-start gap-2 text-xs">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
        بيانات التلاميذ حسّاسة، وقاعدة SQLite غير مشفّرة تلقائياً: احتفظ بالنسخ الاحتياطية في مكان آمن ولا تشارك مجلد بيانات
        التطبيق. يمكن تفعيل قفل بالرمز السري من الإعدادات لمنع الوصول غير المقصود إلى الواجهة.
      </p>
    </div>
  )
}
