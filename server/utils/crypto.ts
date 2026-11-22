import crypto from 'node:crypto';
import path from 'node:path';
import { db } from '../db/database.ts';
import type { AuthUser } from '../types.ts';

let cachedSigningSecret: string | null = null;

function getSigningSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  if (cachedSigningSecret) return cachedSigningSecret;
  const row = db
    .prepare('SELECT value FROM system_settings WHERE key = ?')
    .get('jwt_signing_secret') as { value: string } | undefined;
  if (row?.value) {
    cachedSigningSecret = row.value;
    return cachedSigningSecret;
  }
  const generated = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run(
    'jwt_signing_secret',
    generated
  );
  cachedSigningSecret = generated;
  return generated;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function signToken(payload: { userId: string; role: string; companyId: string | null }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 days
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', getSigningSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyToken(token: string): { userId: string; role: string; companyId: string | null } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', getSigningSecret()).update(`${header}.${body}`).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      userId: String(parsed.userId),
      role: String(parsed.role),
      companyId: parsed.companyId ? String(parsed.companyId) : null,
    };
  } catch {
    return null;
  }
}

export function newId(prefix = ''): string {
  const uuid = crypto.randomUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

export function safeResolveInside(baseDir: string, relativeOrFile: string): string {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, path.basename(relativeOrFile));
  if (!target.startsWith(base + path.sep)) {
    throw new Error('Chemin de fichier non autorisé');
  }
  return target;
}

export function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function isAuthUser(u: unknown): u is AuthUser {
  return Boolean(u && typeof u === 'object' && 'id' in u && 'role' in u);
}
