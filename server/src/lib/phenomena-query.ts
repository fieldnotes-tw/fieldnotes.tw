import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  phenomena,
  sightingImages,
  sightings,
  users,
  type Phenomenon,
} from '../db/schema.js';

export type PhenomenonListItem = Phenomenon & {
  sightingCount: number;
  observerCount: number;
  lastSeenAt: Date | null;
};

export type SightingWithImages = {
  id: string;
  phenomenonId: string;
  observerName: string | null;
  seenAt: Date;
  condition: string | null;
  note: string | null;
  images: { imageUrl: string; imageAlt: string | null }[];
};

export type PhenomenonDetail = PhenomenonListItem & {
  recentSightings: SightingWithImages[];
  observers: { name: string }[];
};

function mapListRow(row: {
  id: string;
  status: Phenomenon['status'];
  category: Phenomenon['category'];
  title: string;
  description: string;
  location: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  imageUrl: string | null;
  imageAlt: string | null;
  observerName: string | null;
  metaLabel: string | null;
  lastNoticedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sightingCount: number;
  observerCount: number;
  lastSeenAt: Date | null;
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
    lat: row.lat,
    lng: row.lng,
    imageUrl: row.imageUrl,
    imageAlt: row.imageAlt,
    observerName: row.observerName,
    metaLabel: row.metaLabel,
    lastNoticedAt: row.lastNoticedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sightingCount: row.sightingCount,
    observerCount,
    lastSeenAt: row.lastSeenAt ?? row.lastNoticedAt,
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
      lat: phenomena.lat,
      lng: phenomena.lng,
      imageUrl: phenomena.imageUrl,
      imageAlt: phenomena.imageAlt,
      observerName: phenomena.observerName,
      metaLabel: phenomena.metaLabel,
      lastNoticedAt: phenomena.lastNoticedAt,
      createdAt: phenomena.createdAt,
      updatedAt: phenomena.updatedAt,
      sightingCount: sql<number>`coalesce(count(distinct ${sightings.id}), 0)::int`,
      observerCount: sql<number>`coalesce(count(distinct coalesce(${sightings.userId}::text, ${sightings.observerName})), 0)::int`,
      lastSeenAt: sql<Date | null>`max(${sightings.seenAt})`,
    })
    .from(phenomena)
    .leftJoin(sightings, eq(sightings.phenomenonId, phenomena.id))
    .where(filters.length ? and(...filters) : undefined)
    .groupBy(phenomena.id)
    .orderBy(
      desc(sql`coalesce(max(${sightings.seenAt}), ${phenomena.lastNoticedAt})`),
      asc(phenomena.title),
    );

  return rows.map(mapListRow);
}

export async function getPhenomenonDetail(id: string): Promise<PhenomenonDetail | null> {
  const rows = await listPhenomenaWithStats([eq(phenomena.id, id)]);
  const base = rows[0];
  if (!base) return null;

  const sightingRows = await db
    .select({
      id: sightings.id,
      phenomenonId: sightings.phenomenonId,
      observerName: sql<string | null>`coalesce(${users.displayName}, ${sightings.observerName})`,
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
    observerName: sighting.observerName,
    seenAt: sighting.seenAt,
    condition: sighting.condition,
    note: sighting.note,
    images: imagesBySighting.get(sighting.id) ?? [],
  }));

  const observerRows = await db
    .select({
      name: sql<string>`coalesce(${users.displayName}, ${sightings.observerName})`,
    })
    .from(sightings)
    .leftJoin(users, eq(users.id, sightings.userId))
    .where(eq(sightings.phenomenonId, id))
    .groupBy(sql`coalesce(${users.displayName}, ${sightings.observerName})`)
    .orderBy(desc(sql`max(${sightings.seenAt})`))
    .limit(8);

  const observers = observerRows
    .map((row) => row.name)
    .filter((name): name is string => Boolean(name))
    .map((name) => ({ name }));

  if (!observers.length && base.observerName) {
    observers.push({ name: base.observerName });
  }

  return {
    ...base,
    recentSightings,
    observers,
  };
}
