import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, GitBranch, Plus, Send } from 'lucide-react';
import { apiFetch } from '../api/client.ts';
import type { AppPage } from '../components/common/AppShell.tsx';
import { PriorityLabel, StatusLabel } from '../components/common/StatusBadge.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import type { CircuitItem, CircuitStepConfig, MailDirection, ServiceItem } from '../types/nexora.ts';

export function WorkflowsPage() {
  const { user } = useAuth();
  const [circuits, setCircuits] = useState<CircuitItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [newCircuit, setNewCircuit] = useState<{
    name: string;
    description: string;
    category: string;
    mailDirection: MailDirection;
    includePresident: boolean;
    parallelStep: boolean;
    targetServiceId: string;
  }>({
    name: '',
    description: '',
    category: 'Administration générale',
    mailDirection: 'ENTRANT',
    includePresident: false,
    parallelStep: false,
    targetServiceId: '',
  });

  const loadData = useCallback(async () => {
    try {
      const [cRes, sRes] = await Promise.all([
        apiFetch<{ circuits: CircuitItem[] }>('/api/circuits'),
        apiFetch<{ services: ServiceItem[] }>('/api/services'),
      ]);
      setCircuits(cRes.circuits);
      setServices(sRes.services);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement');
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateCircuit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFeedback('');
    const secId = services.find((s) => s.is_secretariat === 1)?.id || null;
    const steps: CircuitStepConfig[] = [
      { stepOrder: 1, name: 'Secrétariat : réception & enregistrement', stepType: 'SECRETARIAT_RECEPTION', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: secId, slaHours: 4 },
      { stepOrder: 2, name: 'Orientation', stepType: 'ORIENTATION', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: secId, slaHours: 8 },
    ];

    if (newCircuit.parallelStep) {
      steps.push({
        stepOrder: 3,
        name: 'Consultations parallèles multi-services (2 validations requises)',
        stepType: 'PARALLEL_REVIEW',
        mode: 'PARALLEL',
        parallelRule: 'MIN_COUNT',
        minApprovals: 2,
        targetServiceId: newCircuit.targetServiceId || null,
        slaHours: 48,
      });
    } else {
      steps.push(
        { stepOrder: 3, name: 'Affectation Responsable', stepType: 'RESPONSABLE_ASSIGN', mode: 'SEQUENTIAL', targetRole: 'RESPONSABLE', targetServiceId: newCircuit.targetServiceId || null, slaHours: 12 },
        { stepOrder: 4, name: 'Traitement Agent', stepType: 'AGENT_TREATMENT', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: newCircuit.targetServiceId || null, slaHours: 48 },
        { stepOrder: 5, name: 'Contrôle Responsable', stepType: 'RESPONSABLE_REVIEW', mode: 'SEQUENTIAL', targetRole: 'RESPONSABLE', targetServiceId: newCircuit.targetServiceId || null, slaHours: 24 }
      );
    }

    if (newCircuit.includePresident) {
      steps.push({
        stepOrder: steps.length + 1,
        name: 'Validation & Signature Président',
        stepType: 'PRESIDENT_VALIDATION',
        mode: 'SEQUENTIAL',
        targetRole: 'PRESIDENT',
        requiresPresident: true,
        slaHours: 24,
      });
    }

    try {
      await apiFetch('/api/circuits', {
        method: 'POST',
        body: JSON.stringify({
          name: newCircuit.name,
          description: newCircuit.description,
          category: newCircuit.category,
          mailDirection: newCircuit.mailDirection,
          steps,
        }),
      });
      setShowCreate(false);
      setNewCircuit({
        name: '',
        description: '',
        category: 'Administration générale',
        mailDirection: 'ENTRANT',
        includePresident: false,
        parallelStep: false,
        targetServiceId: '',
      });
      setFeedback('Circuit créé (v1) avec retour obligatoire au Secrétariat pour les courriers entrants.');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur création circuit');
    }
  };

  const handlePublishNewVersion = async (circuit: CircuitItem) => {
    try {
      const res = await apiFetch<{ version: number }>(`/api/circuits/${circuit.id}`, {
        method: 'PUT',
        body: JSON.stringify({ steps: circuit.steps }),
      });
      setFeedback(`Nouvelle version v${res.version} publiée pour "${circuit.name}". Les dossiers déjà en cours conservent leur version d’origine.`);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Circuits administratifs &amp; Versioning
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configurez des workflows séquentiels ou parallèles. Tout circuit entrant inclut obligatoirement le retour final au Secrétariat.
          </p>
        </div>
        {user?.role === 'ADMIN' && (
          <button
            type="button"
            onClick={() => setShowCreate(!showCreate)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau circuit</span>
          </button>
        )}
      </div>

      {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-300">{feedback}</div>}
      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      {showCreate && (
        <form onSubmit={handleCreateCircuit} className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h2 className="font-display text-base font-bold">Créer un circuit administratif</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Nom du circuit *</label>
              <input
                type="text"
                required
                value={newCircuit.name}
                onChange={(e) => setNewCircuit({ ...newCircuit, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Type de courrier</label>
              <select
                value={newCircuit.mailDirection}
                onChange={(e) => setNewCircuit({ ...newCircuit, mailDirection: e.target.value as MailDirection })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="ENTRANT">Courrier entrant</option>
                <option value="SORTANT">Courrier sortant</option>
                <option value="INTERNE">Courrier interne</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Catégorie</label>
              <input
                type="text"
                value={newCircuit.category}
                onChange={(e) => setNewCircuit({ ...newCircuit, category: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Service principal</label>
              <select
                value={newCircuit.targetServiceId}
                onChange={(e) => setNewCircuit({ ...newCircuit, targetServiceId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="">Selon orientation Secrétariat</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Description</label>
              <input
                type="text"
                value={newCircuit.description}
                onChange={(e) => setNewCircuit({ ...newCircuit, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newCircuit.includePresident}
                onChange={(e) => setNewCircuit({ ...newCircuit, includePresident: e.target.checked })}
              />
              <span>Inclure une validation / signature du Président</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newCircuit.parallelStep}
                onChange={(e) => setNewCircuit({ ...newCircuit, parallelStep: e.target.checked })}
              />
              <span>Activer une étape de validations parallèles</span>
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg border text-xs">
              Annuler
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold">
              Enregistrer le circuit
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {circuits.map((c) => (
          <div key={c.id} className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-blue-700 dark:text-blue-400">
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>{c.mail_direction}</span>
                  <span>·</span>
                  <span>v{c.current_version}</span>
                </div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white mt-1">{c.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{c.description}</p>
              </div>
              {user?.role === 'ADMIN' && (
                <button
                  type="button"
                  onClick={() => handlePublishNewVersion(c)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
                >
                  Nouvelle version
                </button>
              )}
            </div>

            <ol className="space-y-1.5 text-xs border-t border-slate-100 dark:border-slate-800 pt-3">
              {c.steps.map((st) => (
                <li key={st.stepOrder} className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300">
                  <span>
                    <span className="font-mono text-slate-400 mr-2">{String(st.stepOrder).padStart(2, '0')}.</span>
                    {st.name}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400 shrink-0">
                    {st.mode === 'PARALLEL' ? 'Parallèle' : 'Séquentiel'} · {st.slaHours}h
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

interface TaskRow {
  id: string;
  mail_id: string;
  mail_reference: string;
  mail_subject: string;
  mail_status: string;
  title: string;
  description: string;
  assigned_user_name: string | null;
  service_name: string | null;
  priority: string;
  status: string;
  due_date: string;
}

export function TasksPage({ onNavigate }: { onNavigate: (page: AppPage, mailId?: string) => void }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; full_name: string; role: string }>>([]);
  const [scope, setScope] = useState('mine');
  const [transferTarget, setTransferTarget] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const loadTasks = useCallback(async () => {
    try {
      const [tRes, uRes] = await Promise.all([
        apiFetch<{ tasks: TaskRow[] }>(`/api/tasks?scope=${scope}`),
        apiFetch<{ users: Array<{ id: string; full_name: string; role: string }> }>('/api/users'),
      ]);
      setTasks(tRes.tasks);
      setUsers(uRes.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement tâches');
    }
  }, [scope]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const updateStatus = async (taskId: string, status: string) => {
    setError('');
    setFeedback('');
    try {
      await apiFetch(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setFeedback('Statut de tâche mis à jour.');
      await loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action non autorisée');
    }
  };

  const handleTransfer = async (taskId: string) => {
    const targetUserId = transferTarget[taskId];
    if (!targetUserId) return;
    setError('');
    setFeedback('');
    try {
      const res = await apiFetch<{ departmentEmailsTriggered: number }>(`/api/tasks/${taskId}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      });
      setFeedback(
        res.departmentEmailsTriggered > 0
          ? 'Tâche transférée à l’agent et e-mail envoyé automatiquement au chef de département.'
          : 'Tâche transférée.'
      );
      await loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur transfert');
    }
  };

  const handleRemind = async (taskId: string) => {
    try {
      await apiFetch(`/api/tasks/${taskId}/remind`, { method: 'POST' });
      setFeedback('Relance envoyée dans les notifications du destinataire.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Moteur de tâches</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Suivi opérationnel, transferts, relances et calcul des échéances.
          </p>
        </div>

        {user?.role !== 'AGENT' && (
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setScope('mine')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${scope === 'mine' ? 'bg-white dark:bg-slate-700 shadow-sm' : ''}`}
            >
              Mes tâches
            </button>
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${scope === 'all' ? 'bg-white dark:bg-slate-700 shadow-sm' : ''}`}
            >
              Périmètre élargi
            </button>
          </div>
        )}
      </div>

      {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-300">{feedback}</div>}
      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
        {tasks.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Aucune tâche dans cette vue.</div>
        ) : (
          tasks.map((t) => (
            <div key={t.id} className="p-4 lg:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => onNavigate('mail-detail', t.mail_id)}
                    className="font-mono font-bold text-blue-700 dark:text-blue-400 hover:underline"
                  >
                    {t.mail_reference}
                  </button>
                  <span aria-hidden="true">·</span>
                  <StatusLabel status={t.status} />
                  <span aria-hidden="true">·</span>
                  <PriorityLabel priority={t.priority} />
                  {t.due_date && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-500">Échéance : {t.due_date.slice(0, 10)}</span>
                    </>
                  )}
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{t.title}</p>
                <p className="text-xs text-slate-500">
                  {t.service_name || 'Service'} · Assigné à : {t.assigned_user_name || 'Non affecté'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {t.status === 'A_TRAITER' && (
                  <button
                    type="button"
                    onClick={() => updateStatus(t.id, 'EN_COURS')}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold"
                  >
                    Démarrer
                  </button>
                )}
                {['A_TRAITER', 'EN_COURS', 'A_CORRIGER'].includes(t.status) && (
                  <button
                    type="button"
                    onClick={() => updateStatus(t.id, 'TRANSMISE')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Transmettre</span>
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <select
                    value={transferTarget[t.id] || ''}
                    onChange={(e) => setTransferTarget({ ...transferTarget, [t.id]: e.target.value })}
                    className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs max-w-[140px]"
                  >
                    <option value="">Transférer à...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name}
                      </option>
                    ))}
                  </select>
                  {transferTarget[t.id] && (
                    <button
                      type="button"
                      onClick={() => handleTransfer(t.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                    >
                      OK
                    </button>
                  )}
                </div>
                {user?.role !== 'AGENT' && (
                  <button
                    type="button"
                    onClick={() => handleRemind(t.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs"
                    title="Relancer"
                  >
                    <BellRing className="w-3.5 h-3.5" />
                    <span>Relancer</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
