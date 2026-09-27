import { useEffect, useMemo, useRef, useState } from 'react'
import { BookMarked, CalendarDays, FileDown, Layers, Printer, RefreshCw, ScrollText } from 'lucide-react'
import type { Student } from '@shared/types'
import {
  PRINT_DOCUMENTS,
  PRINT_DOCUMENT_META,
  type DocumentType,
  type PrintPageInfo
} from '@shared/print'
import { TERM_LABELS } from '@shared/constants'
import { addDays, endOfMonth, startOfMonth, startOfWeek, todayISO } from '@shared/utils/date'
import { useApp } from '../store/app'
import { parseRoute } from '../router'
import { Badge, Button, Checkbox, EmptyState, Field, Input, LoadingBlock, PageHeader, Select } from '../components/ui'

/** يتحقق أن قيمة المسار وثيقة معروفة، وإلا يعيد الافتراضي */
function asDocument(value: string | undefined): DocumentType | null {
  return PRINT_DOCUMENTS.includes(value as DocumentType) ? (value as DocumentType) : null
}

/** ارتفاع ورقة A4 بالبكسل (96 نقطة/إنش) — لضبط ارتفاع المعاينة على عدد الأوراق */
function sheetHeightPx(orientation: string | undefined, totalPages: number): number {
  const mm = orientation === 'landscape' ? 210 : 297
  const px = Math.round((mm * 96) / 25.4)
  return Math.max(px, totalPages * px + Math.max(0, totalPages - 1) * 14)
}

export default function PrintCenterPage(): JSX.Element {
  const classes = useApp((state) => state.classes)
  const route = useApp((state) => state.route)
  const navigate = useApp((state) => state.navigate)
  const toast = useApp((state) => state.toast)

  const query = useMemo(() => parseRoute(route).query, [route])
  const [document, setDocument] = useState<DocumentType>(asDocument(query.document) ?? 'daily-notebook')
  const [classId, setClassId] = useState<number | null>(query.class ? Number(query.class) : null)
  const [term, setTerm] = useState(Number(query.term ?? 1))
  const [studentId, setStudentId] = useState<number | null>(query.student ? Number(query.student) : null)
  const [students, setStudents] = useState<Student[]>([])
  const [from, setFrom] = useState(query.from ?? query.date ?? startOfMonth(todayISO()))
  const [to, setTo] = useState(query.to ?? query.date ?? todayISO())
  const [threshold, setThreshold] = useState(Number(query.threshold ?? 10))
  const [includeHeader, setIncludeHeader] = useState(true)
  const [cover, setCover] = useState(true)
  const [pageNumbers, setPageNumbers] = useState(true)
  const [pageFrom, setPageFrom] = useState<number | null>(null)
  const [pageTo, setPageTo] = useState<number | null>(null)
  const [rangeMode, setRangeMode] = useState(false)
  const [html, setHtml] = useState('')
  const [info, setInfo] = useState<PrintPageInfo | null>(null)
  const [title, setTitle] = useState('')
  const [orientation, setOrientation] = useState('portrait')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const [previewWidth, setPreviewWidth] = useState(900)

  /** عرض المساحة المتاحة للمعاينة — يُقاس فيتغيّر التصغير مع حجم النافذة */
  useEffect(() => {
    const node = previewRef.current
    if (!node) return
    const apply = (width: number): void => setPreviewWidth(Math.max(240, Math.floor(width) - 6))
    apply(node.clientWidth)
    const observer = new ResizeObserver((entries) => apply(entries[0]?.contentRect.width ?? node.clientWidth))
    observer.observe(node)
    return () => observer.disconnect()
  }, [html])

  const meta = PRINT_DOCUMENT_META.find((item) => item.value === document)

  /**
   * أي زرّ «طباعة» في التطبيق يفتح هذه الشاشة بسياق جاهز
   * (الوثيقة، القسم، الفصل، المدى، التلميذ) — لذلك نقرأ المعطيات في كل مرة
   * يتغيّر المسار، لا في أول عرض فقط.
   */
  useEffect(() => {
    const requested = asDocument(query.document)
    if (requested) setDocument(requested)
    if (query.class) setClassId(Number(query.class))
    if (query.term) setTerm(Number(query.term))
    if (query.student) setStudentId(Number(query.student))
    const single = query.date
    if (single) {
      setFrom(single)
      setTo(single)
    } else {
      if (query.from) setFrom(query.from)
      if (query.to) setTo(query.to)
    }
  }, [query])

  /** القسم الافتراضي: الوثائق التي تحتاج قسماً تختار الأول، والباقي «كل الأقسام» */
  useEffect(() => {
    if (!meta) return
    if (classId && classes.some((row) => row.id === classId)) return
    if (meta.needsClass) {
      if (classes.length > 0) setClassId(classes[0].id)
      return
    }
    if (!query.class) setClassId(null)
  }, [meta, classes, classId, query.class])

  useEffect(() => {
    if (!classId) {
      setStudents([])
      return
    }
    let cancelled = false
    window.api.students
      .list({ class_id: classId })
      .then((rows) => {
        if (cancelled) return
        setStudents(rows)
        setStudentId((current) => (current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? null))
      })
      .catch(() => setStudents([]))
    return () => {
      cancelled = true
    }
  }, [classId])

  /** أي تغيير في معطيات الوثيقة يُلغي اختيار الصفحات (لأن الترقيم يتغيّر) */
  useEffect(() => {
    setPageFrom(null)
    setPageTo(null)
    setRangeMode(false)
  }, [document, classId, term, studentId, from, to])

  const payload = useMemo(
    () => ({
      document,
      options: {
        class_id: classId,
        term: term as 1 | 2 | 3,
        student_id: document === 'student-report' ? studentId : null,
        from: meta?.needsRange ? from : undefined,
        to: meta?.needsRange ? to : undefined,
        date: meta?.needsRange && from === to ? from : undefined,
        passing_threshold: meta?.showsAverages ? threshold : undefined,
        includeHeader,
        cover,
        page_numbers: pageNumbers,
        page_from: pageFrom,
        page_to: pageTo
      }
    }),
    [
      document,
      classId,
      term,
      studentId,
      from,
      to,
      includeHeader,
      threshold,
      cover,
      pageNumbers,
      pageFrom,
      pageTo,
      meta?.needsRange,
      meta?.showsAverages
    ]
  )

  const generate = async (): Promise<void> => {
    setLoading(true)
    try {
      const built = await window.api.print.preview(payload)
      setHtml(built.html)
      setTitle(built.title)
      setOrientation(built.orientation)
      setInfo({
        totalPages: built.totalPages,
        printedPages: built.printedPages,
        pageLabels: built.pageLabels,
        warnings: built.warnings
      })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'تعذر إنشاء الوثيقة', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload])

  const missing = useMemo(() => {
    if (meta?.needsClass && !classId) return 'اختر القسم أولاً.'
    if (meta?.needsStudent && !studentId) return 'اختر التلميذ أولاً.'
    return null
  }, [meta?.needsClass, meta?.needsStudent, classId, studentId])

  /** الطبع يمرّ عبر نافذة أصلية في العملية الرئيسية: خط عربي محلي ومقاس A4 صحيح */
  const doPrint = async (): Promise<void> => {
    if (missing) {
      toast(missing, 'warning')
      return
    }
    setBusy(true)
    try {
      const result = await window.api.print.printer(payload)
      if (result.printed) {
        toast(
          result.printedPages.length > 1
            ? `تم إرسال الوثيقة إلى الطابعة — ${result.printedPages.length} ورقة`
            : 'تم إرسال الورقة إلى الطابعة'
        )
      } else if (result.canceled) toast('أُلغي أمر الطباعة', 'info')
      else toast(result.failureReason || 'تعذّر الطبع — تحقّق من الطابعة الافتراضية', 'error')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'تعذّر الطبع', 'error')
    } finally {
      setBusy(false)
    }
  }

  const savePdf = async (): Promise<void> => {
    if (missing) {
      toast(missing, 'warning')
      return
    }
    setBusy(true)
    try {
      const result = await window.api.print.pdf(payload)
      if (result.saved && result.path)
        toast(`مسار الملف: ${result.path} (${result.printedPages.length} ورقة)`, 'info')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'تعذّر إنشاء ملف PDF', 'error')
    } finally {
      setBusy(false)
    }
  }

  /** طبع ورقة واحدة بضغطة: الغلاف أو ورقة يوم/قسم محدّد */
  const printSinglePage = async (page: number): Promise<void> => {
    setPageFrom(page)
    setPageTo(page)
    setRangeMode(true)
  }

  const presets: Array<{ label: string; from: string; to: string }> = [
    { label: 'اليوم', from: todayISO(), to: todayISO() },
    { label: 'هذا الأسبوع', from: startOfWeek(todayISO()), to: todayISO() },
    { label: 'هذا الشهر', from: startOfMonth(todayISO()), to: endOfMonth(todayISO()) },
    { label: 'آخر 30 يوماً', from: addDays(todayISO(), -30), to: todayISO() }
  ]

  /** أوراق لها اسم (يوم من الدفتر اليومي أو قسم) — للطبع السريع بضغطة */
  const namedSheets = (info?.pageLabels ?? []).filter((row) => row.label.trim().length > 0)
  const totalPages = info?.totalPages ?? 0
  const printedCount = info?.printedPages.length ?? 0
  /*
   * قياس الورقة الحقيقي بالمليمتر (A4 = 210×297مم أي 794×1123 بكسل عند 96ن/إنش)
   * ثم تصغير المعاينة لتناسب المساحة المتاحة — بلا أي شريط تمرير أفقي.
   */
  const frameWidth = orientation === 'landscape' ? 1130 : 800
  const frameHeight = sheetHeightPx(orientation, totalPages)
  const scale = Math.min(1, Math.max(0.2, previewWidth / frameWidth))
  const selectionLabel =
    pageFrom === null && pageTo === null
      ? `كل الأوراق (${totalPages})`
      : `${pageFrom ?? 1} → ${pageTo ?? totalPages}`

  return (
    <div>
      <PageHeader
        title="مركز الطباعة"
        subtitle="مقاس A4 — خط عربي محلي — غلاف لكل وثيقة وترقيم «صفحة X من Y» — معاينة قبل الطباعة أو الحفظ كملف PDF"
        actions={
          <>
            <Button size="sm" icon={<RefreshCw className="h-4 w-4" />} loading={loading} onClick={() => void generate()}>
              تحديث المعاينة
            </Button>
            <Button size="sm" variant="primary" icon={<Printer className="h-4 w-4" />} loading={busy} onClick={() => void doPrint()}>
              طباعة {printedCount > 0 ? `(${printedCount})` : ''}
            </Button>
            <Button size="sm" icon={<FileDown className="h-4 w-4" />} loading={busy} onClick={() => void savePdf()}>
              حفظ PDF
            </Button>
          </>
        }
      />

      <div className="card card-pad mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Field label="الوثيقة">
          <Select value={document} onChange={(event) => setDocument(event.target.value as DocumentType)}>
            {PRINT_DOCUMENT_META.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="القسم" hint={meta?.needsClass ? undefined : 'اتركه «بدون قسم» لطبع كل الأقسام'}>
          <Select value={classId ?? ''} onChange={(event) => setClassId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">— بدون قسم (الكل) —</option>
            {classes.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="الفصل">
          <Select value={term} onChange={(event) => setTerm(Number(event.target.value))}>
            {[1, 2, 3].map((value) => (
              <option key={value} value={value}>
                {TERM_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="التلميذ (لتقرير التلميذ)">
          <Select
            value={studentId ?? ''}
            onChange={(event) => setStudentId(event.target.value ? Number(event.target.value) : null)}
            disabled={!classId}
          >
            <option value="">— اختر —</option>
            {students.map((row) => (
              <option key={row.id} value={row.id}>
                {row.full_name}
              </option>
            ))}
          </Select>
        </Field>
        {meta?.needsRange && (
          <>
            <Field label="من تاريخ">
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="إلى تاريخ">
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
            <div className="flex flex-wrap items-end gap-2 md:col-span-2">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  size="sm"
                  variant={from === preset.from && to === preset.to ? 'primary' : 'ghost'}
                  onClick={() => {
                    setFrom(preset.from)
                    setTo(preset.to)
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </>
        )}
        {meta?.showsAverages && (
          <Field label="عتبة التمييز اللوني" hint="تُلوَّن المعدلات فوقها بالأخضر وتحتها بالأحمر">
            <Input type="number" min={0} max={20} value={threshold} onChange={(event) => setThreshold(Number(event.target.value || 0))} />
          </Field>
        )}
        <div className="flex flex-col items-start gap-2">
          <Checkbox checked={cover} onChange={setCover} label="ورقة غلاف للوثيقة" />
          <Checkbox checked={pageNumbers} onChange={setPageNumbers} label="ترقيم الصفحات (صفحة X من Y)" />
          <Checkbox checked={includeHeader} onChange={setIncludeHeader} label="إظهار رأس الوثيقة (المؤسسة والأستاذ)" />
        </div>
      </div>

      {/* اختيار الأوراق: كل الأوراق، أو ورقة/مدى محدَّد بترقيم الوثيقة الكامل */}
      <div className="card card-pad mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-brand-600 dark:text-brand-300" />
            <span className="font-semibold">أوراق الوثيقة</span>
            <Badge tone="info">{totalPages} ورقة</Badge>
            <Badge tone={printedCount < totalPages ? 'warning' : 'success'}>
              {pageFrom === null && pageTo === null ? 'ستُطبع كل الأوراق' : `ستُطبع ${printedCount} ورقة`}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={pageFrom === null && pageTo === null ? 'primary' : 'ghost'}
              onClick={() => {
                setRangeMode(false)
                setPageFrom(null)
                setPageTo(null)
              }}
            >
              كل الأوراق
            </Button>
            {cover && totalPages > 0 && (
              <Button
                size="sm"
                variant={pageFrom === 1 && pageTo === 1 ? 'primary' : 'ghost'}
                icon={<BookMarked className="h-3.5 w-3.5" />}
                onClick={() => void printSinglePage(1)}
              >
                الغلاف فقط
              </Button>
            )}
            <Button size="sm" variant={rangeMode ? 'primary' : 'ghost'} onClick={() => setRangeMode((value) => !value)}>
              مدى مخصّص
            </Button>
          </div>
        </div>

        {rangeMode && (
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="من صفحة" hint={`1 إلى ${Math.max(1, totalPages)}`}>
              <Input
                type="number"
                min={1}
                max={Math.max(1, totalPages)}
                value={pageFrom ?? 1}
                onChange={(event) => {
                  const value = Math.min(Math.max(1, Number(event.target.value || 1)), Math.max(1, totalPages))
                  setPageFrom(value)
                  setPageTo((current) => (current !== null && current < value ? value : current))
                }}
              />
            </Field>
            <Field label="إلى صفحة" hint={`1 إلى ${Math.max(1, totalPages)}`}>
              <Input
                type="number"
                min={1}
                max={Math.max(1, totalPages)}
                value={pageTo ?? totalPages}
                onChange={(event) => {
                  const value = Math.min(Math.max(1, Number(event.target.value || 1)), Math.max(1, totalPages))
                  setPageTo(value)
                  setPageFrom((current) => (current !== null && current > value ? value : current))
                }}
              />
            </Field>
            <div className="muted flex items-end pb-2 text-xs sm:col-span-2 lg:col-span-2">
              الترقيم يبقى ترقيم الوثيقة كاملة، فلا يتغيّر ترتيب الأوراق في الملف الورقي عند طبعه على دفعات.
            </div>
          </div>
        )}

        {namedSheets.length > 0 && (
          <>
            <div className="muted mb-2 flex items-center gap-1.5 text-xs">
              <CalendarDays className="h-3.5 w-3.5" />
              طبع ورقة واحدة بضغطة (اليوم أو القسم) — الصفحة تُطبع برأسها وترقيمها الكامل:
            </div>
            <div className="flex flex-wrap gap-2">
              {namedSheets.map((row) => (
                <button
                  key={row.page}
                  type="button"
                  onClick={() => void printSinglePage(row.page)}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                    pageFrom === row.page && pageTo === row.page
                      ? 'border-brand-500 bg-brand-50 font-semibold text-brand-800 dark:bg-brand-900/40 dark:text-brand-100'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-brand-400 hover:text-brand-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-brand-200'
                  }`}
                >
                  <span className="num">صفحة {row.page}</span> — {row.label}
                </button>
              ))}
            </div>
          </>
        )}

        {info && info.warnings.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
            {info.warnings.join(' • ')}
          </div>
        )}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone="info">A4 — {meta?.label ?? ''}</Badge>
        <Badge>{TERM_LABELS[term] ?? ''}</Badge>
        {classId && <Badge>{classes.find((row) => row.id === classId)?.name ?? ''}</Badge>}
        {!classId && <Badge>كل الأقسام</Badge>}
        <Badge tone={meta?.orientation === 'landscape' ? 'warning' : 'neutral'}>
          {meta?.orientation === 'landscape' ? 'أفقي' : 'عمودي'}
        </Badge>
        {cover && <Badge tone="success">غلاف</Badge>}
        {pageNumbers && <Badge>ترقيم</Badge>}
        <Badge>{selectionLabel}</Badge>
        {missing && <Badge tone="danger">{missing}</Badge>}
        <button className="muted text-xs underline" onClick={() => navigate('/settings')}>
          تعديل إعدادات الطباعة (الرأس، الهامش، حجم الخط، الشعار)
        </button>
      </div>

      {loading && html === '' ? (
        <LoadingBlock label="جارٍ إنشاء الوثيقة وترقيم صفحاتها…" />
      ) : html === '' ? (
        <EmptyState
          icon={<ScrollText className="h-6 w-6" />}
          title="لا توجد معاينة"
          message="اختر الوثيقة والمعطيات ثم اضغط «تحديث المعاينة»."
          action={
            <Button variant="primary" onClick={() => void generate()}>
              إنشاء المعاينة
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border bg-slate-200 p-3 dark:bg-slate-800">
          <div className="muted mb-2 text-center text-xs">
            {title} — {totalPages} ورقة بمقاس A4 {scale < 1 ? `(مصغّرة إلى ${Math.round(scale * 100)}% لتناسب العرض)` : '(بالحجم الحقيقي)'}
          </div>
          {/*
           * الورقة بعرضها الحقيقي والواجهة تُصغّرها لتناسب المساحة، فلا يظهر
           * شريط تمرير أفقي أبداً. والتكبير يرجع 100% تلقائياً إذا اتّسع المكان.
           */}
          <div ref={previewRef} className="scroll-y max-h-[72vh] overflow-hidden">
            <div className="relative mx-auto" style={{ height: `${Math.ceil(frameHeight * scale)}px`, width: `${Math.ceil(frameWidth * scale)}px` }}>
              <iframe
                ref={frameRef}
                title="معاينة الطباعة"
                srcDoc={html}
                sandbox="allow-same-origin"
                style={{
                  width: `${frameWidth}px`,
                  height: `${frameHeight}px`,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top right',
                  position: 'absolute',
                  top: 0,
                  right: 0
                }}
                className="rounded bg-white shadow-inner"
              />
            </div>
          </div>
        </div>
      )}

      <p className="muted mt-3 text-xs leading-relaxed">
        تُبنى الوثائق من بياناتك المحلية فقط، وكل وثيقة تبدأ بورقة غلاف تحمل هوية المؤسسة والأستاذ والفترة ومحتوى الوثيقة،
        ثم أوراق مرقّمة «صفحة X من Y» مع رأس مختصر يتكرّر في أعلى كل ورقة وتذييل ثابت. الدفتر اليومي يبدأ كل يوم في ورقة
        جديدة، فيمكنك طبع ورقة اليوم وحدها من الأزرار أعلاه دون أن يتغيّر ترتيب الترقيم في الملف. الطبع يمرّ عبر نافذة أصلية
        تحفظ مقاس A4 والاتجاه والخط العربي المرفق داخل التطبيق (resources/fonts). إعدادات كل وثيقة على حدة تُضبط من
        الإعدادات ← الطباعة.
      </p>
    </div>
  )
}
