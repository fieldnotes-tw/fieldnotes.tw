import { and, eq, gt, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import {
  clearSessionCookie,
  createConfirmToken,
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
import { sendConfirmEmail } from '../lib/mail.js';
import { validated } from '../lib/validate.js';
import type { LocaleEnv } from '../middleware/locale.js';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
});

const emailOnlySchema = z.object({
  email: z.string().trim().email().max(254),
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
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
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

authRoutes.post('/logout', async (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});
