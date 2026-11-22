import { useEffect, useState } from 'react';
import { FilePlus2, Search } from 'lucide-react';
import { apiFetch } from '../api/client.ts';
import type { AppPage } from '../components/common/AppShell.tsx';
import { PriorityLabel, StatusLabel } from '../components/common/StatusBadge.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import type { MailItem, ServiceItem } from '../types/nexora.ts';

interface MailListPageProps {
  globalSearch: string;
  onNavigate: (page: AppPage, mailId?: string) => void;
}

export function MailListPage({ globalSearch, onNavigate }: MailListPageProps) {
  const { user } = useAuth();
  const [mails, setMails] = useState<MailItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [q, setQ] = useState(globalSearch);
  const [direction, setDirection] = useState('ALL');
  const [quickFilter, setQuickFilter] = useState('ALL');
  const [serviceId, setServiceId] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    setQ(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    apiFetch<{ services: ServiceItem[] }>('/api/services')
      .then((d) => setServices(d.services))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (direction !== 'ALL') params.set('direction', direction);
    if (quickFilter !== 'ALL') params.set('filter', quickFilter);
    if (serviceId !== 'ALL') params.set('serviceId', serviceId);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    apiFetch<{ mails: MailItem[] }>(`/api/mails?${params.toString()}`)
      .then((d) => setMails(d.mails))
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur de chargement'))
      .finally(() => setLoading(false));
  }, [q, direction, quickFilter, serviceId, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Registre des courriers
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Recherche multicritères (référence, objet, expéditeur, texte OCR) filtrée selon vos permissions.
          </p>
        </div>
        {(user?.isSecretariat || user?.role === 'ADMIN' || user?.role === 'RESPONSABLE') && (
          <button
            type="button"
            onClick={() => onNavigate('mail-create')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold hover:bg-slate-800 dark:hover:bg-blue-500 whitespace-nowrap"
          >
            <FilePlus2 className="w-4 h-4" />
            <span>Enregistrer un courrier</span>
          </button>
        )}
      </div>

      {/* Filters Toolbar */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Référence (ARR-2026-...), objet, expéditeur, texte OCR..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {[
              { id: 'ALL', label: 'Tous' },
              { id: 'ENTRANT', label: 'Entrants' },
              { id: 'SORTANT', label: 'Sortants' },
              { id: 'INTERNE', label: 'Internes' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDirection(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  direction === tab.id
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <select
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="urgent">Urgents / Prioritaires</option>
            <option value="overdue">En retard</option>
            <option value="waiting">En attente / Retour Secrétariat</option>
            <option value="archived">Archivés</option>
          </select>

          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <option value="ALL">Tous les services</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <span className="text-slate-500">Du</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
            <span className="text-slate-500">au</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
        </div>
      </div>

      {error && <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>}

      {/* Desktop Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Chargement des courriers...</div>
        ) : mails.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Aucun courrier ne correspond aux critères sélectionnés.</p>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">Référence</th>
                    <th className="py-3 px-4">Type &amp; Objet</th>
                    <th className="py-3 px-4">Correspondant</th>
                    <th className="py-3 px-4">Service / Agent</th>
                    <th className="py-3 px-4">Priorité</th>
                    <th className="py-3 px-4">Statut</th>
                    <th className="py-3 px-4 text-right">Échéance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {mails.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => onNavigate('mail-detail', m.id)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                        {m.reference}
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        <p className="font-medium text-slate-900 dark:text-white truncate">{m.subject}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {m.direction} · {m.category}
                          {m.is_demo === 1 ? ' · Démo' : ''}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 max-w-[180px] truncate">
                        {m.direction === 'SORTANT' ? m.recipient_org || m.recipient_name : m.sender_org || m.sender_name || 'Interne'}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                        <p className="truncate max-w-[160px]">{m.service_name || '—'}</p>
                        {m.assigned_agent_name && (
                          <p className="text-slate-400 truncate max-w-[160px]">{m.assigned_agent_name}</p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <PriorityLabel priority={m.priority} />
                      </td>
                      <td className="py-3 px-4">
                        <StatusLabel status={m.mail_status} />
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {m.due_date || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
              {mails.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onNavigate('mail-detail', m.id)}
                  className="w-full p-4 text-left space-y-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">{m.reference}</span>
                    <StatusLabel status={m.mail_status} />
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{m.subject}</p>
                  <p className="text-xs text-slate-500">
                    {m.direction} · {m.service_name || 'Non affecté'} · {m.due_date || 'Sans échéance'}
                  </p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
