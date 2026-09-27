import { copyFileSync, existsSync, statSync, unlinkSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BackupRecord, PendingBackupInfo } from '@shared/types'
import type { BackupSettingsInput } from '@shared/schemas'
import { inspectDatabase, makeSnapshot, getDatabasePath, swapDatabaseFile } from '../database/connection'
import { getPaths, ensureDir } from '../filesystem/paths'
import { SETTING_KEYS } from '@shared/constants'
import { all, audit, count, one, run } from '../repositories/base'
import { getSetting, setSetting } from '../repositories/settings'
import { log } from '../logger'

const KEEP_AUTO_BACKUPS = 30

function stamp(): { file: string; label: string } {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  const time = `${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  return { file: `${date}_${time}.db`, label: `${date} ${p(d.getHours())}:${p(d.getMinutes())}` }
}

export function listBackups(): BackupRecord[] {
  const rows = all<BackupRecord>('SELECT * FROM backups ORDER BY id DESC')
  // نتحقق من وجود الملفات على القرص فعلاً (سلامة السجل)
  return rows.map((row) => ({
    ...row,
    size: existsSync(row.file_path) ? statSync(row.file_path).size : row.size
  }))
}

export function backupFolder(): string {
  const custom = getSetting(SETTING_KEYS.backupFolder)
  const folder = custom && custom.trim() ? custom : getPaths().backups
  ensureDir(folder)
  return folder
}

export function createBackup(kind: BackupRecord['kind'] = 'manual', note?: string): BackupRecord {
  const folder = backupFolder()
  const { file, label } = stamp()
  let target = join(folder, file)
  let counter = 1
  while (existsSync(target)) {
    target = join(folder, file.replace(/\.db$/, `_${counter}.db`))
    counter++
  }
  makeSnapshot(target)

  // التحقق من أن النسخة أُنشئت فعلاً وأنها سليمة
  if (!existsSync(target)) throw new Error('تعذر إنشاء ملف النسخة الاحتياطية.')
  const check = inspectDatabase(target)
  if (!check.ok) throw new Error(`النسخة الاحتياطية غير سليمة: ${check.message}`)

  const size = statSync(target).size
  const result = run(
    'INSERT INTO backups (file_path, file_name, size, kind, note) VALUES (?, ?, ?, ?, ?)',
    [target, file, size, kind, note ?? null]
  )
  setSetting(SETTING_KEYS.lastBackupAt, new Date().toISOString())
  audit('إنشاء نسخة احتياطية', 'backups', result.lastInsertRowid, label)
  log('INFO', 'نسخة احتياطية جديدة', { target, size })

  if (kind === 'auto') pruneAutoBackups()
  return one<BackupRecord>('SELECT * FROM backups WHERE id = ?', [result.lastInsertRowid]) as BackupRecord
}

function pruneAutoBackups(): void {
  const autos = all<BackupRecord>("SELECT * FROM backups WHERE kind = 'auto' ORDER BY id DESC")
  for (const old of autos.slice(KEEP_AUTO_BACKUPS)) {
    try {
      if (existsSync(old.file_path)) unlinkSync(old.file_path)
    } catch {
      /* نتجاهل الملفات المقفلة */
    }
    run('DELETE FROM backups WHERE id = ?', [old.id])
  }
}

/**
 * الاستعادة لا تستبدل قاعدة البيانات إلا بعد تأكيد المستخدم (في الواجهة)
 * وبعد إنشاء نسخة أمان من الوضع الحالي.
 */
export function restoreBackup(filePath: string): { restored: boolean; safetyBackup: string } {
  if (!existsSync(filePath)) throw new Error('ملف النسخة الاحتياطية غير موجود.')
  if (filePath === getDatabasePath()) throw new Error('لا يمكن الاستعادة من قاعدة البيانات الحالية نفسها.')

  const check = inspectDatabase(filePath)
  if (!check.ok) throw new Error(`الملف غير صالح للاستعادة: ${check.message}`)

  // نسخة أمان من الحالة الراهنة قبل أي استبدال
  const safety = createBackup('manual', 'نسخة أمان قبل الاستعادة')
  swapDatabaseFile(filePath)
  audit('استعادة نسخة احتياطية', 'backups', null, filePath)
  log('WARN', 'تمت الاستعادة من نسخة احتياطية', filePath)
  return { restored: true, safetyBackup: safety.file_path }
}

export function removeBackup(id: number): void {
  const row = one<BackupRecord>('SELECT * FROM backups WHERE id = ?', [id])
  if (!row) return
  try {
    if (existsSync(row.file_path)) unlinkSync(row.file_path)
  } catch {
    throw new Error('تعذر حذف ملف النسخة الاحتياطية (قد يكون مفتوحاً).')
  }
  run('DELETE FROM backups WHERE id = ?', [id])
  audit('حذف نسخة احتياطية', 'backups', id)
}

export function getBackupSettings(): PendingBackupInfo {
  const mode = (getSetting(SETTING_KEYS.backupMode) ?? 'off') as PendingBackupInfo['mode']
  const folder = getSetting(SETTING_KEYS.backupFolder)
  const last = getSetting(SETTING_KEYS.lastBackupAt)
  return { mode, folder, lastBackupAt: last, nextDue: isDue(mode, last) }
}

export function saveBackupSettings(input: BackupSettingsInput): PendingBackupInfo {
  setSetting(SETTING_KEYS.backupMode, input.mode)
  if (input.folder && input.folder.trim()) setSetting(SETTING_KEYS.backupFolder, input.folder.trim())
  audit('تعديل إعدادات النسخ الاحتياطي')
  return getBackupSettings()
}

function isDue(mode: PendingBackupInfo['mode'], lastIso: string | null): boolean {
  if (mode === 'off') return false
  if (!lastIso) return true
  const last = new Date(lastIso).getTime()
  if (Number.isNaN(last)) return true
  const hours = (Date.now() - last) / 36e5
  return mode === 'daily' ? hours >= 20 : hours >= 24 * 6
}

/** تُنفَّذ عند التشغيل وعند تغيير الإعدادات — نسخة تلقائية واحدة فقط عند الاستحقاق */
export function runDueAutoBackup(): BackupRecord | null {
  const status = getBackupSettings()
  if (!status.nextDue) return null
  try {
    return createBackup('auto', 'نسخة تلقائية')
  } catch (error) {
    log('ERROR', 'فشل النسخ الاحتياطي التلقائي', String(error))
    return null
  }
}

export function backupsFolderContent(): string[] {
  const folder = backupFolder()
  try {
    return readdirSync(folder).filter((name) => name.toLowerCase().endsWith('.db'))
  } catch {
    return []
  }
}

export function backupCount(): number {
  return count('SELECT COUNT(*) AS c FROM backups')
}

/** نسخة أمان قبل الاستيراد الجماعي (اختيارية لكن مُفعّلة افتراضياً) */
export function backupBeforeImport(): BackupRecord | null {
  try {
    return createBackup('pre-import', 'نسخة قبل استيراد بيانات')
  } catch (error) {
    log('WARN', 'تعذر إنشاء نسخة قبل الاستيراد', String(error))
    return null
  }
}

/** تُستعمل عند الاستعادة من ملف على القرص خارج السجل */
export function importExternalBackup(sourcePath: string): BackupRecord {
  const folder = backupFolder()
  const { file } = stamp()
  const target = join(folder, `imported_${file}`)
  copyFileSync(sourcePath, target)
  const size = statSync(target).size
  const result = run('INSERT INTO backups (file_path, file_name, size, kind, note) VALUES (?, ?, ?, ?, ?)', [
    target,
    file,
    size,
    'manual',
    'نسخة مستوردة'
  ])
  return one<BackupRecord>('SELECT * FROM backups WHERE id = ?', [result.lastInsertRowid]) as BackupRecord
}
