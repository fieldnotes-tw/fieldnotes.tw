import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/index.js';
import { phenomena } from '../db/schema.js';
import {
  categorySchema,
  createPhenomenonSchema,
  statusSchema,
  updatePhenomenonSchema,
  uuidSchema,
} from '../lib/validators.js';

export const phenomenaRoutes = new Hono();

phenomenaRoutes.get('/', async (c) => {
  const categoryParam = c.req.query('category');
  const statusParam = c.req.query('status') ?? 'active';

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

phenomenaRoutes.get('/:id', async (c) => {
  const id = uuidSchema.safeParse(c.req.param('id'));
  if (!id.success) {
    return c.json({ error: 'Invalid id' }, 400);
  }

  const [row] = await db
    .select()
    .from(phenomena)
    .where(eq(phenomena.id, id.data))
    .limit(1);

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({ data: row });
});

phenomenaRoutes.post('/', zValidator('json', createPhenomenonSchema), async (c) => {
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

phenomenaRoutes.patch(
  '/:id',
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

phenomenaRoutes.delete('/:id', async (c) => {
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
