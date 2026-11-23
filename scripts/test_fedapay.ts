import 'dotenv/config';
import { db } from '../server/db/database.ts';
import { initiateSubscriptionCheckout, confirmAndVerifyPayment } from '../server/services/paymentService.ts';

async function testFullFlow() {
  console.log('FEDAPAY_SECRET_KEY présent :', Boolean(process.env.FEDAPAY_SECRET_KEY));
  console.log('--- TEST 1: Initiation Checkout FedaPay ---');
  const actor = {
    id: 'user_admin',
    companyId: 'cmp_4dc44a6b-ef6b-4c65-9871-eafa590b244c',
    fullName: 'Hamidou Amdiat',
    jobTitle: 'Directeur',
    email: 'pocketamdiath06@gmail.com',
    role: 'ADMIN' as const,
    permissions: {},
    isSecretariat: false,
    serviceIds: [],
  };

  const plan = db.prepare('SELECT id FROM subscription_plans LIMIT 1').get() as { id: string };

  const checkoutRes = await initiateSubscriptionCheckout({
    companyId: actor.companyId,
    actor,
    planId: plan.id,
    billingCycle: 'MONTHLY',
    paymentMethod: 'MOOV_MONEY',
    countryCode: 'BJ',
    phoneNumber: '64000001',
    appBaseUrl: 'http://localhost:3000',
  });

  console.log('Checkout initialisé avec succès :');
  console.log('- ID Nexora :', checkoutRes.transactionId);
  console.log('- ID FedaPay :', checkoutRes.externalTxRef);
  console.log('- URL Checkout générée :', checkoutRes.checkoutUrl);
  console.log('- Token FedaPay :', checkoutRes.fedaToken ? checkoutRes.fedaToken.slice(0, 30) + '...' : 'AUCUN');
  console.log('- Statut initial :', checkoutRes.status);

  console.log('\n--- TEST 2: Tentative de confirmation sur statut non validé (pending) ---');
  try {
    await confirmAndVerifyPayment({
      companyId: actor.companyId,
      transactionId: checkoutRes.transactionId,
      actor,
    });
    console.error('ERREUR GRAVE : Aurait dû échouer car statut pending !');
  } catch (err) {
    console.log('Succès du contrôle de sécurité (pending rejeté) :', err instanceof Error ? err.message : err);
  }

  console.log('\n--- TEST 3: Tentative de confirmation sur une transaction déclinée (548965) ---');
  try {
    await confirmAndVerifyPayment({
      companyId: actor.companyId,
      transactionId: checkoutRes.transactionId,
      fedaTransactionId: 548965,
      actor,
    });
    console.error('ERREUR GRAVE : Aurait dû échouer car statut declined !');
  } catch (err) {
    console.log('Succès du contrôle de sécurité (declined rejeté) :', err instanceof Error ? err.message : err);
  }
}

testFullFlow()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
