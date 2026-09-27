# الخطوط المحلية — Offline Fonts

كل الخطوط المستعملة في الواجهة والوثائق المطبوعة **مضمّنة داخل التطبيق** ولا تُستدعى من أي CDN أو شبكة.

| الملف | الخط | الاستعمال |
| --- | --- | --- |
| `Amiri-Regular.ttf` / `Amiri-Bold.ttf` | Amiri | الوثائق المطبوعة (نسخي كلاسيكي واضح للجداول) |
| `Tajawal-Regular.ttf` | Tajawal (400) | واجهة التطبيق — النصوص العادية |
| `Tajawal-Medium.ttf` | Tajawal (500) | واجهة التطبيق — عناوين الأزرار والبطاقات |
| `Tajawal-Bold.ttf` | Tajawal (700) | واجهة التطبيق — العناوين |
| `Tajawal-ExtraBold.ttf` | Tajawal (800) | واجهة التطبيق — الأرقام والعناوين البارزة |

## المصدر والرخصة

الخطان من مشروع **Google Fonts** برخصة **SIL Open Font License 1.1** (نصوص الرخصة في
`OFL-Amiri.txt` و`OFL-Tajawal.txt` داخل هذا المجلد). يمكن إعادة توزيعهما مع التطبيق طالما بقي نص الرخصة
مرفقاً ولم يُبَع الخط نفسه منفصلاً.

- Amiri: <https://github.com/google/fonts/tree/main/ofl/amiri>
- Tajawal: <https://github.com/google/fonts/tree/main/ofl/tajawal>

## مزامنة نسخة الواجهة

`npm run fonts:sync` ينسخ ملفات `.ttf` من هنا إلى `src/renderer/public/resources/fonts`، لأن Vite في وضع التطوير يخدم
جذر `src/renderer` ولا يستطيع الوصول إلى `resources/` بمسار نسبي. الأمر يعمل تلقائياً قبل `npm run dev`
و`npm run start` و`npm run build` (خطافات `predev`/`prestart`/`prebuild`)، والمصدر الوحيد للحقيقة يبقى هذا المجلد:
عدّل الخطوط هنا ثم شغّل `npm run fonts:sync`.

## كيف تُستعمل

- **الواجهة:** `src/renderer/src/styles/fonts.css` يعرّف `@font-face` لهذه الملفات، و`tailwind.config.js`
  يجعل `font-ui` = Tajawal (الافتراضي للواجهة) و`font-doc` = Amiri.
- **الوثائق المطبوعة:** `src/main/printing/documents.ts` يبني `@font-face` بمسار `file://` محلي لكل ملف موجود،
  فلا يحتاج المتصفح/الطابعة إلى أي اتصال بالشبكة.
- **إن غاب أي ملف** يستعمل التطبيق خطوط النظام العربية (`Traditional Arabic` / `Segoe UI` / `Tahoma`)
  وتبقى الوثيقة صالحة للعمل والطباعة.
- **حجم الحزمة:** هذه الملفات تُنسخ مع التطبيق عبر `extraResources` في `electron-builder.yml`.

لإضافة خط آخر: ضع ملف `.ttf` هنا، ثم أضف سطراً في `FONT_FILES` داخل `documents.ts` وسطر `@font-face`
في `fonts.css`.
