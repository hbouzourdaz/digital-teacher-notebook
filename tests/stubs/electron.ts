/**
 * بديل مبسّط لوحدة electron داخل الاختبارات.
 * يسمح باختبار طبقة البيانات الحقيقية (مستودعات + SQLite) دون تشغيل إلكترون،
 * مع حفظ «بيانات المستخدم» في مجلد مؤقت خاص بهذه الجلسة.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'notebook-tests-'))

export const app = {
  getPath: (name: string): string => (name === 'userData' ? userData : writePath(name)),
  getAppPath: (): string => process.cwd(),
  isPackaged: false,
  setAppUserModelId: (): void => undefined,
  whenReady: async (): Promise<void> => undefined,
  quit: (): void => undefined
}

/** مجلدات أخرى (downloads/logs…) تُوضع داخل نفس المجلد المؤقت */
function writePath(name: string): string {
  return join(userData, name)
}

export const dialog = {
  showOpenDialog: async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({
    canceled: true,
    filePaths: []
  }),
  showSaveDialog: async (): Promise<{ canceled: boolean; filePath?: string }> => ({ canceled: true })
}

export const ipcMain = { handle: (): void => undefined, removeHandler: (): void => undefined }
export const shell = { openPath: async (): Promise<string> => '' }
export const BrowserWindow = class {}
export const Menu = { setApplicationMenu: (): void => undefined }

export default { app, dialog, ipcMain, shell, BrowserWindow, Menu }
