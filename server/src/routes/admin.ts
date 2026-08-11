import { desc } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { requireAdmin, type AuthEnv } from '../middleware/auth.js';

export const adminRoutes = new Hono<AuthEnv>();

adminRoutes.use('*', requireAdmin);

adminRoutes.get('/me', async (c) => {
  return c.json({ data: c.get('user') });
});

adminRoutes.get('/users', async (c) => {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return c.json({ data: rows });
});
