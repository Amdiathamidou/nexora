import { db } from '../db/database.ts';
import type { MailDirection, SignatureDelegation, DelegationStatus } from '../types.ts';
import { newId, safeParseJson } from '../utils/crypto.ts';
import { logAudit } from './auditService.ts';
import { createNotification } from './notificationService.ts';

/**
 * Returns today's ISO date string YYYY-MM-DD
 */
export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Update expired delegations automatically
 */
export function syncDelegationExpirations(companyId: string): void {
  const today = getTodayDateString();
  const expired = db
    .prepare(
      `SELECT id, delegator_user_id, delegate_user_id FROM signature_delegations 
       WHERE company_id = ? AND status = 'ACTIVE' AND end_date < ?`
    )
    .all(companyId, today) as Array<{ id: string; delegator_user_id: string; delegate_user_id: string }>;

  if (expired.length > 0) {
    const upd = db.prepare(
      `UPDATE signature_delegations 
       SET status = 'EXPIREE', updated_at = datetime('now') 
       WHERE id = ?`
    );
    for (const d of expired) {
      upd.run(d.id);
      logAudit({
        companyId,
        userId: 'system',
        userName: 'Système NEXORA',
        action: 'EXPIRATION_DELEGATION_SIGNATURE',
        entityType: 'SIGNATURE_DELEGATION',
        entityId: d.id,
        context: `La délégation de signature présidentielle (${d.id}) a expiré le ${today}.`,
      });
    }
  }
}

/**
 * Find an active, valid delegation for a given user, direction, and category
 */
export function getApplicableDelegation(args: {
  companyId: string;
  userId: string;
  direction: MailDirection;
  category: string;
}): SignatureDelegation | null {
  syncDelegationExpirations(args.companyId);

  const today = getTodayDateString();
  const rows = db
    .prepare(
      `SELECT d.*, 
              u1.full_name as delegator_name, u1.role as delegator_role,
              u2.full_name as delegate_name, u2.role as delegate_role, u2.job_title as delegate_job_title
       FROM signature_delegations d
       JOIN users u1 ON u1.id = d.delegator_user_id
       JOIN users u2 ON u2.id = d.delegate_user_id
       WHERE d.company_id = ? 
         AND d.delegate_user_id = ?
         AND d.status = 'ACTIVE'
         AND d.confirmed_by_president = 1
         AND d.start_date <= ?
         AND d.end_date >= ?
       ORDER BY d.created_at DESC`
    )
    .all(args.companyId, args.userId, today, today) as Array<Record<string, unknown>>;

  for (const row of rows) {
    const directions = safeParseJson<MailDirection[]>(String(row.allowed_directions_json || '[]'), []);
    const categories = safeParseJson<string[]>(String(row.allowed_categories_json || '[]'), []);

    const matchesDirection = directions.length === 0 || directions.includes(args.direction);
    const matchesCategory =
      categories.length === 0 ||
      categories.some((cat) => cat.trim().toLowerCase() === (args.category || '').trim().toLowerCase());

    if (matchesDirection && matchesCategory) {
      return {
        id: String(row.id),
        companyId: String(row.company_id),
        delegatorUserId: String(row.delegator_user_id),
        delegatorName: String(row.delegator_name),
        delegatorRole: String(row.delegator_role),
        delegateUserId: String(row.delegate_user_id),
        delegateName: String(row.delegate_name),
        delegateRole: String(row.delegate_role),
        delegateJobTitle: String(row.delegate_job_title),
        startDate: String(row.start_date),
        endDate: String(row.end_date),
        allowedDirections: directions,
        allowedCategories: categories,
        restrictions: String(row.restrictions || ''),
        status: row.status as DelegationStatus,
        confirmedByPresident: Boolean(row.confirmed_by_president),
        confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
        revokedAt: row.revoked_at ? String(row.revoked_at) : null,
        revocationReason: row.revocation_reason ? String(row.revocation_reason) : undefined,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      };
    }
  }

  return null;
}

/**
 * List all delegations for a company (with filters)
 */
export function listDelegations(args: {
  companyId: string;
  delegatorUserId?: string;
  delegateUserId?: string;
}): SignatureDelegation[] {
  syncDelegationExpirations(args.companyId);

  let sql = `
    SELECT d.*, 
           u1.full_name as delegator_name, u1.role as delegator_role,
           u2.full_name as delegate_name, u2.role as delegate_role, u2.job_title as delegate_job_title
    FROM signature_delegations d
    JOIN users u1 ON u1.id = d.delegator_user_id
    JOIN users u2 ON u2.id = d.delegate_user_id
    WHERE d.company_id = ?
  `;
  const params: unknown[] = [args.companyId];

  if (args.delegatorUserId) {
    sql += ' AND d.delegator_user_id = ?';
    params.push(args.delegatorUserId);
  }
  if (args.delegateUserId) {
    sql += ' AND d.delegate_user_id = ?';
    params.push(args.delegateUserId);
  }

  sql += ' ORDER BY d.created_at DESC';

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    companyId: String(row.company_id),
    delegatorUserId: String(row.delegator_user_id),
    delegatorName: String(row.delegator_name),
    delegatorRole: String(row.delegator_role),
    delegateUserId: String(row.delegate_user_id),
    delegateName: String(row.delegate_name),
    delegateRole: String(row.delegate_role),
    delegateJobTitle: String(row.delegate_job_title),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    allowedDirections: safeParseJson<MailDirection[]>(String(row.allowed_directions_json || '[]'), []),
    allowedCategories: safeParseJson<string[]>(String(row.allowed_categories_json || '[]'), []),
    restrictions: String(row.restrictions || ''),
    status: row.status as DelegationStatus,
    confirmedByPresident: Boolean(row.confirmed_by_president),
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    revocationReason: row.revocation_reason ? String(row.revocation_reason) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/**
 * Create a new delegation by the President
 */
export function createDelegation(args: {
  companyId: string;
  presidentUser: { id: string; fullName: string; role: string };
  delegateUserId: string;
  startDate: string;
  endDate: string;
  allowedDirections?: MailDirection[];
  allowedCategories?: string[];
  restrictions?: string;
  confirmByPresident: boolean;
}): SignatureDelegation {
  if (args.presidentUser.role !== 'PRESIDENT') {
    throw new Error('Seul le Président est habilité à déléguer son pouvoir de signature.');
  }

  if (!args.confirmByPresident) {
    throw new Error('La délégation doit être explicitement confirmée par le Président.');
  }

  const delegate = db
    .prepare('SELECT id, full_name, role, job_title, is_active FROM users WHERE id = ? AND company_id = ?')
    .get(args.delegateUserId, args.companyId) as
    | { id: string; full_name: string; role: string; job_title: string; is_active: number }
    | undefined;

  if (!delegate || !delegate.is_active) {
    throw new Error('Le bénéficiaire sélectionné est introuvable ou inactif.');
  }

  if (delegate.id === args.presidentUser.id) {
    throw new Error('Le Président ne peut pas se déléguer sa propre signature.');
  }

  if (!args.startDate || !args.endDate || args.startDate > args.endDate) {
    throw new Error('Les dates de début et de fin de la délégation sont invalides.');
  }

  const id = newId('del');
  const allowedDirections = args.allowedDirections && args.allowedDirections.length > 0 ? args.allowedDirections : ['ENTRANT', 'SORTANT', 'INTERNE'];
  const allowedCategories = args.allowedCategories || [];
  const restrictions = (args.restrictions || '').trim();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO signature_delegations (
        id, company_id, delegator_user_id, delegate_user_id, start_date, end_date,
        allowed_directions_json, allowed_categories_json, restrictions, status,
        confirmed_by_president, confirmed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, datetime('now'), datetime('now'), datetime('now'))
    `).run(
      id,
      args.companyId,
      args.presidentUser.id,
      delegate.id,
      args.startDate,
      args.endDate,
      JSON.stringify(allowedDirections),
      JSON.stringify(allowedCategories),
      restrictions
    );

    // Notify delegate
    createNotification({
      companyId: args.companyId,
      userId: delegate.id,
      eventType: 'DELEGATION_SIGNATURE_ACCORDEE',
      title: 'Délégation de signature présidentielle accordée',
      message: `${args.presidentUser.fullName} vous a délégué son pouvoir de signature du ${args.startDate} au ${args.endDate}. Périmètre : [${allowedDirections.join(', ')}]${restrictions ? ` - Restrictions : ${restrictions}` : ''}.`,
    });

    logAudit({
      companyId: args.companyId,
      userId: args.presidentUser.id,
      userName: args.presidentUser.fullName,
      action: 'CREATION_DELEGATION_SIGNATURE',
      entityType: 'SIGNATURE_DELEGATION',
      entityId: id,
      newValue: {
        delegate: delegate.full_name,
        startDate: args.startDate,
        endDate: args.endDate,
        allowedDirections,
        allowedCategories,
        restrictions,
      },
      context: `Délégation de signature présidentielle accordée à ${delegate.full_name} (${delegate.job_title}).`,
    });
  })();

  const created = listDelegations({ companyId: args.companyId, delegatorUserId: args.presidentUser.id }).find(
    (d) => d.id === id
  );
  if (!created) throw new Error('Échec de création de la délégation.');
  return created;
}

/**
 * Revoke delegation
 */
export function revokeDelegation(args: {
  companyId: string;
  presidentUser: { id: string; fullName: string; role: string };
  delegationId: string;
  reason?: string;
}): void {
  if (args.presidentUser.role !== 'PRESIDENT') {
    throw new Error('Seul le Président est habilité à révoquer une délégation de signature.');
  }

  const delegation = db
    .prepare('SELECT * FROM signature_delegations WHERE id = ? AND company_id = ?')
    .get(args.delegationId, args.companyId) as
    | { id: string; delegator_user_id: string; delegate_user_id: string; status: string }
    | undefined;

  if (!delegation) throw new Error('Délégation introuvable.');
  if (delegation.delegator_user_id !== args.presidentUser.id) {
    throw new Error('Vous ne pouvez révoquer que vos propres délégations.');
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE signature_delegations
      SET status = 'REVOQUEE', revoked_at = datetime('now'), revocation_reason = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(args.reason || 'Révocation par le Président', args.delegationId);

    createNotification({
      companyId: args.companyId,
      userId: delegation.delegate_user_id,
      eventType: 'DELEGATION_SIGNATURE_REVOQUEE',
      title: 'Révocation de délégation de signature présidentielle',
      message: `${args.presidentUser.fullName} a révoqué votre délégation de signature. Motif : ${args.reason || 'Décision présidentielle'}.`,
    });

    logAudit({
      companyId: args.companyId,
      userId: args.presidentUser.id,
      userName: args.presidentUser.fullName,
      action: 'REVOCATION_DELEGATION_SIGNATURE',
      entityType: 'SIGNATURE_DELEGATION',
      entityId: args.delegationId,
      context: args.reason || 'Révocation anticipée par le Président',
    });
  })();
}

/**
 * Suspend delegation
 */
export function suspendDelegation(args: {
  companyId: string;
  presidentUser: { id: string; fullName: string; role: string };
  delegationId: string;
  reason?: string;
}): void {
  if (args.presidentUser.role !== 'PRESIDENT') {
    throw new Error('Seul le Président est habilité à suspendre une délégation de signature.');
  }

  const delegation = db
    .prepare('SELECT * FROM signature_delegations WHERE id = ? AND company_id = ?')
    .get(args.delegationId, args.companyId) as
    | { id: string; delegator_user_id: string; delegate_user_id: string }
    | undefined;

  if (!delegation) throw new Error('Délégation introuvable.');

  db.transaction(() => {
    db.prepare(`
      UPDATE signature_delegations
      SET status = 'SUSPENDUE', updated_at = datetime('now')
      WHERE id = ?
    `).run(args.delegationId);

    createNotification({
      companyId: args.companyId,
      userId: delegation.delegate_user_id,
      eventType: 'DELEGATION_SIGNATURE_SUSPENDUE',
      title: 'Suspension de délégation de signature',
      message: `Votre délégation de signature a été temporairement suspendue par le Président. ${args.reason || ''}`,
    });

    logAudit({
      companyId: args.companyId,
      userId: args.presidentUser.id,
      userName: args.presidentUser.fullName,
      action: 'SUSPENSION_DELEGATION_SIGNATURE',
      entityType: 'SIGNATURE_DELEGATION',
      entityId: args.delegationId,
      context: args.reason || 'Suspension temporaire',
    });
  })();
}

/**
 * Reactivate suspended delegation
 */
export function reactivateDelegation(args: {
  companyId: string;
  presidentUser: { id: string; fullName: string; role: string };
  delegationId: string;
}): void {
  if (args.presidentUser.role !== 'PRESIDENT') {
    throw new Error('Seul le Président est habilité à réactiver une délégation.');
  }

  const today = getTodayDateString();
  const delegation = db
    .prepare('SELECT * FROM signature_delegations WHERE id = ? AND company_id = ?')
    .get(args.delegationId, args.companyId) as
    | { id: string; delegator_user_id: string; delegate_user_id: string; end_date: string }
    | undefined;

  if (!delegation) throw new Error('Délégation introuvable.');
  if (delegation.end_date < today) {
    throw new Error('Impossible de réactiver une délégation dont la date de fin est dépassée.');
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE signature_delegations
      SET status = 'ACTIVE', updated_at = datetime('now')
      WHERE id = ?
    `).run(args.delegationId);

    createNotification({
      companyId: args.companyId,
      userId: delegation.delegate_user_id,
      eventType: 'DELEGATION_SIGNATURE_REACTIVEE',
      title: 'Réactivation de délégation de signature',
      message: `Votre délégation de signature présidentielle est de nouveau active jusqu’au ${delegation.end_date}.`,
    });

    logAudit({
      companyId: args.companyId,
      userId: args.presidentUser.id,
      userName: args.presidentUser.fullName,
      action: 'REACTIVATION_DELEGATION_SIGNATURE',
      entityType: 'SIGNATURE_DELEGATION',
      entityId: args.delegationId,
      context: 'Réactivation de délégation suspendue',
    });
  })();
}
