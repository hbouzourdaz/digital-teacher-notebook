import { BrowserWindow } from 'electron'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { log } from '../logger'

/**
 * توليد PDF محلياً عبر printToPDF — لا يوجد أي خدمة خارجية.
 * نستعمل نافذة مخفية معزولة تماماً (بلا node integration).
 */
export async function htmlToPdf(
  html: string,
  options: { orientation: 'portrait' | 'landscape'; savePath: string }
): Promise<{ path: string; size: number }> {
  const dir = mkdtempSync(join(tmpdir(), 'notebook-print-'))
  const htmlPath = join(dir, 'document.html')
  writeFileSync(htmlPath, html, 'utf8')

  const win = new BrowserWindow({
    show: false,
    width: 1240,
    height: 1754,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true,
      webSecurity: true
    }
  })

  try {
    await win.loadFile(htmlPath)
    // مهلة قصيرة لضمان تحميل الخطوط المحلية قبل الطبع
    await new Promise((resolve) => setTimeout(resolve, 350))
    const data = await win.webContents.printToPDF({
      landscape: options.orientation === 'landscape',
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'none' },
      preferCSSPageSize: true
    })
    writeFileSync(options.savePath, data)
    return { path: options.savePath, size: data.byteLength }
  } finally {
    win.destroy()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* تجاهل */
    }
  }
}

export interface PrintRequestResult {
  printed: boolean
  canceled: boolean
  failureReason: string
}

/**
 * إرسال الوثيقة إلى طابعة النظام عبر نافذة مخفية.
 * الاعتماد على النافذة الأصلية (لا على إطار المعاينة) يضمن:
 *  - تحميل الخط العربي المحلي (file://) بلا حجب
 *  - مقاس A4 والاتجاه الصحيح ورأس/تذييل الوثيقة كما في المعاينة
 *  - ظهور مربّع حوار الطباعة الأصلي في نظام التشغيل
 */
export async function htmlToPrinter(
  html: string,
  options: { orientation: 'portrait' | 'landscape'; silent?: boolean; title?: string },
): Promise<PrintRequestResult> {
  const dir = mkdtempSync(join(tmpdir(), 'notebook-print-'))
  const htmlPath = join(dir, 'document.html')
  writeFileSync(htmlPath, html, 'utf8')

  const orientation = options.orientation === 'landscape' ? 'landscape' : 'portrait'
  const win = new BrowserWindow({
    /*
     * نافذة الطباعة تظهر للمستخدم: معاينة الطباعة في كروميوم تُرسم داخل النافذة نفسها،
     * فنافذة مخفية تعني حواراً غير مرئي وطباعة معلّقة. الطبع الصامت وحده يستعمل نافذة مخفية.
     */
    show: options.silent !== true,
    width: orientation === 'landscape' ? 1400 : 1000,
    height: orientation === 'landscape' ? 1000 : 1400,
    center: true,
    autoHideMenuBar: true,
    title: options.title ? `الطباعة — ${options.title}` : 'الطباعة',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true
    }
  })

  try {
    await win.loadFile(htmlPath)
    if (!win.isDestroyed()) win.focus()
    // مهلة قصيرة لتحميل الخطوط المحلية قبل استدعاء الطابعة
    await new Promise((resolve) => setTimeout(resolve, 400))

    const result = await new Promise<PrintRequestResult>((resolve) => {
      let settled = false
      const done = (value: PrintRequestResult): void => {
        if (settled) return
        settled = true
        resolve(value)
      }
      // إن أغلق المستخدم نافذة الطباعة بنفسه قبل إتمام الحوار
      win.once('closed', () => done({ printed: false, canceled: true, failureReason: '' }))
      win.webContents.print(
        {
          silent: options.silent === true,
          printBackground: true,
          landscape: orientation === 'landscape',
          pageSize: 'A4',
          margins: { marginType: 'none' },
          deviceName: ''
        },
        (success, failureReason) =>
          done({
            printed: success,
            canceled: !success && /cancel/i.test(failureReason ?? ''),
            failureReason: failureReason ?? ''
          })
      )
      // حماية من حوار يبقى معلّقاً بلا أي نداء رجوع
      setTimeout(() => done({ printed: false, canceled: true, failureReason: '' }), 300000)
    })
    // مهلة صغيرة بعد نجاح الطبع حتى لا يُقطع العمل المُودَع في الطابور
    if (result.printed) await new Promise((resolve) => setTimeout(resolve, 1500))
    return result
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error)
    log('ERROR', 'فشل إرسال الوثيقة إلى الطابعة', failureReason)
    return { printed: false, canceled: false, failureReason }
  } finally {
    if (!win.isDestroyed()) win.destroy()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* تجاهل */
    }
  }
}

export function readPdfSize(filePath: string): number {
  try {
    return readFileSync(filePath).byteLength
  } catch (error) {
    log('WARN', 'تعذر قراءة حجم ملف PDF', String(error))
    return 0
  }
}
