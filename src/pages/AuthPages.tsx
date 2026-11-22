import React, { useState } from 'react';
import { ArrowLeft, Building2, KeyRound, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../api/client.ts';
import { NexoraLogo } from '../components/common/NexoraLogo.tsx';
import { useAuth } from '../context/AuthContext.tsx';

type AuthScreenMode = 'login' | 'register' | 'forgot';

interface AuthPagesProps {
  initialMode: AuthScreenMode;
  onBackPublic: () => void;
}

const DEMO_ACCOUNTS = [
  { id: 'usr_demo_admin', label: 'Admin Entreprise', name: 'Codjo Dossou', email: 'admin@nexorademo.bj' },
  { id: 'usr_demo_president', label: 'Président', name: 'Sébastien Houngbédji', email: 'president@nexorademo.bj' },
  { id: 'usr_demo_resp_fin', label: 'Responsable Finances', name: 'Aminata Zinsou', email: 'finances@nexorademo.bj' },
  { id: 'usr_demo_resp_jur', label: 'Responsable Juridique', name: 'Me Brice Agbessi', email: 'juridique@nexorademo.bj' },
  { id: 'usr_demo_agent_sec', label: 'Secrétariat Central', name: 'Nadine Kpadonou', email: 'secretariat@nexorademo.bj' },
  { id: 'usr_demo_agent_fin', label: 'Agent Finances', name: 'Romuald Boko', email: 'agent.finances@nexorademo.bj' },
  { id: 'usr_superadmin', label: 'Super Admin NEXORA', name: 'Koffi Mensah', email: 'superadmin@nexora.bj' },
];

export function AuthPages({ initialMode, onBackPublic }: AuthPagesProps) {
  const { login, demoLogin, registerCompany } = useAuth();
  const [mode, setMode] = useState<AuthScreenMode>(initialMode);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Forgot password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetMessage, setResetMessage] = useState('');

  // Company Registration state (all 12 company fields + 1st Admin user)
  const [companyForm, setCompanyForm] = useState({
    legalName: '',
    tradeName: '',
    sector: 'Services & Conseil',
    legalForm: 'SARL',
    country: 'Bénin',
    city: 'Cotonou',
    address: '',
    phone: '',
    email: '',
    website: '',
    taxId: '',
    logoUrl: '',
  });
  const [adminForm, setAdminForm] = useState({
    fullName: '',
    jobTitle: 'Directeur Administratif',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async (userId: string) => {
    setError('');
    setSubmitting(true);
    try {
      await demoLogin(userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion démo');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (adminForm.password !== adminForm.confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setSubmitting(true);
    try {
      await registerCompany({ company: companyForm, admin: adminForm });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création du compte.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetMessage('');
    setSubmitting(true);
    try {
      const res = await apiFetch<{ message: string; previewResetHint?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: resetEmail }),
      });
      setResetMessage(res.previewResetHint ? `${res.message} ${res.previewResetHint}` : res.message);
      setResetStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: resetEmail, code: resetCode, newPassword }),
      });
      setResetMessage(res.message);
      setMode('login');
      setEmail(resetEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <header className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
        <button
          type="button"
          onClick={onBackPublic}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour au site NEXORA</span>
        </button>
        <NexoraLogo />
        <div className="flex items-center gap-3 text-sm">
          {mode !== 'login' ? (
            <button type="button" onClick={() => setMode('login')} className="font-medium text-blue-700 dark:text-blue-400">
              Se connecter
            </button>
          ) : (
            <button type="button" onClick={() => setMode('register')} className="font-medium text-blue-700 dark:text-blue-400">
              Créer une entreprise
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4 lg:p-8">
        {mode === 'login' && (
          <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 p-6 lg:p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Connexion à NEXORA</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Accédez à l’espace de travail sécurisé de votre organisation.
              </p>

              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Adresse e-mail</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="prenom.nom@entreprise.bj"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Mot de passe</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>

                {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
                {resetMessage && <p className="text-xs text-emerald-700 dark:text-emerald-400">{resetMessage}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors disabled:opacity-60"
                >
                  {submitting ? 'Connexion...' : 'Se connecter'}
                </button>
              </form>

              <div className="mt-4 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setMode('forgot');
                  }}
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  Mot de passe oublié ?
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setMode('register');
                  }}
                  className="font-medium text-blue-700 dark:text-blue-400"
                >
                  Nouvelle entreprise (14j gratuits)
                </button>
              </div>
            </div>

            {/* Demo Role Switcher */}
            <div className="lg:col-span-6 p-6 lg:p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
                <ShieldCheck className="w-4 h-4" />
                <span>Environnement de démonstration · Cotonou, Bénin</span>
              </div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white mt-2">
                NEXORA DEMO GROUP (Accès direct par rôle)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Testez les parcours complets avec des données fictives réalistes (mot de passe manuel : Demo2026! / Super Admin : Nexora2026!).
              </p>

              <div className="mt-4 space-y-2">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    disabled={submitting}
                    onClick={() => handleDemoLogin(acc.id)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{acc.label}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {acc.name} · {acc.email}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-400 shrink-0 ml-3">Ouvrir</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {mode === 'forgot' && (
          <div className="w-full max-w-md p-6 lg:p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-2">
              <KeyRound className="w-5 h-5" />
              <span className="text-xs font-semibold">Récupération d’accès</span>
            </div>
            <h1 className="font-display text-2xl font-bold">Mot de passe oublié</h1>

            {resetStep === 1 ? (
              <form onSubmit={handleRequestReset} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Adresse e-mail du compte</label>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold"
                >
                  Recevoir un code de réinitialisation
                </button>
              </form>
            ) : (
              <form onSubmit={handleConfirmReset} className="mt-5 space-y-4">
                {resetMessage && <p className="text-xs text-emerald-700 dark:text-emerald-400">{resetMessage}</p>}
                <div>
                  <label className="block text-xs font-medium mb-1">Code à 6 chiffres</label>
                  <input
                    type="text"
                    required
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Nouveau mot de passe (min. 8 caractères)</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold"
                >
                  Réinitialiser le mot de passe
                </button>
              </form>
            )}
          </div>
        )}

        {mode === 'register' && (
          <div className="w-full max-w-3xl p-6 lg:p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-1">
              <Building2 className="w-4 h-4" />
              <span className="text-xs font-semibold">Création d’espace entreprise · Essai gratuit 14 jours</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Inscrire votre organisation sur NEXORA
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Le premier utilisateur créé devient automatiquement Administrateur et les services de base sont initialisés.
            </p>

            <form onSubmit={handleRegister} className="mt-6 space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white pb-2 border-b border-slate-200 dark:border-slate-800">
                  1. Informations de l’entreprise
                </h2>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1">Dénomination sociale *</label>
                    <input
                      type="text"
                      required
                      value={companyForm.legalName}
                      onChange={(e) => setCompanyForm({ ...companyForm, legalName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Nom commercial</label>
                    <input
                      type="text"
                      value={companyForm.tradeName}
                      onChange={(e) => setCompanyForm({ ...companyForm, tradeName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Secteur d’activité *</label>
                    <input
                      type="text"
                      required
                      value={companyForm.sector}
                      onChange={(e) => setCompanyForm({ ...companyForm, sector: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Forme juridique *</label>
                    <select
                      value={companyForm.legalForm}
                      onChange={(e) => setCompanyForm({ ...companyForm, legalForm: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    >
                      <option value="SARL">SARL</option>
                      <option value="SA">SA</option>
                      <option value="SAS">SAS</option>
                      <option value="Institution Publique">Institution Publique</option>
                      <option value="ONG / Association">ONG / Association</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Pays *</label>
                    <input
                      type="text"
                      required
                      value={companyForm.country}
                      onChange={(e) => setCompanyForm({ ...companyForm, country: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Ville *</label>
                    <input
                      type="text"
                      required
                      value={companyForm.city}
                      onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium mb-1">Adresse complète</label>
                    <input
                      type="text"
                      value={companyForm.address}
                      onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Téléphone professionnel</label>
                    <input
                      type="tel"
                      value={companyForm.phone}
                      onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">E-mail professionnel *</label>
                    <input
                      type="email"
                      required
                      value={companyForm.email}
                      onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Site internet</label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={companyForm.website}
                      onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Identifiant fiscal / IFU / RCCM</label>
                    <input
                      type="text"
                      value={companyForm.taxId}
                      onChange={(e) => setCompanyForm({ ...companyForm, taxId: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white pb-2 border-b border-slate-200 dark:border-slate-800">
                  2. Premier utilisateur (rôle Admin attribué automatiquement)
                </h2>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1">Nom et prénom *</label>
                    <input
                      type="text"
                      required
                      value={adminForm.fullName}
                      onChange={(e) => setAdminForm({ ...adminForm, fullName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Fonction *</label>
                    <input
                      type="text"
                      required
                      value={adminForm.jobTitle}
                      onChange={(e) => setAdminForm({ ...adminForm, jobTitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Adresse e-mail de connexion *</label>
                    <input
                      type="email"
                      required
                      value={adminForm.email}
                      onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Téléphone</label>
                    <input
                      type="tel"
                      value={adminForm.phone}
                      onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Mot de passe (min. 8 car.) *</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={adminForm.password}
                      onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Confirmation mot de passe *</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={adminForm.confirmPassword}
                      onChange={(e) => setAdminForm({ ...adminForm, confirmPassword: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors disabled:opacity-60"
              >
                {submitting ? 'Initialisation de l’espace...' : 'Créer l’entreprise et démarrer l’essai gratuit (14 jours)'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
