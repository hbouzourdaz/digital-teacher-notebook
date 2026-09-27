# قاعدة البيانات — Database

المحرّك: **SQLite** عبر `better-sqlite3` (متزامن وسريع). الملف: `app.getPath('userData')/notebook.db`.

إعدادات الاتصال: `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`, `synchronous = NORMAL`.

كل التواريخ تُخزَّن **ISO** (`YYYY-MM-DD`) وكل الأوقات **HH:mm**، والعرض في الواجهة عربي لكن التخزين محايد.

## الجداول

| الجدول | الغرض | حقول مفتاحية |
| --- | --- | --- |
| `academic_years` | السنوات الدراسية | `label`, `start_date`, `end_date`, `is_active`, `is_archived` |
| `teachers` | بيانات الأستاذ (سجل واحد) | `full_name`, `subject_label`, `phone` |
| `schools` | بيانات المؤسسة (سجل واحد) | `name`, `stage`, `wilaya`, `municipality`, `logo_path` |
| `subjects` | المواد (غير مثبّتة في الكود) | `name`, `code`, `is_active` |
| `levels` | المستويات (قابلة للتخصيص) | `name`, `order_index` |
| `classes` | الأقسام المسندة | `academic_year_id`, `name`, `level_id`, `stream`, `subject_id` |
| `students` | التلاميذ | `number`, `first_name`, `last_name`, `full_name` (عمود محسوب)، `gender`, `archived`, `sort_order` |
| `student_transfers` | سجل نقل التلميذ | `student_id`, `from_class_id`, `to_class_id`, `date` |
| `weekly_schedule` | الجدول الأسبوعي | `day_of_week` (0=الأحد), `start_time`, `end_time`, `class_id`, `session_type` |
| `daily_lessons` | الدفتر اليومي | `date`, `start_time`, `class_id`, `title`, `stages`, `notes`, `status`, `annual_plan_id`, `lesson_bank_id` |
| `attendance` | الحضور | `daily_lesson_id`, `student_id`, `status`, `note` — فريد (حصة، تلميذ) |
| `assessment_categories` | تصنيفات التقييم | `name`, `kind`, `max_default`, `weight` |
| `assessments` | الفروض والاختبارات | `class_id`, `type`, `term`, `date`, `max_score`, `weight` |
| `assessment_scores` | العلامات | `assessment_id`, `student_id`, `score` — فريد (تقييم، تلميذ) |
| `continuous_assessment` | التقويم المستمر | `student_id`, `term`, `kind`, `value` — فريد (تلميذ، فصل، مكوّن) |
| `grade_formulas` | صيغة المعدل | `components` (JSON), `rounding`، فريد لكل سنة عند `is_active = 1` |
| `grades` | النتائج المحسوبة | `continuous`, `homework`, `activities`, `exam`, `average`, `absences` — فريد (تلميذ، فصل، مادة) |
| `annual_plans` | التوزيع السنوي | `term`, `domain`, `unit`, `lesson_title`, `sessions_count`, `status`, `completed_date` |
| `lesson_bank` | بنك الدروس | `title`, `objectives`, `stages`, `duration` |
| `school_events` | أحداث المؤسسة | `type`, `term`, `title`, `date`, `class_id` |
| `notes` | ملاحظات على أي كائن | `owner_type`, `owner_id`, `body` |
| `attachments` | مرفقات محلية | `owner_type`, `owner_id`, `file_path`, `extension`, `size` |
| `print_settings` | إعدادات الطباعة لكل نطاق | `scope`, `header_text`, `footer_text`, `margin_mm`, `font_size` |
| `app_settings` | إعدادات مفتاح/قيمة | السنة الفعّالة، المظهر، النسخ الاحتياطي، قفل PIN |
| `backups` | سجل النسخ الاحتياطية | `file_path`, `size`, `kind`, `created_at` |
| `audit_logs` | سجل عمليات محلي | `action`, `entity`, `entity_id`, `details` |

## العلاقات

```
academic_years ─┬─ classes ─┬─ students ── grades ── (تقارير)
                │           ├─ assessments ── assessment_scores
                │           ├─ weekly_schedule ── daily_lessons ── attendance
                │           └─ continuous_assessment
                ├─ annual_plans ── daily_lessons
                ├─ lesson_bank   ── daily_lessons
                └─ school_events / print_settings / grade_formulas
```

- `ON DELETE CASCADE` من السنة إلى ما تحتها، ومن القسم إلى التلاميذ والحصص والتقييمات.
- `ON DELETE SET NULL` للعلاقات المرجعية (المستوى، المادة، بنك الدروس، بند التوزيع).
- عمود `students.full_name` عمود محسوب (`GENERATED ALWAYS AS ... VIRTUAL`) لتفادي كتابته يدوياً.

## نظام الترقيات (Migrations)

- الملفات: `src/main/database/migrations/00X_name.sql`.
- تُسجّل في `migrations/index.ts` بترتيب تصاعدي، وتُدار بالأرقام عبر `PRAGMA user_version`.
- عند الإقلاع: تُنفَّذ الترقيات المعلّقة داخل معاملة واحدة لكل ملف.
- **قبل أي ترقية على قاعدة قائمة** تُنشأ نسخة احتياطية تلقائية
  (`backups/YYYY-MM-DD_pre-migration_vN.db`).
- لا تُعدّل ملفاً منشوراً: أضف ملفاً جديداً برقم أعلى. الملف `002_add_extra_indexes.sql` مثال على ترقية آمنة.

## النسخ الاحتياطي والاستعادة

| العملية | السلوك |
| --- | --- |
| نسخة يدوية | `backups/YYYY-MM-DD_HH-mm-ss.db` + سجل في `backups` + تحقق من الوجود والحجم والسلامة |
| نسخة تلقائية | عند الإقلاع إذا كانت مستحقة (`daily` ≈ 20 ساعة، `weekly` ≈ 6 أيام)، ويُحفظ آخر 30 نسخة تلقائية فقط |
| قبل الاستيراد | نسخة `pre-import` اختيارية (مفعّلة افتراضياً في معالج الاستيراد) |
| الاستعادة | فحص `integrity_check` → نسخة أمان من الوضع الحالي → استبدال الملف → تنظيف `-wal/-shm` → إعادة فتح القاعدة وإعادة تحميل الواجهة |

يعرض التطبيق دائماً تاريخ النسخة وحجمها ونتيجة الفحص، ولا يستبدل قاعدة البيانات دون تأكيد صريح.

## صيغة المعدل (grade_formulas)

`components` نص JSON بالشكل:

```json
[
  { "key": "continuous", "label": "التقويم المستمر", "weight": 1, "enabled": true },
  { "key": "homework",   "label": "الفرض",            "weight": 1, "enabled": true },
  { "key": "activities", "label": "معدل النشاطات",    "weight": 1, "enabled": true },
  { "key": "exam",       "label": "الاختبار",         "weight": 2, "enabled": true }
]
```

المعدل = `Σ(القيمة × الوزن) ÷ Σ(الأوزان)` على المكوّنات المفعّلة فقط. الأوزان الافتراضية **افتراضية** يعدّلها
الأستاذ، والتطبيق لا يدّعي أنها صيغة رسمية. تُعرض دائماً جملة توضيحية بالصيغة الحالية.

## التعافي عند فشل الفتح

لا يُحذف الملف أبداً. تُعرض رسالة تحتوي مسار قاعدة البيانات ومسار مجلد النسخ الاحتياطية، ويُقترح تنفيذ استعادة.
يمكن أيضاً استعادة نسخة من قرص خارجي عبر تثبيت النسخ الاحتياطي (`importExternalBackup`) في طبقة الخدمة.
