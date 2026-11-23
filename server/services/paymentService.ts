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
    ussdHint: 'Paiement sécurisé 3D-Secure par carte bancaire internationale ou GIM-UEMOA',
  },
  {
    code: 'MTN_MOMO',
    label: 'MTN Mobile Money (MoMo Bénin / CI / UEMOA)',
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
  provider: 'FEDAPAY' | 'SANDBOX_UEMOA';
  isLive: boolean;
  publicKey: string;
  sandbox: boolean;
} {
  const secretKey = process.env.FEDAPAY_SECRET_KEY?.trim() || '';
  const publicKey = process.env.FEDAPAY_PUBLIC_KEY?.trim() || '';
  const sandbox = (process.env.FEDAPAY_SANDBOX ?? 'true') !== 'false';

  if (secretKey || publicKey) {
    return {
      provider: 'FEDAPAY',
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

/**
 * Création d'une transaction FedaPay via son API REST v1
 */
async function createFedaPayTransaction(args: {
  amountFcfa: number;
  description: string;
  customer: {
    firstname: string;
    lastname: string;
    email: string;
    phone_number?: { number: string; country: string };
  };
  callbackUrl: string;
}): Promise<{ id: number; token: string; url?: string } | null> {
  const secretKey = process.env.FEDAPAY_SECRET_KEY?.trim();
  if (!secretKey) return null;

  const isSandbox = (process.env.FEDAPAY_SANDBOX ?? 'true') !== 'false';
  const baseUrl = isSandbox ? 'https://sandbox-api.fedapay.com/v1' : 'https://api.fedapay.com/v1';

  try {
    const res = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: args.description,
        amount: args.amountFcfa,
        currency: { iso: 'XOF' },
        callback_url: args.callbackUrl,
        customer: args.customer,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        v1?: { transaction?: { id: number; token?: string } };
        'v1/transaction'?: { id: number; token?: string };
        transaction?: { id: number; token?: string };
      };
      const txObj = data['v1/transaction'] || data.v1?.transaction || data.transaction;
      if (txObj?.id) {
        // Obtenir le token de checkout
        const tokenRes = await fetch(`${baseUrl}/transactions/${txObj.id}/token`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
        });
        const tokenData = (await tokenRes.json()) as { token?: string; url?: string };
        return {
          id: txObj.id,
          token: tokenData.token || '',
          url: tokenData.url || '',
        };
      }
    } else {
      const errText = await res.text();
      console.warn('[FedaPay] Transaction creation error :', res.status, errText);
    }
  } catch (e) {
    console.warn('[FedaPay] Network / API error :', e);
  }
  return null;
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
    appBaseUrl,
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
  const externalTxRef = `FEDA-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const mode = gateway.provider === 'FEDAPAY' ? (gateway.sandbox ? 'FEDAPAY_SANDBOX' : 'FEDAPAY_LIVE') : 'SANDBOX_UEMOA';

  // Tentative création transaction distante FedaPay si les clés sont configurées
  let checkoutUrl = '';
  let fedaToken = '';
  let fedaId: number | null = null;

  if (gateway.provider === 'FEDAPAY') {
    const names = (actor.fullName || company.legal_name || 'Client Nexora').trim().split(' ');
    const fedaRes = await createFedaPayTransaction({
      amountFcfa,
      description: `Abonnement Nexora - Formule ${plan.name} (${billingCycle === 'ANNUAL' ? '1 an' : '1 mois'})`,
      customer: {
        firstname: names[0] || 'Client',
        lastname: names.slice(1).join(' ') || 'Nexora',
        email: company.email || actor.email,
        phone_number: phoneNumber ? { number: phoneNumber.replace(/\s+/g, ''), country: countryCode.toLowerCase() } : undefined,
      },
      callbackUrl: `${appBaseUrl || 'http://localhost:3000'}/settings`,
    });
    if (fedaRes) {
      fedaId = fedaRes.id;
      fedaToken = fedaRes.token;
      checkoutUrl = fedaRes.url || '';
    }
  }

  db.prepare(`
    INSERT INTO payment_transactions (
      id, company_id, plan_id, billing_cycle, amount_fcfa, currency, payment_method, provider,
      country_code, payer_account_mask, external_tx_ref, checkout_url, status, mode, metadata_json, initiated_by
    ) VALUES (?, ?, ?, ?, ?, 'XOF', ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
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
    fedaId ? String(fedaId) : externalTxRef,
    checkoutUrl,
    mode,
    JSON.stringify({
      cardBrand: cardBrand || '',
      cardHolder: cardHolder || '',
      phoneMasked: payerMask,
      fedaId,
      fedaToken,
    }),
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
    context: `Transaction ${externalTxRef} initiée via FedaPay (${payerMask}).`,
  });

  return {
    transactionId: txId,
    externalTxRef: fedaId ? String(fedaId) : externalTxRef,
    amountFcfa,
    currency: 'XOF',
    paymentMethod,
    provider: gateway.provider,
    mode,
    checkoutUrl,
    fedaToken,
    payerMask,
    status: 'PENDING',
    fedapayPublicKey: gateway.publicKey,
    fedapaySandbox: gateway.sandbox,
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
        metadata_json: string;
      }
    | undefined;

  if (!tx) throw new Error('Transaction de paiement introuvable.');
  if (tx.status === 'PAID') {
    return { alreadyPaid: true, transaction: tx };
  }

  let verifiedExternalRef = tx.external_tx_ref;
  const fedaSecretKey = process.env.FEDAPAY_SECRET_KEY?.trim();

  // Vérification de transaction FedaPay
  if (tx.provider === 'FEDAPAY' && fedaSecretKey) {
    const fedaTxId = (otpOrAuthorizationCode || tx.external_tx_ref || '').trim();
    const isSandbox = (process.env.FEDAPAY_SANDBOX ?? 'true') !== 'false';

    // En sandbox, autoriser la confirmation directe ou code de test
    if (isSandbox && (/^\d{4,6}$/.test(fedaTxId) || fedaTxId.toUpperCase().startsWith('TEST') || fedaTxId.toUpperCase() === 'SANDBOX')) {
      verifiedExternalRef = `FEDA-SANDBOX-${fedaTxId}`;
    } else {
      const baseUrl = isSandbox ? 'https://sandbox-api.fedapay.com/v1' : 'https://api.fedapay.com/v1';
      try {
        const verifyRes = await fetch(`${baseUrl}/transactions/${fedaTxId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${fedaSecretKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (verifyRes.ok) {
          const verifyJson = (await verifyRes.json()) as {
            'v1/transaction'?: { status: string; amount: number };
            transaction?: { status: string; amount: number };
          };
          const transactionData = verifyJson['v1/transaction'] || verifyJson.transaction;
          const status = transactionData?.status?.toLowerCase();

          if (status !== 'approved' && status !== 'transferred') {
            if (isSandbox) {
              verifiedExternalRef = `FEDA-SANDBOX-${fedaTxId}`;
            } else {
              throw new Error(`Statut FedaPay non validé : ${status || 'en_attente'}.`);
            }
          } else {
            verifiedExternalRef = `FEDA-${fedaTxId}`;
          }
        } else if (isSandbox) {
          verifiedExternalRef = `FEDA-SANDBOX-${fedaTxId}`;
        } else {
          throw new Error('Impossible de vérifier la transaction auprès de FedaPay.');
        }
      } catch (err) {
        if (isSandbox) {
          verifiedExternalRef = `FEDA-SANDBOX-${fedaTxId}`;
        } else {
          throw err;
        }
      }
    }
  } else {
    // Mode Sandbox UEMOA
    const code = (otpOrAuthorizationCode || '').trim();
    if (!/^\d{4,6}$/.test(code)) {
      throw new Error('Veuillez saisir le code de validation OTP à 4–6 chiffres (ex: 123456).');
    }
    verifiedExternalRef = `UEMOA-SANDBOX-${code}`;
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
