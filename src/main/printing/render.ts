import { BrowserWindow } from 'electron'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { log } from '../logger'
import type { BuiltDocument } from './documents'
import {
  composeSheets,
  measureScript,
  oversizedUnits,
  planSheets,
  type MeasuredDraft,
  resolveSelection,
  usableHeightPx,
  type BodyUnit,
  type ComposeOptions,
  type SheetPlan
} from './paginate'

export interface PaginateRequest {
  /** أضف ورقة غلاف في أول الوثيقة */
  cover?: boolean
  /** اطبع ترقيم الصفحات «صفحة X من Y» */
  pageNumbers?: boolean
  /** من صفحة / إلى صفحة (بترقيم الوثيقة الكامل) — بدون تحديد تُطبع كل الصفحات */
  pageFrom?: number | null
  pageTo?: number | null
  /** أظهر كتلة الرأس الكاملة في أول ورقة مطبوعة */
  showFullHeader?: boolean
}

export interface PaginateResult {
  /** HTML نهائي بأوراق A4 صريحة مرقّمة */
  html: string
  /** عدد أوراق الوثيقة كاملة (غلاف + محتوى) */
  totalPages: number
  /** أرقام الصفحات المطبوعة فعلاً (بترقيم الوثيقة الكاملة) */
  printedPages: number[]
  /** وصف مختصر لكل ورقة: «صفحة 2 — الأحد 27 سبتمبر 2026» */
  pageLabels: Array<{ page: number; label: string }>
  /** تحذيرات غير حاجبة (مثل سطر يتجاوز ورقة كاملة) */
  warnings: string[]
}

/*
 * نافذة القياس تُنشأ مرة واحدة وتُعادة استعمالها:
 *  - إنشاء نافذة رسّام في كل استدعاء كان ينتج فشلاً عابراً في التحميل
 *    (ERR_FAILED) عند الطبع الثاني والثالث على التوالي.
 *  - استعمالها نفسه يضمن أن القياس يجري دائماً بعرض الورقة الصحيح.
 */
let measureWindow: BrowserWindow | null = null

function getMeasureWindow(width: number, height: number): BrowserWindow {
  if (measureWindow && !measureWindow.isDestroyed()) {
    measureWindow.setContentSize(width, height)
    return measureWindow
  }
  measureWindow = new BrowserWindow({
    show: false,
    width,
    height,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true
    }
  })
  measureWindow.on('closed', () => {
    measureWindow = null
  })
  return measureWindow
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * يفتح نافذة القياس، يقيس ارتفاع كل وحدة، ثم يعيد تركيب الوثيقة بأوراق مرقّمة.
 * القياس اختياري بطبيعته: إن فشل، تُطبع الوثيقة كاملة بأوراق متتالية بلا اقتطاع.
 */
export async function buildSheets(built: BuiltDocument, request: PaginateRequest = {}): Promise<PaginateResult> {
  const includeCover = request.cover !== false
  const pageNumbers = request.pageNumbers !== false
  const units: BodyUnit[] = built.sheet.units.map((unit) => ({ ...unit }))
  const usable = usableHeightPx(built.sheet.page)
  const warnings: string[] = []

  const dir = mkdtempSync(join(tmpdir(), 'notebook-measure-'))
  const draftPath = join(dir, 'draft.html')
  writeFileSync(draftPath, built.html, 'utf8')

  let measured = 0
  let overhead = 0
  try {
    const win = getMeasureWindow(
      Math.round(built.sheet.page.widthMm * 3.78),
      Math.round(built.sheet.page.heightMm * 3.78)
    )
    // ثلاث محاولات قصيرة: فشل تحميل عابر لا يجب أن يُفقد الوثيقة تقسيمها
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await win.loadFile(draftPath)
        break
      } catch (error) {
        if (attempt === 3) throw error
        await delay(250 * attempt)
      }
    }
    // مهلة قصيرة لتحميل الخطوط المحلية: تغيير الخط يغيّر الارتفاعات
    await delay(300)
    const draft = (await win.webContents.executeJavaScript(measureScript())) as MeasuredDraft | null
    if (draft && Array.isArray(draft.units)) {
      draft.units.forEach((height, index) => {
        if (units[index] && typeof height === 'number') {
          units[index].height = height
          measured++
        }
      })
    }
    // كتلة الرأس/العنوان تُخصم من ارتفاع الورقة الأولى وحدها
    overhead = typeof draft?.overhead === 'number' ? draft.overhead : 0
  } catch (error) {
    log('WARN', 'تعذر قياس الوحدات — سيُطبع بدون تقسيم دقيق', String(error))
    warnings.push('تعذّر قياس ارتفاع الوحدات، لذلك قد يختلف توزيع الصفحات قليلاً.')
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* تجاهل */
    }
  }
  log('INFO', `تركيب أوراق ${built.title}: قياس ${measured}/${units.length} وحدة (رأس ${Math.round(overhead)}px)`)

  const oversized = oversizedUnits(units, usable)
  if (oversized.length > 0) {
    warnings.push(`${oversized.length} عنصراً أطول من ورقة واحدة — سيبقى في ورقة خاصة وقد يُقتطع عند الطبع.`)
  }

  const plan: SheetPlan = { ...planSheets(units, usable, 0.94, overhead), coverPages: includeCover ? 1 : 0 }
  const selection = resolveSelection(plan, { from: request.pageFrom, to: request.pageTo }, includeCover)
  /*
   * الغلاف جزء من الأوراق لا واجهة ثابتة: يُركّب فقط إذا كان داخل المدى المطلوب
   * (الافتراضي يبدأ من الصفحة 1 فيشمل الغلاف). بدون ذلك يخرج في ملف PDF كامل
   * صفيحة غلاف لا يعرفها الترقيم في الواجهة ولا عدد الأوراق المطبوعة.
   */
  const wantsCover =
    includeCover && (request.pageFrom ?? 1) <= 1 && (request.pageTo ?? selection.total) >= 1
  const options: ComposeOptions = {
    pageNumbers,
    showFullHeader: request.showFullHeader !== false,
    documentTitle: built.title,
    identity: built.sheet.identity,
    selection: selection.pages,
    includeCover: wantsCover
  }

  const html = composeSheets(built.sheet, units, plan, options)
  const pageLabels = plan.pages.map((pageUnits, index) => ({
    page: plan.coverPages + 1 + index,
    label: units[pageUnits[0]]?.label ?? ''
  }))

  const printedPages = [
    ...(wantsCover ? [1] : []),
    ...selection.pages.map((index) => plan.coverPages + 1 + index)
  ]

  log(
    'INFO',
    `أوراق ${built.title}: ${plan.pages.length + plan.coverPages} ورقة (غلاف ${wantsCover ? 'نعم' : 'لا'}) — تُطبع ${printedPages.length}`
  )

  return {
    html,
    totalPages: selection.total,
    printedPages,
    pageLabels,
    warnings
  }
}
