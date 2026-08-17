import {
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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

export const USER_ROLES = ['user', 'admin'] as const;

export const phenomenonCategoryEnum = pgEnum(
  'phenomenon_category',
  PHENOMENON_CATEGORIES,
);

export const phenomenonStatusEnum = pgEnum(
  'phenomenon_status',
  PHENOMENON_STATUSES,
);

export const userRoleEnum = pgEnum('user_role', USER_ROLES);

export const SIGHTING_CONDITIONS = [
  'abundant',
  'fewer',
  'gone',
  'unsure',
] as const;

export const sightingConditionEnum = pgEnum(
  'sighting_condition',
  SIGHTING_CONDITIONS,
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

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name'),
    role: userRoleEnum('role').notNull().default('user'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    emailConfirmTokenHash: text('email_confirm_token_hash'),
    emailConfirmExpiresAt: timestamp('email_confirm_expires_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('users_email_uidx').on(table.email)],
);

export const sightings = pgTable('sightings', {
  id: uuid('id').defaultRandom().primaryKey(),
  phenomenonId: uuid('phenomenon_id')
    .notNull()
    .references(() => phenomena.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  observerName: text('observer_name'),
  seenAt: timestamp('seen_at', { withTimezone: true }).notNull(),
  condition: sightingConditionEnum('condition'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sightingImages = pgTable('sighting_images', {
  id: uuid('id').defaultRandom().primaryKey(),
  sightingId: uuid('sighting_id')
    .notNull()
    .references(() => sightings.id, { onDelete: 'cascade' }),
  imageUrl: text('image_url').notNull(),
  imageAlt: text('image_alt'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export type Phenomenon = typeof phenomena.$inferSelect;
export type NewPhenomenon = typeof phenomena.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = (typeof USER_ROLES)[number];
export type Sighting = typeof sightings.$inferSelect;
export type NewSighting = typeof sightings.$inferInsert;
export type SightingImage = typeof sightingImages.$inferSelect;
export type SightingCondition = (typeof SIGHTING_CONDITIONS)[number];
