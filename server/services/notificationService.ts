import { db } from '../db/database.ts';
import { newId } from '../utils/crypto.ts';
import { notifyDepartmentHeadOnAgentMailAssignment, notifyUserOnMailAssignment } from './emailService.ts';

export function createNotification(args: {
  companyId: string;
  userId: string;
  mailId?: string | null;
  taskId?: string | null;
  eventType: string;
  title: string;
  message: string;
}): string {
  const id = newId('ntf');
  db.prepare(`
    INSERT INTO notifications (id, company_id, user_id, mail_id, task_id, event_type, title, message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    args.companyId,
    args.userId,
    args.mailId ?? null,
    args.taskId ?? null,
    args.eventType,
    args.title,
    args.message
  );
  return id;
}

export function notifyServiceSecretariat(args: {
  companyId: string;
  mailId: string;
  eventType: string;
  title: string;
  message: string;
}): void {
  const secUsers = db
    .prepare(`
      SELECT DISTINCT u.id
      FROM users u
      JOIN user_services us ON us.user_id = u.id
      JOIN services s ON s.id = us.service_id
      WHERE u.company_id = ? AND u.is_active = 1 AND s.is_secretariat = 1
    `)
    .all(args.companyId) as Array<{ id: string }>;

  for (const u of secUsers) {
    createNotification({
      companyId: args.companyId,
      userId: u.id,
      mailId: args.mailId,
      eventType: args.eventType,
      title: args.title,
      message: args.message,
    });
  }
}

export async function notifyMailAssignedToUser(args: {
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
  targetUserId: string;
  serviceId?: string | null;
  taskId?: string | null;
  assignedById?: string | null;
  assignedByName: string;
  actionRequired?: string;
}): Promise<number> {
  const targetUser = db
    .prepare('SELECT id, full_name, email, role FROM users WHERE id = ? AND company_id = ? AND is_active = 1')
    .get(args.targetUserId, args.companyId) as
    | { id: string; full_name: string; email: string; role: string }
    | undefined;

  if (!targetUser) return 0;

  // Création de la notification in-app
  createNotification({
    companyId: args.companyId,
    userId: targetUser.id,
    mailId: args.mail.id,
    taskId: args.taskId ?? null,
    eventType: 'AFFECTATION_COURRIER',
    title: `Courrier ${args.mail.reference} affecté`,
    message: `Le courrier "${args.mail.subject}" vous a été affecté par ${args.assignedByName}.`,
  });

  let emailsSent = 0;

  // RÈGLE 1 : TOUT utilisateur destinataire (Président, Responsable, Agent, Admin) reçoit un email
  emailsSent += await notifyUserOnMailAssignment({
    companyId: args.companyId,
    mail: args.mail,
    targetUser,
    serviceId: args.serviceId,
    assignedById: args.assignedById,
    assignedByName: args.assignedByName,
    actionRequired: args.actionRequired,
  });

  // RÈGLE 2 : Si le destinataire est un Agent, son Chef de service reçoit également un email d'information.
  // Exception : si l'expéditeur (assignedById) est lui-même son Chef de service, aucun doublon n'est envoyé.
  if (targetUser.role === 'AGENT') {
    emailsSent += await notifyDepartmentHeadOnAgentMailAssignment({
      companyId: args.companyId,
      mail: args.mail,
      agentUser: targetUser,
      serviceId: args.serviceId,
      assignedById: args.assignedById,
      assignedByName: args.assignedByName,
    });
  }

  return emailsSent;
}
