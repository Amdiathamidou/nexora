import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Mail } from 'lucide-react';
import { apiFetch } from '../api/client.ts';
import type { AppPage } from '../components/common/AppShell.tsx';

interface NotificationRow {
  id: string;
  mail_id: string | null;
  event_type: string;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
}

interface EmailRow {
  id: string;
  mail_id: string | null;
  recipient_email: string;
  recipient_name: string;
  department_name: string;
  trigger_event: string;
  subject: string;
  body_text: string;
  delivery_status: string;
  created_at: string;
}

export function NotificationsAndEmailsPage({ onNavigate }: { onNavigate: (page: AppPage, mailId?: string) => void }) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [tab, setTab] = useState<'notifications' | 'emails'>('notifications');

  const loadData = async () => {
    const [nRes, eRes] = await Promise.all([
      apiFetch<{ notifications: NotificationRow[] }>('/api/notifications'),
      apiFetch<{ emails: EmailRow[]; smtpConfigured: boolean }>('/api/emails'),
    ]);
    setNotifications(nRes.notifications);
    setEmails(eRes.emails);
    setSmtpConfigured(eRes.smtpConfigured);
  };

  useEffect(() => {
    loadData().catch(() => {});
  }, []);

  const markRead = async (n: NotificationRow) => {
    await apiFetch(`/api/notifications/${n.id}/read`, { method: 'POST' });
    if (n.mail_id) {
      onNavigate('mail-detail', n.mail_id);
    } else {
      await loadData();
    }
  };

  const markAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    await loadData();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Notifications &amp; Journal des e-mails départementaux
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Alertes internes et e-mails automatiques transmis aux chefs de département dès qu’un agent reçoit un courrier.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('notifications')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md ${
              tab === 'notifications' ? 'bg-white dark:bg-slate-700 shadow-sm' : ''
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Notifications ({notifications.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('emails')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md ${
              tab === 'emails' ? 'bg-white dark:bg-slate-700 shadow-sm' : ''
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>E-mails envoyés ({emails.length})</span>
          </button>
        </div>
      </div>

      {tab === 'notifications' ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Tout marquer comme lu</span>
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">Aucune notification pour le moment.</p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markRead(n)}
                  className={`w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                    n.is_read === 0 ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 text-xs">
                    <span className="font-semibold text-slate-900 dark:text-white">{n.title}</span>
                    <span className="font-mono text-slate-400 shrink-0">{n.created_at.slice(0, 16)}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{n.message}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
            Statut passerelle SMTP :{' '}
            <span className="font-semibold">
              {smtpConfigured
                ? 'Serveur SMTP actif — Envoi réel activé'
                : 'Mode journalisation sécurisée (configurez SMTP_HOST/SMTP_USER/SMTP_PASS dans les secrets pour l’envoi réseau)'}
            </span>
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
            {emails.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">Aucun e-mail enregistré.</p>
            ) : (
              emails.map((e) => (
                <div key={e.id} className="p-5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900 dark:text-white">{e.subject}</span>
                    <span className={`font-mono ${e.delivery_status === 'SENT_SMTP' ? 'text-emerald-700 dark:text-emerald-400' : e.delivery_status === 'FAILED' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {e.delivery_status === 'SENT_SMTP' ? 'Envoyé SMTP' : e.delivery_status === 'FAILED' ? 'Échec SMTP' : 'Consigné'} · {e.created_at.slice(0, 16)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Destinataire : {e.recipient_name} &lt;{e.recipient_email}&gt; {e.department_name ? `· Département : ${e.department_name}` : ''}
                  </p>
                  <pre className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 text-xs font-sans whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                    {e.body_text}
                  </pre>
                  {e.mail_id && (
                    <button
                      type="button"
                      onClick={() => onNavigate('mail-detail', e.mail_id!)}
                      className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                    >
                      Ouvrir le courrier associé
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
