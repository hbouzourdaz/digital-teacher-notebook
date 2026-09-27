/**
 * محرّك ترقيم صفحات الوثائق — منطق خالص قابل للاختبار.
 *
 * الفكرة: لا نترك المتصفح يقسّم الوثيقة كيف يشاء، بل نبني صفحات A4 صريحة
 * («ورقة» لكل صفحة) بعد قياس ارتفاع كل وحدة إدخال في نفس نافذة الطباعة:
 *   - سطر جدول = وحدة واحدة
 *   - كتلة (عنوان قسم، ملاحظة، إحصاء) = وحدة واحدة
 *   - رأس يوم في الدفتر اليومي = بداية ورقة جديدة (فيطبع الأستاذ «وثيقة اليوم» وحدها)
 *
 * النتيجة: ترقيم حقيقي «صفحة X من Y» على كل ورقة، وإمكانية طبع صفحة أو مدى صفحات،
 * ونتيجة واحدة تماماً في المعاينة وملف PDF والطابعة.
 */

export interface BodyUnit {
  /** HTML الوحدة كما ستُطبع */
  html: string
  /** رقم الجدول الأصلي: تُدمج وحدات الجدول الواحد في جدول واحد في الصفحة */
  tableId?: number
  /** ترويسة الجدول (<thead>) تُعاد في كل صفحة يظهر فيها الجدول */
  tableHead?: string
  /** صفات فتح الجدول مثل class */
  tableAttrs?: string
  /** أسطر تذييل الجدول (<tfoot>) تُلحق بآخر سطر */
  tableFoot?: string
  /** ابدأ ورقة جديدة قبل هذه الوحدة */
  breakBefore?: boolean
  /** اسم مختصر للورقة التي تبدأ بهذه الوحدة (مثل اسم اليوم أو القسم) */
  label?: string
  /** ارتفاع مقيس بالبكسل — يُملأ من نافذة القياس */
  height?: number
}

export interface SheetContext {
  css: string
  /** كتلة الرأس الكاملة (المؤسسة/الأستاذ/السنة) — تظهر في أول ورقة محتوى */
  headerHtml: string
  /** عنوان الوثيقة + سطر الفترة */
  titleHtml: string
  /** الرأس المختصر الذي يتكرر في أعلى كل ورقة */
  compactHeaderHtml: string
  /** الكتل والجداول مع علامات الوحدات */
  bodyHtml: string
  /** تذييل ثابت (نص الأستاذ) */
  footNoteHtml: string
  /** ورقة الغلاف (اختيارية) */
  coverHtml: string
  page: {
    widthMm: number
    heightMm: number
    marginMm: number
    /** ارتفاع شريط التذييل (الترقيم) بالمليمترات */
    footMm: number
  }
}

export interface SheetPlan {
  /** فهارس الوحدات في كل ورقة (بدون الغلاف) */
  pages: number[][]
  /** عدد أوراق الغلاف */
  coverPages: number
}

/* ------------------------------------------------------------------ */
/* تقسيم جسم الوثيقة إلى وحدات                                        */
/* ------------------------------------------------------------------ */

const VOID_TAGS = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'col'])

/** يفصل الوسوم العليا (بعمق صفر) — كل وسم كامل عنصر واحد */
export function topLevelChunks(html: string): string[] {
  const chunks: string[] = []
  let depth = 0
  let start = 0
  let index = 0
  while (index < html.length) {
    const open = html.indexOf('<', index)
    if (open === -1) break
    const close = html.indexOf('>', open)
    if (close === -1) break
    const tag = html.slice(open + 1, close)
    index = close + 1
    if (tag.startsWith('/')) {
      depth--
      if (depth <= 0) {
        depth = 0
        chunks.push(html.slice(start, index).trim())
        start = index
      }
      continue
    }
    const name = tag.split(/[\s/>]/, 1)[0].toLowerCase()
    const selfClosing = tag.endsWith('/') || VOID_TAGS.has(name)
    if (depth === 0) start = open
    if (!selfClosing) depth++
    else if (depth === 0) {
      chunks.push(html.slice(start, index).trim())
      start = index
    }
  }
  const tail = html.slice(start).trim()
  if (tail) chunks.push(tail)
  return chunks.filter(Boolean)
}

/** نصّ الوحدة بدون وسوم — لاستعماله كاسم مختصر للصفحة */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitTable(chunk: string, tableId: number): BodyUnit[] {
  const openTagEnd = chunk.indexOf('>')
  const openTag = chunk.slice(0, openTagEnd + 1)
  const inner = chunk.slice(openTagEnd + 1, chunk.lastIndexOf('</table>'))
  const attrs = openTag.replace(/^<table/i, '').replace(/>$/, '').trim()
  const theadMatch = inner.match(/<thead[\s\S]*?<\/thead>/i)
  const tfootMatch = inner.match(/<tfoot[\s\S]*?<\/tfoot>/i)
  const tbodyMatch = inner.match(/<tbody[\s\S]*<\/tbody>/i)
  const tbody = tbodyMatch ? tbodyMatch[0].replace(/^<tbody[^>]*>/i, '').replace(/<\/tbody>$/i, '') : inner
  const rows = topLevelChunks(tbody).filter((row) => /^<tr/i.test(row))
  const tableHead = theadMatch ? theadMatch[0] : ''
  const tableFoot = tfootMatch ? tfootMatch[0] : ''

  if (rows.length === 0) {
    // جدول صغير بلا أسطر (بطاقة معلومات) — وحدة واحدة
    return [{ html: chunk, label: plainText(chunk).slice(0, 40) || undefined }]
  }

  return rows.map((row, index) => {
    const isDayHeading = /class\s*=\s*"dayhead"/i.test(row)
    const label = /class\s*=\s*"[^"]*section/i.test(row) || isDayHeading ? plainText(row).slice(0, 60) : undefined
    return {
      html: row,
      tableId,
      tableHead,
      tableAttrs: attrs,
      tableFoot: index === rows.length - 1 ? tableFoot : undefined,
      // عنوان يوم يبدأ ورقة جديدة — إلا أول يوم في الوثيقة فهو يتبع كتلة الملخص
      breakBefore: (isDayHeading && index > 0) || undefined,
      label
    }
  })
}

/**
 * يحوّل جسم الوثيقة (المولَّد داخلياً) إلى وحدات قابلة للتوزيع على الأوراق.
 * الجداول تُقسَّم إلى أسطر، وبقية العناصر تبقى كتلاً واحدة.
 */
export function splitBodyUnits(bodyHtml: string): BodyUnit[] {
  const units: BodyUnit[] = []
  let tableId = 0
  /** فاصل صفحات صريح من المولّد: الوحدة التالية تبدأ ورقة جديدة */
  let pendingBreak = false

  const push = (items: BodyUnit[]): void => {
    for (const item of items) {
      if (pendingBreak) {
        item.breakBefore = true
        pendingBreak = false
      }
      units.push(item)
    }
  }

  for (const chunk of topLevelChunks(bodyHtml)) {
    if (/^<table/i.test(chunk)) {
      tableId++
      push(splitTable(chunk, tableId))
      continue
    }
    // عنصر فاصل (مثل قائمة القسم: كل قسم في ورقة منفصلة) — لا يُطبع، يعلّم قطعاً فقط
    if (/page-break-after\s*:\s*always/i.test(chunk)) {
      pendingBreak = true
      continue
    }
    const isSection = /class\s*=\s*"[^"]*section[^"]*"/i.test(chunk)
    push([{ html: chunk, label: isSection ? plainText(chunk).slice(0, 60) : undefined }])
  }
  return units
}

/**
 * يضيف علامة `data-unit` على كل وحدة في جسم الوثيقة (بنفس الترتيب) حتى تُقاس
 * داخل نافذة الطباعة، ويعيد الوحدات المعلَّمة نفسها.
 *
 * العلامة تُوضع في `unit.html` ذاته لا في نص موازٍ، حتى يكون ما يُقاس هو
 * بالضبط ما يُطبع (نفس الوسوم ونفس الأبعاد).
 */
export function markUnits(bodyHtml: string): { html: string; units: BodyUnit[] } {
  const units = splitBodyUnits(bodyHtml).map((unit, index) => ({
    ...unit,
    html: unit.html.replace(/^<(tr|td|th|div|p|span|section|article|ul|ol|h[1-6])/i, `<$1 data-unit="${index}"`)
  }))
  return { html: units.map((unit) => unit.html).join('\n'), units }
}

/* ------------------------------------------------------------------ */
/* خطة الأوراق                                                        */
/* ------------------------------------------------------------------ */

/**
 * يوزّع الوحدات على الأوراق حسب الارتفاعات المقيسة.
 * safety: نترك هامش أمان (افتراضياً 94%) لحساب فروق تقريب التقريب في الخطوط.
 * firstPageOverhead: ارتفاع كتلة الرأس/العنوان التي تُستهلك من الورقة الأولى فقط،
 * فبدون طرحها تتجاوز أسطر الصفحة الأولى طول الورقة وتُقتطع عند الطبع.
 */
export function planSheets(
  units: BodyUnit[],
  usablePx: number,
  safety = 0.94,
  firstPageOverhead = 0
): SheetPlan {
  const pages: number[][] = []
  const limit = Math.max(20, usablePx * safety)
  const firstLimit = Math.max(20, limit - Math.max(0, firstPageOverhead))
  let current: number[] = []
  let used = 0
  let currentLimit = firstLimit

  const flush = (): void => {
    if (current.length > 0) {
      pages.push(current)
      current = []
      used = 0
      currentLimit = limit
    }
  }

  for (let index = 0; index < units.length; index++) {
    const unit = units[index]
    const height = Math.max(0, unit.height ?? 0)
    if (current.length > 0 && (unit.breakBefore || used + height > currentLimit)) flush()
    current.push(index)
    used += height
    if (used > currentLimit) flush()
  }
  flush()

  return { pages, coverPages: 0 }
}

/** عدد الوحدات التي يتجاوز ارتفاعها ورقة كاملة (مؤشر إنذار فقط) */
export function oversizedUnits(units: BodyUnit[], usablePx: number, safety = 0.94): number[] {
  const limit = Math.max(20, usablePx * safety)
  return units.map((unit, index) => ((unit.height ?? 0) > limit ? index : -1)).filter((index) => index >= 0)
}

/* ------------------------------------------------------------------ */
/* القياس داخل الصفحة                                                  */
/* ------------------------------------------------------------------ */

/**
 * يقيس ارتفاع كل وحدة إدخال داخل مستند الوثيقة.
 * الدالة مستقلة تماماً (لا تعتمد على أي متغير خارجي) حتى تُنفَّذ كنص داخل
 * نافذة الطباعة عبر executeJavaScript، أو مباشرة على مستند إطار المعاينة.
 */
export function measureUnits(doc: {
  querySelectorAll: (selector: string) => ArrayLike<{ getBoundingClientRect: () => { height: number } }>
}): number[] {
  const nodes = doc.querySelectorAll('[data-unit]')
  const heights: number[] = []
  for (let index = 0; index < nodes.length; index++) {
    const rect = nodes[index].getBoundingClientRect()
    heights.push(Math.round(rect.height * 100) / 100)
  }
  return heights
}

/** مستند قابل للقياس (جزء من واجهة DOM التي نستعملها فقط) */
export interface MeasurableDoc {
  querySelectorAll: (selector: string) => ArrayLike<{ getBoundingClientRect: () => { height: number } }>
  querySelector: (selector: string) => { getBoundingClientRect: () => { height: number } } | null
}

/** نتيجة القياس: ارتفاع كل وحدة + ارتفاع كتلة الرأس/العنوان في الورقة الأولى */
export interface MeasuredDraft {
  units: number[]
  overhead: number
}

/**
 * يقيس مسودة الوثيقة كاملة.
 * مكتوبة مستقلة تماماً (لا تستدعي measureUnits) لأننا نرسلها كنص إلى نافذة
 * أخرى، فلا تصل معها أي دالة من هذا الملف.
 */
export function measureDraft(doc: MeasurableDoc): MeasuredDraft {
  const round = (value: number): number => Math.round(value * 100) / 100
  const nodes = doc.querySelectorAll('[data-unit]')
  const units: number[] = []
  for (let index = 0; index < nodes.length; index++) {
    units.push(round(nodes[index].getBoundingClientRect().height))
  }
  const overheadNode = doc.querySelector('[data-measure="overhead"]')
  return { units, overhead: overheadNode ? round(overheadNode.getBoundingClientRect().height) : 0 }
}

/** نصّ الدالة لتنفيذه داخل نافذة الطباعة */
export function measureScript(): string {
  return `(${measureDraft.toString()})(document)`
}

/* ------------------------------------------------------------------ */
/* تركيب الأوراق                                                       */
/* ------------------------------------------------------------------ */

export interface ComposeOptions {
  /** ترقيم الصفحات: «صفحة X من Y» */
  pageNumbers: boolean
  /** أظهر الرأس الكامل في أول ورقة محتوى */
  showFullHeader: boolean
  /** عنوان الوثيقة (يُكتب في التذييل) */
  documentTitle: string
  /** سطر الهوية (المؤسسة — الأستاذ — القسم) */
  identity: string
  /** فهارس الأوراق المطلوب طبعها من خطة الوثيقة (الافتراضي: الكل) */
  selection?: number[]
  /** هل يُدرج الغلاف؟ (الافتراضي: نعم إن وُجد) */
  includeCover?: boolean
}

/** نتيجة الترقيم: عدد الأوراق الكلي وفهارس المطلوب طبعها */
export interface SheetSelection {
  /** فهارس صفحات المحتوى المراد طبعها (0-based داخل plan.pages) */
  pages: number[]
  /** إجمالي أوراق الوثيقة كاملة (غلاف + محتوى) — يبقى ثابتاً مهما طُبع جزء منها */
  total: number
}

export function renderUnits(units: BodyUnit[]): string {
  const parts: string[] = []
  let openTableId: number | null = null
  for (const unit of units) {
    if (unit.tableId === undefined) {
      if (openTableId !== null) {
        parts.push('</tbody></table>')
        openTableId = null
      }
      parts.push(unit.html)
      continue
    }
    if (openTableId !== unit.tableId) {
      if (openTableId !== null) parts.push('</tbody></table>')
      parts.push(`<table${unit.tableAttrs ? ` ${unit.tableAttrs}` : ''}>${unit.tableHead ?? ''}<tbody>`)
      openTableId = unit.tableId
    }
    parts.push(unit.html)
    if (unit.tableFoot) {
      parts.push('</tbody>', unit.tableFoot, '<tbody>')
    }
  }
  if (openTableId !== null) parts.push('</tbody></table>')
  return parts.join('\n')
}

/** يبني صفحة HTML نهائية بأوراق صريحة مرقّمة، مع إمكانية طبع جزء من الأوراق */
export function composeSheets(context: SheetContext, units: BodyUnit[], plan: SheetPlan, options: ComposeOptions): string {
  const totalSheets = plan.coverPages + plan.pages.length
  const selection = options.selection ?? plan.pages.map((_, index) => index)
  const includeCover = options.includeCover !== false && plan.coverPages > 0
  const sheets: string[] = []

  if (includeCover) {
    // الغلاف في الورقة الأفقية أقل ارتفاعاً: أنماط مدمجة تحفظ عرض المحتوى كاملاً
    const wide = context.page.widthMm > context.page.heightMm ? ' is-wide' : ''
    sheets.push(
      `<section class="sheet sheet-cover${wide}" data-page="1">${context.coverHtml}<div class="sheet-foot">${footHtml(
        context,
        options,
        1,
        totalSheets
      )}</div></section>`
    )
  }

  selection.forEach((pageIndex, position) => {
    const pageUnits = plan.pages[pageIndex]
    if (!pageUnits) return
    // الترقيم يبقى مرقّم الوثيقة الأصلية حتى لو طُبعت صفحة واحدة (ترتيب ثابت في الملف)
    const pageNumber = plan.coverPages + 1 + pageIndex
    const first = position === 0
    const header = first && options.showFullHeader ? context.headerHtml : ''
    const title = first ? context.titleHtml : ''
    const label = units[pageUnits[0]]?.label ? ` — ${units[pageUnits[0]].label}` : ''
    sheets.push(`<section class="sheet" data-page="${pageNumber}">
  <div class="sheet-top">${context.compactHeaderHtml}${label}</div>
  ${header}
  ${title}
  <div class="sheet-body" data-body="${pageNumber}">
    ${renderUnits(pageUnits.map((unitIndex) => units[unitIndex]))}
  </div>
  <div class="sheet-foot">${footHtml(context, options, pageNumber, totalSheets)}</div>
</section>`)
  })

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${options.documentTitle}</title>
<style>
${context.css}
${sheetCss(context)}
</style>
</head>
<body class="sheets">
${sheets.join('\n')}
</body>
</html>`
}

/** يفكّ مدى الصفحات المطلوب إلى فهارس صفحات داخل خطة الوثيقة */
export function resolveSelection(
  plan: SheetPlan,
  range: { from?: number | null; to?: number | null } | undefined,
  includeCover: boolean
): SheetSelection {
  const total = plan.coverPages + plan.pages.length
  const firstContent = plan.coverPages + 1
  const requestedFrom = range?.from ?? firstContent
  const requestedTo = range?.to ?? total
  const pages: number[] = []
  for (let pageNumber = requestedFrom; pageNumber <= requestedTo; pageNumber++) {
    const index = pageNumber - plan.coverPages - 1
    if (index >= 0 && index < plan.pages.length) pages.push(index)
  }
  /*
   * لا يُنتج المدى أي ورقة محتوى في حالتين مختلفتين:
   *  - طلب الغلاف وحده (رقم 1) ⇒ نطبع الغلاف فقط، فلا نضيف المحتوى.
   *  - رقم خارج أوراق الوثيقة (خطأ إدخال) ⇒ نطبع الوثيقة كاملة بدل ورقة مشوّهة.
   */
  if (pages.length === 0) {
    const outside = requestedFrom > total || requestedTo < (includeCover ? 1 : firstContent)
    if (outside) return { pages: plan.pages.map((_, index) => index), total }
  }
  return { pages, total }
}

function footHtml(context: SheetContext, options: ComposeOptions, pageNumber: number, totalSheets: number): string {
  const numbering =
    options.pageNumbers && totalSheets > 0
      ? `<span class="sheet-page">صفحة ${pageNumber} من ${totalSheets}</span>`
      : '<span class="sheet-page"></span>'
  return `<span class="sheet-note">${context.footNoteHtml || options.identity}</span>${numbering}`
}

/** أنماط الأوراق الصريحة (A4 كثابت) */
export function sheetCss(context: SheetContext): string {
  const { widthMm, heightMm, marginMm } = context.page
  /*
   * الواحدة تُنقص 0.8mm من طول الورقة: كروميوم يدفع للتقسيم عند تطابق الطولين
   * تماماً، فينتج فراغ ورقة بيضاء بعد كل صفحة عند الطبع. الفرق غير مرئي.
   */
  const safeHeight = Math.round((heightMm - 0.8) * 100) / 100
  return `
.sheets{background:#fff;}
.sheet{position:relative;width:${widthMm}mm;height:${safeHeight}mm;padding:${marginMm}mm;
  display:flex;flex-direction:column;overflow:hidden;background:#fff;page-break-after:always;
  break-after:page;box-sizing:border-box;}
.sheet:last-child{page-break-after:auto;break-after:auto;}
.sheet-cover{padding:0;overflow:hidden;display:flex;flex-direction:column;}
.sheet-top{font-size:.8em;color:#475569;border-bottom:1px solid #cbd5e1;padding-bottom:1mm;margin-bottom:2mm;
  display:flex;justify-content:space-between;gap:4mm;}
.sheet-cover .cover-band{background:linear-gradient(180deg,#1b3157,#204583);color:#fff;padding:${marginMm}mm;
  flex:0 0 auto;overflow:hidden;}
.sheet-cover .cover-body{flex:1 1 auto;min-height:0;padding:4mm ${marginMm}mm 0;overflow:hidden;}
.sheet-cover .sheet-foot{margin:0 ${marginMm}mm ${Math.min(marginMm, 6)}mm;flex:0 0 auto;}
/* غلاف الورقة الأفقية: يضغط المسافات ويوزّع البطاقات على أربعة أعمدة حتى لا يُقتطع */
.sheet-cover.is-wide .cover-band{padding:4mm 8mm 3mm;}
.sheet-cover.is-wide .cover-band .logo{height:11mm;}
.sheet-cover.is-wide .cover-school{font-size:1.1em;}
.sheet-cover.is-wide .cover-year{font-size:.85em;}
.sheet-cover.is-wide .cover-doc{font-size:1.4em;margin:3mm 0 1.6mm;padding:1.2mm 3mm;}
.sheet-cover.is-wide .cover-sub{font-size:.88em;}
.sheet-cover.is-wide .cover-tag{margin-top:2mm;}
.sheet-cover.is-wide .cover-tag span{font-size:.78em;padding:.5mm 2.2mm;}
.sheet-cover.is-wide .cover-body{padding:3mm 8mm 0;}
.sheet-cover.is-wide .cover-card{font-size:.88em;}
.sheet-cover.is-wide .cover-card th,.sheet-cover.is-wide .cover-card td{padding:.8mm 1.5mm;}
.sheet-cover.is-wide .cover-card th{width:34mm;}
.sheet-cover.is-wide .cover-facts{grid-template-columns:repeat(4,1fr);gap:2mm;}
.sheet-cover.is-wide .cover-fact{padding:1.2mm 2.2mm;}
.sheet-cover.is-wide .cover-fact b{font-size:1.05em;}
.sheet-cover.is-wide .cover-list{columns:2;column-gap:8mm;line-height:1.65;font-size:.85em;}
.sheet-cover.is-wide .section{margin:2mm 0 1mm;font-size:1em;}
.sheet-cover.is-wide .notice{font-size:.75em;padding:1mm 2mm;margin-top:1.5mm;}
.sheet-cover.is-wide .cover-sign{margin-top:4mm;}
.sheet-body{flex:1 1 auto;min-height:0;}
.sheet-foot{margin-top:auto;border-top:.8pt solid #cbd5e1;padding-top:1.4mm;display:flex;
  justify-content:space-between;align-items:center;font-size:.78em;color:#475569;}
.sheet-page{font-variant-numeric:tabular-nums;font-weight:700;color:#1b3157;}
@media screen{
  .sheets{padding:4mm 0;text-align:center;}
  .sheet{margin:0 auto 5mm;box-shadow:0 1px 6px rgba(15,23,42,.18);}
  .sheet:last-child{margin-bottom:0;}
}
@media print{.sheet{margin:0 !important;box-shadow:none;}}
`
}

/** ارتفاع المساحة المتاحة للكتابة في الورقة (بالبكسل عند 96 نقطة/إنش) */
export function usableHeightPx(page: SheetContext['page']): number {
  const mm = 96 / 25.4
  return (page.heightMm - page.marginMm * 2 - page.footMm) * mm
}
