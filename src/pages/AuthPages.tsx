import React, { useState } from 'react';
import { ArrowLeft, Building2, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../api/client.ts';
import { useAuth } from '../context/AuthContext.tsx';

type AuthScreenMode = 'login' | 'register' | 'forgot';

interface AuthPagesProps {
  initialMode: AuthScreenMode;
  onBackPublic: () => void;
}

const DEMO_ACCOUNTS = [
  { id: 'usr_demo_admin', label: 'Admin Entreprise', name: 'Codjo Dossou', email: 'admin@nexorademo.bj' },
  { id: 'usr_demo_president', label: 'Président', name: 'Sébastien Houngbédji', email: 'president@nexorademo.bj' },
  { id: 'usr_demo_resp_fin', label: 'Resp. Finances', name: 'Aminata Zinsou', email: 'finances@nexorademo.bj' },
  { id: 'usr_demo_resp_jur', label: 'Resp. Juridique', name: 'Me Brice Agbessi', email: 'juridique@nexorademo.bj' },
  { id: 'usr_demo_agent_sec', label: 'Secrétariat Central', name: 'Nadine Kpadonou', email: 'secretariat@nexorademo.bj' },
  { id: 'usr_demo_agent_fin', label: 'Agent Finances', name: 'Romuald Boko', email: 'agent.finances@nexorademo.bj' },
  { id: 'usr_superadmin', label: 'Super Admin NEXORA', name: 'Koffi Mensah', email: 'superadmin@nexora.bj' },
];

export function AuthPages({ initialMode, onBackPublic }: AuthPagesProps) {
  const { login, demoLogin, registerCompany } = useAuth();
  const [mode, setMode] = useState<AuthScreenMode>(initialMode);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetMessage, setResetMessage] = useState('');

  // Register
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
    try { await login(email, password); }
    catch (err) { setError(err instanceof Error ? err.message : 'Erreur de connexion'); }
    finally { setSubmitting(false); }
  };

  const handleDemoLogin = async (userId: string) => {
    setError('');
    setSubmitting(true);
    try { await demoLogin(userId); }
    catch (err) { setError(err instanceof Error ? err.message : 'Erreur de connexion démo'); }
    finally { setSubmitting(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (adminForm.password !== adminForm.confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setSubmitting(true);
    try { await registerCompany({ company: companyForm, admin: adminForm }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Erreur lors de la création du compte.'); }
    finally { setSubmitting(false); }
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
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur'); }
    finally { setSubmitting(false); }
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
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {/* ─── PANNEAU GAUCHE DÉCORATIF ET COMPACT (≥ lg) ─── */}
      <div className="hidden lg:flex flex-col justify-between w-96 xl:w-[420px] bg-gradient-to-br from-indigo-700 via-indigo-600 to-purple-700 text-white p-8 relative overflow-hidden flex-shrink-0">
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
        
        {/* En-tête panneau */}
        <div className="relative z-10 flex items-center gap-3">
          <img
            src="/logo-nexora.png"
            alt="Nexora"
            className="w-10 h-10 rounded-xl object-cover bg-white/20 p-1 shadow-md"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="font-extrabold text-2xl tracking-tight">NEXORA</span>
        </div>

        {/* Message contextuel */}
        <div className="relative z-10 my-auto py-8">
          <span className="inline-block px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold mb-4 backdrop-blur-sm">
            Plateforme IA Documentaire
          </span>
          <h2 className="text-3xl font-extrabold leading-tight mb-4">
            {mode === 'login' ? 'Votre courrier, notre intelligence.' : 'Rejoignez NEXORA dès aujourd’hui.'}
          </h2>
          <p className="text-indigo-100 text-sm leading-relaxed mb-6">
            Gestion sécurisée des courriers, reconnaissance optique OCR Gemini, circuits d’approbation et traçabilité légale.
          </p>

          <div className="space-y-3">
            {[
              { icon: '🤖', title: 'OCR & Extraction IA Gemini', desc: 'Préremplissage instantané' },
              { icon: '🔄', title: 'Workflows & Approbations', desc: 'Circuits d’avis et signatures' },
              { icon: '🔒', title: 'Données cloisonnées', desc: 'Confinement par entreprise' },
            ].map((f) => (
              <div key={f.title} className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/10 rounded-xl p-3">
                <span className="text-lg w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">{f.icon}</span>
                <div>
                  <div className="text-xs font-bold text-white">{f.title}</div>
                  <div className="text-[11px] text-indigo-200">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pied de panneau */}
        <div className="relative z-10 text-[11px] text-indigo-200">
          NEXORA &copy; {new Date().getFullYear()} · Tous droits réservés
        </div>
      </div>

      {/* ─── PANNEAU DROIT FORMULAIRE COMPACT ─── */}
      <div className="flex-1 flex flex-col justify-center items-center p-4 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/80">
          
          {/* Top Bar Mobile Brand & Back */}
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={onBackPublic}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Retour au site</span>
            </button>

            <div className="flex lg:hidden items-center gap-2">
              <img src="/logo-nexora.png" alt="Nexora" className="w-6 h-6 rounded-md object-cover" />
              <span className="font-extrabold text-sm text-slate-900">NEXORA</span>
            </div>
          </div>

          {/* ══════════════ CONNEXION ══════════════ */}
          {mode === 'login' && (
            <div>
              <div className="mb-6">
                <h1 className="text-2xl font-extrabold text-slate-900">Bon retour 👋</h1>
                <p className="text-xs text-slate-500 mt-1">Connectez-vous à l'espace de votre organisation.</p>
              </div>

              {error && (
                <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Adresse e-mail</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nom@organisation.bj"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none transition-all"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">Mot de passe</label>
                    <button
                      type="button"
                      onClick={() => { setError(''); setMode('forgot'); }}
                      className="text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      Oublié ?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/30 transition-all disabled:opacity-60"
                >
                  {submitting ? 'Connexion en cours...' : 'Se connecter'}
                </button>
              </form>

              {/* Rôles de Démo Compact */}
              <div className="mt-6 pt-5 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 mb-2">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Accès rapide DÉMO (Cotonou, Bénin)</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {DEMO_ACCOUNTS.slice(0, 6).map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      disabled={submitting}
                      onClick={() => handleDemoLogin(acc.id)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-left hover:border-indigo-500 hover:bg-indigo-50/50 transition-all text-[11px] truncate"
                    >
                      <span className="font-bold text-slate-800 block truncate">{acc.label}</span>
                      <span className="text-slate-400 block truncate">{acc.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 text-center text-xs text-slate-500">
                Pas encore de compte ?{' '}
                <button
                  type="button"
                  onClick={() => { setError(''); setMode('register'); }}
                  className="font-bold text-indigo-600 hover:underline"
                >
                  Essai gratuit 14 jours
                </button>
              </div>
            </div>
          )}

          {/* ══════════════ INSCRIPTION COMPACTE ══════════════ */}
          {mode === 'register' && (
            <div>
              <div className="mb-5">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 mb-1">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Essai gratuit 14 jours</span>
                </div>
                <h1 className="text-xl font-extrabold text-slate-900">Inscrire votre organisation</h1>
                <p className="text-xs text-slate-500 mt-0.5">Premier compte administrateur initialisé.</p>
              </div>

              {error && (
                <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  ⚠️ {error}
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-4">
                {/* Bloc 1 : Société */}
                <div className="space-y-2.5">
                  <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">1. L’ENTREPRISE</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <input
                        type="text"
                        required
                        placeholder="Dénomination sociale *"
                        value={companyForm.legalName}
                        onChange={(e) => setCompanyForm({ ...companyForm, legalName: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:border-indigo-600 outline-none"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        required
                        placeholder="Secteur *"
                        value={companyForm.sector}
                        onChange={(e) => setCompanyForm({ ...companyForm, sector: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:border-indigo-600 outline-none"
                      />
                    </div>
                    <div>
                      <select
                        value={companyForm.legalForm}
                        onChange={(e) => setCompanyForm({ ...companyForm, legalForm: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:border-indigo-600 outline-none"
                      >
                        <option>SARL</option><option>SA</option><option>SAS</option>
                        <option>Institution Publique</option><option>ONG / Association</option>
                      </select>
                    </div>
                    <div>
                      <input
                        type="text"
                        required
                        placeholder="Pays *"
                        value={companyForm.country}
                        onChange={(e) => setCompanyForm({ ...companyForm, country: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:border-indigo-600 outline-none"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        required
                        placeholder="Ville *"
                        value={companyForm.city}
                        onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:border-indigo-600 outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="email"
                        required
                        placeholder="E-mail professionnel entreprise *"
                        value={companyForm.email}
                        onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:border-indigo-600 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Bloc 2 : Admin */}
                <div className="space-y-2.5 pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">2. L’ADMINISTRATEUR</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <input
                        type="text"
                        required
                        placeholder="Nom & Prénom *"
                        value={adminForm.fullName}
                        onChange={(e) => setAdminForm({ ...adminForm, fullName: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:border-indigo-600 outline-none"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        required
                        placeholder="Fonction *"
                        value={adminForm.jobTitle}
                        onChange={(e) => setAdminForm({ ...adminForm, jobTitle: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:border-indigo-600 outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="email"
                        required
                        placeholder="E-mail de connexion *"
                        value={adminForm.email}
                        onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:border-indigo-600 outline-none"
                      />
                    </div>
                    <div>
                      <input
                        type="password"
                        required
                        minLength={8}
                        placeholder="Mot de passe (8+ car.) *"
                        value={adminForm.password}
                        onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:border-indigo-600 outline-none"
                      />
                    </div>
                    <div>
                      <input
                        type="password"
                        required
                        minLength={8}
                        placeholder="Confirmer mot de passe *"
                        value={adminForm.confirmPassword}
                        onChange={(e) => setAdminForm({ ...adminForm, confirmPassword: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:border-indigo-600 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/30 transition-all disabled:opacity-60"
                >
                  {submitting ? 'Création de l’espace...' : 'Démarrer l’essai gratuit (14 jours)'}
                </button>
              </form>

              <div className="mt-4 text-center text-xs text-slate-500">
                Déjà inscrit ?{' '}
                <button
                  type="button"
                  onClick={() => { setError(''); setMode('login'); }}
                  className="font-bold text-indigo-600 hover:underline"
                >
                  Se connecter
                </button>
              </div>
            </div>
          )}

          {/* ══════════════ MOT DE PASSE OUBLIÉ ══════════════ */}
          {mode === 'forgot' && (
            <div>
              <div className="mb-6">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 mb-1">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Récupération</span>
                </div>
                <h1 className="text-xl font-extrabold text-slate-900">Mot de passe oublié</h1>
              </div>

              {resetStep === 1 ? (
                <form onSubmit={handleRequestReset} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">E-mail du compte</label>
                    <input
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 outline-none"
                      placeholder="vous@organisation.bj"
                    />
                  </div>
                  {error && <div className="text-xs text-red-600">{error}</div>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm"
                  >
                    {submitting ? 'Envoi...' : 'Recevoir le code'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleConfirmReset} className="space-y-4">
                  {resetMessage && <div className="text-xs text-emerald-700 bg-emerald-50 p-3 rounded-xl">{resetMessage}</div>}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Code à 6 chiffres</label>
                    <input
                      type="text"
                      required
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm tracking-widest text-center font-mono focus:border-indigo-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nouveau mot de passe (8+ car.)</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 outline-none"
                    />
                  </div>
                  {error && <div className="text-xs text-red-600">{error}</div>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm"
                  >
                    {submitting ? 'Validation...' : 'Réinitialiser le mot de passe'}
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setResetStep(1); }}
                className="mt-4 text-xs font-bold text-indigo-600 hover:underline block text-center w-full"
              >
                ← Retour à la connexion
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
