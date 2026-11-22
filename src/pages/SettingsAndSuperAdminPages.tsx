import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Printer,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Stamp,
  Upload,
} from 'lucide-react';
import { apiFetch } from '../api/client.ts';
import { useAuth } from '../context/AuthContext.tsx';
import type {
  CompanyInfo,
  PaymentMethodCode,
  PaymentTransactionItem,
  SubscriptionPlan,
  WestAfricaCountry,
  WestAfricaPaymentMethod,
} from '../types/nexora.ts';

async function readStampFileAsDataUrl(file: File): Promise<string> {
  if (file.type === 'image/svg+xml') {
    const txt = await file.text();
    return `data:image/svg+xml;utf8,${encodeURIComponent(txt)}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 400 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Image de cachet illisible.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Lecture impossible.'));
    reader.readAsDataURL(file);
  });
}

function detectCardBrand(num: string): string {
  const digits = num.replace(/\D/g, '');
  if (digits.startsWith('4')) return 'Visa';
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return 'Mastercard';
  if (digits.startsWith('6') || digits.startsWith('9')) return 'GIM-UEMOA';
  return 'Carte Bancaire';
}

function loadKkiapaySdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Navigateur requis'));
  const w = window as unknown as { openKkiapayWidget?: unknown };
  if (typeof w.openKkiapayWidget === 'function') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-kkiapay-sdk="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Impossible de charger le guichet Kkiapay.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.kkiapay.me/k.js';
    script.async = true;
    script.dataset.kkiapaySdk = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Impossible de charger le guichet Kkiapay.'));
    document.head.appendChild(script);
  });
}

export function SettingsAndBillingPage() {
  const { refreshSession } = useAuth();
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; user_name: string; action: string; context: string; created_at: string }>>([]);
  const [paymentMethods, setPaymentMethods] = useState<WestAfricaPaymentMethod[]>([]);
  const [countries, setCountries] = useState<WestAfricaCountry[]>([]);
  const [gateway, setGateway] = useState<{ provider: string; isLive: boolean; publicKey?: string; sandbox?: boolean }>({
    provider: 'SANDBOX_UEMOA',
    isLive: false,
  });
  const [transactions, setTransactions] = useState<PaymentTransactionItem[]>([]);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    tradeName: '',
    city: '',
    address: '',
    phone: '',
    email: '',
    refPrefixIn: 'ARR',
    refPrefixOut: 'DEP',
    refPrefixInt: 'INT',
    retentionDays: 3650,
    stampImage: '',
  });

  // Checkout state
  const [selectedPlanId, setSelectedPlanId] = useState('plan_institutionnel');
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [countryCode, setCountryCode] = useState('BJ');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode>('MTN_MOMO');
  const [momoPhone, setMomoPhone] = useState('+229 01 97 00 00 00');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const [pendingTx, setPendingTx] = useState<{
    transactionId: string;
    externalTxRef: string;
    amountFcfa: number;
    paymentMethod: PaymentMethodCode;
    provider: string;
    mode: string;
    payerMask: string;
    kkiapayPublicKey?: string;
    kkiapaySandbox?: boolean;
  } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<PaymentTransactionItem | null>(null);
  const pendingTxRef = useRef<typeof pendingTx>(null);
  const kkiapayListenerAttachedRef = useRef(false);
  pendingTxRef.current = pendingTx;

  const loadAll = useCallback(async () => {
    try {
      const [sRes, pRes, aRes, pmRes, txRes] = await Promise.all([
        apiFetch<{ company: CompanyInfo }>('/api/settings'),
        apiFetch<{ plans: SubscriptionPlan[] }>('/api/public/plans'),
        apiFetch<{ logs: Array<{ id: string; user_name: string; action: string; context: string; created_at: string }> }>('/api/audit-logs'),
        apiFetch<{
          methods: WestAfricaPaymentMethod[];
          countries: WestAfricaCountry[];
          gateway: { provider: string; isLive: boolean; publicKey?: string; sandbox?: boolean };
        }>('/api/subscription/payment-methods'),
        apiFetch<{ transactions: PaymentTransactionItem[] }>('/api/subscription/transactions'),
      ]);
      setCompany(sRes.company);
      setPlans(pRes.plans);
      setSelectedPlanId(sRes.company.plan_id || 'plan_institutionnel');
      setAuditLogs(aRes.logs);
      setPaymentMethods(pmRes.methods);
      setCountries(pmRes.countries);
      setGateway(pmRes.gateway);
      setTransactions(txRes.transactions);
      setForm({
        tradeName: sRes.company.trade_name,
        city: sRes.company.city,
        address: sRes.company.address,
        phone: sRes.company.phone,
        email: sRes.company.email,
        refPrefixIn: sRes.company.ref_prefix_in,
        refPrefixOut: sRes.company.ref_prefix_out,
        refPrefixInt: sRes.company.ref_prefix_int,
        retentionDays: sRes.company.retention_days,
        stampImage: sRes.company.stamp_image || '',
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback('');
    setError('');
    try {
      await apiFetch('/api/settings', { method: 'PATCH', body: JSON.stringify(form) });
      setFeedback('Paramètres de l’entreprise, cachet officiel et formats de référence enregistrés.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur sauvegarde');
    }
  };

  const handleUploadCompanyStamp = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await readStampFileAsDataUrl(file);
      setForm((prev) => ({ ...prev, stampImage: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur image cachet');
    }
  };

  const handleInitiateCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback('');
    setError('');
    setCheckoutLoading(true);
    try {
      const cleanDigits = cardNumber.replace(/\D/g, '');
      if (paymentMethod === 'CARD') {
        if (cleanDigits.length < 12 || !cardExpiry.trim() || cardCvv.trim().length < 3 || !cardHolder.trim()) {
          throw new Error('Veuillez renseigner un numéro de carte valide, le titulaire, la date d’expiration et le CVV.');
        }
      }
      const res = await apiFetch<{
        transactionId: string;
        externalTxRef: string;
        amountFcfa: number;
        paymentMethod: PaymentMethodCode;
        provider: string;
        mode: string;
        payerMask: string;
        kkiapayPublicKey?: string;
        kkiapaySandbox?: boolean;
      }>('/api/subscription/checkout', {
        method: 'POST',
        body: JSON.stringify({
          planId: selectedPlanId,
          billingCycle,
          paymentMethod,
          countryCode,
          phoneNumber: paymentMethod !== 'CARD' ? momoPhone : undefined,
          cardLast4: paymentMethod === 'CARD' ? cleanDigits.slice(-4) : undefined,
          cardBrand: paymentMethod === 'CARD' ? detectCardBrand(cleanDigits) : undefined,
          cardHolder: paymentMethod === 'CARD' ? cardHolder.trim() : undefined,
        }),
      });
      setPendingTx(res);
      setOtpCode('');
      setCardNumber('');
      setCardCvv('');
      setFeedback(`Transaction ${res.externalTxRef} initiée. Finalisez la validation pour activer votre abonnement.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du paiement');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const confirmPaymentWithCode = async (txId: string, code: string) => {
    setError('');
    setFeedback('');
    setConfirming(true);
    try {
      const res = await apiFetch<{
        receiptNumber: string;
        expiresAt: string;
        transaction: PaymentTransactionItem;
      }>('/api/subscription/confirm', {
        method: 'POST',
        body: JSON.stringify({
          transactionId: txId,
          otpOrAuthorizationCode: code,
        }),
      });
      setFeedback(`Paiement confirmé ! Reçu ${res.receiptNumber} émis · Abonnement actif jusqu’au ${res.expiresAt}.`);
      setPendingTx(null);
      setOtpCode('');
      setReceiptPreview(res.transaction);
      await refreshSession();
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec confirmation paiement');
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingTx) return;
    await confirmPaymentWithCode(pendingTx.transactionId, otpCode);
  };

  const handleOpenKkiapayWidget = async () => {
    const activeTx = pendingTxRef.current;
    if (!activeTx || !activeTx.kkiapayPublicKey || !company) return;
    setError('');
    try {
      await loadKkiapaySdk();
      const w = window as unknown as {
        openKkiapayWidget?: (opts: Record<string, unknown>) => void;
        addSuccessListener?: (cb: (res: { transactionId: string }) => void) => void;
      };
      if (!kkiapayListenerAttachedRef.current && typeof w.addSuccessListener === 'function') {
        kkiapayListenerAttachedRef.current = true;
        w.addSuccessListener((response) => {
          const latestTx = pendingTxRef.current;
          if (response?.transactionId && latestTx) {
            setOtpCode(response.transactionId);
            void confirmPaymentWithCode(latestTx.transactionId, response.transactionId);
          }
        });
      }
      if (typeof w.openKkiapayWidget === 'function') {
        w.openKkiapayWidget({
          amount: activeTx.amountFcfa,
          position: 'center',
          key: activeTx.kkiapayPublicKey,
          sandbox: Boolean(activeTx.kkiapaySandbox),
          phone: paymentMethod !== 'CARD' ? momoPhone.replace(/\s+/g, '') : undefined,
          email: company.email,
          name: company.legal_name,
        });
      } else {
        throw new Error('Widget Kkiapay indisponible.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur d’ouverture du guichet Kkiapay');
    }
  };

  if (!company) return <div className="p-8 text-sm text-slate-500">Chargement des paramètres...</div>;

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];
  const computedAmountFcfa = selectedPlan
    ? billingCycle === 'ANNUAL'
      ? Math.round(selectedPlan.price_monthly_fcfa * 12 * 0.85)
      : selectedPlan.price_monthly_fcfa
    : 0;
  const availableMethods = paymentMethods.filter((m) => m.countries.includes(countryCode));
  const activeMethodObj = paymentMethods.find((m) => m.code === paymentMethod);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Paramètres, Abonnement &amp; Journal d’audit
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Configurez les règles de numérotation, le cachet officiel, réglez votre abonnement par Carte Bancaire ou Mobile Money Afrique de l’Ouest et consultez vos reçus.
        </p>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Company Settings & Official Stamp */}
      <form onSubmit={handleSaveSettings} className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
        <h2 className="font-display text-base font-bold">Paramètres de l’entreprise, Références &amp; Cachet officiel</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Nom commercial</label>
            <input
              type="text"
              value={form.tradeName}
              onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Ville</label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Téléphone</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Préfixe Entrants</label>
            <input
              type="text"
              maxLength={6}
              value={form.refPrefixIn}
              onChange={(e) => setForm({ ...form, refPrefixIn: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono uppercase"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Préfixe Sortants</label>
            <input
              type="text"
              maxLength={6}
              value={form.refPrefixOut}
              onChange={(e) => setForm({ ...form, refPrefixOut: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono uppercase"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Préfixe Internes</label>
            <input
              type="text"
              maxLength={6}
              value={form.refPrefixInt}
              onChange={(e) => setForm({ ...form, refPrefixInt: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono uppercase"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Durée de conservation (jours)</label>
            <input
              type="number"
              min={365}
              value={form.retentionDays}
              onChange={(e) => setForm({ ...form, retentionDays: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-4 pt-2">
            {form.stampImage ? (
              <img
                src={form.stampImage}
                alt="Cachet officiel de l’entreprise"
                className="w-16 h-16 rounded-lg border border-slate-200 bg-white p-1 object-contain"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                <Stamp className="w-6 h-6" />
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs font-semibold">Image du cachet officiel de l’organisation</p>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                <Upload className="w-3.5 h-3.5" />
                <span>Importer le cachet (PNG/SVG)</span>
                <input type="file" accept="image/*" onChange={handleUploadCompanyStamp} className="hidden" />
              </label>
            </div>
          </div>
        </div>
        <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold">
          Enregistrer les paramètres
        </button>
      </form>

      {/* West Africa Payment Checkout & Subscription Management */}
      <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold">
              Abonnement &amp; Paiement — Carte Bancaire &amp; Mobile Money (Afrique de l’Ouest)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Formule actuelle : <span className="font-semibold text-slate-900 dark:text-white">{company.plan_name}</span> · Statut :{' '}
              <span className="font-mono font-semibold">{company.status}</span>
              {company.status === 'trial'
                ? ` (${company.trial_days_remaining} jours restants jusqu’au ${company.trial_ends_at})`
                : company.subscription_expires_at
                ? ` · Valable jusqu’au ${company.subscription_expires_at}`
                : ''}
            </p>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            Passerelle : {gateway.provider === 'KKIAPAY' ? `Kkiapay ${gateway.isLive ? '(Production)' : '(Sandbox Kkiapay)'}` : 'Sandbox UEMOA (Clés Kkiapay à configurer)'}
          </span>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => {
            const isChosen = selectedPlanId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlanId(p.id)}
                className={`text-left p-4 rounded-xl border transition-colors flex flex-col justify-between ${
                  isChosen
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-bold">{p.name}</h3>
                    {isChosen && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                  </div>
                  <p className="font-mono text-lg font-bold mt-1 tabular-nums">
                    {p.price_monthly_fcfa.toLocaleString('fr-FR')} FCFA/mois
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {p.max_users} utilisateurs · {p.max_mails_month.toLocaleString('fr-FR')} courriers/mois
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Checkout Form */}
        <form onSubmit={handleInitiateCheckout} className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5">Périodicité de facturation</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBillingCycle('MONTHLY')}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold ${
                    billingCycle === 'MONTHLY'
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-blue-600 dark:border-blue-600'
                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  Mensuel
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('ANNUAL')}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold ${
                    billingCycle === 'ANNUAL'
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-blue-600 dark:border-blue-600'
                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  Annuel (-15 %)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Pays (Zone UEMOA / CEDEAO)</label>
              <select
                value={countryCode}
                onChange={(e) => {
                  const nextCountry = e.target.value;
                  setCountryCode(nextCountry);
                  const compatible = paymentMethods.filter((m) => m.countries.includes(nextCountry));
                  if (compatible.length > 0 && !compatible.some((m) => m.code === paymentMethod)) {
                    setPaymentMethod(compatible[0].code);
                  }
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              >
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.dial})
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <p className="text-[11px] text-slate-500">Montant total à régler ({selectedPlan?.name})</p>
              <p className="font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                {computedAmountFcfa.toLocaleString('fr-FR')} FCFA
              </p>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold">Moyen de paiement</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {availableMethods.map((m) => {
                const selected = paymentMethod === m.code;
                return (
                  <button
                    key={m.code}
                    type="button"
                    onClick={() => setPaymentMethod(m.code)}
                    className={`p-3 rounded-lg border text-left transition-colors flex items-start gap-2.5 ${
                      selected
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                    }`}
                  >
                    {m.category === 'CARTE' ? (
                      <CreditCard className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    ) : (
                      <Smartphone className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">{m.label}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{m.ussdHint}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conditional Account Inputs */}
          {paymentMethod === 'CARD' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium mb-1">Nom du titulaire sur la carte</label>
                <input
                  type="text"
                  required
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value)}
                  placeholder="EX: CODJO DOSSOU"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Numéro de carte (Visa / MC / GIM)</label>
                <input
                  type="text"
                  required
                  maxLength={19}
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="4532 •••• •••• 1234"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Exp. MM/AA</label>
                  <input
                    type="text"
                    required
                    maxLength={5}
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                    placeholder="08/28"
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">CVV</label>
                  <input
                    type="password"
                    required
                    maxLength={4}
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value)}
                    placeholder="•••"
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                  />
                </div>
              </div>
              <p className="sm:col-span-2 lg:col-span-4 text-[11px] text-slate-500">
                Sécurité PCI : Seuls les 4 derniers chiffres et le réseau de carte sont transmis pour référence ; le numéro complet et le CVV ne sont jamais stockés.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Numéro {activeMethodObj?.label || 'Mobile Money'}
                </label>
                <input
                  type="tel"
                  required
                  value={momoPhone}
                  onChange={(e) => setMomoPhone(e.target.value)}
                  placeholder="+229 01 97 00 00 00"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
                />
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-center">
                {activeMethodObj?.ussdHint}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-[11px] text-slate-500">
              {gateway.provider === 'KKIAPAY'
                ? 'Passerelle Kkiapay active : règlement sécurisé par Carte Bancaire (Visa, Mastercard, GIM-UEMOA) et Mobile Money (MTN MoMo, Moov, Wave, Orange, Celtiis).'
                : 'Mode Sandbox UEMOA actif : aucune clé Kkiapay configurée dans .env (KKIAPAY_PUBLIC_KEY / KKIAPAY_PRIVATE_KEY), validation OTP simulée sans débit réel.'}
            </p>
            <button
              type="submit"
              disabled={checkoutLoading}
              className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-60"
            >
              {checkoutLoading
                ? 'Initialisation...'
                : `Payer ${computedAmountFcfa.toLocaleString('fr-FR')} FCFA`}
            </button>
          </div>
        </form>

        {/* Pending Kkiapay / Sandbox Verification Box */}
        {pendingTx && (
          <form
            onSubmit={handleConfirmPayment}
            className="p-5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Validation requise — Transaction {pendingTx.externalTxRef}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Compte : {pendingTx.payerMask} · Montant :{' '}
                  <span className="font-mono font-bold">{pendingTx.amountFcfa.toLocaleString('fr-FR')} FCFA</span> · Mode : {pendingTx.mode}
                </p>
              </div>
            </div>

            {pendingTx.provider === 'KKIAPAY' && pendingTx.kkiapayPublicKey ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleOpenKkiapayWidget}
                    className="px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold"
                  >
                    Ouvrir le guichet Kkiapay (Carte &amp; Mobile Money)
                  </button>
                </div>
                <div className="flex flex-wrap items-end gap-3 pt-1">
                  <div className="flex-1 min-w-[220px]">
                    <label className="block text-xs font-semibold mb-1">
                      ID de transaction Kkiapay ou code OTP Sandbox (ex: 123456)
                    </label>
                    <input
                      type="text"
                      required
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="Ex: kkp_tx_... ou 123456"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={confirming}
                    className="px-5 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {confirming ? 'Vérification Kkiapay...' : 'Vérifier & Activer l’abonnement'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-xs font-semibold mb-1">
                    Code de validation OTP USSD / 3D-Secure (4 à 6 chiffres, ex: 123456)
                  </label>
                  <input
                    type="text"
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="123456"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={confirming}
                  className="px-5 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-60"
                >
                  {confirming ? 'Validation...' : 'Confirmer le paiement & Activer'}
                </button>
              </div>
            )}
          </form>
        )}

        {/* Receipt Preview Card */}
        {receiptPreview && (
          <div className="p-5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-700" />
                <h3 className="font-display text-sm font-bold">
                  Reçu officiel N° {receiptPreview.receipt_number}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimer le reçu</span>
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">Organisation</span>
                <span className="font-semibold">{company.legal_name}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Moyen / Compte</span>
                <span className="font-semibold">{receiptPreview.payment_method} ({receiptPreview.payer_account_mask})</span>
              </div>
              <div>
                <span className="text-slate-500 block">Montant réglé</span>
                <span className="font-mono font-bold tabular-nums">{receiptPreview.amount_fcfa.toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div>
                <span className="text-slate-500 block">Référence / Mode</span>
                <span className="font-mono">{receiptPreview.external_tx_ref}</span>
              </div>
            </div>
          </div>
        )}

        {/* Payment History Table */}
        <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <h3 className="font-display text-sm font-bold">Historique des transactions &amp; Reçus ({transactions.length})</h3>
          {transactions.length === 0 ? (
            <p className="text-xs text-slate-500">Aucune transaction enregistrée pour le moment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2 pr-3">Référence</th>
                    <th className="py-2 pr-3">Formule</th>
                    <th className="py-2 pr-3">Moyen / Compte</th>
                    <th className="py-2 pr-3">Montant</th>
                    <th className="py-2 pr-3">Statut</th>
                    <th className="py-2 text-right">Reçu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="py-2.5 pr-3 font-mono">{tx.external_tx_ref}</td>
                      <td className="py-2.5 pr-3">{tx.plan_name || tx.plan_id} ({tx.billing_cycle === 'ANNUAL' ? 'Annuel' : 'Mensuel'})</td>
                      <td className="py-2.5 pr-3">
                        {tx.payment_method} · <span className="font-mono">{tx.payer_account_mask}</span>
                      </td>
                      <td className="py-2.5 pr-3 font-mono font-semibold tabular-nums">
                        {tx.amount_fcfa.toLocaleString('fr-FR')} FCFA
                      </td>
                      <td className="py-2.5 pr-3 font-mono">
                        <span className={tx.status === 'PAID' ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-amber-700'}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono">
                        {tx.receipt_number ? (
                          <button
                            type="button"
                            onClick={() => setReceiptPreview(tx)}
                            className="text-blue-700 dark:text-blue-400 hover:underline"
                          >
                            {tx.receipt_number}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Company Audit Log */}
      <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <h2 className="font-display text-base font-bold">Journal d’audit complet (Lecture seule)</h2>
        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {auditLogs.map((a) => (
            <div key={a.id} className="py-2.5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <span className="font-semibold text-slate-900 dark:text-white">{a.user_name}</span>
                <span className="font-mono text-blue-700 dark:text-blue-400 mx-2">{a.action}</span>
                <span className="text-slate-500">{a.context}</span>
              </div>
              <span className="font-mono text-slate-400 shrink-0">{a.created_at.slice(0, 16)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

interface SuperAdminOverview {
  companies: Array<{
    id: string;
    legal_name: string;
    city: string;
    country: string;
    email: string;
    plan_id: string;
    plan_name: string;
    status: string;
    trial_ends_at: string;
    user_count: number;
    mail_count: number;
    is_demo: number;
  }>;
  plans: Array<{ id: string; name: string; price_monthly_fcfa: number }>;
  leads: Array<{ id: string; company_name: string; contact_name: string; email: string; message: string; created_at: string }>;
  logs: Array<{ id: string; user_name: string; action: string; context: string; created_at: string }>;
  globalStats: {
    totalCompanies: number;
    activeCompanies: number;
    trialCompanies: number;
    suspendedCompanies: number;
    totalUsers: number;
    totalMails: number;
    totalEmailsLogged: number;
  };
}

export function SuperAdminPage() {
  const [data, setData] = useState<SuperAdminOverview | null>(null);
  const [error, setError] = useState('');

  const loadOverview = async () => {
    try {
      const res = await apiFetch<SuperAdminOverview>('/api/superadmin/overview');
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement Super Admin');
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const changeStatus = async (companyId: string, status: string) => {
    await apiFetch(`/api/superadmin/companies/${companyId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadOverview();
  };

  const changePlan = async (companyId: string, planId: string) => {
    await apiFetch(`/api/superadmin/companies/${companyId}/plan`, {
      method: 'PATCH',
      body: JSON.stringify({ planId }),
    });
    await loadOverview();
  };

  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!data) return <div className="p-8 text-sm text-slate-500">Chargement de la console NEXORA...</div>;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
          <ShieldCheck className="w-4 h-4" />
          <span>Administration générale de la plateforme NEXORA</span>
        </div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-1">
          Console Super Admin
        </h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500">Entreprises inscrites</p>
          <p className="font-mono text-3xl font-bold mt-2 tabular-nums">{data.globalStats.totalCompanies}</p>
          <p className="text-xs text-slate-500 mt-1">
            {data.globalStats.activeCompanies} actives · {data.globalStats.trialCompanies} essai
          </p>
        </div>
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500">Utilisateurs totaux</p>
          <p className="font-mono text-3xl font-bold mt-2 tabular-nums">{data.globalStats.totalUsers}</p>
        </div>
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500">Courriers gérés</p>
          <p className="font-mono text-3xl font-bold mt-2 tabular-nums">{data.globalStats.totalMails}</p>
        </div>
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500">E-mails départementaux</p>
          <p className="font-mono text-3xl font-bold mt-2 tabular-nums">{data.globalStats.totalEmailsLogged}</p>
        </div>
      </div>

      {/* Companies Management */}
      <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-base font-bold">Entreprises clientes &amp; Périodes d’essai</h2>
        </div>
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500">
              <th className="py-3 px-4">Entreprise</th>
              <th className="py-3 px-4">Formule</th>
              <th className="py-3 px-4">Utilisateurs / Courriers</th>
              <th className="py-3 px-4">Fin essai</th>
              <th className="py-3 px-4">Statut</th>
              <th className="py-3 px-4 text-right">Gestion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {data.companies.map((c) => (
              <tr key={c.id}>
                <td className="py-3 px-4">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {c.legal_name} {c.is_demo === 1 ? '(Démo)' : ''}
                  </p>
                  <p className="text-xs text-slate-500">
                    {c.city}, {c.country} · {c.email}
                  </p>
                </td>
                <td className="py-3 px-4">
                  <select
                    value={c.plan_id}
                    onChange={(e) => changePlan(c.id, e.target.value)}
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  >
                    {data.plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-3 px-4 font-mono text-xs tabular-nums">
                  {c.user_count} util. · {c.mail_count} courriers
                </td>
                <td className="py-3 px-4 font-mono text-xs">{c.trial_ends_at}</td>
                <td className="py-3 px-4 text-xs font-mono">{c.status}</td>
                <td className="py-3 px-4 text-right space-x-2">
                  {c.status !== 'active' && (
                    <button
                      type="button"
                      onClick={() => changeStatus(c.id, 'active')}
                      className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      Activer
                    </button>
                  )}
                  {c.status !== 'suspended' && (
                    <button
                      type="button"
                      onClick={() => changeStatus(c.id, 'suspended')}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Suspendre
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <h2 className="font-display text-base font-bold">Demandes commerciales &amp; Support ({data.leads.length})</h2>
          {data.leads.length === 0 ? (
            <p className="text-xs text-slate-500">Aucune demande de contact reçue.</p>
          ) : (
            <div className="space-y-3 text-xs">
              {data.leads.map((l) => (
                <div key={l.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <p className="font-semibold">
                    {l.company_name} — {l.contact_name} ({l.email})
                  </p>
                  <p className="text-slate-600 dark:text-slate-300 mt-1">{l.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <h2 className="font-display text-base font-bold">Journaux techniques globaux</h2>
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {data.logs.map((l) => (
              <div key={l.id} className="py-2 flex justify-between gap-2">
                <span className="truncate">
                  <span className="font-mono font-semibold">{l.action}</span> · {l.user_name} — {l.context}
                </span>
                <span className="font-mono text-slate-400 shrink-0">{l.created_at.slice(0, 16)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
