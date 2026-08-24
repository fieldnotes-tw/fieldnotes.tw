import { and, asc, eq, exists, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { phenomena, sightings, users } from '../db/schema.js';
import type { PHENOMENON_CATEGORIES } from '../db/schema.js';
import { resolveMemberAvatarCategory } from './member-avatar.js';

type PhenomenonCategory = (typeof PHENOMENON_CATEGORIES)[number];

export type ContributorProfile = {
  id: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  avatarCategory: PhenomenonCategory;
};

function featuredContributorEmails(): string[] {
  return [
    process.env.DEMO_CHENEN_EMAIL ?? 'chenen@fieldnotes.tw',
    process.env.DEMO_MEMBER_EMAIL,
  ]
    .map((email) => email?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email));
}

export async function loadFeaturedContributors(): Promise<ContributorProfile[]> {
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      email: users.email,
    })
    .from(users)
    .where(
      and(
        sql`trim(coalesce(${users.displayName}, '')) <> ''`,
        or(
          exists(
            db.select({ one: sql`1` }).from(phenomena).where(eq(phenomena.userId, users.id)),
          ),
          exists(
            db.select({ one: sql`1` }).from(sightings).where(eq(sightings.userId, users.id)),
          ),
        ),
      ),
    )
    .orderBy(asc(users.displayName));

  if (!rows.length) return [];

  const featuredEmails = featuredContributorEmails();
  const featuredOrder = new Map(featuredEmails.map((email, index) => [email, index]));
  rows.sort((a, b) => {
    const aFeatured = featuredOrder.has(a.email.toLowerCase())
      ? featuredOrder.get(a.email.toLowerCase())!
      : 99;
    const bFeatured = featuredOrder.has(b.email.toLowerCase())
      ? featuredOrder.get(b.email.toLowerCase())!
      : 99;
    if (aFeatured !== bFeatured) return aFeatured - bFeatured;
    return (a.displayName ?? '').localeCompare(b.displayName ?? '', 'zh-Hant');
  });

  return Promise.all(rows.map(async (row) => ({
    id: row.id,
    name: row.displayName?.trim() || 'Observer',
    avatarUrl: row.avatarUrl ?? null,
    bio: row.bio?.trim() || null,
    avatarCategory: await resolveMemberAvatarCategory(row.id, row.displayName),
  })));
}
