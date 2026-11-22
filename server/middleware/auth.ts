import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/database.ts';
import type { AuthUser, UserPermissions, UserRole } from '../types.ts';
import { safeParseJson, verifyToken } from '../utils/crypto.ts';

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

export function loadAuthUser(userId: string): AuthUser | null {
  const row = db
    .prepare(`
      SELECT id, company_id, full_name, job_title, email, avatar_url, role, is_active, permissions_json
      FROM users WHERE id = ?
    `)
    .get(userId) as
    | {
        id: string;
        company_id: string | null;
        full_name: string;
        job_title: string;
        email: string;
        avatar_url?: string;
        role: UserRole;
        is_active: number;
        permissions_json: string;
      }
    | undefined;

  if (!row || row.is_active !== 1) return null;

  if (row.company_id && row.role !== 'SUPER_ADMIN') {
    const comp = db
      .prepare('SELECT status FROM companies WHERE id = ?')
      .get(row.company_id) as { status: string } | undefined;
    if (!comp || comp.status === 'suspended') {
      return null;
    }
  }

  const serviceRows = db
    .prepare(`
      SELECT s.id, s.is_secretariat
      FROM services s
      JOIN user_services us ON us.service_id = s.id
      WHERE us.user_id = ?
    `)
    .all(row.id) as Array<{ id: string; is_secretariat: number }>;

  const permissions = safeParseJson<UserPermissions>(row.permissions_json, {});
  const isSecretariat =
    serviceRows.some((s) => s.is_secretariat === 1) ||
    Boolean(permissions.secretariat_receive || permissions.secretariat_register || permissions.secretariat_final_control);

  return {
    id: row.id,
    companyId: row.company_id,
    fullName: row.full_name,
    jobTitle: row.job_title,
    email: row.email,
    avatarUrl: row.avatar_url || '',
    role: row.role,
    permissions,
    isSecretariat,
    serviceIds: serviceRows.map((s) => s.id),
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | null = null;
  let usingCookie = false;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    token = parseCookie(req.headers.cookie, 'nexora_session');
    if (token) usingCookie = true;
  }

  if (!token) {
    res.status(401).json({ error: 'Authentification requise' });
    return;
  }

  // CSRF check for cookie-authenticated mutations
  if (usingCookie && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const xrw = req.headers['x-requested-with'];
    if (xrw !== 'XMLHttpRequest') {
      res.status(403).json({ error: 'En-tête de sécurité manquant' });
      return;
    }
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Session expirée ou invalide' });
    return;
  }

  const user = loadAuthUser(payload.userId);
  if (!user) {
    res.status(401).json({ error: 'Compte utilisateur inactif ou entreprise suspendue' });
    return;
  }

  req.user = user;
  next();
}

export function requireCompanyScope(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentification requise' });
    return;
  }
  if (req.user.role === 'SUPER_ADMIN' || !req.user.companyId) {
    res.status(403).json({ error: 'Accès réservé aux utilisateurs d\'une entreprise' });
    return;
  }
  next();
}

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentification requise' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Vous n\'avez pas le rôle requis pour cette action' });
      return;
    }
    next();
  };
}

export function hasPermission(user: AuthUser, perm: keyof UserPermissions): boolean {
  if (user.role === 'ADMIN') return true;
  return Boolean(user.permissions[perm]);
}
