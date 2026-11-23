import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOADS_DIR } from './database.ts';
import type { CircuitStepConfig } from '../types.ts';
import { hashPassword } from '../utils/crypto.ts';

function ensureDemoDocumentFile(filename: string, title: string, sender: string, ref: string, bodyLines: string[]): { path: string; size: number } {
  const demoDir = path.join(UPLOADS_DIR, 'demo');
  if (!fs.existsSync(demoDir)) {
    fs.mkdirSync(demoDir, { recursive: true });
  }
  const fullPath = path.join(demoDir, filename);
  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123" viewBox="0 0 794 1123">
  <rect width="794" height="1123" fill="#ffffff"/>
  <rect x="48" y="48" width="698" height="1027" fill="none" stroke="#e2e8f0" stroke-width="2"/>
  <rect x="48" y="48" width="698" height="104" fill="#0f172a"/>
  <text x="80" y="96" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#ffffff">${escapeXml(sender)}</text>
  <text x="80" y="124" font-family="Arial, sans-serif" font-size="12" fill="#94a3b8">DOCUMENT DE DÉMONSTRATION NEXORA · RÉF. EXTERNE : ${escapeXml(ref)}</text>
  <text x="80" y="200" font-family="Arial, sans-serif" font-size="13" fill="#475569">Cotonou, République du Bénin</text>
  <text x="80" y="248" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#0f172a">Objet : ${escapeXml(title)}</text>
  <line x1="80" y1="268" x2="714" y2="268" stroke="#cbd5e1" stroke-width="1"/>
  ${bodyLines
    .map(
      (line, idx) =>
        `<text x="80" y="${310 + idx * 32}" font-family="Arial, sans-serif" font-size="14" fill="#1e293b">${escapeXml(line)}</text>`
    )
    .join('\n  ')}
  <rect x="500" y="880" width="200" height="86" rx="4" fill="#f8fafc" stroke="#94a3b8" stroke-dasharray="4 4"/>
  <text x="520" y="914" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#334155">CACHET / SIGNATURE</text>
  <text x="520" y="938" font-family="Arial, sans-serif" font-size="12" fill="#0f172a">${escapeXml(sender)}</text>
  <text x="80" y="1040" font-family="Arial, sans-serif" font-size="11" fill="#64748b">Document fictif généré pour l'environnement de démonstration NEXORA DEMO GROUP (Cotonou, Bénin).</text>
</svg>`;
  fs.writeFileSync(fullPath, svgContent, 'utf8');
  return { path: fullPath, size: Buffer.byteLength(svgContent, 'utf8') };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function seedDefaultPlans(): void {
  const count = (db.prepare('SELECT COUNT(*) as c FROM subscription_plans').get() as { c: number }).c;
  if (count > 0) return;

  const insertPlan = db.prepare(`
    INSERT INTO subscription_plans (id, name, audience, price_monthly_fcfa, max_users, max_storage_mb, max_mails_month, ai_enabled, features_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertPlan.run(
    'plan_essentiel',
    'Essentiel',
    'Pour PME et cabinets structurés',
    45000,
    15,
    5120,
    500,
    1,
    JSON.stringify([
      'Jusqu’à 15 utilisateurs et 5 services',
      '500 courriers / mois avec numérotation automatique',
      'OCR & extraction IA Gemini (100 documents / mois)',
      'Circuits séquentiels & retour Secrétariat obligatoire',
      'Notifications in-app et alertes e-mail départementales',
    ])
  );

  insertPlan.run(
    'plan_institutionnel',
    'Institutionnel',
    'Pour entreprises multi-services & ETI',
    125000,
    75,
    51200,
    5000,
    1,
    JSON.stringify([
      'Jusqu’à 75 utilisateurs et services illimités',
      '5 000 courriers / mois & archivage 10 ans',
      'OCR & analyse IA illimitée avec détection des doublons',
      'Circuits séquentiels, parallèles et validation Président',
      'Rapports avancés, export CSV/PDF & journal d’audit complet',
    ])
  );

  insertPlan.run(
    'plan_souverain',
    'Souverain',
    'Pour administrations, ministères & groupes',
    320000,
    500,
    256000,
    50000,
    1,
    JSON.stringify([
      'Utilisateurs étendus (jusqu’à 500) & multi-directions',
      'Volume courrier haute capacité & stockage dédié',
      'OCR multipage, résumés exécutifs & API d’intégration',
      'Prêt pour prestataire de signature électronique certifiée',
      'Support prioritaire & SLA garanti 99,9 %',
    ])
  );
}

export function createDefaultServicesAndCircuits(
  companyId: string,
  adminUserId: string,
  adminJobTitle?: string
): { secretariatServiceId: string } {
  const serviceName = adminJobTitle && adminJobTitle.trim() ? adminJobTitle.trim() : 'Direction / Administration';
  const secId = `svc_sec_${companyId}`;

  const insSvc = db.prepare(`
    INSERT INTO services (id, company_id, name, description, manager_user_id, is_secretariat, reception_rules)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Crée UNIQUEMENT le service / département initial de l'administrateur
  insSvc.run(
    secId,
    companyId,
    serviceName,
    `Service initial rattaché au poste : ${serviceName}`,
    adminUserId,
    1,
    'Point d’entrée principal pour la gestion et le traitement des courriers.'
  );

  db.prepare('INSERT OR IGNORE INTO user_services (user_id, service_id, company_id) VALUES (?, ?, ?)').run(
    adminUserId,
    secId,
    companyId
  );

  const stepsIn: CircuitStepConfig[] = [
    { stepOrder: 1, name: 'Réception & enregistrement', stepType: 'SECRETARIAT_RECEPTION', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: secId, slaHours: 4 },
    { stepOrder: 2, name: 'Orientation & traitement', stepType: 'ORIENTATION', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: secId, slaHours: 8 },
    { stepOrder: 3, name: 'Validation / Signature', stepType: 'RESPONSABLE_REVIEW', mode: 'SEQUENTIAL', targetRole: 'RESPONSABLE', slaHours: 24 },
    { stepOrder: 4, name: 'Expédition / Classement et Archivage', stepType: 'SECRETARIAT_DISPATCH_ARCHIVE', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: secId, slaHours: 12 },
  ];

  const cId = `cir_std_${companyId}`;
  const vId = `cv_std_${companyId}_1`;
  db.prepare(`
    INSERT INTO circuits (id, company_id, name, description, category, mail_direction, current_version, is_active)
    VALUES (?, ?, ?, ?, ?, 'ENTRANT', 1, 1)
  `).run(cId, companyId, 'Circuit standard initial', 'Circuit rattaché au service initial de l’entreprise.', 'Administration générale');
  db.prepare(`
    INSERT INTO circuit_versions (id, circuit_id, company_id, version_number, steps_json)
    VALUES (?, ?, ?, 1, ?)
  `).run(vId, cId, companyId, JSON.stringify(stepsIn));

  return { secretariatServiceId: secId };
}

function buildDemoStampDataUrl(orgName: string, title: string, city: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
  <circle cx="110" cy="110" r="98" fill="none" stroke="#1e3a8a" stroke-width="5"/>
  <circle cx="110" cy="110" r="88" fill="none" stroke="#1e3a8a" stroke-width="1.5" stroke-dasharray="4 3"/>
  <circle cx="110" cy="110" r="56" fill="none" stroke="#1e3a8a" stroke-width="2"/>
  <text x="110" y="54" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#1e3a8a">${escapeXml(orgName.slice(0, 24))}</text>
  <text x="110" y="106" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#1e3a8a">${escapeXml(title.slice(0, 22))}</text>
  <text x="110" y="124" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#1e3a8a">VISA OFFICIEL</text>
  <text x="110" y="176" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#1e3a8a">${escapeXml(city.toUpperCase())}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildDemoSignatureDataUrl(name: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="90" viewBox="0 0 280 90">
  <path d="M22 58 C 36 18, 56 18, 52 56 C 48 76, 68 32, 86 42 C 96 48, 92 64, 108 52 C 124 38, 132 22, 146 56 C 152 66, 168 38, 184 48 C 198 56, 214 34, 244 46" fill="none" stroke="#0f172a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M28 70 Q 130 62 248 68" fill="none" stroke="#1e3a8a" stroke-width="1.6" stroke-linecap="round"/>
  <text x="28" y="84" font-family="Arial, sans-serif" font-size="10" fill="#475569">${escapeXml(name)}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function seedDemoEnvironment(): void {
  seedDefaultPlans();

  // Ensure Super Admin exists
  const superAdminExists = db.prepare("SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1").get();
  if (!superAdminExists) {
    db.prepare(`
      INSERT INTO users (id, company_id, full_name, job_title, email, phone, password_hash, role, is_active, permissions_json)
      VALUES (?, NULL, ?, ?, ?, ?, ?, 'SUPER_ADMIN', 1, '{}')
    `).run(
      'usr_superadmin',
      'Koffi Mensah (Super Admin NEXORA)',
      'Directeur Plateforme NEXORA',
      'superadmin@nexora.bj',
      '+229 01 97 00 00 01',
      hashPassword('Nexora2026!'),
    );
  }

  // Check if NEXORA DEMO GROUP already seeded
  const demoCompany = db.prepare("SELECT id, stamp_image FROM companies WHERE id = 'cmp_demo_group'").get() as
    | { id: string; stamp_image?: string }
    | undefined;
  if (demoCompany) {
    const demoStamp = buildDemoStampDataUrl('NEXORA DEMO GROUP', 'PRÉSIDENT DG', 'Cotonou - Bénin');
    const demoSig = buildDemoSignatureDataUrl('Sébastien Houngbédji');
    if (!demoCompany.stamp_image) {
      db.prepare("UPDATE companies SET stamp_image = ? WHERE id = 'cmp_demo_group'").run(demoStamp);
    }
    db.prepare(
      "UPDATE users SET signature_image = CASE WHEN COALESCE(signature_image, '') = '' THEN ? ELSE signature_image END, stamp_image = CASE WHEN COALESCE(stamp_image, '') = '' THEN ? ELSE stamp_image END WHERE id = 'usr_demo_president'"
    ).run(demoSig, demoStamp);
    const sigExists = db.prepare("SELECT id FROM mail_signatures WHERE mail_id = 'mail_demo_4' LIMIT 1").get();
    if (!sigExists) {
      db.prepare(`
        INSERT INTO mail_signatures (id, mail_id, company_id, signer_user_id, signer_name, signer_role, signer_title, signature_image, stamp_image, signature_hash)
        VALUES ('msig_demo_4', 'mail_demo_4', 'cmp_demo_group', 'usr_demo_president', 'Sébastien Houngbédji', 'PRESIDENT', 'Président Directeur Général', ?, ?, 'sha256:demo-arr-2026-0004-verified')
      `).run(demoSig, demoStamp);
    }
    return;
  }

  const companyId = 'cmp_demo_group';
  const trialEnds = new Date(Date.now() + 11 * 86400000).toISOString().slice(0, 10);

  db.prepare(`
    INSERT INTO companies (
      id, legal_name, trade_name, sector, legal_form, country, city, address, phone, email, website, tax_id,
      ref_prefix_in, ref_prefix_out, ref_prefix_int, plan_id, status, trial_ends_at, is_demo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ARR', 'DEP', 'INT', 'plan_institutionnel', 'trial', ?, 1)
  `).run(
    companyId,
    'NEXORA DEMO GROUP SA',
    'NEXORA DEMO GROUP',
    'Services institutionnels & Ingénierie administrative',
    'Société Anonyme (SA)',
    'Bénin',
    'Cotonou',
    'Boulevard de la Marina, Immeuble Les Palmiers, Haie Vive, Cotonou',
    '+229 01 21 31 45 00',
    'contact@nexorademo.bj',
    'https://nexorademo.bj',
    'IFU 3202418904512',
    trialEnds
  );

  const pwHash = hashPassword('Demo2026!');
  const insUser = db.prepare(`
    INSERT INTO users (id, company_id, full_name, job_title, email, phone, password_hash, role, is_active, avatar_url, permissions_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  insUser.run(
    'usr_demo_admin', companyId, 'Codjo Dossou', 'Administrateur Système', 'admin@nexorademo.bj', '+229 01 96 11 22 01', pwHash, 'ADMIN', '',
    JSON.stringify({ can_manage_users: true, can_manage_circuits: true, can_view_all_services: true, can_view_confidential: true, can_export_reports: true })
  );
  insUser.run(
    'usr_demo_president', companyId, 'Sébastien Houngbédji', 'Président Directeur Général', 'president@nexorademo.bj', '+229 01 96 11 22 02', pwHash, 'PRESIDENT',
    '/src/assets/images/avatar_president_demo_1795369286356.jpg',
    JSON.stringify({ can_view_confidential: true, can_view_all_services: true, can_export_reports: true })
  );
  insUser.run(
    'usr_demo_resp_fin', companyId, 'Aminata Zinsou', 'Directrice Financière', 'finances@nexorademo.bj', '+229 01 96 11 22 03', pwHash, 'RESPONSABLE', '',
    JSON.stringify({ can_export_reports: true, can_view_confidential: true })
  );
  insUser.run(
    'usr_demo_resp_jur', companyId, 'Me Brice Agbessi', 'Chef du Service Juridique', 'juridique@nexorademo.bj', '+229 01 96 11 22 04', pwHash, 'RESPONSABLE', '',
    JSON.stringify({ can_view_confidential: true })
  );
  insUser.run(
    'usr_demo_resp_rh', companyId, 'Clarisse Tossou', 'Directrice des Ressources Humaines', 'rh@nexorademo.bj', '+229 01 96 11 22 05', pwHash, 'RESPONSABLE', '',
    JSON.stringify({})
  );
  insUser.run(
    'usr_demo_agent_sec', companyId, 'Nadine Kpadonou', 'Attachée de Direction — Secrétariat Central', 'secretariat@nexorademo.bj', '+229 01 96 11 22 06', pwHash, 'AGENT', '',
    JSON.stringify({
      secretariat_receive: true,
      secretariat_register: true,
      secretariat_ai_analyze: true,
      secretariat_orient: true,
      secretariat_final_control: true,
      secretariat_dispatch: true,
      secretariat_archive: true,
      can_view_all_services: true,
    })
  );
  insUser.run(
    'usr_demo_agent_fin', companyId, 'Romuald Boko', 'Agent Comptable & Contrôle', 'agent.finances@nexorademo.bj', '+229 01 96 11 22 07', pwHash, 'AGENT', '',
    JSON.stringify({})
  );
  insUser.run(
    'usr_demo_agent_jur', companyId, 'Prisca Adandé', 'Juriste Chargée des Conventions', 'agent.juridique@nexorademo.bj', '+229 01 96 11 22 08', pwHash, 'AGENT', '',
    JSON.stringify({})
  );

  // 7 Services required by cahier des charges
  const insSvc = db.prepare(`
    INSERT INTO services (id, company_id, name, description, manager_user_id, is_secretariat, reception_rules)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insSvc.run('svc_demo_pres', companyId, 'Présidence', 'Cabinet du Président et décisions stratégiques.', 'usr_demo_president', 0, 'Uniquement sur circuit avec validation présidentielle ou urgence stratégique.');
  insSvc.run('svc_demo_dg', companyId, 'Direction générale', 'Pilotage exécutif et coordination inter-services.', 'usr_demo_admin', 0, 'Dossiers stratégiques et notes de direction.');
  insSvc.run('svc_demo_sec', companyId, 'Secrétariat', 'Point d’entrée et de retour final obligatoire de tout courrier.', 'usr_demo_resp_rh', 1, 'Réception, numérisation IA, orientation, contrôle final, expédition et archivage.');
  insSvc.run('svc_demo_rh', companyId, 'Ressources humaines', 'Recrutement, carrières, formations et dialogue social.', 'usr_demo_resp_rh', 0, 'Demandes de stage, recrutement et notes RH.');
  insSvc.run('svc_demo_fin', companyId, 'Direction financière', 'Factures, budgets, marchés et paiements.', 'usr_demo_resp_fin', 0, 'Factures, appels de fonds et justificatifs comptables.');
  insSvc.run('svc_demo_jur', companyId, 'Service juridique', 'Conventions, contentieux, conformité réglementaire.', 'usr_demo_resp_jur', 0, 'Contrats, partenariats, mises en demeure et actes officiels.');
  insSvc.run('svc_demo_com', companyId, 'Communication', 'Relations publiques, invitations et presse.', 'usr_demo_resp_rh', 0, 'Invitations officielles et partenariats événementiels.');

  const insUs = db.prepare('INSERT INTO user_services (user_id, service_id, company_id) VALUES (?, ?, ?)');
  insUs.run('usr_demo_admin', 'svc_demo_dg', companyId);
  insUs.run('usr_demo_president', 'svc_demo_pres', companyId);
  insUs.run('usr_demo_resp_fin', 'svc_demo_fin', companyId);
  insUs.run('usr_demo_resp_jur', 'svc_demo_jur', companyId);
  insUs.run('usr_demo_resp_rh', 'svc_demo_rh', companyId);
  insUs.run('usr_demo_resp_rh', 'svc_demo_sec', companyId);
  insUs.run('usr_demo_agent_sec', 'svc_demo_sec', companyId);
  insUs.run('usr_demo_agent_fin', 'svc_demo_fin', companyId);
  insUs.run('usr_demo_agent_jur', 'svc_demo_jur', companyId);

  // 7 Circuits required by cahier des charges
  const insCir = db.prepare(`
    INSERT INTO circuits (id, company_id, name, description, category, mail_direction, current_version, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1)
  `);
  const insVer = db.prepare(`
    INSERT INTO circuit_versions (id, circuit_id, company_id, version_number, steps_json)
    VALUES (?, ?, ?, 1, ?)
  `);

  const c1Steps: CircuitStepConfig[] = [
    { stepOrder: 1, name: 'Secrétariat : réception & enregistrement', stepType: 'SECRETARIAT_RECEPTION', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: 'svc_demo_sec', slaHours: 4 },
    { stepOrder: 2, name: 'Orientation vers service', stepType: 'ORIENTATION', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: 'svc_demo_sec', slaHours: 8 },
    { stepOrder: 3, name: 'Affectation par le Responsable', stepType: 'RESPONSABLE_ASSIGN', mode: 'SEQUENTIAL', targetRole: 'RESPONSABLE', slaHours: 12 },
    { stepOrder: 4, name: 'Traitement opérationnel Agent', stepType: 'AGENT_TREATMENT', mode: 'SEQUENTIAL', targetRole: 'AGENT', slaHours: 48 },
    { stepOrder: 5, name: 'Contrôle du Responsable', stepType: 'RESPONSABLE_REVIEW', mode: 'SEQUENTIAL', targetRole: 'RESPONSABLE', slaHours: 24 },
    { stepOrder: 6, name: 'Retour obligatoire au Secrétariat', stepType: 'SECRETARIAT_RETURN', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: 'svc_demo_sec', slaHours: 12 },
    { stepOrder: 7, name: 'Classement & Archivage final', stepType: 'SECRETARIAT_DISPATCH_ARCHIVE', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: 'svc_demo_sec', slaHours: 12 },
  ];
  insCir.run('cir_demo_simple', companyId, 'Courrier entrant simple (sans Président)', 'Traitement direct par le service compétent et retour Secrétariat.', 'Administration générale', 'ENTRANT');
  insVer.run('cv_demo_simple_1', 'cir_demo_simple', companyId, JSON.stringify(c1Steps));

  const c2Steps: CircuitStepConfig[] = [
    { stepOrder: 1, name: 'Secrétariat : réception & numérisation IA', stepType: 'SECRETARIAT_RECEPTION', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: 'svc_demo_sec', slaHours: 4 },
    { stepOrder: 2, name: 'Orientation stratégique', stepType: 'ORIENTATION', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: 'svc_demo_sec', slaHours: 6 },
    { stepOrder: 3, name: 'Analyse & affectation Responsable', stepType: 'RESPONSABLE_ASSIGN', mode: 'SEQUENTIAL', targetRole: 'RESPONSABLE', slaHours: 12 },
    { stepOrder: 4, name: 'Instruction par l’Agent', stepType: 'AGENT_TREATMENT', mode: 'SEQUENTIAL', targetRole: 'AGENT', slaHours: 48 },
    { stepOrder: 5, name: 'Contrôle du Responsable', stepType: 'RESPONSABLE_REVIEW', mode: 'SEQUENTIAL', targetRole: 'RESPONSABLE', slaHours: 24 },
    { stepOrder: 6, name: 'Validation & signature du Président', stepType: 'PRESIDENT_VALIDATION', mode: 'SEQUENTIAL', targetRole: 'PRESIDENT', targetServiceId: 'svc_demo_pres', requiresPresident: true, slaHours: 24 },
    { stepOrder: 7, name: 'Retour obligatoire au Secrétariat — Contrôle final', stepType: 'SECRETARIAT_RETURN', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: 'svc_demo_sec', slaHours: 8 },
    { stepOrder: 8, name: 'Expédition & Archivage', stepType: 'SECRETARIAT_DISPATCH_ARCHIVE', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: 'svc_demo_sec', slaHours: 12 },
  ];
  insCir.run('cir_demo_pres', companyId, 'Courrier entrant avec validation présidentielle', 'Requiert décision et visa du Président avant retour Secrétariat.', 'Partenariat & Institutionnel', 'ENTRANT');
  insVer.run('cv_demo_pres_1', 'cir_demo_pres', companyId, JSON.stringify(c2Steps));

  insCir.run('cir_demo_nopres', companyId, 'Courrier entrant sans validation présidentielle', 'Circuit financier ou RH géré intégralement par le Responsable de service.', 'Factures & Finances', 'ENTRANT');
  insVer.run('cv_demo_nopres_1', 'cir_demo_nopres', companyId, JSON.stringify(c1Steps));

  insCir.run('cir_demo_rep', companyId, 'Courrier entrant nécessitant une réponse officielle', 'Inclut rédaction de projet de réponse, visa hiérarchique et preuve d’expédition.', 'Réclamation / Demande officielle', 'ENTRANT');
  insVer.run('cv_demo_rep_1', 'cir_demo_rep', companyId, JSON.stringify(c2Steps));

  const c5Steps: CircuitStepConfig[] = [
    { stepOrder: 1, name: 'Rédaction du courrier sortant', stepType: 'AGENT_TREATMENT', mode: 'SEQUENTIAL', targetRole: 'AGENT', slaHours: 24 },
    { stepOrder: 2, name: 'Contrôle du Responsable', stepType: 'RESPONSABLE_REVIEW', mode: 'SEQUENTIAL', targetRole: 'RESPONSABLE', slaHours: 12 },
    { stepOrder: 3, name: 'Validation / Signature Président', stepType: 'PRESIDENT_VALIDATION', mode: 'SEQUENTIAL', targetRole: 'PRESIDENT', targetServiceId: 'svc_demo_pres', requiresPresident: true, slaHours: 24 },
    { stepOrder: 4, name: 'Transmission au Secrétariat — Contrôle final', stepType: 'SECRETARIAT_RETURN', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: 'svc_demo_sec', slaHours: 8 },
    { stepOrder: 5, name: 'Expédition, Preuve d’envoi & Archivage', stepType: 'SECRETARIAT_DISPATCH_ARCHIVE', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: 'svc_demo_sec', slaHours: 12 },
  ];
  insCir.run('cir_demo_out', companyId, 'Courrier sortant officiel', 'Création, validation hiérarchique, signature et expédition par le Secrétariat.', 'Correspondance sortante', 'SORTANT');
  insVer.run('cv_demo_out_1', 'cir_demo_out', companyId, JSON.stringify(c5Steps));

  const c6Steps: CircuitStepConfig[] = [
    { stepOrder: 1, name: 'Émission de la note interne', stepType: 'AGENT_TREATMENT', mode: 'SEQUENTIAL', targetRole: 'AGENT', slaHours: 8 },
    { stepOrder: 2, name: 'Traitement par le service destinataire', stepType: 'RESPONSABLE_REVIEW', mode: 'SEQUENTIAL', targetRole: 'RESPONSABLE', slaHours: 24 },
    { stepOrder: 3, name: 'Clôture & Archivage interne', stepType: 'SECRETARIAT_DISPATCH_ARCHIVE', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: 'svc_demo_sec', slaHours: 12 },
  ];
  insCir.run('cir_demo_int', companyId, 'Note et courrier interne', 'Circulation fluide entre services de NEXORA DEMO GROUP.', 'Note interne', 'INTERNE');
  insVer.run('cv_demo_int_1', 'cir_demo_int', companyId, JSON.stringify(c6Steps));

  const c7Steps: CircuitStepConfig[] = [
    { stepOrder: 1, name: 'Secrétariat : réception & enregistrement', stepType: 'SECRETARIAT_RECEPTION', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: 'svc_demo_sec', slaHours: 4 },
    {
      stepOrder: 2,
      name: 'Avis parallèle Finance & Juridique (2 validations requises)',
      stepType: 'PARALLEL_REVIEW',
      mode: 'PARALLEL',
      parallelRule: 'MIN_COUNT',
      minApprovals: 2,
      assignedUserIds: ['usr_demo_resp_fin', 'usr_demo_resp_jur'],
      slaHours: 48,
    },
    { stepOrder: 3, name: 'Arbitrage du Président', stepType: 'PRESIDENT_VALIDATION', mode: 'SEQUENTIAL', targetRole: 'PRESIDENT', targetServiceId: 'svc_demo_pres', requiresPresident: true, slaHours: 24 },
    { stepOrder: 4, name: 'Retour obligatoire au Secrétariat', stepType: 'SECRETARIAT_RETURN', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: 'svc_demo_sec', slaHours: 12 },
    { stepOrder: 5, name: 'Expédition & Archivage final', stepType: 'SECRETARIAT_DISPATCH_ARCHIVE', mode: 'SEQUENTIAL', targetRole: 'AGENT', targetServiceId: 'svc_demo_sec', slaHours: 12 },
  ];
  insCir.run('cir_demo_parallel', companyId, 'Circuit avec validations parallèles', 'Sollicite simultanément Finances et Juridique avant décision du Président.', 'Convention / Marché', 'ENTRANT');
  insVer.run('cv_demo_parallel_1', 'cir_demo_parallel', companyId, JSON.stringify(c7Steps));

  // Create realistic demo files on disk
  const doc1 = ensureDemoDocumentFile(
    'demo_partenariat_port_cotonou.svg',
    'Demande de partenariat logistique et dématérialisation',
    'Port Autonome de Cotonou',
    'PAC/DG/2026/0841',
    [
      'Monsieur le Président Directeur Général,',
      'Dans le cadre de la modernisation des échanges documentaires de la zone portuaire,',
      'le Port Autonome de Cotonou souhaite établir une convention de partenariat technique',
      'avec NEXORA DEMO GROUP pour l’interopérabilité des bordereaux administratifs.',
      'Nous vous prions de bien vouloir nous faire parvenir votre avis de principe avant le',
      '30 novembre 2026 afin de programmer la réunion de cadrage juridique.',
    ]
  );

  const doc2 = ensureDemoDocumentFile(
    'demo_facture_sbee.svg',
    'Facture trimestrielle énergie & maintenance réseau N° F-2026-4412',
    'SBEE Bénin — Direction Grands Comptes',
    'SBEE-GC-2026-4412',
    [
      'Facture adressée à : NEXORA DEMO GROUP SA, Boulevard de la Marina, Cotonou.',
      'Montant TTC exigible : 1 485 000 FCFA.',
      'Période facturée : Août – Octobre 2026.',
      'Date limite de règlement : 25 novembre 2026.',
      'Merci de transmettre l’attestation de virement au service recouvrement.',
    ]
  );

  const doc3 = ensureDemoDocumentFile(
    'demo_invitation_ccib.svg',
    'Invitation officielle — Forum Économique du Bénin 2026',
    'Chambre de Commerce et d’Industrie du Bénin (CCIB)',
    'CCIB/SG/2026/119',
    [
      'La CCIB a l’honneur d’inviter Monsieur le Président de NEXORA DEMO GROUP',
      'à la plénière d’ouverture du Forum Économique de Cotonou le 04 décembre 2026',
      'au Palais des Congrès de Cotonou à 09h00.',
      'Confirmation souhaitée sous 72 heures auprès du protocole.',
    ]
  );

  const doc4 = ensureDemoDocumentFile(
    'demo_reclamation_atlantique.svg',
    'Réclamation relative au délai de livraison dossier n° 2026-098',
    'Société Atlantique BTP SARL',
    'ABTP/2026/307',
    [
      'Objet : Réclamation officielle concernant le retard de validation du dossier 2026-098.',
      'Nous sollicitons une réponse écrite détaillée ainsi que le calendrier de clôture',
      'sous cinq jours ouvrés.',
    ]
  );

  // Seed realistic mails across statuses
  const insMail = db.prepare(`
    INSERT INTO mails (
      id, company_id, reference, direction, category, subject, description,
      sender_name, sender_org, recipient_name, recipient_org, external_ref,
      mail_date, received_at, due_date, priority, is_confidential, is_demo, requires_response,
      current_service_id, assigned_agent_id, circuit_id, circuit_version_id,
      mail_status, workflow_status, shipping_status, archive_status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const inThreeDays = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const overdueDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // 1. Mail awaiting President validation
  insMail.run(
    'mail_demo_1', companyId, 'ARR-2026-0001', 'ENTRANT', 'Demande de partenariat',
    'Convention de partenariat logistique et échanges numériques',
    'Proposition de partenariat stratégique transmise par le Port Autonome de Cotonou nécessitant validation présidentielle.',
    'M. Théophile Gbégnon', 'Port Autonome de Cotonou', 'Sébastien Houngbédji', 'NEXORA DEMO GROUP', 'PAC/DG/2026/0841',
    twoDaysAgo, `${twoDaysAgo} 09:15:00`, inThreeDays, 'HAUTE', 1, 1,
    'svc_demo_pres', 'usr_demo_agent_jur', 'cir_demo_pres', 'cv_demo_pres_1',
    'EN_CIRCUIT', 'EN_COURS', 'NON_APPLICABLE', 'NON_ARCHIVE', 'usr_demo_agent_sec'
  );

  // 2. Mail with Agent (Finance) — overdue to demonstrate delay tracking + Dept head email!
  insMail.run(
    'mail_demo_2', companyId, 'ARR-2026-0002', 'ENTRANT', 'Facture',
    'Facture trimestrielle énergie & maintenance réseau N° F-2026-4412',
    'Règlement facture SBEE d’un montant de 1 485 000 FCFA à contrôler et imputer.',
    'Service Grands Comptes', 'SBEE Bénin', 'Direction Financière', 'NEXORA DEMO GROUP', 'SBEE-GC-2026-4412',
    twoDaysAgo, `${twoDaysAgo} 10:40:00`, overdueDate, 'URGENTE', 0, 0,
    'svc_demo_fin', 'usr_demo_agent_fin', 'cir_demo_nopres', 'cv_demo_nopres_1',
    'EN_CIRCUIT', 'EN_COURS', 'NON_APPLICABLE', 'NON_ARCHIVE', 'usr_demo_agent_sec'
  );

  // 3. Mail received today at Secrétariat awaiting orientation
  insMail.run(
    'mail_demo_3', companyId, 'ARR-2026-0003', 'ENTRANT', 'Invitation officielle',
    'Invitation plénière Forum Économique du Bénin 2026',
    'Invitation de la CCIB au Palais des Congrès de Cotonou le 04 décembre 2026.',
    'Secrétariat Général CCIB', 'Chambre de Commerce et d’Industrie du Bénin', 'Sébastien Houngbédji', 'NEXORA DEMO GROUP', 'CCIB/SG/2026/119',
    today, `${today} 08:30:00`, inThreeDays, 'NORMALE', 0, 1,
    'svc_demo_sec', null, null, null,
    'ENREGISTRE', 'NON_DEMARRE', 'NON_APPLICABLE', 'NON_ARCHIVE', 'usr_demo_agent_sec'
  );

  // 4. Mail returned to Secrétariat for final control & dispatch
  insMail.run(
    'mail_demo_4', companyId, 'ARR-2026-0004', 'ENTRANT', 'Réclamation',
    'Réclamation délai dossier n° 2026-098 — Atlantique BTP',
    'Réponse préparée par le Juridique et validée par la Direction. Retournée au Secrétariat pour expédition.',
    'Direction Atlantique BTP', 'Société Atlantique BTP SARL', 'Service Juridique', 'NEXORA DEMO GROUP', 'ABTP/2026/307',
    twoDaysAgo, `${twoDaysAgo} 14:10:00`, inThreeDays, 'HAUTE', 0, 1,
    'svc_demo_sec', 'usr_demo_agent_jur', 'cir_demo_rep', 'cv_demo_rep_1',
    'RETOUR_SECRETARIAT', 'EN_COURS', 'A_EXPEDIER', 'NON_ARCHIVE', 'usr_demo_agent_sec'
  );

  // 5. Parallel workflow mail
  insMail.run(
    'mail_demo_5', companyId, 'ARR-2026-0005', 'ENTRANT', 'Lettre administrative',
    'Demande d’avis conjoint sur l’accord-cadre UEMOA Numérique',
    'Dossier soumis simultanément à la Direction financière et au Service juridique (validations parallèles).',
    'Commission Technique UEMOA', 'Représentation UEMOA Cotonou', 'Direction Générale', 'NEXORA DEMO GROUP', 'UEMOA-BJ-2026-52',
    yesterday, `${yesterday} 11:00:00`, inThreeDays, 'HAUTE', 1, 1,
    'svc_demo_jur', null, 'cir_demo_parallel', 'cv_demo_parallel_1',
    'EN_CIRCUIT', 'EN_COURS', 'NON_APPLICABLE', 'NON_ARCHIVE', 'usr_demo_agent_sec'
  );

  // 6. Outgoing mail
  insMail.run(
    'mail_demo_6', companyId, 'DEP-2026-0001', 'SORTANT', 'Courrier de réponse',
    'Notification d’attribution de marché d’archivage physique',
    'Courrier officiel sortant à destination du prestataire retenu après validation présidentielle.',
    'Sébastien Houngbédji', 'NEXORA DEMO GROUP', 'Direction Générale ArchivePro', 'ArchivePro Bénin', '',
    yesterday, `${yesterday} 15:20:00`, inThreeDays, 'NORMALE', 0, 0,
    'svc_demo_sec', 'usr_demo_agent_sec', 'cir_demo_out', 'cv_demo_out_1',
    'RETOUR_SECRETARIAT', 'EN_COURS', 'A_EXPEDIER', 'NON_ARCHIVE', 'usr_demo_resp_jur'
  );

  // 7. Internal mail
  insMail.run(
    'mail_demo_7', companyId, 'INT-2026-0001', 'INTERNE', 'Note interne',
    'Note de service : calendrier d’inventaire administratif T4 2026',
    'Note interne transmise par la Direction générale à la Direction financière et aux Ressources humaines.',
    'Codjo Dossou', 'Direction générale', 'Aminata Zinsou', 'Direction financière', '',
    today, `${today} 09:05:00`, inThreeDays, 'NORMALE', 0, 0,
    'svc_demo_fin', 'usr_demo_agent_fin', 'cir_demo_int', 'cv_demo_int_1',
    'EN_CIRCUIT', 'EN_COURS', 'NON_APPLICABLE', 'NON_ARCHIVE', 'usr_demo_admin'
  );

  // 8. Archived mail
  insMail.run(
    'mail_demo_8', companyId, 'ARR-2026-0000', 'ENTRANT', 'Demande d’information',
    'Demande d’attestation de bonne exécution — Ministère du Numérique',
    'Dossier traité, contrôlé par le Secrétariat, réponse expédiée par coursier et archivé.',
    'Direction des Systèmes', 'Ministère du Numérique et de la Digitalisation', 'Secrétariat Central', 'NEXORA DEMO GROUP', 'MND/DSI/2026/014',
    twoDaysAgo, `${twoDaysAgo} 08:00:00`, twoDaysAgo, 'BASSE', 0, 1,
    'svc_demo_sec', 'usr_demo_agent_jur', 'cir_demo_simple', 'cv_demo_simple_1',
    'ARCHIVE', 'TERMINE', 'EXPEDIE', 'ARCHIVE', 'usr_demo_agent_sec'
  );

  // Attach demo documents
  const insDoc = db.prepare(`
    INSERT INTO mail_documents (id, mail_id, company_id, doc_kind, filename, mime_type, size_bytes, storage_path, version, uploaded_by)
    VALUES (?, ?, ?, 'ORIGINAL', ?, 'image/svg+xml', ?, ?, 1, 'usr_demo_agent_sec')
  `);
  insDoc.run('doc_demo_1', 'mail_demo_1', companyId, 'partenariat_port_cotonou.svg', doc1.size, doc1.path);
  insDoc.run('doc_demo_2', 'mail_demo_2', companyId, 'facture_sbee_4412.svg', doc2.size, doc2.path);
  insDoc.run('doc_demo_3', 'mail_demo_3', companyId, 'invitation_ccib_2026.svg', doc3.size, doc3.path);
  insDoc.run('doc_demo_4', 'mail_demo_4', companyId, 'reclamation_atlantique_btp.svg', doc4.size, doc4.path);

  // Simulated AI analyses (clearly marked is_simulated = 1 per cahier des charges §18!)
  const insAi = db.prepare(`
    INSERT INTO ai_analyses (
      id, mail_id, document_id, company_id, status, is_simulated, ocr_text, extracted_json,
      short_summary, detailed_summary, suggested_category, suggested_priority, suggested_service_id,
      suggested_circuit_id, uncertain_fields_json, validated_by, validated_at, analyzed_by
    ) VALUES (?, ?, ?, ?, 'SIMULATED_DEMO', 1, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'usr_demo_agent_sec', datetime('now'), 'usr_demo_agent_sec')
  `);
  insAi.run(
    'ai_demo_1', 'mail_demo_1', 'doc_demo_1', companyId,
    'PORT AUTONOME DE COTONOU - Réf PAC/DG/2026/0841. Demande de convention de partenariat technique pour l’interopérabilité des bordereaux administratifs. Avis souhaité avant le 30 novembre 2026.',
    JSON.stringify({
      senderName: 'M. Théophile Gbégnon',
      senderOrg: 'Port Autonome de Cotonou',
      externalRef: 'PAC/DG/2026/0841',
      deadlineMentioned: '2026-11-30',
      requestedAction: 'Émettre un avis de principe et planifier la réunion juridique',
    }),
    '[Analyse de démonstration simulée] Le Port Autonome de Cotonou propose une convention de partenariat technique pour l’interopérabilité documentaire et sollicite un avis de principe avant le 30 novembre 2026.',
    'Contexte : Modernisation portuaire à Cotonou.\nObjet : Convention de partenariat technique.\nDemande : Validation stratégique et réunion de cadrage juridique.\nDélai mentionné : 30 novembre 2026.',
    'Demande de partenariat', 'HAUTE', 'svc_demo_jur', 'cir_demo_pres'
  );
  insAi.run(
    'ai_demo_2', 'mail_demo_2', 'doc_demo_2', companyId,
    'SBEE BÉNIN - Facture N° SBEE-GC-2026-4412. Montant TTC : 1 485 000 FCFA. Échéance de règlement : 25 novembre 2026.',
    JSON.stringify({
      senderName: 'Service Grands Comptes',
      senderOrg: 'SBEE Bénin',
      externalRef: 'SBEE-GC-2026-4412',
      deadlineMentioned: '2026-11-25',
      requestedAction: 'Vérifier l’imputation budgétaire et procéder au règlement',
    }),
    '[Analyse de démonstration simulée] Facture trimestrielle SBEE d’un montant de 1 485 000 FCFA pour la période Août–Octobre 2026, payable avant le 25 novembre 2026.',
    'Objet : Facture énergie et maintenance.\nMontant : 1 485 000 FCFA TTC.\nAction attendue : Contrôle comptable et ordre de virement.',
    'Facture', 'URGENTE', 'svc_demo_fin', 'cir_demo_nopres'
  );

  // Workflow instances & steps for demo mails
  const insWfi = db.prepare(`
    INSERT INTO workflow_instances (id, mail_id, company_id, circuit_id, circuit_version_id, steps_snapshot_json, current_step_index, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insWfs = db.prepare(`
    INSERT INTO workflow_step_executions (
      id, workflow_instance_id, mail_id, company_id, step_order, step_name, step_type, mode,
      status, assigned_service_id, assigned_user_id, parallel_approvals_json, decision, observations, decided_by, decided_at, due_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // WFI 1: Presidential approval pending (step index 5)
  insWfi.run('wfi_demo_1', 'mail_demo_1', companyId, 'cir_demo_pres', 'cv_demo_pres_1', JSON.stringify(c2Steps), 5, 'EN_COURS');
  c2Steps.forEach((st, idx) => {
    const status = idx < 5 ? 'VALIDE' : idx === 5 ? 'EN_COURS' : 'EN_ATTENTE';
    const uid = idx === 3 ? 'usr_demo_agent_jur' : idx === 5 ? 'usr_demo_president' : idx === 2 || idx === 4 ? 'usr_demo_resp_jur' : 'usr_demo_agent_sec';
    insWfs.run(
      `wfs_d1_${idx + 1}`, 'wfi_demo_1', 'mail_demo_1', companyId, st.stepOrder, st.name, st.stepType, st.mode,
      status, st.targetServiceId || 'svc_demo_jur', uid, '[]',
      idx < 5 ? 'APPROUVER' : '', idx < 5 ? 'Étape validée dans le circuit de démonstration.' : '',
      idx < 5 ? uid : null, idx < 5 ? `${yesterday} 16:00:00` : null, `${inThreeDays} 18:00:00`
    );
  });

  // WFI 2: Agent treatment in progress (step index 3)
  insWfi.run('wfi_demo_2', 'mail_demo_2', companyId, 'cir_demo_nopres', 'cv_demo_nopres_1', JSON.stringify(c1Steps), 3, 'EN_COURS');
  c1Steps.forEach((st, idx) => {
    const status = idx < 3 ? 'VALIDE' : idx === 3 ? 'EN_COURS' : 'EN_ATTENTE';
    const uid = idx === 3 ? 'usr_demo_agent_fin' : idx === 2 || idx === 4 ? 'usr_demo_resp_fin' : 'usr_demo_agent_sec';
    insWfs.run(
      `wfs_d2_${idx + 1}`, 'wfi_demo_2', 'mail_demo_2', companyId, st.stepOrder, st.name, st.stepType, st.mode,
      status, st.targetServiceId || 'svc_demo_fin', uid, '[]',
      idx < 3 ? 'TRANSMETTRE' : '', idx === 2 ? 'Affecté à Romuald Boko pour vérification comptable.' : '',
      idx < 3 ? uid : null, idx < 3 ? `${yesterday} 11:30:00` : null, `${overdueDate} 17:00:00`
    );
  });

  // WFI 4: Returned to Secretariat (step index 6)
  insWfi.run('wfi_demo_4', 'mail_demo_4', companyId, 'cir_demo_rep', 'cv_demo_rep_1', JSON.stringify(c2Steps), 6, 'EN_COURS');
  c2Steps.forEach((st, idx) => {
    const status = idx < 6 ? 'VALIDE' : idx === 6 ? 'EN_COURS' : 'EN_ATTENTE';
    insWfs.run(
      `wfs_d4_${idx + 1}`, 'wfi_demo_4', 'mail_demo_4', companyId, st.stepOrder, st.name, st.stepType, st.mode,
      status, st.targetServiceId || 'svc_demo_sec', idx === 5 ? 'usr_demo_president' : 'usr_demo_agent_sec', '[]',
      idx < 6 ? 'APPROUVER' : '', idx < 6 ? 'Validé pour retour Secrétariat.' : '',
      idx < 6 ? 'usr_demo_president' : null, idx < 6 ? `${yesterday} 17:45:00` : null, `${inThreeDays} 18:00:00`
    );
  });

  // WFI 5: Parallel approvals step (1/2 approved so far!)
  insWfi.run('wfi_demo_5', 'mail_demo_5', companyId, 'cir_demo_parallel', 'cv_demo_parallel_1', JSON.stringify(c7Steps), 1, 'EN_COURS');
  c7Steps.forEach((st, idx) => {
    const status = idx === 0 ? 'VALIDE' : idx === 1 ? 'EN_COURS' : 'EN_ATTENTE';
    const approvals =
      idx === 1
        ? JSON.stringify([{ userId: 'usr_demo_resp_fin', userName: 'Aminata Zinsou', at: `${yesterday} 15:00:00` }])
        : '[]';
    insWfs.run(
      `wfs_d5_${idx + 1}`, 'wfi_demo_5', 'mail_demo_5', companyId, st.stepOrder, st.name, st.stepType, st.mode,
      status, st.targetServiceId || 'svc_demo_jur', idx === 2 ? 'usr_demo_president' : 'usr_demo_resp_jur', approvals,
      idx === 0 ? 'TRANSMETTRE' : '', idx === 0 ? 'Soumis en parallèle aux Finances et au Juridique.' : '',
      idx === 0 ? 'usr_demo_agent_sec' : null, idx === 0 ? `${yesterday} 12:00:00` : null, `${inThreeDays} 18:00:00`
    );
  });

  // Demo tasks
  const insTsk = db.prepare(`
    INSERT INTO tasks (id, mail_id, company_id, workflow_step_id, title, description, assigned_user_id, assigned_service_id, priority, status, due_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insTsk.run('tsk_demo_1', 'mail_demo_1', companyId, 'wfs_d1_6', 'ARR-2026-0001 — Validation & signature Président', 'Examiner la proposition de convention Port Autonome de Cotonou.', 'usr_demo_president', 'svc_demo_pres', 'HAUTE', 'A_TRAITER', `${inThreeDays} 18:00:00`, 'usr_demo_resp_jur');
  insTsk.run('tsk_demo_2', 'mail_demo_2', companyId, 'wfs_d2_4', 'ARR-2026-0002 — Vérification facture SBEE 1 485 000 FCFA', 'Contrôler les compteurs et préparer le bon à payer.', 'usr_demo_agent_fin', 'svc_demo_fin', 'URGENTE', 'EN_COURS', `${overdueDate} 17:00:00`, 'usr_demo_resp_fin');
  insTsk.run('tsk_demo_3', 'mail_demo_4', companyId, 'wfs_d4_7', 'ARR-2026-0004 — Contrôle final & expédition Secrétariat', 'Vérifier la réponse signée avant expédition à Atlantique BTP.', 'usr_demo_agent_sec', 'svc_demo_sec', 'HAUTE', 'A_TRAITER', `${inThreeDays} 18:00:00`, 'usr_demo_president');
  insTsk.run('tsk_demo_4', 'mail_demo_5', companyId, 'wfs_d5_2', 'ARR-2026-0005 — Avis juridique parallèle requis (1/2 reçu)', 'La Direction financière a validé. Avis du Service juridique attendu.', 'usr_demo_resp_jur', 'svc_demo_jur', 'HAUTE', 'A_TRAITER', `${inThreeDays} 18:00:00`, 'usr_demo_agent_sec');
  insTsk.run('tsk_demo_5', 'mail_demo_7', companyId, null, 'INT-2026-0001 — Préparation inventaire T4 Direction financière', 'Préparer les états d’immobilisations pour l’inventaire T4.', 'usr_demo_agent_fin', 'svc_demo_fin', 'NORMALE', 'A_TRAITER', `${inThreeDays} 18:00:00`, 'usr_demo_resp_fin');

  // Demo email log showing department head email when Romuald Boko (Agent) received ARR-2026-0002
  db.prepare(`
    INSERT INTO email_logs (
      id, company_id, mail_id, recipient_user_id, recipient_email, recipient_name,
      department_name, trigger_event, subject, body_text, delivery_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'eml_demo_1',
    companyId,
    'mail_demo_2',
    'usr_demo_resp_fin',
    'finances@nexorademo.bj',
    'Aminata Zinsou',
    'Direction financière',
    'AGENT_MAIL_RECEIVED_DEPT_HEAD_EMAIL',
    '[NEXORA] Département Direction financière — Courrier ARR-2026-0002 reçu par l’agent Romuald Boko',
    'Bonjour Aminata Zinsou,\n\nL’agent Romuald Boko (Direction financière) a reçu le courrier ARR-2026-0002 (Facture trimestrielle énergie SBEE N° F-2026-4412, Priorité : URGENTE).\n\n— Plateforme NEXORA',
    process.env.SMTP_HOST ? 'SENT_SMTP' : 'QUEUED_NO_SMTP'
  );

  // Notifications
  db.prepare(`
    INSERT INTO notifications (id, company_id, user_id, mail_id, task_id, event_type, title, message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'ntf_demo_1', companyId, 'usr_demo_president', 'mail_demo_1', 'tsk_demo_1', 'VALIDATION_PRESIDENT',
    'Décision attendue — ARR-2026-0001',
    'Le courrier du Port Autonome de Cotonou attend votre validation présidentielle.'
  );
  db.prepare(`
    INSERT INTO notifications (id, company_id, user_id, mail_id, task_id, event_type, title, message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'ntf_demo_2', companyId, 'usr_demo_resp_fin', 'mail_demo_2', 'tsk_demo_2', 'EMAIL_CHEF_DEPARTEMENT',
    'E-mail envoyé : ARR-2026-0002 affecté à Romuald Boko',
    'Alerte e-mail envoyée à finances@nexorademo.bj suite à la réception du courrier par l’agent Romuald Boko.'
  );

  // Audit logs
  db.prepare(`
    INSERT INTO audit_logs (id, company_id, user_id, user_name, action, entity_type, entity_id, context)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'aud_demo_1', companyId, 'usr_demo_agent_sec', 'Nadine Kpadonou', 'CREATION_COURRIER', 'MAIL', 'mail_demo_1',
    'Enregistrement initial de ARR-2026-0001 (Environnement de démonstration NEXORA DEMO GROUP).'
  );
  db.prepare(`
    INSERT INTO audit_logs (id, company_id, user_id, user_name, action, entity_type, entity_id, context)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'aud_demo_2', companyId, 'usr_demo_resp_fin', 'Aminata Zinsou', 'AFFECTATION_AGENT', 'MAIL', 'mail_demo_2',
    'Affectation de ARR-2026-0002 à Romuald Boko + e-mail automatique envoyé au chef de département.'
  );

  // Demo stamp & signature for President & mail_demo_4
  const demoStamp = buildDemoStampDataUrl('NEXORA DEMO GROUP', 'PRÉSIDENT DG', 'Cotonou - Bénin');
  const demoSig = buildDemoSignatureDataUrl('Sébastien Houngbédji');
  db.prepare("UPDATE companies SET stamp_image = ? WHERE id = ?").run(demoStamp, companyId);
  db.prepare("UPDATE users SET signature_image = ?, stamp_image = ? WHERE id = 'usr_demo_president'").run(demoSig, demoStamp);
  db.prepare(`
    INSERT INTO mail_signatures (id, mail_id, company_id, signer_user_id, signer_name, signer_role, signer_title, signature_image, stamp_image, signature_hash)
    VALUES ('msig_demo_4', 'mail_demo_4', ?, 'usr_demo_president', 'Sébastien Houngbédji', 'PRESIDENT', 'Président Directeur Général', ?, ?, 'sha256:demo-arr-2026-0004-verified')
  `).run(companyId, demoSig, demoStamp);
}
