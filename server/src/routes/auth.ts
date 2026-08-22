import { and, eq, gt, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import {
  clearSessionCookie,
  createConfirmToken,
  createResetToken,
  createSessionToken,
  hashConfirmToken,
  hashPassword,
  normalizeEmail,
  readSessionUser,
  setSessionCookie,
  toPublicUser,
  verifyPassword,
} from '../lib/auth.js';
import { localeOf, t } from '../lib/i18n.js';
import {
  clearLineOAuthCookies,
  createLineOAuthState,
  exchangeLineCode,
  fetchLineProfile,
  getLineOAuthConfig,
  lineAuthorizeUrl,
  readLineOAuthCallback,
  readLineOAuthNext,
  readLineOAuthReturn,
  readSafeNextPath,
  readSafeReturnPath,
  resolveLineCallbackUrl,
  setLineOAuthCookies,
  upsertLineUser,
  verifyLineOAuthState,
} from '../lib/line.js';
import { sendConfirmEmail, sendResetPasswordEmail } from '../lib/mail.js';
import { validated } from '../lib/validate.js';
import type { LocaleEnv } from '../middleware/locale.js';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
});

const emailOnlySchema = z.object({
  email: z.string().trim().email().max(254),
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(8).max(200),
});

export const authRoutes = new Hono<LocaleEnv>();

authRoutes.get('/me', async (c) => {
  const user = await readSessionUser(c);
  if (!user) {
    return c.json({ data: null });
  }
  return c.json({ data: user });
});

authRoutes.post('/register', validated('json', credentialsSchema), async (c) => {
  const locale = localeOf(c);
  const email = normalizeEmail(c.req.valid('json').email);
  const { password } = c.req.valid('json');

  const [existing] = await db
    .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing?.emailVerifiedAt) {
    return c.json({ error: t(locale, 'errors.emailAlreadyRegistered') }, 409);
  }

  const { token, tokenHash, expiresAt } = createConfirmToken();
  const passwordHash = await hashPassword(password);

  if (existing) {
    await db
      .update(users)
      .set({
        passwordHash,
        emailConfirmTokenHash: tokenHash,
        emailConfirmExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
  } else {
    await db.insert(users).values({
      email,
      passwordHash,
      role: 'user',
      emailConfirmTokenHash: tokenHash,
      emailConfirmExpiresAt: expiresAt,
    });
  }

  try {
    await sendConfirmEmail(email, token, locale);
  } catch (err) {
    console.error('Failed to send confirmation email', err);
    return c.json({ error: t(locale, 'errors.confirmEmailSendFailed') }, 503);
  }
  return c.json({ data: { email } }, 201);
});

authRoutes.post('/login', validated('json', credentialsSchema), async (c) => {
  const locale = localeOf(c);
  const email = normalizeEmail(c.req.valid('json').email);
  const { password } = c.req.valid('json');

  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row?.passwordHash || !(await verifyPassword(password, row.passwordHash))) {
    return c.json({ error: t(locale, 'errors.invalidCredentials') }, 401);
  }

  if (!row.emailVerifiedAt) {
    return c.json({ error: t(locale, 'errors.emailNotConfirmed') }, 403);
  }

  const publicUser = toPublicUser(row);
  const token = await createSessionToken(publicUser);
  setSessionCookie(c, token);
  return c.json({ data: publicUser });
});

authRoutes.get('/confirm', async (c) => {
  const locale = localeOf(c);
  const token = c.req.query('token')?.trim();
  if (!token) {
    return c.json({ error: t(locale, 'errors.missingConfirmToken') }, 400);
  }

  const tokenHash = hashConfirmToken(token);
  const now = new Date();

  const [row] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.emailConfirmTokenHash, tokenHash),
        gt(users.emailConfirmExpiresAt, now),
      ),
    )
    .limit(1);

  if (!row) {
    return c.json({ error: t(locale, 'errors.invalidConfirmToken') }, 400);
  }

  const [updated] = await db
    .update(users)
    .set({
      emailVerifiedAt: now,
      emailConfirmTokenHash: null,
      emailConfirmExpiresAt: null,
      updatedAt: now,
    })
    .where(eq(users.id, row.id))
    .returning({
      id: users.id,
      email: users.email,
      role: users.role,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
    });

  const publicUser = toPublicUser(updated);
  const sessionToken = await createSessionToken(publicUser);
  setSessionCookie(c, sessionToken);
  return c.json({ data: publicUser });
});

authRoutes.post(
  '/resend-confirmation',
  validated('json', emailOnlySchema),
  async (c) => {
    const locale = localeOf(c);
    const email = normalizeEmail(c.req.valid('json').email);

    const [row] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.emailVerifiedAt)))
      .limit(1);

    if (row) {
      const { token, tokenHash, expiresAt } = createConfirmToken();
      await db
        .update(users)
        .set({
          emailConfirmTokenHash: tokenHash,
          emailConfirmExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(users.id, row.id));
      try {
        await sendConfirmEmail(email, token, locale);
      } catch (err) {
        console.error('Failed to resend confirmation email', err);
      }
    }

    return c.json({ ok: true });
  },
);

authRoutes.post(
  '/forgot-password',
  validated('json', emailOnlySchema),
  async (c) => {
    const locale = localeOf(c);
    const email = normalizeEmail(c.req.valid('json').email);

    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (row?.emailVerifiedAt) {
      const { token, tokenHash, expiresAt } = createResetToken();
      await db
        .update(users)
        .set({
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(users.id, row.id));
      try {
        await sendResetPasswordEmail(email, token, locale);
      } catch (err) {
        console.error('Failed to send reset password email', err);
      }
    }

    return c.json({ ok: true });
  },
);

authRoutes.post('/reset-password', validated('json', resetPasswordSchema), async (c) => {
  const locale = localeOf(c);
  const { token, password } = c.req.valid('json');
  const tokenHash = hashConfirmToken(token);
  const now = new Date();

  const [row] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.passwordResetTokenHash, tokenHash),
        gt(users.passwordResetExpiresAt, now),
      ),
    )
    .limit(1);

  if (!row || !row.emailVerifiedAt) {
    return c.json({ error: t(locale, 'errors.invalidResetToken') }, 400);
  }

  const passwordHash = await hashPassword(password);
  const [updated] = await db
    .update(users)
    .set({
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      updatedAt: now,
    })
    .where(eq(users.id, row.id))
    .returning({
      id: users.id,
      email: users.email,
      role: users.role,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
    });

  const publicUser = toPublicUser(updated);
  const sessionToken = await createSessionToken(publicUser);
  setSessionCookie(c, sessionToken);
  return c.json({ data: publicUser });
});

authRoutes.get('/line/start', async (c) => {
  const returnTo = readSafeReturnPath(c.req.query('returnTo'));
  const callbackUrl = resolveLineCallbackUrl(c);
  const config = getLineOAuthConfig(c, callbackUrl);
  if (!config) {
    return c.redirect(`${returnTo}?line=unavailable`);
  }

  const state = createLineOAuthState();
  const next = readSafeNextPath(c.req.query('next'));
  setLineOAuthCookies(c, state, next === '/' ? undefined : next, returnTo, callbackUrl);
  return c.redirect(lineAuthorizeUrl(state, config));
});

authRoutes.get('/line/callback', async (c) => {
  const locale = localeOf(c);
  const returnTo = readLineOAuthReturn(c);
  const callbackUrl = readLineOAuthCallback(c) || resolveLineCallbackUrl(c);
  const config = getLineOAuthConfig(c, callbackUrl);
  const fail = (code: string) => {
    clearLineOAuthCookies(c);
    return c.redirect(`${returnTo}?line=${encodeURIComponent(code)}`);
  };

  if (!config) {
    return fail('unavailable');
  }

  const error = c.req.query('error');
  if (error) {
    console.error('LINE OAuth denied', error);
    return fail('denied');
  }

  const state = c.req.query('state')?.trim();
  const code = c.req.query('code')?.trim();
  if (!verifyLineOAuthState(c, state) || !code) {
    return fail('invalid');
  }

  const next = readLineOAuthNext(c);
  clearLineOAuthCookies(c);

  try {
    const tokenPayload = await exchangeLineCode(code, config);
    const profile = await fetchLineProfile(tokenPayload.access_token);
    const publicUser = await upsertLineUser(profile);
    const sessionToken = await createSessionToken(publicUser);
    setSessionCookie(c, sessionToken);
    return c.redirect(next);
  } catch (err) {
    console.error('LINE OAuth callback failed', err);
    return c.redirect(`${returnTo}?line=failed&message=${encodeURIComponent(t(locale, 'auth.line.failed'))}`);
  }
});

authRoutes.post('/logout', async (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});
