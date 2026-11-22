import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  CheckCircle2,
  Clock,
  FilePlus2,
  Inbox,
  Mail,
  Send,
  Sparkles,
  Stamp,
  ShieldCheck,
  Plus,
} from 'lucide-react';
import type { SignatureDelegationItem } from '../types/nexora.ts';
import { apiFetch } from '../api/client.ts';
import type { AppPage } from '../components/common/AppShell.tsx';
import { PriorityLabel, StatusLabel } from '../components/common/StatusBadge.tsx';
import { useAuth } from '../context/AuthContext.tsx';

interface DashboardData {
  counts: {
    total: number;
    incoming: number;
    outgoing: number;
    internal: number;
    inProgress: number;
    overdue: number;
    archived: number;
    receivedToday: number;
    awaitingOrientation: number;
    returnedSecretariat: number;
    toDispatch: number;
    userCount: number;
    storageMb: number;
  };
  serviceBreakdown: Array<{ id: string; name: string; mailCount: number; overdueCount: number }>;
  recentAudit: Array<{ id: string; user_name: string; action: string; context: string; created_at: string }>;
  recentEmails: Array<{
    id: string;
    mail_id: string | null;
    recipient_email: string;
    recipient_name: string;
    department_name: string;
    subject: string;
    delivery_status: string;
    created_at: string;
  }>;
  presidentPending: Array<{
    id: string;
    reference: string;
    subject: string;
    sender_org: string;
    priority: string;
    step_name: string;
    step_due_at: string;
  }>;
  presidentDecisions: Array<{
    id: string;
    mail_id: string;
    reference: string;
    subject: string;
    decision: string;
    observations: string;
    decided_at: string;
  }>;
  myTasks: Array<{
    id: string;
    mail_id: string;
    mail_reference: string;
    mail_subject: string;
    title: string;
    priority: string;
    status: string;
    due_date: string;
    service_name: string | null;
  }>;
  responsableMails: Array<{
    id: string;
    reference: string;
    subject: string;
    priority: string;
    mail_status: string;
    assigned_agent_name: string | null;
    due_date: string;
  }>;
  secretariatQueues: {
    awaitingOrientation: Array<{ id: string; reference: string; subject: string; sender_org: string; priority: string }>;
    returnedForControl: Array<{ id: string; reference: string; subject: string; shipping_status: string; priority: string }>;
    readyToArchive: Array<{ id: string; reference: string; subject: string; direction: string }>;
  };
}

interface RoleDashboardProps {
  mode: 'role' | 'secretariat';
  onNavigate: (page: AppPage, mailId?: string) => void;
}

export function RoleDashboardPage({ mode, onNavigate }: RoleDashboardProps) {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Delegations state
  const [delegations, setDelegations] = useState<SignatureDelegationItem[]>([]);
  const [authorizedPendingMails, setAuthorizedPendingMails] = useState<Array<Record<string, unknown>>>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [delLoading, setDelLoading] = useState(false);
  const [companyUsers, setCompanyUsers] = useState<Array<{ id: string; full_name: string; job_title: string; role: string }>>([]);

  // Form state
  const [formDelegateUserId, setFormDelegateUserId] = useState('');
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [formEndDate, setFormEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [formDirections, setFormDirections] = useState<('ENTRANT' | 'SORTANT' | 'INTERNE')[]>(['SORTANT', 'INTERNE', 'ENTRANT']);
  const [formCategories, setFormCategories] = useState<string>('');
  const [formRestrictions, setFormRestrictions] = useState('');
  const [formConfirmPresident, setFormConfirmPresident] = useState(false);

  const loadDelegationsData = () => {
    setDelLoading(true);
    apiFetch<{ delegations: SignatureDelegationItem[]; authorizedPendingMails: Array<Record<string, unknown>> }>('/api/signature-delegations')
      .then((res) => {
        setDelegations(res.delegations || []);
        setAuthorizedPendingMails(res.authorizedPendingMails || []);
      })
      .catch(() => {})
      .finally(() => setDelLoading(false));
  };

  useEffect(() => {
    loadDelegationsData();
    if (user?.role === 'PRESIDENT') {
      apiFetch<{ users: Array<{ id: string; full_name: string; job_title: string; role: string; is_active: number }> }>('/api/users')
        .then((res) => {
          setCompanyUsers(res.users.filter((u) => u.id !== user.id && u.is_active));
        })
        .catch(() => {});
    }
  }, [user?.role]);

  const handleCreateDelegation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDelegateUserId) {
      alert('Veuillez sélectionner un bénéficiaire.');
      return;
    }
    if (!formConfirmPresident) {
      alert('Veuillez confirmer explicitement la délégation en cochant la case d’approbation présidentielle.');
      return;
    }
    try {
      await apiFetch('/api/signature-delegations', {
        method: 'POST',
        body: JSON.stringify({
          delegateUserId: formDelegateUserId,
          startDate: formStartDate,
          endDate: formEndDate,
          allowedDirections: formDirections,
          allowedCategories: formCategories
            ? formCategories.split(',').map((c) => c.trim()).filter(Boolean)
            : [],
          restrictions: formRestrictions,
          confirmByPresident: formConfirmPresident,
        }),
      });
      setShowCreateModal(false);
      setFormConfirmPresident(false);
      setFormRestrictions('');
      loadDelegationsData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la création de la délégation.');
    }
  };

  const handleRevoke = async (id: string) => {
    const reason = prompt('Motif de la révocation de cette délégation de signature :');
    if (reason === null) return;
    try {
      await apiFetch(`/api/signature-delegations/${id}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      loadDelegationsData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur de révocation');
    }
  };

  const handleSuspend = async (id: string) => {
    if (!confirm('Confirmez-vous la suspension temporaire de cette délégation ?')) return;
    try {
      await apiFetch(`/api/signature-delegations/${id}/suspend`, { method: 'POST' });
      loadDelegationsData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur de suspension');
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      await apiFetch(`/api/signature-delegations/${id}/reactivate`, { method: 'POST' });
      loadDelegationsData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur de réactivation');
    }
  };

  useEffect(() => {
    setLoading(true);
    apiFetch<DashboardData>('/api/dashboard')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur de chargement'))
      .finally(() => setLoading(false));
  }, [mode]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data || !user) {
    return <div className="p-6 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">{error || 'Données indisponibles'}</div>;
  }

  // ==================== ESPACE OPÉRATIONNEL DU SECRÉTARIAT ====================
  if (mode === 'secretariat') {
    return (
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Espace opérationnel du Secrétariat
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Réception, numérisation IA, orientation et contrôle final obligatoire avant expédition ou archivage.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('mail-create')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4" />
              <span>Importer PDF / Analyse IA</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Reçus aujourd’hui" value={data.counts.receivedToday} sub="Nouveaux courriers" />
          <KpiCard label="En attente d’orientation" value={data.counts.awaitingOrientation} sub="À affecter" />
          <KpiCard label="Retournés (Contrôle final)" value={data.counts.returnedSecretariat} sub="Retour obligatoire" />
          <KpiCard label="À expédier / Clôturer" value={data.counts.toDispatch} sub="Expédition & archive" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold">Courriers à orienter</h2>
              <span className="font-mono text-xs text-slate-500 tabular-nums">{data.secretariatQueues.awaitingOrientation.length}</span>
            </div>
            {data.secretariatQueues.awaitingOrientation.length === 0 ? (
              <p className="text-sm text-slate-500 py-6">Tous les courriers enregistrés ont été orientés.</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.secretariatQueues.awaitingOrientation.map((m) => (
                  <div key={m.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">{m.reference}</p>
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{m.subject}</p>
                      <p className="text-xs text-slate-500 truncate">{m.sender_org || 'Expéditeur externe'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('mail-detail', m.id)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      Orienter
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold">Dossiers retournés pour contrôle final</h2>
              <span className="font-mono text-xs text-slate-500 tabular-nums">{data.secretariatQueues.returnedForControl.length}</span>
            </div>
            {data.secretariatQueues.returnedForControl.length === 0 ? (
              <p className="text-sm text-slate-500 py-6">Aucun dossier en attente de contrôle final.</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.secretariatQueues.returnedForControl.map((m) => (
                  <div key={m.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-indigo-700 dark:text-indigo-400">{m.reference}</span>
                        <span aria-hidden="true">·</span>
                        <StatusLabel status={m.shipping_status} />
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate mt-0.5">{m.subject}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('mail-detail', m.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium whitespace-nowrap shrink-0"
                    >
                      Contrôler &amp; Clôturer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Section Exécutive : Registre des Délégations de Signature Présidentielle */}
        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <Stamp className="w-5 h-5 text-emerald-600" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Registre des Délégations de Signature Présidentielle
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Gérez les mandats accordés aux collaborateurs de confiance pour signer en votre nom durant vos absences ou déplacements.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Déléguer ma signature</span>
            </button>
          </div>

          <div className="text-xs p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300">
            <strong>Règle d’inviolabilité :</strong> Seul le Président en personne dispose du pouvoir d’accorder, suspendre ou révoquer une délégation de signature. L’administrateur système ne peut ni s’octroyer cette signature ni modifier vos délégations.
          </div>

          {delLoading ? (
            <div className="py-6 text-center text-xs text-slate-500">Chargement des délégations...</div>
          ) : delegations.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              <ShieldCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              Aucune délégation de signature enregistrée pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Bénéficiaire mandaté</th>
                    <th className="py-2.5 px-3">Période de validité</th>
                    <th className="py-2.5 px-3">Périmètre / Directions</th>
                    <th className="py-2.5 px-3">Catégories &amp; Restrictions</th>
                    <th className="py-2.5 px-3">Statut</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {delegations.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-3">
                        <p className="font-semibold text-slate-900 dark:text-white">{d.delegateName}</p>
                        <p className="text-[11px] text-slate-500">{d.delegateJobTitle} ({d.delegateRole})</p>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        Du <span className="font-medium text-slate-800 dark:text-slate-200">{d.startDate}</span> au{' '}
                        <span className="font-medium text-slate-800 dark:text-slate-200">{d.endDate}</span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {d.allowedDirections.map((dir) => (
                            <span key={dir} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono">
                              {dir}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3 max-w-xs">
                        {d.allowedCategories.length > 0 ? (
                          <p className="truncate text-slate-700 dark:text-slate-300">
                            Catégories : {d.allowedCategories.join(', ')}
                          </p>
                        ) : (
                          <p className="text-slate-400">Toutes catégories</p>
                        )}
                        {d.restrictions && (
                          <p className="text-amber-700 dark:text-amber-400 truncate mt-0.5">
                            Restr. : {d.restrictions}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            d.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                              : d.status === 'SUSPENDUE'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                              : d.status === 'REVOQUEE'
                              ? 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {d.status === 'ACTIVE' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSuspend(d.id)}
                                className="px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 text-[11px] font-medium"
                                title="Suspendre temporairement"
                              >
                                Suspendre
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRevoke(d.id)}
                                className="px-2 py-1 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 text-[11px] font-medium"
                                title="Révoquer définitivement"
                              >
                                Révoquer
                              </button>
                            </>
                          )}
                          {d.status === 'SUSPENDUE' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleReactivate(d.id)}
                                className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-[11px] font-medium"
                              >
                                Réactiver
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRevoke(d.id)}
                                className="px-2 py-1 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 text-[11px] font-medium"
                              >
                                Révoquer
                              </button>
                            </>
                          )}
                          {(d.status === 'REVOQUEE' || d.status === 'EXPIREE') && (
                            <span className="text-[11px] text-slate-400 italic">Inactif</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Modal de création de délégation */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Stamp className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Déléguer ma signature présidentielle
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleCreateDelegation} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Bénéficiaire de la délégation (ex: Secrétaire de direction) *
                  </label>
                  <select
                    value={formDelegateUserId}
                    onChange={(e) => setFormDelegateUserId(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="">-- Choisir un collaborateur --</option>
                    {companyUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} — {u.job_title} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Date de début *
                    </label>
                    <input
                      type="date"
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      required
                      className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Date d'expiration *
                    </label>
                    <input
                      type="date"
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      required
                      className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Types de courriers autorisés
                  </label>
                  <div className="flex gap-4">
                    {(['SORTANT', 'INTERNE', 'ENTRANT'] as const).map((dir) => (
                      <label key={dir} className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={formDirections.includes(dir)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormDirections([...formDirections, dir]);
                            } else {
                              setFormDirections(formDirections.filter((d) => d !== dir));
                            }
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        {dir}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Catégories de documents autorisées (séparées par virgules, vide = toutes)
                  </label>
                  <input
                    type="text"
                    value={formCategories}
                    onChange={(e) => setFormCategories(e.target.value)}
                    placeholder="Ex: Facture, Ordre de mission, Demande administrative"
                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Restrictions complémentaires éventuelles
                  </label>
                  <input
                    type="text"
                    value={formRestrictions}
                    onChange={(e) => setFormRestrictions(e.target.value)}
                    placeholder="Ex: Montant maximum 1 000 000 FCFA, hors conventions stratégiques"
                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formConfirmPresident}
                      onChange={(e) => setFormConfirmPresident(e.target.checked)}
                      required
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-[11px] font-medium text-emerald-950 dark:text-emerald-200">
                      <strong>Confirmation formelle du Président :</strong> J'accorde expressément à ce collaborateur l'autorisation de signer les courriers et actes administratifs définis dans les limites strictes de ce mandat.
                    </span>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-medium hover:bg-slate-100"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={!formConfirmPresident}
                    className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold"
                  >
                    Valider la délégation
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== DASHBOARD PRÉSIDENT (EXÉCUTIF & DÉCISIONNEL) ====================
  if (user.role === 'PRESIDENT') {
    return (
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.fullName}
                className="w-14 h-14 rounded-full object-cover border-2 border-slate-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-base font-bold text-slate-600 dark:text-slate-300 shrink-0">
                {user.fullName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                Cabinet de la Présidence — Vue Décisionnelle
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {user.fullName} ({user.jobTitle}) · Dossiers requérant votre arbitrage ou signature présidentielle.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors whitespace-nowrap"
            >
              <Stamp className="w-4 h-4" />
              <span>Déléguer ma signature</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Rapports stratégiques
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="En attente de décision" value={data.presidentPending.length} sub="Intervention requise" />
          <KpiCard label="Dossiers en retard" value={data.counts.overdue} sub="Échéance dépassée" tone={data.counts.overdue > 0 ? 'danger' : 'neutral'} />
          <KpiCard label="Total courriers actifs" value={data.counts.inProgress} sub="Sur l’organisation" />
          <KpiCard label="Archivés" value={data.counts.archived} sub="Dossiers clôturés" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
            <h2 className="font-display text-base font-semibold mb-4">Dossiers soumis à la validation du Président</h2>
            {data.presidentPending.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                Aucun dossier n’attend votre validation actuellement.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.presidentPending.map((m) => (
                  <div key={m.id} className="py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">{m.reference}</span>
                        <span aria-hidden="true">·</span>
                        <PriorityLabel priority={m.priority} />
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-500 truncate">{m.sender_org}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate mt-1">{m.subject}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{m.step_name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('mail-detail', m.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      <span>Examiner &amp; Décider</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="lg:col-span-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
            <h2 className="font-display text-base font-semibold mb-4">Répartition par service</h2>
            <div className="space-y-3">
              {data.serviceBreakdown.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300 truncate">{s.name}</span>
                  <div className="flex items-center gap-3 font-mono text-xs tabular-nums shrink-0">
                    <span className="font-semibold text-slate-900 dark:text-white">{s.mailCount}</span>
                    {s.overdueCount > 0 && (
                      <span className="text-red-600 dark:text-red-400">{s.overdueCount} retard</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <h3 className="font-display text-sm font-semibold mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 mb-3">
              Dernières décisions présidentielles
            </h3>
            {data.presidentDecisions.length === 0 ? (
              <p className="text-xs text-slate-500">Aucune décision enregistrée récemment.</p>
            ) : (
              <div className="space-y-2.5">
                {data.presidentDecisions.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onNavigate('mail-detail', d.mail_id)}
                    className="w-full text-left text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex justify-between font-mono">
                      <span className="font-semibold text-blue-700 dark:text-blue-400">{d.reference}</span>
                      <span className="text-slate-500">{d.decision}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 truncate mt-1">{d.subject}</p>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Section Exécutive : Registre des Délégations de Signature Présidentielle */}
        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <Stamp className="w-5 h-5 text-emerald-600" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Registre des Délégations de Signature Présidentielle
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Gérez les mandats accordés aux collaborateurs de confiance pour signer en votre nom durant vos absences ou déplacements.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Déléguer ma signature</span>
            </button>
          </div>

          <div className="text-xs p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300">
            <strong>Règle d’inviolabilité :</strong> Seul le Président en personne dispose du pouvoir d’accorder, suspendre ou révoquer une délégation de signature. L’administrateur système ne peut ni s’octroyer cette signature ni modifier vos délégations.
          </div>

          {delLoading ? (
            <div className="py-6 text-center text-xs text-slate-500">Chargement des délégations...</div>
          ) : delegations.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              <ShieldCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              Aucune délégation de signature enregistrée pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Bénéficiaire mandaté</th>
                    <th className="py-2.5 px-3">Période de validité</th>
                    <th className="py-2.5 px-3">Périmètre / Directions</th>
                    <th className="py-2.5 px-3">Catégories &amp; Restrictions</th>
                    <th className="py-2.5 px-3">Statut</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {delegations.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-3">
                        <p className="font-semibold text-slate-900 dark:text-white">{d.delegateName}</p>
                        <p className="text-[11px] text-slate-500">{d.delegateJobTitle} ({d.delegateRole})</p>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        Du <span className="font-medium text-slate-800 dark:text-slate-200">{d.startDate}</span> au{' '}
                        <span className="font-medium text-slate-800 dark:text-slate-200">{d.endDate}</span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {d.allowedDirections.map((dir) => (
                            <span key={dir} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono">
                              {dir}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3 max-w-xs">
                        {d.allowedCategories.length > 0 ? (
                          <p className="truncate text-slate-700 dark:text-slate-300">
                            Catégories : {d.allowedCategories.join(', ')}
                          </p>
                        ) : (
                          <p className="text-slate-400">Toutes catégories</p>
                        )}
                        {d.restrictions && (
                          <p className="text-amber-700 dark:text-amber-400 truncate mt-0.5">
                            Restr. : {d.restrictions}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            d.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                              : d.status === 'SUSPENDUE'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                              : d.status === 'REVOQUEE'
                              ? 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {d.status === 'ACTIVE' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSuspend(d.id)}
                                className="px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 text-[11px] font-medium"
                                title="Suspendre temporairement"
                              >
                                Suspendre
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRevoke(d.id)}
                                className="px-2 py-1 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 text-[11px] font-medium"
                                title="Révoquer définitivement"
                              >
                                Révoquer
                              </button>
                            </>
                          )}
                          {d.status === 'SUSPENDUE' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleReactivate(d.id)}
                                className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-[11px] font-medium"
                              >
                                Réactiver
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRevoke(d.id)}
                                className="px-2 py-1 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 text-[11px] font-medium"
                              >
                                Révoquer
                              </button>
                            </>
                          )}
                          {(d.status === 'REVOQUEE' || d.status === 'EXPIREE') && (
                            <span className="text-[11px] text-slate-400 italic">Inactif</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Modal de création de délégation */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Stamp className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Déléguer ma signature présidentielle
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleCreateDelegation} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Bénéficiaire de la délégation (ex: Secrétaire de direction) *
                  </label>
                  <select
                    value={formDelegateUserId}
                    onChange={(e) => setFormDelegateUserId(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="">-- Choisir un collaborateur --</option>
                    {companyUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} — {u.job_title} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Date de début *
                    </label>
                    <input
                      type="date"
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      required
                      className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Date d'expiration *
                    </label>
                    <input
                      type="date"
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      required
                      className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Types de courriers autorisés
                  </label>
                  <div className="flex gap-4">
                    {(['SORTANT', 'INTERNE', 'ENTRANT'] as const).map((dir) => (
                      <label key={dir} className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={formDirections.includes(dir)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormDirections([...formDirections, dir]);
                            } else {
                              setFormDirections(formDirections.filter((d) => d !== dir));
                            }
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        {dir}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Catégories de documents autorisées (séparées par virgules, vide = toutes)
                  </label>
                  <input
                    type="text"
                    value={formCategories}
                    onChange={(e) => setFormCategories(e.target.value)}
                    placeholder="Ex: Facture, Ordre de mission, Demande administrative"
                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Restrictions complémentaires éventuelles
                  </label>
                  <input
                    type="text"
                    value={formRestrictions}
                    onChange={(e) => setFormRestrictions(e.target.value)}
                    placeholder="Ex: Montant maximum 1 000 000 FCFA, hors conventions stratégiques"
                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formConfirmPresident}
                      onChange={(e) => setFormConfirmPresident(e.target.checked)}
                      required
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-[11px] font-medium text-emerald-950 dark:text-emerald-200">
                      <strong>Confirmation formelle du Président :</strong> J'accorde expressément à ce collaborateur l'autorisation de signer les courriers et actes administratifs définis dans les limites strictes de ce mandat.
                    </span>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-medium hover:bg-slate-100"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={!formConfirmPresident}
                    className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold"
                  >
                    Valider la délégation
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== DASHBOARD RESPONSABLE ====================
  if (user.role === 'RESPONSABLE') {
    const toAssign = data.responsableMails.filter((m) => !m.assigned_agent_name).length;
    return (
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Pilotage de Service — Responsable
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Affectez les courriers à vos agents (un e-mail d’alerte départemental est généré automatiquement à chaque affectation).
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('mails')}
            className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold whitespace-nowrap"
          >
            Tous les courriers
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Courriers du service" value={data.responsableMails.length} sub="Actifs dans votre service" />
          <KpiCard label="À affecter" value={toAssign} sub="Sans agent assigné" />
          <KpiCard label="Mes tâches de contrôle" value={data.myTasks.length} sub="Validations en attente" />
          <KpiCard label="E-mails département envoyés" value={data.recentEmails.length} sub="Alertes affectation agents" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
            <h2 className="font-display text-base font-semibold mb-4">Dossiers de votre service</h2>
            {data.responsableMails.length === 0 ? (
              <p className="text-sm text-slate-500 py-6">Aucun courrier actif dans votre service.</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.responsableMails.map((m) => (
                  <div key={m.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">{m.reference}</span>
                        <span aria-hidden="true">·</span>
                        <StatusLabel status={m.mail_status} />
                        <span aria-hidden="true">·</span>
                        <PriorityLabel priority={m.priority} />
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate mt-1">{m.subject}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Agent : {m.assigned_agent_name || 'À affecter'} {m.due_date ? `· Échéance ${m.due_date}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('mail-detail', m.id)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      Ouvrir
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="lg:col-span-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
            <h2 className="font-display text-base font-semibold mb-4">E-mails automatiques reçus (Agents)</h2>
            {data.recentEmails.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun e-mail départemental journalisé.</p>
            ) : (
              <div className="space-y-3">
                {data.recentEmails.map((eml) => (
                  <div key={eml.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs">
                    <p className="font-semibold text-slate-900 dark:text-white">{eml.subject}</p>
                    <p className="text-slate-500 mt-1">
                      À : {eml.recipient_name} ({eml.recipient_email}) · {eml.created_at.slice(0, 16)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Section Exécutive : Registre des Délégations de Signature Présidentielle */}
        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <Stamp className="w-5 h-5 text-emerald-600" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Registre des Délégations de Signature Présidentielle
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Gérez les mandats accordés aux collaborateurs de confiance pour signer en votre nom durant vos absences ou déplacements.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Déléguer ma signature</span>
            </button>
          </div>

          <div className="text-xs p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300">
            <strong>Règle d’inviolabilité :</strong> Seul le Président en personne dispose du pouvoir d’accorder, suspendre ou révoquer une délégation de signature. L’administrateur système ne peut ni s’octroyer cette signature ni modifier vos délégations.
          </div>

          {delLoading ? (
            <div className="py-6 text-center text-xs text-slate-500">Chargement des délégations...</div>
          ) : delegations.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              <ShieldCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              Aucune délégation de signature enregistrée pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Bénéficiaire mandaté</th>
                    <th className="py-2.5 px-3">Période de validité</th>
                    <th className="py-2.5 px-3">Périmètre / Directions</th>
                    <th className="py-2.5 px-3">Catégories &amp; Restrictions</th>
                    <th className="py-2.5 px-3">Statut</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {delegations.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-3">
                        <p className="font-semibold text-slate-900 dark:text-white">{d.delegateName}</p>
                        <p className="text-[11px] text-slate-500">{d.delegateJobTitle} ({d.delegateRole})</p>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        Du <span className="font-medium text-slate-800 dark:text-slate-200">{d.startDate}</span> au{' '}
                        <span className="font-medium text-slate-800 dark:text-slate-200">{d.endDate}</span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {d.allowedDirections.map((dir) => (
                            <span key={dir} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono">
                              {dir}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3 max-w-xs">
                        {d.allowedCategories.length > 0 ? (
                          <p className="truncate text-slate-700 dark:text-slate-300">
                            Catégories : {d.allowedCategories.join(', ')}
                          </p>
                        ) : (
                          <p className="text-slate-400">Toutes catégories</p>
                        )}
                        {d.restrictions && (
                          <p className="text-amber-700 dark:text-amber-400 truncate mt-0.5">
                            Restr. : {d.restrictions}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            d.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                              : d.status === 'SUSPENDUE'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                              : d.status === 'REVOQUEE'
                              ? 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {d.status === 'ACTIVE' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSuspend(d.id)}
                                className="px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 text-[11px] font-medium"
                                title="Suspendre temporairement"
                              >
                                Suspendre
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRevoke(d.id)}
                                className="px-2 py-1 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 text-[11px] font-medium"
                                title="Révoquer définitivement"
                              >
                                Révoquer
                              </button>
                            </>
                          )}
                          {d.status === 'SUSPENDUE' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleReactivate(d.id)}
                                className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-[11px] font-medium"
                              >
                                Réactiver
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRevoke(d.id)}
                                className="px-2 py-1 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 text-[11px] font-medium"
                              >
                                Révoquer
                              </button>
                            </>
                          )}
                          {(d.status === 'REVOQUEE' || d.status === 'EXPIREE') && (
                            <span className="text-[11px] text-slate-400 italic">Inactif</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Modal de création de délégation */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Stamp className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Déléguer ma signature présidentielle
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleCreateDelegation} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Bénéficiaire de la délégation (ex: Secrétaire de direction) *
                  </label>
                  <select
                    value={formDelegateUserId}
                    onChange={(e) => setFormDelegateUserId(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="">-- Choisir un collaborateur --</option>
                    {companyUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} — {u.job_title} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Date de début *
                    </label>
                    <input
                      type="date"
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      required
                      className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Date d'expiration *
                    </label>
                    <input
                      type="date"
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      required
                      className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Types de courriers autorisés
                  </label>
                  <div className="flex gap-4">
                    {(['SORTANT', 'INTERNE', 'ENTRANT'] as const).map((dir) => (
                      <label key={dir} className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={formDirections.includes(dir)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormDirections([...formDirections, dir]);
                            } else {
                              setFormDirections(formDirections.filter((d) => d !== dir));
                            }
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        {dir}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Catégories de documents autorisées (séparées par virgules, vide = toutes)
                  </label>
                  <input
                    type="text"
                    value={formCategories}
                    onChange={(e) => setFormCategories(e.target.value)}
                    placeholder="Ex: Facture, Ordre de mission, Demande administrative"
                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Restrictions complémentaires éventuelles
                  </label>
                  <input
                    type="text"
                    value={formRestrictions}
                    onChange={(e) => setFormRestrictions(e.target.value)}
                    placeholder="Ex: Montant maximum 1 000 000 FCFA, hors conventions stratégiques"
                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formConfirmPresident}
                      onChange={(e) => setFormConfirmPresident(e.target.checked)}
                      required
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-[11px] font-medium text-emerald-950 dark:text-emerald-200">
                      <strong>Confirmation formelle du Président :</strong> J'accorde expressément à ce collaborateur l'autorisation de signer les courriers et actes administratifs définis dans les limites strictes de ce mandat.
                    </span>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-medium hover:bg-slate-100"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={!formConfirmPresident}
                    className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold"
                  >
                    Valider la délégation
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== DASHBOARD AGENT ====================
  if (user.role === 'AGENT' && !user.isSecretariat) {
    const toCorrect = data.myTasks.filter((t) => t.status === 'A_CORRIGER').length;
    const urgent = data.myTasks.filter((t) => t.priority === 'URGENTE' || t.priority === 'HAUTE').length;
    return (
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Mon Espace de Traitement — Agent
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Consultez vos dossiers affectés, rédigez vos projets de réponse et transmettez-les à votre Responsable.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('tasks')}
            className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold whitespace-nowrap"
          >
            Toutes mes tâches
          </button>
        </div>

        {/* Section Bénéficiaire de Délégation de Signature Présidentielle */}
        {delegations.length > 0 && (
          <section className="p-5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 space-y-3">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-display text-sm font-bold">
              <Stamp className="w-4 h-4 text-amber-700 dark:text-amber-400" />
              <span>Délégation de signature présidentielle reçue ({delegations.filter((d) => d.status === 'ACTIVE').length} active(s))</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {delegations.map((d) => (
                <div key={d.id} className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-amber-200 dark:border-amber-800 space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>Mandaté par : {d.delegatorName} (Président)</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${d.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{d.status}</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">Validité : du {d.startDate} au {d.endDate}</p>
                  <p className="text-slate-600 dark:text-slate-400">Directions : {d.allowedDirections.join(', ')}</p>
                  {d.allowedCategories.length > 0 && <p className="text-slate-600 dark:text-slate-400">Catégories : {d.allowedCategories.join(', ')}</p>}
                  {d.restrictions && <p className="text-amber-700 dark:text-amber-300">Restrictions : {d.restrictions}</p>}
                </div>
              ))}
            </div>

            {authorizedPendingMails.length > 0 && (
              <div className="pt-2 border-t border-amber-200 dark:border-amber-800">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">Courriers en attente de visa sous votre délégation ({authorizedPendingMails.length}) :</p>
                <div className="space-y-1.5">
                  {authorizedPendingMails.map((pm: any) => (
                    <div key={pm.id} className="flex items-center justify-between p-2 rounded bg-white dark:bg-slate-900 text-xs">
                      <div>
                        <span className="font-mono font-bold text-blue-700">{pm.reference}</span> — <span className="font-medium">{pm.subject}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate('mail-detail', pm.id)}
                        className="px-2.5 py-1 rounded bg-amber-600 text-white font-semibold text-[11px]"
                      >
                        Signer pour ordre
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Mes tâches actives" value={data.myTasks.length} sub="À traiter ou en cours" />
          <KpiCard label="Tâches prioritaires" value={urgent} sub="Haute ou urgente" />
          <KpiCard label="Travaux à corriger" value={toCorrect} sub="Retours Responsable" tone={toCorrect > 0 ? 'danger' : 'neutral'} />
          <KpiCard label="Courriers accessibles" value={data.counts.inProgress} sub="Dans le périmètre" />
        </div>

        <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="font-display text-base font-semibold mb-4">Mes courriers et tâches en cours</h2>
          {data.myTasks.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">Aucune tâche affectée pour le moment.</p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.myTasks.map((t) => (
                <div key={t.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">{t.mail_reference}</span>
                      <span aria-hidden="true">·</span>
                      <StatusLabel status={t.status} />
                      <span aria-hidden="true">·</span>
                      <PriorityLabel priority={t.priority} />
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate mt-1">{t.mail_subject}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{t.title} {t.due_date ? `· Échéance ${t.due_date}` : ''}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('mail-detail', t.mail_id)}
                    className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    Traiter
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  // ==================== DASHBOARD ADMIN (OR SECRETARIAT DEFAULT) ====================
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Tableau de bord — Vue générale
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Activité globale des courriers, circuits administratifs, services et traçabilité.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user.isSecretariat && (
            <button
              type="button"
              onClick={() => onNavigate('secretariat')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Inbox className="w-4 h-4" />
              <span>Espace Secrétariat</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('mail-create')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold hover:bg-slate-800 dark:hover:bg-blue-500 whitespace-nowrap"
          >
            <FilePlus2 className="w-4 h-4" />
            <span>Nouveau courrier / IA</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total courriers" value={data.counts.total} sub={`${data.counts.incoming} entrants · ${data.counts.outgoing} sortants · ${data.counts.internal} internes`} />
        <KpiCard label="En cours de traitement" value={data.counts.inProgress} sub={`${data.counts.returnedSecretariat} en retour Secrétariat`} />
        <KpiCard label="Courriers en retard" value={data.counts.overdue} sub="Échéance dépassée" tone={data.counts.overdue > 0 ? 'danger' : 'neutral'} />
        <KpiCard label="Archivés & Stockage" value={data.counts.archived} sub={`${data.counts.storageMb} Mo · ${data.counts.userCount} utilisateurs`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="font-display text-base font-semibold mb-4">Activité des services</h2>
          <div className="space-y-3">
            {data.serviceBreakdown.map((s) => {
              const pct = data.counts.total > 0 ? Math.min(100, Math.round((s.mailCount / data.counts.total) * 100)) : 0;
              return (
                <div key={s.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{s.name}</span>
                    <span className="font-mono text-xs text-slate-500 tabular-nums">
                      {s.mailCount} dossiers {s.overdueCount > 0 ? `(${s.overdueCount} retard)` : ''}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.max(pct, s.mailCount > 0 ? 6 : 0)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="lg:col-span-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-semibold">Derniers e-mails chefs de département &amp; Activité</h2>
            <button
              type="button"
              onClick={() => onNavigate('notifications')}
              className="text-xs font-medium text-blue-700 dark:text-blue-400"
            >
              Voir tout
            </button>
          </div>
          <div className="space-y-3">
            {data.recentEmails.slice(0, 3).map((e) => (
              <div key={e.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white truncate">{e.subject}</span>
                  <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 shrink-0">
                    {e.delivery_status === 'SENT_SMTP' ? 'Envoyé SMTP' : 'Consigné'}
                  </span>
                </div>
                <p className="text-slate-500 mt-1">
                  Chef département : {e.recipient_name} ({e.recipient_email})
                </p>
              </div>
            ))}

            {data.recentAudit.slice(0, 4).map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 py-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{a.user_name}</span>
                  <span className="text-slate-500"> · {a.action}</span>
                  {a.context && <p className="text-slate-500 truncate mt-0.5">{a.context}</p>}
                </div>
                <span className="font-mono text-[11px] text-slate-400 shrink-0">{a.created_at.slice(11, 16)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  sub: string;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p
        className={`font-mono text-3xl font-bold mt-2 tabular-nums ${
          tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{sub}</p>
    </div>
  );
}
