import { asc, inArray, sql } from 'drizzle-orm';
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
  const contributorIds = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .leftJoin(phenomena, sql`${phenomena.userId} = ${users.id}`)
    .leftJoin(sightings, sql`${sightings.userId} = ${users.id}`)
    .where(
      sql`trim(coalesce(${users.displayName}, '')) <> '' AND (${phenomena.id} IS NOT NULL OR ${sightings.id} IS NOT NULL)`,
    );

  const featuredEmails = featuredContributorEmails();
  const featuredRows = featuredEmails.length
    ? await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.email, featuredEmails))
    : [];

  const idSet = new Set<string>();
  for (const row of featuredRows) idSet.add(row.id);
  for (const row of contributorIds) idSet.add(row.id);

  if (!idSet.size) return [];

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      email: users.email,
    })
    .from(users)
    .where(inArray(users.id, [...idSet]))
    .orderBy(asc(users.displayName));

  const featuredOrder = new Map(featuredEmails.map((email, index) => [email, index]));
  rows.sort((a, b) => {
    const aFeatured = featuredOrder.has(a.email.toLowerCase()) ? featuredOrder.get(a.email.toLowerCase())! : 99;
    const bFeatured = featuredOrder.has(b.email.toLowerCase()) ? featuredOrder.get(b.email.toLowerCase())! : 99;
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
