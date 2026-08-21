import { z } from 'zod';
import {
  PHENOMENON_CATEGORIES,
  PHENOMENON_STATUSES,
} from '../db/schema.js';

export const categorySchema = z.enum(PHENOMENON_CATEGORIES);
export const statusSchema = z.enum(PHENOMENON_STATUSES);
export const uuidSchema = z.string().uuid();
export const PHENOMENON_SUMMARY_MAX = 120;

export const createPhenomenonSchema = z.object({
  status: statusSchema.optional(),
  category: categorySchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(PHENOMENON_SUMMARY_MAX),
  location: z.string().trim().max(300).optional(),
  notes: z.string().trim().optional(),
  findingHint: z.string().trim().max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  imageUrl: z.string().trim().max(1000).optional(),
  imageAlt: z.string().trim().max(500).optional(),
  observerName: z.string().trim().max(100).optional(),
  metaLabel: z.string().trim().max(200).optional(),
  lastNoticedAt: z.coerce.date().optional(),
});

export const updatePhenomenonSchema = createPhenomenonSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'errors.atLeastOneField' },
);

export const submissionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(PHENOMENON_SUMMARY_MAX),
  extra: z.string().trim().optional(),
  findingHint: z.string().trim().max(500).optional(),
  status: statusSchema,
  statusLabel: z.string().trim().max(100).optional(),
  category: categorySchema.optional(),
  location: z.string().trim().max(300).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  seenAt: z.coerce.date().optional(),
  imageUrls: z.array(z.string().trim().max(1000)).max(12).optional(),
});

export const ownerPhenomenonPatchSchema = createPhenomenonSchema
  .partial()
  .extend({
    imageUrls: z.array(z.string().trim().max(1000)).max(12).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'errors.atLeastOneField',
  });

export const createSightingSchema = z.object({
  seenAt: z.coerce.date().optional(),
  note: z.string().trim().min(1).max(2000),
  imageUrls: z.array(z.string().trim().max(1000)).max(8).optional(),
  spotId: z.string().uuid().optional(),
  otherSpot: z.object({
    name: z.string().trim().min(1).max(200),
    locationDetail: z.string().trim().max(300).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  }).optional(),
}).refine((value) => !(value.spotId && value.otherSpot), {
  message: 'errors.invalidRequest',
});

export const updateSightingSchema = z.object({
  seenAt: z.coerce.date().optional(),
  note: z.string().trim().min(1).max(2000).optional(),
  imageUrls: z.array(z.string().trim().max(1000)).max(8).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'errors.atLeastOneField',
});

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  bio: z.string().trim().max(500).optional(),
  avatarUrl: z.string().trim().max(1000).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'errors.atLeastOneField',
});
