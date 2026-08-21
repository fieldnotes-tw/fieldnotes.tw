import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/index.js';
import {
  phenomena,
  phenomenonImages,
  sightingImages,
  sightings,
  users,
  type Phenomenon,
} from '../db/schema.js';

const creator = alias(users, 'creator');

export type PhenomenonListItem = Phenomenon & {
  sightingCount: number;
  observerCount: number;
  lastSeenAt: Date | null;
  creatorName: string | null;
  creatorAvatarUrl: string | null;
  imageUrls?: string[];
};

export type SightingWithImages = {
  id: string;
  phenomenonId: string;
  userId: string | null;
  observerName: string | null;
  observerAvatarUrl: string | null;
  seenAt: Date;
  condition: string | null;
  note: string | null;
  images: { imageUrl: string; imageAlt: string | null }[];
};

export type PhenomenonDetail = PhenomenonListItem & {
  imageUrls: string[];
  recentSightings: SightingWithImages[];
  observers: { userId: string | null; name: string; avatarUrl: string | null }[];
};

function mapListRow(row: {
  id: string;
  status: Phenomenon['status'];
  category: Phenomenon['category'];
  title: string;
  description: string;
  location: string | null;
  notes: string | null;
  findingHint?: string | null;
  lat: number | null;
  lng: number | null;
  imageUrl: string | null;
  imageAlt: string | null;
  observerName: string | null;
  metaLabel: string | null;
  lastNoticedAt: Date | null;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
  sightingCount: number;
  observerCount: number;
  lastSeenAt: Date | null;
  creatorName: string | null;
  creatorAvatarUrl: string | null;
}): PhenomenonListItem {
  const observerCount = row.observerCount || (row.observerName ? 1 : 0);
  return {
    id: row.id,
    status: row.status,
    category: row.category,
    title: row.title,
    description: row.description,
    location: row.location,
    notes: row.notes,
    findingHint: row.findingHint ?? null,
    lat: row.lat,
    lng: row.lng,
    imageUrl: row.imageUrl,
    imageAlt: row.imageAlt,
    observerName: row.observerName,
    metaLabel: row.metaLabel,
    lastNoticedAt: row.lastNoticedAt,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sightingCount: row.sightingCount,
    observerCount,
    lastSeenAt: row.lastSeenAt ?? row.lastNoticedAt,
    creatorName: row.creatorName,
    creatorAvatarUrl: row.creatorAvatarUrl,
  };
}

export async function listPhenomenaWithStats(filters: SQL[] = []) {
  const rows = await db
    .select({
      id: phenomena.id,
      status: phenomena.status,
      category: phenomena.category,
      title: phenomena.title,
      description: phenomena.description,
      location: phenomena.location,
      notes: phenomena.notes,
      findingHint: phenomena.findingHint,
      lat: phenomena.lat,
      lng: phenomena.lng,
      imageUrl: phenomena.imageUrl,
      imageAlt: phenomena.imageAlt,
      observerName: phenomena.observerName,
      metaLabel: phenomena.metaLabel,
      lastNoticedAt: phenomena.lastNoticedAt,
      userId: phenomena.userId,
      createdAt: phenomena.createdAt,
      updatedAt: phenomena.updatedAt,
      creatorName: sql<string | null>`max(coalesce(${creator.displayName}, ${phenomena.observerName}))`,
      creatorAvatarUrl: sql<string | null>`max(${creator.avatarUrl})`,
      sightingCount: sql<number>`coalesce(count(distinct ${sightings.id}), 0)::int`,
      observerCount: sql<number>`coalesce(count(distinct coalesce(${sightings.userId}::text, ${sightings.observerName})), 0)::int`,
      lastSeenAt: sql<Date | null>`max(${sightings.seenAt})`,
    })
    .from(phenomena)
    .leftJoin(creator, eq(creator.id, phenomena.userId))
    .leftJoin(sightings, eq(sightings.phenomenonId, phenomena.id))
    .where(filters.length ? and(...filters) : undefined)
    .groupBy(phenomena.id)
    .orderBy(
      desc(phenomena.createdAt),
      desc(sql`coalesce(max(${sightings.seenAt}), ${phenomena.lastNoticedAt})`),
      asc(phenomena.title),
    );

  return rows.map(mapListRow);
}

function mergeUniqueImageUrls(primary: string[], extra: string[]) {
  const merged = [...primary];
  const seen = new Set(primary);
  for (const url of extra) {
    if (!url || seen.has(url)) continue;
    merged.push(url);
    seen.add(url);
  }
  return merged;
}

export async function attachImageUrls<T extends { id: string; imageUrl: string | null }>(
  items: T[],
): Promise<(T & { imageUrls: string[] })[]> {
  const ids = items.map((item) => item.id);
  if (!ids.length) {
    return items.map((item) => ({
      ...item,
      imageUrls: item.imageUrl ? [item.imageUrl] : [],
    }));
  }

  const phenomenonImageRows = await db
    .select({
      phenomenonId: phenomenonImages.phenomenonId,
      imageUrl: phenomenonImages.imageUrl,
      sortOrder: phenomenonImages.sortOrder,
    })
    .from(phenomenonImages)
    .where(inArray(phenomenonImages.phenomenonId, ids))
    .orderBy(asc(phenomenonImages.sortOrder));

  const sightingImageRows = await db
    .select({
      phenomenonId: sightings.phenomenonId,
      imageUrl: sightingImages.imageUrl,
      seenAt: sightings.seenAt,
      sortOrder: sightingImages.sortOrder,
    })
    .from(sightingImages)
    .innerJoin(sightings, eq(sightings.id, sightingImages.sightingId))
    .where(inArray(sightings.phenomenonId, ids))
    .orderBy(desc(sightings.seenAt), asc(sightingImages.sortOrder));

  const phenomenonUrlsById = new Map<string, string[]>();
  for (const row of phenomenonImageRows) {
    const list = phenomenonUrlsById.get(row.phenomenonId) ?? [];
    list.push(row.imageUrl);
    phenomenonUrlsById.set(row.phenomenonId, list);
  }

  const sightingUrlsById = new Map<string, string[]>();
  for (const row of sightingImageRows) {
    const list = sightingUrlsById.get(row.phenomenonId) ?? [];
    list.push(row.imageUrl);
    sightingUrlsById.set(row.phenomenonId, list);
  }

  return items.map((item) => {
    const phenomenonUrls = phenomenonUrlsById.get(item.id) ?? [];
    const baseUrls = phenomenonUrls.length
      ? phenomenonUrls
      : item.imageUrl
        ? [item.imageUrl]
        : [];
    const sightingUrls = sightingUrlsById.get(item.id) ?? [];
    return {
      ...item,
      imageUrls: mergeUniqueImageUrls(baseUrls, sightingUrls),
    };
  });
}

export async function getPhenomenonDetail(id: string): Promise<PhenomenonDetail | null> {
  const rows = await listPhenomenaWithStats([eq(phenomena.id, id)]);
  const base = rows[0];
  if (!base) return null;

  const sightingRows = await db
    .select({
      id: sightings.id,
      phenomenonId: sightings.phenomenonId,
      userId: sightings.userId,
      observerName: sql<string | null>`coalesce(${users.displayName}, ${sightings.observerName})`,
      observerAvatarUrl: users.avatarUrl,
      seenAt: sightings.seenAt,
      condition: sightings.condition,
      note: sightings.note,
    })
    .from(sightings)
    .leftJoin(users, eq(users.id, sightings.userId))
    .where(eq(sightings.phenomenonId, id))
    .orderBy(desc(sightings.seenAt))
    .limit(12);

  const sightingIds = sightingRows.map((s) => s.id);
  const imageRows = sightingIds.length
    ? await db
        .select({
          sightingId: sightingImages.sightingId,
          imageUrl: sightingImages.imageUrl,
          imageAlt: sightingImages.imageAlt,
          sortOrder: sightingImages.sortOrder,
        })
        .from(sightingImages)
        .where(inArray(sightingImages.sightingId, sightingIds))
        .orderBy(asc(sightingImages.sortOrder))
    : [];

  const imagesBySighting = new Map<string, { imageUrl: string; imageAlt: string | null }[]>();
  for (const image of imageRows) {
    const list = imagesBySighting.get(image.sightingId) ?? [];
    list.push({ imageUrl: image.imageUrl, imageAlt: image.imageAlt });
    imagesBySighting.set(image.sightingId, list);
  }

  const recentSightings: SightingWithImages[] = sightingRows.map((sighting) => ({
    id: sighting.id,
    phenomenonId: sighting.phenomenonId,
    userId: sighting.userId,
    observerName: sighting.observerName,
    observerAvatarUrl: sighting.observerAvatarUrl ?? null,
    seenAt: sighting.seenAt,
    condition: sighting.condition,
    note: sighting.note,
    images: imagesBySighting.get(sighting.id) ?? [],
  }));

  const observerSource = await db
    .select({
      userId: sightings.userId,
      name: sql<string>`coalesce(${users.displayName}, ${sightings.observerName})`,
      avatarUrl: users.avatarUrl,
      seenAt: sightings.seenAt,
    })
    .from(sightings)
    .leftJoin(users, eq(users.id, sightings.userId))
    .where(eq(sightings.phenomenonId, id))
    .orderBy(desc(sightings.seenAt));

  const seenObservers = new Set<string>();
  const observers: { userId: string | null; name: string; avatarUrl: string | null }[] = [];
  for (const row of observerSource) {
    if (!row.name) continue;
    const key = row.userId ?? row.name;
    if (seenObservers.has(key)) continue;
    seenObservers.add(key);
    observers.push({
      userId: row.userId,
      name: row.name,
      avatarUrl: row.avatarUrl ?? null,
    });
    if (observers.length >= 8) break;
  }

  if (!observers.length && base.observerName) {
    observers.push({ userId: base.userId, name: base.observerName, avatarUrl: null });
  }

  const phenomenonImageRows = await db
    .select({
      imageUrl: phenomenonImages.imageUrl,
      sortOrder: phenomenonImages.sortOrder,
    })
    .from(phenomenonImages)
    .where(eq(phenomenonImages.phenomenonId, id))
    .orderBy(asc(phenomenonImages.sortOrder));

  const imageUrls = phenomenonImageRows.length
    ? phenomenonImageRows.map((row) => row.imageUrl)
    : base.imageUrl
      ? [base.imageUrl]
      : [];

  const sightingImageUrls = imageRows.map((row) => row.imageUrl);

  return {
    ...base,
    imageUrls: mergeUniqueImageUrls(imageUrls, sightingImageUrls),
    recentSightings,
    observers,
  };
}
