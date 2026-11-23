import { Router, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { db, UPLOADS_DIR } from '../db/database.ts';
import { hasPermission, requireAuth, requireCompanyScope, type AuthenticatedRequest } from '../middleware/auth.ts';
import { logAudit } from '../services/auditService.ts';
import { analyzeMailDocumentWithGemini, findPotentialDuplicateMails } from '../services/geminiService.ts';
import { createNotification, notifyMailAssignedToUser, notifyServiceSecretariat } from '../services/notificationService.ts';
import {
  applyWorkflowDecision,
  computeMailActionLock,
  startWorkflowForMail,
  type WorkflowDecisionAction,
} from '../services/workflowEngine.ts';
import type { AuthUser, MailDirection } from '../types.ts';
import { newId, safeParseJson } from '../utils/crypto.ts';

export const mailRoutes = Router();

// ---------------------------------------------------------------------------
// AI Analyse du document (Gemini)
// ---------------------------------------------------------------------------
mailRoutes.post('/ai/analyze', requireAuth, requireCompanyScope, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { storedFilename, mimeType } = req.body as { storedFilename?: string; mimeType?: string };

  if (!storedFilename || !mimeType) {
    return res.status(400).json({ error: 'Paramètres manquants : storedFilename et mimeType sont requis.' });
  }

  const filePath = path.join(UPLOADS_DIR, user.companyId!, storedFilename);

  // Récupérer la liste des services de l'entreprise pour le prompt Gemini
  const services = db.prepare('SELECT id, name FROM services WHERE company_id = ?').all(user.companyId) as Array<{ id: string; name: string }>;
  const companyNameRow = db.prepare('SELECT trade_name FROM companies WHERE id = ?').get(user.companyId) as { trade_name: string } | undefined;
  const companyName = companyNameRow?.trade_name || '';

  try {
    const extraction = await analyzeMailDocumentWithGemini({
      filePath,
      mimeType,
      companyServices: services,
      companyName,
    });

    // Créer un ID d'analyse et persister le résultat
    const analysisId = newId('analysis');
    db.prepare(
      `INSERT INTO ai_analyses (id, company_id, status, is_simulated, ocr_text, extracted_json, short_summary, detailed_summary, suggested_category, suggested_priority)
       VALUES (?, ?, 'COMPLETED', 0, ?, ?, ?, ?, ?, ?)`
    ).run(
      analysisId,
      user.companyId,
      extraction.ocrText,
      JSON.stringify(extraction),
      extraction.shortSummary,
      extraction.detailedSummary,
      extraction.category,
      extraction.suggestedPriority
    );

    // Service suggéré (si le nom correspond à un service existé)
    let suggestedServiceId = '';
    if (extraction.suggestedServiceName) {
      const svc = db.prepare('SELECT id FROM services WHERE company_id = ? AND name = ?').get(user.companyId, extraction.suggestedServiceName) as { id: string } | undefined;
      if (svc) suggestedServiceId = svc.id;
    }

    // Circuit suggéré – on prend le premier circuit « ENTRANT » par défaut
    const circ = db.prepare('SELECT id FROM circuits WHERE company_id = ? AND mail_direction = ? ORDER BY id LIMIT 1').get(user.companyId, 'ENTRANT') as { id: string } | undefined;
    const suggestedCircuitId = circ?.id || '';

    // Recherche de doublons potentiels
    const duplicates = findPotentialDuplicateMails({
      companyId: user.companyId || '',
      externalRef: extraction.externalRef,
      senderName: extraction.senderName,
      mailDate: extraction.mailDate,
      subject: extraction.subject,
    });

    return res.json({
      analysisId,
      extraction,
      suggestedServiceId,
      suggestedCircuitId,
      duplicates,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

const uploadStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const authReq = req as AuthenticatedRequest;
    const companyId = authReq.user?.companyId || 'temp';
    const dir = path.join(UPLOADS_DIR, path.basename(companyId));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, `${Date.now()}_${newId('doc')}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format de fichier non autorisé. Utilisez PDF, JPG ou PNG.'));
    }
  },
});

function generateNextReference(companyId: string, direction: MailDirection): string {
  const company = db
    .prepare('SELECT ref_prefix_in, ref_prefix_out, ref_prefix_int FROM companies WHERE id = ?')
    .get(companyId) as { ref_prefix_in: string; ref_prefix_out: string; ref_prefix_int: string };

  const prefix =
    direction === 'ENTRANT'
      ? company.ref_prefix_in || 'ARR'
      : direction === 'SORTANT'
      ? company.ref_prefix_out || 'DEP'
      : company.ref_prefix_int || 'INT';

  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;

  const existing = db
    .prepare('SELECT reference FROM mails WHERE company_id = ? AND reference LIKE ?')
    .all(companyId, pattern) as Array<{ reference: string }>;

  let maxNum = 0;
  for (const row of existing) {
    const parts = row.reference.split('-');
    const last = Number.parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(last) && last > maxNum) maxNum = last;
  }
  const nextNum = String(maxNum + 1).padStart(4, '0');
  return `${prefix}-${year}-${nextNum}`;
}

function canUserAccessMail(user: NonNullable<AuthenticatedRequest['user']>, mail: {
  company_id: string;
  is_confidential: number;
  current_service_id: string | null;
  assigned_agent_id: string | null;
  created_by: string | null;
}): boolean {
  if (mail.company_id !== user.companyId) return false;
  if (user.role === 'ADMIN' || user.role === 'PRESIDENT' || user.isSecretariat || hasPermission(user, 'can_view_all_services')) {
    if (mail.is_confidential === 1 && user.role === 'AGENT' && !hasPermission(user, 'can_view_confidential') && mail.assigned_agent_id !== user.id && mail.created_by !== user.id) {
      return false;
    }
    return true;
  }
  if (mail.assigned_agent_id === user.id || mail.created_by === user.id) return true;
  if (mail.current_service_id && user.serviceIds.includes(mail.current_service_id)) {
    if (mail.is_confidential === 1 && user.role === 'AGENT' && !hasPermission(user, 'can_view_confidential')) {
      return false;
    }
    return true;
  }
  const mailId = (mail as unknown as { id: string }).id;
  // Check if user has any task or workflow step (assigned, decided, or parallel participant) on this mail
  const linkedTask = db
    .prepare('SELECT id FROM tasks WHERE mail_id = ? AND assigned_user_id = ? LIMIT 1')
    .get(mailId, user.id);
  if (linkedTask) return true;

  const linkedStep = db
    .prepare(
      'SELECT id FROM workflow_step_executions WHERE mail_id = ? AND (assigned_user_id = ? OR decided_by = ? OR parallel_approvals_json LIKE ?) LIMIT 1'
    )
    .get(mailId, user.id, user.id, `%${user.id}%`);
  if (linkedStep) return true;

  const wfi = db
    .prepare('SELECT steps_snapshot_json FROM workflow_instances WHERE mail_id = ? LIMIT 1')
    .get(mailId) as { steps_snapshot_json?: string } | undefined;
  if (wfi?.steps_snapshot_json && wfi.steps_snapshot_json.includes(user.id)) {
    return true;
  }

  return false;
}

function loadMailActionContext(user: AuthUser, mailId: string, companyId: string) {
  const mail = db
    .prepare(`
      SELECT m.*, s.name as service_name, u.full_name as assigned_agent_name
      FROM mails m
      LEFT JOIN services s ON s.id = m.current_service_id
      LEFT JOIN users u ON u.id = m.assigned_agent_id
      WHERE m.id = ? AND m.company_id = ?
    `)
    .get(mailId, companyId) as
    | {
        id: string;
        company_id: string;
        reference: string;
        direction: MailDirection;
        subject: string;
        sender_name: string;
        sender_org: string;
        priority: string;
        due_date: string;
        mail_status: string;
        workflow_status: string;
        archive_status: string;
        current_service_id: string | null;
        assigned_agent_id: string | null;
        service_name: string | null;
        assigned_agent_name: string | null;
      }
    | undefined;

  if (!mail) return null;

  const workflowInstance = db
    .prepare('SELECT * FROM workflow_instances WHERE mail_id = ? AND company_id = ?')
    .get(mailId, companyId) as
    | { id: string; steps_snapshot_json: string; current_step_index: number; status: string }
    | undefined;

  const workflowSteps = workflowInstance
    ? (db
        .prepare('SELECT * FROM workflow_step_executions WHERE workflow_instance_id = ? ORDER BY step_order ASC')
        .all(workflowInstance.id) as Array<{
        id: string;
        step_order: number;
        step_name: string;
        step_type: string;
        mode: string;
        status: string;
        assigned_service_id: string | null;
        assigned_user_id: string | null;
        parallel_approvals_json: string;
      }>)
    : [];

  const lock = computeMailActionLock({
    user,
    mail,
    workflowInstance,
    allSteps: workflowSteps,
  });

  return { mail, workflowInstance, workflowSteps, lock };
}

// List & Search Mails
mailRoutes.get('/mails', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const { q, direction, priority, status, serviceId, filter, dateFrom, dateTo } = req.query;

  let sql = `
    SELECT m.*,
           s.name as service_name,
           u.full_name as assigned_agent_name,
           c.name as circuit_name,
           (SELECT short_summary FROM ai_analyses WHERE mail_id = m.id ORDER BY created_at DESC LIMIT 1) as ai_short_summary,
           (SELECT is_simulated FROM ai_analyses WHERE mail_id = m.id ORDER BY created_at DESC LIMIT 1) as ai_is_simulated
    FROM mails m
    LEFT JOIN services s ON s.id = m.current_service_id
    LEFT JOIN users u ON u.id = m.assigned_agent_id
    LEFT JOIN circuits c ON c.id = m.circuit_id
    WHERE m.company_id = ?
  `;
  const params: unknown[] = [companyId];

  if (direction && typeof direction === 'string' && direction !== 'ALL') {
    sql += ' AND m.direction = ?';
    params.push(direction);
  }
  if (priority && typeof priority === 'string' && priority !== 'ALL') {
    sql += ' AND m.priority = ?';
    params.push(priority);
  }
  if (status && typeof status === 'string' && status !== 'ALL') {
    sql += ' AND m.mail_status = ?';
    params.push(status);
  }
  if (serviceId && typeof serviceId === 'string' && serviceId !== 'ALL') {
    sql += ' AND m.current_service_id = ?';
    params.push(serviceId);
  }
  if (dateFrom && typeof dateFrom === 'string') {
    sql += ' AND substr(m.received_at, 1, 10) >= ?';
    params.push(dateFrom);
  }
  if (dateTo && typeof dateTo === 'string') {
    sql += ' AND substr(m.received_at, 1, 10) <= ?';
    params.push(dateTo);
  }

  if (filter === 'urgent') {
    sql += " AND m.priority IN ('URGENTE', 'HAUTE') AND m.archive_status != 'ARCHIVE'";
  } else if (filter === 'overdue') {
    sql += " AND m.due_date != '' AND m.due_date < date('now') AND m.mail_status NOT IN ('CLOTURE', 'ARCHIVE', 'REJETE', 'CLASSE_SANS_SUITE')";
  } else if (filter === 'archived') {
    sql += " AND m.archive_status = 'ARCHIVE'";
  } else if (filter === 'waiting') {
    sql += " AND m.mail_status IN ('RECU', 'ENREGISTRE', 'EN_ATTENTE_CORRECTION', 'RETOUR_SECRETARIAT')";
  }

  if (q && typeof q === 'string' && q.trim()) {
    const term = `%${q.trim()}%`;
    sql += `
      AND (
        m.reference LIKE ? OR m.subject LIKE ? OR m.sender_name LIKE ? OR m.sender_org LIKE ?
        OR m.recipient_name LIKE ? OR m.external_ref LIKE ? OR m.category LIKE ?
        OR EXISTS (SELECT 1 FROM ai_analyses a WHERE a.mail_id = m.id AND a.ocr_text LIKE ?)
      )
    `;
    params.push(term, term, term, term, term, term, term, term);
  }

  sql += ' ORDER BY m.created_at DESC LIMIT 200';

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const filtered = rows.filter((row) =>
    canUserAccessMail(user, row as unknown as {
      id: string;
      company_id: string;
      is_confidential: number;
      current_service_id: string | null;
      assigned_agent_id: string | null;
      created_by: string | null;
    })
  );

  res.json({ mails: filtered });
});

// Upload file for preview & AI analysis (before or during mail creation)
mailRoutes.post(
  '/mails/upload-file',
  requireAuth,
  requireCompanyScope,
  upload.single('file'),
  (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Aucun fichier valide reçu.' });
      return;
    }

    const tempDocId = newId('tmp');
    res.status(201).json({
      fileId: tempDocId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      storedFilename: req.file.filename,
    });
  }
);

// Preview temporary uploaded file before official mail registration
mailRoutes.get('/mails/temp-file/:storedFilename', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId!;
  const safeName = path.basename(String(req.params.storedFilename));
  const companyDir = path.resolve(UPLOADS_DIR, path.basename(companyId));
  const target = path.resolve(companyDir, safeName);
  if (!target.startsWith(companyDir + path.sep) || !fs.existsSync(target)) {
    res.status(404).json({ error: 'Fichier introuvable.' });
    return;
  }
  res.sendFile(target);
});

// Analyze uploaded file with Gemini AI (OCR + Structured Extraction + Summaries + Duplicate Check)
mailRoutes.post('/ai/analyze', requireAuth, requireCompanyScope, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const { storedFilename, mimeType, mailId } = req.body ?? {};

  if (!storedFilename || !mimeType) {
    res.status(400).json({ error: 'Fichier et type MIME requis pour l’analyse IA.' });
    return;
  }

  // If mailId exists and already has validated corrections, never overwrite silently
  if (mailId) {
    const validated = db
      .prepare('SELECT id, validated_by FROM ai_analyses WHERE mail_id = ? AND company_id = ? AND validated_by IS NOT NULL LIMIT 1')
      .get(String(mailId), companyId) as { id: string; validated_by: string } | undefined;
    if (validated && !req.body.confirmReanalyze) {
      res.status(409).json({
        error: 'Ce courrier dispose déjà d’informations validées manuellement. Confirmez la ré-analyse pour conserver une nouvelle trace sans écraser les corrections.',
      });
      return;
    }
  }

  const companyDir = path.resolve(UPLOADS_DIR, path.basename(companyId));
  const filePath = path.resolve(companyDir, path.basename(String(storedFilename)));
  if (!filePath.startsWith(companyDir + path.sep) || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Fichier téléversé introuvable sur le serveur.' });
    return;
  }

  const company = db.prepare('SELECT trade_name FROM companies WHERE id = ?').get(companyId) as { trade_name: string };
  const services = db.prepare('SELECT id, name FROM services WHERE company_id = ?').all(companyId) as Array<{ id: string; name: string }>;
  const circuits = db.prepare('SELECT id, name, category, mail_direction FROM circuits WHERE company_id = ? AND is_active = 1').all(companyId) as Array<{
    id: string;
    name: string;
    category: string;
    mail_direction: string;
  }>;

  try {
    const extraction = await analyzeMailDocumentWithGemini({
      filePath,
      mimeType: String(mimeType),
      companyServices: services,
      companyName: company.trade_name,
    });

    const matchedService = services.find(
      (s) => s.name.toLowerCase() === extraction.suggestedServiceName.toLowerCase()
    ) || services.find((s) => extraction.suggestedServiceName.toLowerCase().includes(s.name.toLowerCase()));

    const matchedCircuit = circuits.find(
      (c) =>
        c.mail_direction === 'ENTRANT' &&
        (c.category.toLowerCase().includes(extraction.category.toLowerCase()) ||
          extraction.category.toLowerCase().includes(c.category.toLowerCase()))
    ) || circuits.find((c) => c.mail_direction === 'ENTRANT');

    const duplicates = findPotentialDuplicateMails({
      companyId,
      externalRef: extraction.externalRef,
      senderName: extraction.senderName,
      mailDate: extraction.mailDate,
      subject: extraction.subject,
      excludeMailId: mailId ? String(mailId) : undefined,
    });

    const analysisId = newId('ai');
    db.prepare(`
      INSERT INTO ai_analyses (
        id, mail_id, company_id, status, is_simulated, ocr_text, extracted_json,
        short_summary, detailed_summary, suggested_category, suggested_priority,
        suggested_service_id, suggested_circuit_id, uncertain_fields_json, analyzed_by
      ) VALUES (?, ?, ?, 'COMPLETED', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      analysisId,
      mailId ? String(mailId) : null,
      companyId,
      extraction.ocrText,
      JSON.stringify(extraction),
      extraction.shortSummary,
      extraction.detailedSummary,
      extraction.category,
      extraction.suggestedPriority,
      matchedService?.id || '',
      matchedCircuit?.id || '',
      JSON.stringify(extraction.uncertainFields),
      user.id
    );

    logAudit({
      companyId,
      userId: user.id,
      userName: user.fullName,
      action: 'ANALYSE_IA_DOCUMENT',
      entityType: 'AI_ANALYSIS',
      entityId: analysisId,
      newValue: { filename: storedFilename, subject: extraction.subject, duplicatesCount: duplicates.length },
      context: 'Analyse OCR et extraction IA exécutée via Gemini.',
    });

    res.json({
      analysisId,
      isSimulated: false,
      extraction,
      suggestedServiceId: matchedService?.id || '',
      suggestedCircuitId: matchedCircuit?.id || '',
      duplicates,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur lors de l’analyse IA.';
    const failedId = newId('ai');
    db.prepare(`
      INSERT INTO ai_analyses (id, mail_id, company_id, status, is_simulated, ocr_text, short_summary, analyzed_by)
      VALUES (?, ?, ?, 'FAILED', 0, '', ?, ?)
    `).run(failedId, mailId ? String(mailId) : null, companyId, message, user.id);

    res.status(422).json({
      error: message,
      canContinueManually: true,
      analysisId: failedId,
    });
  }
});

// Check duplicates manually during registration
mailRoutes.post('/mails/check-duplicates', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId!;
  const { externalRef, senderName, mailDate, subject } = req.body ?? {};
  const duplicates = findPotentialDuplicateMails({ companyId, externalRef, senderName, mailDate, subject });
  res.json({ duplicates });
});

// Create / Officially Register a Mail (Manual or Human-Validated AI Extraction)
mailRoutes.post('/mails', requireAuth, requireCompanyScope, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const body = req.body ?? {};

  const direction: MailDirection = ['ENTRANT', 'SORTANT', 'INTERNE'].includes(body.direction)
    ? body.direction
    : 'ENTRANT';

  if (!body.subject || !String(body.subject).trim()) {
    res.status(400).json({ error: 'L’objet du courrier est obligatoire.' });
    return;
  }

  const mailId = newId('mail');
  const reference = generateNextReference(companyId, direction);
  const priority = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'].includes(body.priority) ? body.priority : 'NORMALE';
  const secService = db.prepare('SELECT id FROM services WHERE company_id = ? AND is_secretariat = 1 LIMIT 1').get(companyId) as
    | { id: string }
    | undefined;

  const currentServiceId = body.currentServiceId || secService?.id || null;
  const assignedAgentId = body.assignedAgentId || null;

  db.transaction(() => {
    db.prepare(`
      INSERT INTO mails (
        id, company_id, reference, direction, category, subject, description,
        sender_name, sender_org, recipient_name, recipient_org, external_ref,
        mail_date, due_date, priority, is_confidential, requires_response,
        current_service_id, assigned_agent_id, mail_status, workflow_status,
        shipping_status, archive_status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ENREGISTRE', 'NON_DEMARRE', ?, 'NON_ARCHIVE', ?)
    `).run(
      mailId,
      companyId,
      reference,
      direction,
      String(body.category || 'Administration générale').trim(),
      String(body.subject).trim(),
      String(body.description || '').trim(),
      String(body.senderName || '').trim(),
      String(body.senderOrg || '').trim(),
      String(body.recipientName || '').trim(),
      String(body.recipientOrg || '').trim(),
      String(body.externalRef || '').trim(),
      String(body.mailDate || new Date().toISOString().slice(0, 10)).trim(),
      String(body.dueDate || '').trim(),
      priority,
      body.isConfidential ? 1 : 0,
      body.requiresResponse ? 1 : 0,
      currentServiceId,
      assignedAgentId,
      direction === 'SORTANT' ? 'A_EXPEDIER' : 'NON_APPLICABLE',
      user.id
    );

    // Attach uploaded original file if present
    if (body.uploadedFile?.storedFilename) {
      const companyDir = path.resolve(UPLOADS_DIR, path.basename(companyId));
      const fullPath = path.resolve(companyDir, path.basename(String(body.uploadedFile.storedFilename)));
      if (fullPath.startsWith(companyDir + path.sep) && fs.existsSync(fullPath)) {
        const docId = newId('doc');
        db.prepare(`
          INSERT INTO mail_documents (id, mail_id, company_id, doc_kind, filename, mime_type, size_bytes, storage_path, version, uploaded_by)
          VALUES (?, ?, ?, 'ORIGINAL', ?, ?, ?, ?, 1, ?)
        `).run(
          docId,
          mailId,
          companyId,
          String(body.uploadedFile.filename || 'document_original'),
          String(body.uploadedFile.mimeType || 'application/pdf'),
          Number(body.uploadedFile.sizeBytes || 0),
          fullPath,
          user.id
        );

        if (body.analysisId) {
          db.prepare(`
            UPDATE ai_analyses
            SET mail_id = ?, document_id = ?, human_corrections_json = ?, validated_by = ?, validated_at = datetime('now')
            WHERE id = ? AND company_id = ?
          `).run(
            mailId,
            docId,
            JSON.stringify(body.humanCorrections || {}),
            user.id,
            String(body.analysisId),
            companyId
          );
        }
      }
    }
  })();

  let departmentEmailsTriggered = 0;

  // Start circuit workflow if selected
  if (body.circuitId) {
    await startWorkflowForMail({
      companyId,
      mailId,
      circuitId: String(body.circuitId),
      actor: user,
      targetServiceId: currentServiceId,
      assignedAgentId,
    });
  }
  if (assignedAgentId) {
    // Whenever an Agent is assigned a mail, immediately notify their department head by email!
    const createdMail = db.prepare('SELECT * FROM mails WHERE id = ?').get(mailId) as {
      id: string;
      reference: string;
      direction: string;
      subject: string;
      sender_name: string;
      sender_org: string;
      priority: string;
      due_date: string;
    };
    departmentEmailsTriggered = await notifyMailAssignedToUser({
      companyId,
      mail: createdMail,
      targetUserId: String(assignedAgentId),
      serviceId: currentServiceId,
      assignedByName: user.fullName,
    });
  }

  logAudit({
    companyId,
    userId: user.id,
    userName: user.fullName,
    action: 'ENREGISTREMENT_COURRIER',
    entityType: 'MAIL',
    entityId: mailId,
    newValue: { reference, direction, subject: body.subject, priority },
    context: body.analysisId ? 'Enregistrement officiel après vérification humaine de l’analyse IA.' : 'Enregistrement manuel.',
  });

  res.status(201).json({
    id: mailId,
    reference,
    departmentEmailsTriggered,
  });
});

// Get full mail detail
mailRoutes.get('/mails/:id', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const mailId = String(req.params.id);

  const mail = db
    .prepare(`
      SELECT m.*,
             s.name as service_name,
             u.full_name as assigned_agent_name,
             u.email as assigned_agent_email,
             cu.full_name as created_by_name,
             c.name as circuit_name
      FROM mails m
      LEFT JOIN services s ON s.id = m.current_service_id
      LEFT JOIN users u ON u.id = m.assigned_agent_id
      LEFT JOIN users cu ON cu.id = m.created_by
      LEFT JOIN circuits c ON c.id = m.circuit_id
      WHERE m.id = ? AND m.company_id = ?
    `)
    .get(mailId, companyId) as Record<string, unknown> | undefined;

  if (!mail) {
    res.status(404).json({ error: 'Courrier introuvable.' });
    return;
  }

  if (!canUserAccessMail(user, mail as unknown as {
    id: string;
    company_id: string;
    is_confidential: number;
    current_service_id: string | null;
    assigned_agent_id: string | null;
    created_by: string | null;
  })) {
    res.status(403).json({ error: 'Vous n’avez pas la permission de consulter ce courrier.' });
    return;
  }

  const documents = db
    .prepare(`
      SELECT d.*, u.full_name as uploaded_by_name
      FROM mail_documents d
      LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.mail_id = ? AND d.company_id = ?
      ORDER BY d.created_at DESC
    `)
    .all(mailId, companyId);

  const aiAnalysesRows = db
    .prepare(`
      SELECT a.*, u.full_name as validated_by_name
      FROM ai_analyses a
      LEFT JOIN users u ON u.id = a.validated_by
      WHERE a.mail_id = ? AND a.company_id = ?
      ORDER BY a.created_at DESC
    `)
    .all(mailId, companyId) as Array<Record<string, unknown>>;

  const aiAnalyses = aiAnalysesRows.map((a) => ({
    ...a,
    extracted: safeParseJson(String(a.extracted_json), {}),
    uncertainFields: safeParseJson(String(a.uncertain_fields_json), []),
    humanCorrections: safeParseJson(String(a.human_corrections_json), {}),
  }));

  const workflowInstance = db
    .prepare('SELECT * FROM workflow_instances WHERE mail_id = ? AND company_id = ?')
    .get(mailId, companyId) as Record<string, unknown> | undefined;

  const workflowSteps = workflowInstance
    ? db
        .prepare(`
          SELECT w.*, s.name as service_name, u.full_name as assigned_user_name, du.full_name as decided_by_name
          FROM workflow_step_executions w
          LEFT JOIN services s ON s.id = w.assigned_service_id
          LEFT JOIN users u ON u.id = w.assigned_user_id
          LEFT JOIN users du ON du.id = w.decided_by
          WHERE w.workflow_instance_id = ?
          ORDER BY w.step_order ASC
        `)
        .all(String(workflowInstance.id))
    : [];

  const tasks = db
    .prepare(`
      SELECT t.*, u.full_name as assigned_user_name, s.name as service_name
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_user_id
      LEFT JOIN services s ON s.id = t.assigned_service_id
      WHERE t.mail_id = ? AND t.company_id = ?
      ORDER BY t.created_at DESC
    `)
    .all(mailId, companyId);

  const comments = db
    .prepare(`
      SELECT c.*, u.full_name as user_name, u.role as user_role
      FROM mail_comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.mail_id = ? AND c.company_id = ?
      ORDER BY c.created_at ASC
    `)
    .all(mailId, companyId);

  const shipments = db
    .prepare(`
      SELECT sh.*, u.full_name as dispatched_by_name
      FROM shipments sh
      LEFT JOIN users u ON u.id = sh.dispatched_by
      WHERE sh.mail_id = ? AND sh.company_id = ?
      ORDER BY sh.dispatched_at DESC
    `)
    .all(mailId, companyId);

  const emailLogs = db
    .prepare(`
      SELECT id, recipient_email, recipient_name, department_name, trigger_event, subject, delivery_status, created_at
      FROM email_logs
      WHERE mail_id = ? AND company_id = ?
      ORDER BY created_at DESC
    `)
    .all(mailId, companyId);

  const auditLogs = db
    .prepare(`
      SELECT * FROM audit_logs
      WHERE company_id = ? AND entity_id = ?
      ORDER BY created_at DESC
    `)
    .all(companyId, mailId);

  const signatures = db
    .prepare(`
      SELECT ms.*, u.avatar_url as signer_avatar_url
      FROM mail_signatures ms
      LEFT JOIN users u ON u.id = ms.signer_user_id
      WHERE ms.mail_id = ? AND ms.company_id = ?
      ORDER BY ms.signed_at DESC
    `)
    .all(mailId, companyId);

  const userAssetsRow = db
    .prepare('SELECT signature_image, stamp_image FROM users WHERE id = ?')
    .get(user.id) as { signature_image?: string; stamp_image?: string } | undefined;
  const companyStampRow = db
    .prepare('SELECT stamp_image FROM companies WHERE id = ?')
    .get(companyId) as { stamp_image?: string } | undefined;

  const actionLock = computeMailActionLock({
    user,
    mail: mail as unknown as {
      id: string;
      company_id: string;
      mail_status: string;
      archive_status: string;
      current_service_id: string | null;
      assigned_agent_id: string | null;
      service_name?: string | null;
      assigned_agent_name?: string | null;
    },
    workflowInstance: workflowInstance as
      | { id: string; steps_snapshot_json: string; current_step_index: number; status: string }
      | undefined,
    allSteps: workflowSteps as Array<{
      id: string;
      step_order: number;
      step_name: string;
      step_type: string;
      mode: string;
      status: string;
      assigned_service_id: string | null;
      assigned_user_id: string | null;
      parallel_approvals_json: string;
    }>,
  });

  res.json({
    mail,
    documents,
    aiAnalyses,
    workflowInstance,
    workflowSteps,
    tasks,
    comments,
    shipments,
    emailLogs,
    auditLogs,
    signatures,
    actionLock,
    currentUserSignAssets: {
      signatureImage: userAssetsRow?.signature_image || '',
      stampImage: userAssetsRow?.stamp_image || '',
      companyStampImage: companyStampRow?.stamp_image || '',
    },
  });
});

// Stream protected document
mailRoutes.get('/documents/:docId/file', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const doc = db
    .prepare('SELECT * FROM mail_documents WHERE id = ? AND company_id = ?')
    .get(String(req.params.docId), companyId) as
    | { id: string; mail_id: string; filename: string; mime_type: string; storage_path: string }
    | undefined;

  if (!doc) {
    res.status(404).json({ error: 'Document introuvable.' });
    return;
  }

  const mail = db.prepare('SELECT * FROM mails WHERE id = ? AND company_id = ?').get(doc.mail_id, companyId) as {
    id: string;
    company_id: string;
    is_confidential: number;
    current_service_id: string | null;
    assigned_agent_id: string | null;
    created_by: string | null;
  };

  if (!mail || !canUserAccessMail(user, mail)) {
    res.status(403).json({ error: 'Accès refusé à ce document.' });
    return;
  }

  const resolved = path.resolve(doc.storage_path);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(resolved)) {
    res.status(404).json({ error: 'Fichier physique introuvable.' });
    return;
  }

  res.setHeader('Content-Type', doc.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.filename)}"`);
  res.sendFile(resolved);
});

// Save or update draft document text / response for processing
mailRoutes.patch('/mails/:id/draft', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const mailId = String(req.params.id);
  const { draftHtml, draftText } = req.body ?? {};

  const ctx = loadMailActionContext(user, mailId, companyId);
  if (!ctx) {
    res.status(404).json({ error: 'Courrier introuvable.' });
    return;
  }

  if (!ctx.lock.canAct) {
    res.status(403).json({ error: ctx.lock.lockReason || 'Ce dossier est verrouillé.' });
    return;
  }

  db.prepare(`
    UPDATE mails
    SET draft_response_html = ?,
        draft_response_text = ?,
        draft_response_updated_by = ?,
        draft_response_updated_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ? AND company_id = ?
  `).run(String(draftHtml || ''), String(draftText || ''), user.fullName, mailId, companyId);

  logAudit({
    companyId,
    userId: user.id,
    userName: user.fullName,
    action: 'EDITION_DOCUMENT_PROJET',
    entityType: 'MAIL',
    entityId: mailId,
    context: `Document de travail / projet édité par ${user.fullName} (${user.jobTitle})`,
  });

  res.json({ ok: true, updatedAt: new Date().toISOString() });
});

// Upload additional document (pj, draft response, final response, proof)
mailRoutes.post(
  '/mails/:id/documents',
  requireAuth,
  requireCompanyScope,
  upload.single('file'),
  (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const companyId = user.companyId!;
    const mailId = String(req.params.id);
    if (!req.file) {
      res.status(400).json({ error: 'Fichier requis.' });
      return;
    }

    const ctx = loadMailActionContext(user, mailId, companyId);
    if (!ctx) {
      res.status(404).json({ error: 'Courrier introuvable.' });
      return;
    }
    if (!ctx.lock.canAct || !ctx.lock.canUploadDocument) {
      res.status(403).json({
        error: ctx.lock.lockReason || 'Vous ne pouvez plus ajouter de document à ce courrier.',
      });
      return;
    }

    const docKind = ['ORIGINAL', 'PIECE_JOINTE', 'PROJET_REPONSE', 'REPONSE_DEFINITIVE', 'VALIDATION', 'PREUVE_EXPEDITION', 'JUSTIFICATIF'].includes(
      String(req.body.docKind)
    )
      ? String(req.body.docKind)
      : 'PIECE_JOINTE';

    const maxVer = (
      db
        .prepare('SELECT COALESCE(MAX(version), 0) as v FROM mail_documents WHERE mail_id = ? AND doc_kind = ?')
        .get(mailId, docKind) as { v: number }
    ).v;

    const docId = newId('doc');
    db.prepare(`
      INSERT INTO mail_documents (id, mail_id, company_id, doc_kind, filename, mime_type, size_bytes, storage_path, version, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(docId, mailId, companyId, docKind, req.file.originalname, req.file.mimetype, req.file.size, req.file.path, maxVer + 1, user.id);

    logAudit({
      companyId,
      userId: user.id,
      userName: user.fullName,
      action: 'AJOUT_DOCUMENT',
      entityType: 'MAIL',
      entityId: mailId,
      newValue: { filename: req.file.originalname, docKind, version: maxVer + 1 },
    });

    res.status(201).json({ id: docId, version: maxVer + 1 });
  }
);

// Orient a mail (Secrétariat / Admin)
mailRoutes.post('/mails/:id/orient', requireAuth, requireCompanyScope, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const mailId = String(req.params.id);
  const { serviceId, circuitId, assignedAgentId, observations } = req.body ?? {};

  const ctx = loadMailActionContext(user, mailId, companyId);
  if (!ctx) {
    res.status(404).json({ error: 'Courrier introuvable.' });
    return;
  }
  if (!ctx.lock.canAct || !ctx.lock.canOrient) {
    res.status(403).json({
      error: ctx.lock.lockReason || 'Orientation verrouillée : ce courrier n’est plus à votre niveau.',
    });
    return;
  }
  const mail = ctx.mail;

  db.prepare(`
    UPDATE mails
    SET current_service_id = COALESCE(?, current_service_id),
        assigned_agent_id = COALESCE(?, assigned_agent_id),
        updated_at = datetime('now')
    WHERE id = ? AND company_id = ?
  `).run(serviceId || null, assignedAgentId || null, mailId, companyId);

  let emailsTriggered = 0;
  const existingWfi = db.prepare('SELECT id FROM workflow_instances WHERE mail_id = ?').get(mailId);

  if (circuitId && !existingWfi) {
    await startWorkflowForMail({
      companyId,
      mailId,
      circuitId: String(circuitId),
      actor: user,
      targetServiceId: serviceId || null,
      assignedAgentId: assignedAgentId || null,
    });
  } else if (existingWfi) {
    const result = await applyWorkflowDecision({
      companyId,
      mailId,
      actor: user,
      decision: 'TRANSMETTRE',
      observations: observations || 'Orientation effectuée par le Secrétariat.',
      targetServiceId: serviceId || null,
      targetAgentId: assignedAgentId || null,
    });
    emailsTriggered += result.departmentEmailsTriggered;
  }

  if (assignedAgentId && !existingWfi) {
    emailsTriggered += await notifyMailAssignedToUser({
      companyId,
      mail,
      targetUserId: String(assignedAgentId),
      serviceId: serviceId || null,
      assignedByName: user.fullName,
    });
  } else if (serviceId && !assignedAgentId) {
    const svc = db.prepare('SELECT manager_user_id FROM services WHERE id = ? AND company_id = ?').get(serviceId, companyId) as
      | { manager_user_id: string | null }
      | undefined;
    if (svc?.manager_user_id) {
      createNotification({
        companyId,
        userId: svc.manager_user_id,
        mailId,
        eventType: 'ORIENTATION_SERVICE',
        title: `Courrier orienté — ${mail.reference}`,
        message: `Le courrier "${mail.subject}" a été orienté vers votre service par ${user.fullName}.`,
      });
    }
  }

  logAudit({
    companyId,
    userId: user.id,
    userName: user.fullName,
    action: 'ORIENTATION_COURRIER',
    entityType: 'MAIL',
    entityId: mailId,
    newValue: { serviceId, circuitId, assignedAgentId },
    context: observations || '',
  });

  res.json({ ok: true, departmentEmailsTriggered: emailsTriggered });
});

// Assign mail to an Agent (Responsable / Admin / Secretariat) -> AUTOMATICALLY EMAILS DEPARTMENT HEAD!
mailRoutes.post('/mails/:id/assign-agent', requireAuth, requireCompanyScope, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const mailId = String(req.params.id);
  const { agentId, serviceId, dueDate, instructions } = req.body ?? {};

  if (!agentId) {
    res.status(400).json({ error: 'Veuillez sélectionner un agent destinataire.' });
    return;
  }

  const ctx = loadMailActionContext(user, mailId, companyId);
  if (!ctx) {
    res.status(404).json({ error: 'Courrier introuvable.' });
    return;
  }
  if (!ctx.lock.canAct || !ctx.lock.canAssignAgent) {
    res.status(403).json({
      error: ctx.lock.lockReason || 'Vous ne pouvez plus affecter ou modifier ce courrier.',
    });
    return;
  }
  const mail = ctx.mail;

  const targetAgent = db
    .prepare('SELECT id, full_name, email, role FROM users WHERE id = ? AND company_id = ? AND is_active = 1')
    .get(String(agentId), companyId) as { id: string; full_name: string; email: string; role: string } | undefined;
  if (!targetAgent) {
    res.status(404).json({ error: 'Agent introuvable dans cette entreprise.' });
    return;
  }

  const agentPrimarySvc = db
    .prepare('SELECT service_id FROM user_services WHERE user_id = ? AND company_id = ? LIMIT 1')
    .get(targetAgent.id, companyId) as { service_id: string } | undefined;
  const effectiveServiceId = serviceId || agentPrimarySvc?.service_id || mail.current_service_id;

  db.prepare(`
    UPDATE mails
    SET assigned_agent_id = ?,
        current_service_id = COALESCE(?, current_service_id),
        due_date = COALESCE(NULLIF(?, ''), due_date),
        mail_status = CASE WHEN mail_status = 'ENREGISTRE' THEN 'EN_CIRCUIT' ELSE mail_status END,
        updated_at = datetime('now')
    WHERE id = ? AND company_id = ?
  `).run(targetAgent.id, effectiveServiceId, dueDate || '', mailId, companyId);

  // Create task for agent
  const taskId = newId('tsk');
  db.prepare(`
    INSERT INTO tasks (id, mail_id, company_id, title, description, assigned_user_id, assigned_service_id, priority, status, due_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'A_TRAITER', ?, ?)
  `).run(
    taskId,
    mailId,
    companyId,
    `${mail.reference} — Traitement affecté`,
    instructions || `Traitement du courrier "${mail.subject}"`,
    targetAgent.id,
    effectiveServiceId,
    mail.priority,
    dueDate || mail.due_date || '',
    user.id
  );

  // Advance workflow step if currently on RESPONSABLE_ASSIGN
  const activeStep = db
    .prepare(`
      SELECT id, step_type FROM workflow_step_executions
      WHERE mail_id = ? AND company_id = ? AND status = 'EN_COURS'
      LIMIT 1
    `)
    .get(mailId, companyId) as { id: string; step_type: string } | undefined;

  if (activeStep?.step_type === 'RESPONSABLE_ASSIGN') {
    await applyWorkflowDecision({
      companyId,
      mailId,
      actor: user,
      decision: 'TRANSMETTRE',
      observations: instructions || `Affecté à l’agent ${targetAgent.full_name}`,
      targetServiceId: effectiveServiceId,
      targetAgentId: targetAgent.id,
    });
  }

  // Trigger Department Head email notification!
  const departmentEmailsTriggered = await notifyMailAssignedToUser({
    companyId,
    mail: { ...mail, due_date: dueDate || mail.due_date },
    targetUserId: targetAgent.id,
    serviceId: effectiveServiceId,
    taskId,
    assignedByName: user.fullName,
  });

  logAudit({
    companyId,
    userId: user.id,
    userName: user.fullName,
    action: 'AFFECTATION_AGENT',
    entityType: 'MAIL',
    entityId: mailId,
    newValue: { agent: targetAgent.full_name, departmentEmailsTriggered },
    context: instructions || `Courrier affecté à ${targetAgent.full_name}`,
  });

  res.json({ ok: true, taskId, departmentEmailsTriggered });
});

// Workflow decision endpoint
mailRoutes.post('/mails/:id/decision', requireAuth, requireCompanyScope, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const mailId = String(req.params.id);
  const { decision, motif, observations, targetServiceId, targetAgentId, signatureImage, stampImage } = req.body ?? {};

  const allowedDecisions: WorkflowDecisionAction[] = [
    'APPROUVER',
    'TRANSMETTRE',
    'REJETER',
    'DEMANDER_CORRECTION',
    'REORIENTER',
    'SUSPENDRE',
    'REPRENDRE',
    'CLASSER_SANS_SUITE',
  ];

  if (!allowedDecisions.includes(decision)) {
    res.status(400).json({ error: 'Décision de workflow invalide.' });
    return;
  }

  try {
    const result = await applyWorkflowDecision({
      companyId,
      mailId,
      actor: user,
      decision,
      motif,
      observations,
      targetServiceId,
      targetAgentId,
      signatureImage: typeof signatureImage === 'string' ? signatureImage : undefined,
      stampImage: typeof stampImage === 'string' ? stampImage : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(403).json({ error: err instanceof Error ? err.message : 'Erreur lors du traitement du workflow.' });
  }
});

// Complete direct treatment for mails assigned to an agent without an active workflow circuit
mailRoutes.post('/mails/:id/complete-direct', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const mailId = String(req.params.id);
  const { observations } = req.body ?? {};

  const ctx = loadMailActionContext(user, mailId, companyId);
  if (!ctx) {
    res.status(404).json({ error: 'Courrier introuvable.' });
    return;
  }
  if (!ctx.lock.canAct || !ctx.lock.allowedActions.includes('COMPLETE_DIRECT_TREATMENT')) {
    res.status(403).json({ error: ctx.lock.lockReason || 'Action non autorisée sur ce courrier.' });
    return;
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE mails
      SET mail_status = 'RETOUR_SECRETARIAT', updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(mailId, companyId);

    db.prepare(`
      UPDATE tasks
      SET status = 'TERMINEE', updated_at = datetime('now')
      WHERE mail_id = ? AND company_id = ? AND assigned_user_id = ? AND status NOT IN ('TERMINEE', 'ANNULEE')
    `).run(mailId, companyId, user.id);

    if (observations && String(observations).trim()) {
      db.prepare(`
        INSERT INTO mail_comments (id, mail_id, company_id, user_id, comment_type, content)
        VALUES (?, ?, ?, ?, 'OBSERVATION', ?)
      `).run(newId('cmt'), mailId, companyId, user.id, String(observations).trim());
    }
  })();

  notifyServiceSecretariat({
    companyId,
    mailId,
    eventType: 'RETOUR_SECRETARIAT',
    title: `Retour Secrétariat — ${ctx.mail.reference}`,
    message: `${user.fullName} a terminé le traitement direct du courrier ${ctx.mail.reference}.`,
  });

  logAudit({
    companyId,
    userId: user.id,
    userName: user.fullName,
    action: 'RETOUR_TRAITEMENT_DIRECT',
    entityType: 'MAIL',
    entityId: mailId,
    oldValue: ctx.mail.mail_status,
    newValue: 'RETOUR_SECRETARIAT',
    context: observations ? String(observations) : 'Traitement terminé et retourné au Secrétariat.',
  });

  res.json({ ok: true, mailStatus: 'RETOUR_SECRETARIAT' });
});

// Add comment / observation (Locked when user is not the current active holder!)
mailRoutes.post('/mails/:id/comments', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const mailId = String(req.params.id);
  const { commentType, content } = req.body ?? {};

  if (!content || !String(content).trim()) {
    res.status(400).json({ error: 'Le commentaire ne peut pas être vide.' });
    return;
  }

  const ctx = loadMailActionContext(user, mailId, companyId);
  if (!ctx) {
    res.status(404).json({ error: 'Courrier introuvable.' });
    return;
  }
  if (!ctx.lock.canAct) {
    res.status(403).json({
      error: ctx.lock.lockReason || 'Action verrouillée : vous ne pouvez plus modifier ni commenter ce courrier.',
    });
    return;
  }

  const id = newId('cmt');
  db.prepare(`
    INSERT INTO mail_comments (id, mail_id, company_id, user_id, comment_type, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, mailId, companyId, user.id, commentType || 'OBSERVATION', String(content).trim());

  res.status(201).json({ id });
});

// Record Dispatch / Expedition (Secrétariat final control & shipment)
mailRoutes.post('/mails/:id/dispatch', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const mailId = String(req.params.id);

  if (!user.isSecretariat && user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Seul le Secrétariat habilité peut enregistrer l’expédition finale.' });
    return;
  }

  const ctx = loadMailActionContext(user, mailId, companyId);
  if (!ctx) {
    res.status(404).json({ error: 'Courrier introuvable.' });
    return;
  }
  if (!ctx.lock.canAct || !ctx.lock.canDispatchOrArchive) {
    res.status(403).json({
      error: ctx.lock.lockReason || 'L’expédition n’est possible que lorsque le dossier est de retour au Secrétariat.',
    });
    return;
  }
  const mail = ctx.mail;

  const { dispatchMode, trackingRef, recipientDetails, notes } = req.body ?? {};
  const shipId = newId('shp');

  db.transaction(() => {
    db.prepare(`
      INSERT INTO shipments (id, mail_id, company_id, dispatch_mode, tracking_ref, recipient_details, dispatched_by, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      shipId,
      mailId,
      companyId,
      dispatchMode || 'COURSIER',
      trackingRef || `EXP-${mail.reference}`,
      recipientDetails || '',
      user.id,
      notes || ''
    );

    db.prepare(`
      UPDATE mails
      SET shipping_status = 'EXPEDIE', mail_status = 'CLOTURE', updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(mailId, companyId);
  })();

  logAudit({
    companyId,
    userId: user.id,
    userName: user.fullName,
    action: 'EXPEDITION_COURRIER',
    entityType: 'MAIL',
    entityId: mailId,
    newValue: { dispatchMode, trackingRef },
    context: 'Contrôle final et preuve d’expédition enregistrée par le Secrétariat.',
  });

  res.status(201).json({ id: shipId });
});

// Archive a mail — STRICTLY ENFORCES mandatory Secrétariat return for incoming mail!
mailRoutes.post('/mails/:id/archive', requireAuth, requireCompanyScope, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const companyId = user.companyId!;
  const mailId = String(req.params.id);

  if (!user.isSecretariat && user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Seul le Secrétariat ou l’Admin peut procéder à l’archivage final.' });
    return;
  }

  const ctx = loadMailActionContext(user, mailId, companyId);
  if (!ctx) {
    res.status(404).json({ error: 'Courrier introuvable.' });
    return;
  }
  const mail = ctx.mail;

  // Non-negotiable rule check: incoming mail cannot bypass Secrétariat return!
  if (mail.direction === 'ENTRANT' && !['RETOUR_SECRETARIAT', 'CLOTURE'].includes(mail.mail_status)) {
    res.status(400).json({
      error: 'Règle métier : aucun courrier entrant ne peut être archivé sans passer par le retour obligatoire au Secrétariat et le contrôle final.',
    });
    return;
  }

  if (!ctx.lock.canAct || !ctx.lock.canDispatchOrArchive) {
    res.status(403).json({
      error: ctx.lock.lockReason || 'Ce courrier n’est pas encore prêt pour l’archivage ou est déjà clôturé.',
    });
    return;
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE mails
      SET mail_status = 'ARCHIVE', workflow_status = 'TERMINE', archive_status = 'ARCHIVE', updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(mailId, companyId);

    db.prepare(`
      UPDATE workflow_instances SET status = 'TERMINE', completed_at = COALESCE(completed_at, datetime('now'))
      WHERE mail_id = ? AND company_id = ?
    `).run(mailId, companyId);

    db.prepare(`
      UPDATE workflow_step_executions SET status = 'TERMINE', decided_by = COALESCE(decided_by, ?), decided_at = COALESCE(decided_at, datetime('now'))
      WHERE mail_id = ? AND company_id = ? AND status IN ('EN_COURS', 'EN_ATTENTE')
    `).run(user.id, mailId, companyId);
  })();

  logAudit({
    companyId,
    userId: user.id,
    userName: user.fullName,
    action: 'ARCHIVAGE_COURRIER',
    entityType: 'MAIL',
    entityId: mailId,
    oldValue: mail.mail_status,
    newValue: 'ARCHIVE',
    context: 'Clôture définitive et archivage.',
  });

  res.json({ ok: true });
});
