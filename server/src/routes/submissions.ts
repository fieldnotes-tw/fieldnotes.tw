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
  normalizeFormImages,
  uuidSchema,
} from '../lib/validators.js';
import { validated } from '../lib/validate.js';
import { getPhenomenonDetail } from '../lib/phenomena-query.js';
import { createPrimarySpotForPhenomenon, resolveSightingSpotId } from '../lib/spots.js';
import { resolveCategoryFields } from '../lib/categories.js';
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

async function replacePhenomenonImages(
  phenomenonId: string,
  images: { url: string; caption?: string | null }[],
) {
  await db.delete(phenomenonImages).where(eq(phenomenonImages.phenomenonId, phenomenonId));
  if (!images.length) return;
  await db.insert(phenomenonImages).values(
    images.map((image, index) => ({
      phenomenonId,
      imageUrl: image.url,
      imageAlt: image.caption ?? null,
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
  const images = normalizeFormImages(body);
  const imageUrl = images[0]?.url;
  const categoryFields = resolveCategoryFields(body);

  const [row] = await db
    .insert(phenomena)
    .values({
      title: body.title,
      description: body.description,
      notes: body.extra || null,
      findingHint: body.findingHint || null,
      status: body.status ?? 'active',
      category: categoryFields.category,
      categories: categoryFields.categories,
      location: body.location,
      lat: body.lat,
      lng: body.lng,
      imageUrl,
      imageAlt: images[0]?.caption ?? body.title,
      observerName,
      userId: user.id,
      lastNoticedAt: body.seenAt ?? now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: phenomena.id });

  if (images.length) {
    await replacePhenomenonImages(row.id, images);
  }

  await createPrimarySpotForPhenomenon(row.id, {
    location: body.location,
    lat: body.lat,
    lng: body.lng,
    findingHint: body.findingHint || null,
  });

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
    const { imageUrls, images, category, categories, ...fields } = body;
    const categoryFields = resolveCategoryFields({ category, categories });
    const now = new Date();
    const normalizedImages = images || imageUrls
      ? normalizeFormImages({ images, imageUrls })
      : null;

    const [row] = await db
      .update(phenomena)
      .set({
        ...fields,
        category: categoryFields.category,
        categories: categoryFields.categories,
        ...(normalizedImages?.length ? {
          imageUrl: normalizedImages[0].url,
          imageAlt: normalizedImages[0].caption ?? fields.title ?? undefined,
        } : {}),
        updatedAt: now,
      })
      .where(eq(phenomena.id, id.data))
      .returning({ id: phenomena.id });

    if (!row) {
      return c.json({ error: t(locale, 'errors.notFound') }, 404);
    }

    if (normalizedImages) {
      await replacePhenomenonImages(row.id, normalizedImages);
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
    const images = normalizeFormImages(body);
    const observerName = await observerNameForUser(user.id);
    let spotId: string | null = null;
    if (!body.commentOnly) {
      try {
        spotId = await resolveSightingSpotId(phenomenonId.data, {
          spotId: body.spotId,
          otherSpot: body.otherSpot,
        });
      } catch {
        return c.json({ error: t(locale, 'errors.invalidRequest') }, 400);
      }
    }

    const [sighting] = await db
      .insert(sightings)
      .values({
        phenomenonId: phenomenonId.data,
        spotId,
        userId: user.id,
        observerName,
        seenAt: body.seenAt ?? new Date(),
        note: body.note,
      })
      .returning({ id: sightings.id });

    if (images.length) {
      await db.insert(sightingImages).values(
        images.map((image, index) => ({
          sightingId: sighting.id,
          imageUrl: image.url,
          imageAlt: image.caption ?? null,
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
    const upload = await saveLocalUpload(filename, body, contentType);
    return c.json({ data: upload }, 201);
  } catch (err) {
    console.error('Submission local media upload failed', err);
    return c.json({ error: t(locale, 'errors.uploadUrlFailed') }, 500);
  }
});
