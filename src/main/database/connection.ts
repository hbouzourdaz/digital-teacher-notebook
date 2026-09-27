import Database from 'better-sqlite3'
import { copyFileSync, existsSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { MIGRATIONS } from './migrations'
import { log } from '../logger'
import { toISODate } from '@shared/utils/date'

/**
 * إدارة اتصال SQLite + نظام الترقيات (Migrations).
 * كل الاستعلامات تُنفَّذ عبر Prepared Statements فقط.
 */

let db: Database.Database | null = null
let dbPath = ''

export interface MigrateResult {
  applied: number[]
  backupPath: string | null
}

function readUserVersion(database: Database.Database): number {
  const row = database.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
  return row?.user_version ?? 0
}

/** نسخة احتياطية تلقائية قبل أي ترقية تغيّر المخطط */
function backupBeforeMigration(database: Database.Database, fromVersion: number): string | null {
  if (fromVersion === 0) return null
  try {
    const dir = join(dirname(dbPath), 'backups')
    const target = join(dir, `${toISODate(new Date())}_pre-migration_v${fromVersion}.db`)
    database.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(dbPath, target)
    log('INFO', 'تم إنشاء نسخة احتياطية قبل الترقية', target)
    return target
  } catch (error) {
    log('WARN', 'تعذر إنشاء نسخة احتياطية قبل الترقية', String(error))
    return null
  }
}

export function runMigrations(database: Database.Database): MigrateResult {
  const applied: number[] = []
  const current = readUserVersion(database)
  const pending = MIGRATIONS.filter((m) => m.version > current).sort((a, b) => a.version - b.version)
  if (pending.length === 0) return { applied, backupPath: null }

  const backupPath = backupBeforeMigration(database, current)

  for (const migration of pending) {
    const tx = database.transaction(() => {
      database.exec(migration.sql)
      database.pragma(`user_version = ${migration.version}`)
    })
    tx()
    applied.push(migration.version)
    log('INFO', `ترقية قاعدة البيانات: ${migration.name} (v${migration.version})`)
  }
  return { applied, backupPath }
}

export function openDatabase(file: string): Database.Database {
  dbPath = file
  const database = new Database(file)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  database.pragma('synchronous = NORMAL')
  const result = runMigrations(database)
  db = database
  log('INFO', `قاعدة البيانات جاهزة: ${file}`, { applied: result.applied })
  return database
}

export function getDb(): Database.Database {
  if (!db) throw new Error('قاعدة البيانات غير مفتوحة')
  return db
}

export function getDatabasePath(): string {
  return dbPath
}

export function isOpen(): boolean {
  return db !== null && db.open
}

export function closeDatabase(): void {
  if (db && db.open) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      /* تجاهل */
    }
    db.close()
  }
  db = null
}

/**
 * يفصل قاعدة البيانات، يستبدل الملف، ثم يعيد الفتح.
 * يُستعمل في الاستعادة من نسخة احتياطية فقط.
 */
export function swapDatabaseFile(sourceFile: string): void {
  if (!existsSync(sourceFile)) throw new Error('ملف النسخة الاحتياطية غير موجود')
  closeDatabase()
  // نُبقي نسخة أمان من الملف الحالي قبل الاستبدال.
  const safety = `${dbPath}.before-restore`
  try {
    copyFileSync(dbPath, safety)
  } catch {
    /* إن لم يكن الملف موجوداً نتجاهل */
  }
  copyFileSync(sourceFile, dbPath)
  try {
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix, { force: true })
    }
  } catch {
    /* تجاهل */
  }
  openDatabase(dbPath)
}

/** التحقق من سلامة ملف قاعدة بيانات دون استبداله */
export function inspectDatabase(file: string): { ok: boolean; size: number; tables: number; message: string } {
  let size = 0
  try {
    size = existsSync(file) ? statSync(file).size : 0
  } catch {
    size = 0
  }
  if (!existsSync(file)) return { ok: false, size: 0, tables: 0, message: 'الملف غير موجود' }
  let probe: Database.Database | null = null
  try {
    probe = new Database(file, { readonly: true, fileMustExist: true })
    const row = probe
      .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .get() as { c: number }
    const integrity = probe.pragma('integrity_check') as Array<{ integrity_check: string }>
    const ok = integrity.every((r) => r.integrity_check === 'ok')
    return {
      ok,
      size,
      tables: row.c,
      message: ok ? 'النسخة سليمة' : 'فحص السلامة أبلغ عن مشكلة'
    }
  } catch (error) {
    return { ok: false, size, tables: 0, message: `تعذر قراءة الملف: ${String(error)}` }
  } finally {
    probe?.close()
  }
}

/** نسخة احتياطية متسقة (تستخدم واجهة SQLite الرسمية) */
export function makeSnapshot(targetFile: string): void {
  const database = getDb()
  database.pragma('wal_checkpoint(TRUNCATE)')
  copyFileSync(dbPath, targetFile)
}
