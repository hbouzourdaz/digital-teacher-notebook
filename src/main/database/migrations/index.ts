import initial from './001_initial.sql?raw'
import extraIndexes from './002_add_extra_indexes.sql?raw'

export interface Migration {
  version: number
  name: string
  sql: string
}

/**
 * كل ترقية تُعرَّف هنا بترتيب تصاعدي.
 * لا تعدّل ملفاً منشوراً — أضف ملفاً جديداً برقم أعلى.
 */
export const MIGRATIONS: Migration[] = [
  { version: 1, name: '001_initial', sql: initial },
  { version: 2, name: '002_add_extra_indexes', sql: extraIndexes }
]
