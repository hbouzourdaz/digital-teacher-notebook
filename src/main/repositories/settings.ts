import type { PrintSettings } from '@shared/types'
import type { PrintSettingsInput } from '@shared/schemas'
import { all, one, run, transaction } from './base'

export function allSettings(): Record<string, string> {
  const rows = all<{ key: string; value: string }>('SELECT key, value FROM app_settings')
  const out: Record<string, string> = {}
  for (const row of rows) out[row.key] = row.value
  return out
}

export function getSetting(key: string): string | null {
  const row = one<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key])
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  )
}

export function setManySettings(values: Record<string, string>): void {
  const entries = Object.entries(values)
  if (entries.length === 0) return
  transaction(() => {
    for (const [key, value] of entries) setSetting(key, String(value))
  })
}

const DEFAULT_PRINT: PrintSettingsInput = {
  scope: 'default',
  header_text: null,
  footer_text: null,
  paper: 'A4',
  orientation: 'portrait',
  margin_mm: 12,
  font_size: 12,
  font_family: 'Amiri',
  show_logo: 1,
  logo_path: null
}

export function getPrintSettings(scope = 'default'): PrintSettings {
  const existing = one<PrintSettings>('SELECT * FROM print_settings WHERE scope = ?', [scope])
  if (existing) return existing
  run(
    `INSERT INTO print_settings (scope, header_text, footer_text, paper, orientation, margin_mm, font_size, font_family, show_logo, logo_path)
     VALUES (@scope, @header_text, @footer_text, @paper, @orientation, @margin_mm, @font_size, @font_family, @show_logo, @logo_path)`,
    { ...DEFAULT_PRINT, scope }
  )
  return one<PrintSettings>('SELECT * FROM print_settings WHERE scope = ?', [scope]) as PrintSettings
}

/** إعدادات نطاق محدّد إن حُفظت فعلاً — لا ننشئ صفاً جديداً هنا */
export function findPrintSettings(scope: string): PrintSettings | null {
  return one<PrintSettings>('SELECT * FROM print_settings WHERE scope = ?', [scope]) ?? null
}

/**
 * إعدادات الوثيقة عند الطبع: نطاق الوثيقة إن حفظه الأستاذ (مثل «daily-notebook»)،
 * وإلا النطاق العام «default». هذا ما يجعل تبويب الطباعة في الإعدادات فعّالاً فعلاً.
 */
export function getDocumentPrintSettings(document: string, scope?: string | null): PrintSettings {
  if (scope && scope !== 'default') {
    const scoped = findPrintSettings(scope)
    if (scoped) return scoped
  }
  return findPrintSettings(document) ?? getPrintSettings('default')
}

export function savePrintSettings(input: PrintSettingsInput): PrintSettings {
  getPrintSettings(input.scope)
  run(
    `UPDATE print_settings SET header_text = @header_text, footer_text = @footer_text, paper = @paper,
       orientation = @orientation, margin_mm = @margin_mm, font_size = @font_size, font_family = @font_family,
       show_logo = @show_logo, logo_path = @logo_path, updated_at = datetime('now', 'localtime')
     WHERE scope = @scope`,
    input
  )
  return one<PrintSettings>('SELECT * FROM print_settings WHERE scope = ?', [input.scope]) as PrintSettings
}
