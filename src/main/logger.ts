import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * سجل محلي فقط — لا يُرسل أي شيء إلى الإنترنت ولا توجد Telemetry.
 */
const MAX_SIZE = 2 * 1024 * 1024

let logFile: string | null = null

export function initLogger(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  logFile = join(dir, 'app.log')
  return logFile
}

export function getLogFile(): string | null {
  return logFile
}

function rotateIfNeeded(): void {
  if (!logFile || !existsSync(logFile)) return
  try {
    if (statSync(logFile).size > MAX_SIZE) {
      renameSync(logFile, `${logFile}.1`)
    }
  } catch {
    /* تجاهل أخطاء التدوير */
  }
}

export function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, detail?: unknown): void {
  const stamp = new Date().toISOString()
  let line = `[${stamp}] ${level} ${message}`
  if (detail !== undefined) {
    try {
      line += ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
    } catch {
      line += ' :: [unserializable]'
    }
  }
  // في وضع التطوير يظهر الخطأ الحقيقي، وفي الإنتاج يبقى في الملف فقط.
  if (level === 'ERROR') console.error(line)
  else console.log(line)
  if (!logFile) return
  try {
    rotateIfNeeded()
    appendFileSync(logFile, line + '\n', 'utf8')
  } catch {
    /* التسجيل لا يجب أن يوقف التطبيق */
  }
}

export function readLogs(limit = 300): string[] {
  if (!logFile || !existsSync(logFile)) return []
  try {
    const lines = readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
    return lines.slice(-limit).reverse()
  } catch {
    return []
  }
}
