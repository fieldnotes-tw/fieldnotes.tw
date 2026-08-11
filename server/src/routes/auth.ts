import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import {
  clearSessionCookie,
  createSessionToken,
  hashPassword,
  readSessionUser,
  setSessionCookie,
  toPublicUser,
  verifyPassword,
} from '../lib/auth.js';

const credentialsSchema = z.object({
  username: z.string().trim().min(2).max(40),
  password: z.string().min(8).max(200),
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
  const { username, password } = c.req.valid('json');

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existing) {
    return c.json({ error: 'Username already taken' }, 409);
  }

  const passwordHash = await hashPassword(password);
  const [row] = await db
    .insert(users)
    .values({
      username,
      passwordHash,
      role: 'user',
    })
    .returning({
      id: users.id,
      username: users.username,
      role: users.role,
    });

  const publicUser = toPublicUser(row);
  const token = await createSessionToken(publicUser);
  setSessionCookie(c, token);
  return c.json({ data: publicUser }, 201);
});

authRoutes.post('/login', zValidator('json', credentialsSchema), async (c) => {
  const { username, password } = c.req.valid('json');

  const [row] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    return c.json({ error: 'Invalid username or password' }, 401);
  }

  const publicUser = toPublicUser(row);
  const token = await createSessionToken(publicUser);
  setSessionCookie(c, token);
  return c.json({ data: publicUser });
});

authRoutes.post('/logout', async (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});
