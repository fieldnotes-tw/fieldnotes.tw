import { and, asc, desc, eq, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { phenomena, users } from '../db/schema.js';
import { localeOf, t } from '../lib/i18n.js';
import {
  createUploadUrl,
  isAllowedContentType,
  isSafeMediaFilename,
  mediaBackend,
  saveLocalUpload,
} from '../lib/media.js';
import { validated } from '../lib/validate.js';
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
  const locale = localeOf(c);
  const id = uuidSchema.safeParse(c.req.param('id'));
  if (!id.success) {
    return c.json({ error: t(locale, 'errors.invalidId') }, 400);
  }

  const actor = c.get('user');
  if (actor.id === id.data) {
    return c.json({ error: t(locale, 'errors.cannotDeleteSelf') }, 400);
  }

  const [target] = await db
    .select({ id: users.id, role: users.role, email: users.email })
    .from(users)
    .where(eq(users.id, id.data))
    .limit(1);

  if (!target) {
    return c.json({ error: t(locale, 'errors.notFound') }, 404);
  }

  if (target.role === 'admin') {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'));
    if (admins.length <= 1) {
      return c.json({ error: t(locale, 'errors.cannotDeleteLastAdmin') }, 400);
    }
  }

  await db.delete(users).where(eq(users.id, id.data));
  return c.body(null, 204);
});

const uploadSchema = z.object({
  contentType: z.string().trim().min(1),
});

adminRoutes.post('/uploads', validated('json', uploadSchema), async (c) => {
  const locale = localeOf(c);
  const { contentType } = c.req.valid('json');
  if (!isAllowedContentType(contentType)) {
    return c.json({ error: t(locale, 'errors.unsupportedContentType') }, 400);
  }

  try {
    const upload = await createUploadUrl(contentType);
    return c.json({ data: upload }, 201);
  } catch (err) {
    console.error('Failed to create upload URL', err);
    return c.json({ error: t(locale, 'errors.uploadUrlFailed') }, 500);
  }
});

// Local-dev PUT target when MEDIA_BUCKET is unset (same flow as S3 presign).
adminRoutes.put('/uploads/local/:filename', async (c) => {
  const locale = localeOf(c);
  if (mediaBackend() !== 'local') {
    return c.json({ error: t(locale, 'errors.mediaNotConfigured') }, 501);
  }

  const filename = c.req.param('filename');
  if (!isSafeMediaFilename(filename)) {
    return c.json({ error: t(locale, 'errors.invalidRequest') }, 400);
  }

  const contentType = c.req.header('content-type') || '';
  if (!isAllowedContentType(contentType)) {
    return c.json({ error: t(locale, 'errors.unsupportedContentType') }, 400);
  }

  try {
    const body = await c.req.arrayBuffer();
    if (!body.byteLength) {
      return c.json({ error: t(locale, 'errors.invalidRequest') }, 400);
    }
    const publicPath = await saveLocalUpload(filename, body, contentType);
    return c.json({ data: { publicPath } }, 201);
  } catch (err) {
    console.error('Local media upload failed', err);
    return c.json({ error: t(locale, 'errors.uploadUrlFailed') }, 500);
  }
});

adminRoutes.get('/phenomena', async (c) => {
  const locale = localeOf(c);
  const categoryParam = c.req.query('category');
  const statusParam = c.req.query('status') ?? 'all';

  const filters: SQL[] = [];

  if (statusParam !== 'all') {
    const status = statusSchema.safeParse(statusParam);
    if (!status.success) {
      return c.json({ error: t(locale, 'errors.invalidStatusFilter') }, 400);
    }
    filters.push(eq(phenomena.status, status.data));
  }

  if (categoryParam) {
    const category = categorySchema.safeParse(categoryParam);
    if (!category.success) {
      return c.json({ error: t(locale, 'errors.invalidCategoryFilter') }, 400);
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

adminRoutes.post('/phenomena', validated('json', createPhenomenonSchema), async (c) => {
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
  validated('json', updatePhenomenonSchema),
  async (c) => {
    const locale = localeOf(c);
    const id = uuidSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return c.json({ error: t(locale, 'errors.invalidId') }, 400);
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
      return c.json({ error: t(locale, 'errors.notFound') }, 404);
    }

    return c.json({ data: row });
  },
);

adminRoutes.delete('/phenomena/:id', async (c) => {
  const locale = localeOf(c);
  const id = uuidSchema.safeParse(c.req.param('id'));
  if (!id.success) {
    return c.json({ error: t(locale, 'errors.invalidId') }, 400);
  }

  const [row] = await db
    .delete(phenomena)
    .where(eq(phenomena.id, id.data))
    .returning({ id: phenomena.id });

  if (!row) {
    return c.json({ error: t(locale, 'errors.notFound') }, 404);
  }

  return c.body(null, 204);
});
