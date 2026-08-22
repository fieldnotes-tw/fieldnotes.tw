import { asc, eq, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { PHENOMENON_CATEGORIES } from '../db/schema.js';
import { resolveMemberAvatarCategory } from './member-avatar.js';

type PhenomenonCategory = (typeof PHENOMENON_CATEGORIES)[number];

export type ContributorProfile = {
  id: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  avatarCategory: PhenomenonCategory;
};

export async function loadFeaturedContributors(): Promise<ContributorProfile[]> {
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
    })
    .from(users)
    .where(or(
      sql`lower(${users.displayName}) = 'chao'`,
      eq(users.displayName, '陳恩'),
    ))
    .orderBy(
      sql`case when ${users.displayName} = '陳恩' then 0 when lower(${users.displayName}) = 'chao' then 1 else 2 end`,
      asc(users.displayName),
    );

  const profiles = await Promise.all(rows.map(async (row) => ({
    id: row.id,
    name: row.displayName?.trim() || 'Observer',
    avatarUrl: row.avatarUrl ?? null,
    bio: row.bio?.trim() || null,
    avatarCategory: await resolveMemberAvatarCategory(row.id, row.displayName),
  })));
  return profiles;
}
