import nodemailer from 'nodemailer';
import { db } from '../db/database.ts';
import { newId } from '../utils/crypto.ts';

interface SendEmailParams {
  companyId: string;
  mailId?: string | null;
  recipientUserId?: string | null;
  recipientEmail: string;
  recipientName: string;
  departmentName?: string;
  triggerEvent: string;
  subject: string;
  bodyText: string;
}

function getSmtpTransporter() {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
}

export async function dispatchEmail(params: SendEmailParams): Promise<{ id: string; status: string }> {
  const logId = newId('eml');
  let deliveryStatus: 'SENT_SMTP' | 'QUEUED_NO_SMTP' | 'FAILED' = 'QUEUED_NO_SMTP';
  let errorMessage = '';

  const transporter = getSmtpTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.MAIL_FROM_ADDRESS
          ? `${process.env.MAIL_FROM_NAME || 'NEXORA'} <${process.env.MAIL_FROM_ADDRESS || process.env.SMTP_FROM || 'noreply@nexora.local'}>`
          : 'NEXORA Notifications <noreply@nexora.local>',
        to: `${params.recipientName} <${params.recipientEmail}>`,
        subject: params.subject,
        text: params.bodyText,
      });
      deliveryStatus = 'SENT_SMTP';
    } catch (err) {
      deliveryStatus = 'FAILED';
      errorMessage = err instanceof Error ? err.message : 'Erreur SMTP inconnue';
    }
  }

  // Résolution d'un company_id valide pour respecter les contraintes de clés étrangères
  let effectiveCompanyId = params.companyId;
  const existingCompany = db.prepare('SELECT id FROM companies WHERE id = ?').get(effectiveCompanyId);
  if (!existingCompany) {
    const defaultCompany = db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: string } | undefined;
    effectiveCompanyId = defaultCompany?.id || 'cmp_demo_group';
  }

  db.prepare(`
    INSERT INTO email_logs (
      id, company_id, mail_id, recipient_user_id, recipient_email, recipient_name,
      department_name, trigger_event, subject, body_text, delivery_status, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    logId,
    effectiveCompanyId,
    params.mailId ?? null,
    params.recipientUserId ?? null,
    params.recipientEmail,
    params.recipientName,
    params.departmentName ?? '',
    params.triggerEvent,
    params.subject,
    params.bodyText,
    deliveryStatus,
    errorMessage
  );

  return { id: logId, status: deliveryStatus };
}

/**
 * RÈGLE MÉTIER :
 * Notifie par email un utilisateur (Président, Responsable, Collaborateur, ou Agent)
 * lorsqu'un courrier lui est assigné / orienté ou soumis pour validation/action.
 */
export async function notifyUserOnMailAssignment(args: {
  companyId: string;
  mail: {
    id: string;
    reference: string;
    direction: string;
    subject: string;
    sender_name?: string;
    sender_org?: string;
    priority: string;
    due_date?: string;
  };
  targetUser: {
    id: string;
    full_name: string;
    email: string;
    role: string;
  };
  serviceId?: string | null;
  assignedById?: string | null;
  assignedByName: string;
  actionRequired?: string;
}): Promise<number> {
  const { companyId, mail, targetUser, assignedById, assignedByName, actionRequired } = args;
  if (!targetUser.email) return 0;

  // Règle anti-doublon : ne pas notifier si l'utilisateur s'assigne à lui-même
  if (assignedById && targetUser.id === assignedById) {
    return 0;
  }

  const roleLabel =
    targetUser.role === 'PRESIDENT'
      ? 'Monsieur le Président'
      : targetUser.role === 'RESPONSABLE'
      ? 'Responsable de service'
      : targetUser.role === 'ADMIN'
      ? 'Administrateur'
      : 'Collaborateur';

  const salutation =
    targetUser.role === 'PRESIDENT'
      ? `Monsieur le Président,`
      : `Bonjour ${targetUser.full_name},`;

  const subject =
    targetUser.role === 'PRESIDENT'
      ? `[NEXORA] Courrier pour décision / validation présidentielle — ${mail.reference}`
      : `[NEXORA] Nouveau courrier transmis — ${mail.reference} : ${mail.subject}`;

  const bodyText = [
    salutation,
    ``,
    targetUser.role === 'PRESIDENT'
      ? `Un courrier vient de vous être soumis pour décision, validation ou signature présidentielle dans la plateforme NEXORA.`
      : `Un courrier vient de vous être transmis / affecté par ${assignedByName}.`,
    ``,
    `• Référence interne : ${mail.reference}`,
    `• Sens du courrier : ${mail.direction}`,
    `• Objet : ${mail.subject}`,
    `• Expéditeur : ${mail.sender_name || 'Interne'} ${mail.sender_org ? `(${mail.sender_org})` : ''}`,
    `• Priorité : ${mail.priority}`,
    `• Échéance : ${mail.due_date || 'Non définie'}`,
    actionRequired ? `• Action demandée : ${actionRequired}` : null,
    `• Transmis / affecté par : ${assignedByName}`,
    ``,
    `Connectez-vous à votre espace NEXORA pour consulter le document et procéder à son traitement.`,
    ``,
    `— Plateforme NEXORA`,
  ].filter(Boolean).join('\n');

  const res = await dispatchEmail({
    companyId,
    mailId: mail.id,
    recipientUserId: targetUser.id,
    recipientEmail: targetUser.email,
    recipientName: targetUser.full_name,
    triggerEvent: targetUser.role === 'PRESIDENT' ? 'VALIDATION_PRESIDENT' : 'AFFECTATION_COURRIER',
    subject,
    bodyText,
  });

  return res.status === 'SENT_SMTP' ? 1 : 0;
}

/**
 * RÈGLE MÉTIER HIÉRARCHIQUE :
 * Lorsqu'un courrier est envoyé à un Agent, son Chef de service réellement responsable
 * doit également recevoir un email l'informant que son agent vient de recevoir un courrier.
 * EXCEPTION IMPORTANTE : si l'expéditeur (assignedById) est lui-même le Chef de service de cet Agent,
 * il ne reçoit pas de notification supplémentaire pour éviter les doublons.
 */
export async function notifyDepartmentHeadOnAgentMailAssignment(args: {
  companyId: string;
  mail: {
    id: string;
    reference: string;
    direction: string;
    subject: string;
    sender_name?: string;
    sender_org?: string;
    priority: string;
    due_date?: string;
  };
  agentUser: {
    id: string;
    full_name: string;
    email: string;
  };
  serviceId?: string | null;
  assignedById?: string | null;
  assignedByName: string;
}): Promise<number> {
  const { companyId, mail, agentUser, serviceId, assignedById, assignedByName } = args;

  // Identifier le ou les services auxquels appartient réellement cet agent
  const agentServices = db
    .prepare(`
      SELECT s.id, s.name, s.manager_user_id
      FROM services s
      JOIN user_services us ON us.service_id = s.id
      WHERE us.user_id = ? AND s.company_id = ?
    `)
    .all(agentUser.id, companyId) as Array<{ id: string; name: string; manager_user_id: string | null }>;

  const targetServicesMap = new Map<string, { id: string; name: string; manager_user_id: string | null }>();
  for (const s of agentServices) {
    targetServicesMap.set(s.id, s);
  }

  // Fallback si l'agent n'a pas encore de lien explicite dans user_services mais qu'un serviceId est spécifié
  if (serviceId && !targetServicesMap.has(serviceId) && agentServices.length === 0) {
    const explicitSvc = db
      .prepare('SELECT id, name, manager_user_id FROM services WHERE id = ? AND company_id = ?')
      .get(serviceId, companyId) as { id: string; name: string; manager_user_id: string | null } | undefined;
    if (explicitSvc) targetServicesMap.set(explicitSvc.id, explicitSvc);
  }

  const targetServices = Array.from(targetServicesMap.values());
  const notifiedManagerIds = new Set<string>();
  let emailsSent = 0;

  for (const svc of targetServices) {
    const managers: Array<{ id: string; full_name: string; email: string }> = [];

    // 1. Chef désigné du service (manager_user_id)
    if (svc.manager_user_id) {
      const m = db
        .prepare('SELECT id, full_name, email FROM users WHERE id = ? AND company_id = ? AND is_active = 1')
        .get(svc.manager_user_id, companyId) as { id: string; full_name: string; email: string } | undefined;
      if (m) managers.push(m);
    }

    // 2. Si aucun manager_user_id explicite, chercher les RESPONSABLE rattachés au service
    if (managers.length === 0) {
      const fallbackManagers = db
        .prepare(`
          SELECT u.id, u.full_name, u.email
          FROM users u
          JOIN user_services us ON us.user_id = u.id
          WHERE us.service_id = ? AND u.company_id = ? AND u.role = 'RESPONSABLE' AND u.is_active = 1
        `)
        .all(svc.id, companyId) as Array<{ id: string; full_name: string; email: string }>;
      managers.push(...fallbackManagers);
    }

    for (const head of managers) {
      // EXCEPTION : Si l'expéditeur est lui-même le Chef de service de cet agent, ne pas envoyer de doublon
      if (assignedById && head.id === assignedById) {
        continue;
      }

      // Éviter d'envoyer deux fois au même manager si l'agent est dans plusieurs sous-services
      if (notifiedManagerIds.has(head.id)) continue;
      notifiedManagerIds.add(head.id);

      const subject = `[NEXORA] Département ${svc.name} — Courrier ${mail.reference} transmis à votre agent ${agentUser.full_name}`;
      const bodyText = [
        `Bonjour ${head.full_name},`,
        ``,
        `En tant que chef du département "${svc.name}", nous vous informons qu'un nouveau courrier vient d'être transmis / affecté à un agent de votre service :`,
        ``,
        `• Référence interne : ${mail.reference}`,
        `• Sens : ${mail.direction}`,
        `• Objet : ${mail.subject}`,
        `• Expéditeur : ${mail.sender_name || 'Interne'} ${mail.sender_org ? `(${mail.sender_org})` : ''}`,
        `• Priorité : ${mail.priority}`,
        `• Échéance : ${mail.due_date || 'Non définie'}`,
        `• Agent destinataire : ${agentUser.full_name} (${agentUser.email})`,
        `• Transmis par : ${assignedByName}`,
        ``,
        `Vous pouvez suivre l'avancement du traitement depuis votre espace NEXORA.`,
        ``,
        `— Plateforme NEXORA`,
      ].join('\n');

      const sendRes = await dispatchEmail({
        companyId,
        mailId: mail.id,
        recipientUserId: head.id,
        recipientEmail: head.email,
        recipientName: head.full_name,
        departmentName: svc.name,
        triggerEvent: 'AGENT_MAIL_RECEIVED_DEPT_HEAD_EMAIL',
        subject,
        bodyText,
      });

      // Notification in-app
      db.prepare(`
        INSERT INTO notifications (id, company_id, user_id, mail_id, event_type, title, message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId('ntf'),
        companyId,
        head.id,
        mail.id,
        'EMAIL_CHEF_DEPARTEMENT',
        `Courrier ${mail.reference} transmis à ${agentUser.full_name}`,
        `Le courrier ${mail.reference} a été transmis à votre agent ${agentUser.full_name} (${svc.name}) par ${assignedByName}.`
      );

      if (sendRes.status === 'SENT_SMTP') {
        emailsSent += 1;
      }
    }
  }

  return emailsSent;
}
