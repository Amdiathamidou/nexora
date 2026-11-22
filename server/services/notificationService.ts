import { db } from '../db/database.ts';
import { newId } from '../utils/crypto.ts';
import { notifyDepartmentHeadOnAgentMailAssignment } from './emailService.ts';

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
  assignedByName: string;
}): Promise<number> {
  const targetUser = db
    .prepare('SELECT id, full_name, email, role FROM users WHERE id = ? AND company_id = ? AND is_active = 1')
    .get(args.targetUserId, args.companyId) as
    | { id: string; full_name: string; email: string; role: string }
    | undefined;

  if (!targetUser) return 0;

  createNotification({
    companyId: args.companyId,
    userId: targetUser.id,
    mailId: args.mail.id,
    taskId: args.taskId ?? null,
    eventType: 'AFFECTATION_COURRIER',
    title: `Courrier ${args.mail.reference} affecté`,
    message: `Le courrier "${args.mail.subject}" vous a été affecté par ${args.assignedByName}.`,
  });

  // CRITICAL BUSINESS RULE: Whenever an Agent receives a mail, the head of their department receives an email!
  if (targetUser.role === 'AGENT') {
    return await notifyDepartmentHeadOnAgentMailAssignment({
      companyId: args.companyId,
      mail: args.mail,
      agentUser: targetUser,
      serviceId: args.serviceId,
      assignedByName: args.assignedByName,
    });
  }

  return 0;
}
