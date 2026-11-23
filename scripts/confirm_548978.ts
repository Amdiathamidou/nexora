import 'dotenv/config';
import { confirmAndVerifyPayment } from '../server/services/paymentService.ts';
import { db } from '../server/db/database.ts';

async function confirmUserTx() {
  const actor = {
    id: 'usr_demo_admin',
    companyId: 'cmp_demo_group',
    fullName: 'Codjo Dossou',
    jobTitle: 'Administrateur',
    email: 'contact@nexorademo.bj',
    role: 'ADMIN' as const,
    permissions: {},
    isSecretariat: false,
    serviceIds: [],
  };

  const res = await confirmAndVerifyPayment({
    companyId: 'cmp_demo_group',
    fedaTransactionId: '548978',
    actor,
  });

  console.log('CONFIRMED SUCCESS:', res);
  const company = db
    .prepare('SELECT id, legal_name, plan_id, status, subscription_expires_at FROM companies WHERE id = ?')
    .get('cmp_demo_group');
  console.log('UPDATED COMPANY:', company);
}

confirmUserTx()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
