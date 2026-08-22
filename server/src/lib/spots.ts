import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sightings, spots, type SpotKind } from '../db/schema.js';

export type SpotListRow = {
  id: string;
  phenomenonId: string;
  name: string;
  locationDetail: string | null;
  kind: SpotKind;
  lat: number | null;
  lng: number | null;
  findingHint: string | null;
  sortOrder: number;
};

export type SpotWithStats = SpotListRow & {
  label: string;
  sightingCount: number;
  lastSeenAt: Date | null;
  latestCondition: string | null;
};

export function parseLocationParts(location: string | null | undefined): {
  name: string;
  locationDetail: string | null;
} {
  const raw = location?.trim();
  if (!raw) return { name: '主要地點', locationDetail: null };

  const sep = raw.includes('·') ? '·' : raw.includes('｜') ? '｜' : null;
  if (!sep) return { name: raw, locationDetail: null };

  const parts = raw.split(sep).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return { name: raw, locationDetail: null };

  return {
    name: parts[0],
    locationDetail: parts.length > 1 ? parts.slice(1).join(` ${sep.trim()} `) : null,
  };
}

const SUMMARY_NAME_MAX = 10;
const SUMMARY_JOIN_MAX = 18;

export function compactSpotName(name: string, maxLen = SUMMARY_NAME_MAX): string {
  const raw = name.trim();
  if (!raw) return '地點';
  if (raw.length <= maxLen) return raw;

  const segments = raw.split(/[,，]/).map((part) => part.trim()).filter(Boolean);
  const namedSegments = segments.filter((part) => !/^\d/.test(part));
  let candidate = namedSegments[0] || segments[0] || raw;

  if (segments.length > 1 && /^\d/.test(segments[0]) && namedSegments.length) {
    candidate = namedSegments.find((part) => /(?:新村|部落|里)$/.test(part))
      || namedSegments[namedSegments.length - 1]
      || namedSegments[0];
  } else {
    const placeKeyword = namedSegments.find((part) => /(?:潭|公園|市場|濕地|博物館|美術館|塔)/.test(part));
    if (placeKeyword) candidate = placeKeyword;
  }

  const landmarkMatch = candidate.match(/^(.+?)(?:環|旁|附近|一帶|自行車道|步道|水岸|入口)/);
  if (landmarkMatch?.[1] && landmarkMatch[1].trim().length >= 2) {
    candidate = landmarkMatch[1].trim();
  }

  if (candidate.length <= maxLen) return candidate;
  return `${candidate.slice(0, Math.max(1, maxLen - 1))}…`;
}

function displaySpotName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '地點';
  if (/[,，]/.test(trimmed) || trimmed.length > SUMMARY_NAME_MAX) {
    return compactSpotName(trimmed);
  }
  return trimmed;
}

export function normalizeSpotName(name: string): string {
  return displaySpotName(name);
}

function summarySpotLabel(spot: {
  name: string;
  locationDetail?: string | null;
  kind?: SpotKind;
}): string {
  return formatSpotLabel(spot);
}

export function formatSpotLabel(spot: {
  name: string;
  locationDetail?: string | null;
  kind?: SpotKind;
}): string {
  if (spot.kind === 'area') return `${displaySpotName(spot.name)}一帶`;
  const name = displaySpotName(spot.name);
  if (spot.locationDetail) {
    const detail = displaySpotName(spot.locationDetail);
    if (detail !== name) return `${name} · ${detail}`;
  }
  return name;
}

export function buildLocationSummary(
  spotList: Array<{ name: string; locationDetail?: string | null; kind?: SpotKind }>,
): string {
  if (!spotList.length) return '';

  if (spotList.length === 1) {
    return summarySpotLabel(spotList[0]);
  }

  const shortNames = spotList.map((spot) => compactSpotName(spot.name));
  const count = spotList.length;

  if (count === 2) {
    const joined = shortNames.slice(0, 2).join('、');
    if (joined.length <= SUMMARY_JOIN_MAX) return `${joined}等 2 個地方`;
    return `${shortNames[0]}等 2 個地方`;
  }

  const joined = shortNames.slice(0, 2).join('、');
  if (joined.length <= SUMMARY_JOIN_MAX) return `${joined}等 ${count} 個地方`;
  return `${shortNames[0]}等 ${count} 個地方`;
}

export async function listSpotsGroupedByPhenomenon(
  phenomenonIds: string[],
): Promise<Map<string, SpotListRow[]>> {
  const grouped = new Map<string, SpotListRow[]>();
  if (!phenomenonIds.length) return grouped;

  const rows = await db
    .select({
      id: spots.id,
      phenomenonId: spots.phenomenonId,
      name: spots.name,
      locationDetail: spots.locationDetail,
      kind: spots.kind,
      lat: spots.lat,
      lng: spots.lng,
      findingHint: spots.findingHint,
      sortOrder: spots.sortOrder,
    })
    .from(spots)
    .where(inArray(spots.phenomenonId, phenomenonIds))
    .orderBy(asc(spots.sortOrder), asc(spots.name));

  for (const row of rows) {
    const list = grouped.get(row.phenomenonId) ?? [];
    list.push(row);
    grouped.set(row.phenomenonId, list);
  }

  return grouped;
}

export async function attachLocationSummaries<
  T extends { id: string; location: string | null },
>(items: T[]): Promise<(T & { locationSummary: string; spotCount: number })[]> {
  if (!items.length) return [];

  try {
    const grouped = await listSpotsGroupedByPhenomenon(items.map((item) => item.id));

    return items.map((item) => {
      const spotList = grouped.get(item.id) ?? [];
      const locationSummary = buildLocationSummary(spotList) || item.location || '';
      return {
        ...item,
        locationSummary,
        spotCount: spotList.length,
      };
    });
  } catch (err) {
    console.error('[spots] attachLocationSummaries failed; falling back to phenomenon.location', err);
    return items.map((item) => ({
      ...item,
      locationSummary: item.location || '',
      spotCount: 0,
    }));
  }
}

async function loadSpotStats(spotIds: string[]) {
  const statsBySpot = new Map<string, { sightingCount: number; lastSeenAt: Date | null }>();
  const conditionBySpot = new Map<string, string | null>();
  if (!spotIds.length) return { statsBySpot, conditionBySpot };

  const statsRows = await db
    .select({
      spotId: sightings.spotId,
      sightingCount: sql<number>`count(*)::int`,
      lastSeenAt: sql<Date | null>`max(${sightings.seenAt})`,
    })
    .from(sightings)
    .where(inArray(sightings.spotId, spotIds))
    .groupBy(sightings.spotId);

  for (const row of statsRows) {
    statsBySpot.set(row.spotId, {
      sightingCount: row.sightingCount,
      lastSeenAt: row.lastSeenAt,
    });
  }

  const latestRows = await db
    .selectDistinctOn([sightings.spotId], {
      spotId: sightings.spotId,
      condition: sightings.condition,
    })
    .from(sightings)
    .where(inArray(sightings.spotId, spotIds))
    .orderBy(sightings.spotId, desc(sightings.seenAt));

  for (const row of latestRows) {
    conditionBySpot.set(row.spotId, row.condition);
  }

  return { statsBySpot, conditionBySpot };
}

export async function listSpotsWithStats(phenomenonId: string): Promise<SpotWithStats[]> {
  try {
    return await loadSpotsWithStats(phenomenonId);
  } catch (err) {
    console.error('[spots] listSpotsWithStats failed', err);
    return [];
  }
}

async function loadSpotsWithStats(phenomenonId: string): Promise<SpotWithStats[]> {
  const spotRows = (await listSpotsGroupedByPhenomenon([phenomenonId])).get(phenomenonId) ?? [];
  if (!spotRows.length) return [];

  const spotIds = spotRows.map((spot) => spot.id);
  const { statsBySpot, conditionBySpot } = await loadSpotStats(spotIds);

  return spotRows.map((spot) => {
    const stats = statsBySpot.get(spot.id) ?? { sightingCount: 0, lastSeenAt: null };
    return {
      ...spot,
      label: formatSpotLabel(spot),
      sightingCount: stats.sightingCount,
      lastSeenAt: stats.lastSeenAt,
      latestCondition: conditionBySpot.get(spot.id) ?? null,
    };
  }).filter((spot) => spot.sightingCount > 0);
}

export async function createPrimarySpotForPhenomenon(
  phenomenonId: string,
  opts: {
    location?: string | null;
    lat?: number | null;
    lng?: number | null;
    findingHint?: string | null;
    kind?: SpotKind;
  },
) {
  const { name, locationDetail } = parseLocationParts(opts.location);
  const [spot] = await db
    .insert(spots)
    .values({
      phenomenonId,
      name,
      locationDetail,
      kind: opts.kind ?? 'fixed',
      lat: opts.lat ?? null,
      lng: opts.lng ?? null,
      findingHint: opts.findingHint ?? null,
      sortOrder: 0,
    })
    .returning({ id: spots.id });

  return spot;
}

async function nextSpotSortOrder(phenomenonId: string) {
  const [row] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${spots.sortOrder}), -1)::int` })
    .from(spots)
    .where(eq(spots.phenomenonId, phenomenonId));
  return (row?.maxOrder ?? -1) + 1;
}

export async function getPrimarySpotId(phenomenonId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: spots.id })
    .from(spots)
    .where(eq(spots.phenomenonId, phenomenonId))
    .orderBy(asc(spots.sortOrder))
    .limit(1);

  return row?.id ?? null;
}

export async function requirePrimarySpotId(phenomenonId: string): Promise<string> {
  const spotId = await getPrimarySpotId(phenomenonId);
  if (!spotId) {
    throw new Error(`No spot found for phenomenon ${phenomenonId}`);
  }
  return spotId;
}

export async function resolveSightingSpotId(
  phenomenonId: string,
  opts: {
    spotId?: string;
    otherSpot?: {
      name: string;
      locationDetail?: string | null;
      lat?: number | null;
      lng?: number | null;
      kind?: SpotKind;
    };
  },
): Promise<string> {
  if (opts.otherSpot?.name?.trim()) {
    const [spot] = await db
      .insert(spots)
      .values({
        phenomenonId,
        name: normalizeSpotName(opts.otherSpot.name),
        locationDetail: opts.otherSpot.locationDetail?.trim() || null,
        kind: opts.otherSpot.kind ?? 'fixed',
        lat: opts.otherSpot.lat ?? null,
        lng: opts.otherSpot.lng ?? null,
        sortOrder: await nextSpotSortOrder(phenomenonId),
      })
      .returning({ id: spots.id });
    return spot.id;
  }

  if (opts.spotId) {
    const [row] = await db
      .select({ id: spots.id })
      .from(spots)
      .where(and(eq(spots.id, opts.spotId), eq(spots.phenomenonId, phenomenonId)))
      .limit(1);
    if (!row) {
      throw new Error('Invalid spot for phenomenon');
    }
    return row.id;
  }

  return requirePrimarySpotId(phenomenonId);
}
