import crypto from 'node:crypto';
import { db } from '../db/database.ts';
import type { AuthUser, CircuitStepConfig, MailDirection } from '../types.ts';
import { newId, safeParseJson } from '../utils/crypto.ts';
import { logAudit } from './auditService.ts';
import { getApplicableDelegation } from './delegationService.ts';
import { createNotification, notifyMailAssignedToUser, notifyServiceSecretariat } from './notificationService.ts';

function addHoursIso(hours: number): string {
  const dt = new Date(Date.now() + hours * 3600 * 1000);
  return dt.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Enforce non-negotiable business rule:
 * Any ENTRANT mail circuit MUST terminate with SECRETARIAT_RETURN and SECRETARIAT_DISPATCH_ARCHIVE.
 */
export function ensureMandatorySecretariatReturn(
  direction: MailDirection,
  steps: CircuitStepConfig[],
  secretariatServiceId: string | null
): CircuitStepConfig[] {
  const normalized = steps.map((s, idx) => ({ ...s, stepOrder: s.stepOrder ?? idx + 1 }));
  if (direction !== 'ENTRANT') return normalized;

  const hasReturn = normalized.some((s) => s.stepType === 'SECRETARIAT_RETURN');
  const hasDispatch = normalized.some((s) => s.stepType === 'SECRETARIAT_DISPATCH_ARCHIVE');

  if (!hasReturn) {
    normalized.push({
      stepOrder: normalized.length + 1,
      name: 'Retour obligatoire au Secrétariat — Contrôle final',
      stepType: 'SECRETARIAT_RETURN',
      mode: 'SEQUENTIAL',
      targetRole: 'AGENT',
      targetServiceId: secretariatServiceId,
      slaHours: 24,
    });
  }
  if (!hasDispatch) {
    normalized.push({
      stepOrder: normalized.length + 1,
      name: 'Expédition / Classement et Archivage final',
      stepType: 'SECRETARIAT_DISPATCH_ARCHIVE',
      mode: 'SEQUENTIAL',
      targetRole: 'AGENT',
      targetServiceId: secretariatServiceId,
      slaHours: 24,
    });
  }

  return normalized.map((s, idx) => ({ ...s, stepOrder: idx + 1 }));
}

export async function startWorkflowForMail(args: {
  companyId: string;
  mailId: string;
  circuitId?: string | null;
  templateId?: string | null;
  customSteps?: CircuitStepConfig[];
  circuitType?: 'SEQUENTIEL' | 'PARALLELE' | 'MIXTE';
  actor: AuthUser;
  targetServiceId?: string | null;
  assignedAgentId?: string | null;
}): Promise<string> {
  const { companyId, mailId, circuitId, templateId, customSteps, actor } = args;

  const mail = db
    .prepare('SELECT * FROM mails WHERE id = ? AND company_id = ?')
    .get(mailId, companyId) as {
      id: string;
      reference: string;
      direction: MailDirection;
      subject: string;
      sender_name: string;
      sender_org: string;
      priority: string;
      due_date: string;
      current_service_id: string | null;
      assigned_agent_id: string | null;
    };

  const secService = db
    .prepare('SELECT id FROM services WHERE company_id = ? AND is_secretariat = 1 LIMIT 1')
    .get(companyId) as { id: string } | undefined;

  let steps: CircuitStepConfig[] = [];
  let resolvedCircuitId: string | null = circuitId || null;
  let resolvedVersionId: string | null = null;
  let circuitName = 'Circuit personnalisé';

  if (customSteps && customSteps.length > 0) {
    steps = ensureMandatorySecretariatReturn(mail.direction, customSteps, secService?.id ?? null);
    circuitName = `Circuit ${args.circuitType || 'sur mesure'} (${mail.reference})`;
  } else if (templateId) {
    const tmpl = db
      .prepare('SELECT * FROM circuit_templates WHERE id = ? AND company_id = ?')
      .get(templateId, companyId) as { id: string; name: string; steps_json: string } | undefined;
    if (!tmpl) throw new Error('Modèle de circuit introuvable.');
    const rawSteps = safeParseJson<CircuitStepConfig[]>(tmpl.steps_json, []);
    steps = ensureMandatorySecretariatReturn(mail.direction, rawSteps, secService?.id ?? null);
    circuitName = tmpl.name;
  } else if (circuitId) {
    const circuit = db
      .prepare('SELECT * FROM circuits WHERE id = ? AND company_id = ?')
      .get(circuitId, companyId) as { id: string; current_version: number; name: string } | undefined;

    if (!circuit) throw new Error('Circuit administratif introuvable.');
    circuitName = circuit.name;
    resolvedCircuitId = circuit.id;

    const versionRow = db
      .prepare('SELECT * FROM circuit_versions WHERE circuit_id = ? AND version_number = ? AND company_id = ?')
      .get(circuit.id, circuit.current_version, companyId) as
      | { id: string; steps_json: string }
      | undefined;

    if (!versionRow) throw new Error('Version de circuit introuvable.');
    resolvedVersionId = versionRow.id;

    const rawSteps = safeParseJson<CircuitStepConfig[]>(versionRow.steps_json, []);
    steps = ensureMandatorySecretariatReturn(mail.direction, rawSteps, secService?.id ?? null);
  } else {
    throw new Error('Veuillez sélectionner un circuit, un modèle ou définir les étapes de traitement.');
  }

  const instanceId = newId('wfi');

  db.transaction(() => {
    db.prepare(`
      INSERT INTO workflow_instances (
        id, mail_id, company_id, circuit_id, circuit_version_id, steps_snapshot_json, current_step_index, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'EN_COURS')
    `).run(
      instanceId,
      mailId,
      companyId,
      resolvedCircuitId || 'custom',
      resolvedVersionId || 'v1',
      JSON.stringify(steps),
      0
    );

    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      const execId = newId('wfs');
      const isFirst = i === 0;

      // Resolve service & user for step
      let stepServiceId = st.targetServiceId || args.targetServiceId || mail.current_service_id || null;
      let stepUserId: string | null = st.assignedUserId || null;

      if (
        st.stepType === 'SECRETARIAT_RECEPTION' ||
        st.stepType === 'ORIENTATION' ||
        st.stepType === 'SECRETARIAT_RETURN' ||
        st.stepType === 'SECRETARIAT_DISPATCH_ARCHIVE'
      ) {
        stepServiceId = secService?.id ?? stepServiceId;
      } else if (st.stepType === 'PRESIDENT_VALIDATION') {
        const pres = db
          .prepare("SELECT id FROM users WHERE company_id = ? AND role = 'PRESIDENT' AND is_active = 1 LIMIT 1")
          .get(companyId) as { id: string } | undefined;
        stepUserId = pres?.id ?? null;
      } else if (st.stepType === 'AGENT_TREATMENT') {
        stepUserId = stepUserId || args.assignedAgentId || mail.assigned_agent_id || null;
      } else if (st.stepType === 'RESPONSABLE_ASSIGN' || st.stepType === 'RESPONSABLE_REVIEW') {
        if (stepServiceId && !stepUserId) {
          const svc = db
            .prepare('SELECT manager_user_id FROM services WHERE id = ? AND company_id = ?')
            .get(stepServiceId, companyId) as { manager_user_id: string | null } | undefined;
          stepUserId = svc?.manager_user_id ?? null;
        }
      }

      db.prepare(`
        INSERT INTO workflow_step_executions (
          id, workflow_instance_id, mail_id, company_id, step_order, step_name, step_type, mode,
          status, assigned_service_id, assigned_user_id, due_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        execId,
        instanceId,
        mailId,
        companyId,
        st.stepOrder ?? i + 1,
        st.name || (st as any).title || `Étape ${i + 1}`,
        st.stepType || (st.mode === 'PARALLEL' ? 'PARALLEL_REVIEW' : 'AGENT_TREATMENT'),
        st.mode,
        isFirst ? 'EN_COURS' : 'EN_ATTENTE',
        stepServiceId,
        stepUserId,
        addHoursIso(st.slaHours || 48)
      );

      // Si c'est une étape PARALLEL avec des cibles définies, créer les entrées d'interventions individuelles
      if (st.mode === 'PARALLEL') {
        const parallelTargets = st.parallelTargets || [];
        const assignedIds = st.assignedUserIds || [];
        const combinedUserIds = Array.from(new Set([...parallelTargets.map((t) => t.userId), ...assignedIds])).filter(Boolean);

        for (const uid of combinedUserIds) {
          const targetMeta = parallelTargets.find((t) => t.userId === uid);
          const uInfo = db
            .prepare('SELECT id, full_name, role FROM users WHERE id = ? AND company_id = ?')
            .get(uid, companyId) as { id: string; full_name: string; role: string } | undefined;

          if (uInfo) {
            const intervId = newId('itv');
            db.prepare(`
              INSERT INTO workflow_step_interventions (
                id, workflow_step_id, workflow_instance_id, mail_id, company_id,
                user_id, user_name, user_role, service_id, service_name,
                is_required, status, decision, opinion_text, notified_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE', '', '', datetime('now'))
            `).run(
              intervId,
              execId,
              instanceId,
              mailId,
              companyId,
              uInfo.id,
              uInfo.full_name,
              uInfo.role,
              targetMeta?.serviceId || null,
              targetMeta?.serviceName || null,
              targetMeta?.isRequired !== false ? 1 : 0
            );
          }
        }
      }
    }

    db.prepare(`
      UPDATE mails
      SET circuit_id = ?, circuit_version_id = ?, mail_status = 'EN_CIRCUIT', workflow_status = 'EN_COURS', updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(resolvedCircuitId, resolvedVersionId, mailId, companyId);
  })();

  // Activer et notifier la première étape
  const firstStep = db
    .prepare('SELECT * FROM workflow_step_executions WHERE workflow_instance_id = ? ORDER BY step_order ASC LIMIT 1')
    .get(instanceId) as {
      id: string;
      step_name: string;
      mode: string;
      assigned_service_id: string | null;
      assigned_user_id: string | null;
      due_at: string;
    };

  if (firstStep) {
    if (firstStep.mode === 'PARALLEL') {
      // Notifier TOUS les intervenants de l'étape parallèle simultanément
      const interventions = db
        .prepare('SELECT * FROM workflow_step_interventions WHERE workflow_step_id = ?')
        .all(firstStep.id) as Array<{ user_id: string; service_id: string | null }>;

      for (const itv of interventions) {
        const taskId = newId('tsk');
        db.prepare(`
          INSERT INTO tasks (id, mail_id, company_id, workflow_step_id, title, description, assigned_user_id, assigned_service_id, priority, status, due_date, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'A_TRAITER', ?, ?)
        `).run(
          taskId,
          mailId,
          companyId,
          firstStep.id,
          `${mail.reference} — Consultation parallèle : ${firstStep.step_name}`,
          `Intervention requise sur l'étape parallèle du circuit "${circuitName}"`,
          itv.user_id,
          itv.service_id,
          mail.priority,
          firstStep.due_at,
          actor.id
        );

        await notifyMailAssignedToUser({
          companyId,
          mail,
          targetUserId: itv.user_id,
          serviceId: itv.service_id,
          taskId,
          assignedById: actor.id,
          assignedByName: actor.fullName,
          actionRequired: `Consultation parallèle : ${firstStep.step_name}`,
        });
      }
    } else if (firstStep.assigned_user_id) {
      const taskId = newId('tsk');
      db.prepare(`
        INSERT INTO tasks (id, mail_id, company_id, workflow_step_id, title, description, assigned_user_id, assigned_service_id, priority, status, due_date, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'A_TRAITER', ?, ?)
      `).run(
        taskId,
        mailId,
        companyId,
        firstStep.id,
        `${mail.reference} — ${firstStep.step_name}`,
        `Étape initiale du circuit "${circuitName}"`,
        firstStep.assigned_user_id,
        firstStep.assigned_service_id,
        mail.priority,
        firstStep.due_at,
        actor.id
      );

      await notifyMailAssignedToUser({
        companyId,
        mail,
        targetUserId: firstStep.assigned_user_id,
        serviceId: firstStep.assigned_service_id,
        taskId,
        assignedById: actor.id,
        assignedByName: actor.fullName,
      });
    }
  }

  logAudit({
    companyId,
    userId: actor.id,
    userName: actor.fullName,
    action: 'DEMARRAGE_WORKFLOW',
    entityType: 'MAIL',
    entityId: mailId,
    newValue: { circuitName, stepsCount: steps.length },
    context: `Lancement du circuit "${circuitName}" pour ${mail.reference}`,
  });

  return instanceId;
}

export interface MailActionLockInfo {
  canAct: boolean;
  lockReason: string;
  currentHolderLabel: string;
  allowedActions: string[];
  canOrient: boolean;
  canAssignAgent: boolean;
  canUploadDocument: boolean;
  canDispatchOrArchive: boolean;
  requiresPresidentSignature: boolean;
  activeDelegation?: {
    id: string;
    delegatorName: string;
    delegateName: string;
    endDate: string;
    restrictions: string;
  } | null;
}

export function computeMailActionLock(args: {
  user: AuthUser;
  mail: {
    id: string;
    company_id: string;
    direction?: MailDirection;
    category?: string;
    mail_status: string;
    archive_status: string;
    current_service_id: string | null;
    assigned_agent_id: string | null;
    service_name?: string | null;
    assigned_agent_name?: string | null;
  };
  workflowInstance: {
    id: string;
    steps_snapshot_json: string;
    current_step_index: number;
    status: string;
  } | null | undefined;
  allSteps: Array<{
    id: string;
    step_order: number;
    step_name: string;
    step_type: string;
    mode: string;
    status: string;
    assigned_service_id: string | null;
    assigned_user_id: string | null;
    parallel_approvals_json: string;
  }>;
}): MailActionLockInfo {
  const { user, mail, workflowInstance, allSteps } = args;
  const companyId = mail.company_id || user.companyId || '';

  const lockedResult = (lockReason: string, currentHolderLabel: string): MailActionLockInfo => ({
    canAct: false,
    lockReason,
    currentHolderLabel,
    allowedActions: [],
    canOrient: false,
    canAssignAgent: false,
    canUploadDocument: false,
    canDispatchOrArchive: false,
    requiresPresidentSignature: false,
  });

  if (
    mail.archive_status === 'ARCHIVE' ||
    ['ARCHIVE', 'CLOTURE', 'REJETE', 'CLASSE_SANS_SUITE'].includes(mail.mail_status)
  ) {
    return lockedResult(
      'Ce courrier est clôturé, rejeté ou archivé. Il est verrouillé en lecture seule.',
      'Archives définitives'
    );
  }

  // Case 1: Active Workflow Instance
  if (workflowInstance && allSteps.length > 0) {
    const activeStep =
      allSteps[workflowInstance.current_step_index] ||
      allSteps.find((s) => s.status === 'EN_COURS' || s.status === 'SUSPENDU');

    if (!activeStep || workflowInstance.status === 'TERMINE' || workflowInstance.status === 'ANNULE') {
      if (mail.mail_status === 'RETOUR_SECRETARIAT' && user.isSecretariat) {
        return {
          canAct: true,
          lockReason: '',
          currentHolderLabel: 'Secrétariat Central',
          allowedActions: ['DISPATCH', 'ARCHIVE'],
          canOrient: false,
          canAssignAgent: false,
          canUploadDocument: true,
          canDispatchOrArchive: true,
          requiresPresidentSignature: false,
        };
      }
      return lockedResult('Le circuit administratif est terminé : dossier verrouillé en lecture seule.', 'Secrétariat / Archives');
    }

    if (workflowInstance.status === 'SUSPENDU' || activeStep.status === 'SUSPENDU') {
      const canResume =
        user.role === 'ADMIN' ||
        user.role === 'PRESIDENT' ||
        (user.role === 'RESPONSABLE' && Boolean(activeStep.assigned_service_id && user.serviceIds.includes(activeStep.assigned_service_id)));
      if (!canResume) {
        return lockedResult(
          'Ce courrier est actuellement suspendu. Seul un Responsable, le Président ou l’Admin peut le reprendre.',
          'Circuit suspendu'
        );
      }
      return {
        canAct: true,
        lockReason: '',
        currentHolderLabel: 'En attente de reprise',
        allowedActions: ['REPRENDRE'],
        canOrient: false,
        canAssignAgent: false,
        canUploadDocument: false,
        canDispatchOrArchive: false,
        requiresPresidentSignature: false,
      };
    }

    const stepType = activeStep.step_type;
    const snapshot = safeParseJson<CircuitStepConfig[]>(workflowInstance.steps_snapshot_json, []);
    const stepCfg = snapshot.find((s) => s.stepOrder === activeStep.step_order);

    // 1a. Secretariat steps
    if (
      stepType === 'SECRETARIAT_RECEPTION' ||
      stepType === 'ORIENTATION' ||
      stepType === 'SECRETARIAT_RETURN' ||
      stepType === 'SECRETARIAT_DISPATCH_ARCHIVE'
    ) {
      if (!user.isSecretariat) {
        return lockedResult(
          `Ce courrier est actuellement au Secrétariat (${activeStep.step_name}). Vous ne pouvez plus le modifier tant qu’il ne vous est pas transmis.`,
          'Secrétariat Central'
        );
      }
      const isReturnOrDispatch = stepType === 'SECRETARIAT_RETURN' || stepType === 'SECRETARIAT_DISPATCH_ARCHIVE';
      return {
        canAct: true,
        lockReason: '',
        currentHolderLabel: 'Secrétariat Central',
        allowedActions: isReturnOrDispatch ? ['DISPATCH', 'ARCHIVE', 'APPROUVER', 'DEMANDER_CORRECTION'] : ['ORIENT', 'TRANSMETTRE', 'ASSIGN_AGENT'],
        canOrient: stepType === 'SECRETARIAT_RECEPTION' || stepType === 'ORIENTATION',
        canAssignAgent: stepType === 'SECRETARIAT_RECEPTION' || stepType === 'ORIENTATION',
        canUploadDocument: true,
        canDispatchOrArchive: isReturnOrDispatch,
        requiresPresidentSignature: false,
      };
    }

    // 1b. Responsable Assign step
    if (stepType === 'RESPONSABLE_ASSIGN') {
      const isStepServiceResp =
        user.role === 'RESPONSABLE' &&
        (activeStep.assigned_user_id === user.id ||
          Boolean(activeStep.assigned_service_id && user.serviceIds.includes(activeStep.assigned_service_id)));
      const adminFallback = user.role === 'ADMIN' && !activeStep.assigned_user_id;
      if (!isStepServiceResp && !adminFallback) {
        return lockedResult(
          `Ce courrier est en attente d’affectation par le Responsable (${mail.service_name || 'Service compétent'}). Vous ne pouvez plus y toucher.`,
          `Responsable — ${mail.service_name || 'Service'}`
        );
      }
      return {
        canAct: true,
        lockReason: '',
        currentHolderLabel: `Responsable (${mail.service_name || 'Service'})`,
        allowedActions: ['ASSIGN_AGENT', 'TRANSMETTRE', 'REORIENTER', 'SUSPENDRE'],
        canOrient: false,
        canAssignAgent: true,
        canUploadDocument: true,
        canDispatchOrArchive: false,
        requiresPresidentSignature: false,
      };
    }

    // 1c. Agent Treatment step
    if (stepType === 'AGENT_TREATMENT') {
      const targetAgentId = activeStep.assigned_user_id || mail.assigned_agent_id;
      const isAssignedAgent = Boolean(targetAgentId && user.id === targetAgentId);
      if (!isAssignedAgent) {
        return lockedResult(
          `Ce courrier est actuellement entre les mains de l’agent ${mail.assigned_agent_name || 'assigné'} pour traitement. Accès en lecture seule.`,
          `Agent — ${mail.assigned_agent_name || 'En traitement'}`
        );
      }
      return {
        canAct: true,
        lockReason: '',
        currentHolderLabel: `Vous (${user.fullName})`,
        allowedActions: ['TRANSMETTRE'],
        canOrient: false,
        canAssignAgent: false,
        canUploadDocument: true,
        canDispatchOrArchive: false,
        requiresPresidentSignature: false,
      };
    }

    // 1d. Responsable Review step
    if (stepType === 'RESPONSABLE_REVIEW') {
      const isStepServiceResp =
        user.role === 'RESPONSABLE' &&
        (activeStep.assigned_user_id === user.id ||
          Boolean(activeStep.assigned_service_id && user.serviceIds.includes(activeStep.assigned_service_id)));
      if (!isStepServiceResp) {
        return lockedResult(
          `Ce courrier est en cours de contrôle chez le Responsable (${mail.service_name || 'Service'}). Vous avez terminé votre action ou ce dossier n’est pas chez vous.`,
          `Responsable — ${mail.service_name || 'Service'}`
        );
      }
      return {
        canAct: true,
        lockReason: '',
        currentHolderLabel: `Vous (Responsable — ${mail.service_name || 'Service'})`,
        allowedActions: ['APPROUVER', 'DEMANDER_CORRECTION', 'REJETER', 'CLASSER_SANS_SUITE', 'SUSPENDRE', 'ASSIGN_AGENT'],
        canOrient: false,
        canAssignAgent: true,
        canUploadDocument: true,
        canDispatchOrArchive: false,
        requiresPresidentSignature: false,
      };
    }

    // 1e. Parallel Review step
    if (activeStep.mode === 'PARALLEL' || stepType === 'PARALLEL_REVIEW') {
      // Vérifier les interventions enregistrées dans workflow_step_interventions
      const userIntervention = db
        .prepare('SELECT * FROM workflow_step_interventions WHERE workflow_step_id = ? AND user_id = ?')
        .get(activeStep.id, user.id) as { id: string; status: string; is_required: number } | undefined;

      const approvals = safeParseJson<Array<{ userId: string }>>(activeStep.parallel_approvals_json, []);
      const alreadyApproved = approvals.some((a) => a.userId === user.id) || (userIntervention && userIntervention.status !== 'EN_ATTENTE');

      if (alreadyApproved) {
        return lockedResult(
          'Vous avez déjà enregistré votre avis / décision sur cette consultation parallèle. En attente des autres intervenants.',
          'Votre avis est déjà rendu'
        );
      }

      const designated = stepCfg?.assignedUserIds || [];
      const hasIntervention = Boolean(userIntervention);
      const isEligible =
        hasIntervention ||
        designated.includes(user.id) ||
        (user.role === 'RESPONSABLE' && Boolean(activeStep.assigned_service_id && user.serviceIds.includes(activeStep.assigned_service_id)));

      if (!isEligible) {
        return lockedResult(
          'Cette étape parallèle est attribuée à des intervenants ou responsables désignés. Accès en lecture seule.',
          'Intervenants parallèles'
        );
      }
      return {
        canAct: true,
        lockReason: '',
        currentHolderLabel: 'Consultation parallèle requise (Votre avis)',
        allowedActions: ['APPROUVER', 'DONNER_AVIS', 'DEMANDER_CORRECTION', 'REJETER', 'SUSPENDRE'],
        canOrient: false,
        canAssignAgent: false,
        canUploadDocument: true,
        canDispatchOrArchive: false,
        requiresPresidentSignature: false,
      };
    }

    // 1f. President Validation step
    if (stepType === 'PRESIDENT_VALIDATION') {
      const isDirectPresident = user.role === 'PRESIDENT';
      const mailDirection = mail.direction || 'SORTANT';
      const mailCategory = mail.category || '';
      const applicableDelegation = !isDirectPresident
        ? getApplicableDelegation({
          companyId,
          userId: user.id,
          direction: mailDirection,
          category: mailCategory,
        })
        : null;

      if (!isDirectPresident && !applicableDelegation) {
        return lockedResult(
          'Ce courrier est actuellement sur le bureau du Président pour signature numérique et visa officiel. Seul le Président ou un délégataire expressément autorisé peut signer ce document.',
          'Présidence (Signature attendue)'
        );
      }

      return {
        canAct: true,
        lockReason: '',
        currentHolderLabel: isDirectPresident
          ? 'Présidence — Signature numérique & Cachet attendus'
          : `Par délégation du Président (${applicableDelegation?.delegatorName}) — Signature autorisée`,
        allowedActions: ['APPROUVER', 'DEMANDER_CORRECTION', 'REJETER', 'CLASSER_SANS_SUITE', 'SUSPENDRE'],
        canOrient: false,
        canAssignAgent: false,
        canUploadDocument: true,
        canDispatchOrArchive: false,
        requiresPresidentSignature: true,
        activeDelegation: applicableDelegation
          ? {
            id: applicableDelegation.id,
            delegatorName: applicableDelegation.delegatorName,
            delegateName: applicableDelegation.delegateName,
            endDate: applicableDelegation.endDate,
            restrictions: applicableDelegation.restrictions,
          }
          : null,
      };
    }
  }

  // Case 2: No active workflow instance yet
  if (mail.mail_status === 'RETOUR_SECRETARIAT') {
    if (!user.isSecretariat) {
      return lockedResult(
        'Ce courrier est revenu au Secrétariat pour contrôle final et archivage.',
        'Secrétariat Central'
      );
    }
    return {
      canAct: true,
      lockReason: '',
      currentHolderLabel: 'Secrétariat Central',
      allowedActions: ['DISPATCH', 'ARCHIVE'],
      canOrient: false,
      canAssignAgent: false,
      canUploadDocument: true,
      canDispatchOrArchive: true,
      requiresPresidentSignature: false,
    };
  }

  if (mail.assigned_agent_id && mail.mail_status === 'EN_CIRCUIT') {
    if (user.id !== mail.assigned_agent_id) {
      return lockedResult(
        `Ce courrier a été affecté à l’agent ${mail.assigned_agent_name || 'traitant'}. Vous ne pouvez plus le modifier tant qu’il ne l’a pas retourné.`,
        `Agent — ${mail.assigned_agent_name || 'Traitement'}`
      );
    }
    return {
      canAct: true,
      lockReason: '',
      currentHolderLabel: `Vous (${user.fullName})`,
      allowedActions: ['COMPLETE_DIRECT_TREATMENT'],
      canOrient: false,
      canAssignAgent: false,
      canUploadDocument: true,
      canDispatchOrArchive: false,
      requiresPresidentSignature: false,
    };
  }

  // Newly registered mail awaiting Secretariat orientation/assignment
  if (!user.isSecretariat) {
    return lockedResult(
      'Ce courrier est en attente d’orientation par le Secrétariat.',
      'Secrétariat Central'
    );
  }
  return {
    canAct: true,
    lockReason: '',
    currentHolderLabel: 'Secrétariat Central',
    allowedActions: ['ORIENT', 'ASSIGN_AGENT'],
    canOrient: true,
    canAssignAgent: true,
    canUploadDocument: true,
    canDispatchOrArchive: false,
    requiresPresidentSignature: false,
  };
}

export type WorkflowDecisionAction =
  | 'APPROUVER'
  | 'TRANSMETTRE'
  | 'REJETER'
  | 'DEMANDER_CORRECTION'
  | 'REORIENTER'
  | 'SUSPENDRE'
  | 'REPRENDRE'
  | 'CLASSER_SANS_SUITE';

export async function applyWorkflowDecision(args: {
  companyId: string;
  mailId: string;
  actor: AuthUser;
  decision: WorkflowDecisionAction;
  motif?: string;
  observations?: string;
  targetServiceId?: string | null;
  targetAgentId?: string | null;
  signatureImage?: string;
  stampImage?: string;
  useSavedSignature?: boolean;
}): Promise<{ mailStatus: string; workflowStatus: string; departmentEmailsTriggered: number; signatureId?: string }> {
  const { companyId, mailId, actor, decision, motif = '', observations = '' } = args;
  let departmentEmailsTriggered = 0;

  const mail = db
    .prepare('SELECT * FROM mails WHERE id = ? AND company_id = ?')
    .get(mailId, companyId) as {
      id: string;
      reference: string;
      direction: MailDirection;
      category: string;
      subject: string;
      sender_name: string;
      sender_org: string;
      priority: string;
      due_date: string;
      requires_response: number;
      current_service_id: string | null;
      assigned_agent_id: string | null;
      mail_status: string;
      workflow_status: string;
    } | undefined;

  if (!mail) throw new Error('Courrier introuvable.');

  const instance = db
    .prepare('SELECT * FROM workflow_instances WHERE mail_id = ? AND company_id = ?')
    .get(mailId, companyId) as
    | { id: string; steps_snapshot_json: string; current_step_index: number; status: string }
    | undefined;

  if (!instance) {
    throw new Error('Aucun circuit actif n\'est associé à ce courrier.');
  }

  const allSteps = db
    .prepare('SELECT * FROM workflow_step_executions WHERE workflow_instance_id = ? ORDER BY step_order ASC')
    .all(instance.id) as Array<{
      id: string;
      step_order: number;
      step_name: string;
      step_type: string;
      mode: 'SEQUENTIAL' | 'PARALLEL';
      status: string;
      assigned_service_id: string | null;
      assigned_user_id: string | null;
      parallel_approvals_json: string;
      due_at: string;
    }>;

  const currentStep = allSteps[instance.current_step_index] || allSteps.find((s) => s.status === 'EN_COURS');
  if (!currentStep) {
    throw new Error('Aucune étape en cours sur ce courrier.');
  }

  // Strict turn-based active holder lock: once a user completes their action, they cannot touch the mail anymore
  const lock = computeMailActionLock({
    user: actor,
    mail: { ...mail, company_id: companyId, archive_status: 'NON_ARCHIVE' },
    workflowInstance: instance,
    allSteps,
  });
  if (!lock.canAct) {
    throw new Error(lock.lockReason || 'Vous ne pouvez plus toucher à ce courrier : il est actuellement chez un autre intervenant.');
  }

  const isSecretariatStep =
    currentStep.step_type === 'SECRETARIAT_RECEPTION' ||
    currentStep.step_type === 'ORIENTATION' ||
    currentStep.step_type === 'SECRETARIAT_RETURN' ||
    currentStep.step_type === 'SECRETARIAT_DISPATCH_ARCHIVE';

  // Permission enforcement: At PRESIDENT_VALIDATION, only President or authorized delegate can decide
  let activeDelegationForStep: ReturnType<typeof getApplicableDelegation> = null;
  if (currentStep.step_type === 'PRESIDENT_VALIDATION') {
    if (actor.role === 'PRESIDENT') {
      // Direct President signature
    } else {
      activeDelegationForStep = getApplicableDelegation({
        companyId,
        userId: actor.id,
        direction: mail.direction,
        category: mail.category,
      });

      if (!activeDelegationForStep) {
        throw new Error(
          'Cette étape requiert la signature du Président ou une délégation de pouvoir active couvrant ce type et cette catégorie de document.'
        );
      }
    }
  } else if (actor.role === 'AGENT') {
    if (currentStep.step_type === 'RESPONSABLE_REVIEW' || currentStep.step_type === 'RESPONSABLE_ASSIGN') {
      throw new Error('Un Agent ne peut pas décider à une étape réservée au Responsable.');
    }
    if ((decision === 'APPROUVER' || decision === 'REJETER' || decision === 'CLASSER_SANS_SUITE') && !(actor.isSecretariat && isSecretariatStep)) {
      throw new Error('Un Agent ne peut pas approuver ou rejeter seul : transmettez le dossier au Responsable.');
    }
  }

  // When President (or delegated signer) approves on PRESIDENT_VALIDATION, resolve & persist digital signature + stamp image
  let signatureId: string | undefined;
  let resolvedSignatureImg = '';
  let resolvedStampImg = '';
  if (
    (currentStep.step_type === 'PRESIDENT_VALIDATION' || actor.role === 'PRESIDENT') &&
    decision === 'APPROUVER'
  ) {
    const signerRow = db
      .prepare('SELECT signature_image, stamp_image FROM users WHERE id = ?')
      .get(actor.id) as { signature_image?: string; stamp_image?: string } | undefined;
    const compRow = db
      .prepare('SELECT stamp_image FROM companies WHERE id = ?')
      .get(companyId) as { stamp_image?: string } | undefined;

    resolvedSignatureImg = (args.signatureImage || signerRow?.signature_image || '').trim();
    resolvedStampImg = (args.stampImage || signerRow?.stamp_image || compRow?.stamp_image || '').trim();

    if (currentStep.step_type === 'PRESIDENT_VALIDATION' && !resolvedSignatureImg) {
      throw new Error('Veuillez apposer votre signature numérique (dessin ou signature enregistrée dans Mon Profil) avant de valider ce courrier.');
    }
  }

  const snapshot = safeParseJson<CircuitStepConfig[]>(instance.steps_snapshot_json, []);
  const stepCfg = snapshot.find((s) => s.stepOrder === currentStep.step_order);

  // Handle SUSPENDRE / REPRENDRE
  if (decision === 'SUSPENDRE') {
    db.prepare(`UPDATE workflow_instances SET status = 'SUSPENDU' WHERE id = ?`).run(instance.id);
    db.prepare(`UPDATE workflow_step_executions SET status = 'SUSPENDU', decision = 'SUSPENDRE', decision_motif = ?, observations = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?`)
      .run(motif, observations, actor.id, currentStep.id);
    db.prepare(`UPDATE mails SET mail_status = 'SUSPENDU', workflow_status = 'SUSPENDU', updated_at = datetime('now') WHERE id = ?`).run(mailId);
    logAudit({ companyId, userId: actor.id, userName: actor.fullName, action: 'SUSPENSION_WORKFLOW', entityType: 'MAIL', entityId: mailId, oldValue: mail.mail_status, newValue: 'SUSPENDU', context: motif || observations });
    return { mailStatus: 'SUSPENDU', workflowStatus: 'SUSPENDU', departmentEmailsTriggered: 0 };
  }

  if (decision === 'REPRENDRE') {
    db.prepare(`UPDATE workflow_instances SET status = 'EN_COURS' WHERE id = ?`).run(instance.id);
    db.prepare(`UPDATE workflow_step_executions SET status = 'EN_COURS', decision = 'REPRENDRE', observations = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?`)
      .run(observations, actor.id, currentStep.id);
    db.prepare(`UPDATE mails SET mail_status = 'EN_CIRCUIT', workflow_status = 'EN_COURS', updated_at = datetime('now') WHERE id = ?`).run(mailId);
    logAudit({ companyId, userId: actor.id, userName: actor.fullName, action: 'REPRISE_WORKFLOW', entityType: 'MAIL', entityId: mailId, oldValue: 'SUSPENDU', newValue: 'EN_CIRCUIT', context: observations });
    return { mailStatus: 'EN_CIRCUIT', workflowStatus: 'EN_COURS', departmentEmailsTriggered: 0 };
  }

  // Handle CLASSER_SANS_SUITE -> Mandatory return to Secrétariat for incoming mail!
  if (decision === 'CLASSER_SANS_SUITE') {
    const returnStepIdx = allSteps.findIndex((s) => s.step_type === 'SECRETARIAT_RETURN');
    if (mail.direction === 'ENTRANT' && returnStepIdx !== -1 && currentStep.step_order < allSteps[returnStepIdx].step_order) {
      db.prepare(`UPDATE workflow_step_executions SET status = 'TERMINE', decision = 'CLASSER_SANS_SUITE', decision_motif = ?, observations = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?`)
        .run(motif, observations, actor.id, currentStep.id);
      for (let i = instance.current_step_index + 1; i < returnStepIdx; i++) {
        db.prepare(`UPDATE workflow_step_executions SET status = 'TERMINE', decision = 'SAUTE_CLASSEMENT' WHERE id = ?`).run(allSteps[i].id);
      }
      db.prepare(`UPDATE workflow_step_executions SET status = 'EN_COURS' WHERE id = ?`).run(allSteps[returnStepIdx].id);
      db.prepare(`UPDATE workflow_instances SET current_step_index = ? WHERE id = ?`).run(returnStepIdx, instance.id);
      db.prepare(`UPDATE mails SET mail_status = 'RETOUR_SECRETARIAT', updated_at = datetime('now') WHERE id = ?`).run(mailId);
      notifyServiceSecretariat({
        companyId,
        mailId,
        eventType: 'RETOUR_SECRETARIAT',
        title: `Retour Secrétariat (Classé sans suite) — ${mail.reference}`,
        message: `Le courrier ${mail.reference} a été classé sans suite par ${actor.fullName} et revient obligatoirement au Secrétariat pour clôture et archivage.`,
      });
      logAudit({ companyId, userId: actor.id, userName: actor.fullName, action: 'CLASSER_SANS_SUITE', entityType: 'MAIL', entityId: mailId, oldValue: mail.mail_status, newValue: 'RETOUR_SECRETARIAT', context: motif });
      return { mailStatus: 'RETOUR_SECRETARIAT', workflowStatus: 'EN_COURS', departmentEmailsTriggered: 0 };
    }
  }

  // Handle DEMANDER_CORRECTION -> goes back to previous AGENT_TREATMENT or previous step
  if (decision === 'DEMANDER_CORRECTION') {
    db.prepare(`UPDATE workflow_step_executions SET status = 'CORRECTION_DEMANDEE', decision = 'DEMANDER_CORRECTION', decision_motif = ?, observations = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?`)
      .run(motif, observations, actor.id, currentStep.id);

    const prevAgentIdx = allSteps
      .slice(0, instance.current_step_index)
      .reverse()
      .findIndex((s) => s.step_type === 'AGENT_TREATMENT' || s.step_type === 'RESPONSABLE_ASSIGN');
    const targetIdx = prevAgentIdx !== -1 ? instance.current_step_index - 1 - prevAgentIdx : Math.max(0, instance.current_step_index - 1);
    const targetStep = allSteps[targetIdx];

    db.prepare(`UPDATE workflow_step_executions SET status = 'EN_COURS' WHERE id = ?`).run(targetStep.id);
    db.prepare(`UPDATE workflow_instances SET current_step_index = ? WHERE id = ?`).run(targetIdx, instance.id);
    db.prepare(`UPDATE mails SET mail_status = 'EN_ATTENTE_CORRECTION', updated_at = datetime('now') WHERE id = ?`).run(mailId);
    db.prepare(`UPDATE tasks SET status = 'A_CORRIGER', updated_at = datetime('now') WHERE mail_id = ? AND status IN ('A_TRAITER', 'EN_COURS', 'TRANSMISE')`).run(mailId);

    const notifyUid = targetStep.assigned_user_id || mail.assigned_agent_id;
    if (notifyUid) {
      createNotification({
        companyId,
        userId: notifyUid,
        mailId,
        eventType: 'DEMANDE_CORRECTION',
        title: `Correction demandée — ${mail.reference}`,
        message: `${actor.fullName} demande une correction : ${motif || observations || 'Voir observations'}`,
      });
    }

    logAudit({ companyId, userId: actor.id, userName: actor.fullName, action: 'DEMANDE_CORRECTION', entityType: 'MAIL', entityId: mailId, oldValue: mail.mail_status, newValue: 'EN_ATTENTE_CORRECTION', context: motif || observations });
    return { mailStatus: 'EN_ATTENTE_CORRECTION', workflowStatus: 'EN_COURS', departmentEmailsTriggered: 0 };
  }

  // Handle REJETER
  if (decision === 'REJETER') {
    db.prepare(`UPDATE workflow_step_executions SET status = 'REJETE', decision = 'REJETER', decision_motif = ?, observations = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?`)
      .run(motif, observations, actor.id, currentStep.id);
    db.prepare(`UPDATE tasks SET status = 'REJETEE', updated_at = datetime('now') WHERE workflow_step_id = ?`).run(currentStep.id);

    // Incoming mail must STILL return to Secrétariat!
    const returnIdx = allSteps.findIndex((s) => s.step_type === 'SECRETARIAT_RETURN');
    if (mail.direction === 'ENTRANT' && returnIdx !== -1 && instance.current_step_index < returnIdx) {
      db.prepare(`UPDATE workflow_step_executions SET status = 'EN_COURS' WHERE id = ?`).run(allSteps[returnIdx].id);
      db.prepare(`UPDATE workflow_instances SET current_step_index = ? WHERE id = ?`).run(returnIdx, instance.id);
      db.prepare(`UPDATE mails SET mail_status = 'RETOUR_SECRETARIAT', updated_at = datetime('now') WHERE id = ?`).run(mailId);
      notifyServiceSecretariat({
        companyId,
        mailId,
        eventType: 'REJET_RETOUR_SECRETARIAT',
        title: `Rejet & Retour Secrétariat — ${mail.reference}`,
        message: `Le courrier ${mail.reference} a été rejeté (${motif || 'Sans motif'}) et retourne au Secrétariat.`,
      });
      logAudit({ companyId, userId: actor.id, userName: actor.fullName, action: 'REJET_ETAPE', entityType: 'MAIL', entityId: mailId, oldValue: mail.mail_status, newValue: 'RETOUR_SECRETARIAT', context: motif });
      return { mailStatus: 'RETOUR_SECRETARIAT', workflowStatus: 'EN_COURS', departmentEmailsTriggered: 0 };
    }

    db.prepare(`UPDATE workflow_instances SET status = 'ANNULE', completed_at = datetime('now') WHERE id = ?`).run(instance.id);
    db.prepare(`UPDATE mails SET mail_status = 'REJETE', workflow_status = 'ANNULE', updated_at = datetime('now') WHERE id = ?`).run(mailId);
    logAudit({ companyId, userId: actor.id, userName: actor.fullName, action: 'REJET_WORKFLOW', entityType: 'MAIL', entityId: mailId, oldValue: mail.mail_status, newValue: 'REJETE', context: motif });
    return { mailStatus: 'REJETE', workflowStatus: 'ANNULE', departmentEmailsTriggered: 0 };
  }

  // Handle PARALLEL step partial approval / opinion rendering
  if (currentStep.mode === 'PARALLEL' && (decision === 'APPROUVER' || decision === 'TRANSMETTRE' || decision === 'DONNER_AVIS')) {
    // 1. Mettre à jour l'intervention individuelle si elle existe
    const existingInterv = db
      .prepare('SELECT id, is_required FROM workflow_step_interventions WHERE workflow_step_id = ? AND user_id = ?')
      .get(currentStep.id, actor.id) as { id: string; is_required: number } | undefined;

    if (existingInterv) {
      db.prepare(`
        UPDATE workflow_step_interventions
        SET status = 'AVIS_RENDU', decision = ?, opinion_text = ?, completed_at = datetime('now')
        WHERE id = ?
      `).run(decision, observations || motif || 'Avis favorable rendu', existingInterv.id);
    } else {
      // Créer à la volée si non pré-créé
      db.prepare(`
        INSERT INTO workflow_step_interventions (
          id, workflow_step_id, workflow_instance_id, mail_id, company_id,
          user_id, user_name, user_role, is_required, status, decision, opinion_text, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'AVIS_RENDU', ?, ?, datetime('now'))
      `).run(
        newId('itv'),
        currentStep.id,
        instance.id,
        mailId,
        companyId,
        actor.id,
        actor.fullName,
        actor.role,
        decision,
        observations || motif || 'Avis favorable rendu'
      );
    }

    const approvals = safeParseJson<Array<{ userId: string; userName: string; at: string; decision: string }>>(
      currentStep.parallel_approvals_json,
      []
    );
    if (!approvals.some((a) => a.userId === actor.id)) {
      approvals.push({ userId: actor.id, userName: actor.fullName, at: new Date().toISOString(), decision });
    }
    db.prepare(`UPDATE workflow_step_executions SET parallel_approvals_json = ? WHERE id = ?`).run(
      JSON.stringify(approvals),
      currentStep.id
    );

    // Mettre à jour la tâche de l'intervenant
    db.prepare(`
      UPDATE tasks SET status = 'TERMINEE', updated_at = datetime('now')
      WHERE workflow_step_id = ? AND assigned_user_id = ? AND status NOT IN ('TERMINEE', 'ANNULEE')
    `).run(currentStep.id, actor.id);

    // Calculer les conditions de clôture selon la règle choisie :
    // Option A: 'ALL' (Tous les avis obligatoires)
    // Option B: 'MIN_COUNT' (Nombre minimum d'avis, ex: 2 sur 3)
    // Option C: 'CONSULTATIVE' (Avis consultatifs, ne bloque pas la progression si initiateur ou premier valideur avance)
    const rule = stepCfg?.parallelRule || 'ALL';

    const allInterventions = db
      .prepare('SELECT id, is_required, status FROM workflow_step_interventions WHERE workflow_step_id = ?')
      .all(currentStep.id) as Array<{ id: string; is_required: number; status: string }>;

    let isClosureConditionSatisfied = false;

    if (allInterventions.length > 0) {
      const requiredInterventions = allInterventions.filter((i) => i.is_required === 1);
      const completedRequired = requiredInterventions.filter((i) => i.status === 'AVIS_RENDU' || i.status === 'VALIDE');
      const totalCompleted = allInterventions.filter((i) => i.status === 'AVIS_RENDU' || i.status === 'VALIDE');

      if (rule === 'ALL') {
        // Tous les avis obligatoires requis
        isClosureConditionSatisfied = requiredInterventions.length === 0
          ? totalCompleted.length === allInterventions.length
          : completedRequired.length >= requiredInterventions.length;
      } else if (rule === 'MIN_COUNT') {
        const minReq = Math.max(1, stepCfg?.minApprovals || 2);
        isClosureConditionSatisfied = totalCompleted.length >= minReq;
      } else if (rule === 'CONSULTATIVE') {
        // Consultatif : chaque avis rendu compte, mais au moins 1 avis clôture ou avance le palier
        isClosureConditionSatisfied = true;
      } else {
        // ANY_ONE
        isClosureConditionSatisfied = totalCompleted.length >= 1;
      }
    } else {
      // Fallback sur le nombre d'approvals
      const requiredCount =
        rule === 'ALL'
          ? Math.max(1, stepCfg?.assignedUserIds?.length || 2)
          : rule === 'MIN_COUNT'
            ? Math.max(1, stepCfg?.minApprovals || 2)
            : 1;
      isClosureConditionSatisfied = approvals.length >= requiredCount;
    }

    if (!isClosureConditionSatisfied) {
      logAudit({
        companyId,
        userId: actor.id,
        userName: actor.fullName,
        action: 'AVIS_PARALLELE_ENREGISTRE',
        entityType: 'MAIL',
        entityId: mailId,
        newValue: { approvalsCount: approvals.length, rule },
        context: observations || 'Avis parallèle enregistré, en attente des autres intervenants.',
      });
      return { mailStatus: mail.mail_status, workflowStatus: 'EN_COURS', departmentEmailsTriggered: 0 };
    }
  }

  // Mark current step VALIDE / TERMINE and advance
  db.prepare(`
    UPDATE workflow_step_executions
    SET status = 'VALIDE', decision = ?, decision_motif = ?, observations = ?, decided_by = ?, decided_at = datetime('now')
    WHERE id = ?
  `).run(decision, motif, observations, actor.id, currentStep.id);

  if (resolvedSignatureImg && decision === 'APPROUVER') {
    signatureId = newId('msig');
    const signedAtIso = new Date().toISOString();
    const isDelegated = activeDelegationForStep ? 1 : 0;
    const delegationId = activeDelegationForStep?.id || null;
    const representedUserId = activeDelegationForStep?.delegatorUserId || null;
    const representedName = activeDelegationForStep?.delegatorName || null;
    const representedRole = activeDelegationForStep?.delegatorRole || null;

    const signatureHash =
      'sha256:' +
      crypto
        .createHash('sha256')
        .update(
          `${mailId}|${mail.reference}|${actor.id}|${isDelegated}|${delegationId || 'direct'}|${signedAtIso}|${resolvedSignatureImg.slice(0, 128)}`
        )
        .digest('hex');

    db.prepare(`
      INSERT INTO mail_signatures (
        id, mail_id, company_id, workflow_step_id, signer_user_id, signer_name, signer_role, signer_title,
        signature_image, stamp_image, signature_hash, signed_at,
        is_delegated, delegation_id, represented_user_id, represented_name, represented_role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?)
    `).run(
      signatureId,
      mailId,
      companyId,
      currentStep.id,
      actor.id,
      actor.fullName,
      actor.role,
      actor.jobTitle,
      resolvedSignatureImg,
      resolvedStampImg,
      signatureHash,
      isDelegated,
      delegationId,
      representedUserId,
      representedName,
      representedRole
    );

    const auditContext = isDelegated
      ? `Signature apposée par DÉLÉGATION DU PRÉSIDENT par ${actor.fullName} (${actor.jobTitle}) au nom du Président ${representedName} (Réf. délégation: ${delegationId}).`
      : `Signature présidentielle directe et cachet officiel apposés par le Président ${actor.fullName}.`;

    logAudit({
      companyId,
      userId: actor.id,
      userName: actor.fullName,
      action: isDelegated ? 'SIGNATURE_PAR_DELEGATION' : 'SIGNATURE_NUMERIQUE_CACHET',
      entityType: 'MAIL',
      entityId: mailId,
      newValue: {
        signatureId,
        signatureHash,
        isDelegated: Boolean(isDelegated),
        delegationId,
        representedName,
        hasStamp: Boolean(resolvedStampImg),
      },
      context: auditContext,
    });
  }

  db.prepare(`UPDATE tasks SET status = 'TERMINEE', updated_at = datetime('now') WHERE workflow_step_id = ?`).run(currentStep.id);

  const nextIdx = instance.current_step_index + 1;
  if (nextIdx >= allSteps.length) {
    // Workflow completed!
    db.prepare(`UPDATE workflow_instances SET status = 'TERMINE', completed_at = datetime('now') WHERE id = ?`).run(instance.id);
    const finalMailStatus = mail.direction === 'ENTRANT' ? 'CLOTURE' : 'VALIDE';
    db.prepare(`UPDATE mails SET mail_status = ?, workflow_status = 'TERMINE', updated_at = datetime('now') WHERE id = ?`)
      .run(finalMailStatus, mailId);
    logAudit({ companyId, userId: actor.id, userName: actor.fullName, action: 'FIN_WORKFLOW', entityType: 'MAIL', entityId: mailId, oldValue: mail.mail_status, newValue: finalMailStatus, context: observations });
    return { mailStatus: finalMailStatus, workflowStatus: 'TERMINE', departmentEmailsTriggered, signatureId };
  }

  const nextStep = allSteps[nextIdx];
  let nextServiceId = args.targetServiceId ?? nextStep.assigned_service_id ?? mail.current_service_id;
  let nextUserId = nextStep.assigned_user_id;

  if (nextStep.step_type === 'AGENT_TREATMENT') {
    nextUserId = args.targetAgentId || nextUserId || mail.assigned_agent_id;
  } else if (nextStep.step_type === 'RESPONSABLE_ASSIGN' || nextStep.step_type === 'RESPONSABLE_REVIEW') {
    if (nextServiceId) {
      const svc = db
        .prepare('SELECT manager_user_id FROM services WHERE id = ? AND company_id = ?')
        .get(nextServiceId, companyId) as { manager_user_id: string | null } | undefined;
      nextUserId = svc?.manager_user_id ?? nextUserId;
    }
  }

  db.prepare(`
    UPDATE workflow_step_executions
    SET status = 'EN_COURS', assigned_service_id = COALESCE(?, assigned_service_id), assigned_user_id = COALESCE(?, assigned_user_id)
    WHERE id = ?
  `).run(nextServiceId, nextUserId, nextStep.id);

  db.prepare(`UPDATE workflow_instances SET current_step_index = ? WHERE id = ?`).run(nextIdx, instance.id);

  let nextMailStatus = 'EN_CIRCUIT';
  if (nextStep.step_type === 'SECRETARIAT_RETURN' || nextStep.step_type === 'SECRETARIAT_DISPATCH_ARCHIVE') {
    nextMailStatus = 'RETOUR_SECRETARIAT';
    notifyServiceSecretariat({
      companyId,
      mailId,
      eventType: 'RETOUR_SECRETARIAT',
      title: `Retour obligatoire au Secrétariat — ${mail.reference}`,
      message: `Le courrier ${mail.reference} est revenu au Secrétariat pour ${nextStep.step_name}.`,
    });
  }

  db.prepare(`
    UPDATE mails
    SET mail_status = ?,
        current_service_id = COALESCE(?, current_service_id),
        assigned_agent_id = CASE WHEN ? IS NOT NULL THEN ? ELSE assigned_agent_id END,
        shipping_status = CASE WHEN ? = 'SECRETARIAT_DISPATCH_ARCHIVE' AND requires_response = 1 THEN 'A_EXPEDIER' ELSE shipping_status END,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(nextMailStatus, nextServiceId, args.targetAgentId ?? null, args.targetAgentId ?? null, nextStep.step_type, mailId);

  if (nextStep.mode === 'PARALLEL') {
    // Activer et notifier TOUS les participants de cette étape parallèle
    const parallelInterventions = db
      .prepare('SELECT * FROM workflow_step_interventions WHERE workflow_step_id = ?')
      .all(nextStep.id) as Array<{ user_id: string; service_id: string | null }>;

    for (const itv of parallelInterventions) {
      const taskId = newId('tsk');
      db.prepare(`
        INSERT INTO tasks (id, mail_id, company_id, workflow_step_id, title, description, assigned_user_id, assigned_service_id, priority, status, due_date, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'A_TRAITER', ?, ?)
      `).run(
        taskId,
        mailId,
        companyId,
        nextStep.id,
        `${mail.reference} — Consultation parallèle : ${nextStep.step_name}`,
        observations || `Avis ou décision requis sur : ${nextStep.step_name}`,
        itv.user_id,
        itv.service_id,
        mail.priority,
        nextStep.due_at,
        actor.id
      );

      departmentEmailsTriggered += await notifyMailAssignedToUser({
        companyId,
        mail,
        targetUserId: itv.user_id,
        serviceId: itv.service_id,
        taskId,
        assignedById: actor.id,
        assignedByName: actor.fullName,
        actionRequired: `Consultation parallèle : ${nextStep.step_name}`,
      });
    }
  } else {
    const taskId = newId('tsk');
    db.prepare(`
      INSERT INTO tasks (id, mail_id, company_id, workflow_step_id, title, description, assigned_user_id, assigned_service_id, priority, status, due_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'A_TRAITER', ?, ?)
    `).run(
      taskId,
      mailId,
      companyId,
      nextStep.id,
      `${mail.reference} — ${nextStep.step_name}`,
      observations || `Action requise : ${nextStep.step_name}`,
      nextUserId,
      nextServiceId,
      mail.priority,
      nextStep.due_at,
      actor.id
    );

    if (nextUserId) {
      departmentEmailsTriggered += await notifyMailAssignedToUser({
        companyId,
        mail,
        targetUserId: nextUserId,
        serviceId: nextServiceId,
        taskId,
        assignedById: actor.id,
        assignedByName: actor.fullName,
      });
    }
  }

  logAudit({
    companyId,
    userId: actor.id,
    userName: actor.fullName,
    action: `ETAPE_${decision}`,
    entityType: 'MAIL',
    entityId: mailId,
    oldValue: currentStep.step_name,
    newValue: nextStep.step_name,
    context: observations || motif,
  });

  return { mailStatus: nextMailStatus, workflowStatus: 'EN_COURS', departmentEmailsTriggered, signatureId };
}
