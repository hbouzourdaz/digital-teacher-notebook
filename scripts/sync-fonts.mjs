/*
 * مزامنة الخطوط: resources/fonts  →  src/renderer/public/resources/fonts
 *
 * لماذا؟ في وضع التطوير يخدم Vite الواجهة من جذر `src/renderer`، فمسار
 * `../../../resources/fonts/x.ttf` داخل CSS لا يصل إلى ملف حقيقي، بينما يصل إليه
 * في البناء النهائي. لذلك نُبقي نسخة داخل مجلد Vite العام (`public`) فتُخدم في
 * الوضعين: `/resources/fonts/x.ttf` في التطوير، وتُنسخ تلقائياً إلى `out/renderer`
 * عند البناء — والمصدر الوحيد للحقيقة يبقى `resources/fonts`.
 *
 * لا يوجد أي تنزيل من الشبكة: النسخ محلي فقط، ويُتخطّى إن كان الملف محدّثاً.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const source = resolve(process.cwd(), 'resources', 'fonts')
const target = resolve(process.cwd(), 'src', 'renderer', 'public', 'resources', 'fonts')

if (!existsSync(source)) {
  console.warn('[fonts] مجلد resources/fonts غير موجود — تخطّي المزامنة.')
  process.exit(0)
}

mkdirSync(target, { recursive: true })
const files = readdirSync(source).filter((name) => name.toLowerCase().endsWith('.ttf'))
let copied = 0

for (const name of files) {
  const from = join(source, name)
  const to = join(target, name)
  const sourceSize = statSync(from).size
  if (existsSync(to)) {
    const targetSize = statSync(to).size
    if (targetSize === sourceSize) continue
  }
  copyFileSync(from, to)
  copied++
}

console.log(
  copied === 0
    ? `[fonts] ${files.length} ملف خط جاهز في الواجهة (لا تغيير).`
    : `[fonts] نُسخ ${copied} من ${files.length} ملف خط إلى src/renderer/public/resources/fonts.`
)
