import {
  doublePrecision,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const PHENOMENON_CATEGORIES = [
  'animal',
  'plant',
  'sky',
  'taste',
  'workshop',
] as const;

export const PHENOMENON_STATUSES = [
  'active',
  'upcoming',
  'ending',
  'ended',
] as const;

export const phenomenonCategoryEnum = pgEnum(
  'phenomenon_category',
  PHENOMENON_CATEGORIES,
);

export const phenomenonStatusEnum = pgEnum(
  'phenomenon_status',
  PHENOMENON_STATUSES,
);

export const phenomena = pgTable('phenomena', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: phenomenonStatusEnum('status').notNull().default('active'),
  category: phenomenonCategoryEnum('category').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  location: text('location'),
  notes: text('notes'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  imageUrl: text('image_url'),
  imageAlt: text('image_alt'),
  observerName: text('observer_name'),
  metaLabel: text('meta_label'),
  lastNoticedAt: timestamp('last_noticed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Phenomenon = typeof phenomena.$inferSelect;
export type NewPhenomenon = typeof phenomena.$inferInsert;
