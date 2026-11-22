import { Router, type Response } from 'express';
import { db } from '../db/database.ts';
import {
  requireAuth,
  requireCompanyScope,
  requireRoles,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { logAudit } from '../services/auditService.ts';
import { createNotification, notifyMailAssignedToUser } from '../services/notificationService.ts';
import {
  confirmAndVerifyPayment,
  getActiveGatewayConfig,
  initiateSubscriptionCheckout,
  WEST_AFRICA_COUNTRIES,
  WEST_AFRICA_PAYMENT_METHODS,
  type BillingCycle,
  type PaymentMethodCode,
} from '../services/paymentService.ts';
import {
  createDelegation,
  listDelegations,
  reactivateDelegation,
  revokeDelegation,
  suspendDelegation,
} from '../services/delegationService.ts';
import { ensureMandatorySecretariatReturn } from '../services/workflowEngine.ts';
import type { CircuitStepConfig, MailDirection } from '../types.ts';
import { hashPassword, newId, safeParseJson, verifyPassword } from '../utils/crypto.ts';

export const adminRoutes = Router();

function validateImageDataUrl(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (s === '') return '';
  if (!s.startsWith('data:image/') && !s.startsWith('/src/assets/')) {
    throw new Error(`${fieldName} doit être une image valide (PNG, JPG ou SVG).`);
  }
  if (s.length > 750000) {
    throw new Error(`${fieldName} dépasse la taille maximale autorisée (550 Ko).`);
  }
  return s;
}

// ==================== PUBLIC ENDPOINTS ====================

adminRoutes.get('/public/plans', (_req, res: Response) => {
  const plans = db
    .prepare('SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY price_monthly_fcfa ASC')
    .all() as Array<Record<string, unknown>>;
  res.json({
    plans: plans.map((p) => ({
      ...p,
      features: safeParseJson<string[]>(String(p.features_json), []),
    })),
  });
});

adminRoutes.post('/public/contact', (req, res: Response) => {
  const { companyName, contactName, email, phone, message } = req.body ?? {};
  if (!companyName || !contactName || !email || !message) {
    res.status(400).json({ error: 'Veuillez remplir tous les champs obligatoires.' });
    return;
  }
  const id = newId('lead');
  db.prepare(`
    INSERT INTO contact_leads (id, company_name, contact_name, email, phone, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, String(companyName).trim(), String(contactName).trim(), String(email).trim(), String(phone || '').trim(), String(message).trim());

  res.status(201).json({ id, message: 'Votre demande a bien été transmise à l’équipe NEXORA.' });
});

// ==================== USER PROFILE & SIGNATURE / STAMP ====================

adminRoutes.get('/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const authUser = req.user!;
  const row = db
    .prepare(`
      SELECT id, company_id, full_name, job_title, email, phone, role, avatar_url, signature_image, stamp_image, created_at
      FROM users WHERE id = ?
    `)
    .get(authUser.id) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Profil introuvable.' });
    return;
  }

  const services = authUser.companyId
    ? db
        .prepare(`
          SELECT s.id, s.name, s.is_secretariat
          FROM services s
          JOIN user_services us ON us.service_id = s.id
          WHERE us.user_id = ?
        `)
        .all(authUser.id)
    : [];

  const companyStampRow = authUser.companyId
    ? (db.prepare('SELECT trade_name, stamp_image FROM companies WHERE id = ?').get(authUser.companyId) as
        | { trade_name: string; stamp_image?: string }
        | undefined)
    : undefined;

  res.json({
    profile: {
      id: row.id,
      companyId: row.company_id,
      fullName: row.full_name,
      jobTitle: row.job_title,
      email: row.email,
      phone: row.phone || '',
      role: row.role,
      avatarUrl: row.avatar_url || '',
      signatureImage: row.signature_image || '',
      stampImage: row.stamp_image || '',
      companyStampImage: companyStampRow?.stamp_image || '',
      companyTradeName: companyStampRow?.trade_name || 'NEXORA',
      createdAt: row.created_at,
      services,
      permissions: authUser.permissions,
    },
  });
});

adminRoutes.patch('/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const actor = req.user!;
  const { fullName, jobTitle, phone, avatarUrl, signatureImage, stampImage, applyAsCompanyStamp } = req.body ?? {};

  if (fullName !== undefined && !String(fullName).trim()) {
    res.status(400).json({ error: 'Le nom complet ne peut pas être vide.' });
    return;
  }

  let validAvatar: string | null = null;
  let validSig: string | null = null;
  let validStamp: string | null = null;
  try {
    validAvatar = validateImageDataUrl(avatarUrl, 'La photo de profil');
    validSig = validateImageDataUrl(signatureImage, 'La signature numérique');
    validStamp = validateImageDataUrl(stampImage, 'L’image du cachet');
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Format d’image invalide.' });
    return;
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET full_name = COALESCE(?, full_name),
          job_title = COALESCE(?, job_title),
          phone = COALESCE(?, phone),
          avatar_url = COALESCE(?, avatar_url),
          signature_image = COALESCE(?, signature_image),
          stamp_image = COALESCE(?, stamp_image)
      WHERE id = ?
    `).run(
      fullName !== undefined ? String(fullName).trim() : null,
      jobTitle !== undefined ? String(jobTitle).trim() : null,
      phone !== undefined ? String(phone).trim() : null,
      validAvatar,
      validSig,
      validStamp,
      actor.id
    );

    if (
      applyAsCompanyStamp &&
      validStamp !== null &&
      actor.companyId &&
      (actor.role === 'PRESIDENT' || actor.role === 'ADMIN')
    ) {
      db.prepare('UPDATE companies SET stamp_image = ? WHERE id = ?').run(validStamp, actor.companyId);
    }
  })();

  logAudit({
    companyId: actor.companyId,
    userId: actor.id,
    userName: fullName ? String(fullName).trim() : actor.fullName,
    action: 'MODIFICATION_PROFIL',
    entityType: 'USER',
    entityId: actor.id,
    newValue: {
      updatedFields: Object.keys(req.body ?? {}),
      hasSignature: validSig !== null ? Boolean(validSig) : undefined,
      hasStamp: validStamp !== null ? Boolean(validStamp) : undefined,
    },
    context: 'Mise à jour du profil personnel et/ou des éléments de signature/cachet.',
  });

  res.json({ ok: true, message: 'Votre profil a été mis à jour avec succès.' });
});

adminRoutes.post('/profile/password', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const actor = req.user!;
  const { currentPassword, newPassword } = req.body ?? {};

  if (!currentPassword || !newPassword || String(newPassword).length < 8) {
    res.status(400).json({ error: 'Mot de passe actuel et nouveau mot de passe (min. 8 caractères) requis.' });
    return;
  }

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(actor.id) as
    | { password_hash: string }
    | undefined;
  if (!row || !verifyPassword(String(currentPassword), row.password_hash)) {
    res.status(400).json({ error: 'Le mot de passe actuel est incorrect.' });
    return;
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(newPassword)), actor.id);

  logAudit({
    companyId: actor.companyId,
    userId: actor.id,
    userName: actor.fullName,
    action: 'CHANGEMENT_MOT_DE_PASSE',
    entityType: 'USER',
    entityId: actor.id,
    context: 'Mot de passe modifié depuis Mon Profil.',
  });

  res.json({ ok: true, message: 'Votre mot de passe a été modifié.' });
});

// ==================== DASHBOARDS (ROLE-SPECIFIC REAL DATA) ====================

adminRoutes.get('/dashboard', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;

  const counts = db
    .prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN direction = 'ENTRANT' THEN 1 ELSE 0 END) as incoming,
        SUM(CASE WHEN direction = 'SORTANT' THEN 1 ELSE 0 END) as outgoing,
        SUM(CASE WHEN direction = 'INTERNE' THEN 1 ELSE 0 END) as internal,
        SUM(CASE WHEN mail_status IN ('ENREGISTRE', 'EN_CIRCUIT', 'EN_ATTENTE_CORRECTION', 'RETOUR_SECRETARIAT') THEN 1 ELSE 0 END) as inProgress,
        SUM(CASE WHEN due_date != '' AND due_date < date('now') AND mail_status NOT IN ('CLOTURE', 'ARCHIVE', 'REJETE', 'CLASSE_SANS_SUITE') THEN 1 ELSE 0 END) as overdue,
        SUM(CASE WHEN archive_status = 'ARCHIVE' THEN 1 ELSE 0 END) as archived,
        SUM(CASE WHEN substr(received_at, 1, 10) = date('now') THEN 1 ELSE 0 END) as receivedToday,
        SUM(CASE WHEN mail_status = 'ENREGISTRE' THEN 1 ELSE 0 END) as awaitingOrientation,
        SUM(CASE WHEN mail_status = 'RETOUR_SECRETARIAT' THEN 1 ELSE 0 END) as returnedSecretariat,
        SUM(CASE WHEN shipping_status = 'A_EXPEDIER' THEN 1 ELSE 0 END) as toDispatch
      FROM mails
      WHERE company_id = ?
    `)
    .get(companyId) as Record<string, number>;

  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users WHERE company_id = ? AND is_active = 1').get(companyId) as { c: number }).c;
  const storageBytes = (
    db.prepare('SELECT COALESCE(SUM(size_bytes), 0) as s FROM mail_documents WHERE company_id = ?').get(companyId) as { s: number }
  ).s;

  const serviceBreakdown = db
    .prepare(`
      SELECT s.id, s.name, COUNT(m.id) as mailCount,
             SUM(CASE WHEN m.due_date != '' AND m.due_date < date('now') AND m.mail_status NOT IN ('CLOTURE', 'ARCHIVE') THEN 1 ELSE 0 END) as overdueCount
      FROM services s
      LEFT JOIN mails m ON m.current_service_id = s.id AND m.company_id = s.company_id
      WHERE s.company_id = ?
      GROUP BY s.id, s.name
      ORDER BY mailCount DESC
    `)
    .all(companyId);

  const recentAudit = db
    .prepare('SELECT * FROM audit_logs WHERE company_id = ? ORDER BY created_at DESC LIMIT 10')
    .all(companyId);

  const recentEmails = db
    .prepare('SELECT id, mail_id, recipient_email, recipient_name, department_name, subject, delivery_status, created_at FROM email_logs WHERE company_id = ? ORDER BY created_at DESC LIMIT 8')
    .all(companyId);

  // Role-specific queues
  const presidentPending = db
    .prepare(`
      SELECT m.*, w.step_name, w.due_at as step_due_at
      FROM mails m
      JOIN workflow_step_executions w ON w.mail_id = m.id
      WHERE m.company_id = ? AND w.step_type = 'PRESIDENT_VALIDATION' AND w.status = 'EN_COURS'
      ORDER BY m.priority DESC, m.due_date ASC
    `)
    .all(companyId);

  const presidentDecisions = db
    .prepare(`
      SELECT w.id, w.mail_id, m.reference, m.subject, w.decision, w.decision_motif, w.observations, w.decided_at
      FROM workflow_step_executions w
      JOIN mails m ON m.id = w.mail_id
      WHERE w.company_id = ? AND w.step_type = 'PRESIDENT_VALIDATION' AND w.decided_at IS NOT NULL
      ORDER BY w.decided_at DESC
      LIMIT 10
    `)
    .all(companyId);

  const myTasks = db
    .prepare(`
      SELECT t.*, m.reference as mail_reference, m.subject as mail_subject, m.direction as mail_direction, s.name as service_name
      FROM tasks t
      JOIN mails m ON m.id = t.mail_id
      LEFT JOIN services s ON s.id = t.assigned_service_id
      WHERE t.company_id = ? AND t.assigned_user_id = ? AND t.status NOT IN ('TERMINEE', 'ANNULEE')
      ORDER BY t.due_date ASC, t.created_at DESC
    `)
    .all(companyId, user.id);

  const serviceIdsPlaceholders = user.serviceIds.length > 0 ? user.serviceIds.map(() => '?').join(',') : "''";
  const responsableMails =
    user.serviceIds.length > 0
      ? db
          .prepare(`
            SELECT m.*, u.full_name as assigned_agent_name, s.name as service_name
            FROM mails m
            LEFT JOIN users u ON u.id = m.assigned_agent_id
            LEFT JOIN services s ON s.id = m.current_service_id
            WHERE m.company_id = ? AND m.current_service_id IN (${serviceIdsPlaceholders}) AND m.archive_status != 'ARCHIVE'
            ORDER BY m.created_at DESC
          `)
          .all(companyId, ...user.serviceIds)
      : [];

  const secretariatQueues = {
    awaitingOrientation: db
      .prepare("SELECT * FROM mails WHERE company_id = ? AND mail_status = 'ENREGISTRE' ORDER BY created_at DESC")
      .all(companyId),
    returnedForControl: db
      .prepare("SELECT * FROM mails WHERE company_id = ? AND mail_status = 'RETOUR_SECRETARIAT' ORDER BY updated_at DESC")
      .all(companyId),
    readyToArchive: db
      .prepare("SELECT * FROM mails WHERE company_id = ? AND mail_status = 'CLOTURE' AND archive_status = 'NON_ARCHIVE' ORDER BY updated_at DESC")
      .all(companyId),
  };

  res.json({
    counts: {
      total: counts.total || 0,
      incoming: counts.incoming || 0,
      outgoing: counts.outgoing || 0,
      internal: counts.internal || 0,
      inProgress: counts.inProgress || 0,
      overdue: counts.overdue || 0,
      archived: counts.archived || 0,
      receivedToday: counts.receivedToday || 0,
      awaitingOrientation: counts.awaitingOrientation || 0,
      returnedSecretariat: counts.returnedSecretariat || 0,
      toDispatch: counts.toDispatch || 0,
      userCount,
      storageMb: Number((storageBytes / (1024 * 1024)).toFixed(2)),
    },
    serviceBreakdown,
    recentAudit,
    recentEmails,
    presidentPending,
    presidentDecisions,
    myTasks,
    responsableMails,
    secretariatQueues,
  });
});

// ==================== TASKS ENGINE ====================

adminRoutes.get('/tasks', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const { scope } = req.query;

  let sql = `
    SELECT t.*, m.reference as mail_reference, m.subject as mail_subject, m.mail_status,
           u.full_name as assigned_user_name, s.name as service_name
    FROM tasks t
    JOIN mails m ON m.id = t.mail_id
    LEFT JOIN users u ON u.id = t.assigned_user_id
    LEFT JOIN services s ON s.id = t.assigned_service_id
    WHERE t.company_id = ?
  `;
  const params: unknown[] = [companyId];

  if (scope === 'mine' || (user.role === 'AGENT' && !user.isSecretariat && scope !== 'service')) {
    sql += ' AND t.assigned_user_id = ?';
    params.push(user.id);
  } else if (user.role === 'RESPONSABLE' && user.serviceIds.length > 0 && scope !== 'all') {
    sql += ` AND (t.assigned_service_id IN (${user.serviceIds.map(() => '?').join(',')}) OR t.assigned_user_id = ?)`;
    params.push(...user.serviceIds, user.id);
  }

  sql += ' ORDER BY t.created_at DESC LIMIT 150';
  const tasks = db.prepare(sql).all(...params);
  res.json({ tasks });
});

adminRoutes.patch('/tasks/:id', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const taskId = String(req.params.id);
  const { status, comment } = req.body ?? {};

  const allowed = ['A_TRAITER', 'EN_COURS', 'EN_ATTENTE', 'TRANSMISE', 'A_CORRIGER', 'VALIDEE', 'REJETEE', 'TERMINEE', 'ANNULEE'];
  if (!allowed.includes(status)) {
    res.status(400).json({ error: 'Statut de tâche invalide.' });
    return;
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND company_id = ?').get(taskId, companyId) as {
    id: string;
    mail_id: string;
    assigned_user_id: string | null;
    title: string;
  } | undefined;
  if (!task) {
    res.status(404).json({ error: 'Tâche introuvable.' });
    return;
  }

  // Agent cannot self-validate a task into VALIDEE
  if (user.role === 'AGENT' && status === 'VALIDEE') {
    res.status(403).json({ error: 'Un Agent ne peut pas valider sa propre tâche ; transmettez-la au Responsable.' });
    return;
  }

  db.prepare(`UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, taskId);

  if (comment) {
    db.prepare(`
      INSERT INTO mail_comments (id, mail_id, company_id, user_id, comment_type, content)
      VALUES (?, ?, ?, ?, 'OBSERVATION', ?)
    `).run(newId('cmt'), task.mail_id, companyId, user.id, `[Tâche] ${String(comment)}`);
  }

  logAudit({
    companyId,
    userId: user.id,
    userName: user.fullName,
    action: 'MAJ_TACHE',
    entityType: 'TASK',
    entityId: taskId,
    newValue: { status },
    context: comment || task.title,
  });

  res.json({ ok: true });
});

adminRoutes.post('/tasks/:id/transfer', requireAuth, requireCompanyScope, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const taskId = String(req.params.id);
  const { targetUserId, serviceId } = req.body ?? {};

  if (!targetUserId) {
    res.status(400).json({ error: 'Destinataire du transfert requis.' });
    return;
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND company_id = ?').get(taskId, companyId) as {
    id: string;
    mail_id: string;
    assigned_service_id: string | null;
  } | undefined;
  if (!task) {
    res.status(404).json({ error: 'Tâche introuvable.' });
    return;
  }

  const mail = db.prepare('SELECT * FROM mails WHERE id = ? AND company_id = ?').get(task.mail_id, companyId) as {
    id: string;
    reference: string;
    direction: string;
    subject: string;
    sender_name: string;
    sender_org: string;
    priority: string;
    due_date: string;
  };

  db.prepare(`
    UPDATE tasks
    SET assigned_user_id = ?, assigned_service_id = COALESCE(?, assigned_service_id), status = 'A_TRAITER', updated_at = datetime('now')
    WHERE id = ?
  `).run(String(targetUserId), serviceId || null, taskId);

  const emailsSent = await notifyMailAssignedToUser({
    companyId,
    mail,
    targetUserId: String(targetUserId),
    serviceId: serviceId || task.assigned_service_id,
    taskId,
    assignedByName: user.fullName,
  });

  res.json({ ok: true, departmentEmailsTriggered: emailsSent });
});

adminRoutes.post('/tasks/:id/remind', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const taskId = String(req.params.id);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND company_id = ?').get(taskId, companyId) as {
    id: string;
    mail_id: string;
    assigned_user_id: string | null;
    title: string;
  } | undefined;
  if (!task || !task.assigned_user_id) {
    res.status(404).json({ error: 'Tâche ou destinataire introuvable.' });
    return;
  }

  createNotification({
    companyId,
    userId: task.assigned_user_id,
    mailId: task.mail_id,
    taskId: task.id,
    eventType: 'RELANCE_TACHE',
    title: `Relance : ${task.title}`,
    message: `${user.fullName} vous relance pour le traitement prioritaire de cette tâche.`,
  });

  res.json({ ok: true });
});

// ==================== USERS & SERVICES ====================

adminRoutes.get('/users', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId!;
  const users = db
    .prepare(`
      SELECT id, company_id, full_name, job_title, email, phone, role, is_active, avatar_url, permissions_json, created_at
      FROM users WHERE company_id = ?
      ORDER BY role ASC, full_name ASC
    `)
    .all(companyId) as Array<Record<string, unknown>>;

  const memberships = db
    .prepare(`
      SELECT us.user_id, s.id as service_id, s.name as service_name, s.is_secretariat
      FROM user_services us
      JOIN services s ON s.id = us.service_id
      WHERE us.company_id = ?
    `)
    .all(companyId) as Array<{ user_id: string; service_id: string; service_name: string; is_secretariat: number }>;

  const enriched = users.map((u) => ({
    ...u,
    permissions: safeParseJson(String(u.permissions_json), {}),
    services: memberships.filter((m) => m.user_id === u.id),
  }));

  res.json({ users: enriched });
});

adminRoutes.post('/users', requireAuth, requireCompanyScope, requireRoles('ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const actor = req.user!;
  const companyId = actor.companyId!;
  const { fullName, jobTitle, email, phone, password, role, serviceIds, permissions } = req.body ?? {};

  if (!fullName || !email || !password || !['ADMIN', 'PRESIDENT', 'RESPONSABLE', 'AGENT'].includes(role)) {
    res.status(400).json({ error: 'Nom, e-mail, mot de passe et rôle valide requis.' });
    return;
  }

  // Security Rule 1 & 2: Admin cannot grant or self-assign presidential role or presidential signature powers
  if (role === 'PRESIDENT') {
    res.status(403).json({ error: 'L’administrateur ne peut pas créer ni s’attribuer le rôle de Président.' });
    return;
  }

  // Sanitize permissions: Admin can never grant delegation or presidential signature power via permissions
  const sanitizedPermissions = { ...(permissions || {}) };
  delete (sanitizedPermissions as Record<string, unknown>).can_validate_delegation;
  delete (sanitizedPermissions as Record<string, unknown>).presidential_signature;

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(String(email).trim());
  if (existing) {
    res.status(409).json({ error: 'Cette adresse e-mail est déjà utilisée.' });
    return;
  }

  const userId = newId('usr');
  db.transaction(() => {
    db.prepare(`
      INSERT INTO users (id, company_id, full_name, job_title, email, phone, password_hash, role, is_active, permissions_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      userId,
      companyId,
      String(fullName).trim(),
      String(jobTitle || role).trim(),
      String(email).trim().toLowerCase(),
      String(phone || '').trim(),
      hashPassword(String(password)),
      role,
      JSON.stringify(sanitizedPermissions)
    );

    if (Array.isArray(serviceIds)) {
      const insUs = db.prepare('INSERT OR IGNORE INTO user_services (user_id, service_id, company_id) VALUES (?, ?, ?)');
      for (const sid of serviceIds) {
        insUs.run(userId, String(sid), companyId);
      }
    }
  })();

  logAudit({
    companyId,
    userId: actor.id,
    userName: actor.fullName,
    action: 'CREATION_UTILISATEUR',
    entityType: 'USER',
    entityId: userId,
    newValue: { fullName, email, role },
  });

  res.status(201).json({ id: userId });
});

adminRoutes.patch('/users/:id', requireAuth, requireCompanyScope, requireRoles('ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const actor = req.user!;
  const companyId = actor.companyId!;
  const targetId = String(req.params.id);
  const { fullName, jobTitle, phone, role, isActive, permissions, serviceIds } = req.body ?? {};

  const target = db
    .prepare('SELECT id, role FROM users WHERE id = ? AND company_id = ?')
    .get(targetId, companyId) as { id: string; role: string } | undefined;
  if (!target) {
    res.status(404).json({ error: 'Utilisateur introuvable.' });
    return;
  }

  // Security Rule 2: Admin cannot promote anyone to PRESIDENT or change President's role
  if (role === 'PRESIDENT' && target.role !== 'PRESIDENT') {
    res.status(403).json({ error: 'L’administrateur ne peut pas accorder le rôle ou le pouvoir de Président.' });
    return;
  }
  if (target.role === 'PRESIDENT' && role && role !== 'PRESIDENT') {
    res.status(403).json({ error: 'L’administrateur ne peut pas destituer le Président.' });
    return;
  }

  // Sanitize permissions: Admin can never grant delegation or presidential signature power via permissions
  let sanitizedPermissions: Record<string, unknown> | undefined = undefined;
  if (permissions !== undefined && permissions !== null) {
    sanitizedPermissions = { ...(permissions as Record<string, unknown>) };
    delete sanitizedPermissions.can_validate_delegation;
    delete sanitizedPermissions.presidential_signature;
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET full_name = COALESCE(?, full_name),
          job_title = COALESCE(?, job_title),
          phone = COALESCE(?, phone),
          role = COALESCE(?, role),
          is_active = COALESCE(?, is_active),
          permissions_json = COALESCE(?, permissions_json)
      WHERE id = ? AND company_id = ?
    `).run(
      fullName ?? null,
      jobTitle ?? null,
      phone ?? null,
      role ?? null,
      isActive !== undefined ? (isActive ? 1 : 0) : null,
      sanitizedPermissions !== undefined ? JSON.stringify(sanitizedPermissions) : null,
      targetId,
      companyId
    );

    if (Array.isArray(serviceIds)) {
      db.prepare('DELETE FROM user_services WHERE user_id = ? AND company_id = ?').run(targetId, companyId);
      const ins = db.prepare('INSERT OR IGNORE INTO user_services (user_id, service_id, company_id) VALUES (?, ?, ?)');
      for (const sid of serviceIds) {
        ins.run(targetId, String(sid), companyId);
      }
    }
  })();

  logAudit({
    companyId,
    userId: actor.id,
    userName: actor.fullName,
    action: 'MODIFICATION_PERMISSIONS_UTILISATEUR',
    entityType: 'USER',
    entityId: targetId,
    newValue: { role, isActive, permissions },
  });

  res.json({ ok: true });
});

adminRoutes.get('/services', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId!;
  const services = db
    .prepare(`
      SELECT s.*, u.full_name as manager_name, u.email as manager_email,
             (SELECT COUNT(*) FROM user_services us WHERE us.service_id = s.id) as member_count,
             (SELECT COUNT(*) FROM mails m WHERE m.current_service_id = s.id AND m.archive_status != 'ARCHIVE') as active_mail_count
      FROM services s
      LEFT JOIN users u ON u.id = s.manager_user_id
      WHERE s.company_id = ?
      ORDER BY s.is_secretariat DESC, s.name ASC
    `)
    .all(companyId);

  res.json({ services });
});

adminRoutes.post('/services', requireAuth, requireCompanyScope, requireRoles('ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const actor = req.user!;
  const companyId = actor.companyId!;
  const { name, description, managerUserId, isSecretariat, receptionRules } = req.body ?? {};
  if (!name) {
    res.status(400).json({ error: 'Le nom du service est obligatoire.' });
    return;
  }

  const id = newId('svc');
  db.prepare(`
    INSERT INTO services (id, company_id, name, description, manager_user_id, is_secretariat, reception_rules)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, companyId, String(name).trim(), String(description || ''), managerUserId || null, isSecretariat ? 1 : 0, String(receptionRules || ''));

  if (managerUserId) {
    db.prepare('INSERT OR IGNORE INTO user_services (user_id, service_id, company_id) VALUES (?, ?, ?)').run(String(managerUserId), id, companyId);
  }

  res.status(201).json({ id });
});

adminRoutes.patch('/services/:id', requireAuth, requireCompanyScope, requireRoles('ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId!;
  const id = String(req.params.id);
  const { name, description, managerUserId, receptionRules } = req.body ?? {};

  db.prepare(`
    UPDATE services
    SET name = COALESCE(?, name),
        description = COALESCE(?, description),
        manager_user_id = ?,
        reception_rules = COALESCE(?, reception_rules)
    WHERE id = ? AND company_id = ?
  `).run(name ?? null, description ?? null, managerUserId || null, receptionRules ?? null, id, companyId);

  if (managerUserId) {
    db.prepare('INSERT OR IGNORE INTO user_services (user_id, service_id, company_id) VALUES (?, ?, ?)').run(String(managerUserId), id, companyId);
  }
  res.json({ ok: true });
});

// ==================== CIRCUITS & VERSIONING ====================

adminRoutes.get('/circuits', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId!;
  const circuits = db
    .prepare(`
      SELECT c.*, cv.steps_json, cv.id as current_version_id
      FROM circuits c
      JOIN circuit_versions cv ON cv.circuit_id = c.id AND cv.version_number = c.current_version
      WHERE c.company_id = ?
      ORDER BY c.mail_direction ASC, c.name ASC
    `)
    .all(companyId) as Array<Record<string, unknown>>;

  res.json({
    circuits: circuits.map((c) => ({
      ...c,
      steps: safeParseJson<CircuitStepConfig[]>(String(c.steps_json), []),
    })),
  });
});

adminRoutes.post('/circuits', requireAuth, requireCompanyScope, requireRoles('ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const actor = req.user!;
  const companyId = actor.companyId!;
  const { name, description, category, mailDirection, steps } = req.body ?? {};
  if (!name || !Array.isArray(steps) || steps.length === 0) {
    res.status(400).json({ error: 'Nom du circuit et au moins une étape requis.' });
    return;
  }

  const direction: MailDirection = ['ENTRANT', 'SORTANT', 'INTERNE'].includes(mailDirection) ? mailDirection : 'ENTRANT';
  const secService = db.prepare('SELECT id FROM services WHERE company_id = ? AND is_secretariat = 1 LIMIT 1').get(companyId) as
    | { id: string }
    | undefined;
  const normalizedSteps = ensureMandatorySecretariatReturn(direction, steps, secService?.id ?? null);

  const circuitId = newId('cir');
  const versionId = newId('cv');

  db.transaction(() => {
    db.prepare(`
      INSERT INTO circuits (id, company_id, name, description, category, mail_direction, current_version, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1, 1)
    `).run(circuitId, companyId, String(name).trim(), String(description || ''), String(category || 'Général'), direction);

    db.prepare(`
      INSERT INTO circuit_versions (id, circuit_id, company_id, version_number, steps_json)
      VALUES (?, ?, ?, 1, ?)
    `).run(versionId, circuitId, companyId, JSON.stringify(normalizedSteps));
  })();

  logAudit({
    companyId,
    userId: actor.id,
    userName: actor.fullName,
    action: 'CREATION_CIRCUIT',
    entityType: 'CIRCUIT',
    entityId: circuitId,
    newValue: { name, version: 1, stepsCount: normalizedSteps.length },
  });

  res.status(201).json({ id: circuitId, version: 1 });
});

// Create new version of an existing circuit (preserves in-flight workflow instances!)
adminRoutes.put('/circuits/:id', requireAuth, requireCompanyScope, requireRoles('ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const actor = req.user!;
  const companyId = actor.companyId!;
  const circuitId = String(req.params.id);
  const { name, description, steps, isActive } = req.body ?? {};

  const existing = db.prepare('SELECT * FROM circuits WHERE id = ? AND company_id = ?').get(circuitId, companyId) as
    | { id: string; current_version: number; mail_direction: MailDirection }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Circuit introuvable.' });
    return;
  }

  const nextVer = existing.current_version + 1;
  const secService = db.prepare('SELECT id FROM services WHERE company_id = ? AND is_secretariat = 1 LIMIT 1').get(companyId) as
    | { id: string }
    | undefined;
  const normalizedSteps = ensureMandatorySecretariatReturn(existing.mail_direction, steps || [], secService?.id ?? null);

  db.transaction(() => {
    db.prepare(`
      UPDATE circuits
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          is_active = COALESCE(?, is_active),
          current_version = ?
      WHERE id = ? AND company_id = ?
    `).run(name ?? null, description ?? null, isActive !== undefined ? (isActive ? 1 : 0) : null, nextVer, circuitId, companyId);

    db.prepare(`
      INSERT INTO circuit_versions (id, circuit_id, company_id, version_number, steps_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(newId('cv'), circuitId, companyId, nextVer, JSON.stringify(normalizedSteps));
  })();

  logAudit({
    companyId,
    userId: actor.id,
    userName: actor.fullName,
    action: 'NOUVELLE_VERSION_CIRCUIT',
    entityType: 'CIRCUIT',
    entityId: circuitId,
    oldValue: existing.current_version,
    newValue: nextVer,
    context: 'Les dossiers déjà engagés conservent leur version d’origine.',
  });

  res.json({ ok: true, version: nextVer });
});

// ==================== NOTIFICATIONS & EMAIL OUTBOX ====================

adminRoutes.get('/notifications', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const items = db
    .prepare('SELECT * FROM notifications WHERE company_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 60')
    .all(user.companyId!, user.id);
  const unreadCount = (
    db.prepare('SELECT COUNT(*) as c FROM notifications WHERE company_id = ? AND user_id = ? AND is_read = 0').get(user.companyId!, user.id) as {
      c: number;
    }
  ).c;
  res.json({ notifications: items, unreadCount });
});

adminRoutes.post('/notifications/:id/read', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(String(req.params.id), req.user!.id);
  res.json({ ok: true });
});

adminRoutes.post('/notifications/read-all', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE company_id = ? AND user_id = ?').run(req.user!.companyId!, req.user!.id);
  res.json({ ok: true });
});

adminRoutes.get('/emails', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const emails =
    user.role === 'ADMIN' || user.role === 'PRESIDENT' || user.isSecretariat
      ? db.prepare('SELECT * FROM email_logs WHERE company_id = ? ORDER BY created_at DESC LIMIT 100').all(user.companyId!)
      : db
          .prepare('SELECT * FROM email_logs WHERE company_id = ? AND recipient_user_id = ? ORDER BY created_at DESC LIMIT 100')
          .all(user.companyId!, user.id);

  res.json({ emails, smtpConfigured: Boolean(process.env.SMTP_HOST) });
});

// ==================== REPORTS & ARCHIVES ====================

adminRoutes.get('/reports', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId!;
  const { dateFrom, dateTo } = req.query;

  let where = 'company_id = ?';
  const params: unknown[] = [companyId];
  if (dateFrom && typeof dateFrom === 'string') {
    where += ' AND substr(received_at, 1, 10) >= ?';
    params.push(dateFrom);
  }
  if (dateTo && typeof dateTo === 'string') {
    where += ' AND substr(received_at, 1, 10) <= ?';
    params.push(dateTo);
  }

  const summary = db
    .prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN direction = 'ENTRANT' THEN 1 ELSE 0 END) as incoming,
        SUM(CASE WHEN direction = 'SORTANT' THEN 1 ELSE 0 END) as outgoing,
        SUM(CASE WHEN direction = 'INTERNE' THEN 1 ELSE 0 END) as internal,
        SUM(CASE WHEN archive_status = 'ARCHIVE' THEN 1 ELSE 0 END) as archived,
        SUM(CASE WHEN mail_status IN ('CLOTURE', 'ARCHIVE', 'VALIDE') THEN 1 ELSE 0 END) as treated,
        SUM(CASE WHEN due_date != '' AND due_date < date('now') AND mail_status NOT IN ('CLOTURE', 'ARCHIVE', 'REJETE', 'CLASSE_SANS_SUITE') THEN 1 ELSE 0 END) as overdue,
        ROUND(AVG(CASE WHEN mail_status IN ('CLOTURE', 'ARCHIVE', 'VALIDE') THEN MAX(0.5, julianday(updated_at) - julianday(received_at)) END), 1) as avgDays
      FROM mails
      WHERE ${where}
    `)
    .get(...params) as Record<string, number>;

  const byPriority = db
    .prepare(`SELECT priority, COUNT(*) as count FROM mails WHERE ${where} GROUP BY priority`)
    .all(...params);

  const byCategory = db
    .prepare(`SELECT category, COUNT(*) as count FROM mails WHERE ${where} GROUP BY category ORDER BY count DESC`)
    .all(...params);

  const byService = db
    .prepare(`
      SELECT COALESCE(s.name, 'Non affecté') as serviceName, COUNT(m.id) as total,
             SUM(CASE WHEN m.mail_status IN ('CLOTURE', 'ARCHIVE', 'VALIDE') THEN 1 ELSE 0 END) as completed,
             SUM(CASE WHEN m.due_date != '' AND m.due_date < date('now') AND m.mail_status NOT IN ('CLOTURE', 'ARCHIVE') THEN 1 ELSE 0 END) as overdue
      FROM mails m
      LEFT JOIN services s ON s.id = m.current_service_id
      WHERE m.${where}
      GROUP BY s.name
      ORDER BY total DESC
    `)
    .all(...params);

  const userActivity = db
    .prepare(`
      SELECT u.full_name, u.role, COUNT(t.id) as totalTasks,
             SUM(CASE WHEN t.status = 'TERMINEE' THEN 1 ELSE 0 END) as completedTasks
      FROM users u
      LEFT JOIN tasks t ON t.assigned_user_id = u.id
      WHERE u.company_id = ? AND u.is_active = 1
      GROUP BY u.id, u.full_name, u.role
      ORDER BY totalTasks DESC
    `)
    .all(companyId);

  res.json({
    summary: {
      total: summary.total || 0,
      incoming: summary.incoming || 0,
      outgoing: summary.outgoing || 0,
      internal: summary.internal || 0,
      archived: summary.archived || 0,
      treatedRate: summary.total ? Math.round(((summary.treated || 0) / summary.total) * 100) : 0,
      overdue: summary.overdue || 0,
      avgDays: summary.avgDays || 1.8,
    },
    byPriority,
    byCategory,
    byService,
    userActivity,
  });
});

adminRoutes.get('/reports/export.csv', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId!;
  const rows = db
    .prepare(`
      SELECT m.reference, m.direction, m.category, m.subject, m.sender_org, m.priority,
             m.mail_status, m.workflow_status, m.shipping_status, m.archive_status,
             s.name as service_name, m.received_at, m.due_date
      FROM mails m
      LEFT JOIN services s ON s.id = m.current_service_id
      WHERE m.company_id = ?
      ORDER BY m.created_at DESC
    `)
    .all(companyId) as Array<Record<string, unknown>>;

  const header = 'Reference;Type;Categorie;Objet;Expediteur;Priorite;Statut Courrier;Statut Workflow;Expedition;Archivage;Service;Date Reception;Echeance\n';
  const lines = rows.map((r) =>
    [
      r.reference,
      r.direction,
      r.category,
      String(r.subject || '').replace(/;/g, ','),
      String(r.sender_org || '').replace(/;/g, ','),
      r.priority,
      r.mail_status,
      r.workflow_status,
      r.shipping_status,
      r.archive_status,
      r.service_name || '',
      r.received_at,
      r.due_date || '',
    ].join(';')
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nexora_rapport_courriers.csv"');
  res.send('\uFEFF' + header + lines.join('\n'));
});

// ==================== SETTINGS, AUDIT & SUBSCRIPTION ====================

adminRoutes.get('/settings', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId!;
  const company = db
    .prepare(`
      SELECT c.*, p.name as plan_name, p.price_monthly_fcfa, p.max_users, p.max_storage_mb, p.max_mails_month
      FROM companies c
      LEFT JOIN subscription_plans p ON p.id = c.plan_id
      WHERE c.id = ?
    `)
    .get(companyId);
  res.json({ company });
});

adminRoutes.patch('/settings', requireAuth, requireCompanyScope, requireRoles('ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const actor = req.user!;
  const companyId = actor.companyId!;
  const {
    legalName,
    tradeName,
    sector,
    country,
    city,
    address,
    phone,
    email,
    website,
    refPrefixIn,
    refPrefixOut,
    refPrefixInt,
    retentionDays,
    stampImage,
  } = req.body ?? {};

  let validStamp: string | null = null;
  try {
    validStamp = validateImageDataUrl(stampImage, 'Le cachet de l’entreprise');
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Format d’image invalide.' });
    return;
  }

  db.prepare(`
    UPDATE companies
    SET legal_name = COALESCE(?, legal_name),
        trade_name = COALESCE(?, trade_name),
        sector = COALESCE(?, sector),
        country = COALESCE(?, country),
        city = COALESCE(?, city),
        address = COALESCE(?, address),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        website = COALESCE(?, website),
        ref_prefix_in = COALESCE(?, ref_prefix_in),
        ref_prefix_out = COALESCE(?, ref_prefix_out),
        ref_prefix_int = COALESCE(?, ref_prefix_int),
        retention_days = COALESCE(?, retention_days),
        stamp_image = COALESCE(?, stamp_image)
    WHERE id = ?
  `).run(
    legalName ?? null,
    tradeName ?? null,
    sector ?? null,
    country ?? null,
    city ?? null,
    address ?? null,
    phone ?? null,
    email ?? null,
    website ?? null,
    refPrefixIn ? String(refPrefixIn).toUpperCase().slice(0, 6) : null,
    refPrefixOut ? String(refPrefixOut).toUpperCase().slice(0, 6) : null,
    refPrefixInt ? String(refPrefixInt).toUpperCase().slice(0, 6) : null,
    retentionDays ?? null,
    validStamp,
    companyId
  );

  logAudit({
    companyId,
    userId: actor.id,
    userName: actor.fullName,
    action: 'MODIFICATION_PARAMETRES',
    entityType: 'COMPANY',
    entityId: companyId,
    newValue: { refPrefixIn, refPrefixOut, refPrefixInt, retentionDays, updatedStamp: validStamp !== null },
  });

  res.json({ ok: true });
});

adminRoutes.get('/subscription/payment-methods', requireAuth, requireCompanyScope, (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    methods: WEST_AFRICA_PAYMENT_METHODS,
    countries: WEST_AFRICA_COUNTRIES,
    gateway: getActiveGatewayConfig(),
  });
});

adminRoutes.get('/subscription/transactions', requireAuth, requireCompanyScope, requireRoles('ADMIN', 'PRESIDENT'), (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId!;
  const transactions = db
    .prepare(`
      SELECT pt.*, sp.name as plan_name
      FROM payment_transactions pt
      LEFT JOIN subscription_plans sp ON sp.id = pt.plan_id
      WHERE pt.company_id = ?
      ORDER BY pt.created_at DESC
      LIMIT 50
    `)
    .all(companyId);
  res.json({ transactions });
});

adminRoutes.post('/subscription/checkout', requireAuth, requireCompanyScope, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  const actor = req.user!;
  const companyId = actor.companyId!;
  const { planId, billingCycle, paymentMethod, countryCode, phoneNumber, cardLast4, cardBrand, cardHolder } = req.body ?? {};

  const validMethods: PaymentMethodCode[] = ['CARD', 'MTN_MOMO', 'MOOV_MONEY', 'WAVE', 'ORANGE_MONEY', 'CELTIIS_CASH'];
  const validCycles: BillingCycle[] = ['MONTHLY', 'ANNUAL'];

  if (!planId || !validMethods.includes(paymentMethod)) {
    res.status(400).json({ error: 'Formule et moyen de paiement valides requis.' });
    return;
  }
  const cycle: BillingCycle = validCycles.includes(billingCycle) ? billingCycle : 'MONTHLY';
  const appBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

  try {
    const result = await initiateSubscriptionCheckout({
      companyId,
      actor,
      planId: String(planId),
      billingCycle: cycle,
      paymentMethod,
      countryCode: String(countryCode || 'BJ').toUpperCase(),
      phoneNumber: phoneNumber ? String(phoneNumber) : undefined,
      cardLast4: cardLast4 ? String(cardLast4) : undefined,
      cardBrand: cardBrand ? String(cardBrand) : undefined,
      cardHolder: cardHolder ? String(cardHolder) : undefined,
      appBaseUrl,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erreur lors de l’initiation du paiement.' });
  }
});

adminRoutes.post('/subscription/confirm', requireAuth, requireCompanyScope, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  const actor = req.user!;
  const companyId = actor.companyId!;
  const { transactionId, otpOrAuthorizationCode } = req.body ?? {};

  if (!transactionId) {
    res.status(400).json({ error: 'Identifiant de transaction requis.' });
    return;
  }

  try {
    const result = await confirmAndVerifyPayment({
      companyId,
      transactionId: String(transactionId),
      actor,
      otpOrAuthorizationCode: otpOrAuthorizationCode ? String(otpOrAuthorizationCode) : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Échec de vérification du paiement.' });
  }
});

adminRoutes.post('/webhooks/payment', async (req: AuthenticatedRequest, res: Response) => {
  const { transactionId, companyId, kkiapayTransactionId } = req.body ?? {};
  if (!transactionId || !companyId) {
    res.status(400).json({ error: 'Paramètres webhook Kkiapay incomplets.' });
    return;
  }
  try {
    const systemActor = {
      id: 'webhook',
      companyId: String(companyId),
      fullName: 'Passerelle Kkiapay',
      jobTitle: 'Webhook',
      email: 'billing@nexora.bj',
      avatarUrl: '',
      role: 'ADMIN' as const,
      permissions: {},
      isSecretariat: false,
      serviceIds: [],
    };
    const tx = db
      .prepare('SELECT provider FROM payment_transactions WHERE id = ? AND company_id = ?')
      .get(String(transactionId), String(companyId)) as { provider: string } | undefined;
    if (!tx || tx.provider !== 'KKIAPAY') {
      res.status(400).json({ error: 'Webhook réservé aux transactions Kkiapay vérifiées.' });
      return;
    }
    const result = await confirmAndVerifyPayment({
      companyId: String(companyId),
      transactionId: String(transactionId),
      actor: systemActor,
      otpOrAuthorizationCode: kkiapayTransactionId ? String(kkiapayTransactionId) : undefined,
    });
    res.json({ ok: true, receiptNumber: result.receiptNumber });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Vérification webhook Kkiapay refusée.' });
  }
});

adminRoutes.post('/subscription/request', requireAuth, requireCompanyScope, requireRoles('ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const actor = req.user!;
  const companyId = actor.companyId!;
  const { planId } = req.body ?? {};
  const plan = db.prepare('SELECT id, name FROM subscription_plans WHERE id = ?').get(String(planId)) as { id: string; name: string } | undefined;
  if (!plan) {
    res.status(404).json({ error: 'Formule introuvable.' });
    return;
  }

  db.prepare('UPDATE companies SET plan_id = ? WHERE id = ?').run(plan.id, companyId);
  logAudit({
    companyId,
    userId: actor.id,
    userName: actor.fullName,
    action: 'DEMANDE_SOUSCRIPTION',
    entityType: 'SUBSCRIPTION',
    entityId: plan.id,
    context: `Formule sélectionnée : ${plan.name}. En attente de règlement par Carte Bancaire ou Mobile Money.`,
  });

  res.json({
    ok: true,
    message: `Formule "${plan.name}" sélectionnée. Finalisez le règlement par Carte Bancaire ou Mobile Money ci-dessous.`,
  });
});

adminRoutes.get('/audit-logs', requireAuth, requireCompanyScope, requireRoles('ADMIN', 'PRESIDENT'), (req: AuthenticatedRequest, res: Response) => {
  const logs = db
    .prepare('SELECT * FROM audit_logs WHERE company_id = ? ORDER BY created_at DESC LIMIT 200')
    .all(req.user!.companyId!);
  res.json({ logs });
});

// ==================== SUPER ADMIN PLATFORM CONSOLE ====================

adminRoutes.get('/superadmin/overview', requireAuth, requireRoles('SUPER_ADMIN'), (_req: AuthenticatedRequest, res: Response) => {
  const companies = db
    .prepare(`
      SELECT c.*, p.name as plan_name, p.price_monthly_fcfa,
             (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) as user_count,
             (SELECT COUNT(*) FROM mails m WHERE m.company_id = c.id) as mail_count
      FROM companies c
      LEFT JOIN subscription_plans p ON p.id = c.plan_id
      ORDER BY c.created_at DESC
    `)
    .all() as Array<Record<string, unknown>>;

  const plans = db.prepare('SELECT * FROM subscription_plans ORDER BY price_monthly_fcfa ASC').all();
  const leads = db.prepare('SELECT * FROM contact_leads ORDER BY created_at DESC LIMIT 50').all();
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();

  const globalStats = {
    totalCompanies: companies.length,
    activeCompanies: companies.filter((c) => c.status === 'active').length,
    trialCompanies: companies.filter((c) => c.status === 'trial').length,
    suspendedCompanies: companies.filter((c) => c.status === 'suspended').length,
    totalUsers: (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c,
    totalMails: (db.prepare('SELECT COUNT(*) as c FROM mails').get() as { c: number }).c,
    totalEmailsLogged: (db.prepare('SELECT COUNT(*) as c FROM email_logs').get() as { c: number }).c,
  };

  res.json({ companies, plans, leads, logs, globalStats });
});

adminRoutes.patch('/superadmin/companies/:id/status', requireAuth, requireRoles('SUPER_ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body ?? {};
  const id = String(req.params.id);
  if (!['trial', 'active', 'suspended'].includes(status)) {
    res.status(400).json({ error: 'Statut entreprise invalide.' });
    return;
  }
  db.prepare('UPDATE companies SET status = ? WHERE id = ?').run(status, id);
  logAudit({
    companyId: id,
    userId: req.user!.id,
    userName: req.user!.fullName,
    action: 'SUPERADMIN_STATUT_ENTREPRISE',
    entityType: 'COMPANY',
    entityId: id,
    newValue: { status },
  });
  res.json({ ok: true });
});

adminRoutes.patch('/superadmin/companies/:id/plan', requireAuth, requireRoles('SUPER_ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const { planId } = req.body ?? {};
  const id = String(req.params.id);
  db.prepare('UPDATE companies SET plan_id = ?, status = CASE WHEN status = "trial" THEN "active" ELSE status END WHERE id = ?').run(String(planId), id);
  res.json({ ok: true });
});

// ==================== PRESIDENTIAL SIGNATURE DELEGATION REGISTRY ====================

// List delegations
adminRoutes.get('/signature-delegations', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;

  let delegations = [];
  if (user.role === 'PRESIDENT') {
    delegations = listDelegations({ companyId, delegatorUserId: user.id });
  } else if (user.role === 'ADMIN') {
    // Admin can view the delegations registry for auditing purposes only, but CANNOT create or alter them
    delegations = listDelegations({ companyId });
  } else {
    // Beneficiary or other user: view delegations assigned to them
    delegations = listDelegations({ companyId, delegateUserId: user.id });
  }

  // Also fetch mails pending under authorized delegations if user is a delegate
  let authorizedPendingMails: Array<Record<string, unknown>> = [];
  if (user.role !== 'PRESIDENT') {
    const activeDel = delegations.filter((d) => d.status === 'ACTIVE');
    if (activeDel.length > 0) {
      const allowedDirs = Array.from(new Set(activeDel.flatMap((d) => d.allowedDirections)));
      const dirPlaceholders = allowedDirs.map(() => '?').join(',');

      if (dirPlaceholders.length > 0) {
        authorizedPendingMails = db
          .prepare(
            `SELECT m.id, m.reference, m.direction, m.category, m.subject, m.priority, m.due_date, m.sender_org,
                    wfs.step_name, wfs.id as step_execution_id
             FROM mails m
             JOIN workflow_instances wfi ON wfi.mail_id = m.id AND wfi.status = 'EN_COURS'
             JOIN workflow_step_executions wfs ON wfs.workflow_instance_id = wfi.id AND wfs.status = 'EN_COURS'
             WHERE m.company_id = ? 
               AND wfs.step_type = 'PRESIDENT_VALIDATION'
               AND m.direction IN (${dirPlaceholders})
             ORDER BY m.received_at DESC`
          )
          .all(companyId, ...allowedDirs) as Array<Record<string, unknown>>;
      }
    }
  }

  res.json({ delegations, authorizedPendingMails });
});

// Create delegation: EXCLUSIVE to PRESIDENT
adminRoutes.post('/signature-delegations', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;

  if (user.role !== 'PRESIDENT') {
    res.status(403).json({
      error: 'Interdiction formelle : Seul le Président en exercice peut déléguer son pouvoir de signature.',
    });
    return;
  }

  const {
    delegateUserId,
    startDate,
    endDate,
    allowedDirections,
    allowedCategories,
    restrictions,
    confirmByPresident,
  } = req.body ?? {};

  if (!confirmByPresident) {
    res.status(400).json({
      error: 'La délégation doit être expressément et explicitement confirmée par le Président.',
    });
    return;
  }

  try {
    const delegation = createDelegation({
      companyId,
      presidentUser: { id: user.id, fullName: user.fullName, role: user.role },
      delegateUserId: String(delegateUserId),
      startDate: String(startDate),
      endDate: String(endDate),
      allowedDirections: Array.isArray(allowedDirections) ? allowedDirections : undefined,
      allowedCategories: Array.isArray(allowedCategories) ? allowedCategories : undefined,
      restrictions: typeof restrictions === 'string' ? restrictions : '',
      confirmByPresident: Boolean(confirmByPresident),
    });

    res.status(201).json({ ok: true, delegation });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erreur lors de la délégation.' });
  }
});

// Revoke delegation: EXCLUSIVE to PRESIDENT
adminRoutes.post('/signature-delegations/:id/revoke', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const delegationId = String(req.params.id);
  const { reason } = req.body ?? {};

  if (user.role !== 'PRESIDENT') {
    res.status(403).json({
      error: 'Interdiction formelle : Seul le Président peut révoquer une délégation de signature présidentielle.',
    });
    return;
  }

  try {
    revokeDelegation({
      companyId,
      presidentUser: { id: user.id, fullName: user.fullName, role: user.role },
      delegationId,
      reason: typeof reason === 'string' ? reason : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erreur lors de la révocation.' });
  }
});

// Suspend delegation: EXCLUSIVE to PRESIDENT
adminRoutes.post('/signature-delegations/:id/suspend', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const delegationId = String(req.params.id);
  const { reason } = req.body ?? {};

  if (user.role !== 'PRESIDENT') {
    res.status(403).json({
      error: 'Interdiction formelle : Seul le Président peut suspendre une délégation de signature.',
    });
    return;
  }

  try {
    suspendDelegation({
      companyId,
      presidentUser: { id: user.id, fullName: user.fullName, role: user.role },
      delegationId,
      reason: typeof reason === 'string' ? reason : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erreur lors de la suspension.' });
  }
});

// Reactivate suspended delegation: EXCLUSIVE to PRESIDENT
adminRoutes.post('/signature-delegations/:id/reactivate', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const delegationId = String(req.params.id);

  if (user.role !== 'PRESIDENT') {
    res.status(403).json({
      error: 'Interdiction formelle : Seul le Président peut réactiver une délégation de signature.',
    });
    return;
  }

  try {
    reactivateDelegation({
      companyId,
      presidentUser: { id: user.id, fullName: user.fullName, role: user.role },
      delegationId,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erreur lors de la réactivation.' });
  }
});
