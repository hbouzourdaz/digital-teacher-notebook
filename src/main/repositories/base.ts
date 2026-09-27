import type BetterSqlite3 from 'better-sqlite3'
import { getDb } from '../database/connection'
import { SETTING_KEYS } from '@shared/constants'

/**
 * كل SQL في التطبيق يمرّ من هنا عبر Prepared Statements فقط،
 * ولا يمكن للـ renderer تمرير أي SQL خام.
 */

type Params = Record<string, unknown> | unknown[]

const namedParamCache = new Map<string, string[]>()

/** أسماء المعاملات المسمّاة المستعملة فعلاً في الاستعلام (تُستخرج مرة واحدة وتُخزَّن) */
function namedParamsOf(sql: string): string[] {
  const cached = namedParamCache.get(sql)
  if (cached) return cached
  const names = new Set<string>()
  const re = /[@$:]([A-Za-z_][A-Za-z0-9_]*)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(sql)) !== null) names.add(match[1])
  const result = [...names]
  namedParamCache.set(sql, result)
  return result
}

function prepare(sql: string): BetterSqlite3.Statement {
  return getDb().prepare(sql)
}

/** يُبقي فقط المفاتيح التي يحتاجها الاستعلام — المفاتيح الزائدة تُهمَل بأمان */
function bindObject(sql: string, params: Record<string, unknown>): Record<string, unknown> {
  const allowed = namedParamsOf(sql)
  const bound: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in params) bound[key] = params[key]
  }
  return bound
}

function argsFor(sql: string, params: Params): unknown[] {
  if (Array.isArray(params)) return params
  return [bindObject(sql, params)]
}

export function all<T>(sql: string, params: Params = []): T[] {
  return prepare(sql).all(...(argsFor(sql, params) as never[])) as T[]
}

export function one<T>(sql: string, params: Params = []): T | undefined {
  return prepare(sql).get(...(argsFor(sql, params) as never[])) as T | undefined
}

export function run(sql: string, params: Params = []): { changes: number; lastInsertRowid: number } {
  const result = prepare(sql).run(...(argsFor(sql, params) as never[]))
  return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) }
}

export function exec(sql: string): void {
  getDb().exec(sql)
}

export function transaction<T>(fn: () => T): T {
  return getDb().transaction(fn)()
}

export function count(sql: string, params: Params = []): number {
  const row = one<{ c: number }>(sql, params)
  return row?.c ?? 0
}

/** السنة الدراسية المفعّلة حالياً */
export function activeYearId(): number {
  const row = one<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [SETTING_KEYS.activeYearId])
  const id = row ? Number(row.value) : NaN
  if (Number.isFinite(id) && id > 0) {
    const exists = one<{ id: number }>('SELECT id FROM academic_years WHERE id = ?', [id])
    if (exists) return id
  }
  const fallback = one<{ id: number }>('SELECT id FROM academic_years ORDER BY is_active DESC, id ASC LIMIT 1')
  if (!fallback) throw new Error('لا توجد سنة دراسية. أضف سنة دراسية أولاً.')
  return fallback.id
}

export function hasActiveYear(): boolean {
  return count('SELECT COUNT(*) AS c FROM academic_years') > 0
}

/** يحلّ السنة الدراسية: الصريحة إن وُجدت وإلا السنة المفعّلة */
export function resolveYear(academic_year_id?: number | null): number {
  return academic_year_id && academic_year_id > 0 ? academic_year_id : activeYearId()
}

/** تسجيل عملية في سجل التتبع المحلي (بدون بيانات حساسة) */
export function audit(action: string, entity?: string, entityId?: number | null, details?: string): void {
  try {
    run('INSERT INTO audit_logs (action, entity, entity_id, details) VALUES (?, ?, ?, ?)', [
      action,
      entity ?? null,
      entityId ?? null,
      details ?? null
    ])
  } catch {
    /* لا نُفشل العملية الأصلية بسبب السجل */
  }
}
