import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/index.js';
import {
  phenomena,
  sightingImages,
  sightings,
  users,
} from '../db/schema.js';
import { localeOf, t } from '../lib/i18n.js';
import { updateSightingSchema, uuidSchema } from '../lib/validators.js';
import { validated } from '../lib/validate.js';
import { requireAuth, type AuthEnv } from '../middleware/auth.js';

export const sightingRoutes = new Hono<AuthEnv>();

async function canEditSighting(userId: string, role: string, sightingId: string) {
  const [row] = await db
    .select({ userId: sightings.userId })
    .from(sightings)
    .where(eq(sightings.id, sightingId))
    .limit(1);
  if (!row) return false;
  if (role === 'admin') return true;
  return row.userId === userId;
}

async function replaceSightingImages(sightingId: string, imageUrls: string[]) {
  await db.delete(sightingImages).where(eq(sightingImages.sightingId, sightingId));
  if (!imageUrls.length) return;
  await db.insert(sightingImages).values(
    imageUrls.map((imageUrl, index) => ({
      sightingId,
      imageUrl,
      sortOrder: index,
    })),
  );
}

sightingRoutes.patch(
  '/:id',
  requireAuth,
  validated('json', updateSightingSchema),
  async (c) => {
    const locale = localeOf(c);
    const user = c.get('user');
    const id = uuidSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return c.json({ error: t(locale, 'errors.invalidId') }, 400);
    }

    if (!(await canEditSighting(user.id, user.role, id.data))) {
      return c.json({ error: t(locale, 'errors.forbidden') }, 403);
    }

    const body = c.req.valid('json');
    const { imageUrls, ...fields } = body;

    const [row] = await db
      .update(sightings)
      .set(fields)
      .where(eq(sightings.id, id.data))
      .returning({
        id: sightings.id,
        phenomenonId: sightings.phenomenonId,
        seenAt: sightings.seenAt,
        note: sightings.note,
      });

    if (!row) {
      return c.json({ error: t(locale, 'errors.notFound') }, 404);
    }

    if (imageUrls) {
      await replaceSightingImages(id.data, imageUrls);
    }

    return c.json({ data: row });
  },
);

sightingRoutes.delete('/:id', requireAuth, async (c) => {
  const locale = localeOf(c);
  const user = c.get('user');
  const id = uuidSchema.safeParse(c.req.param('id'));
  if (!id.success) {
    return c.json({ error: t(locale, 'errors.invalidId') }, 400);
  }

  if (!(await canEditSighting(user.id, user.role, id.data))) {
    return c.json({ error: t(locale, 'errors.forbidden') }, 403);
  }

  const [row] = await db
    .delete(sightings)
    .where(eq(sightings.id, id.data))
    .returning({ id: sightings.id });

  if (!row) {
    return c.json({ error: t(locale, 'errors.notFound') }, 404);
  }

  return c.json({ ok: true });
});

sightingRoutes.get('/:id', requireAuth, async (c) => {
  const locale = localeOf(c);
  const user = c.get('user');
  const id = uuidSchema.safeParse(c.req.param('id'));
  if (!id.success) {
    return c.json({ error: t(locale, 'errors.invalidId') }, 400);
  }

  const [row] = await db
    .select({
      id: sightings.id,
      phenomenonId: sightings.phenomenonId,
      userId: sightings.userId,
      seenAt: sightings.seenAt,
      note: sightings.note,
      phenomenonTitle: phenomena.title,
    })
    .from(sightings)
    .innerJoin(phenomena, eq(phenomena.id, sightings.phenomenonId))
    .where(eq(sightings.id, id.data))
    .limit(1);

  if (!row) {
    return c.json({ error: t(locale, 'errors.notFound') }, 404);
  }

  if (user.role !== 'admin' && row.userId !== user.id) {
    return c.json({ error: t(locale, 'errors.forbidden') }, 403);
  }

  const images = await db
    .select({
      imageUrl: sightingImages.imageUrl,
      imageAlt: sightingImages.imageAlt,
      sortOrder: sightingImages.sortOrder,
    })
    .from(sightingImages)
    .where(eq(sightingImages.sightingId, id.data))
    .orderBy(asc(sightingImages.sortOrder));

  return c.json({
    data: {
      id: row.id,
      phenomenonId: row.phenomenonId,
      phenomenonTitle: row.phenomenonTitle,
      seenAt: row.seenAt,
      note: row.note,
      imageUrls: images.map((img) => img.imageUrl),
    },
  });
});
