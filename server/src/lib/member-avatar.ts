import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { phenomena, sightings } from '../db/schema.js';
import { PHENOMENON_CATEGORIES } from '../db/schema.js';

type PhenomenonCategory = (typeof PHENOMENON_CATEGORIES)[number];

const FEATURED_AVATAR_CATEGORIES: Record<string, PhenomenonCategory> = {
  '陳恩': 'workshop',
  chao: 'workshop',
};

export async function resolveMemberAvatarCategory(
  userId: string,
  displayName: string | null,
): Promise<PhenomenonCategory> {
  if (displayName === '陳恩') return FEATURED_AVATAR_CATEGORIES['陳恩'];
  if (displayName?.trim().toLowerCase() === 'chao') return FEATURED_AVATAR_CATEGORIES.chao;

  const [row] = await db
    .select({ category: phenomena.category })
    .from(sightings)
    .innerJoin(phenomena, eq(phenomena.id, sightings.phenomenonId))
    .where(eq(sightings.userId, userId))
    .orderBy(desc(sightings.seenAt))
    .limit(1);

  return row?.category ?? 'plant';
}
