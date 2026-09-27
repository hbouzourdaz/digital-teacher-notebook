#!/usr/bin/env node
/**
 * تجهيز نسخة better-sqlite3 المناسبة لبيئة التشغيل.
 *
 * السبب: الحزمة الأصلية (native) تُبنى لكل واجهة ABI مختلفة:
 *   - Electron → التطبيق (npm run dev) والتغليف (npm run dist)
 *   - Node     → الاختبارات (vitest)
 *
 * الحل: نسختان في مجلدين منفصلين حتى لا تتعارضا:
 *   node_modules/better-sqlite3                  ← نسخة Electron (يستعملها التطبيق)
 *   node_modules/.node-abi/better-sqlite3        ← نسخة Node (تستعملها الاختبارات)
 *
 * بهذا يمكن تشغيل التطبيق وتشغيل الاختبارات في نفس الوقت دون أي خطأ
 * «resource busy or locked». لا يحتاج البرنامج لأي إنترنت في وقت التشغيل.
 *
 *   node scripts/sqlite-runtime.mjs electron
 *   node scripts/sqlite-runtime.mjs node
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = (process.argv[2] ?? 'electron').toLowerCase()

if (!['node', 'electron'].includes(target)) {
  console.error(`[sqlite-runtime] هدف غير معروف: ${target} (المتوقع: node أو electron)`)
  process.exit(1)
}

const moduleDir = join(root, 'node_modules')
const mainDir = join(moduleDir, 'better-sqlite3')
const nodeDir = join(moduleDir, '.node-abi', 'better-sqlite3')
const installer = join(moduleDir, 'prebuild-install', 'bin.js')
const packageDir = target === 'electron' ? mainDir : nodeDir

if (!existsSync(mainDir) || !existsSync(installer)) {
  console.error('[sqlite-runtime] لم يتم العثور على better-sqlite3 أو prebuild-install. شغّل npm install أولاً.')
  process.exit(1)
}

/** الذاكرة المؤقتة لنسخة Node: نسخة مصغّرة من الحزمة (بدون مصادر C++) */
function nodeVersion() {
  return JSON.parse(readFileSync(join(mainDir, 'package.json'), 'utf8')).version
}

function ensureNodeCopy() {
  const marker = join(nodeDir, '.version')
  const wanted = nodeVersion()
  if (existsSync(marker)) {
    try {
      if (readFileSync(marker, 'utf8').trim() === wanted && existsSync(join(nodeDir, 'lib'))) return
    } catch {
      // نتجاهل ونعيد النسخ
    }
  }
  rmSync(nodeDir, { recursive: true, force: true })
  mkdirSync(nodeDir, { recursive: true })
  for (const entry of ['package.json', 'lib']) {
    cpSync(join(mainDir, entry), join(nodeDir, entry), { recursive: true })
  }
  writeFileSync(marker, wanted)
}

const binding = join(packageDir, 'build', 'Release', 'better_sqlite3.node')
const stampFile = join(packageDir, 'build', '.runtime-target')

/** بصمة الملف الأصلي: تتغيّر إذا أعادت أداة أخرى (مثل @electron/rebuild) بناءه */
function fingerprint(file) {
  const info = statSync(file)
  return `${target}|${info.size}|${Math.round(info.mtimeMs)}`
}

function alreadyPrepared() {
  if (!existsSync(binding) || !existsSync(stampFile)) return false
  try {
    return readFileSync(stampFile, 'utf8').trim() === fingerprint(binding)
  } catch {
    return false
  }
}

if (alreadyPrepared()) {
  console.log(`[sqlite-runtime] better-sqlite3 مهيّأ مسبقاً لـ ${target}`)
  process.exit(0)
}

if (target === 'node') ensureNodeCopy()

const args = [installer, '--verbose']
if (target === 'electron') {
  const electronPackage = join(moduleDir, 'electron', 'package.json')
  if (!existsSync(electronPackage)) {
    console.error('[sqlite-runtime] حزمة electron غير مثبّتة.')
    process.exit(1)
  }
  args.push('-r', 'electron', '-t', JSON.parse(readFileSync(electronPackage, 'utf8')).version)
}

console.log(`[sqlite-runtime] تثبيت نسخة ${target} من better-sqlite3…`)
try {
  execFileSync(process.execPath, args, { cwd: packageDir, stdio: 'inherit' })
} catch (error) {
  const message = String(error?.message ?? '')
  const locked = /EBUSY|resource busy|EPERM/i.test(message)
  if (locked && target === 'electron') {
    // التطبيق قيد التشغيل ولا يمكن استبدال الملفات — النسخة المثبّتة تعمل أصلاً
    console.warn('[sqlite-runtime] تعذّر تحديث الملف الأصلي لأنه مستعمل من تطبيق قيد التشغيل — تم التجاوز.')
    process.exit(0)
  }
  if (target === 'node') {
    console.warn('[sqlite-runtime] تعذّر تجهيز نسخة الاختبارات — سيُتخطّى اختبار قاعدة البيانات.')
    process.exit(0)
  }
  console.error(
    '[sqlite-runtime] فشل تثبيت النسخة المسبقة البناء.\n' +
      'تأكد من الاتصال بالإنترنت عند أول تجهيز، أو ثبّت Python + Build Tools لبناء الحزمة من المصدر.'
  )
  process.exit(1)
}

writeFileSync(stampFile, fingerprint(binding))
console.log(`[sqlite-runtime] تم تجهيز better-sqlite3 لـ ${target}`)
