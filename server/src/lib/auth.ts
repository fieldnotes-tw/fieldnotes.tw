import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { db } from '../db/index.js';
import { users, type User, type UserRole } from '../db/schema.js';

export const SESSION_COOKIE = 'fn_session';
const BCRYPT_ROUNDS = 12;
const CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
};

type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  exp: number;
};

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return secret;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function toPublicUser(user: Pick<User, 'id' | 'email' | 'role' | 'displayName' | 'avatarUrl' | 'bio'>): SessionUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
  };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function hashConfirmToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export const hashResetToken = hashConfirmToken;

export function createConfirmToken() {
  return createTimedToken(CONFIRM_TTL_MS);
}

export function createResetToken() {
  return createTimedToken(RESET_TTL_MS);
}

function createTimedToken(ttlMs: number) {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashConfirmToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
  };
}

export async function createSessionToken(user: SessionUser) {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      exp: now + 60 * 60 * 24 * 14,
    } satisfies JwtPayload,
    jwtSecret(),
    'HS256',
  );
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: process.env.COOKIE_SECURE === '1',
    maxAge: 60 * 60 * 24 * 14,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export async function readSessionUser(c: Context): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;

  try {
    const payload = (await verify(token, jwtSecret(), 'HS256')) as JwtPayload;
    if (!payload.sub || !payload.email || !payload.role) return null;

    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!row || !row.emailVerifiedAt) return null;
    return toPublicUser(row);
  } catch {
    return null;
  }
}
