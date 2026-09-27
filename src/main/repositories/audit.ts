import type { AuditLog } from '@shared/types'
import { all } from './base'

export function listAudit(limit = 200): AuditLog[] {
  return all<AuditLog>('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?', [Math.min(Math.max(limit, 1), 2000)])
}
