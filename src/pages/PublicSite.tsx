import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Moon, Shield, Sun, X } from 'lucide-react';
import { apiFetch } from '../api/client.ts';
import { NexoraLogo } from '../components/common/NexoraLogo.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import type { SubscriptionPlan } from '../types/nexora.ts';

interface PublicSiteProps {
  onGoLogin: () => void;
  onGoRegister: () => void;
}

export function PublicSite({ onGoLogin, onGoRegister }: PublicSiteProps) {
  const { theme, toggleTheme } = useTheme();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [heroImgError, setHeroImgError] = useState(false);
  const [ocrImgError, setOcrImgError] = useState(false);
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
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a href="#top" className="whitespace-nowrap shrink-0">
            <NexoraLogo />
          </a>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#fonctionnalites" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Fonctionnalités
            </a>
            <a href="#ia-ocr" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              OCR &amp; IA
            </a>
            <a href="#tarifs" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Tarifs
            </a>
            <a href="#contact" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Contact
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onGoLogin}
              className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-medium hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0"
            >
              Connexion
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="top" className="max-w-[1280px] mx-auto px-6 py-16 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-4">
              Plateforme SaaS de gestion documentaire · Cotonou &amp; Afrique de l’Ouest
            </p>
            <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.12]">
              Maîtrisez chaque courrier et circuit de validation administratif.
            </h1>
            <p className="mt-6 text-base lg:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              NEXORA centralise vos courriers entrants, sortants et internes, extrait automatiquement vos documents par intelligence artificielle et garantit le retour obligatoire au Secrétariat jusqu’à l’archivage final.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onGoRegister}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors whitespace-nowrap"
              >
                <span>Créer un compte entreprise (14 jours gratuits)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onGoLogin}
                className="px-5 py-3 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors whitespace-nowrap"
              >
                Explorer la démo NEXORA DEMO GROUP
              </button>
            </div>

            <div className="mt-10 pt-8 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-6">
              <div>
                <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">100 %</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Traçabilité &amp; retour Secrétariat</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">4 Rôles</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Admin, Président, Responsable, Agent</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">14 Jours</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Essai complet sans engagement</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[340px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
              {!heroImgError ? (
                <img
                  src="/src/assets/images/hero_nexora_office_1795369286520.jpg"
                  alt="Siège administratif moderne équipé de NEXORA"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center">
                  <Shield className="w-12 h-12 text-slate-400 mb-3" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Environnement institutionnel NEXORA
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section id="fonctionnalites" className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 py-20">
        <div className="max-w-[1280px] mx-auto px-6">
          <div className="max-w-2xl mb-12">
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Une architecture métier fidèle à vos procédures administratives.
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-300">
              Chaque espace de travail est isolé par entreprise et structuré autour du rôle réel de vos équipes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                num: '01.',
                title: 'Secrétariat central & retour obligatoire',
                desc: 'Réception, numérisation, orientation, contrôle documentaire final, preuve d’expédition et archivage : aucun courrier entrant traité ne contourne le retour au Secrétariat.',
                span: 'lg:col-span-2',
              },
              {
                num: '02.',
                title: 'Alerte e-mail au chef de département',
                desc: 'Dès qu’un agent reçoit un courrier ou une affectation, le Responsable de son département reçoit automatiquement un e-mail récapitulatif.',
                span: '',
              },
              {
                num: '03.',
                title: 'Workflows séquentiels & parallèles versionnés',
                desc: 'Configurez des circuits avec validation simple, quorum parallèle ou signature présidentielle sélective sans altérer les dossiers en cours.',
                span: '',
              },
              {
                num: '04.',
                title: 'Tableaux de bord dédiés par responsabilité',
                desc: 'Vue stratégique épurée pour le Président, pilotage d’équipe pour les Responsables, suivi des tâches pour les Agents et console Super Admin indépendante.',
                span: 'lg:col-span-2',
              },
            ].map((item) => (
              <div
                key={item.num}
                className={`p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${item.span}`}
              >
                <p className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">{item.num}</p>
                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white mt-2">{item.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI OCR Section */}
      <section id="ia-ocr" className="max-w-[1280px] mx-auto px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6">
            <div className="aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
              {!ocrImgError ? (
                <img
                  src="/src/assets/images/feature_ai_ocr_scan_1795369286218.jpg"
                  alt="Numérisation et analyse IA de courriers officiels"
                  referrerPolicy="no-referrer"
                  onError={() => setOcrImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-8 text-slate-500">
                  Module OCR &amp; Extraction Gemini
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-6">
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Lecture OCR et préremplissage assisté par intelligence artificielle.
            </h2>
            <p className="mt-4 text-slate-600 dark:text-slate-300 leading-relaxed">
              Déposez un PDF texte, un PDF scanné multipage ou une photo prise au smartphone. NEXORA extrait le texte, identifie expéditeur, référence externe, objet et échéances sans jamais inventer de données manquantes, détecte les doublons potentiels et génère un résumé court et détaillé.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <span>Écran côte à côte : aperçu du document original à gauche, champs extraits à droite.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <span>Validation humaine obligatoire avant tout enregistrement officiel.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <span>Continuité garantie : bascule manuelle immédiate si un document est illisible.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="tarifs" className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 py-20">
        <div className="max-w-[1280px] mx-auto px-6">
          <div className="max-w-2xl mb-12">
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Offres d’abonnement transparentes
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-300">
              Chaque nouvelle organisation démarre avec 14 jours d’essai gratuit complet avant de choisir sa formule.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-400">{plan.audience}</p>
                  <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-1">{plan.name}</h3>
                  <p className="mt-4 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {plan.price_monthly_fcfa.toLocaleString('fr-FR')} FCFA
                    <span className="text-xs font-normal text-slate-500"> / mois</span>
                  </p>
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1 font-mono tabular-nums">
                    <p>{plan.max_users} utilisateurs max</p>
                    <p>{(plan.max_storage_mb / 1024).toFixed(0)} Go stockage documentaire</p>
                    <p>{plan.max_mails_month.toLocaleString('fr-FR')} courriers / mois</p>
                  </div>
                  <ul className="mt-5 space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={onGoRegister}
                  className="mt-8 w-full py-2.5 px-4 rounded-lg border border-slate-900 dark:border-blue-600 text-slate-900 dark:text-blue-400 text-sm font-semibold hover:bg-slate-900 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white transition-colors"
                >
                  Démarrer l’essai 14 jours
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact / Lead Capture */}
      <section id="contact" className="max-w-[1280px] mx-auto px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5">
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Contacter l’équipe NEXORA
            </h2>
            <p className="mt-4 text-slate-600 dark:text-slate-300 leading-relaxed">
              Vous souhaitez déployer NEXORA au sein d’une administration, d’un groupe multi-services ou demander un accompagnement sur mesure à Cotonou ou à l’international ?
            </p>
            <div className="mt-6 space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <p>Siège opérationnel : Haie Vive, Cotonou, Bénin</p>
              <p>Support commercial : commercial@nexora.bj</p>
            </div>
          </div>

          <div className="lg:col-span-7">
            <form
              onSubmit={handleContactSubmit}
              className="p-6 lg:p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Entreprise / Institution *
                  </label>
                  <input
                    type="text"
                    required
                    value={contactForm.companyName}
                    onChange={(e) => setContactForm({ ...contactForm, companyName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nom et prénom *
                  </label>
                  <input
                    type="text"
                    required
                    value={contactForm.contactName}
                    onChange={(e) => setContactForm({ ...contactForm, contactName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    E-mail professionnel *
                  </label>
                  <input
                    type="email"
                    required
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Téléphone</label>
                  <input
                    type="tel"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Message *</label>
                <textarea
                  rows={3}
                  required
                  value={contactForm.message}
                  onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>

              {contactFeedback && (
                <p
                  className={`text-sm ${
                    contactStatus === 'sent' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {contactFeedback}
                </p>
              )}

              <button
                type="submit"
                disabled={contactStatus === 'sending'}
                className="px-5 py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors disabled:opacity-60"
              >
                {contactStatus === 'sending' ? 'Envoi...' : 'Envoyer la demande'}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-8 px-6">
        <div className="max-w-[1280px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-4">
            <NexoraLogo />
            <span>© {new Date().getFullYear()} NEXORA — Tous droits réservés</span>
          </div>
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => setLegalModal('cgu')} className="hover:text-slate-900 dark:hover:text-white">
              Conditions d’utilisation
            </button>
            <button type="button" onClick={() => setLegalModal('privacy')} className="hover:text-slate-900 dark:hover:text-white">
              Politique de confidentialité
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{theme === 'dark' ? 'Mode clair' : 'Mode sombre'}</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Legal Modal */}
      {legalModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold">
                {legalModal === 'cgu' ? 'Conditions Générales d’Utilisation' : 'Politique de Confidentialité'}
              </h3>
              <button type="button" onClick={() => setLegalModal(null)} className="p-1 text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed">
              {legalModal === 'cgu' ? (
                <>
                  <p>
                    NEXORA met à disposition des entreprises un espace de travail isolé pour la gestion dématérialisée des courriers et circuits de validation.
                  </p>
                  <p>
                    Chaque entreprise bénéficie d’une période d’essai gratuit de 14 jours. Aucune suppression automatique des courriers n’est effectuée à l’expiration sans intervention administrative conforme à la politique de conservation.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Les données et documents d’une entreprise sont strictement isolés et accessibles uniquement aux utilisateurs habilités selon leurs rôles et permissions.
                  </p>
                  <p>
                    Les documents transmis au module OCR/IA sont analysés uniquement pour extraire les métadonnées administratives et ne sont jamais utilisés comme instructions applicatives.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
