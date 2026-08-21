import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { phenomena, phenomenonImages, users } from '../db/schema.js';
import { localeOf, t } from '../lib/i18n.js';
import {
  createUploadUrl,
  isAllowedContentType,
  isSafeMediaFilename,
  mediaBackend,
  saveLocalUpload,
} from '../lib/media.js';
import {
  createSightingSchema,
  ownerPhenomenonPatchSchema,
  submissionSchema,
  updatePhenomenonSchema,
  uuidSchema,
} from '../lib/validators.js';
import { validated } from '../lib/validate.js';
import { getPhenomenonDetail } from '../lib/phenomena-query.js';
import { requireAuth, type AuthEnv } from '../middleware/auth.js';
import { sightingImages, sightings } from '../db/schema.js';

export const submissionRoutes = new Hono<AuthEnv>();

submissionRoutes.use('*', requireAuth);

const uploadSchema = z.object({
  contentType: z.string().trim().min(1),
});

async function observerNameForUser(userId: string) {
  const [row] = await db
    .select({ displayName: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return row.displayName || row.email.split('@')[0] || row.email;
}

async function canEditPhenomenon(userId: string, role: string, phenomenonId: string) {
  const [row] = await db
    .select({ userId: phenomena.userId })
    .from(phenomena)
    .where(eq(phenomena.id, phenomenonId))
    .limit(1);
  if (!row) return false;
  if (role === 'admin') return true;
  return row.userId === userId;
}

async function replacePhenomenonImages(phenomenonId: string, imageUrls: string[], imageAlt?: string) {
  await db.delete(phenomenonImages).where(eq(phenomenonImages.phenomenonId, phenomenonId));
  if (!imageUrls.length) return;
  await db.insert(phenomenonImages).values(
    imageUrls.map((imageUrl, index) => ({
      phenomenonId,
      imageUrl,
      imageAlt: index === 0 ? imageAlt ?? null : null,
      sortOrder: index,
    })),
  );
}

submissionRoutes.post('/', validated('json', submissionSchema), async (c) => {
  const locale = localeOf(c);
  const user = c.get('user');
  const body = c.req.valid('json');
  const now = new Date();
  const observerName = await observerNameForUser(user.id);
  const imageUrl = body.imageUrls?.[0];

  const [row] = await db
    .insert(phenomena)
    .values({
      title: body.title,
      description: body.description,
      notes: body.extra || null,
      findingHint: body.findingHint || null,
      status: body.status,
      category: body.category ?? 'plant',
      location: body.location,
      lat: body.lat,
      lng: body.lng,
      imageUrl,
      imageAlt: body.title,
      observerName,
      userId: user.id,
      lastNoticedAt: body.seenAt ?? now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: phenomena.id });

  if (body.imageUrls?.length) {
    await replacePhenomenonImages(row.id, body.imageUrls, body.title);
  }

  const detail = await getPhenomenonDetail(row.id);
  return c.json({ data: detail }, 201);
});

submissionRoutes.get('/phenomena/:id', async (c) => {
  const locale = localeOf(c);
  const user = c.get('user');
  const id = uuidSchema.safeParse(c.req.param('id'));
  if (!id.success) {
    return c.json({ error: t(locale, 'errors.invalidId') }, 400);
  }

  if (!(await canEditPhenomenon(user.id, user.role, id.data))) {
    return c.json({ error: t(locale, 'errors.forbidden') }, 403);
  }

  const detail = await getPhenomenonDetail(id.data);
  if (!detail) {
    return c.json({ error: t(locale, 'errors.notFound') }, 404);
  }

  return c.json({ data: detail });
});

submissionRoutes.patch(
  '/phenomena/:id',
  validated('json', ownerPhenomenonPatchSchema),
  async (c) => {
    const locale = localeOf(c);
    const user = c.get('user');
    const id = uuidSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return c.json({ error: t(locale, 'errors.invalidId') }, 400);
    }

    if (!(await canEditPhenomenon(user.id, user.role, id.data))) {
      return c.json({ error: t(locale, 'errors.forbidden') }, 403);
    }

    const body = c.req.valid('json');
    const { imageUrls, ...fields } = body;
    const now = new Date();

    const [row] = await db
      .update(phenomena)
      .set({
        ...fields,
        ...(imageUrls?.length ? { imageUrl: imageUrls[0] } : {}),
        updatedAt: now,
      })
      .where(eq(phenomena.id, id.data))
      .returning({ id: phenomena.id });

    if (!row) {
      return c.json({ error: t(locale, 'errors.notFound') }, 404);
    }

    if (imageUrls) {
      await replacePhenomenonImages(row.id, imageUrls, fields.title);
    }

    const detail = await getPhenomenonDetail(row.id);
    return c.json({ data: detail });
  },
);

submissionRoutes.delete('/phenomena/:id', async (c) => {
  const locale = localeOf(c);
  const user = c.get('user');
  const id = uuidSchema.safeParse(c.req.param('id'));
  if (!id.success) {
    return c.json({ error: t(locale, 'errors.invalidId') }, 400);
  }

  if (!(await canEditPhenomenon(user.id, user.role, id.data))) {
    return c.json({ error: t(locale, 'errors.forbidden') }, 403);
  }

  const [row] = await db
    .delete(phenomena)
    .where(eq(phenomena.id, id.data))
    .returning({ id: phenomena.id });

  if (!row) {
    return c.json({ error: t(locale, 'errors.notFound') }, 404);
  }

  return c.json({ ok: true });
});

submissionRoutes.post(
  '/phenomena/:id/sightings',
  validated('json', createSightingSchema),
  async (c) => {
    const locale = localeOf(c);
    const user = c.get('user');
    const phenomenonId = uuidSchema.safeParse(c.req.param('id'));
    if (!phenomenonId.success) {
      return c.json({ error: t(locale, 'errors.invalidId') }, 400);
    }

    const [exists] = await db
      .select({ id: phenomena.id })
      .from(phenomena)
      .where(eq(phenomena.id, phenomenonId.data))
      .limit(1);
    if (!exists) {
      return c.json({ error: t(locale, 'errors.notFound') }, 404);
    }

    const body = c.req.valid('json');
    const observerName = await observerNameForUser(user.id);

    const [sighting] = await db
      .insert(sightings)
      .values({
        phenomenonId: phenomenonId.data,
        userId: user.id,
        observerName,
        seenAt: body.seenAt ?? new Date(),
        note: body.note,
      })
      .returning({ id: sightings.id });

    if (body.imageUrls?.length) {
      await db.insert(sightingImages).values(
        body.imageUrls.map((imageUrl, index) => ({
          sightingId: sighting.id,
          imageUrl,
          sortOrder: index,
        })),
      );
    }

    const detail = await getPhenomenonDetail(phenomenonId.data);
    return c.json({ data: detail }, 201);
  },
);

submissionRoutes.post('/uploads', validated('json', uploadSchema), async (c) => {
  const locale = localeOf(c);
  const { contentType } = c.req.valid('json');
  if (!isAllowedContentType(contentType)) {
    return c.json({ error: t(locale, 'errors.unsupportedContentType') }, 400);
  }

  try {
    const upload = await createUploadUrl(contentType, {
      localUploadBase: '/api/submissions/uploads/local',
    });
    return c.json({ data: upload }, 201);
  } catch (err) {
    console.error('Failed to create submission upload URL', err);
    return c.json({ error: t(locale, 'errors.uploadUrlFailed') }, 500);
  }
});

submissionRoutes.put('/uploads/local/:filename', async (c) => {
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
    console.error('Submission local media upload failed', err);
    return c.json({ error: t(locale, 'errors.uploadUrlFailed') }, 500);
  }
});
