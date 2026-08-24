import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { phenomena } from '../db/schema.js';
import {
  attachImageUrls,
  attachLocationSummaries,
  getPhenomenonDetail,
  listPhenomenaWithStats,
} from '../lib/phenomena-query.js';
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
    filters.push(
      sql`(${phenomena.category} = ${category.data} OR ${category.data} = ANY(${phenomena.categories}))`,
    );
  }

  const rows = await listPhenomenaWithStats(filters);
  const [withSummaries, withImages] = await Promise.all([
    attachLocationSummaries(rows),
    attachImageUrls(rows),
  ]);
  const data = withSummaries.map((item, index) => ({
    ...item,
    imageUrls: withImages[index]?.imageUrls ?? [],
  }));
  c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
  return c.json({ data });
});

phenomenaRoutes.get('/:id', async (c) => {
  const locale = localeOf(c);
  const id = uuidSchema.safeParse(c.req.param('id'));
  if (!id.success) {
    return c.json({ error: t(locale, 'errors.invalidId') }, 400);
  }

  const row = await getPhenomenonDetail(id.data);
  if (!row) {
    return c.json({ error: t(locale, 'errors.notFound') }, 404);
  }

  return c.json({ data: row });
});
