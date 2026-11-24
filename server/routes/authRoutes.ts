import { Router, type Response } from 'express';
import { db } from '../db/database.ts';
import { createDefaultServicesAndCircuits } from '../db/seed.ts';
import { loadAuthUser, requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import { logAudit } from '../services/auditService.ts';
import { hashPassword, newId, signToken, verifyPassword } from '../utils/crypto.ts';

export const authRoutes = Router();

function setSessionCookie(req: AuthenticatedRequest, res: Response, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie('nexora_session', token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    partitioned: isHttps,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function getCompanyPayload(companyId: string | null) {
  if (!companyId) return null;
  const c = db
    .prepare(`
      SELECT c.*, p.name as plan_name, p.max_users, p.max_storage_mb, p.max_mails_month, p.ai_enabled
      FROM companies c
      LEFT JOIN subscription_plans p ON p.id = c.plan_id
      WHERE c.id = ?
    `)
    .get(companyId) as Record<string, unknown> | undefined;
  if (!c) return null;
  const trialEnd = new Date(String(c.trial_ends_at));
  const daysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000));
  return { ...c, trial_days_remaining: daysRemaining };
}

authRoutes.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const company = getCompanyPayload(user.companyId);
  const token = signToken({ userId: user.id, role: user.role, companyId: user.companyId });
  res.json({ user, company, token });
});

authRoutes.post('/login', (req: AuthenticatedRequest, res: Response) => {
  const { email, password } = req.body ?? {};
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'E-mail et mot de passe requis.' });
    return;
  }

  const row = db
    .prepare('SELECT id, company_id, password_hash, role, is_active FROM users WHERE LOWER(email) = LOWER(?)')
    .get(email.trim()) as
    | { id: string; company_id: string | null; password_hash: string; role: string; is_active: number }
    | undefined;

  if (!row || !verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: 'Identifiants invalides.' });
    return;
  }

  if (row.is_active !== 1) {
    res.status(403).json({ error: 'Ce compte utilisateur est désactivé.' });
    return;
  }

  if (row.company_id && row.role !== 'SUPER_ADMIN') {
    const comp = db.prepare('SELECT status FROM companies WHERE id = ?').get(row.company_id) as { status: string } | undefined;
    if (!comp || comp.status === 'suspended') {
      res.status(403).json({ error: 'L’espace de cette entreprise est actuellement suspendu.' });
      return;
    }
  }

  const authUser = loadAuthUser(row.id);
  if (!authUser) {
    res.status(401).json({ error: 'Impossible de charger le profil utilisateur.' });
    return;
  }

  const token = signToken({ userId: authUser.id, role: authUser.role, companyId: authUser.companyId });
  setSessionCookie(req, res, token);

  logAudit({
    companyId: authUser.companyId,
    userId: authUser.id,
    userName: authUser.fullName,
    action: 'CONNEXION',
    entityType: 'USER',
    entityId: authUser.id,
    context: `Connexion réussie (${authUser.role})`,
  });

  res.json({
    token,
    user: authUser,
    company: getCompanyPayload(authUser.companyId),
  });
});

// Explicit demo switcher for NEXORA DEMO GROUP & Super Admin evaluation
authRoutes.post('/demo-login', (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.body ?? {};
  const allowedDemoIds = [
    'usr_superadmin',
    'usr_demo_admin',
    'usr_demo_president',
    'usr_demo_resp_fin',
    'usr_demo_resp_jur',
    'usr_demo_agent_sec',
    'usr_demo_agent_fin',
  ];
  if (!userId || !allowedDemoIds.includes(String(userId))) {
    res.status(400).json({ error: 'Compte de démonstration invalide.' });
    return;
  }
  const authUser = loadAuthUser(String(userId));
  if (!authUser) {
    res.status(404).json({ error: 'Compte de démonstration introuvable.' });
    return;
  }
  const token = signToken({ userId: authUser.id, role: authUser.role, companyId: authUser.companyId });
  setSessionCookie(req, res, token);
  res.json({
    token,
    user: authUser,
    company: getCompanyPayload(authUser.companyId),
  });
});

authRoutes.post('/register-company', (req: AuthenticatedRequest, res: Response) => {
  const { company: cData, admin: aData } = req.body ?? {};
  if (!cData?.legalName || !cData?.email || !aData?.fullName || !aData?.email || !aData?.password) {
    res.status(400).json({ error: 'Veuillez renseigner tous les champs obligatoires de l’entreprise et de l’administrateur.' });
    return;
  }
  if (String(aData.password).length < 8) {
    res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
    return;
  }
  if (aData.confirmPassword !== undefined && aData.password !== aData.confirmPassword) {
    res.status(400).json({ error: 'La confirmation du mot de passe ne correspond pas.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(String(aData.email).trim());
  if (existing) {
    res.status(409).json({ error: 'Un compte utilisateur existe déjà avec cette adresse e-mail.' });
    return;
  }

  const companyId = newId('cmp');
  const adminUserId = newId('usr');
  const trialEnds = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  db.transaction(() => {
    db.prepare(`
      INSERT INTO companies (
        id, legal_name, trade_name, sector, legal_form, country, city, address,
        phone, email, website, tax_id, logo_url, plan_id, status, trial_ends_at, is_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'plan_institutionnel', 'trial', ?, 0)
    `).run(
      companyId,
      String(cData.legalName).trim(),
      String(cData.tradeName || cData.legalName).trim(),
      String(cData.sector || 'Services').trim(),
      String(cData.legalForm || 'SARL').trim(),
      String(cData.country || 'Bénin').trim(),
      String(cData.city || 'Cotonou').trim(),
      String(cData.address || '').trim(),
      String(cData.phone || '').trim(),
      String(cData.email).trim(),
      String(cData.website || '').trim(),
      String(cData.taxId || '').trim(),
      String(cData.logoUrl || '').trim(),
      trialEnds
    );

    const adminPerms = {
      can_manage_users: true,
      can_manage_circuits: true,
      can_view_all_services: true,
      can_view_confidential: true,
      can_export_reports: true,
      secretariat_receive: true,
      secretariat_register: true,
      secretariat_ai_analyze: true,
      secretariat_orient: true,
      secretariat_final_control: true,
      secretariat_dispatch: true,
      secretariat_archive: true,
    };

    db.prepare(`
      INSERT INTO users (id, company_id, full_name, job_title, email, phone, password_hash, role, is_active, permissions_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ADMIN', 1, ?)
    `).run(
      adminUserId,
      companyId,
      String(aData.fullName).trim(),
      String(aData.jobTitle || 'Administrateur').trim(),
      String(aData.email).trim().toLowerCase(),
      String(aData.phone || '').trim(),
      hashPassword(String(aData.password)),
      JSON.stringify(adminPerms)
    );

    const chosenServiceName = String(aData.serviceName || aData.jobTitle || 'Direction Générale').trim();
    createDefaultServicesAndCircuits(companyId, adminUserId, chosenServiceName);
  })();

  const authUser = loadAuthUser(adminUserId)!;
  const token = signToken({ userId: authUser.id, role: authUser.role, companyId: authUser.companyId });
  setSessionCookie(req, res, token);

  logAudit({
    companyId,
    userId: adminUserId,
    userName: authUser.fullName,
    action: 'CREATION_ENTREPRISE',
    entityType: 'COMPANY',
    entityId: companyId,
    newValue: { legalName: cData.legalName, trialEnds },
    context: 'Inscription entreprise et démarrage de la période d’essai gratuit de 14 jours.',
  });

  res.status(201).json({
    token,
    user: authUser,
    company: getCompanyPayload(companyId),
  });
});

authRoutes.post('/forgot-password', (req: AuthenticatedRequest, res: Response) => {
  const { email } = req.body ?? {};
  if (!email) {
    res.status(400).json({ error: 'Adresse e-mail requise.' });
    return;
  }
  const user = db.prepare('SELECT id, company_id, full_name, email FROM users WHERE LOWER(email) = LOWER(?)').get(String(email).trim()) as
    | { id: string; company_id: string | null; full_name: string; email: string }
    | undefined;

  if (user) {
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    db.prepare('UPDATE users SET reset_token = ?, reset_token_expires_at = ? WHERE id = ?').run(resetCode, expiresAt, user.id);

    if (user.company_id) {
      db.prepare(`
        INSERT INTO email_logs (id, company_id, recipient_user_id, recipient_email, recipient_name, trigger_event, subject, body_text, delivery_status)
        VALUES (?, ?, ?, ?, ?, 'PASSWORD_RESET', ?, ?, 'QUEUED_NO_SMTP')
      `).run(
        newId('eml'),
        user.company_id,
        user.id,
        user.email,
        user.full_name,
        '[NEXORA] Code de réinitialisation de mot de passe',
        `Votre code de réinitialisation temporaire (valable 30 min) : ${resetCode}`
      );
    }

    res.json({
      message: 'Un code de réinitialisation a été généré et consigné pour votre compte.',
      previewResetHint: `Code de vérification généré (environnement local) : ${resetCode}`,
    });
    return;
  }

  res.json({
    message: 'Si cette adresse existe dans NEXORA, un code de réinitialisation a été envoyé.',
  });
});

authRoutes.post('/reset-password', (req: AuthenticatedRequest, res: Response) => {
  const { email, code, newPassword } = req.body ?? {};
  if (!email || !code || !newPassword || String(newPassword).length < 8) {
    res.status(400).json({ error: 'E-mail, code et nouveau mot de passe (min 8 car.) requis.' });
    return;
  }
  const user = db
    .prepare('SELECT id, reset_token, reset_token_expires_at FROM users WHERE LOWER(email) = LOWER(?)')
    .get(String(email).trim()) as { id: string; reset_token: string | null; reset_token_expires_at: string | null } | undefined;

  if (!user || !user.reset_token || user.reset_token !== String(code).trim()) {
    res.status(400).json({ error: 'Code de réinitialisation invalide.' });
    return;
  }
  if (user.reset_token_expires_at && new Date(user.reset_token_expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: 'Code de réinitialisation expiré.' });
    return;
  }

  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires_at = NULL WHERE id = ?').run(
    hashPassword(String(newPassword)),
    user.id
  );
  res.json({ message: 'Mot de passe mis à jour avec succès. Vous pouvez vous connecter.' });
});

// Endpoint d'activation de compte suite à invitation (XAMPP-like)
authRoutes.post('/activate-account', (req: AuthenticatedRequest, res: Response) => {
  const { token, password, confirmPassword } = req.body ?? {};
  if (!token || !password) {
    res.status(400).json({ error: 'Jeton d’activation et mot de passe requis.' });
    return;
  }
  if (String(password).length < 8) {
    res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
    return;
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    res.status(400).json({ error: 'La confirmation du mot de passe ne correspond pas.' });
    return;
  }

  const user = db.prepare('SELECT id, role, company_id, full_name, email, invitation_expires_at FROM users WHERE invitation_token = ?').get(String(token).trim()) as {
    id: string;
    role: string;
    company_id: string | null;
    full_name: string;
    email: string;
    invitation_expires_at: string | null;
  } | undefined;

  if (!user) {
    res.status(400).json({ error: 'Jeton d’activation invalide ou déjà utilisé.' });
    return;
  }

  // Vérification de la validité de 24h
  if (user.invitation_expires_at && new Date(user.invitation_expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: 'Ce lien d’invitation a expiré (délai de 24h dépassé). Veuillez contacter votre administrateur pour recevoir une nouvelle invitation.' });
    return;
  }

  db.prepare('UPDATE users SET password_hash = ?, invitation_token = NULL, invitation_expires_at = NULL, is_activated = 1 WHERE id = ?').run(
    hashPassword(String(password)),
    user.id
  );

  const authUser = loadAuthUser(user.id)!;
  const sessionToken = signToken({ userId: authUser.id, role: authUser.role, companyId: authUser.companyId });
  setSessionCookie(req, res, sessionToken);

  logAudit({
    companyId: user.company_id || 'system',
    userId: user.id,
    userName: user.full_name,
    action: 'ACTIVATION_COMPTE',
    entityType: 'USER',
    entityId: user.id,
    context: 'Activation du compte et définition du mot de passe personnel.',
  });

  res.json({
    message: 'Compte activé avec succès.',
    token: sessionToken,
    user: authUser,
  });
});

authRoutes.post('/logout', (req: AuthenticatedRequest, res: Response) => {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie('nexora_session', {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    path: '/',
  });
  res.json({ ok: true });
});
