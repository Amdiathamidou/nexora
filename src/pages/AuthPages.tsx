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
  { id: 'usr_demo_resp_fin', label: 'Responsable Finances', name: 'Aminata Zinsou', email: 'finances@nexorademo.bj' },
  { id: 'usr_demo_resp_jur', label: 'Responsable Juridique', name: 'Me Brice Agbessi', email: 'juridique@nexorademo.bj' },
  { id: 'usr_demo_agent_sec', label: 'Secrétariat Central', name: 'Nadine Kpadonou', email: 'secretariat@nexorademo.bj' },
  { id: 'usr_demo_agent_fin', label: 'Agent Finances', name: 'Romuald Boko', email: 'agent.finances@nexorademo.bj' },
  { id: 'usr_superadmin', label: 'Super Admin NEXORA', name: 'Koffi Mensah', email: 'superadmin@nexora.bj' },
];

// ─── Shared micro-styles ──────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 16px 13px 46px',
  border: '1.5px solid #e2e8f0',
  borderRadius: 13,
  fontSize: '0.95rem',
  fontFamily: 'inherit',
  color: '#1e293b',
  background: '#f8fafc',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color .2s, box-shadow .2s',
};
const inputSimple: React.CSSProperties = {
  ...inputStyle,
  paddingLeft: 16,
};
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  fontSize: '0.88rem',
  color: '#475569',
  marginBottom: 8,
};
const btnPrimary: React.CSSProperties = {
  width: '100%',
  padding: '15px 24px',
  border: 'none',
  borderRadius: 13,
  background: 'linear-gradient(135deg,#4F46E5,#7C3AED)',
  color: '#fff',
  fontFamily: 'inherit',
  fontSize: '1rem',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 8px 24px rgba(79,70,229,.3)',
  transition: 'all .3s ease',
};

export function AuthPages({ initialMode, onBackPublic }: AuthPagesProps) {
  const { login, demoLogin, registerCompany } = useAuth();
  const [mode, setMode] = useState<AuthScreenMode>(initialMode);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetMessage, setResetMessage] = useState('');

  // Company Registration state
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

  /* ──────────────────────────────────── LEFT PANEL ──────────────────────── */
  const LeftPanel = () => (
    <div
      className="hidden lg:flex flex-col justify-between flex-shrink-0 relative overflow-hidden"
      style={{ width: 420, background: 'linear-gradient(160deg,#4F46E5 0%,#7C3AED 50%,#6366F1 100%)', padding: '50px 40px', color: '#fff' }}
    >
      {/* grid bg */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)',
        backgroundSize: '40px 40px' }} />
      <div style={{ position: 'absolute', top: -100, right: -100, width: 350, height: 350, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />

      {/* brand */}
      <div className="relative z-10 flex items-center gap-3">
        <img src="/logo-nexora.png" alt="Nexora"
          style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', background: 'rgba(255,255,255,.2)', padding: 2 }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: -0.5 }}>NEXORA</span>
      </div>

      {/* body */}
      <div className="relative z-10">
        {mode === 'login' && (
          <>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1.2, letterSpacing: -1, marginBottom: 14 }}>
              Votre courrier,<br />notre intelligence.
            </h2>
            <p style={{ fontSize: '1rem', opacity: 0.8, lineHeight: 1.7, maxWidth: 320 }}>
              Accédez à votre tableau de bord et gérez vos courriers avec l'aide de l'intelligence artificielle Gemini.
            </p>
            <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { icon: '🤖', label: 'Extraction IA automatique (OCR Gemini)' },
                { icon: '📄', label: 'Circuits de validation et workflows' },
                { icon: '🔒', label: 'Données isolées par entreprise' },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-4"
                  style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14 }}>
                  <span style={{ fontSize: 20, width: 38, height: 38, background: 'rgba(255,255,255,0.12)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{f.icon}</span>
                  <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{f.label}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {mode === 'register' && (
          <>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(8px)', padding: '8px 16px', borderRadius: 99, fontSize: 13, fontWeight: 700, border: '1px solid rgba(255,255,255,.25)', marginBottom: 24 }}>
              ✨ Essai gratuit 14 jours
            </div>
            <h2 style={{ fontSize: '1.9rem', fontWeight: 800, lineHeight: 1.2, letterSpacing: -1, marginBottom: 14 }}>
              Rejoignez NEXORA<br />dès aujourd'hui.
            </h2>
            <p style={{ fontSize: '0.95rem', opacity: 0.8, lineHeight: 1.7, maxWidth: 320 }}>
              Créez l'espace de votre organisation et commencez à gérer vos courriers intelligemment.
            </p>
            {[
              { icon: '🚀', title: 'Démarrage immédiat', desc: 'En moins de 2 minutes' },
              { icon: '🧠', title: 'IA Gemini intégrée', desc: 'OCR et extraction auto' },
              { icon: '📧', title: 'Notifications email', desc: 'Alertes aux chefs de service' },
            ].map((b) => (
              <div key={b.title} className="flex gap-3 mt-5">
                <div style={{ width: 38, height: 38, background: 'rgba(255,255,255,.15)', borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 }}>{b.icon}</div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>{b.title}</p>
                  <p style={{ opacity: 0.7, fontSize: '0.82rem' }}>{b.desc}</p>
                </div>
              </div>
            ))}
          </>
        )}
        {mode === 'forgot' && (
          <>
            <h2 style={{ fontSize: '1.9rem', fontWeight: 800, lineHeight: 1.2, marginBottom: 14 }}>Récupération<br />d'accès</h2>
            <p style={{ fontSize: '0.95rem', opacity: 0.8, lineHeight: 1.7 }}>
              Saisissez votre adresse e-mail. Vous recevrez un code à usage unique pour réinitialiser votre mot de passe.
            </p>
          </>
        )}
      </div>
    </div>
  );

  /* ──────────────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>
      <LeftPanel />

      {/* RIGHT PANEL */}
      <div
        className="flex-1 flex items-center justify-center overflow-y-auto"
        style={{ background: mode === 'register' ? '#f8fafc' : '#fff', padding: '40px 24px' }}
      >
        <div style={{ width: '100%', maxWidth: mode === 'register' ? 680 : 420 }}>

          {/* Mobile brand */}
          <div className="flex lg:hidden items-center gap-3 mb-10">
            <img src="/logo-nexora.png" alt="Nexora"
              style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: -0.5 }}>NEXORA</span>
          </div>

          {/* Back button */}
          <button type="button" onClick={onBackPublic}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', fontWeight: 600, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 32 }}>
            <ArrowLeft className="w-4 h-4" /> Retour au site
          </button>

          {/* ═══ LOGIN ═══════════════════════════════════════════════════════ */}
          {mode === 'login' && (
            <>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Bon retour 👋</h1>
              <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: 32, lineHeight: 1.6 }}>
                Connectez-vous pour accéder à votre espace de gestion.
              </p>

              {error && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 14, marginBottom: 24, color: '#991B1B', fontSize: '0.88rem' }}>
                  ⚠️ <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin}>
                {/* Email */}
                <label style={labelStyle}>Adresse e-mail</label>
                <div style={{ position: 'relative', marginBottom: 20 }}>
                  <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: '1rem', color: '#94a3b8' }}>✉️</span>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@organisation.com" style={inputStyle} />
                </div>

                {/* Password */}
                <label style={labelStyle}>Mot de passe</label>
                <div style={{ position: 'relative', marginBottom: 20 }}>
                  <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: '1rem', color: '#94a3b8' }}>🔒</span>
                  <input type={showPassword ? 'text' : 'password'} required value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                    style={{ ...inputStyle, paddingRight: 50 }} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Extras */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', color: '#475569', cursor: 'pointer' }}>
                    <input type="checkbox" style={{ width: 18, height: 18, accentColor: '#4F46E5' }} />
                    Se souvenir de moi
                  </label>
                  <button type="button" onClick={() => { setError(''); setMode('forgot'); }}
                    style={{ color: '#4F46E5', fontSize: '0.88rem', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Mot de passe oublié ?
                  </button>
                </div>

                <button type="submit" disabled={submitting} style={btnPrimary}>
                  {submitting ? 'Connexion...' : 'Se connecter →'}
                </button>
              </form>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '28px 0', color: '#94a3b8', fontSize: '0.82rem' }}>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} /> ou <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              </div>

              {/* Demo accounts */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 20px' }}>
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-4 h-4" style={{ color: '#4F46E5' }} />
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#4F46E5' }}>Environnement DÉMO · Cotonou, Bénin</span>
                </div>
                <p style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 12 }}>
                  Testez les parcours complets (<strong>Demo2026!</strong> / Super Admin : <strong>Nexora2026!</strong>)
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button key={acc.id} type="button" disabled={submitting} onClick={() => handleDemoLogin(acc.id)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all .2s' }}
                      onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4F46E5'; b.style.background = '#EEF2FF'; }}
                      onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e2e8f0'; b.style.background = '#fff'; }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', margin: 0 }}>{acc.label}</p>
                        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>{acc.name} · {acc.email}</p>
                      </div>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4F46E5', flexShrink: 0, marginLeft: 12 }}>Ouvrir</span>
                    </button>
                  ))}
                </div>
              </div>

              <p style={{ textAlign: 'center', marginTop: 24, fontSize: '0.88rem', color: '#64748b' }}>
                Pas encore d'espace ?{' '}
                <button type="button" onClick={() => { setError(''); setMode('register'); }}
                  style={{ color: '#4F46E5', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Créer un compte — Essai gratuit 14 jours →
                </button>
              </p>
            </>
          )}

          {/* ═══ FORGOT PASSWORD ═════════════════════════════════════════════ */}
          {mode === 'forgot' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4F46E5', marginBottom: 8 }}>
                <KeyRound className="w-5 h-5" />
                <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>Récupération d'accès</span>
              </div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginBottom: 24 }}>Mot de passe oublié</h1>

              {resetStep === 1 ? (
                <form onSubmit={handleRequestReset}>
                  <label style={labelStyle}>Adresse e-mail du compte</label>
                  <div style={{ position: 'relative', marginBottom: 20 }}>
                    <input type="email" required value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} style={inputSimple} />
                  </div>
                  {error && <p style={{ fontSize: '0.82rem', color: '#dc2626', marginBottom: 16 }}>{error}</p>}
                  <button type="submit" disabled={submitting} style={btnPrimary}>
                    {submitting ? 'Envoi...' : 'Recevoir un code de réinitialisation'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleConfirmReset}>
                  {resetMessage && <p style={{ fontSize: '0.82rem', color: '#059669', background: '#ecfdf5', padding: '10px 14px', borderRadius: 10, marginBottom: 16 }}>{resetMessage}</p>}
                  <label style={labelStyle}>Code à 6 chiffres</label>
                  <div style={{ position: 'relative', marginBottom: 20 }}>
                    <input type="text" required value={resetCode} onChange={(e) => setResetCode(e.target.value)}
                      style={{ ...inputSimple, fontFamily: 'monospace', letterSpacing: 4 }} />
                  </div>
                  <label style={labelStyle}>Nouveau mot de passe (min. 8 car.)</label>
                  <div style={{ position: 'relative', marginBottom: 20 }}>
                    <input type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputSimple} />
                  </div>
                  {error && <p style={{ fontSize: '0.82rem', color: '#dc2626', marginBottom: 16 }}>{error}</p>}
                  <button type="submit" disabled={submitting} style={btnPrimary}>
                    {submitting ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
                  </button>
                </form>
              )}

              <button type="button" onClick={() => { setMode('login'); setError(''); setResetStep(1); }}
                style={{ display: 'block', marginTop: 20, fontSize: '0.88rem', color: '#4F46E5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                ← Retour à la connexion
              </button>
            </>
          )}

          {/* ═══ REGISTER ════════════════════════════════════════════════════ */}
          {mode === 'register' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4F46E5', marginBottom: 4 }}>
                <Building2 className="w-4 h-4" />
                <span style={{ fontWeight: 700, fontSize: '0.78rem' }}>Création d'espace entreprise · Essai gratuit 14 jours</span>
              </div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Inscrire votre organisation</h1>
              <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: 32, lineHeight: 1.6 }}>
                Le premier utilisateur créé devient automatiquement Administrateur et les services de base sont initialisés.
              </p>

              <form onSubmit={handleRegister}>
                {/* ── Entreprise ── */}
                <h2 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 20 }}>
                  1. Informations de l'entreprise
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ marginBottom: 32 }}>
                  {[
                    { label: 'Dénomination sociale *', key: 'legalName', type: 'text', required: true, span: true },
                    { label: 'Nom commercial', key: 'tradeName', type: 'text' },
                    { label: "Secteur d'activité *", key: 'sector', type: 'text', required: true },
                    { label: 'Pays *', key: 'country', type: 'text', required: true },
                    { label: 'Ville *', key: 'city', type: 'text', required: true },
                    { label: 'Téléphone professionnel', key: 'phone', type: 'tel' },
                    { label: 'E-mail professionnel *', key: 'email', type: 'email', required: true },
                    { label: 'Site internet', key: 'website', type: 'url', placeholder: 'https://...' },
                    { label: 'IFU / RCCM', key: 'taxId', type: 'text' },
                  ].map((f) => (
                    <div key={f.key} className={f.span ? 'sm:col-span-2' : ''}>
                      <label style={labelStyle}>{f.label}</label>
                      <input type={f.type} required={f.required} placeholder={f.placeholder}
                        value={(companyForm as Record<string, string>)[f.key]}
                        onChange={(e) => setCompanyForm({ ...companyForm, [f.key]: e.target.value })}
                        style={inputSimple} />
                    </div>
                  ))}
                  <div>
                    <label style={labelStyle}>Forme juridique *</label>
                    <select value={companyForm.legalForm} onChange={(e) => setCompanyForm({ ...companyForm, legalForm: e.target.value })} style={inputSimple}>
                      <option>SARL</option><option>SA</option><option>SAS</option>
                      <option>Institution Publique</option><option>ONG / Association</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label style={labelStyle}>Adresse complète</label>
                    <input type="text" value={companyForm.address}
                      onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} style={inputSimple} />
                  </div>
                </div>

                {/* ── Admin ── */}
                <h2 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 20 }}>
                  2. Premier utilisateur (rôle Admin attribué automatiquement)
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ marginBottom: 24 }}>
                  {[
                    { label: 'Nom et prénom *', key: 'fullName', type: 'text', required: true },
                    { label: 'Fonction *', key: 'jobTitle', type: 'text', required: true },
                    { label: 'E-mail de connexion *', key: 'email', type: 'email', required: true },
                    { label: 'Téléphone', key: 'phone', type: 'tel' },
                    { label: 'Mot de passe (min. 8 car.) *', key: 'password', type: 'password', required: true, minLength: 8 },
                    { label: 'Confirmation mot de passe *', key: 'confirmPassword', type: 'password', required: true, minLength: 8 },
                  ].map((f) => (
                    <div key={f.key}>
                      <label style={labelStyle}>{f.label}</label>
                      <input type={f.type} required={f.required} minLength={f.minLength}
                        value={(adminForm as Record<string, string>)[f.key]}
                        onChange={(e) => setAdminForm({ ...adminForm, [f.key]: e.target.value })}
                        style={inputSimple} />
                    </div>
                  ))}
                </div>

                {error && (
                  <div style={{ display: 'flex', gap: 10, padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, color: '#991B1B', fontSize: '0.88rem', marginBottom: 20 }}>
                    ⚠️ {error}
                  </div>
                )}

                <button type="submit" disabled={submitting} style={btnPrimary}>
                  {submitting ? "Initialisation de l'espace..." : "Créer l'entreprise et démarrer l'essai gratuit (14 jours) →"}
                </button>
              </form>

              <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.88rem', color: '#64748b' }}>
                Déjà un compte ?{' '}
                <button type="button" onClick={() => { setError(''); setMode('login'); }}
                  style={{ color: '#4F46E5', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Se connecter
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
