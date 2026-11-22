import crypto from 'node:crypto';
import { db } from '../db/database.ts';
import type { AuthUser } from '../types.ts';
import { newId } from '../utils/crypto.ts';
import { logAudit } from './auditService.ts';

export type PaymentMethodCode =
  | 'CARD'
  | 'MTN_MOMO'
  | 'MOOV_MONEY'
  | 'WAVE'
  | 'ORANGE_MONEY'
  | 'CELTIIS_CASH';

export type BillingCycle = 'MONTHLY' | 'ANNUAL';

export interface WestAfricaPaymentMethod {
  code: PaymentMethodCode;
  label: string;
  category: 'CARTE' | 'MOBILE_MONEY';
  countries: string[];
  ussdHint: string;
}

export const WEST_AFRICA_PAYMENT_METHODS: WestAfricaPaymentMethod[] = [
  {
    code: 'CARD',
    label: 'Carte Bancaire (Visa / Mastercard / GIM-UEMOA)',
    category: 'CARTE',
    countries: ['BJ', 'CI', 'SN', 'TG', 'BF', 'ML', 'NE', 'GN'],
    ussdHint: 'Paiement sécurisé 3D-Secure par carte internationale ou GIM-UEMOA via Kkiapay',
  },
  {
    code: 'MTN_MOMO',
    label: 'MTN Mobile Money (MoMo)',
    category: 'MOBILE_MONEY',
    countries: ['BJ', 'CI', 'GN'],
    ussdHint: 'Validation push USSD *880# (Bénin) / *133# (CI)',
  },
  {
    code: 'MOOV_MONEY',
    label: 'Moov Money (Flooz / Moov Cash)',
    category: 'MOBILE_MONEY',
    countries: ['BJ', 'CI', 'TG', 'BF', 'NE', 'ML'],
    ussdHint: 'Validation push USSD *855# / *155#',
  },
  {
    code: 'WAVE',
    label: 'Wave Mobile Money',
    category: 'MOBILE_MONEY',
    countries: ['SN', 'CI', 'BF', 'ML', 'NE'],
    ussdHint: 'Confirmation instantanée depuis l’application Wave',
  },
  {
    code: 'ORANGE_MONEY',
    label: 'Orange Money',
    category: 'MOBILE_MONEY',
    countries: ['CI', 'SN', 'BF', 'ML', 'GN', 'NE'],
    ussdHint: 'Validation push / code temporaire #144#',
  },
  {
    code: 'CELTIIS_CASH',
    label: 'Celtiis Cash (Bénin)',
    category: 'MOBILE_MONEY',
    countries: ['BJ'],
    ussdHint: 'Validation USSD *889# (Réseau Celtiis Bénin)',
  },
];

export const WEST_AFRICA_COUNTRIES = [
  { code: 'BJ', name: 'Bénin', dial: '+229' },
  { code: 'CI', name: 'Côte d’Ivoire', dial: '+225' },
  { code: 'SN', name: 'Sénégal', dial: '+221' },
  { code: 'TG', name: 'Togo', dial: '+228' },
  { code: 'BF', name: 'Burkina Faso', dial: '+226' },
  { code: 'ML', name: 'Mali', dial: '+223' },
  { code: 'NE', name: 'Niger', dial: '+227' },
  { code: 'GN', name: 'Guinée', dial: '+224' },
];

export function getActiveGatewayConfig(): {
  provider: 'KKIAPAY' | 'SANDBOX_UEMOA';
  isLive: boolean;
  publicKey: string;
  sandbox: boolean;
} {
  const privateKey = process.env.KKIAPAY_PRIVATE_KEY?.trim() || '';
  const publicKey = process.env.KKIAPAY_PUBLIC_KEY?.trim() || '';
  const sandbox = (process.env.KKIAPAY_SANDBOX || 'false') === 'true';

  if (privateKey && publicKey) {
    return {
      provider: 'KKIAPAY',
      isLive: !sandbox,
      publicKey,
      sandbox,
    };
  }
  return {
    provider: 'SANDBOX_UEMOA',
    isLive: false,
    publicKey: '',
    sandbox: true,
  };
}

export function computeAmountFcfa(monthlyPriceFcfa: number, billingCycle: BillingCycle): number {
  if (billingCycle === 'ANNUAL') {
    return Math.round(monthlyPriceFcfa * 12 * 0.85);
  }
  return monthlyPriceFcfa;
}

function maskPayerAccount(method: PaymentMethodCode, phoneNumber?: string, cardLast4?: string): string {
  if (method === 'CARD') {
    const clean = (cardLast4 || '').replace(/\D/g, '').slice(-4);
    return clean ? `Carte •••• ${clean}` : 'Carte Bancaire';
  }
  const cleanPhone = (phoneNumber || '').trim();
  if (cleanPhone.length >= 4) {
    return `${cleanPhone.slice(0, Math.max(0, cleanPhone.length - 4)).replace(/\d/g, '•')}${cleanPhone.slice(-4)}`;
  }
  return cleanPhone || 'Mobile Money';
}

export async function initiateSubscriptionCheckout(args: {
  companyId: string;
  actor: AuthUser;
  planId: string;
  billingCycle: BillingCycle;
  paymentMethod: PaymentMethodCode;
  countryCode: string;
  phoneNumber?: string;
  cardLast4?: string;
  cardBrand?: string;
  cardHolder?: string;
  appBaseUrl: string;
}) {
  const {
    companyId,
    actor,
    planId,
    billingCycle,
    paymentMethod,
    countryCode,
    phoneNumber,
    cardLast4,
    cardBrand,
    cardHolder,
  } = args;

  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1').get(planId) as
    | { id: string; name: string; price_monthly_fcfa: number }
    | undefined;
  if (!plan) {
    throw new Error('Formule d’abonnement introuvable.');
  }

  const company = db.prepare('SELECT id, legal_name, email, phone FROM companies WHERE id = ?').get(companyId) as
    | { id: string; legal_name: string; email: string; phone: string }
    | undefined;
  if (!company) {
    throw new Error('Entreprise introuvable.');
  }

  if (paymentMethod !== 'CARD' && (!phoneNumber || phoneNumber.replace(/\D/g, '').length < 8)) {
    throw new Error('Veuillez saisir un numéro Mobile Money valide (minimum 8 chiffres).');
  }
  if (paymentMethod === 'CARD' && (!cardLast4 || cardLast4.replace(/\D/g, '').length < 4)) {
    throw new Error('Veuillez renseigner les informations de votre carte bancaire.');
  }

  const amountFcfa = computeAmountFcfa(plan.price_monthly_fcfa, billingCycle);
  const txId = newId('pay');
  const gateway = getActiveGatewayConfig();
  const payerMask = maskPayerAccount(paymentMethod, phoneNumber, cardLast4);
  const externalTxRef = `KKP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const mode = gateway.provider === 'KKIAPAY' ? (gateway.sandbox ? 'KKIAPAY_SANDBOX' : 'KKIAPAY_LIVE') : 'SANDBOX_UEMOA';

  db.prepare(`
    INSERT INTO payment_transactions (
      id, company_id, plan_id, billing_cycle, amount_fcfa, currency, payment_method, provider,
      country_code, payer_account_mask, external_tx_ref, checkout_url, status, mode, metadata_json, initiated_by
    ) VALUES (?, ?, ?, ?, ?, 'XOF', ?, ?, ?, ?, ?, '', 'PENDING', ?, ?, ?)
  `).run(
    txId,
    companyId,
    plan.id,
    billingCycle,
    amountFcfa,
    paymentMethod,
    gateway.provider,
    countryCode,
    payerMask,
    externalTxRef,
    mode,
    JSON.stringify({ cardBrand: cardBrand || '', cardHolder: cardHolder || '', phoneMasked: payerMask }),
    actor.id
  );

  logAudit({
    companyId,
    userId: actor.id,
    userName: actor.fullName,
    action: 'INITIATION_PAIEMENT',
    entityType: 'PAYMENT',
    entityId: txId,
    newValue: { plan: plan.name, billingCycle, amountFcfa, paymentMethod, provider: gateway.provider },
    context: `Transaction ${externalTxRef} initiée via ${gateway.provider} (${payerMask}).`,
  });

  return {
    transactionId: txId,
    externalTxRef,
    amountFcfa,
    currency: 'XOF',
    paymentMethod,
    provider: gateway.provider,
    mode,
    checkoutUrl: '',
    payerMask,
    status: 'PENDING',
    kkiapayPublicKey: gateway.publicKey,
    kkiapaySandbox: gateway.sandbox,
  };
}

export async function confirmAndVerifyPayment(args: {
  companyId: string;
  transactionId: string;
  actor: AuthUser;
  otpOrAuthorizationCode?: string;
}) {
  const { companyId, transactionId, actor, otpOrAuthorizationCode } = args;

  const tx = db
    .prepare('SELECT * FROM payment_transactions WHERE id = ? AND company_id = ?')
    .get(transactionId, companyId) as
    | {
        id: string;
        plan_id: string;
        billing_cycle: BillingCycle;
        amount_fcfa: number;
        payment_method: PaymentMethodCode;
        provider: string;
        external_tx_ref: string;
        status: string;
      }
    | undefined;

  if (!tx) throw new Error('Transaction de paiement introuvable.');
  if (tx.status === 'PAID') {
    return { alreadyPaid: true, transaction: tx };
  }

  let verifiedExternalRef = tx.external_tx_ref;

  // Real Kkiapay server-side verification when KKIAPAY_PRIVATE_KEY is configured
  if (tx.provider === 'KKIAPAY' && process.env.KKIAPAY_PRIVATE_KEY?.trim()) {
    const kkiapayTxId = (otpOrAuthorizationCode || '').trim();
    if (!kkiapayTxId) {
      throw new Error('Identifiant de transaction Kkiapay ou code OTP requis pour la validation.');
    }
    const isSandbox = (process.env.KKIAPAY_SANDBOX || 'false') === 'true';

    // In sandbox mode, allow rapid validation with test codes (e.g. 123456 or sandbox transaction IDs)
    if (isSandbox && (/^\d{4,6}$/.test(kkiapayTxId) || kkiapayTxId.toUpperCase().startsWith('TEST') || kkiapayTxId.toUpperCase() === 'SANDBOX')) {
      verifiedExternalRef = `KKP-SANDBOX-${kkiapayTxId}`;
    } else {
      const baseUrl = isSandbox
        ? 'https://api-sandbox.kkiapay.me'
        : 'https://api.kkiapay.me';

      try {
        const verifyRes = await fetch(`${baseUrl}/api/v1/transactions/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.KKIAPAY_PUBLIC_KEY || '',
            'x-private-key': process.env.KKIAPAY_PRIVATE_KEY.trim(),
            'x-secret-key': process.env.KKIAPAY_SECRET_KEY?.trim() || process.env.KKIAPAY_SECRET?.trim() || '',
          },
          body: JSON.stringify({ transactionId: kkiapayTxId }),
        });

        if (!verifyRes.ok) {
          if (isSandbox) {
            // In sandbox, fallback gracefully to sandbox confirmation
            verifiedExternalRef = `KKP-SANDBOX-${kkiapayTxId}`;
          } else {
            throw new Error('Impossible de vérifier la transaction auprès de Kkiapay.');
          }
        } else {
          const verifyJson = (await verifyRes.json()) as { status?: string; amount?: number };
          if (verifyJson.status !== 'SUCCESS') {
            if (isSandbox) {
              verifiedExternalRef = `KKP-SANDBOX-${kkiapayTxId}`;
            } else {
              throw new Error(`Statut Kkiapay non validé : ${verifyJson.status || 'EN_ATTENTE'}.`);
            }
          } else {
            if (verifyJson.amount !== undefined && Number(verifyJson.amount) < tx.amount_fcfa) {
              throw new Error('Montant réglé sur Kkiapay inférieur au montant de la formule.');
            }
            verifiedExternalRef = `KKP-${kkiapayTxId}`;
          }
        }
      } catch (fetchErr) {
        if (isSandbox) {
          verifiedExternalRef = `KKP-SANDBOX-${kkiapayTxId}`;
        } else {
          throw fetchErr;
        }
      }
    }
  } else {
    // Sandbox UEMOA confirmation when Kkiapay merchant keys aren't configured in environment
    const code = (otpOrAuthorizationCode || '').trim();
    if (!/^\d{4,6}$/.test(code)) {
      throw new Error('Veuillez saisir le code de validation OTP / 3D-Secure à 4–6 chiffres (ex: 123456).');
    }
  }

  const daysToAdd = tx.billing_cycle === 'ANNUAL' ? 365 : 30;
  const expiresAt = new Date(Date.now() + daysToAdd * 86400000).toISOString().slice(0, 10);
  const receiptNumber = `REC-${new Date().getFullYear()}-${crypto.randomInt(100000, 999999)}`;

  db.transaction(() => {
    db.prepare(`
      UPDATE payment_transactions
      SET status = 'PAID', external_tx_ref = ?, receipt_number = ?, paid_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(verifiedExternalRef, receiptNumber, tx.id, companyId);

    db.prepare(`
      UPDATE companies
      SET plan_id = ?, status = 'active', billing_cycle = ?, subscription_expires_at = ?
      WHERE id = ?
    `).run(tx.plan_id, tx.billing_cycle, expiresAt, companyId);
  })();

  logAudit({
    companyId,
    userId: actor.id,
    userName: actor.fullName,
    action: 'PAIEMENT_ABONNEMENT_CONFIRME',
    entityType: 'PAYMENT',
    entityId: tx.id,
    newValue: {
      planId: tx.plan_id,
      amountFcfa: tx.amount_fcfa,
      receiptNumber,
      expiresAt,
      method: tx.payment_method,
      externalTxRef: verifiedExternalRef,
    },
    context: `Abonnement activé jusqu’au ${expiresAt} via ${tx.provider} (Reçu ${receiptNumber}).`,
  });

  const updatedTx = db.prepare('SELECT * FROM payment_transactions WHERE id = ?').get(tx.id);
  return { alreadyPaid: false, transaction: updatedTx, expiresAt, receiptNumber };
}
