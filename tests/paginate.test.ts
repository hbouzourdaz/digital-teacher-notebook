import { describe, expect, it } from 'vitest'
import {
  composeSheets,
  markUnits,
  measureDraft,
  measureScript,
  measureUnits,
  planSheets,
  plainText,
  resolveSelection,
  splitBodyUnits,
  topLevelChunks,
  usableHeightPx,
  type BodyUnit,
  type SheetContext
} from '@main/printing/paginate'

const body = `
<table class="grid">
  <thead><tr><th>القسم</th><th>المعدل</th></tr></thead>
  <tbody>
    <tr><td>2 متوسط 1</td><td>12</td></tr>
    <tr><td>2 متوسط 2</td><td>14</td></tr>
  </tbody>
  <tfoot><tr class="totals"><td colspan="2">المجموع</td></tr></tfoot>
</table>
<div class="notice">تنبيه داخلي</div>
`

describe('تقسيم جسم الوثيقة إلى وحدات', () => {
  it('يفصل الوسوم العليا فقط', () => {
    const chunks = topLevelChunks(`<div class="a"><div>داخلي</div></div><p>نص</p>`)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toContain('داخلي')
    expect(chunks[1]).toBe('<p>نص</p>')
  })

  it('يحوّل كل سطر جدول إلى وحدة ويحفظ الترويسة والتذييل', () => {
    const units = splitBodyUnits(body)
    const rows = units.filter((unit) => unit.tableId !== undefined)
    expect(rows).toHaveLength(2)
    expect(rows[0].tableHead).toContain('<thead>')
    expect(rows[0].tableAttrs).toContain('class="grid"')
    expect(rows[1].tableFoot).toContain('المجموع')
    expect(rows[0].tableFoot).toBeUndefined()
    expect(units[units.length - 1].html).toContain('تنبيه داخلي')
  })

  it('يجعل رأس كل يوم بداية ورقة جديدة (ما عدا اليوم الأول)', () => {
    const units = splitBodyUnits(
      `<div class="meta">عدد الحصص: 3</div>
      <table><tbody><tr class="dayhead"><td colspan="2">الأحد 27 سبتمبر 2026</td></tr><tr><td>حصة</td></tr>
      <tr class="dayhead"><td colspan="2">الاثنين 28 سبتمبر 2026</td></tr><tr><td>حصة</td></tr></tbody></table>`
    )
    const days = units.filter((unit) => /dayhead/.test(unit.html))
    expect(days).toHaveLength(2)
    // اليوم الأول يتبع كتلة الملخص في الورقة نفسها
    expect(days[0].breakBefore).toBeUndefined()
    // أما اليوم التالي فيبدأ ورقة مستقلة
    expect(days[1].breakBefore).toBe(true)
    expect(days[0].label).toContain('الأحد')
    expect(days[1].label).toContain('الاثنين')
  })

  it('يعتبر عنصر فاصل الصفحات قطعاً لا محتوى', () => {
    const units = splitBodyUnits(`<table><tbody><tr><td>أ</td></tr></tbody></table>
      <div style="page-break-after:always"></div>
      <table><tbody><tr><td>ب</td></tr></tbody></table>`)
    expect(units).toHaveLength(2)
    expect(units[1].breakBefore).toBe(true)
  })

  it('يعلّم الوحدات للقياس دون تغيير ترتيبها', () => {
    const { html, units } = markUnits(body)
    expect(units).toHaveLength(3)
    expect(html).toContain('<tr data-unit="0">')
    expect(html).toContain('<div data-unit="2" class="notice">')
  })

  it('يستخرج النص من الوسوم', () => {
    expect(plainText('<div class="section">ملخّص <b>الأقسام</b></div>')).toBe('ملخّص الأقسام')
  })
})

describe('توزيع الوحدات على الأوراق', () => {
  const heavy = (heights: number[]): BodyUnit[] => heights.map((height) => ({ html: '<tr></tr>', tableId: 1, height }))

  it('يملأ الورقة حتى الحد المتاح ثم ينتقل', () => {
    const plan = planSheets(heavy([100, 100, 100]), 200, 1)
    expect(plan.pages).toEqual([
      [0, 1],
      [2]
    ])
  })

  it('يحترم بداية الورقة المفروضة (يوم جديد)', () => {
    const units = heavy([50, 50, 50])
    units[2].breakBefore = true
    const plan = planSheets(units, 1000, 1)
    expect(plan.pages).toEqual([[0, 1], [2]])
  })

  it('يضع الوحدة الضخمة في ورقة خاصة', () => {
    const plan = planSheets(heavy([120, 30]), 100, 1)
    expect(plan.pages).toEqual([[0], [1]])
  })

  it('يخصم كتلة الرأس من ارتفاع الورقة الأولى وحدها', () => {
    // مساحة 300، رأس 100 ⇒ الورقة الأولى تتسع 200 ثم تعود الورقات التالية إلى 300
    const plan = planSheets(heavy([100, 100, 100, 100, 100]), 300, 1, 100)
    expect(plan.pages).toEqual([
      [0, 1],
      [2, 3, 4]
    ])
    // بلا رأس تُملأ الورقة الأولى كاملة
    expect(planSheets(heavy([100, 100, 100, 100, 100]), 300, 1, 0).pages).toEqual([
      [0, 1, 2],
      [3, 4]
    ])
  })

  it('يحسب ارتفاع الورقة المتاح من مقاس A4 والهوامش', () => {
    const usable = usableHeightPx({ widthMm: 210, heightMm: 297, marginMm: 12, footMm: 8 })
    // 297 - 24 - 8 = 265 مم ≈ 1002 بكسل (96 نقطة/إنش)
    expect(Math.round(usable)).toBe(1002)
  })

  it('يقيس الوحدات من مستند شبيه', () => {
    const doc = {
      querySelectorAll: () => [
        { getBoundingClientRect: () => ({ height: 12.345 }) },
        { getBoundingClientRect: () => ({ height: 20 }) }
      ]
    }
    expect(measureUnits(doc)).toEqual([12.35, 20])
  })

  it('يقيس المسودة كاملة: الوحدات + كتلة الرأس', () => {
    const doc = {
      querySelectorAll: () => [
        { getBoundingClientRect: () => ({ height: 31.2 }) },
        { getBoundingClientRect: () => ({ height: 14 }) }
      ],
      querySelector: () => ({ getBoundingClientRect: () => ({ height: 182.456 }) })
    }
    expect(measureDraft(doc)).toEqual({ units: [31.2, 14], overhead: 182.46 })
    // مستند بلا كتلة رأس معلّمة ⇒ صفر (لا انهيار)
    expect(measureDraft({ querySelectorAll: () => [], querySelector: () => null })).toEqual({ units: [], overhead: 0 })
    // الدالة تُرسل كنص إلى نافذة القياس، فتكون مكتفية بذاتها
    expect(measureScript()).toContain('function measureDraft')
    expect(measureScript()).toContain("(document)")
  })
})

describe('تركيب الأوراق النهائية', () => {
  const context: SheetContext = {
    css: '.x{}',
    headerHtml: '<div class="doc-head">الرأس</div>',
    titleHtml: '<div class="title">الدفتر اليومي</div>',
    compactHeaderHtml: '<span>متوسطة</span>',
    bodyHtml: '',
    footNoteHtml: 'وثيقة داخلية',
    coverHtml: '<div class="cover-band">غلاف</div><div class="cover-body">بطاقة</div>',
    page: { widthMm: 210, heightMm: 297, marginMm: 12, footMm: 8 }
  }

  it('يرقّم الأوراق مع احتساب الغلاف صفحة أولى', () => {
    const units: BodyUnit[] = [{ html: '<tr><td>أ</td></tr>', tableId: 1 }, { html: '<tr><td>ب</td></tr>', tableId: 1 }]
    const plan = { pages: [[0], [1]], coverPages: 1 }
    const html = composeSheets(context, units, plan, {
      pageNumbers: true,
      showFullHeader: true,
      documentTitle: 'الدفتر اليومي',
      identity: 'متوسطة — الأستاذ'
    })
    expect(html).toContain('class="sheet sheet-cover"')
    expect(html).toContain('صفحة 1 من 3')
    expect(html).toContain('صفحة 3 من 3')
    expect(html).toContain('الرأس')
    expect((html.match(/<tbody>/g) ?? []).length).toBe(2)
  })

  it('يطبع ورقة واحدة فقط مع الحفاظ على ترقيم الوثيقة الكامل', () => {
    const units: BodyUnit[] = [{ html: '<tr><td>أ</td></tr>', tableId: 1 }]
    const plan = { pages: [[0], [0], [0]], coverPages: 1 }
    const html = composeSheets(context, units, plan, {
      pageNumbers: true,
      showFullHeader: true,
      documentTitle: 'الدفتر اليومي',
      identity: 'متوسطة — الأستاذ',
      selection: [1],
      includeCover: false
    })
    expect(html).not.toContain('<section class="sheet sheet-cover"')
    expect(html).toContain('صفحة 3 من 4')
    expect((html.match(/class="sheet"/g) ?? []).length).toBe(1)
  })

  it('يفكّ مدى الصفحات إلى فهارس مع احتساب الغلاف', () => {
    const plan = { pages: [[0], [1], [2]], coverPages: 1 }
    expect(resolveSelection(plan, undefined, true).pages).toEqual([0, 1, 2])
    expect(resolveSelection(plan, { from: 2, to: 2 }, true)).toEqual({ pages: [0], total: 4 })
    expect(resolveSelection(plan, { from: 1, to: 1 }, true).pages).toEqual([])
    // مدى خارج الجدول لا يُفشل الطباعة: تُطبع الوثيقة كاملة
    expect(resolveSelection(plan, { from: 90, to: 99 }, true).pages).toEqual([0, 1, 2])
  })

  it('يمكن إخفاء الترقيم', () => {
    const html = composeSheets(context, [{ html: '<tr><td>أ</td></tr>', tableId: 1 }], { pages: [[0]], coverPages: 0 }, {
      pageNumbers: false,
      showFullHeader: false,
      documentTitle: 'وثيقة',
      identity: ''
    })
    expect(html).not.toContain('صفحة 1 من 1')
    expect(html).not.toContain('class="doc-head"')
  })
})
