import { app, BrowserWindow, dialog, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { openDatabase, closeDatabase, getDatabasePath, isOpen } from './database/connection'
import { getPaths, ensureDir } from './filesystem/paths'
import { initLogger, log } from './logger'
import { registerIpc } from './ipc'
import { runDueAutoBackup } from './backup/service'

/**
 * دفتر الأستاذ الرقمي — العملية الرئيسية.
 * 🔒 أمان: contextIsolation مُفعّل، nodeIntegration مُعطّل، sandbox مُفعّل،
 *    وكل الوصول إلى الملفات وقاعدة البيانات يمرّ عبر IPC مُتحقَّق منه بـ Zod.
 */

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null

/** نسمح فقط بالنوافذ الداخلية — لا فتح أي رابط خارجي داخل التطبيق */
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    const allowed = isDev ? 'http://localhost' : 'file://'
    if (!url.startsWith(allowed)) event.preventDefault()
  })
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f4f6f9',
    title: 'دفتر الأستاذ الرقمي',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: isDev
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function startDatabase(): void {
  const paths = getPaths()
  ensureDir(paths.userData)
  initLogger(paths.logs)

  try {
    openDatabase(paths.database)
    log('INFO', 'بدأ التطبيق', { version: app.getVersion(), db: paths.database })
  } catch (error) {
    // قاعدة البيانات غير قابلة للفتح → لا نحذفها أبداً، نقترح الاستعادة
    const backupsDir = paths.backups
    const message = error instanceof Error ? error.message : String(error)
    log('ERROR', 'تعذر فتح قاعدة البيانات', message)
    dialog.showErrorBox(
      'تعذر فتح قاعدة البيانات',
      `لم يتمكن التطبيق من فتح ملف قاعدة البيانات:\n${paths.database}\n\nالتفاصيل: ${message}\n\nلم يتم حذف أي بيانات. يمكنك استعادة نسخة احتياطية من المجلد:\n${backupsDir}`
    )
    throw error
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('dz.teacher.notebook')
  startDatabase()
  registerIpc()
  createWindow()

  // نسخة احتياطية تلقائية عند الاستحقاق (يومي/أسبوعي) إن فعّلها الأستاذ
  if (isOpen()) {
    const created = runDueAutoBackup()
    if (created) log('INFO', 'تم إنشاء نسخة احتياطية تلقائية', created.file_name)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  log('INFO', 'إغلاق التطبيق وحفظ قاعدة البيانات')
  closeDatabase()
})

process.on('uncaughtException', (error) => {
  log('ERROR', 'استثناء غير معالَج', error.stack ?? error.message)
})
process.on('unhandledRejection', (reason) => {
  log('ERROR', 'وعد مرفوض بدون معالجة', reason instanceof Error ? reason.message : String(reason))
})

/** معلومات تُستعمل في أدوات التشخيص */
export function appPathsAvailable(): boolean {
  try {
    return existsSync(getDatabasePath())
  } catch {
    return false
  }
}
