import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AppPaths } from '@shared/types'

/**
 * كل بيانات المستخدم تُخزَّن في userData — خارج مجلد التثبيت —
 * حتى لا يحذفها تحديث البرنامج ولا إلغاء التثبيت.
 */
let cached: AppPaths | null = null

export function ensureDir(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function getPaths(): AppPaths {
  if (cached) return cached
  const userData = app.getPath('userData')
  const paths: AppPaths = {
    userData,
    database: join(userData, 'notebook.db'),
    backups: join(userData, 'backups'),
    attachments: join(userData, 'attachments'),
    logs: join(userData, 'logs'),
    resources: app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources')
  }
  ensureDir(paths.userData)
  ensureDir(paths.backups)
  ensureDir(paths.attachments)
  ensureDir(paths.logs)
  cached = paths
  return paths
}

/** يمنع الوصول إلى أي ملف خارج مجلدات البيانات المسموحة عند قبول مسارات من الواجهة. */
export function isInsideAllowedRoot(filePath: string): boolean {
  const paths = getPaths()
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  return [paths.userData, paths.resources].some((root) =>
    normalized.startsWith(root.replace(/\\/g, '/').toLowerCase())
  )
}
