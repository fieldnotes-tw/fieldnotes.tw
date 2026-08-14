import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/index.js';
import { phenomena } from '../db/schema.js';
import { localeOf, t } from '../lib/i18n.js';
import {
  categorySchema,
  statusSchema,
  uuidSchema,
} from '../lib/validators.js';
import type { LocaleEnv } from '../middleware/locale.js';

/** Homepage feed: live cards only (exclude ended). */
const FEED_STATUSES = ['active', 'upcoming', 'ending'] as const;

export const phenomenaRoutes = new Hono<LocaleEnv>();

phenomenaRoutes.get('/', async (c) => {
  const locale = localeOf(c);
  const categoryParam = c.req.query('category');
  const statusParam = c.req.query('status');

  const filters: SQL[] = [];

  if (!statusParam) {
    filters.push(inArray(phenomena.status, [...FEED_STATUSES]));
  } else if (statusParam !== 'all') {
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

phenomenaRoutes.get('/:id', async (c) => {
  const locale = localeOf(c);
  const id = uuidSchema.safeParse(c.req.param('id'));
  if (!id.success) {
    return c.json({ error: t(locale, 'errors.invalidId') }, 400);
  }

  const [row] = await db
    .select()
    .from(phenomena)
    .where(eq(phenomena.id, id.data))
    .limit(1);

  if (!row) {
    return c.json({ error: t(locale, 'errors.notFound') }, 404);
  }

  return c.json({ data: row });
});
