import { useEffect, useState } from 'react';
import { Archive, Download, Printer } from 'lucide-react';
import { apiFetch, downloadAuthenticatedFile } from '../api/client.ts';
import type { AppPage } from '../components/common/AppShell.tsx';
import { StatusLabel } from '../components/common/StatusBadge.tsx';
import type { MailItem } from '../types/nexora.ts';

interface ReportsResponse {
  summary: {
    total: number;
    incoming: number;
    outgoing: number;
    internal: number;
    archived: number;
    treatedRate: number;
    overdue: number;
    avgDays: number;
  };
  byPriority: Array<{ priority: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  byService: Array<{ serviceName: string; total: number; completed: number; overdue: number }>;
  userActivity: Array<{ full_name: string; role: string; totalTasks: number; completedTasks: number }>;
}

export function ReportsPage() {
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    apiFetch<ReportsResponse>(`/api/reports?${params.toString()}`)
      .then(setData)
      .catch(() => {});
  }, [dateFrom, dateTo]);

  if (!data) return <div className="p-8 text-sm text-slate-500">Calcul des statistiques réelles...</div>;

  const maxSvc = Math.max(1, ...data.byService.map((s) => s.total));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Rapports &amp; Statistiques</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Indicateurs calculés à partir des données réelles enregistrées dans NEXORA.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
          />
          <button
            type="button"
            onClick={() => {
              downloadAuthenticatedFile('/api/reports/export.csv', 'nexora-rapport-courriers.csv').catch(() => {});
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Export PDF / Imprimer</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500">Volume total</p>
          <p className="font-mono text-3xl font-bold mt-2 tabular-nums">{data.summary.total}</p>
          <p className="text-xs text-slate-500 mt-1">
            {data.summary.incoming} E · {data.summary.outgoing} S · {data.summary.internal} I
          </p>
        </div>
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500">Taux de traitement</p>
          <p className="font-mono text-3xl font-bold mt-2 tabular-nums">{data.summary.treatedRate} %</p>
          <p className="text-xs text-slate-500 mt-1">{data.summary.archived} archivés</p>
        </div>
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500">Délai moyen de traitement</p>
          <p className="font-mono text-3xl font-bold mt-2 tabular-nums">{data.summary.avgDays} j</p>
          <p className="text-xs text-slate-500 mt-1">Réception à clôture</p>
        </div>
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500">Courriers en retard</p>
          <p className="font-mono text-3xl font-bold mt-2 text-red-600 dark:text-red-400 tabular-nums">{data.summary.overdue}</p>
          <p className="text-xs text-slate-500 mt-1">À relancer</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Custom SVG Bar Chart by Service */}
        <section className="lg:col-span-7 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h2 className="font-display text-base font-bold">Volume et charge par service</h2>
          <div className="space-y-3">
            {data.byService.map((s) => (
              <div key={s.serviceName} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium">{s.serviceName}</span>
                  <span className="font-mono text-slate-500 tabular-nums">
                    {s.total} total · {s.completed} traités · {s.overdue} retard
                  </span>
                </div>
                <svg className="w-full h-3 rounded bg-slate-100 dark:bg-slate-800" aria-hidden="true">
                  <rect width={`${Math.round((s.total / maxSvc) * 100)}%`} height="12" rx="3" className="fill-blue-600" />
                </svg>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-5 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h2 className="font-display text-base font-bold">Activité des utilisateurs</h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            {data.userActivity.map((u) => (
              <div key={u.full_name} className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{u.full_name}</p>
                  <p className="text-slate-500">{u.role}</p>
                </div>
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  {u.completedTasks}/{u.totalTasks} tâches
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function ArchivesPage({ onNavigate }: { onNavigate: (page: AppPage, mailId?: string) => void }) {
  const [mails, setMails] = useState<MailItem[]>([]);
  const [yearFilter, setYearFilter] = useState('ALL');
  const [q, setQ] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ filter: 'archived' });
    if (q.trim()) params.set('q', q.trim());
    apiFetch<{ mails: MailItem[] }>(`/api/mails?${params.toString()}`)
      .then((d) => setMails(d.mails))
      .catch(() => {});
  }, [q]);

  const filtered = mails.filter((m) => yearFilter === 'ALL' || m.received_at.startsWith(yearFilter));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Archives institutionnelles</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Classement des courriers clôturés par année, catégorie, service et référence.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Référence, objet..."
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
          />
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
          >
            <option value="ALL">Toutes années</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <Archive className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            Aucun dossier archivé trouvé.
          </div>
        ) : (
          filtered.map((m) => (
            <div key={m.id} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-bold text-blue-700 dark:text-blue-400">{m.reference}</span>
                  <span>·</span>
                  <span>{m.category}</span>
                  <span>·</span>
                  <StatusLabel status={m.archive_status} />
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate mt-1">{m.subject}</p>
                <p className="text-xs text-slate-500">
                  {m.service_name || 'Secrétariat'} · Archivé le {m.updated_at.slice(0, 10)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('mail-detail', m.id)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium shrink-0"
              >
                Consulter
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
