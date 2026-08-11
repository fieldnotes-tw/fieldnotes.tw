import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { phenomena, users } from '../db/schema.js';
import { createUploadUrl, isAllowedContentType, mediaBucket } from '../lib/media.js';
import {
  categorySchema,
  createPhenomenonSchema,
  statusSchema,
  updatePhenomenonSchema,
  uuidSchema,
} from '../lib/validators.js';
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

adminRoutes.delete('/users/:id', async (c) => {
  const id = uuidSchema.safeParse(c.req.param('id'));
  if (!id.success) {
    return c.json({ error: 'Invalid id' }, 400);
  }

  const actor = c.get('user');
  if (actor.id === id.data) {
    return c.json({ error: 'Cannot delete your own account' }, 400);
  }

  const [target] = await db
    .select({ id: users.id, role: users.role, email: users.email })
    .from(users)
    .where(eq(users.id, id.data))
    .limit(1);

  if (!target) {
    return c.json({ error: 'Not found' }, 404);
  }

  if (target.role === 'admin') {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'));
    if (admins.length <= 1) {
      return c.json({ error: 'Cannot delete the last admin' }, 400);
    }
  }

  await db.delete(users).where(eq(users.id, id.data));
  return c.body(null, 204);
});

const uploadSchema = z.object({
  contentType: z.string().trim().min(1),
});

adminRoutes.post('/uploads', zValidator('json', uploadSchema), async (c) => {
  if (!mediaBucket()) {
    return c.json({ error: 'Media uploads are not configured' }, 501);
  }

  const { contentType } = c.req.valid('json');
  if (!isAllowedContentType(contentType)) {
    return c.json({ error: 'Unsupported content type' }, 400);
  }

  try {
    const upload = await createUploadUrl(contentType);
    return c.json({ data: upload }, 201);
  } catch (err) {
    console.error('Failed to create upload URL', err);
    return c.json({ error: 'Unable to create upload URL' }, 500);
  }
});

adminRoutes.get('/phenomena', async (c) => {
  const categoryParam = c.req.query('category');
  const statusParam = c.req.query('status') ?? 'all';

  const filters: SQL[] = [];

  if (statusParam !== 'all') {
    const status = statusSchema.safeParse(statusParam);
    if (!status.success) {
      return c.json({ error: 'Invalid status filter' }, 400);
    }
    filters.push(eq(phenomena.status, status.data));
  }

  if (categoryParam) {
    const category = categorySchema.safeParse(categoryParam);
    if (!category.success) {
      return c.json({ error: 'Invalid category filter' }, 400);
    }
    filters.push(eq(phenomena.category, category.data));
  }

  const rows = await db
    .select()
    .from(phenomena)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(phenomena.lastNoticedAt), asc(phenomena.title));

  return c.json({ data: rows });
});

adminRoutes.post('/phenomena', zValidator('json', createPhenomenonSchema), async (c) => {
  const body = c.req.valid('json');
  const now = new Date();
  const [row] = await db
    .insert(phenomena)
    .values({
      ...body,
      updatedAt: now,
    })
    .returning();

  return c.json({ data: row }, 201);
});

adminRoutes.patch(
  '/phenomena/:id',
  zValidator('json', updatePhenomenonSchema),
  async (c) => {
    const id = uuidSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return c.json({ error: 'Invalid id' }, 400);
    }

    const body = c.req.valid('json');
    const [row] = await db
      .update(phenomena)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(phenomena.id, id.data))
      .returning();

    if (!row) {
      return c.json({ error: 'Not found' }, 404);
    }

    return c.json({ data: row });
  },
);

adminRoutes.delete('/phenomena/:id', async (c) => {
  const id = uuidSchema.safeParse(c.req.param('id'));
  if (!id.success) {
    return c.json({ error: 'Invalid id' }, 400);
  }

  const [row] = await db
    .delete(phenomena)
    .where(eq(phenomena.id, id.data))
    .returning({ id: phenomena.id });

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.body(null, 204);
});
