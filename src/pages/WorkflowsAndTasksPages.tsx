import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, BookmarkCheck, GitBranch, Plus, Send, Trash2 } from 'lucide-react';
import { apiFetch } from '../api/client.ts';
import type { AppPage } from '../components/common/AppShell.tsx';
import { PriorityLabel, StatusLabel } from '../components/common/StatusBadge.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import type { CircuitItem, CircuitStepConfig, CircuitTemplateItem, MailDirection, ServiceItem } from '../types/nexora.ts';

export function WorkflowsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'circuits' | 'templates'>('circuits');
  const [circuits, setCircuits] = useState<CircuitItem[]>([]);
  const [templates, setTemplates] = useState<CircuitTemplateItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; full_name: string; role: string }>>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Modèle form
  const [newTemplate, setNewTemplate] = useState<{
    name: string;
    description: string;
    circuitType: 'SEQUENTIEL' | 'PARALLELE' | 'MIXTE';
    category: string;
    mailDirection: MailDirection;
    parallelRule: 'ALL' | 'MIN_COUNT' | 'CONSULTATIVE';
    minApprovals: number;
    selectedUserIds: string[];
  }>({
    name: '',
    description: '',
    circuitType: 'SEQUENTIEL',
    category: 'Partenariat & Conventions',
    mailDirection: 'ENTRANT',
    parallelRule: 'ALL',
    minApprovals: 2,
    selectedUserIds: [],
  });

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
      const [cRes, sRes, tRes, uRes] = await Promise.all([
        apiFetch<{ circuits: CircuitItem[] }>('/api/circuits'),
        apiFetch<{ services: ServiceItem[] }>('/api/services'),
        apiFetch<{ templates: CircuitTemplateItem[] }>('/api/circuit-templates'),
        apiFetch<{ users: Array<{ id: string; full_name: string; role: string }> }>('/api/users'),
      ]);
      setCircuits(cRes.circuits);
      setServices(sRes.services);
      setTemplates(tRes.templates);
      setUsers(uRes.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement');
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFeedback('');

    const steps: CircuitStepConfig[] = [];
    const secId = services.find((s) => s.is_secretariat === 1)?.id || null;

    if (newTemplate.circuitType === 'SEQUENTIEL') {
      steps.push(
        { stepOrder: 1, name: 'Secrétariat : Réception & Enregistrement', stepType: 'SECRETARIAT_RECEPTION', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: secId, slaHours: 4 },
        { stepOrder: 2, name: 'Examen Direction', stepType: 'RESPONSABLE_ASSIGN', mode: 'SEQUENTIAL', targetRole: 'RESPONSABLE', slaHours: 12 },
        { stepOrder: 3, name: 'Traitement Agent', stepType: 'AGENT_TREATMENT', mode: 'SEQUENTIAL', targetRole: 'AGENT', slaHours: 48 },
        { stepOrder: 4, name: 'Contrôle Responsable', stepType: 'RESPONSABLE_REVIEW', mode: 'SEQUENTIAL', targetRole: 'RESPONSABLE', slaHours: 24 },
        { stepOrder: 5, name: 'Décision & Signature Présidence', stepType: 'PRESIDENT_VALIDATION', mode: 'SEQUENTIAL', targetRole: 'PRESIDENT', requiresPresident: true, slaHours: 24 }
      );
    } else if (newTemplate.circuitType === 'PARALLELE') {
      steps.push({
        stepOrder: 1,
        name: `Consultation parallèle (${newTemplate.parallelRule === 'ALL' ? 'Tous les avis obligatoires' : newTemplate.parallelRule === 'MIN_COUNT' ? `Min ${newTemplate.minApprovals} avis` : 'Avis consultatifs'})`,
        stepType: 'PARALLEL_REVIEW',
        mode: 'PARALLEL',
        parallelRule: newTemplate.parallelRule,
        minApprovals: newTemplate.minApprovals,
        assignedUserIds: newTemplate.selectedUserIds,
        parallelTargets: newTemplate.selectedUserIds.map((uid) => {
          const u = users.find((usr) => usr.id === uid);
          return {
            userId: uid,
            userName: u?.full_name,
            role: u?.role as any,
            isRequired: newTemplate.parallelRule !== 'CONSULTATIVE',
          };
        }),
        slaHours: 48,
      });
    } else {
      // MIXTE
      steps.push(
        { stepOrder: 1, name: 'Secrétariat : Enregistrement', stepType: 'SECRETARIAT_RECEPTION', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: secId, slaHours: 4 },
        { stepOrder: 2, name: 'Examen préalable Direction', stepType: 'RESPONSABLE_REVIEW', mode: 'SEQUENTIAL', targetRole: 'RESPONSABLE', slaHours: 12 },
        {
          stepOrder: 3,
          name: 'Consultation parallèle multi-services',
          stepType: 'PARALLEL_REVIEW',
          mode: 'PARALLEL',
          parallelRule: newTemplate.parallelRule,
          minApprovals: newTemplate.minApprovals,
          assignedUserIds: newTemplate.selectedUserIds,
          parallelTargets: newTemplate.selectedUserIds.map((uid) => {
            const u = users.find((usr) => usr.id === uid);
            return {
              userId: uid,
              userName: u?.full_name,
              role: u?.role as any,
              isRequired: newTemplate.parallelRule !== 'CONSULTATIVE',
            };
          }),
          slaHours: 48,
        },
        { stepOrder: 4, name: 'Synthèse du dossier', stepType: 'RESPONSABLE_REVIEW', mode: 'SEQUENTIAL', targetRole: 'RESPONSABLE', slaHours: 24 },
        { stepOrder: 5, name: 'Arbitrage & Visa Président', stepType: 'PRESIDENT_VALIDATION', mode: 'SEQUENTIAL', targetRole: 'PRESIDENT', requiresPresident: true, slaHours: 24 }
      );
    }

    try {
      await apiFetch('/api/circuit-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: newTemplate.name,
          description: newTemplate.description,
          circuitType: newTemplate.circuitType,
          category: newTemplate.category,
          mailDirection: newTemplate.mailDirection,
          steps,
        }),
      });
      setShowCreateTemplate(false);
      setNewTemplate({
        name: '',
        description: '',
        circuitType: 'SEQUENTIEL',
        category: 'Partenariat & Conventions',
        mailDirection: 'ENTRANT',
        parallelRule: 'ALL',
        minApprovals: 2,
        selectedUserIds: [],
      });
      setFeedback('Modèle de circuit enregistré avec succès.');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur création modèle');
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce modèle de circuit ?')) return;
    try {
      await apiFetch(`/api/circuit-templates/${templateId}`, { method: 'DELETE' });
      setFeedback('Modèle supprimé.');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur suppression');
    }
  };

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
            Circuits administratifs &amp; Modèles réutilisables
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gérez les circuits séquentiels, parallèles ou mixtes, et configurez vos modèles types.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {user?.role === 'ADMIN' && (
            <>
              {activeTab === 'circuits' ? (
                <button
                  type="button"
                  onClick={() => setShowCreate(!showCreate)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nouveau circuit</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCreateTemplate(!showCreateTemplate)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold whitespace-nowrap"
                >
                  <BookmarkCheck className="w-4 h-4" />
                  <span>Nouveau modèle</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('circuits')}
          className={`pb-3 border-b-2 flex items-center gap-2 ${
            activeTab === 'circuits'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <GitBranch className="w-4 h-4" />
          <span>Circuits opérationnels ({circuits.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`pb-3 border-b-2 flex items-center gap-2 ${
            activeTab === 'templates'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookmarkCheck className="w-4 h-4" />
          <span>Modèles réutilisables ({templates.length})</span>
        </button>
      </div>

      {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-300">{feedback}</div>}
      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      {/* CREATE TEMPLATE FORM */}
      {showCreateTemplate && activeTab === 'templates' && (
        <form onSubmit={handleCreateTemplate} className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">Créer un modèle de circuit réutilisable</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Nom du modèle *</label>
              <input
                type="text"
                required
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                placeholder="Ex: Circuit de traitement des demandes de partenariat"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Architecture du circuit *</label>
              <select
                value={newTemplate.circuitType}
                onChange={(e) => setNewTemplate({ ...newTemplate, circuitType: e.target.value as any })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
              >
                <option value="SEQUENTIEL">1. Circuit Séquentiel (Étapes successives)</option>
                <option value="PARALLELE">2. Circuit Parallèle (Consultation simultanée)</option>
                <option value="MIXTE">3. Circuit Mixte (Séquentiel + Groupes parallèles)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Type de courrier</label>
              <select
                value={newTemplate.mailDirection}
                onChange={(e) => setNewTemplate({ ...newTemplate, mailDirection: e.target.value as MailDirection })}
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
                value={newTemplate.category}
                onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            {(newTemplate.circuitType === 'PARALLELE' || newTemplate.circuitType === 'MIXTE') && (
              <>
                <div>
                  <label className="block text-xs font-medium mb-1">Condition de clôture du groupe parallèle</label>
                  <select
                    value={newTemplate.parallelRule}
                    onChange={(e) => setNewTemplate({ ...newTemplate, parallelRule: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  >
                    <option value="ALL">Option A — Tous les avis obligatoires</option>
                    <option value="MIN_COUNT">Option B — Nombre minimum d'avis</option>
                    <option value="CONSULTATIVE">Option C — Avis consultatifs (non bloquants)</option>
                  </select>
                </div>
                {newTemplate.parallelRule === 'MIN_COUNT' && (
                  <div>
                    <label className="block text-xs font-medium mb-1">Nombre minimum d'avis requis</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={newTemplate.minApprovals}
                      onChange={(e) => setNewTemplate({ ...newTemplate, minApprovals: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium mb-1">Intervenants du groupe parallèle</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 max-h-36 overflow-y-auto">
                    {users.map((u) => {
                      const checked = newTemplate.selectedUserIds.includes(u.id);
                      return (
                        <label key={u.id} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewTemplate({ ...newTemplate, selectedUserIds: [...newTemplate.selectedUserIds, u.id] });
                              } else {
                                setNewTemplate({ ...newTemplate, selectedUserIds: newTemplate.selectedUserIds.filter((id) => id !== u.id) });
                              }
                            }}
                          />
                          <span className="truncate">{u.full_name} ({u.role})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Description / Objectif</label>
              <input
                type="text"
                value={newTemplate.description}
                onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                placeholder="Précisez dans quel cadre administratif ce modèle est applicable"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreateTemplate(false)} className="px-4 py-2 rounded-lg border text-xs">
              Annuler
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold">
              Enregistrer le modèle
            </button>
          </div>
        </form>
      )}

      {/* CREATE CIRCUIT FORM */}
      {showCreate && activeTab === 'circuits' && (
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

      {/* CIRCUITS LIST TAB */}
      {activeTab === 'circuits' && (
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
      )}

      {/* TEMPLATES LIST TAB */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {templates.length === 0 ? (
            <div className="col-span-2 p-12 text-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
              <BookmarkCheck className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Aucun modèle réutilisable</p>
              <p className="text-xs text-slate-500">
                Vous pouvez créer des modèles ici ou accepter la suggestion d'enregistrement lors de l'archivage d'un courrier.
              </p>
            </div>
          ) : (
            templates.map((tmpl) => {
              const totalIntervenants = tmpl.steps.reduce((acc, s) => {
                if (s.mode === 'PARALLEL') return acc + Math.max(1, s.assignedUserIds?.length || s.parallelTargets?.length || 2);
                return acc + 1;
              }, 0);

              return (
                <div key={tmpl.id} className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                        <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-bold">
                          {tmpl.circuit_type}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600 dark:text-slate-400">{tmpl.mail_direction}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">{tmpl.category}</span>
                      </div>
                      <h3 className="font-display text-base font-bold text-slate-900 dark:text-white mt-1.5">{tmpl.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{tmpl.description}</p>
                    </div>

                    {user?.role === 'ADMIN' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(tmpl.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                        title="Supprimer ce modèle"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs flex justify-between font-mono">
                    <span>{tmpl.steps.length} étape(s)</span>
                    <span className="text-slate-500">{totalIntervenants} intervenant(s)</span>
                    <span className="text-emerald-600 font-medium">Actif</span>
                  </div>

                  <ol className="space-y-1.5 text-xs border-t border-slate-100 dark:border-slate-800 pt-3">
                    {tmpl.steps.map((st) => (
                      <li key={st.stepOrder} className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300">
                        <span>
                          <span className="font-mono text-slate-400 mr-2">{String(st.stepOrder).padStart(2, '0')}.</span>
                          {st.name}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400 shrink-0">
                          {st.mode === 'PARALLEL' ? 'Groupe Parallèle' : 'Séquentiel'}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })
          )}
        </div>
      )}
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
