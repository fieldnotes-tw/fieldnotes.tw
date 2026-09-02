import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/index.js';
import {
  phenomena,
  phenomenonTracks,
  sightings,
  users,
} from '../db/schema.js';
import { clearSessionCookie, toPublicUser } from '../lib/auth.js';
import { listPhenomenaWithStats } from '../lib/phenomena-query.js';
import { localeOf, t } from '../lib/i18n.js';
import { profileUpdateSchema, uuidSchema } from '../lib/validators.js';
import { validated } from '../lib/validate.js';
import { requireAuth, type AuthEnv } from '../middleware/auth.js';

export const meRoutes = new Hono<AuthEnv>();

meRoutes.use('*', requireAuth);

meRoutes.get('/', async (c) => {
  const user = c.get('user');
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!row) {
    return c.json({ error: t(localeOf(c), 'errors.notFound') }, 404);
  }
  return c.json({ data: toPublicUser(row) });
});

meRoutes.patch('/', validated('json', profileUpdateSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const now = new Date();

  const [row] = await db
    .update(users)
    .set({ ...body, updatedAt: now })
    .where(eq(users.id, user.id))
    .returning({
      id: users.id,
      email: users.email,
      role: users.role,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
    });

  if (body.displayName !== undefined) {
    const displayName = body.displayName.trim();
    await db
      .update(phenomena)
      .set({ observerName: displayName, updatedAt: now })
      .where(eq(phenomena.userId, user.id));
    await db
      .update(sightings)
      .set({ observerName: displayName })
      .where(eq(sightings.userId, user.id));
  }

  return c.json({ data: toPublicUser(row) });
});

meRoutes.delete('/', async (c) => {
  const locale = localeOf(c);
  const user = c.get('user');

  if (user.role === 'admin') {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'));
    if (admins.length <= 1) {
      return c.json({ error: t(locale, 'errors.cannotDeleteLastAdmin') }, 400);
    }
  }

  await db.delete(users).where(eq(users.id, user.id));
  clearSessionCookie(c);
  return c.body(null, 204);
});

meRoutes.get('/phenomena', async (c) => {
  const user = c.get('user');
  const rows = await listPhenomenaWithStats([eq(phenomena.userId, user.id)]);
  return c.json({ data: rows });
});

meRoutes.get('/tracks', async (c) => {
  const user = c.get('user');
  const trackRows = await db
    .select({ phenomenonId: phenomenonTracks.phenomenonId })
    .from(phenomenonTracks)
    .where(eq(phenomenonTracks.userId, user.id))
    .orderBy(desc(phenomenonTracks.createdAt));

  const ids = trackRows.map((row) => row.phenomenonId);
  if (!ids.length) {
    return c.json({ data: [] });
  }

  const rows = await listPhenomenaWithStats([]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const data = ids.map((id) => byId.get(id)).filter(Boolean);
  return c.json({ data });
});

meRoutes.get('/track-ids', async (c) => {
  const user = c.get('user');
  const trackRows = await db
    .select({ phenomenonId: phenomenonTracks.phenomenonId })
    .from(phenomenonTracks)
    .where(eq(phenomenonTracks.userId, user.id));
  return c.json({ data: trackRows.map((row) => row.phenomenonId) });
});

meRoutes.post('/tracks/:phenomenonId', async (c) => {
  const locale = localeOf(c);
  const user = c.get('user');
  const phenomenonId = uuidSchema.safeParse(c.req.param('phenomenonId'));
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

  await db
    .insert(phenomenonTracks)
    .values({ userId: user.id, phenomenonId: phenomenonId.data })
    .onConflictDoNothing();

  return c.json({ ok: true }, 201);
});

meRoutes.delete('/tracks/:phenomenonId', async (c) => {
  const locale = localeOf(c);
  const user = c.get('user');
  const phenomenonId = uuidSchema.safeParse(c.req.param('phenomenonId'));
  if (!phenomenonId.success) {
    return c.json({ error: t(locale, 'errors.invalidId') }, 400);
  }

  await db
    .delete(phenomenonTracks)
    .where(
      and(
        eq(phenomenonTracks.userId, user.id),
        eq(phenomenonTracks.phenomenonId, phenomenonId.data),
      ),
    );

  return c.json({ ok: true });
});

meRoutes.get('/sightings', async (c) => {
  const user = c.get('user');
  const rows = await db
    .select({
      id: sightings.id,
      phenomenonId: sightings.phenomenonId,
      seenAt: sightings.seenAt,
      note: sightings.note,
      phenomenonTitle: phenomena.title,
    })
    .from(sightings)
    .innerJoin(phenomena, eq(phenomena.id, sightings.phenomenonId))
    .where(eq(sightings.userId, user.id))
    .orderBy(desc(sightings.seenAt));

  return c.json({ data: rows });
});
