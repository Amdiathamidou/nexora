import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Network,
  RotateCcw,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../api/client.ts';
import type { ServiceItem, UserPermissions, UserRole } from '../types/nexora.ts';

export interface UserRow {
  id: string;
  company_id: string;
  full_name: string;
  job_title: string;
  email: string;
  phone: string;
  avatar_url?: string;
  role: UserRole;
  is_active: number;
  permissions: UserPermissions;
  is_activated?: number;
  invitation_expires_at?: string | null;
  department_id?: string | null;
  service_id?: string | null;
  unit_name?: string;
  superior_user_id?: string | null;
  superior_name?: string | null;
  department_name?: string | null;
  service_name?: string | null;
  permissionsAudit?: {
    suggestedPermissions?: UserPermissions;
    manualModifications?: boolean;
    validatedByUserName?: string;
    validatedAt?: string;
  };
  services: Array<{ service_id: string; service_name: string; is_secretariat: number }>;
}

export const PERMISSION_GROUPS = [
  {
    category: 'Opérations Secrétariat & Courrier',
    items: [
      { key: 'secretariat_receive' as keyof UserPermissions, label: 'Réception & numérisation', desc: 'Réceptionner et charger les courriers entrants' },
      { key: 'secretariat_register' as keyof UserPermissions, label: 'Enregistrement officiel', desc: 'Attribuer un numéro d’ordre officiel et immatriculer' },
      { key: 'secretariat_ai_analyze' as keyof UserPermissions, label: 'Analyse IA & Extraction', desc: 'Déclencher l’analyse IA et valider les résumés automatiques' },
      { key: 'secretariat_orient' as keyof UserPermissions, label: 'Orientation vers les services', desc: 'Router et orienter les courriers vers les services compétents' },
      { key: 'secretariat_final_control' as keyof UserPermissions, label: 'Contrôle final Secrétariat', desc: 'Effectuer le visa de contrôle final avant départ' },
      { key: 'secretariat_dispatch' as keyof UserPermissions, label: 'Expédition & Notification', desc: 'Expédier les réponses et consigner les preuves d’envoi' },
      { key: 'secretariat_archive' as keyof UserPermissions, label: 'Archivage & Clôture', desc: 'Archiver définitivement les dossiers de courrier' },
    ],
  },
  {
    category: 'Confidentialité & Visibilité',
    items: [
      { key: 'can_view_confidential' as keyof UserPermissions, label: 'Accès courriers confidentiels', desc: 'Consulter les courriers marqués comme confidentiels' },
      { key: 'can_view_all_services' as keyof UserPermissions, label: 'Vue transverse tous services', desc: 'Consulter les courriers de l’ensemble des directions et services' },
    ],
  },
  {
    category: 'Administration & Gouvernance',
    items: [
      { key: 'can_manage_users' as keyof UserPermissions, label: 'Gestion des utilisateurs', desc: 'Ajouter des collaborateurs et configurer leurs accès' },
      { key: 'can_manage_circuits' as keyof UserPermissions, label: 'Gestion des circuits', desc: 'Concevoir et modifier les circuits de validation' },
      { key: 'can_export_reports' as keyof UserPermissions, label: 'Export des rapports', desc: 'Générer et exporter les registres et statistiques' },
    ],
  },
];

// Moteur intelligent de calcul des autorisations initiales suggérées
export function calculateSuggestedPermissions(params: {
  role: UserRole;
  jobTitle: string;
  departmentId?: string;
  serviceId?: string;
  unitName?: string;
  servicesList: ServiceItem[];
}): UserPermissions {
  const { role, jobTitle, departmentId, serviceId, servicesList } = params;
  const titleLower = (jobTitle || '').toLowerCase();
  
  // Identifier si le service ou département est le secrétariat
  const selectedSvc = servicesList.find((s) => s.id === serviceId);
  const selectedDept = servicesList.find((s) => s.id === departmentId);
  const isSecretariat = 
    Boolean(selectedSvc?.is_secretariat || selectedDept?.is_secretariat) ||
    titleLower.includes('secrét') ||
    titleLower.includes('secret') ||
    titleLower.includes('accueil');

  const isDGOrExec =
    titleLower.includes('directeur général') ||
    titleLower.includes('dg') ||
    titleLower.includes('président') ||
    titleLower.includes('president') ||
    titleLower.includes('gérant');

  if (role === 'PRESIDENT') {
    return {
      can_view_all_services: true,
      can_view_confidential: true,
      can_export_reports: true,
      can_manage_circuits: false,
      can_manage_users: false,
    };
  }

  if (role === 'ADMIN') {
    return {
      can_manage_users: true,
      can_manage_circuits: true,
      can_view_all_services: true,
      can_view_confidential: true,
      can_export_reports: true,
      secretariat_receive: true,
      secretariat_register: true,
      secretariat_ai_analyze: true,
      secretariat_orient: true,
      secretariat_final_control: true,
      secretariat_dispatch: true,
      secretariat_archive: true,
    };
  }

  if (role === 'RESPONSABLE') {
    return {
      can_view_confidential: true,
      can_view_all_services: isDGOrExec,
      can_export_reports: true,
      secretariat_orient: isSecretariat,
      secretariat_receive: isSecretariat,
      secretariat_register: isSecretariat,
      secretariat_ai_analyze: isSecretariat,
      secretariat_final_control: isSecretariat,
      secretariat_dispatch: isSecretariat,
      secretariat_archive: isSecretariat,
      can_manage_users: false,
      can_manage_circuits: false,
    };
  }

  // Rôle AGENT
  if (isSecretariat) {
    return {
      secretariat_receive: true,
      secretariat_register: true,
      secretariat_ai_analyze: true,
      secretariat_orient: true,
      secretariat_final_control: true,
      secretariat_dispatch: true,
      secretariat_archive: true,
      can_view_all_services: true,
      can_view_confidential: false,
      can_manage_users: false,
      can_manage_circuits: false,
      can_export_reports: false,
    };
  }

  return {
    can_view_all_services: false,
    can_view_confidential: false,
    can_manage_users: false,
    can_manage_circuits: false,
    can_export_reports: false,
  };
}

export function UsersPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'organigram'>('users');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);

  // Formulaire d'édition
  const [editRole, setEditRole] = useState<UserRole>('AGENT');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editDeptId, setEditDeptId] = useState('');
  const [editServiceId, setEditServiceId] = useState('');
  const [editUnitName, setEditUnitName] = useState('');
  const [editSuperiorId, setEditSuperiorId] = useState('');
  const [editPerms, setEditPerms] = useState<UserPermissions>({});
  const [editServiceIds, setEditServiceIds] = useState<string[]>([]);
  const [editIsManuallyModified, setEditIsManuallyModified] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Formulaire de création
  const [form, setForm] = useState({
    fullName: '',
    jobTitle: '',
    email: '',
    phone: '',
    role: 'AGENT' as UserRole,
    departmentId: '',
    serviceId: '',
    unitName: '',
    superiorUserId: '',
    serviceIds: [] as string[],
    permissions: {} as UserPermissions,
    isManuallyModified: false,
  });

  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [uRes, sRes] = await Promise.all([
        apiFetch<{ users: UserRow[] }>('/api/users'),
        apiFetch<{ services: ServiceItem[] }>('/api/services'),
      ]);
      setUsers(uRes.users);
      setServices(sRes.services);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement');
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Recalcul des suggestions pour le formulaire de création
  const updateFormSuggestions = (
    nextRole: UserRole,
    nextJobTitle: string,
    nextDept: string,
    nextSvc: string,
    forceOverwrite = false
  ) => {
    const suggested = calculateSuggestedPermissions({
      role: nextRole,
      jobTitle: nextJobTitle,
      departmentId: nextDept,
      serviceId: nextSvc,
      servicesList: services,
    });

    if (forceOverwrite || !form.isManuallyModified) {
      setForm((prev) => ({
        ...prev,
        permissions: suggested,
        isManuallyModified: false,
      }));
    } else {
      // Demander poliment si modification manuelle existante
      if (window.confirm("Le profil a changé. Souhaitez-vous réévaluer et pré-cocher automatiquement les autorisations adaptées à cette fonction ?")) {
        setForm((prev) => ({
          ...prev,
          permissions: suggested,
          isManuallyModified: false,
        }));
      }
    }
  };

  // Recalcul des suggestions pour le formulaire d'édition
  const updateEditSuggestions = (
    nextRole: UserRole,
    nextJobTitle: string,
    nextDept: string,
    nextSvc: string,
    forceOverwrite = false
  ) => {
    const suggested = calculateSuggestedPermissions({
      role: nextRole,
      jobTitle: nextJobTitle,
      departmentId: nextDept,
      serviceId: nextSvc,
      servicesList: services,
    });

    if (forceOverwrite || !editIsManuallyModified) {
      setEditPerms(suggested);
      setEditIsManuallyModified(false);
    } else {
      if (window.confirm("Le profil a changé. Souhaitez-vous réévaluer et actualiser les autorisations adaptées à cette nouvelle fonction ?")) {
        setEditPerms(suggested);
        setEditIsManuallyModified(false);
      }
    }
  };

  const handleOpenEdit = (u: UserRow) => {
    setEditingUser(u);
    setEditRole(u.role);
    setEditJobTitle(u.job_title);
    setEditDeptId(u.department_id || '');
    setEditServiceId(u.service_id || '');
    setEditUnitName(u.unit_name || '');
    setEditSuperiorId(u.superior_user_id || '');
    setEditPerms(u.permissions || {});
    setEditServiceIds(u.services.map((s) => s.service_id));
    setEditIsManuallyModified(Boolean(u.permissionsAudit?.manualModifications));
    setError('');
    setFeedback('');
  };

  const handleSaveUserPermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    setError('');

    const suggested = calculateSuggestedPermissions({
      role: editRole,
      jobTitle: editJobTitle,
      departmentId: editDeptId,
      serviceId: editServiceId,
      servicesList: services,
    });

    try {
      await apiFetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: editRole,
          jobTitle: editJobTitle,
          departmentId: editDeptId || null,
          serviceId: editServiceId || null,
          unitName: editUnitName,
          superiorUserId: editSuperiorId || null,
          permissions: editPerms,
          serviceIds: editServiceIds,
          permissionsAudit: {
            suggestedPermissions: suggested,
            manualModifications: editIsManuallyModified,
          },
        }),
      });
      setFeedback(`Profil, hiérarchie et permissions de ${editingUser.full_name} enregistrés avec succès.`);
      setEditingUser(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur modification permissions');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFeedback('');

    const suggested = calculateSuggestedPermissions({
      role: form.role,
      jobTitle: form.jobTitle,
      departmentId: form.departmentId,
      serviceId: form.serviceId,
      servicesList: services,
    });

    try {
      const res = await apiFetch<{ id: string; invitationToken?: string; activationUrl?: string }>('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName,
          jobTitle: form.jobTitle,
          email: form.email,
          phone: form.phone,
          role: form.role,
          departmentId: form.departmentId || null,
          serviceId: form.serviceId || null,
          unitName: form.unitName,
          superiorUserId: form.superiorUserId || null,
          serviceIds: form.serviceIds,
          permissions: form.permissions,
          permissionsAudit: {
            suggestedPermissions: suggested,
            manualModifications: form.isManuallyModified,
          },
        }),
      });
      setShowAdd(false);
      setForm({
        fullName: '',
        jobTitle: '',
        email: '',
        phone: '',
        role: 'AGENT',
        departmentId: '',
        serviceId: '',
        unitName: '',
        superiorUserId: '',
        serviceIds: [],
        permissions: {},
        isManuallyModified: false,
      });
      setFeedback(`Invitation envoyée par e-mail à ${form.fullName}. Le collaborateur pourra activer son compte et choisir son mot de passe.`);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur création utilisateur');
    }
  };

  const toggleActive = async (u: UserRow) => {
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: u.is_active !== 1 }),
      });
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const handleResendInvitation = async (u: UserRow) => {
    setError('');
    setFeedback('');
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(`/api/users/${u.id}/resend-invitation`, {
        method: 'POST',
      });
      setFeedback(res.message || `Invitation renvoyée avec succès à ${u.email}.`);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors du renvoi de l’invitation.');
    }
  };

  // Liste des départements et services
  const departments = useMemo(() => services.filter((s) => s.type === 'DEPARTEMENT'), [services]);
  const standardServices = useMemo(() => services.filter((s) => s.type !== 'DEPARTEMENT'), [services]);

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Organisation, Rôles &amp; Hiérarchie
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gérez les 4 rôles majeurs, les départements, les supérieurs hiérarchiques et l’organigramme dynamique.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center gap-1 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'users'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Collaborateurs ({users.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('organigram')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'organigram'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Organigramme dynamique</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold whitespace-nowrap shadow-sm hover:opacity-90 transition-opacity"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nouveau collaborateur</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* VUE 1 : ORGANIGRAMME DYNAMIQUE */}
      {activeTab === 'organigram' && (
        <OrganigramView users={users} services={services} onEditUser={handleOpenEdit} onReload={loadData} />
      )}

      {/* VUE 2 : LISTE DES COLLABORATEURS */}
      {activeTab === 'users' && (
        <>
          {/* MODAL: Édition utilisateur, rattachements & autorisations */}
          {editingUser && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-blue-600" />
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                        Édition hiérarchique &amp; Permissions : {editingUser.full_name}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {editingUser.email} · Rôle : <span className="font-mono font-semibold">{editingUser.role}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveUserPermissions} className="space-y-5">
                  {/* Section Rôle principal & Poste */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      1. Rôle principal &amp; Fonction administrative
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block font-semibold mb-1">Rôle applicatif principal *</label>
                        <select
                          value={editRole}
                          onChange={(e) => {
                            const newRole = e.target.value as UserRole;
                            setEditRole(newRole);
                            updateEditSuggestions(newRole, editJobTitle, editDeptId, editServiceId);
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                        >
                          <option value="AGENT">Agent (Traitement des courriers &amp; Exécution)</option>
                          <option value="RESPONSABLE">Responsable (Chef de service / Supervision)</option>
                          <option value="PRESIDENT">Président (Validation &amp; Décision Exécutive)</option>
                          {/* L'admin est unique : option disponible uniquement si l'utilisateur est déjà l'admin */}
                          {(editingUser.role === 'ADMIN' || !users.some((u) => u.role === 'ADMIN')) && (
                            <option value="ADMIN">Administrateur (Gestion système &amp; Organisation)</option>
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold mb-1">Fonction occupée (Libellé libre) *</label>
                        <input
                          type="text"
                          required
                          value={editJobTitle}
                          onChange={(e) => {
                            setEditJobTitle(e.target.value);
                            updateEditSuggestions(editRole, e.target.value, editDeptId, editServiceId);
                          }}
                          placeholder="ex: Chef de département, Adjoint, Secrétaire administratif..."
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section Rattachements hiérarchiques */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      2. Rattachement administratif &amp; Supérieur hiérarchique
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div>
                        <label className="block font-medium mb-1">Département</label>
                        <select
                          value={editDeptId}
                          onChange={(e) => {
                            setEditDeptId(e.target.value);
                            updateEditSuggestions(editRole, editJobTitle, e.target.value, editServiceId);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          <option value="">Aucun / Direct</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block font-medium mb-1">Service</label>
                        <select
                          value={editServiceId}
                          onChange={(e) => {
                            setEditServiceId(e.target.value);
                            updateEditSuggestions(editRole, editJobTitle, editDeptId, e.target.value);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          <option value="">Sélectionner un service</option>
                          {standardServices.map((s) => (
                            <option key={s.id} value={s.id}>{s.name} {s.is_secretariat === 1 ? '(Secrétariat)' : ''}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block font-medium mb-1">Unité interne (si applicable)</label>
                        <input
                          type="text"
                          value={editUnitName}
                          onChange={(e) => setEditUnitName(e.target.value)}
                          placeholder="ex: Bureau Courrier, Cellule Contrôle"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block font-medium mb-1">Supérieur hiérarchique direct (N+1)</label>
                        <select
                          value={editSuperiorId}
                          onChange={(e) => setEditSuperiorId(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          <option value="">Aucun (Direction autonome)</option>
                          {users
                            .filter((u) => u.id !== editingUser.id)
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.full_name} ({u.job_title} · {u.role})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Section Autorisations Intelligentes */}
                  <div className="p-4 rounded-xl bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          3. Autorisations Intelligentes pré-cochées par NEXORA
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateEditSuggestions(editRole, editJobTitle, editDeptId, editServiceId, true)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                        title="Recalculer les autorisations selon le rôle et la fonction"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Réévaluer selon le profil</span>
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      NEXORA a pré-coché les permissions adaptées au rôle <span className="font-semibold text-blue-700 dark:text-blue-300">{editRole}</span> et à la fonction <span className="font-semibold">{editJobTitle || 'Non spécifiée'}</span>. Vous conservez le contrôle total pour affiner ou décocher.
                    </p>

                    {/* Grille des permissions existante réutilisée */}
                    <div className="space-y-3 pt-1">
                      {PERMISSION_GROUPS.map((group) => (
                        <div key={group.category} className="p-3 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
                          <h4 className="font-semibold text-[11px] text-slate-900 dark:text-white uppercase tracking-wider">
                            {group.category}
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {group.items.map((item) => {
                              const isGranted = Boolean(editPerms[item.key]);
                              return (
                                <label
                                  key={item.key}
                                  className="flex items-start gap-2 p-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer text-xs"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isGranted}
                                    onChange={(e) => {
                                      setEditPerms({ ...editPerms, [item.key]: e.target.checked });
                                      setEditIsManuallyModified(true);
                                    }}
                                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                                  />
                                  <div>
                                    <p className="font-semibold text-slate-900 dark:text-white">{item.label}</p>
                                    <p className="text-[10px] text-slate-500">{item.desc}</p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setEditingUser(null)}
                      className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={savingEdit}
                      className="px-5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{savingEdit ? 'Enregistrement…' : 'Enregistrer le profil & permissions'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* FORM: Nouvel Utilisateur */}
          {showAdd && (
            <form onSubmit={handleCreate} className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-blue-600" />
                  <span>Ajouter un nouveau collaborateur</span>
                </h2>
                <button type="button" onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Ligne 1 : Identité (Sans mot de passe : invitation par e-mail) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nom et prénom *</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: Jean DUPONT"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">E-mail professionnel (réception de l'invitation) *</label>
                  <input
                    type="email"
                    required
                    placeholder="jean@entreprise.bj"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Téléphone</label>
                  <input
                    type="tel"
                    placeholder="+229 ..."
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>
              <p className="text-[11px] text-blue-600 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-950/30 p-2.5 rounded-lg border border-blue-100 dark:border-blue-900/40">
                ℹ️ <strong>Invitation sécurisée :</strong> Aucun mot de passe n'est requis ici. Un e-mail d'activation sera automatiquement envoyé à l'adresse indiquée pour lui permettre de choisir son mot de passe et d'activer son compte en toute autonomie.
              </p>

              {/* Ligne 2 : Rôle, Fonction, Rattachements */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold mb-1">Rôle principal *</label>
                    <select
                      value={form.role}
                      onChange={(e) => {
                        const newRole = e.target.value as UserRole;
                        setForm({ ...form, role: newRole });
                        updateFormSuggestions(newRole, form.jobTitle, form.departmentId, form.serviceId);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="AGENT">Agent (Traitement des courriers &amp; Exécution)</option>
                      <option value="RESPONSABLE">Responsable (Chef de service / Supervision)</option>
                      <option value="PRESIDENT">Président (Validation &amp; Décision Exécutive)</option>
                      {/* L'admin est unique par entreprise */}
                      {!users.some((u) => u.role === 'ADMIN') && (
                        <option value="ADMIN">Administrateur (Gestion technique &amp; Organisation)</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1">Fonction occupée *</label>
                    <input
                      type="text"
                      required
                      placeholder="ex: Chef de service financier, Adjoint, Secrétaire..."
                      value={form.jobTitle}
                      onChange={(e) => {
                        setForm({ ...form, jobTitle: e.target.value });
                        updateFormSuggestions(form.role, e.target.value, form.departmentId, form.serviceId);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold mb-1">Supérieur hiérarchique direct (N+1)</label>
                    <select
                      value={form.superiorUserId}
                      onChange={(e) => setForm({ ...form, superiorUserId: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="">Aucun (Supérieur direct)</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.job_title} · {u.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium mb-1">Département (optionnel)</label>
                    <select
                      value={form.departmentId}
                      onChange={(e) => {
                        setForm({ ...form, departmentId: e.target.value });
                        updateFormSuggestions(form.role, form.jobTitle, e.target.value, form.serviceId);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="">Sélectionner un département</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium mb-1">Service principal d'affectation</label>
                    <select
                      value={form.serviceId}
                      onChange={(e) => {
                        setForm({ ...form, serviceId: e.target.value });
                        updateFormSuggestions(form.role, form.jobTitle, form.departmentId, e.target.value);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="">Sélectionner un service</option>
                      {standardServices.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} {s.is_secretariat === 1 ? '(Secrétariat)' : ''}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium mb-1">Unité interne / Bureau</label>
                    <input
                      type="text"
                      placeholder="ex: Bureau Courrier, Cellule Contrôle"
                      value={form.unitName}
                      onChange={(e) => setForm({ ...form, unitName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Autorisations initiales pré-cochées */}
              <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      Autorisations initiales pré-cochées par NEXORA
                    </span>
                  </div>
                  <span className="text-[11px] text-blue-700 dark:text-blue-300 font-medium">
                    Automatique selon {form.role} &amp; {form.jobTitle || 'Fonction'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {PERMISSION_GROUPS.flatMap((g) => g.items).map((item) => (
                    <label key={item.key} className="flex items-start gap-2 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={Boolean(form.permissions[item.key])}
                        onChange={(e) => {
                          setForm({
                            ...form,
                            permissions: { ...form.permissions, [item.key]: e.target.checked },
                            isManuallyModified: true,
                          });
                        }}
                        className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white text-[11px]">{item.label}</p>
                        <p className="text-[10px] text-slate-500">{item.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg border text-xs">
                  Annuler
                </button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold shadow-sm">
                  Créer le collaborateur
                </button>
              </div>
            </form>
          )}

          {/* TABLEAU DES UTILISATEURS */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto shadow-sm">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-4">Collaborateur &amp; Fonction</th>
                  <th className="py-3 px-4">Rôle</th>
                  <th className="py-3 px-4">Rattachement</th>
                  <th className="py-3 px-4">Supérieur direct (N+1)</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {u.avatar_url ? (
                          <img
                            src={u.avatar_url}
                            alt={u.full_name}
                            className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0">
                            {u.full_name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white truncate">{u.full_name}</p>
                          <p className="text-xs text-slate-500 truncate font-medium">
                            {u.job_title} · <span className="font-normal text-slate-400">{u.email}</span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        u.role === 'PRESIDENT'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : u.role === 'ADMIN'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                          : u.role === 'RESPONSABLE'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                      <div>
                        {u.department_name && <span className="font-medium text-slate-900 dark:text-white">{u.department_name} / </span>}
                        <span>{u.service_name || u.services.map((s) => s.service_name).join(', ') || '—'}</span>
                        {u.unit_name ? <p className="text-[10px] text-slate-400">Unité : {u.unit_name}</p> : null}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                      {u.superior_name ? (
                        <span className="inline-flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200">
                          <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                          <span>{u.superior_name}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Direction autonome</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {u.is_activated === 0 ? (
                        <div className="space-y-0.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            Invitation en attente
                          </span>
                          <p className="text-[10px] text-slate-400">Expire sous 24h</p>
                        </div>
                      ) : (
                        <span className={u.is_active === 1 ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-red-600'}>
                          {u.is_active === 1 ? 'Actif' : 'Désactivé'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                      {u.is_activated === 0 && (
                        <button
                          type="button"
                          onClick={() => handleResendInvitation(u)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                          title="Renvoyer un e-mail d'invitation avec un nouveau lien valable 24h"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Renvoyer l'invitation</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(u)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                        <span>Modifier</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(u)}
                        className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white hover:underline"
                      >
                        {u.is_active === 1 ? 'Désactiver' : 'Réactiver'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// COMPOSANT ORGANIGRAMME DYNAMIQUE ET VISUEL (Départements & Hiérarchie)
// ════════════════════════════════════════════════════════════════════
function OrganigramView({
  users,
  services,
  onEditUser,
  onReload,
}: {
  users: UserRow[];
  services: ServiceItem[];
  onEditUser: (u: UserRow) => void;
  onReload?: () => Promise<void>;
}) {
  const [viewMode, setViewMode] = useState<'hierarchy' | 'departments'>('departments');
  const [changingManagerServiceId, setChangingManagerServiceId] = useState<string | null>(null);

  // Indexer les collaborateurs par supérieur direct
  const collaboratorsBySuperior = useMemo(() => {
    const map = new Map<string, UserRow[]>();
    for (const u of users) {
      if (u.superior_user_id) {
        if (!map.has(u.superior_user_id)) map.set(u.superior_user_id, []);
        map.get(u.superior_user_id)!.push(u);
      }
    }
    return map;
  }, [users]);

  // Les utilisateurs racines
  const rootUsers = useMemo(() => {
    // Tous ceux qui n'ont pas de supérieur direct défini
    const roots = users.filter((u) => !u.superior_user_id);
    return roots.length > 0 ? roots : users;
  }, [users]);

  // Grouper les collaborateurs par département / service
  const usersByService = useMemo(() => {
    const map = new Map<string, UserRow[]>();
    for (const s of services) {
      map.set(s.id, []);
    }
    map.set('UNASSIGNED', []);

    for (const u of users) {
      const sId = u.service_id || u.department_id;
      if (sId && map.has(sId)) {
        map.get(sId)!.push(u);
      } else {
        map.get('UNASSIGNED')!.push(u);
      }
    }
    return map;
  }, [users, services]);

  const roleColors: Record<string, string> = {
    PRESIDENT: 'border-amber-400 bg-amber-50/80 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 shadow-sm',
    RESPONSABLE: 'border-blue-400 bg-blue-50/80 dark:bg-blue-950/40 text-blue-950 dark:text-blue-200 shadow-sm',
    ADMIN: 'border-purple-400 bg-purple-50/80 dark:bg-purple-950/40 text-purple-950 dark:text-purple-200 shadow-sm',
    AGENT: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm',
    SUPER_ADMIN: 'border-red-400 bg-red-50 text-red-900',
  };

  const roleBadges: Record<string, { label: string; bg: string }> = {
    PRESIDENT: { label: 'Président', bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300' },
    RESPONSABLE: { label: 'Responsable', bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300' },
    ADMIN: { label: 'Admin', bg: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300' },
    AGENT: { label: 'Agent', bg: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300' },
    SUPER_ADMIN: { label: 'SuperAdmin', bg: 'bg-red-100 text-red-800' },
  };

  const handleAssignManager = async (serviceId: string, managerUserId: string) => {
    try {
      await apiFetch(`/api/services/${serviceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ managerUserId }),
      });
      setChangingManagerServiceId(null);
      if (onReload) await onReload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la désignation du responsable.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-600" />
            <span>Organigramme de l’Organisation</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Visualisez la structure des services et les relations hiérarchiques de vos collaborateurs.
          </p>
        </div>

        {/* Boutons de bascule de vue */}
        <div className="flex items-center gap-2">
          <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('departments')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'departments'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Vue par Services &amp; Directions
            </button>
            <button
              type="button"
              onClick={() => setViewMode('hierarchy')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'hierarchy'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Vue Arborescence Hiérarchique
            </button>
          </div>
        </div>
      </div>

      {/* ── 1. VUE PAR SERVICES & DIRECTIONS ── */}
      {viewMode === 'departments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((svc) => {
            const members = usersByService.get(svc.id) || [];
            const manager = users.find((u) => u.id === svc.manager_user_id);
            return (
              <div
                key={svc.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">{svc.name}</h3>
                        {svc.is_secretariat === 1 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 font-bold">
                            Secrétariat
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {svc.type || 'SERVICE'} · {members.length} collaborateur(s)
                      </p>
                    </div>
                  </div>

                  {/* Responsable de service */}
                  <div className="mt-3.5 mb-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                        Responsable / Supérieur
                      </p>
                      <button
                        type="button"
                        onClick={() => setChangingManagerServiceId(changingManagerServiceId === svc.id ? null : svc.id)}
                        className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {changingManagerServiceId === svc.id ? 'Fermer' : manager ? 'Changer' : '+ Désigner'}
                      </button>
                    </div>

                    {changingManagerServiceId === svc.id ? (
                      <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-2 text-xs">
                        <label className="block font-bold text-slate-700 dark:text-slate-300">
                          Choisir le responsable de « {svc.name} » :
                        </label>
                        <select
                          defaultValue={manager?.id || ''}
                          onChange={(e) => handleAssignManager(svc.id, e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                        >
                          <option value="">-- Aucun responsable --</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.full_name} ({u.job_title || u.role})
                            </option>
                          ))}
                        </select>
                        <p className="text-[10px] text-slate-500">
                          La sélection s'enregistre immédiatement et le désigne comme supérieur du service.
                        </p>
                      </div>
                    ) : manager ? (
                      <div
                        onClick={() => onEditUser(manager)}
                        className={`cursor-pointer p-2.5 rounded-xl border flex items-center gap-2.5 transition-all hover:scale-[1.01] ${roleColors[manager.role]}`}
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {manager.full_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-xs truncate">{manager.full_name}</p>
                          <p className="text-[10px] opacity-75 truncate">{manager.job_title || 'Responsable'}</p>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${roleBadges[manager.role]?.bg}`}>
                          {roleBadges[manager.role]?.label || manager.role}
                        </span>
                      </div>
                    ) : (
                      <div
                        onClick={() => setChangingManagerServiceId(svc.id)}
                        className="cursor-pointer flex items-center justify-between p-2.5 rounded-xl border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/20 text-xs hover:bg-blue-50 transition-colors"
                      >
                        <span className="text-slate-400 italic">Aucun responsable</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          + Cliquez pour désigner
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Collaborateurs et agents du service */}
                  <div className="mt-4">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                      Collaborateurs du service ({members.length})
                    </p>
                    {members.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2 text-center">Aucun collaborateur rattaché</p>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {members.map((u) => (
                          <div
                            key={u.id}
                            onClick={() => onEditUser(u)}
                            className="cursor-pointer p-2 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-2 text-xs transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-900 dark:text-white truncate">{u.full_name}</p>
                              <p className="text-[10px] text-slate-500 truncate">{u.job_title || u.role}</p>
                            </div>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${roleBadges[u.role]?.bg}`}>
                              {roleBadges[u.role]?.label || u.role}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 2. VUE ARBORESCENCE HIÉRARCHIQUE ── */}
      {viewMode === 'hierarchy' && (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto min-h-[400px]">
          {rootUsers.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-12">Aucun collaborateur enregistré dans l'organigramme.</p>
          ) : (
            <div className="space-y-6">
              {rootUsers.map((root) => (
                <OrganigramNode
                  key={root.id}
                  user={root}
                  collaboratorsBySuperior={collaboratorsBySuperior}
                  onEditUser={onEditUser}
                  level={0}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrganigramNode({
  user,
  collaboratorsBySuperior,
  onEditUser,
  level,
}: {
  user: UserRow;
  collaboratorsBySuperior: Map<string, UserRow[]>;
  onEditUser: (u: UserRow) => void;
  level: number;
}) {
  const subordinates = collaboratorsBySuperior.get(user.id) || [];
  const [collapsed, setCollapsed] = useState(false);

  const roleColors = {
    PRESIDENT: 'border-amber-400 bg-amber-50/70 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200',
    RESPONSABLE: 'border-blue-400 bg-blue-50/70 dark:bg-blue-950/30 text-blue-950 dark:text-blue-200',
    ADMIN: 'border-purple-400 bg-purple-50/70 dark:bg-purple-950/30 text-purple-950 dark:text-purple-200',
    AGENT: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
    SUPER_ADMIN: 'border-red-400 bg-red-50 text-red-900',
  };

  return (
    <div className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-700 space-y-3">
      {/* Nœud du collaborateur */}
      <div className="flex items-center gap-3">
        <div
          onClick={() => onEditUser(user)}
          className={`cursor-pointer p-3.5 rounded-xl border-2 transition-all hover:shadow-md ${roleColors[user.role]} flex items-center gap-3 min-w-[260px] max-w-sm`}
        >
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={user.full_name} className="w-10 h-10 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
              {user.full_name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-xs truncate">{user.full_name}</p>
            <p className="text-[11px] font-medium opacity-80 truncate">{user.job_title}</p>
            <p className="text-[10px] opacity-60 truncate">
              {user.department_name ? `${user.department_name} · ` : ''}{user.service_name || 'Service principal'}
            </p>
          </div>
          {subordinates.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/10 dark:bg-white/10 font-bold shrink-0">
              {subordinates.length} coll.
            </span>
          )}
        </div>

        {subordinates.length > 0 && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs"
            title={collapsed ? 'Développer' : 'Réduire'}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Collaborateurs encadrés (Subordonnés directs) */}
      {!collapsed && subordinates.length > 0 && (
        <div className="space-y-3 pt-1">
          {subordinates.map((sub) => (
            <OrganigramNode
              key={sub.id}
              user={sub}
              collaboratorsBySuperior={collaboratorsBySuperior}
              onEditUser={onEditUser}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// COMPOSANT GESTION DES SERVICES ET DÉPARTEMENTS
// ════════════════════════════════════════════════════════════════════
export function ServicesPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; full_name: string; role: string }>>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    managerUserId: '',
    isSecretariat: false,
    receptionRules: '',
    type: 'SERVICE' as 'DEPARTEMENT' | 'SERVICE' | 'UNITE',
    parentId: '',
  });
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadData = useCallback(async () => {
    const [sRes, uRes] = await Promise.all([
      apiFetch<{ services: ServiceItem[] }>('/api/services'),
      apiFetch<{ users: Array<{ id: string; full_name: string; role: string }> }>('/api/users'),
    ]);
    setServices(sRes.services);
    setUsers(uRes.users);
  }, []);

  useEffect(() => {
    loadData().catch(() => {});
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFeedback('');
    try {
      await apiFetch('/api/services', { method: 'POST', body: JSON.stringify(form) });
      setShowCreate(false);
      setForm({
        name: '',
        description: '',
        managerUserId: '',
        isSecretariat: false,
        receptionRules: '',
        type: 'SERVICE',
        parentId: '',
      });
      setFeedback('Entité organisationnelle créée avec succès.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleDeleteService = async (serviceId: string, serviceName: string) => {
    if (!window.confirm(`Voulez-vous vraiment supprimer "${serviceName}" ?`)) {
      return;
    }
    setError('');
    setFeedback('');
    try {
      await apiFetch(`/api/services/${serviceId}`, { method: 'DELETE' });
      setFeedback(`"${serviceName}" a été supprimé avec succès.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression.');
    }
  };

  const parentOptions = useMemo(() => services.filter((s) => s.type === 'DEPARTEMENT'), [services]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Départements, Services &amp; Unités
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configurez l'organisation flexible de votre entreprise : départements, services rattachés et unités internes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold whitespace-nowrap"
        >
          <Building2 className="w-4 h-4" />
          <span>Nouvelle entité organisationnelle</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-sm text-emerald-800 dark:text-emerald-300">
          {feedback}
        </div>
      )}
      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      {showCreate && (
        <form onSubmit={handleCreate} className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h2 className="font-display text-base font-bold">Créer une entité administrative</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Type d'entité</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="SERVICE">Service</option>
                <option value="DEPARTEMENT">Département (Direction)</option>
                <option value="UNITE">Unité interne / Cellule</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Nom de l'entité *</label>
              <input
                type="text"
                required
                placeholder="ex: Direction des Finances, Service Courrier..."
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Département parent (si service)</label>
              <select
                value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="">Aucun (Département autonome)</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Responsable / Chef d'entité</label>
              <select
                value={form.managerUserId}
                onChange={(e) => setForm({ ...form, managerUserId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="">Sélectionner un responsable</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1">Description</label>
              <input
                type="text"
                placeholder="Missions et attributions..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={form.isSecretariat}
              onChange={(e) => setForm({ ...form, isSecretariat: e.target.checked })}
            />
            <span>Désigner comme point d'entrée Secrétariat officiel</span>
          </label>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg border text-xs">
              Annuler
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold">
              Enregistrer l'entité
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((s) => (
          <div key={s.id} className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  {s.type || 'SERVICE'}
                </span>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">{s.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                {s.is_secretariat === 1 && (
                  <span className="text-[11px] font-mono text-indigo-700 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded">
                    Secrétariat
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleDeleteService(s.id, s.name)}
                  className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                  title="Supprimer cette entité"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {s.parent_name && (
              <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                Département de rattachement : {s.parent_name}
              </p>
            )}
            <p className="text-xs text-slate-500">{s.description || 'Aucune description'}</p>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1">
              <p>
                <span className="text-slate-400">Responsable : </span>
                <span className="font-semibold">{s.manager_name || 'Non désigné'}</span>
              </p>
              <p className="font-mono text-slate-500 tabular-nums">
                {s.member_count ?? 0} collaborateur(s) · {s.active_mail_count ?? 0} courrier(s) actif(s)
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
