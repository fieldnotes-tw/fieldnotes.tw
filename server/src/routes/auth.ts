import { zValidator } from '@hono/zod-validator';
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
import { sendConfirmEmail } from '../lib/mail.js';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
});

const emailOnlySchema = z.object({
  email: z.string().trim().email().max(254),
});

export const authRoutes = new Hono();

authRoutes.get('/me', async (c) => {
  const user = await readSessionUser(c);
  if (!user) {
    return c.json({ data: null });
  }
  return c.json({ data: user });
});

authRoutes.post('/register', zValidator('json', credentialsSchema), async (c) => {
  const email = normalizeEmail(c.req.valid('json').email);
  const { password } = c.req.valid('json');

  const [existing] = await db
    .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing?.emailVerifiedAt) {
    return c.json({ error: 'Email already registered' }, 409);
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

  await sendConfirmEmail(email, token);
  return c.json({ data: { email } }, 201);
});

authRoutes.post('/login', zValidator('json', credentialsSchema), async (c) => {
  const email = normalizeEmail(c.req.valid('json').email);
  const { password } = c.req.valid('json');

  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  if (!row.emailVerifiedAt) {
    return c.json({ error: 'Email not confirmed' }, 403);
  }

  const publicUser = toPublicUser(row);
  const token = await createSessionToken(publicUser);
  setSessionCookie(c, token);
  return c.json({ data: publicUser });
});

authRoutes.get('/confirm', async (c) => {
  const token = c.req.query('token')?.trim();
  if (!token) {
    return c.json({ error: 'Missing confirmation token' }, 400);
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
    return c.json({ error: 'Invalid or expired confirmation token' }, 400);
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
  zValidator('json', emailOnlySchema),
  async (c) => {
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
      await sendConfirmEmail(email, token);
    }

    return c.json({ ok: true });
  },
);

authRoutes.post('/logout', async (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});
