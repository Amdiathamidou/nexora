import React, { useState } from 'react';
import { ArrowLeft, Building, Building2, Check, Eye, EyeOff, Gift, KeyRound, Lock, ShieldCheck, Sparkles, Stars, UploadCloud, User } from 'lucide-react';
import { apiFetch } from '../api/client.ts';
import { useAuth } from '../context/AuthContext.tsx';

type AuthScreenMode = 'login' | 'register' | 'forgot';
type EntityType = 'entreprise' | 'particulier';

interface AuthPagesProps {
  initialMode: AuthScreenMode;
  onBackPublic: () => void;
}

const INDICATIFS_PAYS = [
  { indicatif: '+229', pays: 'Bénin', nom: 'Bénin (+229)' },
  { indicatif: '+228', pays: 'Togo', nom: 'Togo (+228)' },
  { indicatif: '+225', pays: "Côte d'Ivoire", nom: "Côte d'Ivoire (+225)" },
  { indicatif: '+221', pays: 'Sénégal', nom: 'Sénégal (+221)' },
  { indicatif: '+226', pays: 'Burkina Faso', nom: 'Burkina Faso (+226)' },
  { indicatif: '+227', pays: 'Niger', nom: 'Niger (+227)' },
  { indicatif: '+223', pays: 'Mali', nom: 'Mali (+223)' },
  { indicatif: '+224', pays: 'Guinée', nom: 'Guinée (+224)' },
  { indicatif: '+233', pays: 'Ghana', nom: 'Ghana (+233)' },
  { indicatif: '+234', pays: 'Nigeria', nom: 'Nigeria (+234)' },
  { indicatif: '+237', pays: 'Cameroun', nom: 'Cameroun (+237)' },
  { indicatif: '+241', pays: 'Gabon', nom: 'Gabon (+241)' },
  { indicatif: '+33', pays: 'France', nom: 'France (+33)' },
  { indicatif: '+1', pays: 'Canada', nom: 'Canada (+1)' },
  { indicatif: '+1', pays: 'États-Unis', nom: 'États-Unis (+1)' },
];

const SECTEURS_ACTIVITE = [
  'Services & Conseil',
  'Commerce & Distribution',
  'BTP & Immobilier',
  'Santé & Pharmacie',
  'Banque & Microfinance',
  'Éducation & Formation',
  'Sport & Loisirs',
  'Mairie / Administration Publique',
  'Autre',
];

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

  // Mode inscription : type d'entité (Entreprise vs Particulier comme dans XAMPP)
  const [entityType, setEntityType] = useState<EntityType>('entreprise');

  // Champs de connexion
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Champs Mot de passe oublié
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetMessage, setResetMessage] = useState('');

  // ═══ FORMULAIRE D'INSCRIPTION COMPLET XAMPP ═══
  // Section Entreprise
  const [entName, setEntName] = useState('');
  const [entSecteur, setEntSecteur] = useState('Services & Conseil');
  const [entIfu, setEntIfu] = useState('');
  const [entIndicatif, setEntIndicatif] = useState('+229');
  const [entNumero, setEntNumero] = useState('');
  const [entAdresse, setEntAdresse] = useState('');
  const [entVille, setEntVille] = useState('Cotonou');
  const [entPays, setEntPays] = useState('Bénin');
  const [entAdminName, setEntAdminName] = useState('');
  const [entFonction, setEntFonction] = useState('Directeur Général');
  const [logoPreview, setLogoPreview] = useState<string>('');

  // Section Particulier
  const [partName, setPartName] = useState('');
  const [partProf, setPartProf] = useState('');
  const [partIndicatif, setPartIndicatif] = useState('+229');
  const [partNumero, setPartNumero] = useState('');
  const [partVille, setPartVille] = useState('Cotonou');
  const [partPays, setPartPays] = useState('Bénin');

  // Section Commune : Identifiants
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegPasswordConfirm, setShowRegPasswordConfirm] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(true);

  // Upload Logo handler
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

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

    if (!acceptTerms) {
      setError('Veuillez accepter les Conditions Générales d’Utilisation.');
      return;
    }

    if (regPassword.length < 6) {
      setError('Le mot de passe doit comporter au moins 6 caractères.');
      return;
    }

    if (regPassword !== regPasswordConfirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    const isEnt = entityType === 'entreprise';
    const compLegalName = isEnt ? entName : partName;
    const compPhone = isEnt ? `${entIndicatif} ${entNumero}`.trim() : `${partIndicatif} ${partNumero}`.trim();
    const compVille = isEnt ? entVille : partVille;
    const compPays = isEnt ? entPays : partPays;
    const compSecteur = isEnt ? entSecteur : (partProf || 'Indépendant');
    const compAdminName = isEnt ? (entAdminName || entName) : partName;
    const compFonction = isEnt ? (entFonction || 'Directeur Général') : (partProf || 'Indépendant');

    if (!compLegalName) {
      setError(isEnt ? "Veuillez renseigner le nom de l'entreprise." : 'Veuillez renseigner votre nom complet.');
      return;
    }

    setSubmitting(true);
    try {
      await registerCompany({
        company: {
          legalName: compLegalName,
          tradeName: compLegalName,
          sector: compSecteur,
          legalForm: isEnt ? 'SARL' : 'Indépendant',
          country: compPays,
          city: compVille,
          address: isEnt ? entAdresse : '',
          phone: compPhone,
          email: regEmail,
          website: '',
          taxId: isEnt ? entIfu : '',
          logoUrl: logoPreview || '',
        },
        admin: {
          fullName: compAdminName,
          jobTitle: compFonction,
          email: regEmail,
          phone: compPhone,
          password: regPassword,
          confirmPassword: regPasswordConfirm,
        },
      });
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
    <div className="min-h-screen flex bg-slate-50" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      
      {/* ═══ PANNEAU LATÉRAL GAUCHE (Exactement comme dans XAMPP register/login) ═══ */}
      <div className="hidden lg:flex flex-col justify-between w-[440px] bg-gradient-to-br from-indigo-600 via-purple-700 to-indigo-700 text-white p-10 relative overflow-hidden flex-shrink-0">
        {/* Cercles et motifs en filigrane */}
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-purple-500/20 blur-2xl pointer-events-none" />

        <div className="relative z-10">
          <a href="/" onClick={(e) => { e.preventDefault(); onBackPublic(); }} className="flex items-center gap-3 text-white text-2xl font-extrabold tracking-tight mb-8">
            <NexoraLogo size="lg" showText={true} />
          </a>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/15 border border-white/25 text-white text-xs font-bold mb-6 backdrop-blur-sm">
            <span>🎁</span>
            <span>Essai gratuit de 14 jours</span>
          </div>

          <h2 className="text-2xl font-extrabold leading-snug mb-4">
            {mode === 'login'
              ? 'Votre courrier, notre intelligence.'
              : 'Gérez vos courriers avec la puissance de l\'Intelligence Artificielle.'}
          </h2>

          <p className="text-white/80 text-sm leading-relaxed mb-8">
            {mode === 'login'
              ? 'Accédez à votre tableau de bord et traitez vos courriers avec l’OCR et les workflows sécurisés.'
              : 'Adoptez la solution moderne de Gestion Électronique du Courrier (GEC) conçue pour les organisations, entreprises et professionnels indépendants.'}
          </p>

          <div className="space-y-5">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0 text-base">✨</div>
              <div>
                <strong className="block text-sm font-bold text-white">Indexation &amp; Analyse IA</strong>
                <span className="text-xs text-white/75 leading-relaxed">Extraction automatique des métadonnées, dates et correspondants par vision IA.</span>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0 text-base">🔄</div>
              <div>
                <strong className="block text-sm font-bold text-white">Circuits de validation &amp; Visas</strong>
                <span className="text-xs text-white/75 leading-relaxed">Approbations hiérarchiques avec visas cryptographiques certifiés SHA-256.</span>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0 text-base">📝</div>
              <div>
                <strong className="block text-sm font-bold text-white">Bordereaux &amp; Décharges QR Code</strong>
                <span className="text-xs text-white/75 leading-relaxed">Génération automatique des preuves de dépôt et accusés de réception officiels.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-6 border-t border-white/15 text-xs text-white/70">
          🔒 Aucune carte bancaire requise pour démarrer. Sans engagement.
        </div>
      </div>

      {/* ═══ PANNEAU PRINCIPAL FORMULAIRE ═══ */}
      <div className="flex-1 flex flex-col justify-center items-center p-4 sm:p-10 overflow-y-auto">
        <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-10 shadow-sm border border-slate-200/90 my-auto">
          
          {/* Header Mobile & Navigation */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            <button
              type="button"
              onClick={onBackPublic}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Retour à l'accueil</span>
            </button>

            <div>
              {mode === 'login' ? (
                <div className="text-xs text-slate-500">
                  Pas encore d'espace ?{' '}
                  <button type="button" onClick={() => { setError(''); setMode('register'); }} className="font-bold text-indigo-600 hover:underline">
                    Créer un compte
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-500">
                  Déjà inscrit ?{' '}
                  <button type="button" onClick={() => { setError(''); setMode('login'); }} className="font-bold text-indigo-600 hover:underline">
                    Se connecter
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════════
              1. PAGE CONNEXION
          ══════════════════════════════════════════════════════════════════════════ */}
          {mode === 'login' && (
            <div className="max-w-md mx-auto">
              <div className="mb-6 flex flex-col items-center sm:items-start">
                <div className="flex justify-center mb-3">
                  <NexoraLogo size="xl" showText={false} />
                </div>
                <h1 className="text-2xl font-extrabold text-slate-900">Bon retour 👋</h1>
                <p className="text-sm text-slate-500 mt-1">Connectez-vous pour accéder à votre espace de gestion.</p>
              </div>

              {error && (
                <div className="p-3.5 mb-5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
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
                    placeholder="vous@organisation.bj"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none transition-all"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">Mot de passe</label>
                    <button
                      type="button"
                      onClick={() => { setError(''); setMode('forgot'); }}
                      className="text-xs font-bold text-indigo-600 hover:underline"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 pr-10 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none transition-all"
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
                  className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/30 transition-all disabled:opacity-60"
                >
                  {submitting ? 'Connexion...' : 'Se connecter'}
                </button>
              </form>

              {/* Rôles démo */}
              <div className="mt-8 pt-6 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 mb-3">
                  <ShieldCheck className="w-4 h-4" />
                  <span>NEXORA DEMO GROUP (Accès direct en 1 clic)</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      disabled={submitting}
                      onClick={() => handleDemoLogin(acc.id)}
                      className="p-2.5 rounded-xl border border-slate-200 text-left hover:border-indigo-600 hover:bg-indigo-50/50 transition-all text-xs"
                    >
                      <span className="font-bold text-slate-900 block truncate">{acc.label}</span>
                      <span className="text-[11px] text-slate-500 block truncate">{acc.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════════
              2. PAGE INSCRIPTION COMPLÈTE (CONFORME À 100% AU FICHIER XAMPP)
          ══════════════════════════════════════════════════════════════════════════ */}
          {mode === 'register' && (
            <div>
              <div className="mb-6 flex flex-col items-center sm:items-start">
                <div className="flex justify-center mb-3">
                  <NexoraLogo size="xl" showText={false} />
                </div>
                <h1 className="text-2xl font-extrabold text-slate-900">Créer mon espace Nexora</h1>
                <p className="text-sm text-slate-500 mt-1">
                  Bénéficiez de <strong>14 jours d'essai gratuit</strong> complet sans engagement.
                </p>
              </div>

              {error && (
                <div className="p-4 mb-6 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                  ⚠️ {error}
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-6">
                
                {/* ── Sélecteur Entreprise vs Particulier (identique XAMPP) ── */}
                <div className="grid grid-cols-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setEntityType('entreprise')}
                    className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                      entityType === 'entreprise'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Building className="w-4 h-4" />
                    <span>Entreprise / Organisation</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEntityType('particulier')}
                    className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                      entityType === 'particulier'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <User className="w-4 h-4" />
                    <span>Particulier / Indépendant</span>
                  </button>
                </div>

                {/* ── SECTION 1 : INFORMATIONS DE L'ENTREPRISE ── */}
                {entityType === 'entreprise' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600">
                        Renseignements de l'Entreprise / Organisation
                      </span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                      <div className="sm:col-span-8">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Nom de l'entreprise ou institution <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={entName}
                          onChange={(e) => setEntName(e.target.value)}
                          placeholder="ex: Cabinet Médical Espoir, Société Béninoise d'Énergie..."
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Secteur d'activité</label>
                        <select
                          value={entSecteur}
                          onChange={(e) => setEntSecteur(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                        >
                          {SECTEURS_ACTIVITE.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      {/* Upload Logo (Comme dans XAMPP) */}
                      <div className="sm:col-span-12">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Logo officiel (apparaîtra sur les courriers, visas et récépissés)
                        </label>
                        <label className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-4 text-center bg-slate-50 hover:bg-indigo-50/30 transition-all cursor-pointer block">
                          {logoPreview ? (
                            <div className="flex flex-col items-center">
                              <img src={logoPreview} alt="Aperçu logo" className="max-h-14 max-w-[140px] object-contain mb-2" />
                              <span className="text-xs font-semibold text-indigo-600">Changer de logo</span>
                            </div>
                          ) : (
                            <div>
                              <UploadCloud className="w-7 h-7 text-indigo-600 mx-auto mb-1" />
                              <div className="text-xs font-bold text-slate-700">Cliquez pour choisir le logo de votre organisation</div>
                              <div className="text-[11px] text-slate-400 mt-0.5">PNG, JPG, SVG ou WEBP jusqu'à 3 Mo</div>
                            </div>
                          )}
                          <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                        </label>
                      </div>

                      <div className="sm:col-span-6">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Numéro IFU ou RCCM (optionnel)
                        </label>
                        <input
                          type="text"
                          value={entIfu}
                          onChange={(e) => setEntIfu(e.target.value)}
                          placeholder="ex: 0201810294857"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                        />
                      </div>

                      <div className="sm:col-span-6">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Téléphone professionnel <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={entIndicatif}
                            onChange={(e) => setEntIndicatif(e.target.value)}
                            className="w-32 px-2.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold focus:border-indigo-600 outline-none"
                          >
                            {INDICATIFS_PAYS.map((ip) => (
                              <option key={ip.indicatif + ip.pays} value={ip.indicatif}>{ip.nom}</option>
                            ))}
                          </select>
                          <input
                            type="tel"
                            required
                            value={entNumero}
                            onChange={(e) => setEntNumero(e.target.value)}
                            placeholder="ex: 01 20 21 22 23"
                            className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-5">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Adresse géographique</label>
                        <input
                          type="text"
                          value={entAdresse}
                          onChange={(e) => setEntAdresse(e.target.value)}
                          placeholder="ex: Rue 12.045, Ganhi"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Ville</label>
                        <input
                          type="text"
                          value={entVille}
                          onChange={(e) => setEntVille(e.target.value)}
                          placeholder="Cotonou"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Pays</label>
                        <input
                          type="text"
                          value={entPays}
                          onChange={(e) => setEntPays(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                        />
                      </div>
                    </div>

                    {/* Administrateur Principal */}
                    <div className="flex items-center gap-3 my-4 pt-3">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600">
                        Compte Administrateur Principal
                      </span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                      <div className="sm:col-span-7">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Nom &amp; Prénom du responsable <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={entAdminName}
                          onChange={(e) => setEntAdminName(e.target.value)}
                          placeholder="ex: Paul KOUDJO"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                        />
                      </div>

                      <div className="sm:col-span-5">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Poste / Fonction</label>
                        <input
                          type="text"
                          value={entFonction}
                          onChange={(e) => setEntFonction(e.target.value)}
                          placeholder="ex: Directeur Général, Gérant..."
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── SECTION 2 : PARTICULIER / INDÉPENDANT ── */}
                {entityType === 'particulier' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600">
                        Renseignements Personnels &amp; Professionnels
                      </span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                      <div className="sm:col-span-7">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Nom &amp; Prénom complet <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={partName}
                          onChange={(e) => setPartName(e.target.value)}
                          placeholder="ex: Christian AGBANGLA"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                        />
                      </div>

                      <div className="sm:col-span-5">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Profession / Activité</label>
                        <input
                          type="text"
                          value={partProf}
                          onChange={(e) => setPartProf(e.target.value)}
                          placeholder="ex: Consultant indépendant, Avocat..."
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                        />
                      </div>

                      <div className="sm:col-span-6">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Numéro de téléphone <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={partIndicatif}
                            onChange={(e) => setPartIndicatif(e.target.value)}
                            className="w-32 px-2.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold focus:border-indigo-600 outline-none"
                          >
                            {INDICATIFS_PAYS.map((ip) => (
                              <option key={ip.indicatif + ip.pays} value={ip.indicatif}>{ip.nom}</option>
                            ))}
                          </select>
                          <input
                            type="tel"
                            required
                            value={partNumero}
                            onChange={(e) => setPartNumero(e.target.value)}
                            placeholder="ex: 01 97 00 00 00"
                            className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Ville</label>
                        <input
                          type="text"
                          value={partVille}
                          onChange={(e) => setPartVille(e.target.value)}
                          placeholder="Cotonou"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Pays</label>
                        <input
                          type="text"
                          value={partPays}
                          onChange={(e) => setPartPays(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── SECTION COMMUNE : IDENTIFIANTS DE CONNEXION ── */}
                <div className="space-y-4 pt-3">
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600">
                      Identifiants de Connexion
                    </span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Adresse Email (servira pour vous connecter) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="nom@entreprise.bj ou monadresse@gmail.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Mot de passe <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showRegPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="Minimum 6 caractères"
                          className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword(!showRegPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Confirmer le mot de passe <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showRegPasswordConfirm ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={regPasswordConfirm}
                          onChange={(e) => setRegPasswordConfirm(e.target.value)}
                          placeholder="Retapez le mot de passe"
                          className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 focus:bg-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPasswordConfirm(!showRegPasswordConfirm)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showRegPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Bandeau Essai gratuit 14 jours (identique XAMPP) ── */}
                <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 flex items-center gap-3">
                  <Stars className="w-6 h-6 text-indigo-600 shrink-0" />
                  <div className="text-xs text-slate-700 leading-relaxed">
                    <strong>Offre découverte : 14 jours d'essai gratuit complet</strong><br />
                    Accédez immédiatement à toutes les fonctionnalités IA, workflows et éditeur de courriers. Aucun paiement n'est exigé aujourd'hui.
                  </div>
                </div>

                {/* ── Conditions d'utilisation ── */}
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-600 leading-normal">
                    J'accepte les <span className="text-indigo-600 font-semibold">Conditions Générales d'Utilisation</span> et la <span className="text-indigo-600 font-semibold">Politique de Confidentialité</span> de Nexora.
                  </span>
                </label>

                {/* Bouton de soumission */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-60"
                >
                  {submitting ? 'Création de votre espace en cours...' : 'Démarrer mon essai gratuit de 14 jours →'}
                </button>
              </form>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════════
              3. MOT DE PASSE OUBLIÉ
          ══════════════════════════════════════════════════════════════════════════ */}
          {mode === 'forgot' && (
            <div className="max-w-md mx-auto">
              <div className="mb-6">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 mb-1">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Récupération d'accès</span>
                </div>
                <h1 className="text-xl font-extrabold text-slate-900">Mot de passe oublié</h1>
                <p className="text-xs text-slate-500 mt-1">Saisissez votre e-mail pour recevoir un code temporaire.</p>
              </div>

              {resetStep === 1 ? (
                <form onSubmit={handleRequestReset} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Adresse e-mail du compte</label>
                    <input
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 outline-none"
                      placeholder="vous@organisation.bj"
                    />
                  </div>
                  {error && <div className="text-xs text-red-600 font-medium">{error}</div>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-sm"
                  >
                    {submitting ? 'Envoi...' : 'Recevoir un code de réinitialisation'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleConfirmReset} className="space-y-4">
                  {resetMessage && <div className="text-xs text-emerald-700 bg-emerald-50 p-3 rounded-xl font-medium">{resetMessage}</div>}
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
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nouveau mot de passe (min. 6 car.)</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:border-indigo-600 outline-none"
                    />
                  </div>
                  {error && <div className="text-xs text-red-600 font-medium">{error}</div>}
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
                className="mt-5 text-xs font-bold text-indigo-600 hover:underline block text-center w-full"
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
