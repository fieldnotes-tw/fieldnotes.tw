import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { db } from '../db/index.js';
import { users, type User, type UserRole } from '../db/schema.js';

export const SESSION_COOKIE = 'fn_session';
const BCRYPT_ROUNDS = 12;

export type SessionUser = {
  id: string;
  username: string;
  role: UserRole;
};

type JwtPayload = {
  sub: string;
  username: string;
  role: UserRole;
  exp: number;
};

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return secret;
}

export function toPublicUser(user: Pick<User, 'id' | 'username' | 'role'>): SessionUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
  };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function createSessionToken(user: SessionUser) {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
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
    if (!payload.sub || !payload.username || !payload.role) return null;

    const [row] = await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!row) return null;
    return toPublicUser(row);
  } catch {
    return null;
  }
}
