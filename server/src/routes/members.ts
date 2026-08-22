import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/index.js';
import { phenomena, sightings, users } from '../db/schema.js';
import { localeOf, t } from '../lib/i18n.js';
import { resolveMemberAvatarCategory } from '../lib/member-avatar.js';
import { uuidSchema } from '../lib/validators.js';
import type { LocaleEnv } from '../middleware/locale.js';

export const memberRoutes = new Hono<LocaleEnv>();

memberRoutes.get('/:id', async (c) => {
  const locale = localeOf(c);
  const id = uuidSchema.safeParse(c.req.param('id'));
  if (!id.success) {
    return c.json({ error: t(locale, 'errors.invalidId') }, 400);
  }

  const [user] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
    })
    .from(users)
    .where(eq(users.id, id.data))
    .limit(1);

  if (!user) {
    return c.json({ error: t(locale, 'errors.notFound') }, 404);
  }

  const recentSightings = await db
    .select({
      id: sightings.id,
      phenomenonId: sightings.phenomenonId,
      phenomenonTitle: phenomena.title,
      seenAt: sightings.seenAt,
      note: sightings.note,
    })
    .from(sightings)
    .innerJoin(phenomena, eq(phenomena.id, sightings.phenomenonId))
    .where(eq(sightings.userId, id.data))
    .orderBy(desc(sightings.seenAt))
    .limit(12);

  const avatarCategory = await resolveMemberAvatarCategory(user.id, user.displayName);

  return c.json({
    data: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      avatarCategory,
      recentSightings,
    },
  });
});
