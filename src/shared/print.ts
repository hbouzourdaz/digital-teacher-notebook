/**
 * كتالوج وثائق الطباعة — مصدر واحد للحقيقة بين العملية الرئيسية والواجهة.
 * كل وثيقة لها معطيات مطلوبة يتحقق منها مركز الطباعة.
 */
export const PRINT_DOCUMENTS = [
  'timetable',
  'daily-notebook',
  'class-list',
  'attendance-log',
  'gradebook',
  'term-results',
  'events',
  'class-report',
  'student-report',
  'annual-plan',
  'teacher-report'
] as const

export type DocumentType = (typeof PRINT_DOCUMENTS)[number]

export interface PrintDocumentMeta {
  value: DocumentType
  label: string
  needsClass: boolean
  needsTerm: boolean
  needsRange: boolean
  needsStudent: boolean
  /** الوثيقة تعرض معدلات: تُستعمل عتبة التمييز اللوني */
  showsAverages?: boolean
  /** محتوى الوثيقة كما يُعرض على ورقة الغلاف — تفصل البنود علامة | */
  description?: string
  orientation: 'portrait' | 'landscape'
}

/** معلومات ترقيم الوثيقة — تصل إلى الواجهة بعد كل تركيب أوراق */
export interface PrintPageInfo {
  /** عدد أوراق الوثيقة كاملاً (غلاف + محتوى) */
  totalPages: number
  /** أرقام الأوراق التي ستُطبع فعلاً بترقيم الوثيقة الكامل */
  printedPages: number[]
  /** وصف كل ورقة: «صفحة 2 — الأحد 27 سبتمبر 2026» */
  pageLabels: Array<{ page: number; label: string }>
  /** تحذيرات غير حاجبة (مثل سطر أطول من ورقة) */
  warnings: string[]
}

export interface PrintPreviewResult extends PrintPageInfo {
  html: string
  title: string
  orientation: string
}

export interface PrintLinkContext {
  document: DocumentType
  classId?: number | null
  term?: number | null
  studentId?: number | null
  /** تاريخ واحد (الدفتر اليومي ليوم واحد) */
  date?: string | null
  from?: string | null
  to?: string | null
  /** عتبة التمييز اللوني في الوثيقة */
  threshold?: number | null
}

/**
 * مسار «مركز الطباعة» مع سياق الوثيقة — يجعل زر «طباعة» في كل شاشة
 * يفتح الوثيقة الصحيحة بنفس القسم والفصل والمدى الزمني المعروض.
 */
export function printLink(context: PrintLinkContext): string {
  const parts = [`document=${context.document}`]
  if (context.classId) parts.push(`class=${context.classId}`)
  if (context.term) parts.push(`term=${context.term}`)
  if (context.studentId) parts.push(`student=${context.studentId}`)
  if (context.date) parts.push(`date=${context.date}`)
  if (context.from) parts.push(`from=${context.from}`)
  if (context.to) parts.push(`to=${context.to}`)
  if (context.threshold) parts.push(`threshold=${context.threshold}`)
  return `/print?${parts.join('&')}`
}

export const PRINT_DOCUMENT_META: PrintDocumentMeta[] = [
  {
    value: 'timetable',
    label: 'الجدول الأسبوعي',
    needsClass: false,
    needsTerm: false,
    needsRange: false,
    needsStudent: false,
    description: 'حصص الأسبوع لكل الأيام والفترات|المادة والقاعة لكل حصة|توزيع الفترة الصباحية والمسائية|مرجع سريع لباقي وثائق الدفتر',
    orientation: 'landscape'
  },
  {
    value: 'daily-notebook',
    label: 'الدفتر اليومي',
    needsClass: false,
    needsTerm: false,
    needsRange: true,
    needsStudent: false,
    description: 'كل يوم في ورقة مستقلة (يمكن طبع يوم واحد فقط)|عنوان الدرس ومراحل سيره لكل حصة|نوع الحصة والقسم والتوقيت|غياب وتأخر كل حصة من سجل الحضور|عدد الحصص والأيام والغياب في الغلاف',
    orientation: 'portrait'
  },
  {
    value: 'class-list',
    label: 'قائمة القسم',
    needsClass: true,
    needsTerm: false,
    needsRange: false,
    needsStudent: false,
    description: 'الرقم والاسم واللقب بالترتيب النظامي|الجنس وتاريخ الميلاد|عدد الذكور والإناث لكل قسم|ورقة مستقلة لكل قسم عند طبع عدة أقسام',
    orientation: 'portrait'
  },
  {
    value: 'attendance-log',
    label: 'سجل الغياب',
    needsClass: true,
    needsTerm: false,
    needsRange: true,
    needsStudent: false,
    description: 'حصيلة الغياب والتأخر والإعفاء لكل تلميذ|تفصيل السجل يوماً بيوم مع التوقيت|ترقيم الصفحات لمتابعة الملف الورقي',
    orientation: 'landscape'
  },
  {
    value: 'gradebook',
    label: 'دفتر التنقيط',
    needsClass: true,
    needsTerm: true,
    needsRange: false,
    needsStudent: false,
    showsAverages: true,
    description: 'أعمدة الدفتر الورقي بالترتيب: الغيابات، الكراس، المشاركة، السلوك، الوظائف|التقويم المستمر والفرض ومعدل النشاطات والاختبار|المعدل ملوّن حسب العتبة التي يحدّدها الأستاذ|صيغة الحساب مكتوبة أسفل الجدول',
    orientation: 'landscape'
  },
  {
    value: 'term-results',
    label: 'نتائج الفصل',
    needsClass: true,
    needsTerm: true,
    needsRange: false,
    needsStudent: false,
    showsAverages: true,
    description: 'ترتيب التلاميذ حسب المعدل مع الرتبة|مكوّنات المعدل الأربعة والغيابات|ملخص الفصل: المتوسط وأعلى وأدنى علامة|المعدل ملوّن حسب العتبة',
    orientation: 'landscape'
  },
  {
    value: 'events',
    label: 'الفروض والاختبارات ومجالس الأقسام',
    needsClass: false,
    needsTerm: true,
    needsRange: false,
    needsStudent: false,
    description: 'كل الفروض والاختبارات بالتاريخ والعلامة القصوى|أحداث المؤسسة ومجالس الأقسام|ترتيب زمني حسب الفصل المختار',
    orientation: 'portrait'
  },
  {
    value: 'class-report',
    label: 'تقرير القسم',
    needsClass: true,
    needsTerm: true,
    needsRange: false,
    needsStudent: false,
    showsAverages: true,
    description: 'معطيات عامة: التلاميذ والحصص والغيابات والمعدلات|قائمة التلاميذ|النقاط والمعدلات لكل تلميذ|التقييمات وحالة التوزيع السنوي',
    orientation: 'portrait'
  },
  {
    value: 'student-report',
    label: 'تقرير التلميذ',
    needsClass: false,
    needsTerm: true,
    needsRange: false,
    needsStudent: true,
    showsAverages: true,
    description: 'البيانات الأساسية ورقم التسجيل|الحضور والغياب والتأخر|مكوّنات المعدل لكل فصل|تفصيل كل تقييم وعلامته',
    orientation: 'portrait'
  },
  {
    value: 'annual-plan',
    label: 'التوزيع السنوي',
    needsClass: false,
    needsTerm: true,
    needsRange: false,
    needsStudent: false,
    description: 'الميدان والمقطع وعنوان الدرس|عدد الحصص والتاريخ المتوقع وتاريخ الإنجاز|حالة كل بند: منجز أو قيد الإنجاز أو متأخر|نسبة الإنجاز العامة',
    orientation: 'landscape'
  },
  {
    value: 'teacher-report',
    label: 'تقرير الأستاذ (ملخّص السنة)',
    needsClass: false,
    needsTerm: false,
    needsRange: false,
    needsStudent: false,
    description: 'حوصلة السنة: الأقسام والتلاميذ والحصص|عدد التقييمات والغيابات|متوسط كل قسم ونسبة إنجاز التوزيع|مرجع لملف الأستاذ الداخلي',
    orientation: 'portrait'
  }
]
