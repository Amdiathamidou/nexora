import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Shield, Sparkles, Cpu, FileText, Send, Mail, CheckCircle2, ChevronRight, Users, Inbox } from 'lucide-react';
import { apiFetch } from '../api/client.ts';
import type { SubscriptionPlan } from '../types/nexora.ts';

interface PublicSiteProps {
  onGoLogin: () => void;
  onGoRegister: () => void;
}

export function PublicSite({ onGoLogin, onGoRegister }: PublicSiteProps) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [legalModal, setLegalModal] = useState<'cgu' | 'privacy' | null>(null);

  // Contact form
  const [contactForm, setContactForm] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    message: '',
  });
  const [contactStatus, setContactStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [contactFeedback, setContactFeedback] = useState('');

  useEffect(() => {
    apiFetch<{ plans: SubscriptionPlan[] }>('/api/public/plans')
      .then((d) => setPlans(d.plans))
      .catch(() => {});
  }, []);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactStatus('sending');
    setContactFeedback('');
    try {
      const res = await apiFetch<{ message: string }>('/api/public/contact', {
        method: 'POST',
        body: JSON.stringify(contactForm),
      });
      setContactStatus('sent');
      setContactFeedback(res.message);
      setContactForm({ companyName: '', contactName: '', email: '', phone: '', message: '' });
    } catch (err) {
      setContactStatus('error');
      setContactFeedback(err instanceof Error ? err.message : 'Erreur lors de l’envoi.');
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {/* ─── Glassmorphism Navbar (identique XAMPP) ─── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 transition-all">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-3 text-decoration-none">
            <NexoraLogo size="lg" />
          </a>

          <nav className="hidden md:flex items-center gap-1 font-semibold text-sm text-slate-600">
            <a href="#fonctionnalites" className="px-4 py-2 rounded-xl hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors">
              Fonctionnalités
            </a>
            <a href="#ia-ocr" className="px-4 py-2 rounded-xl hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors">
              OCR &amp; IA
            </a>
            <a href="#processus" className="px-4 py-2 rounded-xl hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors">
              Comment ça marche
            </a>
            <a href="#tarifs" className="px-4 py-2 rounded-xl hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors">
              Tarifs
            </a>
            <a href="#contact" className="px-4 py-2 rounded-xl hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors">
              Contact
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onGoLogin}
              className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-black transition-all shadow-sm hover:-translate-y-0.5"
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={onGoRegister}
              className="hidden sm:inline-flex px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/25 hover:-translate-y-0.5"
            >
              Essai gratuit 14j
            </button>
          </div>
        </div>
      </header>

      {/* ─── Hero Section (Design XAMPP Landing avec hero.png) ─── */}
      <section id="top" className="relative pt-12 pb-24 lg:pt-20 lg:pb-32 overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50/50 via-white to-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-200/60 text-indigo-700 text-xs font-bold mb-6">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Gestion Intelligente et Automatisation du Courrier</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-950 leading-[1.15] mb-6">
                Votre courrier,<br />
                <span className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 bg-clip-text text-transparent">
                  propulsé par l'IA.
                </span>
              </h1>

              <p className="text-lg sm:text-xl text-slate-600 leading-relaxed mb-8 max-w-xl">
                NEXORA transforme votre gestion documentaire : capture multicanal, classification automatique par OCR intelligent et traçabilité absolue jusqu'à l'archivage.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={onGoRegister}
                  className="px-7 py-4 rounded-2xl bg-indigo-600 text-white text-base font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/30 hover:-translate-y-1 flex items-center gap-2"
                >
                  <span>Démarrer l'essai gratuit</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={onGoLogin}
                  className="px-7 py-4 rounded-2xl bg-white border-2 border-slate-200 text-slate-800 text-base font-bold hover:border-indigo-600 hover:text-indigo-600 transition-all hover:-translate-y-1 shadow-sm"
                >
                  Voir la démo en ligne
                </button>
              </div>

              <div className="mt-12 pt-8 border-t border-slate-200/80 grid grid-cols-3 gap-6 max-w-lg">
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">100 %</div>
                  <div className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">Traçabilité légale</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-indigo-600">&lt; 3 sec</div>
                  <div className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">OCR &amp; extraction IA</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-purple-600">14 Jours</div>
                  <div className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">Essai gratuit sans CB</div>
                </div>
              </div>
            </div>

            {/* Illustration Hero 3D */}
            <div className="lg:col-span-5 relative">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                <div className="rounded-3xl p-3 bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 backdrop-blur-sm border border-indigo-100 shadow-2xl shadow-indigo-500/10 transform lg:rotate-1 hover:rotate-0 transition-transform duration-500">
                  <img
                    src="/hero.png"
                    alt="Interface Nexora"
                    className="w-full h-auto rounded-2xl object-cover shadow-inner"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/features.png';
                    }}
                  />
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ─── Capture Section (3 Cartes XAMPP) ─── */}
      <section id="fonctionnalites" className="py-24 bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-extrabold text-indigo-600 uppercase tracking-widest mb-3 block">
              CAPTURER &amp; NUMÉRISER
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Centralisez tous vos flux documentaires en un seul lieu.
            </h2>
            <p className="mt-4 text-base sm:text-lg text-slate-600">
              Fini les courriers égarés et les dossiers qui dorment sur les bureaux des services.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-6">
                <Inbox className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Courriers Entrants</h3>
              <p className="text-slate-600 leading-relaxed text-sm">
                Enregistrement au Secrétariat Central avec référence automatique, numérisation immédiate et détection des doublons.
              </p>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600 mb-6">
                <Send className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Courriers Sortants</h3>
              <p className="text-slate-600 leading-relaxed text-sm">
                Validation hiérarchique, bordereaux d'envoi, signature électronique et preuve d'expédition horodatée.
              </p>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-6">
                <Users className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Notes &amp; Mémos Internes</h3>
              <p className="text-slate-600 leading-relaxed text-sm">
                Circulation instantanée entre départements avec instructions, annotations confidentielles et accusés de réception.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Intelligence Section (Bannière Sombre XAMPP) ─── */}
      <section id="ia-ocr" className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-slate-950 text-white rounded-[40px] p-8 sm:p-12 lg:p-16 relative overflow-hidden shadow-2xl">
            {/* Décoration d'arrière-plan */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
              <div className="lg:col-span-7">
                <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-widest mb-3 block">
                  INTELLIGENCE ARTIFICIELLE GEMINI
                </span>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-6">
                  Ne tapez plus rien à la main. L'OCR extrait tout pour vous.
                </h2>
                <p className="text-slate-300 text-base sm:text-lg mb-8 leading-relaxed">
                  Déposez un scan ou une photo de lettre : NEXORA analyse le contenu, extrait les entités clés (expéditeur, objet, références, délais) et rédige un résumé structuré prêt à valider.
                </p>

                <div className="space-y-6">
                  <div className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0 mt-1">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-base">Extraction Optique Haute Précision</h4>
                      <p className="text-slate-400 text-sm mt-1">Reconnaissance de texte français même sur documents scannés inclinés ou manuscrits.</p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-300 shrink-0 mt-1">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-base">Résumé exécutif en 3 lignes</h4>
                      <p className="text-slate-400 text-sm mt-1">Permet à la Direction et aux responsables de décider en quelques secondes.</p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0 mt-1">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-base">Validation humaine obligatoire</h4>
                      <p className="text-slate-400 text-sm mt-1">L'agent garde toujours le contrôle final pour corriger ou valider le préremplissage.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="rounded-3xl p-2 bg-slate-900/80 border border-slate-800 shadow-2xl">
                  <img
                    src="/features.png"
                    alt="Scan et extraction IA"
                    className="w-full h-auto rounded-2xl object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/hero.png';
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Process Steps Section (Comment ça marche) ─── */}
      <section id="processus" className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto mb-16">
            <span className="text-xs font-extrabold text-indigo-600 uppercase tracking-widest mb-3 block">
              WORKFLOW ADMINISTRATIF
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
              Un circuit maîtrisé de bout en bout.
            </h2>
          </div>

          <div className="space-y-10 relative">
            {[
              {
                step: '01',
                title: 'Réception & Scan au Secrétariat',
                desc: 'Attribution automatique du numéro d’ordre (ex: ARR-2026-0042) et passage instantané sous l’œil de l’IA.',
              },
              {
                step: '02',
                title: 'Orientation & Alerte automatique au Chef de Service',
                desc: 'Dès affectation à un agent traitant, le responsable de département reçoit un email récapitulatif avec l’échéance.',
              },
              {
                step: '03',
                title: 'Traitement, Visa & Signature Présidentielle',
                desc: 'Validation séquentielle ou parallèle selon les circuits d’approbation configurés par votre organisation.',
              },
              {
                step: '04',
                title: 'Retour obligatoire au Secrétariat & Archivage',
                desc: 'Aucun courrier ne s’évapore : contrôle de clôture, bordereau d’expédition et classement sécurisé.',
              },
            ].map((s, idx) => (
              <div key={s.step} className="flex gap-6 items-start bg-slate-50 p-6 sm:p-8 rounded-3xl border border-slate-100 hover:border-indigo-200 transition-colors">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white font-extrabold text-lg flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/30">
                  {s.step}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{s.title}</h3>
                  <p className="text-slate-600 leading-relaxed text-sm sm:text-base">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Tarifs Section ─── */}
      <section id="tarifs" className="py-24 bg-slate-50 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-extrabold text-indigo-600 uppercase tracking-widest mb-3 block">
              TARIFS CLAIRS &amp; TRANSPARENTS
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
              Des formules adaptées à chaque taille de structure.
            </h2>
            <p className="mt-4 text-slate-600">
              Paiement sécurisé par Carte Bancaire ou Mobile Money (MTN MoMo, Moov Money, Wave, Celtiis).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {plans.map((p) => {
              const isPopular = p.name.toLowerCase().includes('croissance') || p.name.toLowerCase().includes('pro');
              return (
                <div
                  key={p.id}
                  className={`rounded-3xl p-8 flex flex-col justify-between transition-all ${
                    isPopular
                      ? 'bg-slate-950 text-white border-2 border-indigo-600 shadow-2xl scale-105'
                      : 'bg-white text-slate-900 border border-slate-200/80 shadow-sm'
                  }`}
                >
                  <div>
                    {isPopular && (
                      <span className="inline-block px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-extrabold uppercase mb-4">
                        Le plus choisi
                      </span>
                    )}
                    <h3 className="text-2xl font-bold mb-2">{p.name}</h3>
                    <p className={`text-sm mb-6 ${isPopular ? 'text-slate-400' : 'text-slate-500'}`}>
                      {p.audience}
                    </p>

                    <div className="flex items-baseline gap-2 mb-8">
                      <span className="text-4xl font-extrabold tracking-tight">
                        {p.price_monthly_fcfa.toLocaleString('fr-FR')}
                      </span>
                      <span className={`text-sm ${isPopular ? 'text-slate-400' : 'text-slate-500'}`}>
                        FCFA / mois
                      </span>
                    </div>

                    <ul className="space-y-3.5 mb-8 text-sm">
                      <li className="flex items-center gap-3">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>Jusqu’à <strong>{p.max_users}</strong> utilisateurs</span>
                      </li>
                      <li className="flex items-center gap-3">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span><strong>{p.max_mails_month}</strong> courriers / mois</span>
                      </li>
                      <li className="flex items-center gap-3">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>Stockage <strong>{p.max_storage_mb / 1024} Go</strong></span>
                      </li>
                      <li className="flex items-center gap-3">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>{p.ai_enabled ? 'OCR & Extraction IA Gemini active' : 'Saisie manuelle'}</span>
                      </li>
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={onGoRegister}
                    className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all ${
                      isPopular
                        ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/30'
                        : 'bg-slate-900 text-white hover:bg-black'
                    }`}
                  >
                    Démarrer 14j gratuits
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Contact Section ─── */}
      <section id="contact" className="py-24 bg-white border-t border-slate-100">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-extrabold text-indigo-600 uppercase tracking-widest mb-2 block">
              PARLEZ-NOUS DE VOS BESOINS
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900">Contactez l’équipe NEXORA</h2>
            <p className="text-slate-600 mt-2">Démonstration personnalisée ou déploiement sur site.</p>
          </div>

          <div className="bg-slate-50 p-8 sm:p-10 rounded-3xl border border-slate-200/80 shadow-sm">
            <form onSubmit={handleContactSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Organisation *</label>
                  <input
                    type="text"
                    required
                    value={contactForm.companyName}
                    onChange={(e) => setContactForm({ ...contactForm, companyName: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:border-indigo-600 outline-none"
                    placeholder="Ministère, Société..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Nom &amp; Prénom *</label>
                  <input
                    type="text"
                    required
                    value={contactForm.contactName}
                    onChange={(e) => setContactForm({ ...contactForm, contactName: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:border-indigo-600 outline-none"
                    placeholder="M. / Mme..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">E-mail professionnel *</label>
                  <input
                    type="email"
                    required
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:border-indigo-600 outline-none"
                    placeholder="contact@organisation.bj"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Téléphone / WhatsApp</label>
                  <input
                    type="tel"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:border-indigo-600 outline-none"
                    placeholder="+229 ..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Message / Projet</label>
                <textarea
                  rows={4}
                  value={contactForm.message}
                  onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:border-indigo-600 outline-none"
                  placeholder="Décrivez brièvement le volume de courriers et le nombre de services..."
                />
              </div>

              {contactFeedback && (
                <div className={`p-4 rounded-xl text-sm font-medium ${contactStatus === 'sent' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {contactFeedback}
                </div>
              )}

              <button
                type="submit"
                disabled={contactStatus === 'sending'}
                className="w-full py-4 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/30 disabled:opacity-60"
              >
                {contactStatus === 'sending' ? 'Envoi en cours...' : 'Envoyer notre demande'}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="py-12 bg-slate-950 text-slate-400 text-sm border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <NexoraLogo size="md" />
            <span className="text-xs text-slate-500">· Cotonou, République du Bénin</span>
          </div>

          <div className="flex items-center gap-6 text-xs">
            <button type="button" onClick={() => setLegalModal('cgu')} className="hover:text-white transition-colors">
              Conditions Générales
            </button>
            <button type="button" onClick={() => setLegalModal('privacy')} className="hover:text-white transition-colors">
              Politique de Confidentialité
            </button>
            <span>&copy; {new Date().getFullYear()} NEXORA. Tous droits réservés.</span>
          </div>
        </div>
      </footer>

      {/* Modale Légale */}
      {legalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative">
            <h3 className="text-xl font-bold text-slate-900 mb-4">
              {legalModal === 'cgu' ? "Conditions Générales d'Utilisation" : "Politique de Confidentialité"}
            </h3>
            <div className="text-sm text-slate-600 max-h-80 overflow-y-auto space-y-3 pr-2">
              <p>NEXORA s'engage à garantir la confidentialité et l'isolation stricte des données de chaque organisation cliente.</p>
              <p>Tous les documents scannés et les pièces jointes sont chiffrés et confinés au sein de la base de données de l'entreprise.</p>
              <p>L'utilisation des services d'OCR et de résumé par Intelligence Artificielle ne fait l'objet d'aucune réutilisation à des fins d'entraînement public de modèles.</p>
            </div>
            <button
              type="button"
              onClick={() => setLegalModal(null)}
              className="mt-6 w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-sm"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
