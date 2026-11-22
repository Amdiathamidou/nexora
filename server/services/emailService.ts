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

  db.prepare(`
    INSERT INTO email_logs (
      id, company_id, mail_id, recipient_user_id, recipient_email, recipient_name,
      department_name, trigger_event, subject, body_text, delivery_status, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    logId,
    params.companyId,
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
 * RÈGLE MÉTIER IMPÉRATIVE :
 * Dès qu'un agent reçoit un courrier (affectation directe, étape de circuit ou transfert),
 * le chef de son département (Responsable du service) reçoit automatiquement un e-mail.
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
  assignedByName: string;
}): Promise<number> {
  const { companyId, mail, agentUser, serviceId, assignedByName } = args;

  // Always resolve the agent's own department(s) first ("le chef de son département"),
  // plus fallback to explicit serviceId if the agent is not yet mapped in user_services.
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
  if (serviceId && !targetServicesMap.has(serviceId) && agentServices.length === 0) {
    const explicitSvc = db
      .prepare('SELECT id, name, manager_user_id FROM services WHERE id = ? AND company_id = ?')
      .get(serviceId, companyId) as { id: string; name: string; manager_user_id: string | null } | undefined;
    if (explicitSvc) targetServicesMap.set(explicitSvc.id, explicitSvc);
  }

  const targetServices = Array.from(targetServicesMap.values());

  // Fallback: if service has no manager_user_id, find any active RESPONSABLE linked to that service
  const notifiedManagerIds = new Set<string>();
  let emailsSent = 0;

  for (const svc of targetServices) {
    const managers: Array<{ id: string; full_name: string; email: string }> = [];

    if (svc.manager_user_id) {
      const m = db
        .prepare('SELECT id, full_name, email FROM users WHERE id = ? AND company_id = ? AND is_active = 1')
        .get(svc.manager_user_id, companyId) as { id: string; full_name: string; email: string } | undefined;
      if (m) managers.push(m);
    }

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
      if (notifiedManagerIds.has(head.id)) continue;
      notifiedManagerIds.add(head.id);

      const subject = `[NEXORA] Département ${svc.name} — Courrier ${mail.reference} reçu par l'agent ${agentUser.full_name}`;
      const bodyText = [
        `Bonjour ${head.full_name},`,
        ``,
        `En tant que chef du département "${svc.name}", nous vous informons qu'un courrier vient d'être transmis/affecté à un agent de votre service.`,
        ``,
        `• Référence interne : ${mail.reference}`,
        `• Type : ${mail.direction}`,
        `• Objet : ${mail.subject}`,
        `• Expéditeur : ${mail.sender_name || 'Interne'} ${mail.sender_org ? `(${mail.sender_org})` : ''}`,
        `• Priorité : ${mail.priority}`,
        `• Échéance : ${mail.due_date || 'Non définie'}`,
        `• Agent destinataire : ${agentUser.full_name} (${agentUser.email})`,
        `• Transmis / affecté par : ${assignedByName}`,
        ``,
        `Vous pouvez suivre l'avancement du traitement depuis votre Tableau de bord Responsable dans NEXORA.`,
        ``,
        `— Plateforme NEXORA`,
      ].join('\n');

      await dispatchEmail({
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

      // Also create an in-app notification for the department head
      db.prepare(`
        INSERT INTO notifications (id, company_id, user_id, mail_id, event_type, title, message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId('ntf'),
        companyId,
        head.id,
        mail.id,
        'EMAIL_CHEF_DEPARTEMENT',
        `E-mail envoyé : ${mail.reference} affecté à ${agentUser.full_name}`,
        `Un e-mail d'alerte a été envoyé à ${head.email} suite à la réception du courrier ${mail.reference} par l'agent ${agentUser.full_name} (${svc.name}).`
      );

      emailsSent += 1;
    }
  }

  return emailsSent;
}
