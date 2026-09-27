import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PrintDocumentInput } from '@shared/schemas'
import {
  DAY_LABELS,
  FORMULA_COMPONENT_LABELS,
  GRADEBOOK_ROWS_HINT,
  SCHOOL_DAYS,
  TERM_LABELS,
  TIME_SLOTS
} from '@shared/constants'
import { dayOfWeek, formatArabicDate, formatArabicDateWithDay, todayISO } from '@shared/utils/date'
import { describeFormula, parseFormulaComponents } from '@shared/utils/grades'
import { slotRowSpan } from '@shared/utils/schedule'
import { getClass, classStats, listClasses } from '../repositories/classes'
import { getSchool, getTeacher } from '../repositories/org'
import { getDocumentPrintSettings } from '../repositories/settings'
import { PRINT_DOCUMENT_META, type DocumentType } from '@shared/print'
import { markUnits, renderUnits, type BodyUnit, type SheetContext } from './paginate'
import { listStudents } from '../repositories/students'
import { listSchedule } from '../repositories/schedule'
import { listLessons } from '../repositories/lessons'
import { attendanceForClass, attendanceForLesson, lessonAbsenceTallies } from '../repositories/attendance'
import { listAssessments, listContinuous } from '../repositories/assessments'
import { listEvents } from '../repositories/events'
import { listPlan, planProgress } from '../repositories/plan'
import { listBank } from '../repositories/plan'
import { activeYearId, all, one, resolveYear } from '../repositories/base'
import { gradebook } from '../services/gradeService'
import { studentHistory } from '../repositories/students'
import { getPaths } from '../filesystem/paths'

const AR = {
  school: 'المؤسسة',
  teacher: 'الأستاذ',
  subject: 'المادة',
  year: 'السنة الدراسية',
  printedOn: 'تاريخ الطبع',
  doc: 'الوثيقة'
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function num(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

/** @font-face محلي فقط — لا يوجد أي CDN أو Google Fonts */
const FONT_FILES: Array<[string, string, string]> = [
  ['Amiri', 'Amiri-Regular.ttf', '400'],
  ['Amiri', 'Amiri-Bold.ttf', '700'],
  ['Tajawal', 'Tajawal-Regular.ttf', '400'],
  ['Tajawal', 'Tajawal-Medium.ttf', '500'],
  ['Tajawal', 'Tajawal-Bold.ttf', '700'],
  ['Tajawal', 'Tajawal-ExtraBold.ttf', '800']
]

function fontFace(): string {
  const fontsDir = join(getPaths().resources, 'fonts')
  const faces: string[] = []
  for (const [family, file, weight] of FONT_FILES) {
    const full = join(fontsDir, file)
    if (!existsSync(full)) continue
    faces.push(
      `@font-face{font-family:'${family}';src:url('file:///${full.replace(/\\/g, '/')}') format('truetype');font-weight:${weight};font-style:normal;font-display:block;}`
    )
  }
  return faces.join('\n')
}

interface DocContext {
  /** نوع الوثيقة — يُستعمل لاختيار نطاق إعدادات الطباعة الخاص بها */
  document: DocumentType
  title: string
  orientation: 'portrait' | 'landscape'
  body: string
  subtitle?: string
}

/** أسر خطوط محلية فقط — لا يوجد أي CDN أو Google Fonts */
const FONT_STACKS: Record<string, string> = {
  Amiri: "'Amiri','Traditional Arabic','Times New Roman',serif",
  Tajawal: "'Tajawal','Segoe UI','Tahoma',sans-serif",
  'Traditional Arabic': "'Traditional Arabic','Amiri','Times New Roman',serif",
  'Times New Roman': "'Times New Roman','Amiri',serif"
}

function fontStack(family: string | null | undefined): string {
  return FONT_STACKS[family ?? ''] ?? FONT_STACKS.Amiri
}

type PrintSettings = ReturnType<typeof getDocumentPrintSettings>

/** أبعاد الورقة بالمليمترات حسب الاتجاه */
function pageBox(orientation: 'portrait' | 'landscape', marginMm: number): SheetContext['page'] {
  return orientation === 'landscape'
    ? { widthMm: 297, heightMm: 210, marginMm, footMm: 8 }
    : { widthMm: 210, heightMm: 297, marginMm, footMm: 8 }
}

function documentStyles(
  settings: PrintSettings,
  orientation: 'portrait' | 'landscape',
  marginMm: number
): string {
  const paper = settings.paper === 'A4' ? 'A4' : 'A4'
  /* الوثيقة الأفقية تُضغط تلقائياً قليلاً حتى لا يتجاوز محتواها ارتفاع A4 */
  const wide = orientation === 'landscape'
  const squeeze = wide ? `body{--squeeze:.92;}
.title{font-size:1.3em;padding:1.2mm 3mm;}
.doc-head{padding:2mm 3mm;margin-bottom:2mm;}
.logo{height:12mm;}
.meta{margin-bottom:2mm;}
table{font-size:.88em;}
th,td{padding:.8mm 1.4mm;}
.section{margin:2.5mm 0 1mm;}
.sign{margin-top:5mm;}
.foot{margin-top:3mm;}` : ''
  return `@page{ size: ${paper} ${orientation}; margin: 0; }
${fontFace()}
:root{
  --ink:#0f172a; --muted:#475569; --line:#94a3b8; --soft:#e2e8f0;
  --head:#1b3157; --head-dark:#152547; --brand:#204583; --brand-soft:#eef5fd; --brand-line:#b4d1f4;
  --zebra:#f7fafd; --ok:#047857; --ok-bg:#ecfdf5; --bad:#b91c1c; --bad-bg:#fef2f2;
  --warn:#b45309; --warn-bg:#fffbeb; --warn-line:#fde68a;
}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;background:#fff;color:var(--ink);}
body{font-family:${fontStack(settings.font_family)};font-size:${settings.font_size}px;}
.page{padding:${marginMm}mm;position:relative;}

/* — رأس الوثيقة: كتلة ملوّنة بخط فاصل سميك كما في الوثائق الرسمية — */
.doc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;
  border:1px solid var(--brand-line);border-top:3px solid var(--brand);border-radius:2mm;
  background:var(--brand-soft);padding:3mm 4mm;margin-bottom:3mm;}
.logo{height:16mm;object-fit:contain;margin-bottom:1mm;}
.head-block{font-size:1.04em;line-height:1.8;}
.head-block .strong{font-weight:700;color:var(--head-dark);}
.title{text-align:center;font-size:1.5em;font-weight:700;color:#fff;background:var(--head);
  padding:1.6mm 3mm;border-radius:2mm;margin:0 0 1.2mm;letter-spacing:.2px;}
.subtitle{text-align:center;color:var(--head);background:var(--brand-soft);border:1px solid var(--brand-line);
  font-size:.95em;padding:1mm 2mm;border-radius:2mm;margin-bottom:3.5mm;}
.meta{display:flex;justify-content:space-between;flex-wrap:wrap;gap:4mm;font-size:.94em;margin-bottom:3mm;
  border:1px solid var(--soft);border-inline-start:3px solid var(--brand);padding:2mm 3mm;background:#fbfcfe;border-radius:1.5mm;}

/* — الجداول: ترويسة كحلية داكنة، أسطر مخططة، أعمدة رقمية وسطية — */
table{width:100%;border-collapse:collapse;font-size:.95em;}
th,td{border:1px solid #cbd5e1;padding:1.1mm 1.6mm;text-align:right;vertical-align:middle;}
th{background:var(--head);color:#fff;font-weight:700;border-color:var(--head-dark);}
thead{display:table-header-group;}
tbody tr:nth-child(even) td{background:var(--zebra);}
tbody tr:nth-child(even) td.num{background:#eef3f9;}
tr{page-break-inside:avoid;}
.num{text-align:center;font-variant-numeric:tabular-nums;width:8mm;background:#f3f6fa;color:var(--head);font-weight:700;}
.center{text-align:center;}
.totals td,.totals th{font-weight:700;background:var(--brand-soft);color:var(--head-dark);}
.stages{white-space:pre-wrap;line-height:1.7;color:#334155;}
.dayhead td{background:var(--brand-soft);font-weight:700;color:var(--head-dark);text-align:center;
  border-top:1px solid var(--brand-line);border-bottom:1px solid var(--brand-line);}
.section{margin:3.5mm 0 1.5mm;font-weight:700;font-size:1.08em;color:var(--head);
  border-bottom:.8pt solid var(--soft);border-inline-start:3px solid var(--brand);padding:0 2mm 1mm;}
.foot{margin-top:5mm;border-top:.8pt solid var(--soft);padding-top:2mm;display:flex;
  justify-content:space-between;font-size:.85em;color:var(--muted);}
.sign{margin-top:8mm;display:flex;justify-content:space-between;font-size:.92em;}
.sign span{border-top:.8pt dashed var(--line);padding-top:1.5mm;min-width:50mm;text-align:center;color:var(--muted);}
.empty{border:1px dashed var(--line);padding:6mm;text-align:center;color:var(--muted);background:#fbfcfe;border-radius:2mm;}
.notice{font-size:.82em;color:var(--warn);background:var(--warn-bg);border:1px solid var(--warn-line);
  border-inline-start:3px solid var(--warn);padding:1.5mm 2mm;margin-top:2.5mm;border-radius:1.5mm;}

/* — تمييز النتائج: أخضر عند العتبة، أحمر دونها — */
.pill{display:inline-block;min-width:9mm;padding:.3mm 1.4mm;border-radius:1.2mm;font-weight:700;font-variant-numeric:tabular-nums;}
.pill-ok{background:var(--ok-bg);color:var(--ok);border:1px solid #a7f3d0;}
.pill-bad{background:var(--bad-bg);color:var(--bad);border:1px solid #fecaca;}
.pill-none{color:var(--muted);}
.pill-info{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;}
.pill-muted{background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;}
.legend{display:flex;gap:4mm;align-items:center;font-size:.8em;color:var(--muted);margin-top:2mm;}
.legend i{display:inline-block;width:3mm;height:3mm;border-radius:50%;margin-inline-end:1mm;}
.legend .ok{background:#10b981;} .legend .bad{background:#ef4444;}
.bar-cell{position:relative;}
.taskbar{display:inline-block;height:2.6mm;border-radius:1.3mm;background:linear-gradient(90deg,#10b981,#34d399);vertical-align:middle;}
/** — أنماط الغلاف والأوراق — */
.cover-band{background:linear-gradient(180deg,#1b3157,#204583);color:#fff;}
.cover-band .logo{height:22mm;}
.cover-band-top{display:flex;justify-content:space-between;align-items:flex-start;gap:6mm;}
.cover-school{font-size:1.5em;font-weight:700;}
.cover-year{text-align:left;font-size:.95em;opacity:.95;line-height:1.7;}
.cover-doc{text-align:center;font-size:2em;font-weight:700;background:#fff;color:var(--head);
  border-radius:2mm;padding:2.5mm 4mm;margin:7mm 0 3mm;}
.cover-sub{text-align:center;font-size:1.02em;opacity:.95;}
.cover-tag{display:flex;gap:3mm;justify-content:center;margin-top:4mm;flex-wrap:wrap;}
.cover-tag span{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.35);border-radius:2mm;
  padding:.8mm 3mm;font-size:.9em;}
.cover-card{width:100%;border-collapse:collapse;font-size:.98em;}
.cover-card th{width:42mm;background:var(--brand-soft);color:var(--head-dark);border:1px solid var(--brand-line);
  text-align:right;padding:1.6mm 2mm;font-weight:700;}
.cover-card td{border:1px solid var(--brand-line);padding:1.6mm 2mm;background:#fff;}
.cover-facts{display:grid;grid-template-columns:repeat(2,1fr);gap:3mm;margin-top:2mm;}
.cover-fact{border:1px solid var(--soft);border-inline-start:3px solid var(--brand);border-radius:2mm;
  padding:2mm 3mm;background:#fbfcfe;}
.cover-fact b{display:block;font-size:1.25em;color:var(--head);font-variant-numeric:tabular-nums;}
.cover-fact span{font-size:.85em;color:var(--muted);}
.cover-list{margin:0;padding-inline-start:5mm;line-height:2;font-size:.96em;color:#334155;}
.cover-list li::marker{color:var(--brand);}
.cover-sign{display:flex;justify-content:space-between;margin-top:10mm;font-size:.92em;color:var(--muted);}
.cover-sign span{border-top:.8pt dashed var(--line);padding-top:1.5mm;min-width:55mm;text-align:center;}
@media print{ *{-webkit-print-color-adjust:exact;print-color-adjust:exact;} }
${squeeze}
`
}

export interface DocShell {
  css: string
  headerHtml: string
  titleHtml: string
  compactHeaderHtml: string
  bodyHtml: string
  units: BodyUnit[]
  footNoteHtml: string
  coverHtml: string
  page: SheetContext['page']
  identity: string
}

/** الكتلة الكاملة لهوية الوثيقة (المؤسسة، الأستاذ، المادة، السنة، الطبع) */
function headerBlock(settings: PrintSettings, options: Record<string, unknown>): string {
  if (options.includeHeader === false || settings.header_text) return ''
  const teacher = getTeacher()
  const school = getSchool()
  const logoFile = settings.logo_path && existsSync(settings.logo_path) ? settings.logo_path : school?.logo_path
  const logo =
    settings.show_logo && logoFile && existsSync(logoFile)
      ? `<img class="logo" src="file:///${logoFile.replace(/\\/g, '/')}" alt="" />`
      : ''
  const yearRow = one<{ label: string }>('SELECT label FROM academic_years WHERE id = ?', [activeYearId()])
  return `<div class="doc-head">
    <div class="head-block">
      <div class="strong">${esc(school?.name ?? AR.school)}</div>
      ${school?.wilaya ? `<div>ولاية ${esc(school.wilaya)}${school.municipality ? ` — بلدية ${esc(school.municipality)}` : ''}</div>` : ''}
      <div>${AR.teacher}: <span class="strong">${esc(teacher?.full_name ?? '—')}</span></div>
      <div>${AR.subject}: ${esc(teacher?.subject_label ?? '—')}</div>
    </div>
    <div class="head-block" style="text-align:left">
      ${logo}
      <div>${AR.year}: <span class="strong">${esc(yearRow?.label ?? '—')}</span></div>
      <div>${AR.printedOn}: ${esc(formatArabicDate(todayISO()))}</div>
    </div>
  </div>`
}

/** سطر الهوية المختصر الذي يتكرر في أعلى كل ورقة */
function compactHeader(): string {
  const teacher = getTeacher()
  const school = getSchool()
  return `<span>${esc(school?.name ?? AR.school)}</span><span>${esc(teacher?.full_name ?? '')}</span>`
}

/** يبني «قوقعة» الوثيقة: الأنماط + الرأس + العنوان + الوحدات المعلّمة + الغلاف */
function buildShell(
  ctx: DocContext,
  options: Record<string, unknown>,
  orientation: 'portrait' | 'landscape',
  body: string,
  cover: string
): DocShell {
  const scope = typeof options.scope === 'string' ? options.scope : null
  const settings = getDocumentPrintSettings(ctx.document, scope)
  const marked = markUnits(body)
  const teacher = getTeacher()
  const school = getSchool()
  return {
    css: documentStyles(settings, orientation, settings.margin_mm),
    headerHtml: headerBlock(settings, options),
    titleHtml: `<div class="title">${esc(settings.header_text || ctx.title)}</div>${
      ctx.subtitle ? `<div class="subtitle">${ctx.subtitle}</div>` : ''
    }`,
    compactHeaderHtml: compactHeader(),
    bodyHtml: marked.html,
    units: marked.units,
    footNoteHtml: esc(settings.footer_text ?? ''),
    coverHtml: cover,
    page: pageBox(orientation, settings.margin_mm),
    identity: `${esc(school?.name ?? '')} — ${esc(teacher?.full_name ?? '')}`
  }
}

/**
 * نسخة القياس: نفس CSS الورقة والرأس/العنوان، لكن متدفقة وبعرض الورقة نفسه
 * حتى تكون ارتفاعات الوحدات مطابقة لارتفاعاتها في الأوراق النهائية.
 *
 * مهم: أسطر الجداول تُعاد داخل <table> عبر `renderUnits` — أسطر <tr> طليقة
 * في المستند يتجاهلها محلّل HTML، فلا تُقاس ويخرج توزيع الصفحات خاطئاً.
 * كتلة الرأس/العنوان تُوسم `data-measure="overhead"` لأنها تستهلك ارتفاعاً من
 * الورقة الأولى وحدها.
 */
function draftHtml(shell: DocShell, ctx: DocContext): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${esc(ctx.title)}</title>
<style>
${shell.css}
.draft{width:${shell.page.widthMm}mm;min-height:${shell.page.heightMm}mm;padding:${shell.page.marginMm}mm;
  background:#fff;margin:0 auto;}
@media screen{ body{background:#eef2f7;} }
</style>
</head>
<body>
<div class="draft">
  <div data-measure="overhead">${shell.headerHtml}${shell.titleHtml}</div>
  ${renderUnits(shell.units)}
</div>
</body>
</html>`
}

function scalar(sql: string, params: unknown[] = []): number {
  return one<{ c: number }>(sql, params)?.c ?? 0
}

/**
 * مؤشرات الغلاف: أرقام مختصرة تشرح محتوى الوثيقة قبل قلب الصفحة،
 * وتُحسب من نفس البيانات المحلية التي تُبنى منها الوثيقة.
 */
function coverFacts(document: DocumentType, options: NonNullable<PrintDocumentInput['options']>): Array<[string, string]> {
  const yearId = resolveYear(options.academic_year_id)
  const classId = options.class_id ?? null
  const term = options.term
  const classFilter = classId ? ' AND class_id = ?' : ''
  const classParams = classId ? [classId] : []

  switch (document) {
    case 'daily-notebook': {
      const from = options.from ?? options.date ?? todayISO()
      const to = options.to ?? options.date ?? from
      const lessons = listLessons({ academic_year_id: yearId, from, to, class_id: classId, limit: 2000 })
      const days = new Set(lessons.map((lesson) => lesson.date))
      const totals = lessonAbsenceTallies(lessons.map((lesson) => lesson.id))
      let absences = 0
      for (const tally of totals.values()) absences += tally.absent
      return [
        ['عدد الحصص', String(lessons.length)],
        ['عدد الأيام', String(days.size)],
        ['عدد الأقسام', String(new Set(lessons.map((lesson) => lesson.class_name ?? '')).size)],
        ['الغياب المسجّل', String(absences)]
      ]
    }
    case 'gradebook':
    case 'term-results':
    case 'class-report': {
      if (!classId) return []
      const result = gradebook(classId, term ?? 1)
      return [
        ['عدد التلاميذ', String(result.summary.students)],
        ['متوسط القسم', num(result.summary.average)],
        ['أعلى علامة', num(result.summary.highest)],
        ['أدنى علامة', num(result.summary.lowest)]
      ]
    }
    case 'attendance-log': {
      const absences = scalar(
        `SELECT COUNT(*) AS c FROM attendance a JOIN daily_lessons dl ON dl.id = a.daily_lesson_id
         WHERE dl.academic_year_id = ? AND a.status = 'absent'${classId ? ' AND dl.class_id = ?' : ''}`,
        [yearId, ...classParams]
      )
      const sessions = scalar(
        `SELECT COUNT(DISTINCT a.daily_lesson_id) AS c FROM attendance a JOIN daily_lessons dl ON dl.id = a.daily_lesson_id
         WHERE dl.academic_year_id = ?${classId ? ' AND dl.class_id = ?' : ''}`,
        [yearId, ...classParams]
      )
      return [
        ['الغيابات المسجّلة', String(absences)],
        ['حصص سُجّل فيها الحضور', String(sessions)],
        ['القسم', classId ? getClass(classId)?.name ?? '' : 'كل الأقسام'],
        ['الفترة', `${options.from ?? '—'} → ${options.to ?? '—'}`]
      ]
    }
    case 'class-list': {
      const classesCount = classId ? 1 : listClasses({ academic_year_id: yearId }).length
      const studentsCount = scalar(
        `SELECT COUNT(*) AS c FROM students WHERE academic_year_id = ? AND archived = 0${classFilter}`,
        [yearId, ...classParams]
      )
      return [
        ['عدد الأقسام', String(classesCount)],
        ['عدد التلاميذ', String(studentsCount)],
        ['الأفواج', classId ? 'قسم واحد' : 'كل الأقسام'],
        ['السنة', '' ]
      ]
    }
    case 'timetable': {
      const slots = listSchedule({ academic_year_id: yearId })
      return [
        ['عدد الحصص الأسبوعية', String(slots.length)],
        ['عدد الأقسام', String(new Set(slots.map((slot) => slot.class_id)).size)],
        ['أيام الدراسة', String(new Set(slots.map((slot) => slot.day_of_week)).size)],
        ['المادة', getTeacher()?.subject_label ?? '' ]
      ]
    }
    case 'events': {
      const events = listEvents({ academic_year_id: yearId, term })
      const assessments = listAssessments({ academic_year_id: yearId, class_id: classId, term })
      return [
        ['الفروض والاختبارات', String(assessments.length)],
        ['أحداث المؤسسة', String(events.length)],
        ['الفصل', term ? TERM_LABELS[term] ?? '' : 'كل الفصول'],
        ['التقييمات المصحّحة', String(assessments.filter((item) => (item.scores_count ?? 0) > 0).length)]
      ]
    }
    case 'annual-plan': {
      const progress = planProgress(yearId)
      const items = listPlan({ academic_year_id: yearId, term })
      return [
        ['بنود التوزيع', String(items.length)],
        ['منجز', String(progress.done)],
        ['قيد الإنجاز', String(progress.inProgress)],
        ['نسبة الإنجاز', `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%`]
      ]
    }
    case 'student-report': {
      if (!options.student_id) return []
      const history = studentHistory(options.student_id, term)
      return [
        ['التلميذ', history.student.full_name],
        ['القسم', history.student.class_name ?? ''],
        ['الغيابات', String(history.absences)],
        ['التأخرات', String(history.lates)]
      ]
    }
    case 'teacher-report':
    default: {
      return [
        ['عدد الأقسام', String(listClasses({ academic_year_id: yearId }).length)],
        ['الحصص المسجّلة', String(scalar('SELECT COUNT(*) AS c FROM daily_lessons WHERE academic_year_id = ?', [yearId]))],
        ['عدد التقييمات', String(scalar('SELECT COUNT(*) AS c FROM assessments WHERE academic_year_id = ?', [yearId]))],
        ['بنك الدروس', String(listBank({ academic_year_id: yearId }).length)]
      ]
    }
  }
}

/** ورقة الغلاف: شريط كحلي + بطاقة تعريف + مؤشرات + محتوى الوثيقة */
function coverSheet(input: {
  title: string
  subtitle: string
  document: DocContext['document']
  contextRows: Array<[string, string]>
  facts: Array<[string, string]>
}): string {
  const settings = getDocumentPrintSettings(input.document, null)
  const teacher = getTeacher()
  const school = getSchool()
  const logoFile = settings.logo_path && existsSync(settings.logo_path) ? settings.logo_path : school?.logo_path
  const logo =
    settings.show_logo && logoFile && existsSync(logoFile)
      ? `<img class="logo" src="file:///${logoFile.replace(/\\/g, '/')}" alt="" />`
      : ''
  const yearRow = one<{ label: string }>('SELECT label FROM academic_years WHERE id = ?', [activeYearId()])
  const meta = PRINT_DOCUMENT_META.find((item) => item.value === input.document)
  const contents = (meta?.description ?? '')
    .split('|')
    .map((line) => line.trim())
    .filter(Boolean)

  return `<div class="cover-band">
    <div class="cover-band-top">
      <div>${logo}<div class="cover-school">${esc(school?.name ?? AR.school)}</div>
        ${school?.wilaya ? `<div>ولاية ${esc(school.wilaya)}${school.municipality ? ` — بلدية ${esc(school.municipality)}` : ''}</div>` : ''}
        <div>${AR.teacher}: <strong>${esc(teacher?.full_name ?? '—')}</strong> — ${AR.subject}: ${esc(teacher?.subject_label ?? '—')}</div>
      </div>
      <div class="cover-year">${AR.year}<div><strong>${esc(yearRow?.label ?? '—')}</strong></div>
        <div>${AR.printedOn}: ${esc(formatArabicDate(todayISO()))}</div></div>
    </div>
    <div class="cover-doc">${esc(input.title)}</div>
    <div class="cover-sub">${esc(input.subtitle)}</div>
    <div class="cover-tag"><span>${esc(meta?.label ?? '')}</span><span>${AR.doc}: ${esc(input.title)}</span><span>مقاس A4</span></div>
  </div>
  <div class="cover-body">
    <table class="cover-card"><tbody>
      ${input.contextRows.map(([label, value]) => `<tr><th>${esc(label)}</th><td>${esc(value || '—')}</td></tr>`).join('')}
    </tbody></table>
    ${input.facts.length > 0 ? `<div class="section">مؤشرات الوثيقة</div>
    <div class="cover-facts">
      ${input.facts.map(([label, value]) => `<div class="cover-fact"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}
    </div>` : ''}
    ${contents.length > 0 ? `<div class="section">محتوى الوثيقة</div>
    <ul class="cover-list">${contents.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>` : ''}
    <div class="notice">تقرير داخلي أعدّه الأستاذ لعمله الشخصي.</div>
    <div class="cover-sign"><span>إمضاء الأستاذ</span><span>إمضاء الإدارة</span></div>
  </div>`
}

function emptyState(text: string): string {
  return `<div class="empty">${esc(text)}</div>`
}

/** عتبة التمييز اللوني في الوثائق (يعدّلها الأستاذ من مركز الطباعة) */
function thresholdOf(options: NonNullable<PrintDocumentInput['options']>): number {
  const value = options.passing_threshold
  return typeof value === 'number' && !Number.isNaN(value) ? value : 10
}

/** خانة نتيجة ملوّنة: أخضر عند العتبة أو فوقها، أحمر دونها */
function pill(value: number | null | undefined, threshold = 10): string {
  if (value === null || value === undefined || Number.isNaN(value)) return `<span class="pill pill-none">—</span>`
  return `<span class="pill ${value >= threshold ? 'pill-ok' : 'pill-bad'}">${num(value)}</span>`
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  done: { label: 'منجز', cls: 'pill-ok' },
  in_progress: { label: 'قيد الإنجاز', cls: 'pill-info' },
  late: { label: 'متأخر', cls: 'pill-bad' },
  not_started: { label: 'لم يبدأ', cls: 'pill-muted' }
}

/** حالة بند التوزيع السنوي كشارة ملوّنة */
function statusPill(status: string): string {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.not_started
  return `<span class="pill ${style.cls}">${style.label}</span>`
}

function legend(threshold: number): string {
  return `<div class="legend">
    <span><i class="ok"></i> يبلغ العتبة أو يفوقها (${num(threshold)})</span>
    <span><i class="bad"></i> دون العتبة</span>
  </div>`
}

/* ------------------------------------------------------------------ */
/* 1) الجدول الأسبوعي                                                  */
/* ------------------------------------------------------------------ */
function timetable(options: NonNullable<PrintDocumentInput['options']>): string {
  const yearId = resolveYear(options.academic_year_id)
  const slots = listSchedule({ academic_year_id: yearId })
  if (slots.length === 0) return emptyState('لم يتم إدخال الجدول الأسبوعي بعد.')
  const cells = new Map<string, { value: string; rowSpan: number }>()
  const covered = new Set<string>()
  for (const slot of slots) {
    const key = `${slot.day_of_week}|${slot.start_time}`
    const value = `${slot.class_name ?? ''}${slot.room ? ` (${slot.room})` : ''}`
    const rowSpan = slotRowSpan(slot.end_time, slot.start_time)
    cells.set(key, { value: cells.has(key) ? `${cells.get(key)!.value}\n${value}` : value, rowSpan })
    /* الخانات التي تغطيها الحصة (حصة ساعتين تغطي الخانة التالية) */
    const startIndex = TIME_SLOTS.findIndex((s) => s.start === slot.start_time)
    for (let offset = 1; offset < rowSpan; offset++) {
      const s = TIME_SLOTS[startIndex + offset]
      if (s) covered.add(`${slot.day_of_week}|${s.start}`)
    }
  }
  const head = `<tr><th style="width:24mm">التوقيت</th>${SCHOOL_DAYS.map((day) => `<th class="center">${day.label}</th>`).join('')}</tr>`
  let lastPeriod = ''
  const rows = TIME_SLOTS.map((slot) => {
    const period = slot.start < '12:00' ? 'الفترة الصباحية' : 'الفترة المسائية'
    let periodRow = ''
    if (period !== lastPeriod) {
      lastPeriod = period
      periodRow = `<tr><td colspan="6" class="totals center">${period}</td></tr>`
    }
    const dayCells = SCHOOL_DAYS.map((day) => {
      const key = `${day.value}|${slot.start}`
      if (covered.has(key)) return '' /* خانة مغطّاة بحصة ساعتين */
      const cell = cells.get(key)
      if (!cell) return '<td class="center"></td>'
      const rowSpan = cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ''
      return `<td class="center"${rowSpan}>${esc(cell.value).replace(/\n/g, '<br/>')}</td>`
    }).join('')
    return `${periodRow}<tr><td class="center">${slot.start} - ${slot.end}</td>${dayCells}</tr>`
  }).join('')
  return `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`
}

/* ------------------------------------------------------------------ */
/* 2) الدفتر اليومي                                                    */
/* ------------------------------------------------------------------ */
function dailyNotebook(options: NonNullable<PrintDocumentInput['options']>): string {
  const yearId = resolveYear(options.academic_year_id)
  const from = options.from ?? options.date ?? todayISO()
  const to = options.to ?? options.date ?? from
  // ترتيب زمني تصاعدي (كما في الدفتر الورقي: من الأقدم إلى الأحدث)
  const lessons = listLessons({ academic_year_id: yearId, from, to, class_id: options.class_id ?? null, limit: 2000 }
  ).sort((a, b) => (a.date === b.date ? a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date)))

  if (lessons.length === 0) {
    return emptyState(
      `لا توجد حصص مسجّلة من ${formatArabicDate(from)} إلى ${formatArabicDate(to)}. سجّل الحصص من شاشة «الدفتر اليومي» ثم أعد الطباعة.`
    )
  }

  const tallies = lessonAbsenceTallies(lessons.map((lesson) => lesson.id))
  const classNames = new Set(lessons.map((lesson) => lesson.class_name ?? '').filter(Boolean))
  /*
   * ترقيم الحصص المتصل: كل قسم يُرقّم حصصه بالتسلسل منذ أول حصة في السنة،
   * فيحافظ الأستاذ على ترتيب واحد في كل النسخ التي يطبعها يوماً بيوم.
   */
  const beforeRows = all<{ class_id: number; c: number }>(
    'SELECT class_id, COUNT(*) AS c FROM daily_lessons WHERE academic_year_id = ? AND date < ? GROUP BY class_id',
    [yearId, from]
  )
  const counters = new Map<number, number>(beforeRows.map((row) => [row.class_id, row.c]))
  let totalAbsent = 0
  let totalLate = 0
  let currentDate = ''

  const rows = lessons
    .map((lesson) => {
      let dayRow = ''
      if (lesson.date !== currentDate) {
        currentDate = lesson.date
        dayRow = `<tr class="dayhead"><td colspan="8" class="center">${esc(
          formatArabicDateWithDay(lesson.date, DAY_LABELS[dayOfWeek(lesson.date)] ?? '')
        )}</td></tr>`
      }
      const sequence = (counters.get(lesson.class_id) ?? 0) + 1
      counters.set(lesson.class_id, sequence)
      const tally = tallies.get(lesson.id)
      totalAbsent += tally?.absent ?? 0
      totalLate += tally?.late ?? 0
      return `${dayRow}<tr>
        <td class="num" style="width:10mm">${sequence}</td>
        <td class="center" style="width:22mm">${esc(lesson.start_time)} - ${esc(lesson.end_time)}</td>
        <td class="center" style="width:24mm">${esc(lesson.class_name ?? '')}</td>
        <td class="center" style="width:20mm">${esc(lesson.session_type ?? '')}</td>
        <td><div class="strong">${esc(lesson.title || '—')}</div>${lesson.stages ? `<div class="stages">${esc(lesson.stages)}</div>` : ''}</td>
        <td class="center" style="width:14mm">${tally && tally.recorded > 0 ? String(tally.absent) : '—'}</td>
        <td class="center" style="width:14mm">${tally && tally.recorded > 0 ? String(tally.late) : '—'}</td>
        <td class="stages" style="width:38mm">${esc(lesson.notes)}</td>
      </tr>`
    })
    .join('')

  return `<div class="meta">
      <span>عدد الحصص: <strong>${lessons.length}</strong></span>
      <span>عدد الأقسام: <strong>${classNames.size}</strong></span>
      <span>الغياب المسجّل: <strong>${totalAbsent}</strong>${totalLate ? ` — التأخر: <strong>${totalLate}</strong>` : ''}</span>
    </div>
    <table>
    <thead><tr>
      <th class="center" style="width:10mm">حصة</th>
      <th class="center" style="width:22mm">التوقيت</th>
      <th class="center" style="width:24mm">القسم</th>
      <th class="center" style="width:20mm">نوع الحصة</th>
      <th>عنوان الدرس ومراحل سيره</th>
      <th class="center" style="width:14mm">غياب</th>
      <th class="center" style="width:14mm">تأخر</th>
      <th style="width:38mm">ملاحظات</th>
    </tr></thead>
    <tbody>${rows}</tbody></table>`
}

/* ------------------------------------------------------------------ */
/* 3) قائمة القسم                                                      */
/* ------------------------------------------------------------------ */
function classList(options: NonNullable<PrintDocumentInput['options']>): string {
  const yearId = resolveYear(options.academic_year_id)
  const classes = options.class_id ? [getClass(options.class_id)].filter(Boolean) : listClasses({ academic_year_id: yearId })
  if (classes.length === 0) return emptyState('لم تتم إضافة أي قسم بعد.')
  return classes
    .map((cls) => {
      const students = listStudents({ academic_year_id: yearId, class_id: cls?.id ?? null })
      if (students.length === 0) return `<div class="section">${esc(cls?.name ?? '')}</div>${emptyState('لا يوجد تلاميذ في هذا القسم.')}`
      const rows = students
        .map(
          (student, index) => `<tr>
            <td class="num">${student.number ?? index + 1}</td>
            <td>${esc(student.last_name)}</td>
            <td>${esc(student.first_name)}</td>
            <td class="center">${student.gender === 'male' ? 'ذكر' : student.gender === 'female' ? 'أنثى' : ''}</td>
            <td class="center">${esc(student.birth_date ?? '')}</td>
            <td>${esc(student.notes ?? '')}</td>
          </tr>`
        )
        .join('')
      const boys = students.filter((s) => s.gender === 'male').length
      const girls = students.filter((s) => s.gender === 'female').length
      return `<div class="section">${esc(cls?.name ?? '')} — ${students.length} تلميذ (ذكور ${boys} / إناث ${girls})</div>
      <table><thead><tr>
        <th class="num">الرقم</th><th style="width:40mm">اللقب</th><th style="width:40mm">الاسم</th>
        <th class="center" style="width:16mm">الجنس</th><th class="center" style="width:26mm">تاريخ الميلاد</th><th>ملاحظات</th>
      </tr></thead><tbody>${rows}</tbody></table>`
    })
    .join('<div style="page-break-after:always"></div>')
}

/* ------------------------------------------------------------------ */
/* 4) سجل الغياب                                                       */
/* ------------------------------------------------------------------ */
function attendanceLog(options: NonNullable<PrintDocumentInput['options']>): string {
  const yearId = resolveYear(options.academic_year_id)
  const classId = options.class_id ?? null
  if (!classId) {
    const rows = listStudents({ academic_year_id: yearId })
    if (rows.length === 0) return emptyState('لا يوجد تلاميذ.')
    const grouped = new Map<number, { absent: number; late: number; excused: number }>()
    const records = listLessons({ academic_year_id: yearId, from: options.from, to: options.to, limit: 2000 })
    for (const lesson of records) {
      const entries = attendanceForLesson(lesson.id)
      for (const entry of entries) {
        if (entry.status === 'present') continue
        const current = grouped.get(entry.student.id) ?? { absent: 0, late: 0, excused: 0 }
        if (entry.status === 'absent') current.absent++
        if (entry.status === 'late') current.late++
        if (entry.status === 'excused') current.excused++
        grouped.set(entry.student.id, current)
      }
    }
    return `<table><thead><tr>
      <th class="num">الرقم</th><th>الاسم الكامل</th><th class="center" style="width:24mm">غياب</th>
      <th class="center" style="width:24mm">تأخر</th><th class="center" style="width:24mm">إعفاء</th>
    </tr></thead><tbody>${rows
      .map((student, index) => {
        const tally = grouped.get(student.id) ?? { absent: 0, late: 0, excused: 0 }
        return `<tr><td class="num">${student.number ?? index + 1}</td><td>${esc(student.full_name)}</td>
          <td class="center">${tally.absent}</td><td class="center">${tally.late}</td><td class="center">${tally.excused}</td></tr>`
      })
      .join('')}</tbody></table>`
  }

  const records = attendanceForClass(classId, options.from, options.to)
  if (records.length === 0) return emptyState('لا يوجد سجل حضور لهذا القسم في هذه الفترة.')
  const students = new Map(listStudents({ academic_year_id: yearId, class_id: classId }).map((s) => [s.id, s]))
  const rows = records
    .map(
      (record) => `<tr>
        <td class="center">${esc(record.date)}</td>
        <td class="center">${esc(record.start_time)}</td>
        <td>${esc(students.get(record.student_id)?.full_name ?? '')}</td>
        <td class="center">${record.status === 'absent' ? 'غائب' : record.status === 'late' ? 'متأخر' : record.status === 'excused' ? 'معفي' : 'حاضر'}</td>
        <td>${esc(record.note ?? '')}</td>
      </tr>`
    )
    .join('')
  return `<table><thead><tr>
    <th class="center" style="width:26mm">التاريخ</th><th class="center" style="width:20mm">التوقيت</th>
    <th>التلميذ</th><th class="center" style="width:20mm">الحالة</th><th style="width:40mm">ملاحظة</th>
  </tr></thead><tbody>${rows}</tbody></table>`
}

/* ------------------------------------------------------------------ */
/* 5) دفتر التنقيط                                                     */
/* ------------------------------------------------------------------ */
function gradebookDoc(options: NonNullable<PrintDocumentInput['options']>): string {
  const classId = options.class_id
  if (!classId) return emptyState('اختر القسم أولاً لطباعة دفتر التنقيط.')
  const term = options.term ?? 1
  const cls = getClass(classId)
  if (!cls) return emptyState('القسم غير موجود.')
  const yearId = cls.academic_year_id
  const students = listStudents({ academic_year_id: yearId, class_id: classId })
  if (students.length === 0) return emptyState('لا يوجد تلاميذ في هذا القسم.')
  const result = gradebook(classId, term)
  const threshold = thresholdOf(options)
  const rowsById = new Map(result.rows.map((row) => [row.student_id, row]))
  const continuous = listContinuous(classId, term, yearId)
  const gradeFormula = parseFormulaComponents(result.formula.components)

  const padTo = Math.max(GRADEBOOK_ROWS_HINT, students.length)
  const bodyRows: string[] = []
  for (let index = 0; index < padTo; index++) {
    const student = students[index]
    if (!student) {
      bodyRows.push(`<tr><td class="num">${index + 1}</td><td>&nbsp;</td>${'<td></td>'.repeat(10)}</tr>`)
      continue
    }
    const values = new Map(continuous.filter((c) => c.student_id === student.id).map((c) => [c.kind, c.value]))
    const row = rowsById.get(student.id)
    bodyRows.push(`<tr>
      <td class="num">${student.number ?? index + 1}</td>
      <td>${esc(student.full_name)}</td>
      <td class="center">${row?.absences ?? 0}</td>
      <td class="center">${num(values.get('notebook') ?? null)}</td>
      <td class="center">${num(values.get('participation') ?? null)}</td>
      <td class="center">${num(values.get('behavior') ?? null)}</td>
      <td class="center">${num(values.get('homework') ?? null)}</td>
      <td class="center">${num(row?.continuous ?? null)}</td>
      <td class="center">${num(row?.homework ?? null)}</td>
      <td class="center">${num(row?.activities ?? null)}</td>
      <td class="center">${num(row?.exam ?? null)}</td>
      <td class="center">${pill(row?.average ?? null, threshold)}</td>
    </tr>`)
  }

  return `<table>
    <thead><tr>
      <th class="num">الرقم</th>
      <th style="width:44mm">الاسم واللقب</th>
      <th class="center" style="width:14mm">الغيابات</th>
      <th class="center" style="width:13mm">الكراس</th>
      <th class="center" style="width:15mm">المشاركة</th>
      <th class="center" style="width:14mm">السلوك</th>
      <th class="center" style="width:15mm">الوظائف</th>
      <th class="center" style="width:20mm">التقويم المستمر</th>
      <th class="center" style="width:14mm">الفرض</th>
      <th class="center" style="width:20mm">معدل النشاطات</th>
      <th class="center" style="width:14mm">الاختبار</th>
      <th class="center" style="width:16mm">المعدل</th>
    </tr></thead>
    <tbody>${bodyRows.join('')}</tbody>
  </table>
  <div class="notice">
    صيغة الحساب الحالية: ${esc(describeFormula(gradeFormula, result.formula.rounding))}
    — هذه الصيغة يحدّدها الأستاذ في الإعدادات وليست صيغة رسمية مفروضة.
  </div>
  <div class="legend">
    <span><i class="ok"></i> المعدل يبلغ العتبة ${num(threshold)} أو يفوقها</span>
    <span><i class="bad"></i> المعدل دون العتبة</span>
    <span>— متوسط القسم: <strong>${num(result.summary.average)}</strong> — عدد التلاميذ: ${students.length}</span>
  </div>
  <div class="sign"><span>إمضاء الأستاذ</span><span>إمضاء الإدارة</span></div>`
}

/* ------------------------------------------------------------------ */
/* 6) نتائج الفصل                                                      */
/* ------------------------------------------------------------------ */
function termResults(options: NonNullable<PrintDocumentInput['options']>): string {
  const classId = options.class_id
  if (!classId) return emptyState('اختر القسم أولاً.')
  const term = options.term ?? 1
  const cls = getClass(classId)
  if (!cls) return emptyState('القسم غير موجود.')
  const result = gradebook(classId, term)
  if (result.rows.length === 0) return emptyState('لا توجد نتائج محسوبة لهذا الفصل.')
  const threshold = thresholdOf(options)
  const ranked = [...result.rows].sort((a, b) => (b.average ?? -1) - (a.average ?? -1))
  const passing = result.rows.filter((row) => (row.average ?? 0) >= threshold).length
  const rows = ranked
    .map(
      (row, index) => `<tr>
        <td class="num">${index + 1}</td>
        <td class="num">${row.number ?? ''}</td>
        <td>${esc(row.full_name)}</td>
        <td class="center">${num(row.continuous)}</td>
        <td class="center">${num(row.homework)}</td>
        <td class="center">${num(row.activities)}</td>
        <td class="center">${num(row.exam)}</td>
        <td class="center">${pill(row.average, threshold)}</td>
        <td class="center">${row.absences}</td>
      </tr>`
    )
    .join('')
  const summaryStrip = `<div class="meta">
      <span>عدد التلاميذ: <strong>${result.summary.students}</strong></span>
      <span>متوسط القسم: <strong>${num(result.summary.average)}</strong></span>
      <span>أعلى / أدنى: <strong>${num(result.summary.highest)} / ${num(result.summary.lowest)}</strong></span>
      <span>يبلغون العتبة ${num(threshold)}: <strong>${passing} من ${result.summary.counted}</strong></span>
    </div>${legend(threshold)}`
  return `${summaryStrip}<table>
    <thead><tr>
      <th class="num" style="width:12mm">الرتبة</th><th class="num" style="width:12mm">الرقم</th>
      <th>الاسم الكامل</th>
      <th class="center" style="width:20mm">${FORMULA_COMPONENT_LABELS.continuous}</th>
      <th class="center" style="width:16mm">${FORMULA_COMPONENT_LABELS.homework}</th>
      <th class="center" style="width:20mm">${FORMULA_COMPONENT_LABELS.activities}</th>
      <th class="center" style="width:16mm">${FORMULA_COMPONENT_LABELS.exam}</th>
      <th class="center" style="width:18mm">المعدل</th>
      <th class="center" style="width:18mm">الغيابات</th>
    </tr></thead><tbody>${rows}</tbody>
    <tfoot><tr class="totals">
      <td colspan="7">متوسط القسم: ${num(result.summary.average)} — أعلى علامة: ${num(result.summary.highest)} — أدنى علامة: ${num(result.summary.lowest)}</td>
      <td colspan="2" class="center">عدد التلاميذ: ${result.summary.students}</td>
    </tr></tfoot></table>`
}

/* ------------------------------------------------------------------ */
/* 7) الفروض والاختبارات ومجالس الأقسام                                */
/* ------------------------------------------------------------------ */
function eventsDoc(options: NonNullable<PrintDocumentInput['options']>): string {
  const yearId = resolveYear(options.academic_year_id)
  const events = listEvents({ academic_year_id: yearId, term: options.term, from: options.from, to: options.to })
  const assessments = listAssessments({ academic_year_id: yearId, class_id: options.class_id ?? null, term: options.term })
  if (events.length === 0 && assessments.length === 0) return emptyState('لا توجد أحداث أو تقييمات مسجّلة.')
  const eventRows = events
    .map(
      (event) => `<tr>
        <td class="center">${esc(event.date)}</td>
        <td class="center">${esc(TERM_LABELS[event.term] ?? '')}</td>
        <td>${esc(event.title)}</td>
        <td class="center">${esc(event.class_name ?? '')}</td>
        <td>${esc(event.notes ?? '')}</td>
      </tr>`
    )
    .join('')
  const assessmentRows = assessments
    .map(
      (assessment) => `<tr>
        <td class="center">${esc(assessment.date)}</td>
        <td class="center">${esc(TERM_LABELS[assessment.term] ?? '')}</td>
        <td>${esc(assessment.name)}</td>
        <td class="center">${esc(assessment.class_name ?? '')}</td>
        <td class="center">${num(assessment.max_score)}</td>
      </tr>`
    )
    .join('')
  return `<div class="section">الفروض والاختبارات</div>
    <table><thead><tr><th class="center" style="width:26mm">التاريخ</th><th class="center" style="width:24mm">الفصل</th>
      <th>التقييم</th><th class="center" style="width:26mm">القسم</th><th class="center" style="width:20mm">العلامة القصوى</th>
    </tr></thead><tbody>${assessmentRows || '<tr><td colspan="5" class="center">—</td></tr>'}</tbody></table>
    <div class="section">أحداث المؤسسة ومجالس الأقسام</div>
    <table><thead><tr><th class="center" style="width:26mm">التاريخ</th><th class="center" style="width:24mm">الفصل</th>
      <th>العنوان</th><th class="center" style="width:26mm">القسم</th><th>ملاحظات</th>
    </tr></thead><tbody>${eventRows || '<tr><td colspan="5" class="center">—</td></tr>'}</tbody></table>`
}

/* ------------------------------------------------------------------ */
/* 8) تقرير القسم                                                      */
/* ------------------------------------------------------------------ */
function classReport(options: NonNullable<PrintDocumentInput['options']>): string {
  const classId = options.class_id
  if (!classId) return emptyState('اختر القسم أولاً.')
  const term = options.term ?? 1
  const stats = classStats(classId, term)
  const cls = getClass(classId)
  const students = listStudents({ academic_year_id: cls?.academic_year_id, class_id: classId })
  const assessments = listAssessments({ academic_year_id: cls?.academic_year_id, class_id: classId, term })
  const plan = listPlan({ academic_year_id: cls?.academic_year_id, level_id: cls?.level_id ?? null, term })
  const result = gradebook(classId, term)
  const threshold = thresholdOf(options)

  const summary = `
    <table><tbody>
      <tr><th style="width:60mm">عدد التلاميذ</th><td class="center">${stats.students_count}</td>
          <th style="width:60mm">عدد الحصص المسجّلة</th><td class="center">${stats.lessons_count}</td></tr>
      <tr><th>حصص سُجّل فيها الحضور</th><td class="center">${stats.attendance_sessions}</td>
          <th>الغيابات / التأخرات</th><td class="center">${stats.absences} / ${stats.lates}</td></tr>
      <tr><th>عدد التقييمات</th><td class="center">${stats.assessments_count}</td>
          <th>متوسط القسم</th><td class="center">${num(stats.average)}</td></tr>
      <tr><th>أعلى / أدنى علامة</th><td class="center">${num(stats.highest)} / ${num(stats.lowest)}</td>
          <th>عدد التلاميذ عند العتبة</th><td class="center">${stats.passing ?? 0}</td></tr>
      <tr><th>بنود التوزيع المنجزة</th><td class="center">${stats.plan_done} / ${stats.plan_total}</td>
          <th>الفصل</th><td class="center">${esc(TERM_LABELS[term] ?? '')}</td></tr>
    </tbody></table>`

  const gradeRows = result.rows
    .map(
      (row) => `<tr><td class="num">${row.number ?? ''}</td><td>${esc(row.full_name)}</td>
      <td class="center">${num(row.continuous)}</td><td class="center">${num(row.homework)}</td>
      <td class="center">${num(row.activities)}</td><td class="center">${num(row.exam)}</td>
      <td class="center">${pill(row.average, threshold)}</td><td class="center">${row.absences}</td></tr>`
    )
    .join('')

  return `<div class="section">المعطيات العامة — ${esc(cls?.name ?? '')}</div>
  ${summary}
  <div class="section">قائمة التلاميذ (${students.length})</div>
  <table><thead><tr><th class="num">الرقم</th><th>الاسم الكامل</th><th class="center" style="width:18mm">الغيابات</th></tr></thead>
  <tbody>${students.map((s, i) => `<tr><td class="num">${s.number ?? i + 1}</td><td>${esc(s.full_name)}</td><td class="center"></td></tr>`).join('')}</tbody></table>
  <div class="section">النقاط والمعدلات — ${esc(TERM_LABELS[term] ?? '')}</div>
  ${legend(threshold)}
  <table><thead><tr><th class="num">الرقم</th><th>الاسم الكامل</th>
    <th class="center">${FORMULA_COMPONENT_LABELS.continuous}</th><th class="center">${FORMULA_COMPONENT_LABELS.homework}</th>
    <th class="center">${FORMULA_COMPONENT_LABELS.activities}</th><th class="center">${FORMULA_COMPONENT_LABELS.exam}</th>
    <th class="center">المعدل</th><th class="center">الغيابات</th></tr></thead><tbody>${gradeRows || '<tr><td colspan="8" class="center">لا توجد نقاط</td></tr>'}</tbody></table>
  <div class="section">التقييمات</div>
  <table><thead><tr><th class="center" style="width:26mm">التاريخ</th><th>الاسم</th><th class="center" style="width:24mm">النوع</th><th class="center" style="width:20mm">القصوى</th></tr></thead>
  <tbody>${assessments.map((a) => `<tr><td class="center">${esc(a.date)}</td><td>${esc(a.name)}</td><td class="center">${esc(a.type)}</td><td class="center">${num(a.max_score)}</td></tr>`).join('') || '<tr><td colspan="4" class="center">لا توجد تقييمات</td></tr>'}</tbody></table>
  <div class="section">التوزيع السنوي المرتبط بهذا المستوى</div>
  <table><thead><tr><th class="center" style="width:24mm">الفصل</th><th>الدرس</th><th style="width:46mm">المقطع</th><th class="center" style="width:26mm">الحالة</th></tr></thead>
  <tbody>${plan.map((p) => `<tr><td class="center">${esc(TERM_LABELS[p.term] ?? '')}</td><td>${esc(p.lesson_title)}</td><td>${esc(p.unit ?? '')}</td><td class="center">${esc(p.status)}</td></tr>`).join('') || '<tr><td colspan="4" class="center">لا يوجد توزيع</td></tr>'}</tbody></table>
  <div class="notice">هذه الوثيقة تقرير داخلي أعدّه الأستاذ لعمله الشخصي، وليست وثيقة رسمية صادرة عن أي جهة.</div>`
}

/* ------------------------------------------------------------------ */
/* 9) تقرير التلميذ                                                    */
/* ------------------------------------------------------------------ */
function studentReport(options: NonNullable<PrintDocumentInput['options']>): string {
  const studentId = options.student_id
  if (!studentId) return emptyState('اختر التلميذ أولاً.')
  const history = studentHistory(studentId, options.term)
  const threshold = thresholdOf(options)
  const student = history.student
  const scores = history.scores
  return `<div class="section">البيانات الأساسية</div>
  <table><tbody>
    <tr><th style="width:50mm">الاسم الكامل</th><td>${esc(student.full_name)}</td>
        <th style="width:50mm">القسم</th><td class="center">${esc(student.class_name ?? '')}</td></tr>
    <tr><th>الرقم</th><td class="center">${student.number ?? ''}</td>
        <th>تاريخ الميلاد</th><td class="center">${esc(student.birth_date ?? '')}</td></tr>
  </tbody></table>
  <div class="section">الحضور والغياب</div>
  <table><tbody><tr>
    <th>الغيابات</th><td class="center">${history.absences}</td>
    <th>التأخرات</th><td class="center">${history.lates}</td>
    <th>الإعفاءات</th><td class="center">${history.excused}</td>
  </tr></tbody></table>
  <div class="section">النقاط والمعدلات</div>
  ${legend(threshold)}
  <table><thead><tr><th class="center" style="width:34mm">الغيابات</th>
    <th class="center">${FORMULA_COMPONENT_LABELS.continuous}</th><th class="center">${FORMULA_COMPONENT_LABELS.homework}</th>
    <th class="center">${FORMULA_COMPONENT_LABELS.activities}</th><th class="center">${FORMULA_COMPONENT_LABELS.exam}</th>
    <th class="center">المعدل</th></tr></thead>
  <tbody>${history.grades.map((g) => `<tr><td class="center">${num(g.absences)}</td>
    <td class="center">${num(g.continuous)}</td><td class="center">${num(g.homework)}</td>
    <td class="center">${num(g.activities)}</td><td class="center">${num(g.exam)}</td>
    <td class="center">${pill(g.average, threshold)}</td></tr>`).join('') || '<tr><td colspan="6" class="center">لا توجد نتيجة محسوبة</td></tr>'}</tbody></table>
  <div class="section">تفصيل التقييمات</div>
  <table><thead><tr><th class="center" style="width:26mm">التاريخ</th><th>التقييم</th>
    <th class="center" style="width:22mm">الفصل</th><th class="center" style="width:20mm">القصوى</th><th class="center" style="width:18mm">العلامة</th></tr></thead>
  <tbody>${scores.map((s) => `<tr><td class="center">${esc(s.date)}</td><td>${esc(s.name)}</td>
    <td class="center">${esc(TERM_LABELS[s.term] ?? '')}</td><td class="center">${num(s.max_score)}</td>
    <td class="center">${s.score === null ? '<span class="pill pill-none">—</span>' : pill((s.score / (s.max_score || 20)) * 20, threshold)}</td></tr>`).join('') || '<tr><td colspan="5" class="center">لا توجد علامات</td></tr>'}</tbody></table>
  <div class="notice">تقرير داخلي أعدّه الأستاذ لعمله الشخصي.</div>`
}

/* ------------------------------------------------------------------ */
/* 10) التوزيع السنوي                                                  */
/* ------------------------------------------------------------------ */
function annualPlan(options: NonNullable<PrintDocumentInput['options']>): string {
  const yearId = resolveYear(options.academic_year_id)
  const items = listPlan({ academic_year_id: yearId, term: options.term, subject_id: options.subject_id ?? null })
  const levels = all<{ id: number; name: string }>('SELECT id, name FROM levels ORDER BY order_index')
  const subjectName = options.subject_id
    ? all<{ name: string }>('SELECT name FROM subjects WHERE id = ?', [options.subject_id])[0]?.name ?? ''
    : ''
  const progress = planProgress(yearId)
  if (items.length === 0) return emptyState('لم يتم إدخال أي بند في التوزيع السنوي بعد.')
  const subjectHeader = subjectName ? `<div class="meta"><span>المادة: ${esc(subjectName)}</span></div>` : ''
  const rows = items
    .map(
      (item) => `<tr>
        <td class="center">${esc(TERM_LABELS[item.term] ?? '')}</td>
        <td class="center">${esc(item.level_name ?? '')}</td>
        <td>${esc(item.domain ?? '')}</td>
        <td>${esc(item.unit ?? '')}</td>
        <td>${esc(item.lesson_title)}</td>
        <td class="center">${item.sessions_count}</td>
        <td class="center">${item.expected_date ?? ''}</td>
        <td class="center">${item.completed_date ?? ''}</td>
        <td class="center">${statusPill(item.status)}</td>
      </tr>`
    )
    .join('')
  return `${subjectHeader}<div class="meta">
      <span>المستويات: ${esc(levels.map((l) => l.name).join(' — '))}</span>
      <span>المجموع: ${progress.total} — منجز: ${progress.done} — قيد الإنجاز: ${progress.inProgress} — لم يبدأ: ${progress.notStarted}</span>
    </div>
    <table><thead><tr>
      <th class="center" style="width:22mm">الفصل</th><th class="center" style="width:24mm">المستوى</th>
      <th style="width:26mm">الميدان</th><th style="width:30mm">المقطع</th><th>الدرس</th>
      <th class="center" style="width:14mm">حصص</th><th class="center" style="width:24mm">متوقع</th>
      <th class="center" style="width:24mm">الإنجاز</th><th class="center" style="width:22mm">الحالة</th>
    </tr></thead><tbody>${rows}</tbody></table>`
}

/* ------------------------------------------------------------------ */
/* 11) تقرير الأستاذ (ملخّص السنة)                                     */
/* ------------------------------------------------------------------ */
function teacherReport(options: NonNullable<PrintDocumentInput['options']>): string {
  const yearId = resolveYear(options.academic_year_id)
  const teacher = getTeacher()
  const school = getSchool()
  const classes = listClasses({ academic_year_id: yearId })
  const bankCount = listBank({ academic_year_id: yearId }).length
  const progress = planProgress(yearId)
  const lessonCount = all<{ c: number }>('SELECT COUNT(*) AS c FROM daily_lessons WHERE academic_year_id = ?', [yearId])[0]?.c ?? 0
  const assessmentCount = all<{ c: number }>('SELECT COUNT(*) AS c FROM assessments WHERE academic_year_id = ?', [yearId])[0]?.c ?? 0
  const absenceCount =
    all<{ c: number }>(
      "SELECT COUNT(*) AS c FROM attendance a JOIN daily_lessons dl ON dl.id = a.daily_lesson_id WHERE dl.academic_year_id = ? AND a.status = 'absent'",
      [yearId]
    )[0]?.c ?? 0
  const tables = classes
    .map((cls) => {
      const stats = classStats(cls.id)
      return `<tr>
        <td>${esc(cls.name)}</td>
        <td class="center">${esc(cls.level_name ?? '')}</td>
        <td class="center">${stats.students_count}</td>
        <td class="center">${stats.lessons_count}</td>
        <td class="center">${stats.assessments_count}</td>
        <td class="center">${stats.absences}</td>
        <td class="center">${num(stats.average)}</td>
        <td class="center">${stats.plan_done} / ${stats.plan_total}</td>
      </tr>`
    })
    .join('')
  return `<div class="meta">
      <span>${AR.teacher}: <strong>${esc(teacher?.full_name ?? '—')}</strong></span>
      <span>${AR.school}: <strong>${esc(school?.name ?? '—')}</strong></span>
      <span>${AR.subject}: ${esc(teacher?.subject_label ?? '—')}</span>
    </div>
    <table><tbody>
      <tr><th style="width:60mm">عدد الأقسام</th><td class="center">${classes.length}</td>
          <th style="width:60mm">عدد بنك الدروس</th><td class="center">${bankCount}</td></tr>
      <tr><th>الحصص المسجّلة</th><td class="center">${lessonCount}</td>
          <th>عدد التقييمات</th><td class="center">${assessmentCount}</td></tr>
      <tr><th>الغيابات المسجّلة</th><td class="center">${absenceCount}</td>
          <th>التوزيع السنوي</th><td class="center">${progress.done} منجز من ${progress.total}</td></tr>
    </tbody></table>
    <div class="section">ملخّص الأقسام</div>
    <table><thead><tr><th>القسم</th><th class="center" style="width:26mm">المستوى</th>
      <th class="center" style="width:18mm">تلاميذ</th><th class="center" style="width:18mm">حصص</th>
      <th class="center" style="width:18mm">تقييمات</th><th class="center" style="width:18mm">غياب</th>
      <th class="center" style="width:18mm">المعدل</th><th class="center" style="width:26mm">التوزيع</th></tr></thead>
    <tbody>${tables || '<tr><td colspan="8" class="center">لا توجد أقسام</td></tr>'}</tbody></table>
    <div class="notice">تقرير داخلي أعدّه الأستاذ لعمله الشخصي — لا يمثّل أي جهة رسمية.</div>`
}

/* ------------------------------------------------------------------ */
/* الواجهة العامة                                                      */
/* ------------------------------------------------------------------ */
export interface BuiltDocument {
  /** نسخة القياس المتفدفقة (بعرض الورقة نفسه) */
  html: string
  title: string
  orientation: 'portrait' | 'landscape'
  subtitle: string
  /** أجزاء الوثيقة اللازمة لتركيب أوراق A4 مرقّمة */
  sheet: DocShell
  /** ورقة الغلاف (HTML) — تُدمج كصفحة أولى عند الطلب */
  cover: string
}

export function buildDocument(input: PrintDocumentInput): BuiltDocument {
  const document = input.document
  const options = input.options ?? { includeHeader: true }
  const yearId = resolveYear(options.academic_year_id)
  const yearRow = one<{ label: string }>('SELECT label FROM academic_years WHERE id = ?', [yearId])
  const cls = options.class_id ? getClass(options.class_id) : null

  const finish = (
    title: string,
    orientation: 'portrait' | 'landscape',
    body: string,
    subtitle: string
  ): BuiltDocument => {
    const ctx: DocContext = { document, title, orientation, body, subtitle: esc(subtitle) }
    const cover = coverSheet({
      title,
      subtitle,
      document,
      contextRows: [
        ['الوثيقة', title],
        ['القسم', cls?.name ?? 'كل الأقسام'],
        ['الفصل', options.term ? TERM_LABELS[options.term] ?? '' : 'كل الفصول'],
        ['الفترة', subtitle],
        ['السنة الدراسية', yearRow?.label ?? '']
      ],
      facts: coverFacts(document, options)
    })
    const shell = buildShell(ctx, options, orientation, body, cover)
    return { html: draftHtml(shell, ctx), title, orientation, subtitle, sheet: shell, cover }
  }

  switch (document) {
    case 'timetable':
      return finish('الجدول الأسبوعي', 'landscape', timetable(options), yearRow?.label ?? '')
    case 'daily-notebook': {
      const subtitle = options.date
        ? formatArabicDateWithDay(options.date, DAY_LABELS[dayOfWeek(options.date)] ?? '')
        : `${formatArabicDateWithDay(options.from ?? todayISO(), DAY_LABELS[dayOfWeek(options.from ?? todayISO())] ?? '')} → ${formatArabicDateWithDay(options.to ?? todayISO(), DAY_LABELS[dayOfWeek(options.to ?? todayISO())] ?? '')}`
      return finish('الدفتر اليومي', 'portrait', dailyNotebook(options), subtitle)
    }
    case 'class-list':
      return finish('قائمة القسم', 'portrait', classList(options), cls?.name ?? '')
    case 'attendance-log':
      return finish('سجل الغياب', 'landscape', attendanceLog(options), cls?.name ?? '')
    case 'gradebook':
      return finish('دفتر التنقيط', 'landscape', gradebookDoc(options), `${cls?.name ?? ''} — ${TERM_LABELS[options.term ?? 1] ?? ''}`)
    case 'term-results':
      return finish('نتائج الفصل', 'landscape', termResults(options), `${cls?.name ?? ''} — ${TERM_LABELS[options.term ?? 1] ?? ''}`)
    case 'events':
      return finish('الفروض والاختبارات ومجالس الأقسام', 'portrait', eventsDoc(options), TERM_LABELS[options.term ?? 1] ?? 'كل الفصول')
    case 'class-report':
      return finish('تقرير القسم', 'portrait', classReport(options), `${cls?.name ?? ''} — ${TERM_LABELS[options.term ?? 1] ?? ''}`)
    case 'student-report':
      return finish('تقرير التلميذ', 'portrait', studentReport(options), '')
    case 'annual-plan':
      return finish('التوزيع السنوي', 'landscape', annualPlan(options), yearRow?.label ?? '')
    case 'teacher-report':
    default:
      return finish('تقرير الأستاذ', 'portrait', teacherReport(options), yearRow?.label ?? '')
  }
}
