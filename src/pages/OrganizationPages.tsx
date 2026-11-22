import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Check, Key, Shield, ShieldCheck, UserPlus, X, Settings2 } from 'lucide-react';
import { apiFetch } from '../api/client.ts';
import type { ServiceItem, UserPermissions, UserRole } from '../types/nexora.ts';

interface UserRow {
  id: string;
  full_name: string;
  job_title: string;
  email: string;
  phone: string;
  avatar_url?: string;
  role: UserRole;
  is_active: number;
  permissions: UserPermissions;
  services: Array<{ service_id: string; service_name: string; is_secretariat: number }>;
}

const PERMISSION_GROUPS = [
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

export function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showAdvancedPermsInAdd, setShowAdvancedPermsInAdd] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editPerms, setEditPerms] = useState<UserPermissions>({});
  const [editServiceIds, setEditServiceIds] = useState<string[]>([]);
  const [editRole, setEditRole] = useState<UserRole>('AGENT');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [form, setForm] = useState({
    fullName: '',
    jobTitle: '',
    email: '',
    phone: '',
    password: '',
    role: 'AGENT' as UserRole,
    serviceIds: [] as string[],
    permissions: {} as UserPermissions,
  });

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

  const handleOpenEdit = (u: UserRow) => {
    setEditingUser(u);
    setEditPerms(u.permissions || {});
    setEditServiceIds(u.services.map((s) => s.service_id));
    setEditRole(u.role);
    setEditJobTitle(u.job_title);
    setError('');
    setFeedback('');
  };

  const handleSaveUserPermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    setError('');
    try {
      await apiFetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: editRole,
          jobTitle: editJobTitle,
          permissions: editPerms,
          serviceIds: editServiceIds,
        }),
      });
      setFeedback(`Permissions et affectations de ${editingUser.full_name} mises à jour avec succès.`);
      setEditingUser(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur modification permissions');
    } finally {
      setSavingEdit(false);
    }
  };

  const applyPreset = (type: 'SECRETARIAT' | 'AGENT' | 'ALL' | 'CLEAR') => {
    if (type === 'CLEAR') {
      setEditPerms({});
      return;
    }
    if (type === 'ALL') {
      const all: Record<string, boolean> = {};
      for (const group of PERMISSION_GROUPS) {
        for (const item of group.items) {
          all[item.key] = true;
        }
      }
      setEditPerms(all as UserPermissions);
      return;
    }
    if (type === 'SECRETARIAT') {
      setEditPerms({
        secretariat_receive: true,
        secretariat_register: true,
        secretariat_ai_analyze: true,
        secretariat_orient: true,
        secretariat_final_control: true,
        secretariat_dispatch: true,
        secretariat_archive: true,
        can_view_all_services: true,
        can_view_confidential: true,
      });
      return;
    }
    if (type === 'AGENT') {
      setEditPerms({
        can_view_confidential: false,
        can_view_all_services: false,
      });
      return;
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFeedback('');
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName,
          jobTitle: form.jobTitle,
          email: form.email,
          phone: form.phone,
          password: form.password,
          role: form.role,
          serviceIds: form.serviceIds,
          permissions: form.permissions,
        }),
      });
      setShowAdd(false);
      setForm({ fullName: '', jobTitle: '', email: '', phone: '', password: '', role: 'AGENT', serviceIds: [], permissions: {} });
      setFeedback('Utilisateur créé et affecté aux services sélectionnés.');
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Utilisateurs &amp; Permissions</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gérez les comptes, rôles, affectations de services et configurez finement les autorisations d’accès.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold whitespace-nowrap"
        >
          <UserPlus className="w-4 h-4" />
          <span>Ajouter un utilisateur</span>
        </button>
      </div>

      {feedback && <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-sm text-emerald-800 dark:text-emerald-300">{feedback}</div>}
      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      {/* MODAL: Edit User Permissions & Services */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Gérer les autorisations : {editingUser.full_name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {editingUser.email} · Rôle actuel : <span className="font-mono font-semibold">{editingUser.role}</span>
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

            {/* Constitution Rule notice */}
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-300">
              <strong>Règle de sécurité :</strong> L’administrateur configure l’ensemble des autorisations opérationnelles. Le <em>pouvoir de signature présidentielle</em> est strictement réservé au Président et géré uniquement par mandat de délégation directe.
            </div>

            <form onSubmit={handleSaveUserPermissions} className="space-y-5">
              {/* Profile fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Fonction / Poste
                  </label>
                  <input
                    type="text"
                    value={editJobTitle}
                    onChange={(e) => setEditJobTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Rôle dans l’organisation
                  </label>
                  <select
                    value={editRole}
                    disabled={editingUser.role === 'PRESIDENT'}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs disabled:opacity-50"
                  >
                    <option value="AGENT">Agent</option>
                    <option value="RESPONSABLE">Responsable (Chef de service)</option>
                    <option value="ADMIN">Administrateur</option>
                    {editingUser.role === 'PRESIDENT' && <option value="PRESIDENT">Président</option>}
                  </select>
                </div>
              </div>

              {/* Service Assignment */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Affectation aux services &amp; départements
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {services.map((s) => {
                    const checked = editServiceIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 font-medium'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setEditServiceIds(
                              e.target.checked
                                ? [...editServiceIds, s.id]
                                : editServiceIds.filter((id) => id !== s.id)
                            );
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span>{s.name}</span>
                        {s.is_secretariat === 1 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 ml-auto font-mono">
                            Secrétariat
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Presets */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-slate-500 font-medium">Modèles rapides :</span>
                <button
                  type="button"
                  onClick={() => applyPreset('SECRETARIAT')}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                >
                  Secrétariat complet
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('AGENT')}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200"
                >
                  Agent standard
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('ALL')}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                >
                  Tout cocher
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('CLEAR')}
                  className="px-2.5 py-1 rounded-md text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline"
                >
                  Réinitialiser
                </button>
              </div>

              {/* Granular Permissions Checkboxes */}
              <div className="space-y-4 pt-1">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.category} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2.5">
                    <h3 className="font-semibold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                      {group.category}
                    </h3>
                    <div className="grid grid-cols-1 gap-2">
                      {group.items.map((item) => {
                        const isGranted = Boolean(editPerms[item.key]);
                        return (
                          <label
                            key={item.key}
                            className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-white dark:hover:bg-slate-800 cursor-pointer text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={isGranted}
                              onChange={(e) => {
                                setEditPerms({ ...editPerms, [item.key]: e.target.checked });
                              }}
                              className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">{item.label}</p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.desc}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{savingEdit ? 'Enregistrement…' : 'Enregistrer les autorisations'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FORM: Create User */}
      {showAdd && (
        <form onSubmit={handleCreate} className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h2 className="font-display text-base font-bold">Nouvel utilisateur</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <input
              type="text"
              required
              placeholder="Nom et prénom *"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
            <input
              type="text"
              required
              placeholder="Fonction / Poste *"
              value={form.jobTitle}
              onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
            <input
              type="email"
              required
              placeholder="E-mail *"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
            <input
              type="tel"
              placeholder="Téléphone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="Mot de passe initial (min. 8 car.) *"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="AGENT">Agent</option>
              <option value="RESPONSABLE">Responsable (Chef de service)</option>
              <option value="ADMIN">Administrateur</option>
            </select>
          </div>

          <div>
            <p className="text-xs font-semibold mb-2">Services d’affectation :</p>
            <div className="flex flex-wrap gap-3 text-xs">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.serviceIds.includes(s.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...form.serviceIds, s.id]
                        : form.serviceIds.filter((id) => id !== s.id);
                      setForm({ ...form, serviceIds: next });
                    }}
                  />
                  <span>{s.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Quick permissions toggles */}
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Autorisations initiales</span>
              <button
                type="button"
                onClick={() => setShowAdvancedPermsInAdd(!showAdvancedPermsInAdd)}
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                {showAdvancedPermsInAdd ? 'Masquer le détail' : 'Personnaliser toutes les autorisations (détail)'}
              </button>
            </div>

            <div className="flex flex-wrap gap-6 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.permissions.secretariat_receive && form.permissions.secretariat_register)}
                  onChange={(e) => {
                    const c = e.target.checked;
                    setForm({
                      ...form,
                      permissions: {
                        ...form.permissions,
                        secretariat_receive: c,
                        secretariat_register: c,
                        secretariat_ai_analyze: c,
                        secretariat_orient: c,
                        secretariat_final_control: c,
                        secretariat_dispatch: c,
                        secretariat_archive: c,
                        can_view_all_services: c,
                      },
                    });
                  }}
                />
                <span>Attribuer le pack complet Secrétariat</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.permissions.can_view_confidential)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      permissions: { ...form.permissions, can_view_confidential: e.target.checked },
                    })
                  }
                />
                <span>Accès aux courriers confidentiels</span>
              </label>
            </div>

            {showAdvancedPermsInAdd && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-3">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.category} className="space-y-1">
                    <p className="text-[11px] font-bold text-slate-500 uppercase">{group.category}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {group.items.map((item) => (
                        <label key={item.key} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(form.permissions[item.key])}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                permissions: { ...form.permissions, [item.key]: e.target.checked },
                              })
                            }
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg border text-xs">
              Annuler
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold">
              Créer le compte
            </button>
          </div>
        </form>
      )}

      {/* TABLE: Users list */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500">
              <th className="py-3 px-4">Utilisateur</th>
              <th className="py-3 px-4">Rôle</th>
              <th className="py-3 px-4">Services</th>
              <th className="py-3 px-4">Statut</th>
              <th className="py-3 px-4 text-right">Actions &amp; Autorisations</th>
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
                      <p className="text-xs text-slate-500 truncate">
                        {u.job_title} · {u.email}
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
                  {u.services.map((s) => s.service_name).join(', ') || '—'}
                </td>
                <td className="py-3 px-4 text-xs">
                  <span className={u.is_active === 1 ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-red-600'}>
                    {u.is_active === 1 ? 'Actif' : 'Désactivé'}
                  </span>
                </td>
                <td className="py-3 px-4 text-right space-x-3">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(u)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    <span>Permissions</span>
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
    </div>
  );
}

export function ServicesPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; full_name: string; role: string }>>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', managerUserId: '', isSecretariat: false, receptionRules: '' });
  const [error, setError] = useState('');

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
    try {
      await apiFetch('/api/services', { method: 'POST', body: JSON.stringify(form) });
      setShowCreate(false);
      setForm({ name: '', description: '', managerUserId: '', isSecretariat: false, receptionRules: '' });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Services &amp; Départements</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Chaque service possède un Responsable (destinataire des alertes e-mail lorsqu’un agent reçoit un courrier).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold whitespace-nowrap"
        >
          <Building2 className="w-4 h-4" />
          <span>Créer un service</span>
        </button>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      {showCreate && (
        <form onSubmit={handleCreate} className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              required
              placeholder="Nom du service *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
            <select
              value={form.managerUserId}
              onChange={(e) => setForm({ ...form, managerUserId: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">Responsable / Chef de département...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role})
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm sm:col-span-2"
            />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={form.isSecretariat}
              onChange={(e) => setForm({ ...form, isSecretariat: e.target.checked })}
            />
            <span>Désigner comme service Secrétariat</span>
          </label>
          <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold">
            Enregistrer le service
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((s) => (
          <div key={s.id} className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">{s.name}</h3>
              {s.is_secretariat === 1 && (
                <span className="text-[11px] font-mono text-indigo-700 dark:text-indigo-400">Secrétariat</span>
              )}
            </div>
            <p className="text-xs text-slate-500">{s.description}</p>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1">
              <p>
                <span className="text-slate-400">Chef de département : </span>
                <span className="font-medium">{s.manager_name || 'Non désigné'}</span>
              </p>
              <p className="font-mono text-slate-500 tabular-nums">
                {s.member_count ?? 0} membres · {s.active_mail_count ?? 0} courriers actifs
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
