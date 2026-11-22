import { db } from '../db/database.ts';
import { newId } from '../utils/crypto.ts';

export interface AuditEntryInput {
  companyId: string | null;
  userId: string | null;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  context?: string;
}

export function logAudit(entry: AuditEntryInput): void {
  db.prepare(`
    INSERT INTO audit_logs (
      id, company_id, user_id, user_name, action, entity_type, entity_id,
      old_value_json, new_value_json, context
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newId('aud'),
    entry.companyId,
    entry.userId,
    entry.userName,
    entry.action,
    entry.entityType,
    entry.entityId,
    entry.oldValue !== undefined ? JSON.stringify(entry.oldValue) : '',
    entry.newValue !== undefined ? JSON.stringify(entry.newValue) : '',
    entry.context ?? ''
  );
}
