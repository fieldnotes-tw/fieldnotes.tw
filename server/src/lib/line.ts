import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { db } from '../db/index.js';
import { userIdentities, users } from '../db/schema.js';
import { toPublicUser, type SessionUser } from './auth.js';
import { isDev } from './env.js';

export const LINE_OAUTH_STATE_COOKIE = 'fn_line_oauth_state';
export const LINE_OAUTH_NEXT_COOKIE = 'fn_line_oauth_next';
export const LINE_OAUTH_RETURN_COOKIE = 'fn_line_oauth_return';
export const LINE_OAUTH_CALLBACK_COOKIE = 'fn_line_oauth_callback';

export type LineOAuthConfig = {
  channelId: string;
  channelSecret: string;
  callbackUrl: string;
};

export type LineProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

export function isLineLoginEnabled() {
  return Boolean(process.env.LINE_CHANNEL_ID?.trim() && process.env.LINE_CHANNEL_SECRET?.trim());
}

export function resolveLineCallbackUrl(c?: Context) {
  if (process.env.LINE_CALLBACK_URL?.trim()) {
    return process.env.LINE_CALLBACK_URL.trim();
  }

  if (c && isDev()) {
    const host = c.req.header('host');
    if (host) {
      const proto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() || 'http';
      return `${proto}://${host}/api/auth/line/callback`;
    }
  }

  const base = process.env.APP_BASE_URL?.replace(/\/$/, '');
  if (!base) return '';
  return `${base}/api/auth/line/callback`;
}

export function getLineOAuthConfig(c?: Context, callbackUrl?: string): LineOAuthConfig | null {
  const channelId = process.env.LINE_CHANNEL_ID?.trim();
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim();
  if (!channelId || !channelSecret) return null;

  const resolvedCallback = callbackUrl?.trim() || resolveLineCallbackUrl(c);
  if (!resolvedCallback) return null;

  return { channelId, channelSecret, callbackUrl: resolvedCallback };
}

export function lineAuthorizeUrl(state: string, config: LineOAuthConfig) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.channelId,
    redirect_uri: config.callbackUrl,
    state,
    scope: 'profile openid',
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
}

function cookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: 'Lax' as const,
    path: '/',
    secure: process.env.COOKIE_SECURE === '1',
  };
}

export function setLineOAuthCookies(
  c: Context,
  state: string,
  next?: string,
  returnTo?: string,
  callbackUrl?: string,
) {
  setCookie(c, LINE_OAUTH_STATE_COOKIE, state, {
    ...cookieOptions(),
    maxAge: 60 * 10,
  });
  if (next) {
    setCookie(c, LINE_OAUTH_NEXT_COOKIE, next, {
      ...cookieOptions(),
      maxAge: 60 * 10,
    });
  } else {
    deleteCookie(c, LINE_OAUTH_NEXT_COOKIE, cookieOptions());
  }
  if (returnTo) {
    setCookie(c, LINE_OAUTH_RETURN_COOKIE, returnTo, {
      ...cookieOptions(),
      maxAge: 60 * 10,
    });
  } else {
    deleteCookie(c, LINE_OAUTH_RETURN_COOKIE, cookieOptions());
  }
  if (callbackUrl) {
    setCookie(c, LINE_OAUTH_CALLBACK_COOKIE, callbackUrl, {
      ...cookieOptions(),
      maxAge: 60 * 10,
    });
  } else {
    deleteCookie(c, LINE_OAUTH_CALLBACK_COOKIE, cookieOptions());
  }
}

export function clearLineOAuthCookies(c: Context) {
  const opts = cookieOptions();
  deleteCookie(c, LINE_OAUTH_STATE_COOKIE, opts);
  deleteCookie(c, LINE_OAUTH_NEXT_COOKIE, opts);
  deleteCookie(c, LINE_OAUTH_RETURN_COOKIE, opts);
  deleteCookie(c, LINE_OAUTH_CALLBACK_COOKIE, opts);
}

export function createLineOAuthState() {
  return randomBytes(32).toString('base64url');
}

export function readSafeNextPath(next: string | undefined | null) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

export function readSafeReturnPath(path: string | undefined | null) {
  if (path === '/register' || path === '/login') return path;
  return '/login';
}

export async function exchangeLineCode(code: string, config: LineOAuthConfig) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.callbackUrl,
    client_id: config.channelId,
    client_secret: config.channelSecret,
  });

  const res = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`LINE token exchange failed (${res.status}): ${detail}`);
  }

  return res.json() as Promise<{ access_token: string }>;
}

export async function fetchLineProfile(accessToken: string): Promise<LineProfile> {
  const res = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`LINE profile fetch failed (${res.status}): ${detail}`);
  }

  const data = await res.json() as {
    userId?: string;
    displayName?: string;
    pictureUrl?: string;
  };

  if (!data.userId) {
    throw new Error('LINE profile missing userId');
  }

  return {
    userId: data.userId,
    displayName: data.displayName?.trim() || 'LINE user',
    pictureUrl: data.pictureUrl || undefined,
  };
}

function lineOAuthEmail(providerUserId: string) {
  return `line_${providerUserId}@oauth.local`;
}

export function parseLineOAuthEmail(email: string) {
  const match = /^line_(.+)@oauth\.local$/i.exec(email.trim());
  return match?.[1] ?? null;
}

export async function upsertLineUser(profile: LineProfile): Promise<SessionUser> {
  const providerUserId = profile.userId;
  const now = new Date();

  const [identity] = await db
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(and(
      eq(userIdentities.provider, 'line'),
      eq(userIdentities.providerUserId, providerUserId),
    ))
    .limit(1);

  if (identity) {
    const [existing] = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
      })
      .from(users)
      .where(eq(users.id, identity.userId))
      .limit(1);

    if (!existing) {
      throw new Error('LINE identity user missing');
    }

    const profilePatch: {
      emailVerifiedAt: Date;
      updatedAt: Date;
      displayName?: string;
      avatarUrl?: string | null;
    } = {
      emailVerifiedAt: now,
      updatedAt: now,
    };
    if (!existing.displayName?.trim()) {
      profilePatch.displayName = profile.displayName;
    }
    if (!existing.avatarUrl?.trim()) {
      profilePatch.avatarUrl = profile.pictureUrl || null;
    }

    const [updated] = await db
      .update(users)
      .set(profilePatch)
      .where(eq(users.id, identity.userId))
      .returning({
        id: users.id,
        email: users.email,
        role: users.role,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
      });

    return toPublicUser(updated);
  }

  const oauthEmail = lineOAuthEmail(providerUserId);
  const [existingByEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, oauthEmail))
    .limit(1);

  if (existingByEmail) {
    await db.insert(userIdentities).values({
      userId: existingByEmail.id,
      provider: 'line',
      providerUserId,
    });

    const [linked] = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
      })
      .from(users)
      .where(eq(users.id, existingByEmail.id))
      .limit(1);

    if (!linked) {
      throw new Error('LINE linked user missing');
    }

    return toPublicUser(linked);
  }

  const [created] = await db
    .insert(users)
    .values({
      email: oauthEmail,
      passwordHash: null,
      displayName: profile.displayName,
      avatarUrl: profile.pictureUrl || null,
      role: 'user',
      emailVerifiedAt: now,
    })
    .returning({
      id: users.id,
      email: users.email,
      role: users.role,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
    });

  await db.insert(userIdentities).values({
    userId: created.id,
    provider: 'line',
    providerUserId,
  });

  return toPublicUser(created);
}

export function verifyLineOAuthState(c: Context, state: string | undefined) {
  const expected = getCookie(c, LINE_OAUTH_STATE_COOKIE);
  return Boolean(expected && state && expected === state);
}

export function readLineOAuthNext(c: Context) {
  return readSafeNextPath(getCookie(c, LINE_OAUTH_NEXT_COOKIE));
}

export function readLineOAuthReturn(c: Context) {
  return readSafeReturnPath(getCookie(c, LINE_OAUTH_RETURN_COOKIE));
}

export function readLineOAuthCallback(c: Context) {
  return getCookie(c, LINE_OAUTH_CALLBACK_COOKIE)?.trim() || '';
}
